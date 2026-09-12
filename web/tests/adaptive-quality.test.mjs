import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveQuality} from '../src/adaptive-quality.ts';
test('quality uses sustained FPS and hysteresis rather than oscillating on one slow frame',()=>{const q=new AdaptiveQuality('high');assert.equal(q.sample(20,1200),'high');assert.equal(q.sample(20,2400),'medium');assert.equal(q.sample(20,3600),'medium');q.sample(20,4800);assert.equal(q.sample(20,8000),'low');for(let t=14000;t<=18800;t+=1200)q.sample(60,t);assert.equal(q.quality(18800),'medium');});
test('interaction temporarily lowers quality and restores its prior budget when idle',()=>{const q=new AdaptiveQuality('medium');q.interaction(true,0);assert.equal(q.quality(0),'low');q.sample(10,10000);q.interaction(false,11000);assert.equal(q.quality(11500),'low');assert.equal(q.quality(11800),'medium');});
