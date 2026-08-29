"""
Pontos anatômicos lidos da própria malha.

Nada aqui é número mágico escrito à mão: cada ponto sai de uma medida da
geometria, para que o mesmo script continue valendo se o modelo for trocado.
Convenção do modelo: +X é a frente (cabeça), Z é para cima, chão em Zmin.
"""
import numpy as np


def extrair(co: np.ndarray) -> dict:
    mn, mx = co.min(0), co.max(0)
    chao = mn[2]
    comprimento = mx[0] - mn[0]

    def centro_de(mask, alto=None):
        s = co[mask]
        if len(s) < 8:
            return None
        if alto is not None:
            s = s[s[:, 2] > np.percentile(s[:, 2], alto)]
        return s.mean(0)

    # --- patas: vértices junto ao chão, agrupados por frente/trás e lado ---
    # Limiar proporcional ao bicho, não em unidades do arquivo: o mesmo
    # número absoluto pega a pata inteira num modelo e meia perna noutro.
    pes = co[co[:, 2] < chao + comprimento * 0.09]
    patas = {}
    for nome, fx in (('frente', lambda p: p[:, 0] > 0), ('tras', lambda p: p[:, 0] <= 0)):
        meio = pes[fx(pes)]
        for lado, fy in (('E', lambda p: p[:, 1] < 0), ('D', lambda p: p[:, 1] >= 0)):
            g = meio[fy(meio)]
            if len(g):
                patas[f'{nome}{lado}'] = g.mean(0)

    # --- coluna: do quadril à cernelha ---
    #
    # Lida em fatias finas e depois suavizada. Fatia grossa pega ombro, quadril
    # e orelha na mesma média, e a linha da coluna sai serrilhada — o dorso do
    # gato passa a subir e descer a cada vértebra. A faixa para antes da cabeça
    # de propósito: dali para a frente quem manda é o pescoço.
    x0, x1 = mn[0] + comprimento * 0.22, mn[0] + comprimento * 0.80
    bruto = []
    N = 16
    for i in range(N):
        a = x0 + (x1 - x0) * i / N
        b = a + (x1 - x0) / N
        p = centro_de((co[:, 0] >= a) & (co[:, 0] < b), alto=62)
        bruto.append(((a + b) / 2, p[2] if p is not None else None))
    zs = [z for _, z in bruto if z is not None]
    media = float(np.mean(zs)) if zs else 0.0
    alturas = np.array([z if z is not None else media for _, z in bruto])
    suave = np.convolve(alturas, np.ones(5) / 5, mode='same')
    suave[:2] = alturas[:2].mean()
    suave[-2:] = alturas[-2:].mean()
    # Sete pontos espalhados por toda a faixa. Pegar de dois em dois deixava a
    # coluna parando no meio das costas, e o pescoço saía com um terço do
    # comprimento do gato para cobrir o resto.
    idx = np.linspace(0, N - 1, 7).round().astype(int)
    coluna = [np.array([bruto[i][0], 0.0, float(suave[i])]) for i in idx]

    # --- cauda: fatias atrás do quadril ---
    cauda = []
    tx0, tx1 = mn[0], mn[0] + comprimento * 0.22
    for i in range(6):
        a = tx0 + (tx1 - tx0) * i / 5
        b = a + (tx1 - tx0) / 5
        p = centro_de((co[:, 0] >= a) & (co[:, 0] < b))
        if p is not None:
            cauda.append(np.array([(a + b) / 2, 0.0, p[2]]))
    cauda.reverse()  # da base para a ponta

    # --- cabeça e focinho ---
    frente = co[co[:, 0] > mn[0] + comprimento * 0.83]
    cabeca = frente.mean(0) if len(frente) else None
    ponta = co[co[:, 0] > mx[0] - comprimento * 0.05]
    focinho = ponta.mean(0) if len(ponta) else None

    # --- orelhas: o que está acima da cabeça, separado por lado ---
    orelhas = {}
    if cabeca is not None:
        alto = co[(co[:, 0] > cabeca[0] - comprimento * 0.10) & (co[:, 2] > cabeca[2] + 0.10)]
        for lado, fy in (('E', lambda p: p[:, 1] < 0), ('D', lambda p: p[:, 1] >= 0)):
            g = alto[fy(alto)]
            if len(g) > 20:
                orelhas[lado] = g.mean(0)

    return {
        'chao': chao, 'comprimento': comprimento, 'bbox': (mn, mx),
        'patas': patas, 'coluna': coluna, 'cauda': cauda,
        'cabeca': cabeca, 'focinho': focinho, 'orelhas': orelhas,
    }


def cadeia_perna(co: np.ndarray, pata: np.ndarray, chao: float, topo: float,
                 n: int = 4, escala: float = 1.0):
    """
    Articulações de uma perna, de cima para baixo.

    A perna é inclinada, então a janela em X acompanha a subida em vez de ser
    um cilindro reto: presa num cilindro, o ombro cairia fora e o osso nasceria
    no meio da barriga.
    """
    pts = []
    for i in range(n):
        t = 1 - i / (n - 1)                    # 1 no topo, 0 no chão
        z = chao + (topo - chao) * t
        h = (topo - chao) / (n - 1) * 0.75
        janela = escala * (0.15 + t * 0.12)
        largura = janela * 0.9
        m = ((np.abs(co[:, 1] - pata[1]) < largura)
             & (np.abs(co[:, 0] - pata[0]) < janela)
             & (co[:, 2] >= z - h) & (co[:, 2] <= z + h))
        s = co[m]
        pts.append(s.mean(0) if len(s) >= 8 else np.array([pata[0], pata[1], z]))
    pts[-1] = np.array([pata[0], pata[1], chao + escala * 0.02])   # a ponta é a pata medida
    return pts
