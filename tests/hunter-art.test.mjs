import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hunterTextures, hunterPoses } from '../public/game/hunter-frames.js';
import { hunterPose, applyHunterArt } from '../public/game/hunter-art.js';
import { validVisuals } from '../public/game/combat-visuals.js';

test('le relais multijoueur accepte les VFX du Chasseur sans autoriser de texture arbitraire', () => {
    const sprite={id:'fx-0',texture:'hunter-vfx',frame:8,x:100,y:100,rotation:0,scaleX:.1,scaleY:.1,originY:.5,alpha:1,depth:100,tint:0xffffff};
    assert.equal(validVisuals({sprites:[sprite],graphics:[[],[]]}),true);
    assert.equal(validVisuals({sprites:[{...sprite,texture:'unknown'}],graphics:[[],[]]}),false);
});

test('huit orientations indépendantes contiennent chacune huit pas et huit poses de tir', () => {
    assert.equal(Object.keys(hunterPoses).length, 8);
    assert.equal(new Set(Object.values(hunterPoses).map(p => p.frames['shot-0'].texture)).size, 8);
    for (const [direction, art] of Object.entries(hunterPoses)) {
        const walk = new Set(), shot = new Set();
        for (let frame = 0; frame < 8; frame++) {
            walk.add(hunterPose(direction, true, frame * 7).frame);
            shot.add(hunterPose(direction, false, 0, frame).frame);
        }
        assert.equal(walk.size, 8); assert.equal(shot.size, 8);
        assert.equal(hunterPose(direction, false, 0, 8).frame, 'shot-7');
        assert.equal(hunterPose(direction, false, 0).frame, 'shot-0');
        assert.ok(art.height > 100);
    }
});

test('le Chasseur continue ses huit pas pendant un tir puis reprend sa pose de tir à l’arrêt', () => {
    for (const direction of Object.keys(hunterPoses)) {
        for (let attack = 0; attack < 9; attack++) {
            for (let step = 0; step < 8; step++) {
                assert.equal(hunterPose(direction, true, step * 7, attack).frame, 'walk-' + step);
            }
            assert.equal(hunterPose(direction, false, 0, attack).frame, 'shot-' + Math.min(7, attack));
        }
    }
});

test('les rectangles sont dans leurs atlas natifs et leurs URL correspondent aux fichiers publiés', () => {
    for (const art of Object.values(hunterTextures)) {
        const file = readFileSync(new URL('../public/game/val-des-saules/hunter-v2/' + art.file, import.meta.url));
        assert.ok(art.file.includes(createHash('sha256').update(file).digest('hex').slice(0, 12)));
        for (const [x, y, w, h] of Object.values(art.frames)) {
            assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= art.width && y + h <= art.height);
        }
    }
});

test('les pieds sont ancrés au sol sans miroir et les VFX respectent la réduction des animations', () => {
    const calls = [], effects = [];
    const sprite = { x:10, y:20, setTexture(...v) { calls.push(['texture', ...v]); return this; },
        setOrigin(...v) { calls.push(['origin', ...v]); return this; }, setScale(v) { calls.push(['scale',v]); return this; },
        setFlipX(v) { assert.equal(v, false); return this; } };
    const scene = { motionPreference:{matches:false}, combat:{vfx:{play(...v){effects.push(v);}}} };
    applyHunterArt(scene, sprite, 'hunter', 'north', true, 14);
    assert.equal(calls.find(c=>c[0]==='origin')[2], 1);
    assert.equal(effects[0][0], 'hunter-dust');
    effects.length=0; scene.motionPreference.matches=true;
    applyHunterArt(scene, sprite, 'hunter', 'north', false, 0, 4);
    assert.equal(effects.length, 0);
    applyHunterArt(scene, sprite, 'noe', 'east', false, 0);
    assert.deepEqual(calls.at(-1), ['scale',1]);
});
