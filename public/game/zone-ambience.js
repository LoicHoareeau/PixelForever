import { writeBiomeWeights } from './biome-gradient.js';
import { createCombatVfx } from './combat-vfx.js';
import { isCoastBorderTile } from './exploration.js';

const spacing = 112;
const profiles = [
    { kind: 'pollen', density: .34, alpha: .57, scale: 1.0, drift: 17, cycle: 4000 },
    { kind: 'mist', density: .83, alpha: .76, scale: 1.07, drift: 21, cycle: 4600 },
    { kind: 'snow', density: .61, alpha: .66, scale: .97, drift: 26, cycle: 2900 },
    { kind: 'cinders', density: .72, alpha: .68, scale: .91, drift: 16, cycle: 3200 },
    { kind: 'marsh_wisp', density: .84, alpha: .69, scale: 1.03, drift: 16, cycle: 4050 },
    { kind: 'ash', density: .70, alpha: .61, scale: .93, drift: 28, cycle: 3350 },
    { kind: 'cinders', density: .88, alpha: .78, scale: 1.02, drift: 22, cycle: 2750 },
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
        nextFrame = now + 72;
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
                sprites.play(profile.kind, x + profile.drift * sweep, y + rise * 5, t,
                    profile.scale * (.82 + phase * .28), 0, profile.alpha * opacity);
            }
        }
    };
}
