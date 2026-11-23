export function warlockAuraState(combat, now) {
    const cast = combat.attackVisual;
    if (combat.classKey !== 'warlock' || combat.health <= 0 || !cast?.ranged || now < cast.start) return null;
    const release = cast.start + cast.castMs;
    const end = Math.max(cast.end, release) + 420;
    if (now >= end) return null;
    return { strength: Math.min(1, (now - cast.start) / 120, (end - now) / 420),
        release, still: !!combat.scene.motionPreference?.matches };
}

export function drawWarlockAura(combat, aura, now) {
    const { x, y } = combat.scene.position;
    const phase = aura.still ? .42 : (now % 1800) / 1800;
    const intensity = aura.strength;
    const g = combat.effect;
    g.fillStyle(0x100b1c, .35 * intensity).fillEllipse(Math.round(x),Math.round(y-1),32,9);
    combat.vfx?.play('summon',x,y-16,phase,.48,0,.34*intensity);
    combat.vfx?.play('curse',x,y-15,aura.still ? .42 : (phase+.5)%1,.36,0,.38*intensity);
    const facing = combat.scene.facing ?? 'south';
    const hands = facing === 'east' ? [[-2,-13]] : facing === 'west' ? [[2,-13]]
        : facing.startsWith('north') ? [] : [[-8,-13],[8,-13]];
    for (const [index,[dx,dy]] of hands.entries()) {
        combat.vfx?.play('chaos',x+dx,y+dy,aura.still ? .42 : (phase+index*.35)%1,.18,0,.85*intensity);
    }
    if (!aura.still) {
        for (let i=0;i<8;i++) {
            const life=(phase+i/8)%1;
            const side=i%2 ? -1 : 1;
            const px=Math.round(x+side*(14+Math.sin(life*Math.PI)*4));
            const py=Math.round(y-3-life*40);
            const alpha=Math.sin(life*Math.PI)*intensity;
            g.fillStyle(0x21152d,alpha*.65).fillRect(px-1,py,3,5);
            g.fillStyle(i%3 ? 0x9863bb : 0x8fb7a7,alpha*.65).fillRect(px,py,1,2);
        }
    }
    const burst = (now-aura.release)/210;
    if (burst>=0 && burst<1) combat.vfx?.play('chaos',x,y-16,aura.still ? .42 : burst,.48,0,(1-burst)*.7*intensity);
}
