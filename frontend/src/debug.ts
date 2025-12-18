import * as THREE from "three";

export function makeDebug(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);

  const clear = () => {
    while (group.children.length) group.remove(group.children[0]);
  };

  const addBranchAxes = (segments: { start: THREE.Vector3; end: THREE.Vector3 }[]) => {

    const positions = new Float32Array(segments.length * 2 * 3);
    for (let i = 0; i < segments.length; i++) {
      const a = segments[i].start;
      const b = segments[i].end;
      const o = i * 6;
      positions[o + 0] = a.x; positions[o + 1] = a.y; positions[o + 2] = a.z;
      positions[o + 3] = b.x; positions[o + 4] = b.y; positions[o + 5] = b.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xff00ff,     // 派手に（デバッグなのでOK）
      depthTest: false,    // ★前面に出す
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });


    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 999;
    group.add(lines);
  };

  const addLeafPoints = (pts: { position: THREE.Vector3 }[], size = 0.04) => {

    const positions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i].position;
      const o = i * 3;
      positions[o + 0] = p.x; positions[o + 1] = p.y; positions[o + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00ff00,
      size,
      sizeAttenuation: true,
      depthTest: false,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.renderOrder = 999;
    group.add(points);
  };

  const addLeafNormals = (
    leaves: { position: THREE.Vector3; rotation: THREE.Quaternion; scale: number }[],
    len = 0.8
  ) => {

    const positions = new Float32Array(leaves.length * 2 * 3);
    const up = new THREE.Vector3(0, 1, 0); // ローカルYを“葉の前”扱い

    for (let i = 0; i < leaves.length; i++) {
      const p = leaves[i].position;
      const dir = up.clone().applyQuaternion(leaves[i].rotation).normalize();
      const q = p.clone().addScaledVector(dir, len * leaves[i].scale);

      const o = i * 6;
      positions[o + 0] = p.x; positions[o + 1] = p.y; positions[o + 2] = p.z;
      positions[o + 3] = q.x; positions[o + 4] = q.y; positions[o + 5] = q.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 999;
    group.add(lines);
  };

  return { group, clear, addBranchAxes, addLeafPoints, addLeafNormals };
}
