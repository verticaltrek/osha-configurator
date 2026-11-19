const fs = require('fs');

function findTopClampCenter(filePath) {
    if (!fs.existsSync(filePath)) return;
    const buffer = fs.readFileSync(filePath);
    const chunkLength = buffer.readUInt32LE(12);
    const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
    const gltf = JSON.parse(jsonString);

    console.log(`\n========================================`);
    console.log(`Inspecting Top Vertices for: ${filePath}`);

    // Find position accessor data
    let positions = [];
    gltf.accessors.forEach((acc) => {
        if (acc.type === 'VEC3' && acc.min && acc.max) {
            // Found position attribute bounds
            console.log("Accessor bounds - Min:", acc.min.map(v=>v.toFixed(3)), "Max:", acc.max.map(v=>v.toFixed(3)));
            
            // Check scale
            let scale = 1.0;
            if (Math.abs(acc.max[0] - acc.min[0]) > 10) scale = 0.001;

            const minX = acc.min[0] * scale;
            const maxX = acc.max[0] * scale;
            const minY = acc.min[1] * scale;
            const maxY = acc.max[1] * scale;
            const minZ = acc.min[2] * scale;
            const maxZ = acc.max[2] * scale;

            console.log(`Scaled Bounds (m): X:[${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y:[${minY.toFixed(3)}, ${maxY.toFixed(3)}], Z:[${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`);
            console.log(`Center (m): X=${((minX+maxX)/2).toFixed(3)}, Y=${((minY+maxY)/2).toFixed(3)}, Z=${((minZ+maxZ)/2).toFixed(3)}`);
        }
    });
}

findTopClampCenter('models/new_pro/New_Pro.glb');
findTopClampCenter('models/new_pro/Mini_Omega.glb');
findTopClampCenter('models/light_pro/LightPro.glb');
findTopClampCenter('models/long_range/LongRange.glb');
