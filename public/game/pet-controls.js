import { getUnlockedPetSpells, saveProgress } from './progression.js';
import { dismissFamiliar, summonFamiliar } from './class-combat.js';
import { tameError } from './pet-rules.js';

const demonKinds = ['imp', 'succubus', 'void'];

export function rememberPetHealth(combat) {
    if (combat.familiar?.kind !== 'beast' || !combat.progress.capturedPet) return;
    combat.progress.capturedPet.healthFraction = Math.max(0, combat.familiar.health / combat.familiar.maxHealth);
    saveProgress(combat.progressKey, combat.progress);
}

export function cancelTaming(combat, message = 'Apprivoisement interrompu.') {
    if (!combat.taming) return;
    combat.taming = null;
    combat.tell(message);
}

export function petAction(combat, index, now) {
    if (!Number.isInteger(index) || index < 0 || index > 2) return;
    if (combat.health <= 0 || !['hunter', 'warlock'].includes(combat.classKey)) return;
    if (combat.classKey === 'warlock') {
        if (now < (combat.petReadyAt ?? 0)) { combat.tell('Ton familier pourra être rappelé dans ' + Math.ceil((combat.petReadyAt - now) / 1000) + ' s.'); return; }
        const talent = getUnlockedPetSpells(combat.progress, 'warlock').find(t => t.technique.summon === demonKinds[index]);
        if (talent) combat.castTalentSpell(talent, now);
        else combat.tell('Apprends cette invocation dans les talents.');
        return;
    }
    if (index === 2) {
        cancelTaming(combat);
        rememberPetHealth(combat);
        dismissFamiliar(combat);
        combat.tell('Familier révoqué. Tu peux le rappeler avec X.');
        return;
    }
    if (combat.pending || combat.taming) return;
    if (index === 1 && combat.familiar) {
        combat.familiar.recalled = !combat.familiar.recalled;
        combat.familiar.target = null;
        combat.tell(combat.familiar.recalled ? 'Ton familier revient près de toi.' : 'Ton familier assistera tes attaques.');
        return;
    }
    if (now < (combat.petReadyAt ?? 0)) return;
    const target = index === 0 ? combat.getActiveTarget() : null;
    const error = index === 0 ? (combat.scene.isInStarterTown?.() ? 'Sors du Bastion pour apprivoiser une créature.' : tameError(combat, target))
        : !combat.progress.capturedPet ? 'Apprivoise d’abord une créature avec W.' : null;
    if (error) { combat.tell(error); return; }
    const cost = Math.max(10, Math.ceil(combat.stats.maxMana * .28));
    if (combat.mana < cost) { combat.tell('Mana insuffisant pour cette commande (' + cost + ').'); return; }
    combat.mana -= cost;
    combat.petReadyAt = now + 4500;
    combat.refreshVitals();
    if (index === 0) {
        if (combat.familiar) { combat.familiar.recalled = true; combat.familiar.target = null; }
        combat.taming = { target, start: now, end: now + 4000, x: combat.scene.position.x, y: combat.scene.position.y };
        combat.tell('Apprivoisement… Reste immobile pendant quatre secondes sans subir de dégâts.');
    } else {
        summonFamiliar(combat, 'beast', now);
        combat.tell('Ton familier est prêt.');
    }
}

export function updatePetControls(combat, now) {
    const cast = combat.taming;
    if (cast) {
        const moved = Math.hypot(combat.scene.position.x - cast.x, combat.scene.position.y - cast.y) > .5;
        const error = tameError(combat, cast.target);
        if (moved || error || combat.health <= 0) cancelTaming(combat);
        else if (now >= cast.end) {
            combat.taming = null;
            combat.progress.capturedPet = { species: cast.target.species, healthFraction: 1 };
            cast.target.hide();
            cast.target.respawnAt = now + cast.target.template.respawnMs;
            combat.periodicEffects?.delete(cast.target);
            if (combat.selectedMonster === cast.target) combat.selectMonster(null);
            summonFamiliar(combat, 'beast', now);
            saveProgress(combat.progressKey, combat.progress);
            combat.tell('Créature apprivoisée ! X pour rappeler, C pour révoquer.');
        }
    }
    const unlocked = combat.classKey === 'warlock' ? getUnlockedPetSpells(combat.progress, 'warlock') : [];
    for (const button of combat.petButtons ?? []) {
        const index = Number(button.dataset.petAction);
        const talent = unlocked.find(t => t.technique.summon === demonKinds[index]);
        button.disabled = combat.health <= 0 || (combat.classKey === 'warlock' ? !talent : index === 1 && !combat.progress.capturedPet);
        button.dataset.active = combat.classKey === 'warlock' ? String(combat.familiar?.kind === demonKinds[index])
            : String(index === 0 && !!combat.taming || index === 1 && !!combat.familiar);
        if (combat.classKey === 'warlock') {
            const cooldown = combat.spellCooldowns.get(talent?.slot);
            const remaining = Math.max(0, (cooldown?.end ?? 0) - now);
            const cost = talent ? Math.max(1, Math.round(Math.max(talent.manaCost, Math.ceil(combat.stats.maxMana * .28)) * (1 - (combat.stats.manaCostReduction ?? 0)))) : 0;
            button.title = talent ? talent.name + ' · ' + cost + ' mana · ' + (remaining ? Math.ceil(remaining / 1000) + ' s de recharge' : talent.description) : 'À apprendre dans les talents';
            button.disabled ||= remaining > 0 || !!combat.pending || now < (combat.petReadyAt ?? 0);
        } else if (index < 2 && !combat.familiar) {
            button.disabled ||= now < (combat.petReadyAt ?? 0) || !!combat.pending || !!combat.taming;
        }
    }
    if (combat.petStatus) {
        const text = cast && combat.taming ? 'Apprivoisement : ' + Math.ceil((cast.end - now) / 1000) + ' s'
            : combat.familiar ? combat.familiar.profile.name + ' · ' + Math.ceil(combat.familiar.health) + '/' + combat.familiar.maxHealth + ' PV'
                : combat.progress.capturedPet ? 'Familier apprivoisé · X pour appeler' : 'Aucun familier actif';
        if (combat.petStatus.textContent !== text) combat.petStatus.textContent = text;
    }
}
