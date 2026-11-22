import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rogueTextures, roguePoses } from '../public/game/rogue-frames.js';
import { roguePose } from '../public/game/rogue-art.js';
import { createCombatVfx } from '../public/game/combat-vfx.js';
import { classEffect, applyTechnique } from '../public/game/class-combat.js';
import { validVisuals } from '../public/game/combat-visuals.js';
import { drawMeleeView } from '../public/game/combat-renderer.js';

test('le Voleur a huit vues dessinées, huit pas et huit frappes sans bloquer la marche', () => {
    assert.equal(Object.keys(roguePoses).length,8);
    assert.equal(new Set(Object.values(roguePoses).map(p=>p.frames['strike-0'].texture)).size,8);
    for(const direction of Object.keys(roguePoses)) for(let n=0;n<8;n++) {
        assert.equal(roguePose(direction,true,n*7,4).frame,'walk-'+n);
        assert.equal(roguePose(direction,false,0,n).frame,'strike-'+n);
        assert.equal(roguePose(direction,false,0,8).frame,'strike-7');
    }
    for(const art of Object.values(rogueTextures)) {
        const file=readFileSync(new URL('../public/game/val-des-saules/rogue-v2/'+art.file,import.meta.url));
        assert(art.file.includes(createHash('sha256').update(file).digest('hex').slice(0,12)));
        for(const [x,y,w,h] of Object.values(art.frames)) assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=art.width&&y+h<=art.height);
    }
});

test('les quatre VFX du Voleur passent par quatre dessins distincts puis disparaissent du pool', () => {
    const sprite={texture:{key:'rogue-vfx'},frame:{width:320},visible:true,
        setTexture(key,n){this.texture.key=key;this.frame.name=n;return this;},setFrame(n){this.frame.name=n;return this;},
        setDepth(){return this;},setVisible(v){this.visible=v;return this;},setPosition(){return this;},
        setScale(){return this;},setRotation(){return this;},setAlpha(){return this;}};
    const pool=createCombatVfx({add:{image:()=>sprite},cameras:{main:{worldView:{x:-200,y:-200,right:200,bottom:200}}}},100);
    for(const [row,kind] of ['rogue-slash','rogue-flurry','rogue-venom','rogue-shadow'].entries()) {
        const frames=[];
        for(const progress of [0,.26,.51,.99]) {pool.begin();pool.play(kind,0,0,progress,.3);frames.push(sprite.frame.name);}
        assert.deepEqual(frames,[row*4,row*4+1,row*4+2,row*4+3]);assert.equal(sprite.texture.key,'rogue-vfx');
    }
    pool.begin();assert.equal(pool.images().length,0);
});

test('le venin et le pas d’ombre restent cosmétiques et leurs images sont acceptées par le relais', () => {
    const position={x:100,y:100};
    const combat={classKey:'rogue',scene:{rogueArtReady:true,position,facing:'east',move(dx,dy){position.x+=dx;position.y+=dy;}},
        spellEffects:[],progress:{talents:{}},monsters:[]};
    classEffect(combat,'venom',{x:150,y:100},0);
    assert.equal(combat.spellEffects[0].row,'rogue-venom');assert.equal(combat.rogueVenomUntil,900);
    combat.spellEffects=[];
    applyTechnique(combat,{retreat:true,vfx:'dagger'},null,0,'Pas de l’ombre',100);
    assert.equal(position.x,60);assert.equal(combat.spellEffects.length,3);
    assert(combat.spellEffects.every(fx=>fx.row==='rogue-shadow'&&fx.duration===400));
    assert.deepEqual(combat.spellEffects.map(fx=>fx.x),[100,80,60]);
    const sprite={id:'fx-0',texture:'rogue-vfx',frame:15,x:100,y:100,rotation:0,scaleX:.1,scaleY:.1,originY:.5,alpha:1,depth:100,tint:0xffffff};
    assert.equal(validVisuals({sprites:[sprite],graphics:[[],[]]}),true);
});

test('l’entaille suit la progression de la frappe et reste fixe en mode de mouvements réduits', () => {
    const calls=[];
    const combat={scene:{position:{x:10,y:20},rogueArtReady:true,motionPreference:{matches:false}},vfx:{play(...a){calls.push(a);}}};
    const attack={weaponStyle:'daggers',armed:true,angle:0};
    for(const progress of [0,.5,.99]) drawMeleeView(combat,attack,progress,false);
    assert(calls.every(c=>c[0]==='rogue-slash'));
    assert(calls[0][3]<calls[1][3]&&calls[1][3]<calls[2][3]);
    combat.scene.motionPreference.matches=true;calls.length=0;
    drawMeleeView(combat,attack,.2,false);drawMeleeView(combat,attack,.8,false);
    assert.equal(calls[0][3],calls[1][3]);
});
