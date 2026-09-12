use crate::engine::{Geometry, unit_rotation};
use glam::{DMat4, DQuat, DVec3};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Deserialize)]
struct Template {
    position: Vec<f64>,
    normal: Vec<f64>,
    uv: Vec<f64>,
    index: Vec<u32>,
}
fn template() -> &'static Template {
    static T: OnceLock<Template> = OnceLock::new();
    T.get_or_init(|| {
        serde_json::from_str(include_str!("../../shared/branch-template.json")).unwrap()
    })
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: u32,
    pub vertices: usize,
    pub indices: usize,
    pub instances: usize,
    pub branches: usize,
    pub leaves: usize,
    pub flowers: usize,
    pub buds: usize,
    pub symbol_count: usize,
    pub preview: String,
    pub generation_limit: u32,
    pub engine_ms: f64,
}
fn floats(out: &mut Vec<u8>, values: impl IntoIterator<Item = f64>) {
    for value in values {
        out.extend_from_slice(&(value as f32).to_le_bytes());
    }
}
pub fn encode(s: &[u8], data: &Geometry, limit: u32, started: std::time::Instant) -> Vec<u8> {
    if let Some(surface) = &data.surface { return encode_surface(s,data,surface,limit,started); }
    let t = template();
    let per = t.position.len() / 3;
    let valid: Vec<_> = data
        .branches
        .iter()
        .filter(|b| DVec3::from_array(b.start).distance_squared(DVec3::from_array(b.end)) > 1e-12)
        .collect();
    // SoA matches WebGL attributes: positions, normals, uv, thickness, indices.
    let mut positions = Vec::with_capacity(valid.len() * per * 3);
    let mut normals = Vec::with_capacity(valid.len() * per * 3);
    let mut uvs = Vec::with_capacity(valid.len() * per * 2);
    let mut widths = Vec::with_capacity(valid.len() * per);
    for b in &valid {
        let start = DVec3::from_array(b.start);
        let delta = DVec3::from_array(b.end) - start;
        let length = delta.length();
        let q = unit_rotation(DVec3::Y, delta / length);
        let bottom = b.radius_bottom.max(0.00001);
        let top = b.radius_top.max(0.00001);
        let slope = (bottom - top) / length;
        for v in 0..per {
            let progress = t.position[v * 3 + 1] + 0.5;
            let radius = bottom + (top - bottom) * progress;
            let pos = q * DVec3::new(
                t.position[v * 3] * radius,
                progress * length,
                t.position[v * 3 + 2] * radius,
            ) + start;
            positions.extend_from_slice(&pos.to_array());
            let mut n = DVec3::from_slice(&t.normal[v * 3..v * 3 + 3]);
            if n.y.abs() < 0.5 {
                n.y = slope;
            }
            let n = q * n.normalize();
            normals.extend_from_slice(&n.to_array());
            uvs.extend_from_slice(&[t.uv[v * 2], t.uv[v * 2 + 1] * length.max(0.2)]);
            widths.push(radius);
        }
    }
    let meta = Meta {
        version: 2,
        instances: 0,
        vertices: valid.len() * per,
        indices: valid.len() * t.index.len(),
        branches: data.branches.len(),
        leaves: data.leaves.len(),
        flowers: data.flowers.len(),
        buds: data.buds.len(),
        symbol_count: s.len(),
        preview: String::from_utf8_lossy(&s[..s.len().min(1000)]).into_owned(),
        generation_limit: limit,
        engine_ms: started.elapsed().as_secs_f64() * 1000.,
    };
    let json = serde_json::to_vec(&meta).unwrap();
    let padding = (4 - json.len() % 4) % 4;
    let mut out = Vec::with_capacity(
        8 + json.len()
            + padding
            + (meta.vertices * 9 + meta.indices + (meta.leaves + meta.flowers + meta.buds) * 17)
                * 4,
    );
    out.extend_from_slice(b"KMR2");
    out.extend_from_slice(&((json.len() + padding) as u32).to_le_bytes());
    out.extend_from_slice(&json);
    out.resize(out.len() + padding, b' ');
    floats(&mut out, positions);
    floats(&mut out, normals);
    floats(&mut out, uvs);
    floats(&mut out, widths);
    for b in 0..valid.len() {
        for index in &t.index {
            out.extend_from_slice(&(index + b as u32 * per as u32).to_le_bytes());
        }
    }
    for organs in [&data.leaves, &data.flowers, &data.buds] {
        for p in organs {
            let matrix = DMat4::from_scale_rotation_translation(
                DVec3::splat(p.scale),
                DQuat::from_array(p.rotation),
                DVec3::from_array(p.position),
            );
            floats(&mut out, matrix.to_cols_array());
        }
        floats(&mut out, organs.iter().map(|p| p.thickness));
    }
    out
}

/// Display uses one shared cylinder and compact per-branch transforms. The GPU
/// applies taper; the full baked mesh is only needed by glTF export.
pub fn encode_preview(
    s: &[u8],
    data: &Geometry,
    limit: u32,
    started: std::time::Instant,
) -> Vec<u8> {
    if data.surface.is_some() { return encode(s,data,limit,started); }
    let valid: Vec<_> = data
        .branches
        .iter()
        .filter(|b| DVec3::from_array(b.start).distance_squared(DVec3::from_array(b.end)) > 1e-12)
        .collect();
    let mut packed = Vec::with_capacity(
        valid.len() * 19 * 4 + (data.leaves.len() + data.flowers.len() + data.buds.len()) * 17 * 4,
    );
    for b in &valid {
        let start = DVec3::from_array(b.start);
        let end = DVec3::from_array(b.end);
        let delta = end - start;
        let width = b.radius_bottom.max(0.00001);
        let matrix = DMat4::from_scale_rotation_translation(
            DVec3::new(width, delta.length(), width),
            unit_rotation(DVec3::Y, delta.normalize()),
            (start + end) * 0.5,
        );
        floats(&mut packed, matrix.to_cols_array());
    }
    for b in &valid {
        floats(
            &mut packed,
            [
                b.radius_top.max(0.00001) / b.radius_bottom.max(0.00001),
                DVec3::from_array(b.start).distance(DVec3::from_array(b.end)),
            ],
        );
    }
    floats(
        &mut packed,
        valid.iter().map(|b| b.radius_bottom.max(0.00001)),
    );
    for organs in [&data.leaves, &data.flowers, &data.buds] {
        for p in organs {
            floats(
                &mut packed,
                DMat4::from_scale_rotation_translation(
                    DVec3::splat(p.scale),
                    DQuat::from_array(p.rotation),
                    DVec3::from_array(p.position),
                )
                .to_cols_array(),
            );
        }
        floats(&mut packed, organs.iter().map(|p| p.thickness));
    }
    let meta = Meta {
        version: 2,
        vertices: 0,
        indices: 0,
        instances: valid.len(),
        branches: data.branches.len(),
        leaves: data.leaves.len(),
        flowers: data.flowers.len(),
        buds: data.buds.len(),
        symbol_count: s.len(),
        preview: String::from_utf8_lossy(&s[..s.len().min(1000)]).into_owned(),
        generation_limit: limit,
        engine_ms: started.elapsed().as_secs_f64() * 1000.,
    };
    let json = serde_json::to_vec(&meta).unwrap();
    let padding = (4 - json.len() % 4) % 4;
    let mut out = Vec::with_capacity(8 + json.len() + padding + packed.len());
    out.extend_from_slice(b"KMR2");
    out.extend_from_slice(&((json.len() + padding) as u32).to_le_bytes());
    out.extend_from_slice(&json);
    out.resize(out.len() + padding, b' ');
    out.extend_from_slice(&packed);
    out
}

/// Detailed continuous surfaces use the same portable layout as baked exports.
/// Preview and GLB consequently share the exact same woody vertices and normals.
fn encode_surface(s: &[u8], data: &Geometry, surface: &crate::sweep::Surface, limit: u32, started: std::time::Instant) -> Vec<u8> {
    let meta = Meta {version:2,instances:0,vertices:surface.position.len()/3,indices:surface.index.len(),
        branches:data.branches.len(),leaves:data.leaves.len(),flowers:data.flowers.len(),buds:data.buds.len(),
        symbol_count:s.len(),preview:String::from_utf8_lossy(&s[..s.len().min(1000)]).into_owned(),
        generation_limit:limit,engine_ms:started.elapsed().as_secs_f64()*1000.};
    let json=serde_json::to_vec(&meta).unwrap();
    let padding=(4-json.len()%4)%4;
    let mut out=Vec::with_capacity(8+json.len()+padding+(meta.vertices*9+meta.indices+(meta.leaves+meta.flowers+meta.buds)*17)*4);
    out.extend_from_slice(b"KMR2");
    out.extend_from_slice(&((json.len()+padding) as u32).to_le_bytes());
    out.extend_from_slice(&json);out.resize(out.len()+padding,b' ');
    floats(&mut out,surface.position.iter().copied());
    floats(&mut out,surface.normal.iter().copied());
    floats(&mut out,surface.uv.iter().copied());
    floats(&mut out,surface.thickness.iter().copied());
    for index in &surface.index {out.extend_from_slice(&index.to_le_bytes());}
    for organs in [&data.leaves,&data.flowers,&data.buds] {
        for p in organs {floats(&mut out,DMat4::from_scale_rotation_translation(DVec3::splat(p.scale),DQuat::from_array(p.rotation),DVec3::from_array(p.position)).to_cols_array());}
        floats(&mut out,organs.iter().map(|p|p.thickness));
    }
    out
}
