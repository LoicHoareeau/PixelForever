import { saveProgress } from './progression.js';

export const tutorialSteps = [
    ['move', '1/7 · Fais quelques pas avec les flèches, ZQSD ou WASD dans le Bastion.'],
    ['guide', '2/7 · Ouvre le ? rouge près du sac : repère ta vie, ta ressource, l’expérience et les recharges.'],
    ['sheet', '3/7 · Ouvre ta fiche avec P : découvre Force, Dextérité, Intelligence, Vitalité, Esprit et Défense.'],
    ['talents', '4/7 · Ouvre les talents avec T. Au niveau 1, aucun point à dépenser : observe les branches et prérequis.'],
    ['bag', '5/7 · Ouvre le sac avec I pour repérer ton arme et tes potions. Pas besoin d’en consommer.'],
    ['attack', '6/7 · Sors par la porte est, sélectionne un sanglier avec Tab ou un clic puis réussis une attaque de base (case 1 par défaut).'],
    ['return', '7/7 · Retourne voir Rakka au Bastion et parle-lui avec E pour terminer ton initiation.'],
];

export function advanceTutorial(step, event) {
    return tutorialSteps[step]?.[0] === event ? step + 1 : step;
}

export class TutorialQuest {
    constructor(scene, start) {
        this.scene = scene;
        this.origin = { ...scene.position };
        this.panel = document.getElementById('tutorial-quest');
        this.objective = document.getElementById('tutorial-objective');
        if (start && scene.combat.progress.tutorialStep == null) {
            scene.combat.progress.tutorialStep = 0;
            saveProgress(scene.combat.progressKey, scene.combat.progress);
        }
        this.render();
    }

    render() {
        const step = tutorialSteps[this.scene.combat.progress.tutorialStep];
        this.panel.hidden = !step;
        if (step) this.objective.textContent = step[1];
    }

    update() {
        const combat = this.scene.combat;
        const step = combat.progress.tutorialStep;
        if (!tutorialSteps[step] || document.getElementById('game-guide').open) return;
        const events = [];
        if (Math.hypot(this.scene.position.x - this.origin.x, this.scene.position.y - this.origin.y) >= 32) events.push('move');
        if (document.getElementById('character-sheet').open) events.push('sheet');
        if (document.getElementById('talent-tree').open) events.push('talents');
        if (document.getElementById('inventory').open) events.push('bag');
        const next = events.reduce(advanceTutorial, step);
        if (next === step) return;
        combat.progress.tutorialStep = next;
        saveProgress(combat.progressKey, combat.progress);
        this.render();
        if (next === tutorialSteps.length) combat.tell('Premiers pas terminés ! Retrouve les guides avec le ? rouge près du sac.');
    }

    record(event) {
        const step = this.scene.combat.progress.tutorialStep;
        const next = advanceTutorial(step, event);
        if (next === step) return;
        this.scene.combat.progress.tutorialStep = next;
        saveProgress(this.scene.combat.progressKey, this.scene.combat.progress);
        this.render();
        if (next === tutorialSteps.length) this.scene.combat.tell('Premiers pas terminés ! Retrouve les guides avec le ? rouge près du sac.');
    }
}
