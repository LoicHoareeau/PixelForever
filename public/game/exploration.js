export const tileSize = 16;
export const columns = 168;
export const rows = 120;
export const cliffTile = 35;
export const questNpc = { x: 224, y: 190, range: 48 };

export const zones = {
    boar: { name: 'Clairière · N.1–5', left: 2, top: 2, right: 29, bottom: 23 },
    skeleton: { name: 'Cimetière · N.5–10', left: 73, top: 53, right: 93, bottom: 71 },
    dragon: { name: 'Montagnes · N.10–20', left: 121, top: 82, right: 145, bottom: 101 },
    imp: { name: 'Terres dévastées · Brèche (N.21–25)', left: 146, top: 85, right: 163, bottom: 100 },
    hound: { name: 'Terres dévastées · Plaine calcinée (N.25–30)', left: 145, top: 101, right: 163, bottom: 115 },
    fiend: { name: 'Terres dévastées · Citadelle (N.30–35)', left: 121, top: 102, right: 144, bottom: 115 },
};

export function inWasteland(x, y) {
    return inZone(zones.imp, x, y) || inZone(zones.hound, x, y) || inZone(zones.fiend, x, y);
}

export function inZone(zone, x, y) {
    return x >= zone.left * tileSize && x < (zone.right + 1) * tileSize
        && y >= zone.top * tileSize && y < (zone.bottom + 1) * tileSize;
}

export function cameraZoom(viewWidth, viewHeight) {
    return Math.max(1,
        Math.ceil(viewWidth / (columns * tileSize)), Math.ceil(viewHeight / (rows * tileSize)));
}

export function buildTerrain(clearing) {
    const terrain = Array.from({ length: rows }, () => Array(columns).fill(33));
    clearing.forEach((row, y) => row.forEach((tile, x) => { terrain[y][x] = tile; }));
    const road = (left, top, right, bottom) => {
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) terrain[y][x] = 32;
        }
    };
    road(14, 15, 84, 17);
    road(82, 15, 84, 62);
    road(83, 61, 134, 63);
    road(132, 62, 134, 94);
    road(134, 93, 154, 95);
    road(152, 94, 154, 109);
    road(132, 107, 153, 109);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            const side = 4;
            const cap = 4;
            if (x < side || y < cap || x >= columns - side || y >= rows - cap) terrain[y][x] = cliffTile;
        }
    }
    return terrain;
}

export function groundWalkable(terrain, x, y) {
    return [x - 3, x, x + 3].every(foot => {
        const tile = terrain[Math.floor(y / tileSize)]?.[Math.floor(foot / tileSize)];
        return tile !== undefined && tile >= 16 && tile !== 34 && tile !== cliffTile;
    });
}

export const graves = [
    [76, 56], [79, 56], [87, 56], [90, 56],
    [76, 60], [79, 60], [87, 60], [90, 60],
    [76, 66], [79, 66], [87, 66], [90, 66],
    [76, 69], [79, 69], [87, 69], [90, 69],
];

export const cemeteryRuins = [[75, 55], [81, 55], [91, 55], [75, 70], [90, 70]];
export const wastelandRuins = [[148, 87], [160, 91], [149, 97], [160, 103], [148, 110], [157, 113],
    [143, 105], [124, 105], [127, 111], [141, 113]];

export const rocks = [
    [122, 83], [125, 83], [128, 83], [139, 83], [143, 84],
    [123, 88], [127, 89], [140, 88], [144, 91],
    [122, 95], [126, 98], [129, 100], [138, 99], [143, 98],
];
