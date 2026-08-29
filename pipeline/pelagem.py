"""
Pelagem.

O modelo vem sem cor nenhuma — nem material, nem textura, nem UV. A cor é
construída aqui como um shader procedural em coordenadas do objeto, e depois
assada numa imagem. Fazer em coordenadas do objeto, e não da textura, é o que
faz o padrão acompanhar a anatomia: as listras dão a volta no corpo porque
variam ao longo da coluna, e não porque foram desenhadas assim num plano.

O gato é um tabby mackerel: listras verticais no tronco, ventre e queixo
claros, ponta das patas clara, focinho rosa, olhos verdes.
"""
import bpy
import mathutils

# Paleta de tabby marrom. Tons quentes; o pelo real reflete pouca cor pura,
# mas o primeiro teste saiu lavado — estes são mais fundos de propósito.
FUNDO_CLARO = (0.40, 0.27, 0.14, 1)
FUNDO_ESCURO = (0.24, 0.15, 0.075, 1)
LISTRA = (0.075, 0.048, 0.030, 1)
VENTRE = (0.70, 0.60, 0.44, 1)
FOCINHO = (0.55, 0.31, 0.30, 1)
IRIS = (0.46, 0.58, 0.16, 1)
PUPILA = (0.02, 0.02, 0.02, 1)


def _no(nt, tipo, x, y, **kw):
    n = nt.nodes.new(tipo)
    n.location = (x, y)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def _mistura(nt, x, y, fator, a, b):
    """Mix de cor, na API nova (ShaderNodeMix com data_type RGBA)."""
    m = _no(nt, 'ShaderNodeMix', x, y, data_type='RGBA', blend_type='MIX')
    if isinstance(fator, float):
        m.inputs['Factor'].default_value = fator
    else:
        nt.links.new(fator, m.inputs['Factor'])
    for nome, v in (('A', a), ('B', b)):
        entrada = m.inputs[6] if nome == 'A' else m.inputs[7]
        if isinstance(v, tuple):
            entrada.default_value = v
        else:
            nt.links.new(v, entrada)
    return m


def _mancha(nt, coords, centro, raio, suave, x, y, proporcao=(1, 1, 1)):
    """
    Máscara em volta de um ponto: nariz, pálpebra, íris, pupila.

    `proporcao` estica os eixos antes de medir a distância. É assim que sai a
    pupila em fenda vertical — a marca do olho de gato, e o que separa um olho
    felino de uma bolinha verde.
    """
    desloca = _no(nt, 'ShaderNodeVectorMath', x - 360, y, operation='SUBTRACT')
    desloca.inputs[1].default_value = centro
    nt.links.new(coords, desloca.inputs[0])
    estica = _no(nt, 'ShaderNodeVectorMath', x - 180, y, operation='DIVIDE')
    estica.inputs[1].default_value = proporcao
    nt.links.new(desloca.outputs['Vector'], estica.inputs[0])
    d = _no(nt, 'ShaderNodeVectorMath', x, y, operation='LENGTH')
    nt.links.new(estica.outputs['Vector'], d.inputs[0])
    r = _no(nt, 'ShaderNodeMapRange', x + 180, y)
    r.inputs['From Min'].default_value = raio
    r.inputs['From Max'].default_value = raio + suave
    r.inputs['To Min'].default_value = 1.0
    r.inputs['To Max'].default_value = 0.0
    r.clamp = True
    nt.links.new(d.outputs['Value'], r.inputs['Value'])
    return r.outputs['Result']


def construir(obj, olhos, focinho, comprimento=1.0):
    mat = bpy.data.materials.new('pelo')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    saida = _no(nt, 'ShaderNodeOutputMaterial', 1600, 0)

    coord = _no(nt, 'ShaderNodeTexCoord', -1400, 0)
    obj_co = coord.outputs['Object']

    # --- listras ---
    # Tabby mackerel: linhas escuras estreitas sobre fundo mais claro, não
    # faixas de igual largura. A primeira tentativa saiu zebra por isso: banda
    # com meio a meio de claro e escuro, regular demais e em excesso.
    ruido = _no(nt, 'ShaderNodeTexNoise', -1150, -320)
    ruido.inputs['Scale'].default_value = 3.5
    ruido.inputs['Detail'].default_value = 6.0
    nt.links.new(obj_co, ruido.inputs['Vector'])

    onda = _no(nt, 'ShaderNodeTexWave', -900, -120,
               wave_type='BANDS', bands_direction='X', wave_profile='SIN')
    onda.inputs['Scale'].default_value = 5.2
    onda.inputs['Distortion'].default_value = 3.4
    onda.inputs['Detail'].default_value = 3.0
    onda.inputs['Detail Scale'].default_value = 1.4
    nt.links.new(obj_co, onda.inputs['Vector'])

    rampa = _no(nt, 'ShaderNodeValToRGB', -680, -120)
    # Janela estreita e alta: só o topo da onda vira listra.
    rampa.color_ramp.elements[0].position = 0.64
    rampa.color_ramp.elements[1].position = 0.84
    nt.links.new(onda.outputs['Fac'], rampa.inputs['Fac'])

    # --- variação de fundo (o "ticking" do pelo agouti) ---
    manchas = _no(nt, 'ShaderNodeTexNoise', -1150, 260)
    manchas.inputs['Scale'].default_value = 14.0
    manchas.inputs['Detail'].default_value = 8.0
    nt.links.new(obj_co, manchas.inputs['Vector'])
    fundo = _mistura(nt, -900, 260, manchas.outputs['Fac'], FUNDO_ESCURO, FUNDO_CLARO)

    corpo = _mistura(nt, -450, 0, rampa.outputs['Color'], fundo.outputs[2], LISTRA)

    # --- risca dorsal ---
    # A linha escura que corre na espinha, presente em todo tabby. Sai da
    # combinação de estar no alto e perto da linha do meio.
    sep = _no(nt, 'ShaderNodeSeparateXYZ', -1150, 560)
    nt.links.new(obj_co, sep.inputs['Vector'])
    absy = _no(nt, 'ShaderNodeMath', -960, 700, operation='ABSOLUTE')
    nt.links.new(sep.outputs['Y'], absy.inputs[0])
    meio = _no(nt, 'ShaderNodeMapRange', -800, 700)
    meio.inputs['From Min'].default_value = comprimento * 0.010
    meio.inputs['From Max'].default_value = comprimento * 0.045
    meio.inputs['To Min'].default_value = 1.0
    meio.inputs['To Max'].default_value = 0.0
    meio.clamp = True
    nt.links.new(absy.outputs['Value'], meio.inputs['Value'])
    dorso = _no(nt, 'ShaderNodeMapRange', -800, 860)
    dorso.inputs['From Min'].default_value = comprimento * 0.40
    dorso.inputs['From Max'].default_value = comprimento * 0.50
    dorso.inputs['To Min'].default_value = 0.0
    dorso.inputs['To Max'].default_value = 1.0
    dorso.clamp = True
    nt.links.new(sep.outputs['Z'], dorso.inputs['Value'])
    risca = _no(nt, 'ShaderNodeMath', -600, 780, operation='MULTIPLY')
    nt.links.new(meio.outputs['Result'], risca.inputs[0])
    nt.links.new(dorso.outputs['Result'], risca.inputs[1])
    com_risca = _mistura(nt, -300, 400, risca.outputs['Value'], corpo.outputs[2], LISTRA)

    # --- ventre claro ---
    # Pela normal, não pela altura. A barriga é o que aponta para baixo; a
    # altura sozinha punha as quatro pernas inteiras de creme, porque perna é
    # baixa.
    geo = _no(nt, 'ShaderNodeNewGeometry', -1150, 900)
    nsep = _no(nt, 'ShaderNodeSeparateXYZ', -960, 900)
    nt.links.new(geo.outputs['Normal'], nsep.inputs['Vector'])
    baixo = _no(nt, 'ShaderNodeMapRange', -760, 980)
    baixo.inputs['From Min'].default_value = -0.15
    baixo.inputs['From Max'].default_value = -0.62
    baixo.inputs['To Min'].default_value = 0.0
    baixo.inputs['To Max'].default_value = 1.0
    baixo.clamp = True
    nt.links.new(nsep.outputs['Z'], baixo.inputs['Value'])
    # Só vale abaixo da linha dos flancos: a nuca também aponta para cima.
    altura = _no(nt, 'ShaderNodeMapRange', -760, 1140)
    altura.inputs['From Min'].default_value = comprimento * 0.34
    altura.inputs['From Max'].default_value = comprimento * 0.22
    altura.inputs['To Min'].default_value = 0.0
    altura.inputs['To Max'].default_value = 1.0
    altura.clamp = True
    nt.links.new(sep.outputs['Z'], altura.inputs['Value'])
    ventre = _no(nt, 'ShaderNodeMath', -560, 1060, operation='MULTIPLY')
    nt.links.new(baixo.outputs['Result'], ventre.inputs[0])
    nt.links.new(altura.outputs['Result'], ventre.inputs[1])
    claro = _mistura(nt, -200, 200, ventre.outputs['Value'], com_risca.outputs[2], VENTRE)

    # --- focinho, íris e pupila ---
    m_foc = _mancha(nt, obj_co, tuple(focinho), comprimento * 0.0085, comprimento * 0.006, -1000, -700)
    com_foc = _mistura(nt, 100, 200, m_foc, claro.outputs[2], FOCINHO)

    atual = com_foc.outputs[2]
    for i, olho in enumerate(olhos):
        c = tuple(olho)
        base_x = 300 + i * 260
        # Pálpebra: o contorno escuro em volta do olho. Sem ele a íris fica
        # colada na pelagem e o olho parece um adesivo.
        m_pal = _mancha(nt, obj_co, c, comprimento * 0.021, comprimento * 0.006,
                        -1000, -900 - i * 500, proporcao=(1.0, 1.0, 0.80))
        com_pal = _mistura(nt, base_x, 220 - i * 150, m_pal, atual, LISTRA)
        m_iris = _mancha(nt, obj_co, c, comprimento * 0.0155, comprimento * 0.0025,
                         -1000, -1050 - i * 500, proporcao=(1.0, 1.0, 0.82))
        com_iris = _mistura(nt, base_x + 90, 150 - i * 150, m_iris, com_pal.outputs[2], IRIS)
        # Fenda vertical: estreita em Y, alta em Z.
        m_pup = _mancha(nt, obj_co, c, comprimento * 0.011, comprimento * 0.0022,
                        -1000, -1200 - i * 500, proporcao=(1.0, 0.30, 1.5))
        com_pup = _mistura(nt, base_x + 180, 80 - i * 150, m_pup, com_iris.outputs[2], PUPILA)
        atual = com_pup.outputs[2]

    # Assar cor pura: emissão não recebe luz, então o que sai na imagem é
    # exatamente a cor da pelagem, sem sombra cozida junto.
    emis = _no(nt, 'ShaderNodeEmission', 1350, 0)
    nt.links.new(atual, emis.inputs['Color'])
    nt.links.new(emis.outputs['Emission'], saida.inputs['Surface'])

    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def assar(obj, mat, tamanho=2048, caminho=None):
    img = bpy.data.images.new('pelo_mapa', tamanho, tamanho)
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (1350, -400)
    nt.nodes.active = tex

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 1
    sc.cycles.device = 'CPU'
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.margin = 12
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='EMIT')
    if caminho:
        img.filepath_raw = caminho
        img.file_format = 'PNG'
        img.save()
    return img


def material_final(obj, img):
    """
    Troca o shader de autoria pelo material que vai para o jogo.

    O que se assa é cor; o que se exporta é uma superfície. O `sheen` é o que
    faz pelo parecer pelo: a luz corre na ponta do fio, não na pele.
    """
    mat = bpy.data.materials.new('gato')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (-400, 0)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.82
    bsdf.inputs['Metallic'].default_value = 0.0
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat
