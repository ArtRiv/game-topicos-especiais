const { createCanvas, loadImage } = require('canvas');

async function dumpAll() {
    const image = await loadImage('public/assets/spells/Water Effect 01/Water Effect SpriteSheet/Water Spike 01 - SpriteSheet.png');
    const data = createCanvas(320, 320).getContext('2d');
    data.drawImage(image, 0, 0);
    const id = data.getImageData(0,0,320,320).data;
    
    for(let i=0; i<20; i++) {
        const row = Math.floor(i / 5);
        const col = i % 5;
        let p = 0;
        for(let y=0; y<80; y++) {
            for(let x=0; x<64; x++) {
                if(id[((row*80+y)*320 + (col*64+x))*4+3] > 0) p++;
            }
        }
        console.log(`Frame ${i}: ${p} pixels`);
    }
}
dumpAll();