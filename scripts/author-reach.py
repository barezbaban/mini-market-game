"""Blender 4.5: blender -b -P scripts/author-reach.py -- public/animations/reach.glb assets/blender/reach.blend"""
from pathlib import Path
import sys
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 10
# A reusable additive shoulder rotation. Playback reverses for placing.
joint = bpy.data.objects.new('ReachHands', None)
scene.collection.objects.link(joint)
for frame, angle in [(0,0), (2,-.50), (4,-1.05), (5,-1.10), (8,-.30), (10,0)]:
    joint.rotation_euler.x = angle
    joint.keyframe_insert(data_path='rotation_euler', frame=frame)
glb, source = [Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:]]
scene.frame_set(0)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', export_animation_mode='SCENE',
                          export_frame_range=True, export_force_sampling=True)
