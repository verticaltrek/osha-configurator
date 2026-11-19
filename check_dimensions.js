const fs = require('fs');

function inspectGLBBounds(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log("File not found:", filePath);
        return;
    }
    const buffer = fs.readFileSync(filePath);
    const chunkLength = buffer.readUInt32LE(12);
    const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
    const gltf = JSON.parse(jsonString);

    // Read accessors for min/max of position attributes
    const positionAccessors = [];
    gltf.accessors.forEach((acc, idx) => {
        if (acc.type === 'VEC3' && acc.min && acc.max) {
            positionAccessors.push({ idx, min: acc.min, max: acc.max });
        }
    });

    console.log(`\n=== ${filePath} ===`);
    let overallMin = [Infinity, Infinity, Infinity];
    let overallMax = [-Infinity, -Infinity, -Infinity];

    positionAccessors.forEach(acc => {
        for (let i = 0; i < 3; i++) {
            if (acc.min[i] < overallMin[i]) overallMin[i] = acc.min[i];
            if (acc.max[i] > overallMax[i]) overallMax[i] = acc.max[i];
        }
    });

    const size = [
        overallMax[0] - overallMin[0],
        overallMax[1] - overallMin[1],
        overallMax[2] - overallMin[2]
    ];

    console.log("Raw Min:", overallMin.map(v => v.toFixed(3)));
    console.log("Raw Max:", overallMax.map(v => v.toFixed(3)));
    console.log("Raw Size:", size.map(v => v.toFixed(3)));

    let scale = 1.0;
    if (size[0] > 10 || size[1] > 10 || size[2] > 10) {
        scale = 0.001;
    }
    const scaledSize = size.map(v => (v * scale).toFixed(3));
    console.log("Scaled Size (m) [X, Y, Z]:", scaledSize);
}

const files = [
    'models/new_pro/New_Pro.glb',
    'models/new_pro/Mini_Omega.glb',
    'models/new_pro/PB_HOOKT.glb',
    'models/new_pro/P_Glava_Rigide.glb',
    'models/new_pro/P_Inox_Rigide.glb',
    'models/new_pro/X-Matrix.glb',
    'models/new_pro/X-Cone.glb',
    'models/light_pro/LightPro.glb',
    'models/light_pro/PB_HOOKT.glb',
    'models/light_pro/P_Galva_Rigide.glb',
    'models/light_pro/P_Inox_Rigide.glb',
    'models/long_range/LongRange.glb'
];

files.forEach(inspectGLBBounds);
