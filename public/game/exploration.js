export const tileSize = 16;
export const columns = 256;
export const rows = 252;
export const cliffTile = 35;
export const seaTile = 36;
export const questNpc = { x: 224, y: 190, range: 48 };

// ---------------------------------------------------------------------------
// Zones agrandies avec couloirs tampons pour gradients progressifs
// ---------------------------------------------------------------------------

export const zones = {
    boar: { name: 'Clairière · N.1–5', left: 4, top: 4, right: 56, bottom: 44 },
    skeleton: { name: 'Cimetière · N.5–10', left: 82, top: 52, right: 128, bottom: 92 },
    dragon: { name: 'Montagnes · N.10–20', left: 146, top: 72, right: 188, bottom: 114 },
    imp: { name: 'Terres dévastées · Brèche (N.21–25)', left: 200, top: 76, right: 238, bottom: 114 },
    hound: { name: 'Terres dévastées · Plaine calcinée (N.25–30)', left: 196, top: 118, right: 236, bottom: 168 },
    fiend: { name: 'Terres dévastées · Citadelle (N.30–35)', left: 142, top: 126, right: 192, bottom: 168 },
    breach_lord: { name: 'Trône d’Obsidienne · Boss N.40', left: 82, top: 142, right: 132, bottom: 174 },
    salt_hound: { name: 'Marais des Scories · N.41–47', left: 78, top: 190, right: 122, bottom: 229 },
    ash_sentinel: { name: 'Remparts de Basalte · N.48–54', left: 135, top: 194, right: 175, bottom: 235 },
    rift_guardian: { name: 'Cap du Gouffre · N.55–60', left: 188, top: 192, right: 235, bottom: 237 },
};

export const frontierSpecies = ['salt_hound', 'ash_sentinel', 'rift_guardian'];
export const wastelandZones = [zones.imp, zones.hound, zones.fiend, zones.breach_lord];
export const frontierZones = frontierSpecies.map((species) => zones[species]);
const volcanicZones = [...wastelandZones, ...frontierZones];

export const coastalLookouts = [
    { name: 'Cap des Saules · Belvédère marin', left: 20, top: 44, right: 38, bottom: 58, centerCell: [28, 55] },
    { name: 'Baie Émeraude · Belvédère Sud', left: 96, top: 93, right: 114, bottom: 122, centerCell: [104, 119] },
    { name: 'Baie de Saphyr · Belvédère Nord-Est', left: 158, top: 44, right: 176, bottom: 71, centerCell: [167, 47] },
    { name: 'Cap d’Obsidienne · Falaises Sud', left: 160, top: 158, right: 174, bottom: 168, centerCell: [167, 165] },
    { name: 'Cap du Gouffre · Belvédère des Brisants', left: 205, top: 233, right: 216, bottom: 240, centerCell: [211, 239] },
];

export function isCoastBorderTile(tile) {
    return tile === cliffTile || tile === seaTile;
}

export function inWasteland(x, y) {
    return volcanicZones.some((zone) => inZone(zone, x, y));
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
// Génération du terrain, chemins inter-zones et péninsule mer / falaises
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
    road(14, 15, 104, 17);
    road(22, 18, 24, 56);
    road(22, 54, 35, 56);
    road(102, 15, 104, 120);
    road(100, 118, 111, 120);
    road(103, 70, 168, 72);
    road(166, 46, 168, 96);
    road(162, 46, 174, 48);
    road(167, 94, 218, 96);
    road(216, 95, 218, 144);
    road(166, 142, 218, 144);
    road(166, 143, 168, 166);
    road(162, 164, 172, 166);
    // Chaussée d'obsidienne vers l'arène du Boss N.40
    road(104, 156, 167, 158);
    road(102, 155, 106, 160);
    const frontierRoads = [
        { left: 103, top: 160, right: 105, bottom: 216 },
        { left: 103, top: 214, right: 212, bottom: 216 },
        { left: 210, top: 214, right: 212, bottom: 239 },
    ];
    for (const { left, top, right, bottom } of frontierRoads) road(left, top, right, bottom);

    const protectedAreas = [
        ...Object.values(zones),
        ...coastalLookouts,
        ...frontierRoads,
        { left: 14, top: 15, right: 104, bottom: 17 },
        { left: 22, top: 18, right: 35, bottom: 56 },
        { left: 100, top: 15, right: 111, bottom: 120 },
        { left: 103, top: 70, right: 168, bottom: 72 },
        { left: 162, top: 46, right: 174, bottom: 96 },
        { left: 167, top: 94, right: 218, bottom: 96 },
        { left: 216, top: 95, right: 218, bottom: 144 },
        { left: 166, top: 142, right: 218, bottom: 144 },
        { left: 162, top: 143, right: 172, bottom: 166 },
        { left: 102, top: 155, right: 167, bottom: 160 },
    ];

    const isProtected = (x, y) => protectedAreas.some((box) => pointInBox(
        x, y, box, frontierZones.includes(box) ? 7 + waveNS(x) : 4,
    ));

    const isRawSea = (x, y) => {
        if (x === 0 || y === 0 || x >= columns - 1 || y >= rows - 1) {
            return true;
        }
        if (y >= 190) return true;

        // Littoral Nord et Baie de Saphyr
        if (x <= 58) {
            if (y < 1) {
                return true;
            }
        } else if (x <= 112) {
            if (y < Math.min(10, 7 + waveNS(x))) {
                return true;
            }
        } else if (x <= 152) {
            if (y < Math.min(34, 26 + waveNS(x))) {
                return true;
            }
        } else if (x <= 194) {
            if (y < Math.min(38, 33 + waveNS(x))) {
                return true;
            }
        } else if (y < Math.min(60, 52 + waveNS(x))) {
            return true;
        }

        // Littoral Ouest et Baie Émeraude du Sud-Ouest
        if (y >= 50 && x < 14 + waveEW(y)) {
            return true;
        }
        if (x <= 54 && y >= 65 + waveNS(x)) {
            return true;
        }
        if (x > 54 && x <= 84 && y >= 76 + waveNS(x)) {
            return true;
        }
        if (x > 84 && x <= 128 && y >= 129 + waveNS(x)) {
            return true;
        }
        if (x > 128 && x <= 140 && y >= 132 + (x - 128) * 3) {
            return true;
        }
        if (x > 140 && y >= 175 + waveNS(x)) {
            return true;
        }

        // Littoral Est (mer de Saphyr vers mer d'obsidienne)
        return x >= 243 + waveEW(y);
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
// Obstacles placés dans les zones agrandies et zones de transition
// ---------------------------------------------------------------------------

export const graves = [
    [84, 57], [89, 57], [94, 57], [99, 57],
    [84, 62], [90, 62], [95, 62], [100, 62],
    [108, 56], [113, 56], [120, 56], [124, 56],
    [107, 63], [113, 63], [119, 63], [125, 63],
    [84, 74], [91, 74], [96, 74], [100, 74],
    [85, 80], [92, 80], [97, 86], [85, 86],
    [107, 76], [113, 76], [120, 76], [125, 80],
    [107, 83], [112, 85], [120, 86], [125, 86],
];

export const cemeteryRuins = [
    [84, 54], [97, 54], [125, 54], [83, 69],
    [126, 67], [84, 89], [97, 89], [125, 89], [126, 78],
];

export const wastelandRuins = [
    [202, 78], [214, 78], [234, 79], [235, 92], [233, 108], [203, 111],
    [199, 120], [233, 121], [233, 138], [231, 154], [202, 155], [188, 128],
    [145, 128], [145, 148], [154, 160], [186, 160],
    // Monolithes en lisière Montagnes -> Terres dévastées
    [193, 84], [194, 104], [158, 119], [179, 120],
    // Piliers périphériques du Trône d'Obsidienne (Boss N.40)
    [86, 145], [127, 145], [85, 171], [127, 171], [104, 144], [100, 172],
    [83, 194], [114, 197], [83, 222], [115, 226],
    [139, 200], [149, 205], [168, 200], [144, 229], [172, 230],
    [192, 197], [216, 199], [230, 201], [195, 231], [227, 231],
];

export const rocks = [
    [148, 75], [154, 75], [161, 75], [172, 75], [179, 75], [185, 76],
    [148, 84], [157, 83], [174, 84], [185, 85],
    [148, 92], [160, 91], [175, 91], [185, 91],
    [148, 102], [156, 101], [173, 101], [184, 102],
    [149, 111], [156, 112], [165, 111], [175, 111], [184, 110],
    // Contreforts rocheux en lisière des Montagnes
    [136, 64], [140, 77], [138, 86], [141, 97], [155, 63], [177, 64],
];
