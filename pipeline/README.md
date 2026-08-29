# Pipeline de arte

Transforma `pipeline/origem-cat.glb` — uma malha crua gerada por IA, sem
esqueleto, sem animação, sem UV e sem cor nenhuma — num personagem de jogo
rigado, pintado e animado.

Roda inteiro por linha de comando, com o Blender como módulo Python. Não
precisa de PC nem de interface gráfica.

    pip install bpy
    python3 pipeline/run.py

## Por que este pipeline existe

Nenhum modelo gerado por IA chega pronto para animar. O primeiro que passou por
aqui tinha **156 peças soltas** e **25.142 arestas quebradas** — não era um
corpo, eram pedaços encostados uns nos outros, e ao dobrar qualquer articulação
eles se separavam. Isso não é contornável em código de runtime: o `bone heat`,
algoritmo padrão da indústria para pesos de deformação, **recusa** malha
não-manifold. Por isso existe `retopo.py`.

O modelo atual chegou limpo — 1 peça, 0 arestas quebradas — e dispensa a
retopologia. Mas chegou sem UV e sem cor, e por isso existem `preparar.py` e
`pelagem.py`.

## Etapas

| Módulo | O que faz |
|---|---|
| `preparar.py` | Descobre a orientação por medida — eixo mais longo é o comprimento, cabeça é a ponta com massa no alto —, centra, normaliza a escala e cria as UVs. |
| `pelagem.py` | Constrói a pelagem como shader procedural em coordenadas do objeto e assa numa imagem. Em coordenadas do objeto, e não da textura, é o que faz as listras darem a volta no corpo em vez de serem desenhadas num plano. |
| `retopo.py` | Só para malha suja: remesh por voxel que funde peças soltas e fecha buracos. |
| `ajustar.py` | Resolve poses por medição: mede a altura real das patas na malha deformada e empurra os parâmetros até ela zerar. |
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
