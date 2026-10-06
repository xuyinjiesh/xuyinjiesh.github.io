# 音频素材署名与版权说明

站点的音频分两类，来源与许可如下。凡使用 CC 许可的素材，均须按许可保留署名；本文件是署名的权威出处，
站内聊天框输入「音乐 / 音效 / 致谢 / credit」会给出同一份信息的摘要。

背景音乐全部是**远程直链**（写在 `js/themes.js` 各主题的 `music` 字段里），没有随仓库分发：
版权仍归各录音者 / 演奏者所有，站点只做在线播放。远程链接失效时 `js/audio.js` 会依次回退到
`assets/audio/<主题>.mp3` → `assets/audio/default.mp3`，都不存在就是静音。

最后核对：2026-10-06。

## 1. 本地音效（assets/audio/）

### rain.wav

- 名称："Rain on Windows, Interior, A.wav"
- 作者：InspectorJ (www.jshaw.co.uk)
- 来源：https://freesound.org/people/InspectorJ/sounds/346642/
- 许可：CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）
- 本地处理：立体声转单声道、重采样至 22050 Hz、首尾 0.05s 淡变（便于循环）
- 署名（CC BY 4.0 要求）："Rain on Windows, Interior, A.wav" by InspectorJ，来自 Freesound.org，CC BY 4.0

## 2. 主题背景音乐（远程直链）

| 主题 | 曲目 | 演奏 / 来源 | 许可 | 署名 |
| --- | --- | --- | --- | --- |
| `spring-festival` 春节 | Pixabay 曲库音频 | Pixabay | Pixabay Content License | 不强制 |
| `summer` 夏日 | Debussy《Prélude à l'après-midi d'un faune》（牧神午后前奏曲） | Musopen | 公共领域（Public Domain） | 不强制 |
| `autumn` 秋日 | Satie《Gnossienne No. 1》 | Gregor Quendel / Classicals.de | CC BY-NC 4.0 | **必须** |
| `winter` 冬日 | Debussy《Préludes, Livre 1 - 6. Des pas sur la neige》（雪上足迹） | Gregor Quendel / Classicals.de | CC BY-NC 4.0 | **必须** |
| `xmas` 圣诞 | J.S. Bach《Wachet auf, ruft uns die Stimme》BWV 645（Schübler 众赞歌第 1 首） | James Kibbie（管风琴） | CC BY-NC-ND 3.0 | **必须** |
| `night` 深夜 | Pixabay 曲库音频 | Pixabay | Pixabay Content License | 不强制 |

### spring-festival（春节）/ night（深夜）— Pixabay

- 曲目：Pixabay 曲库音频（下载得到的是不带 ID3 信息的裸 mp3，无法从文件反查标题；如需精确署名请在
  Pixabay 后台「我的下载」里查看当时下载的曲目页）
- 直链：
  - 春节：https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3
  - 深夜：https://cdn.pixabay.com/audio/2025/09/27/audio_6813e09c43.mp3
- 来源：Pixabay（https://pixabay.com）
- 许可：Pixabay Content License（https://pixabay.com/service/license-summary/）
- 要求：可免费用于商业与非商业用途，无需署名（署名仍受欢迎）；**不得**把音频原样作为独立素材再分发或转售。

### summer（夏日）— Debussy / Musopen

- 曲目：Claude Debussy《Prélude à l'après-midi d'un faune》（1894，作曲已进入公共领域）
- 直链：https://dl.musopen.org/recordings/85484622-ca89-44b4-aa6e-7d1607abe1cf.mp3?filename=2688_prelude-to-the-afternoon-4f784f81-2089-4ac4-9378-8c84eee06168.mp3
- 来源：Musopen（https://musopen.org）
- 许可：公共领域（Public Domain）。Musopen 的定位是公共领域曲库，其条款要求上传者声明「作品与录音均已进入
  公共领域」（https://musopen.org/faq/ ，见 "What content on Musopen can I use and reuse elsewhere?"）；
  但平台**不逐一核验**上传内容，如用于重要场合建议自行再确认。
- 要求：公共领域作品可自由使用（含商业用途），无须署名。
- 备注：`dl.musopen.org` 位于 Cloudflare 之后。本次核对是在命令行（数据中心 IP）抓取的，无论是否伪装浏览器 UA
  都返回 403 challenge——这是抓取环境的典型拦截，**不代表浏览器里也播不了**，但请在浏览器中实测一次；
  一旦该直链被拦，`js/audio.js` 会回退到并不存在的 `assets/audio/summer.mp3`，结果就是这一首静音，
  届时换一个更稳的直链（例如同样来自 Musopen / Internet Archive 的镜像）。

### autumn（秋日）— Satie《Gnossienne No. 1》

- 曲目：Erik Satie《Gnossienne No. 1》（1890，作曲已进入公共领域）
- 录音：Gregor Quendel 录制、制作、发布
- 编曲底本：钢琴改编出自已故 Hiroshi Munekawa（原发布于 Piano1001.com，该站声明允许任何非商业的使用、
  处置与再分发）。这一首实际涉及两个权利人，署名时最好把改编者也带上：改编 Hiroshi Munekawa / 录音 Gregor Quendel
- 直链：https://library.classicalmusicarchive.org/music/HM%20Collection/Classicals.de%20-%20Satie%20-%20Gnossienne%20No.%201.mp3
- 曲目页：https://www.classicals.de/satie-gymnopedies-gnossiennes
- 来源：Classicals.de（https://www.classicals.de），音频文件由 library.classicalmusicarchive.org 分发
- 许可：CC BY-NC 4.0（https://creativecommons.org/licenses/by-nc/4.0/）
- 要求：**必须署名**；**仅限非商业**用途；改编需保留同样许可并注明改动。商业用途需另行取得
  Classicals.de 的商业授权（https://www.classicals.de/licensing）。
- 署名格式（站方建议格式）：
  `Music: "Gnossienne No. 1" by Gregor Quendel / Classicals.de — Source: https://www.classicals.de — CC BY-NC 4.0`

### winter（冬日）— Debussy《Des pas sur la neige》

- 曲目：Claude Debussy《Préludes, Livre 1 - 6. Des pas sur la neige》（L.117，作曲已进入公共领域）
- 录音：Gregor Quendel 录制、制作、发布（© 2025 Classicals.de 独家录音）
- 编曲底本：同上一首，钢琴改编出自 Hiroshi Munekawa（Piano1001.com，非商业自由使用）
- 直链：https://library.classicalmusicarchive.org/music/HM%20Collection/Classicals.de%20-%20Debussy%20-%20Preludes%2C%20Livre%201%20-%206.%20Des%20pas%20sur%20la%20neige%20-%20L.117.mp3
- 曲目页：https://www.classicals.de/debussy-preludes
- 来源：Classicals.de（https://www.classicals.de）
- 许可：CC BY-NC 4.0（https://creativecommons.org/licenses/by-nc/4.0/）
- 要求：同上一首（署名 + 非商业；商业用途需另行授权）。
- 署名格式：
  `Music: "Préludes, Livre 1 - 6. Des pas sur la neige" by Gregor Quendel / Classicals.de — Source: https://www.classicals.de — CC BY-NC 4.0`

### xmas（圣诞）— Bach BWV 645 / James Kibbie

- 曲目：Johann Sebastian Bach《Wachet auf, ruft uns die Stimme》BWV 645（作曲已进入公共领域）
- 演奏：Dr. James Kibbie，在德国多台巴洛克原琴上录制；密歇根大学音乐学院项目
  （原始项目页 http://www.blockmrecords.org/bach ，由 University of Michigan 资助）
- 直链：https://archive.org/download/BachOrganWorksByJamesKibbie/BWV0645.m4a
- 来源：Internet Archive 条目
  https://archive.org/details/BachOrganWorksByJamesKibbie
  （"Bach Organ Works: The Complete Organ Works of J.S. Bach"）
- 许可：CC BY-NC-ND 3.0（http://creativecommons.org/licenses/by-nc-nd/3.0/），条目页面的 `licenseurl` 字段即为此值
- 要求：**必须署名**；**仅限非商业**用途；**不得改编**（NoDerivatives——不要剪辑、变速、混音或做二次创作，
  原样循环播放属于复制/分发，不构成改编）。
- 署名格式：
  `"Wachet auf, ruft uns die Stimme" BWV 645 by J.S. Bach, performed by James Kibbie — via Internet Archive — CC BY-NC-ND 3.0`

## 3. 使用注意

- **非商业限制**：`autumn`、`winter`（CC BY-NC 4.0）与 `xmas`（CC BY-NC-ND 3.0）只允许非商业用途。
  只要本站保持个人主页性质（无广告、赞助、带货、付费内容），即符合条件；一旦转向任何商业用途，必须替换这三首
  或分别取得商业授权。
- **不要归档进仓库**：这三首同样不允许把录音文件下载后随站点再分发（NC/ND 会因此被破坏）。保持远程直链播放即可。
- **Pixabay**：无须署名，但禁止把音频原样当作素材再次分发/转售。
- **本地音效**仅有 `rain.wav` 与 `fireworks-*.wav`（程序化/自备音效），其中 `rain.wav` 的 CC BY 4.0 署名必须保留。
- 新增背景音乐时，请在本文件的表格与对应小节补一行，说明「曲目 / 演奏 / 来源 / 许可 / 是否须署名」，并同步
  `js/content.js` 中「音乐 / 致谢」关键词的回复。
