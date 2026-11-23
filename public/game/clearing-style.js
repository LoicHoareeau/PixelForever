const hash=(x,y)=>{
    let seed=Math.imul(x+17,374761393)^Math.imul(y+31,668265263);
    seed=Math.imul(seed^(seed>>>13),1274126177);
    return (seed^(seed>>>16))>>>0;
};

export function hash2d(x,y) {
    let h=Math.imul(x,1597334677)^Math.imul(y,3812015801);
    h=Math.imul(h^(h>>>16),2246822519);
    return ((h^(h>>>13))>>>0)/4294967295;
}

export function smoothNoise(x,y,period) {
    const c=Math.floor(x/period),r=Math.floor(y/period);
    const u=x/period-c,v=y/period-r;
    const top=hash2d(c,r)*(1-u)+hash2d(c+1,r)*u;
    const bot=hash2d(c,r+1)*(1-u)+hash2d(c+1,r+1)*u;
    return top*(1-v)+bot*v;
}

export function clamp01(value) {
    return Math.max(0,Math.min(1,value));
}

function edt1d(f,d,v,z,n) {
    let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
    for(let q=1;q<n;q++) {
        let s;
        while(true) {
            const r=v[k];
            s=((f[q]+q*q)-(f[r]+r*r))/(2*(q-r));
            if(s>z[k]) break;
            k--;
        }
        k++;v[k]=q;z[k]=s;z[k+1]=Infinity;
    }
    k=0;
    for(let q=0;q<n;q++) {
        while(z[k+1]<q) k++;
        const dx=q-v[k];
        d[q]=dx*dx+f[v[k]];
    }
}

function edt2d(grid,width,height) {
    const maxLen=Math.max(width,height);
    const f=new Float64Array(maxLen),d=new Float64Array(maxLen),v=new Int32Array(maxLen),z=new Float64Array(maxLen+1);
    const out=new Float64Array(width*height);
    for(let y=0;y<height;y++) {
        const row=y*width;
        for(let x=0;x<width;x++) f[x]=grid[row+x];
        edt1d(f,d,v,z,width);
        for(let x=0;x<width;x++) out[row+x]=d[x];
    }
    for(let x=0;x<width;x++) {
        for(let y=0;y<height;y++) f[y]=out[y*width+x];
        edt1d(f,d,v,z,height);
        for(let y=0;y<height;y++) out[y*width+x]=d[y];
    }
    return out;
}

export function buildSignedDistance(mask,width,height,cellPx) {
    const inf=1e9,gOut=new Float64Array(width*height),gIn=new Float64Array(width*height);
    for(let i=0;i<mask.length;i++) { gOut[i]=mask[i]?0:inf; gIn[i]=mask[i]?inf:0; }
    const dOut=edt2d(gOut,width,height),dIn=edt2d(gIn,width,height);
    const sdf=new Float32Array(width*height);
    for(let i=0;i<mask.length;i++) sdf[i]=(mask[i]?-Math.sqrt(dIn[i])+0.5:Math.sqrt(dOut[i])-0.5)*cellPx;
    return sdf;
}

export function smoothField(field,width,height,passes=2) {
    let src=field;
    for(let pass=0;pass<passes;pass++) {
        const dst=new Float32Array(src.length);
        for(let y=0;y<height;y++) {
            const ym1=Math.max(0,y-1),yp1=Math.min(height-1,y+1),ym2=Math.max(0,y-2),yp2=Math.min(height-1,y+2);
            for(let x=0;x<width;x++) {
                let sum=0;
                for(let ky=-2;ky<=2;ky++) {
                    const row=(ky===-2?ym2:ky===-1?ym1:ky===0?y:ky===1?yp1:yp2)*width;
                    for(let kx=-2;kx<=2;kx++) sum+=src[row+Math.max(0,Math.min(width-1,x+kx))];
                }
                dst[y*width+x]=sum/25;
            }
        }
        src=dst;
    }
    return src;
}

export function bilerpSdf(sdf,width,height,cx,cy) {
    const x=Math.max(0,Math.min(width-1.001,cx)),y=Math.max(0,Math.min(height-1.001,cy));
    const x0=Math.floor(x),y0=Math.floor(y),tx=x-x0,ty=y-y0,i00=y0*width+x0;
    return (sdf[i00]*(1-tx)+sdf[i00+1]*tx)*(1-ty)+(sdf[i00+width]*(1-tx)+sdf[i00+width+1]*tx)*ty;
}

export function readPatternData(image) {
    const canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0);
    return {data:ctx.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height};
}

export function extractTransitionMasks(scene,sheetKey,tileSize,thresholdFn) {
    const canvas=document.createElement('canvas');
    canvas.width=tileSize;canvas.height=tileSize;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    return Array.from({length:16},(_,index)=>{
        ctx.clearRect(0,0,tileSize,tileSize);
        const f=scene.textures.getFrame(sheetKey,index);
        ctx.drawImage(f.source.image,f.cutX,f.cutY,f.cutWidth,f.cutHeight,0,0,f.cutWidth,f.cutHeight);
        const pixels=ctx.getImageData(0,0,tileSize,tileSize).data;
        const mask=new Uint8Array(tileSize*tileSize);
        for(let i=0;i<mask.length;i++) { const p=i*4; mask[i]=thresholdFn(pixels[p],pixels[p+1],pixels[p+2])?1:0; }
        return mask;
    });
}

export function drawSoftShadow(graphics,x,y,width,height,color=0x182d29) {
    graphics.fillStyle(color,.12).fillEllipse(x,y,width,height);
    graphics.fillStyle(color,.14).fillEllipse(x,y,Math.round(width*0.68),Math.max(3,Math.round(height*0.68)));
}

export function createClearingGround(scene) {
    return scene.textures.get('clearing-ground-v5').getSourceImage();
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

function drawFrameToHdCanvas(scene, key, atlasKey, frameName, width, height) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const frame = scene.textures.getFrame(atlasKey, frameName);
    if (!frame) return;
    const texture = scene.textures.createCanvas(key, width, height);
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(width / frame.cutWidth, height / frame.cutHeight);
    const w = Math.round(frame.cutWidth * scale), h = Math.round(frame.cutHeight * scale);
    ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        Math.round((width - w) / 2), height - h, w, h);
    texture.refresh();
}

export function createClearingSceneryTextures(scene) {
    const definitions=[['willow-0','oak',72,80],['willow-1','willow',72,80],['willow-2','fir',64,80],
        ['mountain-rock','rock',80,58],['coastal-cliff','cliff',64,64],
        ['clearing-log','log',48,30],['clearing-sign','sign',24,32],['clearing-flowers','flowers',26,24]];
    for(const [key,name,width,height] of definitions) {
        drawFrameToHdCanvas(scene, key, 'clearing-props-v2', name, width * 2, height * 2);
    }
    if (scene.textures.exists('clearing-extras-v1')) {
        drawFrameToHdCanvas(scene, 'clearing-lantern', 'clearing-extras-v1', 'lantern', 46, 76);
        drawFrameToHdCanvas(scene, 'clearing-reeds', 'clearing-extras-v1', 'reeds', 96, 72);
    }
}
