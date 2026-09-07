use komorebi::{
    engine,
    model::{Plant, Rule, presets},
};
use std::{hint::black_box, time::Instant};
fn main() {
    let mut cases = Vec::new();
    let mut p: Plant = serde_json::from_value(presets()[0]["params"].clone()).unwrap();
    p.generations = 6;
    cases.push(("birch-6", p.clone()));
    p.premise = "F".into();
    p.rules = vec![Rule {
        expression: "F=F[+F][-F][&F]".into(),
    }];
    p.generations = 7;
    cases.push(("dense-7", p));
    for (name, p) in cases {
        let rules = engine::parse_rules(&p.rules).unwrap();
        let work = || {
            let s = engine::expand(&p.premise, &rules, p.generations).unwrap();
            let data = engine::geometry(&s, &p).unwrap();
            black_box((s, data))
        };
        for _ in 0..5 {
            work();
        }
        let start = Instant::now();
        for _ in 0..30 {
            work();
        }
        let ms = start.elapsed().as_secs_f64() * 1000. / 30.;
        let (s, g) = work();
        println!(
            "{}",
            serde_json::json!({"case":name,"engineMs":ms,"branches":g.branches.len(),"symbols":s.len(),"iterations":30})
        );
    }
}
