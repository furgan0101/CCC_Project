import bpy
from mathutils import Vector

BLEND = r"C:\Users\furga\Documents\recaro r7.blend"
bpy.ops.wm.open_mainfile(filepath=BLEND)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print("OBJECTS:", [o.name for o in meshes])
for o in meshes:
    co = [o.matrix_world @ v.co for v in o.data.vertices]
    if not co:
        print("  %-16s EMPTY" % o.name); continue
    xs = [c.x for c in co]; ys = [c.y for c in co]; zs = [c.z for c in co]
    org = o.matrix_world.translation
    print("  %-16s verts=%6d  X[% .3f % .3f] Y[% .3f % .3f] Z[% .3f % .3f]  origin(% .3f % .3f % .3f)" % (
        o.name, len(o.data.vertices), min(xs), max(xs), min(ys), max(ys), min(zs), max(zs),
        org.x, org.y, org.z))
print("DONE")
