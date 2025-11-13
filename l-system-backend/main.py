from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import pipeline
import json
import re

print("AIモデルを読み込み中...")
try:
    llm_pipeline = pipeline(
        "text-generation",
        model="microsoft/Phi-3-mini-4k-instruct",
        model_kwargs={"torch_dtype": "auto"},
        device_map="auto"
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
    generations: float
    angle: float
    turn: float
    scale: float
    leafSize: float

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
}

ルール:
- 「premise」は常に "X(10, 0.2)" にしてください。
- 「generations」: プロンプトが「大きい」「背が高い」「複雑」なら 6〜7、「小さい」「シンプル」なら 4〜5。
- 「angle」: プロンプトが「広がっている」「開いている」なら 30〜40、「閉じている」「細い」なら 15〜25。
- 「turn」: 常に 137.5 にしてください。
- 「scale」: プロンプトが「枝が多い」「密」なら 0.7〜0.8、「スカスカ」「まばら」なら 0.5〜0.6。
- 「leafSize」: プロンプトが「葉が大きい」なら 0.7〜1.0、「葉が小さい」なら 0.3〜0.5。

ユーザーのプロンプトを解釈し、最適なパラメータをJSON形式で出力してください。
"""

# JSON部分を抽出する関数
def extract_json_from_response(text: str) -> str | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return match.group(0)
    return None

# APIエンドポイント
@app.post("/generate-params", response_model=LSystemParams)
async def generate_params(request: PromptRequest):
    
    if llm_pipeline is None:
        print("AIモデルが利用できません")
        
        return LSystemParams(
            premise="X(10, 0.2)",
            generations=5,
            angle=30.0,
            turn=137.5,
            scale=0.7,
            leafSize=0.5
        )
        
    print(f"AIがプロンプトを処理中: {request.prompt}")
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.prompt}
    ]
    
    try:
        outputs = llm_pipeline(
            messages,
            max_new_tokens=256,
            eos_token_id=llm_pipeline.tokenizer.eos_token_id,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
        )
        
        ai_response_text = outputs[0]['generated_text'][-1]["content"]
        
        print(f"AIの応答:\n{ai_response_text}")
        
        json_str = extract_json_from_response(ai_response_text)
        
        if not json_str:
            raise ValueError("AIがJSONを返しませんでした")
        
        params_dict = json.loads(json_str)
        
        return LSystemParams(**params_dict)
    
    except Exception as e:
        print(f"AI処理エラー: {e}")
        
        return LSystemParams(
            premise="X(10, 0.2)",
            generations=5,
            angle=30.0,
            turn=137.5,
            scale=0.7,
            leafSize=0.5
        )