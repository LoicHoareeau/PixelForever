import { writeBiomeWeights } from './biome-gradient.js';
import { createCombatVfx } from './combat-vfx.js';
import { isCoastBorderTile } from './exploration.js';

const spacing = 112;
const profiles = [
    { kind: 'pollen', density: .42, alpha: .63, scale: 1, drift: 13, lift: 8, cycle: 5300 },
    { kind: 'mist', density: .84, alpha: .86, scale: 1.19, drift: 28, lift: 2, cycle: 6100 },
    { kind: 'snow', density: .69, alpha: .81, scale: 1.12, drift: 37, lift: 13, cycle: 2850 },
    { kind: 'cinders', density: .73, alpha: .76, scale: .97, drift: 11, lift: 15, cycle: 2700 },
    { kind: 'marsh_wisp', density: .83, alpha: .86, scale: 1.12, drift: 10, lift: 5, cycle: 4660 },
    { kind: 'ash', density: .72, alpha: .72, scale: 1.04, drift: 32, lift: 3, cycle: 3520 },
    { kind: 'rift_glints', density: .87, alpha: .82, scale: 1.12, drift: 8, lift: 18, cycle: 3240 },
];

function hash(x, y, seed) {
    let n = Math.imul(x + seed, 0x45d9f3b) ^ Math.imul(y - seed, 0x119de1f3);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

function buildSources(terrain, tileSize) {
    const width = terrain[0].length * tileSize;
    const height = terrain.length * tileSize;
    const columns = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    const weights = new Float32Array(profiles.length);
    return Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
        const x = (column + .2 + hash(column, row, 7) * .6) * spacing;
        const y = (row + .2 + hash(column, row, 23) * .6) * spacing;
        const tile = terrain[Math.floor(y / tileSize)]?.[Math.floor(x / tileSize)];
        if (tile === undefined || isCoastBorderTile(tile)) return null;

        writeBiomeWeights(x, y, tileSize, weights);
        let chance = hash(column, row, 41);
        for (let index = 0; index < profiles.length; index++) {
            const profile = profiles[index];
            chance -= weights[index] * profile.density;
            if (chance < 0) {
                const phase = hash(column, row, 53);
                return { x, y, phase, profile, opacity: .54 + weights[index] * .46 };
            }
        }
        return null;
    }));
}

export function createZoneAmbience(scene, tileSize) {
    const sources = buildSources(scene.terrain, tileSize);
    const sprites = createCombatVfx(scene, 4);
    let nextFrame = 0;
    return (now, still) => {
        if (now < nextFrame) return;
        nextFrame = now + 48;
        const view = scene.cameras.main.worldView;
        const left = Math.max(0, Math.floor((view.x - spacing) / spacing));
        const right = Math.min(sources[0].length - 1, Math.floor((view.right + spacing) / spacing));
        const top = Math.max(0, Math.floor((view.y - spacing) / spacing));
        const bottom = Math.min(sources.length - 1, Math.floor((view.bottom + spacing) / spacing));
        sprites.begin();
        for (let row = top; row <= bottom; row++) {
            for (let column = left; column <= right; column++) {
                const source = sources[row][column];
                if (!source) continue;
                const { x, y, phase, profile, opacity } = source;
                const t = still ? phase : (now / profile.cycle + phase) % 1;
                const sweep = Math.sin(t * Math.PI * 2);
                const rise = Math.cos(t * Math.PI * 2);
                sprites.play(profile.kind, x + profile.drift * sweep, y + rise * profile.lift, t,
                    profile.scale * (.82 + phase * .28), 0, profile.alpha * opacity);
                // Seconde particule déphasée pour enrichir la profondeur atmosphérique
                const t2 = still ? (phase + .42) % 1 : (now / (profile.cycle * 1.25) + phase + .42) % 1;
                sprites.play(profile.kind, x - profile.drift * .65 * Math.cos(t2 * Math.PI * 2),
                    y + Math.sin(t2 * Math.PI * 2) * profile.lift * .85 - 10,
                    t2, profile.scale * .68, 0, profile.alpha * opacity * .55);
            }
        }
    };
}
