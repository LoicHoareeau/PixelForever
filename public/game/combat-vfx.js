export const vfxFrameSize = 128;
export const vfxFrames = 16;

const rows = [
    'firebolt', 'arcane', 'frostbolt', 'vortex', 'frost', 'arcane_burst',
    'seismic', 'flame', 'magma', 'fire_burst', 'slash', 'rune', 'rage_aura', 'rage_ignition',
    'mist', 'marsh_wisp', 'pollen', 'snow', 'ash', 'cinders',
    'steel_slash', 'gilded_spin', 'arcane_stream', 'ward',
];

export function vfxFrame(kind, progress) {
    return rows.indexOf(kind) * vfxFrames
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
            if (used === pool.length) pool.push(scene.add.image(x, y, 'combat-vfx').setDepth(depth));
            const frame = vfxFrame(kind, progress);
            pool[used++].setVisible(true).setPosition(Math.round(x), Math.round(y)).setFrame(frame)
                .setScale(scale * stretch, scale).setRotation(angle).setAlpha(Math.max(0, Math.min(1, alpha)));
        },
    };
}
