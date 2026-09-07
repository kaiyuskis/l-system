use crate::model::{Plant, Rule, range};
use glam::{DQuat, DVec3};
use serde::Serialize;

pub const MAX_SYMBOLS: usize = 250_000;
pub const MAX_BRANCHES: usize = 20_000;
pub const MAX_ORGANS: usize = 30_000;
const MAX_DEPTH: usize = 512;
const COMMANDS: &[u8] = b"FfKLM+-&^\\/!\"";
pub type Rules = [Option<Vec<u8>>; 128];
type Result<T> = std::result::Result<T, String>;

struct Expr<'a> {
    s: &'a [u8],
    i: usize,
}
impl Expr<'_> {
    fn peek(&mut self) -> u8 {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
        self.s.get(self.i).copied().unwrap_or(0)
    }
    fn factor(&mut self, depth: usize) -> Result<f64> {
        if depth > 32 {
            return Err("数式の入れ子が深すぎます。".into());
        }
        let c = self.peek();
        if c == b'+' || c == b'-' {
            self.i += 1;
            return Ok(self.factor(depth + 1)? * if c == b'-' { -1. } else { 1. });
        }
        if c == b'(' {
            self.i += 1;
            let v = self.sum(depth + 1)?;
            if self.peek() != b')' {
                return Err("数式の括弧が不正です。".into());
            }
            self.i += 1;
            return Ok(v);
        }
        let start = self.i;
        while self.i < self.s.len() && self.s[self.i].is_ascii_digit() {
            self.i += 1;
        }
        if self.s.get(self.i) == Some(&b'.') {
            self.i += 1;
            while self.i < self.s.len() && self.s[self.i].is_ascii_digit() {
                self.i += 1;
            }
        }
        if matches!(self.s.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.s.get(self.i), Some(b'+' | b'-')) {
                self.i += 1;
            }
            while self.i < self.s.len() && self.s[self.i].is_ascii_digit() {
                self.i += 1;
            }
        }
        std::str::from_utf8(&self.s[start..self.i])
            .unwrap_or("")
            .parse()
            .map_err(|_| "引数は数値と四則演算だけで入力してください。".into())
    }
    fn product(&mut self, depth: usize) -> Result<f64> {
        let mut v = self.factor(depth)?;
        loop {
            let c = self.peek();
            if c != b'*' && c != b'/' {
                break;
            }
            self.i += 1;
            let r = self.factor(depth)?;
            v = if c == b'*' { v * r } else { v / r };
        }
        Ok(v)
    }
    fn sum(&mut self, depth: usize) -> Result<f64> {
        let mut v = self.product(depth)?;
        loop {
            let c = self.peek();
            if c != b'+' && c != b'-' {
                break;
            }
            self.i += 1;
            let r = self.product(depth)?;
            v = if c == b'+' { v + r } else { v - r };
        }
        Ok(v)
    }
}
pub fn parameter(s: &[u8], i: usize) -> Result<(Option<f64>, usize)> {
    if s.get(i + 1) != Some(&b'(') {
        return Ok((None, i + 1));
    }
    let mut depth = 1;
    for end in i + 2..s.len().min(i + 131) {
        if s[end] == b'(' {
            depth += 1;
        } else if s[end] == b')' {
            depth -= 1;
        }
        if depth == 0 {
            let mut e = Expr {
                s: &s[i + 2..end],
                i: 0,
            };
            let v = e.sum(0)?;
            if e.peek() != 0 || !v.is_finite() {
                return Err("引数が不正です。".into());
            }
            return Ok((Some(v), end + 1));
        }
    }
    Err("引数が128文字を超えているか、閉じる括弧がありません。".into())
}
pub fn validate(s: &[u8]) -> Result<()> {
    if s.len() > MAX_SYMBOLS {
        return Err("展開結果が250,000文字を超えます。世代を減らしてください。".into());
    }
    let mut depth = 0;
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        if COMMANDS.contains(&c) {
            let (v, n) = parameter(s, i)?;
            if let Some(v) = v {
                range(
                    v,
                    if b"+-&^\\/".contains(&c) {
                        -100_000.
                    } else {
                        0.
                    },
                    100_000.,
                    "引数",
                )?;
            }
            i = n;
            continue;
        }
        match c {
            b'[' => {
                depth += 1;
                if depth > MAX_DEPTH {
                    return Err("枝の入れ子は512段までです。".into());
                }
            }
            b']' => {
                if depth == 0 {
                    return Err("対応する [ がありません。".into());
                }
                depth -= 1;
            }
            b'|' => (),
            _ if c.is_ascii_alphabetic() || c.is_ascii_whitespace() => (),
            _ => return Err("ルールに使用できない記号があります。".into()),
        }
        i += 1;
    }
    if depth != 0 {
        return Err("枝の [ と ] の数が一致していません。".into());
    }
    Ok(())
}
pub fn parse_rules(rows: &[Rule]) -> Result<Rules> {
    let mut rules: Rules = std::array::from_fn(|_| None);
    let mut size = 0;
    for row in rows {
        let line = row.expression.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (symbol, replacement) = line
            .split_once('=')
            .ok_or("ルールは A=F[+A] の形式で入力してください。")?;
        let symbol = symbol.trim().as_bytes();
        if symbol.len() != 1 || !symbol[0].is_ascii_alphabetic() {
            return Err("ルールの左辺は英字1文字です。".into());
        }
        let slot = &mut rules[symbol[0] as usize];
        if slot.is_some() {
            return Err("ルールの記号が重複しています。".into());
        }
        let replacement = replacement.trim().as_bytes();
        size += replacement.len();
        if size > MAX_SYMBOLS {
            return Err("ルールが長すぎます。".into());
        }
        validate(replacement)?;
        *slot = Some(replacement.to_vec());
    }
    Ok(rules)
}
fn rewrite(s: &[u8], rules: &Rules) -> Result<Vec<u8>> {
    let mut next = Vec::with_capacity((s.len() * 2).min(MAX_SYMBOLS));
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        let replacement = rules
            .get(c as usize)
            .and_then(Option::as_ref)
            .map(Vec::as_slice)
            .unwrap_or(&s[i..i + 1]);
        let end = if COMMANDS.contains(&c) {
            parameter(s, i)?.1
        } else {
            i + 1
        };
        let suffix = if replacement.is_empty() {
            &s[0..0]
        } else {
            &s[i + 1..end]
        };
        if next.len() + replacement.len() + suffix.len() > MAX_SYMBOLS {
            return Err("展開結果が250,000文字を超えます。".into());
        }
        next.extend_from_slice(replacement);
        next.extend_from_slice(suffix);
        i = end;
    }
    Ok(next)
}
pub fn expand(premise: &str, rules: &Rules, generations: u32) -> Result<Vec<u8>> {
    if generations > 16 {
        return Err("世代数が大きすぎます。".into());
    }
    validate(premise.as_bytes())?;
    let mut s = premise.as_bytes().to_vec();
    for _ in 0..generations {
        let next = rewrite(&s, rules)?;
        if next == s {
            break;
        }
        s = next;
    }
    validate(&s)?;
    Ok(s)
}
// One incremental pass; no repeated expansion from generation zero.
pub fn generation_limit(premise: &str, rules: &Rules) -> u32 {
    let mut s = premise.as_bytes().to_vec();
    let mut limit = 0;
    for generation in 0..=10 {
        if validate(&s).is_err()
            || s.iter().filter(|c| **c == b'F').count() > MAX_BRANCHES
            || s.iter()
                .filter(|c| b'L' == **c || b'K' == **c || b'M' == **c)
                .count()
                > MAX_ORGANS
        {
            break;
        }
        limit = generation;
        match rewrite(&s, rules) {
            Ok(next) if next == s => return 10,
            Ok(next) => s = next,
            Err(_) => break,
        }
    }
    limit
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub rotation: [f64; 4],
    pub radius_bottom: f64,
    pub radius_top: f64,
}
#[derive(Clone, Serialize)]
pub struct Organ {
    pub position: [f64; 3],
    pub rotation: [f64; 4],
    pub scale: f64,
    pub thickness: f64,
}
#[derive(Clone, Default, Serialize)]
pub struct Geometry {
    pub branches: Vec<Branch>,
    pub leaves: Vec<Organ>,
    pub flowers: Vec<Organ>,
    pub buds: Vec<Organ>,
}
#[derive(Clone, Copy)]
struct Turtle {
    position: DVec3,
    rotation: DQuat,
    length: f64,
    width: f64,
}
struct Rng(u64);
impl Rng {
    fn new(seed: u32) -> Self {
        Self((seed as u64 % 2_147_483_647).max(1))
    }
    fn next(&mut self) -> f64 {
        self.0 = self.0 * 16_807 % 2_147_483_647;
        (self.0 - 1) as f64 / 2_147_483_646.
    }
}
// Match Three.js's shortest-arc quaternion, including the antiparallel case.
pub fn unit_rotation(from: DVec3, to: DVec3) -> DQuat {
    let r = from.dot(to) + 1.;
    if r < f64::EPSILON {
        if from.x.abs() > from.z.abs() {
            DQuat::from_xyzw(-from.y, from.x, 0., 0.).normalize()
        } else {
            DQuat::from_xyzw(0., -from.z, from.y, 0.).normalize()
        }
    } else {
        let c = from.cross(to);
        DQuat::from_xyzw(c.x, c.y, c.z, r).normalize()
    }
}
pub fn geometry(s: &[u8], p: &Plant) -> Result<Geometry> {
    validate(s)?;
    let ratio = if p.growth_mode {
        (p.generations as f64 / 10.).min(1.)
    } else {
        1.
    };
    let init_len = p.max_length * ratio;
    let mut t = Turtle {
        position: DVec3::ZERO,
        rotation: DQuat::IDENTITY,
        length: 1.,
        width: p.max_thickness * ratio * ratio,
    };
    let mut stack = Vec::new();
    let mut rng = Rng::new(p.seed);
    let mut data = Geometry::default();
    let mut organ_count = 0;
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        let (explicit, next) = if COMMANDS.contains(&c) {
            parameter(s, i)?
        } else {
            (None, i + 1)
        };
        i = next;
        let value = explicit.unwrap_or(match c {
            b'F' | b'f' => init_len * t.length,
            b'L' => p.leaf_size,
            b'K' => p.flower_size,
            b'M' => p.bud_size,
            b'!' | b'"' => p.scale,
            _ => p.angle,
        });
        match c {
            b'F' | b'f' => {
                range(value, 0., 100_000., "枝の長さ")?;
                if value == 0. {
                    continue;
                }
                if p.gravity != 0. && c == b'F' {
                    let heading = (t.rotation * DVec3::Y).normalize();
                    let target = DVec3::new(0., -p.gravity.signum(), 0.);
                    let strength =
                        (p.gravity.abs() * 0.05 / ((t.width * 5.).powi(2) + 1.)).min(0.2);
                    let next = heading.lerp(target, strength).normalize();
                    t.rotation = (unit_rotation(heading, next) * t.rotation).normalize();
                }
                let start = t.position;
                t.position += (t.rotation * DVec3::Y) * value;
                for coordinate in t.position.to_array() {
                    range(coordinate, -100_000., 100_000., "モデルの座標")?;
                }
                if c == b'F' {
                    let top = range(t.width * p.width_decay, 0., 100_000., "枝の太さ")?;
                    if t.width > 0. {
                        if data.branches.len() >= MAX_BRANCHES {
                            return Err("枝が20,000本を超えます。".into());
                        }
                        data.branches.push(Branch {
                            start: start.to_array(),
                            end: t.position.to_array(),
                            rotation: t.rotation.to_array(),
                            radius_bottom: t.width,
                            radius_top: top,
                        });
                    }
                    t.width = top;
                }
            }
            b'L' | b'K' | b'M' => {
                range(value, 0., 100_000., "器官のサイズ")?;
                if value == 0. {
                    continue;
                }
                organ_count += 1;
                if organ_count > MAX_ORGANS {
                    return Err("器官が30,000個を超えます。".into());
                }
                let v = Organ {
                    position: t.position.to_array(),
                    rotation: t.rotation.to_array(),
                    scale: value,
                    thickness: t.width,
                };
                match c {
                    b'L' => data.leaves.push(v),
                    b'K' => data.flowers.push(v),
                    _ => data.buds.push(v),
                }
            }
            b'+' | b'-' | b'&' | b'^' | b'\\' | b'/' => {
                let axis = if b"+-".contains(&c) {
                    DVec3::Z
                } else if b"&^".contains(&c) {
                    DVec3::X
                } else {
                    DVec3::Y
                };
                let sign = if b"+^/".contains(&c) { -1. } else { 1. };
                let angle = sign * (value + (rng.next() * 2. - 1.) * p.angle_variance);
                t.rotation =
                    (t.rotation * DQuat::from_axis_angle(axis, angle.to_radians())).normalize();
            }
            b'|' => {
                t.rotation = (t.rotation * DQuat::from_rotation_z(std::f64::consts::PI)).normalize()
            }
            b'!' => t.width = range(t.width * value, 0., 100_000., "枝の太さ")?,
            b'"' => t.length = range(t.length * value, 0., 100_000., "枝の長さ倍率")?,
            b'[' => stack.push(t),
            b']' => t = stack.pop().ok_or("枝の括弧が不正です。")?,
            _ => (),
        }
    }
    Ok(data)
}
pub fn generate(p: &Plant) -> Result<(Vec<u8>, Geometry, u32)> {
    p.validate()?;
    let rules = parse_rules(&p.rules)?;
    let s = expand(&p.premise, &rules, p.generations)?;
    let data = geometry(&s, p)?;
    let limit = generation_limit(&p.premise, &rules);
    Ok((s, data, limit))
}
