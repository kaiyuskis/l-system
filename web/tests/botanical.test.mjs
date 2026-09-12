import {test} from "node:test";
import assert from "node:assert/strict";
import {broadleaf,cherryBlossom,spruceNeedles} from "../src/botanical-organs.ts";

test("botanical organs are folded meshes with attached petioles and finite normals",()=>{
  for(const kind of ["birch","maple","cherry","fern","oak","willow","ginkgo","spruce","blossom"]) {
    const g=kind==="blossom"?cherryBlossom():kind==="spruce"?spruceNeedles():broadleaf(kind);
    for(const attr of ["position","normal","color"]) assert.ok([...g.getAttribute(attr).array].every(Number.isFinite),`${kind}: ${attr}`);
    assert.ok(g.boundingBox.max.z-g.boundingBox.min.z>.0005,`${kind}: folded`);
    assert.ok(g.boundingBox.min.y<.001,`${kind}: anchored`);
    assert.ok(g.getIndex().array.every(i=>i<g.getAttribute("position").count));
    assert.ok(g.getAttribute("position").count>60);
    g.dispose();
  }
});
