use komorebi::{
    engine, mesh,
    model::{Plant, Rule, presets},
};
use serde_json::Value;
fn plant() -> Plant {
    let mut p: Plant = serde_json::from_value(presets()[0]["params"].clone()).unwrap();
    p.growth_model = "lsystem".into(); // These tests exercise the editable string grammar.
    p.generations = 4 as f64;
    p.growth_mode = false;
    p
}
fn near(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            let a = a.as_f64().unwrap();
            let b = b.as_f64().unwrap();
            assert!((a - b).abs() < 1e-9, "{a} != {b}");
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                near(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (k, v) in a {
                near(v, &b[k]);
            }
        }
        _ => assert_eq!(actual, expected),
    }
}
#[test]
fn matches_typescript_reference_coordinates_rotations_and_counts() {
    let fixtures: Value = serde_json::from_str(include_str!("reference.json")).unwrap();
    for item in fixtures.as_array().unwrap() {
        let p: Plant = serde_json::from_value(item["params"].clone()).unwrap();
        let (s, g, _) = engine::generate(&p).unwrap();
        assert_eq!(
            String::from_utf8(s).unwrap(),
            item["expanded"].as_str().unwrap()
        );
        near(&serde_json::to_value(g).unwrap(), &item["geometry"]);
    }
}
#[test]
fn rejects_unsafe_syntax_and_excessive_work() {
    for s in [
        "F(alert(1))",
        "F(1/0)",
        "F(-1)",
        "[F",
        "F]",
        "F(999999)",
        "F(2**3)",
        "F(1e)",
        "é",
    ] {
        assert!(engine::validate(s.as_bytes()).is_err(), "{s}");
    }
    assert!(engine::validate("[".repeat(513).as_bytes()).is_err());
    let mut p = plant();
    p.premise = "F".into();
    p.rules = vec![Rule {
        expression: "F=FFFFFFFFFF".into(),
    }];
    p.generations = 12 as f64;
    assert!(engine::generate(&p).is_err());
    p.rules.clear();
    p.premise = "F(100000)F(100000)".into();
    assert!(engine::generate(&p).is_err());
}
#[test]
fn identity_empty_productions_and_exponents() {
    let rules = engine::parse_rules(&[
        Rule {
            expression: "e=FF".into(),
        },
        Rule {
            expression: "A=".into(),
        },
    ])
    .unwrap();
    assert_eq!(engine::expand("F(1e2)A", &rules, 2).unwrap(), b"F(1e2)");
    let erase = engine::parse_rules(&[Rule {
        expression: "F=".into(),
    }])
    .unwrap();
    assert!(engine::expand("F(2)", &erase, 1).unwrap().is_empty());
    for rows in [vec!["A=F", "A=L"], vec!["AB=F"], vec!["A=F=F"]] {
        assert!(
            engine::parse_rules(
                &rows
                    .iter()
                    .map(|s| Rule {
                        expression: s.to_string()
                    })
                    .collect::<Vec<_>>()
            )
            .is_err()
        );
    }
}
#[test]
fn seed_repeatability_and_bounds() {
    let mut p = plant();
    let (_, a, _) = engine::generate(&p).unwrap();
    let (_, b, _) = engine::generate(&p).unwrap();
    assert_eq!(
        serde_json::to_value(&a).unwrap(),
        serde_json::to_value(b).unwrap()
    );
    p.seed += 1;
    let (_, c, _) = engine::generate(&p).unwrap();
    assert_ne!(
        serde_json::to_value(&a).unwrap(),
        serde_json::to_value(c).unwrap()
    );
    for seed in [0, 2147483647, 4294967295] {
        p.seed = seed;
        assert!(engine::generate(&p).is_ok());
    }
}
#[test]
fn binary_buffer_has_exact_length_and_finite_data() {
    let p = plant();
    let (s, g, limit) = engine::generate(&p).unwrap();
    let bytes = mesh::encode(&s, &g, limit, std::time::Instant::now());
    assert_eq!(&bytes[..4], b"KMR2");
    let len = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    let m: mesh::Meta = serde_json::from_slice(&bytes[8..8 + len]).unwrap();
    assert_eq!(
        bytes.len(),
        8 + len + (m.vertices * 9 + m.indices + (m.leaves + m.flowers + m.buds) * 17) * 4
    );
    for chunk in bytes[8 + len..8 + len + m.vertices * 9 * 4].chunks_exact(4) {
        assert!(f32::from_le_bytes(chunk.try_into().unwrap()).is_finite());
    }
    assert_eq!(m.branches, g.branches.len());
    assert_eq!(m.symbol_count, s.len());
}
#[test]
fn compact_gpu_taper_reconstructs_the_same_vertices_as_export_mesh() {
    let p = plant();
    let (s, g, limit) = engine::generate(&p).unwrap();
    let compact = mesh::encode_preview(&s, &g, limit, std::time::Instant::now());
    let full = mesh::encode(&s, &g, limit, std::time::Instant::now());
    let header = |b: &[u8]| 8 + u32::from_le_bytes(b[4..8].try_into().unwrap()) as usize;
    let c = header(&compact);
    let f = header(&full);
    let meta: mesh::Meta = serde_json::from_slice(&compact[8..c]).unwrap();
    assert!(compact.len() * 10 < full.len());
    let template: Value =
        serde_json::from_str(include_str!("../../shared/branch-template.json")).unwrap();
    let positions = template["position"].as_array().unwrap();
    let per = positions.len() / 3;
    let read = |b: &[u8], offset: usize| {
        f32::from_le_bytes(b[offset..offset + 4].try_into().unwrap()) as f64
    };
    for branch in 0..meta.instances {
        let matrix = glam::DMat4::from_cols_array(&std::array::from_fn(|n| {
            read(&compact, c + (branch * 16 + n) * 4)
        }));
        let ratio = read(&compact, c + (meta.instances * 16 + branch * 2) * 4);
        for vertex in 0..per {
            let y = positions[vertex * 3 + 1].as_f64().unwrap();
            let taper = 1. + (ratio - 1.) * (y + 0.5);
            let v = matrix.transform_point3(glam::DVec3::new(
                positions[vertex * 3].as_f64().unwrap() * taper,
                y,
                positions[vertex * 3 + 2].as_f64().unwrap() * taper,
            ));
            for (axis, coord) in v.to_array().iter().enumerate() {
                let expected = read(&full, f + ((branch * per + vertex) * 3 + axis) * 4);
                assert!((coord - expected).abs() < 0.00002);
            }
        }
    }
}
