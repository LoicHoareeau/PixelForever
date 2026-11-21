import { xpRequired, xpVersion, migrateXp } from './balance.js';
export { xpRequired } from './balance.js';
import { armorBonuses, armorItems, armorSlots } from './armor.js';
import { classTalents, protectionTalents, starterTalents } from './class-talents.js';
// Barèmes d'expérience, de caractéristiques, de sorts et de régénération
import { normalizeTrailQuest } from './trail-quest.js';
import { normalizeCapturedPet } from './pet-rules.js';

export const victoryXp = 50;


const coreStats = ['strength', 'intelligence', 'vitality', 'spirit'];
const dexterityClasses = ['rogue', 'hunter'];
export const statKeys = ['strength', 'dexterity', 'intelligence', 'spirit', 'vitality', 'defense'];

function availableStats() {
    return statKeys;
}

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
    ...classTalents,
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
                    ...protectionTalents,
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
                        description: '+2 dégâts de base par rang sur l’auto-attaque, avant réduction à la baguette.',
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
        baseStats: { strength: 8, dexterity: 5, intelligence: 4, spirit: 5, vitality: 8, defense: 6 },
        growthStats: { strength: 1.0, defense: 0.6, vitality: 0.35, dexterity: 0.15, intelligence: 0.15, spirit: 0.15 },
    },
    mage: {
        baseStats: { strength: 4, dexterity: 5, intelligence: 8, spirit: 8, vitality: 5, defense: 4 },
        growthStats: { intelligence: 1.0, spirit: 0.6, vitality: 0.35, strength: 0.15, dexterity: 0.15, defense: 0.15 },
    },
    warlock: {
        baseStats: { strength: 4, dexterity: 5, intelligence: 9, spirit: 7, vitality: 6, defense: 4 },
        growthStats: { intelligence: 1.0, spirit: 0.6, vitality: 0.35, strength: 0.15, dexterity: 0.15, defense: 0.15 },
    },
    rogue: {
        baseStats: { strength: 5, dexterity: 9, intelligence: 4, spirit: 5, vitality: 6, defense: 5 },
        growthStats: { dexterity: 1.0, strength: 0.6, vitality: 0.35, intelligence: 0.15, spirit: 0.15, defense: 0.15 },
    },
    hunter: {
        baseStats: { strength: 5, dexterity: 8, intelligence: 4, spirit: 6, vitality: 7, defense: 5 },
        growthStats: { dexterity: 1.0, spirit: 0.6, intelligence: 0.35, strength: 0.15, vitality: 0.15, defense: 0.15 },
    },
};

export const specializationProfiles = {
    bulwark: {
        label: 'Rempart',
        bonus: { defense: 3 },
        growthStats: { defense: 1.0, vitality: 0.6, strength: 0.35, dexterity: 0.15, intelligence: 0.15, spirit: 0.15 },
    },
    berserker: {
        label: 'Berserker',
        bonus: { strength: 3 },
        growthStats: { strength: 1.0, vitality: 0.6, defense: 0.35, dexterity: 0.15, intelligence: 0.15, spirit: 0.15 },
    },
};

/**
 * Crée l'état initial complet d'un personnage pour le niveau de départ donné.
 */
export function createInitialProgress(startingLevel = 1) {
    return {
        level: startingLevel,
        xpVersion,
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
        specialization: null,
        capturedPet: null,
        statPoints: Math.max(0, startingLevel - 1) * statPointsPerLevel,
        spellPoints: Math.max(0, startingLevel - 1) * spellPointsPerLevel,
        allocatedStats: {
            strength: 0,
            dexterity: 0,
            intelligence: 0,
            vitality: 0,
            spirit: 0,
            defense: 0,
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
 * Normalise une sauvegarde existante pour y intégrer les champs de stats, talents et spécialisation.
 * Les anciens rangs de sorts de base sont automatiquement remboursés dans spellPoints.
 */
function normalizeProgress(saved, classKey) {
    const fallback = createInitialProgress();
    const levelsGained = Math.max(0, saved.level - 1);

    const allocatedStats = {};
    const keys = availableStats(classKey);
    for (const key of keys) {
        const value = saved.allocatedStats?.[key];
        allocatedStats[key] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    const spells = { basic: 1, special: 1 };

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
        for (const key of keys) allocatedStats[key] = 0;
        spentStats = 0;
    }
    const spellBudget = levelsGained * spellPointsPerLevel;
    let spentSpells = Object.values(talents).reduce((total, value) => total + value, 0);
    if (spentSpells > spellBudget) {
        for (const key of Object.keys(talents)) delete talents[key];
        spentSpells = 0;
    }

    const validSpec = classKey === 'warrior' && saved.level >= 10
        && Object.hasOwn(specializationProfiles, saved.specialization)
        ? saved.specialization
        : null;

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
        specialization: validSpec,
        capturedPet: normalizeCapturedPet(saved.capturedPet, classKey),
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
export function loadProgress(key, startingLevel = 1, serverProgress = null, classKey = null) {
    let progress = createInitialProgress(Math.max(1, startingLevel));

    try {
        const saved = migrateXp(JSON.parse(localStorage.getItem(key)));
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
                || (saved.weapon === 'axe' && classKey === 'warrior')
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

    serverProgress = migrateXp(serverProgress);
    if (serverProgress && Number.isSafeInteger(serverProgress.level) && serverProgress.level >= 1
        && serverProgress.level <= 9999 && Number.isSafeInteger(serverProgress.xp) && serverProgress.xp >= 0
        && serverProgress.xp < xpRequired(serverProgress.level)
        && (serverProgress.level > progress.level || (serverProgress.level === progress.level && serverProgress.xp > progress.xp))) {
        progress = { ...progress, level: serverProgress.level, xp: serverProgress.xp };
    }
    return normalizeProgress(progress, classKey);
}

/**
 * Garde le cache local et déclenche l’enregistrement du niveau et de l’XP en base.
 */
export function saveProgress(key, progress) {
    progress.xpVersion = xpVersion;
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
export function allocateStat(progress, stat, classKey = null) {
    if (progress.level <= 1 || !availableStats(classKey).includes(stat)) {
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
 * La maîtrise des sorts de base a été supprimée au profit de l'arbre de talents.
 */
export function upgradeSpell() {
    return false;
}

/**
 * Permet à un Guerrier de niveau 10+ de choisir sa spécialisation (Rempart ou Berserker).
 */
export function chooseSpecialization(progress, classKey, spec) {
    if (classKey !== 'warrior' || (progress.level ?? 1) < 10 || progress.specialization) {
        return false;
    }
    if (!Object.hasOwn(specializationProfiles, spec)) {
        return false;
    }
    progress.specialization = spec;
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
function unlockedSpells(progress, classKey) {
    const tree = talentTrees[classKey];
    if (!tree) return [];
    const unlocked = [...(starterTalents[classKey] ?? [])];
    for (const branch of tree.branches) {
        for (const talent of branch.talents) {
            if (talent.type === 'active' && getTalentRank(progress, talent.id) > 0) {
                unlocked.push(talent);
            }
        }
    }
    return unlocked;
}

export function getUnlockedActiveSpells(progress, classKey) {
    return unlockedSpells(progress, classKey).filter(talent => !talent.technique?.summon);
}

export function getUnlockedPetSpells(progress, classKey) {
    return unlockedSpells(progress, classKey).filter(talent => talent.technique?.summon);
}

// Les armes changent l'auto-attaque sans changer la classe ni la portée des sorts.
export function basicWeaponProfile(rules, progress, stats, tileSize) {
    const classKey = rules.classKey ?? (rules.ranged ? 'mage' : 'warrior');
    const mage = classKey === 'mage';
    const wand = mage && progress.weapon !== null && progress.weapon !== 'rare';
    const ranged = wand || (['warlock', 'hunter'].includes(classKey) && progress.weapon !== null);
    const range = ranged ? (rules.range + (stats.bonusRangeTiles ?? 0)) * tileSize : 2.5 * tileSize;
    const talents = progress.talents ?? {};
    const damage = wand
        ? Math.round((stats.basicDamage * (rules.wandDamageMultiplier ?? 1) + (talents.m_wand_focus ?? 0) * 2)
            * (1 + (talents.m_wand_mastery ?? 0) * .06))
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
    const level = Math.max(1, progress.level ?? startingLevel);
    const levelsGained = Math.max(0, level - startingLevel);
    const spec = classKey === 'warrior' && level >= 10 && specializationProfiles[progress.specialization]
        ? specializationProfiles[progress.specialization]
        : null;
    const earlyLevels = spec ? Math.min(9, levelsGained) : levelsGained;
    const specLevels = spec ? Math.max(0, levelsGained - 9) : 0;

    const attributes = {};
    for (const key of statKeys) {
        const base = baseStats[key] ?? 4;
        const baseGrowth = growthStats[key] ?? 0.15;
        const specGrowth = spec?.growthStats?.[key] ?? baseGrowth;
        const naturalRaw = Math.round((earlyLevels * baseGrowth + specLevels * specGrowth) * 100) / 100;
        const specBonus = spec?.bonus?.[key] ?? 0;
        const allocated = progress.allocatedStats?.[key] ?? 0;
        const bonus = naturalRaw + specBonus + allocated;

        attributes[key] = {
            base,
            naturalRaw,
            natural: Math.round(naturalRaw),
            specBonus,
            allocated,
            bonus,
            total: Math.round(base + bonus),
        };
    }

    const primaryBonus = dexterityClasses.includes(classKey)
        ? attributes.dexterity.bonus
        : (['mage', 'warlock'].includes(classKey) ? attributes.intelligence.bonus : attributes.strength.bonus);

    const secondaryBonus = (['mage', 'warlock'].includes(classKey) || dexterityClasses.includes(classKey))
        ? attributes.strength.bonus
        : attributes.intelligence.bonus;

    // Bonus issus des talents
    const t = progress.talents ?? {};
    const talentHealthBonus = (t.w_iron_skin ?? 0) * 8 + (t.m_ice_armor ?? 0) * 6 + (t.h_forage ?? 0) * 5;
    const talentManaBonus = (t.m_clear_mind ?? 0) * 6;
    const talentBasicBonus = ((t.w_sharp_blade ?? 0) + (t.m_ember ?? 0) + (t.r_blades ?? 0) + (t.h_aim ?? 0)) * 2;
    const talentSpecialBonus = (t.w_sword_mastery ?? 0) * 4 + (t.m_pyroblast ?? 0) * 4;
    const talentSpecialMultiplier = 1 + (t.w_frenzy ?? 0) * 0.08;
    const talentRegenBonus = classKey === 'mage'
        ? (t.m_clear_mind ?? 0) * 0.25
        : (t.w_bloodlust ?? 0) * 0.5;
    const cooldownReduction = Math.min(0.45, ((t.w_chain_strike ?? 0) + (t.m_cold_blood ?? 0)) * 0.08 + (t.r_shadow ?? 0) * .04);
    const manaCostReduction = Math.min(0.45, (t.m_mana_efficiency ?? 0) * 0.1);
    const damageReduction = Math.min(0.45, (t.w_defensive_stance ?? 0) * 0.08 + (t.m_ice_armor ?? 0) * 0.05);
    const bonusRangeTiles = (t.m_arcane_blast ?? 0) > 0 ? 0.5 : 0;

    const equipment = armorBonuses(progress, classKey);
    const maxHealth = Math.round(equipment.health + rules.health + levelsGained * 3 + attributes.vitality.bonus * 4 + talentHealthBonus);
    const intelManaBonus = ['mage', 'warlock', 'hunter'].includes(classKey) ? attributes.intelligence.bonus * 2 : 0;
    const maxMana = Math.round(equipment.mana + rules.mana + levelsGained * 1.5 + attributes.spirit.bonus * 3 + intelManaBonus + talentManaBonus);

    const basicSpellRank = 1;
    const specialSpellRank = 1;
    const basicRankBonus = 0;
    const specialRankBonus = 0;

    const basicDamage = Math.round(
        rules.basicDamage
        + levelsGained
        + primaryBonus * 2
        + secondaryBonus
        + talentBasicBonus
        + weaponBonus
        + equipment.basic,
    );

    const rawSpecialDamage = rules.specialDamage
        + levelsGained * 2
        + primaryBonus * 2
        + secondaryBonus
        + talentSpecialBonus
        + equipment.special;
    const specialDamage = Math.round(rawSpecialDamage * talentSpecialMultiplier);

    // La régénération dépend uniquement de l'Esprit (et des talents dédiés), jamais de l'Intelligence ni du niveau.
    const isEnergyClass = ['warrior', 'rogue'].includes(classKey);
    const baseRegen = rules.baseManaRegen ?? (isEnergyClass ? 0.8 : 0.4);
    const spiritRate = isEnergyClass ? 0.12 : 0.08;
    const rawRegen = baseRegen + attributes.spirit.bonus * spiritRate + talentRegenBonus;
    const manaRegenPerSec = Math.round(rawRegen * 100) / 100;

    const effectiveDefense = Math.max(0, attributes.defense.bonus + Math.max(0, attributes.defense.base - 4));
    const physicalMitigation = effectiveDefense > 0 ? Math.min(.45, effectiveDefense / (45 + effectiveDefense)) : 0;

    return {
        level,
        levelsGained,
        specialization: spec ? progress.specialization : null,
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
        physicalMitigation,
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
