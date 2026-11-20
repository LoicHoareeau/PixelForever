import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingCombat } from '../public/game/combat.js';
import { createInitialProgress } from '../public/game/progression.js';

function battle(weapon = 'rare', targetX = 240) {
    const casterNeighbor = { name: 'Près du mage', isAlive: true, sprite: { x: 8, y: 0 } };
    const target = { name: 'Cible', isAlive: true, sprite: { x: targetX, y: 0 } };
    const targetNeighbor = { name: 'Près de la cible', isAlive: true, sprite: { x: targetX + 20, y: 0 } };
    const instance = Object.create(TrainingCombat.prototype);
    const hits = [];
    Object.assign(instance, {
        rules: { classKey: 'mage', range: 7.5, specialRange: 15, ranged: true, resourceName: 'Mana' },
        classKey: 'mage', ranged: true, progress: { ...createInitialProgress(), weapon },
        stats: { basicDamage: 12, specialDamage: 22 }, mana: 40, tileSize: 16,
        scene: { position: { x: 0, y: 0 }, facing: 'east', face() {} },
        monsters: [casterNeighbor, target, targetNeighbor], spellCooldowns: new Map(), impacts: [],
        getActiveTarget: () => target, refreshVitals() {}, tell() {},
        applyDamageToMonster: monster => hits.push(monster.name),
    });
    return { instance, target, hits, targetNeighbor };
}

for (const slot of ['fire_wall', 'fire_whirl', 'frost_nova', 'arcane_blast']) {
    test(`${slot} reste à distance et vise la cible, quelle que soit l'arme du mage`, () => {
        for (const weapon of ['starter', 'rare', 'epic', null]) {
            const { instance, hits, targetNeighbor } = battle(weapon);
            instance.castTalentSpell({ slot, name: slot, manaCost: 7 }, 100);
            assert.deepEqual(hits, slot === 'arcane_blast' ? ['Cible'] : ['Cible', 'Près de la cible'], String(weapon));
            assert.equal(instance.mana, 33);
            assert.equal(instance.attackVisual.ranged, true);
            if (slot === 'frost_nova') assert.equal(targetNeighbor.slowUntil, 2600);
        }
    });

    test(`${slot} sans cible ou hors de portée ne dépense rien`, () => {
        for (const unavailable of ['missing', 'dead', 'distant']) {
            const { instance, target, hits } = battle('rare', unavailable === 'distant' ? 265 : 240);
            if (unavailable === 'missing') instance.getActiveTarget = () => null;
            if (unavailable === 'dead') target.isAlive = false;
            instance.castTalentSpell({ slot, name: slot, manaCost: 7 }, 100);
            assert.deepEqual(hits, []);
            assert.equal(instance.mana, 40);
            assert.equal(instance.spellCooldowns.size, 0);
        }
    });
}

test('Taillade conserve sa zone de mêlée autour du guerrier', () => {
    const { instance, hits } = battle();
    instance.ranged = false;
    instance.classKey = 'warrior';
    instance.castTalentSpell({ slot: 'cleave', name: 'Taillade', manaCost: 7 }, 100);
    assert.deepEqual(hits, ['Près du mage']);
});
