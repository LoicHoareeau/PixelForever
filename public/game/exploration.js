export const tileSize = 16;
export const columns = 224;
export const rows = 160;
export const cliffTile = 35;
export const seaTile = 36;
export const questNpc = { x: 224, y: 190, range: 48 };

// ---------------------------------------------------------------------------
// Zones agrandies et belvédères côtiers
// ---------------------------------------------------------------------------

export const zones = {
    boar: { name: 'Clairière · N.1–5', left: 4, top: 4, right: 48, bottom: 38 },
    skeleton: { name: 'Cimetière · N.5–10', left: 78, top: 46, right: 118, bottom: 80 },
    dragon: { name: 'Montagnes · N.10–20', left: 132, top: 68, right: 172, bottom: 108 },
    imp: { name: 'Terres dévastées · Brèche (N.21–25)', left: 173, top: 72, right: 205, bottom: 105 },
    hound: { name: 'Terres dévastées · Plaine calcinée (N.25–30)', left: 170, top: 106, right: 204, bottom: 138 },
    fiend: { name: 'Terres dévastées · Citadelle (N.30–35)', left: 126, top: 109, right: 169, bottom: 140 },
};

export const coastalLookouts = [
    { name: 'Cap des Saules · Belvédère marin', left: 18, top: 38, right: 34, bottom: 50, centerCell: [25, 47] },
    { name: 'Baie Émeraude · Belvédère Sud', left: 89, top: 81, right: 104, bottom: 107, centerCell: [96, 104] },
    { name: 'Baie de Saphyr · Belvédère Nord-Est', left: 143, top: 42, right: 160, bottom: 67, centerCell: [151, 45] },
    { name: 'Cap d’Obsidienne · Falaises Sud', left: 142, top: 135, right: 153, bottom: 140, centerCell: [147, 136] },
];

export function isCoastBorderTile(tile) {
    return tile === cliffTile || tile === seaTile;
}

export function inWasteland(x, y) {
    return inZone(zones.imp, x, y) || inZone(zones.hound, x, y) || inZone(zones.fiend, x, y);
}

export function inZone(zone, x, y) {
    return x >= zone.left * tileSize
        && x < (zone.right + 1) * tileSize
        && y >= zone.top * tileSize
        && y < (zone.bottom + 1) * tileSize;
}

export function cameraZoom(viewWidth, viewHeight) {
    return Math.max(
        1,
        Math.ceil(viewWidth / (columns * tileSize)),
        Math.ceil(viewHeight / (rows * tileSize)),
    );
}

// ---------------------------------------------------------------------------
// Génération du terrain, chemins côtiers et péninsule mer / falaises
// ---------------------------------------------------------------------------

function waveNS(x) {
    return Math.round(2.5 * Math.sin(x * 0.09) + 1.5 * Math.cos(x * 0.21));
}

function waveEW(y) {
    return Math.round(2.5 * Math.sin(y * 0.11) + 1.5 * Math.cos(y * 0.23));
}

function pointInBox(x, y, box, margin = 0) {
    return x >= box.left - margin
        && x <= box.right + margin
        && y >= box.top - margin
        && y <= box.bottom + margin;
}

export function buildTerrain(clearing) {
    const terrain = Array.from({ length: rows }, () => Array(columns).fill(33));
    clearing.forEach((row, y) => row.forEach((tile, x) => {
        terrain[y][x] = tile;
    }));

    const road = (left, top, right, bottom) => {
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                terrain[y][x] = 32;
            }
        }
    };

    // Réseau routier principal et promenades vers les belvédères marins
    road(14, 15, 96, 17);
    road(94, 15, 96, 62);
    road(22, 18, 24, 48);
    road(20, 46, 31, 48);
    road(94, 62, 96, 105);
    road(92, 103, 102, 105);
    road(95, 60, 152, 62);
    road(150, 44, 152, 88);
    road(146, 44, 158, 46);
    road(151, 86, 188, 88);
    road(186, 87, 188, 124);
    road(146, 122, 188, 124);
    road(146, 123, 148, 137);

    const protectedAreas = [
        ...Object.values(zones),
        ...coastalLookouts,
        { left: 14, top: 15, right: 96, bottom: 17 },
        { left: 94, top: 15, right: 96, bottom: 105 },
        { left: 95, top: 60, right: 152, bottom: 62 },
        { left: 150, top: 44, right: 152, bottom: 88 },
        { left: 151, top: 86, right: 188, bottom: 88 },
        { left: 186, top: 87, right: 188, bottom: 124 },
        { left: 146, top: 122, right: 188, bottom: 124 },
        { left: 146, top: 123, right: 148, bottom: 137 },
    ];

    const isProtected = (x, y) => protectedAreas.some((box) => pointInBox(x, y, box, 4));

    const isRawSea = (x, y) => {
        if (x === 0 || y === 0 || x >= columns - 1 || y >= rows - 1) {
            return true;
        }

        // Littoral Nord et Baie de Saphyr
        if (x <= 51) {
            if (y < 1) {
                return true;
            }
        } else if (x <= 102) {
            if (y < Math.min(10, 7 + waveNS(x))) {
                return true;
            }
        } else if (x <= 138) {
            if (y < Math.min(28, 22 + waveNS(x))) {
                return true;
            }
        } else if (x <= 176) {
            if (y < Math.min(35, 30 + waveNS(x))) {
                return true;
            }
        } else if (y < Math.min(54, 46 + waveNS(x))) {
            return true;
        }

        // Littoral Ouest et Baie Émeraude du Sud-Ouest
        if (y >= 44 && x < 13 + waveEW(y)) {
            return true;
        }
        if (x <= 46 && y >= 57 + waveNS(x)) {
            return true;
        }
        if (x > 46 && x <= 74 && y >= 65 + waveNS(x)) {
            return true;
        }
        if (x > 74 && x <= 116 && y >= 113 + waveNS(x)) {
            return true;
        }
        if (x > 116 && x <= 125 && y >= 116 + (x - 116) * 3) {
            return true;
        }
        if (x > 125 && y >= 145 + waveNS(x)) {
            return true;
        }

        // Littoral Est (mer de Saphyr vers mer d'obsidienne)
        return x >= 210 + waveEW(y);
    };

    const seaMask = Array.from({ length: rows }, () => Array(columns).fill(false));
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            const outerRim = x === 0 || y === 0 || x === columns - 1 || y === rows - 1;
            if (outerRim || (isRawSea(x, y) && !isProtected(x, y))) {
                seaMask[y][x] = true;
                terrain[y][x] = seaTile;
            }
        }
    }

    // Ceinture continue de 3 cases de falaises entre toute terre marchable et la mer
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            if (seaMask[y][x]) {
                continue;
            }
            let nearSea = x < 4 || y < 4 || x >= columns - 4 || y >= rows - 4;
            if (!nearSea) {
                for (let dy = -3; dy <= 3 && !nearSea; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        if (seaMask[y + dy]?.[x + dx]) {
                            nearSea = true;
                            break;
                        }
                    }
                }
            }
            if (nearSea) {
                terrain[y][x] = cliffTile;
            }
        }
    }

    return terrain;
}

export function groundWalkable(terrain, x, y) {
    return [x - 3, x, x + 3].every((foot) => {
        const tile = terrain[Math.floor(y / tileSize)]?.[Math.floor(foot / tileSize)];
        return tile !== undefined && tile >= 16 && tile !== 34 && tile !== cliffTile && tile !== seaTile;
    });
}

// ---------------------------------------------------------------------------
// Obstacles placés dans les zones agrandies (hors chemins et patrouilles)
// ---------------------------------------------------------------------------

export const graves = [
    [80, 52], [84, 52], [88, 52], [80, 56], [85, 56], [90, 56],
    [100, 50], [105, 50], [110, 50], [100, 56], [106, 56], [113, 54],
    [81, 65], [86, 65], [90, 65], [82, 70], [88, 70], [83, 76],
    [101, 66], [106, 66], [112, 66], [103, 72], [112, 73], [105, 77],
];

export const cemeteryRuins = [
    [80, 48], [91, 48], [115, 48], [79, 59],
    [79, 77], [91, 77], [115, 77], [116, 63],
];

export const wastelandRuins = [
    [175, 74], [184, 74], [202, 76], [202, 92], [192, 102], [175, 103],
    [173, 108], [202, 110], [202, 128], [191, 136], [172, 135],
    [166, 111], [129, 111], [129, 128], [142, 138], [165, 137],
];

export const rocks = [
    [134, 70], [140, 70], [146, 70], [156, 70], [163, 70], [169, 70],
    [134, 79], [141, 80], [158, 79], [169, 77], [169, 85],
    [134, 89], [144, 91], [157, 91], [169, 92], [141, 95],
    [135, 102], [139, 106], [147, 106], [155, 106], [162, 106], [168, 102],
    [158, 97], [165, 98], [136, 84], [162, 85],
];
