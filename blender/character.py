# 동자승 모티브 미니미 캐릭터 (Blender, bpy로 헤드리스 실행)
# 실행: python3 blender/character.py <bpy가 설치된 폴더> <출력 PNG 경로> [방향 각도(도)]
import sys, math
sys.path.insert(0, sys.argv[1])
import bpy, mathutils

out = sys.argv[2]
yaw = float(sys.argv[3]) if len(sys.argv) > 3 else 28.0
style = sys.argv[4] if len(sys.argv) > 4 else 'monk'   # monk | bunny | bunny_nohat | star | cozy
res = int(sys.argv[5]) if len(sys.argv) > 5 else 900
samples = int(sys.argv[6]) if len(sys.argv) > 6 else 96

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, rgb, rough=0.6, sss=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.3)
        b.inputs['Subsurface Scale'].default_value = 0.05
    return m

SKIN = mat('skin', (1.0, 0.84, 0.74), 0.55, sss=0.25)
ROBE_COL = {'monk': (0.62, 0.64, 0.80), 'bunny': (0.95, 0.92, 0.90), 'bunny_nohat': (0.95, 0.92, 0.90), 'star': (0.16, 0.18, 0.40), 'cozy': (0.93, 0.78, 0.80)}[style]
ROBE = mat('robe', ROBE_COL, 0.85)
ROBE2 = mat('robe2', tuple(c * 0.8 for c in ROBE_COL), 0.85)
BELT = mat('belt', (0.80, 0.60, 0.42), 0.7)
SHOE = mat('shoe', (0.97, 0.95, 0.92), 0.5)
DARK = mat('dark', (0.04, 0.025, 0.05), 0.15)
WHITE = mat('white', (1, 1, 1), 0.1)
CHEEK = mat('cheek', (1.0, 0.45, 0.55), 0.8)
MOUTH = mat('mouth', (0.65, 0.25, 0.30), 0.5)

def sphere(name, loc, scale, m, rot=(0, 0, 0), seg=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o

# 머리 (민머리)와 귀
sphere('head', (0, 0, 0.74), (0.275, 0.26, 0.255), SKIN)
sphere('earL', (-0.265, 0.0, 0.715), (0.05, 0.035, 0.06), SKIN)
sphere('earR', (0.265, 0.0, 0.715), (0.05, 0.035, 0.06), SKIN)
# 눈 (앞쪽이 -Y 방향)
for sx in (-1, 1):
    sphere('eye', (sx * 0.095, -0.232, 0.725), (0.032, 0.02, 0.04), DARK)
    sphere('eyeHi', (sx * 0.088, -0.249, 0.738), (0.009, 0.006, 0.009), WHITE, seg=16)
    sphere('cheek', (sx * 0.15, -0.205, 0.665), (0.048, 0.01, 0.03), CHEEK)
# 입 (작은 미소)
cu = bpy.data.curves.new('smile', 'CURVE'); cu.dimensions = '3D'
sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
pts = [(-0.035, -0.246, 0.665), (0, -0.252, 0.652), (0.035, -0.246, 0.665)]
for p, co in zip(sp.bezier_points, pts):
    p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'
cu.bevel_depth = 0.0042; cu.bevel_resolution = 4
mo = bpy.data.objects.new('mouth', cu); bpy.context.collection.objects.link(mo); mo.data.materials.append(MOUTH)

# 승복(몸): 아래가 약간 넓은 부드러운 모양
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(0, 0, 0.255))
body = bpy.context.object; body.name = 'robe'
body.scale = (0.215, 0.185, 0.29); body.data.materials.append(ROBE)
bpy.ops.object.shade_smooth()
# 아래쪽을 살짝 넓히고 바닥은 평평하게
import bmesh
bm = bmesh.new(); bm.from_mesh(body.data)
for v in bm.verts:
    if v.co.z < -0.55:
        v.co.z = -0.55 + (v.co.z + 0.55) * 0.12
    if v.co.z < 0.0:
        k = 1 + (-v.co.z) * 0.22
        v.co.x *= k; v.co.y *= k
bm.to_mesh(body.data); bm.free()
bpy.ops.object.shade_smooth()
# 허리띠
bpy.ops.mesh.primitive_torus_add(major_radius=0.205, minor_radius=0.017, major_segments=64, minor_segments=16, location=(0, 0, 0.245))
belt = bpy.context.object; belt.scale = (1, 0.88, 1); belt.data.materials.append(BELT); bpy.ops.object.shade_smooth()
# (옷깃의 막대 모양은 목걸이 줄처럼 보여서 뺌)

# 소매와 합장한 손
for sx in (-1, 1):
    s = sphere('sleeve', (sx * 0.135, -0.125, 0.335), (0.046, 0.046, 0.1), ROBE, rot=(math.radians(-50), math.radians(sx * 18), 0))
# (가운데에 매달린 것처럼 보이던 손 모양은 뺌)
# 고무신
for sx in (-1, 1):
    sphere('shoe', (sx * 0.095, -0.04, 0.042), (0.068, 0.115, 0.05), SHOE)

# ---- 스타일별 장식 ----
def dome(name, scale, loc, m, cut=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=loc)
    o = bpy.context.object; o.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    o.scale = scale; o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o

if style == 'bunny':
    HOOD = mat('hood', (0.98, 0.96, 0.95), 0.9)
    PINK = mat('pink', (1.0, 0.72, 0.8), 0.8)
    dome('hood', (0.292, 0.278, 0.272), (0, 0.005, 0.735), HOOD, cut=0.12)
    for sx in (-1, 1):
        sphere('ear', (sx * 0.1, 0.0, 1.02), (0.05, 0.03, 0.2), HOOD, rot=(0, math.radians(sx * 12), 0))
        sphere('earIn', (sx * 0.1, -0.022, 1.02), (0.03, 0.015, 0.15), PINK, rot=(0, math.radians(sx * 12), 0))
    sphere('tail', (0, 0.2, 0.12), (0.07, 0.07, 0.07), HOOD)
elif style == 'bunny_nohat':
    sphere('tail', (0, 0.2, 0.12), (0.07, 0.07, 0.07), mat('hood', (0.98, 0.96, 0.95), 0.9))
elif style == 'star':
    GOLD = mat('gold', (1.0, 0.8, 0.3), 0.35)
    CAPE = mat('cape', (0.28, 0.25, 0.55), 0.8)
    BAG = mat('bag', (0.72, 0.5, 0.36), 0.7)
    sphere('cape', (0, 0.1, 0.30), (0.23, 0.07, 0.28), CAPE)
    for i, (x, z) in enumerate([(-0.09, 0.36), (0.1, 0.30), (-0.03, 0.17), (0.12, 0.17)]):
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.022, depth=0.012, location=(x, -0.19, z), rotation=(math.radians(90), 0, 0))
        st = bpy.context.object; st.data.materials.append(GOLD)
    # 별 머리핀
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=0.05, depth=0.02, location=(0.17, -0.14, 0.93), rotation=(math.radians(90), math.radians(10), 0))
    bpy.context.object.data.materials.append(GOLD)
    # 우편 가방
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.2, -0.02, 0.17)); bg_ = bpy.context.object
    bg_.scale = (0.07, 0.1, 0.085); bg_.data.materials.append(BAG)
    bev = bg_.modifiers.new('b', 'BEVEL'); bev.width = 0.02; bev.segments = 4
    bpy.ops.object.shade_smooth()
elif style == 'cozy':
    BEAN = mat('beanie', (0.55, 0.45, 0.80), 0.9)
    SCARF = mat('scarf', (1.0, 0.62, 0.7), 0.9)
    SCARF2 = mat('scarf2', (1.0, 0.95, 0.9), 0.9)
    dome('beanie', (0.29, 0.275, 0.27), (0, 0.0, 0.745), BEAN, cut=0.2)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.265, minor_radius=0.032, major_segments=64, minor_segments=16, location=(0, 0, 0.805))
    bpy.context.object.scale = (1.0, 0.95, 1.0); bpy.context.object.data.materials.append(BEAN); bpy.ops.object.shade_smooth()
    sphere('pom', (0, 0, 1.0), (0.055, 0.055, 0.055), SCARF2)
    for i, (z, m_) in enumerate([(0.455, SCARF), (0.43, SCARF2), (0.405, SCARF)]):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.022, major_segments=64, minor_segments=16, location=(0, 0, z))
        t = bpy.context.object; t.scale = (1, 0.9, 1); t.data.materials.append(m_); bpy.ops.object.shade_smooth()

# 바닥 (그림자만 받는 부드러운 바닥)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
fl = bpy.context.object
fm = mat('floor', (0.80, 0.77, 0.96), 1.0)
fl.data.materials.append(fm)
fl.is_shadow_catcher = True   # 바닥은 그림자만 남기고 투명하게

# 월드 (은은한 달빛 하늘색)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.78, 0.76, 0.96, 1); bg.inputs[1].default_value = 0.45

# 조명
def area(name, loc, energy, size, rgb):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = rgb
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
    d = mathutils.Vector((0, 0, 0.45)) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
area('key', (1.6, -2.2, 2.6), 28, 2.2, (1.0, 0.95, 0.9))
area('fill', (-2.4, -1.6, 1.4), 9, 3.0, (0.8, 0.85, 1.0))
area('rim', (0.6, 2.2, 1.8), 22, 1.6, (0.85, 0.8, 1.0))

# 카메라 (살짝 위에서 비스듬히)
cam = bpy.data.cameras.new('cam'); cam.lens = 70
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
r = 3.5; a = math.radians(yaw)
co.location = (math.sin(a) * r, -math.cos(a) * r, 1.05)
d = mathutils.Vector((0, 0, 0.47)) - co.location
co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# 렌더
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = samples; sc.cycles.use_denoising = True
sc.render.resolution_x = res; sc.render.resolution_y = res
sc.render.film_transparent = True   # 배경 투명 PNG (사이트에 바로 쓸 수 있음)
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items.keys() else 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('done', out)
