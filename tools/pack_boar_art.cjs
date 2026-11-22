const sharp=require('sharp'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
    const source=process.argv[2];assert(source,'Pass the 12-column, 8-direction boar sheet.');
    const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width/12,info.height/8,'Expected square sprite cells.');
    const cell=info.width/12,parts=[];
    for(let row=0;row<8;row++){
        const poses=[];
        for(let col=0;col<12;col++){
            let left=cell,top=cell,right=0,bottom=0;
            for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
                if(data[((row*cell+y)*info.width+col*cell+x)*4+3]<80)continue;
                left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
            }
            assert(right>left&&bottom>top,`Empty pose ${row}:${col}`);
            poses.push({left:col*cell+left,top:row*cell+top,width:right-left,height:bottom-top});
        }
        const scale=Math.min(47/Math.max(...poses.map(p=>p.width)),30/Math.max(...poses.map(p=>p.height)));
        const images=await Promise.all(poses.map(async box=>{
            const width=Math.max(1,Math.round(box.width*scale)),height=Math.max(1,Math.round(box.height*scale));
            return {input:await sharp(source).extract(box).resize(width,height,{kernel:'nearest'}).png().toBuffer(),width,height};
        }));
        // Eight drawn steps map to the existing 36-phase timing; no synthetic limb deformation.
        for(let phase=0;phase<40;phase++){
            const column=phase===0?0:phase<=36?1+Math.floor((phase-1)*8/36):phase-28;
            const image=images[column],index=row*40+phase;
            parts.push({input:image.input,left:(index%20)*64+Math.round((64-image.width)/2),top:Math.floor(index/20)*64+54-image.height});
        }
    }
    const output=path.resolve(__dirname,'../public/game/val-des-saules/monsters/boar-v2.png');
    await sharp({create:{width:1280,height:1024,channels:4,background:'#00000000'}}).composite(parts).png().toFile(output);
    console.log('Packed boar: eight directions, eight drawn walk poses and three attack poses each.',output);
})().catch(error=>{console.error(error);process.exitCode=1;});
