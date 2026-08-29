"""
Põe um modelo cru no formato que o resto do pipeline espera.

Convenção interna: +X é a frente (cabeça), Z é para cima, o gato fica centrado
em X/Y com as patas no chão. Modelos de gerador vêm em qualquer orientação, e
descobrir a certa é medida, não palpite: o eixo mais longo é o comprimento, e a
cabeça é a ponta com mais massa no alto — a cauda é fina e baixa.
"""
import bmesh
import bpy
import mathutils
import numpy as np


def orientar(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    co = np.array([v.co[:] for v in obj.data.vertices])
    tam = co.max(0) - co.min(0)
    eixo = int(np.argmax(tam[:2]))          # comprimento está em X ou Y
    vertical = 2

    # Qual ponta é a cabeça: a que tem mais vértices na metade de cima.
    lim = co[:, eixo].min() + tam[eixo] * 0.16
    lim2 = co[:, eixo].max() - tam[eixo] * 0.16
    baixo = co[co[:, eixo] < lim]
    alto = co[co[:, eixo] > lim2]
    cabeca_no_positivo = alto[:, vertical].mean() > baixo[:, vertical].mean()

    giro = 0.0
    if eixo == 1:
        giro = np.pi / 2 if not cabeca_no_positivo else -np.pi / 2
    elif not cabeca_no_positivo:
        giro = np.pi
    if giro:
        # Girado direto nos vértices, e não pelo operador de aplicar
        # transformação: o operador depende do objeto estar ativo no contexto
        # certo e falha em silêncio quando não está — o modelo saía com o
        # comprimento ainda no eixo errado e nada acusava.
        m = mathutils.Matrix.Rotation(giro, 4, 'Z')
        for v in obj.data.vertices:
            v.co = m @ v.co
        obj.data.update()

    # Centra em X e Y, apoia no chão em Z = 0.
    co = np.array([v.co[:] for v in obj.data.vertices])
    mn, mx = co.min(0), co.max(0)
    desloca = mathutils.Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))
    for v in obj.data.vertices:
        v.co += desloca
    obj.data.update()
    return obj


def escala_unitaria(obj, comprimento=1.0):
    """Normaliza o comprimento, para que os números das poses valham sempre."""
    co = np.array([v.co[:] for v in obj.data.vertices])
    atual = co[:, 0].max() - co[:, 0].min()
    k = comprimento / atual
    for v in obj.data.vertices:
        v.co *= k
    obj.data.update()
    return k


def olhos(obj):
    """
    Encontra os dois olhos.

    Pela direção das normais, não pela posição: o olho é a região do crânio
    cuja superfície aponta ao mesmo tempo para a frente e para o lado, acima da
    linha do focinho. Estimar por percentis de posição errava para cima e para
    a frente, e a íris ia parar na bochecha.
    """
    co = np.array([v.co[:] for v in obj.data.vertices])
    nr = np.array([v.normal[:] for v in obj.data.vertices])
    comp = co[:, 0].max() - co[:, 0].min()
    cabeca = (co[:, 0] > co[:, 0].max() - comp * 0.16)
    if cabeca.sum() < 50:
        return []
    zc = co[cabeca]
    z0, z1 = zc[:, 2].min(), zc[:, 2].max()
    faixa = cabeca & (co[:, 2] > z0 + (z1 - z0) * 0.45) & (co[:, 2] < z0 + (z1 - z0) * 0.72)
    saida = []
    for lado in (-1, 1):
        m = faixa & (np.sign(co[:, 1]) == lado) & (nr[:, 0] > 0.3) & (nr[:, 1] * lado > 0.3)
        if m.sum() < 30:
            continue
        saida.append(co[m].mean(0))
    return saida


def focinho(obj):
    co = np.array([v.co[:] for v in obj.data.vertices])
    comp = co[:, 0].max() - co[:, 0].min()
    ponta = co[co[:, 0] > co[:, 0].max() - comp * 0.035]
    return ponta.mean(0) if len(ponta) else None


def desdobrar(obj, margem=0.003):
    """UV por projeção inteligente: o modelo cru não traz mapeamento nenhum."""
    import math
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(68), island_margin=margem)
    bpy.ops.object.mode_set(mode='OBJECT')
    return len(obj.data.uv_layers)


def limpar(obj):
    """Solda vértices repetidos e recalcula normais para fora."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
