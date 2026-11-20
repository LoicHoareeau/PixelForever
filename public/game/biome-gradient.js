import { frontierZones, wastelandZones, zones } from './exploration.js';

// ---------------------------------------------------------------------------
// Configuration des gradients organiques entre biomes
// ---------------------------------------------------------------------------

export const biomeFadeConfig = {
    cemetery: {
        reach: 176,
        warp: 48,
        seedOffset: 11,
        zones: [zones.skeleton],
    },
    mountain: {
        reach: 168,
        warp: 44,
        seedOffset: 29,
        zones: [zones.dragon],
    },
    wasteland: {
        reach: 184,
        warp: 48,
        seedOffset: 47,
        zones: wastelandZones,
    },
};

const frontierFades = frontierZones.map((zone, index) => [
    [zone], 176, 48, 61 + index * 13,
]);

export const maxBiomeReach = 240;

// ---------------------------------------------------------------------------
// Fonctions mathématiques et bruit déterministe multi-échelle
// ---------------------------------------------------------------------------

function hash2d(x, y) {
    let hash = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801);
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
    return ((hash ^ (hash >>> 13)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, period) {
    const col = Math.floor(x / period);
    const row = Math.floor(y / period);
    const u = x / period - col;
    const v = y / period - row;
    const top = hash2d(col, row) * (1 - u) + hash2d(col + 1, row) * u;
    const bottom = hash2d(col, row + 1) * (1 - u) + hash2d(col + 1, row + 1) * u;
    return top * (1 - v) + bottom * v;
}

export function smoothstep(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Distance euclidienne réelle en pixels d'un point jusqu'au rectangle d'une zone.
 * Élimine les angles droits visibles créés par la distance de Chebyshev.
 */
export function distanceToZoneEuclidean(zone, x, y, tileSize = 16) {
    const left = zone.left * tileSize;
    const right = (zone.right + 1) * tileSize;
    const top = zone.top * tileSize;
    const bottom = (zone.bottom + 1) * tileSize;

    const dx = x < left ? left - x : (x > right ? x - right : 0);
    const dy = y < top ? top - y : (y > bottom ? y - bottom : 0);
    return Math.hypot(dx, dy);
}

export function distanceToRegion(regionZones, x, y, tileSize = 16) {
    let best = Infinity;
    for (const zone of regionZones) {
        const dist = distanceToZoneEuclidean(zone, x, y, tileSize);
        if (dist < best) {
            best = dist;
        }
    }
    return best;
}

/**
 * Perturbation organique à trois octaves [-0.5, +0.5] pour casser les bordures droites.
 */
export function organicWarp(x, y, seedOffset = 0) {
    const ox = x + seedOffset * 137;
    const oy = y - seedOffset * 89;
    const coarse = smoothNoise(ox, oy, 96) * 0.56;
    const medium = smoothNoise(ox + 23, oy + 41, 32) * 0.30;
    const fine = smoothNoise(ox - 19, oy + 17, 8) * 0.14;
    return (coarse + medium + fine) - 0.5;
}

function rawBiomeWeight(regionZones, x, y, tileSize, reach, warpAmp, seedOffset) {
    const dist = distanceToRegion(regionZones, x, y, tileSize);
    if (dist === 0) {
        return 1;
    }

    const warpedDist = Math.max(0, dist + organicWarp(x, y, seedOffset) * warpAmp);
    if (warpedDist >= reach) {
        return 0;
    }

    return smoothstep(1 - warpedDist / reach);
}

// ---------------------------------------------------------------------------
// Évaluation des poids de biomes et libellés de transition
// ---------------------------------------------------------------------------

/**
 * Écrit les poids normalisés de la clairière aux trois secteurs côtiers dans `out`
 * sans aucune allocation pour le traitement pixel par pixel des sols.
 */
export function writeBiomeWeights(x, y, tileSize, out) {
    const cem = rawBiomeWeight(
        biomeFadeConfig.cemetery.zones,
        x,
        y,
        tileSize,
        biomeFadeConfig.cemetery.reach,
        biomeFadeConfig.cemetery.warp,
        biomeFadeConfig.cemetery.seedOffset,
    );
    const mnt = rawBiomeWeight(
        biomeFadeConfig.mountain.zones,
        x,
        y,
        tileSize,
        biomeFadeConfig.mountain.reach,
        biomeFadeConfig.mountain.warp,
        biomeFadeConfig.mountain.seedOffset,
    );
    const ash = rawBiomeWeight(
        biomeFadeConfig.wasteland.zones,
        x,
        y,
        tileSize,
        biomeFadeConfig.wasteland.reach,
        biomeFadeConfig.wasteland.warp,
        biomeFadeConfig.wasteland.seedOffset,
    );

    let frontierSum = 0;
    let frontierPeak = 0;
    for (let index = 0; index < frontierFades.length; index++) {
        const [region, reach, warp, seed] = frontierFades[index];
        const weight = rawBiomeWeight(region, x, y, tileSize, reach, warp, seed);
        out[4 + index] = weight;
        frontierSum += weight;
        frontierPeak = Math.max(frontierPeak, weight);
    }
    const previous = 1 - frontierPeak;
    const sum = (cem + mnt + ash) * previous + frontierSum;
    const divisor = Math.max(1, sum);
    out[0] = Math.max(0, 1 - sum);
    out[1] = cem * previous / divisor;
    out[2] = mnt * previous / divisor;
    out[3] = ash * previous / divisor;
    for (let index = 4; index < out.length; index++) out[index] /= divisor;
}

export function biomeWeights(x, y, tileSize = 16) {
    const weights = new Float32Array(7);
    writeBiomeWeights(x, y, tileSize, weights);
    return {
        clearing: weights[0],
        cemetery: weights[1],
        mountain: weights[2],
        wasteland: weights[3],
        saltMarsh: weights[4],
        basaltRamparts: weights[5],
        riftCape: weights[6],
    };
}

/**
 * Permet d'ignorer d'emblée les tuiles 100 % clairière lors de la fusion des sols.
 */
export function tileHasNonClearingBiome(tileX, tileY, tileSize = 16) {
    const centerX = (tileX + 0.5) * tileSize;
    const centerY = (tileY + 0.5) * tileSize;
    const threshold = maxBiomeReach + tileSize;

    return distanceToRegion(biomeFadeConfig.cemetery.zones, centerX, centerY, tileSize) <= threshold
        || distanceToRegion(biomeFadeConfig.mountain.zones, centerX, centerY, tileSize) <= threshold
        || distanceToRegion(biomeFadeConfig.wasteland.zones, centerX, centerY, tileSize) <= threshold
        || distanceToRegion(frontierZones, centerX, centerY, tileSize) <= threshold;
}

/**
 * Retourne le nom de secteur de transition pour l'ATH lorsqu'on circule entre deux zones.
 */
export function transitionZoneLabel(x, y, tileSize = 16) {
    const weights = biomeWeights(x, y, tileSize);
    if (weights.saltMarsh + weights.basaltRamparts + weights.riftCape >= 0.25) {
        return 'Sentier des Falaises';
    }
    if (weights.wasteland >= 0.25) {
        return 'Marches calcinées';
    }
    if (weights.mountain >= 0.25) {
        return 'Contreforts de Saphyr';
    }
    if (weights.cemetery >= 0.25) {
        return 'Lisière du Cimetière';
    }
    return 'Sentier des Saules';
}
