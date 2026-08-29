"""
Vocabulário de poses.

Cada pose descreve só o que muda; o que não aparece volta ao repouso.

Os números não foram escolhidos a olho. As posturas em que alguma parte tem de
encostar no chão — sentar, agachar, usar a caixa — saíram do resolvedor em
`ajustar.py`, que mede a altura real das patas na malha deformada e empurra os
parâmetros até ela zerar. Cada uma traz a medição junto, em comentário: é o que
permite conferir depois se ainda vale, quando o modelo mudar.

`_raiz` é dado em frações da altura do quadril, não em unidades do arquivo:
assim a pose sobrevive a uma troca de escala.

Sinais deste rig, medidos por calibração: +X no pescoço levanta a cabeça, +X no
cotovelo joga a perna à frente, +X na cauda a levanta, e arquear a coluna com
sinal positivo ergue a frente do corpo.
"""

# ---------- estáticas ----------

PARADO = {}

SENTADO = {
    # Resolvido: pata dianteira a −0,002 do chão, bacia a −0,012.
    # Dois erros custaram tentativas aqui. O primeiro foi girar a `coluna0`:
    # ela carrega as traseiras junto, e o gato tombava para trás em vez de
    # sentar — o arco tem de ficar nas vértebras acima do quadril. O segundo
    # foi deixar o resolvedor mexer na dianteira: ele a jogava para trás para
    # alcançar o chão, e a pose virava uma reverência. Sentado, a dianteira é
    # quase vertical, e quem baixa a garupa é a traseira dobrada.
    '_raiz': (0, 0, -0.40),
    'trasE_cotovelo': (123, 0, 0), 'trasD_cotovelo': (123, 0, 0),
    'trasE_punho': (-145, 0, 0), 'trasD_punho': (-145, 0, 0),
    'coluna1': (6.2, 0, 0), 'coluna2': (6.2, 0, 0), 'coluna3': (6.2, 0, 0),
    'frenteE_cotovelo': (-12, 0, 0), 'frenteD_cotovelo': (-12, 0, 0),
    'frenteE_punho': (6, 0, 0), 'frenteD_punho': (6, 0, 0),
    'pescoco': (-9, 0, 0), 'cabeca': (5, 0, 0),
    'cauda0': (-20, 0, 0), 'cauda1': (-9, 0, 0),
}

DEITADO = {
    # Esfinge: peito no chão, patas recolhidas sob o corpo, cabeça erguida.
    '_raiz': (0, 0, -0.72),
    'frenteE_cotovelo': (72, 0, 0), 'frenteD_cotovelo': (72, 0, 0),
    'frenteE_punho': (-96, 0, 0), 'frenteD_punho': (-96, 0, 0),
    'trasE_cotovelo': (118, 0, 0), 'trasD_cotovelo': (118, 0, 0),
    'trasE_punho': (-138, 0, 0), 'trasD_punho': (-138, 0, 0),
    'coluna1': (4, 0, 0), 'coluna2': (3, 0, 0),
    'pescoco': (6, 0, 0),
    'cauda0': (-34, 0, 10), 'cauda1': (-16, 0, 18), 'cauda2': (0, 0, 24),
}

DORMINDO = {
    # "Pão de forma": o mesmo corpo do deitado, com a cabeça recolhida contra o
    # peito e a cauda trazida para o lado. Enrolar de verdade — focinho junto à
    # barriga — pede a coluna torcida além do que a deformação linear aguenta.
    **DEITADO,
    'pescoco': (-20, 0, 12), 'cabeca': (-26, 0, 14),
    'orelhaE': (-12, 0, 0), 'orelhaD': (-12, 0, 0),
    'cauda1': (-18, 0, 32), 'cauda2': (0, 0, 38), 'cauda3': (0, 0, 30),
}

ESPREGUICANDO = {
    # Peito e antebraços no chão, garupa no alto. A medição aqui é do
    # antebraço, não da pata: é ele que apoia nesta postura.
    '_raiz': (0, 0, 0.01),
    'coluna1': (-21, 0, 0), 'coluna2': (-13, 0, 0),
    'frenteE_cotovelo': (81, 0, 0), 'frenteD_cotovelo': (81, 0, 0),
    'frenteE_punho': (-122, 0, 0), 'frenteD_punho': (-122, 0, 0),
    'trasE_cotovelo': (-17, 0, 0), 'trasD_cotovelo': (-17, 0, 0),
    'trasE_punho': (14, 0, 0), 'trasD_punho': (14, 0, 0),
    'pescoco': (11, 0, 0),
    'cauda0': (38, 0, 0), 'cauda1': (24, 0, 0),
}

BEBENDO = {
    'frenteE_cotovelo': (10, 0, 0), 'frenteD_cotovelo': (10, 0, 0),
    'frenteE_punho': (-14, 0, 0), 'frenteD_punho': (-14, 0, 0),
    'coluna3': (-14, 0, 0),
    'pescoco': (-56, 0, 0), 'cabeca': (-22, 0, 0),
    'cauda0': (-10, 0, 0),
}

NA_CAIXA = {
    # Resolvido: patas a +0,003 e −0,003 do chão.
    # Agachado sobre as traseiras dobradas, dorso arqueado e cauda erguida —
    # os dois sinais que fazem o jogador entender o que está acontecendo sem
    # uma linha de texto.
    '_raiz': (0, 0, -0.40),
    'trasE_cotovelo': (132, 0, 0), 'trasD_cotovelo': (132, 0, 0),
    'trasE_punho': (-158, 0, 0), 'trasD_punho': (-158, 0, 0),
    'frenteE_cotovelo': (59, 0, 0), 'frenteD_cotovelo': (59, 0, 0),
    'frenteE_punho': (-83, 0, 0), 'frenteD_punho': (-83, 0, 0),
    'coluna1': (4, 0, 0), 'coluna2': (5, 0, 0), 'coluna3': (2, 0, 0),
    'pescoco': (-5, 0, 0),
    'cauda0': (55, 0, 0), 'cauda1': (30, 0, 0), 'cauda2': (14, 0, 0),
}

AGACHADO = {
    # Meio caminho para o salto: peso atrás, corpo baixo, cauda esticada.
    '_raiz': (0, 0, -0.34),
    'trasE_cotovelo': (112, 0, 0), 'trasD_cotovelo': (112, 0, 0),
    'trasE_punho': (-134, 0, 0), 'trasD_punho': (-134, 0, 0),
    'frenteE_cotovelo': (50, 0, 0), 'frenteD_cotovelo': (50, 0, 0),
    'frenteE_punho': (-70, 0, 0), 'frenteD_punho': (-70, 0, 0),
    'coluna1': (3, 0, 0), 'coluna2': (2, 0, 0),
    'pescoco': (8, 0, 0),
    'cauda0': (-8, 0, 0),
}
