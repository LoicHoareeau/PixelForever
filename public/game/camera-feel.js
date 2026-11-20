// ---------------------------------------------------------------------------
// Tremblement de caméra basé sur un trauma décroissant (game feel)
// ---------------------------------------------------------------------------

const tierAmounts = {
    small: 0.22,
    medium: 0.44,
    large: 0.82,
};

/**
 * Gère un indicateur de trauma [0..1] décroissant en temps réel, appliqué
 * uniquement au décalage visuel de la caméra (`followOffset`) sans déplacer
 * ni les corps ni la simulation.
 */
export class CameraFeel {
    constructor(options = {}) {
        this.trauma = 0;
        this.clock = 0;
        this.decayPerSec = options.decayPerSec ?? 2.1;
        this.maxOffsetX = options.maxOffsetX ?? 11;
        this.maxOffsetY = options.maxOffsetY ?? 8;
        this.strength = options.strength ?? 1;
    }

    addTrauma(amount) {
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }
        this.trauma = Math.max(0, Math.min(1, this.trauma + amount));
    }

    triggerTier(tier) {
        const amount = tierAmounts[tier] ?? 0;
        if (amount > 0) {
            this.addTrauma(amount);
        }
    }

    reset() {
        this.trauma = 0;
        return { offsetX: 0, offsetY: 0, active: false };
    }

    update(deltaMs, reducedMotion = false) {
        if (reducedMotion || this.trauma <= 0) {
            this.trauma = 0;
            return { offsetX: 0, offsetY: 0, active: false };
        }

        const dt = Math.max(0, Math.min(100, deltaMs)) / 1000;
        this.trauma = Math.max(0, this.trauma - this.decayPerSec * dt);
        if (this.trauma === 0) {
            return { offsetX: 0, offsetY: 0, active: false };
        }

        const shake = this.trauma * this.trauma * this.strength;
        this.clock += dt * 32;

        // Sinus combinés à fréquences incommensurables : fluide et jamais erratique.
        const offsetX = Math.round(this.maxOffsetX * shake * Math.sin(this.clock * 1.7) * 10) / 10;
        const offsetY = Math.round(this.maxOffsetY * shake * Math.sin(this.clock * 2.3) * 10) / 10;
        return { offsetX, offsetY, active: true };
    }
}
