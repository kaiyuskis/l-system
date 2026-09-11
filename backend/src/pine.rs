//! A stochastic parametric L-system for mature, open-crowned pines.
//!
//! A bud carries order, length, radius, position and orientation. Each parallel
//! derivation replaces B with a curved woody axis and lateral/apical B modules.
//! The terminal production replaces buds with short shoots bearing paired needles.
//! This is independent of tessellation; changing mesh resolution cannot change
//! the skeleton, seed, attachment points or foliage distribution.
use crate::{
    engine::{Branch, Geometry, Organ, unit_rotation},
    model::Plant,
    sweep::{Ring, Surface},
};
use glam::{DQuat, DVec3};
use std::f64::consts::{PI, TAU};

#[derive(Clone, Copy)]
struct Bud {
    origin: DVec3,
    heading: DVec3,
    length: f64,
    radius: f64,
    order: u32,
    phase: f64,
    identity: u64,
    schedule: crate::growth::Schedule,
}
struct Random(u64);
impl Random {
    fn new(seed: u64) -> Self {
        Self(seed.wrapping_add(0x9e3779b97f4a7c15))
    }
    fn unit(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        ((z ^ (z >> 31)) >> 11) as f64 / ((1u64 << 53) as f64)
    }
    fn signed(&mut self) -> f64 {
        self.unit() * 2. - 1.
    }
}
fn child_id(parent: u64, index: usize) -> u64 {
    parent
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index as u64 + 1442695040888963407)
}
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn direction(azimuth: f64, rise: f64) -> DVec3 {
    DVec3::new(azimuth.cos(), rise, azimuth.sin()).normalize()
}

fn axis(bud: Bud, p: &Plant) -> Vec<Ring> {
    let trunk = bud.order == 0;
    let mut rng = Random::new(bud.identity);
    let heading = bud.heading.normalize();
    let lateral = heading
        .cross(if heading.y.abs() < 0.9 {
            DVec3::Y
        } else {
            DVec3::Z
        })
        .normalize();
    let side = heading.cross(lateral).normalize();
    let bend = 0.12 * p.branch_twist;
    let phase = bud.phase;
    let tilt = rng.signed() * 0.10 * p.branch_twist * (p.angle_variance / 14.).clamp(0., 3.);
    let bend_frequency = mix(0.9, 1.8, rng.unit());
    let kink_phase = rng.unit() * TAU;
    let sections = if trunk {
        64
    } else if bud.order == 1 {
        32
    } else {
        16
    };
    (0..=sections)
        .map(|i| {
            let t = i as f64 / sections as f64;
            let wandering = (t * PI * bend_frequency).sin() * bend
                + ((t * TAU * 1.7 + kink_phase).sin() - kink_phase.sin()) * 0.020 * p.branch_twist * t
                + ((t * TAU * 3. + kink_phase).sin() - kink_phase.sin())
                    * 0.026
                    * p.branch_twist
                    * t;
            let vertical = if trunk {
                0.
            } else {
                (0.08 - p.gravity * 0.13) * t * t - 0.035 * (PI * t).sin()
                    + ((t * TAU * 2. + phase).sin() - phase.sin()) * 0.022 * p.branch_twist * t
            };
            let center = bud.origin
                + heading * (bud.length * t)
                + lateral * (bud.length * wandering)
                + side
                    * (bud.length
                        * ((t * PI * 2.2).sin() * bend * if trunk { 0.32 } else { 0.06 }
                            + tilt * t + crate::growth::wander(t, kink_phase) * p.branch_twist))
                + DVec3::Y * (bud.length * vertical);
            let taper = if trunk {
                mix(1., 0.075, t.powf(0.85))
            } else {
                mix(1., 0.12, t.powf(0.92))
            };
            let collar = if trunk {
                1. + 0.65 * (-t * 24.).exp()
            } else {
                1. + 0.24 * (-t * 22.).exp()
            };
            Ring {
                center,
                radius: (bud.radius * taper * collar).max(0.0012),
            }
        })
        .collect()
}
fn sample(rings: &[Ring], t: f64) -> (DVec3, DVec3, f64) {
    let u = t.clamp(0., 0.9999) * (rings.len() - 1) as f64;
    let i = u.floor() as usize;
    let f = u - i as f64;
    (
        rings[i].center.lerp(rings[i + 1].center, f),
        (rings[i + 1].center - rings[i].center).normalize(),
        mix(rings[i].radius, rings[i + 1].radius, f),
    )
}
fn production(bud: Bud, rings: &[Ring], p: &Plant, max_order: u32) -> Vec<Bud> {
    if bud.order >= max_order {
        return vec![];
    }
    let mut rng = Random::new(bud.identity ^ 0x77da917);
    let mut children = vec![];
    if bud.order == 0 {
        // Alternating, uneven scaffolds create windows in the canopy. Their
        // envelope broadens low down and tapers gently to an irregular crown.
        let count = 11;
        for i in 0..count {
            let t = 0.30 + i as f64 * 0.060 + rng.signed() * 0.035;
            let (origin, _, radius) = sample(rings, t);
            let azimuth = bud.phase + i as f64 * 2.3999632297 + rng.signed() * 0.65;
            let reach = (0.51 * (1. - t).powf(0.48) + 0.055) * bud.length * p.crown_spread;
            let rise = mix(-0.08, 0.12, t * t) + rng.signed() * 0.10;
            children.push(Bud {
                origin,
                heading: direction(azimuth, rise),
                length: reach * mix(0.85, 1.12, rng.unit()),
                radius: radius * mix(0.62, 0.82, rng.unit()),
                order: 1,
                phase: azimuth,
                identity: child_id(bud.identity, i),
                schedule: crate::growth::Schedule::child(p, bud.schedule, t, child_id(bud.identity, i)),
            });
        }
        // Reiterated leaders fill an irregular dome without a bare central spike.
        for i in 0..4 {
            let t = 0.85 + i as f64 * 0.042 + rng.signed() * 0.015;
            let (origin, _, radius) = sample(rings, t);
            let azimuth = bud.phase + 1.3 + i as f64 * 2.4 + rng.signed() * 0.5;
            children.push(Bud {
                origin,
                heading: direction(azimuth, 0.07),
                length: bud.length * (0.29 - i as f64 * 0.025) * p.crown_spread,
                radius: radius * 0.85,
                order: 1,
                phase: azimuth,
                identity: child_id(bud.identity, 15 + i),
                schedule: crate::growth::Schedule::child(p, bud.schedule, t, child_id(bud.identity, 15 + i)),
            });
        }
    } else {
        let count = if bud.order == 1 { 6 } else { 3 };
        for i in 0..count {
            let t = 0.32 + (i as f64 / (count - 1) as f64) * 0.63 + rng.signed() * 0.045;
            let (origin, tangent, radius) = sample(rings, t);
            let side = if i % 2 == 0 { 1. } else { -1. };
            let parent_azimuth = tangent.z.atan2(tangent.x);
            let divergence =
                p.angle.to_radians().clamp(0.15, 1.6) * side * mix(0.7, 1.2, rng.unit());
            let azimuth = parent_azimuth + divergence;
            // Old scaffolds stay lateral; younger twig fans turn toward the light.
            let rise = if bud.order == 1 { 0.08 } else { 0.34 } + rng.signed() * 0.20;
            let shrink = (p.scale * 0.58).clamp(0.15, 0.61);
            children.push(Bud {
                origin,
                heading: direction(azimuth, rise),
                length: bud.length * shrink * mix(1.12, 0.58, t) * mix(0.8, 1.2, rng.unit()),
                radius: radius
                    * mix(0.5, 0.78, rng.unit())
                    * (p.width_decay / 0.8).clamp(0.3, 1.25),
                order: bud.order + 1,
                phase: azimuth,
                identity: child_id(bud.identity, i),
                schedule: crate::growth::Schedule::child(p, bud.schedule, t, child_id(bud.identity, i)),
            });
        }
        // Apical continuation retains a fan-shaped outer contour.
        let (origin, tangent, radius) = sample(rings, 0.99);
        children.push(Bud {
            origin,
            heading: (tangent * DVec3::new(1., 0.15, 1.) + DVec3::Y * 0.10).normalize(),
            length: bud.length * (p.scale * 0.38).clamp(0.12, 0.42),
            radius: radius * 1.1,
            order: bud.order + 1,
            phase: bud.phase + 0.8,
            identity: child_id(bud.identity, 8),
            schedule: crate::growth::Schedule::child(p, bud.schedule, 0.99, child_id(bud.identity, 8)),
        });
    }
    children
}
fn foliage(bud: Bud, rings: &[Ring], progress: f64, radial_scale: f64, p: &Plant, geometry: &mut Geometry) {
    if p.foliage_density == 0. || p.leaf_size == 0. {
        return;
    }
    let mut rng = Random::new(bud.identity ^ 0x83b794);
    let count = (3.5 * p.foliage_density * mix(0.8, 1.3, rng.unit())).round().max(1.) as usize;
    for i in 0..count {
        // Needles remain on the distal, young wood. Uneven fan-shaped tufts
        // leave the old scaffold visible instead of coating it in green dots.
        let t = mix(0.64, 0.995, (i as f64 + 0.3 + rng.unit() * 0.65) / count as f64);
        let (origin, tangent, width) = sample(rings, t);
        let spin = bud.phase + i as f64 * 2.3999632297 + rng.signed() * 0.5;
        let outward = direction(spin, mix(0.7, 1.6, rng.unit()));
        let heading = (tangent * 0.52 + outward * 0.42 + DVec3::Y * 0.32).normalize();
        let scale = p.leaf_size * mix(0.78, 1.2, rng.unit());
        if progress < t { continue; }
        geometry.leaves.push(Organ {
            position: origin.to_array(),
            rotation: (unit_rotation(DVec3::Y, heading) * DQuat::from_rotation_y(spin)).to_array(),
            scale,
            thickness: width * radial_scale,
        });
        if p.bud_size > 0. && i == count - 1 {
            geometry.buds.push(Organ {
                position: (origin + heading * scale * 0.16).to_array(),
                rotation: unit_rotation(DVec3::Y, heading).to_array(),
                scale: p.bud_size * 0.11,
                thickness: width * radial_scale,
            });
        }
    }
}

pub fn generate(p: &Plant) -> Result<(Vec<u8>, Geometry, u32), String> {
    p.validate()?;
    let mut geometry = Geometry::default();
    let mut surface = Surface::default();
    if p.generations > crate::growth::LIMIT {
        return Err("松の成長世代は0〜16で指定してください。".into());
    }
    if p.generations == 0 {
        geometry.surface = Some(surface);
        return Ok((b"B(0)".to_vec(), geometry, crate::growth::LIMIT));
    }
    let age = crate::growth::size(p);
    // The complete architecture is seed-stable. Growth reveals a prefix of
    // each path; stretching a parent no longer lifts all of its older branches.
    let height = p.max_length * 7.2 * age;
    let radius = p.max_thickness;
    let mut random = Random::new(p.seed as u64);
    let phase = random.unit() * TAU;
    let trunk = Bud {
        origin: DVec3::ZERO,
        heading: DVec3::new(0.12, 1., -0.035).normalize(),
        length: height,
        radius,
        order: 0,
        phase,
        identity: p.seed as u64,
        schedule: crate::growth::Schedule::trunk(p, p.seed as u64),
    };
    let max_order = if p.growth_mode { 5 } else { crate::growth::order(p) };
    let mut word = vec![trunk];
    let mut derivation = String::from(
        "Parametric pine: B(order,length,radius) -> C(curved axis)[B lateral]B apical; terminal B -> S(needle shoots)\n",
    );
    while !word.is_empty() {
        let mut next = vec![];
        for bud in word {
            let development = bud.schedule.progress(p);
            if development <= 0. { continue; }
            let mature_rings = axis(bud, p);
            let radial_scale = if p.growth_mode {
                let years = (p.generations as f64 - bud.schedule.onset).max(0.);
                (0.20 + years * 0.07).clamp(0.2, 1.) * crate::growth::juvenile_radial(p)
            } else { 1. };
            let rings = crate::growth::clip_axis(&mature_rings, development, radial_scale);
            if rings.len() < 2 { continue; }
            let children = if bud.order < max_order && (bud.order < 3 || Random::new(bud.identity).unit() > 0.40) {
                production(bud, &mature_rings, p, max_order)
            } else { vec![] };
            let sides = if bud.order == 0 {
                32
            } else if bud.order == 1 {
                16
            } else {
                8
            };
            surface.axis(
                &rings,
                sides,
                bud.phase,
                if bud.order < 2 { 1. } else { 0.4 },
            );
            // One branch record per woody axis; tessellation does not inflate metrics.
            geometry.branches.push(Branch {
                start: bud.origin.to_array(),
                end: rings.last().unwrap().center.to_array(),
                rotation: unit_rotation(DVec3::Y, bud.heading).to_array(),
                radius_bottom: bud.radius * radial_scale,
                radius_top: rings.last().unwrap().radius,
            });
            if derivation.len() < 900 {
                derivation.push_str(&format!(
                    "B({},{:.3},{:.4}) ",
                    bud.order, bud.length * development, bud.radius * radial_scale
                ));
            }
            if bud.order >= 1 || children.iter().all(|child| child.schedule.progress(p) == 0.) {
                foliage(bud, &mature_rings, development, radial_scale, p, &mut geometry);
            }
                // A growing candle already carries a small terminal needle fan.
                // Only this new tip advances; all established fascicles stay put.
                if bud.order < 3 && development < 0.95 && p.foliage_density > 0. && p.leaf_size > 0. {
                    let (origin, heading, thickness) = sample(&rings, 0.98);
                    geometry.leaves.push(Organ {
                        position: origin.to_array(),
                        rotation: (unit_rotation(DVec3::Y, heading) * DQuat::from_rotation_y(bud.phase)).to_array(),
                        scale: p.leaf_size * 0.8,
                        thickness,
                    });
                }
            // Keep some mature terminal buds dormant instead of splitting every tip.
            next.extend(children);
            if surface.position.len() / 3 > 1_500_000 || geometry.leaves.len() > 25_000 {
                return Err(
                    "松の形状が上限を超えました。世代または針葉密度を下げてください。".into(),
                );
            }
        }
        word = next;
    }
    // Root flare: woody, tapered roots partly buried in the ground plane.
    let root_radial = if p.growth_mode {
        (0.20 + (p.generations as f64 - trunk.schedule.onset).max(0.) * 0.07).clamp(0.2, 1.) * crate::growth::juvenile_radial(p)
    } else { 1. };
    for i in 0..6 {
        let azimuth = phase + i as f64 * TAU / 6.;
        let radial = direction(azimuth, 0.);
        let mut rings = vec![];
        for j in 0..=16 {
            let t = j as f64 / 16.;
            rings.push(Ring {
                center: radial * (radius * 4.2 * t)
                    - DVec3::Y * (radius * 0.1 * t),
                radius: radius * 0.48 * (1. - t).powf(1.3) + 0.002,
            });
        }
        let visible = crate::growth::clip_axis(&rings, (trunk.schedule.progress(p) * 2.4).min(1.), root_radial);
        if visible.len() >= 2 { surface.axis(&visible, 12, azimuth, 1.); }
    }
    surface.normals();
    geometry.surface = Some(surface);
    Ok((derivation.into_bytes(), geometry, crate::growth::LIMIT))
}
