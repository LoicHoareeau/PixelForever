import { cemeteryRuins, graves, wastelandRuins } from './exploration.js';
import { tileHasNonClearingBiome, writeBiomeWeights } from './biome-gradient.js';

const textureSize = 256;
const propCellSize = 128;
const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ---------------------------------------------------------------------------
// Décors régionaux et éléments de transition entre zones
// ---------------------------------------------------------------------------

const propGroups = [
    {
        atlas: 'cemetery-scenery',
        frame: 0,
        placements: cemeteryRuins,
        sizes: [51, 80, 60, 58, 69, 64, 56, 72, 60],
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
        placements: [
            [83, 52], [95, 52], [126, 56], [83, 81], [105, 89],
            [126, 85], [93, 66], [111, 66],
            // Arbres morts en lisière ouest du Cimetière
            [76, 46], [80, 77],
        ],
        sizes: [61, 49, 58, 42, 55],
        collision: 8,
    },
    {
        atlas: 'cemetery-scenery',
        frame: 3,
        placements: [[91, 53], [113, 53], [83, 73], [105, 79], [125, 72], [99, 85]],
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
            [209, 79], [229, 79], [234, 86], [224, 102], [203, 88],
            [209, 121], [231, 127], [222, 145], [199, 132], [178, 129],
            [148, 133], [144, 161], [161, 152], [190, 148],
            // Arbres calcinés en lisière et pourtour du Trône d'Obsidienne
            [192, 91], [194, 112], [87, 154], [87, 163],
        ],
        sizes: [55, 46, 62, 42],
        collision: 8,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 2,
        placements: [
            [220, 86], [222, 132], [178, 151], [154, 139],
            // Arches monumentales à l'entrée du Trône d'Obsidienne
            [130, 152], [130, 163],
        ],
        sizes: [83, 69, 94, 78, 86, 86],
        collision: 23,
    },
    {
        atlas: 'wasteland-scenery',
        frame: 3,
        placements: [
            [210, 99], [230, 107], [210, 135], [229, 142], [218, 152],
            [175, 140], [158, 137], [151, 151], [173, 154], [195, 101],
            [90, 147], [118, 147], [90, 169], [118, 169],
        ],
        sizes: [38, 32, 41, 26],
        collision: 12,
    },
];

export function regionalScenery(tileSize) {
    return propGroups.flatMap(({ atlas, frame, placements, sizes, collision }) =>
        placements.map(([column, row], index) => {
            const x = (column + 0.5) * tileSize;
            const y = (row + 0.5) * tileSize;
            return {
                atlas,
                frame,
                x,
                y,
                size: sizes[index % sizes.length],
                bounds: [x - collision / 2, y - 7, collision, 8],
            };
        }),
    );
}

// ---------------------------------------------------------------------------
// Bruit et échantillonnage de textures 256 × 256
// ---------------------------------------------------------------------------

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

function clamp(value) {
    return Math.max(0, Math.min(1, value));
}

function sampleQuadrantPixels(image, col, row) {
    const half = image.width / 2;
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, col * half, row * half, half, half, 0, 0, textureSize, textureSize);
    return ctx.getImageData(0, 0, textureSize, textureSize).data;
}

// ---------------------------------------------------------------------------
// Fusion unifiée multi-biomes du sol et fissures volcaniques
// ---------------------------------------------------------------------------

export function drawRegionalGround(scene, context, terrain, tileSize) {
    const regAtlas = scene.textures.get('regional-ground').getSourceImage();
    const groundAtlas = scene.textures.get('ground-detailed').getSourceImage();

    const cemSoil = sampleQuadrantPixels(regAtlas, 0, 0);
    const cemStone = sampleQuadrantPixels(regAtlas, 1, 0);
    const ashSoil = sampleQuadrantPixels(regAtlas, 0, 1);
    const ashStone = sampleQuadrantPixels(regAtlas, 1, 1);
    const mntTrail = sampleQuadrantPixels(groundAtlas, 1, 0);
    const mntRock = sampleQuadrantPixels(groundAtlas, 1, 1);

    const canvasWidth = context.canvas.width;
    const canvasHeight = context.canvas.height;
    const rowCount = terrain.length;
    const colCount = terrain[0].length;
    const floorLayer = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = floorLayer.data;
    const weights = new Float32Array(4);

    for (let ty = 0; ty < rowCount; ty++) {
        for (let tx = 0; tx < colCount; tx++) {
            const tile = terrain[ty][tx];
            if (tile < 32 || tile > 33) {
                continue;
            }
            if (!tileHasNonClearingBiome(tx, ty, tileSize)) {
                continue;
            }

            const baseX = tx * tileSize;
            const baseY = ty * tileSize;

            for (let ly = 0; ly < tileSize; ly++) {
                const y = baseY + ly;
                const texRow = (y % textureSize) * textureSize;
                const dstRow = y * canvasWidth;

                for (let lx = 0; lx < tileSize; lx++) {
                    const x = baseX + lx;
                    writeBiomeWeights(x, y, tileSize, weights);
                    if (weights[0] >= 0.999) {
                        continue;
                    }

                    // Effilochage organique des bords pierre / terre le long des chemins
                    let paving = Number(tile === 32);
                    const distances = [lx, tileSize - 1 - lx, ly, tileSize - 1 - ly];
                    const fringe = smoothNoise(x + 38, y, 6) * 7 - 2;
                    for (let side = 0; side < directions.length; side++) {
                        const [dx, dy] = directions[side];
                        const next = terrain[ty + dy]?.[tx + dx];
                        if (tile === 32 && next !== 32) {
                            paving = Math.min(paving, clamp((distances[side] + 3 - fringe) / 6));
                        }
                        if (tile === 33 && next === 32) {
                            paving = Math.max(paving, clamp((fringe - distances[side]) / 6));
                        }
                    }

                    const texIdx = (texRow + (x % textureSize)) * 4;
                    const dstIdx = (dstRow + x) * 4;
                    const wClr = weights[0];
                    const wCem = weights[1];
                    const wMnt = weights[2];
                    const wAsh = weights[3];

                    for (let channel = 0; channel < 3; channel++) {
                        const baseC = data[dstIdx + channel];
                        const cemC = cemSoil[texIdx + channel] + (cemStone[texIdx + channel] - cemSoil[texIdx + channel]) * paving;
                        const mntC = mntRock[texIdx + channel] + (mntTrail[texIdx + channel] - mntRock[texIdx + channel]) * (paving * 0.42);
                        const ashC = ashSoil[texIdx + channel] + (ashStone[texIdx + channel] - ashSoil[texIdx + channel]) * paving;

                        data[dstIdx + channel] = Math.round(
                            baseC * wClr + cemC * wCem + mntC * wMnt + ashC * wAsh,
                        );
                    }
                }
            }
        }
    }

    context.putImageData(floorLayer, 0, 0);

    // Fissures incandescentes dans les Terres dévastées et leur lisière ouest
    const cinders = [];
    const fissures = [
        [[205, 84], [208, 86], [211, 84]],
        [[227, 86], [226, 89], [229, 92]],
        [[209, 102], [212, 104], [215, 105]],
        [[206, 126], [209, 128], [212, 127]],
        [[225, 132], [224, 136], [227, 138]],
        [[206, 149], [209, 151], [212, 152]],
        [[181, 134], [178, 136], [175, 135]],
        [[153, 136], [156, 138], [155, 141]],
        [[176, 154], [179, 156], [181, 158]],
        [[152, 155], [155, 157], [157, 159]],
        // Lisières Montagnes -> Terres dévastées
        [[193, 98], [195, 100], [197, 99]],
        [[164, 121], [166, 123], [169, 122]],
        // Fissures autour du Trône d'Obsidienne (hors parvis central)
        [[92, 149], [95, 151], [93, 153]],
        [[115, 149], [118, 151], [116, 154]],
        [[91, 165], [94, 167], [96, 169]],
        [[115, 165], [118, 167], [120, 168]],
    ];

    for (const fissure of fissures) {
        const marks = [];
        const points = fissure.map(([x, y]) => [(x + 0.5) * tileSize, (y + 0.5) * tileSize]);
        for (let index = 1; index < points.length; index++) {
            const [x, y] = points[index - 1];
            const dx = points[index][0] - x;
            const dy = points[index][1] - y;
            const length = Math.hypot(dx, dy);
            for (let step = 0; step <= length; step++) {
                const wobble = Math.round((smoothNoise(x + step, y + index * 43, 3) - 0.5) * 6);
                marks.push([
                    Math.round(x + (dx * step - dy * wobble) / length),
                    Math.round(y + (dy * step + dx * wobble) / length),
                ]);
            }
        }
        for (const [x, y] of marks) {
            const grain = noise(x, y);
            context.fillStyle = grain > 0.55 ? '#372a39' : '#211620';
            context.fillRect(x - 2, y - 1, grain < 0.25 ? 6 : 4, grain > 0.72 ? 4 : 3);
        }
        marks.forEach(([x, y], index) => {
            const heat = smoothNoise(x - 141, y + 52, 7);
            if (heat < 0.2) return;
            context.fillStyle = heat > 0.64 ? '#ea9055' : heat > 0.47 ? '#b9513d' : '#74323b';
            context.fillRect(x, y, heat > 0.7 ? 2 : 1, 1);
            if (heat > 0.61 && index % 13 === 0) cinders.push([x, y, index + x]);
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
        const luma = r * 0.26 + g * 0.57 + b * 0.17;
        const stone = g > r * 1.14 && b > r * 1.10 ? Math.min(58, luma * 0.55) : luma;
        pixels.data[i] = 14 + stone * 0.58;
        pixels.data[i + 1] = 12 + stone * 0.49;
        pixels.data[i + 2] = 23 + stone * 0.55;
    }
    context.putImageData(pixels, 0, 0);
    cliff.refresh();
}

export function addRegionalScenery(scene, shadows, tileSize) {
    for (const atlas of ['cemetery-scenery', 'wasteland-scenery']) {
        const texture = scene.textures.get(atlas);
        for (let frame = 0; frame < 4; frame++) {
            texture.add(
                frame,
                0,
                (frame % 2) * propCellSize,
                Math.floor(frame / 2) * propCellSize,
                propCellSize,
                propCellSize,
            );
        }
    }
    for (const { atlas, frame, x, y, size, bounds } of regionalScenery(tileSize)) {
        shadows.fillEllipse(x + 3, y - 2, bounds[2] + 7, 7);
        scene.add.image(x, y, atlas, frame).setScale(size / propCellSize).setOrigin(0.5, 1).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(...bounds));
    }
}

export function addCemeteryMist(scene, tileSize) {
    const fog = scene.textures.createCanvas('cemetery-mist', 80, 22);
    const context = fog.getContext();
    context.scale(1, 22 / 80);
    const glow = context.createRadialGradient(40, 40, 0, 40, 40, 40);
    glow.addColorStop(0, 'rgba(133, 180, 182, .37)');
    glow.addColorStop(0.5, 'rgba(91, 135, 147, .19)');
    glow.addColorStop(1, 'rgba(73, 112, 132, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 80, 80);
    fog.refresh();
    return [
        [86, 58], [94, 62], [112, 58], [122, 65], [88, 78],
        [98, 84], [111, 82], [121, 84], [95, 72], [116, 73],
        // Voiles légers à l'approche du Cimetière
        [77, 50], [99, 46],
    ].map(([x, y]) => scene.add.image((x + 0.5) * tileSize, (y + 0.5) * tileSize, fog.key).setDepth(2));
}
