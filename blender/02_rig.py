import bpy, os, math, json
from mathutils import Vector, Matrix

FBX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.fbx"
OUT = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\_caps"
GLB = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\seat_rigged.glb"
os.makedirs(OUT, exist_ok=True)

# ---- TUNABLE REGION PARAMS (Blender coords: X width, Y depth(-Y=front), Z up) ----
P = dict(
    SX0=0.06, SX1=0.58,     # seat cushion X band (exclude table x<0, wall x>0.8, armrests)
    H_Z=-0.28, H_Y=0.22,    # recline hinge: crease where backrest meets pan
    HEAD_Z=0.52,            # headrest starts above this Z
    F_Y=-0.30, F_Z=-0.42,   # legrest hinge (front edge of pan)
    LEG_Y0=-0.90,           # legrest extends to this Y (front)
    LEG_Z1=-0.10,           # legrest upper Z limit
    BAND=0.10,              # falloff band width
)

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t*t*(3-2*t)

# Backrest leans back as it rises (Y grows with Z); the wall is a vertical
# column behind it at Y~0.80. This slanted cutoff follows the backrest and
# stops short of the wall so the wall never gets skinned to the seat.
def backrest_cut(z):
    return min(0.78, 0.36 + 0.46*(z + 0.17))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
obj = max([o for o in bpy.context.scene.objects if o.type=='MESH'], key=lambda m: len(m.data.vertices))
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# decimate: 510k verts / ~1M tris is heavy for a web kiosk. Collapse to ~40%
# (~200k tris) — plenty smooth for a seat, and the positional skin weights below
# are recomputed on the decimated mesh so they still line up.
dec = obj.modifiers.new("dec", 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = 0.40
bpy.ops.object.modifier_apply(modifier=dec.name)
me = obj.data
print("verts", len(me.vertices), "polys", len(me.polygons))

def weights(co):
    x,y,z = co.x, co.y, co.z
    inX = P['SX0'] <= x <= P['SX1']
    # legrest: front + low, within seat width (slightly wider than cushion ok)
    wl = 0.0
    if 0.0 <= x <= 0.62 and y < P['F_Y'] and z < P['LEG_Z1'] and y > P['LEG_Y0']-0.25:
        wl = smooth((P['F_Y']-y)/P['BAND'])
    # backrest + headrest: central band, above hinge, in front of the slanted
    # backrest/wall cutoff so the (leaning) backrest+headrest fold but the wall stays.
    wb = wh = 0.0
    if inX and z > P['H_Z']-P['BAND'] and y < backrest_cut(z):
        up = smooth((z-P['H_Z'])/P['BAND'])      # 0 at/below hinge -> 1 above
        if z >= P['HEAD_Z']:
            wh = up
        else:
            head_ramp = smooth((z-(P['HEAD_Z']-P['BAND']))/P['BAND'])
            wh = up*head_ramp
            wb = up*(1-head_ramp)
    # don't let leg & back overlap
    if wb>0 or wh>0:
        wl = 0.0
    s = wb+wh+wl
    if s>1.0:
        wb/=s; wh/=s; wl/=s; s=1.0
    return wb, wh, wl, max(0.0,1.0-s)

# ---- Armature ----
amt = bpy.data.armatures.new("rig"); arm = bpy.data.objects.new("rig", amt)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
cx = (P['SX0']+P['SX1'])/2
def mkbone(name, head, tail, parent=None):
    b = amt.edit_bones.new(name); b.head = head; b.tail = tail
    if parent: b.parent = parent;
    return b
broot = mkbone("root", (cx,0,-0.6), (cx,0,-0.3))
bback = mkbone("back", (cx,P['H_Y'],P['H_Z']), (cx,P['H_Y']+0.05,P['H_Z']+0.4), broot)
bhead = mkbone("head", (cx,0.46,P['HEAD_Z']), (cx,0.50,P['HEAD_Z']+0.32), bback)
bleg  = mkbone("leg",  (cx,P['F_Y'],P['F_Z']), (cx,P['F_Y']-0.4,P['F_Z']), broot)
bpy.ops.object.mode_set(mode='OBJECT')

for g in ("root","back","head","leg"):
    obj.vertex_groups.new(name=g)
groups = {g: obj.vertex_groups[g] for g in ("root","back","head","leg")}
for v in me.vertices:
    wb,wh,wl,wr = weights(v.co)
    if wr>0: groups["root"].add([v.index], wr, 'REPLACE')
    if wb>0: groups["back"].add([v.index], wb, 'REPLACE')
    if wh>0: groups["head"].add([v.index], wh, 'REPLACE')
    if wl>0: groups["leg"].add([v.index],  wl, 'REPLACE')

mod = obj.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
obj.parent = arm

# report counts
import collections
cnt = collections.Counter()
for v in me.vertices:
    wb,wh,wl,wr = weights(v.co)
    if wb>0.3: cnt['back']+=1
    if wh>0.3: cnt['head']+=1
    if wl>0.3: cnt['leg']+=1
print("WEIGHTED back=%d head=%d leg=%d"%(cnt['back'],cnt['head'],cnt['leg']))

# ---- material (texture) so renders read well ----
img = bpy.data.images.load(r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.png")
m = bpy.data.materials.new("seat"); m.use_nodes = True
bsdf = m.node_tree.nodes['Principled BSDF']
tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
m.node_tree.links.new(bsdf.inputs['Base Color'], tn.outputs['Color'])
me.materials.clear(); me.materials.append(m)

# ---- render helper ----
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'; scene.display.shading.color_type='TEXTURE'
scene.display.shading.show_shadows=True
scene.render.resolution_x=600; scene.render.resolution_y=600
co=[obj.matrix_world @ v.co for v in me.vertices]
center=Vector((sum(c.x for c in co)/len(co), sum(c.y for c in co)/len(co), sum(c.z for c in co)/len(co)))
dim=max(max(c.x for c in co)-min(c.x for c in co), max(c.z for c in co)-min(c.z for c in co))
camd=bpy.data.cameras.new("C"); camd.type='ORTHO'; camd.ortho_scale=1.7
cam=bpy.data.objects.new("C",camd); scene.collection.objects.link(cam); scene.camera=cam
seatc = Vector((0.30, -0.05, 0.0))   # focus the seat, not whole pod
def look(loc, tgt):
    import mathutils
    cam.location=loc; d=(Vector(loc)-Vector(tgt)).normalized()
    z=d; x=Vector((0,0,1)).cross(z).normalized(); yv=z.cross(x)
    cam.matrix_world=mathutils.Matrix.Translation(loc)@mathutils.Matrix((x,yv,z)).transposed().to_4x4()
# elevated, from the open (-Y) front, slightly right to clear the table
camloc = seatc + Vector((0.55,-2.2,0.95))
def render(tag):
    look(camloc, seatc); scene.render.filepath=os.path.join(OUT,"rig_"+tag+".png")
    bpy.ops.render.render(write_still=True); print("rendered",tag)

def pose(bone, axis, deg):
    pb = arm.pose.bones[bone]
    pb.rotation_mode='XYZ'
    import mathutils
    pb.rotation_euler = mathutils.Euler([math.radians(deg) if a==axis else 0 for a in 'xyz'],'XYZ')

# rest
render("rest")
# reclined: rotate back about world X (bone points up; local X ~ world X)
pose("back",'x', 35); render("recline")
pose("back",'x', 0)
# legrest up: rotate leg about world X
pose("leg",'x', -55); render("leg")
pose("leg",'x',0)
# headrest tilt
pose("head",'x', 12); render("head")
pose("head",'x',0)

# ---- export GLB (rest pose) ----
for pb in arm.pose.bones: pb.rotation_euler=(0,0,0)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB',
    use_selection=True, export_yup=True, export_skins=True,
    export_apply=False, export_texcoords=True, export_normals=True)
print("EXPORTED", GLB)
print("DONE")
