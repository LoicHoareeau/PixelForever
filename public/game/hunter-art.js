import { hunterTextures, hunterPoses } from './hunter-frames.js';

export function loadHunterArt(scene) {
    for (const [key, art] of Object.entries(hunterTextures)) scene.load.image(key, 'hunter-v2/' + art.file);
}

export function createHunterArt(scene) {
    for (const [key, art] of Object.entries(hunterTextures)) {
        const texture = scene.textures.get(key);
        for (const [name, rect] of Object.entries(art.frames)) texture.add(name, 0, ...rect);
    }
    scene.hunterArtReady = true;
}

export function hunterPose(facing, walking, distance, attackFrame = -1) {
    const art = hunterPoses[facing];
    if (!art) return null;
    // Combat has nine timing slots; the last two share the drawn return-to-ready pose.
    const name = walking ? 'walk-' + Math.floor(Math.max(0, distance) / 7) % 8
        : attackFrame >= 0 ? 'shot-' + Math.min(7, attackFrame) : 'shot-0';
    return { ...art.frames[name], scale: 40 / art.height };
}

export function applyHunterArt(scene, sprite, skin, facing, walking, distance, attackFrame = -1, weaponStyle = 'bow', emitEffects = true) {
    if (skin !== 'hunter' || weaponStyle !== 'bow') { sprite.setScale(1); return; }
    const pose = hunterPose(facing, walking, distance, attackFrame);
    if (!pose) return;
    if (sprite.texture?.key !== pose.texture || sprite.frame?.name !== pose.frame) sprite.setTexture(pose.texture, pose.frame);
    sprite.setOrigin(pose.origin, 1).setScale(pose.scale).setFlipX(false);
    if (!emitEffects || scene.motionPreference?.matches) return;
    if (walking) scene.combat?.vfx?.play('hunter-dust', sprite.x, sprite.y - 1,
        (distance / 7 % 4) / 4, .15, 0, .6);
    if (attackFrame === 4 || attackFrame === 5) {
        const releaseFacing = scene.combat?.attackVisual?.facing ?? facing;
        const index = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'].indexOf(releaseFacing);
        const angle = index * Math.PI / 4;
        scene.combat?.vfx?.play('hunter-release', sprite.x + Math.cos(angle) * 12,
            sprite.y - 24 + Math.sin(angle) * 7, (attackFrame - 4) / 4, .17, angle, .85);
    }
}
