import { GameChat } from './chat.js';
import { WorldPresence } from './world-presence.js';
import { vfxFrameSize } from './combat-vfx.js';
import { equippedWeaponStyles } from './equipped-art.js';
import { malakorFrameSize } from './malakor.js';
import { TrainingCombat } from './combat.js';
import { buildClearing, createPoseSheet } from './clearing-art.js';
import { Monster } from './monsters.js';
import { monsterArt } from './monster-art.js';
import { buildTerrain, cameraZoom, coastalLookouts, columns, frontierSpecies, groundWalkable, inZone, rows, tileSize, zones } from './exploration.js';
import { createStarterTown, isInStarterTown, nearestTownResident, questNpc, starterSpawn, townName } from './starter-town.js';
import { transitionZoneLabel } from './biome-gradient.js';
import { createZoneAmbience } from './zone-ambience.js';
import { createWorldLighting } from './world-lighting.js';
import { CameraFeel } from './camera-feel.js';
import { acceptTrailQuest, completeTrailQuest, requiredBoars, trailQuestMarker, trailQuestStatus } from './trail-quest.js';
import { saveProgress } from './progression.js';
import { petAction } from './pet-controls.js';
import { petKeys } from './pet-rules.js';

(() => {
    const world = document.getElementById('world');
    const status = document.getElementById('game-status');
    const controls = document.querySelector('.game-directions');

    if (!window.Phaser) {
        status.textContent = 'Le moteur du jeu n’a pas pu se charger. Recharge la page pour réessayer.';
        return;
    }

    const { Phaser } = window;
    const width = columns * tileSize;
    const height = rows * tileSize;
    const speed = 92;
    const walkFrames = 8;
    const pixelsPerWalkFrame = 7;
    const assetPath = world.dataset.assetPath;
    const bindings = {
        ArrowUp: 'north', KeyW: 'north',
        ArrowLeft: 'west', KeyA: 'west',
        ArrowDown: 'south', KeyS: 'south',
        ArrowRight: 'east', KeyD: 'east',
    };
    const attacks = {
        Digit1: 'basic',
        Digit2: 'special',
        Digit3: 'talent-0',
        Digit4: 'talent-1',
        Digit5: 'talent-2',
        Digit6: 'talent-3',
        Digit7: 'talent-4',
        Digit8: 'talent-5',
        Digit9: 'talent-6',
    };
    const potions = { KeyR: 'health', KeyF: 'mana' };
    const vectors = { north: [0, -1], west: [-1, 0], south: [0, 1], east: [1, 0] };
    // Each row of walk.png follows this order.
    const directions = [
        'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east',
    ];
    // The other frames in Noé's north-west row have stray white pixels.
    const noeNorthWestWalk = [0, 1, 2, 5, 6];
    // IDs 0–15 and 16–31 are frames of the two PixelLab terrain transition sheets.
    const baseTiles = ['chemin', 'herbe', 'eau'];

    class ValDesSaules extends Phaser.Scene {
        heldKeys = new Set();
        motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

        preload() {
            this.skin = world.dataset.skin;
            const art = this.skin === 'lina' ? 'warrior' : this.skin;
            this.armorIconPath = assetPath + 'items/';
            this.walkSheet = this.skin + '-walk';
            this.attackSheet = this.skin + '-attack';
            this.load.setPath(assetPath);
            this.load.json('terrain', 'terrain.json');
            this.load.image('starter-town', 'bastion-de-braise.png');
            this.load.spritesheet('town-residents', 'bastion-habitants.png', { frameWidth: 48, frameHeight: 48 });
            this.load.image('environment-detailed', 'environment-detailed.png');
            this.load.image('ground-detailed', 'ground-detailed.png');
            for (const atlas of ['regional-ground', 'cemetery-scenery', 'wasteland-scenery']) {
                this.load.image(atlas, atlas + '.png');
            }
            for (const [species, { frame }] of Object.entries(monsterArt)) {
                this.load.spritesheet(species + '-motion', 'monsters/' + species + '.png', { frameWidth: frame, frameHeight: frame });
            }
            for (const atlas of ['malakor-actions', 'malakor-rage', 'malakor-rage-actions']) {
                this.load.spritesheet(atlas, 'monsters/' + atlas + '.png', { frameWidth: malakorFrameSize, frameHeight: malakorFrameSize });
            }
            this.load.spritesheet('combat-vfx', 'combat-vfx.png', { frameWidth: vfxFrameSize, frameHeight: vfxFrameSize });
            this.load.spritesheet('class-vfx', 'class-vfx.png', { frameWidth: vfxFrameSize, frameHeight: vfxFrameSize });
            this.load.spritesheet('eau-herbe', 'eau-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            this.load.spritesheet('chemin-herbe', 'chemin-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            baseTiles.forEach((tile, index) => this.load.image(tile, 'terrain-' + (index + 1) + '.png'));
            directions.forEach(direction => this.load.image(this.skin + '-' + direction, art + '/' + direction + '.png'));
            this.load.spritesheet(this.walkSheet, art + '/walk.png', { frameWidth: 48, frameHeight: 48 });
            const attackSize = this.skin === 'noe' ? 68 : 64;
            this.load.spritesheet(this.attackSheet, art + '/attack.png', { frameWidth: attackSize, frameHeight: attackSize });
            if (equippedWeaponStyles[this.skin]) {
                for (const pose of ['idle', 'walk', 'attack']) {
                    this.load.spritesheet(this.skin + '-' + pose + '-equipped', art + '/' + pose + '-equipped.png', { frameWidth: 64, frameHeight: 64 });
                }
            }
            for (const skin of ['lina', 'noe', 'hunter', 'rogue', 'warlock'].filter(skin => skin !== this.skin)) {
                const directory = skin === 'lina' ? 'warrior' : skin;
                directions.forEach(direction => this.load.image(skin + '-' + direction, directory + '/' + direction + '.png'));
                this.load.spritesheet(skin + '-walk', directory + '/walk.png', { frameWidth: 48, frameHeight: 48 });
                const size = skin === 'noe' ? 68 : 64;
                this.load.spritesheet(skin + '-attack', directory + '/attack.png', { frameWidth: size, frameHeight: size });
                if (equippedWeaponStyles[skin]) for (const pose of ['idle', 'walk', 'attack']) {
                    this.load.spritesheet(skin + '-' + pose + '-equipped', directory + '/' + pose + '-equipped.png', { frameWidth: 64, frameHeight: 64 });
                }
            }
            this.load.spritesheet('class-gear', 'class-gear.png', { frameWidth: 40, frameHeight: 32 });
            this.load.spritesheet('class-familiars', 'class-familiars.png', { frameWidth: 32, frameHeight: 32 });
            this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
                status.textContent = 'Un élément de la carte manque. Recharge la page pour réessayer.';
            });
        }

        updateCameraZoom(viewWidth, viewHeight) {
            const cam = this.cameras.main;
            cam.setZoom(cameraZoom(viewWidth, viewHeight));
            cam.roundPixels = true;
            cam.setBounds(0, 0, width, height);
            const follow = this.motionPreference.matches ? 1 : 0.16;
            cam.startFollow(this.avatar, true, follow, follow);
        }

        create() {
            if (this.load.totalFailed > 0) return;
            this.terrain = buildTerrain(this.cache.json.get('terrain'));
            this.obstacles = [];
            const clearing = buildClearing(this, this.terrain, tileSize, width, height, baseTiles);
            const town = createStarterTown(this);
            this.animateClearing = clearing.animate;
            this.animateTown = town.animate;
            this.animateZoneAmbience = createZoneAmbience(this, tileSize);
            this.lighting = createWorldLighting(this, width, height, tileSize, [...clearing.lights, ...town.lights]);
            this.poseSheet = createPoseSheet(this, this.skin, directions);
            if (this.skin !== 'noe') createPoseSheet(this, 'noe', directions);
            this.questMarker = this.add.text(questNpc.x, questNpc.y - 47, '!', {
                fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: 'bold',
                color: '#f0c781', stroke: '#19272e', strokeThickness: 3,
            }).setOrigin(.5, 1).setDepth(height + 10).setInteractive({ useHandCursor: true });

            this.walkDistance = 0;
            this.lastWalkAt = -Infinity;
            const { x, y, facing } = starterSpawn;
            this.avatar = this.add.image(x, y, this.skin + '-' + facing).setOrigin(0.5, 1).setDepth(y);
            this.position = new Phaser.Math.Vector2(x, y);
            this.facing = facing;
            this.avatarShadow = this.add.ellipse(x, y - 1, 19, 7, 0x172622, 0.48).setDepth(3);
            if (this.skin !== 'noe') {
                this.weaponSprite = this.add.image(x, y, 'class-gear').setOrigin(.4, .5);
                this.offHandSprite = this.add.image(x, y, 'class-gear').setOrigin(.4, .5).setVisible(false);
            }

            const monsters = [
                new Monster(this, 'boar', tileSize, 0),
                new Monster(this, 'boar', tileSize, 1),
                new Monster(this, 'boar', tileSize, 2),
                new Monster(this, 'boar', tileSize, 3),
                new Monster(this, 'boar', tileSize, 4),
                new Monster(this, 'boar', tileSize, 6),
                new Monster(this, 'boar', tileSize, 8),
                new Monster(this, 'skeleton', tileSize, 0),
                new Monster(this, 'skeleton', tileSize, 1),
                new Monster(this, 'skeleton', tileSize, 2),
                new Monster(this, 'skeleton', tileSize, 3),
                new Monster(this, 'skeleton', tileSize, 4),
                new Monster(this, 'skeleton', tileSize, 5),
                new Monster(this, 'dragon', tileSize, 0),
                new Monster(this, 'dragon', tileSize, 2),
                new Monster(this, 'dragon', tileSize, 5),
                new Monster(this, 'dragon', tileSize, 8),
                new Monster(this, 'dragon', tileSize, 10),
                new Monster(this, 'imp', tileSize, 0),
                new Monster(this, 'imp', tileSize, 1),
                new Monster(this, 'imp', tileSize, 2),
                new Monster(this, 'imp', tileSize, 3),
                new Monster(this, 'imp', tileSize, 4),
                new Monster(this, 'imp', tileSize, 6),
                new Monster(this, 'hound', tileSize, 0),
                new Monster(this, 'hound', tileSize, 1),
                new Monster(this, 'hound', tileSize, 2),
                new Monster(this, 'hound', tileSize, 4),
                new Monster(this, 'hound', tileSize, 5),
                new Monster(this, 'fiend', tileSize, 0),
                new Monster(this, 'fiend', tileSize, 1),
                new Monster(this, 'fiend', tileSize, 2),
                new Monster(this, 'fiend', tileSize, 4),
                new Monster(this, 'fiend', tileSize, 5),
                new Monster(this, 'breach_lord', tileSize, 0),
                ...frontierSpecies.flatMap((species) => Array.from({ length: 8 }, (_, index) => (
                    new Monster(this, species, tileSize, index)
                ))),
            ];

            this.cameraFeel = new CameraFeel();
            const rules = JSON.parse(world.dataset.combat);
            this.combat = new TrainingCombat(this, monsters, rules, tileSize);
            this.renderAvatar(this.time.now);
            if (rules.chatUrl) this.chat = new GameChat(this, rules);
            if (rules.worldUrl) this.presence = new WorldPresence(this, rules);

            this.updateCameraZoom(this.scale.width, this.scale.height);
            this.cameras.main.centerOn(x, y);
            this.scale.on('resize', (gameSize) => {
                this.updateCameraZoom(gameSize.width, gameSize.height);
            });

            const canvas = this.game.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Carte de Val-des-Saules');
            canvas.setAttribute('aria-describedby', 'game-controls');

            const keyboard = new AbortController();
            const flushProgress = () => { void this.combat.progressSync.flush(); };
            window.addEventListener('pagehide', flushProgress, { signal: keyboard.signal });
            window.addEventListener('online', flushProgress, { signal: keyboard.signal });
            this.time.addEvent({ delay: 5000, loop: true, callback: flushProgress });
            const inventory = document.getElementById('inventory');
            const inventoryButton = document.getElementById('inventory-open');
            const inventoryStatus = document.getElementById('inventory-status');
            const characterSheet = document.getElementById('character-sheet');
            const characterButton = document.getElementById('character-open');
            const hudSheetButton = document.getElementById('hud-sheet-open');
            const characterSheetStatus = document.getElementById('character-sheet-status');
            const talentDialog = document.getElementById('talent-tree');
            const talentButton = document.getElementById('talents-open');
            const questDialog = document.getElementById('quest-dialog');
            const questButton = document.getElementById('quest-open');
            const questAction = document.getElementById('quest-action');
            let switchingDialog = false;

            const closeOthers = (except) => {
                switchingDialog = true;
                [inventory, characterSheet, talentDialog, questDialog].forEach((dlg) => {
                    if (dlg && dlg !== except && dlg.open) {
                        dlg.close();
                    }
                });
                switchingDialog = false;
            };

            const releaseKeys = () => {
                this.heldKeys.clear();
                this.buttonMove = null;
            };

            const toggleInventory = () => {
                if (inventory.open) {
                    inventory.close();
                    return;
                }
                closeOthers(inventory);
                releaseKeys();
                inventoryStatus.textContent = '';
                inventory.showModal();
            };

            const toggleCharacterSheet = () => {
                if (!characterSheet) return;
                if (characterSheet.open) {
                    characterSheet.close();
                    return;
                }
                closeOthers(characterSheet);
                releaseKeys();
                this.combat.refreshCharacterSheet();
                if (characterSheetStatus) characterSheetStatus.textContent = '';
                characterSheet.showModal();
            };

            const toggleTalentTree = () => {
                if (!talentDialog) return;
                if (talentDialog.open) {
                    talentDialog.close();
                    return;
                }
                closeOthers(talentDialog);
                releaseKeys();
                this.combat.renderTalentTree();
                if (this.combat.talentStatusLabel) this.combat.talentStatusLabel.textContent = '';
                talentDialog.showModal();
            };

            const drinkPotion = (type) => {
                const message = this.combat.drinkPotion(type);
                if (inventory.open) {
                    inventoryStatus.textContent = message;
                } else {
                    this.combat.tell(message);
                }
            };

            const talkToNpc = () => {
                if (questDialog.open) { questDialog.close(); return; }
                if (!this.canTalkToNpc()) {
                    this.combat.tell('Approche-toi de Rakka pour lui parler (E).');
                    return;
                }
                closeOthers(questDialog);
                releaseKeys();
                this.renderQuestDialog();
                questDialog.showModal();
                if (!questAction.disabled && !questAction.hidden) questAction.focus({ preventScroll: true });
            };
            const talkToResident = (resident = nearestTownResident(this.position)) => {
                if (questDialog.open || resident === questNpc) { talkToNpc(); return; }
                if (this.combat.health <= 0) return;
                if (!resident || Math.hypot(this.position.x - resident.x, this.position.y - resident.y) > resident.range) {
                    this.combat.tell('Approche-toi d’un habitant pour lui parler (E).');
                    return;
                }
                this.combat.tell(`${resident.name}, ${resident.role} · ${resident.dialogue}`);
            };
            questButton.addEventListener('click', () => talkToResident(), { signal: keyboard.signal });
            for (const { resident, sprite } of town.occupants) sprite.on('pointerdown', () => talkToResident(resident));
            this.questMarker.on('pointerdown', talkToNpc);
            questDialog.addEventListener('close', () => {
                if (!switchingDialog) questButton.focus({ preventScroll: true });
            }, { signal: keyboard.signal });
            questAction.addEventListener('click', () => {
                if (!this.canTalkToNpc()) { questDialog.close(); return; }
                const progress = this.combat.progress;
                const accepted = acceptTrailQuest(progress.trailQuest);
                if (!accepted && !completeTrailQuest(progress)) return;
                saveProgress(this.combat.progressKey, progress);
                this.combat.refreshInventory();
                this.refreshQuest();
                questDialog.close();
                this.combat.tell(accepted ? 'Quête acceptée : sors par la porte est, puis suis la route vers la clairière.'
                    : 'Quête terminée : tu reçois deux potions de vie.');
            }, { signal: keyboard.signal });

            inventoryButton.addEventListener('click', toggleInventory, { signal: keyboard.signal });
            inventory.addEventListener('close', () => {
                if (!switchingDialog) inventoryButton.focus({ preventScroll: true });
            }, { signal: keyboard.signal });

            if (characterButton) {
                characterButton.addEventListener('click', toggleCharacterSheet, { signal: keyboard.signal });
            }
            if (hudSheetButton) {
                hudSheetButton.addEventListener('click', toggleCharacterSheet, { signal: keyboard.signal });
            }
            if (characterSheet) {
                characterSheet.addEventListener('close', () => {
                    if (!switchingDialog && characterButton) characterButton.focus({ preventScroll: true });
                }, { signal: keyboard.signal });
            }

            if (talentButton) {
                talentButton.addEventListener('click', toggleTalentTree, { signal: keyboard.signal });
            }
            if (talentDialog) {
                talentDialog.addEventListener('close', () => {
                    if (!switchingDialog && talentButton) talentButton.focus({ preventScroll: true });
                }, { signal: keyboard.signal });
            }
            if (this.combat.talentResetButton) {
                this.combat.talentResetButton.addEventListener('click', () => {
                    const msg = this.combat.resetAllTalents();
                    if (this.combat.talentStatusLabel) this.combat.talentStatusLabel.textContent = msg;
                }, { signal: keyboard.signal });
            }

            this.combat.statButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const message = this.combat.spendStatPoint(button.dataset.allocateStat);
                    if (characterSheetStatus) characterSheetStatus.textContent = message;
                }, { signal: keyboard.signal });
            });

            this.combat.warriorSpecButtons?.forEach((button) => {
                button.addEventListener('click', () => {
                    const message = this.combat.chooseWarriorSpec(button.dataset.chooseSpec);
                    if (characterSheetStatus) characterSheetStatus.textContent = message;
                }, { signal: keyboard.signal });
            });

            this.combat.spellButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const message = this.combat.spendSpellPoint(button.dataset.upgradeSpell);
                    if (characterSheetStatus) characterSheetStatus.textContent = message;
                }, { signal: keyboard.signal });
            });

            this.combat.potionButtons.forEach((button) => {
                button.addEventListener('click', () => drinkPotion(button.dataset.potion), { signal: keyboard.signal });
            });

            this.combat.weaponButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    inventoryStatus.textContent = this.combat.toggleWeapon(button.dataset.weapon);
                }, { signal: keyboard.signal });
            });

            window.addEventListener('keydown', (event) => {
                if (event.code !== 'Tab' && event.key !== 'Tab') {
                    return;
                }
                if (event.altKey || event.ctrlKey || event.metaKey) {
                    return;
                }
                const target = event.target;
                const isEditable = target
                    && typeof target.matches === 'function'
                    && (target.closest?.('#game-chat') || target.isContentEditable || target.matches('input, select, textarea'));
                if (isEditable) {
                    return;
                }

                // Réserver exclusivement Tab au jeu et bloquer la navigation de focus dans la fenêtre.
                event.preventDefault();
                event.stopPropagation();

                const modalOpen = inventory.open
                    || (characterSheet && characterSheet.open)
                    || (talentDialog && talentDialog.open)
                    || questDialog.open;
                if (modalOpen) {
                    return;
                }

                const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
                if (activeEl && activeEl !== canvas) {
                    if (typeof activeEl.blur === 'function') {
                        activeEl.blur();
                    }
                    if (typeof canvas.focus === 'function') {
                        canvas.focus({ preventScroll: true });
                    }
                }

                if (!event.repeat) {
                    this.combat.cycleTarget(event.shiftKey ? -1 : 1);
                }
            }, { capture: true, signal: keyboard.signal });

            window.addEventListener('keydown', (event) => {
                if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
                    return;
                }
                const target = event.target;
                if (target instanceof HTMLElement && (target.closest?.('#game-chat') || target.isContentEditable || target.matches('input, select, textarea'))) {
                    return;
                }
                if (event.code === 'KeyI' && !event.repeat) {
                    event.preventDefault();
                    toggleInventory();
                    return;
                }
                if (event.code === 'KeyP' && !event.repeat) {
                    event.preventDefault();
                    toggleCharacterSheet();
                    return;
                }
                if (event.code === 'KeyT' && !event.repeat) {
                    event.preventDefault();
                    toggleTalentTree();
                    return;
                }
                if (event.code === 'KeyE' && !event.repeat) {
                    event.preventDefault();
                    talkToResident();
                    return;
                }
                if (inventory.open || (characterSheet && characterSheet.open) || (talentDialog && talentDialog.open) || questDialog.open) {
                    return;
                }
                const movement = Object.hasOwn(bindings, event.code);
                const petCommand = petKeys[event.code];
                if (petCommand !== undefined && ['hunter', 'warlock'].includes(this.combat.classKey)) {
                    event.preventDefault();
                    if (!event.repeat) petAction(this.combat, petCommand, this.time.now);
                    return;
                }
                const attack = attacks[event.code];
                const potion = potions[event.code];
                if (!movement && !attack && !potion) {
                    return;
                }
                event.preventDefault();
                if (movement) {
                    this.heldKeys.add(event.code);
                    this.buttonMove = null;
                } else if (!event.repeat) {
                    if (potion) {
                        drinkPotion(potion);
                    } else {
                        this.combat.attack(attack, this.time.now);
                    }
                }
            }, { signal: keyboard.signal });
            window.addEventListener('keyup', event => this.heldKeys.delete(event.code), { signal: keyboard.signal });
            this.game.events.on(Phaser.Core.Events.BLUR, releaseKeys);

            const moveFromButton = event => {
                if (this.combat.health === 0) return;
                const direction = event.currentTarget.dataset.direction;
                const remaining = this.buttonMove?.direction === direction ? this.buttonMove.remaining : 0;
                this.buttonMove = { direction, remaining: remaining + 10 };
            };
            if (controls) {
                controls.querySelectorAll('button').forEach(button => {
                    button.addEventListener('click', moveFromButton, { signal: keyboard.signal });
                });
            }
            this.combat.buttons.forEach(button => {
                button.addEventListener('click', () => this.combat.attack(button.dataset.attack, this.time.now), { signal: keyboard.signal });
            });
            this.combat.petButtons.forEach(button => {
                button.addEventListener('click', () => petAction(this.combat, Number(button.dataset.petAction), this.time.now), { signal: keyboard.signal });
            });
            this.combat.resetButton.addEventListener('click', () => {
                releaseKeys();
                const spawn = starterSpawn;
                this.position.set(spawn.x, spawn.y);
                this.facing = spawn.facing;
                this.walkDistance = 0;
                this.lastWalkAt = -Infinity;
                this.combat.reset();
                this.renderAvatar(this.time.now);
                this.cameras.main.centerOn(spawn.x, spawn.y);
                this.combat.buttons[0].focus({ preventScroll: true });
            }, { signal: keyboard.signal });
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                keyboard.abort();
                this.lighting.destroy();
                releaseKeys();
                this.game.events.off(Phaser.Core.Events.BLUR, releaseKeys);
            });

            if (status) status.hidden = true;
            if (controls) controls.hidden = false;
            this.refreshQuest();
        }

        canTalkToNpc() {
            return this.combat.health > 0 && Math.hypot(this.position.x - questNpc.x, this.position.y - questNpc.y) <= questNpc.range;
        }

        isInStarterTown() {
            return isInStarterTown(this.position.x, this.position.y);
        }

        refreshQuest() {
            const quest = this.combat.progress.trailQuest;
            const state = trailQuestStatus(quest);
            const resident = nearestTownResident(this.position);
            const key = state + ':' + quest.defeated + ':' + (resident?.name ?? '');
            if (this.questViewKey === key) return;
            this.questViewKey = key;
            const marker = trailQuestMarker(quest);
            this.questMarker.setText(marker.symbol).setColor(marker.color).setVisible(Boolean(marker.symbol));
            const labels = {
                available: 'Quête (E)', active: `Quête ${quest.defeated}/${requiredBoars} (E)`,
                ready_to_turn_in: 'Rendre (E)', completed: 'Parler (E)',
            };
            const button = document.getElementById('quest-open');
            const talking = resident && resident !== questNpc;
            button.textContent = talking ? 'Parler (E)' : labels[state];
            button.setAttribute('aria-label', talking ? 'Parler à ' + resident.name : 'Rakka · ' + labels[state]);
            if (document.getElementById('quest-dialog').open) this.renderQuestDialog();
        }

        renderQuestDialog() {
            const quest = this.combat.progress.trailQuest;
            const state = trailQuestStatus(quest);
            const descriptions = {
                available: 'Les sangliers menacent nos convois. Sors par la porte est, remonte la route au nord, puis prends à gauche vers la clairière. Abats trois sangliers et fais-moi ton rapport.',
                active: 'Tu as accepté la quête. Reviens me voir quand tu auras vaincu trois sangliers.',
                ready_to_turn_in: 'Le sentier est plus sûr grâce à toi ! Voici deux potions de vie pour te remercier.',
                completed: 'Merci encore pour ton aide. Bonne route dans Val-des-Saules !',
            };
            document.getElementById('quest-description').textContent = descriptions[state];
            document.getElementById('quest-progress').textContent = state === 'available' ? 'Quête disponible'
                : state === 'completed' ? 'Quête terminée' : `Sangliers vaincus : ${quest.defeated} / ${requiredBoars}`;
            const action = document.getElementById('quest-action');
            action.textContent = state === 'available' ? 'Accepter la quête' : state === 'ready_to_turn_in' ? 'Rendre la quête' : 'En cours';
            action.disabled = state === 'active' || state === 'completed';
            action.hidden = state === 'completed';
        }

        update(time, delta) {
            if (!this.combat) return;
            this.moveFromKeys(time, delta);
            if (this.isInStarterTown() && this.combat.selectedMonster) {
                this.combat.selectMonster(null);
                this.combat.targetHud.hidden = true;
            }
            this.combat.update(time, delta);
            this.refreshQuest();
            this.renderAvatar(time);
            this.presence?.update(time);
            this.animateClearing(time, this.motionPreference.matches);
            this.animateTown(time, this.motionPreference.matches);
            this.animateZoneAmbience(time, this.motionPreference.matches);
            this.lighting.update(time, this.motionPreference.matches);
            const { offsetX, offsetY } = this.cameraFeel.update(delta, this.motionPreference.matches);
            this.cameras.main.setFollowOffset(offsetX, offsetY);
            const zone = Object.values(zones).find(z => inZone(z, this.position.x, this.position.y))
                ?? coastalLookouts.find(lookout => inZone(lookout, this.position.x, this.position.y));
            const label = document.getElementById('current-zone');
            const name = this.isInStarterTown() ? townName + ' · Zone sûre'
                : (zone?.name ?? transitionZoneLabel(this.position.x, this.position.y, tileSize));
            if (label && label.textContent !== name) label.textContent = name;
        }

        moveFromKeys(time, delta) {
            const distance = speed * Math.min(delta, 40) / 1000;
            if (this.buttonMove && this.heldKeys.size === 0) {
                const [x, y] = vectors[this.buttonMove.direction];
                const step = Math.min(distance, this.buttonMove.remaining);
                this.move(x * step, y * step, time);
                this.buttonMove.remaining -= step;
                if (this.buttonMove.remaining === 0) this.buttonMove = null;
                return;
            }
            if (this.heldKeys.size === 0) return;
            const active = new Set(Array.from(this.heldKeys, code => bindings[code]));
            const x = Number(active.has('east')) - Number(active.has('west'));
            const y = Number(active.has('south')) - Number(active.has('north'));
            const length = Math.hypot(x, y);
            if (length === 0) return;
            this.move(x * distance / length, y * distance / length, time);
        }

        canStand(x, y) {
            if (!groundWalkable(this.terrain, x, y)) return false;
            for (const foot of [x - 3, x, x + 3]) {
                if (this.obstacles.some(bounds => bounds.contains(foot, y))) return false;
            }
            return true;
        }

        face(x, y) {
            this.facing = directions[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8];
        }

        move(x, y, time) {
            if (this.combat.health === 0 || (x === 0 && y === 0)) return;
            this.face(x, y);
            const { x: previousX, y: previousY } = this.position;

            // Limit each step so keyboard and touch use the same collision checks.
            const steps = Math.ceil(Math.max(Math.abs(x), Math.abs(y)) / 2);
            for (let step = 0; step < steps; step++) {
                const nextX = this.position.x + x / steps;
                const nextY = this.position.y + y / steps;
                if (this.canStand(nextX, this.position.y)) this.position.x = nextX;
                if (this.canStand(this.position.x, nextY)) this.position.y = nextY;
            }
            const traveled = Math.hypot(this.position.x - previousX, this.position.y - previousY);
            if (traveled > 0) {
                if (traveled > 0.5) {
                    this.combat?.cancelCastOnMove?.();
                }
                if (time - this.lastWalkAt >= 90) this.walkDistance = 0;
                this.walkDistance += traveled;
                this.lastWalkAt = time;
            }
        }

        renderAvatar(time) {
            const { x, y } = this.position;
            const walking = time - this.lastWalkAt < 90;
            const gesture = this.combat.attackPose(time);
            let texture = this.poseSheet;
            let frame = this.facing + '-idle';
            let origin = 1;
            let flip = false;
            if (gesture) {
                const facing = gesture.attack.facing;
                if (this.skin !== 'noe') {
                    texture = this.attackSheet;
                    frame = directions.indexOf(facing) * 9 + gesture.frame;
                    origin = 54 / 64;
                } else if (facing.startsWith('north') || gesture.attack.ranged) {
                    frame = facing + '-' + gesture.pose;
                } else {
                    texture = this.attackSheet;
                    frame = gesture.frame + (facing === 'south' ? 9 : 0);
                    origin = 57 / 68;
                    flip = facing.includes('west');
                }
            } else if (walking) {
                texture = this.walkSheet;
                const step = Math.floor(this.walkDistance / pixelsPerWalkFrame);
                const walkFrame = this.skin === 'noe' && this.facing === 'north-west'
                    ? noeNorthWestWalk[step % noeNorthWestWalk.length]
                    : step % walkFrames;
                frame = directions.indexOf(this.facing) * walkFrames + walkFrame;
            }
            const integratedWeapon = equippedWeaponStyles[this.skin];
            const equippedPose = integratedWeapon && this.combat.weaponStyle === integratedWeapon
                && (!gesture || gesture.attack.weaponStyle === integratedWeapon);
            if (equippedPose) {
                const facing = gesture?.attack.facing ?? this.facing;
                const row = directions.indexOf(facing);
                const pose = gesture ? 'attack' : walking ? 'walk' : 'idle';
                texture = this.skin + '-' + pose + '-equipped';
                frame = gesture ? row * 9 + gesture.frame : walking ? row * 8 + Math.floor(this.walkDistance / pixelsPerWalkFrame) % 8 : row;
                origin = 56 / 64;
            }
            if (this.avatar.texture.key !== texture || this.avatar.frame.name !== frame) this.avatar.setTexture(texture, frame).setOrigin(0.5, origin);
            this.avatar.setFlipX(flip).setPosition(Math.round(x), Math.round(y)).setDepth(y);
            this.avatarShadow.setPosition(Math.round(x), Math.round(y) - 1);
            if (this.weaponSprite) {
                if (integratedWeapon) {
                    this.weaponSprite.setVisible(false);
                    this.offHandSprite.setVisible(false);
                } else this.renderArmament(gesture, walking, time);
            }
        }

        renderArmament(gesture, walking, time) {
            const { x, y } = this.position;
            const facing = gesture?.attack.facing ?? this.facing;
            const heading = directions.indexOf(facing) * Math.PI / 4;
            const dx = Math.cos(heading);
            const dy = Math.sin(heading);
            const style = gesture?.attack.weaponStyle ?? this.combat.weaponStyle;
            const frame = { sword: 0, axe: 1, daggers: 2, bow: 3, grimoire: 4, shield: 5 }[style];
            const attackFrame = gesture?.frame ?? 0;
            const stance = gesture ? [-.10, -.24, -.42, -.60, .34, .68, .42, .18, .02][attackFrame] : 0;
            const walkBob = walking ? Math.round(Math.sin(this.walkDistance / 6) * 1.2) : 0;
            const lift = gesture ? [0, 1, 2, 3, 1, -1, -1, 0, 0][attackFrame] : walkBob;
            const back = dy < -.35;
            const side = dx < -.2 ? -1 : 1;

            // Ancrages collés aux poignets/épaules pour éviter l'effet d'armes flottantes
            const pivots = {
                sword: [.26, .62],
                axe: [.24, .64],
                daggers: [.30, .58],
                bow: [.48, .50],
                grimoire: [.50, .56],
                shield: [.50, .52],
            };
            const [ox, oy] = pivots[style] ?? [.4, .5];
            const gripReach = style === 'bow'
                ? (gesture && attackFrame < 4 ? 2 : 4)
                : (style === 'grimoire' ? 2 : (gesture && attackFrame >= 4 && attackFrame < 8 ? 5 : 3));
            const lateralOffset = style === 'bow' ? side * 3 : (style === 'grimoire' ? side * 4 : side * 4.5);
            const bookCastLift = style === 'grimoire' && gesture ? 2 : 0;
            const handX = Math.round(x + dx * gripReach + lateralOffset);
            const handY = Math.round(y - 16 + dy * 3.5 - lift - bookCastLift);

            const swing = style === 'axe' ? stance * 1.45 : stance;
            const angle = ['bow', 'grimoire', 'shield'].includes(style)
                ? (style === 'bow' ? dy * (gesture ? .42 : .18) : (style === 'grimoire' && gesture ? -.08 * side : 0))
                : heading + (gesture ? swing * side : .62 * side);

            this.weaponSprite.setVisible(frame !== undefined && this.combat.health > 0);
            if (frame !== undefined) {
                this.weaponSprite.setOrigin(ox, oy).setFrame(frame).setPosition(handX, handY)
                    .setRotation(angle).setFlipX(style === 'bow' && side < 0).setDepth(y + (back ? -.2 : .2));
            }
            const shield = this.skin === 'lina' && style !== 'shield'
                && (this.combat.progress.talents?.w_shield_bash || time < (this.combat.guard?.until ?? 0));
            const dagger = style === 'daggers';
            this.offHandSprite.setVisible(Boolean((shield || dagger) && this.combat.health > 0));
            if (shield || dagger) {
                const offOrigin = shield ? pivots.shield : pivots.daggers;
                const offX = Math.round(x + dx * 1.5 - side * (shield ? 5 : 4.5));
                const offY = Math.round(y - 15 + dy * 2 - lift);
                this.offHandSprite.setOrigin(offOrigin[0], offOrigin[1]).setFrame(shield ? 5 : 2)
                    .setPosition(offX, offY)
                    .setRotation(dagger ? heading - swing * side : 0).setDepth(y + (back ? -.3 : .1));
            }
        }
    }

    new Phaser.Game({
        type: Phaser.AUTO,
        parent: world,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#152127',
        pixelArt: true,
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: { keyboard: false },
        audio: { noAudio: true },
        scene: ValDesSaules,
    });
})();
