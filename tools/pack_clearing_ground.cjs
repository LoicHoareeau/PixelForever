// Keep the approved two-material painting intact; the map samples it without smoothing.
const path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict');
(async()=>{
    const source=process.argv[2];assert(source,'Pass the approved grass/earth texture image.');
    const image=sharp(source),info=await image.metadata();
    assert.equal(info.width,info.height*2,'Expected two square materials side by side.');
    const output=path.resolve(__dirname,'../public/game/val-des-saules/clearing-ground-v3.webp');
    await image.webp({lossless:true,effort:3}).toFile(output);
    console.log('Packed two ground materials without resizing:',output);
})().catch(error=>{console.error(error);process.exitCode=1;});
