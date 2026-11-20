import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CameraFeel } from '../public/game/camera-feel.js';
import { TrainingCombat } from '../public/game/combat.js';
import { buildTerrain, tileSize, zones } from '../public/game/exploration.js';
import { Monster, monsterTemplates } from '../public/game/monsters.js';
import { monsterArt, monsterAtlasColumns, monsterFrames } from '../public/game/monster-art.js';
import { basicWeaponProfile, computeCharacterStats, createInitialProgress, findTalent } from '../public/game/progression.js';

const clearing = JSON.parse(readFileSync(new URL('../public/game/val-des-saules/terrain.json', import.meta.url)));
const terrain = buildTerrain(clearing);
const canStand = () => true;

function display(texture = '') {
    return new Proxy({ visible: true, texture: { key: texture }, frame: { name: 0 } }, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'setPosition') [target.x, target.y] = args;
                if (key === 'setVisible') target.visible = args[0];
                if (key === 'setTexture') { target.texture = { key: args[0] }; target.frame = { name: args[1] }; }
                if (key === 'setFrame') target.frame = { name: args[0] };
                return target.proxy;
            };
        },
    });
}

const mockScene = {
    terrain,
    canStand,
    motionPreference: { matches: false },
    add: Object.fromEntries(['image', 'ellipse', 'rectangle', 'text'].map((type) => [
        type,
        (x, y, texture) => { const object = display(texture); object.proxy = object; return object; },
    ])),
};

test('CameraFeel accumule le trauma, décroît à zéro et respecte préférences réduites', () => {
    const cam = new CameraFeel();
    cam.triggerTier('medium');
    cam.triggerTier('medium');
    assert.ok(cam.trauma > 0.8);

    const frame = cam.update(16, false);
    assert.equal(frame.active, true);
    assert.ok(frame.offsetX !== 0 || frame.offsetY !== 0);

    for (let i = 0; i < 15; i++) {
        cam.update(50, false);
    }
    const rest = cam.update(50, false);
    assert.deepEqual(rest, { offsetX: 0, offsetY: 0, active: false });

    cam.triggerTier('large');
    assert.deepEqual(cam.update(16, true), { offsetX: 0, offsetY: 0, active: false });
});

test('Malakor (Boss N.40) dispose d’un atlas 128px valide, de 2 phases et de compétences télégraphiées esquivables', () => {
    const png = readFileSync(new URL('../public/game/val-des-saules/monsters/breach_lord.png', import.meta.url));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const { frame } = monsterArt.breach_lord;
    assert.equal(frame, 128);
    assert.deepEqual(
        [png.readUInt32BE(16), png.readUInt32BE(20)],
        [frame * monsterAtlasColumns, (frame * monsterFrames * 8) / monsterAtlasColumns],
    );

    const boss = new Monster(mockScene, 'breach_lord', tileSize, 0);
    assert.equal(boss.isBoss, true);
    assert.equal(boss.level, 40);
    assert.equal(boss.maxHealth, 18500);
    assert.equal(boss.xpReward, 6500);
    assert.equal(boss.phase, 1);

    const player = { x: boss.sprite.x + 18, y: boss.sprite.y };
    boss.pursue();
    boss.startAttack(player, 100);
    assert.equal(boss.attackDamage(), 295);

    boss.attackEndsAt = 0;
    boss.startAttack(player, 2000);
    assert.equal(boss.attackVisual.special, 'seismic_ring');
    assert.equal(boss.canAttack(player), true);
    const escaped = { x: boss.sprite.x + 110, y: boss.sprite.y };
    assert.equal(boss.canAttack(escaped), false);

    boss.health = Math.floor(boss.maxHealth * 0.5);
    assert.equal(boss.checkBossPhase(), true);
    assert.equal(boss.phase, 2);
    boss.attackEndsAt = 0;
    boss.attackCounter = 2;
    boss.startAttack({ x: boss.sprite.x + 120, y: boss.sprite.y }, 4000);
    assert.equal(boss.attackVisual.special, 'magma_rift');
    assert.equal(boss.canAttack({ x: boss.sprite.x + 90, y: boss.sprite.y }), true);
    assert.equal(boss.canAttack({ x: boss.sprite.x + 90, y: boss.sprite.y + 40 }), false);
});

test('le rééquilibrage du Mage étend la portée à 7,5 cases, réduit sa régénération et impose le cast de 1 s annulable', () => {
    const mageRules = {
        classKey: 'mage',
        health: 40,
        mana: 40,
        range: 7.5,
        ranged: true,
        basicDamage: 8,
        specialDamage: 22,
        specialManaCost: 18,
        specialCastMs: 1000,
        cooldownMs: 500,
        baseManaRegen: 1.0,
        specialName: 'Boule de feu',
        resourceName: 'Mana',
    };
    const progress = createInitialProgress(10);
    const stats = computeCharacterStats(mageRules, progress, 0);
    const wand = basicWeaponProfile(mageRules, progress, stats, 16);
    assert.equal(wand.ranged, true);
    assert.equal(wand.range, 120);

    progress.weapon = 'rare';
    const staff = basicWeaponProfile(mageRules, progress, stats, 16);
    assert.equal(staff.ranged, false);
    assert.equal(staff.range, 24);

    assert.equal(computeCharacterStats(mageRules, createInitialProgress(1), 0).manaRegenPerSec, 1);
    assert.equal(stats.manaRegenPerSec, 5);
    assert.equal(findTalent('mage', 'm_fire_wall').talent.castTimeMs, 1000);
    assert.equal(findTalent('mage', 'm_fire_whirl').talent.castTimeMs, 1000);
    assert.ok(findTalent('mage', 'm_fire_wall').talent.manaCost >= 22);
    assert.ok(findTalent('mage', 'm_fire_whirl').talent.manaCost >= 28);

    const combat = Object.create(TrainingCombat.prototype);
    const target = { name: monsterTemplates.boar.label, level: 1, isAlive: true, sprite: { x: 100, y: 0 } };
    Object.assign(combat, {
        rules: mageRules,
        classKey: 'mage',
        ranged: true,
        progress,
        stats,
        tileSize: 16,
        health: 100,
        mana: 50,
        readyAt: 0,
        meters: [{ meter: { max: 100 } }, { meter: { max: 100 } }],
        spellCooldowns: new Map(),
        impacts: [],
        spellEffects: [],
        damageNumbers: [],
        monsters: [target],
        scene: {
            position: { x: 0, y: 0 },
            time: { now: 200 },
            facing: 'east',
            face() {},
        },
        targetHud: { dataset: {} },
        refreshTargetHud() {},
        refreshVitals() {},
        setSlotCooldown: TrainingCombat.prototype.setSlotCooldown,
        refreshCastBar() {},
        tell() {},
        getActiveTarget: () => target,
        distanceTo: () => 100,
    });

    combat.attack('special', 100);
    assert.equal(combat.mana, 32);
    assert.equal(combat.pending.castMs, 1000);
    assert.equal(combat.cancelCastOnMove(), true);
    assert.equal(combat.mana, 50);
    assert.equal(combat.pending, null);

    // Mur de feu utilise bien 1 000 ms d'incantation sans déclenchement instantané
    const fireWall = findTalent('mage', 'm_fire_wall').talent;
    combat.castTalentSpell(fireWall, 300);
    assert.equal(combat.pending.kind, 'talentCast');
    assert.equal(combat.pending.end, 1300);
    assert.equal(combat.mana, 28);
});
