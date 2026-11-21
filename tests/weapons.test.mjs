import assert from 'node:assert/strict';
import test from 'node:test';
import { basicWeaponProfile, createInitialProgress, loadProgress, awardVictory, investTalent } from '../public/game/progression.js';
import { TrainingCombat } from '../public/game/combat.js';

const rules = { classKey: 'mage', range: 7.5, specialRange: 15, ranged: true, wandDamageMultiplier: 0.5 };
const stats = { maxMana: 40, basicDamage: 20, bonusRangeTiles: .5 };

test('la baguette tire de loin, le bâton et les mains nues frappent au contact', () => {
    const progress = createInitialProgress(10);
    for (const weapon of ['starter', 'epic']) {
        progress.weapon = weapon;
        assert.deepEqual(basicWeaponProfile(rules, progress, stats, 16), { ranged: true, range: 128, damage: 10 });
    }
    for (const weapon of ['rare', null]) {
        progress.weapon = weapon;
        assert.deepEqual(basicWeaponProfile(rules, progress, stats, 16), { ranged: false, range: 40, damage: 20 });
    }
});

test('les deux talents de baguette respectent les prérequis et ne renforcent ni bâton ni guerrier', () => {
    const progress = createInitialProgress(10);
    assert.equal(investTalent(progress, 'mage', 'm_wand_focus'), false);
    for (let i = 0; i < 5; i++) assert.equal(investTalent(progress, 'mage', 'm_wand_mastery'), true);
    for (let i = 0; i < 3; i++) assert.equal(investTalent(progress, 'mage', 'm_wand_focus'), true);
    assert.equal(basicWeaponProfile(rules, progress, stats, 16).damage, 21);
    progress.weapon = 'rare';
    assert.equal(basicWeaponProfile(rules, progress, stats, 16).damage, 20);
    progress.weapon = 'epic';
    assert.equal(basicWeaponProfile({ ...rules, classKey: 'warrior' }, progress, stats, 16).damage, 20);
});

test('un bâton rate si la cible quitte le contact, une baguette conserve son projectile', () => {
    const combat = Object.create(TrainingCombat.prototype);
    const target = { isAlive: true };
    combat.distanceTo = () => 40;
    combat.tell = () => {};
    combat.applyDamageToMonster = () => combat.hits++;
    combat.tileSize = 16;
    combat.hits = 0;
    combat.resolveAttack({ target, ranged: false, range: 24 }, 100);
    assert.equal(combat.hits, 0);
    combat.resolveAttack({ target, ranged: true, range: 80 }, 100);
    assert.equal(combat.hits, 1);
    target.isAlive = false;
    combat.resolveAttack({ target, ranged: true, range: 80 }, 101);
    assert.equal(combat.hits, 1);
});

test('le bâton préserve la portée des sorts, leur coût en mana et leur recharge', () => {
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        rules: { ...rules, specialManaCost: 10, cooldownMs: 800, specialName: 'Boule de feu' },
        stats: { ...stats, specialDamage: 30 }, progress: { ...createInitialProgress(3), weapon: 'rare' },
        health: 50, mana: 20, readyAt: 0, tileSize: 16, ranged: true, classKey: 'mage',
        scene: { position: { x: 0, y: 0 }, facing: 'east', face() {} },
        targetHud: {}, refreshTargetHud() {}, refreshVitals() {}, setSlotCooldown() {}, tell() {},
        getActiveTarget: () => ({ name: 'Sanglier', isAlive: true, sprite: { x: 240, y: 0 } }), distanceTo: () => 240,
    });
    combat.attack('basic', 100);
    assert.equal(combat.pending, undefined);
    combat.attack('special', 100);
    assert.equal(combat.pending.ranged, true);
    assert.equal(combat.pending.range, 248);
    assert.equal(combat.mana, 8);
    const first = combat.pending;
    combat.attack('special', 110);
    assert.equal(combat.pending, first);
    assert.equal(combat.mana, 8);
    combat.pending = null;
    combat.mana = 0;
    combat.attack('special', 1000);
    assert.equal(combat.pending, null);
    combat.mana = 20;
    combat.distanceTo = () => 249;
    combat.attack('special', 1000);
    assert.equal(combat.pending, null);
    assert.equal(combat.mana, 20);
    assert.equal(combat.readyAt, 900);
});

test('les anciennes sauvegardes gardent le butin et acceptent les nouveaux matériaux', () => {
    const saved = createInitialProgress(3);
    delete saved.items.scale;
    delete saved.items.heart;
    saved.items.rare = 2;
    saved.weapon = 'rare';
    const previous = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
    try {
        const restored = loadProgress('legacy');
        assert.equal(restored.items.rare, 2);
        assert.equal(restored.weapon, 'rare');
        assert.equal(restored.items.scale, 0);
        assert.equal(restored.items.heart, 0);
        awardVictory(restored, { heart: { chance: 100 } }, () => 0, 0);
        assert.equal(restored.items.heart, 1);
    } finally { globalThis.localStorage = previous; }
});

test('les matériaux et les armes absentes ne peuvent pas être équipés', () => {
    const combat = Object.create(TrainingCombat.prototype);
    combat.progress = createInitialProgress();
    combat.progress.items.scale = 1;
    combat.toggleWeapon('scale');
    assert.equal(combat.progress.weapon, 'starter');
    combat.toggleWeapon('rare');
    assert.equal(combat.progress.weapon, 'starter');
});
