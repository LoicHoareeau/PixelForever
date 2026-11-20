import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingCombat } from '../public/game/combat.js';

test('les notifications de niveau se succèdent sans écraser celles déjà affichées', t => {
    const previous = globalThis.document;
    const toast = { hidden: true, textContent: '' };
    globalThis.document = { getElementById: () => toast };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const callbacks = [];
    const combat = Object.create(TrainingCombat.prototype);
    combat.scene = { time: { delayedCall: (delay, fn) => callbacks.push({ delay, fn }) } };
    combat.showLevelUp(2);
    combat.showLevelUp(1);
    for (let i = 0; i < 3; i++) {
        assert.equal(toast.hidden, false);
        assert.equal(toast.textContent, 'Vous avez prit un niveau');
        const hide = callbacks.shift();
        assert.equal(hide.delay, 3000);
        hide.fn();
        assert.equal(toast.hidden, true);
        const next = callbacks.shift();
        assert.equal(next.delay, 150);
        next.fn();
    }
    assert.equal(toast.hidden, true);
    assert.equal(combat.levelNotifications, 0);
    assert.equal(combat.levelNotificationActive, false);
    assert.equal(callbacks.length, 0);
});
