import { cliffTile, graves, inZone, rocks, zones } from './exploration.js';

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

function drawGrave(context) {
    context.fillStyle = '#252a30';
    context.fillRect(2, 5, 14, 16);
    context.fillRect(5, 2, 8, 3);
    context.fillStyle = '#777e7c';
    context.fillRect(4, 6, 10, 13);
    context.fillRect(6, 4, 6, 3);
    context.fillStyle = '#a2a69a';
    context.fillRect(5, 6, 1, 11);
    context.fillRect(7, 5, 5, 1);
    context.fillStyle = '#454c51';
    context.fillRect(8, 8, 2, 8);
    context.fillRect(6, 10, 6, 2);
    context.fillStyle = '#53644d';
    context.fillRect(1, 20, 16, 3);
    context.fillRect(3, 18, 3, 3);
}

export function treePositions(terrain) {
    const positions = [...trees];
    for (let row = 3; row < terrain.length - 2; row += 6) {
        for (let column = 3; column < terrain[0].length - 2; column += 6) {
            if (row < 20 && column < 28) continue;
            const seed = (column * 37 + row * 53 + column * row * 7) % 101;
            if (seed % 5 === 0) continue;
            const x = column * 16 + seed % 25 - 12;
            const y = row * 16 + (seed * 7) % 25 - 12;
            if (terrain[Math.floor(y / 16)]?.[Math.floor(x / 16)] !== 33 || inZone(zones.skeleton, x, y)
                || inZone(zones.dragon, x, y)) continue;
            if (terrain[row].slice(column - 1, column + 2).some(tile => tile !== 33)) continue;
            positions.push([x, y]);
        }
    }
    return positions.filter(([x, y]) => terrain[Math.floor(y / 16)]?.[Math.floor(x / 16)] !== cliffTile
        && !(x > 96 && x < 192 && y > 80 && y < 180));
}

export function buildClearing(scene, terrain, tileSize, width, height, baseTiles) {
    const floor = scene.textures.createCanvas('clearing-floor', width, height);
    const context = floor.getContext();
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const key = tile === cliffTile ? 'herbe' : tile < 16 ? 'eau-herbe' : tile < 32 ? 'chemin-herbe' : baseTiles[tile - 32];
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
        if (tile < 16 || tile === 34 || tile === cliffTile) return;
        const mountain = inZone(zones.dragon, x * tileSize, y * tileSize);
        const cemetery = inZone(zones.skeleton, x * tileSize, y * tileSize);
        const column = mountain || tile === 32 ? 1 : 0;
        const rowIndex = mountain || (cemetery && tile !== 32) ? 1 : 0;
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
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        if (tile !== cliffTile) return;
        context.fillStyle = '#22676d';
        context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }));
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
    // The coastal rocks stay inside the impassable rim and do not cover walkable ground.
    for (let x = 32; x < width - 32; x += 56) {
        scene.add.image(x, height, 'coastal-cliff').setOrigin(.5, 1).setDisplaySize(64, 64).setDepth(1);
        scene.add.image(x, 0, 'coastal-cliff').setOrigin(.5, 0).setFlipY(true).setDepth(1);
    }
    for (let y = 32; y < height - 32; y += 56) {
        scene.add.image(32, y, 'coastal-cliff').setRotation(Math.PI / 2).setDepth(1);
        scene.add.image(width - 32, y, 'coastal-cliff').setRotation(-Math.PI / 2).setDepth(1);
    }
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

    for (const [key, positions, textureWidth, textureHeight, draw, collisionWidth] of [
        ['grave', graves, 18, 24, drawGrave, 14],
        ['mountain-rock', rocks, 80, 80, null, 40],
    ]) {
        if (draw) {
            const texture = scene.textures.createCanvas(key, textureWidth, textureHeight);
            draw(texture.getContext());
            texture.refresh();
        }
        positions.forEach(([column, row]) => {
            const x = (column + .5) * tileSize;
            const y = (row + .5) * tileSize;
            shadows.fillRect(x - collisionWidth / 2, y - 3, collisionWidth, 6);
            scene.add.image(x, y, key).setOrigin(.5, 1).setDepth(y);
            scene.obstacles.push(new Phaser.Geom.Rectangle(x - collisionWidth / 2, y - 7, collisionWidth, 8));
        });
    }

    for (const [text, column, row] of [
        ['Cimetière →', 30, 13],
        ['Cimetière des Saules · N.5–10', 75, 54],
        ['Montagnes ↓', 129, 79],
        ['Hauts de Saphyr · N.10–20', 124, 82],
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
    };
}
