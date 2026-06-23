import bpy

FBX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.fbx"
TEX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.png"
NRM = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture_normal.png"
BLEND = r"C:\Users\furga\IdeaProjects\Furgans project\blender\silk_sky_suite.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
obj = max([o for o in bpy.context.scene.objects if o.type == 'MESH'], key=lambda m: len(m.data.vertices))

img = bpy.data.images.load(TEX)
mat = bpy.data.materials.new("SilkSky"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes.get('Principled BSDF')
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.location = (-400, 300)
nt.links.new(bsdf.inputs['Base Color'], tn.outputs['Color'])
try:
    nimg = bpy.data.images.load(NRM); nimg.colorspace_settings.name = 'Non-Color'
    ntex = nt.nodes.new('ShaderNodeTexImage'); ntex.image = nimg; ntex.location = (-400, -100)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.location = (-150, -100)
    nt.links.new(nmap.inputs['Color'], ntex.outputs['Color'])
    nt.links.new(bsdf.inputs['Normal'], nmap.outputs['Normal'])
except Exception as e:
    print("normal skipped", e)
obj.data.materials.clear(); obj.data.materials.append(mat)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("SAVED", BLEND, "verts", len(obj.data.vertices))
