import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mageTextures,magePoses} from '../public/game/mage-frames.js';
import {magePose,mageEffect,mageAttackFrame} from '../public/game/mage-art.js';
import {createCombatVfx} from '../public/game/combat-vfx.js';
import {validVisuals} from '../public/game/combat-visuals.js';
import {TrainingCombat} from '../public/game/combat.js';
import {drawEffectsView,drawSpellEffectsView} from '../public/game/combat-renderer.js';

test('un projectile du Mage ne joue pas ses images d’explosion pendant le vol',()=>{
    for(const special of [false,true]){
        const calls=[];
        const combat={classKey:'mage',health:40,progress:{talents:{}},monsters:[],impacts:[],spellEffects:[],
            scene:{mageArtReady:true,position:{x:100,y:100},motionPreference:{matches:false}},
            effect:{clear(){}},vfx:{begin(){},play(...args){calls.push(args);}},drawMonsterAttacks(){},drawSpellEffects(){},
            pending:{special,ranged:true,target:{sprite:{x:220,y:100}},x:107,y:80,angle:0,start:0,castMs:180,end:600}};
        for(const time of [181,220,300,400,500])drawEffectsView(combat,time);
        assert(calls.every(call=>Math.floor(call[3]*6)<(special?3:2)),'une explosion est affichée avant la cible');
        assert(calls.every((call,n)=>!n||call[1]>=calls[n-1][1]),'le projectile doit avancer sans saut arrière');
    }
});

test('l’impact de boule de feu commence sur les images d’impact, sans rejouer le projectile',()=>{
    const calls=[];
    const combat={classKey:'mage',scene:{mageArtReady:true,motionPreference:{matches:false}},
        vfx:{play(...args){calls.push(args);}},spellEffects:[{kind:'fireball_burst',x:200,y:100,start:0,duration:500}]};
    for(const time of [0,150,499])drawSpellEffectsView(combat,time);
    assert(calls.every(call=>call[0]==='mage-firebolt'&&Math.floor(call[3]*6)>=3));
});

test('le Mage a huit directions, des cycles dessinés et une marche prioritaire avec les deux armes',()=>{
    assert.equal(Object.keys(magePoses).length,8);
    for(const direction of Object.keys(magePoses)){
        assert.equal(Object.keys(magePoses[direction].frames).length,80);
        for(const pose of Object.values(magePoses[direction].frames))assert(pose.origin>=0&&pose.origin<=1,'le point d’ancrage doit rester sur le personnage');
        for(let n=0;n<16;n++){
            assert.equal(magePose(direction,true,n*3.5,4).frame,'walk-'+n);
            assert.equal(magePose(direction,true,n*3.5,4,true).frame,'staff-walk-'+n);
            assert.equal(magePose(direction,false,0,n).frame,'cast-'+n);
            assert.equal(magePose(direction,false,0,n,true,true).frame,'staff-cast-'+n);
            assert.equal(magePose(direction,false,0,n,true,false).frame,'staff-strike-'+n);
        }
        assert.equal(magePose(direction,false,0,16).frame,'cast-15');
    }
    for(const art of Object.values(mageTextures)){
        const file=readFileSync(new URL('../public/game/val-des-saules/mage-v2/'+art.file,import.meta.url));
        assert(art.file.includes(createHash('sha256').update(file).digest('hex').slice(0,12)));
        for(const [x,y,w,h] of Object.values(art.frames))assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.width&&y+h<=art.height);
    }
});

test('le Mage déroule seize poses selon le temps réel, en local et avec une attaque distante',()=>{
    for(const ranged of [false,true]){
        const attack={start:1000,end:2000,castMs:1000,ranged};
        const frames=[];
        for(let n=0;n<16;n++)frames.push(mageAttackFrame(attack,n<8?1000+n*125:2000+(n-8)*210/8));
        assert.deepEqual(frames,Array.from({length:16},(_,n)=>n));
        assert.equal(mageAttackFrame(attack,2210),-1);
    }
    assert.equal(mageAttackFrame(null,1000),-1);
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
