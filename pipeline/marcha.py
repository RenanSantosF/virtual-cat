"""
Ciclos de locomoção.

Gato anda em sequência lateral: traseira esquerda, dianteira esquerda,
traseira direita, dianteira direita — cada pata entra um quarto de ciclo
depois da anterior. Três patas ficam no chão a cada instante, e é isso que dá
o andar de gato, deslizado, em vez do trote de cachorro.

No trote as diagonais se movem juntas (dianteira esquerda com traseira
direita), e no galope o corpo se dobra e se estende: a coluna passa a fazer
parte da propulsão, não só as pernas.
"""
import math

# Fase de cada pata dentro do ciclo, em voltas.
LATERAL = {'trasE': 0.00, 'frenteE': 0.25, 'trasD': 0.50, 'frenteD': 0.75}
DIAGONAL = {'trasE': 0.00, 'frenteD': 0.00, 'trasD': 0.50, 'frenteE': 0.50}


def _perna(fase, balanco, alcance, recolhe):
    """
    Ângulos de uma perna numa dada fase.

    O ciclo tem duas partes desiguais: o apoio, em que a pata está no chão e
    recua devagar, e o balanço, mais curto, em que ela sai do chão, dobra e
    volta à frente. Dividir o tempo meio a meio faria o gato patinar.
    """
    f = fase % 1.0
    if f < balanco:                       # balanço: à frente, dobrando
        t = f / balanco
        avanco = -alcance + 2 * alcance * (0.5 - 0.5 * math.cos(t * math.pi))
        dobra = math.sin(t * math.pi) * recolhe
    else:                                 # apoio: recuando, esticada
        t = (f - balanco) / (1 - balanco)
        avanco = alcance - 2 * alcance * t
        dobra = 0.0
    return avanco, dobra


def ciclo(nome, quadros=24, fases=LATERAL, alcance=20, recolhe=30,
          balanco=0.35, ondulacao=3.0, cauda=8.0, subida=0.0, frente_inv=True):
    """
    Devolve [(quadro, pose)] de um ciclo fechado.

    `frente_inv` inverte o sinal das dianteiras: no rig deste modelo o osso
    que faz o papel de úmero gira ao contrário do fêmur, então sem isso o gato
    anda com as dianteiras para trás.
    """
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        pose = {}
        for perna, off in fases.items():
            av, dob = _perna(t + off, balanco, alcance, recolhe)
            dianteira = perna.startswith('frente')
            s = -1 if (dianteira and frente_inv) else 1
            pose[f'{perna}_cotovelo'] = (s * av, 0, 0)
            pose[f'{perna}_punho'] = (-s * dob, 0, 0)
        # A coluna acompanha o passo — sem isso só as pernas se mexem e o
        # tronco vira um bloco carregado por cima delas.
        pose['coluna1'] = (math.sin(t * 2 * math.pi) * ondulacao * 0.4, 0,
                           math.sin(t * 2 * math.pi) * ondulacao)
        pose['coluna2'] = (math.sin(t * 2 * math.pi + 0.5) * ondulacao * 0.3, 0,
                           math.sin(t * 2 * math.pi + 0.6) * ondulacao * 0.8)
        pose['pescoco'] = (math.sin(t * 4 * math.pi) * 1.5, 0, 0)
        pose['cauda0'] = (10 + math.sin(t * 2 * math.pi) * 4, 0,
                          math.sin(t * 2 * math.pi + 1.0) * cauda)
        pose['cauda2'] = (0, 0, math.sin(t * 2 * math.pi + 1.8) * cauda * 1.3)
        pose['cauda4'] = (0, 0, math.sin(t * 2 * math.pi + 2.6) * cauda * 1.5)
        if subida:
            pose['_raiz'] = (0, 0, subida * abs(math.sin(t * 2 * math.pi)))
        saida.append((i + 1, pose))
    return saida


def andar(quadros=32):
    return ciclo('andar', quadros, LATERAL, alcance=18, recolhe=26, balanco=0.32,
                 ondulacao=2.5, cauda=7, subida=0.012)


def trotar(quadros=20):
    return ciclo('trotar', quadros, DIAGONAL, alcance=26, recolhe=38, balanco=0.42,
                 ondulacao=3.5, cauda=5, subida=0.03)


def correr(quadros=16):
    """
    Galope: as duas dianteiras quase juntas, as duas traseiras quase juntas, e
    a coluna dobrando e estendendo entre uma coisa e outra.
    """
    fases = {'frenteE': 0.00, 'frenteD': 0.08, 'trasE': 0.45, 'trasD': 0.53}
    saida = ciclo('correr', quadros, fases, alcance=34, recolhe=52, balanco=0.5,
                  ondulacao=2.0, cauda=4, subida=0.06)
    for i, (q, pose) in enumerate(saida):
        t = i / quadros
        dobra = math.sin(t * 2 * math.pi) * 16
        pose['coluna1'] = (dobra, 0, 0)
        pose['coluna2'] = (dobra * 1.2, 0, 0)
        pose['coluna3'] = (dobra * 0.7, 0, 0)
        pose['pescoco'] = (-dobra * 0.5, 0, 0)
    return saida
