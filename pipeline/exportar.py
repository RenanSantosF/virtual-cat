"""Grava todos os clipes no esqueleto e exporta um .glb."""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import anim
import clips


def exportar(blend, saida):
    bpy.ops.wm.open_mainfile(filepath=blend)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    anim.preparar(arm)

    for nome, quadros in clips.construir().items():
        anim.clipe(arm, nome, quadros)

    # Volta ao repouso: a pose em que o arquivo é salvo vira a pose padrão de
    # quem carregar o .glb sem tocar nenhuma animação.
    anim._aplicar(arm, {})
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.export_scene.gltf(
        filepath=saida, export_format='GLB',
        export_animations=True, export_animation_mode='ACTIONS',
        export_bake_animation=True,
    )
    return len(bpy.data.actions)


if __name__ == '__main__':
    n = exportar(sys.argv[1], sys.argv[2])
    print(f'{n} clipes exportados para {sys.argv[2]}')
