import { createCombatVfx } from './combat-vfx.js';
import { classAttacks } from './class-talents.js';
import { applyTechnique, classEffect, dismissFamiliar, updateClassCombat } from './class-combat.js';
import { bowGrip } from './equipped-art.js';
import { cancelTaming, rememberPetHealth, updatePetControls } from './pet-controls.js';
import {
    createMalakorTrial, isMalakorWaveHit, malakorEmberMs, malakorFirstTrialDelay,
    malakorPhases, malakorThresholds, malakorTrialInterval, malakorWave,
} from './malakor.js';
import { armorItems, awardArmor, toggleArmor } from './armor.js';
import {
    allocateStat,
    awardVictory,
    basicWeaponProfile,
    chooseSpecialization,
    computeCharacterStats,
    findTalent,
    getTalentRank,
    getUnlockedActiveSpells,
    investTalent,
    loadProgress,
    regenerateResource,
    resetTalents,
    saveProgress,
    setProgressSync,
    statKeys,
    upgradeSpell,
} from './progression.js';
import { inZone } from './exploration.js';
import { recordTrailQuestDefeat } from './trail-quest.js';
import { createProgressSync } from './progress-sync.js';
import {
    refreshActionSlotsUi,
    refreshCastBarUi,
    refreshCharacterSheetUi,
    refreshInventoryUi,
    refreshTargetHudUi,
    renderTalentTreeUi,
    showLevelUpBannerUi,
    updateCooldownsUi,
    updateLevelUpBannerUi,
} from './combat-ui.js';
import {
    clearFloatingTextsView,
    drawCastCircleView,
    drawDrainView,
    drawEffectsView,
    drawInfernoEmbersView,
    drawMalakorArcView,
    drawMalakorAuraView,
    drawMalakorSurgeView,
    drawMalakorTrialView,
    drawMeleeView,
    drawMonsterAttacksView,
    drawSpellEffectsView,
    recoveryMs,
    spawnFloatingTextView,
    updateFloatingTextsView,
} from './combat-renderer.js';

const statLabels = {
    dexterity: 'Dextérité',
    defense: 'Défense',
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
 * Sélectionne la cible vivante la plus proche ou recule dans la liste triée par distance.
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
    if (direction >= 0) return candidates[0];

    const currentIndex = candidates.indexOf(currentTarget);
    if (currentIndex === -1) {
        return candidates[candidates.length - 1];
    }

    const nextIndex = (currentIndex - 1 + candidates.length) % candidates.length;
    return candidates[nextIndex];
}

/**
 * Gère le combat temps réel multi-monstres, les emplacements de sorts,
 * les arbres de talents, les potions, l'équipement et la synchronisation.
 */
export class TrainingCombat {
    constructor(scene, monsters, rules, tileSize) {
        this.scene = scene;
        this.monsters = monsters;
        this.tileSize = tileSize;
        this.rules = rules;
        this.classKey = rules.classKey ?? (rules.ranged ? 'mage' : 'warrior');
        this.progressKey = 'pixelforever:progress:' + rules.progressKey;
        this.progress = loadProgress(this.progressKey, rules.level, rules.progress, this.classKey);
        this.progressSync = createProgressSync(rules.progressUrl, rules.progressToken, state => {
            const status = document.getElementById('progress-save-status');
            if (!status) return;
            status.dataset.state = state;
            status.textContent = state === 'saved' ? 'Niveau enregistré' : state === 'saving' ? 'Sauvegarde en cours…'
                : 'Sauvegarde impossible · nouvelle tentative en cours';
        });
        setProgressSync(this.progressSync);
        this.manaCarry = 0;
        this.healthCarry = 0;
        this.ranged = rules.ranged;
        this.selectedMonster = monsters.find((m) => m.species === 'boar') ?? monsters[0];

        // Références de l'ATH principal et de la barre d'actions
        this.status = document.getElementById('combat-status');
        this.levelUpBanner = document.getElementById('level-up-banner');
        this.levelUpBannerUntil = undefined;
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
        this.petButtons = [...document.querySelectorAll('[data-pet-action]')];
        this.petStatus = document.getElementById('pet-status');
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

        // Références de la fiche de personnage, des stats et des spécialisations
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
        this.statButtons = [...document.querySelectorAll('[data-allocate-stat]')];
        this.spellButtons = [...document.querySelectorAll('[data-upgrade-spell]')];
        this.warriorSpecCard = document.getElementById('warrior-spec-card');
        this.warriorSpecStatus = document.getElementById('warrior-spec-status');
        this.warriorSpecButtons = [...document.querySelectorAll('[data-choose-spec]')];

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

        this.meters = ['health', 'mana', 'target-health'].map((name) => ({
            meter: document.getElementById('combat-' + name),
            value: document.getElementById('combat-' + name + '-value'),
        }));

        const effectDepth = scene.terrain.length * tileSize + 1;
        this.effect = scene.add.graphics().setDepth(effectDepth);
        this.rageEffect = scene.add.graphics().setDepth(effectDepth - .36);
        this.vfx = createCombatVfx(scene, effectDepth - .25);

        this.spellCooldowns = new Map();
        this.berserkUntil = 0;
        this.spellEffects = [];
        this.damageNumbers = [];

        this.monsters.forEach((monster) => {
            monster.sprite.on('pointerdown', () => {
                if (!monster.isAlive || this.scene.isInStarterTown?.()) return;
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
        return ((this.rules.specialRange ?? this.rules.range) + (this.stats?.bonusRangeTiles ?? 0)) * this.tileSize;
    }

    get rangeLabel() {
        const tiles = this.range / this.tileSize;
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
     * Tab reprend le plus proche. Maj+Tab recule parmi les monstres vivants à proximité.
     */
    cycleTarget(direction = 1) {
        if (this.health <= 0) {
            return null;
        }
        if (this.scene.isInStarterTown?.()) {
            this.tell('La porte est mène à la route de la clairière, où tu pourras cibler des ennemis.');
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
        this.taming = null;
        dismissFamiliar(this);
        this.periodicEffects?.clear();
        this.guard = null;
        this.manaCarry = 0;
        this.healthCarry = 0;
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
        const inTown = this.scene.isInStarterTown?.();
        this.selectMonster(inTown ? null : (this.monsters.find((m) => m.species === 'boar') ?? this.monsters[0]));
        this.targetHud.hidden = true;

        this.buttons.forEach((button) => {
            button.disabled = false;
        });
        this.resetButton.hidden = true;
        this.refreshVitals();
        this.refreshInventory();
        this.refreshActionSlots();
        this.updateCooldowns(0);
        this.tell(inTown ? 'Approche-toi de Rakka dans le Bastion et parle-lui (E).'
            : 'Suis le sentier vers le littoral, le cimetière, les montagnes et les Terres dévastées (Tab pour cibler).');
    }

    /**
     * Déclenche une attaque de base, le sort spécial ou un sort débloqué par talent.
     */
    attack(kind, now) {
        if (this.taming) { this.tell('Termine ou interromps l’apprivoisement avant d’attaquer.'); return; }
        if (this.health === 0) {
            return;
        }
        if (this.scene.isInStarterTown?.()) {
            this.tell('Le Bastion de Braise est une zone sûre. Sors par la porte est pour combattre.');
            return;
        }
        if (this.mustDodgeMalakor()) {
            this.tell('La Brèche recouvre l’arène. Rejoins une bande sûre.');
            return;
        }

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
        if (special && this.classKey === 'hunter' && !this.equipped) {
            this.tell('Équipe un arc pour tirer.');
            return;
        }
        const ranged = special ? this.ranged : this.basicWeapon.ranged;
        const range = special ? this.range : this.basicWeapon.range;
        const dist = this.effectiveDistanceTo(target);
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
        const axe = this.weaponStyle === 'axe';
        const duration = ranged ? castMs + flightMs : (special ? 480 : axe ? 220 : 140);
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
            weaponStyle: this.weaponStyle,
            projectile: classAttacks[this.classKey]?.projectile,
            technique: special ? classAttacks[this.classKey]?.special : null,
            angle,
            facing: this.scene.facing,
            start: now,
            end: now + duration,
            castMs,
            interruptible: ranged && castMs >= 500,
            manaCost,
            slotKey: special ? 'special' : 'basic',
            ...(this.classKey === 'hunter' && ranged ? bowGrip(this.scene.position, this.scene.facing) : {
                x: this.scene.position.x + Math.cos(angle) * 7,
                y: this.scene.position.y - 20 + Math.sin(angle) * 4,
            }),
        };

        this.pending = attack;
        this.attackVisual = attack;
        this.refreshCastBar(now);
        this.tell(attack.name + ' sur ' + target.name + '...');
    }

    /**
     * Interrompt une incantation longue lorsque le personnage se déplace et rembourse la ressource.
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

    castTalentSpell(talent, now) {
        if (this.taming) return;
        if (talent.technique?.healPet && !this.familiar) { this.tell('Aucun familier à soigner.'); return; }
        if (this.mustDodgeMalakor()) return;
        if (this.pending?.kind === 'classCast') {
            this.tell('Une incantation est déjà en cours.');
            return;
        }
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

        const baseCost = talent.technique?.summon ? Math.max(talent.manaCost, Math.ceil(this.stats.maxMana * .28)) : talent.manaCost ?? 6;
        const manaCost = Math.max(1, Math.round(baseCost * (1 - (this.stats.manaCostReduction ?? 0))));
        if (this.mana < manaCost) {
            this.tell(`${this.rules.resourceName} insuffisant(e) pour ${talent.name} (${manaCost}).`);
            return;
        }

        const cdFactor = 1 - (this.stats.cooldownReduction ?? 0);
        const cdMs = Math.round((talent.cooldownMs ?? 4500) * cdFactor);
        const berserkMult = now < this.berserkUntil ? 1.4 : 1;

        if (talent.technique) {
            const technique = talent.technique;
            const target = technique.range ? this.getActiveTarget() : null;
            if (technique.range && (!target?.isAlive || this.effectiveDistanceTo(target) > technique.range * this.tileSize)) {
                this.tell('Aucune cible à portée pour ' + talent.name + '.');
                return;
            }
            if (technique.radius && !this.monsters.some(monster => monster.isAlive && !monster.trial
                && Math.hypot(monster.sprite.x - (target?.sprite.x ?? this.scene.position.x),
                    monster.sprite.y - (target?.sprite.y ?? this.scene.position.y)) <= technique.radius)) {
                this.tell('Aucun ennemi dans la zone de ' + talent.name + '.');
                return;
            }
            if (technique.castMs && this.pending) {
                this.tell('Une attaque ou une incantation est déjà en cours.');
                return;
            }
            this.mana -= manaCost;
            const { x, y } = this.scene.position;
            if (target) this.scene.face(target.sprite.x - x, target.sprite.y - y);
            const angle = target ? Math.atan2(target.sprite.y - y, target.sprite.x - x) : 0;
            if (technique.castMs) {
                this.pending = this.attackVisual = {
                    kind: 'classCast', talent, target, manaCost, cdMs, angle,
                    damage: this.stats.specialDamage * berserkMult, ranged: true, facing: this.scene.facing,
                    weaponStyle: 'grimoire', name: talent.name, start: now, end: now + technique.castMs,
                    castMs: technique.castMs, nextPulse: now + (technique.channel ?? technique.castMs), interruptible: true,
                };
                this.refreshCastBar(now);
                this.refreshVitals();
                this.tell(talent.name + '…');
                return;
            }
            this.setSlotCooldown(talent.slot, now, cdMs);
            this.attackVisual = {
                start: now - 1, end: now, castMs: 1, ranged: technique.range > 3,
                facing: this.scene.facing, weaponStyle: technique.guard ? 'shield' : this.weaponStyle,
            };
            applyTechnique(this, technique, target, this.stats.specialDamage * berserkMult, talent.name, now, angle, talent.slot);
            this.triggerShake(technique.power > 1.3 ? 'medium' : 'small');
            this.refreshVitals();
            if (!technique.power) this.tell(talent.name + ' activé.');
            return;
        }

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

        if (talent.slot === 'fire_whirl' || talent.slot === 'frost_nova') {
            if (this.effectiveDistanceTo(target) > this.range) {
                this.tell(`${target.name} est hors de portée pour ${talent.name}.`);
                return;
            }
        } else if (talent.slot === 'fire_wall') {
            if (this.effectiveDistanceTo(target) > this.range + 16) {
                this.tell(`${target.name} est hors de portée pour Mur de feu.`);
                return;
            }
        } else if (talent.slot === 'engage') {
            if (this.effectiveDistanceTo(target) > 4.5 * this.tileSize) {
                this.tell(`${target.name} est trop loin pour Engagement.`);
                return;
            }
        } else if (talent.slot === 'shield_bash') {
            if (this.effectiveDistanceTo(target) > this.range + 6) {
                this.tell(`${target.name} est hors de portée pour Coup de bouclier.`);
                return;
            }
        } else if (talent.slot === 'arcane_blast') {
            if (this.effectiveDistanceTo(target) > this.range + 1.5 * this.tileSize) {
                this.tell(`${target.name} est hors de portée pour Déflagration.`);
                return;
            }
        }

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
            const { x, y } = this.scene.position;
            this.scene.face(target.sprite.x - x, target.sprite.y - y);
            this.attackVisual = { start: now - 1, end: now, ranged: false, facing: this.scene.facing, weaponStyle: 'shield' };
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

        if (this.pending?.kind === 'classCast') this.updateClassCast(now);
        if (this.pending && now >= this.pending.end) {
            const attack = this.pending;
            this.pending = null;
            if (attack.kind === 'talentCast') {
                this.resolveTalentCast(attack, now);
            } else {
                this.resolveAttack(attack, now);
            }
        }
        updatePetControls(this, now);
        if (this.familiar || this.periodicEffects?.size) updateClassCombat(this, now, delta);

        const inCombat = this.monsters.some((m) => m.isAlive && m.alert);
        const dt = Math.min(delta, 100);
        if (this.health > 0 && this.mana < this.meters[1].meter.max) {
            const regenRate = this.stats.manaRegenPerSec * (inCombat ? 1 : 2.5);
            const regenerated = regenerateResource(
                this.mana,
                this.meters[1].meter.max,
                regenRate,
                dt,
                this.manaCarry,
            );
            this.mana = regenerated.value;
            this.manaCarry = regenerated.carry;
            if (regenerated.gained > 0) {
                this.refreshVitals();
            }
        }
        if (!inCombat && this.health > 0 && this.health < this.meters[0].meter.max) {
            const healthRegen = regenerateResource(
                this.health,
                this.meters[0].meter.max,
                Math.max(1, this.stats.maxHealth * 0.025),
                dt,
                this.healthCarry,
            );
            this.health = healthRegen.value;
            this.healthCarry = healthRegen.carry;
            if (healthRegen.gained > 0) {
                this.refreshVitals();
            }
        }

        for (const monster of this.monsters) {
            if (!monster.isAlive) continue;
            if (this.health > 0) {
                this.updateMonsterCounter(monster, now);
            }
            monster.update(now, delta, this.guardianFor(monster)?.actor ?? this.scene.position);
        }

        if (this.health > 0) {
            if (now < this.berserkUntil) {
                this.scene.avatar.setTint(0xffb38a);
            } else if (this.scene.avatar.tintTopLeft === 0xffb38a) {
                this.scene.avatar.clearTint();
            }
        }

        updateLevelUpBannerUi(this, now);
        this.refreshCastBar(now);
        this.updateFloatingTexts(now);
        this.drawEffects(now);
        this.updateCooldowns(now);
    }

    updateCooldowns(now) {
        updateCooldownsUi(this, now);
    }

    updateClassCast(now) {
        const cast = this.pending;
        const { talent, target } = cast;
        const technique = talent.technique;
        const invalidTarget = technique.range && (!target?.isAlive || target.trial || this.mustDodgeMalakor()
            || this.effectiveDistanceTo(target) > technique.range * this.tileSize);
        if (invalidTarget) {
            this.mana = Math.min(this.stats.maxMana, this.mana + cast.manaCost);
            this.pending = this.attackVisual = null;
            this.refreshVitals();
            this.tell('Incantation interrompue · cible hors de portée.');
            return;
        }
        while (cast.nextPulse <= cast.end && cast.nextPulse <= now && (!technique.range || (target.isAlive && !target.trial))) {
            if (cast.manaCost > 0) this.setSlotCooldown(talent.slot, now, cast.cdMs);
            cast.manaCost = 0;
            applyTechnique(this, technique, target, cast.damage, talent.name, now, cast.angle, talent.slot);
            cast.nextPulse += technique.channel ?? technique.castMs;
        }
        if (cast.nextPulse > cast.end || (technique.range && (!target.isAlive || target.trial))) {
            this.pending = null;
            if (technique.channel) this.attackVisual = null;
        }
    }

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

    toggleWeapon(weapon) {
        if (!this.hasWeapon(weapon)) {
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

        if (!allocateStat(this.progress, stat, this.classKey)) {
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

    chooseWarriorSpec(spec) {
        const previousMaxHealth = this.stats.maxHealth;
        if (!chooseSpecialization(this.progress, this.classKey, spec)) {
            return 'Spécialisation indisponible.';
        }
        this.refreshProgress();
        const healthGain = Math.max(0, this.stats.maxHealth - previousMaxHealth);
        if (this.health > 0 && healthGain > 0) {
            this.health = Math.min(this.stats.maxHealth, this.health + healthGain);
        }
        saveProgress(this.progressKey, this.progress);
        this.refreshVitals();
        return spec === 'bulwark' ? 'Voie du Rempart choisie (+3 Défense).' : 'Voie du Berserker choisie (+3 Force).';
    }

    spendSpellPoint(spell) {
        if (!upgradeSpell(this.progress, spell)) {
            return 'Les rangs de base ont été remplacés par l’arbre de talents (T).';
        }
        return '';
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
        if (this.familiar?.kind !== 'imp') dismissFamiliar(this);
        saveProgress(this.progressKey, this.progress);
        this.refreshProgress();
        this.health = Math.min(this.health, this.stats.maxHealth);
        this.mana = Math.min(this.mana, this.stats.maxMana);
        this.refreshVitals();
        this.refreshActionSlots();
        return `Talents réinitialisés (+${refunded} point${refunded > 1 ? 's' : ''} restitué${refunded > 1 ? 's' : ''}).`;
    }

    refreshInventory() {
        refreshInventoryUi(this);
    }

    get basicName() {
        if (!this.equipped) return 'Coup de poing';
        if (this.weaponStyle === 'axe') return 'Coup de hache';
        if (this.classKey === 'mage') return this.basicWeapon.ranged ? 'Trait de baguette' : 'Coup de bâton';
        return this.rules.basicName;
    }

    get equipped() {
        return this.progress.weapon !== null;
    }

    hasWeapon(weapon) {
        if (weapon === 'axe') return this.classKey === 'warrior';
        return weapon === 'starter' || (['rare', 'epic'].includes(weapon) && this.progress.items[weapon] > 0);
    }

    get weaponStyle() {
        if (!this.equipped) return 'fist';
        if (this.progress.weapon === 'axe') return 'axe';
        return { warrior: 'sword', rogue: 'daggers', hunter: 'bow', warlock: 'grimoire', mage: 'wand' }[this.classKey];
    }

    get weaponBonus() {
        const weapon = this.progress.weapon;
        if (weapon === 'starter' || weapon === 'axe') {
            return this.rules.weaponBonus;
        }
        return this.rules.loot?.[weapon]?.bonus ?? 0;
    }

    get equippedWeaponName() {
        const weapon = this.progress.weapon;
        if (weapon === null) return 'Mains nues';
        if (weapon === 'axe') return 'Hache de fer';
        if (weapon === 'starter') return this.rules.weaponName ?? (this.ranged ? 'Baguette de braise' : 'Épée de fer');
        return this.rules.loot?.[weapon]?.name ?? 'Aucune';
    }

    refreshActionSlots() {
        refreshActionSlotsUi(this);
    }

    refreshProgress() {
        const { level, xp } = this.progress;
        this.stats = computeCharacterStats(this.rules, this.progress, this.weaponBonus);
        for (const label of this.armorLabels ?? []) {
            label.textContent = armorItems[this.progress.armor?.[label.dataset.sheetArmor]]?.name ?? 'Vide';
        }

        this.meters[0].meter.max = this.stats.maxHealth;
        this.meters[1].meter.max = this.stats.maxMana;
        this.levelLabel.textContent = level;
        this.xpMeter.max = xpRequiredFromProgress(level);
        this.xpMeter.value = xp;
        this.xpLabel.textContent = xp + ' / ' + this.xpMeter.max;

        if (this.manaRegenLabel) {
            this.manaRegenLabel.textContent = regenFormatter.format(this.stats.manaRegenPerSec);
        }

        if (this.basicMetaLabel) {
            this.basicMetaLabel.textContent = this.basicWeapon.damage + ' dég.';
        }

        if (this.specialMetaLabel) {
            const cost = Math.max(1, Math.round(this.rules.specialManaCost * (1 - (this.stats.manaCostReduction ?? 0))));
            this.specialMetaLabel.textContent = cost + ' ' + this.rules.resourceName.toLowerCase() + ' · ' + this.stats.specialDamage + ' dég.';
        }

        this.buttons[0].title = this.basicName
            + ' · ' + this.basicWeapon.damage + ' dégâts'
            + ' · Portée : ' + this.basicRangeLabel;
        this.buttons[1].title = this.rules.specialName
            + ' · ' + this.stats.specialDamage + ' dégâts'
            + ' · ' + this.rules.specialManaCost + ' ' + this.rules.resourceName.toLowerCase()
            + ' · Portée : ' + this.rangeLabel;

        this.refreshActionSlots();
        this.refreshCharacterSheet();
        this.renderTalentTree();
    }

    refreshCharacterSheet() {
        refreshCharacterSheetUi(this);
    }

    renderTalentTree() {
        renderTalentTreeUi(this);
    }

    resolveAttack(attack, now) {
        const target = attack.target;
        if (!target || !target.isAlive) {
            return;
        }
        if (!attack.ranged) {
            this.recovery = { ...attack, start: now };
        }
        if (!attack.ranged && this.effectiveDistanceTo(target) > attack.range) {
            this.tell(`${target.name} est hors de portée. Portée : ${numberFormatter.format(attack.range / this.tileSize)} cases.`);
            return;
        }

        if (attack.technique) {
            applyTechnique(this, attack.technique, target, attack.damage, attack.name, now, attack.angle, 'special');
            this.triggerShake('small');
            return;
        }
        if (attack.projectile && attack.ranged) {
            classEffect(this, attack.projectile === 'arrow' ? 'arrow_hit' : 'chaos',
                { x: target.sprite.x, y: target.sprite.y - 13 }, now, attack.angle, .52, 380);
        }
        if (attack.special && attack.weaponStyle !== 'axe') {
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
        if (this.familiar && !this.familiar.recalled && target.isAlive) this.familiar.target = target;
    }

    applyDamageToMonster(monster, rawDamage, attackName, color, now, isSpecial = false) {
        if (!monster.isAlive || monster.trial) return;
        const phaseFloor = monster.isBoss ? Math.round(monster.maxHealth * (malakorThresholds[monster.phase - 1] ?? 0)) : 0;
        const damage = Math.min(monster.health - phaseFloor, monster.isBoss ? Math.max(1, Math.round(rawDamage * .8)) : rawDamage);
        monster.health -= damage;
        monster.syncOverlays();

        const enteredPhase = typeof monster.checkBossPhase === 'function' && monster.checkBossPhase();
        if (enteredPhase) {
            if (monster.phase === 3) this.startMalakorRage(monster, now);
            else this.startMalakorTrial(monster, now);
        }

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

    showLevelUpBanner(now = 0, count = 1) {
        showLevelUpBannerUi(this, now, count);
    }

    defeatMonster(monster, now) {
        if (!monster.sprite.visible) return;
        this.periodicEffects?.delete(monster);
        if (this.familiar?.target === monster) this.familiar.target = null;
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

        const previousLevel = this.progress.level;
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
            this.healthCarry = 0;
            this.refreshVitals();
            this.showLevelUpBanner(now, this.progress.level - previousLevel);
        }

        const loot = this.rules.loot[item];
        this.tell(`${monster.name} (N.${monster.level}) vaincu · +${monster.xpReward} XP · ${loot.name}${armor ? ' · ' + armor.name : ''}`);
    }

    mustDodgeMalakor() {
        return this.monsters?.some((monster) => monster.isBoss && monster.trial
            && inZone(monster.template.zone, this.scene.position.x, this.scene.position.y));
    }

    startMalakorRage(monster, now) {
        monster.cancelAttack();
        monster.poseRecovery = monster.echo = null;
        monster.rageStartedAt = now;
        monster.pursue();
        monster.nextTrialAt = monster.counterAt = now + malakorFirstTrialDelay;
        this.refreshTargetHud();
        this.triggerShake('large');
        this.tell('Rage de la Brèche · Prépare-toi au balayage !');
    }

    startMalakorTrial(monster, now) {
        monster.cancelAttack();
        monster.poseRecovery = monster.echo = null;
        monster.stunUntil = monster.slowUntil = 0;
        monster.trial = createMalakorTrial(monster.phase, now);
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
        this.triggerShake('medium');
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
        this.spellEffects.push({ kind: 'inferno_wake', zone: monster.template.zone, wave, start: now, duration: malakorEmberMs });
        this.triggerShake('medium');
        if (isMalakorWaveHit(wave, this.scene.position)) this.takeMonsterHit(monster, monster.phase === 3 ? 570 : 385, now, false);
    }

    takeMonsterHit(monster, damage, now, physical = true) {
        cancelTaming(this, 'Apprivoisement interrompu par une attaque.');
        const blocking = now < (this.guard?.until ?? 0);
        const protection = (1 - (this.stats.damageReduction ?? 0))
            * (1 - (physical ? this.stats.physicalMitigation ?? 0 : 0))
            * (blocking ? .65 : 1) * (this.familiar?.kind === 'void' ? .88 : 1);
        const taken = Math.max(1, Math.round(damage * protection));
        if (blocking) {
            classEffect(this, 'bulwark', { x: this.scene.position.x, y: this.scene.position.y - 15 }, now);
            if (this.guard.oneHit) this.guard = null;
        }
        this.health = Math.max(0, this.health - taken);
        this.impacts.push({ x: this.scene.position.x, y: this.scene.position.y - 17, color: 0xf78863, start: now });
        this.refreshVitals();
        if (this.health === 0) {
            this.scene.avatar.setTint(0xbb6666);
            this.finish(`${monster.name} (N.${monster.level}) t’a vaincu. Relève-toi au Bastion.`);
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
            const guardian = monster.attackDefender;
            if (guardian && guardian !== this.familiar) {
                monster.cancelAttack();
                return;
            }
            const defender = guardian?.actor ?? this.scene.position;
            const rawDamage = typeof monster.attackDamage === 'function' ? monster.attackDamage() : monster.stats.damage;
            const outcome = shot ? monster.advanceBreath(now, defender)
                : monster.canAttack(defender) ? 'hit' : 'miss';
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
            if (guardian) {
                guardian.health -= Math.max(1, Math.round(rawDamage * (1 - (guardian.mitigation ?? 0))));
                rememberPetHealth(this);
                classEffect(this, 'chaos', { x: defender.x, y: defender.y - 12 }, now, 0, .44);
                if (guardian.health <= 0) {
                    dismissFamiliar(this);
                    this.petReadyAt = now + 30000;
                    this.tell('Ton familier a été vaincu. Rappel disponible dans 30 secondes.');
                }
            } else {
                this.takeMonsterHit(monster, rawDamage, now, !shot && specialVisual?.special !== 'magma_rift');
            }
            return;
        }

        const guardian = this.guardianFor(monster);
        const defender = guardian?.actor ?? this.scene.position;
        if (now >= monster.counterAt && monster.canAttack(defender)) {
            monster.attackDefender = guardian;
            monster.startAttack(defender, now);
            const interval = typeof monster.currentAttackIntervalMs === 'function'
                ? monster.currentAttackIntervalMs()
                : monster.stats.attackIntervalMs;
            monster.counterAt = now + interval;
        }
    }

    guardianFor(monster) {
        const pet = this.familiar;
        return pet && !pet.recalled && !monster.isBoss && pet.target === monster && this.distanceTo(monster) < 130
            && inZone(monster.template.zone, pet.actor.x, pet.actor.y) ? pet : null;
    }

    drawEffects(now) { drawEffectsView(this, now); }
    drawCastCircle(now, start, castMs) { drawCastCircleView(this, now, start, castMs); }
    drawDrain(cast, now, still) { drawDrainView(this, cast, now, still); }
    drawSpellEffects(now) { drawSpellEffectsView(this, now); }
    drawMalakorArc(x, y, angle, radius, progress) { drawMalakorArcView(this, x, y, angle, radius, progress); }
    drawMalakorAura(monster, now) { drawMalakorAuraView(this, monster, now); }
    drawMalakorSurge(monster, now) { drawMalakorSurgeView(this, monster, now); }
    drawMalakorTrial(monster, now) { drawMalakorTrialView(this, monster, now); }
    drawInfernoEmbers(fx, now, still) { drawInfernoEmbersView(this, fx, now, still); }
    drawMonsterAttacks(now) { drawMonsterAttacksView(this, now); }
    drawMelee(attack, progress, windingUp) { drawMeleeView(this, attack, progress, windingUp); }

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

    effectiveDistanceTo(monster) {
        const bodyRadius = monster?.art?.width ? Math.max(0, monster.art.width / 2 - 8) : 0;
        return Math.max(0, this.distanceTo(monster) - bodyRadius);
    }

    triggerShake(tier) {
        this.scene?.cameraFeel?.triggerTier?.(tier);
    }

    refreshCastBar(now) { refreshCastBarUi(this, now); }
    spawnFloatingText(x, y, text, color = '#ffe3a6', now = 0) { spawnFloatingTextView(this, x, y, text, color, now); }
    updateFloatingTexts(now) { updateFloatingTextsView(this, now); }
    clearFloatingTexts() { clearFloatingTextsView(this); }

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

    refreshTargetHud() { refreshTargetHudUi(this); }

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

function xpRequiredFromProgress(level) {
    return 100 + (level - 1) * 50;
}
