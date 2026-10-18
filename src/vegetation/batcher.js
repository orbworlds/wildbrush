/**
 * Groups instance matrices by material and builds one BatchedMesh per material when multi-draw is available, otherwise one InstancedMesh per geometry.
 */
import { BatchedMesh, Color, InstancedMesh } from 'three';
export class InstanceBatcher {
  groups = new Map();
  multiDraw;
  constructor(renderer) {
    let supported = false;
    try {
      supported = !!renderer.extensions.get('WEBGL_multi_draw');
    } catch {
      supported = false;
    }
    this.multiDraw = supported;
  }
  add(label, geo, material, depth, castShadow, matrices, colors) {
    if (!matrices.length) return;
    let group = this.groups.get(material);
    if (!group)
      this.groups.set(
        material,
        (group = {
          name: label,
          material,
          depth,
          castShadow,
          parts: [],
        }),
      );
    group.castShadow ||= castShadow;
    group.parts.push({
      geo,
      matrices,
      colors: colors ?? matrices.map(() => null),
    });
  }
  build(root) {
    const meshes = [];
    for (const group of this.groups.values())
      if (this.multiDraw) {
        let maxInstances = 0;
        let maxVertices = 0;
        let maxIndices = 0;
        for (const part of group.parts) {
          maxInstances += part.matrices.length;
          maxVertices += part.geo.attributes.position.count;
          maxIndices += part.geo.index ? part.geo.index.count : part.geo.attributes.position.count;
        }
        const mesh = new BatchedMesh(maxInstances, maxVertices, maxIndices, group.material);
        const hasColors = group.parts.some((part) => part.colors.some((color) => color));
        const white = new Color(1, 1, 1);
        for (const part of group.parts) {
          const geoId = mesh.addGeometry(part.geo);
          part.matrices.forEach((matrix, i) => {
            const id = mesh.addInstance(geoId);
            mesh.setMatrixAt(id, matrix);
            if (hasColors) mesh.setColorAt(id, part.colors[i] ?? white);
          });
        }
        mesh.perObjectFrustumCulled = true;
        mesh.sortObjects = true;
        mesh.castShadow = group.castShadow;
        mesh.receiveShadow = true;
        if (group.depth) mesh.customDepthMaterial = group.depth;
        mesh.name = `${group.name}-batch`;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        root.add(mesh);
        meshes.push(mesh);
      } else
        group.parts.forEach((part, partIndex) => {
          const mesh = new InstancedMesh(part.geo, group.material, part.matrices.length);
          part.matrices.forEach((matrix, i) => {
            mesh.setMatrixAt(i, matrix);
            const color = part.colors[i];
            if (color) mesh.setColorAt(i, color);
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.castShadow = group.castShadow;
          mesh.receiveShadow = true;
          if (group.depth) mesh.customDepthMaterial = group.depth;
          mesh.name = `${group.name}-${partIndex}`;
          mesh.computeBoundingSphere();
          root.add(mesh);
          meshes.push(mesh);
        });
    this.groups.clear();
    return meshes;
  }
}
