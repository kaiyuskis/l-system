use komorebi::{engine, model::{presets,Plant}};
fn main(){
 for id in ["birch","maple","sakura","fern","pine","oak","willow","spruce","ginkgo"] {
  let mut p:Plant=serde_json::from_value(presets().as_array().unwrap().iter().find(|p|p["id"]==id).unwrap()["params"].clone()).unwrap();
  for generation in [1,4,8,12,16] {
   p.generations=generation as f64;
   match engine::generate(&p) { Ok((_,g,_))=>println!("{} {} branches={} organs={} height={:.3}",id,generation,g.branches.len(),g.leaves.len()+g.flowers.len(),g.surface.as_ref().unwrap().position.chunks_exact(3).map(|p|p[1]).fold(0.,f64::max)),Err(e)=>println!("{} {} ERROR {}",id,generation,e) }
  }
 }
}
