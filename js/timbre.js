/* ==========================================================================
   NSG · 音色参数块（16000Hz 单声道）
   参数块 = 一组测量参数的固化记录：身高、共振峰宽度、高阶共振峰位置（F4/F5/F6）、
   圆唇度、谱倾斜、气声、鼻腔耦合、16 阶倍频振幅、颤音、512 点曲线、1000 列网格。
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['timbre'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};

  NSG.SR = 16000;
  NSG.BW_BASE = [70, 92, 132, 190, 240, 300];

  NSG.defaultHarm = function () {
    // 16 阶倍频振幅（dB，相对 H1）——未滤波声带音的谐波结构。
    // 一条 −12dB/oct 的声门谱：每升一个倍频程掉 12dB，即 a_k ∝ k^−0.6。
    // 唇端辐射（+6dB/oct）由引擎在输出级补上，合起来是 −6dB/oct 的
    // 自然嗓音谱斜率；旧表到 H16 已掉 35.5dB 且按“每阶固定 dB”外推，
    // 低音区 1.3kHz 以上就空了，这是“像正弦波”的根源。
    var h = [];
    for (var k = 1; k <= 16; k++) h.push(Math.round(-12 * Math.log2(k) * 10) / 10);
    return h;
  };

  // 旧版默认表（−2.5dB/阶），用于识别并迁移历史参数块
  NSG.LEGACY_HARM = [0, -1.2, -3.0, -5.5, -8.0, -10.5, -13.0, -15.5,
    -18.0, -20.5, -23.0, -25.5, -28.0, -30.5, -33.0, -35.5];

  /* 历史参数块迁移：仍是旧默认表的，直接换成新默认表；
     手动改过的表保守地整体上抬，避免老工程听起来发闷。
     迁移只做一次——完成后打上 harmV = 2，否则每读一次就再抬 6dB/oct，
     自定义表（含预置歌手的斜率）会被反复抬高。 */
  NSG.migrateTimbre = function (t) {
    if (t && typeof t === 'object') delete t.sig;   // 旧版文件里的签名字段，已废弃
    if (!t || !Array.isArray(t.harm) || t.harm.length !== 16) return t;
    if (t.harmV === 2) return t;
    var same = true, L = NSG.LEGACY_HARM;
    for (var i = 0; i < 16; i++) if (Math.abs(t.harm[i] - L[i]) > 0.05) { same = false; break; }
    if (same) t.harm = NSG.defaultHarm();
    else {
      /* 已经是新版默认表（−12dB/oct）的，只补版本号，不能再抬一次 */
      var D = NSG.defaultHarm(), isNew = true;
      for (var m = 0; m < 16; m++) if (Math.abs(t.harm[m] - D[m]) > 0.15) { isNew = false; break; }
      if (!isNew) {
        for (var j = 0; j < 16; j++) t.harm[j] = Math.round((t.harm[j] + 6 * Math.log2(j + 1)) * 10) / 10;
      }
    }
    t.harmV = 2;
    return t;
  };

  NSG.defaultTimbre = function () {
    return {
      name: '基准音色',
      height: 160,                 // 身高滑块默认 160cm
      gen: 64,                     // GEN：0 偏女声，64 原音色，127 偏男声；不改基频
      fScale: 1.0,                 // 声道缩放：与身高解耦的第二个长度旋钮
      warp: 0.0,                   // 离散度：高阶共振峰相对 F1 多做/少做一份偏移
      jitter: 0.0,                 // 微扰：逐帧基频抖动（0.01 = 1%）
      glottal: 0.0,                // 声门共振峰（胸腔共鸣）0…1 → 峰值提升 0…10dB
      bwScale: 1.0,                // 共振峰宽度整体倍率
      higher: [3300, 4200, 5200],  // 高阶共振峰 F4/F5/F6 位置
      hiShift: 1.0,                // 高阶共振峰整体偏移
      lip: 0.0,                    // 额外圆唇度（叠加在元音自带圆唇上）
      harm: NSG.defaultHarm(),
      tiltDb: 0,                   // 声带音谱倾斜 dB/oct
      breath: 0.02,                // 气声
      nasal: 0.08,                 // 鼻腔耦合
      vib: { rate: 5.2, depth: 0.18, delay: 0.28 },
      harmV: 2,                    // 倍频振幅表版本：2 = 已按 −12dB/oct 重标，不再迁移
      curve: null,
      grid: null,
      src: '内置测量'
    };
  };

  /* ==========================================================================
     预置歌手（内置音色块）
     每个歌手就是一组合成的参数块：身高定声道长度 → 前三个共振峰的整体位置；
     谱斜率与谱倾斜定亮暗；气声与鼻腔耦合定质地；颤音定"人味"。
     预置只读，不写入 localStorage，也不可覆盖；改动任一滑杆即标记为「已修改」。
     ========================================================================== */

  /* 按 dB/oct 生成 16 阶倍频振幅：斜率 −12 即默认声门谱 */
  function harmSlope(slope) {
    var h = [];
    for (var k = 1; k <= 16; k++) h.push(Math.round(slope * Math.log2(k) * 10) / 10);
    return h;
  }

  var PRESET_DEF = [
    {
      id: 'base', name: '基准', height: 160,
      desc: '中性基准音色：均衡、朴素，适合对照不同音色',
      fs: 1.00, warp: 0.00, jit: 0,
      glot: 0.0,
      bw: 1.00, hi: [3300, 4200, 5200], hiS: 1.00, lip: 0.00,
      slope: -12.0, tilt: 0, breath: 0.02, nasal: 0.08, vib: [5.2, 0.18, 0.28],
      range: [48, 72]
    },
    {
      id: 'm1', name: '男声1', height: 176,
      desc: '男中音：声音结实饱满，颤音克制，气声很轻',
      consonantSoftness: 0.45,
      nasalLowpassHz: 1200,
      fs: 0.98, warp: -0.04, jit: 0.0010,
      glot: 0.45,
      bw: 0.98, hi: [3480, 4000, 4600], hiS: 1.00, lip: 0.02,
      slope: -10.8, tilt: 1.0, breath: 0.020, nasal: 0.06, vib: [5.0, 0.16, 0.30],
      range: [50, 69]
    },
    {
      id: 'm2', name: '男声2', height: 182,
      desc: '清亮男高音：明亮、轻柔，带一层气声',
      fs: 1.03, warp: 0.02, jit: 0.0008,
      glot: 0.30,
      bw: 0.96, hi: [3480, 4030, 4630], hiS: 1.00, lip: 0.01,
      slope: -10.4, tilt: 2.0, breath: 0.060, nasal: 0.05, vib: [5.4, 0.14, 0.26],
      range: [53, 74]
    },
    {
      id: 'u1', name: '男声3', height: 175,
      desc: '成熟男中低音：浑厚偏暗，略带沙哑和鼻音，颤音舒缓',
      fs: 0.92, warp: -0.06, jit: 0.0030,
      glot: 0.60,
      bw: 1.08, hi: [3550, 4140, 4800], hiS: 1.00, lip: 0.02,
      slope: -12.8, tilt: -3.0, breath: 0.100, nasal: 0.11, vib: [4.6, 0.24, 0.34],
      range: [43, 64]
    },
    {
      id: 'f1', name: '女声1',
      desc: '明亮女声：声音清晰，带轻气声，不附加预设颤音',
      timbre: {
        "sig": "NSG-16000-A7F3C9E1",
        "name": "F01-E",
        "height": 170,
        "gen": 56,
        "fScale": 1.3518275,
        "warp": 0.18,
        "jitter": 0.003,
        "glottal": 0,
        "bwScale": 1.25,
        "higher": [3167,4408,5042],
        "hiShift": 1,
        "lip": 0.1,
        "harm": [0,-12,-19,-24,-27.9,-31,-33.7,-36,-38,-39.9,-41.5,-43,-44.4,-45.7,-46.9,-48],
        "tiltDb": 5,
        "breath": 0.04,
        "nasal": 0.04,
        "vib": {
          "rate": 5.2,
          "depth": 0,
          "delay": 0.28
        },
        "harmV": 2,
        "curve": null,
        "grid": null,
        "src": "多帧拟合 + 合成对比 v3",
        "sourceEq": [-0.89,-1.25,-1.81,-1.04,-0.04,1.04,1.84,2.34,2.34,1.08,-0.19,-1.43,-1.8,-1.69,-0.43,0.85,1.62,1.28,1.15,1.22,1.32,0.89,0.33,-0.1,-0.22,-0.05,0.38,0.67,0.65,0.34,0.11,0],
        "outEq": [9.26,9.26,9.26,9.26,9.26,9.26,9.26,8.715280927193845,7.861598207779624,10.429789266087532,5.143760888993264,-2.2785619152470273,-4.500920104249856,-1.6275,3.6504999999999996,7.752499999999999,6.72,1.7954999999999999,-2.6285,-2.1665,3.3145000000000002,2.6565,-1.19,0.063,0.294,-0.385,-0.091,-0.84,-2.219,-1.0815,-0.9624999999999999,-0.1295,1.1584999999999999,1.8795,-0.9029999999999999,1.0675,-0.147,0.6838998842141357,1.007901778041219,-0.8173842278675558,-2.538825914307105,-5.03,-7.82,-24.43,-39.83,-39.83,-39.83,-39.83],
        "extraction": {
          "version": 3,
          "frames": 64,
          "medianF0": 184.4,
          "baselineDb": 9.41,
          "fittedDb": 5.77,
          "vowelClasses": 11,
          "duration": 13.31,
          "spectrumDb": 10.99,
          "noiseDb": null
        }
      }
    },
    {
      id: 'f2', name: '女声2',
      desc: '柔和女声：音色偏暗，带轻气声，不附加预设颤音',
      timbre: {
        "sig": "NSG-16000-A7F3C9E1",
        "name": "F02",
        "height": 170,
        "gen": 64,
        "fScale": 1.3518275,
        "warp": 0.126187875,
        "jitter": 0,
        "glottal": 0,
        "bwScale": 2.262815625,
        "higher": [3167,4408,5042],
        "hiShift": 1,
        "lip": 0,
        "harm": [0,-12,-19,-24,-27.9,-31,-33.7,-36,-38,-39.9,-41.5,-43,-44.4,-45.7,-46.9,-48],
        "tiltDb": -4,
        "breath": 0.04,
        "nasal": 0.04,
        "vib": {
          "rate": 5.2,
          "depth": 0,
          "delay": 0.28
        },
        "harmV": 2,
        "curve": null,
        "grid": null,
        "src": "多帧拟合 + 合成对比 v3",
        "sourceEq": [-0.89,-1.25,-1.81,-1.04,-0.04,1.04,1.84,2.34,2.34,1.08,-0.19,-1.43,-1.8,-1.69,-0.43,0.85,1.62,1.28,1.15,1.22,1.32,0.89,0.33,-0.1,-0.22,-0.05,0.38,0.67,0.65,0.34,0.11,0],
        "outEq": [-2.06,-2.06,-2.14,-2.27,-2.34,-2.29,-2.19,-2.1,-1.93,-1.66,-1.22,-0.62,0.09,0.84,1.59,2.39,2.81,2.46,1.75,1.11,0.54,0.67,1.64,2,1.57,2.01,3.77,4.02,0.3,-4.27,-4.85,-2.22,-0.89,-2.67,-4.99,-4.09,-0.2,2.32,0.83,-1.81,-3.65,-7.11,-12.52,-27.26,-40,-40,-40,-40],
        "extraction": {
          "version": 3,
          "frames": 64,
          "medianF0": 184.4,
          "baselineDb": 9.41,
          "fittedDb": 6.49,
          "vowelClasses": 11,
          "duration": 13.31,
          "spectrumDb0": 26.02,
          "spectrumDb": 7.21,
          "noiseDb": -10.2
        }
      }
    },
    {
      id: 'b1', name: '男孩1', height: 145,
      desc: '男童声：明亮有力，略带粗糙感，颤音很轻',
      fs: 1.08, warp: 0.04, jit: 0.0030,
      glot: 0.40,
      bw: 1.00, hi: [3240, 3750, 4250], hiS: 1.00, lip: 0.00,
      slope: -11.4, tilt: 0.5, breath: 0.030, nasal: 0.07, vib: [5.6, 0.12, 0.30],
      range: [60, 77]
    },
    {
      id: 'g1', name: '女孩1', height: 142,
      desc: '女童声：清亮偏甜，带轻气声，颤音轻快',
      fs: 1.10, warp: 0.08, jit: 0.0010,
      glot: 0.18,
      bw: 0.96, hi: [3190, 3640, 4080], hiS: 1.00, lip: 0.00,
      slope: -10.8, tilt: 2.0, breath: 0.060, nasal: 0.05, vib: [5.8, 0.14, 0.26],
      range: [62, 81]
    }
  ];

  /* 把定义表展开成完整的参数块（缺省字段沿用 defaultTimbre） */
  NSG.PRESETS = (function () {
    var out = [];
    for (var i = 0; i < PRESET_DEF.length; i++) {
      var d = PRESET_DEF[i];
      var t = NSG.defaultTimbre();
      // 固化已保存音色的完整参数，包含声源修正、输出均衡和曲线。
      if (d.timbre) {
        t = JSON.parse(JSON.stringify(d.timbre));
        t.name = d.name;
        t.preset = d.id;
        t.desc = d.desc;
        out.push(t);
        continue;
      }
      t.name = d.name;
      t.preset = d.id;
      t.desc = d.desc;
      t.src = '预置歌手';
      t.height = d.height;
      t.gen = d.id === 'f1' ? 38 : 64;
      t.fScale = d.fs;
      t.warp = d.warp;
      t.jitter = d.jit;
      t.glottal = d.glot;
      t.range = d.range.slice();
      t.bwScale = d.bw;
      t.higher = d.hi.slice();
      t.hiShift = d.hiS;
      t.lip = d.lip;
      t.harm = harmSlope(d.slope);
      t.tiltDb = d.tilt;
      t.breath = d.breath;
      if (d.consonantSoftness !== undefined) t.consonantSoftness = d.consonantSoftness;
      if (d.nasalLowpassHz !== undefined) t.nasalLowpassHz = d.nasalLowpassHz;
      t.nasal = d.nasal;
      t.vib = { rate: d.vib[0], depth: d.vib[1], delay: d.vib[2] };
      out.push(t);
    }
    return out;
  })();

  NSG.presetById = function (id) {
    if (!id) return null;
    for (var i = 0; i < NSG.PRESETS.length; i++) if (NSG.PRESETS[i].preset === id) return NSG.PRESETS[i];
    return null;
  };

  NSG.presetByName = function (name) {
    for (var i = 0; i < NSG.PRESETS.length; i++) if (NSG.PRESETS[i].name === name) return NSG.PRESETS[i];
    return null;
  };

  /* 取一份独立的副本：预置本身不可被就地改动 */
  NSG.presetTimbre = function (id) {
    var p = NSG.presetById(id);
    return p ? NSG.cloneTimbre(p) : NSG.defaultTimbre();
  };

  /* 身高 → 共振峰缩放：声道长 ≈ 身高/10，共振峰与声道长成反比 */
  NSG.heightScale = function (h) {
    h = Math.max(110, Math.min(210, h || 160));
    return 170 / h;
  };

  /* 圆唇 → 声道加长：唇部前突使有效声道变长，全部共振峰一起下移 */
  NSG.lipScale = function (r) {
    return 1 / (1 + Math.max(0, Math.min(0.5, r)));
  };

  // 对数共振峰位移，端点约 +4 / -4 半音；64 精确保持旧音色。
  NSG.genValue = function (t) {
    return typeof t.gen === 'number' && isFinite(t.gen) ? Math.max(0, Math.min(127, t.gen)) : 64;
  };
  NSG.genScale = function (t) {
    return Math.pow(2, (64 - NSG.genValue(t)) / 192);
  };

  /* 把参数块换算成实际使用的 6 组 [频率, 带宽] */
  /* 共振峰 = 音素表的基准值 × 长度缩放 × 形状修正
     长度缩放 sc = 身高缩放 × 圆唇加长 × 声道缩放（fScale）；
     形状修正 warp 只作用于高阶：F_i × (1 + warp·i/5)，i = 1…6。
     于是「长短」与「粗细」成了两根独立的轴——只缩长度会得到"小一号的同一个人"，
     真正让男女、童声听出区别的是两根轴一起用。 */
  NSG.formantsOf = function (phone, timbre) {
    var hs = NSG.heightScale(timbre.height);
    var lip = (phone.lip || 0) + (timbre.lip || 0);
    var sc = hs * NSG.lipScale(lip) * (timbre.fScale || 1) * NSG.genScale(timbre);
    var wp = (timbre.warp || 0);
    var bwS = timbre.bwScale || 1;
    var hi = timbre.higher || [3300, 4200, 5200];
    var hiS = (timbre.hiShift || 1);
    var fR = timbre.fRatio, bwR = timbre.bwRatio;
    var BB = NSG.BW_BASE;
    var pairs = [], f = [], b = [];
    for (var i = 0; i < 3; i++) {
      var baseHz = phone.f[i];
      if (timbre.vowelSpace && phone.t === 'V' && i < 2) {
        // Scale vowel contrasts around a neutral vowel, independently of tract length.
        var neutral = i === 0 ? 500 : 1500;
        baseHz = neutral + (baseHz - neutral) * timbre.vowelSpace[i];
      }
      var fi = baseHz * sc * (1 + wp * i / 5);
      if (fR && fR[i]) fi *= fR[i];
      var bi = BB[i] * bwS;
      if (bwR && bwR[i]) bi *= bwR[i];
      pairs.push([fi, bi]); f.push(fi); b.push(bi);
    }
    for (var k = 0; k < 3; k++) {
      var fk = hi[k] * sc * hiS * (1 + wp * (3 + k) / 5);
      var bk = BB[3 + k] * bwS;
      pairs.push([fk, bk]); f.push(fk); b.push(bk);
    }
    for (var j = 0; j < 6; j++) {
      if (pairs[j][0] > 7500) pairs[j][0] = 7500 - (5 - j) * 130;
      if (pairs[j][1] < 30) pairs[j][1] = 30;
      /* F3 及以上的带宽随频率增大（壁损耗与辐射损耗），Q 不应超过约 18。
         固定带宽下，童声/女声的 F3–F6 被推到 4–7kHz 后挤成一簇窄峰，
         级联增益叠在一起，3–8kHz 的能量反超 F1/F2，听感尖、刺。
         只设下限：男声与基准音色的 F3–F6 本来就不窄于此，基本不受影响。
         4.5kHz 以上辐射损耗随频率平方增长，下限再逐步放宽；16k 采样下贴近
         Nyquist 的窄极点还会把其下整段频带额外抬高数 dB。 */
      if (j >= 2) pairs[j][1] = Math.max(pairs[j][1],
        pairs[j][0] / 18 * (1 + Math.max(0, pairs[j][0] - 4500) / 2000));
    }
    return { pairs: pairs, f: f, b: b, nz: phone.nz || 0, na: phone.na, lip: lip };
  };

  /* ---------------- 声门共振峰（胸腔共鸣） ----------------
     与元音无关的一个固定低共振峰。真实嗓音在 250–400Hz 都有一条不随元音移动的
     谐振，它才是"这是同一个人"的底色；这里用独立的声门共振参数控制。
     频率与带宽都随声道缩放一起变（大人 ~280Hz / 90Hz，童声 ~380Hz / 115Hz），
     实现为对谐波幅度的峰值提升（dB），与谱倾斜同一套口径，不做时域滤波。 */
  NSG.glottalOf = function (timbre) {
    var amt = timbre.glottal || 0;
    if (!(amt > 0.001)) return null;
    var sc = NSG.heightScale(timbre.height) * NSG.lipScale(timbre.lip || 0) * (timbre.fScale || 1) * NSG.genScale(timbre);
    return { f: 300 * sc, bw: 90 * sc, db: 10 * Math.min(1, amt) };
  };

  /* RBJ 峰值滤波（peaking EQ）在 hz 处的增益，dB */
  var glCacheF = -1, glCacheBw = -1, glCacheDb = -1, glCacheSr = -1;
  var glB0 = 1, glB1 = 0, glB2 = 0, glA0 = 1, glA1 = 0, glA2 = 0;
  var INV_LOG_76 = 1 / Math.log(76), LOG_100 = Math.log(100);
  var LOG_50 = Math.log(50), INV_LOG_400 = 1 / Math.log(400), INV_LOG_160 = 1 / Math.log(160);
  NSG.glottalDbAt = function (g, hz, sampleRate) {
    if (!g) return 0;
    var sr = sampleRate || NSG.SR;
    if (g.f !== glCacheF || g.bw !== glCacheBw || g.db !== glCacheDb || sr !== glCacheSr) {
      var A = Math.pow(10, g.db / 40), w0 = 2 * Math.PI * g.f / sr;
      var Q = Math.max(0.3, g.f / g.bw);
      var alpha = Math.sin(w0) / (2 * Q), c0 = -2 * Math.cos(w0);
      glB0 = 1 + alpha * A; glB1 = c0; glB2 = 1 - alpha * A;
      glA0 = 1 + alpha / A; glA1 = c0; glA2 = 1 - alpha / A;
      glCacheF = g.f; glCacheBw = g.bw; glCacheDb = g.db; glCacheSr = sr;
    }
    var w = 2 * Math.PI * hz / sr;
    var c1 = Math.cos(w), s1 = Math.sin(w);
    var c2 = c1 * c1 - s1 * s1, s2 = 2 * c1 * s1;
    var nR = glB0 + glB1 * c1 + glB2 * c2, nI = -(glB1 * s1 + glB2 * s2);
    var dR = glA0 + glA1 * c1 + glA2 * c2, dI = -(glA1 * s1 + glA2 * s2);
    var ratioSq = (nR * nR + nI * nI) / (dR * dR + dI * dI);
    return ratioSq <= 1e-18 ? -180 : 10 * Math.log10(ratioSq);
  };

  NSG.cloneTimbre = function (t) { return JSON.parse(JSON.stringify(t)); };

  // 可选的说话人频谱残差：固定 Hz 轴，避免换音高时把声道特征一起搬走。
  // 与胸腔峰统一送入声源及功率估计；旧音色未设置时完全沿用原路径。
  // out（输出均衡）只进功率估计：渲染时它作用在最终输出上，不能再叠到谐波里。
  NSG.sourceFilterOf = function (t) {
    var gl = NSG.glottalOf(t);
    if (!t.sourceEq && !t.outEq && t.harmTailDb === undefined) return gl;
    return { gl: gl, eq: t.sourceEq || null, out: t.outEq || null, tailDb: t.harmTailDb };
  };
  NSG.sourceDbAt = function (g, hz, sampleRate) {
    if (!g) return 0;
    if (!('gl' in g)) return NSG.glottalDbAt(g, hz, sampleRate);
    var base = g.gl ? NSG.glottalDbAt(g.gl, hz, sampleRate) : 0;
    var eq = g.eq;
    if (!eq) return base;
    var last = eq.length - 1;
    var x = hz <= 100 ? 0 : (Math.log(hz) - LOG_100) * INV_LOG_76 * last;
    if (x >= last) return base + eq[last];
    var i = x | 0;
    if (i >= last) i = last - 1;
    return base + eq[i] + (eq[i + 1] - eq[i]) * (x - i);
  };

  // 可选的整体输出均衡：作用在最终人声（谐波、气声、辅音噪声一起），
  // 由撅取时的合成-对比迭代得到，记录录音整体的长时频谱色彩（含话筒与房间）。
  // 48 点，50–8000Hz 对数频率轴；未设置时渲染路径与旧版逐字节相同。
  NSG.OUT_EQ = { n: 48, lo: 50, hi: 8000, min: -40, max: 24 };
  NSG.outEqHz = function (i) {
    var E = NSG.OUT_EQ;
    return E.lo * Math.pow(E.hi / E.lo, i / (E.n - 1));
  };
  NSG.outEqDbAt = function (eq, hz) {
    var len = eq.length, last = len - 1;
    if (hz <= 50) return eq[0];
    var is64 = len === 64, hi = is64 ? 20000 : 8000;
    if (hz >= hi) return eq[last];
    var x = (Math.log(hz) - LOG_50) * (is64 ? INV_LOG_400 : INV_LOG_160) * last;
    var i = x | 0;
    if (i >= last) i = last - 1;
    return eq[i] + (eq[i + 1] - eq[i]) * (x - i);
  };

  // Separate 50 Hz–20 kHz curves for mode B. The reference F01 recording itself
  // has almost no >6 kHz energy: this is a NEW wideband timbre design, not a
  // recovery of missing recording detail. Preserve the original curve through
  // 3.5 kHz and continue its colour with a restrained -6 dB/oct upper tail.
  // Match the complete original curve, never a user-controlled preset/name tag;
  // edited/extracted custom EQs keep their intended response unless a separate
  // modeBOutEq is explicitly supplied. Neither the preset nor project is edited.
  var modeBEqProfiles = null;
  NSG.modeBOutputEqOf = function (t) {
    if (Array.isArray(t.modeBOutEq) && t.modeBOutEq.length === 64) return t.modeBOutEq;
    if (!Array.isArray(t.outEq)) return null;
    if (!modeBEqProfiles) {
      modeBEqProfiles = Object.create(null);
      ['f1', 'f2'].forEach(function (id) {
        var original = NSG.presetTimbre(id).outEq, anchor = Math.min(0, NSG.outEqDbAt(original, 3500)), curve = [];
        for (var i = 0; i < 64; i++) {
          var hz = 50 * Math.pow(400, i / 63), old = NSG.outEqDbAt(original, hz);
          var tail = anchor - 6 * Math.log2(hz / 3500);
          curve.push(hz <= 3500 ? old : (old > 0 ? Math.min(old, tail) : Math.max(old, tail)));
        }
        modeBEqProfiles[original.join(',')] = curve;
      });
    }
    return modeBEqProfiles[t.outEq.join(',')] || null;
  };

  // Soft and strong endpoints: residual power at 5, 7 and 10 kHz, then
  // amplitude modulation depth of the upper-band residual per glottal cycle.
  NSG.defaultEffortProfile = [0.68, 0.86, 0.96, 0.14, 0.10, 0.23, 0.45, 0.68];
  NSG.validEffortProfile = function (p) {
    return Array.isArray(p) && p.length === 8 && p.every(function (v) { return Number.isFinite(v) && v >= 0 && v <= 1; });
  };
  NSG.validateBlock = function (t) {
    if (t && t.effortProfile !== undefined && !NSG.validEffortProfile(t.effortProfile)) return '轻重音色参数需要 8 个 0–1 的有限数值';
    if (!t || typeof t !== 'object') return '参数块格式错误';
    if (!(t.height >= 110 && t.height <= 210)) return '身高越界（110–210）';
    if (t.gen !== undefined && (typeof t.gen !== 'number' || !isFinite(t.gen) || t.gen < 0 || t.gen > 127)) return 'GEN 越界（0–127）';
    if (t.consonantSoftness !== undefined && (typeof t.consonantSoftness !== 'number' || !isFinite(t.consonantSoftness) || t.consonantSoftness < 0 || t.consonantSoftness > 1))
      return '辅音高频柔化越界（0–1）';
    if (t.nasalLowpassHz !== undefined && (typeof t.nasalLowpassHz !== 'number' || !isFinite(t.nasalLowpassHz) ||
      (t.nasalLowpassHz !== 0 && (t.nasalLowpassHz < 100 || t.nasalLowpassHz > 7500))))
      return '鼻腔支路低通频率越界（0 或 100–7500Hz）';
    if (!Array.isArray(t.harm) || t.harm.length !== 16) return '倍频振幅表长度必须为 16';
    if (!Array.isArray(t.higher) || t.higher.length !== 3) return '高阶共振峰必须为 3 个位置';
    if (t.sourceEq !== undefined && (!Array.isArray(t.sourceEq) || t.sourceEq.length !== 32 ||
      !t.sourceEq.every(function (v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 12; })))
      return '声源频谱修正必须为 32 个有限值（±12dB）';
    if (t.outEq !== undefined && (!Array.isArray(t.outEq) || t.outEq.length !== NSG.OUT_EQ.n ||
      !t.outEq.every(function (v) { return typeof v === 'number' && isFinite(v) && v >= NSG.OUT_EQ.min && v <= NSG.OUT_EQ.max; })))
      return '输出均衡必须为 48 个有限值（−40…+24dB）';
    if (t.modeBOutEq !== undefined && (!Array.isArray(t.modeBOutEq) || t.modeBOutEq.length !== 64 ||
      !t.modeBOutEq.every(function (v) { return typeof v === 'number' && isFinite(v) && v >= -40 && v <= 24; })))
      return '模式B输出均衡必须为 64 个有限值（−40…+24dB，50–20000Hz）';
    if (t.modeBHigh !== undefined && (typeof t.modeBHigh !== 'number' || !isFinite(t.modeBHigh) || t.modeBHigh < 0 || t.modeBHigh > 1))
      return '模式B有声高频必须为 0–1 的有限数值';
    if (t.highVowelOpening !== undefined && (!Number.isFinite(t.highVowelOpening) || t.highVowelOpening < 0 || t.highVowelOpening > 1))
      return 'HiFi 高音元音开口度必须为 0–1 的有限数值';
    if (t.fRatio !== undefined && (!Array.isArray(t.fRatio) || t.fRatio.length !== 3 ||
      !t.fRatio.every(function (v) { return typeof v === 'number' && isFinite(v) && v >= 0.75 && v <= 1.35; })))
      return '共振峰独立比例必须为 3 个有限值（0.75–1.35）';
    if (t.bwRatio !== undefined && (!Array.isArray(t.bwRatio) || t.bwRatio.length !== 3 ||
      !t.bwRatio.every(function (v) { return typeof v === 'number' && isFinite(v) && v >= 0.5 && v <= 2.0; })))
      return '共振峰带宽比例必须为 3 个有限值（0.5–2.0）';
    if (t.vowelSpace !== undefined && (!Array.isArray(t.vowelSpace) || t.vowelSpace.length !== 2 ||
      !t.vowelSpace.every(function (v) { return Number.isFinite(v) && v >= 0.60 && v <= 1.25; })))
      return '元音 F1/F2 分布倍率越界（0.60–1.25）';
    if (t.harmTailDb !== undefined && (!Number.isFinite(t.harmTailDb) || t.harmTailDb < -30 || t.harmTailDb > 0))
      return '高阶倍频续接斜率越界（−30…0 dB/oct）';
    if (t.pitchTilt !== undefined && (typeof t.pitchTilt !== 'number' || !isFinite(t.pitchTilt) || Math.abs(t.pitchTilt) > 12))
      return '音高谱斜率耦合越界（−12…+12 dB/oct²）';
    if (t.refF0 !== undefined && (typeof t.refF0 !== 'number' || !isFinite(t.refF0) || t.refF0 < 40 || t.refF0 > 800))
      return '参考基频越界（40–800Hz）';
    return null;
  };

  NSG.blockToText = function (t) {
    var c = NSG.cloneTimbre(t);
    c.saved = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return JSON.stringify(c, null, 1);
  };

  NSG.textToBlock = function (txt) {
    var t = JSON.parse(txt);
    var err = NSG.validateBlock(t);
    if (err) throw new Error(err);
    return NSG.migrateTimbre(t);
  };

  NSG.STORE_KEY = 'nsg.timbres.v2';
  NSG.listTimbres = function () {
    try {
      var a = JSON.parse(localStorage.getItem(NSG.STORE_KEY) || '[]');
      for (var i = 0; i < a.length; i++) NSG.migrateTimbre(a[i]);
      return a;
    } catch (e) { return []; }
  };
  NSG.saveTimbre = function (t) {
    var all = NSG.listTimbres();
    var c = NSG.cloneTimbre(t);
    var idx = -1;
    for (var i = 0; i < all.length; i++) if (all[i].name === c.name) idx = i;
    if (idx >= 0) all[idx] = c; else all.push(c);
    try { localStorage.setItem(NSG.STORE_KEY, JSON.stringify(all)); } catch (e) { }
    return all;
  };
  NSG.deleteTimbre = function (name) {
    var all = NSG.listTimbres().filter(function (x) { return x.name !== name; });
    try { localStorage.setItem(NSG.STORE_KEY, JSON.stringify(all)); } catch (e) { }
    return all;
  };
})(typeof window !== 'undefined' ? window : global);
