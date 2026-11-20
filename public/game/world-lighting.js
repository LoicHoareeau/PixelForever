import { writeBiomeWeights } from './biome-gradient.js';

const ambientColors = [
    [255, 249, 229], // Clairière, lumière du jour
    [153, 182, 218], // Cimetière, brume bleu-gris
    [178, 199, 230], // Montagnes, lumière froide
    [209, 154, 137], // Terres dévastées, cendres chaudes
    [161, 193, 179], // Marais des Scories
    [156, 165, 202], // Remparts de Basalte
    [176, 133, 184], // Cap du Gouffre
];

const pixelStep = 4;
const viewportSnap = 64;
const padding = 96;
const updateInterval = 32;
const warm = 0xffac55;
const cool = 0x9fcbf5;
const radiatingSpells = new Set([
    'fireball_burst', 'fire_wall', 'fire_whirl', 'frost_nova', 'arcane_beam',
    'seismic_detonation', 'magma_detonation', 'shield_wave',
]);

export function writeAmbientColor(x, y, tileSize, out, weights) {
    writeBiomeWeights(x, y, tileSize, weights);
    for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let index = 0; index < ambientColors.length; index++) {
            value += weights[index] * ambientColors[index][channel];
        }
        out[channel] = Math.round(value);
    }
}

export function lightingViewport(view, width, height) {
    const left = Math.max(0, Math.floor((view.x - padding) / viewportSnap) * viewportSnap);
    const top = Math.max(0, Math.floor((view.y - padding) / viewportSnap) * viewportSnap);
    const right = Math.min(width, Math.ceil((view.x + view.width + padding) / viewportSnap) * viewportSnap);
    const bottom = Math.min(height, Math.ceil((view.y + view.height + padding) / viewportSnap) * viewportSnap);
    return { left, top, right, bottom };
}

function visibleInLightmap(light, view) {
    return light.x + light.radius >= view.left && light.x - light.radius <= view.right
        && light.y + light.radius >= view.top && light.y - light.radius <= view.bottom;
}

export function combatLights(player, combat, now, still) {
    const lights = [{ x: player.x, y: player.y - 10, radius: 67, color: cool, lift: .43, glow: .10 }];
    const cast = combat?.pending;
    if (cast?.ranged && cast.interruptible && now < cast.end) {
        const origin = { x: player.x, y: player.y - 13 };
        const launch = cast.start + cast.castMs;
        if (cast.target?.sprite && now >= launch && cast.end > launch) {
            const progress = (now - launch) / (cast.end - launch);
            origin.x = cast.x + (cast.target.sprite.x - cast.x) * progress;
            origin.y = cast.y + (cast.target.sprite.y - 12 - cast.y) * progress;
        }
        lights.push({ ...origin, radius: 76, color: cast.color ?? warm, lift: .40, glow: .23 });
    }
    const effects = (combat?.spellEffects ?? []).filter((effect) => radiatingSpells.has(effect.kind)
        && now >= effect.start && now < effect.start + effect.duration).slice(-3);
    for (const effect of effects) {
        const lifetime = still ? .65 : (1 - (now - effect.start) / effect.duration) ** 2;
        lights.push({
            x: effect.targetX ?? effect.x, y: effect.targetY ?? effect.y,
            radius: Math.min(118, Math.max(48, (effect.radius ?? 45) + 18)),
            color: effect.color ?? warm, lift: .48 * lifetime, glow: .28 * lifetime,
        });
    }
    const boss = combat?.monsters?.find((monster) => monster.isBoss && monster.isAlive && monster.phase === 3);
    if (boss) {
        lights.push({ x: boss.sprite.x, y: boss.sprite.y - 22, radius: 122, color: 0xff632f, lift: .61, glow: .33 });
    }
    return lights;
}

export function createWorldLighting(scene, width, height, tileSize, staticLights) {
    const colors = document.createElement('canvas');
    colors.width = Math.ceil(width / tileSize);
    colors.height = Math.ceil(height / tileSize);
    const base = colors.getContext('2d');
    const renderer = scene.game.renderer;
    let multiply = true;
    if (renderer.type === Phaser.CANVAS) {
        base.globalCompositeOperation = 'multiply';
        multiply = base.globalCompositeOperation === 'multiply';
        base.globalCompositeOperation = 'source-over';
        // Phaser can build its Canvas blend table before its image-based probe returns.
        if (multiply) renderer.blendModes[Phaser.BlendModes.MULTIPLY] = 'multiply';
    }
    const pixels = base.createImageData(colors.width, colors.height);
    const weights = new Float32Array(ambientColors.length);
    const color = new Uint8Array(3);
    for (let y = 0; y < colors.height; y++) {
        for (let x = 0; x < colors.width; x++) {
            writeAmbientColor((x + .5) * tileSize, (y + .5) * tileSize, tileSize, color, weights);
            const offset = (y * colors.width + x) * 4;
            if (multiply) {
                pixels.data.set(color, offset);
                pixels.data[offset + 3] = 255;
            } else {
                for (let channel = 0; channel < 3; channel++) pixels.data[offset + channel] = color[channel] * .16;
                pixels.data[offset + 3] = 255 - (color[0] + color[1] + color[2]) / 3;
            }
        }
    }
    base.putImageData(pixels, 0, 0);

    const makeLayer = (key, blend, depth) => {
        const texture = scene.textures.createCanvas(key, 1, 1);
        const image = scene.add.image(0, 0, key).setOrigin(0).setScale(pixelStep).setBlendMode(blend).setDepth(depth);
        return { texture, image };
    };
    const shade = makeLayer('biome-lightmap', multiply ? Phaser.BlendModes.MULTIPLY : Phaser.BlendModes.NORMAL, height);
    const glow = makeLayer('world-light-glow', Phaser.BlendModes.ADD, height + .5);
    glow.image.setAlpha(.36);

    let nextUpdate = 0;
    return {
        update(now, still) {
            if (now < nextUpdate) return;
            const camera = scene.cameras.main;
            const view = lightingViewport(camera.worldView, width, height);
            const w = (view.right - view.left) / pixelStep;
            const h = (view.bottom - view.top) / pixelStep;
            if (w <= 0 || h <= 0) return;
            nextUpdate = now + updateInterval;

            for (const { texture, image } of [shade, glow]) {
                if (texture.width !== w || texture.height !== h) {
                    texture.setSize(w, h);
                    image.setSizeToFrame();
                }
                image.setPosition(view.left, view.top);
            }
            const shadow = shade.texture.getContext();
            const additive = glow.texture.getContext();
            if (!multiply) {
                shadow.globalCompositeOperation = 'source-over';
                shadow.clearRect(0, 0, w, h);
            }
            shadow.drawImage(colors, view.left / tileSize, view.top / tileSize,
                (view.right - view.left) / tileSize, (view.bottom - view.top) / tileSize, 0, 0, w, h);
            if (!multiply) shadow.globalCompositeOperation = 'destination-out';
            additive.clearRect(0, 0, w, h);

            const lights = [...staticLights, ...combatLights(scene.position, scene.combat, now, still)];
            for (const light of lights) {
                if (!visibleInLightmap(light, view)) continue;
                const x = (light.x - view.left) / pixelStep;
                const y = (light.y - view.top) / pixelStep;
                const radius = light.radius / pixelStep;
                const flicker = light.flicker && !still ? .94 + .06 * Math.cos(now / 190 + light.x) : 1;
                const tint = `${light.color >> 16},${(light.color >> 8) & 255},${light.color & 255}`;
                const cutout = shadow.createRadialGradient(x, y, 0, x, y, radius);
                cutout.addColorStop(0, `rgba(255,255,255,${light.lift * flicker})`);
                cutout.addColorStop(.45, `rgba(255,255,255,${light.lift * .44 * flicker})`);
                cutout.addColorStop(1, 'rgba(255,255,255,0)');
                shadow.fillStyle = cutout;
                shadow.fillRect(x - radius, y - radius, radius * 2, radius * 2);

                const glowGradient = additive.createRadialGradient(x, y, 0, x, y, radius);
                glowGradient.addColorStop(0, `rgba(${tint},${light.glow * flicker})`);
                glowGradient.addColorStop(.34, `rgba(${tint},${light.glow * .48 * flicker})`);
                glowGradient.addColorStop(1, `rgba(${tint},0)`);
                additive.fillStyle = glowGradient;
                additive.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            }
            shade.texture.refresh();
            glow.texture.refresh();
        },
        destroy() {
            shade.image.destroy();
            glow.image.destroy();
            scene.textures.remove(shade.texture.key);
            scene.textures.remove(glow.texture.key);
        },
    };
}
