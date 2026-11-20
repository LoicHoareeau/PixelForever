import assert from 'node:assert/strict';
import test from 'node:test';
import {
    allocateStat,
    awardVictory,
    chooseSpecialization,
    computeCharacterStats,
    createInitialProgress,
    getUnlockedActiveSpells,
    investTalent,
    loadProgress,
    regenerateResource,
    resetTalents,
    rollLoot,
    upgradeSpell,
    xpRequired,
} from '../public/game/progression.js';
import { TrainingCombat } from '../public/game/combat.js';

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
    assert.equal(progress.statPoints, 0);
    assert.equal(progress.spellPoints, 0);

    assert.deepEqual(awardVictory(progress, loot, () => 0.99), {
        item: 'epic',
        levelUp: true,
    });
    assert.equal(progress.level, 2);
    assert.equal(progress.xp, 0);
    assert.equal(xpRequired(progress.level), 150);
    assert.equal(progress.statPoints, 3);
    assert.equal(progress.spellPoints, 1);
    assert.deepEqual(progress.items, { health: 0, mana: 0, rare: 1, epic: 1 });
});

test('la répartition de points de stats respecte le solde et les rangs de base sont retirés', () => {
    const progress = createInitialProgress(2);

    assert.equal(allocateStat(progress, 'strength'), true);
    assert.equal(allocateStat(progress, 'vitality'), true);
    assert.equal(allocateStat(progress, 'spirit'), true);
    assert.equal(allocateStat(progress, 'strength'), false);
    assert.equal(progress.statPoints, 0);
    assert.deepEqual(progress.allocatedStats, {
        strength: 1,
        dexterity: 0,
        intelligence: 0,
        spirit: 1,
        vitality: 1,
        defense: 0,
    });

    assert.equal(upgradeSpell(progress, 'special'), false);
    assert.equal(upgradeSpell(progress, 'basic'), false);
    assert.equal(progress.spellPoints, 1);
});

test('les caractéristiques naturelles, l’Esprit et la spécialisation N.10 agissent sans régén issue de l’Intelligence', () => {
    const level1Stats = computeCharacterStats(warriorRules, createInitialProgress(1), 4);
    assert.equal(level1Stats.maxHealth, 60);
    assert.equal(level1Stats.maxMana, 20);
    assert.equal(level1Stats.basicDamage, 14);
    assert.equal(level1Stats.specialDamage, 18);
    assert.equal(level1Stats.manaRegenPerSec, 2);

    const progressed = createInitialProgress(1);
    progressed.level = 2;
    progressed.statPoints = 3;
    allocateStat(progressed, 'strength');
    allocateStat(progressed, 'vitality');
    allocateStat(progressed, 'spirit');

    const level2Stats = computeCharacterStats(warriorRules, progressed, 4);
    assert.equal(level2Stats.attributes.strength.natural, 2);
    assert.equal(level2Stats.attributes.strength.allocated, 1);
    assert.equal(level2Stats.attributes.strength.total, 11);
    assert.equal(level2Stats.maxHealth, 75);
    assert.equal(level2Stats.maxMana, 28);
    assert.ok(level2Stats.basicDamage > level1Stats.basicDamage);
    assert.ok(level2Stats.specialDamage > level1Stats.specialDamage);
    assert.ok(level2Stats.manaRegenPerSec > level1Stats.manaRegenPerSec);

    // L'Intelligence ne donne aucune régénération de mana ni pour le Guerrier ni pour le Mage
    const mageBase = createInitialProgress(2);
    const mageIntel = createInitialProgress(2);
    allocateStat(mageIntel, 'intelligence');
    allocateStat(mageIntel, 'intelligence');
    const mageRules = { classKey: 'mage', health: 40, mana: 40, ranged: true, basicDamage: 8, specialDamage: 22, baseManaRegen: 0.4 };
    assert.equal(
        computeCharacterStats(mageRules, mageIntel, 0).manaRegenPerSec,
        computeCharacterStats(mageRules, mageBase, 0).manaRegenPerSec,
    );

    // Spécialisation Guerrier N.10 (Rempart) : +3 Défense + croissance niveau 10 sans réécrire les niveaux 2..9
    const war10 = createInitialProgress(10);
    const beforeSpec = computeCharacterStats({ classKey: 'warrior', health: 60, mana: 20, basicDamage: 10, specialDamage: 18 }, war10, 0);
    assert.equal(chooseSpecialization(war10, 'warrior', 'bulwark'), true);
    const afterSpec = computeCharacterStats({ classKey: 'warrior', health: 60, mana: 20, basicDamage: 10, specialDamage: 18 }, war10, 0);
    assert.equal(afterSpec.attributes.defense.naturalRaw, 5.8);
    assert.equal(afterSpec.attributes.defense.specBonus, 3);
    assert.equal(afterSpec.attributes.defense.total, 15);
    assert.ok(afterSpec.physicalMitigation > beforeSpec.physicalMitigation);
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

test('l’arbre de talents respecte les prérequis, débloque les sorts actifs et permet la réinitialisation', () => {
    const progress = createInitialProgress(4);

    // Impossible de prendre Taillade sans 2 points dans Armes / Lame affûtée
    assert.equal(investTalent(progress, 'warrior', 'w_cleave'), false);

    // Investir 2 points dans Lame affûtée débloque Taillade
    assert.equal(investTalent(progress, 'warrior', 'w_sharp_blade'), true);
    assert.equal(investTalent(progress, 'warrior', 'w_sharp_blade'), true);
    assert.equal(investTalent(progress, 'warrior', 'w_cleave'), true);
    assert.equal(progress.spellPoints, 0);

    const unlocked = getUnlockedActiveSpells(progress, 'warrior');
    assert.equal(unlocked.length, 1);
    assert.equal(unlocked[0].slot, 'cleave');

    const stats = computeCharacterStats(warriorRules, progress, 4);
    const baseline = computeCharacterStats(warriorRules, createInitialProgress(4), 4);
    assert.equal(stats.basicDamage, baseline.basicDamage + 4);

    const refunded = resetTalents(progress);
    assert.equal(refunded, 3);
    assert.equal(progress.spellPoints, 3);
    assert.equal(getUnlockedActiveSpells(progress, 'warrior').length, 0);
});

test('au niveau 1 aucun point, talent ou rang de sort ne peut être dépensé', () => {
    const progress = createInitialProgress();
    assert.equal(progress.level, 1);
    assert.equal(progress.statPoints, 0);
    assert.equal(progress.spellPoints, 0);
    progress.statPoints = 2;
    progress.spellPoints = 1;
    assert.equal(allocateStat(progress, 'strength'), false);
    assert.equal(upgradeSpell(progress, 'basic'), false);
    assert.equal(investTalent(progress, 'warrior', 'w_sharp_blade'), false);
});

test('le niveau de la base est restauré sans cache et ses bonus restent ceux d’un personnage de ce niveau', t => {
    const previous = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
    const progress = loadProgress('character', 4, { level: 4, xp: 27 });
    assert.equal(progress.level, 4);
    assert.equal(progress.xp, 27);
    assert.equal(progress.statPoints, 9);
    assert.equal(progress.spellPoints, 3);
    const stats = computeCharacterStats({ ...warriorRules, level: 4 }, progress, 4);
    assert.equal(stats.attributes.strength.natural, 6);
});

test('les anciens points gratuits sont retirés sans perdre le niveau, l’XP ou les objets', t => {
    const previous = globalThis.localStorage;
    const old = createInitialProgress();
    old.xp = 50;
    old.items.health = 7;
    old.allocatedStats.strength = 2;
    old.talents.w_sharp_blade = 1;
    globalThis.localStorage = { getItem: () => JSON.stringify(old) };
    t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
    const progress = loadProgress('character', 1, { level: 1, xp: 0 });
    assert.equal(progress.xp, 50);
    assert.equal(progress.items.health, 7);
    assert.equal(progress.allocatedStats.strength, 0);
    assert.deepEqual(progress.talents, {});
    assert.equal(progress.statPoints, 0);
    assert.equal(progress.spellPoints, 0);
    const advanced = loadProgress('character', 4, { level: 4, xp: 27 });
    assert.equal(advanced.level, 4);
    assert.equal(advanced.xp, 27);
    assert.equal(advanced.items.health, 7);
    assert.equal(advanced.statPoints, 7);
    assert.equal(advanced.spellPoints, 2);

    // Remboursement automatique des anciens rangs de sorts de base tout en conservant les talents
    const legacyRanks = createInitialProgress(4);
    legacyRanks.spells = { basic: 2, special: 2 };
    legacyRanks.talents = { w_sharp_blade: 1 };
    globalThis.localStorage = { getItem: () => JSON.stringify(legacyRanks) };
    const migrated = loadProgress('character', 4, { level: 4, xp: 0 }, 'warrior');
    assert.equal(migrated.spellPoints, 2);
    assert.equal(migrated.talents.w_sharp_blade, 1);
    assert.deepEqual(migrated.spells, { basic: 1, special: 1 });
});

test('la montée de niveau affiche le bandeau dédié « Vous avez prit un niveau » sans être écrasée par tell()', () => {
    const banner = { textContent: '', hidden: true };
    const status = { textContent: '' };
    const combat = Object.create(TrainingCombat.prototype);
    combat.levelUpBanner = banner;
    combat.status = status;
    combat.showLevelUpBanner(500);
    combat.tell('Sanglier vaincu · +50 XP');
    assert.equal(banner.hidden, false);
    assert.equal(banner.textContent, 'Vous avez prit un niveau');
    assert.equal(status.textContent, 'Sanglier vaincu · +50 XP');
});
