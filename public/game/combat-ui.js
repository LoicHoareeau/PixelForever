import { armorItems, armorSlots } from './armor.js';
import {
    canInvestTalent,
    getBranchPoints,
    getTalentRank,
    getUnlockedActiveSpells,
    statKeys,
    talentTrees,
    xpRequired,
} from './progression.js';

const statNumberFormatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const regenFormatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
});

const malakorPhases = ['Assaut de la Brèche', 'Fissures de Magma', 'Rage de la Brèche'];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function showLevelUpBannerUi(combat, now = 0) {
    const banner = combat.levelUpBanner ?? (typeof document !== 'undefined' ? document.getElementById('level-up-banner') : null);
    combat.levelUpBannerUntil = now + 3800;
    if (!banner) return;
    banner.textContent = 'Vous avez prit un niveau';
    banner.hidden = false;
}

export function updateLevelUpBannerUi(combat, now) {
    const banner = combat.levelUpBanner;
    if (!banner || banner.hidden) return;
    if (now >= (combat.levelUpBannerUntil ?? 0)) {
        banner.hidden = true;
    }
}

export function updateCooldownsUi(combat, now) {
    const slotMap = {
        basic: combat.buttons[0],
        special: combat.buttons[1],
    };
    const unlocked = getUnlockedActiveSpells(combat.progress, combat.classKey);
    combat.talentSlotButtons.forEach((btn, idx) => {
        const talent = unlocked[idx];
        if (talent) {
            slotMap[talent.slot] = btn;
        } else {
            btn.style.setProperty('--cooldown', '0%');
            const cdBadge = btn.querySelector('.slot-cd');
            if (cdBadge) cdBadge.textContent = '';
        }
    });

    for (const [key, btn] of Object.entries(slotMap)) {
        if (!btn) continue;
        const info = combat.spellCooldowns.get(key);
        const remaining = info ? Math.max(0, info.end - now) : 0;
        const total = info ? Math.max(1, info.end - info.start) : 1;
        const percent = remaining > 0 ? Math.ceil((100 * remaining) / total) : 0;
        btn.style.setProperty('--cooldown', percent + '%');
        const cdBadge = btn.querySelector('.slot-cd');
        if (cdBadge) {
            cdBadge.textContent = remaining > 0 ? (remaining / 1000).toFixed(1) + 's' : '';
        }
    }
}

export function refreshCastBarUi(combat, now) {
    if (!combat.castBar) return;
    const pending = combat.pending;
    if (!pending || pending.castMs < 500 || now >= pending.start + pending.castMs) {
        combat.castBar.hidden = true;
        return;
    }
    const elapsed = Math.max(0, now - pending.start);
    const remainingSec = Math.max(0, (pending.start + pending.castMs - now) / 1000).toFixed(1);
    combat.castBar.hidden = false;
    if (combat.castBarName) combat.castBarName.textContent = pending.name ?? 'Incantation';
    if (combat.castBarMeter) combat.castBarMeter.value = Math.min(100, Math.round((elapsed * 100) / pending.castMs));
    if (combat.castBarTime) combat.castBarTime.textContent = `${remainingSec}s`;
}

export function refreshActionSlotsUi(combat) {
    const unlocked = getUnlockedActiveSpells(combat.progress, combat.classKey);
    combat.talentSlotButtons.forEach((button, index) => {
        const talent = unlocked[index];
        button.hidden = index >= 4 && !talent;
        const iconEl = button.querySelector('.action-icon');
        const nameEl = button.querySelector('.slot-name');
        const metaEl = button.querySelector('.slot-meta');
        if (!talent) {
            button.dataset.unlocked = 'false';
            button.title = `Emplacement ${index + 3} · Débloquer un sort dans l’arbre de talents (T)`;
            if (iconEl) iconEl.className = 'action-icon icon-locked';
            if (nameEl) nameEl.textContent = 'Verrouillé';
            if (metaEl) metaEl.textContent = 'Talent (T)';
            return;
        }
        button.dataset.unlocked = 'true';
        const cost = Math.max(1, Math.round((talent.manaCost ?? 6) * (1 - (combat.stats?.manaCostReduction ?? 0))));
        button.title = `${talent.name} · ${cost} ${combat.rules.resourceName.toLowerCase()} · ${talent.description}`;
        if (iconEl) iconEl.className = `action-icon ${talent.icon}`;
        if (nameEl) nameEl.textContent = talent.name;
        if (metaEl) metaEl.textContent = `${cost} ${combat.rules.resourceName.toLowerCase()}`;
    });
}

export function refreshInventoryUi(combat) {
    combat.amounts.forEach((amount) => {
        amount.textContent = combat.progress.items[amount.dataset.quantity];
    });

    combat.potionButtons.forEach((button) => {
        button.disabled = combat.health === 0;
    });

    combat.weaponButtons.forEach((button) => {
        const weapon = button.dataset.weapon;
        button.textContent = weapon === combat.progress.weapon ? 'Retirer' : 'Équiper';
        button.disabled = !combat.hasWeapon(weapon);
    });

    combat.weaponStates.forEach((state) => {
        const weapon = state.dataset.weaponState;
        const equipped = weapon === combat.progress.weapon;
        state.textContent = weapon === 'starter' || weapon === 'axe'
            ? (equipped ? 'Équipé · +' + combat.rules.weaponBonus + ' dégâts de base' : 'Dans le sac')
            : (equipped ? '· Équipé' : '');
    });

    if (combat.armorList) {
        const owned = Object.values(armorItems).filter((piece) => piece.classKey === combat.classKey && combat.progress.items[piece.id] > 0);
        const statNames = { health: 'PV', mana: 'mana', basic: 'dégâts de base', special: 'dégâts de compétence', mitigation: 'protection' };
        if (owned.length) {
            combat.armorList.replaceChildren(...owned.map((piece) => {
                const item = document.createElement('li');
                const icon = document.createElement('img');
                icon.src = combat.scene.armorIconPath + (piece.icon ?? piece.id) + '.png';
                icon.alt = '';
                icon.className = 'armor-icon';
                const description = document.createElement('div');
                const name = el('strong', '', piece.name);
                const details = document.createElement('small');
                const equipped = combat.progress.armor?.[piece.slot] === piece.id;
                const bonuses = Object.entries(piece.stats).map(([stat, value]) =>
                    '+' + (stat === 'mitigation' ? Math.round(value * 100) + ' %' : value) + ' ' + statNames[stat]);
                details.textContent = [armorSlots[piece.slot], 'N. ' + piece.level, ...bonuses, equipped ? 'Équipé' : ''].filter(Boolean).join(' · ');
                description.append(name, details);
                const button = el('button', 'quiet', equipped ? 'Retirer' : 'Équiper');
                button.type = 'button';
                button.dataset.armor = piece.id;
                button.disabled = combat.progress.level < piece.level;
                item.append(icon, description, button);
                return item;
            }));
        } else {
            const empty = el('li', '', 'Les gardes de la Citadelle laissent les premières coiffes et paires de gants.');
            combat.armorList.replaceChildren(empty);
        }
    }

    combat.basicLabel.textContent = combat.basicName;
    const icon = combat.buttons[0].querySelector('.action-icon');
    if (icon) {
        const style = combat.weaponStyle;
        icon.className = 'action-icon icon-' + (['axe', 'daggers', 'bow', 'grimoire'].includes(style) ? style : combat.rules.basicIcon ?? 'sword');
    }
    combat.buttons[0].title = combat.basicName
        + ' · ' + combat.basicWeapon.damage + ' dégâts'
        + ' · Portée : ' + combat.basicRangeLabel;
}

export function refreshCharacterSheetUi(combat) {
    if (!combat.stats) return;

    if (combat.characterPointsBadge) {
        const pts = combat.stats.statPoints;
        combat.characterPointsBadge.textContent = pts > 0 ? '+' + pts : '';
        combat.characterPointsBadge.dataset.hasPoints = pts > 0 ? 'true' : 'false';
    }

    if (combat.talentPointsBadge) {
        const sPts = combat.stats.spellPoints;
        combat.talentPointsBadge.textContent = sPts > 0 ? '+' + sPts : '';
        combat.talentPointsBadge.dataset.hasPoints = sPts > 0 ? 'true' : 'false';
    }

    const regenText = '+' + regenFormatter.format(combat.stats.manaRegenPerSec) + '/s';
    if (combat.sheetLevelLabel) combat.sheetLevelLabel.textContent = String(combat.stats.level);
    if (combat.sheetXpLabel) combat.sheetXpLabel.textContent = combat.progress.xp + ' / ' + xpRequired(combat.stats.level);
    if (combat.sheetWeaponLabel) combat.sheetWeaponLabel.textContent = combat.equippedWeaponName;
    if (combat.sheetMaxHealthLabel) combat.sheetMaxHealthLabel.textContent = String(combat.stats.maxHealth);
    if (combat.sheetMaxManaLabel) combat.sheetMaxManaLabel.textContent = String(combat.stats.maxMana);
    if (combat.sheetManaRegenLabel) combat.sheetManaRegenLabel.textContent = regenText;
    if (combat.sheetBasicDamageLabel) combat.sheetBasicDamageLabel.textContent = combat.basicWeapon.damage + ' dégâts';
    if (combat.sheetSpecialDamageLabel) combat.sheetSpecialDamageLabel.textContent = combat.stats.specialDamage + ' dégâts';
    if (combat.sheetRangeLabel) combat.sheetRangeLabel.textContent = combat.basicRangeLabel;

    if (combat.statPointsLabel) {
        const count = combat.stats.statPoints;
        combat.statPointsLabel.textContent = count + (count > 1 ? ' points disponibles' : ' point disponible');
    }

    for (const key of statKeys) {
        const detail = combat.stats.attributes[key];
        if (!detail) continue;
        if (combat.statTotals[key]) combat.statTotals[key].textContent = String(detail.total);
        if (combat.statDetails[key]) {
            const natText = statNumberFormatter.format(detail.naturalRaw ?? detail.natural);
            combat.statDetails[key].textContent = 'Base ' + detail.base
                + ' · Naturel +' + natText
                + ' · Investi +' + detail.allocated;
        }
    }

    combat.statButtons.forEach((button) => {
        button.disabled = combat.stats.statPoints <= 0;
    });

    if (combat.warriorSpecCard) {
        const showSpec = combat.classKey === 'warrior' && combat.progress.level >= 10;
        combat.warriorSpecCard.hidden = !showSpec;
        if (showSpec) {
            const current = combat.progress.specialization ?? null;
            if (combat.warriorSpecStatus) {
                combat.warriorSpecStatus.textContent = current === 'bulwark'
                    ? 'Spécialisation active : Guerrier Rempart (+3 Défense · priorité Défense → Vitalité → Force)'
                    : current === 'berserker'
                        ? 'Spécialisation active : Guerrier Berserker (+3 Force · priorité Force → Vitalité → Défense)'
                        : 'Choisis ta voie dès le niveau 10 (définit la croissance des niveaux suivants) :';
            }
            combat.warriorSpecButtons.forEach((btn) => {
                const isSelected = btn.dataset.chooseSpec === current;
                btn.disabled = Boolean(current);
                btn.dataset.selected = isSelected ? 'true' : 'false';
            });
        }
    }
}

export function renderTalentTreeUi(combat) {
    if (!combat.talentTreeRoot) return;
    const tree = talentTrees[combat.classKey];
    if (!tree) return;

    if (combat.talentPointsModalLabel) {
        const pts = combat.stats?.spellPoints ?? combat.progress.spellPoints ?? 0;
        combat.talentPointsModalLabel.textContent = `${pts} point${pts > 1 ? 's' : ''} de talent disponible${pts > 1 ? 's' : ''}`;
    }

    combat.talentTreeRoot.replaceChildren();

    for (const branch of tree.branches) {
        const branchPts = getBranchPoints(combat.progress, branch);
        const colEl = el('section', 'talent-branch');
        colEl.style.setProperty('--branch-accent', branch.accent);

        const header = el('header', 'talent-branch-header');
        const titleWrap = document.createElement('div');
        titleWrap.append(el('h3', '', branch.name), el('small', '', branch.subtitle));
        header.append(titleWrap, el('span', 'branch-points-badge', `${branchPts} pts`));
        colEl.appendChild(header);

        const grid = el('div', 'talent-grid');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'talent-connectors');
        svg.setAttribute('viewBox', '0 0 200 240');
        svg.setAttribute('preserveAspectRatio', 'none');

        for (const talent of branch.talents) {
            if (!talent.requires) continue;
            const parent = branch.talents.find((t) => t.id === talent.requires);
            if (!parent) continue;
            const x1 = parent.col === 0 ? 50 : 150;
            const y1 = parent.tier * 80 + 40;
            const x2 = talent.col === 0 ? 50 : 150;
            const y2 = talent.tier * 80 + 40;
            const active = getTalentRank(combat.progress, parent.id) > 0;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(x1));
            line.setAttribute('y1', String(y1));
            line.setAttribute('x2', String(x2));
            line.setAttribute('y2', String(y2));
            line.setAttribute('stroke', active ? branch.accent : '#4a4352');
            line.setAttribute('stroke-width', active ? '4' : '3');
            svg.appendChild(line);
        }
        grid.appendChild(svg);

        for (const talent of branch.talents) {
            const rank = getTalentRank(combat.progress, talent.id);
            const maxed = rank >= talent.maxRank;
            const available = canInvestTalent(combat.progress, combat.classKey, talent.id);
            const state = maxed ? 'maxed' : (rank > 0 ? 'invested' : (available ? 'available' : 'locked'));

            const node = el('button', `talent-node talent-${state}`);
            node.type = 'button';
            node.style.gridRow = String(talent.tier + 1);
            node.style.gridColumn = String(talent.col + 1);
            node.dataset.talentId = talent.id;
            node.setAttribute('aria-label', `${talent.name} · ${rank}/${talent.maxRank} · ${talent.description}`);

            const kindSpan = el('span', 'talent-kind', talent.type === 'active' ? 'SORT' : 'PASSIF');
            const iconSpan = el('span', `action-icon ${talent.icon}`);
            iconSpan.setAttribute('aria-hidden', 'true');
            const rankSpan = el('span', 'talent-rank', `${rank}/${talent.maxRank}`);
            node.append(kindSpan, iconSpan, rankSpan);

            const showTip = () => {
                if (!combat.talentTooltip) return;
                const reqText = talent.minBranchPoints
                    ? `Prérequis : ${talent.minBranchPoints} pts dans ${branch.name}`
                    : 'Palier de base';
                combat.talentTooltip.replaceChildren(
                    el('strong', '', talent.name),
                    el('span', 'tooltip-type', `${talent.type === 'active' ? 'Sort actif' : 'Bonus passif'} · Rang ${rank}/${talent.maxRank}`),
                    el('p', '', talent.description),
                    el('small', '', reqText),
                );
            };

            node.addEventListener('mouseenter', showTip);
            node.addEventListener('focus', showTip);
            node.addEventListener('click', () => {
                showTip();
                const msg = combat.spendTalentPoint(talent.id);
                if (combat.talentStatusLabel) {
                    combat.talentStatusLabel.textContent = msg;
                }
            });

            grid.appendChild(node);
        }

        colEl.appendChild(grid);
        combat.talentTreeRoot.appendChild(colEl);
    }
}

export function refreshTargetHudUi(combat) {
    if (!combat.targetHud) return;
    const target = combat.selectedMonster;
    if (!target || !target.isAlive) {
        combat.targetHud.hidden = true;
        combat.targetHud.dataset.boss = 'false';
        if (combat.targetPhaseLabel) combat.targetPhaseLabel.hidden = true;
        return;
    }
    combat.targetHud.hidden = false;
    combat.targetHud.dataset.boss = String(Boolean(target.isBoss));
    if (combat.targetNameLabel) combat.targetNameLabel.textContent = target.name;
    if (combat.targetLevelLabel) {
        combat.targetLevelLabel.textContent = (target.isBoss ? 'BOSS · Niv. ' : 'Niv. ') + target.level;
    }
    if (combat.targetPhaseLabel) {
        if (target.isBoss) {
            combat.targetPhaseLabel.hidden = false;
            combat.targetPhaseLabel.textContent = `Phase ${target.phase} · ${malakorPhases[target.phase - 1]} · ${target.trial ? 'ESQUIVE' : '65 % / 25 %'}`;
        } else {
            combat.targetPhaseLabel.hidden = true;
        }
    }
    combat.meters[2].meter.max = target.maxHealth;
    combat.meters[2].meter.value = target.health;
    combat.meters[2].value.textContent = target.health + ' / ' + target.maxHealth;
}
