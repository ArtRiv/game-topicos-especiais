const { createCanvas, loadImage } = require('canvas');

async function dump() {
    for(let i=0; i<4; i++) {
        const image = await loadImage(`frame_${i}.png`);
        const canvas = createCanvas(80, 80);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 80, 80).data;
        
        console.log(`\nFRAME ${i} ASCII:`);
        for(let y=0; y<80; y+=4) { // scale down
            let row = '';
            for(let x=0; x<80; x+=2) {
                let dark = 0;
                for(let dy=0; dy<4; dy++) {
                    for(let dx=0; dx<2; dx++) {
                        if(data[((y+dy)*80 + (x+dx))*4 + 3] > 100) dark++;
                    }
                }
                const chars = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
                row += chars[Math.min(9, dark)];
            }
            console.log(row);
        }
    }
}
dump();