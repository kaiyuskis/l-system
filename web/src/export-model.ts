import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Ordinary meshes avoid requiring GPU-instancing extensions in DCC importers. */
export function bakeInstances(root: THREE.Group): void {
  const populations: THREE.InstancedMesh[] = [];
  root.traverse(object => { if (object instanceof THREE.InstancedMesh) populations.push(object); });
  for (const source of populations) {
    const parent = source.parent!;
    const matrix = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (let start = 0; start < source.count; start += 64) {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = start; i < Math.min(source.count, start + 64); i++) {
        const geometry = source.geometry.clone();
        geometry.deleteAttribute('aThickness');
        source.getMatrixAt(i, matrix);
        geometry.applyMatrix4(matrix);
        if (source.instanceColor) {
          source.getColorAt(i, tint);
          let colors = geometry.getAttribute('color');
          if (!colors) {
            colors = new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3);
            geometry.setAttribute('color', colors);
          }
          for (let j = 0; j < colors.count; j++) colors.setXYZ(j, colors.getX(j)*tint.r, colors.getY(j)*tint.g, colors.getZ(j)*tint.b);
        }
        parts.push(geometry);
      }
      const merged = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!merged) throw new Error('モデルのメッシュ結合に失敗しました。');
      const mesh = new THREE.Mesh(merged, source.material);
      mesh.name = `${source.name} ${Math.floor(start / 64) + 1}`;
      mesh.applyMatrix4(source.matrix);
      parent.add(mesh);
    }
    parent.remove(source);
    source.geometry.dispose();
    source.dispose();
  }
}
