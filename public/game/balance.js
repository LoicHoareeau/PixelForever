// Un barème continu évite les sauts de difficulté entre deux espèces.
export const xpVersion = 2;
export const killXp = (level) => 50 + 10 * level;
export const xpRequired = (level) => killXp(level) * (level < 10 ? 4 : level < 30 ? 5 : 6);

export function migrateXp(progress) {
    if (!progress || progress.xpVersion === xpVersion) return progress;
    const oldThreshold = 100 + (progress.level - 1) * 50;
    if (Number.isSafeInteger(progress.level) && progress.level >= 1 && progress.level <= 9999
        && Number.isSafeInteger(progress.xp) && progress.xp >= 0 && progress.xp < oldThreshold) {
        return { ...progress, xp: Math.floor(progress.xp / oldThreshold * xpRequired(progress.level)), xpVersion };
    }
    return null;
}

export function ordinaryStats(level) {
    return { maxHealth: 650 + 360 * (level - 1), damage: Math.round(2 + .28 * (level - 1)),
        attackIntervalMs: 1800, windupMs: 400, xp: killXp(level) };
}

export function levelDamageFactor(playerLevel, targetLevel) {
    const gap = Math.max(0, targetLevel - playerLevel);
    if (!gap) return 1;
    const duration = [1, 1.4, 2.2, 3.2][gap] ?? 3.2 * 1.6 ** (gap - 3);
    return Math.min(1, ordinaryStats(targetLevel).maxHealth / ordinaryStats(playerLevel).maxHealth / duration);
}

export const skillCost = (base, maximum, reduction = 0) => Math.max(1, Math.round(Math.max(base, Math.ceil(maximum * .28)) * (1 - reduction)));
export const potionRestore = (base, maximum) => Math.max(base, Math.round(maximum * .3));
export const potionCooldownMs = 15000;

export const victoryReward = (playerLevel, monsterLevel) => Math.round(killXp(Math.min(playerLevel, monsterLevel)) * Math.max(0, Math.min(1.3, 1 + (monsterLevel - playerLevel) * .1)));
