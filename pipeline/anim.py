"""
Autoria de clipes de animação.

Uma pose é um dicionário {osso: (x, y, z)} em graus. Um clipe é uma lista de
(quadro, pose). Tudo o que não aparece numa pose volta ao repouso — assim cada
pose descreve só o que ela muda, e não se transforma numa parede de números.

O ciclo fecha de propósito: o primeiro e o último quadro são a mesma pose, e é
isso que deixa o clipe repetir sem solavanco.
"""
import math
import bpy

TODOS = None  # preenchido por `preparar`


def preparar(arm):
    global TODOS
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    TODOS = [pb.name for pb in arm.pose.bones]
    return arm


def _aplicar(arm, pose):
    for nome in TODOS:
        pb = arm.pose.bones[nome]
        x, y, z = pose.get(nome, (0, 0, 0))
        pb.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))


def _fcurves(act):
    """
    As curvas da Action, nas duas APIs.

    A partir do Blender 4.4 uma Action guarda as curvas dentro de
    camada > trecho > channelbag, e `act.fcurves` deixou de existir.
    """
    if hasattr(act, 'fcurves'):
        return list(act.fcurves)
    saida = []
    for camada in act.layers:
        for trecho in camada.strips:
            for slot in act.slots:
                cb = trecho.channelbag(slot)
                if cb:
                    saida.extend(cb.fcurves)
    return saida


def clipe(arm, nome, quadros, interpolacao='BEZIER'):
    """Cria uma Action com os quadros-chave dados e a devolve."""
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(nome)
    # Blender 4.4+ organiza Actions em slots; usar a API de alto nível evita
    # depender da versão.
    arm.animation_data.action = act
    for q, pose in quadros:
        _aplicar(arm, pose)
        for pbname in TODOS:
            arm.pose.bones[pbname].keyframe_insert(data_path='rotation_euler', frame=q)
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = interpolacao
    act.use_fake_user = True
    return act


def deitado(alt=1.0):
    """Postura base de gato deitado: pernas recolhidas sob o corpo."""
    return {
        'frenteE_cotovelo': (70 * alt, 0, 0), 'frenteD_cotovelo': (70 * alt, 0, 0),
        'frenteE_punho': (-60 * alt, 0, 0), 'frenteD_punho': (-60 * alt, 0, 0),
        'trasE_cotovelo': (-75 * alt, 0, 0), 'trasD_cotovelo': (-75 * alt, 0, 0),
        'trasE_punho': (85 * alt, 0, 0), 'trasD_punho': (85 * alt, 0, 0),
    }
