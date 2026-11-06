"""Author the single skinned player and four looping actions in Blender 4.5.
blender -b --python-exit-code 1 -P scripts/author-player.py -- public/models/player.glb assets/blender/player.blend
Game axes: X right, Y up, Z forward. No textures, shadows or subdivision at runtime.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 24

def v(p): return Vector((p[0], -p[2], p[1]))
bones = {}
def bone(name, head, tail, parent=None): bones[name] = (Vector(head), Vector(tail), parent)
bone('PlayerRoot', (0, .29, 0), (0, .35, 0))
bone('PlayerSpine', (0, .29, 0), (0, .49, 0), 'PlayerRoot')
bone('PlayerHead', (0, .49, 0), (0, .67, 0), 'PlayerSpine')
for side, x in [('L', -.057), ('R', .057)]:
    bone('Thigh'+side, (x,.29,0), (x,.16,.008), 'PlayerRoot')
    bone('Shin'+side, (x,.16,.008), (x,.03,0), 'Thigh'+side)
    bone('Foot'+side, (x,.03,0), (x,.03,.09), 'Shin'+side)
    s = -1 if side == 'L' else 1
    bone('UpperArm'+side, (s*.113,.461,0), (s*.139,.349,.006), 'PlayerSpine')
    bone('Forearm'+side, (s*.139,.349,.006), (s*.139,.246,.025), 'UpperArm'+side)
    bone('Hand'+side, (s*.139,.246,.025), (s*.139,.217,.031), 'Forearm'+side)
arm = bpy.data.armatures.new('Market player skeleton')
rig = bpy.data.objects.new('PlayerRig', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bones.items():
    b = arm.edit_bones.new(name); b.head=v(head); b.tail=v(tail)
    if parent: b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
verts, faces, colors, weights = [], [], [], []
cream='f6e7cb'; green='218a69'; dark='284e48'; skin='e8b083'; shoe='e8dac2'

def loft(rings, color, weight, n=16):
    start=len(verts)
    for ri,(center,rx,rz) in enumerate(rings):
        for j in range(n):
            a=math.tau*j/n
            p=(center[0]+rx*math.cos(a),center[1],center[2]+rz*math.sin(a))
            verts.append(v(p));colors.append(color);weights.append(weight(p) if callable(weight) else {weight:1})
    for ri in range(len(rings)-1):
        for j in range(n):
            a=start+ri*n+j;b=start+ri*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces.extend([tuple(start+j for j in reversed(range(n))),tuple(start+(len(rings)-1)*n+j for j in range(n))])

def ellipsoid(center,radii,color,weight,n=16,rows=10):
    rings=[]
    for i in range(rows+1):
        a=-math.pi/2+math.pi*i/rows
        rings.append(((center[0],center[1]+math.sin(a)*radii[1],center[2]),max(.001,math.cos(a))*radii[0],max(.001,math.cos(a))*radii[2]))
    loft(rings,color,weight,n)

def blend(a,b,h,width):
    def w(p):
        f=max(0,min(1,(h+width/2-p[1])/width))
        return {a:1-f,b:f}
    return w
# A shaped shirt, fitted apron and curved pocket rather than a stack of boxes.
loft([((0,y,0),rx,rz) for y,rx,rz in [(.267,.073,.049),(.29,.086,.057),(.33,.09,.061),(.40,.096,.061),(.45,.111,.055),(.477,.082,.045),(.486,.046,.034)]],cream,'PlayerSpine')
ellipsoid((0,.279,0),(.102,.048,.075),dark,'PlayerRoot')
loft([((0,y,z),rx,rz) for y,z,rx,rz in [(.278,.044,.071,.019),(.29,.053,.077,.020),(.35,.058,.075,.018),(.415,.055,.064,.015),(.442,.053,.051,.012)]],green,'PlayerSpine')
ellipsoid((0,.335,.077),(.043,.028,.008),'b8d6af','PlayerSpine')
for s in [-1,1]:
    ellipsoid((s*.047,.449,.048),(.011,.038,.009),green,'PlayerSpine',12,6)
    ellipsoid((s*.047,.418,.068),(.006,.006,.004),'eec369','PlayerSpine',8,6)
ellipsoid((0,.492,0),(.029,.036,.029),skin,'PlayerHead')
ellipsoid((0,.568,.005),(.074,.086,.068),skin,'PlayerHead',24,16)
for s in [-1,1]:
    ellipsoid((s*.074,.566,0),(.013,.021,.016),skin,'PlayerHead',12,8)
    ellipsoid((s*.025,.577,.069),(.007,.009,.004),'303d36','PlayerHead',10,8)
    ellipsoid((s*.027,.597,.065),(.013,.003,.004),'674b39','PlayerHead',10,6)
    ellipsoid((s*.041,.548,.059),(.015,.008,.003),'d99374','PlayerHead',12,6)
ellipsoid((0,.561,.075),(.011,.012,.012),skin,'PlayerHead',12,8)
for i in range(7):
    x=(i-3)*.0045
    ellipsoid((x,.535+(x/.014)**2*.004,.068),(.0035,.0018,.0025),'9f6653','PlayerHead',8,4)
# Hair at the nape, soft cap, rounded brim and an embroidered seed badge.
ellipsoid((0,.598,-.034),(.073,.051,.044),'654c39','PlayerHead')
ellipsoid((0,.636,-.006),(.079,.036,.074),green,'PlayerHead',24,10)
ellipsoid((0,.628,.056),(.076,.009,.054),'247859','PlayerHead',24,6)
ellipsoid((0,.651,.057),(.011,.012,.003),'efd19b','PlayerHead',10,6)
for side,s in [('L',-1),('R',1)]:
    x=s*.057
    # Blend the upper trouser into the pelvis too: no open hip seam during a stride.
    def leg_weights(p):
        if p[1] > .24:
            f=max(0,min(1,(p[1]-.24)/.065))
            return {'PlayerRoot':f,'Thigh'+side:1-f}
        return blend('Thigh'+side,'Shin'+side,.16,.065)(p)
    # Shared rings around each joint have blended skin weights, so elbows/knees deform.
    loft([((x,y,z),rx,rz) for y,z,rx,rz in [(.035,0,.025,.026),(.06,0,.029,.029),(.11,.005,.03,.032),(.15,.008,.033,.035),(.17,.007,.034,.035),(.20,.004,.037,.037),(.25,0,.041,.043),(.275,0,.038,.041),(.29,0,.030,.034),(.31,0,.009,.010)]],dark,leg_weights)
    ellipsoid((x,.032,.025),(.037,.03,.069),shoe,'Foot'+side,16,10)
    ellipsoid((x,.043,.028),(.026,.018,.043),'93ae98','Foot'+side,12,8)
    loft([((s*x0,y,z),rx,rz) for x0,y,z,rx,rz in [(.139,.246,.025,.023,.023),(.14,.28,.019,.027,.027),(.14,.324,.01,.028,.029),(.139,.349,.006,.03,.03),(.131,.395,.002,.032,.033),(.113,.455,0,.034,.036)]],skin,blend('UpperArm'+side,'Forearm'+side,.349,.06))
    loft([((s*x0,y,0),r,r) for x0,y,r in [(.131,.395,.035),(.128,.408,.039),(.117,.443,.042),(.111,.467,.037),(.109,.480,.024),(.109,.486,.002)]],cream,'UpperArm'+side)
    ellipsoid((s*.139,.231,.03),(.026,.032,.023),skin,'Hand'+side,16,10)
    ellipsoid((s*.118,.239,.037),(.011,.019,.014),skin,'Hand'+side,10,6)
mesh=bpy.data.meshes.new('Player rounded skin')
mesh.from_pydata(verts,[],faces);mesh.update()
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
paint=mesh.color_attributes.new(name='Paint',type='BYTE_COLOR',domain='POINT')
for entry,c in zip(paint.data,colors):entry.color_srgb=tuple(int(c[i:i+2],16)/255 for i in (0,2,4))+(1,)
for p in mesh.polygons:p.use_smooth=True
material=bpy.data.materials.new('Player cloth');material.use_nodes=True
nodes=material.node_tree.nodes;vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Paint'
bsdf=nodes.get('Principled BSDF');material.node_tree.links.new(vc.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.88
mesh.materials.append(material)
obj=bpy.data.objects.new('PlayerSkin',mesh);scene.collection.objects.link(obj);obj.parent=rig
for name in bones:obj.vertex_groups.new(name=name)
for i,ws in enumerate(weights):
    for name,w in ws.items():
        if w>0:obj.vertex_groups[name].add([i],w,'REPLACE')
mod=obj.modifiers.new('Soft joints','ARMATURE');mod.object=rig

# Two-bone IK baked to portable joint transforms, no runtime Blender constraints.
def knee(a,c,l1,l2,pole):
    d=c-a;dist=d.length;direction=d.normalized()
    along=(l1*l1-l2*l2+dist*dist)/(2*dist)
    height=math.sqrt(max(0,l1*l1-along*along))
    bend=Vector(pole);bend=(bend-direction*bend.dot(direction)).normalized()
    return a+direction*along+bend*height

def pose(name,head,tail):
    rest_h,rest_t,_=bones[name]
    rot=v(rest_t-rest_h).rotation_difference(v(tail-head)) @ arm.bones[name].matrix_local.to_quaternion()
    rig.pose.bones[name].matrix=Matrix.LocRotScale(v(head),rot,Vector((1,1,1)))
    bpy.context.view_layer.update()

def animate(phase,walking,carrying):
    pulse=math.sin(phase*math.tau)
    bob=(.003*math.cos(phase*math.tau*2) if walking else .0015*pulse)
    drop=-.030 if walking else 0
    root=Vector((0,.29+drop+bob,0)); spine=root+Vector((0,.20,.009 if walking else 0))
    pose('PlayerRoot',root,root+Vector((0,.06,0)))
    pose('PlayerSpine',root,spine)
    pose('PlayerHead',spine,spine+Vector((0,.18,-.004 if walking else 0)))
    for side,s in [('L',-1),('R',1)]:
        p=(phase+(0 if s<0 else .5))%1
        if walking:
            z=.12-.24*p/.5 if p<.5 else -.12+.24*(.5-.5*math.cos(math.pi*(p-.5)/.5))
            lift=0 if p<.5 else .058*math.sin(math.pi*(p-.5)/.5)
        else:z=lift=0
        hip=root+Vector((s*.057,0,0));foot=Vector((s*.057,.03+lift,z))
        mid=knee(hip,foot,.13025,.13025,(0,0,1))
        pose('Thigh'+side,hip,mid);pose('Shin'+side,mid,foot)
        pose('Foot'+side,foot,foot+Vector((0,0,.09)))
        shoulder=root+Vector((s*.113,.171,spine.z))
        if carrying:hand=root+Vector((s*.139,.050,.171))
        else:hand=root+Vector((s*.145,-.044,.025+(s*pulse*.055 if walking else 0)))
        elbow=knee(shoulder,hand,.11514,.10474,(s*.6,-.2,-1))
        pose('UpperArm'+side,shoulder,elbow);pose('Forearm'+side,elbow,hand)
        pose('Hand'+side,hand,hand+Vector((0,-.012,.026)) if carrying else hand+Vector((0,-.029,.006)))
    for pb in rig.pose.bones:
        pb.keyframe_insert('location');pb.keyframe_insert('rotation_quaternion');pb.keyframe_insert('scale')

rig.animation_data_create()
for name,walking,carrying in [('Idle',False,False),('Walk',True,False),('CarryIdle',False,True),('CarryWalk',True,True)]:
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame in range(25):
        scene.frame_set(frame);animate(frame/24,walking,carrying)
    track=rig.animation_data.nla_tracks.new();track.name=name
    track.strips.new(name,0,action)
    rig.animation_data.action=None
# Separate NLA track names are exported as the four runtime clips.
scene.frame_set(0)
for track in rig.animation_data.nla_tracks:track.mute=True
# Keep a neutral preview pose in the editable file.
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
glb,source=[Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:]]
for p in [glb,source]:p.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=False
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=True,export_skins=True)
print('PLAYER',len(verts),'vertices',len(bones),'bones',glb.stat().st_size,'bytes')
