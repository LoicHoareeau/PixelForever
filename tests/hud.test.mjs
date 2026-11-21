import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHudSettings, swapHudSlots, fitHudPoint, defaultHudLayout } from '../public/game/hud-settings.js';
import { HudControls } from '../public/game/hud-controls.js';

test('réglages ATH : bornes, sauvegarde invalide et permutation complète par classe', () => {
    const ids = ['basic', 'special', 'talent-0'];
    const settings = normalizeHudSettings({ scale: 50, opacity: -.5, order: ['special', 'special', 'basic'], positions: { player: { x: -2, y: 7 }, target: { x: Infinity, y: 1 }, unknown: { x: .2, y: .4 } } }, ids);
    assert.equal(settings.scale, 1.3);
    assert.equal(settings.opacity, .7);
    assert.deepEqual(settings.order, ids);
    assert.deepEqual(settings.positions, { player: { x: 0, y: 1 } });
    assert.deepEqual(normalizeHudSettings({ order: ['talent-0', 'basic', 'special'] }, ids).order, ['talent-0', 'basic', 'special']);
    assert.equal(normalizeHudSettings({ scale: NaN }, ids).scale, 1);
    assert.deepEqual(fitHudPoint({ x: 900, y: 800 }, 200, 100, 800, 600), { x: 596, y: 496 });
    assert.deepEqual(fitHudPoint({ x: -10, y: -50 }, 400, 800, 320, 500), { x: 4, y: 24 });
});

test('le changement de case change la touche sans déplacer les identifiants de recharge', () => {
    const original = ['basic', 'special', 'talent-0'];
    const order = swapHudSlots(original, 'special', 'talent-0');
    assert.deepEqual(original, ['basic', 'special', 'talent-0']);
    assert.deepEqual(order, ['basic', 'talent-0', 'special']);
    const hud = Object.create(HudControls.prototype);
    hud.settings = { order };
    assert.equal(hud.attackForCode('Digit2'), 'talent-0');
    assert.equal(hud.attackForCode('Digit3'), 'special');
    assert.equal(hud.attackForCode('Digit0'), undefined);
    assert.deepEqual(swapHudSlots(order, 'unknown', 'basic'), order);
});

test('les cadres par défaut ne se recouvrent pas et la barre reste centrée aux trois tailles', () => {
    const sizes = Object.fromEntries(Object.entries({ player: [368, 108], target: [320, 90], quick: [416, 85], actions: [812, 108], chat: [336, 250], quest: [272, 110], feedback: [400, 30] }).map(([id, [width, height]]) => [id, { width, height }]));
    for (const width of [760, 1024, 1280, 1920]) for (const scale of [.7, 1, 1.3]) {
        const layout = defaultHudLayout(width, 960, sizes, scale);
        const rect = name => {
            const s = Math.min(scale, (width - 12) / sizes[name].width);
            const r = sizes[name];
            const p = fitHudPoint(layout[name], r.width * s, r.height * s, width, 960);
            return { ...p, w: r.width * s, h: r.height * s };
        };
        for (const [a, b] of [['player', 'target'], ['player', 'quick'], ['target', 'quick']]) {
            const x = rect(a), y = rect(b);
            assert.ok(x.x + x.w <= y.x || y.x + y.w <= x.x || x.y + x.h <= y.y || y.y + y.h <= x.y, `${a}/${b}, ${width}px, ${scale}`);
        }
        const bar = rect('actions');
        assert.ok(Math.abs(bar.x + bar.w / 2 - width / 2) < 1);
        assert.ok(rect('chat').y + rect('chat').h < bar.y);
    }
});

test('le glissement exige un maintien, ne lance pas le sort et annule les glissements interrompus', () => {
    const hud = Object.create(HudControls.prototype);
    const originalTimeout = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const originalDocument = globalThis.document;
    let callback, created = 0, swap, released = 0;
    const ghost = { classList: { add() {} }, style: {}, removeAttribute() {}, querySelectorAll: () => [], setAttribute() {}, remove() {} };
    const button = { dataset: { attack: 'special' }, cloneNode: () => { created++; return ghost; } };
    const target = { dataset: { slotId: 'talent-0' }, classList: { remove() {}, toggle() {} } };
    const cell = { dataset: { slotId: 'special' }, querySelector: () => button, setPointerCapture() {}, classList: { add() {}, remove() {}, toggle() {} } };
    hud.cells = [cell, target]; hud.releaseKeys = () => released++;
    hud.swapSlots = (a, b) => { swap = [a, b]; };
    globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 350); callback = fn; return 1; };
    globalThis.clearTimeout = () => { callback = null; };
    globalThis.document = { body: { append() {} }, elementFromPoint: () => ({ closest: () => target }) };
    const event = { button: 0, pointerId: 1, clientX: 120, clientY: 200, target: { closest: () => cell }, preventDefault() {} };
    try {
        hud.holdSlot(event);
        hud.dropSlot(event);
        assert.equal(created, 0);
        assert.equal(swap, undefined);
        hud.holdSlot(event); callback();
        assert.equal(created, 1); assert.equal(released, 1);
        hud.moveSlot(event); hud.dropSlot(event);
        assert.deepEqual(swap, ['special', 'talent-0']);
        assert.equal(hud.dragSlot, null);
        assert.ok(hud.suppressUntil > Date.now());
        hud.holdSlot(event); hud.cancelDrag();
        assert.equal(callback, null);
        assert.equal(hud.pointer, null);
    } finally {
        globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; globalThis.document = originalDocument;
    }
});
