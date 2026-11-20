import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TrainingCombat } from '../public/game/combat.js';
import { equippedWeaponStyles, bowGrip } from '../public/game/equipped-art.js';
import { drawEffectsView } from '../public/game/combat-renderer.js';
import { createInitialProgress } from '../public/game/progression.js';

function combat(weapon = 'starter') {
    const instance = Object.create(TrainingCombat.prototype);
    Object.assign(instance, {
        rules: { classKey: 'mage', range: 7.5, specialRange: 15, ranged: true, cooldownMs: 500, specialManaCost: 10, wandDamageMultiplier: 0.5 },
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
    assert.equal(instance.pending.range, 120);
    assert.equal(instance.pending.damage, 6);
    assert.equal(instance.cancelCastOnMove(), false);
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
        columns: 168, rows: 120, tileSize: 16, equippedWeaponStyles,
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

test('les armes intégrées suivent toutes les poses et disparaissent à mains nues sans ancien objet flottant', () => {
    let sceneClass;
    const Phaser = { Scene: class {}, AUTO: 0, Scale: { RESIZE: 0, CENTER_BOTH: 0 }, Game: class {
        constructor(config) { sceneClass = config.scene; }
    } };
    const source = readFileSync(new URL('../public/game/world.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInNewContext(source, {
        window: { Phaser, innerWidth: 1280, innerHeight: 720 },
        document: { getElementById: () => ({ dataset: {} }), querySelector: () => ({}) },
        columns: 256, rows: 252, tileSize: 16, equippedWeaponStyles,
    });
    const directions = ['east','south-east','south','south-west','west','north-west','north','north-east'];
    for (const [skin, style] of Object.entries({ hunter: 'bow', rogue: 'daggers', warlock: 'shadow' })) {
        const scene = Object.create(sceneClass.prototype);
        let gesture = null;
        let visible;
        let offhandVisible;
        let texture;
        let frame;
        let origin;
        Object.assign(scene, {
            position: { x: 0, y: 0 }, skin, lastWalkAt: -Infinity, walkDistance: 0,
            poseSheet: skin + '-poses', attackSheet: skin + '-attack', walkSheet: skin + '-walk',
            combat: { weaponStyle: style, attackPose: () => gesture },
            weaponSprite: { setVisible(value) { visible = value; } },
            offHandSprite: { setVisible(value) { offhandVisible = value; } },
            avatar: { texture: { key: '' }, frame: {}, setTexture(key, value) { texture = key; frame = value; return this; },
                setOrigin(_x, y) { origin = y; return this; }, setFlipX() { return this; }, setPosition() { return this; }, setDepth() {} },
            avatarShadow: { setPosition() {} },
            renderArmament() { assert.fail('Les anciens objets séparés ne doivent plus être dessinés pour ces classes.'); },
        });
        for (const [row, facing] of directions.entries()) {
            scene.facing = facing;
            scene.lastWalkAt = -Infinity;
            scene.renderAvatar(100);
            assert.equal(texture, skin + '-idle-equipped');
            assert.equal(frame, row);
            assert.equal(origin, 56 / 64);
            scene.lastWalkAt = 100;
            scene.renderAvatar(100);
            assert.equal(texture, skin + '-walk-equipped');
            assert.equal(frame, row * 8);
            for (let pose = 0; pose < 9; pose++) {
                gesture = { frame: pose, pose: 'release', attack: { facing, weaponStyle: style } };
                scene.renderAvatar(100);
                assert.equal(texture, skin + '-attack-equipped');
                assert.equal(frame, row * 9 + pose);
            }
            gesture = null;
        }
        scene.combat.weaponStyle = 'fist';
        scene.lastWalkAt = -Infinity;
        scene.renderAvatar(100);
        assert.equal(texture, skin + '-poses');
        assert.equal(visible, false);
        assert.equal(offhandVisible, false);
    }
});

test('la flèche quitte la poignée de l’arc à la décoche, sans second projectile pendant la tension', () => {
    const directions = ['east','south-east','south','south-west','west','north-west','north','north-east'];
    const anchors = [[12,-24],[8,-19],[0,-17],[-8,-19],[-12,-24],[-8,-29],[0,-31],[8,-29]];
    for (const [index, facing] of directions.entries()) assert.deepEqual(bowGrip({x:0,y:0},facing), {x:anchors[index][0],y:anchors[index][1]});
    const effects = [];
    const combat = {
        scene: { position: { x:100,y:100 }, motionPreference: { matches:false } },
        monsters: [], impacts: [], spellEffects: [], effect: { clear() {} },
        drawMonsterAttacks() {}, drawSpellEffects() {},
        vfx: { begin() {}, play(...args) { effects.push(args); } },
        pending: { ranged:true, projectile:'arrow', facing:'east', angle:0, start:0, castMs:180, end:400,
            target: {sprite:{x:200,y:100}}, x:0,y:0 },
    };
    drawEffectsView(combat,179);
    assert.equal(effects.length,0);
    drawEffectsView(combat,180);
    assert.deepEqual(effects[0].slice(0,3), ['arrow',112,76]);
    drawEffectsView(combat,200);
    assert.ok(effects[1][1] > 112);
});
