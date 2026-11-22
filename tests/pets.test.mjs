import { Monster } from '../public/game/monsters.js';
import { drawSpellEffectsView } from '../public/game/combat-renderer.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { petAction, updatePetControls } from '../public/game/pet-controls.js';
import { inheritedPetStats, normalizeCapturedPet, petKeys } from '../public/game/pet-rules.js';
import { applyTechnique, updateClassCombat } from '../public/game/class-combat.js';
import { TrainingCombat } from '../public/game/combat.js';
import { createInitialProgress, getUnlockedActiveSpells, getUnlockedPetSpells, loadProgress } from '../public/game/progression.js';

test('le sanglier familier anime ses vrais déplacements et les trois poses de frappe', () => {
    const {combat}=fixture();combat.progress.capturedPet={species:'boar',healthFraction:1};
    petAction(combat,1,0);
    const pet=combat.familiar;pet.recalled=true;pet.nextHit=Infinity;
    combat.scene.position.x=100;
    updateClassCombat(combat,1000,100);
    assert(pet.walkDistance>0);
    combat.scene.canStand=()=>false;
    updateClassCombat(combat,1100,100);
    assert.equal(pet.actor.frame%40,0,'pas de marche sur place contre un obstacle');
    combat.scene.canStand=()=>true;
    combat.scene.position={x:pet.x+21,y:pet.y-8};
    pet.strikeUntil=2320;
    const frames=[];
    for(const now of [2000,2110,2220]){updateClassCombat(combat,now,0);frames.push(pet.actor.frame%40);}
    assert.deepEqual(frames,[37,38,39]);
});

function fixture() {
    const images = [];
    const makeActor = (x, y) => ({
        x, y, setOrigin() { return this; }, setDepth() { return this; }, setScale() { return this; },
        setFlipX() { return this; }, setFrame(frame) { this.frame = frame; return this; },
        setPosition(x, y) { Object.assign(this, { x, y }); return this; }, destroy() { this.destroyed = true; },
    });
    const target = { species: 'boar', level: 1, health: 30, maxHealth: 100, isAlive: true, sprite: { x: 50, y: 0 },
        template: { respawnMs: 5000, zone: { left: -10, top: -10, right: 10, bottom: 10 } },
        cancelAttack() { this.attackEndsAt = 0; this.attackVisual = null; },
        syncOverlays() {}, pursue() { this.alert = true; }, hide() { this.isAlive = false; this.hidden = true; } };
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        classKey: 'hunter', rules: { resourceName: 'Mana' }, tileSize: 16, progressKey: 'hunter', progress: createInitialProgress(), health: 100, mana: 100,
        petButtons: [], spellEffects: [], spellCooldowns: new Map(), periodicEffects: new Map(),
        stats: { basicDamage: 40, maxHealth: 100, maxMana: 40, attributes: { defense: { total: 20 } } },
        scene: { position: { x: 0, y: 0 }, facing: 'east', face() {}, canStand: () => true,
            add: { image(x, y, texture) { const actor = makeActor(x, y); images.push({ actor, texture }); return actor; }, rectangle: makeActor } },
        getActiveTarget: () => target, refreshVitals() {}, selectMonster() {}, tell(message) { this.message = message; },
        mustDodgeMalakor: () => false, triggerShake() {}, images,
    });
    return { combat, target };
}

test('la trappe de départ neutralise les coups et permet les quatre secondes de capture', () => {
    const { combat, target } = fixture();
    const trap = getUnlockedActiveSpells(combat.progress, 'hunter')[0];
    assert.equal(trap.slot, 'taming_trap');
    Object.assign(target, { alert: true, stunUntil: 0, counterAt: 0, attackEndsAt: 400,
        attackVisual: { projectile: {} }, echo: { end: 200 }, canAttack: () => true,
        stats: { attackIntervalMs: 1800 }, startAttack() { throw new Error('La cible piégée attaque.'); } });
    const other = {};
    combat.periodicEffects.set(target, new Map([['poison', {}]]));
    combat.periodicEffects.set(other, new Map());
    combat.familiar = { target, bolt: { target }, recalled: false, actor: { destroy() {} } };
    combat.castTalentSpell(trap, 100);
    assert.equal(combat.mana, 88);
    assert.equal(target.health, 30);
    assert.equal(target.trappedUntil, 6100);
    assert.equal(target.attackVisual, null);
    assert.equal(target.echo, null);
    assert.equal(combat.familiar.recalled, true);
    assert.equal(combat.familiar.bolt, null);
    assert.equal(combat.periodicEffects.has(target), false);
    assert.equal(combat.periodicEffects.has(other), true);
    assert.equal(combat.spellCooldowns.get('taming_trap').end, 20100);
    const before = structuredClone(combat.progress);
    petAction(combat, 0, 200);
    for (const now of [200, 2000, 4199]) {
        combat.updateMonsterCounter(target, now);
        updatePetControls(combat, now);
        assert.equal(target.isAlive, true);
    }
    updatePetControls(combat, 4200);
    assert.equal(combat.familiar.kind, 'beast');
    assert.equal(target.isAlive, false);
    for (const key of ['level', 'xp', 'items', 'trailQuest']) assert.deepEqual(combat.progress[key], before[key]);
});

test('la trappe refuse les cibles invalides et actions en cours sans mana ni recharge consommés', () => {
    for (const mutate of [
        (c, t) => { t.species = 'skeleton'; }, (c, t) => { t.level = 2; },
        (c, t) => { t.health = 31; }, (c, t) => { t.sprite.x = 200; },
        (c, t) => { t.isAlive = false; }, (c, t) => { t.engagedBy = 'other'; },
        c => { c.pending = {}; }, c => { c.scene.isInStarterTown = () => true; },
        c => { c.health = 0; }, c => { c.mana = 0; },
    ]) {
        const { combat, target } = fixture();
        const trap = getUnlockedActiveSpells(combat.progress, 'hunter')[0];
        mutate(combat, target);
        const mana = combat.mana;
        combat.castTalentSpell(trap, 100);
        assert.equal(combat.mana, mana);
        assert.equal(combat.spellCooldowns.has(trap.slot), false);
        assert.equal(target.trappedUntil, undefined);
    }
});

test('la trappe bloque le déplacement, expire et se brise dès un dégât', () => {
    const { combat, target } = fixture();
    const trap = getUnlockedActiveSpells(combat.progress, 'hunter')[0];
    combat.castTalentSpell(trap, 100);
    Object.assign(target.sprite, { visible: true, setTint() {} });
    Monster.prototype.update.call(target, 6099, 16, combat.scene.position);
    assert.deepEqual([target.sprite.x, target.sprite.y], [50, 0]);
    Object.assign(combat, { impacts: [], spawnFloatingText() {} });
    combat.applyDamageToMonster(target, 1, 'Flèche', 0xffffff, 1000);
    assert.equal(target.trappedUntil, 0);
    assert.equal(target.health, 29);
    combat.castTalentSpell(trap, 1100);
    assert.equal(combat.mana, 88);
    target.trappedUntil = 6100;
    Object.assign(target, { stunUntil: 0, counterAt: 0, stats: { attackIntervalMs: 1800 }, canAttack: () => true,
        startAttack() { this.resumed = true; } });
    combat.updateMonsterCounter(target, 6100);
    assert.equal(target.resumed, true);
});

test('le repère de trappe reste fixe et disparaît lorsque la cible est libérée ou capturée', () => {
    const { combat, target } = fixture();
    const calls = [];
    combat.vfx = { play: (...args) => calls.push(args) };
    combat.scene.motionPreference = { matches: true };
    target.trappedUntil = 6100;
    combat.spellEffects = [{ kind: 'taming_trap', target, start: 100, duration: 6000 }];
    drawSpellEffectsView(combat, 100);
    drawSpellEffectsView(combat, 4000);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0][0], 'trap');
    target.trappedUntil = 0;
    drawSpellEffectsView(combat, 4001);
    target.isAlive = false;
    target.trappedUntil = 6100;
    drawSpellEffectsView(combat, 4002);
    assert.equal(calls.length, 2);
});

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
