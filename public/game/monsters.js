// Définition des espèces de monstres, génération pixel-art et IA de patrouille/combat

const stepDirections = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const dragonFrames = 9;

export const monsterTemplates = {
    boar: {
        species: 'boar',
        label: 'Sanglier',
        minLevel: 1,
        maxLevel: 5,
        attackType: 'melee',
        meleeDistance: 17,
        patrolCells: [[4, 14], [7, 16], [10, 13], [5, 11], [9, 9], [6, 8]],
        respawnMs: 4000,
        statsForLevel(level) {
            const offset = Math.max(0, level - 1);
            return {
                maxHealth: 28 + offset * 12,
                damage: 4 + offset * 2,
                patrolSpeed: 42,
                chaseSpeed: 84 + offset * 5,
                warningMs: Math.max(240, 380 - offset * 25),
                counterIntervalMs: Math.max(900, 1250 - offset * 60),
                attackRadius: 22,
                xp: 30 + level * 12,
            };
        },
    },
    skeleton: {
        species: 'skeleton',
        label: 'Squelette',
        minLevel: 5,
        maxLevel: 10,
        attackType: 'slash',
        meleeDistance: 19,
        patrolCells: [[21, 6], [23, 9], [20, 12], [24, 15], [18, 6], [22, 17]],
        respawnMs: 5000,
        statsForLevel(level) {
            const offset = Math.max(0, level - 5);
            return {
                maxHealth: 65 + offset * 18,
                damage: 8 + offset * 2,
                patrolSpeed: 28,
                chaseSpeed: 54 + offset * 3,
                warningMs: Math.max(420, 620 - offset * 30),
                counterIntervalMs: Math.max(1300, 1750 - offset * 60),
                attackRadius: 26,
                xp: 60 + level * 14,
            };
        },
    },
    dragon: {
        species: 'dragon',
        label: 'Saphyr (Dragon)',
        minLevel: 10,
        maxLevel: 20,
        attackType: 'aoe',
        meleeDistance: 22,
        patrolCells: [[19, 10], [14, 9], [11, 4], [15, 17], [19, 14], [16, 12]],
        respawnMs: 6500,
        statsForLevel(level) {
            const offset = Math.max(0, level - 10);
            return {
                maxHealth: 140 + offset * 28,
                damage: 14 + offset * 3,
                patrolSpeed: 36,
                chaseSpeed: 74 + offset * 3,
                warningMs: Math.max(580, 880 - offset * 22),
                counterIntervalMs: Math.max(1450, 2000 - offset * 45),
                attackRadius: 44 + offset * 2,
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
        this.walkable = this.cells.map((cell) => scene.canStand(cell.x, cell.y));
        this.patrol = this.template.patrolCells
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
        this.warningEndsAt = 0;

        const spawnIdx = this.patrol[initialSpawnIndex % this.patrol.length];
        this.place(spawnIdx, randomInt(this.template.minLevel, this.template.maxLevel));
    }

    get name() {
        return this.template.label;
    }

    get attackType() {
        return this.template.attackType;
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
        this.breath = null;
        this.facing = 3;
        this.walkDistance = 0;
        this.path = [];
        this.nextRouteAt = 0;
        this.destination = null;
        this.stunUntil = 0;
        this.slowUntil = 0;
        this.counterAt = Infinity;
        this.warningEndsAt = 0;

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
        const nextLevel = randomInt(this.template.minLevel, this.template.maxLevel);
        this.place(pool[Math.floor(Math.random() * pool.length)], nextLevel);
    }

    hide() {
        this.breath = null;
        this.alert = false;
        this.warningEndsAt = 0;
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
    }

    startAttack(player, now) {
        this.face(player.x - this.sprite.x, player.y - this.sprite.y);
        if (this.species === 'dragon') {
            this.breath = {
                start: now,
                strike: now + this.stats.warningMs,
                end: now + this.stats.warningMs + 270,
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
        this.hpBg.setPosition(x, y - headOffset);
        const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
        this.hpFill.setPosition(x - 12, y - headOffset).setDisplaySize(Math.max(0, 24 * ratio), 2);
        this.nameTag.setPosition(x, y - headOffset - 3);
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
        const frame = Math.floor(this.walkDistance / 6) % 2;
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

        if (now < this.stunUntil) {
            this.sprite.setTint(0x9be0de);
            this.syncOverlays();
            return;
        }

        if (this.species === 'dragon' && this.breath && now < this.breath.end) {
            this.renderPose(now);
            this.syncOverlays();
            return;
        }
        this.breath = null;

        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);
        const slowFactor = now < this.slowUntil ? 0.5 : 1;
        const baseSpeed = this.alert ? this.stats.chaseSpeed : this.stats.patrolSpeed;
        const step = baseSpeed * slowFactor * Math.min(delta, 40) / 1000;
        const meleeDist = this.template.meleeDistance;
        let moved = false;

        if (this.alert && distance <= meleeDist) {
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
