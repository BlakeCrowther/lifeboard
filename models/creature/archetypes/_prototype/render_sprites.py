import bpy, math, os
OUT_DIR = os.environ.get("PROTO_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "out", "prototype"))  # models/out is gitignored
D = bpy.data; sc = bpy.context.scene
out = OUT_DIR + "/sprites"; os.makedirs(out, exist_ok=True)
body = D.objects["Clownfish"]
body.location = (0, 0, 0); body.rotation_euler = (0, 0, 0)
cam = D.objects["Camera"]; cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.6
cam.location = (0, -6, 0); cam.rotation_euler = (math.radians(90), 0, 0)
L = D.objects["Light"]; L.location = (0.5, -2.5, 3.5); L.rotation_euler = (math.radians(35), 0, math.radians(10))
sc.render.film_transparent = True
sc.render.resolution_x = 256; sc.render.resolution_y = 256; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
try: sc.eevee.taa_render_samples = 32
except Exception: pass
H = 16; frames = list(range(1, 25, 2))  # 12 frames of the 24-frame loop
for h in range(H):
    # h=0: fish faces left (nose -X) seen from side; rotates toward/away from camera
    body.rotation_euler = (0, 0, -2 * math.pi * h / H)
    for i, f in enumerate(frames):
        sc.frame_set(f)
        sc.render.filepath = f"{out}/h{h:02d}_f{i:02d}.png"
        bpy.ops.render.render(write_still=True)
print("SPRITES DONE")
