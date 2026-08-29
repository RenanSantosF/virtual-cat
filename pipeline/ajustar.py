"""
Resolve poses por medição.

Uma pose só está certa quando as partes que deveriam tocar o chão tocam o
chão. Julgar isso a olho custou várias rodadas de render no primeiro modelo;
medir custa segundos e não erra. Aqui a pose é uma função de alguns números, e
a busca escolhe os números que zeram a distância ao chão.
"""
import itertools
import sys

import bpy
import numpy as np

sys.path.insert(0, '/home/user/virtual-cat/pipeline')
import anim


def abrir(caminho):
    bpy.ops.wm.open_mainfile(filepath=caminho)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    malha = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    anim.preparar(arm)
    chao = float(min(v.co.z for v in malha.data.vertices))
    return arm, malha, chao


def medir(malha, chao, regioes):
    """Altura mínima de cada região pedida, já descontado o chão."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    m = malha.evaluated_get(dg).to_mesh()
    co = np.array([v.co[:] for v in m.vertices])
    saida = {}
    for nome, (x0, x1) in regioes.items():
        s = co[(co[:, 0] >= x0) & (co[:, 0] < x1)]
        saida[nome] = float(s[:, 2].min() - chao) if len(s) else 9.0
    return saida


def buscar(arm, malha, chao, monta, grade, regioes, peso=None):
    """
    Varre a grade e devolve a combinação com menor erro.

    `monta` recebe os parâmetros e devolve a pose; `regioes` diz onde medir; o
    erro é a soma das distâncias ao chão, cada uma com o seu peso.
    """
    peso = peso or {k: 1.0 for k in regioes}
    chaves = list(grade)
    melhor = None
    for combo in itertools.product(*(grade[k] for k in chaves)):
        params = dict(zip(chaves, combo))
        anim._aplicar(arm, monta(**params))
        alturas = medir(malha, chao, regioes)
        erro = sum(abs(alturas[k]) * peso.get(k, 1.0) for k in regioes)
        if melhor is None or erro < melhor[0]:
            melhor = (erro, params, alturas)
    return melhor


def refinar(arm, malha, chao, monta, inicio, passos, regioes, peso=None, voltas=6):
    """
    Descida por coordenadas a partir de um palpite.

    A busca em grade só enxerga o que está nos nós, e com duas restrições que
    competem — pata dianteira no chão e traseira no chão — o mínimo quase nunca
    cai num nó. Aqui cada parâmetro é empurrado para os dois lados enquanto
    melhorar, e o passo encolhe a cada volta.
    """
    peso = peso or {k: 1.0 for k in regioes}

    def erro_de(p):
        anim._aplicar(arm, monta(**p))
        a = medir(malha, chao, regioes)
        return sum(abs(a[k]) * peso.get(k, 1.0) for k in regioes), a

    atual = dict(inicio)
    melhor, alturas = erro_de(atual)
    passo = dict(passos)
    for _ in range(voltas):
        for k in atual:
            for direcao in (1, -1):
                cand = dict(atual)
                cand[k] = atual[k] + passo[k] * direcao
                e, a = erro_de(cand)
                if e < melhor - 1e-6:
                    melhor, alturas, atual = e, a, cand
                    break
        passo = {k: v * 0.55 for k, v in passo.items()}
    return melhor, atual, alturas
