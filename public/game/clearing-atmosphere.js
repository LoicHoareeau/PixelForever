import { clearingGlades } from './clearing-layout.js';

export const clearingSunbeams = [[218,280,38,154],[574,224,32,180],[468,418,30,140]];

export function createClearingAtmosphere(scene) {
    const layer=scene.add.graphics().setDepth(2.5).setBlendMode('ADD');
    let last=-1,lastView='';
    return (time,still) => {
        const tick=still?0:Math.floor(time/80);
        const view=scene.cameras.main.worldView;
        const viewKey=Math.floor(view.x/64)+':'+Math.floor(view.y/64);
        if(tick===last&&viewKey===lastView)return;last=tick;lastView=viewKey;layer.clear();
        for(const [x,y,width,height] of clearingSunbeams) {
            if(x+height<view.x||x-width>view.right||y+height<view.y||y>view.bottom)continue;
            const drift=still?0:Math.sin(time/6500+x)*2;
            for(let band=0;band<3;band++) {
                const inset=band*width*.18,lean=height*.48+drift;
                layer.fillStyle(0xffe3a2,.024-band*.003);
                layer.fillPoints([{x:x+inset,y},{x:x+width-inset,y},
                    {x:x+lean+width*1.3-inset,y:y+height},{x:x+lean+inset,y:y+height}],true);
            }
        }
        if(still)return;
        for(const [index,[cx,cy]] of clearingGlades.entries()) for(let n=0;n<3;n++) {
            const phase=(time/(9500+n*1200)+index*.31+n*.27)%1;
            const x=cx*16+(n-1)*25+Math.sin(phase*6.28+index)*9;
            const y=cy*16+24-phase*58;
            if(x<view.x||x>view.right||y<view.y||y>view.bottom)continue;
            layer.fillStyle(0xffe8b0,Math.sin(phase*Math.PI)*.28).fillRect(Math.round(x),Math.round(y),1,1);
        }
    };
}
