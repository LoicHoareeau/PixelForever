import { cemeteryRuins, cliffTile, seaTile, zones } from './exploration.js';
import { biomeWeights, smoothstep } from './biome-gradient.js';
import { starterTown } from './starter-town.js';
import {
    bilerpSdf,
    buildSignedDistance,
    clamp01,
    drawSoftShadow,
    extractTransitionMasks,
    hash2d,
    readPatternData,
    smoothField,
    smoothNoise,
} from './clearing-style.js';

export const cemeteryLanterns = [
    [101, 51], [106, 58], [101, 65], [106, 74],
    [118, 69], [128, 74], [101, 86], [101, 102],
];

const cemeteryPillars = [[101, 69], [105, 69], [101, 73], [105, 73]];

export const cemeteryMoonbeams = [
    [1450, 880, 44, 175],
    [1690, 1020, 48, 190],
    [1860, 1180, 42, 165],
];

const shrineAnchors = [[90, 60], [116, 60], [112, 81]];

const wispAnchors = [
    [87, 56], [95, 58], [111, 57], [122, 56],
    [86, 68], [98, 66], [114, 67], [125, 70],
    [89, 80], [99, 86], [116, 82], [124, 85],
];

/**
 * Sources lumineuses fixes du Cimetière des Saules :
 * lueurs cyan des cryptes, lanternes en fer forgé et halos lunaires.
 */
export function cemeteryLights(tileSize = 16) {
    const lights = [];
    for (const [col, row] of cemeteryRuins) {
        lights.push({
            x: (col + 0.5) * tileSize,
            y: (row + 0.5) * tileSize - 16,
            radius: 68,
            color: 0x5fe8dc,
            lift: 0.44,
            glow: 0.28,
            flicker: true,
        });
    }
    for (const [col, row] of cemeteryLanterns) {
        lights.push({
            x: (col + 0.5) * tileSize + 5,
            y: (row + 0.5) * tileSize - 22,
            radius: 76,
            color: 0xffad52,
            lift: 0.58,
            glow: 0.30,
            flicker: true,
        });
    }
    for (const [col, row] of shrineAnchors) {
        lights.push({
            x: (col + 0.5) * tileSize,
            y: (row + 0.5) * tileSize - 8,
            radius: 56,
            color: 0x82d8ff,
            lift: 0.26,
            glow: 0.18,
            flicker: true,
        });
    }
    return lights;
}

/**
 * Génère le calque sol 2× HD du Cimetière avec champ de distance continu,
 * dalles gothiques sculptées et fondu organique vers les biomes voisins.
 */
export function buildCemeteryHdFloor(scene, terrain, tileSize) {
    if (!scene.textures.exists('cemetery-ground-v2')) return;
    const col0 = 66;
    const row0 = 36;
    const col1 = Math.min(terrain[0].length, 144);
    const row1 = Math.min(terrain.length, 124);
    const hdCols = col1 - col0;
    const hdRows = row1 - row0;
    const worldW = hdCols * tileSize;
    const worldH = hdRows * tileSize;
    const cellPx = 4;
    const sdfW = worldW / cellPx;
    const sdfH = worldH / cellPx;

    const roadTransMasks = extractTransitionMasks(scene, 'chemin-herbe', tileSize, (r, g) => r > g * 1.1);
    const roadMask = new Uint8Array(sdfW * sdfH);
    const coastMask = new Uint8Array(sdfW * sdfH);

    for (let cy = 0; cy < sdfH; cy++) {
        const wy = row0 * tileSize + cy * cellPx + 2;
        const ty = Math.floor(wy / tileSize);
        const ly = wy - ty * tileSize;
        for (let cx = 0; cx < sdfW; cx++) {
            const wx = col0 * tileSize + cx * cellPx + 2;
            const tx = Math.floor(wx / tileSize);
            const lx = wx - tx * tileSize;
            const tile = terrain[ty][tx];
            const idx = cy * sdfW + cx;
            if (tile === 32) roadMask[idx] = 1;
            else if (tile >= 16 && tile < 32) roadMask[idx] = roadTransMasks[tile % 16][ly * tileSize + lx];
            if (tile === cliffTile || tile === seaTile) coastMask[idx] = 1;
        }
    }

    const roadSdf = smoothField(buildSignedDistance(roadMask, sdfW, sdfH, cellPx), sdfW, sdfH, 2);
    const coastSdf = buildSignedDistance(coastMask, sdfW, sdfH, cellPx);

    const pat = readPatternData(scene.textures.get('cemetery-ground-v2').getSourceImage());
    const halfW = pat.width >> 1;
    const patH = pat.height;
    const hdWidth = worldW * 2;
    const hdHeight = worldH * 2;
    const hdFloor = scene.textures.createCanvas('cemetery-hd-floor', hdWidth, hdHeight);
    const hdCtx = hdFloor.getContext();
    const outImg = hdCtx.createImageData(hdWidth, hdHeight);
    const out = outImg.data;
    const originX = col0 * tileSize;
    const originY = row0 * tileSize;

    for (let ty = row0; ty < row1; ty++) {
        for (let tx = col0; tx < col1; tx++) {
            const tile = terrain[ty][tx];
            if (tile === cliffTile || tile === seaTile) continue;
            const centerX = tx * tileSize + 8;
            const centerY = ty * tileSize + 8;
            if (centerX > starterTown.x + 14 && centerX < starterTown.x + starterTown.width - 14
                && centerY > starterTown.y + 14 && centerY < starterTown.y + starterTown.height - 14) {
                continue;
            }
            if (biomeWeights(centerX, centerY, tileSize).cemetery <= 0.02) continue;

            for (let ly2 = 0; ly2 < tileSize * 2; ly2++) {
                const fy = (ty - row0) * tileSize * 2 + ly2;
                const wy = originY + (fy + 0.5) * 0.5;
                const py = (ty * tileSize * 2 + ly2) % patH;
                const sCy = (wy - originY) / cellPx - 0.5;

                for (let lx2 = 0; lx2 < tileSize * 2; lx2++) {
                    const fx = (tx - col0) * tileSize * 2 + lx2;
                    const wx = originX + (fx + 0.5) * 0.5;
                    const px = (tx * tileSize * 2 + lx2) % halfW;
                    const gOff = (py * pat.width + px) * 4;
                    const rOff = (py * pat.width + halfW + px) * 4;
                    const oIdx = (fy * hdWidth + fx) * 4;

                    const sCx = (wx - originX) / cellPx - 0.5;
                    const cDist = bilerpSdf(coastSdf, sdfW, sdfH, sCx, sCy);
                    if (cDist <= 0.5) continue;

                    const cemW = biomeWeights(wx, wy, tileSize).cemetery;
                    const biomeAlpha = smoothstep((cemW - 0.10) / 0.72);
                    if (biomeAlpha <= 0) continue;
                    const coastFade = cDist < 18 ? clamp01((cDist - 0.5) / 17.5) : 1.0;
                    const alpha = Math.round(255 * biomeAlpha * coastFade);
                    if (alpha <= 0) continue;

                    const shade = 1.0 - smoothstep((0.44 - smoothNoise(wx * 0.5, wy * 0.5, 42)) / 0.16) * 0.07;
                    const rDist = bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy);
                    if (rDist < 7.0) {
                        const wCoarse = smoothNoise(wx, wy, 19);
                        const wFine = smoothNoise(wx * 1.6 + 17, wy * 1.6 - 11, 7);
                        const wobble = (wCoarse * 0.65 + wFine * 0.35 - 0.5) * 5.2;
                        const d = rDist + wobble * clamp01((rDist + 6.5) / 4.5);

                        const nx = (bilerpSdf(roadSdf, sdfW, sdfH, sCx + 0.5, sCy) - bilerpSdf(roadSdf, sdfW, sdfH, sCx - 0.5, sCy)) * 0.25;
                        const ny = (bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy + 0.5) - bilerpSdf(roadSdf, sdfW, sdfH, sCx, sCy - 0.5)) * 0.25;
                        const topLeftRim = ny < -0.22 || nx < -0.32;
                        const bottomRightRim = ny > 0.22 || nx > 0.32;
                        const edgeTuft = rDist > -3.0 && d >= -0.6 && d <= 1.2 && hash2d(Math.floor(wx * 0.5), Math.floor(wy * 0.5)) > 0.86;
                        const roadMix = edgeTuft ? 0.0 : clamp01((0.9 - d) / 1.4);

                        let tone = 1.0 - (1.0 - roadMix) * (1.0 - shade);
                        if (d > -1.4 && d <= 0.1 && topLeftRim) tone *= 0.82;
                        else if (d > 0.1 && d <= 1.3 && topLeftRim) tone *= 0.86;
                        else if (d > -1.5 && d <= -0.1 && bottomRightRim && !topLeftRim) tone *= 1.06;

                        out[oIdx] = Math.max(0, Math.min(255, Math.round((pat.data[gOff] + (pat.data[rOff] - pat.data[gOff]) * roadMix) * tone)));
                        out[oIdx + 1] = Math.max(0, Math.min(255, Math.round((pat.data[gOff + 1] + (pat.data[rOff + 1] - pat.data[gOff + 1]) * roadMix) * tone)));
                        out[oIdx + 2] = Math.max(0, Math.min(255, Math.round((pat.data[gOff + 2] + (pat.data[rOff + 2] - pat.data[gOff + 2]) * roadMix) * tone)));
                        out[oIdx + 3] = alpha;
                        continue;
                    }

                    out[oIdx] = Math.round(pat.data[gOff] * shade);
                    out[oIdx + 1] = Math.round(pat.data[gOff + 1] * shade);
                    out[oIdx + 2] = Math.round(pat.data[gOff + 2] * shade);
                    out[oIdx + 3] = alpha;
                }
            }
        }
    }

    hdCtx.putImageData(outImg, 0, 0);
    hdFloor.refresh();
    scene.add.image(originX, originY, hdFloor.key).setOrigin(0).setScale(0.5).setDepth(0.55);
}

/**
 * Ajoute les lanternes en fer forgé et piliers décoratifs sans collision
 * afin de préserver la navigabilité existante.
 */
export function addCemeteryDecor(scene, shadows, tileSize) {
    if (!scene.textures.exists('cemetery-props-v2')) return;
    for (const [col, row] of cemeteryLanterns) {
        const x = (col + 0.5) * tileSize;
        const y = (row + 0.5) * tileSize;
        drawSoftShadow(shadows, x + 3, y - 1, 14, 5, 0x141c24);
        scene.add.image(x, y, 'cemetery-props-v2', 'lantern')
            .setOrigin(0.28, 1).setDisplaySize(22, 36).setDepth(y);
    }
    for (const [col, row] of cemeteryPillars) {
        const x = (col + 0.5) * tileSize;
        const y = (row + 0.5) * tileSize;
        drawSoftShadow(shadows, x, y - 1, 20, 7, 0x141c24);
        scene.add.image(x, y, 'cemetery-props-v2', 'pillar')
            .setOrigin(0.5, 1).setDisplaySize(22, 54).setDepth(y);
    }
}

/**
 * VFX et effets lumineux d'ambiance du Cimetière : faisceaux lunaires,
 * lueurs cyan des cryptes, étincelles de lanternes et feux follets spectraux.
 */
export function createCemeteryAtmosphere(scene, tileSize = 16) {
    const layer = scene.add.graphics().setDepth(2.6).setBlendMode('ADD');
    const crypts = cemeteryRuins.map(([col, row]) => [(col + 0.5) * tileSize, (row + 0.5) * tileSize - 14]);
    const lanterns = cemeteryLanterns.map(([col, row]) => [(col + 0.5) * tileSize + 5, (row + 0.5) * tileSize - 22]);
    const wisps = wispAnchors.map(([col, row], index) => [
        (col + 0.5) * tileSize,
        (row + 0.5) * tileSize - 14,
        index * 0.27,
    ]);
    let last = -1;
    let lastView = '';

    return (time, still) => {
        const tick = still ? 0 : Math.floor(time / 80);
        const view = scene.cameras.main.worldView;
        const viewKey = Math.floor(view.x / 64) + ':' + Math.floor(view.y / 64);
        if (tick === last && viewKey === lastView) return;
        last = tick;
        lastView = viewKey;
        layer.clear();

        if (view.right < zones.skeleton.left * tileSize - 180 || view.x > zones.skeleton.right * tileSize + 180
            || view.bottom < zones.skeleton.top * tileSize - 180 || view.y > (zones.skeleton.bottom + 28) * tileSize) {
            return;
        }

        for (const [x, y, width, height] of cemeteryMoonbeams) {
            if (x + height < view.x || x - width > view.right || y + height < view.y || y > view.bottom) continue;
            const drift = still ? 0 : Math.sin(time / 7200 + x) * 2.5;
            for (let band = 0; band < 3; band++) {
                const inset = band * width * 0.18;
                const lean = height * 0.44 + drift;
                layer.fillStyle(0x9ad4ff, 0.026 - band * 0.004);
                layer.fillPoints([
                    { x: x + inset, y },
                    { x: x + width - inset, y },
                    { x: x + lean + width * 1.25 - inset, y: y + height },
                    { x: x + lean + inset, y: y + height },
                ], true);
            }
        }

        for (const [index, [cx, cy]] of crypts.entries()) {
            if (cx < view.x - 32 || cx > view.right + 32 || cy < view.y - 32 || cy > view.bottom + 32) continue;
            const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(time / 950 + index * 1.3);
            layer.fillStyle(0x66f0e4, 0.14 + pulse * 0.08).fillEllipse(cx, cy, 18, 22);
        }

        for (const [index, [lx, ly]] of lanterns.entries()) {
            if (lx < view.x - 32 || lx > view.right + 32 || ly < view.y - 32 || ly > view.bottom + 32) continue;
            const flicker = still ? 0.5 : 0.5 + 0.5 * Math.sin(time / 240 + index * 2.1);
            layer.fillStyle(0xffc26b, 0.14 + flicker * 0.08).fillEllipse(lx, ly, 14, 14);
            if (still) continue;
            for (let spark = 0; spark < 2; spark++) {
                const phase = (time / (1800 + spark * 450) + index * 0.31 + spark * 0.47) % 1;
                const sx = Math.round(lx + Math.sin(phase * 6.28 + index) * 4);
                const sy = Math.round(ly - 2 - phase * 14);
                layer.fillStyle(0xffd788, Math.sin(phase * Math.PI) * 0.24).fillRect(sx, sy, 1, 1);
            }
        }

        if (still) return;
        for (const [index, [wx, wy, offset]] of wisps.entries()) {
            const phase = (time / (4200 + (index % 3) * 700) + offset) % 1;
            const x = Math.round(wx + Math.sin(phase * 6.28 + index) * 16);
            const y = Math.round(wy + Math.cos(phase * 6.28 * 0.7 + index) * 8 - phase * 10);
            if (x < view.x || x > view.right || y < view.y || y > view.bottom) continue;
            const glowAlpha = (0.35 + 0.65 * Math.sin(phase * Math.PI)) * 0.28;
            layer.fillStyle(0x46b8d8, glowAlpha * 0.5).fillRect(x - 1, y - 1, 4, 4);
            layer.fillStyle(0x82f5ea, glowAlpha).fillRect(x, y, 2, 2);
        }
    };
}
