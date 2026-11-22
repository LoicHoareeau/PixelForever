const hash=(x,y)=>{
    let seed=Math.imul(x+17,374761393)^Math.imul(y+31,668265263);
    seed=Math.imul(seed^(seed>>>13),1274126177);
    return (seed^(seed>>>16))>>>0;
};

export function createClearingGround(scene) {
    const texture=scene.textures.createCanvas('clearing-ground-v2',512,256);
    const ctx=texture.getContext();
    ctx.fillStyle='#638845';ctx.fillRect(0,0,256,256);
    ctx.fillStyle='#b58a52';ctx.fillRect(256,0,256,256);
    // Broad, stepped patches break up the flat fill without adding obstacles.
    for(let y=0;y<256;y+=16) for(let x=0;x<256;x+=16) {
        const seed=hash(x>>4,y>>4);
        ctx.fillStyle=['#638845','#688c48','#608442','#6b8e49'][seed%4];
        ctx.fillRect(x,y,16,16);
        ctx.fillStyle=seed%2?'#658947':'#618543';
        ctx.fillRect(x+(seed%3)*3,y+3,10,8);
        ctx.fillStyle=['#b58a52','#b1864f','#ba8e56','#b78b51'][seed%4];
        ctx.fillRect(256+x,y,16,16);
    }
    for(let y=0;y<256;y+=5) for(let x=0;x<256;x+=5) {
        const seed=hash(x,y),px=x+seed%5,py=y+(seed>>>4)%5;
        if(seed%5<3) {
            ctx.fillStyle=seed%2?'#729b4d':'#52753a';ctx.fillRect(px,py,3,2);
            ctx.fillStyle='#87a95a';ctx.fillRect(px+1,py-1,1,2);
            if(seed%3===0) {ctx.fillStyle='#476b36';ctx.fillRect(px,py+2,2,1);}
        }
        if(seed%3===0) {
            ctx.fillStyle='#c3985e';ctx.fillRect(256+px,py,4,2);
            ctx.fillStyle='#a67e4b';ctx.fillRect(257+px,py+2,3,1);
        }
        if(seed%19===0) {
            ctx.fillStyle='#927b57';ctx.fillRect(256+px,py,3,2);
            ctx.fillStyle='#d0b582';ctx.fillRect(256+px,py,2,1);
        }
    }
    texture.refresh();return texture.getSourceImage();
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
