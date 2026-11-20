import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildTerrain,
    cameraZoom,
    cliffTile,
    coastalLookouts,
    columns,
    frontierSpecies,
    groundWalkable,
    inZone,
    isCoastBorderTile,
    rocks,
    rows,
    seaTile,
    tileSize,
    zones,
} from '../public/game/exploration.js';
import { isInStarterTown, nearestTownResident, questNpc, starterSpawn, townObstacles, townResidents } from '../public/game/starter-town.js';
import { treePositions } from '../public/game/clearing-art.js';
import { regionalScenery } from '../public/game/regional-art.js';
import { Monster, monsterTemplates } from '../public/game/monsters.js';
import { monsterArt, monsterAtlasColumns, monsterFrames, monsterWalkFrames } from '../public/game/monster-art.js';
import { TrainingCombat } from '../public/game/combat.js';

const clearing = JSON.parse(readFileSync(new URL('../public/game/val-des-saules/terrain.json', import.meta.url)));
const terrain = buildTerrain(clearing);
const obstacles = [
    [112, 130, 56, 26],
    ...townObstacles,
    ...treePositions(terrain).map(([x, y]) => [x - 2, y - 4, 4, 5]),
    ...[[160, 177], [271, 163], [286, 224], [148, 231], [306, 231]].map(([x, y]) => [x - 1, y - 3, 3, 4]),
    ...rocks.map(([x, y]) => [(x + .5) * 16 - 20, (y + .5) * 16 - 7, 40, 8]),
    ...regionalScenery(tileSize).map(prop => prop.bounds),
];
const canStand = (x, y) => groundWalkable(terrain, x, y) && [x - 3, x, x + 3].every(foot =>
    !obstacles.some(([left, top, width, height]) => foot >= left && foot < left + width && y >= top && y < top + height));

test('les atlas régionaux ont les dimensions de découpe utilisées par Phaser', () => {
    for (const [name, size] of [['regional-ground', 512], ['cemetery-scenery', 256], ['wasteland-scenery', 256]]) {
        const png = readFileSync(new URL(`../public/game/val-des-saules/${name}.png`, import.meta.url));
        assert.equal(png.toString('ascii', 12, 16), 'IHDR');
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size]);
    }
});

test('les quatre rebords côtiers (mer et falaises) bloquent le passage et bordent la péninsule', () => {
    let seaCount = 0;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            const tile = terrain[y][x];
            if (tile === seaTile) {
                seaCount++;
                // Aucune tuile de mer ne doit toucher directement une tuile marchable sans falaise intermédiaire.
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) {
                            assert.equal(
                                groundWalkable(terrain, (nx + .5) * tileSize, (ny + .5) * tileSize),
                                false,
                                `contact direct terre/mer en ${nx},${ny}`,
                            );
                        }
                    }
                }
            }
            if (x >= 2 && y >= 2 && x < columns - 2 && y < rows - 2) continue;
            assert.ok(isCoastBorderTile(tile), `bord non côtier en ${x},${y} : ${tile}`);
            assert.equal(canStand((x + .5) * tileSize, (y + .5) * tileSize), false);
        }
    }
    assert.ok(seaCount > 500, 'la carte doit comporter de larges zones maritimes');
});

test('le départ, les belvédères côtiers et les patrouilles sont accessibles malgré les obstacles', () => {
    assert.equal(terrain.length, rows);
    assert.ok(terrain.every(row => row.length === columns));
    assert.ok(canStand(starterSpawn.x, starterSpawn.y));
    assert.ok(isInStarterTown(starterSpawn.x, starterSpawn.y));
    assert.equal(nearestTownResident(starterSpawn), questNpc);
    assert.ok(Object.values(zones).every(zone => !inZone(zone, starterSpawn.x, starterSpawn.y)));
    assert.equal(canStand(-1, 100), false);
    assert.equal(canStand(columns * tileSize, 100), false);
    assert.equal(canStand(100, rows * tileSize), false);
    const start = [Math.floor(starterSpawn.x / tileSize), Math.floor(starterSpawn.y / tileSize)];
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
    for (const resident of townResidents) {
        assert.ok(queue.some(([x, y]) => nearestTownResident({ x: (x + .5) * tileSize, y: (y + .5) * tileSize }) === resident),
            `${resident.name} inaccessible`);
    }
    assert.ok(visited.has('99,36'), 'la porte est doit rejoindre la route');
    assert.equal(canStand(1006, starterSpawn.y), false, 'la palissade ouest doit bloquer le passage');
    for (const lookout of coastalLookouts) {
        assert.ok(visited.has(lookout.centerCell.join(',')), `${lookout.name} inaccessible`);
    }
    for (const template of Object.values(monsterTemplates)) {
        assert.ok(template.patrolCells.length >= 10, `${template.label} doit avoir au moins 10 points de patrouille`);
        for (const [x, y] of template.patrolCells) {
            assert.ok(visited.has([x, y].join(',')), `${template.label} inaccessible en ${x},${y}`);
        }
    }
});

test('le Bastion bloque le ciblage et les attaques avant toute dépense', () => {
    const combat = Object.assign(Object.create(TrainingCombat.prototype), {
        scene: { isInStarterTown: () => true }, health: 40, mana: 40, readyAt: 0, tell() {},
    });
    assert.equal(combat.cycleTarget(), null);
    combat.attack('special', 100);
    assert.equal(combat.mana, 40);
    assert.equal(combat.readyAt, 0);
    assert.equal(combat.pending, undefined);
});

test('le zoom reste modéré et la carte couvre le viewport, même après redimensionnement', () => {
    assert.equal(cameraZoom(1920, 1080), 2);
    assert.equal(cameraZoom(2560, 1440), 2);
    assert.equal(cameraZoom(390, 844), 2);
    for (const [width, height] of [[1920, 1080], [390, 844], [2560, 1440], [3840, 2160]]) {
        const zoom = cameraZoom(width, height);
        assert.ok(Number.isInteger(zoom));
        assert.ok(columns * tileSize * zoom >= width);
        assert.ok(rows * tileSize * zoom >= height);
    }
    const startView = { right: 1920, bottom: 1080 };
    assert.ok(zones.dragon.left * tileSize > startView.right || zones.dragon.top * tileSize > startView.bottom);
});

test('la route du Trône traverse les trois secteurs N.41–60 jusqu’au belvédère', () => {
    const route = [
        ...Array.from({ length: 59 }, (_, index) => [104, 157 + index]),
        ...Array.from({ length: 107 }, (_, index) => [105 + index, 215]),
        ...Array.from({ length: 24 }, (_, index) => [211, 216 + index]),
    ];
    for (const [x, y] of route) {
        assert.equal(terrain[y][x], 32, `chaussée absente en ${x},${y}`);
        assert.ok(canStand((x + .5) * tileSize, (y + .5) * tileSize), `chaussée bloquée en ${x},${y}`);
    }
    assert.deepEqual(frontierSpecies.map((species) => {
        const { minLevel, maxLevel, patrolCells } = monsterTemplates[species];
        const zone = zones[species];
        assert.ok(route.some(([x, y]) => inZone(zone, (x + .5) * tileSize, (y + .5) * tileSize)));
        assert.ok(patrolCells.every(([x, y]) => inZone(zone, (x + .5) * tileSize, (y + .5) * tileSize)));
        return [minLevel, maxLevel];
    }), [[41, 47], [48, 54], [55, 60]]);
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
                if (key === 'setFrame') target.frame = { name: args[0] };
                return target.proxy;
            };
        },
    });
}
const scene = { terrain, canStand, add: Object.fromEntries(['image', 'ellipse', 'rectangle', 'text'].map(type => [type,
    (x, y, texture) => { const object = display(texture); object.proxy = object; return object; },
])) };

test('apparition, patrouille, poursuite et réapparition restent dans la zone de chaque espèce', () => {
    for (const species of Object.keys(zones)) {
        const monster = new Monster(scene, species, tileSize);
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
    const monster = new Monster(battleScene, species, tileSize);
    battleScene.position = { x: monster.sprite.x + 12, y: monster.sprite.y };
    Object.assign(combat, {
        scene: battleScene, monsters: [monster], health: 500, stats: {}, impacts: [],
        refreshVitals() {}, tell() {}, finish() { this.finished = true; },
    });
    monster.pursue();
    return { combat, monster, player: battleScene.position };
}

test('les attaques de mêlée frappent une fois après préparation et respectent leur recharge', () => {
    for (const species of Object.keys(monsterTemplates).filter(species => species !== 'dragon')) {
        const { combat, monster } = battle(species);
        combat.updateMonsterCounter(monster, 100);
        const impact = monster.attackEndsAt;
        assert.ok(impact > 100);
        assert.equal(combat.health, 500);
        combat.updateMonsterCounter(monster, impact - 1);
        assert.equal(combat.health, 500);
        combat.updateMonsterCounter(monster, impact);
        assert.equal(combat.health, 500 - monster.stats.damage);
        combat.updateMonsterCounter(monster, impact);
        assert.equal(combat.health, 500 - monster.stats.damage);
        assert.equal(monster.attackEndsAt, 0);
        combat.updateMonsterCounter(monster, monster.counterAt);
        assert.ok(monster.attackEndsAt > impact);
    }
});

test('les monstres N.1–10 restent neutres à proximité et les N.11+ engagent le joueur', () => {
    const { combat, monster, player } = battle('boar');
    monster.level = 5;
    monster.alert = false;
    monster.counterAt = Infinity;
    monster.update(100, 16, player);
    assert.equal(monster.alert, false);

    const { monster: dragon, player: dragonPlayer } = battle('dragon');
    dragon.level = 12;
    dragon.alert = false;
    dragon.update(100, 16, dragonPlayer);
    assert.equal(dragon.alert, true);
    combat.updateMonsterCounter(monster, 100);
    assert.equal(monster.attackEndsAt, 0);
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
        assert.equal(combat.health, 500, cancel);
        assert.equal(monster.attackEndsAt, 0, cancel);
    }
});

test('les variantes côtières annoncent leurs attaques, frappent une seule fois et laissent une esquive', () => {
    for (const species of frontierSpecies) {
        const template = monsterTemplates[species];
        for (const [index, [kind, config]] of Object.entries(template.specials).entries()) {
            for (const dodge of [false, true]) {
                const { combat, monster, player } = battle(species);
                const [x, y] = [(template.zone.left + 16) * tileSize, (template.zone.top + 17) * tileSize];
                monster.sprite.setPosition(x, y);
                monster.attackCounter = index + 1;
                Object.assign(player, { x: x + config.range + 1, y });
                combat.health = 1500;
                combat.updateMonsterCounter(monster, 100);
                assert.equal(monster.attackVisual, null, 'hors de portée');
                player.x = x + config.range - 4;
                combat.updateMonsterCounter(monster, 110);
                assert.equal(monster.attackVisual.special, kind);
                assert.equal(monster.attackVisual.label, config.label);
                const impact = monster.attackEndsAt;
                combat.updateMonsterCounter(monster, impact - 1);
                assert.equal(combat.health, 1500);
                if (dodge) player.y = y + (config.radius ?? config.halfWidth) + 2;
                combat.updateMonsterCounter(monster, impact);
                combat.updateMonsterCounter(monster, impact + 1);
                const damage = Math.round(monster.stats.damage * config.damageScale);
                assert.equal(combat.health, dodge ? 1500 : 1500 - damage);
                assert.equal(combat.impacts.length, dodge ? 0 : 1);
            }
        }
    }
});

test('le souffle ne traverse pas les obstacles et un dragon mort ne frappe plus', () => {
    const { combat, monster } = battle('dragon');
    monster.scene.canStand = () => false;
    combat.updateMonsterCounter(monster, 100);
    assert.equal(monster.attackEndsAt, 0);
    monster.scene.canStand = canStand;
    combat.updateMonsterCounter(monster, 200);
    const impact = monster.attackEndsAt;
    monster.scene.canStand = () => false;
    combat.updateMonsterCounter(monster, impact);
    assert.equal(combat.health, 500);
    monster.scene.canStand = canStand;
    combat.updateMonsterCounter(monster, monster.counterAt);
    const nextImpact = monster.attackEndsAt;
    monster.hide();
    combat.updateMonsterCounter(monster, nextImpact);
    assert.equal(combat.health, 500);
});

test('le souffle voyage sur une trajectoire fixe et le joueur peut esquiver après le tir', () => {
    for (const dodge of [true, false]) {
        const { combat, monster, player } = battle('dragon');
        monster.scene.canStand = () => true;
        player.x = monster.sprite.x + 72;
        combat.updateMonsterCounter(monster, 100);
        const { castEnd, projectile } = monster.attackVisual;
        combat.updateMonsterCounter(monster, castEnd + 190);
        assert.ok(projectile.distance > 20 && projectile.distance < 30);
        assert.equal(combat.health, 500);
        if (dodge) player.y += 20;
        combat.updateMonsterCounter(monster, castEnd + 525);
        assert.equal(combat.health, dodge ? 500 : 500 - monster.stats.damage);
        combat.updateMonsterCounter(monster, castEnd + 725);
        assert.equal(combat.health, dodge ? 500 : 500 - monster.stats.damage);
        assert.equal(monster.attackVisual, null);
        assert.equal(combat.impacts.length, dodge ? 0 : 1);
        combat.updateMonsterCounter(monster, monster.counterAt - 1);
        assert.equal(monster.attackVisual, null);
        combat.updateMonsterCounter(monster, monster.counterAt);
        assert.ok(monster.attackVisual.projectile);
    }
});

test('chaque espèce a huit orientations et trente-six images de marche par orientation', () => {
    for (const [species, { frame, stride }] of Object.entries(monsterArt)) {
        const png = readFileSync(new URL(`../public/game/val-des-saules/monsters/${species}.png`, import.meta.url));
        assert.equal(png.toString('ascii', 12, 16), 'IHDR');
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)],
            [frame * monsterAtlasColumns, frame * monsterFrames * 8 / monsterAtlasColumns]);
        const { monster } = battle(species);
        for (let direction = 0; direction < 8; direction++) {
            const angle = direction * Math.PI / 4;
            monster.face(Math.cos(angle), Math.sin(angle));
            for (let pose = 0; pose < monsterWalkFrames; pose++) {
                monster.walkDistance = (pose + .1) * stride / monsterWalkFrames;
                monster.renderPose(100, true);
                assert.equal(monster.sprite.frame.name, direction * monsterFrames + pose + 1);
            }
        }
        monster.startAttack({ x: monster.sprite.x, y: monster.sprite.y - 12 }, 100);
        monster.renderPose(100);
        assert.equal(monster.sprite.frame.name, monster.isBoss ? 6 * 48 : 6 * monsterFrames + monsterWalkFrames + 1);
    }
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
    const strongBoar = new Monster(scene, 'boar', tileSize, 4);
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
            assert.ok(Number.isSafeInteger(stats.xp) && stats.xp > previous.xp);
            previous = stats;
        }
        const first = template.statsForLevel(template.minLevel);
        if (template.maxLevel <= 20) {
            assert.ok(previous.maxHealth > first.maxHealth * 2);
            assert.ok(previous.damage > first.damage * 2);
        }
    }
    assert.equal(monsterTemplates.imp.minLevel, 21);
    assert.equal(monsterTemplates.fiend.maxLevel, 35);
    assert.ok(monsterTemplates.imp.statsForLevel(22).xp > monsterTemplates.dragon.statsForLevel(20).xp);
    assert.ok(monsterTemplates.fiend.statsForLevel(35).xp > monsterTemplates.hound.statsForLevel(30).xp);
});
