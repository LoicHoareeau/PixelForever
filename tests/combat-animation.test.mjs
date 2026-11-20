import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TrainingCombat } from '../public/game/combat.js';
import { createInitialProgress } from '../public/game/progression.js';

function combat(weapon = 'starter') {
    const instance = Object.create(TrainingCombat.prototype);
    Object.assign(instance, {
        rules: { classKey: 'mage', range: 5, ranged: true, cooldownMs: 500, specialManaCost: 10 },
        progress: { ...createInitialProgress(), weapon },
        stats: { basicDamage: 12, specialDamage: 22 },
        classKey: 'mage', ranged: true, tileSize: 16, health: 40, mana: 40, readyAt: 0,
        scene: { position: { x: 0, y: 0 }, facing: 'east', face() {} },
        targetHud: {}, refreshTargetHud() {}, refreshVitals() {}, setSlotCooldown() {}, tell() {},
        getActiveTarget: () => ({ name: 'Sanglier', isAlive: true, sprite: { x: 40, y: 0 } }), distanceTo: () => 40,
    });
    return instance;
}

test('la baguette de départ prépare un projectile sans consommer de mana', () => {
    const instance = combat();
    instance.attack('basic', 0);
    assert.equal(instance.pending.ranged, true);
    assert.equal(instance.pending.range, 80);
    assert.equal(instance.mana, 40);
});

test('le cycle complet d’incantation reste lisible à 30 images par seconde', () => {
    const instance = combat();
    instance.attack('basic', 0);
    const frames = new Set();
    for (let now = 0; now < 600; now += 1000 / 30) {
        const pose = instance.attackPose(now);
        if (pose) frames.add(pose.frame);
    }
    assert.deepEqual([...frames], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('un sort de talent du mage joue aussi une incantation avec un bâton équipé', () => {
    const instance = combat('rare');
    instance.spellCooldowns = new Map();
    instance.impacts = [];
    instance.monsters = [{ isAlive: true, sprite: { x: 40, y: 0 } }];
    instance.applyDamageToMonster = () => {};
    instance.setSlotCooldown = TrainingCombat.prototype.setSlotCooldown;
    instance.castTalentSpell({ slot: 'frost_nova', name: 'Nova de givre', manaCost: 7 }, 0);
    assert.equal(instance.attackPose(50)?.attack.ranged, true);
    assert.equal(instance.mana, 33);
});

test('la frappe de contact conserve son impact et montre ses neuf images à 30 FPS', () => {
    const instance = combat('rare');
    instance.distanceTo = () => 16;
    instance.attack('basic', 0);
    assert.equal(instance.pending.end, 140);
    assert.equal(instance.pending.ranged, false);
    const frames = new Set();
    for (let now = 0; now < 600; now += 1000 / 30) {
        const pose = instance.attackPose(now);
        if (pose) frames.add(pose.frame);
    }
    assert.deepEqual([...frames], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('le rendu du mage à distance ne joue pas la planche de frappe à la lanterne', () => {
    let sceneClass;
    const Phaser = { Scene: class {}, AUTO: 0, Scale: { RESIZE: 0, CENTER_BOTH: 0 }, Game: class {
        constructor(config) { sceneClass = config.scene; }
    } };
    const source = readFileSync(new URL('../public/game/world.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInNewContext(source, {
        window: { Phaser, innerWidth: 1280, innerHeight: 720 },
        document: { getElementById: () => ({ dataset: {} }), querySelector: () => ({}) },
        columns: 168, rows: 120, tileSize: 16,
    });
    const scene = Object.create(sceneClass.prototype);
    const instance = combat();
    instance.attack('basic', 0);
    let texture;
    Object.assign(scene, {
        position: { x: 0, y: 0 }, facing: 'east', skin: 'noe', lastWalkAt: -Infinity,
        poseSheet: 'noe-poses', attackSheet: 'noe-attack', combat: instance,
        avatar: { texture: { key: '' }, frame: {}, setTexture(key) { texture = key; return this; },
            setOrigin() { return this; }, setFlipX() { return this; }, setPosition() { return this; }, setDepth() {} },
        avatarShadow: { setPosition() {} },
    });
    scene.renderAvatar(40);
    assert.equal(texture, 'noe-poses');
});
