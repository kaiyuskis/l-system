from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import pipeline
import json
import re

print("AIモデルを読み込み中...")

try:
    model_id = "microsoft/Phi-3-mini-4k-instruct"
    
    llm_pipeline = pipeline(
        "text-generation",
        model=model_id,
        model_kwargs={"torch_dtype": "auto"},
        device="cuda" if torch.cuda.is_available() else "cpu",
    )
    print("AIモデルの読み込み完了")
    
except Exception as e:
    print(f"AIモデルの読み込みに失敗しました: {e}")
    llm_pipeline = None
    
app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str

class LSystemParams(BaseModel):
    premise: str
    generations: int
    angle: float
    turn: float
    scale: float
    leafSize: float
    branchColor: str
    leafColor: str

# システムプロンプト
SYSTEM_PROMPT = """
あなたは、自然言語のプロンプトをL-systemのパラメータ（JSON形式）に変換するアシスタントです。
以下のJSON形式で「必ず」回答してください。説明や前置きは一切不要です。

JSON形式の例:
{
    "premise": "X(10, 0.2)",
    "generations": 5,
    "angle": 30.0,
    "turn": 137.5,
    "scale": 0.7,
    "leafSize": 0.5
    "branchColor": "#8B4513",
    "leafColor": "#228B22"
}

ルール:
- 「premise」は常に "X(10, 0.2)" にしてください。
- 「generations」: プロンプトが「大きい」「背が高い」「複雑」なら 6〜7、「小さい」「シンプル」なら 4〜5。
- 「angle」: プロンプトが「広がっている」「開いている」なら 30〜40、「閉じている」「細い」なら 15〜25。
- 「turn」: 常に 137.5 にしてください。
- 「scale」: プロンプトが「枝が多い」「密」なら 0.7〜0.8、「スカスカ」「まばら」なら 0.5〜0.6。
- 「leafSize」: プロンプトが「葉が大きい」なら 0.7〜1.0、「葉が小さい」なら 0.3〜0.5。
- 「branchColor」: ほとんどの場合、茶色 ("#8B4513") にしてください。
- 「generations」: 「大きい」「背が高い」なら 6〜7、「小さい」なら 4〜5。

★ 特別なルール:
- 「桜」や「cherry blossom」: `leafColor` をピンク色 (例: "#FFC0CB") にし、`angle` を広め (30-40) にしてください。
- 「もみじ」や「紅葉」「maple」: `leafColor` を赤色 (例: "#FF4500") か オレンジ色 ("#FFA500") にし、`generations` を多め (6) にしてください。
- 「枯れ木」や「dead tree」: `leafSize` を 0.0 にし、`branchColor` を暗い茶色 ("#5C4033") にしてください。
"""

# JSON部分を抽出する関数
def extract_json_from_response(text: str) -> str | None:
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if match:
        return match.group(0)
    return None

# APIエンドポイント
@app.post("/generate-params", response_model=LSystemParams)
async def generate_params(request: PromptRequest):
    
    print(f"\n--- リクエスト受信 ---")
    print(f"プロンプト: {request.prompt}")
    
    if llm_pipeline is None:
        print("AIモデルが利用できません")
        
        return LSystemParams(
            premise="X(10, 0.2)",
            generations=5,
            angle=30.0,
            turn=137.5,
            scale=0.7,
            leafSize=0.5,
            branchColor="#8B4513",
            leafColor="#228B22",
        )
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.prompt},
    ]
    
    try:
        print("ステップ1/3: AI推論を開始します... (時間がかかります)")
        outputs = llm_pipeline(
            messages,
            max_new_tokens=256,
            eos_token_id=llm_pipeline.tokenizer.eos_token_id,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
        )
        
        ai_response_text = outputs[0]['generated_text'][-1]["content"]
        print("ステップ2/3: AI推論が完了しました。")
        
        print(f"AIの応答:\n{ai_response_text}")
        
        json_str = extract_json_from_response(ai_response_text)
        if not json_str:
            raise ValueError("AIがJSONを返しませんでした")
        
        params_dict = json.loads(json_str)
        print("ステップ3/3: JSONのパースに成功しました。")
        
        response_data = LSystemParams(**params_dict)
        print(f"--- レスポンス送信 ---")
        return response_data
        
    except Exception as e:
        print(f"AI処理エラー: {e}")
        
        return LSystemParams(
            premise="X(10, 0.2)",
            generations=5,
            angle=30.0,
            turn=137.5,
            scale=0.7,
            leafSize=0.5,
            branchColor="#8B4513",
            leafColor="#228B22",
        )