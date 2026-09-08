use crate::{
    ApiError, engine,
    model::{Plant, color, presets},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub prompt: String,
    pub current: Option<Plant>,
}
pub fn schema() -> Value {
    let mut settings =
        json!({"leafTextureKey":{"type":"string","enum":["leaf_default","leaf_maple","pine_needles","leaf_birch","leaf_cherry","fern_pinnule"]},"growthModel":{"type":"string","enum":["lsystem","pine","birch","maple","sakura","fern"]}});
    for (key, min, max, integer) in ranges() {
        settings[key] =
            json!({"type":if integer {"integer"} else {"number"},"minimum":min,"maximum":max});
    }
    for key in ["branchColor", "leafColor", "flowerColor", "budColor"] {
        settings[key] = json!({"type":"string","pattern":"^#[0-9a-fA-F]{6}$"});
    }
    json!({"type":"object","additionalProperties":false,"required":["name","description","preset","settings"],"properties":{
        "name":{"type":"string","minLength":1,"maxLength":60},"description":{"type":"string","minLength":1,"maxLength":300},
        "preset":{"type":"string","enum":["birch","maple","sakura","fern","pine"]},"settings":{"type":"object","additionalProperties":false,"properties":settings},
        "premise":{"type":"string","minLength":1,"maxLength":256},"rules":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"string","maxLength":1024}}
    }})
}
fn ranges() -> Vec<(&'static str, f64, f64, bool)> {
    vec![
        ("generations", 1., 6., true),
        ("crownSpread", 0.3, 2., false),
        ("branchTwist", 0., 2., false),
        ("foliageDensity", 0., 2., false),
        ("needleLength", 0.3, 2., false),
        ("angle", 0., 180., false),
        ("angleVariance", 0., 45., false),
        ("maxLength", 0.1, 3., false),
        ("maxThickness", 0.005, 1., false),
        ("scale", 0.1, 1.2, false),
        ("widthDecay", 0.1, 1., false),
        ("gravity", -2., 2., false),
        ("leafSize", 0., 3., false),
        ("flowerSize", 0., 3., false),
        ("budSize", 0., 1., false),
        ("seed", 0., 4294967295., true),
    ]
}
pub fn validate_input(input: &Input) -> Result<(), ApiError> {
    if input.prompt.trim().is_empty() || input.prompt.chars().count() > 1500 {
        return Err(ApiError::bad(
            "希望する樹木を1〜1,500文字で入力してください。",
        ));
    }
    if let Some(p) = &input.current {
        p.validate().map_err(ApiError::bad)?;
        engine::parse_rules(&p.rules).map_err(ApiError::bad)?;
    }
    Ok(())
}
pub fn validate_proposal(
    v: Value,
    current: Option<&Plant>,
) -> Result<(String, String, Plant), String> {
    let object = v.as_object().ok_or("JSONオブジェクトにしてください。")?;
    if object.keys().any(|k| {
        ![
            "name",
            "description",
            "preset",
            "settings",
            "premise",
            "rules",
        ]
        .contains(&k.as_str())
    }) {
        return Err("応答に不明な項目があります。".into());
    }
    for (key, max) in [("name", 60), ("description", 300)] {
        let s = v[key].as_str().ok_or("名称と説明を指定してください。")?;
        if s.trim().is_empty() || s.chars().count() > max {
            return Err("名称・説明が長すぎるか空です。".into());
        }
    }
    let preset = presets()
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == v["preset"])
        .ok_or("既知のプリセットを指定してください。")?;
    let mut params = if let Some(current) = current {
        serde_json::to_value(current).unwrap()
    } else {
        preset["params"].clone()
    };
    let settings = v["settings"]
        .as_object()
        .ok_or("settings を指定してください。")?;
    for (key, value) in settings {
        if let Some((_, min, max, integer)) = ranges().iter().find(|(k, _, _, _)| k == key) {
            let n = value.as_f64().ok_or("数値設定が不正です。")?;
            crate::model::range(n, *min, *max, key)?;
            if *integer && n.fract() != 0. {
                return Err("整数で指定してください。".into());
            }
        } else if ["branchColor", "leafColor", "flowerColor", "budColor"].contains(&key.as_str()) {
            if !value.as_str().is_some_and(|s| s.len() == 7 && color(s)) {
                return Err("色は6桁のHEX形式にしてください。".into());
            }
        } else if key == "leafTextureKey" {
            if !value
                .as_str()
                .is_some_and(|s| ["leaf_default", "leaf_maple", "pine_needles", "leaf_birch", "leaf_cherry", "fern_pinnule"].contains(&s))
            {
                return Err("葉のテクスチャが不正です。".into());
            }
        } else if key == "growthModel" {
            if !value.as_str().is_some_and(|s| ["lsystem","pine","birch","maple","sakura","fern"].contains(&s)) {
                return Err("成長モデルが不正です。".into());
            }
        } else {
            return Err(format!("設定 {key} は使用できません。"));
        }
        params[key] = value.clone();
    }
    if let Some(rules) = v.get("rules") {
        params["growthModel"] = json!("lsystem");
        let rows = rules.as_array().ok_or("rules は配列にしてください。")?;
        if rows.is_empty()
            || rows.len() > 8
            || rows.iter().any(|r| {
                !r.as_str()
                    .is_some_and(|r| !r.trim().is_empty() && r.len() <= 1024)
            })
        {
            return Err("rules は1〜8個の短いルールにしてください。".into());
        }
        params["rules"] = Value::Array(rows.iter().map(|r| json!({"expression":r})).collect());
    }
    if let Some(premise) = v.get("premise") {
        if !premise
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 256)
        {
            return Err("公理は短い文字列にしてください。".into());
        }
        params["premise"] = premise.clone();
    }
    params["initLength"] = params["maxLength"].clone();
    params["initThickness"] = params["maxThickness"].clone();
    let params: Plant = serde_json::from_value(params).map_err(|_| "樹木の設定が不正です。")?;
    let (_, data, _) = engine::generate(&params)?;
    if data.branches.is_empty() {
        return Err("Fを含むルールで枝を生成してください。".into());
    }
    Ok((
        v["name"].as_str().unwrap().trim().into(),
        v["description"].as_str().unwrap().trim().into(),
        params,
    ))
}
#[derive(Clone)]
pub struct Ai {
    pub client: reqwest::Client,
    pub base: reqwest::Url,
    pub model: String,
    pub timeout: Duration,
}
impl Ai {
    pub fn new(base: &str, model: String, timeout: Duration) -> Result<Self, String> {
        let base = reqwest::Url::parse(base).map_err(|_| "OLLAMA_BASE_URL が不正です。")?;
        if !["http", "https"].contains(&base.scheme())
            || !base.username().is_empty()
            || base.password().is_some()
        {
            return Err("OllamaのURLは認証情報を含まないHTTP(S)にしてください。".into());
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            base,
            model,
            timeout,
        })
    }
    async fn read(mut response: reqwest::Response) -> Result<Value, ApiError> {
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| ApiError::upstream("Ollamaの応答を読み込めませんでした。"))?
        {
            if bytes.len() + chunk.len() > 1_000_000 {
                return Err(ApiError::upstream("Ollamaの応答が大きすぎます。"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| ApiError::upstream("OllamaのJSON応答が不正です。"))
    }
    pub async fn status(&self) -> Value {
        let result = async {
            let response = self
                .client
                .get(self.base.join("/api/tags").unwrap())
                .send()
                .await
                .map_err(|_| ())?;
            if !response.status().is_success() {
                return Err(());
            }
            Self::read(response).await.map_err(|_| ())
        }
        .await;
        match result {
            Ok(v) => {
                let ready = v["models"].as_array().is_some_and(|models| {
                    models.iter().any(|m| {
                        m["name"] == self.model
                            || (!self.model.contains(':')
                                && m["name"] == format!("{}:latest", self.model))
                    })
                });
                json!({"available":ready,"model":self.model,"message":if ready {"AIで樹木を生成できます。"} else {"指定したモデルがありません。Ollamaのモデル名を確認してください。"}})
            }
            Err(_) => {
                json!({"available":false,"model":self.model,"message":"Ollamaに接続できません。既存Ollamaの起動を確認してください。"})
            }
        }
    }
    pub async fn generate(&self, input: Input) -> Result<Value, ApiError> {
        validate_input(&input)?;
        let system = format!(
            "Design botanical L-systems. Return ONLY schema-compliant JSON. Name and description in Japanese. Choose a preset, change only needed settings. When current is provided, settings PATCH current, preset does not replace it. All five presets use species-specific parametric growth. Use generations 3-4 for trees, 4-6 for fern; the tree limit is 5. Adjust crownSpread, branchTwist, foliageDensity, angle, scale and gravity for structural changes. Omit premise/rules for native species. When the user explicitly wants custom string rules, set growthModel lsystem. If changing species while current is supplied, set growthModel and leafTextureKey explicitly because preset alone does not replace current. Commands: F branch, L leaf, K flower, M bud; + - turn, & ^ pitch, / rotation; [ save ] restore, ! width multiply by scale, double quote length multiply by scale. F(1), +(30), !(0.7) supported; arithmetic only. Balance brackets, at most 4 recursive branches per rule, use 3-5 generations for custom rules. Never rewrite organ symbols. The sakura growth model produces flowers directly. Only custom lsystem requires K in rules for flowers. No code. For realistic pines use preset pine with pine_needles and generations 3-4. The pine preset uses a built-in parametric grammar: do not supply premise/rules for it; adjust crownSpread, branchTwist, foliageDensity and needleLength instead. Presets: {}",
            presets()
        );
        let mut messages = vec![
            json!({"role":"system","content":system}),
            json!({"role":"user","content":json!({"prompt":input.prompt.trim(),"current":input.current}).to_string()}),
        ];
        for attempt in 0..2 {
            let response=self.client.post(self.base.join("/api/chat").unwrap()).json(&json!({"model":self.model,"messages":messages,"stream":false,"think":false,"format":schema(),"keep_alive":"5m","options":{"temperature":0.3,"num_ctx":8192,"num_predict":1536}})).send().await.map_err(|_|ApiError::unavailable("Ollamaに接続できません。"))?;
            if !response.status().is_success() {
                return Err(if response.status() == 404 {
                    ApiError::unavailable(
                        "指定したモデルがありません。Ollamaのモデル名を確認してください。",
                    )
                } else {
                    ApiError::upstream(
                        "Ollamaが生成に失敗しました。モデルと空きメモリーを確認してください。",
                    )
                });
            }
            let body = Self::read(response).await?;
            let content = body["message"]["content"]
                .as_str()
                .filter(|s| s.len() <= 24000)
                .ok_or_else(|| ApiError::upstream("モデルの応答が不正です。"))?;
            let trimmed = content
                .trim()
                .strip_prefix("```json")
                .or_else(|| content.trim().strip_prefix("```"))
                .unwrap_or(content.trim())
                .trim_end_matches("```")
                .trim();
            let result = serde_json::from_str(trimmed)
                .map_err(|_| "JSON形式で回答してください。".to_string())
                .and_then(|v| validate_proposal(v, input.current.as_ref()));
            match result {
                Ok((name, description, params)) => {
                    return Ok(
                        json!({"name":name,"description":description,"params":params,"model":self.model}),
                    );
                }
                Err(error) if attempt == 0 => {
                    messages.push(json!({"role":"assistant","content":content}));
                    messages.push(json!({"role":"user","content":format!("Correct JSON: {error}. Use a known safe preset if needed.")}));
                }
                Err(_) => {
                    return Err(ApiError::upstream(
                        "AIの設定から樹木を生成できませんでした。指示を短くして再度お試しください。",
                    ));
                }
            }
        }
        unreachable!()
    }
}
