import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildTerrain, cameraZoom, cliffTile, columns, graves, groundWalkable, inZone, rocks, rows, tileSize, zones } from '../public/game/exploration.js';
import { treePositions } from '../public/game/clearing-art.js';
import { Monster, monsterTemplates } from '../public/game/monsters.js';
import { TrainingCombat } from '../public/game/combat.js';

const clearing = JSON.parse(readFileSync(new URL('../public/game/val-des-saules/terrain.json', import.meta.url)));
const terrain = buildTerrain(clearing);
const obstacles = [
    [116, 31, 48, 16],
    ...treePositions(terrain).map(([x, y]) => [x - 2, y - 4, 4, 5]),
    ...[[160, 177], [271, 163], [286, 224], [148, 231], [306, 231]].map(([x, y]) => [x - 1, y - 3, 3, 4]),
    ...graves.map(([x, y]) => [(x + .5) * 16 - 7, (y + .5) * 16 - 7, 14, 8]),
    ...rocks.map(([x, y]) => [(x + .5) * 16 - 20, (y + .5) * 16 - 7, 40, 8]),
];
const canStand = (x, y) => groundWalkable(terrain, x, y) && [x - 3, x, x + 3].every(foot =>
    !obstacles.some(([left, top, width, height]) => foot >= left && foot < left + width && y >= top && y < top + height));

test('les quatre rebords rocheux bloquent le passage sur toute leur épaisseur', () => {
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            if (x >= 2 && y >= 2 && x < columns - 2 && y < rows - 2) continue;
            assert.equal(terrain[y][x], cliffTile);
            assert.equal(canStand((x + .5) * tileSize, (y + .5) * tileSize), false);
        }
    }
});

test('la clairière reste accessible et les trois zones sont reliées malgré les obstacles', () => {
    assert.equal(terrain.length, rows);
    assert.ok(terrain.every(row => row.length === columns));
    assert.ok(canStand(184, 190));
    assert.ok(canStand(248, 207));
    assert.equal(canStand(-1, 100), false);
    assert.equal(canStand(columns * tileSize, 100), false);
    assert.equal(canStand(100, rows * tileSize), false);
    const start = [11, 11];
    const visited = new Set([start.join(',')]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const next = [x + dx, y + dy];
            if (!visited.has(next.join(',')) && canStand((next[0] + .5) * 16, (next[1] + .5) * 16)) {
                visited.add(next.join(','));
                queue.push(next);
            }
        }
    }
    for (const template of Object.values(monsterTemplates)) {
        for (const [x, y] of template.patrolCells) {
            assert.ok(visited.has([x, y].join(',')), `${template.label} inaccessible en ${x},${y}`);
        }
    }
});

test('le zoom reste modéré et la carte couvre le viewport, même après redimensionnement', () => {
    assert.equal(cameraZoom(1920, 1080), 2);
    assert.equal(cameraZoom(390, 844), 1);
    for (const [width, height] of [[1920, 1080], [390, 844], [2560, 1440], [3840, 2160]]) {
        const zoom = cameraZoom(width, height);
        assert.ok(Number.isInteger(zoom));
        assert.ok(columns * tileSize * zoom >= width);
        assert.ok(rows * tileSize * zoom >= height);
    }
    const startView = { right: 1920 / 2, bottom: 1080 / 2 };
    assert.ok(zones.dragon.left * tileSize > startView.right || zones.dragon.top * tileSize > startView.bottom);
});

// Only display objects are replaced: spawning, routing and movement use the real Monster class.
function display(texture = '') {
    return new Proxy({ visible: true, texture: { key: texture }, frame: { name: 0 } }, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'setPosition') [target.x, target.y] = args;
                if (key === 'setVisible') target.visible = args[0];
                if (key === 'setTexture') { target.texture = { key: args[0] }; target.frame = { name: args[1] }; }
                return target.proxy;
            };
        },
    });
}
const scene = { terrain, canStand, add: Object.fromEntries(['image', 'ellipse', 'rectangle', 'text'].map(type => [type,
    (x, y, texture) => { const object = display(texture); object.proxy = object; return object; },
])) };
const directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

test('apparition, patrouille, poursuite et réapparition restent dans la zone de chaque espèce', () => {
    for (const species of Object.keys(zones)) {
        const monster = new Monster(scene, species, directions, tileSize);
        const zone = zones[species];
        assert.equal(monster.patrol.length, species === 'boar' ? 2 : monsterTemplates[species].patrolCells.length);
        for (let repeat = 0; repeat < 12; repeat++) {
            assert.ok(inZone(zone, monster.sprite.x, monster.sprite.y));
            monster.respawn({ x: 184, y: 190 });
            if (species === 'boar') assert.ok(monster.level <= 2);
        }
        for (const destination of monster.patrol) {
            for (const cell of monster.route(destination)) assert.ok(inZone(zone, cell.x, cell.y));
        }
        const before = { x: monster.sprite.x, y: monster.sprite.y };
        assert.equal(monster.advance({ x: -100, y: -100 }, 10000), false);
        assert.deepEqual({ x: monster.sprite.x, y: monster.sprite.y }, before);
        monster.pursue();
        monster.update(1000, 16, { x: -100, y: -100 });
        assert.equal(monster.alert, false);
        assert.equal(monster.counterAt, Infinity);
        assert.ok(inZone(zone, monster.sprite.x, monster.sprite.y));
    }
});

function battle(species = 'boar') {
    const combat = Object.create(TrainingCombat.prototype);
    const battleScene = { ...scene, position: { x: 0, y: 0 }, avatar: { setTint() {} }, combat };
    const monster = new Monster(battleScene, species, directions, tileSize);
    battleScene.position = { x: monster.sprite.x + 12, y: monster.sprite.y };
    Object.assign(combat, {
        scene: battleScene, monsters: [monster], health: 100, stats: {}, impacts: [],
        refreshVitals() {}, tell() {}, finish() { this.finished = true; },
    });
    monster.pursue();
    return { combat, monster, player: battleScene.position };
}

test('les auto-attaques de chaque espèce frappent une fois après préparation et respectent leur recharge', () => {
    for (const species of Object.keys(monsterTemplates)) {
        const { combat, monster } = battle(species);
        combat.updateMonsterCounter(monster, 100);
        const impact = monster.attackEndsAt;
        assert.ok(impact > 100);
        assert.equal(combat.health, 100);
        combat.updateMonsterCounter(monster, impact - 1);
        assert.equal(combat.health, 100);
        combat.updateMonsterCounter(monster, impact);
        assert.equal(combat.health, 100 - monster.stats.damage);
        combat.updateMonsterCounter(monster, impact);
        assert.equal(combat.health, 100 - monster.stats.damage);
        assert.equal(monster.attackEndsAt, 0);
        combat.updateMonsterCounter(monster, monster.counterAt);
        assert.ok(monster.attackEndsAt > impact);
    }
});

test('un monstre proche engage sans attendre de recevoir un coup', () => {
    const { combat, monster, player } = battle();
    monster.alert = false;
    monster.counterAt = Infinity;
    monster.update(100, 16, player);
    assert.equal(monster.alert, true);
    combat.updateMonsterCounter(monster, 100);
    assert.ok(monster.attackEndsAt > 100);
    assert.equal(combat.health, 100);
});

test('sortir de portée, quitter la zone ou étourdir le monstre évite son attaque', () => {
    for (const cancel of ['range', 'zone', 'stun']) {
        const { combat, monster, player } = battle();
        combat.updateMonsterCounter(monster, 100);
        const impact = monster.attackEndsAt;
        if (cancel === 'range') player.x += 80;
        if (cancel === 'zone') player.x = -100;
        if (cancel === 'stun') monster.stunUntil = impact + 1000;
        combat.updateMonsterCounter(monster, impact);
        assert.equal(combat.health, 100, cancel);
        assert.equal(monster.attackEndsAt, 0, cancel);
    }
});

test('les auto-attaques vérifient les obstacles et les monstres morts ne frappent pas', () => {
    const { combat, monster } = battle('dragon');
    monster.scene.canStand = () => false;
    combat.updateMonsterCounter(monster, 100);
    assert.equal(monster.attackEndsAt, 0);
    monster.scene.canStand = canStand;
    combat.updateMonsterCounter(monster, 200);
    const impact = monster.attackEndsAt;
    monster.scene.canStand = () => false;
    combat.updateMonsterCounter(monster, impact);
    assert.equal(combat.health, 100);
    monster.scene.canStand = canStand;
    combat.updateMonsterCounter(monster, monster.counterAt);
    const nextImpact = monster.attackEndsAt;
    monster.hide();
    combat.updateMonsterCounter(monster, nextImpact);
    assert.equal(combat.health, 100);
});

test('la réduction de dégâts est conservée et la défaite ne déclenche pas un second coup', () => {
    const { combat, monster } = battle();
    monster.stats.damage = 10;
    combat.stats.damageReduction = .2;
    combat.health = 8;
    combat.updateMonsterCounter(monster, 100);
    const impact = monster.attackEndsAt;
    combat.updateMonsterCounter(monster, impact);
    assert.equal(combat.health, 0);
    assert.equal(combat.finished, true);
    assert.equal(combat.impacts.length, 1);
    combat.updateMonsterCounter(monster, impact + 5000);
    assert.equal(combat.impacts.length, 1);
});

test('les niveaux 1–2 restent abordables et la puissance augmente fortement aux niveaux supérieurs', () => {
    const boar = monsterTemplates.boar;
    assert.deepEqual([boar.statsForLevel(1).maxHealth, boar.statsForLevel(1).damage], [52, 6]);
    assert.deepEqual([boar.statsForLevel(2).maxHealth, boar.statsForLevel(2).damage], [74, 8]);
    const strongBoar = new Monster(scene, 'boar', directions, tileSize, 4);
    assert.equal(strongBoar.level, 5);
    assert.ok(strongBoar.patrol.every(index => strongBoar.cells[index].x > 400));
    for (const template of Object.values(monsterTemplates)) {
        let previous = template.statsForLevel(template.minLevel);
        for (let level = template.minLevel + 1; level <= template.maxLevel; level++) {
            const stats = template.statsForLevel(level);
            assert.ok(stats.maxHealth > previous.maxHealth);
            assert.ok(stats.damage > previous.damage);
            assert.ok(stats.attackIntervalMs <= previous.attackIntervalMs);
            assert.ok(stats.windupMs < stats.attackIntervalMs);
            previous = stats;
        }
        const first = template.statsForLevel(template.minLevel);
        assert.ok(previous.maxHealth > first.maxHealth * 2);
        assert.ok(previous.damage > first.damage * 2);
    }
});
