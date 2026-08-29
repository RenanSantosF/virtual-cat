"""
Todos os clipes do jogo.

Cada clipe é uma lista de (quadro, pose). Os que repetem — parado, andar,
dormir — fecham no mesmo quadro em que abrem. Os de transição não fecham: eles
levam de uma postura à outra e param lá, para o motor encadear com o próximo.

24 quadros por segundo.
"""
import math

import marcha
import poses as P

FPS = 24


def _mistura(a, b, t):
    """Interpola duas poses. Chave ausente conta como repouso."""
    out = {}
    for k in set(a) | set(b):
        va, vb = a.get(k, (0, 0, 0)), b.get(k, (0, 0, 0))
        out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
    return out


def _respirar(base, amp=1.6, quadros=96):
    """Uma postura parada, respirando. Sem isto o gato vira estátua."""
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        s = math.sin(t * 2 * math.pi)
        p = dict(base)
        for osso, ganho in (('coluna2', 1.0), ('coluna3', 0.7)):
            x, y, z = p.get(osso, (0, 0, 0))
            p[osso] = (x + s * amp * ganho, y, z)
        x, y, z = p.get('cauda2', (0, 0, 0))
        p['cauda2'] = (x, y, z + s * 5)
        x, y, z = p.get('cauda4', (0, 0, 0))
        p['cauda4'] = (x, y, z + s * 8)
        saida.append((i + 1, p))
    return saida


def _transicao(de, para, quadros=16, suave=True):
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        if suave:
            t = 0.5 - 0.5 * math.cos(t * math.pi)
        saida.append((i + 1, _mistura(de, para, t)))
    return saida


def lamber(quadros=72):
    """
    Lambe o flanco. A cabeça desce e gira para o lado, e a língua trabalha em
    ritmo próprio — mais rápido que o movimento do pescoço, que é o detalhe
    que faz parecer um gato e não uma cabeça oscilando.
    """
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        aproxima = 0.5 - 0.5 * math.cos(min(1.0, t * 3) * math.pi)
        lambida = math.sin(t * 2 * math.pi * 6) * aproxima
        p = dict(P.SENTADO)
        p['pescoco'] = (-38 * aproxima - 6 * lambida, 0, 26 * aproxima)
        p['cabeca'] = (-20 * aproxima - 10 * lambida, 0, 18 * aproxima)
        p['coluna3'] = (8.3 - 10 * aproxima, 0, 14 * aproxima)
        p['coluna2'] = (8.3, 0, 8 * aproxima)
        saida.append((i + 1, p))
    return saida


def beber(quadros=72):
    """Lapadas: a cabeça sobe e desce pouco, rápido, sobre a água."""
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        chega = 0.5 - 0.5 * math.cos(min(1.0, t * 3) * math.pi)
        lapada = max(0.0, math.sin(t * 2 * math.pi * 7)) * chega
        p = dict(P.BEBENDO)
        p['pescoco'] = (-52 * chega + 7 * lapada, 0, 0)
        p['cabeca'] = (-26 * chega + 5 * lapada, 0, 0)
        saida.append((i + 1, p))
    return saida


def comer(quadros=60):
    saida = []
    for i in range(quadros + 1):
        t = i / quadros
        chega = 0.5 - 0.5 * math.cos(min(1.0, t * 3) * math.pi)
        mastiga = math.sin(t * 2 * math.pi * 5) * chega
        p = dict(P.BEBENDO)
        p['pescoco'] = (-46 * chega + 4 * mastiga, 0, 5 * math.sin(t * 2 * math.pi * 2))
        p['cabeca'] = (-22 * chega + 6 * mastiga, 0, 0)
        saida.append((i + 1, p))
    return saida


def pular(quadros=30):
    """
    Salto: agacha, estende, voa, aterrissa. É o clipe que o jogo encadeia para
    o gato subir no sofá — e o que separa "pulou" de "apareceu em cima".
    """
    ar = {
        '_raiz': (0, 0, 1.30),
        'frenteE_cotovelo': (34, 0, 0), 'frenteD_cotovelo': (34, 0, 0),
        'frenteE_punho': (-24, 0, 0), 'frenteD_punho': (-24, 0, 0),
        'trasE_cotovelo': (-34, 0, 0), 'trasD_cotovelo': (-34, 0, 0),
        'trasE_punho': (26, 0, 0), 'trasD_punho': (26, 0, 0),
        'coluna1': (-10, 0, 0), 'coluna2': (-8, 0, 0),
        'pescoco': (16, 0, 0), 'cauda0': (26, 0, 0), 'cauda1': (14, 0, 0),
    }
    impulso = _mistura(P.AGACHADO, ar, 0.35)
    pouso = {**P.AGACHADO, '_raiz': (0, 0, -0.30)}
    return [(1, P.PARADO), (7, P.AGACHADO), (11, impulso),
            (17, ar), (23, pouso), (quadros, P.PARADO)]


def construir():
    """Nome do clipe -> quadros. É esta a lista que vai virar o .glb."""
    c = {
        'parado': _respirar(P.PARADO),
        'sentado': _respirar(P.SENTADO, amp=1.3),
        'deitado': _respirar(P.DEITADO, amp=2.0, quadros=120),
        'dormindo': _respirar(P.DORMINDO, amp=2.8, quadros=144),
        'andar': marcha.andar(),
        'trotar': marcha.trotar(),
        'correr': marcha.correr(),
        'lamber': lamber(),
        'beber': beber(),
        'comer': comer(),
        'espreguicar': _transicao(P.PARADO, P.ESPREGUICANDO, 18)
                       + _transicao(P.ESPREGUICANDO, P.PARADO, 18)[1:],
        'na_caixa': _transicao(P.AGACHADO, P.NA_CAIXA, 14)
                    + _respirar(P.NA_CAIXA, amp=1.0, quadros=48)[1:],
        'pular': pular(),
        # Transições explícitas: o crossfade resolve a maioria das trocas, mas
        # sentar e deitar têm um caminho próprio que o gato percorre, e
        # interpolar direto entre as duas pontas passa por dentro do chão.
        'sentar': _transicao(P.PARADO, P.SENTADO, 20),
        'levantar': _transicao(P.SENTADO, P.PARADO, 18),
        'deitar': _transicao(P.SENTADO, P.DEITADO, 22),
        'erguer': _transicao(P.DEITADO, P.PARADO, 24),
        'adormecer': _transicao(P.DEITADO, P.DORMINDO, 30),
        'acordar': _transicao(P.DORMINDO, P.DEITADO, 26),
        'agachar': _transicao(P.PARADO, P.AGACHADO, 12),
    }
    return c
