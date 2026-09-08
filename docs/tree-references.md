# 樹木モデルの参考資料

2026-09-08。ユーザー提供の松の近接写真を主基準とし、以下の写真も実際に表示して枝ぶりを比較した。参照写真はアプリのテクスチャには使用していない。

## クロマツ

[森林総合研究所 関西支所 — クロマツ](https://www.ffpri.go.jp/fsm/business/jumokuen/02_ka/kuromatu.html)

![森林総研のクロマツ。横枝の層と枝先の針葉を確認](https://www.ffpri.go.jp/fsm/business/jumokuen/02_ka/documents/kuromatu2.jpg)

観察点: 幹から水平に広がる主枝、短い小枝の繰り返し、葉のない古枝と枝先の葉の分離。剪定された個体なので、自然樹のすべてにこの樹形が当てはまるわけではない。

[Gymnosperm Database — Pinus thunbergii](https://www.conifers.org/pi/Pinus_thunbergii.php) は形態の照合に使用。二葉の針葉、灰黒色の割れた樹皮、成熟した広い樹冠を生成の要件とした。

## イロハモミジ

[Boomkwekerij De Bruyn — Acer palmatum](https://catalog.vangoidsenhoven.be/plantenboek/acer-palmatum/)

![モミジの幹と放射状に広がる太い分岐](https://catalog.vangoidsenhoven.be/content/uploads/2025/03/ACPALMAT_0002_P-1024x591.jpg)

観察点: 幹と主枝の太い分岐、上方だけでなく横へ広がる枝、細枝に向かう径の減衰。低い位置から分岐する樹種別のパラメトリック成長規則と、葉柄付きの7裂葉を生成する。

## シラカバ・サクラ・シダ

- [NC State Plant Toolbox — Betula platyphylla var. japonica](https://plants.ces.ncsu.edu/plants/betula-platyphylla-var-japonica/): 白い主幹、斜上する枝、外側の細枝の垂れ方を参照。
- [Oregon State — Prunus ‘Tai Haku’](https://landscapeplants.oregonstate.edu/plants/prunus-tai-haku): 開花時の樹冠と、花柄・5枚の花弁・花のまとまりを参照。特定の栽培品種を厳密に再現するモデルではない。
- [UF/IFAS — Dryopteris erythrosora](https://ask.ifas.ufl.edu/publication/FP189): 弓状の葉軸と二回羽状の葉を参照。根元から開く葉軸、左右の羽片、さらに小羽片へ分割する。

## 配信するテクスチャ

- `web/public/textures/pine-bark.png`: この作業で画像生成したクロマツの灰色の板状樹皮。1,254 × 1,254 px。外部の樹木写真を切り出して作ったものではない。
- `birch-bark.png`・`maple-bark.png`・`cherry-bark.png`もこの作業で画像生成した樹種別の樹皮。葉と花は葉脈・折れ・鋸歯・花弁を持つ立体メッシュとして生成する。
- 幹と古枝の周方向・長さ方向に連続したUVを与え、色と凹凸に使用。
- 松の葉は画像ではなく、二本を一組にした曲がった三角断面の針葉。1房80本の共有メッシュを枝先へ配置する。
- 外部の参考写真の著作権は各出典に帰属。再配布用アセットへは含めていない。
