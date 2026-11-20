function passive(id, name, description, icon) {
    return { id, name, description, icon, tier: 0, col: 0, maxRank: 5, type: 'passive' };
}

function active(slot, name, icon, manaCost, cooldownMs, description, technique) {
    return { id: slot, slot, name, icon, manaCost, cooldownMs, description, technique, maxRank: 1, type: 'active' };
}

function branch(id, name, subtitle, accent, opening, ...spells) {
    return {
        id, name, subtitle, accent,
        talents: [opening, ...spells.map((spell, i) => ({
            ...spell, col: 0, tier: i + 1, minBranchPoints: i === 0 ? 2 : 4,
            requires: i === 0 ? opening.id : spells[i - 1].id,
        }))],
    };
}

const rune = 'icon-rune';
const blade = 'icon-sword';
const arrow = 'icon-bolt';
const shield = 'icon-shield';

const imp = active('summon_imp', 'Invoquer le diablotin', rune, 10, 4500,
    'Invoque un diablotin lanceur de flammes (incantation 1,2 s). Remplace ton familier actif.', { summon: 'imp', castMs: 1200, vfx: 'summon' });
export const starterTalents = { warlock: [imp] };

export const classTalents = {
    warlock: { branches: [
        branch('affliction', 'Affliction', 'Malédictions & Drain', '#bf7be6',
            passive('wl_affliction', 'Tourment', '+12 % de dégâts périodiques par rang.', rune),
            active('agony', 'Malédiction d’agonie', rune, 11, 6700, 'Incante 0,65 s et inflige des dégâts croissants pendant six secondes.',
                { range: 5, castMs: 650, vfx: 'curse', dot: { ticks: 6, scale: .18, ramp: .15 } }),
            active('drain_life', 'Drain de vie', rune, 14, 7200, 'Canalise pendant 2 s. Chaque pulsation inflige des dégâts et rend des PV.',
                { range: 5, castMs: 2000, channel: 500, power: .25, healing: .45, vfx: 'drain' })),
        branch('demonology', 'Démonologie', 'Pactes & Familiers', '#d97b89',
            passive('wl_bond', 'Pacte de sang', '+10 % de dégâts du familier par rang.', rune),
            active('summon_succubus', 'Invoquer la succube', rune, 11, 4500, 'Incante 1,2 s et invoque une succube qui entrave ta cible.',
                { summon: 'succubus', castMs: 1200, vfx: 'summon' }),
            active('summon_void', 'Invoquer le marcheur du Vide', rune, 13, 4500, 'Incante 1,2 s et invoque un gardien qui amortit une partie des coups reçus.',
                { summon: 'void', castMs: 1200, vfx: 'summon' })),
        branch('destruction', 'Destruction', 'Braises & Chaos', '#ed9658',
            passive('wl_ruin', 'Ruine', '+5 % aux dégâts directs de tes sorts par rang.', 'icon-fire'),
            active('immolate', 'Immolation', 'icon-fire', 13, 6200, 'Incante 1 s et brûle la cible à l’impact, puis pendant quatre secondes.',
                { range: 5, castMs: 1000, power: .5, vfx: 'fireball_burst', dot: { ticks: 4, scale: .17 } }),
            active('chaos_bolt', 'Trait du chaos', rune, 18, 9300, 'Incante 1,5 s et déchaîne un impact d’ombre et de braise.',
                { range: 6, castMs: 1500, power: 1.6, vfx: 'chaos' })),
    ] },
    rogue: { branches: [
        branch('assassination', 'Assassinat', 'Poison & Saignement', '#91ab68',
            passive('r_venom', 'Venins concentrés', '+12 % de dégâts périodiques par rang.', blade),
            active('rupture', 'Rupture', blade, 8, 6500, 'Ouvre une blessure pendant cinq secondes.',
                { range: 1.5, power: .42, vfx: 'venom', dot: { ticks: 5, scale: .19 } })),
        branch('dueling', 'Combat', 'Dagues & Enchaînements', '#d9b584',
            passive('r_blades', 'Main leste', '+2 dégâts de base par rang.', blade),
            active('blade_flurry', 'Rafale de lames', blade, 10, 6500, 'Frappe tous les ennemis proches des deux dagues.',
                { radius: 39, power: 1.05, vfx: 'dagger' })),
        branch('subtlety', 'Subterfuge', 'Ombre & Mobilité', '#78a8bb',
            passive('r_shadow', 'Foulée légère', 'Réduit tes recharges de 4 % par rang.', 'icon-charge'),
            active('shadow_strike', 'Frappe de l’ombre', blade, 11, 7200, 'Décoche une double entaille à courte portée.',
                { range: 2.4, power: 1.48, vfx: 'dagger' }),
            active('shadow_step', 'Pas de l’ombre', 'icon-charge', 8, 9500, 'Recule rapidement dans une nuée d’ombre.',
                { retreat: true, vfx: 'dagger' })),
    ] },
    hunter: { branches: [
        branch('marksman', 'Précision', 'Arc & Tirs tendus', '#e3b670',
            passive('h_aim', 'Œil vif', '+2 dégâts de base par rang.', arrow),
            active('volley', 'Volée', arrow, 12, 7600, 'Une volée de flèches frappe autour de la cible.',
                { range: 8, radius: 41, power: .92, vfx: 'arrow_volley' })),
        branch('survival', 'Survie', 'Pièges & Entraves', '#9aaf70',
            passive('h_forage', 'Instinct du pisteur', '+5 PV par rang.', 'icon-health'),
            active('spike_trap', 'Piège à pointes', 'icon-cold', 9, 7200, 'Des pointes jaillissent sous les ennemis proches de ta cible et les ralentissent.',
                { range: 7, radius: 35, power: .67, slow: 2800, vfx: 'trap' })),
        branch('falconry', 'Fauconnerie', 'Piqué & Marquage', '#c49772',
            passive('h_bond', 'Lien du fauconnier', '+10 % de dégâts du faucon par rang.', arrow),
            active('summon_hawk', 'Appel du faucon', arrow, 8, 4500, 'Appelle un faucon qui pique automatiquement sur les ennemis que tu engages.',
                { summon: 'hawk', vfx: 'arrow_volley' }),
            active('prey_mark', 'Marque de proie', arrow, 7, 7600, 'Ordonne un piqué et augmente les dégâts du faucon sur cette cible pendant six secondes.',
                { range: 8, mark: true, power: .62, vfx: 'arrow_hit' })),
    ] },
};

export const protectionTalents = [
    { ...active('provocation', 'Provocation', shield, 6, 9000, 'Attire la cible et amortit le prochain coup reçu.',
        { range: 5, guard: 3200, vfx: 'rune' }), tier: 1, col: 1, minBranchPoints: 3, requires: 'w_iron_skin' },
    { ...active('rempart', 'Rempart', shield, 9, 13000, 'Dresse le bouclier et réduit les dégâts reçus pendant quatre secondes.',
        { guard: 4000, vfx: 'bulwark' }), tier: 2, col: 1, minBranchPoints: 5, requires: 'w_defensive_stance' },
];

export const classAttacks = {
    warlock: { projectile: 'shadow_bolt', special: { power: .30, vfx: 'curse', dot: { ticks: 5, scale: .20 } } },
    rogue: { special: { power: .72, vfx: 'venom', dot: { ticks: 4, scale: .18 } } },
    hunter: { projectile: 'arrow', special: { power: 1, vfx: 'arrow_hit' } },
};
