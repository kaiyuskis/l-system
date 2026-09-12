use komorebi::{engine,model::{Plant,presets}};
use std::collections::HashSet;
#[test]
fn native_ids_are_unique_and_shared_across_fractional_growth() {
    for model in ["birch","maple","sakura","fern","pine","oak","willow","spruce","ginkgo"] {
        let mut p:Plant=serde_json::from_value(presets().as_array().unwrap().iter().find(|p|p["params"]["growthModel"]==model).unwrap()["params"].clone()).unwrap();
        let mut before=None;
        for age in [5.,5.25] {
            p.generations=age;let (_,g,_)=engine::generate(&p).unwrap();
            let axes=&g.surface.as_ref().unwrap().identities;
            assert_eq!(axes.iter().map(|a|&a.id).collect::<HashSet<_>>().len(),axes.len(),"{model} axes");
            for organs in [&g.leaves,&g.flowers,&g.buds] {assert_eq!(organs.iter().map(|p|&p.identity).collect::<HashSet<_>>().len(),organs.len(),"{model} organs");assert!(organs.iter().all(|p|!p.identity.is_empty()));}
            let current=axes.iter().map(|a|a.id.clone()).collect::<HashSet<_>>();
            if let Some(previous)=before {assert!(!current.is_disjoint(&previous),"{model}");} before=Some(current);
        }
    }
}
#[test]
fn classic_persistent_symbols_keep_ids_when_new_symbols_are_inserted() {
    let mut p:Plant=serde_json::from_value(presets()[0]["params"].clone()).unwrap();
    p.growth_model="lsystem".into();p.premise="AFL".into();p.rules=vec![komorebi::model::Rule{expression:"A=FA".into()}];
    p.generations=2.;let (_,a,_)=engine::generate(&p).unwrap();p.generations=3.;let (_,b,_)=engine::generate(&p).unwrap();
    assert_eq!(a.leaves[0].identity,b.leaves[0].identity);
    assert_eq!(a.branches.last().unwrap().identity,b.branches.last().unwrap().identity);
}
