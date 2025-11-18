import "./style.css";
import * as THREE from "three";
import { Pane } from "tweakpane";
import { scene, loader } from "./three-setup.ts"; // ★ GLTFLoader をインポート

// ★ l-system.ts はインポートしない

interface LSystemRule {
  char: string;
  rule: string;
}

let currentPlant: THREE.Group | null = null;
const loadingOverlay = document.getElementById("loading-overlay");

// --- 1. UIのパラメータ定義 ---
const params = {
  // ★ AI関連は後で追加 (AIトグル、プロンプト)

  // 基本設定
  premise: "X",
  generations: 5,
  initialLength: 1.0,
  initialThickness: 0.2,

  // 全体設定 (p.)
  angle: 30.0,
  turn: 137.5,
  scale: 0.7,
  leafSize: 0.5,

  // 色 (バックエンドでは使わないが、フロントエンドでのマテリアル設定用に残す)
  branchColor: "#8B4113",
  leafColor: "#228B22",

  // ルール (Houdini風 簡易文法)
  rules: [
    {
      char: "X",
      rule: "F(p.initialLength)!(p.initialThickness)[+(p.angle)&(p.turn)_(p.scale)X]L(p.leafSize)",
    },
    { char: "F", rule: "F" },
    { char: "", rule: "" },
    { char: "", rule: "" },
  ] as LSystemRule[],
};

// --- 2. メインロジック (glTFをFetch) ---

async function regenerateLSystem() {
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }

  // 古いモデルを削除
  if (currentPlant) {
    scene.remove(currentPlant);
    // (ジオメトリ等の解放処理も必要だが簡略化)
  }

  try {
    // 1. Tweakpaneから現在のパラメータを取得
    // (params オブジェクトが Tweakpane によって直接更新されている)
    const requestBody = {
      ...params,
      generations: Math.floor(params.generations), // 世代数は整数
    };

    // 2. バックエンド (Python) にJSONを送信
    const response = await fetch("http://localhost:8000/generate-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`サーバーエラー: ${response.statusText}`);
    }

    // 3. レスポンスをArrayBuffer (glTFバイナリ) として取得
    const glb = await response.arrayBuffer();

    // 4. GLTFLoaderで ArrayBuffer をパース
    loader.parse(glb, "", (gltf) => {
      currentPlant = gltf.scene;

      // 5. 影の設定
      currentPlant.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // ★ バックエンドは色情報を含めない簡易glTFなので、
          // ★ フロントエンド側でマテリアル(色)を上書きする
          // (0番が枝、1番が葉、のようにバックエンドと決めておく必要がある)
          // (今回は簡易的に、すべてのマテリアルの色を変更)
          child.material = new THREE.MeshStandardMaterial({
            color: params.branchColor, // (葉の色分けは別途必要)
          });
        }
      });

      scene.add(currentPlant);

      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
      }
    });
  } catch (error) {
    console.error("生成エラー:", error);
    if (loadingOverlay) {
      loadingOverlay.style.display = "none";
    }
  }
}

// --- 3. Tweakpane UIのセットアップ ---
const pane = new Pane({ title: "L-System 設定" });
pane.addButton({ title: "モデルを生成" }).on("click", regenerateLSystem);

const tab = pane.addTab({
  pages: [{ title: "基本設定" }, { title: "ルール設定" }],
});

// --- 基本設定タブ ---
const setupTab = tab.pages[0];
setupTab.addBinding(params, "premise", { label: "前提 (Premise)" });
setupTab.addBinding(params, "generations", {
  label: "世代数",
  min: 1,
  max: 10,
  step: 1,
});
setupTab.addBinding(params, "initialLength", {
  label: "初期 長さ",
  min: 0.1,
  max: 20,
});
setupTab.addBinding(params, "initialThickness", {
  label: "初期 太さ",
  min: 0.01,
  max: 1.0,
});

setupTab.addBinding(params, "angle", {
  label: "p.角度 (Pitch)",
  min: 0,
  max: 90,
});
setupTab.addBinding(params, "turn", {
  label: "p.ひねり (Twist)",
  min: 0,
  max: 180,
});
setupTab.addBinding(params, "scale", {
  label: "p.成長率 (Scale)",
  min: 0.5,
  max: 1.0,
});

setupTab.addBinding(params, "branchColor", { label: "枝の色" });
setupTab.addBinding(params, "leafColor", { label: "葉の色" });
setupTab.addBinding(params, "leafSize", {
  label: "p.葉のサイズ",
  min: 0.1,
  max: 2.0,
});

// --- ルール設定タブ ---
const rulesTab = tab.pages[1];
params.rules.forEach((rule, index) => {
  const folder = rulesTab.addFolder({ title: `ルール ${index + 1}` });
  folder.addBinding(rule, "char", { label: "文字" });
  folder.addBinding(rule, "rule", {
    label: "簡易文法",
    multiline: true,
    rows: 5,
  });
});

// --- 4. 初回実行 ---
regenerateLSystem();
