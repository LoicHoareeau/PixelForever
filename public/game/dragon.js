const patrolCells = [[19, 10], [14, 9], [11, 4], [6, 14], [15, 17], [19, 14]];
const stepDirections = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const frames = 9;
const meleeDistance = 19;

export class Saphyr {
    constructor(scene, directions, tileSize) {
        this.scene = scene;
        this.directions = directions;
        this.tileSize = tileSize;
        this.columns = scene.terrain[0].length;
        this.cells = scene.terrain.flatMap((row, y) => row.map((_, x) => ({
            x: (x + .5) * tileSize, y: (y + .5) * tileSize,
        })));
        this.walkable = this.cells.map(cell => scene.canStand(cell.x, cell.y));
        this.patrol = patrolCells.map(([x, y]) => y * this.columns + x).filter(index => this.walkable[index]);
        this.sprite = scene.add.image(0, 0, 'saphyr-idle');
        this.shadow = scene.add.ellipse(0, 0, 27, 9, 0x172622, .5).setDepth(3);
        this.place(this.patrol[0]);
    }

    cellAt(x, y) {
        return Math.floor(y / this.tileSize) * this.columns + Math.floor(x / this.tileSize);
    }

    place(index) {
        const { x, y } = this.cells[index];
        this.sprite.setPosition(x, y).clearTint().setVisible(true);
        this.shadow.setVisible(true);
        this.home = index;
        this.patrolIndex = this.patrol.indexOf(index);
        this.alert = false;
        this.breath = null;
        this.facing = 3;
        this.walkDistance = 0;
        this.path = [];
        this.nextRouteAt = 0;
        this.destination = null;
        this.render('saphyr-idle', this.facing);
    }

    respawn(player) {
        const alternatives = this.patrol.filter(index => index !== this.home);
        const away = alternatives.filter(index => {
            const cell = this.cells[index];
            return Math.hypot(cell.x - player.x, cell.y - player.y) >= 64
                && Math.hypot(cell.x - this.sprite.x, cell.y - this.sprite.y) >= 48;
        });
        const pool = away.length ? away : alternatives;
        this.place(pool[Math.floor(Math.random() * pool.length)]);
    }

    hide() {
        this.breath = null;
        this.sprite.clearTint().setVisible(false);
        this.shadow.setVisible(false);
    }

    pursue() {
        if (this.alert) return;
        this.alert = true;
        this.path = [];
        this.nextRouteAt = 0;
    }

    breathe(player, now, warningMs) {
        this.face(player.x - this.sprite.x, player.y - this.sprite.y);
        this.breath = { start: now, strike: now + warningMs, end: now + warningMs + 270 };
        this.sprite.setTint(0xb0f5ff);
    }

    face(dx, dy) {
        this.facing = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    }

    update(now, delta, player) {
        if (!this.sprite.visible) return;
        if (this.breath && now < this.breath.end) {
            const { start, strike, end } = this.breath;
            const frame = now < strike
                ? Math.min(3, Math.floor(4 * (now - start) / (strike - start)))
                : Math.min(8, 4 + Math.floor(5 * (now - strike) / (end - strike)));
            const direction = this.directions[this.facing];
            if (direction.startsWith('north')) this.render('saphyr-idle', this.facing);
            else this.render('saphyr-breath', frame + (direction === 'south' ? frames : 0), direction.includes('west'));
            return;
        }
        this.breath = null;

        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        const step = (this.alert ? 58 : 28) * Math.min(delta, 40) / 1000;
        let moved = false;
        if (this.alert && distance <= meleeDistance) {
            this.face(dx, dy);
        } else if (this.alert && distance <= 32 && this.advance(player, Math.min(step, distance - meleeDistance))) {
            moved = true;
        } else {
            if (this.alert && now >= this.nextRouteAt) {
                const destination = this.cellAt(player.x, player.y);
                if (destination !== this.destination || this.path.length === 0) {
                    this.path = this.route(destination);
                    this.destination = destination;
                }
                this.nextRouteAt = now + 300;
            } else if (!this.alert && this.path.length === 0 && now >= this.nextRouteAt) {
                this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
                this.path = this.route(this.patrol[this.patrolIndex]);
                this.nextRouteAt = now + 1000;
            }
            if (this.path.length) {
                const target = this.path[0];
                moved = this.advance(target, step);
                if (!moved || Math.hypot(target.x - this.sprite.x, target.y - this.sprite.y) < .1) this.path.shift();
            }
        }

        if (moved) this.render('saphyr-walk', this.facing * frames + Math.floor(this.walkDistance / 5) % frames);
        else this.render('saphyr-idle', this.facing);
    }

    advance(target, step) {
        const dx = target.x - this.sprite.x;
        const dy = target.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .01 || step === 0) return false;
        const traveled = Math.min(distance, step);
        const x = this.sprite.x + dx * traveled / distance;
        const y = this.sprite.y + dy * traveled / distance;
        if (!this.scene.canStand(x, y)) return false;
        this.face(dx, dy);
        this.walkDistance += traveled;
        this.sprite.setPosition(x, y);
        return true;
    }

    route(destination) {
        const origin = this.cellAt(this.sprite.x, this.sprite.y);
        const goal = this.cells[destination];
        const parents = new Map([[origin, null]]);
        const queue = [origin];
        let closest = origin;
        let best = Infinity;
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            const { x, y } = this.cells[index];
            const distance = Math.hypot(x - goal.x, y - goal.y);
            if (distance < best) {
                closest = index;
                best = distance;
            }
            if (index === destination) break;
            const column = index % this.columns;
            for (const [dx, dy] of stepDirections) {
                if (column + dx < 0 || column + dx >= this.columns) continue;
                const next = index + dy * this.columns + dx;
                if (!this.walkable[next] || parents.has(next)) continue;
                if (!this.scene.canStand(x + dx * this.tileSize / 2, y + dy * this.tileSize / 2)) continue;
                parents.set(next, index);
                queue.push(next);
            }
        }
        const path = [];
        for (let cell = closest; cell !== origin; cell = parents.get(cell)) path.push(this.cells[cell]);
        return path.reverse();
    }

    render(texture, frame, flip = false) {
        if (this.sprite.texture.key !== texture || this.sprite.frame.name !== frame) {
            this.sprite.setTexture(texture, frame).setOrigin(.5, texture === 'saphyr-idle' ? 1 : 57 / 68);
        }
        this.sprite.setFlipX(flip).setDepth(this.sprite.y);
        this.shadow.setPosition(this.sprite.x, this.sprite.y - 1);
    }
}
