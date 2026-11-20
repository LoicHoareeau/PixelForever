// Espèces, patrouilles et combat des monstres.
import { inZone, zones } from './exploration.js';
import { monsterArt, monsterFrames, monsterWalkFrames } from './monster-art.js';

const stepDirections = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const breathSpeed = 142;
const breathRadius = 8;

function demonStats(level) {
    const offset = level - 21;
    return {
        maxHealth: 1760 + offset * 145 + offset ** 2 * 9,
        damage: 76 + offset * 6 + Math.floor(offset ** 2 * .36),
        patrolSpeed: 32,
        chaseSpeed: 78 + offset,
        windupMs: 420,
        attackIntervalMs: 1400 - offset * 18,
        xp: 630 + offset * 44 + offset ** 2 * 2,
    };
}

export const monsterTemplates = {
    boar: {
        species: 'boar',
        label: 'Sanglier',
        minLevel: 1,
        maxLevel: 5,
        attackRange: 20,
        aggroRange: 48,
        zone: zones.boar,
        patrolCells: [[8, 14], [6, 11], [16, 31], [31, 36], [38, 12], [47, 22], [44, 35], [53, 39], [37, 8], [51, 10]],
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
                xp: 30 + level * 12 + (level - 1) ** 2 * 2,
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
        patrolCells: [[87, 55], [116, 54], [91, 83], [118, 84], [85, 68], [122, 68], [97, 60], [110, 60], [97, 78], [114, 79], [89, 73], [122, 74]],
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
                xp: 66 + level * 15 + (level - 5) ** 2 * 3,
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
        patrolCells: [[151, 78], [162, 79], [176, 78], [182, 82], [153, 88], [178, 88], [151, 98], [162, 100], [179, 98], [153, 107], [176, 107]],
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
                xp: 108 + level * 20 + Math.round(offset ** 2 * 1.1),
            };
        },
    },
    imp: {
        label: 'Diablotin des cendres', minLevel: 21, maxLevel: 25,
        attackRange: 22, aggroRange: 70, zone: zones.imp, respawnMs: 6000,
        patrolCells: [[205, 81], [225, 81], [231, 89], [208, 91], [228, 100], [206, 103], [223, 109], [234, 102], [212, 84], [214, 107]],
        statsForLevel: demonStats,
    },
    hound: {
        label: 'Molosse infernal', minLevel: 25, maxLevel: 30,
        attackRange: 26, aggroRange: 80, zone: zones.hound, respawnMs: 7000,
        patrolCells: [[203, 124], [224, 124], [230, 134], [204, 136], [226, 147], [206, 150], [214, 131], [228, 152], [201, 145], [221, 138]],
        statsForLevel: demonStats,
    },
    fiend: {
        label: 'Garde de la Brèche', minLevel: 30, maxLevel: 35,
        attackRange: 31, aggroRange: 88, zone: zones.fiend, respawnMs: 8000,
        patrolCells: [[184, 132], [152, 132], [148, 142], [182, 147], [157, 154], [176, 156], [162, 135], [174, 136], [149, 154], [186, 155]],
        statsForLevel: demonStats,
    },
    breach_lord: {
        species: 'breach_lord',
        label: 'Malakor, Seigneur de la Brèche',
        isBoss: true,
        minLevel: 40,
        maxLevel: 40,
        attackRange: 38,
        aggroRange: 136,
        zone: zones.breach_lord,
        patrolCells: [
            [104, 158], [97, 152], [111, 152], [114, 158], [111, 164],
            [97, 164], [94, 158], [104, 150], [104, 166], [99, 158],
        ],
        respawnMs: 30000,
        statsForLevel() {
            return {
                maxHealth: 18500,
                damage: 295,
                patrolSpeed: 24,
                chaseSpeed: 76,
                windupMs: 480,
                attackIntervalMs: 1350,
                xp: 6500,
            };
        },
    },
};

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

export class Monster {
    constructor(scene, species, tileSize, initialSpawnIndex = 0) {
        this.scene = scene;
        this.species = species;
        this.template = monsterTemplates[species];
        this.isBoss = Boolean(this.template.isBoss);
        this.art = monsterArt[species];
        this.tileSize = tileSize;
        this.columns = scene.terrain[0].length;
        this.cells = scene.monsterCells ??= scene.terrain.flatMap((row, y) => row.map((_, x) => ({
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

        const { frame, width, height } = this.art;
        this.sprite = scene.add.image(0, 0, species + '-motion')
            .setOrigin(.5, (this.art.frame - 16) / this.art.frame)
            .setInteractive({
                hitArea: { x: (frame - width) / 2 - 2, y: frame - height - 16, width: width + 4, height: height + 8 },
                hitAreaCallback: (area, x, y) => x >= area.x && x <= area.x + area.width
                    && y >= area.y && y <= area.y + area.height,
                useHandCursor: true,
            });
        this.shadow = scene.add.ellipse(
            0,
            0,
            this.art.shadow,
            species === 'dragon' || this.isBoss ? 11 : 6,
            0x172622,
            0.5,
        ).setDepth(3);

        // Anneau de sélection sous le monstre ciblé
        this.targetRing = scene.add.ellipse(0, 0, this.art.shadow + 4, species === 'dragon' || this.isBoss ? 13 : 8)
            .setStrokeStyle(1.5, this.isBoss ? 0xffa74f : 0xf0c781, 0.95)
            .setDepth(4)
            .setVisible(false);

        // Mini barre de vie + niveau au-dessus du monstre
        this.barWidth = this.isBoss ? 40 : 24;
        this.hpBg = scene.add.rectangle(0, 0, this.barWidth + 2, this.isBoss ? 4 : 3, 0x101719, 0.92).setDepth(340);
        this.hpFill = scene.add.rectangle(0, 0, this.barWidth, this.isBoss ? 3 : 2, this.isBoss ? 0xe58c3a : 0xd76c61, 1)
            .setOrigin(0, 0.5)
            .setDepth(341);
        this.nameTag = scene.add.text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: this.isBoss ? '8px' : '7px',
            fontStyle: this.isBoss ? 'bold' : 'normal',
            color: this.isBoss ? '#ffd78c' : '#f7eddd',
            stroke: '#101719',
            strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(342);

        this.respawnAt = Infinity;
        this.stunUntil = 0;
        this.slowUntil = 0;
        this.counterAt = Infinity;
        this.attackEndsAt = 0;
        this.phase = 1;
        this.attackCounter = 0;

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
        this.phase = 1;
        this.attackCounter = 0;
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
        this.sprite.clearTint();
    }

    nextBossSkill() {
        if (!this.isBoss || this.attackCounter === 0) {
            return 'melee';
        }
        if (this.phase === 2) {
            const slot = this.attackCounter % 3;
            return slot === 1 ? 'seismic_ring' : (slot === 2 ? 'magma_rift' : 'melee');
        }
        return this.attackCounter % 2 === 1 ? 'seismic_ring' : 'melee';
    }

    checkBossPhase() {
        if (this.isBoss && this.phase === 1 && this.health > 0 && this.health <= this.maxHealth * 0.55) {
            this.phase = 2;
            return true;
        }
        return false;
    }

    attackDamage() {
        return this.attackVisual?.damage ?? this.stats.damage;
    }

    currentAttackIntervalMs() {
        return this.isBoss && this.phase === 2
            ? Math.round(this.stats.attackIntervalMs * 0.85)
            : this.stats.attackIntervalMs;
    }

    canAttack(player) {
        if (!inZone(this.template.zone, player.x, player.y)) return false;
        const dx = player.x - this.sprite.x;
        const dy = player.y - this.sprite.y;
        const distance = Math.hypot(dx, dy);

        // Au moment de résoudre une compétence de boss déjà lancée, tester sa géométrie.
        if (this.attackVisual?.bossSkill) {
            return this.hitTestBossSpecial(player);
        }

        const plannedSkill = this.isBoss ? this.nextBossSkill() : 'melee';
        const maxRange = plannedSkill === 'magma_rift'
            ? 165
            : (plannedSkill === 'seismic_ring' ? 128 : this.template.attackRange);
        if (distance > maxRange) return false;
        const steps = Math.max(1, Math.ceil(distance / 4));
        for (let step = 1; step <= steps; step++) {
            if (!this.scene.canStand(this.sprite.x + dx * step / steps, this.sprite.y + dy * step / steps)) return false;
        }
        return true;
    }

    hitTestBossSpecial(player) {
        const visual = this.attackVisual;
        if (!visual) return false;
        if (visual.bossSkill === 'seismic_ring') {
            return Math.hypot(player.x - visual.originX, player.y - visual.originY) <= visual.radius;
        }
        if (visual.bossSkill === 'magma_rift') {
            const relX = player.x - visual.originX;
            const relY = player.y - visual.originY;
            const proj = relX * visual.dirX + relY * visual.dirY;
            const perp = Math.abs(relX * -visual.dirY + relY * visual.dirX);
            return proj >= -6 && proj <= visual.riftRange && perp <= visual.halfWidth;
        }
        return false;
    }

    startAttack(player, now) {
        this.face(player.x - this.sprite.x, player.y - this.sprite.y);
        const angle = Math.atan2(player.y - this.sprite.y, player.x - this.sprite.x);

        if (this.isBoss) {
            const skill = this.nextBossSkill();
            this.attackCounter++;
            if (skill === 'seismic_ring') {
                const castEnd = now + 950;
                this.attackEndsAt = castEnd;
                this.attackVisual = {
                    start: now,
                    castEnd,
                    end: castEnd,
                    x: this.sprite.x,
                    y: this.sprite.y - 24,
                    originX: this.sprite.x,
                    originY: this.sprite.y,
                    radius: 78,
                    angle,
                    bossSkill: 'seismic_ring',
                    label: 'Onde sismique',
                    damage: 390,
                };
                this.sprite.setTint(0xff9a44);
                return;
            }
            if (skill === 'magma_rift') {
                const castEnd = now + 850;
                this.attackEndsAt = castEnd;
                this.attackVisual = {
                    start: now,
                    castEnd,
                    end: castEnd,
                    x: this.sprite.x,
                    y: this.sprite.y - 24,
                    originX: this.sprite.x,
                    originY: this.sprite.y,
                    dirX: Math.cos(angle),
                    dirY: Math.sin(angle),
                    riftRange: 165,
                    halfWidth: 16,
                    angle,
                    bossSkill: 'magma_rift',
                    label: 'Faille de magma',
                    damage: 360,
                };
                this.sprite.setTint(0xff6b38);
                return;
            }
        }

        const castEnd = now + this.stats.windupMs;
        this.attackEndsAt = castEnd + (this.species === 'dragon' ? 250 : 0);
        this.attackVisual = {
            start: now, castEnd, end: this.attackEndsAt,
            x: this.sprite.x, y: this.sprite.y - 12,
            angle,
            damage: this.stats.damage,
        };
        if (this.species === 'dragon') {
            this.attackVisual.projectile = {
                x: this.sprite.x, y: this.sprite.y,
                dx: Math.cos(angle), dy: Math.sin(angle),
                distance: 0, range: this.template.attackRange + 14,
            };
            this.sprite.setTint(0xb0f5ff);
        } else if (this.species === 'boar') {
            this.sprite.setTint(0xffb49a);
        } else if (this.isBoss) {
            this.sprite.setTint(0xffbe7a);
        } else {
            this.sprite.setTint(0xd7e8ff);
        }
    }

    advanceBreath(now, player) {
        const attack = this.attackVisual;
        if (now < attack.castEnd) return 'travel';

        const shot = attack.projectile;
        const distance = Math.min(shot.range, (now - attack.castEnd) * breathSpeed / 1000);
        // Small steps keep collision with scenery and the player reliable on slow frames.
        while (shot.distance < distance) {
            shot.distance = Math.min(distance, shot.distance + 3);
            const x = shot.x + shot.dx * shot.distance;
            const y = shot.y + shot.dy * shot.distance;
            if (!this.scene.canStand(x, y)) return 'miss';
            if (Math.hypot(player.x - x, player.y - y) <= breathRadius) return 'hit';
        }
        return shot.distance === shot.range ? 'miss' : 'travel';
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
        const headOffset = this.art.height - 3;
        this.shadow.setPosition(x, y + 7);
        this.targetRing.setPosition(x, y + 6);
        const overlayDepth = this.scene.terrain.length * this.tileSize + 2;
        this.hpBg.setPosition(x, y - headOffset).setDepth(overlayDepth);
        const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
        const width = this.barWidth ?? 24;
        this.hpFill.setPosition(x - width / 2, y - headOffset).setDisplaySize(Math.max(0, width * ratio), this.isBoss ? 3 : 2).setDepth(overlayDepth + 1);
        this.nameTag.setPosition(x, y - headOffset - 3).setDepth(overlayDepth + 2);
    }

    renderPose(now, moving = false) {
        let pose = 0;
        if (now < this.attackEndsAt && this.attackVisual) {
            const { start, castEnd } = this.attackVisual;
            const preparation = (now - start) / (castEnd - start);
            const attackPose = preparation < .36 ? 0 : preparation < (this.species === 'dragon' ? 1 : .76) ? 1 : 2;
            pose = monsterWalkFrames + 1 + attackPose;
        } else if (moving) {
            pose = 1 + Math.floor(this.walkDistance / this.art.stride * monsterWalkFrames) % monsterWalkFrames;
        }
        const frame = this.facing * monsterFrames + pose;
        if (this.sprite.frame.name !== frame) this.sprite.setFrame(frame);
        this.sprite.setDepth(this.sprite.y);
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

        this.renderPose(now, moved);

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
