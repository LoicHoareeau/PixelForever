import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { RemoteMotion } from '../public/game/remote-motion.js';

// Mesure le lissage seul : ce n'est ni un benchmark GPU ni une mesure de capacité Render.
const actors = Array.from({ length: 10 }, () => new RemoteMotion());
const previous = Array(10).fill(null);
let nextPacket = 0, maxStep = 0, pauses = 0;
const costs = [];
for (let frame = 0; frame < 1800; frame++) {
    const time = frame * 1000 / 60;
    const started = performance.now();
    if (time >= nextPacket) {
        actors.forEach((actor, i) => actor.push({ x: nextPacket * .092, y: i * 24, walking: true, alive: true,
            actions: [[String(Math.floor(nextPacket / 1000)), Math.floor(nextPacket / 1000) * 1000, 180, 390, true, 0]] }, nextPacket));
        nextPacket += [270, 330, 300][Math.floor(nextPacket / 300) % 3];
    }
    actors.forEach((actor, i) => {
        const point = actor.sample(time);
        if (previous[i] && time > 1000) {
            const step = Math.hypot(point.x - previous[i].x, point.y - previous[i].y);
            maxStep = Math.max(maxStep, step);
            if (step < .1) pauses++;
        }
        previous[i] = point;
    });
    costs.push(performance.now() - started);
}
assert.equal(pauses, 0);
assert.ok(maxStep < 4.1);
costs.sort((a, b) => a - b);
console.log(JSON.stringify({ actors: 10, simulatedSeconds: 30, frames: 1800, pauses,
    maximumStepPixels: +maxStep.toFixed(3), smoothingCpuP95Ms: +costs[Math.floor(costs.length * .95)].toFixed(3) }, null, 2));
