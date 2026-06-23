import bpy, sys, os, math
from mathutils import Vector

FBX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.fbx"
OUT = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\_caps"
os.makedirs(OUT, exist_ok=True)

# fresh scene
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print("MESHES:", [m.name for m in meshes])
obj = max(meshes, key=lambda m: len(m.data.vertices))
print("MAIN:", obj.name, "verts", len(obj.data.vertices))

# world-space bbox
co = [obj.matrix_world @ v.co for v in obj.data.vertices]
xs = [c.x for c in co]; ys = [c.y for c in co]; zs = [c.z for c in co]
bb = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
print("BBOX X %.3f %.3f  Y %.3f %.3f  Z %.3f %.3f" % bb)
center = Vector(((bb[0]+bb[1])/2, (bb[2]+bb[3])/2, (bb[4]+bb[5])/2))
dim = Vector((bb[1]-bb[0], bb[3]-bb[2], bb[5]-bb[4]))
print("DIM %.3f %.3f %.3f" % (dim.x, dim.y, dim.z))

# render setup: workbench, fast
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 600
scene.render.resolution_y = 600
scene.render.film_transparent = False
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_shadows = True

cam_data = bpy.data.cameras.new("Cam"); cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(dim) * 1.15
cam = bpy.data.objects.new("Cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam

R = max(dim) * 2
views = {
    "bl_top":   (Vector((0,0,1)),  Vector((0,1,0))),   # look down -Z (footprint X right, Y up-in-img)
    "bl_front": (Vector((0,-1,0)), Vector((0,0,1))),   # look toward +Y
    "bl_back":  (Vector((0,1,0)),  Vector((0,0,1))),   # look toward -Y
    "bl_right": (Vector((1,0,0)),  Vector((0,0,1))),   # look toward -X
}
def look_at(obj_cam, target, up):
    d = (obj_cam.location - target).normalized()
    # build rotation so -Z points to target
    import mathutils
    z = d
    x = up.cross(z).normalized()
    y = z.cross(x)
    m = mathutils.Matrix((x, y, z)).transposed().to_4x4()
    obj_cam.matrix_world = mathutils.Matrix.Translation(obj_cam.location) @ m

for name,(dirv,up) in views.items():
    cam.location = center + dirv.normalized() * R
    look_at(cam, center, up)
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)

print("DONE")
