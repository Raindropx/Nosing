/* ==========================================================================
   NSG · 多语种 G2P 引擎
   支持「本文字 + 罗马字」两种输入。字典按语种按需加载。
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['g2p'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  root.NSG_DICT = root.NSG_DICT || {};

  var DICT_FILE = { zh: 'js/data/zh.js', 'zh-x-sichuan': 'js/data/zh-x-sichuan.js', yue: 'js/data/yue.js', ja: 'js/data/ja.js', en: 'js/data/en.js', de: 'js/data/de.js', nan: 'js/data/nan.js', th: 'js/data/th.js',
    hak: 'js/data/hak.js', 'nan-x-teochew': 'js/data/nan-x-teochew.js', xdi8: 'js/data/xdi8.js' };
  var cache = {};
  var pendingDicts = new Map();
  var g2pCache = new Map(), G2P_CACHE_MAX = 4096;
  var ROMANCE_LANG = /^(es|pt|it|fr|ro)$/;
  var SOUTHEAST_ASIAN_LANG = /^(fil|id|ms|th)$/;
  NSG.isWordPhonemizer = function (lang) {
    return /^(en|de|pl|ru|uk|fi|eo|tok|asaxi|xdi8|tlh)$/.test(lang) || ROMANCE_LANG.test(lang) || SOUTHEAST_ASIAN_LANG.test(lang);
  };

  function sameStringArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function cloneSyllableList(list) {
    var res = new Array(list.length);
    for (var i = 0; i < list.length; i++) {
      var s = list[i], copy = Object.assign({}, s);
      if (Array.isArray(s.phones)) copy.phones = s.phones.slice();
      if (Array.isArray(s.hintSyllables)) {
        copy.hintSyllables = s.hintSyllables.map(function (h) { return h.slice(); });
      }
      res[i] = copy;
    }
    return res;
  }

  NSG.loadDict = function (lang) {
    // 规则音素器不需要外部字典；主线程与 Worker 均可直接使用。
    if (!Object.prototype.hasOwnProperty.call(DICT_FILE, lang)) return Promise.resolve({});
    if (cache[lang]) return Promise.resolve(cache[lang]);
    if (root.NSG_DICT[lang]) {
      cache[lang] = makeMap(root.NSG_DICT[lang], lang);
      g2pCache.clear();
      return Promise.resolve(cache[lang]);
    }
    if (lang === 'th' && typeof document === 'undefined') return Promise.resolve({});
    if (pendingDicts.has(lang)) return pendingDicts.get(lang);
    var loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = DICT_FILE[lang];
      s.onload = function () {
        try {
          if (!root.NSG_DICT[lang]) throw new Error('字典加载失败: ' + lang);
          cache[lang] = makeMap(root.NSG_DICT[lang], lang);
          g2pCache.clear();
          res(cache[lang]);
        } catch (e) {
          if (s.parentNode) s.parentNode.removeChild(s);
          rej(e);
        }
      };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        rej(new Error('字典加载失败: ' + lang));
      };
      document.head.appendChild(s);
    }).finally(function () { pendingDicts.delete(lang); });
    pendingDicts.set(lang, loading);
    return loading;
  };

  function enWordEnd(str, start, end) {
    var p = start;
    while (p < end) {
      var c = str.charCodeAt(p);
      if (c >= 65 && c <= 90) break;
      p++;
    }
    return p;
  }

  function isEnSorted(str) {
    if (typeof str !== 'string' || str.length < 4096) return false;
    for (var s = 1; s <= 8; s++) {
      var mid = Math.floor(str.length * s / 9);
      var a1 = mid > 0 ? str.lastIndexOf(',', mid - 1) + 1 : 0;
      var b1 = str.indexOf(',', a1);
      if (b1 < 0 || b1 + 1 >= str.length) continue;
      var a2 = b1 + 1, b2 = str.indexOf(',', a2);
      if (b2 < 0) b2 = str.length;
      var p1 = enWordEnd(str, a1, b1), p2 = enWordEnd(str, a2, b2);
      if (str.slice(a1, p1) > str.slice(a2, p2)) return false;
    }
    return true;
  }

  function lookupEnSorted(str, key) {
    if (!key) return undefined;
    var lo = 0, hi = str.length - 1, klen = key.length;
    while (lo <= hi) {
      var mid = (lo + hi) >>> 1;
      var a = mid > 0 ? str.lastIndexOf(',', mid - 1) + 1 : 0;
      var b = str.indexOf(',', a);
      if (b < 0) b = str.length;
      var p = enWordEnd(str, a, b), wlen = p - a;
      var cmp = 0, n = wlen < klen ? wlen : klen;
      for (var i = 0; i < n; i++) {
        var d = str.charCodeAt(a + i) - key.charCodeAt(i);
        if (d) { cmp = d; break; }
      }
      if (!cmp) cmp = wlen - klen;
      if (cmp === 0) return str.slice(p, b);
      if (cmp < 0) lo = b + 1; else hi = a - 1;
    }
    return undefined;
  }

  function makeMap(str, lang) {
    if (lang === 'de' || lang === 'th') return str || Object.create(null);
    if (lang === 'en' && isEnSorted(str)) return { _enSorted: str };
    var m = Object.create(null);
    if (!str) return m;
    var pos = 0, len = str.length;
    while (pos < len) {
      var next = str.indexOf(',', pos);
      if (next < 0) next = len;
      if (next - pos >= 2) {
        var ch, v;
        if (lang === 'en') {                // 词条形如 "singS IH1 NG"：前导小写字母是词，其余是音素
          var p = enWordEnd(str, pos, next);
          if (p > pos && p < next) {
            ch = str.slice(pos, p); v = str.slice(p, next);
            if (!m[ch]) m[ch] = v;
          }
        } else {                            // 汉字占 1 或 2 个 UTF-16 单元（含扩展 B 区代理对）
          var clen = str.codePointAt(pos) > 0xffff ? 2 : 1;
          if (next - pos > clen) {
            ch = str.slice(pos, pos + clen); v = str.slice(pos + clen, next);
            if (!m[ch]) m[ch] = v;
          }
        }
      }
      pos = next + 1;
    }
    return m;
  }

  NSG.collectScoreLanguages = function (score, extraLang, includeMuted) {
    var seen = Object.create(null), list = [];
    function add(l) {
      if (!l || typeof l !== 'string') return;
      if (!seen[l]) { seen[l] = true; list.push(l); }
    }
    add(extraLang);
    if (score && typeof score === 'object') {
      var scorePh = score.phonemizer, scoreLang = score.lang;
      if (score.project) {
        NSG.collectScoreLanguages(score.project.score || score.project, undefined, includeMuted).forEach(add);
      } else {
        var tracks = [];
        if (Array.isArray(score.tracks)) tracks = tracks.concat(score.tracks);
        if (Array.isArray(score.selectedTracks)) tracks = tracks.concat(score.selectedTracks);
        if (tracks.length) {
          for (var t = 0; t < tracks.length; t++) {
            var tr = tracks[t];
            if (!tr || tr.type === 'inst' || (tr.muted && !includeMuted)) continue;
            var trPh = tr.phonemizer !== undefined ? tr.phonemizer : scorePh;
            var trLang = tr.lang || scoreLang;
            add(trPh);
            add(trLang);
            var notes = tr.notes;
            if (Array.isArray(notes)) {
              for (var i = 0; i < notes.length; i++) {
                var n = notes[i];
                if (!n) continue;
                var explicitLang = n.noteLang || (n.langSource === 'note' ? n.lang : '');
                add(explicitLang || trPh || n.lang || trLang);
              }
            }
          }
        } else {
          add(scorePh);
          add(scoreLang);
          if (Array.isArray(score.notes)) {
            for (var j = 0; j < score.notes.length; j++) {
              var sn = score.notes[j];
              if (!sn) continue;
              var sExplicit = sn.noteLang || (sn.langSource === 'note' ? sn.lang : '');
              add(sExplicit || scorePh || sn.lang || scoreLang);
            }
          }
        }
      }
    }
    if (!list.length) add('zh');
    return list;
  };

  NSG.ensureScoreDicts = function (score, extraLang) {
    // Muted layers can still be opened and edited.
    var langs = NSG.collectScoreLanguages(score, extraLang, true);
    return Promise.all(langs.map(function (l) { return NSG.loadDict(l); }));
  };

  function isHanCode(c) {
    return (c >= 0x3400 && c <= 0x9fff) || (c >= 0x20000 && c <= 0x323af) || c === 0x3007;
  }
  function isHan(ch) { return !!ch && isHanCode(ch.codePointAt(0)); }

  // Match whole words before falling back to the single-character dictionary.
  // Aliases share readings; longer entries take precedence (e.g. 音乐会).
  var zhWords = Object.create(null);
  [
    '音乐/音樂 yin1 yue4', '音乐会/音樂會 yin1 yue4 hui4', '乐器/樂器 yue4 qi4',
    '乐队/樂隊 yue4 dui4', '乐谱/樂譜 yue4 pu3', '乐章/樂章 yue4 zhang1',
    '乐曲/樂曲 yue4 qu3', '声乐/聲樂 sheng1 yue4', '弦乐/弦樂 xian2 yue4',
    '快乐/快樂 kuai4 le4', '欢乐/歡樂 huan1 le4', '歌曲 ge1 qu3',
    '曲调/曲調 qu3 diao4', '旋律 xuan2 lv4', '曲折 qu1 zhe2',
    '银行/銀行 yin2 hang2', '行长/行長 hang2 zhang3', '行业/行業 hang2 ye4',
    '同行业/同行業 tong2 hang2 ye4', '行家 hang2 jia1', '一行字 yi1 hang2 zi4',
    '行走 xing2 zou3', '行人 xing2 ren2', '旅行 lv3 xing2', '人行道 ren2 xing2 dao4',
    '重新 chong2 xin1', '重复/重複 chong2 fu4', '重来/重來 chong2 lai2',
    '重逢 chong2 feng2', '重温/重溫 chong2 wen1', '重叠/重疊 chong2 die2',
    '重庆/重慶 chong2 qing4', '重重叠叠/重重疊疊 chong2 chong2 die2 die2',
    '重要 zhong4 yao4', '重量 zhong4 liang4', '沉重 chen2 zhong4',
    '长大/長大 zhang3 da4', '成长/成長 cheng2 zhang3', '生长/生長 sheng1 zhang3',
    '长短/長短 chang2 duan3', '长久/長久 chang2 jiu3', '长夜/長夜 chang2 ye4',
    '长大衣/長大衣 chang2 da4 yi1', '长发/長髮 chang2 fa4', '头发/頭髮 tou2 fa4',
    '曾经/曾經 ceng2 jing1', '相处/相處 xiang1 chu3', '到处/到處 dao4 chu4',
    '舍不得/捨不得 she3 bu4 de5', '舍得/捨得 she3 de5', '值得 zhi2 de5',
    '着急/著急 zhao2 ji2', '睡着/睡著 shui4 zhao2', '看着/看著 kan4 zhe5',
    '还给/還給 huan2 gei3', '归还/歸還 gui1 huan2', '还是/還是 hai2 shi4',
    '朝夕 zhao1 xi1', '朝向 chao2 xiang4'
  ].forEach(function (line) {
    var readings = line.split(' '), aliases = readings.shift().split('/');
    aliases.forEach(function (word) { zhWords[word] = readings; });
  });
  var zhWordPattern = new RegExp(Object.keys(zhWords).sort(function (a, b) { return b.length - a.length; }).join('|'), 'g');
  function mandarinPhraseReadings(text) {
    var readings = [], match;
    while ((match = zhWordPattern.exec(text)) !== null) {
      zhWords[match[0]].forEach(function (reading, i) { readings[match.index + i] = reading; });
    }
    return readings;
  }

  /* ---------------- 普通话 ---------------- */
  var ZH_INIT = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
  var ZH_INIT_MAP = {
    b: ['b'], p: ['ph'], m: ['m'], f: ['f'], d: ['d'], t: ['t_h'], n: ['n'], l: ['l_zh'],
    g: ['g'], k: ['kh'], h: ['h'], j: ['ts_j'], q: ['tsh_j'], x: ['xc'],
    zh: ['ts_r'], ch: ['tsh_r'], sh: ['sr'], r: ['r'], z: ['ts'], c: ['tsh'], s: ['s'],
    y: ['jj'], w: ['w']
  };
  // an/ai 的 a 是前 a，ao/ang 是后 ɑ（ao 另用更后的 Ao + 圆唇滑音 U_a）；都用央 a 时 an 与 ang 只剩韵尾可分。
  // ong 按试听反馈改用 o + ng；iong/yong 仍保留 y_medial + U + ng。
  var ZH_FIN = {
    a: ['a'], o: ['o'], e: ['7'], 'ê': ['E'], ai: ['af', 'I'], ei: ['e', 'I'], ao: ['Ao', 'U_a'], ou: ['o_ou', 'U_ou'],
    an: ['af', 'n'], en: ['@', 'n'], ang: ['A', 'ng'], eng: ['7', 'ng'], ong: ['o', 'ng'], er: ['6'],
    i: ['i'], ia: ['i', 'a'], ie: ['i', 'E'], iao: ['i', 'Ao', 'U_a'], iu: ['i', 'oU', 'U'], ian: ['i', 'E', 'n'],
    'in': ['i', 'n'], iang: ['i', 'A', 'ng'], ing: ['i', 'ng'], iong: ['y_medial', 'U', 'ng'],
    u: ['u'], ua: ['u_medial', 'a'], uo: ['u_medial', 'o'], uai: ['u_medial', 'af', 'I'], ui: ['u_medial', 'e', 'I'],
    uan: ['u_medial', 'af', 'n'], un: ['u_medial', '@', 'n'], uang: ['u_medial', 'A', 'ng'], ueng: ['u_medial', '7', 'ng'],
    v: ['y'], ve: ['y_ue', 'E'], van: ['y_medial', 'E', 'n'], vn: ['y', 'n'],
    '1': ['1'], '1r': ['1r']
  };
  function normalizeZhSyllable(py) {
    return py.replace(/[1-5]$/, '').toLowerCase().replace(/ü/g, 'v').replace(/u:/g, 'v');
  }
  function zhSyllable(py, strict) {
    py = normalizeZhSyllable(py);
    if (/^(m|n|ng)$/.test(py)) return [py];
    var ini = '', fin = py;
    for (var i = 0; i < ZH_INIT.length; i++) {
      var t = ZH_INIT[i];
      if (py.indexOf(t) === 0 && py.length > t.length) { ini = t; fin = py.slice(t.length); break; }
    }
    var out = [];
    if (ini === 'y') {
      if (fin === 'i') { return ['i']; }
      if (fin === 'e') { return ZH_FIN.ie.slice(); }
      if (fin === 'an') { return ZH_FIN.ian.slice(); } // yan = i + ɛ + n，不是 ya + n
      if (fin === 'ong') { return ZH_FIN.iong.slice(); }
      if (fin === 'in') { return ['i', 'n']; }
      if (fin === 'ing') { return ['i', 'ng']; }
      if (fin === 'u') { return ['y']; }
      if (fin === 'ue') { return ZH_FIN.ve.slice(); }
      if (fin === 'uan') { return ZH_FIN.van.slice(); }
      if (fin === 'un') { return ['y', 'n']; }
      out = ['jj'];
    } else if (ini === 'w') {
      if (fin === 'u') { return ['u']; }
      // 试听反馈：wo 加短 U 圆唇过渡，长音仍落在 o；其他 w 音节沿用原映射。
      if (fin === 'o') { return ['w', 'U', 'o']; }
      out = ['w'];
    } else if (ini) {
      out = ZH_INIT_MAP[ini].slice();
      // j/q/x 后的 u 实为 ü；l/t 等声母后的 uan 仍保留 u + a + n。
      if (ini === 'j' || ini === 'q' || ini === 'x') fin = fin.replace(/^u/, 'v');
      // 字典兼容 nue/lue；显式 nüe/lüe、nve/lve 也走同一韵母。
      if ((ini === 'n' || ini === 'l') && fin === 'ue') fin = 've';
    }
    // 舌尖元音
    if (fin === 'i') {
      if (ini === 'z' || ini === 'c' || ini === 's') fin = '1';
      else if (ini === 'zh' || ini === 'ch' || ini === 'sh' || ini === 'r') fin = '1r';
    }
    // 唇音后的 o 实读 uo：波 [puɔ]、莫 [muɔ]。没有圆唇过渡的单 o 在长音里与 ou 的主元音难分。
    if (fin === 'o' && (ini === 'b' || ini === 'p' || ini === 'm' || ini === 'f')) return out.concat(['u_labial', 'o_lab']);
    var f = Object.hasOwn(ZH_FIN, fin) ? ZH_FIN[fin] : null;
    if (!f) return strict ? null : out.concat('@');
    return out.concat(f);
  }

  // DV vowel aliases can name either a final or its zero-initial pinyin spelling.
  var DV_ZH_FINALS = {
    yi: 'i', ya: 'ia', ye: 'ie', yao: 'iao', you: 'iu', yan: 'ian', yin: 'in',
    yang: 'iang', ying: 'ing', yong: 'iong', yu: 'v', yue: 've', yuan: 'van', yun: 'vn',
    wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wei: 'ui', wan: 'uan', wen: 'un',
    wang: 'uang', weng: 'ueng', iou: 'iu', uei: 'ui', uen: 'un', ue: 've', i0: '1', ir: '1r'
  };
  NSG.deepVocalMandarinPhones = function (text, savedReading) {
    text = text.trim();
    var direct = text.match(/^V([a-zA-ZüÜêÊ:]+[0-5]?)$/);
    var swap = text.match(/^([^<>\\]+?)\s*\\?<\s*([a-züê:]+[0-5]?)\s*>$/i);
    if (!direct && !swap) return null;
    var spelling = normalizeZhSyllable(direct ? direct[1] : swap[2].replace(/^V(?=.)/, ''));
    var final = Object.hasOwn(DV_ZH_FINALS, spelling) ? DV_ZH_FINALS[spelling] : spelling;
    if (!Object.hasOwn(ZH_FIN, final)) return null;
    var vowel = ZH_FIN[final];
    if (direct) return vowel.slice();
    var base = swap[1].trim();
    if (/^[\u3400-\u9fff]$/.test(base) && savedReading) base = savedReading.trim();
    var phones = zhSyllable(base, true);
    var vowelStart = phones?.findIndex(id => NSG.phoneOf(id).t === 'V') ?? -1;
    return vowelStart < 0 ? null : phones.slice(0, vowelStart).concat(vowel);
  };

  /* ---------------- 粤语 ---------------- */
  var YUE_INIT = ['gw', 'kw', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'w', 'z', 'c', 's', 'j'];
  var YUE_INIT_MAP = {
    b: ['b'], p: ['ph'], m: ['m'], f: ['f'], d: ['d'], t: ['t_h'], n: ['n'], l: ['l'],
    g: ['g'], k: ['kh'], ng: ['ng'], h: ['h'], gw: ['g', 'w'], kw: ['kh', 'w'], w: ['w'],
    z: ['ts'], c: ['tsh'], s: ['s'], j: ['jj']
  };
  /* 粤语韵母 = 韵腹 +（-i/-u 收尾）+（-m/-n/-ng/-p/-t/-k 韵尾），没有介音。
     第二个元音一律是短收尾（I*_yue / U*_yue / Y2_yue 带 glide），长音落在韵腹。
     短元音 a/ei 的 e/ou 的 o/eo 后接较长收尾，与 aai/aau/oi 的长韵腹短收尾对立。
     入声 -p/-t/-k 不除阻，用闭塞收声变体；i/u 在 -ng/-k 前读松元音 [ɪ ʊ]。 */
  var YUE_NUC = { aa: 'A_yue', a: 'a_yue', e: 'E', i: 'i', o: 'O', u: 'u', oe: 'oe_yue', eo: 'eo_yue', yu: 'y' };
  var YUE_SHORT = { a: 1, eo: 1 };
  var YUE_CODA = { m: 'm', n: 'n', ng: 'ng', p: 'p_cl', t: 't_cl', k: 'k_cl' };
  function yueSyllable(jy) {
    jy = jy.replace(/[1-6]$/, '').toLowerCase();
    // 成音节鼻音：唔 m、五/吴/嗯 ng，以及口语的 hm/hng。
    var syllabic = jy.match(/^(h?)(m|ng)$/);
    if (syllabic) return (syllabic[1] ? ['h'] : []).concat([syllabic[2]]);
    var ini = '', fin = jy;
    for (var i = 0; i < YUE_INIT.length; i++) {
      var t = YUE_INIT[i];
      if (jy.indexOf(t) === 0 && jy.length > t.length) { ini = t; fin = jy.slice(t.length); break; }
    }
    var out = ini ? YUE_INIT_MAP[ini].slice() : [];
    var m = fin.match(/^(aa|oe|eo|yu|a|e|i|o|u)(i|u)?(ng|m|n|p|t|k)?$/);
    if (!m) return out.concat(['@']);
    var nucleus = m[1], glide = m[2] || '', coda = m[3] || '';
    if (nucleus === 'eo' && glide === 'u') return out.concat(['@']);
    var v = YUE_NUC[nucleus];
    if (nucleus === 'e' && glide === 'i') v = 'e_yue';        // ei [ei]，比 e/eng/ek 的 [ɛː] 闭
    if (nucleus === 'o' && glide === 'u') v = 'o_ou';         // ou [ou]，比 o/oi/ong 的 [ɔː] 闭
    if (nucleus === 'i' && /^(ng|k)$/.test(coda)) v = 'I';    // ing/ik [ɪ]
    if (nucleus === 'u' && /^(ng|k)$/.test(coda)) v = 'U';    // ung/uk [ʊ]
    out.push(v);
    if (glide) {
      var short = YUE_SHORT[nucleus] || v === 'e_yue' || v === 'o_ou';
      out.push(nucleus === 'eo' ? 'Y2_yue' : (glide === 'i' ? 'I' : 'U') + (short ? '2' : '') + '_yue');
    }
    if (coda) out.push(YUE_CODA[coda]);
    return out;
  }

  /* ---------------- 闽南语（白话字 / 台罗） ---------------- */
  var NAN_INIT = ['chh', 'tsh', 'ch', 'ts', 'ph', 'th', 'kh', 'ng', 'c', 'p', 'b', 'm', 't', 'n', 'l', 'k', 'g', 'h', 'j', 's', 'z'];
  var NAN_INIT_MAP = {
    // 臺羅 p/t/k 是不送气清音，b/g 是浊音，三者必须分开。
    p: ['b'], ph: ['ph'], b: ['bv'], m: ['m'], t: ['d'], th: ['t_h'], n: ['n'], l: ['l'],
    k: ['g'], kh: ['kh'], g: ['gv'], ng: ['ng'], h: ['h'],
    c: ['ts'], ch: ['tsh'], chh: ['tsh'], ts: ['ts'], tsh: ['tsh'],
    j: ['z_r'], s: ['s'], z: ['z']
  };
  // o 在复韵母与 oh 中保留 ə；单独 o 韵母按用户约定视为 oo（ɔ）。
  var NAN_VOW = { oo: 'O', o: '@', a: 'a', e: 'e', i: 'i', u: 'u' };
  var NAN_PHRASES = { '落雨': ['loh8', 'hoo7'] };
  function normalizeNan(text) {
    return text.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u0357\u0359-\u036f]/g, '')
      .replace(/o[\u0358·]/g, 'oo').replace(/ⁿ/g, 'nn');
  }
  // 韵腹决定歌唱延长位置。ai/au/iau/uai 的 i/u 是韵尾，iu/ui 则保留后者。
  NSG.nanNucleus = function (phones, lang) {
    var nuc = -1;
    for (var i = 0; i < phones.length; i++) if (NSG.phoneOf(phones[i]).t === 'V') nuc = i;
    // 四县腔 iui 的中间 u 是韵腹。
    if (lang === 'hak' && phones[nuc] === 'i' && phones[nuc - 1] === 'u' && phones[nuc - 2] === 'i') return nuc - 1;
    if (nuc > 0 && /^(i|u|I|U)(~)?$/.test(phones[nuc]) &&
        NSG.phoneOf(phones[nuc - 1]).t === 'V' && !/^(i|u|I|U)(~)?$/.test(phones[nuc - 1])) nuc--;
    // m/ng 本身可以充当韵腹；末尾的喉塞不能占走长音。
    if (nuc < 0) for (var n = 0; n < phones.length; n++) if (NSG.phoneOf(phones[n]).t === 'N') nuc = n;
    return nuc;
  };
  function nanSyllable(tl) {
    tl = normalizeNan(tl).replace(/[1-9]$/, '').replace(/hnn$/, 'nnh');
    var checked = /h$/.test(tl);
    if (checked) tl = tl.slice(0, -1);
    if (/^(m|ng)$/.test(tl)) return checked ? [tl, 'q'] : [tl];
    var ini = '', fin = tl;
    for (var i = 0; i < NAN_INIT.length; i++) {
      var t = NAN_INIT[i];
      if (tl.indexOf(t) === 0 && tl.length > t.length) { ini = t; fin = tl.slice(t.length); break; }
    }
    var out = ini ? NAN_INIT_MAP[ini].slice() : [];
    var nasal = false;
    if (/nn$/.test(fin) && fin.length > 2) { nasal = true; fin = fin.slice(0, -2); }
    var coda = '';
    var cm = fin.match(/(ng|m|n|p|t|k)$/);
    if (cm && fin.length > cm[1].length) { coda = cm[1]; fin = fin.slice(0, -cm[1].length); }
    // sng、tng、hm 等：声母后仍可能是韵化鼻音。
    if (/^(m|ng)$/.test(fin)) return out.concat([fin], checked ? ['q'] : []);
    // 白话字 oa/oe/oai 与臺羅 ua/ue/uai 兼容。
    fin = fin.replace(/^o(?=[ae])/, 'u');
    // bo/go/o 等开音节的单独 o 韵母默认同 oo；oh/ooh 与 io 不受影响。
    if (fin === 'o' && !checked && !coda && !nasal) fin = 'oo';
    if (/(?:^|[^o])o$/.test(fin) && (/[pk]$/.test(coda) || /^(m|ng)$/.test(coda) || nasal)) fin += 'o';
    var seq = [];
    var i2 = 0;
    while (i2 < fin.length) {
      var two = fin.substr(i2, 2);
      if (NAN_VOW[two]) { seq.push(NAN_VOW[two]); i2 += 2; continue; }
      var one = NAN_VOW[fin[i2]];
      if (one) { seq.push(one); i2++; continue; }
      if (fin[i2] === 'n' && i2 === fin.length - 1) { seq.push('n'); i2++; continue; }
      i2++;
    }
    if (!seq.length) seq = ['a'];
    // ian 按听辨反馈采用 ein 近似：延长 e，短 i 过渡后收 n。
    // 仅匹配口腔 n 韵尾，iann 的鼻化 a 与 iang/iam/iat 等保持原读。
    if (fin === 'ia' && coda === 'n' && !nasal) seq = ['e', 'i'];
    if (nasal) {
      var nucleus = NSG.nanNucleus(seq);
      var v = seq[nucleus];
      var nv = v + '~';
      if (NSG.PHONES[nv]) seq[nucleus] = nv;
    }
    out = out.concat(seq);
    if (coda) out.push(coda === 'p' || coda === 't' || coda === 'k' ? coda + '_cl' : coda);
    if (checked) out.push('q');
    return out;
  }

  /* ---------------- 四县客语 / 潮州府城音 ---------------- */
  var HAK_TEOCHEW = /^(hak|nan-x-teochew)$/;
  var DIALECT_ROMAN = /[a-zê]+[1-8ˊˇˋ]?/gi;
  var HAK_ONSET = { b: 'b', p: 'ph', m: 'm', f: 'f', v: 'v', d: 'd', t: 't_h', n: 'n',
    l: 'l', g: 'g', k: 'kh', ng: 'ng', h: 'h', z: 'ts', c: 'tsh', s: 's', j: 'ts_j', q: 'tsh_j', x: 'xc' };
  var TEOCHEW_ONSET = { b: 'b', p: 'ph', bh: 'bv', m: 'm', d: 'd', t: 't_h', n: 'n',
    l: 'l', g: 'g', k: 'kh', gh: 'gv', ng: 'ng', h: 'h', z: 'ts', c: 'tsh', r: 'dz', s: 's' };
  var STOP_OR_NASAL = { b: 'p_cl', d: 't_cl', g: 'k_cl', m: 'm', n: 'n', ng: 'ng' };
  var HAK_VOWEL = { a: 'a', e: 'e', i: 'i', o: 'o_vi', u: 'u' };
  var TEOCHEW_VOWEL = { a: 'a', e: 'eu_ko', 'ê': 'e_vi', i: 'i', o: 'o_vi', u: 'u' };

  function hakSyllable(spelling) {
    var stem = spelling.toLowerCase().replace(/[1-8ˊˇˋ]$/, '');
    if (/^(m|n|ng)$/.test(stem)) return [stem];
    var m = /^(ng|[bpmfvdtnlgkhzcsjqx])?(ii|[aeiou]+)(ng|[mnbdg])?$/.exec(stem);
    if (!m) return ['@'];
    // 四县客语 ng 在 i 前腭化为龈腭鼻音 [ɲ]（如「人」ngin5、「二」ngi3）。
    var phones = m[1] ? [m[1] === 'ng' && /^i/.test(m[2]) ? 'ny' : HAK_ONSET[m[1]]] : [];
    if (m[2] === 'ii') phones.push('1'); // 舌尖元音，可接闭音节韵尾，如「食」siid。
    else for (var i = 0; i < m[2].length; i++) phones.push(HAK_VOWEL[m[2][i]]);
    if (m[3]) phones.push(STOP_OR_NASAL[m[3]]);
    return phones;
  }

  function teochewSyllable(spelling) {
    var stem = spelling.toLowerCase().replace(/[1-8]$/, '');
    var syllabic = /^(h?)(ng|m)(h?)$/.exec(stem);
    if (syllabic) return (syllabic[1] ? ['h'] : []).concat(syllabic[2], syllabic[3] ? ['q'] : []);
    var m = /^(bh|gh|ng|[bpmdtnlgkhzcrs])?([aeiouê]+)(ng|m|b|g|n)?(h?)$/.exec(stem);
    if (!m) return ['@'];
    var phones = m[1] ? [TEOCHEW_ONSET[m[1]]] : [];
    var vowels = m[2].replace(/ao/g, 'au'); // 潮拼 ao、iao 以 [u] 收尾。
    for (var i = 0; i < vowels.length; i++) {
      var vowel = TEOCHEW_VOWEL[vowels[i]];
      phones.push(m[3] === 'n' ? vowel + '~' : vowel);
    }
    if (m[3] && m[3] !== 'n') phones.push(STOP_OR_NASAL[m[3]]);
    if (m[4]) phones.push('q');
    return phones;
  }

  /* ---------------- 四川话（成都音） ---------------- */
  var SC_INIT = ['ng', 'ny', 'rz', 'zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'v', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
  var SC_INIT_MAP = {
    b: ['b'], p: ['ph'], m: ['m'], f: ['f'], v: ['v'], d: ['d'], t: ['t_h'], n: ['n'], ny: ['ny'], l: ['l_zh'],
    g: ['g'], k: ['kh'], h: ['h'], ng: ['ng'], j: ['ts_j'], q: ['tsh_j'], x: ['xc'],
    z: ['ts'], zh: ['ts'], c: ['tsh'], ch: ['tsh'], s: ['s'], sh: ['s'],
    r: ['z'], rz: ['z'], y: ['jj'], w: ['w']
  };
  // 成都话：单韵母 e 为前中 [ɛ]（非普通话 ɤ）；o 为纯 [o]（含波/我/喝/角）；
  // 平翘合流、r/rz 为浊擦 [z]、n 在齐撮前腭化为 [ɲ]、-eng/-ing 并入 -en/-in（唇音后 eng 为 ong）、
  // 保留 iai（街/介）、ue（国/阔）、üo（学/药/脚/略）。
  var SC_FIN = {
    a: ['a'], o: ['o'], e: ['E'], 'ê': ['E'], ai: ['af', 'I'], ei: ['e', 'I'], ao: ['Ao', 'U_a'], ou: ['o_ou', 'U_ou'],
    an: ['af', 'n'], en: ['@', 'n'], ang: ['A', 'ng'], eng: ['@', 'n'], ong: ['o', 'ng'], er: ['6'],
    i: ['i'], ia: ['i', 'a'], ie: ['i', 'E'], iai: ['i', 'af', 'I'], iao: ['i', 'Ao', 'U_a'], iu: ['i', 'oU', 'U'],
    ian: ['i', 'E', 'n'], 'in': ['i', 'n'], iang: ['i', 'A', 'ng'], ing: ['i', 'n'], iong: ['y_medial', 'o', 'ng'],
    u: ['u'], ua: ['u_medial', 'a'], uo: ['u_medial', 'o'], ue: ['u_medial', 'E'], uai: ['u_medial', 'af', 'I'],
    ui: ['u_medial', 'e', 'I'], uei: ['u_medial', 'e', 'I'], uan: ['u_medial', 'af', 'n'],
    un: ['u_medial', '@', 'n'], uen: ['u_medial', '@', 'n'], uang: ['u_medial', 'A', 'ng'], ueng: ['u_medial', '@', 'n'],
    v: ['y'], ve: ['y_ue', 'E'], vo: ['y_medial', 'o'], van: ['y_medial', 'E', 'n'], vn: ['y', 'n'],
    '1': ['1']
  };
  function sichuanSyllable(py) {
    py = py.replace(/[1-5]$/, '').toLowerCase().replace(/ü/g, 'v').replace(/u:/g, 'v').replace(/ȵ/g, 'ny');
    if (/^(m|n|ng)$/.test(py)) return [py];
    var ini = '', fin = py;
    for (var i = 0; i < SC_INIT.length; i++) {
      var t = SC_INIT[i];
      if (py.indexOf(t) === 0 && py.length > t.length) { ini = t; fin = py.slice(t.length); break; }
    }
    var out = [];
    if (ini === 'y') {
      if (fin === 'i') return ['i'];
      if (fin === 'e') return SC_FIN.ie.slice();
      if (fin === 'an') return SC_FIN.ian.slice();
      if (fin === 'in' || fin === 'ing') return ['i', 'n'];
      if (fin === 'ong') return SC_FIN.iong.slice();
      if (fin === 'u') return ['y'];
      if (fin === 'ue') return SC_FIN.ve.slice();
      if (fin === 'uo') return SC_FIN.vo.slice();
      if (fin === 'uan') return SC_FIN.van.slice();
      if (fin === 'un') return ['y', 'n'];
      out = ['jj'];
    } else if (ini === 'w') {
      if (fin === 'u') return ['u'];
      if (fin === 'eng') return ['o', 'ng'];
      out = ['w'];
    } else if (ini) {
      if (ini === 'n' && /^[iv]/.test(fin)) out = ['ny'];
      else out = SC_INIT_MAP[ini].slice();
      if (ini === 'j' || ini === 'q' || ini === 'x') fin = fin.replace(/^u/, 'v');
      if ((ini === 'n' || ini === 'l') && fin === 'ue') fin = 've';
      if (/^(b|p|m|f)$/.test(ini) && fin === 'eng') fin = 'ong';
    }
    if (fin === 'i' && /^(z|c|s|zh|ch|sh|r|rz)$/.test(ini)) fin = '1';
    var f = Object.hasOwn(SC_FIN, fin) ? SC_FIN[fin] : null;
    if (!f) return out.concat('@');
    return out.concat(f);
  }

  /* ---------------- 日语 ---------------- */
  var ROMAJI_PH = {
    a: ['a_j'], i: ['i_j'], u: ['u_j'], e: ['e_j'], o: ['o_j'], n: ['N_j'],
    ka: ['k_j', 'a_j'], ki: ['k_j', 'i_j'], ku: ['k_j', 'u_j'], ke: ['k_j', 'e_j'], ko: ['k_j', 'o_j'],
    ga: ['gv', 'a_j'], gi: ['gv', 'i_j'], gu: ['gv', 'u_j'], ge: ['gv', 'e_j'], go: ['gv', 'o_j'],
    sa: ['s', 'a_j'], shi: ['sr', 'i_j'], su: ['s', 'u_j'], se: ['s', 'e_j'], so: ['s', 'o_j'],
    za: ['dz', 'a_j'], ji: ['dz_j', 'i_j'], zu: ['dz', 'u_j'], ze: ['dz', 'e_j'], zo: ['dz', 'o_j'],
    ta: ['t_j', 'a_j'], chi: ['tsh_j', 'i_j'], tsu: ['ts', 'u_j'], te: ['t_j', 'e_j'], to: ['t_j', 'o_j'],
    da: ['dv', 'a_j'], di: ['dz_j', 'i_j'], du: ['dz', 'u_j'], de: ['dv', 'e_j'], do: ['dv', 'o_j'],
    na: ['n', 'a_j'], ni: ['ny', 'i_j'], nu: ['n', 'u_j'], ne: ['n', 'e_j'], no: ['n', 'o_j'],
    ha: ['h', 'a_j'], hi: ['xj', 'i_j'], fu: ['fj', 'u_j'], he: ['h', 'e_j'], ho: ['h', 'o_j'],
    ba: ['bv', 'a_j'], bi: ['bv', 'i_j'], bu: ['bv', 'u_j'], be: ['bv', 'e_j'], bo: ['bv', 'o_j'],
    pa: ['p_j', 'a_j'], pi: ['p_j', 'i_j'], pu: ['p_j', 'u_j'], pe: ['p_j', 'e_j'], po: ['p_j', 'o_j'],
    ma: ['m', 'a_j'], mi: ['m', 'i_j'], mu: ['m', 'u_j'], me: ['m', 'e_j'], mo: ['m', 'o_j'],
    ya: ['jj', 'a_j'], yu: ['jj', 'u_j'], yo: ['jj', 'o_j'],
    ra: ['dx', 'a_j'], ri: ['dx', 'i_j'], ru: ['dx', 'u_j'], re: ['dx', 'e_j'], ro: ['dx', 'o_j'],
    wa: ['w', 'a_j'], wo: ['w', 'o_j'], vu: ['v', 'u_j'],
    kya: ['k_j', 'jj', 'a_j'], kyu: ['k_j', 'jj', 'u_j'], kye: ['k_j', 'jj', 'e_j'], kyo: ['k_j', 'jj', 'o_j'],
    gya: ['gv', 'jj', 'a_j'], gyu: ['gv', 'jj', 'u_j'], gye: ['gv', 'jj', 'e_j'], gyo: ['gv', 'jj', 'o_j'],
    sha: ['sr', 'a_j'], shu: ['sr', 'u_j'], sho: ['sr', 'o_j'], sya: ['sr', 'a_j'], syu: ['sr', 'u_j'], syo: ['sr', 'o_j'],
    cha: ['tsh_j', 'a_j'], chu: ['tsh_j', 'u_j'], cho: ['tsh_j', 'o_j'], tya: ['tsh_j', 'a_j'], tyu: ['tsh_j', 'u_j'], tyo: ['tsh_j', 'o_j'],
    ja: ['zh', 'a_j'], ju: ['zh', 'u_j'], jo: ['zh', 'o_j'], dya: ['zh', 'a_j'], dyu: ['zh', 'u_j'], dyo: ['zh', 'o_j'],
    nya: ['ny', 'a_j'], nyu: ['ny', 'u_j'], nye: ['ny', 'e_j'], nyo: ['ny', 'o_j'],
    hya: ['xj', 'jj', 'a_j'], hyu: ['xj', 'jj', 'u_j'], hye: ['xj', 'jj', 'e_j'], hyo: ['xj', 'jj', 'o_j'],
    mya: ['m', 'jj', 'a_j'], myu: ['m', 'jj', 'u_j'], mye: ['m', 'jj', 'e_j'], myo: ['m', 'jj', 'o_j'],
    rya: ['dx', 'a_j'], ryu: ['dx', 'u_j'], rye: ['dx', 'e_j'], ryo: ['dx', 'o_j'],
    bya: ['bv', 'jj', 'a_j'], byu: ['bv', 'jj', 'u_j'], bye: ['bv', 'jj', 'e_j'], byo: ['bv', 'jj', 'o_j'],
    pya: ['p_j', 'jj', 'a_j'], pyu: ['p_j', 'jj', 'u_j'], pye: ['p_j', 'jj', 'e_j'], pyo: ['p_j', 'jj', 'o_j'],
    /* 外来语组合音：直接接目标元音，不经过原假名的 u / i */
    tsa: ['ts', 'a_j'], tsi: ['ts', 'i_j'], tse: ['ts', 'e_j'], tso: ['ts', 'o_j'],
    fa: ['fj', 'a_j'], fi: ['fj', 'i_j'], fe: ['fj', 'e_j'], fo: ['fj', 'o_j'], fya: ['fj', 'jj', 'a_j'], fyu: ['fj', 'jj', 'u_j'], fyo: ['fj', 'jj', 'o_j'],
    ti: ['t_j', 'i_j'], tu: ['t_j', 'u_j'], thi: ['t_j', 'i_j'], twu: ['t_j', 'u_j'],
    /* di / du 兼容原有的 ぢ / づ，でぃ / どぅ 使用独立键 */
    dhi: ['dv', 'i_j'], dwu: ['dv', 'u_j'],
    tha: ['t_j', 'jj', 'a_j'], thu: ['t_j', 'jj', 'u_j'], the: ['t_j', 'jj', 'e_j'], tho: ['t_j', 'jj', 'o_j'],
    dha: ['dv', 'jj', 'a_j'], dhu: ['dv', 'jj', 'u_j'], dhe: ['dv', 'jj', 'e_j'], dho: ['dv', 'jj', 'o_j'],
    twa: ['t_j', 'w', 'a_j'], twi: ['t_j', 'w', 'i_j'], twe: ['t_j', 'w', 'e_j'], two: ['t_j', 'w', 'o_j'],
    dwa: ['dv', 'w', 'a_j'], dwi: ['dv', 'w', 'i_j'], dwe: ['dv', 'w', 'e_j'], dwo: ['dv', 'w', 'o_j'],
    she: ['sr', 'e_j'], che: ['tsh_j', 'e_j'], je: ['zh', 'e_j'],
    wi: ['w', 'i_j'], we: ['w', 'e_j'],
    kwa: ['k_j', 'w', 'a_j'], kwi: ['k_j', 'w', 'i_j'], kwe: ['k_j', 'w', 'e_j'], kwo: ['k_j', 'w', 'o_j'],
    gwa: ['gv', 'w', 'a_j'], gwi: ['gv', 'w', 'i_j'], gwe: ['gv', 'w', 'e_j'], gwo: ['gv', 'w', 'o_j'],
    va: ['v', 'a_j'], vi: ['v', 'i_j'], ve: ['v', 'e_j'], vo: ['v', 'o_j'], vya: ['v', 'jj', 'a_j'], vyu: ['v', 'jj', 'u_j'], vyo: ['v', 'jj', 'o_j'],
    ye: ['jj', 'e_j']
  };
  /* 训令式 / 日本式 / 入力习惯等罗马字别名 -> 规范 ROMAJI_PH 键；
     ti / tu 保留外来语 てぃ / とぅ 读音（与 thi / twu 一致），避免覆盖现有外来语组合。 */
  var ROMAJI_ALIAS = {
    si: 'shi', syi: 'shi', sye: 'she',
    shya: 'sha', shyu: 'shu', shye: 'she', shyo: 'sho',
    zi: 'ji', zyi: 'ji', jyi: 'ji', dyi: 'di', dzi: 'di', dji: 'ji', dzu: 'du',
    zya: 'ja', zyu: 'ju', zye: 'je', zyo: 'jo',
    jya: 'ja', jyu: 'ju', jye: 'je', jyo: 'jo',
    dye: 'je',
    hu: 'fu',
    tyi: 'chi', tye: 'che',
    cyi: 'chi', cya: 'cha', cyu: 'chu', cye: 'che', cyo: 'cho',
    chya: 'cha', chyu: 'chu', chye: 'che', chyo: 'cho',
    kyi: 'ki', gyi: 'gi', nyi: 'ni', hyi: 'hi', myi: 'mi', ryi: 'ri', byi: 'bi', pyi: 'pi', fyi: 'fi', vyi: 'vi',
    wha: 'wa', whi: 'wi', whe: 'we', who: 'wo',
    qwa: 'kwa', qwi: 'kwi', qwe: 'kwe', qwo: 'kwo'
  };
  (function () {
    var aliases = Object.keys(ROMAJI_ALIAS);
    for (var i = 0; i < aliases.length; i++) {
      ROMAJI_PH[aliases[i]] = ROMAJI_PH[ROMAJI_ALIAS[aliases[i]]];
    }
  })();
  var KANA = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo', 'ん': 'n', 'っ': 'q', 'ー': '-',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa', 'ゔ': 'vu'
  };
  /* 只合并明确支持的两字假名，普通「つあ」仍然是两拍。片假名先归一化后共用此表。 */
  var KANA_COMBO = {
    'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'ふゅ': 'fyu',
    'てぃ': 'thi', 'とぅ': 'twu', 'でぃ': 'dhi', 'どぅ': 'dwu', 'てゅ': 'thu', 'でゅ': 'dhu',
    'しぇ': 'she', 'ちぇ': 'che', 'じぇ': 'je', 'ぢぇ': 'je',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'いぇ': 'ye',
    'くぁ': 'kwa', 'くぃ': 'kwi', 'くぇ': 'kwe', 'くぉ': 'kwo', 'くゎ': 'kwa',
    'ぐぁ': 'gwa', 'ぐぃ': 'gwi', 'ぐぇ': 'gwe', 'ぐぉ': 'gwo', 'ぐゎ': 'gwa',
    'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo', 'ゔゅ': 'vyu'
  };
  (function () {
    var kk = Object.keys(KANA);
    for (var i = 0; i < kk.length; i++) {
      var code = kk[i].charCodeAt(0);
      if (code >= 0x3041 && code <= 0x3096) {
        KANA[String.fromCharCode(code + 0x60)] = KANA[kk[i]];
      }
    }
    KANA['ヴ'] = 'vu';
  })();

  var ROMAJI_SINGLE_CONS = {
    k: 'k_j', s: 's', t: 't_j', c: 'ts', p: 'p_j', b: 'bv', d: 'dv', g: 'gv',
    h: 'h', f: 'fj', m: 'm', r: 'rj', l: 'rj', j: 'zh', v: 'v', w: 'w', y: 'jj', z: 'dz'
  };
  var ROMAJI_SOKUON2 = { tt: 1, pp: 1, kk: 1, ss: 1, cc: 1, dd: 1, gg: 1, bb: 1, zz: 1, jj: 1, ff: 1 };

  function romajiToPhones(rm) {
    rm = rm.toLowerCase().replace(/[^a-z'\-]/g, '');
    var out = [], i = 0;
    while (i < rm.length) {
      var matched = false;
      for (var L = 4; L >= 1; L--) {
        var s = rm.substr(i, L);
        if (s.length < L) continue;
        // 单独的 nn（或辅音前的 nn）视作单个拨音 ん；后接元音/y 时保留第二个 n 作声母。
        if (s === 'nn' && !/[aeiouy]/.test(rm.charAt(i + 2))) {
          out.push('N_j'); i += 2; matched = true; break;
        }
        if (L === 2 && s === 'cl') {
          out.push('cl'); i += 2; matched = true; break;
        }
        if (s === 'tch' || (L === 2 && ROMAJI_SOKUON2[s])) {
          out.push('cl'); i += 1; matched = true; break;
        }
        if (ROMAJI_PH[s]) {
          for (var j = 0; j < ROMAJI_PH[s].length; j++) out.push(ROMAJI_PH[s][j]);
          i += L; matched = true; break;
        }
        if (L === 1) {
          if (s === 'q') { out.push('cl'); i += 1; matched = true; break; }   // 促音
          if (s === '-') {                                                   // 长音：延长上一个元音
            for (var qv = out.length - 1; qv >= 0; qv--) {
              if (NSG.phoneOf(out[qv]).t === 'V') { out.push(out[qv]); break; }
            }
            i += 1; matched = true; break;
          }
          if (ROMAJI_SINGLE_CONS[s]) {
            out.push(ROMAJI_SINGLE_CONS[s]); i += 1; matched = true; break;
          }
        }
      }
      if (!matched) i++;
    }
    return out;
  }

  /* ---------------- 英语 ---------------- */
  var ARP = {
    AA: ['A'], AE: ['ae'], AH: ['V'], AO: ['O'], AW: ['a', 'U'], AY: ['a', 'I'], EH: ['E'], ER: ['3'],
    EY: ['e', 'I'], IH: ['I'], IY: ['i'], OW: ['o', 'U'], OY: ['O', 'I'], UH: ['U'], UW: ['u'],
    B: ['bv'], CH: ['ch_en'], D: ['dv'], DH: ['dh'], F: ['f'], G: ['gv'], HH: ['h'], JH: ['jh_en'],
    K: ['k'], L: ['l'], M: ['m'], N: ['n'], NG: ['ng'], P: ['p'], R: ['rj'], S: ['s'], SH: ['sh'],
    T: ['t'], TH: ['th'], V: ['v'], W: ['w'], Y: ['jj'], Z: ['z'], ZH: ['zh'], DX: ['dx']
  };
  function aspiratedEn(toks, j, initial) {
    if (/^(L|R|W|Y)$/.test(toks[j])) j++;          // play / try / quick
    var m = j < toks.length && toks[j].match(/^([A-Z]+)([0-2])?$/);
    if (!m || !ARP_VOWEL.test(m[1])) return false;
    return initial || m[2] === '1' || m[2] === '2';
  }
  var ARP_VOWEL = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/;
  function normalizeArpTokens(toks) {
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var m = toks[i].match(/^ER([0-2])?$/);
      if (m && i + 1 < toks.length && arpVowel(toks[i + 1])) {
        // CMUdict drops intervocalic R after ER before a vowel (around = ER0 AW1 N D -> @ + rj a U n dv).
        out.push(m[1] === '1' || m[1] === '2' ? toks[i] : 'AH0', 'R');
      } else {
        out.push(toks[i]);
      }
    }
    return out;
  }
  // whole/offset：音节切分时传入整词的音素串和本段起点，送气判断看整词上下文。
  function enWordToPhones(arpabet, stressSensitive, whole, offset) {
    var toks = arpabet.trim().split(/\s+/);
    if (!whole) toks = normalizeArpTokens(toks);
    var out = [], all = whole || toks, base = offset || 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], stress = 0, m = t.match(/^([A-Z]+)([0-2])?$/);
      if (!m) continue;
      if (m[2] !== undefined) stress = +m[2];
      var key = m[1];
      if (key === 'AH' && stress === 0) { out.push('@'); continue; }
      if (key === 'ER' && stress === 0) { out.push('3'); continue; }
      var ph = ARP[key];
      // 英语 p t k 在词首或重读元音前送气（pie /pʰ/），s 之后（spy）不送气。
      var gi = base + i;
      if (/^[PTK]$/.test(key) && gi + 1 < all.length && (gi ? all[gi - 1] : '') !== 'S' && aspiratedEn(all, gi + 1, gi === 0))
        ph = [{ P: 'ph', T: 't_h', K: 'kh' }[key]];
      if (ph) out = out.concat(ph);
    }
    return out;
  }
  // ACE/SVP phoneme overrides use unstressed, often lowercase ARPAbet.
  NSG.englishPhones = function (text) {
    var tokens = String(text || '').trim().toUpperCase().split(/\s+/);
    var aliases = { TR: 'T R', DR: 'D R', MV: 'M', AX: 'AH0' };
    var normalized = [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (aliases[token]) normalized = normalized.concat(aliases[token].split(' '));
      else if (ARP[token.replace(/[0-2]$/, '')]) normalized.push(token);
      else return null; // Never silently drop an unknown phoneme from an override.
    }
    return enWordToPhones(normalized.join(' '));
  };

  function englishKey(text) {
    return String(text).toLowerCase().replace(/[’‘]/g, "'")
      .replace(/^[^a-z']+|[^a-z']+$/g, '').replace(/^'+|'+$/g, '');
  }
  function englishLookup(key) {
    // A render before the async dictionary load must not cache an empty map.
    if (!cache.en && root.NSG_DICT.en) cache.en = makeMap(root.NSG_DICT.en, 'en');
    var d = cache.en;
    if (!d) return undefined;
    return d._enSorted ? lookupEnSorted(d._enSorted, key) : d[key];
  }
  function arpVowel(token) { return /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)[0-2]?$/.test(token); }
  function arpSyllables(arp) {
    var tokens = normalizeArpTokens(arp.trim().split(/\s+/)), vowels = [], cuts = [0];
    tokens.forEach(function (token, i) { if (arpVowel(token)) vowels.push(i); });
    // Maximal legal onset, leaving NG and illegal clusters with the previous vowel.
    var clusters = /^(?:(?:TH|SH|[BDFGKPT]) R|[BFGKPS] L|[BDFGHKLMNPSTVZ] Y|(?:TH|[DGKST]) W|S [FPKT]|S [PKT] R|S [PK] L|S K W)$/;
    for (var i = 1; i < vowels.length; i++) {
      var end = vowels[i], start = end;
      for (var c = vowels[i - 1] + 1; c < end; c++) {
        var onset = tokens.slice(c, end).join(' ');
        if ((end - c === 1 && tokens[c] !== 'NG') || clusters.test(onset)) { start = c; break; }
      }
      cuts.push(start);
    }
    cuts.push(tokens.length);
    return cuts.slice(0, -1).map(function (start, i) { return enWordToPhones(tokens.slice(start, cuts[i + 1]).join(' '), false, tokens, start); });
  }
  NSG.englishSyllables = function (word) {
    var key = englishKey(word), arp = englishLookup(key);
    if (arp) return arpSyllables(arp);
    if (key === 'i') return [['a', 'I']];
    var phones = enLetters(key), groups = [], start = 0, seen = false;
    for (var i = 0; i < phones.length; i++) {
      if (NSG.phoneOf(phones[i]).t !== 'V') continue;
      if (i && /^(a:I|e:I|O:I|a:U|o:U)$/.test(phones[i - 1] + ':' + phones[i])) continue;
      if (seen) { groups.push(phones.slice(start, i)); start = i; }
      seen = true;
    }
    if (phones.length) groups.push(phones.slice(start));
    return groups;
  };
  var EN_LTS = [
    [/^tion/, 'sh @ n'], [/^sion/, 'zh @ n'], [/^ough/, 'O'], [/^igh/, 'a I'],
    [/^th/, 'th'], [/^sh/, 'sh'], [/^ch/, 't sh'], [/^ph/, 'f'], [/^wh/, 'w'],
    [/^ck/, 'k'], [/^qu/, 'k w'], [/^ee/, 'i'], [/^oo/, 'u'], [/^ea/, 'i'], [/^ai/, 'e I'],
    [/^ay/, 'e I'], [/^oa/, 'o U'], [/^ou/, 'a U'], [/^ow/, 'o U'], [/^oi/, 'O I'], [/^oy/, 'O I'],
    [/^ar/, 'A rj'], [/^er/, '3'], [/^ir/, '3'], [/^ur/, '3'], [/^or/, 'O rj'],
    [/^ng/, 'ng'], [/^nk/, 'ng k']
  ];
  function enLetters(word) {
    var w = word.toLowerCase().replace(/[^a-z]/g, '');
    var out = [];
    var i = 0;
    var single = { a: 'ae', e: 'E', i: 'I', o: 'O', u: 'V', b: 'bv', c: 'k', d: 'dv', f: 'f', g: 'gv', h: 'h', j: 'zh', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', q: 'k', r: 'rj', s: 's', t: 't', v: 'v', w: 'w', x: 'k s', y: 'i', z: 'z' };
    while (i < w.length) {
      var hit = false;
      for (var r = 0; r < EN_LTS.length; r++) {
        var m = w.slice(i).match(EN_LTS[r][0]);
        if (m) { out = out.concat(EN_LTS[r][1].split(' ')); i += m[0].length; hit = true; break; }
      }
      if (hit) continue;
      // 词尾辅音 + le（如 tle / ble / ple / dle / gle / cle / zle）：补弱化元音 ə + l，避免丢掉音节核。
      if (i > 0 && w.slice(i) === 'le' && !/[aeiouyl]/.test(w[i - 1])) { out.push('@', 'l'); break; }
      if (w[i] === w[i + 1] && w[i] !== 'x') {
        out = out.concat((single[w[i]] || '').split(' ').filter(Boolean));
        i += 2;
        continue;
      }
      if (w[i] === 'e' && i === w.length - 1 && out.some(function (p) { return NSG.phoneOf(p).t === 'V'; })) { i++; continue; }
      out = out.concat((single[w[i]] || '').split(' ').filter(Boolean));
      i++;
    }
    return out;
  }

  /* ---------------- 朝鲜语（现代谚文 / 分音节 RR 罗马字） ----------------
     Unicode 现代音节 = 19 初声 × 21 中声 × 28 终声。
     规则参考国立国语院罗马字表与常见音变；不推断词素边界及词典例外。 */
  var KO_L = ['g', 'gg', 'n', 'd', 'dd', 'r', 'm', 'b', 'bb', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var KO_V = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  var KO_T = ['', 'g', 'gg', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];
  var KO_ON = { g: ['g'], gg: ['kk_ko'], kk: ['kk_ko'], n: ['n'], d: ['d'], dd: ['tt_ko'], tt: ['tt_ko'],
    r: ['dx'], l: ['l'], m: ['m'], b: ['b'], bb: ['pp_ko'], pp: ['pp_ko'], s: ['s'], ss: ['ss_ko'],
    j: ['ts_j'], jj: ['jj_ko'], ch: ['tsh_j'], k: ['kh'], t: ['t_h'], p: ['ph'], h: ['h'], ng: ['ng'] };
  // 首尔音 ㅐ/ㅔ（及 ㅒ/ㅖ、ㅙ/ㅞ/ㅚ）已合并，统一用 e_ko。
  var KO_VOW = { a: ['a_ko'], ae: ['e_ko'], ya: ['jj', 'a_ko'], yae: ['jj', 'e_ko'], eo: ['eo_ko'], e: ['e_ko'],
    yeo: ['jj', 'eo_ko'], ye: ['jj', 'e_ko'], o: ['o_j'], wa: ['w', 'a_ko'], wae: ['w', 'e_ko'], oe: ['w', 'e_ko'],
    yo: ['jj', 'o_j'], u: ['u_ko'], wo: ['w', 'eo_ko'], we: ['w', 'e_ko'], wi: ['w', 'i'],
    yu: ['jj', 'u_ko'], eu: ['eu_ko'], ui: ['eu_ko', 'i'], i: ['i'] };
  var KO_CLUSTER = { gs: ['g', 's'], nj: ['n', 'j'], nh: ['n', 'h'], lg: ['l', 'g'], lm: ['l', 'm'],
    lb: ['l', 'b'], ls: ['l', 's'], lt: ['l', 't'], lp: ['l', 'p'], lh: ['l', 'h'], bs: ['b', 's'] };
  var KO_FINAL = { g: 'k_cl', gg: 'k_cl', gs: 'k_cl', k: 'k_cl', n: 'n', nj: 'n', nh: 'n',
    d: 't_cl', s: 't_cl', ss: 't_cl', j: 't_cl', ch: 't_cl', t: 't_cl', h: 't_cl',
    l: 'l', lg: 'k_cl', lm: 'm', lb: 'l', ls: 'l', lt: 'l', lp: 'p_cl', lh: 'l',
    m: 'm', b: 'p_cl', bs: 'p_cl', p: 'p_cl', ng: 'ng' };
  var KO_ROM_RE = /^(kk|tt|pp|gg|dd|bb|ss|jj|ch|[gndrlmbsjktph])?(yae|yeo|wae|weo|ae|eo|ye|ya|wa|oe|yo|wo|we|wi|yu|eu|ui|[aeiou])(ng|gg|kk|ss|gs|nj|nh|lg|lm|lb|ls|lt|lp|lh|bs|[gkndtlmbpsjch])?$/;
  var KO_ROM_ONSETS = ['', 'kk', 'tt', 'pp', 'gg', 'dd', 'bb', 'ss', 'jj', 'ch', 'g', 'n', 'd', 'r', 'l', 'm', 'b', 's', 'j', 'k', 't', 'p', 'h'];
  var KO_ROM_VOWELS = ['yae', 'yeo', 'wae', 'weo', 'ae', 'eo', 'ye', 'ya', 'wa', 'oe', 'yo', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'a', 'e', 'i', 'o', 'u'];
  var KO_ROM_CODAS = ['', 'n', 'm', 'l', 'k', 'g', 'p', 'b', 't', 'd', 's', 'ng', 'kk', 'gg', 'ss', 'j', 'ch'];
  function koRomanPush(out, raw, l, v, t, group, phrase) {
    out.push({ text: raw, l: l || '', v: v === 'weo' ? 'wo' : v, t: t === 'kk' ? 'gg' : t || '', group: group, phrase: phrase });
  }
  function splitKoRoman(raw) {
    var lower = raw.toLowerCase(), n = lower.length, fail = new Uint8Array(n + 1);
    function dfs(pos) {
      if (pos === n) return [];
      if (fail[pos]) return null;
      for (var oi = 0; oi < KO_ROM_ONSETS.length; oi++) {
        var on = KO_ROM_ONSETS[oi];
        if (on && lower.indexOf(on, pos) !== pos) continue;
        var vp = pos + on.length;
        for (var vi = 0; vi < KO_ROM_VOWELS.length; vi++) {
          var vw = KO_ROM_VOWELS[vi];
          if (lower.indexOf(vw, vp) !== vp) continue;
          var cp = vp + vw.length;
          for (var ci = 0; ci < KO_ROM_CODAS.length; ci++) {
            var cd = KO_ROM_CODAS[ci];
            if (cd && lower.indexOf(cd, cp) !== cp) continue;
            var next = cp + cd.length;
            var rest = dfs(next);
            if (rest) {
              rest.unshift({ text: raw.slice(pos, next), l: on, v: vw, t: cd });
              return rest;
            }
          }
        }
      }
      fail[pos] = 1;
      return null;
    }
    return dfs(0);
  }
  function koTokens(text) {
    var out = [], re = /[가-힣]+|[a-z]+/gi, match, group = 0, phrase = 0, last = -1;
    text = text.normalize('NFC');
    while ((match = re.exec(text))) {
      group++;
      // 只隔空格的相邻词属于同一短语：跨词仍有鼻音同化（밥 먹어、몇 년）；标点、连字符隔断。
      if (last < 0 || !/^\s+$/.test(text.slice(last, match.index))) phrase++;
      last = match.index + match[0].length;
      if (/[가-힣]/.test(match[0])) {
        Array.from(match[0]).forEach(function (ch) {
          var code = ch.charCodeAt(0) - 0xac00;
          out.push({ text: ch, l: KO_L[Math.floor(code / 588)], v: KO_V[Math.floor(code % 588 / 28)], t: KO_T[code % 28], group: group, phrase: phrase });
        });
      } else {
        // 先按单音节匹配（sa rang hae / han-guk）；连写的 RR 罗马字（saranghae、hanguk）按最大起音切分。
        var m = match[0].toLowerCase().match(KO_ROM_RE);
        if (m) koRomanPush(out, match[0], m[1], m[2], m[3], group, phrase);
        else {
          var parts = splitKoRoman(match[0]);
          if (parts) parts.forEach(function (p) { koRomanPush(out, p.text, p.l, p.v, p.t, group, phrase); });
        }
      }
    }
    return out;
  }
  function koResolve(tokens) {
    var seq = tokens.map(function (s) { return Object.assign({}, s); });
    for (var i = 0; i < seq.length - 1; i++) {
      var a = seq[i], b = seq[i + 1];
      if (a.group !== b.group) {
        // 跨词只做塞音韵尾的鼻音同化；连音、紧音化等仍限于词内。
        var crossFinal = a.t && a.phrase === b.phrase && KO_FINAL[a.t];
        if (/^(n|m)$/.test(b.l) && /^(k_cl|t_cl|p_cl)$/.test(crossFinal)) a.t = { k_cl: 'ng', t_cl: 'n', p_cl: 'm' }[crossFinal];
        continue;
      }
      if (!a.t) continue;
      var cluster = KO_CLUSTER[a.t], hTail = /^(h|nh|lh)$/.test(a.t);
      var aspirate = { g: 'k', d: 't', b: 'p', j: 'ch' };
      if (hTail && aspirate[b.l]) {
        b.l = aspirate[b.l]; a.t = cluster ? cluster[0] : ''; continue;
      }
      if (hTail && b.l === 's') { b.l = 'ss'; a.t = cluster ? cluster[0] : ''; continue; }
      var palYeo = b.v === 'i' || (b.v === 'yeo' && (!b.t || b.t === 'ss'));
      if (b.l === 'h') {
        var tail = cluster ? cluster[1] : null;
        var tailNext = tail ? { g: 'k', b: 'p', j: 'ch', t: 't', p: 'p' }[tail] : '';
        var next = tailNext || { k_cl: 'k', t_cl: 't', p_cl: 'p' }[KO_FINAL[a.t]];
        if (next) {
          b.l = next === 't' && palYeo ? 'ch' : next;
          a.t = tailNext ? cluster[0] : '';
          continue;
        }
      }
      if (!b.l && a.t !== 'ng') {
        if (hTail) { a.t = ''; b.l = cluster ? cluster[0] : ''; }
        else {
          b.l = cluster ? cluster[1] : a.t;
          a.t = cluster ? cluster[0] : '';
          if (palYeo && /^(d|t)$/.test(b.l)) b.l = b.l === 't' ? 'ch' : 'j';
          if (cluster && /^(g|b|l)$/.test(a.t) && b.l === 's') b.l = 'ss';
        }
        continue;
      }
      // ㄼ 例外（第 10 项 다만）：밟- 在辅音前读 [밥]，넓죽-/넓둥-/넓적- 读 [넙]。
      if (a.t === 'lb' && (a.text === '밟' || (a.text === '넓' && /^(적|죽|둥)/.test(b.text)))) {
        a.t = 'b';
      }
      // 用言词干 ㄺ 在 ㄱ 前读 [ㄹ]：맑게 [말께]；名词 닭/탉/흙/칡/슭 仍读 [ㄱㄲ]：닭과 [닥꽈]。
      if (a.t === 'lg' && b.l === 'g' && !/^(닭|탉|흙|칡|슭)$/.test(a.text)) { a.t = 'l'; b.l = 'gg'; continue; }
      // 词干末 ㄵ/ㄻ/ㄼ/ㄽ/ㄾ 后的平音紧音化：앉다 [안따]、젊고 [점꼬]、넓다 [널따]、곬도 [골또]、핥다 [할따]。
      if (/^(nj|lm|lb|ls|lt)$/.test(a.t) && /^(g|d|b|s|j)$/.test(b.l)) {
        b.l = { g: 'gg', d: 'dd', b: 'bb', s: 'ss', j: 'jj' }[b.l]; continue;
      }
      var final = KO_FINAL[a.t];
      if (b.l === 'r' && /^(m|ng|k_cl|t_cl|p_cl)$/.test(final)) b.l = 'n';
      if ((final === 'n' && b.l === 'r') || (final === 'l' && /^(n|r)$/.test(b.l))) { a.t = 'l'; b.l = 'l'; }
      else if (/^(n|m)$/.test(b.l)) {
        a.t = { k_cl: 'ng', t_cl: 'n', p_cl: 'm' }[final] || a.t;
      }
      if (/^(k_cl|t_cl|p_cl)$/.test(KO_FINAL[a.t])) {
        b.l = { g: 'gg', d: 'dd', b: 'bb', s: 'ss', j: 'jj' }[b.l] || b.l;
      }
    }
    return seq.map(function (s, index) {
      var onset = (KO_ON[s.l] || []).slice();
      var palV = /^(i|y|wi)/.test(s.v) || (s.v === 'ui' && tokens[index].l);
      if (s.l === 's' && palV) onset = ['xc'];
      if (s.l === 'ss' && palV) onset = ['ss_i_ko'];
      // 连音后的 ㄹ 是闪音；只有韵尾、ㄹㄹ 使用边音。
      var prev = seq[index - 1];
      if (prev && prev.group === s.group && (!prev.t || /^(m|n|ng|l)$/.test(KO_FINAL[prev.t]))) {
        var voiced = { g: 'gv', d: 'dv', b: 'bv', j: 'dz_j' }[s.l];
        if (voiced) onset = [voiced];
        // 响音之间的 ㅎ 弱化为气声 [ɦ]：전화、은행、결혼、사랑해。
        if (s.l === 'h') onset = ['h_ko'];
      }
      if (s.l === 'l' && !(prev && prev.t === 'l' && prev.group === s.group)) onset = ['dx'];
      // 以辅音字母开头的 ㅢ 读 [i]（희망 [히망]）；不带辅音的 의 保留 [ɰi]，
      // 词中 의（회의 [이]）与属格助词 의（나의 [에]）需词素信息，不自动猜。
      var vow = s.v === 'ui' && tokens[index].l ? ['i'] : KO_VOW[s.v];
      // ㅈ/ㅉ/ㅊ 本身为龈腭音，后接 ㅑ/ㅒ/ㅕ/ㅖ/ㅛ/ㅠ 时不另插 [j] 滑音（져→저、쳐→처）。
      if (/^(j|jj|ch)$/.test(s.l) && vow[0] === 'jj') vow = vow.slice(1);
      var phones = onset.concat(vow);
      if (s.t && KO_FINAL[s.t]) phones.push(KO_FINAL[s.t]);
      return { text: s.text, roman: s.l + s.v + s.t, phones: phones };
    });
  }

  /* ---------------- 越南语（河内音系的规则近似） ----------------
     只去声调组合符；保留 ă/â/ê/ô/ơ/ư 的字母身份，NFC/NFD 同音。
     词调保存在 tone 元数据，不覆盖乐谱音高与 PIT。 */
  var VI_TONE = { '\u0301': 2, '\u0300': 3, '\u0309': 4, '\u0303': 5, '\u0323': 6 };
  var VI_ON = { ngh: ['ng'], ng: ['ng'], nh: ['ny'], ch: ['c_vi'], tr: ['c_vi'], th: ['t_h'],
    ph: ['f'], kh: ['x_vi'], gh: ['gh_vi'], gi: ['z'], qu: ['g', 'w'],
    b: ['bv'], c: ['g'], k: ['g'], d: ['z'], 'đ': ['dv'], g: ['gh_vi'], h: ['h'], l: ['l'],
    m: ['m'], n: ['n'], p: ['b'], r: ['z'], s: ['s'], t: ['d'], v: ['v'], x: ['s'] };
  var VI_VOW = { a: ['a_vi'], 'ă': ['aw_vi'], 'â': ['aa_vi'], e: ['E_vi'], 'ê': ['e_vi'], i: ['i'], y: ['i'],
    o: ['O_vi'], oo: ['O_vi'], 'ô': ['o_vi'], 'ôô': ['o_vi'], 'ơ': ['ow_vi'], u: ['u'], 'ư': ['uw_vi'],
    'iê': ['i', 'at_vi'], 'yê': ['i', 'at_vi'], ia: ['i', 'at_vi'], ya: ['i', 'at_vi'],
    'uô': ['u', 'at_vi'], ua: ['u', 'at_vi'], 'ươ': ['uw_vi', 'at_vi'], 'ưa': ['uw_vi', 'at_vi'] };
  function viSyllable(raw) {
    var tone = 1;
    var word = raw.toLowerCase().normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, function (mark) {
      tone = VI_TONE[mark]; return '';
    }).normalize('NFC');
    var original = word, onset = [], ini = word.match(/^(ngh|nh|ng|ch|tr|th|ph|kh|gh|gi|qu|[bcdđghklmnprstvx])/);
    if (ini) {
      onset = VI_ON[ini[0]].slice(); word = word.slice(ini[0].length);
      // gì/gin/giếng：gi 的 i 也可能承担元音字母，不能连同声母一起吞掉。
      if (ini[0] === 'gi' && (!word || /^ê/.test(word) || !/^[aăâeêioôơuưy]/.test(word))) word = 'i' + word;
    } else onset = ['q_vi']; // 元音开头：河内音有喉塞起音 [ʔ]
    var coda = '', cm = word.match(/(ng|nh|ch|[mnptck])$/);
    if (cm) { coda = cm[1]; word = word.slice(0, -coda.length); }
    var tail = [];
    // uy 是介音 + i（huy、thuỷ、tuỳ、huých），必须在剥离收尾 -y 之前处理。
    if (/^uy/.test(word)) { onset.push('w'); word = word.slice(1); }
    if (word.length > 1 && /[iyou]$/.test(word) && !VI_VOW[word]) {
      var last = word.slice(-1);
      tail = /[iy]/.test(last) ? ['I_vi'] : ['U_vi']; word = word.slice(0, -1);
    }
    // o/u 介音 + 韵腹：hoa, khoẻ, huê, huy, nguyên, luyện。
    if (!VI_VOW[word] && /^[ou]/.test(word) && VI_VOW[word.slice(1)]) {
      onset.push('w'); word = word.slice(1);
    }
    // ay/au 的 a 较短、较央；ay/au/ây/âu 的滑音较长，与 ai/ao 区分。
    var vowel = VI_VOW[word];
    if (word === 'a' && /a[yu]$/.test(original)) vowel = ['aw_vi'];
    if (tail.length && vowel && /^(aw_vi|aa_vi)$/.test(vowel[vowel.length - 1])) tail = [tail[0] === 'I_vi' ? 'I2_vi' : 'U2_vi'];
    if (!vowel) return null; // 无效拼写不伪装成 ə 或无声丢字母。
    var final = { m: 'm', n: 'n', ng: 'ng', nh: 'ny', p: 'p_cl', t: 't_cl', c: 'k_cl', k: 'k_cl', ch: 'c_cl' }[coda];
    // 河内 -nh/-ch 是前化收尾，a/ê 后带 [j] 滑音：anh [ajŋ̟]、ach [ajk̟]、ênh [ejŋ̟]；i 后不另加。
    if (/^(nh|ch)$/.test(coda)) {
      if (word === 'a') vowel = ['aw_vi', 'I_vi'];
      else if (word === 'ê') vowel = ['e_vi', 'I_vi'];
    }
    // 单元音 u/ô/o 后的 -ng/-c 为唇软腭 [ŋ͡m k͡p]（ông、cúc、học）；uô 收在央元音，不圆唇。
    if (/^(ng|c)$/.test(coda) && /^(u|o_vi|O_vi)$/.test(vowel[vowel.length - 1]) && !tail.length) {
      final = coda === 'ng' ? 'ngm_vi' : 'kp_cl';
      // 河内 o/ô 在唇软腭收尾前带 [w] 滑音（không [xowŋ͡m]、học [hɔwk͡p]），与 họp 区分。
      if (vowel[vowel.length - 1] !== 'u') vowel = vowel.concat('U_vi');
    }
    // nh 是硬腭鼻音：除前元音外，释放段补一个短 [j] 过渡，否则与 n 几乎同音（nhà/nà）。
    if (ini && ini[0] === 'nh' && onset.length === 1 && !/^(i|e_vi|E_vi)$/.test(vowel[0])) onset.push('jj');
    return { text: raw, roman: original, tone: tone, phones: onset.concat(vowel, tail, final ? [final] : []) };
  }
  function vietnamese(text) {
    var words = text.normalize('NFC').match(/[a-zA-ZÀ-ỹĐđ]+/g) || [];
    return words.map(viSyllable).filter(Boolean);
  }

  /* ---------------- 人造语言：拉丁拼写 → 音节 ----------------
     Asaxi 依据作者 Phonemes / Orthography / Phonotactics 文档；参见 道本语与Asaxi.md。
     不猜测词法缩合，不把变音符剥掉，不让说话重音覆盖乐谱音高。 */
  var TOK_V = { a: ['a_j'], e: ['e_j'], i: ['i'], o: ['o_j'], u: ['u'] };
  var TOK_C = { p: 'p', t: 't', k: 'k', s: 's', m: 'm', n: 'n', l: 'l', j: 'jj', w: 'w' };
  function tokiWord(word) {
    var lower = word.toLowerCase(), out = [], i = 0;
    // 感叹词 n（“嗯”，Toki Pona Dictionary 收录）：成音节 n，可拖长写成 nnn。
    if (/^n+$/.test(lower)) return [{ text: word, roman: 'n', phones: ['n_tok'], word: word }];
    while (i < lower.length) {
      var start = i, ph = [];
      if (TOK_C[lower[i]]) ph.push(TOK_C[lower[i++]]);
      if (!TOK_V[lower[i]]) return []; // 非法拼写不暗中补央元音
      ph = ph.concat(TOK_V[lower[i++]]);
      if (lower[i] === 'n' && !TOK_V[lower[i + 1]]) { ph.push('n'); i++; }
      out.push({ text: word.slice(start, i), roman: lower.slice(start, i), phones: ph, word: word });
    }
    return out;
  }
  // Asaxi DiffSinger orthography: derived from wik-wav/asaxi-diffsinger (CC0).
  // Keep bank symbols distinct from NSG acoustic IDs. Hints bypass orthography entirely.
  var AX_BASE = {
    a:'a', 'á':'ao', 'å':'aw', 'ă':'ay', e:'e', 'ë':'ey', 'è':'ax', 'ě':'er', i:'i', 'ý':'ih',
    o:'o', 'ỏ':'ow', 'ő':'oy', u:'u', 'ù':'u', 'ů':'uw', b:'b', ch:'ch', d:'d', dh:'dh',
    f:'f', g:'g', h:'h', j:'j', jh:'jh', k:'k', l:'l', m:'m', n:'n', 'ŋ':'ng', 'ń':'ny', ni:'ny',
    p:'p', r:'r', s:'s', sh:'sh', 'ś':'S', si:'S', t:'t', th:'th', v:'v', w:'w', x:'hh',
    z:'z', zh:'zh', c:'ts', dz:'dz', 'ŕ':'dx', "'":'q', mm:'mm', nn:'nn', 'nŋ':'nng', rr:'rr'
  };
  var AX_KEYS = Object.keys(AX_BASE).sort(function (a, b) { return b.length - a.length; });
  var AX_NUCLEUS = /^(a|ao|aw|ay|ax|e|er|ey|i|ih|o|ow|oy|u|uw|yj|mm|nn|nng|xn|rr)$/;
  var AX_STOP = /^(p|t|k|b|d|g|ch|c|dz|jh)$/;
  var AX_CONS = /^(b|ch|d|dh|f|g|h|jh|k|l|m|n|ŋ|p|r|s|sh|ś|t|th|v|z|zh|c|dz|ń|ŕ)$/;
  var AX_OVERRIDES = {
    'shivënwë':'sh i v ey n w ey', 'nåhèshivënwë':'n aw h ax sh i v ey n w ey',
    'shěsonwë':'sh er s o n w ey', 'exåshwë':'e hh aw sh w ey'
  };
  var AX_LETTERS = AX_KEYS.join('');
  // 作者韵律章节用锐音/钝音符标高音拍（tắka、ŕóŕo、mǻmå、xí）。这些符号若不构成 Asaxi 字母，
  // 去掉后按原字母读；á ý ś ń ŕ è 等本身是字母，保持不变。逐字替换，不改变下标。
  function asaxiStripPitchMarks(text) {
    return Array.from(text).map(function (c) {
      if (AX_LETTERS.indexOf(c) >= 0) return c;
      var bare = c.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC');
      return bare.length === c.length && AX_LETTERS.indexOf(bare) >= 0 ? bare : c;
    }).join('');
  }
  function asaxiTokenRecords(word) {
    var lower = asaxiStripPitchMarks(word.toLowerCase().normalize('NFC')), graphemes = [], result = [], i = 0;
    if (AX_OVERRIDES[lower]) return AX_OVERRIDES[lower].split(' ').map(function (token) { return { token: token }; });
    while (i < lower.length) {
      var key = AX_KEYS.filter(function (g) { return lower.slice(i, i + g.length) === g; })[0];
      if (!key) { i++; continue; } // upstream ignores non-graphemes, including pronunciation suffix digits
      graphemes.push({ key: key, start: i, end: i + key.length }); i += key.length;
    }
    function emit(token, first, last) { result.push({ token: token, start: first.start, end: (last || first).end }); }
    for (i = 0; i < graphemes.length; i++) {
      var g = graphemes[i], t = g.key, next = graphemes[i + 1], nextKey = next && next.key;
      if (t === 'ý' && nextKey === 'j' && (!graphemes[i + 2] || !/^[aeiouáåăëèěýỏőùů]$/.test(graphemes[i + 2].key))) {
        emit('yj', g, next); i++; continue;
      }
      if (nextKey === t && !/^(mm|nn|nŋ|rr)$/.test(t)) {
        if (AX_STOP.test(t)) { emit('cl', g); emit(AX_BASE[t], next); }
        else if (/^(si|ni)$/.test(t)) emit(AX_BASE[t], g, next);
        else { emit(AX_BASE[t], g); emit(AX_BASE[t], next); }
        i++; continue;
      }
      if (next && AX_CONS.test(t)) {
        if (nextKey === 'j' && !/^(r|n|s|z|ń|ś|zh)$/.test(t)) { emit(AX_BASE[t] + 'y', g, next); i++; continue; }
        if (nextKey === 'w' && t !== 'r') { emit(AX_BASE[t] + 'w', g, next); i++; continue; }
        if (nextKey === 'x' && /^(p|t|k|ch|c)$/.test(t)) { emit(AX_BASE[t] + 'x', g, next); i++; continue; }
      }
      emit(AX_BASE[t], g);
      if (/^(si|ni)$/.test(t)) emit('i', g);
    }
    if (result.length && result[result.length - 1].token === 'nn') result[result.length - 1].token = 'xn';
    return result;
  }
  NSG.asaxiTokens = function (word) { return asaxiTokenRecords(word).map(function (r) { return r.token; }); };
  var AX_PHONE = {
    a:['a_ax'], ao:['A'], aw:['a_ax','U_ax'], ay:['a_ax','I_ax'], ax:['@'], e:['e_j'], er:['3'],
    ey:['e_j','I_ax'], i:['i'], ih:['I'], o:['o_j'], ow:['o_j','U_ax'], oy:['o_j','I_ax'],
    u:['u_ax'], uw:['u','W_ax'], yj:['I','J_ax'], mm:['m_ax'], nn:['n_ax'], nng:['ng_ax'], xn:['N_ax'], rr:['3'],
    b:['bv'], ch:['ch_en'], d:['dv'], dh:['dh'], dx:['dx'], dz:['dz'], f:['f'], g:['gv'],
    h:['h_ax'], hh:['x_ax'], j:['jj'], y:['jj'], jh:['jh_en'], k:['k'], l:['l'], m:['m'], n:['n'],
    ng:['ng'], ny:['ny'], hy:['xj'], p:['p'], q:['q'], r:['rj'], s:['s'], S:['xc'], sh:['sh'],
    t:['t'], th:['th'], ts:['ts'], c:['ts'], v:['v_ax'], w:['w'], z:['z'], zh:['zh_ax'], cl:['cl_ax'],
    px:['ph'], tx:['t_h'], kx:['kh'], chx:['chx_ax'], tsx:['tsh'], cx:['tsh'], AP:['br'], SP:['SP']
  };
  function asaxiPhone(symbol) {
    var key = symbol.replace(/^asa\//, '');
    if (AX_PHONE[key]) return AX_PHONE[key].slice();
    var base = key.slice(0, -1), tail = key.slice(-1);
    if (/^[wy]$/.test(tail) && AX_PHONE[base] && !AX_NUCLEUS.test(base)) return AX_PHONE[base].concat(tail === 'w' ? ['w'] : ['jj']);
    return null;
  }
  NSG.asaxiPhones = function (hint) {
    var tokens = String(hint || '').trim().split(/\s+/), result = [];
    for (var i = 0; i < tokens.length; i++) {
      var ph = asaxiPhone(tokens[i]);
      if (!ph) return null; // reject the complete override; never drop individual unknown symbols
      result = result.concat(ph);
    }
    return result;
  };
  function asaxiSyllables(records, word) {
    var nuclei = [], cuts = [0];
    records.forEach(function (r, i) { if (AX_NUCLEUS.test(r.token.replace(/^asa\//, ''))) nuclei.push(i); });
    for (var n = 1; n < nuclei.length; n++) {
      var left = nuclei[n - 1], right = nuclei[n], cut = right;
      if (right > left + 1) {
        cut = right - 1;
        while (cut > left + 1 && /^(j|y|w|cl)$/.test(records[cut].token)) cut--;
        if (cut > left + 1 && records[cut - 1].token === 'cl') cut--;
        if (cut > left + 1 && records[cut].token === 'r' && /^(ch|jh|k|f|p)$/.test(records[cut - 1].token)) cut--;
      }
      cuts.push(cut);
    }
    cuts.push(records.length);
    return cuts.slice(0, -1).map(function (cut, index) {
      var group = records.slice(cut, cuts[index + 1]), first = group[0], last = group[group.length - 1];
      if (!first) return null;
      var text = first.start === undefined ? word + (cuts.length > 2 ? '#' + (index + 1) : '') :
        word.slice(first.start, last.end).replace(/\./g, '');
      return { text: text, roman: group.map(function (r) { return r.token; }).join(' '), word: word,
        phones: NSG.asaxiPhones(group.map(function (r) { return r.token; }).join(' ')) };
    }).filter(Boolean);
  }
  function asaxiWord(word) { return asaxiSyllables(asaxiTokenRecords(word), word); }

  // Phonetic hints are whole-lyric overrides. An indexed continuation selects a hint syllable.
  function phoneticHint(text, lang) {
    if (!/^(en|asaxi)$/.test(lang)) return null;
    var match = text.match(/^(.*?)\s*\[([^\]]*)\](?:#([1-9]\d*))?$/);
    if (!match) return null;
    var hint = match[2].trim(), all, syllables;
    if (lang === 'asaxi') {
      all = NSG.asaxiPhones(hint);
      if (all) syllables = asaxiSyllables(hint.split(/\s+/).map(function (t) { return { token: t }; }), match[1]);
    } else {
      all = NSG.englishPhones(hint.replace(/\ben\//g, ''));
      if (all) {
        var arp = hint.replace(/\ben\//g, '').toUpperCase().replace(/\bAX\b/g, 'AH0')
          .replace(/\bTR\b/g, 'T R').replace(/\bDR\b/g, 'D R').replace(/\bMV\b/g, 'M');
        syllables = arpSyllables(arp).map(function (p) { return { phones: p }; });
      }
    }
    if (!all) throw new Error('无法识别音素标注 [' + hint + ']（' + lang + '）');
    var index = match[3] ? +match[3] - 1 : -1;
    return [{ text: text, roman: hint, phones: index < 0 ? all : syllables[Math.min(index, syllables.length - 1)].phones,
      extend: index >= syllables.length, hintSyllables: syllables.map(function (s) { return s.phones; }) }];
  }

  var EO_X = { c: 'ĉ', g: 'ĝ', h: 'ĥ', j: 'ĵ', s: 'ŝ', u: 'ŭ' };
  var EO_PHONE = { a: 'a_j', e: 'e_rom', i: 'i', o: 'o_rom', u: 'u',
    b: 'bv', c: 'ts', ĉ: 'ch_en', d: 'dv', f: 'f', g: 'gv', ĝ: 'jh_en', h: 'h', ĥ: 'x_de',
    j: 'jj', ĵ: 'zh', k: 'g', l: 'l', m: 'm', n: 'n', p: 'b', r: 'rr_es', s: 's', ŝ: 'sh',
    t: 'd', ŭ: 'w', v: 'v', z: 'z' };

  function esperantoWord(word) {
    var spelling = word.toLowerCase().replace(/([cghjsu])x/g, function (_, ch) { return EO_X[ch]; });
    var groups = [];
    spelling.split('-').forEach(function (part) {
      var letters = Array.from(part).filter(function (ch) { return EO_PHONE[ch]; });
      var phones = letters.map(function (ch, i) {
        if (i > 0 && /[aeiou]/.test(letters[i - 1])) {
          if (ch === 'ŭ') return 'U_rom';
          if (ch === 'j' && !/^[aeiou]$/.test(letters[i + 1] || '')) return 'I_rom';
        }
        return EO_PHONE[ch];
      });
      if (!phones.length) return;
      var starts = [0], lastNucleus = -1;
      letters.forEach(function (ch, i) {
        if (!/[aeiou]/.test(ch)) return;
        if (lastNucleus >= 0) {
          var cut = i;
          if (cut > lastNucleus + 1 && !NSG.PHONES[phones[cut - 1]].glide) cut--;
          // Keep stop/fricative + liquid onsets together, e.g. li-bro.
          if (cut > lastNucleus + 1 && /^[lr]$/.test(letters[cut]) && /[bdfgkptv]/.test(letters[cut - 1])) cut--;
          starts.push(cut);
        }
        lastNucleus = i;
      });
      starts.forEach(function (start, i) { groups.push(phones.slice(start, starts[i + 1])); });
    });
    // A poetic apostrophe in place of final -o leaves the stress on the last remaining vowel.
    var stress = Math.max(0, groups.length - (/['’]$/.test(word) ? 1 : 2));
    return groups.map(function (phones, i) {
      return { text: groups.length === 1 ? word : word + '#' + (i + 1), word: word,
        roman: phones.join(' '), phones: phones, stress: i === stress };
    });
  }

  function conlang(text, lang) {
    if (lang === 'xdi8') return xdi8Text(text);
    if (lang === 'tlh') return klingonText(text);
    var words = text.normalize('NFC').match(lang === 'eo' ? /[a-zĉĝĥĵŝŭ]+(?:[-'’][a-zĉĝĥĵŝŭ]+)*['’]?(?:#[1-9]\d*)?/gi :
      lang === 'tok' ? /[a-z]+(?:#[1-9]\d*)?/gi :
      // 词内弯撇号 ’ 是口语缩约记号（s’wo、p’nå），不是喉塞音，也不拆词；词尾 ’ 仍为引号。
      // 字母范围放宽到全部 Unicode 字母，带音高符号的 tắka、ŕóŕo 不再被切成两半。
      /[\p{L}'][\p{L}\p{M}'0-9]*(?:[.’][\p{L}\p{M}'0-9]+)*(?:#[1-9]\d*)?/gu) || [];
    var result = [];
    words.forEach(function (word) {
      var indexed = word.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : word;
      var syllables = lang === 'eo' ? esperantoWord(raw) : lang === 'tok' ? tokiWord(raw) : asaxiWord(raw);
      if (indexed && syllables.length) {
        var index = +indexed[2] - 1, syllable = syllables[Math.min(index, syllables.length - 1)];
        result.push(Object.assign({}, syllable, { text: word, extend: index >= syllables.length }));
      } else result = result.concat(syllables);
    });
    return result;
  }

  /* ---------------- 希顶语（Shidinn / Xdi8） ----------------
     支持聊天字母（Chat Alphabet）、希顶字母 PUA 编码（U+E021–U+E0AD）及汉字输入。
     音值依据希顶语 45 字母体系（29 声母 + 16 韵母）与社区通行的国际音标分析。 */
  var XDI8_CHAT_ALPHABET = ' bpmwjqxynzDsrHNldtgkh45vF7BcfuaoeEAYL62T83V1i';
  var XDI8_INITS = 'bpmwjqxynzDsrHNldtgkh45vF7Bcf';
  var XDI8_FINS = 'aoeEAYL62T83V1';
  var XDI8_INIT_ONSET = {
    b: ['b'], p: ['ph'], m: ['m'], w: ['v_fi'], f: ['f'],
    j: ['ts_j'], q: ['tsh_j'], x: ['xc'], y: ['jj'], n: ['ny'],
    z: ['ts'], D: ['tsh'], s: ['s'], r: ['rj'], H: ['n', 'z'],
    N: ['ng'], l: ['n'], d: ['d'], t: ['t_h'], g: ['g'], k: ['kh'], h: ['x_vi'], '4': [],
    '5': ['ng'], v: ['n'], F: ['d'], '7': ['t_h'], B: ['g'], c: ['kh']
  };
  var XDI8_FIN_MAP = {
    a: ['a'], o: ['o_rom'], e: ['e_rom'],
    Y: ['ae', 'E_off_xd'], L: ['a_j', 'O_off_xd'], '6': ['@', 'U_off_xd'],
    '2': ['ae_nas_xd'], T: ['a_nas_xd'], '8': ['e_nas_xd', 'I_nas_xd'],
    '3': ['at_nas_xd', 'U_nas_xd'], V: ['e_rom', 'I_off_xd']
  };
  function xdPUAToChat(text) {
    return text.replace(/[\ue021-\ue02f\ue031-\ue03f\ue041-\ue08d\ue090-\ue09d\ue0a0-\ue0ad]/g, function (chr) {
      var cc = chr.charCodeAt(0), row = (cc - 0xe020) >> 4;
      var ord = (cc & 15) + Math.floor(row / 3) * 16;
      return XDI8_CHAT_ALPHABET[ord] || '';
    });
  }
  function normalizeXdi8Chat(text) {
    // 去掉大小写前缀（^ ~ ⇧ ⇩）；保留有独立音位的大写字母 ABDEFHLNTVY，其余句首大写还原为小写。
    return xdPUAToChat(text)
      .replace(/[\^~⇧⇩](?=[a-zA-Z1-8])/g, '')
      .replace(/[CGIJKMOPQRSUWXZ]/g, function (c) { return c.toLowerCase(); });
  }
  function xdi8ValidCombo(ini, med, fin) {
    if (!ini) return !med && !!fin;
    var labialized = /^[5vF7Bc]$/.test(ini);
    if (!med) {
      if (!fin) return true;
      if (labialized) return /^[aoeEYL62T83V]$/.test(fin);
      if (/^[jqxynzDsrH]$/.test(ini)) return /^[aoeEAYL62T83V]$/.test(fin);
      return XDI8_FINS.indexOf(fin) >= 0;
    }
    if (med === 'i') {
      if (!fin) return true;
      if (labialized) return /^[aoeYL62T83V]$/.test(fin);
      return /^[aoeAYL62T83V]$/.test(fin);
    }
    if (med === 'u') {
      if (labialized) return false;
      if (/^[wf]$/.test(ini)) return !fin;
      if (!fin) return true;
      if (/^[bpm]$/.test(ini)) return /^[aoeEYL62T83V1]$/.test(fin);
      if (/^[Nldtgkh4]$/.test(ini)) return /^[aoeEYL62T83V]$/.test(fin);
      return /^[aoeYL62T83V]$/.test(fin);
    }
    return false;
  }
  function xdi8SyllablePhones(ini, med, fin) {
    if (!ini) {
      if (fin === 'E' || fin === 'i') return ['jj', 'i'];
      if (fin === 'A') return ['H_fr', 'y'];
      if (fin === 'u') return ['v_fi', 'u'];
      if (fin === '1') return ['eu_ko'];
      return (XDI8_FIN_MAP[fin] || ['@']).slice();
    }
    var onset = XDI8_INIT_ONSET[ini].slice();
    if (!med && !fin) {
      if (/^[bpmw]$/.test(ini)) return onset.concat(['o_rom']);
      if (ini === 'f') return ['f', 'u'];
      if (ini === 'y') return ['v_fi', 'ae', 'E_off_xd'];
      if (/^[jqxn]$/.test(ini)) return onset.concat(['i']);
      if (/^[zDsrH]$/.test(ini)) return onset.concat(['1']);
      if (/^[Nldtgkh4]$/.test(ini)) return onset.concat(['e_rom']);
      return onset.concat(['u']); // 5 v F 7 B c
    }
    // 单个介音作韵母（如 bi=bE, bu=bA）
    if (med && !fin) { fin = med === 'i' ? 'E' : 'A'; med = ''; }
    if (/^[bpm]$/.test(ini)) {
      if (fin === 'E') return onset.concat(['i']);
      if (fin === 'A') return onset.concat([med === 'i' ? 'u_bar_xd' : 'u']);
      if (fin === '1') return onset.concat(['eu_ko']);
      return onset.concat(med === 'i' ? ['jj'] : [], XDI8_FIN_MAP[fin]);
    }
    if (/^[wf]$/.test(ini)) {
      if (fin === 'E') return onset.concat(['r', 'i']);
      if (fin === 'A') return onset.concat([med === 'i' ? '1r' : 'u']);
      if (fin === '1') return onset.concat(['eu_ko']);
      return onset.concat(med === 'i' ? ['r'] : [], XDI8_FIN_MAP[fin]);
    }
    if (/^[jqxyn]$/.test(ini)) {
      if (fin === 'E') return onset.concat(['i']);
      if (fin === 'A') return ini === 'y' ? ['H_fr', 'y'] : onset.concat(['y']);
      if (med === 'u') return (ini === 'y' ? ['H_fr'] : onset.concat(['w'])).concat(XDI8_FIN_MAP[fin]);
      return onset.concat(XDI8_FIN_MAP[fin]);
    }
    if (/^[zDsrH]$/.test(ini)) {
      if (fin === 'E') return onset.concat(['1']);
      if (fin === 'A') return onset.concat(['u']);
      return onset.concat(med === 'u' ? ['w'] : [], XDI8_FIN_MAP[fin]);
    }
    if (/^[Nldtgkh4]$/.test(ini)) {
      if (fin === 'E') {
        if (med === 'u') return (ini === '4' ? ['H_fr'] : /^[Ngk]$/.test(ini) ? onset.concat(['w', 'H_fr']) : onset.concat(['w'])).concat(['i']);
        return (/^[Ngkh4]$/.test(ini) ? onset.concat(['jj']) : onset).concat(['i']);
      }
      if (fin === 'A') {
        if (med === 'i') return /^[ldt]$/.test(ini) ? onset.concat(['y']) : (ini === '4' ? ['H_fr', 'u_bar_xd'] : onset.concat(['u_bar_xd']));
        return onset.concat(['u']);
      }
      if (fin === '1') return onset.concat([/^[ldt]$/.test(ini) ? 'I_ro' : 'eu_ko']);
      if (med === 'i') return onset.concat(['jj'], XDI8_FIN_MAP[fin]);
      if (med === 'u') return (ini === '4' ? ['H_fr'] : onset.concat(['w'])).concat(XDI8_FIN_MAP[fin]);
      return onset.concat(XDI8_FIN_MAP[fin]);
    }
    // Labialized alveolar / velar: 5 v F 7 B c
    if (fin === 'E') return onset.concat(/^[5Bc]$/.test(ini) ? ['H_fr', 'i'] : ['w', 'i']);
    return onset.concat(med === 'i' ? ['H_fr'] : ['w'], XDI8_FIN_MAP[fin]);
  }
  function xdi8ChatSyllables(chat, displayWord) {
    var groups = [];
    chat.split(/['’]/).forEach(function (part) {
      var i = 0;
      while (i < part.length) {
        var c0 = part[i], c1 = part[i + 1] || '', c2 = part[i + 2] || '';
        if (XDI8_INITS.indexOf(c0) >= 0) {
          if ((c1 === 'i' || c1 === 'u') && c2 && XDI8_FINS.indexOf(c2) >= 0 && xdi8ValidCombo(c0, c1, c2)) {
            groups.push({ roman: c0 + c1 + c2, phones: xdi8SyllablePhones(c0, c1, c2) });
            i += 3; continue;
          }
          if (c1 && (XDI8_FINS.indexOf(c1) >= 0 || c1 === 'i' || c1 === 'u') &&
              xdi8ValidCombo(c0, (c1 === 'i' || c1 === 'u') ? c1 : '', (c1 === 'i' || c1 === 'u') ? '' : c1)) {
            groups.push({ roman: c0 + c1, phones: xdi8SyllablePhones(c0, (c1 === 'i' || c1 === 'u') ? c1 : '', (c1 === 'i' || c1 === 'u') ? '' : c1) });
            i += 2; continue;
          }
          groups.push({ roman: c0, phones: xdi8SyllablePhones(c0, '', '') });
          i += 1; continue;
        }
        if (XDI8_FINS.indexOf(c0) >= 0 || c0 === 'i' || c0 === 'u') {
          groups.push({ roman: c0, phones: xdi8SyllablePhones('', '', c0) });
          i += 1; continue;
        }
        i += 1;
      }
    });
    return groups.map(function (g, idx) {
      return {
        text: groups.length === 1 ? displayWord : displayWord + '#' + (idx + 1),
        word: displayWord,
        roman: g.roman,
        phones: g.phones
      };
    });
  }
  function xdi8Word(raw) {
    if (raw.length >= 1 && isHan(raw)) {
      var d = cache.xdi8 || (root.NSG_DICT.xdi8 ? (cache.xdi8 = makeMap(root.NSG_DICT.xdi8, 'xdi8')) : {});
      var chat = d[raw];
      if (!chat) return [{ text: raw, word: raw, roman: '?', phones: ['@'] }];
      return xdi8ChatSyllables(chat, raw);
    }
    var norm = normalizeXdi8Chat(raw);
    return xdi8ChatSyllables(norm, raw);
  }
  function xdi8Text(text) {
    var result = [];
    // 匹配单个汉字（可带 #n 续接号）或希顶字母/聊天字母词（可含 PUA、大小写前缀、隔音撇号、#n）
    var re = /(?:[\u3400-\u9fff\u3007]|[\ud840-\ud888][\udc00-\udfff])(?:#[1-9]\d*)?|(?:[a-zA-Z1-8\ue021-\ue02f\ue031-\ue03f\ue041-\ue08d\ue090-\ue09d\ue0a0-\ue0ad'’^~⇧⇩]+(?:#[1-9]\d*)?)/g;
    var words = text.match(re) || [];
    words.forEach(function (entry) {
      var indexed = entry.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : entry;
      var syllables = xdi8Word(raw);
      if (!syllables.length) return;
      if (indexed) {
        var index = +indexed[2] - 1, syllable = syllables[Math.min(index, syllables.length - 1)];
        result.push(Object.assign({}, syllable, { text: entry, extend: index >= syllables.length }));
      } else result = result.concat(syllables);
    });
    return result;
  }

  /* ---------------- 克林贡语（Klingon / tlhIngan Hol） ----------------
     依据 Marc Okrand《The Klingon Dictionary》标准音系（21 辅音 + 5 元音），
     支持标准大小写拉丁转写与 pIqaD CSUR 私有区编码（U+F8D0–U+F8E9）。
     区分 q (/qʰ/) 与 Q (/q͡χ/)，以及 ngh (n+gh) 与 ngH (ng+H)；
     音节结构为 CV(C) 或 CVCC（-rgh、-w'、-y'），不含复声母。 */
  var TLH_PIQAD = [
    'a', 'b', 'ch', 'D', 'e', 'gh', 'H', 'I', 'j', 'l', 'm', 'n', 'ng',
    'o', 'p', 'q', 'Q', 'r', 'S', 't', 'tlh', 'u', 'v', 'w', 'y', "'"
  ];
  var TLH_VOWEL = { a: 'a_tlh', e: 'e_tlh', I: 'I_tlh', o: 'o_tlh', u: 'u_tlh' };
  var TLH_CONS = {
    b: 'bv', ch: 'ch_en', D: 'D_tlh', gh: 'gh_tlh', H: 'H_tlh', j: 'jh_en',
    l: 'l', m: 'm', n: 'n', ng: 'ng', p: 'ph', q: 'q_tlh', Q: 'Q_tlh',
    r: 'r_tlh', S: 'sr', t: 't_h', tlh: 'tlh_tlh', v: 'v', w: 'w', y: 'jj', "'": 'q'
  };
  var TLH_SINGLE = {
    a: 'a', A: 'a', e: 'e', E: 'e', I: 'I', i: 'I', o: 'o', O: 'o', u: 'u', U: 'u',
    b: 'b', B: 'b', D: 'D', d: 'D', H: 'H', h: 'H', j: 'j', J: 'j',
    l: 'l', L: 'l', m: 'm', M: 'm', n: 'n', N: 'n', p: 'p', P: 'p',
    q: 'q', Q: 'Q', r: 'r', R: 'r', S: 'S', s: 'S', t: 't', T: 't',
    v: 'v', V: 'v', w: 'w', W: 'w', y: 'y', Y: 'y', "'": "'"
  };
  function tlhPiqadToLatin(text) {
    return text
      .replace(/[\uf8d0-\uf8e9]/g, function (chr) { return TLH_PIQAD[chr.charCodeAt(0) - 0xf8d0] || ''; })
      .replace(/\uf8fd/g, ', ')
      .replace(/\uf8fe/g, '. ')
      .replace(/[’‘ʼʔ]/g, "'");
  }
  function klingonGraphemes(part) {
    var out = [], i = 0, len = part.length;
    while (i < len) {
      var s3 = part.slice(i, i + 3), s2 = part.slice(i, i + 2), c0 = part[i];
      if (/^tlh$/i.test(s3)) { out.push('tlh'); i += 3; continue; }
      // 规范拼写中 h 仅用于 ch/gh/tlh，H 为独立辅音 /x/；因此 ngh 切为 n + gh，ngH 切为 ng + H。
      if (/^[nN]gh$/.test(s3)) { out.push('n', 'gh'); i += 3; continue; }
      if (/^ch$/i.test(s2)) { out.push('ch'); i += 2; continue; }
      if (/^gh$/i.test(s2)) { out.push('gh'); i += 2; continue; }
      if (/^ng$/i.test(s2)) { out.push('ng'); i += 2; continue; }
      if (TLH_SINGLE[c0]) { out.push(TLH_SINGLE[c0]); i += 1; continue; }
      i += 1;
    }
    return out;
  }
  function klingonSyllablePhones(graphemes) {
    var vIdx = -1;
    for (var k = 0; k < graphemes.length; k++) {
      if (TLH_VOWEL[graphemes[k]]) { vIdx = k; break; }
    }
    var phones = [];
    for (var i = 0; i < graphemes.length; i++) {
      var g = graphemes[i];
      if (TLH_VOWEL[g]) {
        phones.push(TLH_VOWEL[g]);
      } else if (vIdx >= 0 && i === vIdx + 1 && g === 'y') {
        phones.push('I_rom');
      } else if (vIdx >= 0 && i === vIdx + 1 && g === 'w') {
        phones.push(graphemes[vIdx] === 'u' ? 'w' : 'U_rom');
      } else if (TLH_CONS[g]) {
        phones.push(TLH_CONS[g]);
      }
    }
    return phones;
  }
  function klingonWord(raw) {
    var latin = tlhPiqadToLatin(raw);
    var groups = [];
    latin.split('-').forEach(function (part) {
      var gs = klingonGraphemes(part);
      if (!gs.length) return;
      var vowels = [];
      for (var i = 0; i < gs.length; i++) if (TLH_VOWEL[gs[i]]) vowels.push(i);
      if (!vowels.length) {
        groups.push({ roman: gs.join(''), phones: klingonSyllablePhones(gs) });
        return;
      }
      var starts = [0];
      for (var v = 1; v < vowels.length; v++) {
        // 克林贡语禁止复声母、音节优先取单辅音声母，故切分点为下一元音前 1 位（无夹辅音则紧贴元音）。
        var cut = vowels[v] > vowels[v - 1] + 1 ? vowels[v] - 1 : vowels[v];
        starts.push(cut);
      }
      for (var s = 0; s < starts.length; s++) {
        var slice = gs.slice(starts[s], starts[s + 1]);
        if (slice.length) groups.push({ roman: slice.join(''), phones: klingonSyllablePhones(slice) });
      }
    });
    return groups.map(function (g, idx) {
      return {
        text: groups.length === 1 ? raw : raw + '#' + (idx + 1),
        word: raw,
        roman: g.roman,
        phones: g.phones
      };
    });
  }
  function klingonText(text) {
    var result = [];
    var re = /[a-zA-Z'’‘ʼʔ\uf8d0-\uf8e9]+(?:-[a-zA-Z'’‘ʼʔ\uf8d0-\uf8e9]+)*(?:#[1-9]\d*)?/g;
    var words = text.normalize('NFC').match(re) || [];
    words.forEach(function (entry) {
      var indexed = entry.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : entry;
      if (!/[a-zA-Z\uf8d0-\uf8e9]/.test(raw)) return;
      var syllables = klingonWord(raw);
      if (!syllables.length) return;
      if (indexed) {
        var index = +indexed[2] - 1, syllable = syllables[Math.min(index, syllables.length - 1)];
        result.push(Object.assign({}, syllable, { text: entry, extend: index >= syllables.length }));
      } else result = result.concat(syllables);
    });
    return result;
  }

  /* ---------------- 德语 ----------------
     The bundled lexicon is compiled from open, attributed Wiktionary IPA.
     Unknown words use spelling rules; proper names and loans may need editing. */
  var DE_IPA = {
    a: 'a_de', 'ɑ': 'aa_de', 'ä': 'a_de', i: 'i_de', 'ɪ': 'I_de', e: 'e_de', 'ɛ': 'E_de',
    o: 'o_de', 'ɔ': 'O_de', u: 'u_de', 'ʊ': 'U_de', y: 'y_de', 'ʏ': 'Y_de',
    'ø': 'oe_de', 'œ': 'OE_de', 'ə': 'at_de', 'ɐ': 'ar_de',
    p: 'p', b: 'bv', t: 't', d: 'dv', k: 'k', g: 'gv', 'ɡ': 'gv',
    f: 'f', v: 'v', s: 's', z: 'z', 'ʃ': 'sh', 'ʒ': 'zh',
    'ç': 'ch_de', x: 'x_de', 'χ': 'x_de', h: 'h', 'ɦ': 'h',
    r: 'r_de', 'ʁ': 'r_de', 'ʀ': 'r_de', 'ɾ': 'dx', l: 'l',
    m: 'm', n: 'n', 'ŋ': 'ng', 'ɱ': 'm', j: 'jj', 'ʔ': 'q',
    w: 'w', 'ɹ': 'rj', 'æ': 'ae', 'ʌ': 'V', 'θ': 'th', 'ð': 'dh'
  };
  function deNucleus(id) { var p = NSG.phoneOf(id); return !p.glide && (p.t === 'V' || p.syllabic); }
  function deSyllables(phones) {
    var nuclei = [], cuts = [0];
    phones.forEach(function (id, i) { if (deNucleus(id)) nuclei.push(i); });
    for (var n = 1; n < nuclei.length; n++) {
      var left = nuclei[n - 1], right = nuclei[n], cut = right;
      while (left + 1 < right && NSG.phoneOf(phones[left + 1]).glide) left++;
      if (right > left + 1) {
        cut = right - 1;
        // Legal German two/three-consonant onsets. A stop before /ç/ stays coda.
        if (cut > left + 1 && /^(?:p|bv|t|dv|k|gv|f|v|sh)$/.test(phones[cut - 1]) &&
            /^(?:r_de|l|jj)$/.test(phones[cut])) cut--;
        if (cut > left + 1 && phones[cut - 1] === 'sh' && /^(?:p|t)$/.test(phones[cut])) cut--;
      }
      cuts.push(cut);
    }
    cuts.push(phones.length);
    return cuts.slice(0, -1).map(function (cut, i) { return phones.slice(cut, cuts[i + 1]); }).filter(function (p) { return p.length; });
  }
  NSG.germanIPA = function (ipa) {
    var raw = String(ipa).normalize('NFC').replace(/[͜͡]/g, '');
    // Wiktionary often omits non-syllabic arc on V+ɐ before syllable boundary or coda consonant (keep V+ɐ after diphthongs and word-finally syllabic).
    raw = raw.replace(/(a[ɪʊ]|[ɔo][ɪʏ])([ːˑ]?)|([aɑäiɪeɛoɔuʊyʏøœ][ːˑ]?)ɐ(?!\u032f)(?=\.?[ˈˌptkbgɡfvszʃʒçxχhʁʀɾlmnŋɱjʔwɹθð])/g,
      function (m, diph, dlen, mono) { return diph ? diph + (dlen || '') : mono + 'ɐ\u032f'; });
    var s = raw.replace(/[ˈˌ.\s\[\]\/()\-]/g, ''), out = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], pair = s.slice(i, i + 2), ids;
      if (/^(aɪ|aʊ|ɔʏ|ɔɪ|oɪ)$/.test(pair)) {
        ids = pair === 'aɪ' ? ['a_de', 'I_glide_de'] : pair === 'aʊ' ? ['a_de', 'U_glide_de'] : ['O_de', pair === 'ɔʏ' ? 'Y_glide_de' : 'I_glide_de'];
        i++;
      } else if (pair === 'pf') { ids = ['pf_de']; i++; }
      else if (pair === 'ts') { ids = ['ts']; i++; }
      else if (pair === 'tʃ') { ids = ['ch_en']; i++; }
      else if (pair === 'dʒ') { ids = ['jh_en']; i++; }
      else if (ch === 'ː' || ch === 'ˑ') {
        if (out[out.length - 1] === 'a_de') out[out.length - 1] = 'aa_de';
        continue;
      } else if (ch === '\u0329' || ch === '\u030d') {
        var last = out[out.length - 1];
        if (!/^(m|n|l|ng)$/.test(last)) return null;
        out[out.length - 1] = last + '_syll_de'; continue;
      } else if (ch === '\u032f') {
        if (out[out.length - 1] === 'ar_de') out[out.length - 1] = 'ar_glide_de';
        continue;
      } else if (ch === 'ʰ' || ch === '\u0325' || ch === '\u032a') continue;
      else if (DE_IPA[ch]) ids = [DE_IPA[ch]];
      else return null; // Unsupported loan phonemes must use fallback, never silently vanish.
      out = out.concat(ids);
    }
    return out.length ? deSyllables(out) : null;
  };
  var DE_COMMON = {
    ich: 'I_de ch_de', dich: 'dv I_de ch_de', mich: 'm I_de ch_de', nicht: 'n I_de ch_de t',
    ist: 'I_de s t', es: 'E_de s', wir: 'v i_de ar_glide_de', ihr: 'i_de ar_glide_de',
    mir: 'm i_de ar_glide_de', dir: 'dv i_de ar_glide_de',
    er: 'e_de ar_glide_de', der: 'dv e_de ar_glide_de', die: 'dv i_de', das: 'dv a_de s',
    du: 'dv u_de', vom: 'f O_de m', ihm: 'i_de m', ihn: 'i_de n',
    und: 'U_de n t', ein: 'a_de I_glide_de n', mein: 'm a_de I_glide_de n',
    'weiß': 'v a_de I_glide_de s', weiss: 'v a_de I_glide_de s',
    liebe: 'l i_de/bv at_de', lieben: 'l i_de/bv at_de n',
    'mädchen': 'm E_de t/ch_de at_de n', 'schön': 'sh oe_de n', schon: 'sh o_de n',
    'für': 'f y_de ar_glide_de', zu: 'ts u_de', ja: 'jj aa_de', nein: 'n a_de I_glide_de n'
  };
  function deFallback(word) {
    var s = word.toLowerCase().replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/(^|[^q])ue/g, '$1ü'), out = [];
    var vowel = /[aeiouyäöüéèêëàáâîïôûù]/;
    for (var i = 0; i < s.length;) {
      var rest = s.slice(i), c = s[i], next = s[i + 1] || '', prev = s[i - 1] || '', emit = [], step = 1;
      var hasPrevVowel = vowel.test(s.slice(0, i));
      if (/^sch/.test(rest)) { emit = ['sh']; step = 3; }
      else if (/^(tsch|dsch)/.test(rest)) { emit = [rest[0] === 't' ? 'ch_en' : 'jh_en']; step = 4; }
      else if (/^ch/.test(rest)) {
        if (i === 0 && /^[aourl]/.test(rest.slice(2))) emit = ['k'];
        else emit = [/[aou]/.test(prev) && !/[eä]u$/.test(s.slice(0, i)) ? 'x_de' : 'ch_de'];
        step = 2;
      }
      else if (/^ck/.test(rest)) { emit = ['k']; step = 2; }
      else if (/^tz/.test(rest)) { emit = ['ts']; step = 2; }
      else if (/^dt/.test(rest)) { emit = ['t']; step = 2; }
      else if (/^ng/.test(rest)) { emit = ['ng']; step = 2; }
      else if (/^nk/.test(rest)) { emit = ['ng', 'k']; step = 2; }
      else if (/^pf/.test(rest)) { emit = ['pf_de']; step = 2; }
      else if (/^ph/.test(rest)) { emit = ['f']; step = 2; }
      else if (/^th/.test(rest)) { emit = ['t']; step = 2; }
      else if (/^qu/.test(rest)) { emit = ['k', 'v']; step = 2; }
      else if (i > 0 && /^tion/.test(rest)) { emit = ['ts', 'i_de', 'o_de', 'n']; step = 4; }
      else if (/^(ei|ai|ey|ay)/.test(rest)) { emit = ['a_de', 'I_glide_de']; step = 2; }
      else if (/^au/.test(rest)) { emit = ['a_de', 'U_glide_de']; step = 2; }
      else if (/^(eu|äu)/.test(rest)) { emit = ['O_de', 'Y_glide_de']; step = 2; }
      else if (/^ie/.test(rest)) { emit = ['i_de']; step = 2; if (s[i + 2] === 'h') step++; }
      else if (rest === 'ig' && i > 0) { emit = ['I_de', 'ch_de']; step = 2; }
      else if (hasPrevVowel && !vowel.test(prev) && /^er(?=$|[nst](?:$|[st]))/.test(rest)) { emit = ['ar_de']; step = 2; }
      else if (vowel.test(c)) {
        var long = !next || next === 'h' || next === c || (next === 'r' && !s[i + 2] && !hasPrevVowel) ||
          (vowel.test(s[i + 2] || '!') && !vowel.test(next));
        var ids = { a: ['a_de', 'aa_de'], e: ['E_de', 'e_de'], i: ['I_de', 'i_de'],
          o: ['O_de', 'o_de'], u: ['U_de', 'u_de'], y: ['Y_de', 'y_de'],
          'ä': ['E_de', 'E_de'], 'ö': ['OE_de', 'oe_de'], 'ü': ['Y_de', 'y_de'],
          'é': ['e_de', 'e_de'], 'è': ['E_de', 'E_de'], 'ê': ['E_de', 'E_de'], 'ë': ['E_de', 'E_de'],
          'à': ['a_de', 'aa_de'], 'á': ['a_de', 'aa_de'], 'â': ['a_de', 'aa_de'],
          'î': ['i_de', 'i_de'], 'ï': ['i_de', 'i_de'], 'ô': ['o_de', 'o_de'], 'û': ['u_de', 'u_de'], 'ù': ['u_de', 'u_de'] };
        var schwaE = c === 'e' && ((hasPrevVowel && !vowel.test(prev) && /^e(?:[nmlst])?$/.test(rest)) ||
          (i === 1 && /^(?:be|ge)/.test(s) && vowel.test(s.slice(4))));
        emit = [schwaE ? 'at_de' : ids[c][long ? 1 : 0]];
        if (next === c || next === 'h') step++;
      } else if (c === 'r') emit = [vowel.test(prev) && !vowel.test(next) ? 'ar_glide_de' : 'r_de'];
      else if (c === 's' && i === 0 && /[pt]/.test(next)) emit = ['sh'];
      else if (c === 's') emit = [next === 's' || !vowel.test(next) ? 's' : 'z'];
      else {
        var map = { b: 'bv', d: 'dv', g: 'gv', p: 'p', t: 't', k: 'k', f: 'f', v: 'f', w: 'v',
          z: 'ts', 'ß': 's', 'ç': 's', j: 'jj', l: 'l', m: 'm', n: 'n', h: 'h', c: 'k' };
        if (c === 'x') emit = ['k', 's'];
        else if (map[c]) emit = [i === s.length - 1 && /[bdg]/.test(c) ? { b: 'p', d: 't', g: 'k' }[c] : map[c]];
        if (next === c) step++;
      }
      if (c === 's' && next === c) step++;
      out = out.concat(emit); i += step;
    }
    return deSyllables(out.length ? out : ['at_de']);
  }
  function germanWord(word) {
    var key = word.toLowerCase().normalize('NFC');
    var dict = root.NSG_DICT.de || {}, entry = DE_COMMON[key] || dict[key];
    return entry ? entry.split('/').map(function (s) { return s.split(' '); }) : deFallback(key);
  }
  function german(text) {
    var words = text.normalize('NFC').match(/[a-zäöüßéèêëàáâîïôûùç]+(?:#[1-9]\d*)?/gi) || [], out = [];
    words.forEach(function (word) {
      var indexed = word.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : word, groups = germanWord(raw);
      var indexes = indexed ? [Math.min(+indexed[2] - 1, groups.length - 1)] : groups.map(function (_, i) { return i; });
      indexes.forEach(function (index) {
        out.push({ text: indexed ? word : groups.length > 1 ? raw + '#' + (index + 1) : raw,
          word: raw, roman: groups[index].join(' '), phones: groups[index].slice(),
          extend: !!indexed && +indexed[2] > groups.length });
      });
    });
    return out;
  }

  /* ---------------- 波兰语（Polish / pl）：规则音素化 ----------------
     6 口腔元音（a, e, i, y, o, u/ó）+ 2 鼻化元音（ą, ę 按后续辅音分化为口腔元音+同部位鼻音、
     边音/半元音前去鼻化、擦音前与词尾保持鼻化元音）+ 齿龈/卷舌/龈腭三套擦音塞擦音 + 词尾清化与逆向/顺向清浊同化。 */
  var PL_VOWEL_CH = { a: 'a_pl', e: 'E_pl', i: 'i_pl', y: 'y_pl', o: 'O_pl', u: 'u_pl', 'ó': 'u_pl', 'ą': 'O_nas_pl', 'ę': 'E_nas_pl' };
  var PL_VOWEL_SEG = { a_pl: 1, E_pl: 1, i_pl: 1, y_pl: 1, O_pl: 1, u_pl: 1, O_nas_pl: 1, E_nas_pl: 1 };
  var PL_DEVOICE = { bv: 'p', dv: 't', gv: 'k', v: 'f', z: 's', zh: 'sh', zx_pl: 'xc', dz: 'ts', dz_r: 'ts_r', dz_j: 'ts_j' };
  var PL_VOICE = { p: 'bv', t: 'dv', k: 'gv', f: 'v', s: 'z', sh: 'zh', xc: 'zx_pl', ts: 'dz', ts_r: 'dz_r', ts_j: 'dz_j', x_pl: null };
  var PL_SONORANT = { m: 1, n: 1, ny: 1, ng: 1, r_pl: 1, l: 1, w: 1, jj: 1 };

  function plCanStartOnset(cluster) {
    if (cluster.length <= 1) return true;
    if (cluster.length > 3) return false;
    var c0 = cluster[0], c1 = cluster[1];
    if (c0 === c1) return false;
    if (cluster.length === 2) {
      if (!PL_SONORANT[c0] && PL_SONORANT[c1]) return true;
      if (/^(s|z|sh|zh|xc|zx_pl)$/.test(c0) && /^(p|t|k|ts|ts_r|ts_j|dz|dz_r|dz_j)$/.test(c1)) return true;
      return false;
    }
    return /^(s|z|sh|zh|xc|zx_pl)$/.test(c0) && !PL_SONORANT[c1] && !!PL_SONORANT[cluster[2]];
  }

  function plSyllables(phones) {
    var vIdx = [];
    for (var i = 0; i < phones.length; i++) {
      if (PL_VOWEL_SEG[phones[i]]) vIdx.push(i);
    }
    if (vIdx.length <= 1) return [phones.slice()];
    var starts = [0];
    for (var k = 0; k < vIdx.length - 1; k++) {
      var v1 = vIdx[k], v2 = vIdx[k + 1];
      var m = v2 - v1 - 1;
      if (m <= 0) {
        starts.push(v2);
      } else if (m === 1) {
        starts.push(v1 + 1);
      } else {
        var cluster = phones.slice(v1 + 1, v2);
        var splitAt = m - 1;
        for (var cand = Math.max(0, m - 3); cand < m; cand++) {
          if (plCanStartOnset(cluster.slice(cand))) { splitAt = cand; break; }
        }
        starts.push(v1 + 1 + splitAt);
      }
    }
    var groups = [];
    for (var g = 0; g < starts.length; g++) {
      var end = g + 1 < starts.length ? starts[g + 1] : phones.length;
      groups.push(phones.slice(starts[g], end));
    }
    return groups;
  }

  function polishSubword(raw) {
    var w = raw.toLowerCase().normalize('NFC').replace(/[^a-ząćęłńóśźż]/g, '');
    if (!w) return [['a_pl']];
    var segs = [];
    var progTag = []; // 标记来自 w 或 rz 的辅音：在清音后顺向清化，不触发前一清音浊化
    var pushSeg = function (id, isWRz) { segs.push(id); progTag.push(!!isWRz); };
    var i = 0;
    while (i < w.length) {
      var s3 = w.slice(i, i + 3), s2 = w.slice(i, i + 2), ch = w[i], next = w[i + 1] || '';
      if (s3 === 'dzi') {
        var afterDzi = w[i + 3] || '';
        if (PL_VOWEL_CH[afterDzi]) {
          pushSeg('dz_j', false);
          if (afterDzi === 'i') { pushSeg('i_pl', false); i += 4; }
          else i += 3;
        } else {
          pushSeg('dz_j', false); pushSeg('i_pl', false); i += 3;
        }
        continue;
      }
      if (s2 === 'si' || s2 === 'zi' || s2 === 'ci' || s2 === 'ni') {
        var palId = { si: 'xc', zi: 'zx_pl', ci: 'ts_j', ni: 'ny' }[s2];
        var afterPal = w[i + 2] || '';
        if (PL_VOWEL_CH[afterPal]) {
          pushSeg(palId, false);
          if (afterPal === 'i') { pushSeg('i_pl', false); i += 3; }
          else i += 2;
        } else {
          pushSeg(palId, false); pushSeg('i_pl', false); i += 2;
        }
        continue;
      }
      if (s2 === 'dz') { pushSeg('dz', false); i += 2; continue; }
      if (s2 === 'dź') { pushSeg('dz_j', false); i += 2; continue; }
      if (s2 === 'dż') { pushSeg('dz_r', false); i += 2; continue; }
      if (s2 === 'cz') { pushSeg('ts_r', false); i += 2; continue; }
      if (s2 === 'sz') { pushSeg('sh', false); i += 2; continue; }
      if (s2 === 'rz') { pushSeg('zh', true); i += 2; continue; }
      if (s2 === 'ch') { pushSeg('x_pl', false); i += 2; continue; }
      if (s2 === 'qu') { pushSeg('k', false); pushSeg('v', true); i += 2; continue; }
      if (ch === 'i' && segs.length > 0 && !PL_VOWEL_SEG[segs[segs.length - 1]] && PL_VOWEL_CH[next]) {
        pushSeg('jj', false);
        if (next === 'i') { pushSeg('i_pl', false); i += 2; }
        else i += 1;
        continue;
      }
      if (PL_VOWEL_CH[ch]) {
        pushSeg(PL_VOWEL_CH[ch], false);
        i++;
        continue;
      }
      if (ch === 'x') { pushSeg('k', false); pushSeg('s', false); i++; continue; }
      var cMap = {
        p: 'p', b: 'bv', t: 't', d: 'dv', k: 'k', g: 'gv', q: 'k',
        f: 'f', w: 'v', v: 'v', s: 's', z: 'z',
        'ś': 'xc', 'ź': 'zx_pl', 'ż': 'zh', h: 'x_pl',
        c: 'ts', 'ć': 'ts_j', m: 'm', n: 'n', 'ń': 'ny',
        l: 'l', 'ł': 'w', r: 'r_pl', j: 'jj'
      };
      if (cMap[ch]) {
        pushSeg(cMap[ch], ch === 'w');
      }
      i++;
    }
    if (!segs.length) return [['a_pl']];

    // Step 1: 顺向清化（w / rz 在清阻碍音后变为 f / sh，例如 twój, kwiat, świat, trzy, przez）。
    for (var p = 1; p < segs.length; p++) {
      if (progTag[p] && PL_VOICE[segs[p - 1]] !== undefined) {
        if (segs[p] === 'v') segs[p] = 'f';
        else if (segs[p] === 'zh') segs[p] = 'sh';
      }
    }
    // Step 2: 词尾阻碍音清化与逆向清浊同化（如 chleb->p, mąż->sh, ławka->fk, prośba->źb, także->gż）。
    for (var t = segs.length - 1; t >= 0; t--) {
      if (PL_DEVOICE[segs[t]]) segs[t] = PL_DEVOICE[segs[t]];
      else if (PL_VOICE[segs[t]] !== undefined) continue;
      else break;
    }
    for (var k = segs.length - 2; k >= 0; k--) {
      var cur = segs[k], nxt = segs[k + 1];
      if (PL_VOICE[nxt] !== undefined) {
        if (PL_DEVOICE[cur]) segs[k] = PL_DEVOICE[cur];
      } else if (PL_DEVOICE[nxt] && !progTag[k + 1]) {
        if (PL_VOICE[cur]) segs[k] = PL_VOICE[cur];
      }
    }
    // Step 3: 鼻元音 ą / ę 按后续辅音分化。
    var resolved = [];
    for (var idx = 0; idx < segs.length; idx++) {
      var seg = segs[idx], nextSeg = segs[idx + 1] || '';
      if (seg === 'O_nas_pl' || seg === 'E_nas_pl') {
        var oral = seg === 'O_nas_pl' ? 'O_pl' : 'E_pl';
        if (nextSeg === 'l' || nextSeg === 'w') {
          resolved.push(oral);
        } else if (nextSeg === 'p' || nextSeg === 'bv') {
          resolved.push(oral, 'm');
        } else if (/^(t|dv|ts|dz|ts_r|dz_r)$/.test(nextSeg)) {
          resolved.push(oral, 'n');
        } else if (nextSeg === 'ts_j' || nextSeg === 'dz_j') {
          resolved.push(oral, 'ny');
        } else if (nextSeg === 'k' || nextSeg === 'gv') {
          resolved.push(oral, 'ng');
        } else {
          resolved.push(seg);
        }
      } else {
        resolved.push(seg);
      }
    }
    return plSyllables(resolved);
  }

  function polishWord(word) {
    var parts = String(word || '').normalize('NFC').split('-').filter(Boolean);
    if (!parts.length) return [['a_pl']];
    var groups = [];
    parts.forEach(function (part) {
      groups = groups.concat(polishSubword(part));
    });
    return groups.length ? groups : [['a_pl']];
  }

  function polish(text) {
    var words = text.normalize('NFC').match(/[a-ząćęłńóśźżà-öø-ÿ]+(?:-[a-ząćęłńóśźżà-öø-ÿ]+)*(?:#[1-9]\d*)?/gi) || [], out = [];
    words.forEach(function (word) {
      var indexed = word.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : word, groups = polishWord(raw);
      var indexes = indexed ? [Math.min(+indexed[2] - 1, groups.length - 1)] : groups.map(function (_, i) { return i; });
      indexes.forEach(function (index) {
        out.push({ text: indexed ? word : groups.length > 1 ? raw + '#' + (index + 1) : raw,
          word: raw, roman: groups[index].join(' '), phones: groups[index].slice(),
          extend: !!indexed && +indexed[2] > groups.length });
      });
    });
    return out;
  }

  /* ---------------- 俄罗斯语（Russian / ru）：规则音素化 ----------------
     支持西里尔字母与拉丁转写输入；识别显式重音符 \u0301、ё、单音节词、高频词表与词尾后缀重音；
     实现非重读元音弱化（аканье: а/о -> at_ru；иканье: е/я -> I_ru）、硬软辅音对立、
     词尾阻碍音清化、逆向清浊同化（в/вь 不触发前一清音浊化）及常见正字法音变。 */
  var RU_VOWEL_CH = { 'а': 1, 'о': 1, 'у': 1, 'э': 1, 'ы': 1, 'я': 1, 'е': 1, 'ё': 1, 'ю': 1, 'и': 1 };
  var RU_SOFT_VOWEL = { 'я': 1, 'е': 1, 'ё': 1, 'ю': 1, 'и': 1 };
  var RU_VOWEL_SEG = { a_ru: 1, o_ru: 1, u_ru: 1, e_ru: 1, i_ru: 1, y_ru: 1, at_ru: 1, I_ru: 1 };
  var RU_PAIR = {
    'п': ['p', 'py_ru'], 'б': ['bv', 'by_ru'],
    'т': ['t', 'ty_ru'], 'д': ['dv', 'dy_ru'],
    'к': ['k', 'ky_ru'], 'г': ['gv', 'gy_ru'],
    'ф': ['f', 'fy_ru'], 'в': ['v', 'vy_ru'],
    'с': ['s', 'sy_ru'], 'з': ['z', 'zy_ru'],
    'х': ['x_ru', 'xy_ru'],
    'м': ['m', 'my_ru'], 'н': ['n', 'ny'],
    'л': ['l_ru', 'ly_ru'], 'р': ['r_ru', 'ry_ru']
  };
  var RU_DEVOICE = {
    bv: 'p', by_ru: 'py_ru', dv: 't', dy_ru: 'ty_ru', gv: 'k', gy_ru: 'ky_ru',
    v: 'f', vy_ru: 'fy_ru', z: 's', zy_ru: 'sy_ru', zh: 'sh'
  };
  var RU_VOICE = {
    p: 'bv', py_ru: 'by_ru', t: 'dv', ty_ru: 'dy_ru', k: 'gv', ky_ru: 'gy_ru',
    f: 'v', fy_ru: 'vy_ru', s: 'z', sy_ru: 'zy_ru', sh: 'zh',
    ts: 'dz', tsh_j: 'dz_j', xc_ru: 'zx_pl', x_ru: null, xy_ru: null
  };
  var RU_SONORANT = { m: 1, my_ru: 1, n: 1, ny: 1, l_ru: 1, ly_ru: 1, r_ru: 1, ry_ru: 1, jj: 1 };
  var RU_STRESS_MAP = {
    'москва': 1, 'привет': 1, 'любовь': 1, 'душа': 1, 'рука': 1, 'река': 1, 'вода': 1, 'земля': 1,
    'зима': 1, 'весна': 1, 'звезда': 1, 'страна': 1, 'война': 1, 'волна': 1, 'луна': 1, 'судьба': 1,
    'мечта': 1, 'слеза': 1, 'глаза': 1, 'слова': 1, 'дела': 1, 'пора': 1, 'гора': 1, 'заря': 1,
    'трава': 1, 'сестра': 1, 'жена': 1, 'она': 1, 'оно': 1, 'они': 1, 'меня': 1, 'тебя': 1,
    'себя': 1, 'его': 1, 'ево': 1, 'него': 1, 'нево': 1, 'кого': 1, 'ково': 1, 'чего': 1, 'чево': 1,
    'того': 1, 'тово': 1, 'всего': 1, 'всево': 1, 'одно': 1, 'одна': 1, 'одни': 1, 'моя': 1, 'мои': 1,
    'твоя': 1, 'твои': 1, 'своя': 1, 'свои': 1, 'когда': 1, 'тогда': 1, 'всегда': 1, 'сюда': 1,
    'туда': 1, 'куда': 1, 'пока': 1, 'вчера': 1, 'нельзя': 1, 'ура': 1, 'добро': 1, 'тепло': 1,
    'светло': 1, 'темно': 1, 'легко': 1, 'лехко': 1, 'давно': 1, 'окно': 1, 'вино': 1, 'кино': 1,
    'письмо': 1, 'кольцо': 1, 'лицо': 1, 'плечо': 1, 'свеча': 1, 'печаль': 1, 'февраль': 1, 'январь': 1,
    'октябрь': 1, 'ноябрь': 1, 'сентябрь': 1, 'декабрь': 1, 'апрель': 1, 'июнь': 1, 'июль': 1, 'король': 1,
    'корабль': 1, 'огонь': 1, 'ладонь': 1, 'гармонь': 1, 'сирень': 1, 'поэт': 1, 'рассвет': 1, 'ответ': 1,
    'совет': 1, 'секрет': 1, 'билет': 1, 'букет': 1, 'портрет': 1, 'куплет': 1, 'мотив': 1, 'припев': 1,
    'романс': 1, 'аккорд': 1, 'оркестр': 1, 'концерт': 1, 'артист': 1, 'певец': 1, 'конец': 1, 'отец': 1,
    'дворец': 1, 'творец': 1, 'мороз': 1, 'вопрос': 1, 'матрос': 1, 'народ': 1, 'восход': 1, 'закат': 1,
    'солдат': 1, 'туман': 1, 'обман': 1, 'роман': 1, 'карман': 1, 'стакан': 1, 'друзья': 1, 'любви': 1,
    'пою': 1, 'живу': 1, 'иду': 1, 'идти': 1, 'найти': 1, 'уйти': 1, 'прийти': 1, 'понять': 1,
    'забыть': 1, 'уснуть': 1, 'вернуть': 1, 'смотреть': 1, 'смотрю': 1, 'лететь': 1, 'лечу': 1, 'летит': 1,
    'летят': 1, 'сидеть': 1, 'сижу': 1, 'сидит': 1, 'стоять': 1, 'стою': 1, 'стоит': 1, 'молчать': 1,
    'молчу': 1, 'молчит': 1, 'звучать': 1, 'звучит': 1, 'кричать': 1, 'кричит': 1, 'дышать': 1, 'дышу': 1,
    'любить': 1, 'люблю': 1, 'зову': 1, 'зовут': 1, 'беру': 1, 'берут': 1,
    'мама': 0, 'папа': 0, 'небо': 0, 'солнце': 0, 'сонце': 0, 'сердце': 0, 'серце': 0,
    'счастье': 0, 'щастье': 0, 'радость': 0, 'песня': 0, 'музыка': 0, 'голос': 0, 'город': 0,
    'ветер': 0, 'вечер': 0, 'утро': 0, 'лето': 0, 'осень': 0, 'море': 0, 'поле': 0, 'воля': 0,
    'доля': 0, 'горе': 0, 'время': 0, 'имя': 0, 'пламя': 0, 'знамя': 0, 'правда': 0, 'завтра': 0,
    'вместе': 0, 'песне': 0, 'песни': 0, 'песню': 0, 'танец': 0, 'палец': 0, 'заяц': 0, 'месяц': 0,
    'камень': 0, 'парень': 0, 'корень': 0, 'берег': 0, 'холод': 0, 'голод': 0, 'золото': 0,
    'дерево': 0, 'облако': 0, 'яблоко': 0, 'зеркало': 0, 'озеро': 0, 'родина': 0, 'женщина': 0,
    'девушка': 0, 'бабушка': 0, 'дедушка': 0, 'солнышко': 0, 'ласточка': 0, 'ноченька': 0, 'реченька': 0,
    'милый': 0, 'милая': 0, 'тихий': 0, 'тихая': 0, 'синий': 0, 'синяя': 0, 'новый': 0, 'новая': 0,
    'старый': 0, 'старая': 0, 'белый': 0, 'белая': 0, 'красный': 0, 'красная': 0, 'русский': 0, 'русская': 0,
    'добрый': 0, 'добрая': 0, 'доброе': 0, 'чистый': 0, 'светлый': 0, 'нежный': 0, 'верный': 0, 'вечный': 0,
    'первый': 0, 'каждый': 0, 'этот': 0, 'эта': 0, 'это': 0, 'эти': 0, 'наша': 0, 'наше': 0, 'наши': 0,
    'ваша': 0, 'ваше': 0, 'ваши': 0, 'только': 0, 'сколько': 0, 'столько': 0, 'очень': 0, 'снова': 0,
    'скоро': 0, 'тихо': 0, 'громко': 0, 'нежно': 0, 'вечно': 0, 'больно': 0, 'можно': 0, 'нужно': 0,
    'надо': 0, 'рядом': 0, 'мимо': 0, 'дома': 0, 'мало': 0, 'много': 0, 'строго': 0, 'поздно': 0,
    'позно': 0, 'рано': 0, 'прямо': 0, 'всюду': 0, 'буря': 0, 'вьюга': 0, 'крылья': 0, 'листья': 0,
    'братья': 0, 'любит': 0, 'любят': 0, 'смотрит': 0, 'смотрят': 0, 'дышит': 0, 'слышать': 0, 'слышу': 0,
    'слышит': 0, 'видеть': 0, 'вижу': 0, 'видит': 0, 'помнить': 0, 'помню': 0, 'помнит': 0, 'верить': 0,
    'верю': 0, 'верит': 0, 'плакать': 0, 'плачу': 0, 'плачет': 0, 'думать': 0, 'думаю': 0, 'знаю': 0, 'делать': 0, 'сделать': 0,
    'знает': 0, 'здравствуйте': 0, 'здраствуйте': 0, 'холодно': 0, 'весело': 0, 'молодость': 0,
    'спасибо': 1, 'сегодня': 1, 'севодня': 1, 'конечно': 1, 'конешно': 1, 'россия': 1, 'дорога': 1,
    'тревога': 1, 'подруга': 1, 'разлука': 1, 'рябина': 1, 'калина': 1, 'малина': 1, 'долина': 1,
    'картина': 1, 'вершина': 1, 'мужчина': 1, 'мущина': 1, 'улыбка': 1, 'ошибка': 1, 'надежда': 1,
    'одежда': 1, 'невеста': 1, 'минута': 1, 'секунда': 1, 'гитара': 1, 'свобода': 1, 'природа': 1,
    'погода': 1, 'работа': 1, 'забота': 1, 'ворота': 1, 'прекрасный': 1, 'прекрасная': 1, 'прекрасно': 1,
    'счастливый': 1, 'щасливый': 1, 'красивый': 1, 'красивая': 1, 'любимый': 1, 'любимая': 1,
    'высокий': 1, 'глубокий': 1, 'широкий': 1, 'надеяться': 1, 'улыбается': 2, 'улыбаца': 2,
    'молоко': 2, 'хорошо': 2, 'далеко': 2, 'высоко': 2, 'глубоко': 2, 'широко': 2, 'тяжело': 2,
    'горячо': 2, 'красота': 2, 'высота': 2, 'доброта': 2, 'теплота': 2, 'темнота': 2, 'пустота': 2,
    'чистота': 2, 'тишина': 2, 'глубина': 2, 'сторона': 2, 'голова': 2, 'голоса': 2, 'небеса': 2,
    'чудеса': 2, 'берега': 2, 'города': 2, 'вечера': 2, 'холода': 2, 'облака': 2, 'серебро': 2,
    'человек': 2, 'пароход': 2, 'небосвод': 2, 'хоровод': 2, 'поворот': 2, 'ветерок': 2, 'голосок': 2,
    'уголок': 2, 'лепесток': 2, 'потолок': 2, 'поцелуй': 2, 'соловей': 2, 'воробей': 2, 'океан': 2,
    'капитан': 2, 'караван': 2, 'ураган': 2, 'молодец': 2, 'говорить': 2, 'говорит': 2, 'говорят': 2,
    'говорю': 2, 'журавли': 2, 'корабли': 2, 'соловьи': 2, 'сыновья': 2, 'одинокий': 2,
    'ничего': 2, 'никого': 2, 'десять': 0, 'память': 0, 'подъезд': 1, 'семья': 1, 'ручьи': 1,
    'кажется': 0, 'нравится': 0, 'надеется': 1,
    'маленький': 0, 'маленькая': 0, 'маленькое': 0, 'маленькие': 0,
    'большой': 1, 'большая': 1, 'большое': 1, 'большого': 1,
    'хороший': 1, 'хорошая': 1, 'хорошее': 1, 'хорошего': 1, 'пожалуйста': 1
  };

  function ruRomanToCyrillic(str) {
    var s = str.toLowerCase();
    var out = '', i = 0;
    var latVowels = { a: 1, e: 1, i: 1, o: 1, u: 1, y: 1 };
    while (i < s.length) {
      if (s[i] === '\u0301') { out += '\u0301'; i++; continue; }
      var s4 = s.slice(i, i + 4), s3 = s.slice(i, i + 3), s2 = s.slice(i, i + 2), ch = s[i];
      if (s4 === 'shch') { out += 'щ'; i += 4; continue; }
      if (s3 === 'sch') { out += 'щ'; i += 3; continue; }
      if (s2 === 'zh') { out += 'ж'; i += 2; continue; }
      if (s2 === 'kh') { out += 'х'; i += 2; continue; }
      if (s2 === 'ts') { out += 'ц'; i += 2; continue; }
      if (s2 === 'ch') { out += 'ч'; i += 2; continue; }
      if (s2 === 'sh') { out += 'ш'; i += 2; continue; }
      if (s2 === 'yu' || s2 === 'ju') { out += 'ю'; i += 2; continue; }
      if (s2 === 'ya' || s2 === 'ja') { out += 'я'; i += 2; continue; }
      if (s2 === 'yo' || s2 === 'jo') { out += 'ё'; i += 2; continue; }
      if (s2 === 'ye' || s2 === 'je') { out += 'е'; i += 2; continue; }
      if (s2 === "''") { out += 'ъ'; i += 2; continue; }
      if (ch === "'" || ch === '’') { out += 'ь'; i++; continue; }
      if (ch === '"') { out += 'ъ'; i++; continue; }
      if (ch === 'y') {
        var prev = i > 0 ? s[i - 1] : '';
        if (latVowels[prev]) out += 'й';
        else out += 'ы';
        i++;
        continue;
      }
      var map = {
        a: 'а', b: 'б', v: 'в', w: 'в', g: 'г', d: 'д', e: 'е', z: 'з',
        i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
        r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', x: 'х', c: 'ц'
      };
      if (map[ch]) out += map[ch];
      i++;
    }
    return out;
  }

  function ruNormalizeOrthography(word) {
    var w = word;
    // 词级特殊读音
    if (/^(ни)?что(\u0301)?(бы?)?$/.test(w)) w = w.replace('чт', 'шт');
    if (/^(коне\u0301?чно|ску\u0301?чно|наро\u0301?чно|яи\u0301?чница|скворе\u0301?чник|пра\u0301?чечная|горчи\u0301?чник)$/.test(w)) {
      w = w.replace('чн', 'шн');
    }
    if (/^(лёгк|легк|мягк|мя\u0301гк|ле\u0301гк)/.test(w)) w = w.replace('гк', 'хк');
    if (/^(легч|мягч|ле\u0301гч|мя\u0301гч)/.test(w)) w = w.replace('гч', 'хч');
    if (w === 'бог' || w === 'бо\u0301г') w = w.replace(/г$/, 'х');
    if (/^(сего\u0301?дня|сего\u0301?дняшн[а-яё\u0301]+|его\u0301?|него\u0301?|кого\u0301?|чего\u0301?|никого\u0301?|ничего\u0301?|того\u0301?|э\u0301?того|всего\u0301?|самого\u0301?|како\u0301?го|тако\u0301?го|одного\u0301?|моего\u0301?|твоего\u0301?|своего\u0301?|на\u0301?шего|ва\u0301?шего|чьего\u0301?)$/.test(w)) {
      w = w.replace(/г(о\u0301?(?:дня(?:шн[а-яё\u0301]+)?)?)$/, 'в$1');
    } else if (w.replace(/\u0301/g, '').length >= 5 && !/^(много|строго|дорого|убого|лого)$/i.test(w.replace(/\u0301/g, ''))) {
      w = w.replace(/([ое]\u0301?)го(\u0301?)$/, '$1во$2');
    }
    // 常见不发音辅音簇与同化
    w = w.replace(/здравств/g, 'здраств')
         .replace(/чувств/g, 'чуств')
         .replace(/солнц/g, 'сонц')
         .replace(/сердц/g, 'серц')
         .replace(/стн/g, 'сн')
         .replace(/здн/g, 'зн')
         .replace(/стл/g, 'сл')
         .replace(/ндск/g, 'нск')
         .replace(/нтск/g, 'нск')
         .replace(/[тд]ц/g, 'ц')
         .replace(/[сз]ш/g, 'ш')
         .replace(/[сз]ж/g, 'ж')
         .replace(/[сз]щ/g, 'щ')
         .replace(/жж/g, 'ж')
         .replace(/шш/g, 'ш')
         .replace(/[сзж]ч/g, 'щ')
         .replace(/[тд]ся$/, 'ца')
         .replace(/ться$/, 'ца');
    return w;
  }

  function ruResolveStress(letters, stressMarks, cleanWord) {
    var vowelPositions = [];
    var yoIdx = -1, explicitIdx = -1;
    for (var i = 0; i < letters.length; i++) {
      if (RU_VOWEL_CH[letters[i]]) {
        var vIdx = vowelPositions.length;
        vowelPositions.push(i);
        if (stressMarks[i]) explicitIdx = vIdx;
        if (letters[i] === 'ё' && yoIdx < 0) yoIdx = vIdx;
      }
    }
    var V = vowelPositions.length;
    if (V <= 1) return 0;
    if (explicitIdx >= 0) return explicitIdx;
    if (yoIdx >= 0) return yoIdx;
    if (RU_STRESS_MAP[cleanWord] !== undefined) return Math.min(RU_STRESS_MAP[cleanWord], V - 1);
    // 词尾构词后缀启发式规则
    if (/(?:ость|ости|остью)$/.test(cleanWord)) return Math.max(0, V - 2);
    if (/(?:ание|ение|ания|ения)$/.test(cleanWord)) return Math.max(0, V - 3);
    if (/(?:овать|евать)$/.test(cleanWord)) return V - 1;
    if (/(?:ывать|ивать)$/.test(cleanWord)) return Math.max(0, V - 3);
    if (/(?:двацать|трицать)$/.test(cleanWord)) return 0;
    if (/нацать$/.test(cleanWord)) return V >= 4 ? 1 : Math.max(0, V - 2);
    if (/(?:ать|ять|еть|ить|уть|ыть|ти|чь)$/.test(cleanWord)) return V - 1;
    if (/(?:ая|яя|ое|ее|ые|ие|ого|его|ово|ево|ому|ему|ую|юю)$/.test(cleanWord) && V >= 3) return V - 3;
    if (/(?:ый|ий|ым|им|ых|их|ом|ем|ой|ей)$/.test(cleanWord) && V >= 2) return V - 2;
    return Math.max(0, V - 2);
  }

  function ruCanStartOnset(cluster) {
    if (cluster.length <= 1) return true;
    if (cluster.length > 3) return false;
    var c0 = cluster[0], c1 = cluster[1];
    if (c0 === c1) return false;
    if (cluster.length === 2) {
      if (!RU_SONORANT[c0] && c1 === 'jj') return true;
      if (/^(p|py_ru|bv|by_ru|t|ty_ru|dv|dy_ru|k|ky_ru|gv|gy_ru|f|fy_ru|v|vy_ru)$/.test(c0) &&
          /^(r_ru|ry_ru|l_ru|ly_ru)$/.test(c1)) return true;
      if (/^(s|sy_ru|z|zy_ru)$/.test(c0) && /^(p|py_ru|t|ty_ru|k|ky_ru|v|vy_ru|ny)$/.test(c1)) return true;
      return false;
    }
    var c2 = cluster[2];
    return /^(s|sy_ru|z|zy_ru|sh|zh)$/.test(c0) &&
      /^(p|py_ru|t|ty_ru|k|ky_ru|bv|by_ru|dv|dy_ru|gv|gy_ru|v|vy_ru)$/.test(c1) &&
      (!!RU_SONORANT[c2] || c2 === 'v' || c2 === 'vy_ru');
  }

  function ruSyllables(phones) {
    var vIdx = [];
    for (var i = 0; i < phones.length; i++) {
      if (RU_VOWEL_SEG[phones[i]]) vIdx.push(i);
    }
    if (vIdx.length <= 1) return [phones.slice()];
    var starts = [0];
    for (var k = 0; k < vIdx.length - 1; k++) {
      var v1 = vIdx[k], v2 = vIdx[k + 1];
      var m = v2 - v1 - 1;
      if (m <= 0) {
        starts.push(v2);
      } else if (m === 1) {
        starts.push(v1 + 1);
      } else {
        var cluster = phones.slice(v1 + 1, v2);
        var splitAt = m - 1;
        for (var cand = Math.max(0, m - 3); cand < m; cand++) {
          if (ruCanStartOnset(cluster.slice(cand))) { splitAt = cand; break; }
        }
        starts.push(v1 + 1 + splitAt);
      }
    }
    var groups = [];
    for (var g = 0; g < starts.length; g++) {
      var end = g + 1 < starts.length ? starts[g + 1] : phones.length;
      groups.push(phones.slice(starts[g], end));
    }
    return groups;
  }

  function russianSubword(raw) {
    // 统一 NFD 后恢复 й 与 ё，同时保留重音符 \u0301
    var norm = String(raw || '').toLowerCase().normalize('NFD')
      .replace(/и\u0306/g, 'й').replace(/е\u0308/g, 'ё');
    if (/[a-z]/.test(norm) && !/[а-яё]/.test(norm)) {
      norm = ruRomanToCyrillic(norm);
    }
    norm = norm.replace(/[^а-яё\u0301]/g, '');
    if (!norm) return [['a_ru']];

    var origClean = norm.replace(/\u0301/g, '');
    var ortho = ruNormalizeOrthography(norm);
    var letters = [], stressMarks = [];
    for (var c = 0; c < ortho.length; c++) {
      if (ortho[c] === '\u0301') {
        if (stressMarks.length) stressMarks[stressMarks.length - 1] = true;
      } else {
        letters.push(ortho[c]);
        stressMarks.push(false);
      }
    }
    if (!letters.length) return [['a_ru']];

    var cleanWord = letters.join('');
    var stressVowelIdx = ruResolveStress(letters, stressMarks, RU_STRESS_MAP[origClean] !== undefined ? origClean : cleanWord);

    var segs = [];
    var curVowelIdx = 0;
    for (var i = 0; i < letters.length; i++) {
      var ch = letters[i], prev = i > 0 ? letters[i - 1] : '', next = letters[i + 1] || '';
      if (ch === 'ь' || ch === 'ъ') continue;
      if (RU_VOWEL_CH[ch]) {
        var isStressed = (curVowelIdx === stressVowelIdx);
        curVowelIdx++;
        var afterHardSib = (prev === 'ж' || prev === 'ш' || prev === 'ц');
        var afterSoft = (prev === 'ч' || prev === 'щ' || prev === 'й' || prev === 'ь');
        // 词首、元音后、ь/ъ 后的软元音字母（я, е, ё, ю）及 ь 后的 и 带有 /j/ 介音
        var iotated = (ch === 'я' || ch === 'е' || ch === 'ё' || ch === 'ю') ?
          (!prev || !!RU_VOWEL_CH[prev] || prev === 'ь' || prev === 'ъ') :
          (ch === 'и' && prev === 'ь');
        if (iotated) segs.push('jj');

        if (isStressed) {
          if (ch === 'а' || ch === 'я') segs.push('a_ru');
          else if (ch === 'о' || ch === 'ё') segs.push('o_ru');
          else if (ch === 'у' || ch === 'ю') segs.push('u_ru');
          else if (ch === 'э' || ch === 'е') segs.push('e_ru');
          else if (ch === 'ы') segs.push('y_ru');
          else if (ch === 'и') segs.push(afterHardSib ? 'y_ru' : 'i_ru');
        } else {
          // 非重读元音弱化：аканье (а/о -> at_ru) 与 иканье (е/я -> I_ru)
          if (ch === 'у' || ch === 'ю') segs.push('u_ru');
          else if (ch === 'ы') segs.push('y_ru');
          else if (ch === 'и') segs.push(afterHardSib ? 'y_ru' : 'I_ru');
          else if (ch === 'а' || ch === 'о') {
            segs.push(afterSoft ? 'I_ru' : 'at_ru');
          } else if (ch === 'я' || ch === 'е' || ch === 'ё') {
            segs.push(afterHardSib ? 'y_ru' : 'I_ru');
          } else if (ch === 'э') {
            segs.push('I_ru');
          }
        }
        continue;
      }
      if (ch === 'ж') { segs.push('zh'); continue; }
      if (ch === 'ш') { segs.push('sh'); continue; }
      if (ch === 'ц') { segs.push('ts'); continue; }
      if (ch === 'ч') { segs.push('tsh_j'); continue; }
      if (ch === 'щ') { segs.push('xc_ru'); continue; }
      if (ch === 'й') { segs.push('jj'); continue; }
      if (RU_PAIR[ch]) {
        var soft = !!RU_SOFT_VOWEL[next] || next === 'ь';
        // 辅音簇内的逆向软化（如 с/з 在软 т/д/н/л 前，н 在 ч/щ/软 т/д 前）
        if (!soft && next && (RU_SOFT_VOWEL[letters[i + 2] || ''] || letters[i + 2] === 'ь' || next === 'ч' || next === 'щ')) {
          if ((ch === 'с' || ch === 'з') && /^[тднлсз]$/.test(next)) soft = true;
          else if (ch === 'н' && /^[тдчщ]$/.test(next)) soft = true;
        }
        // 双辅音（如 россия, суббота, аккорд）与后一辅音保持相同软硬并简化为单音段
        if (next === ch) {
          var nextAfter = letters[i + 2] || '';
          soft = !!RU_SOFT_VOWEL[nextAfter] || nextAfter === 'ь';
          i++;
        }
        segs.push(RU_PAIR[ch][soft ? 1 : 0]);
      }
    }
    if (!segs.length) return [['a_ru']];

    // 词尾阻碍音清化（любовь->fy_ru, друг->k, мороз->s, сад->t）
    for (var t = segs.length - 1; t >= 0; t--) {
      if (RU_DEVOICE[segs[t]]) segs[t] = RU_DEVOICE[segs[t]];
      else if (RU_VOICE[segs[t]] !== undefined) continue;
      else break;
    }
    // 逆向清浊同化（все->fsʲe, водка->tk, сделать->zdʲ, просьба->zʲb；в/вь 不触发前一清音浊化，故 свет 保持 svʲ）
    for (var k = segs.length - 2; k >= 0; k--) {
      var cur = segs[k], nxt = segs[k + 1];
      if (RU_VOICE[nxt] !== undefined) {
        if (RU_DEVOICE[cur]) segs[k] = RU_DEVOICE[cur];
      } else if (RU_DEVOICE[nxt] && nxt !== 'v' && nxt !== 'vy_ru') {
        if (RU_VOICE[cur]) segs[k] = RU_VOICE[cur];
      }
    }
    return ruSyllables(segs);
  }

  function russianWord(word) {
    var parts = String(word || '').split('-').filter(Boolean);
    if (!parts.length) return [['a_ru']];
    var groups = [];
    parts.forEach(function (part) {
      groups = groups.concat(russianSubword(part));
    });
    return groups.length ? groups : [['a_ru']];
  }

  function russian(text) {
    var norm = String(text || '').normalize('NFD').replace(/и\u0306/g, 'й').replace(/И\u0306/g, 'Й').replace(/е\u0308/g, 'ё').replace(/Е\u0308/g, 'Ё');
    var words = norm.match(/[а-яёa-z\u0301'’"]+(?:-[а-яёa-z\u0301'’"]+)*(?:#[1-9]\d*)?/gi) || [], out = [];
    words.forEach(function (word) {
      var indexed = word.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : word, groups = russianWord(raw);
      var displayRaw = raw.replace(/\u0301/g, '');
      var indexes = indexed ? [Math.min(+indexed[2] - 1, groups.length - 1)] : groups.map(function (_, i) { return i; });
      indexes.forEach(function (index) {
        out.push({ text: indexed ? word : groups.length > 1 ? displayRaw + '#' + (index + 1) : displayRaw,
          word: displayRaw, roman: groups[index].join(' '), phones: groups[index].slice(),
          extend: !!indexed && +indexed[2] > groups.length });
      });
    });
    return out;
  }

  /* ---------------- 乌克兰语（规则音素器） ---------------- */
  var UK_VOWEL_PH = { 'а': 'a_uk', 'е': 'e_uk', 'и': 'y_uk', 'і': 'i_uk', 'о': 'o_uk', 'у': 'u_uk',
    'я': 'a_uk', 'є': 'e_uk', 'ї': 'i_uk', 'ю': 'u_uk' };
  var UK_VOWEL_CH = /[аеиіоуяєїю]/i;
  var UK_IOTATED = { 'я': 'a_uk', 'є': 'e_uk', 'ї': 'i_uk', 'ю': 'u_uk' };
  var UK_SONORANT = { m: 1, my_ru: 1, n: 1, ny: 1, l_uk: 1, ly_ru: 1, r_uk: 1, ry_ru: 1, jj: 1, v: 1, vy_ru: 1, w: 1 };
  var UK_SOFT_MAP = {
    t: 'ty_ru', dv: 'dy_ru', s: 'sy_ru', z: 'zy_ru', ts: 'ts_j', dz: 'dz_j',
    n: 'ny', l_uk: 'ly_ru', r_uk: 'ry_ru',
    p: 'py_ru', bv: 'by_ru', f: 'fy_ru', v: 'vy_ru', m: 'my_ru',
    k: 'ky_ru', gv: 'gy_ru', x_uk: 'xy_ru'
  };
  var UK_DENTAL_SOFT = { t: 1, dv: 1, s: 1, z: 1, ts: 1, dz: 1, n: 1, l_uk: 1, r_uk: 1 };
  var UK_REGRESSIVE_DENTAL = { t: 1, dv: 1, s: 1, z: 1, ts: 1, dz: 1, n: 1 };
  var UK_VOICED_OBS = { bv: 1, by_ru: 1, dv: 1, dy_ru: 1, gv: 1, gy_ru: 1, z: 1, zy_ru: 1, zh: 1, dz: 1, dz_j: 1, dz_r: 1 };
  var UK_VOICE_MAP = {
    p: 'bv', py_ru: 'by_ru', t: 'dv', ty_ru: 'dy_ru', k: 'gv', ky_ru: 'gy_ru',
    s: 'z', sy_ru: 'zy_ru', sh: 'zh', ts: 'dz', ts_j: 'dz_j', ts_r: 'dz_r'
  };
  var UK_STRESS_MAP = {
    'привіт': 1, 'дякую': 0, 'україна': 2, 'україни': 2, 'україні': 2, 'україну': 2,
    'український': 2, 'українська': 2, 'українське': 2, 'добрий': 0, 'доброго': 0, 'добре': 0,
    'дуже': 0, 'ласка': 0, 'київ': 0, 'києва': 0, 'львів': 0, 'харків': 0, 'одеса': 1,
    'життя': 1, 'серце': 0, 'сонце': 0, 'небо': 0, 'земля': 1, 'вода': 1, 'вогонь': 1,
    'вітер': 0, 'місто': 0, 'слово': 0, 'пісня': 0, 'весна': 1, 'літо': 0, 'осінь': 0, 'зима': 1,
    'любов': 1, 'кохання': 1, 'щастя': 0, 'радість': 0, 'надія': 1, 'свобода': 1, 'воля': 0,
    'слава': 0, 'правда': 0, 'сила': 0, 'дорога': 1, 'зірка': 0, 'місяць': 0, 'ранок': 0,
    'вечір': 0, 'завтра': 0, 'сьогодні': 1, 'вчора': 0, 'тепер': 1, 'зараз': 0, 'завжди': 0,
    'ніколи': 1, 'разом': 0, 'додому': 1, 'мама': 0, 'тато': 0, 'дитина': 1, 'людина': 1,
    'люди': 0, 'друзі': 0, 'сестра': 1, 'рука': 1, 'голова': 2, 'молоко': 2, 'хороший': 1,
    'красивий': 1, 'великий': 1, 'маленький': 1, 'новий': 1, 'старий': 1, 'чистий': 0,
    'світлий': 0, 'темний': 0, 'світло': 0, 'голос': 0, 'тиша': 0, 'музика': 0, 'квітка': 0,
    'квіти': 0, 'дерево': 0, 'море': 0, 'ріка': 1, 'річка': 0, 'гора': 1, 'гори': 0, 'поле': 0,
    'хмара': 0, 'двадцять': 0, 'тридцять': 0, 'десять': 0, 'один': 1, 'одна': 1, 'одне': 1,
    'чотири': 1, 'можна': 0, 'треба': 0, 'буде': 0, 'бути': 0, 'знаю': 0, 'знаєш': 0,
    'люблю': 1, 'бачу': 0, 'чую': 0, 'хочу': 0, 'можу': 0, 'скажи': 1, 'чекай': 1, 'прощай': 1,
    'пробач': 1, 'співай': 1, 'співаю': 1, 'танцюй': 1, 'летить': 1, 'пливе': 1, 'стоїть': 1,
    'іде': 1, 'читаю': 1, 'країна': 1, 'батьківщина': 3, 'соловей': 2, 'калина': 1
  };

  function ukRomanToCyrillic(raw) {
    if (/[а-яёєіїґ]/i.test(raw)) return raw;
    var s = raw.toLowerCase().replace(/[’ʼ]/g, "'");
    var out = '', i = 0;
    while (i < s.length) {
      if (s[i] === '\u0301') { out += '\u0301'; i++; continue; }
      var rem = s.slice(i);
      if (rem.indexOf('shch') === 0) { out += 'щ'; i += 4; continue; }
      if (rem.indexOf('sch') === 0) { out += 'щ'; i += 3; continue; }
      if (rem.indexOf('dzh') === 0) { out += 'дж'; i += 3; continue; }
      if (rem.indexOf('zh') === 0) { out += 'ж'; i += 2; continue; }
      if (rem.indexOf('kh') === 0) { out += 'х'; i += 2; continue; }
      if (rem.indexOf('ts') === 0) { out += 'ц'; i += 2; continue; }
      if (rem.indexOf('ch') === 0) { out += 'ч'; i += 2; continue; }
      if (rem.indexOf('sh') === 0) { out += 'ш'; i += 2; continue; }
      if (rem.indexOf('ya') === 0 || rem.indexOf('ja') === 0) { out += 'я'; i += 2; continue; }
      if (rem.indexOf('ye') === 0 || rem.indexOf('je') === 0) { out += 'є'; i += 2; continue; }
      if (rem.indexOf('yu') === 0 || rem.indexOf('ju') === 0) { out += 'ю'; i += 2; continue; }
      if (rem.indexOf('yi') === 0 || rem.indexOf('ji') === 0) {
        var prevCh = out.replace(/\u0301/g, '').slice(-1);
        out += (!prevCh || /[аеиіоуяєїю']/i.test(prevCh)) ? 'ї' : 'иї';
        i += 2;
        continue;
      }
      if (rem.indexOf('yo') === 0 || rem.indexOf('jo') === 0) { out += 'йо'; i += 2; continue; }
      var ch = s[i];
      if (ch === "'" || ch === 'ь') {
        var nextTwo = s.slice(i + 1, i + 3);
        out += /^(?:ya|ja|ye|je|yi|ji|yu|ju)/.test(nextTwo) ? "'" : 'ь';
        i++;
        continue;
      }
      if (ch === 'y') {
        var prevOut = out.replace(/\u0301/g, '').slice(-1);
        out += (prevOut && UK_VOWEL_CH.test(prevOut)) ? 'й' : 'и';
        i++;
        continue;
      }
      var map = {
        a: 'а', b: 'б', v: 'в', w: 'в', h: 'г', g: 'ґ', d: 'д', e: 'е',
        z: 'з', i: 'і', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н',
        o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', c: 'ц', x: 'кс'
      };
      out += map[ch] || '';
      i++;
    }
    return out;
  }

  function ukNormalizeOrthography(raw) {
    var w = raw.toLowerCase().replace(/[’ʼ]/g, "'");
    w = w.replace(/легк/g, 'лехк')
         .replace(/вогк/g, 'вохк')
         .replace(/нігт/g, 'ніхт')
         .replace(/кігт/g, 'кіхт')
         .replace(/дьогт/g, 'дьохт')
         .replace(/шістнадц/g, 'шіснадц')
         .replace(/шістсот/g, 'шіссот')
         .replace(/нтськ/g, 'нськ')
         .replace(/стськ/g, 'ськ')
         .replace(/сердц/g, 'серц')
         .replace(/[тд]ц/g, 'ц')
         .replace(/[тд]ч/g, 'ч')
         .replace(/[сз]ш/g, 'ш')
         .replace(/[сз]ж/g, 'ж')
         .replace(/[сз]щ/g, 'щ')
         .replace(/[сз]ч/g, 'щ')
         .replace(/ться$/, 'ця')
         .replace(/шся$/, 'ся');
    return w;
  }

  function ukResolveStress(rawCyrillic, cleanWord) {
    var vowels = [];
    for (var i = 0; i < rawCyrillic.length; i++) {
      var ch = rawCyrillic[i].toLowerCase();
      if (UK_VOWEL_CH.test(ch)) {
        var stressed = rawCyrillic[i + 1] === '\u0301';
        vowels.push(stressed);
      }
    }
    var V = vowels.length;
    if (V <= 1) return 0;
    for (var m = 0; m < V; m++) {
      if (vowels[m]) return m;
    }
    if (UK_STRESS_MAP[cleanWord] !== undefined) {
      return Math.min(V - 1, UK_STRESS_MAP[cleanWord]);
    }
    if (V === 2) {
      if (/(?:ття|ння|ччя|ззя|сся|ати|яти|ити|іти|ути)$/.test(cleanWord)) return 1;
      return 0;
    }
    if (/(?:ття|ння|ччя|ззя|сся|увати|ювати)$/.test(cleanWord)) return V - 1;
    if (/(?:ати|яти|ити|іти|ути|ість|ості|істю)$/.test(cleanWord)) return Math.max(0, V - 2);
    return Math.max(0, V - 2);
  }

  function ukCanStartOnset(cluster) {
    if (cluster.length <= 1) return true;
    if (cluster.length === 2) {
      var c0 = cluster[0], c1 = cluster[1];
      if (UK_SONORANT[c0] && !UK_SONORANT[c1]) return false;
      if (c1 === 'jj' && UK_SONORANT[c0]) return false;
      if (UK_SONORANT[c1]) return true;
      if (/^(s|sy_ru|z|zy_ru|sh|zh)$/.test(c0) && /^(p|py_ru|t|ty_ru|k|ky_ru|bv|by_ru|dv|dy_ru|gv|gy_ru|ts|ts_j|ts_r|dz|dz_j|dz_r|x_uk|xy_ru|f|fy_ru|hh_uk)$/.test(c1)) return true;
      if (/^(p|py_ru|t|ty_ru|k|ky_ru|bv|by_ru|dv|dy_ru|gv|gy_ru|x_uk|xy_ru|f|fy_ru)$/.test(c0) && /^(s|sy_ru|z|zy_ru|sh|zh|ts|ts_j|ts_r|x_uk)$/.test(c1)) return true;
      return false;
    }
    if (cluster.length === 3) {
      var k0 = cluster[0], k1 = cluster[1], k2 = cluster[2];
      return /^(s|sy_ru|z|zy_ru|sh|zh)$/.test(k0) &&
        /^(p|py_ru|t|ty_ru|k|ky_ru|bv|by_ru|dv|dy_ru|gv|gy_ru|v|vy_ru|ts_r)$/.test(k1) &&
        !!UK_SONORANT[k2];
    }
    return false;
  }

  function ukBuildTokens(w) {
    var raw = [], i = 0;
    while (i < w.length) {
      var ch = w[i];
      if (ch === "'" || ch === 'ь') {
        raw.push({ kind: 'MARK', ch: ch });
        i++;
        continue;
      }
      if (ch === 'щ') {
        raw.push({ kind: 'C', ch: 'ш', base: 'sh', voiceless: true });
        raw.push({ kind: 'C', ch: 'ч', base: 'ts_r', voiceless: true });
        i++;
        continue;
      }
      if (ch === 'д' && w[i + 1] === 'ж') {
        raw.push({ kind: 'C', ch: 'дж', base: 'dz_r', voiced: true });
        i += 2;
        continue;
      }
      if (ch === 'д' && w[i + 1] === 'з') {
        raw.push({ kind: 'C', ch: 'дз', base: 'dz', voiced: true, canSoft: true });
        i += 2;
        continue;
      }
      if (UK_VOWEL_PH[ch]) {
        raw.push({ kind: 'V', ch: ch, ph: UK_VOWEL_PH[ch] });
        i++;
        continue;
      }
      if (ch === 'й') {
        raw.push({ kind: 'C', ch: 'й', base: 'jj', sonorant: true });
        i++;
        continue;
      }
      var cInfo = {
        'б': { base: 'bv', voiced: true, canSoft: true },
        'в': { base: 'v', isV: true, sonorant: true, canSoft: true },
        'г': { base: 'hh_uk', glottal: true },
        'ґ': { base: 'gv', voiced: true, canSoft: true },
        'д': { base: 'dv', voiced: true, canSoft: true },
        'ж': { base: 'zh', voiced: true },
        'з': { base: 'z', voiced: true, canSoft: true },
        'к': { base: 'k', voiceless: true, canSoft: true },
        'л': { base: 'l_uk', sonorant: true, canSoft: true },
        'м': { base: 'm', sonorant: true, canSoft: true },
        'н': { base: 'n', sonorant: true, canSoft: true },
        'п': { base: 'p', voiceless: true, canSoft: true },
        'р': { base: 'r_uk', sonorant: true, canSoft: true },
        'с': { base: 's', voiceless: true, canSoft: true },
        'т': { base: 't', voiceless: true, canSoft: true },
        'ф': { base: 'f', voiceless: true, canSoft: true },
        'х': { base: 'x_uk', voiceless: true, canSoft: true },
        'ц': { base: 'ts', voiceless: true, canSoft: true },
        'ч': { base: 'ts_r', voiceless: true },
        'ш': { base: 'sh', voiceless: true }
      }[ch];
      if (cInfo) {
        raw.push({
          kind: 'C', ch: ch, base: cInfo.base,
          voiced: !!cInfo.voiced, voiceless: !!cInfo.voiceless,
          sonorant: !!cInfo.sonorant, canSoft: !!cInfo.canSoft, isV: !!cInfo.isV
        });
      }
      i++;
    }

    // 1. 先确定 в -> w / v，以及标记 ь / ' / 元音带来的颚化
    for (var j = 0; j < raw.length; j++) {
      var tk = raw[j];
      if (tk.kind !== 'C') continue;
      var prev = raw[j - 1];
      var next = raw[j + 1];
      if (tk.isV) {
        var prevIsV = prev && prev.kind === 'V';
        var prevNone = !prev;
        var nextIsV = next && next.kind === 'V';
        var nextIsMark = next && next.kind === 'MARK';
        var nextNextIsV = raw[j + 2] && raw[j + 2].kind === 'V';
        var atEnd = !next;
        var nextIsC = next && next.kind === 'C';
        if (atEnd || (prevIsV && nextIsC) || (prevNone && nextIsC && !(next.ch && /^(л|р)$/.test(next.ch) && nextNextIsV))) {
          tk.base = 'w';
          tk.canSoft = false;
        } else if (!nextIsV && !(nextIsMark && nextNextIsV) && !(prevNone && next && next.ch && /^(л|р)$/.test(next.ch) && nextNextIsV)) {
          tk.base = 'w';
          tk.canSoft = false;
        }
      }
      if (!tk.canSoft) continue;
      if (next && next.kind === 'MARK' && next.ch === 'ь' && UK_DENTAL_SOFT[tk.base]) {
        tk.soft = true;
      } else if (next && next.kind === 'V') {
        if (next.ch === 'і') {
          tk.soft = true;
        } else if ((next.ch === 'я' || next.ch === 'є' || next.ch === 'ю') && UK_DENTAL_SOFT[tk.base]) {
          tk.soft = true;
        } else if ((next.ch === 'я' || next.ch === 'є' || next.ch === 'ю') && tk.base === 'v') {
          tk.soft = true;
        }
      }
    }

    // 2. 逆向齿音颚化同化（пісня / радість / світ）
    for (var r = raw.length - 2; r >= 0; r--) {
      var cur = raw[r], nxt = raw[r + 1];
      if (cur.kind === 'C' && nxt.kind === 'C' && UK_REGRESSIVE_DENTAL[cur.base] && nxt.soft && (UK_DENTAL_SOFT[nxt.base] || nxt.base === 'v')) {
        cur.soft = true;
      }
    }

    // 3. 逆向浊化同化（боротьба / просьба / вокзал）；跨越软音符号 ь，乌克兰语不作词尾清化
    for (var vIdx = raw.length - 2; vIdx >= 0; vIdx--) {
      var cCur = raw[vIdx];
      if (cCur.kind !== 'C' || !cCur.voiceless) continue;
      var cNxt = raw[vIdx + 1];
      if (cNxt && cNxt.kind === 'MARK' && cNxt.ch === 'ь') cNxt = raw[vIdx + 2];
      if (cNxt && cNxt.kind === 'C' && (cNxt.voiced || UK_VOICED_OBS[cNxt.base])) {
        var mapped = UK_VOICE_MAP[cCur.soft && UK_SOFT_MAP[cCur.base] ? UK_SOFT_MAP[cCur.base] : cCur.base] || UK_VOICE_MAP[cCur.base];
        if (mapped) {
          cCur.phOverride = mapped;
          cCur.voiced = true;
          cCur.voiceless = false;
        }
      }
    }

    // 4. 展开元音腭化 j 并折叠双写辅音（життя / знання / обличчя）
    var items = [];
    for (var k = 0; k < raw.length; k++) {
      var tok = raw[k];
      if (tok.kind === 'MARK') continue;
      if (tok.kind === 'C') {
        var ph = tok.phOverride || (tok.soft && UK_SOFT_MAP[tok.base] ? UK_SOFT_MAP[tok.base] : tok.base);
        var lastItem = items[items.length - 1];
        if (lastItem && lastItem.type === 'C' && lastItem.ph === ph) continue;
        items.push({ type: 'C', ph: ph });
      } else if (tok.kind === 'V') {
        var p1 = raw[k - 1];
        var needJ = false;
        if (tok.ch === 'ї') {
          needJ = true;
        } else if (UK_IOTATED[tok.ch]) {
          if (!p1 || p1.kind === 'V' || p1.kind === 'MARK') {
            needJ = true;
          }
        }
        if (needJ) items.push({ type: 'C', ph: 'jj' });
        items.push({ type: 'V', ph: tok.ph });
      }
    }
    return items;
  }

  function ukrainianSubword(part, wordStressedVowelIdx, vowelOffsetRef) {
    var w = ukNormalizeOrthography(ukRomanToCyrillic(part));
    var items = ukBuildTokens(w.replace(/\u0301/g, ''));
    if (!items.length) return [];

    var vowelPositions = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type === 'V') vowelPositions.push(i);
    }
    if (!vowelPositions.length) {
      return [items.map(function (it) { return it.ph; })];
    }

    var sylStarts = [0];
    for (var s = 0; s < vowelPositions.length - 1; s++) {
      var v0 = vowelPositions[s], v1 = vowelPositions[s + 1];
      var cluster = [];
      for (var c = v0 + 1; c < v1; c++) cluster.push(items[c].ph);
      var splitAt = v1;
      for (var len = Math.min(cluster.length, 3); len >= 0; len--) {
        var onset = cluster.slice(cluster.length - len);
        if (ukCanStartOnset(onset)) {
          splitAt = v1 - len;
          break;
        }
      }
      sylStarts.push(splitAt);
    }

    var syllables = [];
    for (var j = 0; j < sylStarts.length; j++) {
      var start = sylStarts[j];
      var end = j + 1 < sylStarts.length ? sylStarts[j + 1] : items.length;
      syllables.push(items.slice(start, end).map(function (it) { return it.ph; }));
    }
    vowelOffsetRef.count += vowelPositions.length;
    void wordStressedVowelIdx;
    return syllables;
  }

  function ukrainianWord(rawWord) {
    var clean = ukRomanToCyrillic(rawWord).replace(/^['’ʼ]+|['’ʼ]+$/g, '');
    if (!clean) return [['a_uk']];
    var parts = clean.split('-').filter(Boolean);
    if (!parts.length) return [['a_uk']];
    var groups = [];
    var offsetRef = { count: 0 };
    parts.forEach(function (part) {
      var normalized = ukNormalizeOrthography(part);
      var cleanNoStress = normalized.replace(/\u0301/g, '');
      var stressIdx = ukResolveStress(normalized, cleanNoStress);
      groups = groups.concat(ukrainianSubword(part, stressIdx, offsetRef));
    });
    return groups.length ? groups : [['a_uk']];
  }

  function ukrainian(text) {
    var norm = String(text || '').normalize('NFD')
      .replace(/и\u0306/g, 'й').replace(/И\u0306/g, 'Й')
      .replace(/і\u0308/g, 'ї').replace(/І\u0308/g, 'Ї');
    var words = norm.match(/[а-яёєіїґa-z\u0301'’ʼ]+(?:-[а-яёєіїґa-z\u0301'’ʼ]+)*(?:#[1-9]\d*)?/gi) || [], out = [];
    words.forEach(function (word) {
      var indexed = word.match(/^(.+?)#([1-9]\d*)$/), raw = indexed ? indexed[1] : word;
      var normClean = ukNormalizeOrthography(ukRomanToCyrillic(raw).replace(/^['’ʼ]+|['’ʼ]+$/g, ''));
      var stressIdx = ukResolveStress(normClean, normClean.replace(/\u0301/g, ''));
      var groups = ukrainianWord(raw);
      var displayRaw = raw.replace(/\u0301/g, '');
      var indexes = indexed ? [Math.min(+indexed[2] - 1, groups.length - 1)] : groups.map(function (_, i) { return i; });
      indexes.forEach(function (index) {
        out.push({ text: indexed ? word : groups.length > 1 ? displayRaw + '#' + (index + 1) : displayRaw,
          word: displayRaw, roman: groups[index].join(' '), phones: groups[index].slice(),
          stress: index === stressIdx,
          extend: !!indexed && +indexed[2] > groups.length });
      });
    });
    return out;
  }

  /* ---------------- 芬兰语 ---------------- */
  var FI_VOWEL = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'y', ä: 'ae', ö: 'oe' };
  var FI_CLOSING = /^(ai|ei|oi|ui|yi|äi|öi|au|eu|iu|ou|ey|iy|äy|öy)$/;
  var FI_OPENING = /^(ie|uo|yö)$/;
  var FI_CONSONANT = { b: 'bv', d: 'dv', f: 'f', g: 'gv', h: 'h', j: 'jj', k: 'k', l: 'l',
    m: 'm', n: 'n', p: 'p', r: 'r_fi', s: 's', t: 't', v: 'v_fi', w: 'v_fi', š: 'sh', ž: 'zh',
    q: 'k', z: 'ts' };

  function finnishSyllables(part) {
    var spelling = Array.from(part.toLowerCase(), function (ch) {
      if (ch === 'å') return 'o';
      if (ch === 'ü') return 'y';
      return FI_VOWEL[ch] || FI_CONSONANT[ch] ? ch : ch.normalize('NFD').replace(/\p{M}/gu, '');
    }).join('');
    var phones = [], starts = [];
    for (var i = 0; i < spelling.length; i++) {
      var ch = spelling[i], next = spelling[i + 1], pair = ch + next, vowel = FI_VOWEL[ch];
      if (vowel) {
        // Between nuclei, the last consonant starts the next syllable. A long /ŋː/ is split like other geminates.
        var prev = phones[phones.length - 1];
        starts.push(!starts.length ? 0 : NSG.phoneOf(prev).t === 'V' ? phones.length : phones.length - 1);
        var isHiatus = (next === 'u' || next === 'y') &&
          ((starts.length > 1 && i + 2 === spelling.length - 1 && spelling[i + 2] === 's') || spelling === 'hius');
        if (ch === next) {
          phones.push(vowel + '_long_fi');
          i++;
        } else if (!isHiatus && (FI_CLOSING.test(pair) || (starts.length === 1 && FI_OPENING.test(pair))) &&
                   next !== spelling[i + 2]) {
          // A doubled second vowel takes precedence, e.g. a-uu rather than au-u.
          phones.push(vowel + '_fi', FI_VOWEL[next] + '_glide_fi');
          i++;
        } else phones.push(vowel + '_fi');
      } else if (pair === 'ng' || (pair === 'gn' && FI_VOWEL[spelling[i - 1]])) {
        phones.push('ng');
        if (pair === 'gn') phones.push('n');
        else if (FI_VOWEL[spelling[i - 1]] && FI_VOWEL[spelling[i + 2]]) phones.push('ng');
        i++;
      } else if (pair === 'nk') phones.push('ng');
      else if (pair === 'np') phones.push('m');
      else if (pair === 'sh' || pair === 'zh') { phones.push(pair); i++; }
      else if (ch === 'c') phones.push(/^[eiy]$/.test(next) ? 's' : 'k');
      else if (ch === 'x') phones.push('k', 's');
      else if (FI_CONSONANT[ch]) phones.push(FI_CONSONANT[ch]);
    }
    return starts.map(function (start, i) { return phones.slice(start, starts[i + 1]); });
  }

  function finnish(text) {
    var words = text.normalize('NFC').match(/\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*(?:#[1-9]\d*)?/gu) || [];
    var result = [];
    words.forEach(function (entry) {
      var indexed = entry.match(/^(.+?)#([1-9]\d*)$/);
      var word = indexed ? indexed[1] : entry;
      var groups = word.split(/['’-]/).flatMap(finnishSyllables);
      var index = indexed ? +indexed[2] - 1 : -1;
      if (!groups.length) return;
      groups.forEach(function (phones, i) {
        if (indexed && i !== Math.min(index, groups.length - 1)) return;
        result.push({ text: indexed || groups.length === 1 ? entry : word + '#' + (i + 1),
          word: word, roman: phones.join(' '), phones: phones, stress: i === 0, extend: index >= groups.length });
      });
    });
    return result;
  }

  /* ---------------- 罗曼语族 ----------------
     西语采用拉美 seseo / yeísmo，葡语采用巴西读法；意、法、罗语采用标准读法。
     正字法无法确定的读音由常用词例外补充。! 标记不能转成滑音的重读高元音。 */
  var ROMANCE_STOPS = { p: 'b', b: 'bv', t: 'd', d: 'dv', k: 'g', g: 'gv',
    f: 'f', v: 'v', s: 's', z: 'z', m: 'm', n: 'n', l: 'l', r: 'dx',
    a: 'a_j', e: 'e_rom', i: 'i', o: 'o_rom', u: 'u', y: 'i', w: 'w' };
  var ROMANCE_RULES = {
    es: [
      [/ch/y, 'ch_en'], [/ll/y, 'y_es'], [/ñ/y, 'ny'], [/rr/y, 'rr_es'],
      [/gü(?=[eiéí])/y, 'gv w'], [/gu(?=[eiéí])/y, 'gv'], [/qu(?=[eiéí])/y, 'g'],
      [/g(?=[eiéí])/y, 'x_es'], [/xc(?=[eiéí])/y, 'g s'], [/sc(?=[eiéí])/y, 's'],
      [/c(?=[eiéí])/y, 's'], [/c|q/y, 'g'],
      [/(?<![a-záéíóúüñ])x/y, 's'], [/x/y, 'g s'], [/z/y, 's'], [/j/y, 'x_es'],
      [/(?<=[nls])r/y, 'rr_es'], [/^r/y, 'rr_es'], [/y(?=[aeiouáéíóúü])/y, 'y_es'],
      [/y$/y, 'i'], [/h/y, ''], [/v/y, 'bv'],
      [/a|á/y, 'a_j'], [/é/y, 'e_rom'], [/ó/y, 'o_rom'], [/í/y, '!i'], [/ú/y, '!u'], [/ü/y, 'u']
    ],
    pt: [
      [/ch/y, 'sh'], [/nh/y, 'ny'], [/lh/y, 'ly_rom'], [/rr|^r|(?<=[nls])r/y, 'h'],
      [/r(?=[^aeiouáéíóúâêôãõà]|$)/y, 'h'], [/h/y, ''],
      [/gu(?=[eiéêí])/y, 'gv'], [/gu(?=[aoáãóôàâ])/y, 'gv w'],
      [/qu(?=[eiéêí])/y, 'g'], [/qu/y, 'g w'],
      [/g(?=[eiéêí])|j/y, 'zh'], [/(?:sc|xc)(?=[eiéêí])|sç/y, 's'], [/c(?=[eiéêí])|ç/y, 's'], [/c|q/y, 'g'],
      [/ss/y, 's'], [/(?<=[aeiouáéíóúâêôãõà])s(?=[aeiouáéíóúâêôãõà])/y, 'z'],
      [/s(?=[bdgvlmnr])/y, 'z'], [/z$/y, 's'],
      [/^ex(?=[aeiouáéíóúâêôãõ])/y, 'i z'], [/^êx(?=[aeiouáéíóúâêôãõ])/y, 'e_rom z'],
      [/^x|(?<=[aeiou]n|[aeo]i|ou)x/y, 'sh'],
      [/(?<=e)x(?=[ptcf])/y, 's'], [/x/y, 'g s'],
      [/ão|am(?=s?$)/y, 'a_nas_pt U_nas_pt'], [/ãe/y, 'a_nas_pt I_nas_pt'], [/õe/y, 'o_nas_pt I_nas_pt'],
      [/[eéê][mn](?=s?$)/y, 'e_nas_pt I_nas_pt'],
      [/ã|[aáâ][mn](?=[^aeiouáéíóúâêôãõàh]|$)/y, 'a_nas_pt'],
      [/õ|[oóô][mn](?=[^aeiouáéíóúâêôãõàh]|$)/y, 'o_nas_pt'],
      [/[eéê][mn](?=[^aeiouáéíóúâêôãõàh])/y, 'e_nas_pt'],
      [/[ií][mn](?=[^aeiouáéíóúâêôãõàh]|$)/y, 'i_nas_pt'], [/[uú][mn](?=[^aeiouáéíóúâêôãõàh]|$)/y, 'u_nas_pt'],
      [/(?<=[áéíóúâêô].*[^aeiouáéíóúâêôãõà])i(?=[aeo]s?$)/y, 'jj'],
      [/(?<=[aeoáéó]|(?<![qg])u)i(?=nh|[rlz]$)/y, '!i'],
      [/(?<=[aeioáéíó])u(?=nh|[rlz]$)/y, '!u'],
      [/l(?=[^aeiouáéíóúâêôãõà]|$)/y, 'U_rom'],
      [/á|à/y, 'a_j'], [/â/y, 'at_pt'], [/é/y, 'E_rom'], [/ê/y, 'e_rom'],
      [/ó/y, 'O_rom'], [/ô/y, 'o_rom'], [/í/y, '!i'], [/ú/y, '!u']
    ],
    it: [
      [/sch(?=[eiéèì])/y, 's g'], [/sci(?=[aouàòùóéè]|e(?=[a-zàéèìíòóùú]))/y, 'sh'], [/sc(?=[eiéèì])/y, 'sh'],
      [/cch/y, 'g g'], [/ggh/y, 'gv gv'], [/ch/y, 'g'], [/gh/y, 'gv'],
      [/(?<=(?:lo|er|ur|al|ma|bu))gi(?=[ae]$)/y, 'jh_en !i'],
      [/(?<=farma)ci(?=[ae]$)/y, 'ch_en !i'],
      [/cci(?=[aouàòùóéè]|e(?=[a-zàéèìíòóùú]))|cc(?=[eiéèì])/y, 'ch_en ch_en'],
      [/ggi(?=[aouàòùóéè]|e(?=[a-zàéèìíòóùú]))|gg(?=[eiéèì])/y, 'jh_en jh_en'],
      [/ci(?=[aouàòùóéè]|e(?=[a-zàéèìíòóùú]))|c(?=['’]?[eiéèì])/y, 'ch_en'],
      [/gi(?=[aouàòùóéè]|e(?=[a-zàéèìíòóùú]))|g(?=['’]?[eiéèì])/y, 'jh_en'],
      [/gli(?=[aouàòùóeéè])/y, 'ly_rom'], [/gli(?=$)/y, 'ly_rom i'],
      [/gn/y, 'ny'], [/qu/y, 'g w'], [/gu(?=[aeiouàéèìíòóùú])/y, 'gv w'], [/c|q/y, 'g'],
      [/(?<=(?:real|organ|util|anal|armon|visual|simbol|caratter|memor|autor|sincron|improvv|final|legal|local|gener|minim|massim|ottim)i)zz/y, 'dz dz'],
      [/zz/y, 'ts ts'], [/z/y, 'ts'], [/ss/y, 's s'],
      [/s(?=[bdgvlmnr])/y, 'z'], [/(?<=[aeiouàéèìíóòùú])s(?=['’]?[aeiouàéèìíóòùú])/y, 'z'],
      [/rr/y, 'dx rr_es'], [/x/y, 'g s'], [/h|['’]/y, ''],
      [/à/y, 'a_j'], [/è/y, 'E_rom'], [/é/y, 'e_rom'], [/ò/y, 'O_rom'], [/ó/y, 'o_rom'],
      [/ì|í/y, '!i'], [/ù|ú/y, '!u']
    ],
    fr: [
      [/['’]|h/y, ''],
      [/^(?:in|ré|co)?ex(?=[aeiouyàâéèêëîïôûùh])/y, 'E_rom gv z'],
      [/ccueil(?:l|(?=s?$))/y, 'g OE_fr jj'], [/cueil(?:l|(?=s?$))/y, 'g OE_fr jj'], [/gueil(?:l|(?=s?$))/y, 'gv OE_fr jj'],
      [/eaux?/y, 'o_rom'], [/au/y, 'o_rom'],
      [/ouill|ouil(?=s?$)/y, 'u jj'], [/ou(?=[aioéèê]|e(?!s?$))/y, 'w'], [/o[uù]/y, 'u'],
      [/oyen(?![aeiouyàâéèêëîïôûùæœnmh])/y, 'w a_j jj E_nas_fr'],
      [/oi[nm](?![aeiouyàéèêîôûnmh])/y, 'w E_nas_fr'], [/oi/y, 'w a_j'],
      [/oy(?=[aeoéèê])/y, 'w a_j jj'],
      [/uill/y, 'H_fr i jj'], [/uin(?![aeiouyàâéèêëîïôûùæœnmh])/y, 'H_fr E_nas_fr'], [/uy(?=[aeoéèê])/y, 'H_fr i jj'], [/ui/y, 'H_fr i'],
      [/(?:œu|oeu|eu)il(?:l|(?=s?$))/y, 'OE_fr jj'],
      [/(?:œ|oe)il(?=s?$)/y, 'OE_fr jj'],
      [/eû/y, 'oe_fr'],
      [/(?:œu|oeu|eu)(?=(?:[frlvn]|[bpv]r|[bp]l)e?s?$|rt?s?$|l[a-z])/y, 'OE_fr'], [/œu|oeu|eu/y, 'oe_fr'],
      [/(?:(?<=^b)|(?<=(?:^|re|de|sou|con|ob|main|appar|par|pro|sur)[vt]))ien(?![aeiouyàâéèêëîïôûùæœnmh])|(?<!^(?:cl|pat|or|ingréd|inconvén))ien(?=$|[st]$)/y, 'jj E_nas_fr'],
      [/um$/y, 'O_rom m'],
      [/[ae][nm](?![aeiouyàâéèêëîïôûùæœnmh])/y, 'a_nas_fr'],
      [/o[nm](?![aeiouyàâéèêëîïôûùæœnmh])/y, 'o_nas_fr'],
      [/(?:ai|ei|i|y)[nm](?![aeiouyàâéèêëîïôûùæœnmh])/y, 'E_nas_fr'],
      [/u[nm](?![aeiouyàâéèêëîïôûùæœnmh])/y, 'OE_nas_fr'], [/u/y, 'y'],
      [/aill|ail(?=s?$)/y, 'a_j jj'], [/eill|eil(?=s?$)/y, 'E_rom jj'],
      [/ay(?=[aeoéèê])/y, 'E_rom jj'], [/ai|ei|aî/y, 'E_rom'],
      [/ers?$|ez$/y, 'e_rom'], [/et$/y, 'E_rom'],
      [/é/y, 'e_rom'], [/è|ê|ë|æ/y, 'E_rom'],
      [/ô|o(?=[dstxzp]*$|s(?!s)[aeiouyàâéèêîôû]|tion)/y, 'o_rom'], [/o/y, 'O_rom'],
      [/î|ï/y, 'i'], [/û|ù/y, 'y'], [/à|â/y, 'a_j'],
      [/^ill|(?<=^(?:v|m|tranqu))ill|(?<=^(?:b|tr))ill(?=ion)/y, 'i l'],
      [/(?<=[aeouyàâéèêëôûù])ill/y, 'jj'], [/ill/y, 'i jj'],
      [/(?<=[bcdfgkptv][lr])i(?=[aoéèêàâô]|e(?!s?$))/y, 'i jj'],
      [/i(?=[aoéèêàâô]|e(?!s?$))/y, 'jj'], [/y(?=[aeiouéèê])/y, 'jj'],
      [/e(?=s?$)/y, ''], [/e(?=mm[ae]nts?$)/y, 'a_j'],
      [/e(?=x|ch[rln]|(?![bcdfgkptv][lr][aeiouyàâéèêëîïôûù])[bcdfgjklmnprstvz]{2}|[cflq]$)/y, 'E_rom'], [/e/y, '@'],
      [/ph/y, 'f'], [/gn/y, 'ny'], [/ch(?=[rln])/y, 'g'], [/ch|sh/y, 'sh'], [/th/y, 'd'],
      [/qu(?=['’]?[aeiouyàéèê])/y, 'g'], [/gu(?=[eiéèêy])/y, 'gv'], [/qu|q/y, 'g'],
      [/(?<=[aeio]n)[cg]s?$|gts?$/y, ''],
      [/ge(?=[aoàâô]|è$)/y, 'zh'], [/g(?=[eiéèêy])|j/y, 'zh'],
      [/xc(?=[eiéèêy])/y, 'g s'], [/sc(?=[eiéèêy])/y, 's'], [/cc(?![eiéèêy])/y, 'g'], [/c(?=['’]?[eiéèêy])|ç/y, 's'], [/c/y, 'g'],
      [/(?<!s)ti(?=on|ence|el|al|eu[xs]|euse)/y, 's jj'], [/ss/y, 's'],
      [/(?<=[aeiouyàâéèêëîïôûùæœ])s(?=[aeiouyàâéèêëîïôûùæœ])/y, 'z'],
      [/[dstxzp]+$/y, ''], [/x/y, 'g s'], [/rr?/y, 'r_fr']
    ],
    ro: [
      [/^ex(?=[aeiouăâî])/y, 'e_rom gv z'],
      [/ch(?=[ei])/y, 'g'], [/gh(?=[ei])/y, 'gv'],
      [/ci(?=[aouăâî])|ce(?=[ao])|c(?=[ei])/y, 'ch_en'],
      [/gi(?=[aouăâî])|ge(?=[ao])|g(?=[ei])/y, 'jh_en'],
      [/c|q/y, 'g'], [/j/y, 'zh'], [/h/y, 'h'], [/ș/y, 'sh'], [/ț/y, 'ts'], [/x/y, 'g s'],
      [/ă/y, '@'], [/â|î/y, 'I_ro'], [/ea/y, 'e_glide_ro a_j'], [/oa/y, 'o_glide_ro a_j'],
      [/ii$/y, '!i I_rom'],
      [/(?<=[aeiouăâî])u(?=[aă]$)/y, 'w'],
      [/(?<=[bcdfgpstvz][rl])i(?=[aeo])/y, '!i'],
      [/(?<=[^aeiouăâî])i(?=[aeu]$)/y, '!i']
    ]
  };

  var FR_NONVERB_ENT = /^(?:vent|cent|dent|lent|parent|talent|serpent|torrent|couvent|souvent|ciment|accent|innocent|excellent|absent|présent|content|mécontent|récent|décent|indécent|évident|prudent|imprudent|différent|indifférent|cohérent|incohérent|adhérent|transparent|apparent|violent|silent|opulent|turbulent|insolent|indolent|client|patient|orient|ingrédient|inconvénient|président|résident|accident|incident|confident|argent|sergent|agent|urgent|intelligent|négligent|diligent|divergent|convergent|contingent|exigent|indulgent|tangent|émergent|confluent|affluent|influent|permanent|continent|pertinent|imminent|éminent|compétent|incompétent|intermittent|pénitent|adolescent|fluorescent|incandescent|(?:re|de|sou|con|ob|main|appar|par|pro|sur|inter|pré)?[vt]ient)$/;
  var FR_VERB_ENT = /(?:(?:iss|ou|ill|nn|ll|tt|ss)ent|(?:[iuv]|ch|nd|rd|rt|mb|mp|bl|fl|gl|pl|tr|vr|cr|dr|gr|sc|nc|ut|èt|èr|èv|èm|èn|èl|ès)ent|^(?:dorment|ferment|forment|calment|charment|allument|fument|expriment|animent|volent|parlent|coulent|roulent|brûlent|sautent|portent|montent|comptent|racontent|tournent|retournent|marchent|cherchent|cachent|touchent|couchent|savent|lavent|lèvent|sauvent|servent|vivent|suivent|écrivent|lisent|disent|voient|croient|boivent|doivent|meurent|courent|ouvrent|partent|sortent|sentent|mentent))$/;

  var ROMANCE_EXCEPTIONS = {
    es: {
      méxico: 'm e_rom x_es i g o_rom', mexicano: 'm e_rom x_es i g a_j n o_rom',
      oaxaca: 'w a_j x_es a_j g a_j', guion: 'gv jj o_rom n', muy: 'm u I_rom'
    },
    pt: {
      muito: 'm u_nas_pt I_nas_pt d u', muita: 'm u_nas_pt I_nas_pt d at_pt',
      mais: 'm a_j I_rom s', quem: 'g e_nas_pt I_nas_pt', bem: 'bv e_nas_pt I_nas_pt',
      um: 'u_nas_pt', uma: 'u_nas_pt m at_pt', os: 'u s', o: 'u', e: 'i',
      lo: 'l u', los: 'l u s', la: 'l at_pt', las: 'l at_pt s',
      de: 'jh_en i', do: 'dv u', dos: 'dv u s', no: 'n u', nos: 'n u s',
      que: 'g i', se: 's i', te: 'ch_en i', me: 'm i', lhe: 'ly_rom i', lhes: 'ly_rom i s',
      hoje: 'o_rom zh i', noite: 'n o_rom I_rom ch_en i', sol: 's O_rom U_rom',
      manhã: 'm a_j ny a_nas_pt', amanhã: 'a_j m a_j ny a_nas_pt',
      próximo: 'b dx O_rom s i m u', próxima: 'b dx O_rom s i m at_pt',
      próximos: 'b dx O_rom s i m u s', próximas: 'b dx O_rom s i m at_pt s',
      máximo: 'm a_j s i m u', máxima: 'm a_j s i m at_pt',
      trouxe: 'd dx o_rom U_rom s i', trouxeram: 'd dx o_rom U_rom s E_rom dx a_nas_pt U_nas_pt',
      auxílio: 'a_j U_rom s i l jj u',
      lixo: 'l i sh u', roxo: 'h o_rom sh u', roxa: 'h o_rom sh at_pt',
      bruxa: 'bv dx u sh at_pt', puxar: 'b u sh a_j h', puxa: 'b u sh at_pt',
      mexer: 'm e_rom sh e_rom h', mexe: 'm E_rom sh i', mexeu: 'm e_rom sh e_rom U_rom',
      abacaxi: 'a_j bv a_j g a_j sh i', luxo: 'l u sh u', coxa: 'g o_rom sh at_pt',
      exemplo: 'i z e_nas_pt b l u',
      exame: 'i z a_nas_pt m i', coração: 'g o_rom dx a_j s a_nas_pt U_nas_pt',
      água: 'a_j gv w at_pt', quando: 'g w a_nas_pt dv u', quatro: 'g w a_j d dx u',
      tranquilo: 'd dx a_nas_pt g w i l u', cinquenta: 's i_nas_pt g w e_nas_pt d at_pt',
      frequente: 'f dx e_rom g w e_nas_pt ch_en i',
      aguentar: 'a_j gv w e_nas_pt d a_j h', aguenta: 'a_j gv w e_nas_pt d at_pt',
      linguiça: 'l i_nas_pt gv w i s at_pt', pinguim: 'b i_nas_pt gv w i_nas_pt',
      sequência: 's e_rom g w e_nas_pt s jj at_pt', consequência: 'g o_nas_pt s e_rom g w e_nas_pt s jj at_pt'
    },
    it: {
      gli: 'ly_rom i', zio: 'ts !i o_rom',
      zia: 'ts !i a_j', zii: 'ts !i i', zaino: 'dz a_j I_rom n o_rom', zero: 'dz E_rom dx o_rom',
      zona: 'dz O_rom n a_j', zone: 'dz O_rom n e_rom', zoo: 'dz O_rom o_rom',
      zelo: 'dz E_rom l o_rom', zebra: 'dz E_rom bv dx a_j', zanzara: 'dz a_j n dz a_j dx a_j',
      mezzo: 'm E_rom dz dz o_rom', mezza: 'm E_rom dz dz a_j',
      mezzi: 'm E_rom dz dz i', mezze: 'm E_rom dz dz e_rom',
      azzurro: 'a_j dz dz u dx rr_es o_rom', azzurra: 'a_j dz dz u dx rr_es a_j',
      azzurri: 'a_j dz dz u dx rr_es i', azzurre: 'a_j dz dz u dx rr_es e_rom',
      brezza: 'bv dx e_rom dz dz a_j', orizzonte: 'o_rom dx i dz dz o_rom n d e_rom',
      pranzo: 'b dx a_j n dz o_rom', romanzo: 'dx o_rom m a_j n dz o_rom', bronzo: 'bv dx o_rom n dz o_rom',
      casa: 'g a_j z a_j', cosa: 'g O_rom z a_j', rosa: 'dx O_rom z a_j',
      bello: 'bv E_rom l l o_rom', bella: 'bv E_rom l l a_j', amore: 'a_j m o_rom dx e_rom',
      cuore: 'g w O_rom dx e_rom', buono: 'bv w O_rom n o_rom', nuovo: 'n w O_rom v o_rom',
      bene: 'bv E_rom n e_rom', notte: 'n O_rom d d e_rom', sole: 's o_rom l e_rom',
      io: '!i o_rom', mio: 'm !i o_rom', mia: 'm !i a_j', mie: 'm !i e_rom',
      tuo: 'd !u o_rom', tua: 'd !u a_j', tue: 'd !u e_rom',
      suo: 's !u o_rom', sua: 's !u a_j', sue: 's !u e_rom',
      due: 'dv !u e_rom', via: 'v !i a_j', sia: 's !i a_j', dia: 'dv !i a_j', stia: 's d !i a_j',
      scia: 'sh !i a_j', spia: 's b !i a_j',
      dio: 'dv !i o_rom', addio: 'a_j dv dv !i o_rom', oblio: 'o_rom bv l !i o_rom',
      paura: 'b a_j !u dx a_j',
      più: 'b jj u', ciao: 'ch_en a_j U_rom',
      poesia: 'b o_rom e_rom z !i a_j', fantasia: 'f a_j n d a_j z !i a_j',
      melodia: 'm e_rom l o_rom dv !i a_j', armonia: 'a_j dx m o_rom n !i a_j',
      sinfonia: 's i n f o_rom n !i a_j', allegria: 'a_j l l e_rom gv dx !i a_j',
      gelosia: 'jh_en e_rom l o_rom z !i a_j', cortesia: 'g o_rom dx d e_rom z !i a_j',
      compagnia: 'g o_rom m b a_j ny !i a_j', malattia: 'm a_j l a_j d d !i a_j',
      follia: 'f o_rom l l !i a_j', polizia: 'b o_rom l i ts !i a_j',
      ferrovia: 'f e_rom dx rr_es o_rom v !i a_j', teoria: 'd e_rom o_rom dx !i a_j',
      ironia: 'i dx o_rom n !i a_j', economia: 'e_rom g o_rom n o_rom m !i a_j',
      autonomia: 'a_j U_rom d o_rom n o_rom m !i a_j', democrazia: 'dv e_rom m o_rom g dx a_j ts !i a_j',
      filosofia: 'f i l o_rom z o_rom f !i a_j', terapia: 'd e_rom dx a_j b !i a_j',
      utopia: 'u d o_rom b !i a_j', agonia: 'a_j gv o_rom n !i a_j',
      galleria: 'gv a_j l l e_rom dx !i a_j', libreria: 'l i bv dx e_rom dx !i a_j',
      pizzeria: 'b i ts ts e_rom dx !i a_j', batteria: 'bv a_j d d e_rom dx !i a_j',
      specie: 's b E_rom ch_en e_rom', superficie: 's u b e_rom dx f i ch_en e_rom',
      camicie: 'g a_j m i ch_en e_rom', valigie: 'v a_j l i jh_en e_rom', ciliegie: 'ch_en i l jj E_rom jh_en e_rom',
      pesce: 'b e_rom sh sh e_rom'
    },
    fr: {
      le: 'l @', je: 'zh @', me: 'm @', te: 'd @', se: 's @', de: 'dv @', ce: 's @', ne: 'n @',
      que: 'g @', des: 'dv e_rom', les: 'l e_rom', mes: 'm e_rom', tes: 'd e_rom', ses: 's e_rom',
      ces: 's e_rom', es: 'E_rom', est: 'E_rom', et: 'e_rom', ai: 'e_rom', avez: 'a_j v e_rom',
      en: 'a_nas_fr', on: 'o_nas_fr', un: 'OE_nas_fr', il: 'i l', elle: 'E_rom l',
      ils: 'i l', elles: 'E_rom l', nous: 'n u', vous: 'v u', sont: 's o_nas_fr',
      ont: 'o_nas_fr', dans: 'dv a_nas_fr', avec: 'a_j v E_rom g', donc: 'dv o_nas_fr g',
      deux: 'dv oe_fr', neuf: 'n OE_fr f', sœur: 's OE_fr r_fr', cœur: 'g OE_fr r_fr',
      chœur: 'g OE_fr r_fr', choeur: 'g OE_fr r_fr', orchestre: 'O_rom r_fr g E_rom s d r_fr',
      écho: 'e_rom g o_rom', chaos: 'g a_j o_rom',
      oeil: 'OE_fr jj', œil: 'OE_fr jj', ville: 'v i l', mille: 'm i l', tranquille: 'd r_fr a_nas_fr g i l',
      mer: 'm E_rom r_fr', cher: 'sh E_rom r_fr', fer: 'f E_rom r_fr', hiver: 'i v E_rom r_fr',
      enfer: 'a_nas_fr f E_rom r_fr', amer: 'a_j m E_rom r_fr', super: 's y b E_rom r_fr',
      outil: 'u d i', fusil: 'f y z i', rose: 'r_fr o_rom z', parfum: 'b a_j r_fr f OE_nas_fr',
      bonheur: 'bv O_rom n OE_fr r_fr', gentil: 'zh a_nas_fr d i', soleil: 's O_rom l E_rom jj',
      femme: 'f a_j m', monsieur: 'm @ s jj oe_fr', messieurs: 'm e_rom s jj oe_fr',
      parler: 'b a_j r_fr l e_rom', parlent: 'b a_j r_fr l', aiment: 'E_rom m',
      chantent: 'sh a_nas_fr d', dansent: 'dv a_nas_fr s', donnent: 'dv O_rom n', mangent: 'm a_nas_fr zh',
      regardent: 'r_fr @ gv a_j r_fr dv', écoutent: 'e_rom g u d', marchent: 'm a_j r_fr sh',
      jouent: 'zh u', pensent: 'b a_nas_fr s', tombent: 'd o_nas_fr bv', restent: 'r_fr E_rom s d',
      arrivent: 'a_j r_fr i v', pleurent: 'b l OE_fr r_fr', rêvent: 'r_fr E_rom v',
      trouvent: 'd r_fr u v', laissent: 'l E_rom s', passent: 'b a_j s', cherchent: 'sh E_rom r_fr sh',
      prennent: 'b r_fr E_rom n', mettent: 'm E_rom d', viennent: 'v jj E_rom n', tiennent: 'd jj E_rom n',
      savent: 's a_j v', veulent: 'v OE_fr l', peuvent: 'b OE_fr v', vivent: 'v i v',
      voient: 'v w a_j', disent: 'dv i z', vont: 'v o_nas_fr', soient: 's w a_j',
      pied: 'b jj e_rom', hier: 'jj E_rom r_fr', fier: 'f jj E_rom r_fr', tiers: 'd jj E_rom r_fr',
      vers: 'v E_rom r_fr', travers: 'd r_fr a_j v E_rom r_fr', univers: 'y n i v E_rom r_fr',
      envers: 'a_nas_fr v E_rom r_fr', divers: 'dv i v E_rom r_fr', "l'hiver": 'l i v E_rom r_fr',
      font: 'f o_nas_fr', avaient: 'a_j v E_rom', étaient: 'e_rom d E_rom',
      eu: 'y', eus: 'y', eut: 'y', eurent: 'y r_fr',
      faisons: 'f @ z o_nas_fr', faisant: 'f @ z a_nas_fr', faisais: 'f @ z E_rom', faisait: 'f @ z E_rom', faisaient: 'f @ z E_rom',
      dessus: 'dv @ s y', dessous: 'dv @ s u', ressentir: 'r_fr @ s a_nas_fr d i r_fr',
      ressembler: 'r_fr @ s a_nas_fr bv l e_rom', ressource: 'r_fr @ s u r_fr s',
      ennui: 'a_nas_fr n H_fr i', ennuyer: 'a_nas_fr n H_fr i jj e_rom', emmener: 'a_nas_fr m n e_rom',
      patient: 'b a_j s jj a_nas_fr', examen: 'E_rom gv z a_j m E_nas_fr',
      deuxième: 'dv oe_fr z jj E_rom m', sixième: 's i z jj E_rom m', dixième: 'dv i z jj E_rom m',
      soixante: 's w a_j s a_nas_fr d', longtemps: 'l o_nas_fr d a_nas_fr',
      oignon: 'O_rom ny o_nas_fr', août: 'u',
      hélas: 'e_rom l a_j s', mars: 'm a_j r_fr s', ours: 'u r_fr s', bus: 'bv y s',
      sens: 's a_nas_fr s', maïs: 'm a_j i s', tennis: 'd E_rom n i s', oasis: 'O_rom a_j z i s',
      six: 's i s', dix: 'dv i s', huit: 'H_fr i d', sept: 's E_rom d',
      oui: 'w i', pays: 'b e_rom i', demain: 'dv @ m E_nas_fr',
      "aujourd'hui": 'o_rom zh u r_fr dv H_fr i', fils: 'f i s', automne: 'o_rom d O_rom n'
    },
    ro: {
      eu: 'jj e_rom U_rom', el: 'jj e_rom l', ea: 'jj a_j', ei: 'jj e_rom I_rom', ele: 'jj e_rom l e_rom',
      e: 'jj e_rom', ești: 'jj e_rom sh d J_ro', este: 'jj e_rom s d e_rom',
      eram: 'jj e_rom dx a_j m', era: 'jj e_rom dx a_j', erai: 'jj e_rom dx a_j I_rom',
      erau: 'jj e_rom dx a_j U_rom', erați: 'jj e_rom dx a_j ts J_ro',
      iubi: 'jj u bv !i', veni: 'v e_rom n !i', trăi: 'd dx @ !i', muri: 'm u dx !i',
      vorbi: 'v o_rom dx bv !i', citi: 'ch_en i d !i', fi: 'f !i',
      găsi: 'gv @ s !i', dori: 'dv o_rom dx !i', privi: 'b dx i v !i', zâmbi: 'z I_ro m bv !i',
      străluci: 's d dx @ l u ch_en !i', mulțumi: 'm u l ts u m !i', aminti: 'a_j m i n d !i',
      întâlni: 'I_ro n d I_ro l n !i', părăsi: 'b @ dx @ s !i', trezi: 'd dx e_rom z !i',
      sosi: 's o_rom s !i', primi: 'b dx i m !i', lovi: 'l o_rom v !i', numi: 'n u m !i',
      împlini: 'I_ro m b l i n !i', pluti: 'b l u d !i', înflori: 'I_ro n f l o_rom dx !i',
      răsări: 'dx @ s @ dx !i', opri: 'o_rom b dx !i', porni: 'b o_rom dx n !i',
      gândi: 'gv I_ro n dv !i', păși: 'b @ sh !i',
      real: 'dx e_rom a_j l', ideal: 'i dv e_rom a_j l', teatru: 'd e_rom a_j d dx u',
      românia: 'dx o_rom m I_ro n !i a_j', maria: 'm a_j dx !i a_j',
      noștri: 'n o_rom sh d dx !i', voștri: 'v o_rom sh d dx !i'
    }
  };

  function romanceRead(raw, lang) {
    var word = raw.toLowerCase().replace(/’/g, "'").replace(/ş/g, 'ș').replace(/ţ/g, 'ț');
    var exceptions = ROMANCE_EXCEPTIONS[lang];
    if (Object.prototype.hasOwnProperty.call(exceptions, word)) return exceptions[word].split(' ');
    if (lang === 'fr' && /[^s]s$/.test(word) && Object.prototype.hasOwnProperty.call(exceptions, word.slice(0, -1))) {
      return exceptions[word.slice(0, -1)].split(' ');
    }
    // -ais/-ait/-aient, 3rd-person plural verb -ent, and the plural of words ending in mute -e.
    if (lang === 'fr') {
      word = word.replace(/ai(?:s|t|ent)$/g, 'è');
      if (!FR_NONVERB_ENT.test(word) && FR_VERB_ENT.test(word)) word = word.replace(/ent$/, 'e');
      word = word.replace(/es$/, 'e');
    }
    var rules = ROMANCE_RULES[lang], phones = [];
    for (var i = 0; i < word.length;) {
      var match = null, reading;
      for (var j = 0; j < rules.length && !match; j++) {
        rules[j][0].lastIndex = i;
        match = rules[j][0].exec(word);
        if (match) reading = rules[j][1];
      }
      if (!match) {
        var letter = word[i].normalize('NFD')[0];
        reading = ROMANCE_STOPS[letter];
      }
      if (reading) phones = phones.concat(reading.split(' '));
      i += match ? match[0].length : lang === 'fr' && word[i] === word[i + 1] ? 2 : 1;
    }
    if (lang === 'es') {
      phones = phones.map(function (id, index) {
        if (!index) return id;
        var prev = phones[index - 1];
        if (id === 'bv' && !/^(m|n|ny|ng)$/.test(prev)) return 'B_es';
        if (id === 'dv' && !/^(m|n|ny|ng|l)$/.test(prev)) return 'dh_es';
        if (id === 'gv' && !/^(m|n|ny|ng)$/.test(prev)) return 'G_es';
        if (id === 'n' && /^(b|bv|m)$/.test(phones[index + 1])) return 'm';
        if (id === 'n' && /^(g|gv|x_es)$/.test(phones[index + 1])) return 'ng';
        return id;
      });
    }
    if (lang === 'pt') {
      // Unstressed final a/e/o and palatalized t/d before [i] / [j].
      if (phones.filter(romanceVowel).length > 1) {
        var final = phones.length - (phones[phones.length - 1] === 's' ? 2 : 1);
        var reduced = { a: 'at_pt', e: '!i', o: '!u' }[word.replace(/s$/, '').slice(-1)];
        if (reduced && romanceVowel(phones[final])) phones[final] = reduced;
      }
      phones = phones.map(function (id, index) {
        return /^(i|!i|i_nas_pt|jj)$/.test(phones[index + 1]) ?
          (id === 'd' ? 'ch_en' : id === 'dv' ? 'jh_en' : id) : id;
      });
    }
    if (lang === 'it' || lang === 'ro') {
      phones = phones.map(function (id, index) {
        return id === 'n' && /^(g|gv)$/.test(phones[index + 1]) ? 'ng' : id;
      });
    }
    if (lang === 'ro' && /[^aeiouăâî]i$/.test(word) && !/[bcdfgpstvzșț][rl]i$/.test(word) &&
        phones[phones.length - 1] === 'i' && phones.filter(romanceVowel).length > 1) {
      // ce/ci and ge/gi are already palatal, while a final i otherwise gives a short release.
      if (/(?:c|g)i$/.test(word)) phones.pop();
      else phones[phones.length - 1] = 'J_ro';
    }
    return phones;
  }

  function romanceVowel(id) {
    var phone = id && NSG.PHONES[id.replace(/^!/, '')];
    return phone && phone.t === 'V' && !phone.glide;
  }

  function romanceSyllables(phones, lang) {
    // Work on vowel runs so an offglide cannot become the next syllable's onset.
    for (var start = 0; start < phones.length; start++) {
      if (!romanceVowel(phones[start])) continue;
      var end = start + 1;
      while (romanceVowel(phones[end])) end++;
      for (var i = start; i < end && lang !== 'fr'; i++) {
        var high = phones[i], next = phones[i + 1], prev = phones[i - 1];
        if (high !== 'i' && high !== 'u') continue;
        var beforeVowel = i + 1 < end && next !== high && !/^![iu]$/.test(next);
        var afterVowel = i > start && prev !== high && romanceVowel(prev);
        // In Brazilian Portuguese, most oral diphthongs have a vowel followed by a glide.
        // In Romanian, e̯a/o̯a already have separate symbols. Allow initial yod and final glides.
        if (beforeVowel && (lang === 'es' || (lang === 'it' && !(high === 'u' && next === 'i')) || (lang === 'ro' && high === 'i'))) {
          phones[i] = high === 'i' ? 'jj' : 'w';
        } else if (afterVowel && (lang !== 'it' || i + 1 === end)) {
          phones[i] = high === 'i' ? 'I_rom' : 'U_rom';
        }
      }
      start = end - 1;
    }
    phones = phones.map(function (id) { return id.replace(/^!/, ''); });
    var nuclei = [], cuts = [0];
    phones.forEach(function (id, index) { if (romanceVowel(id)) nuclei.push(index); });
    for (var n = 1; n < nuclei.length; n++) {
      var endOnset = nuclei[n], left = nuclei[n - 1], cut = endOnset;
      while (cut > left + 1) {
        var first = phones[cut - 1];
        if (NSG.PHONES[first].glide) break;
        var onset = phones.slice(cut - 1, endOnset).join(' ');
        if (cut === endOnset ||
            /^(?:b|bv|B_es|d|dv|dh|dh_es|g|gv|G_es|f|v) (?:l|dx|rr_es|r_fr)(?: (?:jj|w|H_fr|[eo]_glide_ro))?$/.test(onset) ||
            /^(?:\S+ )?(?:jj|w|H_fr|[eo]_glide_ro)$/.test(onset) ||
            (lang === 'it' && /^(?:s|z) (?:b|bv|d|dv|g|gv|f|v|m|n|l)(?: (?:l|dx|rr_es|r_fr|jj|w))?$/.test(onset))) {
          cut--;
        } else break;
      }
      cuts.push(cut);
    }
    cuts.push(phones.length);
    return phones.length ? cuts.slice(0, -1).map(function (cut, i) {
      return phones.slice(cut, cuts[i + 1]);
    }) : [];
  }

  function romance(text, lang) {
    var words = text.normalize('NFC').match(/\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*(?:#[1-9]\d*)?/gu) || [];
    var result = [];
    words.forEach(function (entry) {
      var indexed = entry.match(/^(.+?)#([1-9]\d*)$/), word = indexed ? indexed[1] : entry;
      var groups = [];
      word.split('-').forEach(function (part) {
        groups = groups.concat(romanceSyllables(romanceRead(part, lang), lang));
      });
      var index = indexed ? +indexed[2] - 1 : -1;
      var indexes = index < 0 ? groups.map(function (_, i) { return i; }) : [Math.min(index, groups.length - 1)];
      indexes.forEach(function (i) {
        if (!groups[i]) return;
        result.push({ text: indexed || groups.length === 1 ? entry : word + '#' + (i + 1),
          word: word, roman: groups[i].join(' '), phones: groups[i], extend: index >= groups.length });
      });
    });
    return result;
  }

  /* ---------------- 菲律宾语、印尼语、马来语 ---------------- */
  var SEA_VOWELS = {
    a: 'a_j', i: 'i', u: 'u', o: 'o_rom', é: 'e_rom', è: 'E_rom', ê: '@'
  };
  var SEA_CONSONANTS = {
    b: 'bv', c: 'ch_en', d: 'dv', f: 'f', g: 'gv', h: 'h', j: 'jh_en',
    k: 'g', l: 'l', m: 'm', n: 'n', p: 'b', q: 'g', r: 'dx', s: 's',
    t: 'd', v: 'v', w: 'w', y: 'jj', z: 'z', ng: 'ng', ny: 'ny',
    kh: 'x_de', sy: 'sh', ch: 'ch_en', sh: 'sh', ñ: 'ny', x: 'g s'
  };
  // Standard spelling often leaves e-pepet and e-taling unmarked.
  var SEA_E_READINGS = Object.create(null);
  ('ékor énak énténg és mérah méwah béda bérés bébas bésok bécak cék ' +
    'émosi ékspresi énergi éléktrik éléktronik fonétik geréja éféktif ' +
    'féri keréta kéju kék kém keméja lézat léwat méja méter ' +
    'pésta péta pelését réla réméh récéh selésa seleséma séhat ' +
    'sérong sérét sétan téh téma téléfon télévisi témpo ténis téras ' +
    'tétés téték vidéo protéin modél matéri Indonésia ' +
    'meréka merdéka mélodi karéna soré oléh boléh énjin péngén ' +
    'sepéda déwa déwi kecéwa céwék bébék péndék jelék nénék kakék ' +
    'léhér héwan séwa béla héran hémat téwas tékad méga édar éjék ' +
    'élok ésok étika hotél modérn momén internét présidén prosés suksés ' +
    'persén konsép proyék objék subjék éfék tés téks kontéks témpé ' +
    'karét pakét jakét tikét émbér béngkél jendéla mentéga seléra ' +
    'bendéra bonéka kaméra spésial strés trén hélm rél sén rém ' +
    'anténa aréna corét gorés pamér lébar lémpar témbak bénténg géndong téngok').toLowerCase().split(/\s+/).forEach(function (spelling) {
    SEA_E_READINGS[spelling.replace(/é/g, 'e')] = spelling;
  });
  var SEA_LOAN_K = /^(?:bank|blok|ce[kq]|ko[mn]plek|kontrak|korek|musik|praktik|teknik|truk|trak)$/;
  var SEA_HIATUS_AI = /^(?:meny(?:ukai|amai|ertai)|mem(?:ulai|bawai|paksai|percayai)|meng(?:enai|hargai|uasai)|men(?:cintai|andai|amai|celai)|(?:me|di|ber|ter|per)?(?:cintai|sukai|mulai|hargai|kenai|percayai|nyatai|sertai|tandai|namai|lukai|rasai|samai|bedai|adai|dugai|rayai|kuasai|jagai|warnai|karyai|dambai|pujai))(?:nya|lah|kah|pun|ku|mu)?$/;
  function seaEReading(part) {
    if (SEA_E_READINGS[part]) return SEA_E_READINGS[part];
    var m = part.match(/^(memper|diper|meng|meny|ber|ter|per|mem|men|peng|peny|pem|pen|ke|se|di|me|pe)?([a-z]{3,}?)(nya|lah|kah|pun|ku|mu|kan|an|i)?$/);
    if (m && (m[1] || m[3]) && SEA_E_READINGS[m[2]]) {
      return (m[1] || '') + SEA_E_READINGS[m[2]] + (m[3] || '');
    }
    return part;
  }
  var TAGALOG_READINGS = Object.create(null);
  ('ng:nang mga:manga hindî walâ bastâ mulâ salitâ batà gabì tanghalì ' +
    'kasamà samà sukà punò ibabà bagà dî').split(/\s+/).forEach(function (entry) {
    var pair = entry.split(':');
    var reading = pair[1] || pair[0];
    TAGALOG_READINGS[pair[0].normalize('NFD').replace(/\p{M}/gu, '')] = reading;
  });

  function seaLatinWord(word, lang) {
    var tagalog = lang === 'fil', malay = lang === 'ms';
    var groups = [];
    word.toLowerCase().replace(/’/g, "'").split('-').forEach(function (part) {
      var spelling = tagalog ? (TAGALOG_READINGS[part] || part) : seaEReading(part);
      var glottalTail = tagalog && /[\u0300\u0302]$/.test(spelling.normalize('NFD'));
      if (tagalog) spelling = spelling.normalize('NFD').replace(/[\u0300\u0301\u0302\u0304]/g, '').normalize('NFC');
      var letters = Array.from(spelling.matchAll(tagalog ? /ng|ch|sh|ts|[a-zñ]/g : /ng|ny|kh|sy|[a-zéèêñ]/g));
      var lastLetter = letters.length ? letters[letters.length - 1][0] : '';
      var phones = [], nuclei = [];
      var hiatusAi = !tagalog && SEA_HIATUS_AI.test(part);
      var skipNext = false;
      letters.forEach(function (token, i) {
        if (skipNext) { skipNext = false; return; }
        var letter = token[0];
        var next = letters[i + 1] && letters[i + 1][0];
        var after = letters[i + 2] && letters[i + 2][0];
        var vowel = letter === 'e' ? (tagalog || i === letters.length - 1 ? 'e_rom' : '@') : SEA_VOWELS[letter];
        if (vowel) {
          var isMedialDiphthong = !tagalog && token.index > 0 && (
            (letter === 'u' && spelling[token.index - 1] === 'a' && /^(?:saudara|taubat|daulat|taufan)(?:nya|lah|kah|pun|ku|mu|an|i)?$/.test(part)) ||
            (letter === 'i' && spelling[token.index - 1] === 'a' && /^(?:malaikat|syaitan|kaidah)(?:nya|lah|kah|pun|ku|mu)?$/.test(part))
          );
          if (isMedialDiphthong || (!tagalog && /^(?:ai|au|oi|ei|éi)(?:nya|lah|kah|pun|ku|mu)?$/.test(spelling.slice(token.index - 1)) &&
              token.index > 0 && /[iu]/.test(letter) && !/^mau(?:lah|kah|pun)?$/.test(part) &&
              !(hiatusAi && i === letters.length - 1))) {
            phones.push(letter === 'u' ? 'U_rom' : 'I_rom');
            return;
          }
          if (tagalog && (!i || nuclei[nuclei.length - 1] === phones.length - 1)) phones.push('q');
          nuclei.push(phones.length);
          phones.push(vowel);
          return;
        }
        var consonant = SEA_CONSONANTS[letter];
        if (tagalog) {
          if (letter === 'c') consonant = next && /^[ei]$/.test(next) ? 's' : 'g';
          else if (letter === 'q') {
            consonant = 'g';
            if (next === 'u' && after && /^[ei]$/.test(after)) skipNext = true;
          } else if (letter === 'ts') {
            consonant = next && /^[aeiou]$/.test(next) ? 'ch_en' : 'd s';
          }
        } else {
          if (letter === 'v') consonant = 'f';
          if (letter === 'n' && next === 'k' && /^(?:bank|sanksi|konkret|sinkron)/.test(part)) consonant = 'ng';
          if (letter === 'k' || letter === 'q') {
            if (i === letters.length - 1) {
              consonant = SEA_LOAN_K.test(part) ? 'k_cl' : 'q';
            } else if (/^[kq](?:nya|lah|kah|pun|ku|mu)$/.test(spelling.slice(token.index))) {
              var stem = part.slice(0, token.index + 1);
              consonant = SEA_LOAN_K.test(stem) ? 'k_cl' : 'q';
            }
          }
        }
        if (consonant) phones.push.apply(phones, consonant.split(' '));
      });
      if (!nuclei.length) return;
      if (malay && lastLetter === 'a' && nuclei.length > 1) {
        phones[nuclei[nuclei.length - 1]] = '@';
      }
      if (malay && phones[phones.length - 1] === 'dx') {
        phones.pop();
        var prevNucleus = nuclei[nuclei.length - 1];
        if (prevNucleus === phones.length - 1) {
          if (phones[prevNucleus] === 'i') phones[prevNucleus] = 'e_rom';
          else if (phones[prevNucleus] === 'u') phones[prevNucleus] = 'o_rom';
        }
      }
      if (glottalTail) phones.push('q');

      var start = 0;
      for (var i = 1; i < nuclei.length; i++) {
        var left = nuclei[i - 1], right = nuclei[i], cut = Math.max(left + 1, right - 1);
        var onset = phones.slice(cut - 1, right).join(' ');
        if (cut > left + 1 && /^(?:b|bv|d|dv|g|gv|f) (?:l|dx)$/.test(onset) && (tagalog || onset !== 'g l')) cut--;
        else if (tagalog && cut > left + 2 && /^(?:b|bv|d|dv|g|gv|f|s) (?:w|jj)$/.test(onset)) cut--;
        groups.push({ phones: seaLatinCoda(phones.slice(start, cut)) });
        start = cut;
      }
      groups.push({ phones: seaLatinCoda(phones.slice(start)) });
    });
    return groups;
  }

  var SEA_STOP_CODA = { b: 'p_cl', bv: 'p_cl', d: 't_cl', dv: 't_cl', g: 'k_cl', gv: 'k_cl' };
  function seaLatinCoda(phones) {
    var last = phones.length - 1, coda = SEA_STOP_CODA[phones[last]];
    if (coda) phones[last] = coda;
    if (phones[last] === 'jj') phones[last] = 'I_rom';
    if (phones[last] === 'w') phones[last] = 'U_rom';
    return phones;
  }

  /* ---------------- 泰语 ---------------- */
  var THAI_VOWELS = {
    a: 'a_j', i: 'i', u: 'u', e: 'e_rom', o: 'o_rom', ɛ: 'E_rom',
    ɔ: 'O_rom', ɯ: 'eu_ko', ɤ: 'oe_th', ə: '@', ɨ: 'eu_ko', æ: 'E_rom'
  };
  var THAI_CONSONANTS = {
    k: 'g', 'kʰ': 'kh', p: 'b', 'pʰ': 'ph', t: 'd', 'tʰ': 't_h',
    b: 'bv', d: 'dv', 't͡ɕ': 'ts_j', 't͡ɕʰ': 'tsh_j', c: 'ts_j', 'cʰ': 'tsh_j',
    f: 'f', h: 'h', s: 's', m: 'm', n: 'n', ŋ: 'ng', r: 'dx', l: 'l', w: 'w', j: 'jj',
    ʔ: 'q', ɓ: 'bv', ɗ: 'dv'
  };
  var THAI_TONES = { '˧': 1, '˨˩': 2, '˥˩': 3, '˦˥': 4, '˩˩˦': 5 };
  var THAI_CODAS = { k: 'k_cl', p: 'p_cl', t: 't_cl', j: 'I_rom', w: 'U_rom' };

  // Convert tokenized IPA from the Thai lexicon to the voice engine's sound inventory.
  NSG.thaiIPA = function (ipa) {
    var result = [];
    var syllables = ipa.trim().replace(/\s*\.\s*/g, '.').replace(/\.$/, '').split('.');
    for (var i = 0; i < syllables.length; i++) {
      var raw = syllables[i], tokens = raw.match(/t͡ɕʰ?|[kptc]ʰ|a̯|[aieuoɛɔɯɤəɨæ]ː?|[a-zŋʔɓɗ]\u031a?|[˥˦˧˨˩]+/gu) || [];
      if (tokens.join('') !== raw.replace(/\s/g, '')) return null;
      var tone = THAI_TONES[tokens[tokens.length - 1]];
      if (tone) tokens.pop();
      var phones = [], seenVowel = false, vowelLength;
      for (var p = 0; p < tokens.length; p++) {
        var token = tokens[p], symbol = token[0], vowel = THAI_VOWELS[symbol];
        if (token === 'a̯' && seenVowel) { phones.push('a_off_th'); vowelLength = 'diphthong'; }
        else if (vowel && !seenVowel) {
          phones.push(vowel); seenVowel = true; vowelLength = token.endsWith('ː') ? 'long' : 'short';
        } else {
          var base = token.replace(/\u031a$/, '');
          var phone = (seenVowel && THAI_CODAS[base]) || THAI_CONSONANTS[base];
          if (!phone) return null;
          phones.push(phone);
        }
      }
      if (!seenVowel) return null;
      result.push({ phones: phones, tone: tone, vowelLength: vowelLength });
    }
    return result;
  };

  var THAI_ONSETS = {
    ก: 'k', ข: 'kʰ', ฃ: 'kʰ', ค: 'kʰ', ฅ: 'kʰ', ฆ: 'kʰ', ง: 'ŋ', จ: 't͡ɕ', ฉ: 't͡ɕʰ',
    ช: 't͡ɕʰ', ซ: 's', ฌ: 't͡ɕʰ', ญ: 'j', ฎ: 'd', ฏ: 't', ฐ: 'tʰ', ฑ: 'tʰ', ฒ: 'tʰ',
    ณ: 'n', ด: 'd', ต: 't', ถ: 'tʰ', ท: 'tʰ', ธ: 'tʰ', น: 'n', บ: 'b', ป: 'p',
    ผ: 'pʰ', ฝ: 'f', พ: 'pʰ', ฟ: 'f', ภ: 'pʰ', ม: 'm', ย: 'j', ร: 'r', ล: 'l',
    ว: 'w', ศ: 's', ษ: 's', ส: 's', ห: 'h', ฬ: 'l', อ: 'ʔ', ฮ: 'h'
  };
  var THAI_FINALS = Object.create(null);
  ['กขฃคฅฆ:k', 'จฉชซฌฎฏฐฑฒดตถทธศษส:t', 'บปผฝพฟภ:p', 'ญณนรลฬ:n',
    'ง:ŋ', 'ม:m', 'ย:j', 'ว:w'].forEach(function (entry) {
    var pair = entry.split(':');
    pair[0].split('').forEach(function (letter) { THAI_FINALS[letter] = pair[1]; });
  });
  // Prefix vowel, then the rime written after the onset. A trailing + requires a final consonant.
  var THAI_RIMES = {
    '': 'ัวะ:ua̯ ัว:ua̯ ว+:ua̯ รร+:a รร:an ะ:a ั+:a า:aː ำ:am ิ:i ี:iː ึ:ɯ ือ:ɯː ื+:ɯː ุ:u ู:uː ็อ+:ɔ อ:ɔː +:o :a',
    เ: 'ียะ:ia̯ ีย:ia̯ ือะ:ɯa̯ ือ:ɯa̯ าะ:ɔ า:aw อะ:ɤ อ:ɤː ิ+:ɤː ย:ɤːj ะ:e ็+:e :eː',
    แ: 'ะ:ɛ ็+:ɛ :ɛː', โ: 'ะ:o :oː', ใ: ':aj', ไ: ':aj'
  };
  Object.keys(THAI_RIMES).forEach(function (prefix) {
    THAI_RIMES[prefix] = THAI_RIMES[prefix].split(' ').map(function (entry) {
      var pair = entry.split(':');
      return { tail: pair[0].replace(/\+$/, ''), closed: pair[0].endsWith('+'), ipa: pair[1] };
    });
  });
  var THAI_CLUSTERS = /^(?:[กขค][รลว]|[ปผพ][รล]|ตร|[บฟ][รล]|ดร)/;

  function thaiTone(letter, mark, live, long) {
    var high = 'ขฃฉฐถผฝศษสห'.indexOf(letter) >= 0;
    var mid = 'กจฎฏดตบปอ'.indexOf(letter) >= 0;
    if (mark === '่') return high || mid ? 2 : 3;
    if (mark === '้') return high || mid ? 3 : 4;
    if (mark === '๊') return 4;
    if (mark === '๋') return 5;
    return live ? (high ? 5 : 1) : (high || mid ? 2 : long ? 3 : 4);
  }

  function thaiFallback(word) {
    var marks = Object.create(null), text = '';
    word.replace(/[ก-ฮ][ัิ-ู]?์/g, '').replace(/ํ([่้๊๋]?)า/g, '$1ำ').split('').forEach(function (ch) {
      if (/[่้๊๋]/.test(ch)) marks[text.length - 1] = ch;
      else text += ch;
    });
    var best = new Array(text.length + 1);
    best[text.length] = { cost: 0 };
    for (var i = text.length - 1; i >= 0; i--) {
      var prefix = /^[เแโใไ]$/.test(text[i]) ? text[i] : '';
      var pos = i + prefix.length, first = text[pos], pair = text.slice(pos, pos + 2);
      best[i] = { cost: best[i + 1].cost + 20, next: i + 1 };
      if (first === 'ฤ' || first === 'ฦ') {
        var endR = pos + (text[pos + 1] === 'ๅ' ? 2 : 1);
        var rReading = NSG.thaiIPA((first === 'ฤ' ? 'r' : 'l') + (endR > pos + 1 ? 'ɯː' : 'ɯ'))[0];
        rReading.tone = endR > pos + 1 ? 1 : 4;
        best[i] = { cost: best[endR].cost + 2, next: endR, reading: rReading };
      }
      if (!THAI_ONSETS[first]) continue;
      var onsets = [THAI_ONSETS[first]];
      var hasCluster = false;
      if (/^(?:ห[งญณนมยรลว]|อย)$/.test(pair)) onsets.push(THAI_ONSETS[pair[1]]);
      else if (pair === 'ทร') onsets.push('s');
      else if (THAI_CLUSTERS.test(pair)) { onsets.push(onsets[0] + THAI_ONSETS[pair[1]]); hasCluster = true; }
      onsets.forEach(function (onset, o) {
        var head = pos + 1 + o;
        THAI_RIMES[prefix].forEach(function (rime) {
          if (!text.startsWith(rime.tail, head)) return;
          var end = head + rime.tail.length, final = THAI_FINALS[text[end]];
          var openCost = !prefix && !rime.tail ? 4 : 1;
          function candidate(next, coda, cost) {
            var total = best[next].cost + cost;
            if (o === 1 && hasCluster && prefix ? total > best[i].cost : total >= best[i].cost) return;
            var vowel = !prefix && !rime.tail && coda && text[end] === 'ร' ? 'ɔː' : rime.ipa;
            var long = !rime.tail.endsWith('ะ') && /ː|̯/.test(vowel);
            var live = /[jwmnŋ]$/.test(coda || vowel) || (!coda && long);
            var checked = !live && !coda && (next === text.length || rime.tail.endsWith('ะ')) ? 'ʔ' : '';
            var toneMark;
            for (var m = pos; m < next; m++) if (marks[m]) toneMark = marks[m];
            var reading = NSG.thaiIPA(onset + vowel + (coda || checked))[0];
            reading.tone = thaiTone(first, toneMark, live, long);
            best[i] = { cost: total, next: next, reading: reading };
          }
          if (!rime.closed) candidate(end, '', openCost);
          if (final && !/[ะำ]$/.test(rime.tail) && !/[jwmnŋ]$/.test(rime.ipa)) candidate(end + 1, final, 1);
        });
      });
    }
    var result = [];
    for (var at = 0; at < text.length; at = best[at].next) {
      if (best[at].reading) result.push(best[at].reading);
    }
    return result;
  }

  var thaiSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ?
    new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function thaiRead(word) {
    var dictionary = root.NSG_DICT.th || {};
    function decode(reading) {
      return reading.split('/').map(function (syllable) {
        var fields = syllable.split(':');
        return { phones: fields[0].split(' '), tone: +fields[1] || undefined,
          vowelLength: { s: 'short', l: 'long', d: 'diphthong' }[fields[2]] };
      });
    }
    // ICU sometimes treats compounds as a single word and newer names as
    // several individual consonants. Rejoin those before rule-based reading.
    function readToken(token) {
      if (dictionary[token]) return decode(dictionary[token]);
      var cuts = new Array(token.length + 1);
      cuts[token.length] = { count: 0 };
      for (var i = token.length - 2; i >= 0; i--) {
        for (var end = Math.min(i + 48, token.length); end >= i + 2; end--) {
          if (!cuts[end]) continue;
          var piece = token.slice(i, end);
          if (/^[เแโ][ก-ฮ]{1,2}[่้๊๋]?$/.test(piece) && /^(?:อะ|าะ|อ|ีย|ือ)/.test(token.slice(end))) continue;
          var reading = dictionary[piece];
          if (reading && (!cuts[i] || cuts[end].count + 1 < cuts[i].count)) {
            cuts[i] = { count: cuts[end].count + 1, end: end, reading: reading };
          }
        }
      }
      if (!cuts[0] || !cuts[0].reading) return thaiFallback(token);
      var syllables = [];
      for (var at = 0; at < token.length; at = cuts[at].end) {
        syllables = syllables.concat(decode(cuts[at].reading));
      }
      if (syllables.length > 1) {
        var fb = thaiFallback(token);
        if (fb.length === 1) return fb;
      }
      return syllables;
    }
    var result = [];
    var previous = [];
    word.split(/(ๆ)/).forEach(function (part) {
      if (part === 'ๆ') { result = result.concat(previous); return; }
      if (!part) return;
      var tokens = [];
      if (dictionary[part] || !thaiSegmenter) tokens.push(part);
      else {
        var pending = '';
        var segments = Array.from(thaiSegmenter.segment(part));
        segments.forEach(function (item, i) {
          var token = item.segment;
          var next = segments[i + 1] && segments[i + 1].segment;
          if (/^[ก-ฮ][ัิ-ู]?์|^[ก-ฮ]{2}์$/.test(token) || (/^[ะาำัิ-ู็-์]+$/.test(token) && !pending && tokens.length)) {
            if (pending) {
              pending += token;
              if (next) return;
              tokens.push(pending);
              pending = '';
            } else if (tokens.length) {
              tokens[tokens.length - 1] += token;
            } else {
              tokens.push(token);
            }
            return;
          }
          if ((token.length === 1 && part.length > 1 && !/^[ณก็]$/.test(token)) ||
              /ั[่้๊๋]?$/.test(token) || /^[เแโใไ]$/.test(token) ||
              (pending && next && next.length === 1 && /^[ก-ฮ][ัิ-ู็่-์]+$/.test(token))) {
            pending += token;
            if (next) return;
            tokens.push(pending);
          } else {
            if (pending) {
              if (/ั[่้๊๋]?$|^[เแโใไ]$/.test(pending)) { tokens.push(pending + token); pending = ''; return; }
              tokens.push(pending);
            }
            tokens.push(token);
          }
          pending = '';
        });
      }
      tokens.forEach(function (token) {
        previous = readToken(token);
        result = result.concat(previous);
      });
    });
    return result;
  }

  function southeastAsian(text, lang) {
    var words = text.normalize('NFC').match(lang === 'th' ? /[ก-ฺเ-๎]+(?:#[1-9]\d*)?/g :
      /\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*(?:['’])?(?:#[1-9]\d*)?/gu) || [];
    var result = [], lastThaiGroups = [];
    words.forEach(function (entry) {
      var indexed = entry.match(/^(.+?)#([1-9]\d*)$/);
      var word = indexed ? indexed[1] : entry;
      var groups = lang === 'th' ? (word === 'ๆ' ? lastThaiGroups : thaiRead(word)) : seaLatinWord(word, lang);
      if (lang === 'th' && word !== 'ๆ' && groups.length) lastThaiGroups = groups;
      if (!groups.length) return;
      var index = indexed ? +indexed[2] - 1 : -1;
      var indexes = indexed ? [Math.min(index, groups.length - 1)] :
        groups.map(function (_, i) { return i; });
      indexes.forEach(function (i) {
        var syllable = groups[i];
        result.push(Object.assign({}, syllable, {
          text: indexed || groups.length === 1 ? entry : word + '#' + (i + 1),
          word: word, roman: syllable.phones.join(' '), extend: index >= groups.length
        }));
      });
    });
    return result;
  }

  /* ---------------- 统一入口 ---------------- */
  var LANG_INITIALS = { zh: ZH_INIT, 'zh-x-sichuan': SC_INIT, yue: YUE_INIT, nan: NAN_INIT };

  NSG.g2p = function (text, lang) {
    lang = lang || 'zh';
    text = (text || '').replace(/\s+/g, ' ').trim();
    if (!text) return [];
    var hasDict = !!(cache[lang] || (root.NSG_DICT && root.NSG_DICT[lang]));
    var cacheKey = text.length <= 160 ? (lang + (hasDict ? '\x01' : '\x00') + text) : '';
    if (cacheKey) {
      var cachedG2p = g2pCache.get(cacheKey);
      if (cachedG2p) return cloneSyllableList(cachedG2p);
    }
    var result = g2pUncached(text, lang);
    if (cacheKey) {
      if (g2pCache.size >= G2P_CACHE_MAX) g2pCache.delete(g2pCache.keys().next().value);
      g2pCache.set(cacheKey, cloneSyllableList(result));
    }
    return result;
  };

  function g2pUncached(text, lang) {
    var hinted = phoneticHint(text, lang);
    if (hinted) return hinted;
    // 小写 ap 在粤拼、臺羅与新增语言中按歌词解析；大写 AP 仍是换气标记。
    // 希顶语（xdi8）的 b/r/1~5 均为有效字母，仅保留不带数字的 br/AP/SP。
    var parts = text.split(lang === 'eo' || lang === 'fi' || ROMANCE_LANG.test(lang) || SOUTHEAST_ASIAN_LANG.test(lang) ? /(?<![\p{L}\p{M}0-9'’-])([bB][rR][1-5]?|AP|[sS][pP])(?![\p{L}\p{M}0-9'’-])/gu :
      lang === 'xdi8' ? /(?<!\S)(br|BR|AP|SP)(?!\S)/g :
      /^(tok|asaxi|tlh)$/.test(lang) ? /(?<!\S)(br[1-5]?|BR[1-5]?|AP|SP)(?!\S)/g :
      lang === 'de' ? /(?<![a-z0-9äöüßà-öø-ÿ\u0300-\u036f])(br[1-5]?|AP|SP)(?![a-z0-9äöüßà-öø-ÿ\u0300-\u036f])/gi :
      /^(pl|ru|uk)$/.test(lang) ? /(?<![a-z0-9ąćęłńóśźżà-öø-ÿа-яёєіїґ\u0400-\u04ff\u0300-\u036f])([bB][rR][1-5]?|AP|[sS][pP])(?![a-z0-9ąćęłńóśźżà-öø-ÿа-яёєіїґ\u0400-\u04ff\u0300-\u036f])/g :
      /^(yue|nan|hak|nan-x-teochew|zh-x-sichuan|ko|vi)$/.test(lang) ? /(\b(?:[bB][rR][1-5]?|AP|[sS][pP])\b)/g : /(\b(?:br[1-5]?|AP|SP)\b)/gi);
    if (parts.length > 1) {
      var syllables = [];
      parts.forEach(function (part) {
        var special = NSG.specialPhone(part, lang);
        if (special) syllables.push({ text: part, phones: [special], roman: part });
        else if (part.trim()) syllables = syllables.concat(NSG.g2p(part, lang));
      });
      return syllables;
    }
    if (lang === 'nan') text = normalizeNan(text);
    if (HAK_TEOCHEW.test(lang)) text = text.normalize('NFC');
    if (lang === 'zh' || lang === 'zh-x-sichuan') text = text.replace(/ü/gi, 'v').replace(/u:/gi, 'v').replace(/ȵ/gi, 'ny');
    var out = [];
    var i = 0;
    if (lang === 'ko') return koResolve(koTokens(text));
    if (lang === 'vi') return vietnamese(text);
    if (lang === 'de') return german(text);
    if (lang === 'pl') return polish(text);
    if (lang === 'ru') return russian(text);
    if (lang === 'uk') return ukrainian(text);
    if (lang === 'fi') return finnish(text);
    if (ROMANCE_LANG.test(lang)) return romance(text, lang);
    if (SOUTHEAST_ASIAN_LANG.test(lang)) return southeastAsian(text, lang);
    if (lang === 'eo' || lang === 'tok' || lang === 'asaxi' || lang === 'xdi8' || lang === 'tlh') return conlang(text, lang);
    if (lang === 'en') {
      var words = text.split(/[\s，。！？；：、]+|(?<=[a-z0-9'’])\s*[,.;:!?]+\s*(?=[a-z'’])/i).filter(Boolean);
      for (var w = 0; w < words.length; w++) {
        var indexed = words[w].match(/^(.+?)#([1-9]\d*)$/);
        var key = englishKey(indexed ? indexed[1] : words[w]);
        if (!key) continue;
        var arp = englishLookup(key);
        // The pronoun remains /aɪ/ even before the dictionary has loaded.
        var phones = arp ? enWordToPhones(arp) : key === 'i' ? ['a', 'I'] : enLetters(key);
        var extend = false;
        if (indexed) {
          var syllables = NSG.englishSyllables(key), index = +indexed[2] - 1;
          extend = index >= syllables.length;
          phones = syllables[Math.min(index, syllables.length - 1)] || phones;
        }
        out.push({ text: words[w], phones: phones, roman: arp || '(规则推导)', extend: extend });
      }
      return out;
    }
    if (lang === 'ja') {
      // 片假名统一成平假名后逐「拍」切分：一拍 = 一个音符
      var norm = '';
      for (var ci = 0; ci < text.length; ci++) {
        var cc = text.charCodeAt(ci);
        norm += (cc >= 0x30a1 && cc <= 0x30f6) ? String.fromCharCode(cc - 0x60) : text[ci];
      }
      var SMALL = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };
      var STEM = { 'き': 'ky', 'ぎ': 'gy', 'し': 'sh', 'じ': 'j', 'ち': 'ch', 'に': 'ny', 'ひ': 'hy', 'び': 'by', 'ぴ': 'py', 'み': 'my', 'り': 'ry', 'ぢ': 'dy' };
      var romanBuf = '';
      var pendingStop = null, pendingText = '', pendingAttached = false;
      var attachedAfterKana = false;
      var flushPendingStop = function () {
        if (!pendingStop) return;
        if (pendingAttached && out.length) {
          var prevOut = out[out.length - 1];
          prevOut.phones.push(pendingStop);
          prevOut.text += pendingText;
          prevOut.roman = (prevOut.roman ? prevOut.roman + ' ' : '') + 'cl';
        } else {
          out.push({ text: pendingText || 'cl', phones: [pendingStop], roman: 'cl' });
        }
        pendingStop = null; pendingText = ''; pendingAttached = false;
      };
      var flushRoman = function (beforeKana) {
        if (!romanBuf) return;
        if (/^cl$/i.test(romanBuf)) {
          if (beforeKana) {
            flushPendingStop();
            pendingStop = 'cl'; pendingText = romanBuf; pendingAttached = false;
          } else if (attachedAfterKana && out.length) {
            var prevKana = out[out.length - 1];
            prevKana.phones.push('cl');
            prevKana.text += romanBuf;
            prevKana.roman = (prevKana.roman ? prevKana.roman + ' ' : '') + 'cl';
          } else {
            flushPendingStop();
            out.push({ text: romanBuf, phones: ['cl'], roman: 'cl' });
          }
          romanBuf = '';
          attachedAfterKana = false;
          return;
        }
        var ph0 = romajiToPhones(romanBuf);
        if (pendingStop) { ph0.unshift(pendingStop); pendingStop = null; pendingText = ''; pendingAttached = false; }
        if (ph0.length) out.push({ text: romanBuf, phones: ph0, roman: romanBuf });
        romanBuf = '';
        attachedAfterKana = false;
      };
      var i3 = 0;
      while (i3 < norm.length) {
        var cp3 = norm.codePointAt(i3), cl3 = cp3 > 0xffff ? 2 : 1, ch3 = norm.slice(i3, i3 + cl3);
        if (ch3 === ' ' || ch3 === '　' || ch3 === '\n') { flushRoman(false); flushPendingStop(); attachedAfterKana = false; i3++; continue; }
        if (isHanCode(cp3)) {
          flushRoman(false);
          flushPendingStop();
          var jd = cache.ja || (root.NSG_DICT.ja ? (cache.ja = makeMap(root.NSG_DICT.ja, 'ja')) : {});
          var rm = jd[ch3];
          if (rm) {
            var firstRm = rm.split(' ')[0].toLowerCase();
            out.push({ text: ch3, phones: romajiToPhones(firstRm), roman: firstRm });
          } else {
            out.push({ text: ch3, phones: ['@'], roman: '?' });
          }
          attachedAfterKana = true;
          i3 += cl3; continue;
        }
        var kc = ch3.charCodeAt(0);
        if (kc === 0x30FC || ch3 === 'ー') {         // 长音：延长上一拍的元音
          flushRoman(false);
          flushPendingStop();
          var last = out[out.length - 1];
          if (last) {
            for (var q2 = last.phones.length - 1; q2 >= 0; q2--) {
              if (NSG.phoneOf(last.phones[q2]).t === 'V') { last.phones.push(last.phones[q2]); break; }
            }
          }
          i3++; continue;
        }
        var isK = (kc >= 0x3041 && kc <= 0x3096);
        if (isK) {
          flushRoman(true);
          if (ch3 === 'っ') {                       // 促音：并入下一拍声母，句尾或单拍时独立/附尾成持阻
            flushPendingStop();
            pendingStop = 'cl'; pendingText = ch3; pendingAttached = attachedAfterKana;
            attachedAfterKana = false;
            i3++; continue;
          }
          if (ch3 === 'ん') {
            var nPh = ['N_j'], nTxt = 'ん', nRm = 'n';
            if (pendingStop) { nPh.unshift(pendingStop); nTxt = pendingText + nTxt; nRm = 'cl' + nRm; pendingStop = null; pendingText = ''; pendingAttached = false; }
            out.push({ text: nTxt, phones: nPh, roman: nRm });
            attachedAfterKana = true;
            i3++; continue;
          }
          var nxt = norm[i3 + 1] || '';
          var combo = KANA_COMBO[ch3 + nxt] || (SMALL[nxt] && STEM[ch3] ? STEM[ch3] + SMALL[nxt] : '');
          var rmb;
          if (combo) {
            rmb = combo;
            i3 += 2;
          } else {
            rmb = KANA[ch3] || '';
            i3 += 1;
          }
          if (!rmb) continue;
          var ph = romajiToPhones(rmb);
          var kanaTxt = ch3 + (combo ? nxt : ''), kanaRm = rmb;
          if (pendingStop) { ph.unshift(pendingStop); kanaTxt = pendingText + kanaTxt; kanaRm = 'cl' + kanaRm; pendingStop = null; pendingText = ''; pendingAttached = false; }
          if (ph.length) {
            out.push({ text: kanaTxt, phones: ph, roman: kanaRm });
            attachedAfterKana = true;
          }
          continue;
        }
        if (/[a-zA-Z]/.test(ch3) || (ch3 === '-' && romanBuf)) { romanBuf += ch3; i3++; continue; }
        flushRoman(false);
        flushPendingStop();
        attachedAfterKana = false;
        if (ch3 === '-' && out.length) {
          var lastRm = out[out.length - 1];
          for (var q3 = lastRm.phones.length - 1; q3 >= 0; q3--) {
            if (NSG.phoneOf(lastRm.phones[q3]).t === 'V') { lastRm.phones.push(lastRm.phones[q3]); break; }
          }
          i3++; continue;
        }
        i3++;
      }
      flushRoman(false);
      flushPendingStop();
      return out;
    }
    // 汉字逐字取音，罗马字按各拼音方案切分。
    var conv = { zh: zhSyllable, 'zh-x-sichuan': sichuanSyllable, yue: yueSyllable, nan: nanSyllable, hak: hakSyllable, 'nan-x-teochew': teochewSyllable };
    var zhReadings = lang === 'zh' ? mandarinPhraseReadings(text) : null;
    while (i < text.length) {
      var cp2 = text.codePointAt(i), cl2 = cp2 > 0xffff ? 2 : 1, ch2 = text.slice(i, i + cl2);
      if (ch2 === ' ' || ch2 === '　' || ch2 === '\n') { i++; continue; }
      if (isHanCode(cp2)) {
        var phrase = lang === 'nan' && NAN_PHRASES[text.slice(i, i + 2)];
        if (phrase) {
          phrase.forEach(function (reading, index) {
            out.push({ text: text[i + index], phones: nanSyllable(reading), roman: reading, tone: +reading.slice(-1) });
          });
          i += phrase.length; continue;
        }
        var d = cache[lang] || (root.NSG_DICT[lang] ? (cache[lang] = makeMap(root.NSG_DICT[lang], lang)) : {});
        var rd = (zhReadings && zhReadings[i]) || d[ch2];
        if (!rd) { out.push({ text: ch2, phones: ['@'], roman: '?' }); i += cl2; continue; }
        out.push({ text: ch2, phones: conv[lang](rd), roman: rd, tone: rd.match(/([1-8])$/) ? +rd.match(/([1-8])$/)[1] : 0 });
        i += cl2; continue;
      }
      if (/[a-zA-ZêÊ]/.test(ch2)) {
        var start = i;
        if (HAK_TEOCHEW.test(lang)) {
          DIALECT_ROMAN.lastIndex = i;
          var token = DIALECT_ROMAN.exec(text)[0];
          i += token.length;
          var roman = token.toLowerCase();
          var mark = roman.slice(-1), tone = Number(mark) || 0;
          if (lang === 'hak' && /[ˊˇˋ]/.test(mark)) {
            tone = mark === 'ˊ' ? 1 : mark === 'ˇ' ? 5 : /(?:[bd]|[^n]g)ˋ$/.test(roman) ? 4 : 2;
          }
          out.push({ text: token, phones: conv[lang](roman), roman: roman, tone: tone });
          continue;
        }
        while (i < text.length && (lang === 'zh-x-sichuan' ? /[a-zA-ZêÊ'1-5]/ : /[a-zA-ZêÊ']/).test(text[i])) i++;
        var chunk = text.slice(start, i);
        var sylls = splitRoman(chunk, lang);
        for (var s = 0; s < sylls.length; s++) {
          var tm = lang === 'zh-x-sichuan' ? sylls[s].match(/([1-5])$/) : null;
          out.push({ text: sylls[s], phones: conv[lang](sylls[s]), roman: sylls[s], tone: tm ? +tm[1] : 0 });
        }
        continue;
      }
      i++;
    }
    return out;
  };

  function resolveMandarinNotes(notes) {
    var owners = [], previous = null;
    function flush() {
      if (owners.length > 1) {
        var text = owners.map(function (n) { return n.lyric; }).join('');
        mandarinPhraseReadings(text).forEach(function (reading, i) {
          var note = owners[i], phones = zhSyllable(reading), timing = note.phonemeTiming;
          if (timing && timing.lang === 'zh' && !sameStringArray(timing.phones, phones)) {
            var prior = note.phones || NSG.g2p(note.lyric, 'zh')[0].phones;
            if (sameStringArray(timing.phones, prior)) return;
          }
          note.phones = phones;
        });
      }
      owners = [];
    }
    notes.forEach(function (note) {
      if (previous && (previous.lyricGroup !== note.lyricGroup || note.phonemeWordJoin === false ||
          Math.abs(previous.start + previous.dur - note.start) >= 0.002)) flush();
      previous = note;
      if (note.lang !== 'zh' || NSG.noteKind(note) !== 'voiced' || note._phonesCustom) {
        flush(); return;
      }
      if (note.slur && !(note.phones && note.phones.length)) return;
      if (!note.lyric || note.lyric.length !== 1 || !isHan(note.lyric)) { flush(); return; }
      if (note.phones && note.phones.length) {
        var single = NSG.g2p(note.lyric, 'zh')[0];
        if (!single || (note.phonesSource !== 'auto' && !sameStringArray(note.phones, single.phones))) { flush(); return; }
        if (single.roman !== '?') note.phones = single.phones;
      }
      owners.push(note);
    });
    flush();
  }

  // Bind dictionary stress only when it describes the phones actually sung.
  // The last '+' in a partially split word may carry several remaining syllables.
  function englishNoteStress(note) {
    if (note.slur || note._phonesCustom || !note.phones) return;
    var word = String(note.lyric || '').replace(/#\d+$/, '');
    if (!/^[a-z'’-]+$/i.test(word)) return;
    var arp = englishLookup(englishKey(word));
    if (!arp) return;
    var vowels = arp.match(/\b[A-Z]+[012]\b/g);
    if (!vowels || vowels.length < 2) return;
    var first = note._autoContinuation ? Number(note.lyric.split('#')[1]) - 1 : 0;
    var groups = arpSyllables(arp).slice(first);
    if (groups.length < 2 || groups.length !== vowels.length - first ||
        !sameStringArray(note.phones, [].concat.apply([], groups))) return;
    var offset = 0, stress = [];
    groups.forEach(function (phones, i) {
      // AO IH across two syllables (drawing) and OY inside one syllable
      // map to the same two phone IDs. Only the dictionary knows the boundary.
      var nucleus = phones.findIndex(function (id) { return NSG.phoneOf(id).t === 'V'; });
      if (nucleus >= 0) stress[offset + nucleus] = Number(vowels[first + i].slice(-1));
      offset += phones.length;
    });
    note._stressByPhone = stress;
  }

  // Resolve continuation lyrics on fresh runtime records. Importers and editors
  // store '+' verbatim; the phonemizer, not file language metadata, owns meaning.
  NSG.phonemizeNotes = function (source, defaultLang, selected) {
    var notes = (source || []).map(function (n) {
      var copy = {};
      Object.keys(n).forEach(function (key) { if (key.charAt(0) !== '_') copy[key] = n[key]; });
      var explicitLang = n.noteLang || (n.langSource === 'note' ? n.lang : '');
      var resolvedLang = explicitLang || selected || n.lang || defaultLang || 'zh';
      copy.lang = resolvedLang;
      var storedPhonesLang = n.phonesLang || (!n.noteLang && n.langSource === 'note' ? n.lang : '') || n.lang || defaultLang;
      if ((explicitLang || selected) && storedPhonesLang !== resolvedLang) delete copy.phones;
      copy._phonesCustom = !!(copy.phones && /^(manual|imported)$/.test(n.phonesSource || ''));
      copy._storedPhones = copy.phones && !n.phonesSource ? copy.phones.slice() : null;
      var hasHint = /\[[^\]]*\]/.test(copy.lyric || '');
      var origLang = explicitLang || n.lang;
      if (hasHint && (n.ignorePhoneticHint || (origLang && origLang !== copy.lang))) {
        copy.lyric = String(copy.lyric).replace(/\s*\[[^\]]*\]/g, '').trim();
      } else if (hasHint && /^(en|asaxi)$/.test(copy.lang)) copy._phonesCustom = true;
      return copy;
    }).sort(function (a, b) { return a.start - b.start; });
    var head = null, word = '', index = 1;
    notes.forEach(function (n, i) {
      var prev = notes[i - 1];
      if (!prev || prev.lang !== n.lang || prev.lyricGroup !== n.lyricGroup ||
          Math.abs(prev.start + prev.dur - n.start) >= 0.002) head = null;
      if (NSG.noteKind(n) !== 'voiced') { head = null; return; }
      var lyric = String(n.lyric || '');
      var numbered = lyric.match(/^(.+?)#([1-9]\d*)$/);
      if (!NSG.isWordPhonemizer(n.lang) && numbered) {
        // Compatibility with ACEP and older NSG projects, without modifying them.
        n.lyric = numbered[1];
        if (+numbered[2] > 1) { n.lyric = '‿'; n.slur = true; delete n.phones; }
      }
      if (/^\+[~*]$/.test(lyric) && !head) { n.rest = true; delete n.phones; return; }
      if (/^(?:\+[~*]|-|‿|＿|=|—)$/.test(lyric)) { n.slur = true; n.lyric = '‿'; }
      if (lyric === '+') {
        if (!head) { n.rest = true; delete n.phones; return; }
        if (!n.phones) n._phonesCustom = head._phonesCustom;
        if (NSG.isWordPhonemizer(n.lang)) {
          n._autoContinuation = true;
          // Continuation numbering applies only to the runtime copy.
          if (!/#\d+$/.test(head.lyric)) head.lyric = word + '#1';
          n.lyric = word + '#' + (++index);
          delete n.slur;
        } else { n.slur = true; n.lyric = '‿'; delete n.phones; }
      } else if (!n.slur) {
        head = n; word = numbered ? numbered[1] : n.lyric; index = numbered ? +numbered[2] : 1;
      }
    });
    if (notes.some(function (n) { return n.lang === 'zh'; })) resolveMandarinNotes(notes);
    // 谚文分到单独音符后仍共享常见音变；休止、空隙、片段与覆盖隔断上下文。
    var koRun = [], koOwners = [], koPrev = null;
    function flushKo() {
      koResolve(koRun).forEach(function (s, index) { koOwners[index].phones = s.phones; });
      koRun = []; koOwners = []; koPrev = null;
    }
    notes.forEach(function (note) {
      if (koPrev && (koPrev.lang !== note.lang || koPrev.lyricGroup !== note.lyricGroup ||
          Math.abs(koPrev.start + koPrev.dur - note.start) >= 0.002)) flushKo();
      if (note.lang !== 'ko' || NSG.noteKind(note) !== 'voiced' || (note.phones && note.phones.length)) { flushKo(); return; }
      if (note.slur) { koPrev = note; return; }
      var tokens = koTokens(String(note.lyric || ''));
      if (tokens.length !== 1) { flushKo(); return; }
      if (String(note.lyric || '').normalize('NFC').trim() !== tokens[0].text) {
        flushKo(); note.phones = koResolve(tokens)[0].phones; return;
      }
      tokens[0].group = 1;
      koRun.push(tokens[0]); koOwners.push(note); koPrev = note;
    });
    flushKo();
    notes.forEach(function (note, i) {
      if (note.phones && note.phones.length && /^(manual|imported)$/.test(note.phonesSource || '')) delete note.slur;
      // 单字音符的上下文与整句输入一致；显式音素覆盖仍由用户掌握。
      if (note.lang === 'nan' && note.lyric === '落' && !note.slur && !(note.phones && note.phones.length)) {
        var next = i + 1;
        while (next < notes.length && notes[next].slur && notes[next].lang === 'nan' &&
            NSG.noteKind(notes[next]) === 'voiced' && notes[next].lyricGroup === note.lyricGroup &&
            Math.abs(notes[next - 1].start + notes[next - 1].dur - notes[next].start) < 0.002) next++;
        if (notes[next] && notes[next].lang === 'nan' && notes[next].lyric === '雨' &&
            NSG.noteKind(notes[next]) === 'voiced' && notes[next].lyricGroup === note.lyricGroup &&
            Math.abs(notes[next - 1].start + notes[next - 1].dur - notes[next].start) < 0.002) {
          note.phones = nanSyllable(NAN_PHRASES['落雨'][0]);
        }
      }
      if (!NSG.isWordPhonemizer(note.lang) || NSG.noteKind(note) !== 'voiced') return;
      var prev = notes[i - 1], word = String(note.lyric).replace(/#\d+$/, '');
      var touching = prev && prev.lang === note.lang && prev.lyricGroup === note.lyricGroup &&
        NSG.noteKind(prev) === 'voiced' && Math.abs(prev.start + prev.dur - note.start) < 0.002;
      note._englishWord = note.slur && touching ? prev._englishWord : word;
      if (note.phones && note.phones.length && /^(manual|imported)$/.test(note.phonesSource || '')) delete note.slur;
      if (note.slur || (note.phones && note.phones.length)) return;
      var effectiveLyric = note.lyric || '', effectiveWord = word;
      if (note.lang === 'th' && word === 'ๆ') {
        for (var pIdx = i - 1; pIdx >= 0; pIdx--) {
          var pn = notes[pIdx];
          if (pn.lang !== 'th' || NSG.noteKind(pn) !== 'voiced' || pn.slur) continue;
          var pw = String(pn.lyric || '').replace(/#\d+$/, '');
          if (pw && pw !== 'ๆ') { effectiveWord = pw; effectiveLyric = effectiveLyric.replace(/^ๆ/, pw); break; }
        }
      }
      var syllables;
      try { syllables = NSG.g2p(effectiveLyric, note.lang); }
      catch (error) { note._phonemeError = error.message; note.phones = ['SP']; return; }
      var syl = syllables[0];
      if (!syl) return;
      note.phones = note.lang === 'en' ? syl.phones.slice() :
        [].concat.apply([], syllables.map(function (s) { return s.phones; }));
      if (note._autoContinuation && !syl.extend) {
        var nextIndex = i + 1, lastNote = note;
        while (nextIndex < notes.length && notes[nextIndex].slur && !notes[nextIndex]._autoContinuation &&
          notes[nextIndex].lang === note.lang && notes[nextIndex].lyricGroup === note.lyricGroup &&
          Math.abs(lastNote.start + lastNote.dur - notes[nextIndex].start) < 0.002) lastNote = notes[nextIndex++];
        var nextNote = notes[nextIndex];
        var continues = nextNote && nextNote._autoContinuation && nextNote.lang === note.lang &&
          nextNote.lyricGroup === note.lyricGroup && Math.abs(lastNote.start + lastNote.dur - nextNote.start) < 0.002 &&
          String(nextNote.lyric).replace(/#\d+$/, '') === word;
        if (!continues) {
          var full = NSG.g2p(effectiveWord, note.lang);
          var groups = full[0] && full[0].hintSyllables || (note.lang === 'en' ? NSG.englishSyllables(word) :
            full.map(function (s) { return s.phones; }));
          var syllableIndex = +(String(note.lyric).match(/#(\d+)$/) || [0, 1])[1] - 1;
          note.phones = [].concat.apply([], groups.slice(syllableIndex));
        }
      }
      // Excess continuation notes sustain the final syllable of the same word.
      if (syl.extend && touching && prev._englishWord === word) note.slur = true;
    });
    notes.forEach(function (note) {
      if (note.lang === 'en') englishNoteStress(note);
      if (!note._storedPhones || note._phonesCustom) return;
      try {
        var reading = NSG.g2p(note.lyric || '', note.lang);
        var automatic = note.lang !== 'en' && NSG.isWordPhonemizer(note.lang) ? [].concat.apply([], reading.map(function (s) { return s.phones; })) :
          reading.length ? reading[0].phones : [];
        note._phonesCustom = !sameStringArray(note._storedPhones, automatic);
      } catch (_) { note._phonesCustom = true; }
    });
    return notes;
  };

  // Word ownership is separate from pronunciation overrides and note selection.
  NSG.pronunciationGroups = function (source, resolved) {
    var originals = {}, groups = {}, previous = null, index = -1;
    (source || []).forEach(function (n) { originals[n.id] = n; });
    (resolved || NSG.phonemizeNotes(source)).forEach(function (n) {
      var raw = originals[n.id] || n, lyric = String(raw.lyric || ''), prevRaw = previous && originals[previous.id] || previous;
      var touching = previous && previous.lang === n.lang && previous.lyricGroup === n.lyricGroup &&
        NSG.noteKind(previous) === 'voiced' && NSG.noteKind(n) === 'voiced' &&
        Math.abs(previous.start + previous.dur - n.start) < 0.002;
      var numbered = lyric.match(/^(.+?)#([1-9]\d*)$/), prevNumbered = prevRaw && String(prevRaw.lyric || '').match(/^(.+?)#([1-9]\d*)$/);
      var same = touching && (n.slur || /^\+(?:[~*])?$/.test(lyric) ||
        (numbered && +numbered[2] > 1 && prevNumbered && numbered[1] === prevNumbered[1] && +numbered[2] === +prevNumbered[2] + 1) ||
        /^[-+].+/.test(lyric) || (prevRaw && /.+[-+]$/.test(prevRaw.lyric || '')) ||
        raw.wordJoinDirection === 'left' || raw.wordJoinDirection === 'middle' ||
        (prevRaw && /^(right|middle)$/.test(prevRaw.wordJoinDirection || '')) ||
        (!raw.wordJoinDirection && raw.wordJoin && prevRaw && prevRaw.wordJoin && !(numbered && +numbered[2] === 1)));
      if (raw.phonemeWordJoin !== undefined) same = touching && raw.phonemeWordJoin === true;
      if (NSG.noteKind(n) !== 'voiced') { groups[n.id] = { index: -1, word: lyric, headId: n.id }; previous = null; return; }
      if (!same) index++;
      var prior = same && groups[previous.id];
      groups[n.id] = { index: index, word: prior ? prior.word : lyric.replace(/#\d+$/, '').replace(/\s*\[[^\]]*\]/g, ''),
        headId: prior ? prior.headId : n.id };
      previous = n;
    });
    return groups;
  };

  // Shared by the piano roll and its editor; pass runtime notes to include + / language selection.
  NSG.pronunciationInfo = function (note, previous) {
    var phones = [], kind = NSG.noteKind(note);
    if (note._phonemeError) return { phones: [], custom: !!note._phonesCustom, error: note._phonemeError };
    if (kind === 'rest') phones = ['SP'];
    else if (kind === 'breath') phones = [NSG.breathPhoneOf(note)];
    else if (note.slur && previous) {
      var prior = previous.phones || [], index = prior.length - 1;
      while (index >= 0 && NSG.phoneOf(prior[index]).t !== 'V' && !NSG.phoneOf(prior[index]).syllabic) index--;
      while (index > 0 && NSG.phoneOf(prior[index]).glide) index--;
      if (index < 0) {
        index = prior.length - 1;
        while (index >= 0 && NSG.phoneOf(prior[index]).t !== 'N' && NSG.phoneOf(prior[index]).t !== 'L') index--;
      }
      if (HAK_TEOCHEW.test(note.lang)) index = NSG.nanNucleus(prior, note.lang);
      phones = index >= 0 ? [prior[index]] : prior.slice(-1);
    } else if (note.phones && note.phones.length) phones = note.phones.slice();
    else {
      try { var syllables = NSG.g2p(note.lyric || '', note.lang); phones = syllables.length ? syllables[0].phones : ['a']; }
      catch (error) { return { phones: [], custom: true, error: error.message }; }
    }
    return { phones: phones, custom: !!note._phonesCustom, slur: !!note.slur };
  };

  function splitRoman(str, lang) {
    str = str.toLowerCase();
    // 隔音符显式分开韵母开头的下一音节，例如 xi'an、chang'an。
    if (str.indexOf("'") >= 0) {
      var separated = [];
      str.split("'").forEach(function (part) {
        if (part) separated = separated.concat(splitRoman(part, lang));
      });
      return separated;
    }
    if (lang === 'zh-x-sichuan' && /[1-5](?=[a-zê])/.test(str)) {
      var byTone = [];
      str.split(/(?<=[1-5])(?=[a-zê])/).forEach(function (part) {
        if (part) byTone = byTone.concat(splitRoman(part, lang));
      });
      return byTone;
    }
    var inits = LANG_INITIALS[lang] || [];
    var out = [], cur = '';
    var vowels = lang === 'zh' || lang === 'zh-x-sichuan' ? 'aeiouvê' : lang === 'yue' ? 'aeiouy' : 'aeiou';
    for (var i = 0; i < str.length; i++) {
      cur += str[i];
      var nxt = str[i + 1];
      if (!nxt) break;
      var isV = vowels.indexOf(str[i]) >= 0;
      var nextV = vowels.indexOf(nxt) >= 0;
      // 粤语韵尾 -m/-n/-ng/-p/-t/-k 后接下一声母：sik'faan、gwong'dung、jyut'ping。
      var afterCoda = (lang === 'zh' || lang === 'zh-x-sichuan') ? /[aeiouvê](ng|n|r)$/.test(cur) :
        lang === 'yue' && /[aeiouy](ng|m|n|p|t|k)$/.test(cur);
      if ((isV && !nextV) || afterCoda) {
        // 判断 nxt 是否与后面的元音构成合法声母
        var rest = str.slice(i + 1);
        var isInit = false;
        for (var k = 0; k < inits.length; k++) {
          var ini = inits[k];
          // indexOf('') 为 0；末尾孤立的 n/r 不能凭空成为下一声母。
          if (rest.length > ini.length && rest.indexOf(ini) === 0 && vowels.indexOf(rest.charAt(ini.length)) >= 0) { isInit = true; break; }
        }
        if (isInit) {
          out.push(cur); cur = '';
        }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  // Split batch lyric text into per-note tokens for all supported languages while keeping bracket hints and continuations intact.
  NSG.tokenizeBatchLyrics = function (text, lang, options) {
    lang = lang || 'zh';
    var opts = options || {};
    var str = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (!str.trim()) return [];

    // Protect [phonetic hints] from whitespace or punctuation splitting.
    var hints = [];
    str = str.replace(/\[[^\]]*\]/g, function (m) {
      var id = hints.length;
      hints.push(m);
      return '\uE000' + id + '\uE001';
    });
    var restore = function (s) {
      return s.replace(/\uE000(\d+)\uE001/g, function (_, idx) { return hints[+idx] || ''; });
    };

    var rawChunks = str.replace(/[　\t\n]+/g, ' ')
      .split(lang === 'eo' || lang === 'fi' || lang === 'tlh' || ROMANCE_LANG.test(lang) || SOUTHEAST_ASIAN_LANG.test(lang) ? /[\s,.!?¡¿;:，。！？；：、()（）「」『』“”"«»…ฯ๚๛\uf8fd\uf8fe]+/ :
        /[\s,.\!\?;:，。！？；：、\(\)（）「」『』“”"…]+/)
      .filter(Boolean);

    var SPECIAL_RE = /^(?:SP|AP|br[1-5]?|sil|pau)$/i;
    var SLUR_RE = /^(?:[-—–―‿=＿~～]+)$/;
    var tokens = [];

    if (lang === 'zh' || lang === 'zh-x-sichuan' || lang === 'yue' || lang === 'nan' || HAK_TEOCHEW.test(lang)) {
      rawChunks.forEach(function (chunk) {
        var i = 0;
        while (i < chunk.length) {
          var cp = chunk.codePointAt(i), clen = cp > 0xffff ? 2 : 1, ch = chunk.slice(i, i + clen);
          if (ch === '\uE000') {
            var end = chunk.indexOf('\uE001', i);
            if (end < 0) break;
            var h = chunk.slice(i, end + 1);
            if (tokens.length && !SLUR_RE.test(tokens[tokens.length - 1])) tokens[tokens.length - 1] += restore(h);
            else tokens.push(restore(h));
            i = end + 1;
            continue;
          }
          var nextTwo = chunk.slice(i, i + 2);
          if (nextTwo === '+~' || nextTwo === '+*') { tokens.push(nextTwo); i += 2; continue; }
          if (ch === '+') { tokens.push('+'); i++; continue; }
          if (SLUR_RE.test(ch)) { tokens.push('-'); i++; continue; }
          if (isHanCode(cp)) {
            var han = ch; i += clen;
            if (chunk[i] === '\uE000') {
              var hEnd = chunk.indexOf('\uE001', i);
              if (hEnd >= 0) { han += restore(chunk.slice(i, hEnd + 1)); i = hEnd + 1; }
            }
            tokens.push(han);
            continue;
          }
          var buf = '';
          while (i < chunk.length && !isHanCode(chunk.codePointAt(i)) && chunk[i] !== '\uE000' &&
              !SLUR_RE.test(chunk[i]) && chunk[i] !== '+') {
            var bcl = chunk.codePointAt(i) > 0xffff ? 2 : 1;
            buf += chunk.slice(i, i + bcl); i += bcl;
          }
          if (buf) {
            if (SPECIAL_RE.test(buf)) tokens.push(buf.toUpperCase() === 'SP' ? 'SP' : buf.toUpperCase() === 'AP' ? 'AP' : buf.toLowerCase());
            else if (HAK_TEOCHEW.test(lang) && /^[a-zê1-8ˊˇˋ'’]+$/i.test(buf.normalize('NFC'))) {
              var romanTokens = buf.normalize('NFC').match(DIALECT_ROMAN);
              if (romanTokens) tokens.push.apply(tokens, romanTokens);
            } else tokens.push(buf);
          }
        }
      });
      return tokens;
    }

    if (lang === 'ko') {
      rawChunks.forEach(function (chunk) {
        chunk = chunk.normalize('NFC');
        var i = 0;
        while (i < chunk.length) {
          var ch = chunk[i];
          if (ch === '\uE000') {
            var end = chunk.indexOf('\uE001', i);
            if (end < 0) break;
            var h = restore(chunk.slice(i, end + 1));
            if (tokens.length && !SLUR_RE.test(tokens[tokens.length - 1])) tokens[tokens.length - 1] += h;
            else tokens.push(h);
            i = end + 1;
            continue;
          }
          var nextTwo = chunk.slice(i, i + 2);
          if (nextTwo === '+~' || nextTwo === '+*') { tokens.push(nextTwo); i += 2; continue; }
          if (ch === '+') { tokens.push('+'); i++; continue; }
          if (SLUR_RE.test(ch)) { tokens.push('-'); i++; continue; }
          var code = ch.charCodeAt(0);
          if (code >= 0xAC00 && code <= 0xD7A3) {
            var syl = ch; i++;
            if (chunk[i] === '\uE000') {
              var hEnd = chunk.indexOf('\uE001', i);
              if (hEnd >= 0) { syl += restore(chunk.slice(i, hEnd + 1)); i = hEnd + 1; }
            }
            tokens.push(syl);
            continue;
          }
          var buf = '';
          while (i < chunk.length && (chunk.charCodeAt(i) < 0xAC00 || chunk.charCodeAt(i) > 0xD7A3) &&
              chunk[i] !== '\uE000' && !SLUR_RE.test(chunk[i]) && chunk[i] !== '+') {
            buf += chunk[i++];
          }
          if (buf) tokens.push(buf);
        }
      });
      return tokens;
    }

    if (lang === 'ja') {
      var SMALL_JA = 'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ';
      var isKanaChar = function (ch) {
        var c = ch.charCodeAt(0);
        return (c >= 0x3041 && c <= 0x3096) || (c >= 0x30A1 && c <= 0x30F6);
      };
      rawChunks.forEach(function (chunk) {
        var i = 0;
        while (i < chunk.length) {
          var cp = chunk.codePointAt(i), clen = cp > 0xffff ? 2 : 1, ch = chunk.slice(i, i + clen);
          if (ch === '\uE000') {
            var end = chunk.indexOf('\uE001', i);
            if (end < 0) break;
            var h = restore(chunk.slice(i, end + 1));
            if (tokens.length && !SLUR_RE.test(tokens[tokens.length - 1])) tokens[tokens.length - 1] += h;
            else tokens.push(h);
            i = end + 1;
            continue;
          }
          var nextTwo = chunk.slice(i, i + 2);
          if (nextTwo === '+~' || nextTwo === '+*') { tokens.push(nextTwo); i += 2; continue; }
          if (ch === '+') { tokens.push('+'); i++; continue; }
          if (ch === 'ー' || SLUR_RE.test(ch)) { tokens.push('-'); i++; continue; }
          if (isHanCode(cp)) {
            var han = ch; i += clen;
            if (chunk[i] === '\uE000') {
              var hEnd = chunk.indexOf('\uE001', i);
              if (hEnd >= 0) { han += restore(chunk.slice(i, hEnd + 1)); i = hEnd + 1; }
            }
            tokens.push(han);
            continue;
          }
          if (isKanaChar(ch)) {
            var mora = '';
            // Attach geminate sokuon to the following mora so every emitted token remains singable.
            if ((ch === 'っ' || ch === 'ッ') && i + 1 < chunk.length && isKanaChar(chunk[i + 1])) {
              mora += ch;
              i++;
              ch = chunk[i];
            }
            mora += ch;
            i++;
            while (i < chunk.length && SMALL_JA.indexOf(chunk[i]) >= 0) {
              mora += chunk[i++];
            }
            if (chunk[i] === '\uE000') {
              var mEnd = chunk.indexOf('\uE001', i);
              if (mEnd >= 0) { mora += restore(chunk.slice(i, mEnd + 1)); i = mEnd + 1; }
            }
            tokens.push(mora);
            continue;
          }
          var buf = '';
          while (i < chunk.length && !isHanCode(chunk.codePointAt(i)) && !isKanaChar(chunk[i]) &&
              chunk[i] !== 'ー' && chunk[i] !== '\uE000' && !SLUR_RE.test(chunk[i]) && chunk[i] !== '+') {
            var bcl = chunk.codePointAt(i) > 0xffff ? 2 : 1;
            buf += chunk.slice(i, i + bcl); i += bcl;
          }
          if (buf) tokens.push(buf);
        }
      });
      return tokens;
    }

    // Remaining languages use space-delimited words and continuation tokens.
    rawChunks.forEach(function (chunk) {
      var restored = restore(chunk).trim();
      if (!restored) return;
      if (SLUR_RE.test(restored)) { tokens.push('-'); return; }
      if (lang === 'xdi8' && /[\u3400-\u9fff\u3007]|[\ud840-\ud888][\udc00-\udfff]/.test(restored)) {
        // 希顶语混写汉字时按单字拆词，聊天字母/PUA 仍按空白分整词。
        var xi = 0;
        while (xi < restored.length) {
          var xcp = restored.codePointAt(xi), xcl = xcp > 0xffff ? 2 : 1, xch = restored.slice(xi, xi + xcl);
          var xTwo = restored.slice(xi, xi + 2);
          if (xTwo === '+~' || xTwo === '+*') { tokens.push(xTwo); xi += 2; continue; }
          if (xch === '+') { tokens.push('+'); xi++; continue; }
          if (SLUR_RE.test(xch) && !(xch === '~' && /[a-zA-Z1-8]/.test(restored[xi + 1] || ''))) { tokens.push('-'); xi++; continue; }
          if (isHanCode(xcp)) { tokens.push(xch); xi += xcl; continue; }
          var xbuf = '';
          while (xi < restored.length && !isHanCode(restored.codePointAt(xi)) &&
              !(SLUR_RE.test(restored[xi]) && !(restored[xi] === '~' && /[a-zA-Z1-8]/.test(restored[xi + 1] || ''))) &&
              restored[xi] !== '+') {
            var bcl2 = restored.codePointAt(xi) > 0xffff ? 2 : 1;
            xbuf += restored.slice(xi, xi + bcl2); xi += bcl2;
          }
          if (xbuf) tokens.push(xbuf);
        }
        return;
      }
      tokens.push(restored);
    });

    if (opts.autoSplitMultiSyllable && NSG.isWordPhonemizer(lang)) {
      var expanded = [], lastThCount = 1;
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        expanded.push(tok);
        var next = tokens[t + 1];
        if (next === '+' || next === '+~' || next === '+*' ||
            /^(?:-|‿|=|\+|\+~|\+\*|sil|pau)$/i.test(tok) || NSG.specialPhone(tok, lang) ||
            /^\[.*\]$/.test(tok) || /#\d+$/.test(tok) || /^[-+]|[-+]$/.test(tok)) {
          continue;
        }
        var clean = tok.replace(/\s*\[[^\]]*\]/g, '').trim();
        if (!clean || /\[[^\]]*\]/.test(tok)) continue;
        var count = 1;
        try {
          if (lang === 'en' && NSG.englishSyllables) count = NSG.englishSyllables(englishKey(clean)).length;
          else if (lang === 'th' && clean === 'ๆ') count = lastThCount;
          else count = NSG.g2p(clean, lang).length;
        } catch (_) { count = 1; }
        if (lang === 'th' && clean !== 'ๆ') lastThCount = count;
        for (var c = 1; c < count; c++) expanded.push('+');
      }
      return expanded;
    }

    return tokens;
  };

  NSG.langName = { zh: '普通话', 'zh-x-sichuan': '四川话（成都音）', yue: '粤语', ja: '日语', en: '英语', de: '德语', pl: '波兰语',
    ru: '俄罗斯语', uk: '乌克兰语', fi: '芬兰语', es: '西班牙语', pt: '葡萄牙语', it: '意大利语', fr: '法语', ro: '罗马尼亚语',
    nan: '闽南语', hak: '客家话（四县腔）', 'nan-x-teochew': '潮州话（府城音）',
    ko: '朝鲜语', vi: '越南语', fil: '菲律宾语（他加禄语）', id: '印尼语',
    ms: '马来语', th: '泰语', eo: '世界语', tok: '道本语', asaxi: 'Asaxi', xdi8: '希顶语', tlh: '克林贡语' };

  var LANG_SHORT_CODES = {
    'zh-x-sichuan': 'SC',
    'nan-x-teochew': 'TEO'
  };
  NSG.langShortCode = function (code) {
    var s = String(code || 'zh').trim();
    if (!s) return 'ZH';
    var lower = s.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LANG_SHORT_CODES, lower)) {
      return LANG_SHORT_CODES[lower];
    }
    var xm = /-x-([a-z0-9]+)/i.exec(s);
    if (xm && xm[1]) return xm[1].toUpperCase().slice(0, 5);
    return s.toUpperCase().slice(0, 5);
  };
})(typeof window !== 'undefined' ? window : global);
