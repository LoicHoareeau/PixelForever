import { mageTextures, magePoses } from './mage-frames.js';

export function loadMageArt(scene) {
    for(const [key,art] of Object.entries(mageTextures))scene.load.image(key,'mage-v2/'+art.file);
}

export function createMageArt(scene) {
    for(const [key,art] of Object.entries(mageTextures)){
        const texture=scene.textures.get(key);
        for(const [name,rect] of Object.entries(art.frames))texture.add(name,0,...rect);
    }
    scene.mageArtReady=true;
}

export function magePose(facing,walking,distance,attackFrame=-1,staff=false,ranged=true) {
    const art=magePoses[facing];if(!art)return null;
    const prefix=walking?(staff?'staff-walk-':'walk-'):staff?(ranged?'staff-cast-':'staff-strike-'):'cast-';
    const count=art.count??8;
    const step=walking?Math.floor(Math.max(0,distance)/(56/count))%count:Math.max(0,Math.min(count-1,attackFrame));
    const pose=art.frames[prefix+step];
    return {...pose,scale:pose.scale??40/art.height};
}

export function mageAttackFrame(attack,now) {
    if(!attack)return -1;
    const strike=attack.ranged?attack.start+attack.castMs:attack.end;
    if(now>=strike+210)return -1;
    return now<strike?Math.max(0,Math.min(7,Math.floor(8*(now-attack.start)/Math.max(1,strike-attack.start))))
        :8+Math.min(7,Math.floor(8*(now-strike)/210));
}

export function applyMageArt(sprite,facing,walking,distance,attackFrame=-1,staff=false,ranged=true) {
    const pose=magePose(facing,walking,distance,attackFrame,staff,ranged);if(!pose)return;
    if(sprite.texture?.key!==pose.texture||sprite.frame?.name!==pose.frame)sprite.setTexture(pose.texture,pose.frame);
    sprite.setOrigin(pose.origin,1).setScale(pose.scale).setFlipX(false);
}

export function mageEffect(combat,kind) {
    if(combat.classKey!=='mage'||!combat.scene.mageArtReady)return kind;
    return {firebolt:'mage-firebolt',fire_burst:'mage-firebolt',flame:'mage-fire-wall',vortex:'mage-fire-whirl',
        arcane:'mage-arcane',arcane_stream:'mage-arcane',arcane_burst:'mage-arcane',frost:'mage-frost-nova'}[kind]??kind;
}
