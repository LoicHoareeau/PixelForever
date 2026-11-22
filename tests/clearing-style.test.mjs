import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clearingTrail, clearingGlades,inClearingGlade,paintClearingTrail,clearingScenery} from '../public/game/clearing-layout.js';
import {clearingRoadMask} from '../public/game/clearing-style.js';
import {createClearingAtmosphere,clearingSunbeams} from '../public/game/clearing-atmosphere.js';

test('le sentier est un terrain connecté avec des espaces de chasse et peu de décors',()=>{
const terrain=Array.from({length:50},()=>Array(60).fill(33));terrain[18][22]=34;
paintClearingTrail(terrain);assert.equal(terrain[18][22],34);
for(const [x,y] of clearingTrail)assert.equal(terrain[y][x],32);
for(const [x,y] of clearingGlades)assert(inClearingGlade(x*16,y*16));
assert(clearingScenery().filter(p=>p.collision).length<=3);
const atlas=JSON.parse(readFileSync(new URL('../public/game/val-des-saules/clearing-props-v2.json',import.meta.url)));
assert.deepEqual(Object.keys(atlas.frames),['oak','willow','fir','rock','log','sign','cliff','flowers']);
});

test('la bordure visuelle du chemin reste opaque au centre et jointive entre tuiles de route',()=>{
const terrain=Array.from({length:3},()=>Array(3).fill(32));
const mask=clearingRoadMask(terrain,1,1);
assert.equal(mask[(8*16+8)*4+3],255);assert.equal(mask[(8*16)*4+3],255);
terrain[1][0]=33;
const edge=clearingRoadMask(terrain,1,1);assert.equal(edge[(8*16)*4+3],0);
});

test('les rais sont discrets, les particules sont limitées et le mode réduit reste compatible avec la caméra',()=>{
const calls=[],view={x:0,y:0,right:900,bottom:800};
const layer={setDepth(){return this;},setBlendMode(){return this;},clear(){calls.push(['clear']);return this;},
fillStyle(color,alpha){assert(alpha<=.28);calls.push(['alpha',alpha]);return this;},fillPoints(){calls.push(['ray']);return this;},fillRect(){calls.push(['pollen']);return this;}};
const animate=createClearingAtmosphere({add:{graphics:()=>layer},cameras:{main:{worldView:view}}});
animate(1000,false);assert(calls.filter(c=>c[0]==='pollen').length<=9);
assert(calls.filter(c=>c[0]==='ray').length<=clearingSunbeams.length*3);
calls.length=0;animate(1200,true);assert(!calls.some(c=>c[0]==='pollen'));
calls.length=0;view.x=1024;view.right=1400;animate(1300,true);assert(calls.some(c=>c[0]==='clear'));
});
