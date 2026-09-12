//! Deterministic bud clocks and extension along an immutable mature centerline.
//! Generations reveal new internodes; they never rescale already grown wood.
use crate::{model::Plant, sweep::Ring};

pub const LIMIT: u32 = 16;

/// Juvenile wood thickens more slowly than it extends. This changes only
/// radii, preserving all mature centerlines and established attachments.
pub fn juvenile_radial(p: &Plant) -> f64 {
    if !p.growth_mode { return 1.; }
    let age = (p.generations as f64 / 12.).clamp(0., 1.);
    0.02 + 0.98 * age.powf(1.5)
}

/// In the non-growing editing mode generations still select branching detail.
pub fn order(p: &Plant) -> u32 {
    [1, 2, 4, 6, 9, 13]
        .iter()
        .filter(|&&g| g as f64 <= p.generations)
        .count()
        .saturating_sub(1) as u32
}

pub fn max_order(p: &Plant) -> u32 {
    if p.growth_mode { 5 } else { order(p) }
}

/// Fixed mature envelope. Time belongs in Schedule, never in axis dimensions.
pub fn size(p: &Plant) -> f64 {
    if p.growth_mode { (LIMIT as f64 / 12.).powf(0.9) } else { 1. }
}

fn noise(identity: u64) -> f64 {
    let mut x = identity.wrapping_add(0x9e3779b97f4a7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    ((x ^ (x >> 31)) >> 11) as f64 / ((1u64 << 53) as f64)
}

/// Seeded strong and weak flushes. The positive baseline makes the clock
/// invertible, so daughter buds cannot precede their attachment nodes.
fn extension(phase: f64, identity: u64) -> f64 {
    let phase = phase.clamp(0., 1.);
    let mut distance = 0.;
    let mut total = 0.;
    for season in 0..8 {
        let rate = 0.35 + 1.7 * noise(identity.wrapping_add(season * 0x325ad9));
        let part = (phase * 8. - season as f64).clamp(0., 1.);
        distance += rate * (part * 0.30 + part * part * (3. - 2. * part) * 0.70);
        total += rate;
    }
    distance / total
}

#[derive(Clone, Copy, Debug)]
pub struct Schedule {
    pub onset: f64,
    pub duration: f64,
    identity: u64,
}

impl Schedule {
    pub fn new(onset: f64, duration: f64, identity: u64) -> Self {
        Self { onset, duration: duration.max(0.01), identity }
    }

    pub fn trunk(p: &Plant, identity: u64) -> Self {
        // Forking broadleaf trunks form before the long crown scaffolds;
        // excurrent trees keep adding height through most of the sequence.
        let duration = if ["maple", "sakura"].contains(&p.growth_model.as_str()) {
            6.0 + 1.6 * noise(identity ^ 0x79c119)
        } else {
            13.2 + 2.1 * noise(identity ^ 0x79c119)
        };
        Self::new(-0.25, duration, identity)
    }

    pub fn child(_p: &Plant, parent: Self, attachment: f64, identity: u64) -> Self {
        let delay = 0.08 + 0.70 * noise(identity ^ 0x439ca3)
            + if noise(identity ^ 0x865cb1) < 0.18 { 0.9 } else { 0. };
        Self::new(
            parent.time_at(attachment) + delay,
            1.5 + 1.8 * noise(identity ^ 0xb7a1a5),
            identity,
        )
    }

    pub fn progress(self, p: &Plant) -> f64 {
        if p.generations == 0. { return 0.; }
        if !p.growth_mode { return 1.; }
        extension((p.generations as f64 - self.onset) / self.duration, self.identity)
    }

    /// Earliest time at which the mature path reaches a fixed attachment.
    pub fn time_at(self, attachment: f64) -> f64 {
        let target = attachment.clamp(0., 1.);
        let (mut lo, mut hi) = (0., 1.);
        for _ in 0..32 {
            let mid = (lo + hi) * 0.5;
            if extension(mid, self.identity) < target { lo = mid; } else { hi = mid; }
        }
        self.onset + hi * self.duration
    }
}

/// Completed centerline samples remain verbatim; only the advancing tip is
/// interpolated. Thickness can increase independently of the centerline.
pub fn clip_axis(rings: &[Ring], progress: f64, radial_scale: f64) -> Vec<Ring> {
    if rings.len() < 2 || progress <= 0. { return vec![]; }
    let extent = progress.clamp(0., 1.) * (rings.len() - 1) as f64;
    let completed = extent.floor() as usize;
    let mut result = rings[..=completed].to_vec();
    if completed < rings.len() - 1 {
        let fraction = extent - completed as f64;
        if fraction > 1e-10 {
            let a = rings[completed];
            let b = rings[completed + 1];
            result.push(Ring {
                center: a.center.lerp(b.center, fraction),
                radius: a.radius + (b.radius - a.radius) * fraction,
            });
        }
    }
    if result.len() < 2 { return vec![]; }
    let last = result.len() - 1;
    for (i, ring) in result.iter_mut().enumerate() {
        let tip = if progress < 0.999 { ((last - i) as f64 / 2.).min(1.).max(0.10) } else { 1. };
        ring.radius *= radial_scale.max(0.001) * tip;
    }
    result
}

/// Order-only compatibility helper. Generated trees use parent-relative clocks.
pub fn development(p: &Plant, order: u32, identity: u64) -> f64 {
    if order == 0 || !p.growth_mode { return 1.; }
    let onset = [0., 1., 3., 5., 8., 12.][order.min(5) as usize] + noise(identity) * 2.4;
    Schedule::new(onset, 1.8 + noise(identity) * 2.2, identity).progress(p)
}

/// Small seeded changes of heading along the mature path. Independent of age,
/// so already grown internodes and their attached organs never drift.
pub fn wander(t: f64, phase: f64) -> f64 {
    let tau = std::f64::consts::TAU;
    ((t * tau * 2.4 + phase).sin() - phase.sin()) * 0.010
        + ((t * tau * 4.1 + phase * 1.7).sin() - (phase * 1.7).sin()) * 0.004
}
