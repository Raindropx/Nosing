/* ==========================================================================
   NSG · 自动谱曲（眼睛谱曲法） / 自动编曲
   谱曲规则（硬性）：
     1. 实词走高音阶，虚词走低音阶
     2. 两句一组，一长一短
     3. 句子的音高轮廓由一条「眼睛曲线」决定：拱形，峰偏左，
        多只眼睛可以连成上—下—上
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['compose'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  if (!NSG.Instruments && typeof require === 'function') require('./instruments.js');
  var C = NSG.COMPOSE = {};

  /* 虚词表：出现在这些表里的音节降级处理 */
  var FUNC = {
    hak: '𠊎 你 佢 个 係 毋 無'.split(' '),
    'nan-x-teochew': '我 汝 伊 个 是 呾 无 無'.split(' '),
    'zh-x-sichuan': '的 地 得 了 着 过 在 是 和 跟 同 就 也 都 很 又 还 再 才 只 不 没 别 会 能 要 可 把 被 给 吗 呢 吧 啊 呀 嘛 噻 哈 咯 咧 哦 我 你 他 她 它 这 那 啥 咋 个 些'.split(' '),
    xdi8: 'de sE bA wo Vnu8 的 地 得 了 着 过 在 是 和 就 也 都 很 不 没 我 你 他 她 它 这 那 吗 呢 吧 啊'.split(' '),
    eo: 'la kaj aŭ sed de da al el en kun sen por per pri sur sub ĉe ĝis je ke se do mi vi li ŝi ĝi ni ili si ne'.split(' '),
    tok: ('li e la pi o en anu taso kin').split(/\s+/),
    asaxi: [], // 词类需词典判定；不沿用普通话虚词表。
    es: 'a al con de del el en la las los lo no o para por que se si sin su un una y yo'.split(' '),
    pt: 'a ao as com da das de do dos e ela ele em eu na nas no nos não o os ou para por que se sem um uma'.split(' '),
    it: 'a al che con da dal di e gli i il in io la le lo ma ne non o per se su tra un una'.split(' '),
    fr: 'à au aux avec ce ces dans de des du elle en et il je la le les leur lui mais ne nous on ou par pas pour que se sans sur tu un une vous'.split(' '),
    ro: 'a al ale ca că cu de din ea ei el eu în la le lui mai mă ne nu o pe pentru să se și te tu un una'.split(' '),
    fil: 'ako ang at ay ba dahil di doon dito ikaw ito ka ko kung lang mga mo na naman nang natin nga ng ni nila pa para pero po sa siya tayo'.split(' '),
    id: 'ada agar aku atau bagi dan dari dengan di dia ini itu jangan jika juga ke kamu lebih oleh pada saja saya sebagai sudah tak tapi telah tidak untuk yang'.split(' '),
    ms: 'ada agar aku atau bagi dan dari dengan di dia ini itu jika juga ke kamu lebih oleh pada pun sahaja saya sebagai sudah tak tetapi telah tidak untuk yang'.split(' '),
    th: 'ก็ กับ ของ เขา จะ ฉัน ซึ่ง ด้วย ได้ แต่ ที่ เธอ ใน นี้ นั้น เป็น เพราะ เพื่อ ไม่ เรา และ ว่า ให้ อยู่'.split(' '),
    ko: ('은 는 이 가 을 를 에 의 와 과 도 만 로 나 너 그 저 것 수').split(/\s+/),
    vi: ('và là của ở với cho mà thì đã đang sẽ một những các tôi bạn').split(/\s+/),
    zh: ('的 地 得 了 着 过 在 是 和 与 及 或 而 但 因为 所以 就 也 都 很 又 还 再 才 只 更 最 不 没 别 会 能 要 可 已 将 正 被 把 从 到 对 向 让 使 吗 呢 吧 啊 呀 嘛 哦 我 你 他 她 它 我们 你们 他们 这 那 之 其 以 于 为 跟 同 给 叫 得 一 个 些 位 只 条 张 次 遍 上下 里 中 外 前 后 时 候 么 呗 咯').split(/\s+/),
    yue: ('嘅 咗 喺 係 同 埋 嘅 都 又 仲 先 至 就 啫 啦 喇 咩 呀 嘅 佢 我 你 你哋 佢哋 呢 嗰 咁 咁樣 唔 冇 會 要 可以 已經 將 俾 從 到 對 向 令 使 咩 咧 囉 咯 嘛 一 個 啲').split(/\s+/),
    ja: ('の は が を に で と も へ や か ね よ な だ です ます た て で から まで より ので けど ても しか ばかり など これ それ あれ 私 あなた 彼 彼女 この その あの いる ある する なる').split(/\s+/),
    en: ('a an the of to in on at for with and or but if then than that this these those is are was were be been am do does did have has had i you he she it we they me him her us them my your his its our their not no so as by from up out about into over after before just very can will would should could may might must').split(/\s+/),
    de: ('der die das den dem des ein eine einer einem einen eines und oder aber denn sondern in im an am auf aus bei mit nach seit von vom zu zum zur für ohne um durch gegen über unter vor hinter neben zwischen ich du er sie es wir ihr mich dich ihn uns euch mir dir ihm ihnen mein dein sein unser euer nicht kein ja nein so wie als wenn weil dass ob schon noch nur auch sehr').split(/\s+/),
    pl: ('i w na z ze do od po o u za dla bez przez przy nad pod przed między a ale lecz lub czy bo że jak gdy już jeszcze tylko też bardzo nie tak to ten ta te tego tej tym tych ja ty on ona ono my wy oni one mnie cię go jej nas was ich mój twój swój nasz wasz jest są był była było będzie').split(/\s+/),
    ru: ('и в во на с со к ко от до из за по о об обо у для без через при над под перед между а но или ли что чтобы как когда уже ещё только тоже очень не ни да нет это этот эта эти тот та те я ты он она оно мы вы они меня тебя его её нас вас их мой твой свой наш ваш был была было были будет').split(/\s+/),
    uk: ('і й та в у на з зі із до від по о об про для без через при над під перед між а але чи або що щоб як коли вже ще тільки теж дуже не ні так це цей ця ці той та те я ти він вона воно ми ви вони мене тебе його її нас вас їх мій твій свій наш ваш є був була було були буде').split(/\s+/),
    fi: 'ja tai vai sekä mutta että jos kun kuin niin myös ei en et on olen olet oli minä sinä hän me te he se ne'.split(' '),
    nan: ('的 矣 啊 咧 啦 嘛 佇 佇咧 是 佮 抑 若 但是 因為 所以 就 也 攏 真 閣 猶 才 乾若 上 下 裡 中 外 前 後 時 陣 个 个 我 你 伊 阮 恁 怹 這 彼 之 予 對 向 予 使 嗎 呢 啦 喔 矣').split(/\s+/)
  };
  var FUNC_SET = {};
  Object.keys(FUNC).forEach(function (k) { FUNC_SET[k] = {}; FUNC[k].forEach(function (w) { FUNC_SET[k][w] = 1; }); });

  function isFunc(word, lang) {
    var set = FUNC_SET[lang] || FUNC_SET.zh;
    if (set[word]) return true;
    if (word.length === 1 && set[word]) return true;
    return false;
  }

  /* 五声音阶（大调）：0 2 4 7 9；另附大调、自然小调 */
  var PENTA = [0, 2, 4, 7, 9];
  C.SCALES = {
    penta: PENTA,
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
  };
  function scaleDeg(rootMidi, step) {
    var oct = Math.floor(step / 5), idx = ((step % 5) + 5) % 5;
    return rootMidi + oct * 12 + PENTA[idx];
  }
  C.degToMidi = function (rootMidi, degs, step) {
    var L = degs.length, oct = Math.floor(step / L), idx = ((step % L) + L) % L;
    return rootMidi + oct * 12 + degs[idx];
  };

  /* ======================================================================
     眼睛曲线
     ----------------------------------------------------------------------
     一只眼睛 = 一条弓形轮廓，字段与 DSC 工程的「眼睛数组」一一对应，
     这样导入的 DSC 眼睛曲线可以直接塞进来编辑：
       开始 / 峰的时间 / 结束   横向位置（0–1，按句子长度归一）
       峰值                     峰的高度（0–1，1 = 句子最高音）
       左尖锐 / 右尖锐          峰两侧的弯曲程度：1 是自然余弦拱，
                                 越大峰越尖（音爬到最后才冲上去）
       开始基值 / 结束基值      两端的落地高度
     ====================================================================== */
  var EYE = C.EYE = {};

  function smooth(u) { return (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2; }
  function shape(u, k) {
    var s = smooth(u);
    if (!k || Math.abs(k - 1) < 1e-6) return s;
    return Math.pow(s, k);
  }

  EYE.eye = function (o) {
    o = o || {};
    var a = o['开始'] !== undefined ? +o['开始'] : (o.x0 !== undefined ? o.x0 : 0);
    var b = o['结束'] !== undefined ? +o['结束'] : (o.x1 !== undefined ? o.x1 : 1);
    var p = o['峰的时间'] !== undefined ? +o['峰的时间'] : (o.px !== undefined ? o.px : (a + b) / 2);
    var pk = o['峰值'] !== undefined ? +o['峰值'] : (o.py !== undefined ? o.py : 0.6);
    return {
      '开始': a, '峰的时间': p, '结束': b, '峰值': pk,
      '左尖锐': o['左尖锐'] !== undefined ? +o['左尖锐'] : (o.kl !== undefined ? o.kl : 1),
      '右尖锐': o['右尖锐'] !== undefined ? +o['右尖锐'] : (o.kr !== undefined ? o.kr : 1),
      '开始基值': o['开始基值'] !== undefined ? +o['开始基值'] : (o.y0 !== undefined ? o.y0 : 0),
      '结束基值': o['结束基值'] !== undefined ? +o['结束基值'] : (o.y1 !== undefined ? o.y1 : 0)
    };
  };

  /* 单只眼睛在 x 处的高度 */
  EYE.at = function (e, x) {
    e = EYE.eye(e);
    var a = e['开始'], b = e['结束'], p = Math.max(a + 1e-6, Math.min(b - 1e-6, e['峰的时间']));
    if (x <= a) return e['开始基值'];
    if (x >= b) return e['结束基值'];
    if (x <= p) {
      var u = (x - a) / Math.max(1e-6, p - a);
      return e['开始基值'] + (e['峰值'] - e['开始基值']) * shape(u, e['左尖锐']);
    }
    var u2 = (x - p) / Math.max(1e-6, b - p);
    return e['峰值'] + (e['结束基值'] - e['峰值']) * shape(u2, e['右尖锐']);
  };

  /* 整组眼睛在 x 处的高度：取覆盖 x 的那只；都不覆盖就用最近一只的端点值 */
  EYE.value = function (set, x) {
    var eyes = (set && set.eyes) || [];
    if (!eyes.length) return 0.5;
    x = Math.max(0, Math.min(1, x));
    for (var i = 0; i < eyes.length; i++) {
      var e = EYE.eye(eyes[i]);
      if (x >= e['开始'] - 1e-9 && x <= e['结束'] + 1e-9) return EYE.at(e, x);
    }
    /* 间隙里：在左右两只之间线性过渡 */
    var left = null, right = null;
    for (var j = 0; j < eyes.length; j++) {
      var ej = EYE.eye(eyes[j]);
      if (ej['结束'] < x && (!left || ej['结束'] > left['结束'])) left = ej;
      if (ej['开始'] > x && (!right || ej['开始'] < right['开始'])) right = ej;
    }
    if (left && right) {
      var span = right['开始'] - left['结束'];
      var u = span > 1e-6 ? (x - left['结束']) / span : 1;
      return left['结束基值'] + (right['开始基值'] - left['结束基值']) * u;
    }
    if (left) return left['结束基值'];
    if (right) return right['开始基值'];
    return 0.5;
  };

  /* 整体势：一条横跨全曲的长曲线，给句子一个总的涨落方向 */
  EYE.momentum = function (m) {
    if (!m) return null;
    return {
      'm开始x': m['m开始x'] !== undefined ? +m['m开始x'] : 0,
      'm峰的x': m['m峰的x'] !== undefined ? +m['m峰的x'] : 0.7,
      'm结束x': m['m结束x'] !== undefined ? +m['m结束x'] : 1,
      'm峰值': m['m峰值'] !== undefined ? +m['m峰值'] : 0.65,
      'm左尖锐': m['m左尖锐'] !== undefined ? +m['m左尖锐'] : 1,
      'm右尖锐': m['m右尖锐'] !== undefined ? +m['m右尖锐'] : 1,
      'm增加': m['m增加'] !== undefined ? !!m['m增加'] : true
    };
  };
  EYE.momValue = function (m, x) {
    if (!m) return 0.5;
    var a = m['m开始x'], b = m['m结束x'];
    var p = Math.max(a + 1e-6, Math.min(b - 1e-6, m['m峰的x']));
    if (x <= a) return 0;
    if (x >= b) return m['m峰值'];
    if (x <= p) {
      var u = (x - a) / Math.max(1e-6, p - a);
      return m['m峰值'] * shape(u, m['m左尖锐']);
    }
    var u2 = (x - p) / Math.max(1e-6, b - p);
    return m['m峰值'] + (0 - m['m峰值']) * shape(u2, m['m右尖锐']);
  };

  /* 预设眼睛组：包含基础预设形状，另外补几个常用形状 */
  EYE.PRESETS = [
    {
      name: '单眼·峰偏左', tip: '最常用、最基础。一句一口气爬上去再落下来，峰在 85% 处偏左。',
      eyes: [{ '开始': 0, '峰的时间': 0.35, '结束': 1, '峰值': 0.75, '左尖锐': 1, '右尖锐': 1, '开始基值': 0, '结束基值': 0 }],
      momentum: { 'm开始x': 0, 'm峰的x': 0.88, 'm结束x': 1, 'm峰值': 0.65, 'm左尖锐': 1, 'm右尖锐': 0.34, 'm增加': true }
    },
    {
      name: '三眼·上下上', tip: '一句里三个浪头，最像说话的起伏，流行歌里很顺。',
      eyes: [
        { '开始': 0, '峰的时间': 0.32, '结束': 0.39, '峰值': 0.28, '左尖锐': 1, '右尖锐': 1, '开始基值': 0, '结束基值': 0.37 },
        { '开始': 0.39, '峰的时间': 0.45, '结束': 0.54, '峰值': 0.20, '左尖锐': 1, '右尖锐': 1, '开始基值': 0.37, '结束基值': 0.13 },
        { '开始': 0.54, '峰的时间': 0.89, '结束': 1, '峰值': 0.55, '左尖锐': 1, '右尖锐': 1, '开始基值': 0.13, '结束基值': 0.68 }
      ],
      momentum: { 'm开始x': 0, 'm峰的x': 0.88, 'm结束x': 1, 'm峰值': 0.65, 'm左尖锐': 1, 'm右尖锐': 0.34, 'm增加': true }
    },
    {
      name: '大拱·抒情', tip: '慢慢爬满一个八度再慢慢落回，长句抒情用。',
      eyes: [{ '开始': 0, '峰的时间': 0.52, '结束': 1, '峰值': 1, '左尖锐': 0.75, '右尖锐': 0.8, '开始基值': 0.05, '结束基值': 0.05 }],
      momentum: { 'm开始x': 0, 'm峰的x': 0.62, 'm结束x': 1, 'm峰值': 0.55, 'm左尖锐': 0.9, 'm右尖锐': 0.9, 'm增加': true }
    },
    {
      name: '双眼·问答', tip: '两个浪头一低一高，像一问一答，适合对句。',
      eyes: [
        { '开始': 0, '峰的时间': 0.2, '结束': 0.46, '峰值': 0.42, '左尖锐': 1, '右尖锐': 1, '开始基值': 0, '结束基值': 0.1 },
        { '开始': 0.46, '峰的时间': 0.72, '结束': 1, '峰值': 0.85, '左尖锐': 1, '右尖锐': 1, '开始基值': 0.1, '结束基值': 0.2 }
      ],
      momentum: { 'm开始x': 0, 'm峰的x': 0.75, 'm结束x': 1, 'm峰值': 0.7, 'm左尖锐': 1, 'm右尖锐': 0.5, 'm增加': true }
    },
    {
      name: '上扬·收尾高', tip: '一路往上，最后冲顶收住；励志、副歌推高潮用。',
      eyes: [{ '开始': 0, '峰的时间': 0.86, '结束': 1, '峰值': 0.95, '左尖锐': 1.7, '右尖锐': 0.6, '开始基值': 0.1, '结束基值': 0.55 }],
      momentum: { 'm开始x': 0, 'm峰的x': 0.95, 'm结束x': 1, 'm峰值': 0.85, 'm左尖锐': 1, 'm右尖锐': 0.4, 'm增加': true }
    },
    {
      name: '下行·叹息', tip: '起手就到高处，然后一路落下去。伤感、结尾句用。',
      eyes: [{ '开始': 0, '峰的时间': 0.12, '结束': 1, '峰值': 0.85, '左尖锐': 0.8, '右尖锐': 0.55, '开始基值': 0.3, '结束基值': 0 }],
      momentum: { 'm开始x': 0, 'm峰的x': 0.1, 'm结束x': 1, 'm峰值': 0.7, 'm左尖锐': 0.6, 'm右尖锐': 0.9, 'm增加': false }
    },
    {
      name: '锯齿·说唱', tip: '四只小眼睛，起伏小、峰尖，贴着说话的音高走。',
      eyes: [
        { '开始': 0, '峰的时间': 0.12, '结束': 0.25, '峰值': 0.5, '左尖锐': 1.6, '右尖锐': 1.6, '开始基值': 0.3, '结束基值': 0.3 },
        { '开始': 0.25, '峰的时间': 0.37, '结束': 0.5, '峰值': 0.62, '左尖锐': 1.6, '右尖锐': 1.6, '开始基值': 0.3, '结束基值': 0.3 },
        { '开始': 0.5, '峰的时间': 0.62, '结束': 0.75, '峰值': 0.45, '左尖锐': 1.6, '右尖锐': 1.6, '开始基值': 0.3, '结束基值': 0.3 },
        { '开始': 0.75, '峰的时间': 0.87, '结束': 1, '峰值': 0.58, '左尖锐': 1.6, '右尖锐': 1.2, '开始基值': 0.3, '结束基值': 0.35 }
      ],
      momentum: { 'm开始x': 0, 'm峰的x': 0.8, 'm结束x': 1, 'm峰值': 0.45, 'm左尖锐': 1, 'm右尖锐': 1, 'm增加': true }
    },
    {
      name: '童谣·跳动', tip: '短促的两次上跳，峰很尖，句尾落回主音。',
      eyes: [
        { '开始': 0, '峰的时间': 0.18, '结束': 0.42, '峰值': 0.65, '左尖锐': 2.2, '右尖锐': 2.0, '开始基值': 0.2, '结束基值': 0.15 },
        { '开始': 0.42, '峰的时间': 0.62, '结束': 0.9, '峰值': 0.8, '左尖锐': 2.2, '右尖锐': 1.4, '开始基值': 0.15, '结束基值': 0 }
      ],
      momentum: null
    }
  ];

  EYE.preset = function (name) {
    for (var i = 0; i < EYE.PRESETS.length; i++) {
      if (EYE.PRESETS[i].name === name) {
        return {
          name: EYE.PRESETS[i].name,
          eyes: EYE.PRESETS[i].eyes.map(function (e) { return EYE.eye(e); }),
          momentum: EYE.PRESETS[i].momentum ? JSON.parse(JSON.stringify(EYE.PRESETS[i].momentum)) : null
        };
      }
    }
    return EYE.preset(EYE.PRESETS[0].name);
  };

  /* 把 DSC 的「谱曲.眼睛」数组整组转过来 */
  EYE.fromDsc = function (arr) {
    var out = { name: '导入的眼睛', eyes: [], momentum: null };
    (arr || []).forEach(function (g) {
      var eyes = g['眼睛数组'] || [];
      eyes.forEach(function (e) { out.eyes.push(EYE.eye(e)); });
      if (!out.momentum) out.momentum = EYE.momentum(g['整体势'] && g['整体势'][0]);
      if (g['名称']) out.name = g['名称'];
    });
    if (!out.eyes.length) return null;
    return out;
  };

  /* 曲风 = 眼睛组 + 音域跨度 + 节奏手感 */
  C.STYLES = [
    { id: 'ballad', name: '民谣', eye: '单眼·峰偏左', span: 5, durScale: 1.15, dot: 0.25, tip: '五度以内的拱形，字与字之间留得开' },
    { id: 'pop', name: '流行', eye: '三眼·上下上', span: 7, durScale: 1, dot: 0.35, tip: '三个浪头，接近说话的起伏' },
    { id: 'slow', name: '抒情', eye: '大拱·抒情', span: 8, durScale: 1.4, dot: 0.2, tip: '八度大拱，长音多' },
    { id: 'duet', name: '对句', eye: '双眼·问答', span: 6, durScale: 1.05, dot: 0.3, tip: '一低一高两次起落' },
    { id: 'rise', name: '励志', eye: '上扬·收尾高', span: 7, durScale: 1.1, dot: 0.3, tip: '一路向上，句尾冲顶' },
    { id: 'sad', name: '伤感', eye: '下行·叹息', span: 5, durScale: 1.2, dot: 0.25, tip: '高起低收，像叹气' },
    { id: 'rap', name: '说唱', eye: '锯齿·说唱', span: 3, durScale: 0.55, dot: 0.6, tip: '音域窄、字密，接近念白' },
    { id: 'kids', name: '童谣', eye: '童谣·跳动', span: 4, durScale: 0.85, dot: 0.45, tip: '两次短跳，句尾落主音' }
  ];
  C.styleById = function (id) {
    for (var i = 0; i < C.STYLES.length; i++) if (C.STYLES[i].id === id) return C.STYLES[i];
    return C.STYLES[1];
  };

  /* ---------------- 自动谱曲（眼睛谱曲法） ----------------
     opt: { root, beat, style:'pop', eye:{eyes,momentum}, span, degs, formantLess }
     句子对 → 一只（或一组）眼睛横向铺满 → 每个音节按 x 取高度 → 换成音级 */
  C.melody = function (text, lang, opt) {
    opt = opt || {};
    var root = opt.root === undefined ? 60 : opt.root;
    var beat = opt.beat || 0.5;
    var style = opt.style ? C.styleById(opt.style) : null;
    var eyeSet = opt.eye || (style ? EYE.preset(style.eye) : EYE.preset('单眼·峰偏左'));
    var span = opt.span !== undefined ? opt.span : (style ? style.span : 7);
    var durScale = opt.durScale !== undefined ? opt.durScale : (style ? style.durScale : 1);
    var dot = opt.dot !== undefined ? opt.dot : (style ? style.dot : 0.3);
    var degs = opt.degs || C.SCALES.penta;
    var mScale = opt.momentumWeight !== undefined ? opt.momentumWeight : 0.35;
    var mom = EYE.momentum(eyeSet.momentum);

    function toSyls(seg) {
      var out = [];
      if (lang === 'en') {
        seg.toLowerCase().split(/[\s，。！？；：、,.;:!?]+/).filter(Boolean).forEach(function (w) {
          var g = NSG.g2p(w, 'en');
          if (g.length) out.push({ text: w, phones: g[0].phones, fn: isFunc(w, 'en') ? 1 : 0 });
        });
      } else {
        NSG.g2p(seg, lang).forEach(function (s) {
          out.push({ text: s.text, phones: s.phones, fn: isFunc((s.word || s.text).toLowerCase(), lang) ? 1 : 0 });
        });
      }
      return out;
    }

    /* 先按标点切句，再把过长的句子切开（一口气唱不完） */
    // Asaxi m.m / n.n 是重鼻音的音节界，不是句号；保留给 G2P。
    var phraseText = lang === 'asaxi' ? (text || '').replace(/([mn])\.(?=\1)/gi, '$1\uE000') : (text || '');
    var sentenceBreak = /^(eo|fi|es|pt|it|fr|ro|fil|id|ms|th)$/.test(lang) ? /[，。、；：！？,.;:!?¡¿…—~ฯ๚๛\n\r]+|(?<![\p{L}\p{M}])-|-(?![\p{L}\p{M}])/u :
      /[，。、；：！？,.;:!?…—\-~\n\r]+/;
    var raw = phraseText.split(sentenceBreak).map(function (s) {
      return s.replace(/\uE000/g, '.').trim();
    }).filter(Boolean);
    if (!raw.length) return [];
    var phrases = [];
    raw.forEach(function (seg) {
      var s = toSyls(seg);
      while (s.length > 10) { phrases.push(s.slice(0, 9)); s = s.slice(9); }
      if (s.length) phrases.push(s);
    });
    if (!phrases.length) return [];

    /* 合并成「长-短」对：一对眼睛管一对句子 */
    var pairs = [];
    var p = 0;
    while (p < phrases.length) {
      if (p + 1 < phrases.length && phrases[p].length + phrases[p + 1].length <= 18) {
        pairs.push([phrases[p], phrases[p + 1]]);
        p += 2;
      } else {
        var one = phrases[p];
        var cut = Math.max(2, Math.round(one.length * 0.62));
        pairs.push([one.slice(0, cut), one.slice(cut)]);
        p += 1;
      }
    }

    var notes = [], t = 0;
    var pairCount = pairs.length;
    pairs.forEach(function (pair, pi) {
      var A = pair[0], B = pair[1];
      var total = A.length + B.length;
      var i = 0;
      function emit(list, isTail) {
        for (var k = 0; k < list.length; k++, i++) {
          var syl = list[k];
          /* 纵向位置：一对句子共用一条横轴 0…1 */
          var x = total > 1 ? (i + 0.5) / total : 0.5;
          var y = EYE.value(eyeSet, x);
          if (mom) {
            /* 整体势把整段的落点整体抬高/压低一点，幅度可调 */
            y = y * (1 - mScale) + EYE.momValue(mom, (pi + x) / Math.max(1, pairCount)) * mScale;
          }
          y = Math.max(0, Math.min(1, y));
          /* 虚实对比：只挪半个到一级。
             跨度窄（五度）时挪一级就等于整条曲线的五分之一，
             会把眼睛的形状整个盖掉，所以按跨度取幅度。 */
          var off = span >= 7 ? 1 : 0.5;
          var step = Math.round(y * span + (syl.fn ? -off : off));
          step = Math.max(-1, Math.min(span + 1, step));
          var isLast = isTail && k === list.length - 1;
          if (isLast) {
            /* 句尾就近落到稳定音级（主、三、五），但只在半个三度以内才动，
               否则「下行/叹息」这类本来就该落在低处的句子会被拽上去 */
            var stable = [0, 2, 4, 5];
            var best = step, bd = 99;
            stable.forEach(function (d) {
              if (Math.abs(d - step) < bd) { bd = Math.abs(d - step); best = d; }
            });
            if (bd <= 1) step = best;
          }
          var dur = syl.fn ? beat * (0.9 * durScale) : beat * (2 * durScale);
          if (isLast) dur = beat * 4 * durScale;
          else if (k === list.length - 1) dur = Math.max(dur, beat * 1.5 * durScale);
          dur = Math.round(dur / 0.0625) * 0.0625;
          notes.push({
            start: t, dur: dur,
            pitch: C.degToMidi(root, degs, step),
            lyric: syl.text, phones: syl.phones, vel: 96,
            vib: isLast ? 1 : (dur >= 1 + dot ? 0.6 : 0.25),
            eye: isLast ? 1 : 0
          });
          t += dur;
        }
      }
      emit(A, false);
      emit(B, true);
      t += beat * 2;      // 句间呼吸
    });
    return notes;
  };

  /* 选区谱曲：整段共用一组眼睛，按原音符的时间中点采样，只返回新音高。
     不重新分词、切句或生成节奏，延音及多音节歌词也始终一音对一音。 */
  C.reshapeMelody = function (notes, lang, opt) {
    opt = opt || {};
    var style = C.styleById(opt.style), root = opt.root === undefined ? 60 : opt.root;
    var eyeSet = opt.eye || EYE.preset(style.eye), degs = opt.degs || C.SCALES.penta;
    var span = opt.span === undefined ? style.span : opt.span;
    var weight = opt.momentumWeight === undefined ? 0.35 : opt.momentumWeight;
    var mom = EYE.momentum(eyeSet.momentum);
    var sorted = (notes || []).slice().sort(function (a, b) { return a.start - b.start; });
    if (!sorted.length) return [];
    var start = sorted[0].start, end = start;
    sorted.forEach(function (n) { end = Math.max(end, n.start + n.dur); });
    var voiced = sorted.filter(function (n) { return NSG.noteKind(n) === 'voiced'; });
    return voiced.map(function (n, i) {
      var x = end > start ? (n.start + n.dur / 2 - start) / (end - start) : 0.5;
      var y = EYE.value(eyeSet, x);
      if (mom) y = y * (1 - weight) + EYE.momValue(mom, x) * weight;
      y = Math.max(0, Math.min(1, y));
      var off = span >= 7 ? 1 : 0.5;
      var step = Math.max(-1, Math.min(span + 1,
        Math.round(y * span + (isFunc(n.lyric || '', n.lang || lang) ? -off : off))));
      if (i === voiced.length - 1) {
        var best = step, distance = 99;
        [0, 2, 4, 5].forEach(function (d) {
          if (Math.abs(d - step) < distance) { distance = Math.abs(d - step); best = d; }
        });
        if (distance <= 1) step = best;
      }
      return Object.assign({}, n, { pitch: C.degToMidi(root, degs, step) });
    });
  };

  /* ---------------- 自动编曲 ----------------
     思路：按乐句定调 → 结合重复与能量辨认段落 → 按实际旋律重叠选择和弦
     → 贝斯、铺底、琶音/电钢、弦乐、鼓组各自按段的密度铺。
     随机性全部走一个可复现的种子：同一个种子编出来的曲子完全一样，
     换个种子换个版本，用户不必担心「每次都不一样」。
     ==================================================================== */
  var MAJ_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MIN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  var DEG_MAJ = [0, 2, 4, 5, 7, 9, 11];
  var DEG_MIN = [0, 2, 3, 5, 7, 8, 10];
  function pitchClass(pitch) { return ((Math.round(pitch) % 12) + 12) % 12; }
  function pitched(n) {
    return Number.isFinite(n.pitch) && Number.isFinite(n.start) && Number.isFinite(n.dur) && n.dur > 0 &&
      (NSG.noteKind ? NSG.noteKind(n) === 'voiced' : !n.rest);
  }
  // A separate clock for melodic statistics. Silent/breath intervals have no
  // length here; the original score clock remains authoritative for arranging.
  // Merge overlapping voices so a held note or doubled note is not counted twice.
  function melodyTiming(notes) {
    var spans = [], length = 0;
    notes.filter(pitched).slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (n) {
      var last = spans[spans.length - 1], end = n.start + n.dur;
      if (last && n.start <= last.end) last.end = Math.max(last.end, end);
      else spans.push({ start: n.start, end: end });
    });
    spans.forEach(function (s) { s.offset = length; length += s.end - s.start; });
    function timeAt(beat) {
      var lo = 0, hi = spans.length - 1;
      if (hi < 0 || beat < spans[0].start) return 0;
      while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (spans[mid].start <= beat) lo = mid; else hi = mid - 1; }
      var s = spans[lo]; return s.offset + Math.max(0, Math.min(beat, s.end) - s.start);
    }
    return { length: length, duration: function (start, end) { return Math.max(0, timeAt(end) - timeAt(start)); },
      beatAt: function (time) {
        var lo = 0, hi = spans.length - 1;
        if (hi < 0) return 0;
        while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (spans[mid].offset <= time) lo = mid; else hi = mid - 1; }
        var s = spans[lo]; return s.start + Math.max(0, Math.min(s.end - s.start, time - s.offset));
      } };
  }
  // strong: chord choice weighs downbeats far above passing notes; key finding keeps the mild accents.
  function pitchHistogram(notes, start, end, offset, strong) {
    var hist = new Array(12).fill(0);
    offset = offset === undefined ? (notes.length ? notes[0].start : 0) : offset;
    notes.forEach(function (n) {
      var overlap = Math.max(0, Math.min(n.start + n.dur, end) - Math.max(n.start, start));
      // A held note belongs to every window it sounds in, including tied notes.
      var phase = mod4(n.start - offset);
      var onBeat = Math.abs(phase - Math.round(phase)) < 0.02, down = Math.min(phase, 4 - phase) < 0.02;
      var tripleBeat = Math.abs(phase - 4 / 3) < 0.02 || Math.abs(phase - 8 / 3) < 0.02;
      var accent = strong === 3 ? (down ? 2.2 : tripleBeat ? 1.3 : 0.8) :
        strong ? (down ? 2.2 : Math.abs(phase - 2) < 0.02 ? 1.6 : onBeat ? 1.25 : 0.8) : down ? 1.35 : onBeat ? 1.1 : 1;
      hist[pitchClass(n.pitch)] += overlap * accent;
    });
    return hist;
  }
  // outsideWeight: how strongly sung out-of-key notes rule a key out (phrase-level judgement uses more).
  function keyCandidates(notes, outsideWeight, opt) {
    opt = opt || {};
    outsideWeight = outsideWeight || 2;
    var hist = opt.hist || pitchHistogram(notes, -Infinity, Infinity, opt.offset), total = hist.reduce(function (a, b) { return a + b; }, 0);
    var mean = total / 12, variance = 0, candidates = [];
    hist.forEach(function (h) { variance += (h - mean) * (h - mean); });
    var cadences = opt.cadences && opt.cadences.length ? opt.cadences :
      (notes.length ? [{ pc: pitchClass(notes[notes.length - 1].pitch), w: 1 }] : []);
    var cadWeight = cadences.reduce(function (s, c) { return s + c.w; }, 0) || 1;
    for (var mode = 0; mode < 2; mode++) {
      var profile = mode ? MIN_PROFILE : MAJ_PROFILE, scale = mode ? DEG_MIN : DEG_MAJ;
      var pm = profile.reduce(function (a, b) { return a + b; }, 0) / 12;
      for (var k = 0; k < 12; k++) {
        var covariance = 0, pv = 0, outside = 0;
        for (var i = 0; i < 12; i++) {
          var rel = (i - k + 12) % 12, v = profile[rel] - pm;
          covariance += (hist[i] - mean) * v; pv += v * v;
          if (scale.indexOf(rel) < 0) {
            // A natural b2 in minor strongly contradicts standard minor tonality, while #7 (leading tone) is normal.
            outside += hist[i] * (mode && rel === 11 ? 0.3 : mode && rel === 1 ? 1.5 : 1);
          }
        }
        var outsideShare = outside / Math.max(total, 1e-9);
        var cadBonus = 0;
        cadences.forEach(function (c) {
          var rel = (c.pc - k + 12) % 12;
          cadBonus += (rel === 0 ? 0.16 : rel === 7 ? 0.04 : 0) * c.w / cadWeight;
        });
        var sc = covariance / Math.sqrt(Math.max(1e-9, variance * pv)) - outsideWeight * outsideShare + cadBonus;
        candidates.push({ key: k, minor: !!mode, score: sc });
      }
    }
    return candidates.sort(function (a, b) { return b.score - a.score; });
  }
  C.detectKey = function (notes) {
    var mel = notes.filter(pitched).sort(function (a, b) { return a.start - b.start; });
    if (!mel.length) return keyCandidates(mel)[0];
    var phrases = C.splitPhrases(notes), cadences = [];
    if (phrases.length > 1) {
      phrases.forEach(function (p, idx) {
        var tail = p.notes[p.notes.length - 1];
        if (!tail) return;
        cadences.push({ pc: pitchClass(tail.pitch), w: Math.sqrt(Math.max(0.5, tail.dur)) * (idx === phrases.length - 1 ? 1.4 : 1) });
      });
    }
    return keyCandidates(mel, 2, { cadences: cadences })[0];
  };

  // Natural pauses first. Continuous passages use cadence/novelty evidence,
  // rather than pretending every sixteen beats form a musical phrase.
  C.splitPhrases = function (notes) {
    var sorted = notes.slice().sort(function (a, b) { return a.start - b.start; }), phrases = [], current = null, boundary = false;
    var sounding = sorted.filter(pitched), separators = sorted.filter(function (n) { return !pitched(n) && Number.isFinite(n.start); }), gaps = [];
    for (var i = 1; i < sounding.length; i++) {
      var gap = sounding[i].start - sounding[i - 1].start - sounding[i - 1].dur;
      var previousEnd = sounding[i - 1].start + sounding[i - 1].dur;
      var explicitPause = separators.some(function (n) {
        return n.start < sounding[i].start && (n.start >= previousEnd - 1e-6 || n.start + n.dur > previousEnd);
      });
      if (gap > 0.02 && !explicitPause) gaps.push(gap);
    }
    gaps.sort(function (a, b) { return a - b; });
    var regularGap = gaps.length >= Math.max(3, sounding.length / 2) ? gaps[Math.floor(gaps.length / 2)] : 0;
    var pause = Math.max(0.5, Math.min(2, regularGap * 1.75));
    sorted.forEach(function (n) {
      if (!pitched(n)) { if (Number.isFinite(n.start)) boundary = true; return; }
      var prev = current && current.notes[current.notes.length - 1];
      var punctuation = prev && /[，。！？；、,.!?;\n]\s*$/.test(prev.lyric || '');
      if (!current || boundary || n.start - current.end >= pause - 1e-6 || punctuation) {
        current = { start: n.start, end: n.start + n.dur, notes: [] }; phrases.push(current);
      }
      current.notes.push(n); current.end = Math.max(current.end, n.start + n.dur); boundary = false;
    });
    var refined = [];
    phrases.forEach(function (p) {
      var timing = melodyTiming(p.notes);
      if (timing.length <= 24 || p.notes.length < 8) { refined.push(p); return; }
      var ns = p.notes, size = ns.length, costs = [0], backs = [-1];
      var durations = ns.map(function (n) { return n.dur; }).sort(function (a, b) { return a - b; });
      var median = durations[durations.length >> 1];
      function closure(i) {
        if (i === size) return 2;
        var before = ns[i - 1], after = ns[i];
        if (after.slur) return -4;
        var gap = Math.max(0, after.start - before.start - before.dur);
        var left = ns.slice(Math.max(0, i - 5), i), right = ns.slice(i, i + 5);
        function avg(xs) { return xs.reduce(function (s, n) { return s + n.pitch; }, 0) / xs.length; }
        var novelty = Math.min(1.2, Math.abs(avg(left) - avg(right)) / 6);
        return Math.min(1.5, gap * 3) + Math.min(1.5, Math.max(0, before.dur / median - 1) * 0.45) + novelty;
      }
      for (var end = 1; end <= size; end++) {
        costs[end] = Infinity;
        var endClosure = closure(end);
        for (var begin = end - 1; begin >= 0; begin--) {
          var length = timing.duration(ns[begin].start, ns[end - 1].start + ns[end - 1].dur);
          if (length > 48 && begin < end - 1) break;
          var penalty = 2.4 + Math.max(0, 6 - length) * 0.8 + Math.max(0, length - 24) * 0.16;
          var value = costs[begin] + penalty - endClosure;
          if (value < costs[end]) { costs[end] = value; backs[end] = begin; }
        }
      }
      var parts = [], at = size;
      while (at > 0) {
        var from = backs[at], subset = ns.slice(from, at);
        parts.unshift({ start: subset[0].start, end: Math.max.apply(null, subset.map(function (n) { return n.start + n.dur; })), notes: subset });
        at = from;
      }
      refined.push.apply(refined, parts);
    });
    return refined;
  };

  function mod4(t) { return ((t % 4) + 4) % 4; }
  // Meter is ambiguous in a single melody. Expose both confidence and a manual
  // override; never move the vocal notes to make them fit the inferred grid.
  C.detectArrangementGrid = function (notes, opt) {
    opt = opt || {};
    if (Number.isFinite(opt.barOffset)) return { offset: mod4(opt.barOffset), confidence: 1, automatic: false };
    var mel = notes.filter(pitched).sort(function (a, b) { return a.start - b.start; });
    if (!mel.length) return { offset: 0, confidence: 0, automatic: true };
    // Mark notes that arrive on a sustained beat after a rest or short pickup so pickups don't steal beat 1.
    var arrival = mel.map(function (n, idx) {
      var prev = mel[idx - 1], gap = prev ? n.start - (prev.start + prev.dur) : 4;
      if (gap >= 1.2 && n.dur >= 0.85) return n.dur >= 1.25 ? 1.3 : 1.2;
      if (n.dur >= 1 && prev && prev.dur < 1 && n.dur >= prev.dur * 1.5) {
        var prev2 = mel[idx - 2];
        var g1 = prev2 ? prev.start - (prev2.start + prev2.dur) : 2;
        var g2 = prev2 && idx >= 3 ? prev2.start - (mel[idx - 3].start + mel[idx - 3].dur) : 2;
        if (g1 >= 0.9 || (prev2 && prev2.dur < 1 && g2 >= 0.9)) return 1.35;
      }
      return 1;
    });
    var candidates = { 0: true };
    mel.forEach(function (n) { candidates[Math.round(mod4(n.start) * 48) / 48 % 4] = true; });
    var ranked = Object.keys(candidates).map(function (phase) {
      var offset = +phase, value = 0, weight = 0;
      mel.forEach(function (n, idx) {
        var t = mod4(n.start - offset), distance = Math.abs(t - Math.round(t));
        distance = Math.min(distance, Math.abs(1 - distance));
        var accent = distance < 0.07 ? (t < 0.07 || t > 3.93 ? 1 : Math.abs(t - 2) < 0.07 ? 0.72 : 0.48) :
          Math.abs(t * 2 - Math.round(t * 2)) < 0.1 ? 0.16 : 0;
        var contained = n.dur >= 2 && n.dur <= 4 && t + n.dur <= 4.08 ? 1.12 : 1;
        // An AP/br/SP interval is not a rhythmic event or an accent bonus.
        var w = Math.pow(Math.min(4, n.dur), 0.75) * arrival[idx];
        value += accent * contained * w; weight += w;
      });
      return { offset: offset, score: value / weight };
    }).sort(function (a, b) { return b.score - a.score || a.offset - b.offset; });
    var best = ranked[0], zero = ranked.filter(function (r) { return r.offset === 0; })[0];
    if (zero.score >= best.score * 0.96) best = zero;
    var rival = ranked.filter(function (r) { var d = mod4(r.offset - best.offset); return d > 0.4 && d < 3.6; })[0];
    var confidence = rival ? Math.max(0, Math.min(1, (best.score - rival.score) / Math.max(0.01, best.score))) : 0;
    return { offset: best.offset, confidence: confidence, automatic: true };
  };

  /* ---------------- 小节网格：固定卷帘网格 / 跟随演唱（自由速度） ----------------
     卷帘量化过的工程，强音（长音、句首）几乎都落在八分音符网格上；自由速度演唱的工程
     （例如按耳朵对齐、带渐快渐慢的 Daisy Bell）强音散落在任意位置。后者用动态规划沿
     强音追踪一串小节线，小节长度可以缓慢漂移；再在这串小节里比较三拍与四拍。 */
  function gridEvents(mel, phrases) {
    var starts = {};
    (phrases || []).forEach(function (p) { starts[p.notes[0].start] = true; });
    return mel.map(function (n) {
      return { t: n.start, w: Math.pow(Math.min(n.dur, 2.5), 0.8) * (starts[n.start] ? 1.4 : 1), dur: n.dur };
    });
  }
  function strongEvents(events) {
    var ws = events.map(function (e) { return e.w; }).sort(function (a, b) { return a - b; });
    var cut = ws[Math.floor(ws.length * 0.45)] || 0;
    return events.filter(function (e) { return e.w >= cut; });
  }
  // Share of strong-note weight on a regular subdivision of the piano-roll grid (any phase).
  function fixedGridFit(strong, step) {
    var best = 0, phases = {};
    strong.forEach(function (e) { phases[Math.round(((e.t % step) + step) % step * 64) / 64] = true; });
    Object.keys(phases).forEach(function (ph) {
      var on = 0, all = 0;
      strong.forEach(function (e) {
        var x = ((e.t - ph) % step + step) % step, d = Math.min(x, step - x);
        all += e.w; if (d < 0.04) on += e.w;
      });
      best = Math.max(best, on / Math.max(all, 1e-9));
    });
    return best;
  }
  // Bar lines that follow the singer: Ellis-style DP over onset strength with a log-period penalty.
  function trackBars(events, period, from, to) {
    var r = to - from > 600 ? 1 / 16 : 1 / 32, size = Math.ceil((to - from + 3 * period) / r) + 1, origin = from - 1.5 * period;
    var onset = new Float64Array(size);
    var gauss = new Float64Array(7);
    for (var gk = -3; gk <= 3; gk++) gauss[gk + 3] = Math.exp(-0.5 * Math.pow(gk * r / 0.045, 2));
    for (var ei = 0; ei < events.length; ei++) {
      var e = events[ei], c = Math.round((e.t - origin) / r), ew = e.w;
      for (var k = -3; k <= 3; k++) {
        var idx = c + k;
        if (idx >= 0 && idx < size) onset[idx] += ew * gauss[k + 3];
      }
    }
    var mean = events.reduce(function (s, e) { return s + e.w; }, 0) / Math.max(1, events.length), lambda = 2.2 * mean;
    var lo = Math.max(1, Math.round(period * 0.68 / r)), hi = Math.round(period * 1.45 / r);
    var pen = new Float64Array(hi + 1);
    for (var gp = lo; gp <= hi; gp++) {
      var dev0 = Math.log2(gp * r / period);
      pen[gp] = lambda * dev0 * dev0;
    }
    var score = new Float64Array(size).fill(-Infinity), back = new Int32Array(size).fill(-1);
    var startLimit = Math.round((from - origin + 0.75 * period) / r);
    for (var i = 0; i < size; i++) {
      var best = i <= startLimit ? 0 : -Infinity, arg = -1;
      var maxG = hi < i ? hi : i;
      for (var g = lo; g <= maxG; g++) {
        var prev = score[i - g];
        if (prev === -Infinity) continue;
        var v = prev - pen[g];
        if (v > best) { best = v; arg = i - g; }
      }
      if (best === -Infinity) continue;
      score[i] = best + onset[i]; back[i] = arg;
    }
    var endFrom = Math.max(0, Math.round((to - origin - 1.45 * period) / r)), endTo = Math.min(size - 1, Math.round((to - origin) / r)), pick = -1;
    for (var j = endFrom; j <= endTo; j++) if (score[j] > -Infinity && (pick < 0 || score[j] > score[pick])) pick = j;
    if (pick < 0) return null;
    var bars = [];
    for (var at = pick; at >= 0; at = back[at]) bars.push(origin + at * r);
    bars.reverse();
    if (bars.length < 2) return null;
    return bars;
  }
  // How well a sequence of bar lines, each split into `meter` beats, explains the strong notes.
  function barFit(strong, bars, meter, bpm) {
    var on = 0, onBar = 0, all = 0, k = 0;
    strong.forEach(function (e) {
      while (k + 1 < bars.length && bars[k + 1] <= e.t + 1e-9) k++;
      var a = bars[k], b = bars[k + 1] !== undefined ? bars[k + 1] : a + (a - bars[k - 1]);
      var len = b - a, x = (e.t - a) / len * meter, d = Math.abs(x - Math.round(x));
      all += e.w;
      if (d < 0.13) on += e.w;
      if (Math.min(x, meter - x) < 0.13) onBar += e.w;
    });
    var span = bars[bars.length - 1] - bars[0], beatSec = span / (bars.length - 1) / meter * 60 / (bpm || 120);
    var prior = -0.16 * Math.pow(Math.log2(beatSec / 0.5), 2);
    return { beats: on / Math.max(all, 1e-9), bars: onBar / Math.max(all, 1e-9), score: on / Math.max(all, 1e-9) + 0.5 * onBar / Math.max(all, 1e-9) + prior, beatSec: beatSec };
  }
  C.detectBarGrid = function (notes, opt) {
    opt = opt || {};
    var mel = notes.filter(pitched).sort(function (a, b) { return a.start - b.start; });
    var meterOpt = opt.meter === 3 || opt.meter === '3' ? 3 : opt.meter === 4 || opt.meter === '4' ? 4 : 0;
    var mode = opt.gridMode === 'fixed' || opt.gridMode === 'tracked' ? opt.gridMode : 'auto';
    if (Number.isFinite(opt.barOffset) && mode === 'auto') mode = 'fixed';
    if (mel.length < 4) return { mode: 'fixed', meter: meterOpt || 4, automatic: true, fixedFit: 1 };
    var bpm = opt.bpm || 120, events = gridEvents(mel, opt.phrases), strong = strongEvents(events);
    var from = mel[0].start, to = Math.max.apply(null, mel.map(function (n) { return n.start + n.dur; }));
    var fixedFit = fixedGridFit(strong, 0.5);
    var result = { mode: 'fixed', meter: meterOpt || 4, automatic: mode === 'auto' && !meterOpt, fixedFit: fixedFit };
    if (mode === 'fixed' || (mode === "auto" && fixedFit >= 0.6)) {
      if (meterOpt !== 4) {
        // Quantized waltz: compare fixed three- and four-beat bars at their best phases.
        var fit = {};
        (meterOpt ? [meterOpt] : [3, 4]).forEach(function (m) {
          var bestFit = null;
          // Quantized downbeats sit on whole beats; a half-beat phase means anticipations, not a waltz.
          for (var ph = 0; ph < m; ph += 1) {
            var bars = [];
            for (var t = from - ((from - ph) % m + m) % m; t <= to + m; t += m) bars.push(t);
            var f = barFit(strong, bars, m, bpm);
            if (!bestFit || f.score > bestFit.score) { bestFit = f; bestFit.phase = ph; }
          }
          fit[m] = bestFit;
        });
        if (meterOpt === 3) result.phase = fit[3].phase;
        else {
          result.meterScores = { 3: fit[3].score, 4: fit[4].score };
          if (fit[3].bars >= 0.5 && fit[3].bars > fit[4].bars + 0.18 && fit[3].score > fit[4].score + 0.1) { result.meter = 3; result.phase = fit[3].phase; }
        }
        if (result.meter === 3 && Number.isFinite(opt.barOffset)) result.phase = opt.barOffset;
      }
      return result;
    }
    // Free time: try bar lengths from the spacing of strong notes, with both meters.
    var periods = [];
    // A bar lasts 0.9–4.5 s; shorter lattices would just follow single beats and fit anything.
    var beatsPerSec = bpm / 60;
    for (var p = Math.max(0.9, 0.9 * beatsPerSec); p <= Math.min(12, 4.5 * beatsPerSec); p *= 1.06) periods.push(p);
    var best = null;
    periods.forEach(function (period) {
      var bars = trackBars(events, period, from, to);
      if (!bars) return;
      (meterOpt ? [meterOpt] : [3, 4]).forEach(function (m) {
        var f = barFit(strong, bars, m, bpm);
        if (m === 4) f.score += 0.03;
        if (!best || f.score > best.score) best = { bars: bars, meter: m, period: period, score: f.score, beats: f.beats, barsFit: f.bars };
      });
    });
    if (!best) return result;
    var fixedEquivalent = barFit(strong, (function () { var b = []; for (var t = Math.floor(from / 4) * 4; t <= to + 4; t += 4) b.push(t); return b; })(), 4, bpm);
    result.trackedFit = best.beats; result.trackedBarFit = best.barsFit; result.fixedBeats = fixedEquivalent.beats;
    var steps = []; for (var q = 2; q < best.bars.length; q++) steps.push(Math.abs(Math.log2((best.bars[q] - best.bars[q - 1]) / (best.bars[q - 1] - best.bars[q - 2]))));
    steps.sort(function (a, b) { return a - b; });
    result.irregular = steps.length ? steps[Math.floor(steps.length * 0.75)] : 0;
    var lens = []; for (var q2 = 1; q2 < best.bars.length; q2++) lens.push(best.bars[q2] - best.bars[q2 - 1]);
    result.lenRange = [Math.min.apply(null, lens), Math.max.apply(null, lens)];
    // Accept only a confident, smoothly drifting pulse that explains the strong notes far better than the roll grid.
    var trusted = best.beats >= 0.85 && result.irregular <= 0.25 && best.beats >= fixedEquivalent.beats + 0.3 && fixedFit < 0.6;
    result.trusted = trusted;
    if (mode === 'tracked' || trusted) {
      // Extend the tracked bar lines with their edge lengths so the whole song is covered.
      var bars = best.bars.slice(), first = bars[1] - bars[0], last = bars[bars.length - 1] - bars[bars.length - 2];
      while (bars[0] > from - 1e-6) bars.unshift(bars[0] - first);
      while (bars[bars.length - 1] < to + last) bars.push(bars[bars.length - 1] + last);
      // Snap bar lines onto the sung onsets they were tracked from (the DP grid is only 1/32 beat fine).
      var snapCursor = 0, evLen = events.length;
      bars = bars.map(function (b) {
        while (snapCursor < evLen && events[snapCursor].t <= b - 0.09) snapCursor++;
        var near = null;
        for (var si = snapCursor; si < evLen && events[si].t < b + 0.09; si++) {
          var et = events[si].t;
          if (Math.abs(et - b) < 0.09 && (near === null || Math.abs(et - b) < Math.abs(near - b))) near = et;
        }
        return near === null ? b : near;
      });
      result.mode = 'tracked'; result.meter = best.meter; result.bars = bars;
      result.barLength = (bars[bars.length - 1] - bars[0]) / (bars.length - 1);
      result.automatic = mode === 'auto';
    }
    return result;
  };

  function phraseFeatures(p, timing) {
    var durs = p.notes.map(function (n) { return n.dur; }).sort(function (a, b) { return a - b; });
    var medDur = durs[durs.length >> 1] || 1;
    var wCap = p.notes.length >= 4 ? Math.max(1.25, medDur * 2) : Infinity;
    var dur = 0, sum = 0;
    p.notes.forEach(function (n) {
      var w = Math.min(n.dur, wCap);
      dur += w; sum += n.pitch * w;
    });
    var length = Math.max(1e-9, timing.length), shape = [], first = p.notes[0].pitch;
    var ordered = p.notes.slice().sort(function (a, b) { return a.pitch - b.pitch; });
    function percentile(ratio) {
      var target = dur * ratio, acc = 0, out = ordered[0].pitch;
      ordered.some(function (n) { acc += Math.min(n.dur, wCap); if (acc >= target) { out = n.pitch; return true; } return false; });
      return out;
    }
    var middle = percentile(0.5), q75 = percentile(0.75);
    // Single brief ornamental leaps (>9st above q75, <=15% of duration) should not skew phrase register.
    var cleanSum = 0, cleanDur = 0;
    p.notes.forEach(function (n) {
      var w = Math.min(n.dur, wCap);
      var clamped = (p.notes.length >= 4 && w <= dur * 0.15 && n.pitch > q75 + 9) ? q75 : n.pitch;
      cleanSum += clamped * w; cleanDur += w;
    });
    var mean = cleanDur > 0 ? cleanSum / cleanDur : sum / dur;
    for (var i = 0; i < 24; i++) {
      var t = timing.beatAt((i + 0.5) / 24 * length), active = null;
      p.notes.forEach(function (n) { if (n.start <= t && n.start + n.dur > t) active = n; });
      shape.push(active ? active.pitch - first : null);
    }
    return { pitch: (mean + middle) / 2, rawPitch: (sum / dur + middle) / 2, q75: q75, density: p.notes.length / length, shape: shape, length: length };
  }
  var dtwPrev = new Float64Array(25), dtwCur = new Float64Array(25);
  function similarPhrase(a, b) {
    if (Math.max(a.length, b.length) / Math.min(a.length, b.length) > 1.6 || Math.abs(a.pitch - b.pitch) > 3) return false;
    // Small time warps tolerate stretched endings and ornamental note splits.
    dtwPrev.fill(Infinity); dtwPrev[0] = 0;
    for (var i = 1; i <= 24; i++) {
      dtwCur.fill(Infinity);
      var x = a.shape[i - 1], jLo = i > 4 ? i - 3 : 1, jHi = i < 21 ? i + 3 : 24;
      for (var j = jLo; j <= jHi; j++) {
        var y = b.shape[j - 1];
        var error = x === null || y === null ? (x === y ? 0 : 2) : Math.min(4, Math.abs(x - y));
        var bestPrev = dtwPrev[j - 1];
        var pSame = dtwPrev[j] + 0.25, rLeft = dtwCur[j - 1] + 0.25;
        if (pSame < bestPrev) bestPrev = pSame;
        if (rLeft < bestPrev) bestPrev = rLeft;
        dtwCur[j] = error + bestPrev;
      }
      var swap = dtwPrev; dtwPrev = dtwCur; dtwCur = swap;
    }
    return dtwPrev[24] / 24 <= 0.65;
  }

  var SCALE_MASK_MAJ = null, SCALE_MASK_MIN = null;
  function ensureScaleMasks() {
    if (SCALE_MASK_MAJ) return;
    SCALE_MASK_MAJ = new Int32Array(12);
    SCALE_MASK_MIN = new Int32Array(12);
    for (var k = 0; k < 12; k++) {
      var mMaj = 0, mMin = 0;
      for (var d = 0; d < DEG_MAJ.length; d++) mMaj |= 1 << ((DEG_MAJ[d] + k) % 12);
      for (var d2 = 0; d2 < DEG_MIN.length; d2++) mMin |= 1 << ((DEG_MIN[d2] + k) % 12);
      SCALE_MASK_MAJ[k] = mMaj;
      SCALE_MASK_MIN[k] = mMin;
    }
  }

  C.analyzeArrangement = function (notes, opt) {
    opt = opt || {};
    var ensemble = opt._ensemble && opt._ensemble.multi ? opt._ensemble : null;
    var mel = ensemble ? ensemble.leadMel : notes.filter(pitched).sort(function (a, b) { return a.start - b.start; });
    if (!mel.length) return { phrases: [], sections: [], bars: 0 };
    var phrases = opt._phrases || (ensemble ? ensemble.leadPhrases : C.splitPhrases(notes));
    var grid = C.detectArrangementGrid(mel, opt), origin = grid.offset > 1e-6 ? grid.offset - 4 : 0;
    var forcedKey = Number.isInteger(opt.key) && opt.key >= 0 && opt.key < 12;
    var globalKey = forcedKey ? { key: opt.key, minor: !!opt.minor, score: 1 } : (function () {
      var cadences = [];
      if (phrases.length > 1) {
        phrases.forEach(function (p, idx) {
          var tail = p.notes[p.notes.length - 1];
          if (!tail) return;
          var tw = Math.sqrt(Math.max(0.5, tail.dur)) * (idx === phrases.length - 1 ? 1.4 : 1);
          cadences.push({ pc: pitchClass(tail.pitch), w: tw });
          if (ensemble) {
            var lowP = tail.pitch;
            for (var ai = 0; ai < ensemble.allMel.length; ai++) {
              var vn = ensemble.allMel[ai];
              if (vn.start >= tail.start + tail.dur) break;
              if (vn.start + vn.dur > tail.start && vn.pitch < lowP) lowP = vn.pitch;
            }
            if (lowP < tail.pitch && pitchClass(lowP) !== pitchClass(tail.pitch)) {
              cadences.push({ pc: pitchClass(lowP), w: 0.8 * tw });
            }
          }
        });
      }
      if (ensemble) {
        var globalHist = multiPitchHistogram(ensemble.layers, -Infinity, Infinity, grid.offset, false);
        return keyCandidates(mel, 2, { offset: grid.offset, hist: globalHist, cadences: cadences })[0];
      }
      return keyCandidates(mel, 2, { offset: grid.offset, cadences: cadences })[0];
    })();
    var endNotes = ensemble ? ensemble.allMel : mel;
    var lastVocalEnd = Math.max.apply(null, endNotes.map(function (n) { return n.start + n.dur; }));
    var bars = Math.max(2, Math.ceil((lastVocalEnd - origin) / 4));
    var vocalBars = bars;
    var barStarts = Array.from({ length: bars }, function (_, i) { return origin + i * 4; });
    // Viterbi smoothing makes ambiguous short phrases inherit context while
    // allowing a clear new key at a real phrase boundary.
    var rows = [], back = [];
    phrases.forEach(function (p, index) {
      var candidates;
      if (ensemble) {
        var pHist = multiPitchHistogram(ensemble.layers, p.start, p.end, grid.offset, false);
        var tailN = p.notes[p.notes.length - 1], pCadences = [];
        if (tailN) {
          pCadences.push({ pc: pitchClass(tailN.pitch), w: 1 });
          var pLow = tailN.pitch;
          for (var ai = 0; ai < ensemble.allMel.length; ai++) {
            var vn = ensemble.allMel[ai];
            if (vn.start >= tailN.start + tailN.dur) break;
            if (vn.start + vn.dur > tailN.start && vn.pitch < pLow) pLow = vn.pitch;
          }
          if (pLow < tailN.pitch && pitchClass(pLow) !== pitchClass(tailN.pitch)) {
            pCadences.push({ pc: pitchClass(pLow), w: 0.8 });
          }
        }
        candidates = keyCandidates(p.notes, 2, { offset: grid.offset, hist: pHist, cadences: pCadences });
      } else {
        candidates = keyCandidates(p.notes, 2, { offset: grid.offset });
      }
      var prev = rows[index - 1], links = [];
      if (forcedKey) {
        p.key = globalKey.key; p.minor = globalKey.minor;
        p.keyScores = candidates;
        return;
      }
      ensureScaleMasks();
      var phraseMask = 0, distinct = 0;
      if (ensemble) {
        for (var ai2 = 0; ai2 < ensemble.allMel.length; ai2++) {
          var ev = ensemble.allMel[ai2];
          if (ev.start >= p.end) break;
          if (ev.start + ev.dur > p.start) {
            var bitE = 1 << pitchClass(ev.pitch);
            if (!(phraseMask & bitE)) { phraseMask |= bitE; distinct++; }
          }
        }
      } else {
        for (var ni = 0; ni < p.notes.length; ni++) {
          var bit = 1 << pitchClass(p.notes[ni].pitch);
          if (!(phraseMask & bit)) { phraseMask |= bit; distinct++; }
        }
      }
      var evidenceScale = distinct < 3 ? 0.2 : distinct === 3 ? 0.65 : 1;
      var beforeDiatonic = prev ? prev.map(function (before) {
        var sMask = before.minor ? SCALE_MASK_MIN[before.key] : SCALE_MASK_MAJ[before.key];
        return (phraseMask & sMask) === phraseMask;
      }) : null;
      candidates.forEach(function (candidate, j) {
        var best = -Infinity, from = -1;
        // Short or ambiguous phrases lean on the song's overall key; a real modulation still wins on its own notes.
        var home = candidate.key === globalKey.key && candidate.minor === globalKey.minor ? 0.12 : 0;
        if (prev) prev.forEach(function (before, k) {
          var same = candidate.key === before.key && candidate.minor === before.minor;
          var switchCost = distinct < 3 ? 5 : (distinct < 6 ? 0.45 : 0.28) + (beforeDiatonic[k] ? 0.45 : 0);
          var value = before.path - (same ? 0 : switchCost);
          if (value > best) { best = value; from = k; }
        });
        else best = 0;
        candidate.path = best + home + candidate.score * evidenceScale; links[j] = from;
      });
      rows.push(candidates); back.push(links); p.keyScores = candidates;
    });
    if (!forcedKey) {
      var choice = 0, lastRow = rows[rows.length - 1];
      lastRow.forEach(function (item, j) { if (item.path > lastRow[choice].path) choice = j; });
      for (var pidx = phrases.length - 1; pidx >= 0; pidx--) {
        var chosen = rows[pidx][choice];
        phrases[pidx].key = chosen.key; phrases[pidx].minor = chosen.minor;
        choice = back[pidx][choice];
      }
    }

    var phraseTimings = phrases.map(function (p) { return melodyTiming(p.notes); });
    var features = phrases.map(function (p, i) { return phraseFeatures(p, phraseTimings[i]); }), total = 0, meanPitch = 0, meanDensity = 0, meanQ75 = 0;
    phrases.forEach(function (p, i) { p.length = features[i].length; p.density = features[i].density; });
    var groups = features.map(function (_, i) { return i; });
    function group(i) { while (groups[i] !== i) i = groups[i]; return i; }
    features.forEach(function (f, i) {
      for (var j = 0; j < i; j++) if (group(i) !== group(j) && similarPhrase(f, features[j])) groups[group(i)] = group(j);
    });
    var famCount = {}, members = {}, evidence = {};
    features.forEach(function (f, i) {
      var id = group(i);
      famCount[id] = (famCount[id] || 0) + 1;
      if (!members[id]) { members[id] = []; evidence[id] = 0; }
      members[id].push(i);
    });
    // Weight substantive phrases (>=2.5b) and dampen many-repeat choruses so a 3x chorus doesn't pull baseline above itself.
    var hasSub = features.some(function (f) { return f.length >= 2.5; });
    var hasLeadRole = !!(ensemble && ensemble.roleByTrack && phrases.some(function (p) { return ensemble.roleByTrack[p.trackIndex] === 'lead'; }));
    var vcSum = 0, vcW = 0, ownerGroups = {};
    features.forEach(function (f, i) {
      var id = group(i);
      var w = (hasSub && f.length < 2.5) ? f.length * 0.15 : f.length / Math.pow(famCount[id], 0.6);
      var inGlobalBase = !hasLeadRole || ensemble.roleByTrack[phrases[i].trackIndex] === 'lead';
      if (inGlobalBase) {
        total += w; meanPitch += f.pitch * w; meanDensity += f.density * w; meanQ75 += f.q75 * w;
      }
      if (ensemble) {
        if (inGlobalBase) { vcSum += (phrases[i].voiceCount || 1) * w; vcW += w; }
        var ti = phrases[i].trackIndex;
        if (ti !== undefined) {
          var og = ownerGroups[ti] = ownerGroups[ti] || { w: 0, pitch: 0, density: 0, q75: 0, dur: 0, pitches: [] };
          og.w += w; og.pitch += f.pitch * w; og.density += f.density * w; og.q75 += f.q75 * w;
          og.dur += f.length; og.pitches.push(f.pitch);
        }
      }
    });
    meanPitch /= Math.max(1e-9, total); meanDensity /= Math.max(1e-9, total); meanQ75 /= Math.max(1e-9, total);
    var meanVoiceCount = vcW > 0 ? vcSum / vcW : 1;
    var qualifyingOwners = [];
    if (ensemble) {
      Object.keys(ownerGroups).forEach(function (k) {
        var og = ownerGroups[k];
        og.meanPitch = og.pitch / Math.max(1e-9, og.w);
        og.meanDensity = og.density / Math.max(1e-9, og.w);
        og.meanQ75 = og.q75 / Math.max(1e-9, og.w);
        og.pitches.sort(function (a, b) { return a - b; });
        var p10 = og.pitches[Math.floor((og.pitches.length - 1) * 0.1)] || 0;
        var p90 = og.pitches[Math.floor((og.pitches.length - 1) * 0.9)] || 0;
        og.spread = p90 - p10;
        og.qualifies = og.pitches.length >= 4 && og.dur >= 16 && og.spread >= 4.5;
        if (og.qualifies) qualifyingOwners.push(og);
      });
    }
    var multiSingerSplit = qualifyingOwners.length >= 2 && (function () {
      var mins = Math.min.apply(null, qualifyingOwners.map(function (o) { return o.meanPitch; }));
      var maxs = Math.max.apply(null, qualifyingOwners.map(function (o) { return o.meanPitch; }));
      return maxs - mins >= 7.5;
    })();
    var minHookLen = (ensemble && Number.isFinite(opt.bpm) && opt.bpm > 0 && opt.bpm < 90) ? 2.8 : 4;
    var basePitches = [], baseDensities = [], baseQ75s = [], voiceLifts = [];
    features.forEach(function (f, i) {
      var id = group(i);
      var owner = multiSingerSplit && ownerGroups[phrases[i].trackIndex] && ownerGroups[phrases[i].trackIndex].qualifies
        ? ownerGroups[phrases[i].trackIndex] : null;
      var bPitch = owner ? owner.meanPitch : meanPitch;
      var bDens = owner ? owner.meanDensity : meanDensity;
      var bQ75 = owner ? owner.meanQ75 : meanQ75;
      basePitches[i] = bPitch; baseDensities[i] = bDens; baseQ75s[i] = bQ75;
      var lift = f.pitch - bPitch, qLift = f.q75 - bQ75;
      var densityLift = Math.log((f.density + 0.2) / (bDens + 0.2));
      // Sustained high-register phrases (ballad/climax choruses) should not be penalized harshly by sparse long notes.
      var effDLift = lift >= 1.8 ? Math.max(-0.12, densityLift) : densityLift;
      f.energy = lift / 5 * 0.65 + effDLift * 0.35;
      f.qLift = qLift;
      var vLift = ensemble ? Math.max(0, (phrases[i].voiceCount || 1) - meanVoiceCount) : 0;
      voiceLifts[i] = vLift;
      if (ensemble && meanVoiceCount > 1.01 && vLift >= 0.45) f.energy += Math.min(0.45, vLift * 0.32);
      var pitchChorus = (lift >= 2 && f.energy > 0.3) || (densityLift >= 0.38 && lift >= -0.5) || (lift >= 1.5 && qLift >= 2.0 && f.energy > 0.18);
      var harmonyChorus = ensemble && vLift >= 0.65 && f.energy > 0.20 && lift >= -1.5;
      var shortRepeated = ensemble && minHookLen < 4 && f.length >= minHookLen && famCount[id] > 1 && lift >= 2.5 && f.energy > 0.25;
      if ((f.length >= 4 && (pitchChorus || harmonyChorus)) || shortRepeated) {
        evidence[id] += f.length;
      }
    });
    Object.keys(members).forEach(function (id) {
      var indices = members[id], repeated = indices.length > 1;
      var spanSum = indices.reduce(function (s, i) { return s + features[i].length; }, 0);
      var hook = repeated && indices.some(function (i) {
        var bPitch = ensemble ? basePitches[i] : meanPitch;
        var bDens = ensemble ? baseDensities[i] : meanDensity;
        var vLift = ensemble ? voiceLifts[i] : 0;
        var lenOk = features[i].length >= 4 || (ensemble && minHookLen < 4 && features[i].length >= minHookLen &&
          features[i].pitch - bPitch >= 2.5 && features[i].energy > 0.25);
        return lenOk && ((features[i].pitch - bPitch >= 1 && features[i].energy > 0.18) ||
          (features[i].density >= bDens * 1.15 && features[i].pitch >= bPitch - 0.5 && spanSum >= 24) ||
          (ensemble && vLift >= 0.65 && features[i].energy > 0.20 && features[i].pitch - bPitch >= -1.5));
      });
      indices.forEach(function (i) { phrases[i].section = evidence[id] >= 8 || hook ? 'chorus' : 'verse'; });
    });
    // Single-pass short clips (no repeated chorus): detect sustained contiguous high section when clearly elevated above earlier verse.
    if (phrases.every(function (p) { return p.section !== 'chorus'; }) && phrases.length >= 4) {
      var lowVerDur = 0, lowVerPitchRel = 0, highRun = [];
      features.forEach(function (f, i) {
        var bp = ensemble ? basePitches[i] : meanPitch;
        var bq = ensemble ? baseQ75s[i] : meanQ75;
        if (f.pitch <= bp - 0.4 && f.length >= 2.5) { lowVerDur += f.length; lowVerPitchRel += (f.pitch - bp) * f.length; }
        if (f.length >= 3 && f.pitch - bp >= 1.1 && f.q75 - bq >= 1.5 && f.energy >= 0.15) highRun.push(i);
      });
      if (lowVerDur >= 8 && highRun.length >= 2) {
        var vBaseRel = lowVerPitchRel / lowVerDur;
        var runDur = highRun.reduce(function (s, idx) { return s + features[idx].length; }, 0);
        if (runDur >= 14) highRun.forEach(function (idx) {
          var bp = ensemble ? basePitches[idx] : meanPitch;
          if ((features[idx].pitch - bp) - vBaseRel >= 2.2) phrases[idx].section = 'chorus';
        });
      } else if (bars <= 20 && lowVerDur >= 6 && highRun.length >= 1) {
        var shortBaseRel = lowVerPitchRel / lowVerDur;
        highRun.forEach(function (idx) {
          var bp = ensemble ? basePitches[idx] : meanPitch;
          var bq = ensemble ? baseQ75s[idx] : meanQ75;
          if (features[idx].length >= 4 && phrases[idx].notes.length >= 4 &&
              (features[idx].pitch - bp) - shortBaseRel >= 4 && features[idx].q75 - bq >= 3.5) {
            phrases[idx].section = 'chorus';
          }
        });
      }
    }
    // Compare sequences of phrase families, not just isolated high phrases.
    // A recurrent block can contain a quiet answer to its louder hook.
    var recurrent = new Array(phrases.length).fill(0);
    for (var ri = 0; ri < phrases.length; ri++) {
      for (var rj = ri + 2; rj < phrases.length; rj++) {
        var run = 0;
        while (run < 10 && ri + run < rj && rj + run < phrases.length && group(ri + run) === group(rj + run)) run++;
        if (run < 2) continue;
        var span = features.slice(ri, ri + run).reduce(function (sum, f) { return sum + f.length; }, 0);
        if (span < 8) continue;
        for (var rr = 0; rr < run; rr++) { recurrent[ri + rr] = Math.max(recurrent[ri + rr], run); recurrent[rj + rr] = Math.max(recurrent[rj + rr], run); }
      }
    }
    // A melody that returns is heard in the same key: members of a family share the key that fits them all best.
    // Only literal repeats vote together: a sequence restated a step higher is a modulation, not the same key.
    var literal = {};
    Object.keys(members).forEach(function (id) {
      members[id].forEach(function (i) {
        var tag = id + ':' + pitchClass(phrases[i].notes[0].pitch) + ':' + Math.round(features[i].pitch);
        (literal[tag] = literal[tag] || []).push(i);
      });
    });
    Object.keys(literal).forEach(function (id) {
      var list = literal[id];
      if (list.length < 2) return;
      var options = {}, best = null;
      list.forEach(function (i) { options[phrases[i].key + (phrases[i].minor ? 'm' : '')] = { key: phrases[i].key, minor: phrases[i].minor }; });
      Object.keys(options).forEach(function (name) {
        var o = options[name], total = 0;
        list.forEach(function (i) { phrases[i].keyScores.forEach(function (c) { if (c.key === o.key && c.minor === o.minor) total += c.score; }); });
        if (!best || total > best.total) best = { key: o.key, minor: o.minor, total: total };
      });
      list.forEach(function (i) { phrases[i].key = best.key; phrases[i].minor = best.minor; });
    });
    phrases.forEach(function (p) { delete p.keyScores; });
    var maxChorusRepeat = 0;
    phrases.forEach(function (p, i) {
      p.family = group(i); p.repeatCount = members[p.family].length;
      if (p.section === 'chorus' && p.repeatCount > maxChorusRepeat) maxChorusRepeat = p.repeatCount;
    });
    // Suppress isolated single-phrase false chorus islands inside a multi-phrase verse when a stronger chorus exists.
    if (maxChorusRepeat >= 3) {
      phrases.forEach(function (p, i) {
        if (p.section !== 'chorus' || p.repeatCount >= maxChorusRepeat || features[i].length > 6.5) return;
        var prev1 = phrases[i - 1], prev2 = phrases[i - 2], next1 = phrases[i + 1];
        if (prev1 && prev2 && next1 && prev1.section === 'verse' && prev2.section === 'verse' && next1.section === 'verse' &&
            p.start - prev1.end <= 2.5 && next1.start - p.end <= 2.5) {
          p.section = 'verse';
        }
      });
    }
    var initialSections = phrases.map(function (p) { return p.section; });
    var firstChorusIdx = initialSections.indexOf('chorus');
    function isChorusCandidate(i) {
      return firstChorusIdx < 0 || members[phrases[i].family][0] >= firstChorusIdx;
    }
    for (var pass = 0; pass < 3; pass++) {
      phrases.forEach(function (p, i) {
        var adjacentHook = [i - 1, i + 1].some(function (j) {
          if (j < 0 || j >= phrases.length || phrases[j].section !== 'chorus') return false;
          var gap = j < i ? p.start - phrases[j].end : phrases[j].start - p.end;
          if (j > i && (gap >= 2.0 || phrases[j].repeatCount > p.repeatCount)) return false;
          return gap <= 3.5;
        });
        if (p.section === 'verse' && adjacentHook && features[i].length >= 2.5 &&
            ((recurrent[i] >= 2 && features[i].energy > -0.16) ||
             (isChorusCandidate(i) && recurrent[i] >= 2 && (features[i].energy > -0.24 || features[i].q75 >= meanQ75)) ||
             (features[i].pitch - meanPitch >= 2.0 && features[i].energy > 0.25) ||
             (isChorusCandidate(i) && recurrent[i] >= 2 && members[p.family].some(function (m) { return phrases[m].section === 'chorus' && recurrent[m] >= 2; })))) {
          p.section = 'chorus';
        }
        // Heal brief 1..2 phrase answering dips sandwiched strictly between two chorus phrases.
        if (p.section === 'verse' && i > 0 && i < phrases.length - 1 &&
            phrases[i - 1].section === 'chorus' && phrases[i + 1].section === 'chorus' &&
            ((features[i].length <= 8.5 && features[i].pitch >= meanPitch - 2.2 && features[i].energy > -0.22) ||
             (isChorusCandidate(i) && recurrent[i] >= 2 && features[i].length <= 12 && features[i].q75 >= meanQ75 - 0.5))) {
          p.section = 'chorus';
        }
        if (p.section === 'verse' && i > 0 && i + 2 < phrases.length &&
            phrases[i - 1].section === 'chorus' && phrases[i + 1].section === 'verse' && phrases[i + 2].section === 'chorus' &&
            isChorusCandidate(i) && isChorusCandidate(i + 1) &&
            recurrent[i] >= 2 && recurrent[i + 1] >= 2 && features[i].length + features[i + 1].length <= 22 &&
            (features[i].q75 >= meanQ75 || features[i + 1].q75 >= meanQ75)) {
          p.section = 'chorus'; phrases[i + 1].section = 'chorus';
        }
      });
    }
    // Keep a short resolving cadence tag at the end of a multi-phrase chorus inside the chorus.
    phrases.forEach(function (p, i) {
      if (p.section === 'verse' && i >= 2 && phrases[i - 1].section === 'chorus' && phrases[i - 2].section === 'chorus' &&
          p.notes.length <= 4 && features[i].length <= 5.5 && p.start - phrases[i - 1].end <= 2.5) {
        var next = phrases[i + 1];
        if (!next || next.section === 'chorus' || next.start - p.end >= 3.5 || next.key !== p.key || next.minor !== p.minor) {
          p.section = 'chorus';
        }
      }
      p.confidence = p.section === 'chorus' ? Math.min(0.95, 0.5 + (p.repeatCount > 1 ? 0.18 : 0) + Math.max(0, features[i].energy) * 0.15) : 0.4;
    });
    // A short contrasting sung phrase can link a verse to an established hook.
    // Do not turn a continuous rising pre-chorus lead-in directly matching Chorus register into a bridge.
    var originalSections = phrases.map(function (p) { return p.section; });
    if (opt.detectBridge !== false) phrases.forEach(function (p, i) {
      if (initialSections[i] === 'chorus') return;
      var before = phrases[i - 1], after = phrases[i + 1];
      if (!before || !after || originalSections[i - 1] !== 'verse' || originalSections[i + 1] !== 'chorus') return;
      if (p.notes.length < 3 || p.length < 1.5 || p.length > 12 || after.length < 6 ||
          p.length > Math.min(before.length, after.length) * 0.72) return;
      if (p.family === before.family || p.family === after.family || (after.repeatCount < 2 && after.confidence < 0.65)) return;
      var f = features[i], a = features[i - 1], b = features[i + 1];
      var preLike = p.length >= 4 && after.start - p.end < 1.2 && Math.abs(f.pitch - b.pitch) < 1.2;
      if (preLike) return;
      var registerChange = Math.abs(f.pitch - a.pitch) >= 1.5;
      var rhythmChange = Math.abs(Math.log((f.density + 0.2) / (a.density + 0.2))) >= 0.3;
      var keyChange = p.key !== before.key || p.minor !== before.minor;
      var rising = f.pitch > a.pitch + 0.7 && f.pitch < b.pitch + 1;
      if (!registerChange && !rhythmChange && !keyChange) return;
      p.section = 'bridge';
      p.confidence = Math.min(0.88, 0.6 + (rising ? 0.08 : 0) + (rhythmChange ? 0.06 : 0) + (p.repeatCount > 1 ? 0.08 : 0));
    });
    var sections = [], barEnergy = [], barPitch = [], coverage = [];
    for (var b = 0; b < bars; b++) {
      var weights = { verse: 0, chorus: 0, bridge: 0 }, energy = 0, wpitch = 0, weight = 0;
      phrases.forEach(function (p, i) {
        var overlap = phraseTimings[i].duration(barStarts[b], barStarts[b] + 4);
        weights[p.section] += overlap; energy += overlap * features[i].energy; wpitch += overlap * features[i].pitch; weight += overlap;
      });
      sections.push(weights.bridge > 0 && weights.bridge >= Math.max(weights.verse, weights.chorus) ? 'bridge' :
        weights.chorus > weights.verse ? 'chorus' : 'verse');
      barEnergy.push(weight ? energy / weight : 0); barPitch.push(weight ? wpitch / weight : meanPitch); coverage.push(weight);
    }
    // Bridge brief (<=2 bar) verse dips enclosed on both sides by chorus.
    for (var hc = 1; hc < bars - 1; hc++) {
      if (sections[hc] === 'verse' && sections[hc - 1] === 'chorus') {
        var hEnd = hc;
        while (hEnd < bars && sections[hEnd] === 'verse') hEnd++;
        if (hEnd < bars && sections[hEnd] === 'chorus' && hEnd - hc <= 2 && coverage.slice(hc, hEnd).some(function (c) { return c > 0; })) {
          for (var hf = hc; hf < hEnd; hf++) sections[hf] = 'chorus';
        }
      }
    }
    // Detect late C-section bridge (fresh contrasting 2..16 bar passage between two chorus blocks).
    if (opt.detectBridge !== false) {
      var firstVersePitch = 0, firstVerseW = 0, firstChorusBar = -1, lastChorusBar = -1;
      for (var sb = 0; sb < bars; sb++) {
        if (sections[sb] === 'chorus') { if (firstChorusBar < 0) firstChorusBar = sb; lastChorusBar = sb; }
        else if (sections[sb] === 'verse' && firstChorusBar < 0 && coverage[sb] > 0) { firstVersePitch += barPitch[sb] * coverage[sb]; firstVerseW += coverage[sb]; }
      }
      var v1Avg = firstVerseW > 0 ? firstVersePitch / firstVerseW : meanPitch;
      if (firstChorusBar >= 0 && lastChorusBar > firstChorusBar + 4) {
        for (var bb = firstChorusBar + 2; bb < lastChorusBar; bb++) {
          if (sections[bb] !== 'verse') continue;
          var bEnd = bb;
          while (bEnd < lastChorusBar && sections[bEnd] === 'verse') bEnd++;
          var runLen = bEnd - bb;
          if (bb >= Math.floor(bars * 0.42) && runLen >= 3 && runLen <= 16 && sections[bb - 1] === 'chorus' && sections[bEnd] === 'chorus') {
            var spanStart = barStarts[bb], spanEnd = barStarts[bEnd - 1] + 4;
            var inside = phrases.filter(function (p) { return p.start < spanEnd - 1e-6 && p.end > spanStart + 1e-6; });
            var fresh = inside.length > 0 && inside.every(function (p) { return p.repeatCount === 1; });
            var shifted = inside.some(function (p, idx) {
              var fi = phrases.indexOf(p);
              return Math.abs(features[fi].pitch - v1Avg) >= 2.0 || p.key !== globalKey.key || p.minor !== globalKey.minor;
            });
            if (fresh && shifted) {
              for (var bk = bb; bk < bEnd; bk++) if (coverage[bk] > 0) sections[bk] = 'bridge';
              inside.forEach(function (p) { if (p.section === 'verse') { p.section = 'bridge'; p.confidence = Math.max(p.confidence, 0.72); } });
            }
          }
          bb = bEnd - 1;
        }
      }
    }
    // One high pickup or ornamental bar is not enough to establish a chorus.
    for (var b2 = 0; b2 < bars;) {
      var stop = b2 + 1;
      while (stop < bars && sections[stop] === sections[b2]) stop++;
      if (sections[b2] === 'chorus' && stop - b2 < 2) sections[b2] = 'verse';
      b2 = stop;
    }
    // The optional intro only changes orchestration; it does not bias analysis.
    if (opt.intro) sections[0] = 'intro';
    for (var tail = bars - 1; tail > 0 && (ensemble ? overlapSpans(barStarts[tail], barStarts[tail] + 4, ensemble.allVocalSpans) : coverage[tail]) === 0; tail--) sections[tail] = 'outro';
    // Multi-bar rising pre-chorus (1..8 bars directly preceding chorus, leaving >=2 bars of verse before it).
    for (var pb = 3; pb < bars; pb++) {
      if (sections[pb] !== 'chorus' || sections[pb - 1] !== 'verse') continue;
      var vStart = pb - 1;
      while (vStart > 0 && sections[vStart - 1] === 'verse') vStart--;
      var verseRun = pb - vStart;
      if (verseRun < 3) continue;
      var maxPre = verseRun >= 10 ? Math.min(8, Math.floor(verseRun * 0.45)) : Math.min(4, verseRun - 2);
      var baseEnd = Math.max(vStart + 2, pb - maxPre), baseW = 0, baseE = 0, baseP = 0;
      for (var vb = vStart; vb < baseEnd; vb++) {
        if (coverage[vb] > 0) { baseW += coverage[vb]; baseE += barEnergy[vb] * coverage[vb]; baseP += barPitch[vb] * coverage[vb]; }
      }
      if (!baseW) continue;
      baseE /= baseW; baseP /= baseW;
      var preBars = 0;
      function preLifted(idx) {
        return coverage[idx] > 0 && (barEnergy[idx] > baseE + 0.10 || barPitch[idx] >= baseP + 1.4);
      }
      for (var k = 1; k <= maxPre; k++) {
        var idx = pb - k;
        if (preLifted(idx)) { preBars = k; continue; }
        if (k === 1 && coverage[idx] <= 1.5 && maxPre >= 2 && preLifted(pb - 2)) continue;
        var hasEarlierLift = false;
        for (var k2 = k + 1; k2 <= maxPre; k2++) if (preLifted(pb - k2)) { hasEarlierLift = true; break; }
        if (hasEarlierLift && coverage[idx] > 0 && (barEnergy[idx] > baseE - 0.08 || barPitch[idx] >= baseP + 0.5)) continue;
        break;
      }
      if (preBars > 0) for (var pk = 1; pk <= preBars; pk++) sections[pb - pk] = 'pre';
    }
    if (opt.outro) {
      var vocalEnd = origin + vocalBars * 4;
      var residual = vocalEnd - lastVocalEnd;
      var bpmOpt = Number.isFinite(opt.bpm) && opt.bpm > 0 ? opt.bpm : 120;
      var outroBars = vocalBars <= 2 ? 1 : vocalBars <= 4 ? 2 : (bpmOpt < 80 || residual >= 2 ? 2 : 3);
      for (var ob = 0; ob < outroBars; ob++) {
        barStarts.push(origin + (vocalBars + ob) * 4);
        sections.push('outro');
        coverage.push(0);
      }
      bars = vocalBars + outroBars;
    }
    // Actual orchestration boundaries include mid-bar key/section changes.
    // Partial blocks keep their phase within the musical bar (including pickups).
    var blocks = [], endBeat = origin + bars * 4;
    for (var bi = 0; bi < bars; bi++) {
      var start = Math.max(0, barStarts[bi]), endBeatOfBar = barStarts[bi] + 4, cuts = [start, endBeatOfBar];
      phrases.forEach(function (p, i) {
        var prev = phrases[i - 1];
        if (p.start > start && p.start < endBeatOfBar && (!prev || p.section !== prev.section || p.key !== prev.key || p.minor !== prev.minor)) cuts.push(p.start);
      });
      cuts.sort(function (a, b) { return a - b; });
      for (var cut = 0; cut < cuts.length - 1; cut++) {
        if (cuts[cut + 1] - cuts[cut] < 1e-6) continue;
        var active = null;
        phrases.forEach(function (p) { if (p.start <= cuts[cut] + 1e-6) active = p; });
        var section = active ? active.section : sections[bi];
        if (sections[bi] === 'intro' || sections[bi] === 'outro' || (sections[bi] === 'pre' && section === 'verse')) section = sections[bi];
        else if (section === 'verse' && cut === 0 && bi > 0 && sections[bi - 1] === 'pre' && sections[bi] === 'chorus') section = 'pre';
        blocks.push({ start: cuts[cut], end: cuts[cut + 1], barStart: barStarts[bi], bar: bi, section: section });
      }
    }
    return { phrases: phrases, sections: sections, bars: bars, barStarts: barStarts, blocks: blocks, end: endBeat, grid: grid, key: globalKey };
  };

  function triad(key, deg, minor) {
    var scale = minor ? DEG_MIN : DEG_MAJ;
    var r = (key + scale[deg % 7]) % 12;
    var t3 = (key + scale[(deg + 2) % 7] + (deg + 2 >= 7 ? 12 : 0)) % 12;
    var t5 = (key + scale[(deg + 4) % 7] + (deg + 4 >= 7 ? 12 : 0)) % 12;
    return [r, t3, t5];
  }

  /* ---------------- 和弦词汇 ----------------
     顺阶三和弦 + 挂留和弦；离调和弦（副属、bVII、借用 iv、和声小调 V、多利亚 IV）
     只有旋律里真的唱到它的特征音时才进入候选，不凭空加半音。 */
  var NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var EXT_NAME = { maj: { 11: 'maj7', 2: 'add9', 9: '6', 10: '7', 14: 'maj9', 16: '9', 21: '13' },
    min: { 10: 'm7', 2: 'madd9', 9: 'm6', 15: 'm9', 17: 'm11' },
    sus4: { 10: '7sus4' }, sus2: {}, dim: { 10: 'm7b5' } };
  function chordName(h) {
    var ext = h.ext !== undefined ? (EXT_NAME[h.quality] || {})[h.ext] : null;
    var name = NOTE_NAMES[h.root] + (ext || (h.quality === 'min' ? 'm' : h.quality === 'maj' ? '' : h.quality));
    return h.bass !== undefined && h.bass !== h.root ? name + '/' + NOTE_NAMES[h.bass] : name;
  }
  C.chordName = chordName;

  function chordOptions(key, minor, pc, weight, harmonicV) {
    var list = [], need = Math.max(weight, 1e-9) * 0.05, scale = minor ? DEG_MIN : DEG_MAJ;
    function has(rel) { return pc[(key + rel) % 12] > need; }
    function make(degree, rels, quality, chromatic) {
      list.push({ degree: degree, key: key, minor: minor, root: (key + rels[0]) % 12, quality: quality, chromatic: !!chromatic,
        tones: rels.map(function (r) { return (key + r) % 12; }) });
    }
    for (var d = 0; d < 7; d++) {
      var r = scale[d], third = (scale[(d + 2) % 7] - r + 12) % 12, fifth = (scale[(d + 4) % 7] - r + 12) % 12;
      make(d, [r, r + third, r + fifth], fifth === 6 ? 'dim' : third === 3 ? 'min' : 'maj');
    }
    make(4, [7, 12, 14], 'sus4'); make(0, [0, 2, 7], 'sus2'); make(3, [5, 7, 12], 'sus2');
    if (minor) {
      if (has(11) || harmonicV) make(4, [7, 11, 14], 'maj', true);       // 和声小调 V
      if (has(11) && has(8)) make(6, [11, 14, 17, 20], 'dim', true);     // vii°7 -> i
      if (has(9)) { make(3, [5, 9, 12], 'maj', true); make(1, [2, 5, 9], 'min', true); } // 多利亚 IV / ii
      if (has(4) && !has(3)) make(0, [0, 4, 7], 'maj', true);            // V/iv (Picardy/borrowed I)
      if (has(6)) make(1, [2, 6, 9], 'maj', true);                       // V/V -> V
    } else {
      if (has(1)) make(5, [9, 13, 16], 'maj', true);                     // V/ii -> ii
      if (has(1) && has(4) && !has(2)) make(0, [1, 4, 7, 10], 'dim', true); // #i°7 -> ii
      if (has(3) && !has(4)) make(2, [3, 7, 10], 'maj', true);           // 借用 bIII
      if (has(6)) make(1, [2, 6, 9], 'maj', true);                       // V/V -> V
      if (has(6) && has(3)) make(3, [6, 9, 12, 15], 'dim', true);        // #iv°7 -> V / I/5
      if (has(8)) make(2, [4, 8, 11], 'maj', true);                      // V/vi -> vi
      if (has(8) && has(11) && has(5)) make(4, [8, 11, 14, 17], 'dim', true); // #v°7 -> vi
      if (has(8) && has(3) && !has(4)) make(5, [8, 12, 15], 'maj', true); // 借用 bVI
      if (has(10)) make(6, [10, 14, 17], 'maj', true);                   // 借用 bVII
      if (has(10) && has(4) && !has(11)) make(0, [0, 4, 7, 10], 'maj', true); // V/IV -> IV
      if (has(8) && !has(4)) make(3, [5, 8, 12], 'min', true);           // 借用 iv -> I
    }
    return list;
  }
  function chordFit(tones, pc, weight) {
    var sc = 0, w = Math.max(weight, 1e-9);
    var minorTriad = tones.length >= 3 && (tones[1] - tones[0] + 12) % 12 === 3;
    var majorTriad = tones.length >= 3 && (tones[1] - tones[0] + 12) % 12 === 4;
    var fifthOnly = tones.length >= 3 && !pc[tones[0]] && !pc[tones[1]];
    for (var p = 0; p < 12; p++) {
      if (!pc[p]) continue;
      if (tones.indexOf(p) >= 0) { sc += (fifthOnly && p === tones[2] ? 2.9 : 3) * pc[p] / w; continue; }
      if (minorTriad && (p - tones[0] + 12) % 12 === 10) sc += 0.35 * pc[p] / w;
      for (var i = 0; i < tones.length; i++) {
        var interval = (p - tones[i] + 12) % 12;
        if (interval === 1) sc -= 0.9 * pc[p] / w;
        else if (interval === 11) {
          var consonantColor = (i === 0 && majorTriad) || (i === 1 && minorTriad);
          sc -= (consonantColor ? 0.18 : 0.9) * pc[p] / w;
        } else if (interval === 6) sc -= 0.45 * pc[p] / w;
      }
    }
    return sc;
  }
  /* 功能进行的偏好：V→I、IV→V、ii→V、vi→IV 之类加分，生硬的退行略减分 */
  var MOTION = [
    [0, 0.06, 0.02, 0.14, 0.12, 0.12, -0.1],
    [0, 0, -0.04, 0.04, 0.18, 0.02, 0.04],
    [0.02, 0, 0, 0.1, 0.02, 0.15, -0.1],
    [0.12, 0.06, 0.04, 0, 0.15, 0.04, -0.05],
    [0.2, -0.04, 0.02, 0.02, 0, 0.12, -0.05],
    [0.02, 0.1, 0.04, 0.15, 0.08, 0, -0.1],
    [0.14, -0.05, 0.08, -0.05, 0.02, 0.02, 0]
  ];
  var MOTION_MINOR = [
    [0, -0.05, 0.08, 0.12, 0.1, 0.14, 0.1],
    [0.02, 0, 0, 0, 0.18, 0, 0],
    [0.04, 0, 0, 0.1, 0.02, 0.12, 0.08],
    [0.12, 0, 0.02, 0, 0.15, 0.04, 0.1],
    [0.2, 0, 0, 0, 0, 0.12, 0],
    [0.02, 0.04, 0.06, 0.1, 0.06, 0, 0.16],
    [0.14, 0, 0.12, 0, 0, 0.04, 0]
  ];
  function sameChord(a, b) { return a.key === b.key && a.minor === b.minor && a.root === b.root && a.quality === b.quality; }
  function motion(a, b) {
    if (a.key !== b.key || a.minor !== b.minor) return 0;
    if (a.quality === 'sus4' && b.root === a.root && b.quality === 'maj') return 0.1;
    if (a.chromatic) {
      var goal = a.minor ? (a.degree === 1 ? 4 : a.degree === 0 ? 3 : 0) :
        a.degree === 5 ? 1 : a.degree === 1 ? 4 : a.degree === 2 ? 5 : a.degree === 0 ? (a.quality === 'dim' ? 1 : 3) :
        a.degree === 4 ? 5 : a.degree === 3 && a.quality === 'dim' ? 4 : 0;
      if (a.quality === 'maj' && a.degree === 5 && !a.minor && b.degree === 6 && b.quality === 'maj') return 0.24; // bVI -> bVII
      return b.degree === goal && !b.chromatic ? 0.3 : -0.1;
    }
    if (b.chromatic) {
      // Reward natural approaches to secondary dominants, borrowed chords, and chromatic passing dim7.
      if (!b.minor && b.quality === 'min' && b.degree === 3 && a.degree === 3) return 0.22; // IV -> iv
      if (!b.minor && b.degree === 2 && b.quality === 'maj' && (a.degree === 0 || a.degree === 2 || a.degree === 3)) return 0.16; // -> V/vi
      if (!b.minor && b.degree === 1 && b.quality === 'maj' && (a.degree === 0 || a.degree === 5 || a.degree === 1)) return 0.15; // -> V/V
      if (!b.minor && b.degree === 5 && b.quality === 'maj' && (a.degree === 0 || a.degree === 5)) return 0.16; // -> V/ii or bVI
      if (!b.minor && b.degree === 0 && b.quality === 'maj' && a.degree === 0) return 0.16; // I -> V/IV
      if (!b.minor && b.degree === 6 && b.quality === 'maj' && (a.degree === 3 || a.degree === 4 || a.degree === 5)) return 0.15; // -> bVII
      if (b.quality === 'dim' && (a.degree === 0 || a.degree === 3 || a.degree === 4)) return 0.18; // passing dim7
      if (b.minor && b.degree === 4 && b.quality === 'maj' && (a.degree === 1 || a.degree === 3 || a.degree === 5)) return 0.16; // -> V
      return 0.04;
    }
    return (a.minor ? MOTION_MINOR : MOTION)[a.degree][b.degree];
  }

  /* 进行模板只在旋律给不出明确答案时起作用（长音、空拍），给段落一个熟悉的走向 */
  var TEMPLATES = {
    canon: [0, 4, 5, 2, 3, 0, 3, 4], royal: [3, 4, 2, 5], axis: [0, 4, 5, 3], axis6: [5, 3, 0, 4],
    doowop: [0, 5, 3, 4], turn: [1, 4, 0, 5], plagal: [0, 3, 0, 4], lift: [3, 4, 3, 4], descend: [3, 2, 1, 4],
    rock: [0, 3, 4, 3], folk: [0, 3, 4, 0], stay: [0, 0, 3, 4], jazz: [1, 4, 0, 0], jazz2: [0, 5, 1, 4],
    polka: [0, 4, 4, 0], polka2: [0, 3, 4, 0], royal2: [3, 4, 5, 0],
    enka: [0, 3, 0, 4], enka2: [0, 0, 3, 4], enkaMaj: [0, 5, 3, 4], dream: [0, 3, 5, 3], dream2: [3, 0, 3, 4],
    synth: [5, 3, 0, 4], synth2: [0, 6, 3, 0], chip: [0, 5, 3, 4], chip2: [3, 4, 2, 5],
    city4536: [3, 4, 2, 5, 1, 4, 0, 0], marunouchi: [3, 4, 2, 5, 3, 4, 0, 5],
    bossaTurn: [3, 2, 1, 4, 0, 5, 1, 4], climb: [0, 6, 5, 4, 3, 2, 1, 4],
    dream4: [3, 0, 4, 5, 3, 0, 1, 4], minorRoyal: [5, 6, 0, 0, 5, 6, 2, 4],
    ballad90s: [0, 4, 5, 2, 3, 0, 1, 4], balladWarm: [3, 4, 2, 5, 1, 4, 0, 0],
    balladBittersweet: [5, 3, 0, 4, 5, 3, 1, 4], citySmooth: [3, 2, 1, 0], neoPop: [3, 4, 5, 2],
    epic: [0, 5, 2, 6], fall: [0, 6, 5, 6], rise: [5, 6, 0, 0], plainMinor: [0, 3, 4, 0], cycle: [0, 3, 6, 2], lament: [0, 6, 5, 4],
    sardineCycle: [3, 6, 2, 5, 1, 4, 0, 4]
  };

  /* ---------------- 伴奏音型库 ----------------
     位置按小节内拍数（0–4）；时值 0 = 连到下一个音。
     贝斯音：R 低音（可能是转位音）、5 五音、3 三音、O 高八度、A 向下一个和弦的低音靠近（仍取和弦音）。 */
  var BASS = {
    // 抒情：先让根音唱足，第二小节才用五音与和弦内趋向音收句。
    balladHold: { even: [[0, 3.9, 'R', 1]],
      odd: [[0, 2.85, 'R', 1], [3, 0.42, '5', 0.72], [3.5, 0.42, 'A', 0.68]] },
    balladFretless: { even: [[0, 3.85, 'R', 1]],
      odd: [[0, 2.85, 'R', 1], [3.5, 0.45, 'A', 0.72]] },
    balladLift: { even: [[0, 1.9, 'R', 1], [2, 1.4, '5', 0.8], [3.5, 0.42, 'A', 0.68]],
      odd: [[0, 2.85, 'R', 1], [3, 0.42, '5', 0.72], [3.5, 0.42, 'A', 0.68]] },
    balladWalk: { even: [[0, 1.85, 'R', 1], [2, 0.9, '5', 0.82], [3, 0.88, '3', 0.76]],
      odd: [[0, 1.85, 'R', 1], [2, 0.9, '5', 0.82], [3, 0.44, 'O', 0.78], [3.5, 0.44, 'A', 0.72]] },
    popBounce: { even: [[0, 0.9, 'R', 1], [1.5, 0.42, 'O', 0.8], [2, 1.35, 'R', 0.94], [3.5, 0.42, '5', 0.78]],
      odd: [[0, 0.9, 'R', 1], [1.5, 0.42, '5', 0.8], [2, 0.9, 'R', 0.94], [3, 0.42, '3', 0.8], [3.5, 0.42, 'A', 0.82]] },
    cityWalk: { even: [[0, 0.65, 'R', 1], [0.75, 0.2, 'O', 0.74], [1.5, 0.4, '3', 0.82], [2, 0.85, '5', 0.88], [3.5, 0.4, 'A', 0.82]],
      odd: [[0, 0.65, 'R', 1], [0.75, 0.2, 'O', 0.76], [1.5, 0.4, '5', 0.84], [2, 0.85, 'R', 0.9], [3, 0.42, '3', 0.82], [3.5, 0.42, 'A', 0.86]] },
    whole: [[0, 0, 'R', 1]],
    half: [[0, 0, 'R', 1], [2, 0, 'R', 0.9]],
    rootFifth: [[0, 1.9, 'R', 1], [2, 1.4, '5', 0.85], [3.5, 0, 'A', 0.75]],
    sync: [[0, 1.4, 'R', 1], [1.5, 0.9, 'R', 0.86], [2.5, 0.45, 'R', 0.8], [3, 0.45, 'R', 0.9], [3.5, 0.4, 'A', 0.78]],
    eighth: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.42, i === 7 ? 'A' : 'R', i % 2 ? 0.8 : i % 4 ? 0.9 : 1]; }),
    sync8: [[0, 0.45, 'R', 1], [0.5, 0.4, 'R', 0.78], [1, 0.45, 'R', 0.9], [1.5, 0.4, 'O', 0.78], [2, 0.45, 'R', 0.95],
      [2.5, 0.4, 'R', 0.78], [3, 0.45, '5', 0.9], [3.5, 0.4, 'A', 0.82]],
    rock8: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.3, 'R', i % 2 ? 0.82 : 1]; }),
    pump: [[0.5, 0.4, 'R', 0.95], [1.5, 0.4, 'R', 0.9], [2.5, 0.4, 'R', 0.95], [3.5, 0.4, 'R', 0.9]],
    // 电子短循环：正拍立住根音，弱拍/附点穿插八度与五音；第二小节句尾加趋向音转接。
    seqSardine: {
      even: [[0, 0.65, 'R', 1], [0.75, 0.22, 'O', 0.84], [1, 0.44, 'R', 0.92], [1.5, 0.44, 'O', 0.84],
        [2, 0.65, 'R', 0.96], [2.75, 0.22, 'O', 0.84], [3, 0.44, 'R', 0.92], [3.5, 0.44, 'O', 0.86]],
      odd: [[0, 0.65, 'R', 1], [0.75, 0.22, 'O', 0.84], [1, 0.44, 'R', 0.92], [1.5, 0.44, 'O', 0.84],
        [2, 0.65, 'R', 0.96], [2.75, 0.22, '5', 0.82], [3, 0.44, 'R', 0.9], [3.5, 0.44, 'A', 0.86]]
    },
    seqEighth: {
      even: eighthSequence(false), odd: eighthSequence(true)
    },
    seqTresillo: {
      even: [[0, 0.65, 'R', 1], [0.75, 0.65, '5', 0.86], [1.5, 0.42, 'O', 0.84],
        [2, 0.65, 'R', 0.96], [2.75, 0.65, 'O', 0.86], [3.5, 0.42, '5', 0.84]],
      odd: [[0, 0.65, 'R', 1], [0.75, 0.65, '5', 0.86], [1.5, 0.42, 'O', 0.84],
        [2, 0.65, 'R', 0.96], [2.75, 0.42, 'O', 0.86], [3.25, 0.22, '5', 0.78], [3.5, 0.42, 'A', 0.86]]
    },
    seqSync: {
      even: [[0, 0.6, 'R', 1], [0.75, 0.6, 'R', 0.8], [1.5, 0.35, 'O', 0.75], [2, 0.6, 'R', 0.95], [2.75, 0.6, '5', 0.8], [3.5, 0.35, 'R', 0.78]],
      odd: [[0, 0.6, 'R', 1], [0.75, 0.6, 'R', 0.8], [1.5, 0.35, 'O', 0.75], [2, 0.6, 'R', 0.95], [2.75, 0.2, '5', 0.74], [3, 0.35, 'R', 0.88], [3.5, 0.35, 'A', 0.76]]
    },
    octave: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.35, i % 2 ? 'O' : 'R', i % 2 ? 0.78 : 0.95]; }),
    funk: [[0, 0.6, 'R', 1], [0.75, 0.2, 'O', 0.7], [1.5, 0.4, 'R', 0.85], [2, 0.3, 'R', 0.9], [2.5, 0.4, '5', 0.8],
      [3.25, 0.2, 'O', 0.7], [3.5, 0.4, 'A', 0.85]],
    bossa: [[0, 1.4, 'R', 1], [1.5, 0.45, '5', 0.8], [2, 1.4, '5', 0.92], [3.5, 0.45, 'R', 0.8]],
    oompah8: [[0, 0.45, 'R', 1], [1, 0.45, '5', 0.88], [2, 0.45, 'R', 0.95], [3, 0.45, '5', 0.88]],
    // 演歌的两拍贝斯：根—五，小节末向下一个和弦靠
    enka: [[0, 0.9, 'R', 1], [1, 0.9, '5', 0.82], [2, 0.9, 'R', 0.92], [3, 0.45, '5', 0.8], [3.5, 0.4, 'A', 0.75]],
    // 台语参考的慢八拍：低音与吉他错开，第二小节才收短接下一和弦。
    enkaSlow: [[0, 1.35, 'R', 1], [1.5, 0.4, '5', 0.76], [2, 1.35, 'R', 0.92], [3.5, 0.4, '5', 0.78]],
    enkaSlowTurn: [[0, 1.35, 'R', 1], [1.5, 0.4, '5', 0.76], [2, 0.85, 'R', 0.92], [3, 0.4, '5', 0.8], [3.5, 0.4, 'A', 0.74]],
    synthOct: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.3, i % 2 ? 'O' : 'R', i % 2 ? 0.82 : 1]; }),
    chipJump: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.4, i % 4 === 3 ? '5' : i % 2 ? 'O' : 'R', i % 2 ? 0.85 : 1]; }),
    oompah4: [[0, 0.8, 'R', 1], [2, 0.8, '5', 0.9]],
    lhBroken: [[0, 0.5, 'R', 1], [0.5, 0.5, '5', 0.7], [1, 0.5, 'O', 0.75], [1.5, 0.5, '5', 0.68],
      [2, 0.5, 'R', 0.9], [2.5, 0.5, '5', 0.7], [3, 0.5, 'O', 0.75], [3.5, 0.5, '3', 0.68]],
    lhOctave: [[0, 1.9, 'R', 1], [0, 1.9, 'O', 0.8], [2, 1.4, '5', 0.85], [3.5, 0.45, 'A', 0.7]],
    lhWhole: [[0, 0, 'R', 0.9], [0, 0, '5', 0.7]],
    // 两小节轮转律动：第一小节用八度/五音咬住律动，第二小节用三音和趋向音转接下一和弦。
    popGroove: {
      even: [[0, 1.4, 'R', 1], [1.5, 0.42, 'O', 0.82], [2, 1.4, 'R', 0.94], [3.5, 0.42, '5', 0.78]],
      odd: [[0, 1.4, 'R', 1], [1.5, 0.42, '5', 0.8], [2, 0.9, 'R', 0.94], [3, 0.42, 'O', 0.82], [3.5, 0.42, 'A', 0.78]]
    },
    funkSlap: {
      even: [[0, 0.55, 'R', 1], [0.75, 0.2, 'O', 0.74], [1.5, 0.4, '5', 0.85], [2, 0.35, 'R', 0.9], [2.75, 0.2, 'O', 0.72], [3.5, 0.4, '3', 0.84]],
      odd: [[0, 0.55, 'R', 1], [0.75, 0.2, 'O', 0.76], [1.5, 0.4, 'R', 0.86], [2, 0.35, '5', 0.9], [2.75, 0.2, 'O', 0.74], [3.25, 0.2, '5', 0.72], [3.5, 0.4, 'A', 0.88]]
    },
    rockDrive: {
      even: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.3, i === 6 ? '5' : 'R', i % 2 ? 0.82 : 1]; }),
      odd: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) { return [p, 0.3, i === 7 ? 'A' : i === 5 ? '5' : 'R', i % 2 ? 0.82 : 1]; })
    },
    guofengFlow: {
      even: [[0, 1.9, 'R', 1], [2, 1.4, '5', 0.84], [3.5, 0.42, 'O', 0.72]],
      odd: [[0, 1.9, 'R', 1], [2, 0.9, '5', 0.84], [3, 0.45, '3', 0.76], [3.5, 0.42, 'A', 0.75]]
    },
    seqBounce: {
      even: [[0, 0.42, 'R', 1], [0.75, 0.35, 'R', 0.82], [1.5, 0.35, 'O', 0.8], [2, 0.42, 'R', 0.95], [2.75, 0.35, '5', 0.82], [3.5, 0.35, 'O', 0.78]],
      odd: [[0, 0.42, 'R', 1], [0.75, 0.35, 'R', 0.82], [1.5, 0.35, 'O', 0.8], [2, 0.42, 'R', 0.95], [2.5, 0.35, '5', 0.82], [3, 0.35, 'O', 0.86], [3.5, 0.35, 'A', 0.78]]
    },
    // 半小节脉动低音：正拍立稳根音，1.5 拍五音/八度推拍，第二小节末用趋向音转接。
    daPulse: {
      even: [[0, 1.4, 'R', 1], [1.5, 0.42, '5', 0.8], [2, 1.4, 'R', 0.94], [3.5, 0.42, 'O', 0.78]],
      odd: [[0, 1.4, 'R', 1], [1.5, 0.42, '5', 0.8], [2, 0.9, 'R', 0.94], [3, 0.42, '5', 0.82], [3.5, 0.42, 'A', 0.8]]
    },
    daDrive: {
      even: [[0, 0.45, 'R', 1], [0.5, 0.4, '5', 0.78], [1, 0.45, 'R', 0.9], [1.5, 0.4, 'O', 0.82], [2, 0.45, 'R', 0.96], [2.5, 0.4, '5', 0.8], [3, 0.45, 'R', 0.9], [3.5, 0.4, 'O', 0.82]],
      odd: [[0, 0.45, 'R', 1], [0.5, 0.4, '5', 0.78], [1, 0.45, 'R', 0.9], [1.5, 0.4, 'O', 0.82], [2, 0.45, 'R', 0.96], [2.5, 0.4, '5', 0.8], [3, 0.45, '3', 0.86], [3.5, 0.4, 'A', 0.84]]
    }
  };
  function eighths(fn) { return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(fn); }
  function eighthSequence(answer) {
    if (!answer) {
      return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(function (p, i) {
        return [p, 0.44, i % 2 ? 'O' : 'R', i % 2 ? 0.82 : i % 4 ? 0.92 : 1];
      });
    }
    return [[0, 0.44, 'R', 1], [0.5, 0.42, 'O', 0.82], [1, 0.44, 'R', 0.92], [1.5, 0.42, 'O', 0.82],
      [2, 0.44, 'R', 0.96], [2.5, 0.22, 'R', 0.78], [2.75, 0.22, 'O', 0.84], [3, 0.44, '5', 0.9], [3.5, 0.42, 'A', 0.84]];
  }
  /* 和弦型：[位置, 时值, 力度, 声部]；full 全部、top 上方三音、D/U 吉他下扫/上扫、power 强力和弦。
     带 even/odd 的音型两小节一循环（巴萨的拨弦律动）。 */
  var COMP = {
    balladPiano: { even: [[0, 2.85, 1, 'full'], [3, 0.85, 0.72, 'top']],
      odd: [[0, 1.9, 0.94, 'full'], [2.5, 1.35, 0.78, 'top']] },
    balladPianoSwell: { even: [[0, 2.9, 1, 'full'], [3, 0.9, 0.76, 'top']],
      odd: [[0, 1.9, 0.96, 'full'], [2, 1.85, 0.84, 'top']] },
    balladEPWarm: { even: [[0, 2.85, 0.96, 'full'], [3, 0.85, 0.7, 'top']],
      odd: [[0, 3.6, 0.94, 'full']] },
    popPulse8: { even: [[0, 0.9, 1, 'full'], [1, 0.45, 0.82, 'top'], [1.5, 0.9, 0.88, 'full'], [2.5, 0.45, 0.8, 'top'], [3, 0.85, 0.9, 'full']],
      odd: [[0, 0.9, 1, 'full'], [1, 0.45, 0.82, 'top'], [2, 0.9, 0.92, 'full'], [3, 0.42, 0.82, 'top'], [3.5, 0.42, 0.84, 'top']] },
    whole: [[0, 0, 1, 'full']],
    half: [[0, 1.9, 1, 'full'], [2, 1.9, 0.88, 'full']],
    stab: [[0, 1.4, 1, 'full'], [1.5, 0.45, 0.8, 'top'], [2.5, 1.3, 0.9, 'full']],
    push: [[0, 0.9, 1, 'full'], [1.5, 0.45, 0.85, 'full'], [2, 0.9, 0.9, 'full'], [3.5, 0.45, 0.85, 'top']],
    quarter: [[0, 0.8, 1, 'full'], [1, 0.8, 0.8, 'full'], [2, 0.8, 0.9, 'full'], [3, 0.8, 0.8, 'full']],
    drive: eighths(function (p, i) { return [p, 0.38, i % 2 ? 0.7 : 1, 'full']; }),
    offbeat: [[0.5, 0.35, 1, 'full'], [1.5, 0.35, 0.9, 'full'], [2.5, 0.35, 1, 'full'], [3.5, 0.35, 0.9, 'full']],
    enkaChop: [[0.5, 0.24, 0.9, 'top'], [1.5, 0.24, 1, 'top'], [2.5, 0.24, 0.86, 'top'], [3.5, 0.24, 1, 'top']],
    enkaChopTurn: [[0.5, 0.24, 0.9, 'top'], [1.5, 0.24, 1, 'top'], [2.5, 0.24, 0.86, 'top'], [3, 0.2, 0.72, 'top'], [3.5, 0.24, 1, 'top']],
    seqOff: {
      even: [[0.5, 0.34, 1, 'full'], [1.5, 0.34, 0.86, 'full'], [2.5, 0.34, 0.96, 'full'], [3.5, 0.34, 0.88, 'full']],
      odd: [[0.5, 0.34, 1, 'full'], [1.5, 0.34, 0.86, 'full'], [2.5, 0.34, 0.96, 'full'], [3.25, 0.2, 0.72, 'top'], [3.5, 0.32, 0.9, 'full']]
    },
    seqSync: {
      even: [[0.5, 0.22, 0.86, 'full'], [0.75, 0.22, 0.78, 'top'], [1.5, 0.4, 0.98, 'full'],
        [2.5, 0.22, 0.88, 'full'], [2.75, 0.22, 0.78, 'top'], [3.5, 0.4, 0.94, 'full']],
      odd: [[0.5, 0.22, 0.86, 'full'], [0.75, 0.22, 0.78, 'top'], [1.5, 0.4, 0.98, 'full'],
        [2.5, 0.4, 0.94, 'full'], [3.25, 0.2, 0.74, 'top'], [3.5, 0.34, 0.9, 'full']]
    },
    seqTresillo: {
      even: [[0, 0.52, 0.96, 'full'], [0.75, 0.52, 0.84, 'top'], [1.5, 0.38, 0.92, 'full'],
        [2, 0.52, 0.94, 'full'], [2.75, 0.52, 0.84, 'top'], [3.5, 0.38, 0.9, 'full']],
      odd: [[0, 0.52, 0.96, 'full'], [0.75, 0.52, 0.84, 'top'], [1.5, 0.38, 0.92, 'full'],
        [2, 0.52, 0.94, 'full'], [2.75, 0.34, 0.84, 'top'], [3.25, 0.2, 0.74, 'top'], [3.5, 0.34, 0.9, 'full']]
    },
    charleston: [[0, 1.2, 1, 'full'], [1.5, 0.4, 0.85, 'full'], [2.75, 0.9, 0.9, 'full']],
    push16: [[0, 0.6, 1, 'full'], [0.75, 0.2, 0.7, 'top'], [1.5, 0.4, 0.85, 'full'], [2.75, 0.6, 0.95, 'full'], [3.5, 0.3, 0.75, 'top']],
    blocks: [[0, 1.9, 1, 'full'], [2, 0.9, 0.85, 'full'], [3, 0.9, 0.8, 'top']],
    strumFolk: [[0, 0.95, 1, 'D'], [1, 0.45, 0.85, 'D'], [1.5, 0.45, 0.7, 'U'], [2.5, 0.45, 0.75, 'U'], [3, 0.45, 0.9, 'D'], [3.5, 0.45, 0.7, 'U']],
    strumSlow: [[0, 1.9, 1, 'D'], [2, 0.95, 0.9, 'D'], [3, 0.45, 0.8, 'D'], [3.5, 0.45, 0.7, 'U']],
    strumPop: [[0, 0.7, 1, 'D'], [0.75, 0.7, 0.7, 'U'], [1.5, 0.45, 0.8, 'U'], [2, 0.95, 0.9, 'D'], [3, 0.45, 0.8, 'D'], [3.5, 0.45, 0.7, 'U']],
    strumHold: [[0, 0, 1, 'D']],
    mute8: eighths(function (p, i) { return [p, 0.2, i % 2 ? 0.7 : 0.95, 'power']; }),
    power8: eighths(function (p, i) { return [p, 0.45, i % 2 ? 0.8 : 1, 'power']; }),
    powerHold: [[0, 1.9, 1, 'power'], [2, 1.4, 0.9, 'power'], [3.5, 0.45, 0.8, 'power']],
    bossa: { even: [[0, 0.45, 1, 'top'], [1, 0.45, 0.85, 'top'], [1.5, 0.9, 0.9, 'top'], [3, 0.95, 0.88, 'top']],
      odd: [[0.5, 0.9, 0.9, 'top'], [1.5, 0.45, 0.85, 'top'], [2.5, 0.9, 0.9, 'top'], [3.5, 0.45, 0.8, 'top']] },
    bossaSoft: [[0, 1.4, 1, 'top'], [1.5, 0.9, 0.85, 'top'], [3, 0.95, 0.85, 'top']],
    oompah8: [[0.5, 0.35, 1, 'top'], [1.5, 0.35, 0.9, 'top'], [2.5, 0.35, 1, 'top'], [3.5, 0.35, 0.9, 'top']],
    oompah4: [[1, 0.6, 1, 'top'], [3, 0.6, 0.92, 'top']],
    pump: [[0.25, 0.7, 1, 'full'], [1.25, 0.7, 0.9, 'full'], [2.25, 0.7, 0.95, 'full'], [3.25, 0.7, 0.9, 'full']],
    synthStab: [[0, 0.3, 1, 'full'], [0.75, 0.3, 0.8, 'full'], [1.5, 0.3, 0.85, 'full'], [2.5, 0.3, 0.9, 'full'], [3, 0.3, 0.8, 'top'], [3.5, 0.3, 0.85, 'full']],
    chip16: eighths(function (p, i) { return [p, 0.22, i % 2 ? 0.75 : 1, i % 2 ? 'top' : 'full']; }),
    popSync: {
      even: [[0, 0.9, 1, 'full'], [1, 0.4, 0.78, 'top'], [1.5, 0.9, 0.88, 'full'], [2.5, 0.45, 0.78, 'top'], [3, 0.85, 0.9, 'full']],
      odd: [[0, 0.9, 1, 'full'], [1.5, 0.45, 0.85, 'full'], [2.25, 0.4, 0.74, 'top'], [3, 0.45, 0.86, 'top'], [3.5, 0.45, 0.82, 'top']]
    },
    cityComp: {
      even: [[0, 0.35, 1, 'full'], [0.75, 0.32, 0.82, 'top'], [1.5, 0.55, 0.9, 'full'], [2.5, 0.35, 0.8, 'top'], [3, 0.65, 0.88, 'full']],
      odd: [[0, 0.35, 1, 'full'], [0.75, 0.32, 0.82, 'top'], [1.5, 0.45, 0.9, 'full'], [2.75, 0.4, 0.85, 'top'], [3.5, 0.38, 0.82, 'full']]
    },
    synthPulse: {
      even: [[0, 0.3, 1, 'full'], [0.5, 0.25, 0.76, 'top'], [1.5, 0.3, 0.88, 'full'], [2.5, 0.25, 0.78, 'top'], [3, 0.3, 0.85, 'full'], [3.5, 0.25, 0.8, 'top']],
      odd: [[0, 0.3, 1, 'full'], [0.75, 0.25, 0.8, 'top'], [1.5, 0.3, 0.88, 'full'], [2.25, 0.25, 0.76, 'top'], [3, 0.3, 0.86, 'full'], [3.5, 0.25, 0.82, 'top']]
    },
    // 吉他八分脉动，与明快的副歌钢琴柱式/切分和弦
    daPulse: {
      even: [[0, 0.65, 1, 'D'], [0.5, 0.65, 0.78, 'top'], [1, 0.65, 0.92, 'D'], [1.5, 0.65, 0.76, 'top'],
        [2, 0.65, 0.96, 'D'], [2.5, 0.65, 0.78, 'top'], [3, 0.65, 0.9, 'D'], [3.5, 0.65, 0.78, 'top']],
      odd: [[0, 0.65, 1, 'D'], [0.5, 0.65, 0.78, 'top'], [1, 0.65, 0.92, 'D'], [1.5, 0.42, 0.82, 'top'],
        [2, 0.65, 0.96, 'D'], [2.5, 0.65, 0.78, 'top'], [3, 0.42, 0.88, 'D'], [3.5, 0.42, 0.84, 'U']]
    },
    daPianoChorus: {
      even: [[0, 0.9, 1, 'full'], [1, 0.85, 0.84, 'top'], [2, 0.9, 0.94, 'full'], [3, 0.45, 0.82, 'top'], [3.5, 0.45, 0.88, 'full']],
      odd: [[0, 0.9, 1, 'full'], [1, 0.42, 0.82, 'top'], [1.5, 0.45, 0.86, 'full'], [2, 0.9, 0.95, 'full'], [3, 0.42, 0.84, 'top'], [3.5, 0.45, 0.9, 'top']]
    }
  };
  /* 分解：下标指向「和弦排位 + 高八度」这串音 */
  function arpFrom(order, step, dur) {
    return order.map(function (idx, i) { return [i * step, dur, idx, i % (1 / step) ? 0.78 : 1]; });
  }
  var ARP = {
    // 两小节的指弹呼吸：低弦留住，上方音彼此交叠；第二小节中间留白。
    balladPick: { even: [[0, 1.9, 0, 1], [0.5, 1.4, 2, 0.72], [1, 0.9, 3, 0.8], [1.5, 0.65, 1, 0.7],
      [2, 1.9, 0, 0.92], [2.5, 1.4, 2, 0.72], [3, 0.9, 3, 0.8], [3.5, 0.42, 1, 0.66]],
      odd: [[0, 2.85, 0, 1], [0.5, 2.35, 2, 0.72], [1, 1.85, 3, 0.8], [1.5, 1.35, 1, 0.7],
        [3, 0.85, 2, 0.76], [3.5, 0.42, 1, 0.66]] },
    balladPickSlow: { even: [[0, 1.9, 0, 1], [1, 0.9, 2, 0.76], [2, 1.9, 1, 0.9], [3, 0.9, 3, 0.72]],
      odd: [[0, 2.85, 0, 1], [1, 1.85, 2, 0.76], [3, 0.9, 1, 0.72]] },
    balladPickFlow: { even: [[0, 2.2, 0, 1], [0.5, 1.7, 2, 0.74], [1, 1.2, 3, 0.82], [1.5, 0.9, 1, 0.72],
      [2, 1.9, 4, 0.88], [2.5, 1.4, 2, 0.74], [3, 0.9, 3, 0.78], [3.5, 0.45, 1, 0.68]],
      odd: [[0, 2.85, 0, 1], [0.5, 2.35, 2, 0.74], [1, 1.85, 3, 0.82], [1.5, 1.35, 1, 0.7],
        [2.5, 1.35, 4, 0.8], [3, 0.85, 2, 0.76], [3.5, 0.45, 1, 0.66]] },
    balladBellHook: { even: [[0, 1.4, 4, 0.84], [1.5, 1.2, 5, 0.76], [3, 0.9, 3, 0.72]],
      odd: [[0, 1.4, 4, 0.84], [1.5, 0.85, 5, 0.78], [2.5, 0.85, 3, 0.74]] },
    pianoFlow8: { even: arpFrom([0, 2, 3, 4, 5, 4, 3, 2], 0.5, 0.72), odd: arpFrom([0, 2, 4, 5, 3, 4, 2, 1], 0.5, 0.72) },
    citySparkle: { even: [[0.5, 0.42, 4, 0.82], [1.5, 0.65, 5, 0.88], [2.5, 0.42, 3, 0.78], [3.5, 0.42, 4, 0.82]],
      odd: [[0.5, 0.42, 4, 0.82], [1.5, 0.65, 5, 0.88], [2.75, 0.45, 3, 0.8], [3.5, 0.45, 5, 0.86]] },
    guofengWater: { even: arpFrom([0, 1, 3, 4, 5, 3, 4, 2], 0.5, 0.75), odd: arpFrom([0, 2, 4, 5, 3, 2, 1, 0], 0.5, 0.75) },
    balladGlimmer: [[1.5, 0.85, 1, 0.78], [3, 0.85, 2, 0.7]],
    enkaPick: arpFrom([0, 2, 1, 3, 0, 2, 4, 3], 0.5, 0.68),
    enkaPickTurn: arpFrom([0, 2, 1, 3, 0, 3, 2, 1], 0.5, 0.68),
    up8: arpFrom([0, 1, 2, 3, 4, 3, 2, 1], 0.5, 0.45),
    broken8: arpFrom([0, 2, 1, 3, 2, 4, 3, 1], 0.5, 0.45),
    up16: arpFrom([0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 3], 0.25, 0.22),
    // 上下折返的波形电子琶音，保持紧凑音区并在奇小节句尾加高音折返。
    seqMotif8: {
      even: [[0, 0.36, 0, 1], [0.5, 0.36, 2, 0.78], [1, 0.36, 1, 0.86], [1.5, 0.36, 3, 0.82],
        [2, 0.36, 2, 0.94], [2.5, 0.36, 1, 0.78], [3, 0.36, 0, 0.88], [3.5, 0.36, 2, 0.82]],
      odd: [[0, 0.36, 0, 1], [0.5, 0.36, 2, 0.78], [1, 0.36, 1, 0.86], [1.5, 0.36, 3, 0.82],
        [2, 0.36, 2, 0.94], [2.5, 0.36, 3, 0.82], [3, 0.36, 4, 0.9], [3.5, 0.36, 3, 0.82]]
    },
    seqMotif16: { even: sequenceMotif(false), odd: sequenceMotif(true) },
    pick: arpFrom([0, 2, 3, 2, 1, 2, 3, 4], 0.5, 0.9),
    zheng: arpFrom([0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 5, 4, 3, 2], 0.25, 0.4),
    sparkle: [[0, 0.9, 5, 1], [1.5, 0.45, 4, 0.8], [3, 0.9, 3, 0.85]],
    roll: [[0, 1.9, 0, 1], [0.25, 1.65, 1, 0.85], [0.5, 1.4, 2, 0.8], [0.75, 1.15, 3, 0.8], [2, 1.9, 1, 0.9], [2.5, 1.4, 3, 0.8]],
    // 梦幻流行：每个分解音都延音交叠，像挂了大混响与延迟的吉他
    shimmer: arpFrom([0, 2, 4, 3, 5, 3, 4, 2], 0.5, 1.6),
    shimmerSlow: [[0, 3.9, 0, 1], [1, 2.9, 2, 0.85], [2, 1.9, 4, 0.9], [3, 0.95, 3, 0.8]],
    chipRun: arpFrom([0, 2, 4, 5, 4, 2, 0, 2, 1, 3, 5, 3, 1, 3, 4, 3], 0.25, 0.2),
    pianoArpCh: { even: arpFrom([0, 2, 3, 4, 2, 4, 3, 2], 0.5, 0.68), odd: arpFrom([0, 2, 3, 5, 4, 3, 2, 1], 0.5, 0.68) },
    marimbaCounter: { even: [[0.5, 0.35, 2, 0.78], [1.5, 0.35, 3, 0.82], [2.5, 0.35, 4, 0.8], [3, 0.35, 2, 0.74]],
      odd: [[0.5, 0.35, 3, 0.8], [1.5, 0.35, 4, 0.85], [2.5, 0.35, 2, 0.76], [3.5, 0.35, 3, 0.78]] },
    harpSweep: { even: [[0, 1.4, 0, 0.9], [0.25, 1.2, 2, 0.78], [0.5, 1.0, 3, 0.82], [0.75, 0.9, 5, 0.85], [2, 1.2, 4, 0.76]],
      odd: [[0, 1.4, 0, 0.9], [0.25, 1.2, 1, 0.78], [0.5, 1.0, 3, 0.82], [2, 1.2, 2, 0.78], [3, 0.85, 4, 0.82]] },
    musicBoxTop: { even: [[0, 0.85, 4, 0.92], [1, 0.85, 5, 0.84], [2, 0.85, 3, 0.86], [3, 0.85, 2, 0.78]],
      odd: [[0, 0.85, 4, 0.92], [1.5, 0.65, 5, 0.86], [2.5, 0.65, 4, 0.82], [3.5, 0.45, 3, 0.78]] },
    daCascade: {
      even: [[0, 0.45, 4, 0.9], [0.5, 0.45, 2, 0.76], [1, 0.45, 3, 0.84], [2, 0.85, 5, 0.92], [3, 0.45, 3, 0.8], [3.5, 0.45, 4, 0.84]],
      odd: [[0, 0.45, 4, 0.9], [1.5, 0.45, 5, 0.86], [2.5, 0.42, 3, 0.8], [3, 0.22, 4, 0.84], [3.25, 0.22, 5, 0.9], [3.5, 0.45, 3, 0.84]]
    },
    daBellTop: {
      even: [[0, 0.85, 5, 0.88], [2, 0.85, 4, 0.84]],
      odd: [[0, 0.85, 5, 0.88], [2.5, 0.42, 4, 0.8], [3.5, 0.45, 5, 0.9]]
    }
  };
  function sequenceMotif(answer) {
    var order = answer
      ? [0, 1, 2, 3, 2, 1, 0, 2, 4, 3, 2, 1, 3, 2, 1, 0]
      : [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 2, 1, 0, 2];
    return order.map(function (idx, i) {
      return [i * 0.25, 0.21, idx, i % 4 === 0 ? 1 : i % 2 === 0 ? 0.82 : 0.72];
    });
  }
  /* 鼓：kick/snare/rim/clap/tom = [位置, 力度系数, 概率]；hat = 踩镲模式 */
  var GROOVE = {
    pop: {
      verse: [{ kick: [[0, 1], [2.5, 0.85], [1.75, 0.6, 0.3]], snare: [[1, 1], [3, 1]], hat: '8', ghost: 0.12 },
        { kick: [[0, 1], [1.5, 0.8], [2.5, 0.8, 0.5]], snare: [[1, 1], [3, 1]], hat: '8' }],
      pre: [{ kick: [[0, 1], [2, 0.9], [2.5, 0.8]], snare: [[1, 1], [3, 1]], hat: '8' }],
      chorus: [{ kick: [[0, 1], [0.75, 0.7, 0.4], [2, 0.95], [2.5, 0.8]], snare: [[1, 1], [3, 1]], hat: '8open', perc: [[1.5, 0.28], [3.5, 0.32]] },
        { kick: [[0, 1], [2, 0.95], [2.75, 0.75]], snare: [[1, 1], [3, 1]], clap: [[1, 0.8], [3, 0.8]], hat: 'ride4' }],
      lead: [{ kick: [[0, 0.8]], hat: '4' }]
    },
    soft: {
      verse: [{ kick: [[0, 0.85], [2.5, 0.6, 0.5]], rim: [[1, 0.8], [3, 0.8]], hat: '8soft' },
        { kick: [[0, 0.85], [2, 0.6]], rim: [[1, 0.8], [3, 0.8]] }],
      pre: [{ kick: [[0, 0.9], [2, 0.75]], snare: [[1, 0.75], [3, 0.8]], hat: '8soft' }],
      chorusRestrained: { kick: [[0, 0.88], [2, 0.68]], rim: [[1, 0.82], [3, 0.82]], hat: 'ride4' },
      chorus: [{ kick: [[0, 0.95], [2, 0.8], [2.5, 0.6]], snare: [[1, 0.9], [3, 0.9]], hat: '8', perc: [[1.5, 0.24], [3.5, 0.28]] },
        { kick: [[0, 0.95], [2.5, 0.8]], snare: [[1, 0.9], [3, 0.9]], hat: 'ride4', perc: [[1.5, 0.26], [3.5, 0.28]] }],
      lead: [{ kick: [[0, 0.7]], hat: '4soft' }]
    },
    rock: {
      verse: [{ kick: [[0, 1], [2, 0.9], [2.5, 0.8, 0.5]], snare: [[1, 1], [3, 1]], hat: '8' }],
      pre: [{ kick: [[0, 1], [1, 0.8], [2, 0.9], [3, 0.8]], snare: [[1, 1], [3, 1]], hat: '4' }],
      chorus: [{ kick: [[0, 1], [0.5, 0.7, 0.4], [2, 1], [2.5, 0.85]], snare: [[1, 1], [3, 1]], hat: 'ride8' },
        { kick: [[0, 1], [1.5, 0.8], [2, 1], [3.5, 0.7, 0.5]], snare: [[1, 1], [3, 1]], hat: '8open' }],
      lead: [{ kick: [[0, 0.9]], hat: '8' }]
    },
    edm: {
      verse: [{ kick: [[0, 1], [1, 0.9], [2, 0.96], [3, 0.9]], clap: [[1, 0.85], [3, 0.9]], hat: 'off16',
        perc: [[0.75, 0.34], [2.75, 0.36]] },
        { kick: [[0, 1], [1, 0.88], [2, 0.96], [3, 0.88]], snare: [[1, 0.82], [3, 0.86]], clap: [[1, 0.6], [3, 0.65]], hat: '8open',
          rim: [[0.75, 0.4], [1.75, 0.36], [2.75, 0.4], [3.75, 0.36]] }],
      pre: [{ kick: [[0, 1], [2, 0.9]], clap: [[1, 0.8], [3, 0.85]], hat: 'off', perc: [[0.75, 0.3], [2.75, 0.3]], build: true }],
      chorus: [{ kick: [[0, 1], [1, 0.92], [2, 1], [3, 0.92]], snare: [[1, 0.84], [3, 0.88]], clap: [[1, 0.68], [3, 0.72]], hat: 'off16',
        rim: [[0.75, 0.44], [1.75, 0.4], [2.75, 0.44], [3.75, 0.4]], perc: [[0.5, 0.3], [1.5, 0.32], [2.5, 0.3], [3.5, 0.34]] },
        { kick: [[0, 1], [1, 0.92], [2, 1], [3, 0.92]], snare: [[1, 0.82], [3, 0.86]], clap: [[1, 0.88], [3, 0.92]], hat: 'skipOff',
          perc: [[0.75, 0.42], [1.5, 0.34], [2.75, 0.42], [3.5, 0.34], [3.75, 0.36]] }],
      lead: [{ kick: [[0, 0.85], [2, 0.75]], hat: '4soft' }]
    },
    folk: {
      verse: [{ kick: [[0, 0.85], [2, 0.7]], rim: [[1, 0.75], [3, 0.75]], shaker: true }],
      pre: [{ kick: [[0, 0.9], [2, 0.75], [2.5, 0.6]], rim: [[1, 0.8], [3, 0.8]], shaker: true }],
      chorus: [{ kick: [[0, 0.95], [1.5, 0.6, 0.5], [2, 0.85]], snare: [[1, 0.85], [3, 0.85]], hat: '8', shaker: true }],
      lead: [{ kick: [[0, 0.7]], shaker: true }]
    },
    piano: {
      verse: [{ kick: [[0, 0.7]], rim: [[1, 0.55], [3, 0.55]] }],
      pre: [{ kick: [[0, 0.8], [2, 0.6]], rim: [[1, 0.65], [3, 0.65]], hat: '8soft' }],
      chorus: [{ kick: [[0, 0.85], [2.5, 0.65]], snare: [[1, 0.8], [3, 0.8]], hat: 'ride4' }],
      lead: [{ kick: [[0, 0.6]] }]
    },
    city: {
      verse: [{ kick: [[0, 1], [1.75, 0.7], [2.5, 0.85]], snare: [[1, 1], [3, 1]], hat: '16', ghost: 0.3 }],
      pre: [{ kick: [[0, 1], [2, 0.85], [2.5, 0.8]], snare: [[1, 1], [3, 1]], hat: '16', ghost: 0.2 }],
      chorus: [{ kick: [[0, 1], [0.75, 0.7], [2, 0.9], [2.5, 0.8]], snare: [[1, 1], [3, 1]], clap: [[1, 0.7], [3, 0.7]], hat: '16open', ghost: 0.25, perc: [[0.5, 0.22], [1.5, 0.32], [2.5, 0.22], [3.5, 0.34]] }],
      lead: [{ kick: [[0, 0.8]], hat: '16soft' }]
    },
    taiko: {
      verse: [{ kick: [[0, 0.9], [2.5, 0.6]], rim: [[1, 0.6], [3, 0.6]], tom: [[3.5, 0.6, 0.5]] }],
      pre: [{ kick: [[0, 0.95], [2, 0.8]], rim: [[1, 0.7], [3, 0.7]], tom: [[2.5, 0.65], [3.5, 0.7]], hat: '8soft' }],
      chorus: [{ kick: [[0, 1], [2, 0.85], [2.5, 0.75]], snare: [[1, 0.9], [3, 0.9]], hat: '8', tom: [[1.5, 0.7, 0.5], [3.5, 0.75]] }],
      lead: [{ kick: [[0, 0.8]], tom: [[2, 0.6], [3, 0.65]] }]
    },
    bossa: {
      // 交叉击边的巴萨克拉维（两小节循环），底鼓跟着贝斯的「一、二拍半」走
      verse: [{ kick: [[0, 0.7], [1.5, 0.55], [2, 0.65], [3.5, 0.55]], rimEven: [[0, 0.7], [1.5, 0.7], [3, 0.7]], rimOdd: [[1, 0.7], [2.5, 0.7]], hat: '8brush' }],
      pre: [{ kick: [[0, 0.75], [1.5, 0.6], [2, 0.7], [3.5, 0.6]], rimEven: [[0, 0.75], [1.5, 0.75], [3, 0.75]], rimOdd: [[1, 0.75], [2.5, 0.75]], hat: '8brush' }],
      chorus: [{ kick: [[0, 0.8], [1.5, 0.6], [2, 0.75], [3.5, 0.6]], rimEven: [[0, 0.8], [1.5, 0.8], [3, 0.8]], rimOdd: [[1, 0.8], [2.5, 0.8]], hat: 'ride8soft' }],
      lead: [{ kick: [[0, 0.6], [2, 0.55]], hat: '8brush' }]
    },
    polka: {
      // 底鼓踩正拍、军鼓打反拍：最典型的「嘭—恰」
      verse: [{ kick: [[0, 0.95], [1, 0.8], [2, 0.9], [3, 0.8]], snare: [[0.5, 0.55], [1.5, 0.6], [2.5, 0.55], [3.5, 0.6]] }],
      pre: [{ kick: [[0, 1], [1, 0.85], [2, 0.95], [3, 0.85]], snare: [[0.5, 0.65], [1.5, 0.7], [2.5, 0.65], [3.5, 0.7]], hat: '4' }],
      chorus: [{ kick: [[0, 1], [1, 0.85], [2, 0.95], [3, 0.85]], snare: [[0.5, 0.75], [1.5, 0.8], [2.5, 0.75], [3.5, 0.8]], hat: '4open' }],
      lead: [{ kick: [[0, 0.8], [2, 0.7]], snare: [[1, 0.5], [3, 0.5]] }]
    },
    synth: {
      // 鼓机：底鼓四平八稳，军鼓＋拍手打二四拍（门限混响式的短促军鼓）
      verse: [{ kick: [[0, 1], [2, 0.95], [2.5, 0.7, 0.5]], snare: [[1, 0.95], [3, 0.95]], hat: '8' },
        { kick: [[0, 1], [1, 0.85], [2, 0.95], [3, 0.85]], snare: [[1, 0.9], [3, 0.9]], hat: '8' }],
      pre: [{ kick: [[0, 1], [1, 0.9], [2, 1], [3, 0.9]], snare: [[1, 0.95], [3, 0.95]], hat: '16' }],
      chorus: [{ kick: [[0, 1], [1, 0.9], [2, 1], [3, 0.9]], snare: [[1, 1], [3, 1]], clap: [[1, 0.9], [3, 0.9]], hat: '16open', perc: [[0.5, 0.24], [1.5, 0.32], [2.5, 0.24], [3.5, 0.32]] }],
      lead: [{ kick: [[0, 0.9], [2, 0.85]], hat: '8' }]
    },
    dream: {
      // 半速感：军鼓只在第三拍；副歌改成落地通鼓八分推进，叮叮镲长长地铺开
      verse: [{ kick: [[0, 0.8], [2.5, 0.6, 0.6]], snare: [[2, 0.75]], hat: 'ride8soft' }],
      pre: [{ kick: [[0, 0.85], [1.5, 0.6], [2.5, 0.65]], snare: [[2, 0.8]], hat: 'ride8soft', tom: [[3, 0.55], [3.5, 0.6]] }],
      chorus: [{ kick: [[0, 0.9], [2, 0.8]], snare: [[1, 0.8], [3, 0.85]], hat: 'ride8',
        tom: [[0, 0.6], [0.5, 0.5], [1, 0.55], [1.5, 0.5], [2, 0.6], [2.5, 0.5], [3, 0.55], [3.5, 0.5]] }],
      lead: [{ kick: [[0, 0.7]], hat: 'ride8soft' }]
    },
    chip: {
      verse: [{ kick: [[0, 1], [2, 0.9], [2.5, 0.75, 0.6]], snare: [[1, 0.9], [3, 0.9]], hat: '8' }],
      pre: [{ kick: [[0, 1], [1, 0.85], [2, 0.95], [3, 0.85]], snare: [[1, 0.9], [3, 0.9]], hat: '16' }],
      chorus: [{ kick: [[0, 1], [0.75, 0.7], [2, 0.95], [2.5, 0.8]], snare: [[1, 1], [3, 1]], hat: '16' }],
      lead: [{ kick: [[0, 0.9]], hat: '8' }]
    },
    enka: {
      // 慢八拍的切分落在贝斯的 1.5；副歌根—五推进，短吉他/弦乐落反拍。
      verse: [{ kick: [[0, 0.85], [1.5, 0.48], [2, 0.7]], rim: [[1, 0.7], [3, 0.75]], hat: '8soft' }],
      pre: [{ kick: [[0, 0.9], [1.5, 0.5], [2, 0.75]], snare: [[1, 0.7], [3, 0.75]], hat: '8soft' }],
      chorus: [{ kick: [[0, 0.95], [1, 0.55], [2, 0.85], [3, 0.55]], snare: [[1, 0.85], [3, 0.9]], hat: '8' }],
      lead: [{ kick: [[0, 0.7]], rim: [[3, 0.55]] }]
    },
    polkaHalf: {
      verse: [{ kick: [[0, 0.95], [2, 0.9]], snare: [[1, 0.6], [3, 0.65]] }],
      pre: [{ kick: [[0, 1], [2, 0.95]], snare: [[1, 0.7], [3, 0.75]], hat: '8soft' }],
      chorus: [{ kick: [[0, 1], [2, 0.95]], snare: [[1, 0.8], [3, 0.85]], hat: '8' }],
      lead: [{ kick: [[0, 0.8]], snare: [[3, 0.5]] }]
    },
    da: {
      // 底鼓切分（0, 1.5/2）+ 温暖的钢琴沙锤底 + 副歌开镲与木鱼铃音点缀
      verse: [{ kick: [[0, 0.9], [1.5, 0.62], [2, 0.82]], rim: [[1, 0.76], [3, 0.8]], hat: '8soft', shaker: true }],
      pre: [{ kick: [[0, 0.95], [1.5, 0.68], [2, 0.88], [2.5, 0.65]], snare: [[1, 0.78], [3, 0.84]], hat: '8', perc: [[0, 0.36], [2, 0.32]], shaker: true }],
      chorus: [{ kick: [[0, 1], [1.5, 0.75], [2, 0.95], [3.5, 0.68]], snare: [[1, 0.95], [3, 1]], hat: '8open', perc: [[0, 0.42], [1.5, 0.32], [3.5, 0.34]] }],
      lead: [{ kick: [[0, 0.78]], hat: '4soft', shaker: true }]
    }
  };
  // Alternate grooves retain each style's anchor beats. They are arranged in
  // two-bar cells below, rather than re-rolling every hit or copying a universal kit.
  var GROOVE_ALT = {
    pop: {
      verse: { kick: [[0, 1], [1.5, 0.65], [2, 0.85]], snare: [[1, 0.92], [3, 1]], hat: '8soft', ghost: 0.16 },
      chorus: { kick: [[0, 1], [1.5, 0.75], [2, 0.95], [3.5, 0.65]], snare: [[1, 1], [3, 1]], hat: '16open' } },
    soft: {
      verse: { kick: [[0, 0.8]], rim: [[1, 0.6], [3, 0.7]], hat: '4soft' },
      chorus: { kick: [[0, 0.95], [1.5, 0.55], [2, 0.8]], snare: [[1, 0.8], [3, 0.9]], hat: '8soft' } },
    rock: {
      verse: { kick: [[0, 1], [0.5, 0.65], [2, 0.95]], snare: [[1, 1], [3, 1]], hat: '4' },
      chorus: { kick: [[0, 1], [0.75, 0.65], [2, 1], [3.5, 0.8]], snare: [[1, 1], [3, 1]], hat: '8open' } },
    edm: {
      verse: { kick: [[0, 1], [1, 0.92], [2, 1], [3, 0.92]], clap: [[1, 0.85], [3, 0.95]], hat: 'skipOff',
        perc: [[0.75, 0.32], [1.75, 0.28], [2.75, 0.34]] },
      chorus: { kick: [[0, 1], [1, 0.92], [2, 1], [3, 0.92]], snare: [[1, 0.84], [3, 0.88]], clap: [[1, 0.64], [3, 0.68]], hat: '8open',
        rim: [[0.75, 0.42], [2.75, 0.42], [3.75, 0.45]], perc: [[0.5, 0.28], [2.5, 0.28]] } },
    folk: {
      verse: { kick: [[0, 0.8]], rim: [[1, 0.65], [3, 0.75]], hat: '4soft', shaker: true },
      chorus: { kick: [[0, 0.95], [2, 0.85], [2.5, 0.55]], rim: [[1, 0.85], [3, 0.9]], hat: '8soft', shaker: true } },
    piano: {
      verse: { kick: [[0, 0.65], [2, 0.45]], rim: [[3, 0.55]], hat: '4soft' },
      chorus: { kick: [[0, 0.85], [2, 0.65]], snare: [[1, 0.7], [3, 0.8]], hat: '8soft' } },
    city: {
      verse: { kick: [[0, 1], [0.75, 0.65], [2.5, 0.85], [3.75, 0.55]], snare: [[1, 0.95], [3, 1]], hat: '16soft', ghost: 0.28 },
      chorus: { kick: [[0, 1], [1.75, 0.75], [2, 0.85], [3.5, 0.7]], snare: [[1, 1], [3, 1]], clap: [[3, 0.65]], hat: '16open', ghost: 0.2 } },
    taiko: {
      verse: { kick: [[0, 0.9]], rim: [[2, 0.65]], tom: [[1.5, 0.45], [3, 0.55]] },
      chorus: { kick: [[0, 1], [2, 0.85]], snare: [[1, 0.8], [3, 0.85]], tom: [[0.5, 0.5], [2.5, 0.65], [3.5, 0.6]], hat: '4' } },
    bossa: {
      verse: { kick: [[0, 0.65], [1.5, 0.5], [2, 0.6], [3.5, 0.55]], rimEven: [[0, 0.65], [1.5, 0.7], [3, 0.65]], rimOdd: [[1, 0.65], [2.5, 0.7]], hat: '4soft', shaker: true },
      chorus: { kick: [[0, 0.8], [1.5, 0.55], [2, 0.75], [3.5, 0.65]], rimEven: [[0, 0.8], [1.5, 0.7], [3, 0.8]], rimOdd: [[1, 0.75], [2.5, 0.85]], hat: '8brush', shaker: true } },
    polka: {
      verse: { kick: [[0, 0.95], [1, 0.65], [2, 0.85], [3, 0.7]], snare: [[0.5, 0.5], [1.5, 0.65], [2.5, 0.5], [3.5, 0.65]], hat: '4soft' },
      chorus: { kick: [[0, 1], [1, 0.8], [2, 0.95], [3, 0.85]], snare: [[0.5, 0.7], [1.5, 0.8], [2.5, 0.7], [3.5, 0.85]], hat: '8' } },
    polkaHalf: {
      verse: { kick: [[0, 0.9], [2, 0.8]], rim: [[1, 0.65], [3, 0.7]], hat: '4soft' },
      chorus: { kick: [[0, 1], [2, 0.9]], snare: [[1, 0.8], [3, 0.9]], hat: '4' } },
    synth: {
      verse: { kick: [[0, 1], [1.5, 0.7], [2, 0.95]], snare: [[1, 0.95], [3, 1]], hat: '16soft' },
      chorus: { kick: [[0, 1], [1, 0.85], [2, 1], [3, 0.9]], snare: [[1, 1], [3, 1]], clap: [[1, 0.7], [3, 0.95]], hat: 'off16' } },
    dream: {
      verse: { kick: [[0, 0.8], [3.5, 0.5]], snare: [[2, 0.8]], hat: '8soft' },
      chorus: { kick: [[0, 0.9], [2, 0.8], [3.5, 0.55]], snare: [[1, 0.75], [3, 0.85]], hat: 'ride8soft',
        tom: [[0, 0.5], [0.5, 0.4], [1, 0.5], [1.5, 0.4], [2, 0.6], [2.5, 0.5], [3, 0.65], [3.5, 0.55]] } },
    chip: {
      verse: { kick: [[0, 1], [1.5, 0.7], [2, 0.9]], snare: [[1, 0.9], [3, 1]], hat: '16soft' },
      chorus: { kick: [[0, 1], [0.5, 0.75], [2, 0.95], [2.75, 0.65]], snare: [[1, 1], [3, 1]], hat: '8open' } },
    enka: {
      verse: { kick: [[0, 0.8], [2, 0.65]], rim: [[1, 0.6], [3, 0.75]], hat: '4soft' },
      chorus: { kick: [[0, 0.95], [2, 0.8]], snare: [[1, 0.85], [3, 0.95]], hat: 'ride4', tom: [[3.5, 0.5]] } },
    da: {
      verse: { kick: [[0, 0.88], [2, 0.78], [3.5, 0.55]], rim: [[1, 0.72], [3, 0.78]], hat: '4soft', shaker: true },
      chorus: { kick: [[0, 1], [1, 0.65], [2, 0.95], [2.5, 0.72]], snare: [[1, 0.95], [3, 1]], hat: 'ride8', perc: [[0.5, 0.28], [2.5, 0.28]] } }
  };
  Object.keys(GROOVE_ALT).forEach(function (kit) {
    ['verse', 'chorus'].forEach(function (section) { GROOVE[kit][section].push(GROOVE_ALT[kit][section]); });
  });
  var FILLS = {
    seqPickup: [[3, 'clap', 39, 0.8], [3.5, 'rim', 37, 0.48], [3.75, 'hat', 42, 0.34]],
    seqRoll: [[3, 'snare', 38, 0.78], [3.25, 'snare', 38, 0.48], [3.5, 'snare', 38, 0.58], [3.75, 'clap', 39, 0.88]],
    seqSardineFill: [[2.5, 'snare', 38, 0.65], [2.75, 'rim', 37, 0.7], [3, 'snare', 38, 0.82], [3.25, 'clap', 39, 0.68], [3.5, 'snare', 38, 0.88], [3.75, 'clap', 39, 0.92]],
    tomDown: [[3, 'tom', 50, 0.8], [3.25, 'tom', 48, 0.75], [3.5, 'tom', 45, 0.75], [3.75, 'tom', 43, 0.72]],
    snare16: [[3, 'snare', 38, 0.5], [3.25, 'snare', 38, 0.6], [3.5, 'snare', 38, 0.7], [3.75, 'snare', 38, 0.85]],
    mixed: [[3, 'snare', 38, 0.8], [3.5, 'tom', 47, 0.75], [3.5, 'kick', 36, 0.7], [3.75, 'tom', 43, 0.75]],
    half: [[2, 'snare', 38, 0.6], [2.5, 'snare', 38, 0.7], [3, 'tom', 50, 0.75], [3.25, 'tom', 48, 0.72], [3.5, 'tom', 45, 0.78], [3.75, 'tom', 43, 0.82]],
    pickup: [[3.5, 'snare', 38, 0.55], [3.75, 'snare', 38, 0.7]],
    soft: [[3, 'tom', 48, 0.55], [3.5, 'tom', 45, 0.55], [3.75, 'tom', 43, 0.6]],
    balladSwell: [[0.5, 'perc', 55, 0.72], [2.5, 'perc', 84, 0.58], [3, 'tom', 48, 0.58], [3.5, 'tom', 45, 0.62], [3.75, 'tom', 43, 0.68]],
    balladTom: [[2.5, 'perc', 81, 0.45], [3, 'tom', 50, 0.54], [3.25, 'tom', 47, 0.56], [3.5, 'tom', 45, 0.62], [3.75, 'tom', 43, 0.68]],
    funk16: [[2.5, 'snare', 38, 0.48], [2.75, 'snare', 38, 0.62], [3, 'tom', 50, 0.78], [3.25, 'tom', 48, 0.72], [3.5, 'snare', 38, 0.85], [3.75, 'kick', 36, 0.82]],
    cityTom: [[3, 'tom', 50, 0.76], [3.25, 'snare', 38, 0.6], [3.5, 'tom', 47, 0.8], [3.75, 'tom', 43, 0.84]],
    rockCrashFill: [[2.5, 'kick', 36, 0.82], [3, 'snare', 38, 0.88], [3.25, 'snare', 38, 0.72], [3.5, 'tom', 47, 0.84], [3.75, 'tom', 43, 0.88]]
  };

  /* 三拍子（华尔兹）音型：按拍写，换算到四单位的虚拟小节（一拍 = 4/3 单位） */
  var B3 = 4 / 3;
  function w3(list) { return list.map(function (e) { var c = e.slice(); c[0] *= B3; if (c[1] > 0) c[1] *= B3; return c; }); }
  var WALTZ = {
    bass: { alt: { even: w3([[0, 0.95, 'R', 1]]), odd: w3([[0, 0.95, '5', 0.92]]) }, hold: w3([[0, 0, 'R', 1]]),
      walk: w3([[0, 0.95, 'R', 1], [2, 0.9, 'A', 0.72]]) },
    comp: { oompah: w3([[1, 0.55, 1, 'top'], [2, 0.55, 0.9, 'top']]), hold: w3([[0, 0, 1, 'full']]),
      strum: w3([[0, 0.95, 1, 'D'], [1, 0.45, 0.8, 'D'], [1.5, 0.45, 0.6, 'U'], [2, 0.45, 0.8, 'D'], [2.5, 0.45, 0.6, 'U']]),
      blocks: w3([[0, 0.95, 1, 'full'], [1, 0.9, 0.8, 'top'], [2, 0.9, 0.78, 'top']]) },
    arp: { up6: w3(arpFrom([0, 1, 2, 3, 2, 1], 0.5, 0.45)), broken6: w3(arpFrom([0, 2, 3, 4, 3, 2], 0.5, 0.45)),
      sparkle: w3([[0, 0.9, 5, 1], [1.5, 0.45, 4, 0.8], [2, 0.9, 3, 0.8]]) },
    left: { broken: w3([[0, 0.5, 'R', 1], [0.5, 0.5, '5', 0.7], [1, 0.5, 'O', 0.75], [1.5, 0.5, '5', 0.68], [2, 0.5, '3', 0.7], [2.5, 0.5, '5', 0.65]]),
      octave: w3([[0, 0.95, 'R', 1], [0, 0.95, 'O', 0.8], [1, 0.9, '5', 0.7], [2, 0.9, '3', 0.65]]), hold: w3([[0, 0, 'R', 0.9], [0, 0, '5', 0.7]]) }
  };
  var WALTZ_FILLS = {
    toms: [[2 * B3, 'tom', 48, 0.75], [2.5 * B3, 'tom', 45, 0.78]],
    pickup: [[2 * B3, 'snare', 38, 0.55], [2.5 * B3, 'snare', 38, 0.72]],
    soft: [[2 * B3, 'tom', 45, 0.55], [2.5 * B3, 'tom', 43, 0.6]]
  };

  C.ARRANGE_STYLES = [
    { id: 'pop', name: '流行', space: 'studio', tip: '音叉电钢到簧片电钢，八音盒/颤音琴与合成合唱分层展开，副歌加弦乐与铜管呼应',
      prog: { verse: ['doowop', 'axis', 'royal', 'canon'], pre: ['lift', 'descend'], chorus: ['royal', 'axis', 'axis6', 'canon'], minor: ['epic', 'cycle', 'rise'] },
      halfChange: 0.18, color: 0.35, colorPref: { maj: [2, 11, 9], min: [10, 2] }, inversion: 0.55,
      bass: { inst: 'bass', verse: ['sync', 'popGroove', 'popBounce', 'half'], pre: ['eighth'], chorus: ['popGroove', 'sync8', 'eighth'], intro: ['whole'] },
      comp: { inst: 'ep', vel: 56, verse: ['popSync', 'popPulse8', 'stab', 'push'], pre: ['quarter', 'popSync'], chorus: ['drive', 'popSync', 'stab'], intro: ['whole'] },
      arp: { inst: 'pluck', vel: 42, verse: ['musicBoxTop'], pre: ['up8'], chorus: ['up8', 'broken8', 'pianoArpCh'] },
      brass: { inst: 'brass', vel: 64, chorus: [[[1.5, 0.3], [3.5, 0.28]]] },
      fill: { inst: 'guitarClean', alternate: 'vibraphone', vel: 54 },
      pad: { verse: 0.7, pre: 0.8, chorus: 0.85, intro: 0.8 }, strings: { pre: 0.35, chorus: 0.6 }, kit: 'pop' },
    { id: 'ballad', name: '抒情', space: 'hall', tip: '前奏暖铺底与水晶铃音钩子，主歌阶梯减法、无品贝斯与十二弦吉他递进，副歌影院弦乐和声弧线展开',
      prog: { verse: ['ballad90s', 'doowop', 'canon', 'axis'], pre: ['descend', 'lift', 'balladWarm'], chorus: ['ballad90s', 'royal', 'canon', 'axis6'], minor: ['epic', 'lament', 'cycle'] },
      halfChange: 0.2, color: 0.5, colorPref: { maj: [2, 11], min: [10, 2] }, inversion: 0.75, straight: true,
      bass: { inst: 'bass', verse: ['balladFretless', 'balladHold'], pre: ['balladFretless', 'balladHold'], chorus: ['balladLift', 'balladWalk'], intro: ['whole'], vel: 0.86 },
      comp: { inst: 'guitar', vel: 57, verse: ['balladPick', 'balladPickFlow'], pre: ['balladPick', 'balladPickFlow'], chorus: ['balladPiano', 'balladPianoSwell'], chorusInst: 'piano', intro: ['balladPickSlow'], arpMode: true },
      arp: { inst: 'ep', vel: 36, verse: ['balladGlimmer', 'balladBellHook'], pre: ['balladGlimmer', 'balladBellHook'], chorus: ['balladGlimmer'] },
      fill: { inst: 'epBell', alternate: 'celesta', vel: 50 },
      pad: { verse: 0.52, pre: 0.58, chorus: 0.66, intro: 0.5 }, strings: { verse: 0.25, pre: 0.42, chorus: 0.65 }, kit: 'soft' },
    { id: 'rock', name: '摇滚', space: 'wide', tip: '闷音电吉他到过载、失真强力和弦，拨片贝斯推八分，句间吉他穿插点缀',
      prog: { verse: ['rock', 'stay', 'axis'], pre: ['lift'], chorus: ['axis', 'rock', 'royal2'], minor: ['fall', 'epic', 'lament'] },
      halfChange: 0.22, color: 0.05, colorPref: { maj: [], min: [] }, inversion: 0.12,
      bass: { inst: 'bass', verse: ['rock8'], pre: ['rock8'], chorus: ['rockDrive', 'rock8', 'octave'], intro: ['whole'] },
      comp: { inst: 'guitar', vel: 70, verse: ['mute8'], pre: ['powerHold'], chorus: ['power8', 'strumPop'], intro: ['strumHold'] },
      fill: { inst: 'guitarOverdrive', vel: 66 },
      pad: { verse: 0.35, pre: 0.45, chorus: 0.5, intro: 0.6 }, padInst: 'organ', strings: { chorus: 0.25 }, kit: 'rock' },
    { id: 'edm', name: '电子', space: 'wide', tip: '附点/八度跳跃合成低音与七九和弦切分拨音，波形十六分琶音、反拍开镲及五度合成扫音应答',
      prog: { verse: ['marunouchi', 'royal', 'axis6', 'descend'], pre: ['lift', 'descend', 'climb'], chorus: ['royal', 'marunouchi', 'city4536', 'axis6'], minor: ['sardineCycle', 'minorRoyal', 'cycle', 'lament'] },
      halfChange: 0.38, color: 0.72, colorPref: { maj: [11, 14, 9, 2], min: [10, 15, 2, 9] }, inversion: 0.42, sus: 0.25, straight: true, sequence: true,
      bass: { inst: 'bass', verse: ['seqSardine', 'seqEighth', 'seqTresillo'], pre: ['seqSardine', 'seqEighth', 'seqTresillo'], chorus: ['seqSardine', 'seqEighth', 'seqTresillo'], intro: ['half'], vel: 0.92 },
      comp: { inst: 'pluck', vel: 55, verse: ['seqOff', 'seqSync', 'seqTresillo'], pre: ['seqOff', 'seqSync', 'seqTresillo'], chorus: ['seqOff', 'seqSync', 'seqTresillo'], intro: ['half'] },
      arp: { inst: 'arp', vel: 40, verse: ['seqMotif8'], pre: ['seqMotif8'], chorus: ['seqMotif16'] },
      fill: { inst: 'synthFifth', alternate: 'synthPWM', vel: 56 },
      pad: { verse: 0.32, pre: 0.42, chorus: 0.52, intro: 0.5 }, padPattern: 'sequence', strings: {}, kit: 'edm' },
    { id: 'folk', name: '民谣', space: 'studio', tip: '木吉他扫弦配马林巴/竖琴轻拨、长笛句间应答与拨弦弦乐，沙锤垫十六分',
      prog: { verse: ['canon', 'doowop', 'ballad90s', 'folk'], pre: ['descend', 'lift', 'balladBittersweet'], chorus: ['canon', 'ballad90s', 'royal', 'axis'], minor: ['plainMinor', 'fall', 'lament'] },
      halfChange: 0.22, color: 0.38, colorPref: { maj: [2, 9, 11], min: [10, 2] }, inversion: 0.55,
      bass: { inst: 'bass', verse: ['rootFifth', 'half'], pre: ['rootFifth'], chorus: ['rootFifth', 'sync'], intro: ['whole'] },
      comp: { inst: 'guitar', vel: 64, verse: ['strumFolk', 'strumSlow'], pre: ['strumFolk'], chorus: ['strumFolk', 'strumPop'], intro: ['strumSlow'] },
      arp: { inst: 'pluck', vel: 44, pre: ['harpSweep'], chorus: ['marimbaCounter', 'broken8'] },
      fill: { inst: 'flute', alternate: 'marimba', vel: 54 },
      pad: { verse: 0.4, pre: 0.45, chorus: 0.55, intro: 0.5 }, strings: { chorus: 0.28 }, kit: 'folk' },
    { id: 'piano', name: '钢琴抒情', space: 'hall', tip: '左手分解、右手暖色钢琴和弦，钢片琴与竖琴高音点缀，大提琴与影院弦乐托起',
      prog: { verse: ['canon', 'doowop', 'descend'], pre: ['lift'], chorus: ['royal', 'canon', 'axis6'], minor: ['lament', 'epic'] },
      halfChange: 0.15, color: 0.55, colorPref: { maj: [2, 11, 9], min: [10, 2] }, inversion: 0.8,
      bass: { inst: 'bass', chorus: ['whole'], vel: 0.75 },
      left: { inst: 'piano', verse: ['lhBroken'], pre: ['lhBroken'], chorus: ['lhOctave', 'lhBroken'], intro: ['lhWhole'] },
      comp: { inst: 'piano', vel: 58, verse: ['half', 'whole'], pre: ['blocks'], chorus: ['blocks', 'quarter'], intro: ['whole'] },
      arp: { inst: 'piano', vel: 42, pre: ['harpSweep'], chorus: ['pianoFlow8', 'pianoArpCh', 'musicBoxTop', 'sparkle'] },
      pad: { verse: 0.35, pre: 0.48, chorus: 0.6 }, strings: { verse: 0.22, pre: 0.45, chorus: 0.7 }, kit: 'piano' },
    { id: 'citypop', name: '城市流行', space: 'studio', tip: '簧片电钢七和弦切分，副歌 Slap 贝斯、铜管与吉他华彩呼应',
      prog: { verse: ['turn', 'royal', 'jazz2', 'citySmooth'], pre: ['descend', 'lift'], chorus: ['royal', 'turn', 'axis6'], minor: ['cycle', 'epic'] },
      halfChange: 0.08, color: 0.9, colorPref: { maj: [11, 2, 9], min: [10, 2] }, inversion: 0.45,
      bass: { inst: 'bass', verse: ['funk', 'funkSlap', 'cityWalk', 'sync'], pre: ['sync8'], chorus: ['funkSlap', 'funk', 'octave'], intro: ['whole'] },
      comp: { inst: 'ep', vel: 56, verse: ['cityComp', 'push16', 'charleston'], pre: ['charleston', 'cityComp'], chorus: ['cityComp', 'push16', 'drive'], intro: ['whole'] },
      arp: { inst: 'ep', vel: 40, pre: ['marimbaCounter'], chorus: ['citySparkle', 'sparkle', 'musicBoxTop'] },
      brass: { inst: 'brass', vel: 72, chorus: [[[1.5, 0.3], [3.5, 0.25]], [[0.75, 0.25], [2.5, 0.4]]] },
      fill: { inst: 'guitarClean', alternate: 'vibraphone', vel: 56 },
      pad: { verse: 0.45, pre: 0.55, chorus: 0.6, intro: 0.6 }, strings: { pre: 0.3, chorus: 0.45 }, kit: 'city' },
    { id: 'guofeng', name: '国风', space: 'hall', tip: '竖琴/古筝拨弦、拨弦弦乐到长笛/陶笛与胡琴唱和，柔美人声合唱与大鼓托底',
      prog: { verse: ['royal', 'doowop', 'axis6'], pre: ['lift'], chorus: ['royal', 'royal2', 'axis6'], minor: ['epic', 'lament', 'cycle'] },
      halfChange: 0.25, color: 0.55, colorPref: { maj: [2, 9], min: [10, 2] }, inversion: 0.35, sus: 0.12,
      bass: { inst: 'bass', verse: ['guofengFlow', 'whole', 'half'], pre: ['guofengFlow', 'half'], chorus: ['guofengFlow', 'rootFifth'], intro: ['whole'] },
      comp: { inst: 'pluck', vel: 54, verse: ['zheng', 'guofengWater'], pre: ['zheng'], chorus: ['zheng', 'broken8'], intro: ['roll'], arpMode: true },
      arp: { inst: 'harp', vel: 42, pre: ['harpSweep'], chorus: ['harpSweep', 'sparkle'] },
      fill: { inst: 'flute', alternate: 'erhuSynth', vel: 56 },
      pad: { verse: 0.4, pre: 0.5, chorus: 0.6, intro: 0.6 }, strings: { verse: 0.3, pre: 0.5, chorus: 0.7, intro: 0.4 }, kit: 'taiko' },
    { id: 'bossa', name: 'Bossa Nova', space: 'studio', tip: '尼龙吉他两小节切分，指弹贝斯根—五，马林巴与颤音琴点缀，长笛留白应和',
      prog: { verse: ['jazz', 'jazz2', 'turn'], pre: ['turn'], chorus: ['jazz2', 'turn', 'royal'], minor: ['cycle', 'plainMinor'] },
      halfChange: 0.1, color: 0.95, colorPref: { maj: [11, 9, 2], min: [10, 2] }, inversion: 0.2, straight: true,
      bass: { inst: 'bass', verse: ['bossa'], pre: ['bossa'], chorus: ['bossa'], intro: ['whole'], vel: 0.85 },
      comp: { inst: 'guitar', vel: 58, verse: ['bossa'], pre: ['bossa'], chorus: ['bossa', 'bossaSoft'], intro: ['bossaSoft'] },
      arp: { inst: 'ep', vel: 38, verse: ['marimbaCounter'], chorus: ['marimbaCounter', 'sparkle'] },
      fill: { inst: 'flute', alternate: 'vibraphone', vel: 52 },
      pad: { verse: 0.25, pre: 0.3, chorus: 0.35, intro: 0.3 }, strings: { chorus: 0.3 }, kit: 'bossa' },
    { id: 'polka', name: '波尔卡', space: 'studio', tip: '「嘭—恰」：大号踩正拍，手风琴打反拍，单簧管与铜管句尾呼应',
      prog: { verse: ['polka', 'polka2'], pre: ['polka2'], chorus: ['polka', 'polka2'], minor: ['plainMinor'] },
      halfChange: 0.15, color: 0, colorPref: { maj: [], min: [] }, inversion: 0.05, straight: true,
      bass: { inst: 'tuba', verse: ['oompah'], pre: ['oompah'], chorus: ['oompah'], intro: ['oompah'] },
      comp: { inst: 'accordion', vel: 60, verse: ['oompah'], pre: ['oompah'], chorus: ['oompah'], intro: ['oompah'] },
      arp: { inst: 'accordion', vel: 46, chorus: ['sparkle'] },
      brass: { inst: 'brass', vel: 62, chorus: [[[1.5, 0.3], [3.5, 0.25]]] },
      fill: { inst: 'clarinet', alternate: 'accordion', vel: 56 },
      pad: { verse: 0.2, pre: 0.25, chorus: 0.3, intro: 0.3 }, strings: {}, kit: 'polka' },
    { id: 'synthpop', name: 'Synthpop', space: 'wide', tip: '八度与酸性合成低音，流动脉宽到复古合成铜管，紧致琶音与五度主奏呼应',
      prog: { verse: ['synth', 'axis6', 'synth2'], pre: ['lift', 'descend'], chorus: ['axis6', 'synth', 'royal'], minor: ['epic', 'rise', 'fall'] },
      halfChange: 0.12, color: 0.3, colorPref: { maj: [2, 9], min: [10, 2] }, inversion: 0.15, sus: 0.3, straight: true,
      bass: { inst: 'bass', verse: ['synthOct', 'eighth'], pre: ['eighth'], chorus: ['synthOct'], intro: ['whole'] },
      comp: { inst: 'arp', vel: 50, verse: ['offbeat', 'synthPulse'], pre: ['quarter', 'synthPulse'], chorus: ['synthStab', 'synthPulse'], intro: ['whole'] },
      arp: { inst: 'pluck', vel: 40, verse: ['up8'], pre: ['up16'], chorus: ['up16', 'broken8'] },
      fill: { inst: 'synthFifth', alternate: 'synthGlass', vel: 52 },
      pad: { verse: 0.75, pre: 0.85, chorus: 0.9, intro: 0.9 }, strings: { chorus: 0.2 }, kit: 'synth' },
    { id: 'dreampop', name: 'Dreampop', space: 'hall', tip: '清音电吉他交叠分解，八音盒与颤音琴点亮，空心到星光铺底，半速鼓与落地通鼓',
      prog: { verse: ['dream', 'dream2', 'plagal'], pre: ['lift'], chorus: ['dream', 'axis6', 'dream2'], minor: ['rise', 'cycle', 'epic'] },
      halfChange: 0.06, color: 0.85, colorPref: { maj: [11, 2, 9], min: [10, 2] }, inversion: 0.4, sus: 0.2, straight: true,
      bass: { inst: 'bass', verse: ['whole', 'half'], pre: ['half'], chorus: ['half', 'rootFifth'], intro: ['whole'], vel: 0.8 },
      comp: { inst: 'guitar', vel: 50, verse: ['shimmer', 'shimmerSlow'], pre: ['shimmer'], chorus: ['shimmer'], intro: ['shimmerSlow'], arpMode: true },
      arp: { inst: 'ep', vel: 34, verse: ['sparkle'], chorus: ['sparkle', 'musicBoxTop'] },
      fill: { inst: 'synthSoftLead', alternate: 'vibraphone', vel: 48 },
      pad: { verse: 0.95, pre: 1, chorus: 1.05, intro: 1 }, strings: { pre: 0.35, chorus: 0.6, intro: 0.3 }, kit: 'dream' },
    { id: 'chiptune', name: 'Chiptune', space: 'off', tip: '芯片音乐：自动使用 8bit 音色，八度跳动的三角波低音，快速和弦琶音与方波跑音',
      prog: { verse: ['chip', 'axis', 'chip2'], pre: ['lift'], chorus: ['chip', 'royal', 'axis6'], minor: ['epic', 'fall', 'cycle'] },
      halfChange: 0.2, color: 0.1, colorPref: { maj: [], min: [] }, inversion: 0.05, straight: true, chip: true,
      bass: { inst: 'bass', verse: ['chipJump', 'octave'], pre: ['eighth'], chorus: ['chipJump'], intro: ['whole'] },
      comp: { inst: 'pluck', vel: 50, verse: ['offbeat', 'chip16'], pre: ['quarter'], chorus: ['chip16', 'drive'], intro: ['whole'] },
      arp: { inst: 'arp', vel: 42, verse: ['up8'], pre: ['up16'], chorus: ['chipRun', 'up16'] },
      pad: { verse: 0.7, pre: 0.8, chorus: 0.85, intro: 0.8 }, strings: { chorus: 0.3 }, kit: 'chip' },
    { id: 'enka', name: '演歌', space: 'studio', tip: '台语慢八拍与根—五推进，主歌吉他分解、副歌清音反拍，弦乐张弛；小调 V7，句间吉他与手风琴应答',
      prog: { verse: ['enka', 'enka2', 'plagal'], pre: ['enka2'], chorus: ['enka', 'enkaMaj', 'folk'], minor: ['enka', 'enka2', 'lament'] },
      halfChange: 0.18, color: 0.25, colorPref: { maj: [9], min: [] }, inversion: 0.2, harmonicV: true, straight: true,
      bass: { inst: 'bass', verse: ['enkaSlow', 'enkaSlowTurn'], pre: ['enkaSlow', 'enkaSlowTurn'], chorus: ['oompah8', 'enka'], intro: ['whole'], vel: 0.86 },
      comp: { inst: 'guitar', vel: 59, verse: ['enkaPick', 'enkaPickTurn'], pre: ['enkaPick', 'enkaPickTurn'], chorus: ['enkaChop', 'enkaChopTurn'], intro: ['pick'], arpMode: true },
      fill: { inst: 'guitarClean', alternate: 'accordion', vel: 63 },
      pad: { verse: 0.12, pre: 0.18, chorus: 0.2, intro: 0.25 }, strings: { verse: 0.36, pre: 0.52, chorus: 0.8, intro: 0.5 }, kit: 'enka' },
    { id: 'da', name: '大', space: 'studio', tip: '吉他八分脉动与明快钢琴和弦，八音盒/竖琴/颤音琴高音点缀，单簧管句间应答与合唱弦乐',
      prog: { verse: ['canon', 'doowop', 'descend'], pre: ['lift', 'climb'], chorus: ['royal', 'canon', 'axis', 'doowop'], minor: ['lament', 'epic', 'cycle'] },
      halfChange: 0.16, color: 0.45, colorPref: { maj: [2, 9, 11], min: [10, 2] }, inversion: 0.55, sus: 0.2, straight: true,
      bass: { inst: 'bass', verse: ['daPulse', 'rootFifth'], pre: ['daPulse', 'sync'], chorus: ['daDrive', 'popGroove'], intro: ['whole'], vel: 0.88 },
      comp: { inst: 'guitar', vel: 58, verse: ['daPulse'], pre: ['daPulse', 'strumPop'], chorus: ['daPianoChorus', 'strumPop'], chorusInst: 'piano', intro: ['strumHold'] },
      arp: { inst: 'piano', vel: 43, verse: ['daBellTop'], pre: ['harpSweep', 'daCascade'], chorus: ['daCascade', 'musicBoxTop', 'pianoArpCh'] },
      fill: { inst: 'clarinet', alternate: 'vibraphone', vel: 56 },
      pad: { verse: 0.42, pre: 0.55, chorus: 0.72, intro: 0.45 }, strings: { verse: 0.22, pre: 0.48, chorus: 0.78, intro: 0.35 }, kit: 'da' }
  ];
  // Roles keep their original rhythm/voicing grammar; patches change by section,
  // never by note or random draw. GM identity comes only from Instruments.
  var ARRANGE_VOICES = {
    pop: { bass: { intro: 'bass', verse: 'bass', pre: 'bassPick', chorus: 'bassPick' },
      comp: { verse: 'ep', pre: 'epReed', chorus: 'epReed' }, arp: { verse: 'musicBox', pre: 'synthGlass', chorus: 'vibraphone' },
      pad: { verse: 'pad', pre: 'padAiry', chorus: 'choir' }, strings: { verse: 'stringsSlow', chorus: 'strings' },
      sample: ['ep', 'guitarChorus', 'guitarClean'], lead: 'guitarClean' },
    ballad: { bass: { intro: 'bassFretless', verse: 'bass', pre: 'bass', chorus: 'bass' },
      comp: { intro: 'guitarNylon', verse: 'guitarNylon', pre: 'guitarSteel12', chorus: 'piano', outro: 'guitarNylon' },
      arp: { verse: 'epBell', pre: 'epBell', chorus: 'vibraphone' },
      pad: { intro: 'padWarmGlass', verse: 'pad', pre: 'pad', chorus: 'pad', outro: 'padWarmGlass' },
      strings: { intro: 'stringsSlow', verse: 'stringsSlow', pre: 'stringsSlow', chorus: 'stringsCinema', outro: 'stringsSlow' },
      sample: ['epBell', 'harp'], lead: 'epBell' },
    rock: { bass: 'bassPick', comp: { intro: 'guitarClean', verse: 'guitarMuted', pre: 'guitarOverdrive', chorus: 'guitarDistortion', outro: 'guitarClean' },
      sample: ['guitarOverdrive', 'organ'], lead: 'guitarOverdrive' },
    edm: { bass: { intro: 'synthSub', verse: 'synthRubber', pre: 'synthAcid', chorus: 'synthOctave', bridge: 'synthSub', outro: 'synthReese' },
      comp: 'synthPluck', arp: 'synthGlass', pad: { verse: 'synthVelvet', pre: 'synthSweep', chorus: 'synthSweep', bridge: 'synthHollow' },
      sample: ['synthFifth', 'synthGlass'], lead: 'synthUnison' },
    folk: { comp: { verse: 'guitarNylon', pre: 'guitar', chorus: 'guitar' },
      arp: { verse: 'marimba', pre: 'harp', chorus: 'marimba' },
      strings: { verse: 'stringsSlow', chorus: 'pizzicato' }, sample: ['guitarNylon', 'ocarina'], lead: 'flute' },
    piano: { comp: { intro: 'pianoWarm', verse: 'pianoWarm', pre: 'pianoWarm', chorus: 'piano', outro: 'pianoWarm' },
      arp: { verse: 'celesta', pre: 'harp', chorus: 'piano' },
      pad: { verse: 'pad', chorus: 'choirSoft' },
      strings: { verse: 'pizzicato', pre: 'stringsCello', chorus: 'stringsCinema' }, sample: ['piano', 'harp'], lead: 'piano' },
    citypop: { bass: { verse: 'bass', pre: 'bassPick', chorus: 'bassSlap' }, comp: 'epReed',
      arp: { pre: 'vibraphone', chorus: 'synthGlass' },
      pad: { verse: 'padAiry', chorus: 'choir' }, strings: { pre: 'stringsSlow', chorus: 'strings' },
      sample: ['vibraphone', 'guitarClean'], lead: 'guitarClean' },
    guofeng: { comp: { intro: 'harp', verse: 'pluck', pre: 'harp', chorus: 'pluck' },
      arp: { pre: 'harp', chorus: 'flute' }, pad: { verse: 'padAiry', chorus: 'choirSoft' },
      strings: { verse: 'pizzicato', pre: 'stringsSlow', chorus: 'strings' }, sample: ['flute', 'ocarina', 'harp'], lead: 'erhuSynth' },
    bossa: { comp: 'guitarNylon', arp: { verse: 'marimba', pre: 'vibraphone', chorus: 'vibraphone' },
      strings: 'stringsSlow', sample: ['vibraphone', 'flute'], lead: 'flute' },
    polka: { arp: { pre: 'clarinet', chorus: 'clarinet' }, sample: ['clarinet', 'accordion'], lead: 'clarinet' },
    synthpop: { bass: { intro: 'synthReese', verse: 'synthOctave', pre: 'synthAcid', chorus: 'synthOctave', outro: 'synthReese' },
      comp: { verse: 'synthPWM', pre: 'synthBrass', chorus: 'synthBrass' },
      arp: 'synthPluck', pad: { verse: 'synthVelvet', chorus: 'synthShimmer' }, strings: 'synthHollow',
      sample: ['synthFifth', 'synthGlass'], lead: 'synthUnison' },
    dreampop: { bass: { intro: 'synthReese', verse: 'synthReese', pre: 'bassSynth', chorus: 'bassSynth', bridge: 'synthReese', outro: 'synthReese' },
      comp: 'guitarClean', arp: { verse: 'musicBox', pre: 'synthGlass', chorus: 'vibraphone' },
      pad: { verse: 'synthHollow', chorus: 'synthShimmer' }, strings: 'stringsSlow', sample: ['synthSoftLead', 'vibraphone'], lead: 'synthSoftLead' },
    enka: { comp: { verse: 'guitarNylon', pre: 'guitar', chorus: 'guitarClean' },
      strings: { verse: 'stringsSlow', chorus: 'strings' }, sample: ['guitarClean', 'flute'], lead: 'accordion' },
    da: { bass: { intro: 'bass', verse: 'bass', pre: 'bass', chorus: 'bassPick' },
      comp: { intro: 'guitarNylon', verse: 'guitar', pre: 'guitar', chorus: 'piano' },
      arp: { verse: 'musicBox', pre: 'harp', chorus: 'vibraphone' },
      pad: { verse: 'padAiry', pre: 'padAiry', chorus: 'choir' },
      strings: { verse: 'stringsSlow', pre: 'stringsSlow', chorus: 'strings' },
      sample: ['piano', 'clarinet'], lead: 'piano' }
  };
  C.ARRANGE_MOODS = [
    { id: 'auto', name: '自动判断' },
    { id: 'bright', name: '明亮', chordRate: 1.1, density: 1.08, pad: 0.88, strings: 0.9, comp: 1.02, arp: 1.1, drums: 1.02, cymbals: 1.04, colors: [2, 9, 11, 10] },
    { id: 'gentle', name: '温柔', chordRate: 0.72, density: 0.85, pad: 1.06, strings: 1.02, comp: 0.9, arp: 0.8, drums: 0.78, cymbals: 0.72, colors: [9, 2, 11, 10] },
    { id: 'melancholy', name: '忧郁', chordRate: 0.85, density: 0.92, pad: 1.1, strings: 1.18, comp: 0.92, arp: 0.86, drums: 0.86, cymbals: 0.8, colors: [11, 10, 2, 9] },
    { id: 'tense', name: '紧张', chordRate: 1.35, density: 1.22, pad: 0.82, strings: 0.9, comp: 1.04, arp: 1.16, drums: 1.06, cymbals: 1.1, colors: [2, 10, 11, 9] },
    { id: 'grand', name: '激昂', chordRate: 1, density: 1.15, pad: 1.12, strings: 1.22, comp: 1.06, arp: 1.04, drums: 1.1, cymbals: 1.04, colors: [9, 2, 10, 11] }
  ];
  function arrangementMood(mel, analysis, bpm, requested) {
    var explicit = C.ARRANGE_MOODS.find(function (m) { return m.id === requested && m.id !== 'auto'; });
    if (explicit) return { spec: explicit, automatic: false };
    var pitches = mel.map(function (n) { return n.pitch; }).sort(function (a, b) { return a - b; });
    var range = pitches[Math.floor((pitches.length - 1) * 0.9)] - pitches[Math.floor((pitches.length - 1) * 0.1)];
    var sounding = melodyTiming(mel).length, rate = mel.length / Math.max(1, sounding * 60 / bpm);
    var id = analysis.key.minor && rate >= 2.6 ? 'tense' :
      analysis.key.minor && rate < 2.2 ? 'melancholy' :
        range >= 12 && rate >= 2 ? 'grand' : rate < 1.65 ? 'gentle' : 'bright';
    return { spec: C.ARRANGE_MOODS.find(function (m) { return m.id === id; }), automatic: true };
  }
  C.arrangeStyleById = function (id) {
    for (var i = 0; i < C.ARRANGE_STYLES.length; i++) if (C.ARRANGE_STYLES[i].id === id) return C.ARRANGE_STYLES[i];
    return C.ARRANGE_STYLES[0];
  };

  function selectVocalTracks(score, opt) {
    var tracks = (score && score.tracks) || [];
    if (opt && Number.isInteger(opt.trackIndex)) {
      var chosen = tracks[opt.trackIndex];
      return chosen && chosen.type === 'vocal' ? [{ track: chosen, trackIndex: opt.trackIndex }] : [];
    }
    if (opt && Array.isArray(opt.trackIndices)) {
      var wanted = {};
      opt.trackIndices.forEach(function (idx) { if (Number.isInteger(idx)) wanted[idx] = true; });
      var picked = [];
      for (var i = 0; i < tracks.length; i++) {
        if (wanted[i] && tracks[i] && tracks[i].type === 'vocal' && tracks[i].notes && tracks[i].notes.some(pitched)) {
          picked.push({ track: tracks[i], trackIndex: i });
        }
      }
      return picked;
    }
    var unmuted = [], anyNonEmpty = [];
    for (var j = 0; j < tracks.length; j++) {
      var tr = tracks[j];
      if (!tr || tr.type !== 'vocal' || !tr.notes || !tr.notes.some(pitched)) continue;
      anyNonEmpty.push({ track: tr, trackIndex: j });
      if (!tr.muted) unmuted.push({ track: tr, trackIndex: j });
    }
    return unmuted.length ? unmuted : anyNonEmpty;
  }

  function mergeVocalSpans(notes) {
    var s = (notes || []).filter(pitched).slice().sort(function (a, b) { return a.start - b.start; });
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var n = s[i], e = n.start + n.dur, last = out[out.length - 1];
      if (last && n.start <= last[1] + 1e-6) { if (e > last[1]) last[1] = e; }
      else out.push([n.start, e]);
    }
    return out;
  }

  function overlapSpans(start, end, spans) {
    var ov = 0;
    for (var i = 0; i < spans.length; i++) {
      var sp = spans[i];
      if (sp[1] <= start) continue;
      if (sp[0] >= end) break;
      ov += Math.max(0, Math.min(end, sp[1]) - Math.max(start, sp[0]));
    }
    return ov;
  }

  function clusterVocalOnsets(notes, tol) {
    tol = tol === undefined ? 0.06 : tol;
    var starts = (notes || []).filter(pitched).map(function (n) { return n.start; }).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < starts.length; i++) {
      if (!out.length || starts[i] - out[out.length - 1] > tol) out.push(starts[i]);
    }
    return out;
  }

  function multiPitchHistogram(layers, start, end, offset, strong, minDur) {
    var hist = new Array(12).fill(0);
    offset = offset === undefined ? 0 : offset;
    var byPc = [[], [], [], [], [], [], [], [], [], [], [], []];
    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      var tw = (L.role === 'harmony' ? 0.85 : 1.0) * Math.max(0.35, Math.min(1.25, L.vol || 1));
      var vs = L.voiced;
      for (var ni = 0; ni < vs.length; ni++) {
        var n = vs[ni];
        if (minDur && n.dur < minDur) continue;
        var s = Math.max(n.start, start), e = Math.min(n.start + n.dur, end);
        if (e <= s + 1e-9) continue;
        var phase = mod4(n.start - offset);
        var onBeat = Math.abs(phase - Math.round(phase)) < 0.02, down = Math.min(phase, 4 - phase) < 0.02;
        var tripleBeat = Math.abs(phase - 4 / 3) < 0.02 || Math.abs(phase - 8 / 3) < 0.02;
        var accent = strong === 3 ? (down ? 2.2 : tripleBeat ? 1.3 : 0.8) :
          strong ? (down ? 2.2 : Math.abs(phase - 2) < 0.02 ? 1.6 : onBeat ? 1.25 : 0.8) : down ? 1.35 : onBeat ? 1.1 : 1;
        byPc[pitchClass(n.pitch)].push({ s: s, e: e, w: accent * tw });
      }
    }
    for (var pc = 0; pc < 12; pc++) {
      var segs = byPc[pc];
      if (!segs.length) continue;
      if (segs.length === 1) { hist[pc] = (segs[0].e - segs[0].s) * segs[0].w; continue; }
      var pts = [];
      for (var gi = 0; gi < segs.length; gi++) { pts.push(segs[gi].s, segs[gi].e); }
      pts.sort(function (a, b) { return a - b; });
      var acc = 0;
      for (var pi = 0; pi < pts.length - 1; pi++) {
        var a = pts[pi], b = pts[pi + 1];
        if (b - a <= 1e-9) continue;
        var mid = (a + b) * 0.5, ws = [];
        for (var sj = 0; sj < segs.length; sj++) {
          if (segs[sj].s <= mid && segs[sj].e >= mid) ws.push(segs[sj].w);
        }
        if (!ws.length) continue;
        ws.sort(function (x, y) { return y - x; });
        var combined = ws[0];
        for (var k = 1; k < ws.length; k++) combined += 0.2 * ws[k];
        acc += (b - a) * combined;
      }
      hist[pc] = acc;
    }
    return hist;
  }

  function prepareVocalEnsemble(score, opt) {
    var selected = selectVocalTracks(score, opt);
    if (selected.length <= 1) {
      return { multi: false, tracks: selected, leadTrack: selected[0] ? selected[0].track : null };
    }
    var layers = selected.map(function (item) {
      var tr = item.track;
      var voiced = (tr.notes || []).filter(pitched).slice().sort(function (a, b) { return a.start - b.start; });
      var spans = mergeVocalSpans(voiced);
      var totalDur = spans.reduce(function (s, sp) { return s + (sp[1] - sp[0]); }, 0);
      var phrases = C.splitPhrases(tr.notes || []);
      var changes = 0;
      for (var ci = 1; ci < voiced.length; ci++) if (voiced[ci].pitch !== voiced[ci - 1].pitch) changes++;
      var moveRate = voiced.length > 1 ? changes / (voiced.length - 1) : 0;
      var pcMap = {};
      voiced.forEach(function (n) { pcMap[pitchClass(n.pitch)] = true; });
      var pitches = voiced.map(function (n) { return n.pitch; }).sort(function (a, b) { return a - b; });
      var medianPitch = pitches.length ? pitches[pitches.length >> 1] : 60;
      var p10 = pitches.length ? pitches[Math.floor((pitches.length - 1) * 0.1)] : 60;
      var p90 = pitches.length ? pitches[Math.floor((pitches.length - 1) * 0.9)] : 60;
      var vol = typeof tr.vol === 'number' && isFinite(tr.vol) ? Math.max(0.2, Math.min(1.6, tr.vol)) : 1;
      var panAbs = typeof tr.pan === 'number' && isFinite(tr.pan) ? Math.abs(tr.pan) : 0;
      return {
        trackIndex: item.trackIndex,
        name: tr.name || ('音层 ' + (item.trackIndex + 1)),
        track: tr,
        voiced: voiced,
        spans: spans,
        totalDur: totalDur,
        phrases: phrases,
        moveRate: moveRate,
        pcs: Object.keys(pcMap).length,
        medianPitch: medianPitch,
        p10: p10,
        p90: p90,
        vol: vol,
        panAbs: panAbs,
        role: 'lead'
      };
    }).filter(function (L) { return L.voiced.length > 0; });
    if (layers.length <= 1) {
      return { multi: false, tracks: selected.slice(0, 1), leadTrack: selected[0] ? selected[0].track : null };
    }

    layers.forEach(function (L, li) {
      var otherRaw = [];
      for (var oj = 0; oj < layers.length; oj++) {
        if (oj === li) continue;
        layers[oj].phrases.forEach(function (p) { otherRaw.push([p.start, p.end]); });
      }
      otherRaw.sort(function (a, b) { return a[0] - b[0]; });
      var otherCov = [];
      for (var oi = 0; oi < otherRaw.length; oi++) {
        var iv = otherRaw[oi], lastCov = otherCov[otherCov.length - 1];
        if (lastCov && iv[0] <= lastCov[1] + 0.06) { if (iv[1] > lastCov[1]) lastCov[1] = iv[1]; }
        else otherCov.push([iv[0], iv[1]]);
      }
      var covered = 0;
      L.spans.forEach(function (sp) { covered += overlapSpans(sp[0], sp[1], otherCov); });
      L.soloDur = Math.max(0, L.totalDur - covered);
      L.soloRatio = L.totalDur > 0 ? L.soloDur / L.totalDur : 0;
    });

    var allVoicedRaw = [];
    layers.forEach(function (L) { allVoicedRaw = allVoicedRaw.concat(L.voiced); });
    allVoicedRaw.sort(function (a, b) { return a.start - b.start; });
    var prelimHist = multiPitchHistogram(layers, -Infinity, Infinity, 0, false);
    var prelimKey = keyCandidates(allVoicedRaw, 2, { hist: prelimHist })[0] || { key: 0, minor: false };
    layers.forEach(function (L) {
      var cSum = 0;
      if (L.phrases.length) {
        L.phrases.forEach(function (p) {
          var tail = p.notes[p.notes.length - 1];
          if (!tail) return;
          var rel = (pitchClass(tail.pitch) - prelimKey.key + 12) % 12;
          if (rel === 0) cSum += 1.0;
          else if (rel === 7) cSum += 0.5;
        });
        L.cadenceTonicRatio = cSum / L.phrases.length;
      } else L.cadenceTonicRatio = 0;
    });

    var maxDur = Math.max.apply(null, layers.map(function (L) { return L.totalDur; }).concat([1]));
    var maxNotes = Math.max.apply(null, layers.map(function (L) { return L.voiced.length; }).concat([1]));
    layers.forEach(function (L, i) {
      var durScore = L.totalDur / maxDur;
      var noteScore = L.voiced.length / maxNotes;
      var soloScore = Math.min(1, L.soloRatio * 2.5) + Math.min(0.6, L.soloDur / 20);
      var mixScore = (L.vol - 1) * 0.6 - L.panAbs * 0.4;
      var regTie = (L.medianPitch >= 54 && L.medianPitch <= 74) ? 0.08 : 0;
      var orderTie = (layers.length - i) / layers.length * 0.12;
      L.leadScore = soloScore * 2.0 + L.moveRate * 1.4 + durScore * 0.9 + noteScore * 0.8 +
        L.cadenceTonicRatio * 0.35 + mixScore + regTie + orderTie;
    });

    var byScore = layers.slice().sort(function (a, b) { return b.leadScore - a.leadScore || a.trackIndex - b.trackIndex; });
    layers.forEach(function (L) {
      if (L === byScore[0]) { L.role = 'lead'; return; }
      if (L.soloRatio >= 0.12 || L.soloDur >= 10) L.role = 'lead';
      else if (L.soloDur >= 4 && L.moveRate >= 0.65 && L.totalDur >= maxDur * 0.45) L.role = 'duet';
      else L.role = 'harmony';
    });

    var allVocalSpans = mergeVocalSpans(allVoicedRaw);
    var combinedDur = allVocalSpans.reduce(function (s, sp) { return s + (sp[1] - sp[0]); }, 0);
    var sumLayerDur = layers.reduce(function (s, L) { return s + L.totalDur; }, 0);
    var overlapRatio = combinedDur > 0 ? Math.max(0, sumLayerDur - combinedDur) / combinedDur : 0;
    var leadCount = layers.filter(function (L) { return L.role === 'lead'; }).length;
    var duetCount = layers.filter(function (L) { return L.role === 'duet'; }).length;
    var harmonyCount = layers.filter(function (L) { return L.role === 'harmony'; }).length;
    var ensembleMode = leadCount === layers.length && overlapRatio < 0.15 ? 'relay' :
      leadCount >= 2 && harmonyCount >= 1 ? 'mixed' :
        leadCount === 1 && duetCount === 0 && harmonyCount >= 1 ? 'harmony' : 'duet';

    // Build Composite Monophonic Lead (chronological non-overlapping phrases across tracks)
    var placed = [];
    function isCoveredAt(t, pNoteCount, pEnd) {
      for (var qi = 0; qi < placed.length; qi++) {
        var q = placed[qi];
        if (t < q.start - 0.06 || t >= q.end - 0.06) continue;
        var qLast = q.notes[q.notes.length - 1];
        var qHasLater = q.notes.some(function (qn) { return qn.start >= t - 0.05; });
        if (!qHasLater && qLast && qLast.start <= t - 0.5 && pNoteCount >= 2 && pEnd > q.end + 1.0) {
          return { handoff: q };
        }
        return { covered: true };
      }
      return null;
    }
    byScore.forEach(function (L) {
      L.phrases.forEach(function (P) {
        var ov = placed.reduce(function (s, q) { return s + Math.max(0, Math.min(P.end, q.end) - Math.max(P.start, q.start)); }, 0);
        if (ov < 0.06) {
          placed.push({
            start: P.start,
            end: P.end,
            notes: P.notes.map(function (n) { return Object.assign({}, n); }),
            trackIndex: L.trackIndex
          });
          return;
        }
        var run = [], handoffQ = null;
        function flushRun() {
          if (!run.length) return;
          var rStart = run[0].start;
          var rEnd = Math.max.apply(null, run.map(function (rn) { return rn.start + rn.dur; }));
          var rOv = 0;
          for (var qi = 0; qi < placed.length; qi++) {
            var q = placed[qi];
            if (q === handoffQ) continue;
            rOv += Math.max(0, Math.min(rEnd, q.end) - Math.max(rStart, q.start));
          }
          var freeDur = Math.max(0, (rEnd - rStart) - rOv);
          if ((run.length >= 2 && freeDur >= 1.0) || freeDur >= 1.5) {
            if (handoffQ && handoffQ.end > rStart) {
              handoffQ.notes.forEach(function (qn) {
                if (qn.start < rStart && qn.start + qn.dur > rStart) qn.dur = Math.max(0.05, rStart - qn.start);
              });
              handoffQ.end = Math.min(handoffQ.end, rStart);
            }
            placed.push({
              start: rStart,
              end: rEnd,
              notes: run.map(function (rn) { return Object.assign({}, rn); }),
              trackIndex: L.trackIndex
            });
          }
          run = []; handoffQ = null;
        }
        for (var ni = 0; ni < P.notes.length; ni++) {
          var n = P.notes[ni];
          var st = isCoveredAt(n.start + Math.min(0.04, n.dur * 0.25), P.notes.length, P.end);
          if (!st) {
            var nextQ = null;
            for (var qi = 0; qi < placed.length; qi++) {
              var q = placed[qi];
              if (q.start > n.start + 0.04 && n.start + n.dur > q.start + 0.04) {
                if (!nextQ || q.start < nextQ.start) nextQ = q;
              }
            }
            if (nextQ) {
              var clippedDur = nextQ.start - n.start;
              if (clippedDur >= 0.08) run.push(Object.assign({}, n, { dur: clippedDur }));
              flushRun();
            } else {
              run.push(n);
            }
          } else if (st.handoff) {
            if (run.length && !handoffQ) flushRun();
            if (!run.length) handoffQ = st.handoff;
            run.push(n);
          } else {
            flushRun();
          }
        }
        flushRun();
      });
    });

    placed.sort(function (a, b) { return a.start - b.start; });
    for (var pk = 0; pk < placed.length - 1; pk++) {
      var curP = placed[pk], nxtP = placed[pk + 1];
      if (curP.end > nxtP.start) {
        curP.notes.forEach(function (qn) {
          if (qn.start < nxtP.start && qn.start + qn.dur > nxtP.start) qn.dur = Math.max(0.05, nxtP.start - qn.start);
        });
        curP.notes = curP.notes.filter(function (qn) { return qn.start < nxtP.start - 0.02; });
        curP.end = curP.notes.length ? Math.max.apply(null, curP.notes.map(function (qn) { return qn.start + qn.dur; })) : curP.start;
      }
    }
    placed = placed.filter(function (p) { return p.notes.length > 0 && p.end > p.start; });
    placed.forEach(function (p) {
      var wSum = 0, vcSum = 0;
      p.notes.forEach(function (n) {
        var s = n.start, e = n.start + n.dur, count = 0;
        layers.forEach(function (L) {
          var hit = L.voiced.some(function (v) {
            return Math.min(e, v.start + v.dur) - Math.max(s, v.start) > Math.min(0.08, n.dur * 0.4);
          });
          if (hit) count++;
        });
        wSum += n.dur; vcSum += Math.max(1, count) * n.dur;
      });
      p.voiceCount = wSum > 0 ? vcSum / wSum : 1;
    });

    var leadMel = [];
    placed.forEach(function (p) { leadMel = leadMel.concat(p.notes); });
    leadMel.sort(function (a, b) { return a.start - b.start; });

    var allMel = [];
    layers.forEach(function (L) {
      L.voiced.forEach(function (n) {
        allMel.push(Object.assign({}, n, { _trackIndex: L.trackIndex }));
      });
    });
    allMel.sort(function (a, b) { return a.start - b.start; });
    var allVocalOnsets = clusterVocalOnsets(allMel, 0.06);

    var summary = {
      trackCount: layers.length,
      mode: ensembleMode,
      tracks: layers.map(function (L) {
        return { trackIndex: L.trackIndex, name: L.name, role: L.role, leadScore: +L.leadScore.toFixed(2) };
      })
    };
    var roleByTrack = {};
    layers.forEach(function (L) { roleByTrack[L.trackIndex] = L.role; });

    return {
      multi: true,
      tracks: selected,
      leadTrack: byScore[0].track,
      layers: layers,
      roleByTrack: roleByTrack,
      leadPhrases: placed,
      leadMel: leadMel,
      allMel: allMel,
      allVocalSpans: allVocalSpans,
      allVocalOnsets: allVocalOnsets,
      summary: summary
    };
  }

  C.analyzeVocalEnsemble = function (score, opt) {
    var e = prepareVocalEnsemble(score, opt);
    if (e.multi) return e.summary;
    if (e.tracks.length) {
      return {
        trackCount: 1,
        mode: 'single',
        tracks: [{ trackIndex: e.tracks[0].trackIndex, name: e.tracks[0].track.name || '', role: 'lead' }]
      };
    }
    return { trackCount: 0, mode: 'empty', tracks: [] };
  };

  function pickVocalTrack(score, opt) {
    var tracks = (score && score.tracks) || [];
    if (opt && Number.isInteger(opt.trackIndex) && tracks[opt.trackIndex] && tracks[opt.trackIndex].type === 'vocal') {
      return tracks[opt.trackIndex];
    }
    var first = null;
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i] && tracks[i].type === 'vocal') {
        if (!first) first = tracks[i];
        if (tracks[i].notes && tracks[i].notes.length) return tracks[i];
      }
    }
    return first;
  }

  function arrangeCore(score, opt) {
    opt = opt || {};
    // Three-beat bars arrive here already warped onto four-unit bars: one beat = 4/3 unit.
    var triple = opt.meter === 3, unit = triple ? 4 / 3 : 1;
    var ensemble = opt._ensemble || prepareVocalEnsemble(score, opt);
    if (!ensemble.tracks.length) return [];
    var multi = !!ensemble.multi;
    var trk = ensemble.tracks[0].track;
    if (!multi && (!trk || !trk.notes || !trk.notes.length)) return [];
    var bpm = (score.tempos && score.tempos[0] && score.tempos[0].bpm) || score.tempo || 120;
    var analysis = C.analyzeArrangement(multi ? ensemble.leadMel : trk.notes,
      Object.assign({}, opt, { bpm: bpm, outro: opt.outro !== false, _ensemble: multi ? ensemble : null }));
    if (!analysis.phrases.length) return [];
    var mel = multi ? ensemble.leadMel : trk.notes.filter(pitched).sort(function (a, b) { return a.start - b.start; });
    var allMel = multi ? ensemble.allMel : mel;
    var bars = analysis.bars, sections = analysis.sections;
    var ST = C.arrangeStyleById(opt.style || 'pop');
    var chipMode = !!(opt.chip8bit || ST.chip), voicePlan = ARRANGE_VOICES[ST.id] || {};
    function instrumentFor(part, section, fallback) {
      if (chipMode) return fallback;
      var spec = voicePlan[part];
      var id = typeof spec === 'string' ? spec : spec && (spec[section === 'lead' ? 'intro' : section] || spec.verse);
      return id && NSG.Instruments && NSG.Instruments.get(id) ? id : fallback;
    }
    function instrumentRange(inst, lo, hi) {
      var preset = !chipMode && NSG.Instruments && NSG.Instruments.get(inst);
      return preset && preset.range ? [Math.max(lo, preset.range[0]), Math.min(hi, preset.range[1])] : [lo, hi];
    }

    /* 种子：不给就用当前时间；给了就能复现 */
    var seed = opt.seed === undefined || opt.seed === null || opt.seed === ''
      ? (Date.now() & 0x7fffffff) : (opt.seed >>> 0);
    var rnd = NSG.mulberry32(seed);
    var hum = opt.humanize === undefined ? 1 : +opt.humanize;   // 0 = 机械，1 = 自然，2 = 松散
    var swing = ST.straight || triple ? 0 : opt.swing === undefined ? 0.06 : +opt.swing;  // 反拍往后拖（拍数）
    var density = opt.density === undefined ? 1 : Math.max(0.3, Math.min(2, +opt.density));
    var expression = opt.expression === undefined || !Number.isFinite(+opt.expression) ? 1 : Math.max(0, Math.min(2, +opt.expression));
    var chordRate = opt.chordRate === undefined || !Number.isFinite(+opt.chordRate) ? 1 : Math.max(0.4, Math.min(2, +opt.chordRate));
    var sequenceTempo = ST.sequence && NSG.TEMPO ? NSG.TEMPO.map(score) : null;
    var balladTempo = ST.id === 'ballad' && NSG.TEMPO ? NSG.TEMPO.map(score) : null;
    var moodChoice = arrangementMood(mel, analysis, bpm, opt.mood), mood = moodChoice.spec;
    density = Math.max(0.3, Math.min(2, density * mood.density));
    var blocks = analysis.blocks, phrases = analysis.phrases;

    /* ---- 小节级的段落角色与段落轮次 ----
       旋律进来之前的空小节当作引子（lead），单独配一套稀一点的织体 */
    var firstVocal = allMel[0].start;
    var roles = blocks.map(function (b) { return b.section !== 'intro' && b.end <= firstVocal + 1e-6 ? 'lead' : b.section; });
    var barInfo = {}, barOrder = [];
    blocks.forEach(function (b, i) { if (!barInfo[b.bar]) { barInfo[b.bar] = { role: roles[i] }; barOrder.push(b.bar); } });
    var runCount = {}, run = null;
    barOrder.forEach(function (bar) {
      var info = barInfo[bar];
      if (!run || run.role !== info.role) {
        run = { role: info.role, bars: 0, instance: runCount[info.role] || 0 };
        runCount[info.role] = run.instance + 1;
      }
      info.run = run; info.inRun = run.bars++;
    });
    barOrder.forEach(function (bar, i) {
      var info = barInfo[bar], next = barInfo[barOrder[i + 1]];
      info.last = !next || next.run !== info.run; info.nextRole = next ? next.role : null;
      if (info.last) info.run.nextRole = info.nextRole;
    });
    // 音型选择按「种子 + 名字」散列，和其他随机数互不影响：调密度、开关鼓组都不会把整套音型换掉
    function hashed(key) {
      var h = seed ^ 0x9e3779b9;
      for (var c = 0; c < key.length; c++) h = Math.imul(h ^ key.charCodeAt(c), 0x01000193);
      return NSG.mulberry32(h >>> 0)();
    }
    function choose(key, list, instance) {
      if (!list || !list.length) return null;
      var idx = Math.floor(hashed(key) * list.length);
      // 段落再次出现时多半沿用原来的织体，偶尔换一个，让第二遍副歌有新鲜感
      if (instance > 0 && list.length > 1 && hashed(key + '#' + instance) < 0.3) idx = Math.floor(hashed(key + '@' + instance) * list.length);
      return list[idx];
    }
    // Bass and chord rhythms belong to the same two-bar family, independent of kit/density.
    var sequenceFamily = Math.floor(hashed('electronic-sequence') * 3);
    var keepRnd = NSG.mulberry32((seed ^ 0x2545f491) >>> 0);
    function sectionList(table, role) {
      if (!table) return null;
      if (role === 'bridge') role = 'pre';
      if (table[role]) return table[role];
      if (role === 'lead' || role === 'intro' || role === 'outro') return table.intro || null;
      if (role === 'pre') return table.verse || null;
      return null;
    }

    /* ---- 和声窗口：小节线、半小节、乐句起点 ---- */
    var windows = [];
    blocks.forEach(function (block, bi) {
      var cuts = [block.start, block.end];
      phrases.forEach(function (p) { if (p.start > block.start + 0.3 && p.start < block.end - 0.3) cuts.push(p.start); });
      var halfBar = block.barStart + 2;
      if (!triple && halfBar > block.start && halfBar < block.end && cuts.every(function (c) { return Math.abs(c - halfBar) >= 0.99; })) cuts.push(halfBar);
      cuts.sort(function (a, b) { return a - b; });
      for (var c = 0; c < cuts.length - 1; c++) {
        if (cuts[c + 1] - cuts[c] < 1e-6) continue;
        windows.push({ start: cuts[c], end: cuts[c + 1], block: bi, bar: block.bar, barStart: block.barStart,
          barLine: Math.abs(cuts[c] - block.barStart) < 1e-6 || c === 0, role: roles[bi] });
      }
    });
    var heldMelody = multi ? null : mel.filter(function (n) { return n.dur >= unit; });
    var barOnsets = {};
    var pi = 0;
    windows.forEach(function (w) {
      while (pi + 1 < phrases.length && phrases[pi + 1].start <= w.start + 1e-6) pi++;
      w.phrase = phrases[pi]; w.phraseIndex = pi;
      w.pc = multi
        ? multiPitchHistogram(ensemble.layers, w.start, w.end, analysis.grid.offset, triple ? 3 : true)
        : pitchHistogram(mel, w.start, w.end, analysis.grid.offset, triple ? 3 : true);
      w.weight = w.pc.reduce(function (a, b) { return a + b; }, 0);
      w.held = multi
        ? multiPitchHistogram(ensemble.layers, w.start, w.end, analysis.grid.offset, triple ? 3 : true, unit)
        : pitchHistogram(heldMelody, w.start, w.end, analysis.grid.offset, triple ? 3 : true);
      if (multi) {
        var onsetsInM = ensemble.allVocalOnsets.filter(function (t) { return t >= w.start - 1e-6 && t < w.end - 1e-6; });
        w.onsets = onsetsInM.length;
        barOnsets[w.bar] = (barOnsets[w.bar] || 0) + w.onsets;
        w.firstOnset = onsetsInM.length ? onsetsInM[0] : Infinity;
      } else {
        var onsetsInW = mel.filter(function (n) { return n.start >= w.start - 1e-6 && n.start < w.end - 1e-6; });
        w.onsets = onsetsInW.length;
        barOnsets[w.bar] = (barOnsets[w.bar] || 0) + w.onsets;
        w.firstOnset = onsetsInW.length ? onsetsInW[0].start : Infinity;
      }
      w.options = chordOptions(w.phrase.key, w.phrase.minor, w.pc, w.weight, ST.harmonicV);
    });
    function windowAt(beat) {
      var lo = 0, hi = windows.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, w = windows[mid];
        if (beat + 1e-6 < w.start) hi = mid - 1;
        else if (beat >= w.end - 1e-6) lo = mid + 1;
        else return mid;
      }
      return -1;
    }
    var uniquePcs = new Set(allMel.map(function (n) { return pitchClass(n.pitch); })).size;
    var hasOutro = roles[blocks.length - 1] === 'outro';
    var outroBarsList = [];
    if (hasOutro) {
      blocks.forEach(function (b, bi) {
        if (roles[bi] === 'outro' && outroBarsList.indexOf(b.bar) < 0) outroBarsList.push(b.bar);
      });
    }
    var lastOutroBar = outroBarsList.length ? outroBarsList[outroBarsList.length - 1] : -1;
    var preOutroBar = outroBarsList.length >= 2 ? outroBarsList[outroBarsList.length - 2] : -1;
    /* 终止式：句尾落主和弦，句尾前一个窗口偏向属/下属 */
    phrases.forEach(function (p, index) {
      var tailNote = p.notes[p.notes.length - 1];
      var k = windowAt(tailNote.start);
      if (k < 0) return;
      var next = phrases[index + 1], final = !next || next.section !== p.section;
      var tailRel = (pitchClass(tailNote.pitch) - p.key + 12) % 12;
      var intoChorus = next && next.section === 'chorus';
      var halfCad = next && (tailRel === 2 || (intoChorus && tailRel === 7));
      var kEnd = Math.max(k, windowAt(Math.max(tailNote.start, tailNote.start + tailNote.dur - 0.05)));
      for (var wk = k; wk <= kEnd && windows[wk].phrase === p; wk++) {
        windows[wk].cadence = Math.max(windows[wk].cadence || 0, final ? 2 : 1);
        if (halfCad) windows[wk].halfCadence = true;
      }
      if (!next && (uniquePcs <= 1 || !hasOutro)) for (var tail = k; tail < windows.length; tail++) windows[tail].songEnd = true;
      if (k > 0 && windows[k - 1].phrase === p) windows[k - 1].preCadence = true;
    });
    if (hasOutro) {
      windows.forEach(function (w) {
        if (uniquePcs <= 1 || phrases.length <= 1) {
          if (w.role === 'outro') w.songEnd = true;
        } else if (w.bar === lastOutroBar) {
          w.songEnd = true;
        } else if (w.bar === preOutroBar && w.weight < 1e-6) {
          w.preCadence = true;
        }
      });
    }
    // Short bars (fast waltz, quick tempo) change harmony every other bar, not on every downbeat.
    var shortBars = 4 * 60 / bpm < 1.7;
    var firstMelodic = windowAt(firstVocal);
    windows.forEach(function (w, wi) {
      var info = barInfo[w.bar], section = blocks[w.block].section;
      var progs = w.phrase.minor ? ST.prog.minor : sectionList(ST.prog, section === 'intro' || section === 'outro' ? 'verse' : section);
      var tpl = TEMPLATES[choose('prog:' + section + (w.phrase.minor ? 'm' : ''), progs || ST.prog.verse, 0)];
      var preferred = tpl[(shortBars ? Math.floor(info.inRun / 2) : info.inRun) % tpl.length], empty = w.weight < 1e-6;
      var subBarBreath = empty && (!w.barLine || (w.end - w.start < 3.5 && w.role !== 'intro' && w.role !== 'lead' && w.role !== 'outro'));
      w.node = w.options.map(function (o) {
        var sc = chordFit(o.tones, w.pc, w.weight) + (w.role === 'outro' && empty ? 0 : (rnd() - 0.5) * 0.1);
        // Sustained melody tones are structural evidence. Give them priority
        // over short ornaments when the continuity cost would otherwise win.
        // A slow harmonic rhythm is a preference, not permission to ignore a
        // sustained melody. Scale its evidence with the extra continuity cost;
        // short passing notes retain their ordinary weight at every setting.
        var heldPriority = 1.5 + 3 * Math.max(0, 1 / (chordRate * mood.chordRate) - 1);
        o.tones.forEach(function (pc) { sc += heldPriority * w.held[pc] / Math.max(w.weight, 1e-9); });
        if (o.quality === 'dim') sc -= 0.35;
        else if (o.quality === 'sus4' || o.quality === 'sus2') sc -= w.preCadence && o.quality === 'sus4' ? 0.1 : ST.sus !== undefined ? ST.sus : 0.6;
        // 演歌的小调里属和弦一律用大三（V7），自然小调 v 让位；句尾前也少用自然 VII，留给 V7→i
        var harmonicDominant = ST.harmonicV && o.minor && o.degree === 4 && o.quality === 'maj';
        if (ST.harmonicV && o.minor && o.degree === 4 && o.quality === 'min') sc -= 0.3;
        if (ST.harmonicV && o.minor && o.degree === 6 && !o.chromatic) sc -= w.preCadence ? 0.3 : 0.12;
        if (o.chromatic && !harmonicDominant) sc -= w.weight > 0 ? 0.02 : 0.08;
        var plain = (!o.chromatic || harmonicDominant) && (o.quality === 'maj' || o.quality === 'min');
        if (plain && o.degree === preferred && !(w.songEnd && empty) && !subBarBreath) sc += empty ? 0.75 : 0.28;
        if (w.cadence && plain) {
          if (w.halfCadence && !w.songEnd) sc += o.degree === 4 ? 0.62 : o.degree === 0 ? -0.1 : 0;
          else sc += o.degree === 0 ? (w.cadence === 2 ? 0.32 : 0.12) : o.degree === 4 && w.cadence === 1 ? 0.08 : o.degree === 5 ? 0.04 : 0;
        }
        if (w.preCadence) sc += w.halfCadence ? (o.degree === 1 ? 0.18 : o.degree === 3 ? 0.14 : 0) :
          (o.degree === 4 ? (o.quality === 'sus4' ? 0.06 : 0.12) : o.degree === 3 ? 0.06 : o.degree === 1 ? 0.05 : 0);
        if (wi === firstMelodic && plain && o.degree === 0) sc += 0.85;
        // 挂留是要解决的张力，不适合放在句头
        if ((o.quality === 'sus4' || o.quality === 'sus2') && Math.abs(w.start - w.phrase.start) < 1e-6) sc -= 0.35;
        // 全曲收在主和弦上：比模板和重复句的偏好都强
        if (w.songEnd && plain && o.degree === 0) sc += (wi === windows.length - 1 || (hasOutro && w.role === 'outro')) ? 1.0 : 0.75;
        // A tiny pickup or a mostly empty window must not carry the same vote
        // as two beats of melody. Otherwise one passing note can move the bass.
        return sc * Math.min(1, (w.end - w.start) / 2, w.weight / 2 || 1);
      });
    });
    function transition(a, b, w) {
      var weakBar = shortBars && w.barLine && barInfo[w.bar].inRun % 2 === 1 && Math.abs(w.start - w.phrase.start) > 1e-6;
      if (sameChord(a, b)) return 0;
      // An actual modulation keeps its exact onset; ordinary bar/phrase lines
      // are opportunities to change harmony, not reasons to force a change.
      if (a.key !== b.key || a.minor !== b.minor) return 0;
      // Instrumental intro/interlude bars (weight === 0) should follow the progression template smoothly.
      if (w.weight < 1e-6) {
        var emptySubBar = !w.barLine || (w.end - w.start < 3.5 && w.role !== 'intro' && w.role !== 'lead' && w.role !== 'outro');
        return motion(a, b) - (emptySubBar ? 1.15 : w.barLine ? 0.12 : 0.65) / (chordRate * mood.chordRate);
      }
      var calm = ST.id === 'dreampop' ? 0.56 : ST.id === 'ballad' || ST.id === 'piano' ? 0.44 : 0.30;
      // Sustained single held note with zero new onsets (like a long whole/tie test) stays anchored.
      var latePickup = !w.barLine && w.weight <= 1.35 && w.firstOnset >= w.barStart + 2.95;
      var holdGuard = (w.barLine && w.onsets === 0 ? 0.55 : 0) + (latePickup ? 0.45 : 0);
      var cost = calm + holdGuard + ST.halfChange + (w.barLine ? 0 : 0.38 + ST.halfChange);
      if (weakBar) cost += 0.35;
      if (w.cadence || w.preCadence) cost *= 0.85;
      return motion(a, b) - cost / (chordRate * mood.chordRate);
    }
    function solve(bonus) {
      var score = [], back = [], holdBars = [], prevDeg = [];
      windows.forEach(function (w, wi) {
        score[wi] = []; back[wi] = []; holdBars[wi] = []; prevDeg[wi] = [];
        w.options.forEach(function (o, j) {
          var node = w.node[j] + (bonus ? bonus(wi, o) : 0), best = 0, arg = -1, bestHold = 0, bestPrevDeg = -1;
          if (wi) {
            best = -Infinity;
            var activeBarLine = w.barLine && barOnsets[w.bar] > 0;
            windows[wi - 1].options.forEach(function (prev, k) {
              var same = sameChord(prev, o);
              var v = score[wi - 1][k] + transition(prev, o, w);
              if (same && activeBarLine && uniquePcs > 3 && o.degree !== 0) {
                var hb = holdBars[wi - 1][k];
                var phraseCut = Math.abs(w.start - w.phrase.start) < 1e-6;
                if (hb >= 1 || phraseCut) {
                  v -= (hb + (phraseCut ? 0.65 : 0)) * 0.25 * Math.min(1.4, chordRate * mood.chordRate);
                }
              } else if (!same && !o.chromatic && !prev.chromatic && !w.cadence && !w.songEnd && w.weight > 0 && uniquePcs > 3) {
                if (prevDeg[wi - 1][k] === o.degree && prev.key === o.key && prev.minor === o.minor) {
                  v -= ((o.degree === 0 && prev.degree === 4) || (o.degree === 4 && prev.degree === 0)) ? 0.22 : 0.12;
                }
              }
              if (v > best) {
                best = v; arg = k;
                bestHold = same ? holdBars[wi - 1][k] + (activeBarLine ? 1 : 0) : 0;
                bestPrevDeg = same ? prevDeg[wi - 1][k] : (prev.key === o.key && prev.minor === o.minor && !prev.chromatic ? prev.degree : -1);
              }
            });
          }
          score[wi][j] = best + node; back[wi][j] = arg;
          holdBars[wi][j] = bestHold; prevDeg[wi][j] = bestPrevDeg;
        });
      });
      var last = score[windows.length - 1], pick = 0, picks = [];
      last.forEach(function (v, j) { if (v > last[pick]) pick = j; });
      for (var wi = windows.length - 1; wi >= 0; wi--) { picks[wi] = pick; pick = back[wi][pick]; }
      return picks;
    }
    /* 两遍求解：第二遍让重复出现的乐句（同一句型家族、同样的小节相位）沿用第一次的和声，
       这样副歌每次回来都是同一套进行，听起来像一首歌而不是逐句即兴 */
    var firstPass = solve(null);
    var familyFirst = {};
    phrases.forEach(function (p) {
      var key = p.family + ':' + Math.round(mod4(p.start) * 8);
      if (!(key in familyFirst)) familyFirst[key] = p;
    });
    var picks = solve(function (wi, o) {
      var w = windows[wi], p = w.phrase, q = familyFirst[p.family + ':' + Math.round(mod4(p.start) * 8)];
      if (!q || q === p || w.start < p.start - 1e-6 || w.songEnd) return 0;
      var k = windowAt(q.start + (w.start - p.start));
      if (k < 0 || windows[k].phrase !== q) return 0;
      var ref = windows[k].options[firstPass[k]];
      return ref.degree === o.degree && ref.quality === o.quality && ref.chromatic === o.chromatic && ref.minor === o.minor ? 0.55 : 0;
    });

    var harmonies = [], chords = [];
    windows.forEach(function (w, wi) {
      var o = w.options[picks[wi]], prev = harmonies[harmonies.length - 1];
      if (prev && prev.block === w.block && sameChord(prev, o)) { prev.end = w.end; return; }
      harmonies.push({ start: w.start, end: w.end, key: o.key, minor: o.minor, degree: o.degree, root: o.root,
        quality: o.quality, chromatic: o.chromatic, tones: o.tones.slice(), score: w.node[picks[wi]], block: w.block, role: w.role });
      if (w.barLine && (!prev || prev.block !== w.block)) chords.push(o.degree);
    });
    // Keep the rendering blocks, but choose colour and inversion once for each
    // uninterrupted chord. Re-rolling them at every bar makes a held harmony flicker.
    var harmonicRuns = [];
    harmonies.forEach(function (h) {
      var prev = harmonicRuns[harmonicRuns.length - 1];
      if (prev && sameChord(prev, h)) { prev.end = h.end; prev.members.push(h); }
      else harmonicRuns.push(Object.assign({}, h, { members: [h] }));
    });
    /* 色彩音：属和弦加小七/九/十三，其余按风格加 maj7/maj9/add9/6/m7/m9；旋律唱到的色彩音优先，
       和旋律成小二度的色彩音一律不要 */
    var COMPOUND_EXT = { 14: [11, 2], 15: [10, 2], 16: [10, 2], 21: [10, 9], 17: [10, 5] };
    harmonicRuns.forEach(function (h) {
      var pc = multi
        ? multiPitchHistogram(ensemble.layers, h.start, h.end, analysis.grid.offset, triple ? 3 : true)
        : pitchHistogram(mel, h.start, h.end, analysis.grid.offset, triple ? 3 : true);
      var weight = pc.reduce(function (a, b) { return a + b; }, 0);
      var scale = (h.minor ? DEG_MIN : DEG_MAJ).map(function (d) { return (d + h.key) % 12; });
      var dominant = h.quality === 'maj' && ((h.degree === 4 && !h.chromatic) || (h.chromatic && (h.minor ? h.degree === 4 : h.degree !== 6)));
      var richColor = ST.color >= 0.45 && (ST.id === 'citypop' || ST.id === 'bossa' || ST.id === 'ballad' || ST.id === 'dreampop' || ST.id === 'piano' || ST.id === 'pop' || ST.id === 'da' || ST.id === 'edm');
      var prefs = dominant ? (richColor ? [16, 21, 10] : [10]) : h.quality === 'sus4' ? [10] : h.quality === 'dim' ? (h.minor ? [] : [10]) : (ST.colorPref[h.quality] || []).slice();
      if (!dominant && richColor) {
        if (h.quality === 'maj' && prefs.indexOf(14) < 0 && prefs.indexOf(11) >= 0) prefs.unshift(14);
        if (h.quality === 'min' && prefs.indexOf(15) < 0 && prefs.indexOf(10) >= 0) prefs.unshift(15);
        if (h.quality === 'min' && prefs.indexOf(17) < 0 && (ST.id === 'citypop' || ST.id === 'bossa')) prefs.push(17);
      }
      // Reorder only colours already allowed by the style. The melody's scale,
      // avoid notes and dominant function continue to take precedence over mood.
      if (!dominant) prefs = prefs.slice().sort(function (a, b) {
        var am = mood.colors.indexOf(a % 12), bm = mood.colors.indexOf(b % 12);
        return (am < 0 ? 9 : am) - (bm < 0 ? 9 : bm);
      });
      var level = dominant ? Math.min(1, ST.color + 0.35) : h.quality === 'dim' ? ST.color * 0.6 : ST.color * (h.role === 'chorus' ? 1.15 : 0.95);
      if ((ST.id === 'polka' || ST.harmonicV) && dominant) level = 0.85;
      function extTones(iv) { return COMPOUND_EXT[iv] || [iv]; }
      var viable = prefs.filter(function (iv) {
        return extTones(iv).every(function (step) {
          var x = (h.root + step) % 12;
          if (h.tones.indexOf(x) >= 0 || scale.indexOf(x) < 0) return false;
          return pc[(x + 1) % 12] <= weight * 0.04 && pc[(x + 11) % 12] <= weight * 0.04;
        });
      });
      var sung = viable.filter(function (iv) { return extTones(iv).some(function (s) { return pc[(h.root + s) % 12] >= weight * 0.08; }); })[0];
      var roll = rnd(), pickIv = null;
      if (sung !== undefined && roll < Math.max(level, 0.1) + 0.5) pickIv = sung;
      else if (viable.length && roll < level) pickIv = viable[Math.floor(Math.pow(rnd(), 1.35) * viable.length)];
      if (pickIv !== null) {
        h.ext = pickIv;
        extTones(pickIv).forEach(function (step) {
          var tone = (h.root + step) % 12;
          if (h.tones.indexOf(tone) < 0) h.tones.push(tone);
        });
      }
    });
    /* 转位：前后低音能连成级进时（三音、五音、七音下行/上行低音线条）启用斜杠转位 */
    function stepwise(a, b) { var d = Math.abs(a - b) % 12; d = Math.min(d, 12 - d); return d >= 1 && d <= 2; }
    function stepSign(a, b) { var d = (b - a + 12) % 12; return d === 1 || d === 2 ? 1 : d === 10 || d === 11 ? -1 : 0; }
    harmonicRuns.forEach(function (h, i) {
      h.bass = h.root;
      var prev = harmonicRuns[i - 1], next = harmonicRuns[i + 1];
      var roll = rnd();
      if (!prev || !next || (h.quality !== 'maj' && h.quality !== 'min') || roll >= ST.inversion) return;
      var cands = [h.tones[1]];
      if (h.tones.length >= 4 && ST.color >= 0.35) cands.push(h.tones[3]);
      if (h.tones.length >= 3 && ST.inversion >= 0.35) cands.push(h.tones[2]);
      var rootDirect = stepwise(prev.bass, h.root) && stepwise(h.root, next.root);
      var pickBass = cands.find(function (t) {
        var s1 = stepSign(prev.bass, t), s2 = stepSign(t, next.root);
        // Continuous unidirectional stepwise bass (e.g. C -> G/B -> Am7 -> Am7/G -> F) or bridging step where root jumps.
        return (s1 !== 0 && s1 === s2 && t !== prev.bass && t !== next.root) ||
          (!rootDirect && stepwise(prev.bass, t) && stepwise(t, next.root));
      });
      if (pickBass !== undefined) h.bass = pickBass;
    });
    harmonicRuns.forEach(function (h) {
      h.members.forEach(function (part) {
        part.tones = h.tones.slice(); part.bass = h.bass;
        if (h.ext !== undefined) part.ext = h.ext;
        part.name = chordName(part);
      });
    });
    function harmonyAt(beat) {
      var lo = 0, hi = harmonies.length - 1;
      while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (harmonies[mid].start <= beat + 1e-8) lo = mid; else hi = mid - 1; }
      return harmonies[lo];
    }

    /* ---- 排位：避开主唱音区，声部就近连接；色彩风格支持开放排列/Drop-2 ---- */
    var vocalPitches = allMel.map(function (n) { return n.pitch; }).sort(function (a, b) { return a - b; });
    var vocalLowDefault = vocalPitches[Math.floor(vocalPitches.length * 0.2)];
    var vocalHighDefault = vocalPitches[Math.floor((vocalPitches.length - 1) * 0.9)];
    var openStyle = /^(pop|ballad|piano|citypop|bossa|dreampop|guofeng|da|edm)$/.test(ST.id);
    function voiceChord(tones, prev, target, allowRootless, vLow, vHigh) {
      var best = null;
      var shapes = [tones];
      if (openStyle && allowRootless && tones.length >= 4) {
        // Upper-structure rootless voicing [3, 5, 7, 9...] when bass anchors root below.
        var rootless = tones.slice(1);
        if (rootless.length >= 3) shapes.push(rootless);
      }
      shapes.forEach(function (shape) {
        for (var inv = 0; inv < shape.length; inv++) {
          var order = shape.slice().sort(function (a, b) { return (a - shape[inv] + 12) % 12 - (b - shape[inv] + 12) % 12; });
          for (var open = 0; open <= (openStyle && shape.length >= 3 ? 1 : 0); open++) {
            for (var base = 46; base <= 66; base++) {
              if (pitchClass(base) !== order[0]) continue;
              var v = [base];
              for (var k = 1; k < order.length; k++) {
                var p = v[k - 1] + 1;
                while (pitchClass(p) !== order[k]) p++;
                if (open && k === 1 && p + 12 <= target + 3) p += 12; // Open spread (drop-2 / tenth span)
                v.push(p);
              }
              v.sort(function (a, b) { return a - b; });
              var top = v[v.length - 1];
              if (top > target + 4 || v[0] < 48 || top - v[0] > 21) continue;
              var cost = Math.abs(top - target) * 0.35 + (open ? -0.18 : 0) + (shape !== tones ? -0.12 : 0);
              if (v[0] < 53 && v[1] - v[0] < 3) cost += 2;
              if (vLow !== undefined && vLow < 56 && vHigh <= 60 && Math.abs(top - vHigh) <= 1) cost += 0.65;
              if (prev) {
                v.forEach(function (x) { cost += 0.5 * Math.min.apply(null, prev.map(function (q) { return Math.abs(x - q); })); });
                cost += Math.abs(top - prev[prev.length - 1]) * 0.25;
              }
              if (!best || cost < best.cost) best = { v: v, cost: cost };
            }
          }
        }
      });
      if (best) return best.v;
      return tones.map(function (pc) { return 48 + (pc - 48 % 12 + 12) % 12; }).sort(function (a, b) { return a - b; });
    }
    var prevVoicing = null, prevBass = 40, prevLow = vocalLowDefault, prevHigh = vocalHighDefault;
    harmonies.forEach(function (h, i) {
      h.index = i;
      var sounding = allMel.filter(function (n) { return n.start < h.end && n.start + n.dur > h.start; });
      h.vLow = sounding.length ? Math.min.apply(null, sounding.map(function (n) { return n.pitch; })) : prevLow;
      h.vHigh = sounding.length ? Math.max.apply(null, sounding.map(function (n) { return n.pitch; })) : prevHigh;
      prevLow = h.vLow; prevHigh = h.vHigh;
      var target = Math.max(59, Math.min(71, h.vLow - 2));
      h.voicing = voiceChord(h.tones, prevVoicing, target, h.bass === h.root, h.vLow, h.vHigh); prevVoicing = h.voicing;
      // 避免音：主唱拉住的音和某个和弦音成小二度时，伴奏的排位里去掉这个和弦音
      var avoid = h.tones.filter(function (pc) {
        return sounding.some(function (n) {
          var iv = (n.pitch - pc + 12) % 12;
          return (iv === 1 || iv === 11) && Math.min(n.start + n.dur, h.end) - Math.max(n.start, h.start) >= 0.6;
        });
      });
      function thin(v) { var k = v.filter(function (p) { return avoid.indexOf(pitchClass(p)) < 0; }); return k.length >= 2 ? k : v; }
      h.voicing = thin(h.voicing); h.avoid = avoid;
      h.clashBass = avoid.indexOf(h.bass) >= 0;
      var best = null;
      for (var p = 28; p <= 50; p++) {
        if (pitchClass(p) !== h.bass) continue;
        var cost = Math.abs(p - prevBass) + 0.15 * Math.abs(p - 40) + (p < 31 ? 3 : 0);
        if (best === null || cost < best.cost) best = { p: p, cost: cost };
      }
      h.bassPitch = best.p; prevBass = best.p;
      // 吉他：低音弦 + 开放式排列
      var g = h.bassPitch; while (g < 40) g += 12; while (g > 52) g -= 12;
      var third = (h.tones[1] - h.root + 12) % 12, fifth = (h.tones[2] - h.root + 12) % 12, rootUp = g + (h.root - g % 12 + 12) % 12;
      if (rootUp < g + 3 && rootUp !== g) rootUp += 12;
      var color = h.ext === undefined ? rootUp + 12 + fifth : h.ext >= 9 ? rootUp + h.ext : rootUp + 12 + h.ext;
      h.guitar = [g, rootUp + fifth, rootUp + 12, rootUp + 12 + third, color]
        .filter(function (x, k, a) { return x > g || k === 0; }).filter(function (x, k, a) { return a.indexOf(x) === k; })
        .sort(function (a, b) { return a - b; });
      var pr = h.root; while (pr < 40 + 0) pr += 12; while (pr > 47) pr -= 12; if (pr < 40) pr += 12;
      h.guitar = [h.guitar[0]].concat(thin(h.guitar.slice(1)));
      h.power = [pr, pr + fifth, pr + 12];
    });

    /* --- 生成 --- */
    var out = [];
    /* 人性化只给「手弹」的声部：垫底、贝斯、琶音、弦乐各飘 ±2.5ms；
       鼓点基本贴网格（与主唱对齐才不糊），只给 ±1.2ms */
    var jitterBeats = function (isDrum) {
      var amt = (isDrum ? 0.0015 : 0.004) * hum;
      return (rnd() - 0.5) * 2 * amt;
    };
    var velOf = function (base, sp) { return Math.max(12, Math.min(127, Math.round(base + (rnd() - 0.5) * 2 * sp * hum))); };
    function swung(pos) {
      var frac = pos - Math.floor(pos);
      return Math.abs(frac - 0.5) < 1e-6 ? pos + swing : Math.abs(frac - 0.25) < 1e-6 || Math.abs(frac - 0.75) < 1e-6 ? pos + swing * 0.5 : pos;
    }
    var vocalSpans = [], vocalStarts;
    if (multi) {
      for (var vs = 0; vs < allMel.length; vs++) {
        var vn = allMel[vs];
        var vs0 = vn.start - 1e-6, vs1 = vn.start + vn.dur - 0.05;
        if (vs1 > vs0) {
          if (vocalSpans.length && vs0 <= vocalSpans[vocalSpans.length - 1][1]) {
            if (vs1 > vocalSpans[vocalSpans.length - 1][1]) vocalSpans[vocalSpans.length - 1][1] = vs1;
          } else vocalSpans.push([vs0, vs1]);
        }
      }
      vocalStarts = new Float64Array(ensemble.allVocalOnsets);
    } else {
      vocalStarts = new Float64Array(mel.length);
      for (var vs2 = 0; vs2 < mel.length; vs2++) {
        var vn2 = mel[vs2];
        vocalStarts[vs2] = vn2.start;
        var vs20 = vn2.start - 1e-6, vs21 = vn2.start + vn2.dur - 0.05;
        if (vs21 > vs20) {
          if (vocalSpans.length && vs20 <= vocalSpans[vocalSpans.length - 1][1]) {
            if (vs21 > vocalSpans[vocalSpans.length - 1][1]) vocalSpans[vocalSpans.length - 1][1] = vs21;
          } else vocalSpans.push([vs20, vs21]);
        }
      }
    }
    function vocalAt(t) {
      var lo = 0, hi = vocalSpans.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1, sp = vocalSpans[mid];
        if (t < sp[0]) hi = mid - 1;
        else if (t >= sp[1]) lo = mid + 1;
        else return true;
      }
      return false;
    }
    function vocalOnset(t) {
      var lo = 0, hi = vocalStarts.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (vocalStarts[mid] <= t - 0.06) lo = mid + 1;
        else hi = mid;
      }
      return lo < vocalStarts.length && vocalStarts[lo] < t + 0.06;
    }

    var currentBlock, currentPart;
    function strike(t, dur, vel, inst, voices, spread) {
      if (t < currentBlock.start - 1e-6 || t >= currentBlock.end - 1e-6) return;
      var h = harmonyAt(t);
      var stop = Math.min(t + dur, h.end, currentBlock.end);
      var onset = Math.max(h.start, currentBlock.start, t + jitterBeats(false));
      var pitches = voices(h);
      if (!pitches) return;
      var moodLevel = currentPart === 'bass' || inst === 'bass' || inst === 'tuba' ? 1 :
        currentPart === 'pad' || inst === 'pad' || inst === 'organ' ? mood.pad :
          currentPart === 'strings' || inst === 'strings' ? mood.strings :
            currentPart === 'arp' || inst === 'arp' || inst === 'pluck' ? mood.arp : mood.comp;
      vel *= moodLevel;
      inst = instrumentFor(currentPart, roles[h.block], inst);
      if (!chipMode && (ST.id === 'ballad' || ST.id === 'folk')) {
        var bInst = barInfo[blocks[h.block].bar].run.instance;
        if (currentPart === 'comp' && roles[h.block] === 'verse' && bInst >= 1) inst = 'guitarSteel12';
        else if (currentPart === 'pad' && roles[h.block] === 'chorus' && bInst >= 1) inst = 'choirSoft';
      }
      var preset = !chipMode && NSG.Instruments && NSG.Instruments.get(inst);
      if (preset && preset.range) pitches = pitches.map(function (p) { return inRange(p, preset.range[0], preset.range[1]); });
      pitches = pitches.filter(function (p, k) { return pitches.indexOf(p) === k; });
      pitches.forEach(function (p, k) {
        var at = onset + (spread || 0) * k;
        if (stop - at > 0.02) {
          var note = { start: at, dur: stop - at, pitch: Math.round(p), vel: velOf(vel, 6), inst: inst, harmonyEnd: h.end };
          if (!chipMode) note.arrangePart = currentPart;
          out.push(note);
        }
      });
    }
    function drum(t, dur, inst, pitch, vel) {
      if (t < currentBlock.start - 1e-6 || t >= currentBlock.end - 1e-6) return;
      var at = Math.max(currentBlock.start, t + jitterBeats(true)), d = Math.min(dur, currentBlock.end - at);
      vel *= /^(hat|openhat|ride|crash|perc)$/.test(inst) ? mood.cymbals : mood.drums;
      if (d > 0.02) out.push({ start: at, dur: d, pitch: Math.round(pitch), vel: velOf(vel, 7), inst: inst });
    }
    function inRange(p, lo, hi) { while (p < lo) p += 12; while (p > hi) p -= 12; return p; }
    function bassTone(h, tone, shift) {
      var b = h.bassPitch + (shift || 0), pick;
      var octMax = (ST.sequence ? 60 : 55) + (shift || 0);
      if (tone === 'O') return b + 12 <= octMax ? b + 12 : b;
      if (tone === '5' || tone === '3') {
        pick = b + (h.tones[tone === '5' ? 2 : 1] - pitchClass(b) + 12) % 12;
        return pick - b > 9 ? pick - 12 : pick;
      }
      if (tone === 'A') {
        var next = harmonies[h.index + 1];
        if (!next || sameChord(next, h)) return bassTone(h, '5', shift);
        var goal = next.bassPitch + (shift || 0), best = b, bd = Infinity;
        h.tones.forEach(function (pc) {
          for (var p = goal - 7; p <= goal + 7; p++) {
            if (pitchClass(p) !== pc || p === goal) continue;
            if (Math.abs(p - goal) < bd) { bd = Math.abs(p - goal); best = p; }
          }
        });
        return best;
      }
      return b;
    }
    function keep(pos) {
      var f = pos / unit - Math.floor(pos / unit + 1e-6);
      if (f < 1e-3 || density >= 1) return true;
      return keepRnd() < density + 0.25;
    }

    var lastBlock = blocks.length - 1, lastNote = allMel[allMel.length - 1];
    var energyOf = { lead: 0.82, intro: 0.8, verse: 0.9, pre: 1, chorus: 1.1, outro: 0.85 };
    var fillsPlaced = {}, chorusRunCount = runCount.chorus || 0, totalBars = barOrder.length, crashesPlaced = 0;
    var longBreaks = [];
    if (multi) {
      var lbSpans = ensemble.allVocalSpans;
      if (lbSpans.length && lbSpans[0][0] >= 24 * unit) longBreaks.push({ start: Math.max(0, blocks[0].start), end: lbSpans[0][0], isIntro: true });
      for (var lbi = 1; lbi < lbSpans.length; lbi++) {
        if (lbSpans[lbi][0] - lbSpans[lbi - 1][1] >= 24 * unit) longBreaks.push({ start: lbSpans[lbi - 1][1], end: lbSpans[lbi][0], isIntro: false });
      }
    } else {
      if (mel[0].start >= 24 * unit) longBreaks.push({ start: Math.max(0, blocks[0].start), end: mel[0].start, isIntro: true });
      for (var lbi2 = 1; lbi2 < mel.length; lbi2++) {
        var lbPrevEnd = mel[lbi2 - 1].start + mel[lbi2 - 1].dur;
        if (mel[lbi2].start - lbPrevEnd >= 24 * unit) longBreaks.push({ start: lbPrevEnd, end: mel[lbi2].start, isIntro: false });
      }
    }
    function longBreakAt(t) {
      for (var i = 0; i < longBreaks.length; i++) {
        if (t >= longBreaks[i].start - 1e-6 && t + 3.5 * unit <= longBreaks[i].end + 1e-6) return longBreaks[i];
      }
      return null;
    }

    for (var blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      currentBlock = blocks[blockIndex];
      var role = roles[blockIndex] === 'bridge' ? 'pre' : roles[blockIndex], info = barInfo[currentBlock.bar], bt = currentBlock.barStart;
      var brk = longBreakAt(bt);
      var longLeadActive = role === 'lead' && info.run.bars >= 6 && info.inRun >= 2;
      var longInterludeActive = !!brk && !brk.isIntro && !barOnsets[currentBlock.bar];
      var instance = info.run.instance;
      var energy = (energyOf[role] || 0.9) * (1 + Math.min(0.06, instance * 0.03));
      var inBlock = harmonies.filter(function (h) { return h.block === blockIndex; });
      var finalBar = blockIndex === lastBlock;
      // 末小节：在最后一个唱音（或小节头）落一个收尾和弦，之后只留长音
      var endGrid = triple ? unit : 0.5;
      var endPos = finalBar ? Math.max(0, Math.min(4, (lastNote.start >= bt ? Math.round((lastNote.start - bt) / endGrid) * endGrid : 0))) : 4;
      var odd = info.inRun % 2 === 1;
      function patternOf(table, part) {
        if (triple) return waltzPattern(part);
        var effRole = (longLeadActive && (part === 'bass' || part === 'comp')) ? 'verse' : role;
        var list = sectionList(table, effRole);
        var pat = ST.sequence && list && list.length > 1 && (part === 'bass' || part === 'comp') ? list[sequenceFamily] : choose(part + ':' + effRole, list, instance);
        if (ST.id === 'enka' && list && list.length === 2 && (part === 'bass' || part === 'comp')) pat = list[odd ? 1 : 0];
        if (ST.sequence) {
          // Bridge breaks down first; the pre-chorus restores the sequence gradually.
          if (roles[blockIndex] === 'bridge' && (part === 'bass' || part === 'comp')) pat = 'half';
          if (part === 'arp') {
            if (roles[blockIndex] === 'bridge' || role === 'verse' && info.inRun % 4 < 2 ||
              role === 'pre' && info.inRun < Math.max(0, info.run.bars - 2)) return null;
            if (pat === 'seqMotif16' && ((sequenceTempo ? sequenceTempo.bpmAt(bt) : bpm) >= 165 || density < 0.85)) pat = 'seqMotif8';
          }
          var vocabulary = part === 'bass' ? BASS : part === 'comp' ? COMP : ARP;
          var paired = vocabulary[pat];
          if (paired && paired.even) return odd ? paired.odd : paired.even;
        }
        if (ST.id === 'ballad') {
          if (part === 'comp' && roles[blockIndex] === 'bridge') pat = 'balladPickSlow';
          if (part === 'comp' && (pat === 'balladPick' || pat === 'balladPickFlow') && ((balladTempo ? balladTempo.bpmAt(bt) : bpm) >= 150 || density < 0.7)) pat = 'balladPickSlow';
          if (part === 'arp' && (roles[blockIndex] === 'bridge' || role === 'verse' && info.inRun % 4 < 2 ||
            role === 'pre' && info.inRun < Math.max(0, info.run.bars - 2) || role === 'chorus' && !odd || density < 0.7)) return null;
          var balladVocabulary = part === 'bass' ? BASS : part === 'comp' ? ARP[pat] ? ARP : COMP : ARP;
          var balladPair = balladVocabulary[pat];
          if (balladPair && balladPair.even) return odd ? balladPair.odd : balladPair.even;
        }
        var vocab = part === 'arp' ? ARP : part === 'comp' ? (table && table.arpMode && ARP[pat] ? ARP : COMP) : BASS;
        var resolved = typeof pat === 'string' && vocab[pat] ? vocab[pat] : pat;
        if (resolved && resolved.even) return odd ? resolved.odd : resolved.even;
        return pat;
      }
      // Three-beat bars: one shared waltz vocabulary, coloured by each style's instruments.
      function waltzPattern(part) {
        var chorus = role === 'chorus', calm = role === 'intro' || role === 'lead' || role === 'outro';
        var name;
        if (part === 'bass') name = calm ? 'hold' : chorus ? choose('w-bass', ['walk', 'alt'], instance) : 'alt';
        else if (part === 'left') name = calm ? 'hold' : chorus ? 'octave' : 'broken';
        else if (part === 'comp') {
          if (calm) return WALTZ.comp.hold;
          if (ST.comp.arpMode) return chorus ? WALTZ.arp.broken6 : WALTZ.arp.up6;
          name = ST.comp.inst === 'guitar' ? 'strum' : ST.comp.inst === 'piano' && chorus ? 'blocks' : 'oompah';
        } else if (part === 'arp') return chorus || role === 'pre' ? WALTZ.arp[choose('w-arp', ['up6', 'sparkle'], instance)] : null;
        else return null;
        var pat = WALTZ[part === 'left' ? 'left' : part][name];
        if (pat && pat.even) pat = odd ? pat.odd : pat.even;
        return pat;
      }
      function legato(events, k) {
        var e = events[k]; if (e[1] > 0) return e[1];
        for (var n = k + 1; n < events.length; n++) if (events[n][0] > e[0] + 1e-6) return events[n][0] - e[0] - 0.05;
        return 4 - e[0] - 0.02;
      }
      function trimToEnding(events) { return events.filter(function (e) { return e[0] < endPos - 1e-6; }); }

      /* --- 低音 --- */
      currentPart = 'bass';
      var bassSpec = ST.bass, bassName = patternOf(bassSpec, 'bass');
      if (bassName === 'oompah') bassName = bpm < 125 ? 'oompah8' : 'oompah4';
      if (bassName) {
        var bassRaw = typeof bassName === 'string' ? BASS[bassName] : bassName;
        if (bassRaw && bassRaw.even) bassRaw = odd ? bassRaw.odd : bassRaw.even;
        var bassEvents = trimToEnding(bassRaw.slice());
        // 和弦在小节中间换了，低音必须跟着换
        inBlock.forEach(function (h) {
          var pos = h.start - bt;
          if (pos > 1e-6 && !bassEvents.some(function (e) { return e[0] >= pos - 0.01 && e[0] < pos + 0.6; })) bassEvents.push([pos, 0, 'R', 0.9]);
        });
        if (finalBar) bassEvents.push([endPos, 4 - endPos, 'R', 1]);
        bassEvents.sort(function (a, b) { return a[0] - b[0]; });
        bassEvents.forEach(function (e, k) {
          if (!keep(e[0])) return;
          var t = bt + swung(e[0]), dur = legato(bassEvents, k);
          strike(t, dur, 100 * e[3] * energy * (bassSpec.vel || 1), bassSpec.inst, function (h) { return [inRange(bassTone(h, e[2]), 28, ST.sequence ? 60 : 55)]; });
        });
      }
      /* --- 钢琴左手 --- */
      currentPart = 'left';
      if (ST.left) {
        var leftName = patternOf(ST.left, 'left');
        if (leftName) {
          var leftEvents = trimToEnding((typeof leftName === 'string' ? BASS[leftName] : leftName).slice());
          if (finalBar) leftEvents.push([endPos, 4 - endPos, 'R', 1], [endPos, 4 - endPos, '5', 0.7]);
          leftEvents.forEach(function (e, k) {
            if (!keep(e[0])) return;
            strike(bt + swung(e[0]), legato(leftEvents, k), 66 * e[3] * energy, ST.left.inst, function (h) { return [inRange(bassTone(h, e[2]), 36, 60)]; });
          });
        }
      }

      /* --- 铺底 --- */
      currentPart = 'pad';
      var padLevel = ST.pad[role] !== undefined ? ST.pad[role] : ST.pad.verse || 0;
      if (padLevel > 0) {
        var padInst = ST.padInst || 'pad', padVel = 62 * padLevel * energy;
        if (!triple && (ST.padPattern === 'pump' && role !== 'intro' && role !== 'lead' ||
          ST.padPattern === 'sequence' && role === 'chorus' && chipMode) && !finalBar) {
          COMP.pump.forEach(function (e) { strike(bt + e[0], e[1], padVel * e[2], padInst, function (h) { return h.voicing; }); });
        } else {
          inBlock.forEach(function (h) {
            var s = Math.max(h.start, currentBlock.start), e = Math.min(h.end, currentBlock.end);
            if (e - s > 0.05) strike(s, e - s, padVel, padInst, function (hh) {
              // 留两条内声部，给流动指弹和弦乐的上声部让出空间。
              return ST.id === 'ballad' ? hh.voicing.slice(0, 2) : hh.voicing;
            });
          });
        }
      }

      /* --- 和弦乐器 --- */
      currentPart = 'comp';
      var comp = ST.comp, compInst = role === 'chorus' && comp.chorusInst ? comp.chorusInst : comp.inst;
      var compPat = patternOf(comp, 'comp');
      if (compPat === 'oompah') compPat = bpm < 125 ? 'oompah8' : 'oompah4';
      var arpLike, compEvents;
      if (triple) { compEvents = compPat; arpLike = !!(compPat && comp.arpMode && compPat !== WALTZ.comp.hold); }
      else { arpLike = compPat && comp.arpMode && (ARP[compPat] || ST.id === 'ballad' && Array.isArray(compPat) && role !== 'chorus'); compEvents = Array.isArray(compPat) ? compPat : compPat ? (arpLike ? ARP[compPat] : COMP[compPat]) : null; }
      if (compPat && !arpLike && compEvents && compEvents.even) compEvents = odd ? compEvents.odd : compEvents.even;
      if (compEvents) {
        compEvents = trimToEnding(compEvents.slice());
        // 副歌/预副歌：主唱在反拍上起的长音，伴奏跟着一起「推」过去
        if (!triple && !ST.sequence && ST.id !== 'enka' && ST.id !== 'ballad' && !arpLike && (role === 'chorus' || role === 'pre')) {
          mel.forEach(function (n) {
            var pos = n.start - bt, frac = pos - Math.floor(pos);
            if (pos < 0 || pos >= endPos || n.dur < 0.9 || (Math.abs(frac - 0.5) > 0.01 && Math.abs(frac - 0.75) > 0.01)) return;
            if (compEvents.some(function (e) { return Math.abs(e[0] - pos) < 0.3; })) return;
            if (rnd() < 0.6) compEvents.push([pos, Math.min(n.dur, 1.5), 0.95, compInst === 'guitar' ? 'D' : 'full', true]);
          });
          compEvents.sort(function (a, b) { return a[0] - b[0]; });
        }
        var compBase = (comp.vel || 58) * energy;
        compEvents.forEach(function (e, k) {
          if (!keep(e[0])) return;
          var t = bt + swung(e[0]), dur = legato(compEvents, k);
          var vel = compBase * (arpLike ? e[3] : e[2]) * (vocalOnset(t) ? 0.92 : vocalAt(t) ? 1 : 1.06);
          if (arpLike) {
            strike(t, dur, vel, compInst, function (h) {
              var ext = (compInst === 'guitar' ? h.guitar : h.voicing).concat(h.voicing.map(function (p) { return p + 12; }));
              ext = ext.filter(function (p, i2, a) { return a.indexOf(p) === i2; }).sort(function (a, b) { return a - b; });
              return [ext[e[2] % ext.length]];
            });
            return;
          }
          var part = e[3];
          strike(t, dur, vel, compInst, function (h) {
            if (part === 'power') return compInst === 'guitar' ? h.power : h.voicing;
            // Dense open-string thirds muddy a distorted rhythm guitar. Keep
            // its power voicing even when the groove uses a full down/up strum.
            var patch = instrumentFor('comp', roles[blockIndex], compInst);
            if ((patch === 'guitarDistortion' || patch === 'guitarOverdrive') && part !== 'top') return h.power;
            if (compInst === 'guitar') return part === 'U' ? h.guitar.slice(-3).reverse() : part === 'top' ? h.voicing : h.guitar;
            return part === 'top' ? h.voicing.slice(-3) : h.voicing;
          }, compInst === 'guitar' ? (part === 'U' ? 0.01 : part === 'top' ? 0.006 : 0.014) : ST.id === 'ballad' ? 0.024 : 0.003);
        });
      }
      if (finalBar) {
        var endAt = Math.max(currentBlock.start, bt + endPos);
        [endAt].concat(inBlock.filter(function (h) { return h.start > endAt + 1e-6; }).map(function (h) { return h.start; })).forEach(function (at) {
          if (at < currentBlock.end - 0.05) strike(at, currentBlock.end - at, (comp.vel || 58) * 1.05, compInst,
            function (hh) { return compInst === 'guitar' ? hh.guitar : hh.voicing; }, compInst === 'guitar' ? 0.02 : 0.004);
        });
      }

      /* --- 第二层分解（琶音/点缀） --- */
      currentPart = 'arp';
      var arpSpec = ST.arp, arpTable = arpSpec ? Object.assign({}, arpSpec) : null;
      if (arpTable && density >= 1.3 && !arpTable.verse) arpTable.verse = arpTable.chorus;
      if (arpTable && (longLeadActive || longInterludeActive) && density >= 0.7 && Math.floor(info.inRun / 2) % 2 === 1) {
        if (!arpTable.verse) arpTable.verse = arpTable.pre || arpTable.chorus;
        if (longLeadActive && !arpTable.lead) arpTable.lead = arpTable.verse || arpTable.pre || arpTable.chorus;
      }
      if (arpTable && density < 0.6) arpTable.verse = arpTable.pre = null;
      var arpName = arpTable && !finalBar ? patternOf(arpTable, 'arp') : null;
      if (arpName) {
        var arpRaw = typeof arpName === 'string' ? ARP[arpName] : arpName;
        if (arpRaw && arpRaw.even) arpRaw = odd ? arpRaw.odd : arpRaw.even;
        trimToEnding(arpRaw).forEach(function (e) {
          if (!keep(e[0])) return;
          var t = bt + swung(e[0]);
          // 分解声部放在主唱上方；主唱太高时退到主唱下方
          strike(t, e[1], arpSpec.vel * e[3] * energy * (vocalAt(t) ? 0.85 : 1), arpSpec.inst, function (h) {
            var up = h.voicing.map(function (p) { return p + 12; }).concat(h.voicing.map(function (p) { return p + 24; }));
            if (up[0] < h.vHigh + 1 && up[up.length - 1] > 91) up = h.voicing.concat(h.voicing.map(function (p) { return p + 12; }));
            if (ST.sequence && !triple) {
              // Use a compact chord register, lowered beneath high vocals.
              up = h.voicing.map(function (p) { return p + (h.vHigh >= 79 ? 0 : 12); });
              if (up.length < 4) up.push(up[0] + 12);
            }
            return [up[e[2] % up.length]];
          });
        });
      }

      /* --- 弦乐：大提琴根音 + 中声部；副歌里音区允许时再加一条高八度 --- */
      currentPart = 'strings';
      var strLevel = ST.strings[role] !== undefined ? ST.strings[role] :
        role === 'outro' ? (ST.strings.intro || (ST.strings.verse ? ST.strings.verse * 0.85 : ST.strings.chorus ? ST.strings.chorus * 0.45 : 0)) :
        (!ST.sequence && density >= 1.45 && role === 'verse' ? 0.25 : 0);
      if ((longLeadActive || longInterludeActive) && strLevel === 0 && !ST.sequence && density >= 0.8 && Math.floor(info.inRun / 2) % 2 === 1) {
        strLevel = ST.strings.pre ? ST.strings.pre * 0.75 : (ST.strings.chorus ? ST.strings.chorus * 0.45 : 0);
      }
      if (ST.id === 'ballad' && (roles[blockIndex] === 'bridge' || role === 'verse' && info.inRun % 4 < 2)) strLevel = 0;
      if (strLevel > 0 && ST.id === 'enka' && !triple && role === 'chorus' && odd && !finalBar) {
        // 和持续弦乐交替的短弓反拍，不把每一小节都铺成同一块长和弦。
        [0.5, 1.5, 2.5, 3.5].forEach(function (pos) {
          strike(bt + pos, 0.48, 43 * strLevel * energy, 'strings', function (h) { return h.voicing.slice(-2); });
        });
      } else if (strLevel > 0 && !triple && instrumentFor('strings', roles[blockIndex], 'strings') === 'pizzicato' && !finalBar) {
        [0, 1.5, 2.5, 3.5].forEach(function (pos, pi) {
          if (!keep(pos)) return;
          strike(bt + pos, 0.42, (pi === 0 ? 52 : 44) * strLevel * energy, 'strings', function (hh) {
            return (pi === 0 && !hh.clashBass ? [inRange(hh.bassPitch + 12, 43, 55)] : []).concat(hh.voicing.slice(-2));
          });
        });
      } else if (strLevel > 0) {
        inBlock.forEach(function (h) {
          var s = Math.max(h.start, currentBlock.start), e = Math.min(h.end, currentBlock.end);
          if (e - s <= 0.05) return;
          strike(s, e - s, 50 * strLevel * energy, 'strings', function (hh) {
            if (ST.id === 'ballad') {
              // 与铺底分工：弦乐接上声部，不再叠一组低根音和完整三和弦；复现副歌允许拉高一条旋律托举线。
              var upper = hh.voicing.slice(2);
              var baseList = upper.length ? upper : hh.voicing.slice(-1).map(function (p) { return p + 12; });
              if (role === 'chorus' && instance >= 1) {
                var hiStr = hh.voicing[hh.voicing.length - 1] + 12;
                if (hiStr <= 88 && baseList.indexOf(hiStr) < 0) {
                  var clash = allMel.some(function (v) {
                    var ov = Math.min(e, v.start + v.dur) - Math.max(s, v.start);
                    var iv = pitchClass(hiStr - v.pitch);
                    return ov >= 0.4 && (iv === 1 || iv === 11);
                  });
                  if (!clash) baseList = baseList.concat([hiStr]);
                }
              }
              return baseList;
            }
            var v = (hh.clashBass ? [] : [inRange(hh.bassPitch + 12, 43, 55)]).concat(hh.voicing.slice(-2));
            var top = hh.voicing[hh.voicing.length - 1] + 12;
            if (role === 'chorus' && top >= hh.vHigh + 3 && top <= 88) v.push(top);
            return v;
          });
        });
      }

      /* --- 铜管：只在主唱留白的地方吹 --- */
      currentPart = 'brass';
      if (ST.brass && !finalBar && !triple) {
        var brassPat = patternOf(ST.brass, 'brass');
        if (brassPat && (info.inRun % 2 === 1 || rnd() < 0.4)) brassPat.forEach(function (e) {
          var t = bt + swung(e[0]);
          if (vocalAt(t) || vocalAt(t + e[1])) return;
          strike(t, e[1], ST.brass.vel * energy, ST.brass.inst, function (h) { return h.voicing.slice(-3).map(function (p) { return p + 12; }); }, 0.004);
        });
      }

      /* --- 鼓组 --- */
      if (opt.kit !== false && role !== 'intro' && (role !== 'outro' || finalBar)) drumBlock(role, info, bt, finalBar, endPos);
    }

    // Waltz kit: kick on one, snare/cross-stick on two and three; chorus opens the hats up.
    function waltzGroove(role, soft, info) {
      var two = unit, three = 2 * unit, chorus = role === 'chorus';
      if (role === 'lead') return { kick: [[0, 0.75]], hat: soft ? null : 'w4' };
      var back = [[two, chorus ? 0.72 : 0.62], [three, chorus ? 0.66 : 0.56]];
      var g = { kick: [[0, chorus ? 1 : 0.9]], hat: chorus ? (soft ? 'ride4' : 'w8') : soft ? null : 'w4' };
      if (soft && !chorus) g.rim = back; else g.snare = back;
      if (ST.kit === 'folk') g.shaker = true;
      if (Math.floor(info.inRun / 2) % 2) {
        if (!soft) g.kick.push([three + unit / 2, chorus ? 0.65 : 0.5]);
        if (soft && !chorus) g.hat = 'ride4';
        else if (ST.kit === 'taiko' || ST.kit === 'dream') g.tom = [[three, 0.55]];
        else g.hat = chorus ? 'ride4' : 'w8';
      }
      return g;
    }
    function drumBlock(role, info, bt, finalBar, endPos) {
      if (ST.id === 'ballad' && role === 'verse' && info.run.instance === 0 && info.inRun < 2 && totalBars > 6 && !finalBar) return;
      if (role === 'lead' && info.run.bars >= 6 && info.inRun === 0 && blocks[0].end - blocks[0].start < 2 && !finalBar) return;
      var kitName = ST.kit === 'polka' && bpm >= 125 ? 'polkaHalf' : ST.kit, kit = GROOVE[kitName] || GROOVE.pop;
      var soft = kitName === 'soft' || kitName === 'piano' || kitName === 'bossa' || kitName === 'enka';
      var grooveRole = (role === 'lead' && info.run.bars >= 6 && info.inRun >= 2) ? 'verse' : role;
      var grooveList = kit[grooveRole] || (grooveRole === 'pre' ? kit.verse : grooveRole === 'lead' ? kit.lead : kit.verse);
      var baseGroove = Math.floor(hashed('groove:' + grooveRole + ':' + mood.id) * grooveList.length);
      var cycle = Math.floor(info.inRun / 2);
      // ABBA over eight bars; later returns can start on the neighbouring variant.
      var variation = cycle % 4 === 1 || cycle % 4 === 2 ? 1 : 0;
      var groove = triple ? waltzGroove(grooveRole, soft, info) :
        grooveList[(baseGroove + variation + (info.run.instance % 2)) % grooveList.length];
      if (ST.id === 'ballad' && !triple && role === 'chorus' && chorusRunCount >= 2 && info.run.instance === 0 && GROOVE.soft.chorusRestrained) {
        groove = GROOVE.soft.chorusRestrained;
      }
      var first = info.inRun === 0 && Math.abs(currentBlock.start - bt) < 1e-6;
      var prevInfo = barInfo[currentBlock.bar - 1];
      var crash = !soft && !finalBar && first && (role === 'chorus' || (prevInfo && ((prevInfo.role === 'lead' || (prevInfo.role === 'intro' && role !== 'lead')) || fillsPlaced[currentBlock.bar - 1])));
      if (!soft && !finalBar && role === 'lead' && info.run.bars >= 6 && info.inRun === 2 && Math.abs(currentBlock.start - bt) < 1e-6) crash = true;
      if (ST.id === 'ballad' && !finalBar && first && role === 'chorus' && info.run.instance >= 1 && crashesPlaced < 3) crash = true;
      if (crash) crashesPlaced++;
      if (finalBar) {
        // 收尾：在最后一个唱音（或尾奏终小节首拍）落一记底鼓 + 吊镲，之前照常
        drum(bt + endPos, 0.3, 'kick', 36, role === 'outro' ? 92 : 108);
        drum(bt + endPos, 2, soft ? 'ride' : 'crash', soft ? 51 : 49, soft ? (role === 'outro' ? 56 : 60) : (role === 'outro' ? 82 : 92));
      }
      /* 过门：段落交接处必打；段内每 4 小节随机一次；主唱句间有空档时补一个小过门 */
      var fill = null;
      if (!finalBar && info.last && info.nextRole && info.nextRole !== 'outro') {
        var into = info.nextRole === 'chorus';
        var names = soft ? (ST.id === 'ballad' && into ? ['balladSwell'] : ST.id === 'ballad' ? ['balladTom', 'soft'] : ['soft', 'pickup']) :
          kitName === 'city' ? ['funk16', 'cityTom', 'mixed'] :
            into ? ['half', 'tomDown', 'rockCrashFill', 'mixed'] : ['tomDown', 'snare16', 'cityTom', 'mixed'];
        if (ST.sequence && !triple) names = into && role === 'pre' ? ['seqRoll', 'seqSardineFill'] : ['seqPickup', 'seqSardineFill'];
        fill = names[Math.floor(rnd() * names.length)];
      } else if (!finalBar && info.inRun % 4 === 3 && rnd() < 0.35 * density) {
        fill = ST.sequence && !triple ? 'seqPickup' : soft ? 'pickup' : ['pickup', 'snare16'][Math.floor(rnd() * 2)];
      } else if (!finalBar && role !== 'lead') {
        var gapEnd = null, longReentry = false;
        if (multi) {
          var dSpans = ensemble.allVocalSpans;
          for (var gi = 1; gi < dSpans.length; gi++) {
            var prevEnd = dSpans[gi - 1][1], nextStart = dSpans[gi][0];
            if (nextStart - prevEnd >= 1.5 && nextStart > bt + 3.4 && nextStart <= bt + 4 + 1e-6) gapEnd = nextStart;
            else if (nextStart - prevEnd >= 20 * unit && !vocalAt(bt) && nextStart >= bt + 2.5 && nextStart <= bt + 4 + 1e-6) {
              gapEnd = nextStart; longReentry = true;
            }
          }
        } else {
          for (var gi2 = 1; gi2 < mel.length; gi2++) {
            var prevEnd2 = mel[gi2 - 1].start + mel[gi2 - 1].dur;
            if (mel[gi2].start - prevEnd2 >= 1.5 && mel[gi2].start > bt + 3.4 && mel[gi2].start <= bt + 4 + 1e-6) gapEnd = mel[gi2].start;
            else if (mel[gi2].start - prevEnd2 >= 20 * unit && !vocalAt(bt) && mel[gi2].start >= bt + 2.5 && mel[gi2].start <= bt + 4 + 1e-6) {
              gapEnd = mel[gi2].start; longReentry = true;
            }
          }
        }
        if (gapEnd !== null && (longReentry || rnd() < 0.45 * density)) fill = ST.sequence && !triple ? 'seqPickup' : 'pickup';
      }
      var fillEvents = fill ? (triple ? WALTZ_FILLS[soft ? 'soft' : fill === 'pickup' ? 'pickup' : 'toms'] : FILLS[fill]) : [], fillStart = fillEvents.length ? fillEvents[0][0] : 4;
      if (fill) fillsPlaced[currentBlock.bar] = true;
      var limit = Math.min(fillStart, finalBar ? endPos : 4), vs = soft ? 0.8 : 1;
      function hits(list, inst, pitch, base) {
        (list || []).forEach(function (e) {
          if (e[0] >= limit - 1e-6 || (e[2] !== undefined && rnd() >= e[2] * Math.min(1.3, density))) return;
          drum(bt + swung(e[0]), 0.3, inst, pitch, base * e[1] * vs);
        });
      }
      hits(groove.kick, 'kick', 36, 112);
      hits(groove.snare, 'snare', 38, 104);
      hits(groove.clap, 'clap', 39, 84);
      hits(groove.rim, 'rim', 37, 78);
      hits(info.inRun % 2 ? groove.rimOdd : groove.rimEven, 'rim', 37, 78);
      hits(groove.tom, 'tom', 45, 90);
      (groove.perc || []).forEach(function (e) {
        if (e[0] >= limit - 1e-6 || (e[2] !== undefined && rnd() >= e[2] * Math.min(1.3, density))) return;
        var percPitch = (kitName === 'pop' || kitName === 'city' || kitName === 'edm' || kitName === 'soft') && (e[0] === 1.5 || e[0] === 3.5) ? 54 : 70;
        drum(bt + swung(e[0]), 0.3, 'perc', percPitch, 60 * e[1] * vs);
      });
      if (groove.build && !triple && (!ST.sequence || info.run.nextRole === 'chorus' && info.run.bars - info.inRun <= 2)) {
        // 只在临近副歌的最后两小节抬升，保留前面的稳定循环。
        var progress = (info.inRun + 1) / Math.max(1, info.run.bars), step = progress > 0.75 ? 0.25 : progress > 0.4 ? 0.5 : 1;
        for (var b = 0; b < limit - 1e-6; b += step) drum(bt + b, 0.2, 'snare', 38, ST.sequence ? 32 + 28 * progress + 8 * b / 4 : 40 + 60 * Math.min(1, progress * 0.7 + b / 16));
      }
      if (groove.ghost && !triple) [0.75, 1.75, 2.25, 3.75].forEach(function (p) {
        if (p < limit && rnd() < groove.ghost * density) drum(bt + p, 0.12, 'snare', 38, 26);
      });
      var hat = groove.hat;
      if (density < 0.7) hat = { '16': '8', '16open': '8', '16soft': '8soft', '8': '4', '8open': '4', off16: 'off', skipOff: 'off', ride8: 'ride4' }[hat] || hat;
      else if (density > 1.3) hat = { '8': '16', '4': '8', '8soft': '16soft' }[hat] || hat;
      var hatStep = triple ? (hat === 'w8' ? unit / 2 : hat === 'w4' || hat === 'ride4' ? unit : 0) : { '4': 1, '4soft': 1, '4open': 1, '8': 0.5, '8soft': 0.5, '8open': 0.5, '8brush': 0.5, '16': 0.25, '16open': 0.25, '16soft': 0.25,
        off: 0.5, off16: 0.25, skipOff: 0.125, ride4: 1, ride8: 0.5, ride8soft: 0.5 }[hat];
      if (hatStep) for (var h = 0; h < limit - 1e-6; h += hatStep) {
        if (crash && h < 1e-6) continue;
        var frac = h / unit - Math.floor(h / unit + 1e-6), onBeat = frac < 1e-3, off = Math.abs(frac - 0.5) < 1e-3;
        var level = hat.indexOf('soft') >= 0 || hat === '8brush' ? 0.6 : 1;
        if (hat === 'skipOff') {
          var step8 = Math.round(frac * 8) % 8;
          if (step8 === 4) drum(bt + h, 0.35, 'openhat', 46, 56);
          else if (step8 === 0 || step8 === 7) drum(bt + h, 0.12, 'hat', 42, step8 === 0 ? 36 : 28);
        } else if (hat === 'off' || hat === 'off16') {
          if (off) drum(bt + h, 0.35, 'openhat', 46, 54);
          else if (hat === 'off16') drum(bt + h, 0.12, 'hat', 42, 30);
        } else if (hat === '4open') {
          drum(bt + h, 0.3, 'openhat', 46, 46);
        } else if (hat.indexOf('ride') === 0) {
          drum(bt + swung(h), 0.5, 'ride', 51, (onBeat ? 56 : 42) * level);
        } else if ((hat === '8open' && Math.abs(h % 2 - 1.5) < 1e-6) || (hat === '16open' && Math.abs(h - 3.5) < 1e-6)) {
          drum(bt + swung(h), 0.3, 'openhat', 46, 54);
        } else {
          drum(bt + swung(h), 0.14, 'hat', 42, (onBeat ? 60 : off ? 44 : 32) * level);
        }
      }
      var shakerStep = (ST.id === 'folk' && ((role === 'lead' && info.inRun < 2) || (role === 'verse' && info.run.instance === 0 && info.inRun < 2 && totalBars > 6))) ? unit / 2 : unit / 4;
      if (groove.shaker) for (var s = 0; s < limit - 1e-6; s += shakerStep) drum(bt + swung(s), 0.1, 'perc', 70, s % 0.5 ? 18 : 28);
      if (crash) drum(bt, 0.5, 'crash', 49, 90);
      fillEvents.forEach(function (e) { drum(bt + e[0], 0.22, e[1], e[2], (e[1] === 'kick' ? 100 : 104) * e[3] * vs); });
    }

    /* --- 句间华彩应和：演歌使用四七抜き音阶下行，抒情/流行等采用全曲统一动机轮廓（严格取和弦音） --- */
    if (ST.fill) {
      var isEnkaFill = ST.id === 'enka';
      var fillRnd = NSG.mulberry32((seed ^ (isEnkaFill ? 0x656e6b61 : 0x66696c6c)) >>> 0), fillEnd = mel[0].start;
      var yona = function (h) { return (h.minor ? [0, 2, 3, 7, 8] : [0, 2, 4, 7, 9]).map(function (d) { return (d + h.key) % 12; }); };
      var motifChoices = [[0, 1, 2, 1], [2, 1, 0, 1], [0, 2, 1, 0], [1, 2, 3, 2]];
      var songMotif = motifChoices[Math.floor(hashed('motif:' + ST.id) * motifChoices.length)];
      var lastBarStart = blocks[lastBlock].start;
      function emitGapFill(gapStart, gapEnd, k, allowRandomSkip) {
        if (gapEnd - gapStart < 1.5 * unit || gapStart >= lastBarStart) return;
        if (!isEnkaFill && allowRandomSkip && gapEnd - gapStart < 3 * unit && fillRnd() > 0.72) return;
        var isEdmSweep = ST.id === 'edm' && !triple && gapEnd - gapStart >= 2.25 * unit && fillRnd() < 0.65;
        var step = isEdmSweep ? unit / 4 : unit / 2, from = Math.ceil((gapStart + 0.15) / step - 1e-6) * step;
        var to = Math.min(gapEnd - (isEnkaFill ? 0.2 : isEdmSweep ? 0.12 : 0.25), from + (isEnkaFill || isEdmSweep ? 8 : 6) * step);
        var count = Math.floor((to - from) / step + 1e-6);
        if (count < 3) return;
        if (!isEnkaFill && !isEdmSweep) count = Math.min(4, count);
        var fillInst = ST.fill.alternate && gapEnd - gapStart >= 4 * unit && hashed('fill-answer:' + ST.id + ':' + k) < 0.5 ? ST.fill.alternate : ST.fill.inst;
        var fillRange = instrumentRange(fillInst, 57, 84);
        var useMotif = !isEnkaFill && !isEdmSweep;
        var prev = null, turned = false, ascend = isEdmSweep || (!isEnkaFill && k % 2 === 0);
        var blockIdx = Math.max(0, blocks.findIndex(function (b) { return b.end > from; }));
        var vel = ST.fill.vel * (roles[blockIdx] === 'chorus' ? 1.05 : 0.95);
        for (var j = 0; j < count; j++) {
          var at = from + j * step, h = harmonyAt(at), last = j === count - 1;
          var strong = Math.abs(at / unit - Math.round(at / unit)) < 1e-6 || last;
          var pool = isEnkaFill && !strong ? yona(h).concat(h.tones) : h.tones;
          var pick = null;
          if (useMotif) {
            var ladder = [], floorF = Math.max(57, fillRange[0]);
            for (var lp = floorF; lp <= fillRange[1]; lp++) if (h.tones.indexOf(pitchClass(lp)) >= 0) ladder.push(lp);
            if (ladder.length) {
              var targetMid = Math.min(fillRange[1] - 3, Math.max(floorF, h.vHigh + (k % 2 ? -2 : 1)));
              var anchorIdx = 0, bestDist = Infinity;
              for (var li = 0; li < ladder.length; li++) {
                var ld = Math.abs(ladder[li] - targetMid);
                if (ld < bestDist) { bestDist = ld; anchorIdx = li; }
              }
              var mStep = songMotif[j % songMotif.length];
              if (k % 2 === 1) mStep = 2 - mStep;
              var pickIdx = Math.max(0, Math.min(ladder.length - 1, anchorIdx + mStep - 1));
              pick = ladder[pickIdx];
            }
          } else if (prev === null) {
            if (ascend) {
              var startFloor = isEdmSweep ? Math.max(fillRange[0], 57) : Math.max(fillRange[0], Math.min(72, h.vHigh - 5));
              for (var pa = startFloor; pa <= fillRange[1] && pick === null; pa++) if (h.tones.indexOf(pitchClass(pa)) >= 0) pick = pa;
            } else {
              for (var p0 = Math.min(84, Math.max(67, h.vHigh + 3)); p0 >= 60 && pick === null; p0--) if (h.tones.indexOf(pitchClass(p0)) >= 0) pick = p0;
            }
          } else {
            var up = isEdmSweep ? true : isEnkaFill ? (!turned && !last && j >= 2 && fillRnd() < 0.25) : (ascend ? !last || j < 2 : (!turned && !last && j >= 1 && fillRnd() < 0.35));
            if ((isEnkaFill && up) || (!isEnkaFill && ascend && !up)) turned = true;
            for (var d = 1; d <= 5 && pick === null; d++) {
              var cand = prev + (up ? d : -d);
              if (cand >= Math.max(57, fillRange[0]) && cand <= fillRange[1] && pool.indexOf(pitchClass(cand)) >= 0) pick = cand;
            }
            if (pick === null) for (var d2 = 1; d2 <= 5 && pick === null; d2++) if (pool.indexOf(pitchClass(prev + (up ? -d2 : d2))) >= 0) pick = prev + (up ? -d2 : d2);
          }
          if (pick === null) continue;
          var stop = Math.min(last ? Math.min(at + (isEdmSweep ? 0.5 : 1.5 * unit), gapEnd - 0.05) : at + step * 0.9, h.end);
          if (stop - at > 0.05) {
            var fn = { start: at, dur: stop - at, pitch: inRange(pick, fillRange[0], fillRange[1]), vel: velOf(vel * (strong ? 1 : 0.85), 5), inst: fillInst, harmonyEnd: h.end };
            if (isEnkaFill) fn.role = 'fill'; else fn.arrangePart = 'fill';
            out.push(fn);
          }
          prev = pick;
        }
      }
      if (multi) {
        var fSpans = ensemble.allVocalSpans;
        for (var fi = 1; fi < fSpans.length; fi++) emitGapFill(fSpans[fi - 1][1], fSpans[fi][0], fi, true);
      } else {
        mel.forEach(function (n, k) {
          var gapStart = fillEnd, gapEnd = n.start;
          fillEnd = Math.max(fillEnd, n.start + n.dur);
          if (!k) return;
          emitGapFill(gapStart, gapEnd, k, true);
        });
      }
      var periodicSlot = mel.length;
      longBreaks.forEach(function (brk) {
        var t = analysis.grid.offset + Math.ceil((brk.start + 12 * unit - analysis.grid.offset) / (4 * unit) - 1e-6) * (4 * unit);
        for (; t + 16 * unit <= brk.end && t < lastBarStart; t += 16 * unit) {
          var overlapFill = out.some(function (n) {
            return (n.role === 'fill' || n.arrangePart === 'fill') && n.start < t + 6 * unit && n.start + n.dur > t - 2 * unit;
          });
          if (!overlapFill) emitGapFill(t, Math.min(t + 4 * unit, brk.end - 1.5 * unit), periodicSlot++, false);
        }
      });
    }

    /* 乐队的呼吸：独立于音型与随机数，0 可还原原来的演奏。
       先塑造段落/乐句，再按实际重叠的主唱音区让位。只改伴奏力度与声像，
       低音和底鼓保持中央；采样追奏保留自己的低力度与声像。 */
    var expressionPlan = [];
    if (expression > 0) {
      var melodyEnds = [], farthest = -Infinity;
      allMel.forEach(function (n) { farthest = Math.max(farthest, n.start + n.dur); melodyEnds.push(farthest); });
      function overlapVocals(start, end) {
        var lo = 0, hi = allMel.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (allMel[mid].start < end) lo = mid + 1; else hi = mid; }
        var found = [];
        for (var k = lo - 1; k >= 0 && melodyEnds[k] > start; k--) {
          if (allMel[k].start + allMel[k].dur > start) found.push(allMel[k]);
        }
        return found;
      }
      function phraseAt(t) {
        var lo = 0, hi = phrases.length - 1;
        while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (phrases[mid].start <= t) lo = mid; else hi = mid - 1; }
        var p = phrases[lo];
        return p && t >= p.start && t < p.end ? p : null;
      }
      expressionPlan = blocks.map(function (b, i) {
        var info = barInfo[b.bar], role = roles[i];
        var progress = info.run.bars > 1 ? info.inRun / (info.run.bars - 1) : 0.5;
        if (role === 'bridge') {
          var bridgePhrase = phraseAt(b.start + 1e-6);
          if (bridgePhrase) progress = Math.max(0, Math.min(1, (b.start - bridgePhrase.start) / Math.max(unit, bridgePhrase.end - bridgePhrase.start)));
        }
        var level = role === 'pre' || role === 'bridge' ? 0.82 + 0.26 * progress :
          role === 'chorus' ? 0.97 + 0.07 * progress + Math.min(0.06, info.run.instance * 0.03) :
            role === 'outro' ? 0.96 - 0.18 * progress :
              role === 'intro' || role === 'lead' ? 0.8 + 0.14 * progress : 0.86 + 0.12 * progress;
        // A returning verse begins a little fuller, while a returning chorus opens wider.
        if (role === 'verse') level += Math.min(0.04, info.run.instance * 0.02);
        return { start: b.start, end: b.end, section: role, level: level, instance: info.run.instance };
      });
      var stage = { bass: 0, bassFretless: 0, tuba: 0, synthAcid: 0, synthReese: 0, kick: 0, snare: 0, rim: 0, clap: 0,
        pad: -0.18, padWarmGlass: -0.2, choir: -0.16, choirSoft: -0.18, synthVelvet: -0.18, synthShimmer: 0.18, synthHollow: -0.15, synthSweep: 0.16,
        strings: 0.18, stringsSlow: 0.18, stringsCinema: 0.22, stringsCello: -0.16, erhuSynth: 0.14, pizzicato: 0.24,
        ep: -0.28, epReed: -0.26, epBell: -0.22, celesta: -0.2,
        guitar: 0.3, guitarClean: 0.28, guitarNylon: 0.26, guitarSteel12: 0.32, guitarChorus: 0.28, guitarOverdrive: 0.28,
        arp: -0.4, pluck: -0.32, harp: -0.26, marimba: 0.28, musicBox: -0.3, vibraphone: -0.22,
        flute: -0.18, ocarina: -0.14, clarinet: 0.18, organ: 0.2, brass: 0.16, synthBrass: 0.24, synthPWM: -0.2, synthFifth: 0.22,
        synthSoftLead: -0.15, synthUnison: 0.14, piano: 0, pianoWarm: 0.04, accordion: 0.2,
        hat: -0.35, openhat: -0.35, ride: 0.4, crash: -0.45, tom: 0.25, perc: 0.45 };
      out.forEach(function (n) {
        var h = harmonyAt(n.start), plan = expressionPlan[h.block], p = phraseAt(n.start);
        var foundation = n.arrangePart === 'bass' || n.inst === 'bass' || n.inst === 'bassFretless' || n.inst === 'tuba' || n.inst === 'kick';
        var percussion = /^(kick|snare|hat|openhat|crash|tom|perc|ride|rim|clap)$/.test(n.inst);
        var bed = n.arrangePart === 'pad' || n.arrangePart === 'strings' || n.inst === 'pad' || n.inst === 'padWarmGlass' || n.inst === 'choir' || n.inst === 'choirSoft' || n.inst === 'strings' || n.inst === 'stringsSlow' || n.inst === 'stringsCinema' || n.inst === 'stringsCello' || n.inst === 'organ';
        var layer = foundation ? 0.25 : percussion ? 0.45 : bed ? 1 : 0.75;
        var level = 1 + (plan.level - 1) * layer;
        if (p && !foundation) {
          var phase = (n.start - p.start) / Math.max(unit, p.end - p.start);
          // A phrase swells through its middle, then releases into the next breath.
          level *= 1 + (-0.06 + 0.1 * Math.sin(Math.PI * phase) - 0.04 * Math.max(0, (phase - 0.8) / 0.2)) * layer;
        }
        if (!percussion && !foundation && n.role !== 'fill' && n.arrangePart !== 'fill') {
          var end = n.start + n.dur, nearby = overlapVocals(n.start, end), pressure = 0;
          nearby.forEach(function (v) {
            var overlap = Math.min(end, v.start + v.dur) - Math.max(n.start, v.start);
            var distance = Math.abs(n.pitch - v.pitch), iv = pitchClass(n.pitch - v.pitch);
            var proximity = distance < 5 ? 1 : distance < 12 ? 0.65 : 0.2;
            if (iv === 1 || iv === 11) proximity = Math.max(proximity, 0.9);
            pressure += overlap / n.dur * proximity;
          });
          // New syllables need more space than a held vowel; inspect the whole local beat.
          var syllables = multi
            ? ensemble.allVocalOnsets.filter(function (t) { return t >= n.start - unit * 0.35 && t < n.start + unit * 0.65; }).length
            : overlapVocals(n.start - unit * 0.35, n.start + unit * 0.65)
                .filter(function (v) { return v.start >= n.start - unit * 0.35; }).length;
          level *= 1 - Math.min(0.3, Math.min(1, pressure) * (0.18 + 0.04 * Math.min(3, syllables)));
          if (multi && (bed || n.arrangePart === 'comp')) {
            var activeLayers = {};
            nearby.forEach(function (v) { activeLayers[v._trackIndex] = true; });
            if (Object.keys(activeLayers).length >= 2) level *= 0.94;
          }
          // Keep inner chord voices behind the top line instead of striking every voice equally.
          if (bed || n.arrangePart === 'comp' || n.arrangePart === 'left' || n.inst === 'ep' || n.inst === 'piano' || n.inst === 'pianoWarm' || n.inst === 'guitar' || n.inst === 'guitarSteel12' || n.inst === 'accordion') {
            var top = h.voicing[h.voicing.length - 1];
            if (n.pitch < top && n.pitch > h.bassPitch + 7) level *= 0.9;
          }
        }
        n.vel = Math.max(12, Math.min(127, Math.round(n.vel * Math.max(0.4, 1 + (level - 1) * expression))));
        if (!n.gainPoints && n.dur >= 1.5 && /^(strings|stringsSlow|stringsCinema|stringsCello|choir|choirSoft|padWarmGlass)$/.test(n.inst)) {
          var swellDepth = Math.min(1.5, expression);
          n.gainPoints = [
            [0, +(1 - 0.22 * swellDepth).toFixed(3)],
            [0.42, +(1 + 0.08 * swellDepth).toFixed(3)],
            [0.78, 1],
            [1, +(1 - 0.16 * swellDepth).toFixed(3)]
          ];
        }
        if (!Number.isFinite(n.pan)) {
          var patch = NSG.Instruments && NSG.Instruments.get(n.inst);
          var pan = foundation ? 0 : stage[n.inst] !== undefined ? stage[n.inst] : patch ? patch.pan || 0 : 0;
          if (!percussion && !foundation) {
            // Stable keyboard/string seating by pitch, never a randomly wandering source.
            var width = (plan.section === 'chorus' ? 0.34 : 0.24) * Math.min(1.5, expression);
            if (bed || n.arrangePart === 'comp' || n.arrangePart === 'left' || n.inst === 'piano' || n.inst === 'pianoWarm' || n.inst === 'ep' || n.inst === 'guitar' || n.inst === 'guitarSteel12') {
              pan += Math.max(-1, Math.min(1, (n.pitch - 64) / 18)) * width;
            }
          }
          n.pan = Math.max(-0.7, Math.min(0.7, pan));
        }
      });
    }

    // Optional melodic quotations use their own RNG, so enabling them preserves
    // the underlying arrangement. Two kinds:
    //   canon  — a whole sung phrase is imitated 1, 2 or 4 beats later by a quiet,
    //            panned accompaniment voice an octave away, like a round;
    //   answer — a short motif echoes the end of a phrase in an instrumental gap.
    // Notes are fitted one by one; a clash moves or drops that note, never the passage.
    var samples = [], leads = [];
    if (opt.sampleMelody && mel.length >= 3) {
      // Leave a full score beat and at least half a second before a vocal
      // entrance. The wrapper supplies real-time limits even on a warped grid.
      function entryLimit(beat) {
        return opt._vocalEntryLimit ? opt._vocalEntryLimit(beat) : beat - Math.max(unit, bpm / 120);
      }
      function exitLimit(beat) {
        return opt._vocalExitLimit ? opt._vocalExitLimit(beat) : beat + Math.max(unit, bpm / 120);
      }
      var sampleRnd = NSG.mulberry32((seed ^ 0x6d6f7469) >>> 0);
      var amount = opt.sampleAmount === undefined || !Number.isFinite(+opt.sampleAmount) ? 1 : Math.max(0.2, Math.min(2, +opt.sampleAmount));
      // 0 quotes source pitches/rhythm without harmonic rewriting; 0.5 keeps
      // the existing restrained endings, 1 allows a longer improvised answer.
      var improvisation = opt.improvisation === undefined || !Number.isFinite(+opt.improvisation) ? 0.5 : Math.max(0, Math.min(1, +opt.improvisation));
      var pureMelody = improvisation === 0, improvScale = improvisation * 2;
      var colors = { pop: ['ep', 'guitar'], ballad: ['ep', 'strings'], rock: ['guitar', 'organ'], edm: ['arp', 'ep'], folk: ['guitar', 'ep'],
        piano: ['piano', 'strings'], citypop: ['brass', 'ep'], guofeng: ['pluck', 'strings'], bossa: ['ep', 'guitar'], polka: ['accordion', 'brass'],
        synthpop: ['arp', 'pluck'], dreampop: ['pluck', 'strings'], chiptune: ['arp', 'pluck'], enka: ['pluck', 'strings'], da: ['piano', 'clarinet'] };
      var instruments = !chipMode && voicePlan.sample || colors[ST.id] || colors.pop;
      var vocalLine = allMel.slice().sort(function (a, b) { return a.start - b.start; });
      var sungAt = function (t) {
        var hit = null;
        for (var k = 0; k < vocalLine.length && vocalLine[k].start <= t; k++) if (vocalLine[k].start + vocalLine[k].dur > t) hit = vocalLine[k];
        return hit;
      };
      var scaleOf = function (h) { return (h.minor ? DEG_MIN : DEG_MAJ).map(function (d) { return (d + h.key) % 12; }); };
      // Emit one quoted source note between at and stop, split at chord changes.
      var place = function (src, at, stop, octave, fromKey, mode, info) {
        while (at < stop - 0.04) {
          var harmony = harmonyAt(at), until = Math.min(stop, harmony.end);
          var range = instrumentRange(info.inst, 48, mode === 'answer' ? 88 : 91), floor = range[0], ceiling = range[1];
          var target = Math.round(src.pitch + (pureMelody ? 0 : (harmony.key - fromKey + 18) % 12 - 6) + octave);
          while (target < floor) target += 12;
          while (target > ceiling) target -= 12;
          var beatPos = mod4(at - analysis.grid.offset) / unit, strong = Math.abs(beatPos - Math.round(beatPos)) < 0.02;
          var tones = strong || until - at >= 0.9 || info.last ? harmony.tones : scaleOf(harmony);
          var singing = mode === 'canon' ? allMel.filter(function (v) { return v.start < until && v.start + v.dur > at; }) : [];
          var usable = function (p) {
            return p >= floor && p <= ceiling && (pureMelody || tones.indexOf(pitchClass(p)) >= 0) && singing.every(function (v) {
              var interval = (pitchClass(p) - pitchClass(v.pitch) + 12) % 12;
              return interval !== 1 && interval !== 6 && interval !== 11 && Math.abs(p - v.pitch) >= 7;
            });
          };
          if (!usable(target)) {
            // Preserve a literal quote at zero; leave a rest if the singer
            // would clash instead of replacing the source pitch with a new one.
            if (pureMelody) { at = until; continue; }
            // Small moves keep the motif recognisable; prefer the direction the melody was heading.
            var fitted = null, dir = info.dir || 1;
            for (var distance = 1; distance <= 4 && fitted === null; distance++) {
              if (usable(target + distance * dir)) fitted = target + distance * dir;
              else if (usable(target - distance * dir)) fitted = target - distance * dir;
            }
            if (fitted === null) { at = until; continue; }
            target = fitted;
          }
          if (until - at > 0.04) {
            var noteVel = mode === 'answer' ? 58 + Math.floor(sampleRnd() * 10) : Math.min(44, 34 + Math.floor(sampleRnd() * 7) + (strong ? 3 : 0));
            var sampleNote = { start: at, dur: until - at, pitch: target, vel: noteVel, inst: info.inst, harmonyEnd: Math.min(harmony.end, info.limit),
              role: 'melodySample', sampleSource: src.start, sampleMode: mode };
            if (mode === 'canon') { sampleNote.pan = info.pan; sampleNote.sampleDelay = info.delay; }
            out.push(sampleNote);
            if (!info.first) info.first = { start: at, source: src.start };
            info.end = Math.max(info.end || 0, until); info.sources.add(src.start);
          }
          at = until;
        }
      };
      var quotePassage = function (notes, shift, octave, fromKey, mode, delay, limit) {
        var canons = samples.filter(function (s) { return s.mode === 'canon'; }).length;
        var info = { inst: instruments[samples.length % instruments.length], pan: canons % 2 ? -0.4 : 0.4,
          delay: delay, limit: limit, sources: new Set(), first: null }, mark = out.length;
        notes.forEach(function (n, k) {
          var at = n.start + shift, next = notes[k + 1];
          // Slightly detached articulation keeps the echo from smearing into the voice.
          var stop = Math.min(limit, at + n.dur * (pureMelody ? 1 : n.dur >= 1 ? 0.92 : 0.82), next ? next.start + shift : Infinity);
          info.last = k === notes.length - 1;
          info.dir = next ? (next.pitch >= n.pitch ? 1 : -1) : -1;
          place(n, at, stop, octave, fromKey, mode, info);
        });
        if (info.sources.size < 2) { out.length = mark; return null; }
        var lastSource = notes[notes.length - 1];
        var sample = { start: info.first.start, end: info.end, sourceStart: info.first.source, sourceEnd: lastSource.start + lastSource.dur,
          inst: info.inst, answer: mode === 'answer', mode: mode, delay: mode === 'canon' ? delay : 0, octave: octave, notes: out.length - mark };
        samples.push(sample);
        return sample;
      };
      var octaveFor = function (notes, canon) {
        var high = Math.max.apply(null, notes.map(function (n) { return n.pitch; }));
        return high + 12 <= (canon ? 91 : 88) ? 12 : -12;
      };

      /* --- canon passages: choruses and returning phrases first, never all of them --- */
      var phraseList = analysis.phrases, firstOfFamily = {};
      phraseList.forEach(function (p, i) { if (!(p.family in firstOfFamily)) firstOfFamily[p.family] = i; });
      var ranked = phraseList.map(function (p, i) {
        return { p: p, i: i, rank: (p.section === 'chorus' ? 1 : 0) + (firstOfFamily[p.family] !== i ? 0.8 : 0) + (i === 0 ? -1.5 : 0) + sampleRnd() * 0.6 };
      }).filter(function (r) { return r.p.notes.length >= 3 && r.p.length >= 2; });
      var wanted = Math.max(1, Math.round(phraseList.length * Math.min(0.8, 0.35 * amount))), chosenCount = 0;
      // Also cap the imitated share of sung time, so a song of a few very long phrases is not echoed throughout.
      var sungTotal = phraseList.reduce(function (sum, p) { return sum + p.length; }, 0), timeLeft = sungTotal * Math.min(0.85, 0.42 * amount);
      var chosen = ranked.sort(function (a, b) { return b.rank - a.rank; }).filter(function (r) {
        if (wanted <= 0 || (r.p.length > timeLeft && timeLeft < sungTotal * 0.999 - 1e-9 && chosenCount > 0)) return false;
        wanted--; timeLeft -= r.p.length; chosenCount++; return true;
      }).sort(function (a, b) { return a.i - b.i; });
      chosen.forEach(function (r) {
        var p = r.p, next = phraseList[r.i + 1];
        var dense = p.density > 2.2, source = p.notes.filter(function (n) { return !dense || n.dur >= 0.2; });
        if (source.length < 3) return;
        var lastSrc = source[source.length - 1];
        var lastMinDur = Math.min(lastSrc.dur, Math.max(unit * 0.35, lastSrc.dur * 0.5));
        var best = null;
        (triple ? [unit, 2 * unit, 4] : [1, 2, 4]).forEach(function (delay) {
          var limit = Math.min(p.end + delay, next ? entryLimit(next.start) : analysis.end, analysis.end), sc = 0;
          // An echo sounds best where the singer holds a note or breathes, worst on top of new sung syllables.
          source.forEach(function (n) {
            var s = n.start + delay, e = Math.min(limit, s + n.dur);
            for (var t = s; t < e; t += 0.125) { var v = sungAt(t); sc += (!v ? 1 : t - v.start >= 0.5 ? 0.6 : -0.4) * 0.125; }
            if (s < limit && vocalLine.some(function (v) { return Math.abs(v.start - s) < 0.06; })) sc -= 0.25;
          });
          var lastAt = lastSrc.start + delay;
          if (lastAt + lastMinDur <= limit + 1e-6) sc += 2.5;
          else if (lastAt >= limit - 0.08) sc -= 3.0;
          sc += delay === 4 ? 0.6 : Math.abs(delay - 2 * unit) < 1e-9 ? 0.25 : 0;
          if (!best || sc > best.score) best = { delay: delay, limit: limit, score: sc };
        });
        quotePassage(source, best.delay, octaveFor(source, true), p.key, 'canon', best.delay, best.limit);
      });

      /* 前奏/间奏/尾奏主奏：只用现有演唱与尾奏空档，不把换气当间奏。
         以完整复现原曲乐句为主（超长时从前段裁起，保留句尾落音），只在末尾保留少量和弦收束。
         独立随机源，不改卡农、原有伴奏或其它空档的选择。 */
      var leadRnd = NSG.mulberry32((seed ^ 0x4c454144) >>> 0);
      var leadSpaces = [], leadEnd = Math.max(0, Number.isFinite(opt._leadStart) ? opt._leadStart : 0);
      if (multi) {
        ensemble.allVocalSpans.forEach(function (sp, i) {
          if (sp[0] - leadEnd >= Math.max(4, bpm / 60 * 1.8)) {
            leadSpaces.push({ start: leadEnd, end: sp[0], section: i === 0 ? 'intro' : 'interlude' });
          }
          leadEnd = Math.max(leadEnd, sp[1]);
        });
      } else {
        vocalLine.forEach(function (n, i) {
          if (n.start - leadEnd >= Math.max(4, bpm / 60 * 1.8)) {
            leadSpaces.push({ start: leadEnd, end: n.start, section: i === 0 ? 'intro' : 'interlude' });
          }
          leadEnd = Math.max(leadEnd, n.start + n.dur);
        });
      }
      if (analysis.end - leadEnd >= Math.max(4, bpm / 60 * 1.8) &&
        !samples.some(function (s) { return s.mode === 'canon' && s.end > leadEnd + 0.5; })) {
        leadSpaces.push({ start: leadEnd, end: analysis.end, section: 'outro' });
      }
      var extraLeadBeats = leadSpaces.reduce(function (sum, sp) {
        return sum + (sp.end - sp.start >= 28 * unit ? (sp.end - sp.start) - 16 * unit : 0);
      }, 0);
      var leadBudget = (Math.min(192, Math.max(24, Math.round(mel.length * 0.65))) + Math.round(extraLeadBeats * 0.85)) * amount;
      leadSpaces.forEach(function (space, spaceIndex) {
        if (leadBudget < 4) return;
        var free = [{
          start: space.section === 'intro' ? space.start : exitLimit(space.start),
          end: space.section === 'outro' ? space.end : entryLimit(space.end)
        }];
        var occupied = samples.map(function (s) { return { start: s.start, end: s.end }; }).concat(
          out.filter(function (n) { return n.role === 'fill' || n.arrangePart === 'fill'; }).map(function (n) { return { start: n.start, end: n.start + n.dur }; }));
        occupied.forEach(function (o) {
          var next = [];
          free.forEach(function (f) {
            if (o.end <= f.start || o.start >= f.end) next.push(f);
            else {
              if (o.start - unit * 0.15 > f.start) next.push({ start: f.start, end: o.start - unit * 0.15 });
              if (o.end + unit * 0.15 < f.end) next.push({ start: o.end + unit * 0.15, end: f.end });
            }
          });
          free = next;
        });
        function emitLeadWindow(room, slotIdx, slotCount) {
          if (!room || room.end - room.start < (slotCount > 1 ? 6 : 3) * unit) return;
          var maxSpan = Math.min(16, 8 + 4 * amount);
          var alignRight = (space.section === 'intro' || (slotCount > 1 && space.section === 'interlude')) && slotIdx === slotCount - 1;
          var from = alignRight ? Math.max(room.start, room.end - maxSpan) : room.start;
          var step = unit / 2;
          from = analysis.grid.offset + Math.ceil((from - analysis.grid.offset) / step - 1e-7) * step;
          if (from < room.start - 1e-7) from += step;
          var to = Math.min(room.end, from + maxSpan);
          if (to - from < 2.5 * unit) return;
          var candidates = phraseList.filter(function (p) { return p.notes.length >= 3; });
          if (!candidates.length) return;
          function extractNotes(phrase) {
            var ns = phrase.notes.filter(function (n) { return n.dur >= unit * 0.15; });
            if (ns.length < 3) ns = phrase.notes.slice();
            ns = ns.filter(function (n, i, arr) { return !i || n.start > arr[i - 1].start + 1e-6; });
            if (ns.length > 24) ns = ns.slice(-24);
            return ns;
          }
          function playableSpan(ns) {
            var firstN = ns[0], lastN = ns[ns.length - 1];
            var minLast = pureMelody
              ? Math.min(lastN.dur, Math.max(unit * 0.5, lastN.dur * 0.5))
              : Math.min(lastN.dur, Math.max(unit * 0.5, Math.min(unit * 0.9, lastN.dur * 0.55)));
            return (lastN.start - firstN.start) + minLast;
          }
          function distinctByFamily(list) {
            var picked = [], seenFam = new Set();
            list.forEach(function (p) { if (!seenFam.has(p.family)) { seenFam.add(p.family); picked.push(p); } });
            if (picked.length < slotCount) {
              list.forEach(function (p) { if (picked.indexOf(p) < 0) picked.push(p); });
            }
            return picked;
          }
          // Keep the quoted passage stable while changing degree; taking room
          // away from it can paradoxically shorten the improvised ending too.
          var themeRoom = (to - from) * (pureMelody ? 1 : 0.88);
          var minTimeScale = pureMelody ? 1 : 0.80;
          var maxPlayable = themeRoom / minTimeScale;
          var chorusCands = candidates.filter(function (p) { return p.section === 'chorus'; });
          var sourcePhrase;
          if (space.section === 'intro') {
            sourcePhrase = chorusCands.find(function (p) { var ns = extractNotes(p); return ns.length >= 3 && playableSpan(ns) <= maxPlayable; }) ||
              chorusCands[0] ||
              candidates.find(function (p) { var ns = extractNotes(p); return ns.length >= 3 && playableSpan(ns) <= maxPlayable; }) ||
              candidates[0];
          } else if (space.section === 'outro') {
            var fittingChorus = chorusCands.filter(function (p) { var ns = extractNotes(p); return ns.length >= 3 && playableSpan(ns) <= maxPlayable; }).pop();
            var lastCand = candidates[candidates.length - 1], lastNs = extractNotes(lastCand);
            sourcePhrase = fittingChorus ||
              (lastNs.length >= 3 && playableSpan(lastNs) <= maxPlayable ? lastCand : null) ||
              chorusCands[chorusCands.length - 1] || lastCand;
          } else {
            sourcePhrase = candidates.filter(function (p) { return p.end <= space.start + 1e-6; }).pop() || candidates[0];
          }
          if (slotCount > 1 && space.section === 'intro') {
            var introFit = chorusCands.filter(function (p) { var ns = extractNotes(p); return ns.length >= 3 && playableSpan(ns) <= maxPlayable; });
            var introPool = distinctByFamily(introFit.length ? introFit : chorusCands.length ? chorusCands : candidates);
            if (slotIdx < slotCount - 1) {
              var introOthers = introPool.filter(function (p) { return p !== sourcePhrase; });
              if (introOthers.length) sourcePhrase = introOthers[slotIdx % introOthers.length];
              else if (introPool.length) sourcePhrase = introPool[(slotIdx + 1) % introPool.length];
            }
          } else if (slotCount > 1 && space.section === 'interlude') {
            var before = candidates.filter(function (p) { return p.end <= space.start + 1e-6; });
            var interRaw = before.filter(function (p) { return p.section === 'chorus'; }).concat(
              before.filter(function (p) { return p.section !== 'chorus'; }).reverse()
            );
            var interPool = distinctByFamily(interRaw.length ? interRaw : candidates);
            if (slotIdx > 0 && interPool.length > 1) {
              var interOthers = interPool.filter(function (p) { return p !== sourcePhrase; });
              if (interOthers.length) sourcePhrase = interOthers[(slotIdx - 1) % interOthers.length];
              else sourcePhrase = interPool[slotIdx % interPool.length];
            }
          }
          if (!sourcePhrase) return;
          var sourceNotes = extractNotes(sourcePhrase);
          if (sourceNotes.length < 2) return;
          if (playableSpan(sourceNotes) > maxPlayable) {
            var startIdx = -1;
            for (var si = 1; si <= sourceNotes.length - 3; si++) {
              if (playableSpan(sourceNotes.slice(si)) <= maxPlayable) { startIdx = si; break; }
            }
            if (startIdx >= 0) {
              var bestEntry = startIdx;
              for (var sj = startIdx + 1; sj <= sourceNotes.length - 4; sj++) {
                if (playableSpan(sourceNotes.slice(sj)) < maxPlayable * 0.6) break;
                var downbeat = Math.abs(mod4(sourceNotes[sj].start - analysis.grid.offset)) < 0.05;
                var afterGap = sourceNotes[sj].start - (sourceNotes[sj - 1].start + sourceNotes[sj - 1].dur) >= unit * 0.35;
                if (downbeat || afterGap) { bestEntry = sj; break; }
              }
              sourceNotes = sourceNotes.slice(bestEntry);
            } else {
              var subFound = null;
              for (var se = sourceNotes.length - 2; se >= 2 && !subFound; se--) {
                var nEnd = sourceNotes[se], nNext = sourceNotes[se + 1];
                if (nEnd.dur >= unit * 1.2 || nNext.start - (nEnd.start + nEnd.dur) >= unit * 0.5) {
                  for (var ss = 0; ss <= se - 2; ss++) {
                    var candSlice = sourceNotes.slice(ss, se + 1);
                    if (playableSpan(candSlice) <= maxPlayable) { subFound = candSlice; break; }
                  }
                }
              }
              if (subFound) sourceNotes = subFound;
              else if (sourceNotes.length >= 2 && playableSpan(sourceNotes.slice(-2)) <= maxPlayable) sourceNotes = sourceNotes.slice(-2);
              else return;
            }
          }
          if (leadBudget < Math.min(4, sourceNotes.length)) return;
          var sourceSpan = sourceNotes[sourceNotes.length - 1].start + sourceNotes[sourceNotes.length - 1].dur - sourceNotes[0].start;
          var timeScale = Math.max(minTimeScale, Math.min(1, themeRoom / sourceSpan));
          var sourceCenter = sourceNotes.reduce(function (sum, n) { return sum + n.pitch; }, 0) / sourceNotes.length;
          var themeOctave = Math.round((74 - sourceCenter) / 12) * 12;
          var leadInst = instrumentFor('lead', space.section, 'lead'), leadRange = instrumentRange(leadInst, 60, 88);
          var cursor = from, previous = null, mark = out.length;
          function emitLead(at, dur, target, mode, src, final, keepPhrase) {
            var stop = Math.min(to, at + dur);
            while (at < stop - 0.04 && (keepPhrase || leadBudget >= 1)) {
              var h = harmonyAt(at), until = Math.min(stop, h.end);
              var strong = Math.abs((at - analysis.grid.offset) / unit - Math.round((at - analysis.grid.offset) / unit)) < 0.03;
              var pool = final || until - at >= unit * 0.9 || (strong && mode !== 'theme') ? h.tones : scaleOf(h);
              var pick = null, best = Infinity;
              if (pureMelody && mode === 'theme') {
                pick = target;
                while (pick < leadRange[0]) pick += 12;
                while (pick > leadRange[1]) pick -= 12;
              }
              for (var pitch = leadRange[0]; pitch <= leadRange[1]; pitch++) {
                if (pureMelody && mode === 'theme') break;
                if (pool.indexOf(pitchClass(pitch)) < 0) continue;
                var cost = Math.abs(pitch - target) + (previous === null || mode === 'theme' ? 0 : Math.max(0, Math.abs(pitch - previous) - 5) * 0.8);
                if (cost < best) { best = cost; pick = pitch; }
              }
              if (pick === null || until - at <= 0.04) { at = until; continue; }
              var leadNote = { start: at, dur: until - at, pitch: pick, vel: 64 + Math.floor(leadRnd() * 9) + (strong ? 4 : 0),
                inst: leadInst, pan: (spaceIndex + (slotCount > 1 ? slotIdx : 0)) % 2 ? -0.12 : 0.12, role: 'instrumentalLead', leadMode: mode, leadSection: space.section,
                // The gate also contains the release tail: it must never bleed into the returning singer.
                harmonyEnd: Math.min(h.end, to, until) };
              if (src) leadNote.sampleSource = src.start;
              out.push(leadNote); leadBudget = Math.max(0, leadBudget - 1); previous = pick; at = until;
            }
          }
          var endTheme = from + themeRoom, themeStart = from, themeEvents = 0;
          // If the motif is short, repeat it instead of filling the remaining
          // silence with an unrelated run. Preserve its rhythm and octave contour.
          for (var repeat = 0; repeat < 2; repeat++) {
            sourceNotes.forEach(function (n, k) {
              var at = themeStart + (n.start - sourceNotes[0].start) * timeScale;
              if (at >= endTheme - 0.1) return;
              var h = harmonyAt(at), target = n.pitch + themeOctave + (pureMelody ? 0 : (h.key - sourcePhrase.key + 18) % 12 - 6);
              var nextOnset = sourceNotes[k + 1] ? themeStart + (sourceNotes[k + 1].start - sourceNotes[0].start) * timeScale : Infinity;
              var dur = Math.min(n.dur * timeScale * (pureMelody ? 1 : 0.9), endTheme - at, nextOnset - at);
              emitLead(at, dur, target, 'theme', n, false, repeat === 0);
              themeEvents++;
              cursor = Math.max(cursor, at + dur);
            });
            themeStart = analysis.grid.offset + Math.ceil((themeStart + sourceSpan * timeScale + unit * 0.25 - analysis.grid.offset) / step) * step;
            if (themeStart + playableSpan(sourceNotes) * timeScale > endTheme - 0.05 || leadBudget < sourceNotes.length) break;
          }
          // The slider scales both duration and event budget; zero emits no new notes.
          cursor = analysis.grid.offset + Math.ceil((cursor + unit * 0.2 - analysis.grid.offset) / step) * step;
          var quotedDuration = out.slice(mark).reduce(function (sum, n) { return sum + n.dur; }, 0);
          to = Math.min(to, cursor + quotedDuration * 0.2 * improvScale, cursor + unit * 1.5 * improvScale);
          var turn = leadRnd() < 0.5 ? 1 : -1, count = 0;
          var closingEvents = Math.min(Math.ceil(2 * improvScale), Math.floor(themeEvents / 4 * improvScale));
          while (cursor < to - unit * 0.3 && leadBudget >= 1 && count < closingEvents) {
            var remaining = to - cursor, final = remaining <= unit * 1.6 || count + 1 >= closingEvents;
            if (final) {
              var hc = harmonyAt(cursor);
              if (hc.end - cursor < unit * 0.35 && to - hc.end >= unit * 0.45) {
                cursor = hc.end;
                remaining = to - cursor;
              }
            }
            var dur = final ? remaining : step * (count % 3 === 2 ? 2 : 1);
            var target;
            if (final) {
              var hf = harmonyAt(cursor);
              var resolvePc = hf.tones.indexOf(hf.key) >= 0 ? hf.key : hf.root;
              var bestRes = null, bestResDist = Infinity, refP = previous === null ? 72 : previous;
              for (var rp = leadRange[0]; rp <= leadRange[1]; rp++) {
                if (pitchClass(rp) !== resolvePc) continue;
                var rdist = Math.abs(rp - refP);
                if (rdist < bestResDist) { bestResDist = rdist; bestRes = rp; }
              }
              target = bestRes !== null ? bestRes : (previous === null ? 72 : previous);
            } else {
              target = previous === null ? 72 : previous + turn * (count % 3 === 2 ? 3 : 2);
              if (target > 81 || target < 64 || count % 4 === 3) { turn *= -1; target = (previous || 72) + turn * 2; }
            }
            var noteDur = dur * (final ? 0.96 : 0.86);
            if (final) {
              var hfEnd = harmonyAt(cursor).end;
              if (cursor + noteDur > hfEnd && cursor + noteDur - hfEnd < unit * 0.35 && hfEnd - cursor >= unit * 0.3) {
                noteDur = hfEnd - cursor;
              }
            }
            emitLead(cursor, noteDur, target, 'improv', null, final, false);
            cursor += dur; count++;
          }
          if (out.length - mark < 3) { leadBudget += out.length - mark; out.length = mark; return; }
          leads.push({ start: out[mark].start, end: out[out.length - 1].start + out[out.length - 1].dur,
            section: space.section, inst: leadInst, notes: out.length - mark,
            themeNotes: out.slice(mark).filter(function (n) { return n.leadMode === 'theme'; }).length,
            improvisedNotes: out.slice(mark).filter(function (n) { return n.leadMode === 'improv'; }).length });
        }
        if (space.end - space.start < 28 * unit) {
          free.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });
          emitLeadWindow(free[0], 0, 1);
          return;
        }
        var candWindows = [];
        free.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (f) {
          var len = f.end - f.start;
          if (len < 6 * unit) return;
          if (len >= 32 * unit) {
            var pos = f.start;
            while (pos + 14 * unit <= f.end - 18 * unit) {
              candWindows.push({ start: pos, end: pos + 14 * unit });
              pos += 22 * unit;
            }
            if (f.end - pos >= 6 * unit) candWindows.push({ start: Math.max(pos, f.end - 16 * unit), end: f.end });
          } else {
            candWindows.push(f);
          }
        });
        if (!candWindows.length) return;
        var maxSlots = Math.min(3, Math.max(2, Math.floor((space.end - space.start) / (28 * unit))));
        var chosenWindows;
        if (candWindows.length <= 1 || maxSlots <= 1) {
          chosenWindows = [candWindows[candWindows.length - 1]];
        } else {
          var lastW = candWindows[candWindows.length - 1];
          var lastMinSpan = Math.min(16, 8 + 4 * amount);
          var effLastStart = space.section === 'outro' ? lastW.start : Math.max(lastW.start, lastW.end - lastMinSpan);
          var earlier = candWindows.slice(0, -1).filter(function (w) { return effLastStart - w.end >= 4 * unit; });
          if (!earlier.length) {
            chosenWindows = [lastW];
          } else if (maxSlots === 2 || earlier.length === 1) {
            chosenWindows = [earlier[0], lastW];
          } else {
            var firstW = earlier[0], midW = null;
            var midTarget = Math.floor(earlier.length / 2);
            for (var off = 0; off < earlier.length; off++) {
              var candIdx = midTarget + (off % 2 ? -Math.ceil(off / 2) : Math.floor(off / 2));
              if (candIdx <= 0 || candIdx >= earlier.length) continue;
              if (earlier[candIdx].start - firstW.end >= 4 * unit) { midW = earlier[candIdx]; break; }
            }
            chosenWindows = midW ? [firstW, midW, lastW] : [firstW, lastW];
          }
        }
        chosenWindows.forEach(function (win, slotIdx) {
          if (leadBudget < 4) return;
          emitLeadWindow(win, slotIdx, chosenWindows.length);
        });
      });

      /* --- answers: echo the tail of the phrase that just ended into the following gap --- */
      var spaces = [], soundingEnd = vocalLine[0].start;
      if (multi) {
        var spA = ensemble.allVocalSpans;
        soundingEnd = spA[0][0];
        spA.forEach(function (sp) {
          if (entryLimit(sp[0]) - soundingEnd >= 1.2) spaces.push({ start: soundingEnd + 0.08, end: entryLimit(sp[0]) });
          soundingEnd = Math.max(soundingEnd, sp[1]);
        });
      } else {
        vocalLine.forEach(function (n) {
          if (entryLimit(n.start) - soundingEnd >= 1.2) spaces.push({ start: soundingEnd + 0.08, end: entryLimit(n.start) });
          soundingEnd = Math.max(soundingEnd, n.start + n.dur);
        });
      }
      if (analysis.end - soundingEnd >= 1.2) spaces.push({ start: soundingEnd + 0.08, end: analysis.end - 0.08 });
      var answerChance = Math.min(0.95, 0.55 * amount);
      function answerSpan(ns) {
        var lastN = ns[ns.length - 1];
        return (lastN.start - ns[0].start) + Math.min(lastN.dur, Math.max(unit * 0.5, lastN.dur * 0.6));
      }
      spaces.forEach(function (space) {
        if (sampleRnd() >= answerChance) return;
        if (leads.some(function (s) { return space.start < s.end + 0.5 && space.end > s.start - 0.5; })) return;
        if (samples.some(function (s) { return space.start < s.end + 0.5 && space.end > s.start - 0.5; })) return;
        // 演歌的拨弦应和已经占了这个空档
        if (out.some(function (n) { return n.role === 'fill' && n.start < space.end && n.start + n.dur > space.start; })) return;
        var before = phraseList.filter(function (p) { return p.end <= space.start + 0.1; }).pop();
        if (!before) return;
        var tail = before.notes.slice(-6), room = space.end - space.start;
        while (tail.length > 2 && answerSpan(tail) > room) tail = tail.slice(1);
        var tailLast = tail[tail.length - 1];
        if (tail.length < 2 || (tailLast.start - tail[0].start) + Math.min(tailLast.dur, unit * 0.35) > room ||
          new Set(tail.map(function (n) { return n.pitch; })).size < 2) return;
        quotePassage(tail, space.start - tail[0].start, octaveFor(tail, false), before.key, 'answer', 0, space.end);
      });
      samples.sort(function (a, b) { return a.start - b.start; });
    }
    if (opt.chip8bit || ST.chip) {
      var chipPads = {};
      out = out.filter(function (n) {
        if (n.role || (n.inst !== 'pad' && n.inst !== ST.padInst)) return true;
        var h = harmonyAt(n.start), id = h.start;
        if (!chipPads[id]) {
          var root = n.pitch + (h.tones[0] - pitchClass(n.pitch) + 18) % 12 - 6;
          // Put the fast chord cycle above the comping register so it remains
          // audible; store the actual pitches for synthesis and MIDI export.
          chipPads[id] = Object.assign({}, n, { inst: 'chipArp', pitch: root + 12, vel: Math.min(65, n.vel),
            chipTones: h.tones.slice(0, 3).map(function (pc) { return root + 12 + (pc - h.tones[0] + 12) % 12; }) });
        } else {
          var padNote = chipPads[id], end = Math.max(padNote.start + padNote.dur, n.start + n.dur);
          padNote.start = Math.min(padNote.start, n.start); padNote.dur = end - padNote.start;
        }
        return false;
      });
      out.forEach(function (n) {
        if (n.inst === 'bass' || n.inst === 'tuba') n.inst = Math.floor(n.start / 16) % 3 === 2 ? 'chipHybrid' : 'chipTriangle';
        else if (n.inst === 'kick') n.inst = 'chipKick';
        else if (n.inst === 'tom') n.inst = 'chipTom';
        else if (['snare', 'hat', 'openhat', 'crash', 'perc', 'ride', 'rim', 'clap'].indexOf(n.inst) >= 0) {
          n.chipDrum = n.inst; n.inst = 'chipNoise';
        } else {
          var color = Math.floor(Math.max(0, n.start - analysis.phrases[0].start) / 16);
          // 采样旋律固定用 PWM 主奏；长音类和弦乐器走 PWM / 锯齿，拨奏类走固定占空比方波，
          // 分解音型用细方波与波表。75% / 87.5% 与 25% / 12.5% 听感相同，不再参与轮换。
          var palette = n.role === 'melodySample' || n.role === 'instrumentalLead' ? ['chipPWM'] :
            n.inst === 'strings' ? ['chipPWM', 'chipSaw'] :
              ['ep', 'organ', 'brass', 'accordion'].indexOf(n.inst) >= 0 ? ['chipPWM', 'chipPWM', 'chipTable'] :
                n.inst === 'arp' ? ['chipPulse12', 'chipTable'] : ['chipPulse25', 'chipPulse50', 'chipPulse12'];
          n.inst = palette[color % palette.length];
        }
      });
      Object.keys(chipPads).forEach(function (id) { out.push(chipPads[id]); });
      samples.forEach(function (s) {
        var first = out.find(function (n) { return n.role === 'melodySample' && n.sampleMode === s.mode && n.start >= s.start && n.start < s.end; });
        if (first) s.inst = first.inst;
      });
      leads.forEach(function (s) { s.inst = 'chipPWM'; });
    }
    out.sort(function (a, b) { return a.start - b.start; });
    out.seed = seed;
    out.sections = sections;
    out.chords = chords;
    out.phrases = analysis.phrases.map(function (p) { return { start: p.start, end: p.end, length: p.length, density: p.density, key: p.key, minor: p.minor, section: p.section, confidence: p.confidence }; });
    out.harmonies = harmonies;
    out.grid = analysis.grid;
    out.blocks = analysis.blocks;
    out.samples = samples;
    out.leads = leads;
    out.expression = expression;
    out.chordRate = chordRate;
    out.effectiveChordRate = chordRate * mood.chordRate;
    out.mood = { id: mood.id, name: mood.name, automatic: moodChoice.automatic };
    out.expressionPlan = expressionPlan;
    out.space = chipMode ? 'off' : (opt.space && opt.space !== 'auto' ? opt.space : (ST.space || 'studio'));
    if (multi) out.vocalEnsemble = ensemble.summary;
    return out;
  }

  /* 编曲入口：先决定小节网格。卷帘 4/4 直接编；三拍子或跟随演唱的小节线，
     把每个实际小节线性映射成四单位的虚拟小节，在虚拟时间里编曲，再映射回原时间轴。
     主唱音符本身从不移动。 */
  C.arrange = function (score, opt) {
    opt = opt || {};
    if (opt.halfBpm) {
      // A double-BPM transcription uses two project beats per musical beat.
      // Analyse a private half-sized score, then return everything in project beats.
      var halfScore = Object.assign({}, score, {
        tempo: (score.tempo || 120) / 2,
        tempos: score.tempos && score.tempos.map(function (t) { return Object.assign({}, t, { beat: t.beat / 2, bpm: t.bpm / 2 }); }),
        tracks: (score.tracks || []).map(function (t) {
          return t.type !== 'vocal' ? t : Object.assign({}, t, { notes: t.notes.map(function (n) {
            return Object.assign({}, n, { start: n.start / 2, dur: n.dur / 2 });
          }) });
        })
      });
      var halfOpt = Object.assign({}, opt, { halfBpm: false });
      if (Number.isFinite(opt.barOffset)) halfOpt.barOffset = opt.barOffset / 2;
      var half = C.arrange(halfScore, halfOpt);
      half.forEach(function (n) {
        ['start', 'dur', 'harmonyEnd', 'sampleSource', 'sampleDelay'].forEach(function (k) { if (Number.isFinite(n[k])) n[k] *= 2; });
      });
      function projectSpan(o) {
        var c = Object.assign({}, o);
        ['start', 'end', 'barStart', 'sourceStart', 'sourceEnd', 'delay'].forEach(function (k) { if (Number.isFinite(c[k])) c[k] *= 2; });
        return c;
      }
      ['phrases', 'harmonies', 'blocks', 'expressionPlan', 'leads', 'samples'].forEach(function (k) {
        if (half[k]) half[k] = half[k].map(projectSpan);
      });
      (half.phrases || []).forEach(function (p) { p.length *= 2; p.density /= 2; });
      if (half.grid) {
        half.grid = Object.assign({}, half.grid, { offset: half.grid.offset * 2,
          barLength: (half.grid.barLength || half.grid.meter || 4) * 2 });
        if (half.grid.bars) half.grid.bars = half.grid.bars.map(function (b) { return b * 2; });
      }
      half.halfBpm = true;
      half.arrangementBpm = (halfScore.tempos && halfScore.tempos[0] && halfScore.tempos[0].bpm) || halfScore.tempo;
      return half;
    }
    var ensemble = prepareVocalEnsemble(score, opt);
    if (!ensemble.tracks.length) return arrangeCore(score, opt);
    var multi = !!ensemble.multi;
    var trk = ensemble.tracks[0].track;
    if (!multi && (!trk || !trk.notes.length || !trk.notes.some(pitched))) return arrangeCore(score, opt);
    var bpm = (score.tempos && score.tempos[0] && score.tempos[0].bpm) || score.tempo || 120;
    var vocalTempo = NSG.TEMPO && NSG.TEMPO.map(score);
    function realEntryLimit(beat) {
      return Math.min(beat - 1, vocalTempo ? vocalTempo.beatOf(vocalTempo.secOf(beat) - 0.5) : beat - bpm / 120);
    }
    function realExitLimit(beat) {
      return Math.max(beat + 1, vocalTempo ? vocalTempo.beatOf(vocalTempo.secOf(beat) + 0.5) : beat + bpm / 120);
    }
    var initialPhrases = multi ? ensemble.leadPhrases : C.splitPhrases(trk.notes);
    var gridSource = multi ? ensemble.leadMel : trk.notes;
    var grid = C.detectBarGrid(gridSource, { meter: opt.meter, gridMode: opt.gridMode, barOffset: opt.barOffset, bpm: bpm, phrases: initialPhrases });
    var meterAuto = !(opt.meter === 3 || opt.meter === 4 || opt.meter === '3' || opt.meter === '4');
    if (grid.mode === 'fixed' && grid.meter === 4) {
      var plain = arrangeCore(score, Object.assign({}, opt, { meter: 4, _ensemble: ensemble, _phrases: initialPhrases, _vocalEntryLimit: realEntryLimit, _vocalExitLimit: realExitLimit }));
      if (plain.grid) Object.assign(plain.grid, { mode: 'fixed', meter: 4, meterAutomatic: meterAuto, fixedFit: grid.fixedFit });
      return plain;
    }
    var voiced = multi ? ensemble.allMel : trk.notes.filter(pitched);
    var endSource = multi ? ensemble.allMel : trk.notes.filter(function (n) { return Number.isFinite(n.start) && Number.isFinite(n.dur); });
    var first = Math.min.apply(null, voiced.map(function (n) { return n.start; }));
    var last = Math.max.apply(null, endSource.map(function (n) { return n.start + n.dur; }));
    var bars = grid.bars ? grid.bars.slice() : [];
    if (grid.mode === 'fixed') {
      var phase = Number.isFinite(grid.phase) ? grid.phase : 0;
      for (var t = first - ((first - phase) % 3 + 3) % 3; t <= last + 3; t += 3) bars.push(t);
    }
    while (bars[0] > first - 1e-6) bars.unshift(bars[0] - (bars[1] - bars[0]));
    while (bars[bars.length - 1] < last + 1e-6) bars.push(bars[bars.length - 1] + (bars[bars.length - 1] - bars[bars.length - 2]));
    var K = bars.length - 1;
    function toV(t) {
      if (t <= bars[0]) return (t - bars[0]) / (bars[1] - bars[0]) * 4;
      if (t >= bars[K]) return 4 * K + (t - bars[K]) / (bars[K] - bars[K - 1]) * 4;
      var lo = 0, hi = K;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (bars[mid] <= t) lo = mid; else hi = mid; }
      return 4 * lo + (t - bars[lo]) / (bars[lo + 1] - bars[lo]) * 4;
    }
    function toR(v) {
      var k = Math.floor(v / 4);
      if (k < 0) return bars[0] + v / 4 * (bars[1] - bars[0]);
      if (k >= K) return bars[K] + (v - 4 * K) / 4 * (bars[K] - bars[K - 1]);
      return bars[k] + (v - 4 * k) / 4 * (bars[k + 1] - bars[k]);
    }
    var sourceOf = new Map();
    var vTracks = ensemble.tracks.map(function (item) {
      var vNotes = (item.track.notes || []).filter(function (n) { return Number.isFinite(n.start) && Number.isFinite(n.dur) && n.start + n.dur > bars[0]; }).map(function (n) {
        var a = toV(Math.max(n.start, bars[0])), b = toV(n.start + n.dur), copy = Object.assign({}, n, { start: a, dur: Math.max(1e-4, b - a) });
        if (pitched(n)) sourceOf.set(a, n.start);
        return copy;
      });
      return Object.assign({}, item.track, { muted: false, notes: vNotes });
    });
    if (multi) {
      ensemble.leadMel.forEach(function (n) {
        if (n.start + n.dur > bars[0]) sourceOf.set(toV(Math.max(n.start, bars[0])), n.start);
      });
    }
    var barLength = (bars[K] - bars[0]) / K;
    var vScore = { tempo: bpm * 4 / barLength, tempos: [{ beat: 0, bpm: bpm * 4 / barLength }], tracks: vTracks };
    var res = arrangeCore(vScore, Object.assign({}, opt, {
      trackIndex: undefined, trackIndices: undefined, _ensemble: null, _phrases: null,
      barOffset: 0, meter: grid.meter, _leadStart: toV(0),
      _vocalEntryLimit: function (beat) { return toV(realEntryLimit(toR(beat))); },
      _vocalExitLimit: function (beat) { return toV(realExitLimit(toR(beat))); } }));
    var mapped = [];
    res.forEach(function (n) {
      var a = toR(n.start), b = toR(n.start + n.dur);
      if (b <= 1e-6) return;
      a = Math.max(0, a);
      var m = Object.assign({}, n, { start: a, dur: b - a });
      if (Number.isFinite(n.harmonyEnd)) { m.harmonyEnd = toR(n.harmonyEnd); m.dur = Math.min(m.dur, m.harmonyEnd - a); }
      if (n.role === 'melodySample') {
        var src = sourceOf.has(n.sampleSource) ? sourceOf.get(n.sampleSource) : toR(n.sampleSource);
        if (Number.isFinite(n.sampleDelay)) m.sampleDelay = Math.round((toR(n.sampleSource + n.sampleDelay) - src) * 1000) / 1000;
        m.sampleSource = src;
      }
      if (n.role === 'instrumentalLead' && Number.isFinite(n.sampleSource)) m.sampleSource = sourceOf.has(n.sampleSource) ? sourceOf.get(n.sampleSource) : toR(n.sampleSource);
      if (m.dur > 0.01) mapped.push(m);
    });
    function span(o) { var c = Object.assign({}, o); ['start', 'end', 'barStart', 'sourceStart', 'sourceEnd'].forEach(function (k) { if (Number.isFinite(c[k])) c[k] = Math.max(0, toR(c[k])); }); return c; }
    mapped.seed = res.seed; mapped.sections = res.sections; mapped.chords = res.chords;
    mapped.phrases = (res.phrases || []).map(span);
    mapped.harmonies = (res.harmonies || []).map(span);
    mapped.blocks = (res.blocks || []).map(span);
    mapped.expression = res.expression;
    mapped.chordRate = res.chordRate;
    mapped.effectiveChordRate = res.effectiveChordRate;
    mapped.mood = res.mood;
    mapped.space = res.space;
    mapped.expressionPlan = (res.expressionPlan || []).map(span).filter(function (p) { return p.end > p.start; });
    mapped.leads = (res.leads || []).map(span);
    mapped.samples = (res.samples || []).map(function (sample) {
      var c = span(sample);
      if (sample.delay) c.delay = Math.round((toR(sample.sourceStart + sample.delay) - toR(sample.sourceStart)) * 1000) / 1000;
      if (sourceOf.has(sample.sourceStart)) c.sourceStart = sourceOf.get(sample.sourceStart);
      return c;
    });
    if (res.vocalEnsemble) {
      mapped.vocalEnsemble = Object.assign({}, res.vocalEnsemble, {
        tracks: res.vocalEnsemble.tracks.map(function (t) {
          var orig = ensemble.tracks[t.trackIndex];
          return Object.assign({}, t, { trackIndex: orig ? orig.trackIndex : t.trackIndex });
        })
      });
    }
    var mappedBars = bars.slice();
    var mappedEnd = mapped.blocks.length ? mapped.blocks[mapped.blocks.length - 1].end : last;
    var tailStep = bars[K] - bars[K - 1];
    while (mappedBars[mappedBars.length - 1] < mappedEnd + 1e-6) mappedBars.push(mappedBars[mappedBars.length - 1] + tailStep);
    mapped.grid = { mode: grid.mode, meter: grid.meter, automatic: grid.mode === 'tracked' ? grid.automatic : !Number.isFinite(opt.barOffset), meterAutomatic: meterAuto,
      bars: mappedBars, barLength: barLength, offset: ((bars[0] % barLength) + barLength) % barLength, confidence: grid.trackedFit !== undefined ? grid.trackedFit : 1, fixedFit: grid.fixedFit };
    return mapped;
  };

  NSG.COMPOSE = C;
})(typeof window !== 'undefined' ? window : global);
