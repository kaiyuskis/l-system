//! Continuous, tapered woody axes. Rings use parallel transport rather than
//! a separate capped cylinder per internode, so bends have no cracks or rims.
use glam::DVec3;

#[derive(Clone, Default)]
pub struct Surface {
    pub identities: Vec<AxisIdentity>,
    pub position: Vec<f64>,
    pub normal: Vec<f64>,
    pub uv: Vec<f64>,
    pub thickness: Vec<f64>,
    pub index: Vec<u32>,
    seams: Vec<(usize, usize)>,
}
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug)]
pub struct AxisIdentity { pub id: String, pub start: usize, pub end: usize, pub width: usize, pub rings: usize }
#[derive(Clone, Copy)]
pub struct Ring {
    pub center: DVec3,
    pub radius: f64,
}

impl Surface {
    pub fn axis(&mut self, rings: &[Ring], sides: usize, phase: f64, old_bark: f64) {
        self.axis_identified(format!("legacy-{}",self.identities.len()), rings,sides,phase,old_bark);
    }
    pub fn axis_identified(&mut self, id: String, rings: &[Ring], sides: usize, phase: f64, old_bark: f64) {
        if rings.len() < 2 {
            return;
        }
        let offset = self.position.len() / 3;
        let width = sides + 1;
        self.identities.push(AxisIdentity{id,start:offset,end:offset+rings.len()*width+2,width,rings:rings.len()});
        let mut frame = DVec3::X;
        let mut distance = 0.;
        for (i, ring) in rings.iter().enumerate() {
            self.seams
                .push((offset + i * width, offset + i * width + sides));
            let tangent = (rings[(i + 1).min(rings.len() - 1)].center
                - rings[i.saturating_sub(1)].center)
                .normalize_or_zero();
            if i == 0 {
                frame = if tangent.x.abs() < 0.85 {
                    DVec3::X
                } else {
                    DVec3::Z
                };
            }
            frame = (frame - tangent * frame.dot(tangent)).normalize_or_zero();
            let binormal = tangent.cross(frame).normalize_or_zero();
            if i > 0 {
                distance += ring.center.distance(rings[i - 1].center);
            }
            for j in 0..=sides {
                let angle = std::f64::consts::TAU * j as f64 / sides as f64;
                let radial = frame * angle.cos() + binormal * angle.sin();
                // Large roots and old bark make the silhouette irregular too;
                // the photographic texture supplies the finer fissures.
                let lobes = 1.
                    + old_bark
                        * (0.055 * (3. * angle + phase).sin()
                            + 0.025 * (7. * angle - phase + distance * 1.3).sin());
                self.position
                    .extend_from_slice(&(ring.center + radial * ring.radius * lobes).to_array());
                self.normal.extend_from_slice(&[0.; 3]);
                // Approximately world-space bark scale, continuous along an axis.
                self.uv.extend_from_slice(&[
                    j as f64 / sides as f64
                        * (rings[0].radius * std::f64::consts::TAU / 0.65).max(0.25),
                    distance / 0.85,
                ]);
                self.thickness.push(ring.radius);
            }
        }
        for i in 0..rings.len() - 1 {
            for j in 0..sides {
                let a = (offset + i * width + j) as u32;
                let b = a + width as u32;
                self.index
                    .extend_from_slice(&[a, a + 1, b, a + 1, b + 1, b]);
            }
        }
        // Close both ends. Side normals are kept independent from cap normals.
        for (ring_index, reverse) in [(0, true), (rings.len() - 1, false)] {
            let c = (self.position.len() / 3) as u32;
            self.position
                .extend_from_slice(&rings[ring_index].center.to_array());
            self.normal.extend_from_slice(&[0.; 3]);
            self.uv.extend_from_slice(&[0.5, 0.5]);
            self.thickness.push(rings[ring_index].radius);
            for j in 0..sides {
                let a = (offset + ring_index * width + j) as u32;
                if reverse {
                    self.index.extend_from_slice(&[c, a + 1, a]);
                } else {
                    self.index.extend_from_slice(&[c, a, a + 1]);
                }
            }
        }
    }
    pub fn normals(&mut self) {
        for tri in self.index.chunks_exact(3) {
            let a = tri[0] as usize * 3;
            let b = tri[1] as usize * 3;
            let c = tri[2] as usize * 3;
            let normal = (DVec3::from_slice(&self.position[b..b + 3])
                - DVec3::from_slice(&self.position[a..a + 3]))
            .cross(
                DVec3::from_slice(&self.position[c..c + 3])
                    - DVec3::from_slice(&self.position[a..a + 3]),
            );
            for v in [a, b, c] {
                for k in 0..3 {
                    self.normal[v + k] += normal[k];
                }
            }
        }
        // UV seam duplicates must shade as the same surface point.
        for &(a, b) in &self.seams {
            for k in 0..3 {
                let total = self.normal[a * 3 + k] + self.normal[b * 3 + k];
                self.normal[a * 3 + k] = total;
                self.normal[b * 3 + k] = total;
            }
        }
        for normal in self.normal.chunks_exact_mut(3) {
            normal.copy_from_slice(&DVec3::from_slice(normal).normalize_or_zero().to_array());
        }
    }
}
