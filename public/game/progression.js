export const victoryXp = 50;
export const xpRequired = level => 100 + (level - 1) * 50;
const itemKeys = ['health', 'mana', 'rare', 'epic'];

export function loadProgress(key, startingLevel) {
    const initial = { level: startingLevel, xp: 0, items: { health: 2, mana: 2, rare: 0, epic: 0 }, weapon: 'starter' };
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && Number.isSafeInteger(saved.level) && saved.level >= startingLevel && saved.level <= 9999
            && Number.isSafeInteger(saved.xp) && saved.xp >= 0 && saved.xp < xpRequired(saved.level)
            && itemKeys.every(item => Number.isSafeInteger(saved.items?.[item]) && saved.items[item] >= 0)
            && (saved.weapon === null || saved.weapon === 'starter'
                || (['rare', 'epic'].includes(saved.weapon) && saved.items[saved.weapon] > 0))) return saved;
    } catch {
        // Keep the current session playable when browser storage is unavailable.
    }
    return initial;
}

export function saveProgress(key, progress) {
    try {
        localStorage.setItem(key, JSON.stringify(progress));
    } catch {
        // The active character still keeps progress until the page closes.
    }
}

export function rollLoot(table, random = Math.random) {
    let roll = random() * 100;
    return Object.entries(table).find(([, item]) => (roll -= item.chance) < 0)[0];
}

export function awardVictory(progress, loot, random = Math.random) {
    const item = rollLoot(loot, random);
    progress.items[item]++;
    progress.xp += victoryXp;
    const threshold = xpRequired(progress.level);
    const levelUp = progress.xp >= threshold && progress.level < 9999;
    if (levelUp) {
        progress.xp -= threshold;
        progress.level++;
    } else if (progress.level === 9999) {
        progress.xp = Math.min(progress.xp, threshold - 1);
    }
    return { item, levelUp };
}
