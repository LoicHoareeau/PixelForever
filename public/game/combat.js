import {
    allocateStat,
    awardVictory,
    computeCharacterStats,
    loadProgress,
    regenerateResource,
    saveProgress,
    statKeys,
    upgradeSpell,
    victoryXp,
    xpRequired,
} from './progression.js';

// Paramètres de l'arène d'entraînement face à Saphyr
const counterRadius = 36;
const warningMs = 850;
const counterIntervalMs = 2100;
const counterDamage = 9;
const respawnMs = 5000;
const impactMs = 190;
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
 * Gère le combat en temps réel, l'ATH, les potions, l'équipement,
 * la régénération automatique et la fiche de caractéristiques/sorts.
 */
export class TrainingCombat {
    constructor(scene, dragon, rules, tileSize) {
        this.scene = scene;
        this.dragon = dragon;
        this.target = dragon.sprite;
        this.rules = rules;
        this.progressKey = 'pixelforever:progress:' + rules.progressKey;
        this.progress = loadProgress(this.progressKey, rules.level);
        this.respawnAt = Infinity;
        this.manaCarry = 0;
        this.ranged = rules.ranged;
        this.range = rules.range * tileSize;
        this.rangeLabel = numberFormatter.format(rules.range) + (rules.range < 2 ? ' case' : ' cases');

        // Références de l'ATH principal et de la barre d'actions
        this.status = document.getElementById('combat-status');
        this.resetButton = document.getElementById('combat-reset');
        this.targetHud = document.getElementById('combat-target');
        this.combatActions = document.getElementById('combat-actions');
        this.buttons = [...document.querySelectorAll('[data-attack]')];
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

        // Références de la fiche de personnage, des stats et des sorts
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

        this.warning = scene.add.graphics().setDepth(1);
        this.effect = scene.add.graphics().setDepth(321);

        this.reset();
        document.getElementById('combat-vitals').hidden = false;
        this.combatActions.hidden = false;
    }

    /**
     * Réinitialise l'affrontement sans effacer la progression sauvegardée du personnage.
     */
    reset() {
        this.respawnAt = Infinity;
        this.manaCarry = 0;
        this.refreshProgress();
        this.health = this.meters[0].meter.max;
        this.mana = this.meters[1].meter.max;
        this.targetHealth = this.meters[2].meter.max;
        this.readyAt = 0;
        this.cooldownStart = 0;
        this.counterAt = Infinity;
        this.warningEndsAt = 0;
        this.impacts = [];
        this.pending = null;
        this.recovery = null;
        this.attackVisual = null;
        this.warning.clear();
        this.effect.clear();
        this.scene.avatar.clearTint();
        this.dragon.place(this.dragon.home);
        this.targetHud.hidden = true;
        this.buttons.forEach((button) => {
            button.disabled = false;
        });
        this.resetButton.hidden = true;
        this.refreshVitals();
        this.refreshInventory();
        this.updateCooldown(0);
        this.tell('Approche-toi de Saphyr pour l’affronter.');
    }

    /**
     * Déclenche une attaque de base ou une compétence si portée, recharge et ressource le permettent.
     */
    attack(kind, now) {
        if (this.health === 0) {
            return;
        }
        if (this.targetHealth === 0) {
            this.tell('Saphyr va bientôt réapparaître.');
            return;
        }
        if (this.pending || now < this.readyAt) {
            this.tell('L’attaque est en cours ou en recharge.');
            return;
        }
        if (this.targetDistance() > this.range) {
            this.tell('Saphyr est hors de portée. Portée : ' + this.rangeLabel + '.');
            return;
        }

        const special = kind === 'special';
        if (special && this.mana < this.rules.specialManaCost) {
            this.tell(this.rules.resourceName + ' : réserve insuffisante. L’attaque de base est disponible.');
            return;
        }

        if (special) {
            this.mana -= this.rules.specialManaCost;
            this.refreshVitals();
        }

        this.targetHud.hidden = false;
        this.cooldownStart = now;
        this.readyAt = now + this.rules.cooldownMs;
        this.scene.face(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);

        const duration = this.ranged ? (special ? 410 : 260) : (special ? 550 : 140);
        const angle = Math.atan2(this.target.y - this.scene.position.y, this.target.x - this.scene.position.x);
        const attack = {
            color: special ? 0xff942f : this.ranged ? 0xb5b8ff : 0xffefd0,
            damage: special ? this.stats.specialDamage : this.stats.basicDamage,
            name: special ? this.rules.specialName : this.basicName,
            special,
            armed: this.equipped,
            angle,
            facing: this.scene.facing,
            start: now,
            end: now + duration,
            castMs: special ? 110 : 55,
            x: this.scene.position.x + Math.cos(angle) * 7,
            y: this.scene.position.y - 20 + Math.sin(angle) * 4,
        };

        this.pending = attack;
        this.attackVisual = attack;
        this.tell(attack.name + ' en cours.');
    }

    /**
     * Met à jour le combat, la réapparition, la régénération automatique et les effets visuels.
     */
    update(now, delta) {
        if (now >= this.respawnAt) {
            this.respawnAt = Infinity;
            this.dragon.respawn(this.scene.position);
            this.targetHealth = this.meters[2].meter.max;
            this.refreshVitals();
            this.tell('Saphyr est réapparu ailleurs dans Val-des-Saules.');
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

        if (this.health > 0 && this.targetHealth > 0) {
            this.updateCounter(now);
        }

        this.dragon.update(now, delta, this.scene.position);
        this.drawEffects(now);
        this.updateCooldown(now);
    }

    /**
     * Met à jour l'indicateur visuel de temps de recharge sur la barre d'actions.
     */
    updateCooldown(now) {
        const end = Math.max(this.readyAt, this.pending?.end ?? 0);
        const remaining = Math.max(0, end - now);
        const percent = remaining ? Math.ceil((100 * remaining) / (end - this.cooldownStart)) : 0;
        if (percent === this.cooldownPercent) {
            return;
        }
        this.cooldownPercent = percent;
        this.combatActions.style.setProperty('--cooldown', percent + '%');
    }

    /**
     * Consomme une potion de vie ou de mana/énergie depuis l'inventaire ou la barre d'action.
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

    /**
     * Investit un point de caractéristique et augmente les PV/Mana courants si le maximum progresse.
     */
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

    /**
     * Dépense un point de sort pour améliorer l'attaque de base ou le sort spécial.
     */
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

    /**
     * Met à jour les quantités et l'état équipé des objets dans la modale d'inventaire.
     */
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
        if (weapon === null) {
            return 'Mains nues';
        }
        if (weapon === 'starter') {
            return this.ranged ? 'Bâton de braise' : 'Épée de fer';
        }

        return this.rules.loot[weapon]?.name ?? 'Aucune';
    }

    /**
     * Recalcule les statistiques complètes du personnage et met à jour ATH, barre d'actions et fiche.
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
            this.basicMetaLabel.textContent = 'Rang ' + this.stats.basicSpellRank + ' · ' + this.stats.basicDamage + ' dég.';
        }

        if (this.specialMetaLabel) {
            this.specialMetaLabel.textContent = this.rules.specialManaCost + ' '
                + this.rules.resourceName.toLowerCase() + ' · ' + this.stats.specialDamage + ' dég.';
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

        this.refreshCharacterSheet();
    }

    /**
     * Actualise les valeurs affichées dans la fiche de personnage, de caractéristiques et de sorts.
     */
    refreshCharacterSheet() {
        if (!this.stats) {
            return;
        }

        const totalPoints = this.stats.statPoints + this.stats.spellPoints;
        if (this.characterPointsBadge) {
            if (totalPoints > 0) {
                this.characterPointsBadge.textContent = '+' + totalPoints + (totalPoints > 1 ? ' pts' : ' pt');
                this.characterPointsBadge.dataset.hasPoints = 'true';
            } else {
                this.characterPointsBadge.textContent = 'Fiche & Stats';
                this.characterPointsBadge.dataset.hasPoints = 'false';
            }
        }

        const regenText = '+' + regenFormatter.format(this.stats.manaRegenPerSec) + '/s';
        if (this.sheetLevelLabel) {
            this.sheetLevelLabel.textContent = String(this.stats.level);
        }
        if (this.sheetXpLabel) {
            this.sheetXpLabel.textContent = this.progress.xp + ' / ' + xpRequired(this.stats.level);
        }
        if (this.sheetWeaponLabel) {
            this.sheetWeaponLabel.textContent = this.equippedWeaponName;
        }
        if (this.sheetMaxHealthLabel) {
            this.sheetMaxHealthLabel.textContent = String(this.stats.maxHealth);
        }
        if (this.sheetMaxManaLabel) {
            this.sheetMaxManaLabel.textContent = String(this.stats.maxMana);
        }
        if (this.sheetManaRegenLabel) {
            this.sheetManaRegenLabel.textContent = regenText;
        }
        if (this.sheetBasicDamageLabel) {
            this.sheetBasicDamageLabel.textContent = this.stats.basicDamage + ' dégâts';
        }
        if (this.sheetSpecialDamageLabel) {
            this.sheetSpecialDamageLabel.textContent = this.stats.specialDamage + ' dégâts';
        }
        if (this.sheetRangeLabel) {
            this.sheetRangeLabel.textContent = this.rangeLabel;
        }

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
            if (this.statTotals[key]) {
                this.statTotals[key].textContent = String(detail.total);
            }
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
        if (this.spellRanks.basic) {
            this.spellRanks.basic.textContent = 'Rang ' + this.stats.basicSpellRank;
        }
        if (this.spellRanks.special) {
            this.spellRanks.special.textContent = 'Rang ' + this.stats.specialSpellRank;
        }
        if (this.spellDamages.basic) {
            this.spellDamages.basic.textContent = this.stats.basicDamage
                + ' dégâts actuels (+' + basicStep + ' par rang)';
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
     * Applique les dégâts d'une attaque à Saphyr et déclenche sa riposte ou sa défaite.
     */
    resolveAttack(attack, now) {
        if (this.targetHealth === 0) {
            return;
        }
        if (!this.ranged) {
            this.recovery = { ...attack, start: now };
        }
        if (!this.ranged && this.targetDistance() > this.range) {
            this.tell('Saphyr est hors de portée. Portée : ' + this.rangeLabel + '.');
            return;
        }

        const damage = Math.min(attack.damage, this.targetHealth);
        this.targetHealth -= damage;
        this.refreshVitals();
        this.impacts.push({
            x: this.target.x,
            y: this.target.y - 20,
            color: attack.color,
            start: now,
        });

        if (this.targetHealth === 0) {
            this.defeatDragon(now);
            return;
        }

        this.dragon.pursue();
        if (this.counterAt === Infinity) {
            this.counterAt = now + 450;
        }
        this.tell(attack.name + ' · ' + damage + ' dégâts.');
    }

    /**
     * Crédite l'XP, le butin et la montée de niveau lorsque Saphyr est vaincu.
     */
    defeatDragon(now) {
        this.dragon.hide();
        this.respawnAt = now + respawnMs;
        this.warningEndsAt = 0;
        this.counterAt = Infinity;
        this.warning.clear();
        this.targetHud.hidden = true;

        const { item, levelUp } = awardVictory(this.progress, this.rules.loot);
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
            ? ' · Niveau ' + this.progress.level + ' ! (+3 pts stats, +1 pt sort)'
            : '.';
        this.tell('Saphyr vaincu · +' + victoryXp + ' XP · ' + loot.name + ' (' + loot.rarity + ')' + levelUpText);
    }

    /**
     * Gère l'avertissement et l'impact du souffle de Saphyr.
     */
    updateCounter(now) {
        if (this.warningEndsAt) {
            if (now < this.warningEndsAt) {
                return;
            }
            this.warningEndsAt = 0;
            this.counterAt = now + counterIntervalMs;
            this.warning.clear();
            this.target.clearTint();

            if (this.targetDistance() > counterRadius) {
                this.tell('Tu as esquivé la riposte de Saphyr.');
                return;
            }

            this.health = Math.max(0, this.health - counterDamage);
            this.impacts.push({
                x: this.scene.position.x,
                y: this.scene.position.y - 17,
                color: 0xf78863,
                start: now,
            });
            this.refreshVitals();

            if (this.health === 0) {
                this.scene.avatar.setTint(0xbb6666);
                this.finish('Saphyr t’a vaincu. Relève-toi au camp.');
                return;
            }

            this.tell('La riposte de Saphyr te touche.');
            return;
        }

        if (now >= this.counterAt && this.targetDistance() <= counterRadius) {
            this.warningEndsAt = now + warningMs;
            this.dragon.breathe(this.scene.position, now, warningMs);
            this.warning.fillStyle(0x32cadd, .28).fillCircle(this.target.x, this.target.y, counterRadius);
            this.warning.lineStyle(2, 0x91e9ff, .95).strokeCircle(this.target.x, this.target.y, counterRadius);
            this.tell('Saphyr prépare son souffle. Sors du cercle !');
        }
    }

    /**
     * Dessine les animations d'attaques et d'impacts en pixel art sur la scène.
     */
    drawEffects(now) {
        if (!this.pending && !this.recovery && this.impacts.length === 0) {
            return;
        }

        this.effect.clear();
        this.impacts = this.impacts.filter((hit) => now - hit.start < impactMs);
        const still = this.scene.motionPreference.matches;

        for (const hit of this.impacts) {
            const progress = Math.max(0, (now - hit.start) / impactMs);
            const spread = still ? .65 : .45 + .9 * (1 - (1 - progress) ** 2);
            this.effect.fillStyle(hit.color, 1 - progress);
            for (const [dx, dy] of sparks) {
                this.effect.fillRect(Math.round(hit.x + dx * spread), Math.round(hit.y + dy * spread), 2, 2);
            }
            if (progress < .35) {
                this.effect.fillStyle(0xffe3a6, .78 - progress);
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
        const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
        if (this.ranged) {
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
            const dx = this.target.x - attack.x;
            const dy = this.target.y - 20 - attack.y;
            for (let index = 3; index > 0; index--) {
                const tail = Math.max(0, travel - index * .055);
                this.effect
                    .fillStyle(attack.color, .6 - index * .12)
                    .fillRect(Math.round(attack.x + dx * tail) - 1, Math.round(attack.y + dy * tail) - 1, 3, 3);
            }
            const x = Math.round(attack.x + dx * travel);
            const y = Math.round(attack.y + dy * travel);
            const size = elapsed < attack.castMs ? 1 + Math.floor((elapsed / attack.castMs) * 2) : attack.special ? 4 : 3;
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

    /**
     * Dessine le geste d'arme ou de coup de poing au corps à corps.
     */
    drawMelee(attack, progress, windingUp) {
        const still = this.scene.motionPreference.matches;
        const angle = attack.angle + (still
            ? (windingUp ? -1 : .4)
            : (windingUp ? -.35 - .95 * progress : -1.25 + 2.55 * progress));
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
                .fillRect(Math.round(x + Math.cos(angle) * length) - 2, Math.round(y + Math.sin(angle) * length * .65) - 2, 4, 4);
        }

        if (!windingUp && !still) {
            this.effect.fillStyle(attack.color, .85 * (1 - progress));
            for (let step = 0; step < 7; step++) {
                const trail = angle - step * .12;
                this.effect.fillRect(
                    Math.round(x + Math.cos(trail) * length) - 1,
                    Math.round(y + Math.sin(trail) * length * .65) - 1,
                    3,
                    3,
                );
            }
        }
    }

    /**
     * Trace un segment pixélisé orienté selon l'angle d'attaque.
     */
    strokePixels(x, y, angle, length, width) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle) * .65;
        for (let step = 0; step <= length; step++) {
            const inset = Math.floor(width / 2);
            this.effect.fillRect(Math.round(x + dx * step) - inset, Math.round(y + dy * step) - inset, width, width);
        }
    }

    /**
     * Anime les étincelles en orbite autour d'une boule de feu.
     */
    orbitSparks(x, y, elapsed) {
        this.effect.fillStyle(0xf7b75f, .8);
        for (let index = 0; index < 3; index++) {
            const angle = elapsed / 41 + index * 2.1;
            this.effect.fillRect(Math.round(x + Math.cos(angle) * 6), Math.round(y + Math.sin(angle) * 5), 2, 2);
        }
    }

    /**
     * Retourne la posture courante de l'avatar pendant une attaque.
     */
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

    targetDistance() {
        return Math.hypot(this.target.x - this.scene.position.x, this.target.y - this.scene.position.y);
    }

    /**
     * Met fin à l'entraînement lorsque le personnage tombe à 0 PV.
     */
    finish(message) {
        this.pending = null;
        this.attackVisual = null;
        this.warning.clear();
        this.target.clearTint();
        this.dragon.alert = false;
        this.dragon.path = [];
        this.buttons.forEach((button) => {
            button.disabled = true;
        });
        this.refreshInventory();
        this.resetButton.hidden = false;
        this.tell(message);
    }

    /**
     * Met à jour les jauges de vie, mana/énergie et vie de la cible dans l'ATH.
     */
    refreshVitals() {
        [this.health, this.mana, this.targetHealth].forEach((amount, index) => {
            const { meter, value } = this.meters[index];
            meter.value = amount;
            value.textContent = amount + ' / ' + meter.max;
        });
    }

    tell(message) {
        if (this.status.textContent !== message) {
            this.status.textContent = message;
        }
    }
}
