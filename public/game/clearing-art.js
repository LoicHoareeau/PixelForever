import { cliffTile, graves, inZone, rocks, zones } from './exploration.js';

const frameSize = 48;
const canopy = [
    '..........44444..........',
    '.......4443333444........',
    '.....44333333333444......',
    '....43333222333333344....',
    '...4333222222333323344...',
    '..443322222233222233344..',
    '..433222111222222233334..',
    '.44322211111222223333344.',
    '.43322111222222233333334.',
    '4432222222222233333333344',
    '4332222222333333333333334',
    '4333222333333333333333444',
    '443333333333333333334444.',
    '.444333333333333444444...',
    '...4444433334444444......',
    '......4444444444.........',
];
const treeColors = { 1: '#789453', 2: '#4c7549', 3: '#335a47', 4: '#223c37' };

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

function toneGround(context, width, height) {
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (b > r * 1.2 && g > r * 1.2) {
            pixels[i] = r * .62;
            pixels[i + 1] = g * .72;
            pixels[i + 2] = b * .81;
        } else if (g > r - 24) {
            pixels[i] = r * .32 + 30;
            pixels[i + 1] = g * .48 + 31;
            pixels[i + 2] = b * .45 + 35;
        } else {
            pixels[i] = r * .72 + 10;
            pixels[i + 1] = g * .7 + 9;
            pixels[i + 2] = b * .72 + 10;
        }
    }
    context.putImageData(image, 0, 0);
}

function drawTree(context, variant) {
    context.fillStyle = '#263b32';
    context.fillRect(16, 20, 7, 21);
    context.fillRect(14, 39, 11, 2);
    context.fillStyle = '#76573c';
    context.fillRect(17, 24, 4, 16);
    context.fillStyle = '#a77a50';
    context.fillRect(17, 30, 1, 8);
    const branches = variant ? [[2, 14], [13, 16], [7, 3]] : [[13, 13], [0, 17], [5, 3]];
    for (const [left, top] of branches) {
        canopy.forEach((row, y) => [...row].forEach((shade, x) => {
            if (shade === '.') return;
            context.fillStyle = variant && shade === '2' ? '#597747' : treeColors[shade];
            context.fillRect(left + (variant ? 24 - x : x), top + y, 1, 1);
        }));
    }
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

function drawCabin(context) {
    // Timber front, windows and a stepped slate roof on the native pixel grid.
    context.fillStyle = '#283534';
    context.fillRect(5, 23, 48, 23);
    context.fillStyle = '#815c43';
    context.fillRect(7, 25, 44, 18);
    context.fillStyle = '#a27350';
    for (let y = 27; y < 43; y += 4) context.fillRect(9, y, 40, 1);
    context.fillStyle = '#523d33';
    context.fillRect(8, 25, 2, 19);
    context.fillRect(48, 25, 2, 19);
    context.fillRect(23, 29, 12, 16);
    context.fillRect(11, 30, 9, 8);
    context.fillRect(38, 30, 9, 8);
    context.fillStyle = '#ca9355';
    context.fillRect(25, 31, 8, 13);
    context.fillStyle = '#e6b36d';
    context.fillRect(13, 32, 5, 4);
    context.fillRect(40, 32, 5, 4);
    context.fillStyle = '#634a3a';
    context.fillRect(15, 32, 1, 4);
    context.fillRect(42, 32, 1, 4);
    context.fillRect(31, 38, 1, 1);

    for (let row = 0; row < 7; row++) {
        const x = 15 - row * 2;
        const y = 4 + row * 3;
        context.fillStyle = '#263843';
        context.fillRect(x, y, 58 - x * 2, 3);
        context.fillStyle = row % 2 ? '#466171' : '#506b78';
        context.fillRect(x + 2, y, 54 - x * 2, 2);
        context.fillStyle = '#324955';
        for (let seam = x + 5 + row % 2 * 3; seam < 56 - x; seam += 7) {
            context.fillRect(seam, y + 1, 1, 2);
        }
    }
    context.fillStyle = '#253439';
    context.fillRect(0, 25, 58, 2);
    context.fillStyle = '#766554';
    context.fillRect(39, 6, 6, 8);
    context.fillStyle = '#9d8370';
    context.fillRect(38, 5, 8, 2);
    context.fillStyle = '#a48c67';
    context.fillRect(23, 45, 12, 2);
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

function drawRock(context) {
    context.fillStyle = '#29323b';
    for (let y = 0; y < 40; y += 4) {
        const inset = Math.max(0, 18 - y / 2);
        context.fillRect(inset, y, 48 - inset * 2, 4);
    }
    context.fillStyle = '#69737b';
    for (let y = 4; y < 36; y += 4) {
        const inset = Math.max(3, 20 - y / 2);
        context.fillRect(inset, y, 25 - inset, 4);
    }
    context.fillStyle = '#454e5d';
    context.fillRect(26, 20, 11, 12);
    context.fillRect(32, 28, 12, 8);
    context.fillStyle = '#bdc9c3';
    context.fillRect(18, 4, 10, 4);
    context.fillRect(16, 8, 7, 4);
    context.fillRect(23, 8, 8, 2);
    context.fillStyle = '#202a32';
    context.fillRect(4, 37, 40, 3);
}

export function treePositions(terrain) {
    const positions = [...trees];
    for (let row = 3; row < terrain.length - 2; row += 4) {
        for (let column = 3; column < terrain[0].length - 2; column += 4) {
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
    return positions.filter(([x, y]) => terrain[Math.floor(y / 16)]?.[Math.floor(x / 16)] !== cliffTile);
}

export function buildClearing(scene, terrain, tileSize, width, height, baseTiles) {
    const floor = scene.textures.createCanvas('clearing-floor', width, height);
    const context = floor.getContext();
    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const key = tile === cliffTile ? 'herbe' : tile < 16 ? 'eau-herbe' : tile < 32 ? 'chemin-herbe' : baseTiles[tile - 32];
        const frame = scene.textures.getFrame(key, tile < 32 ? tile % 16 : undefined);
        drawFrame(context, frame, x * tileSize, y * tileSize);
    }));
    toneGround(context, width, height);

    terrain.forEach((row, y) => row.forEach((tile, x) => {
        const px = x * tileSize;
        const py = y * tileSize;
        if (inZone(zones.dragon, px, py)) {
            context.fillStyle = tile === 32 ? '#7b7971' : '#505f61';
            context.globalAlpha = .82;
            context.fillRect(px, py, tileSize, tileSize);
            context.globalAlpha = 1;
            context.fillStyle = '#89918a';
            context.fillRect(px + (x * 7 + y) % 11, py + (x + y * 3) % 13, 3, 1);
        } else if (inZone(zones.skeleton, px, py) && tile === 33) {
            context.fillStyle = '#444947';
            context.globalAlpha = .55;
            context.fillRect(px, py, tileSize, tileSize);
            context.globalAlpha = 1;
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
        const px = x * tileSize;
        const py = y * tileSize;
        const seam = (x * 7 + y * 3) % 11 + 2;
        context.fillStyle = '#343c43';
        context.fillRect(px, py, tileSize, tileSize);
        context.fillStyle = '#535c62';
        context.fillRect(px + seam - 2, py, 4, tileSize);
        context.fillStyle = '#424c55';
        context.fillRect(px + 1, py + seam, 8, 4);
        context.fillStyle = '#222c34';
        context.fillRect(px + seam + 2, py + 2, 2, 9);
        context.fillRect(px + 1, py + seam + 3, 6, 2);
        context.fillStyle = '#778078';
        context.fillRect(px + seam - 2, py + 3, 1, 6);
        context.fillStyle = '#4e6549';
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const neighbor = terrain[y + dy]?.[x + dx];
            if (neighbor === undefined || neighbor === cliffTile) continue;
            if (dy) context.fillRect(px, py + (dy > 0 ? tileSize - 3 : 0), tileSize, 3);
            else context.fillRect(px + (dx > 0 ? tileSize - 3 : 0), py, 3, tileSize);
        }
        if (terrain[y + 1]?.[x] !== undefined && terrain[y + 1][x] !== cliffTile) {
            context.fillStyle = '#172421';
            context.globalAlpha = .35;
            context.fillRect(px, py + tileSize, tileSize, 5);
            context.globalAlpha = 1;
        }
    }));
    floor.refresh();
    scene.add.image(0, 0, floor.key).setOrigin(0);

    for (let variant = 0; variant < 2; variant++) {
        const tree = scene.textures.createCanvas('willow-' + variant, 39, 41);
        drawTree(tree.getContext(), variant);
        tree.refresh();
    }
    const lantern = scene.textures.createCanvas('lantern', 16, 14);
    drawLantern(lantern.getContext());
    lantern.refresh();
    const lamps = [[160, 177], [271, 163], [286, 224], [148, 231], [306, 231]];
    const shadows = scene.add.graphics().setDepth(1).fillStyle(0x182d29, .34);
    const cabin = scene.textures.createCanvas('ranger-cabin', 58, 47);
    drawCabin(cabin.getContext());
    cabin.refresh();
    shadows.fillRect(114, 43, 53, 6);
    scene.add.image(140, 48, cabin.key).setOrigin(.5, 1).setDepth(48);
    scene.obstacles.push(new Phaser.Geom.Rectangle(116, 31, 48, 16));
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
        ['mountain-rock', rocks, 48, 40, drawRock, 40],
    ]) {
        const texture = scene.textures.createCanvas(key, textureWidth, textureHeight);
        draw(texture.getContext());
        texture.refresh();
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
