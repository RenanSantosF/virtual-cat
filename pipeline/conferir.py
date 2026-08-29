"""Folha de contato das poses, com chão e enquadramento fixos."""
import glob
import os
import sys

import bpy

sys.path.insert(0, '/home/user/virtual-cat/pipeline')
import anim
import render


def folha(destino, lista, arquivo='cat-rigado.blend', ang=90, elev=9, dist=1.25, cols=4):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(destino, arquivo))
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    anim.preparar(arm)
    bpy.ops.object.mode_set(mode='OBJECT')

    chao = float(min(v.co.z for v in mesh.data.vertices))
    cam = render.montar_estudio(amostras=12, larg=470, alt=410)
    render.piso(chao)
    alvo = (0.02, 0, chao + anim.ALTURA * 0.55)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    nomes = []
    for i, (nome, pose) in enumerate(lista.items()):
        anim._aplicar(arm, pose)
        bpy.context.view_layer.update()
        caminho = os.path.join(destino, f'_folha{i:02d}.png')
        render.foto(cam, caminho, alvo, ang, elev, dist)
        nomes.append((caminho, nome))
    return juntar(nomes, os.path.join(destino, 'folha.png'), cols)


def juntar(nomes, saida, cols=4):
    from PIL import Image, ImageDraw
    ims = [(Image.open(c).convert('RGB'), n) for c, n in nomes]
    w, h = ims[0][0].size
    linhas = (len(ims) + cols - 1) // cols
    s = Image.new('RGB', (w * cols, h * linhas), (25, 25, 25))
    for i, (im, n) in enumerate(ims):
        x, y = w * (i % cols), h * (i // cols)
        s.paste(im, (x, y))
        ImageDraw.Draw(s).text((x + 8, y + 6), n, fill=(255, 240, 120))
    s.save(saida)
    for c, _ in nomes:
        os.remove(c)
    return saida
