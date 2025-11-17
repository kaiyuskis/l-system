from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import pipeline
import json
import re
import datetime

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
    
class LSystemRule(BaseModel):
    char: str
    rule: str

class LSystemParams(BaseModel):
    premise: str
    angle: float
    turn: float
    scale: float
    leafSize: float
    branchColor: str
    leafColor: str
    rules: list[LSystemRule]

# システムプロンプト
SYSTEM_PROMPT = """
あなたは、自然言語のプロンプトをL-systemのパラメータ（JSON形式）に変換するアシスタントです。
以下のJSON形式で「必ず」回答してください。説明や前置きは一切不要です。

JSON形式の例:
{
    "premise": "X(10, 0.2)",
    "angle": 30.0,
    "turn": 137.5,
    "scale": 0.7,
    "leafSize": 0.5,
    "branchColor": "#8B4513",
    "leafColor": "#228B22",
    "rules": [
        {"char": "X", "rule": "F(len, width)[+(p.angle)&(p.turn)X(len*p.scale, width*p.scale)]L(p.leafSize)"},
        {"char": "F", "rule": "F(len, width)"}
    ]
}

ルール:
- 「rules」キーには、ルールの配列を含めてください。
- 「char」: ルールを適用する文字 (例: "X")。
- 「rule」: 実行する「簡易L-system文法」の文字列。
- 「rule」の中では、`len`, `width`, `p.angle`, `p.scale` などの変数や計算式を `()` の中に直接記述できます。
- `+`, `-`, `&`, `^`, `\`, `/` の直後に `()` がない場合、それらは自動的に `p.angle` または `p.turn` を使います。
- （例: `[+X]` は `[+(p.angle)X]` と解釈されます）

★ 特別なルール:
- 「桜」: `leafColor` をピンク ("#FFC0CB") にし、`rules` の `X` を `F(len, width)[+X(len*p.scale*0.9)][-X(len*p.scale*0.9)]` のように単純な分岐にし、`angle` を広め (35) にしてください。
- 「もみじ」: `leafColor` を赤 ("#FF4500") にし、`rules` の `X` を `F(len, width)[\(p.angle)F(len*p.scale)X(len*p.scale)]...` のようにZ軸回転 `\` を使って複雑にしてください。
- 「枯れ木」: `leafSize` を 0.0 にし、`rules` の `X` から `L(p.leafSize)` コマンドを削除してください。
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
    
    start_time = datetime.datetime.now()
    print(f"\n--- リクエスト受信 ({start_time.strftime('%Y-%m-%d %H:%M:%S')}) ---")
    print(f"プロンプト: {request.prompt}")
    
    if llm_pipeline is None:
        print("AIモデルが利用できません")
        
        return LSystemParams(
            premise="X(10, 0.2)",
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
        inference_start_time = datetime.datetime.now()
        print(f"ステップ1/3: AI推論を開始... ({inference_start_time.strftime('%H:%M:%S')})")
        
        try:
            outputs = llm_pipeline(
                messages,
                max_new_tokens=256,
                eos_token_id=llm_pipeline.tokenizer.eos_token_id,
                do_sample=True,
                temperature=0.3,
                top_p=0.9,
            )
        except KeyboardInterrupt:
            print("\n[中断] AI推論が Ctrl+C によりキャンセル")
            raise
        
        inference_end_time = datetime.datetime.now()
        inference_duration = (inference_end_time - inference_start_time).total_seconds()
        print(f"ステップ2/3: AI推論が完了({inference_end_time.strftime('%H:%M:%S')})")
        
        ai_response_text = outputs[0]['generated_text'][-1]["content"]
        print(f"AIの応答:\n{ai_response_text}")
        
        json_str = extract_json_from_response(ai_response_text)
        if not json_str:
            raise ValueError("AIがJSONを返しませんでした")
        
        params_dict = json.loads(json_str)
        print("ステップ3/3: JSONのパースに成功")
        
        response_data = LSystemParams(**params_dict)
        
        total_duration = (datetime.datetime.now() - start_time).total_seconds()
        print(f"--- レスポンス送信 (総所要時間: {total_duration:.2f} 秒)---")
        
        return response_data
        
    except KeyboardInterrupt:
        print("\n[中断] リクエスト処理がキャンセルされました。")
        
        return LSystemParams(
            premise="X(10, 0.2)", 
            angle=30.0, 
            turn=137.5, 
            scale=0.7, 
            leafSize=0.5, 
            branchColor="#8B4513", 
            leafColor="#228B22")
    
    except Exception as e:
        print(f"AI処理エラー: {e}")

        return LSystemParams(
            premise="X(10, 0.2)", angle=30.0, turn=137.5, scale=0.7, leafSize=0.5,
            branchColor="#8B4513", leafColor="#228B22",
            rules=[
                {"char": "X", "rule": "F(len, width)[+(p.angle)&(p.turn)X(len*p.scale, width*p.scale)]L(p.leafSize)"},
                {"char": "F", "rule": "F(len, width)"}
            ]
        )