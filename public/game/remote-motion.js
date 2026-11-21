import { interpolateVisuals } from './combat-visuals.js';

export function interpolatePosition(start, end, fraction) {
    const t = Math.min(1, Math.max(0, fraction));
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

// Le rendu est volontairement en retrait du réseau ; seule une courte prédiction comble un retard.
export class RemoteMotion {
    samples = [];
    actions = new Map();
    interval = 300;
    jitter = 0;
    delay = 500;

    constructor(cadence = 300) {
        this.cadence = cadence;
        this.interval = cadence;
        this.delay = cadence === 50 ? 120 : 500;
        this.networkDelay = 0;
    }

    push(state, time, receivedAt = time) {
        const previous = this.samples.at(-1);
        if (previous && time <= previous.time) return false;
        const teleported = previous && Math.hypot(state.x - previous.x, state.y - previous.y) > 160;
        if (teleported) {
            this.samples = []; this.actions.clear(); this.actionFloor = time;
            this.rendered = null; this.playhead = undefined; this.delay = this.cadence === 50 ? 120 : 500; this.interval = this.cadence; this.jitter = 0;
        }
        else if (previous) {
            const gap = Math.min(2000, time - previous.time);
            this.jitter += (Math.abs(gap - this.interval) - this.jitter) * .15;
            this.interval += (gap - this.interval) * .15;
        }
        if (this.cadence === 50) {
            this.networkDelay = Math.max(this.networkDelay * .98, Math.max(0, receivedAt - time));
            if (!this.samples.length) this.delay = Math.max(120, this.networkDelay + 100);
        }
        this.samples.push({ ...state, time });
        if (this.samples.length > (this.cadence === 50 ? 40 : 12)) this.samples.shift();
        for (const action of Array.isArray(state.actions) ? state.actions : []) if (action[1] >= (this.actionFloor ?? -Infinity)) this.actions.set(action[0], action);
        while (this.actions.size > 24) this.actions.delete(this.actions.keys().next().value);
        for (const [id, action] of this.actions) if (time - action[1] > 6500) this.actions.delete(id);
        return Boolean(teleported);
    }

    sample(serverNow) {
        const dt = Math.max(0, Math.min(100, serverNow - (this.previousNow ?? serverNow)));
        this.previousNow = serverNow;
        const desired = this.cadence === 50 ? Math.max(120, Math.min(1000, this.networkDelay + this.interval * 2 + this.jitter * 2))
            : Math.max(500, Math.min(850, this.interval * 1.5 + this.jitter * 1.5));
        this.delay += Math.max(-dt * .08, Math.min(dt * .08, desired - this.delay));
        const time = Math.max(this.playhead ?? -Infinity, serverNow - this.delay);
        this.playhead = time;
        const samples = this.samples;
        let a = samples[0], b = null;
        for (let i = 1; i < samples.length; i++) {
            if (samples[i].time > time) { b = samples[i]; break; }
            a = samples[i];
        }
        let x = a.x, y = a.y;
        if (b && time >= a.time) {
            ({ x, y } = interpolatePosition(a, b, (time - a.time) / (b.time - a.time)));
        } else if (!b && samples.length > 1 && a.walking && a.alive) {
            const previous = samples.at(-2);
            const duration = Math.max(1, a.time - previous.time);
            let vx = (a.x - previous.x) / duration, vy = (a.y - previous.y) / duration;
            const speed = Math.hypot(vx, vy);
            if (speed > .12) { vx *= .12 / speed; vy *= .12 / speed; }
            const prediction = Math.max(0, Math.min(150, time - a.time));
            x += vx * prediction; y += vy * prediction;
        }
        if (this.rendered) {
            const dx = x - this.rendered.x, dy = y - this.rendered.y;
            const distance = Math.hypot(dx, dy);
            const follow = Math.min(1, dt * .24 / (distance || 1));
            x = this.rendered.x + dx * follow; y = this.rendered.y + dy * follow;
        }
        this.rendered = { x, y };
        const state = b && a.visuals ? { ...a, visuals: interpolateVisuals(a.visuals, b.visuals, (time - a.time) / (b.time - a.time)) } : a;
        return { x, y, state, time, action: this.actionAt(time) };
    }

    actionAt(time) {
        let found = null;
        for (const action of this.actions.values()) {
            const [, start, windup, end, ranged, facing] = action;
            const elapsed = time - start;
            if (elapsed < 0 || elapsed >= end || found && start < found.start) continue;
            const frame = elapsed < windup ? Math.min(3, Math.floor(4 * elapsed / windup))
                : Math.min(8, 4 + Math.floor(5 * (elapsed - windup) / 210));
            found = { start, frame, ranged, facing };
        }
        return found;
    }
}
