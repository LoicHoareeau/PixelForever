import {
    allocateStat,
    awardVictory,
    canInvestTalent,
    computeCharacterStats,
    findTalent,
    getBranchPoints,
    getTalentRank,
    getUnlockedActiveSpells,
    investTalent,
    loadProgress,
    regenerateResource,
    resetTalents,
    saveProgress,
    statKeys,
    talentTrees,
    upgradeSpell,
    xpRequired,
} from './progression.js';
import { inZone } from './exploration.js';
import { recordTrailQuestDefeat } from './trail-quest.js';

const impactMs = 210;
const recoveryMs = 140;

const sparks = [
    [-10, -3],
    [-7, 6],
    [-3, -9],
    [3, 9],
    [7, -7],
    [11, 2],
    [0, -11],
    [9, 6],
];

const statLabels = {
    strength: 'Force',
    intelligence: 'Intelligence',
    vitality: 'Vitalité',
    spirit: 'Esprit',
};

const numberFormatter = new Intl.NumberFormat('fr-FR');
const regenFormatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
});

/**
 * Gère le combat temps réel multi-monstres, les 6 emplacements de sorts,
 * les arbres de talents, les potions, l'équipement et l'ATH plein écran.
 */
export class TrainingCombat {
    constructor(scene, monsters, rules, tileSize) {
        this.scene = scene;
        this.monsters = monsters;
        this.tileSize = tileSize;
        this.rules = rules;
        this.classKey = rules.classKey ?? (rules.ranged ? 'mage' : 'warrior');
        this.progressKey = 'pixelforever:progress:' + rules.progressKey;
        this.progress = loadProgress(this.progressKey, rules.level);
        this.manaCarry = 0;
        this.ranged = rules.ranged;
        this.selectedMonster = monsters.find((m) => m.species === 'boar') ?? monsters[0];

        // Références de l'ATH principal et de la barre d'actions
        this.status = document.getElementById('combat-status');
        this.resetButton = document.getElementById('combat-reset');
        this.targetHud = document.getElementById('combat-target');
        this.targetNameLabel = document.getElementById('combat-target-name');
        this.targetLevelLabel = document.getElementById('combat-target-level');
        this.combatActions = document.getElementById('combat-actions');
        this.buttons = [...document.querySelectorAll('[data-attack]')];
        this.talentSlotButtons = [...document.querySelectorAll('[data-talent-slot]')];
        this.potionButtons = [...document.querySelectorAll('[data-potion]')];
        this.amounts = [...document.querySelectorAll('[data-quantity]')];
        this.weaponButtons = [...document.querySelectorAll('[data-weapon]')];
        this.weaponStates = [...document.querySelectorAll('[data-weapon-state]')];
        this.levelLabel = document.getElementById('combat-level');
        this.xpMeter = document.getElementById('combat-xp');
        this.xpLabel = document.getElementById('combat-xp-value');
        this.manaRegenLabel = document.getElementById('combat-mana-regen');
        this.basicLabel = document.getElementById('combat-basic-name');
        this.basicMetaLabel = document.getElementById('combat-basic-meta');
        this.specialMetaLabel = document.getElementById('combat-special-meta');
        this.characterPointsBadge = document.getElementById('character-points-badge');
        this.talentPointsBadge = document.getElementById('talent-points-badge');

        // Références de la fiche de personnage et des stats
        this.sheetLevelLabel = document.querySelector('[data-sheet-level]');
        this.sheetXpLabel = document.querySelector('[data-sheet-xp]');
        this.sheetWeaponLabel = document.querySelector('[data-sheet-weapon]');
        this.sheetMaxHealthLabel = document.querySelector('[data-sheet-max-health]');
        this.sheetMaxManaLabel = document.querySelector('[data-sheet-max-mana]');
        this.sheetManaRegenLabel = document.querySelector('[data-sheet-mana-regen]');
        this.sheetBasicDamageLabel = document.querySelector('[data-sheet-basic-damage]');
        this.sheetSpecialDamageLabel = document.querySelector('[data-sheet-special-damage]');
        this.sheetRangeLabel = document.querySelector('[data-sheet-range]');

        this.statPointsLabel = document.getElementById('stat-points-count');
        this.spellPointsLabel = document.getElementById('spell-points-count');
        this.statButtons = [...document.querySelectorAll('[data-allocate-stat]')];
        this.spellButtons = [...document.querySelectorAll('[data-upgrade-spell]')];

        // Références de la fenêtre Arbre de Talents
        this.talentTreeRoot = document.getElementById('talent-tree-branches');
        this.talentPointsModalLabel = document.getElementById('talent-points-count');
        this.talentTooltip = document.getElementById('talent-tooltip');
        this.talentResetButton = document.getElementById('talent-reset-btn');
        this.talentStatusLabel = document.getElementById('talent-tree-status');

        this.statTotals = {};
        this.statDetails = {};
        for (const key of statKeys) {
            this.statTotals[key] = document.querySelector(`[data-stat-total="${key}"]`);
            this.statDetails[key] = document.querySelector(`[data-stat-detail="${key}"]`);
        }

        this.spellRanks = {
            basic: document.querySelector('[data-spell-rank="basic"]'),
            special: document.querySelector('[data-spell-rank="special"]'),
        };
        this.spellDamages = {
            basic: document.querySelector('[data-spell-damage="basic"]'),
            special: document.querySelector('[data-spell-damage="special"]'),
        };

        this.meters = ['health', 'mana', 'target-health'].map((name) => ({
            meter: document.getElementById('combat-' + name),
            value: document.getElementById('combat-' + name + '-value'),
        }));

        this.effect = scene.add.graphics().setDepth(scene.terrain.length * tileSize + 1);

        // Cooldowns individuels par compétence + buff Berserk
        this.spellCooldowns = new Map();
        this.berserkUntil = 0;

        // Clic sur un monstre pour le cibler
        this.monsters.forEach((monster) => {
            monster.sprite.on('pointerdown', () => {
                if (!monster.isAlive) return;
                this.selectMonster(monster);
                this.tell(`Cible : ${monster.name} (Niv. ${monster.level}).`);
            });
        });

        this.reset();
        document.getElementById('combat-vitals').hidden = false;
        this.combatActions.hidden = false;
    }

    get range() {
        return (this.rules.range + (this.stats?.bonusRangeTiles ?? 0)) * this.tileSize;
    }

    get rangeLabel() {
        const tiles = this.rules.range + (this.stats?.bonusRangeTiles ?? 0);
        return numberFormatter.format(tiles) + (tiles < 2 ? ' case' : ' cases');
    }

    selectMonster(monster) {
        this.monsters.forEach((m) => m.setSelected(false));
        this.selectedMonster = monster;
        if (monster && monster.isAlive) {
            monster.setSelected(true);
            this.refreshTargetHud();
        }
    }

    getActiveTarget() {
        if (this.selectedMonster && this.selectedMonster.isAlive) {
            return this.selectedMonster;
        }
        // Sinon cibler le monstre vivant le plus proche
        let nearest = null;
        let bestDist = Infinity;
        for (const m of this.monsters) {
            if (!m.isAlive) continue;
            const d = Math.hypot(m.sprite.x - this.scene.position.x, m.sprite.y - this.scene.position.y);
            if (d < bestDist) {
                bestDist = d;
                nearest = m;
            }
        }
        if (nearest) {
            this.selectMonster(nearest);
        }
        return nearest;
    }

    /**
     * Réinitialise l'affrontement sans effacer la progression sauvegardée du personnage.
     */
    reset() {
        this.manaCarry = 0;
        this.spellCooldowns.clear();
        this.berserkUntil = 0;
        this.refreshProgress();
        this.health = this.meters[0].meter.max;
        this.mana = this.meters[1].meter.max;
        this.readyAt = 0;
        this.cooldownStart = 0;
        this.impacts = [];
        this.pending = null;
        this.recovery = null;
        this.attackVisual = null;
        this.effect.clear();
        this.scene.avatar.clearTint();

        this.monsters.forEach((m, index) => {
            m.respawnAt = Infinity;
            m.place(m.patrol[index % m.patrol.length], m.level);
        });
        this.selectMonster(this.monsters.find((m) => m.species === 'boar') ?? this.monsters[0]);
        this.targetHud.hidden = true;

        this.buttons.forEach((button) => {
            button.disabled = false;
        });
        this.resetButton.hidden = true;
        this.refreshVitals();
        this.refreshInventory();
        this.refreshActionSlots();
        this.updateCooldowns(0);
        this.tell('Sangliers près de la clairière · Suis le sentier vers le cimetière, puis les montagnes.');
    }

    /**
     * Déclenche une attaque de base, le sort spécial ou un sort débloqué par talent.
     */
    attack(kind, now) {
        if (this.health === 0) {
            return;
        }

        // Gestion des slots 3..6 liés aux talents
        if (kind.startsWith('talent-')) {
            const slotIndex = Number(kind.split('-')[1]);
            const unlocked = getUnlockedActiveSpells(this.progress, this.classKey);
            const talent = unlocked[slotIndex];
            if (!talent) {
                this.tell('Emplacement vide : débloque un sort dans l’arbre de talents (T).');
                return;
            }
            this.castTalentSpell(talent, now);
            return;
        }

        const target = this.getActiveTarget();
        if (!target) {
            this.tell('Aucun monstre disponible pour le moment.');
            return;
        }

        if (this.pending || now < this.readyAt) {
            this.tell('L’attaque est en cours ou en recharge.');
            return;
        }

        const dist = this.distanceTo(target);
        if (dist > this.range) {
            this.tell(`${target.name} est hors de portée. Portée : ${this.rangeLabel}.`);
            return;
        }

        const special = kind === 'special';
        const manaCost = special
            ? Math.max(1, Math.round(this.rules.specialManaCost * (1 - (this.stats.manaCostReduction ?? 0))))
            : 0;

        if (special && this.mana < manaCost) {
            this.tell(this.rules.resourceName + ' : réserve insuffisante. L’attaque de base est disponible.');
            return;
        }

        if (special) {
            this.mana -= manaCost;
            this.refreshVitals();
        }

        this.targetHud.hidden = false;
        this.refreshTargetHud();

        const cdFactor = 1 - (this.stats.cooldownReduction ?? 0);
        const cdMs = Math.round(this.rules.cooldownMs * cdFactor);
        this.cooldownStart = now;
        this.readyAt = now + cdMs;
        this.setSlotCooldown(special ? 'special' : 'basic', now, cdMs);

        this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);

        const berserkMult = now < this.berserkUntil ? 1.4 : 1;
        const baseDmg = special ? this.stats.specialDamage : this.stats.basicDamage;
        const duration = this.ranged ? (special ? 380 : 250) : (special ? 480 : 140);
        const angle = Math.atan2(target.sprite.y - this.scene.position.y, target.sprite.x - this.scene.position.x);

        const attack = {
            target,
            color: special ? 0xff942f : (this.ranged ? 0xb5b8ff : 0xffefd0),
            damage: Math.round(baseDmg * berserkMult),
            name: special ? this.rules.specialName : this.basicName,
            special,
            armed: this.equipped,
            angle,
            facing: this.scene.facing,
            start: now,
            end: now + duration,
            castMs: special ? 105 : 55,
            x: this.scene.position.x + Math.cos(angle) * 7,
            y: this.scene.position.y - 20 + Math.sin(angle) * 4,
        };

        this.pending = attack;
        this.attackVisual = attack;
        this.tell(attack.name + ' sur ' + target.name + '...');
    }

    /**
     * Exécute un sort actif débloqué via l'arbre de talents.
     */
    castTalentSpell(talent, now) {
        const cdInfo = this.spellCooldowns.get(talent.slot);
        if (cdInfo && now < cdInfo.end) {
            const left = ((cdInfo.end - now) / 1000).toFixed(1);
            this.tell(`${talent.name} en recharge (${left}s).`);
            return;
        }

        const manaCost = Math.max(1, Math.round((talent.manaCost ?? 6) * (1 - (this.stats.manaCostReduction ?? 0))));
        if (this.mana < manaCost) {
            this.tell(`${this.rules.resourceName} insuffisant(e) pour ${talent.name} (${manaCost}).`);
            return;
        }

        const cdFactor = 1 - (this.stats.cooldownReduction ?? 0);
        const cdMs = Math.round((talent.cooldownMs ?? 4500) * cdFactor);
        const berserkMult = now < this.berserkUntil ? 1.4 : 1;

        // Sort d'amélioration personnelle : Berserk
        if (talent.slot === 'berserk') {
            this.mana -= manaCost;
            this.berserkUntil = now + 6000;
            this.setSlotCooldown(talent.slot, now, cdMs);
            this.impacts.push({ x: this.scene.position.x, y: this.scene.position.y - 16, color: 0xff5a36, start: now });
            this.refreshVitals();
            this.tell('Berserk activé ! +40 % de dégâts pendant 6s.');
            return;
        }

        const target = this.getActiveTarget();

        // Sorts de zone centrés sur le joueur : Taillade, Tourbillon de feu, Nova de givre
        if (talent.slot === 'cleave' || talent.slot === 'fire_whirl' || talent.slot === 'frost_nova') {
            const radius = talent.slot === 'cleave' ? 38 : 54;
            const hits = this.monsters.filter((m) => m.isAlive && this.distanceTo(m) <= radius);
            if (hits.length === 0) {
                this.tell(`Aucun ennemi à portée pour ${talent.name}.`);
                return;
            }
            this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            const color = talent.slot === 'frost_nova' ? 0x78ccf0 : (talent.slot === 'fire_whirl' ? 0xff7b2f : 0xffe09e);
            const mult = talent.slot === 'fire_whirl' ? 1.25 : (talent.slot === 'frost_nova' ? 0.75 : 0.95);
            const dmg = Math.round(this.stats.specialDamage * mult * berserkMult);

            this.impacts.push({ x: this.scene.position.x, y: this.scene.position.y - 10, color, start: now });
            for (const m of hits) {
                if (talent.slot === 'frost_nova') {
                    m.slowUntil = now + 2500;
                }
                this.applyDamageToMonster(m, dmg, talent.name, color, now);
            }
            this.refreshVitals();
            return;
        }

        if (!target) {
            this.tell('Aucune cible à portée.');
            return;
        }

        // Engagement : ruée vers la cible jusqu'à 4.5 cases
        if (talent.slot === 'engage') {
            const maxEngage = 4.5 * this.tileSize;
            if (this.distanceTo(target) > maxEngage) {
                this.tell(`${target.name} est trop loin pour Engagement.`);
                return;
            }
            this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            const angle = Math.atan2(target.sprite.y - this.scene.position.y, target.sprite.x - this.scene.position.x);
            const destX = target.sprite.x - Math.cos(angle) * 14;
            const destY = target.sprite.y - Math.sin(angle) * 14;
            if (this.scene.canStand(destX, destY)) {
                this.scene.position.set(destX, destY);
            }
            this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);
            const dmg = Math.round(this.stats.specialDamage * 1.15 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0xf0a64b, now);
            this.refreshVitals();
            return;
        }

        // Coup de bouclier : étourdit et interrompt l'attaque du monstre
        if (talent.slot === 'shield_bash') {
            if (this.distanceTo(target) > this.range + 6) {
                this.tell(`${target.name} est hors de portée pour Coup de bouclier.`);
                return;
            }
            this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            target.stunUntil = now + 2000;
            target.cancelAttack();
            const dmg = Math.round(this.stats.basicDamage * 1.1 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0x9be0de, now);
            this.refreshVitals();
            return;
        }

        // Mur de feu : AoE centrée sur la cible
        if (talent.slot === 'fire_wall') {
            if (this.distanceTo(target) > this.range + 16) {
                this.tell(`${target.name} est hors de portée pour Mur de feu.`);
                return;
            }
            this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            const dmg = Math.round(this.stats.specialDamage * 1.15 * berserkMult);
            const cx = target.sprite.x;
            const cy = target.sprite.y;
            const hits = this.monsters.filter((m) => m.isAlive && Math.hypot(m.sprite.x - cx, m.sprite.y - cy) <= 38);
            for (const m of hits) {
                this.applyDamageToMonster(m, dmg, talent.name, 0xff6b2b, now);
            }
            this.refreshVitals();
            return;
        }

        // Déflagration arcanique : portée étendue
        if (talent.slot === 'arcane_blast') {
            if (this.distanceTo(target) > this.range + 1.5 * this.tileSize) {
                this.tell(`${target.name} est hors de portée pour Déflagration.`);
                return;
            }
            this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            const dmg = Math.round(this.stats.specialDamage * 1.05 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0xc99eff, now);
            this.refreshVitals();
        }
    }

    setSlotCooldown(slotKey, now, durationMs) {
        this.spellCooldowns.set(slotKey, {
            start: now,
            end: now + durationMs,
        });
    }

    /**
     * Met à jour le combat, la réapparition des monstres, la régénération et les effets visuels.
     */
    update(now, delta) {
        for (const monster of this.monsters) {
            if (!monster.isAlive && now >= monster.respawnAt) {
                monster.respawnAt = Infinity;
                monster.respawn(this.scene.position);
                if (this.selectedMonster === monster) {
                    this.selectMonster(monster);
                }
            }
        }

        if (this.pending && now >= this.pending.end) {
            const attack = this.pending;
            this.pending = null;
            this.resolveAttack(attack, now);
        }

        if (this.health > 0 && this.mana < this.meters[1].meter.max) {
            const regenerated = regenerateResource(
                this.mana,
                this.meters[1].meter.max,
                this.stats.manaRegenPerSec,
                Math.min(delta, 100),
                this.manaCarry,
            );
            this.mana = regenerated.value;
            this.manaCarry = regenerated.carry;
            if (regenerated.gained > 0) {
                this.refreshVitals();
            }
        }

        // Chaque monstre poursuit sa cible et attaque à sa propre cadence.
        for (const monster of this.monsters) {
            if (!monster.isAlive) continue;
            if (this.health > 0) {
                this.updateMonsterCounter(monster, now);
            }
            monster.update(now, delta, this.scene.position);
        }

        // Teinte visuelle de Berserk sur l'avatar
        if (this.health > 0) {
            if (now < this.berserkUntil) {
                this.scene.avatar.setTint(0xffb38a);
            } else if (this.scene.avatar.tintTopLeft === 0xffb38a) {
                this.scene.avatar.clearTint();
            }
        }

        this.drawEffects(now);
        this.updateCooldowns(now);
    }

    /**
     * Met à jour les indicateurs visuels de recharge sur chaque slot de la barre d'action.
     */
    updateCooldowns(now) {
        const slotMap = {
            basic: this.buttons[0],
            special: this.buttons[1],
        };
        const unlocked = getUnlockedActiveSpells(this.progress, this.classKey);
        this.talentSlotButtons.forEach((btn, idx) => {
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
            const info = this.spellCooldowns.get(key);
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

    /**
     * Consomme une potion de vie ou de mana/énergie.
     */
    drinkPotion(type) {
        if (this.health === 0) {
            return 'Reprends l’entraînement pour boire une potion.';
        }
        if (!this.progress.items[type]) {
            return 'Il ne reste plus de potion de ce type.';
        }

        const maximum = this.meters[type === 'health' ? 0 : 1].meter.max;
        if (this[type] === maximum) {
            return 'Cette réserve est déjà pleine.';
        }

        const amount = Math.min(maximum - this[type], this.rules[type + 'Restore']);
        this[type] += amount;
        this.progress.items[type]--;
        saveProgress(this.progressKey, this.progress);
        this.refreshVitals();
        this.refreshInventory();

        this.impacts.push({
            x: this.scene.position.x,
            y: this.scene.position.y - 22,
            color: type === 'health' ? 0x9ee59e : 0xaec4ff,
            start: this.scene.time.now,
        });

        if (type === 'health') {
            return '+' + amount + ' PV.';
        }

        return '+' + amount + (this.ranged ? ' points de mana.' : ' points d’énergie.');
    }

    /**
     * Équipe ou retire l'arme sélectionnée et recalcule aussitôt les dégâts du personnage.
     */
    toggleWeapon(weapon) {
        if (weapon !== 'starter' && !this.progress.items[weapon]) {
            return 'Cette arme est absente du sac.';
        }

        this.progress.weapon = this.progress.weapon === weapon ? null : weapon;
        saveProgress(this.progressKey, this.progress);
        this.refreshProgress();
        this.refreshInventory();

        return this.equipped ? 'Arme équipée.' : 'Arme rangée.';
    }

    spendStatPoint(stat) {
        const previousMaxHealth = this.stats.maxHealth;
        const previousMaxMana = this.stats.maxMana;

        if (!allocateStat(this.progress, stat)) {
            return 'Aucun point de caractéristique disponible.';
        }

        this.refreshProgress();

        const healthGain = Math.max(0, this.stats.maxHealth - previousMaxHealth);
        const manaGain = Math.max(0, this.stats.maxMana - previousMaxMana);
        if (this.health > 0 && healthGain > 0) {
            this.health = Math.min(this.stats.maxHealth, this.health + healthGain);
        }
        if (this.health > 0 && manaGain > 0) {
            this.mana = Math.min(this.stats.maxMana, this.mana + manaGain);
        }

        saveProgress(this.progressKey, this.progress);
        this.refreshVitals();

        return (statLabels[stat] ?? stat) + ' augmentée (+1).';
    }

    spendSpellPoint(spell) {
        if (!upgradeSpell(this.progress, spell)) {
            return 'Aucun point de sort disponible.';
        }

        saveProgress(this.progressKey, this.progress);
        this.refreshProgress();

        const spellName = spell === 'special' ? this.rules.specialName : this.basicName;
        const rank = spell === 'special' ? this.stats.specialSpellRank : this.stats.basicSpellRank;

        return spellName + ' passe au rang ' + rank + '.';
    }

    spendTalentPoint(talentId) {
        const previousMaxHealth = this.stats.maxHealth;
        const previousMaxMana = this.stats.maxMana;

        if (!investTalent(this.progress, this.classKey, talentId)) {
            return 'Impossible d’investir dans ce talent (prérequis ou points insuffisants).';
        }

        this.refreshProgress();

        const healthGain = Math.max(0, this.stats.maxHealth - previousMaxHealth);
        const manaGain = Math.max(0, this.stats.maxMana - previousMaxMana);
        if (this.health > 0 && healthGain > 0) {
            this.health = Math.min(this.stats.maxHealth, this.health + healthGain);
        }
        if (this.health > 0 && manaGain > 0) {
            this.mana = Math.min(this.stats.maxMana, this.mana + manaGain);
        }

        saveProgress(this.progressKey, this.progress);
        this.refreshVitals();
        this.refreshActionSlots();

        const found = findTalent(this.classKey, talentId);
        return found
            ? `${found.talent.name} (${getTalentRank(this.progress, talentId)}/${found.talent.maxRank}) appris.`
            : 'Talent amélioré.';
    }

    resetAllTalents() {
        const refunded = resetTalents(this.progress);
        if (refunded === 0) {
            return 'Aucun talent à réinitialiser.';
        }
        saveProgress(this.progressKey, this.progress);
        this.refreshProgress();
        this.health = Math.min(this.health, this.stats.maxHealth);
        this.mana = Math.min(this.mana, this.stats.maxMana);
        this.refreshVitals();
        this.refreshActionSlots();
        return `Talents réinitialisés (+${refunded} point${refunded > 1 ? 's' : ''} restitué${refunded > 1 ? 's' : ''}).`;
    }

    refreshInventory() {
        this.amounts.forEach((amount) => {
            amount.textContent = this.progress.items[amount.dataset.quantity];
        });

        this.potionButtons.forEach((button) => {
            button.disabled = this.health === 0;
        });

        this.weaponButtons.forEach((button) => {
            const weapon = button.dataset.weapon;
            button.textContent = weapon === this.progress.weapon ? 'Retirer' : 'Équiper';
            button.disabled = weapon !== 'starter' && !this.progress.items[weapon];
        });

        this.weaponStates.forEach((state) => {
            const weapon = state.dataset.weaponState;
            const equipped = weapon === this.progress.weapon;
            state.textContent = weapon === 'starter'
                ? (equipped ? 'Équipé · +' + this.rules.weaponBonus + ' dégâts de base' : 'Dans le sac')
                : (equipped ? '· Équipé' : '');
        });

        this.basicLabel.textContent = this.basicName;
        this.buttons[0].title = this.basicName
            + ' · ' + this.stats.basicDamage + ' dégâts'
            + ' · Portée : ' + this.rangeLabel;
    }

    get basicName() {
        return this.equipped || this.ranged ? this.rules.basicName : 'Coup de poing';
    }

    get equipped() {
        return this.progress.weapon !== null;
    }

    get weaponBonus() {
        const weapon = this.progress.weapon;
        if (weapon === 'starter') {
            return this.rules.weaponBonus;
        }
        return this.rules.loot[weapon]?.bonus ?? 0;
    }

    get equippedWeaponName() {
        const weapon = this.progress.weapon;
        if (weapon === null) return 'Mains nues';
        if (weapon === 'starter') return this.ranged ? 'Bâton de braise' : 'Épée de fer';
        return this.rules.loot[weapon]?.name ?? 'Aucune';
    }

    /**
     * Met à jour les 4 emplacements de sorts de talents dans la barre d'action.
     */
    refreshActionSlots() {
        const unlocked = getUnlockedActiveSpells(this.progress, this.classKey);
        this.talentSlotButtons.forEach((button, index) => {
            const talent = unlocked[index];
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
            const cost = Math.max(1, Math.round((talent.manaCost ?? 6) * (1 - (this.stats?.manaCostReduction ?? 0))));
            button.title = `${talent.name} · ${cost} ${this.rules.resourceName.toLowerCase()} · ${talent.description}`;
            if (iconEl) iconEl.className = `action-icon ${talent.icon}`;
            if (nameEl) nameEl.textContent = talent.name;
            if (metaEl) metaEl.textContent = `${cost} ${this.rules.resourceName.toLowerCase()}`;
        });
    }

    /**
     * Recalcule les statistiques complètes du personnage et met à jour ATH, barre d'actions, fiche et talents.
     */
    refreshProgress() {
        const { level, xp } = this.progress;
        this.stats = computeCharacterStats(this.rules, this.progress, this.weaponBonus);

        this.meters[0].meter.max = this.stats.maxHealth;
        this.meters[1].meter.max = this.stats.maxMana;
        this.levelLabel.textContent = level;
        this.xpMeter.max = xpRequired(level);
        this.xpMeter.value = xp;
        this.xpLabel.textContent = xp + ' / ' + this.xpMeter.max;

        if (this.manaRegenLabel) {
            this.manaRegenLabel.textContent = regenFormatter.format(this.stats.manaRegenPerSec);
        }

        if (this.basicMetaLabel) {
            this.basicMetaLabel.textContent = 'Rg ' + this.stats.basicSpellRank + ' · ' + this.stats.basicDamage + ' dég.';
        }

        if (this.specialMetaLabel) {
            const cost = Math.max(1, Math.round(this.rules.specialManaCost * (1 - (this.stats.manaCostReduction ?? 0))));
            this.specialMetaLabel.textContent = cost + ' ' + this.rules.resourceName.toLowerCase() + ' · ' + this.stats.specialDamage + ' dég.';
        }

        this.buttons[0].title = this.basicName
            + ' · Rang ' + this.stats.basicSpellRank
            + ' · ' + this.stats.basicDamage + ' dégâts'
            + ' · Portée : ' + this.rangeLabel;
        this.buttons[1].title = this.rules.specialName
            + ' · Rang ' + this.stats.specialSpellRank
            + ' · ' + this.stats.specialDamage + ' dégâts'
            + ' · ' + this.rules.specialManaCost + ' ' + this.rules.resourceName.toLowerCase()
            + ' · Portée : ' + this.rangeLabel;

        this.refreshActionSlots();
        this.refreshCharacterSheet();
        this.renderTalentTree();
    }

    refreshCharacterSheet() {
        if (!this.stats) return;

        if (this.characterPointsBadge) {
            const pts = this.stats.statPoints;
            if (pts > 0) {
                this.characterPointsBadge.textContent = '+' + pts;
                this.characterPointsBadge.dataset.hasPoints = 'true';
            } else {
                this.characterPointsBadge.textContent = '';
                this.characterPointsBadge.dataset.hasPoints = 'false';
            }
        }

        if (this.talentPointsBadge) {
            const sPts = this.stats.spellPoints;
            if (sPts > 0) {
                this.talentPointsBadge.textContent = '+' + sPts;
                this.talentPointsBadge.dataset.hasPoints = 'true';
            } else {
                this.talentPointsBadge.textContent = '';
                this.talentPointsBadge.dataset.hasPoints = 'false';
            }
        }

        const regenText = '+' + regenFormatter.format(this.stats.manaRegenPerSec) + '/s';
        if (this.sheetLevelLabel) this.sheetLevelLabel.textContent = String(this.stats.level);
        if (this.sheetXpLabel) this.sheetXpLabel.textContent = this.progress.xp + ' / ' + xpRequired(this.stats.level);
        if (this.sheetWeaponLabel) this.sheetWeaponLabel.textContent = this.equippedWeaponName;
        if (this.sheetMaxHealthLabel) this.sheetMaxHealthLabel.textContent = String(this.stats.maxHealth);
        if (this.sheetMaxManaLabel) this.sheetMaxManaLabel.textContent = String(this.stats.maxMana);
        if (this.sheetManaRegenLabel) this.sheetManaRegenLabel.textContent = regenText;
        if (this.sheetBasicDamageLabel) this.sheetBasicDamageLabel.textContent = this.stats.basicDamage + ' dégâts';
        if (this.sheetSpecialDamageLabel) this.sheetSpecialDamageLabel.textContent = this.stats.specialDamage + ' dégâts';
        if (this.sheetRangeLabel) this.sheetRangeLabel.textContent = this.rangeLabel;

        if (this.statPointsLabel) {
            const count = this.stats.statPoints;
            this.statPointsLabel.textContent = count + (count > 1 ? ' points disponibles' : ' point disponible');
        }
        if (this.spellPointsLabel) {
            const count = this.stats.spellPoints;
            this.spellPointsLabel.textContent = count + (count > 1 ? ' points disponibles' : ' point disponible');
        }

        for (const key of statKeys) {
            const detail = this.stats.attributes[key];
            if (this.statTotals[key]) this.statTotals[key].textContent = String(detail.total);
            if (this.statDetails[key]) {
                this.statDetails[key].textContent = 'Base ' + detail.base
                    + ' · Naturel +' + detail.natural
                    + ' · Investi +' + detail.allocated;
            }
        }

        this.statButtons.forEach((button) => {
            button.disabled = this.stats.statPoints <= 0;
        });

        const basicStep = this.rules.basicSpellRankBonus ?? 3;
        const specialStep = this.rules.specialSpellRankBonus ?? 5;
        if (this.spellRanks.basic) this.spellRanks.basic.textContent = 'Rang ' + this.stats.basicSpellRank;
        if (this.spellRanks.special) this.spellRanks.special.textContent = 'Rang ' + this.stats.specialSpellRank;
        if (this.spellDamages.basic) {
            this.spellDamages.basic.textContent = this.stats.basicDamage + ' dégâts actuels (+' + basicStep + ' par rang)';
        }
        if (this.spellDamages.special) {
            this.spellDamages.special.textContent = this.stats.specialDamage
                + ' dégâts actuels (+' + specialStep + ' par rang · Coût : '
                + this.rules.specialManaCost + ' ' + this.rules.resourceName.toLowerCase() + ')';
        }

        this.spellButtons.forEach((button) => {
            button.disabled = this.stats.spellPoints <= 0;
        });
    }

    /**
     * Génère et met à jour l'arbre de talents à 3 branches (style RPG classique).
     */
    renderTalentTree() {
        if (!this.talentTreeRoot) return;
        const tree = talentTrees[this.classKey];
        if (!tree) return;

        if (this.talentPointsModalLabel) {
            const pts = this.stats?.spellPoints ?? this.progress.spellPoints ?? 0;
            this.talentPointsModalLabel.textContent = `${pts} point${pts > 1 ? 's' : ''} de talent disponible${pts > 1 ? 's' : ''}`;
        }

        this.talentTreeRoot.innerHTML = '';

        for (const branch of tree.branches) {
            const branchPts = getBranchPoints(this.progress, branch);
            const colEl = document.createElement('section');
            colEl.className = 'talent-branch';
            colEl.style.setProperty('--branch-accent', branch.accent);

            const header = document.createElement('header');
            header.className = 'talent-branch-header';
            header.innerHTML = `
                <div>
                    <h3>${branch.name}</h3>
                    <small>${branch.subtitle}</small>
                </div>
                <span class="branch-points-badge">${branchPts} pts</span>
            `;
            colEl.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'talent-grid';

            // Lignes de connexion SVG entre talents prérequis et enfants
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
                const active = getTalentRank(this.progress, parent.id) > 0;
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
                const rank = getTalentRank(this.progress, talent.id);
                const maxed = rank >= talent.maxRank;
                const available = canInvestTalent(this.progress, this.classKey, talent.id);
                const state = maxed ? 'maxed' : (rank > 0 ? 'invested' : (available ? 'available' : 'locked'));

                const node = document.createElement('button');
                node.type = 'button';
                node.className = `talent-node talent-${state}`;
                node.style.gridRow = String(talent.tier + 1);
                node.style.gridColumn = String(talent.col + 1);
                node.dataset.talentId = talent.id;
                node.innerHTML = `
                    <span class="talent-kind">${talent.type === 'active' ? 'SORT' : 'PASSIF'}</span>
                    <span class="action-icon ${talent.icon}" aria-hidden="true"></span>
                    <span class="talent-rank">${rank}/${talent.maxRank}</span>
                `;

                const showTip = () => {
                    if (!this.talentTooltip) return;
                    const reqText = talent.minBranchPoints
                        ? `Prérequis : ${talent.minBranchPoints} pts dans ${branch.name}`
                        : 'Palier de base';
                    this.talentTooltip.innerHTML = `
                        <strong>${talent.name}</strong>
                        <span class="tooltip-type">${talent.type === 'active' ? 'Sort actif' : 'Bonus passif'} · Rang ${rank}/${talent.maxRank}</span>
                        <p>${talent.description}</p>
                        <small>${reqText}</small>
                    `;
                };

                node.addEventListener('mouseenter', showTip);
                node.addEventListener('focus', showTip);
                node.addEventListener('click', () => {
                    showTip();
                    const msg = this.spendTalentPoint(talent.id);
                    if (this.talentStatusLabel) {
                        this.talentStatusLabel.textContent = msg;
                    }
                });

                grid.appendChild(node);
            }

            colEl.appendChild(grid);
            this.talentTreeRoot.appendChild(colEl);
        }
    }

    /**
     * Applique les dégâts d'une attaque sur la cible et gère la riposte ou la défaite.
     */
    resolveAttack(attack, now) {
        const target = attack.target;
        if (!target || !target.isAlive) {
            return;
        }
        if (!this.ranged) {
            this.recovery = { ...attack, start: now };
        }
        if (!this.ranged && this.distanceTo(target) > this.range) {
            this.tell(`${target.name} est hors de portée. Portée : ${this.rangeLabel}.`);
            return;
        }

        this.applyDamageToMonster(target, attack.damage, attack.name, attack.color, now);
    }

    applyDamageToMonster(monster, rawDamage, attackName, color, now) {
        if (!monster.isAlive) return;
        const damage = Math.min(rawDamage, monster.health);
        monster.health -= damage;
        monster.syncOverlays();

        if (this.selectedMonster === monster) {
            this.refreshTargetHud();
        }

        this.impacts.push({
            x: monster.sprite.x,
            y: monster.sprite.y - 14,
            color,
            start: now,
        });

        if (monster.health <= 0) {
            this.defeatMonster(monster, now);
            return;
        }

        monster.pursue();
        this.tell(`${attackName} · ${damage} dégâts sur ${monster.name} (N.${monster.level}).`);
    }

    /**
     * Crédite l'XP adaptée au niveau du monstre, le butin et la montée de niveau.
     */
    defeatMonster(monster, now) {
        if (!monster.sprite.visible) return;
        monster.hide();
        monster.respawnAt = now + monster.template.respawnMs;

        if (this.selectedMonster === monster) {
            this.targetHud.hidden = true;
            this.selectedMonster = null;
        }

        const { item, levelUp } = awardVictory(this.progress, this.rules.loot, Math.random, monster.xpReward);
        recordTrailQuestDefeat(this.progress.trailQuest, monster.species);
        saveProgress(this.progressKey, this.progress);
        this.refreshProgress();
        this.refreshInventory();

        if (levelUp) {
            this.health = this.meters[0].meter.max;
            this.mana = this.meters[1].meter.max;
            this.manaCarry = 0;
            this.refreshVitals();
        }

        const loot = this.rules.loot[item];
        const levelUpText = levelUp
            ? ` · Niveau ${this.progress.level} ! (+3 stats, +1 talent)`
            : '';
        this.tell(`${monster.name} (N.${monster.level}) vaincu · +${monster.xpReward} XP · ${loot.name}${levelUpText}`);
    }

    /**
     * Résout une auto-attaque ciblée, puis respecte le temps de recharge du monstre.
     */
    updateMonsterCounter(monster, now) {
        if (!monster.isAlive || this.health <= 0) return;
        if (now < monster.stunUntil || !monster.alert
            || !inZone(monster.template.zone, this.scene.position.x, this.scene.position.y)) {
            monster.cancelAttack();
            return;
        }

        if (monster.attackEndsAt) {
            if (now < monster.attackEndsAt) return;
            monster.attackEndsAt = 0;
            monster.sprite.clearTint();

            if (!monster.canAttack(this.scene.position)) {
                this.tell(`Tu as esquivé l’attaque de ${monster.name}.`);
                return;
            }

            const reduction = 1 - (this.stats.damageReduction ?? 0);
            const taken = Math.max(1, Math.round(monster.stats.damage * reduction));
            this.health = Math.max(0, this.health - taken);
            this.impacts.push({
                x: this.scene.position.x,
                y: this.scene.position.y - 17,
                color: 0xf78863,
                start: now,
            });
            this.refreshVitals();

            if (this.health === 0) {
                this.scene.avatar.setTint(0xbb6666);
                this.finish(`${monster.name} (N.${monster.level}) t’a vaincu. Relève-toi au camp.`);
                return;
            }

            this.tell(`${monster.name} t’inflige ${taken} dégâts.`);
            return;
        }

        if (now >= monster.counterAt && monster.canAttack(this.scene.position)) {
            monster.startAttack(this.scene.position, now);
            monster.counterAt = now + monster.stats.attackIntervalMs;
        }
    }

    /**
     * Dessine les animations d'attaques et d'impacts en pixel art sur la scène.
     */
    drawEffects(now) {
        const enemyAttacking = this.monsters.some(monster => monster.attackVisual && now < monster.attackVisual.end + recoveryMs);
        if (!this.pending && !this.recovery && this.impacts.length === 0 && !enemyAttacking) {
            this.effect.clear();
            return;
        }

        this.effect.clear();
        this.drawMonsterAttacks(now);
        this.impacts = this.impacts.filter((hit) => now - hit.start < impactMs);
        const still = this.scene.motionPreference.matches;

        for (const hit of this.impacts) {
            const progress = Math.max(0, (now - hit.start) / impactMs);
            const spread = still ? 0.65 : 0.45 + 0.9 * (1 - (1 - progress) ** 2);
            this.effect.fillStyle(hit.color, 1 - progress);
            for (const [dx, dy] of sparks) {
                this.effect.fillRect(Math.round(hit.x + dx * spread), Math.round(hit.y + dy * spread), 2, 2);
            }
            if (progress < 0.35) {
                this.effect.fillStyle(0xffe3a6, 0.78 - progress);
                this.effect.fillRect(Math.round(hit.x) - 2, Math.round(hit.y) - 2, 4, 4);
            }
        }

        if (this.recovery) {
            const progress = (now - this.recovery.start) / recoveryMs;
            if (progress < 1) {
                this.drawMelee(this.recovery, progress, false);
            } else {
                this.recovery = null;
            }
        }

        if (!this.pending) {
            return;
        }

        const attack = this.pending;
        const target = attack.target;
        const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
        if (this.ranged && target) {
            const elapsed = now - attack.start;
            const travel = Math.max(0, (elapsed - attack.castMs) / (attack.end - attack.start - attack.castMs));
            if (elapsed < attack.castMs) {
                attack.x = this.scene.position.x + Math.cos(attack.angle) * 7;
                attack.y = this.scene.position.y - 20 + Math.sin(attack.angle) * 4;
                if (attack.armed) {
                    this.effect.fillStyle(0x916b52, 1);
                    this.strokePixels(attack.x, attack.y + 11, -1.35, 16, 2);
                }
            }
            const dx = target.sprite.x - attack.x;
            const dy = target.sprite.y - 12 - attack.y;
            for (let index = 3; index > 0; index--) {
                const tail = Math.max(0, travel - index * 0.055);
                this.effect
                    .fillStyle(attack.color, 0.6 - index * 0.12)
                    .fillRect(Math.round(attack.x + dx * tail) - 1, Math.round(attack.y + dy * tail) - 1, 3, 3);
            }
            const x = Math.round(attack.x + dx * travel);
            const y = Math.round(attack.y + dy * travel);
            const size = elapsed < attack.castMs ? 1 + Math.floor((elapsed / attack.castMs) * 2) : (attack.special ? 4 : 3);
            const core = Math.max(1, size * 2 - 2);
            this.effect
                .fillStyle(attack.color, 1)
                .fillRect(x - size + 1, y - size, core, size * 2)
                .fillRect(x - size, y - size + 1, size * 2, core);
            this.effect.fillStyle(attack.special ? 0xffe1a0 : 0xf3eaff, 1).fillRect(x - 1, y - 1, 2, 2);
            if (attack.special && !still) {
                this.orbitSparks(x, y, elapsed);
            }
        } else {
            this.drawMelee(attack, progress, true);
        }
    }

    drawMonsterAttacks(now) {
        for (const monster of this.monsters) {
            const attack = monster.attackVisual;
            if (!monster.isAlive || !attack || now >= attack.end + recoveryMs) continue;
            const elapsed = now - attack.start;
            const color = monster.species === 'dragon' ? 0x7bdef2 : 0xffba87;
            this.effect.fillStyle(color, .9);
            if (monster.species === 'dragon') {
                const progress = Math.max(0, Math.min(1, (now - attack.castEnd) / (attack.end - attack.castEnd)));
                const x = attack.x + (this.scene.position.x - attack.x) * progress;
                const y = attack.y + (this.scene.position.y - 17 - attack.y) * progress;
                this.effect.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
                this.effect.fillStyle(0xe3ffff, 1).fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
            } else {
                const progress = Math.min(1, elapsed / (attack.end - attack.start));
                const angle = attack.angle + (this.scene.motionPreference.matches ? 0 : -.65 + progress * 1.3);
                this.strokePixels(attack.x, attack.y, angle, 8 + progress * 12, 2);
            }
        }
    }

    drawMelee(attack, progress, windingUp) {
        const still = this.scene.motionPreference.matches;
        const angle = attack.angle + (still
            ? (windingUp ? -1 : 0.4)
            : (windingUp ? -0.35 - 0.95 * progress : -1.25 + 2.55 * progress));
        const x = this.scene.position.x + Math.cos(attack.angle) * 5;
        const y = this.scene.position.y - 19;
        const length = attack.armed ? (attack.special ? 21 : 17) : 7;

        if (attack.armed) {
            this.effect.fillStyle(0x443443, 1);
            this.strokePixels(x, y, angle, length, 3);
            this.effect.fillStyle(windingUp ? 0xc2af8d : attack.color, 1);
            this.strokePixels(x, y, angle, length, 1);
        } else {
            this.effect
                .fillStyle(0xe8ad84, 1)
                .fillRect(Math.round(x + Math.cos(angle) * length) - 2, Math.round(y + Math.sin(angle) * length * 0.65) - 2, 4, 4);
        }

        if (!windingUp && !still) {
            this.effect.fillStyle(attack.color, 0.85 * (1 - progress));
            for (let step = 0; step < 7; step++) {
                const trail = angle - step * 0.12;
                this.effect.fillRect(
                    Math.round(x + Math.cos(trail) * length) - 1,
                    Math.round(y + Math.sin(trail) * length * 0.65) - 1,
                    3,
                    3,
                );
            }
        }
    }

    strokePixels(x, y, angle, length, width) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle) * 0.65;
        for (let step = 0; step <= length; step++) {
            const inset = Math.floor(width / 2);
            this.effect.fillRect(Math.round(x + dx * step) - inset, Math.round(y + dy * step) - inset, width, width);
        }
    }

    orbitSparks(x, y, elapsed) {
        this.effect.fillStyle(0xf7b75f, 0.8);
        for (let index = 0; index < 3; index++) {
            const angle = elapsed / 41 + index * 2.1;
            this.effect.fillRect(Math.round(x + Math.cos(angle) * 6), Math.round(y + Math.sin(angle) * 5), 2, 2);
        }
    }

    attackPose(now) {
        const attack = this.attackVisual;
        if (!attack) {
            return null;
        }

        const strike = this.ranged ? attack.start + attack.castMs : attack.end;
        if (now >= strike + recoveryMs) {
            return null;
        }
        if (now < strike) {
            return {
                attack,
                pose: 'windup',
                frame: Math.max(0, Math.floor((4 * (now - attack.start)) / (strike - attack.start))),
            };
        }

        return {
            attack,
            pose: 'release',
            frame: 4 + Math.floor((5 * (now - strike)) / recoveryMs),
        };
    }

    distanceTo(monster) {
        return Math.hypot(monster.sprite.x - this.scene.position.x, monster.sprite.y - this.scene.position.y);
    }

    finish(message) {
        this.pending = null;
        this.attackVisual = null;
        this.monsters.forEach((m) => {
            m.alert = false;
            m.path = [];
            m.cancelAttack();
        });
        this.buttons.forEach((button) => {
            button.disabled = true;
        });
        this.refreshInventory();
        this.resetButton.hidden = false;
        this.tell(message);
    }

    refreshTargetHud() {
        const target = this.selectedMonster;
        if (!target || !target.isAlive) {
            this.targetHud.hidden = true;
            return;
        }
        this.targetHud.hidden = false;
        if (this.targetNameLabel) this.targetNameLabel.textContent = target.name;
        if (this.targetLevelLabel) this.targetLevelLabel.textContent = 'Niv. ' + target.level;
        this.meters[2].meter.max = target.maxHealth;
        this.meters[2].meter.value = target.health;
        this.meters[2].value.textContent = target.health + ' / ' + target.maxHealth;
    }

    refreshVitals() {
        [this.health, this.mana].forEach((amount, index) => {
            const { meter, value } = this.meters[index];
            meter.value = amount;
            value.textContent = amount + ' / ' + meter.max;
        });
        this.refreshTargetHud();
    }

    tell(message) {
        if (this.status.textContent !== message) {
            this.status.textContent = message;
        }
    }
}
