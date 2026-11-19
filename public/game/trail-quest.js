export const requiredBoars = 3;

export function normalizeTrailQuest(saved) {
    if (saved && (saved.defeated === null || (Number.isSafeInteger(saved.defeated)
        && saved.defeated >= 0 && saved.defeated <= requiredBoars))
        && typeof saved.completed === 'boolean' && (!saved.completed || saved.defeated === requiredBoars)) {
        return { defeated: saved.defeated, completed: saved.completed };
    }
    return { defeated: null, completed: false };
}

export function trailQuestStatus(quest) {
    if (quest.completed) return 'completed';
    if (quest.defeated === null) return 'available';
    return quest.defeated === requiredBoars ? 'ready_to_turn_in' : 'active';
}

export function trailQuestMarker(quest) {
    const state = trailQuestStatus(quest);
    return {
        symbol: state === 'completed' ? '' : state === 'available' ? '!' : '?',
        color: state === 'active' ? '#9aa0a6' : '#f0c781',
    };
}

export function acceptTrailQuest(quest) {
    if (trailQuestStatus(quest) !== 'available') return false;
    quest.defeated = 0;
    return true;
}

export function recordTrailQuestDefeat(quest, species) {
    if (species !== 'boar' || trailQuestStatus(quest) !== 'active') return false;
    quest.defeated++;
    return true;
}

export function completeTrailQuest(progress) {
    if (trailQuestStatus(progress.trailQuest) !== 'ready_to_turn_in') return false;
    progress.trailQuest.completed = true;
    progress.items.health += 2;
    return true;
}
