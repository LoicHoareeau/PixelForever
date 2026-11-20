import { cemeteryRuins, graves, wastelandRuins, zones } from './exploration.js';

const ashZones = [zones.imp, zones.hound, zones.fiend];
const textureSize = 256;
const propCellSize = 128;
const blendMargin = 44;
const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const propGroups = [
    {
        atlas: 'cemetery-scenery',
        frame: 0,
        placements: cemeteryRuins,
        sizes: [51, 80, 60, 58, 69, 64, 56, 72],
        collision: 22,
    },
    {
        atlas: 'cemetery-scenery',
        frame: 1,
        placements: graves,
        sizes: [25, 33, 29, 27],
        collision: 14,
    },
    {
        atlas: 'cemetery-scenery',
        frame: 2,
        placements: [[79, 47], [89, 47], [117, 50], [79, 72], [99, 78], [117, 75], [88, 58], [103, 58]],
        sizes: [61, 49, 58, 42, 55],
        collision: 8,
    },
    {
        atlas: 'cemetery-scenery',
        frame: 3,
        placements: [[85, 48], [107, 48], [79, 63], [98, 70], [116, 68], [91, 74]],
        sizes: [44, 39, 45, 48],
        collision: 20,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 0,
        placements: wastelandRuins,
        sizes: [56, 47, 68, 54, 59, 48],
        collision: 22,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 1,
        placements: [
            [180, 75], [198, 74], [203, 83], [194, 92], [176, 83],
            [181, 109], [201, 115], [192, 126], [173, 119],
            [158, 112], [134, 112], [130, 135], [151, 131], [167, 125],
        ],
        sizes: [55, 46, 62, 42],
        collision: 8,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 2,
        placements: [[189, 80], [193, 118], [161, 126], [139, 126]],
        sizes: [83, 69, 94, 78],
        collision: 23,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 3,
        placements: [
            [178, 91], [198, 100], [180, 116], [199, 126], [187, 130],
            [161, 118], [143, 117], [136, 129], [152, 128],
        ],
        sizes: [38, 32, 41, 26],
        collision: 12,
    },
];

export function regionalScenery(tileSize) {
    return propGroups.flatMap(({ atlas, frame, placements, sizes, collision }) =>
        placements.map(([column, row], index) => {
            const x = (column + .5) * tileSize;
            const y = (row + .5) * tileSize;
            return { atlas, frame, x, y, size: sizes[index % sizes.length],
                bounds: [x - collision / 2, y - 7, collision, 8] };
        }));
}

function noise(x, y) {
    let hash = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
    return ((hash ^ (hash >>> 13)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, period) {
    const column = Math.floor(x / period);
    const row = Math.floor(y / period);
    const u = x / period - column;
    const v = y / period - row;
    const top = noise(column, row) * (1 - u) + noise(column + 1, row) * u;
    const bottom = noise(column, row + 1) * (1 - u) + noise(column + 1, row + 1) * u;
    return top * (1 - v) + bottom * v;
}

function distanceToZone(zone, x, y, tileSize) {
    return Math.max(0, zone.left * tileSize - x, x - (zone.right + 1) * tileSize,
        zone.top * tileSize - y, y - (zone.bottom + 1) * tileSize);
}

function clamp(value) {
    return Math.max(0, Math.min(1, value));
}

function blendRegion(context, terrain, tileSize, source, index, regionZones) {
    const left = Math.max(0, Math.min(...regionZones.map(zone => zone.left)) * tileSize - blendMargin);
    const top = Math.max(0, Math.min(...regionZones.map(zone => zone.top)) * tileSize - blendMargin);
    const right = Math.min(context.canvas.width, (Math.max(...regionZones.map(zone => zone.right)) + 1) * tileSize + blendMargin);
    const bottom = Math.min(context.canvas.height, (Math.max(...regionZones.map(zone => zone.bottom)) + 1) * tileSize + blendMargin);
    const layer = context.getImageData(left, top, right - left, bottom - top);
    const rowOffset = index * textureSize;
    const atlasWidth = textureSize * 2;

    for (let y = top; y < bottom; y++) {
        const row = Math.floor(y / tileSize);
        for (let x = left; x < right; x++) {
            const column = Math.floor(x / tileSize);
            const tile = terrain[row][column];
            if (tile < 32 || tile > 33) continue;
            let distance = Infinity;
            for (const zone of regionZones) distance = Math.min(distance, distanceToZone(zone, x, y, tileSize));
            if (distance >= blendMargin) continue;
            const edge = smoothNoise(x, y, 27) * 21 + smoothNoise(x, y, 9) * 11;
            const blend = clamp((34 - distance + edge - 16) / 19);
            if (blend === 0) continue;

            // Stone fragments extend into the verge, and soil intrudes between the outer stones.
            let paving = Number(tile === 32);
            const u = x % tileSize;
            const v = y % tileSize;
            const distances = [u, tileSize - 1 - u, v, tileSize - 1 - v];
            const fringe = smoothNoise(x + 38, y, 6) * 7 - 2;
            for (let side = 0; side < directions.length; side++) {
                const [dx, dy] = directions[side];
                const next = terrain[row + dy]?.[column + dx];
                if (tile === 32 && next !== 32) paving = Math.min(paving, clamp((distances[side] + 3 - fringe) / 6));
                if (tile === 33 && next === 32) paving = Math.max(paving, clamp((fringe - distances[side]) / 6));
            }
            const texel = ((rowOffset + y % textureSize) * atlasWidth + x % textureSize) * 4;
            const position = ((y - top) * layer.width + x - left) * 4;
            for (let channel = 0; channel < 3; channel++) {
                const soil = source[texel + channel];
                const stone = source[texel + channel + textureSize * 4];
                layer.data[position + channel] += (soil + (stone - soil) * paving - layer.data[position + channel]) * blend;
            }
        }
    }
    context.putImageData(layer, left, top);
}

export function drawRegionalGround(scene, context, terrain, tileSize) {
    const atlas = scene.textures.get('regional-ground').getSourceImage();
    const sample = document.createElement('canvas');
    sample.width = sample.height = textureSize * 2;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.drawImage(atlas, 0, 0);
    const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
    blendRegion(context, terrain, tileSize, pixels, 0, [zones.skeleton]);
    blendRegion(context, terrain, tileSize, pixels, 1, ashZones);

    const cinders = [];
    const fissures = [
        [[179, 80], [182, 81], [184, 79]],
        [[195, 84], [194, 86], [196, 89]],
        [[181, 95], [183, 96], [186, 98]],
        [[181, 114], [183, 116], [186, 115]],
        [[196, 118], [195, 121], [198, 123]],
        [[178, 130], [180, 132], [182, 133]],
        [[157, 115], [155, 116], [152, 115]],
        [[137, 119], [139, 121], [138, 124]],
        [[151, 135], [153, 136], [155, 138]],
        [[135, 136], [138, 137], [140, 139]],
    ];
    for (const fissure of fissures) {
        const marks = [];
        const points = fissure.map(([x, y]) => [(x + .5) * tileSize, (y + .5) * tileSize]);
        for (let index = 1; index < points.length; index++) {
            const [x, y] = points[index - 1];
            const dx = points[index][0] - x;
            const dy = points[index][1] - y;
            const length = Math.hypot(dx, dy);
            for (let step = 0; step <= length; step++) {
                const wobble = Math.round((smoothNoise(x + step, y + index * 43, 3) - .5) * 6);
                marks.push([Math.round(x + (dx * step - dy * wobble) / length),
                    Math.round(y + (dy * step + dx * wobble) / length)]);
            }
        }
        for (const [x, y] of marks) {
            const grain = noise(x, y);
            context.fillStyle = grain > .55 ? '#372a39' : '#211620';
            context.fillRect(x - 2, y - 1, grain < .25 ? 6 : 4, grain > .72 ? 4 : 3);
        }
        marks.forEach(([x, y], index) => {
            const heat = smoothNoise(x - 141, y + 52, 7);
            if (heat < .2) return;
            context.fillStyle = heat > .64 ? '#ea9055' : heat > .47 ? '#b9513d' : '#74323b';
            context.fillRect(x, y, heat > .7 ? 2 : 1, 1);
            if (heat > .61 && index % 13 === 0) cinders.push([x, y, index + x]);
        });
    }
    return cinders;
}

export function createScorchedCliff(scene) {
    const cliff = scene.textures.createCanvas('scorched-cliff', 64, 64);
    const context = cliff.getContext();
    context.drawImage(scene.textures.get('coastal-cliff').getSourceImage(), 0, 0);
    const pixels = context.getImageData(0, 0, 64, 64);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const [r, g, b] = pixels.data.subarray(i, i + 3);
        const luma = r * .26 + g * .57 + b * .17;
        const stone = g > r * 1.14 && b > r * 1.10 ? Math.min(58, luma * .55) : luma;
        pixels.data[i] = 14 + stone * .58;
        pixels.data[i + 1] = 12 + stone * .49;
        pixels.data[i + 2] = 23 + stone * .55;
    }
    context.putImageData(pixels, 0, 0);
    cliff.refresh();
}

export function addRegionalScenery(scene, shadows, tileSize) {
    for (const atlas of ['cemetery-scenery', 'wasteland-scenery']) {
        const texture = scene.textures.get(atlas);
        for (let frame = 0; frame < 4; frame++) {
            texture.add(frame, 0, frame % 2 * propCellSize, Math.floor(frame / 2) * propCellSize, propCellSize, propCellSize);
        }
    }
    for (const { atlas, frame, x, y, size, bounds } of regionalScenery(tileSize)) {
        shadows.fillEllipse(x + 3, y - 2, bounds[2] + 7, 7);
        scene.add.image(x, y, atlas, frame).setScale(size / propCellSize).setOrigin(.5, 1).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(...bounds));
    }
}

export function addCemeteryMist(scene, tileSize) {
    const fog = scene.textures.createCanvas('cemetery-mist', 80, 22);
    const context = fog.getContext();
    context.scale(1, 22 / 80);
    const glow = context.createRadialGradient(40, 40, 0, 40, 40, 40);
    glow.addColorStop(0, 'rgba(133, 180, 182, .37)');
    glow.addColorStop(.5, 'rgba(91, 135, 147, .19)');
    glow.addColorStop(1, 'rgba(73, 112, 132, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 80, 80);
    fog.refresh();
    return [
        [81, 50], [87, 54], [103, 52], [112, 57], [83, 68],
        [91, 72], [102, 71], [113, 74], [87, 63], [108, 63],
    ].map(([x, y]) => scene.add.image((x + .5) * tileSize, (y + .5) * tileSize, fog.key).setDepth(2));
}
