/** Layout do cômodo, em metros, com origem no centro do chão. */
export const ROOM = { halfW: 2.4, halfD: 2.0 }

export const SPOTS = {
  bowl: [0.95, -0.35] as [number, number],
  water: [1.42, -0.35] as [number, number],
  litter: [-1.75, 0.95] as [number, number],
  bed: [-1.0, 1.05] as [number, number],
  window: [0.0, -1.72] as [number, number],
  scratcher: [1.85, 0.9] as [number, number],
}

export function clampToRoom(p: [number, number]): [number, number] {
  return [
    Math.max(-ROOM.halfW + 0.25, Math.min(ROOM.halfW - 0.25, p[0])),
    Math.max(-ROOM.halfD + 0.25, Math.min(ROOM.halfD - 0.25, p[1])),
  ]
}

export function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}
