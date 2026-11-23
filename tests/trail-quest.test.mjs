import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptTrailQuest, completeTrailQuest, normalizeTrailQuest, recordTrailQuestDefeat, trailQuestMarker, trailQuestStatus } from '../public/game/trail-quest.js';
import { createInitialProgress, loadProgress, saveProgress } from '../public/game/progression.js';
import { TrainingCombat } from '../public/game/combat.js';

test('le PNJ affiche ! disponible, ? gris en cours, ? doré à rendre et rien après la remise', () => {
    const progress = createInitialProgress();
    const quest = progress.trailQuest;
    assert.deepEqual(trailQuestMarker(quest), { symbol: '!', color: '#f0c781' });
    assert.equal(acceptTrailQuest(quest), true);
    assert.deepEqual(trailQuestMarker(quest), { symbol: '?', color: '#9aa0a6' });
    assert.equal(recordTrailQuestDefeat(quest, 'skeleton'), false);
    assert.equal(recordTrailQuestDefeat(quest, 'dragon'), false);
    assert.equal(quest.defeated, 0);
    for (let i = 0; i < 3; i++) recordTrailQuestDefeat(quest, 'boar');
    assert.equal(trailQuestStatus(quest), 'ready_to_turn_in');
    assert.deepEqual(trailQuestMarker(quest), { symbol: '?', color: '#f0c781' });
    assert.equal(completeTrailQuest(progress), true);
    assert.equal(progress.items.health, 4);
    assert.equal(trailQuestStatus(quest), 'completed');
    assert.equal(trailQuestMarker(quest).symbol, '');
});

test('la quête doit être acceptée et les récompenses ne sont remises qu’une fois', () => {
    const progress = createInitialProgress();
    const quest = progress.trailQuest;
    assert.equal(recordTrailQuestDefeat(quest, 'boar'), false);
    assert.equal(completeTrailQuest(progress), false);
    acceptTrailQuest(quest);
    assert.equal(acceptTrailQuest(quest), false);
    recordTrailQuestDefeat(quest, 'boar');
    assert.equal(completeTrailQuest(progress), false);
    for (let i = 0; i < 10; i++) recordTrailQuestDefeat(quest, 'boar');
    assert.equal(quest.defeated, 3);
    assert.equal(completeTrailQuest(progress), true);
    assert.equal(completeTrailQuest(progress), false);
    assert.equal(acceptTrailQuest(quest), false);
    assert.equal(recordTrailQuestDefeat(quest, 'boar'), false);
    assert.equal(progress.items.health, 4);
});

test('la vraie défaite d’un sanglier crédite la quête une fois, même si le même événement arrive deux fois', () => {
    const progress = createInitialProgress();
    acceptTrailQuest(progress.trailQuest);
    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        progress, progressKey: 'quest-test', selectedMonster: null,
        rules: { loot: { health: { chance: 100, name: 'Potion de vie' } } },
        refreshProgress() {}, refreshInventory() {}, tell() {},
    });
    const monster = {
        species: 'boar', name: 'Sanglier', level: 1, xpReward: 42, template: { respawnMs: 4000 },
        sprite: { visible: true }, hide() { this.sprite.visible = false; },
    };
    combat.defeatMonster(monster, 100);
    combat.defeatMonster(monster, 101);
    assert.equal(progress.trailQuest.defeated, 1);
    assert.equal(progress.xp, 60);
    assert.equal(progress.items.health, 3);
});

test('la sauvegarde garde la quête par personnage et accepte les sauvegardes anciennes', t => {
    const previous = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = {
        getItem(key) { return store.get(key) ?? null; },
        setItem(key, value) { store.set(key, value); },
    };
    t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
    const progress = createInitialProgress(4);
    delete progress.trailQuest;
    saveProgress('alice', progress);
    const restored = loadProgress('alice', 1);
    assert.equal(restored.level, 4);
    assert.equal(trailQuestStatus(restored.trailQuest), 'available');
    acceptTrailQuest(restored.trailQuest);
    recordTrailQuestDefeat(restored.trailQuest, 'boar');
    saveProgress('alice', restored);
    const active = loadProgress('alice', 1);
    assert.equal(active.trailQuest.defeated, 1);
    assert.equal(trailQuestMarker(active.trailQuest).color, '#9aa0a6');
    recordTrailQuestDefeat(active.trailQuest, 'boar');
    recordTrailQuestDefeat(active.trailQuest, 'boar');
    completeTrailQuest(active);
    saveProgress('alice', active);
    const done = loadProgress('alice', 1);
    assert.equal(trailQuestStatus(done.trailQuest), 'completed');
    assert.equal(completeTrailQuest(done), false);
    assert.equal(done.items.health, 4);
    assert.equal(trailQuestStatus(loadProgress('bob', 1).trailQuest), 'available');
});

test('les états de quête invalides sont rejetés', () => {
    for (const saved of [undefined, null, {}, { defeated: -1, completed: false },
        { defeated: 4, completed: false }, { defeated: '3', completed: false },
        { defeated: null, completed: true }, { defeated: 2, completed: true }]) {
        assert.deepEqual(normalizeTrailQuest(saved), { defeated: null, completed: false });
    }
    assert.deepEqual(normalizeTrailQuest({ defeated: 3, completed: true }), { defeated: 3, completed: true });
});
