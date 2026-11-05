"""Rebuild the shared motion-only GLB with Blender 4.5:
blender -b -noaudio --python-exit-code 1 -P scripts/author-cart-walk.py -- /path/to/cart-walk.glb

The six named joints bind to the existing shopper mesh in Three.js. +Z there
is forward; rotation around local X is unchanged by Blender's Y-up export.
The app advances this one-second timeline once per 0.36 world units traveled.
Run headlessly in a fresh Blender process; this script resets that process's scene.
"""
import math
import sys
from pathlib import Path

import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 24
for side, offset in [('L', 0), ('R', 0.5)]:
    joints = []
    for joint in ['Hip', 'Knee', 'Foot']:
        obj = bpy.data.objects.new('Cart' + joint + side, None)
        scene.collection.objects.link(obj)
        joints.append(obj)
    for frame in range(25):
        phase = (frame / 24 + offset) % 1
        # The planted foot travels back exactly as far as the cart advances.
        if phase <= 0.5:
            forward, lift = 0.09 - 0.36 * phase, 0.0
        else:
            u = (phase - 0.5) * 2
            forward = -0.09 + 0.18 * (u - math.sin(2 * math.pi * u) / math.pi)
            lift = 0.038 * math.sin(math.pi * u) ** 2
        down = 0.203 - lift
        knee = 2 * math.acos(min(1, math.hypot(down, forward) / 0.224))
        hip = -math.atan2(forward, down) - knee / 2
        for obj, angle in zip(joints, [hip, knee, -hip - knee]):
            obj.rotation_euler.x = angle
            obj.keyframe_insert(data_path='rotation_euler', frame=frame)
output = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB',
                          export_animation_mode='SCENE', export_frame_range=True,
                          export_force_sampling=True)
