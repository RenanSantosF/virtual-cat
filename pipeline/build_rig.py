"""
Monta o esqueleto sobre a malha já retopologizada e calcula os pesos.

O que muda em relação ao que havia antes: os pesos não são mais inventados por
distância. Quem os calcula é o `bone heat` do Blender — o mesmo algoritmo que
qualquer estúdio usa — e ele só aceita rodar sobre malha fechada, que é
justamente o que a retopologia entregou.
"""
import sys
import numpy as np
import bpy
import mathutils

sys.path.insert(0, '/home/user/virtual-cat/pipeline')
from landmarks import extrair, cadeia_perna

# Altura em que cada perna encontra o corpo, como fração da altura do quadril.
# As dianteiras nascem mais abaixo: a escápula do gato desliza sobre o tórax,
# não há clavícula presa. Fração, e não medida absoluta, porque cada modelo
# chega numa escala diferente — em unidades fixas o encaixe da perna ia parar
# no meio da barriga de um e no chão do outro.
TOPO_PERNA = {'frenteE': 0.62, 'frenteD': 0.62, 'trasE': 0.86, 'trasD': 0.86}
OSSOS_PERNA = ['ombro', 'cotovelo', 'punho', 'pata']


def construir(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    co = np.array([v.co[:] for v in obj.data.vertices])
    L = extrair(co)

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = 'rig'
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)

    def novo(nome, cabeca, ponta, pai=None, conectar=False):
        b = eb.new(nome)
        b.head = mathutils.Vector([float(x) for x in cabeca[:3]])
        b.tail = mathutils.Vector([float(x) for x in ponta[:3]])
        if (b.tail - b.head).length < 1e-4:          # osso de comprimento zero some
            b.tail = b.head + mathutils.Vector((0, 0, 0.02))
        if pai is not None:
            b.parent = pai
            b.use_connect = conectar
        return b

    # --- raiz ---
    # Todo rig de jogo tem um osso na origem, no chão, do qual o resto pende.
    # É ele que desce quando o gato senta e sobe quando ele pula: sem raiz, a
    # única forma de baixar o corpo seria girar a coluna, e aí o gato deita
    # dobrando a espinha em vez de se abaixar.
    col = L['coluna'][:6]
    raiz = novo('raiz', [col[0][0], 0.0, L['chao']], [col[0][0] + L['comprimento'] * 0.08, 0.0, L['chao']])

    # --- coluna: do quadril ao peito ---
    ossos_col = []
    pai = raiz
    for i in range(len(col) - 1):
        b = novo(f'coluna{i}', col[i], col[i + 1], pai, conectar=False)
        ossos_col.append(b)
        pai = b
    quadril, peito = ossos_col[0], ossos_col[-1]

    # --- pescoço e cabeça ---
    pescoco = novo('pescoco', col[-1], L['cabeca'], peito, conectar=True)
    cabeca = novo('cabeca', L['cabeca'], L['focinho'], pescoco, conectar=True)
    for lado, p in L['orelhas'].items():
        novo(f'orelha{lado}', L['cabeca'] + (p - L['cabeca']) * 0.35, p, cabeca)

    # --- cauda ---
    pai = quadril
    for i in range(len(L['cauda']) - 1):
        pai = novo(f'cauda{i}', L['cauda'][i], L['cauda'][i + 1], pai, conectar=i > 0)

    # --- pernas ---
    quadril_z = float(col[0][2])
    for k, pata in L['patas'].items():
        topo = L['chao'] + (quadril_z - L['chao']) * TOPO_PERNA[k]
        cadeia = cadeia_perna(co, pata, L['chao'], topo, escala=L['comprimento'])
        pai = peito if k.startswith('frente') else quadril
        for i in range(len(cadeia) - 1):
            pai = novo(f'{k}_{OSSOS_PERNA[i]}', cadeia[i], cadeia[i + 1], pai, conectar=i > 0)
        # a pata precisa de um osso próprio, senão o pé não gira
        novo(f'{k}_{OSSOS_PERNA[-1]}', cadeia[-1],
             cadeia[-1] + np.array([L['comprimento'] * 0.06, 0, 0.0]), pai, conectar=True)

    bpy.ops.object.mode_set(mode='OBJECT')

    # --- pesos pelo bone heat ---
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return arm, L
