import assert from 'node:assert/strict';
import test from 'node:test';
import { coastalLookouts, columns, rows, tileSize, zones } from '../public/game/exploration.js';
import {
    biomeWeights,
    distanceToZoneEuclidean,
    smoothstep,
    tileHasNonClearingBiome,
    transitionZoneLabel,
} from '../public/game/biome-gradient.js';

function centerPx(zone) {
    return [
        ((zone.left + zone.right + 1) / 2) * tileSize,
        ((zone.top + zone.bottom + 1) / 2) * tileSize,
    ];
}

test('les poids de biomes forment une partition de l’unité sur toute la carte', () => {
    for (let ty = 0; ty < rows; ty += 4) {
        for (let tx = 0; tx < columns; tx += 4) {
            const x = (tx + 0.5) * tileSize;
            const y = (ty + 0.5) * tileSize;
            const weights = biomeWeights(x, y, tileSize);
            const sum = weights.clearing + weights.cemetery + weights.mountain + weights.wasteland;
            assert.ok(weights.clearing >= 0 && weights.clearing <= 1);
            assert.ok(weights.cemetery >= 0 && weights.cemetery <= 1);
            assert.ok(weights.mountain >= 0 && weights.mountain <= 1);
            assert.ok(weights.wasteland >= 0 && weights.wasteland <= 1);
            assert.ok(Math.abs(sum - 1) < 1e-5, `somme invalide (${sum}) en ${tx},${ty}`);
        }
    }
});

test('les cœurs de biomes restent purs sans mélange destructif', () => {
    assert.ok(biomeWeights(...centerPx(zones.boar)).clearing > 0.99);
    assert.ok(biomeWeights(...centerPx(zones.skeleton)).cemetery > 0.99);
    assert.ok(biomeWeights(...centerPx(zones.dragon)).mountain > 0.99);
    assert.ok(biomeWeights(...centerPx(zones.imp)).wasteland > 0.99);
    assert.ok(biomeWeights(...centerPx(zones.hound)).wasteland > 0.99);
    assert.ok(biomeWeights(...centerPx(zones.fiend)).wasteland > 0.99);
});

test('les couloirs inter-biomes évoluent progressivement sans saut brutal', () => {
    const checkSmoothGradient = (points, key) => {
        let maxStep = 0;
        let middleCount = 0;
        let previous = biomeWeights(...points[0])[key];
        for (let i = 1; i < points.length; i++) {
            const current = biomeWeights(...points[i])[key];
            maxStep = Math.max(maxStep, Math.abs(current - previous));
            if (current >= 0.15 && current <= 0.85) {
                middleCount++;
            }
            previous = current;
        }
        assert.ok(maxStep < 0.35, `variation trop brutale sur ${key} : ${maxStep}`);
        assert.ok(middleCount >= 4, `pas assez de tuiles intermédiaires sur ${key} : ${middleCount}`);
    };

    // Route Clairière -> Cimetière (descente le long de x = 103)
    const boarToCemetery = [];
    for (let ty = 34; ty <= 54; ty++) {
        boarToCemetery.push([(103 + 0.5) * tileSize, (ty + 0.5) * tileSize]);
    }
    checkSmoothGradient(boarToCemetery, 'cemetery');

    // Route Cimetière -> Montagnes (est le long de y = 71)
    const cemeteryToMountain = [];
    for (let tx = 128; tx <= 148; tx++) {
        cemeteryToMountain.push([(tx + 0.5) * tileSize, (71 + 0.5) * tileSize]);
    }
    checkSmoothGradient(cemeteryToMountain, 'mountain');

    // Route Montagnes -> Terres dévastées (est le long de y = 95)
    const mountainToWasteland = [];
    for (let tx = 186; tx <= 202; tx++) {
        mountainToWasteland.push([(tx + 0.5) * tileSize, (95 + 0.5) * tileSize]);
    }
    checkSmoothGradient(mountainToWasteland, 'wasteland');
});

test('la cohérence littorale protège Baie de Saphyr / Baie Émeraude et garde Cap d’Obsidienne volcanique', () => {
    const sapphireLookout = coastalLookouts.find((l) => l.name.includes('Saphyr'));
    const emeraldLookout = coastalLookouts.find((l) => l.name.includes('Émeraude'));
    const obsidianLookout = coastalLookouts.find((l) => l.name.includes('Obsidienne'));

    assert.equal(biomeWeights((sapphireLookout.centerCell[0] + 0.5) * tileSize, (sapphireLookout.centerCell[1] + 0.5) * tileSize).wasteland, 0);
    assert.equal(biomeWeights((emeraldLookout.centerCell[0] + 0.5) * tileSize, (emeraldLookout.centerCell[1] + 0.5) * tileSize).wasteland, 0);
    assert.ok(biomeWeights((obsidianLookout.centerCell[0] + 0.5) * tileSize, (obsidianLookout.centerCell[1] + 0.5) * tileSize).wasteland > 0.7);

    assert.equal(tileHasNonClearingBiome(10, 10), false);
    assert.equal(tileHasNonClearingBiome(137, 71), true);
    assert.equal(smoothstep(0), 0);
    assert.equal(smoothstep(1), 1);
    assert.ok(distanceToZoneEuclidean(zones.boar, 100, 100) === 0);
});

test('les libellés de lisière identifient chaque couloir de transition', () => {
    assert.equal(transitionZoneLabel(11 * tileSize, 11 * tileSize), 'Sentier des Saules');
    assert.equal(transitionZoneLabel(103 * tileSize, 46 * tileSize), 'Lisière du Cimetière');
    assert.equal(transitionZoneLabel(139 * tileSize, 71 * tileSize), 'Contreforts de Saphyr');
    assert.equal(transitionZoneLabel(195 * tileSize, 95 * tileSize), 'Marches calcinées');
});
