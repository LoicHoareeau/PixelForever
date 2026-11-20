export const townName = 'Bastion de Braise';
export const starterTown = { x: 976, y: 384, width: 608, height: 405 };

// Positions relevées sur la maquette de la ville (1536 × 1024 px).
function townPoint(x, y) {
    return {
        x: starterTown.x + Math.round(x / 1536 * starterTown.width),
        y: starterTown.y + Math.round(y / 1024 * starterTown.height),
    };
}

export const starterSpawn = { ...townPoint(665, 495), facing: 'south' };
export const townResidents = [
    { ...townPoint(500, 385), frame: 0, range: 40, name: 'Granm', role: 'forgeron',
        dialogue: 'Le fer de ces collines tient bien la trempe. Un jour, je te montrerai comment en tirer une lame.' },
    { ...townPoint(1090, 410), frame: 1, range: 40, name: 'Vesha', role: 'herboriste',
        dialogue: 'La sève des saules calme les brûlures. Les feuilles fraîches se cueillent près des ruisseaux.' },
    { ...townPoint(620, 555), frame: 2, range: 48, name: 'Rakka', role: 'intendante' },
    { ...townPoint(1080, 555), frame: 3, range: 40, name: 'Drok', role: 'marchand',
        dialogue: 'Mes convois entrent par la porte est. Quand la route sera sûre, les étals retrouveront leurs couleurs.' },
];
export const questNpc = townResidents[2];

export function isInStarterTown(x, y, margin = 0) {
    return x >= starterTown.x - margin && x < starterTown.x + starterTown.width + margin
        && y >= starterTown.y - margin && y < starterTown.y + starterTown.height + margin;
}

export function nearestTownResident(position) {
    let nearest = null;
    let bestDistance = Infinity;
    for (const resident of townResidents) {
        const distance = Math.hypot(resident.x - position.x, resident.y - position.y);
        if (distance <= resident.range && distance < bestDistance) {
            nearest = resident;
            bestDistance = distance;
        }
    }
    return nearest;
}

// Emprises au sol des façades, palissades et du grand tambour.
export const townObstacles = [
    [58, 33, 722, 119], [819, 33, 1466, 119], [47, 76, 105, 990],
    [61, 890, 722, 994], [826, 890, 1475, 994],
    [1413, 69, 1474, 442], [1413, 531, 1474, 998],
    [115, 109, 733, 342], [842, 108, 1414, 361],
    [103, 575, 752, 875], [838, 589, 1413, 895],
    [141, 373, 422, 545],
].map(([left, top, right, bottom]) => {
    const start = townPoint(left, top);
    const end = townPoint(right, bottom);
    return [start.x, start.y, end.x - start.x, end.y - start.y];
}).concat(townResidents.map(({ x, y }) => [x - 6, y - 5, 12, 8]));

export function createStarterTown(scene) {
    const { x, y, width, height } = starterTown;
    const floor = scene.textures.createCanvas('starter-town-floor', width, height);
    const context = floor.getContext();
    context.imageSmoothingEnabled = false;
    context.drawImage(scene.textures.get('starter-town').getSourceImage(), 0, 0, width, height);
    // Fondre la lisière illustrée avec le terrain de la carte.
    context.globalCompositeOperation = 'destination-in';
    for (const [gradient, edge, size] of [
        [context.createLinearGradient(0, 0, width, 0), 10, width],
        [context.createLinearGradient(0, 0, 0, height), 8, height],
    ]) {
        gradient.addColorStop(0, '#0000');
        gradient.addColorStop(edge / size, '#000');
        gradient.addColorStop(1 - edge / size, '#000');
        gradient.addColorStop(1, '#0000');
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
    }
    context.globalCompositeOperation = 'source-over';
    floor.refresh();
    scene.add.image(x, y, floor.key).setOrigin(0).setDepth(1);
    for (const bounds of townObstacles) scene.obstacles.push(new window.Phaser.Geom.Rectangle(...bounds));
    const occupants = townResidents.map(resident => {
        const { x, y, frame, name } = resident;
        scene.add.ellipse(x, y - 1, 22, 7, 0x321a17, .48).setDepth(3);
        const sprite = scene.add.image(x, y, 'town-residents', frame).setOrigin(.5, 1).setDepth(y)
            .setInteractive({ useHandCursor: true });
        const label = scene.add.text(x, y - (resident === questNpc ? 62 : 44), name, {
            fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold',
            color: '#f6dca6', stroke: '#251917', strokeThickness: 3,
        }).setOrigin(.5, 1).setDepth(5000).setVisible(false);
        return { resident, sprite, label };
    });

    const fires = [[465, 250], [225, 485], [355, 484], [1013, 272], [1133, 272], [369, 789], [562, 789], [1139, 700]]
        .map(([x, y]) => townPoint(x, y));
    const lights = fires.map(point => ({ ...point, radius: 62, color: 0xff964c, lift: .37, glow: .25, flicker: true }));
    const chimney = townPoint(435, 22);
    const charms = townPoint(1095, 146);
    lights.push({ ...charms, radius: 43, color: 0x73f1ca, lift: .32, glow: .23, flicker: true });
    const effects = scene.add.graphics().setDepth(2);
    let previousFrame = -1;
    return {
        occupants,
        lights,
        animate(time, still) {
            const nearby = nearestTownResident(scene.position);
            for (const { resident, label } of occupants) label.setVisible(resident === nearby);
            const frame = still ? 0 : Math.floor(time / 85);
            if (frame === previousFrame) return;
            previousFrame = frame;
            effects.clear();
            for (const [index, { x, y }] of fires.entries()) {
                const flicker = (frame + index * 3) % 4;
                effects.fillStyle(0xffb754, .28 + flicker * .07).fillRect(x - 2, y - flicker, 5, 3 + flicker);
                effects.fillStyle(0xffe0a0, .56).fillRect(x, y - flicker, 2, flicker + 1);
                for (let ember = 0; ember < 5; ember++) {
                    const age = (frame + ember * 5 + index * 3) % 20;
                    effects.fillStyle(ember % 2 ? 0xffd083 : 0xda6333, .85 * (1 - age / 20))
                        .fillRect(x + (ember * 7) % 13 - 6 + Math.floor(age / 4), y - age, 1, 1);
                }
            }
            for (let puff = 0; puff < 6; puff++) {
                const age = (frame + puff * 7) % 42;
                const spread = 2 + Math.floor(age / 8);
                const x = chimney.x + Math.floor(age / 2) + puff % 3 - spread;
                const y = chimney.y - Math.floor(age * .8);
                effects.fillStyle(0x353638, .32 * (1 - age / 42)).fillRect(x, y, spread * 2, spread);
                effects.fillStyle(0x8f7761, .20 * (1 - age / 42)).fillRect(x + 1, y - 1, spread + 1, spread);
            }
            for (let mote = 0; mote < 6; mote++) {
                const angle = frame * .12 + mote * Math.PI / 3;
                const x = Math.round(charms.x + Math.cos(angle) * 12);
                const y = Math.round(charms.y + Math.sin(angle) * 5 - 3);
                effects.fillStyle(0x72e3c5, .20).fillRect(x - 1, y - 1, 3, 3);
                effects.fillStyle(0xcbffe6, .85).fillRect(x, y, 1, 1);
            }
        },
    };
}
