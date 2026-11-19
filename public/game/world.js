import { TrainingCombat } from './combat.js';
import { buildClearing, createPoseSheet } from './clearing-art.js';
import { ensureMonsterTextures, Monster } from './monsters.js';
import { buildTerrain, cameraZoom, columns, groundWalkable, inZone, rows, tileSize, zones } from './exploration.js';

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
    };
    const potions = { KeyR: 'health', KeyF: 'mana' };
    const vectors = { north: [0, -1], west: [-1, 0], south: [0, 1], east: [1, 0] };
    // Each row of walk.png follows this order.
    const directions = [
        'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east',
    ];
    // The other frames in Noé's north-west row have stray white pixels.
    const noeNorthWestWalk = [0, 1, 2, 5, 6];
    const spawns = {
        lina: { x: 184, y: 190, facing: 'south-east' },
        noe: { x: 248, y: 207, facing: 'east' },
    };
    // IDs 0–15 and 16–31 are frames of the two PixelLab terrain transition sheets.
    const baseTiles = ['chemin', 'herbe', 'eau'];

    class ValDesSaules extends Phaser.Scene {
        heldKeys = new Set();
        motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

        preload() {
            this.skin = world.dataset.class === 'warrior' ? 'noe' : 'lina';
            this.walkSheet = this.skin + '-walk';
            this.attackSheet = this.skin + '-attack';
            this.load.setPath(assetPath);
            this.load.json('terrain', 'terrain.json');
            this.load.spritesheet('eau-herbe', 'eau-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            this.load.spritesheet('chemin-herbe', 'chemin-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            baseTiles.forEach((tile, index) => this.load.image(tile, 'terrain-' + (index + 1) + '.png'));
            directions.forEach(direction => this.load.image(this.skin + '-' + direction, this.skin + '/' + direction + '.png'));
            this.load.spritesheet(this.walkSheet, this.skin + '/walk.png', { frameWidth: 48, frameHeight: 48 });
            const attackSize = this.skin === 'lina' ? 64 : 68;
            this.load.spritesheet(this.attackSheet, this.skin + '/attack.png', { frameWidth: attackSize, frameHeight: attackSize });
            this.load.spritesheet('saphyr-idle', 'saphyr/idle.png', { frameWidth: 48, frameHeight: 48 });
            this.load.spritesheet('saphyr-walk', 'saphyr/walk.png', { frameWidth: 68, frameHeight: 68 });
            this.load.spritesheet('saphyr-breath', 'saphyr/breath.png', { frameWidth: 68, frameHeight: 68 });
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
            this.animateClearing = buildClearing(this, this.terrain, tileSize, width, height, baseTiles);
            this.poseSheet = createPoseSheet(this, this.skin, directions);
            ensureMonsterTextures(this);

            this.walkDistance = 0;
            this.lastWalkAt = -Infinity;
            const { x, y, facing } = spawns[this.skin];
            this.avatar = this.add.image(x, y, this.skin + '-' + facing).setOrigin(0.5, 1).setDepth(y);
            this.position = new Phaser.Math.Vector2(x, y);
            this.facing = facing;
            this.avatarShadow = this.add.ellipse(x, y - 1, 19, 7, 0x172622, 0.48).setDepth(3);

            // Création des monstres : Sangliers (N.1-5), Squelettes (N.5-10) et Saphyr Dragon (N.10-20)
            const monsters = [
                new Monster(this, 'boar', directions, tileSize, 0),
                new Monster(this, 'boar', directions, tileSize, 2),
                new Monster(this, 'boar', directions, tileSize, 4),
                new Monster(this, 'skeleton', directions, tileSize, 0),
                new Monster(this, 'skeleton', directions, tileSize, 3),
                new Monster(this, 'dragon', directions, tileSize, 0),
            ];

            this.combat = new TrainingCombat(this, monsters, JSON.parse(world.dataset.combat), tileSize);
            this.renderAvatar(this.time.now);

            this.updateCameraZoom(this.scale.width, this.scale.height);
            this.scale.on('resize', (gameSize) => {
                this.updateCameraZoom(gameSize.width, gameSize.height);
            });

            const canvas = this.game.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Carte de Val-des-Saules');
            canvas.setAttribute('aria-describedby', 'game-controls');

            const keyboard = new AbortController();
            const inventory = document.getElementById('inventory');
            const inventoryButton = document.getElementById('inventory-open');
            const inventoryStatus = document.getElementById('inventory-status');
            const characterSheet = document.getElementById('character-sheet');
            const characterButton = document.getElementById('character-open');
            const hudSheetButton = document.getElementById('hud-sheet-open');
            const characterSheetStatus = document.getElementById('character-sheet-status');
            const talentDialog = document.getElementById('talent-tree');
            const talentButton = document.getElementById('talents-open');
            let switchingDialog = false;

            const closeOthers = (except) => {
                switchingDialog = true;
                [inventory, characterSheet, talentDialog].forEach((dlg) => {
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
                if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
                    return;
                }
                const target = event.target;
                if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, select, textarea'))) {
                    return;
                }
                if (event.code === 'KeyI' && !event.repeat) {
                    event.preventDefault();
                    toggleInventory();
                    return;
                }
                if (event.code === 'KeyC' && !event.repeat) {
                    event.preventDefault();
                    toggleCharacterSheet();
                    return;
                }
                if (event.code === 'KeyT' && !event.repeat) {
                    event.preventDefault();
                    toggleTalentTree();
                    return;
                }
                if (inventory.open || (characterSheet && characterSheet.open) || (talentDialog && talentDialog.open)) {
                    return;
                }
                const movement = Object.hasOwn(bindings, event.code);
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
            this.combat.resetButton.addEventListener('click', () => {
                releaseKeys();
                const spawn = spawns[this.skin];
                this.position.set(spawn.x, spawn.y);
                this.facing = spawn.facing;
                this.walkDistance = 0;
                this.lastWalkAt = -Infinity;
                this.combat.reset();
                this.renderAvatar(this.time.now);
                this.combat.buttons[0].focus({ preventScroll: true });
            }, { signal: keyboard.signal });
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                keyboard.abort();
                releaseKeys();
                this.game.events.off(Phaser.Core.Events.BLUR, releaseKeys);
            });

            if (status) status.hidden = true;
            if (controls) controls.hidden = false;
        }

        update(time, delta) {
            if (!this.combat) return;
            this.moveFromKeys(time, delta);
            this.combat.update(time, delta);
            this.renderAvatar(time);
            this.animateClearing(time, this.motionPreference.matches);
            const zone = Object.values(zones).find(zone => inZone(zone, this.position.x, this.position.y));
            const label = document.getElementById('current-zone');
            const name = zone?.name ?? 'Sentier des Saules';
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
                if (facing.startsWith('north')) {
                    frame = facing + '-' + gesture.pose;
                } else {
                    texture = this.attackSheet;
                    frame = gesture.frame + (facing === 'south' ? 9 : 0);
                    origin = this.skin === 'lina' ? 54 / 64 : 57 / 68;
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
            if (this.avatar.texture.key !== texture || this.avatar.frame.name !== frame) this.avatar.setTexture(texture, frame).setOrigin(0.5, origin);
            this.avatar.setFlipX(flip).setPosition(Math.round(x), Math.round(y)).setDepth(y);
            this.avatarShadow.setPosition(Math.round(x), Math.round(y) - 1);
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
