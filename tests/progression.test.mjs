import assert from 'node:assert/strict';
import test from 'node:test';
import {
    allocateStat,
    awardVictory,
    computeCharacterStats,
    createInitialProgress,
    regenerateResource,
    rollLoot,
    upgradeSpell,
    xpRequired,
} from '../public/game/progression.js';

const loot = {
    health: { chance: 50 },
    mana: { chance: 30 },
    rare: { chance: 15 },
    epic: { chance: 5 },
};

const warriorRules = {
    classKey: 'warrior',
    level: 1,
    health: 60,
    mana: 20,
    ranged: false,
    basicDamage: 10,
    specialDamage: 18,
    baseManaRegen: 2,
    baseStats: {
        strength: 8,
        intelligence: 4,
        vitality: 8,
        spirit: 5,
    },
    growthStats: {
        strength: 2,
        intelligence: 1,
        vitality: 2,
        spirit: 1,
    },
};

test('les seuils du tirage attribuent exactement un objet', () => {
    const cases = [
        [0, 'health'],
        [0.4999, 'health'],
        [0.5, 'mana'],
        [0.7999, 'mana'],
        [0.8, 'rare'],
        [0.9499, 'rare'],
        [0.95, 'epic'],
        [0.9999, 'epic'],
    ];

    for (const [roll, expected] of cases) {
        assert.equal(rollLoot(loot, () => roll), expected);
    }
});

test('les victoires créditent le butin, le niveau, les points de stats et de sort', () => {
    const progress = createInitialProgress(1);
    progress.items = { health: 0, mana: 0, rare: 0, epic: 0 };

    assert.deepEqual(awardVictory(progress, loot, () => 0.82), {
        item: 'rare',
        levelUp: false,
    });
    assert.equal(progress.xp, 50);
    assert.equal(progress.statPoints, 2);
    assert.equal(progress.spellPoints, 1);

    assert.deepEqual(awardVictory(progress, loot, () => 0.99), {
        item: 'epic',
        levelUp: true,
    });
    assert.equal(progress.level, 2);
    assert.equal(progress.xp, 0);
    assert.equal(xpRequired(progress.level), 150);
    assert.equal(progress.statPoints, 5);
    assert.equal(progress.spellPoints, 2);
    assert.deepEqual(progress.items, { health: 0, mana: 0, rare: 1, epic: 1 });
});

test('la répartition de points de stats et de sorts respecte le solde disponible', () => {
    const progress = createInitialProgress(1);

    assert.equal(allocateStat(progress, 'strength'), true);
    assert.equal(allocateStat(progress, 'vitality'), true);
    assert.equal(allocateStat(progress, 'strength'), false);
    assert.equal(progress.statPoints, 0);
    assert.deepEqual(progress.allocatedStats, {
        strength: 1,
        intelligence: 0,
        vitality: 1,
        spirit: 0,
    });

    assert.equal(upgradeSpell(progress, 'special'), true);
    assert.equal(upgradeSpell(progress, 'basic'), false);
    assert.equal(progress.spellPoints, 0);
    assert.deepEqual(progress.spells, {
        basic: 1,
        special: 2,
    });
});

test('les caractéristiques naturelles, investies et les rangs de sorts augmentent les dégâts et ressources', () => {
    const level1Stats = computeCharacterStats(warriorRules, createInitialProgress(1), 4);
    assert.equal(level1Stats.maxHealth, 60);
    assert.equal(level1Stats.maxMana, 20);
    assert.equal(level1Stats.basicDamage, 14);
    assert.equal(level1Stats.specialDamage, 18);
    assert.equal(level1Stats.manaRegenPerSec, 2);

    const progressed = createInitialProgress(1);
    progressed.level = 2;
    progressed.statPoints = 5;
    progressed.spellPoints = 2;
    allocateStat(progressed, 'strength');
    allocateStat(progressed, 'vitality');
    allocateStat(progressed, 'spirit');
    upgradeSpell(progressed, 'basic');
    upgradeSpell(progressed, 'special');

    const level2Stats = computeCharacterStats(warriorRules, progressed, 4);
    assert.equal(level2Stats.attributes.strength.natural, 2);
    assert.equal(level2Stats.attributes.strength.allocated, 1);
    assert.equal(level2Stats.attributes.strength.total, 11);
    assert.equal(level2Stats.maxHealth, 76);
    assert.equal(level2Stats.maxMana, 28);
    assert.ok(level2Stats.basicDamage > level1Stats.basicDamage);
    assert.ok(level2Stats.specialDamage > level1Stats.specialDamage);
    assert.ok(level2Stats.manaRegenPerSec > level1Stats.manaRegenPerSec);
});

test('la régénération automatique accumule progressivement les fractions sans dépasser le maximum', () => {
    const step1 = regenerateResource(10, 20, 2, 250, 0);
    assert.equal(step1.value, 10);
    assert.equal(step1.gained, 0);
    assert.equal(step1.carry, 0.5);

    const step2 = regenerateResource(step1.value, 20, 2, 250, step1.carry);
    assert.equal(step2.value, 11);
    assert.equal(step2.gained, 1);
    assert.equal(step2.carry, 0);

    const capped = regenerateResource(19, 20, 4, 1000, 0.5);
    assert.equal(capped.value, 20);
    assert.equal(capped.gained, 1);
    assert.equal(capped.carry, 0);
});
