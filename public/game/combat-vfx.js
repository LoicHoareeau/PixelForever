export const vfxFrameSize = 128;
export const vfxFrames = 16;

const rows = [
    'firebolt', 'arcane', 'frostbolt', 'vortex', 'frost', 'arcane_burst',
    'seismic', 'flame', 'magma', 'fire_burst', 'slash', 'rune', 'rage_aura', 'rage_ignition',
    'mist', 'marsh_wisp', 'pollen', 'snow', 'ash', 'cinders',
    'steel_slash', 'gilded_spin', 'arcane_stream', 'ward',
    'rift_glints',
];
const classRows = [
    'axe_swing', 'dagger', 'arrow', 'arrow_hit', 'arrow_volley', 'trap', 'curse', 'summon',
    'shadow_bolt', 'chaos', 'imp_flare', 'bulwark', 'venom', 'drain',
];

const infernoPalette = [0x742027, 0xbf321e, 0xf76026, 0xffa745, 0xffe092, 0xfff3d8];
const infernoLayers = [1, .88, .73, .59, .47, .38];

export function drawInfernoBeam(layer, wave, x, y, from, to, length, rage, still) {
    const p = wave.impactProgress;
    const center = (to + from) / 2;
    const half = (to - from) * (rage ? .45 : .37);
    const extent = Math.round(length * Math.min(1, p * 5 + .05));
    const collapse = Math.max(0, (p - .64) / .36);
    const fracture = Math.max(0, (collapse - .29) / .71);
    const power = 1 - collapse ** 1.6;
    const crossSize = half * (1 - collapse * .90);
    const origin = wave.vertical ? y : x;
    const axis = distance => origin + (wave.reverse ? length - distance : distance);
    const rect = (start, end, offset, wide, color, alpha = 1) => {
        const low = Math.min(axis(start), axis(end));
        const span = end - start;
        layer.fillStyle(color, alpha);
        if (wave.vertical) layer.fillRect(Math.round(center + offset), low, wide, span);
        else layer.fillRect(low, Math.round(center + offset), span, wide);
    };
    const burst = (points, scale, color) => {
        layer.fillStyle(color, power).beginPath();
        for (const [index, [back, offset]] of points.entries()) {
            const along = axis(Math.max(0, Math.round(extent - back * scale)));
            const cross = Math.round(center + offset * crossSize);
            const method = index === 0 ? 'moveTo' : 'lineTo';
            layer[method](wave.vertical ? cross : along, wave.vertical ? along : cross);
        }
        layer.closePath().fillPath();
    };

    if (fracture > 0) {
        for (let i = 0; i < extent; i += 46) {
            const spread = (i % 7) / 6 * .62 + .35;
            const end = Math.min(extent, i + Math.max(2, Math.round(46 * (1 - fracture * spread))));
            const radius = Math.max(1, Math.round(crossSize * (.56 + spread * .40)));
            rect(i, end, -radius, radius * 2, 0xe94b27, power);
            rect(i, end, -Math.floor(radius / 2), radius, 0xffc577, power);
            rect(i, end, 0, 1, 0xfff3d8, power);
        }
    } else {
        for (const [index, ratio] of infernoLayers.entries()) {
            const radius = Math.max(1, Math.round(crossSize * ratio));
            rect(0, extent, -radius, radius * 2, infernoPalette[index], power);
        }
    }

    // Offset the hot streaks downstream, while the white core stays continuous.
    const flow = still ? 0 : Math.floor(p * 64);
    for (const side of [-1, 1]) {
        for (let i = (flow * 3 + (side === 1 ? 24 : 0)) % 62; fracture === 0 && i < extent - 5; i += 62) {
            const span = Math.min(extent - i, 17 + (i % 5) * 5);
            rect(i, i + span, side * crossSize * .61, 2, 0xffcf72, power * .85);
            rect(i, i + span * .44, side * crossSize * .88, 2, 0xff8541, power);
            if (crossSize > 12 && span >= 12) {
                const edge = side === 1 ? crossSize - 1 : -crossSize - 1;
                rect(i, i + span * .57, edge, 3, 0xc83822, power);
                rect(i + 5, i + span * .57, edge + side * 2, 2, 0x9e2823, power * .8);
            }
        }
    }

    const opening = axis(Math.min(extent / 2, 11));
    const ringWidth = Math.max(3, Math.round(crossSize * .68));
    const ringHeight = Math.max(2, Math.round(crossSize * 2.1));
    const [ringX, ringY] = wave.vertical ? [center, opening] : [opening, center];
    const [ringW, ringH] = wave.vertical ? [ringHeight, ringWidth] : [ringWidth, ringHeight];
    layer.lineStyle(5, 0xa62923, power).strokeEllipse(ringX, ringY, ringW, ringH, 12);
    layer.lineStyle(2, 0xffb34e, power).strokeEllipse(ringX, ringY, ringW, ringH, 12);
    layer.lineStyle(1, 0xffffd6, power).strokeEllipse(ringX, ringY, ringW - 2, ringH - 2, 12);

    const flare = Math.min(1, extent / 48) * (still ? .92 : .85 + Math.sin(p * 22) * .15);
    burst([[0, -.36], [2, -1.09], [9, -.76], [30, -1.02], [22, -.55], [46, -.84],
        [31, -.29], [43, .28], [19, .39], [36, .98], [13, .68], [4, 1.09], [0, .39]], flare, 0xff9b3c);
    burst([[0, 0], [4, -.81], [10, -.54], [27, -.66], [19, -.37], [34, -.48],
        [27, .24], [14, .32], [22, .63], [8, .53], [5, .83]], flare, 0xffefd2);
}

export function vfxFrame(kind, progress) {
    const worldRow = rows.indexOf(kind);
    return (worldRow === -1 ? classRows.indexOf(kind) : worldRow) * vfxFrames
        + Math.max(0, Math.min(vfxFrames - 1, Math.floor(progress * vfxFrames)));
}

export function createCombatVfx(scene, depth) {
    const pool = [];
    let used = 0;
    return {
        begin() {
            for (let index = 0; index < used; index++) pool[index].setVisible(false);
            used = 0;
        },
        play(kind, x, y, progress, scale = 1, angle = 0, alpha = 1, stretch = 1) {
            const view = scene.cameras.main.worldView;
            const margin = vfxFrameSize * scale * Math.max(1, stretch) / 2;
            if (x + margin < view.x || x - margin > view.right
                || y + margin < view.y || y - margin > view.bottom || used >= 80) return;
            const frame = vfxFrame(kind, progress);
            if (frame < 0) return;
            const texture = classRows.includes(kind) ? 'class-vfx' : 'combat-vfx';
            if (used === pool.length) pool.push(scene.add.image(x, y, texture).setDepth(depth));
            const sprite = pool[used++];
            if (sprite.texture.key !== texture) sprite.setTexture(texture, frame);
            else sprite.setFrame(frame);
            sprite.setVisible(true).setPosition(Math.round(x), Math.round(y))
                .setScale(scale * stretch, scale).setRotation(angle).setAlpha(Math.max(0, Math.min(1, alpha)));
        },
    };
}
