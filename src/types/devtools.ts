/** Ganchos que as ferramentas de desenvolvimento penduram na janela. */
declare global {
  interface Window {
    __ready?: boolean
    __info?: unknown
    __an?: unknown
    __pose?: (behavior: string, t: number, stride: number) => void
    __render?: (yaw: number, pitch: number, dist?: number) => void
    __setOpacity?: (v: number) => void
    __catScene?: {
      setCamera(yaw: number, pitch: number, dist: number): void
      freeze(behavior: string | null): void
      cat: unknown
      camera: { position: { toArray(): number[] } }
      camTarget: { toArray(): number[] }
      bodyCenter: { toArray(): number[] }
    }
  }
}
export {}
