# 달빛 섬 맵을 Blender로 만들어 glTF(.glb)로 내보내고, 미리보기를 렌더한다.
# 실행: python3 blender/build_map.py <bpy가 설치된 폴더> <저장소 폴더> [미리보기 렌더 1/0]
#
# 내보내는 파일
#   assets/models/island.glb       : 섬 지형, 산책길, 등대, 나무, 우체통, 바위, 부두, 등불, 벤치, 작은 섬과 의자
#   assets/models/island-map.json  : 걷기용 높이 지도(heights)와 막힌 곳(obstacles), 시작 위치(spawn), 장소(places)
# 좌표는 웹(Three.js) 기준으로 설계: x 오른쪽, y 위, z 앞쪽. Blender에는 (x, -z, y)로 넣는다.
import sys, math, os, json, random
sys.path.insert(0, sys.argv[1])
import bpy, bmesh, mathutils
from mathutils import Vector, noise

REPO = sys.argv[2]
RENDER = (sys.argv[3] if len(sys.argv) > 3 else '1') == '1'
rng = random.Random(20261115)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection


def B(x, y, z):            # 웹 좌표 → Blender 좌표
    return (x, -z, y)


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fbm(x, z, oct=4):
    s, amp, f = 0.0, 0.5, 1.0
    for _ in range(oct):
        s += amp * noise.noise(Vector((x * f, z * f, 0.37)))
        f *= 2; amp *= 0.5
    return s          # 대략 -0.5 ~ 0.5


# ---------- 길 ----------
MAIN_PATH = [(0, 7), (1.5, -3), (-2.5, -12), (1, -21), (8, -28), (15, -31)]          # 시작 → 등대
PIER_PATH = [(1.5, -3), (-8, -6), (-17, -8), (-24, -9)]                              # 갈림길 → 부두
PATHS = [MAIN_PATH, PIER_PATH]


def seg_dist(px, pz, a, b):
    abx, abz = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / (abx * abx + abz * abz)))
    return math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t))


def path_dist(x, z):
    return min(seg_dist(x, z, p[i], p[i + 1]) for p in PATHS for i in range(len(p) - 1))


# ---------- 섬 높이 ----------
def height(x, z):
    r = math.hypot(x, z * 0.85)
    coast = 33 + fbm(x * 0.04 + 3, z * 0.04 + 7, 2) * 16
    h = 3.0 * (1 - sstep(coast - 15, coast, r)) + fbm(x * 0.05, z * 0.05) * 2.4 - 0.6
    pd = path_dist(x, z)
    if pd < 2.4 and h > 0.3:
        h = h * 0.8 + 0.3 * (1 - pd / 2.4)
    # 작은 섬 (의자가 있는 곳)
    ih = 1.1 * (1 - sstep(2.0, 4.5, math.hypot(x + 31, z - 6)))
    return max(h, ih - 0.4)


def lin(hexv):
    c = mathutils.Color(((hexv >> 16 & 255) / 255, (hexv >> 8 & 255) / 255, (hexv & 255) / 255))
    return tuple(cc ** 2.2 for cc in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def mat(name, rgb, rough=0.7, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emit:
        bs.inputs['Emission Color'].default_value = (*rgb, 1)
        bs.inputs['Emission Strength'].default_value = emit
    return m


# ---------- 지형 메쉬 (꼭짓점 색으로 풀·모래·길 표현) ----------
SIZE, RES = 112, 140
step = SIZE / RES
verts, faces, cols, H = [], [], [], []
GRASS_A, GRASS_B, TIP = lin(0x9d93d0), lin(0x86ada1), lin(0xcabdf3)
SAND, WET, PATHC = lin(0xe0cfc4), lin(0x8a7fa0), lin(0xd8c8b8)
for j in range(RES + 1):
    row = []
    for i in range(RES + 1):
        x = -SIZE / 2 + i * step
        z = -SIZE / 2 + j * step
        h = height(x, z)
        row.append(round(h, 3))
        verts.append(B(x, h, z))
        n = fbm(x * 0.12 + 9, z * 0.12 - 4, 2) + 0.5
        c = mix(GRASS_A, GRASS_B, sstep(0.45, 0.7, n))
        c = mix(c, TIP, sstep(0.55, 0.85, fbm(x * 0.4, z * 0.4, 2) + 0.5) * 0.35)
        c = mix(c, SAND, 1 - sstep(0.25, 0.8, h))
        c = mix(c, WET, 1 - sstep(-0.3, 0.15, h))
        c = mix(c, PATHC, (1 - sstep(0.9, 1.6, path_dist(x, z))) * sstep(0.2, 0.5, h))
        cols.append(c)
    H.append(row)
for j in range(RES):
    for i in range(RES):
        a = j * (RES + 1) + i
        faces.append((a, a + 1, a + RES + 2, a + RES + 1))
me = bpy.data.meshes.new('Terrain')
me.from_pydata(verts, [], faces)
me.update()
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for k, c in enumerate(cols):
    ca.data[k].color = (*c, 1)
terrain = bpy.data.objects.new('Terrain', me)
col.objects.link(terrain)
for p in me.polygons:
    p.use_smooth = True
tm = bpy.data.materials.new('Terrain')
tm.use_nodes = True
nt = tm.node_tree
attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
nt.links.new(attr.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
nt.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
me.materials.append(tm)

obstacles = []
places = {}


def link(o, name=None):
    if name:
        o.name = name
    if o.name not in col.objects:
        col.objects.link(o)
    return o


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def add_obj(op, loc, scale=(1, 1, 1), rot=(0, 0, 0), m=None, name=None, sm=True, **kw):
    op(location=loc, **kw)
    o = bpy.context.object
    o.scale = scale
    o.rotation_euler = rot
    if m:
        o.data.materials.append(m)
    if sm:
        smooth(o)
    if name:
        o.name = name
    return o


def group(name, objs, loc):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    e.location = loc
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = e; o.matrix_world = mw
    return e


# ---------- 재질 ----------
TRUNK = mat('Trunk', lin(0x5a463f), 1.0)
LEAVES = [mat('LeafGold', lin(0xe0b04a), 0.85), mat('LeafLavender', lin(0xb7a3f0), 0.85),
          mat('LeafMint', lin(0x9cc7a4), 0.85), mat('LeafPink', lin(0xf3c1d6), 0.85)]
PINE = mat('Pine', lin(0x6f8fa6), 0.9)
ROCK = mat('Rock', lin(0x9890ad), 0.95)
WHITEP = mat('LighthouseWhite', lin(0xf4efff), 0.8)
BANDP = mat('LighthouseBand', lin(0xe58aa6), 0.8)
CAPP = mat('LighthouseCap', lin(0x6e63a8), 0.7)
LAMP = mat('Lamp', lin(0xfff1c0), 0.4, emit=6.0)
WOOD = mat('Wood', lin(0xa98266), 0.85)
WOOD2 = mat('WoodDark', lin(0x7a5c48), 0.9)
POST = mat('PostRed', lin(0xe76f7d), 0.6)
POSTD = mat('PostDark', lin(0x3d3550), 0.7)
GOLD = mat('Gold', lin(0xffcf5a), 0.35, emit=0.6, metal=0.3)
PAPER = mat('Paper', lin(0xfffaf0), 0.8)
STONE = mat('Stone', lin(0xd9d2e6), 0.9)

# ---------- 나무·덤불·바위·꽃 자리 (모델은 사이트에서 Quaternius CC0 모델로 놓음) ----------
props = []
spawn = (0.0, 7.0)
CAMP = (-5.0, 1.0)          # 모닥불 자리 (시작 지점 옆, 길 바깥)
placed = []
TREE_KINDS = ['tree_autumn1', 'tree_autumn1', 'tree_autumn2', 'tree_autumn3', 'tree_green', 'tree_willow', 'tree_pine', 'tree_birch']
tries = 0
while len(placed) < 30 and tries < 5000:
    tries += 1
    x, z = rng.uniform(-30, 30), rng.uniform(-32, 30)
    if height(x, z) < 0.9 or path_dist(x, z) < 3.2 or math.hypot(x - spawn[0], z - spawn[1]) < 6:
        continue
    if any(math.hypot(px - x, pz - z) < 4.5 for px, pz in placed):
        continue
    if math.hypot(x - 3.5, z - 3) < 4 or math.hypot(x - CAMP[0], z - CAMP[1]) < 5:
        continue
    placed.append((x, z))
    s_ = rng.uniform(1.3, 1.8)
    props.append({'k': rng.choice(TREE_KINDS), 'x': round(x, 2), 'z': round(z, 2), 's': round(s_, 2), 'r': round(rng.uniform(0, 6.28), 2)})
    obstacles.append([round(x, 2), round(z, 2), round(0.45 * s_, 2)])
# 덤불·꽃·바위
for k, (kind, n, lo, hi, rad) in enumerate([('bush', 22, 0.9, 99, 0.6), ('bush_berry', 10, 0.9, 99, 0.6), ('flowers', 40, 0.7, 99, 0), ('rock', 16, 0.05, 1.4, 0.4)]):
    c = 0
    for _ in range(3000):
        if c >= n:
            break
        x, z = rng.uniform(-34, 34), rng.uniform(-35, 33)
        h = height(x, z)
        if not (lo < h < hi) or path_dist(x, z) < 1.8 or math.hypot(x - spawn[0], z - spawn[1]) < 2.5:
            continue
        if math.hypot(x - CAMP[0], z - CAMP[1]) < 3.2 or math.hypot(x - 3.5, z - 3) < 1.5:
            continue
        if any(math.hypot(ox - x, oz - z) < orr + 0.6 for ox, oz, orr in obstacles):
            continue
        s_ = rng.uniform(0.8, 1.3) if kind != 'flowers' else rng.uniform(0.9, 1.4)
        props.append({'k': kind, 'x': round(x, 2), 'z': round(z, 2), 's': round(s_, 2), 'r': round(rng.uniform(0, 6.28), 2)})
        if rad:
            obstacles.append([round(x, 2), round(z, 2), round(rad * s_, 2)])
        c += 1
# 모닥불과 둘러앉는 통나무
props.append({'k': 'campfire', 'x': CAMP[0], 'z': CAMP[1], 's': 0.6, 'r': 0})
obstacles.append([CAMP[0], CAMP[1], 0.9])
for i in range(3):
    a = i / 3 * math.pi * 2 + 0.4
    lx_, lz_ = CAMP[0] + math.sin(a) * 2.0, CAMP[1] + math.cos(a) * 2.0
    props.append({'k': 'log', 'x': round(lx_, 2), 'z': round(lz_, 2), 's': 0.8, 'r': round(-a, 2)})
    obstacles.append([round(lx_, 2), round(lz_, 2), 0.45])
places['campfire'] = list(CAMP)

# ---------- 등대 (산책길 끝) ----------
lx, lz = 17.0, -32.0
lh = height(lx, lz)
parts = [
    add_obj(bpy.ops.mesh.primitive_cone_add, B(lx, lh + 2.5, lz), (1, 1, 1), m=WHITEP, vertices=20, radius1=0.9, radius2=0.58, depth=5.0),
    add_obj(bpy.ops.mesh.primitive_cylinder_add, B(lx, lh + 3.2, lz), (0.72, 0.72, 0.3), m=BANDP, vertices=20),
    add_obj(bpy.ops.mesh.primitive_cylinder_add, B(lx, lh + 5.15, lz), (0.75, 0.75, 0.08), m=CAPP, vertices=20),
    add_obj(bpy.ops.mesh.primitive_uv_sphere_add, B(lx, lh + 5.55, lz), (0.42, 0.42, 0.42), m=LAMP, segments=20, ring_count=12, name='LighthouseLamp'),
    add_obj(bpy.ops.mesh.primitive_cone_add, B(lx, lh + 6.3, lz), (1, 1, 1), m=CAPP, vertices=20, radius1=0.85, radius2=0.0, depth=1.0),
]
group('Lighthouse', parts, B(lx, lh, lz))
obstacles.append([lx, lz, 1.1])
places['lighthouse'] = [lx, lz]

# ---------- 우체통 (고민을 넣는 곳, 시작 지점 근처) ----------
mx, mz = 3.5, 3.0
mh = height(mx, mz)
parts = [
    add_obj(bpy.ops.mesh.primitive_cylinder_add, B(mx, mh + 0.35, mz), (0.07, 0.07, 0.35), m=POSTD, vertices=10),
    add_obj(bpy.ops.mesh.primitive_cube_add, B(mx, mh + 0.95, mz), (0.32, 0.26, 0.3), m=POST, size=1),
    add_obj(bpy.ops.mesh.primitive_cylinder_add, B(mx, mh + 1.25, mz), (0.16, 0.16, 0.26), rot=(0, math.radians(90), 0), m=POST, vertices=24),
    add_obj(bpy.ops.mesh.primitive_cube_add, B(mx, mh + 1.07, mz + 0.135), (0.18, 0.012, 0.03), m=POSTD, size=1),
]
bev = parts[1].modifiers.new('b', 'BEVEL'); bev.width = 0.05; bev.segments = 4
# 우체통 위의 별
pts = []
for i in range(10):
    a = math.pi / 2 + i * math.pi / 5
    rr = 0.16 if i % 2 == 0 else 0.07
    pts.append((math.cos(a) * rr, math.sin(a) * rr))
smesh = bpy.data.meshes.new('MailboxStar')
bm = bmesh.new()
top = [bm.verts.new((px, 0.03, py)) for px, py in pts]
bot = [bm.verts.new((px, -0.03, py)) for px, py in pts]
bm.faces.new(top); bm.faces.new(list(reversed(bot)))
for i in range(10):
    jx = (i + 1) % 10
    bm.faces.new([top[i], top[jx], bot[jx], bot[i]])
bm.to_mesh(smesh); bm.free()
so = bpy.data.objects.new('MailboxStar', smesh); col.objects.link(so)
so.location = B(mx, mh + 1.62, mz); smesh.materials.append(GOLD)
parts.append(so)
group('Mailbox', parts, B(mx, mh, mz))
obstacles.append([mx, mz, 0.38])
places['mailbox'] = [mx, mz]

# ---------- 길가 등불 ----------
lamp_spots = [(2.8, -1), (-1.2, -9), (-0.6, -17.5), (4.5, -24.5), (11, -29.5), (-6, -4.4), (-14, -9.2)]
for (x, z) in lamp_spots:
    h = height(x, z)
    parts = [
        add_obj(bpy.ops.mesh.primitive_cylinder_add, B(x, h + 0.55, z), (0.05, 0.05, 0.55), m=WOOD2, vertices=8),
        add_obj(bpy.ops.mesh.primitive_uv_sphere_add, B(x, h + 1.2, z), (0.14, 0.14, 0.17), m=LAMP, segments=16, ring_count=10, name='LanternGlow'),
        add_obj(bpy.ops.mesh.primitive_cone_add, B(x, h + 1.42, z), (1, 1, 1), m=WOOD2, vertices=8, radius1=0.2, radius2=0.03, depth=0.15),
    ]
    group('Lantern', parts, B(x, h, z))
    obstacles.append([x, z, 0.25])

# ---------- 벤치 (등대 앞, 바다를 바라봄) ----------
bx, bz = 13.0, -29.0
bh = height(bx, bz)
parts = [add_obj(bpy.ops.mesh.primitive_cube_add, B(bx, bh + 0.45, bz), (0.75, 0.22, 0.04), m=WOOD, size=2),
         add_obj(bpy.ops.mesh.primitive_cube_add, B(bx, bh + 0.75, bz - 0.2), (0.75, 0.03, 0.18), m=WOOD, size=2)]
for sx in (-0.6, 0.6):
    parts.append(add_obj(bpy.ops.mesh.primitive_cube_add, B(bx + sx, bh + 0.22, bz), (0.05, 0.2, 0.22), m=WOOD2, size=2))
bench = group('Bench', parts, B(bx, bh, bz))
bench.rotation_euler = (0, 0, math.radians(30))
obstacles.append([bx, bz, 0.8])
places['bench'] = [bx, bz]

# ---------- 부두 (종이배를 띄우는 곳) ----------
end = PIER_PATH[-1]
d = (end[0] - PIER_PATH[-2][0], end[1] - PIER_PATH[-2][1])
L = math.hypot(*d); d = (d[0] / L, d[1] / L)
# 길 끝에서 바다 쪽으로 물가를 찾음
sx_, sz_ = end
for _ in range(60):
    if height(sx_, sz_) < 0.2:
        break
    sx_ += d[0] * 0.4; sz_ += d[1] * 0.4
parts = []
ang = math.atan2(d[0], d[1])
for k in range(14):
    px, pz = sx_ - d[0] * 1.5 + d[0] * k * 0.55, sz_ - d[1] * 1.5 + d[1] * k * 0.55
    parts.append(add_obj(bpy.ops.mesh.primitive_cube_add, B(px, 0.55, pz), (0.85, 0.24, 0.035), rot=(0, 0, -ang), m=WOOD if k % 2 else WOOD2, size=2, sm=False))
for k in range(0, 14, 3):
    for side in (-1, 1):
        px = sx_ - d[0] * 1.5 + d[0] * k * 0.55 + d[1] * side * 0.8
        pz = sz_ - d[1] * 1.5 + d[1] * k * 0.55 - d[0] * side * 0.8
        parts.append(add_obj(bpy.ops.mesh.primitive_cylinder_add, B(px, 0.2, pz), (0.07, 0.07, 0.65), m=WOOD2, vertices=8))
# 부두 끝의 종이배
tip = (sx_ - d[0] * 1.5 + d[0] * 13 * 0.55, sz_ - d[1] * 1.5 + d[1] * 13 * 0.55)
bm = bmesh.new()
pv = [(-0.25, 0, 0), (0.25, 0, 0), (0.12, 0.12, 0.08), (-0.12, 0.12, 0.08), (0.12, 0.12, -0.08), (-0.12, 0.12, -0.08), (0, 0.28, 0)]
vv = [bm.verts.new(p) for p in pv]
for f in [(0, 1, 2, 3), (1, 0, 5, 4), (3, 2, 6), (4, 5, 6), (0, 3, 5), (1, 4, 2)]:
    try:
        bm.faces.new([vv[i] for i in f])
    except ValueError:
        pass
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
boat = bpy.data.meshes.new('PaperBoat'); bm.to_mesh(boat); bm.free()
bo = bpy.data.objects.new('PaperBoat', boat); col.objects.link(bo)
bo.location = B(tip[0] + d[0] * 0.9, 0.02, tip[1] + d[1] * 0.9); bo.scale = (1.4, 1.4, 1.4)
bo.rotation_euler = (0, 0, -ang + math.pi / 2)
boat.materials.append(PAPER)
parts.append(bo)
group('Pier', parts, B(sx_, 0, sz_))
places['pier'] = [round(tip[0], 2), round(tip[1], 2)]
PIER_WALK = [[round(sx_ - d[0] * 1.5 + d[0] * k * 0.55, 2), round(sz_ - d[1] * 1.5 + d[1] * k * 0.55, 2)] for k in range(14)]

# ---------- 작은 섬과 의자 ----------
ix, iz = -31.0, 6.0
ih = height(ix, iz)
parts = [add_obj(bpy.ops.mesh.primitive_cube_add, B(ix, ih + 0.45, iz), (0.24, 0.22, 0.03), m=WOOD, size=2),
         add_obj(bpy.ops.mesh.primitive_cube_add, B(ix, ih + 0.85, iz - 0.2), (0.24, 0.02, 0.22), m=WOOD, size=2)]
for sx in (-0.2, 0.2):
    for sz in (-0.18, 0.18):
        parts.append(add_obj(bpy.ops.mesh.primitive_cylinder_add, B(ix + sx, ih + 0.22, iz + sz), (0.025, 0.025, 0.22), m=WOOD2, vertices=8))
group('WishChair', parts, B(ix, ih, iz))
places['chair'] = [ix, iz]

# ---------- 내보내기 ----------
os.makedirs(os.path.join(REPO, 'assets', 'models'), exist_ok=True)
glb = os.path.join(REPO, 'assets', 'models', 'island.glb')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True)
data = {
    'size': SIZE, 'res': RES, 'origin': [-SIZE / 2, -SIZE / 2], 'heights': H,
    'obstacles': obstacles, 'spawn': list(spawn), 'places': places, 'pierWalk': PIER_WALK, 'props': props,
    'paths': {'main': MAIN_PATH, 'pier': PIER_PATH},
}
with open(os.path.join(REPO, 'assets', 'models', 'island-map.json'), 'w') as f:
    json.dump(data, f, separators=(',', ':'))
print('exported', os.path.getsize(glb))

# ---------- 미리보기 렌더 ----------
if RENDER:
    water = add_obj(bpy.ops.mesh.primitive_plane_add, (0, 0, 0.0), (1, 1, 1), m=mat('Water', lin(0x31407e), 0.08, metal=0.2), size=400, sm=False)
    w = bpy.data.worlds.new('w'); sc.world = w
    w.use_nodes = True
    bgn = w.node_tree.nodes['Background']; bgn.inputs[0].default_value = (*lin(0x8f84c8), 1); bgn.inputs[1].default_value = 0.8
    sun = bpy.data.lights.new('moon', 'SUN'); sun.energy = 2.2; sun.color = (0.95, 0.92, 1.0); sun.angle = math.radians(3)
    so = bpy.data.objects.new('moon', sun); col.objects.link(so); so.rotation_euler = (math.radians(50), math.radians(-20), math.radians(35))
    cam = bpy.data.cameras.new('cam'); cam.lens = 30
    co = bpy.data.objects.new('cam', cam); col.objects.link(co); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = 1280; sc.render.resolution_y = 760
    outdir = os.path.join(REPO, 'blender', '_render'); os.makedirs(outdir, exist_ok=True)
    for name, loc, tgt in [('map_aerial', B(-2, 46, 52), B(0, 0, -6)), ('map_ground', B(0, 3.2, 14), B(2, 1.5, -14))]:
        co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(outdir, name + '.png')
        bpy.ops.render.render(write_still=True)
    print('rendered')
