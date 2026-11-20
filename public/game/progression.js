import { armorBonuses, armorItems, armorSlots } from './armor.js';
// Barèmes d'expérience, de caractéristiques, de sorts et de régénération
import { normalizeTrailQuest } from './trail-quest.js';

export const victoryXp = 50;

export const xpRequired = (level) => {
    return 100 + (level - 1) * 50;
};

export const statKeys = ['strength', 'intelligence', 'vitality', 'spirit'];

export const spellKeys = ['basic', 'special'];

export const initialStatPoints = 0;

export const initialSpellPoints = 0;

let progressSync = null;

export function setProgressSync(sync) {
    progressSync = sync;
}

export const statPointsPerLevel = 3;

export const spellPointsPerLevel = 1;

export const basicSpellRankBonus = 3;

export const specialSpellRankBonus = 5;

/**
 * Définition des arbres de talents (3 branches par classe, inspirés des RPG classiques).
 * Chaque talent appartient à une branche, un palier (tier 0..2) et peut débloquer un sort actif.
 */
export const talentTrees = {
    warrior: {
        branches: [
            {
                id: 'arms',
                name: 'Armes',
                subtitle: 'Maîtrise & Frappes',
                accent: '#e47a58',
                talents: [
                    {
                        id: 'w_sharp_blade',
                        name: 'Lame affûtée',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-sword',
                        description: '+2 dégâts sur l’attaque de base par rang.',
                    },
                    {
                        id: 'w_chain_strike',
                        name: 'Enchaînement',
                        tier: 0,
                        col: 1,
                        maxRank: 3,
                        type: 'passive',
                        icon: 'icon-charge',
                        description: 'Réduit le temps de recharge global de 8 % par rang.',
                    },
                    {
                        id: 'w_cleave',
                        name: 'Taillade',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'w_sharp_blade',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'cleave',
                        icon: 'icon-cleave',
                        manaCost: 6,
                        cooldownMs: 4200,
                        description: 'Sort actif : frappe tous les ennemis proches en arc de cercle.',
                    },
                    {
                        id: 'w_sword_mastery',
                        name: 'Maîtrise de l’épée',
                        tier: 2,
                        col: 0,
                        maxRank: 3,
                        requires: 'w_cleave',
                        minBranchPoints: 4,
                        type: 'passive',
                        icon: 'icon-sword',
                        description: '+4 dégâts sur toutes les compétences de mêlée par rang.',
                    },
                ],
            },
            {
                id: 'fury',
                name: 'Fureur',
                subtitle: 'Rage & Assaut',
                accent: '#f0a64b',
                talents: [
                    {
                        id: 'w_bloodlust',
                        name: 'Soif de combat',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-fury',
                        description: '+0,5/s de régénération d’énergie par rang.',
                    },
                    {
                        id: 'w_engage',
                        name: 'Engagement',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'w_bloodlust',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'engage',
                        icon: 'icon-charge',
                        manaCost: 5,
                        cooldownMs: 5000,
                        description: 'Sort actif : fonce sur la cible à distance et inflige de lourds dégâts.',
                    },
                    {
                        id: 'w_frenzy',
                        name: 'Frénésie',
                        tier: 1,
                        col: 1,
                        maxRank: 3,
                        minBranchPoints: 2,
                        type: 'passive',
                        icon: 'icon-fury',
                        description: '+8 % de dégâts bonus sur les sorts spéciaux par rang.',
                    },
                    {
                        id: 'w_berserk',
                        name: 'Berserk',
                        tier: 2,
                        col: 0,
                        maxRank: 1,
                        requires: 'w_engage',
                        minBranchPoints: 4,
                        type: 'active',
                        slot: 'berserk',
                        icon: 'icon-berserk',
                        manaCost: 8,
                        cooldownMs: 12000,
                        description: 'Sort actif : augmente vos dégâts de 40 % pendant 6 secondes.',
                    },
                ],
            },
            {
                id: 'protection',
                name: 'Protection',
                subtitle: 'Bouclier & Survie',
                accent: '#6fb3e8',
                talents: [
                    {
                        id: 'w_iron_skin',
                        name: 'Peau de fer',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-shield',
                        description: '+8 PV maximum par rang.',
                    },
                    {
                        id: 'w_shield_bash',
                        name: 'Coup de bouclier',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'w_iron_skin',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'shield_bash',
                        icon: 'icon-shield',
                        manaCost: 5,
                        cooldownMs: 6500,
                        description: 'Sort actif : frappe et étourdit la cible pendant 2 secondes, interrompant son attaque.',
                    },
                    {
                        id: 'w_defensive_stance',
                        name: 'Posture défensive',
                        tier: 2,
                        col: 0,
                        maxRank: 3,
                        requires: 'w_shield_bash',
                        minBranchPoints: 4,
                        type: 'passive',
                        icon: 'icon-shield',
                        description: 'Réduit les dégâts subis de 8 % par rang.',
                    },
                ],
            },
        ],
    },
    mage: {
        branches: [
            {
                id: 'fire',
                name: 'Pyromancie',
                subtitle: 'Feu & Zone',
                accent: '#f07b4b',
                talents: [
                    {
                        id: 'm_ember',
                        name: 'Étincelle ardente',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-bolt',
                        description: '+2 dégâts sur Trait de feu par rang.',
                    },
                    {
                        id: 'm_pyroblast',
                        name: 'Brasier',
                        tier: 0,
                        col: 1,
                        maxRank: 3,
                        type: 'passive',
                        icon: 'icon-fire',
                        description: '+4 dégâts sur Boule de feu par rang.',
                    },
                    {
                        id: 'm_fire_wall',
                        name: 'Mur de feu',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'm_ember',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'fire_wall',
                        icon: 'icon-firewall',
                        manaCost: 22,
                        cooldownMs: 6000,
                        castTimeMs: 1000,
                        description: 'Sort actif (incantation 1 s) : enflamme la zone autour de la cible et brûle les ennemis.',
                    },
                    {
                        id: 'm_fire_whirl',
                        name: 'Tourbillon de feu',
                        tier: 2,
                        col: 0,
                        maxRank: 1,
                        requires: 'm_fire_wall',
                        minBranchPoints: 4,
                        type: 'active',
                        slot: 'fire_whirl',
                        icon: 'icon-fire',
                        manaCost: 28,
                        cooldownMs: 8500,
                        castTimeMs: 1000,
                        description: 'Sort actif (incantation 1 s) : lance un tourbillon ardent autour de la cible à distance.',
                    },
                ],
            },
            {
                id: 'arcane',
                name: 'Arcanes',
                subtitle: 'Mana & Puissance',
                accent: '#b48bf0',
                talents: [
                    {
                        id: 'm_clear_mind',
                        name: 'Esprit clair',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-arcane',
                        description: '+6 Mana max et +0,25/s de régénération par rang.',
                    },
                    {
                        id: 'm_mana_efficiency',
                        name: 'Économie arcanique',
                        tier: 0,
                        col: 1,
                        maxRank: 3,
                        type: 'passive',
                        icon: 'icon-mana',
                        description: 'Réduit le coût en mana des sorts de 10 % par rang.',
                    },
                    {
                        id: 'm_wand_mastery', name: 'Maîtrise des baguettes', tier: 1, col: 1,
                        maxRank: 5, type: 'passive', icon: 'icon-arcane',
                        description: '+6 % de dégâts d’auto-attaque à la baguette par rang. Sans effet sur les bâtons ou les sorts.',
                    },
                    {
                        id: 'm_wand_focus', name: 'Focalisation de la baguette', tier: 2, col: 1,
                        maxRank: 3, requires: 'm_wand_mastery', minBranchPoints: 5,
                        type: 'passive', icon: 'icon-arcane',
                        description: '+2 dégâts d’auto-attaque à la baguette par rang, avant la maîtrise.',
                    },
                    {
                        id: 'm_arcane_blast',
                        name: 'Déflagration',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'm_clear_mind',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'arcane_blast',
                        icon: 'icon-arcane',
                        manaCost: 15,
                        cooldownMs: 3600,
                        castTimeMs: 0,
                        description: 'Sort actif : projectile arcanique rapide à portée étendue.',
                    },
                ],
            },
            {
                id: 'frost',
                name: 'Givre',
                subtitle: 'Contrôle & Glace',
                accent: '#78ccf0',
                talents: [
                    {
                        id: 'm_ice_armor',
                        name: 'Armure de glace',
                        tier: 0,
                        col: 0,
                        maxRank: 5,
                        type: 'passive',
                        icon: 'icon-frost',
                        description: '+6 PV max et -5 % de dégâts subis par rang.',
                    },
                    {
                        id: 'm_frost_nova',
                        name: 'Nova de givre',
                        tier: 1,
                        col: 0,
                        maxRank: 1,
                        requires: 'm_ice_armor',
                        minBranchPoints: 2,
                        type: 'active',
                        slot: 'frost_nova',
                        icon: 'icon-frost',
                        manaCost: 20,
                        cooldownMs: 7500,
                        castTimeMs: 0,
                        description: 'Sort actif : frappe les ennemis autour de la cible à distance et les ralentit pendant 2,5 secondes.',
                    },
                    {
                        id: 'm_cold_blood',
                        name: 'Sang-froid',
                        tier: 2,
                        col: 0,
                        maxRank: 3,
                        requires: 'm_frost_nova',
                        minBranchPoints: 4,
                        type: 'passive',
                        icon: 'icon-frost',
                        description: 'Réduit le temps de recharge de tous les sorts de 8 % par rang.',
                    },
                ],
            },
        ],
    },
};

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
            scale: 0,
            heart: 0,
        },
        weapon: 'starter',
        armor: { head: null, hands: null },
        statPoints: Math.max(0, startingLevel - 1) * statPointsPerLevel,
        spellPoints: Math.max(0, startingLevel - 1) * spellPointsPerLevel,
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
        talents: {},
        trailQuest: normalizeTrailQuest(),
    };
}

/**
 * Normalise une sauvegarde existante pour y intégrer les champs de stats, sorts et talents.
 */
function normalizeProgress(saved) {
    const fallback = createInitialProgress();
    const levelsGained = Math.max(0, saved.level - 1);

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

    const talents = {};
    if (saved.talents && typeof saved.talents === 'object') {
        for (const [id, rank] of Object.entries(saved.talents)) {
            if (Number.isSafeInteger(rank) && rank > 0) {
                talents[id] = rank;
            }
        }
    }

    const statBudget = levelsGained * statPointsPerLevel;
    let spentStats = Object.values(allocatedStats).reduce((total, value) => total + value, 0);
    if (spentStats > statBudget) {
        for (const key of statKeys) allocatedStats[key] = 0;
        spentStats = 0;
    }
    const spellBudget = levelsGained * spellPointsPerLevel;
    let spentSpells = Object.values(talents).reduce((total, value) => total + value, 0)
        + Object.values(spells).reduce((total, value) => total + value - 1, 0);
    if (spentSpells > spellBudget) {
        for (const key of Object.keys(talents)) delete talents[key];
        for (const key of spellKeys) spells[key] = 1;
        spentSpells = 0;
    }

    const items = { ...saved.items };
    for (const id of Object.keys(armorItems)) {
        if (!Number.isSafeInteger(items[id]) || items[id] <= 0) delete items[id];
    }
    const armor = Object.fromEntries(Object.keys(armorSlots).map((slot) => {
        const id = saved.armor?.[slot];
        return [slot, armorItems[id]?.slot === slot && items[id] > 0 ? id : null];
    }));

    return {
        ...fallback,
        ...saved,
        items,
        armor,
        statPoints: statBudget - spentStats,
        spellPoints: spellBudget - spentSpells,
        allocatedStats,
        spells,
        talents,
        trailQuest: normalizeTrailQuest(saved.trailQuest),
    };
}

/**
 * Charge et valide la progression sauvegardée d'un personnage dans le navigateur.
 */
export function loadProgress(key, startingLevel = 1, serverProgress = null) {
    let progress = createInitialProgress(Math.max(1, startingLevel));

    try {
        const saved = JSON.parse(localStorage.getItem(key));
        const hasValidBase = saved
            && Number.isSafeInteger(saved.level)
            && saved.level >= 1
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
            progress = saved;
            for (const key of ['scale', 'heart']) {
                if (!Number.isSafeInteger(progress.items[key]) || progress.items[key] < 0) progress.items[key] = 0;
            }
        }
    } catch {
        // Conserve la partie jouable si le stockage du navigateur est indisponible.
    }

    if (serverProgress && Number.isSafeInteger(serverProgress.level) && serverProgress.level >= 1
        && serverProgress.level <= 9999 && Number.isSafeInteger(serverProgress.xp) && serverProgress.xp >= 0
        && serverProgress.xp < xpRequired(serverProgress.level)
        && (serverProgress.level > progress.level || (serverProgress.level === progress.level && serverProgress.xp > progress.xp))) {
        progress = { ...progress, level: serverProgress.level, xp: serverProgress.xp };
    }
    return normalizeProgress(progress);
}

/**
 * Garde le cache local et déclenche l’enregistrement du niveau et de l’XP en base.
 */
export function saveProgress(key, progress) {
    try {
        localStorage.setItem(key, JSON.stringify(progress));
    } catch {
        // Le personnage actif garde sa progression en mémoire jusqu'à la fermeture.
    }
    progressSync?.save(progress);
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
export function awardVictory(progress, loot, random = Math.random, xpGain = victoryXp) {
    const item = rollLoot(loot, random);
    progress.items[item]++;
    progress.xp += xpGain;

    let levelUp = false;
    while (progress.level < 9999 && progress.xp >= xpRequired(progress.level)) {
        progress.xp -= xpRequired(progress.level);
        progress.level++;
        levelUp = true;
        const currentStatPoints = Number.isSafeInteger(progress.statPoints) ? progress.statPoints : 0;
        const currentSpellPoints = Number.isSafeInteger(progress.spellPoints) ? progress.spellPoints : 0;
        progress.statPoints = currentStatPoints + statPointsPerLevel;
        progress.spellPoints = currentSpellPoints + spellPointsPerLevel;
    }

    if (progress.level === 9999) {
        progress.xp = Math.min(progress.xp, xpRequired(progress.level) - 1);
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
    if (progress.level <= 1 || !statKeys.includes(stat)) {
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
    if (progress.level <= 1 || !spellKeys.includes(spell)) {
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
 * Retourne le rang investi dans un talent donné.
 */
export function getTalentRank(progress, talentId) {
    return progress.talents?.[talentId] ?? 0;
}

/**
 * Retourne le total de points investis dans une branche de l'arbre de talents.
 */
export function getBranchPoints(progress, branch) {
    return branch.talents.reduce((sum, talent) => sum + getTalentRank(progress, talent.id), 0);
}

/**
 * Trouve la définition d'un talent et sa branche pour une classe donnée.
 */
export function findTalent(classKey, talentId) {
    const tree = talentTrees[classKey];
    if (!tree) return null;
    for (const branch of tree.branches) {
        const talent = branch.talents.find((t) => t.id === talentId);
        if (talent) {
            return { talent, branch };
        }
    }
    return null;
}

/**
 * Vérifie si un point peut être investi dans le talent demandé.
 */
export function canInvestTalent(progress, classKey, talentId) {
    if (progress.level <= 1 || !Number.isSafeInteger(progress.spellPoints) || progress.spellPoints <= 0) {
        return false;
    }
    const found = findTalent(classKey, talentId);
    if (!found) {
        return false;
    }
    const { talent, branch } = found;
    const rank = getTalentRank(progress, talentId);
    if (rank >= talent.maxRank) {
        return false;
    }
    if (talent.minBranchPoints && getBranchPoints(progress, branch) < talent.minBranchPoints) {
        return false;
    }
    if (talent.requires && getTalentRank(progress, talent.requires) <= 0) {
        return false;
    }
    return true;
}

/**
 * Investit un point de sort/talent dans le talent choisi.
 */
export function investTalent(progress, classKey, talentId) {
    if (!canInvestTalent(progress, classKey, talentId)) {
        return false;
    }
    if (!progress.talents) {
        progress.talents = {};
    }
    progress.spellPoints -= 1;
    progress.talents[talentId] = (progress.talents[talentId] ?? 0) + 1;
    return true;
}

/**
 * Réinitialise tous les talents investis et restitue les points de sort/talent.
 */
export function resetTalents(progress) {
    if (!progress.talents) {
        return 0;
    }
    let refunded = 0;
    for (const rank of Object.values(progress.talents)) {
        if (Number.isSafeInteger(rank) && rank > 0) {
            refunded += rank;
        }
    }
    if (refunded > 0) {
        progress.talents = {};
        progress.spellPoints = (progress.spellPoints ?? 0) + refunded;
    }
    return refunded;
}

/**
 * Retourne la liste des sorts actifs débloqués par les talents pour la barre de sorts.
 */
export function getUnlockedActiveSpells(progress, classKey) {
    const tree = talentTrees[classKey];
    if (!tree) return [];
    const unlocked = [];
    for (const branch of tree.branches) {
        for (const talent of branch.talents) {
            if (talent.type === 'active' && getTalentRank(progress, talent.id) > 0) {
                unlocked.push(talent);
            }
        }
    }
    return unlocked;
}

// Les armes changent l'auto-attaque sans changer la classe ni la portée des sorts.
export function basicWeaponProfile(rules, progress, stats, tileSize) {
    const mage = (rules.classKey ?? (rules.ranged ? 'mage' : 'warrior')) === 'mage';
    const wand = mage && progress.weapon !== null && progress.weapon !== 'rare';
    const ranged = mage && wand;
    const range = ranged ? (rules.range + (stats.bonusRangeTiles ?? 0)) * tileSize : 1.5 * tileSize;
    const talents = progress.talents ?? {};
    const damage = wand
        ? Math.round((stats.basicDamage + (talents.m_wand_focus ?? 0) * 2) * (1 + (talents.m_wand_mastery ?? 0) * .06))
        : stats.basicDamage;
    return { ranged, range, damage };
}

/**
 * Calcule les caractéristiques, ressources et dégâts à partir de la progression.
 */
export function computeCharacterStats(rules, progress, weaponBonus = 0) {
    const classKey = rules.classKey ?? (rules.ranged ? 'mage' : 'warrior');
    const fallbackProfile = defaultClassProfiles[classKey] ?? defaultClassProfiles.warrior;
    const baseStats = rules.baseStats ?? fallbackProfile.baseStats;
    const growthStats = rules.growthStats ?? fallbackProfile.growthStats;

    const startingLevel = 1;
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

    // Bonus issus des talents
    const t = progress.talents ?? {};
    const talentHealthBonus = (t.w_iron_skin ?? 0) * 8 + (t.m_ice_armor ?? 0) * 6;
    const talentManaBonus = (t.m_clear_mind ?? 0) * 6;
    const talentBasicBonus = (t.w_sharp_blade ?? 0) * 2 + (t.m_ember ?? 0) * 2;
    const talentSpecialBonus = (t.w_sword_mastery ?? 0) * 4 + (t.m_pyroblast ?? 0) * 4;
    const talentSpecialMultiplier = 1 + (t.w_frenzy ?? 0) * 0.08;
    const talentRegenBonus = classKey === 'mage'
        ? (t.m_clear_mind ?? 0) * 0.25
        : (t.w_bloodlust ?? 0) * 0.5;
    const cooldownReduction = Math.min(0.45, ((t.w_chain_strike ?? 0) + (t.m_cold_blood ?? 0)) * 0.08);
    const manaCostReduction = Math.min(0.45, (t.m_mana_efficiency ?? 0) * 0.1);
    const damageReduction = Math.min(0.45, (t.w_defensive_stance ?? 0) * 0.08 + (t.m_ice_armor ?? 0) * 0.05);
    const bonusRangeTiles = (t.m_arcane_blast ?? 0) > 0 ? 0.5 : 0;

    const equipment = armorBonuses(progress, classKey);
    const maxHealth = equipment.health + rules.health + levelsGained * 4 + attributes.vitality.bonus * 4 + talentHealthBonus;
    const maxMana = equipment.mana + rules.mana + levelsGained * 2 + attributes.spirit.bonus * 3 + talentManaBonus;

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
        + talentBasicBonus
        + weaponBonus + equipment.basic;

    const rawSpecialDamage = rules.specialDamage
        + levelsGained * 2
        + primaryBonus * 2
        + secondaryBonus
        + specialRankBonus
        + talentSpecialBonus + equipment.special;
    const specialDamage = Math.round(rawSpecialDamage * talentSpecialMultiplier);

    const baseRegen = rules.baseManaRegen ?? (classKey === 'mage' ? 1 : 2);
    const rawRegen = classKey === 'mage'
        ? baseRegen
            + levelsGained * 0.08
            + attributes.spirit.bonus * 0.14
            + attributes.intelligence.bonus * 0.04
            + talentRegenBonus
        : baseRegen
            + levelsGained * 0.3
            + attributes.spirit.bonus * 0.4
            + attributes.intelligence.bonus * 0.2
            + talentRegenBonus;
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
        cooldownReduction,
        manaCostReduction,
        damageReduction: Math.min(.60, damageReduction + equipment.mitigation),
        bonusRangeTiles,
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
