from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Dict, Any
import pygltflib # glTF生成
import numpy as np # メッシュ計算
import struct

from l_system_engine import generate_l_system_string, create_l_system_geometry

app = FastAPI()

# --- 1. Pydanticモデル (フロントエンドから受け取るJSON) ---
class LSystemRule(BaseModel):
    char: str
    rule: str

class LSystemRequest(BaseModel):
    premise: str
    generations: int
    initialLength: float
    initialThickness: float
    angle: float
    turn: float
    scale: float
    leafSize: float
    branchColor: str
    leafColor: str
    rules: List[LSystemRule]

# --- 2. glTF生成ヘルパー (簡易版) ---
def create_gltf_binary(branches, leaves, branch_color_hex, leaf_color_hex):
    """
    枝(線)と葉(点)のリストからglTF(GLB)バイナリを生成する
    """
    
    # (ここでは簡略化のため、枝を「線」、葉を「点」としてglTFを生成します)
    
    # 1. 枝の頂点データを作成
    branch_vertices = []
    for start, end, thickness in branches:
        branch_vertices.extend(start)
        branch_vertices.extend(end)
    
    branch_vertices_array = np.array(branch_vertices, dtype=np.float32)
    branch_vertices_blob = branch_vertices_array.tobytes()

    # 2. 葉の頂点データを作成
    leaf_vertices = []
    for pos, scale in leaves:
        leaf_vertices.extend(pos)
        
    leaf_vertices_array = np.array(leaf_vertices, dtype=np.float32)
    leaf_vertices_blob = leaf_vertices_array.tobytes()
    
    # データを連結
    buffer_blob = branch_vertices_blob + leaf_vertices_blob
    
    gltf = pygltflib.GLTF2()
    gltf.buffers.append(pygltflib.Buffer(byteLength=len(buffer_blob)))
    
    # 0: 枝の頂点, 1: 葉の頂点
    gltf.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=0, byteLength=len(branch_vertices_blob), target=pygltflib.ARRAY_BUFFER))
    gltf.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=len(branch_vertices_blob), byteLength=len(leaf_vertices_blob), target=pygltflib.ARRAY_BUFFER))
    
    # アクセサ (データ型を定義)
    gltf.accessors.append(pygltflib.Accessor(bufferView=0, componentType=pygltflib.FLOAT, count=len(branches) * 2, type=pygltflib.VEC3, min=branch_vertices_array.min(axis=0).tolist(), max=branch_vertices_array.max(axis=0).tolist()))
    gltf.accessors.append(pygltflib.Accessor(bufferView=1, componentType=pygltflib.FLOAT, count=len(leaves), type=pygltflib.VEC3, min=leaf_vertices_array.min(axis=0).tolist(), max=leaf_vertices_array.max(axis=0).tolist()))
    
    # マテリアル (色)
    gltf.materials.append(pygltflib.Material(pbrMetallicRoughness=pygltflib.PbrMetallicRoughness(baseColorFactor=[0.5, 0.5, 0.5, 1.0]))) # (色は後でThree.js側で設定)
    
    # メッシュプリミティブ
    gltf.meshes.append(pygltflib.Mesh(primitives=[
        pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=0), material=0, mode=pygltflib.LINES), # 枝 (線)
        pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=1), material=0, mode=pygltflib.POINTS)  # 葉 (点)
    ]))
    
    # ノードとシーン
    gltf.nodes.append(pygltflib.Node(mesh=0))
    gltf.scenes.append(pygltflib.Scene(nodes=[0]))
    
    gltf.set_binary_blob(buffer_blob)
    
    # GLB (バイナリ形式) で保存
    return gltf.save_to_bytes()

# --- 3. APIエンドポイント ---
@app.post("/generate-model")
async def generate_model(request: LSystemRequest):
    
    print("モデル生成リクエスト受信...")
    
    # 1. UIのルールをPythonの辞書に変換
    rules_dict = {rule.char: rule.rule for rule in request.rules if rule.char}
    
    # 2. L-system文字列を生成
    l_system_string = generate_l_system_string(
        request.premise,
        rules_dict,
        request.generations,
        request.dict() # p.scale などを置換するため
    )
    
    # 3. L-system解釈器を実行
    initial_state = {
        "length": request.initialLength,
        "thickness": request.initialThickness,
        "angle": request.angle,
        "turn": request.turn,
    }
    branches, leaves = create_l_system_geometry(l_system_string, initial_state)
    
    print(f"生成完了: {len(branches)} 本の枝, {len(leaves)} 枚の葉")
    
    # 4. glTFバイナリを生成
    # (色情報はglTFに含めることもできるが、ここでは簡略化)
    glb_binary = create_gltf_binary(branches, leaves, request.branchColor, request.leafColor)
    
    # 5. glbファイルとしてフロントエンドに返す
    return Response(content=glb_binary, media_type="model/gltf-binary")