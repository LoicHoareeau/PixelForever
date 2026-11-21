export const tameableSpecies = ['boar', 'dragon', 'imp', 'hound', 'fiend', 'breach_lord', 'salt_hound', 'ash_sentinel', 'rift_guardian'];
export const petKeys = { KeyZ: 0, KeyX: 1, KeyC: 2 };

export function normalizeCapturedPet(saved, classKey) {
    if (classKey !== 'hunter' || !tameableSpecies.includes(saved?.species)) return null;
    return { species: saved.species, healthFraction: Number.isFinite(saved.healthFraction)
        ? Math.max(0, Math.min(1, saved.healthFraction)) : 1 };
}

export function tameError(combat, target) {
    if (!target?.isAlive || target.trial || !tameableSpecies.includes(target.species)) return 'Choisis une créature vivante autre qu’un squelette.';
    if (target.level > combat.progress.level) return 'Cette créature dépasse ton niveau.';
    if (target.health > target.maxHealth * .3) return 'Affaiblis la créature à 30 % de ses PV.';
    if (combat.effectiveDistanceTo(target) > 7 * combat.tileSize) return 'La créature est trop loin.';
    if (target.engagedBy && target.engagedBy !== combat.progressKey) return 'Cette créature est déjà engagée par un autre joueur.';
    return null;
}

export function tamingTrapError(combat, target) {
    if (combat.classKey !== 'hunter' || combat.health <= 0) return 'Cette trappe est réservée au Chasseur vivant.';
    if (combat.pending || combat.taming) return 'Termine ton action avant de poser la trappe.';
    if (combat.scene.isInStarterTown?.()) return 'Sors du Bastion pour poser une trappe.';
    return tameError(combat, target);
}

export function inheritedPetStats(stats, protector = false) {
    const defense = (stats.attributes?.defense?.total ?? 0) * .35;
    return {
        damage: Math.max(1, Math.round(stats.basicDamage * .3 * (protector ? .8 : 1))),
        maxHealth: Math.max(1, Math.round(stats.maxHealth * .5 * (protector ? 1.3 : 1))),
        defense,
        mitigation: Math.min(.5, defense / (45 + defense) + (stats.damageReduction ?? 0) * .35),
    };
}
