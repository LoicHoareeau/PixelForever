import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { armorBonuses, armorItems, awardArmor, toggleArmor } from '../public/game/armor.js';
import {
    createMalakorTrial, isMalakorWaveHit, malakorAtlasColumns, malakorEmberMs, malakorFirstTrialDelay,
    malakorFrameSize, malakorRageProgress, malakorSurgeMs, malakorWave, malakorWaveImpactMs,
} from '../public/game/malakor.js';
import { CameraFeel } from '../public/game/camera-feel.js';
import { TrainingCombat } from '../public/game/combat.js';
import { buildTerrain, tileSize, zones } from '../public/game/exploration.js';
import { Monster, monsterTemplates } from '../public/game/monsters.js';
import { monsterArt, monsterAtlasColumns, monsterFrames } from '../public/game/monster-art.js';
import { basicWeaponProfile, computeCharacterStats, createInitialProgress, findTalent, loadProgress } from '../public/game/progression.js';

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

test('Malakor (Boss N.40) dispose d’un atlas 128px valide, de trois phases et de compétences télégraphiées esquivables', () => {
    const png = readFileSync(new URL('../public/game/val-des-saules/monsters/breach_lord.png', import.meta.url));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const { frame } = monsterArt.breach_lord;
    assert.equal(frame, 128);
    assert.deepEqual(
        [png.readUInt32BE(16), png.readUInt32BE(20)],
        [frame * monsterAtlasColumns, (frame * monsterFrames * 8) / monsterAtlasColumns],
    );
    for (const [name, rows] of [['malakor-actions', 20], ['malakor-rage-actions', 20], ['malakor-rage', 16]]) {
        const atlas = readFileSync(new URL(`../public/game/val-des-saules/monsters/${name}.png`, import.meta.url));
        assert.equal(atlas.toString('ascii', 12, 16), 'IHDR');
        assert.deepEqual([atlas.readUInt32BE(16), atlas.readUInt32BE(20)],
            [malakorFrameSize * malakorAtlasColumns, malakorFrameSize * rows]);
    }

    const boss = new Monster(mockScene, 'breach_lord', tileSize, 0);
    assert.equal(boss.isBoss, true);
    assert.equal(boss.level, 40);
    assert.equal(boss.maxHealth, 36000);
    assert.equal(boss.xpReward, 6500);
    assert.equal(boss.phase, 1);

    const player = { x: boss.sprite.x + 18, y: boss.sprite.y };
    boss.pursue();
    boss.startAttack(player, 100);
    assert.equal(boss.attackDamage(), 295);
    boss.renderPose(100);
    assert.equal(boss.sprite.texture.key, 'malakor-actions');
    assert.equal(boss.canAttack({ x: boss.sprite.x - 20, y: boss.sprite.y }), false);

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
    boss.health = 9000;
    assert.equal(boss.checkBossPhase(), true);
    assert.equal(boss.phase, 3);
    boss.rageStartedAt = 4100;
    boss.renderPose(4400);
    assert.equal(boss.sprite.texture.key, 'malakor-rage-actions');
    assert.equal(boss.checkBossPhase(), false);
});

test('les vagues de Rage alternent d’axe, conservent des bandes sûres et bloquent les attaques sans coût', () => {
    const trial = createMalakorTrial(3, 5000);
    const first = malakorWave(trial, trial.beginsAt);
    const second = malakorWave(trial, trial.beginsAt + 1320 + malakorWaveImpactMs);
    assert.equal(first.vertical, true);
    assert.equal(second.vertical, false);
    assert.ok(first.danger.length > 4);
    const [dangerStart, dangerEnd] = first.danger[1];
    const player = { x: (dangerStart + dangerEnd) / 2, y: (zones.breach_lord.top + 12) * tileSize };
    assert.equal(isMalakorWaveHit(first, player), true);
    player.x = dangerEnd + 2;
    assert.equal(isMalakorWaveHit(first, player), false);
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, { scene: { position: player }, health: 100, mana: 40, readyAt: 11,
        monsters: [{ isBoss: true, trial, template: { zone: zones.breach_lord } }], tell() {} });
    combat.attack('special', 20);
    assert.equal(combat.mana, 40);
    assert.equal(combat.readyAt, 11);
    assert.equal(combat.pending, undefined);
});

test('le balayage laisse des braises trois secondes après le passage des rayons et ne frappe qu’une fois', () => {
    const trial = createMalakorTrial(3, 5000);
    const hit = trial.beginsAt + 1320;
    const wave = malakorWave(trial, hit);
    const [from, to] = wave.danger[1];
    const boss = { trial, template: { zone: zones.breach_lord }, phase: 3, counterAt: Infinity };
    const combat = Object.create(TrainingCombat.prototype);
    let hitCount = 0;
    Object.assign(combat, {
        monsters: [], spellEffects: [], impacts: [], pending: null, recovery: null,
        effect: { clear() {} }, drawSpellEffects() {}, drawMonsterAttacks() {},
        scene: { position: { x: (from + to) / 2, y: (zones.breach_lord.top + 5) * tileSize }, motionPreference: {} },
        takeMonsterHit() { hitCount++; },
    });
    combat.updateMalakorTrial(boss, hit);
    combat.updateMalakorTrial(boss, hit + 100);
    assert.equal(hitCount, 1);
    assert.equal(combat.spellEffects.length, 1);
    assert.equal(combat.spellEffects[0].kind, 'inferno_wake');
    assert.equal(combat.spellEffects[0].duration - malakorWaveImpactMs, 3000);
    combat.drawEffects(hit + malakorEmberMs - 1);
    assert.equal(combat.spellEffects.length, 1);
    combat.drawEffects(hit + malakorEmberMs);
    assert.equal(combat.spellEffects.length, 0);
});

test('la Rage déclenche la déferlante visuelle avant de programmer la première vague', () => {
    const boss = new Monster(mockScene, 'breach_lord', tileSize, 0);
    boss.phase = 2;
    boss.health = 9015;
    const now = 5000;
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        monsters: [boss], scene: { position: { x: boss.sprite.x + 14, y: boss.sprite.y } },
        health: 1000, progress: createInitialProgress(40), stats: {}, impacts: [], spellEffects: [],
        spawnFloatingText() {}, refreshTargetHud() {}, tell() {},
    });
    combat.applyDamageToMonster(boss, 300, 'Test', 0xffffff, now);
    assert.equal(boss.phase, 3);
    assert.equal(boss.rageStartedAt, now);
    assert.equal(boss.trial, null);
    assert.equal(combat.mustDodgeMalakor(), false);
    assert.equal(malakorRageProgress(boss.rageStartedAt, now + malakorSurgeMs / 2, malakorSurgeMs), .5);

    combat.updateMonsterCounter(boss, now + malakorFirstTrialDelay - 1);
    assert.equal(boss.trial, null);
    assert.equal(boss.attackVisual, null);
    assert.equal(combat.health, 1000);
    combat.updateMonsterCounter(boss, now + malakorFirstTrialDelay);
    assert.ok(boss.trial);
    assert.equal(combat.mustDodgeMalakor(), true);
    assert.equal(malakorWave(boss.trial, boss.trial.beginsAt).impact, false);
    assert.equal(combat.health, 1000);

    boss.respawn(combat.scene.position);
    assert.equal(boss.rageStartedAt, null);
    assert.equal(boss.nextTrialAt, Infinity);
});

test('les deux récompenses de Malakor équipent des emplacements indépendants et respectent classe et niveau', () => {
    const progress = createInitialProgress(40);
    const roll = () => 0;
    const head = awardArmor(progress, 'mage', 'breach_lord', 40, roll);
    const hands = awardArmor(progress, 'mage', 'breach_lord', 40, roll);
    assert.equal(head.slot, 'head');
    assert.equal(hands.slot, 'hands');
    assert.equal(toggleArmor(progress, 'warrior', head.id), null);
    progress.level = 39;
    assert.equal(toggleArmor(progress, 'mage', head.id), null);
    progress.level = 40;
    assert.equal(toggleArmor(progress, 'mage', head.id), true);
    assert.equal(toggleArmor(progress, 'mage', hands.id), true);
    assert.equal(armorBonuses(progress, 'mage').health, head.stats.health);
    assert.equal(armorBonuses(progress, 'mage').special, hands.stats.special);
    assert.equal(toggleArmor(progress, 'mage', head.id), false);
    assert.equal(armorBonuses(progress, 'mage').health, 0);
    assert.equal(progress.armor.hands, hands.id);
    for (const piece of Object.values(armorItems)) {
        const png = readFileSync(new URL(`../public/game/val-des-saules/items/${piece.icon ?? piece.id}.png`, import.meta.url));
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [32, 32]);
    }
});

test('la reprise conserve les anciennes armes et rattache les armures aux pièces présentes dans le sac', () => {
    const progress = createInitialProgress(40);
    const storage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => JSON.stringify(progress) };
    try {
        delete progress.armor;
        assert.equal(loadProgress('test').weapon, 'starter');
        assert.deepEqual(loadProgress('test').armor, { head: null, hands: null });
        const piece = awardArmor(progress, 'warrior', 'breach_lord', 40, () => 0);
        assert.equal(toggleArmor(progress, 'warrior', piece.id), true);
        assert.equal(loadProgress('test').armor.head, piece.id);
        delete progress.items[piece.id];
        assert.equal(loadProgress('test').armor.head, null);
    } finally {
        if (storage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = storage;
    }
});

test('le Mage incante à 15 cases et peut annuler une incantation d’une seconde', () => {
    const mageRules = {
        classKey: 'mage',
        health: 40,
        mana: 40,
        range: 5.0,
        specialRange: 15,
        wandDamageMultiplier: 0.5,
        ranged: true,
        basicDamage: 8,
        specialDamage: 22,
        specialManaCost: 14,
        specialCastMs: 1000,
        cooldownMs: 500,
        baseManaRegen: 0.4,
        specialName: 'Boule de feu',
        resourceName: 'Mana',
    };
    const progress = createInitialProgress(10);
    const stats = computeCharacterStats(mageRules, progress, 0);
    const wand = basicWeaponProfile(mageRules, progress, stats, 16);
    assert.equal(wand.ranged, true);
    assert.equal(wand.range, 80);

    progress.weapon = 'rare';
    const staff = basicWeaponProfile(mageRules, progress, stats, 16);
    assert.equal(staff.ranged, false);
    assert.equal(staff.range, 40);

    assert.equal(computeCharacterStats(mageRules, createInitialProgress(1), 0).manaRegenPerSec, 0.4);
    assert.ok(stats.manaRegenPerSec < 1.2);
    assert.equal(findTalent('mage', 'm_fire_wall').talent.castTimeMs, 1000);
    assert.equal(findTalent('mage', 'm_fire_whirl').talent.castTimeMs, 1000);
    assert.ok(findTalent('mage', 'm_fire_wall').talent.manaCost >= 22);
    assert.ok(findTalent('mage', 'm_fire_whirl').talent.manaCost >= 28);

    const combat = Object.create(TrainingCombat.prototype);
    const target = { name: monsterTemplates.boar.label, level: 1, isAlive: true, sprite: { x: 240, y: 0 } };
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
        distanceTo: () => 240,
    });

    combat.attack('special', 100);
    assert.equal(combat.mana, 25);
    assert.equal(combat.pending.castMs, 1000);
    assert.equal(combat.cancelCastOnMove(), true);
    assert.equal(combat.mana, 50);
    assert.equal(combat.pending, null);

    // Mur de feu utilise bien 1 000 ms d'incantation sans déclenchement instantané
    const fireWall = findTalent('mage', 'm_fire_wall').talent;
    combat.castTalentSpell(fireWall, 300);
    assert.equal(combat.pending.kind, 'talentCast');
    assert.equal(combat.pending.end, 1300);
    assert.equal(combat.mana, 25);
});
