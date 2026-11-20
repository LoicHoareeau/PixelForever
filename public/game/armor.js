export const armorSlots = { head: 'Coiffe', hands: 'Gants' };

const sets = [
    { level: 32, name: 'des Cendres', enemies: ['fiend'], chance: .20 },
    { level: 40, name: 'de la Brèche', enemies: ['breach_lord'], chance: 1 },
    { level: 48, name: 'de Basalte', enemies: ['ash_sentinel'], chance: .26 },
    { level: 56, name: 'du Gouffre', enemies: ['rift_guardian'], chance: .32 },
];

export const armorItems = Object.fromEntries(sets.flatMap(({ level, name }, tier) => [
    { classKey: 'warrior', slot: 'head', name: 'Heaume ' + name,
        stats: { health: 54 + tier * 18, mitigation: .06 + tier * .025 } },
    { classKey: 'warrior', slot: 'hands', name: 'Gantelets ' + name,
        stats: { basic: 10 + tier * 5, special: 14 + tier * 6 } },
    { classKey: 'mage', slot: 'head', name: 'Capuche ' + name,
        stats: { health: 70 + tier * 20, mana: 14 + tier * 8 } },
    { classKey: 'mage', slot: 'hands', name: 'Mitaine runique ' + name,
        stats: { basic: 8 + tier * 4, special: 19 + tier * 7 } },
].map((piece) => {
    const id = [piece.classKey, piece.slot, level].join('-');
    return [id, { ...piece, id, level }];
})));

export function armorBonuses(progress, classKey) {
    const totals = { health: 0, mana: 0, basic: 0, special: 0, mitigation: 0 };
    for (const [slot, id] of Object.entries(progress.armor ?? {})) {
        const piece = armorItems[id];
        if (piece?.classKey !== classKey || piece.slot !== slot || piece.level > progress.level || !(progress.items[id] > 0)) continue;
        for (const [stat, value] of Object.entries(piece.stats)) totals[stat] += value;
    }
    return totals;
}

export function awardArmor(progress, classKey, species, level, random = Math.random) {
    const set = sets.find(({ enemies }) => enemies.includes(species));
    if (!set || (species === 'rift_guardian' && level < set.level)
        || (set.chance < 1 && random() >= set.chance)) return null;

    const pieces = Object.keys(armorSlots).map((slot) => armorItems[[classKey, slot, set.level].join('-')]);
    if (pieces.some((piece) => !piece)) return null;
    const missing = pieces.filter((piece) => !progress.items[piece.id]);
    const pool = set.chance === 1 && missing.length ? missing : pieces;
    const piece = pool[Math.floor(random() * pool.length)];
    progress.items[piece.id] = (progress.items[piece.id] ?? 0) + 1;
    return piece;
}

export function toggleArmor(progress, classKey, id) {
    const piece = armorItems[id];
    if (piece?.classKey !== classKey || !(progress.items[id] > 0) || progress.level < piece.level) return null;
    progress.armor ??= { head: null, hands: null };
    const equipped = progress.armor[piece.slot] !== id;
    progress.armor[piece.slot] = equipped ? id : null;
    return equipped;
}
