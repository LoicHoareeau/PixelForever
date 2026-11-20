import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { vfxFrame, vfxFrameSize, vfxFrames } from '../public/game/combat-vfx.js';
import { TrainingCombat } from '../public/game/combat.js';
import { columns, rows, tileSize, zones } from '../public/game/exploration.js';
import { combatLights, lightingViewport, writeAmbientColor } from '../public/game/world-lighting.js';

const readColor = (x, y) => {
    const result = new Uint8Array(3);
    writeAmbientColor(x, y, tileSize, result, new Float32Array(7));
    return [...result];
};

test('la lumière ambiante distingue les sept secteurs et varie en douceur sur les routes', () => {
    const samples = Object.values(zones)
        .filter((zone) => !['imp', 'hound', 'breach_lord'].some((key) => zone === zones[key]))
        .map((zone) => readColor((zone.left + zone.right) * tileSize / 2, (zone.top + zone.bottom) * tileSize / 2));
    assert.equal(new Set(samples.map((color) => color.join(','))).size, 7);
    assert.ok(samples.flat().every((channel) => channel >= 130));
    assert.ok(samples[0][0] > samples[1][0], 'la clairière reste lumineuse');
    assert.ok(samples[1][2] > samples[1][0], 'la brume du cimetière est froide');
    assert.ok(samples[3][0] > samples[3][2], 'les terres dévastées sont chaudes');

    let previous = readColor(117 * tileSize, 215.5 * tileSize);
    for (let x = 117 * tileSize + 4; x <= 142 * tileSize; x += 4) {
        const color = readColor(x, 215.5 * tileSize);
        assert.ok(color.every((channel, index) => Math.abs(channel - previous[index]) < 14));
        previous = color;
    }
});

test('le masque couvre la caméra sans dépasser les bornes de la carte', () => {
    const width = columns * tileSize;
    const height = rows * tileSize;
    assert.deepEqual(lightingViewport({ x: -20, y: 0, width: 900, height: 660 }, width, height),
        { left: 0, top: 0, right: 1024, bottom: 768 });
    assert.deepEqual(lightingViewport({ x: width - 384, y: height - 232, width: 384, height: 232 }, width, height),
        { left: width - 512, top: height - 384, right: width, bottom: height });
});

test('les sorts illuminent leur impact et la Rage conserve un halo stable en mouvement réduit', () => {
    const player = { x: 28, y: 32 };
    const rage = { isBoss: true, isAlive: true, phase: 3, sprite: { x: 110, y: 40 } };
    const combat = {
        pending: { ranged: true, interruptible: true, end: 500 },
        monsters: [rage],
        spellEffects: [
            { kind: 'arcane_beam', x: 30, y: 35, targetX: 100, targetY: 90, start: 100, duration: 400 },
            { kind: 'frost_nova', x: 20, y: 22, start: 0, duration: 150 },
            { kind: 'heavy_slash', x: 20, y: 55, start: 100, duration: 400 },
        ],
    };
    const lights = combatLights(player, combat, 200, false);
    assert.deepEqual(lights.map(({ x, y }) => [x, y]), [[28, 22], [28, 19], [100, 90], [110, 18]]);
    assert.ok(combatLights(player, combat, 340, false)[2].glow < lights[2].glow);
    assert.deepEqual(combatLights(player, combat, 200, true), combatLights(player, combat, 340, true));
    rage.phase = 2;
    assert.equal(combatLights(player, combat, 500, false).length, 1);
});

test('les cycles animés des sorts et du boss ont une rangée distincte dans l’atlas', () => {
    const png = readFileSync(new URL('../public/game/val-des-saules/combat-vfx.png', import.meta.url));
    const kinds = ['firebolt', 'arcane', 'frostbolt', 'vortex', 'frost', 'arcane_burst', 'seismic', 'flame', 'magma', 'fire_burst', 'slash', 'rune', 'rage_aura', 'rage_ignition', 'mist', 'marsh_wisp', 'pollen', 'snow', 'ash', 'cinders', 'steel_slash', 'gilded_spin', 'arcane_stream', 'ward', 'rift_glints'];
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)],
        [vfxFrameSize * vfxFrames, vfxFrameSize * kinds.length]);
    for (const [row, kind] of kinds.entries()) {
        assert.equal(vfxFrame(kind, -.1), row * vfxFrames);
        assert.equal(vfxFrame(kind, .5), row * vfxFrames + vfxFrames / 2);
        assert.equal(vfxFrame(kind, 1.1), (row + 1) * vfxFrames - 1);
    }
});

test('les VFX de classes occupent un atlas séparé compatible avec une texture de 4096 px', () => {
    const png = readFileSync(new URL('../public/game/val-des-saules/class-vfx.png', import.meta.url));
    const kinds = ['axe_swing', 'dagger', 'arrow', 'arrow_hit', 'arrow_volley', 'trap', 'curse', 'summon',
        'shadow_bolt', 'chaos', 'imp_flare', 'bulwark', 'venom', 'drain'];
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [2048, 1792]);
    for (const [row, kind] of kinds.entries()) assert.equal(vfxFrame(kind, 0), row * vfxFrames);
});

test('la Taillade joue autour du Guerrier et la Déflagration relie la cible au lanceur', () => {
    const combat = Object.create(TrainingCombat.prototype);
    const draws = [];
    Object.assign(combat, {
        scene: { motionPreference: { matches: false } },
        vfx: { play(...args) { draws.push(args); } },
        spellEffects: [
            { kind: 'cleave', x: 36, y: 62, radius: 38, start: 0, duration: 500 },
            { kind: 'arcane_beam', x: 25, y: 35, targetX: 167, targetY: 141, start: 0, duration: 500 },
        ],
    });
    combat.drawSpellEffects(160);
    assert.deepEqual(draws.map(([kind]) => kind), ['gilded_spin', 'arcane_stream', 'arcane_burst']);
    assert.deepEqual(draws[0].slice(1, 3), [36, 64]);
    assert.deepEqual(draws[1].slice(1, 3), [96, 88]);
    assert.ok(draws[1][7] > 1, 'le rayon atteint les cibles lointaines');
    assert.deepEqual(draws[2].slice(1, 3), [167, 141]);
});
