# Pipeline de arte

Transforma `public/models/cat.glb` — uma escultura de impressão 3D gerada por
IA, sem esqueleto e sem animação — num personagem de jogo rigado e animado.

Roda inteiro por linha de comando, com o Blender como módulo Python. Não
precisa de PC nem de interface gráfica.

    pip install bpy
    python3 pipeline/run.py

## Por que este pipeline existe

O modelo de origem tem **156 peças soltas** e **25.142 arestas quebradas**. Não
é um corpo: são pedaços encostados uns nos outros. Ao dobrar qualquer
articulação eles se separam — foi o que produziu a cara amassada e o rasgo
branco no flanco nas versões anteriores.

Isso não é contornável em código de runtime. O `bone heat`, algoritmo padrão da
indústria para calcular pesos de deformação, **recusa** malha não-manifold. A
única saída é reconstruir a superfície antes de rigar.

## Etapas

| Módulo | O que faz |
|---|---|
| `retopo.py` | Remesh por voxel: 156 peças → 1, 25.142 arestas quebradas → 0, 171k → 31k faces. Depois rebaixa a pelagem do original para as coordenadas novas. |
| `landmarks.py` | Lê os pontos anatômicos da própria malha — patas, coluna, cauda, cabeça, orelhas — por análise de fatias. Nenhuma coordenada escrita à mão. |
| `build_rig.py` | Monta 29 ossos e chama o `bone heat`. |
| `anim.py` | Autoria dos clipes. Uma pose é `{osso: (x, y, z)}` em graus; um clipe é uma lista de `(quadro, pose)`. |
| `render.py` | Renders de conferência, para julgar cada etapa por imagem e não por número. |

## Saída

`.glb` com o esqueleto e um clipe por animação, otimizado para celular:

    npx @gltf-transform/cli optimize bruto.glb public/models/cat.glb \
      --texture-compress webp --texture-size 1024 --compress meshopt

10,5 MB → 1,5 MB, sem perder animação.

## Clipes gerados

20 no total, em `clips.py`:

**Laços** — parado, sentado, deitado, dormindo, andar, trotar, correr, lamber,
beber, comer, na_caixa.

**Uma vez** — espreguicar, pular.

**Passagens** — sentar, levantar, deitar, erguer, adormecer, acordar, agachar.
São elas que ligam uma postura à outra. O motor não interpola entre "em pé" e
"deitado": ele toca o caminho, porque o meio do caminho entre duas poses não é
uma pose que exista — o tronco atravessa o chão.
