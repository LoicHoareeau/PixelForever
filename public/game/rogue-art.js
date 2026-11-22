import { rogueTextures, roguePoses } from './rogue-frames.js';

export function loadRogueArt(scene) {
    for (const [key, art] of Object.entries(rogueTextures)) scene.load.image(key, 'rogue-v2/' + art.file);
}

export function createRogueArt(scene) {
    for (const [key, art] of Object.entries(rogueTextures)) {
        const texture = scene.textures.get(key);
        for (const [name, rect] of Object.entries(art.frames)) texture.add(name, 0, ...rect);
    }
    scene.rogueArtReady = true;
}

export function roguePose(facing, walking, distance, attackFrame = -1) {
    const art = roguePoses[facing];
    if (!art) return null;
    const name = walking ? 'walk-' + Math.floor(Math.max(0, distance) / 7) % 8
        : attackFrame >= 0 ? 'strike-' + Math.min(7, attackFrame) : 'strike-0';
    return { ...art.frames[name], scale: 40 / art.height };
}

export function applyRogueArt(sprite, facing, walking, distance, attackFrame = -1, weaponStyle = 'daggers') {
    if (weaponStyle !== 'daggers') { sprite.setScale(1); return; }
    const pose = roguePose(facing, walking, distance, attackFrame);
    if (!pose) return;
    if (sprite.texture?.key !== pose.texture || sprite.frame?.name !== pose.frame) sprite.setTexture(pose.texture, pose.frame);
    sprite.setOrigin(pose.origin, 1).setScale(pose.scale).setFlipX(false);
}
