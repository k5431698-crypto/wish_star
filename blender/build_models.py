# 캐릭터(기본 몸)와 꾸미기 아이템을 Blender로 만들어 glTF(.glb)로 내보내고, 아이템 미리보기를 렌더한다.
# 실행: python3 blender/build_models.py <bpy가 설치된 폴더> <저장소 폴더> [미리보기 렌더 여부 1/0]
#
# 내보내는 파일: assets/models/character.glb
#   - 몸 부위 이름: Head(머리 묶음), Body, SleeveL, SleeveR, ShoeL, ShoeR, Tail
#   - 아이템 이름(Item_ 으로 시작, 사이트에서 보였다 숨겼다 함):
#       Item_BunnyHood(토끼 후드), Item_Beanie(비니), Item_StarPin(별 머리핀),
#       Item_MailBag(우편 가방), Item_Scarf(목도리), Item_FlowerCrown(꽃 화관)
#   - 앞쪽은 glTF 기준 +Z (Blender에서는 -Y)
import sys, math, os
sys.path.insert(0, sys.argv[1])
import bpy, bmesh, mathutils

REPO = sys.argv[2]
RENDER = (sys.argv[3] if len(sys.argv) > 3 else '1') == '1'
SEG = 32

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection


def mat(name, rgb, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


SKIN = mat('Skin', (1.0, 0.84, 0.74), 0.55)
ROBE = mat('Robe', (0.95, 0.92, 0.90), 0.85)
BELT = mat('Belt', (0.80, 0.60, 0.42), 0.7)
SHOE = mat('Shoe', (0.97, 0.95, 0.92), 0.5)
DARK = mat('Eye', (0.04, 0.025, 0.05), 0.15)
WHITE = mat('EyeHi', (1, 1, 1), 0.1)
CHEEK = mat('Cheek', (1.0, 0.45, 0.55), 0.8)
MOUTH = mat('Mouth', (0.65, 0.25, 0.30), 0.5)
HOOD = mat('Hood', (0.98, 0.96, 0.95), 0.9)
PINK = mat('Pink', (1.0, 0.72, 0.8), 0.8)
BEAN = mat('Beanie', (0.55, 0.45, 0.80), 0.9)
SCARF = mat('Scarf', (1.0, 0.62, 0.7), 0.9)
SCARF2 = mat('Scarf2', (1.0, 0.95, 0.9), 0.9)
GOLD = mat('Gold', (1.0, 0.8, 0.3), 0.3, 0.3, 0.4)
BAG = mat('Bag', (0.72, 0.5, 0.36), 0.7)
LEAF = mat('Leaf', (0.55, 0.78, 0.6), 0.8)
FLOW = [mat('FlowerA', (1.0, 0.75, 0.85), 0.7), mat('FlowerB', (0.85, 0.78, 1.0), 0.7), mat('FlowerC', (1.0, 0.95, 0.7), 0.7)]


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


def finish(o, m, parent):
    o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    if parent:
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = mw
    return o


def sphere(name, loc, scale, m, parent=None, rot=(0, 0, 0), seg=SEG):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    return finish(o, m, parent)


def dome(name, scale, loc, m, cut, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=SEG + 8, ring_count=(SEG + 8) // 2, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    o.scale = scale
    return finish(o, m, parent)


def torus(name, R, r, loc, m, parent, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return finish(o, m, parent)


def star(name, loc, size, m, parent, rot=(math.radians(90), 0, 0)):
    # 다섯 꼭지 별 (납작한 입체)
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = size if i % 2 == 0 else size * 0.45
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    top = [bm.verts.new((x, y, size * 0.18)) for x, y in pts]
    bot = [bm.verts.new((x, y, -size * 0.18)) for x, y in pts]
    bm.faces.new(top); bm.faces.new(list(reversed(bot)))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new([top[i], top[j], bot[j], bot[i]])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(m)
    bpy.context.view_layer.update()   # 위치가 반영된 뒤에 부모를 붙여야 자리가 안 틀어짐
    if parent:
        mw = o.matrix_world.copy(); o.parent = parent; o.matrix_world = mw
    return o


# ---------------- 캐릭터 기본 몸 ----------------
root = empty('Character')
head = empty('Head', (0, 0, 0.74), root)
sphere('HeadBall', (0, 0, 0.74), (0.275, 0.26, 0.255), SKIN, head)
sphere('EarL', (-0.265, 0.0, 0.715), (0.05, 0.035, 0.06), SKIN, head)
sphere('EarR', (0.265, 0.0, 0.715), (0.05, 0.035, 0.06), SKIN, head)
for sx, nm in ((-1, 'L'), (1, 'R')):
    sphere('Eye' + nm, (sx * 0.095, -0.232, 0.725), (0.032, 0.02, 0.04), DARK, head, seg=20)
    sphere('EyeHi' + nm, (sx * 0.088, -0.249, 0.738), (0.009, 0.006, 0.009), WHITE, head, seg=12)
    sphere('Cheek' + nm, (sx * 0.15, -0.205, 0.665), (0.048, 0.01, 0.03), CHEEK, head, seg=20)
cu = bpy.data.curves.new('Mouth', 'CURVE'); cu.dimensions = '3D'
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
for p, co in zip(sp.bezier_points, [(-0.035, -0.246, 0.665), (0, -0.252, 0.652), (0.035, -0.246, 0.665)]):
    p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'
cu.bevel_depth = 0.0045; cu.bevel_resolution = 3
mo = bpy.data.objects.new('Mouth', cu); col.objects.link(mo); mo.data.materials.append(MOUTH)
bpy.ops.object.select_all(action='DESELECT'); mo.select_set(True); bpy.context.view_layer.objects.active = mo
bpy.ops.object.convert(target='MESH')
mo = bpy.context.object; mw = mo.matrix_world.copy(); mo.parent = head; mo.matrix_world = mw

# 몸(승복)
bpy.ops.mesh.primitive_uv_sphere_add(segments=SEG + 8, ring_count=(SEG + 8) // 2, radius=1, location=(0, 0, 0.255))
body = bpy.context.object; body.name = 'Body'
body.scale = (0.215, 0.185, 0.29)
bm = bmesh.new(); bm.from_mesh(body.data)
for v in bm.verts:
    if v.co.z < -0.55:
        v.co.z = -0.55 + (v.co.z + 0.55) * 0.12
    if v.co.z < 0.0:
        k = 1 + (-v.co.z) * 0.22
        v.co.x *= k; v.co.y *= k
bm.to_mesh(body.data); bm.free()
finish(body, ROBE, root)
torus('Belt', 0.205, 0.017, (0, 0, 0.245), BELT, root, scale=(1, 0.88, 1))
# 소매(팔): 걸을 때 흔들 수 있게 따로
for sx, nm in ((-1, 'L'), (1, 'R')):
    arm = empty('Sleeve' + nm, (sx * 0.17, -0.02, 0.43), root)        # 어깨를 축으로 흔듦
    sphere('SleeveMesh' + nm, (sx * 0.135, -0.125, 0.335), (0.046, 0.046, 0.1), ROBE, arm, rot=(math.radians(-50), math.radians(sx * 18), 0))
    foot = empty('Shoe' + nm, (sx * 0.095, -0.04, 0.042), root)
    sphere('ShoeMesh' + nm, (sx * 0.095, -0.04, 0.042), (0.068, 0.115, 0.05), SHOE, foot)
sphere('Tail', (0, 0.2, 0.12), (0.07, 0.07, 0.07), HOOD, root)

# ---------------- 꾸미기 아이템 ----------------
it = empty('Item_BunnyHood', (0, 0, 0.74), head)
dome('BunnyHoodCap', (0.292, 0.278, 0.272), (0, 0.005, 0.735), HOOD, 0.12, it)
for sx in (-1, 1):
    sphere('BunnyEar', (sx * 0.1, 0.0, 1.02), (0.05, 0.03, 0.2), HOOD, it, rot=(0, math.radians(sx * 12), 0))
    sphere('BunnyEarIn', (sx * 0.1, -0.022, 1.02), (0.03, 0.015, 0.15), PINK, it, rot=(0, math.radians(sx * 12), 0))

it = empty('Item_Beanie', (0, 0, 0.74), head)
dome('BeanieCap', (0.29, 0.275, 0.27), (0, 0.0, 0.745), BEAN, 0.2, it)
torus('BeanieFold', 0.265, 0.032, (0, 0, 0.805), BEAN, it, scale=(1.0, 0.95, 1.0))
sphere('BeaniePom', (0, 0, 1.0), (0.055, 0.055, 0.055), SCARF2, it)

it = empty('Item_StarPin', (0, 0, 0.74), head)
star('StarPinStar', (0.15, -0.17, 0.92), 0.065, GOLD, it, rot=(math.radians(75), math.radians(15), 0))

it = empty('Item_MailBag', (0, 0, 0.3), root)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.215, -0.04, 0.16))
bag = bpy.context.object; bag.name = 'MailBagBox'; bag.scale = (0.07, 0.1, 0.085)
bev = bag.modifiers.new('b', 'BEVEL'); bev.width = 0.02; bev.segments = 3
finish(bag, BAG, it)
strap = torus('MailBagStrap', 0.225, 0.012, (0, 0, 0.31), BAG, None, scale=(1, 0.9, 1.15))
strap.rotation_euler = (0, math.radians(35), 0)
bpy.context.view_layer.update(); mw = strap.matrix_world.copy(); strap.parent = it; strap.matrix_world = mw
star('MailBagStar', (0.288, -0.04, 0.17), 0.03, GOLD, it, rot=(0, math.radians(90), 0))

it = empty('Item_Scarf', (0, 0, 0.45), root)
for z, m_ in ((0.455, SCARF), (0.43, SCARF2), (0.405, SCARF)):
    torus('ScarfRing', 0.17, 0.022, (0, 0, z), m_, it, scale=(1, 0.9, 1))
sphere('ScarfTail', (0.09, -0.16, 0.36), (0.04, 0.02, 0.08), SCARF, it)

it = empty('Item_FlowerCrown', (0, 0, 0.74), head)
torus('CrownVine', 0.24, 0.013, (0, 0, 0.9), LEAF, it, scale=(1, 0.95, 1))
for i in range(9):
    a = i / 9 * math.pi * 2
    sphere('Flower', (math.cos(a) * 0.24, math.sin(a) * 0.228, 0.905), (0.035, 0.035, 0.03), FLOW[i % 3], it, seg=16)

ITEMS = ['Item_BunnyHood', 'Item_Beanie', 'Item_StarPin', 'Item_MailBag', 'Item_Scarf', 'Item_FlowerCrown']

# ---------------- glb 내보내기 ----------------
os.makedirs(os.path.join(REPO, 'assets', 'models'), exist_ok=True)
glb = os.path.join(REPO, 'assets', 'models', 'character.glb')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True)
print('exported', glb, os.path.getsize(glb))

# ---------------- 아이템 미리보기 렌더 ----------------
if RENDER:
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    fl = bpy.context.object; fl.is_shadow_catcher = True
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    bgn = w.node_tree.nodes['Background']; bgn.inputs[0].default_value = (0.78, 0.76, 0.96, 1); bgn.inputs[1].default_value = 0.45

    def area(name, loc, energy, size, rgb):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = rgb
        o = bpy.data.objects.new(name, l); col.objects.link(o); o.location = loc
        d = mathutils.Vector((0, 0, 0.45)) - o.location
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    area('key', (1.6, -2.2, 2.6), 28, 2.2, (1.0, 0.95, 0.9))
    area('fill', (-2.4, -1.6, 1.4), 9, 3.0, (0.8, 0.85, 1.0))
    area('rim', (0.6, 2.2, 1.8), 22, 1.6, (0.85, 0.8, 1.0))
    cam = bpy.data.cameras.new('cam'); cam.lens = 70
    co = bpy.data.objects.new('cam', cam); col.objects.link(co); sc.camera = co
    a = math.radians(28)
    co.location = (math.sin(a) * 3.5, -math.cos(a) * 3.5, 1.1)
    d = mathutils.Vector((0, 0, 0.5)) - co.location
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = 40; sc.cycles.use_denoising = True
    sc.render.resolution_x = 440; sc.render.resolution_y = 440
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'

    def show_only(name):
        for n in ITEMS:
            hide = (n != name)
            for o in [bpy.data.objects[n]] + list(bpy.data.objects[n].children_recursive):
                o.hide_render = hide
    outdir = os.path.join(REPO, 'blender', '_render')
    os.makedirs(outdir, exist_ok=True)
    for n in [None] + ITEMS:
        show_only(n)
        sc.render.filepath = os.path.join(outdir, (n or 'Item_None') + '.png')
        bpy.ops.render.render(write_still=True)
    print('rendered')
