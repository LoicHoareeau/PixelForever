import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inZone, zones } from '../public/game/exploration.js';
import {
    cemeteryLanterns,
    cemeteryLights,
    cemeteryMoonbeams,
    createCemeteryAtmosphere,
} from '../public/game/cemetery-art.js';

test('le Cimetière dispose de ressources HD 2× et d’un atlas de décors complet sans perte', () => {
    const atlas = JSON.parse(readFileSync(new URL('../public/game/val-des-saules/cemetery-props-v2.json', import.meta.url)));
    assert.deepEqual(
        Object.keys(atlas.frames),
        ['mausoleum', 'tombstone', 'celticGrave', 'deadTree', 'deadWillow', 'ironGate', 'pillar', 'lantern'],
    );
    for (const { frame } of Object.values(atlas.frames)) {
        assert.ok(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0);
        assert.ok(frame.x + frame.w <= atlas.meta.size.w);
        assert.ok(frame.y + frame.h <= atlas.meta.size.h);
    }

    const groundV2 = readFileSync(new URL('../public/game/val-des-saules/cemetery-ground-v2.webp', import.meta.url));
    assert.equal(groundV2.toString('ascii', 0, 4), 'RIFF');
    assert.equal(groundV2.toString('ascii', 8, 12), 'WEBP');
    assert.equal(groundV2.toString('ascii', 12, 16), 'VP8L');
    const bits = groundV2.readUInt32LE(21);
    const gw = (bits & 0x3fff) + 1;
    const gh = ((bits >>> 14) & 0x3fff) + 1;
    assert.deepEqual([gw, gh], [768, 384]);
});

test('les lumières du Cimetière couvrent cryptes, lanternes et halos dans le secteur', () => {
    const lights = cemeteryLights(16);
    assert.ok(lights.length >= 17);
    assert.ok(lights.some((light) => light.color === 0x5fe8dc));
    assert.ok(lights.some((light) => light.color === 0xffad52));
    assert.ok(lights.every((light) => (
        inZone({
            left: zones.skeleton.left - 4,
            top: zones.skeleton.top - 4,
            right: zones.skeleton.right + 4,
            bottom: zones.skeleton.bottom + 16,
        }, light.x, light.y + 16)
    )));
    assert.equal(cemeteryLanterns.length, 8);
});

test('l’ambiance et les VFX du Cimetière bornent leurs alphas et respectent le mouvement réduit', () => {
    const calls = [];
    const view = { x: 1200, y: 760, right: 2100, bottom: 1650 };
    const layer = {
        setDepth() { return this; },
        setBlendMode() { return this; },
        clear() { calls.push(['clear']); return this; },
        fillStyle(_color, alpha) {
            assert.ok(alpha <= 0.28, `alpha VFX excessif: ${alpha}`);
            calls.push(['alpha', alpha]);
            return this;
        },
        fillPoints() { calls.push(['beam']); return this; },
        fillEllipse() { calls.push(['glow']); return this; },
        fillRect() { calls.push(['particle']); return this; },
    };
    const animate = createCemeteryAtmosphere({ add: { graphics: () => layer }, cameras: { main: { worldView: view } } }, 16);

    animate(1000, false);
    assert.ok(calls.some((c) => c[0] === 'beam'));
    assert.ok(calls.filter((c) => c[0] === 'beam').length <= cemeteryMoonbeams.length * 3);
    assert.ok(calls.some((c) => c[0] === 'glow'));
    assert.ok(calls.some((c) => c[0] === 'particle'));

    calls.length = 0;
    animate(1200, true);
    assert.ok(!calls.some((c) => c[0] === 'particle'), 'aucun feu follet ou étincelle animé en mouvement réduit');

    calls.length = 0;
    view.x = 100;
    view.right = 700;
    animate(1400, false);
    assert.ok(calls.some((c) => c[0] === 'clear'));
    assert.ok(!calls.some((c) => c[0] === 'beam'));
});
