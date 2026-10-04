export type CameraPreset = 'city' | 'site'
export type LayerVisibility = { areas: boolean; services: boolean; rings: boolean }
export type CameraCommand = { kind: 'reset' | 'in' | 'out'; serial: number }
export const DEFAULT_LAYERS: LayerVisibility = { areas: true, services: true, rings: true }

/** Perspective fit in scene kilometres. The atlas itself stays in projected metres. */
export function cityCameraDistance(bounds: number[], aspect: number, fov = 50) {
  const width = (bounds[2] - bounds[0]) / 1000
  const depth = (bounds[3] - bounds[1]) / 1000
  return Math.max(width / Math.max(.3, aspect), depth) / (2 * Math.tan(fov * Math.PI / 360)) * 1.3
}

/** Sample only frames in an uninterrupted period of active rendering. */
export class FrameQuality {
  private elapsed = 0
  private count = 0
  private previous = false
  sample(delta: number, active: boolean) {
    if (!active) { this.previous = false; this.elapsed = 0; this.count = 0; return false }
    if (!this.previous) { this.previous = true; return false }
    this.elapsed += delta
    this.count++
    if (this.elapsed < .6 || this.count < 8) return false
    const slow = this.count / this.elapsed < 30
    this.elapsed = 0; this.count = 0
    return slow
  }
}
