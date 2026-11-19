const fs = require('fs');

function inspectGLB(filePath) {
    const buffer = fs.readFileSync(filePath);
    const magic = buffer.readUInt32LE(0);
    const version = buffer.readUInt32LE(4);
    const length = buffer.readUInt32LE(8);
    
    const chunkLength = buffer.readUInt32LE(12);
    const chunkType = buffer.readUInt32LE(16); // 0x4E4F534A = 'JSON'
    
    const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
    const gltf = JSON.parse(jsonString);
    
    console.log("=== GLB File:", filePath, "===");
    console.log("Nodes:", JSON.stringify(gltf.nodes, null, 2));
    if (gltf.meshes) {
        console.log("Meshes count:", gltf.meshes.length);
        gltf.meshes.forEach((m, idx) => {
            console.log(`Mesh ${idx} name:`, m.name, "primitives:", m.primitives.length);
        });
    }
}

try {
    inspectGLB('models/new_pro/New_Pro.glb');
} catch (e) {
    console.error(e);
}
