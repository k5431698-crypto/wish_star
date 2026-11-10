# 동자승 모티브 미니미 캐릭터 (Blender, bpy로 헤드리스 실행)
# 실행: python3 blender/character.py <bpy가 설치된 폴더> <출력 PNG 경로> [방향 각도(도)]
import sys, math
sys.path.insert(0, sys.argv[1])
import bpy, mathutils

out = sys.argv[2]
yaw = float(sys.argv[3]) if len(sys.argv) > 3 else 28.0

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
ROBE = mat('robe', (0.62, 0.64, 0.80), 0.85)
ROBE2 = mat('robe2', (0.50, 0.52, 0.70), 0.85)
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
# 옷깃 (브이)
for sx in (-1, 1):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.012, depth=0.17, location=(sx * 0.05, -0.17, 0.425))
    c = bpy.context.object; c.rotation_euler = (0, math.radians(sx * 22), 0); c.data.materials.append(ROBE2); bpy.ops.object.shade_smooth()
    c.rotation_euler = (math.radians(-6), math.radians(sx * 24), 0)

# 소매와 합장한 손
for sx in (-1, 1):
    s = sphere('sleeve', (sx * 0.135, -0.125, 0.335), (0.052, 0.052, 0.115), ROBE, rot=(math.radians(-52), math.radians(sx * 20), 0))
sphere('hands', (0, -0.205, 0.365), (0.034, 0.04, 0.046), SKIN)
# 고무신
for sx in (-1, 1):
    sphere('shoe', (sx * 0.095, -0.04, 0.042), (0.068, 0.115, 0.05), SHOE)

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
sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x = 900; sc.render.resolution_y = 900
sc.render.film_transparent = True   # 배경 투명 PNG (사이트에 바로 쓸 수 있음)
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items.keys() else 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('done', out)
