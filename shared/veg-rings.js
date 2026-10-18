/**
 * Trims an instanced grass or flower ring to the grid cells the camera can actually see and returns how many instances to draw.
 */
import { MathUtils, Vector3 } from 'three';
const _viewDir = new Vector3();
export function updateRingRect(camera, groundY, ring, rect) {
  const position = camera.position;
  const radius = ring.radius;
  let minX = position.x - radius;
  let maxX = position.x + radius;
  let minZ = position.z - radius;
  let maxZ = position.z + radius;
  const persp = camera.isPerspectiveCamera ? camera : null;
  if (persp) {
    camera.getWorldDirection(_viewDir);
    const horizLen = Math.hypot(_viewDir.x, _viewDir.z);
    const halfFov = MathUtils.degToRad(persp.fov) * 0.5;
    const backTilt = Math.asin(MathUtils.clamp(-_viewDir.y, -1, 1)) + halfFov - Math.PI / 2;
    const camH = Math.max(0, position.y - groundY) + 1.5;
    if (horizLen > 0.25 && backTilt < 1) {
      const yaw = Math.atan2(_viewDir.x, _viewDir.z);
      const halfHFov = Math.atan(Math.tan(halfFov) * persp.aspect) + 0.2;
      const margin = 3 + (backTilt > 0 ? camH * Math.tan(backTilt) : 0) + camH * 0.15;
      let viewMinX = position.x - margin;
      let viewMaxX = position.x + margin;
      let viewMinZ = position.z - margin;
      let viewMaxZ = position.z + margin;
      for (let i = 0; i <= 6; i++) {
        const rayYaw = yaw - halfHFov + (2 * halfHFov * i) / 6;
        const px = position.x + Math.sin(rayYaw) * radius;
        const pz = position.z + Math.cos(rayYaw) * radius;
        if (px < viewMinX) viewMinX = px;
        if (px > viewMaxX) viewMaxX = px;
        if (pz < viewMinZ) viewMinZ = pz;
        if (pz > viewMaxZ) viewMaxZ = pz;
      }
      minX = Math.max(minX, viewMinX);
      maxX = Math.min(maxX, viewMaxX);
      minZ = Math.max(minZ, viewMinZ);
      maxZ = Math.min(maxZ, viewMaxZ);
    }
  }
  const spacing = ring.spacing;
  const x0 = Math.floor(minX / spacing) - 1;
  const z0 = Math.floor(minZ / spacing) - 1;
  let nx = Math.ceil(maxX / spacing) + 1 - x0;
  let nz = Math.ceil(maxZ / spacing) + 1 - z0;
  nx = Math.max(1, Math.min(ring.maxN, nx));
  nz = Math.max(1, Math.min(ring.maxN, nz));
  rect.set(x0, z0, nx, nz);
  return nx * nz;
}
