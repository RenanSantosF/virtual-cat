import * as THREE from 'three'
import { makeNoise } from './noise'
import { coatTexture, furNormalTexture, type Coat } from './coat'

/** Máscara de densidade de pelo: cada fio ocupa um pixel e tem um comprimento. */
function furAlphaTexture(seed: number, size = 512): THREE.DataTexture {
  const { rand } = makeNoise(seed ^ 0x5eed)
  const data = new Uint8Array(size * size * 4)
  // Metade dos pixels vira fio; o valor guarda o comprimento relativo do fio.
  for (let i = 0; i < size * size; i++) {
    const isStrand = rand() < 0.42
    const len = isStrand ? 0.35 + rand() * 0.65 : 0
    const v = Math.floor(len * 255)
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

export interface FurSet {
  /** Material da "pele": a superfície sólida sob o pelo. */
  skin: THREE.MeshPhysicalMaterial
  /** Camadas de casca, da mais interna à mais externa. */
  shells: THREE.MeshPhysicalMaterial[]
  coatMap: THREE.Texture
  dispose(): void
}

export type Quality = 'low' | 'medium' | 'high'

const SHELL_COUNT: Record<Quality, number> = { low: 0, medium: 6, high: 12 }

/**
 * Pelagem em duas partes: um material físico com brilho de veludo (sheen), que
 * já sozinho evita o aspecto de plástico, e um conjunto de cascas deslocadas ao
 * longo da normal que dá volume e silhueta felpuda de verdade.
 */
export function makeFur(coat: Coat, seed: number, quality: Quality, furLength = 0.006): FurSet {
  const coatMap = coatTexture(coat, seed)
  const normalMap = furNormalTexture(seed)
  const alphaNoise = furAlphaTexture(seed)

  const skin = new THREE.MeshPhysicalMaterial({
    map: coatMap,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color(0xffe9d2),
    clearcoat: 0,
  })

  const shells: THREE.MeshPhysicalMaterial[] = []
  const n = SHELL_COUNT[quality]

  for (let i = 1; i <= n; i++) {
    const t = i / n
    const m = new THREE.MeshPhysicalMaterial({
      map: coatMap,
      normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.95,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.3,
      sheenColor: new THREE.Color(0xfff0e0),
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    m.userData.shell = t
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uShell = { value: t }
      shader.uniforms.uFurLength = { value: furLength }
      shader.uniforms.uFurNoise = { value: alphaNoise }
      shader.uniforms.uFurScale = { value: 34.0 }
      // Gravidade do pelo: as camadas externas caem um pouco, como pelo real.
      shader.uniforms.uDroop = { value: 0.35 }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uShell;
           uniform float uFurLength;
           uniform float uDroop;
           varying float vShell;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vShell = uShell;
           transformed += objectNormal * (uFurLength * uShell);
           transformed.y -= uFurLength * uShell * uShell * uDroop;`,
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uFurNoise;
           uniform float uFurScale;
           varying float vShell;`,
        )
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
           float strand = texture2D(uFurNoise, vMapUv * uFurScale).r;
           // O fio só existe até o seu próprio comprimento: cascas mais externas
           // ficam cada vez mais esparsas, e é isso que cria a silhueta macia.
           if (strand < vShell) discard;
           // Escurece a raiz: oclusão entre os fios.
           diffuseColor.rgb *= mix(0.55, 1.08, vShell);`,
        )
    }
    shells.push(m)
  }

  return {
    skin,
    shells,
    coatMap,
    dispose() {
      coatMap.dispose()
      normalMap.dispose()
      alphaNoise.dispose()
      skin.dispose()
      shells.forEach((s) => s.dispose())
    },
  }
}

/** Detecta uma qualidade razoável para o aparelho. */
export function autoQuality(): Quality {
  const forced = localStorage.getItem('virtual-cat:quality')
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency ?? 4
  const dpr = window.devicePixelRatio || 1
  const small = Math.min(window.innerWidth, window.innerHeight) < 400
  if (mem <= 2 || cores <= 4 || small) return 'low'
  if (mem <= 4 || cores <= 6 || dpr > 3) return 'medium'
  return 'high'
}
