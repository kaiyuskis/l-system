import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectSession} from '../src/project-session.ts';
import {defaultParams} from '../src/studio-state.ts';
const project={id:'a',revision:1,name:'A',data:{...defaultParams,generations:1},thumbnail:'',deleted:false,savedAt:0};
test('read failure prevents all automatic writes; explicit successful load enables saving',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({...project,revision:2}));};
 try {const s=new ProjectSession(()=>{});s.block(new Error('read failed'));s.enqueue(defaultParams,'','A');assert.equal(calls,0);await assert.rejects(s.flush());s.open(project);s.enqueue(defaultParams,'','A');await s.flush();assert.equal(calls,1);assert.equal(s.project.revision,2);}finally{globalThis.fetch=original;}
});
test('slow saving coalesces edits and checks the acknowledged version; conflict blocks later writes',async()=>{
 const original=globalThis.fetch;const calls=[];let release;
 globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));if(calls.length===1)await new Promise(r=>release=r);return calls.length===1?new Response(JSON.stringify({...project,revision:2})):new Response(JSON.stringify({error:'conflict'}),{status:409});};
 try{const s=new ProjectSession(()=>{});s.open(project);s.enqueue(defaultParams,'','A');s.enqueue({...defaultParams,generations:3},'','A');s.enqueue({...defaultParams,generations:4},'','A');assert.equal(calls.length,1);release();await assert.rejects(s.flush(),/conflict/);assert.equal(calls.length,2);assert.equal(calls[1].expectedRevision,2);assert.equal(calls[1].data.generations,4);s.enqueue(defaultParams,'','A');assert.equal(calls.length,2);}finally{globalThis.fetch=original;}
});
test('a delayed response from another project cannot replace the active project',async()=>{
 const original=globalThis.fetch;let release;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);if(calls.length===1)await new Promise(r=>release=r);return new Response(JSON.stringify({...project,id:calls.length===1?'a':'b',revision:2}));};
 try{
  const s=new ProjectSession(()=>{});s.open(project);s.enqueue(defaultParams,'','A');
  s.open({...project,id:'b',name:'B'});s.enqueue({...defaultParams,generations:5},'','B');
  release();await s.flush();
  assert.equal(s.project.id,'b');assert.equal(calls.length,2);
  assert.equal(calls[1][0],'/api/projects/b');assert.equal(calls[1][1].expectedRevision,1);
 }finally{globalThis.fetch=original;}
});
