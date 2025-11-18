import math
import copy
from typing import List, Dict, Any

# --- 1. L-system 文字列生成器 (シンプル版) ---
def generate_l_system_string(premise: str, rules: Dict[str, str], generations: int, global_params: Dict[str, Any]) -> str:
    """
    ルール内の 'p.scale' などを数値に置換し、文字列を生成する
    """
    current_string = premise
    evaluated_rules = {}

    for char, rule_string in rules.items():
        # "p.angle" -> 30, "p.scale" -> 0.7 のように置換
        for key, value in global_params.items():
            rule_string = rule_string.replace(f"p.{key}", str(value))
        evaluated_rules[char] = rule_string
    
    for _ in range(generations):
        next_string = ""
        for char in current_string:
            next_string += evaluated_rules.get(char, char)
        current_string = next_string
    
    return current_string

# --- 2. L-system 解釈器 (ステートフル・タートル) ---
# (Three.jsの代わりに、頂点リストを直接操作する)

class TurtleState:
    """タートルの現在の状態を保持するクラス"""
    def __init__(self, initial_state: Dict[str, float]):
        self.position = [0.0, 0.0, 0.0] # x, y, z
        self.rotation = [0.0, 0.0, 0.0, 1.0] # クォータニオン (x, y, z, w)
        self.length = initial_state.get("length", 1.0)
        self.thickness = initial_state.get("thickness", 0.1)
        self.angle = initial_state.get("angle", 30.0)
        self.turn = initial_state.get("turn", 137.5)

    def get_copy(self):
        # 簡易的な深いコピー
        return copy.deepcopy(self)

def _parse_params(s: str, index: int, default_val: float) -> (float, int):
    """( ) 内の簡易的な数式をパースする"""
    if index + 1 >= len(s) or s[index + 1] != '(':
        return default_val, index + 1
    
    closing_index = s.find(')', index + 1)
    if closing_index == -1:
        return default_val, index + 1
    
    param_string = s[index + 2:closing_index]
    try:
        # Pythonのevalを使って簡易的な数式 (例: "0.7*1.2") を評価
        value = float(eval(param_string, {}, {}))
    except Exception:
        value = default_val
        
    return value, closing_index + 1

def create_l_system_geometry(l_system_string: str, initial_state: Dict[str, float]):
    """
    L-system文字列を解釈し、枝と葉の位置リストを生成する
    (Three.jsの代わりにPythonで実装)
    """
    
    # ここでは、簡略化のため、枝の「始点」と「終点」のリストと、
    # 葉の「位置」リストだけを生成します。
    # (glTF生成には、実際にはメッシュ化(Cylinder)が必要です)
    
    branches = [] # ( [x1, y1, z1, x2, y2, z2], ... )
    leaves = [] # ( [x, y, z, scale], ... )
    
    turtle = TurtleState(initial_state)
    stack: List[TurtleState] = []

    i = 0
    while i < len(l_system_string):
        char = l_system_string[i]
        
        # (クォータニオンの代わりにオイラー角で簡易的に実装します)
        # (Houdiniのリファレンスとは回転軸が異なる場合があります)

        if char == 'F':
            current_length, next_i = _parse_params(l_system_string, i, turtle.length)
            
            # (ここでは単純な始点/終点リストのみ作成)
            start_pos = list(turtle.position)
            
            # (タートルの前進ロジック - 簡易版: Y軸が前)
            # (実際にはクォータニオン/回転行列での移動が必要)
            turtle.position[1] += current_length 
            
            end_pos = list(turtle.position)
            branches.append((start_pos, end_pos, turtle.thickness))
            i = next_i
            
        elif char == 'f':
            current_length, next_i = _parse_params(l_system_string, i, turtle.length)
            turtle.position[1] += current_length
            i = next_i

        elif char == '+': # Pitch Up (X軸回転)
            # (回転ロジック - 簡易版)
            val, next_i = _parse_params(l_system_string, i, turtle.angle)
            i = next_i
        elif char == '-': # Pitch Down
            val, next_i = _parse_params(l_system_string, i, -turtle.angle)
            i = next_i
        elif char == '&': # Turn Right (Y軸回転)
            val, next_i = _parse_params(l_system_string, i, turtle.turn)
            i = next_i
        elif char == '^': # Turn Left
            val, next_i = _parse_params(l_system_string, i, -turtle.turn)
            i = next_i
        elif char == '\\': # Roll Clockwise (Z軸回転)
            val, next_i = _parse_params(l_system_string, i, turtle.angle)
            i = next_i
        elif char == '/': # Roll Counter-Clockwise
            val, next_i = _parse_params(l_system_string, i, -turtle.angle)
            i = next_i

        elif char == '"': # length 乗算
            val, next_i = _parse_params(l_system_string, i, 1.0)
            turtle.length *= val
            i = next_i
        elif char == '_': # length 除算
            val, next_i = _parse_params(l_system_string, i, 1.0)
            if val != 0: turtle.length /= val
            i = next_i
        elif char == '!': # thickness 乗算
            val, next_i = _parse_params(l_system_string, i, 1.0)
            turtle.thickness *= val
            i = next_i
        elif char == '?': # thickness 除算
            val, next_i = _parse_params(l_system_string, i, 1.0)
            if val != 0: turtle.thickness /= val
            i = next_i

        elif char == '[':
            stack.append(turtle.get_copy())
            i += 1
        elif char == ']':
            if stack:
                turtle = stack.pop()
            i += 1

        elif char == 'L':
            scale, next_i = _parse_params(l_system_string, i, 1.0)
            leaves.append((list(turtle.position), scale))
            i = next_i
        
        else: # 'X' など
            i += 1
            
    # ★ 生成された「枝」と「葉」のリストを返す
    return branches, leaves