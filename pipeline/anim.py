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

TODOS = None       # nomes dos ossos, preenchido por `preparar`
ALTURA = 1.0       # altura do quadril acima do chão, idem


def preparar(arm):
    """
    Prepara o esqueleto e mede a altura do quadril.

    Os deslocamentos de raiz nas poses são frações dessa altura, não unidades
    do arquivo: o modelo já mudou de escala uma vez no meio do pipeline, e
    poses escritas em unidades absolutas viram lixo silencioso quando isso
    acontece — o gato afunda no chão ou flutua, e nada no código denuncia.
    """
    global TODOS, ALTURA
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    TODOS = [pb.name for pb in arm.pose.bones]
    ossos = arm.data.bones
    ALTURA = float(ossos['coluna0'].head_local.z - ossos['raiz'].head_local.z)
    return arm


def _aplicar(arm, pose):
    """
    Escreve uma pose nos ossos.

    A chave `_raiz` é o deslocamento do corpo em espaço do mundo — descer para
    sentar, subir para pular. Ela é convertida para o espaço do próprio osso
    porque é assim que o Blender guarda translação de osso, e escrever direto
    ali mandaria o gato para o lado errado.
    """
    import mathutils
    for nome in TODOS:
        pb = arm.pose.bones[nome]
        x, y, z = pose.get(nome, (0, 0, 0))
        pb.rotation_euler = (math.radians(x), math.radians(y), math.radians(z))
        pb.location = (0, 0, 0)
    raiz = arm.pose.bones.get('raiz')
    if raiz is not None:
        mundo = mathutils.Vector(pose.get('_raiz', (0, 0, 0))) * ALTURA
        raiz.location = raiz.bone.matrix_local.to_3x3().inverted() @ mundo


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
        if 'raiz' in TODOS:
            arm.pose.bones['raiz'].keyframe_insert(data_path='location', frame=q)
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
