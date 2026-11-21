import assert from 'node:assert/strict';
import test from 'node:test';
import { petAction, updatePetControls } from '../public/game/pet-controls.js';
import { inheritedPetStats, normalizeCapturedPet, petKeys } from '../public/game/pet-rules.js';
import { applyTechnique, updateClassCombat } from '../public/game/class-combat.js';
import { TrainingCombat } from '../public/game/combat.js';
import { createInitialProgress, getUnlockedActiveSpells, getUnlockedPetSpells, loadProgress } from '../public/game/progression.js';

function fixture() {
    const images = [];
    const makeActor = (x, y) => ({
        x, y, setOrigin() { return this; }, setDepth() { return this; }, setScale() { return this; },
        setFlipX() { return this; }, setFrame(frame) { this.frame = frame; return this; },
        setPosition(x, y) { Object.assign(this, { x, y }); return this; }, destroy() { this.destroyed = true; },
    });
    const target = { species: 'boar', level: 1, health: 30, maxHealth: 100, isAlive: true, sprite: { x: 50, y: 0 },
        template: { respawnMs: 5000 }, hide() { this.isAlive = false; this.hidden = true; } };
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        classKey: 'hunter', tileSize: 16, progressKey: 'hunter', progress: createInitialProgress(), health: 100, mana: 100,
        petButtons: [], spellEffects: [], spellCooldowns: new Map(), periodicEffects: new Map(),
        stats: { basicDamage: 40, maxHealth: 100, maxMana: 40, attributes: { defense: { total: 20 } } },
        scene: { position: { x: 0, y: 0 }, canStand: () => true,
            add: { image(x, y, texture) { const actor = makeActor(x, y); images.push({ actor, texture }); return actor; }, rectangle: makeActor } },
        getActiveTarget: () => target, refreshVitals() {}, selectMonster() {}, tell(message) { this.message = message; },
        mustDodgeMalakor: () => false, images,
    });
    return { combat, target };
}

test('apprivoiser exige une créature accessible, affaiblie, de niveau adapté et du mana', () => {
    for (const mutate of [
        t => { t.species = 'skeleton'; }, t => { t.level = 2; }, t => { t.health = 31; },
        t => { t.sprite.x = 200; }, t => { t.isAlive = false; }, t => { t.engagedBy = 'other'; },
    ]) {
        const { combat, target } = fixture();
        mutate(target);
        petAction(combat, 0, 0);
        assert.equal(combat.taming, undefined);
        assert.equal(combat.mana, 100);
        assert.equal(target.hidden, undefined);
    }
    const { combat } = fixture();
    combat.mana = 0;
    petAction(combat, 0, 0);
    assert.equal(combat.taming, undefined);
});

test('la capture prend quatre secondes, ne donne ni XP, ni butin, ni progression de quête et ne se répète pas', () => {
    const { combat, target } = fixture();
    const before = structuredClone(combat.progress);
    petAction(combat, 0, 0);
    assert.equal(combat.mana, 88);
    updatePetControls(combat, 3999);
    assert.equal(target.isAlive, true);
    updatePetControls(combat, 4000);
    assert.equal(target.isAlive, false);
    assert.equal(target.respawnAt, 9000);
    assert.equal(combat.familiar.kind, 'beast');
    assert.equal(combat.images[0].texture, 'boar-motion');
    assert.deepEqual(combat.progress.capturedPet, { species: 'boar', healthFraction: 1 });
    for (const key of ['xp', 'level', 'items', 'trailQuest']) assert.deepEqual(combat.progress[key], before[key]);
    updatePetControls(combat, 5000);
    assert.equal(combat.images.length, 1);
});

test('déplacement, perte de cible et coup subi interrompent la capture sans supprimer le monstre', () => {
    for (const reason of ['move', 'dead', 'hit']) {
        const { combat, target } = fixture();
        petAction(combat, 0, 0);
        if (reason === 'move') combat.scene.position.x = 1;
        if (reason === 'dead') target.isAlive = false;
        if (reason === 'hit') {
            Object.assign(combat, { impacts: [], refreshVitals() {}, stats: { ...combat.stats, damageReduction: 0 } });
            combat.takeMonsterHit({ name: 'Sanglier' }, 1, 100);
        }
        updatePetControls(combat, 4000);
        assert.equal(combat.taming, null);
        assert.equal(combat.progress.capturedPet, null);
        assert.equal(target.hidden, undefined);
    }
});

test('un seul familier actif, rappel passif et révocation conservent les PV au prochain appel', () => {
    const { combat } = fixture();
    combat.progress.capturedPet = { species: 'dragon', healthFraction: 1 };
    petAction(combat, 1, 0);
    const pet = combat.familiar;
    pet.health = 10;
    petAction(combat, 1, 5000);
    assert.equal(pet.recalled, true);
    petAction(combat, 2, 5001);
    assert.equal(pet.actor.destroyed, true);
    assert.equal(combat.familiar, null);
    petAction(combat, 1, 5002);
    assert.equal(combat.familiar.health, 10);
    assert.equal(combat.images.filter(i => !i.actor.destroyed).length, 1);
});

test('statistiques héritées : équipement du maître, gardien plus robuste et aucun bonus de boss sauvage', () => {
    const { combat, target } = fixture();
    combat.progress.level = target.level = 40;
    target.species = 'breach_lord';
    target.maxHealth = 36000;
    target.health = 100;
    petAction(combat, 0, 0);
    updatePetControls(combat, 4000);
    assert.equal(combat.familiar.maxHealth, 50);
    assert.equal(combat.familiar.damage, 12);
    assert.equal(combat.familiar.defense, 7);
    combat.stats.maxHealth = 200;
    combat.stats.basicDamage = 80;
    updateClassCombat(combat, 4001, 16);
    assert.equal(combat.familiar.maxHealth, 100);
    assert.equal(combat.familiar.damage, 24);
    assert.equal(combat.familiar.health, 100);
    const protector = inheritedPetStats(combat.stats, true);
    assert.equal(protector.maxHealth, 130);
    assert.ok(protector.damage < combat.familiar.damage);
    assert.equal(combat.familiar.profile.specials, undefined);
});

test('les invocations ont leur barre et les anciennes sauvegardes sont normalisées par classe', () => {
    assert.deepEqual(petKeys, { KeyZ: 0, KeyX: 1, KeyC: 2 });
    assert.equal(getUnlockedPetSpells(createInitialProgress(), 'warlock')[0].slot, 'summon_imp');
    assert.deepEqual(getUnlockedActiveSpells(createInitialProgress(), 'warlock'), []);
    assert.equal(normalizeCapturedPet({ species: 'skeleton' }, 'hunter'), null);
    assert.equal(normalizeCapturedPet({ species: 'boar' }, 'mage'), null);
    assert.deepEqual(normalizeCapturedPet({ species: 'boar', healthFraction: 2 }, 'hunter'), { species: 'boar', healthFraction: 1 });
});

test('la sauvegarde garde la créature et le talent ancien de faucon devient un soin sans perdre le point investi', t => {
    const previous = globalThis.localStorage;
    const saved = createInitialProgress(4);
    saved.capturedPet = { species: 'boar', healthFraction: .4 };
    saved.talents = { h_bond: 2, summon_hawk: 1 };
    globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
    t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
    const restored = loadProgress('hunter', 1, null, 'hunter');
    assert.deepEqual(restored.capturedPet, saved.capturedPet);
    assert.equal(restored.talents.summon_hawk, 1);
    const heal = getUnlockedActiveSpells(restored, 'hunter').find(t => t.id === 'summon_hawk');
    assert.equal(heal.technique.healPet, true);
    assert.equal(heal.technique.summon, undefined);
    const { combat } = fixture();
    combat.progress.capturedPet = saved.capturedPet;
    petAction(combat, 1, 0);
    assert.equal(combat.familiar.health, 20);
    applyTechnique(combat, heal.technique, null, 0, heal.name, 0);
    assert.equal(combat.familiar.health, 35);
});

test('les boutons du Démoniste respectent les talents, le mana, l’incantation et le remboursement au déplacement', () => {
    const { combat } = fixture();
    combat.classKey = 'warlock';
    combat.rules = { resourceName: 'Mana' };
    petAction(combat, 1, 0);
    assert.equal(combat.pending, undefined);
    assert.equal(combat.mana, 100);
    combat.mana = 0;
    petAction(combat, 0, 0);
    assert.equal(combat.pending, undefined);
    combat.mana = 100;
    petAction(combat, 0, 0);
    assert.equal(combat.pending.kind, 'classCast');
    assert.equal(combat.mana, 88);
    petAction(combat, 0, 1);
    assert.equal(combat.mana, 88);
    combat.cancelCastOnMove();
    assert.equal(combat.pending, null);
    assert.equal(combat.mana, 100);
    combat.petReadyAt = 30000;
    petAction(combat, 0, 29999);
    assert.equal(combat.pending, null);
    assert.equal(combat.mana, 100);
    petAction(combat, 0, 30000);
    assert.equal(combat.pending.kind, 'classCast');
});

test('le familier respecte les obstacles et ne combat pas dans le Bastion', () => {
    const { combat, target } = fixture();
    combat.progress.capturedPet = { species: 'boar', healthFraction: 1 };
    petAction(combat, 1, 0);
    Object.assign(combat.familiar, { x: 0, y: 0, target });
    combat.familiar.actor.setPosition(0, 0);
    target.sprite.x = 10;
    let hits = 0;
    combat.applyDamageToMonster = () => hits++;
    combat.scene.canStand = x => x < 5;
    updateClassCombat(combat, 1000, 16);
    assert.equal(hits, 0, 'pas de frappe à travers un obstacle');
    combat.scene.canStand = () => true;
    combat.scene.isInStarterTown = () => true;
    updateClassCombat(combat, 1001, 16);
    assert.equal(hits, 0, 'pas de combat depuis la zone sûre');
    combat.scene.isInStarterTown = () => false;
    updateClassCombat(combat, 1002, 16);
    assert.equal(hits, 1);
});
