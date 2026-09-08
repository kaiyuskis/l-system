use komorebi::{
    engine,
    model::{Plant, presets},
};

#[test]
fn generations_grow_every_species_and_maximum_fits() {
    for preset in presets().as_array().unwrap() {
        let mut p: Plant = serde_json::from_value(preset["params"].clone()).unwrap();
        if p.growth_model == "lsystem" {
            continue;
        }
        let mut previous_height = 0.;
        for generation in 1..=16 {
            p.generations = generation;
            let (_, g, limit) = engine::generate(&p).unwrap();
            assert_eq!(limit, 16);
            let s = g.surface.as_ref().unwrap();
            let height = s.position.chunks_exact(3).map(|v| v[1]).fold(0., f64::max);
            assert!(
                height > previous_height,
                "{} generation {generation}",
                p.growth_model
            );
            previous_height = height;
            assert!(g.leaves.len() + g.flowers.len() + g.buds.len() <= 30000);
            assert!(s.index.len() <= 5_000_000);
        }
    }
}
