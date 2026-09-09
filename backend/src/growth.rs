use crate::model::Plant;

pub const LIMIT: u32 = 16;

/// Developmental branching stages; intervening generations extend existing axes.
pub fn order(p: &Plant) -> u32 {
    [1, 2, 4, 6, 9, 13]
        .iter()
        .filter(|&&g| g <= p.generations)
        .count()
        .saturating_sub(1) as u32
}

pub fn size(p: &Plant) -> f64 {
    if p.growth_mode {
        (p.generations as f64 / 12.).powf(0.9)
    } else {
        1.
    }
}

/// Each axis wakes on its own deterministic schedule. Zero means a dormant bud.
pub fn development(p: &Plant, order: u32, identity: u64) -> f64 {
    if order == 0 || !p.growth_mode { return 1.; }
    let mut x = identity.wrapping_add(0x9e3779b97f4a7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    let noise = ((x ^ (x >> 31)) >> 11) as f64 / ((1u64 << 53) as f64);
    let onset = [0., 1., 3., 5., 8., 12.][order.min(5) as usize] + noise * 2.4;
    let age = (p.generations as f64 - onset).max(0.);
    (age / (1.8 + noise * 2.2)).clamp(0.,1.).powf(0.7 + noise * 0.5)
}
