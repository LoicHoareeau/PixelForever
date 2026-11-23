import { cliffTile, inWasteland, inZone, rocks, seaTile, zones } from './exploration.js';
import { biomeWeights, organicWarp, smoothstep } from './biome-gradient.js';
import { addCoastalProps, animateCoast, drawCoastalFloor } from './coast-art.js';
import { addCemeteryMist, addRegionalScenery, createScorchedCliff, drawRegionalGround } from './regional-art.js';
import { isInStarterTown, starterTown } from './starter-town.js';
import { clearingScenery, inClearingGlade } from './clearing-layout.js';
import { createClearingGround, clearingRoadMask, createClearingSceneryTextures } from './clearing-style.js';
import { createClearingAtmosphere } from './clearing-atmosphere.js';

const frameSize = 48;
// Positions are the feet of the tree trunks, so the canopy sorts with actors.
const trees = [
    [28, 58], [59, 44], [81, 68], [60, 105], [91, 133], [31, 158],
    [53, 204], [85, 218], [124, 190], [124, 151], [149, 112], [152, 14],
    [255, 42], [281, 57], [305, 30], [322, 57], [267, 88],
    [298, 119], [321, 92], [349, 128], [339, 184], [355, 214],
    [391, 291], [421, 302], [353, 316], [309, 300],
    [233, 286], [213, 311], [189, 298], [147, 307], [114, 285], [82, 305],
];
const pondReeds = [[424, 64, 32, 24], [450, 126, 34, 26], [440, 184, 34, 26], [330, 156, 30, 23]];

export function createPoseSheet(scene, skin, directions) {
    const sheet = scene.textures.createCanvas(skin + '-poses', frameSize * 3, frameSize * directions.length);
    const context = sheet.getContext();
    directions.forEach((direction, row) => {
        const source = scene.textures.get(skin + '-' + direction).getSourceImage();
        const y = row * frameSize;
        context.drawImage(source, 0, y);
        const pixels = context.getImageData(0, y, frameSize, frameSize).data;
        let bottom = frameSize - 1;
        while (bottom > 0 && !pixels.subarray(bottom * frameSize * 4, (bottom + 1) * frameSize * 4)
            .some((value, index) => index % 4 === 3 && value > 100)) bottom--;

        context.clearRect(0, y, frameSize, frameSize);
        const anchor = y + 46 - bottom;
        context.drawImage(source, 0, anchor);
        sheet.add(direction + '-idle', 0, 0, y, frameSize, frameSize);

        const horizontal = direction.includes('east') ? 1 : direction.includes('west') ? -1 : 0;
        const vertical = direction.includes('south') ? 1 : direction.includes('north') ? -1 : 0;
        const torsoHeight = bottom - 11;
        for (const [index, pose, lean] of [[0, 'windup', -1], [1, 'release', 1]]) {
            const x = (index + 1) * frameSize;
            context.drawImage(source, 0, torsoHeight, frameSize, frameSize - torsoHeight,
                x, anchor + torsoHeight, frameSize, frameSize - torsoHeight);
            context.drawImage(source, 0, 0, frameSize, torsoHeight + 2,
                x + horizontal * lean * 2, anchor + vertical * lean - 1, frameSize, torsoHeight + 2);
            sheet.add(direction + '-' + pose, 0, x, y, frameSize, frameSize);
        }
    });
    sheet.refresh();
    return sheet.key;
}

function drawFrame(context, frame, x, y) {
    context.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        x, y, frame.cutWidth, frame.cutHeight);
}

function drawLantern(context) {
    context.fillStyle = '#412f2d';
    context.fillRect(4, 2, 2, 12);
    context.fillRect(5, 2, 5, 2);
    context.fillRect(8, 4, 5, 6);
    context.fillStyle = '#c5793d';
    context.fillRect(9, 5, 3, 4);
    context.fillStyle = '#ffcf79';
    context.fillRect(10, 6, 2, 2);
}

function hash2d(x, y) {
    let h = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, period) {
    const c = Math.floor(x / period), r = Math.floor(y / period);
    const u = x / period - c, v = y / period - r;
    const top = hash2d(c, r) * (1 - u) + hash2d(c + 1, r) * u;
    const bot = hash2d(c, r + 1) * (1 - u) + hash2d(c + 1, r + 1) * u;
    return top * (1 - v) + bot * v;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function edt1d(f, d, v, z, n) {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        let s;
        while (true) {
            const r = v[k];
            s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * (q - r));
            if (s > z[k]) break;
            k--;
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const dx = q - v[k];
        d[q] = dx * dx + f[v[k]];
    }
}

function edt2d(grid, width, height) {
    const maxLen = Math.max(width, height);
    const f = new Float64Array(maxLen);
    const d = new Float64Array(maxLen);
    const v = new Int32Array(maxLen);
    const z = new Float64Array(maxLen + 1);
    const out = new Float64Array(width * height);

    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) f[x] = grid[row + x];
        edt1d(f, d, v, z, width);
        for (let x = 0; x < width; x++) out[row + x] = d[x];
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) f[y] = out[y * width + x];
        edt1d(f, d, v, z, height);
        for (let y = 0; y < height; y++) out[y * width + x] = d[y];
    }
    return out;
}

function buildSignedDistance(mask, width, height, cellPx) {
    const inf = 1e9;
    const gOut = new Float64Array(width * height);
    const gIn = new Float64Array(width * height);
    for (let i = 0; i < mask.length; i++) {
        gOut[i] = mask[i] ? 0 : inf;
        gIn[i] = mask[i] ? inf : 0;
    }
    const dOut = edt2d(gOut, width, height);
    const dIn = edt2d(gIn, width, height);
    const sdf = new Float32Array(width * height);
    for (let i = 0; i < mask.length; i++) {
        sdf[i] = (mask[i] ? -Math.sqrt(dIn[i]) + 0.5 : Math.sqrt(dOut[i]) - 0.5) * cellPx;
    }
    return sdf;
}

function smoothField(field, width, height, passes = 2) {
    let src = field;
    for (let pass = 0; pass < passes; pass++) {
        const dst = new Float32Array(src.length);
        for (let y = 0; y < height; y++) {
            const ym1 = Math.max(0, y - 1), yp1 = Math.min(height - 1, y + 1);
            const ym2 = Math.max(0, y - 2), yp2 = Math.min(height - 1, y + 2);
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let ky = -2; ky <= 2; ky++) {
                    const yy = ky === -2 ? ym2 : ky === -1 ? ym1 : ky === 0 ? y : ky === 1 ? yp1 : yp2;
                    const row = yy * width;
                    for (let kx = -2; kx <= 2; kx++) {
                        sum += src[row + Math.max(0, Math.min(width - 1, x + kx))];
                    }
                }
                dst[y * width + x] = sum / 25;
            }
        }
        src = dst;
    }
    return src;
}

function bilerpSdf(sdf, width, height, cx, cy) {
    const clampedX = Math.max(0, Math.min(width - 1.001, cx));
    const clampedY = Math.max(0, Math.min(height - 1.001, cy));
    const x0 = Math.floor(clampedX), y0 = Math.floor(clampedY);
    const tx = clampedX - x0, ty = clampedY - y0;
    const i00 = y0 * width + x0;
    const top = sdf[i00] * (1 - tx) + sdf[i00 + 1] * tx;
    const bot = sdf[i00 + width] * (1 - tx) + sdf[i00 + width + 1] * tx;
    return top * (1 - ty) + bot * ty;
}

function extractTransitionMasks(scene, sheetKey, tileSize, thresholdFn) {
    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return Array.from({ length: 16 }, (_, index) => {
        ctx.clearRect(0, 0, tileSize, tileSize);
        drawFrame(ctx, scene.textures.getFrame(sheetKey, index), 0, 0);
        const pixels = ctx.getImageData(0, 0, tileSize, tileSize).data;
        const mask = new Uint8Array(tileSize * tileSize);
        for (let i = 0; i < mask.length; i++) {
            const p = i * 4;
            mask[i] = thresholdFn(pixels[p], pixels[p + 1], pixels[p + 2]) ? 1 : 0;
        }
        return mask;
    });
}

function readPatternData(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
}

function buildClearingHdFloor(scene, terrain, tileSize, cleanGround) {
    const hdCols = Math.min(106, terrain[0].length);
    const hdRows = Math.min(62, terrain.length);
    const worldW = hdCols * tileSize;
    const worldH = hdRows * tileSize;
    const cellPx = 4;
    const sdfW = worldW / cellPx;
    const sdfH = worldH / cellPx;

    const roadTransMasks = extractTransitionMasks(scene, 'chemin-herbe', tileSize, (r, g) => r > g * 1.1);
    const pondTransMasks = extractTransitionMasks(scene, 'eau-herbe', tileSize, (r, g, b) => b > g && b > r * 1.35);

    const roadMask = new Uint8Array(sdfW * sdfH);
    const pondMask = new Uint8Array(sdfW * sdfH);
    const coastMask = new Uint8Array(sdfW * sdfH);

    for (let cy = 0; cy < sdfH; cy++) {
        const wy = cy * cellPx + 2;
        const ty = Math.floor(wy / tileSize);
        const ly = wy - ty * tileSize;
        for (let cx = 0; cx < sdfW; cx++) {
            const wx = cx * cellPx + 2;
            const tx = Math.floor(wx / tileSize);
            const lx = wx - tx * tileSize;
            const tile = terrain[ty][tx];
            const idx = cy * sdfW + cx;
            if (tile === 32) roadMask[idx] = 1;
            else if (tile >= 16 && tile < 32) roadMask[idx] = roadTransMasks[tile % 16][ly * tileSize + lx];
            if (tile === 34) pondMask[idx] = 1;
            else if (tile < 16) pondMask[idx] = pondTransMasks[tile][ly * tileSize + lx];
            if (tile === cliffTile || tile === seaTile) coastMask[idx] = 1;
        }
    }

    const roadSdf = smoothField(buildSignedDistance(roadMask, sdfW, sdfH, cellPx), sdfW, sdfH, 2);
    const pondSdf = buildSignedDistance(pondMask, sdfW, sdfH, cellPx);
    const coastSdf = buildSignedDistance(coastMask, sdfW, sdfH, cellPx);

    const pat = readPatternData(cleanGround);
    const halfW = pat.width >> 1;
    const patH = pat.height;
    const hdWidth = worldW * 2;
    const hdHeight = worldH * 2;
    const hdFloor = scene.textures.createCanvas('clearing-hd-floor', hdWidth, hdHeight);
    const hdCtx = hdFloor.getContext();
    const outImg = hdCtx.createImageData(hdWidth, hdHeight);
    const out = outImg.data;

    for (let ty = 0; ty < hdRows; ty++) {
        for (let tx = 0; tx < hdCols; tx++) {
            const tile = terrain[ty][tx];
            if (tile === cliffTile || tile === seaTile) continue;
            const centerX = tx * tileSize + 8;
            const centerY = ty * tileSize + 8;
            if (centerX > starterTown.x + 14 && centerX < starterTown.x + starterTown.width - 14
                && centerY > starterTown.y + 14 && centerY < starterTown.y + starterTown.height - 14) {
                continue;
            }
            const clearTile = biomeWeights(centerX, centerY, tileSize).clearing;
            if (clearTile <= 0.02) continue;

            for (let ly2 = 0; ly2 < tileSize * 2; ly2++) {
                const fy = ty * tileSize * 2 + ly2;
                const wy = (fy + 0.5) * 0.5;
                const py = fy % patH;
                const sCy = wy / cellPx - 0.5;

                for (let lx2 = 0; lx2 < tileSize * 2; lx2++) {
                    const fx = tx * tileSize * 2 + lx2;
                    const wx = (fx + 0.5) * 0.5;
                    const px = fx % halfW;
                    const gOff = (py * pat.width + px) * 4;
                    const dOff = (py * pat.width + halfW + px) * 4;
                    const oIdx = (fy * hdWidth + fx) * 4;

                    const sCx = wx / cellPx - 0.5;
                    const cDist = bilerpSdf(coastSdf, sdfW, sdfH, sCx, sCy);
                    if (cDist <= 0.5) continue;

                    const clearW = biomeWeights(wx, wy, tileSize).clearing;
                    const biomeAlpha = smoothstep((clearW - 0.14) / 0.68);
                    if (biomeAlpha <= 0) continue;
                    const coastFade = cDist < 18 ? clamp01((cDist - 0.5) / 17.5) : 1.0;
                    const alpha = Math.round(255 * biomeAlpha * coastFade);
                    if (alpha <= 0) continue;

                    const pDist = bilerpSdf(pondSdf, sdfW, sdfH, sCx, sCy);
                    if (pDist < 6.0) {
                        const pWobble = (smoothNoise(wx, wy, 12) * 0.72 + smoothNoise(wx, wy, 24) * 0.28 - 0.5) * 3.8;
                        const pd = pDist + pWobble * clamp01((pDist + 6.0) / 5.0);
                        if (pd < 2.8) {
                            if (pd > 1.3) {
                                out[oIdx] = Math.round(pat.data[gOff] * 0.85);
                                out[oIdx + 1] = Math.round(pat.data[gOff + 1] * 0.87);
                                out[oIdx + 2] = Math.round(pat.data[gOff + 2] * 0.83);
                                out[oIdx + 3] = alpha;
                                continue;
                            }
                            if (pd > 0.0) {
                                out[oIdx] = 30; out[oIdx + 1] = 49; out[oIdx + 2] = 35; out[oIdx + 3] = alpha;
                                continue;
                            }
                            if (pd > -2.4) {
                                out[oIdx] = Math.round(pat.data[dOff] * 0.72);
                                out[oIdx + 1] = Math.round(pat.data[dOff + 1] * 0.75);
                                out[oIdx + 2] = Math.round(pat.data[dOff + 2] * 0.64);
                                out[oIdx + 3] = alpha;
                                continue;
                            }
                            const nW = smoothNoise(wx * 0.45, wy * 0.75, 9);
                            const nC = smoothNoise(wx * 0.8 + 27, wy * 1.1, 5);
                            let col = pd < -9.5 ? [25, 114, 114] : (pd > -5.2 ? [68, 178, 168] : (nW > 0.55 ? [48, 154, 148] : [35, 132, 128]));
                            if (nC > 0.74 && pd >= -9.5) col = [86, 198, 184];
                            out[oIdx] = col[0]; out[oIdx + 1] = col[1]; out[oIdx + 2] = col[2]; out[oIdx + 3] = alpha;
                            continue;
                        }
                    }

                    const rDist = bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy);
                    if (rDist < 7.0) {
                        const wCoarse = smoothNoise(wx, wy, 20);
                        const wFine = smoothNoise(wx * 1.5 + 17, wy * 1.5 - 11, 8);
                        const wobble = (wCoarse * 0.65 + wFine * 0.35 - 0.5) * 5.6;
                        const wobbleScale = clamp01((rDist + 6.5) / 4.5);
                        const d = rDist + wobble * wobbleScale;

                        const nx = (bilerpSdf(roadSdf, sdfW, sdfH, sCx + 0.5, sCy) - bilerpSdf(roadSdf, sdfW, sdfH, sCx - 0.5, sCy)) * 0.25;
                        const ny = (bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy + 0.5) - bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy - 0.5)) * 0.25;
                        const topLeftRim = ny < -0.22 || nx < -0.32;
                        const bottomRightRim = ny > 0.22 || nx > 0.32;
                        const edgeTuft = rDist > -3.0 && d >= -0.6 && d <= 1.2 && hash2d(Math.floor(wx * 0.5), Math.floor(wy * 0.5)) > 0.86;

                        let roadMix = clamp01((0.9 - d) / 1.4);
                        if (edgeTuft) roadMix = 0.0;

                        let tone = 1.0;
                        if (d > -1.4 && d <= 0.1 && topLeftRim) tone = 0.83;
                        else if (d > 0.1 && d <= 1.3 && topLeftRim) tone = 0.86;
                        else if (d > -1.5 && d <= -0.1 && bottomRightRim && !topLeftRim) tone = 1.05;
                        else if (d < -6.5) tone = 0.95;

                        const r = (pat.data[gOff] + (pat.data[dOff] - pat.data[gOff]) * roadMix) * tone;
                        const g = (pat.data[gOff + 1] + (pat.data[dOff + 1] - pat.data[gOff + 1]) * roadMix) * tone;
                        const b = (pat.data[gOff + 2] + (pat.data[dOff + 2] - pat.data[gOff + 2]) * roadMix) * tone;
                        out[oIdx] = Math.max(0, Math.min(255, Math.round(r)));
                        out[oIdx + 1] = Math.max(0, Math.min(255, Math.round(g)));
                        out[oIdx + 2] = Math.max(0, Math.min(255, Math.round(b)));
                        out[oIdx + 3] = alpha;
                        continue;
                    }

                    const glade = (wx >= 80 && wx <= 230 && wy >= 110 && wy <= 230) || inClearingGlade(wx, wy, tileSize);
                    const shade = (!glade && smoothNoise(wx * 0.5, wy * 0.5, 42) < 0.36) ? 0.92 : 1.0;
                    const warpMod = 1 + organicWarp(wx, wy, 5) * 0.03;
                    out[oIdx] = Math.min(255, Math.round(pat.data[gOff] * shade * warpMod));
                    out[oIdx + 1] = Math.min(255, Math.round(pat.data[gOff + 1] * shade * warpMod));
                    out[oIdx + 2] = Math.min(255, Math.round(pat.data[gOff + 2] * shade * warpMod));
                    out[oIdx + 3] = alpha;
                }
            }
        }
    }

    hdCtx.putImageData(outImg, 0, 0);
    hdFloor.refresh();
    scene.add.image(0, 0, hdFloor.key).setOrigin(0).setScale(0.5).setDepth(0.5);
}

function drawSoftShadow(graphics, x, y, width, height) {
    graphics.fillStyle(0x182d29, .12).fillEllipse(x, y, width, height);
    graphics.fillStyle(0x182d29, .14).fillEllipse(x, y, Math.round(width * 0.68), Math.max(3, Math.round(height * 0.68)));
}

export function treePositions(terrain) {
    const positions = [...trees];
    for (let row = 5; row < terrain.length - 4; row += 6) {
        for (let column = 5; column < terrain[0].length - 4; column += 6) {
            if (row < 20 && column < 28) continue;
            const seed = (column * 37 + row * 53 + column * row * 7) % 101;
            if (seed % 5 === 0) continue;
            const x = column * 16 + seed % 25 - 12;
            const y = row * 16 + (seed * 7) % 25 - 12;
            const tx = Math.floor(x / 16);
            const ty = Math.floor(y / 16);
            if (terrain[ty]?.[tx] !== 33 || inZone(zones.skeleton, x, y) || inZone(zones.dragon, x, y)) {
                continue;
            }
            if (nearBlockedOrRoad(terrain, tx, ty)) {
                continue;
            }
            positions.push([x, y]);
        }
    }
    return positions.filter(([x, y]) => {
        if (inZone(zones.boar, x, y) && inClearingGlade(x, y)) return false;
        if (inZone(zones.boar, x, y) && (Math.floor(x / 16) * 17 + Math.floor(y / 16) * 29) % 4 === 0) return false;
        const tx = Math.floor(x / 16);
        const ty = Math.floor(y / 16);
        const tile = terrain[ty]?.[tx];
        if (
            tile === cliffTile
            || tile === seaTile
            || nearCoastOrCliff(terrain, tx, ty)
            || inWasteland(x, y)
            || inZone(zones.skeleton, x, y)
            || inZone(zones.dragon, x, y)
            || inLookoutCorridor(tx, ty)
            || isInStarterTown(x, y, 20)
            || (x > 96 && x < 192 && y > 80 && y < 180)
        ) {
            return false;
        }
        // Éclaircir progressivement la densité des saules à l'approche des autres biomes
        const { clearing } = biomeWeights(x, y, 16);
        if (clearing <= 0.20) {
            return false;
        }
        if (clearing < 0.78) {
            const roll = ((Math.floor(x) * 19 + Math.floor(y) * 31) % 100) / 100;
            return roll < (clearing - 0.20) / 0.58;
        }
        return true;
    });
}

function nearCoastOrCliff(terrain, tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const neighbor = terrain[ty + dy]?.[tx + dx];
            if (neighbor === cliffTile || neighbor === seaTile) {
                return true;
            }
        }
    }
    return false;
}

function nearBlockedOrRoad(terrain, tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (terrain[ty + dy]?.[tx + dx] !== 33) {
                return true;
            }
        }
    }
    return false;
}

function inLookoutCorridor(tx, ty) {
    return (tx >= 21 && tx <= 37 && ty >= 45 && ty <= 58)
        || (tx >= 97 && tx <= 113 && ty >= 94 && ty <= 122)
        || (tx >= 159 && tx <= 175 && ty >= 45 && ty <= 58)
        || (tx >= 161 && tx <= 173 && ty >= 159 && ty <= 168);
}

export function buildClearing(scene, terrain, tileSize, width, height, baseTiles) {
    const floor = scene.textures.createCanvas('clearing-floor', width, height);
    const context = floor.getContext();
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const key = (tile === cliffTile || tile === seaTile)
            ? 'herbe'
            : tile < 16
                ? 'eau-herbe'
                : tile < 32
                    ? 'chemin-herbe'
                    : baseTiles[tile - 32];
        const frame = scene.textures.getFrame(key, tile < 32 ? tile % 16 : undefined);
        drawFrame(context, frame, x * tileSize, y * tileSize);
    }));
    const ground = scene.textures.get('ground-detailed').getSourceImage();
    const cleanGround = createClearingGround(scene);
    const pathMask = document.createElement('canvas');
    pathMask.width = pathMask.height = tileSize;
    const maskContext = pathMask.getContext('2d', { willReadFrequently: true });
    const pathPatch = document.createElement('canvas');
    pathPatch.width = pathPatch.height = tileSize;
    const patchContext = pathPatch.getContext('2d');
    patchContext.imageSmoothingEnabled = false;
    // Sample a continuous 256px pattern across the map instead of restarting every tile.
    context.imageSmoothingEnabled = false;
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        if (tile < 16 || tile === 34 || tile === cliffTile || tile === seaTile) return;
        const clearingW = biomeWeights(x * tileSize + 8, y * tileSize + 8, tileSize).clearing;
        const clean = clearingW > .35;
        const pattern = clean ? cleanGround : ground;
        const groundCell = pattern.width / 2;
        const column = tile === 32 && !clean ? 1 : 0;
        context.drawImage(pattern,
            column * groundCell + (x % 16) * groundCell / 16,
            (y % 16) * groundCell / 16,
            groundCell / 16, groundCell / 16, x * tileSize, y * tileSize, tileSize, tileSize);
        if (tile < 32 || (clean && tile === 32)) {
            maskContext.clearRect(0, 0, tileSize, tileSize);
            if (tile < 32) drawFrame(maskContext, scene.textures.getFrame('chemin-herbe', tile % 16), 0, 0);
            const mask = maskContext.getImageData(0, 0, tileSize, tileSize);
            if (tile === 32) mask.data.set(clearingRoadMask(terrain, x, y, tileSize));
            else for (let i = 0; i < mask.data.length; i += 4) {
                mask.data[i + 3] = mask.data[i] > mask.data[i + 1] * 1.1 ? 255 : 0;
            }
            maskContext.putImageData(mask, 0, 0);
            patchContext.clearRect(0, 0, tileSize, tileSize);
            patchContext.globalCompositeOperation = 'source-over';
            patchContext.drawImage(pattern, groundCell + (x % 16) * groundCell / 16,
                (y % 16) * groundCell / 16, groundCell / 16, groundCell / 16, 0, 0, tileSize, tileSize);
            patchContext.globalCompositeOperation = 'destination-in';
            patchContext.drawImage(pathMask, 0, 0);
            context.drawImage(pathPatch, x * tileSize, y * tileSize);
        }
    }));

    const ripples = [];
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const seed = (x * 47 + y * 61 + x * y * 13) % 97;
        const px = x * tileSize + 2 + seed % 8;
        const py = y * tileSize + 2 + seed % 11;
        if (tile === 34 && seed < 31) ripples.push([px, py, seed]);
        if (tile !== 33) return;
        const clearingW = biomeWeights(x * tileSize + 8, y * tileSize + 8, tileSize).clearing;
        const atWater = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
            .some(([column, r]) => terrain[r]?.[column] < 16);
        if (atWater && seed < 76 && clearingW <= .35) {
            context.fillStyle = '#35584c';
            context.fillRect(px - 3, py, 10, 2);
            context.fillRect(px, py - 5, 1, 6);
            context.fillRect(px + 3, py - 7, 1, 8);
            context.fillRect(px + 5, py - 3, 1, 4);
            context.fillStyle = '#b28b54';
            context.fillRect(px, py - 6, 1, 2);
            context.fillRect(px + 3, py - 8, 1, 3);
            return;
        }
        if (clearingW > .35 || seed > 45) return;
        context.fillStyle = '#44634d';
        context.fillRect(px - 1, py + 1, 5, 1);
        context.fillStyle = seed < 11 ? '#d4ab61' : '#7c9251';
        context.fillRect(px, py, 1, 1);
        context.fillRect(px + 2, py - 1, 1, 2);
        context.fillRect(px + 3, py, 1, 1);
    }));
    const { cinders, lights } = drawRegionalGround(scene, context, terrain, tileSize);
    const { surfPoints, glints, seaDistance } = drawCoastalFloor(scene, context, terrain, tileSize);
    floor.refresh();
    scene.add.image(0, 0, floor.key).setOrigin(0);
    buildClearingHdFloor(scene, terrain, tileSize, cleanGround);

    const atlas = scene.textures.get('environment-detailed').getSourceImage();
    const cell = atlas.width / 2;
    function sceneryTexture(key, column, row, size, smooth = false) {
        const texture = scene.textures.createCanvas(key, size, size);
        const ctx = texture.getContext();
        ctx.imageSmoothingEnabled = smooth;
        if (smooth) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(atlas, column * cell, row * cell, cell, cell, 0, 0, size, size);
        texture.refresh();
    }
    sceneryTexture('willow-0', 0, 0, 64);
    sceneryTexture('willow-1', 0, 0, 60);
    sceneryTexture('mountain-rock', 1, 0, 80);
    sceneryTexture('ranger-cabin', 0, 1, 192, true);
    sceneryTexture('coastal-cliff', 1, 1, 64);
    createClearingSceneryTextures(scene);
    createScorchedCliff(scene);
    addCoastalProps(scene, terrain, tileSize, seaDistance);
    const hasHdLantern = scene.textures.exists('clearing-lantern');
    if (!hasHdLantern) {
        const lantern = scene.textures.createCanvas('lantern', 16, 14);
        drawLantern(lantern.getContext());
        lantern.refresh();
    }
    const lamps = [[160, 177], [271, 163], [286, 224], [148, 231], [306, 231]];
    const lampLightOffset = hasHdLantern ? [9, -22] : [0, -6];
    lights.push(...lamps.map(([x, y]) => ({
        x: x + lampLightOffset[0], y: y + lampLightOffset[1], radius: 62, color: 0xffb45f, lift: .56, glow: .27, flicker: true,
    })), { x: 140, y: 136, radius: 85, color: 0xffbb68, lift: .50, glow: .23, flicker: true });
    const shadows = scene.add.graphics().setDepth(1);
    drawSoftShadow(shadows, 140, 158, 72, 12);
    scene.add.image(140, 160, 'ranger-cabin').setOrigin(.5, 1).setDisplaySize(96, 96).setDepth(160);
    scene.obstacles.push(new Phaser.Geom.Rectangle(112, 130, 56, 26));
    treePositions(terrain).forEach(([x, y], index) => {
        const variant = index % 3;
        drawSoftShadow(shadows, x + 2, y - 2, variant === 2 ? 24 : 28, 9);
        scene.add.image(x, y, 'willow-' + variant).setOrigin(.5, 1)
            .setDisplaySize(variant === 2 ? 64 : 72, 80).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 2, y - 4, 4, 5));
    });
    lamps.forEach(([x, y]) => {
        drawSoftShadow(shadows, x + (hasHdLantern ? 3 : -1), y - 1, 14, 5);
        if (hasHdLantern) {
            scene.add.image(x, y, 'clearing-lantern').setOrigin(.28, 1).setDisplaySize(22, 36).setDepth(y);
        } else {
            scene.add.image(x, y, 'lantern').setOrigin(.3125, 1).setDepth(y);
        }
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 1, y - 3, 3, 4));
    });

    rocks.forEach(([column, row]) => {
        const x = (column + .5) * tileSize;
        const y = (row + .5) * tileSize;
        drawSoftShadow(shadows, x, y - 1, 46, 9);
        scene.add.image(x, y, 'mountain-rock').setOrigin(.5, 1).setDisplaySize(80, 58).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 20, y - 7, 40, 8));
    });
    addRegionalScenery(scene, shadows, tileSize);
    for (const prop of clearingScenery(tileSize)) {
        if (prop.kind !== 'flowers') drawSoftShadow(shadows, prop.x + 1, prop.y - 1, Math.round(prop.width * 0.72), 7);
        scene.add.image(prop.x, prop.y, 'clearing-' + prop.kind).setOrigin(.5, 1)
            .setDisplaySize(prop.width, prop.height).setDepth(prop.y);
        if (prop.collision) {
            const [dx, dy, w, h] = prop.collision;
            scene.obstacles.push(new Phaser.Geom.Rectangle(prop.x + dx, prop.y + dy, w, h));
        }
    }
    if (scene.textures.exists('clearing-reeds')) {
        for (const [rx, ry, rw, rh] of pondReeds) {
            drawSoftShadow(shadows, rx, ry - 1, Math.round(rw * 0.65), 6);
            scene.add.image(rx, ry, 'clearing-reeds').setOrigin(.5, 1).setDisplaySize(rw, rh).setDepth(ry);
        }
    }
    const mist = addCemeteryMist(scene, tileSize);
    for (const [text, column, row] of [
        ['↑ Clairière · N.1–5', 100, 32],
        ['← Clairière · N.1–5', 76, 17],
        ['← Bastion de Braise', 105, 36],
        ['Belvédère marin ↓', 25, 21],
        ['Cimetière →', 42, 13],
        ['Cimetière des Saules · N.5–10', 88, 50],
        ['Baie Émeraude ↓', 105, 95],
        ['Baie de Saphyr ↑', 169, 57],
        ['Montagnes ↓', 155, 67],
        ['Hauts de Saphyr · N.10–20', 149, 73],
        ['Terres dévastées →', 190, 92],
        ['Brèche des cendres · N.21–25', 204, 78],
        ['Plaine calcinée · N.25–30', 200, 119],
        ['Citadelle de la Brèche · N.30–35', 150, 128],
        ['← Trône d’Obsidienne · Boss N.40', 132, 150],
        ['Trône de Malakor · Palier N.40', 97, 146],
        ['Marais des Scories ↓ · N.41–47', 106, 175],
        ['Remparts de Basalte → · N.48–54', 135, 211],
        ['Cap du Gouffre → · N.55–60', 188, 211],
        ['Belvédère des Brisants ↓', 212, 235],
    ]) {
        const x = column * tileSize;
        const y = row * tileSize;
        const wooden = text.startsWith('Cimetière');
        const label = scene.add.text(x, y, text, {
            fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#f0d5a2',
            backgroundColor: wooden ? undefined : '#202b30', padding: { x: 4, y: 3 },
        }).setDepth(y + 30);
        if (wooden) {
            const width = Math.ceil(label.width);
            const height = Math.ceil(label.height);
            const center = Math.round(x + width / 2);
            const sign = scene.add.graphics().setDepth(y + 29);
            sign.fillStyle(0x39291e).fillRect(center - 3, y + height, 6, 12);
            sign.fillStyle(0x9b6b3e).fillRect(center - 1, y + height, 2, 10);
            sign.fillStyle(0x39291e).fillRect(x - 2, y - 2, width + 4, height + 4);
            sign.fillStyle(0x805332).fillRect(x, y, width, height);
            sign.fillStyle(0xb4854f).fillRect(x, y, width, 2);
            sign.fillStyle(0x634027).fillRect(x, y + height - 3, width, 3);
            sign.fillStyle(0x4b3223).fillRect(x, y + Math.floor(height / 2), width, 1);
            sign.fillStyle(0xc4a575).fillRect(x + 2, y + 4, 1, 1).fillRect(x + width - 3, y + 4, 1, 1);
        }
    }

    const ambience = scene.add.graphics().setDepth(2);
    const daylight = createClearingAtmosphere(scene);
    let previousFrame = -1;
    const animate = (time, still) => {
        daylight(time, still);
        const frame = still ? 0 : Math.floor(time / 200);
        if (frame === previousFrame) return;
        previousFrame = frame;
        ambience.clear();
        ripples.forEach(([x, y, phase]) => {
            const step = (frame + phase) % 8;
            if (step > 4) return;
            ambience.fillStyle(0x97cfce, [ .24, .43, .56, .44, .23 ][step]);
            ambience.fillRect(x, y, 2 + step, 1);
            if (step > 1) ambience.fillRect(x + 2, y + 2, step, 1);
        });
        lamps.forEach(([x, y], index) => {
            const glow = (frame + index * 3) % 4;
            const gx = x + lampLightOffset[0];
            const gy = y + lampLightOffset[1];
            ambience.fillStyle(0xe9984c, .10 + glow * .016).fillRect(gx - 6, gy - 4, 12, 8);
            ambience.fillStyle(0xffc979, .11).fillRect(gx - 3, gy - 2, 6, 5);
        });
        for (let puff = 0; puff < 4; puff++) {
            const age = (frame + puff * 4) % 16;
            const spread = 2 + Math.floor(age / 5);
            const sx = 110 + Math.floor(age * 0.45) + (puff % 2) - 1;
            const sy = 76 - Math.floor(age * 1.4);
            ambience.fillStyle(0xd8ddd7, .24 * (1 - age / 16)).fillEllipse(sx, sy, spread * 2, spread + 1);
        }
        mist.forEach((patch, index) => patch.setAlpha(.55 + .25 * Math.sin((frame + index * 3) / 7)));
        for (const [x, y, seed] of cinders) {
            const rise = (frame + seed) % 9;
            ambience.fillStyle(0xf59462, .64 - rise * .06).fillRect(x + Math.floor(rise / 3), y - rise, 1, 1);
        }
        animateCoast(ambience, frame, surfPoints, glints);
    };
    return { animate, lights };
}
