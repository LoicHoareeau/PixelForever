export const equippedWeaponStyles = { hunter: 'bow', rogue: 'daggers', warlock: 'shadow' };

export function bowGrip(position, facing) {
    const index = ['east','south-east','south','south-west','west','north-west','north','north-east'].indexOf(facing);
    const angle = Math.max(0, index) * Math.PI / 4;
    // Cellule 64 px, poignée à (32 + 12 cos, 32 + 7 sin), origine verticale 56 px.
    return { x: Math.round(position.x) + Math.round(Math.cos(angle) * 12),
        y: Math.round(position.y) - 24 + Math.round(Math.sin(angle) * 7) };
}
