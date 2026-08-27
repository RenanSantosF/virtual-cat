import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * Tratamento de imagem.
 *
 * Sem isto a cena tem cara de exercício de renderização: tudo igualmente
 * nítido, igualmente iluminado, sem canto escuro nenhum. Uma vinheta discreta,
 * um pouco de grão e uma curva de cor não deixam a imagem mais realista — mas
 * deixam claro que ela foi composta por alguém, e é isso que o olho lê como
 * "produto" em vez de "protótipo".
 *
 * Tudo cabe num único passe de tela cheia, o que é essencial no celular.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 1.0 },
    uWarmth: { value: 1.0 },
    uContrast: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uWarmth;
    uniform float uContrast;
    varying vec2 vUv;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Curva de cor: levanta um pouco as sombras e esquenta as altas luzes,
      // que é o que faz luz de casa parecer luz de casa.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, 1.06);
      c = (c - 0.5) * uContrast + 0.5;
      c += vec3(0.020, 0.008, -0.010) * uWarmth;
      c = max(c, vec3(0.0));

      // Vinheta suave, mais forte nos cantos que nas bordas.
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * 0.85 * uVignette;
      c *= clamp(vig, 0.0, 1.0);

      // Grão fino, ligado à luminância: sombra granula mais que a alta luz.
      float n = fract(sin(dot(vUv * vec2(1024.0, 768.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * 0.020 * uGrain * (1.15 - luma);

      gl_FragColor = vec4(c, 1.0);
    }
  `,
}

export interface PostFX {
  composer: EffectComposer
  setSize(w: number, h: number, pixelRatio: number): void
  update(dt: number, night: number): void
  dispose(): void
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: 'low' | 'medium' | 'high',
): PostFX | null {
  if (quality === 'low') return null

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const grade = new ShaderPass(GradeShader)
  grade.renderToScreen = true
  composer.addPass(grade)

  let time = 0
  return {
    composer,
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(w, h)
    },
    update(dt, night) {
      time += dt
      grade.uniforms.uTime.value = time * 10
      // À noite a vinheta fecha um pouco mais e o grão sobe: é assim que uma
      // câmera se comporta com pouca luz.
      grade.uniforms.uVignette.value = 0.85 + night * 0.5
      grade.uniforms.uGrain.value = 0.7 + night * 0.9
      grade.uniforms.uWarmth.value = 0.5 + night * 1.2
      grade.uniforms.uContrast.value = 1.05 + night * 0.05
    },
    dispose() {
      composer.dispose()
    },
  }
}
