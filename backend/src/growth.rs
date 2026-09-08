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
