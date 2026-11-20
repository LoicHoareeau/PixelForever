import { inZone, tileSize, zones } from './exploration.js';

export const malakorPhases = ['Seigneur d’Obsidienne', 'La Brèche s’ouvre', 'Rage de la Brèche'];
export const malakorThresholds = [0.65, 0.25];
export const malakorFrameSize = 192;
export const malakorAtlasColumns = 20;
export const malakorActionFrames = 12;
export const malakorActions = ['obsidian_cleave', 'seismic_ring', 'magma_rift', 'transform'];
export const malakorTrialInterval = 12600;
export const malakorIgnitionMs = 1100;
export const malakorSurgeMs = 2550;
export const malakorFirstTrialDelay = 3800;
export const malakorWaveImpactMs = 600;
export const malakorEmberMs = 3600;

const arena = zones.breach_lord;
const lanePeriod = 136;
const safeWidth = 66;
const warningMs = 1320;

export function createMalakorTrial(phase, now) {
    const count = phase === 3 ? 5 : 4;
    const introMs = 350;
    return {
        start: now,
        beginsAt: now + introMs,
        endsAt: now + introMs + count * (warningMs + malakorWaveImpactMs),
        phase,
        count,
        lastImpact: -1,
    };
}

export function malakorRageProgress(start, now, duration) {
    const elapsed = now - start;
    return start == null || elapsed < 0 || elapsed >= duration ? null : elapsed / duration;
}

export function malakorWave(trial, now) {
    if (now < trial.beginsAt || now >= trial.endsAt) return null;
    const elapsed = now - trial.beginsAt;
    const index = Math.floor(elapsed / (warningMs + malakorWaveImpactMs));
    const progress = elapsed % (warningMs + malakorWaveImpactMs);
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
    return {
        index, vertical, danger, reverse: index % 4 >= 2, progress: Math.min(1, progress / warningMs),
        impact: progress >= warningMs, impactProgress: Math.max(0, (progress - warningMs) / malakorWaveImpactMs),
    };
}

export function isMalakorWaveHit(wave, player) {
    const position = wave.vertical ? player.x : player.y;
    return inZone(arena, player.x, player.y) && wave.danger.some(([from, to]) => position >= from && position < to);
}
