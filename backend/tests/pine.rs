use glam::DVec3;
use komorebi::{
    engine, mesh,
    model::{Plant, presets},
    sweep::{Ring, Surface},
};
use std::time::Instant;
fn pine() -> Plant {
    serde_json::from_value(
        presets()
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == "pine")
            .unwrap()["params"]
            .clone(),
    )
    .unwrap()
}
fn finite(surface: &Surface) {
    assert!(
        surface
            .position
            .iter()
            .chain(surface.normal.iter())
            .chain(surface.uv.iter())
            .all(|v| v.is_finite())
    );
    assert_eq!(surface.position.len(), surface.normal.len());
    assert_eq!(surface.position.len() / 3, surface.thickness.len());
    assert!(
        surface
            .index
            .iter()
            .all(|&i| (i as usize) < surface.thickness.len())
    );
    for normal in surface.normal.chunks_exact(3) {
        assert!((DVec3::from_slice(normal).length() - 1.).abs() < 1e-9);
    }
}
#[test]
fn pine_is_a_continuous_surface_with_attached_three_dimensional_shoots() {
    let (_, g, _) = engine::generate(&pine()).unwrap();
    let s = g.surface.as_ref().expect("continuous woody mesh");
    finite(s);
    assert!(g.branches.len() > 100);
    assert!(g.leaves.len() > 100);
    assert!(s.position.len() / 3 > g.branches.len() * 100);
    // A shoot's base must sit on/in its woody twig, not float away from it.
    for leaf in g.leaves.iter().step_by((g.leaves.len() / 20).max(1)) {
        let p = DVec3::from_array(leaf.position);
        let nearest = s
            .position
            .chunks_exact(3)
            .map(|v| p.distance(DVec3::from_slice(v)))
            .fold(f64::INFINITY, f64::min);
        assert!(nearest < 0.065, "detached shoot: {nearest}");
    }
}
#[test]
fn seed_changes_architecture_but_preview_and_export_share_exact_wood() {
    let p = pine();
    let (word, a, limit) = engine::generate(&p).unwrap();
    let (_, b, _) = engine::generate(&p).unwrap();
    assert_eq!(
        a.surface.as_ref().unwrap().position,
        b.surface.as_ref().unwrap().position
    );
    assert_eq!(
        serde_json::to_string(&a.leaves).unwrap(),
        serde_json::to_string(&b.leaves).unwrap()
    );
    let mut q = p.clone();
    q.seed += 1;
    let (_, c, _) = engine::generate(&q).unwrap();
    assert_ne!(
        a.surface.as_ref().unwrap().position,
        c.surface.as_ref().unwrap().position
    );
    let display = mesh::encode_preview(&word, &a, limit, Instant::now());
    let export = mesh::encode(&word, &a, limit, Instant::now());
    let body = |bytes: &Vec<u8>| 8 + u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    assert_eq!(&display[body(&display)..], &export[body(&export)..]);
}
#[test]
fn pine_controls_change_structure_and_can_remove_foliage() {
    let p = pine();
    let (_, base, _) = engine::generate(&p).unwrap();
    let mut q = p.clone();
    q.foliage_density = 0.;
    let (_, bare, _) = engine::generate(&q).unwrap();
    assert!(bare.leaves.is_empty());
    assert_eq!(
        base.surface.as_ref().unwrap().position,
        bare.surface.as_ref().unwrap().position
    );
    q = p.clone();
    q.crown_spread = 1.7;
    let (_, wide, _) = engine::generate(&q).unwrap();
    let extent = |g: &engine::Geometry| {
        g.surface
            .as_ref()
            .unwrap()
            .position
            .chunks_exact(3)
            .map(|v| v[0].hypot(v[2]))
            .fold(0., f64::max)
    };
    assert!(extent(&wide) > extent(&base) * 1.3);
    q = p.clone();
    q.generations = 0 as f64;
    let (_, empty, _) = engine::generate(&q).unwrap();
    assert!(empty.branches.is_empty() && empty.leaves.is_empty());
    q = p.clone();
    q.generations = 3 as f64;
    let (_, young, _) = engine::generate(&q).unwrap();
    assert!(young.branches.len() < base.branches.len());
}
#[test]
fn swept_bends_have_outward_normals_and_closed_end_caps() {
    let mut s = Surface::default();
    s.axis(
        &[
            Ring {
                center: DVec3::ZERO,
                radius: 0.3,
            },
            Ring {
                center: DVec3::new(0.1, 1., 0.),
                radius: 0.2,
            },
            Ring {
                center: DVec3::new(0.4, 2., 0.),
                radius: 0.1,
            },
        ],
        16,
        0.,
        0.,
    );
    s.normals();
    finite(&s);
    for ring in 0..3 {
        let first = ring * 17 * 3;
        let last = first + 16 * 3;
        assert_eq!(&s.normal[first..first + 3], &s.normal[last..last + 3]);
    }
    let normal = DVec3::from_slice(&s.normal[17 * 3..17 * 3 + 3]);
    assert!(normal.x > 0.7);
    let cap0 = DVec3::from_slice(&s.normal[51 * 3..51 * 3 + 3]);
    assert!(cap0.y < -0.9);
    let cap1 = DVec3::from_slice(&s.normal[52 * 3..52 * 3 + 3]);
    assert!(cap1.y > 0.9);
    assert_eq!(s.index.len(), (2 * 16 * 2 + 2 * 16) * 3);
}
