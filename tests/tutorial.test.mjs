import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTutorial, tutorialSteps, TutorialQuest } from '../public/game/tutorial.js';
import { createInitialProgress, loadProgress } from '../public/game/progression.js';

test('initiation : ordre des étapes, sauvegarde et absence de relance', () => {
    const elements = Object.fromEntries(['tutorial-quest', 'tutorial-objective', 'game-guide', 'character-sheet', 'talent-tree', 'inventory'].map(id => [id, { open: false }]));
    const savedDocument = globalThis.document;
    const savedStorage = globalThis.localStorage;
    const storage = new Map();
    globalThis.document = { getElementById: id => elements[id] };
    globalThis.localStorage = { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null };
    try {
        const scene = { position: { x: 0, y: 0 }, combat: { progress: createInitialProgress(), progressKey: 'tutorial-test', tell: text => { scene.message = text; } } };
        const oldCharacter = new TutorialQuest(scene, false);
        oldCharacter.update();
        assert.equal(elements['tutorial-quest'].hidden, true);
        assert.equal(scene.combat.progress.tutorialStep, null);
        const quest = new TutorialQuest(scene, true);
        assert.equal(elements['tutorial-quest'].hidden, false);
        assert.equal(advanceTutorial(0, 'talents'), 0);
        elements['game-guide'].open = true;
        scene.position.x = 40;
        quest.update();
        assert.equal(scene.combat.progress.tutorialStep, 0);
        elements['game-guide'].open = false;
        quest.update();
        assert.equal(scene.combat.progress.tutorialStep, 1);
        quest.record('return');
        assert.equal(scene.combat.progress.tutorialStep, 1);
        quest.record('guide');
        for (const [id, step] of [['character-sheet', 3], ['talent-tree', 4], ['inventory', 5]]) {
            elements[id].open = true;
            quest.update();
            elements[id].open = false;
            assert.equal(scene.combat.progress.tutorialStep, step);
        }
        scene.combat.progress = loadProgress('tutorial-test', 1, 'mage');
        assert.equal(scene.combat.progress.tutorialStep, 5);
        scene.combat.selectedMonster = { isAlive: false };
        quest.update();
        assert.equal(scene.combat.progress.tutorialStep, 5);
        scene.combat.selectedMonster.isAlive = true;
        quest.update();
        assert.equal(scene.combat.progress.tutorialStep, 5);
        quest.record('attack');
        assert.equal(scene.combat.progress.tutorialStep, 6);
        quest.record('return');
        assert.equal(scene.combat.progress.tutorialStep, tutorialSteps.length);
        assert.equal(elements['tutorial-quest'].hidden, true);
        assert.match(scene.message, /terminés/);
        new TutorialQuest(scene, true);
        assert.equal(scene.combat.progress.tutorialStep, tutorialSteps.length);
    } finally {
        globalThis.document = savedDocument;
        globalThis.localStorage = savedStorage;
    }
});
