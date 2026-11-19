import { TrainingCombat } from './combat.js';
import { buildClearing, createPoseSheet } from './clearing-art.js';

(() => {
    const world = document.getElementById('world');
    const status = document.getElementById('game-status');
    const controls = document.querySelector('.game-directions');

    if (!window.Phaser) {
        status.textContent = 'Le moteur du jeu n’a pas pu se charger. Recharge la page pour réessayer.';
        return;
    }

    const { Phaser } = window;
    const tileSize = 16;
    const width = 28 * tileSize;
    const height = 20 * tileSize;
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
    const attacks = { Digit1: 'basic', Digit2: 'special' };
    const potions = { Digit3: 'health', Digit4: 'mana' };
    const vectors = { north: [0, -1], west: [-1, 0], south: [0, 1], east: [1, 0] };
    // Each row of walk.png follows this order.
    const directions = [
        'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east',
    ];
    const villagers = {
        lina: { x: 184, y: 190, facing: 'south-east', bounds: [176, 178, 17, 12] },
        noe: { x: 248, y: 207, facing: 'east', bounds: [235, 195, 19, 12] },
        saphyr: { x: 312, y: 175, facing: 'south-west', bounds: [291, 163, 42, 12] },
    };
    // IDs 0–15 and 16–31 are frames of the two PixelLab terrain transition sheets.
    const baseTiles = ['chemin', 'herbe', 'eau'];

    class ValDesSaules extends Phaser.Scene {
        heldKeys = new Set();
        motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

        preload() {
            this.skin = world.dataset.class === 'warrior' ? 'noe' : 'lina';
            this.walkSheet = this.skin + '-walk';
            this.load.setPath(assetPath);
            this.load.json('terrain', 'terrain.json');
            this.load.spritesheet('eau-herbe', 'eau-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            this.load.spritesheet('chemin-herbe', 'chemin-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            baseTiles.forEach((tile, index) => this.load.image(tile, 'terrain-' + (index + 1) + '.png'));
            for (const name of ['lina', 'noe']) {
                directions.forEach(direction => this.load.image(name + '-' + direction, name + '/' + direction + '.png'));
            }
            this.load.spritesheet(this.walkSheet, this.skin + '/walk.png', { frameWidth: 48, frameHeight: 48 });
            this.load.image('saphyr-south-west', 'saphyr/south-west.png');
            this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
                status.textContent = 'Un élément de la carte manque. Recharge la page pour réessayer.';
            });
        }

        create() {
            if (this.load.totalFailed > 0) return;
            this.terrain = this.cache.json.get('terrain');
            this.obstacles = [];
            this.animateClearing = buildClearing(this, this.terrain, tileSize, width, height, baseTiles);
            this.poseSheet = createPoseSheet(this, this.skin, directions);
            this.walkDistance = 0;
            this.lastWalkAt = -Infinity;
            const shadows = this.add.graphics().setDepth(3).fillStyle(0x172622, .48);
            for (const [name, { x, y, facing, bounds }] of Object.entries(villagers)) {
                const sprite = this.add.image(x, y, name + '-' + facing).setOrigin(.5, 1).setDepth(y);
                if (name === this.skin) {
                    this.avatar = sprite;
                    this.position = new Phaser.Math.Vector2(x, y);
                    this.facing = facing;
                    this.avatarShadow = this.add.ellipse(x, y - 1, 19, 7, 0x172622, .48).setDepth(3);
                } else {
                    this.obstacles.push(new Phaser.Geom.Rectangle(...bounds));
                    shadows.fillEllipse(x, y - 1, 21, 7);
                }
                if (name === 'saphyr') {
                    this.saphyr = sprite;
                }
            }
            this.combat = new TrainingCombat(this, this.saphyr, JSON.parse(world.dataset.combat), tileSize);
            this.renderAvatar(this.time.now);

            const canvas = this.game.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Carte de Val-des-Saules');
            canvas.setAttribute('aria-describedby', 'game-controls');

            const keyboard = new AbortController();
            const inventory = document.getElementById('inventory');
            const inventoryButton = document.getElementById('inventory-open');
            const inventoryStatus = document.getElementById('inventory-status');
            const releaseKeys = () => {
                this.heldKeys.clear();
                this.buttonMove = null;
            };
            const toggleInventory = () => {
                if (inventory.open) {
                    inventory.close();
                    return;
                }
                releaseKeys();
                inventoryStatus.textContent = '';
                inventory.showModal();
            };
            const drinkPotion = type => {
                const message = this.combat.drinkPotion(type);
                if (inventory.open) inventoryStatus.textContent = message;
                else this.combat.tell(message);
            };
            inventoryButton.addEventListener('click', toggleInventory, { signal: keyboard.signal });
            inventory.addEventListener('close', () => inventoryButton.focus({ preventScroll: true }), { signal: keyboard.signal });
            this.combat.potionButtons.forEach(button => {
                button.addEventListener('click', () => drinkPotion(button.dataset.potion), { signal: keyboard.signal });
            });
            this.combat.equipButton.addEventListener('click', () => {
                inventoryStatus.textContent = this.combat.toggleWeapon();
            }, { signal: keyboard.signal });
            window.addEventListener('keydown', event => {
                if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
                const target = event.target;
                if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, select, textarea'))) {
                    return;
                }
                if (event.code === 'KeyI' && !event.repeat) {
                    event.preventDefault();
                    toggleInventory();
                    return;
                }
                if (inventory.open) return;
                const movement = Object.hasOwn(bindings, event.code);
                const attack = attacks[event.code];
                const potion = potions[event.code];
                if (!movement && !attack && !potion) return;
                event.preventDefault();
                if (movement) {
                    this.heldKeys.add(event.code);
                    this.buttonMove = null;
                } else if (!event.repeat) {
                    if (potion) drinkPotion(potion);
                    else this.combat.attack(attack, this.time.now);
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
            controls.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', moveFromButton, { signal: keyboard.signal });
            });
            this.combat.buttons.forEach(button => {
                button.addEventListener('click', () => this.combat.attack(button.dataset.attack, this.time.now), { signal: keyboard.signal });
            });
            this.combat.resetButton.addEventListener('click', () => {
                releaseKeys();
                const spawn = villagers[this.skin];
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

            status.hidden = true;
            controls.hidden = false;
        }

        update(time, delta) {
            if (!this.combat) return;
            this.moveFromKeys(time, delta);
            this.combat.update(time);
            this.renderAvatar(time);
            this.animateClearing(time, this.motionPreference.matches);
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
            for (const foot of [x - 3, x, x + 3]) {
                const tile = this.terrain[Math.floor(y / tileSize)]?.[Math.floor(foot / tileSize)];
                if (tile === undefined || tile < 16 || tile === 34) return false;
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
            if (gesture) {
                frame = gesture.attack.facing + '-' + gesture.pose;
            } else if (walking) {
                texture = this.walkSheet;
                frame = directions.indexOf(this.facing) * walkFrames
                    + Math.floor(this.walkDistance / pixelsPerWalkFrame) % walkFrames;
            }
            if (this.avatar.texture.key !== texture || this.avatar.frame.name !== frame) this.avatar.setTexture(texture, frame);
            this.avatar.setPosition(Math.round(x), Math.round(y)).setDepth(y);
            this.avatarShadow.setPosition(Math.round(x), Math.round(y) - 1);
        }
    }

    new Phaser.Game({
        type: Phaser.AUTO,
        parent: world,
        width,
        height,
        pixelArt: true,
        scale: { mode: Phaser.Scale.NONE },
        input: { keyboard: false },
        audio: { noAudio: true },
        scene: ValDesSaules,
    });
})();
