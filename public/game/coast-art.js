import { cliffTile, seaTile, zones } from './exploration.js';

const wastelandZones = [zones.imp, zones.hound, zones.fiend];

// ---------------------------------------------------------------------------
// Helpers de bruit déterministe et palettes côtières pixel art
// ---------------------------------------------------------------------------

function coastHash(x, y) {
    let hash = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
    return ((hash ^ (hash >>> 13)) >>> 0) / 4294967295;
}

function coastNoise(x, y, period) {
    const col = Math.floor(x / period);
    const row = Math.floor(y / period);
    const u = x / period - col;
    const v = y / period - row;
    const top = coastHash(col, row) * (1 - u) + coastHash(col + 1, row) * u;
    const bottom = coastHash(col, row + 1) * (1 - u) + coastHash(col + 1, row + 1) * u;
    return top * (1 - v) + bottom * v;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function mixRgb(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

function distanceToBox(zone, worldX, worldY, tileSize) {
    return Math.max(
        0,
        zone.left * tileSize - worldX,
        worldX - (zone.right + 1) * tileSize,
        zone.top * tileSize - worldY,
        worldY - (zone.bottom + 1) * tileSize,
    );
}

// Palettes issues de `coastal-cliff` (tempéré turquoise -> grand large saphir) et côté cendres
const temperateSeaBands = [
    [78, 182, 180],
    [47, 147, 151],
    [35, 118, 131],
    [25, 92, 111],
    [18, 69, 89],
    [13, 52, 70],
];

const ashSeaBands = [
    [62, 68, 84],
    [47, 52, 67],
    [35, 39, 52],
    [26, 29, 41],
    [20, 22, 32],
    [15, 17, 25],
];

/**
 * Calcule l'influence volcanique des Terres dévastées par proximité réelle
 * aux secteurs dévastés (`imp`, `hound`, `fiend`) avec lisière bruitée.
 */
export function ashCoastFactor(worldX, worldY, width, height, tileSize = 16) {
    const px = Math.min(worldX, width - 1);
    const py = Math.min(worldY, height - 1);

    let minDist = Infinity;
    for (const zone of wastelandZones) {
        minDist = Math.min(minDist, distanceToBox(zone, px, py, tileSize));
    }

    const jitter = (coastNoise(px, py, 36) - 0.5) * 60;
    const reach = 250 + jitter;
    if (minDist >= reach) {
        return 0;
    }

    return clamp01(1 - Math.max(0, minDist - 72) / Math.max(64, reach - 72));
}

/**
 * Calcule par BFS la distance en tuiles depuis chaque case de mer jusqu'à la falaise
 * et depuis chaque case de terre jusqu'à la falaise la plus proche.
 */
export function computeSeaDistances(terrain) {
    const rowCount = terrain.length;
    const colCount = terrain[0].length;
    const seaDistance = Array.from({ length: rowCount }, () => Array(colCount).fill(0));
    const landCliffDistance = Array.from({ length: rowCount }, () => Array(colCount).fill(99));

    const seaQueue = [];
    const cliffQueue = [];

    for (let y = 0; y < rowCount; y++) {
        for (let x = 0; x < colCount; x++) {
            const tile = terrain[y][x];
            if (tile === seaTile) {
                seaDistance[y][x] = 99;
                if (
                    terrain[y - 1]?.[x] !== seaTile
                    || terrain[y + 1]?.[x] !== seaTile
                    || terrain[y]?.[x - 1] !== seaTile
                    || terrain[y]?.[x + 1] !== seaTile
                ) {
                    seaDistance[y][x] = 1;
                    seaQueue.push([x, y]);
                }
            } else if (tile === cliffTile) {
                landCliffDistance[y][x] = 0;
                cliffQueue.push([x, y]);
            }
        }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let head = 0; head < seaQueue.length; head++) {
        const [x, y] = seaQueue[head];
        const nextDist = seaDistance[y][x] + 1;
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (terrain[ny]?.[nx] !== seaTile) {
                continue;
            }
            if (nextDist < seaDistance[ny][nx]) {
                seaDistance[ny][nx] = nextDist;
                seaQueue.push([nx, ny]);
            }
        }
    }

    for (let head = 0; head < cliffQueue.length; head++) {
        const [x, y] = cliffQueue[head];
        const nextDist = landCliffDistance[y][x] + 1;
        if (nextDist > 4) {
            continue;
        }
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (ny < 0 || ny >= rowCount || nx < 0 || nx >= colCount) {
                continue;
            }
            if (terrain[ny][nx] === seaTile || terrain[ny][nx] === cliffTile) {
                continue;
            }
            if (nextDist < landCliffDistance[ny][nx]) {
                landCliffDistance[ny][nx] = nextDist;
                cliffQueue.push([nx, ny]);
            }
        }
    }

    return { seaDistance, landCliffDistance };
}

/**
 * Redimensionne un quadrant (ou l'atlas complet) à l'échelle exacte de 256 px par tuile
 * répétitive sans lissage, afin de conserver la même finesse pixel art que le reste de la carte.
 */
function sampleAtlasPixels(image, sx, sy, sSize, targetSize) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, sx, sy, sSize, sSize, 0, 0, targetSize, targetSize);
    return ctx.getImageData(0, 0, targetSize, targetSize).data;
}

// ---------------------------------------------------------------------------
// Rendu du sol littoral, des falaises texturées et de la mer en pixel art
// ---------------------------------------------------------------------------

/**
 * Dessine la transition pelouse côtière -> roche stratifiée issue de `ground-detailed.png`
 * -> hauts-fonds, écume et grand large sur le canvas du sol.
 */
export function drawCoastalFloor(scene, context, terrain, tileSize) {
    const rowCount = terrain.length;
    const colCount = terrain[0].length;
    const width = colCount * tileSize;
    const height = rowCount * tileSize;
    const { seaDistance, landCliffDistance } = computeSeaDistances(terrain);

    const groundImage = scene.textures.get('ground-detailed').getSourceImage();
    const gHalf = groundImage.width / 2;
    const regImage = scene.textures.get('regional-ground').getSourceImage();
    const rHalf = regImage.width / 2;
    const patternSpan = 256;

    // Quadrant (0, 1) = pelouse côtière rase ; Quadrant (1, 1) = roche stratifiée gris-ocre
    const coastGrassPixels = sampleAtlasPixels(groundImage, 0, gHalf, gHalf, patternSpan);
    const cliffRockPixels = sampleAtlasPixels(groundImage, gHalf, gHalf, gHalf, patternSpan);
    const ashRockPixels = sampleAtlasPixels(regImage, rHalf, rHalf, rHalf, patternSpan);

    const floorData = context.getImageData(0, 0, width, height);
    const data = floorData.data;

    const surfPoints = [];
    const glints = [];

    for (let ty = 0; ty < rowCount; ty++) {
        for (let tx = 0; tx < colCount; tx++) {
            const tile = terrain[ty][tx];
            const baseWorldX = tx * tileSize;
            const baseWorldY = ty * tileSize;

            // 1. Transition douce entre prairie et pelouse côtière rase autour des falaises
            if (tile === 33 && landCliffDistance[ty][tx] <= 3) {
                const ash = ashCoastFactor(baseWorldX, baseWorldY, width, height, tileSize);
                if (ash < 0.85) {
                    const dist = landCliffDistance[ty][tx];
                    const strength = (1 - ash) * clamp01((4 - dist) / 3.0);
                    for (let ly = 0; ly < tileSize; ly++) {
                        const wy = baseWorldY + ly;
                        const texRow = (wy % patternSpan) * patternSpan;
                        for (let lx = 0; lx < tileSize; lx++) {
                            const wx = baseWorldX + lx;
                            const texCol = wx % patternSpan;
                            const jitter = (coastNoise(wx, wy, 14) - 0.35) * 0.45;
                            const blend = clamp01(strength * (0.58 + jitter));
                            const srcIdx = (texRow + texCol) * 4;
                            const dstIdx = (wy * width + wx) * 4;
                            data[dstIdx] = Math.round(data[dstIdx] + (coastGrassPixels[srcIdx] - data[dstIdx]) * blend);
                            data[dstIdx + 1] = Math.round(data[dstIdx + 1] + (coastGrassPixels[srcIdx + 1] - data[dstIdx + 1]) * blend);
                            data[dstIdx + 2] = Math.round(data[dstIdx + 2] + (coastGrassPixels[srcIdx + 2] - data[dstIdx + 2]) * blend);
                        }
                    }
                }
                continue;
            }

            // 2. Falaises : échantillonnage de la vraie roche détaillée (sans marches carrées artificielles)
            if (tile === cliffTile) {
                const ash = ashCoastFactor(baseWorldX, baseWorldY, width, height, tileSize);
                const landN = (terrain[ty - 1]?.[tx] ?? seaTile) < cliffTile;
                const landS = (terrain[ty + 1]?.[tx] ?? seaTile) < cliffTile;
                const landW = (terrain[ty]?.[tx - 1] ?? seaTile) < cliffTile;
                const landE = (terrain[ty]?.[tx + 1] ?? seaTile) < cliffTile;
                const seaN = terrain[ty - 1]?.[tx] === seaTile;
                const seaS = terrain[ty + 1]?.[tx] === seaTile;
                const seaW = terrain[ty]?.[tx - 1] === seaTile;
                const seaE = terrain[ty]?.[tx + 1] === seaTile;

                for (let ly = 0; ly < tileSize; ly++) {
                    const wy = baseWorldY + ly;
                    const texRow = (wy % patternSpan) * patternSpan;
                    for (let lx = 0; lx < tileSize; lx++) {
                        const wx = baseWorldX + lx;
                        const srcIdx = (texRow + (wx % patternSpan)) * 4;
                        const dstIdx = (wy * width + wx) * 4;

                        // Roche détaillée (tempérée vs volcanique)
                        let r = cliffRockPixels[srcIdx] + (ashRockPixels[srcIdx] - cliffRockPixels[srcIdx]) * ash;
                        let g = cliffRockPixels[srcIdx + 1] + (ashRockPixels[srcIdx + 1] - cliffRockPixels[srcIdx + 1]) * ash;
                        let b = cliffRockPixels[srcIdx + 2] + (ashRockPixels[srcIdx + 2] - cliffRockPixels[srcIdx + 2]) * ash;

                        // Ombre de dénivelé vers la mer et lumière chaude sur la crête côté terre
                        const rockFade = (seaS && ly >= 10) || (seaN && ly < 5) || (seaE && lx >= 10) || (seaW && lx < 5);
                        if (rockFade) {
                            const depthTint = 0.72;
                            r *= depthTint;
                            g *= depthTint;
                            b *= depthTint + 0.04;
                        }

                        // Effilocher la lisière roche <-> pelouse côtière au pixel près
                        const noiseEdge = coastNoise(wx, wy, 9) * 8;
                        let turfWeight = 0;
                        if (landN) turfWeight = Math.max(turfWeight, clamp01((9 - ly + noiseEdge - 4) / 6));
                        if (landS) turfWeight = Math.max(turfWeight, clamp01((ly - 6 + noiseEdge - 4) / 6));
                        if (landW) turfWeight = Math.max(turfWeight, clamp01((9 - lx + noiseEdge - 4) / 6));
                        if (landE) turfWeight = Math.max(turfWeight, clamp01((lx - 6 + noiseEdge - 4) / 6));

                        if (turfWeight > 0) {
                            const grassR = ash > 0.6 ? data[dstIdx] * 0.55 + ashRockPixels[srcIdx] * 0.45 : coastGrassPixels[srcIdx];
                            const grassG = ash > 0.6 ? data[dstIdx + 1] * 0.55 + ashRockPixels[srcIdx + 1] * 0.45 : coastGrassPixels[srcIdx + 1];
                            const grassB = ash > 0.6 ? data[dstIdx + 2] * 0.55 + ashRockPixels[srcIdx + 2] * 0.45 : coastGrassPixels[srcIdx + 2];
                            r += (grassR - r) * turfWeight;
                            g += (grassG - g) * turfWeight;
                            b += (grassB - b) * turfWeight;
                        }

                        data[dstIdx] = Math.round(clamp01(r / 255) * 255);
                        data[dstIdx + 1] = Math.round(clamp01(g / 255) * 255);
                        data[dstIdx + 2] = Math.round(clamp01(b / 255) * 255);
                        data[dstIdx + 3] = 255;
                    }
                }
                continue;
            }

            if (tile !== seaTile) {
                continue;
            }

            // 3. Océan gradué par profondeur en pixel art net (blocs 2x2 px)
            const tileDist = seaDistance[ty][tx];
            const ash = ashCoastFactor(baseWorldX, baseWorldY, width, height, tileSize);
            const bandFloat = Math.min(5, (tileDist - 1) * 0.42);
            const bandLow = Math.floor(bandFloat);
            const bandHigh = Math.min(5, bandLow + 1);
            const bandMix = bandFloat - bandLow;

            const cliffNorth = terrain[ty - 1]?.[tx] === cliffTile;
            const cliffWest = terrain[ty]?.[tx - 1] === cliffTile;
            const cliffEast = terrain[ty]?.[tx + 1] === cliffTile;
            const cliffSouth = terrain[ty + 1]?.[tx] === cliffTile;

            const seed = (tx * 43 + ty * 71 + tx * ty * 19) % 103;
            if ((cliffNorth || cliffWest || cliffEast || cliffSouth) && seed < 48) {
                surfPoints.push([baseWorldX + 2 + (seed % 10), baseWorldY + 2 + ((seed * 3) % 10), seed, ash]);
            } else if (tileDist >= 3 && tileDist <= 14 && seed < 11) {
                glints.push([baseWorldX + 3 + (seed % 8), baseWorldY + 4 + ((seed * 5) % 8), seed, ash]);
            }

            for (let ly = 0; ly < tileSize; ly += 2) {
                const wy = baseWorldY + ly;
                for (let lx = 0; lx < tileSize; lx += 2) {
                    const wx = baseWorldX + lx;
                    const waveRipple = Math.sin(wy * 0.28 + wx * 0.09 + coastNoise(wx, wy, 20) * 3.1);
                    const detailNoise = coastNoise(wx, wy, 5);

                    const baseTemp = mixRgb(temperateSeaBands[bandLow], temperateSeaBands[bandHigh], bandMix);
                    const baseAsh = mixRgb(ashSeaBands[bandLow], ashSeaBands[bandHigh], bandMix);
                    let rgb = mixRgb(baseTemp, baseAsh, ash);

                    if ((cliffNorth && ly < 4) || (cliffWest && lx < 4)) {
                        rgb = mixRgb(rgb, [10, 26, 36], 0.42);
                    }

                    const atFoamMargin = (
                        (cliffNorth && ly >= 2 && ly <= 6)
                        || (cliffWest && lx >= 2 && lx <= 6)
                        || (cliffEast && lx >= 10)
                        || (cliffSouth && ly >= 10)
                    );
                    if (atFoamMargin && detailNoise + waveRipple * 0.25 > 0.54) {
                        const foamTemp = detailNoise > 0.7 ? [232, 249, 246] : [168, 224, 221];
                        const foamAsh = detailNoise > 0.7 ? [174, 182, 194] : [118, 126, 139];
                        rgb = mixRgb(foamTemp, foamAsh, ash);
                    } else if (waveRipple > 0.68 && detailNoise > 0.48) {
                        const crestTemp = tileDist <= 3 ? [116, 208, 204] : [58, 138, 152];
                        const crestAsh = tileDist <= 3 ? [86, 94, 114] : [48, 54, 70];
                        rgb = mixRgb(rgb, mixRgb(crestTemp, crestAsh, ash), 0.45);
                    }

                    for (let py = 0; py < 2; py++) {
                        for (let px = 0; px < 2; px++) {
                            const dstIdx = ((wy + py) * width + (wx + px)) * 4;
                            data[dstIdx] = rgb[0];
                            data[dstIdx + 1] = rgb[1];
                            data[dstIdx + 2] = rgb[2];
                            data[dstIdx + 3] = 255;
                        }
                    }
                }
            }
        }
    }

    context.putImageData(floorData, 0, 0);

    return { surfPoints, glints, seaDistance };
}

// ---------------------------------------------------------------------------
// Placement des falaises droites, caps côtiers et îlots marins
// ---------------------------------------------------------------------------

/**
 * Place les sprites de falaises droites le long de tout le littoral organique
 * ainsi que des îlots et récifs rocheux dans la mer ouverte (sans jamais retourner ni
 * pivoter les falaises à 90 degrés afin de préserver la lumière et la gravité).
 */
export function addCoastalProps(scene, terrain, tileSize, seaDistance) {
    const rowCount = terrain.length;
    const colCount = terrain[0].length;
    const width = colCount * tileSize;
    const height = rowCount * tileSize;

    const placedCoast = [];
    const placedStacks = [];

    const farEnough = (list, x, y, minDist) => !list.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < minDist);

    // 1. Bordure côtière organique : placement dense au contact cliffTile <-> seaTile
    for (let ty = 1; ty < rowCount - 1; ty++) {
        for (let tx = 1; tx < colCount - 1; tx++) {
            if (terrain[ty][tx] !== cliffTile) {
                continue;
            }

            const seaSouth = terrain[ty + 1]?.[tx] === seaTile;
            const seaNorth = terrain[ty - 1]?.[tx] === seaTile;
            const seaWest = terrain[ty]?.[tx - 1] === seaTile;
            const seaEast = terrain[ty]?.[tx + 1] === seaTile;
            if (!seaSouth && !seaNorth && !seaWest && !seaEast) {
                continue;
            }

            const worldX = (tx + 0.5) * tileSize;
            const worldY = (ty + 0.5) * tileSize;
            const ash = ashCoastFactor(worldX, worldY, width, height, tileSize) > 0.55;
            const seed = Math.floor(coastHash(tx, ty) * 1000);

            if (seaSouth) {
                if (!farEnough(placedCoast, worldX, worldY, 34)) {
                    continue;
                }
                const size = 66 + (seed % 18);
                const key = ash ? 'scorched-cliff' : 'coastal-cliff';
                scene.add
                    .image(worldX, worldY + 26, key)
                    .setOrigin(0.5, 1)
                    .setDisplaySize(size, size)
                    .setFlipX(seed % 2 === 1)
                    .setDepth(1.5);
                placedCoast.push([worldX, worldY]);
            } else if (seaWest || seaEast) {
                if (!farEnough(placedCoast, worldX, worldY, 34)) {
                    continue;
                }
                const size = 58 + (seed % 16);
                const key = ash ? 'scorched-cliff' : (seed % 3 === 0 ? 'mountain-rock' : 'coastal-cliff');
                const offsetX = seaEast ? -4 : 4;
                scene.add
                    .image(worldX + offsetX, worldY + 20, key)
                    .setOrigin(0.5, 1)
                    .setDisplaySize(size, size)
                    .setFlipX(Boolean(seaWest))
                    .setDepth(1.5);
                placedCoast.push([worldX, worldY]);
            } else if (seaNorth) {
                if (!farEnough(placedCoast, worldX, worldY, 36)) {
                    continue;
                }
                const size = 56 + (seed % 16);
                const key = ash ? 'scorched-cliff' : 'mountain-rock';
                scene.add
                    .image(worldX, worldY + 24, key)
                    .setOrigin(0.5, 1)
                    .setDisplaySize(size, size)
                    .setFlipX(seed % 2 === 1)
                    .setDepth(1.5);
                placedCoast.push([worldX, worldY]);
            }
        }
    }

    // 2. Promontoires rocheux sur l'épaisseur de falaise pour effacer toute ligne rectiligne
    for (let ty = 3; ty < rowCount - 3; ty += 3) {
        for (let tx = 3; tx < colCount - 3; tx += 3) {
            if (terrain[ty][tx] !== cliffTile) {
                continue;
            }
            const seed = Math.floor(coastHash(tx + 17, ty + 31) * 1000);
            if (seed % 3 !== 0) {
                continue;
            }
            const worldX = (tx + 0.5) * tileSize;
            const worldY = (ty + 0.5) * tileSize;
            if (!farEnough(placedCoast, worldX, worldY, 40)) {
                continue;
            }
            const ash = ashCoastFactor(worldX, worldY, width, height, tileSize) > 0.55;
            const key = ash ? 'scorched-cliff' : 'mountain-rock';
            const size = 52 + (seed % 16);
            scene.add
                .image(worldX, worldY + 18, key)
                .setOrigin(0.5, 1)
                .setDisplaySize(size, size)
                .setFlipX(seed % 2 === 1)
                .setDepth(1.5);
            placedCoast.push([worldX, worldY]);
        }
    }

    // 3. Îlots et écueils marins au large dans les baies ouvertes
    for (let ty = 4; ty < rowCount - 4; ty += 5) {
        for (let tx = 4; tx < colCount - 4; tx += 5) {
            if (terrain[ty][tx] !== seaTile) {
                continue;
            }
            const dist = seaDistance[ty][tx];
            if (dist < 4 || dist > 15) {
                continue;
            }
            const seed = Math.floor(coastHash(tx * 3, ty * 7) * 1000);
            if (seed % 6 !== 0) {
                continue;
            }

            const worldX = (tx + 0.5) * tileSize;
            const worldY = (ty + 0.5) * tileSize;
            if (!farEnough(placedStacks, worldX, worldY, 128)) {
                continue;
            }

            const size = 40 + (seed % 22);
            const ash = ashCoastFactor(worldX, worldY, width, height, tileSize) > 0.55;
            const key = ash ? 'scorched-cliff' : (dist >= 7 && seed % 2 === 0 ? 'coastal-cliff' : 'mountain-rock');

            scene.add
                .ellipse(worldX, worldY + 2, size * 0.72, size * 0.24, ash ? 0x6f7685 : 0x7bd3d0, 0.38)
                .setDepth(1.2);
            scene.add
                .image(worldX, worldY + 6, key)
                .setOrigin(0.5, 1)
                .setDisplaySize(size, size)
                .setFlipX(seed % 2 === 1)
                .setDepth(1.5);
            placedStacks.push([worldX, worldY]);
        }
    }
}

/**
 * Anime l'écume côtière et les éclats de houle dans la boucle d'ambiance existante.
 */
export function animateCoast(ambience, frame, surfPoints, glints) {
    for (const [x, y, phase, ash] of surfPoints) {
        const step = (frame + phase) % 10;
        if (step > 5) {
            continue;
        }
        const alpha = [0.18, 0.34, 0.52, 0.45, 0.28, 0.14][step];
        const color = ash > 0.5 ? 0x9ca4b3 : 0xdaf7f4;
        ambience.fillStyle(color, alpha).fillRect(x, y, 4 + Math.floor(step / 2), 1);
        if (step >= 1 && step <= 4) {
            ambience.fillRect(x + 2, y + 2, 3, 1);
        }
    }

    for (const [x, y, phase, ash] of glints) {
        const step = (frame + phase) % 12;
        if (step > 4) {
            continue;
        }
        const color = ash > 0.5 ? 0x6f7991 : 0x9de4e1;
        ambience.fillStyle(color, 0.22 + (4 - step) * 0.06).fillRect(x + step, y, 4, 1);
    }
}
