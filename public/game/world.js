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
    const renderScale = 2;
    const speed = 92;
    const assetPath = world.dataset.assetPath;
    const bindings = {
        ArrowUp: 'north', KeyW: 'north',
        ArrowLeft: 'west', KeyA: 'west',
        ArrowDown: 'south', KeyS: 'south',
        ArrowRight: 'east', KeyD: 'east',
    };
    const vectors = { north: [0, -1], west: [-1, 0], south: [0, 1], east: [1, 0] };
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

        preload() {
            this.load.setPath(assetPath);
            this.load.json('terrain', 'terrain.json');
            this.load.spritesheet('eau-herbe', 'eau-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            this.load.spritesheet('chemin-herbe', 'chemin-herbe.png', { frameWidth: tileSize, frameHeight: tileSize });
            baseTiles.forEach((tile, index) => this.load.image(tile, 'terrain-' + (index + 1) + '.png'));
            for (const name of ['lina', 'noe']) {
                directions.forEach(direction => this.load.image(name + '-' + direction, name + '/' + direction + '.png'));
            }
            this.load.image('saphyr-south-west', 'saphyr/south-west.png');
            this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
                status.textContent = 'Un élément de la carte manque. Recharge la page pour réessayer.';
            });
        }

        create() {
            if (this.load.totalFailed > 0) return;
            this.cameras.main.setZoom(renderScale).centerOn(width / 2, height / 2);
            this.terrain = this.cache.json.get('terrain');
            this.terrain.forEach((row, y) => row.forEach((tile, x) => {
                const texture = tile < 16 ? 'eau-herbe' : tile < 32 ? 'chemin-herbe' : baseTiles[tile - 32];
                const frame = tile < 32 ? tile % 16 : undefined;
                this.add.image(x * tileSize, y * tileSize, texture, frame).setOrigin(0);
            }));

            this.skin = world.dataset.class === 'warrior' ? 'noe' : 'lina';
            this.obstacles = [];
            for (const [name, { x, y, facing, bounds }] of Object.entries(villagers)) {
                const sprite = this.add.image(x, y, name + '-' + facing).setOrigin(.5, 1).setDepth(y);
                if (name === this.skin) {
                    this.avatar = sprite;
                    this.position = new Phaser.Math.Vector2(x, y);
                } else {
                    this.obstacles.push(new Phaser.Geom.Rectangle(...bounds));
                }
            }

            const canvas = this.game.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Carte de Val-des-Saules');
            canvas.setAttribute('aria-describedby', 'game-controls');
            const releaseKeys = () => this.heldKeys.clear();
            canvas.addEventListener('keydown', event => {
                if (!Object.hasOwn(bindings, event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
                event.preventDefault();
                this.heldKeys.add(event.code);
            });
            canvas.addEventListener('keyup', event => this.heldKeys.delete(event.code));
            canvas.addEventListener('blur', releaseKeys);
            this.game.events.on(Phaser.Core.Events.BLUR, releaseKeys);

            const moveFromButton = event => {
                const [x, y] = vectors[event.currentTarget.dataset.direction];
                this.move(x * 10, y * 10);
            };
            const buttons = Array.from(controls.querySelectorAll('button'));
            buttons.forEach(button => button.addEventListener('click', moveFromButton));
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                this.game.events.off(Phaser.Core.Events.BLUR, releaseKeys);
                buttons.forEach(button => button.removeEventListener('click', moveFromButton));
            });

            status.hidden = true;
            controls.hidden = false;
            if (document.activeElement === document.body) canvas.focus({ preventScroll: true });
        }

        update(_time, delta) {
            if (this.heldKeys.size === 0) return;
            const active = new Set(Array.from(this.heldKeys, code => bindings[code]));
            const x = Number(active.has('east')) - Number(active.has('west'));
            const y = Number(active.has('south')) - Number(active.has('north'));
            const length = Math.hypot(x, y);
            if (length === 0) return;
            const distance = speed * Math.min(delta, 40) / 1000;
            this.move(x * distance / length, y * distance / length);
        }

        canStand(x, y) {
            for (const foot of [x - 3, x + 3]) {
                const tile = this.terrain[Math.floor(y / tileSize)]?.[Math.floor(foot / tileSize)];
                if (tile === undefined || tile < 16 || tile === 34) return false;
                if (this.obstacles.some(bounds => bounds.contains(foot, y))) return false;
            }
            return true;
        }

        move(x, y) {
            const direction = directions[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8];
            const texture = this.skin + '-' + direction;
            if (this.avatar.texture.key !== texture) this.avatar.setTexture(texture);

            // Limit each step so keyboard and touch use the same collision checks.
            const steps = Math.ceil(Math.max(Math.abs(x), Math.abs(y)) / 2);
            for (let step = 0; step < steps; step++) {
                const nextX = this.position.x + x / steps;
                const nextY = this.position.y + y / steps;
                if (this.canStand(nextX, this.position.y)) this.position.x = nextX;
                if (this.canStand(this.position.x, nextY)) this.position.y = nextY;
            }
            this.avatar.setPosition(this.position.x, this.position.y).setDepth(this.position.y);
        }
    }

    new Phaser.Game({
        type: Phaser.AUTO,
        parent: world,
        width: width * renderScale,
        height: height * renderScale,
        antialias: false,
        roundPixels: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { keyboard: false },
        audio: { noAudio: true },
        scene: ValDesSaules,
    });
})();
