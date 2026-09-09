import * as THREE from "three";

/** A single twig's needles, shared by all preview instances and GLB meshes.
 * Black/red pine needles emerge in pairs from a common fascicle, not as scales
 * or flat foliage cards. Their long, nearly straight blades make the silhouette. */
export const NEEDLES_PER_SHOOT = 64;
export const NEEDLE_STEM_LENGTH = .16;
const RINGS_PER_NEEDLE = 5;
const SIDES = 3;

export function needleShoot(length = 1): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  let state = 7319;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const fascicles = NEEDLES_PER_SHOOT / 2;

  for (let f = 0; f < fascicles; f++) {
    const along = (f + random() * .65) / fascicles;
    // The straight woody short shoot owns the attachment. Rooting both blades
    // on its centreline also keeps the narrowest twig instances connected.
    const base = new THREE.Vector3(0, .028 + along * (NEEDLE_STEM_LENGTH - .03), 0);
    const azimuth = f * 2.3999632297 + random() * .5;
    const lean = .82 - along * .49 + random() * .16;
    const needleLength = (.16 + random() * .07) * length;
    const tint = .84 + random() * .22;
    const pairOpening = .065 + random() * .075;

    for (let pair = 0; pair < 2; pair++) {
      const angle = azimuth + (pair ? 1 : -1) * pairOpening;
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = positions.length / 3;
      const radius = .00125 * (.88 + random() * .24);
      const direction = outward.clone().multiplyScalar(Math.sin(lean))
        .addScaledVector(THREE.Object3D.DEFAULT_UP, Math.cos(lean));
      const points = Array.from({ length: RINGS_PER_NEEDLE }, (_, i) => {
        const t = i / (RINGS_PER_NEEDLE - 1);
        // A slight outward bow, with a stiff straight shaft rather than a curl.
        return base.clone().addScaledVector(direction, needleLength * t)
          .addScaledVector(outward, needleLength * .075 * t * t);
      });
      const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      for (let i = 0; i < RINGS_PER_NEEDLE; i++) {
        const t = i / (RINGS_PER_NEEDLE - 1);
        const tangent = points[Math.min(i + 1, RINGS_PER_NEEDLE - 1)].clone()
          .sub(points[Math.max(0, i - 1)]).normalize();
        const other = new THREE.Vector3().crossVectors(tangent, side).normalize();
        // Most of the needle keeps its width; the final section has a sharp tip.
        const width = radius * Math.max(.008, (1 - t * .25) * (1 - Math.pow(t, 4)));
        for (let j = 0; j < SIDES; j++) {
          const a = j * Math.PI * 2 / SIDES;
          const point = points[i].clone().addScaledVector(side, Math.cos(a) * width)
            .addScaledVector(other, Math.sin(a) * width);
          positions.push(point.x, point.y, point.z);
          uvs.push(j / SIDES, t);
          const shade = tint * (.76 + .24 * t) * (j === 0 ? 1.04 : .96);
          colors.push(shade, shade * 1.015, shade * .9);
        }
      }
      for (let i = 0; i < RINGS_PER_NEEDLE - 1; i++) for (let j = 0; j < SIDES; j++) {
        const a = start + i * SIDES + j, b = start + i * SIDES + (j + 1) % SIDES;
        indices.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
      }
      // Closed triangular ends survive two-sided export and extreme closeups.
      indices.push(start + 2, start + 1, start);
      const tip = start + (RINGS_PER_NEEDLE - 1) * SIDES;
      indices.push(tip, tip + 1, tip + 2);
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
