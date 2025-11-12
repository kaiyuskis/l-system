from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

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

@app.post("/generate-params", response_model=LSystemParams)
async def generate_params(request: PromptRequest):
    
    print(f"受け取ったプロンプト: {request.prompt}")
    
    # ダミーのロジック
    if "背の高い木" in request.prompt or "many" in request.prompt:
        gen = 8
        scale = 0.8
    else:
        gen = 5
        scale = 0.7
        
    return LSystemParams(
        premise=f"X(10, 0.2)",
        generations=gen,
        angle=30.0,
        turn=137.5,
        scale=scale,
        leafSize=1.0
    )