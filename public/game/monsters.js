// Définition des espèces de monstres, génération pixel-art et IA de patrouille/combat
import { inZone, zones } from './exploration.js';

const stepDirections = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const dragonFrames = 9;

export const monsterTemplates = {
    boar: {
        species: 'boar',
        label: 'Sanglier',
        minLevel: 1,
        maxLevel: 5,
        attackRange: 20,
        aggroRange: 48,
        zone: zones.boar,
        patrolCells: [[8, 14], [6, 11], [21, 20], [25, 22], [28, 7], [28, 12]],
        respawnMs: 4000,
        statsForLevel(level) {
            const offset = Math.max(0, level - 1);
            return {
                maxHealth: 52 + offset * 14 + offset ** 2 * 8,
                damage: 6 + offset + offset ** 2,
                patrolSpeed: 42,
                chaseSpeed: 100 + offset * 3,
                windupMs: 240,
                attackIntervalMs: 1100 - offset * 40,
                xp: 30 + level * 12,
            };
        },
    },
    skeleton: {
        species: 'skeleton',
        label: 'Squelette',
        minLevel: 5,
        maxLevel: 10,
        attackRange: 24,
        aggroRange: 64,
        zone: zones.skeleton,
        patrolCells: [[75, 58], [86, 59], [81, 65], [89, 67], [86, 69], [75, 68]],
        respawnMs: 5000,
        statsForLevel(level) {
            const offset = Math.max(0, level - 5);
            return {
                maxHealth: 260 + offset * 30 + offset ** 2 * 8,
                damage: 26 + offset * 3 + Math.floor(offset ** 2 * .6),
                patrolSpeed: 28,
                chaseSpeed: 94 + offset * 2,
                windupMs: 320,
                attackIntervalMs: 1300 - offset * 40,
                xp: 60 + level * 14,
            };
        },
    },
    dragon: {
        species: 'dragon',
        label: 'Saphyr (Dragon)',
        minLevel: 10,
        maxLevel: 20,
        attackRange: 88,
        aggroRange: 112,
        zone: zones.dragon,
        patrolCells: [[126, 86], [136, 87], [141, 94], [132, 97], [124, 93], [137, 96]],
        respawnMs: 6500,
        statsForLevel(level) {
            const offset = Math.max(0, level - 10);
            return {
                maxHealth: 800 + offset * 70 + offset ** 2 * 10,
                damage: 60 + offset * 5 + Math.floor(offset ** 2 * .5),
                patrolSpeed: 36,
                chaseSpeed: 98 + offset * 2,
                windupMs: 450,
                attackIntervalMs: 1500 - offset * 30,
                xp: 120 + level * 18,
            };
        },
    },
};

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Dessine une matrice de pixels (chaînes de caractères) dans un canvas texture Phaser.
 */
function paintGrid(ctx, ox, oy, grid, palette) {
    for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        for (let x = 0; x < row.length; x++) {
            const ch = row[x];
            if (ch === '.' || !palette[ch]) continue;
            ctx.fillStyle = palette[ch];
            ctx.fillRect(ox + x, oy + y, 1, 1);
        }
    }
}

/**
 * Génère les textures pixel art des sangliers et des squelettes dans le cache Phaser.
 */
export function ensureMonsterTextures(scene) {
    if (!scene.textures.exists('boar-pixel')) {
        const tex = scene.textures.createCanvas('boar-pixel', 48, 24);
        const ctx = tex.getContext();
        const palette = {
            o: '#221512',
            b: '#6e4534',
            d: '#4d2d21',
            l: '#946249',
            t: '#f4ead2',
            e: '#ff5247',
            h: '#2d1c17',
        };
        // Frame 0 : Idle / Marche 1 (24x24)
        const boarFrame0 = [
            '........................',
            '........................',
            '........................',
            '........oooooo..........',
            '......oobbbbbboo........',
            '.....obbbllllbbbo.......',
            '....obbbllllllbbbo......',
            '...obddbbbbbbbbbbbo.....',
            '..obdtebbbbbbbbbbddo....',
            '..obdeebbbbbbbbbbddo....',
            '..obbbbbbbbbbbbbbbdo....',
            '...oottobbbbbbbbddo.....',
            '.....ooobddbbbbddo......',
            '.......ohbo..ohbo.......',
            '.......ohbo..ohbo.......',
            '.......ooo....ooo.......',
        ];
        // Frame 1 : Marche 2 / Charge (24x24)
        const boarFrame1 = [
            '........................',
            '........................',
            '........................',
            '.......oooooo...........',
            '.....oobbbbbboo.........',
            '....obbbllllbbbo........',
            '...obbbllllllbbbo.......',
            '..obddbbbbbbbbbbbo......',
            '.obdtebbbbbbbbbbddo.....',
            '.obdeebbbbbbbbbbddo.....',
            '.obbbbbbbbbbbbbbbdo.....',
            '..oottobbbbbbbbddo......',
            '....ooobddbbbbddo.......',
            '......ohbo....ohbo......',
            '.....ohbo......ohbo.....',
            '.....ooo........ooo.....',
        ];
        paintGrid(ctx, 0, 4, boarFrame0, palette);
        paintGrid(ctx, 24, 4, boarFrame1, palette);
        tex.refresh();
        tex.add(0, 0, 0, 0, 24, 24);
        tex.add(1, 0, 24, 0, 24, 24);
    }

    if (!scene.textures.exists('skeleton-pixel')) {
        const tex = scene.textures.createCanvas('skeleton-pixel', 48, 28);
        const ctx = tex.getContext();
        const palette = {
            o: '#1a1b24',
            w: '#e8e4d8',
            s: '#b5b0a1',
            d: '#76736c',
            e: '#7be0ff',
            b: '#9aa4b8',
            h: '#7a5238',
        };
        const skel0 = [
            '.........oooooo.........',
            '........owwwwwwo........',
            '.......owwwwwwwwo.......',
            '.......owooeeoowo.......',
            '.......owwwwwwwwo.......',
            '........owossoo.........',
            '.........owwwo..........',
            '......ooowssswooo.......',
            '.....oww.owwwo.wwo......',
            '....owwo.owwwo.owwo.....',
            '....owo..owwwo..owb.....',
            '.........owwwo...ob.....',
            '........owsoowo..ob.....',
            '........owo.owo..oh.....',
            '........owo.owo.........',
            '.......owo...owo........',
            '.......oo.....oo........',
        ];
        const skel1 = [
            '.........oooooo.........',
            '........owwwwwwo........',
            '.......owwwwwwwwo.......',
            '.......owooeeoowo.......',
            '.......owwwwwwwwo.......',
            '........owossoo.........',
            '.........owwwo..........',
            '......ooowssswooo.......',
            '.....oww.owwwo.wwo......',
            '....owwo.owwwo.owwbb....',
            '....owo..owwwo..owh.....',
            '.........owwwo..........',
            '........owsoowo.........',
            '.......owo...owo........',
            '......owo.....owo.......',
            '......oo.......oo.......',
            '........................',
        ];
        paintGrid(ctx, 0, 5, skel0, palette);
        paintGrid(ctx, 24, 5, skel1, palette);
        tex.refresh();
        tex.add(0, 0, 0, 0, 24, 28);
        tex.add(1, 0, 24, 0, 24, 28);
    }
}

export class Monster {
    constructor(scene, species, directions, tileSize, initialSpawnIndex = 0) {
        this.scene = scene;
        this.species = species;
        this.template = monsterTemplates[species];
        this.directions = directions;
        this.tileSize = tileSize;
        this.columns = scene.terrain[0].length;
        this.cells = scene.terrain.flatMap((row, y) => row.map((_, x) => ({
            x: (x + 0.5) * tileSize,
            y: (y + 0.5) * tileSize,
        })));
        this.walkable = this.cells.map((cell) => inZone(this.template.zone, cell.x, cell.y)
            && scene.canStand(cell.x, cell.y));
        const patrolCells = species === 'boar'
            ? this.template.patrolCells.slice(initialSpawnIndex, initialSpawnIndex + 2)
            : this.template.patrolCells;
        this.patrol = patrolCells
            .map(([x, y]) => y * this.columns + x)
            .filter((index) => this.walkable[index]);
        if (this.patrol.length === 0) {
            this.patrol = this.walkable
                .map((ok, index) => (ok ? index : -1))
                .filter((index) => index >= 0);
        }

        const initialTexture = species === 'dragon'
            ? 'saphyr-idle'
            : (species === 'boar' ? 'boar-pixel' : 'skeleton-pixel');

        this.sprite = scene.add.image(0, 0, initialTexture).setInteractive({ useHandCursor: true });
        this.shadow = scene.add.ellipse(
            0,
            0,
            species === 'dragon' ? 27 : 18,
            species === 'dragon' ? 9 : 6,
            0x172622,
            0.5,
        ).setDepth(3);

        // Anneau de sélection sous le monstre ciblé
        this.targetRing = scene.add.ellipse(0, 0, species === 'dragon' ? 30 : 20, species === 'dragon' ? 11 : 8)
            .setStrokeStyle(1.5, 0xf0c781, 0.95)
            .setDepth(4)
            .setVisible(false);

        // Mini barre de vie + niveau au-dessus du monstre
        this.hpBg = scene.add.rectangle(0, 0, 26, 3, 0x101719, 0.9).setDepth(340);
        this.hpFill = scene.add.rectangle(0, 0, 24, 2, 0xd76c61, 1).setOrigin(0, 0.5).setDepth(341);
        this.nameTag = scene.add.text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '7px',
            color: '#f7eddd',
            stroke: '#101719',
            strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(342);

        this.respawnAt = Infinity;
        this.stunUntil = 0;
        this.slowUntil = 0;
        this.counterAt = Infinity;
        this.attackEndsAt = 0;

        this.spawnLevel = Math.min(this.template.maxLevel, this.template.minLevel + initialSpawnIndex);
        const spawnIdx = this.patrol[species === 'boar' ? 0 : initialSpawnIndex % this.patrol.length];
        this.place(spawnIdx, this.spawnLevel);
    }

    get name() {
        return this.template.label;
    }

    get isAlive() {
        return this.health > 0 && this.sprite.visible;
    }

    cellAt(x, y) {
        return Math.floor(y / this.tileSize) * this.columns + Math.floor(x / this.tileSize);
    }

    place(index, level) {
        const { x, y } = this.cells[index];
        this.level = level;
        this.stats = this.template.statsForLevel(level);
        this.maxHealth = this.stats.maxHealth;
        this.health = this.maxHealth;
        this.xpReward = this.stats.xp;

        this.sprite.setPosition(x, y).clearTint().setVisible(true);
        this.shadow.setVisible(true);
        this.hpBg.setVisible(true);
        this.hpFill.setVisible(true);
        this.nameTag.setVisible(true).setText(`${this.template.label} N.${this.level}`);

        this.home = index;
        this.patrolIndex = Math.max(0, this.patrol.indexOf(index));
        this.alert = false;
        this.cancelAttack();
        this.facing = 3;
        this.walkDistance = 0;
        this.path = [];
        this.nextRouteAt = 0;
        this.destination = null;
        this.stunUntil = 0;
        this.slowUntil = 0;
        this.counterAt = Infinity;

        this.renderPose(0);
        this.syncOverlays();
    }

    respawn(player) {
        const alternatives = this.patrol.filter((index) => index !== this.home);
        const away = alternatives.filter((index) => {
            const cell = this.cells[index];
            return Math.hypot(cell.x - player.x, cell.y - player.y) >= 64;
        });
        const pool = away.length ? away : (alternatives.length ? alternatives : this.patrol);
        const nextLevel = this.species === 'boar'
            ? randomInt(Math.max(this.template.minLevel, this.spawnLevel - 1), Math.min(this.template.maxLevel, this.spawnLevel + 1))
            : randomInt(this.template.minLevel, this.template.maxLevel);
        this.place(pool[Math.floor(Math.random() * pool.length)], nextLevel);
    }

    hide() {
        this.cancelAttack();
        this.alert = false;
        this.counterAt = Infinity;
        this.sprite.clearTint().setVisible(false);
        this.shadow.setVisible(false);
        this.targetRing.setVisible(false);
        this.hpBg.setVisible(false);
        this.hpFill.setVisible(false);
        this.nameTag.setVisible(false);
    }

    pursue() {
        if (this.alert) return;
        this.alert = true;
        this.path = [];
        this.nextRouteAt = 0;
        this.counterAt = 0;
    }

    cancelAttack() {
        this.attackEndsAt = 0;
        this.attackVisual = null;
        this.breath = null;
        this.sprite.clearTint();
    }

    canAttack(player) {
        if (!inZone(this.template.zone, player.x, player.y)) return false;
        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        if (distance > this.template.attackRange) return false;
        const steps = Math.max(1, Math.ceil(distance / 4));
        for (let step = 1; step <= steps; step++) {
            if (!this.scene.canStand(this.sprite.x + dx * step / steps, this.sprite.y + dy * step / steps)) return false;
        }
        return true;
    }

    startAttack(player, now) {
        this.face(player.x - this.sprite.x, player.y - this.sprite.y);
        const castEnd = now + this.stats.windupMs;
        this.attackEndsAt = castEnd + (this.species === 'dragon' ? 250 : 0);
        this.attackVisual = {
            start: now, castEnd, end: this.attackEndsAt,
            x: this.sprite.x, y: this.sprite.y - 12,
            angle: Math.atan2(player.y - this.sprite.y, player.x - this.sprite.x),
        };
        if (this.species === 'dragon') {
            this.breath = {
                start: now,
                strike: castEnd,
                end: this.attackEndsAt,
            };
            this.sprite.setTint(0xb0f5ff);
        } else if (this.species === 'boar') {
            this.sprite.setTint(0xffb49a);
        } else {
            this.sprite.setTint(0xd7e8ff);
        }
    }

    face(dx, dy) {
        this.facing = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    }

    setSelected(selected) {
        this.targetRing.setVisible(selected && this.isAlive);
    }

    syncOverlays() {
        if (!this.sprite.visible) return;
        const x = Math.round(this.sprite.x);
        const y = Math.round(this.sprite.y);
        const headOffset = this.species === 'dragon' ? 24 : 18;
        this.shadow.setPosition(x, y + (this.species === 'dragon' ? 11 : 7));
        this.targetRing.setPosition(x, y + (this.species === 'dragon' ? 10 : 6));
        const overlayDepth = this.scene.terrain.length * this.tileSize + 2;
        this.hpBg.setPosition(x, y - headOffset).setDepth(overlayDepth);
        const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
        this.hpFill.setPosition(x - 12, y - headOffset).setDisplaySize(Math.max(0, 24 * ratio), 2).setDepth(overlayDepth + 1);
        this.nameTag.setPosition(x, y - headOffset - 3).setDepth(overlayDepth + 2);
    }

    renderPose(now) {
        if (this.species === 'dragon') {
            if (this.breath && now < this.breath.end) {
                const { start, strike, end } = this.breath;
                const frame = now < strike
                    ? Math.min(3, Math.floor(4 * (now - start) / Math.max(1, strike - start)))
                    : Math.min(8, 4 + Math.floor(5 * (now - strike) / Math.max(1, end - strike)));
                const direction = this.directions[this.facing];
                if (direction.startsWith('north')) {
                    this.renderDragon('saphyr-idle', this.facing);
                } else {
                    this.renderDragon('saphyr-breath', frame + (direction === 'south' ? dragonFrames : 0), direction.includes('west'));
                }
                return;
            }
            this.breath = null;
            return;
        }

        const textureKey = this.species === 'boar' ? 'boar-pixel' : 'skeleton-pixel';
        const frame = now < this.attackEndsAt ? 1 : Math.floor(this.walkDistance / 6) % 2;
        const flipX = this.directions[this.facing]?.includes('west') ?? false;
        this.sprite.setTexture(textureKey, frame).setFlipX(flipX).setDepth(this.sprite.y);
    }

    renderDragon(texture, frame, flip = false) {
        if (this.sprite.texture.key !== texture || this.sprite.frame.name !== frame) {
            this.sprite.setTexture(texture, frame);
        }
        this.sprite.setFlipX(flip).setDepth(this.sprite.y);
    }

    update(now, delta, player) {
        if (!this.sprite.visible) return;

        if (this.alert && !inZone(this.template.zone, player.x, player.y)) {
            this.alert = false;
            this.counterAt = Infinity;
            this.cancelAttack();
            this.path = this.route(this.home);
            this.destination = null;
        }

        if (now < this.stunUntil) {
            this.sprite.setTint(0x9be0de);
            this.syncOverlays();
            return;
        }

        if (now < this.attackEndsAt) {
            this.renderPose(now);
            this.syncOverlays();
            return;
        }
        this.breath = null;

        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        if (!this.alert && this.scene.combat?.health > 0 && distance <= this.template.aggroRange
            && inZone(this.template.zone, player.x, player.y)) this.pursue();
        const slowFactor = now < this.slowUntil ? 0.5 : 1;
        const baseSpeed = this.alert ? this.stats.chaseSpeed : this.stats.patrolSpeed;
        const step = baseSpeed * slowFactor * Math.min(delta, 40) / 1000;
        const meleeDist = this.template.attackRange - 3;
        let moved = false;

        if (this.alert && distance <= meleeDist && this.canAttack(player)) {
            this.face(dx, dy);
        } else if (this.alert && distance <= 36 && this.advance(player, Math.min(step, distance - meleeDist))) {
            moved = true;
        } else {
            if (this.alert && now >= this.nextRouteAt) {
                const destination = this.cellAt(player.x, player.y);
                if (destination !== this.destination || this.path.length === 0) {
                    this.path = this.route(destination);
                    this.destination = destination;
                }
                this.nextRouteAt = now + 260;
            } else if (!this.alert && this.path.length === 0 && now >= this.nextRouteAt) {
                this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
                this.path = this.route(this.patrol[this.patrolIndex]);
                this.nextRouteAt = now + (this.species === 'boar' ? 550 : 1000);
            }
            if (this.path.length) {
                const target = this.path[0];
                moved = this.advance(target, step);
                if (!moved || Math.hypot(target.x - this.sprite.x, target.y - this.sprite.y) < 0.1) {
                    this.path.shift();
                }
            }
        }

        if (this.species === 'dragon') {
            if (moved) {
                this.renderDragon('saphyr-walk', this.facing * dragonFrames + Math.floor(this.walkDistance / 5) % dragonFrames);
            } else {
                this.renderDragon('saphyr-idle', this.facing);
            }
        } else {
            this.renderPose(now);
        }

        this.syncOverlays();
    }

    advance(target, step) {
        const dx = target.x - this.sprite.x;
        const dy = target.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.01 || step <= 0) return false;
        const traveled = Math.min(distance, step);
        const x = this.sprite.x + dx * traveled / distance;
        const y = this.sprite.y + dy * traveled / distance;
        if (!inZone(this.template.zone, x, y) || !this.scene.canStand(x, y)) return false;
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
            const col = index % this.columns;
            const row = (index - col) / this.columns;
            for (const [dx, dy] of stepDirections) {
                const next = (row + dy) * this.columns + (col + dx);
                if (col + dx < 0 || col + dx >= this.columns || !this.walkable[next] || parents.has(next)) continue;
                parents.set(next, index);
                queue.push(next);
            }
        }
        const path = [];
        for (let index = closest; index !== null && index !== origin; index = parents.get(index)) {
            path.push(this.cells[index]);
        }
        return path.reverse();
    }
}
