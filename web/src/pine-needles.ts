import * as THREE from "three";

/** A reusable short shoot: 40 fascicles, each with two curved, tapered needles.
 * No alpha cards. The exact geometry is shared by the preview and GLB export. */
export const NEEDLES_PER_SHOOT = 80;
export function needleShoot(length = 1): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  let state = 7319;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  function tube(points: THREE.Vector3[], radius: number, tint: THREE.Color, needle: boolean) {
    const start = positions.length / 3;
    const sides = needle ? 3 : 5;
    let side = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
      if (Math.abs(side.dot(tangent)) > .95) side.set(0, 0, 1);
      side.addScaledVector(tangent, -side.dot(tangent)).normalize();
      const other = new THREE.Vector3().crossVectors(tangent, side).normalize();
      const width = radius * (needle ? Math.max(.02, Math.pow(1 - t, .55)) : 1 - t * .55);
      for (let j = 0; j < sides; j++) {
        const a = j * Math.PI * 2 / sides;
        const p = points[i].clone().addScaledVector(side, Math.cos(a) * width).addScaledVector(other, Math.sin(a) * width);
        positions.push(p.x, p.y, p.z);
        uvs.push(j / sides, t);
        const shade = needle ? (.50 + .5 * Math.sin(t * Math.PI * .75)) * (j === 0 ? 1.08 : .94) : 1;
        colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = start + i * sides + j, b = start + i * sides + (j + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }


  for (let f = 0; f < NEEDLES_PER_SHOOT / 2; f++) {
    const position = (f + random() * .6) / (NEEDLES_PER_SHOOT / 2);
    const base = new THREE.Vector3(.006 * Math.sin(position * 2.4), .012 + position * .14, 0);
    const azimuth = f * 2.3999632297 + random() * .3;
    const spread = .8 - position * .5 + random() * .2;
    const needleLength = (.10 + random() * .05) * length;
    const variation = .72 + random() * .40;
    for (let pair = 0; pair < 2; pair++) {
      const angle = azimuth + (pair ? 1 : -1) * .065;
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const points = Array.from({length: 5}, (_, i) => {
        const t = i / 4;
        // Both needles share a fascicle base, then gradually splay and curve.
        return base.clone().addScaledVector(outward, needleLength * (spread * t + .19 * t * t))
          .add(new THREE.Vector3(0, needleLength * ((1 - spread * .4) * t - .12 * t * t), 0));
      });
      tube(points, .0008 * (.85 + random() * .3), new THREE.Color(variation, variation * 1.03, variation * .81), true);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
