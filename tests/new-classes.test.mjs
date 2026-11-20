import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyTechnique, updateClassCombat } from '../public/game/class-combat.js';
import { TrainingCombat } from '../public/game/combat.js';
import { allocateStat, basicWeaponProfile, computeCharacterStats, createInitialProgress, findTalent, getUnlockedActiveSpells, loadProgress } from '../public/game/progression.js';
import { zones, tileSize } from '../public/game/exploration.js';

function combat(classKey = 'warlock') {
    const actor = {
        x: 0, y: 0, setDepth() { return this; }, setOrigin() { return this; }, setFrame() { return this; },
        setFlipX() { return this; }, setScale() { return this; },
        setPosition(x, y) { Object.assign(this, { x, y }); return this; }, destroy() { this.destroyed = true; },
    };
    const target = {
        sprite: { x: 80, y: 0 }, health: 500, isAlive: true, slowUntil: 0,
        pursue() { this.alert = true; },
    };
    const instance = Object.create(TrainingCombat.prototype);
    Object.assign(instance, {
        classKey, health: 30, mana: 50, tileSize, progress: createInitialProgress(12), ranged: classKey !== 'warrior' && classKey !== 'rogue',
        rules: { classKey, weaponBonus: 4, range: 7, resourceName: 'Mana' },
        stats: { basicDamage: 30, specialDamage: 100, maxHealth: 100, maxMana: 60 },
        scene: { position: { x: 0, y: 0 }, time: { now: 0 }, facing: 'east', face() {},
            add: { image: () => ({ ...actor }), rectangle: () => ({ ...actor }) } },
        monsters: [target], getActiveTarget: () => target, spellCooldowns: new Map(), spellEffects: [],
        tell() {}, refreshVitals() {}, refreshProgress() {}, refreshInventory() {},
        applyDamageToMonster(monster, damage) {
            monster.health -= damage;
            if (monster.health <= 0) monster.isAlive = false;
        },
    });
    return { instance, target };
}

test('dextérité et défense ont leurs effets et leurs classes propres', () => {
    const stats = { basicDamage: 10, specialDamage: 18, health: 50, mana: 25, range: 8 };
    for (const classKey of ['rogue', 'hunter']) {
        const progress = createInitialProgress(5);
        const rules = { ...stats, classKey, ranged: classKey === 'hunter' };
        const baseline = computeCharacterStats(rules, progress);
        assert.equal(allocateStat(progress, 'defense', classKey), false);
        assert.equal(allocateStat(progress, 'dexterity', classKey), true);
        assert.equal(computeCharacterStats(rules, progress).basicDamage, baseline.basicDamage + 2);
        assert.equal(basicWeaponProfile(rules, progress, baseline, tileSize).ranged, classKey === 'hunter');
    }
    const progress = createInitialProgress(5);
    assert.equal(allocateStat(progress, 'defense', 'warrior'), true);
    assert.ok(computeCharacterStats({ ...stats, classKey: 'warrior' }, progress).physicalMitigation > 0);
    assert.equal(allocateStat(progress, 'dexterity', 'warlock'), false);
});

test('la hache s’équipe, se sauvegarde et disparaît quand le Guerrier repasse aux poings', () => {
    const { instance } = combat('warrior');
    const before = globalThis.localStorage;
    const saved = new Map();
    globalThis.localStorage = { setItem: (key, value) => saved.set(key, value), getItem: key => saved.get(key) };
    try {
        instance.progressKey = 'warrior';
        instance.toggleWeapon('axe');
        assert.equal(instance.weaponStyle, 'axe');
        assert.equal(instance.basicName, 'Coup de hache');
        assert.equal(instance.weaponBonus, 4);
        assert.equal(loadProgress('warrior', 1, null, 'warrior').weapon, 'axe');
        instance.toggleWeapon('axe');
        assert.equal(instance.weaponStyle, 'fist');
        assert.equal(instance.weaponBonus, 0);
        assert.equal(combat('hunter').instance.hasWeapon('axe'), false);
    } finally {
        if (before) globalThis.localStorage = before;
        else delete globalThis.localStorage;
    }
});

test('les dégâts périodiques indépendants coexistent, un nouvel effet du même sort remplace son échéance', () => {
    const { instance, target } = combat();
    const dot = { dot: { ticks: 3, scale: .18 }, vfx: 'curse' };
    applyTechnique(instance, dot, target, 100, 'Corruption', 0, 0, 'corruption');
    applyTechnique(instance, dot, target, 50, 'Agonie', 0, 0, 'agony');
    applyTechnique(instance, dot, target, 100, 'Corruption', 700, 0, 'corruption');
    updateClassCombat(instance, 1000, 16);
    assert.equal(target.health, 491);
    updateClassCombat(instance, 1700, 16);
    assert.equal(target.health, 473);
    target.isAlive = false;
    updateClassCombat(instance, 2000, 16);
    assert.equal(instance.periodicEffects.size, 0);
});

test('Drain de vie pulse quatre fois et interrompt les pulsations restantes au déplacement', () => {
    const { instance, target } = combat();
    const { talent } = findTalent('warlock', 'drain_life');
    instance.castTalentSpell(talent, 0);
    assert.equal(instance.pending.end, 2000);
    instance.updateClassCast(499);
    assert.equal(target.health, 500);
    instance.updateClassCast(500);
    assert.equal(target.health, 475);
    assert.equal(instance.health, 41);
    instance.updateClassCast(2000);
    assert.equal(target.health, 400);
    assert.equal(instance.pending, null);
    assert.equal(instance.mana, 37);
    assert.ok(instance.spellCooldowns.has('drain_life'));

    instance.spellCooldowns.clear();
    instance.castTalentSpell(talent, 10000);
    instance.updateClassCast(10500);
    instance.scene.time.now = 10501;
    assert.equal(instance.cancelCastOnMove(), true);
    assert.equal(instance.pending, null);
    assert.equal(target.health, 375);
    assert.equal(instance.mana, 24);
});

test('Immolation conserve la ressource et sa recharge si la cible est trop loin ou si le mana manque', () => {
    const { instance, target } = combat();
    const { talent } = findTalent('warlock', 'immolate');
    target.sprite.x = 150;
    instance.castTalentSpell(talent, 0);
    assert.equal(instance.pending, undefined);
    assert.equal(instance.mana, 50);
    assert.equal(instance.spellCooldowns.size, 0);
    target.sprite.x = 80;
    instance.mana = 10;
    instance.castTalentSpell(talent, 0);
    assert.equal(instance.pending, undefined);
    assert.equal(instance.mana, 10);
    assert.equal(instance.spellCooldowns.size, 0);
    instance.mana = 50;
    instance.castTalentSpell(talent, 0);
    assert.equal(instance.pending.end, 1000);
    instance.updateClassCast(1000);
    assert.equal(target.health, 450);
    assert.equal(instance.pending, null);
    assert.equal(instance.mana, 39);
    instance.castTalentSpell(talent, 1001);
    assert.equal(instance.pending, null);
    assert.equal(instance.mana, 39);
});

test('les invocations sont exclusives, le diablotin tire à distance et le marcheur récupère l’aggro', () => {
    const { instance, target } = combat();
    assert.equal(getUnlockedActiveSpells(createInitialProgress(), 'warlock')[0].slot, 'summon_imp');
    applyTechnique(instance, { summon: 'imp', vfx: 'summon' }, null, 0, 'Diablotin', 0);
    const imp = instance.familiar;
    imp.target = target;
    imp.actor.setPosition(12, 0);
    updateClassCombat(instance, 1000, 16);
    assert.equal(instance.spellEffects.at(-1).kind, 'familiar_bolt');
    assert.equal(target.health, 500);
    updateClassCombat(instance, 1240, 16);
    assert.ok(target.health < 500);
    applyTechnique(instance, { summon: 'void', vfx: 'summon' }, null, 0, 'Marcheur', 1241);
    assert.equal(imp.actor.destroyed, true);
    const zone = zones.clearing ?? zones.boar;
    target.template = { zone };
    const x = (zone.left + 1) * tileSize;
    const y = (zone.top + 1) * tileSize;
    Object.assign(instance.scene.position, { x, y });
    Object.assign(target.sprite, { x: x + 12, y });
    instance.familiar.target = target;
    instance.familiar.actor.setPosition(x, y);
    assert.equal(instance.guardianFor(target), instance.familiar);
    target.isBoss = true;
    assert.equal(instance.guardianFor(target), null);
});

test('les quatre atlas jouables ont huit directions et toutes leurs images de marche et d’attaque', () => {
    for (const skin of ['warrior', 'warlock', 'rogue', 'hunter']) {
        for (const [file, size, columns] of [['walk', 48, 8], ['attack', 64, 9]]) {
            const png = readFileSync(new URL(`../public/game/val-des-saules/${skin}/${file}.png`, import.meta.url));
            assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size * columns, size * 8]);
        }
    }
});
