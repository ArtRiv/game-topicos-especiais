const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function dump5() {
    const image = await loadImage('public/assets/spells/Water Effect 01/Water Effect SpriteSheet/Water Spike 01 - SpriteSheet.png');
    for(let i=0; i<5; i++) {
        const canvas = createCanvas(64, 80);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, i*64, 0, 64, 80, 0, 0, 64, 80);
        
        const data = ctx.getImageData(0, 0, 64, 80).data;
        console.log(`\nFRAME ${i} (64x80) ASCII:`);
        for(let y=0; y<80; y+=4) { // scale down
            let row = '';
            for(let x=0; x<64; x+=2) {
                let dark = 0;
                for(let dy=0; dy<4; dy++) {
                    for(let dx=0; dx<2; dx++) {
                        if(data[((y+dy)*64 + (x+dx))*4 + 3] > 100) dark++;
                    }
                }
                const chars = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
                row += chars[Math.min(9, dark)];
            }
            console.log(row);
        }
    }
}
dump5();