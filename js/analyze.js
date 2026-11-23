/* ==========================================================================
   NSG · 分析模块（16000Hz）
   1) 512 点滤波曲线：六级级联共振器 + 鼻支路的幅频响应（0–8000Hz）
   2) 1000 列频率网格：短时频谱，每列 8Hz（1000 × 8 = 8000Hz）
   3) 倍频振幅：实测谐波幅度
   4) 音色撅取：谐波抑制谱包络 → 聚类 → 折算身高与带宽 → 生成音色块
   5) 音高追踪：音色撅取的合成对比与校准
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['analyze'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  var SR = 16000;
  var A = NSG.AN = {};

  /* ---------- 1. 512 点滤波曲线 ---------- */
  A.filterCurve = function (timbre, phoneId, sampleRate) {
    var SR = sampleRate || 16000;
    var ph = NSG.phoneOf(phoneId || 'a');
    var fm = NSG.formantsOf(ph, timbre);
    var N = 512, out = new Float32Array(N), mx = -1e9;
    var maxF = SR / 2;
    var pairs = fm.pairs;
    for (var i = 0; i < N; i++) {
      var f = maxF * i / (N - 1);
      var w = 2 * Math.PI * f / SR;
      var re = 1, im = 0;
      for (var k = 0; k < pairs.length; k++) {
        var bw = pairs[k][1], fk = pairs[k][0];
        if (!(fk > 20)) continue;
        var r = Math.exp(-Math.PI * bw / SR);
        var bb = 2 * r * Math.cos(2 * Math.PI * fk / SR);
        var cc = -r * r;
        var aa = 1 - bb - cc;
        var d1r = 1 - bb * Math.cos(w) - cc * Math.cos(2 * w);
        var d1i = bb * Math.sin(w) + cc * Math.sin(2 * w);
        var den = d1r * d1r + d1i * d1i + 1e-12;
        var hr = aa * d1r / den, hi = -aa * d1i / den;
        var nr = re * hr - im * hi, ni = re * hi + im * hr;
        re = nr; im = ni;
      }
      var mag = 20 * Math.log10(Math.sqrt(re * re + im * im) + 1e-12);
      out[i] = mag;
      if (mag > mx) mx = mag;
    }
    for (var j = 0; j < N; j++) out[j] = Math.max(-72, out[j] - mx);
    return { points: out, formants: fm, n: N };
  };

  /* ---------- 2. 1000 列频率网格（每列 8Hz） ---------- */
  A.spectrumGrid = function (pcm, opts) {
    opts = opts || {};
    var SR = opts.sampleRate || 16000;
    var COLS = 1000, COL_HZ = (SR / 2) / COLS;   // 8Hz
    var N = SR > 16000 ? 4096 : 1024, hop = opts.hop || 256;
    var frames = Math.max(1, Math.floor((pcm.length - N) / hop) + 1);
    if (frames > 200) { hop = Math.max(hop, Math.floor((pcm.length - N) / 200)); frames = Math.floor((pcm.length - N) / hop) + 1; }
    frames = Math.max(1, Math.min(200, frames));
    var data = new Float32Array(COLS * frames);
    var re = new Float64Array(N), im = new Float64Array(N), win = new Float64Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var binHz = SR / N;                        // 15.625Hz
    var maxDb = -120;
    for (var fr = 0; fr < frames; fr++) {
      var off = fr * hop;
      for (var s = 0; s < N; s++) { re[s] = (pcm[off + s] || 0) * win[s]; im[s] = 0; }
      NSG.fft(re, im);
      var row = fr * COLS;
      for (var c = 0; c < COLS; c++) {
        var hz = c * COL_HZ;
        var b = hz / binHz;
        var b0 = Math.min(N / 2 - 2, Math.floor(b));
        var bfr = Math.max(0, Math.min(1, b - b0));   // 最顶一列曾因外推出负值算出 NaN
        var m0 = Math.sqrt(re[b0] * re[b0] + im[b0] * im[b0]);
        var m1 = Math.sqrt(re[b0 + 1] * re[b0 + 1] + im[b0 + 1] * im[b0 + 1]);
        var db = 20 * Math.log10((m0 * (1 - bfr) + m1 * bfr) / (N * 0.25) + 1e-9);
        data[row + c] = db;
        if (db > maxDb) maxDb = db;
      }
    }
    for (var q = 0; q < data.length; q++) data[q] = Math.max(-96, data[q] - maxDb);
    return { data: data, cols: COLS, rows: frames, maxDb: maxDb, colHz: COL_HZ };
  };

  /* ---------- 3. 倍频振幅 ---------- */
  A.harmonics = function (pcm, f0, count, sampleRate) {
    var SR = sampleRate || 16000;
    count = count || 16;
    var N = 4096;
    if (pcm.length < N) N = 2048;
    var re = new Float64Array(N), im = new Float64Array(N), win = new Float64Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var start = Math.max(0, Math.floor(pcm.length * 0.35) - (N >> 1));
    for (var s = 0; s < N; s++) { re[s] = (pcm[start + s] || 0) * win[s]; im[s] = 0; }
    NSG.fft(re, im);
    var norm = N * 0.25;
    var out = [];
    for (var k = 1; k <= count; k++) {
      var b = k * f0 / (SR / N);
      var b0 = Math.round(b);
      var pk = 0;
      for (var d = -2; d <= 2; d++) {
        var idx = b0 + d;
        if (idx < 1 || idx >= N / 2) continue;
        var m = Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]) / norm;
        if (m > pk) pk = m;
      }
      out.push(20 * Math.log10(pk + 1e-9));
    }
    var mx = Math.max.apply(null, out);
    return out.map(function (v) { return Math.max(-72, v - mx); });
  };

  /* ---------- 4. 音色撅取：最长浊音段的谱质心 ---------- */
  /* 做法：
     1) 10ms 步长分帧，算每帧能量与 300–4000Hz 的谱平坦度
     2) 浊音帧判定：能量 > 0.25 倍峰值，且平坦度 < 0.30（排除擦音与静音）
     3) 取最长的一段连续浊音帧，掐掉前 30%、后 20% 只留稳定段
     4) 在 300–5000Hz 上算幅度加权质心 C
     5) 共振峰与声道长度成反比、声道长度与身高成正比，故 C ∝ 1/身高：
        身高 = 158400 / C（158400 为本引擎 160cm 的定标值，160cm ↔ 990Hz）
     6) 带宽缩放由该段包络尖锐度与同身高基准之比给出 */
  var CENTROID_REF = 171700;   // 300–3500Hz 质心 → 身高，对 120–200cm 拟合（±5cm）
  var EHZ = 10, ENB = Math.floor(5000 / EHZ);

  function boxSmooth(arr, radius) {
    var n = arr.length, out = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var acc = 0, c = 0;
      for (var d = -radius; d <= radius; d++) {
        var j = i + d;
        if (j < 0 || j >= n) continue;
        acc += arr[j]; c++;
      }
      out[i] = acc / c;
    }
    return out;
  }

  function frameInfo(pcm, sr) {
    var N = 1024, hop = Math.round(sr * 0.010);
    var win = new Float64Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var bins = N / 2, binHz = sr / N;
    var fr = [];
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var off = 0; off + N < pcm.length; off += hop) {
      var e = 0;
      for (var s = 0; s < N; s++) { var vv = pcm[off + s]; e += vv * vv; }
      var rms = Math.sqrt(e / N);
      var flat = 1;
      if (rms > 0.004) {
        for (var s2 = 0; s2 < N; s2++) { re[s2] = pcm[off + s2] * win[s2]; im[s2] = 0; }
        NSG.fft(re, im);
        var lg = 0, ar = 0, c = 0;
        for (var k = Math.round(300 / binHz); k <= Math.round(4000 / binHz) && k < bins; k++) {
          var m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-9;
          lg += Math.log(m); ar += m; c++;
        }
        flat = Math.exp(lg / c) / (ar / c);
      }
      fr.push({ off: off, rms: rms, flat: flat });
    }
    return { frames: fr, N: N, binHz: binHz, win: win };
  }

  function segCentroid(pcm, info, a, b) {
    var N = info.N, binHz = info.binHz, win = info.win;
    var num = 0, den = 0;
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = a; i <= b; i++) {
      var off = info.frames[i].off;
      for (var j = 0; j < N; j++) { re[j] = pcm[off + j] * win[j]; im[j] = 0; }
      NSG.fft(re, im);
      /* 质心只取 300–3500Hz：3.5k 以上受声门谱倾斜支配，和身高无关，
         带上它会把质心往高处拽，反推的身高系统性偏小 */
      for (var k = Math.round(300 / binHz); k <= Math.round(3500 / binHz) && k < N / 2; k++) {
        var m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        num += k * binHz * m; den += m;
      }
    }
    return den > 0 ? num / den : 0;
  }

  function segEnvelope(pcm, info, a, b) {
    var N = info.N, binHz = info.binHz, win = info.win;
    var acc = new Float64Array(ENB), n = 0;
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var i = a; i <= b; i++) {
      var off = info.frames[i].off;
      for (var j = 0; j < N; j++) { re[j] = pcm[off + j] * win[j]; im[j] = 0; }
      NSG.fft(re, im);
      var bins = N / 2, db = new Float64Array(bins), mx = -1e9;
      for (var k = 0; k < bins; k++) {
        db[k] = 20 * Math.log10(Math.sqrt(re[k] * re[k] + im[k] * im[k]) + 1e-9);
        if (db[k] > mx) mx = db[k];
      }
      var pf = [], pl = [];
      for (var k1 = 2; k1 < bins - 1; k1++) {
        if (db[k1] <= db[k1 - 1] || db[k1] < db[k1 + 1]) continue;
        if (db[k1] < mx - 55) continue;
        pf.push(k1 * binHz); pl.push(db[k1]);
      }
      if (pf.length < 4) continue;
      var g = new Float64Array(ENB), pi = 0;
      for (var b2 = 0; b2 < ENB; b2++) {
        var f = b2 * EHZ;
        while (pi < pf.length - 2 && pf[pi + 1] < f) pi++;
        if (f <= pf[0]) { g[b2] = pl[0]; continue; }
        if (f >= pf[pf.length - 1]) { g[b2] = pl[pl.length - 1]; continue; }
        var t = (f - pf[pi]) / Math.max(1e-6, pf[pi + 1] - pf[pi]);
        g[b2] = pl[pi] * (1 - t) + pl[pi + 1] * t;
      }
      var sm = boxSmooth(g, Math.round(180 / EHZ));
      for (var b3 = 0; b3 < ENB; b3++) acc[b3] += sm[b3];
      n++;
    }
    if (!n) return null;
    for (var b4 = 0; b4 < ENB; b4++) acc[b4] /= n;
    return acc;
  }

  function sharpness(env) {
    var s = 0;
    for (var i = 1; i < env.length - 1; i++) s += Math.abs(env[i] - 0.5 * (env[i - 1] + env[i + 1]));
    return s / (env.length - 2);
  }

  var refSharp = null;
  function refSharpness(h) {
    if (refSharp && refSharp.h === h) return refSharp.v;
    var t = NSG.defaultTimbre();
    t.height = h;
    var sc = {
      tempo: 60, lang: 'zh',
      tracks: [{ id: 'v', type: 'vocal', notes: [
        { start: 0, dur: 1.0, pitch: 57, lyric: 'a', phones: ['a'] },
        { start: 1.0, dur: 1.0, pitch: 57, lyric: 'e', phones: ['e'] },
        { start: 2.0, dur: 1.0, pitch: 57, lyric: 'o', phones: ['o'] }
      ] }]
    };
    var r = NSG.DSP.render(sc, t);
    var info = frameInfo(r.pcm, NSG.SR);
    var env = segEnvelope(r.pcm, info, Math.round(info.frames.length * 0.15), Math.round(info.frames.length * 0.85));
    refSharp = { h: h, v: env ? sharpness(env) : 1 };
    return refSharp.v;
  }

  A.extractFormantsLegacy = function (pcm, sr) {
    sr = sr || SR;
    var info = frameInfo(pcm, sr);
    var fr = info.frames;
    if (fr.length < 12) throw new Error('音频太短，请给一段不少于 1 秒的朗读');

    var mx = 0;
    for (var i = 0; i < fr.length; i++) if (fr[i].rms > mx) mx = fr[i].rms;
    if (mx < 0.006) throw new Error('音量太低，请换一段更清晰的朗读');

    var best = { len: 0, s: 0, e: 0 }, cur = null;
    for (var j = 0; j < fr.length; j++) {
      var ok = fr[j].rms > mx * 0.25 && fr[j].flat < 0.30;
      if (ok) { if (!cur) cur = { s: j, e: j }; else cur.e = j; }
      else { if (cur && cur.e - cur.s > best.len) best = { len: cur.e - cur.s, s: cur.s, e: cur.e }; cur = null; }
    }
    if (cur && cur.e - cur.s > best.len) best = { len: cur.e - cur.s, s: cur.s, e: cur.e };
    if (best.len < 10) throw new Error('没有找到足够长的浊音段，请发一个持续的长音再试');

    var a = best.s + Math.round(best.len * 0.30);
    var b = best.e - Math.round(best.len * 0.20);
    if (b <= a) { a = best.s; b = best.e; }

    var cent = segCentroid(pcm, info, a, b);
    if (!(cent > 100)) throw new Error('无法计算谱质心，请换一段更清晰的朗读');
    var height = Math.max(110, Math.min(210, Math.round(CENTROID_REF / cent)));

    var env = segEnvelope(pcm, info, a, b);
    var rs = refSharpness(height);
    var bwScale = env ? Math.max(0.5, Math.min(2.0, sharpness(env) / (rs + 1e-9))) : 1;
    bwScale = Math.round(bwScale * 20) / 20;

    var t = NSG.defaultTimbre();
    t.height = height;
    t.bwScale = bwScale;
    var fm = NSG.formantsOf(NSG.PHONES.a, t);

    return {
      height: height,
      bwScale: bwScale,
      formants: fm.f.slice(0, 4).map(function (v) { return Math.round(v); }),
      bandwidths: fm.b.slice(0, 4).map(function (v) { return Math.round(v); }),
      centroid: Math.round(cent),
      segSeconds: +((b - a) * 0.01).toFixed(2),
      frames: fr.length,
      confidence: +Math.min(1, (b - a) / 120).toFixed(2)
    };
  };

  /* 多帧声源/声道拟合。未知元音作为隐变量，不能把一句话的谱质心当声道长度。
     使用谐波峰值而非 FFT 谷底；每帧去电平偏置，录音响度不参与说话人估计。
     交错留出帧只用于诊断，残差 EQ 仅从训练帧估计并作平滑、收缩与限幅。 */
  function median(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  var FIT_PHONES = ['a', 'af', 'e', 'i', 'o', 'u', 'U', 'I', 'y', '7', '@', '3', '1', 'ae', 'V'];
  var RARE_VOWEL_PENALTY = { '1': 1.8, '3': 1.2 };

  function voiceFrames(pcm) {
    var N_WIN = 1024, step = Math.max(256, Math.floor((pcm.length - N_WIN) / 360 / 160) * 160);
    var rawFrames = [], levels = [], max = 0;
    for (var off = 0; off + N_WIN <= pcm.length; off += step) {
      var sum = 0, sq = 0;
      for (var j = 0; j < N_WIN; j++) { sum += pcm[off + j]; sq += pcm[off + j] * pcm[off + j]; }
      var rms = Math.sqrt(Math.max(0, sq / N_WIN - sum * sum / (N_WIN * N_WIN)));
      levels.push({ off: off, rms: rms, mean: sum / N_WIN }); max = Math.max(max, rms);
    }
    if (max < 1e-6) throw new Error('没有可分析的人声信号');
    var activeRms = levels.filter(function (v) { return v.rms > max * 0.02; }).map(function (v) { return v.rms; });
    var threshold = Math.max(max * 0.035, median(activeRms.length ? activeRms : [max]) * 0.32);
    var win = new Float64Array(N_WIN);
    for (var w = 0; w < N_WIN; w++) win[w] = 0.5 - 0.5 * Math.cos(2 * Math.PI * w / (N_WIN - 1));

    levels.forEach(function (level) {
      if (level.rms < threshold) return;
      var x = new Float64Array(N_WIN);
      for (var j = 0; j < N_WIN; j++) x[j] = (pcm[level.off + j] - level.mean) / level.rms;
      var corr = new Float64Array(268), best = 0;
      // 歌唱基频拓展至 60–640Hz（lag 25..267），覆盖男低音至女高音 C5–E5
      for (var lag = 25; lag <= 267; lag++) {
        var xy = 0, xx = 0, yy = 0;
        for (var k = 0; k < N_WIN - 268; k += 2) {
          xy += x[k] * x[k + lag]; xx += x[k] * x[k]; yy += x[k + lag] * x[k + lag];
        }
        corr[lag] = xy / Math.sqrt(xx * yy + 1e-12);
        if (corr[lag] > best) best = corr[lag];
      }
      if (best < 0.72) return;
      var period = 0;
      for (var l = 26; l < 267; l++) {
        if (corr[l] >= best * 0.93 && corr[l] >= corr[l - 1] && corr[l] > corr[l + 1]) { period = l; break; }
      }
      if (!period) return;
      var den = corr[period - 1] - 2 * corr[period] + corr[period + 1];
      var delta = den !== 0 ? 0.5 * (corr[period - 1] - corr[period + 1]) / den : 0;
      var f0 = SR / (period + clamp(delta, -0.5, 0.5));

      // 帧内前后半窗音高稳定性检验：滤除歌唱滑音、转音与辅元交界瞬态
      var halfLen = Math.min(384, N_WIN - period - 6), bestL1 = period, bestC1 = -1, bestL2 = period, bestC2 = -1;
      var off2 = Math.max(0, N_WIN - halfLen - period - 4);
      for (var dl = -3; dl <= 3; dl++) {
        var lg = period + dl;
        if (lg < 25 || lg > 266) continue;
        var xy1 = 0, xx1 = 0, yy1 = 0, xy2 = 0, xx2 = 0, yy2 = 0;
        for (var m = 0; m < halfLen; m += 2) {
          xy1 += x[m] * x[m + lg]; xx1 += x[m] * x[m]; yy1 += x[m + lg] * x[m + lg];
          var m2 = off2 + m;
          xy2 += x[m2] * x[m2 + lg]; xx2 += x[m2] * x[m2]; yy2 += x[m2 + lg] * x[m2 + lg];
        }
        var c1 = xy1 / Math.sqrt(xx1 * yy1 + 1e-12), c2 = xy2 / Math.sqrt(xx2 * yy2 + 1e-12);
        if (c1 > bestC1) { bestC1 = c1; bestL1 = lg; }
        if (c2 > bestC2) { bestC2 = c2; bestL2 = lg; }
      }
      var glide = Math.abs(bestL1 - bestL2) / period;

      var re = new Float64Array(2048), im = new Float64Array(2048);
      for (var n = 0; n < N_WIN; n++) re[n] = x[n] * win[n];
      NSG.fft(re, im);
      var binHz = SR / 2048;
      var hz = [], db = [], trig = [], peak = -200;
      for (var h = 1; h <= 48 && h * f0 < 6200; h++) {
        var freq = h * f0, b = Math.round(freq / binHz), mag = 0;
        var rad = Math.min(Math.max(1, Math.floor(f0 / binHz * 0.28)), 1 + (h >> 4));
        for (var d = -rad; d <= rad; d++) {
          var idx = b + d;
          if (idx >= 1 && idx < 1024) mag = Math.max(mag, Math.hypot(re[idx], im[idx]));
        }
        var val = 20 * Math.log10(mag + 1e-9), w = 2 * Math.PI * freq / SR;
        hz.push(freq); db.push(val); peak = Math.max(peak, val);
        trig.push([Math.cos(w), Math.sin(w), Math.cos(2 * w), Math.sin(2 * w)]);
      }
      // 极弱谱线通常由底噪决定，不能让它们把声源拟合成白噪声。
      var weight = db.map(function (v) { return clamp((v - peak + 55) / 20, 0, 1); });
      var eLow = 0, nLow = 0, eMid = 0, nMid = 0;
      for (var hi = 0; hi < hz.length; hi++) {
        if (hz[hi] >= 250 && hz[hi] <= 900) { eLow += db[hi]; nLow++; }
        else if (hz[hi] > 900 && hz[hi] <= 2600) { eMid += db[hi]; nMid++; }
      }
      var color = (nMid ? eMid / nMid : 0) - (nLow ? eLow / nLow : 0);
      rawFrames.push({
        time: level.off / SR, rms: level.rms, f0: f0, clarity: corr[period], glide: glide, color: color,
        hz: hz, db: db, weight: weight, trig: trig
      });
    });

    // 优先采用音高稳定、周期性高的歌唱稳态长音帧；并在时间桶内按频谱色彩分层抽样，避免单一长音垄断训练集
    var stable = rawFrames.filter(function (f) { return f.glide <= 0.04 && f.clarity >= 0.78; });
    var frames = stable.length >= 24 ? stable : rawFrames;
    if (frames.length > 64) {
      var selected = [];
      var buckets = 16;
      for (var b = 0; b < buckets; b++) {
        var s0 = Math.floor(b * frames.length / buckets);
        var s1 = Math.floor((b + 1) * frames.length / buckets);
        var slice = frames.slice(s0, s1);
        if (slice.length <= 4) {
          selected.push.apply(selected, slice);
        } else {
          var byColor = slice.slice().sort(function (x, y) { return x.color - y.color; });
          var picks = [
            byColor[0],
            byColor[Math.floor((byColor.length - 1) / 3)],
            byColor[Math.floor((byColor.length - 1) * 2 / 3)],
            byColor[byColor.length - 1]
          ];
          picks.sort(function (x, y) { return x.time - y.time; });
          selected.push.apply(selected, picks);
        }
      }
      frames = selected.slice(0, 64);
    }
    return frames;
  }

  // 基于与元音弱相关的高阶共振峰簇（F3/F4，2.4–4.6kHz）与低音区锚点估计物理声道缩放先验，
  // 解决高音区稀疏谐波下男高音与女声的声道长度歧义。
  function tractScalePrior(frames) {
    var G = 220, step = 25;
    var acc = new Float64Array(G), wts = new Float64Array(G);
    frames.forEach(function (f) {
      var sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (var i = 0; i < f.hz.length; i++) {
        var w = f.weight[i];
        var x = Math.log2(i + 1), y = f.db[i];
        sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
      }
      if (sw < 1e-6) return;
      var mx = sx / sw, my = sy / sw;
      var slope = (sxy - sw * mx * my) / Math.max(1e-6, sxx - sw * mx * mx);
      var intercept = my - slope * mx;
      var det = f.db.map(function (v, idx) { return v - (intercept + slope * Math.log2(idx + 1)); });
      var peak = -Infinity;
      for (var p = 0; p < det.length; p++) if (det[p] > peak) peak = det[p];
      for (var g = 8; g < G; g++) {
        var hz = g * step;
        if (hz < f.f0 * 0.8 || hz > f.hz[f.hz.length - 1]) continue;
        var hFloat = hz / f.f0 - 1;
        var h0 = Math.max(0, Math.floor(hFloat)), h1 = Math.min(det.length - 1, h0 + 1);
        var frac = Math.max(0, Math.min(1, hFloat - h0));
        var val = (det[h0] - peak) * (1 - frac) + (det[h1] - peak) * frac;
        acc[g] += val;
        wts[g] += 1;
      }
    });
    for (var g2 = 0; g2 < G; g2++) if (wts[g2] > 0) acc[g2] /= wts[g2];
    var num = 0, den = 0;
    for (var g3 = Math.round(2200 / step); g3 <= Math.round(4800 / step); g3++) {
      if (wts[g3] < 3) continue;
      var w2 = Math.pow(10, Math.max(-20, acc[g3]) / 20);
      num += g3 * step * w2; den += w2;
    }
    var hiCent = den > 0 ? num / den : 3450;
    var eM = 0, nM = 0, eF = 0, nF = 0;
    for (var gm = Math.round(2400 / step); gm <= Math.round(3400 / step); gm++) if (wts[gm] >= 3) { eM += acc[gm]; nM++; }
    for (var gf = Math.round(3500 / step); gf <= Math.round(4600 / step); gf++) if (wts[gf] >= 3) { eF += acc[gf]; nF++; }
    var diffMF = (nM ? eM / nM : 0) - (nF ? eF / nF : 0);

    var scaleUpper = clamp(1.11 + (hiCent - 3480) / 1600 - 0.022 * diffMF, 0.85, 1.30);
    var f0s = frames.map(function (f) { return f.f0; }).sort(function (a, b) { return a - b; });
    var p15 = f0s[Math.floor(f0s.length * 0.15)] || 180;
    var scaleF0 = clamp(0.95 + 0.22 * Math.log2(clamp(p15, 95, 340) / 150), 0.88, 1.26);
    return clamp(0.75 * scaleUpper + 0.25 * scaleF0, 0.86, 1.28);
  }

  var LOG2_H = new Float64Array(65);
  for (var lh = 1; lh <= 64; lh++) LOG2_H[lh] = Math.log2(lh);
  var LP_6K = Math.exp(-2 * Math.PI * 6000 / SR), TEN_OVER_LN10 = 10 / Math.LN10;

  function preparePhoneModel(t, phone) {
    var pairs = NSG.formantsOf(NSG.PHONES[phone], t).pairs;
    var coeff = new Float64Array(18);
    for (var i = 0; i < 6; i++) {
      var p = pairs[i];
      var r = Math.exp(-Math.PI * p[1] / SR), b = 2 * r * Math.cos(2 * Math.PI * p[0] / SR), c = -r * r;
      coeff[i * 3] = b;
      coeff[i * 3 + 1] = c;
      coeff[i * 3 + 2] = 20 * Math.log10(Math.max(1e-9, 1 - b - c));
    }
    return {
      coeff: coeff,
      gl: NSG.sourceFilterOf(t),
      harm: t.harm, tailDb: t.harmTailDb === undefined ? NSG.TAIL_DB_OCT : t.harmTailDb,
      outEq: t.outEq || null,
      tiltDb: t.tiltDb || 0,
      pitchTilt: t.pitchTilt || 0,
      refF0: t.refF0 || 220
    };
  }

  function predictedWithModel(frame, m) {
    var effTilt = m.tiltDb + (m.pitchTilt ? m.pitchTilt * clamp(Math.log2(Math.max(40, frame.f0) / m.refF0), -1.5, 1.5) : 0);
    var hzArr = frame.hz, trigArr = frame.trig, n = hzArr.length;
    var out = new Array(n);
    var coeff = m.coeff, harm = m.harm, h15 = harm[15], gl = m.gl, outEq = m.outEq;
    var c0 = coeff[0], c1 = coeff[1], c2 = coeff[2],
        c3 = coeff[3], c4 = coeff[4], c5 = coeff[5],
        c6 = coeff[6], c7 = coeff[7], c8 = coeff[8],
        c9 = coeff[9], c10 = coeff[10], c11 = coeff[11],
        c12 = coeff[12], c13 = coeff[13], c14 = coeff[14],
        c15 = coeff[15], c16 = coeff[16], c17 = coeff[17];
    var gainSum = c2 + c5 + c8 + c11 + c14 + c17;
    var lpSq1 = 1 + LP_6K * LP_6K, twoLp = 2 * LP_6K;
    for (var i = 0; i < n; i++) {
      var hz = hzArr[i], tr = trigArr[i], h = i + 1;
      var cw = tr[0], sw = tr[1], c2w = tr[2], s2w = tr[3];
      var l2h = h <= 64 ? LOG2_H[h] : Math.log2(h);
      var v = h <= 16 ? harm[i] : h15 + m.tailDb * (l2h - 4);
      v += effTilt * l2h + NSG.sourceDbAt(gl, hz) + (outEq ? NSG.outEqDbAt(outEq, hz) : 0) + gainSum;
      var r0 = 1 - c0 * cw - c1 * c2w, i0 = c0 * sw + c1 * s2w;
      var r1 = 1 - c3 * cw - c4 * c2w, i1 = c3 * sw + c4 * s2w;
      var r2 = 1 - c6 * cw - c7 * c2w, i2 = c6 * sw + c7 * s2w;
      var r3 = 1 - c9 * cw - c10 * c2w, i3 = c9 * sw + c10 * s2w;
      var r4 = 1 - c12 * cw - c13 * c2w, i4 = c12 * sw + c13 * s2w;
      var r5 = 1 - c15 * cw - c16 * c2w, i5 = c15 * sw + c16 * s2w;
      var d0 = r0 * r0 + i0 * i0 + 1e-18, d1 = r1 * r1 + i1 * i1 + 1e-18, d2 = r2 * r2 + i2 * i2 + 1e-18;
      var d3 = r3 * r3 + i3 * i3 + 1e-18, d4 = r4 * r4 + i4 * i4 + 1e-18, d5 = r5 * r5 + i5 * i5 + 1e-18;
      v -= TEN_OVER_LN10 * (Math.log(d0 * d1 * d2) + Math.log(d3 * d4 * d5));
      out[i] = v + TEN_OVER_LN10 * Math.log(Math.max(1e-9, 2 - 2 * cw) / (lpSq1 - twoLp * cw));
    }
    return out;
  }

  function predicted(frame, t, phone) {
    return predictedWithModel(frame, preparePhoneModel(t, phone));
  }
  function differenceErrorOnly(frame, model) {
    var db = frame.db, wt = frame.weight, n = db.length;
    var offset = 0, count = 0;
    for (var i = 0; i < n; i++) { var wi = wt[i]; offset += (db[i] - model[i]) * wi; count += wi; }
    offset /= count > 1 ? count : 1;
    var error = 0;
    for (var j = 0; j < n; j++) {
      var r = db[j] - model[j] - offset, r2 = r * r;
      error += (r2 < 400 ? r2 : 400) * wt[j];
    }
    return error / (count > 1 ? count : 1);
  }
  function difference(frame, model) {
    var offset = 0, count = 0;
    frame.db.forEach(function (v, i) { offset += (v - model[i]) * frame.weight[i]; count += frame.weight[i]; });
    offset /= Math.max(1, count);
    var residual = frame.db.map(function (v, i) { return v - model[i] - offset; });
    var error = 0;
    residual.forEach(function (v, i) { error += Math.min(400, v * v) * frame.weight[i]; });
    return { error: error / Math.max(1, count), residual: residual };
  }
  function buildModelMap(t, labels) {
    var map = Object.create(null);
    if (labels) {
      for (var i = 0; i < labels.length; i++) {
        var ph = labels[i];
        if (!map[ph]) map[ph] = preparePhoneModel(t, ph);
      }
    } else {
      for (var j = 0; j < FIT_PHONES.length; j++) {
        var fp = FIT_PHONES[j];
        map[fp] = preparePhoneModel(t, fp);
      }
    }
    return map;
  }
  function matchFrames(frames, t, labels) {
    var total = 0, selected = new Array(frames.length);
    var models = buildModelMap(t, labels);
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (labels) {
        var lp = labels[i];
        total += differenceErrorOnly(f, predictedWithModel(f, models[lp]));
        selected[i] = lp;
      } else {
        var best = Infinity, bestRaw = 0, label = FIT_PHONES[0];
        for (var pIdx = 0; pIdx < FIT_PHONES.length; pIdx++) {
          var p = FIT_PHONES[pIdx];
          var rawE = differenceErrorOnly(f, predictedWithModel(f, models[p]));
          var e = rawE + (RARE_VOWEL_PENALTY[p] || 0);
          if (e < best) { best = e; bestRaw = rawE; label = p; }
        }
        total += bestRaw;
        selected[i] = label;
      }
    }
    return { error: total / Math.max(1, frames.length), labels: selected };
  }

  // 去斜率匹配：消除歌唱不同音区发声力度（声源谱斜率变化）对共振峰位置与声道缩放估计的干扰
  function differenceDetilted(frame, model) {
    var sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    var n = frame.hz.length, hzArr = frame.hz, wtArr = frame.weight, dbArr = frame.db;
    for (var i = 0; i < n; i++) {
      var w = wtArr[i] * (hzArr[i] <= 3600 ? 1.0 : 0.30);
      if (w <= 0) continue;
      var x = i < 64 ? LOG2_H[i + 1] : Math.log2(i + 1), y = dbArr[i] - model[i];
      sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
    }
    if (sw < 1e-6) return { error: 0, slope: 0 };
    var mx = sx / sw, my = sy / sw;
    var vx = sxx - sw * mx * mx, cov = sxy - sw * mx * my;
    var slope = vx > 1e-6 ? clamp(cov / vx, -9, 9) : 0;
    var intercept = my - slope * mx;
    var err = 0;
    for (var j = 0; j < n; j++) {
      var w2 = wtArr[j] * (hzArr[j] <= 3600 ? 1.0 : 0.30);
      var l2j = j < 64 ? LOG2_H[j + 1] : Math.log2(j + 1);
      var r = dbArr[j] - model[j] - (intercept + slope * l2j), r2 = r * r;
      err += (r2 < 400 ? r2 : 400) * w2;
    }
    return { error: err / sw + 0.04 * slope * slope, slope: slope };
  }
  function matchFramesDetilted(frames, t, labels) {
    var total = 0, selected = new Array(frames.length), slopes = new Array(frames.length);
    var models = buildModelMap(t, labels);
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (labels) {
        var lp = labels[i];
        var d0 = differenceDetilted(f, predictedWithModel(f, models[lp]));
        total += d0.error; selected[i] = lp; slopes[i] = d0.slope;
      } else {
        var best = Infinity, label = FIT_PHONES[0], bestSlope = 0;
        for (var pIdx = 0; pIdx < FIT_PHONES.length; pIdx++) {
          var p = FIT_PHONES[pIdx];
          var d = differenceDetilted(f, predictedWithModel(f, models[p]));
          var e = d.error + (RARE_VOWEL_PENALTY[p] || 0);
          if (e < best) { best = e; label = p; bestSlope = d.slope; }
        }
        total += best; selected[i] = label; slopes[i] = bestSlope;
      }
    }
    return { error: total / Math.max(1, frames.length), labels: selected, slopes: slopes };
  }

  // 共振峰峰谷突出度（Peak Prominence）：在稀疏歌唱谐波上稳定估计带宽缩放与 F1/F2/F3 独立带宽比，避免 MSE 把带宽推向 2.4 极限
  function bandProminence(hzArr, dbArr, weightArr, loHz, hiHz) {
    var maxP = 0, sumP = 0, cnt = 0;
    for (var i = 1; i < hzArr.length - 1; i++) {
      var hz = hzArr[i];
      if (hz < loHz || hz > hiHz || weightArr[i] < 0.5) continue;
      var left = i >= 2 ? 0.5 * (dbArr[i - 1] + dbArr[i - 2]) : dbArr[i - 1];
      var right = i + 2 < hzArr.length ? 0.5 * (dbArr[i + 1] + dbArr[i + 2]) : dbArr[i + 1];
      var prom = Math.max(0, dbArr[i] - 0.5 * (left + right));
      if (prom > maxP) maxP = prom;
      sumP += prom; cnt++;
    }
    return cnt > 0 ? 0.65 * maxP + 0.35 * (sumP / cnt) : 0;
  }
  function fitBandwidthByProminence(train, t, labels) {
    var bands = [[250, 950], [950, 2300], [2300, 3700]];
    var targetProm = [0, 0, 0], counts = [0, 0, 0];
    train.forEach(function (f) {
      for (var b = 0; b < 3; b++) {
        var p = bandProminence(f.hz, f.db, f.weight, bands[b][0], bands[b][1]);
        if (p > 0) { targetProm[b] += p; counts[b]++; }
      }
    });
    for (var b0 = 0; b0 < 3; b0++) targetProm[b0] /= Math.max(1, counts[b0]);
    var targetAll = (targetProm[0] + targetProm[1] + targetProm[2]) / 3;

    var bestBw = 1.0, bestLoss = Infinity;
    for (var bw = 0.72; bw <= 1.65; bw += 0.04) {
      t.bwScale = +bw.toFixed(3);
      var modelsBw = buildModelMap(t, labels);
      var modelProm = [0, 0, 0];
      for (var idx = 0; idx < train.length; idx++) {
        var f = train[idx], pred = predictedWithModel(f, modelsBw[labels[idx]]);
        for (var b = 0; b < 3; b++) {
          modelProm[b] += bandProminence(f.hz, pred, f.weight, bands[b][0], bands[b][1]) / Math.max(1, counts[b]);
        }
      }
      var modelAll = (modelProm[0] + modelProm[1] + modelProm[2]) / 3;
      var promLoss = Math.pow(modelAll - targetAll, 2) +
        0.3 * (Math.pow(modelProm[0] - targetProm[0], 2) + Math.pow(modelProm[1] - targetProm[1], 2) + Math.pow(modelProm[2] - targetProm[2], 2)) +
        0.8 * Math.pow(bw - 1.0, 2);
      if (promLoss < bestLoss) { bestLoss = promLoss; bestBw = +bw.toFixed(3); }
    }
    t.bwScale = bestBw;

    var bwRatio = [1, 1, 1];
    t.bwRatio = bwRatio;
    for (var bIdx = 0; bIdx < 3; bIdx++) {
      if (counts[bIdx] < 4) continue;
      var bestR = 1.0, bestDiff = Infinity;
      for (var r = 0.78; r <= 1.28; r += 0.05) {
        bwRatio[bIdx] = +r.toFixed(2);
        var modelsR = buildModelMap(t, labels);
        var mp = 0;
        for (var idx2 = 0; idx2 < train.length; idx2++) {
          var f2 = train[idx2], pred2 = predictedWithModel(f2, modelsR[labels[idx2]]);
          mp += bandProminence(f2.hz, pred2, f2.weight, bands[bIdx][0], bands[bIdx][1]) / counts[bIdx];
        }
        var d = Math.abs(mp - targetProm[bIdx]) + 0.5 * Math.abs(r - 1);
        if (d < bestDiff) { bestDiff = d; bestR = +r.toFixed(2); }
      }
      bwRatio[bIdx] = bestR;
    }
  }

  // 反卷积声门源 16 阶倍频结构（H1–H16，含 H1–H2 开商特征）、基准谱倾斜与音高-谱斜率耦合（pitchTilt）
  function fitGlottalSource(train, t, labels) {
    var f0s = train.map(function (f) { return f.f0; });
    var refF0 = +clamp(median(f0s), 70, 520).toFixed(1);
    t.refF0 = refF0;
    t.harm = NSG.defaultHarm();
    t.pitchTilt = 0;

    var frameTilts = [], frameOcts = [];
    train.forEach(function (f, idx) {
      var baseT = NSG.cloneTimbre(t); baseT.tiltDb = 0; baseT.pitchTilt = 0;
      var d = differenceDetilted(f, predicted(f, baseT, labels[idx]));
      frameTilts.push(d.slope);
      frameOcts.push(clamp(Math.log2(Math.max(40, f.f0) / refF0), -1.5, 1.5));
    });
    t.tiltDb = +clamp(median(frameTilts), -8, 8).toFixed(2);

    var meanOct = frameOcts.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, frameOcts.length);
    var vOct = 0, covOct = 0;
    for (var i = 0; i < frameOcts.length; i++) {
      var dx = frameOcts[i] - meanOct, dy = frameTilts[i] - t.tiltDb;
      vOct += dx * dx; covOct += dx * dy;
    }
    t.pitchTilt = vOct > 0.35 ? +clamp(covOct / (vOct + 0.25) * 0.65, -5, 5).toFixed(2) : 0;

    var harmRes = Array.from({ length: 16 }, function () { return []; });
    train.forEach(function (f, idx) {
      var model = predicted(f, t, labels[idx]);
      var diff = difference(f, model);
      for (var h = 0; h < Math.min(16, f.hz.length); h++) {
        if (f.weight[h] >= 0.65) harmRes[h].push(diff.residual[h]);
      }
    });
    var medRes = harmRes.map(function (arr) { return arr.length >= 3 ? median(arr) : 0; });
    var r0 = medRes[0];
    var delta = medRes.map(function (v) { return v - r0; });

    var sX = 0, sY = 0, sXX = 0, sXY = 0, nH = 0;
    for (var k = 1; k < 16; k++) {
      if (harmRes[k].length < 3) continue;
      var lx = Math.log2(k + 1), ly = delta[k];
      sX += lx; sY += ly; sXX += lx * lx; sXY += lx * ly; nH++;
    }
    if (nH >= 4) {
      var mX = sX / nH, mY = sY / nH;
      var vX = sXX - nH * mX * mX, cXY = sXY - nH * mX * mY;
      var extraSlope = vX > 1e-4 ? clamp(cXY / vX, -4, 4) : 0;
      t.tiltDb = +clamp(t.tiltDb + extraSlope * 0.75, -8, 8).toFixed(2);
      for (var k2 = 1; k2 < 16; k2++) delta[k2] -= extraSlope * Math.log2(k2 + 1);
    }

    var baseHarm = NSG.defaultHarm();
    var newHarm = [0];
    for (var h2 = 1; h2 < 16; h2++) {
      var dVal = delta[h2];
      if (h2 >= 4 && h2 < 15) dVal = 0.25 * delta[h2 - 1] + 0.5 * delta[h2] + 0.25 * delta[h2 + 1];
      var shrink = harmRes[h2].length >= 6 ? 0.72 : harmRes[h2].length >= 3 ? 0.45 : 0;
      var val = baseHarm[h2] + clamp(dVal * shrink, -10, 12);
      newHarm.push(+clamp(Math.round(val * 10) / 10, -58, 0));
    }
    t.harm = newHarm;
  }

  // Every calibration note has a corresponding recording window at the same F0.
  // Sorting first keeps low/high registers represented even in long recordings.
  function calibration(train, labels) {
    var sorted = train.map(function (f, i) { return { frame: f, phone: labels[i] }; })
      .sort(function (a, b) { return a.frame.f0 - b.frame.f0; });
    var count = Math.min(28, sorted.length), target = [], synth = [], notes = [];
    for (var i = 0; i < count; i++) {
      var item = sorted[Math.floor((i + 0.5) * sorted.length / count)], f = item.frame;
      var pitch = 69 + 12 * Math.log2(f.f0 / 440);
      notes.push({ id: 'cal' + i, start: i * 0.48, dur: 0.48, pitch: pitch, lyric: item.phone,
        phones: [item.phone], vel: 90, vibrato: { enabled: false } });
      target.push({ center: f.time + 0.032, f0: f.f0 });
      synth.push({ center: i * 0.24 + 0.14, f0: f.f0 });
    }
    return { score: { tempo: 120, lang: 'zh', tracks: [{ type: 'vocal', notes: notes }] },
      target: target, synth: synth };
  }

  // Measure log-band envelopes in the stable window only. Include at least one
  // harmonic per band and normalize each window to its own midrange level.
  function calibrationSpectrum(pcm, rate, windows, centers) {
    var size = rate === SR ? 1024 : 2048, binHz = rate / size;
    var re = new Float64Array(size), im = new Float64Array(size), win = new Float64Array(size);
    var bands = centers.map(function () { return []; }), noise = [];
    for (var j = 0; j < size; j++) win[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / size);
    windows.forEach(function (fr) {
      var start = Math.round(fr.center * rate) - size / 2;
      if (start < 0 || start + size > pcm.length) return;
      for (var i = 0; i < size; i++) { re[i] = pcm[start + i] * win[i]; im[i] = 0; }
      NSG.fft(re, im);
      var power = new Float64Array(size / 2 + 1), harm = 0, gap = 0;
      for (var k = 1; k < power.length; k++) {
        var p = re[k] * re[k] + im[k] * im[k];
        power[k] = power[k - 1] + p;
        if (rate === SR && k * binHz >= 700 && k * binHz <= 3500) {
          var order = k * binHz / fr.f0, dist = Math.abs(order - Math.round(order));
          if (dist < 0.20) harm += p;
          if (dist > 0.30) gap += p;
        }
      }
      if (harm > 0 && gap > 0) noise.push(10 * Math.log10(gap / harm));
      var db = centers.map(function (hz) {
        var radius = Math.max(hz * 0.09, fr.f0 * 0.55);
        var low = clamp(Math.floor((hz - radius) / binHz), 1, power.length - 1);
        var high = clamp(Math.ceil((hz + radius) / binHz), low, power.length - 1);
        return 10 * Math.log10(Math.max(1e-30, (power[high] - power[low - 1]) / (high - low + 1)));
      });
      var ref = 0, n = 0;
      centers.forEach(function (hz, i) { if (hz >= 300 && hz <= 3000) { ref += db[i]; n++; } });
      ref /= n;
      centers.forEach(function (hz, i) {
        if (hz >= fr.f0 * 0.80 && hz <= rate * 0.48) bands[i].push(Math.max(-68, db[i] - ref));
      });
    });
    return { bands: bands, noise: noise.length ? median(noise) : null };
  }

  function computeSourceEq(train, t, labels, scaleFactor) {
    var tNoSrc = NSG.cloneTimbre(t);
    delete tNoSrc.sourceEq;
    var models = buildModelMap(tNoSrc, labels);
    var bins = Array.from({ length: 32 }, function () { return []; });
    train.forEach(function (f, i) {
      var residual = difference(f, predictedWithModel(f, models[labels[i]])).residual;
      f.hz.forEach(function (hz, k) {
        if (f.weight[k] < 0.7) return;
        var b = Math.round(Math.log(hz / 100) / Math.log(76) * 31);
        if (b >= 0 && b < 32) bins[b].push(residual[k]);
      });
    });
    var eq = bins.map(function (b) { return b.length >= 3 ? median(b) : 0; });
    return Array.from(boxSmooth(boxSmooth(eq, 1), 1), function (v) {
      return +clamp(v * (scaleFactor || 0.70), -9, 9).toFixed(2);
    });
  }

  // Follow a local pitch near its known period. Parabolic interpolation avoids
  // interpreting the integer lag grid as jitter, especially in soprano notes.
  function localPeriod(pcm, start, period) {
    var lag = Math.round(period), r = Math.max(3, Math.ceil(period * 0.085));
    var len = Math.max(80, Math.round(period * 2)), lo = Math.max(15, lag - r), hi = lag + r;
    if (start < 0 || start + len + hi >= pcm.length) return 0;
    var corr = [], best = lo;
    for (var k = lo; k <= hi; k++) {
      var a = 0, b = 0, cross = 0;
      for (var j = 0; j < len; j += 2) {
        var x = pcm[start + j], y = pcm[start + j + k];
        cross += x * y; a += x * x; b += y * y;
      }
      corr[k - lo] = cross / Math.max(1e-30, Math.sqrt(a * b));
      if (corr[k - lo] > corr[best - lo]) best = k;
    }
    var i = best - lo;
    if (best === lo || best === hi || corr[i] < 0.88) return 0;
    var den = corr[i - 1] - 2 * corr[i] + corr[i + 1];
    return best + (den < 0 ? 0.5 * (corr[i - 1] - corr[i + 1]) / den : 0);
  }

  // Compare aligned cycles at the same phase. The mean retains coherent
  // harmonics; the variance estimates noise after correcting for sample count.
  function measureEffortWindow(pcm, rate, fr, noiseFloor) {
    var period = rate / fr.f0, cycles = Math.min(12, Math.floor(0.060 * fr.f0));
    if (cycles < 6) return null;
    var start = Math.round((fr.time + 0.032) * rate - cycles * period / 2);
    if (start < 0 || start + cycles * period + 1 >= pcm.length) return null;
    // A sub-sample F0 error accumulates rapidly at the 50th harmonic.
    // Refine over several periods in the original wideband window before folding.
    var span = Math.floor(cycles / 2), expected = span * period;
    var first = Math.floor(expected * 0.99) - 1, last = Math.ceil(expected * 1.01) + 1;
    var corr = [], peak = 0, length = Math.floor(period * cycles) - last;
    for (var lag = first; lag <= last; lag++) {
      var ab = 0, aa = 0, bb = 0;
      for (var i = 0; i < length; i += 2) {
        var a = pcm[start + i], b = pcm[start + i + lag];
        ab += a * b; aa += a * a; bb += b * b;
      }
      corr.push(ab / Math.sqrt(Math.max(1e-30, aa * bb)));
      if (corr[corr.length - 1] > corr[peak]) peak = corr.length - 1;
    }
    if (!peak || peak === corr.length - 1 || corr[peak] < 0.84) return null;
    var curvature = corr[peak-1] - 2 * corr[peak] + corr[peak+1];
    var delta = curvature < 0 ? 0.5 * (corr[peak-1] - corr[peak+1]) / curvature : 0;
    period = (first + peak + clamp(delta, -0.5, 0.5)) / span;
    if (start + cycles * period + 1 >= pcm.length) return null;
    var f0 = rate / period, size = 64;
    while (size * f0 < 26000) size *= 2;
    var spectra = [], meanR = new Float64Array(size), meanI = new Float64Array(size);
    for (var c = 0; c < cycles; c++) {
      var re = new Float64Array(size), im = new Float64Array(size);
      for (var j = 0; j < size; j++) {
        var pos = start + (c + j / size) * period, lo = Math.floor(pos);
        re[j] = pcm[lo] + (pcm[lo + 1] - pcm[lo]) * (pos - lo);
      }
      NSG.fft(re, im);
      spectra.push([re, im]);
      for (var k = 0; k < size; k++) { meanR[k] += re[k] / cycles; meanI[k] += im[k] / cycles; }
    }
    var totals = [0, 0, 0], noise = [0, 0, 0], phasePower = new Float64Array(size);
    spectra.forEach(function (spec) {
      var re = spec[0], im = spec[1];
      for (var k = 0; k < size; k++) {
        var hz = Math.min(k, size - k) * f0;
        if (hz < 4000 || hz >= 12000) { re[k] = im[k] = 0; continue; }
        var b = hz < 6000 ? 0 : hz < 8000 ? 1 : 2;
        totals[b] += re[k] * re[k] + im[k] * im[k];
        re[k] -= meanR[k]; im[k] -= meanI[k];
        noise[b] += re[k] * re[k] + im[k] * im[k];
        im[k] = -im[k];
      }
      NSG.fft(re, im);
      for (var j = 0; j < size; j++) phasePower[j] += re[j] * re[j];
    });
    var floor = cycles * size * size * Math.max(1e-12, fr.rms * fr.rms * 1e-7);
    var result = totals.map(function (total, b) {
      return total > Math.max(floor, cycles * size * size * noiseFloor[b] * 4) ? clamp(noise[b] * cycles / ((cycles - 1) * total), 0, 1) : null;
    });
    var sum = 0, x = 0, y = 0;
    for (var j = 0; j < size; j++) {
      var angle = 2 * Math.PI * j / size;
      sum += phasePower[j]; x += phasePower[j] * Math.cos(angle); y += phasePower[j] * Math.sin(angle);
    }
    var depth = null;
    if (result.every(Number.isFinite) && sum > size * floor && noise.reduce(function (a, b) { return a + b; }, 0) > floor) {
      var moment = Math.hypot(x, y) / sum, error = Infinity;
      for (var d = 0; d <= 100; d++) {
        var a0 = 1 - 0.625 * d / 100, a1 = 0.5 * d / 100, a2 = 0.125 * d / 100;
        var predicted = a1 * (2 * a0 + a2) / (2 * a0 * a0 + a1 * a1 + a2 * a2);
        if (Math.abs(moment - predicted) < error) { error = Math.abs(moment - predicted); depth = d / 100; }
      }
    }
    return result.concat([depth]);
  }
  function effortNoiseFloor(pcm, rate, voiceRms) {
    var size = 1024, bands = [[], [], []];
    var hop = Math.max(size, Math.ceil(pcm.length / 200));
    for (var off = 0; off + size <= pcm.length; off += hop) {
      var sum = 0;
      for (var i = 0; i < size; i++) sum += pcm[off + i] * pcm[off + i];
      if (sum / size > voiceRms * voiceRms * 0.0016) continue;
      var re = new Float64Array(size), im = new Float64Array(size), power = [0, 0, 0];
      for (var j = 0; j < size; j++) re[j] = pcm[off + j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / size));
      NSG.fft(re, im);
      for (var k = 1; k < size / 2; k++) {
        var hz = k * rate / size;
        if (hz >= 4000 && hz < 12000) power[hz < 6000 ? 0 : hz < 8000 ? 1 : 2] += re[k] * re[k] + im[k] * im[k];
      }
      power.forEach(function (p, b) { bands[b].push(2 * p / (0.375 * size * size)); });
    }
    return bands.map(function (p) { return p.length >= 3 ? median(p) : 0; });
  }
  function fitEffortProfile(pcm, rate, frames, labels, timbre) {
    // Compare different levels only within the same vowel and approximate
    // semitone. A recording without contrasting takes keeps the stock endpoints.
    var groups = new Map(), soft = [], strong = [];
    var noiseFloor = effortNoiseFloor(pcm, rate, median(frames.map(function (f) { return f.rms; })));
    frames.forEach(function (f, i) {
      if (f.clarity < 0.85 || f.glide > 0.02) return;
      var key = labels[i] + '/' + Math.round(12 * Math.log2(f.f0 / 440));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    });
    groups.forEach(function (group) {
      var n = Math.floor(group.length / 3);
      if (n < 2) return;
      group.sort(function (a, b) { return a.rms - b.rms; });
      var low = group.slice(0, n), high = group.slice(-n);
      if (high[0].rms < low[n - 1].rms * 1.58) return;
      [low, high].forEach(function (list, i) {
        list.forEach(function (f) {
          var measured = measureEffortWindow(pcm, rate, f, noiseFloor);
          if (measured) (i ? strong : soft).push(measured);
        });
      });
    });
    var profile = NSG.defaultEffortProfile.slice(), usable = false;
    for (var b = 0; b < 4; b++) {
      var pair = [soft, strong].map(function (rows) { return rows.map(function (r) { return r[b]; }).filter(Number.isFinite); });
      if (pair[0].length < 3 || pair[1].length < 3) continue;
      pair.forEach(function (values, i) { profile[i * 4 + b] = +median(values).toFixed(3); });
      usable = true;
    }
    if (usable) timbre.effortProfile = profile;
  }

  function fitPitchTexture(pcm, train, t) {
    var jitter = [], rates = [], depths = [], previousEnd = -1;
    train.forEach(function (fr) {
      if (fr.clarity < 0.90 || fr.glide > 0.025) return;
      var start = Math.round(fr.time * SR), period = SR / fr.f0, local = [];
      for (var j = 0; j < 5; j++) local.push(localPeriod(pcm, start + j * 128, period));
      if (local.every(function (p) { return p > 0; })) {
        for (var i = 1; i < 4; i++) jitter.push(Math.abs(local[i + 1] + local[i - 1] - 2 * local[i]) / period);
      }
      if (start < previousEnd || start + 0.6 * SR > pcm.length) return;
      var cents = [], mean = 0, trend = 0, variance = 0, xx = 0;
      for (var k = 0; k < 60; k++) {
        var p = localPeriod(pcm, start + 160 * k, period);
        if (!p) return;
        var c = 1200 * Math.log2(period / p), x = k - 29.5;
        cents.push(c); mean += c / 60; trend += x * c; xx += x * x;
      }
      for (var k = 0; k < 60; k++) {
        cents[k] -= mean + trend / xx * (k - 29.5);
        variance += cents[k] * cents[k];
      }
      var bestPower = 0, bestRate = 0;
      for (var rate = 4; rate <= 8; rate += 0.25) {
        var sin = 0, cos = 0;
        for (var k = 0; k < 60; k++) {
          var phase = 2 * Math.PI * rate * k / 100;
          sin += cents[k] * Math.sin(phase); cos += cents[k] * Math.cos(phase);
        }
        var power = (sin * sin + cos * cos) / 30;
        if (power > bestPower) { bestPower = power; bestRate = rate; }
      }
      var depth = Math.sqrt(bestPower / 30);
      if (depth >= 10 && bestPower > variance * 0.78) {
        rates.push(bestRate); depths.push(depth); previousEnd = start + 0.6 * SR;
      }
    });
    if (jitter.length >= 15) t.jitter = +clamp((median(jitter) - 0.0006) * 0.65, 0, 0.01).toFixed(4);
    if (rates.length >= 2) {
      t.vib.rate = median(rates);
      t.vib.depth = +clamp(median(depths) / 100, 0, 0.8).toFixed(2);
    }
  }

  function fitConsonants(pcm, t, cal) {
    // Compare oral and nasalized versions of the same pitch and vowel. Only
    // frames distinctly closer to a nasalized vowel can set the nasal mix.
    var nasalScore = NSG.cloneTimbre(cal.score), notes = nasalScore.tracks[0].notes;
    var colors = [500, 680, 850, 1050, 1350, 1700, 2150, 2700, 3400];
    var nasalIds = [];
    notes.forEach(function (note, i) {
      var phone = note.phones[0] + '~';
      if (NSG.PHONES[phone]) { note.phones = [phone]; nasalIds.push(i); }
    });
    if (nasalIds.length >= 3) {
      // Use bands above the highest selected F0 so every column refers to the same note.
      var maxF0 = Math.max.apply(null, cal.target.map(function (f) { return f.f0; }));
      var bands = colors.filter(function (hz) { return hz >= maxF0 * 0.8; });
      var target = calibrationSpectrum(pcm, SR, cal.target, bands).bands;
      function errors(score) {
        var have = calibrationSpectrum(NSG.DSP.render(score, t).pcm, SR, cal.synth, bands).bands;
        return notes.map(function (_, i) {
          var sum = 0;
          for (var b = 0; b < bands.length; b++) sum += Math.pow(target[b][i] - have[b][i], 2);
          return Math.sqrt(sum / bands.length);
        });
      }
      var oral = errors(cal.score), base = t.nasal, low = errors(nasalScore);
      var nasalFrames = nasalIds.filter(function (i) { return low[i] + 1.5 < oral[i]; });
      if (nasalFrames.length >= 3) {
        var best = base, bestLoss = median(nasalFrames.map(function (i) { return low[i]; }));
        [0.10, 0.20, 0.30].forEach(function (value) {
          t.nasal = value;
          var err = errors(nasalScore), loss = median(nasalFrames.map(function (i) { return err[i]; }));
          if (loss + 0.10 < bestLoss) { best = value; bestLoss = loss; }
        });
        t.nasal = best;
        if (nasalFrames.length >= 5 && best >= 0.10) {
          var cutoff;
          [1400, 2800, 4500].forEach(function (hz) {
            t.nasalLowpassHz = hz;
            var err = errors(nasalScore), loss = median(nasalFrames.map(function (i) { return err[i]; }));
            if (loss + 0.15 < bestLoss) { bestLoss = loss; cutoff = hz; }
          });
          if (cutoff) t.nasalLowpassHz = cutoff; else delete t.nasalLowpassHz;
        }
      }
    }

    // Select sustained, noise-like high-frequency segments for the friction
    // path. Two independent half-windows must agree to exclude clicks and stops.
    var level = 0;
    cal.target.forEach(function (f) {
      var offset = Math.round(f.center * SR) - 256;
      for (var j = 0; j < 512; j++) level += pcm[offset + j] * pcm[offset + j];
    });
    level /= cal.target.length * 512;
    var windows = [], hop = Math.max(512, Math.floor(pcm.length / 500));
    for (var off = 0; off + 1024 <= pcm.length; off += hop) {
      var valid = true;
      for (var half = 0; half < 2; half++) {
        var sum = 0, crossings = 0, peakLag = 0;
        var start = off + half * 512;
        for (var j = 1; j < 512; j++) {
          var x = pcm[start + j];
          sum += x * x;
          if ((x > 0) !== (pcm[start + j - 1] > 0)) crossings++;
        }
        if (crossings < 110 || sum < 512 * level * 0.01) { valid = false; break; }
        for (var lag = 25; lag <= 230; lag += 3) {
          var cross = 0, a = 0, b = 0;
          for (var j = 0; j < 256; j += 2) {
            var x = pcm[start + j], y = pcm[start + j + lag];
            cross += x * y; a += x * x; b += y * y;
          }
          peakLag = Math.max(peakLag, cross / Math.max(1e-30, Math.sqrt(a * b)));
        }
        if (peakLag > 0.55) { valid = false; break; }
      }
      if (valid) windows.push({ center: (off + 512) / SR, f0: 120 });
    }
    if (windows.length < 3) return;
    var centers = [1500, 2200, 3000, 3900, 4900, 6000, 7200];
    var observed = calibrationSpectrum(pcm, SR, windows, centers).bands;
    var fricatives = ['s', 'sr', 'xc', 'f'];
    var reference = calibration(fricatives.map(function () { return { f0: 160, time: 0 }; }), fricatives);
    var bestSoft = 0, bestError = Infinity;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (softness) {
      t.consonantSoftness = softness;
      var ref = calibrationSpectrum(NSG.DSP.render(reference.score, t).pcm, SR, reference.synth, centers).bands;
      var errors = windows.map(function (_, i) {
        var closest = Infinity;
        for (var ph = 0; ph < fricatives.length; ph++) {
          var sum = 0;
          for (var b = 0; b < centers.length; b++) sum += Math.pow(observed[b][i] - ref[b][ph], 2);
          closest = Math.min(closest, Math.sqrt(sum / centers.length));
        }
        return closest;
      });
      var loss = median(errors) + 0.20 * softness;
      if (loss < bestError) { bestError = loss; bestSoft = softness; }
    });
    t.consonantSoftness = bestSoft;
  }

  function calibrateEq(t, cal, pcm, rate, hd) {
    var count = hd ? 64 : NSG.OUT_EQ.n, field = hd ? 'modeBOutEq' : 'outEq';
    var centers = Array.from({ length: count }, function (_, i) {
      return hd ? 50 * Math.pow(400, i / 63) : NSG.outEqHz(i);
    });
    var target = calibrationSpectrum(pcm, rate, cal.target, centers);
    function measure() {
      var result = NSG.DSP.render(cal.score, t, { hd: hd });
      return calibrationSpectrum(result.pcm, result.sr, cal.synth, centers);
    }
    if (!hd && target.noise !== null) {
      // Endpoints allow clean periodic recordings to select zero aspiration.
      var bestNoise = Infinity, bestBreath = t.breath;
      function tryBreath(breath) {
        t.breath = breath;
        var noise = measure().noise;
        if (noise === null) return;
        var err = Math.abs(noise - target.noise);
        if (err < bestNoise) { bestNoise = err; bestBreath = breath; }
      }
      var breaths = [0, 0.005, 0.016, 0.045, 0.12, 0.26];
      breaths.forEach(tryBreath);
      var bi = breaths.indexOf(bestBreath);
      if (bi > 0) tryBreath(+(0.5 * (breaths[bi - 1] + breaths[bi])).toFixed(3));
      if (bi >= 0 && bi + 1 < breaths.length) tryBreath(+(0.5 * (breaths[bi] + breaths[bi + 1])).toFixed(3));
      t.breath = bestBreath;
    }
    var eq = centers.map(function (hz) { return hd ? NSG.outEqDbAt(t.outEq, hz) : 0; });
    if (hd) {
      t[field] = eq;
      var reference = measure();
      var upperLevels = [];
      centers.forEach(function (hz, i) {
        if (hz < 7500 || hz > Math.min(rate * 0.45, 18000) || !target.bands[i].length) return;
        upperLevels.push(median(target.bands[i]) - median(reference.bands[i]));
      });
      // Use the voiced extension for broad level differences, leaving the
      // frequency-dependent remainder for EQ. Keep a periodic core for dull recordings.
      if (upperLevels.length >= 3) t.modeBHigh = +clamp(0.4 * Math.pow(10, median(upperLevels) / 20), 0.035, 1).toFixed(3);
    }
    var best = eq.slice(), bestError = Infinity, first;
    for (var pass = 0; pass < 4; pass++) {
      t[field] = eq;
      var have = measure(), total = 0, used = 0;
      var residual = centers.map(function (hz, i) {
        var a = target.bands[i], b = have.bands[i];
        if (a.length < 2 || a.length !== b.length) return null;
        var diffs = a.map(function (v, j) { return v - b[j]; });
        // A clipped mean estimates the shared colour while limiting individual
        // vowel-label errors. Broad corrections should transfer to other vowels.
        var middle = median(diffs), sum = 0;
        for (var j = 0; j < diffs.length; j++) sum += clamp(diffs[j] - middle, -9, 9);
        var d = middle + sum / diffs.length;
        total += d * d; used++;
        return d;
      });
      var error = Math.sqrt(total / Math.max(1, used));
      if (!pass) first = error;
      if (error >= bestError) break;
      bestError = error; best = eq.slice();
      // Unsupported sub-F0 bands inherit the nearest observed correction.
      var firstValid = residual.findIndex(function (v) { return v !== null; });
      if (firstValid < 0) break;
      for (var i = 0; i < count; i++) if (residual[i] === null) residual[i] = i ? residual[i - 1] : residual[firstValid];
      var smooth = boxSmooth(residual, 1);
      eq = eq.map(function (v, i) {
        return +clamp(v + clamp(smooth[i] * 0.75, -12, 12), -40, 24).toFixed(2);
      });
      for (var k = 1; k < count; k++) eq[k] = +clamp(eq[k], eq[k - 1] - 6, eq[k - 1] + 6).toFixed(2);
    }
    t[field] = best;
    return { before: +first.toFixed(2), after: +bestError.toFixed(2), noise: target.noise };
  }

  A.extractTimbre = function (pcm, sr, opts) {
    if (sr && sr !== SR) throw new Error('请先将音频重采样到 16000Hz');
    if (!pcm || pcm.length < SR * 0.5) throw new Error('请提供至少半秒的清晰人声');
    for (var i = 0; i < pcm.length; i++) if (!isFinite(pcm[i])) throw new Error('音频含无效采样');
    if (opts && !opts.skipOutput && opts.widePcm) {
      if (!Number.isFinite(opts.wideRate) || opts.wideRate < 32000 ||
          Math.abs(opts.widePcm.length / opts.wideRate - pcm.length / SR) >= 0.005)
        throw new Error('宽带录音与 16000Hz 分析音频不匹配');
      for (var w = 0; w < opts.widePcm.length; w++)
        if (!Number.isFinite(opts.widePcm[w])) throw new Error('音频含无效采样');
    }
    var frames = voiceFrames(pcm);
    if (frames.length < 8) throw new Error('稳定浊音不足，请使用清晰独唱或朗读，避免伴奏和耳语');
    var train = frames.filter(function (_, i) { return i % 3 !== 1; });
    var held = frames.filter(function (_, i) { return i % 3 === 1; });
    var t = NSG.defaultTimbre(); t.height = 170; t.breath = 0.02; t.nasal = 0.04;
    t.vib = { rate: 5.2, depth: 0, delay: 0.28 };
    var baseline = matchFrames(held, t).error;

    // 阶段 A：去斜率声道尺寸与高阶共振峰搜索（结合高阶共振峰簇 F3/F4 先验，解耦音高力度与声道长短）
    var medF0 = median(frames.map(function (f) { return f.f0; }));
    var scalePrior = tractScalePrior(train);
    var priorWeight = 2.8;
    var bestDetilt = Infinity;
    [0.84, 0.91, 0.98, 1.05, 1.12, 1.19, 1.26].forEach(function (scale) {
      [-0.08, 0, 0.08].forEach(function (warp) {
        var c = NSG.cloneTimbre(t); c.fScale = scale; c.warp = warp;
        var m = matchFramesDetilted(train, c);
        var loss = m.error + priorWeight * Math.pow((scale - scalePrior) / 0.12, 2);
        if (loss < bestDetilt) {
          bestDetilt = loss;
          t.fScale = scale; t.warp = warp;
          t.tiltDb = +clamp(median(m.slopes), -8, 8).toFixed(2);
        }
      });
    });

    t.fRatio = [1, 1, 1];
    var baseTractSpecs = [
      ['fScale', 0.04, 0.78, 1.35],
      ['warp', 0.05, -0.18, 0.18],
      ['hiShift', 0.05, 0.92, 1.15],
      ['h0', 140, 3100, 3750],
      ['h1', 160, 3950, 4750],
      ['h2', 180, 4950, 5900]
    ];
    for (var passA = 0; passA < 4; passA++) {
      var labelsA = matchFramesDetilted(train, t).labels;
      baseTractSpecs.forEach(function (s) {
        var key = s[0], isHi = /^h[0-2]$/.test(key), idx = +key[key.length - 1];
        var old = isHi ? t.higher[idx] : t[key];
        var win = old;
        var curScore = matchFramesDetilted(train, t, labelsA).error + priorWeight * Math.pow((t.fScale - scalePrior) / 0.12, 2);
        [-1, 1].forEach(function (dir) {
          var value = clamp(old + dir * s[1] * Math.pow(0.65, passA), s[2], s[3]);
          if (isHi) t.higher[idx] = Math.round(value);
          else t[key] = +value.toFixed(4);
          var e = matchFramesDetilted(train, t, labelsA).error + priorWeight * Math.pow((t.fScale - scalePrior) / 0.12, 2);
          if (e < curScore) { curScore = e; win = isHi ? Math.round(value) : +value.toFixed(4); }
        });
        if (isHi) t.higher[idx] = win; else t[key] = win;
      });
    }

    // 约束几何均值为 1 的正交共振峰比例修正（fRatio），微调咽腔/口腔比例而不偏移整体声道缩放
    for (var passFr = 0; passFr < 3; passFr++) {
      var labelsFr = matchFramesDetilted(train, t).labels;
      for (var fi = 0; fi < 3; fi++) {
        var oldFr = t.fRatio.slice(), curSc = matchFramesDetilted(train, t, labelsFr).error;
        var bestFr = oldFr.slice();
        [-1, 1].forEach(function (dir) {
          var cand = oldFr.slice();
          cand[fi] = clamp(cand[fi] + dir * 0.04 * Math.pow(0.65, passFr), 0.88, 1.14);
          var geo = Math.pow(cand[0] * cand[1] * cand[2], 1 / 3);
          t.fRatio = cand.map(function (v) { return +clamp(v / geo, 0.88, 1.14).toFixed(3); });
          var e = matchFramesDetilted(train, t, labelsFr).error;
          if (e < curSc) { curSc = e; bestFr = t.fRatio.slice(); }
        });
        t.fRatio = bestFr;
      }
    }

    // 阶段 B：基于共振峰峰谷突出度的带宽与独立带宽比拟合
    var labelsB = matchFramesDetilted(train, t).labels;
    fitBandwidthByProminence(train, t, labelsB);

    // 阶段 C：反卷积声门谐波包络（harm[0..15]）、谱倾斜与音高斜率耦合（pitchTilt）
    fitGlottalSource(train, t, labelsB);

    // 阶段 D：声源-声道全参数联合精修
    var anchorScale = t.fScale, anchorBw = t.bwScale;
    t.harmTailDb = NSG.TAIL_DB_OCT;
    var tailFrames = train.filter(function (f) { return f.weight.slice(20).some(function (w) { return w >= 0.65; }); });
    var fullSpecs = [
      ['fScale', 0.02, clamp(anchorScale - 0.05, 0.78, 1.35), clamp(anchorScale + 0.05, 0.78, 1.35)],
      ['warp', 0.025, -0.18, 0.18],
      ['tiltDb', 1.0, -8, 8],
      ['glottal', 0.25, 0, 1],
      ['bwScale', 0.10, clamp(anchorBw * 0.82, 0.65, 1.55), clamp(anchorBw * 1.18, 0.72, 1.65)],
      ['hiShift', 0.03, 0.92, 1.15]
    ];
    if (tailFrames.length >= 5) fullSpecs.push(['harmTailDb', 5, -30, 0]);
    for (var passD = 0; passD < 3; passD++) {
      var labelsD = matchFrames(train, t).labels;
      fullSpecs.forEach(function (s) {
        var key = s[0], old = t[key], win = old;
        var score = matchFrames(train, t, labelsD).error;
        [-1, 1].forEach(function (dir) {
          var value = +clamp(old + dir * s[1] * Math.pow(0.65, passD), s[2], s[3]).toFixed(4);
          t[key] = value;
          var e = matchFrames(train, t, labelsD).error;
          if (e < score) { score = e; win = value; }
        });
        t[key] = win;
      });
    }
    // Once the source has been separated, refine vowel contrasts and formant ratios
    // against the harmonic envelope. Sparse vowel inventories keep neutral contrasts.
    var jointLabels = matchFrames(train, t).labels;
    var rounded = jointLabels.filter(function (id) { return NSG.PHONES[id].lip >= 0.15; }).length;
    if (rounded >= 4 && jointLabels.length - rounded >= 4) {
      // Preserve the unrounded vowel scale while testing relative lip protrusion.
      var neutralScale = t.fScale, bestLip = 0, lipLoss = matchFrames(train, t, jointLabels).error;
      [0.04, 0.08, 0.14, 0.22, 0.30].forEach(function (lip) {
        if (neutralScale * (1 + lip) > 1.35) return;
        t.lip = lip; t.fScale = neutralScale * (1 + lip);
        var loss = matchFrames(train, t, jointLabels).error + 1.5 * lip * lip;
        if (loss + 0.04 < lipLoss) { bestLip = lip; lipLoss = loss; }
      });
      t.lip = bestLip; t.fScale = +(neutralScale * (1 + bestLip)).toFixed(4);
    }
    var variety = new Set(jointLabels).size;
    var specs = [[t.fRatio, 0, 0.035, 0.86, 1.16], [t.fRatio, 1, 0.035, 0.86, 1.16],
      [t.fRatio, 2, 0.025, 0.86, 1.16]];
    if (variety >= 3 && train.length >= 12) {
      t.vowelSpace = [1, 1];
      specs.push([t.vowelSpace, 0, 0.10, 0.60, 1.25], [t.vowelSpace, 1, 0.10, 0.60, 1.25]);
    }
    for (var joint = 0; joint < 3; joint++) {
      var fixedLabels = matchFrames(train, t).labels;
      specs.forEach(function (spec) {
        var axis = spec[0], idx = spec[1], origin = axis[idx], winner = origin;
        function loss() {
          return matchFrames(train, t, fixedLabels).error + 3 * Math.pow(axis[idx] - 1, 2);
        }
        var lowest = loss();
        [-1, 1].forEach(function (dir) {
          axis[idx] = +clamp(origin + dir * spec[2] * Math.pow(0.72, joint), spec[3], spec[4]).toFixed(3);
          var candidate = loss();
          if (candidate < lowest) { lowest = candidate; winner = axis[idx]; }
        });
        axis[idx] = winner;
      });
    }
    var fitted = matchFrames(train, t);
    fitGlottalSource(train, t, fitted.labels);
    fitted = matchFrames(train, t);

    // 阶段 E：声源频谱残差（sourceEq）与歌唱校准合成对比（outEq）联合收敛
    t.sourceEq = computeSourceEq(train, t, fitted.labels, 0.70);
    fitPitchTexture(pcm, train, t);
    var clarity = median(train.map(function (f) { return f.clarity; }));
    t.breath = +clamp((1 - clarity) * 0.3, 0.005, 0.075).toFixed(3);
    t.src = '多帧声源声道拟合 v2';
    var cal, abs, wide;
    if (!(opts && opts.skipOutput)) {
      cal = calibration(train, matchFrames(train, t).labels);
      abs = calibrateEq(t, cal, pcm, SR, false);
      fitConsonants(pcm, t, cal);
      if (opts && opts.widePcm) {
        fitEffortProfile(opts.widePcm, opts.wideRate, train, fitted.labels, t);
        wide = calibrateEq(t, cal, opts.widePcm, opts.wideRate, true);
      }
    }
    var after = matchFrames(held, t), phones = {};
    fitted.labels.forEach(function (p) { phones[p] = (phones[p] || 0) + 1; });
    t.extraction = { version: abs ? 4 : 2, frames: frames.length, medianF0: +medF0.toFixed(1),
      baselineDb: +Math.sqrt(baseline).toFixed(2), fittedDb: +Math.sqrt(after.error).toFixed(2),
      vowelClasses: Object.keys(phones).length, duration: +(pcm.length / SR).toFixed(2) };
    if (abs) {
      t.src = '多帧拟合 + 同音高重合成 v4';
      t.extraction.spectrumDb0 = abs.before; t.extraction.spectrumDb = abs.after;
      t.extraction.noiseDb = abs.noise === null ? null : +abs.noise.toFixed(1);
    }
    if (wide) { t.extraction.modeBDb0 = wide.before; t.extraction.modeBDb = wide.after; }
    return { timbre: t, diagnostics: t.extraction, frames: frames, labels: matchFrames(frames, t).labels };
  };
  A.extractFormants = function (pcm, sr, opts) {
    var r = A.extractTimbre(pcm, sr, opts), t = r.timbre, fm = NSG.formantsOf(NSG.PHONES.a, t);
    return { timbre: t, diagnostics: r.diagnostics, height: t.height, bwScale: t.bwScale,
      formants: fm.pairs.map(function (p) { return Math.round(p[0]); }),
      bandwidths: fm.pairs.map(function (p) { return Math.round(p[1]); }), frames: r.diagnostics.frames };
  };
  A.timbreFitError = function (frames, timbre) {
    return Math.sqrt(matchFrames(frames, timbre).error);
  };

  /* ---------- 5. 音高追踪 ---------- */
  A.pitchTrack = function (pcm, sr) {
    sr = sr || SR;
    var N = Math.round(sr * 0.036), hop = Math.round(sr * 0.010);
    var out = [];
    var minLag = Math.floor(sr / 520), maxLag = Math.floor(sr / 70);
    for (var off = 0; off + N + maxLag < pcm.length; off += hop) {
      var e0 = 0;
      for (var s = 0; s < N; s++) e0 += pcm[off + s] * pcm[off + s];
      if (Math.sqrt(e0 / N) < 0.012) { out.push({ t: off / sr, f0: 0, amp: 0 }); continue; }
      var best = 0, bestLag = 0;
      var e1Even = 0, e1Odd = 0;
      var startEven = minLag, startOdd = minLag + 1;
      for (var me = 0; me < N; me += 2) {
        var ve = pcm[off + me + startEven]; e1Even += ve * ve;
        if (startOdd <= maxLag) { var vo = pcm[off + me + startOdd]; e1Odd += vo * vo; }
      }
      for (var lag = minLag; lag <= maxLag; lag++) {
        var isOdd = (lag - minLag) & 1;
        var e1 = isOdd ? e1Odd : e1Even;
        var acc = 0, baseIdx = off + lag;
        for (var m = 0; m < N; m += 2) acc += pcm[off + m] * pcm[baseIdx + m];
        if (acc > 0) {
          var nc = acc / Math.sqrt(e0 * Math.max(0, e1) + 1e-12);
          if (nc > best) { best = nc; bestLag = lag; }
        }
        if (lag + 2 <= maxLag) {
          var xOld = pcm[off + lag], xNew = pcm[off + lag + N];
          if (isOdd) e1Odd += xNew * xNew - xOld * xOld;
          else e1Even += xNew * xNew - xOld * xOld;
        }
      }
      var f0 = 0;
      if (best > 0.42 && bestLag > 0) {
        var y0 = 0, y1 = 0, y2 = 0;
        for (var L2 = bestLag - 1; L2 <= bestLag + 1; L2++) {
          var acc2 = 0, e2 = 0;
          for (var m2 = 0; m2 < N; m2 += 2) { acc2 += pcm[off + m2] * pcm[off + m2 + L2]; e2 += pcm[off + m2 + L2] * pcm[off + m2 + L2]; }
          var v2 = acc2 / Math.sqrt(e0 * e2 + 1e-12);
          if (L2 === bestLag - 1) y0 = v2; else if (L2 === bestLag) y1 = v2; else y2 = v2;
        }
        var den = (y0 - 2 * y1 + y2);
        var delta = den !== 0 ? 0.5 * (y0 - y2) / den : 0;
        f0 = sr / (bestLag + delta);
      }
      out.push({ t: off / sr, f0: f0, amp: Math.sqrt(e0 / N), clarity: best });
    }
    return out;
  };

  NSG.AN = A;
})(typeof window !== 'undefined' ? window : global);
