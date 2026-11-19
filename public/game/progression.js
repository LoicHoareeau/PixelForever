// Barèmes d'expérience, de caractéristiques, de sorts et de régénération

export const victoryXp = 50;

export const xpRequired = (level) => {
    return 100 + (level - 1) * 50;
};

export const statKeys = ['strength', 'intelligence', 'vitality', 'spirit'];

export const spellKeys = ['basic', 'special'];

export const initialStatPoints = 2;

export const initialSpellPoints = 1;

export const statPointsPerLevel = 3;

export const spellPointsPerLevel = 1;

export const basicSpellRankBonus = 3;

export const specialSpellRankBonus = 5;

const itemKeys = ['health', 'mana', 'rare', 'epic'];

const defaultClassProfiles = {
    warrior: {
        baseStats: {
            strength: 8,
            intelligence: 4,
            vitality: 8,
            spirit: 5,
        },
        growthStats: {
            strength: 2,
            intelligence: 1,
            vitality: 2,
            spirit: 1,
        },
    },
    mage: {
        baseStats: {
            strength: 4,
            intelligence: 8,
            vitality: 5,
            spirit: 8,
        },
        growthStats: {
            strength: 1,
            intelligence: 2,
            vitality: 1,
            spirit: 2,
        },
    },
};

/**
 * Crée l'état initial complet d'un personnage pour le niveau de départ donné.
 */
export function createInitialProgress(startingLevel = 1) {
    return {
        level: startingLevel,
        xp: 0,
        items: {
            health: 2,
            mana: 2,
            rare: 0,
            epic: 0,
        },
        weapon: 'starter',
        statPoints: initialStatPoints,
        spellPoints: initialSpellPoints,
        allocatedStats: {
            strength: 0,
            intelligence: 0,
            vitality: 0,
            spirit: 0,
        },
        spells: {
            basic: 1,
            special: 1,
        },
    };
}

/**
 * Normalise une sauvegarde existante pour y intégrer les champs de stats et sorts.
 */
function normalizeProgress(saved, startingLevel) {
    const fallback = createInitialProgress(startingLevel);
    const levelsGained = Math.max(0, saved.level - startingLevel);

    const allocatedStats = {};
    for (const key of statKeys) {
        const value = saved.allocatedStats?.[key];
        allocatedStats[key] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    const spells = {};
    for (const key of spellKeys) {
        const value = saved.spells?.[key];
        spells[key] = Number.isSafeInteger(value) && value >= 1 ? value : 1;
    }

    const statPoints = Number.isSafeInteger(saved.statPoints) && saved.statPoints >= 0
        ? saved.statPoints
        : initialStatPoints + levelsGained * statPointsPerLevel;

    const spellPoints = Number.isSafeInteger(saved.spellPoints) && saved.spellPoints >= 0
        ? saved.spellPoints
        : initialSpellPoints + levelsGained * spellPointsPerLevel;

    return {
        ...fallback,
        ...saved,
        statPoints,
        spellPoints,
        allocatedStats,
        spells,
    };
}

/**
 * Charge et valide la progression sauvegardée d'un personnage dans le navigateur.
 */
export function loadProgress(key, startingLevel) {
    const initial = createInitialProgress(startingLevel);

    try {
        const saved = JSON.parse(localStorage.getItem(key));
        const hasValidBase = saved
            && Number.isSafeInteger(saved.level)
            && saved.level >= startingLevel
            && saved.level <= 9999
            && Number.isSafeInteger(saved.xp)
            && saved.xp >= 0
            && saved.xp < xpRequired(saved.level)
            && itemKeys.every((item) => {
                return Number.isSafeInteger(saved.items?.[item]) && saved.items[item] >= 0;
            })
            && (
                saved.weapon === null
                || saved.weapon === 'starter'
                || (['rare', 'epic'].includes(saved.weapon) && saved.items[saved.weapon] > 0)
            );

        if (hasValidBase) {
            return normalizeProgress(saved, startingLevel);
        }
    } catch {
        // Conserve la partie jouable si le stockage du navigateur est indisponible.
    }

    return initial;
}

/**
 * Enregistre la progression du personnage dans localStorage.
 */
export function saveProgress(key, progress) {
    try {
        localStorage.setItem(key, JSON.stringify(progress));
    } catch {
        // Le personnage actif garde sa progression en mémoire jusqu'à la fermeture.
    }
}

/**
 * Effectue un tirage aléatoire dans la table de butin fournie.
 */
export function rollLoot(table, random = Math.random) {
    let roll = random() * 100;

    return Object.entries(table).find(([, item]) => {
        roll -= item.chance;
        return roll < 0;
    })[0];
}

/**
 * Attribue le butin, l'expérience et les points de montée de niveau après une victoire.
 */
export function awardVictory(progress, loot, random = Math.random) {
    const item = rollLoot(loot, random);
    progress.items[item]++;
    progress.xp += victoryXp;

    const threshold = xpRequired(progress.level);
    const levelUp = progress.xp >= threshold && progress.level < 9999;

    if (levelUp) {
        progress.xp -= threshold;
        progress.level++;
        const currentStatPoints = Number.isSafeInteger(progress.statPoints) ? progress.statPoints : 0;
        const currentSpellPoints = Number.isSafeInteger(progress.spellPoints) ? progress.spellPoints : 0;
        progress.statPoints = currentStatPoints + statPointsPerLevel;
        progress.spellPoints = currentSpellPoints + spellPointsPerLevel;
    } else if (progress.level === 9999) {
        progress.xp = Math.min(progress.xp, threshold - 1);
    }

    return {
        item,
        levelUp,
    };
}

/**
 * Investit un point de caractéristique disponible dans la statistique choisie.
 */
export function allocateStat(progress, stat) {
    if (!statKeys.includes(stat)) {
        return false;
    }

    if (!Number.isSafeInteger(progress.statPoints) || progress.statPoints <= 0) {
        return false;
    }

    if (!progress.allocatedStats) {
        progress.allocatedStats = {
            strength: 0,
            intelligence: 0,
            vitality: 0,
            spirit: 0,
        };
    }

    progress.statPoints -= 1;
    progress.allocatedStats[stat] = (progress.allocatedStats[stat] ?? 0) + 1;

    return true;
}

/**
 * Dépense un point de sort pour augmenter le rang de l'attaque ou du sort choisi.
 */
export function upgradeSpell(progress, spell) {
    if (!spellKeys.includes(spell)) {
        return false;
    }

    if (!Number.isSafeInteger(progress.spellPoints) || progress.spellPoints <= 0) {
        return false;
    }

    if (!progress.spells) {
        progress.spells = {
            basic: 1,
            special: 1,
        };
    }

    progress.spellPoints -= 1;
    progress.spells[spell] = (progress.spells[spell] ?? 1) + 1;

    return true;
}

/**
 * Calcule les caractéristiques totales, les maximums de ressources, la régénération
 * et les dégâts finaux à partir du niveau, des points investis, des sorts et de l'arme.
 */
export function computeCharacterStats(rules, progress, weaponBonus = 0) {
    const classKey = rules.classKey ?? (rules.ranged ? 'mage' : 'warrior');
    const fallbackProfile = defaultClassProfiles[classKey] ?? defaultClassProfiles.warrior;
    const baseStats = rules.baseStats ?? fallbackProfile.baseStats;
    const growthStats = rules.growthStats ?? fallbackProfile.growthStats;

    const startingLevel = rules.level ?? 1;
    const level = progress.level ?? startingLevel;
    const levelsGained = Math.max(0, level - startingLevel);

    const attributes = {};
    for (const key of statKeys) {
        const base = baseStats[key] ?? 5;
        const natural = levelsGained * (growthStats[key] ?? 1);
        const allocated = progress.allocatedStats?.[key] ?? 0;
        const bonus = natural + allocated;

        attributes[key] = {
            base,
            natural,
            allocated,
            bonus,
            total: base + bonus,
        };
    }

    const primaryBonus = rules.ranged
        ? attributes.intelligence.bonus
        : attributes.strength.bonus;

    const secondaryBonus = rules.ranged
        ? attributes.strength.bonus
        : attributes.intelligence.bonus;

    const maxHealth = rules.health + levelsGained * 4 + attributes.vitality.bonus * 4;
    const maxMana = rules.mana + levelsGained * 2 + attributes.spirit.bonus * 3;

    const basicSpellRank = progress.spells?.basic ?? 1;
    const specialSpellRank = progress.spells?.special ?? 1;
    const basicRankStep = rules.basicSpellRankBonus ?? basicSpellRankBonus;
    const specialRankStep = rules.specialSpellRankBonus ?? specialSpellRankBonus;
    const basicRankBonus = (basicSpellRank - 1) * basicRankStep;
    const specialRankBonus = (specialSpellRank - 1) * specialRankStep;

    const basicDamage = rules.basicDamage
        + levelsGained
        + primaryBonus * 2
        + secondaryBonus
        + basicRankBonus
        + weaponBonus;

    const specialDamage = rules.specialDamage
        + levelsGained * 2
        + primaryBonus * 2
        + secondaryBonus
        + specialRankBonus;

    const baseRegen = rules.baseManaRegen ?? 2;
    const rawRegen = baseRegen
        + levelsGained * 0.3
        + attributes.spirit.bonus * 0.4
        + attributes.intelligence.bonus * 0.2;
    const manaRegenPerSec = Math.round(rawRegen * 10) / 10;

    return {
        level,
        levelsGained,
        attributes,
        maxHealth,
        maxMana,
        basicSpellRank,
        specialSpellRank,
        basicRankBonus,
        specialRankBonus,
        basicDamage,
        specialDamage,
        manaRegenPerSec,
        statPoints: progress.statPoints ?? 0,
        spellPoints: progress.spellPoints ?? 0,
    };
}

/**
 * Calcule la régénération automatique de mana ou d'énergie sur un intervalle donné.
 */
export function regenerateResource(current, max, regenPerSec, deltaMs, carry = 0) {
    if (current >= max || deltaMs <= 0 || regenPerSec <= 0) {
        return {
            value: Math.min(current, max),
            gained: 0,
            carry: 0,
        };
    }

    const nextCarry = carry + (deltaMs / 1000) * regenPerSec;
    if (nextCarry < 1) {
        return {
            value: current,
            gained: 0,
            carry: nextCarry,
        };
    }

    const whole = Math.floor(nextCarry);
    const nextValue = Math.min(max, current + whole);
    const gained = nextValue - current;
    const remainingCarry = nextValue >= max ? 0 : nextCarry - whole;

    return {
        value: nextValue,
        gained,
        carry: remainingCarry,
    };
}
