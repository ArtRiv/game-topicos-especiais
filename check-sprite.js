const { createCanvas, loadImage } = require('canvas');

loadImage('public/assets/spells/Water Effect 01/Water Effect SpriteSheet/Water Spike 01 - SpriteSheet.png').then(image => { 
    const canvas = createCanvas(image.width, image.height); 
    const ctx = canvas.getContext('2d'); 
    ctx.drawImage(image, 0, 0); 
    const data = ctx.getImageData(0, 0, image.width, image.height).data; 
    let minX = 999, maxX = -1, minY = 999, maxY = -1; 
    for(let i=0; i<data.length; i+=4) { 
        if(data[i+3] > 0) { 
            const x = (i/4) % image.width; 
            const y = Math.floor((i/4) / image.width); 
            if(x<minX) minX=x; 
            if(x>maxX) maxX=x; 
            if(y<minY) minY=y; 
            if(y>maxY) maxY=y; 
        } 
    } 
    console.log(`Bounds: x=${minX}..${maxX}, y=${minY}..${maxY}`); 

    console.log('80x80 blocks:');
    for(let row=0; row<image.height; row+=80) { 
        let s = ''; 
        for(let col=0; col<image.width; col+=80) { 
            let hasPixel = false; 
            for(let y=row; y<row+80; y++) { 
                for(let x=col; x<col+80; x++) { 
                    const idx = (y*image.width + x)*4; 
                    if(data[idx+3] > 0) hasPixel = true; 
                } 
            } 
            s += hasPixel ? '[X]' : '[ ]'; 
        } 
        console.log(s); 
    } 
    
    console.log('64x64 blocks:');
    for(let row=0; row<image.height; row+=64) { 
        let s = ''; 
        for(let col=0; col<image.width; col+=64) { 
            let hasPixel = false; 
            for(let y=row; y<row+64; y++) { 
                for(let x=col; x<col+64; x++) { 
                    const idx = (y*image.width + x)*4; 
                    if(data[idx+3] > 0) hasPixel = true; 
                } 
            } 
            s += hasPixel ? '[X]' : '[ ]'; 
        } 
        console.log(s); 
    } 
});