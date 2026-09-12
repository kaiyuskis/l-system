use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Rule {
    pub expression: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plant {
    #[serde(default = "classic_model")]
    pub growth_model: String,
    #[serde(default = "one")]
    pub crown_spread: f64,
    #[serde(default = "one")]
    pub branch_twist: f64,
    #[serde(default = "one")]
    pub foliage_density: f64,
    #[serde(default = "one")]
    pub needle_length: f64,
    pub growth_mode: bool,
    pub max_length: f64,
    pub max_thickness: f64,
    pub init_length: f64,
    pub init_thickness: f64,
    pub generations: f64,
    pub angle: f64,
    pub angle_variance: f64,
    pub seed: u32,
    pub gravity: f64,
    pub scale: f64,
    pub width_decay: f64,
    pub branch_color: String,
    pub leaf_color: String,
    pub flower_color: String,
    pub bud_color: String,
    pub leaf_texture_key: String,
    pub leaf_size: f64,
    pub flower_size: f64,
    pub bud_size: f64,
    pub premise: String,
    pub rules: Vec<Rule>,
}
fn classic_model() -> String { "lsystem".into() }
fn one() -> f64 { 1. }
pub fn range(value: f64, min: f64, max: f64, label: &str) -> Result<f64, String> {
    if value.is_finite() && (min..=max).contains(&value) {
        Ok(value)
    } else {
        Err(format!("{label}は {min}〜{max} の有限の数にしてください。"))
    }
}
pub fn color(value: &str) -> bool {
    value.starts_with('#')
        && [4, 7].contains(&value.len())
        && value[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
impl Plant {
    pub fn validate(&self) -> Result<(), String> {
        if !["lsystem", "pine", "birch", "maple", "sakura", "fern", "oak", "willow", "spruce", "ginkgo"].contains(&self.growth_model.as_str()) {
            return Err("生成方式が不正です。".into());
        }
        for (value, min, max, label) in [
            (self.crown_spread, 0.3, 2., "樹冠の広がり"),
            (self.branch_twist, 0., 2., "枝の曲がり"),
            (self.foliage_density, 0., 2., "針葉の密度"),
            (self.needle_length, 0.3, 2., "針葉の長さ"),
            (self.max_length, 0.01, 5., "枝の長さ"),
            (self.init_length, 0., 5., "現在の枝の長さ"),
            (self.max_thickness, 0.005, 2., "幹の太さ"),
            (self.init_thickness, 0., 2., "現在の幹の太さ"),
            (self.angle, 0., 180., "枝分かれの角度"),
            (self.angle_variance, 0., 45., "ゆらぎ"),
            (self.gravity, -10., 10., "重力"),
            (self.scale, 0., 2., "長さの減衰"),
            (self.width_decay, 0., 1., "太さの減衰"),
            (self.leaf_size, 0., 5., "葉のサイズ"),
            (self.flower_size, 0., 5., "花のサイズ"),
            (self.bud_size, 0., 5., "つぼみのサイズ"),
        ] {
            range(value, min, max, label)?;
        }
        if !self.generations.is_finite() || self.generations < 0. || self.generations > if self.growth_model == "lsystem" { 12. } else { crate::growth::LIMIT as f64 } {
            return Err("世代がモデルの上限を超えています。".into());
        }
        if self.growth_model == "lsystem" && self.generations.fract() != 0. { return Err("自由なL-systemの世代は整数にしてください。".into()); }
        if [
            &self.branch_color,
            &self.leaf_color,
            &self.flower_color,
            &self.bud_color,
        ]
        .iter()
        .any(|v| !color(v))
        {
            return Err("色はHEX形式で指定してください。".into());
        }
        if !["leaf_default", "leaf_maple", "pine_needles", "leaf_birch", "leaf_cherry", "fern_pinnule", "leaf_oak", "leaf_willow", "spruce_needles", "leaf_ginkgo"].contains(&self.leaf_texture_key.as_str()) {
            return Err("葉のテクスチャが不正です。".into());
        }
        if self.premise.trim().is_empty()
            || self.premise.len() > 4096
            || self.rules.len() > 26
            || self.rules.iter().any(|r| r.expression.len() > 4096)
        {
            return Err("公理・ルールが長すぎるか空です。".into());
        }
        Ok(())
    }
}
pub fn presets() -> &'static Value {
    static PRESETS: OnceLock<Value> = OnceLock::new();
    PRESETS.get_or_init(|| {
        serde_json::from_str(include_str!("../../shared/presets.json")).expect("bundled presets")
    })
}
