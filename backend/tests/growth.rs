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
                height + 0.01 >= previous_height,
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
fn established_branch_origins_stay_fixed_while_new_branches_appear() {
    for name in ["birch", "maple", "sakura", "pine", "oak", "willow", "spruce", "ginkgo"] {
        let all = presets();
        let preset = all.as_array().unwrap().iter().find(|p| p["id"] == name).unwrap();
        let mut p: Plant = serde_json::from_value(preset["params"].clone()).unwrap();
        p.generations = 8;
        let (_, early, _) = engine::generate(&p).unwrap();
        p.generations = 12;
        let (_, later, _) = engine::generate(&p).unwrap();
        assert!(later.branches.len() > early.branches.len(), "{name}");
        for branch in &early.branches {
            assert!(later.branches.iter().any(|b| glam::DVec3::from_array(b.start).distance(glam::DVec3::from_array(branch.start)) < 1e-9), "{name}: moved attachment");
        }
    }
}

#[test]
fn growing_axis_keeps_completed_centerline_and_tapers_the_new_tip() {
    use komorebi::{growth::clip_axis, sweep::Ring};
    let rings: Vec<_> = (0..=10).map(|i| Ring { center: glam::DVec3::new((i as f64).sin(), i as f64, 0.), radius: 1. }).collect();
    let early = clip_axis(&rings, 0.35, 0.5);
    let later = clip_axis(&rings, 0.75, 0.8);
    for i in 0..4 { assert_eq!(early[i].center, later[i].center); }
    assert_eq!(early.last().unwrap().center, rings[3].center.lerp(rings[4].center, 0.5));
    assert!(early.last().unwrap().radius < early[0].radius * 0.2);
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
