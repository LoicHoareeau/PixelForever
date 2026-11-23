import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mageTextures,magePoses} from '../public/game/mage-frames.js';
import {magePose,mageEffect} from '../public/game/mage-art.js';
import {createCombatVfx} from '../public/game/combat-vfx.js';
import {validVisuals} from '../public/game/combat-visuals.js';
import {TrainingCombat} from '../public/game/combat.js';

test('le Mage a huit directions, des cycles dessinés et une marche prioritaire avec les deux armes',()=>{
    assert.equal(Object.keys(magePoses).length,8);
    for(const direction of Object.keys(magePoses)){
        assert.equal(Object.keys(magePoses[direction].frames).length,40);
        for(let n=0;n<8;n++){
            assert.equal(magePose(direction,true,n*7,4).frame,'walk-'+n);
            assert.equal(magePose(direction,true,n*7,4,true).frame,'staff-walk-'+n);
            assert.equal(magePose(direction,false,0,n).frame,'cast-'+n);
            assert.equal(magePose(direction,false,0,n,true,true).frame,'staff-cast-'+n);
            assert.equal(magePose(direction,false,0,n,true,false).frame,'staff-strike-'+n);
        }
        assert.equal(magePose(direction,false,0,8).frame,'cast-7');
    }
    for(const art of Object.values(mageTextures)){
        const file=readFileSync(new URL('../public/game/val-des-saules/mage-v2/'+art.file,import.meta.url));
        assert(art.file.includes(createHash('sha256').update(file).digest('hex').slice(0,12)));
        for(const [x,y,w,h] of Object.values(art.frames))assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.width&&y+h<=art.height);
    }
});

test('les six VFX du Mage possèdent six dessins et sont acceptés par le relais',()=>{
    const sprite={texture:{key:'mage-vfx'},frame:{width:210},visible:true,
        setTexture(key,n){this.texture.key=key;this.frame.name=n;return this;},setFrame(n){this.frame.name=n;return this;},
        setDepth(){return this;},setVisible(v){this.visible=v;return this;},setPosition(){return this;},
        setScale(){return this;},setRotation(){return this;},setAlpha(){return this;}};
    const pool=createCombatVfx({add:{image:()=>sprite},cameras:{main:{worldView:{x:-200,y:-200,right:200,bottom:200}}}},100);
    for(const [row,kind] of ['mage-firebolt','mage-fire-wall','mage-fire-whirl','mage-arcane','mage-frost-nova','mage-ice-armor'].entries()){
        const frames=[];
        for(let phase=0;phase<6;phase++){pool.begin();pool.play(kind,0,0,(phase+.1)/6,.3);frames.push(sprite.frame.name);}
        assert.deepEqual(frames,Array.from({length:6},(_,n)=>row*6+n));assert.equal(sprite.texture.key,'mage-vfx');
    }
    pool.begin();assert.equal(pool.images().length,0);
    assert(validVisuals({sprites:[{id:'fx-0',texture:'mage-vfx',frame:35,x:100,y:100,rotation:0,scaleX:.2,scaleY:.2,originY:.5,alpha:1,depth:100,tint:0xffffff}],graphics:[[],[]]}));
});

test('les nouveaux effets sont réservés au Mage et ses sorts au bâton gardent une incantation à distance',()=>{
    const combat={classKey:'mage',scene:{mageArtReady:true,facing:'east'},ranged:false,spellCooldowns:new Map()};
    assert.equal(mageEffect(combat,'vortex'),'mage-fire-whirl');
    TrainingCombat.prototype.setSlotCooldown.call(combat,'frost_nova',1000,6000);
    assert.equal(combat.attackVisual.ranged,true);
    combat.classKey='warrior';assert.equal(mageEffect(combat,'vortex'),'vortex');
});
