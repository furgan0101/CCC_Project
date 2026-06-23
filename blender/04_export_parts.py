import bpy, os

BLEND = r"C:\Users\furga\Documents\recaro r7.blend"
TEX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.png"
NRM = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture_normal.png"
GLB = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\seat_parts.glb"

bpy.ops.wm.open_mainfile(filepath=BLEND)
if bpy.context.view_layer.objects.active and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')

PARTS = ["Mesh_0", "armrest", "legrest", "lowerrest", "backrest", "backrest2", "backrest3", "headrest", "compartment"]

# one shared textured material (parts keep the original UVs from Mesh_0)
img = bpy.data.images.load(TEX)
mat = bpy.data.materials.new("SilkSky"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes.get('Principled BSDF')
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.location=(-400,300)
nt.links.new(bsdf.inputs['Base Color'], tn.outputs['Color'])
try:
    nimg = bpy.data.images.load(NRM); nimg.colorspace_settings.name='Non-Color'
    ntex = nt.nodes.new('ShaderNodeTexImage'); ntex.image=nimg; ntex.location=(-400,-100)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.location=(-150,-100)
    nt.links.new(nmap.inputs['Color'], ntex.outputs['Color'])
    nt.links.new(bsdf.inputs['Normal'], nmap.outputs['Normal'])
except Exception as e:
    print("normal skipped", e)

for o in bpy.context.scene.objects:
    o.select_set(False)
total=0
for name in PARTS:
    o = bpy.data.objects.get(name)
    if not o:
        print("MISSING", name); continue
    # some parts are hidden in the user's viewport — unhide so the exporter keeps them
    o.hide_set(False); o.hide_viewport = False; o.hide_render = False
    o.data.materials.clear(); o.data.materials.append(mat)
    # decimate the big static body to keep the GLB light; leave moving parts crisp
    if name == "Mesh_0":
        d = o.modifiers.new("dec",'DECIMATE'); d.ratio=0.45
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=d.name); o.select_set(False)
    o.select_set(True); total += len(o.data.vertices)
    print("export", name, len(o.data.vertices))

print("total verts", total)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True, export_texcoords=True, export_normals=True)
print("EXPORTED", GLB)
print("DONE")
