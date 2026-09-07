# こもれび — L-system botanical studio

リアルな樹木の形を、気軽に試してモデリングするローカルWebアプリです。日本語UI、3Dプレビュー、成長タイムライン、AI制作、保存、PNG / GLB / JSON書き出しを備えています。

計算はRustバックエンド、表示はTypeScript + Three.jsです。L-systemの展開・枝の座標計算はブラウザーのメインスレッドでは実行しません。通常表示は軽量なインスタンシング、GLB書き出し時は先細りを焼き込んだメッシュを使用します。

## 最初からセットアップする

必要なのは **Docker Desktop（Linuxコンテナー）** です。Node.jsやRustをPCにインストールする必要はありません。AI制作を使う場合のみ、PCでOllamaを起動し、使用するモデルを準備してください。手動モデリングはOllamaが停止していても使えます。

リポジトリー直下で実行します。

```sh
docker compose up -d --build
```

[http://127.0.0.1:3000](http://127.0.0.1:3000) を開いてください。初回はRustのコンパイルと依存パッケージの取得で数分かかります。

```sh
docker compose logs -f app
docker compose down
```

標準構成は**既存Ollamaを使用**します。CPU用Ollamaやモデルダウンロードを自動起動しません。ポートは127.0.0.1限定です。

### モデル・接続先・ポート

`.env.example` を `.env` にコピーして必要な項目だけ変更してください。既定モデルは、このPCにある `gemma4:latest` です。`ollama list` に表示されるモデル名を指定します。

| 設定              | 既定値                                                                            | 用途                                |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| `APP_PORT`        | `3000`                                                                            | Docker公開ポート／ローカルAPIポート |
| `OLLAMA_MODEL`    | `gemma4:latest`                                                                   | Ollamaモデル名                      |
| `AI_TIMEOUT_MS`   | `180000`                                                                          | 生成の待ち時間。1000〜600000ミリ秒  |
| `OLLAMA_BASE_URL` | Docker: `http://host.docker.internal:11434`、ネイティブ: `http://127.0.0.1:11434` | バックエンドから接続するOllama      |

設定変更後は `docker compose up -d --build` を実行してください。AIパネルの「再確認」で接続を確認できます。生成中・直後のGPU配置は `ollama ps` で確認できます。GPUを使っていても、モデルやコンテキストがVRAMに収まらなければCPUとの混在になる場合があります。[Ollama公式FAQ](https://docs.ollama.com/faq#how-can-i-tell-if-my-model-was-loaded-onto-the-gpu)

### OllamaもDocker内でGPU起動する場合

明示的な別構成です。NVIDIA GPUをDockerから利用できる環境が必要です。

```sh
docker compose down
docker compose -f compose.gpu.yaml up -d --build
```

GPU割り当ては必須で、利用できない場合は起動エラーになります。モデルは名前付きボリュームに保存し、通常の `down` では消しません。既存Ollamaと同梱Ollamaは別のモデル保存先です。同梱モデルの既定値は `gemma4:e4b` で、`.env` があればその `OLLAMA_MODEL` を優先します。初回の取得には十分な空き容量が必要です。

```sh
docker compose -f compose.gpu.yaml logs -f model-pull
docker compose -f compose.gpu.yaml down
```

[OllamaのDocker / GPUセットアップ](https://docs.ollama.com/docker)

## 使い方

1. シラカバ・イロハモミジ・サクラ・シダから選ぶか、「AIと言葉からつくる」に希望を入力します。
2. 「かたち」「質感」で枝、重力、葉や花を調整します。変更は自動反映されます。
3. タイムラインで成長を観察します。再生は安全に生成できる世代で停止します。
4. 「ルール」で公理と置換規則を編集できます。エラー時は直前の樹木を残します。
5. マイライブラリへ保存、またはPNG / GLB / JSONで書き出します。

ドラッグで回転、右ドラッグで移動、スクロールでズーム。タッチは1本指で回転、2本指で移動・ズームです。

| ショートカット       | 操作             |
| -------------------- | ---------------- |
| F                    | 樹木全体を表示   |
| Space                | 成長の再生・停止 |
| Ctrl / ⌘ + Z         | 元に戻す         |
| Ctrl / ⌘ + Shift + Z | やり直し         |
| Ctrl / ⌘ + S         | 保存             |
| Ctrl / ⌘ + Enter     | 再生成           |

公理 `A`、規則 `A=F[+A][-A]` で二股の枝が繰り返されます。1行1規則、`#` で始まる行はコメント、`A=` は空置換です。

| 記号                 | 意味                        |
| -------------------- | --------------------------- |
| F / f                | 枝を描いて前進 / 描かず前進 |
| L / K / M            | 葉 / 花 / つぼみ            |
| + / -                | 左右に回転                  |
| & / ^                | 前後に傾ける                |
| / とバックスラッシュ | 枝の軸を中心に回転          |
| [ / ]                | 状態の保存 / 復元           |
| ! / ダブルクォート   | 太さ / 長さにscaleを掛ける  |
| 縦棒                 | 180度回転                   |

`F(2)`、`+(30)`、`!(0.7)` のように引数を指定できます。数値、四則演算、括弧、指数表記に対応します。プログラムコードは実行しません。従来の互換性のため、引数なしの `!` は `scale` を使用します。`widthDecay` はFで枝を伸ばす際の減衰です。

## 保存と書き出し

- 旧形式の `lsystem_presets_v1` と `lsystem_studio_draft_v1` を引き継ぎます。
- 保存先はブラウザー内です。同じホスト名・ポートで開くと既存の保存内容を使用できます。別ポートへ移す前にJSONを書き出してください。
- サイトデータ削除で保存内容も消えます。破損した保存領域は自動上書きしません。
- GLBには静止した樹木とテクスチャを含みます。枝は先細りを通常メッシュに焼き込み、葉・花は `EXT_mesh_gpu_instancing` を使います。風、床、グリッドは含みません。
- PNGは現在の視点・背景を含みます。高さはモデル内の相対単位です。
- 実在する木の雰囲気を表現するモデリングツールで、生物学的な成長の厳密なシミュレーションではありません。

## 構成

```text
backend/                 Rust API・L-system・GPU配置・書き出しメッシュ・Ollama連携
  src/engine.rs          展開、数式、3Dタートル、再現可能な乱数
  src/mesh.rs            表示用バイナリ、GLB用メッシュ
  src/ai.rs              Ollama構造化出力と検証
  tests/                 API、互換性、描画／書き出しの頂点一致
web/                     TypeScript UI、Three.js描画、保存と書き出し
  tests/reference/       比較検証専用の旧TS計算実装（配信されません）
shared/                  両側で使うプリセットと枝テンプレート
assets/source-textures/  元画像の保管（配信・Dockerイメージには含みません）
scripts/                 直下からの開発・検証・ベンチマーク
 docs/                   設計・性能の記録
```

旧 `frontend/server` のNodeバックエンドは廃止し、Rustへ統合しました。配信用画像は `web/public/textures/` の約4.9MBです。実行用DockerイメージにNode.js、Rustコンパイラー、開発依存パッケージは含めません。

## ネイティブ開発（Dockerを使わない場合）

Node.js 24以上と[公式Rustツールチェーン](https://rust-lang.org/tools/install/)をセットアップしてください。WindowsではRustの案内に従いMSVC C++ Build Toolsが必要です。検証環境はRust 1.98 / Linuxコンテナーです。

```sh
npm install
npm run dev
```

すべてリポジトリー直下で実行します。画面は通常5173番、Rust APIは3000番です。`.env` を読み込み、Ctrl+Cで起動したプロセス群を停止します。Rustコード変更時は開発コマンドを再起動してください。Dockerの3000番と同時には起動しないでください。

```sh
npm run build
npm start
```

テストと型チェック：

```sh
npm test
npm run typecheck
```

RustをPCへ入れず、Dockerだけで両側を検証するには：

```sh
docker build --target test -t komorebi-tests .
```

Nodeのみでのフロント検証は `npm run test:web` / `npm run build:web`。詳しい性能測定と設計は [docs/architecture.md](docs/architecture.md) を参照してください。
