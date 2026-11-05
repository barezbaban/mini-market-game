"""Generate the editable KurdMart Blender library and its web GLB.
blender -b --python-exit-code 1 -P scripts/author-market.py -- path/to/market.glb path/to/market.blend
Dimensions below are in game coordinates: X right, Y up, Z forward.
One vertex-painted mesh per prop; no texture downloads or baked shadows.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh

bpy.ops.wm.read_factory_settings(use_empty=True)
green="298969"; deep="20654f"; mint="abe0ba"; cream="fff3d7"; wood="cf9868"
gold="f2c452"; ink="394844"; skin="edbd93"; red="de694e"; blue="83bbc8"
leaf="54965c"; white="f8f2dd"; metal="b5c4b6"; coffee="81523b"
paint=bpy.data.materials.new("Market ceramic")
paint.use_nodes=True
n=paint.node_tree.nodes.new("ShaderNodeVertexColor"); n.layer_name="Paint"
p=paint.node_tree.nodes.get("Principled BSDF")
paint.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
p.inputs['Roughness'].default_value=0.86
verts=[]; faces=[]; colors=[]; smooth=[]; count=0

def piece(points, polygons, color, soft=False):
    start=len(verts)
    verts.extend((x,-z,y) for x,y,z in points)
    colors.extend([color]*len(points))
    faces.extend(tuple(start+i for i in face) for face in polygons)
    smooth.extend([soft]*len(polygons))

def loft(x,y,z,layers,c,soft=False):
    # Each layer holds a height and a closed XZ contour.
    n=len(layers[0][1]); pts=[]; polys=[]
    for h,ring in layers:
        pts.extend((x+dx,y+h,z+dz) for dx,dz in ring)
    for row in range(len(layers)-1):
        for i in range(n):
            j=(i+1)%n; a=row*n
            polys.append((a+i,a+j,a+n+j,a+n+i))
    polys += [tuple(range(n)),tuple((len(layers)-1)*n+i for i in range(n))]
    piece(pts,polys,c,soft)

def box(x,y,z,w,h,d,c,bevel=.10):
    a,b=w/2,d/2; r=min(a,b,h/2)*bevel
    def ring(a,b):
        q=min(a,b)*bevel
        return [(-a+q,-b),(a-q,-b),(a,-b+q),(a,b-q),(a-q,b),(-a+q,b),(-a,b-q),(-a,-b+q)] if q else [(-a,-b),(a,-b),(a,b),(-a,b)]
    layers=[(-h/2,ring(a-r,b-r)),(-h/2+r,ring(a,b)),(h/2-r,ring(a,b)),(h/2,ring(a-r,b-r))] if r else [(-h/2,ring(a,b)),(h/2,ring(a,b))]
    loft(x,y,z,layers,c)

def circle(a,b,n,offset=0):
    return [(a*math.cos(i*math.tau/n+offset),b*math.sin(i*math.tau/n+offset)) for i in range(n)]
def disc(x,y,z,a,h,b,c,n=12,top=1):
    loft(x,y,z,[(-h/2,circle(a,b,n)),(h/2,circle(a*top,b*top,n))],c)
def ball(x,y,z,a,b,d,c,n=10):
    # Narrow end rings avoid degenerate pole triangles.
    layers=[(b*h,circle(a*r,d*r,n)) for h,r in [(-1,.09),(-.69,.71),(0,1),(.69,.71),(1,.09)]]
    loft(x,y,z,layers,c,True)
def finish(name):
    global count
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces); mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    color=mesh.color_attributes.new(name="Paint",type="BYTE_COLOR",domain="POINT")
    for entry,hexcolor in zip(color.data,colors):
        entry.color_srgb=tuple(int(hexcolor[i:i+2],16)/255 for i in (0,2,4))+(1,)
    for poly,shade in zip(mesh.polygons,smooth):poly.use_smooth=shade
    mesh.materials.append(paint)
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    ob.location=((count%8)*2.4,(count//8)*2.1,0);count+=1
    verts.clear();faces.clear();colors.clear();smooth.clear()

# Modular fixtures and articulated characters use these exact same meshes.
box(0,0,0,1,1,1,white,0);finish("kitBlock")
box(0,0,0,1,1,1,white,.15);finish("kitBevel")
ball(0,0,0,1,1,1,white);finish("kitBall")
disc(0,0,0,1,1,1,white,12);finish("kitDisc")
disc(0,0,0,1,1,1,white,8,.03);finish("kitCone")
loft(0,0,0,[(h,circle(r,r,10)) for h,r in [(-.5,.13),(-.46,.66),(-.34,1),(.34,1),(.46,.66),(.5,.13)]],white,True);finish("kitPill")

# Produce and packaging: distinguish stock by silhouette as well as colour.
ball(0,-.005,0,.091,.070,.085,red)
disc(0,.076,0,.009,.042,.009,deep,7)
for i in range(5):
    a=i*math.tau/5
    piece([(0,.077,0),(.024*math.cos(a-.55),.073,.024*math.sin(a-.55)),(.056*math.cos(a),.052,.056*math.sin(a)),(.024*math.cos(a+.55),.073,.024*math.sin(a+.55))],[(0,1,2,3)],leaf)
finish("tomato")
loft(0,0,0,[(h,circle(r,r*.94,12)) for h,r in [(-.09,.012),(-.067,.052),(-.024,.067),(.022,.062),(.069,.041),(.094,.011)]], "f7deab",True);finish("egg")
ball(0,.005,0,.048,.102,.049,gold)
for i in [-1,0,1]:
    for j in [-1,0,1]:box(i*.024,j*.041,.042,.018,.022,.007,"ffdd81")
for s in [-1,1]:loft(s*.037,-.012,0,[(-.086,circle(.012,.012,5)),(-.01,circle(.023,.035,5)),(.077,circle(.003,.003,5))],leaf)
finish("corn")
box(0,-.037,0,.22,.023,.16,cream);ball(0,0,0,.093,.048,.048,gold)
for x in [-.055,-.017,.022,.060]:box(x,.041,0,.012,.01,.045,coffee)
finish("grilledCorn")
ball(0,0,0,.063,.043,.089,coffee);ball(0,.037,.002,.006,.008,.067,"c39669",8);finish("coffee")
disc(0,-.021,0,.009,.18,.009,"ed903f",9,6)
for x in [-.026,0,.026]:ball(x,.093,0,.014,.057,.011,leaf,7)
finish("carrot")
disc(0,0,0,.072,.151,.072,red);disc(0,.076,0,.075,.012,.075,metal);disc(0,-.076,0,.075,.012,.075,metal)
box(0,0,.071,.079,.065,.009,cream);ball(0,0,.077,.022,.019,.004,red);finish("tomatoPaste")
box(0,0,0,.133,.167,.085,wood,.19);box(0,.088,0,.146,.021,.060,coffee)
box(0,0,.043,.088,.076,.006,cream);ball(0,0,.048,.016,.025,.005,coffee);finish("groundCoffee")
loft(0,0,0,[(h,circle(r,r,10)) for h,r in [(-.095,.052),(-.082,.060),(.046,.057),(.075,.034),(.087,.032)]],white)
disc(0,.091,0,.034,.022,.034,blue);disc(0,-.012,0,.061,.049,.061,blue);finish("milk")
loft(0,0,0,[(-.056,[(-.080,-.061),(.087,-.048),(-.053,.082)]),(.056,[(-.080,-.061),(.087,-.048),(-.053,.082)])],gold)
for x,z in [(-.041,-.024),(.014,-.021),(-.042,.035)]:disc(x,.056,z,.011,.002,.009,"e4a43e",8)
finish("cheese")

# Bakery and preserve stock. Each silhouette also reads at cart scale.
loft(0,0,0,[(h,circle(r,r,9)) for h,r in [(-.095,.012),(-.045,.060),(.026,.079),(.065,.056)]],"ca475b",True)
for x,z in [(-.032,.053),(.027,.065),(0,.073)]:ball(x,.003,z,.006,.010,.003,cream,5)
for i in range(5):
    a=i*math.tau/5
    ball(.032*math.cos(a),.068,.032*math.sin(a),.03,.009,.026,leaf,6)
finish("strawberry")
def wheat_head(x,y,z,scale):
    disc(x,y+.015*scale,z,.009*scale,.23*scale,.009*scale,wood,6)
    for row in range(3):
        for side in [-1,1]:
            loft(x+side*.018*scale,y+(.013+row*.033)*scale,z,
                 [(-.024*scale,circle(.003*scale,.003*scale,4)),(0,circle(.023*scale,.016*scale,4)),
                  (.032*scale,circle(.002*scale,.002*scale,4))],gold,True)
wheat_head(-.025,-.014,0,1);wheat_head(.027,-.024,.010,.91)
box(0,-.048,0,.075,.017,.038,leaf);finish("wheat")
disc(0,-.004,0,.069,.14,.069,"a53a59",10);disc(0,.077,0,.073,.022,.073,"eec9a0",10)
box(0,-.001,.066,.072,.057,.008,cream);ball(0,0,.071,.020,.021,.004,"bb4b5b",7);finish("jam")
ball(0,0,0,.112,.067,.064,"cb874d",10)
for x in [-.054,0,.054]:box(x,.056,.009,.019,.012,.051,"efd39d")
finish("bread")
loft(0,0,0,[(h,circle(r,r,9)) for h,r in [(-.095,.044),(-.085,.052),(.044,.052),(.073,.030),(.090,.030)]],"ed9137")
disc(0,.096,0,.033,.020,.033,green,9);box(0,-.012,.052,.056,.056,.005,cream);finish("carrotJuice")

# Farm animals and orchard trees; origins remain at ground level.
for x in [-.14,.14]:
    for z in [-.13,.14]:
        disc(x,.14,z,.038,.23,.038,white,8);box(x,.038,z,.086,.057,.081,ink)
ball(0,.36,0,.242,.175,.247,white)
ball(-.197,.38,.045,.054,.101,.091,ink);ball(.196,.39,-.048,.059,.108,.114,ink)
ball(0,.50,.196,.157,.143,.137,white);ball(0,.438,.310,.112,.061,.068,"e2a497")
for s in [-1,1]:
    ball(s*.146,.542,.180,.064,.031,.046,ink);ball(s*.094,.523,.29,.015,.017,.015,ink,8)
    disc(s*.077,.637,.159,.022,.064,.020,"d1ab74",7,.2)
    ball(s*.051,.443,.369,.012,.009,.009,coffee,6)
disc(0,.338,-.241,.019,.184,.020,ink,8);finish("cow")
ball(0,.153,0,.127,.112,.160,cream);ball(0,.257,.108,.083,.087,.076,white)
ball(0,.326,.112,.026,.043,.045,red)
ball(0,.244,.183,.035,.022,.047,gold,7)
for s in [-1,1]:
    ball(s*.068,.273,.145,.010,.011,.010,ink,7);ball(s*.113,.16,-.015,.032,.060,.097,white)
    disc(s*.050,.046,.01,.014,.072,.014,gold,7);box(s*.050,.013,.029,.049,.018,.076,gold)
finish("hen")
disc(0,.35,0,.081,.70,.075,wood,9,.7)
for x,y,z,a,b,d,c in [(0,.91,0,.40,.37,.35,"78ad73"),(-.24,.80,.02,.27,.25,.27,"87b978"),(.25,.82,-.015,.27,.27,.26,"64a471"),(.03,1.08,-.02,.28,.22,.26,"88bb79")]:ball(x,y,z,a,b,d,c,9)
finish("tree")

# The cart remains hollow: its cargo is rendered and updated separately.
box(0,.25,.028,.39,.048,.49,deep)
for x in [-.19,.19]:
    for z in [-.19,.25]:box(x,.413,z,.025,.313,.027,green)
    for y in [.31,.42,.55]:box(x,y,.03,.029,.034,.48,green)
    box(x,.555,.03,.037,.035,.51,mint)
for z in [-.205,.266]:
    for y in [.31,.42,.55]:box(0,y,z,.405,.035,.028,green)
for x in [-.16,.16]:
    box(x,.475,-.35,.034,.44,.034,green)
    for z in [-.16,.21]:ball(x,.083,z,.038,.065,.065,ink,8)
box(0,.69,-.35,.43,.045,.045,wood);finish("cart")

# Checkout: scanner, drawer, register keys, and a dark screen with an inset display.
box(0,.33,-.08,.69,.65,.84,green);box(0,.10,-.08,.655,.11,.81,deep)
box(0,.73,-.08,.81,.12,.95,cream);box(0,.80,.105,.53,.028,.42,"596b61")
box(0,.43,.344,.53,.18,.018,mint);box(0,.45,.359,.115,.026,.026,deep)
box(.09,.84,-.29,.38,.085,.26,wood);box(.13,.982,-.33,.082,.241,.272,deep)
box(.177,.987,-.33,.016,.160,.207,"c5e8c9")
for x in [-.045,.014,.073]:
    for z in [-.25,-.19]:box(x,.89,z,.036,.013,.031,cream)
finish("till")

for name,c in [('paste',red),('coffee',wood),('dairy',blue),('grill',"627169"),
               ('kettle',"bc586e"),('oven',"cc8057"),('press',"88af65")]:
    trim=0 if name in ('kettle','oven','press') else .10
    box(0,.31,0,.94,.60,.73,c);box(0,.066,0,1.04,.115,.82,deep,trim);box(0,.65,0,1.01,.11,.81,cream,trim)
    for x in [-.34,-.29,-.24]:box(x,.45,.374,.019,.13,.015,deep,trim)
    ball(.32,.48,.375,.037,.036,.013,gold,8)
    for x in [-.92,.93]:box(x,.19,0,.56,.11,.50,wood,trim)
    if name=='grill':
        box(0,.76,-.12,.78,.093,.47,coffee)
        for j in range(-3,4):box(j*.10,.825,-.12,.034,.04,.46,ink)
    elif name=='kettle':
        loft(0,0,-.10,[(.70,circle(.19,.19,12)),(.84,circle(.32,.29,12)),(.98,circle(.34,.31,12))],"bb804e")
        disc(0,.985,-.10,.30,.015,.27,"953957",12)
        box(.13,1.05,-.12,.042,.19,.043,wood)
    elif name=='oven':
        ball(0,.76,-.09,.41,.34,.31,"cc8057",10)
        box(0,.83,.169,.48,.23,.05,ink,.22);box(0,.745,.195,.38,.035,.026,"f0a854")
        box(-.28,1.03,-.21,.12,.30,.12,coffee)
    elif name=='press':
        for x in [-.21,.21]:box(x,.94,-.11,.06,.43,.07,metal,0)
        box(0,1.15,-.11,.50,.065,.09,deep,0)
        disc(0,1.02,-.11,.036,.21,.036,metal,8)
        disc(0,.92,-.11,.18,.044,.17,cream,10)
        disc(0,.77,-.11,.21,.12,.19,wood,10)
        box(.21,.74,-.11,.14,.035,.067,metal)
    else:
        disc(0,.94,-.17,.266,.48,.266,metal if name!='coffee' else coffee,16,1.06)
        disc(0,1.19,-.17,.30,.055,.30,green);disc(0,1.225,-.17,.073,.035,.073,wood)
        disc(0,.82,-.17,.275,.035,.275,cream)
    finish("machine_"+name)

# Shared character face; clothing and limbs remain articulated and recolourable.
ball(0,.538,0,.080,.091,.073,skin,12)
for s in [-1,1]:
    ball(s*.027,.546,.067,.008,.009,.005,ink,7)
    ball(s*.076,.532,0,.012,.021,.013,skin,7)
ball(0,.527,.074,.012,.011,.012,"e5a17c",7)
finish("face")
ball(0,.60,-.012,.083,.047,.074,"77543d");ball(0,.562,-.058,.071,.064,.028,"77543d")
ball(-.048,.584,.041,.035,.021,.028,"815a40");finish("hair")

# Drive-through vehicles: paint is a second mesh so order colours stay live.
box(0,.31,0,1.05,.35,.62,white,.25);box(-.05,.56,0,.58,.23,.52,white,.29);finish("car_paint")
for z in [-.273,.273]:
    box(-.052,.587,z,.44,.145,.015,"a7d7d3");box(-.060,.586,z,.022,.15,.019,deep)
    for x in [-.35,.35]:
        ball(x,.154,z*1.17,.143,.143,.056,ink,12)
        ball(x,.154,z*1.34,.070,.070,.015,metal,10)
for z in [-.201,.201]:box(-.527,.35,z,.023,.076,.108,cream)
box(.248,.588,0,.018,.14,.408,blue);box(-.344,.588,0,.018,.14,.408,blue);finish("car_trim")
for x in [-.28,.28]:ball(x,.159,0,.159,.159,.040,ink,12);ball(x,.159,.032,.088,.088,.014,metal,10)
box(0,.30,0,.62,.09,.09,blue);box(.12,.46,0,.105,.31,.10,blue)
box(-.18,.41,0,.17,.07,.19,ink);box(.08,.58,0,.19,.24,.20,red)
ball(.08,.80,0,.113,.121,.109,skin);ball(.08,.882,0,.129,.084,.119,blue);finish("bike")

# A striped canopy defines the front door without embedding untranslated signage.
box(0,1.525,.22,2.18,.105,.65,green)
for i in range(9):
    x=(i-4)*.234
    box(x,1.584,.22,.202,.017,.62,cream if i%2 else mint)
    box(x,1.499,.538,.211,.082,.026,cream if i%2 else mint)
finish("awning")
box(0,.14,0,1.46,.20,.72,green);box(0,.076,.01,1.39,.056,.69,deep)
for x in [-.59,.59]:box(x,.116,.364,.077,.052,.014,gold)
finish("shelf_base")

# Workstations and farm silhouettes use the same palette as the storefront.
for name,accent in [('marketing',"a788be"),('accountant',"6a9db4")]:
    box(0,.396,0,.83,.085,.55,wood)
    for x in [-.31,.31]:box(x,.20,0,.074,.38,.40,cream)
    box(0,.46,-.11,.18,.038,.16,accent);box(0,.51,-.11,.045,.12,.044,accent)
    box(0,.62,-.11,.34,.24,.055,accent);box(0,.62,-.079,.278,.182,.012,"dbefd4")
    box(-.015,.451,.094,.25,.019,.095,deep)
    box(.28,.453,.075,.080,.028,.095,cream)
    finish("desk_"+name)
box(0,.34,0,.52,.62,.50,deep);box(0,.68,-.015,.59,.097,.57,green)
box(0,.75,.03,.17,.069,.086,cream)
for x in [-.175,.175]:box(x,.28,.252,.019,.32,.019,green)
finish("bin")
box(0,0,0,.215,.044,.19,"62a87e");box(0,.002,0,.048,.046,.194,cream)
for z in [-.065,.065]:box(.066,.023,z,.051,.002,.007,"3e8460")
finish("notes")
box(0,0,0,.194,.204,.158,wood,.3);box(0,.104,0,.128,.040,.10,cream);finish("satchel")
box(0,.039,0,.62,.073,.45,wood)
for s in [-1,1]:
    for y in [.111,.218]: box(0,y,s*.197,.64,.081,.053,wood);box(s*.285,y,0,.058,.081,.40,"bc8859")
finish("crate")
for name,stem,foliage in [('tomato',leaf,'72a65b'),('coffee',wood,'44805a')]:
    disc(0,.431,0,.026,.55,.026,stem,8,.70)
    for i in range(5):
        a=i*2.40
        x=.132*math.cos(a); z=.112*math.sin(a); y=.39+i*.062
        ball(x,y,z,.128,.058,.091,foliage if i%2 else leaf,8)
    ball(0,.702,0,.099,.078,.083,foliage,8)
    finish("plant_"+name)
def blade(x,y,z,dx,dz,h,w,c):
    # Closed, folded leaf with a centre ridge; readable without alpha textures.
    length=math.hypot(dx,dz) or 1
    u=-dz/length*w;v=dx/length*w
    piece([(x,y,z),(x+dx*.58+u,y+h*.56,z+dz*.58+v),(x+dx,y+h,z+dz),
           (x+dx*.58-u,y+h*.56,z+dz*.58-v),(x+dx*.45,y+h*.68,z+dz*.45)],
          [(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],c)
for x in [-.12,.12]:
    disc(x,.45,0,.024,.57,.024,leaf,8,.68)
    for i in range(4):
        a=i*2.4;blade(x,.28+i*.073,0,.158*math.cos(a),.142*math.sin(a),.17,.045,leaf if i%2 else '81ad51')
    disc(x,.756,0,.019,.079,.019,gold,6,.12)
finish("plant_corn")
for i in range(7):
    a=i*math.tau/7;blade(0,.18,0,.103*math.cos(a),.103*math.sin(a),.16+(i%2)*.054,.020,leaf if i%2 else '7ead59')
finish("plant_carrot")
for i in range(6):
    a=i*math.tau/6
    blade(0,.18,0,.24*math.cos(a),.22*math.sin(a),.21,.09,leaf if i%2 else "71b16c")
for x in [-.12,.11]:ball(x,.36,-.02,.036,.025,.035,cream,6)
finish("plant_strawberry")
for x,z,h in [(-.15,-.06,.27),(0,.03,.36),(.14,-.05,.31)]:
    disc(x,.19+h/2,z,.014,h,.014,"a99e4e",6)
    wheat_head(x,.19+h,z,1.1)
    blade(x,.23,z,.13,.05,.15,.026,leaf)
finish("plant_wheat")

out=Path(sys.argv[sys.argv.index("--")+1]).resolve()
source=Path(sys.argv[sys.argv.index("--")+2]).resolve()
out.parent.mkdir(parents=True,exist_ok=True);source.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.color_type='VERTEX'
        area.spaces.active.region_3d.view_location=(8,5,0)
        area.spaces.active.region_3d.view_distance=19
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",export_animations=False,
                           export_vertex_color="ACTIVE", export_all_vertex_colors=False)
