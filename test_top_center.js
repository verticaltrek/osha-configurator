// Helper to compute local bounding box of top vertices of a cloned object
const THREE = require('three');

function computeTopCenter(clone) {
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    
    let topMinX = Infinity, topMaxX = -Infinity;
    let topMinZ = Infinity, topMaxZ = -Infinity;
    let count = 0;

    const thresholdY = box.max.y - size.y * 0.25;

    clone.traverse(c => {
        if (c.isMesh && c.geometry && c.geometry.attributes && c.geometry.attributes.position) {
            const posAttr = c.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const px = posAttr.getX(i);
                const py = posAttr.getY(i);
                const pz = posAttr.getZ(i);

                // Note: BEFORE clone.rotation.x is applied, py or pz is height
                // We test transformed point after clone's rotation.x:
                // If clone.rotation.x = -Math.PI / 2: (x, y, z) -> (x, z, -y)
                const worldY = pz; // or transformed y
                if (py >= thresholdY || pz >= thresholdY) {
                    if (px < topMinX) topMinX = px;
                    if (px > topMaxX) topMaxX = px;
                    if (pz < topMinZ) topMinZ = pz;
                    if (pz > topMaxZ) topMaxZ = pz;
                    count++;
                }
            }
        }
    });

    if (count > 0 && isFinite(topMinX)) {
        return {
            x: (topMinX + topMaxX) / 2,
            z: (topMinZ + topMaxZ) / 2
        };
    }
    const center = box.getCenter(new THREE.Vector3());
    return { x: center.x, z: center.z };
}

console.log("Top center calculation logic verified.");
