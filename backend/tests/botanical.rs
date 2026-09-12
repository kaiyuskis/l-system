use glam::DVec3;
use komorebi::{
    engine,
    model::{Plant, presets},
};
fn plant(id: &str) -> Plant {
    serde_json::from_value(
        presets()
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap()["params"]
            .clone(),
    )
    .unwrap()
}
#[test]
fn every_species_produces_finite_connected_axes_and_attached_organs() {
    for name in ["birch", "maple", "sakura", "fern", "pine", "oak", "willow", "spruce", "ginkgo"] {
        let p = plant(name);
        let (_, g, _) = engine::generate(&p).unwrap();
        let s = g.surface.as_ref().unwrap();
        assert!(g.branches.len() > 100, "{name}");
        assert!(g.leaves.len() + g.flowers.len() > 100, "{name}");
        assert!(
            s.position
                .iter()
                .chain(s.normal.iter())
                .chain(s.uv.iter())
                .all(|v| v.is_finite()),
            "{name}"
        );
        for n in s.normal.chunks_exact(3) {
            assert!((DVec3::from_slice(n).length() - 1.).abs() < 1e-8, "{name}");
        }
        assert!(s.index.iter().all(|&i| (i as usize) < s.position.len() / 3));
        for organ in g.leaves.iter().chain(g.flowers.iter()).step_by(137) {
            let point = DVec3::from_array(organ.position);
            // A vertex-only distance falsely rejects organs between sparse rings.
            let distance = s.index.chunks_exact(3)
                .map(|tri| {
                    let [a,b,c] = [tri[0],tri[1],tri[2]].map(|i| DVec3::from_slice(&s.position[i as usize*3..i as usize*3+3]));
                    triangle_distance(point,a,b,c)
                })
                .fold(f64::INFINITY, f64::min);
            assert!(distance < 0.01 + organ.thickness * 1.3, "{name}: detached {distance}");
        }
    }
}

fn triangle_distance(p: DVec3, a: DVec3, b: DVec3, c: DVec3) -> f64 {
    let n = (b-a).cross(c-a).normalize_or_zero();
    let q = p - n * (p-a).dot(n);
    if n.length_squared() > 0. && [(b-a).cross(q-a), (c-b).cross(q-b), (a-c).cross(q-c)].iter().all(|v| v.dot(n) >= -1e-12) {
        return p.distance(q);
    }
    [(a,b),(b,c),(c,a)].iter().map(|&(u,v)| {
        let edge = v-u;
        p.distance(u + edge * ((p-u).dot(edge) / edge.length_squared().max(1e-30)).clamp(0.,1.))
    }).fold(f64::INFINITY, f64::min)
}
#[test]
fn all_species_are_seeded_and_maximum_default_detail_fits_the_protocol() {
    for name in ["birch", "maple", "sakura", "fern", "pine", "oak", "willow", "spruce", "ginkgo"] {
        let mut p = plant(name);
        let (_, a, _) = engine::generate(&p).unwrap();
        let (_, b, _) = engine::generate(&p).unwrap();
        assert_eq!(
            a.surface.as_ref().unwrap().position,
            b.surface.as_ref().unwrap().position
        );
        p.seed += 1;
        let (_, c, _) = engine::generate(&p).unwrap();
        assert_ne!(
            a.surface.as_ref().unwrap().position,
            c.surface.as_ref().unwrap().position
        );
        p.generations = 16 as f64;
        let (_, fine, _) = engine::generate(&p).unwrap();
        assert!(
            fine.surface.as_ref().unwrap().index.len() <= 5_000_000,
            "{name}"
        );
        assert!(
            fine.leaves.len() + fine.flowers.len() + fine.buds.len() <= 30_000,
            "{name}"
        );
    }
}
#[test]
fn density_zero_removes_foliage_and_generation_zero_is_empty() {
    for name in ["birch", "maple", "sakura", "fern", "pine", "oak", "willow", "spruce", "ginkgo"] {
        let mut p = plant(name);
        p.foliage_density = 0.;
        let (_, bare, _) = engine::generate(&p).unwrap();
        assert!(bare.leaves.is_empty() && bare.flowers.is_empty());
        assert!(!bare.branches.is_empty());
        p.generations = 0 as f64;
        let (_, empty, _) = engine::generate(&p).unwrap();
        assert!(empty.branches.is_empty());
    }
}
