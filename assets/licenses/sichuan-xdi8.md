# 四川话与希顶语字典

## 四川话（成都音）

`js/data/zh-x-sichuan.js` 的成都话单字读音取自 GiantAILab/DiaMoE-TTS 的 `dialect_frontend/frontend/dialect/chengdu/hanzi.xlsx`（MIT 许可），结合 `js/data/zh.js` 默认读音消歧多音字、补充简繁字形与常用四川口语用字，并对字表外生僻汉字按普通话—成都话音韵对应推导。完整 MIT 许可声明保留在字表文件头。 [上游仓库](https://github.com/GiantAILab/DiaMoE-TTS) · [上游许可](https://github.com/GiantAILab/DiaMoE-TTS/blob/main/LICENSE)

## 希顶语（Shidinn / Xdi8）

`js/data/xdi8.js` 的汉字转希顶聊天字母字表取自 DGCK81LNN/xdi8-transcriber 的 `data/dict.tsv`（MIT 许可），过滤旧拼写与例外读音并保留常用单字对应与简繁字形。希顶字母 PUA 编码映射亦参考该项目 `package/src/encoding.ts`；45 字母音值规则参考社区通行的希顶语音系国际音标分析及 yuanhao-chen-nyoeghau/Xdi8Translator（MIT 许可）。 [xdi8-transcriber 仓库](https://github.com/DGCK81LNN/xdi8-transcriber) · [Xdi8Translator 仓库](https://github.com/yuanhao-chen-nyoeghau/Xdi8Translator)
