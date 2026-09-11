//! Additional species with distinct crown, shoot and foliage architectures.
//! Each axis has an immutable mature centerline and a seeded bud-break clock.
//! Time reveals its prefix: existing branch attachments never move or rescale.
use crate::{
    engine::{Branch, Geometry, Organ, unit_rotation},
    model::Plant,
    sweep::{Ring, Surface},
};
use glam::{DMat3, DQuat, DVec3};
use std::f64::consts::{PI, TAU};

pub fn supports(name: &str) -> bool { matches!(name, "oak" | "willow" | "spruce" | "ginkgo") }

struct Random(u64);
impl Random {
    fn new(id: u64) -> Self { Self(id) }
    fn unit(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        ((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64
    }
    fn signed(&mut self) -> f64 { self.unit() * 2. - 1. }
}
fn id(parent: u64, slot: usize) -> u64 {
    parent.wrapping_mul(6364136223846793005).wrapping_add(slot as u64 + 1442695040888963407)
}
fn mix(a: f64, b: f64, t: f64) -> f64 { a + (b - a) * t }
fn heading(azimuth: f64, rise: f64) -> DVec3 {
    DVec3::new(azimuth.cos(), rise, azimuth.sin()).normalize()
}
fn sample(rings: &[Ring], t: f64) -> (DVec3, DVec3, f64) {
    let u = t.clamp(0., 0.999999) * (rings.len() - 1) as f64;
    let i = u.floor() as usize;
    let f = u - i as f64;
    (rings[i].center.lerp(rings[i + 1].center, f),
     (rings[i + 1].center - rings[i].center).normalize(),
     mix(rings[i].radius, rings[i + 1].radius, f))
}

#[derive(Clone, Copy)]
struct Axis {
    origin: DVec3,
    heading: DVec3,
    length: f64,
    radius: f64,
    order: u32,
    identity: u64,
    onset: f64,
    duration: f64,
}
impl Axis {
    fn progress(self, p: &Plant) -> f64 {
        if p.generations == 0 { return 0.; }
        if !p.growth_mode {
            return if p.generations as f64 > self.onset { 1. } else { 0. };
        }
        ((p.generations as f64 - self.onset) / self.duration).clamp(0., 1.)
    }
    fn radial(self, p: &Plant) -> f64 {
        if !p.growth_mode { return 1.; }
        let age = (p.generations as f64 - self.onset).max(0.);
        mix(0.18, 1., (age / (self.duration + 3.)).clamp(0., 1.).powf(0.7)) * crate::growth::juvenile_radial(p)
    }
}

fn centerline(a: Axis, p: &Plant) -> Vec<Ring> {
    let mut rng = Random::new(a.identity ^ 0x936ac);
    let phase = rng.unit() * TAU;
    let lateral = a.heading.cross(if a.heading.y.abs() < 0.9 { DVec3::Y } else { DVec3::Z }).normalize();
    let second = a.heading.cross(lateral).normalize();
    let rough = match p.growth_model.as_str() { "oak" => 0.11, "willow" => 0.055, "ginkgo" => 0.028, _ => 0.025 };
    let sag = if a.order == 0 { 0. } else {
        match p.growth_model.as_str() {
            "willow" => if a.order == 1 { 0.24 } else { mix(0.75, 1.22, rng.unit()) },
            "spruce" => if a.order == 1 { 0.19 } else { 0.26 },
            "oak" => 0.06,
            _ => 0.01,
        }
    };
    let bend = rough * p.branch_twist * a.length;
    let drift = rng.signed() * p.angle_variance.to_radians() * 0.16;
    let count = if a.order == 0 { 48 } else if a.order == 1 { 26 } else { 12 };
    (0..=count).map(|i| {
        let t = i as f64 / count as f64;
        let center = a.origin + a.heading * a.length * t
            + lateral * (bend * ((PI * t).sin() + 0.35 * ((3.7 * PI * t + phase).sin() - phase.sin()) * t))
            + second * (bend * 0.6 * (TAU * t).sin() + a.length * p.branch_twist * 0.014 * ((TAU * 2.1 * t + phase).sin() - phase.sin()) * t + drift * a.length * t * t + a.length * p.branch_twist * crate::growth::wander(t, phase))
            - DVec3::Y * (a.length * (sag + if a.order == 0 { 0. } else { p.gravity * 0.06 }) * t * t);
        let radius = a.radius * mix(1., if a.order == 0 { 0.06 } else { 0.045 }, t.powf(0.82))
            * (1. + 0.18 * (-20. * t).exp());
        Ring { center, radius: radius.max(0.00035) }
    }).collect()
}

fn children(a: Axis, rings: &[Ring], p: &Plant) -> Vec<Axis> {
    if a.order >= 4 { return vec![]; }
    let species = p.growth_model.as_str();
    let mut rng = Random::new(a.identity ^ 0x86d429);
    let count = if a.order == 0 {
        match species { "spruce" => 25, "ginkgo" => 15, "willow" => 8, _ => 7 }
    } else if a.order == 1 {
        match species { "spruce" => 9, "willow" => 11, "ginkgo" => 6, _ => 6 }
    } else if a.order == 2 {
        match species { "willow" => 4, "ginkgo" => 3, _ => 4 }
    } else { 2 };
    let phase = rng.unit() * TAU;
    let mut result = Vec::new();
    // Random gaps, aborted buds and different extension durations keep the crown
    // asymmetric without ever depending on how many generations are requested.
    let mut locations: Vec<f64> = (0..count).map(|i| {
        let lower = if a.order == 0 && species != "spruce" && species != "ginkgo" { 0.32 } else { 0.16 };
        mix(lower, 0.97, (i as f64 + mix(0.12, 0.88, rng.unit())) / count as f64)
    }).collect();
    locations.sort_by(f64::total_cmp);
    for (i, &t) in locations.iter().enumerate() {
        let identity = id(a.identity, i);
        let mut bud_rng = Random::new(identity);
        if a.order > 0 && bud_rng.unit() < if species == "oak" { 0.21 } else { 0.12 } { continue; }
        let (origin, tangent, parent_radius) = sample(rings, t);
        let azimuth = if a.order == 0 {
            phase + i as f64 * 2.3999632297 + bud_rng.signed() * 0.64
        } else {
            tangent.z.atan2(tangent.x) + if i % 2 == 0 { -1. } else { 1. }
                * p.angle.to_radians() * mix(0.65, 1.4, bud_rng.unit())
        };
        let rise = match species {
            "spruce" => if a.order == 0 { mix(0.08, 0.46, t) } else { mix(-0.16, 0.20, bud_rng.unit()) },
            "willow" => if a.order == 0 { mix(0.8, 1.7, bud_rng.unit()) } else { mix(-0.13, 0.42, bud_rng.unit()) },
            "ginkgo" => if a.order == 0 { mix(0.9, 1.9, t) } else { mix(0.65, 1.7, bud_rng.unit()) },
            _ => mix(0.18, 0.85, bud_rng.unit()),
        };
        let direction = if a.order == 0 { heading(azimuth, rise) }
            else { (heading(azimuth, rise) * 0.82 + tangent * 0.18).normalize() };
        let length = if a.order == 0 {
            a.length * match species {
                "spruce" => (1. - t).powf(0.85) * 0.58 + 0.018,
                "ginkgo" => (1. - t).powf(0.75) * 0.43 + 0.04,
                "willow" => mix(0.40, 0.69, bud_rng.unit()),
                _ => mix(0.38, 0.78, bud_rng.unit()) * (1. - t * 0.3),
            } * p.crown_spread
        } else {
            a.length * (p.scale * if species == "willow" && a.order == 1 { 0.9 } else { 0.67 }).clamp(0.08, 0.86)
                * mix(0.66, 1.26, bud_rng.unit()) * (1. - t * 0.30)
        };
        let radius = parent_radius * if a.order == 0 {
            if matches!(species, "oak" | "willow") { mix(0.50, 0.75, bud_rng.unit()) } else { 0.40 }
        } else { mix(0.32, 0.62, bud_rng.unit()) * (p.width_decay / 0.87).clamp(0.1, 1.14) };
        let duration = if a.order == 0 { mix(3.4, 6.5, bud_rng.unit()) } else { mix(1.35, 3.6, bud_rng.unit()) };
        // The parent must have reached this exact attachment point first.
        let onset = a.onset + a.duration * t + mix(0.18, if a.order == 0 { 1.1 } else { 2.0 }, bud_rng.unit());
        result.push(Axis { origin, heading: direction, length, radius: radius.max(0.0006),
            order: a.order + 1, identity, onset, duration });
    }
    result
}

fn visible_axis(rings: &[Ring], progress: f64, radial: f64) -> Vec<Ring> {
    crate::growth::clip_axis(rings, progress, radial)
}
fn record(g: &mut Geometry, surface: &mut Surface, rings: &[Ring], a: Axis) {
    let phase = (a.identity >> 11) as f64 / (1u64 << 53) as f64 * TAU;
    surface.axis(rings, if a.order == 0 { 14 } else if a.order == 1 { 9 } else { 6 }, phase, if a.order < 2 { 0.8 } else { 0.15 });
    let first = rings.first().unwrap();
    let last = rings.last().unwrap();
    g.branches.push(Branch { start: first.center.to_array(), end: last.center.to_array(),
        rotation: unit_rotation(DVec3::Y, (last.center - first.center).normalize()).to_array(),
        radius_bottom: first.radius, radius_top: last.radius });
}
fn foliage(a: Axis, rings: &[Ring], progress: f64, p: &Plant, g: &mut Geometry) {
    if p.leaf_size <= 0. || p.foliage_density <= 0. { return; }
    let species = p.growth_model.as_str();
    // Young leader leaves are shed when the bark-bearing axis matures.
    if a.order < 2 && p.generations as f64 > a.onset + a.duration + 3. { return; }
    if a.order <= 1 && progress < 0.99 {
        let (position, tangent, radius) = sample(rings, progress.min(0.999));
        g.leaves.push(Organ {
            position: position.to_array(), rotation: unit_rotation(DVec3::Y, tangent).to_array(),
            scale: p.leaf_size * (0.35 + progress * 0.4), thickness: radius * a.radial(p),
        });
    }
    let baseline = if species == "spruce" { 12. } else if species == "willow" { 22. } else { 14. };
    let count = (baseline * p.foliage_density * (a.length / p.max_length).clamp(0.25, 1.5)).round() as usize;
    for i in 0..count {
        let mut rng = Random::new(id(a.identity ^ 0xc63bf, i));
        let t = mix(if a.order < 2 { 0.70 } else { 0.08 }, 0.985, (i as f64 + mix(0.1, 0.9, rng.unit())) / count as f64);
        let leaf_onset = a.onset + a.duration * t + 0.12;
        let maturity = if p.growth_mode { ((p.generations as f64 - leaf_onset) / 0.7).clamp(0., 1.) } else { 1. };
        if t > progress || maturity == 0. { continue; }
        let (position, tangent, radius) = sample(rings, t);
        let around = i as f64 * 2.3999632297 + rng.signed() * 0.38;
        let rotation = if species == "spruce" {
            unit_rotation(DVec3::Y, tangent) * DQuat::from_rotation_y(around)
        } else {
            let side = tangent.cross(if tangent.y.abs() < 0.85 { DVec3::Y } else { DVec3::Z }).normalize();
            let outward = DQuat::from_axis_angle(tangent, around) * side;
            let y = (outward * 0.85 + tangent * 0.25 + DVec3::Y * if species == "willow" { -0.5 } else { 0.2 }).normalize();
            let x = y.cross(tangent).normalize();
            DQuat::from_mat3(&DMat3::from_cols(x, y, x.cross(y).normalize()))
        };
        let size = p.leaf_size * mix(0.70, 1.18, rng.unit()) * mix(0.12, 1., maturity);
        if species == "ginkgo" && a.order >= 2 {
            // Ginkgo short shoots carry small fan-leaf rosettes; the long shoots
            // keep separated leaves. Rosettes are explicit organs, not sprites.
            for leaf in 0..3 {
                g.leaves.push(Organ { position: position.to_array(),
                    rotation: (rotation * DQuat::from_rotation_y(leaf as f64 * 2.1)).to_array(),
                    scale: size, thickness: radius * a.radial(p) });
            }
        } else {
            g.leaves.push(Organ { position: position.to_array(), rotation: rotation.to_array(),
                scale: size, thickness: radius * a.radial(p) });
        }
    }
}

pub fn generate(p: &Plant) -> Result<(Vec<u8>, Geometry, u32), String> {
    p.validate()?;
    if !supports(&p.growth_model) { return Err("樹種が不正です。".into()); }
    let mut g = Geometry::default();
    let mut surface = Surface::default();
    let mut seed = Random::new(p.seed as u64);
    let height = p.max_length * match p.growth_model.as_str() {
        "spruce" => 10.4, "ginkgo" => 9.3, "willow" => 5.7, _ => 6.5,
    } * mix(0.9, 1.08, seed.unit());
    let trunk = Axis { origin: DVec3::ZERO,
        heading: DVec3::new(seed.signed() * 0.04, 1., seed.signed() * 0.04).normalize(),
        length: height, radius: p.max_thickness, order: 0, identity: id(p.seed as u64, 900),
        onset: 0., duration: mix(8.0, 10.5, seed.unit()) };
    let mut word = vec![trunk];
    let mut derived = format!("{}: persistent axes + independently waking buds; ", p.growth_model);
    while !word.is_empty() {
        let mut next = Vec::new();
        for a in word {
            let progress = a.progress(p);
            if progress <= 1e-6 { continue; }
            let rings = centerline(a, p);
            let visible = visible_axis(&rings, progress, a.radial(p));
            if visible.len() < 2 { continue; }
            record(&mut g, &mut surface, &visible, a);
            foliage(a, &rings, progress, p, &mut g);
            next.extend(children(a, &rings, p));
            if derived.len() < 850 { derived.push_str(&format!("B({},{:.2},{:.2}) ", a.order, a.onset, progress)); }
        }
        word = next;
    }
    if g.branches.len() > crate::engine::MAX_BRANCHES || g.leaves.len() > crate::engine::MAX_ORGANS {
        return Err("モデルが精密さの上限を超えました。密度を下げてください。".into());
    }
    surface.normals();
    g.surface = Some(surface);
    Ok((derived.into_bytes(), g, crate::growth::LIMIT))
}
