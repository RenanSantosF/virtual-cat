"""Render de conferência: luz de estúdio simples e algumas câmeras fixas."""
import math
import bpy
import mathutils
import numpy as np


def montar_estudio(amostras=48, larg=620, alt=540):
    for l in [o for o in bpy.data.objects if o.type in ('LIGHT', 'CAMERA')]:
        bpy.data.objects.remove(l, do_unlink=True)
    sol = bpy.data.lights.new('sol', 'SUN'); sol.energy = 3.2; sol.angle = 0.3
    so = bpy.data.objects.new('sol', sol); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(38))
    fl = bpy.data.lights.new('fill', 'AREA'); fl.energy = 150; fl.size = 4
    fo = bpy.data.objects.new('fill', fl); bpy.context.scene.collection.objects.link(fo)
    fo.location = (-2.5, 2.5, 1.6); fo.rotation_euler = (math.radians(58), 0, math.radians(-135))
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.42, 0.45, 0.49, 1)
    cam = bpy.data.cameras.new('cam'); cam.lens = 55
    co = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co)
    sc = bpy.context.scene
    sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.samples = amostras; sc.cycles.device = 'CPU'
    sc.render.resolution_x = larg; sc.render.resolution_y = alt
    return co


def foto(cam, caminho, alvo, ang, elev, dist):
    a, e = math.radians(ang), math.radians(elev)
    cam.location = (alvo[0] + math.cos(a) * math.cos(e) * dist,
                    alvo[1] + math.sin(a) * math.cos(e) * dist,
                    alvo[2] + math.sin(e) * dist)
    d = (mathutils.Vector(alvo) - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = caminho
    bpy.ops.render.render(write_still=True)


def centro(obj):
    obj.data.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = obj.evaluated_get(dg).to_mesh()
    co = np.array([v.co[:] for v in me.vertices])
    return tuple((co.min(0) + co.max(0)) / 2)
