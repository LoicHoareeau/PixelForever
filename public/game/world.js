(() => {
    const world = document.getElementById('world');
    const status = document.getElementById('game-status');
    const controls = document.querySelector('.game-directions');

    if (!window.Phaser) {
        status.textContent = 'Le moteur de jeu n’a pas pu se charger. Recharge la page pour réessayer.';
        return;
    }

    const { Phaser } = window;
    const width = 768;
    const height = 512;
    const speed = 105;
    const bindings = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowDown: 'down', KeyS: 'down',
        ArrowRight: 'right', KeyD: 'right',
    };
    const directions = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };

    // Each polygon follows the walkable ground on the painted map.
    const walkable = [
        // Hamlet and stairs
        [165, 124, 207, 108, 250, 110, 265, 130, 226, 164, 238, 194, 265, 205, 264, 240, 232, 236, 223, 205, 186, 194, 204, 170, 188, 145],
        // Central clearing
        [250, 224, 314, 209, 355, 188, 420, 180, 466, 207, 514, 223, 532, 251, 510, 300, 465, 326, 413, 368, 270, 367, 226, 345, 189, 319, 195, 293],
        // Bridge
        [34, 319, 81, 301, 169, 300, 213, 278, 229, 294, 201, 328, 162, 318, 81, 320, 48, 339],
        // Ruins and their stairs
        [494, 229, 526, 211, 559, 205, 581, 178, 587, 160, 620, 131, 650, 118, 682, 127, 696, 142, 667, 150, 626, 170, 602, 194, 584, 213, 550, 234, 516, 262],
        // Trail along the woodland
        [389, 350, 427, 345, 424, 369, 394, 403, 367, 434, 373, 450, 436, 474, 477, 509, 435, 511, 403, 485, 356, 469, 337, 448, 342, 420],
    ].map(points => new Phaser.Geom.Polygon(points));

    class Clearing extends Phaser.Scene {
        position = new Phaser.Math.Vector2(225, 151);
        heldKeys = new Set();
        facing = 1;

        preload() {
            this.load.image('clearing', world.dataset.mapUrl);
        }

        create() {
            if (!this.textures.exists('clearing')) {
                status.textContent = 'La carte n’a pas pu se charger. Recharge la page pour réessayer.';
                return;
            }

            this.add.image(0, 0, 'clearing').setOrigin(0).setDisplaySize(width, height);
            this.avatar = this.add.graphics();
            this.drawAvatar();

            const canvas = this.game.canvas;
            canvas.tabIndex = 0;
            canvas.setAttribute('aria-label', 'Carte de la clairière');
            canvas.setAttribute('aria-describedby', 'game-controls');
            canvas.addEventListener('keydown', event => {
                if (!Object.hasOwn(bindings, event.code) || event.ctrlKey || event.altKey || event.metaKey) return;
                event.preventDefault();
                this.heldKeys.add(event.code);
            });
            canvas.addEventListener('keyup', event => this.heldKeys.delete(event.code));
            const releaseKeys = () => this.heldKeys.clear();
            canvas.addEventListener('blur', releaseKeys);
            this.game.events.on(Phaser.Core.Events.BLUR, releaseKeys);

            const moveFromButton = event => {
                const [x, y] = directions[bindings[event.currentTarget.dataset.direction]];
                this.move(x * 12, y * 12);
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

        update(time, delta) {
            if (this.heldKeys.size === 0) return;
            const active = new Set(Array.from(this.heldKeys, code => bindings[code]));
            const x = Number(active.has('right')) - Number(active.has('left'));
            const y = Number(active.has('down')) - Number(active.has('up'));
            const length = Math.hypot(x, y);
            if (length === 0) return;
            const distance = speed * Math.min(delta, 40) / 1000;
            this.move(x * distance / length, y * distance / length);
        }

        move(x, y) {
            const canStand = (px, py) => walkable.some(area => Phaser.Geom.Polygon.Contains(area, px, py));
            // Small steps keep touch and keyboard movement inside narrow paths.
            const steps = Math.ceil(Math.max(Math.abs(x), Math.abs(y)) / 2);
            for (let step = 0; step < steps; step++) {
                const nextX = this.position.x + x / steps;
                const nextY = this.position.y + y / steps;
                if (canStand(nextX, this.position.y)) this.position.x = nextX;
                if (canStand(this.position.x, nextY)) this.position.y = nextY;
            }
            if (x !== 0) this.facing = Math.sign(x);
            this.drawAvatar();
        }

        drawAvatar() {
            const mage = world.dataset.class === 'mage';
            const sprite = this.avatar;
            sprite.setPosition(Math.round(this.position.x), Math.round(this.position.y));
            sprite.setScale(this.facing, 1);
            sprite.clear();
            sprite.fillStyle(0x10141d, .44).fillEllipse(0, 0, 23, 8);
            sprite.fillStyle(0x191624).fillRect(-7, -16, 14, 16).fillRect(-5, -23, 10, 10);
            sprite.fillStyle(mage ? 0x7562bf : 0x3b8090).fillRect(-5, -13, 10, 10);
            sprite.fillStyle(0xf0bc8f).fillRect(-3, -21, 6, 7);
            sprite.fillStyle(mage ? 0x55418b : 0x8fa6b2).fillRect(-5, -23, 10, 4);
            sprite.fillStyle(0xebe0b3).fillRect(7, -18, 3, 5);
            sprite.fillStyle(0x76513e).fillRect(8, -13, 2, 11);
        }
    }

    new Phaser.Game({
        type: Phaser.AUTO,
        parent: world,
        width,
        height,
        pixelArt: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { keyboard: false },
        audio: { noAudio: true },
        scene: Clearing,
    });
})();
