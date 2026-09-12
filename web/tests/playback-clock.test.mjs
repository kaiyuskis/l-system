import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackClock} from '../src/playback-clock.ts';
test('pause freezes fractional age and resume excludes paused wall time',()=>{const c=new PlaybackClock(0,1000);assert.equal(c.advance(375),.375);c.pause();assert.equal(c.advance(5000),.375);c.resume(6000);assert.equal(c.advance(6125),.5);assert.equal(c.advance(6375,2),1);});
test('speed changes preserve position and clamp final generation',()=>{const c=new PlaybackClock(0,1000);assert.equal(c.advance(100,.5),.05);assert.equal(c.advance(200,4),.45);assert.equal(c.advance(900,4),1);});
