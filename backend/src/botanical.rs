//! Species-aware parametric productions for woody broadleaf trees and ferns.
//! A module carries a seed, branch order and a complete local frame. Geometry
//! is a separate operation on the derived axes, shared with the pine model.
use crate::{
    engine::{Branch, Geometry, Organ, unit_rotation},
    growth::{Schedule, clip_axis},
    model::Plant,
    sweep::{Ring, Surface},
};
use glam::{DQuat, DVec3};
use std::f64::consts::{PI, TAU};

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
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn id(parent: u64, index: usize) -> u64 {
    parent
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index as u64 + 1442695040888963407)
}
fn direction(azimuth: f64, rise: f64) -> DVec3 {
    DVec3::new(azimuth.cos(), rise, azimuth.sin()).normalize()
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
fn record(
    g: &mut Geometry,
    surface: &mut Surface,
    rings: &[Ring],
    sides: usize,
    phase: f64,
    bark: f64,
) {
    surface.axis(rings, sides, phase, bark);
    let first = &rings[0];
    let last = rings.last().unwrap();
    g.branches.push(Branch {
        start: first.center.to_array(),
        end: last.center.to_array(),
        rotation: unit_rotation(DVec3::Y, (last.center - first.center).normalize()).to_array(),
        radius_bottom: first.radius,
        radius_top: last.radius,
    });
}
#[derive(Clone, Copy)]
struct Bud {
    origin: DVec3,
    heading: DVec3,
    length: f64,
    radius: f64,
    order: u32,
    identity: u64,
    schedule: Schedule,
}

fn woody_axis(b: Bud, p: &Plant) -> Vec<Ring> {
    let mut rng = Random::new(b.identity);
    let phase = rng.unit() * TAU;
    let lateral = b
        .heading
        .cross(if b.heading.y.abs() < 0.9 {
            DVec3::Y
        } else {
            DVec3::Z
        })
        .normalize();
    let second = b.heading.cross(lateral).normalize();
    let rough = if p.growth_model == "birch" {
        0.025
    } else {
        0.065
    };
    let drift = rng.signed() * p.angle_variance.to_radians() * 0.24;
    let sag = if b.order == 0 {
        0.
    } else if p.growth_model == "birch" && b.order >= 3 {
        0.24
    } else {
        0.10
    };
    let count = if b.order == 0 {
        48
    } else if b.order == 1 {
        32
    } else {
        16
    };
    (0..=count)
        .map(|i| {
            let t = i as f64 / count as f64;
            let bend = p.branch_twist * rough * b.length;
            let center = b.origin
                + b.heading * (b.length * t)
                + lateral
                    * (bend
                        * ((PI * t).sin()
                            + ((t * TAU * 2.3 + phase).sin() - phase.sin()) * 0.32 * t))
                + second * (bend * 0.55 * (TAU * t).sin() + bend * 0.24 * ((TAU * 1.8 * t + phase).sin() - phase.sin()) * t + drift * b.length * t * t + b.length * p.branch_twist * crate::growth::wander(t, phase))
                - DVec3::Y
                    * (b.length
                        * (sag + p.gravity * 0.065)
                        * t
                        * t
                        * if b.order == 0 { 0. } else { 1. });
            let taper = mix(
                1.,
                if b.order == 0 && p.growth_model != "birch" {
                    0.42
                } else {
                    0.08
                },
                t.powf(0.88),
            );
            let collar = 1. + (if b.order == 0 { 0.42 } else { 0.18 }) * (-t * 20.).exp();
            Ring {
                center,
                radius: (b.radius * taper * collar).max(0.0007),
            }
        })
        .collect()
}
fn replacements(b: Bud, rings: &[Ring], p: &Plant) -> Vec<Bud> {
    let birch = p.growth_model == "birch";
    let maple = p.growth_model == "maple";
    let mut rng = Random::new(b.identity ^ 0x7a5519);
    let mut children = vec![];
    if b.order == 0 {
        let count = if birch {
            12
        } else if maple {
            5
        } else {
            4
        };
        let phase = rng.unit() * TAU;
        for i in 0..count {
            let t = if birch {
                0.29 + i as f64 * 0.060
            } else {
                0.48 + i as f64 * 0.09
            } + rng.signed() * 0.025;
            let (origin, _, radius) = sample(rings, t);
            let azimuth = phase + i as f64 * 2.3999632297 + rng.signed() * 0.32;
            let length = if birch {
                b.length * (0.46 * (1. - t).powf(0.55) + 0.03)
            } else {
                (p.max_length * mix(3.6, 4.8, rng.unit())) * crate::growth::size(p)
            };
            let rise = if birch {
                mix(0.85, 1.55, t)
            } else if maple {
                mix(0.5, 1.0, rng.unit())
            } else {
                mix(0.75, 1.25, rng.unit())
            };
            children.push(Bud {
                origin,
                heading: direction(azimuth, rise),
                length: length * p.crown_spread,
                radius: radius
                    * if birch {
                        0.36
                    } else {
                        mix(0.55, 0.8, rng.unit())
                    },
                order: 1,
                identity: id(b.identity, i),
                schedule: Schedule::child(p, b.schedule, t, id(b.identity, i)),
            });
        }
        if birch {
            let (origin, _, radius) = sample(rings, 0.98);
            children.push(Bud {
                origin,
                heading: direction(phase, 1.8),
                length: (p.max_length * 0.85) * crate::growth::size(p),
                radius,
                order: 1,
                identity: id(b.identity, 20),
                schedule: Schedule::child(p, b.schedule, 0.98, id(b.identity, 20)),
            });
        } else {
            for leader in 0..2 {
                let (origin, _, radius) = sample(rings, 0.91 + leader as f64 * 0.075);
                children.push(Bud {
                    origin,
                    heading: direction(phase + leader as f64 * 2.4, 1.9),
                    length: (p.max_length * (3.6 + leader as f64 * 0.3)) * crate::growth::size(p),
                    radius: radius * 0.8,
                    order: 1,
                    identity: id(b.identity, 21 + leader),
                    schedule: Schedule::child(p, b.schedule, 0.91 + leader as f64 * 0.075, id(b.identity, 21 + leader)),
                });
            }
        }
    } else {
        let count = if b.order == 1 {
            5
        } else if b.order == 2 {
            4
        } else {
            2
        };
        for i in 0..count {
            let t = mix(0.28, 0.9, i as f64 / (count - 1) as f64) + rng.signed() * 0.035;
            let (origin, tangent, radius) = sample(rings, t);
            let parent = tangent.z.atan2(tangent.x);
            let side = if i % 2 == 0 { 1. } else { -1. };
            let azimuth = parent + side * p.angle.to_radians() * mix(0.8, 1.5, rng.unit());
            let rise = if birch {
                if b.order < 3 {
                    mix(0.3, 0.9, rng.unit())
                } else {
                    mix(-0.12, 0.45, rng.unit())
                }
            } else {
                mix(0.20, 0.80, rng.unit())
            };
            let heading = (direction(azimuth, rise) * 0.72 + tangent * 0.28).normalize();
            let shrink = (p.scale * 0.68).clamp(0.15, 0.72);
            children.push(Bud {
                origin,
                heading,
                length: b.length * shrink * mix(1.15, 0.63, t) * mix(0.85, 1.15, rng.unit()),
                radius: radius
                    * mix(0.5, 0.75, rng.unit())
                    * (p.width_decay / 0.82).clamp(0.25, 1.22),
                order: b.order + 1,
                identity: id(b.identity, i),
                schedule: Schedule::child(p, b.schedule, t, id(b.identity, i)),
            });
        }
        let (origin, tangent, radius) = sample(rings, 0.995);
        children.push(Bud {
            origin,
            heading: (tangent + DVec3::Y * if birch { -0.2 } else { 0.12 }).normalize(),
            length: b.length * (p.scale * 0.4).clamp(0.12, 0.45),
            radius,
            order: b.order + 1,
            identity: id(b.identity, 9),
            schedule: Schedule::child(p, b.schedule, 0.995, id(b.identity, 9)),
        });
    }
    children
}
fn woody_foliage(b: Bud, rings: &[Ring], progress: f64, radial_scale: f64, p: &Plant, g: &mut Geometry) {
    let cherry = p.growth_model == "sakura";
    let maple = p.growth_model == "maple";
    let count = ((if cherry { 9. } else { 14. })
        * p.foliage_density
        * if crate::growth::max_order(p) == 5 {
            0.45
        } else {
            1.
        })
    .round() as usize;
    for i in 0..count {
        let t = mix(0.22, 0.995, (i as f64 + 0.5) / count as f64);
        if t > progress { continue; }
        // Per-node random streams keep older leaves fixed as later nodes emerge.
        let mut rng = Random::new(id(b.identity ^ 0x38f991, i));
        let (origin, tangent, mature_width) = sample(rings, t);
        let width = mature_width * radial_scale;
        let azimuth = if maple {
            (i / 2) as f64 * PI / 2. + (i % 2) as f64 * PI
        } else {
            i as f64 * 2.3999632297
        };
        let radial = direction(azimuth, rng.signed() * 0.5);
        let heading = (radial * 0.75 + tangent * 0.25).normalize();
        if p.leaf_size > 0. && (!cherry || i % 3 == 0) {
            let rotation =
                unit_rotation(DVec3::Y, heading) * DQuat::from_rotation_y(rng.signed() * PI);
            g.leaves.push(Organ {
                position: origin.to_array(),
                rotation: rotation.to_array(),
                scale: p.leaf_size * mix(0.75, 1.2, rng.unit()),
                thickness: width,
            });
        }
        if cherry && p.flower_size > 0. {
            // A blossom module is a five-petal flower with a short stalk.
            for f in 0..3 {
                let flower_heading = (radial * 0.65
                    + DVec3::new(rng.signed() * 0.35, -0.45, rng.signed() * 0.35))
                .normalize();
                let flower_origin = origin + tangent * (f as f64 * 0.008);
                g.flowers.push(Organ {
                    position: flower_origin.to_array(),
                    rotation: (unit_rotation(DVec3::Y, flower_heading)
                        * DQuat::from_rotation_y(rng.unit() * TAU))
                    .to_array(),
                    scale: p.flower_size * mix(0.8, 1.2, rng.unit()),
                    thickness: width,
                });
            }
        }
    }
    // A small apical leaf makes a fresh shoot visible before its first mature
    // leaf node. Only this growing tip moves; existing nodes remain anchored.
    if count > 0 && progress < 0.30 && p.leaf_size > 0. {
        let (origin, tangent, width) = sample(rings, progress);
        g.leaves.push(Organ {
            position: origin.to_array(),
            rotation: unit_rotation(DVec3::Y, tangent).to_array(),
            scale: p.leaf_size * (0.15 + progress * 1.1),
            thickness: width * radial_scale,
        });
    }
    if p.bud_size > 0. && count > 0 {
        let (origin, tangent, width) = sample(rings, progress.min(0.995));
        g.buds.push(Organ {
            position: origin.to_array(),
            rotation: unit_rotation(DVec3::Y, tangent).to_array(),
            scale: p.bud_size * 0.12,
            thickness: width * radial_scale,
        });
    }
}
fn roots(p: &Plant, g: &mut Geometry, s: &mut Surface, progress: f64, radial_scale: f64) {
    let mut rng = Random::new(p.seed as u64);
    for i in 0..5 {
        let azimuth = i as f64 * TAU / 5. + rng.signed() * 0.2;
        let length = p.max_thickness * mix(2.3, 3.4, rng.unit());
        let rings = (0..=12)
            .map(|j| {
                let t = j as f64 / 12.;
                Ring {
                    center: direction(azimuth, 0.) * (length * t)
                        - DVec3::Y * (p.max_thickness * 0.20 * t),
                    radius: p.max_thickness * 0.35 * (1. - t).powf(1.4) + 0.001,
                }
            })
            .collect::<Vec<_>>();
        let visible = clip_axis(&rings, progress, radial_scale);
        if visible.len() >= 2 { record(g, s, &visible, 12, azimuth, 0.3); }
    }
}
pub fn generate(p: &Plant) -> Result<(Vec<u8>, Geometry, u32), String> {
    p.validate()?;
    if p.growth_model == "fern" {
        return fern(p);
    }
    if p.generations > crate::growth::LIMIT {
        return Err("樹種別の成長世代は0〜16で指定してください。".into());
    }
    let mut g = Geometry::default();
    let mut s = Surface::default();
    if p.generations == 0 {
        g.surface = Some(s);
        return Ok((b"B(0)".to_vec(), g, crate::growth::LIMIT));
    }
    let birch = p.growth_model == "birch";
    let age = if p.growth_mode {
        crate::growth::size(p)
    } else {
        1.
    };
    let height = p.max_length
        * (if birch {
            9.2
        } else if p.growth_model == "maple" {
            2.45
        } else {
            2.8
        })
        * age;
    let trunk = Bud {
        origin: DVec3::ZERO,
        heading: DVec3::new(if birch { 0.025 } else { 0.15 }, 1., 0.035).normalize(),
        length: height,
        radius: p.max_thickness * age.powf(1.4),
        order: 0,
        identity: p.seed as u64,
        schedule: Schedule::trunk(p, p.seed as u64),
    };
    let radial_maturity = if p.growth_mode { trunk.schedule.progress(p).powf(0.85) * crate::growth::juvenile_radial(p) } else { 1. };
    let mut word = vec![trunk];
    let mut derived = format!(
        "{}: B(order,length,radius) -> C(curved axis)[B lateral]B apical; terminal B -> leaf/flower modules\n",
        p.growth_model
    );
    while !word.is_empty() {
        let mut next = vec![];
        for b in word {
            let progress = b.schedule.progress(p);
            if progress <= 0. { continue; }
            // Replacements always sample the immutable mature axis. Extending
            // the parent can therefore never drag an existing daughter branch.
            let rings = woody_axis(b, p);
            let radial_scale = radial_maturity * if b.order == 0 { 1. } else { 0.22 + progress.sqrt() * 0.78 };
            let visible = clip_axis(&rings, progress, radial_scale);
            if visible.len() < 2 { continue; }
            record(
                &mut g,
                &mut s,
                &visible,
                if b.order == 0 {
                    32
                } else if b.order == 1 {
                    16
                } else {
                    8
                },
                b.identity as f64 * 0.001,
                if b.order < 2 { 0.4 } else { 0.15 },
            );
            if derived.len() < 850 {
                derived.push_str(&format!("B({},{:.2},{:.3}) ", b.order, b.length * progress, b.radius * radial_scale));
            }
            let terminal = b.order == crate::growth::max_order(p)
                || (b.order >= 3 && Random::new(b.identity).unit() < 0.15);
            let children = if terminal { vec![] } else { replacements(b, &rings, p) };
            let active_children = children.iter().any(|child| child.schedule.progress(p) > 0.);
            if terminal || b.order >= 3 || !active_children {
                woody_foliage(b, &rings, progress, radial_scale, p, &mut g);
            }
            next.extend(children);
            if s.position.len() / 3 > 1_500_000
                || g.leaves.len() + g.flowers.len() + g.buds.len() > 29_000
            {
                return Err(
                    "樹木が精密さの上限を超えました。世代または葉・花の密度を下げてください。"
                        .into(),
                );
            }
        }
        word = next;
    }
    let mut root_params = p.clone();
    root_params.max_thickness *= age.powf(1.4);
    roots(&root_params, &mut g, &mut s, (trunk.schedule.progress(p) * 2.4).min(1.), radial_maturity);
    s.normals();
    g.surface = Some(s);
    Ok((derived.into_bytes(), g, crate::growth::LIMIT))
}

fn fern(p: &Plant) -> Result<(Vec<u8>, Geometry, u32), String> {
    if p.generations > crate::growth::LIMIT {
        return Err("シダの成長世代は0〜16で指定してください。".into());
    }
    let mut g = Geometry::default();
    let mut s = Surface::default();
    if p.generations == 0 {
        g.surface = Some(s);
        return Ok((b"R(0)".to_vec(), g, crate::growth::LIMIT));
    }
    let count = if p.growth_mode { 18 } else { 2 + p.generations as usize };
    let maturity = if p.growth_mode {
        crate::growth::size(p)
    } else {
        1.
    };
    let length = p.max_length * 2.2 * maturity;
    for frond in 0..count {
        let identity = id(p.seed as u64, frond);
        let mut rng = Random::new(identity);
        let schedule = Schedule::new(
            if frond == 0 { -0.4 } else { frond as f64 * 0.69 - 0.4 + rng.unit() * 0.85 },
            2.8 + Random::new(identity ^ 0x117).unit() * 2.2,
            identity,
        );
        let unfolding = schedule.progress(p);
        if unfolding <= 0. { continue; }
        let phase = frond as f64 * 2.3999632297 + rng.signed() * 0.15;
        let radial = direction(phase, 0.);
        let across = radial.cross(DVec3::Y).normalize();
        let size = length * mix(0.75, 1.15, rng.unit());
        let reach = p.crown_spread * mix(0.52, 0.9, rng.unit());
        let tilt = rng.signed() * 0.035 * p.branch_twist * (p.angle_variance / 3.).clamp(0., 3.);
        let rings = (0..=48)
            .map(|i| {
                let t = i as f64 / 48.;
                Ring {
                    center: radial * (size * reach * t * t)
                        + DVec3::Y * (size * (1.20 * t - (0.63 + p.gravity * 0.20) * t * t))
                        + across * (size * tilt * (PI * t).sin()),
                    radius: (p.max_thickness * 0.1 * (1. - t) + 0.0006).max(0.0003),
                }
            })
            .collect::<Vec<_>>();
        let visible = clip_axis(&rings, unfolding, 0.35 + unfolding.sqrt() * 0.65);
        if visible.len() < 2 { continue; }
        record(&mut g, &mut s, &visible, 8, phase, 0.);
        let pinnae = if p.growth_mode { 20 } else { (4 + p.generations as usize).min(20) };
        for pair in 0..pinnae {
            let t = mix(0.24, 0.97, pair as f64 / (pinnae - 1) as f64);
            let (origin, tangent, _) = sample(&rings, t);
            let envelope = ((t - 0.15) / 0.85 * PI).sin().max(0.).powf(0.8) * (1. - t * 0.4);
            for side in [-1., 1.] {
                let pinna_identity = id(identity, pair * 2 + usize::from(side > 0.));
                let mut timing = Random::new(pinna_identity ^ 0x11ae);
                let pinna_schedule = Schedule::new(
                    schedule.time_at(t) + 0.08 + timing.unit() * 0.42,
                    0.8 + timing.unit() * 0.7,
                    pinna_identity,
                );
                let pinna_progress = pinna_schedule.progress(p);
                if pinna_progress <= 0. { continue; }
                let heading = (across * side * 0.85
                    + tangent * (p.angle.to_radians().cos() * 0.7 + 0.35))
                    .normalize();
                let extent = size * 0.29 * envelope * p.scale / 0.73;
                let pinna = (0..=12)
                    .map(|j| {
                        let u = j as f64 / 12.;
                        Ring {
                            center: origin
                                + heading * (extent * u)
                                + DVec3::Y * (extent * 0.12 * (PI * u).sin()),
                            radius: p.max_thickness
                                * 0.035
                                * (p.width_decay / 0.9).clamp(0.1, 1.2)
                                * (1. - u)
                                + 0.00025,
                        }
                    })
                    .collect::<Vec<_>>();
                let visible_pinna = clip_axis(&pinna, pinna_progress, 0.35 + pinna_progress.sqrt() * 0.65);
                if visible_pinna.len() < 2 { continue; }
                record(&mut g, &mut s, &visible_pinna, 6, phase, 0.);
                let leaflets = (mix(5., 11., envelope) * p.foliage_density).round() as usize;
                for k in 0..leaflets {
                    let u = mix(0.08, 0.97, (k as f64 + 0.5) / leaflets as f64);
                    if u > pinna_progress { continue; }
                    let (base, pinna_tangent, width) = sample(&pinna, u);
                    for margin in [-1., 1.] {
                        let leaf_heading =
                            (pinna_tangent * 0.25 + tangent * margin * 0.88).normalize();
                        let normal = pinna_tangent.cross(tangent).normalize();
                        let x = leaf_heading.cross(normal).normalize();
                        let z = x.cross(leaf_heading).normalize();
                        let rotation =
                            DQuat::from_mat3(&glam::DMat3::from_cols(x, leaf_heading, z));
                        if p.leaf_size > 0. {
                            g.leaves.push(Organ {
                                position: base.to_array(),
                                rotation: rotation.to_array(),
                                scale: p.leaf_size * mix(0.9, 0.35, u) * envelope.max(0.25) * size
                                    / length.max(0.001),
                                thickness: width,
                            });
                        }
                    }
                }
            }
        }
    }
    s.normals();
    g.surface = Some(s);
    Ok((
        b"R -> curved fronds; frond -> paired pinnae; pinna -> paired lobed pinnules".to_vec(),
        g,
        crate::growth::LIMIT,
    ))
}
