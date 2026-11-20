const framesPerPose = 4;

export function createMonsterSheets(scene, directions) {
    for (const species of ['boar', 'skeleton']) {
        const size = 48;
        const sheet = scene.textures.createCanvas(species + '-walk', size * framesPerPose, size * directions.length);
        const ctx = sheet.getContext();
        ctx.imageSmoothingEnabled = false;
        directions.forEach((direction, row) => {
            const source = scene.textures.get(species + '-' + direction).getSourceImage();
            const y = row * size;
            ctx.drawImage(source, 0, y);
            const pixels = ctx.getImageData(0, y, size, size).data;
            let bottom = size - 1;
            while (bottom > 5 && !pixels.subarray(bottom * size * 4, (bottom + 1) * size * 4)
                .some((alpha, index) => index % 4 === 3 && alpha > 128)) bottom--;
            const feet = bottom - (species === 'boar' ? 4 : 6);
            const reach = direction === 'north' || direction === 'south' ? 0 : direction.includes('west') ? -1 : 1;
            for (let frame = 1; frame < framesPerPose; frame++) {
                const x = frame * size;
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, size, size);
                ctx.clip();
                if (frame === 3) {
                    ctx.drawImage(source, x + reach * 2, y + 1, size, size - 2);
                } else {
                    const half = size / 2;
                    const stride = frame === 1 ? 1 : -1;
                    ctx.drawImage(source, 0, 0, size, feet, x, y - 1, size, feet);
                    for (const sign of [-1, 1]) {
                        const left = sign === -1 ? 0 : half;
                        ctx.drawImage(source, left, feet - 1, half, size - feet + 1,
                            x + left + reach * stride * sign, y + feet - 1 - Number(sign === stride) * 2,
                            half, size - feet + 1);
                    }
                }
                ctx.restore();
            }
            for (let frame = 0; frame < framesPerPose; frame++) {
                sheet.add(row * framesPerPose + frame, 0, frame * size, y, size, size);
            }
        });
        sheet.refresh();
    }

    const palettes = {
        imp: ['#201827', '#723550', '#d16b71', '#ffcc7b'],
        hound: ['#191521', '#4e344e', '#986174', '#fb8c5a'],
        fiend: ['#1b1420', '#65332d', '#ad543f', '#fff18a'],
    };
    for (const [species, colors] of Object.entries(palettes)) {
        const size = 36;
        const sheet = scene.textures.createCanvas(species + '-walk', size * framesPerPose, size);
        const ctx = sheet.getContext();
        for (let frame = 0; frame < framesPerPose; frame++) {
            ctx.save();
            ctx.translate(frame * size, 0);
            drawDemon(ctx, species, colors, frame);
            ctx.restore();
            sheet.add(frame, 0, frame * size, 0, size, size);
        }
        sheet.refresh();
    }
}

function drawDemon(ctx, species, [ink, skin, lit, eyes], frame) {
    const hound = species === 'hound';
    const guard = species === 'fiend';
    const bob = frame === 1 || frame === 2 ? -1 : 0;
    const lunge = frame === 3 ? 2 : 0;
    const torso = hound ? 17 : guard ? 10 : 13;
    const start = hound ? 7 : 12;
    const width = hound ? 19 : guard ? 14 : 11;
    const legs = hound ? [8, 13, 19, 23] : [start + 1, start + width - 4];
    const paint = (color, x, y, w, h) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    };
    legs.forEach((x, index) => {
        const step = frame === 1 || frame === 2 ? (frame + index) % 2 : 0;
        paint(ink, x - step, 23, 4, 7 - step * 2);
        paint(skin, x + 1 - step, 23, 2, 5 - step);
        paint(lit, x + 2 - step, 28 - step * 2, 2, 1);
    });
    ctx.translate(lunge, bob);
    paint(ink, start - 1, torso, width + 2, 26 - torso);
    paint(skin, start, torso + 1, width, 24 - torso);
    paint(lit, start + 1, torso + 2, width - 2, 3);
    const headX = hound ? 22 : (guard ? 17 : 15);
    const headY = hound ? 14 : (guard ? 8 : 11);
    for (const side of [0, 8]) {
        paint(ink, headX + side, headY - 5, 3, 8);
        paint(lit, headX + side, headY - 5, 2, 4);
    }
    paint(ink, headX - 1, headY, 13, 9);
    paint(skin, headX, headY + 1, 10, 6);
    paint(eyes, headX + 3, headY + 3, 2, 1);
    paint(eyes, headX + 8, headY + 3, 2, 1);
    if (hound) {
        paint(ink, 3, 16, 6, 2);
        paint(lit, 2, 14, 3, 2);
        paint(ink, headX + 6, headY + 6, 7, 4);
        paint(lit, headX + 10, headY + 7, 2, 1);
    } else {
        paint(ink, start - 3, torso + 4, 4, 9);
        paint(lit, start - 2, torso + 4, 2, 6);
        paint(ink, start + width - 1, torso + 5, 5, 8);
        paint(lit, start + width, torso + 6, 2, 5);
        if (guard) {
            paint(ink, 29, 11, 3, 17);
            paint(eyes, 30, 10, 1, 7);
            paint(lit, 27, 20, 7, 2);
            paint(eyes, 18, 20, 2, 2);
        }
    }
}
