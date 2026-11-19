import assert from 'node:assert/strict';
import test from 'node:test';
import { awardVictory, rollLoot, xpRequired } from '../public/game/progression.js';

const loot = { health: { chance: 50 }, mana: { chance: 30 }, rare: { chance: 15 }, epic: { chance: 5 } };

test('les seuils du tirage attribuent exactement un objet', () => {
    for (const [roll, expected] of [[0, 'health'], [.4999, 'health'], [.5, 'mana'], [.7999, 'mana'],
        [.8, 'rare'], [.9499, 'rare'], [.95, 'epic'], [.9999, 'epic']]) {
        assert.equal(rollLoot(loot, () => roll), expected);
    }
});

test('les victoires créditent le butin, le niveau et le reste d’XP', () => {
    const progress = { level: 1, xp: 0, items: { health: 0, mana: 0, rare: 0, epic: 0 } };
    assert.deepEqual(awardVictory(progress, loot, () => .82), { item: 'rare', levelUp: false });
    assert.equal(progress.xp, 50);
    assert.deepEqual(awardVictory(progress, loot, () => .99), { item: 'epic', levelUp: true });
    assert.equal(progress.level, 2);
    assert.equal(progress.xp, 0);
    assert.equal(xpRequired(progress.level), 150);
    assert.deepEqual(progress.items, { health: 0, mana: 0, rare: 1, epic: 1 });
});
