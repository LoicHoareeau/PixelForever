export const tileSize = 16;
export const columns = 84;
export const rows = 60;

export const zones = {
    boar: { name: 'Clairière · N.1–5', left: 2, top: 2, right: 29, bottom: 23 },
    skeleton: { name: 'Cimetière · N.5–10', left: 33, top: 23, right: 53, bottom: 41 },
    dragon: { name: 'Montagnes · N.10–20', left: 57, top: 38, right: 81, bottom: 57 },
};

export function inZone(zone, x, y) {
    return x >= zone.left * tileSize && x < (zone.right + 1) * tileSize
        && y >= zone.top * tileSize && y < (zone.bottom + 1) * tileSize;
}

export function cameraZoom(viewWidth, viewHeight) {
    return Math.max(viewWidth < 640 ? 1 : 2,
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
    road(14, 15, 44, 17);
    road(42, 15, 44, 32);
    road(43, 31, 70, 33);
    road(68, 32, 70, 50);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1) terrain[y][x] = 34;
        }
    }
    return terrain;
}

export function groundWalkable(terrain, x, y) {
    return [x - 3, x, x + 3].every(foot => {
        const tile = terrain[Math.floor(y / tileSize)]?.[Math.floor(foot / tileSize)];
        return tile !== undefined && tile >= 16 && tile !== 34;
    });
}

export const graves = [
    [36, 26], [39, 26], [47, 26], [50, 26],
    [36, 30], [39, 30], [47, 30], [50, 30],
    [36, 36], [39, 36], [47, 36], [50, 36],
    [36, 39], [39, 39], [47, 39], [50, 39],
];

export const rocks = [
    [58, 39], [61, 39], [64, 39], [75, 39], [79, 40],
    [59, 44], [63, 45], [76, 44], [80, 47],
    [58, 51], [62, 54], [65, 56], [74, 55], [79, 54],
];
