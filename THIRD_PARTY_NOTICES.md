# 第三方资源与署名

## 随包代码

| 文件 | 来源与许可 |
| --- | --- |
| `js/fflate.js` | Arjun Barrett 的 fflate v0.8.2，MIT。完整许可保留在文件头。 [上游许可](https://github.com/101arrowz/fflate/blob/v0.8.2/LICENSE) |
| `js/fzstd.js` | Arjun Barrett 的 fzstd v0.1.1，MIT。完整许可保留在文件头。 [上游许可](https://github.com/101arrowz/fzstd/blob/v0.1.1/LICENSE) |
| `js/project-imports.js` 的格式结构与坐标换算 | 参考 SoulMelody/LibreSVIP，MIT。DeepVocal 的速度坐标另参考 UtaFormatix3 的格式实现。 [LibreSVIP 源码](https://github.com/SoulMelody/LibreSVIP/tree/498291b2cb3b731b5bffdc8fe811d7451cb9c3bd/libresvip/plugins) · [LibreSVIP 许可](assets/licenses/libresvip-mit.txt) · [UtaFormatix3 格式实现](https://github.com/sdercolin/utaformatix3/blob/master/core/src/main/kotlin/core/io/Dv.kt) |
| `js/g2p.js` 的 Asaxi 正字法映射 | 参考 wik-wav/asaxi-diffsinger，CC0 1.0。 [上游许可](https://github.com/wik-wav/asaxi-diffsinger/blob/main/LICENSE) |

## 离线字典

| 文件 | 来源与许可 |
| --- | --- |
| `js/data/en.js` | Carnegie Mellon University 的 CMUdict。完整版权和许可声明保留在文件头。 [上游许可](https://github.com/cmusphinx/cmudict/blob/master/LICENSE) |
| `js/data/ja.js` | Unicode 17.0.0 Unihan `kJapaneseOn` 日语音读数据。按汉字打包。 [来源](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip) · [Unicode License V3 全文](assets/licenses/unicode-v3.txt) |
| `js/data/yue.js` 中的 Unihan 数据 | Unicode 17.0.0 Unihan `kCantonese` 粤语读音数据。按汉字打包。 [来源](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip) · [Unicode License V3 全文](assets/licenses/unicode-v3.txt) |
| `js/data/de.js` | Wiktionary 贡献者及 devio-at 的德语读音资料，派生字典按 CC BY-SA 4.0 提供。 [版本、署名与转换说明](assets/licenses/german-dictionary.md) |
| `js/data/th.js` | Wiktionary 贡献者及 PyThaiNLP 的泰语读音资料，派生字典按 CC BY-SA 3.0 提供。 [版本、署名与转换说明](assets/licenses/thai-dictionary.md) |
| `js/data/nan-x-teochew.js` | lim_iong_puan 的 pyPengIm 府城音字表，BSD-3-Clause。完整版权和许可声明保留在文件头。 [版本、署名与转换说明](assets/licenses/hakka-teochew.md#潮州府城音) |
| `js/data/zh-x-sichuan.js` | GiantAILab/DiaMoE-TTS 的成都话单字读音表，MIT。完整许可声明保留在文件头。 [来源与转换说明](assets/licenses/sichuan-xdi8.md#四川话成都音) |
| `js/data/xdi8.js` | DGCK81LNN/xdi8-transcriber 的汉字—希顶字表，MIT；希顶语拼读音系规则参考社区国际音标分析与 yuanhao-chen-nyoeghau/Xdi8Translator（MIT）。 [来源与转换说明](assets/licenses/sichuan-xdi8.md#希顶语shidinn--xdi8) |

## 背景与示例曲谱

- `assets/bg/` 的 9 张 SVG 背景通过 Recraft API 生成。Recraft API 资产受开发者条款约束，其中第 6.2 节限制将输出用于 AI 训练。 [Recraft 开发者条款](https://www.recraft.ai/legal/developer-terms)
- `assets/demo-project.js` 的示例曲谱取自歌剧《芳草心》主题曲《小草》。向彤、何兆华作词，王祖皆、张卓娅作曲。 [原作者访谈](https://www.chinawriter.com.cn/n1/2020/0305/c405057-31617478.html)
