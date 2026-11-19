import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildTerrain, cameraZoom, columns, graves, groundWalkable, inZone, rocks, rows, tileSize, zones } from '../public/game/exploration.js';
import { treePositions } from '../public/game/clearing-art.js';
import { Monster, monsterTemplates } from '../public/game/monsters.js';

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
        assert.equal(monster.patrol.length, monsterTemplates[species].patrolCells.length);
        for (let repeat = 0; repeat < 12; repeat++) {
            assert.ok(inZone(zone, monster.sprite.x, monster.sprite.y));
            monster.respawn({ x: 184, y: 190 });
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
