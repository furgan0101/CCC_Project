import bpy, os, math, sys
from mathutils import Vector

BLEND = r"C:\Users\furga\Documents\recaro r7.blend"
OUT = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\_caps"
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print("OBJECTS:", [o.name for o in meshes])
for o in meshes:
    co = [o.matrix_world @ v.co for v in o.data.vertices]
    if not co:
        print("  %-14s EMPTY" % o.name); continue
    xs=[c.x for c in co]; ys=[c.y for c in co]; zs=[c.z for c in co]
    org = o.matrix_world.translation
    print("  %-14s verts=%6d  X[% .3f % .3f] Y[% .3f % .3f] Z[% .3f % .3f]  origin(% .3f % .3f % .3f)" % (
        o.name, len(o.data.vertices), min(xs),max(xs), min(ys),max(ys), min(zs),max(zs),
        org.x,org.y,org.z))

# ---- render current (rest) state ----
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'; scene.display.shading.color_type='TEXTURE'
scene.display.shading.show_shadows=True
scene.render.resolution_x=700; scene.render.resolution_y=600
allco=[]
for o in meshes:
    allco += [o.matrix_world @ v.co for v in o.data.vertices]
cx=sum(c.x for c in allco)/len(allco); cy=sum(c.y for c in allco)/len(allco); cz=sum(c.z for c in allco)/len(allco)
center=Vector((0.30, -0.05, 0.0))
camd=bpy.data.cameras.new("C"); camd.type='ORTHO'; camd.ortho_scale=2.0
cam=bpy.data.objects.new("C",camd); scene.collection.objects.link(cam); scene.camera=cam
import mathutils
def look(loc,tgt):
    cam.location=loc; d=(Vector(loc)-Vector(tgt)).normalized()
    z=d; x=Vector((0,0,1)).cross(z).normalized(); yv=z.cross(x)
    cam.matrix_world=mathutils.Matrix.Translation(loc)@mathutils.Matrix((x,yv,z)).transposed().to_4x4()
look(center+Vector((0.6,-2.2,0.95)), center)
scene.render.filepath=os.path.join(OUT,"parts_rest.png")
bpy.ops.render.render(write_still=True)
print("RENDERED parts_rest")
print("DONE")
