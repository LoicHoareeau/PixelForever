import { spellIconPosition } from './spell-icons.js';
import { skillCost } from './balance.js';

export function spellState(combat, key, now, talent = null) {
    const cost = key === 'basic' || key.startsWith('potion-') ? 0
        : skillCost(talent?.manaCost ?? combat.rules.specialManaCost, combat.stats.maxMana, combat.stats.manaCostReduction);
    const cooldown = key.startsWith('potion-') ? { end: combat.potionReadyAt ?? 0 }
        : combat.spellCooldowns.get(key);
    const remaining = Math.max(0, (cooldown?.end ?? 0) - now,
        ['basic', 'special'].includes(key) ? combat.readyAt - now || 0 : 0);
    const blocked = Boolean(combat.taming || combat.pending?.kind === 'classCast' || ['basic', 'special'].includes(key) && combat.pending);
    return { cost, remaining, blocked, noResource: combat.mana < cost, unavailable: blocked || combat.health <= 0 || remaining > 0 || combat.mana < cost };
}

export function cooldownLabel(milliseconds) {
    if (milliseconds <= 0) return '';
    return milliseconds >= 10000 ? Math.ceil(milliseconds / 1000) + 's' : (Math.ceil(milliseconds / 100) / 10).toFixed(1) + 's';
}

export function setSpellIcon(element, key) {
    const position = spellIconPosition(key);
    if (!element || position === null) return;
    element.classList.add('spell-art');
    if (element.dataset.spellIcon === key) return;
    element.dataset.spellIcon = key;
    element.style.backgroundImage = `url("${new URL('./spell-icons-atlas.png', import.meta.url).href}")`;
    element.style.backgroundPosition = position;
}
