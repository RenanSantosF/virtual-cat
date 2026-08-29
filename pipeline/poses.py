"""
Vocabulário de poses.

Cada pose descreve só o que muda; o que não aparece volta ao repouso. Os sinais
saem da calibração feita em render: no rig deste modelo, +X no pescoço levanta
a cabeça, +X no cotovelo joga a perna à frente, +X na cauda a levanta, e
`_raiz` desloca o corpo em espaço de mundo.

`_raiz` é dado em frações da altura do quadril: −0.55 quer dizer "desce 55%
do que separa o quadril do chão". Assim a pose vale para qualquer escala do
arquivo, e o gato não afunda no chão se o pipeline for reprocessado.
"""

# ---------- estáticas ----------

PARADO = {}

SENTADO = {
    # Resolvido por medição, não a olho: com estes valores a pata dianteira
    # para a 0,002 do chão e a garupa a 0,002 — as duas apoiadas. O erro que
    # custou mais tentativas foi girar a `coluna0`: ela carrega as traseiras
    # junto, e o gato inteiro tombava para trás em vez de sentar. O arco tem de
    # ficar nas vértebras acima do quadril.
    '_raiz': (0, 0, -0.35),
    'trasE_cotovelo': (95, 0, 0), 'trasD_cotovelo': (95, 0, 0),
    'trasE_punho': (-109, 0, 0), 'trasD_punho': (-109, 0, 0),
    'coluna1': (8.3, 0, 0), 'coluna2': (8.3, 0, 0), 'coluna3': (8.3, 0, 0),
    # A dianteira estende para alcançar o chão a partir do peito já erguido.
    'frenteE_cotovelo': (-50, 0, 0), 'frenteD_cotovelo': (-50, 0, 0),
    'frenteE_punho': (50, 0, 0), 'frenteD_punho': (50, 0, 0),
    'pescoco': (-11, 0, 0), 'cabeca': (4, 0, 0),
    'cauda0': (-22, 0, 0), 'cauda1': (-10, 0, 0),
}

DEITADO = {
    '_raiz': (0, 0, -0.80),
    'frenteE_cotovelo': (74, 0, 0), 'frenteD_cotovelo': (74, 0, 0),
    'frenteE_punho': (-64, 0, 0), 'frenteD_punho': (-64, 0, 0),
    'trasE_cotovelo': (78, 0, 0), 'trasD_cotovelo': (78, 0, 0),
    'trasE_punho': (-88, 0, 0), 'trasD_punho': (-88, 0, 0),
    'coluna0': (6, 0, 0),
    'pescoco': (4, 0, 0),
    'cauda0': (-40, 0, 12), 'cauda1': (-20, 0, 20), 'cauda2': (0, 0, 26),
}

DORMINDO = {
    **DEITADO,
    'pescoco': (-16, 0, 14), 'cabeca': (-24, 0, 18),
    'orelhaE': (-14, 0, 0), 'orelhaD': (-14, 0, 0),
    'cauda1': (-20, 0, 34), 'cauda2': (0, 0, 40), 'cauda3': (0, 0, 34),
}

ESPREGUICANDO = {
    '_raiz': (0, 0, -0.30),
    # Peito no chão, garupa no alto: o alongamento que todo gato faz ao acordar.
    'coluna0': (-26, 0, 0), 'coluna1': (-14, 0, 0), 'coluna2': (-8, 0, 0),
    'frenteE_cotovelo': (52, 0, 0), 'frenteD_cotovelo': (52, 0, 0),
    'frenteE_punho': (-30, 0, 0), 'frenteD_punho': (-30, 0, 0),
    'trasE_cotovelo': (-18, 0, 0), 'trasD_cotovelo': (-18, 0, 0),
    'pescoco': (22, 0, 0),
    'cauda0': (34, 0, 0), 'cauda1': (22, 0, 0),
}

BEBENDO = {
    '_raiz': (0, 0, -0.16),
    'frenteE_cotovelo': (14, 0, 0), 'frenteD_cotovelo': (14, 0, 0),
    'coluna0': (-6, 0, 0), 'coluna3': (-16, 0, 0),
    'pescoco': (-52, 0, 0), 'cabeca': (-26, 0, 0),
    'cauda0': (-12, 0, 0),
}

NA_CAIXA = {
    # Derivada do agachado, que é a postura que funcionou: corpo baixo sobre as
    # traseiras dobradas. Por cima vêm o dorso arqueado e a cauda erguida — os
    # dois sinais que fazem o jogador entender o que está acontecendo sem uma
    # linha de texto.
    '_raiz': (0, 0, -0.50),
    'trasE_cotovelo': (78, 0, 0), 'trasD_cotovelo': (78, 0, 0),
    'trasE_punho': (-92, 0, 0), 'trasD_punho': (-92, 0, 0),
    'frenteE_cotovelo': (-18, 0, 0), 'frenteD_cotovelo': (-18, 0, 0),
    'frenteE_punho': (18, 0, 0), 'frenteD_punho': (18, 0, 0),
    'coluna1': (-12, 0, 0), 'coluna2': (-16, 0, 0), 'coluna3': (-10, 0, 0),
    'pescoco': (14, 0, 0), 'cabeca': (-6, 0, 0),
    'cauda0': (58, 0, 0), 'cauda1': (34, 0, 0), 'cauda2': (16, 0, 0),
}

AGACHADO = {
    # Meio caminho para o salto: peso atrás, corpo baixo, cauda esticada.
    '_raiz': (0, 0, -0.58),
    'trasE_cotovelo': (48, 0, 0), 'trasD_cotovelo': (48, 0, 0),
    'trasE_punho': (-62, 0, 0), 'trasD_punho': (-62, 0, 0),
    'frenteE_cotovelo': (22, 0, 0), 'frenteD_cotovelo': (22, 0, 0),
    'frenteE_punho': (-18, 0, 0), 'frenteD_punho': (-18, 0, 0),
    'coluna0': (8, 0, 0),
    'pescoco': (10, 0, 0),
    'cauda0': (-10, 0, 0),
}
