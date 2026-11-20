import { createMalakorTrial, isMalakorWaveHit, malakorPhases, malakorThresholds, malakorTrialInterval, malakorWave } from './malakor.js';
import { armorItems, armorSlots, awardArmor, toggleArmor } from './armor.js';
import {
    allocateStat,
    awardVictory,
    basicWeaponProfile,
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
    setProgressSync,
    statKeys,
    talentTrees,
    upgradeSpell,
    xpRequired,
} from './progression.js';
import { inZone } from './exploration.js';
import { recordTrailQuestDefeat } from './trail-quest.js';
import { createProgressSync } from './progress-sync.js';

const impactMs = 210;
const recoveryMs = 210;

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
const tabTargetMaxDistance = 560;

/**
 * Sélectionne la cible vivante suivante à portée autour du joueur par distance croissante.
 */
export function selectNextTarget(
    monsters,
    playerPosition,
    currentTarget = null,
    direction = 1,
    maxDistance = tabTargetMaxDistance,
) {
    if (!Array.isArray(monsters) || !playerPosition) {
        return null;
    }

    const candidates = monsters
        .map((monster, index) => {
            if (!monster || !monster.isAlive || !monster.sprite) {
                return null;
            }
            const distance = Math.hypot(
                monster.sprite.x - playerPosition.x,
                monster.sprite.y - playerPosition.y,
            );
            if (distance > maxDistance) {
                return null;
            }
            return { monster, distance, index };
        })
        .filter(Boolean)
        .sort((a, b) => (a.distance - b.distance) || (a.index - b.index))
        .map((entry) => entry.monster);

    if (candidates.length === 0) {
        return null;
    }

    const currentIndex = candidates.indexOf(currentTarget);
    if (currentIndex === -1) {
        return direction < 0 ? candidates[candidates.length - 1] : candidates[0];
    }

    const step = direction < 0 ? -1 : 1;
    const nextIndex = (currentIndex + step + candidates.length) % candidates.length;
    return candidates[nextIndex];
}

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
        this.progress = loadProgress(this.progressKey, rules.level, rules.progress);
        this.progressSync = createProgressSync(rules.progressUrl, rules.progressToken, state => {
            const status = document.getElementById('progress-save-status');
            status.dataset.state = state;
            status.textContent = state === 'saved' ? 'Niveau enregistré' : state === 'saving' ? 'Sauvegarde en cours…'
                : 'Sauvegarde impossible · nouvelle tentative en cours';
        });
        setProgressSync(this.progressSync);
        this.manaCarry = 0;
        this.ranged = rules.ranged;
        this.selectedMonster = monsters.find((m) => m.species === 'boar') ?? monsters[0];

        // Références de l'ATH principal et de la barre d'actions
        this.status = document.getElementById('combat-status');
        this.resetButton = document.getElementById('combat-reset');
        this.targetHud = document.getElementById('combat-target');
        this.targetNameLabel = document.getElementById('combat-target-name');
        this.targetLevelLabel = document.getElementById('combat-target-level');
        this.targetPhaseLabel = document.getElementById('combat-target-phase');
        this.castBar = document.getElementById('cast-bar');
        this.castBarName = document.getElementById('cast-bar-name');
        this.castBarMeter = document.getElementById('cast-bar-meter');
        this.castBarTime = document.getElementById('cast-bar-time');
        this.combatActions = document.getElementById('combat-actions');
        this.buttons = [...document.querySelectorAll('[data-attack]')];
        this.talentSlotButtons = [...document.querySelectorAll('[data-talent-slot]')];
        this.potionButtons = [...document.querySelectorAll('[data-potion]')];
        this.amounts = [...document.querySelectorAll('[data-quantity]')];
        this.weaponButtons = [...document.querySelectorAll('[data-weapon]')];
        this.weaponStates = [...document.querySelectorAll('[data-weapon-state]')];
        this.armorList = document.getElementById('inventory-armor');
        this.armorLabels = [...document.querySelectorAll('[data-sheet-armor]')];
        this.armorList?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-armor]');
            if (!button) return;
            const id = button.dataset.armor;
            const equipped = toggleArmor(this.progress, this.classKey, id);
            if (equipped === null) return;
            saveProgress(this.progressKey, this.progress);
            this.refreshProgress();
            this.health = Math.min(this.health, this.stats.maxHealth);
            this.mana = Math.min(this.mana, this.stats.maxMana);
            this.refreshVitals();
            this.refreshInventory();
            this.armorList.querySelector('[data-armor="' + id + '"]')?.focus();
            document.getElementById('inventory-status').textContent = armorItems[id].name + (equipped ? ' · Équipé' : ' · Retiré');
        });
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

        // Cooldowns individuels par compétence + buff Berserk + VFX et textes flottants
        this.spellCooldowns = new Map();
        this.berserkUntil = 0;
        this.spellEffects = [];
        this.damageNumbers = [];

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
        saveProgress(this.progressKey, this.progress);
    }

    get basicWeapon() {
        return basicWeaponProfile(this.rules, this.progress, this.stats, this.tileSize);
    }

    get basicRangeLabel() {
        return numberFormatter.format(this.basicWeapon.range / this.tileSize) + ' cases';
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

    /**
     * Fait tourner la cible sélectionnée entre les monstres vivants à proximité (Tab / Shift+Tab).
     */
    cycleTarget(direction = 1) {
        if (this.health <= 0) {
            return null;
        }

        const next = selectNextTarget(
            this.monsters,
            this.scene.position,
            this.selectedMonster,
            direction,
        );
        if (!next) {
            this.tell('Aucun ennemi à proximité.');
            return null;
        }

        this.selectMonster(next);
        this.tell(`Cible : ${next.name} (Niv. ${next.level}).`);
        return next;
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
        this.spellEffects = [];
        this.clearFloatingTexts();
        this.pending = null;
        this.recovery = null;
        this.attackVisual = null;
        this.effect.clear();
        this.scene.avatar.clearTint();
        this.scene?.cameraFeel?.reset?.();
        if (this.castBar) {
            this.castBar.hidden = true;
        }
        if (this.targetPhaseLabel) {
            this.targetPhaseLabel.hidden = true;
        }

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
        this.tell('Suis le sentier vers le littoral, le cimetière, les montagnes et les Terres dévastées (Tab pour cibler).');
    }

    /**
     * Déclenche une attaque de base, le sort spécial ou un sort débloqué par talent.
     */
    attack(kind, now) {
        if (this.health === 0) {
            return;
        }
        if (this.mustDodgeMalakor()) {
            this.tell('La Brèche recouvre l’arène. Rejoins une bande sûre.');
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

        const special = kind === 'special';
        const ranged = special ? this.ranged : this.basicWeapon.ranged;
        const range = special ? this.range : this.basicWeapon.range;
        const dist = this.distanceTo(target);
        if (dist > range) {
            this.tell(`${target.name} est hors de portée. Portée : ${numberFormatter.format(range / this.tileSize)} cases.`);
            return;
        }

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
        const baseDmg = special ? this.stats.specialDamage : this.basicWeapon.damage;
        const specialCastMs = special && ranged ? (this.rules.specialCastMs ?? 210) : 0;
        const castMs = ranged ? (special ? specialCastMs : 180) : 0;
        const flightMs = castMs >= 500 ? 260 : (special ? 170 : 150);
        const duration = ranged ? castMs + flightMs : (special ? 480 : 140);
        const angle = Math.atan2(target.sprite.y - this.scene.position.y, target.sprite.x - this.scene.position.x);

        const attack = {
            target,
            ranged,
            range,
            color: special ? 0xff942f : (ranged ? 0xb5b8ff : 0xffefd0),
            damage: Math.round(baseDmg * berserkMult),
            name: special ? this.rules.specialName : this.basicName,
            special,
            armed: this.equipped,
            staff: this.classKey === 'mage' && this.progress.weapon === 'rare',
            angle,
            facing: this.scene.facing,
            start: now,
            end: now + duration,
            castMs,
            interruptible: ranged && castMs >= 500,
            manaCost,
            slotKey: special ? 'special' : 'basic',
            x: this.scene.position.x + Math.cos(angle) * 7,
            y: this.scene.position.y - 20 + Math.sin(angle) * 4,
        };

        this.pending = attack;
        this.attackVisual = attack;
        this.refreshCastBar(now);
        this.tell(attack.name + ' sur ' + target.name + '...');
    }

    /**
     * Interrompt une incantation longue (1 s) lorsque le personnage se déplace et rembourse le mana.
     */
    cancelCastOnMove() {
        const pending = this.pending;
        if (!pending || !pending.interruptible) {
            return false;
        }
        const now = this.scene?.time?.now ?? pending.start;
        if (now >= pending.start + pending.castMs) {
            return false;
        }

        const maxMana = this.meters?.[1]?.meter?.max ?? Infinity;
        if (pending.manaCost > 0) {
            this.mana = Math.min(maxMana, this.mana + pending.manaCost);
        }
        if (pending.slotKey === 'special') {
            this.readyAt = 0;
            this.spellCooldowns?.delete?.('special');
        }
        this.pending = null;
        this.attackVisual = null;
        if (this.castBar) {
            this.castBar.hidden = true;
        }
        this.refreshVitals();
        this.tell('Incantation interrompue par le déplacement.');
        return true;
    }

    /**
     * Déclenche une zone de compétence sur le centre indiqué avec effets et secousse.
     */
    triggerAreaSpell(slot, name, center, damage, color, radius, now, slowMs = 0) {
        const hits = this.monsters.filter((m) => m.isAlive && Math.hypot(m.sprite.x - center.x, m.sprite.y - center.y) <= radius);
        if (hits.length === 0) {
            return false;
        }

        this.impacts.push({ x: center.x, y: center.y - 10, color, start: now });
        this.spellEffects?.push?.({
            kind: slot,
            x: center.x,
            y: center.y - 6,
            radius,
            color,
            start: now,
            duration: slot === 'fire_whirl' ? 680 : 560,
        });
        this.triggerShake(slot === 'fire_whirl' || slot === 'fire_wall' ? 'medium' : 'small');

        for (const m of hits) {
            if (slowMs > 0) {
                m.slowUntil = now + (m.isBoss ? Math.round(slowMs * 0.25) : slowMs);
            }
            this.applyDamageToMonster(m, damage, name, color, now, true);
        }
        return true;
    }

    /**
     * Exécute un sort actif débloqué via l'arbre de talents.
     */
    castTalentSpell(talent, now) {
        if (this.mustDodgeMalakor()) return;
        const cdInfo = this.spellCooldowns.get(talent.slot);
        if (cdInfo && now < cdInfo.end) {
            const left = ((cdInfo.end - now) / 1000).toFixed(1);
            this.tell(`${talent.name} en recharge (${left}s).`);
            return;
        }

        const castTimeMs = talent.castTimeMs ?? 0;
        if (castTimeMs > 0 && this.pending) {
            this.tell('Une incantation est déjà en cours.');
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
            this.spellEffects?.push?.({
                kind: 'berserk_aura',
                x: this.scene.position.x,
                y: this.scene.position.y - 14,
                radius: 26,
                color: 0xff6238,
                start: now,
                duration: 520,
            });
            this.triggerShake('small');
            this.refreshVitals();
            this.tell('Berserk activé ! +40 % de dégâts pendant 6s.');
            return;
        }

        const target = this.getActiveTarget();

        if (talent.slot !== 'cleave' && (!target || !target.isAlive)) {
            this.tell('Aucune cible à portée.');
            return;
        }

        // Vérification préalable de portée avant tout lancement (et avant incantation de 1 s)
        if (talent.slot === 'fire_whirl' || talent.slot === 'frost_nova') {
            if (this.distanceTo(target) > this.range) {
                this.tell(`${target.name} est hors de portée pour ${talent.name}.`);
                return;
            }
        } else if (talent.slot === 'fire_wall') {
            if (this.distanceTo(target) > this.range + 16) {
                this.tell(`${target.name} est hors de portée pour Mur de feu.`);
                return;
            }
        } else if (talent.slot === 'engage') {
            if (this.distanceTo(target) > 4.5 * this.tileSize) {
                this.tell(`${target.name} est trop loin pour Engagement.`);
                return;
            }
        } else if (talent.slot === 'shield_bash') {
            if (this.distanceTo(target) > this.range + 6) {
                this.tell(`${target.name} est hors de portée pour Coup de bouclier.`);
                return;
            }
        } else if (talent.slot === 'arcane_blast') {
            if (this.distanceTo(target) > this.range + 1.5 * this.tileSize) {
                this.tell(`${target.name} est hors de portée pour Déflagration.`);
                return;
            }
        }

        // Sorts de feu avec temps d'incantation de 1,0 s (annulables en se déplaçant)
        if (castTimeMs > 0) {
            this.mana -= manaCost;
            this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);
            const castState = {
                kind: 'talentCast',
                talent,
                target,
                manaCost,
                cdMs,
                berserkMult,
                ranged: true,
                facing: this.scene.facing,
                color: 0xff7b2f,
                name: talent.name,
                start: now,
                castMs: castTimeMs,
                end: now + castTimeMs,
                interruptible: true,
            };
            this.pending = castState;
            this.attackVisual = castState;
            this.refreshVitals();
            this.refreshCastBar(now);
            this.tell(`Incantation : ${talent.name}…`);
            return;
        }

        this.executeTalentImpact(talent, target, manaCost, cdMs, berserkMult, now);
    }

    executeTalentImpact(talent, target, manaCost, cdMs, berserkMult, now, alreadyPaid = false) {
        if (talent.slot === 'cleave' || talent.slot === 'fire_whirl' || talent.slot === 'frost_nova') {
            const rangedArea = talent.slot !== 'cleave';
            const center = rangedArea ? target.sprite : this.scene.position;
            const radius = talent.slot === 'cleave' ? 38 : 54;
            const color = talent.slot === 'frost_nova' ? 0x78ccf0 : (talent.slot === 'fire_whirl' ? 0xff7b2f : 0xffe09e);
            const mult = talent.slot === 'fire_whirl' ? 1.25 : (talent.slot === 'frost_nova' ? 0.75 : 0.95);
            const dmg = Math.round(this.stats.specialDamage * mult * berserkMult);
            const hasHit = this.monsters.some((m) => m.isAlive && Math.hypot(m.sprite.x - center.x, m.sprite.y - center.y) <= radius);
            if (!hasHit) {
                if (!alreadyPaid) {
                    this.tell(`Aucun ennemi à portée pour ${talent.name}.`);
                }
                return;
            }
            if (!alreadyPaid) {
                this.mana -= manaCost;
            }
            if (rangedArea) this.scene.face(center.x - this.scene.position.x, center.y - this.scene.position.y);
            this.setSlotCooldown(talent.slot, now, cdMs);
            this.triggerAreaSpell(talent.slot, talent.name, center, dmg, color, radius, now, talent.slot === 'frost_nova' ? 2500 : 0);
            this.refreshVitals();
            return;
        }

        if (talent.slot === 'engage') {
            if (!alreadyPaid) this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            const angle = Math.atan2(target.sprite.y - this.scene.position.y, target.sprite.x - this.scene.position.x);
            const destX = target.sprite.x - Math.cos(angle) * 14;
            const destY = target.sprite.y - Math.sin(angle) * 14;
            if (this.scene.canStand(destX, destY)) {
                this.scene.position.set(destX, destY);
            }
            this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);
            this.spellEffects?.push?.({
                kind: 'engage_slam',
                x: target.sprite.x,
                y: target.sprite.y - 6,
                radius: 26,
                color: 0xf0a64b,
                start: now,
                duration: 420,
            });
            this.triggerShake('small');
            const dmg = Math.round(this.stats.specialDamage * 1.15 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0xf0a64b, now, true);
            this.refreshVitals();
            return;
        }

        if (talent.slot === 'shield_bash') {
            if (!alreadyPaid) this.mana -= manaCost;
            this.setSlotCooldown(talent.slot, now, cdMs);
            target.stunUntil = now + (target.isBoss ? 500 : 2000);
            if (!target.trial) target.cancelAttack();
            this.spellEffects?.push?.({
                kind: 'shield_wave',
                x: target.sprite.x,
                y: target.sprite.y - 10,
                radius: 24,
                color: 0x9be0de,
                start: now,
                duration: 420,
            });
            this.triggerShake('small');
            const dmg = Math.round(this.stats.basicDamage * 1.1 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0x9be0de, now, true);
            this.refreshVitals();
            return;
        }

        if (talent.slot === 'fire_wall') {
            if (!alreadyPaid) this.mana -= manaCost;
            this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);
            this.setSlotCooldown(talent.slot, now, cdMs);
            const dmg = Math.round(this.stats.specialDamage * 1.15 * berserkMult);
            this.triggerAreaSpell('fire_wall', talent.name, target.sprite, dmg, 0xff6b2b, 38, now, 0);
            this.refreshVitals();
            return;
        }

        if (talent.slot === 'arcane_blast') {
            if (!alreadyPaid) this.mana -= manaCost;
            this.scene.face(target.sprite.x - this.scene.position.x, target.sprite.y - this.scene.position.y);
            this.setSlotCooldown(talent.slot, now, cdMs);
            this.spellEffects?.push?.({
                kind: 'arcane_beam',
                x: this.scene.position.x,
                y: this.scene.position.y - 20,
                targetX: target.sprite.x,
                targetY: target.sprite.y - 14,
                color: 0xc99eff,
                start: now,
                duration: 380,
            });
            const dmg = Math.round(this.stats.specialDamage * 1.05 * berserkMult);
            this.applyDamageToMonster(target, dmg, talent.name, 0xc99eff, now, true);
            this.refreshVitals();
        }
    }

    resolveTalentCast(pending, now) {
        const { talent, target, manaCost, cdMs, berserkMult } = pending;
        if (!target || !target.isAlive) {
            this.tell(`${talent.name} interrompu : la cible n’est plus active.`);
            this.refreshVitals();
            return;
        }
        this.executeTalentImpact(talent, target, manaCost, cdMs, berserkMult, now, true);
    }

    setSlotCooldown(slotKey, now, durationMs) {
        this.spellCooldowns.set(slotKey, {
            start: now,
            end: now + durationMs,
        });
        if (slotKey !== 'basic' && slotKey !== 'special') {
            this.attackVisual = {
                start: now, end: now + 210, castMs: 180,
                ranged: this.ranged, facing: this.scene.facing,
            };
        }
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
            if (attack.kind === 'talentCast') {
                this.resolveTalentCast(attack, now);
            } else {
                this.resolveAttack(attack, now);
            }
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

        this.refreshCastBar(now);
        this.updateFloatingTexts(now);
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
        if (!['starter', 'rare', 'epic'].includes(weapon) || (weapon !== 'starter' && !this.progress.items[weapon])) {
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

        if (this.armorList) {
            const owned = Object.values(armorItems).filter((piece) => piece.classKey === this.classKey && this.progress.items[piece.id] > 0);
            const statNames = { health: 'PV', mana: 'mana', basic: 'dégâts de base', special: 'dégâts de compétence', mitigation: 'protection' };
            if (owned.length) {
                this.armorList.replaceChildren(...owned.map((piece) => {
                    const item = document.createElement('li');
                    const icon = document.createElement('img');
                    icon.src = this.scene.armorIconPath + piece.id + '.png';
                    icon.alt = '';
                    icon.className = 'armor-icon';
                    const description = document.createElement('div');
                    const name = document.createElement('strong');
                    const details = document.createElement('small');
                    const equipped = this.progress.armor?.[piece.slot] === piece.id;
                    name.textContent = piece.name;
                    const bonuses = Object.entries(piece.stats).map(([stat, value]) =>
                        '+' + (stat === 'mitigation' ? Math.round(value * 100) + ' %' : value) + ' ' + statNames[stat]);
                    details.textContent = [armorSlots[piece.slot], 'N. ' + piece.level, ...bonuses, equipped ? 'Équipé' : ''].filter(Boolean).join(' · ');
                    description.append(name, details);
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'quiet';
                    button.dataset.armor = piece.id;
                    button.disabled = this.progress.level < piece.level;
                    button.textContent = equipped ? 'Retirer' : 'Équiper';
                    item.append(icon, description, button);
                    return item;
                }));
            } else {
                const empty = document.createElement('li');
                empty.textContent = 'Les gardes de la Citadelle laissent les premières coiffes et paires de gants.';
                this.armorList.replaceChildren(empty);
            }
        }

        this.basicLabel.textContent = this.basicName;
        this.buttons[0].title = this.basicName
            + ' · ' + this.basicWeapon.damage + ' dégâts'
            + ' · Portée : ' + this.basicRangeLabel;
    }

    get basicName() {
        if (!this.equipped) return 'Coup de poing';
        if (this.classKey === 'mage') return this.basicWeapon.ranged ? 'Trait de baguette' : 'Coup de bâton';
        return this.rules.basicName;
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
        if (weapon === 'starter') return this.ranged ? 'Baguette de braise' : 'Épée de fer';
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
        for (const label of this.armorLabels ?? []) {
            label.textContent = armorItems[this.progress.armor?.[label.dataset.sheetArmor]]?.name ?? 'Vide';
        }

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
            this.basicMetaLabel.textContent = 'Rg ' + this.stats.basicSpellRank + ' · ' + this.basicWeapon.damage + ' dég.';
        }

        if (this.specialMetaLabel) {
            const cost = Math.max(1, Math.round(this.rules.specialManaCost * (1 - (this.stats.manaCostReduction ?? 0))));
            this.specialMetaLabel.textContent = cost + ' ' + this.rules.resourceName.toLowerCase() + ' · ' + this.stats.specialDamage + ' dég.';
        }

        this.buttons[0].title = this.basicName
            + ' · Rang ' + this.stats.basicSpellRank
            + ' · ' + this.basicWeapon.damage + ' dégâts'
            + ' · Portée : ' + this.basicRangeLabel;
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
        if (this.sheetBasicDamageLabel) this.sheetBasicDamageLabel.textContent = this.basicWeapon.damage + ' dégâts';
        if (this.sheetSpecialDamageLabel) this.sheetSpecialDamageLabel.textContent = this.stats.specialDamage + ' dégâts';
        if (this.sheetRangeLabel) this.sheetRangeLabel.textContent = this.basicRangeLabel;

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
            this.spellDamages.basic.textContent = this.basicWeapon.damage + ' dégâts actuels (+' + basicStep + ' par rang)';
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
                node.setAttribute('aria-label', `${talent.name} · ${rank}/${talent.maxRank} · ${talent.description}`);
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
        if (!attack.ranged) {
            this.recovery = { ...attack, start: now };
        }
        if (!attack.ranged && this.distanceTo(target) > attack.range) {
            this.tell(`${target.name} est hors de portée. Portée : ${numberFormatter.format(attack.range / this.tileSize)} cases.`);
            return;
        }

        if (attack.special) {
            this.spellEffects?.push?.({
                kind: attack.ranged ? 'fireball_burst' : 'heavy_slash',
                x: target.sprite.x,
                y: target.sprite.y - 12,
                radius: attack.ranged ? 30 : 24,
                angle: attack.angle ?? 0,
                color: attack.color ?? 0xff942f,
                start: now,
                duration: 420,
            });
            this.triggerShake('small');
        }

        this.applyDamageToMonster(target, attack.damage, attack.name, attack.color, now, Boolean(attack.special));
    }

    applyDamageToMonster(monster, rawDamage, attackName, color, now, isSpecial = false) {
        if (!monster.isAlive || monster.trial) return;
        const phaseFloor = monster.isBoss ? Math.round(monster.maxHealth * (malakorThresholds[monster.phase - 1] ?? 0)) : 0;
        const damage = Math.min(monster.health - phaseFloor, monster.isBoss ? Math.max(1, Math.round(rawDamage * .8)) : rawDamage);
        monster.health -= damage;
        monster.syncOverlays();

        const enteredPhase = typeof monster.checkBossPhase === 'function' && monster.checkBossPhase();
        if (enteredPhase) this.startMalakorTrial(monster, now, monster.phase === 3);

        if (this.selectedMonster === monster) {
            this.refreshTargetHud();
        }

        this.impacts.push({
            x: monster.sprite.x,
            y: monster.sprite.y - 14,
            color,
            start: now,
        });
        this.spawnFloatingText(
            monster.sprite.x,
            monster.sprite.y - (monster.isBoss ? 56 : 30),
            `-${damage}`,
            isSpecial ? '#ffd670' : '#f7f1e1',
            now,
        );

        if (monster.health <= 0) {
            this.defeatMonster(monster, now);
            return;
        }

        monster.pursue();
        if (!enteredPhase) {
            this.tell(`${attackName} · ${damage} dégâts sur ${monster.name} (N.${monster.level}).`);
        }
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
            this.targetHud.dataset.boss = 'false';
            if (this.targetPhaseLabel) {
                this.targetPhaseLabel.hidden = true;
            }
            this.selectedMonster = null;
        }
        if (monster.isBoss) {
            this.triggerShake('large');
        }

        const { item, levelUp } = awardVictory(this.progress, this.rules.loot, Math.random, monster.xpReward);
        const armor = awardArmor(this.progress, this.classKey, monster.species, monster.level);
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
        this.tell(`${monster.name} (N.${monster.level}) vaincu · +${monster.xpReward} XP · ${loot.name}${armor ? " · " + armor.name : ""}${levelUpText}`);
    }

    /**
     * Résout une auto-attaque ciblée, puis respecte le temps de recharge du monstre.
     */
    mustDodgeMalakor() {
        return this.monsters?.some((monster) => monster.isBoss && monster.trial
            && inZone(monster.template.zone, this.scene.position.x, this.scene.position.y));
    }

    startMalakorTrial(monster, now, transform = false) {
        monster.cancelAttack();
        monster.poseRecovery = monster.echo = null;
        monster.stunUntil = monster.slowUntil = 0;
        monster.trial = createMalakorTrial(monster.phase, now, transform);
        if (this.pending) {
            const refund = this.pending.manaCost ?? 0;
            this.mana = Math.min(this.meters[1].meter.max, this.mana + refund);
            if (this.pending.slotKey === 'special') this.spellCooldowns.delete('special');
            this.readyAt = Math.min(this.readyAt, now);
            this.pending = this.attackVisual = null;
            this.refreshCastBar(now);
            this.refreshVitals();
        }
        monster.pursue();
        this.refreshTargetHud();
        this.triggerShake(transform ? 'large' : 'medium');
        this.tell(malakorPhases[monster.phase - 1] + ' · Traverse l’arène par les bandes sûres !');
    }

    updateMalakorTrial(monster, now) {
        if (now >= monster.trial.endsAt) {
            monster.trial = null;
            monster.counterAt = now + (monster.phase === 3 ? 3150 : 2600);
            monster.nextTrialAt = now + malakorTrialInterval;
            this.refreshTargetHud();
            this.tell('La Brèche se referme. Malakor est vulnérable !');
            return;
        }
        const wave = malakorWave(monster.trial, now);
        if (!wave?.impact || wave.index === monster.trial.lastImpact) return;
        monster.trial.lastImpact = wave.index;
        this.triggerShake('medium');
        if (isMalakorWaveHit(wave, this.scene.position)) this.takeMonsterHit(monster, monster.phase === 3 ? 570 : 385, now);
    }

    takeMonsterHit(monster, damage, now) {
        const taken = Math.max(1, Math.round(damage * (1 - (this.stats.damageReduction ?? 0))));
        this.health = Math.max(0, this.health - taken);
        this.impacts.push({ x: this.scene.position.x, y: this.scene.position.y - 17, color: 0xf78863, start: now });
        this.refreshVitals();
        if (this.health === 0) {
            this.scene.avatar.setTint(0xbb6666);
            this.finish(`${monster.name} (N.${monster.level}) t’a vaincu. Relève-toi au camp.`);
            return;
        }
        this.tell(`${monster.name} t’inflige ${taken} dégâts.`);
    }

    updateMonsterCounter(monster, now) {
        if (!monster.isAlive || this.health <= 0) return;
        if (monster.isBoss && monster.alert && inZone(monster.template.zone, this.scene.position.x, this.scene.position.y)) {
            if (monster.trial) {
                this.updateMalakorTrial(monster, now);
                return;
            }
            if (monster.echo && now >= monster.echo.end) {
                const echo = monster.echo;
                monster.echo = null;
                const distance = Math.hypot(this.scene.position.x - echo.x, this.scene.position.y - echo.y);
                this.spellEffects.push({ kind: 'seismic_detonation', x: echo.x, y: echo.y, radius: echo.radius, start: now, duration: 500 });
                if (distance >= echo.inner && distance <= echo.radius) this.takeMonsterHit(monster, echo.damage, now);
                this.triggerShake('medium');
                return;
            }
            if (now >= monster.nextTrialAt && !monster.attackEndsAt) {
                this.startMalakorTrial(monster, now);
                return;
            }
        }
        if (now < monster.stunUntil || !monster.alert
            || !inZone(monster.template.zone, this.scene.position.x, this.scene.position.y)) {
            monster.cancelAttack();
            return;
        }

        const shot = monster.attackVisual?.projectile;
        const specialVisual = monster.attackVisual?.special ? monster.attackVisual : null;
        if (shot || monster.attackEndsAt) {
            if (!shot && now < monster.attackEndsAt) return;
            const rawDamage = typeof monster.attackDamage === 'function' ? monster.attackDamage() : monster.stats.damage;
            const outcome = shot ? monster.advanceBreath(now, this.scene.position)
                : monster.canAttack(this.scene.position) ? 'hit' : 'miss';
            if (outcome === 'travel') return;

            if (specialVisual) {
                if (monster.isBoss) monster.poseRecovery = { ...specialVisual, end: now + 500 };
                if (monster.isBoss && specialVisual.special === 'seismic_ring') {
                    monster.echo = {
                        x: specialVisual.originX, y: specialVisual.originY, inner: specialVisual.radius,
                        radius: specialVisual.radius + 60, start: now, end: now + 780, damage: Math.round(rawDamage * .8),
                    };
                    monster.counterAt = Math.max(monster.counterAt, monster.echo.end + 360);
                }
                this.spellEffects?.push?.({
                    kind: specialVisual.special === 'magma_rift' ? 'magma_detonation'
                        : specialVisual.special === 'obsidian_cleave' ? 'obsidian_impact' : 'seismic_detonation',
                    x: specialVisual.originX,
                    y: specialVisual.originY,
                    radius: specialVisual.radius ?? 78,
                    angle: specialVisual.angle,
                    dirX: specialVisual.dirX ?? 1,
                    dirY: specialVisual.dirY ?? 0,
                    riftRange: specialVisual.riftRange ?? 165,
                    color: 0xff7b2f,
                    start: now,
                    duration: 540,
                });
                if (monster.isBoss) this.triggerShake(outcome === 'hit' ? 'large' : 'medium');
                else if (outcome === 'hit') this.triggerShake('small');
                monster.cancelAttack();
            } else if (shot) {
                monster.cancelAttack();
            } else {
                monster.attackEndsAt = 0;
                monster.restoreTint?.();
            }

            if (outcome === 'miss') {
                this.tell(`Tu as esquivé l’attaque de ${monster.name}.`);
                return;
            }

            if (!specialVisual) this.triggerShake(monster.isBoss || monster.species === 'dragon' ? 'medium' : 'small');
            this.takeMonsterHit(monster, rawDamage, now);
            return;
        }

        if (now >= monster.counterAt && monster.canAttack(this.scene.position)) {
            monster.startAttack(this.scene.position, now);
            const interval = typeof monster.currentAttackIntervalMs === 'function'
                ? monster.currentAttackIntervalMs()
                : monster.stats.attackIntervalMs;
            monster.counterAt = now + interval;
        }
    }

    /**
     * Dessine les animations d'attaques, sorts et télégraphies épiques en pixel art.
     */
    drawEffects(now) {
        const enemyAttacking = this.monsters.some((monster) => monster.isAlive && (
            (monster.isBoss && (monster.phase === 3 || monster.trial || monster.echo))
            || (monster.attackVisual && (monster.attackVisual.projectile || now < monster.attackVisual.end + recoveryMs))
        ));
        this.spellEffects = (this.spellEffects ?? []).filter((fx) => now - fx.start < fx.duration);
        if (!this.pending && !this.recovery && this.impacts.length === 0 && this.spellEffects.length === 0 && !enemyAttacking) {
            this.effect.clear();
            return;
        }

        this.effect.clear();
        this.drawMonsterAttacks(now);
        this.drawSpellEffects(now);
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
        if (attack.kind === 'talentCast') {
            this.drawCastCircle(now, attack.start, attack.castMs, attack.color);
            return;
        }

        const target = attack.target;
        const progress = Math.max(0, (now - attack.start) / (attack.end - attack.start));
        if (attack.ranged && target) {
            const elapsed = now - attack.start;
            const flightSpan = Math.max(1, attack.end - attack.start - attack.castMs);
            const travel = Math.max(0, (elapsed - attack.castMs) / flightSpan);
            if (elapsed < attack.castMs) {
                if (attack.castMs >= 500) {
                    this.drawCastCircle(now, attack.start, attack.castMs, attack.color);
                }
                attack.x = this.scene.position.x + Math.cos(attack.angle) * 7;
                attack.y = this.scene.position.y - 20 + Math.sin(attack.angle) * 4;
                if (attack.armed) {
                    this.effect.fillStyle(0x916b52, 1);
                    this.strokePixels(attack.x, attack.y + 11, -1.35, attack.staff ? 16 : 9, 2);
                }
            }
            const dx = target.sprite.x - attack.x;
            const dy = target.sprite.y - 12 - attack.y;
            const tailSteps = attack.special ? 5 : 3;
            for (let index = tailSteps; index > 0; index--) {
                const tail = Math.max(0, travel - index * 0.045);
                this.effect
                    .fillStyle(attack.color, 0.65 - index * 0.1)
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
            if ((attack.special || !still) && travel > 0) {
                this.orbitSparks(x, y, elapsed);
            }
        } else {
            this.drawMelee(attack, progress, true);
        }
    }

    drawCastCircle(now, start, castMs, color) {
        const progress = Math.max(0, Math.min(1, (now - start) / Math.max(1, castMs)));
        const cx = Math.round(this.scene.position.x);
        const cy = Math.round(this.scene.position.y - 2);
        const radius = 15 + Math.sin(progress * Math.PI) * 3;
        this.effect.lineStyle(1.5, color, 0.55 + progress * 0.4);
        this.effect.strokeEllipse(cx, cy, radius * 2, radius * 1.15);
        for (let i = 0; i < 4; i++) {
            const angle = now / 180 + (i * Math.PI) / 2;
            const px = Math.round(cx + Math.cos(angle) * radius * (1 - progress * 0.35));
            const py = Math.round(cy + Math.sin(angle) * radius * 0.58 * (1 - progress * 0.35));
            this.effect.fillStyle(0xffeaad, 0.9).fillRect(px - 1, py - 1, 3, 3);
        }
    }

    drawSpellEffects(now) {
        for (const fx of this.spellEffects ?? []) {
            const p = Math.max(0, Math.min(1, (now - fx.start) / fx.duration));
            const alpha = 1 - p;

            if (fx.kind === 'arcane_beam') {
                this.effect.lineStyle(3, 0xa86cf0, alpha * 0.85);
                this.effect.lineBetween(fx.x, fx.y, fx.targetX, fx.targetY);
                this.effect.lineStyle(1, 0xf6ebff, alpha);
                this.effect.lineBetween(fx.x, fx.y, fx.targetX, fx.targetY);
                this.effect.lineStyle(1.5, 0xc99eff, alpha).strokeEllipse(fx.targetX, fx.targetY, 16 + p * 22, 10 + p * 14);
                continue;
            }

            if (fx.kind === 'fire_whirl') {
                const r = (fx.radius ?? 54) * (0.45 + 0.55 * p);
                this.effect.lineStyle(2, 0xff7b2f, alpha * 0.9).strokeEllipse(fx.x, fx.y, r * 2, r * 1.3);
                for (let arm = 0; arm < 3; arm++) {
                    const baseA = now / 90 + (arm * Math.PI * 2) / 3;
                    for (let step = 0; step < 5; step++) {
                        const a = baseA - step * 0.28;
                        const dist = r * (1 - step * 0.14);
                        const px = Math.round(fx.x + Math.cos(a) * dist);
                        const py = Math.round(fx.y + Math.sin(a) * dist * 0.68);
                        this.effect.fillStyle(step === 0 ? 0xffe49c : 0xff6229, alpha).fillRect(px - 2, py - 2, 4, 4);
                    }
                }
                continue;
            }

            if (fx.kind === 'frost_nova') {
                const r = (fx.radius ?? 54) * (0.3 + 0.7 * p);
                this.effect.lineStyle(2, 0x8de2ff, alpha).strokeEllipse(fx.x, fx.y, r * 2, r * 1.3);
                for (let i = 0; i < 8; i++) {
                    const a = (i * Math.PI) / 4;
                    const px = Math.round(fx.x + Math.cos(a) * r);
                    const py = Math.round(fx.y + Math.sin(a) * r * 0.65);
                    this.effect.fillStyle(0xe5fbff, alpha).fillRect(px - 2, py - 3, 4, 6);
                }
                continue;
            }

            if (fx.kind === 'fire_wall') {
                const r = fx.radius ?? 38;
                for (let i = -3; i <= 3; i++) {
                    const px = Math.round(fx.x + i * (r / 3.5));
                    const py = Math.round(fx.y + Math.sin(i + p * 6) * 6);
                    const flameH = Math.round((10 + ((i + 4) % 3) * 4) * alpha);
                    this.effect.fillStyle(0xff5e28, alpha * 0.9).fillRect(px - 2, py - flameH, 4, flameH);
                    this.effect.fillStyle(0xffe08a, alpha).fillRect(px - 1, py - Math.max(2, flameH - 3), 2, Math.max(2, flameH - 3));
                }
                continue;
            }

            if (fx.kind === 'obsidian_impact') {
                const spread = Math.acos(.35);
                for (let arc = 0; arc < 3; arc++) {
                    const reach = fx.radius * (.55 + p * .45 - arc * .11);
                    this.effect.lineStyle(4 - arc, [0xfff0bb, 0xffa049, 0xf65229][arc], alpha);
                    this.effect.beginPath();
                    this.effect.arc(fx.x, fx.y, reach, fx.angle - spread, fx.angle + spread);
                    this.effect.strokePath();
                }
                continue;
            }

            if (fx.kind === 'magma_detonation') {
                const steps = Math.floor((fx.riftRange ?? 165) / 14);
                for (let i = 1; i <= steps; i++) {
                    const px = Math.round(fx.x + fx.dirX * i * 14);
                    const py = Math.round(fx.y + fx.dirY * i * 14);
                    const h = Math.round(18 * alpha);
                    this.effect.fillStyle(0xff5c28, alpha * 0.9).fillRect(px - 5, py - h, 10, h);
                    this.effect.fillStyle(0xffe79b, alpha).fillRect(px - 2, py - Math.round(h * 0.7), 4, Math.round(h * 0.7));
                }
                continue;
            }

            const r = (fx.radius ?? 40) * (0.35 + 0.65 * p);
            this.effect.lineStyle(2.5, fx.color ?? 0xff942f, alpha).strokeEllipse(fx.x, fx.y, r * 2, r * 2);
            this.effect.lineStyle(1, 0xffe4a0, alpha * 0.8).strokeEllipse(fx.x, fx.y, r * 1.4, r * 0.95);
        }
    }

    drawMalakorArc(x, y, angle, radius, progress) {
        const spread = Math.acos(.35);
        this.effect.fillStyle(0xf75127, .18 + progress * .2);
        this.effect.lineStyle(2, 0xffc06b, .9);
        this.effect.beginPath();
        this.effect.moveTo(x, y);
        this.effect.arc(x, y, radius, angle - spread, angle + spread);
        this.effect.closePath();
        this.effect.fillPath();
        this.effect.strokePath();
    }

    drawMalakorAura(monster, now) {
        const still = this.scene.motionPreference?.matches;
        const time = still ? 0 : now;
        const x = monster.sprite.x;
        const y = monster.sprite.y;
        const ignition = monster.trial?.transform && now < monster.trial.beginsAt;
        const buildup = ignition ? (now - monster.trial.start) / (monster.trial.beginsAt - monster.trial.start) : 1;
        const heat = Math.max(.1, Math.min(1, buildup));
        const pulse = .5 + .5 * Math.sin(time / 230);
        const radius = 29 + 6 * pulse;

        this.effect.fillStyle(0x482025, .32 * heat).fillEllipse(x, y + 2, 124, 58);
        this.effect.fillStyle(0xe2502d, .17 * heat).fillEllipse(x, y + 2, 92, 40);
        this.effect.fillStyle(0xff8c42, .14 * heat).fillEllipse(x, y + 2, 62, 26);
        this.effect.lineStyle(2, 0xc3402d, .46 * heat).strokeEllipse(x, y + 2, radius * 2 + 25, radius + 13);
        this.effect.lineStyle(1, 0xffbb70, .7 * heat).strokeEllipse(x, y + 2, radius * 2, radius);

        for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / 6 + time / 4600;
            const u = Math.cos(angle);
            const v = Math.sin(angle) * .48;
            const runeX = Math.round(x + u * (radius + 7));
            const runeY = Math.round(y + 2 + v * (radius + 7));
            this.effect.lineStyle(1, i % 3 ? 0xffa359 : 0xffdda1, (.48 + .2 * pulse) * heat);
            this.effect.lineBetween(runeX, runeY, runeX + u * 5 - v * 4, runeY + v * 5 + u * 2);
            this.effect.lineBetween(runeX + u * 4, runeY + v * 4, runeX - v * 5, runeY + u * 3);
        }

        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3 + .18;
            let previousX = x + Math.cos(angle) * 18;
            let previousY = y + Math.sin(angle) * 10;
            for (let segment = 1; segment <= 4; segment++) {
                const fork = angle + Math.sin(i + segment * 2.3) * .19;
                const distance = (16 + segment * 11) * (.6 + .4 * heat);
                const nextX = Math.round(x + Math.cos(fork) * distance);
                const nextY = Math.round(y + Math.sin(fork) * distance * .53);
                this.effect.lineStyle(3, 0x341724, .7).lineBetween(previousX, previousY, nextX, nextY);
                this.effect.lineStyle(1, segment === 1 ? 0xffbd6b : 0xcf5034, (.78 - segment * .1) * heat)
                    .lineBetween(previousX, previousY, nextX, nextY);
                previousX = nextX;
                previousY = nextY;
            }
        }

        if (still) return;
        for (let i = 0; i < 29; i++) {
            const life = (time / (720 + i % 6 * 85) + i * .271) % 1;
            const angle = i * 2.39996 + life * .54;
            const distance = 23 + i % 7 * 5 + life * 14;
            const px = Math.round(x + Math.cos(angle) * distance);
            const py = Math.round(y + Math.sin(angle) * distance * .42 - life * (36 + i % 5 * 9));
            const opacity = (1 - life) * heat;
            this.effect.fillStyle(i % 4 ? 0xff8c46 : 0xffe6a1, opacity).fillRect(px, py, i % 3 ? 2 : 3, i % 4 ? 3 : 5);
        }
    }

    drawMalakorTrial(monster, now) {
        const { left, top, right, bottom } = monster.template.zone;
        const x = left * this.tileSize;
        const y = top * this.tileSize;
        const width = (right - left + 1) * this.tileSize;
        const height = (bottom - top + 1) * this.tileSize;
        const wave = malakorWave(monster.trial, now);
        this.effect.lineStyle(2, monster.phase === 3 ? 0xffb080 : 0xffd98a, .9).strokeRect(x, y, width, height);
        if (!wave) {
            const progress = (now - monster.trial.start) / (monster.trial.beginsAt - monster.trial.start);
            const radius = 46 + 54 * progress;
            this.effect.lineStyle(3, 0xffcf85, .9 - .48 * progress)
                .strokeCircle(monster.sprite.x, monster.sprite.y, radius);
            return;
        }
        this.effect.fillStyle(0x84decb, .09).fillRect(x, y, width, height);
        for (const [from, to] of wave.danger) {
            const bounds = wave.vertical ? [from, y, to - from, height] : [x, from, width, to - from];
            this.effect.fillStyle(wave.impact ? 0xff581e : 0x9b332b, wave.impact ? .58 : .26 + wave.progress * .25);
            this.effect.fillRect(...bounds);
            this.effect.lineStyle(2, wave.impact ? 0xffeab0 : 0xff905e, .95).strokeRect(...bounds);
            const center = (from + to) / 2;
            for (let step = 18; step < (wave.vertical ? height : width); step += 24) {
                const offset = Math.sin(step * .18 + wave.index) * 8;
                const px = wave.vertical ? center + offset : x + step;
                const py = wave.vertical ? y + step : center + offset;
                this.effect.fillStyle(wave.impact ? 0xffefad : 0xff9b58, wave.impact ? .95 : .35 + wave.progress * .6)
                    .fillRect(px - 2, py - 2, wave.impact ? 10 : 4, wave.impact ? 6 : 3);
            }
        }
    }

    drawMonsterAttacks(now) {
        for (const monster of this.monsters) {
            if (!monster.isAlive) continue;

            if (monster.isBoss && monster.phase === 3) this.drawMalakorAura(monster, now);

            if (monster.trial) this.drawMalakorTrial(monster, now);
            if (monster.echo) {
                const { x, y, inner, radius, start, end } = monster.echo;
                const progress = Math.max(0, Math.min(1, (now - start) / (end - start)));
                this.effect.lineStyle(radius - inner, 0xdb5128, .22 + .24 * progress).strokeCircle(x, y, (inner + radius) / 2);
                this.effect.lineStyle(2, 0xffc56c, .88).strokeCircle(x, y, inner).strokeCircle(x, y, radius);
            }

            const attack = monster.attackVisual;
            if (!attack || (!attack.projectile && !attack.special && now >= attack.end + recoveryMs)) continue;

            // Télégraphies au sol des attaques spéciales
            if (attack.special) {
                const progress = Math.max(0, Math.min(1, (now - attack.start) / Math.max(1, attack.castEnd - attack.start)));
                if (attack.special === 'obsidian_cleave') {
                    this.drawMalakorArc(attack.originX, attack.originY, attack.angle, attack.radius, progress);
                } else if (attack.special === 'seismic_ring') {
                    const r = attack.radius ?? 78;
                    this.effect.fillStyle(0xff4a24, 0.14 + progress * 0.18).fillEllipse(attack.originX, attack.originY, r * 2, r * 2);
                    this.effect.lineStyle(2, 0xff9f43, 0.85).strokeEllipse(attack.originX, attack.originY, r * 2, r * 2);
                    this.effect.lineStyle(1.5, 0xffe49c, 0.95).strokeEllipse(attack.originX, attack.originY, r * 2 * progress, r * 2 * progress);
                } else if (attack.special === 'magma_rift') {
                    const endX = attack.originX + attack.dirX * attack.riftRange;
                    const endY = attack.originY + attack.dirY * attack.riftRange;
                    this.effect.lineStyle(attack.halfWidth * 2, 0xff3b1f, 0.18 + progress * 0.22);
                    this.effect.lineBetween(attack.originX, attack.originY, endX, endY);
                    this.effect.lineStyle(2, 0xffc66e, 0.9);
                    this.effect.lineBetween(attack.originX, attack.originY, endX, endY);
                }
                continue;
            }

            const elapsed = now - attack.start;
            const color = monster.species === 'dragon' ? 0x7bdef2 : (monster.isBoss ? 0xff7a3d : 0xffba87);
            this.effect.fillStyle(color, .9);
            if (attack.projectile) {
                const shot = attack.projectile;
                if (now < attack.castEnd) {
                    this.effect.fillStyle(color, .5);
                    for (let step = 8; step <= shot.range; step += 8) {
                        const x = shot.x + shot.dx * step;
                        const y = shot.y + shot.dy * step;
                        if (!this.scene.canStand(x, y)) break;
                        this.effect.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 2);
                    }
                    this.effect.fillStyle(0xd0ffff, .95).fillRect(attack.x - 3, attack.y - 3, 6, 6);
                    continue;
                }
                for (let tail = 16; tail > 0; tail -= 4) {
                    const trail = Math.max(0, shot.distance - tail);
                    this.effect.fillStyle(color, .65 - tail / 32)
                        .fillRect(Math.round(shot.x + shot.dx * trail) - 2, Math.round(shot.y + shot.dy * trail) - 10, 4, 4);
                }
                const x = Math.round(shot.x + shot.dx * shot.distance);
                const y = Math.round(shot.y + shot.dy * shot.distance);
                this.effect.fillStyle(color, .5).fillRect(x - 5, y - 2, 10, 4);
                this.effect.fillStyle(color, 1).fillRect(x - 4, y - 12, 8, 8);
                this.effect.fillStyle(0xe3ffff, 1).fillRect(x - 2, y - 10, 4, 4);
            } else {
                const progress = Math.min(1, elapsed / (attack.end - attack.start));
                const angle = attack.angle + (this.scene.motionPreference.matches ? 0 : -.65 + progress * 1.3);
                this.strokePixels(attack.x, attack.y, angle, monster.isBoss ? 18 + progress * 20 : 8 + progress * 12, monster.isBoss ? 3 : 2);
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
        const length = attack.armed ? (attack.staff ? 23 : attack.special ? 23 : 18) : 7;

        if (attack.armed) {
            this.effect.fillStyle(attack.staff ? 0x573d29 : 0x443443, 1);
            this.strokePixels(x, y, angle, length, 3);
            this.effect.fillStyle(attack.staff ? 0xbc8c51 : windingUp ? 0xc2af8d : attack.color, 1);
            this.strokePixels(x, y, angle, length, 1);
        } else {
            this.effect
                .fillStyle(0xe8ad84, 1)
                .fillRect(Math.round(x + Math.cos(angle) * length) - 2, Math.round(y + Math.sin(angle) * length * 0.65) - 2, 4, 4);
        }

        if (!windingUp && !still) {
            const trailSteps = attack.special ? 11 : 8;
            this.effect.fillStyle(attack.color, 0.9 * (1 - progress));
            for (let step = 0; step < trailSteps; step++) {
                const trail = angle - step * 0.11;
                this.effect.fillRect(
                    Math.round(x + Math.cos(trail) * length) - 1,
                    Math.round(y + Math.sin(trail) * length * 0.65) - 1,
                    attack.special ? 4 : 3,
                    attack.special ? 4 : 3,
                );
                if (attack.special && step < 7) {
                    this.effect.fillStyle(0xffde94, 0.7 * (1 - progress)).fillRect(
                        Math.round(x + Math.cos(trail) * (length + 5)) - 1,
                        Math.round(y + Math.sin(trail) * (length + 5) * 0.65) - 1,
                        2,
                        2,
                    );
                }
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

        const strike = attack.ranged ? attack.start + attack.castMs : attack.end;
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

    triggerShake(tier) {
        this.scene?.cameraFeel?.triggerTier?.(tier);
    }

    refreshCastBar(now) {
        if (!this.castBar) {
            return;
        }
        const pending = this.pending;
        if (!pending || pending.castMs < 500 || now >= pending.start + pending.castMs) {
            this.castBar.hidden = true;
            return;
        }
        const elapsed = Math.max(0, now - pending.start);
        const remainingSec = Math.max(0, (pending.start + pending.castMs - now) / 1000).toFixed(1);
        this.castBar.hidden = false;
        if (this.castBarName) this.castBarName.textContent = pending.name ?? 'Incantation';
        if (this.castBarMeter) this.castBarMeter.value = Math.min(100, Math.round((elapsed * 100) / pending.castMs));
        if (this.castBarTime) this.castBarTime.textContent = `${remainingSec}s`;
    }

    spawnFloatingText(x, y, text, color = '#ffe3a6', now = 0) {
        if (typeof this.scene?.add?.text !== 'function' || !this.damageNumbers) {
            return;
        }
        const depth = (this.scene.terrain?.length ?? 192) * this.tileSize + 20;
        const label = this.scene.add.text(Math.round(x), Math.round(y), text, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '9px',
            fontStyle: 'bold',
            color,
            stroke: '#101719',
            strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(depth);
        this.damageNumbers.push({ label, startY: y, start: now });
    }

    updateFloatingTexts(now) {
        if (!this.damageNumbers || this.damageNumbers.length === 0) {
            return;
        }
        const active = [];
        for (const entry of this.damageNumbers) {
            const elapsed = now - entry.start;
            if (elapsed >= 650) {
                entry.label.destroy?.();
                continue;
            }
            const progress = elapsed / 650;
            entry.label.setY(Math.round(entry.startY - progress * 14));
            entry.label.setAlpha?.(Math.max(0, 1 - progress));
            active.push(entry);
        }
        this.damageNumbers = active;
    }

    clearFloatingTexts() {
        for (const entry of this.damageNumbers ?? []) {
            entry.label.destroy?.();
        }
        this.damageNumbers = [];
    }

    finish(message) {
        this.pending = null;
        this.attackVisual = null;
        if (this.castBar) {
            this.castBar.hidden = true;
        }
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
        if (!this.targetHud) {
            return;
        }
        const target = this.selectedMonster;
        if (!target || !target.isAlive) {
            this.targetHud.hidden = true;
            this.targetHud.dataset.boss = 'false';
            if (this.targetPhaseLabel) this.targetPhaseLabel.hidden = true;
            return;
        }
        this.targetHud.hidden = false;
        this.targetHud.dataset.boss = String(Boolean(target.isBoss));
        if (this.targetNameLabel) this.targetNameLabel.textContent = target.name;
        if (this.targetLevelLabel) {
            this.targetLevelLabel.textContent = (target.isBoss ? 'BOSS · Niv. ' : 'Niv. ') + target.level;
        }
        if (this.targetPhaseLabel) {
            if (target.isBoss) {
                this.targetPhaseLabel.hidden = false;
                this.targetPhaseLabel.textContent = `Phase ${target.phase} · ${malakorPhases[target.phase - 1]} · ${target.trial ? 'ESQUIVE' : '65 % / 25 %'}`;
            } else {
                this.targetPhaseLabel.hidden = true;
            }
        }
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
