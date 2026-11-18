import bpy, math
D = bpy.data
sc = bpy.context.scene
for n in ("Camera", "Light", "Cube"):
    if n in D.objects: D.objects.remove(D.objects[n], do_unlink=True)
body = D.objects["Clownfish"]
body.animation_data_clear()
body.modifiers.remove(body.modifiers["Swim"])
for o in D.objects: o.animation_data_clear()
body.location = (0, 0, 0); body.rotation_euler = (0, 0, 0)
# make real objects, apply subsurf
bpy.ops.object.select_all(action="DESELECT")
for o in list(D.objects):
    o.hide_set(False); o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.convert(target="MESH")
bpy.ops.object.join()
fish = bpy.context.active_object; fish.name = "Clownfish"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# UVs
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
bpy.ops.object.mode_set(mode="OBJECT")
# bake base color
img = D.images.new("ClownfishColor", 1024, 1024)
for m in fish.data.materials:
    nt = m.node_tree; n = nt.nodes.new("ShaderNodeTexImage"); n.image = img
    nt.nodes.active = n
sc.render.engine = "CYCLES"; sc.cycles.samples = 8; sc.cycles.device = "GPU"
bk = sc.render.bake; bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.margin = 8
bpy.ops.object.bake(type="DIFFUSE")
img.filepath_raw = "~/noggin/scratch/blender/clownfish_color.png"; img.file_format = "PNG"; img.save()
# replace materials with single textured PBR (glTF-friendly)
mat = D.materials.new("Clownfish"); mat.use_nodes = True
nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
nt.links.new(t.outputs[0], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.32
b.inputs["Coat Weight"].default_value = 0.4
fish.data.materials.clear(); fish.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath="~/noggin/scratch/blender/clownfish.glb",
    export_format="GLB", use_selection=False, export_animations=False, export_image_format="WEBP")
print("EXPORTED", len(fish.data.vertices), "verts")
