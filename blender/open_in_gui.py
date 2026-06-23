import bpy, os

FBX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.fbx"
TEX = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture.png"
NRM = r"C:\Users\furga\IdeaProjects\Furgans project\webapp\assets\silk_sky\Meshy_AI_Silk_Sky_Suite_0621170228_texture_normal.png"

# start clean and import the model
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

obj = max([o for o in bpy.context.scene.objects if o.type == 'MESH'],
          key=lambda m: len(m.data.vertices))
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# textured material so it reads while you work
img = bpy.data.images.load(TEX)
mat = bpy.data.materials.new("SilkSky")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img; tn.location = (-400, 300)
nt.links.new(bsdf.inputs['Base Color'], tn.outputs['Color'])
try:
    nimg = bpy.data.images.load(NRM); nimg.colorspace_settings.name = 'Non-Color'
    ntex = nt.nodes.new('ShaderNodeTexImage'); ntex.image = nimg; ntex.location = (-400, -100)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.location = (-150, -100)
    nt.links.new(nmap.inputs['Color'], ntex.outputs['Color'])
    nt.links.new(bsdf.inputs['Normal'], nmap.outputs['Normal'])
except Exception as e:
    print("normal map skipped:", e)
obj.data.materials.clear(); obj.data.materials.append(mat)

# material-preview shading + frame the model
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces[0].shading.type = 'MATERIAL'
        for region in area.regions:
            if region.type == 'WINDOW':
                with bpy.context.temp_override(area=area, region=region):
                    bpy.ops.view3d.view_selected()

# save a working .blend next to the project so you don't lose progress
blend = r"C:\Users\furga\IdeaProjects\Furgans project\blender\silk_sky_suite.blend"
bpy.ops.wm.save_as_mainfile(filepath=blend)
print("OPENED + SAVED", blend)
