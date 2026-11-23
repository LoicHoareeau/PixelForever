import assert from 'node:assert/strict';
import test from 'node:test';
import { xpRequired, killXp, migrateXp, ordinaryStats, levelDamageFactor, skillCost, victoryReward } from '../public/game/balance.js';
import { interpolatePosition } from '../public/game/remote-motion.js';
import { TrainingCombat } from '../public/game/combat.js';

test('les seuils représentent 316 victoires de niveau égal jusqu’au niveau 60', () => {
    let kills = 0;
    for (let level = 1; level < 60; level++) kills += xpRequired(level) / killXp(level);
    assert.equal(kills, 316);
    assert.equal(victoryReward(60, 1), 0);
    assert.equal(victoryReward(30, 33), 455);
    assert.equal(victoryReward(30, 30), 350);
});

test('la conversion préserve le niveau et la fraction d’XP, une seule fois', () => {
    for (const level of [1, 9, 10, 29, 30, 60, 9999]) {
        const old = 100 + 50 * (level - 1);
        const progress = { level, xp: Math.floor(old * .75), items: { rare: 3 } };
        const converted = migrateXp(progress);
        assert.equal(converted.level, level);
        assert.equal(converted.items.rare, 3);
        assert.ok(Math.abs(converted.xp / xpRequired(level) - progress.xp / old) < 1 / xpRequired(level));
        assert.deepEqual(migrateXp(converted), converted);
    }
    assert.equal(migrateXp({ level: 1, xp: 100 }), null);
    assert.equal(migrateXp(null), null);
});

test('les écarts +2 et +3 allongent les combats et les coûts empêchent le spam initial', () => {
    for (const level of [1, 10, 30, 60]) {
        const base = ordinaryStats(level).maxHealth;
        for (const [gap, duration] of [[2, 2.2], [3, 3.2]]) {
            const ratio = ordinaryStats(level + gap).maxHealth / (base * levelDamageFactor(level, level + gap));
            assert.ok(ratio >= duration - .001);
        }
    }
    assert.equal(skillCost(7, 20), 7);
    assert.equal(skillCost(7, 40), 12);
    assert.equal(skillCost(7, 100, .3), 20);
});

test('les déplacements distants sont interpolés sans dépasser la dernière position reçue', () => {
    assert.deepEqual(interpolatePosition({ x: 10, y: 20 }, { x: 30, y: 40 }, .5), { x: 20, y: 30 });
    assert.deepEqual(interpolatePosition({ x: 10, y: 20 }, { x: 30, y: 40 }, 2), { x: 30, y: 40 });
});

test('les potions restaurent 30 % et partagent une recharge sans consommer un refus', () => {
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        health: 20, mana: 20, progress: { items: { health: 2, mana: 2 } },
        rules: { healthRestore: 20, manaRestore: 15 },
        scene: { time: { now: 0 }, position: { x: 0, y: 0 } },
        meters: [{ meter: { max: 100 } }, { meter: { max: 80 } }],
        impacts: [], refreshVitals() {}, refreshInventory() {},
    });
    combat.drinkPotion('health');
    assert.equal(combat.health, 50);
    assert.equal(combat.progress.items.health, 1);
    assert.equal(combat.drinkPotion('mana'), 'Potion en recharge.');
    assert.equal(combat.progress.items.mana, 2);
    combat.scene.time.now = 15000;
    combat.drinkPotion('mana');
    assert.equal(combat.mana, 44);
    assert.equal(combat.progress.items.mana, 1);
});
