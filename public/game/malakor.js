import { inZone, tileSize, zones } from './exploration.js';

export const malakorPhases = ['Seigneur d’Obsidienne', 'La Brèche s’ouvre', 'Rage de la Brèche'];
export const malakorThresholds = [0.65, 0.25];
export const malakorFrameSize = 192;
export const malakorAtlasColumns = 20;
export const malakorActionFrames = 12;
export const malakorActions = ['obsidian_cleave', 'seismic_ring', 'magma_rift', 'transform'];
export const malakorTrialInterval = 12600;

const arena = zones.breach_lord;
const lanePeriod = 136;
const safeWidth = 66;
const warningMs = 1320;
const impactMs = 360;

export function createMalakorTrial(phase, now, transform = false) {
    const count = phase === 3 ? 5 : 4;
    const introMs = transform ? 1100 : 350;
    return {
        start: now,
        transform,
        beginsAt: now + introMs,
        endsAt: now + introMs + count * (warningMs + impactMs),
        phase,
        count,
        lastImpact: -1,
    };
}

export function malakorWave(trial, now) {
    if (now < trial.beginsAt || now >= trial.endsAt) return null;
    const elapsed = now - trial.beginsAt;
    const index = Math.floor(elapsed / (warningMs + impactMs));
    const progress = elapsed % (warningMs + impactMs);
    const vertical = trial.phase === 2 || index % 2 === 0;
    const start = (vertical ? arena.left : arena.top) * tileSize;
    const end = ((vertical ? arena.right : arena.bottom) + 1) * tileSize;
    const offset = (index * 53 + trial.phase * 9) % lanePeriod;
    const danger = [];
    for (let x = start + offset - lanePeriod; x < end; x += lanePeriod) {
        const from = Math.max(x + safeWidth, start);
        const to = Math.min(x + lanePeriod, end);
        if (to > from) danger.push([from, to]);
    }
    return { index, vertical, danger, progress: Math.min(1, progress / warningMs), impact: progress >= warningMs };
}

export function isMalakorWaveHit(wave, player) {
    const position = wave.vertical ? player.x : player.y;
    return inZone(arena, player.x, player.y) && wave.danger.some(([from, to]) => position >= from && position < to);
}
