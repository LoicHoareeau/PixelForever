const hash=(x,y)=>{
    let seed=Math.imul(x+17,374761393)^Math.imul(y+31,668265263);
    seed=Math.imul(seed^(seed>>>13),1274126177);
    return (seed^(seed>>>16))>>>0;
};

export function createClearingGround(scene) {
    return scene.textures.get('clearing-ground-v4').getSourceImage();
}

export function clearingRoadMask(terrain,column,row,size=16) {
    const road=(x,y)=>{const t=terrain[y]?.[x];return t>=16&&t<=32;};
    const mask=new Uint8ClampedArray(size*size*4);
    const seed=hash(column,row);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const edge=1+((seed+x*3+y*5)>>>2)%2;
        const trimmed=(!road(column-1,row)&&x<edge)||(!road(column+1,row)&&x>=size-edge)
            ||(!road(column,row-1)&&y<edge)||(!road(column,row+1)&&y>=size-edge);
        mask[(y*size+x)*4+3]=trimmed?0:255;
    }
    return mask;
}

export function createClearingSceneryTextures(scene) {
    const definitions=[['willow-0','oak',72,80],['willow-1','willow',72,80],['willow-2','fir',64,80],
        ['mountain-rock','rock',80,58],['coastal-cliff','cliff',64,64],
        ['clearing-log','log',48,30],['clearing-sign','sign',24,32],['clearing-flowers','flowers',26,24]];
    for(const [key,name,width,height] of definitions) {
        if(scene.textures.exists(key)) scene.textures.remove(key);
        const frame=scene.textures.getFrame('clearing-props-v2',name);
        const texture=scene.textures.createCanvas(key,width,height),ctx=texture.getContext();
        ctx.imageSmoothingEnabled=false;
        const scale=Math.min(width/frame.cutWidth,height/frame.cutHeight);
        const w=Math.round(frame.cutWidth*scale),h=Math.round(frame.cutHeight*scale);
        ctx.drawImage(frame.source.image,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,
            Math.round((width-w)/2),height-h,w,h);
        texture.refresh();
    }
}
