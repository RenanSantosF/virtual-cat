"""
Retopologia: transforma a escultura em malha animável.

O modelo de origem é uma escultura de impressão 3D gerada por IA: 156 peças
soltas e 25 mil arestas quebradas. O `bone heat` do Blender — que é quem
calcula pesos de deformação de verdade — recusa malha assim, e nenhuma
quantidade de código contorna isso. O remesh por voxel reconstrói a superfície
inteira a partir do volume e devolve uma casca única e fechada.

O voxel é grosso de propósito. Fino demais, cada peça vira a sua própria bolha
fechada e continuam 105 pedaços; é a fusão entre peças vizinhas que resolve o
problema, e ela só acontece quando o voxel é maior que a fresta entre elas.
"""
import bmesh
import bpy

VOXEL = 0.014   # ~1,4% do comprimento do gato: funde as peças sem perder a orelha


def _maior_ilha(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    visto, ilhas = set(), []
    for v in bm.verts:
        if v.index in visto:
            continue
        grupo, pilha = [], [v]
        while pilha:
            x = pilha.pop()
            if x.index in visto:
                continue
            visto.add(x.index)
            grupo.append(x)
            for e in x.link_edges:
                pilha.append(e.other_vert(x))
        ilhas.append(grupo)
    ilhas.sort(key=len, reverse=True)
    for g in ilhas[1:]:
        for v in g:
            bm.verts.remove(v)
    bm.to_mesh(me)
    bm.free()
    return len(ilhas)


def reconstruir(origem, voxel=VOXEL):
    """Devolve (original, novo). O original fica para servir de fonte no bake."""
    novo = origem.copy()
    novo.data = origem.data.copy()
    novo.name = 'gato'
    bpy.context.scene.collection.objects.link(novo)
    bpy.context.view_layer.objects.active = novo
    m = novo.modifiers.new('remesh', 'REMESH')
    m.mode, m.voxel_size, m.adaptivity = 'VOXEL', voxel, 0.0
    bpy.ops.object.modifier_apply(modifier='remesh')
    _maior_ilha(novo.data)
    bpy.ops.object.select_all(action='DESELECT')
    novo.select_set(True)
    bpy.context.view_layer.objects.active = novo
    bpy.ops.object.shade_smooth()
    return novo


def transferir_textura(origem, novo, tamanho=2048):
    """
    Rebaixa a pelagem do original para as coordenadas novas.

    O remesh apaga o mapeamento de textura junto com a malha antiga. Sem este
    passo o gato sai cinza — toda a pelagem, os olhos e o focinho estão na
    textura, não na geometria.
    """
    import math
    bpy.ops.object.select_all(action='DESELECT')
    novo.select_set(True)
    bpy.context.view_layer.objects.active = novo
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')

    img = bpy.data.images.new('pelo', tamanho, tamanho)
    mat = bpy.data.materials.new('pelo')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.75
    nt.nodes.active = tex
    novo.data.materials.clear()
    novo.data.materials.append(mat)

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples, sc.cycles.device = 4, 'CPU'
    b = sc.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion, b.max_ray_distance = 0.02, 0.05
    b.use_pass_direct = b.use_pass_indirect = False
    bpy.ops.object.select_all(action='DESELECT')
    origem.select_set(True)
    novo.select_set(True)
    bpy.context.view_layer.objects.active = novo
    bpy.ops.object.bake(type='DIFFUSE')
    return img
