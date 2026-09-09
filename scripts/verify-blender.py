import bpy, json, sys
from pathlib import Path
paths = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [str(Path(__file__).resolve().parents[1] / 'output' / 'pine-blender.glb')]
for path in paths:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    images=[i for i in bpy.data.images if i.size[0]>0]
    assert len(meshes)>0
    assert len(images)>=1
    assert all(len(o.data.vertices)>0 for o in meshes)
    print('BLENDER_QA',json.dumps({'file':path,'meshes':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'materials':len(bpy.data.materials),'images':[i.name for i in images]}))
