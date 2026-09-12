import * as THREE from '../../web/node_modules/three/build/three.module.js';
import { prepareGrowth } from '../../web/src/growth-transition.ts';
import { decodeGeometry } from '../../web/src/geometry-client.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const presets=JSON.parse(readFileSync('shared/presets.json','utf8'));
function tree(data) {
 const group = new THREE.Group();
 if(data.branchMesh.position.length) {
  const g = new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(data.branchMesh.position,3));g.setIndex(new THREE.BufferAttribute(data.branchMesh.index,1));
  const m=new THREE.Mesh(g);m.name='Branches';group.add(m);
 }
 for(const name of ['leaves','flowers','buds']) {
  const pop=data[name];if(!pop.count)continue;
  const m=new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),pop.count);m.name=name;m.instanceMatrix=new THREE.InstancedBufferAttribute(pop.matrices,16);group.add(m);
 }
 return group;
}
const report=[];
for(const name of ['pine','birch','maple','sakura','fern','oak','willow','spruce','ginkgo']) {
 const preset=presets.find(p=>p.id===name);
 const get=async generations=>{const res=await fetch('http://127.0.0.1:5173/api/tree/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...preset.params,generations})});assert.ok(res.ok);return decodeGeometry(await res.arrayBuffer());};
 const old=await get(8), data=await get(16), small=tree(old),large=tree(data);
 const endpoint=data.branchMesh.position.slice();
 const begin=performance.now(),morph=prepareGrowth(large,small), setupMs=performance.now()-begin;
 const tick=performance.now();
 for(const t of [0,.25,.5,.75,1,.5,0]) morph.update(t);
 const frameMs=(performance.now()-tick)/7;
 for(const child of large.children) assert.ok(Array.from(child.isInstancedMesh?child.instanceMatrix.array:child.geometry.getAttribute('position').array).every(Number.isFinite));
 morph.finish(); assert.deepEqual(data.branchMesh.position,endpoint);
 assert.deepEqual(large.children[0].geometry.getAttribute('position').array,endpoint);
 report.push({species:name,vertices:data.meta.vertices,setupMs:Math.round(setupMs),frameMs:Number(frameMs.toFixed(2))});
 for(const group of [small,large])for(const m of group.children){m.geometry.dispose();m.material.dispose();}
}
writeFileSync('output/revision3/growth-audit.json',JSON.stringify(report,null,2)); console.log(report);
