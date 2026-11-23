// Cell coordinates: the trail connects to the existing northern road and leaves open hunting glades.
export const clearingTrail = [[22,17],[18,21],[16,27],[19,33],[25,36],[34,35],[40,30],[44,24],[42,18],[46,16]];
export const clearingGlades = [[16,27,5],[34,34,5],[42,22,4]];

export function paintClearingTrail(terrain) {
    for (let n=1;n<clearingTrail.length;n++) {
        const [ax,ay]=clearingTrail[n-1], [bx,by]=clearingTrail[n];
        const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay));
        for(let step=0;step<=steps;step++) {
            const x=Math.round(ax+(bx-ax)*step/steps),y=Math.round(ay+(by-ay)*step/steps);
            for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
                const tile=terrain[y+dy]?.[x+dx];
                if(tile===33||tile===32) terrain[y+dy][x+dx]=32;
            }
        }
    }
}

export function inClearingGlade(x,y,tileSize=16) {
    return clearingGlades.some(([cx,cy,r])=>Math.hypot(x/tileSize-cx,y/tileSize-cy)<r);
}

export function clearingScenery(tileSize=16) {
    return [
        {kind:'log',cell:[8,25],width:48,height:30,collision:[-19,-5,38,6]},
        {kind:'log',cell:[48,39],width:43,height:27,collision:[-17,-4,34,5]},
        {kind:'flowers',cell:[12,25],width:24,height:22},
        {kind:'flowers',cell:[28,32],width:26,height:23},
        {kind:'flowers',cell:[39,26],width:25,height:22},
        {kind:'flowers',cell:[46,18],width:22,height:20},
        {kind:'sign',cell:[25,19],width:24,height:32,collision:[-2,-3,4,4]},
    ].map(prop=>({...prop,x:(prop.cell[0]+.5)*tileSize,y:(prop.cell[1]+.5)*tileSize}));
}
