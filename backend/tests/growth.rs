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
#[test]
fn buds_wake_asynchronously_and_growth_is_not_a_uniform_scale() {
    let mut p: Plant = serde_json::from_value(presets()[0]["params"].clone()).unwrap();
    let mut stages = vec![];
    for generation in 3..=5 {
        p.generations = generation;
        let (_, geometry, _) = engine::generate(&p).unwrap();
        let trunk = &geometry.branches[0];
        let norm = glam::DVec3::from_array(trunk.end).distance(glam::DVec3::from_array(trunk.start));
        stages.push(geometry.branches.iter().map(|b| glam::DVec3::from_array(b.end).distance(glam::DVec3::from_array(b.start)) / norm).collect::<Vec<_>>());
    }
    assert_ne!(stages[0], stages[1]);
    assert_ne!(stages[1], stages[2]);
    p.generations = 4;
    let rates: Vec<_> = (0..100).map(|id| komorebi::growth::development(&p, 2, id)).collect();
    assert!(rates.iter().any(|&x| x == 0.));
    assert!(rates.iter().any(|&x| x > 0.));
}
