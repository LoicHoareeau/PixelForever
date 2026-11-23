import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TrainingCombat, selectNextTarget } from '../public/game/combat.js';
import { CameraFeel } from '../public/game/camera-feel.js';
import { frontierSpecies } from '../public/game/exploration.js';
import { petKeys } from '../public/game/pet-rules.js';
import { equippedWeaponStyles } from '../public/game/equipped-art.js';

function fakeMonster(name, x, y, alive = true) {
    return {
        name,
        species: 'boar',
        level: 2,
        health: alive ? 40 : 0,
        maxHealth: 40,
        isAlive: alive,
        selected: false,
        sprite: { x, y, visible: alive, on() {}, setFrame() {}, setPosition() {}, setDepth() {} },
        setSelected(flag) {
            this.selected = flag;
        },
    };
}

test('Tab reprend le plus proche, Maj+Tab recule et les cibles mortes ou lointaines sont ignorées', () => {
    const player = { x: 100, y: 100 };
    const far = fakeMonster('Lointain', 800, 800, true);
    const dead = fakeMonster('Mort', 110, 100, false);
    const mid = fakeMonster('Moyen', 160, 100, true);
    const near = fakeMonster('Proche', 120, 100, true);
    const monsters = [far, dead, mid, near];

    // Sans cible courante, Tab sélectionne le monstre vivant le plus proche à portée
    assert.equal(selectNextTarget(monsters, player, null, 1), near);
    assert.equal(selectNextTarget(monsters, player, null, -1), mid);

    // Tab reprend le plus proche quelle que soit la cible courante.
    assert.equal(selectNextTarget(monsters, player, near, 1), near);
    assert.equal(selectNextTarget(monsters, player, mid, 1), near);

    // Rotation arrière avec Shift+Tab
    assert.equal(selectNextTarget(monsters, player, near, -1), mid);

    // Monstre unique à portée
    assert.equal(selectNextTarget([near, far, dead], player, near, 1), near);

    // Aucun monstre vivant à portée
    assert.equal(selectNextTarget([far, dead], player, near, 1), null);
});

test('TrainingCombat.cycleTarget met à jour la sélection, le HUD et le journal', () => {
    const m1 = fakeMonster('Sanglier A', 120, 100, true);
    const m2 = fakeMonster('Sanglier B', 180, 100, true);
    let told = '';
    let refreshed = 0;

    const combat = Object.create(TrainingCombat.prototype);
    Object.assign(combat, {
        health: 50,
        monsters: [m2, m1],
        selectedMonster: null,
        scene: { position: { x: 100, y: 100 } },
        refreshTargetHud() {
            refreshed++;
        },
        tell(message) {
            told = message;
        },
    });

    assert.equal(combat.cycleTarget(1), m1);
    assert.equal(m1.selected, true);
    assert.equal(m2.selected, false);
    assert.equal(refreshed, 1);
    assert.match(told, /Sanglier A/);

    assert.equal(combat.cycleTarget(1), m1);
    combat.scene.position.x = 174;
    assert.equal(combat.cycleTarget(1), m2);
    assert.equal(m1.selected, false);
    assert.equal(m2.selected, true);
    assert.match(told, /Sanglier B/);

    // Joueur vaincu : le ciblage ne fait rien
    combat.health = 0;
    assert.equal(combat.cycleTarget(1), null);
});

test('Tab est réservé au jeu en phase de capture et empêche la navigation DOM dans la fenêtre', () => {
    class MockHTMLElement {}
    const windowListeners = [];
    const canvas = {
        tabIndex: -1,
        focused: 0,
        setAttribute() {},
        focus() {
            this.focused++;
        },
    };
    const hudButton = {
        blurred: 0,
        blur() {
            this.blurred++;
        },
    };
    const dialog = { open: false, addEventListener() {}, close() {} };
    const noopEl = {
        dataset: { combat: '{}' },
        hidden: false,
        textContent: '',
        addEventListener() {},
        setAttribute() {},
        querySelectorAll: () => [],
        focus() {},
    };

    const cycled = [];
    const petCommands = [];
    class MockTrainingCombat {
        constructor() {
            this.progressSync = { flush() {} };
            this.progress = { trailQuest: {} };
            this.statButtons = [];
            this.spellButtons = [];
            this.potionButtons = [];
            this.weaponButtons = [];
            this.petButtons = [];
            this.classKey = 'hunter';
            this.buttons = [{ focus() {}, addEventListener() {} }];
            this.resetButton = { addEventListener() {} };
        }
        cycleTarget(dir) {
            cycled.push(dir);
        }
        update() {}
        attackPose() {
            return null;
        }
    }

    let sceneClass;
    const Phaser = {
        Scene: class {},
        AUTO: 0,
        Scale: { RESIZE: 0, CENTER_BOTH: 0 },
        Core: { Events: { BLUR: 'blur' } },
        Scenes: { Events: { SHUTDOWN: 'shutdown' } },
        Geom: { Rectangle: class {} },
        Math: { Vector2: class { constructor(x, y) { this.x = x; this.y = y; } set() {} } },
        Game: class {
            constructor(config) {
                sceneClass = config.scene;
            }
        },
    };

    const source = readFileSync(new URL('../public/game/world.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '');

    const doc = {
        activeElement: hudButton,
        getElementById(id) {
            if (id === 'inventory') return dialog;
            if (id === 'quest-dialog') return { open: false, addEventListener() {}, close() {} };
            return noopEl;
        },
        querySelector: () => null,
    };

    const win = {
        Phaser,
        innerWidth: 1280,
        innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener(type, fn, opts) {
            windowListeners.push({ type, fn, capture: Boolean(opts?.capture) });
        },
    };

    vm.runInNewContext(source, {
        window: win,
        document: doc,
        HTMLElement: MockHTMLElement,
        TrainingCombat: MockTrainingCombat,
        TutorialQuest: class { record() {} },
        HudControls: class { attackForCode() {} },
        petKeys,
        equippedWeaponStyles,
        petAction: (_combat, index) => petCommands.push(index),
        buildClearing: () => ({ animate() {}, lights: [] }),
        createZoneAmbience: () => () => {},
        createWorldLighting: () => ({ update() {}, destroy() {} }),
        createPoseSheet: () => 'sheet',
        createHunterArt: () => {},
        createRogueArt: () => {},
        createMageArt: () => {},
        createStarterTown: () => ({ occupants: [], lights: [], animate() {} }),
        nearestTownResident: () => null,
        starterSpawn: { x: 184, y: 190, facing: 'south-east' },
        Monster: class {},
        monsterArt: {},
        buildTerrain: () => [[33]],
        CameraFeel,
        frontierSpecies,
        cameraZoom: () => 1,
        coastalLookouts: [],
        columns: 224,
        rows: 160,
        tileSize: 16,
        groundWalkable: () => true,
        inZone: () => false,
        questNpc: { x: 224, y: 190, range: 48 },
        zones: {},
        acceptTrailQuest: () => false,
        completeTrailQuest: () => false,
        requiredBoars: 3,
        trailQuestMarker: () => ({ symbol: '', color: '' }),
        trailQuestStatus: () => 'available',
        saveProgress: () => {},
        Math,
        Set,
        AbortController,
    });

    const scene = Object.create(sceneClass.prototype);
    Object.assign(scene, {
        skin: 'lina',
        heldKeys: new Set(),
        motionPreference: { matches: false },
        load: { totalFailed: 0 },
        cache: { json: { get: () => [[]] } },
        add: {
            ellipse: () => ({ setDepth() { return this; }, setPosition() { return this; } }),
            image: () => ({ setOrigin() { return this; }, setScale() { return this; }, setDepth() { return this; }, setInteractive() { return this; }, on() {}, texture: { key: '' }, frame: { name: '' }, setFlipX() { return this; }, setPosition() { return this; }, setTexture() { return this; }, setVisible() { return this; } }),
            text: () => ({ setOrigin() { return this; }, setDepth() { return this; }, setInteractive() { return this; }, on() {}, setText() { return this; }, setColor() { return this; }, setVisible() { return this; } }),
        },
        time: { now: 100, addEvent() {} },
        scale: { width: 1280, height: 720, on() {} },
        cameras: { main: { setZoom() {}, setBounds() {}, startFollow() {}, centerOn() {} } },
        game: { canvas, events: { on() {}, off() {} } },
        events: { once() {} },
    });
    scene.create();

    const captureTabListener = windowListeners.find((l) => l.type === 'keydown' && l.capture);
    assert.ok(captureTabListener, 'un écouteur keydown en phase de capture doit être enregistré');

    const dispatch = (overrides = {}) => {
        const evt = {
            code: 'Tab',
            key: 'Tab',
            shiftKey: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            repeat: false,
            defaultPrevented: false,
            target: hudButton,
            prevented: false,
            stopped: false,
            preventDefault() {
                this.prevented = true;
            },
            stopPropagation() {
                this.stopped = true;
            },
            ...overrides,
        };
        captureTabListener.fn(evt);
        return evt;
    };

    const tabEvt = dispatch();
    assert.equal(tabEvt.prevented, true);
    assert.equal(tabEvt.stopped, true);
    assert.equal(hudButton.blurred, 1);
    assert.equal(canvas.focused, 1);
    assert.deepEqual(cycled, [1]);

    const shiftTabEvt = dispatch({ shiftKey: true });
    assert.equal(shiftTabEvt.prevented, true);
    assert.deepEqual(cycled, [1, -1]);

    // Modale ouverte : Tab reste bloqué pour ne pas naviguer dans l'UI, sans cycler de cible
    dialog.open = true;
    const modalEvt = dispatch();
    assert.equal(modalEvt.prevented, true);
    assert.equal(modalEvt.stopped, true);
    assert.deepEqual(cycled, [1, -1]);
    dialog.open = false;

    // Alt+Tab ou Ctrl+Tab restent libres pour le système/navigateur
    const altTab = dispatch({ altKey: true });
    assert.equal(altTab.prevented, false);

    const gameListener = windowListeners.find(l => l.type === 'keydown' && !l.capture);
    const chatControl = new MockHTMLElement();
    chatControl.matches = () => false;
    chatControl.closest = selector => selector === '#game-chat' ? {} : null;
    const chatTab = dispatch({ target: chatControl });
    assert.equal(chatTab.prevented, false, 'Tab doit rester natif dans le panneau de tchat');
    for (const code of ['KeyW', 'Digit1', 'KeyT', 'KeyZ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        const event = { code, target: chatControl, preventDefault() { this.prevented = true; } };
        gameListener.fn(event);
        assert.equal(event.prevented, undefined, code + ' ne doit pas déclencher le jeu depuis le tchat');
    }
    assert.equal(scene.heldKeys.size, 0);
    assert.deepEqual(petCommands, []);

    for (const code of ['KeyZ', 'KeyX', 'KeyC']) {
        const event = { code, target: canvas, preventDefault() { this.prevented = true; } };
        gameListener.fn(event);
        assert.equal(event.prevented, true);
    }
    assert.deepEqual(petCommands, [0, 1, 2], 'W/X/C AZERTY utilise les mêmes positions que Z/X/C QWERTY');
    const keyUpListener = windowListeners.find(l => l.type === 'keyup');
    const movements = [];
    scene.move = (x, y) => movements.push([x, y]);
    scene.heldKeys.clear();
    for (const [code, direction] of [['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]], ['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]]]) {
        const event = { code, target: canvas, preventDefault() { this.prevented = true; } };
        gameListener.fn(event);
        assert.equal(event.prevented, true, 'La flèche doit empêcher le défilement de la page.');
        scene.moveFromKeys(100, 40);
        const [x, y] = movements.at(-1);
        assert.equal(Math.sign(x), direction[0]);
        assert.equal(Math.sign(y), direction[1]);
        keyUpListener.fn({ code });
        assert.equal(scene.heldKeys.size, 0, 'Relâcher la flèche doit arrêter le déplacement.');
    }
    scene.heldKeys.add('ArrowUp'); scene.heldKeys.add('ArrowRight');
    scene.moveFromKeys(100, 40);
    assert.ok(Math.abs(Math.hypot(...movements.at(-1)) - 92 * .04) < .00001, 'La diagonale ne doit pas accélérer le personnage.');
    scene.heldKeys.clear();
    gameListener.fn({ code: 'KeyW', target: canvas, preventDefault() {} });
    assert.equal(scene.heldKeys.has('KeyW'), true, 'la touche physique de déplacement reste disponible');
    dialog.open = true;
    gameListener.fn({ code: 'KeyZ', target: canvas, preventDefault() {} });
    assert.deepEqual(petCommands, [0, 1, 2], 'les commandes ne traversent pas une modale ouverte');
    scene.heldKeys.clear();
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) gameListener.fn({ code, target: canvas, preventDefault() {} });
    assert.equal(scene.heldKeys.size, 0, 'Les flèches ne doivent pas déplacer le personnage pendant un menu.');
});
