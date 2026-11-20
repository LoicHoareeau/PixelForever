import { cliffTile, inWasteland, inZone, rocks, seaTile, zones } from './exploration.js';
import { addCoastalProps, animateCoast, drawCoastalFloor } from './coast-art.js';
import { addCemeteryMist, addRegionalScenery, createScorchedCliff, drawRegionalGround } from './regional-art.js';

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
        const tx = Math.floor(x / 16);
        const ty = Math.floor(y / 16);
        const tile = terrain[ty]?.[tx];
        return tile !== cliffTile
            && tile !== seaTile
            && !nearCoastOrCliff(terrain, tx, ty)
            && !inWasteland(x, y)
            && !inZone(zones.skeleton, x, y)
            && !inLookoutCorridor(tx, ty)
            && !(x > 96 && x < 192 && y > 80 && y < 180);
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
    return (tx >= 19 && tx <= 33 && ty >= 40 && ty <= 50)
        || (tx >= 90 && tx <= 103 && ty >= 82 && ty <= 107)
        || (tx >= 145 && tx <= 159 && ty >= 43 && ty <= 54);
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
    const groundCell = ground.width / 2;
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
        const mountain = inZone(zones.dragon, x * tileSize, y * tileSize);
        const column = mountain || tile === 32 ? 1 : 0;
        const rowIndex = mountain ? 1 : 0;
        context.drawImage(ground,
            column * groundCell + (x % 16) * groundCell / 16,
            rowIndex * groundCell + (y % 16) * groundCell / 16,
            groundCell / 16, groundCell / 16, x * tileSize, y * tileSize, tileSize, tileSize);
        if (tile < 32) {
            maskContext.clearRect(0, 0, tileSize, tileSize);
            drawFrame(maskContext, scene.textures.getFrame('chemin-herbe', tile % 16), 0, 0);
            const mask = maskContext.getImageData(0, 0, tileSize, tileSize);
            for (let i = 0; i < mask.data.length; i += 4) {
                mask.data[i + 3] = mask.data[i] > mask.data[i + 1] * 1.1 ? 255 : 0;
            }
            maskContext.putImageData(mask, 0, 0);
            patchContext.clearRect(0, 0, tileSize, tileSize);
            patchContext.globalCompositeOperation = 'source-over';
            patchContext.drawImage(ground, groundCell + (x % 16) * groundCell / 16,
                (y % 16) * groundCell / 16, groundCell / 16, groundCell / 16, 0, 0, tileSize, tileSize);
            patchContext.globalCompositeOperation = 'destination-in';
            patchContext.drawImage(pathMask, 0, 0);
            context.drawImage(pathPatch, x * tileSize, y * tileSize);
        }
        // Feather path borders with irregular grass clumps, preserving the existing road layout.
        if (tile === 32) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (terrain[y + dy]?.[x + dx] !== 33) continue;
            for (let i = 0; i < tileSize; i += 3) {
                const length = 1 + (x * 13 + y * 7 + i) % 4;
                context.fillStyle = i % 2 ? '#60712e' : '#7c8a3d';
                context.fillRect(x * tileSize + (dx ? (dx > 0 ? tileSize - length : 0) : i),
                    y * tileSize + (dy ? (dy > 0 ? tileSize - length : 0) : i), dx ? length : 2, dy ? length : 2);
            }
        }
    }));

    const ripples = [];
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const seed = (x * 47 + y * 61 + x * y * 13) % 97;
        const px = x * tileSize + 2 + seed % 8;
        const py = y * tileSize + 2 + seed % 11;
        if (tile === 34 && seed < 31) ripples.push([px, py, seed]);
        if (tile !== 33) return;
        const atWater = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
            .some(([column, row]) => terrain[row]?.[column] < 16);
        if (atWater && seed < 76) {
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
        if (seed > 45) return;
        context.fillStyle = '#44634d';
        context.fillRect(px - 1, py + 1, 5, 1);
        context.fillStyle = seed < 11 ? '#d4ab61' : '#7c9251';
        context.fillRect(px, py, 1, 1);
        context.fillRect(px + 2, py - 1, 1, 2);
        context.fillRect(px + 3, py, 1, 1);
    }));
    const cinders = drawRegionalGround(scene, context, terrain, tileSize);
    const { surfPoints, glints, seaDistance } = drawCoastalFloor(scene, context, terrain, tileSize);
    floor.refresh();
    scene.add.image(0, 0, floor.key).setOrigin(0);

    const atlas = scene.textures.get('environment-detailed').getSourceImage();
    const cell = atlas.width / 2;
    function sceneryTexture(key, column, row, size) {
        const texture = scene.textures.createCanvas(key, size, size);
        const ctx = texture.getContext();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(atlas, column * cell, row * cell, cell, cell, 0, 0, size, size);
        texture.refresh();
    }
    sceneryTexture('willow-0', 0, 0, 64);
    sceneryTexture('willow-1', 0, 0, 60);
    sceneryTexture('mountain-rock', 1, 0, 80);
    sceneryTexture('ranger-cabin', 0, 1, 96);
    sceneryTexture('coastal-cliff', 1, 1, 64);
    createScorchedCliff(scene);
    addCoastalProps(scene, terrain, tileSize, seaDistance);
    const lantern = scene.textures.createCanvas('lantern', 16, 14);
    drawLantern(lantern.getContext());
    lantern.refresh();
    const lamps = [[160, 177], [271, 163], [286, 224], [148, 231], [306, 231]];
    const shadows = scene.add.graphics().setDepth(1).fillStyle(0x182d29, .34);
    shadows.fillRect(114, 155, 53, 6);
    scene.add.image(140, 160, 'ranger-cabin').setOrigin(.5, 1).setDepth(160);
    scene.obstacles.push(new Phaser.Geom.Rectangle(112, 130, 56, 26));
    treePositions(terrain).forEach(([x, y], index) => {
        shadows.fillRect(x - 7, y - 3, 16, 5);
        scene.add.image(x, y, 'willow-' + index % 2).setOrigin(.5, 1).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 2, y - 4, 4, 5));
    });
    lamps.forEach(([x, y]) => {
        shadows.fillRect(x - 5, y - 2, 7, 3);
        scene.add.image(x, y, lantern.key).setOrigin(.3125, 1).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 1, y - 3, 3, 4));
    });

    rocks.forEach(([column, row]) => {
        const x = (column + .5) * tileSize;
        const y = (row + .5) * tileSize;
        shadows.fillRect(x - 20, y - 3, 40, 6);
        scene.add.image(x, y, 'mountain-rock').setOrigin(.5, 1).setDepth(y);
        scene.obstacles.push(new Phaser.Geom.Rectangle(x - 20, y - 7, 40, 8));
    });
    addRegionalScenery(scene, shadows, tileSize);
    const mist = addCemeteryMist(scene, tileSize);
    for (const [text, column, row] of [
        ['Belvédère marin ↓', 25, 21],
        ['Cimetière →', 34, 13],
        ['Cimetière des Saules · N.5–10', 84, 44],
        ['Baie Émeraude ↓', 97, 83],
        ['Baie de Saphyr ↑', 153, 55],
        ['Montagnes ↓', 142, 63],
        ['Hauts de Saphyr · N.10–20', 135, 68],
        ['Terres dévastées →', 165, 84],
        ['Brèche des cendres · N.21–25', 176, 73],
        ['Plaine calcinée · N.25–30', 173, 107],
        ['Citadelle de la Brèche · N.30–35', 136, 110],
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
    let previousFrame = -1;
    return (time, still) => {
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
            ambience.fillStyle(0xe9984c, .11 + glow * .016).fillRect(x - 7, y - 5, 16, 8);
            ambience.fillStyle(0xffc979, .1).fillRect(x - 4, y - 4, 11, 6);
        });
        mist.forEach((patch, index) => patch.setAlpha(.55 + .25 * Math.sin((frame + index * 3) / 7)));
        for (const [x, y, seed] of cinders) {
            const rise = (frame + seed) % 9;
            ambience.fillStyle(0xf59462, .64 - rise * .06).fillRect(x + Math.floor(rise / 3), y - rise, 1, 1);
        }
        animateCoast(ambience, frame, surfPoints, glints);
    };
}
