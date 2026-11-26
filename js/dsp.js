/* ==========================================================================
   NSG · 发声引擎（普通 16000Hz / 模式B 48000Hz 单声道）
   信号流：
     声带音（16 阶参数表向上续接：普通最多 64 阶 / 模式B最多 512 阶，各阶固定随机相位）
        ├─ 口腔：F1..F6 六级共振腔级联
        ├─ 鼻腔：极点/零点支路，与口腔并联混合
        ├─ 模式B：有声高频延伸与随气声量变化的上部气流，约20kHz收敛
        └─ 清擦音：并行噪声通道（带通 − 宽带）最后叠加
   全部参数实时计算，不读取任何外部音频。
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['dsp'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  if (!NSG.Instruments && typeof require === 'function') require('./instruments.js');
  // Each quality owns its filters/caches/constants; never switch shared global rates.
  function createEngine(NSG, SR, modeB) {
  var HD = SR === 48000;
  modeB = HD && modeB === true;
  var studioMode = false;
  var HOP = HD ? 96 : 32;         // 控制帧始终为 2ms
  var SOURCE_TOP = HD ? 20000 : 7600, SOURCE_FADE = HD ? 1000 : 400;
  var NHARM = 16;                 // 倍频振幅阶数
  var harmonicOctaves = new Float64Array(513);
  for (var harmonic = 1; harmonic <= 512; harmonic++) harmonicOctaves[harmonic] = Math.log(harmonic) / Math.LN2;
  NSG.SR = SR;
  NSG.HOP = HOP;
  NSG.NHARM = NHARM;

  /* ---------- 工具 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  NSG.mulberry32 = mulberry32;

  function fft(re, im) {
    if (NSG.WASM && NSG.WASM.fft(re, im)) return;
    var n = re.length, i, j, k, m, h, t, wr, wi, ur, ui, vr, vi;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (m = 2; m <= n; m <<= 1) {
      var ang = -2 * Math.PI / m, wmr = Math.cos(ang), wmi = Math.sin(ang);
      for (k = 0; k < n; k += m) {
        wr = 1; wi = 0;
        for (h = 0; h < m >> 1; h++) {
          ur = re[k + h]; ui = im[k + h];
          vr = re[k + h + (m >> 1)] * wr - im[k + h + (m >> 1)] * wi;
          vi = re[k + h + (m >> 1)] * wi + im[k + h + (m >> 1)] * wr;
          re[k + h] = ur + vr; im[k + h] = ui + vi;
          re[k + h + (m >> 1)] = ur - vr; im[k + h + (m >> 1)] = ui - vi;
          var nwr = wr * wmr - wi * wmi; wi = wr * wmi + wi * wmr; wr = nwr;
        }
      }
    }
  }
  NSG.fft = fft;

  /* 正弦查表（2048 点，线性插值），避免逐样本调用 Math.sin */
  var SIN = new Float32Array(2049);
  for (var si = 0; si <= 2048; si++) SIN[si] = Math.sin(2 * Math.PI * si / 2048);
  function sinT(p) {
    var x = p * 2048;
    var i0 = x | 0;
    var fr = x - i0;
    return SIN[i0 & 2047] * (1 - fr) + SIN[(i0 + 1) & 2047] * fr;
  }

  /* ---------- 二阶共振器（Klatt 形式，直流增益归一到 1） ---------- */
  // Match the reference-rate tract colour below 6 kHz without moving its poles.
  // A symmetric three-tap numerator corrects matched-pole rate coloration. Its
  // response is 1 + g * (1-cos(w)); unlike an output shelf it follows EACH
  // formant's frequency/bandwidth, and also applies to tract-shaped aspiration.
  var W5500_16 = 2 * Math.PI * 5500 / 16000, C1_16 = Math.cos(W5500_16), S1_16 = Math.sin(W5500_16);
  var C2_16 = Math.cos(2 * W5500_16), S2_16 = Math.sin(2 * W5500_16);
  var W5500_SR = 2 * Math.PI * 5500 / SR, C1_SR = Math.cos(W5500_SR), S1_SR = Math.sin(W5500_SR);
  var C2_SR = Math.cos(2 * W5500_SR), S2_SR = Math.sin(2 * W5500_SR), ONE_MINUS_C1_SR = 1 - C1_SR;
  function rateCorrection(f, bw) {
    if (!modeB || !(f > 20 && f < 7600)) return 0;
    var r1 = Math.exp(-Math.PI * bw / 16000), b1 = 2 * r1 * Math.cos(2 * Math.PI * f / 16000), c1 = -r1 * r1;
    var d1r = 1 - b1 * C1_16 - c1 * C2_16, d1i = b1 * S1_16 + c1 * S2_16;
    var m1 = (1 - b1 - c1) / Math.sqrt(d1r * d1r + d1i * d1i);
    var r2 = Math.exp(-Math.PI * bw / SR), b2 = 2 * r2 * Math.cos(2 * Math.PI * f / SR), c2 = -r2 * r2;
    var d2r = 1 - b2 * C1_SR - c2 * C2_SR, d2i = b2 * S1_SR + c2 * S2_SR;
    var m2 = (1 - b2 - c2) / Math.sqrt(d2r * d2r + d2i * d2i);
    return Math.max(0, Math.min(8, (m1 / m2 - 1) / ONE_MINUS_C1_SR));
  }
  function Resonator(calibrated) {
    this.a = 1; this.b = 0; this.c = 0; this.y1 = 0; this.y2 = 0;
    this.da = 0; this.db = 0; this.dc = 0;
    this.calibrated = modeB && calibrated === true;
    this.g = 0; this.dg = 0;
    this.cosW = 1; this.dCosW = 0;
    this.cosWOpen = 1; this.dCosWOpen = 0;
    this.rClosed = 0; this.drClosed = 0;
    this.rOpen = 0; this.drOpen = 0;
  }
  Resonator.prototype.set = function (f, bw, snap) {
    if (!(bw > 0)) bw = 30;
    var valid = f > 0 && f < SR * 0.5;
    var r = valid ? Math.exp(-Math.PI * bw / SR) : 0;
    var B = valid ? 2 * r * Math.cos(2 * Math.PI * f / SR) : 0;
    var C = -r * r, A = 1 - B - C;
    if (this.calibrated) {
      var g = valid ? rateCorrection(f, bw) : 0;
      if (snap) { this.g = g; this.dg = 0; }
      else this.dg = (g - this.g) / HOP;
    }
    // 每个控制帧调用一次、run 恰好 HOP 次；系数在帧内连续移动。
    // 首帧直接就位：从直通 (1,0,0) 插值过去时直流增益在 2ms 内由 1 降到 ~0.003，
    // 开头几个样本被放大数百倍，形成起播爆音。
    if (snap) { this.a = A; this.b = B; this.c = C; this.da = this.db = this.dc = 0; return; }
    this.da = (A - this.a) / HOP; this.db = (B - this.b) / HOP; this.dc = (C - this.c) / HOP;
  };
  Resonator.prototype.setDamped = function (f, bw, dampAmt, snap, fShiftRatio, dampScale) {
    if (!(bw > 0)) bw = 30;
    var valid = f > 0 && f < SR * 0.5;
    var ds = dampAmt * (dampScale === undefined ? 1 : dampScale);
    var cw = valid ? Math.cos(2 * Math.PI * f / SR) : 1;
    var cwOpen = (valid && fShiftRatio) ? Math.cos(2 * Math.PI * Math.min(SR * 0.46, f * (1 + fShiftRatio)) / SR) : cw;
    var bwC = Math.max(30, bw * (1 - 0.14 * ds));
    var bwO = Math.min(SR * 0.28, bw * (1 + 0.65 * ds));
    var rC = valid ? Math.min(0.998, Math.exp(-Math.PI * bwC / SR)) : 0;
    var rO = valid ? Math.min(0.998, Math.exp(-Math.PI * bwO / SR)) : 0;
    if (this.calibrated) {
      var g = valid ? rateCorrection(f, bw) : 0;
      if (snap) { this.g = g; this.dg = 0; }
      else this.dg = (g - this.g) / HOP;
    }
    if (snap) {
      this.cosW = cw; this.dCosW = 0;
      this.cosWOpen = cwOpen; this.dCosWOpen = 0;
      this.rClosed = rC; this.drClosed = 0;
      this.rOpen = rO; this.drOpen = 0;
      return;
    }
    this.dCosW = (cw - this.cosW) / HOP;
    this.dCosWOpen = (cwOpen - this.cosWOpen) / HOP;
    this.drClosed = (rC - this.rClosed) / HOP;
    this.drOpen = (rO - this.rOpen) / HOP;
  };
  Resonator.prototype.run = function (x) {
    this.a += this.da; this.b += this.db; this.c += this.dc;
    var y = this.a * x + this.b * this.y1 + this.c * this.y2;
    var out = y;
    if (this.calibrated) {
      this.g += this.dg;
      out = (1 + this.g) * this.y1 - 0.5 * this.g * (y + this.y2);
    }
    this.y2 = this.y1; this.y1 = y; return out;
  };
  Resonator.prototype.runDamped = function (x, openGate) {
    this.cosW += this.dCosW; this.cosWOpen += this.dCosWOpen;
    this.rClosed += this.drClosed; this.rOpen += this.drOpen;
    var r = this.rClosed + (this.rOpen - this.rClosed) * openGate;
    var cw = this.cosW + (this.cosWOpen - this.cosW) * openGate;
    var B = 2 * r * cw, C = -r * r, A = 1 - B - C;
    var y = A * x + B * this.y1 + C * this.y2;
    var out = y;
    if (this.calibrated) {
      this.g += this.dg;
      out = (1 + this.g) * this.y1 - 0.5 * this.g * (y + this.y2);
    }
    this.y2 = this.y1; this.y1 = y; return out;
  };

  /* ---------- 动态峰值/陷波滤波器（声门下反共振与咽腔微凹陷） ---------- */
  function DynamicNotch() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.db0 = 0; this.db1 = 0; this.db2 = 0; this.da1 = 0; this.da2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  DynamicNotch.prototype.set = function (hz, q, db, snap) {
    var b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    if (hz > 40 && hz < SR * 0.48 && Math.abs(db) > 0.01) {
      var A = Math.pow(10, db / 40), w0 = 2 * Math.PI * hz / SR;
      var alpha = Math.sin(w0) / (2 * Math.max(0.5, q)), c = -2 * Math.cos(w0);
      var a0 = 1 + alpha / A;
      b0 = (1 + alpha * A) / a0; b1 = c / a0; b2 = (1 - alpha * A) / a0;
      a1 = c / a0; a2 = (1 - alpha / A) / a0;
    }
    if (snap) {
      this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
      this.db0 = this.db1 = this.db2 = this.da1 = this.da2 = 0;
      return;
    }
    this.db0 = (b0 - this.b0) / HOP; this.db1 = (b1 - this.b1) / HOP; this.db2 = (b2 - this.b2) / HOP;
    this.da1 = (a1 - this.a1) / HOP; this.da2 = (a2 - this.a2) / HOP;
  };
  DynamicNotch.prototype.run = function (x) {
    this.b0 += this.db0; this.b1 += this.db1; this.b2 += this.db2;
    this.a1 += this.da1; this.a2 += this.da2;
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  };

  function hpcCoeffs(f6, sr) {
    var fc = Math.max(2500, Math.min(3450, 2850 * ((f6 || 5200) / 5200)));
    var A = Math.pow(10, 12.5 / 40), w0 = 2 * Math.PI * fc / sr;
    var cw0 = Math.cos(w0), sw0 = Math.sin(w0), alpha = sw0 / (2 * 0.56);
    var tsa = 2 * Math.sqrt(A) * alpha;
    var a0 = (A + 1) - (A - 1) * cw0 + tsa;
    return [
      (A * ((A + 1) + (A - 1) * cw0 + tsa)) / a0,
      (-2 * A * ((A - 1) + (A + 1) * cw0)) / a0,
      (A * ((A + 1) + (A - 1) * cw0 - tsa)) / a0,
      (2 * ((A - 1) - (A + 1) * cw0)) / a0,
      ((A + 1) - (A - 1) * cw0 - tsa) / a0
    ];
  }

  /* ---------- 二阶级联全通相位色散滤波器（幅频恒等于 1，消除声门闭合脉冲蜂鸣感） ---------- */
  function makeAllPassSection(fc, q, sr) {
    var w0 = 2 * Math.PI * fc / sr;
    var alpha = Math.sin(w0) / (2 * q);
    var a0 = 1 + alpha;
    return [-2 * Math.cos(w0) / a0, (1 - alpha) / a0];
  }
  function AllPassDispersion(sr) {
    var c1 = makeAllPassSection(880, 0.72, sr);
    var c2 = makeAllPassSection(2550, 0.85, sr);
    this.a11 = c1[0]; this.a12 = c1[1];
    this.a21 = c2[0]; this.a22 = c2[1];
    this.x11 = 0; this.x12 = 0; this.y11 = 0; this.y12 = 0;
    this.x21 = 0; this.x22 = 0; this.y21 = 0; this.y22 = 0;
  }
  AllPassDispersion.prototype.run = function (x) {
    var u = this.a12 * x + this.a11 * this.x11 + this.x12 - this.a11 * this.y11 - this.a12 * this.y12;
    this.x12 = this.x11; this.x11 = x;
    this.y12 = this.y11; this.y11 = u;
    var v = this.a22 * u + this.a21 * this.x21 + this.x22 - this.a21 * this.y21 - this.a22 * this.y22;
    this.x22 = this.x21; this.x21 = u;
    this.y22 = this.y21; this.y21 = v;
    return v;
  };
  function DynamicShelf() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.db0 = 0; this.db1 = 0; this.db2 = 0; this.da1 = 0; this.da2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  DynamicShelf.prototype.set = function (f6, snap) {
    var c = hpcCoeffs(f6, SR);
    if (snap) {
      this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4];
      this.db0 = this.db1 = this.db2 = this.da1 = this.da2 = 0;
      return;
    }
    this.db0 = (c[0] - this.b0) / HOP; this.db1 = (c[1] - this.b1) / HOP; this.db2 = (c[2] - this.b2) / HOP;
    this.da1 = (c[3] - this.a1) / HOP; this.da2 = (c[4] - this.a2) / HOP;
  };
  DynamicShelf.prototype.run = function (x) {
    this.b0 += this.db0; this.b1 += this.db1; this.b2 += this.db2;
    this.a1 += this.da1; this.a2 += this.da2;
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  };

  /* ---------- 鼻腔支路：一个极点 + 一个零点 ---------- */
  function NasalBranch() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.db1 = 0; this.db2 = 0; this.da1 = 0; this.da2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  NasalBranch.prototype.set = function (fPole, bwPole, fZero, bwZero, snap) {
    var rp = Math.exp(-Math.PI * bwPole / SR), rz = Math.exp(-Math.PI * bwZero / SR);
    if (snap) {
      this.a1 = 2 * rp * Math.cos(2 * Math.PI * fPole / SR); this.a2 = -rp * rp;
      this.b1 = -2 * rz * Math.cos(2 * Math.PI * fZero / SR); this.b2 = rz * rz;
      this.da1 = this.da2 = this.db1 = this.db2 = 0; return;
    }
    this.da1 = (2 * rp * Math.cos(2 * Math.PI * fPole / SR) - this.a1) / HOP;
    this.da2 = (-rp * rp - this.a2) / HOP;
    this.db1 = (-2 * rz * Math.cos(2 * Math.PI * fZero / SR) - this.b1) / HOP;
    this.db2 = (rz * rz - this.b2) / HOP;
  };
  NasalBranch.prototype.run = function (x) {
    this.a1 += this.da1; this.a2 += this.da2; this.b1 += this.db1; this.b2 += this.db2;
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 + this.a1 * this.y1 + this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  };

  /* ---------- HiFi 多峰鼻腔旁路：N1(+鼻窦谷) + N2 + N3 并联鼻腔共振 ---------- */
  // Models the parallel nasal passage + paranasal sinus side-branch as N1 with a
  // maxillary sinus dip combined with parallel N2 (~1060 Hz) and N3 (~2260 Hz)
  // nasal resonances (unity DC, scaled by speaker vocal-tract size).
  function HiFiNasalBranch() {
    this.n1 = new Resonator();
    this.z1 = new AntiResonator();
    this.n2 = new Resonator();
    this.n3 = new Resonator();
  }
  HiFiNasalBranch.prototype.set = function (scale, bwScale, f1Hz, snap) {
    var s = Math.max(0.7, Math.min(1.5, scale || 1));
    var bw = Math.max(0.7, Math.min(1.5, bwScale || 1));
    var lim = SR * 0.45;
    var n1 = Math.min(lim, 275 * s + 0.04 * (f1Hz - 500));
    var z1 = Math.min(lim, Math.max(n1 + 120, 520 * s));
    var n2 = Math.min(lim, Math.max(z1 + 180, 1040 * s));
    var n3 = Math.min(lim, Math.max(n2 + 300, 2150 * Math.pow(s, 0.7)));
    this.n1.set(n1, 85 * bw, snap);
    this.z1.set(z1, 150 * bw, snap);
    this.n2.set(n2, 200 * bw, snap);
    this.n3.set(n3, 270 * bw, snap);
  };
  HiFiNasalBranch.prototype.run = function (x) {
    var low = this.z1.run(this.n1.run(x));
    return 0.64 * low + 0.22 * this.n2.run(x) + 0.14 * this.n3.run(x);
  };

  /* ---------- 反共振器（Klatt 零点，直流增益归一到 1） ----------
     与同频同带宽的 Resonator 串联时恰好抵消，所以非鼻音时把零点放在鼻极点上即是直通。 */
  function AntiResonator() {
    this.a = 1; this.b = 0; this.c = 0; this.x1 = 0; this.x2 = 0;
    this.da = 0; this.db = 0; this.dc = 0;
  }
  AntiResonator.prototype.set = function (f, bw, snap) {
    if (!(bw > 0)) bw = 30;
    var valid = f > 0 && f < SR * 0.5;
    var A = 1, Bz = 0, Cz = 0;
    if (valid) {
      var r = Math.exp(-Math.PI * bw / SR);
      var B = 2 * r * Math.cos(2 * Math.PI * f / SR), C = -r * r, A0 = 1 - B - C;
      if (Math.abs(A0) > 1e-12) { A = 1 / A0; Bz = -B / A0; Cz = -C / A0; }
    }
    if (snap) { this.a = A; this.b = Bz; this.c = Cz; this.da = this.db = this.dc = 0; return; }
    this.da = (A - this.a) / HOP; this.db = (Bz - this.b) / HOP; this.dc = (Cz - this.c) / HOP;
  };
  AntiResonator.prototype.run = function (x) {
    this.a += this.da; this.b += this.db; this.c += this.dc;
    var y = this.a * x + this.b * this.x1 + this.c * this.x2;
    this.x2 = this.x1; this.x1 = x; return y;
  };

  NSG.mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function phoneDur(p, position) {
    // 介音和复韵母收尾不应抢走主元音的长音时间。
    if (p.t === 'V' && position) return position === 'onset' ? (p.onset || 0.045) : (p.coda || 0.070);
    return (p.dur || NSG.PHONES.__DUR[p.t] || 70) / 1000;
  }

  /* ---------- 辅音音轨（locus） ----------
     辅音段的 F1–F3 按发音部位和相邻元音换算（音轨方程 F2c = k·F2v + c 的简化形式，
     在 160cm 基准表上计算，再走 formantsOf 做身高/音色缩放）。闭塞期间无声，
     释放后共振峰从这里滑向元音，b/d/g、s/sh/x 由此获得部位差异：
     唇音 F2/F3 偏低，齿龈 F2 趋向 ~1.5kHz，卷舌 F3 明显下降，龈腭 F2 偏高，
     软腭 F2/F3 靠拢。所有收缩都使 F1 降低。 */
  function locusPairs(cons, nb, timbre) {
    if (!cons.pl || !nb || !nb.f) return null;
    if (cons.pl === 'glo') return NSG.formantsOf(nb, timbre).pairs;
    var F1 = nb.f[0], F2 = nb.f[1], F3 = nb.f[2], f2, f3, lip = nb.lip || 0;
    var f1 = Math.max(220, F1 * 0.55);
    if (cons.pl === 'lab') { f2 = 0.58 * F2 + 220; f3 = 0.88 * F3; lip += 0.08; }
    else if (cons.pl === 'alv') { f2 = 0.36 * F2 + 1260; f3 = 0.5 * F3 + 1400; }
    else if (cons.pl === 'ret') { f2 = 0.45 * F2 + 850; f3 = 0.5 * F3 + 800; }
    else if (cons.pl === 'pal') { f2 = 0.35 * F2 + 1500; f3 = 0.5 * F3 + 1550; }
    // 唇软腭（越南语 -c/-ng 的 [k͡p ŋ͡m]）：软腭的 F2/F3 靠拢，再叠唇音的整体下压与圆唇。
    else if (cons.pl === 'lv') { f2 = 0.60 * F2 + 250; f3 = 0.5 * F3 + 0.5 * (f2 + 500); lip += 0.05; }
    // 小舌（克林贡语 q/Q/H）：舌根后缩拉低 F2 并略抬 F1，F2/F3 不像软腭那样靠拢。
    else if (cons.pl === 'uvu') { f1 = Math.max(300, F1 * 0.72); f2 = 0.45 * F2 + 480; f3 = Math.min(F3 * 0.96, f2 + 950); }
    else { f2 = 0.65 * F2 + 650; f3 = Math.min(F3 * 0.92, f2 + 380 + 0.12 * Math.max(0, F3 - f2)); }
    f2 = Math.max(f2, f1 + 250);
    f3 = Math.max(f3, f2 + 300);
    var lp = NSG.formantsOf({ f: [f1, f2, f3], lip: lip }, timbre).pairs; lp[1][1] = Math.min(lp[1][1], 140); lp[2][1] = Math.min(lp[2][1], 185); return lp;
  }

  /* 声母取其后紧邻的响音（元音/滑音/流音）做音轨参照。 */
  function locusNeighbour(phones, index, resolve) {
    var nasalFallback = null, getPhone = resolve || NSG.phoneOf;
    for (var i = index + 1; i < phones.length; i++) {
      var ph = getPhone(phones[i], i);
      if (ph.t === 'V' || ph.t === 'G' || ph.t === 'L') return ph;
      if (!nasalFallback && ph.t === 'N') nasalFallback = ph;
    }
    return nasalFallback;
  }

  /* 鼻音：串联的鼻极点 + 反共振（零点）。
     音色的 nasal 只是“带点鼻音”的音色量（0.05–0.11）。原先鼻辅音也乘它，n 实际只有约 17% 的
     鼻腔耦合，并联支路的极点与零点又重合，几乎没有频谱效果，n 只是一个变弱的口腔响音，和 l 难分。
     现在鼻辅音由极点（~270Hz）与按部位放置的零点给出低频“嗡”声和 F2 一带的凹陷；
     零点回到极点上即为直通，元音不受影响。 */
  var NASAL_POLE = 270, NASAL_VOWEL_ZERO = 60, NASAL_ZERO_BW = 400;
  // 相对相邻元音的幅度：鼻音持阻段约 −8dB、边音约 −6dB；成音节鼻音（嗯、毋）沿用原电平。
  var NASAL_LEVEL = 0.42, L_LEVEL = 0.50, NASAL_SYLLABIC = 0.70;
  var NASAL_RELEASE = 0.020;   // 鼻音除阻前后 20ms 内共振峰快速移动（口腔闭塞突然打开）

  /* 普通话声母 l：原先所有韵母共用一组固定峰 [400, 1250, 2850]，经音色缩放后女声约 506/1638Hz，
     持续 62ms 再以 12ms 时间常数滑入元音——几乎就是一个央元音 ə，li 的 l 的 F1 甚至高于 i，
     听起来像“呃-啦”“呃-哩”。这里：
     · F1 始终低于后接元音（舌尖抵住齿龈的收紧），F2 按韵母协同发音（li 偏前、lu 偏后），
       F3 保持偏高（边音特征），u/ü/o 前带少量圆唇；
     · 除阻后 F1/F2 以 6ms 时间常数打开，舌尖离开齿龈是一个快动作，不是元音间的慢滑移。
     只用于普通话元音前的 l_zh；其他语言的 l、手动指定的旧音素 l 保持原样。 */
  var ZH_L_F1 = [280, 350], ZH_L_F1_RATIO = 0.60, ZH_L_F2 = [0.50, 700], ZH_L_F3 = 2850, ZH_L_LIP = 0.6;
  var ZH_L_RELEASE = 0.025, ZH_L_TAU = 0.006;
  // 普通话 n/l 与日语 m/n/ら行：给持阻形状留出可辨认的时间。
  // 只换算这两种语言的声母；韵尾、成音节鼻音与多语言共用表保持各自的参数。
  function clearSonorant(id, lang, onset) {
    if (!onset || !/^(zh|zh-x-sichuan|ja)$/.test(lang)) return '';
    if (/^(m|n|ny)$/.test(id)) return 'N';
    if ((lang === 'zh' || lang === 'zh-x-sichuan') && id === 'l_zh') return 'L';
    if (lang === 'ja' && id === 'dx') return 'T';
    return '';
  }
  function mandarinLateral(nb, timbre) {
    var lip = studioMode ? Math.min(0.06, (nb.lip || 0) * 0.20) : (nb.lip || 0) * ZH_L_LIP, tl = timbre.lip || 0;
    // 圆唇使全部共振峰按 lipScale 下移；l 的圆唇比元音少，上限要在圆唇之后比较（lüe 的 ü 圆唇最重）。
    var cap = nb.f[0] * 0.92 * NSG.lipScale((nb.lip || 0) + tl) / NSG.lipScale(lip + tl);
    var f1 = Math.min(cap, Math.max(ZH_L_F1[0], Math.min(ZH_L_F1[1], nb.f[0] * ZH_L_F1_RATIO)));
    var f2 = studioMode
      ? Math.max(f1 + 500, 1420, ZH_L_F2[0] * nb.f[1] + 720)
      : Math.max(f1 + 500, ZH_L_F2[0] * nb.f[1] + ZH_L_F2[1]);
    var f3 = Math.max(studioMode ? 2950 : ZH_L_F3, nb.f[2], f2 + (studioMode ? 650 : 600));
    return NSG.formantsOf({ f: [f1, f2, f3], lip: lip }, timbre).pairs;
  }
  function japaneseTapPairs(nb, timbre) {
    if (!nb || !nb.f) return null;
    var f1 = Math.max(220, Math.min(320, nb.f[0] * 0.42));
    var f2 = Math.max(f1 + 400, 0.36 * nb.f[1] + 1280);
    var f3 = Math.max(f2 + 400, 0.50 * nb.f[2] + 1450);
    var lp = NSG.formantsOf({ f: [f1, f2, f3], lip: (nb.lip || 0) * 0.35 }, timbre).pairs;
    lp[0][1] = Math.max(lp[0][1], 110);
    lp[1][1] = Math.min(lp[1][1], 140);
    lp[2][1] = Math.min(lp[2][1], 185);
    return lp;
  }
  // 日语 h（は/へ/ほ）与腭部气流音 xj（ひ/ひゃ等）发声时声门敞开，
  // 声门下耦合显著展宽各共振峰带宽，抑制 3–5 kHz 尖锐嘶声；再配合二阶低通气流源抵消唇端 +6dB/oct 辐射。
  var JA_H_DAMP = [1.9, 1.7, 2.4, 2.8, 2.8, 2.8];
  var JA_H_MIN_BW = [140, 170, 320, 500, 700, 900];
  var JA_XJ_DAMP = [1.8, 1.8, 2.6, 3.0, 3.0, 3.0];
  var JA_XJ_MIN_BW = [140, 180, 380, 580, 800, 1000];
  var JA_H_LP_HZ = 1050, JA_XJ_LP_HZ = 1150;
  var JA_H_LEVEL = 0.16, JA_XJ_LEVEL = 0.16;

  function withLip(out, src) {
    if (src && src._lip !== undefined) Object.defineProperty(out, '_lip', { value: src._lip, enumerable: false, configurable: true });
    return out;
  }

  function dampBreathPairs(pairs, mults, minBws) {
    var out = new Array(6);
    for (var i = 0; i < 6; i++) {
      out[i] = [pairs[i][0], Math.min(2600, Math.max(minBws[i], pairs[i][1] * mults[i]))];
    }
    return withLip(out, pairs);
  }

  function palatalBreathPairs(nb, timbre) {
    var f1 = nb && nb.f ? 0.5 * 340 + 0.5 * Math.min(450, nb.f[0]) : 340;
    var f2 = nb && nb.f ? Math.max(2050, 0.25 * nb.f[1] + 1650) : 2150;
    var f3 = nb && nb.f ? Math.max(2750, 0.35 * nb.f[2] + 1850) : 2800;
    var lip = nb && nb.lip ? nb.lip * 0.3 : 0;
    return dampBreathPairs(NSG.formantsOf({ f: [f1, f2, f3], lip: lip }, timbre).pairs, JA_XJ_DAMP, JA_XJ_MIN_BW);
  }
  // 零点带宽：鼻辅音放宽到 NASAL_ZERO_BW（凹陷够深即可，过窄会只剩一声闷哼）；鼻化元音的零点离极点近，取窄些。
  function nasalZeroBw(pole, zero) { return 100 + (NASAL_ZERO_BW - 100) * Math.max(0, Math.min(1, (zero - pole) / 600)); }
  function nasalScale(timbre) { return NSG.heightScale(timbre.height) * (timbre.fScale || 1) * NSG.genScale(timbre); }

  function nasalVowelPairs(pairs) { return withLip([[pairs[0][0], Math.max(125, pairs[0][1] * 1.6)], [pairs[1][0], Math.max(110, pairs[1][1] * 1.2)], pairs[2], pairs[3], pairs[4], pairs[5]], pairs); }
  function nasalVowelNz(ph, timbre) { var s = nasalScale(timbre); return [NASAL_POLE * s, (NASAL_POLE + NASAL_VOWEL_ZERO * ph.nz) * s]; }
  function nasalTarget(base, syllabic) {
    // 保留音素本身的部位差异与音色缩放；不能把 m/n/ng 全改成同一组峰。
    // 持阻段 F1 放宽到 300Hz：鼻极点已在 ~270Hz 提供低频峰，两个窄峰叠在一起只剩一声闷哼。
    if (syllabic) return withLip([[base[0][0], Math.max(155, base[0][1])], [base[1][0], Math.max(600, base[1][1])], [base[2][0], Math.max(800, base[2][1])], [base[3][0], Math.max(800, base[3][1])], base[4], base[5]], base);
    return withLip([[base[0][0], Math.max(300, base[0][1])],
      [base[1][0], Math.max(260, base[1][1])],
      [base[2][0], Math.max(320, base[2][1])], base[3], base[4], base[5]], base);
  }

  /* 朝鲜语 / 越南语韵尾：元音末段向收尾部位闭合。不除阻塞音只有这段过渡可听；
     鼻音韵尾原先没有过渡，암/앙、tan/tam 只差持阻段的零点。 */
  var KO_VI_CODA = { p_cl: 'lab', t_cl: 'alv', k_cl: 'vel', c_cl: 'pal', kp_cl: 'lv',
    m: 'lab', n: 'alv', ng: 'vel', ny: 'pal', ngm_vi: 'lv' };

  /* 普通话 n/ng 韵尾的部位线索提前放进元音末端；长音主体仍用原元音。
     齿龈 n 的 F2 向前收，软腭 ng 的 F2/F3 靠拢，尤其避免 in/ing 只靠短促的鼻腔嗡声区分。
     只换算运行时的收尾目标，不修改多语言共用的 i、n、ng 音素表。 */
  function mandarinNasalApproach(vowel, coda, timbre) {
    var f1 = vowel.f[0], f2 = vowel.f[1], f3 = vowel.f[2];
    if (coda === 'n') {
      f1 = Math.max(240, f1 * 0.72);
      f2 = f2 * 0.45 + 1050;
      f3 = f3 * 0.65 + 950;
    } else {
      f1 = studioMode ? Math.max(320, f1 * 0.80) : Math.max(330, f1 * 0.83);
      f2 = f2 * 0.60 + 400;
      f3 = (f3 + f2 + 500) * 0.5;
    }
    return NSG.formantsOf({ f: [f1, f2, f3], lip: vowel.lip || 0 }, timbre).pairs;
  }

  /* ---------- 等力度补偿 ----------
     同一力度下，/a/ 比 /i/ /u/ 响近 10dB，同一个元音在不同音高上还能再差十几 dB：
     谐波落在共振峰上就响，落进峰间就轻。真实语音里这种差只有几 dB，因为说话人
     自己会补。这里直接算出该声道形状 + 该音高下六级级联实际送出的功率，按功率
     反比给每个音符一个增益，把差别收到 ±9dB 以内。 */
  /* nz（可选）：[鼻极点 Hz, 零点 Hz]，按渲染时串联的鼻极点/反共振（带宽各 100Hz）计入。 */
  var cpB = new Float64Array(6), cpC = new Float64Array(6), cpA2 = new Float64Array(6), cpCorr = new Float64Array(6);
  var LOG10_OVER_10 = Math.LN10 / 10;
  var RAD_NOM_HZ = 4800;
  function chainPower(pairs, f0, amps, tiltDb, gl, nz, sampleRate) {
    var rate = sampleRate || SR, calibrated = modeB && rate === 48000 && !studioMode;
    var radShelf = modeB && studioMode && rate === SR;
    var radA = radShelf ? Math.exp(-2 * Math.PI * RAD_NOM_HZ / rate) : 0;
    var radNum2 = radShelf ? (1 - radA) * (1 - radA) : 1, radDenB = 1 + radA * radA, rad2A = 2 * radA;
    var hcC = radShelf ? hpcCoeffs(pairs[5] ? pairs[5][0] : 5200, rate) : null;
    var hasNz = !!(nz && Math.abs(nz[0] - nz[1]) > 1);
    var pB = 0, pC = 0, pA2 = 1, zB = 0, zC = 0, zA2 = 1;
    if (hasNz) {
      var pr0 = Math.exp(-Math.PI * 100 / rate);
      pB = 2 * pr0 * Math.cos(2 * Math.PI * nz[0] / rate); pC = -pr0 * pr0;
      var pA = Math.max(1e-9, 1 - pB - pC); pA2 = pA * pA;
      var zr0 = Math.exp(-Math.PI * nasalZeroBw(nz[0], nz[1]) / rate);
      zB = 2 * zr0 * Math.cos(2 * Math.PI * nz[1] / rate); zC = -zr0 * zr0;
      var zA = Math.max(1e-9, 1 - zB - zC); zA2 = zA * zA;
    }
    var K = Math.max(1, Math.min(rate === 48000 ? 256 : 64, Math.floor((rate === 48000 ? 20000 : 7600) / Math.max(40, f0))));
    var n = amps.length, last = amps[n - 1], lastOctave = Math.log(n) / Math.LN2;
    var pitchDb = 20 * Math.log(f0 / 262) * NSG.PITCH_EXP;
    var cpLen = 0;
    for (var j = 0; j < 6; j++) {
      var f = pairs[j][0], bw = pairs[j][1];
      if (!(f > 20) || f >= rate * 0.5) continue;
      var r = Math.exp(-Math.PI * bw / rate);
      var B = 2 * r * Math.cos(2 * Math.PI * f / rate), C = -r * r;
      var A = Math.max(1e-9, 1 - B - C);
      cpB[cpLen] = B; cpC[cpLen] = C; cpA2[cpLen] = A * A;
      if (calibrated) cpCorr[cpLen] = rateCorrection(f, bw);
      cpLen++;
    }
    var p = 0, w0 = 2 * Math.PI * f0 / rate;
    var cw0 = Math.cos(w0), sw0 = Math.sin(w0), cw = 1, sw = 0;
    var legacyTrig = !!NSG.LEGACY_SOUND;
    var hasGlOut = !!(gl && gl.out);
    var tailDb = gl && gl.tailDb !== undefined ? gl.tailDb : TAIL_DB_OCT;
    for (var k = 1; k <= K; k++) {
      var oct = harmonicOctaves[k];
      var db = k <= n ? amps[k - 1] : last + tailDb * (oct - lastOctave);
      db += tiltDb * oct + pitchDb;
      var fk = k * f0;
      if (gl) db += NSG.sourceDbAt(gl, fk, rate);
      if (hasGlOut) db += NSG.outEqDbAt(gl.out, fk);
      var ak2 = Math.exp(db * LOG10_OVER_10);
      if (legacyTrig) {
        var w = k * w0; cw = Math.cos(w); sw = Math.sin(w);
      } else {
        var nextCw = cw * cw0 - sw * sw0;
        sw = sw * cw0 + cw * sw0;
        cw = nextCw;
      }
      var c2 = cw * cw - sw * sw, s2 = 2 * cw * sw;
      var g2 = 1;
      if (calibrated) {
        var oneMinusCw = 1 - cw;
        for (var q = 0; q < cpLen; q++) {
          var bq = cpB[q], cq = cpC[q];
          var dR = 1 - bq * cw - cq * c2;
          var dI = bq * sw + cq * s2;
          var cf = 1 + cpCorr[q] * oneMinusCw;
          g2 *= cpA2[q] / (dR * dR + dI * dI + 1e-18) * (cf * cf);
        }
      } else {
        for (var qu = 0; qu < cpLen; qu++) {
          var bqu = cpB[qu], cqu = cpC[qu];
          var dRu = 1 - bqu * cw - cqu * c2;
          var dIu = bqu * sw + cqu * s2;
          g2 *= cpA2[qu] / (dRu * dRu + dIu * dIu + 1e-18);
        }
      }
      if (hasNz) {
        var pR = 1 - pB * cw - pC * c2, pI = pB * sw + pC * s2;
        var zR = 1 - zB * cw - zC * c2, zI = zB * sw + zC * s2;
        g2 *= (pA2 / (pR * pR + pI * pI + 1e-18)) * ((zR * zR + zI * zI) / zA2);
      }
      if (hcC) {
        var hNrC = hcC[0] + hcC[1] * cw + hcC[2] * c2, hNiC = -(hcC[1] * sw + hcC[2] * s2);
        var hDrC = 1 + hcC[3] * cw + hcC[4] * c2, hDiC = -(hcC[3] * sw + hcC[4] * s2);
        g2 *= (hNrC * hNrC + hNiC * hNiC) / (hDrC * hDrC + hDiC * hDiC + 1e-18);
      }
      /* 唇端辐射 |1-e^{-jw}|² = 2(1-cos w)，只差一个常数因子，按比例计入即可 */
      var radFactor = radShelf ? radNum2 / Math.max(1e-9, radDenB - rad2A * cw) : 1;
      p += ak2 * g2 * (2 - 2 * cw) * radFactor;
    }
    return p;
  }

  function pitchTiltAt(timbre, f0) {
    var base = timbre.tiltDb || 0;
    if (!timbre.pitchTilt) return base;
    var ref = timbre.refF0 || 220;
    var oct = Math.max(-1.5, Math.min(1.5, Math.log(Math.max(40, f0) / ref) / Math.LN2));
    return base + timbre.pitchTilt * oct;
  }

  var refPowerCache = null, refPowerKey = '';
  function refPower(timbre) {
    var key = [studioMode ? 1 : 0, timbre.height, NSG.genValue(timbre), timbre.fScale || 1, timbre.warp || 0, timbre.glottal || 0,
      timbre.bwScale, timbre.hiShift, timbre.lip,
      (timbre.vowelSpace || []).join(','), timbre.harmTailDb, timbre.tiltDb || 0, timbre.pitchTilt || 0, timbre.refF0 || 220,
      (timbre.fRatio || []).join(','), (timbre.bwRatio || []).join(','),
      (timbre.higher || []).join(','), (timbre.sourceEq || []).join(','), (timbre.harm || []).join(','),
      (timbre.outEq || []).join(',')].join('|');
    if (refPowerCache !== null && refPowerKey === key) return refPowerCache;
    var pm = NSG.formantsOf(NSG.PHONES.a, timbre).pairs;
    if (studioMode) applyHawksMillerBw(pm, timbre);
    refPowerCache = chainPower(pm, 220, timbre.harm || NSG.defaultHarm(), pitchTiltAt(timbre, 220), NSG.sourceFilterOf(timbre));
    refPowerKey = key;
    return refPowerCache;
  }

  function applyHawksMillerBw(pairs, timbre) {
    var bwS = Math.max(0.7, Math.min(1.5, timbre.bwScale || 1));
    var br = Array.isArray(timbre.bwRatio) ? timbre.bwRatio : null;
    var f1 = pairs[0][0], f2 = pairs[1][0], f3 = pairs[2][0];
    var maleW = Math.max(0, Math.min(1, (2850 - f3) / 450));
    var b1Min = (50 + 95 / (1 + Math.pow(f1 / 250, 2)) + 0.036 * f1) * bwS * (br && br[0] > 0 ? br[0] : 1);
    var b2Min = (70 + 0.028 * f2) * bwS * (br && br[1] > 0 ? br[1] : 1);
    var b3Min = (85 + 0.020 * f3) * (1 + 0.35 * maleW) * bwS * (br && br[2] > 0 ? br[2] : 1);
    if (pairs[0][1] < b1Min) pairs[0][1] = b1Min;
    if (pairs[1][1] < b2Min) pairs[1][1] = b2Min;
    if (pairs[2][1] < b3Min) pairs[2][1] = b3Min;
    if (pairs[3]) {
      var b4Min = (115 + 0.026 * pairs[3][0]) * (1 + 0.25 * maleW) * bwS;
      if (pairs[3][1] < b4Min) pairs[3][1] = b4Min;
    }
    if (pairs[4]) {
      var b5Min = (170 + 0.036 * pairs[4][0]) * bwS;
      if (pairs[4][1] < b5Min) pairs[4][1] = b5Min;
    }
    if (pairs[5]) {
      var b6Min = (220 + 0.042 * pairs[5][0]) * bwS;
      if (pairs[5][1] < b6Min) pairs[5][1] = b6Min;
    }
    return pairs;
  }

  /* ---------- 声道送气噪声 ----------
     送气（p t k 的 VOT 段）和 h 是声门/软腭处的气流噪声经整个声道塑形的结果，
     带着后接元音的共振峰；只走独立带通的噪声听起来与元音无关，电平又低，
     p 便只剩一段静音、听成 b。这里把白噪声送进同一组共振峰级联。
     电平按“相对参考元音 /a/ 的输出 RMS”标定：level=1 即与等力度补偿后的元音一样响，
     因此不随音色、音高和后接元音漂移。 */
  /* 输出均衡作用在最终人声上，refPower 已把它计入参考元音；噪声功率也要按同一条 EQ 计，
     否则 EQ 压低高频的音色（如 f2）送气噪声会比标定值弱 1–3dB。 */
  function noiseChainPower(pairs, outEq, lpHz, lpPoles, softness) {
    var p = 0, NB = modeB ? 288 : 96, eq = Array.isArray(outEq) ? outEq : null;
    var aLp = lpHz > 0 ? Math.exp(-2 * Math.PI * lpHz / SR) : 0;
    var poles = lpHz > 0 ? (lpPoles || 1) : 0;
    var soft = softness > 0 ? softness : 0;
    var aSoft = soft > 0 ? Math.exp(-2 * Math.PI * 1800 / SR) : 0;
    var radShelfN = studioMode && modeB;
    var useCorr = modeB && !studioMode;
    var radAN = radShelfN ? Math.exp(-2 * Math.PI * RAD_NOM_HZ / SR) : 0;
    var radNum2N = radShelfN ? (1 - radAN) * (1 - radAN) : 1, radDenBN = 1 + radAN * radAN, rad2AN = 2 * radAN;
    var hcN = radShelfN ? hpcCoeffs(pairs[5] ? pairs[5][0] : 5200, SR) : null;
    var correction = useCorr ? pairs.map(function (pair) { return rateCorrection(pair[0], pair[1]); }) : null;
    var coefficients = pairs.map(function (pair) {
      var f = pair[0], bw = pair[1];
      if (!(f > 20) || f >= SR * 0.5) return null;
      var r = Math.exp(-Math.PI * bw / SR), B = 2 * r * Math.cos(2 * Math.PI * f / SR), C = -r * r;
      return [1 - B - C, B, C];
    });
    for (var i = 1; i <= NB; i++) {
      var w = Math.PI * (i - 0.5) / NB, cw = Math.cos(w), sw = Math.sin(w);
      var c2 = Math.cos(2 * w), s2 = Math.sin(2 * w), g2 = 1;
      for (var q = 0; q < 6; q++) {
        var cf = coefficients[q]; if (!cf) continue;
        var A = cf[0], B = cf[1], C = cf[2], dR = 1 - B * cw - C * c2, dI = B * sw + C * s2;
        g2 *= A * A / (dR * dR + dI * dI + 1e-18);
        if (useCorr) g2 *= Math.pow(1 + correction[q] * (1 - cw), 2);
      }
      if (hcN) {
        var hNrN = hcN[0] + hcN[1] * cw + hcN[2] * c2, hNiN = -(hcN[1] * sw + hcN[2] * s2);
        var hDrN = 1 + hcN[3] * cw + hcN[4] * c2, hDiN = -(hcN[3] * sw + hcN[4] * s2);
        g2 *= (hNrN * hNrN + hNiN * hNiN) / (hDrN * hDrN + hDiN * hDiN + 1e-18);
      }
      if (poles > 0) {
        g2 *= Math.pow((1 - aLp) * (1 - aLp) / (1 + aLp * aLp - 2 * aLp * cw), poles);
      }
      if (soft > 0) {
        var sDen = 1 + aSoft * aSoft - 2 * aSoft * cw;
        var sRe = 1 - soft + soft * (1 - aSoft) * (1 - aSoft * cw) / sDen;
        var sIm = -soft * (1 - aSoft) * aSoft * sw / sDen;
        g2 *= sRe * sRe + sIm * sIm;
      }
      if (eq) g2 *= Math.pow(10, NSG.outEqDbAt(eq, w * SR / (2 * Math.PI)) / 10);
      var radFactorN = radShelfN ? radNum2N / Math.max(1e-9, radDenBN - rad2AN * cw) : 1;
      p += g2 * (2 - 2 * cw) * radFactorN;
    }
    return p / NB;
  }
  // Aspiration is coloured at the source before entering the tract. A bright
  // /i/ tract can amplify that continuous noise far more than the sparse voiced
  // harmonics at high F0. Estimate the ACTUAL coloured-noise path separately;
  // a harmonic-only resonance guard cannot bound it.
  var aspirationGrid = null, aspirationWeights = null, aspirationWeightKey = null;
  function aspirationPower(pairs, eq, airMix) {
    var bins = 288;
    if (!aspirationGrid) {
      aspirationGrid = [];
      for (var i = 0; i < bins; i++) {
        var w = Math.PI * (i + 0.5) / bins;
        aspirationGrid.push([Math.cos(w), Math.sin(w), Math.cos(2 * w), Math.sin(2 * w)]);
      }
    }
    var stKey = studioMode && modeB ? 'S:' : '';
    var key = stKey + airMix + ':' + (Array.isArray(eq) ? eq.join(',') : '');
    if (key !== aspirationWeightKey) {
      aspirationWeights = new Float64Array(bins);
      var asp = Math.exp(-2 * Math.PI * (studioMode && modeB ? 950 : 1000) / SR), air = Math.exp(-2 * Math.PI * 6500 / SR);
      var body = Math.exp(-2 * Math.PI * 2800 / SR), source = Math.exp(-2 * Math.PI * 6000 / SR);
      var radASt = studioMode && modeB ? Math.exp(-2 * Math.PI * RAD_NOM_HZ / SR) : 0;
      var radNum2A = (1 - radASt) * (1 - radASt), radDenBA = 1 + radASt * radASt, rad2AA = 2 * radASt;
      for (var j = 0; j < bins; j++) {
        var cw = aspirationGrid[j][0], sw = aspirationGrid[j][1];
        function lp(a) {
          var den = 1 + a * a - 2 * a * cw;
          return [(1 - a) * (1 - a * cw) / den, -(1 - a) * a * sw / den];
        }
        var low = lp(asp), hi = lp(air), mid = lp(body);
        var power;
        if (studioMode && modeB) {
          var l2 = low[0] * low[0] + low[1] * low[1];
          power = (l2 * l2) * (1 - source) * (1 - source) / (1 + source * source - 2 * source * cw);
        } else {
          var re = low[0] + airMix * (hi[0] - mid[0]), im = low[1] + airMix * (hi[1] - mid[1]);
          power = (re * re + im * im) * (1 - source) * (1 - source) / (1 + source * source - 2 * source * cw);
        }
        if (Array.isArray(eq)) power *= Math.pow(10, NSG.outEqDbAt(eq, (j + 0.5) * SR / (2 * bins)) / 10);
        var radFA = studioMode && modeB ? radNum2A / Math.max(1e-9, radDenBA - rad2AA * cw) : 1;
        aspirationWeights[j] = power * (2 - 2 * cw) * radFA;
      }
      aspirationWeightKey = key;
    }
    var coefficients = pairs.map(function (p) {
      var f = p[0], bw = p[1], r = Math.exp(-Math.PI * bw / SR);
      var b = 2 * r * Math.cos(2 * Math.PI * f / SR), c = -r * r;
      return f > 20 && f < SR / 2 ? [1 - b - c, b, c, studioMode ? 0 : rateCorrection(f, bw)] : null;
    });
    var hcA = (studioMode && modeB) ? hpcCoeffs(pairs[5] ? pairs[5][0] : 5200, SR) : null;
    var sum = 0;
    for (var k = 0; k < bins; k++) {
      var grid = aspirationGrid[k], g2 = aspirationWeights[k];
      for (var q = 0; q < 6; q++) {
        var cf = coefficients[q]; if (!cf) continue;
        var dr = 1 - cf[1] * grid[0] - cf[2] * grid[2], di = cf[1] * grid[1] + cf[2] * grid[3];
        var numerator = cf[0] * (1 + cf[3] * (1 - grid[0]));
        g2 *= numerator * numerator / (dr * dr + di * di + 1e-18);
      }
      if (hcA) {
        var hNrA = hcA[0] + hcA[1] * grid[0] + hcA[2] * grid[2], hNiA = -(hcA[1] * grid[1] + hcA[2] * grid[3]);
        var hDrA = 1 + hcA[3] * grid[0] + hcA[4] * grid[2], hDiA = -(hcA[3] * grid[1] + hcA[4] * grid[3]);
        g2 *= (hNrA * hNrA + hNiA * hNiA) / (hDrA * hDrA + hDiA * hDiA + 1e-18);
      }
      sum += g2;
    }
    return sum / bins;
  }
  // 声带通路：s×0.30，av 帧值再乘 0.92；正弦平均功率 1/2；噪声为 [-1,1] 均匀分布，方差 1/3。
  /* 带通噪声（爆破、/f/）不经声道，电平原本只对默认音色标定；
     元音更响的音色里它们会低 8dB 左右。按参考元音功率之比换算回来。 */
  var defaultRef = null, defaultRefStudio = null;
  // 带通噪声（中心 fc、带宽 bw）经输出均衡后的平均功率增益：按谐振峰形状加权，
  // 不取单点——撅取得到的 EQ 曲线起伏大，单点值会把整段噪声补偏好几 dB。
  function bandEqPower(eq, fc, bw) {
    var num = 0, den = 0, hb = Math.max(100, bw) / 2;
    for (var f = 50; f <= SR / 2; f += 25) {
      var x = (f - fc) / hb, w = 1 / (1 + x * x);
      num += w * Math.pow(10, NSG.outEqDbAt(eq, f) / 10); den += w;
    }
    return den > 0 ? num / den : 1;
  }
  // fc/bw：带通中心频率与带宽。输出均衡会在最终输出上再改变这段噪声，参考元音却已计入 EQ，这里抵消掉。
  function bandNoiseScale(timbre, fc, bw) {
    var defRef;
    if (studioMode) {
      if (defaultRefStudio === null) defaultRefStudio = refPower(NSG.defaultTimbre());
      defRef = defaultRefStudio;
    } else {
      if (defaultRef === null) defaultRef = refPower(NSG.defaultTimbre());
      defRef = defaultRef;
    }
    var ref = refPower(timbre);
    var s = defRef > 1e-12 && ref > 1e-12 ? Math.max(0.5, Math.min(4, Math.sqrt(ref / defRef))) : 1;
    if (fc > 0 && Array.isArray(timbre.outEq)) s *= Math.max(0.5, Math.min(2, 1 / Math.sqrt(bandEqPower(timbre.outEq, fc, bw || 1200))));
    return s;
  }
  /* 咝音的带通噪声电平原本只对 s（6.1kHz）合适：中心频率越低，唇端辐射和带通峰值越小，
     sh/zh/ch（3.1kHz）比 s 弱十几 dB，x/j/q 弱 6–8dB。真实语音里 ʂ ɕ 与 s 差不多响。
     这里按 (6100/f)² 补回，上限 4 倍；唇音、喉音不经过这里。 */
  function sibilantScale(ph) {
    if (!ph.na || ph.nonSibilant || !/^(alv|ret|pal)$/.test(ph.pl || '')) return 1;
    return Math.max(1, Math.min(4, Math.pow(6100 / ph.na.f, 2)));
  }
  function voiceBarPairs(p) {
    return withLip([[220, 90], [p[1][0], p[1][1] * 4], [p[2][0], p[2][1] * 4], [p[3][0], p[3][1] * 4], [p[4][0], p[4][1] * 4], [p[5][0], p[5][1] * 4]], p);
  }
  function tractNoiseGain(pairs, timbre, level, lpHz, lpPoles) {
    var soft = lpHz > 0 && typeof timbre.consonantSoftness === 'number' && isFinite(timbre.consonantSoftness) ?
      Math.max(0, Math.min(1, timbre.consonantSoftness)) : 0;
    var np = noiseChainPower(pairs, timbre.outEq, lpHz, lpPoles, soft);
    return np > 1e-12 ? level * 0.30 * 0.92 * Math.sqrt(refPower(timbre) / 2) / Math.sqrt(np / 3) : 0;
  }

  // Integrate the actual parallel friction filter, including the selected
  // consonant softening and lip radiation. Equal noise variance per sample
  // does NOT imply equal noise density after changing the sample rate.
  function frictionPower(fc, bw, softness, rate, outEq, cavity) {
    function pole(f, b, w) {
      var r = Math.exp(-Math.PI * b / rate), B = 2 * r * Math.cos(2 * Math.PI * f / rate), C = -r * r;
      var dr = 1 - B * Math.cos(w) - C * Math.cos(2 * w), di = B * Math.sin(w) + C * Math.sin(2 * w);
      var a = (1 - B - C) / (dr * dr + di * di);
      return [a * dr, -a * di];
    }
    var sum = 0, bins = 128, lp = Math.exp(-2 * Math.PI * 1800 / rate);
    for (var i = 0; i < bins; i++) {
      var w = Math.PI * (i + 0.5) / bins, cw = Math.cos(w), sw = Math.sin(w);
      var h = pole(fc, bw, w), low = pole(Math.min(fc * 0.55, 7000), 2400, w);
      var re = h[0] - 0.5 * low[0], im = h[1] - 0.5 * low[1];
      var den = 1 + lp * lp - 2 * lp * cw;
      var mr = 1 - softness + softness * (1 - lp) * (1 - lp * cw) / den;
      var mi = -softness * (1 - lp) * lp * sw / den;
      var eqPower = Array.isArray(outEq) ? Math.pow(10, NSG.outEqDbAt(outEq, w * rate / (2 * Math.PI)) / 10) : 1;
      sum += (re * re + im * im) * (mr * mr + mi * mi) * (2 - 2 * cw) * eqPower * (cavity ? cavity.power(w) : 1);
    }
    return sum / bins;
  }

  // HiFi front-cavity fricative waveguide (strong coupling is default when modeB
  // && !rawSource; diagnostic bypass via modeBFricWaveguide: 'off' | false):
  // two-stage physical fricative waveguide with Thiran allpass fractional delay.
  // Stage 1 models a damped sublingual/back-cavity side-branch stub at the
  // constriction junction (creating the low-mid spectral zero and upper harmonic
  // reinforcement); Stage 2 models the front cavity with lip-radiation output
  // (ahead - rLip*loss), avoiding dry/wet comb notches while preserving
  // 8-16 kHz radiation energy.
  function FricativeFrontCavity(profile) {
    this.forward = new Float64Array(64); this.backward = new Float64Array(64);
    this.stub = new Float64Array(64);
    this.index = 0; this.stubIndex = 0;
    this.delay = 2; this.target = 2; this.step = 0;
    this.stubDelay = 12; this.stubTarget = 12; this.stubStep = 0;
    this.loss = 0; this.stubLoss = 0;
    this.fApX1 = 0; this.fApY1 = 0; this.bApX1 = 0; this.bApY1 = 0;
    this.sApX1 = 0; this.sApY1 = 0;
    this.lastIntD = 1; this.lastStubIntD = 1;
    this.amount = typeof profile === 'number' && isFinite(profile) ? Math.max(0, Math.min(1, profile)) :
      (profile === 'light' ? 0.5 : 1);
    this.strong = this.amount >= 1;
    this.lp = 0.5; this.lpT = 0.5; this.lpStep = 0;
    this.lpZ = 0.6; this.lpZT = 0.6; this.lpZStep = 0;
    this.rBack = 0.4; this.rBackT = 0.4; this.rBackStep = 0;
    this.rLip = 0.36; this.rLipT = 0.36; this.rLipStep = 0;
    this.rStub = 0.4; this.rStubT = 0.4; this.rStubStep = 0;
    this.rJ = 0.16; this.rJT = 0.16; this.rJStep = 0;
    this._lastF = -1; this._lastAmt = -1; this._lastStudio = false; this._steady = false;
    this._sInt = 1; this._sAp = 0; this._intD = 1; this._ap = 0;
  }
  FricativeFrontCavity.prototype._cacheSteady = function () {
    this._sInt = Math.max(1, Math.floor(this.stubDelay - 0.45));
    var sDelta = this.stubDelay - this._sInt;
    this._sAp = (1 - sDelta) / (1 + sDelta);
    this._intD = Math.max(1, Math.floor(this.delay - 0.45));
    var delta = this.delay - this._intD;
    this._ap = (1 - delta) / (1 + delta);
  };
  FricativeFrontCavity.prototype.set = function (hz, snap) {
    var f = Math.max(1000, hz);
    var amt = this.amount;
    if (f !== this._lastF || amt !== this._lastAmt || studioMode !== this._lastStudio) {
      this._lastF = f; this._lastAmt = amt; this._lastStudio = studioMode;
      var tPal = Math.max(0, Math.min(1, (f - 3100) / (4200 - 3100)));
      var tAlv = Math.max(0, Math.min(1, (f - 4200) / (6100 - 4200)));
      function place(sh, x, s) {
        var sx = sh + (x - sh) * tPal;
        return sx + (s - sx) * tAlv;
      }
      var fPole = studioMode ? place(3500, 6100, 7800) : place(2750, 5600, 8200);
      var lpHz = studioMode ? place(8200, 8600, 11200) : place(9000, 10500, 16500);
      var fZero = place(1350, 2350, 2700);
      var lpZero = place(2400, 2300, 4200);
      function couple(lightVal, strongVal) {
        if (amt >= 1) return strongVal;
        if (amt <= 0.5) return lightVal * (amt / 0.5);
        return lightVal + (strongVal - lightVal) * ((amt - 0.5) / 0.5);
      }
      this.rBackT = couple(place(0.40, 0.38, 0.30), place(0.62, 0.54, 0.48));
      this.rLipT = couple(place(0.36, 0.34, 0.26), place(0.56, 0.48, 0.42));
      this.rStubT = couple(place(0.34, 0.36, 0.34), place(0.58, 0.56, 0.58));
      this.rJT = couple(place(0.14, 0.14, 0.14), place(0.22, 0.22, 0.24));
      this.lpT = Math.exp(-2 * Math.PI * lpHz / SR);
      var w = 2 * Math.PI * fPole / SR;
      var lr = 1 - this.lpT * Math.cos(w), li = this.lpT * Math.sin(w);
      var tauLp = Math.atan2(li, lr) / Math.max(1e-6, w);
      this.target = Math.max(1.15, Math.min(14, SR / (4 * fPole) - 0.5 * tauLp));
      this.lpZT = Math.exp(-2 * Math.PI * lpZero / SR);
      var wz = 2 * Math.PI * fZero / SR;
      var lzr = 1 - this.lpZT * Math.cos(wz), lzi = this.lpZT * Math.sin(wz);
      var tauLz = Math.atan2(lzi, lzr) / Math.max(1e-6, wz);
      this.stubTarget = Math.max(2.0, Math.min(36, SR / (2 * fZero) - tauLz));
    }
    if (snap) this.snap();
    this.step = (this.target - this.delay) / HOP;
    this.stubStep = (this.stubTarget - this.stubDelay) / HOP;
    this.lpStep = (this.lpT - this.lp) / HOP;
    this.lpZStep = (this.lpZT - this.lpZ) / HOP;
    this.rBackStep = (this.rBackT - this.rBack) / HOP;
    this.rLipStep = (this.rLipT - this.rLip) / HOP;
    this.rStubStep = (this.rStubT - this.rStub) / HOP;
    this.rJStep = (this.rJT - this.rJ) / HOP;
    this._steady = (this.step === 0 && this.stubStep === 0 && this.lpStep === 0 &&
      this.lpZStep === 0 && this.rBackStep === 0 && this.rLipStep === 0 &&
      this.rStubStep === 0 && this.rJStep === 0);
    if (this._steady) this._cacheSteady();
  };
  FricativeFrontCavity.prototype.snap = function () {
    this.delay = this.target; this.stubDelay = this.stubTarget;
    this.lp = this.lpT; this.lpZ = this.lpZT;
    this.rBack = this.rBackT; this.rLip = this.rLipT;
    this.rStub = this.rStubT; this.rJ = this.rJT;
    this._cacheSteady();
  };
  FricativeFrontCavity.prototype.run = function (x) {
    var sInt, sAp, intD, ap;
    if (this._steady) {
      sInt = this._sInt; sAp = this._sAp;
      intD = this._intD; ap = this._ap;
    } else {
      this.delay += this.step; this.stubDelay += this.stubStep;
      this.lp += this.lpStep; this.lpZ += this.lpZStep;
      this.rBack += this.rBackStep; this.rLip += this.rLipStep;
      this.rStub += this.rStubStep; this.rJ += this.rJStep;
      sInt = Math.max(1, Math.floor(this.stubDelay - 0.45));
      var sDelta = this.stubDelay - sInt;
      sAp = (1 - sDelta) / (1 + sDelta);
      intD = Math.max(1, Math.floor(this.delay - 0.45));
      var delta = this.delay - intD;
      ap = (1 - delta) / (1 + delta);
    }
    if (sInt !== this.lastStubIntD) {
      var sPrevIdx = (this.stubIndex - 1 - sInt + 64) & 63;
      this.sApX1 = this.stub[sPrevIdx];
      this.lastStubIntD = sInt;
    }
    var sTap = (this.stubIndex - sInt + 64) & 63;
    var sIn = this.stub[sTap];
    var sOut = sAp * sIn + this.sApX1 - sAp * this.sApY1;
    this.sApX1 = sIn; this.sApY1 = sOut;
    this.stubLoss = (1 - this.lpZ) * sOut + this.lpZ * this.stubLoss;
    var stubRefl = this.rStub * this.stubLoss;
    this.stub[this.stubIndex] = x + this.rJ * stubRefl;
    this.stubIndex = (this.stubIndex + 1) & 63;
    var junc = x + (1 + this.rJ) * stubRefl;

    if (intD !== this.lastIntD) {
      var prevIdx = (this.index - 1 - intD + 64) & 63;
      this.fApX1 = this.forward[prevIdx];
      this.bApX1 = this.backward[prevIdx];
      this.lastIntD = intD;
    }
    var tap = (this.index - intD + 64) & 63;
    var fIn = this.forward[tap], bIn = this.backward[tap];
    var ahead = ap * fIn + this.fApX1 - ap * this.fApY1;
    this.fApX1 = fIn; this.fApY1 = ahead;
    var back = ap * bIn + this.bApX1 - ap * this.bApY1;
    this.bApX1 = bIn; this.bApY1 = back;
    this.loss = (1 - this.lp) * ahead + this.lp * this.loss;
    var lipRefl = -this.rLip * this.loss;
    this.forward[this.index] = junc + this.rBack * back;
    this.backward[this.index] = lipRefl;
    this.index = (this.index + 1) & 63;
    return ahead + lipRefl;
  };
  FricativeFrontCavity.prototype.power = function (w) {
    var cw = Math.cos(w), sw = Math.sin(w);
    // Stage 1: side-branch stub transfer H_stub(w) = (1 + Rs) / (1 - rJ * Rs)
    var sInt = Math.max(1, Math.floor(this.stubTarget - 0.45));
    var sDelta = this.stubTarget - sInt, sAp = (1 - sDelta) / (1 + sDelta);
    var sDenR = 1 + sAp * cw, sDenI = -sAp * sw, sDen = sDenR * sDenR + sDenI * sDenI;
    var sApR = ((sAp + cw) * sDenR - sw * sDenI) / sDen;
    var sApI = (-sw * sDenR - (sAp + cw) * sDenI) / sDen;
    var szR = Math.cos(w * sInt), szI = -Math.sin(w * sInt);
    var dzR = szR * sApR - szI * sApI, dzI = szR * sApI + szI * sApR;
    var lzr = 1 - this.lpZT * cw, lzi = this.lpZT * sw, lzd = lzr * lzr + lzi * lzi;
    var azr = (1 - this.lpZT) * lzr / lzd, azi = -(1 - this.lpZT) * lzi / lzd;
    var rsr = this.rStubT * (azr * dzR - azi * dzI), rsi = this.rStubT * (azr * dzI + azi * dzR);
    var hNumR = 1 + rsr, hNumI = rsi, hDenR = 1 - this.rJT * rsr, hDenI = -this.rJT * rsi;
    var stubMag2 = (hNumR * hNumR + hNumI * hNumI) / (hDenR * hDenR + hDenI * hDenI);

    // Stage 2: front-cavity + lip-radiation transfer H_cav(w) = D * (1 - rLip * L) / (1 + rBack * rLip * L * D^2)
    var intD = Math.max(1, Math.floor(this.target - 0.45));
    var delta = this.target - intD, ap = (1 - delta) / (1 + delta);
    var apDenR = 1 + ap * cw, apDenI = -ap * sw, apDen = apDenR * apDenR + apDenI * apDenI;
    var apR = ((ap + cw) * apDenR - sw * apDenI) / apDen;
    var apI = (-sw * apDenR - (ap + cw) * apDenI) / apDen;
    var zR = Math.cos(w * intD), zI = -Math.sin(w * intD);
    var dr = zR * apR - zI * apI, di = zR * apI + zI * apR;
    var lr = 1 - this.lpT * cw, li = this.lpT * sw, ld = lr * lr + li * li;
    var ar = (1 - this.lpT) * lr / ld, ai = -(1 - this.lpT) * li / ld;
    var rr = dr * dr - di * di, ri = 2 * dr * di;
    var lpr = ar * rr - ai * ri, lpi = ar * ri + ai * rr;
    var rLoop = this.rBackT * this.rLipT;
    var denR = 1 + rLoop * lpr, denI = rLoop * lpi, den = denR * denR + denI * denI;
    var radR = 1 - this.rLipT * ar, radI = -this.rLipT * ai;
    var numR = dr * radR - di * radI, numI = dr * radI + di * radR;
    var cavMag2 = (numR * numR + numI * numI) / den;
    return stubMag2 * cavMag2;
  };

  function loudCompPower(p, timbre) {
    var ref = refPower(timbre);
    if (!(p > 1e-12) || !(ref > 1e-12)) return 1;
    return Math.max(0.35, Math.min(3.0, Math.sqrt(ref / p)));
  }

  /* 六组 [频率, 带宽] 的深复制（控制帧里必须各自持有） */
  function copyPairs(p) {
    var o = new Array(6);
    for (var i = 0; i < 6; i++) o[i] = [p[i][0], p[i][1]];
    return withLip(o, p);
  }

  /* 辅音可懂度标定（相对参考元音 RMS 的幅度比；释放段另有爆破）。
     ASP_LEVEL：p t k 的送气；PUFF_LEVEL：b d g 释放后的短促气流；H_LEVEL：h；
     BURST_GAIN：塞音爆破噪声相对音素表电平的倍数（再按中心频率补偿唇端辐射：
     900Hz 的唇音爆破比 3.8kHz 的齿龈爆破天然弱十几 dB）；F_GAIN：非英语 /f/ 的摩擦增益。 */
  var TAP_LEVEL = 0.16;   // 闪音持阻段相对后接元音的幅度（约 −16dB）
  var ASP_LEVEL = 0.28, PUFF_LEVEL = 0.12, H_LEVEL = 0.22, ZH_MEDIAL_H_LEVEL = 0.13, BURST_GAIN = 6, F_GAIN = 6;
  var ASP_TO_VOWEL = 0.025;
  var VBAR_LEVEL = 0.18, VREL_LEVEL = 0.30;   // 浊塞音：闭塞浊音杠、释放段带声（相对后接元音的幅度）；送气段在 25ms 内平滑滑向元音

  /* 相邻同部位/重复辅音归类：词间或音节间连读（如 good day、lit tle、what time、bus stop、one night）
     前一个韵尾辅音与后一个起音辅音合并为一次闭塞+一次除阻（或连续擦音/鼻音/边音），避免连发两次。 */
  function stopPlaceOf(id) {
    if (/^(p|ph|p_j|b|bv|py_ru|by_ru)$/.test(id)) return 'lab';
    if (/^(t|t_h|t_j|d|dv|ty_ru|dy_ru)$/.test(id)) return 'alv';
    if (id === 'D_tlh') return 'ret';
    if (/^(k|kh|k_j|g|gv|ky_ru|gy_ru)$/.test(id)) return 'vel';
    if (id === 'q_tlh') return 'uvu';
    return '';
  }
  function affricatePlaceOf(id) {
    if (/^(pf_de|v_ax)$/.test(id)) return 'lab';
    if (/^(ts|tsh|dz|ts_r|tsh_r|dz_r|ch_en|jh_en|chx_ax|ts_j|tsh_j|dz_j|z_r|jj_ko|c_vi|tlh_tlh)$/.test(id)) return 'cor';
    if (id === 'Q_tlh') return 'uvu';
    return '';
  }
  function continuantGroupOf(id) {
    if (/^(m|my_ru)$/.test(id)) return 'm';
    if (id === 'n') return 'n';
    if (id === 'ny') return 'ny';
    if (/^(ng|N_j|ngm_vi)$/.test(id)) return 'ng';
    if (/^(l|l_zh|l_ru|l_uk)$/.test(id)) return 'l';
    if (/^(ly_ru|ly_rom)$/.test(id)) return 'ly';
    if (/^(r|rj)$/.test(id)) return 'r';
    if (/^(dx|r_pl|r_ru|r_uk|r_fi|r_tlh)$/.test(id)) return 'dx';
    if (id === 'rr_es') return 'rr_es';
    if (id === 'w') return 'w';
    if (/^(jj|y_es)$/.test(id)) return 'jj';
    if (/^(f|fj|fy_ru)$/.test(id)) return 'f';
    if (/^(v|vy_ru|v_fi)$/.test(id)) return 'v';
    if (id === 'th') return 'th';
    if (id === 'dh') return 'dh';
    if (/^(s|ss_ko|sy_ru)$/.test(id)) return 's';
    if (/^(z|zy_ru)$/.test(id)) return 'z';
    if (/^(sh|sr)$/.test(id)) return 'sh';
    if (/^(zh|zr|zh_ax)$/.test(id)) return 'zh';
    if (/^(xc|ss_i_ko|xc_ru)$/.test(id)) return 'xc';
    if (/^(xj|xj_long_ax)$/.test(id)) return 'xj';
    if (id === 'zx_pl') return 'zx';
    if (/^(h|h_ko|hh_uk|x_ax)$/.test(id)) return 'h';
    if (/^(ch_de|xy_ru)$/.test(id)) return 'ch_de';
    if (/^(x_de|x_pl|x_ru|x_uk|x_vi|x_es|gh_vi|h_ax|H_tlh)$/.test(id)) return 'x';
    if (id === 'gh_tlh') return 'gh_tlh';
    if (id === 'r_de') return 'r_de';
    if (id === 'r_fr') return 'r_fr';
    return '';
  }
  function isGeminatePair(id1, id2) {
    if (!id1 || !id2) return false;
    var sp1 = stopPlaceOf(id1);
    if (sp1) {
      if (stopPlaceOf(id2) === sp1) return true;
      if (sp1 === 'alv' && (affricatePlaceOf(id2) === 'cor' || /^(dx|r_pl|r_ru|r_uk|r_tlh)$/.test(id2))) return true;
      if (sp1 === 'lab' && affricatePlaceOf(id2) === 'lab') return true;
      if (sp1 === 'uvu' && affricatePlaceOf(id2) === 'uvu') return true;
      return false;
    }
    var ap1 = affricatePlaceOf(id1);
    if (ap1) return id1 === id2 || (ap1 === affricatePlaceOf(id2) && /^(ch_en|jh_en)$/.test(id1) && /^(ch_en|jh_en)$/.test(id2));
    var cg1 = continuantGroupOf(id1);
    return !!cg1 && cg1 === continuantGroupOf(id2);
  }

  function samePhonesList(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ---------- 事件表：把每个音符拆成"声道形状"时段 ---------- */
  function buildEvents(score, timbre, tm, lang, japaneseFriction, japaneseVoicedFriction, collectPhones, nasalRelease, nasalTract) {
    var timingOnly = collectPhones === 'timingOnly';
    if (nasalRelease === undefined) nasalRelease = true;
    var trk = null;
    for (var i = 0; i < score.tracks.length; i++) if (score.tracks[i].type === 'vocal') { trk = score.tracks[i]; break; }
    if (!trk) trk = score.tracks[0];
    var effLang = (trk && trk.lang) || lang;
    var effPh = trk && trk.phonemizer !== undefined ? trk.phonemizer : score.phonemizer;
    var effTimbre = (trk && trk.timbre) || timbre;
    timbre = effTimbre;
    lang = effLang;
    // Work on fresh runtime records; rendering must not leave stale slur/rest flags in a project.
    var notes = NSG.phonemizeNotes(trk.notes, effLang, effPh);
    if (!timingOnly) notes.forEach(function (n) { n.pb = NSG.TUNING.points(n.pb); });
    var ev = [];
    /* 上一个发声单元的尾巴：辅音前置时可以向它借时间。
       voiced：{ v: 末元音事件下标, end: 该音符事件结束后的 ev.length }；breath：{ b: 呼吸事件下标 }。 */
    var tail = null, soundEnd = 0, prevChain = null;

    function notePhonesInfo(noteObj) {
      var nLang = noteObj.lang || lang;
      var phList = noteObj.phones && noteObj.phones.length ? noteObj.phones.slice() : null;
      if (!phList) {
        var syl = NSG.g2p(noteObj.slur ? 'a' : (noteObj.lyric || ''), nLang);
        phList = syl.length ? syl[0].phones.slice() : ['a'];
      }
      if (!phList.length) phList = ['a'];
      var nucIdx = -1;
      for (var q = phList.length - 1; q >= 0; q--) if (NSG.phoneOf(phList[q]).t === 'V') { nucIdx = q; break; }
      if (/^(nan|hak|nan-x-teochew)$/.test(nLang)) nucIdx = NSG.nanNucleus(phList, nLang);
      if (nLang === 'vi') {
        while (nucIdx > 0 && /^(at_vi|I2?_vi|U2?_vi)$/.test(phList[nucIdx]) && NSG.phoneOf(phList[nucIdx - 1]).t === 'V') nucIdx--;
      }
      if (nLang === 'yue') {
        while (nucIdx > 0 && NSG.phoneOf(phList[nucIdx]).glide && NSG.phoneOf(phList[nucIdx - 1]).t === 'V') nucIdx--;
      }
      if ((nLang === 'zh' || nLang === 'zh-x-sichuan') && nucIdx > 0 && /^(I|U|U_a|U_ou)$/.test(phList[nucIdx])) {
        var prevVowel = NSG.phoneOf(phList[nucIdx - 1]);
        if (prevVowel.t === 'V' && prevVowel.f[0] > NSG.phoneOf(phList[nucIdx]).f[0]) nucIdx--;
      }
      if (nucIdx < 0) nucIdx = phList.length - 1;
      var nucList = [nucIdx];
      if (nLang === 'en') {
        nucList = [];
        for (var v = 0; v < phList.length; v++) {
          if (NSG.phoneOf(phList[v]).t !== 'V') continue;
          if (noteObj._stressByPhone ? noteObj._stressByPhone[v] === undefined :
              v && /^(a:I|e:I|O:I|a:U|o:U)$/.test(phList[v - 1] + ':' + phList[v])) continue;
          nucList.push(v);
        }
        if (!nucList.length) nucList = [nucIdx];
        nucIdx = nucList[nucList.length - 1];
      }
      else if (NSG.isWordPhonemizer(nLang)) {
        nucList = [];
        phList.forEach(function (id, index) {
          var phone = NSG.phoneOf(id);
          if ((phone.t === 'V' && !phone.glide) || phone.syllabic) nucList.push(index);
        });
        if (!nucList.length) nucList = [nucIdx];
        nucIdx = nucList[nucList.length - 1];
      }
      var preCount = 0;
      while (preCount < nucList[0] && NSG.phoneOf(phList[preCount]).t !== 'V') preCount++;
      var hasV = phList.some(function (id) { return NSG.phoneOf(id).t === 'V'; });
      return { phones: phList, nuc: nucIdx, nuclei: nucList, preN: preCount, hasVowel: hasV };
    }

    function prevTailNoise(prevEv, atTime) {
      var fric = prevEv.fric || 0, tn = prevEv.tn || 0;
      if (!prevEv.release || !(fric > 0 || tn > 0)) return { fric: fric, tn: tn, rel: false, floor: 0 };
      var endT = prevEv.nominalT1 !== undefined ? prevEv.nominalT1 : prevEv.t1;
      var len = Math.max(1e-6, endT - prevEv.t0);
      var elapsed = Math.max(0, Math.min(len, atTime - prevEv.t0));
      var left = Math.max(0, endT - atTime);
      var attSpan = Math.min(prevEv.flowAttack || (prevEv.burstBoost ? 0.001 : 0.003), len * (prevEv.flowAttackFraction || 0.25));
      var att = attSpan > 0 ? Math.min(1, elapsed / attSpan) : 1;
      if (prevEv.flowAttack) att *= att * (3 - 2 * att);
      var base = fric * att * (prevEv.burstBoost ? 1 + prevEv.burstBoost * Math.exp(-elapsed / 0.012) : 1);
      var aspRatio = (prevEv.asp || 0) / BURST_GAIN;
      var decayed = base * (aspRatio + (1 - aspRatio) * Math.exp(-elapsed / 0.005));
      var floor = decayed > 1e-12 ? Math.min(1, (base * aspRatio) / decayed) : 0;
      var tnOut = tn * Math.min(1, Math.max(0, elapsed - 0.002) / 0.004) *
        Math.min(1, left / Math.min(0.012, len * 0.5));
      return { fric: decayed, tn: tnOut, rel: true, floor: floor };
    }

    for (var n = 0; n < notes.length; n++) {
      var note = notes[n];
      var isSlur = !!note._slur;
      if (isSlur) {
        // Its phonemes were scheduled as part of the head syllable, including the final coda.
        continue;
      }
      /* 休止符：整段不出声（导入的工程里常拿它占位） */
      if (NSG.TUNING.isRest(note)) {
        var rStart = tm.secOf(note.start);
        note._start = rStart;
        note._end = Math.max(rStart + 0.01, tm.secOf(note.start + note.dur));
        note._rest = true;
        prevChain = null;
        continue;
      }
      if (NSG.TUNING.isBreath(note)) {
        note._start = tm.secOf(note.start);
        note._end = tm.secOf(note.start + note.dur);
        note._breath = true;
        var breathId = NSG.breathPhoneOf ? NSG.breathPhoneOf(note) : 'br';
        note._breathPhone = breathId;
        var breath = NSG.PHONES[breathId] || NSG.PHONES.br;
        var bp = breath.brProfile || null;
        var breathPairs = !timingOnly ? NSG.formantsOf(breath, timbre).pairs : null;
        if (breathPairs && bp && Array.isArray(breath.b)) {
          var brBwScale = timbre.bwScale || 1;
          for (var bbi = 0; bbi < Math.min(5, breath.b.length); bbi++) {
            breathPairs[bbi][1] = Math.max(80, breath.b[bbi] * brBwScale);
          }
        }
        var brTnLevel = bp ? bp.tnLevel : 0.085;
        var brTnLp = bp ? bp.tnLpHz : 3800;
        var brTn = (!timingOnly && studioMode) ? tractNoiseGain(breathPairs, timbre, brTnLevel, brTnLp, 2)
          : (!timingOnly && bp && bp.stdTnLevel) ? tractNoiseGain(breathPairs, timbre, bp.stdTnLevel, brTnLp, 2) : 0;
        ev.push({ t0: note._start, t1: note._end, kind: 'B',
          pairs: breathPairs, av: 0, fric: breath.na.g,
          tn: brTn,
          tnLpHz: (studioMode || (bp && bp.stdTnLevel)) ? brTnLp : 0,
          fc: breath.na.f, fbw: breath.na.b, nasal: breath.nz || 0,
          brProfile: bp });
        tail = { b: ev.length - 1, note: note };
        soundEnd = note._end;
        prevChain = null;
        continue;
      }
      var chainEnd = n;
      while (chainEnd + 1 < notes.length && NSG.TUNING.connected(notes[chainEnd], notes[chainEnd + 1])) chainEnd++;
      var noteInfo = notePhonesInfo(note);
      var phones = noteInfo.phones;
      var noteLang = note.lang || lang;
      function notePhone(id) {
        var p = NSG.phoneOf(id);
        if (noteLang !== 'en') return p;
        // GenAm /u/: avoid double lip-rounding on cardinal [u] so F1 stays above F0 on high notes.
        if (id === 'u') return { t: 'V', f: [335, 1040, 2260], b: [70, 92, 132], nz: 0, lip: 0.04 };
        // GenAm /r/: lower F1 and tighten F3-F2 spacing for dark/bunched rhotic onset.
        if (id === 'rj') return { t: 'G', f: [340, 1200, 1620], b: p.b, nz: 0, lip: 0.03 };
        return p;
      }
      /* 分段速度下不能乘常量 spb：起音点与时长都按速度表换算 */
      var start = tm.secOf(note.start);
      var endNote = notes[chainEnd];
      var endSec = tm.secOf(endNote.start + endNote.dur);
      var dur = Math.max(1 / SR, endSec - start);

      var nuc = noteInfo.nuc;
      var nuclei = noteInfo.nuclei;
      var preN = noteInfo.preN;

      var prevCodaId = prevChain && Math.abs(prevChain.endSec - start) < 1e-4 ? prevChain.codaId : '';
      var nextOnsetId = '';
      var nextNote = chainEnd + 1 < notes.length ? notes[chainEnd + 1] : null;
      if (nextNote && !NSG.TUNING.isRest(nextNote) && !NSG.TUNING.isBreath(nextNote) &&
          Math.abs(endSec - tm.secOf(nextNote.start)) < 1e-4) {
        var nextInfo = notePhonesInfo(nextNote);
        if (nextInfo.preN > 0) nextOnsetId = nextInfo.phones[0];
      }
      var geminateRole = new Array(phones.length).fill('');
      for (var gi = 0; gi < phones.length; gi++) {
        if (gi === 0 && gi < preN && prevCodaId && isGeminatePair(prevCodaId, phones[0])) {
          geminateRole[gi] = 'second';
        } else if (gi > 0 && geminateRole[gi - 1] === 'first') {
          geminateRole[gi] = 'second';
        }
        if (noteInfo.hasVowel && gi > nuclei[0] && nuclei.indexOf(gi) < 0 && NSG.phoneOf(phones[gi]).t !== 'V') {
          var nextC = gi + 1 < phones.length
            ? (nuclei.indexOf(gi + 1) < 0 && NSG.phoneOf(phones[gi + 1]).t !== 'V' ? phones[gi + 1] : '')
            : (gi > nuc ? nextOnsetId : '');
          if (geminateRole[gi] !== 'second' && nextC) {
            if (isGeminatePair(phones[gi], nextC)) geminateRole[gi] = 'first';
          }
        }
      }

      // Only consonants change length; vowel glides retain their own timing.
      var consScale = NSG.TUNING.consonantScale(note);
      var isEnglish = /^(en|de|pl|ru|uk)$/.test(note.lang || lang);
      var isRomance = /^(es|pt|it|fr|ro)$/.test(noteLang);
      var isEsperanto = noteLang === 'eo';
      var isMandarinLike = noteLang === 'zh' || noteLang === 'zh-x-sichuan';
      function studioZhVowelPhone(phonesList, idx, nucIdx, phBase) {
        if (!(studioMode && isMandarinLike && phBase && phBase.t === 'V')) return phBase;
        var id = phonesList[idx];
        if (id === 'a') {
          return { t: 'V', f: [740, 1290, 2480], b: [70, 92, 132], nz: 0, lip: 0 };
        }
        if (id === 'E' && idx + 1 < phonesList.length && phonesList[idx + 1] === 'n') {
          return { t: 'V', f: [565, 1460, 2480], b: [70, 92, 132], nz: 0, lip: 0 };
        }
        if (id === 'e' && idx > 0 && phonesList[idx - 1] === 'u_medial' && idx + 1 < phonesList.length && phonesList[idx + 1] === 'I') {
          return { t: 'V', f: [440, 1280, 2420], b: [70, 92, 132], nz: 0, lip: 0.03 };
        }
        if (id === 'u_medial' && idx + 1 < phonesList.length && phonesList[idx + 1] === 'o') {
          return { t: 'V', f: [365, 860, 2400], b: [72, 102, 145], nz: 0, lip: 0.14 };
        }
        if (id === 'o' && idx > 0 && phonesList[idx - 1] === 'u_medial') {
          return { t: 'V', f: [495, 915, 2440], b: [70, 92, 132], nz: 0, lip: 0.07 };
        }
        if (id === 'o_ou') {
          return { t: 'V', f: [475, 1040, 2450], b: [70, 92, 132], nz: 0, lip: 0.04 };
        }
        if (id === 'U_ou') {
          return { t: 'V', f: [360, 820, 2320], b: [70, 92, 132], nz: 0, lip: 0.09, coda: 0.160, glide: true };
        }
        if (id === 'Ao') {
          return { t: 'V', f: [725, 1140, 2440], b: [70, 92, 132], nz: 0, lip: 0 };
        }
        if (idx > nucIdx && id === 'I') {
          return { t: 'V', f: [350, 2140, 2750], b: [70, 92, 132], nz: 0, lip: 0, coda: phBase.coda, glide: phBase.glide };
        }
        if (id === '7') {
          if (idx > 0 && /^(g|kh|h)$/.test(phonesList[idx - 1])) {
            return { t: 'V', f: [450, 1290, 2500], b: [70, 94, 134], nz: 0, lip: 0 };
          }
          return { t: 'V', f: [470, 1360, 2540], b: [70, 94, 134], nz: 0, lip: 0 };
        }
        return phBase;
      }
      function notePhoneAt(idx) {
        return studioZhVowelPhone(phones, idx, nuc, notePhone(phones[idx]));
      }
      function locusResolve(id, idx) {
        return idx !== undefined ? notePhoneAt(idx) : notePhone(id);
      }
      var zhNasalCoda = isMandarinLike && nuc === phones.length - 2 &&
        NSG.phoneOf(phones[nuc]).t === 'V' && /^(n|ng)$/.test(phones[phones.length - 1]) ? phones[phones.length - 1] : '';
      function isGermanAspStop(index) {
        if ((note.lang || lang) !== 'de' || index >= nuclei[0] || !/^(p|t|k)$/.test(phones[index])) return false;
        if (index > 0 && /^(s|sh)$/.test(phones[index - 1])) return false;
        var nextId = phones[index + 1];
        if (!nextId) return false;
        var nextPh = NSG.phoneOf(nextId);
        return (nextPh.t === 'V' && !nextPh.glide) || nextPh.t === 'L' || nextPh.t === 'G' || /^(v|r_de)$/.test(nextId);
      }
      function stopClosureRatio(index) {
        var phone = NSG.phoneOf(phones[index]);
        if (phone.t === 'A') {
          if (isMandarinLike && index < nuclei[0]) {
            if (phones[index] === 'ts_r') return 0.40;
            if (phones[index] === 'tsh_j') return studioMode ? 0.26 : 0.18;
          }
          return phone.closure === undefined ? 0.30 : phone.closure;
        }
        return isGermanAspStop(index) ? 0.36 : (phone.closure === undefined ? 0.62 : phone.closure);
      }
      function baseSegmentDur(index) {
        var d0 = articulationDur(index), phone = NSG.phoneOf(phones[index]);
        // Shared singing defaults: friction needs room in every language,
        // including palatalized/long variants and language-specific overrides.
        return d0 * (phone.t === 'F' ? 1.18 : phone.t === 'A' ? 1.15 : 1);
      }
      function articulationDur(index) {
        var phone = NSG.phoneOf(phones[index]);
        var clear = clearSonorant(phones[index], note.lang || lang, index < nuclei[0]);
        if (clear === 'N' && phones[index] !== 'm') return 0.090 * consScale;
        if (clear === 'T') return 0.042 * consScale;
        if (clear === 'L') return 0.082 * consScale;
        // 韵尾保留可辨认的持阻段；短音仍受原有 55% 预算约束，声母 n 不受影响。
        if (zhNasalCoda && index === phones.length - 1) {
          if (studioMode) {
            var nCodaDur = zhNasalCoda === 'n'
              ? Math.min(0.250, 0.075 + Math.max(0, dur - 0.35) * 0.14)
              : Math.min(0.340, 0.095 + Math.max(0, dur - 0.35) * 0.18);
            return nCodaDur * consScale;
          }
          return (zhNasalCoda === 'n' ? 0.105 : 0.125) * consScale;
        }
        // 留出可辨认的唇齿擦音尾；短音仍服从 55% 的辅音总预算。
        if ((isEnglish || isRomance || isEsperanto) && /^(f|fy_ru)$/.test(phones[index])) return 0.115 * consScale;
        if ((isEnglish || isRomance || isEsperanto || noteLang === 'tlh') && /^(v|vy_ru)$/.test(phones[index])) return 0.095 * consScale;
        if (isGermanAspStop(index)) return (phones[index] === 't' ? 0.092 : 0.098) * consScale;
        function adaptiveMedialDur(base, cap, shortFrac) {
          if (dur > 0.50) return Math.min(cap, base + (dur - 0.50) * (cap - base));
          return Math.min(base, dur * shortFrac);
        }
        var zhShortScale = (isMandarinLike && index < preN &&
          (phone.t === 'F' || phone.t === 'A' || (phone.t === 'S' && phone.asp)) && dur < 0.18) ?
          (dur <= 0.08 ? 0.78 : 0.78 + 0.22 * ((dur - 0.08) / 0.10)) : 1;
        if (isMandarinLike && phones[index] === 'tsh_j' && index < nuclei[0]) {
          var qBase = studioMode
            ? (dur >= 0.25 ? 0.125 : dur <= 0.12 ? 0.105 : 0.105 + 0.020 * ((dur - 0.12) / 0.13))
            : (dur >= 0.25 ? 0.165 : dur <= 0.12 ? 0.135 : 0.135 + 0.030 * ((dur - 0.12) / 0.13));
          return qBase * consScale * zhShortScale;
        }
        if (studioMode && isMandarinLike && index < nuclei[0] && /^(ts|ts_j|ts_r)$/.test(phones[index])) {
          var uAffrBase = phones[index] === 'ts' ? 0.068 : phones[index] === 'ts_j' ? 0.072 : 0.080;
          return uAffrBase * consScale * zhShortScale;
        }
        if (index < nuc) {
          if (phones[index] === 'u_medial') {
            if (studioMode && isMandarinLike && phones[index + 1] === 'o' && index > 0 && phones[index - 1] === 'l_zh') {
              return Math.min(0.036, Math.max(0.022, adaptiveMedialDur(0.032, 0.036, 0.24)));
            }
            return (studioMode && isMandarinLike) ? adaptiveMedialDur(0.056, 0.085, 0.36) : adaptiveMedialDur(0.045, 0.065, 0.35);
          }
          if (phones[index] === 'u_labial') return adaptiveMedialDur(0.050, 0.070, 0.35);
          if (phones[index] === 'y_medial') return adaptiveMedialDur(0.055, 0.075, 0.38);
          if (phones[index] === 'y_ue') return adaptiveMedialDur(0.085, 0.110, 0.40);
          if (studioMode && isMandarinLike && phones[index] === 'i') return adaptiveMedialDur(0.055, 0.085, 0.34);
        }
        if (/^(hak|nan-x-teochew)$/.test(noteLang) && index > nuc && /^(i|u)(~)?$/.test(phones[index])) return 0.090;
        if (studioMode && isMandarinLike && index > nuc) {
          if (phones[index] === 'I') return Math.max(0.088, Math.min(0.135, dur * 0.44));
          if (phones[index] === 'U_a') return Math.max(0.110, Math.min(0.220, dur * 0.38));
          if (phones[index] === 'U_ou') return Math.max(0.115, Math.min(0.215, dur * 0.38));
          if (phones[index] === 'U') return Math.max(0.095, Math.min(0.185, dur * 0.36));
        }
        return phoneDur(phone, phone.glide ? 'coda' : index < nuc ? 'onset' : 'coda') * (phone.t === 'V' ? 1 : consScale * zhShortScale);
      }
      function segmentDur(index) {
        var d0 = baseSegmentDur(index), role = geminateRole[index], phone = NSG.phoneOf(phones[index]);
        if (role === 'first') {
          // Finnish and Italian geminates extend the hold before the single release; stops extend closure,
          // and the Finnish trill keeps trilling across both halves.
          if (phone.t === 'S' || phone.t === 'A') return d0 * stopClosureRatio(index) * (noteLang === 'fi' ? 1.8 : noteLang === 'it' ? 1.65 : 0.50);
          return d0 * (noteLang === 'fi' ? 1 : noteLang === 'it' ? 0.95 : 0.45);
        }
        if (role === 'second') {
          if (phone.t === 'S' || phone.t === 'A') return d0 * (1 - 0.50 * stopClosureRatio(index));
          if (noteLang === 'fi' && phone.t === 'T') return d0;
          return d0 * 0.60;
        }
        return d0;
      }
      /* 辅音前置（对拍）：节拍落在“辅元交界”上，声母整体排在音符起点之前，
         向前面的空白、呼吸或上一个字的元音尾借时间；只有借不够时才落进本音符（迟到）。
         韵尾和词内辅音仍在音符内部，受 55% 的辅音总预算约束。 */
      function minOnsetDur(index, rawDur) {
        var phone = NSG.phoneOf(phones[index]), t = phone.t, ratio, floor;
        if (t === 'F') { ratio = 0.45; floor = 0.032; }
        else if (t === 'A') { ratio = 0.50; floor = 0.045; }
        else if (t === 'S') {
          var asp = !!(phone.asp || isGermanAspStop(index));
          ratio = asp ? 0.55 : 0.65;
          floor = asp ? 0.048 : 0.032;
        } else if (t === 'N' || t === 'L' || t === 'G') { ratio = 0.50; floor = 0.028; }
        else if (t === 'T' || t === 'Q') { ratio = 0.70; floor = 0.022; }
        else { ratio = 0.70; floor = 0.030; }
        return Math.min(rawDur, Math.max(rawDur * ratio, Math.min(rawDur, floor)));
      }
      function hardOnsetDur(index, rawDur, prefMin) {
        var phone = NSG.phoneOf(phones[index]), t = phone.t, ratio, floor;
        if (t === 'F') { ratio = 0.25; floor = 0.032; }
        else if (t === 'A') { ratio = 0.34; floor = 0.042; }
        else if (t === 'S') {
          var asp = !!(phone.asp || isGermanAspStop(index));
          ratio = asp ? 0.40 : 0.50;
          floor = asp ? 0.038 : 0.026;
        } else if (t === 'N' || t === 'L' || t === 'G') { ratio = 0.35; floor = 0.024; }
        else if (t === 'T' || t === 'Q') { ratio = 0.55; floor = 0.018; }
        else { ratio = 0.55; floor = 0.024; }
        return Math.min(prefMin, Math.max(rawDur * ratio, Math.min(rawDur, floor)));
      }
      function minCodaEventDur(e, isEarly) {
        var d0 = e.t1 - e.t0, ratio, floor;
        if (e.kind === 'F' && !e.release) { ratio = 0.50; floor = 0.036; }
        else if (e.kind === 'F' && e.release) { ratio = 0.65; floor = 0.012; }
        else if (e.kind === 'S' || e.kind === 'VB') { ratio = 0.65; floor = 0.018; }
        else if (e.kind === 'N' || e.kind === 'G') { ratio = 0.55; floor = 0.032; }
        else if (e.kind === 'V') { ratio = isEarly ? 0.50 : (studioMode && e.glideFrom ? 0.72 : 0.65); floor = isEarly ? 0.034 : (studioMode && e.glideFrom ? 0.058 : 0.048); }
        else { ratio = 0.65; floor = 0.020; }
        return Math.min(d0, Math.max(d0 * ratio, Math.min(d0, floor)));
      }
      function hardCodaEventDur(e, prefMin, isEarly) {
        var d0 = e.t1 - e.t0, ratio, floor;
        if (e.kind === 'F' && !e.release) { ratio = 0.30; floor = 0.028; }
        else if (e.kind === 'F' && e.release) { ratio = 0.45; floor = 0.010; }
        else if (e.kind === 'S' || e.kind === 'VB') { ratio = 0.45; floor = 0.014; }
        else if (e.kind === 'N' || e.kind === 'G') { ratio = 0.35; floor = 0.024; }
        else if (e.kind === 'V') { ratio = isEarly ? 0.38 : (studioMode && e.glideFrom ? 0.55 : 0.42); floor = isEarly ? 0.024 : (studioMode && e.glideFrom ? 0.044 : 0.028); }
        else { ratio = 0.45; floor = 0.016; }
        return Math.min(prefMin, Math.max(d0 * ratio, Math.min(d0, floor)));
      }
      var onsetRaw = 0, onsetMin = 0, onsetHard = 0, inRaw = 0;
      var onsetDurs = new Array(preN), onsetMins = new Array(preN), onsetHards = new Array(preN);
      for (var c = 0; c < phones.length; c++) if (nuclei.indexOf(c) < 0) {
        var sd = segmentDur(c);
        if (c < preN) {
          var md = minOnsetDur(c, sd);
          var hd = hardOnsetDur(c, sd, md);
          onsetDurs[c] = sd;
          onsetMins[c] = md;
          onsetHards[c] = hd;
          onsetRaw += sd;
          onsetMin += md;
          onsetHard += hd;
        } else inRaw += sd;
      }
      var onsetSlack1 = onsetRaw - onsetMin;
      var onsetSlack2 = onsetMin - onsetHard;
      var lastEv = ev.length ? ev[ev.length - 1] : null;
      var prevEnd = lastEv ? lastEv.t1 : 0;
      var gap = Math.max(0, start - prevEnd), borrowMax = 0, borrowEv = null, borrowIdx = -1, bodyStart = -1;
      var codaRaw = 0, prevTier1 = 0, prevTier2 = 0, prevSlacks1 = null, prevSlacks2 = null;
      if (tail && tail.v !== undefined && tail.end === ev.length) {
        borrowIdx = tail.v;
        bodyStart = tail.bodyStart !== undefined && tail.bodyStart <= borrowIdx ? tail.bodyStart : borrowIdx;
        borrowEv = ev[borrowIdx];
        var vLen = borrowEv.t1 - borrowEv.t0;
        borrowMax = Math.max(0, Math.min(vLen * 0.55, vLen - 0.03));
        if (!tail.locked && (bodyStart < borrowIdx || borrowIdx + 1 < ev.length)) {
          prevSlacks1 = new Array(ev.length - bodyStart);
          prevSlacks2 = new Array(ev.length - bodyStart);
          for (var cs = bodyStart; cs < ev.length; cs++) {
            var sIdx = cs - bodyStart;
            if (cs === borrowIdx) { prevSlacks1[sIdx] = 0; prevSlacks2[sIdx] = 0; continue; }
            var cEv = ev[cs], cDur = cEv.t1 - cEv.t0, isEarly = cs < borrowIdx;
            var prefC = minCodaEventDur(cEv, isEarly);
            var hardC = hardCodaEventDur(cEv, prefC, isEarly);
            var sl1 = Math.max(0, cDur - prefC);
            var sl2 = Math.max(0, prefC - hardC);
            prevSlacks1[sIdx] = sl1;
            prevSlacks2[sIdx] = sl2;
            if (!isEarly) codaRaw += cDur;
            prevTier1 += sl1;
            prevTier2 += sl2;
          }
        }
      } else if (tail && tail.b === ev.length - 1) {
        borrowIdx = tail.b;
        bodyStart = borrowIdx;
        borrowEv = ev[borrowIdx];
        borrowMax = (borrowEv.t1 - borrowEv.t0) * 0.5;
      } else if (tail && tail.q === ev.length - 1) {
        borrowIdx = tail.q;
        bodyStart = borrowIdx;
        borrowEv = ev[borrowIdx];
        var qLen = borrowEv.t1 - borrowEv.t0;
        borrowMax = Math.max(0, Math.min(qLen * 0.75, qLen - 0.015));
      }
      // A manually timed syllable keeps its boundaries when the next onset is scheduled.
      if (tail && tail.locked) { borrowMax = 0; prevTier1 = 0; prevTier2 = 0; prevSlacks1 = null; prevSlacks2 = null; }
      // On closed or multi-nucleus syllables, protect the final nucleus before dipping into hard borrowMax
      // so the preceding body and incoming cluster yield jointly instead of collapsing one segment.
      var softBorrowMax = borrowEv ? (
        codaRaw > 0
          ? Math.max(0, Math.min(borrowMax, (borrowEv.t1 - borrowEv.t0) - Math.max(0.03, ((borrowEv.t1 - borrowEv.t0) + codaRaw) * 0.35)))
          : (bodyStart >= 0 && bodyStart < borrowIdx
            ? Math.max(0, Math.min(borrowMax, (borrowEv.t1 - borrowEv.t0) - Math.max(0.03, Math.min(0.060, (borrowEv.t1 - borrowEv.t0) * 0.75))))
            : borrowMax)
      ) : 0;
      var extraBorrowMax = Math.max(0, borrowMax - softBorrowMax);
      var softRoom = gap + softBorrowMax;
      var maxRoom = gap + borrowMax + prevTier1 + prevTier2;
      var pre = 0, late = 0;
      if (onsetRaw > 0) {
        if (softRoom >= onsetRaw) {
          pre = onsetRaw;
        } else if (!lastEv) {
          // 歌曲开头（前面只有 0 时刻）不压辅音，只能迟到。
          pre = Math.min(gap, onsetRaw);
          late = onsetRaw - pre;
        } else {
          var deficit = onsetRaw - softRoom;
          var clusterSlack1 = prevTier1 + onsetSlack1;
          if (deficit <= clusterSlack1) {
            var alpha1 = clusterSlack1 > 0 ? deficit / clusterSlack1 : 0;
            for (var oc = 0; oc < preN; oc++) onsetDurs[oc] -= alpha1 * (onsetDurs[oc] - onsetMins[oc]);
            pre = onsetRaw - alpha1 * onsetSlack1;
          } else {
            var rem1 = deficit - clusterSlack1;
            if (rem1 <= extraBorrowMax) {
              for (var oc2 = 0; oc2 < preN; oc2++) onsetDurs[oc2] = onsetMins[oc2];
              pre = softRoom + prevTier1 + rem1;
            } else {
              var rem2 = rem1 - extraBorrowMax;
              var clusterSlack2 = prevTier2 + onsetSlack2;
              if (rem2 <= clusterSlack2) {
                var alpha2 = clusterSlack2 > 0 ? rem2 / clusterSlack2 : 0;
                for (var oc2b = 0; oc2b < preN; oc2b++) onsetDurs[oc2b] = onsetMins[oc2b] - alpha2 * (onsetMins[oc2b] - onsetHards[oc2b]);
                pre = onsetMin - alpha2 * onsetSlack2;
              } else {
                for (var oc2c = 0; oc2c < preN; oc2c++) onsetDurs[oc2c] = onsetHards[oc2c];
                pre = maxRoom;
                late = Math.max(0, onsetHard - pre);
              }
            }
          }
        }
      }
      var cap = dur * 0.55, inTotal = inRaw + late;
      var f = inTotal > cap && inTotal > 0 ? cap / inTotal : 1;
      if (late > 0 && f < 1) {
        var prevOnsetTotal = pre + late;
        late *= f;
        var onsetScale = prevOnsetTotal > 0 ? (pre + late) / prevOnsetTotal : 1;
        for (var oc3 = 0; oc3 < preN; oc3++) onsetDurs[oc3] *= onsetScale;
      }
      // CHIMERA-style Mandarin rising medial straddling: advance part of the medial glide
      // into available pre-beat room so the main vowel lands near the beat (avoiding "ku-ai / li-ang").
      var medialPre = 0;
      if (isMandarinLike && !NSG.LEGACY_SOUND && resolveArticMorph(timbre) > 0 &&
          late === 0 && !(tail && tail.locked) && preN > 0 && preN < nuc &&
          /^(u_medial|u_labial|y_medial|y_ue|i)$/.test(phones[preN]) &&
          notePhone(phones[nuc]).t === 'V') {
        var availMedialRoom = Math.max(0, (lastEv ? softRoom : gap) - pre);
        if (availMedialRoom > 0.002) {
          var mDur = segmentDur(preN) * f;
          var mShare = phones[preN] === 'y_ue' ? 0.45 : 0.65;
          medialPre = Math.min(availMedialRoom, mDur * mShare);
          pre += medialPre;
        }
      }
      // Persist relative beats, so moving notes and changing tempo keeps edits aligned.
      // A changed pronunciation/language cannot accidentally reuse another phone's timing.
      var timing = note.phonemeTiming, manualTimes = null;
      if (timing && timing.lang === (note.lang || lang) &&
          samePhonesList(timing.phones, phones) &&
          Array.isArray(timing.boundaries) && timing.boundaries.length === phones.length + 1 &&
          timing.boundaries.every(function (b, index, list) {
            return Number.isFinite(b) && (!index || b > list[index - 1]);
          })) {
        var span = endNote.start + endNote.dur - note.start;
        var scale = Number.isFinite(timing.span) && timing.span > 0 ? span / timing.span : 1;
        var finalTime = tm.secOf(endNote.start + endNote.dur);
        var earliest = Math.max(0, start - maxRoom);
        var minPhone = Math.min(0.001, (finalTime - earliest) / (phones.length * 2));
        manualTimes = timing.boundaries.map(function (b) { return tm.secOf(note.start + (b > 0 ? b * scale : b)); });
        for (var mt = 0; mt < manualTimes.length; mt++) {
          manualTimes[mt] = Math.max(mt ? manualTimes[mt - 1] + minPhone : earliest,
            Math.min(finalTime - (phones.length - mt) * minPhone, manualTimes[mt]));
        }
        medialPre = 0;
        pre = start - manualTimes[0];
      }
      var need = Math.max(0, pre - gap);
      var borrow = Math.min(softBorrowMax, need);
      var remNeed = Math.max(0, need - borrow);
      var prevTier1Shrink = Math.min(prevTier1, remNeed);
      remNeed = Math.max(0, remNeed - prevTier1Shrink);
      var extraBorrow = Math.min(extraBorrowMax, remNeed);
      borrow += extraBorrow;
      remNeed = Math.max(0, remNeed - extraBorrow);
      var prevTier2Shrink = Math.min(prevTier2, remNeed);
      if ((borrow > 0 || prevTier1Shrink > 0 || prevTier2Shrink > 0) && borrowEv) {
        var alpha1Prev = prevTier1 > 0 && prevTier1Shrink > 0 ? Math.min(1, prevTier1Shrink / prevTier1) : 0;
        var alpha2Prev = prevTier2 > 0 && prevTier2Shrink > 0 ? Math.min(1, prevTier2Shrink / prevTier2) : 0;
        var prevT = ev[bodyStart].t0;
        for (var sh = bodyStart; sh < ev.length; sh++) {
          var evSh = ev[sh];
          var oldDur = evSh.t1 - evSh.t0;
          var newDur;
          if (sh === borrowIdx) {
            newDur = oldDur - borrow;
          } else {
            var sIdx2 = sh - bodyStart;
            newDur = oldDur - (prevSlacks1 ? alpha1Prev * prevSlacks1[sIdx2] : 0) - (prevSlacks2 ? alpha2Prev * prevSlacks2[sIdx2] : 0);
          }
          evSh.t0 = prevT;
          evSh.t1 = prevT + newDur;
          prevT = evSh.t1;
        }
        if (borrowEv.kind === 'B') { tail.note._end -= borrow; soundEnd = tail.note._end; }
      }
      var noteEv0 = ev.length;

      // Work in seconds so the same performed gap behaves alike at every tempo.
      // An onset consonant already borrows time; a bare vowel can use a little
      // of the empty interval before its beat, without moving later phones.
      var joinWindow = 0.024, joinStrength = 0, vowelPickup = 0;
      if (prevChain && !manualTimes && !(tail && tail.locked) && !geminateRole[0] &&
          notes[n - 1].lyricGroup === note.lyricGroup) {
        var scoreGap = start - prevChain.endSec;
        if (scoreGap > -1e-4 && scoreGap < joinWindow) {
          var joinSpan = joinWindow;
          if (notePhone(phones[0]).t === 'V' && lastEv && lastEv.av > 0 &&
              lastEv.kind !== 'F' && lastEv.kind !== 'VB') {
            // Meet the previous voice for gaps up to half the window. Beyond
            // that, return the pickup to zero as the audible silence grows.
            vowelPickup = Math.min(gap, joinWindow - Math.max(0, scoreGap));
            joinSpan *= 0.5;
          }
          var proximity = Math.max(0, 1 - Math.max(0, scoreGap) / joinSpan);
          joinStrength = proximity * proximity * (3 - 2 * proximity);
        }
      }
      var cur = start - pre - vowelPickup;
      function singingJoin(firstEvent, phoneIndex) {
        if (manualTimes || !firstEvent) return;
        if (isMandarinLike && phoneIndex > 0 && phoneIndex === nuc && notePhone(phones[phoneIndex]).t === 'V') {
          var prevMedial = phones[phoneIndex - 1];
          if (phones[phoneIndex] === 'oU' && prevMedial === 'i') {
            firstEvent.singingLead = 0.040;
            firstEvent.singingFade = 0.040;
            firstEvent.singingLeadFrac = 0.40;
            firstEvent.singingFadeFrac = 0.45;
            firstEvent.singingPrevFrac = 0.89;
            return;
          }
          if (prevMedial === 'i' || prevMedial === 'u_medial') {
            firstEvent.singingLead = 0.022;
            firstEvent.singingFade = 0.026;
            firstEvent.singingLeadFrac = 0.35;
            firstEvent.singingFadeFrac = 0.35;
            firstEvent.singingPrevFrac = 0.50;
            return;
          }
          if (prevMedial === 'y_medial' || prevMedial === 'u_labial') {
            firstEvent.singingLead = 0.024;
            firstEvent.singingFade = 0.028;
            firstEvent.singingLeadFrac = 0.35;
            firstEvent.singingFadeFrac = 0.35;
            firstEvent.singingPrevFrac = 0.49;
            return;
          }
          if (prevMedial === 'y_ue') {
            firstEvent.singingLead = 0.026;
            firstEvent.singingFade = 0.030;
            firstEvent.singingLeadFrac = 0.35;
            firstEvent.singingFadeFrac = 0.35;
            firstEvent.singingPrevFrac = 0.35;
            return;
          }
        }
        if (phoneIndex !== 0 || joinStrength <= 0) return;
        var ph0 = notePhone(phones[0]), voiced0 = ph0.na && ph0.na.v;
        var lead = ph0.t === 'V' ? 0.024 : /^(N|L|G)$/.test(ph0.t) ? 0.020 :
          ph0.t === 'F' ? (voiced0 ? 0.026 : 0.030) : ph0.t === 'A' ? 0.012 :
          ph0.t === 'T' ? 0.006 : ph0.t === 'S' && voiced0 ? 0.010 : 0;
        var fade = ph0.t === 'V' ? 0.024 :
          /^(S|A|T)$/.test(ph0.t) ? 0.008 : ph0.t === 'F' ? 0.026 : 0.018;
        var leadFrac = 0.40, fadeFrac = 0.30;
        if (isMandarinLike) {
          if (phones[0] === 'm') {
            lead = 0.040; fade = 0.040; leadFrac = 0.58; fadeFrac = 0.58;
          } else if (phones[0] === 'n' && 0 < nuclei[0]) {
            lead = 0.025; fade = 0.022; leadFrac = 0.38; fadeFrac = 0.30;
          } else if (phones[0] === 'l_zh' && 0 < nuclei[0]) {
            if (studioMode) {
              lead = 0.012; fade = 0.010; leadFrac = 0.20; fadeFrac = 0.16;
            } else {
              lead = 0.024; fade = 0.020; leadFrac = 0.38; fadeFrac = 0.30;
            }
          } else if (phones[0] === 'r' && 0 < nuclei[0]) {
            lead = 0.026; fade = 0.024; leadFrac = 0.45; fadeFrac = 0.42;
          } else if ((phones[0] === 'w' || phones[0] === 'jj') && 0 < nuclei[0]) {
            lead = 0.028; fade = 0.024; leadFrac = 0.60; fadeFrac = 0.52;
          } else if (phones[0] === 'h' && 0 < nuclei[0]) {
            fade = 0.060; fadeFrac = 0.60;
          } else if (studioMode && /^(tsh|tsh_r|tsh_j|ts|ts_r|ts_j)$/.test(phones[0]) && 0 < nuclei[0]) {
            lead = 0; fade = 0;
          } else if (phones[0] === 'tsh' && 0 < nuclei[0]) {
            lead = 0.024; fade = 0.015; leadFrac = 0.74; fadeFrac = 0.46;
          } else if (phones[0] === 'tsh_r' && 0 < nuclei[0]) {
            lead = 0.025; fade = 0.017; leadFrac = 0.72; fadeFrac = 0.49;
          } else if (phones[0] === 'tsh_j' && 0 < nuclei[0]) {
            lead = 0.025; fade = 0.016; leadFrac = 0.74; fadeFrac = 0.48;
          }
        }
        if (lead > 0) {
          firstEvent.singingLead = lead;
          firstEvent.singingFade = fade;
          firstEvent.singingLeadFrac = leadFrac;
          firstEvent.singingFadeFrac = fadeFrac;
          firstEvent.singingPrevFrac = 0.25;
          firstEvent.singingStrength = joinStrength;
        }
      }
      var vowelBudget = dur + medialPre - inRaw * f - late;
      var headBudget = vowelBudget * Math.min(1, (tm.secOf(note.start + note.dur) - start) / dur);
      var earlyVowel = headBudget / nuclei.length;
      var nucDurs = null;
      if (noteLang === 'de' && noteInfo.hasVowel && nuclei.length > 1) {
        var syllCount = 0;
        for (var si = 0; si < nuclei.length; si++) if (NSG.phoneOf(phones[nuclei[si]]).syllabic) syllCount++;
        if (syllCount > 0 && syllCount < nuclei.length) {
          nucDurs = {};
          var syllDur = Math.min(0.16, vowelBudget * 0.28);
          var mainDur = (vowelBudget - syllDur * syllCount) / (nuclei.length - syllCount);
          nuclei.forEach(function (index) {
            nucDurs[index] = NSG.phoneOf(phones[index]).syllabic ? syllDur : mainDur;
          });
        }
      } else if (nuclei.length > 1 && (noteLang === 'fi' || (noteLang === 'en' && note._stressByPhone))) {
        var weights = nuclei.map(function (index) {
          if (noteLang === 'fi') return NSG.phoneOf(phones[index]).vowelWeight || 1;
          // Scale just the vowel budget on this note; sustain beats belong to the final nucleus.
          return [1, 1.5, 1.2][note._stressByPhone[index]];
        });
        var totalWeight = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
        if (totalWeight > nuclei.length) {
          nucDurs = {};
          nuclei.forEach(function (index, i) { nucDurs[index] = headBudget * weights[i] / totalWeight; });
          nucDurs[nuc] += vowelBudget - headBudget;
        }
      }
      if (timingOnly) {
        var tFirstNuc = -1, tLastNuc = -1, tLastVowel = -1, tLastSonorant = -1;
        for (var tc2 = 0; tc2 < phones.length; tc2++) {
          var tPhoneEv0 = ev.length;
          var tph = notePhone(phones[tc2]);
          var td = nuclei.indexOf(tc2) < 0 ? (tc2 < preN ? onsetDurs[tc2] : segmentDur(tc2) * f)
            : nucDurs && nucDurs[tc2] !== undefined ? nucDurs[tc2] : tc2 === nuc ? vowelBudget - earlyVowel * (nuclei.length - 1) : earlyVowel;
          if (tc2 === 0) td += vowelPickup;
          var tt0 = manualTimes ? manualTimes[tc2] : cur, tt1 = manualTimes ? manualTimes[tc2 + 1] : cur + td;
          if (manualTimes) td = tt1 - tt0;
          if (tph.t === 'V') {
            ev.push({ t0: tt0, t1: tt1, kind: 'V', av: 1 });
            tLastVowel = tPhoneEv0;
            if (nuclei.indexOf(tc2) >= 0) {
              if (tFirstNuc < 0) tFirstNuc = tPhoneEv0;
              tLastNuc = tPhoneEv0;
            }
          } else if (tph.t === 'N') {
            ev.push({ t0: tt0, t1: tt1, kind: 'N', av: 1 });
            if (nuclei.indexOf(tc2) >= 0) {
              if (tFirstNuc < 0) tFirstNuc = tPhoneEv0;
              tLastSonorant = tPhoneEv0;
            }
          } else if (tph.t === 'Q') ev.push({ t0: tt0, t1: tt1, kind: 'S', av: 0 });
          else if (tph.t === 'L' || tph.t === 'G') {
            ev.push({ t0: tt0, t1: tt1, kind: 'G', av: 1 });
            if (nuclei.indexOf(tc2) >= 0) {
              if (tFirstNuc < 0) tFirstNuc = tPhoneEv0;
              tLastSonorant = tPhoneEv0;
            }
          }
          else if (tph.t === 'T') {
            if (geminateRole[tc2] === 'first' && !(noteLang === 'fi' && tph.t === 'T')) ev.push({ t0: tt0, t1: tt1, kind: 'G', av: 1 });
            else {
              var tClear = clearSonorant(phones[tc2], noteLang, tc2 < nuclei[0]);
              var tTaps = tph.taps || 1, tTapDur = td / tTaps;
              var tTapRel = Math.min(tClear === 'T' ? 0.012 : 0.008, tTapDur * 0.3);
              var tTapStart = tt0;
              for (var tTap = 1; tTap <= tTaps; tTap++) {
                var tTapEnd = tTap === tTaps ? tt1 : tt0 + tTap * tTapDur;
                ev.push({ t0: tTapStart, t1: tTapEnd - tTapRel, kind: 'G', av: 1 });
                ev.push({ t0: tTapEnd - tTapRel, t1: tTapEnd, kind: 'F', release: true, av: 1 });
                tTapStart = tTapEnd;
              }
            }
          } else if (tph.t === 'F') {
            ev.push({ t0: tt0, t1: tt1, kind: 'F', av: tph.na && tph.na.v ? 1 : 0 });
          } else if (tph.t === 'A') {
            var tvAffricate = !!(tph.na && tph.na.v);
            if (geminateRole[tc2] === 'first') ev.push({ t0: tt0, t1: tt1, kind: tvAffricate ? 'VB' : 'S', av: tvAffricate ? 1 : 0 });
            else {
              var tbAc = stopClosureRatio(tc2);
              var tAcD = td * (geminateRole[tc2] === 'second' ? (0.50 * tbAc) / (1 - 0.50 * tbAc) : tbAc);
              ev.push({ t0: tt0, t1: tt0 + tAcD, kind: tvAffricate ? 'VB' : 'S', av: tvAffricate ? 1 : 0 });
              ev.push({ t0: tt0 + tAcD, t1: tt1, kind: 'F', av: tph.na && tph.na.v ? 1 : 0 });
            }
          } else {
            var tvStop = !!(tph.na && tph.na.v);
            if (geminateRole[tc2] === 'first') {
              ev.push({ t0: tt0, t1: tt1, kind: tvStop ? 'VB' : 'S', av: tvStop ? 1 : 0 });
            } else {
              var tbSt = stopClosureRatio(tc2);
              var tClosD = td * (geminateRole[tc2] === 'second' ? (0.50 * tbSt) / (1 - 0.50 * tbSt) : tbSt);
              ev.push({ t0: tt0, t1: tt0 + tClosD, kind: tvStop ? 'VB' : 'S', av: tvStop ? 1 : 0 });
              ev.push({ t0: tt0 + tClosD, t1: tt1, kind: 'F', release: true, av: tvStop ? 1 : 0 });
            }
          }
          var tFirst = ev[tPhoneEv0], tPrev = ev[tPhoneEv0 - 1];
          singingJoin(tFirst, tc2);
          if (manualTimes && timing.anticipations && Number.isFinite(timing.anticipations[tc2]))
            tFirst.anticipationRequest = Math.max(0, timing.anticipations[tc2] / 1000);
          if (manualTimes && timing.crossfades && Number.isFinite(timing.crossfades[tc2]) && tFirst &&
              tPrev && Math.abs(tPrev.t1 - tFirst.t0) < 1e-6) {
            var tManualXf = Math.max(0, Math.min(0.2, timing.crossfades[tc2] / 1000,
              tFirst.t1 - tFirst.t0, tPrev.t1 - tPrev.t0));
            if (tManualXf > 0) tFirst.xf = tManualXf;
          }
          for (var tpe = tPhoneEv0; tpe < ev.length; tpe++) {
            ev[tpe].noteId = note.id; ev[tpe].phoneIndex = tc2; ev[tpe].phone = phones[tc2];
          }
          cur = tt1;
        }
        var tTailV = tLastNuc >= 0 ? tLastNuc : (tLastVowel >= 0 ? tLastVowel : tLastSonorant);
        var tIsStandaloneQ = phones.length === 1 && notePhone(phones[0]).t === 'Q' && ev.length > noteEv0;
        tail = tTailV >= 0 ? { v: tTailV, bodyStart: tFirstNuc >= 0 && tFirstNuc <= tTailV ? tFirstNuc : tTailV, end: ev.length, locked: !!manualTimes }
          : tIsStandaloneQ ? { q: ev.length - 1, locked: !!manualTimes } : null;
        var tLastIdx = phones.length - 1;
        var tLastCoda = noteInfo.hasVowel && tLastIdx > nuc && nuclei.indexOf(tLastIdx) < 0 &&
          NSG.phoneOf(phones[tLastIdx]).t !== 'V' && geminateRole[tLastIdx] === 'first' ? phones[tLastIdx] : '';
        prevChain = { endSec: endSec, codaId: tLastCoda };
        note._start = start;
        note._pre = Math.min(start, Math.max(start - pre - vowelPickup, soundEnd));
        soundEnd = tm.secOf(endNote.start + endNote.dur);
        note._end = tm.secOf(note.start + note.dur);
        note._legato = start;
        for (var tlink = n + 1; tlink <= chainEnd; tlink++) {
          var tlinked = notes[tlink];
          tlinked._start = tm.secOf(tlinked.start);
          tlinked._end = tm.secOf(tlinked.start + tlinked.dur);
          tlinked._slur = true;
          tlinked._legato = start;
        }
        notes[n] = note;
        continue;
      }
      var basePh = notePhoneAt(nuc);
      var basePairs = NSG.formantsOf(basePh, timbre).pairs;
      if (studioMode) {
        if (basePh.t === 'V') applyHawksMillerBw(basePairs, timbre);
        else if (Array.isArray(basePh.b)) {
          var bS0 = timbre.bwScale || 1, br0 = Array.isArray(timbre.bwRatio) ? timbre.bwRatio : null;
          for (var bk0 = 0; bk0 < Math.min(3, basePh.b.length); bk0++) basePairs[bk0][1] = Math.max(30, basePh.b[bk0] * bS0 * (br0 && br0[bk0] > 0 ? br0[bk0] : 1));
        }
      }
      /* 该音符的等力度增益：复韵母按几个元音的平均功率算，
         否则 /ai/ 这种“前音响、后音轻”的音节会被按后音补偿而整体过响 */
      var pSum = 0, pN = 0, f0n = NSG.mtof(note.pitch || 60), ha = timbre.harm || NSG.defaultHarm();
      var noteTilt = pitchTiltAt(timbre, f0n);
      for (var cv = 0; cv < phones.length; cv++) {
        var phv = notePhoneAt(cv);
        if (phv.t !== 'V') continue;
        var vp = NSG.formantsOf(phv, timbre).pairs;
        if (studioMode) applyHawksMillerBw(vp, timbre);
        pSum += chainPower(phv.nz >= 0.5 ? nasalVowelPairs(vp) : vp, f0n, ha, noteTilt, NSG.sourceFilterOf(timbre), phv.nz >= 0.5 ? nasalVowelNz(phv, timbre) : null);
        pN++;
      }
      // 成音节鼻音（毋 m、黄 ng 等）没有元音，也要按鼻音声道做等力度补偿；
      // 否则 m 在高音区比 /a/ 轻近 30dB，超出 VEL 能补回的范围。
      var nasalN = 0;
      for (var cn = 0; pN === 0 && cn < phones.length; cn++) {
        var phn = notePhone(phones[cn]);
        if (!(phn.t === 'N' || (phn.t === 'L' && phn.syllabic))) continue;
        pSum += chainPower(phn.t === 'N' ? nasalTarget(NSG.formantsOf(phn, timbre).pairs, true) : NSG.formantsOf(phn, timbre).pairs, f0n, ha, noteTilt, NSG.sourceFilterOf(timbre));
        nasalN++;
      }
      var hasVowel = pN > 0;
      if (!pN) pN = nasalN;
      var comp = pN ? loudCompPower(pSum / pN, timbre) : 1;
      // 英语整词可含多个独立音节，不能用响亮的 /æ/ 把末尾 /ɪ/ 的补偿压低。
      // 同一音节的双元音仍按平均功率补偿，保持主元音与滑音的自然差别。
      var nucleusGains = [], nucleusLevels = [];
      for (var ni = 0; isEnglish && ni < nuclei.length; ni++) {
        var np = 0, nn = 0, stop = ni + 1 < nuclei.length ? nuclei[ni + 1] : phones.length;
        for (var vi = nuclei[ni]; vi < stop; vi++) if (notePhone(phones[vi]).t === 'V') {
          var phvi = notePhone(phones[vi]), vpi = NSG.formantsOf(phvi, timbre).pairs;
          np += chainPower(phvi.nz >= 0.5 ? nasalVowelPairs(vpi) : vpi, f0n, ha, noteTilt, NSG.sourceFilterOf(timbre), phvi.nz >= 0.5 ? nasalVowelNz(phvi, timbre) : null);
          nn++;
        }
        var gain = isEnglish && nn ? loudCompPower(np / nn, timbre) : comp;
        nucleusGains.push(gain);
        nucleusLevels.push(nn ? Math.sqrt(np / nn) * gain : 0);
      }
      // 鼻音、边音的电平按“相对相邻元音”的输出功率换算（与浊塞音同一口径），
      // 否则同一个 n 随音色、元音从 −15dB 到 +1dB 不等。
      var gl0 = NSG.sourceFilterOf(timbre);
      function nearestVowel(index) {
        var best = -1;
        for (var q = 0; q < phones.length; q++) if (notePhoneAt(q).t === 'V' &&
          (best < 0 || Math.abs(q - index) < Math.abs(best - index) || (Math.abs(q - index) === Math.abs(best - index) && q > index))) best = q;
        return best < 0 ? null : notePhoneAt(best);
      }
      function consonantPairsVowel(index) {
        var nb = nearestVowel(index);
        var p = nb ? NSG.formantsOf(nb, timbre).pairs : basePairs;
        if (studioMode && nb && nb.t === 'V') applyHawksMillerBw(p, timbre);
        return p;
      }
      function relLevel(pairs, vowelPairs, level, nz, maxAv) {
        var pv = chainPower(vowelPairs, f0n, ha, noteTilt, gl0);
        var px = chainPower(pairs, f0n, ha, noteTilt, gl0, nz);
        return px > 1e-12 ? Math.min(maxAv || 1.5, level * Math.sqrt(pv / px)) : 0;
      }
      var firstNucleus = -1, lastNucleus = -1, lastVowel = -1, lastSonorant = -1;
      for (var c2 = 0; c2 < phones.length; c2++) {
        var phoneEv0 = ev.length;
        var ph = notePhoneAt(c2);
        var fm = NSG.formantsOf(ph, timbre);
        if (studioMode) {
          if (ph.t === 'V') applyHawksMillerBw(fm.pairs, timbre);
          else if ((ph.t === 'N' || ph.t === 'L' || ph.t === 'G' || ph.t === 'T') && Array.isArray(ph.b)) {
            var bSc = timbre.bwScale || 1, brP = Array.isArray(timbre.bwRatio) ? timbre.bwRatio : null;
            for (var bpk = 0; bpk < Math.min(3, ph.b.length); bpk++) {
              fm.pairs[bpk][1] = Math.max(30, ph.b[bpk] * bSc * (brP && brP[bpk] > 0 ? brP[bpk] : 1));
            }
          }
        }
        var nearestNucleus = 0;
        for (var nc = 1; nc < nuclei.length; nc++) {
          if (Math.abs(nuclei[nc] - c2) <= Math.abs(nuclei[nearestNucleus] - c2)) nearestNucleus = nc;
        }
        var segmentComp = isEnglish ? nucleusGains[nearestNucleus] : comp;
        var consonantPairs = isEnglish && nuclei.length > 1 ?
          NSG.formantsOf(notePhone(phones[nuclei[nearestNucleus]]), timbre).pairs : basePairs;
        // 只用于声母：韵尾辅音的元音→闭塞过渡发生在声带收声途中，几乎听不到，
        // 反而会改变已标定的韵尾摩擦（英语 -dʒ、闽南语 -p/-t/-k）。
        var onsetCons = c2 < nuclei[nearestNucleus];
        var clear = hasVowel ? clearSonorant(phones[c2], noteLang, onsetCons) : '';
        var locus = onsetCons ? locusPairs(ph, locusNeighbour(phones, c2, locusResolve), timbre) : null;
        if (locus && ph.t !== 'F') consonantPairs = locus;
        // cap 已为主元音保留至少 45%；另设 45ms 下限会让短音符越过下一起音。
        var d = nuclei.indexOf(c2) < 0 ? (c2 < preN ? onsetDurs[c2] : segmentDur(c2) * f)
          : nucDurs && nucDurs[c2] !== undefined ? nucDurs[c2] : c2 === nuc ? vowelBudget - earlyVowel * (nuclei.length - 1) : earlyVowel;
        if (c2 === 0) d += vowelPickup;
        var t0 = manualTimes ? manualTimes[c2] : cur, t1 = manualTimes ? manualTimes[c2 + 1] : cur + d;
        if (manualTimes) d = t1 - t0;

        if (ph.t === 'V') {
          // 闽南语鼻化元音是音位对立，零点上移到鼻极点之上，不随音色的鼻音量变弱。
          var prevV = ev.length > noteEv0 ? ev[ev.length - 1] : null;
          var isEnGlide = noteLang === 'en' && c2 > 0 && nuclei.indexOf(c2) < 0 &&
            /^(a:I|e:I|O:I|a:U|o:U)$/.test(phones[c2 - 1] + ':' + phones[c2]);
          var isZhGlide = isMandarinLike && c2 > nuc && /^(I|U)$/.test(phones[c2]);
          var isDialectGlide = /^(hak|nan-x-teochew)$/.test(noteLang) && c2 > nuc && /^(i|u)(~)?$/.test(phones[c2]);
          var nextNasal = nasalTract && !(ph.nz >= 0.5) && c2 + 1 < phones.length && notePhone(phones[c2 + 1]).t === 'N' ?
            notePhone(phones[c2 + 1]) : null;
          var isStudioZhCodaVowel = !!(studioMode && zhNasalCoda && c2 === nuc && nextNasal);
          ev.push({ t0: t0, t1: t1, kind: 'V', pairs: ph.nz >= 0.5 ? nasalVowelPairs(fm.pairs) : fm.pairs, av: (phones[c2] === 'J_ro' ? 0.35 : 1) * segmentComp, fric: 0, nasal: ph.nz || 0,
            az: ph.nz >= 0.5 ? nasalVowelNz(ph, timbre)[1] : 0,
            closeNasal: nextNasal ? (isStudioZhCodaVowel ? 0.52 : 0.48) : 0,
            closeMix: nextNasal ? (isStudioZhCodaVowel ? 0.34 : 0.28) : 0,
            closeAz: nextNasal ? ((isStudioZhCodaVowel && zhNasalCoda === 'ng') ? 2250 : (nextNasal.az || 1700)) * nasalScale(timbre) : 0,
            closeTo: zhNasalCoda && c2 === nuc ? mandarinNasalApproach(ph, zhNasalCoda, timbre) :
              /^(ko|vi|yue|nan|hak|nan-x-teochew)$/.test(noteLang) && c2 === phones.length - 2 && KO_VI_CODA[phones[c2 + 1]] ?
                locusPairs({ pl: KO_VI_CODA[phones[c2 + 1]] }, ph, timbre) :
              /^(fil|id|ms|th)$/.test(noteLang) && c2 < phones.length - 1 && KO_VI_CODA[phones[c2 + 1]] &&
                (c2 + 1 === phones.length - 1 || (notePhone(phones[c2 + 2]).t !== 'V' && !notePhone(phones[c2 + 2]).syllabic)) ?
                locusPairs({ pl: KO_VI_CODA[phones[c2 + 1]] }, ph, timbre) :
              /^(pl|ru|uk)$/.test(noteLang) && c2 < phones.length - 1 && NSG.phoneOf(phones[c2 + 1]).pl ?
                locusPairs(NSG.phoneOf(phones[c2 + 1]), ph, timbre) :
              c2 + 1 < phones.length && geminateRole[c2 + 1] === 'first' && NSG.phoneOf(phones[c2 + 1]).pl ?
                locusPairs(NSG.phoneOf(phones[c2 + 1]), ph, timbre) : undefined,
            // 双元音收尾（ao 的 U_a、ou 的 U_ou、普通话 I/U、客/潮复韵母收尾、英语 AY/EY/OY/AW/OW）：在整段内平滑滑向终点。
            glideFrom: (ph.glide || isEnGlide || isZhGlide || isDialectGlide) && prevV && prevV.kind === 'V' ? prevV.pairs : undefined,
            nasalFrom: prevV && prevV.nasalLocus || undefined,
            nasalFromDur: prevV && prevV.nasalLocus ? (noteLang === 'en' ? 0.036 : noteLang === 'ja' ? 0.055 : undefined) : undefined });
          lastVowel = phoneEv0;
          if (nuclei.indexOf(c2) >= 0) {
            if (firstNucleus < 0) firstNucleus = phoneEv0;
            lastNucleus = phoneEv0;
          }
        } else if (ph.t === 'N') {
          var nPairs = copyPairs(nasalTarget(fm.pairs, !hasVowel)), nZ = (ph.az || 1700) * nasalScale(timbre);
          var isStudioCodaN = !!(studioMode && zhNasalCoda && c2 === phones.length - 1 && hasVowel);
          var nVowelPairs = hasVowel ? consonantPairsVowel(c2) : null;
          if (isStudioCodaN && zhNasalCoda === 'ng' && nVowelPairs) {
            var ngScale = nasalScale(timbre);
            nZ = 2250 * ngScale;
            var velarF2 = Math.max(950 * ngScale, Math.min(1550 * ngScale, nVowelPairs[1][0] * 0.70));
            nPairs[1][0] = Math.min(nPairs[1][0], velarF2);
            nPairs[1][1] = Math.max(nPairs[1][1], 360);
            nPairs[2][0] = Math.min(nPairs[2][0], Math.max(nPairs[1][0] + 380, 2250 * ngScale));
            nPairs[2][1] = Math.max(nPairs[2][1], 420);
          }
          // User-selected C: carry the labial/alveolar/palatal oral locus
          // into the vowel opening. The nasal hold and source stay unchanged.
          var nNb = nasalRelease && onsetCons && /^(m|n|ny|my_ru)$/.test(phones[c2]) ? locusNeighbour(phones, c2, locusResolve) : null;
          var nLocus = nNb ? locusPairs({pl: phones[c2] === 'm' ? 'lab' : (phones[c2] === 'ny' || phones[c2] === 'my_ru') ? 'pal' : 'alv'}, phones[c2] === 'n' ? Object.assign({}, nNb, { lip: (nNb.lip || 0) * 0.25 }) : nNb, timbre) : null;
          // Open oral release keeps its natural F2/F3 bandwidths so place transitions remain audible.
          var useNasalRms = (clear === 'N' || isStudioCodaN);
          var nRelLvl = clear === 'N'
            ? (studioMode ? (phones[c2] === 'm' ? 0.58 : 0.62) : (phones[c2] === 'm' ? 0.46 : 0.50))
            : noteLang === 'de' && ph.syllabic ? 0.55 : isStudioCodaN ? 0.60 : zhNasalCoda && c2 === phones.length - 1 ? 0.48 : NASAL_LEVEL;
          var nTargetRms = hasVowel && useNasalRms ? nRelLvl * Math.sqrt(chainPower(nVowelPairs, f0n, ha, noteTilt, gl0)) * segmentComp : 0;
          ev.push({ t0: t0, t1: t1, kind: 'N', pairs: nPairs,
            av: (hasVowel ? relLevel(nPairs, nVowelPairs, nRelLvl,
              [NASAL_POLE * nasalScale(timbre), nZ], useNasalRms ? 8 : 1.5) : (noteLang === 'de' && ph.syllabic ? 1.0 : NASAL_SYLLABIC)) * segmentComp,
            nasalTargetRms: nTargetRms || undefined,
            nasalMaxAv: nTargetRms ? 8 * segmentComp : undefined,
            nasalF0: nTargetRms ? f0n : undefined,
            // 成音节鼻音（嗯、毋、黄 ng）是长音核，不加零点：高音区持阻谱的电平落差超出 VEL 可补范围。
            fric: 0, nasal: hasVowel ? 0.9 : 0.2, az: hasVowel ? nZ : 0,
            sonorant: clear || (isStudioCodaN ? 'N' : undefined),
            voiceTau: clear ? 0.006 : (isStudioCodaN ? 0.014 : undefined),
            nasalLocus: nLocus || undefined });
          if (nuclei.indexOf(c2) >= 0) {
            if (firstNucleus < 0) firstNucleus = phoneEv0;
            lastSonorant = phoneEv0;
          }
        } else if (ph.t === 'Q') {
          var prevClose = ph.pl && ev.length > noteEv0 ? ev[ev.length - 1].closeTo : null;
          ev.push({ t0: t0, t1: t1, kind: 'S', pairs: prevClose || consonantPairs, av: 0, fric: 0, nasal: 0 });
        } else if (ph.t === 'L' || ph.t === 'G') {
          // 边音不带鼻腔耦合，否则与 n 的差别只剩几 dB。
          var enClearL = noteLang === 'en' && onsetCons && phones[c2] === 'l';
          var lNb = onsetCons && hasVowel && (phones[c2] === 'l_zh' || enClearL) ? locusNeighbour(phones, c2, locusResolve) : null;
          var enDarkL = noteLang === 'en' && !onsetCons && phones[c2] === 'l' && geminateRole[c2] !== 'first';
          var lPairs = lNb && lNb.f ? mandarinLateral(lNb, timbre) :
            enDarkL ? NSG.formantsOf({ f: [340, 760, 2650], lip: 0.02 }, timbre).pairs : fm.pairs;
          // F1 位于基频以下时，窄峰会把边音也压成低频嗡声。放宽持阻段的 F1，保留口腔 F2/F3 能量。
          if (clear === 'L' || enClearL || enDarkL) lPairs[0][1] = Math.max(lPairs[0][1], 350);
          ev.push({ t0: t0, t1: t1, kind: 'G', pairs: lPairs,
            av: (ph.t === 'L' ? (hasVowel ? relLevel(lPairs, consonantPairsVowel(c2), clear === 'L' ? (studioMode ? 0.46 : 0.56) : L_LEVEL,
              null, clear === 'L' ? 3 : 1.5) : 0.75) : (studioMode ? 0.94 : 0.80)) * segmentComp,
            fric: 0, nasal: ph.t === 'L' ? 0 : 0.12, latRelease: lPairs !== fm.pairs || undefined,
            sonorant: clear || undefined, voiceTau: clear ? ((studioMode && clear === 'L') ? 0.005 : 0.006) : undefined });
          if (nuclei.indexOf(c2) >= 0) {
            if (firstNucleus < 0) firstNucleus = phoneEv0;
            lastSonorant = phoneEv0;
          }
        } else if (ph.t === 'T') {
          // 闪音 ɾ：舌尖轻碰齿龈，声带不停。声道短暂收向齿龈音轨、电平快速下沉约 10dB，
          // 再随一个很弱的带声小爆破放开。没有静音，所以不会与 t/d 的闭塞混同。
          var tapNb = clear === 'T' ? locusNeighbour(phones, c2, notePhone) : null;
          var fiTapPairs = !locus && (noteLang === 'fi' || noteLang === 'tlh') && ph.pl ? locusPairs(ph, nearestVowel(c2), timbre) : null;
          var tapPairs = (clear === 'T' && japaneseTapPairs(tapNb, timbre)) || locus || fiTapPairs || consonantPairs;
          var tapVowel = consonantPairsVowel(c2);
          var tapAv = hasVowel ? relLevel(tapPairs, tapVowel, TAP_LEVEL) : 0.3;
          if (geminateRole[c2] === 'first' && !(noteLang === 'fi' && ph.t === 'T')) {
            ev.push({ t0: t0, t1: t1, kind: 'G', pairs: tapPairs, av: tapAv * segmentComp, fric: 0, nasal: 0,
              voiceTau: 0.004, sonorant: clear || undefined });
          } else {
            var taps = ph.taps || 1, tapDur = d / taps;
            var tapRel = Math.min(clear === 'T' ? 0.012 : 0.008, tapDur * 0.3);
            var tapFc = clear === 'T' ? 2900 : ph.na.f, tapFbw = clear === 'T' ? 1800 : ph.na.b;
            var tapSoft = typeof timbre.consonantSoftness === 'number' && isFinite(timbre.consonantSoftness) ?
              Math.max(0, Math.min(1, timbre.consonantSoftness)) : 0;
            var tapFric = clear === 'T'
              ? 0.12 * BURST_GAIN * bandNoiseScale(timbre, tapFc, tapFbw) *
                Math.max(0.7, Math.min(6, Math.sqrt(frictionPower(3800, 1400, 0, 16000) /
                  Math.max(1e-18, frictionPower(tapFc, tapFbw, tapSoft, 16000)))))
              : (ph.na ? ph.na.g : 0.05) * BURST_GAIN * bandNoiseScale(timbre, ph.na.f, ph.na.b);
            var tapStart = t0;
            for (var tap = 1; tap <= taps; tap++) {
              var tapEnd = tap === taps ? t1 : t0 + tap * tapDur;
              ev.push({ t0: tapStart, t1: tapEnd - tapRel, kind: 'G', pairs: tapPairs, av: tapAv * segmentComp, fric: 0, nasal: 0,
                voiceTau: 0.004, sonorant: clear || undefined });
              ev.push({ t0: tapEnd - tapRel, t1: tapEnd, kind: 'F', release: true, asp: 0, burstBoost: clear === 'T' ? 0.35 : 0, pairs: tapPairs,
                av: tapAv * 1.6 * segmentComp,
                fric: tapFric,
                tn: 0, fc: tapFc, fbw: tapFbw, nasal: 0, sonorant: clear || undefined });
              tapStart = tapEnd;
            }
          }
        } else if (ph.t === 'F') {
          var labiodental = ((isEnglish || isRomance || isEsperanto) && /^(f|v|fy_ru|vy_ru)$/.test(phones[c2])) ||
            ((noteLang === 'hak' || noteLang === 'zh-x-sichuan' || noteLang === 'tlh') && phones[c2] === 'v');
          var enVoicedFric = ((noteLang === 'en' || isEsperanto) && /^(dh|z|zh)$/.test(phones[c2])) ||
            (isRomance && /^(z|zh)$/.test(phones[c2])) ||
            ((noteLang === 'zh-x-sichuan' || noteLang === 'xdi8') && phones[c2] === 'z');
          var germanVelar = /^(x_de|x_pl|x_ru|x_uk|H_tlh)$/.test(phones[c2]);
          var spanishVelar = phones[c2] === 'x_es';
          var germanR = (noteLang === 'de' && phones[c2] === 'r_de') || (noteLang === 'fr' && phones[c2] === 'r_fr') || phones[c2] === 'gh_tlh';
          var mandarinH = isMandarinLike && phones[c2] === 'h' && onsetCons;
          var mandarinMedialH = mandarinH && c2 === 0 && !!prevChain &&
            Math.abs(prevChain.endSec - start) < 1e-4 && ev.length > 0 && ev[ev.length - 1].av > 0;
          var zhHScale = mandarinH && hasVowel ?
            Math.min(1, Math.sqrt(Math.max(1e-18, pSum / pN)) * segmentComp / Math.sqrt(Math.max(1e-18, refPower(timbre)))) : 1;
          var japaneseH = noteLang === 'ja' && phones[c2] === 'h';
          var palatalH = /^(xj|xj_long_ax)$/.test(phones[c2]);
          // 其他语言的清唇齿 /f/ 同样低频、弥散，原表电平下几乎听不见。
          var plainF = !(isEnglish || isRomance || isEsperanto) && (phones[c2] === 'f' || phones[c2] === 'fj');
          var frictionPairs = fm.pairs;
          // /v/ 与英语韵尾浊擦音（dh/z/zh）沿用相邻元音的声道，不能跳成通用擦音表的 /ə/。
          if ((labiodental || enVoicedFric) && ph.na.v) {
            var nearest = -1;
            for (var vp = 0; vp < phones.length; vp++) {
              if (notePhone(phones[vp]).t === 'V' && (nearest < 0 || Math.abs(vp - c2) < Math.abs(nearest - c2))) nearest = vp;
            }
            if (nearest >= 0) frictionPairs = NSG.formantsOf(notePhone(phones[nearest]), timbre).pairs;
          }
          // 通用擦音表是一组 /ə/ 式的固定峰；有部位信息时改用随相邻元音变化的音轨。
          // 英语 /v/ 的弱带声已按相邻元音声道单独标定，保持不变。
          if (locus && !(labiodental && ph.na.v && ph.pl !== 'pal')) frictionPairs = locus;
          else if ((isRomance || isEsperanto || noteLang === 'tlh' || (noteLang === 'fi' && ph.pl === 'glo')) && !locus && !(labiodental && ph.na.v) && ph.pl) {
            var nbFric = nearestVowel(c2);
            if (nbFric) {
              frictionPairs = ph.pl === 'glo' ? NSG.formantsOf(nbFric, timbre).pairs : (locusPairs(ph, nbFric, timbre) || frictionPairs);
            }
          }
          if (japaneseH) frictionPairs = dampBreathPairs(frictionPairs, JA_H_DAMP, JA_H_MIN_BW);
          else if (palatalH) frictionPairs = palatalBreathPairs(locusNeighbour(phones, c2, notePhone), timbre);
          var jaBreathLpHz = japaneseH ? JA_H_LP_HZ : (palatalH ? JA_XJ_LP_HZ : 0);
          ev.push({
            t0: t0, t1: t1, kind: 'F', pairs: frictionPairs,
            // breathy（朝鲜语弱化 ㅎ [ɦ]）：声带不停，只是电平稍降并混入经元音声道塑形的气流。
            av: ph.na && ph.na.v ? (ph.breathy || (labiodental ? 0.14 : enVoicedFric ? 0.16 : germanR ? 0.28 : 0.32)) * segmentComp : 0,
            // 低频、弥散的 /f v/ 经噪声通路与唇端辐射后远弱于 /s/；局部校准。
            fric: jaBreathLpHz ? 0 : (ph.na ? ph.na.g : 0.2) * (labiodental ? 6 : germanVelar ? 8 : spanishVelar ? 6 : germanR ? 3.5 : plainF ? F_GAIN : sibilantScale(ph)) * bandNoiseScale(timbre, ph.na ? ph.na.f : 3000, ph.na ? ph.na.b : 1200) * (mandarinMedialH ? 0.12 : mandarinH ? 0.20 : 1) * zhHScale * (studioMode && phones[c2] === 's' ? 0.72 : 1),
            // 喉/软腭擦音 h：气流噪声经后接元音的声道塑形，听感才是“哈”而不是一层嘶声。
            tn: jaBreathLpHz ? tractNoiseGain(frictionPairs, timbre, japaneseH ? JA_H_LEVEL : JA_XJ_LEVEL, jaBreathLpHz, 2) :
              ph.pl === 'glo' && !ph.na.v ? tractNoiseGain(frictionPairs, timbre, mandarinMedialH ? ZH_MEDIAL_H_LEVEL : H_LEVEL) * zhHScale :
              ph.breathy ? tractNoiseGain(frictionPairs, timbre, H_LEVEL) * (ph.breathyNoise || 1) : 0,
            tnLpHz: jaBreathLpHz || undefined,
            // 弱化 ㅎ 只有几十毫秒，默认 38ms 的声带衰减来不及压下去，헤 会听成 에。
            voiceTau: (labiodental || enVoicedFric) && ph.na.v ? 0.006 : ph.breathy ? 0.010 : undefined,
            fc: ph.na ? ph.na.f : 3000, fbw: ph.na ? ph.na.b : 1200, nasal: 0
          });
          // 普通话 h 以连续气流为主；固定带通只留弱摩擦，缓起避免像塞音一样冒出硬头。
          // 共用 h 的其他语种和显式韵尾保留原有电平、包络与时序。
          if (mandarinH) {
            var hNeighbour = locusNeighbour(phones, c2, locusResolve);
            var roundedH = hNeighbour && hNeighbour.f[1] <= 1000 && hNeighbour.lip >= 0.10;
            var hEvent = ev[ev.length - 1];
            // hu/hua/hui：圆唇声道的入口容易鼓起，再留一段较缓的气流淡入。
            hEvent.flowAttack = roundedH ? 0.024 : 0.012;
            if (roundedH) hEvent.flowAttackFraction = 0.45;
          }
          if (japaneseH || palatalH) {
            var jaHNeighbour = locusNeighbour(phones, c2, notePhone);
            var jaRoundedH = japaneseH && jaHNeighbour && jaHNeighbour.f[1] <= 1000 && jaHNeighbour.lip >= 0.05;
            var jaHEvent = ev[ev.length - 1];
            jaHEvent.flowAttack = jaRoundedH ? 0.020 : (japaneseH ? 0.015 : 0.014);
            jaHEvent.flowAttackFraction = jaRoundedH ? 0.40 : 0.35;
          }
        } else if (ph.t === 'A') {                 // 塞擦音：短闭塞 + 较长摩擦
          var voicedAffricate = !!(ph.na && ph.na.v);
          function affricateClosure(from, to, pairs) {
            var closurePairs = voicedAffricate ? voiceBarPairs(pairs) : pairs;
            ev.push({ t0: from, t1: to, kind: voicedAffricate ? 'VB' : 'S', pairs: closurePairs,
              av: voicedAffricate ? relLevel(closurePairs, consonantPairsVowel(c2), VBAR_LEVEL) * segmentComp : 0,
              fric: 0, nasal: 0, voiceTau: voicedAffricate ? 0.006 : undefined,
              fc: ph.na ? ph.na.f : 4000, fbw: ph.na ? ph.na.b : 1200 });
          }
          var englishAffricate = (isEnglish || isRomance || isEsperanto || noteLang === 'tlh') && /^(ch_en|jh_en)$/.test(phones[c2]);
          var klingonUvularAffricate = phones[c2] === 'Q_tlh';
          // 普通话 c / ch：前段保留摩擦，后段转为后接元音塑形的送气；
          // 普通话 zh：加强闭塞并略收摩擦，与送气 ch 及擦音 sh 拉开。
          // tsh / ts_r 也被其他语言使用，限定语言及声母位置，不修改共享音素。
          var mandarinC = isMandarinLike && phones[c2] === 'tsh' && onsetCons;
          var mandarinCh = isMandarinLike && phones[c2] === 'tsh_r' && onsetCons;
          var mandarinZh = isMandarinLike && phones[c2] === 'ts_r' && onsetCons;
          var mandarinQ = isMandarinLike && phones[c2] === 'tsh_j' && onsetCons;
          var mandarinZ = isMandarinLike && phones[c2] === 'ts' && onsetCons;
          var mandarinJ = isMandarinLike && phones[c2] === 'ts_j' && onsetCons;
          // 噪声绕过元音声道；按音色频段增益与当前音节相对基准电平的比例标定（与采样率无关）。
          var enAffrFc = ph.na ? ph.na.f : 3100, enAffrBw = ph.na ? ph.na.b : 1100;
          var enAffrRef = Math.sqrt(Math.max(1e-18, refPower(timbre)));
          var enAffrVowel = nucleusLevels[nearestNucleus] > 0 ?
            Math.max(0.60, Math.min(1, nucleusLevels[nearestNucleus] / enAffrRef)) : 1;
          var affricateGain = englishAffricate ?
            sibilantScale(ph) * bandNoiseScale(timbre, enAffrFc, enAffrBw) * enAffrVowel * (ph.na && !ph.na.v ? 0.96 : 0.85) :
            klingonUvularAffricate ? 7.5 * bandNoiseScale(timbre, ph.na ? ph.na.f : 1450, ph.na ? ph.na.b : 1150) :
            (note.lang || lang) === 'de' && phones[c2] === 'pf_de' ? F_GAIN * bandNoiseScale(timbre, ph.na ? ph.na.f : 2300, ph.na ? ph.na.b : 1500) :
            sibilantScale(ph) * bandNoiseScale(timbre, ph.na ? ph.na.f : 3000, ph.na ? ph.na.b : 1200);
          if (geminateRole[c2] === 'first') {
            var holdPairsA = ph.pl && ev.length > noteEv0 && ev[ev.length - 1].closeTo ? ev[ev.length - 1].closeTo : consonantPairs;
            affricateClosure(t0, t1, holdPairsA);
          } else {
            var baseAcRatio = stopClosureRatio(c2);
            var acD = d * (geminateRole[c2] === 'second' ? (0.50 * baseAcRatio) / (1 - 0.50 * baseAcRatio) : baseAcRatio);
            var isAspMandarinAffr = !!(mandarinC || mandarinCh || mandarinQ);
            if (studioMode && !voicedAffricate && ev.length > 0 && ev[ev.length - 1].av > 0 && Math.abs(ev[ev.length - 1].t1 - t0) < 0.005) {
              acD = Math.min(acD, isAspMandarinAffr
                ? Math.max(0.024, Math.min(0.036, d * 0.32))
                : Math.max(0.018, Math.min(0.026, d * 0.28)));
            }
            affricateClosure(t0, t0 + acD, consonantPairs);
            var isStudioMandarinVlessAffr = !!(studioMode && isMandarinLike && onsetCons && ph.na && !ph.na.v);
            var affrBurstFc = (mandarinQ || mandarinJ) ? 3600 : (mandarinCh || mandarinZh) ? 2300 : 2700;
            var affrBurstGain = isStudioMandarinVlessAffr
              ? ((mandarinQ || mandarinJ ? 0.21 : 0.24) * BURST_GAIN * bandNoiseScale(timbre, affrBurstFc, 1600)) : 0;
            ev.push({
              t0: t0 + acD, t1: t1, kind: 'F', pairs: consonantPairs,
              // /dʒ/ 原来的元音式带声盖过摩擦，/ɪdʒ/ 容易听成元音后直接收声。
              // 局部标定英语塞擦音的噪声通路，并快速减低释放段的声带音。
              av: ph.na && ph.na.v ? (englishAffricate ? 0.14 : 0.28) * segmentComp : 0,
              // c 的高频摩擦略收，保留闭塞与送气对立，避免 cao/cong 的起音抢过元音。
              fric: (ph.na ? ph.na.g : 0.3) * affricateGain * (studioMode ? (mandarinC ? 0.72 : mandarinQ ? 0.86 : mandarinCh ? 1.08 : mandarinZh ? 1.12 : mandarinZ ? 1.28 : mandarinJ ? 0.94 : 1) : (mandarinZh || mandarinC ? 0.85 : 1)),
              burstBoost: isStudioMandarinVlessAffr ? 0.38 : (englishAffricate && ph.na && !ph.na.v ? 0.40 : klingonUvularAffricate ? 0.35 : 0),
              affricateBurst: affrBurstGain,
              flowAttack: isStudioMandarinVlessAffr ? 0.004 : undefined,
              voiceTau: englishAffricate && ph.na && ph.na.v ? 0.006 : undefined,
              fc: ph.na ? ph.na.f : 4000, fbw: ph.na ? ph.na.b : 1200, nasal: 0
            });
            if (mandarinC || mandarinCh || mandarinQ) {
              var aspRelease = ev[ev.length - 1];
              var aspNeighbour = locusNeighbour(phones, c2, locusResolve);
              aspRelease.aspPairs = aspNeighbour ? NSG.formantsOf(aspNeighbour, timbre).pairs : basePairs;
              if (studioMode) {
                aspRelease.aspStart = mandarinC ? 0.24 : mandarinQ ? 0.30 : 0.30;
                aspRelease.aspEnd = mandarinC ? 0.58 : mandarinQ ? 0.66 : 0.68;
                aspRelease.aspFricFloor = mandarinC ? 0.02 : mandarinQ ? 0.05 : 0.08;
                var affrTnLp = mandarinQ ? 4600 : 4200;
                aspRelease.tnLpHz = affrTnLp;
                aspRelease.tn = tractNoiseGain(aspRelease.aspPairs, timbre, mandarinC ? 0.48 : mandarinCh ? 0.52 : 0.44, affrTnLp, 2);
              } else {
                aspRelease.aspStart = mandarinCh ? 0.38 : mandarinQ ? 0.52 : 0.40;  // 释放段前段为摩擦，余段平滑过渡；随辅音速度一同伸缩。
                if (mandarinC) {
                  // 10ms 平滑起音；短辅音仍按段长限制淡入，送气电平与时序保持原有标定。
                  aspRelease.flowAttack = 0.010;
                }
                if (mandarinCh) { aspRelease.aspEnd = 0.88; aspRelease.aspFricFloor = 0.05; }
                if (mandarinQ) { aspRelease.aspEnd = 0.96; aspRelease.aspFricFloor = 0.22; }
                aspRelease.tn = tractNoiseGain(aspRelease.aspPairs, timbre, mandarinCh ? 0.28 : mandarinQ ? 0.18 : 0.22);
              }
            }
          }
        } else {
          var aspDe = isGermanAspStop(c2), aspAmt = aspDe ? 0.28 : (ph.asp || 0);
          var baseStopClos = stopClosureRatio(c2);
          var closD = d * (geminateRole[c2] === 'second' ? (0.50 * baseStopClos) / (1 - 0.50 * baseStopClos) : baseStopClos);
          var voicedStop = ph.na && ph.na.v;
          if (studioMode && !voicedStop && ev.length > 0 && ev[ev.length - 1].av > 0 && Math.abs(ev[ev.length - 1].t1 - t0) < 0.005) {
            closD = Math.min(closD, Math.max(0.022, Math.min(0.036, d * 0.55)));
          }
          var nbStop = onsetCons ? locusNeighbour(phones, c2, locusResolve) : null;
          var vowelPairs = nbStop ? NSG.formantsOf(nbStop, timbre).pairs :
            (noteLang === 'en' && hasVowel ? consonantPairsVowel(c2) : basePairs);
          if (noteLang === 'en' && !onsetCons && hasVowel) consonantPairs = vowelPairs;
          // 闭音元音（如英语 /u/）在高音区达到 av=3.0 上限时，实际响度低于参考元音；爆破与送气按同比例下调，避免压过元音。
          var stopScale = noteLang === 'en' && hasVowel && nucleusLevels[nearestNucleus] > 0 ?
            Math.min(1, nucleusLevels[nearestNucleus] / Math.sqrt(Math.max(1e-18, refPower(timbre)))) : 1;
          // 浊音段电平按“相对后接元音”换算：闭塞/音轨声道的功率随音色差很多，固定 av 会让
          // 同一个 ga 在不同歌手上从 −4dB 到 −21dB 不等。
          var pVowel = voicedStop ? chainPower(vowelPairs, f0n, ha, timbre.tiltDb || 0, NSG.sourceFilterOf(timbre)) : 0;
          var voicedAv = function (pairs, level) {
            var pX = chainPower(pairs, f0n, ha, timbre.tiltDb || 0, NSG.sourceFilterOf(timbre));
            return pX > 1e-12 ? Math.min(1.2, level * Math.sqrt(pVowel / pX)) * segmentComp : 0;
          }; var stopFc = ph.pl === 'vel' && consonantPairs ? Math.max(1250, Math.min(3400, 0.30 * (ph.na ? ph.na.f : 2000) + 0.70 * consonantPairs[1][0])) : (ph.na ? ph.na.f : 2000), stopFbw = ph.na ? ph.na.b : 1200;
          if (studioMode && !voicedStop) {
            if (ph.pl === 'lab') stopFc = Math.min(stopFc, 1600);
            else if (ph.pl === 'alv') stopFc = Math.min(stopFc, 3500);
            else if (ph.pl === 'vel') stopFc = Math.min(stopFc, 2800);
          }
          if (geminateRole[c2] === 'first') {
            var holdPairsS = ph.pl && ev.length > noteEv0 && ev[ev.length - 1].closeTo ? ev[ev.length - 1].closeTo : consonantPairs;
            if (voicedStop) {
              ev.push({ t0: t0, t1: t1, kind: 'VB', pairs: voiceBarPairs(holdPairsS), av: voicedAv(voiceBarPairs(holdPairsS), VBAR_LEVEL), fric: 0, nasal: 0, voiceTau: 0.006, fc: stopFc, fbw: stopFbw });
            } else {
              ev.push({ t0: t0, t1: t1, kind: 'S', pairs: holdPairsS, av: 0, fric: 0, nasal: 0, fc: stopFc, fbw: stopFbw });
            }
          } else {
            if (voicedStop) {
              // 浊音杠：闭塞时声带仍在振动，只有低频的 F1 透出（口腔封闭，高频被唇/舌挡住）。
              ev.push({ t0: t0, t1: t0 + closD, kind: 'VB', pairs: voiceBarPairs(consonantPairs), av: voicedAv(voiceBarPairs(consonantPairs), VBAR_LEVEL), fric: 0, nasal: 0, voiceTau: 0.006, fc: stopFc, fbw: stopFbw });
            } else ev.push({ t0: t0, t1: t0 + closD, kind: 'S', pairs: consonantPairs, av: 0, fric: 0, nasal: 0, fc: stopFc, fbw: stopFbw });
            // 释放后的气流经声道：送气音是一段持续 ~70ms 的送气，共振峰在送气中从音轨滑向元音；
            // 不送气音只有约 10ms 的短促气流，紧接着声带起振。两者的差别主要在这里，而不在闭塞。
            var stStopTnLv = studioMode && !voicedStop ? (ph.asp ? (ph.aspLv ? ph.aspLv * 1.65 : 0.46) : 0.22) : (aspDe ? 0.25 : ph.asp ? (ph.aspLv || ASP_LEVEL) : PUFF_LEVEL);
            var stStopTnLp = (studioMode && !voicedStop) ? (ph.asp ? 4400 : 3600) : 0;
            var stStopFricScale = (studioMode && !voicedStop) ? (ph.asp ? 0.78 : 0.96) : 1;
            ev.push({
              t0: t0 + closD, t1: t1, kind: 'F', release: true, asp: aspAmt, pairs: consonantPairs,
              toPairs: aspAmt ? vowelPairs : undefined,
              aspToVowel: noteLang === 'en' && aspAmt ? Math.max(ASP_TO_VOWEL, (t1 - (t0 + closD)) * 0.70) : undefined,
              av: voicedStop ? voicedAv(consonantPairs, VREL_LEVEL) : 0,
              fric: stopScale * (ph.na ? ph.na.g : 0.3) * BURST_GAIN * stStopFricScale * bandNoiseScale(timbre, stopFc, stopFbw) *
                Math.max(0.7, Math.min(11, Math.sqrt(frictionPower(3800, 1400, 0, 16000) / Math.max(1e-18, frictionPower(stopFc, stopFbw, 0, 16000))))),
              tn: voicedStop ? 0 : stopScale * tractNoiseGain(vowelPairs, timbre, stStopTnLv, stStopTnLp || undefined, stStopTnLp ? 2 : undefined),
              tnLpHz: stStopTnLp || undefined,
              fc: stopFc, fbw: stopFbw, nasal: 0
            });
          }
        }
        // Japanese /ɕ, tɕ/ need a distinct sibilant spectrum. The shared sr/sh
        // table is a 3.1k retroflex target; changing that table would also alter
        // Mandarin. Preserve timing, level, and hi /ç/; reshape only Mode B's
        // unvoiced Japanese friction, including explicit phones in old projects.
        if (modeB && japaneseFriction !== false && (note.lang || lang) === 'ja' &&
            ph.na && !ph.na.v && /^(sr|sh|xc|tsh_j|ch_en)$/.test(phones[c2])) {
          var japaneseRelease = ev[ev.length - 1];
          if (japaneseRelease.kind === 'F') {
            japaneseRelease.jaFricF = ph.t === 'A' ? 5000 : 4600;
            japaneseRelease.jaFricB = 1800;
          }
        }
        if (modeB && japaneseVoicedFriction !== false && (note.lang || lang) === 'ja' &&
            ph.na && ph.na.v && /^(zh|dz_j|z_r|jh_en)$/.test(phones[c2])) {
          var japaneseVoiced = ev[ev.length - 1];
          if (japaneseVoiced.kind === 'F') {
            // ji and ja/ju/je/jo use different shared phones. Both need a
            // forward friction cue; preserve the voiced quality and closure.
            japaneseVoiced.jaFricF = ph.t === 'A' ? 4800 : 4400;
            japaneseVoiced.jaFricB = 1600;
            // A fixed vowel-like av can overwhelm the noise (notably ju).
            // Limit that voiced component relative to the actual neighbour's
            // tract power, retaining its existing phase and formant motion.
            japaneseVoiced.av = Math.min(japaneseVoiced.av,
              relLevel(japaneseVoiced.pairs, consonantPairsVowel(c2), 0.18) * segmentComp);
            japaneseVoiced.voiceTau = 0.006;
          }
        }
        // Apply the HiFi front-cavity waveguide to unvoiced sibilant fricatives
        // and unvoiced sibilant affricates (pre-armed across silent closure so
        // the release burst enters cleanly without dry/wet comb fade-in).
        // Stops, /f pf h/, voiced friction and nasals keep their own models.
        var isWaveguideFric = ph.t === 'F' && /^(s|sr|xc|sh)$/.test(phones[c2]);
        var isWaveguideAffr = ph.t === 'A' && ph.na && !ph.na.v && /^(alv|ret|pal)$/.test(ph.pl || '');
        if (modeB && (isWaveguideFric || isWaveguideAffr)) {
          ev[ev.length - 1].frontCavity = true;
          if (isWaveguideAffr && ev[ev.length - 2] && ev[ev.length - 2].kind === 'S') {
            ev[ev.length - 2].frontCavity = true;
          }
        }
        // Incoming crossfade belongs to this phoneme, including vowel-to-vowel joins.
        // Stop closure/release remain separate synthesis events inside one panel block.
        var firstPhoneEvent = ev[phoneEv0], previousPhoneEvent = ev[phoneEv0 - 1];
        singingJoin(firstPhoneEvent, c2);
        if (manualTimes && timing.anticipations && Number.isFinite(timing.anticipations[c2]))
          firstPhoneEvent.anticipationRequest = Math.max(0, timing.anticipations[c2] / 1000);
        if (manualTimes && timing.crossfades && Number.isFinite(timing.crossfades[c2]) && firstPhoneEvent &&
            previousPhoneEvent && Math.abs(previousPhoneEvent.t1 - firstPhoneEvent.t0) < 1e-6) {
          var manualXf = Math.max(0, Math.min(0.2, timing.crossfades[c2] / 1000,
            firstPhoneEvent.t1 - firstPhoneEvent.t0, previousPhoneEvent.t1 - previousPhoneEvent.t0));
          if (manualXf > 0) {
            var manualPrevNoise = prevTailNoise(previousPhoneEvent, firstPhoneEvent.t0);
            firstPhoneEvent.xf = manualXf;
            firstPhoneEvent.xfPairs = previousPhoneEvent.pairs;
            firstPhoneEvent.xfAv = previousPhoneEvent.av;
            firstPhoneEvent.xfFric = manualPrevNoise.fric;
            firstPhoneEvent.xfTn = manualPrevNoise.tn;
            if (manualPrevNoise.rel) {
              firstPhoneEvent.xfRelease = true;
              firstPhoneEvent.xfReleaseFloor = manualPrevNoise.floor;
            }
          }
        }
        var evPl = ph.pl || (ph.t === 'N' ? (/^(m|my_ru)$/.test(phones[c2]) ? 'lab' : phones[c2] === 'ng' ? 'vel' : phones[c2] === 'ny' ? 'pal' : 'alv')
          : (ph.t === 'L' || ph.t === 'G') ? (/^w/.test(phones[c2]) ? 'lab' : /^(jj|j)/.test(phones[c2]) ? 'pal' : /^(r|rj)/.test(phones[c2]) ? 'ret' : 'alv')
          : ph.t === 'Q' ? 'glo' : '');
        var noteVelNorm = !note._rest && !note._breath ?
          NSG.TUNING.clamp(Number.isFinite(+note.vel) && note.vel != null ? +note.vel : 96, 1, 127) / 96 : 1;
        for (var pe0 = phoneEv0; pe0 < ev.length; pe0++) {
          ev[pe0].pl = evPl;
          ev[pe0].noteVel = noteVelNorm;
          ev[pe0].noteStart = start;
        }
        if (collectPhones) for (var pe = phoneEv0; pe < ev.length; pe++) {
          ev[pe].noteId = note.id; ev[pe].phoneIndex = c2; ev[pe].phone = phones[c2];
        }
        cur = t1;
      }
      var tailV = lastNucleus >= 0 ? lastNucleus : (lastVowel >= 0 ? lastVowel : lastSonorant);
      var isStandaloneQ = phones.length === 1 && notePhone(phones[0]).t === 'Q' && ev.length > noteEv0;
      tail = tailV >= 0 ? { v: tailV, bodyStart: firstNucleus >= 0 && firstNucleus <= tailV ? firstNucleus : tailV, end: ev.length, locked: !!manualTimes }
        : isStandaloneQ ? { q: ev.length - 1, locked: !!manualTimes } : null;
      var lastPhoneIdx = phones.length - 1;
      var lastCodaId = noteInfo.hasVowel && lastPhoneIdx > nuc && nuclei.indexOf(lastPhoneIdx) < 0 &&
        NSG.phoneOf(phones[lastPhoneIdx]).t !== 'V' && geminateRole[lastPhoneIdx] === 'first' ? phones[lastPhoneIdx] : '';
      prevChain = { endSec: endSec, codaId: lastCodaId };
      note._start = start;
      // 前置声母落在空白（或被借走的呼吸）里的部分归本音符：音高、力度取本音符；
      // 与上一个字相接的部分仍归上一个字，力度在节拍处切换，和以前的连音边界一样。
      note._pre = Math.min(start, Math.max(start - pre - vowelPickup, soundEnd));
      soundEnd = tm.secOf(endNote.start + endNote.dur);
      note._end = tm.secOf(note.start + note.dur);
      note._legato = start;          // 新起音：颤音延迟从这一刻重新算
      for (var link = n + 1; link <= chainEnd; link++) {
        var linked = notes[link];
        linked._start = tm.secOf(linked.start);
        linked._end = tm.secOf(linked.start + linked.dur);
        linked._slur = true;
        linked._legato = start;
      }
      notes[n] = note;
    }
    // Advance only the incoming attack. Keep nominal boundaries for editing and
    // leave stop release, later phones, note pitch and note lengths in place.
    var interruptions = notes.filter(function (note) { return note._rest || note._breath; });
    var intCursor = 0, intLen = interruptions.length;
    ev.forEach(function (event, index) {
      var previous = ev[index - 1];
      var adjacent = previous && previous.kind !== 'B' && Math.abs(previous.t1 - event.t0) < 1e-6;
      var available = adjacent ? Math.max(0, Math.min(0.2 - (event.xf || 0),
        previous.t1 - Math.max(previous.t0 + (previous.xf || 0), previous.nominalT0 || previous.t0) - 0.001)) : 0;
      if (available > 0 && intLen > 0) {
        while (intCursor + 1 < intLen && interruptions[intCursor + 1]._start < event.t0) intCursor++;
        while (intCursor > 0 && interruptions[intCursor]._start >= event.t0) intCursor--;
        for (var ii = intCursor; ii >= 0; ii--) {
          var intr = interruptions[ii];
          if (intr._start >= event.t0) continue;
          if (intr._end <= event.t0 - available) break;
          available = Math.max(0, event.t0 - intr._end);
        }
      }
      if (collectPhones) event.maxAnticipation = available;
      // Blend whole phonation/tract states across adjacent sung syllables.
      // Keep at least 75% of the preceding phone and finish the incoming ramp
      // early enough to retain a real stop/affricate closure before release.
      var autoJoin = event.singingLead > 0 && adjacent && previous.av > 0 && previous.kind !== 'F' && previous.kind !== 'VB';
      var leadFrac = event.singingLeadFrac !== undefined ? event.singingLeadFrac : 0.40;
      var fadeFrac = event.singingFadeFrac !== undefined ? event.singingFadeFrac : 0.30;
      var prevFrac = event.singingPrevFrac !== undefined ? event.singingPrevFrac : 0.25;
      var strength = event.singingStrength === undefined ? 1 : event.singingStrength;
      if (autoJoin) event.xf = strength * Math.min(event.singingFade, (event.t1 - event.t0) * fadeFrac, previous.t1 - previous.t0);
      var requestedLead = autoJoin ? strength * Math.min(event.singingLead,
        (previous.t1 - previous.t0) * prevFrac, (event.t1 - event.t0) * leadFrac) : event.anticipationRequest || 0;
      var lead = Math.min(available, Math.max(0, 0.2 - (event.xf || 0)), requestedLead);
      delete event.anticipationRequest;
      delete event.singingLead; delete event.singingFade;
      delete event.singingStrength;
      delete event.singingLeadFrac; delete event.singingFadeFrac; delete event.singingPrevFrac;
      if (!(lead > 0)) { if (autoJoin) delete event.xf; return; }
      event.nominalT0 = event.t0; previous.nominalT1 = previous.t1;
      event.t0 -= lead; previous.t1 -= lead;
      event.anticipation = lead;
      event.xf = lead + (event.xf || 0);
      var prevNoise = prevTailNoise(previous, event.t0);
      event.xfPairs = previous.pairs; event.xfAv = previous.av;
      event.xfFric = prevNoise.fric; event.xfTn = prevNoise.tn;
      if (prevNoise.rel) {
        event.xfRelease = true;
        event.xfReleaseFloor = prevNoise.floor;
      } else {
        delete event.xfRelease;
        delete event.xfReleaseFloor;
      }
      event.xfAz = previous.az || 0; event.xfNasal = previous.nasal || 0;
      event.xfFc = previous.fc || event.fc; event.xfFbw = previous.fbw || event.fbw;
    });
    return { ev: ev, notes: notes, pit: trk && trk.pit };
  }

  /* ---------- 拟人声源（LF 混合相位声门表）与有机微扰工具 ---------- */
  // 固化参数：低清 16kHz（有机微扰 45%、拟人核心 61%），HiFi 48kHz（各 25%）；
  // 开启「兼容旧版音色细节」（NSG.LEGACY_SOUND）时自动回退为 0。
  var DEFAULT_ORGANIC_MICRO_VAR = HD ? 0.25 : 0.45;
  var DEFAULT_HUMANIZE_CORE = HD ? 0.25 : 0.61;
  function clampUnit(v) {
    if (v === true) return 1;
    if (v === false || v === undefined || v === null) return 0;
    var n = +v;
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }
  function resolveOrganicMicroVar(opt) {
    if (opt && opt.organicMicroVar !== undefined) return clampUnit(opt.organicMicroVar);
    return NSG.LEGACY_SOUND ? 0 : DEFAULT_ORGANIC_MICRO_VAR;
  }
  function resolveHumanizeCore(opt) {
    if (opt && opt.humanizeCore !== undefined) return clampUnit(opt.humanizeCore);
    return NSG.LEGACY_SOUND ? 0 : DEFAULT_HUMANIZE_CORE;
  }
  function makePinkBand(rnd, fcSlow, fcFast, dt) {
    var a1 = Math.exp(-2 * Math.PI * fcSlow * dt);
    var a2 = Math.exp(-2 * Math.PI * fcFast * dt);
    var g1 = Math.sqrt((1 + a1) * (1 + a1) * (1 + a1) / Math.max(1e-12, (1 - a1) * (1 + a1 * a1)));
    var g2 = Math.sqrt((1 + a2) * (1 + a2) * (1 + a2) / Math.max(1e-12, (1 - a2) * (1 + a2 * a2)));
    var s1a = 0, s1b = 0, s2a = 0, s2b = 0;
    return function () {
      var x1 = (rnd() + rnd() + rnd() - 1.5) * 2;
      var x2 = (rnd() + rnd() + rnd() - 1.5) * 2;
      s1a = (1 - a1) * x1 + a1 * s1a; s1b = (1 - a1) * s1a + a1 * s1b;
      s2a = (1 - a2) * x2 + a2 * s2a; s2b = (1 - a2) * s2a + a2 * s2b;
      var v = 0.65 * (s1b * g1) + 0.76 * (s2b * g2);
      return Math.tanh(v / 2.6) * 2.6;
    };
  }

  // Precompute Fant (1995) LF glottal flow derivative phase & relative magnitude
  // across Rd in [0.3, 2.7] (25 rows x 64 harmonics), GCI anchored at phase 0.
  var lfTableCache = null;
  function getLfTable() {
    if (lfTableCache) return lfTableCache;
    var N = 512, NH = 64, NRD = 25, RD_MIN = 0.3, RD_STEP = 0.1;
    var phase = new Array(NRD), mag = new Array(NRD);
    var oqArr = new Float64Array(NRD), taArr = new Float64Array(NRD);
    var re = new Float64Array(N), im = new Float64Array(N), retBuf = new Float64Array(N);
    for (var ri = 0; ri < NRD; ri++) {
      var rd = RD_MIN + ri * RD_STEP;
      var ra = Math.max(0.006, (-1 + 4.8 * rd) / 100);
      var rk = (22.4 + 11.8 * rd) / 100;
      var rhs = Math.max(0.01, (0.11 * rd) / (0.5 + 1.2 * rk) - ra);
      var rg = Math.max(0.55, Math.min(2.2, rk / (4 * rhs)));
      var tp = Math.min(0.62, Math.max(0.18, 1 / (2 * rg)));
      var te = Math.min(0.90, Math.max(tp + 0.05, (1 + rk) * tp));
      var ta = Math.min(0.22, ra);
      var rem = 1 - te;
      var eps = 1 / ta;
      for (var it = 0; it < 24; it++) {
        var eExp = Math.exp(-eps * rem);
        var fv = 1 - eExp - eps * ta;
        var dfv = rem * eExp - ta;
        if (Math.abs(dfv) < 1e-12) break;
        eps = Math.max(1e-4, eps - fv / dfv);
      }
      var wg = Math.PI / tp, sinTe = Math.sin(wg * te);
      var retScale = 1 / Math.max(1e-9, 1 - Math.exp(-eps * rem));
      var areaRet = 0;
      for (var i = 0; i < N; i++) {
        var tt = i / N;
        if (tt >= te) {
          var rv = -(Math.exp(-eps * (tt - te)) - Math.exp(-eps * rem)) * retScale;
          retBuf[i] = rv; areaRet += rv;
        } else retBuf[i] = 0;
      }
      var lo = -10, hi = 40;
      for (var bi = 0; bi < 32; bi++) {
        var mid = 0.5 * (lo + hi), aOpen = 0;
        for (var j = 0; j < N; j++) {
          var tj = j / N;
          if (tj >= te) break;
          aOpen += -Math.exp(mid * (tj - te)) * Math.sin(wg * tj) / sinTe;
        }
        if (aOpen + areaRet > 0) lo = mid; else hi = mid;
      }
      var alpha = 0.5 * (lo + hi);
      var dc = 0;
      im.fill(0);
      for (var s = 0; s < N; s++) {
        var ts = s / N;
        var v = ts < te ? (-Math.exp(alpha * (ts - te)) * Math.sin(wg * ts) / sinTe) : retBuf[s];
        re[s] = v;
        dc += v;
      }
      dc /= N;
      for (var s2 = 0; s2 < N; s2++) re[s2] -= dc;
      fft(re, im);
      var pRow = new Float64Array(NH), mRow = new Float64Array(NH);
      var m1 = Math.hypot(re[1], im[1]);
      for (var k = 1; k <= NH; k++) {
        var mk = Math.hypot(re[k], im[k]);
        mRow[k - 1] = 20 * Math.log10(Math.max(1e-9, mk / Math.max(1e-12, m1)));
        // Align closure at exactly Te (including its fractional sample). The
        // oscillator drives the tract with flow; lip radiation differentiates
        // it downstream. Integration's -1/4 turn cancels cosine-to-sine's +1/4.
        var pk = Math.atan2(im[k], re[k]) / (2 * Math.PI) + k * te;
        var anchor = ri ? phase[ri - 1][k - 1] : 0;
        pRow[k - 1] = pk - Math.round(pk - anchor);
      }
      phase[ri] = pRow; mag[ri] = mRow;
      oqArr[ri] = te; taArr[ri] = ta;
    }
    // Reference modal singing at Rd = 1.05 (midpoint of rows 7 and 8) so modal
    // singing retains every preset's calibrated spectral balance.
    var magDelta = new Array(NRD), refRow = new Float64Array(NH);
    for (var rk2 = 0; rk2 < NH; rk2++) refRow[rk2] = 0.5 * (mag[7][rk2] + mag[8][rk2]);
    for (var ri2 = 0; ri2 < NRD; ri2++) {
      var dRow = new Float64Array(NH);
      for (var k2 = 0; k2 < NH; k2++) dRow[k2] = Math.max(-18, Math.min(12, mag[ri2][k2] - refRow[k2]));
      magDelta[ri2] = dRow;
    }
    var rdCompDb = new Float64Array(NRD);
    for (var ri3 = 0; ri3 < NRD; ri3++) {
      var wSum = 0, pSumLf = 0;
      for (var k3 = 0; k3 < Math.min(10, NH); k3++) {
        var wk = 1 / ((k3 + 1) * (k3 + 1));
        wSum += wk;
        pSumLf += wk * Math.pow(10, magDelta[ri3][k3] / 10);
      }
      var shiftDb = 10 * Math.log10(Math.max(1e-6, pSumLf / wSum));
      rdCompDb[ri3] = Math.max(-5, Math.min(7, -0.85 * shiftDb));
    }
    lfTableCache = { phase: phase, magDelta: magDelta, rdCompDb: rdCompDb, oq: oqArr, ta: taArr, nh: NH, nrd: NRD, rdMin: RD_MIN, rdStep: RD_STEP };
    return lfTableCache;
  }

  /* ---------- 乐谱 → 控制帧 ---------- */
  function markPhonationPhrases(notes, events) {
    var eventIndex = 0;
    for (var first = 0; first < notes.length;) {
      if (notes[first]._rest || notes[first]._breath) { first++; continue; }
      var end = first + 1;
      while (end < notes.length && !notes[end]._rest && !notes[end]._breath &&
          notes[end]._start - notes[end - 1]._end < 0.06) end++;
      var startTime = notes[first]._pre === undefined ? notes[first]._start : notes[first]._pre;
      var endTime = notes[end - 1]._end;
      var onset = endTime, release = startTime;
      while (eventIndex < events.length && events[eventIndex].t1 <= startTime) eventIndex++;
      for (var j = eventIndex; j < events.length && events[j].t0 < endTime; j++) {
        var e = events[j];
        if (e.av > 0) {
          onset = Math.min(onset, Math.max(startTime, e.t0));
          release = Math.max(release, Math.min(endTime, e.t1));
        }
      }
      var chainEnd = endTime;
      for (var i = end - 1; i >= first; i--) {
        if (i === end - 1 || !notes[i + 1]._slur) chainEnd = notes[i]._end;
        notes[i]._chainEnd = chainEnd;
        notes[i]._phonationOnset = onset;
        notes[i]._phonationEnd = release;
      }
      first = end;
    }
  }

  function analyzeDryPhrases(notes, pit, timbre) {
    var cleanPit = (pit && pit.length) ? NSG.TUNING.pitPoints(pit) : null;
    var nLen = notes.length;
    var rawExpPitch = new Uint8Array(nLen);
    var rawExpDyn = new Uint8Array(nLen);
    var rawExpVib = new Uint8Array(nLen);
    var pitCur = 0;
    for (var i = 0; i < nLen; i++) {
      var ni = notes[i];
      if (ni._rest || ni._breath) continue;
      var hasP = false;
      if (Array.isArray(ni.pb)) {
        for (var pi = 0; pi < ni.pb.length; pi++) {
          if (Math.abs(ni.pb[pi][1]) > 0.5) { hasP = true; break; }
        }
      }
      if (!hasP && Array.isArray(ni.pitchPoints) && ni.pitchPoints.length > 2) hasP = true;
      if (!hasP && cleanPit && cleanPit.length) {
        var bLo = ni.start - 0.05, bHi = ni.start + ni.dur + 0.05;
        while (pitCur > 0 && cleanPit[pitCur][0] >= bLo) pitCur--;
        while (pitCur < cleanPit.length && cleanPit[pitCur][0] < bLo) pitCur++;
        for (var pk = pitCur; pk < cleanPit.length && cleanPit[pk][0] <= bHi; pk++) {
          if (Math.abs(cleanPit[pk][1]) > 0.5) { hasP = true; break; }
        }
      }
      rawExpPitch[i] = hasP ? 1 : 0;

      var hasD = false;
      if (Array.isArray(ni.gainPoints)) {
        for (var gi = 0; gi < ni.gainPoints.length; gi++) {
          if (Math.abs(ni.gainPoints[gi][1] - 1) > 0.015) { hasD = true; break; }
        }
      }
      if (!hasD && Number.isFinite(+ni.vel) && Math.abs(+ni.vel - 96) >= 2) hasD = true;
      if (!hasD && Array.isArray(ni.effortPoints) && ni.effortPoints.length > 0) hasD = true;
      rawExpDyn[i] = hasD ? 1 : 0;

      rawExpVib[i] = (ni.vibrato || ni.vib === 0) ? 1 : 0;
    }

    var vibConf = (timbre && timbre.vib) || {};
    var baseRate = (vibConf.rate > 0) ? vibConf.rate : 5.2;
    var baseDepth = (vibConf.depth > 0) ? vibConf.depth * 100 * 1.35 : 22;

    for (var first = 0; first < nLen;) {
      if (notes[first]._rest || notes[first]._breath) { first++; continue; }
      var end = first + 1;
      while (end < nLen && !notes[end]._rest && !notes[end]._breath &&
          notes[end]._start - notes[end - 1]._end < 0.06) end++;
      var phrHasPitch = false, phrHasDyn = false;
      var pMin = Infinity, pMax = -Infinity;
      for (var k = first; k < end; k++) {
        if (rawExpPitch[k]) phrHasPitch = true;
        if (rawExpDyn[k]) phrHasDyn = true;
        var ptc = notes[k].pitch || 60;
        if (ptc < pMin) pMin = ptc;
        if (ptc > pMax) pMax = ptc;
      }
      var pStartSec = notes[first]._start;
      var pEndSec = notes[end - 1]._end;
      var pDurSec = Math.max(0.05, pEndSec - pStartSec);
      var pSpan = Math.max(4, pMax - pMin);

      for (var k2 = first; k2 < end; k2++) {
        var nk = notes[k2];
        var expP = rawExpPitch[k2] || (phrHasPitch && Array.isArray(nk.pb) && nk.pb.length >= 2);
        var expD = rawExpDyn[k2] || (phrHasDyn && Array.isArray(nk.gainPoints) && nk.gainPoints.length >= 2);
        var expV = rawExpVib[k2];
        var seedVal = (((k2 + 1) * 2654435761) ^ ((nk.pitch | 0) * 97531) ^ Math.round((nk.start || 0) * 1000)) >>> 0;
        var prnd = mulberry32(seedVal);
        var r1 = prnd(), r2 = prnd(), r3 = prnd(), r4 = prnd(), r5 = prnd();
        var r6 = prnd(), r7 = prnd(), r8 = prnd(), r9 = prnd();
        var isPStart = k2 === first;
        var isPEnd = k2 === end - 1;
        var durSec = Math.max(0.01, nk._end - nk._start);
        var prevN = k2 > first ? notes[k2 - 1] : null;
        var nextN = k2 + 1 < end ? notes[k2 + 1] : null;
        var nextExpP = nextN ? (rawExpPitch[k2 + 1] || (phrHasPitch && Array.isArray(nextN.pb) && nextN.pb.length >= 2)) : true;

        var scoopCents = 0, scoopDur = 0;
        if (isPStart && durSec >= 0.20) {
          scoopCents = -(38 + 26 * r1) * (nk.pitch < 60 ? 1.15 : 1.0);
          scoopDur = Math.min(durSec * 0.34, 0.075 + 0.045 * r2);
        }

        var overCents = 0, overPeakT = 0, overSettleT = 0, dipCents = 0, dipDur = 0;
        if (!isPStart && prevN && !nk._slur && durSec >= 0.16) {
          var dp = nk.pitch - prevN.pitch;
          if (Math.abs(dp) >= 2) {
            overCents = (dp > 0 ? 1 : -1) * Math.min(26, (6 + 2.4 * Math.abs(dp)) * (0.75 + 0.5 * r3));
            overPeakT = Math.min(durSec * 0.22, 0.065);
            overSettleT = Math.min(durSec * 0.38, 0.11);
          } else if (dp === 0 && durSec >= 0.20) {
            dipCents = -(14 + 10 * r3);
            dipDur = Math.min(durSec * 0.32, 0.055);
          }
        }

        var preLeapCents = 0, preLeapDur = 0;
        if (!isPEnd && nextN && !nextN._slur && !nextExpP && durSec >= 0.18) {
          var nextDp = nextN.pitch - nk.pitch;
          if (Math.abs(nextDp) >= 4) {
            preLeapCents = -(nextDp > 0 ? 1 : -1) * 8;
            preLeapDur = Math.min(durSec * 0.22, 0.035);
          }
        }

        var fallCents = 0, fallDur = 0;
        if (isPEnd && durSec >= 0.36) {
          fallCents = -(20 + 22 * r4);
          fallDur = Math.min(durSec * 0.32, 0.13 + 0.06 * r5);
        }

        var sustainArchCents = durSec >= 0.45 ? (r6 * 2 - 1) * 5.5 : 0;
        var dryVib = !expV;
        var vibAllow = dryVib && ((isPEnd && durSec >= 0.38) || durSec >= 0.68);
        var vibRateBase = baseRate * (0.94 + 0.12 * r7);
        var vibDepthBase = Math.max(18, Math.min(34, baseDepth)) * (isPEnd ? 1.15 : 0.85) * (0.85 + 0.30 * r8);
        var vibDelay = Math.min(durSec * 0.42, 0.20 + 0.14 * r9);

        var pitchRel = ((nk.pitch || 60) - pMin) / pSpan;
        var noteArchDb = (isPStart ? -0.7 : 0) + 1.35 * (pitchRel - 0.45) - (isPEnd ? 0.6 : 0);

        nk._expr = {
          dryPitch: !expP,
          dryDyn: !expD,
          dryVib: dryVib,
          isPStart: isPStart,
          isPEnd: isPEnd,
          pStartSec: pStartSec,
          pEndSec: pEndSec,
          pDurSec: pDurSec,
          scoopCents: scoopCents,
          scoopDur: scoopDur,
          overCents: overCents,
          overPeakT: overPeakT,
          overSettleT: overSettleT,
          dipCents: dipCents,
          dipDur: dipDur,
          preLeapCents: preLeapCents,
          preLeapDur: preLeapDur,
          fallCents: fallCents,
          fallDur: fallDur,
          sustainArchCents: sustainArchCents,
          vibAllow: vibAllow,
          vibRateBase: vibRateBase,
          vibDepthBase: vibDepthBase,
          vibDelay: vibDelay,
          noteArchDb: noteArchDb
        };
      }
      first = end;
    }
  }

  function resolveArticMorph(timbre, opt) {
    if (NSG.LEGACY_SOUND || (opt && opt.rawSource)) return 0;
    if (opt && opt.articMorph !== undefined) return clampUnit(opt.articMorph);
    if (timbre && Number.isFinite(timbre.articMorph)) return clampUnit(timbre.articMorph);
    return 0.5;
  }

  function unroundPairs(pairs, baseLip) {
    var lip = pairs && pairs._lip !== undefined ? pairs._lip : baseLip;
    var f = new Float64Array(6);
    for (var i = 0; i < 6; i++) {
      var sc = NSG.lipScaleAt(lip, i);
      f[i] = pairs[i][0] * (sc > 1e-6 ? 1 / sc : 1);
    }
    return { f: f, lip: lip };
  }

  /* CHIMERA-style Öhman vowel-to-vowel coarticulation field:
     vowel gestures overlap across intervening consonants with smooth cosine ramps
     in unrounded oral-tract space, while lip rounding tracks as its own coordinate. */
  function buildOhmanField(ev, baseLip) {
    var anchors = [];
    var phraseStart = 0;
    for (var i = 0; i <= ev.length; i++) {
      var isBreak = i === ev.length || ev[i].kind === 'B' ||
        (i > phraseStart && ev[i].t0 - ev[i - 1].t1 > 0.06);
      if (!isBreak) continue;
      var phraseVowels = [];
      for (var j = phraseStart; j < i; j++) {
        if (ev[j].kind === 'V') phraseVowels.push(ev[j]);
      }
      for (var m = 0; m < phraseVowels.length; m++) {
        var e = phraseVowels[m];
        var prevV = m > 0 ? phraseVowels[m - 1] : null;
        var nextV = m + 1 < phraseVowels.length ? phraseVowels[m + 1] : null;
        var dur = Math.max(1e-4, e.t1 - e.t0);
        var prevDur = prevV ? Math.max(1e-4, prevV.t1 - prevV.t0) : 0;
        var nextDur = nextV ? Math.max(1e-4, nextV.t1 - nextV.t0) : 0;
        var isMedialJoin = !!(prevV && e.xf > 0.04 && prevDur < 0.025);
        var rampIn = 0;
        if (e.glideFrom) {
          rampIn = Math.min(0.14, prevDur * 0.25);
        } else if (!prevV) {
          rampIn = 0.07;
        } else {
          var gapPrev = e.t0 - prevV.t1;
          if (gapPrev > 0.002) rampIn = Math.min(0.18, 0.85 * gapPrev + 0.075);
          else if (!isMedialJoin) rampIn = Math.min(0.09, dur * 0.35, prevDur * 0.35);
        }
        var rampOut = 0;
        if (nextV && nextV.glideFrom) {
          rampOut = Math.min(0.06, nextDur * 0.35);
        } else if (!nextV) {
          rampOut = 0.09;
        } else {
          var gapNext = nextV.t0 - e.t1;
          if (gapNext > 0.002) rampOut = Math.min(0.16, 0.75 * gapNext + 0.065);
          else if (!(nextV.xf > 0.04 && dur < 0.025)) rampOut = Math.min(0.08, dur * 0.30, nextDur * 0.30);
        }
        var main = unroundPairs(e.pairs, baseLip);
        var entry = e.glideFrom ? unroundPairs(e.glideFrom, baseLip) : main;
        var exit = e.closeTo ? unroundPairs(e.closeTo, baseLip) : main;
        var preGlide = (nextV && nextV.glideFrom && !e.closeTo) ? unroundPairs(nextV.pairs, baseLip) : null;
        if (e.glideFrom && prevV && !prevV.closeTo) {
          var leaned = new Float64Array(6);
          for (var lg = 0; lg < 6; lg++) leaned[lg] = entry.f[lg] + (main.f[lg] - entry.f[lg]) * 0.25;
          entry = { f: leaned, lip: entry.lip + (main.lip - entry.lip) * 0.25 };
        }
        anchors.push({
          e: e, t0: e.t0, t1: e.t1, rampIn: rampIn, rampOut: rampOut,
          lo: e.t0 - rampIn, hi: e.t1 + rampOut,
          entry: entry, main: main, exit: exit, preGlide: preGlide
        });
      }
      phraseStart = (i < ev.length && ev[i].kind === 'B') ? i + 1 : i;
    }
    return anchors;
  }

  function evalAnchorAt(a, t) {
    if (t <= a.t0) return a.entry;
    if (t >= a.t1) return a.exit;
    var f = a.main.f, lip = a.main.lip;
    var e = a.e;
    if (e.glideFrom) {
      var gr = Math.min(1, Math.max(0, (t - e.t0) / Math.max(1e-6, e.t1 - e.t0)));
      gr = gr * gr * (3 - 2 * gr);
      var outF = new Float64Array(6);
      for (var k = 0; k < 6; k++) outF[k] = a.entry.f[k] + (f[k] - a.entry.f[k]) * gr;
      f = outF;
      lip = a.entry.lip + (lip - a.entry.lip) * gr;
    }
    if (a.preGlide) {
      var pgDur = Math.min(0.16, (e.t1 - e.t0) * 0.32);
      var pgr = Math.max(0, Math.min(1, 1 - (e.t1 - t) / Math.max(1e-6, pgDur)));
      if (pgr > 0) {
        pgr = pgr * pgr * (3 - 2 * pgr) * 0.25;
        var outP = new Float64Array(6);
        for (var pk = 0; pk < 6; pk++) outP[pk] = f[pk] + (a.preGlide.f[pk] - f[pk]) * pgr;
        f = outP;
        lip = lip + (a.preGlide.lip - lip) * pgr;
      }
    }
    if (e.closeTo) {
      var closeDur = Math.min(0.240, (e.t1 - e.t0) * 0.50);
      var cr = Math.max(0, Math.min(1, 1 - (e.t1 - t) / Math.max(1e-6, closeDur)));
      if (cr > 0) {
        cr = cr * cr * (3 - 2 * cr);
        var outC = new Float64Array(6);
        for (var c = 0; c < 6; c++) outC[c] = f[c] + (a.exit.f[c] - f[c]) * cr;
        f = outC;
        lip = lip + (a.exit.lip - lip) * cr;
      }
    }
    return { f: f, lip: lip };
  }

  function sampleOhmanField(anchors, t, outF) {
    if (!anchors || !anchors.length) return null;
    var wSum = 0, lipSum = 0;
    for (var k = 0; k < 6; k++) outF[k] = 0;
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (t <= a.lo || t >= a.hi) continue;
      var act = 1;
      if (t < a.t0) {
        act = a.rampIn > 0 ? 0.5 * (1 - Math.cos(Math.PI * (t - a.lo) / a.rampIn)) : 0;
      } else if (t > a.t1) {
        act = a.rampOut > 0 ? 0.5 * (1 + Math.cos(Math.PI * (t - a.t1) / a.rampOut)) : 0;
      }
      if (act <= 1e-6) continue;
      var val = evalAnchorAt(a, t);
      wSum += act;
      lipSum += act * val.lip;
      for (var fk = 0; fk < 6; fk++) outF[fk] += act * val.f[fk];
    }
    if (wSum <= 1e-6) return null;
    var invW = 1 / wSum;
    for (var ok = 0; ok < 6; ok++) outF[ok] *= invW;
    return { f: outF, lip: lipSum * invW };
  }

  // Selective articulatory freedom [wF1, wF2, wF3, wLip]: how freely vowel-to-vowel
  // coarticulation passes through a consonant without erasing its place cues.
  var FREEDOM_VOWEL = [0.35, 0.45, 0.40, 0.60];
  var FREEDOM_ZERO = [0, 0, 0, 0];
  function placeFreedom(e, inXf, nasalFromActive) {
    if (!e || e.kind === 'B') return FREEDOM_ZERO;
    if (e.kind === 'V') return (inXf || nasalFromActive) ? FREEDOM_ZERO : FREEDOM_VOWEL;
    var isClosure = e.kind === 'S' || e.kind === 'VB';
    var pl = e.pl || '';
    if (pl === 'glo') return [isClosure ? 0.05 : 0.85, 0.90, 0.90, 0.95];
    if (pl === 'lab') {
      if (e.kind === 'G') return [0.22, 0.32, 0.32, 0.25];
      if (e.kind === 'F' && !e.release) return [0.22, 0.50, 0.45, 0.50];
      return [isClosure ? 0.05 : 0.15, 0.50, 0.45, 0.35];
    }
    if (e.sonorant === 'L') return [0.06, 0.15, 0.12, 0.25];
    if (pl === 'alv') return [isClosure ? 0.05 : 0.12, 0.25, 0.20, 0.80];
    if (pl === 'ret' || pl === 'pal') return [isClosure ? 0.05 : 0.12, 0.22, 0.18, 0.80];
    if (pl === 'vel' || pl === 'uvu') return [isClosure ? 0.05 : 0.12, 0.48, 0.30, 0.80];
    if (pl === 'lv') return [0.08, 0.35, 0.28, 0.45];
    return [isClosure ? 0.05 : 0.15, 0.35, 0.28, 0.60];
  }

  // Exact analytical step for critically damped 2nd-order tracking: x'' = w^2(T-x) - 2w x'.
  function stepCritDamped(xArr, vArr, idx, tgt, hz, speed, dt) {
    var w = 2 * Math.PI * hz * speed;
    var e0 = xArr[idx] - tgt;
    var v0 = vArr[idx];
    var decay = Math.exp(-w * dt);
    var c = v0 + w * e0;
    xArr[idx] = tgt + decay * (e0 + c * dt);
    vArr[idx] = decay * (v0 - w * c * dt);
  }

  function scoreToControl(score, timbre, tm, lang, research, balanceAspiration, japaneseFriction, japaneseVoicedFriction, nasalRelease, aspAirMix, nasalTract, highVowelOpening, organicAmt, humanizeAmt, frameRange, articMorphAmt, autoExpressOpt) {
    var built = buildEvents(score, timbre, tm, lang, japaneseFriction, japaneseVoicedFriction, undefined, nasalRelease, nasalTract);
    var ev = built.ev, notes = built.notes;
    var pitchModel = NSG.TUNING.pitchModel(notes, built.pit);
    if (!notes.length) return { ctrl: [], total: 0, startFrame: 0, endFrame: 0 };

    var tEnd = 0;
    for (var i = 0; i < ev.length; i++) if (ev[i].t1 > tEnd) tEnd = ev[i].t1;
    notes.forEach(function (note) { tEnd = Math.max(tEnd, note._end); });
    tEnd += 0.35;
    var dt = HOP / SR;
    var nFrames = Math.ceil(tEnd / dt) + 2;
    var frStart = frameRange ? Math.max(0, frameRange[0] | 0) : 0;
    var frEnd = (frameRange && frameRange[1] > 0) ? Math.max(frStart, frameRange[1] | 0) : nFrames;
    var ctrl = new Array(frEnd - frStart);

    var cur = [[500, 90], [1500, 100], [2500, 130], [3300, 190], [4200, 240], [5200, 300]];
    var morphAmt = articMorphAmt === undefined ? resolveArticMorph(timbre) : clampUnit(articMorphAmt);
    var baseLip = timbre.lip || 0;
    var ohmanField = morphAmt > 0 ? buildOhmanField(ev, baseLip) : null;
    var ohmanBuf = morphAmt > 0 ? new Float64Array(6) : null;
    var ARTIC_HZ_F = [16.5, 15.0, 18.0, 16.0, 16.0, 16.0];
    var ARTIC_HZ_B = [18.0, 17.0, 18.0, 17.0, 17.0, 17.0];
    var ARTIC_HZ_LIP = 13.5;
    var ARTIC_HZ_JAW = 15.5;
    var articState = null;
    if (morphAmt > 0) {
      articState = {
        x: new Array(6),
        v: [0, 0, 0, 0, 0, 0],
        bw: [cur[0][1], cur[1][1], cur[2][1], cur[3][1], cur[4][1], cur[5][1]],
        bv: [0, 0, 0, 0, 0, 0],
        lip: baseLip,
        lipV: 0,
        jaw: 0,
        jawV: 0
      };
      for (var isk = 0; isk < 6; isk++) {
        var initScK = NSG.lipScaleAt(baseLip, isk);
        articState.x[isk] = cur[isk][0] * (initScK > 1e-6 ? 1 / initScK : 1);
      }
    }
    var curFric = 0, curTn = 0, curTnLpHz = 0, curFricF = 5000, curFricB = 1200, curNasal = 0, curAv = 0, curMidi = notes.length ? notes[0].pitch : 60;
    var curJaFricF = curFricF, curJaFricB = curFricB, curFrontCavity = 0, curLip = baseLip;

    var aForm = 1 - Math.exp(-dt / 0.012);     // 共振峰时间常数 12ms，约 36ms 到 95%
    // 鼻音的闭塞/除阻是突变：12ms 的平滑会让 n→元音 变成 l 那样的缓慢滑移。
    var aFormFast = 1 - Math.exp(-dt / 0.004);
    var aFormLat = 1 - Math.exp(-dt / ZH_L_TAU);
    // 鼻腔段（极点+零点）按比例混入：进入时随共振峰一起（12ms），除阻时快速退出（4ms）。
    // 零点固定在目标位置，不从极点扫出——零点贴近窄极点时系数达几十，逐帧扫动会出一下咔声。
    var aMixOut = aFormFast;
    var poleHz = NASAL_POLE * nasalScale(timbre), curZ = 1700 * nasalScale(timbre), curMix = 0;
    var aAmpU = 1 - Math.exp(-dt / 0.008);
    var aAmpD = 1 - Math.exp(-dt / 0.038);
    var aClose = 1 - Math.exp(-dt / 0.002);
    var aFric = 1 - Math.exp(-dt / 0.006);
    var aTn = 1 - Math.exp(-dt / 0.003);

    /* 共振守卫：等力度补偿按音符的稳态（目标声道 + 谱面音高）定一次增益。
       滑音、颤音或声道过渡途中，某阶谐波可能扫过窄的 F1/F2，瞬时多出 10–20dB，
       听起来是一下“冲”或爆。每 8ms 比较当前声道与当前 F0 的级联功率和该音稳态功率，
       超出 2dB 的部分全部压回；只降不升，正常的颤音起伏与力度不受影响。 */
    var ha = timbre.harm || NSG.defaultHarm(), tiltG = timbre.tiltDb || 0, glG = NSG.sourceFilterOf(timbre);
    var guard = 1, guardT = 1, guardIdle = true, aGuardD = 1 - Math.exp(-dt / 0.008), aGuardU = 1 - Math.exp(-dt / 0.015);
    var guardRefCache = { pairs: null, pitch: NaN, tilt: NaN, az: -1, power: 0 };
    var guardXfCache = { xfPairs: null, pairs: null, pitch: NaN, tilt: NaN, az: -1, p0: 0, p1: 0 };
    var lastVoicedHighGate = 1;
    var aspirationScale = 1, aspirationTarget = 1, aspirationReference = 1;
    var airMixCtrl = typeof aspAirMix === 'number' ? aspAirMix : (research ? 0.18 : 0);
    if (balanceAspiration && (studioMode || timbre.breath > 0)) {
      var referencePairs = NSG.formantsOf(NSG.PHONES.a, timbre).pairs;
      if (studioMode) applyHawksMillerBw(referencePairs, timbre);
      aspirationReference = refPower(timbre) / Math.max(1e-24, aspirationPower(referencePairs, timbre.outEq, airMixCtrl));
    }

    var ci = 0, noteIdx = 0, velocity = 1, mixGain = 1, lastF0 = NSG.mtof(curMidi);
    var sungEffort = 0, effortTilt = 0, effortAlpha = 1 - Math.exp(-dt / 0.025);
    var abductLevel = studioMode ? 1.0 : 0, aAbdClose = 1 - Math.exp(-dt / 0.008), aAbdAdduct = 1 - Math.exp(-dt / 0.020);
    var dynOctCur = 0, aDynOct = 1 - Math.exp(-dt / 0.035);
    var postVlPitchBoost = 0, prevWasVoicelessObs = false, aPostVlPitch = 1 - Math.exp(-dt / 0.032);
    var orgAmt = clampUnit(organicAmt);
    var humAmt = clampUnit(humanizeAmt);
    var org = null, orgGate = 0, orgVoicedSec = 0, orgGateAlpha = 1 - Math.exp(-dt / 0.030);
    if (orgAmt > 0) {
      var ornd = mulberry32(0x4f1bbcdc);
      org = {
        f0: makePinkBand(ornd, 0.65, 2.4, dt),
        f1: makePinkBand(ornd, 0.75, 2.2, dt),
        f2: makePinkBand(ornd, 1.1, 3.4, dt),
        f3: makePinkBand(ornd, 1.3, 4.0, dt),
        hi: makePinkBand(ornd, 0.85, 2.5, dt),
        bw: makePinkBand(ornd, 1.5, 4.5, dt),
        tilt: makePinkBand(ornd, 1.8, 5.5, dt),
        air: makePinkBand(ornd, 1.2, 4.5, dt)
      };
    }
    var nasScHum = nasalScale(timbre);
    var humCenterHz = timbre.refF0 ? timbre.refF0 : Math.max(145, Math.min(350, 210 * Math.pow(nasScHum, 1.45)));
    var isHighVoiceHum = humCenterHz >= 240;
    var humBaseRd = 1.05, humCurRd = 1.05, humRdAlpha = 1 - Math.exp(-dt / 0.022);
    var humPassHz = 320, lfTab = null;
    var releaseTaper = 1, releaseBreath = 1;
    var autoExpress = autoExpressOpt === undefined ? studioMode : !!autoExpressOpt;
    var exprDynCur = 0, aExprDyn = 1 - Math.exp(-dt / 0.040);
    var stVibPhase = 0, stVibActive = false;
    if (humAmt > 0) {
      lfTab = getLfTable();
      // Base vocal-fold tension from timbre cues: breathier/softer -> higher Rd,
      // chestier/stronger glottal -> lower Rd.
      humBaseRd = Math.max(0.75, Math.min(1.45,
        1.05 + 1.8 * ((timbre.breath || 0) - 0.035) - 0.25 * (timbre.glottal || 0) - 0.015 * (timbre.tiltDb || 0)));
      humCurRd = humBaseRd;
      humPassHz = (studioMode ? 305 : 310) * Math.pow(nasScHum, studioMode ? 0.85 : 0.78);
      markPhonationPhrases(notes, ev);
      if (studioMode && autoExpress) analyzeDryPhrases(notes, built.pit, timbre);
    }
    for (var fr = frStart; fr < frEnd; fr++) {
      var ctrlIdx = fr - frStart;
      var t = fr * dt;
      while (ci < ev.length && t >= ev[ci].t1) ci++;
      var e = (ci < ev.length && t >= ev[ci].t0) ? ev[ci] : null;

      var tgtPairs = e ? e.pairs : cur;
      var tgtLip = (e && e.pairs && e.pairs._lip !== undefined) ? e.pairs._lip : (articState ? articState.lip : baseLip);
      var tgtAv = e ? e.av : 0;
      var tgtFric = e ? (e.fric || 0) : 0;
      var tgtTn = e ? (e.tn || 0) : 0;
      var nasalFromHere = false;
      if (e && e.nasalFrom) {
        var nSeconds = Math.min(e.nasalFromDur || 0.085, (e.t1 - e.t0) * 0.45);
        var nr = Math.max(0, Math.min(1, (t - e.t0) / Math.max(1e-6, nSeconds)));
        if (nr < 1) nasalFromHere = true;
        nr = nr * nr * (3 - 2 * nr);
        var released = copyPairs(e.pairs);
        for (var nk = 1; nk <= 2; nk++) for (var nd = 0; nd < 2; nd++)
          released[nk][nd] = e.nasalFrom[nk][nd] + (e.pairs[nk][nd] - e.nasalFrom[nk][nd]) * nr;
        tgtPairs = released;
      }
      if (e && e.glideFrom) {
        var grSpan = Math.max(1e-6, (e.t1 - e.t0) * (studioMode ? 0.76 : 1.0));
        var gr = Math.min(1, Math.max(0, (t - e.t0) / grSpan));
        gr = gr * gr * (3 - 2 * gr);
        var glideStartBias = (morphAmt > 0 && ci > 0 && !ev[ci - 1].closeTo && ev[ci - 1].kind === 'V') ? (studioMode ? 0.30 : 0.25) * morphAmt : 0;
        var grEff = glideStartBias + (1 - glideStartBias) * gr;
        var glided = new Array(6);
        for (var gk = 0; gk < 6; gk++) glided[gk] = [e.glideFrom[gk][0] + (e.pairs[gk][0] - e.glideFrom[gk][0]) * grEff,
          e.glideFrom[gk][1] + (e.pairs[gk][1] - e.glideFrom[gk][1]) * grEff];
        tgtPairs = glided;
        if (e.glideFrom._lip !== undefined) tgtLip = e.glideFrom._lip + (tgtLip - e.glideFrom._lip) * grEff;
      } else if (morphAmt > 0 && e && e.kind === 'V' && !e.closeTo && ci + 1 < ev.length && ev[ci + 1].glideFrom && Math.abs(ev[ci + 1].t0 - e.t1) < 1e-6) {
        var nextGlideEv = ev[ci + 1];
        var pgDurCtrl = Math.min(studioMode ? 0.14 : 0.16, (e.t1 - e.t0) * (studioMode ? 0.36 : 0.32));
        var pgrCtrl = Math.max(0, Math.min(1, 1 - (e.t1 - t) / Math.max(1e-6, pgDurCtrl)));
        if (pgrCtrl > 0) {
          pgrCtrl = pgrCtrl * pgrCtrl * (3 - 2 * pgrCtrl) * (studioMode ? 0.30 : 0.25) * morphAmt;
          var preGlided = new Array(6);
          for (var pgk = 0; pgk < 6; pgk++) preGlided[pgk] = [tgtPairs[pgk][0] + (nextGlideEv.pairs[pgk][0] - tgtPairs[pgk][0]) * pgrCtrl,
            tgtPairs[pgk][1] + (nextGlideEv.pairs[pgk][1] - tgtPairs[pgk][1]) * pgrCtrl];
          tgtPairs = preGlided;
          if (nextGlideEv.pairs._lip !== undefined) tgtLip = tgtLip + (nextGlideEv.pairs._lip - tgtLip) * pgrCtrl;
        }
      }
      if (e && e.closeTo) {
        // 以当前事件长度计算：后续声母可能向这个元音借时间，不能沿用借时前的边界。
        var maxCloseDur = 0.090 + (0.240 - 0.090) * morphAmt;
        var maxCloseFrac = 0.30 + (0.50 - 0.30) * morphAmt;
        var closeDur = Math.min(maxCloseDur, (e.t1 - e.t0) * maxCloseFrac);
        var cr = Math.max(0, Math.min(1, 1 - (e.t1 - t) / Math.max(1e-6, closeDur)));
        if (cr > 0) {
          cr = cr * cr * (3 - 2 * cr);
          var closing = new Array(6);
          for (var ck = 0; ck < 6; ck++) closing[ck] = [tgtPairs[ck][0] + (e.closeTo[ck][0] - tgtPairs[ck][0]) * cr,
            tgtPairs[ck][1] + (e.closeTo[ck][1] - tgtPairs[ck][1]) * cr];
          tgtPairs = closing;
          if (e.closeTo._lip !== undefined) tgtLip = tgtLip + (e.closeTo._lip - tgtLip) * cr;
        }
      }
      var burstImp = 0, burstAmp = 0, isAffrBurst = false;
      if (e && e.kind === 'F') {
        // An advanced neighbour fades this tail itself; do not release its
        // friction early at the shortened scheduler boundary as well.
        var flowEnd = e.nominalT1 === undefined ? e.t1 : e.nominalT1;
        var elapsed = t - e.t0, left = flowEnd - t, length = flowEnd - e.t0;
        var prevFricSame = !e.release && ci > 0 && ev[ci - 1].kind === 'F' && !ev[ci - 1].release &&
          Math.abs(ev[ci - 1].t1 - e.t0) < 1e-6 && Math.abs((ev[ci - 1].fc || 0) - (e.fc || 0)) < 200;
        var nextFricSame = !e.release && ci + 1 < ev.length && ev[ci + 1].kind === 'F' && !ev[ci + 1].release &&
          Math.abs(ev[ci + 1].t0 - e.t1) < 1e-6 && Math.abs((ev[ci + 1].fc || 0) - (e.fc || 0)) < 200;
        // 留住爆破/摩擦本身，但避免矩形噪声起止；送气塞音保留较长的气流尾。
        var attack = prevFricSame ? 1 : Math.min(1, elapsed / Math.min(e.flowAttack || (e.burstBoost ? 0.001 : 0.003), length * (e.flowAttackFraction || 0.25)));
        if (e.flowAttack && !prevFricSame) attack *= attack * (3 - 2 * attack);
        var release = nextFricSame ? 1 : Math.min(1, left / Math.min(0.008, length * 0.20));
        tgtFric *= attack * release * (e.burstBoost ? 1 + e.burstBoost * Math.exp(-elapsed / 0.012) : 1);
        if (e.aspPairs) {
          var aspEnd = e.aspEnd || 1;
          var ar = Math.max(0, Math.min(1, (elapsed / Math.max(1e-6, length) - e.aspStart) / Math.max(1e-4, aspEnd - e.aspStart)));
          ar = ar * ar * (3 - 2 * ar);
          tgtFric *= 1 - (1 - (e.aspFricFloor !== undefined ? e.aspFricFloor : 0.08)) * ar;
          tgtTn *= ar;
          var aspPairs = new Array(6);
          for (var ap = 0; ap < 6; ap++) aspPairs[ap] = [e.pairs[ap][0] + (e.aspPairs[ap][0] - e.pairs[ap][0]) * ar,
            e.pairs[ap][1] + (e.aspPairs[ap][1] - e.pairs[ap][1]) * ar];
          tgtPairs = aspPairs;
          if (e.aspPairs._lip !== undefined) tgtLip = tgtLip + (e.aspPairs._lip - tgtLip) * ar;
        }
        if (e.toPairs) {
          var aspSpan = e.aspToVowel || ASP_TO_VOWEL;
          if (elapsed >= aspSpan) {
            tgtPairs = e.toPairs;
            if (e.toPairs._lip !== undefined) tgtLip = e.toPairs._lip;
          } else if (elapsed > 0) {
            var tr = Math.min(1, elapsed / aspSpan);
            tr = tr * tr * (3 - 2 * tr);
            var relPairs = new Array(6);
            for (var tk = 0; tk < 6; tk++) {
              relPairs[tk] = [tgtPairs[tk][0] + (e.toPairs[tk][0] - tgtPairs[tk][0]) * tr,
                tgtPairs[tk][1] + (e.toPairs[tk][1] - tgtPairs[tk][1]) * tr];
            }
            tgtPairs = relPairs;
            if (e.toPairs._lip !== undefined) tgtLip = tgtLip + (e.toPairs._lip - tgtLip) * tr;
          }
        }
        if (e.release) {
          // 爆破只有几毫秒；之后的气流由声道噪声承担，带通里只留很弱的尾巴。
          if (studioMode) {
            var stAspFloor = ((e.asp || 0) / BURST_GAIN) * 0.22;
            tgtFric *= stAspFloor + (1 - stAspFloor) * Math.exp(-elapsed / 0.0055);
          } else {
            tgtFric *= (e.asp || 0) / BURST_GAIN + (1 - (e.asp || 0) / BURST_GAIN) * Math.exp(-elapsed / 0.005);
          }
          // 送气在爆破后 3ms 起、到声带起振前 12ms 内淡出，与元音起音交叠而不留缝。
          tgtTn *= Math.min(1, Math.max(0, elapsed - 0.002) / 0.004) * Math.min(1, left / Math.min(0.012, length * 0.5));
          if (studioMode && !e.sonorant && e.fric > 0 && elapsed < 0.006) {
            var evVelRel = (e.noteVel !== undefined && t < e.noteStart - 1e-6) ? e.noteVel : velocity;
            burstImp = elapsed < dt * 1.05 ? 1.0 : Math.exp(-(elapsed - dt) / 0.0018) * 0.65;
            burstAmp = e.fric * evVelRel;
          }
        } else {
          tgtTn *= attack * release;
          if (studioMode && e.affricateBurst > 0 && elapsed < 0.008) {
            var evVelAffr = (e.noteVel !== undefined && t < e.noteStart - 1e-6) ? e.noteVel : velocity;
            burstImp = elapsed < dt * 1.05 ? 1.0 : Math.exp(-(elapsed - dt) / 0.0024) * 0.55;
            burstAmp = e.affricateBurst * evVelAffr;
            isAffrBurst = true;
          }
        }
      }
      // 在闭塞开始前的最后 4ms 收声，避免把一个短闭塞全耗在 38ms 拖尾里。
      var nextEvent = ev[ci + 1];
      if (e && nextEvent && nextEvent.kind === 'S' && !nextEvent.anticipation && Math.abs(nextEvent.t0 - e.t1) < 1e-6) {
        var closeFade = Math.min(1, (e.t1 - t) / Math.min(0.004, (e.t1 - e.t0) * 0.25));
        tgtAv *= closeFade; tgtFric *= closeFade; tgtTn *= closeFade;
      }
      if (e && e.kind === 'B') {
        var bU = Math.max(0, Math.min(1, (t - e.t0) / Math.max(1e-6, e.t1 - e.t0)));
        var bEnv, bpEnv = e.brProfile ? e.brProfile.env : '';
        if (bpEnv === 'soft') {
          bEnv = Math.pow(Math.sin(Math.PI * bU), 1.15);
        } else if (bpEnv === 'full') {
          bEnv = Math.pow(Math.sin(Math.PI * Math.pow(bU, 0.70)), 0.80);
        } else if (bpEnv === 'gasp') {
          bEnv = Math.pow(Math.sin(Math.PI * Math.pow(bU, 0.48)), 0.65);
        } else if (bpEnv === 'deep') {
          bEnv = Math.pow(Math.sin(Math.PI * Math.pow(bU, 0.88)), 0.90);
        } else if (bpEnv === 'sigh') {
          var sAtt = Math.min(1, bU / 0.14);
          sAtt = sAtt * sAtt * (3 - 2 * sAtt);
          bEnv = sAtt * Math.pow(1 - bU, 1.35) * 1.45;
        } else if (humAmt > 0) {
          // 非对称双段吸气包络：较快吸入、柔和滞留、起唱前轻顿；频心由咽喉滑向唇齿。
          var bSin = Math.sin(Math.PI * bU);
          var bAsym = Math.pow(Math.sin(Math.PI * Math.pow(bU, 0.72)), 0.85);
          bEnv = bSin + (bAsym - bSin) * humAmt;
        } else {
          // 一次吸气平滑起落，不混入声带基音。
          bEnv = Math.sin(Math.PI * bU);
        }
        tgtFric *= bEnv;
        tgtTn *= bEnv;
      }
      /* 交叉淡化：前置声母的开头一段与上一个字的浊音尾重叠。上一个元音的声带音和声道形状
         线性让位，辅音的摩擦/送气/鼻腔同时渐入，连唱不会在字与字之间断一下。 */
      var inXf = !!(e && e.xf && t - e.t0 < e.xf), xr = 1;
      if (inXf) {
        xr = Math.max(0, (t - e.t0) / e.xf);
        if (e.anticipation) xr = xr * xr * (3 - 2 * xr);
        var linAv = e.xfAv * (1 - xr) + tgtAv * xr;
        tgtAv = (studioMode && e.kind === 'V' && e.xfAv > 0.30 && tgtAv > 0.30)
          ? Math.max(linAv, Math.min(e.xfAv, tgtAv) * 0.94)
          : linAv;
        if (e.xfFric !== undefined) {
          var xfF = e.xfRelease ? e.xfFric * ((e.xfReleaseFloor || 0) + (1 - (e.xfReleaseFloor || 0)) * Math.exp(-(t - e.t0) / 0.005)) : e.xfFric;
          tgtFric = xfF * (1 - xr) + tgtFric * xr;
        }
        if (e.xfTn !== undefined) tgtTn = e.xfTn * (1 - xr) + tgtTn * xr;
        if (!e.anticipation) { tgtFric *= xr; tgtTn *= xr; }
        var blended = new Array(6);
        for (var bk = 0; bk < 6; bk++) blended[bk] = [e.xfPairs[bk][0] + (tgtPairs[bk][0] - e.xfPairs[bk][0]) * xr,
          e.xfPairs[bk][1] + (tgtPairs[bk][1] - e.xfPairs[bk][1]) * xr];
        tgtPairs = blended;
        if (e.xfPairs._lip !== undefined) tgtLip = e.xfPairs._lip + (tgtLip - e.xfPairs._lip) * xr;
      }

      var prevEv = ci > 0 ? ev[ci - 1] : null;
      // 只加快除阻（鼻音→元音）：闭合时声带仍在振动，突然改峰会在入口处出一下 +6dB 的咔声。
      var nasalEdge = !!e && e.kind !== 'N' && !!prevEv && prevEv.kind === 'N' &&
        Math.abs(e.t0 - prevEv.t1) < 1e-6 && t - e.t0 < NASAL_RELEASE;
      var tapEdge = !!e && !!prevEv && prevEv.sonorant === 'T' && e.kind === 'V' &&
        Math.abs(e.t0 - prevEv.t1) < 1e-6 && t - e.t0 < 0.020;
      var aF = (e && e.sonorant === 'T') || nasalEdge ? aFormFast :
        e && e.sonorant ? aFormLat : aForm;
      // 普通话 l 除阻：F1/F2 快速打开，F3 以上仍按原速平滑（边音 F3 本就接近元音）。
      var latEdge = !!e && !!prevEv && prevEv.latRelease && e.kind === 'V' &&
        Math.abs(e.t0 - prevEv.t1) < 1e-6 && t - e.t0 < ZH_L_RELEASE;
      // Optional HiFi experiment. Follow the sung F0 through pitch bends and
      // sustains. Limit the opening to keep each vowel's F1 distinct from F2.
      var firstTarget = tgtPairs[0][0];
      var rawJawLift = 0;
      if (highVowelOpening > 0 && e && e.kind === 'V') {
        if (studioMode) {
          var lift = 0;
          if (firstTarget >= 420 && lastF0 > 290 && humCurRd < 1.42) {
            var regHi = Math.max(0, Math.min(1, (lastF0 - 290) / 140));
            var mixGate = Math.max(0, Math.min(1, (1.42 - humCurRd) / 0.35));
            var targetF1Mix = Math.min(lastF0 * 1.92, firstTarget * 1.52, tgtPairs[1][0] * 0.78, 1080);
            lift = Math.max(0, targetF1Mix - firstTarget) * regHi * mixGate;
          } else if (firstTarget < 420 && lastF0 > 260 && lastF0 * 1.12 > firstTarget) {
            var regClose = lastF0 >= 350 ? (0.30 + 0.70 * Math.min(1, (lastF0 - 350) / 180)) : (0.30 * (lastF0 - 260) / 90);
            var targetF1Close = Math.min(lastF0 * 1.12, firstTarget * 1.62, tgtPairs[1][0] * 0.76);
            lift = Math.max(0, targetF1Close - firstTarget) * regClose;
          }
          rawJawLift = lift * highVowelOpening * (inXf ? xr : 1);
          if (!articState) firstTarget += rawJawLift;
        } else if (lastF0 > 260 && lastF0 > firstTarget) {
          var register = lastF0 >= 350 ? (0.25 + 0.75 * Math.min(1, (lastF0 - 350) / 200)) : (0.25 * (lastF0 - 260) / 90);
          var liftOld = Math.max(0, Math.min(lastF0 - firstTarget, firstTarget * 0.44, tgtPairs[1][0] * 0.80 - firstTarget));
          rawJawLift = liftOld * highVowelOpening * register * (inXf ? xr : 1);
          if (!articState) firstTarget += rawJawLift;
        }
      }
      var vbRel = !!e && e.kind === 'F' && !!prevEv && prevEv.kind === 'VB' && Math.abs(e.t0 - prevEv.t1) < 1e-6;
      if (articState) {
        var ohman = e ? sampleOhmanField(ohmanField, t, ohmanBuf) : null;
        var free = ohman ? placeFreedom(e, inXf, nasalFromHere) : FREEDOM_ZERO;
        var tgtU = new Float64Array(6);
        for (var uk = 0; uk < 6; uk++) {
          var tgtLipScK = NSG.lipScaleAt(tgtLip, uk);
          tgtU[uk] = tgtPairs[uk][0] * (tgtLipScK > 1e-6 ? 1 / tgtLipScK : 1);
        }
        if (ohman) {
          for (var fk = 0; fk < 3; fk++) {
            var wf = free[fk] * morphAmt;
            if (wf > 0) tgtU[fk] += (ohman.f[fk] - tgtU[fk]) * wf;
          }
          var wl = free[3] * morphAmt;
          if (wl > 0) tgtLip += (ohman.lip - tgtLip) * wl;
        }
        var tgtJaw = rawJawLift;
        if (e && e.kind === 'V' && morphAmt > 0) {
          var vElapsed = t - e.t0;
          var bloomFactor = (!prevEv || prevEv.kind !== 'V') && vElapsed < 0.050
            ? -0.035 * Math.pow(1 - Math.max(0, vElapsed / 0.050), 2) : 0;
          var effortFactor = Math.max(-0.04, Math.min(0.08, sungEffort * 0.12));
          tgtJaw += tgtPairs[0][0] * (bloomFactor + effortFactor) * morphAmt;
        }
        var baseSp = (e && e.sonorant === 'T') || nasalEdge ? 2.6 : (e && e.sonorant) ? 2.2 : 1.0;
        if (!e) {
          for (var rk = 0; rk < 6; rk++) {
            stepCritDamped(articState.x, articState.v, rk, articState.x[rk], ARTIC_HZ_F[rk], 1.0, dt);
            stepCritDamped(articState.bw, articState.bv, rk, articState.bw[rk], ARTIC_HZ_B[rk], 1.0, dt);
          }
          var decLipRest = Math.exp(-2 * Math.PI * ARTIC_HZ_LIP * dt);
          articState.lip += articState.lipV * decLipRest * dt;
          articState.lipV *= decLipRest;
          var wJawRest = 2 * Math.PI * ARTIC_HZ_JAW;
          var decJawRest = Math.exp(-wJawRest * dt);
          var cJawRest = articState.jawV + wJawRest * articState.jaw;
          articState.jaw = decJawRest * (articState.jaw + cJawRest * dt);
          articState.jawV = decJawRest * (articState.jawV - wJawRest * cJawRest * dt);
        } else if (fr === frStart && frStart === 0) {
          for (var sk = 0; sk < 6; sk++) {
            articState.x[sk] = tgtU[sk]; articState.v[sk] = 0;
            articState.bw[sk] = tgtPairs[sk][1]; articState.bv[sk] = 0;
          }
          articState.lip = tgtLip; articState.lipV = 0;
          articState.jaw = tgtJaw; articState.jawV = 0;
        } else {
          for (var ak = 0; ak < 6; ak++) {
            var spK = tapEdge && ak === 0 ? 2.4 : latEdge && ak < 2 ? 2.0 : baseSp;
            stepCritDamped(articState.x, articState.v, ak, tgtU[ak], ARTIC_HZ_F[ak], spK, dt);
            stepCritDamped(articState.bw, articState.bv, ak, tgtPairs[ak][1], ARTIC_HZ_B[ak], vbRel ? 2.2 : spK, dt);
          }
          var wLip = 2 * Math.PI * ARTIC_HZ_LIP * (latEdge ? 1.5 : 1.0);
          var eLip = articState.lip - tgtLip;
          var decLip = Math.exp(-wLip * dt);
          var cLip = articState.lipV + wLip * eLip;
          articState.lip = tgtLip + decLip * (eLip + cLip * dt);
          articState.lipV = decLip * (articState.lipV - wLip * cLip * dt);
          var wJaw = 2 * Math.PI * ARTIC_HZ_JAW * (latEdge || tapEdge ? 1.6 : 1.0);
          var eJaw = articState.jaw - tgtJaw;
          var decJaw = Math.exp(-wJaw * dt);
          var cJaw = articState.jawV + wJaw * eJaw;
          articState.jaw = tgtJaw + decJaw * (eJaw + cJaw * dt);
          articState.jawV = decJaw * (articState.jawV - wJaw * cJaw * dt);
        }
        var fCeiling = SR * 0.48;
        for (var ok = 5; ok >= 0; ok--) {
          var fVal = articState.x[ok] * NSG.lipScaleAt(articState.lip, ok);
          if (ok === 0) {
            var f1Cap = cur[1][0] > 0 ? cur[1][0] * 0.80 : fCeiling;
            fVal = Math.min(f1Cap, Math.max(120, fVal + articState.jaw));
          }
          cur[ok][0] = Math.max(100, Math.min(fCeiling, fVal));
          cur[ok][1] = Math.max(30, articState.bw[ok]);
        }
        if (articState.jaw > 20) {
          var jawOpenRatio = Math.min(1, articState.jaw / Math.max(120, cur[0][0] * 0.4));
          cur[0][1] *= 1 + 0.14 * jawOpenRatio;
        }
      } else {
        curLip += (tgtLip - curLip) * aForm;
        for (var k = 0; k < 6; k++) {
          var aK = tapEdge && k === 0 ? aFormFast : latEdge && k < 2 ? aFormLat : aF;
          cur[k][0] += ((k === 0 ? firstTarget : tgtPairs[k][0]) - cur[k][0]) * aK;
          cur[k][1] += (tgtPairs[k][1] - cur[k][1]) * (vbRel ? aFormFast : aK);
        }
      }
      // Coarticulated anticipatory velum opening on vowels approaching a coda nasal.
      var ncr = 0;
      if (e && e.closeNasal > 0) {
        var nCloseMax = studioMode ? (0.070 + 0.110 * morphAmt) : (0.075 + 0.145 * morphAmt);
        var nCloseFrac = studioMode ? (0.26 + 0.14 * morphAmt) : (0.28 + 0.18 * morphAmt);
        var nCloseDur = Math.min(nCloseMax, (e.t1 - e.t0) * nCloseFrac);
        ncr = Math.max(0, Math.min(1, 1 - (e.t1 - t) / Math.max(1e-6, nCloseDur)));
        ncr = ncr * ncr * (3 - 2 * ncr);
      }
      // 自动连接保留鼻腔辨识度；手动提前时让耦合随完整过渡渐变。
      var tgtMix = e && e.az ? 1 : (e && e.closeMix ? e.closeMix * ncr : 0);
      if (inXf && e.anticipation) tgtMix = (e.xfAz ? 1 : 0) * (1 - xr) + tgtMix * xr;
      // 句末 n/ng：音符结束后声带还有约 38ms 拖尾，鼻腔段若照常 4ms 退出，拖尾就成了没有零点的
      // 口腔响音，句末冒出一下“嗡/呃”。没有后续事件时保持鼻腔段，等声音静下来再清零。
      if (!e && curMix > 0) tgtMix = curAv >= 1e-3 ? curMix : 0;
      var tgtZ = e && (e.az || (e.closeAz && ncr > 0 ? e.closeAz : 0) || (inXf && e.xfAz));
      if (tgtZ) curZ = curMix < 1e-3 ? tgtZ : curZ + (tgtZ - curZ) * aForm;
      curMix += (tgtMix - curMix) * (tgtMix > curMix ? e && e.sonorant === 'N' ? aFormLat : aForm : aMixOut);
      var tgtNasal = e ? e.nasal + (e.closeNasal ? (e.closeNasal - e.nasal) * ncr : 0) : 0;
      if (inXf && e.anticipation) tgtNasal = e.xfNasal * (1 - xr) + tgtNasal * xr;
      curNasal += (tgtNasal - curNasal) * aForm;
      /* 普通话 l 段：av 按 l 的稳态声道换算（等功率约 −6dB），但进入时声道还是上一个元音的形状。
         高音区 F1 从元音下扫时会穿过 H1，此刻若 av 已升到 l 的值，输出会鼓起 +5dB 左右。
         按当前声道折算，输出不超过 l 的设计电平；交叉淡化区只折算 l 的那一份。 */
      if (e && e.latRelease) {
        var pLat = chainPower(e.pairs, lastF0, ha, tiltG, glG), pCur = chainPower(cur, lastF0, ha, tiltG, glG);
        if (pCur > pLat && pLat > 1e-12) {
          var latS = Math.sqrt(pLat / pCur), xfPart = inXf ? e.xfAv * (1 - xr) : 0;
          tgtAv = xfPart + (tgtAv - xfPart) * latS;
        }
      }
      if (e && e.sonorant === 'N') {
        // 高音区鼻音的稳态补偿可能大于 1.5；入口处声道/鼻腔尚未到位，且跨音高跳进时按实际发声基频实时定标。
        var liveF0 = (inXf || curAv >= 1e-3) ? lastF0 : (e.nasalF0 || lastF0);
        var liveTilt = pitchTiltAt(timbre, liveF0);
        var nCurrent = (1 - curMix) * chainPower(cur, liveF0, ha, liveTilt, glG) +
          curMix * chainPower(cur, liveF0, ha, liveTilt, glG, [poleHz, curZ]);
        if (e.nasalTargetRms && nCurrent > 1e-12) {
          var prevRms = inXf ? e.xfAv * Math.sqrt(chainPower(e.xfPairs, liveF0, ha, liveTilt, glG, e.xfAz ? [poleHz, e.xfAz] : null)) : e.nasalTargetRms;
          var desiredRms = inXf ? prevRms * (1 - xr) + e.nasalTargetRms * xr : e.nasalTargetRms;
          tgtAv = Math.min(e.nasalMaxAv, desiredRms / Math.sqrt(nCurrent));
        } else {
          var nPower = chainPower(e.pairs, liveF0, ha, liveTilt, glG, [poleHz, e.az]);
          if (nCurrent > nPower && nPower > 1e-12) {
            var nPart = inXf ? e.xfAv * (1 - xr) : 0;
            tgtAv = nPart + (tgtAv - nPart) * Math.sqrt(nPower / nCurrent);
          }
        }
        if (nextEvent && nextEvent.kind === 'V' && Math.abs(nextEvent.t0 - e.t1) < 1e-6 && e.t1 - t < 0.008) {
          var nOpen = Math.max(0, Math.min(1, (0.008 - (e.t1 - t)) / 0.008));
          nOpen *= nOpen * (3 - 2 * nOpen);
          tgtAv += (Math.min(tgtAv, nextEvent.av) - tgtAv) * nOpen;
        }
      }
      var unvoiced = e && !inXf && (e.kind === 'S' || (e.kind === 'F' && !e.av));
      // l 除阻：声道 6ms 打开，电平也须同步回到元音的电平。高音区 l 的 F1 低于 f0，等功率换算出的 av 偏高，
      // 若仍按 38ms 回落，元音头 20ms 会带着 l 的增益冲出约 +3dB。
      var sonorantRelease = !!e && e.kind === 'V' && !!prevEv && !!(prevEv.sonorant || e.nasalFrom) &&
        Math.abs(e.t0 - prevEv.t1) < 1e-6 && t - e.t0 < 0.025;
      var voiceUp = (e && e.sonorant === 'N' && e.nasalTargetRms && curAv >= 1e-3) ||
        (nasalEdge && prevEv.sonorant === 'N') ? aFormFast : aAmpU;
      var voiceRate = inXf && !(e && e.sonorant === 'N' && e.nasalTargetRms) ? aAmpU :
        (sonorantRelease || vbRel) && tgtAv < curAv ? aFormFast : latEdge && tgtAv < curAv ? aFormLat :
        e && e.voiceTau && tgtAv < curAv ? 1 - Math.exp(-dt / e.voiceTau) : aAmpD;
      curAv += (tgtAv - curAv) * (unvoiced ? aClose : (tgtAv > curAv ? voiceUp : voiceRate));
      var nasalFromActive = !!(e && e.nasalFrom &&
        t - e.t0 < Math.min(e.nasalFromDur || 0.085, (e.t1 - e.t0) * 0.45) + 0.025);
      if (vbRel && e.av > 0 && curAv > e.av) {
        var vbTilt = pitchTiltAt(timbre, lastF0);
        var vbCurPower = chainPower(cur, lastF0, ha, vbTilt, glG);
        var vbRelPower = chainPower(e.pairs, lastF0, ha, vbTilt, glG);
        if (vbCurPower > 1e-12) {
          curAv = Math.min(curAv, e.av * Math.sqrt(vbRelPower / vbCurPower));
        }
      }
      if ((sonorantRelease && curAv > e.av) || nasalFromActive) {
        // 声道打开与 av 回落必须同步。按当前混入比例与声道限制遗留的辅音/过渡补偿，避免元音头冲响或反抑。
        var releaseTilt = pitchTiltAt(timbre, lastF0);
        var oralReleasePower = chainPower(cur, lastF0, ha, releaseTilt, glG);
        var releasePower = curMix > 1e-3
          ? (1 - curMix) * oralReleasePower + curMix * chainPower(cur, lastF0, ha, releaseTilt, glG, [poleHz, curZ])
          : oralReleasePower;
        var vowelPower = chainPower(e.pairs, lastF0, ha, releaseTilt, glG);
        if (releasePower > 1e-12 && ((sonorantRelease && curAv > e.av) || releasePower > vowelPower)) {
          curAv = Math.min(curAv, e.av * Math.sqrt(vowelPower / releasePower));
        }
      }
      var fricSilent = curFric < 1e-5;
      var fricRateEnv = (e && e.kind === 'S') || (studioMode && e && e.affricateBurst > 0 && tgtFric > curFric) ? aClose : aFric;
      curFric += (tgtFric - curFric) * fricRateEnv;
      curTn += (tgtTn - curTn) * (e && e.kind === 'S' ? aClose : aTn);
      if (e && e.tnLpHz) curTnLpHz = e.tnLpHz;
      else if (tgtTn > 0 && !(e && e.tnLpHz)) curTnLpHz = 0;
      if (e && e.fc) {
        var tgtFc = inXf && e.anticipation ? e.xfFc * (1 - xr) + e.fc * xr : e.fc;
        var tgtFbw = inXf && e.anticipation ? e.xfFbw * (1 - xr) + e.fbw * xr : e.fbw, fricRate = fricSilent && !(inXf && e.anticipation) ? 1 : aFric;
        curFricF += (tgtFc - curFricF) * fricRate;
        curFricB += (tgtFbw - curFricB) * fricRate;
        if (modeB) {
          curJaFricF += ((e.jaFricF || e.fc) - curJaFricF) * fricRate;
          curJaFricB += ((e.jaFricB || e.fbw) - curJaFricB) * fricRate;
        }
      }

      while (noteIdx < notes.length && t >= notes[noteIdx]._end) noteIdx++;
      var active = null;
      for (var j = noteIdx; j < notes.length; j++) {
        var nj = notes[j];
        var from = nj._pre !== undefined ? nj._pre : nj._start;
        if (from <= t && t < nj._end) active = nj;
        else if (from > t && nj._start > t + 1) break;
      }
      if (active && (active._rest || active._breath)) curAv = 0;
      if (active && active._rest) { curFric = 0; curTn = 0; }
      var tgtMidi = active ? active.pitch : (curMidi - 0.002);
      /* Pitch at articulation boundaries comes from the same model as the editor. */
      var curBeat = 0, duration = 1e-4, rel = 0;
      if (active && !active._rest && !active._breath) {
        curBeat = tm.beatOf(t);
        duration = Math.max(1e-4, active._end - active._start);
        rel = (curBeat - active.start) / active.dur;
        // No extra smoothing here: handles describe the actual synthesized F0.
        // 前置在空白里的声母（m n l 等带声辅音）直接唱本音符的音高，不沿用上一句的尾音。
        curMidi = pitchModel.midiAt(t < active._start ? active.start : curBeat, tgtMidi);
      }
      else curMidi = tgtMidi;

      var f0 = NSG.mtof(curMidi);
      var voicedNote = active && !active._rest && !active._breath;
      var ex = (studioMode && autoExpress && humAmt > 0 && voicedNote) ? active._expr : null;
      if (ex && ex.dryPitch) {
        var exEl = Math.max(0, t - active._start);
        var exLeft = Math.max(0, active._end - t);
        var exDur = Math.max(0.01, active._end - active._start);
        var exprCents = 0;
        if (ex.scoopCents && exEl < ex.scoopDur) {
          var uSc = exEl / Math.max(1e-4, ex.scoopDur);
          exprCents += ex.scoopCents * (0.5 + 0.5 * Math.cos(Math.PI * uSc));
        }
        if (ex.overCents && exEl < ex.overPeakT + ex.overSettleT) {
          if (exEl <= ex.overPeakT) {
            var uOv1 = exEl / Math.max(1e-4, ex.overPeakT);
            exprCents += ex.overCents * uOv1 * uOv1 * (3 - 2 * uOv1);
          } else {
            var uOv2 = (exEl - ex.overPeakT) / Math.max(1e-4, ex.overSettleT);
            exprCents += ex.overCents * (0.5 + 0.5 * Math.cos(Math.PI * uOv2));
          }
        }
        if (ex.dipCents && exEl < ex.dipDur) {
          exprCents += ex.dipCents * Math.sin(Math.PI * (exEl / Math.max(1e-4, ex.dipDur)));
        }
        if (ex.sustainArchCents) {
          var uArc = Math.max(0, Math.min(1, exEl / exDur));
          exprCents += ex.sustainArchCents * Math.sin(Math.PI * uArc);
        }
        if (ex.preLeapCents && exLeft < ex.preLeapDur) {
          var uPreL = 1 - exLeft / Math.max(1e-4, ex.preLeapDur);
          exprCents += ex.preLeapCents * uPreL * uPreL * (3 - 2 * uPreL);
        }
        if (ex.fallCents && exLeft < ex.fallDur) {
          var uFall = 1 - exLeft / Math.max(1e-4, ex.fallDur);
          exprCents += ex.fallCents * uFall * uFall;
        }
        if (exprCents) f0 *= Math.pow(2, (exprCents * humAmt) / 1200);
      }
      lastF0 = f0;

      var orgActive = false, orgEff = 0, nF0 = 0, nTilt = 0, nAir = 0;
      if (org) {
        orgActive = voicedNote && curAv >= 1e-3 && e && (e.kind === 'V' || e.kind === 'G' || e.kind === 'L' || e.kind === 'N');
        if (orgActive) orgVoicedSec += dt;
        else orgVoicedSec = Math.max(0, orgVoicedSec - dt * 4);
        var orgRamp = Math.min(1, orgVoicedSec / 0.18);
        orgRamp = orgRamp * orgRamp * (3 - 2 * orgRamp);
        var orgTargetGate = orgActive ? ((e.kind === 'V' ? 1 : 0.55) * (0.28 + 0.72 * orgRamp)) : 0;
        orgGate += (orgTargetGate - orgGate) * orgGateAlpha;
        orgEff = orgAmt * orgGate;
        nF0 = org.f0();
        nTilt = org.tilt();
        nAir = org.air();
      }

      var vc = 0;
      if (voicedNote) {
        if (ex && ex.dryVib) {
          var vTime = Math.max(0, t - active._start);
          var vTot = Math.max(0.01, active._end - active._start);
          if (ex.vibAllow && vTime > ex.vibDelay && vTime < vTot) {
            if (!stVibActive) { stVibPhase = 0; stVibActive = true; }
            var vSpan = Math.max(0.05, vTot - ex.vibDelay);
            var fadeInSec = Math.min(0.24, vSpan * 0.45);
            var fadeOutSec = Math.min(0.16, vSpan * 0.30);
            var envIn = Math.min(1, (vTime - ex.vibDelay) / Math.max(1e-4, fadeInSec));
            envIn = envIn * envIn * (3 - 2 * envIn);
            var envOut = ex.isPEnd ? Math.min(1, (vTot - vTime) / Math.max(1e-4, fadeOutSec)) : Math.min(1, (vTot - vTime) / 0.06);
            envOut = envOut * envOut * (3 - 2 * envOut);
            var vibRateInst = ex.vibRateBase * (0.93 + 0.07 * envIn + 0.045 * nAir);
            stVibPhase += 2 * Math.PI * vibRateInst * dt;
            if (stVibPhase > 6.283185307179586e3) stVibPhase -= Math.floor(stVibPhase / (2 * Math.PI)) * (2 * Math.PI);
            vc = ex.vibDepthBase * humAmt * envIn * envOut * Math.sin(stVibPhase);
          } else {
            stVibActive = false;
          }
        } else {
          stVibActive = false;
          var tt = t - (active._legato === undefined ? active._start : active._legato);
          var vibElapsed = active.vibrato
            ? t - tm.secOf(active.start + active.dur * (1 - NSG.TUNING.vibrato(active.vibrato).length / 100))
            : 0;
          vc = NSG.TUNING.vibCents(active, rel, duration, timbre, tt, vibElapsed);
          if (vc && !studioMode) f0 *= Math.pow(2, vc / 1200);
        }
      } else {
        stVibActive = false;
      }

      var requestedEffort = voicedNote && active.effortPoints ? NSG.TUNING.envelopeAt(active.effortPoints, rel) - 1 : 0;
      sungEffort += (requestedEffort - sungEffort) * effortAlpha;
      if (Math.abs(sungEffort) < 1e-6 && !requestedEffort) sungEffort = 0;
      var frameMixGain = active ? NSG.TUNING.noteGain(active, (tm.beatOf(t) - active.start) / Math.max(1e-6, active.dur)) : 1;
      var targetDynDb = 0;
      if (ex && ex.dryDyn) {
        var phrEl = Math.max(0, t - ex.pStartSec);
        var phrLeft = Math.max(0, ex.pEndSec - t);
        var swIn = Math.min(1, phrEl / 0.14);
        var swellDb = -1.4 * (1 - swIn) * (1 - swIn);
        var decSpan = Math.min(0.45, ex.pDurSec * 0.30);
        var uDec = decSpan > 1e-4 ? Math.max(0, Math.min(1, 1 - phrLeft / decSpan)) : 0;
        var decDb = -2.8 * uDec * uDec * (3 - 2 * uDec);
        targetDynDb = (ex.noteArchDb + swellDb + decDb) * humAmt;
      }
      exprDynCur += (targetDynDb - exprDynCur) * aExprDyn;
      if (ex && ex.dryDyn) frameMixGain *= Math.pow(10, exprDynCur / 20);
      var effAbd = 0;
      if (studioMode) {
        var isVlessFr = !e || e.kind === 'B' || e.kind === 'S' || (e.kind === 'F' && !(e.av > 0)) || (active && (active._rest || active._breath));
        var isVlessObs = !!(e && (e.kind === 'S' || (e.kind === 'F' && !(e.av > 0))));
        if (isVlessFr) {
          abductLevel += (1.0 - abductLevel) * aAbdClose;
          if (isVlessObs) prevWasVoicelessObs = true;
        } else {
          if (prevWasVoicelessObs && /^(V|G|L|N)$/.test(e.kind)) {
            postVlPitchBoost = 12;
            prevWasVoicelessObs = false;
          }
          if (curAv >= 0.02 && e.kind !== 'VB' && e.kind !== 'F') {
            abductLevel += (0.0 - abductLevel) * aAbdAdduct;
          }
        }
        if (postVlPitchBoost > 0.01) {
          if (voicedNote && e && e.kind !== 'S') f0 *= Math.pow(2, postVlPitchBoost / 1200);
          postVlPitchBoost *= (1 - aPostVlPitch);
        } else postVlPitchBoost = 0;
        var preAbd = 0;
        if (!isVlessFr && nextEvent && (nextEvent.kind === 'S' || (nextEvent.kind === 'F' && !nextEvent.av)) &&
            nextEvent.t0 - t >= 0 && nextEvent.t0 - t < 0.030) {
          var uPreA = (0.030 - (nextEvent.t0 - t)) / 0.030;
          preAbd = uPreA * uPreA * (3 - 2 * uPreA) * 0.45;
        }
        effAbd = Math.max(abductLevel, preAbd);
        var dynOctTgt = voicedNote ? Math.max(-1.2, Math.min(0.8, Math.log2(Math.max(0.15, frameMixGain)))) : 0;
        dynOctCur += (dynOctTgt - dynOctCur) * aDynOct;
      }
      var vibNorm = vc ? Math.max(-1, Math.min(1, vc / 35)) : 0;
      var orgTremolo = 1, orgTiltMod = 0, orgAirMod = 1;
      if (org) {
        if (studioMode && vc) {
          vc *= 1 + 0.14 * orgAmt * nAir;
          vibNorm = Math.max(-1, Math.min(1, vc / 35));
        }
        if (orgEff > 1e-5) f0 *= Math.pow(2, (6.5 * orgEff * nF0) / 1200);
        if (vc) orgTremolo = 1 + (studioMode ? 0.025 : 0.045) * orgAmt * vibNorm;
        var stTiltF0Sc = studioMode ? Math.pow(Math.max(0.35, Math.min(1, f0 / 260)), 0.72) : 1;
        orgTiltMod = ((studioMode ? 0.82 : 0.55) * orgEff * nTilt + (studioMode ? 0.52 : 0.35) * orgAmt * vibNorm) * stTiltF0Sc;
        orgAirMod = studioMode ? Math.max(0.60, 1 + 0.42 * orgEff * nAir) : Math.max(0.7, 1 + 0.14 * orgEff * nAir);
      }
      if (studioMode && vc) f0 *= Math.pow(2, vc / 1200);
      var humTremolo = 1, humEndTaper = releaseTaper, humBreathBoost = releaseBreath, humFry = 0, humOnsetSwell = 1;
      var humRdOut = humBaseRd, humOqOut = 0.65, humTaOut = 0.04;
      if (humAmt > 0) {
        var tgtRd = curAv >= 1e-3 ? humCurRd : humBaseRd;
        if (voicedNote) {
          tgtRd = humBaseRd - 0.65 * sungEffort;
          humEndTaper = 1;
          humBreathBoost = 1;
          var hVel = NSG.TUNING.clamp(Number.isFinite(+active.vel) && active.vel != null ? +active.vel : 96, 1, 127);
          var hVelNorm = (hVel - 96) / 31; // -3..+1
          var hElapsed = Math.max(0, t - active._legato);
          var phraseElapsed = Math.max(0, t - active._phonationOnset);
          var hLeft = Math.max(0, active._phonationEnd - t);
          // 1) Vocal effort (VEL -> lower Rd pressed, softer VEL -> higher Rd breathy)
          tgtRd -= 0.38 * Math.max(-1.2, Math.min(1.0, hVelNorm));
          // 2) Pitch register / passaggio: higher notes gently soften into mixed/head voice unless belted
          if (studioMode) {
            var octReg = Math.log2(Math.max(60, f0) / humCenterHz);
            var effDrive = Math.max(0, Math.min(1.25, 0.65 + 0.55 * (hVelNorm + 0.55 * dynOctCur + sungEffort)));
            var lowCutOct = isHighVoiceHum ? 0.14 : 0.08;
            if (octReg < lowCutOct) {
              var lowRel = Math.max(0, Math.min(1, (lowCutOct - octReg) / 0.85));
              var beltSup = Math.max(0, Math.min(0.70, 0.55 * Math.max(0, hVelNorm + 0.55 * dynOctCur + sungEffort)));
              tgtRd += (isHighVoiceHum ? 1.12 : 0.45) * Math.pow(lowRel, 1.15) * (1 - beltSup);
            }
            var mixMinOct = isHighVoiceHum ? 0.08 : 0.05;
            var mixMaxOct = isHighVoiceHum ? 1.05 : 0.88;
            if (octReg > mixMinOct && octReg < mixMaxOct) {
              var mixU = (octReg - mixMinOct) / (mixMaxOct - mixMinOct);
              var mixBell = Math.sin(Math.PI * mixU);
              tgtRd -= (isHighVoiceHum ? 0.52 : 0.12) * mixBell * effDrive;
              var driveVal = hVelNorm + 0.5 * dynOctCur;
              if (driveVal < -0.25) {
                var softHead = Math.max(0, Math.min(1, (-0.25 - driveVal) / 0.9));
                tgtRd += 0.45 * mixBell * softHead;
              }
            }
            var hiRegStart = isHighVoiceHum ? 0.98 : 0.78;
            if (octReg > hiRegStart) {
              var hiReg = Math.max(0, Math.min(1, (octReg - hiRegStart) / 0.65));
              var hiSup = isHighVoiceHum
                ? Math.max(0, Math.min(0.65, 0.65 * Math.max(0, hVelNorm + 0.5 * dynOctCur + 0.3)))
                : (0.45 * Math.max(0, hVelNorm + 0.5 * dynOctCur));
              tgtRd += 0.42 * hiReg * (1 - hiSup);
            }
          } else {
            if (f0 > humPassHz) {
              var reg = Math.min(1, Math.log(f0 / humPassHz) / (Math.LN2 * 1.25));
              tgtRd += 0.42 * reg * (1 - 0.45 * Math.max(0, hVelNorm));
            }
          }
          // 3) Syllable attack micro-engagement
          tgtRd -= 0.12 * Math.exp(-Math.min(hElapsed, phraseElapsed) / 0.085);
          // 4) Phrase onset soft glottal engagement
          var onSpan = studioMode ? 0.055 : 0.070;
          if (phraseElapsed < onSpan) {
            var uOn = phraseElapsed / onSpan;
            var sOn = 1 - uOn * uOn * (3 - 2 * uOn);
            tgtRd += (studioMode ? 0.36 : 0.45) * sOn;
            humBreathBoost += (studioMode ? 0.40 * sOn : 0.55 * Math.max(0, 1 - phraseElapsed / 0.055)) * humAmt;
            if (studioMode && phraseElapsed < 0.035 && (!prevEv || (e && e.t0 - prevEv.t1 > 0.02) || prevEv.kind === 'B' || prevEv.kind === 'S')) {
              var uSw = phraseElapsed / 0.035;
              humOnsetSwell = 0.78 + 0.22 * uSw * uSw * (3 - 2 * uSw);
            }
            var fryOnCeil = studioMode ? Math.min(260, humCenterHz * 1.02) : 170;
            if (f0 < fryOnCeil && (!studioMode || phraseElapsed < 0.045)) {
              humFry = Math.max(humFry, (studioMode ? 0.48 : 0.75) * sOn * Math.min(1, (fryOnCeil - f0) / (studioMode ? 55 : 50)));
            }
          }
          // 5) Phrase offset breathy glottal relaxation
          var voicedSpan = active._phonationEnd - active._phonationOnset;
          var tailLen = Math.min(studioMode ? 0.230 : 0.165, voicedSpan * (studioMode ? 0.38 : 0.36));
          if (tailLen > 0 && hLeft < tailLen) {
            var uEnd = Math.max(0, Math.min(1, 1 - hLeft / Math.max(1e-4, tailLen)));
            var sEnd = uEnd * uEnd * (3 - 2 * uEnd) * Math.min(1, voicedSpan / 0.28);
            tgtRd += (studioMode ? 0.92 : 0.78) * sEnd;
            humBreathBoost += (studioMode ? 0.85 : 0.70) * sEnd * humAmt;
            humEndTaper = 1 - (studioMode ? 0.28 : 0.22) * sEnd * humAmt;
            var fryEndCeil = studioMode ? Math.min(225, humCenterHz * 0.88) : 175;
            if (f0 < fryEndCeil) humFry = Math.max(humFry, (studioMode ? 0.45 : 0.55) * sEnd * Math.min(1, (fryEndCeil - f0) / 55));
          }
          if (studioMode) {
            tgtRd -= 0.34 * dynOctCur;
            tgtRd += 0.68 * effAbd;
            humBreathBoost += 1.25 * effAbd;
          }
          // 6) Vibrato physiological coupling (glottal tension + subglottal tremolo)
          if (vc) {
            tgtRd -= 0.14 * humAmt * vibNorm;
            humTremolo = 1 + (studioMode ? 0.032 : 0.065) * humAmt * vibNorm;
          }
          // A slow fluctuation in breath support moves level, fold tension and
          // leakage together; keep the scored pitch and independent jitter intact.
          var support = org ? humAmt * orgEff * nF0 : 0;
          humTremolo *= 1 + (studioMode ? 0.032 : 0.095) * support;
          tgtRd -= 0.16 * support;
          humBreathBoost *= 1 - 0.08 * support;
          releaseTaper = humEndTaper;
          releaseBreath = humBreathBoost;
        } else if (studioMode && effAbd > 0) {
          tgtRd += 0.68 * effAbd;
          humBreathBoost += 1.25 * effAbd;
        }
        tgtRd = studioMode ? Math.max(0.58, Math.min(2.50, tgtRd)) : Math.max(0.35, Math.min(2.65, tgtRd));
        humCurRd += (tgtRd - humCurRd) * humRdAlpha;
        humRdOut = 1.05 + (humCurRd - 1.05) * humAmt;
        var rdPos = Math.max(0, Math.min(lfTab.nrd - 1.0001, (humRdOut - lfTab.rdMin) / lfTab.rdStep));
        var rIdx = rdPos | 0, rFr = rdPos - rIdx;
        humOqOut = lfTab.oq[rIdx] + (lfTab.oq[rIdx + 1] - lfTab.oq[rIdx]) * rFr;
        humTaOut = lfTab.ta[rIdx] + (lfTab.ta[rIdx + 1] - lfTab.ta[rIdx]) * rFr;
      }
      // Mode B effort: VEL changes source colour as well as amplitude.
      // A small, continuous attack/settling contour keeps sustained notes alive.
      var sourceTilt = 0;
      if (research && voicedNote) {
        var noteVel = NSG.TUNING.clamp(Number.isFinite(+active.vel) && active.vel != null ? +active.vel : 96, 1, 127);
        var effortStart = humAmt > 0 ? active._legato : active._start;
        var elapsed = Math.max(0, t - effortStart);
        var span = Math.max(0.02, (humAmt > 0 ? active._chainEnd : active._end) - effortStart);
        sourceTilt = studioMode
          ? (2.4 * (noteVel / 96 - 1) - 0.30 * Math.min(1, elapsed / Math.max(0.3, span)))
          : (2.4 * (noteVel / 96 - 1) + 0.65 * Math.exp(-elapsed / 0.10) - 0.35 * Math.min(1, elapsed / Math.max(0.3, span)));
      }
      if (research) {
        effortTilt += (sourceTilt - effortTilt) * effortAlpha;
        sourceTilt = effortTilt;
      }
      // Keep guardTilt on the base effort contour so organic/vibrato micro-tilt
      // does not thrash guardRefCache or fight natural brightness modulation.
      sourceTilt += 1.6 * sungEffort;
      if (studioMode) sourceTilt += 0.52 * dynOctCur;
      var guardTilt = pitchTiltAt(timbre, f0) + sourceTilt;
      if (org) sourceTilt += orgTiltMod;
      if (humAmt > 0 && vc) sourceTilt += (studioMode ? (isHighVoiceHum ? 0.72 : 0.32) : 0.45) * humAmt * vibNorm;
      // 从静音/闭塞起音时立刻评估并直接就位：此时声道还在从辅音形状滑向元音，
      // 正是过冲最大的 20ms，等到下一个 8ms 检查点再慢慢压就漏掉了。
      var onsetNow = guardIdle && voicedNote && curAv >= 1e-3;
      var computedBasePower = -1;
      if (!voicedNote || curAv < 1e-3) { guardT = 1; guardIdle = true; }
      else if (onsetNow || nasalEdge || (e && e.kind === 'N') || fr % 4 === 0) {   // 鼻音进出时逐帧检查
        // 鼻腔段也计入：~270Hz 的鼻极点与 i/u/ü 的 F1、低音区的 H1 重合时可把电平抬高近 10dB。
        computedBasePower = chainPower(cur, f0, ha, guardTilt, glG);
        var pNow = curMix > 1e-3 ? (1 - curMix) * computedBasePower +
          curMix * chainPower(cur, f0, ha, guardTilt, glG, [poleHz, curZ]) : computedBasePower;
        var refAz = e && e.az ? e.az : 0, notePitch = active.pitch, pRef;
        // 交叉淡化区内参考稳态也随之混合：上一个元音的稳态 → 辅音的稳态，否则守卫会把重叠区误判为过冲。
        if (inXf) {
          if (guardXfCache.xfPairs !== e.xfPairs || guardXfCache.pairs !== e.pairs ||
              guardXfCache.pitch !== notePitch || guardXfCache.tilt !== guardTilt || guardXfCache.az !== refAz) {
            var xfPitchHz = NSG.mtof(notePitch);
            guardXfCache.xfPairs = e.xfPairs; guardXfCache.pairs = e.pairs;
            guardXfCache.pitch = notePitch; guardXfCache.tilt = guardTilt; guardXfCache.az = refAz;
            guardXfCache.p0 = chainPower(e.xfPairs, xfPitchHz, ha, guardTilt, glG);
            guardXfCache.p1 = chainPower(e.pairs, xfPitchHz, ha, guardTilt, glG, refAz ? [poleHz, refAz] : null);
          }
          pRef = (1 - xr) * guardXfCache.p0 + xr * guardXfCache.p1;
        } else {
          var guardRefPairs = e && e.nasalFrom ? e.pairs : tgtPairs;
          if (guardRefCache.pairs !== guardRefPairs || guardRefCache.pitch !== notePitch ||
              guardRefCache.tilt !== guardTilt || guardRefCache.az !== refAz) {
            guardRefCache.pairs = guardRefPairs; guardRefCache.pitch = notePitch;
            guardRefCache.tilt = guardTilt; guardRefCache.az = refAz;
            guardRefCache.power = chainPower(guardRefPairs, NSG.mtof(notePitch), ha, guardTilt, glG, refAz ? [poleHz, refAz] : null);
          }
          pRef = guardRefCache.power;
        }
        var pEff = pNow;
        if (e && e.sonorant === 'N' && e.nasalTargetRms) {
          pEff = pRef;
        } else if (e && !inXf && e.av > 1e-6 && curAv < e.av) {
          var avRat = curAv / e.av;
          pEff = pNow * avRat * avRat;
        }
        var excess = pRef > 1e-12 && pEff > 1e-12 ? 10 * Math.log10(pEff / pRef) : 0;
        guardT = studioMode
          ? (excess > 2.5 ? Math.pow(10, -(excess - 2.5) * 0.85 / 20) : 1)
          : (excess > 2 ? Math.pow(10, -(excess - 2) / 20) : 1);
        guardIdle = false;
      }
      // 鼻音进出时谐波可能直接落在鼻极点上，过冲只有几毫秒，8ms 的平滑来不及压。
      if (onsetNow || (guardT < guard && (nasalEdge || (e && e.kind === 'N')))) guard = guardT;
      else guard += (guardT - guard) * (guardT < guard ? aGuardD : aGuardU);
      if (balanceAspiration && (studioMode || timbre.breath > 0) && voicedNote && curAv >= 1e-3) {
        if (onsetNow || fr % 4 === 0) {
          var voicePower = computedBasePower >= 0 ? computedBasePower : chainPower(cur, f0, ha, guardTilt, glG);
          var airPower = aspirationPower(cur, timbre.outEq, airMixCtrl);
          aspirationTarget = Math.min(1, Math.sqrt(Math.max(0, voicePower) / Math.max(1e-24, airPower * aspirationReference)));
        }
        // Attenuate promptly at a dangerous tract/pitch combination; restore
        // over 30 ms. Hold the last scale through release instead of reopening
        // the noise gate at note-off.
        if (aspirationTarget < aspirationScale) aspirationScale = aspirationTarget;
        else aspirationScale += (aspirationTarget - aspirationScale) * (1 - Math.exp(-dt / 0.030));
      }

      // VEL also controls vocal dynamics, including each note in a sustain chain.
      // The historical/default value 96 retains the original synthesis level.
      // Keep the last note's gain during release; resetting at note-off makes
      // a quiet phrase's fading voice/noise jump back to full volume.
      if (active) velocity = !active._rest && !active._breath ?
        NSG.TUNING.clamp(Number.isFinite(+active.vel) && active.vel != null ? +active.vel : 96, 1, 127) / 96 : 1;
      if (active) mixGain = frameMixGain;
      var fbOut = copyPairs(cur);
      var fLim = SR * 0.48;
      if (org) {
        var nF1 = org.f1(), nF2 = org.f2(), nF3 = org.f3(), nHi = org.hi(), nBw = org.bw();
        var oEff = orgAmt * orgGate;
        if (oEff > 1e-5) {
          fbOut[0][0] = Math.max(150, Math.min(fLim, fbOut[0][0] * (1 + 0.009 * oEff * nF1)));
          fbOut[1][0] = Math.max(fbOut[0][0] + 120, Math.min(fLim, fbOut[1][0] * (1 + 0.011 * oEff * nF2)));
          fbOut[2][0] = Math.max(fbOut[1][0] + 150, Math.min(fLim, fbOut[2][0] * (1 + 0.008 * oEff * nF3)));
          for (var oh = 3; oh < 6; oh++) {
            fbOut[oh][0] = Math.max(fbOut[oh - 1][0] + 150, Math.min(fLim, fbOut[oh][0] * (1 + 0.0045 * oEff * nHi)));
          }
          var bwScaleMod = 1 + 0.06 * oEff * nBw;
          for (var ob = 0; ob < 3; ob++) fbOut[ob][1] = Math.max(30, fbOut[ob][1] * bwScaleMod);
        }
      }
      if (humAmt > 0 && vc) {
        // Subtle formant vibrato coupled to pitch vibrato (Sundberg).
        var f1VibSc = (studioMode && e && e.kind === 'V') ? 0.026 : 0.014;
        var f2VibSc = (studioMode && e && e.kind === 'V') ? 0.024 : 0.010;
        var fVib = 1 + f1VibSc * humAmt * vibNorm;
        fbOut[0][0] = Math.max(150, Math.min(fLim, fbOut[0][0] * fVib));
        fbOut[1][0] = Math.max(fbOut[0][0] + 120, Math.min(fLim, fbOut[1][0] * (1 + f2VibSc * humAmt * vibNorm)));
        if (studioMode && isHighVoiceHum && e && e.kind === 'V') {
          fbOut[2][0] = Math.max(fbOut[1][0] + 180, Math.min(fLim, fbOut[2][0] * (1 + 0.014 * humAmt * vibNorm)));
        }
      }
      var fricFOut = curFricF, fricBOut = curFricB;
      var liveLipOut = articState ? articState.lip : curLip;
      if (studioMode) {
        if (e && e.kind === 'V' && curAv >= 0.02) applyHawksMillerBw(fbOut, timbre);
        var rdOpenBw = Math.max(0, humRdOut - 1.0);
        if (rdOpenBw > 0) {
          fbOut[0][1] = Math.max(30, fbOut[0][1] * (1 + 0.40 * rdOpenBw));
          fbOut[1][1] = Math.max(30, fbOut[1][1] * (1 + 0.28 * rdOpenBw));
          fbOut[2][1] = Math.max(30, fbOut[2][1] * (1 + 0.20 * rdOpenBw));
        }
        var frontNormH = (fbOut[1][0] - 1400) / 1000;
        var jawNormH = (fbOut[0][0] - 500) / 500;
        var pitchOctH = Math.max(-1, Math.min(1, Math.log2(Math.max(80, f0) / (timbre.refF0 || 220))));
        var hiMod = 1 + 0.025 * frontNormH - 0.015 * jawNormH + 0.028 * pitchOctH;
        for (var hfk = 3; hfk < 6; hfk++) {
          fbOut[hfk][0] = Math.max(fbOut[hfk - 1][0] + 150, Math.min(fLim, fbOut[hfk][0] * hiMod));
        }
        if (e && e.kind === 'V' && curAv >= 0.02) {
          var ringGate = Math.max(0, Math.min(1, (pitchOctH - 0.25) / 0.55)) * Math.max(0, Math.min(1, (1.20 - humRdOut) / 0.30));
          if (studioMode && !isHighVoiceHum) ringGate *= 0.25;
          if (ringGate > 0.01) {
            var sfTarget = isHighVoiceHum ? 3250 : (studioMode ? 3050 : 2800);
            var f3Goal = sfTarget - 220, f4Goal = sfTarget + 280;
            if (fbOut[2][0] < f3Goal) fbOut[2][0] = Math.min(f3Goal, fbOut[2][0] * (1 + 0.06 * ringGate));
            else fbOut[2][0] = Math.max(f3Goal, fbOut[2][0] * (1 - 0.04 * ringGate));
            if (fbOut[3][0] > f4Goal) fbOut[3][0] = Math.max(fbOut[2][0] + 280, Math.max(f4Goal, fbOut[3][0] * (1 - 0.07 * ringGate)));
            var ringBwCut = (studioMode && !isHighVoiceHum) ? 0.05 : 0.10;
            fbOut[2][1] = Math.max(90, fbOut[2][1] * (1 - ringBwCut * ringGate));
            fbOut[3][1] = Math.max(90, fbOut[3][1] * (1 - ringBwCut * ringGate));
          }
        }
        fricFOut *= 1 - 0.14 * Math.max(0, Math.min(0.4, liveLipOut));
      }
      if (e && e.kind === 'B') {
        var bU2 = Math.max(0, Math.min(1, (t - e.t0) / Math.max(1e-6, e.t1 - e.t0)));
        if (e.brProfile) {
          var bpSw = e.brProfile;
          var sw = studioMode ? bpSw.studioSweep : bpSw.sweep;
          var pk = bpSw.peakAt || 0.65;
          var bFreqP = bU2 < pk ? (sw[0] + (sw[1] - sw[0]) * (bU2 / pk)) : (sw[1] + (sw[2] - sw[1]) * ((bU2 - pk) / Math.max(1e-6, 1 - pk)));
          fricFOut = bFreqP;
          fricBOut = studioMode ? bpSw.studioBw : bpSw.bw;
        } else if (humAmt > 0) {
          // Two-stage inhalation resonance: pharyngeal -> oral/teeth -> soft close.
          if (studioMode) {
            var bFreqSt = bU2 < 0.65 ? (1100 + 950 * (bU2 / 0.65)) : (2050 - 600 * ((bU2 - 0.65) / 0.35));
            fricFOut = curFricF + (bFreqSt - curFricF) * humAmt;
            fricBOut = curFricB + (1550 - curFricB) * humAmt;
          } else {
            var bFreq = bU2 < 0.65 ? (1350 + 1200 * (bU2 / 0.65)) : (2550 - 800 * ((bU2 - 0.65) / 0.35));
            fricFOut = curFricF + (bFreq - curFricF) * humAmt;
            fricBOut = curFricB + (1450 - curFricB) * humAmt;
          }
        }
      }
      var effBreathCtrl = studioMode ? Math.max(0.008, timbre.breath || 0) : (timbre.breath || 0);
      var effNasalScale = studioMode ? Math.max(0.12, timbre.nasal || 0.4) : (timbre.nasal || 0.4);
      var outVel = (e && e.noteVel !== undefined && e.kind !== 'V' && t < e.noteStart - 1e-6) ? e.noteVel : velocity;
      ctrl[ctrlIdx] = {
        t: t, f0: f0, av: curAv * 0.92 * velocity * guard * orgTremolo * humTremolo * humEndTaper * humOnsetSwell,
        ah: (balanceAspiration ? effBreathCtrl * aspirationScale : effBreathCtrl * (0.5 + curAv * 0.5)) * orgAirMod * humBreathBoost,
        /* 必须逐帧复制：cur 是不断被改写的同一组数组，直接引用会让整首歌
           只用到最后一帧的声道形状（等于全程一个元音） */
        fb: fbOut,
        fric: curFric * outVel, tn: curTn * outVel, fricF: fricFOut, fricB: fricBOut, vel: outVel,
        nasal: Math.min(1, curNasal * effNasalScale * 2.4),
        np: poleHz, nzf: curZ, nmix: curMix, mixGain: mixGain
      };
      if (studioMode) {
        ctrl[ctrlIdx].lip = liveLipOut;
        ctrl[ctrlIdx].abduct = effAbd;
        ctrl[ctrlIdx].aspirationScale = aspirationScale;
        ctrl[ctrlIdx].burstImpulse = burstImp;
        ctrl[ctrlIdx].burstAmp = burstAmp;
        ctrl[ctrlIdx].isAffricateBurst = isAffrBurst;
        ctrl[ctrlIdx].isBreath = !!(e && e.kind === 'B');
        if (e && e.kind === 'B' && e.brProfile) {
          ctrl[ctrlIdx].breathCustomFreq = true;
          ctrl[ctrlIdx].breathFricScale = e.brProfile.studioFricGain;
        }
      }
      if (curTnLpHz > 0) ctrl[ctrlIdx].tnLpHz = curTnLpHz;
      if ((curTn < 1e-6 && (!e || !e.tnLpHz)) || (active && active._rest)) curTnLpHz = 0;
      if (research || org || humAmt > 0 || sungEffort) ctrl[ctrlIdx].sourceTilt = sourceTilt;
      ctrl[ctrlIdx].effort = sungEffort;
      if (org) {
        ctrl[ctrlIdx].organicGate = orgGate;
        ctrl[ctrlIdx].organicAirMod = orgAirMod;
      }
      if (humAmt > 0) {
        ctrl[ctrlIdx].rd = humRdOut;
        ctrl[ctrlIdx].oq = humOqOut;
        ctrl[ctrlIdx].ta = humTaOut;
        ctrl[ctrlIdx].fry = humFry;
      }
      if (modeB) {
        var frontTarget = e && e.frontCavity ? 1 : 0;
        if (inXf && e.anticipation) frontTarget = (prevEv && prevEv.frontCavity ? 1 : 0) * (1 - xr) + frontTarget * xr;
        curFrontCavity += (frontTarget - curFrontCavity) * aFric;
        if (curFrontCavity < 1e-8) curFrontCavity = 0;
        ctrl[ctrlIdx].frontCavity = curFrontCavity;
        if (e) {
          lastVoicedHighGate = e.kind === 'F' || e.kind === 'S' || (studioMode && e.kind === 'N') ? 0 : 1;
          ctrl[ctrlIdx].voicedHighGate = /^(V|G|L)$/.test(e.kind) ? 1 : 0;
        } else {
          if (curAv < 1e-6) lastVoicedHighGate = 1;
          ctrl[ctrlIdx].voicedHighGate = lastVoicedHighGate;
        }
      }
      if (modeB && (curJaFricF !== curFricF || curJaFricB !== curFricB)) {
        ctrl[ctrlIdx].jaFricF = curJaFricF; ctrl[ctrlIdx].jaFricB = curJaFricB;
      }
    }
    return { ctrl: ctrl, total: nFrames * HOP, startFrame: frStart, endFrame: frEnd, events: ev };
  }

  /* ---------- 声带音：倍频振幅叠加 ---------- */
  var TAIL_DB_OCT = -12;          // 超出 16 阶后的续接斜率（dB/oct，按 log2(k) 计）
  var NHARM_MAX = HD ? 256 : 64;
  /* 音高 → 声带音电平。脉冲宽度一定时，基频升高则谱线变稀、每条谱线变强，
     幅度大致与 f0 成正比（+6dB/oct）；真实歌手靠降低声门下压力抵消掉一半。
     这里取 −0.5，即净保留 +3dB/oct：等力度下高低音区的响度差从 27dB 收到 13dB。 */
  var PITCH_EXP = -0.5;
  NSG.PITCH_EXP = PITCH_EXP;
  var FRIC_TRIM = 0.03;           // 清擦音/爆破噪声相对浊音通路的电平标定
  NSG.FRIC_TRIM = FRIC_TRIM;
  NSG.TAIL_DB_OCT = TAIL_DB_OCT;

  function makeSource(timbre, wideband, organicAmt, humanizeAmt, seedSalt) {
    var amps = timbre.harm || NSG.defaultHarm();
    var rnd = mulberry32(0x9e3779b9);
    // 512 partials cover 20 kHz down to F0=40 Hz. Reference/ordinary paths
    // retain their exact table sizes and random sequence.
    var count = wideband ? 512 : NHARM_MAX;
    var ph = new Float64Array(count), amp = new Float64Array(count);
    for (var k = 0; k < count; k++) ph[k] = rnd();
    var harmDrift = null, harmDriftCoef = null, harmDriftGain = null, harmDriftOut = null, harmRnd = null;
    if (organicAmt > 0) {
      var nb = 32, dtFrame = HOP / SR;
      harmRnd = mulberry32(0x6c8e9cf5);
      harmDrift = new Float64Array(nb);
      harmDriftCoef = new Float64Array(nb);
      harmDriftGain = new Float64Array(nb);
      harmDriftOut = new Float64Array(nb);
      for (var b = 0; b < nb; b++) {
        var fc = 5.5 + b * 0.25;
        var a = Math.exp(-2 * Math.PI * fc * dtFrame);
        harmDriftCoef[b] = a;
        harmDriftGain[b] = Math.sqrt((1 + a) / Math.max(1e-12, 1 - a));
      }
    }
    var randPhase = null, phaseOff = null, phaseOffTarget = null, phaseOffStep = null, lfTable = null;
    var partPhaseJit = null, partPhaseVel = null, partRnd = null;
    if (humanizeAmt > 0) {
      randPhase = new Float64Array(ph);
      phaseOff = new Float64Array(ph);
      phaseOffTarget = new Float64Array(ph);
      phaseOffStep = new Float64Array(count);
      lfTable = getLfTable();
      if (studioMode) {
        partPhaseJit = new Float64Array(count);
        partPhaseVel = new Float64Array(count);
        partRnd = mulberry32((0x517cc1b7 ^ (seedSalt || 0)) >>> 0);
      }
    }
    return { phase: ph, amp: amp, target: new Float64Array(count), step: new Float64Array(count), amps: amps, K: count, wideband: !!wideband, nextK: 0, activeK: 0,
      lowActiveK: 0, highActiveK: 0,
      highStart: count, nextHighStart: count, highSilent: true, nextHighSilent: true,
      fullTarget: modeB ? new Float64Array(count) : null,
      highAmp: modeB ? new Float64Array(count) : null, highTarget: modeB ? new Float64Array(count) : null,
      highStep: modeB ? new Float64Array(count) : null, airAmp: 0, airTarget: 0, airStep: 0,
      harmDrift: harmDrift, harmDriftCoef: harmDriftCoef, harmDriftGain: harmDriftGain, harmDriftOut: harmDriftOut, harmRnd: harmRnd,
      masterPhase: 0, randPhase: randPhase, phaseOff: phaseOff, phaseOffTarget: phaseOffTarget, phaseOffStep: phaseOffStep, lfTable: lfTable,
      partPhaseJit: partPhaseJit, partPhaseVel: partPhaseVel, partRnd: partRnd };
  }

  var LOG10_OVER_20_SRC = Math.LN10 / 20;
  function setHarmonics(src, f0, tiltDb, gl, smoothCutoff, smoothBlend, organicAmt, organicGate, humanizeAmt, rd, snapPhase) {
    var n = src.amps.length;
    var tailDb = gl && gl.tailDb !== undefined ? gl.tailDb : TAIL_DB_OCT;
    var last = src.amps[n - 1], lastOctave = Math.log(n) / Math.LN2;
    var pitchDb = 20 * Math.log(f0 / 262) * NSG.PITCH_EXP;
    var count = src.phase.length;
    var K = Math.max(1, Math.min(count, Math.floor(SOURCE_TOP / Math.max(40, f0))));
    // Clear silent targets in bulk. Only outgoing partials can have a nonzero
    // amplitude to fade; all earlier outgoing partials reached zero at the
    // end of their previous frame.
    if (modeB) src.fullTarget.fill(0, K);
    src.target.fill(0, K); src.step.fill(0, K);
    var lowTop = 0;
    for (var outgoing = K; outgoing < src.activeK; outgoing++) {
      if (src.amp[outgoing] !== 0) {
        src.step[outgoing] = -src.amp[outgoing] / HOP;
        lowTop = outgoing + 1;
      }
    }
    src.activeK = K;
    var sb = smoothBlend === undefined ? (smoothCutoff > 0 ? 1 : 0) : smoothBlend;
    var xfStart = smoothCutoff > 0 && sb > 0 ? Math.max(4000, Math.min(6800, smoothCutoff * 0.98)) : 0;
    var legacyPow = !!NSG.LEGACY_SOUND;
    var orgHarmEff = (organicAmt > 0 && src.harmDrift) ? organicAmt * (organicGate || 0) : 0;
    var driftArr = src.harmDrift, driftOut = src.harmDriftOut, driftMean = 0;
    if (organicAmt > 0 && driftArr) {
      var hrnd = src.harmRnd, hCoef = src.harmDriftCoef, hGain = src.harmDriftGain;
      var activeBands = Math.min(32, K);
      for (var hb = 0; hb < 32; hb++) {
        var hx = (hrnd() + hrnd() + hrnd() - 1.5) * 2;
        var aH = hCoef[hb];
        var dv = (1 - aH) * hx + aH * driftArr[hb];
        driftArr[hb] = dv;
        var sc = dv * hGain[hb];
        var bounded = sc / (1 + Math.abs(sc) * 0.38);
        driftOut[hb] = bounded;
        if (hb < activeBands) driftMean += bounded;
      }
      driftMean /= Math.max(1, activeBands);
      for (var hb2 = 0; hb2 < 32; hb2++) driftOut[hb2] -= driftMean;
    }
    var useLf = humanizeAmt > 0 && !!src.lfTable;
    var lfP0 = null, lfP1 = null, lfModal = null, lfM0 = null, lfM1 = null, lfFr = 0, lfNh = 0, fCoh = 2400;
    var stDispStart = 1550, stRd = 1.05, stCohCeil = 0.25, stCohStart = 4800, stDt = HOP / SR;
    var stJit = src.partPhaseJit, stVel = src.partPhaseVel, stRnd = src.partRnd;
    if (useLf) {
      var lt = src.lfTable;
      var rdClamped = Math.max(lt.rdMin, Math.min(lt.rdMin + (lt.nrd - 1) * lt.rdStep, rd !== undefined ? rd : 1.05));
      stRd = rdClamped;
      var rPos = (rdClamped - lt.rdMin) / lt.rdStep;
      var rI = Math.min(lt.nrd - 2, rPos | 0);
      lfFr = rPos - rI;
      lfP0 = lt.phase[rI]; lfP1 = lt.phase[rI + 1];
      lfModal = lt.phase[Math.round((1 - lt.rdMin) / lt.rdStep)];
      lfM0 = lt.magDelta[rI]; lfM1 = lt.magDelta[rI + 1];
      lfNh = lt.nh;
      // Tighter chest voice stays phase-coherent higher; breathy voice disperses earlier.
      fCoh = Math.max(1500, Math.min(3000, 2650 - 480 * (rdClamped - 1.0)));
      if (studioMode) {
        stDispStart = Math.max(950, Math.min(1650, 1320 - 320 * (rdClamped - 1.0)));
        var stRdU = Math.max(0, Math.min(1, (rdClamped - 0.8) / 0.7));
        stCohCeil = 0.38 - 0.14 * stRdU;
        stCohStart = 5400 - 800 * stRdU;
      }
      var rdComp = (studioMode && lt.rdCompDb) ? (lt.rdCompDb[rI] + (lt.rdCompDb[rI + 1] - lt.rdCompDb[rI]) * lfFr) : 0;
    }
    for (var k = 1; k <= K; k++) {
      var oct = harmonicOctaves[k];                 // 以 H1 为 0 倍频程
      var db = k <= n ? src.amps[k - 1] : last + tailDb * (oct - lastOctave);
      db += tiltDb * oct + pitchDb;
      if (studioMode && useLf && stRd > 1.35 && oct > 0.85) db -= 1.15 * (stRd - 1.35) * (oct - 0.85);
      var khz = k * f0;
      if (gl) db += NSG.sourceDbAt(gl, khz, SR);
      if (useLf) {
        var mIdx = k <= lfNh ? k - 1 : lfNh - 1;
        var mDelta = lfM0[mIdx] + (lfM1[mIdx] - lfM0[mIdx]) * lfFr;
        // The frame's Rd already blends toward modal at low humanize settings.
        if (studioMode) {
          var mClamped = Math.max(-10, Math.min(6.5, mDelta));
          var lfScale;
          if (mClamped > 0) {
            var fkT = Math.max(0, Math.min(1, (khz - 1200) / 2200));
            var kT = Math.max(0, Math.min(1, (k - 4) / 10));
            var uT = fkT > kT ? fkT : kT;
            lfScale = 1 - 0.82 * (uT * uT * (3 - 2 * uT));
          } else {
            lfScale = 0.75;
          }
          db += lfScale * mClamped;
          db += rdComp;
          if (stRd > 1.12) {
            var oqU = Math.min(1.1, stRd - 1.12);
            if (k === 1) db += 3.8 * oqU;
            else if (k === 2) db -= 1.4 * oqU;
          } else if (stRd < 0.96) {
            var skewU = Math.min(0.45, 0.96 - stRd) / 0.45;
            if (k === 1) db -= 0.9 * skewU;
            else if (k === 2) db += 2.6 * skewU;
            else if (k === 3) db += 1.2 * skewU;
          }
        } else {
          db += 0.68 * mDelta;
        }
        var tgtOff;
        if (studioMode && stJit) {
          var lfPhSt = k <= lfNh ? (lfP0[k - 1] + (lfP1[k - 1] - lfP0[k - 1]) * lfFr) : 0;
          if (khz > stDispStart) {
            var uDisp = Math.min(1, (khz - stDispStart) / 2200);
            var wDecoh = uDisp * uDisp * (3 - 2 * uDisp);
            var rpSt = src.randPhase[k - 1];
            var basePh = lfPhSt + wDecoh * (rpSt - lfPhSt - Math.round(rpSt - lfPhSt));
            var dispRate = 1.8 + 3.2 * uDisp;
            var dispAmp = (0.006 + 0.018 * Math.pow(uDisp, 1.35)) * (0.75 + 0.45 * Math.min(1.0, Math.max(0, stRd - 0.85)));
            var aD = Math.exp(-2 * Math.PI * dispRate * stDt);
            var uTri = (stRnd() + stRnd() - 1) * 2.44948974;
            var vD = aD * stVel[k - 1] + Math.sqrt(Math.max(0, 1 - aD * aD)) * uTri;
            stVel[k - 1] = vD;
            var jD = aD * stJit[k - 1] + (1 - aD) * (dispAmp * 1.4 * vD);
            stJit[k - 1] = jD;
            tgtOff = basePh + jD;
          } else {
            stVel[k - 1] *= 0.7;
            stJit[k - 1] *= 0.7;
            tgtOff = lfPhSt + stJit[k - 1];
          }
        } else {
          var wCoh = khz <= fCoh ? 1 : (khz >= fCoh + 2200 ? 0 : 1 - (khz - fCoh) / 2200);
          wCoh = wCoh * wCoh * (3 - 2 * wCoh) * humanizeAmt;
          var rp = src.randPhase[k - 1];
          tgtOff = rp;
          if (wCoh > 1e-6 && k <= lfNh) {
            var pA = lfP0[k - 1], pB = lfP1[k - 1];
            // Choose the turn once at modal phonation. Re-selecting the
            // shortest arc as Rd moves flips the blended partial at half a turn.
            var lfPh = pA + (pB - pA) * lfFr;
            tgtOff = rp + wCoh * (lfPh - rp - Math.round(lfModal[k - 1] - rp));
          }
        }
        if (snapPhase) {
          var pSnap = tgtOff - Math.floor(tgtOff);
          src.phaseOff[k - 1] = pSnap < 0 ? pSnap + 1 : pSnap;
          src.phaseOffTarget[k - 1] = src.phaseOff[k - 1];
          src.phaseOffStep[k - 1] = 0;
        } else {
          var curOff = src.phaseOff[k - 1];
          var dOff = tgtOff - curOff; dOff -= Math.round(dOff);
          if (studioMode) {
            if (dOff > 0.045) dOff = 0.045;
            else if (dOff < -0.045) dOff = -0.045;
          }
          // Keep phaseOff strictly >= 0 across the entire HOP so inner loop can use fast | 0 instead of Math.floor.
          if (curOff + dOff < 0) curOff += 1;
          src.phaseOff[k - 1] = curOff;
          src.phaseOffTarget[k - 1] = curOff + dOff;
          src.phaseOffStep[k - 1] = dOff / HOP;
        }
      }
      if (orgHarmEff > 1e-5) {
        var bIdx = k <= 32 ? k - 1 : (20 + ((k - 33) % 12));
        var hDepth = 0.14 + 0.56 * Math.min(1, (k - 1) / 8);
        db += hDepth * orgHarmEff * driftOut[bIdx];
      }
      var a = legacyPow ? Math.pow(10, db / 20) : Math.exp(db * LOG10_OVER_20_SRC);
      if (modeB) src.fullTarget[k - 1] = a;
      var target = a < 1e-6 ? 0 : a;
      if (useLf && studioMode && khz > stCohStart && target > 0) {
        var xtC = Math.min(1, (khz - stCohStart) / 4200);
        var sCoh = xtC * xtC * (3 - 2 * xtC);
        target *= 1 - (1 - stCohCeil) * sCoh;
      }
      if (xfStart > 0 && khz > xfStart) {
        var xr = Math.min(1, (khz - xfStart) / 1400);
        target *= 1 - sb * xr * xr * (3 - 2 * xr);
      }
      src.target[k - 1] = target;
      var st = (target - src.amp[k - 1]) / HOP;
      src.step[k - 1] = st;
      if (target !== 0 || st !== 0 || src.amp[k - 1] !== 0) lowTop = Math.max(lowTop, k);
    }
    src.lowActiveK = Math.max(1, lowTop);
    if (src.wideband) {
      src.K = Math.max(K, src.nextK); src.nextK = K;
    }
  }

  function voicedHighShape(hz, f6, wideband, tractJoin, smoothEnv) {
    var sb = smoothEnv === true ? 1 : smoothEnv === false ? 0 : (typeof smoothEnv === 'number' && isFinite(smoothEnv) ? Math.max(0, Math.min(1, smoothEnv)) : 0);
    var scale = Math.max(0.65, Math.min(1.6, f6 / 5200));
    var smoothVal = 0;
    if (sb > 0) {
      var envStart = Math.max(3600, Math.min(6200, f6 * 0.85));
      var envFade = Math.max(0, Math.min(1, (hz - envStart) / 1500));
      envFade = envFade * envFade * (3 - 2 * envFade);
      var refHz = Math.max(5200, f6 * 0.96);
      var slope = Math.pow(Math.max(1, hz / refHz), studioMode ? -1.65 : -1.18);
      var envTop = studioMode
        ? (hz <= 11500 ? 1 : hz >= 16000 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 11500) / 4500))
        : (hz <= 15000 ? 1 : hz >= 20000 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 15000) / 5000));
      smoothVal = envFade * envTop * slope * 0.68;
      if (sb >= 1) return smoothVal;
    }
    // A fixed 6k onset leaves a hole after the lower F6 of long vocal tracts.
    // Overlap the tract's upper shoulder; the shared power budget below keeps
    // this continuation from adding loudness or an independent layer of hiss.
    // High-F6 voices retain their accepted onset and complete spectral shape.
    var start = tractJoin ? Math.max(3800, Math.min(6000, f6 - 150)) : 6000;
    var f7 = Math.max(start + 1100, f6 + 1500 * scale), f8 = f7 + 2000 * scale;
    var fade = Math.max(0, Math.min(1, (hz - start) / 1100));
    fade = fade * fade * (3 - 2 * fade);
    var peak7 = 1 / Math.sqrt(1 + Math.pow((hz - f7) / (850 * scale), 2));
    var peak8 = 1 / Math.sqrt(1 + Math.pow((hz - f8) / (1100 * scale), 2));
    var refVal;
    if (!wideband) refVal = fade * Math.max(0, Math.min(1, (16000 - hz) / 2000)) * (0.7 * peak7 + 0.3 * peak8);
    else {
      // Smooth cosine taper across 18-20 kHz instead of a 19-20 kHz brickwall
      // that causes vibrato harmonic ripples near 19 kHz.
      var top = hz <= 18000 ? 1 : hz >= 20000 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 18000) / 2000);
      // Upper-tract modal relief (cross-mode peak near ~12-14 kHz and gentle
      // inter-modal dip) instead of a flat high-frequency plateau.
      var f9 = f8 + 3400 * scale;
      var peak9 = 1 / Math.sqrt(1 + Math.pow((hz - f9) / (2400 * scale), 2));
      var dipHz = f8 + 1300 * scale;
      var dip = 1 - 0.22 * Math.exp(-Math.pow((hz - dipHz) / (1100 * scale), 2));
      // Ease the high-source slope above 8k; the old normalised narrow hump
      // accumulated almost all periodic power near its lower edge.
      var shelf = Math.pow(10, 7.8 * Math.log2(Math.max(1, hz / 8000)) / 20);
      refVal = fade * top * shelf * dip * (0.5 * peak7 + 0.3 * peak8 + 0.22 * peak9);
    }
    return sb > 0 ? refVal + (smoothVal - refVal) * sb : refVal;
  }

  // Selected D profile (2026-11-13). Only the unedited built-in F02 output
  // curve selects it; names and preset tags cannot override a custom EQ.
  var modeBSelectedD = {
    body: [[2000,0],[3000,-0.02],[4000,-0.25],[5000,-0.65],[6000,-1.3],[7000,-3.8],[8000,-4.6],[12000,-4.7],[16000,-6],[20000,-10.3]],
    core: [[6000,-3],[8000,-5.8],[12000,-6.2],[16000,-7.5],[20000,-11]],
    air: [[6000,-2],[8000,-4.2],[12000,-4.5],[16000,-5.8],[20000,-9.8]],
    friction: [[2000,0],[3000,-0.02],[4000,-0.2],[5000,-0.65],[6000,-1.1],[7000,-3.1],[8000,-4.4],[12000,-4.6],[16000,-7],[20000,-11]]
  };
  var modeBF02EqKey = null;
  function modeBRefinementOf(timbre) {
    if (timbre.modeBOutEq || !Array.isArray(timbre.outEq)) return null;
    if (modeBF02EqKey === null) {
      var f2p = NSG.presetById('f2');
      modeBF02EqKey = (f2p && Array.isArray(f2p.outEq)) ? f2p.outEq.join(',') : '';
    }
    return modeBF02EqKey && timbre.outEq.join(',') === modeBF02EqKey ? modeBSelectedD : null;
  }
  function refineDb(anchors, hz) {
    if (hz <= anchors[0][0]) return anchors[0][1];
    for (var i = 1; i < anchors.length; i++) if (hz <= anchors[i][0]) {
      var x = Math.log(hz / anchors[i - 1][0]) / Math.log(anchors[i][0] / anchors[i - 1][0]);
      x = x * x * (3 - 2 * x);
      return anchors[i - 1][1] + x * (anchors[i][1] - anchors[i - 1][1]);
    }
    return anchors[anchors.length - 1][1];
  }
  var refinementCurves = {};
  function refineCurve(branch) {
    if (!refinementCurves[branch]) refinementCurves[branch] = Array.from({ length: 64 }, function (_, i) {
      return refineDb(modeBSelectedD[branch], 50 * Math.pow(400, i / 63));
    });
    return refinementCurves[branch];
  }

  // Symmetric 25-tap FIR for the relative colour of the air branch. The
  // existing air gain carries total power. Normalize the correction against
  // that branch's spectrum and send the same coefficients to both renderers.
  function effortAirKernel(profile, offset, curve) {
    var radius = 12, bins = 128, gains = [], energy = 0, weight = 0;
    for (var i = 0; i < bins; i++) {
      var hz = SR * (i + 0.5) / (2 * bins);
      var band = hz < 7000 ? offset : offset + 1;
      var u = clampUnit(hz < 7000 ? (hz - 5000) / 2000 : (hz - 7000) / 3000);
      var q = profile[band] + u * (profile[band + 1] - profile[band]);
      var w = Math.pow(10, NSG.outEqDbAt(curve, hz) / 10);
      gains.push(Math.sqrt(q)); energy += q * w; weight += w;
    }
    var scale = Math.sqrt(weight / Math.max(energy, 1e-12)), kernel = [];
    for (var j = 0; j <= radius; j++) {
      var sum = 0;
      for (var k = 0; k < bins; k++) sum += gains[k] * Math.cos(Math.PI * (k + 0.5) * j / bins);
      kernel.push(scale * sum / bins * (0.5 + 0.5 * Math.cos(Math.PI * j / (radius + 1))));
    }
    return kernel;
  }
  function shapeEffortAir(samples, ctrl, kernels) {
    if (!kernels) return;
    var input = samples.slice();
    for (var f = 0; f < ctrl.length; f++) {
      var amount = ctrl[f].effort;
      if (!amount) continue;
      var taps = kernels[amount < 0 ? 0 : 1], end = Math.min(input.length, (f + 1) * HOP);
      for (var i = f * HOP; i < end; i++) {
        var filtered = taps[0] * input[i];
        for (var j = 1; j < taps.length; j++) filtered += taps[j] * ((input[i-j] || 0) + (input[i+j] || 0));
        samples[i] += Math.abs(amount) * (filtered - input[i]);
      }
    }
  }
  function makeVoicedAir(timbre, compensateEq, soften, refine, tractJoin, smoothBlend, perturbBlend) {
    var sb = smoothBlend === true ? 1 : smoothBlend === false ? 0 : (typeof smoothBlend === 'number' && isFinite(smoothBlend) ? Math.max(0, Math.min(1, smoothBlend)) : 0);
    var pb = perturbBlend === true ? 1 : perturbBlend === false ? 0 : (typeof perturbBlend === 'number' && isFinite(perturbBlend) ? Math.max(0, Math.min(1, perturbBlend)) : 0);
    var f6 = NSG.formantsOf(NSG.PHONES.a, timbre).pairs[5][0], curve = [];
    var radASt = studioMode ? Math.exp(-2 * Math.PI * RAD_NOM_HZ / SR) : 0;
    for (var i = 0; i < 64; i++) {
      var hz = 50 * Math.pow(400, i / 63);
      if (studioMode) {
        var fadeSt = Math.max(0, Math.min(1, (hz - 5600) / 2800));
        fadeSt = fadeSt * fadeSt * (3 - 2 * fadeSt);
        var rollSt = Math.pow(Math.max(1, hz / 7200), -1.55);
        var topSt = hz <= 13500 ? 1 : hz >= 19000 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 13500) / 5500);
        curve.push(Math.max(-120, 20 * Math.log10(Math.max(1e-6, fadeSt * rollSt * topSt))));
      } else {
        // Natural turbulent upper-air roll-off above 8 kHz + smooth cosine taper
        // from 13.5 kHz to 20 kHz, avoiding a flat 8-18 kHz plateau and the
        // 19-20 kHz FIR stopband cliff.
        var aOld = sb < 1 ? voicedHighShape(hz, f6, true, tractJoin, 0) * Math.pow(Math.max(1, hz / 7800), -2.0) *
          (hz <= 13500 ? 1 : hz >= 19500 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 13500) / 6000)) : 0;
        var aNew = sb > 0 ? voicedHighShape(hz, f6, true, tractJoin, 1) * Math.pow(Math.max(1, hz / 7200), -0.55) *
          (hz <= 15500 ? 1 : hz >= 20000 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (hz - 15500) / 4500)) : 0;
        var a = (sb >= 1 ? aNew : sb <= 0 ? aOld : aOld + (aNew - aOld) * sb) *
          Math.sqrt(2 - 2 * Math.cos(2 * Math.PI * hz / SR));
        curve.push(Math.max(-120, 20 * Math.log10(Math.max(1e-6, a))));
      }
    }
    var power = 0, bins = 2048;
    var nomResR = Math.exp(-Math.PI * 6400 / SR), nomResB = 2 * nomResR * Math.cos(2 * Math.PI * 6400 / SR), nomResC = -nomResR * nomResR, nomResA2 = (1 - nomResB - nomResC) * (1 - nomResB - nomResC);
    for (var b = 0; b < bins; b++) {
      var f = (b + 0.5) * SR / (2 * bins);
      var db = NSG.outEqDbAt(curve, f);
      if (compensateEq && Array.isArray(timbre.outEq)) db += NSG.outEqDbAt(timbre.outEq, f);
      var bPow = Math.pow(10, db / 10) / (3 * bins);
      if (studioMode) {
        var wb = 2 * Math.PI * f / SR, cwb = Math.cos(wb), swb = Math.sin(wb), c2b = cwb * cwb - swb * swb, s2b = 2 * cwb * swb;
        var drb = 1 - nomResB * cwb - nomResC * c2b, dib = nomResB * swb + nomResC * s2b;
        bPow *= nomResA2 / (drb * drb + dib * dib + 1e-18);
      }
      power += bPow; // uniform white noise variance = 1/3
    }
    // Apply D AFTER estimating the original budget. Including this attenuation
    // in power would normalize away the accepted reduction in upper air.
    if (refine && !studioMode) for (var ai = 0; ai < curve.length; ai++)
      curve[ai] += refineDb(refine.air, 50 * Math.pow(400, ai / 63));
    // Concave breath scaling: normal voices (~0.04) retain clear upper harmonics
    // instead of saturating at 70% noise, while breathier voices (~0.10) stay airy.
    // Under HNM mode, allow sufficient upper turbulence budget so high-frequency
    // harmonics fade smoothly into silky air without FM beating.
    var effBr = studioMode ? Math.max(0.008, timbre.breath || 0) : (timbre.breath || 0);
    var brNorm = Math.min(1, Math.max(0, effBr) / 0.065);
    var fracOld = 0.64 * Math.pow(brNorm, 0.50);
    var fracNew = studioMode ? (0.14 + 0.38 * Math.pow(brNorm, 0.65)) : Math.max(0.26, 0.72 * Math.pow(brNorm, 0.45));
    var profile = NSG.validEffortProfile(timbre.effortProfile) ? timbre.effortProfile : NSG.defaultEffortProfile;
    return { eq: curve, power: power, profile: profile,
      kernels: null,
      fraction: studioMode ? fracNew : (pb >= 1 ? fracNew : pb <= 0 ? fracOld : fracOld + (fracNew - fracOld) * pb),
      trimGain: studioMode ? Math.pow(10, -2.5 / 20) : (soften ? Math.pow(10, -3 / 20) : 1) };
  }

  // Keep a periodic core and budget breath-linked turbulence separately.
  // Zero breath remains genuinely periodic. Both components follow voiced
  // amplitude/tract colour; neither can borrow the clear-consonant budget.
  var LOG10_OVER_20 = Math.LN10 / 20;
  function setVoicedHigh(src, f0, c, timbre, gl, strength, compensateEq, wideband, air, refine, tractJoin, smoothBlend, perturbBlend) {
    var sb = smoothBlend === true ? 1 : smoothBlend === false ? 0 : (typeof smoothBlend === 'number' && isFinite(smoothBlend) ? Math.max(0, Math.min(1, smoothBlend)) : 0);
    var pb = perturbBlend === true ? 1 : perturbBlend === false ? 0 : (typeof perturbBlend === 'number' && isFinite(perturbBlend) ? Math.max(0, Math.min(1, perturbBlend)) : 0);
    var gate = (c.voicedHighGate || 0) * Math.max(0, 1 - (c.nmix || 0));
    if (strength <= 0 || gate <= 1e-6 || c.av < 1e-6) {
      var hTop0 = 0;
      if (!src.highSilent) {
        for (var h0 = src.highStart; h0 < src.K; h0++) {
          src.highTarget[h0] = 0;
          if (src.highAmp[h0] !== 0) { src.highStep[h0] = -src.highAmp[h0] / HOP; hTop0 = h0 + 1; }
          else src.highStep[h0] = 0;
        }
      }
      src.highActiveK = hTop0;
      src.nextHighStart = src.highAmp.length;
      src.nextHighSilent = true;
      src.airTarget = 0; src.airStep = -src.airAmp / HOP;
      return;
    }
    var f6 = c.fb[5][0], power = 0, shapeOnlyPower = 0, refPower = 0;
    // Higher vocal effort sharpens glottal closure (higher HNR: more periodic
    // shimmer, less continuous hiss); softer singing allows a breathier upper tail.
    var effortNorm = Math.max(-1, Math.min(1, (c.sourceTilt || 0) / 2.5));
    var maxFrac = 0.72 + (0.86 - 0.72) * pb;
    var effortSlope = 0.28 + (0.22 - 0.28) * pb;
    var baseFraction = air ? Math.max(0.03, Math.min(maxFrac, air.fraction * (1 - effortSlope * effortNorm))) : 0;
    var effort = air ? c.effort || 0 : 0, ep = effort < 0 ? 0 : 4;
    var useHnm = !!(air && (pb > 0 || effort));
    var oldStart = tractJoin ? Math.max(3800, Math.min(6000, f6 - 150)) : 6000;
    var newStart = Math.max(3600, Math.min(6200, f6 * 0.85));
    var start = sb >= 1 ? newStart : sb <= 0 ? oldStart : Math.min(oldStart, newStart);
    var kStart = Math.min(src.K, Math.max(0, Math.floor(start / f0)));
    while (kStart > 0 && kStart * f0 > start) kStart--;
    var hTop = 0;
    if (!src.highSilent) {
      for (var kz = src.highStart; kz < kStart; kz++) {
        src.highTarget[kz] = 0;
        if (src.highAmp[kz] !== 0) { src.highStep[kz] = -src.highAmp[kz] / HOP; hTop = kz + 1; }
        else src.highStep[kz] = 0;
      }
      if (kStart < src.highStart) src.highStart = kStart;
    } else {
      src.highStart = kStart;
    }
    src.nextHighStart = kStart;
    src.highSilent = false;
    src.nextHighSilent = false;
    var hasOutEq = compensateEq && Array.isArray(timbre.outEq);
    var twoPiOverSr = 2 * Math.PI / SR;
    var hnmStart = Math.max(5000, Math.min(6000, f6 * 0.86)), hnmSpan = 7500;
    var dw = twoPiOverSr * f0, wStart = dw * (kStart + 1);
    var cwStep = Math.cos(dw), swStep = Math.sin(dw);
    var cwCur = Math.cos(wStart), swCur = Math.sin(wStart);
    var legacyTrig = !!NSG.LEGACY_SOUND;
    var rdHigh = c.rd !== undefined ? c.rd : 1.05;
    var rdHighU = Math.max(0, Math.min(1, (rdHigh - 0.8) / 0.7));
    var stHighCeil = 0.42 - 0.16 * rdHighU;
    var stHighStart = 5600 - 900 * rdHighU;
    var radAHi = studioMode ? Math.exp(-2 * Math.PI * RAD_NOM_HZ / SR) : 0;
    var radNum2Hi = (1 - radAHi) * (1 - radAHi), radDenBHi = 1 + radAHi * radAHi, rad2AHi = 2 * radAHi;
    for (var k = kStart; k < src.K; k++) {
      var hz = (k + 1) * f0;
      var refShape = voicedHighShape(hz, f6, wideband, tractJoin, 0);
      var newShape = sb > 0 ? voicedHighShape(hz, f6, wideband, tractJoin, 1) : refShape;
      var aShape = sb >= 1 ? newShape : sb <= 0 ? refShape : refShape + (newShape - refShape) * sb;
      var coh = 1;
      if (studioMode) {
        if (hz > stHighStart) {
          var xtS = Math.min(1, (hz - stHighStart) / 4200);
          coh = 1 - (1 - stHighCeil) * (xtS * xtS * (3 - 2 * xtS));
        }
        if (hz > 10500) {
          var xtU = Math.min(1, (hz - 10500) / 4500);
          coh *= 1 - (xtU * xtU * (3 - 2 * xtU));
        }
      } else {
        if (useHnm && hz > hnmStart) {
          var xt = Math.min(1, (hz - hnmStart) / hnmSpan);
          var hnmCoh = 0.22 + 0.78 * Math.max(0, 1 - xt * xt * (3 - 2 * xt));
          coh = 1 - pb * (1 - hnmCoh);
        }
        if (effort) {
          var p = air.profile, kHz = hz / 1000;
          var band = kHz < 7 ? ep : ep + 1;
          var u = clampUnit(kHz < 7 ? (kHz - 5) / 2 : (kHz - 7) / 3);
          var residual = p[band] + u * (p[band + 1] - p[band]);
          coh = Math.sqrt(Math.max(0, coh * coh + Math.abs(effort) * ((1 - residual) / (1 - baseFraction) - coh * coh)));
        }
      }
      var aBase = src.fullTarget[k] * aShape;
      var a = aBase * coh;
      src.highTarget[k] = a;
      var eq = hasOutEq ? Math.exp(NSG.outEqDbAt(timbre.outEq, hz) * LOG10_OVER_20) : 1;
      var cosVal = legacyTrig ? Math.cos(twoPiOverSr * hz) : cwCur;
      if (!legacyTrig) {
        var nextCw = cwCur * cwStep - swCur * swStep;
        swCur = swCur * cwStep + cwCur * swStep;
        cwCur = nextCw;
      }
      var radFHi = studioMode ? radNum2Hi / Math.max(1e-9, radDenBHi - rad2AHi * cosVal) : 1;
      var w = eq * eq * (2 - 2 * cosVal) * radFHi;
      power += a * a * w;
      shapeOnlyPower += aBase * aBase * w;
      var aRef = src.fullTarget[k] * refShape;
      refPower += aRef * aRef * w;
    }
    var sourceFilter = gl;
    if (!compensateEq && gl && gl.out) sourceFilter = { gl: gl.gl, eq: gl.eq, out: null };
    var effTilt = pitchTiltAt(timbre, f0);
    var bodyPower = chainPower(c.fb, f0, src.amps, effTilt + (c.sourceTilt || 0), sourceFilter);
    var colour = Math.max(-5, Math.min(3, 3 * Math.log2(Math.max(200, c.fb[1][0]) / 1500)));
    var levelDb = studioMode
      ? (-32.0 + 4.5 * strength + Math.max(-3, Math.min(3, effTilt * 0.5)) + 0.65 * colour + 1.1 * Math.max(0, rdHigh - 1.0) + 0.65 * (c.sourceTilt || 0))
      : ((wideband ? -32.5 : -36) + 10 * strength + Math.max(-4, Math.min(3, effTilt * 0.5)) + colour + 2 * (c.sourceTilt || 0));
    var budget = Math.max(0, bodyPower) * Math.exp(levelDb * LOG10_OVER_10);
    // Anchor gain against the un-attenuated envelope reference so trimming >9 kHz
    // shelf energy or rolling off upper harmonics never pushes excess level down into 6-9 kHz.
    var calBase = useHnm ? shapeOnlyPower : power;
    var calSmooth = Math.max(shapeOnlyPower, refPower * 0.90);
    var calPower = sb >= 1 ? calSmooth : sb <= 0 ? calBase : calBase + (calSmooth - calBase) * sb;
    var cohRatio = useHnm && shapeOnlyPower > 1e-30 ? power / shapeOnlyPower : 1;
    var fraction = air ? (studioMode ? Math.max(0.14, Math.min(0.65, baseFraction + 0.16 * Math.max(0, rdHigh - 1.0))) : (useHnm ? Math.max(effort ? 0 : baseFraction, 1 - (1 - baseFraction) * cohRatio) : baseFraction)) : 0;
    var gain = strength > 0 && calPower > 1e-30 ? gate * Math.sqrt(budget * (1 - baseFraction) / calPower) : 0;
    var airGain = air && air.power > 1e-30 ? gate * Math.sqrt(0.5 * budget * fraction / air.power) * air.trimGain : 0;
    src.airTarget = airGain; src.airStep = (airGain - src.airAmp) / HOP;
    for (var h = kStart; h < src.K; h++) {
      // Keep the original shared budget; do not replenish the removed core as
      // periodic power or turbulence. F0 and the existing phases are unchanged.
      var ht = src.highTarget[h] * gain * (refine ? Math.exp(refineDb(refine.core, (h + 1) * f0) * LOG10_OVER_20) : 1);
      src.highTarget[h] = ht;
      var hst = (ht - src.highAmp[h]) / HOP;
      src.highStep[h] = hst;
      if (ht !== 0 || hst !== 0 || src.highAmp[h] !== 0) hTop = Math.max(hTop, h + 1);
    }
    src.highActiveK = hTop;
  }

  /* ---------- 主渲染 ---------- */
  NSG.DSP = NSG.DSP || {};

  /* 输出均衡：频率采样设计的线性相位 FIR（1023 阶，Hann 窗），FFT 分块重叠相加。
     线性相位不改变波形时序，延迟 511 样本在输出端扣回。核按曲线缓存。 */
  var EQ_L = HD ? 3071 : 1023, EQ_FFT = HD ? 8192 : 4096, eqKernelCache = new Map();
  function outEqKernel(eq, sampleRate, frequencyScale, isDelta) {
    sampleRate = sampleRate || SR; frequencyScale = frequencyScale || 1;
    var key = sampleRate + '|' + frequencyScale + '|' + (isDelta ? 'D|' : '') + eq.join(',');
    var cached = eqKernelCache.get(key);
    if (cached) {
      eqKernelCache.delete(key);
      eqKernelCache.set(key, cached);
      return cached;
    }
    var M = HD ? 8192 : 2048, re = new Float64Array(M), im = new Float64Array(M);
    for (var k = 0; k <= M / 2; k++) {
      var g = Math.pow(10, NSG.outEqDbAt(eq, k * sampleRate / M / frequencyScale) / 20);
      re[k] = g; if (k > 0 && k < M / 2) re[M - k] = g;
    }
    fft(re, im);                                  // 实对称谱 → 实对称冲激（未除 M）
    var hr = new Float64Array(EQ_FFT), hi = new Float64Array(EQ_FFT), c = (EQ_L - 1) / 2;
    for (var n = 0; n < EQ_L; n++) {
      var d = n - c, w = 0.5 + 0.5 * Math.cos(2 * Math.PI * d / (EQ_L + 1));
      hr[n] = re[(d + M) % M] / M * w;
    }
    if (isDelta) hr[c] -= 1;
    fft(hr, hi);
    var entry = { key: key, re: hr, im: hi };
    if (eqKernelCache.size >= 16) eqKernelCache.delete(eqKernelCache.keys().next().value);
    eqKernelCache.set(key, entry);
    return entry;
  }
  function applyOutEqCore(pcm, eq, sampleRate, frequencyScale, isDelta) {
    var K = outEqKernel(eq, sampleRate, frequencyScale, isDelta), B = EQ_FFT - EQ_L + 1, overlap = EQ_L - 1, c = overlap >> 1;
    var n = pcm.length;
    if (!n) return pcm;
    var tail = new Float64Array(overlap);
    var wasmRaw = NSG.WASM && NSG.WASM.raw && EQ_FFT <= 8192 ? NSG.WASM.raw() : null;
    var re = wasmRaw ? wasmRaw.real : new Float64Array(EQ_FFT);
    var im = wasmRaw ? wasmRaw.imag : new Float64Array(EQ_FFT);
    var kr = K.re, ki = K.im, invFft = 1 / EQ_FFT;
    var s = 0;
    while (s < n) {
      var lenA = Math.min(B, n - s);
      var nonZeroA = false;
      for (var z = 0; z < lenA; z++) if (pcm[s + z] !== 0) { nonZeroA = true; break; }
      var isLastA = s + B >= n;
      var wsA = s < c ? c - s : 0;
      var weA = isLastA ? n + c - s : B;
      if (!nonZeroA) {
        for (var zi = wsA; zi < weA; zi++) pcm[s + zi - c] = zi < overlap ? tail[zi] : 0;
        if (!isLastA) tail.fill(0);
        s += B;
        continue;
      }
      // Pack two consecutive non-zero real blocks into one complex FFT (Re = block A, Im = block B).
      // Because the FIR kernel is real, circular convolution is linear:
      // IFFT(FFT(A + jB) * H) = conv(A, h) + j * conv(B, h); conjugate-FFT yields Re = conv(A), -Im = conv(B).
      var sB = s + B, hasB = false, lenB = 0;
      if (!isLastA) {
        lenB = Math.min(B, n - sB);
        for (var zb = 0; zb < lenB; zb++) if (pcm[sB + zb] !== 0) { hasB = true; break; }
      }
      for (var ia = 0; ia < lenA; ia++) re[ia] = pcm[s + ia];
      re.fill(0, lenA, EQ_FFT);
      if (hasB) {
        for (var ib = 0; ib < lenB; ib++) im[ib] = pcm[sB + ib];
        im.fill(0, lenB, EQ_FFT);
      } else {
        im.fill(0, 0, EQ_FFT);
      }
      if (wasmRaw) wasmRaw.fft(EQ_FFT); else fft(re, im);
      for (var k = 0; k < EQ_FFT; k++) {
        var rk = re[k], ik = im[k], krk = kr[k], kik = ki[k];
        re[k] = rk * krk - ik * kik;
        im[k] = -(rk * kik + ik * krk);
      }
      if (wasmRaw) wasmRaw.fft(EQ_FFT); else fft(re, im);
      for (var wi = wsA; wi < weA; wi++) {
        pcm[s + wi - c] = (wi < overlap ? tail[wi] : 0) + re[wi] * invFft;
      }
      if (!isLastA) {
        for (var ja = 0; ja < overlap; ja++) tail[ja] = re[B + ja] * invFft;
      }
      if (hasB) {
        var isLastB = sB + B >= n;
        var weB = isLastB ? n + c - sB : B;
        for (var wb = 0; wb < weB; wb++) {
          pcm[sB + wb - c] = (wb < overlap ? tail[wb] : 0) - im[wb] * invFft;
        }
        if (!isLastB) {
          for (var jb = 0; jb < overlap; jb++) tail[jb] = -im[B + jb] * invFft;
        }
        s += B + B;
      } else {
        s += B;
      }
    }
    return pcm;
  }
  NSG.DSP.applyOutEq = function (pcm, eq, sampleRate, frequencyScale) {
    return applyOutEqCore(pcm, eq, sampleRate, frequencyScale, false);
  };

  function extractMixGains(ctrl) {
    var unit = true;
    for (var mg = 0; mg < ctrl.length; mg++) {
      if (ctrl[mg] && Number.isFinite(ctrl[mg].mixGain) && ctrl[mg].mixGain !== 1) { unit = false; break; }
    }
    if (unit) return null;
    var arr = new Float32Array(ctrl.length);
    for (var i = 0; i < ctrl.length; i++) {
      arr[i] = ctrl[i] && Number.isFinite(ctrl[i].mixGain) ? ctrl[i].mixGain : 1;
    }
    return arr;
  }

  /* 动态分频去齿音/防刺耳滤波器：互补一阶分频（>4.6kHz），无越限瞬态时增益恒为 1（零相位染色），
     仅在齿音或高次谐波瞬态相对中低频主体过冲时平滑压低 4.6kHz 以上频段（最多约 −6dB）。 */
  function applyStudioDeEsser(pcm, sr) {
    var n = pcm.length;
    if (!n) return;
    var sq0 = 0;
    for (var k = 0; k < n; k++) sq0 += pcm[k] * pcm[k];
    var rms0 = Math.sqrt(sq0 / n);
    if (!(rms0 > 1e-9)) return;
    var floorHi = 0.14 * rms0;
    var aSplit = Math.exp(-2 * Math.PI * 4800 / sr);
    var aScLp = Math.exp(-2 * Math.PI * 11500 / sr);
    var aBody = Math.exp(-2 * Math.PI * 3000 / sr);
    var attHi = 1 - Math.exp(-1 / (sr * 0.0012));
    var relHi = 1 - Math.exp(-1 / (sr * 0.018));
    var attLo = 1 - Math.exp(-1 / (sr * 0.004));
    var relLo = 1 - Math.exp(-1 / (sr * 0.035));
    var attG = 1 - Math.exp(-1 / (sr * 0.0015));
    var relG = 1 - Math.exp(-1 / (sr * 0.022));
    var lpSplit = 0, scLp = 0, lpBody = 0;
    var envHi = 0, envLo = 0, gCur = 1;
    for (var i = 0; i < n; i++) {
      var x = pcm[i];
      lpSplit = (1 - aSplit) * x + aSplit * lpSplit;
      var hi = x - lpSplit;
      scLp = (1 - aScLp) * hi + aScLp * scLp;
      lpBody = (1 - aBody) * x + aBody * lpBody;
      var absHi = scLp < 0 ? -scLp : scLp;
      var absLo = lpBody < 0 ? -lpBody : lpBody;
      envHi += (absHi - envHi) * (absHi > envHi ? attHi : relHi);
      envLo += (absLo - envLo) * (absLo > envLo ? attLo : relLo);
      var thresh = 0.44 * envLo + floorHi;
      var tgtG = 1;
      if (envHi > thresh) {
        var over = envHi / thresh - 1;
        tgtG = 1 / (1 + 0.65 * over);
        if (tgtG < 0.58) tgtG = 0.58;
      }
      gCur += (tgtG - gCur) * (tgtG < gCur ? attG : relG);
      pcm[i] = x - (1 - gCur) * hi;
    }
  }

  function finalizeVocalOut(out, mixGains, deEss) {
    if (deEss) applyStudioDeEsser(out, SR);
    /* 电平：按 RMS 归一，不再按峰值。
       按峰值归一时，低音的谐波密、波峰因数大，高音的谐波稀、波峰因数小；
       同样“唱得多响”，峰值一样而 RMS 能差近 20dB——低音区整段被压低，
       听起来就是“有的字听不见”。改按 RMS 定标，峰值交给 tanh 软限幅。 */
    var peak = 0, sq = 0;
    for (var q = 0; q < out.length; q++) {
      var aa = Math.abs(out[q]);
      if (aa > peak) peak = aa;
      sq += out[q] * out[q];
    }
    var rms = Math.sqrt(sq / Math.max(1, out.length));
    var g = rms > 1e-9 ? 0.20 / rms : 1;
    /* 峰值守卫看 99.5% 分位，而不是单个最大样本。
       共振峰扫过某阶谐波、颤音相位凑巧对齐时可能出现短时尖峰；
       单按最大样本压增益会让整首歌被一个瞬态牵动，
       而且越亮的音色（共振峰越高）越容易中招——八个歌手的电平就被拉不齐了。
       孤立尖峰交给后面的限幅器处理，守卫只约束"整段最响的那一片"。
       守卫线与限幅阈值一致：99.5% 的样本保持线性，限幅器只接住零星尖峰；
       若仍按旧 tanh 的 1.10 定线，限幅器会在响亮的音上频繁压增益，
       整音被压低，自动 VEL 的补偿也随之失准。 */
    var LIM_T = 0.92, LIM_SMALL = 1.0185;   // 小信号增益与旧版 tanh(x·1.05)×0.97 一致
    if (peak > 1e-9) {
      var NB = 128, hist = new Uint32Array(NB + 1), n2 = out.length;
      for (var h1 = 0; h1 < n2; h1++) {
        var av = Math.abs(out[h1]) / peak;
        hist[Math.min(NB, (av * NB) | 0)]++;
      }
      var want = n2 * 0.005, acc = 0, p995 = peak;
      for (var hb = NB; hb >= 0; hb--) {
        acc += hist[hb];
        if (acc >= want) { p995 = ((hb + 1) / NB) * peak; break; }
      }
      if (p995 * g * LIM_SMALL > LIM_T) g = LIM_T / (p995 * LIM_SMALL);
      else if (peak * g < 0.45) g = 0.45 / peak;
    }
    /* 限幅：3ms 预读的峰值限幅器，阈值以下完全线性。
       旧版对整段做 tanh(x·g·1.05)：tanh 处处弯曲，RMS 0.2 的人声也有约 −27dB 的
       谐波/互调失真，在 16k 采样下折成毛刺，是“刺”的来源之一。
       这里只在峰值越过 0.92 时压增益：req 是每个样本允许的增益，
       先取前方 L 个样本内的最小值，再做 L 点滑动平均（起音平滑且保证不越限），
       最后 50ms 释放。 */
    var LA = HD ? 144 : 48, gLin = g * LIM_SMALL;
    // Only the lookahead window and its preceding LA minima are live. Ring
    // buffers retain the original Float32 rounding and queue tie handling,
    // without three song-length temporary arrays or separate full-song passes.
    var nOut = out.length, queueSize = LA + 2;
    var dq = new Int32Array(queueSize), req = new Float32Array(queueSize), dh = 0, dt = 0, queued = 0;
    var win = new Float32Array(LA), slot = 0;
    var relA = 1 - Math.exp(-1 / (SR * 0.05)), env = 1, box = LA;
    var unitMixGain = !mixGains || !mixGains.length;
    var mgLast = unitMixGain ? 0 : mixGains.length - 1;
    function mixGainAt(sample) {
      var frame = sample / HOP, i = frame < mgLast ? Math.floor(frame) : mgLast;
      var a = mixGains[i];
      var b = i < mgLast ? mixGains[i + 1] : a;
      return a + (b - a) * (frame - Math.floor(frame));
    }
    for (var q3 = 0; q3 < nOut + LA; q3++) {
      var ax = q3 < nOut ? Math.abs(out[q3]) * gLin * (unitMixGain ? 1 : mixGainAt(q3)) : 0;
      var request = Math.fround(ax > LIM_T ? LIM_T / ax : 1);
      while (queued > 0) {
        var back = dt === 0 ? queueSize - 1 : dt - 1;
        if (req[back] < request) break;
        dt = back; queued--;
      }
      dq[dt] = q3; req[dt] = request;
      if (++dt === queueSize) dt = 0;
      queued++;
      var q5 = q3 - LA;
      if (q5 < 0) continue;
      while (dq[dh] < q5) {
        if (++dh === queueSize) dh = 0;
        queued--;
      }
      var minimum = req[dh];
      // box = 窗口 [q5-LA+1, q5] 内 win 之和；窗口外视为 1。
      box += minimum - (q5 >= LA ? win[slot] : 1);
      win[slot] = minimum;
      if (++slot === LA) slot = 0;
      var gTarget = Math.min(1, box / LA);
      env = gTarget < env ? gTarget : env + (gTarget - env) * relA;
      if (env > gTarget) env = gTarget;
      var yv = out[q5] * gLin * env * (unitMixGain ? 1 : mixGainAt(q5));
      out[q5] = yv > 0.97 ? 0.97 : yv < -0.97 ? -0.97 : yv;
    }
    return { pcm: out, sr: SR };
  }

  function buildVocalControl(score, timbre, opt) {
    opt = opt || {};
    var studio = modeB && !opt.rawSource && !NSG.LEGACY_SOUND && opt.studio !== false;
    studioMode = studio;
    var research = HD && opt.modeBSource !== false && opt.hdResearch !== false;
    var refine = modeB && !opt.rawSource && !studio && opt.modeBRefinement !== false ? modeBRefinementOf(timbre) : null;
    var nasalRelease = !opt.rawSource && opt.modeBRefinement !== false && opt.modeBNasalRelease !== false;
    var balanceAspiration = modeB && !opt.rawSource && opt.modeBAspiration !== false;
    var highStrength = typeof timbre.modeBHigh === 'number' && isFinite(timbre.modeBHigh) ? Math.max(0, Math.min(1, timbre.modeBHigh)) : 0.4;
    var voicedHigh = modeB && !opt.rawSource && opt.modeBVoicedHigh !== false && highStrength > 0;
    var wideband = modeB && opt.modeBTexture !== false;
    var perturbBlend = 0, smoothBlend = 0;
    if (modeB && !opt.rawSource) {
      if (/^(off|perturb|envelope|both)$/.test(opt.modeBHighExperiment || '')) {
        perturbBlend = opt.modeBHighExperiment === 'perturb' || opt.modeBHighExperiment === 'both' ? 1 : 0;
        smoothBlend = opt.modeBHighExperiment === 'envelope' || opt.modeBHighExperiment === 'both' ? 1 : 0;
      } else if (opt.modeBHighPolish === false) {
        perturbBlend = 0; smoothBlend = 0;
      } else if (typeof opt.modeBHighPolish === 'number' && isFinite(opt.modeBHighPolish)) {
        perturbBlend = smoothBlend = Math.max(0, Math.min(1, opt.modeBHighPolish));
      } else {
        perturbBlend = 1; smoothBlend = 1;
      }
    }
    var aspAirMix = research ? (0.18 + (0.04 - 0.18) * smoothBlend) : 0;
    var tractJoin = voicedHigh && opt.modeBTractJoin !== false &&
      NSG.formantsOf(NSG.PHONES.a, timbre).pairs[5][0] < 6150;
    var compensateHighEq = false;
    if (modeB && !opt.rawSource) {
      var eqB = NSG.modeBOutputEqOf(timbre);
      compensateHighEq = !!eqB && !timbre.modeBOutEq;
      if (eqB) timbre = Object.assign({}, timbre, { outEq: eqB });
    }
    var tm = NSG.TEMPO.map(score);
    var nasalTract = modeB && !opt.rawSource && opt.modeBNasalTract !== false && opt.modeBNasalTract !== 'off';
    var organicAmt = opt.rawSource ? 0 : (studio && opt.organicMicroVar === undefined ? 0.45 : resolveOrganicMicroVar(opt));
    var humanizeAmt = opt.rawSource ? 0 : (studio && opt.humanizeCore === undefined ? 0.78 : resolveHumanizeCore(opt));
    var sliceRange = Array.isArray(opt.sliceRange) && opt.sliceRange.length === 2 ? opt.sliceRange : null;
    var articMorphAmt = opt.rawSource ? 0 : (studio && opt.articMorph === undefined ? 0.65 : resolveArticMorph(timbre, opt));
    var autoExpress = studio && !opt.rawSource && opt.autoExpress !== false;
    var r0 = scoreToControl(score, timbre, tm, score.lang, research, balanceAspiration,
      !opt.rawSource && opt.modeBJapaneseFriction !== false,
      !opt.rawSource && opt.modeBJapaneseVoicedFriction !== false, nasalRelease, aspAirMix, nasalTract,
      !opt.rawSource && !NSG.LEGACY_SOUND && Number.isFinite(timbre.highVowelOpening) ? Math.min(1, timbre.highVowelOpening) : 0,
      organicAmt, humanizeAmt, sliceRange, articMorphAmt, autoExpress);
    return {
      r0: r0, timbre: timbre, research: research, refine: refine, nasalRelease: nasalRelease, studio: studio,
      balanceAspiration: balanceAspiration, highStrength: highStrength, voicedHigh: voicedHigh,
      wideband: wideband, perturbBlend: perturbBlend, smoothBlend: smoothBlend, aspAirMix: aspAirMix,
      tractJoin: tractJoin, compensateHighEq: compensateHighEq, nasalTract: nasalTract,
      organicAmt: organicAmt, humanizeAmt: humanizeAmt
    };
  }

  function planVocalSlicesForScore(score, timbre, opt, maxSlices) {
    var trk = (score && score.tracks && score.tracks[0]) || null;
    var rawNotes = (trk && Array.isArray(trk.notes)) ? trk.notes : [];
    if (!rawNotes.length) return { slices: [], sr: SR };
    maxSlices = Math.max(1, Math.min(8, maxSlices | 0 || 4));
    var sorted = rawNotes.slice().sort(function (a, b) { return a.start - b.start; });
    var tm = NSG.TEMPO.map(score), dt = HOP / SR;
    var gaps = [], maxEnd = 0;
    for (var i = 0; i < sorted.length; i++) {
      var n = sorted[i];
      var eSec = tm.secOf(n.start + n.dur);
      if (eSec > maxEnd) maxEnd = eSec;
      if (i + 1 < sorted.length) {
        var nextStart = tm.secOf(sorted[i + 1].start);
        var gapSec = nextStart - maxEnd;
        // >= 450 ms gap guarantees >= 180 ms decay tail + >= 270 ms consonant anticipation/FIR margin.
        if (gapSec >= 0.45) {
          var cutSec = maxEnd + Math.min(0.22, Math.max(0.18, gapSec * 0.4));
          gaps.push({ noteIdx: i + 1, frame: Math.round(cutSec / dt), sec: cutSec });
        }
      }
    }
    var totalSec = maxEnd + 0.35;
    var cuts = [{ noteIdx: 0, frame: 0 }];
    if (maxSlices > 1 && gaps.length && totalSec > 4) {
      var used = Object.create(null);
      for (var k = 1; k < maxSlices; k++) {
        var ideal = totalSec * k / maxSlices;
        var best = null, bestDist = Infinity;
        for (var g = 0; g < gaps.length; g++) {
          var cand = gaps[g];
          if (used[cand.noteIdx]) continue;
          var dist = Math.abs(cand.sec - ideal);
          if (dist < bestDist && dist < totalSec / (maxSlices * 1.35)) {
            bestDist = dist; best = cand;
          }
        }
        if (best) { used[best.noteIdx] = true; cuts.push(best); }
      }
      cuts.sort(function (a, b) { return a.noteIdx - b.noteIdx; });
    }
    cuts.push({ noteIdx: sorted.length, frame: 0 });
    var slices = [];
    for (var s = 0; s < cuts.length - 1; s++) {
      var a = cuts[s], b = cuts[s + 1];
      if (b.noteIdx > a.noteIdx) {
        slices.push({
          noteRange: [a.noteIdx, b.noteIdx],
          frameRange: [a.frame, s === cuts.length - 2 ? 0 : b.frame]
        });
      }
    }
    return { slices: slices, sr: SR };
  }

  function renderSingleVocal(score, timbre, opt) {
    opt = opt || {};
    var prep = buildVocalControl(score, timbre, opt);
    timbre = prep.timbre;
    var research = prep.research, refine = prep.refine;
    var highStrength = prep.highStrength, voicedHigh = prep.voicedHigh, wideband = prep.wideband;
    var perturbBlend = prep.perturbBlend, smoothBlend = prep.smoothBlend, aspAirMix = prep.aspAirMix;
    var tractJoin = prep.tractJoin, compensateHighEq = prep.compensateHighEq, nasalTract = prep.nasalTract;
    var organicAmt = prep.organicAmt, humanizeAmt = prep.humanizeAmt;
    var r0 = prep.r0;
    var sliceRange = Array.isArray(opt.sliceRange) && opt.sliceRange.length === 2 ? opt.sliceRange : null;
    if (!r0.ctrl.length) {
      if (sliceRange) return { offset: 0, pcm: new Float32Array(0), total: Math.round(SR * 0.4), sr: SR, startFrame: 0, endFrame: 0, mixGains: null };
      return { pcm: new Float32Array(Math.round(SR * 0.4)), sr: SR };
    }

    var ctrl = r0.ctrl;
    var startFrame = r0.startFrame || 0;
    var endFrame = r0.endFrame || ctrl.length;
    var sampleOffset = startFrame * HOP;
    var sliceTotal = ctrl.length * HOP;
    var studio = !!prep.studio;
    studioMode = studio;
    var useWasmVocal = !!(NSG.VOCAL_WASM && NSG.VOCAL_WASM.enabled && NSG.VOCAL_WASM.ready);
    var out = useWasmVocal ? null : new Float32Array(sliceTotal);
    var bodyStage = (!useWasmVocal && refine) ? new Float32Array(sliceTotal) : null;
    var fricStage = (!useWasmVocal && refine) ? new Float32Array(sliceTotal) : null;
    var bodyMask = (!useWasmVocal && refine) ? new Float32Array(sliceTotal) : null;
    var bodyPrev = 0, fricPrev = 0, maskPrev = 0;
    var maskAlpha = 1 - Math.exp(-1 / (SR * 0.012));
    var rawSrc = !!opt.rawSource;

    var res = useWasmVocal ? null : [];
    if (res) for (var i = 0; i < 6; i++) res.push(new Resonator(!studio));
    var nas = useWasmVocal ? null : (nasalTract ? new HiFiNasalBranch() : new NasalBranch());
    var nasScale = nasalScale(timbre), nasBwScale = Math.max(0.7, Math.min(1.5, timbre.bwScale || 1));
    var nPole = useWasmVocal ? null : new Resonator(), nZero = useWasmVocal ? null : new AntiResonator();
    var fricRes = useWasmVocal ? null : new Resonator(), fricHp = useWasmVocal ? null : new Resonator();
    var shockRes = (!useWasmVocal && studio) ? new Resonator() : null;
    var lastShockHz = 5000, lastShockBw = 1200;
    var wgRaw = opt.modeBFricWaveguide;
    var wgProfile = 'off';
    if (modeB && !opt.rawSource && wgRaw !== false && wgRaw !== 'off') {
      if (typeof wgRaw === 'number' && isFinite(wgRaw)) {
        var wgClamped = Math.max(0, Math.min(1, wgRaw));
        wgProfile = wgClamped <= 0 ? 'off' : (wgClamped >= 1 ? 'strong' : wgClamped);
      } else if (wgRaw === 'light' || wgRaw === 'strong') {
        wgProfile = wgRaw;
      } else {
        wgProfile = 'strong';
      }
    }
    var frontCavity = wgProfile !== 'off' ? new FricativeFrontCavity(wgProfile) : null;
    var cavityCache = Object.create(null), cavityGain = 1, prevCavityGain = 1, prevCavity = 0;
    var cavityEq = timbre.outEq;
    if (frontCavity && refine) cavityEq = Array.from({ length: 64 }, function (_, i) {
      var hz = 50 * Math.pow(400, i / 63);
      return NSG.outEqDbAt(timbre.outEq, hz) + refineDb(modeBSelectedD.friction, hz);
    });

    var seedSalt = startFrame ? ((startFrame * 2654435761) >>> 0) : 0;
    var src = useWasmVocal ? null : makeSource(timbre, wideband, organicAmt, humanizeAmt, seedSalt);
    var useOrganic = organicAmt > 0;
    var useHumanize = humanizeAmt > 0;
    var orgCycleRnd = (!useWasmVocal && useOrganic) ? mulberry32((0x94d049bb ^ seedSalt) >>> 0) : null;
    var orgCycleAlpha = 1 - Math.exp(-1 / (SR * 0.0015));
    var orgJitAlpha = 1 - Math.exp(-1 / (SR * (studio ? 0.0011 : 0.0015)));
    var orgShimCur = 1, orgShimTgt = 1, orgJitCur = 1, orgJitTgt = 1;
    var prevOrgAir = 1;
    var glottalNoise = (!useWasmVocal && useHumanize) ? mulberry32((0x3c6ef372 ^ seedSalt) >>> 0) : null;
    var midLp = 0, midHp = 0;
    var midLpCoef = Math.exp(-2 * Math.PI * (studio ? 4800 : 4800) / SR), midHpCoef = Math.exp(-2 * Math.PI * (studio ? 1450 : 1600) / SR);
    // Normalize 1-pole LP(4800) - LP(1600) white-noise band to ~unit RMS regardless of SR.
    var midNorm = studio ? 3.10 : (HD ? 3.2 : 2.1);
    var subNotch = (!useWasmVocal && useHumanize && !rawSrc) ? new DynamicNotch() : null;
    var subNotch2 = (!useWasmVocal && useHumanize && !rawSrc && studio) ? new DynamicNotch() : null;
    var hpcShelf = (!useWasmVocal && !rawSrc && studio) ? new DynamicShelf() : null;
    var phaseDisp = (!useWasmVocal && !rawSrc && studio) ? new AllPassDispersion(SR) : null;
    var pharynxNotch = null;
    var humPfRef = (useHumanize || studio) ? NSG.formantsOf(NSG.PHONES.a, timbre).pairs[5][0] : 5200;
    var fryParity = 0, fryGainCur = 1, fryGainTgt = 1, fryAlpha = 1 - Math.exp(-1 / (SR * 0.0012));
    var prevRd = 1.05, prevOq = 0.65, prevTa = 0.04;
    var velvetRem = 0, velvetPos = 0, velvetSign = 1, velvetLen = 5, airApZ = 0;
    var effBreath = studio ? Math.max(0.008, timbre.breath || 0) : (timbre.breath || 0);
    var air = voicedHigh && wideband && effBreath > 0 ?
      makeVoicedAir(timbre, compensateHighEq, opt.modeBAirSoftness !== false, refine, tractJoin, smoothBlend, perturbBlend) : null;
    if (air && !studio && ctrl.some(function (c) { return c.effort; })) {
      air.kernels = [effortAirKernel(air.profile, 0, air.eq), effortAirKernel(air.profile, 4, air.eq)];
    }
    var airFormRes = (!useWasmVocal && studio && air) ? new Resonator() : null;
    var airLp1 = 0, airLp2 = 0, airLpCoef = Math.exp(-2 * Math.PI * (studio ? 14200 : 13500) / SR);
    var upperAir = (!useWasmVocal && air) ? new Float32Array(sliceTotal) : null, airNoise = (!useWasmVocal && air) ? mulberry32((0x73e91a45 ^ seedSalt) >>> 0) : null;
    // Piriform fossa anti-resonance (~4.2-5.4 kHz spectral dip) for HiFi voices
    // that lack an extracted speaker outEq (which already encodes recording dips).
    var piriform = null;
    if (modeB && !opt.rawSource && opt.modeBPiriform !== false && !studio && !Array.isArray(timbre.outEq)) {
      var pfRef = NSG.formantsOf(NSG.PHONES.a, timbre).pairs[5][0];
      var pfHz = Math.max(4200, Math.min(5400, 4650 * Math.pow(pfRef / 5200, 0.35)));
      var pfA = Math.pow(10, -4.5 / 40), pfW = 2 * Math.PI * pfHz / SR;
      var pfAl = Math.sin(pfW) / (2 * 4.2), pfC = -2 * Math.cos(pfW), pfA0 = 1 + pfAl / pfA;
      piriform = {
        b0: (1 + pfAl * pfA) / pfA0, b1: pfC / pfA0, b2: (1 - pfAl * pfA) / pfA0,
        a1: pfC / pfA0, a2: (1 - pfAl / pfA) / pfA0, x1: 0, x2: 0, y1: 0, y2: 0
      };
    }
    if ((useHumanize || studio) && !rawSrc && (studio || !piriform)) {
      pharynxNotch = new DynamicNotch();
    }
    var noise = mulberry32((0x1234567 ^ seedSalt) >>> 0);
    var tnoise = mulberry32((0x2545f491 ^ seedSalt) >>> 0);   // 声道送气噪声单独取随机数，不扰动原有噪声序列
    /* 微扰：逐帧基频抖动。真实嗓音的周期不是等长的，这种 0.2%–1% 的
       随机扰动就是"沙、粗、有人味"的来源；0 时整条分支不执行，
       输出与加这个参数之前逐字节相同。 */
    var jit = timbre.jitter || 0;
    var jrnd = jit > 0 ? mulberry32((0x5bf03635 ^ seedSalt) >>> 0) : null;
    var gl = NSG.sourceFilterOf(timbre);
    var hfY = 0, radPrev = 0, radY = 0, fricRadPrev = 0, fricRadY = 0, lastF0 = -1;
    var fricRadCoef = Math.exp(-2 * Math.PI * 6800 / SR);
    var brLp1 = 0, brLp2 = 0, breathLpCoef = Math.exp(-2 * Math.PI * (studio ? 5600 : 3400) / SR), breathGate = 0, aBrGate = 1 - Math.exp(-1 / (SR * 0.003));
    var sibAirHp = 0, sibAirLp1 = 0, sibAirLp2 = 0, sibAirAmt = 0;
    var sibAirHpCoef = Math.exp(-2 * Math.PI * 6200 / SR), sibAirLpCoef = Math.exp(-2 * Math.PI * 10600 / SR);
    var fuW0 = 2 * Math.PI * 13600 / SR, fuCw = Math.cos(fuW0), fuAl = Math.sin(fuW0) / (2 * Math.SQRT1_2);
    var fuA0 = 1 + fuAl, fuB0 = (1 - fuCw) * 0.5 / fuA0, fuB1 = (1 - fuCw) / fuA0, fuB2 = fuB0;
    var fuA1 = -2 * fuCw / fuA0, fuA2 = (1 - fuAl) / fuA0;
    var fuX1 = 0, fuX2 = 0, fuY1 = 0, fuY2 = 0;
    var curARad = Math.exp(-2 * Math.PI * RAD_NOM_HZ / SR), tgtARad = curARad, radStep = 0;
    var prevBurstImp = 0, shockEnv = 0, shockAmp = 0, shockIsAffr = false, shockAlpha = Math.exp(-1 / (SR * 0.0022)), shockAlphaAffr = Math.exp(-1 / (SR * 0.0028)), shockPhase = 1, shockPhaseStep = 1 / (SR * 0.00035);
    // 男声1试听选定的 G：只柔化两条辅音噪声，不经过声带谐波或元音气声。
    // 旧工程缺省为 0；保留原运算路径，避免影响其他音色与历史工程。
    var consonantSoftness = typeof timbre.consonantSoftness === 'number' && isFinite(timbre.consonantSoftness) ?
      Math.max(0, Math.min(1, timbre.consonantSoftness)) : 0;
    var consonantLp = 0, tractLp = 0, consonantCoef = Math.exp(-2 * Math.PI * 1800 / SR);
    var tractSoft1 = 0, tractSoft2 = 0, tnSoftCoef = 0, lastTnLpHz = 0;
    var frictionCache = Object.create(null), frictionReference = 1;
    if (modeB && !rawSrc) {
      var refPairs = NSG.formantsOf(NSG.PHONES.a, timbre).pairs;
      var oldRef = chainPower(refPairs, 220, timbre.harm || NSG.defaultHarm(), timbre.tiltDb || 0, gl, null, 16000);
      frictionReference = oldRef > 1e-12 ? refPower(timbre) / oldRef : 1;
    }
    // N：额外并联鼻腔声绕过口腔共振器，单独限制其高频，避免韵尾泄出高次谐波。
    // 缺省为 0，旧音色仍走原路径；不改串联鼻极点/零点和摩擦噪声。
    var nasalLowpassHz = typeof timbre.nasalLowpassHz === 'number' && isFinite(timbre.nasalLowpassHz) ?
      (timbre.nasalLowpassHz > 0 ? Math.max(100, Math.min(7500, timbre.nasalLowpassHz)) : 0) :
      (modeB && !rawSrc ? 3000 : 0);
    var nasalLp1 = 0, nasalLp2 = 0, nasalCoef = nasalLowpassHz > 0 ? Math.exp(-2 * Math.PI * nasalLowpassHz / SR) : 0;
    var prevAmp = 0, prevAsp = 0, prevNasal = 0, prevFric = 0, prevTn = 0, prevMix = 0;
    /* 控制帧里的 VEL 在音符边界直接切换（av/ah/fric 已乘入）。前一音的声带幅度
       还在 38ms 收尾时就乘上新音的 VEL，相邻音力度差大（自动 VEL 常见 8 → 34）
       会冒出 20–30ms、数倍于本音电平的爆音。渲染时把 VEL 系数在 25ms 内平滑过渡；
       力度不变时比值恒为 1，输出与控制帧一致。 */
    var velS = ctrl.length && ctrl[0].vel > 0 ? ctrl[0].vel : 1, aVelS = 1 - Math.exp(-HOP / SR / 0.025);
    var tiltDb = timbre.tiltDb || 0;
    var fricTrim = NSG.FRIC_TRIM;
    /* 固定的一阶高频收敛（6kHz），只压 6k 以上的毛刺；谱倾斜现在完全由
       谐波幅度上的 tiltDb×log2(k) 精确控制，不再叠一层 1500Hz 低通 */
    var bcoef = Math.exp(-2 * Math.PI * 6000 / SR);
    /* 气声噪声先过一阶低通（−6dB/oct，Klatt 做法）：白噪再经唇端辐射是 +6dB/oct 的
       “蓝噪”，会在 3–5kHz 的高阶共振峰簇里变成刺耳的嘶声。拐点 1000Hz，乘 1.41
       使 1kHz 附近的气声电平与旧版相当，只削去高频的上翘（4kHz 约 −9dB）。 */
    var aspCoef = Math.exp(-2 * Math.PI * (studio ? 950 : 1000) / SR), aspLp = 0, aspLp2 = 0;
    // Breath colour is independent of consonant noise: retain a low body and add
    // a restrained 2.8–6.5 kHz air band, then keep the original tract shaping.
    var airCoef = Math.exp(-2 * Math.PI * 6500 / SR), bodyCoef = Math.exp(-2 * Math.PI * 2800 / SR);
    var aspAir = 0, aspBody = 0;
    // Six symmetric numerators add six samples of delay to the oral branch.
    // Align the parallel nasal/friction branches, then remove the common delay.
    var modeBDelay = (!useWasmVocal && modeB && !rawSrc && !studio) ? new Float64Array(18) : null, delayIndex = 0;

    if (useWasmVocal) {
      var stride = NSG.VOCAL_WASM.FRAME_STRIDE || 46;
      var frames = new Float64Array(ctrl.length * stride);
      var prevAmpW = 0, prevCavW = 0, velSW = velS, cavGainW = 1;
      for (var wfr = 0; wfr < ctrl.length; wfr++) {
        var wc = ctrl[wfr], wfb = wc.fb, wFirst = wfr === 0;
        var wRawFricHz = wc.jaFricF || wc.fricF || 5000;
        var wFricHz = wRawFricHz, wFricBw = wc.jaFricB || wc.fricB || 1200;
        var wStIsSibilant = studio && wFricHz >= 2800 && (wc.frontCavity || 0) > 0.05 && !wc.isBreath;
        if (wStIsSibilant) {
          var wIsPalSib = wFricHz >= 3700 && wFricHz < 5000;
          if (wFricHz >= 5000) wFricHz = Math.min(7800, wFricHz * 1.15);
          else if (wIsPalSib) wFricHz = Math.min(5400, wFricHz * 1.18);
          else wFricHz = Math.min(3800, wFricHz * 1.12);
          wFricBw = Math.min(3600, wFricBw * (wIsPalSib ? 1.55 : 1.32));
        } else if (studio && wc.isBreath && !wc.breathCustomFreq) {
          wFricHz = 3100;
          wFricBw = Math.max(wFricBw, 2600);
        }
        var wRawCavFc = Math.round(wRawFricHz / 25) * 25;
        if (frontCavity) {
          var wCavFc = Math.round(wFricHz / 25) * 25, wCavBw = Math.round(wFricBw / 25) * 25;
          frontCavity.set(studio ? wRawCavFc : wCavFc, wFirst);
          if (wc.frontCavity > 0 || prevCavW > 0) {
            var wCavKey = (studio ? wRawCavFc + ':' : '') + wCavFc + ':' + wCavBw;
            cavGainW = cavityCache[wCavKey];
            if (cavGainW === undefined) cavityCache[wCavKey] = cavGainW = Math.max(0.25, Math.min(studio ? 8 : 4,
              Math.sqrt(frictionPower(wCavFc, wCavBw, consonantSoftness, SR, cavityEq) /
                Math.max(1e-18, frictionPower(wCavFc, wCavBw, consonantSoftness, SR, cavityEq, frontCavity)))));
          }
          frontCavity.snap();
        }
        var wvNow = wc.vel > 0 ? wc.vel : 1;
        velSW = prevAmpW < 0.02 * velSW ? wvNow : velSW + (wvNow - velSW) * aVelS;
        var wvk = velSW / wvNow;
        var wcAv = wc.av * wvk, wcAh = wc.ah || 0, wcFric = wc.fric * wvk, wcTn = (wc.tn || 0) * wvk;
        var wfGain = 1;
        if (modeB && !rawSrc && (wcFric > 0 || (studio && wc.burstAmp > 0))) {
          var wfc = Math.round((wc.fricF || 5000) / 25) * 25, wbw = Math.round((wc.fricB || 1200) / 25) * 25;
          var wfKey = wfc + ':' + wbw;
          wfGain = frictionCache[wfKey];
          if (wfGain === undefined) {
            wfGain = Math.sqrt(frictionReference * frictionPower(wfc, wbw, consonantSoftness, 16000) /
              Math.max(1e-18, frictionPower(wfc, wbw, consonantSoftness, SR)));
            frictionCache[wfKey] = wfGain = Math.max(0.25, Math.min(studio ? 8 : 4, wfGain));
          }
          wcFric *= wfGain;
          if (wc.jaFricF) {
            var wJaFc = Math.round(wFricHz / 25) * 25, wJaBw = Math.round(wFricBw / 25) * 25;
            var wJaKey = wfKey + ':' + wJaFc + ':' + wJaBw, wJaGain = frictionCache[wJaKey];
            if (wJaGain === undefined) {
              wJaGain = Math.sqrt(frictionPower(wfc, wbw, consonantSoftness, SR, timbre.outEq) /
                Math.max(1e-18, frictionPower(wJaFc, wJaBw, consonantSoftness, SR, timbre.outEq)));
              frictionCache[wJaKey] = wJaGain = Math.max(0.25, Math.min(studio ? 8 : 4, wJaGain));
            }
            wcFric *= wJaGain;
          }
        }
        if (wStIsSibilant) {
          var wStSibMult = wRawFricHz >= 5000 ? 1.72 : wRawFricHz >= 3700 ? 1.62 : 1.65;
          wcFric *= wStSibMult / Math.max(1, wFricHz / wRawFricHz);
        } else if (studio && wc.isBreath) wcFric *= (wc.breathFricScale || 6.8);
        var wBurstGain = (studio && wc.burstAmp > 0) ? wc.burstAmp * wvk * wfGain * fricTrim : 0;
        var wf0 = wc.f0 > 0 ? wc.f0 : 100;
        if (jrnd && !studio) wf0 *= 1 + jit * (jrnd() * 2 - 1);
        var wEffTilt = pitchTiltAt(timbre, wf0);
        var wSrcTilt = wc.sourceTilt || 0;
        var wb = wfr * stride;
        frames[wb] = wfb[0][0]; frames[wb + 1] = wfb[0][1];
        frames[wb + 2] = wfb[1][0]; frames[wb + 3] = wfb[1][1];
        frames[wb + 4] = wfb[2][0]; frames[wb + 5] = wfb[2][1];
        frames[wb + 6] = wfb[3][0]; frames[wb + 7] = wfb[3][1];
        frames[wb + 8] = wfb[4][0]; frames[wb + 9] = wfb[4][1];
        frames[wb + 10] = wfb[5][0]; frames[wb + 11] = wfb[5][1];
        frames[wb + 12] = wf0;
        frames[wb + 13] = wcAv;
        frames[wb + 14] = wcAh;
        frames[wb + 15] = wcFric;
        frames[wb + 16] = wcTn;
        frames[wb + 17] = wc.tnLpHz || 0;
        frames[wb + 18] = wc.nasal || 0;
        frames[wb + 19] = wc.np || 270;
        frames[wb + 20] = wc.nzf || 1700;
        frames[wb + 21] = wc.nmix || 0;
        frames[wb + 22] = wFricHz;
        frames[wb + 23] = wFricBw;
        frames[wb + 24] = wc.frontCavity || 0;
        frames[wb + 25] = cavGainW;
        frames[wb + 26] = useHumanize && wc.rd !== undefined ? wc.rd : 1.05;
        frames[wb + 27] = useHumanize && wc.oq !== undefined ? wc.oq : 0.65;
        frames[wb + 28] = useHumanize && wc.ta !== undefined ? wc.ta : 0.04;
        frames[wb + 29] = useHumanize && wc.fry > 0 ? wc.fry : 0;
        frames[wb + 30] = useOrganic ? (wc.organicGate || 0) : 0;
        frames[wb + 31] = useOrganic && wc.organicAirMod !== undefined ? wc.organicAirMod : 1;
        frames[wb + 32] = (timbre.pitchTilt ? wEffTilt : tiltDb) + wSrcTilt;
        frames[wb + 33] = wc.voicedHighGate || 0;
        frames[wb + 34] = wEffTilt;
        frames[wb + 35] = wSrcTilt;
        frames[wb + 36] = wc.effort || 0;
        frames[wb + 37] = wRawCavFc;
        frames[wb + 38] = studio ? (wc.lip || 0) : 0;
        frames[wb + 39] = studio ? (wc.abduct || 0) : 0;
        frames[wb + 40] = studio && wc.aspirationScale !== undefined ? wc.aspirationScale : 1;
        frames[wb + 41] = studio ? (wc.burstImpulse || 0) : 0;
        frames[wb + 42] = wBurstGain;
        frames[wb + 43] = (studio && wc.isAffricateBurst) ? 1 : 0;
        frames[wb + 44] = wRawFricHz;
        frames[wb + 45] = (studio && wc.isBreath) ? 1 : 0;
        prevAmpW = wcAv;
        prevCavW = wc.frontCavity || 0;
      }
      var glObj = gl ? ('gl' in gl ? gl.gl : gl) : null;
      var srcEqArr = gl && 'eq' in gl ? gl.eq : null;
      var outEqArr = Array.isArray(timbre.outEq) ? timbre.outEq : null;
      var harmArr = timbre.harm || NSG.defaultHarm();
      var tailDbW = gl && gl.tailDb !== undefined ? gl.tailDb : TAIL_DB_OCT;
      var flags = (HD ? 1 : 0) | (modeB ? 2 : 0) | (rawSrc ? 4 : 0) | (research ? 8 : 0) |
        (refine ? 16 : 0) | (voicedHigh ? 32 : 0) | (wideband ? 64 : 0) | (tractJoin ? 128 : 0) |
        (compensateHighEq ? 256 : 0) | (nasalTract ? 512 : 0) | (useOrganic ? 1024 : 0) |
        (useHumanize ? 2048 : 0) | (frontCavity ? 4096 : 0) | (air ? 8192 : 0) |
        (piriform ? 16384 : 0) | (NSG.LEGACY_SOUND ? 32768 : 0) | (glObj ? 65536 : 0) |
        (srcEqArr ? 131072 : 0) | (outEqArr ? 262144 : 0) | (studio ? 524288 : 0);
      var lfTabW = useHumanize ? getLfTable() : null;
      var cfg = new Float64Array(73);
      if (air && air.kernels) { cfg.set(air.kernels[0], 45); cfg.set(air.kernels[1], 58); }
      cfg.set(air ? air.profile : NSG.defaultEffortProfile, 37);
      cfg[0] = SR; cfg[1] = HOP; cfg[2] = flags >>> 0; cfg[3] = seedSalt >>> 0;
      cfg[4] = nasScale; cfg[5] = nasBwScale; cfg[6] = nasalLowpassHz;
      cfg[7] = consonantSoftness; cfg[8] = highStrength; cfg[9] = smoothBlend; cfg[10] = perturbBlend;
      cfg[11] = aspAirMix; cfg[12] = organicAmt; cfg[13] = humanizeAmt; cfg[14] = humPfRef;
      cfg[15] = air ? air.power : 0; cfg[16] = air ? air.fraction : 0; cfg[17] = air ? air.trimGain : 1;
      cfg[18] = fricTrim; cfg[19] = tailDbW; cfg[20] = frontCavity ? frontCavity.amount : 0;
      cfg[21] = glObj ? glObj.f : 0; cfg[22] = glObj ? glObj.bw : 0; cfg[23] = glObj ? glObj.db : 0;
      cfg[24] = piriform ? piriform.b0 : 0; cfg[25] = piriform ? piriform.b1 : 0;
      cfg[26] = piriform ? piriform.b2 : 0; cfg[27] = piriform ? piriform.a1 : 0; cfg[28] = piriform ? piriform.a2 : 0;
      cfg[29] = lfTabW ? lfTabW.nrd : 0; cfg[30] = lfTabW ? lfTabW.nh : 0;
      cfg[31] = lfTabW ? lfTabW.rdMin : 0; cfg[32] = lfTabW ? lfTabW.rdStep : 0;
      cfg[33] = outEqArr ? outEqArr.length : 0; cfg[34] = air && air.eq ? air.eq.length : 0;
      cfg[35] = harmArr.length; cfg[36] = sliceTotal;
      cfg[71] = effBreath; cfg[72] = jit;
      var wasmOut = NSG.VOCAL_WASM.render(cfg, harmArr, srcEqArr, outEqArr, air ? air.eq : null, lfTabW, frames, ctrl.length);
      if (wasmOut) {
        if (sliceRange) {
          return {
            offset: sampleOffset, pcm: wasmOut, total: Math.max(r0.total, sampleOffset + sliceTotal),
            sr: SR, startFrame: startFrame, endFrame: endFrame, mixGains: extractMixGains(ctrl)
          };
        }
        return finalizeVocalOut(wasmOut, extractMixGains(ctrl), studio && !rawSrc);
      }
      // Fallback to JS path if WASM render returned null
      out = new Float32Array(sliceTotal);
      if (refine) { bodyStage = new Float32Array(sliceTotal); fricStage = new Float32Array(sliceTotal); bodyMask = new Float32Array(sliceTotal); }
      res = []; for (var ri = 0; ri < 6; ri++) res.push(new Resonator(!studio));
      nas = nasalTract ? new HiFiNasalBranch() : new NasalBranch();
      nPole = new Resonator(); nZero = new AntiResonator();
      fricRes = new Resonator(); fricHp = new Resonator();
      shockRes = studio ? new Resonator() : null;
      src = makeSource(timbre, wideband, organicAmt, humanizeAmt, seedSalt);
      if (useOrganic) orgCycleRnd = mulberry32((0x94d049bb ^ seedSalt) >>> 0);
      if (useHumanize) glottalNoise = mulberry32((0x3c6ef372 ^ seedSalt) >>> 0);
      if (useHumanize && !rawSrc) subNotch = new DynamicNotch();
      if (useHumanize && !rawSrc && studio) subNotch2 = new DynamicNotch();
      if (!rawSrc && studio) { hpcShelf = new DynamicShelf(); phaseDisp = new AllPassDispersion(SR); }
      if (air) { upperAir = new Float32Array(sliceTotal); airNoise = mulberry32((0x73e91a45 ^ seedSalt) >>> 0); }
      if (air && studio) airFormRes = new Resonator();
      if (modeB && !rawSrc && !studio) modeBDelay = new Float64Array(18);
      if (jit > 0) jrnd = mulberry32((0x5bf03635 ^ seedSalt) >>> 0);
    }

    for (var fr = 0; fr < ctrl.length; fr++) {
      var c = ctrl[fr];
      var fb = c.fb;
      var first = fr === 0;
      if (useHumanize) {
        res[0].setDamped(fb[0][0], fb[0][1], humanizeAmt, first, studio ? 0.035 : 0, 1);
        if (studio) {
          res[1].setDamped(fb[1][0], fb[1][1], humanizeAmt, first, 0, 0.45);
          for (var r = 2; r < 6; r++) res[r].set(fb[r][0], fb[r][1], first);
        } else {
          for (var rb = 1; rb < 6; rb++) res[rb].set(fb[rb][0], fb[rb][1], first);
        }
      } else {
        for (var r0i = 0; r0i < 6; r0i++) res[r0i].set(fb[r0i][0], fb[r0i][1], first);
      }
      var cRd = useHumanize && c.rd !== undefined ? c.rd : 1.05;
      var cOq = useHumanize && c.oq !== undefined ? c.oq : 0.65;
      var cTa = useHumanize && c.ta !== undefined ? c.ta : 0.04;
      var cFry = useHumanize && c.fry > 0 ? c.fry : 0;
      if (first && useHumanize) { prevRd = cRd; prevOq = cOq; prevTa = cTa; }
      if (studio) {
        var subOpenSt = Math.max(0, Math.min(1, (cRd - 0.65) / 1.5));
        if (subNotch) {
          var sub1Hz = Math.max(460, Math.min(820, 600 * nasScale));
          subNotch.set(sub1Hz, 4.2, -(1.3 + 2.2 * subOpenSt) * humanizeAmt, first);
        }
        if (subNotch2) {
          var sub2Hz = Math.max(1080, Math.min(1620, 1280 * Math.pow(nasScale, 0.78)));
          subNotch2.set(sub2Hz, 5.2, -(0.9 + 1.4 * subOpenSt) * humanizeAmt, first);
        }
        if (pharynxNotch) {
          var pxStHz = Math.max(4200, Math.min(5250, 4750 * Math.pow(humPfRef / 5200, 0.42) + 0.08 * (fb[0][0] - 500) - 0.05 * (fb[1][0] - 1500)));
          pharynxNotch.set(pxStHz, 5.0, -2.6 * (0.45 + 0.55 * humanizeAmt), first);
        }
        if (hpcShelf) hpcShelf.set(fb[5][0], first);
        if (airFormRes) {
          var fcAir = Math.max(5200, Math.min(7600, 4800 + 1.15 * fb[1][0] - 1400 * (c.lip || 0)));
          airFormRes.set(fcAir, 6400, first);
        }
        var fRadSt = Math.max(3600, Math.min(6600, 4800 + 2.0 * (fb[0][0] - 450) - 2000 * (c.lip || 0)));
        tgtARad = Math.exp(-2 * Math.PI * fRadSt / SR);
        if (first) curARad = tgtARad;
        radStep = (tgtARad - curARad) / HOP;
      } else {
        if (subNotch) {
          var subHz = Math.max(900, Math.min(2200, 1340 * nasScale));
          var subOpen = Math.max(0, Math.min(1, (cRd - 0.65) / 1.5));
          subNotch.set(subHz, 5.5, -(1.6 + 1.9 * subOpen) * humanizeAmt, first);
        }
        if (pharynxNotch) {
          var pxHz = Math.max(4100, Math.min(5400, 4680 * Math.pow(humPfRef / 5200, 0.35) + 0.08 * (fb[0][0] - 500)));
          pharynxNotch.set(pxHz, 4.5, -2.2 * humanizeAmt, first);
        }
      }
      var cAbd = studio ? (c.abduct || 0) : 0;
      var cAspSc = studio && c.aspirationScale !== undefined ? c.aspirationScale : 1;
      var cRdOpenSt = studio ? Math.max(0, (cRd - 0.72) / 1.35) : 0;
      var cStAspGate = studio ? 0.28 * (0.45 + 2.0 * cRdOpenSt * cRdOpenSt) * (1 + 2.2 * cAbd) : 1;
      var f0ForTurb = c.f0 > 0 ? c.f0 : 200;
      var lowTurbScale = Math.max(0.85, Math.min(1.28, 250 / Math.max(120, f0ForTurb)));
      var cStTurbGain = studio ? (effBreath * 0.032 + 0.0068 * Math.pow(cRdOpenSt, 1.45)) * lowTurbScale * (1 + 2.2 * cAbd) * (0.35 + 0.65 * cAspSc) : 0;
      var tgtBrGate = (studio && c.isBreath) ? 1 : 0;

      if (nasalTract) nas.set(nasScale, nasBwScale, fb[0][0], first);
      else nas.set(270 + 0.04 * (fb[0][0] - 500), 90, 270 + 0.04 * (fb[0][0] - 500), 110, first);
      var npHz = c.np || 270;
      nPole.set(npHz, 100, first);
      nZero.set(c.nzf || 1700, nasalZeroBw(npHz, c.nzf || 1700), first);
      var nMix = c.nmix || 0;   // 逐样本插值：混合比在帧边界跳变会出单样本咔声
      var rawFricHz = c.jaFricF || c.fricF || 5000;
      var frictionHz = rawFricHz, frictionBw = c.jaFricB || c.fricB || 1200;
      var stIsSibilant = studio && frictionHz >= 2800 && (c.frontCavity || 0) > 0.05 && !c.isBreath;
      if (stIsSibilant) {
        var isPalSib = frictionHz >= 3700 && frictionHz < 5000;
        if (frictionHz >= 5000) frictionHz = Math.min(7800, frictionHz * 1.15);
        else if (isPalSib) frictionHz = Math.min(5400, frictionHz * 1.18);
        else frictionHz = Math.min(3800, frictionHz * 1.12);
        frictionBw = Math.min(3600, frictionBw * (isPalSib ? 1.55 : 1.32));
      } else if (studio && c.isBreath && !c.breathCustomFreq) {
        frictionHz = 3100;
        frictionBw = Math.max(frictionBw, 2600);
      }
      sibAirAmt = stIsSibilant ? (rawFricHz >= 5000 ? 0.22 : rawFricHz >= 3700 ? 0.30 : 0.16) : 0;
      fricRes.set(frictionHz, frictionBw, first);
      fricHp.set(Math.min(frictionHz * 0.55, 7000), 2400, first);
      if (shockRes) {
        if (studio && c.isAffricateBurst) {
          lastShockHz = rawFricHz >= 5000 ? 2700 : rawFricHz >= 3700 ? 3600 : 2300;
          lastShockBw = 1600;
        } else if (!(shockEnv > 0.01)) {
          lastShockHz = frictionHz;
          lastShockBw = Math.max(900, frictionBw * 0.8);
        }
        var snapShock = first || ((c.burstImpulse || 0) > 0.7 && prevBurstImp <= 0.15 && shockEnv <= 0.01);
        shockRes.set(lastShockHz, lastShockBw, snapShock);
      }
      if (frontCavity) {
        var rawCavFc = Math.round(rawFricHz / 25) * 25;
        var cavityFc = Math.round(frictionHz / 25) * 25, cavityBw = Math.round(frictionBw / 25) * 25;
        frontCavity.set(studio ? rawCavFc : cavityFc, first);
        if (c.frontCavity > 0 || prevCavity > 0) {
          var cavityKey = (studio ? rawCavFc + ':' : '') + cavityFc + ':' + cavityBw;
          cavityGain = cavityCache[cavityKey];
          if (cavityGain === undefined) cavityCache[cavityKey] = cavityGain = Math.max(0.25, Math.min(studio ? 8 : 4,
            Math.sqrt(frictionPower(cavityFc, cavityBw, consonantSoftness, SR, cavityEq) /
              Math.max(1e-18, frictionPower(cavityFc, cavityBw, consonantSoftness, SR, cavityEq, frontCavity)))));
        }
        if (first) prevCavityGain = cavityGain;
      }
      var vNow = c.vel > 0 ? c.vel : 1;
      // 只在声音连续时平滑；前面声带已静（休止、闭塞、清辅音，气声仍可能在走）就直接取新值，
      // 否则从响亮音换到轻音后，新起音会带着前音的力度冒出一下。
      var quiet = prevAmp < 0.02 * velS;
      velS = quiet ? vNow : velS + (vNow - velS) * aVelS;
      var vk = velS / vNow, cAv = c.av * vk, cAh = c.ah || 0, cFric = c.fric * vk, cTn = (c.tn || 0) * vk;
      var cTnLpHz = c.tnLpHz || 0;
      if (cTnLpHz > 0 && cTnLpHz !== lastTnLpHz) {
        tnSoftCoef = Math.exp(-2 * Math.PI * cTnLpHz / SR);
        lastTnLpHz = cTnLpHz;
      }
      var frictionGain = 1;
      if (modeB && !rawSrc && (cFric > 0 || (studio && c.burstAmp > 0))) {
        var fc = Math.round((c.fricF || 5000) / 25) * 25, bw = Math.round((c.fricB || 1200) / 25) * 25;
        var frictionKey = fc + ':' + bw;
        frictionGain = frictionCache[frictionKey];
        if (frictionGain === undefined) {
          frictionGain = Math.sqrt(frictionReference * frictionPower(fc, bw, consonantSoftness, 16000) /
            Math.max(1e-18, frictionPower(fc, bw, consonantSoftness, SR)));
          frictionCache[frictionKey] = frictionGain = Math.max(0.25, Math.min(studio ? 8 : 4, frictionGain));
        }
        cFric *= frictionGain;
        if (c.jaFricF) {
          var jaFc = Math.round(frictionHz / 25) * 25, jaBw = Math.round(frictionBw / 25) * 25;
          var jaKey = frictionKey + ':' + jaFc + ':' + jaBw, jaGain = frictionCache[jaKey];
          if (jaGain === undefined) {
            // Redistribute the existing friction power, including the singer's
            // output EQ and chosen consonant softening; no extra noise layer.
            jaGain = Math.sqrt(frictionPower(fc, bw, consonantSoftness, SR, timbre.outEq) /
              Math.max(1e-18, frictionPower(jaFc, jaBw, consonantSoftness, SR, timbre.outEq)));
            frictionCache[jaKey] = jaGain = Math.max(0.25, Math.min(studio ? 8 : 4, jaGain));
          }
          cFric *= jaGain;
        }
      }
      if (stIsSibilant) {
        var stSibMult = rawFricHz >= 5000 ? 1.72 : rawFricHz >= 3700 ? 1.62 : 1.65;
        cFric *= stSibMult / Math.max(1, frictionHz / rawFricHz);
      } else if (studio && c.isBreath) cFric *= (c.breathFricScale || 6.8);
      if (studio) {
        var cBurstGain = c.burstAmp > 0 ? c.burstAmp * vk * frictionGain * fricTrim : 0;
        var cBurst = c.burstImpulse || 0;
        if (cBurst > 0.7 && prevBurstImp <= 0.15) {
          shockEnv = 1.0;
          shockPhase = 0;
          shockIsAffr = !!c.isAffricateBurst;
          shockAmp = shockIsAffr ? Math.min(0.085, cBurstGain * 0.65) : Math.min(0.060, cBurstGain * 0.70);
        }
        prevBurstImp = cBurst;
      }

      var f0 = c.f0 > 0 ? c.f0 : 100;
      if (jrnd && !studio) f0 *= 1 + jit * (jrnd() * 2 - 1);
      if (lastF0 < 0) lastF0 = f0;
      var orgFrameGate = useOrganic ? (c.organicGate || 0) : 0;
      var cOrgAir = useOrganic && c.organicAirMod !== undefined ? c.organicAirMod : 1;
      setHarmonics(src, f0, (timbre.pitchTilt ? pitchTiltAt(timbre, f0) : tiltDb) + (c.sourceTilt || 0), gl, smoothBlend > 0 ? c.fb[5][0] : 0, smoothBlend, organicAmt, orgFrameGate, humanizeAmt, cRd, first);
      if (voicedHigh) setVoicedHigh(src, f0, c, timbre, gl, highStrength, compensateHighEq, wideband, air, refine, tractJoin, smoothBlend, perturbBlend);

      var phaseCycles = 0;
      var phaseArr = src.phase, ampArr = src.amp, targetArr = src.target, stepArr = src.step;
      var phaseOffArr = src.phaseOff, phaseOffTargetArr = src.phaseOffTarget, phaseOffStepArr = src.phaseOffStep;
      var highAmpArr = src.highAmp, highTargetArr = src.highTarget, highStepArr = src.highStep;
      var flowEffort = air ? c.effort || 0 : 0;
      var pulseDepth = flowEffort ? air.profile[flowEffort < 0 ? 3 : 7] : 0;
      // RMS of (1-d) + d*((1+sin(phase))/2)^2, with uniform phase.
      var pulseNorm = flowEffort ? 1 / Math.sqrt(1 - 1.25 * pulseDepth + 67 / 128 * pulseDepth * pulseDepth) : 1;
      var K = src.K, bandLimit = SOURCE_TOP - SOURCE_FADE;
      var activeLimit = NSG.LEGACY_SOUND ? K : Math.min(K, Math.max(1, src.lowActiveK, voicedHigh ? src.highActiveK : 0));
      var skipHarmonics = prevAmp === 0 && cAv === 0;
      var highStart = voicedHigh ? Math.min(activeLimit, src.highStart) : activeLimit;
      var masterPh = src.masterPhase;
      for (var n = 0; n < HOP; n++) {
        var idx = fr * HOP + n;
        if (idx >= sliceTotal) break;
        var lastSample = n === HOP - 1;
        var mix = (n + 1) / HOP;
        var sampleF0 = lastF0 + (f0 - lastF0) * mix;
        if (useOrganic) {
          if (skipHarmonics) { orgShimTgt = 1; orgJitTgt = 1; }
          orgShimCur += (orgShimTgt - orgShimCur) * orgCycleAlpha;
          orgJitCur += (orgJitTgt - orgJitCur) * orgJitAlpha;
          sampleF0 *= orgJitCur;
        }
        var inc = sampleF0 / SR;
        var gciWrap = false;
        if (useHumanize) {
          if (masterPh + inc >= 1) gciWrap = true;
          masterPh += inc;
          if (masterPh >= 1) masterPh -= masterPh < 2 ? 1 : Math.floor(masterPh);
        } else if (useOrganic && !skipHarmonics && phaseArr[0] + inc >= 1) {
          gciWrap = true;
        }
        if (gciWrap && !skipHarmonics) {
          if (useOrganic) {
            var ogEff = organicAmt * orgFrameGate;
            if (studio) {
              var gciJitDepth = 0.0018 * ogEff + (jit > 0 ? jit * 1.0 : 0);
              if (ogEff > 1e-5 || gciJitDepth > 1e-6) {
                var gShimSt = (orgCycleRnd() + orgCycleRnd() + orgCycleRnd() - 1.5) * 2;
                var gJitSt = (orgCycleRnd() + orgCycleRnd() + orgCycleRnd() - 1.5) * 2;
                orgShimTgt = Math.max(0.92, Math.min(1.08, 1 + 0.020 * ogEff * gShimSt));
                orgJitTgt = Math.max(0.985, Math.min(1.015, 1 + gciJitDepth * gJitSt));
              } else {
                orgShimTgt = 1; orgJitTgt = 1;
              }
            } else if (ogEff > 1e-5) {
              var gShim = (orgCycleRnd() + orgCycleRnd() + orgCycleRnd() - 1.5) * 2;
              var gJit = (orgCycleRnd() + orgCycleRnd() + orgCycleRnd() - 1.5) * 2;
              orgShimTgt = Math.max(0.91, Math.min(1.09, 1 + 0.022 * ogEff * gShim));
              orgJitTgt = Math.max(0.99, Math.min(1.01, 1 + 0.0022 * ogEff * gJit));
            } else {
              orgShimTgt = 1; orgJitTgt = 1;
            }
          }
          if (useHumanize) {
            fryParity ^= 1;
            if (cFry > 0.01) {
              fryGainTgt = 1 + (fryParity ? 0.16 : -0.16) * cFry * humanizeAmt;
            } else {
              fryGainTgt = 1;
            }
          }
        }
        if (useHumanize) {
          if (skipHarmonics || cFry <= 0.01) fryGainTgt = 1;
          fryGainCur += (fryGainTgt - fryGainCur) * fryAlpha;
        }
        phaseCycles += inc;
        var amp = prevAmp + (cAv - prevAmp) * mix;
        var asp = prevAsp + (cAh - prevAsp) * mix;
        var nasalAmt = prevNasal + (c.nasal - prevNasal) * mix;
        var fg = prevFric + (cFric - prevFric) * mix;
        var s = 0, highSource = 0;
        if (!skipHarmonics) {
          var kFull = Math.min(activeLimit, Math.max(0, Math.floor(bandLimit / sampleF0) - 1));
          if (useHumanize) {
            var mPh2048 = masterPh * 2048;
            if (voicedHigh) {
              var kLowH = kFull < highStart ? kFull : highStart;
              for (var k1 = 0; k1 < kLowH; k1++) {
                var stP1 = phaseOffStepArr[k1];
                var po1 = stP1 ? (phaseOffArr[k1] += stP1) : phaseOffArr[k1];
                var a1 = ampArr[k1] + stepArr[k1];
                ampArr[k1] = a1;
                if (a1) {
                  var sx1 = (k1 + 1) * mPh2048 + po1 * 2048;
                  var i1 = sx1 | 0, fr1 = sx1 - i1; i1 &= 2047;
                  var s01 = SIN[i1];
                  s += a1 * (s01 + (SIN[i1 + 1] - s01) * fr1);
                }
              }
              for (var kh1 = kLowH; kh1 < kFull; kh1++) {
                var stP2 = phaseOffStepArr[kh1];
                var po2 = stP2 ? (phaseOffArr[kh1] += stP2) : phaseOffArr[kh1];
                var ah1 = ampArr[kh1] + stepArr[kh1];
                ampArr[kh1] = ah1;
                var hah1 = highAmpArr[kh1] + highStepArr[kh1];
                highAmpArr[kh1] = hah1;
                if (ah1 || hah1) {
                  var sx2 = (kh1 + 1) * mPh2048 + po2 * 2048;
                  var i2 = sx2 | 0, fr2 = sx2 - i2; i2 &= 2047;
                  var s02 = SIN[i2], sine2 = s02 + (SIN[i2 + 1] - s02) * fr2;
                  if (ah1) s += ah1 * sine2;
                  highSource += hah1 * sine2;
                }
              }
              for (var kh2 = kFull; kh2 < activeLimit; kh2++) {
                var stP3 = phaseOffStepArr[kh2];
                var po3 = stP3 ? (phaseOffArr[kh2] += stP3) : phaseOffArr[kh2];
                var ah2 = ampArr[kh2] + stepArr[kh2];
                ampArr[kh2] = ah2;
                var hah2 = highAmpArr[kh2] + highStepArr[kh2];
                highAmpArr[kh2] = hah2;
                var band2 = (SOURCE_TOP - sampleF0 * (kh2 + 1)) / SOURCE_FADE;
                if (band2 > 0 && (ah2 || hah2)) {
                  if (band2 > 1) band2 = 1;
                  var sx3 = (kh2 + 1) * mPh2048 + po3 * 2048;
                  var i3 = sx3 | 0, fr3 = sx3 - i3; i3 &= 2047;
                  var s03 = SIN[i3], sine3 = s03 + (SIN[i3 + 1] - s03) * fr3;
                  if (ah2) s += ah2 * band2 * sine3;
                  highSource += hah2 * band2 * sine3;
                }
              }
            } else {
              for (var ks1 = 0; ks1 < kFull; ks1++) {
                var stPs1 = phaseOffStepArr[ks1];
                var pos1 = stPs1 ? (phaseOffArr[ks1] += stPs1) : phaseOffArr[ks1];
                var as1 = ampArr[ks1] + stepArr[ks1];
                ampArr[ks1] = as1;
                if (as1) {
                  var sxs1 = (ks1 + 1) * mPh2048 + pos1 * 2048;
                  var is1 = sxs1 | 0, frs1 = sxs1 - is1; is1 &= 2047;
                  var ss1 = SIN[is1];
                  s += as1 * (ss1 + (SIN[is1 + 1] - ss1) * frs1);
                }
              }
              for (var kf1 = kFull; kf1 < activeLimit; kf1++) {
                var stPf1 = phaseOffStepArr[kf1];
                var pof1 = stPf1 ? (phaseOffArr[kf1] += stPf1) : phaseOffArr[kf1];
                var af1 = ampArr[kf1] + stepArr[kf1];
                ampArr[kf1] = af1;
                if (af1) {
                  var bandf1 = (SOURCE_TOP - sampleF0 * (kf1 + 1)) / SOURCE_FADE;
                  if (bandf1 > 0) {
                    var sxf1 = (kf1 + 1) * mPh2048 + pof1 * 2048;
                    var if1 = sxf1 | 0, frf1 = sxf1 - if1; if1 &= 2047;
                    var sf1 = SIN[if1];
                    s += af1 * (bandf1 > 1 ? 1 : bandf1) * (sf1 + (SIN[if1 + 1] - sf1) * frf1);
                  }
                }
              }
            }
          } else if (voicedHigh) {
            var kLow = kFull < highStart ? kFull : highStart;
            for (var k = 0; k < kLow; k++) {
              var p = phaseArr[k] + inc * (k + 1);
              if (p >= 1) p -= p < 2 ? 1 : Math.floor(p);
              phaseArr[k] = p;
              var a = ampArr[k] + stepArr[k];
              ampArr[k] = a;
              if (a) {
                var sx = p * 2048, i0 = sx | 0, s0 = SIN[i0];
                s += a * (s0 + (SIN[i0 + 1] - s0) * (sx - i0));
              }
            }
            for (var kh0 = kLow; kh0 < kFull; kh0++) {
              var ph0 = phaseArr[kh0] + inc * (kh0 + 1);
              if (ph0 >= 1) ph0 -= ph0 < 2 ? 1 : Math.floor(ph0);
              phaseArr[kh0] = ph0;
              var ah0 = ampArr[kh0] + stepArr[kh0];
              ampArr[kh0] = ah0;
              var hah0 = highAmpArr[kh0] + highStepArr[kh0];
              highAmpArr[kh0] = hah0;
              if (ah0 || hah0) {
                var sxh0 = ph0 * 2048, ih0 = sxh0 | 0, sh0 = SIN[ih0];
                var sine0 = sh0 + (SIN[ih0 + 1] - sh0) * (sxh0 - ih0);
                if (ah0) s += ah0 * sine0;
                highSource += hah0 * sine0;
              }
            }
            for (var kh = kFull; kh < activeLimit; kh++) {
              var ph = phaseArr[kh] + inc * (kh + 1);
              if (ph >= 1) ph -= ph < 2 ? 1 : Math.floor(ph);
              phaseArr[kh] = ph;
              var ah = ampArr[kh] + stepArr[kh];
              ampArr[kh] = ah;
              var hah = highAmpArr[kh] + highStepArr[kh];
              highAmpArr[kh] = hah;
              var band = (SOURCE_TOP - sampleF0 * (kh + 1)) / SOURCE_FADE;
              if (band > 0 && (ah || hah)) {
                if (band > 1) band = 1;
                var sxh = ph * 2048, ih = sxh | 0, sh = SIN[ih];
                var sineh = sh + (SIN[ih + 1] - sh) * (sxh - ih);
                if (ah) s += ah * band * sineh;
                highSource += hah * band * sineh;
              }
            }
          } else {
            for (var ks = 0; ks < kFull; ks++) {
              var ps = phaseArr[ks] + inc * (ks + 1);
              if (ps >= 1) ps -= ps < 2 ? 1 : Math.floor(ps);
              phaseArr[ks] = ps;
              var as = ampArr[ks] + stepArr[ks];
              ampArr[ks] = as;
              if (as) {
                var sxs = ps * 2048, is0 = sxs | 0, ss0 = SIN[is0];
                s += as * (ss0 + (SIN[is0 + 1] - ss0) * (sxs - is0));
              }
            }
            for (var kf = kFull; kf < activeLimit; kf++) {
              var pf = phaseArr[kf] + inc * (kf + 1);
              if (pf >= 1) pf -= pf < 2 ? 1 : Math.floor(pf);
              phaseArr[kf] = pf;
              var af = ampArr[kf] + stepArr[kf];
              ampArr[kf] = af;
              if (af) {
                var bandf = (SOURCE_TOP - sampleF0 * (kf + 1)) / SOURCE_FADE;
                if (bandf > 0) {
                  var sxf = pf * 2048, if0 = sxf | 0, sf0 = SIN[if0];
                  s += af * (bandf > 1 ? 1 : bandf) * (sf0 + (SIN[if0 + 1] - sf0) * (sxf - if0));
                }
              }
            }
          }
          if (lastSample) {
            for (var kz = 0; kz < activeLimit; kz++) {
              ampArr[kz] = targetArr[kz];
              if (voicedHigh) highAmpArr[kz] = highTargetArr[kz];
              if (useHumanize) {
                var ptz = phaseOffTargetArr[kz];
                phaseOffArr[kz] = ptz - Math.floor(ptz);
              }
            }
          }
        }
        if (useOrganic) { s *= orgShimCur; highSource *= orgShimCur; }
        if (useHumanize) { s *= fryGainCur; highSource *= fryGainCur; }
        s *= 0.30;
        var openGate = 0, rdCur = 1.05;
        if (useHumanize) {
          rdCur = prevRd + (cRd - prevRd) * mix;
          var oqCur = prevOq + (cOq - prevOq) * mix;
          var taCur = prevTa + (cTa - prevTa) * mix;
          if (!skipHarmonics) {
            var openStart = 1 - oqCur;
            if (masterPh >= openStart) {
              var uO = (masterPh - openStart) / Math.max(0.15, oqCur);
              // Fast smooth asymmetric open-phase pulse (peaks slightly right of center, 0 at edges)
              var uS = uO * (1.28 - 0.28 * uO);
              if (uS > 1) uS = 1;
              var uIdx = (uS * 1024) | 0;
              openGate = SIN[uIdx];
            } else {
              var uRet = 3 * masterPh / Math.max(0.015, taCur);
              openGate = 0.35 / (1 + uRet * (1 + 0.5 * uRet));
            }
          }
        }
        var aspWhite = noise() * 2 - 1;
        aspLp = (1 - aspCoef) * aspWhite + aspCoef * aspLp;
        var aspColour = aspLp;
        if (studio) {
          aspLp2 = (1 - aspCoef) * aspLp + aspCoef * aspLp2;
          aspColour = aspLp2;
        }
        if (research && !studio) {
          aspAir = (1 - airCoef) * aspWhite + airCoef * aspAir;
          aspBody = (1 - bodyCoef) * aspWhite + bodyCoef * aspBody;
          aspColour += aspAirMix * (aspAir - aspBody);
        }
        /* 气流随声门开合起伏：噪声按基音周期调制，与浊音融成一体，
           而不是一层独立的底噪。深度随声带幅度走，纯气流（无声带音）不调制。
           除以 √(1+d²/2) 保持噪声平均功率不变。 */
        var modSin = 0;
        if (!skipHarmonics) {
          var p0 = useHumanize ? masterPh : phaseArr[0], sx0 = p0 * 2048, i0p = sx0 | 0, s0p = SIN[i0p];
          modSin = s0p + (SIN[i0p + 1] - s0p) * (sx0 - i0p);
        }
        var aspDepth = 0.8 * Math.min(1, amp);
        var aspMod = aspDepth > 0 ? (1 + aspDepth * modSin) / Math.sqrt(1 + aspDepth * aspDepth * 0.5) : 1;
        if (studio) {
          if (useHumanize && !skipHarmonics) {
            var flowSq = (0.42 + 0.92 * openGate) * 0.95;
            aspMod += (flowSq - aspMod) * humanizeAmt * Math.min(1, amp);
            var gWhiteSt = glottalNoise() * 2 - 1;
            midLp = (1 - midLpCoef) * gWhiteSt + midLpCoef * midLp;
            midHp = (1 - midHpCoef) * midLp + midHpCoef * midHp;
            var midBandSt = (midLp - midHp) * midNorm;
            s += midBandSt * cStTurbGain * (0.35 + 0.65 * Math.min(1, amp)) * flowSq;
          }
          s += aspColour * 1.41 * asp * 0.55 * cStAspGate * aspMod;
        } else {
          if (useHumanize && !skipHarmonics) {
            var lfAspMod = (0.35 + 1.25 * openGate) * 0.92;
            aspMod += (lfAspMod - aspMod) * humanizeAmt * Math.min(1, amp);
          }
          s += aspColour * 1.41 * asp * 0.6 * aspMod;
          if (useHumanize && !skipHarmonics) {
            // Mid-high glottal turbulence (1.6-4.8 kHz) pulsed with LF open phase
            // and sculpted by the vocal tract formants (F2-F4).
            var gWhite = glottalNoise() * 2 - 1;
            midLp = (1 - midLpCoef) * gWhite + midLpCoef * midLp;
            midHp = (1 - midHpCoef) * midLp + midHpCoef * midHp;
            var midBand = (midLp - midHp) * midNorm;
            var flowMod = (0.28 + 1.38 * openGate) * 0.92;
            var turbLevel = humanizeAmt * (0.015 + 0.052 * Math.max(0, rdCur - 0.85)) * (0.35 + 0.65 * Math.min(1, amp));
            s += midBand * turbLevel * flowMod;
          }
        }
        hfY = (1 - bcoef) * s + bcoef * hfY;
        s = hfY;

        var y = s * amp;
        var nasalInput = y;
        if (modeBDelay) { nasalInput = modeBDelay[delayIndex]; modeBDelay[delayIndex] = y; }
        var tnAmt = prevTn + (cTn - prevTn) * mix;
        if (cTnLpHz > 0) {
          if (tnAmt > 0 || prevTn > 0) {
            var tractWhiteSoft = tnoise() * 2 - 1;
            if (consonantSoftness > 0) {
              tractLp = (1 - consonantCoef) * tractWhiteSoft + consonantCoef * tractLp;
              tractWhiteSoft = (1 - consonantSoftness) * tractWhiteSoft + consonantSoftness * tractLp;
            }
            tractSoft1 = (1 - tnSoftCoef) * tractWhiteSoft + tnSoftCoef * tractSoft1;
            tractSoft2 = (1 - tnSoftCoef) * tractSoft1 + tnSoftCoef * tractSoft2;
            y += tractSoft2 * tnAmt;
          } else {
            if (consonantSoftness > 0) tractLp *= consonantCoef;
            tractSoft1 *= tnSoftCoef;
            tractSoft2 *= tnSoftCoef;
          }
        } else {
          if (tractSoft1 || tractSoft2) { tractSoft1 = 0; tractSoft2 = 0; }
          if (consonantSoftness > 0) {
            if (tnAmt > 0 || prevTn > 0) {
              var tractWhite = tnoise() * 2 - 1;
              tractLp = (1 - consonantCoef) * tractWhite + consonantCoef * tractLp;
              y += ((1 - consonantSoftness) * tractWhite + consonantSoftness * tractLp) * tnAmt;
            } else tractLp *= consonantCoef;
          } else if (tnAmt > 0 || prevTn > 0) y += (tnoise() * 2 - 1) * tnAmt;
        }
        if (!rawSrc) {
          y = useHumanize ? res[0].runDamped(y, openGate) : res[0].run(y);
          if (studio && useHumanize) {
            y = res[1].runDamped(y, openGate);
            for (var r2 = 2; r2 < 6; r2++) y = res[r2].run(y);
          } else {
            for (var r2b = 1; r2b < 6; r2b++) y = res[r2b].run(y);
          }
          if (hpcShelf) y = hpcShelf.run(y);
          var yn = nZero.run(nPole.run(y));
          y += (yn - y) * (prevMix + (nMix - prevMix) * mix);
          var ny;
          var stNasGain = studio ? 0.85 : 0.5;
          if (nasalLowpassHz > 0) {
            var nasalSource = nas.run(nasalInput);
            nasalLp1 = (1 - nasalCoef) * nasalSource + nasalCoef * nasalLp1;
            nasalLp2 = (1 - nasalCoef) * nasalLp1 + nasalCoef * nasalLp2;
            ny = nasalLp2 * nasalAmt * stNasGain;
          } else ny = nas.run(nasalInput) * nasalAmt * stNasGain;
          y = y * (1 - nasalAmt) + ny;
          if (subNotch) y = subNotch.run(y);
          if (subNotch2) y = subNotch2.run(y);
          if (pharynxNotch) y = pharynxNotch.run(y);
        }
        var bodySample = y;
        if (voicedHigh) {
          if (modeBDelay) {
            var highSample = modeBDelay[delayIndex + 12];
            modeBDelay[delayIndex + 12] = highSource * 0.30 * amp;
            y += highSample;
          } else {
            y += highSource * 0.30 * amp;
          }
        }
        if (phaseDisp) y = phaseDisp.run(y);
        if (piriform && !rawSrc) {
          var py = piriform.b0 * y + piriform.b1 * piriform.x1 + piriform.b2 * piriform.x2 -
            piriform.a1 * piriform.y1 - piriform.a2 * piriform.y2;
          piriform.x2 = piriform.x1; piriform.x1 = y;
          piriform.y2 = piriform.y1; piriform.y1 = py;
          y = py;
        }
        // 滤波器持续运行，静音只关增益；重新启用时不会读出冻结的旧状态。
        var nz = noise() * 2 - 1;
        var fz = fricRes.run(nz) - fricHp.run(nz) * 0.5;
        if (frontCavity) {
          // Always advance the tube, even when silent; no frozen old waves.
          var guided = frontCavity.run(fz) * (prevCavityGain + (cavityGain - prevCavityGain) * mix);
          var cavityAmount = prevCavity + (c.frontCavity - prevCavity) * mix;
          if (cavityAmount > 0) fz += (guided - fz) * cavityAmount;
        }
        if (studio) {
          sibAirHp = (1 - sibAirHpCoef) * nz + sibAirHpCoef * sibAirHp;
          var sibAirHi = nz - sibAirHp;
          sibAirLp1 = (1 - sibAirLpCoef) * sibAirHi + sibAirLpCoef * sibAirLp1;
          sibAirLp2 = (1 - sibAirLpCoef) * sibAirLp1 + sibAirLpCoef * sibAirLp2;
          if (sibAirAmt > 0) fz += sibAirLp2 * sibAirAmt * 1.45;
        }
        /* 噪声通道电平沿用原有标定，平滑处理不额外放大擦音。 */
        var friction;
        if (consonantSoftness > 0) {
          consonantLp = (1 - consonantCoef) * fz + consonantCoef * consonantLp;
          friction = ((1 - consonantSoftness) * fz + consonantSoftness * consonantLp) * fg * fricTrim;
        } else friction = fz * fg * fricTrim;
        if (studio && shockRes) {
          var shockIn = 0;
          if (shockEnv > 0.01) {
            var nW = shockPhase < 1 ? Math.sin(2 * Math.PI * shockPhase) * 1.35 : 0;
            if (shockPhase < 1) shockPhase += shockPhaseStep;
            var nTurbulent = noise() * 2 - 1;
            if (shockIsAffr) {
              shockIn = shockEnv * (nW * 1.10 + nTurbulent * 0.65);
              shockEnv *= shockAlphaAffr;
            } else {
              shockIn = shockEnv * (nW + nTurbulent * 0.35);
              shockEnv *= shockAlpha;
            }
          }
          friction += shockRes.run(shockIn) * shockAmp * 0.80;
        }
        if (modeBDelay) {
          var delayedFriction = modeBDelay[delayIndex + 6]; modeBDelay[delayIndex + 6] = friction;
          friction = delayedFriction; delayIndex = (delayIndex + 1) % 6;
        }
        /* 唇端辐射：一阶差分即 +6dB/oct 的高通，真实声道在唇口必然带这一项。
           少了它，声带音的 −12dB/oct 会原样留在输出里，高频全被吃掉。 */
        if (studio) {
          var radDiff = y - radPrev;
          radPrev = y;
          curARad += radStep;
          radY = (1 - curARad) * radDiff + curARad * radY;
          var fricRad = friction - fricRadPrev;
          fricRadPrev = friction;
          fricRadY = (1 - fricRadCoef) * fricRad + fricRadCoef * fricRadY;
          brLp1 = (1 - breathLpCoef) * fricRad + breathLpCoef * brLp1;
          brLp2 = (1 - breathLpCoef) * brLp1 + breathLpCoef * brLp2;
          breathGate += (tgtBrGate - breathGate) * aBrGate;
          var fricRadOut = fricRadY + (brLp2 - fricRadY) * breathGate;
          var fuY = fuB0 * fricRadOut + fuB1 * fuX1 + fuB2 * fuX2 - fuA1 * fuY1 - fuA2 * fuY2;
          fuX2 = fuX1; fuX1 = fricRadOut; fuY2 = fuY1; fuY1 = fuY;
          fricRadOut = fuY;
          out[idx] = radY + fricRadOut;
        } else {
          y += friction;
          var radDiff0 = y - radPrev;
          radPrev = y;
          out[idx] = radDiff0;
        }
        if (refine) {
          bodyStage[idx] = bodySample - bodyPrev; bodyPrev = bodySample;
          fricStage[idx] = friction - fricPrev; fricPrev = friction;
          // Match the accepted vowel/approximant gate; noise-only consonants
          // use their independent shaping rather than this body correction.
          var bodyGate = c.voicedHighGate > 0 && amp > 1e-5 ? 1 : 0;
          maskPrev += (bodyGate - maskPrev) * maskAlpha;
          bodyMask[idx] = maskPrev;
        }
        if (upperAir) {
          src.airAmp = lastSample ? src.airTarget : src.airAmp + src.airStep;
          // Glottal open-phase pitch-synchronous modulation (~16 dB cycle contrast,
          // exact unit RMS) so >8 kHz turbulence pulses with the vocal folds rather
          // than floating as steady background hiss.
          var airMod = 1;
          if (!skipHarmonics) {
            if (studio && useHumanize) {
              var flowSqAir = (0.68 + 0.42 * openGate) * 0.96;
              airMod = 1 + Math.min(1, amp) * (flowSqAir - 1);
            } else {
              var open = 0.5 + 0.5 * modSin;
              var pulsedOld = (0.16 + 0.84 * open * open) * 1.76963;
              var pulsedNew = (0.72 + 0.28 * open * open) / 0.85888;
              var pulsedBlend = smoothBlend > perturbBlend ? smoothBlend : perturbBlend;
              var pulsed = pulsedBlend >= 1 ? pulsedNew : pulsedBlend <= 0 ? pulsedOld : pulsedOld + (pulsedNew - pulsedOld) * pulsedBlend;
              if (flowEffort) pulsed += Math.abs(flowEffort) * ((1 - pulseDepth + pulseDepth * open * open) * pulseNorm - pulsed);
              airMod = 1 + Math.min(1, amp) * (pulsed - 1);
            }
          }
          var airSample;
          if (perturbBlend > 0) {
            // Randomized-spacing Velvet impulses passed through a 1st-order Schroeder allpass,
            // blended at unit RMS with triangular noise: removes the 4 kHz grid line of fixed M=12
            // Velvet noise while keeping silky turbulent high-end without FM beating.
            var baseNoise = (airNoise() + airNoise() - 1) * 1.41421356;
            if (velvetRem === 0) {
              velvetLen = 3 + Math.floor(airNoise() * 5);
              velvetPos = Math.floor(airNoise() * velvetLen);
              velvetSign = (airNoise() < 0.5 ? -1 : 1) * Math.sqrt(velvetLen / 3);
              velvetRem = velvetLen;
            }
            velvetRem--;
            var rawVelvet = velvetRem === velvetPos ? velvetSign : 0;
            var apY = -0.5 * rawVelvet + airApZ;
            airApZ = rawVelvet + 0.5 * apY;
            if (perturbBlend >= 1) {
              airSample = 0.63372 * apY + 0.77356 * baseNoise;
            } else {
              var vW = 0.63372 * perturbBlend, nW = Math.sqrt(Math.max(0, 1 - vW * vW));
              airSample = vW * apY + nW * baseNoise;
            }
          } else {
            airSample = airNoise() * 2 - 1;
          }
          if (studio && airFormRes) {
            airSample = airFormRes.run(airSample);
            airLp1 = (1 - airLpCoef) * airSample + airLpCoef * airLp1;
            airLp2 = (1 - airLpCoef) * airLp1 + airLpCoef * airLp2;
            airSample = airLp2;
          }
          upperAir[idx] = airSample * src.airAmp * 0.30 * amp * airMod * (useOrganic ? (prevOrgAir + (cOrgAir - prevOrgAir) * mix) : 1);
        }
      }
      if (useHumanize) {
        src.masterPhase = masterPh;
        if (skipHarmonics) {
          for (var kaH = 0; kaH < K; kaH++) {
            ampArr[kaH] = targetArr[kaH];
            if (voicedHigh) highAmpArr[kaH] = highTargetArr[kaH];
            var pth = phaseOffTargetArr[kaH];
            phaseOffArr[kaH] = pth - Math.floor(pth);
          }
        } else if (activeLimit < K) {
          for (var kiH = activeLimit; kiH < K; kiH++) {
            var pti = phaseOffTargetArr[kiH];
            phaseOffArr[kiH] = pti - Math.floor(pti);
          }
        }
      } else if (skipHarmonics) {
        for (var kp = 0, pLen = phaseArr.length; kp < pLen; kp++) {
          var sp = phaseArr[kp] + phaseCycles * (kp + 1);
          phaseArr[kp] = sp - Math.floor(sp);
        }
        for (var ka = 0; ka < K; ka++) {
          ampArr[ka] = targetArr[ka];
          if (voicedHigh) highAmpArr[ka] = highTargetArr[ka];
        }
      } else if (src.wideband || activeLimit < phaseArr.length) {
        var inactiveStart = NSG.LEGACY_SOUND ? (src.wideband ? src.K : phaseArr.length) : activeLimit;
        for (var inactive = inactiveStart, pLen2 = phaseArr.length; inactive < pLen2; inactive++) {
          var silentPhase = phaseArr[inactive] + phaseCycles * (inactive + 1);
          phaseArr[inactive] = silentPhase - Math.floor(silentPhase);
        }
      }
      if (voicedHigh) {
        src.highStart = src.nextHighStart;
        src.highSilent = src.nextHighSilent;
      }
      lastF0 = f0; prevAmp = cAv; prevAsp = cAh;
      prevNasal = c.nasal; prevFric = cFric; prevTn = cTn; prevMix = nMix;
      if (useOrganic) prevOrgAir = cOrgAir;
      if (useHumanize) { prevRd = cRd; prevOq = cOq; prevTa = cTa; }
      if (frontCavity) { prevCavity = c.frontCavity; prevCavityGain = cavityGain; frontCavity.snap(); }
    }

    if (modeBDelay) { out.copyWithin(0, 6); out.fill(0, out.length - 6); }
    if (refine) {
      [bodyStage, fricStage, bodyMask].forEach(function (stage) {
        stage.copyWithin(0, 6); stage.fill(0, stage.length - 6);
      });
      if (NSG.LEGACY_SOUND) {
        var filteredBody = new Float32Array(bodyStage);
        NSG.DSP.applyOutEq(filteredBody, refineCurve('body'));
        for (var bi0 = 0; bi0 < out.length; bi0++)
          out[bi0] += (filteredBody[bi0] - bodyStage[bi0]) * bodyMask[bi0];
        var filteredFriction = new Float32Array(fricStage);
        NSG.DSP.applyOutEq(filteredFriction, refineCurve('friction'));
        for (var fi0 = 0; fi0 < out.length; fi0++) out[fi0] += filteredFriction[fi0] - fricStage[fi0];
      } else {
        applyOutEqCore(bodyStage, refineCurve('body'), SR, 1, true);
        for (var bi = 0; bi < out.length; bi++) out[bi] += bodyStage[bi] * bodyMask[bi];
        applyOutEqCore(fricStage, refineCurve('friction'), SR, 1, true);
        for (var fi = 0; fi < out.length; fi++) out[fi] += fricStage[fi];
      }
    }
    if (upperAir) {
      // Internal upper-band shaping has its own compensated FIR delay. Mix before
      // final output EQ and level control, so user EQ still affects both parts.
      NSG.DSP.applyOutEq(upperAir, air.eq);
      shapeEffortAir(upperAir, ctrl, air.kernels);
      for (var ua = 0; ua < out.length; ua++) out[ua] += upperAir[ua];
    }
    if (!rawSrc && Array.isArray(timbre.outEq)) NSG.DSP.applyOutEq(out, timbre.outEq);
    if (sliceRange) {
      return {
        offset: sampleOffset, pcm: out, total: Math.max(r0.total, sampleOffset + sliceTotal),
        sr: SR, startFrame: startFrame, endFrame: endFrame, mixGains: extractMixGains(ctrl)
      };
    }
    return finalizeVocalOut(out, extractMixGains(ctrl), studio && !rawSrc);
  }

  function trackRenderScore(score, trk) {
    var s = Object.assign({}, score, { tracks: [trk] });
    if (trk && trk.lang) s.lang = trk.lang;
    if (trk && trk.phonemizer !== undefined) s.phonemizer = trk.phonemizer;
    return s;
  }

  function limitLookahead(channels, sr, thresh, ceil) {
    var list = Array.isArray(channels) ? channels : [channels];
    var nCh = list.length;
    if (!nCh) return channels;
    var nOut = list[0].length;
    if (!nOut) return channels;
    var t = thresh > 0 ? thresh : 0.92;
    var cMax = ceil > 0 ? ceil : 0.97;
    var rate = sr > 0 ? sr : SR;
    var peak = 0;
    for (var c0 = 0; c0 < nCh; c0++) {
      var buf0 = list[c0];
      for (var i0 = 0; i0 < nOut; i0++) {
        var av0 = buf0[i0] < 0 ? -buf0[i0] : buf0[i0];
        if (av0 > peak) peak = av0;
      }
    }
    if (peak <= t) return channels;
    var LA = Math.max(1, Math.round(rate * 0.003));
    var queueSize = LA + 2;
    var dq = new Int32Array(queueSize), req = new Float64Array(queueSize), dh = 0, dt = 0, queued = 0;
    var win = new Float64Array(LA), slot = 0;
    var relA = 1 - Math.exp(-1 / (rate * 0.05)), env = 1, box = 0;
    for (var q3 = 0; q3 < nOut + LA; q3++) {
      var ax = 0;
      if (q3 < nOut) {
        for (var c1 = 0; c1 < nCh; c1++) {
          var v1 = list[c1][q3];
          var a1 = v1 < 0 ? -v1 : v1;
          if (a1 > ax) ax = a1;
        }
      }
      var request = ax > t ? t / ax : 1;
      while (queued > 0) {
        var back = dt === 0 ? queueSize - 1 : dt - 1;
        if (req[back] < request) break;
        dt = back; queued--;
      }
      dq[dt] = q3; req[dt] = request;
      if (++dt === queueSize) dt = 0;
      queued++;
      var q5 = q3 - LA;
      if (q5 < 0) continue;
      while (dq[dh] < q5) {
        if (++dh === queueSize) dh = 0;
        queued--;
      }
      var minimum = req[dh];
      if (q5 >= LA) box -= win[slot];
      box += minimum;
      win[slot] = minimum;
      if (++slot === LA) slot = 0;
      var gTarget = Math.min(1, box / (q5 < LA ? q5 + 1 : LA));
      env = gTarget < env ? gTarget : env + (gTarget - env) * relA;
      if (env > gTarget) env = gTarget;
      for (var c2 = 0; c2 < nCh; c2++) {
        var yv = list[c2][q5] * env;
        list[c2][q5] = yv > cMax ? cMax : yv < -cMax ? -cMax : yv;
      }
    }
    return channels;
  }

  function mixVocalItems(items, sr, opt) {
    sr = sr || SR;
    var keepHeadroom = !!(opt && opt.headroom === true);
    if (!items || !items.length) return { pcm: new Float32Array(Math.round(sr * 0.4)), sr: sr };
    var normalized = items.map(function (it) {
      var v = typeof it.vol === 'number' && isFinite(it.vol) ? Math.max(0, Math.min(4, it.vol)) : 1;
      var p = typeof it.pan === 'number' && isFinite(it.pan) ? Math.max(-1, Math.min(1, it.pan)) : 0;
      return { pcm: it.pcm, vol: v, pan: p };
    });
    var hasStereo = normalized.some(function (it) { return Math.abs(it.pan) > 1e-4; });
    if (normalized.length === 1 && !hasStereo && Math.abs(normalized[0].vol - 1) < 1e-6) {
      return { pcm: normalized[0].pcm, sr: sr };
    }
    var maxLen = 0;
    for (var i = 0; i < normalized.length; i++) if (normalized[i].pcm.length > maxLen) maxLen = normalized[i].pcm.length;
    if (!hasStereo) {
      var mix = new Float32Array(maxLen);
      for (var r = 0; r < normalized.length; r++) {
        var pcm = normalized[r].pcm, g = normalized[r].vol;
        if (g === 0) continue;
        for (var k = 0; k < pcm.length; k++) mix[k] += pcm[k] * g;
      }
      if (!keepHeadroom) limitLookahead([mix], sr, 0.92, 0.97);
      return { pcm: mix, sr: sr };
    }
    var left = new Float32Array(maxLen), right = new Float32Array(maxLen);
    for (var r2 = 0; r2 < normalized.length; r2++) {
      var item = normalized[r2], src = item.pcm;
      if (item.vol === 0) continue;
      var angle = (item.pan + 1) * Math.PI / 4;
      var lg = Math.cos(angle) * Math.SQRT2 * item.vol;
      var rg = Math.sin(angle) * Math.SQRT2 * item.vol;
      for (var k2 = 0; k2 < src.length; k2++) {
        var s = src[k2];
        left[k2] += s * lg;
        right[k2] += s * rg;
      }
    }
    if (!keepHeadroom) limitLookahead([left, right], sr, 0.92, 0.97);
    var mono = new Float32Array(maxLen);
    for (var k3 = 0; k3 < maxLen; k3++) mono[k3] = (left[k3] + right[k3]) * 0.5;
    return { pcm: mono, channels: [left, right], sr: sr };
  }

  NSG.DSP.renderTrack = function (score, trk, timbre, opt) {
    return renderSingleVocal(trackRenderScore(score, trk), (trk && trk.timbre) || timbre, opt);
  };
  NSG.DSP.planVocalSlices = function (score, trk, timbre, opt, maxSlices) {
    return planVocalSlicesForScore(trackRenderScore(score, trk), (trk && trk.timbre) || timbre, opt, maxSlices);
  };
  NSG.DSP.renderVocalSlice = function (score, trk, timbre, opt, sliceSpec) {
    var sliceTrk = trk;
    var frameRange = sliceSpec;
    if (sliceSpec && !Array.isArray(sliceSpec) && Array.isArray(sliceSpec.noteRange)) {
      var sorted = (trk && Array.isArray(trk.notes) ? trk.notes : []).slice().sort(function (a, b) { return a.start - b.start; });
      sliceTrk = Object.assign({}, trk, { notes: sorted.slice(sliceSpec.noteRange[0], sliceSpec.noteRange[1]) });
      frameRange = sliceSpec.frameRange;
    }
    var sliceOpt = Object.assign({}, opt, { sliceRange: frameRange });
    return renderSingleVocal(trackRenderScore(score, sliceTrk), (trk && trk.timbre) || timbre, sliceOpt);
  };
  NSG.DSP.finalizeVocalSlices = function (chunks, total, mixGains, opt) {
    var finalTotal = total || 0;
    var anyMix = !!mixGains;
    for (var i0 = 0; i0 < chunks.length; i0++) {
      var c0 = chunks[i0];
      if (!c0) continue;
      var endS = (c0.offset || 0) + (c0.pcm ? c0.pcm.length : 0);
      if (endS > finalTotal) finalTotal = endS;
      if (c0.mixGains) anyMix = true;
    }
    var full = new Float32Array(finalTotal);
    var fullMix = mixGains || null;
    if (!fullMix && anyMix) {
      fullMix = new Float32Array(Math.ceil(finalTotal / HOP));
      fullMix.fill(1);
    }
    for (var i = 0; i < chunks.length; i++) {
      var ch = chunks[i];
      if (!ch) continue;
      if (ch.pcm && ch.pcm.length) full.set(ch.pcm, ch.offset || 0);
      if (fullMix && ch.mixGains && ch.mixGains.length) fullMix.set(ch.mixGains, ch.startFrame || 0);
    }
    var useDeEss = modeB && !NSG.LEGACY_SOUND && (!opt || (!opt.rawSource && opt.studio !== false));
    return finalizeVocalOut(full, fullMix, useDeEss);
  };
  NSG.DSP.limitLookahead = limitLookahead;
  NSG.DSP.mixVocalTracks = mixVocalItems;

  NSG.DSP.render = function (score, timbre, opt) {
    opt = opt || {};
    var tracks = (score && score.tracks) || [];
    var hasVocalType = tracks.some(function (t) { return t && t.type === 'vocal'; });
    var vocalTracks = hasVocalType
      ? tracks.filter(function (t) { return t && t.type === 'vocal' && !t.muted && t.notes && t.notes.length; })
      : (tracks[0] && !tracks[0].muted && tracks[0].notes && tracks[0].notes.length ? [tracks[0]] : []);
    if (!vocalTracks.length) return { pcm: new Float32Array(Math.round(SR * 0.4)), sr: SR };
    var items = vocalTracks.map(function (trk) {
      var res = renderSingleVocal(trackRenderScore(score, trk), trk.timbre || timbre, opt);
      return { pcm: res.pcm, vol: trk.vol, pan: trk.pan };
    });
    return mixVocalItems(items, SR, { headroom: opt.headroom === true });
  };

  /* ---------- 伴奏渲染 ----------
     一套「合成乐队」：贝斯、铺底、电钢、拨弦、吉他（Karplus-Strong）、
     弦乐、风琴、铜管、沙锤，加上一整套鼓组（底鼓/军鼓/踩镲/开镲/
     吊镲/叮叮镲/通鼓/边击/拍手）。
     每个音符都带 inst 字段；MIDI 导进来的鼓用音符号映射到具体鼓件，
     所以 DSC / MIDI / ufdata 带进来的伴奏也能照原样发声。 */
  var DRUM_BY_NOTE = {
    35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare',
    41: 'tom', 42: 'hat', 43: 'tom', 44: 'hat', 45: 'tom', 46: 'openhat',
    47: 'tom', 48: 'tom', 49: 'crash', 50: 'tom', 51: 'ride', 52: 'crash',
    53: 'ride', 54: 'perc', 55: 'crash', 56: 'perc', 57: 'crash', 58: 'perc',
    59: 'ride', 60: 'tom', 61: 'tom', 62: 'tom', 63: 'openhat', 64: 'tom',
    69: 'perc', 70: 'perc', 75: 'rim', 76: 'rim', 81: 'perc', 82: 'perc', 84: 'perc', 86: 'tom', 87: 'tom'
  };
  NSG.DSP.DRUM_BY_NOTE = DRUM_BY_NOTE;

  /* 供自测/调试读取控制帧（不改任何状态） */
  NSG.DSP.controlFrames = function (score, timbre, opt) {
    studioMode = modeB && !(opt && opt.rawSource) && !NSG.LEGACY_SOUND && !(opt && opt.studio === false);
    var opening = (opt && opt.highVowelOpening !== undefined) ? opt.highVowelOpening
      : (!NSG.LEGACY_SOUND && timbre && Number.isFinite(timbre.highVowelOpening) ? Math.min(1, timbre.highVowelOpening) : 0);
    return scoreToControl(score, timbre, NSG.TEMPO.map(score), score.lang, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, opening, undefined, undefined,
      undefined, resolveArticMorph(timbre, opt), !(opt && opt.autoExpress === false));
  };

  // The panel uses the same scheduler as rendering, without generating control frames or PCM.
  NSG.DSP.phonemeTimeline = function (score, timbre, opt) {
    studioMode = modeB && !NSG.LEGACY_SOUND && !(opt && opt.studio === false);
    var tm = NSG.TEMPO.map(score), built = buildEvents(score, timbre || NSG.defaultTimbre(), tm, score.lang, undefined, undefined, 'timingOnly');
    var phones = [], current = null, previous = null;
    built.ev.forEach(function (event) {
      if (event.noteId === undefined) { previous = event; return; }
      if (!current || current.noteId !== event.noteId || current.index !== event.phoneIndex) {
        current = { noteId: event.noteId, index: event.phoneIndex, phone: event.phone,
          t0: event.nominalT0 === undefined ? event.t0 : event.nominalT0,
          t1: event.nominalT1 === undefined ? event.t1 : event.nominalT1,
          onset: event.t0, anticipation: (event.anticipation || 0) * 1000,
          maxAnticipation: (event.maxAnticipation || 0) * 1000,
          crossfade: Math.max(0, (event.xf || 0) - (event.anticipation || 0)) * 1000,
          maxCrossfade: previous && previous.kind !== 'B' && Math.abs(previous.t1 - event.t0) < 1e-6 ?
            Math.min(0.2 - (event.anticipation || 0), event.t1 - (event.nominalT0 === undefined ? event.t0 : event.nominalT0),
              (previous.nominalT1 === undefined ? previous.t1 : previous.nominalT1) - previous.t0) * 1000 : 0 };
        phones.push(current);
      } else current.t1 = event.nominalT1 === undefined ? event.t1 : event.nominalT1;
      previous = event;
    });
    built.notes.forEach(function (note) {
      if (note._rest || note._breath) phones.push({ noteId: note.id, index: 0,
        phone: note._breath ? (note._breathPhone || 'br') : 'SP', t0: note._start, t1: note._end,
        crossfade: 0, maxCrossfade: 0, readOnly: true });
    });
    phones.sort(function (a, b) { return a.t0 - b.t0; });
    return { phones: phones, notes: built.notes, tm: tm };
  };

  var ACCOMP_SPACE_PROFILES = {
    hall: { tailSec: 2.8, hallTime: 2.55, hallDamp: 3900, hallMix: 0.72, plateTime: 1.10, plateMix: 0.46, delayMix: 0.34, delayFb: 0.38, chorusMix: 0.48, pocketDb: -2.0, airDb: 1.3, compRatio: 2.1, compThresh: 0.42, snareHall: 0.34 },
    studio: { tailSec: 1.9, hallTime: 1.50, hallDamp: 4700, hallMix: 0.48, plateTime: 0.82, plateMix: 0.38, delayMix: 0.24, delayFb: 0.28, chorusMix: 0.34, pocketDb: -1.5, airDb: 1.0, compRatio: 2.2, compThresh: 0.44, snareHall: 0.16 },
    wide: { tailSec: 1.7, hallTime: 1.35, hallDamp: 5500, hallMix: 0.42, plateTime: 0.72, plateMix: 0.36, delayMix: 0.30, delayFb: 0.32, chorusMix: 0.48, pocketDb: -1.4, airDb: 1.4, compRatio: 2.5, compThresh: 0.38, snareHall: 0.14 },
    intimate: { tailSec: 1.3, hallTime: 0.95, hallDamp: 3500, hallMix: 0.34, plateTime: 0.60, plateMix: 0.30, delayMix: 0.14, delayFb: 0.20, chorusMix: 0.20, pocketDb: -1.0, airDb: 0.6, compRatio: 1.8, compThresh: 0.48, snareHall: 0.08 }
  };

  function runAccompSpaceEffect(effect, inBufL, inBufR, outL, outR, SR, spaceProfile, spb0) {
    var total = inBufL.length;
    var TWO_PI = Math.PI * 2;
    var inPlace = outL === inBufL && outR === inBufR;
    if (effect === 'chorus') {
      var cBufSz = Math.max(64, Math.ceil(SR * 0.032));
      var cRingL = new Float32Array(cBufSz), cRingR = new Float32Array(cBufSz), cW = 0;
      var cBase = 0.011 * SR, cDep = 0.0038 * SR, cWet = spaceProfile.chorusMix;
      var cStep1 = 0.43 / SR, cStep2 = 0.59 / SR, cPh1 = 0, cPh2 = 0.5;
      for (var ci = 0; ci < total; ci++) {
        var inL = inBufL[ci], inR = inBufR[ci];
        cRingL[cW] = inL; cRingR[cW] = inR;
        cPh1 += cStep1; if (cPh1 >= 1) cPh1 -= 1;
        cPh2 += cStep2; if (cPh2 >= 1) cPh2 -= 1;
        var dL = cBase + cDep * sinT(cPh1), dR = cBase + cDep * sinT(cPh2);
        var iL = dL | 0, fL = dL - iL, iR = dR | 0, fR = dR - iR;
        var pL1 = cW - iL; if (pL1 < 0) pL1 += cBufSz;
        var pL0 = pL1 - 1; if (pL0 < 0) pL0 += cBufSz;
        var pR1 = cW - iR; if (pR1 < 0) pR1 += cBufSz;
        var pR0 = pR1 - 1; if (pR0 < 0) pR0 += cBufSz;
        var tapL = cRingL[pL1] * (1 - fL) + cRingL[pL0] * fL;
        var tapR = cRingR[pR1] * (1 - fR) + cRingR[pR0] * fR;
        var wL = (tapL - tapR * 0.22) * cWet;
        var wR = (tapR - tapL * 0.22) * cWet;
        if (inPlace) { outL[ci] = wL; outR[ci] = wR; }
        else { outL[ci] += wL; outR[ci] += wR; }
        if (++cW === cBufSz) cW = 0;
      }
    } else if (effect === 'delay') {
      var dSec = spb0 * 0.75;
      while (dSec > 0.62) dSec *= 0.5;
      while (dSec < 0.18) dSec *= 2;
      var dS1 = Math.max(16, Math.round(dSec * SR)), dS2 = Math.max(16, Math.round(dSec * 1.006 * SR));
      var dRingL = new Float32Array(dS1), dRingR = new Float32Array(dS2), dIdxL = 0, dIdxR = 0;
      var dLpCoef = 1 - Math.exp(-TWO_PI * Math.min(3400, SR * 0.4) / SR);
      var dHpCoef = 1 - Math.exp(-TWO_PI * 240 / SR);
      var dLpL = 0, dLpR = 0, dHpL = 0, dHpR = 0, dFb = spaceProfile.delayFb, dWet = spaceProfile.delayMix;
      for (var di = 0; di < total; di++) {
        var outDL = dRingL[dIdxL], outDR = dRingR[dIdxR];
        dLpL += (outDL - dLpL) * dLpCoef; dHpL += (dLpL - dHpL) * dHpCoef;
        dLpR += (outDR - dLpR) * dLpCoef; dHpR += (dLpR - dHpR) * dHpCoef;
        var cleanL = dLpL - dHpL, cleanR = dLpR - dHpR;
        var dIn = (inBufL[di] + inBufR[di]) * 0.55;
        dRingR[dIdxR] = dIn + cleanL * dFb;
        dRingL[dIdxL] = cleanR * 0.86;
        if (inPlace) { outL[di] = cleanL * dWet; outR[di] = cleanR * dWet; }
        else { outL[di] += cleanL * dWet; outR[di] += cleanR * dWet; }
        if (++dIdxL === dS1) dIdxL = 0;
        if (++dIdxR === dS2) dIdxR = 0;
      }
    } else if (effect === 'plate') {
      var pPreN = Math.max(4, Math.round(0.012 * SR)), pPreL = new Float32Array(pPreN), pPreR = new Float32Array(pPreN), pPreI = 0;
      var pdnL1 = Math.max(4, Math.round(0.0031 * SR)), pdnL2 = Math.max(4, Math.round(0.0053 * SR));
      var pdnR1 = Math.max(4, Math.round(0.0037 * SR)), pdnR2 = Math.max(4, Math.round(0.0061 * SR));
      var pdbL1 = new Float32Array(pdnL1), pdbL2 = new Float32Array(pdnL2), pdbR1 = new Float32Array(pdnR1), pdbR2 = new Float32Array(pdnR2);
      var pdiL1 = 0, pdiL2 = 0, pdiR1 = 0, pdiR2 = 0, pDg = 0.55;
      var pl0 = Math.max(8, Math.round(0.0173 * SR)), pl1 = Math.max(8, Math.round(0.0239 * SR));
      var pl2 = Math.max(8, Math.round(0.0311 * SR)), pl3 = Math.max(8, Math.round(0.0417 * SR));
      var pb0 = new Float32Array(pl0), pb1 = new Float32Array(pl1), pb2 = new Float32Array(pl2), pb3 = new Float32Array(pl3);
      var pg0 = Math.pow(0.001, (pl0 / SR) / spaceProfile.plateTime);
      var pg1 = Math.pow(0.001, (pl1 / SR) / spaceProfile.plateTime);
      var pg2 = Math.pow(0.001, (pl2 / SR) / spaceProfile.plateTime);
      var pg3 = Math.pow(0.001, (pl3 / SR) / spaceProfile.plateTime);
      var pi0 = 0, pi1 = 0, pi2p = 0, pi3 = 0, plp0 = 0, plp1 = 0, plp2 = 0, plp3 = 0;
      var pDamp = 1 - Math.exp(-TWO_PI * Math.min(5200, SR * 0.42) / SR), pHpCoef = 1 - Math.exp(-TWO_PI * 180 / SR);
      var pHpL = 0, pHpR = 0, pWet = spaceProfile.plateMix;
      for (var pi2 = 0; pi2 < total; pi2++) {
        var preL = pPreL[pPreI], preR = pPreR[pPreI];
        pPreL[pPreI] = inBufL[pi2]; pPreR[pPreI] = inBufR[pi2];
        if (++pPreI === pPreN) pPreI = 0;
        var pd1L = pdbL1[pdiL1], pv1L = preL - pDg * pd1L, py1L = pd1L + pDg * pv1L;
        pdbL1[pdiL1] = pv1L; if (++pdiL1 === pdnL1) pdiL1 = 0;
        var pd2L = pdbL2[pdiL2], pv2L = py1L - pDg * pd2L, inPL = pd2L + pDg * pv2L;
        pdbL2[pdiL2] = pv2L; if (++pdiL2 === pdnL2) pdiL2 = 0;
        var pd1R = pdbR1[pdiR1], pv1R = preR - pDg * pd1R, py1R = pd1R + pDg * pv1R;
        pdbR1[pdiR1] = pv1R; if (++pdiR1 === pdnR1) pdiR1 = 0;
        var pd2R = pdbR2[pdiR2], pv2R = py1R - pDg * pd2R, inPR = pd2R + pDg * pv2R;
        pdbR2[pdiR2] = pv2R; if (++pdiR2 === pdnR2) pdiR2 = 0;
        var x0 = pb0[pi0], x1 = pb1[pi1], x2 = pb2[pi2p], x3 = pb3[pi3];
        plp0 += (x0 - plp0) * pDamp; plp1 += (x1 - plp1) * pDamp;
        plp2 += (x2 - plp2) * pDamp; plp3 += (x3 - plp3) * pDamp;
        var sumP = (plp0 + plp1 + plp2 + plp3) * 0.5;
        pb0[pi0] = inPL + (plp0 - sumP) * pg0;
        pb1[pi1] = -inPR + (plp1 - sumP) * pg1;
        pb2[pi2p] = inPR * 0.85 + (plp2 - sumP) * pg2;
        pb3[pi3] = -inPL * 0.85 + (plp3 - sumP) * pg3;
        if (++pi0 === pl0) pi0 = 0;
        if (++pi1 === pl1) pi1 = 0;
        if (++pi2p === pl2) pi2p = 0;
        if (++pi3 === pl3) pi3 = 0;
        var outPL = (x0 + x1 - x2 + x3) * 0.45, outPR = (x0 - x1 + x2 + x3) * 0.45;
        pHpL += (outPL - pHpL) * pHpCoef; pHpR += (outPR - pHpR) * pHpCoef;
        if (inPlace) { outL[pi2] = (outPL - pHpL) * pWet; outR[pi2] = (outPR - pHpR) * pWet; }
        else { outL[pi2] += (outPL - pHpL) * pWet; outR[pi2] += (outPR - pHpR) * pWet; }
      }
    } else if (effect === 'hall') {
      var hPreN = Math.max(4, Math.round(0.026 * SR)), hPreL = new Float32Array(hPreN), hPreR = new Float32Array(hPreN), hPreI = 0;
      var hdnL1 = Math.max(4, Math.round(0.0047 * SR)), hdnL2 = Math.max(4, Math.round(0.0079 * SR));
      var hdnR1 = Math.max(4, Math.round(0.0053 * SR)), hdnR2 = Math.max(4, Math.round(0.0089 * SR));
      var hdbL1 = new Float32Array(hdnL1), hdbL2 = new Float32Array(hdnL2), hdbR1 = new Float32Array(hdnR1), hdbR2 = new Float32Array(hdnR2);
      var hdiL1 = 0, hdiL2 = 0, hdiR1 = 0, hdiR2 = 0, hDg = 0.6;
      var hl0 = Math.max(8, Math.round(0.0297 * SR)), hl1 = Math.max(8, Math.round(0.0371 * SR));
      var hl2 = Math.max(8, Math.round(0.0433 * SR)), hl3 = Math.max(8, Math.round(0.0539 * SR));
      var hl4 = Math.max(8, Math.round(0.0617 * SR)), hl5 = Math.max(8, Math.round(0.0713 * SR));
      var hl6 = Math.max(8, Math.round(0.0831 * SR)), hl7 = Math.max(8, Math.round(0.0977 * SR));
      var hb0 = new Float32Array(hl0), hb1 = new Float32Array(hl1), hb2 = new Float32Array(hl2), hb3 = new Float32Array(hl3);
      var hb4 = new Float32Array(hl4), hb5 = new Float32Array(hl5), hb6 = new Float32Array(hl6), hb7 = new Float32Array(hl7);
      var hg0 = Math.pow(0.001, (hl0 / SR) / spaceProfile.hallTime), hg1 = Math.pow(0.001, (hl1 / SR) / spaceProfile.hallTime);
      var hg2 = Math.pow(0.001, (hl2 / SR) / spaceProfile.hallTime), hg3 = Math.pow(0.001, (hl3 / SR) / spaceProfile.hallTime);
      var hg4 = Math.pow(0.001, (hl4 / SR) / spaceProfile.hallTime), hg5 = Math.pow(0.001, (hl5 / SR) / spaceProfile.hallTime);
      var hg6 = Math.pow(0.001, (hl6 / SR) / spaceProfile.hallTime), hg7 = Math.pow(0.001, (hl7 / SR) / spaceProfile.hallTime);
      var hi0 = 0, hi1 = 0, hi2p = 0, hi3 = 0, hi4 = 0, hi5 = 0, hi6 = 0, hi7 = 0;
      var hlp0 = 0, hlp1 = 0, hlp2 = 0, hlp3 = 0, hlp4 = 0, hlp5 = 0, hlp6 = 0, hlp7 = 0;
      var hDamp = 1 - Math.exp(-TWO_PI * Math.min(spaceProfile.hallDamp, SR * 0.42) / SR);
      var hHpCoef = 1 - Math.exp(-TWO_PI * 160 / SR);
      var hHpL = 0, hHpR = 0, hWet = spaceProfile.hallMix, hNorm = 0.35355339059327373;
      for (var hi2 = 0; hi2 < total; hi2++) {
        var preHL = hPreL[hPreI], preHR = hPreR[hPreI];
        hPreL[hPreI] = inBufL[hi2]; hPreR[hPreI] = inBufR[hi2];
        if (++hPreI === hPreN) hPreI = 0;
        var hd1L = hdbL1[hdiL1], hv1L = preHL - hDg * hd1L, hy1L = hd1L + hDg * hv1L;
        hdbL1[hdiL1] = hv1L; if (++hdiL1 === hdnL1) hdiL1 = 0;
        var hd2L = hdbL2[hdiL2], hv2L = hy1L - hDg * hd2L, inHL = hd2L + hDg * hv2L;
        hdbL2[hdiL2] = hv2L; if (++hdiL2 === hdnL2) hdiL2 = 0;
        var hd1R = hdbR1[hdiR1], hv1R = preHR - hDg * hd1R, hy1R = hd1R + hDg * hv1R;
        hdbR1[hdiR1] = hv1R; if (++hdiR1 === hdnR1) hdiR1 = 0;
        var hd2R = hdbR2[hdiR2], hv2R = hy1R - hDg * hd2R, inHR = hd2R + hDg * hv2R;
        hdbR2[hdiR2] = hv2R; if (++hdiR2 === hdnR2) hdiR2 = 0;
        var y0 = hb0[hi0], y1 = hb1[hi1], y2 = hb2[hi2p], y3 = hb3[hi3];
        var y4 = hb4[hi4], y5 = hb5[hi5], y6 = hb6[hi6], y7 = hb7[hi7];
        hlp0 += (y0 - hlp0) * hDamp; hlp1 += (y1 - hlp1) * hDamp;
        hlp2 += (y2 - hlp2) * hDamp; hlp3 += (y3 - hlp3) * hDamp;
        hlp4 += (y4 - hlp4) * hDamp; hlp5 += (y5 - hlp5) * hDamp;
        hlp6 += (y6 - hlp6) * hDamp; hlp7 += (y7 - hlp7) * hDamp;
        // 8-point Walsh-Hadamard transform (3 butterfly stages)
        var a0 = hlp0 + hlp1, a1 = hlp0 - hlp1, a2 = hlp2 + hlp3, a3 = hlp2 - hlp3;
        var a4 = hlp4 + hlp5, a5 = hlp4 - hlp5, a6 = hlp6 + hlp7, a7 = hlp6 - hlp7;
        var b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
        var b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
        var w0 = (b0 + b4) * hNorm, w1 = (b1 + b5) * hNorm, w2 = (b2 + b6) * hNorm, w3 = (b3 + b7) * hNorm;
        var w4 = (b0 - b4) * hNorm, w5 = (b1 - b5) * hNorm, w6 = (b2 - b6) * hNorm, w7 = (b3 - b7) * hNorm;
        hb0[hi0] = inHL * 0.65 + w0 * hg0;
        hb1[hi1] = inHR * 0.65 + w1 * hg1;
        hb2[hi2p] = -inHL * 0.65 + w2 * hg2;
        hb3[hi3] = -inHR * 0.65 + w3 * hg3;
        hb4[hi4] = inHR * 0.65 + w4 * hg4;
        hb5[hi5] = -inHL * 0.65 + w5 * hg5;
        hb6[hi6] = -inHR * 0.65 + w6 * hg6;
        hb7[hi7] = inHL * 0.65 + w7 * hg7;
        if (++hi0 === hl0) hi0 = 0; if (++hi1 === hl1) hi1 = 0;
        if (++hi2p === hl2) hi2p = 0; if (++hi3 === hl3) hi3 = 0;
        if (++hi4 === hl4) hi4 = 0; if (++hi5 === hl5) hi5 = 0;
        if (++hi6 === hl6) hi6 = 0; if (++hi7 === hl7) hi7 = 0;
        var outHL = (y0 + y1 - y2 - y3 + y4 + y5 - y6 - y7) * 0.42;
        var outHR = (y0 - y1 + y2 - y3 - y4 + y5 - y6 + y7) * 0.42;
        hHpL += (outHL - hHpL) * hHpCoef; hHpR += (outHR - hHpR) * hHpCoef;
        if (inPlace) { outL[hi2] = (outHL - hHpL) * hWet; outR[hi2] = (outHR - hHpR) * hWet; }
        else { outL[hi2] += (outHL - hHpL) * hWet; outR[hi2] += (outHR - hHpR) * hWet; }
      }
    }
  }

  function finalizeAccompMix(left, right, SR, spaceProfile, legacySound) {
    var total = left.length, TWO_PI = Math.PI * 2;
    if (spaceProfile) {
      // 5. Master Bus Vocal-Pocket EQ + Stereo-Linked Soft-Knee Glue Compressor
      var makeBiquad = function (kindEq, fc, qOrS, dbGain) {
        var w0 = TWO_PI * Math.max(15, Math.min(fc, SR * 0.42)) / SR;
        var cw = Math.cos(w0), sw = Math.sin(w0), A = Math.pow(10, (dbGain || 0) / 40), b0, b1, b2, a0, a1, a2;
        if (kindEq === 'hpf') {
          var alphaH = sw / (2 * (qOrS || 0.707));
          b0 = (1 + cw) * 0.5; b1 = -(1 + cw); b2 = (1 + cw) * 0.5;
          a0 = 1 + alphaH; a1 = -2 * cw; a2 = 1 - alphaH;
        } else if (kindEq === 'peak') {
          var alphaP = sw / (2 * (qOrS || 0.9));
          b0 = 1 + alphaP * A; b1 = -2 * cw; b2 = 1 - alphaP * A;
          a0 = 1 + alphaP / A; a1 = -2 * cw; a2 = 1 - alphaP / A;
        } else {
          var alphaS = sw / 2 * Math.sqrt((A + 1 / A) * (1 / (qOrS || 0.7) - 1) + 2);
          var sq = 2 * Math.sqrt(A) * alphaS;
          b0 = A * ((A + 1) + (A - 1) * cw + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sq);
          a0 = (A + 1) - (A - 1) * cw + sq; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sq;
        }
        return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
      };
      var eqHp = makeBiquad('hpf', 28, 0.707, 0);
      var eqDip = makeBiquad('peak', Math.min(2200, SR * 0.36), 0.9, spaceProfile.pocketDb);
      var eqAir = makeBiquad('hshelf', Math.min(9200, SR * 0.36), 0.707, spaceProfile.airDb);
      var hpB0 = eqHp.b0, hpB1 = eqHp.b1, hpB2 = eqHp.b2, hpA1 = eqHp.a1, hpA2 = eqHp.a2;
      var dpB0 = eqDip.b0, dpB1 = eqDip.b1, dpB2 = eqDip.b2, dpA1 = eqDip.a1, dpA2 = eqDip.a2;
      var arB0 = eqAir.b0, arB1 = eqAir.b1, arB2 = eqAir.b2, arA1 = eqAir.a1, arA2 = eqAir.a2;
      var hpZ1L = 0, hpZ2L = 0, hpZ1R = 0, hpZ2R = 0;
      var dpZ1L = 0, dpZ2L = 0, dpZ1R = 0, dpZ2R = 0;
      var arZ1L = 0, arZ2L = 0, arZ1R = 0, arZ2R = 0;
      var compEnv = 0, cAtt = 1 - Math.exp(-1 / (SR * 0.015)), cRel = 1 - Math.exp(-1 / (SR * 0.15));
      var cThresh = spaceProfile.compThresh, cSlope = 1 - 1 / spaceProfile.compRatio, cMakeup = 1.12;
      for (var mi = 0; mi < total; mi++) {
        var l = left[mi], r = right[mi];
        var yl1 = hpB0 * l + hpZ1L; hpZ1L = hpB1 * l - hpA1 * yl1 + hpZ2L; hpZ2L = hpB2 * l - hpA2 * yl1;
        var yr1 = hpB0 * r + hpZ1R; hpZ1R = hpB1 * r - hpA1 * yr1 + hpZ2R; hpZ2R = hpB2 * r - hpA2 * yr1;
        var yl2 = dpB0 * yl1 + dpZ1L; dpZ1L = dpB1 * yl1 - dpA1 * yl2 + dpZ2L; dpZ2L = dpB2 * yl1 - dpA2 * yl2;
        var yr2 = dpB0 * yr1 + dpZ1R; dpZ1R = dpB1 * yr1 - dpA1 * yr2 + dpZ2R; dpZ2R = dpB2 * yr1 - dpA2 * yr2;
        var yl3 = arB0 * yl2 + arZ1L; arZ1L = arB1 * yl2 - arA1 * yl3 + arZ2L; arZ2L = arB2 * yl2 - arA2 * yl3;
        var yr3 = arB0 * yr2 + arZ1R; arZ1R = arB1 * yr2 - arA1 * yr3 + arZ2R; arZ2R = arB2 * yr2 - arA2 * yr3;
        var det = Math.max(yl3 < 0 ? -yl3 : yl3, yr3 < 0 ? -yr3 : yr3);
        compEnv += (det - compEnv) * (det > compEnv ? cAtt : cRel);
        var compGain = compEnv > cThresh ? Math.pow(compEnv / cThresh, -cSlope) : 1;
        left[mi] = yl3 * compGain * cMakeup;
        right[mi] = yr3 * compGain * cMakeup;
      }
    }
    /* Shared gain preserves the stereo balance. pcm remains a mono analysis preview. */
    var pk = 1e-9;
    for (var i8 = 0; i8 < total; i8++) {
      var al = left[i8] < 0 ? -left[i8] : left[i8];
      var ar = right[i8] < 0 ? -right[i8] : right[i8];
      if (al > pk) pk = al;
      if (ar > pk) pk = ar;
    }
    var gg = pk > 0.92 ? 0.92 / pk : 1;
    var gDrive = gg * 1.02;
    var mono = new Float32Array(total);
    if (legacySound) {
      for (var i9L = 0; i9L < total; i9L++) {
        left[i9L] = Math.tanh(left[i9L] * gDrive) * 0.97;
        right[i9L] = Math.tanh(right[i9L] * gDrive) * 0.97;
        mono[i9L] = (left[i9L] + right[i9L]) * 0.5;
      }
    } else {
      for (var i9 = 0; i9 < total; i9++) {
        var lv = left[i9], rv = right[i9];
        if (lv === 0 && rv === 0) continue;
        var xl = lv * gDrive, xl2 = xl * xl;
        var yl = xl * (945 + (105 + xl2) * xl2) / (945 + (420 + 15 * xl2) * xl2) * 0.97;
        left[i9] = yl;
        if (lv === rv) {
          right[i9] = yl;
          mono[i9] = yl;
        } else {
          var xr = rv * gDrive, xr2 = xr * xr;
          var yr = xr * (945 + (105 + xr2) * xr2) / (945 + (420 + 15 * xr2) * xr2) * 0.97;
          right[i9] = yr;
          mono[i9] = (yl + yr) * 0.5;
        }
      }
    }
    return { pcm: mono, channels: [left, right], sr: SR };
  }

  NSG.DSP.runAccompSpace = function (effect, bufL, bufR, sr, spaceName, spb0) {
    var profile = ACCOMP_SPACE_PROFILES[spaceName];
    if (profile && bufL && bufR && bufL.length) {
      if (!(NSG.VOCAL_WASM && NSG.VOCAL_WASM.runAccompSpace && NSG.VOCAL_WASM.runAccompSpace(effect, bufL, bufR, sr, profile, spb0))) {
        runAccompSpaceEffect(effect, bufL, bufR, bufL, bufR, sr, profile, spb0);
      }
    }
    return { effect: effect, left: bufL, right: bufR };
  };

  NSG.DSP.finalizeAccomp = function (left, right, sr, spaceName, legacySound) {
    var profile = (!legacySound && spaceName) ? ACCOMP_SPACE_PROFILES[spaceName] || null : null;
    var wasmRes = NSG.VOCAL_WASM && NSG.VOCAL_WASM.finalizeAccomp && NSG.VOCAL_WASM.finalizeAccomp(left, right, sr, profile, !!legacySound);
    if (wasmRes) return wasmRes;
    return finalizeAccompMix(left, right, sr, profile, !!legacySound);
  };

  NSG.DSP.renderAccomp = function (score, opt) {
    opt = opt || {};
    var legacySound = opt.legacySound !== undefined ? !!opt.legacySound : !!NSG.LEGACY_SOUND;
    var SR = Number.isFinite(opt.sampleRate) ? Math.max(8000, Math.min(192000, Math.round(opt.sampleRate))) : 48000;
    var tm = NSG.TEMPO.map(score);
    var tracks = (score && score.tracks) || [];
    var trk = null;
    for (var i = 0; i < tracks.length; i++) if (tracks[i].type === 'inst') { trk = tracks[i]; break; }
    if (!trk || !Array.isArray(trk.notes)) return null;
    var notes = trk.notes.slice().sort(function (a, b) { return a.start - b.start; });
    if (!notes.length) return null;
    // Closed/pedal hats choke preceding open hats; use absolute tempo-mapped time.
    var nextClosedHat = [], closedHatTime = Infinity;
    for (var hi = notes.length - 1; hi >= 0; hi--) {
      nextClosedHat[hi] = closedHatTime;
      if (notes[hi].inst === 'hat' || (notes[hi].inst === 'drumkit' && DRUM_BY_NOTE[Math.round(notes[hi].pitch)] === 'hat')) {
        closedHatTime = tm.secOf(notes[hi].start);
      }
    }
    var end = 0;
    notes.forEach(function (n) { end = Math.max(end, tm.secOf(n.start + n.dur)); });
    var SPACE_PROFILES = ACCOMP_SPACE_PROFILES;
    var reqSpace = opt.space !== undefined ? opt.space : (trk.space || 'off');
    var spaceName = (!legacySound && typeof reqSpace === 'string' && SPACE_PROFILES[reqSpace]) ? reqSpace : null;
    var spaceProfile = spaceName ? SPACE_PROFILES[spaceName] : null;
    var tailPad = spaceProfile ? 0.9 + spaceProfile.tailSec : 0.9;
    var total = Math.ceil(end * SR) + Math.round(SR * tailPad);
    var noteRange = Array.isArray(opt.noteRange) && opt.noteRange.length === 2 ? opt.noteRange : null;
    var noteStart = noteRange ? Math.max(0, Math.min(notes.length, noteRange[0] | 0)) : 0;
    var noteEnd = noteRange ? Math.max(noteStart, Math.min(notes.length, noteRange[1] | 0)) : notes.length;
    var bufOffset = 0, bufLen = total;
    if (noteRange) {
      var minS = total, maxS = 0, eqPad = (EQ_L - 1) >> 1;
      for (var rn = noteStart; rn < noteEnd; rn++) {
        var rNote = notes[rn];
        var rStart = Math.round(tm.secOf(rNote.start) * SR);
        if (rStart >= total) continue;
        var rLen = Math.max(24, Math.round((tm.secOf(rNote.start + rNote.dur) - tm.secOf(rNote.start)) * SR));
        var rGate = Number.isFinite(rNote.harmonyEnd) ? Math.max(0, Math.round(tm.secOf(rNote.harmonyEnd) * SR) - rStart) : Infinity;
        if (!rGate) continue;
        rLen = Math.min(rLen, rGate);
        var rMax = Math.min(total - rStart, rLen + Math.ceil(SR * 1.4) + eqPad);
        if (rStart < minS) minS = rStart;
        if (rStart + rMax > maxS) maxS = rStart + rMax;
      }
      if (minS < maxS) { bufOffset = minS; bufLen = maxS - minS; }
      else { bufOffset = 0; bufLen = 0; }
    }
    function sendFor(orig, knd, nt) {
      if (/^chip/.test(knd) || knd === 'bass' || knd === 'tuba' || knd === 'kick') return null;
      var rp = Math.round(nt.pitch);
      if (knd === 'snare' || knd === 'rim' || knd === 'clap') return { h: spaceProfile.snareHall, p: 0.32, d: 0, c: 0 };
      if (knd === 'tom') return { h: 0.16, p: 0.24, d: 0, c: 0 };
      if (knd === 'crash' || knd === 'ride' || knd === 'openhat') return { h: 0.24, p: 0.22, d: 0, c: 0 };
      if (knd === 'hat') return { h: 0.04, p: 0.10, d: 0, c: 0 };
      if (knd === 'perc') return (rp === 84 || rp === 55 || rp === 81) ? { h: 0.42, p: 0.25, d: 0.18, c: 0 } : { h: 0.06, p: 0.12, d: 0, c: 0 };
      if (orig === 'epBell' || orig === 'celesta' || orig === 'musicBox' || orig === 'vibraphone') return { h: 0.40, p: 0.22, d: 0.32, c: 0.18 };
      if (nt.role === 'fill' || nt.arrangePart === 'fill' || nt.role === 'instrumentalLead' || nt.role === 'melodySample') return { h: 0.36, p: 0.20, d: 0.28, c: 0.15 };
      if (knd === 'strings') {
        var soloStr = orig === 'stringsCello' || orig === 'erhuSynth';
        return { h: soloStr ? 0.36 : 0.48, p: 0.24, d: orig === 'erhuSynth' ? 0.18 : 0, c: soloStr ? 0.12 : 0.32 };
      }
      if (knd === 'pad' || knd === 'choir') return { h: 0.52, p: 0.20, d: 0, c: 0.36 };
      if (knd === 'ep') return { h: 0.28, p: 0.24, d: 0.12, c: 0.28 };
      if (knd === 'piano') return { h: 0.24, p: 0.28, d: 0, c: 0.08 };
      if (knd === 'string') {
        if (orig === 'harp' || orig === 'pluck') return { h: 0.40, p: 0.24, d: 0.22, c: 0.14 };
        if (orig === 'guitarClean' || orig === 'guitarChorus') return { h: 0.28, p: 0.22, d: 0.22, c: 0.22 };
        return { h: 0.18, p: 0.26, d: 0.06, c: 0.08 };
      }
      if (knd === 'woodwind') return { h: 0.34, p: 0.22, d: 0.18, c: 0 };
      if (knd === 'brass' || knd === 'organ' || knd === 'accordion') return { h: 0.24, p: 0.24, d: 0, c: 0.12 };
      return { h: 0.26, p: 0.22, d: 0.16, c: 0.16 };
    }
    var pans = { bass: 0, kick: 0, snare: 0, pad: -0.25, strings: 0.25, ep: -0.3,
      guitar: 0.35, arp: -0.4, pluck: -0.35, organ: 0.2, brass: 0.15, piano: 0.05, accordion: 0.2, tuba: 0, lead: 0.12,
      hat: -0.35, openhat: -0.35, ride: 0.4, crash: -0.45, tom: 0.25, perc: 0.45,
      chipPWM: 0.25, chipSaw: 0.2, chipTable: 0.3, chipHybrid: 0, chipPulse12: -0.25, chipPulse25: -0.2, chipPulse50: 0.2, chipPulse75: 0.25, chipPulse87: -0.2,
      chipPulse: -0.25, chipTriangle: 0, chipArp: -0.15, chipNoise: 0.15, chipKick: 0, chipTom: 0.2 };

    // Fast path: Rust SIMD128 WebAssembly accompaniment synthesizer + in-WASM bus accumulation.
    var wasmSess = NSG.VOCAL_WASM && NSG.VOCAL_WASM.accompBegin ? NSG.VOCAL_WASM.accompBegin(bufLen) : null;
    if (wasmSess) {
      var wp = new Float64Array(64), wExtra = new Float64Array(64);
      var DRUM_ID = { kick: 0, snare: 1, tom: 2, rim: 3, clap: 4, hat: 5, openhat: 6, ride: 7, crash: 8, perc: 9 };
      var CHIP_ID = {
        chipNoise: 0, chipKick: 1, chipTom: 2, chipTriangle: 3, chipTable: 4,
        chipHybrid: 5, chipSaw: 6, chipPWM: 7, chipPulse12: 8, chipPulse25: 9,
        chipPulse50: 10, chipPulse: 10, chipPulse75: 11, chipPulse87: 12, chipArp: 13
      };
      var CHIP_DRUM_ID = { hat: 1, openhat: 2, rim: 3, crash: 4, ride: 4, perc: 5 };
      var defBass = NSG.Instruments.get('bass').sound;
      var defPad = NSG.Instruments.get('pad').sound;
      var defStrings = NSG.Instruments.get('strings').sound;
      var defEp = NSG.Instruments.get('ep').sound;
      var defGuitar = NSG.Instruments.get('guitar').sound;
      var defPluck = NSG.Instruments.get('pluck').sound;
      var maxPadSamples = Math.ceil(SR * 1.4);
      for (var wn = noteStart; wn < noteEnd; wn++) {
        var wNote = notes[wn];
        var wStartS = Math.round(tm.secOf(wNote.start) * SR);
        if (wStartS >= total) continue;
        var wLen = Math.max(24, Math.round((tm.secOf(wNote.start + wNote.dur) - tm.secOf(wNote.start)) * SR));
        var wGate = Number.isFinite(wNote.harmonyEnd) ? Math.max(0, Math.round(tm.secOf(wNote.harmonyEnd) * SR) - wStartS) : Infinity;
        if (!wGate) continue;
        wLen = Math.min(wLen, wGate);
        var wGateFade = Math.min(SR * 0.012, wGate);
        var wf = NSG.mtof(wNote.pitch);
        var wVel = (wNote.vel === undefined ? 90 : wNote.vel) / 127;
        var wOrig = wNote.inst || 'pad', wPreset = NSG.Instruments.get(wOrig);
        var wKind = wPreset && wPreset.family !== 'chip' ? wPreset.family : wOrig;
        if (wKind === 'drumkit') wKind = DRUM_BY_NOTE[Math.round(wNote.pitch)] || 'snare';
        var wMaxOut = Math.min(total - wStartS, wLen + maxPadSamples);
        if (wMaxOut <= 0) continue;

        var wHasEq = Array.isArray(wNote.noteEq) && (wNote.noteEq.length === 48 || wNote.noteEq.length === 64) && wNote.noteEq.every(Number.isFinite);
        var wPan = Number.isFinite(wNote.pan) ? Math.max(-1, Math.min(1, wNote.pan)) : wPreset && Number.isFinite(wPreset.pan) ? wPreset.pan : (pans[wOrig] || 0);
        var wLg = Math.cos((wPan + 1) * Math.PI / 4) * Math.SQRT2;
        var wRg = Math.sin((wPan + 1) * Math.PI / 4) * Math.SQRT2;
        var wHasGain = !!(wNote.gainPoints && wNote.gainPoints.length);
        var wSnd = spaceProfile ? sendFor(wOrig, wKind, wNote) : null;
        var wLocalStart = wStartS - bufOffset;
        var wConstGain = wHasGain ? 1 : (wNote.gain !== undefined ? NSG.TUNING.noteGain(wNote, 0) : 1);

        wp[0] = SR; wp[1] = wf; wp[2] = wVel; wp[3] = wLen;
        wp[4] = Number.isFinite(wGate) ? wGate : -1;
        wp[5] = wGateFade; wp[6] = wMaxOut;
        wp[7] = (0x1234 + (wn * 2654435761 % 2147483647)) >>> 0;
        wp[8] = legacySound ? 1 : 0;
        wp[9] = wLocalStart;
        wp[10] = wLg * wConstGain; wp[11] = wRg * wConstGain;
        wp[12] = wSnd ? wSnd.h : 0; wp[13] = wSnd ? wSnd.p : 0;
        wp[14] = wSnd ? wSnd.d : 0; wp[15] = wSnd ? wSnd.c : 0;

        var vId = 0, pCnt = 16, eCnt = 0, ps;
        if (wKind.charCodeAt(0) === 99 && wKind.indexOf('chip') === 0) {
          vId = 18;
          wp[16] = CHIP_ID[wKind] !== undefined ? CHIP_ID[wKind] : 10;
          wp[17] = wStartS; wp[18] = wn;
          wp[19] = CHIP_DRUM_ID[wNote.chipDrum || 'snare'] || 0;
          wp[20] = (wKind === 'chipPWM' && (wNote.role === 'melodySample' || wNote.role === 'instrumentalLead')) ? 1 : 0;
          wp[21] = NSG.mtof(wNote.pitch - 9);
          var cTones = Array.isArray(wNote.chipTones) && wNote.chipTones.length ? wNote.chipTones.filter(Number.isFinite).slice(0, 4) : [wNote.pitch];
          if (!cTones.length) cTones = [wNote.pitch];
          wp[22] = cTones.length;
          for (var ct = 0; ct < cTones.length; ct++) wp[23 + ct] = NSG.mtof(cTones[ct]);
          pCnt = 27;
        } else if (wKind === 'piano') {
          vId = 1; ps = (wPreset && wPreset.sound) || {};
          wp[16] = ps.tauScale || 1;
          wp[17] = ps.brightBase !== undefined ? ps.brightBase : 0.48;
          wp[18] = ps.brightVel !== undefined ? ps.brightVel : 0.36;
          wp[19] = ps.warmth || 0;
          wp[20] = ps.hammer !== undefined ? ps.hammer : 0.18;
          wp[21] = ps.gain || 0.2;
          pCnt = 22;
        } else if (wKind === 'pad') {
          vId = 2; ps = (wPreset && wPreset.sound) || defPad;
          wp[16] = ps.attack; wp[17] = ps.release; wp[18] = ps.cutoff;
          wp[19] = ps.sub || 0; wp[20] = ps.air || 0; wp[21] = ps.glass || 0; wp[22] = ps.gain;
          pCnt = 23;
        } else if (wKind === 'string') {
          vId = 3; ps = (wPreset && wPreset.sound) || (wOrig === 'pluck' ? defPluck : defGuitar);
          wp[16] = ps.excite; wp[17] = ps.velocityExcite; wp[18] = ps.pick;
          wp[19] = ps.tau; wp[20] = ps.reference; wp[21] = ps.release;
          wp[22] = ps.body; wp[23] = ps.cutoff; wp[24] = ps.bodyGain;
          wp[25] = ps.pickup || 0; wp[26] = ps.overtone || 0;
          wp[27] = ps.drive || 0; wp[28] = ps.cabinet || 0;
          wp[29] = ps.octaveString || 0; wp[30] = ps.chorus || 0; wp[31] = ps.gain;
          pCnt = 32;
        } else if (wKind === 'bass') {
          vId = 4; ps = (wPreset && wPreset.sound) || defBass;
          wp[16] = ps.release; wp[17] = ps.tau || 0; wp[18] = ps.mwah || 0;
          wp[19] = ps.harmonic || 0; wp[20] = ps.noise || 0; wp[21] = ps.attack;
          wp[22] = ps.gain; wp[23] = ps.scoop || 0; wp[24] = ps.cutoff;
          wp[25] = ps.resonance || 1.2; wp[26] = ps.square || 0;
          pCnt = 27;
        } else if (wKind === 'strings') {
          vId = 5; ps = (wPreset && wPreset.sound) || defStrings;
          wp[16] = ps.voices || 5; wp[17] = ps.bodyHigh || 1100; wp[18] = ps.nasal || 0;
          wp[19] = ps.bodyLow || 430; wp[20] = ps.solo ? 1 : 0; wp[21] = ps.lush ? 1 : 0;
          wp[22] = ps.attack; wp[23] = ps.release; wp[24] = ps.gain;
          wp[25] = ps.vibDepth !== undefined ? ps.vibDepth : 0.0028;
          wp[26] = ps.scoop || 0; wp[27] = ps.swell || 0; wp[28] = ps.dark || 1; wp[29] = ps.octave || 0;
          pCnt = 30;
        } else if (wKind === 'ep') {
          vId = 6; ps = (wPreset && wPreset.sound) || defEp;
          wp[16] = ps.bell || 0; wp[17] = ps.release; wp[18] = ps.index;
          wp[19] = ps.velocityIndex; wp[20] = ps.gain; wp[21] = ps.bellDecay || 0.45;
          wp[22] = ps.ratio; wp[23] = ps.warmth || 0; wp[24] = ps.reed ? 1 : 0;
          pCnt = 25;
        } else if (wKind === 'mallet') {
          vId = 7; ps = wPreset.sound;
          var mNr = Math.min(32, ps.ratios.length);
          wp[16] = ps.tau; wp[17] = ps.gain; wp[18] = ps.softAttack || 0.0015;
          wp[19] = ps.tremolo || 0; wp[20] = mNr;
          for (var mi2 = 0; mi2 < mNr; mi2++) { wExtra[mi2] = ps.ratios[mi2]; wExtra[mNr + mi2] = ps.amplitudes[mi2]; }
          pCnt = 21; eCnt = mNr * 2;
        } else if (wKind === 'arp') {
          vId = 9;
        } else if (wKind === 'lead') {
          vId = 10;
        } else if (wKind === 'organ') {
          vId = 11;
        } else if (wKind === 'brass') {
          vId = 12;
        } else if (wKind === 'choir') {
          vId = 13; ps = (wPreset && wPreset.sound) || {};
          var cFmts = ps.formants || [700, 1250, 2600], cWts = ps.weights || [0.8, 0.4, 0.2];
          wp[16] = cFmts[0]; wp[17] = cFmts[1]; wp[18] = cFmts[2];
          wp[19] = cWts[0]; wp[20] = cWts[1]; wp[21] = cWts[2];
          wp[22] = ps.attack || 0.28; wp[23] = ps.release || 0.5;
          wp[24] = ps.gain || 0.12; wp[25] = ps.air || 0;
          pCnt = 26;
        } else if (wKind === 'woodwind') {
          vId = 14; ps = wPreset.sound;
          var wNh = Math.min(64, ps.harmonics.length);
          wp[16] = ps.attack; wp[17] = ps.release; wp[18] = ps.noise; wp[19] = ps.gain;
          wp[20] = ps.vibDepth !== undefined ? ps.vibDepth : 0.002;
          wp[21] = wNh;
          for (var wh = 0; wh < wNh; wh++) wExtra[wh] = ps.harmonics[wh];
          pCnt = 22; eCnt = wNh;
        } else if (wKind === 'accordion') {
          vId = 15;
        } else if (wKind === 'tuba') {
          vId = 16;
        } else if (wKind === 'electronic') {
          vId = 17; ps = wPreset.sound;
          wp[16] = ps.release; wp[17] = ps.cutoff; wp[18] = ps.attack; wp[19] = ps.decay; wp[20] = ps.sustain;
          wp[21] = ps.filterAttack || 0.004; wp[22] = ps.filterDecay; wp[23] = ps.filterSustain;
          wp[24] = ps.keytrack; wp[25] = ps.sweep; wp[26] = ps.motion; wp[27] = ps.rate;
          wp[28] = ps.randomRate || 0; wp[29] = ps.randomDepth || 0;
          wp[30] = ps.q; wp[31] = ps.pwm || 0; wp[32] = ps.serial ? 1 : 0; wp[33] = ps.gain;
          wp[34] = ps.formants ? 1 : 0; wp[35] = ps.formantEnvelope ? 1 : 0;
          if (ps.formants) {
            wp[36] = ps.formants[0][0]; wp[37] = ps.formants[0][1];
            wp[38] = ps.formants[1][0]; wp[39] = ps.formants[1][1];
          } else { wp[36] = wp[37] = wp[38] = wp[39] = 0; }
          var eNo = Math.min(3, ps.oscs.length);
          wp[40] = eNo;
          for (var eo = 0; eo < eNo; eo++) {
            var osc = ps.oscs[eo];
            wExtra[eo * 4] = osc.wave === 'sine' ? 1 : osc.wave === 'pulse' ? 2 : 0;
            wExtra[eo * 4 + 1] = osc.ratio;
            wExtra[eo * 4 + 2] = osc.cents;
            wExtra[eo * 4 + 3] = osc.gain;
          }
          pCnt = 41; eCnt = eNo * 4;
        } else {
          vId = 8;
          wp[16] = DRUM_ID[wKind] !== undefined ? DRUM_ID[wKind] : 10;
          wp[17] = wNote.pitch;
          var wChoke = nextClosedHat[wn] - tm.secOf(wNote.start);
          wp[18] = Number.isFinite(wChoke) ? wChoke : 1e15;
          pCnt = 19;
        }

        var wAutoMix = !wHasEq && !wHasGain;
        var wUsed = wasmSess.renderNote(vId, wp, pCnt, wExtra, eCnt, wAutoMix);
        if (!wAutoMix && wUsed > 0) {
          var wMixLen = wUsed;
          if (wHasEq) {
            wMixLen = Math.min(wMaxOut, wUsed + ((EQ_L - 1) >> 1));
            var sViewEq = wasmSess.scratchView(wMixLen);
            if (wMixLen > wUsed) sViewEq.fill(0, wUsed, wMixLen);
            var wEqScale = Number.isFinite(wNote.noteEqRoot) ? Math.pow(2, (wNote.pitch - wNote.noteEqRoot) / 12) : 1;
            NSG.DSP.applyOutEq(sViewEq.subarray(0, wMixLen), wNote.noteEq, SR, wEqScale);
          }
          if (wHasGain) {
            var sViewG = wasmSess.scratchView(wMixLen);
            var wSingleSeg = tm.count === 1, wBeat0 = tm.beatOf(wStartS / SR), wBeatStep = wSingleSeg ? (tm.segs[0].bpm / 60 / SR) : 0;
            var wGVal = 1;
            for (var ws = 0; ws < wMixLen; ws++) {
              if ((ws & 7) === 0) {
                wGVal = NSG.TUNING.noteGain(wNote, ((wSingleSeg ? wBeat0 + ws * wBeatStep : tm.beatOf((wStartS + ws) / SR)) - wNote.start) / wNote.dur);
              }
              sViewG[ws] *= wGVal;
            }
          }
          wasmSess.mixScratch(wLocalStart, wMixLen, wLg * wConstGain, wRg * wConstGain,
            wSnd ? wSnd.h : 0, wSnd ? wSnd.p : 0, wSnd ? wSnd.d : 0, wSnd ? wSnd.c : 0);
        }
      }
      if (noteRange) {
        return {
          offset: bufOffset, length: bufLen, total: total, sr: SR,
          spaceName: spaceName, spb0: tm.spbAt(0), legacySound: legacySound,
          left: wasmSess.readBus(0) || new Float32Array(bufLen),
          right: wasmSess.readBus(1) || new Float32Array(bufLen),
          hallL: wasmSess.readBus(3), hallR: wasmSess.readBus(4),
          plateL: wasmSess.readBus(5), plateR: wasmSess.readBus(6),
          delayL: wasmSess.readBus(7), delayR: wasmSess.readBus(8),
          chorusL: wasmSess.readBus(9), chorusR: wasmSess.readBus(10)
        };
      }
      return wasmSess.finishFull(SR, tm.spbAt(0), spaceProfile, legacySound);
    }

    var left = new Float32Array(bufLen), right = new Float32Array(bufLen);
    var hallL, hallR, plateL, plateR, delayL, delayR, chorusL, chorusR;
    var TWO_PI = Math.PI * 2;

    /* 每个音符用独立种子：渲染顺序不影响结果，重渲染听感一致 */
    function rndFor(i) { return mulberry32(0x1234 + i * 2654435761 % 2147483647); }

    function saw(ph) { return (ph - Math.floor(ph)) * 2 - 1; }
    function tri(ph) { return Math.abs(saw(ph)) * 2 - 1; }
    function blep(phase, step) {
      if (phase < step) { var x = phase / step; return x + x - x * x - 1; }
      if (phase > 1 - step) { var y = (phase - 1) / step; return y * y + y + y + 1; }
      return 0;
    }
    function pulse(phase, width, step) {
      return (phase < width ? 1 : -1) - (2 * width - 1) + blep(phase, step) - blep((phase - width + 1) % 1, step);
    }
    function polySaw(phase, step) { return phase * 2 - 1 - blep(phase, step); }
    /* 零延迟反馈状态变量滤波器（TPT SVF）：lp() 返回低通并留下带通 bp；
       系数按块更新，截止频率随包络扫动也稳定 */
    function makeSVF() {
      var ic1 = 0, ic2 = 0, a1 = 1, a2 = 0, a3 = 0, flt = { bp: 0 };
      flt.set = function (fc, q) {
        var g = Math.tan(Math.PI * Math.max(20, Math.min(fc, SR * 0.45)) / SR), k = 1 / q;
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
      };
      flt.lp = function (x) {
        var v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; flt.bp = v1;
        return v2;
      };
      return flt;
    }
    // Original drum voices: independent body, impact and wire/air envelopes.
    // One-shots ignore MIDI key length; every tail ends with a smooth taper.
    function voiceDrum(out, maxOut, kind, pitch, vel, rnd, choke) {
      var cymbal = /^(hat|openhat|ride|crash)$/.test(kind);
      var rPitch = Math.round(pitch);
      var duration = (kind === 'perc' && (rPitch === 55 || rPitch === 81 || rPitch === 84)) ? 0.82 :
        ({kick:0.42,snare:0.28,tom:0.48,rim:0.08,clap:0.22,hat:0.085,openhat:0.32,ride:0.72,crash:0.85,perc:0.13}[kind] || 0.13);
      var count = Math.min(maxOut, Math.ceil(duration * SR));
      var noiseFilter = makeSVF(), toneFilter = makeSVF(), phase = 0, phase2 = 0;
      var cutoff = (cymbal || (kind === 'perc' && rPitch === 55)) ? (kind === 'crash' || rPitch === 55 ? 7500 : 6500) : kind === 'kick' ? 1800 : kind === 'clap' ? 3300 : 4200;
      noiseFilter.set(Math.min(cutoff, SR * 0.36), 0.707);
      toneFilter.set(cymbal || (kind === 'perc' && rPitch === 55) ? 1400 : kind === 'clap' ? 650 : 450, 0.707);
      var metalFreq = [2137, 2873, 3593, 4217, 5279, 6343], metalPhases = [rnd(),rnd(),rnd(),rnd(),rnd(),rnd()];
      var base = kind === 'tom' ? Math.max(70, Math.min(260, 110 * Math.pow(2, (pitch - 43) / 24))) : 49;
      if (!legacySound && kind !== 'clap') {
        var invSr = 1 / SR, attDen = 1 / ((kind === 'crash' ? 0.003 : 0.0007) * SR), fadeDen = 1 / (SR * 0.012);
        var e1 = 1, d1 = 1, e2 = 1, d2 = 1, e3 = 1, d3 = 1, e4 = 1, d4 = 1;
        var mEnv = null, mDec = null, mStep = null, mCount = 0;
        var bellNotes = null;
        if (kind === 'kick') {
          d1 = Math.exp(-invSr / 0.016); d2 = Math.exp(-invSr / 0.09); d3 = Math.exp(-invSr / 0.004);
        } else if (kind === 'snare') {
          d1 = Math.exp(-invSr / 0.012); d2 = Math.exp(-invSr / 0.002); d3 = Math.exp(-invSr / (0.035 + 0.015 * vel));
          d4 = Math.exp(-invSr / 0.045); var e5 = 1, d5 = Math.exp(-invSr / 0.003);
        } else if (kind === 'tom') {
          d1 = Math.exp(-invSr / 0.022); d2 = Math.exp(-invSr / 0.045); d3 = Math.exp(-invSr / 0.11); d4 = Math.exp(-invSr / 0.006);
        } else if (kind === 'rim') {
          d1 = Math.exp(-invSr / 0.012); d2 = Math.exp(-invSr / 0.002);
        } else if (cymbal || (kind === 'perc' && (rPitch === 55 || rPitch === 81))) {
          var cDec = rPitch === 81 ? 0.24 : kind === 'hat' ? 0.018 : kind === 'openhat' ? 0.07 : kind === 'ride' ? 0.18 : 0.22;
          var freqs = rPitch === 81 ? [2420, 5670, 8140] : metalFreq;
          mEnv = new Float64Array(freqs.length); mDec = new Float64Array(freqs.length); mStep = new Float64Array(freqs.length);
          for (var mc = 0; mc < freqs.length; mc++) {
            var chz = freqs[mc] * (kind === 'ride' ? 0.74 : 1);
            if (chz > SR * 0.43) continue;
            mEnv[mCount] = rPitch === 81 ? (mc === 0 ? 0.55 : mc === 1 ? 0.28 : 0.14) : 1 / 6;
            mDec[mCount] = rPitch === 55 ? 1 : Math.exp(-invSr / (cDec * (1.2 - mc * 0.13)));
            mStep[mCount] = chz * invSr; metalPhases[mCount] = metalPhases[mc] || rnd(); mCount++;
          }
          d1 = Math.exp(-invSr / (cDec * 0.62)); d2 = Math.exp(-invSr / 0.11);
        } else if (kind === 'perc' && rPitch === 84) {
          bellNotes = [];
          for (var bk = 0; bk < 8; bk++) {
            var bf = 1950 * Math.pow(1.088, bk);
            if (bf > SR * 0.43) break;
            bellNotes.push({
              startI: Math.round(bk * 0.068 * SR),
              step1: bf * invSr,
              step2: bf * 2.756 < SR * 0.43 ? bf * 2.756 * invSr : 0,
              ph1: rnd(), ph2: rnd(),
              env: 0.072, dec: Math.exp(-invSr / 0.095)
            });
          }
        } else if (kind === 'perc' && rPitch === 54) {
          d1 = Math.exp(-invSr / 0.032); d2 = Math.exp(-invSr / 0.028);
        } else if (kind === 'perc' && rPitch === 56) {
          d1 = Math.exp(-invSr / 0.045); d2 = Math.exp(-invSr / 0.004);
        } else {
          d1 = Math.exp(-invSr / 0.022); d2 = Math.exp(-invSr / 0.009);
        }
        for (var fi = 0; fi < count; fi++) {
          var ft = fi * invSr, fNoise = noiseFilter.lp(rnd() * 2 - 1);
          var fBand = fNoise - toneFilter.lp(fNoise), fVal = 0;
          if (kind === 'kick') {
            phase += (base + 100 * e1) * invSr;
            fVal = sinT(phase) * e2 * 0.42 + fNoise * e3 * 0.045;
            e1 *= d1; e2 *= d2; e3 *= d3;
          } else if (kind === 'snare') {
            phase += (175 + 45 * e1) * invSr; phase2 += 315 * invSr;
            fVal = (sinT(phase) * 0.19 + sinT(phase2) * 0.085) * e4 + fBand * (1 - e2) * e3 * 0.24 + fNoise * e5 * 0.04;
            e1 *= d1; e2 *= d2; e3 *= d3; e4 *= d4; e5 *= d5;
          } else if (kind === 'tom') {
            phase += base * (1 + 0.28 * e1) * invSr;
            fVal = (sinT(phase) * 0.29 + sinT(phase * 1.59) * e2 * 0.07) * e3 + fNoise * e4 * 0.03;
            e1 *= d1; e2 *= d2; e3 *= d3; e4 *= d4;
          } else if (kind === 'rim') {
            fVal = (sinT(ft * 780) * 0.15 + sinT(ft * 1730) * 0.09) * e1 + fBand * e2 * 0.025;
            e1 *= d1; e2 *= d2;
          } else if (kind === 'perc' && rPitch === 55) {
            var swMetal = 0;
            for (var sw = 0; sw < mCount; sw++) {
              metalPhases[sw] += mStep[sw];
              swMetal += sinT(metalPhases[sw]) * mEnv[sw];
            }
            var swEnv = ft < 0.72 ? Math.pow(ft / 0.72, 2.3) : Math.max(0, 1 - (ft - 0.72) / 0.09);
            fVal = (swMetal * 0.09 + fBand * 0.105) * swEnv;
          } else if (kind === 'perc' && rPitch === 81) {
            var trMetal = 0;
            for (var tm2 = 0; tm2 < mCount; tm2++) {
              metalPhases[tm2] += mStep[tm2];
              trMetal += sinT(metalPhases[tm2]) * mEnv[tm2];
              mEnv[tm2] *= mDec[tm2];
            }
            fVal = trMetal * 0.105;
          } else if (kind === 'perc' && rPitch === 84) {
            var blSum = 0;
            for (var bi = 0; bi < bellNotes.length; bi++) {
              var bn = bellNotes[bi];
              if (fi < bn.startI) continue;
              bn.ph1 += bn.step1;
              var bv = sinT(bn.ph1);
              if (bn.step2) { bn.ph2 += bn.step2; bv += sinT(bn.ph2) * 0.34; }
              blSum += bv * bn.env * Math.min(1, (fi - bn.startI) / (SR * 0.0012));
              bn.env *= bn.dec;
            }
            fVal = blSum;
          } else if (cymbal) {
            var fMetal = 0;
            for (var fm = 0; fm < mCount; fm++) {
              metalPhases[fm] += mStep[fm];
              fMetal += sinT(metalPhases[fm]) * mEnv[fm];
              mEnv[fm] *= mDec[fm];
            }
            fVal = fMetal * (kind === 'ride' ? 0.12 : 0.065) + fBand * e1 * (kind === 'crash' ? 0.12 : 0.075);
            if (kind === 'ride') fVal += sinT(ft * 1370) * e2 * 0.022;
            if (kind === 'openhat' && Number.isFinite(choke)) fVal *= Math.max(0, Math.min(1, (choke + 0.009 - ft) / 0.009));
            e1 *= d1; e2 *= d2;
          } else if (kind === 'perc' && rPitch === 54) {
            fVal = fBand * e1 * 0.11 + (sinT(ft * 4280) + sinT(ft * 5910) * 0.7) * e2 * 0.022;
            e1 *= d1; e2 *= d2;
          } else if (kind === 'perc' && rPitch === 56) {
            fVal = (sinT(ft * 560) + sinT(ft * 845) * 0.75) * e1 * 0.085 + fBand * e2 * 0.03;
            e1 *= d1; e2 *= d2;
          } else {
            fVal = fBand * e1 * 0.10 + sinT(ft * 3100) * e2 * 0.016;
            e1 *= d1; e2 *= d2;
          }
          var fAtt = fi * attDen; if (fAtt > 1) fAtt = 1;
          var fFade = (count - 1 - fi) * fadeDen; if (fFade > 1) fFade = 1;
          out[fi] = fVal * fAtt * fFade * vel;
        }
        return count;
      }
      for (var i = 0; i < count; i++) {
        var t = i / SR, noise = noiseFilter.lp(rnd() * 2 - 1);
        var bandNoise = noise - toneFilter.lp(noise), value = 0;
        if (kind === 'kick') {
          phase += (base + 100 * Math.exp(-t / 0.016)) / SR;
          value = sinT(phase) * Math.exp(-t / 0.09) * 0.42 + noise * Math.exp(-t / 0.004) * 0.045;
        } else if (kind === 'snare') {
          phase += (175 + 45 * Math.exp(-t / 0.012)) / SR; phase2 += 315 / SR;
          var wire = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / (0.035 + 0.015 * vel));
          value = (sinT(phase) * 0.19 + sinT(phase2) * 0.085) * Math.exp(-t / 0.045) +
            bandNoise * wire * 0.24 + noise * Math.exp(-t / 0.003) * 0.04;
        } else if (kind === 'tom') {
          phase += base * (1 + 0.28 * Math.exp(-t / 0.022)) / SR;
          value = (sinT(phase) * 0.29 + sinT(phase * 1.59) * Math.exp(-t / 0.045) * 0.07) * Math.exp(-t / 0.11) +
            noise * Math.exp(-t / 0.006) * 0.03;
        } else if (kind === 'rim') {
          value = (sinT(t * 780) * 0.15 + sinT(t * 1730) * 0.09) * Math.exp(-t / 0.012) + bandNoise * Math.exp(-t / 0.002) * 0.025;
        } else if (kind === 'clap') {
          var bursts = 0;
          for (var b = 0; b < 3; b++) {
            var dt = t - b * 0.009;
            if (dt >= 0) bursts += (1 - Math.exp(-dt / 0.0007)) * Math.exp(-dt / 0.0035);
          }
          var tailTime = Math.max(0, t - 0.018);
          value = bandNoise * (bursts * 0.42 + (t > 0.018 ? (1 - Math.exp(-tailTime / 0.002)) * Math.exp(-tailTime / 0.027) * 0.19 : 0));
        } else if (cymbal) {
          var decay = kind === 'hat' ? 0.018 : kind === 'openhat' ? 0.07 : kind === 'ride' ? 0.18 : 0.22;
          // Upper metal modes fade faster: the tail becomes darker, not just quieter.
          var metal = 0;
          for (var m = 0; m < metalFreq.length; m++) {
            var hz = metalFreq[m] * (kind === 'ride' ? 0.74 : 1);
            if (hz > SR * 0.43) continue;
            metalPhases[m] += hz / SR;
            metal += sinT(metalPhases[m]) * Math.exp(-t / (decay * (1.2 - m * 0.13))) / 6;
          }
          var air = bandNoise * Math.exp(-t / (decay * 0.62));
          value = (metal * (kind === 'ride' ? 0.12 : 0.065) + air * (kind === 'crash' ? 0.12 : 0.075));
          if (kind === 'ride') value += sinT(t * 1370) * Math.exp(-t / 0.11) * 0.022;
          if (kind === 'openhat' && Number.isFinite(choke)) value *= Math.max(0, Math.min(1, (choke + 0.009 - t) / 0.009));
        } else if (kind === 'perc' && Math.round(pitch) === 54) {
          value = bandNoise * Math.exp(-t / 0.032) * 0.11 + (sinT(t * 4280) + sinT(t * 5910) * 0.7) * Math.exp(-t / 0.028) * 0.022;
        } else if (kind === 'perc' && Math.round(pitch) === 56) {
          value = (sinT(t * 560) + sinT(t * 845) * 0.75) * Math.exp(-t / 0.045) * 0.085 + bandNoise * Math.exp(-t / 0.004) * 0.03;
        } else {
          value = bandNoise * Math.exp(-t / 0.022) * 0.10 + sinT(t * 3100) * Math.exp(-t / 0.009) * 0.016;
        }
        var attack = Math.min(1, t / (kind === 'crash' ? 0.003 : 0.0007));
        var fade = Math.min(1, (count - 1 - i) / (SR * 0.012));
        out[i] = value * attack * fade * vel;
      }
      return count;
    }

    // Legacy gains for the voices whose synthesis remains unchanged.
    var G = { arp: 0.068, organ: 0.05, brass: 0.072 };
    // 每个音色单独成函数：V8 能为各自的循环分别优化，不会因为一个巨型函数而整体退化。
    /* 电贝斯：带限锯齿过低通（拨弦时张开、随即收拢）+ 正弦基音，音头带一点指弹声 */
    function voiceBass(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || NSG.Instruments.get('bass').sound;
      var i2, t, e, ph = 0;
      var bF = makeSVF(), bRel = SR * p.release, bLen = Math.min(len + bRel, gate, maxOut) | 0, bNoise = 0;
      var bTau = p.tau ? Math.max(0.45, Math.min(4, p.tau * Math.pow(98 / f, 0.35))) : 0;
      var bMwah = p.mwah ? makeSVF() : null;
      if (bMwah) bMwah.set(Math.min(1400, f * 4.5 + 320), 2.8);
      if (!legacySound) {
        var bStep = f / SR, bHarmOn = !!(p.harmonic && f * 2 < SR * 0.45);
        var eHarm = p.harmonic * vel, dHarm = Math.exp(-1 / (SR * 0.045));
        var eEnv = 1, dEnv = Math.exp(-1 / (SR * (bTau || 0.3)));
        var eScoopB = 1, dScoopB = Math.exp(-1 / (SR * 0.032));
        var eNoise = p.noise, dNoise = Math.exp(-1 / (SR * 0.003)), cNoise = 1 - Math.exp(-TWO_PI * 1800 / SR);
        var attInv = 1 / (SR * p.attack), noiseEnd = SR * 0.012, finB = Number.isFinite(gate), gB = vel * p.gain;
        for (i2 = 0; i2 < bLen; i2++) {
          var stepNow = p.scoop ? bStep * (1 + p.scoop * eScoopB) : bStep;
          ph += stepNow; if (ph >= 1) ph -= 1;
          if ((i2 & 15) === 0) bF.set(f * 1.8 + (250 + p.cutoff * vel) * Math.exp(-(i2 / SR) / 0.07), p.resonance || 1.2);
          var bWave0 = polySaw(ph, stepNow) + (p.square ? pulse(ph, 0.35, stepNow) * p.square : 0);
          var bX0 = bF.lp(bWave0) * 0.62 + sinT(ph) * 0.5;
          if (bMwah) { bMwah.lp(bWave0); bX0 += bMwah.bp * p.mwah * (1 - eScoopB) * 0.55; }
          if (bHarmOn) { bX0 += sinT(ph * 2) * eHarm; eHarm *= dHarm; }
          if (i2 < noiseEnd) { var bN0 = rnd() * 2 - 1; bNoise += (bN0 - bNoise) * cNoise; bX0 += (bN0 - bNoise) * eNoise; eNoise *= dNoise; }
          var attB = i2 * attInv; if (attB > 1) attB = 1;
          e = attB * (bTau ? eEnv : 0.72 + 0.28 * eEnv);
          eEnv *= dEnv; eScoopB *= dScoopB;
          if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / bRel);
          if (finB) e *= Math.min(1, (gate - i2) / gateFade);
          out[i2] = bX0 * e * gB;
        }
        return bLen;
      }
      for (i2 = 0; i2 < bLen; i2++) {
        t = i2 / SR;
        var scoopL = p.scoop ? 1 + p.scoop * Math.exp(-t / 0.032) : 1;
        var bStepL = f * scoopL / SR; ph += bStepL; if (ph >= 1) ph -= 1;
        if ((i2 & 15) === 0) bF.set(f * 1.8 + (250 + p.cutoff * vel) * Math.exp(-t / 0.07), p.resonance || 1.2);
        var bWave = polySaw(ph, bStepL) + (p.square ? pulse(ph, 0.35, bStepL) * p.square : 0);
        var bX = bF.lp(bWave) * 0.62 + sinT(ph) * 0.5;
        if (bMwah) { bMwah.lp(bWave); bX += bMwah.bp * p.mwah * (1 - Math.exp(-t / 0.032)) * 0.55; }
        if (p.harmonic && f * 2 < SR * 0.45) bX += sinT(ph * 2) * p.harmonic * vel * Math.exp(-t / 0.045);
        if (i2 < SR * 0.012) { var bN = rnd() * 2 - 1; bNoise += (bN - bNoise) * (1 - Math.exp(-TWO_PI * 1800 / SR)); bX += (bN - bNoise) * p.noise * Math.exp(-t / 0.003); }
        e = Math.min(1, i2 / (SR * p.attack)) * (bTau ? Math.exp(-t / bTau) : 0.72 + 0.28 * Math.exp(-t / 0.3));
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / bRel);
        if (Number.isFinite(gate)) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = bX * e * vel * p.gain;
      }
      return bLen;
    }
    /* 暖铺底：三支微失谐带限锯齿 + 低八度方波，低通缓慢呼吸，起音和释放都很慢 */
    function voicePad(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || NSG.Instruments.get('pad').sound;
      var p0 = rnd(), p1 = rnd(), p2 = rnd(), pSub = 0, pF = makeSVF(), fin = Number.isFinite(gate);
      var s0 = f / SR, s1 = f * 1.0041 / SR, s2 = f * 0.9959 / SR, sSub = f * 0.5 / SR;
      var pAtt = SR * p.attack, pRel = SR * p.release, pLen = Math.min(len + pRel, gate, maxOut) | 0, pAirLP = 0;
      var pCut = Math.min(2600, f * 2.6 + 250) * (0.8 + 0.3 * vel) * p.cutoff, pLfo = rnd(), g = vel * p.gain;
      var cAir = p.air ? (1 - Math.exp(-TWO_PI * 2000 / SR)) : 0;
      var glass2 = p.glass && f * 2 < SR * 0.44, glass3 = p.glass && f * 3 < SR * 0.44;
      for (var i2 = 0; i2 < pLen; i2++) {
        if ((i2 & 31) === 0) pF.set(pCut * (1 + 0.22 * sinT(0.21 * i2 / SR + pLfo)) * (0.6 + 0.4 * Math.min(1, i2 / pAtt)), 0.85);
        p0 += s0; if (p0 >= 1) p0 -= 1;
        p1 += s1; if (p1 >= 1) p1 -= 1;
        p2 += s2; if (p2 >= 1) p2 -= 1;
        pSub += sSub; if (pSub >= 1) pSub -= 1;
        var pX = (polySaw(p0, s0) + polySaw(p1, s1) + polySaw(p2, s2)) * 0.2667 + pulse(pSub, 0.5, sSub) * p.sub;
        if (p.air) { var air = rnd() * 2 - 1; pAirLP += (air - pAirLP) * cAir; pX += (air - pAirLP) * p.air; }
        var e = i2 < pAtt ? i2 / pAtt : 1;
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / pRel);
        if (fin) e *= Math.min(1, (gate - i2) / gateFade);
        var pOut = pF.lp(pX);
        if (p.glass) {
          var gEnv = Math.min(1, i2 / (pAtt * 1.35)) * (0.7 + 0.3 * sinT(0.35 * i2 / SR + pLfo));
          var gWave = (glass2 ? sinT(p0 * 2) * 0.65 : 0) + (glass3 ? sinT(p1 * 3) * 0.35 : 0);
          pOut += gWave * p.glass * gEnv;
        }
        out[i2] = pOut * e * g;
      }
      return pLen;
    }
    /* 弦乐组：多支锯齿各带延迟颤音（相位错开就是合奏感），弓毛噪声只在起音，
       低通随起弓张开，再用带通托出琴身共鸣；支持独奏（大提琴/胡琴）与宽银幕合奏 */
    function voiceStrings(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || NSG.Instruments.get('strings').sound;
      var i2, t, e, d;
      var sDet = p.voices === 7 ? [1, 1.0036, 0.9964, 1.0017, 0.9983, 1.0058, 0.9942] :
        p.voices === 2 ? [1, 1.0018] : [1, 1.0036, 0.9964, 1.0017, 0.9983];
      var nv = sDet.length, sPh = [], sVib = [], sStep = new Float64Array(nv);
      for (d = 0; d < nv; d++) { sPh.push(rnd()); sVib.push(rnd()); }
      var sF = makeSVF(), sBody = makeSVF(), sLowBody = makeSVF(), sAirBody = p.lush ? makeSVF() : null, sHp = 0;
      sBody.set(p.bodyHigh || 1100, p.nasal ? 2.1 : 1.4);
      sLowBody.set(p.bodyLow || 430, p.solo ? 1.5 : 1.15);
      if (sAirBody) sAirBody.set(2200, 1.2);
      var octPh = 0, octStep = f * 0.5 / SR;
      var sAtt = SR * p.attack * (1.2 - 0.3 * vel), sRel = SR * p.release, sLen = Math.min(len + sRel, gate, maxOut) | 0;
      var cHp = 1 - Math.exp(-TWO_PI * 2700 / SR), finS = Number.isFinite(gate), gS = vel * p.gain;
      var vibTarget = p.vibDepth !== undefined ? p.vibDepth : 0.0028;
      var eScoopS = 1, dScoopS = Math.exp(-1 / (SR * 0.045));
      for (i2 = 0; i2 < sLen; i2++) {
        t = i2 / SR;
        var sA = Math.min(1, i2 / sAtt), vibD = vibTarget * Math.min(1, Math.max(0, t - (p.solo ? 0.14 : 0.22)) / 0.35);
        var scoopFactor = p.scoop ? (1 + p.scoop * eScoopS) : 1;
        if ((i2 & 31) === 0) {
          var swellBright = p.swell ? 1 + p.swell * Math.sin(Math.PI * Math.min(1, i2 / Math.max(1, len))) : 1;
          sF.set(Math.min(7500, f * (1.7 + (1.1 + 2.5 * vel) * sA) + 380 + 400 * vel) * (p.dark || 1) * swellBright, p.solo ? 0.85 : 0.7);
          for (d = 0; d < nv; d++) sStep[d] = f * scoopFactor * sDet[d] * (1 + vibD * sinT((5.1 + d * 0.23) * t + sVib[d])) / SR;
        }
        var sX = 0;
        for (d = 0; d < nv; d++) {
          sPh[d] += sStep[d]; if (sPh[d] >= 1) sPh[d] -= 1;
          sX += polySaw(sPh[d], sStep[d]);
        }
        sX /= nv;
        if (p.octave) { octPh += octStep; if (octPh >= 1) octPh -= 1; sX += sinT(octPh) * p.octave; }
        var sN = rnd() * 2 - 1; sHp += (sN - sHp) * cHp;
        sX += (sN - sHp) * (0.06 + 0.1 * vel) * (1 - sA);
        var sY = sF.lp(sX);
        sBody.lp(sY); sY += sBody.bp * (p.nasal || 0.45);
        sLowBody.lp(sY); sY += sLowBody.bp * (p.solo ? 0.32 : 0.16);
        if (sAirBody) { sAirBody.lp(sY); sY += sAirBody.bp * 0.18; }
        e = sA * sA * (3 - 2 * sA);
        if (p.swell) e *= 0.82 + 0.28 * Math.sin(Math.PI * Math.min(1, i2 / Math.max(1, len)));
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / sRel);
        if (finS) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = sY * e * gS;
        eScoopS *= dScoopS;
      }
      return sLen;
    }
    /* 电钢：FM（调制指数随力度、快速衰减）+ 音叉齿音 / 水晶铃音，轻微颤音（tremolo），
       低音区衰减更慢；松键后制音 */
    function voiceEP(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || NSG.Instruments.get('ep').sound;
      var eTau = Math.max(0.5, Math.min(2.6, (p.bell ? 1.45 : 1.1) * Math.pow(261.6 / f, 0.45))), eRel = SR * p.release, fin = Number.isFinite(gate);
      var eLen = Math.min(len + eRel, gate, maxOut) | 0, eI0 = p.index + p.velocityIndex * vel, g = vel * p.gain;
      var s1 = f / SR, s14 = f * 14 / SR, tineOn = f * 14 < SR * 0.45, ph = 0, ph2 = 0;
      var sBell7 = f * 7.01 / SR, bell7On = !!(p.bell && f * 7.01 < SR * 0.45), phBell = 0;
      // 指数衰减用逐样本乘法递推，省掉每样本的 Math.exp
      var amp = 1, dAmp = Math.exp(-1 / (SR * eTau)), idx = eI0, dIdx = Math.exp(-1 / (SR * 0.12));
      var tine = 0.07 * vel, dTine = Math.exp(-1 / (SR * 0.02));
      var eBell = (p.bell || 0) * (0.65 + 0.55 * vel), dBell = Math.exp(-1 / (SR * (p.bellDecay || 0.45)));
      for (var i2 = 0; i2 < eLen; i2++) {
        ph += s1; if (ph >= 1) ph -= 1;
        ph2 += s14; if (ph2 >= 1) ph2 -= 1;
        if (bell7On) { phBell += sBell7; if (phBell >= 1) phBell -= 1; }
        var e = Math.min(1, i2 / (SR * 0.003)) * amp * (0.95 - 0.05 * sinT(4.6 * i2 / SR));
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / eRel);
        if (fin) e *= Math.min(1, (gate - i2) / gateFade);
        var eMod = sinT(ph * p.ratio) * (idx + 0.3);
        var eWave = sinT(ph + eMod / TWO_PI) + (tineOn ? sinT(ph2) * tine : 0);
        if (p.warmth) eWave += sinT(ph * 2) * p.warmth * amp;
        if (p.bell) eWave += (sinT(ph * 3) * 0.55 + (bell7On ? sinT(phBell) * 0.45 : 0)) * eBell;
        if (p.reed) eWave = eWave * 0.85 + (eWave / Math.sqrt(1 + eWave * eWave * vel * 1.8)) * 0.35;
        out[i2] = eWave * e * g;
        amp *= dAmp; idx *= dIdx; tine *= dTine; eBell *= dBell;
      }
      return eLen;
    }
    /* 合成器拨音：锯齿 + 微失谐方波过谐振低通，截止频率快速下滑 */
    function voiceSynthPluck(out, maxOut, f, vel, len, gate, gateFade, rnd) {
      var i2, t, e, ph = 0, ph2 = rnd();
      var aF = makeSVF(), aRel = SR * 0.04, aLen = Math.min(len + aRel, gate, maxOut) | 0;
      var aS = f / SR, aS2 = f * 1.006 / SR, eEnv = 1, dEnv = Math.exp(-1 / (SR * 0.28)), finA = Number.isFinite(gate), gA = vel * G.arp;
      for (i2 = 0; i2 < aLen; i2++) {
        t = i2 / SR;
        ph += aS; if (ph >= 1) ph -= 1; ph2 += aS2; if (ph2 >= 1) ph2 -= 1;
        if ((i2 & 15) === 0) aF.set(Math.min(9000, f * 1.3 + (1500 + 5500 * vel) * Math.exp(-t / 0.055)), 2.4);
        var aX = aF.lp(polySaw(ph, aS) * 0.6 + pulse(ph2, 0.5, aS2) * 0.4);
        e = Math.min(1, i2 / (SR * 0.002)) * (legacySound ? Math.exp(-t / 0.28) : eEnv);
        eEnv *= dEnv;
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / aRel);
        if (finA) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = aX * e * gA;
      }
      return aLen;
    }
    /* Karplus-Strong 拨弦，分数延时（全通）校准音高，拨弦位置梳状滤波决定音色。
       吉他：偏暗、衰减较快，加琴箱共鸣；
       拨弦（古筝 / 竖琴式）：激励更亮、余音更长、音头带一点泛音「叮」声 */
    function voiceString(out, maxOut, f, vel, len, gate, gateFade, rnd, kind, p) {
      p = p || NSG.Instruments.get(kind === 'pluck' ? 'pluck' : 'guitar').sound;
      var i2, e, ph = 0, j;
      var kPer = SR / f, kN = Math.max(2, Math.floor(kPer - 0.5)), kFr = kPer - 0.5 - kN;
      if (kFr < 0.15 && kN > 2) { kN--; kFr += 1; }
      var kC = (1 - kFr) / (1 + kFr), kBuf = new Float32Array(kN), kEx = new Float32Array(kN);
      var kLp = 0, kCoef = p.excite + p.velocityExcite * vel;
      for (j = 0; j < kN; j++) { kLp += ((rnd() * 2 - 1) - kLp) * kCoef; kEx[j] = kLp; }
      var kPick = Math.max(1, Math.round(kN * p.pick));
      for (j = 0; j < kN; j++) kBuf[j] = kEx[j] - kEx[(j + kPick) % kN] * 0.9;
      var kTau = Math.max(0.08, Math.min(4, p.tau * Math.pow(p.reference / f, 0.5)));
      var kDamp = Math.exp(-1 / (f * kTau)), kMute = Math.exp(-1 / (f * 0.05));
      var kRel = SR * p.release, kLen = Math.min(len + kRel, gate, maxOut) | 0;
      var kk = 0, kPrev = 0, kX1 = 0, kY1 = 0, kBody = makeSVF(), kTone = makeSVF();
      kBody.set(p.body, 1.3); kTone.set(p.cutoff, 0.7);
      var kCab = p.drive ? makeSVF() : null, kDrivePrev = 0, kPickup = Math.max(1, Math.round(kN * (p.pickup || 0.01)));
      if (kCab) kCab.set(p.cabinet, 0.65);
      // Optional 12-string sympathetic octave course
      var hasOct = !!(p.octaveString && f * 2 < SR * 0.42);
      var oN = 0, oC = 0, oBuf = null, ok = 0, oPrev = 0, oX1 = 0, oY1 = 0, oDamp = 0, oMute = 0;
      if (hasOct) {
        var oPer = SR / (f * 2.0012); oN = Math.max(2, Math.floor(oPer - 0.5));
        var oFr = oPer - 0.5 - oN; if (oFr < 0.15 && oN > 2) { oN--; oFr += 1; }
        oC = (1 - oFr) / (1 + oFr); oBuf = new Float32Array(oN);
        var oEx = new Float32Array(oN), oLp = 0;
        for (j = 0; j < oN; j++) { oLp += ((rnd() * 2 - 1) - oLp) * (kCoef * 0.9); oEx[j] = oLp; }
        var oPick = Math.max(1, Math.round(oN * p.pick));
        for (j = 0; j < oN; j++) oBuf[j] = oEx[j] - oEx[(j + oPick) % oN] * 0.9;
        oDamp = Math.exp(-1 / (f * 2 * kTau * 0.85)); oMute = Math.exp(-1 / (f * 2 * 0.05));
      }
      // Optional twin-string chorus buffer for clean electric chorus guitar
      var chSize = p.chorus ? Math.max(64, Math.ceil(SR * 0.022)) : 0;
      var chBuf = chSize ? new Float32Array(chSize) : null, chIdx = 0;
      var finK = Number.isFinite(gate), gK = vel * p.gain;
      for (i2 = 0; i2 < kLen; i2++) {
        var kD = kBuf[kk], kL = (kD + kPrev) * 0.5 * (i2 > len ? kMute : kDamp);
        kPrev = kD;
        var kA = kC * kL + kX1 - kC * kY1; kX1 = kL; kY1 = kA;
        kBuf[kk] = kA; if (++kk === kN) kk = 0;
        var kSignal = p.pickup ? kD - kBuf[(kk + kPickup) % kN] * 0.65 : kD;
        if (hasOct) {
          var oD = oBuf[ok], oL = (oD + oPrev) * 0.5 * (i2 > len ? oMute : oDamp);
          oPrev = oD;
          var oA = oC * oL + oX1 - oC * oY1; oX1 = oL; oY1 = oA;
          oBuf[ok] = oA; if (++ok === oN) ok = 0;
          kSignal += oD * p.octaveString;
        }
        var kY = kTone.lp(kSignal); kBody.lp(kY); kY += kBody.bp * p.bodyGain;
        if (p.overtone && i2 < SR * 0.15 && f * 4 < SR * 0.45) { ph += f * 4 / SR; if (ph >= 1) ph -= 1; kY += sinT(ph) * p.overtone * vel * Math.exp(-i2 / (SR * 0.03)); }
        if (kCab) {
          // First-order antiderivative antialiasing for x/sqrt(1+x*x).
          var drive = kY * p.drive, saturated = (drive + kDrivePrev) / (Math.sqrt(1 + drive * drive) + Math.sqrt(1 + kDrivePrev * kDrivePrev));
          kDrivePrev = drive; kY = kCab.lp(saturated);
        }
        if (chBuf) {
          chBuf[chIdx] = kY;
          var dSam = (0.008 + 0.0028 * sinT(0.85 * i2 / SR)) * SR;
          var dInt = dSam | 0, dFr = dSam - dInt;
          var r1 = chIdx - dInt; if (r1 < 0) r1 += chSize;
          var r0 = r1 - 1; if (r0 < 0) r0 += chSize;
          kY = kY * (1 - p.chorus * 0.35) + (chBuf[r1] * (1 - dFr) + chBuf[r0] * dFr) * p.chorus;
          if (++chIdx === chSize) chIdx = 0;
        }
        e = Math.min(1, i2 / (SR * 0.0015));
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / kRel);
        if (finK) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = kY * e * gK;
      }
      return kLen;
    }
    /* 电风琴：拉杆加法合成（16' 8' 5 1/3' 4' 2 2/3' 2'）+ 三次谐波打击音 + 键噪，
       旋转音箱：频率与幅度一起以 6.3Hz 摆动 */
    function voiceOrgan(out, maxOut, f, vel, len, gate, gateFade, rnd) {
      var oH = [0.5, 1, 1.5, 2, 3, 4], oA = [0.42, 1, 0.5, 0.48, 0.28, 0.22], oPh = [], oS = [], oD = [], fin = Number.isFinite(gate);
      for (var h = 0; h < oH.length; h++) if (f * oH[h] < SR * 0.45) { oPh.push(0); oS.push(f * oH[h] / SR); oD.push(0.0009 * oH[h]); }
      var nh = oPh.length, perc = 0.55, dPerc = Math.exp(-1 / (SR * 0.18)), g = vel * G.organ;
      var oRel = SR * 0.05, oLen = Math.min(len + oRel, gate, maxOut) | 0, oClick = 0;
      for (var i2 = 0; i2 < oLen; i2++) {
        var oRot = sinT(6.3 * i2 / SR), oX = 0;
        for (h = 0; h < nh; h++) {
          oPh[h] += oS[h] * (1 + oD[h] * oRot); if (oPh[h] >= 1) oPh[h] -= 1;
          oX += sinT(oPh[h]) * (h === 4 ? oA[h] + perc : oA[h]);
        }
        perc *= dPerc;
        if (i2 < SR * 0.004) { oClick += ((rnd() * 2 - 1) - oClick) * 0.5; oX += oClick * 0.5 * (1 - i2 / (SR * 0.004)); }
        var e = Math.min(1, i2 / (SR * 0.005)) * (1 + 0.1 * oRot);
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / oRel);
        if (fin) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = oX * e * g;
      }
      return oLen;
    }
    /* 铜管：两支锯齿过低通，起音时截止频率先冲高再回落，
       音高从下方 30 音分滑入，0.3s 后加颤音；力度越大越亮 */
    // V2-inspired modular signal path; original implementation, not a V2 patch reader.
    // Three band-limited oscillators, independent amplitude/filter envelopes,
    // PWM/filter LFO, and optional serial low-pass stages.
    function voiceElectronic(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      var phases = [rnd(), rnd(), rnd()], filters = [makeSVF(), makeSVF()];
      var release = SR * p.release, end = Math.min(maxOut, len + release, gate) | 0;
      var cutoff = p.cutoff, lfoPhase = rnd();
      var colorFilters = p.formants ? [makeSVF(), makeSVF()] : null;
      var randomStep = -1, randomTarget = 0, randomColor = 0;
      var cRand = 1 - Math.exp(-1 / (SR * 0.008)), cCut = 1 - Math.exp(-1 / (SR * 0.003));
      var oscSteps = p.oscs.map(function (osc) { return Math.min(0.44, f * osc.ratio * Math.pow(2, osc.cents / 1200) / SR); });
      function envelope(t, attack, decay, sustain) {
        if (t < attack) { var a = t / attack; return a * a * (3 - 2 * a); }
        return sustain + (1 - sustain) * Math.exp(-(t - attack) / decay);
      }
      var offLevel = envelope(len / SR, p.attack, p.decay, p.sustain), finE = Number.isFinite(gate), gE = vel * p.gain;
      for (var i = 0; i < end; i++) {
        var t = i / SR, lfo = sinT(t * p.rate + lfoPhase);
        if (p.randomRate) {
          var tick = Math.floor(t * p.randomRate);
          if (tick !== randomStep) { randomStep = tick; randomTarget = rnd() * 2 - 1; }
          randomColor += (randomTarget - randomColor) * cRand;
        }
        var amp = i < len ? envelope(t, p.attack, p.decay, p.sustain) :
          offLevel * Math.pow(Math.max(0, 1 - (i - len) / release), 2);
        var fe = envelope(Math.min(t, len / SR), p.filterAttack || 0.004, p.filterDecay, p.filterSustain);
        if (i >= len) fe *= Math.max(0, 1 - (i - len) / release);
        var target = (p.cutoff + f * p.keytrack) * Math.pow(2, fe * p.sweep * (0.35 + 0.65 * vel) + p.motion * lfo + randomColor * (p.randomDepth || 0));
        cutoff += (target - cutoff) * cCut;
        if ((i & 7) === 0) { filters[0].set(Math.min(SR * 0.2, cutoff), p.q); filters[1].set(Math.min(SR * 0.2, cutoff), 0.707); }
        var value = 0;
        for (var k = 0; k < p.oscs.length; k++) {
          var osc = p.oscs[k], step = oscSteps[k];
          phases[k] = (phases[k] + step) % 1;
          value += osc.gain * (osc.wave === 'sine' ? sinT(phases[k]) : osc.wave === 'pulse' ?
            pulse(phases[k], 0.5 + p.pwm * lfo, step) : polySaw(phases[k], step));
        }
        value = filters[0].lp(value);
        if (p.serial) value = filters[1].lp(value);
        if (colorFilters) {
          var mouth = p.formantEnvelope ? fe : (lfo + 1) * 0.5;
          var colored = 0;
          for (var band = 0; band < 2; band++) {
            var formant = p.formants[band];
            if ((i & 7) === 0) colorFilters[band].set(formant[0] + (formant[1] - formant[0]) * mouth, 3);
            colorFilters[band].lp(value);
            colored += colorFilters[band].bp / 3;
          }
          value = value * 0.25 + colored * 1.8;
        }
        if (finE) amp *= Math.min(1, (gate - i) / gateFade);
        out[i] = value * amp * gE;
      }
      return end;
    }

    function voiceBrass(out, maxOut, f, vel, len, gate, gateFade, rnd) {
      var i2, t, e, ph = 0, ph2 = rnd();
      var brF = makeSVF(), brRel = SR * 0.08, brLen = Math.min(len + brRel, gate, maxOut) | 0, brP = f, brS = f / SR;
      var finBr = Number.isFinite(gate), gBr = vel * G.brass, eBr = 1, dBr = Math.exp(-1 / (SR * 0.2));
      for (i2 = 0; i2 < brLen; i2++) {
        t = i2 / SR;
        var brA = Math.min(1, t / 0.045);
        if ((i2 & 15) === 0) {
          brP = f * Math.pow(2, (-30 * Math.exp(-t / 0.03) + 14 * Math.min(1, Math.max(0, t - 0.3) / 0.3) * sinT(5.2 * t)) / 1200);
          brS = brP / SR;
          brF.set(Math.min(8000, brP * (1.2 + (1.8 + 3.5 * vel) * brA * (0.7 + 0.3 * Math.exp(-t / 0.15))) + 150), 1.1);
        }
        ph += brS; if (ph >= 1) ph -= 1;
        ph2 += brS * 1.004; if (ph2 >= 1) ph2 -= 1;
        var brX = brF.lp(polySaw(ph, brS) + polySaw(ph2, brS * 1.004) * 0.6);
        e = brA * (0.82 + 0.18 * (legacySound ? Math.exp(-t / 0.2) : eBr));
        eBr *= dBr;
        if (i2 > len) e *= Math.max(0, 1 - (i2 - len) / brRel);
        if (finBr) e *= Math.min(1, (gate - i2) / gateFade);
        out[i2] = brX * e * gBr;
      }
      return brLen;
    }

    // Singing synth lead: a rounded pulse/saw blend, sustained body, a small
    // pitch scoop and delayed vibrato. Separate from the short plucked arp.
    function voiceLead(out, maxOut, f, vel, len, gate, gateFade) {
      var p0 = 0, p1 = 0.23, filter = makeSVF(), release = SR * 0.085;
      var limit = Math.min(maxOut, len + release, gate) | 0, attack = Math.min(SR * 0.018, len * 0.25);
      var finL = Number.isFinite(gate), gL = vel * 0.13, eScoop = 1, dScoop = Math.exp(-1 / (SR * 0.025)), eBody = 1, dBody = Math.exp(-1 / (SR * 0.18));
      for (var i = 0; i < limit; i++) {
        var t = i / SR, vibrato = 0.0028 * Math.min(1, Math.max(0, t - 0.22) / 0.25) * (legacySound ? Math.sin(TWO_PI * 5.2 * t) : sinT(5.2 * t));
        var scoop = legacySound ? Math.exp(-t / 0.025) : eScoop;
        var step = f * (1 - 0.009 * scoop + vibrato) / SR, detune = step * 1.002;
        p0 = (p0 + step) % 1; p1 = (p1 + detune) % 1;
        if ((i & 15) === 0) filter.set(Math.min(6500, f * (2.5 + 2 * vel) + 900 * Math.exp(-t / 0.12)), 0.8);
        var pwmMod = legacySound ? Math.sin(TWO_PI * 0.7 * t) : sinT(0.7 * t);
        var x = pulse(p0, 0.42 + 0.025 * pwmMod, step) * 0.48 + polySaw(p1, detune) * 0.32 + sinT(p0) * 0.3;
        var env = Math.min(1, i / Math.max(1, attack)) * (0.82 + 0.18 * (legacySound ? Math.exp(-t / 0.18) : eBody));
        eScoop *= dScoop; eBody *= dBody;
        if (i > len) env *= Math.max(0, 1 - (i - len) / release);
        if (finL) env *= Math.min(1, (gate - i) / gateFade);
        out[i] = filter.lp(x) * env * gL;
      }
      return limit;
    }

    function voicePiano(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || {};
      var key = 69 + 12 * Math.log(f / 440) / Math.LN2;
      function blend(lo, hi) { var x = Math.max(0, Math.min(1, (key - lo) / (hi - lo))); return x * x * (3 - 2 * x); }
      var stiffness = 0.000035 + 0.00016 * blend(55, 96), tau = Math.max(0.45, Math.min(5.0, 2.65 * (p.tauScale || 1) * Math.pow(261.6 / f, 0.65)));
      var weights = [1, blend(36, 52), blend(52, 68)], detunes = [0, -0.00055, 0.00055];
      var norm = weights[0] + weights[1] + weights[2], modes = [], bright = (p.brightBase !== undefined ? p.brightBase : 0.48) + (p.brightVel !== undefined ? p.brightVel : 0.36) * vel;
      for (var h = 1; h <= 20; h++) {
        var hz = f * h * Math.sqrt((1 + stiffness * h * h) / (1 + stiffness));
        if (hz * 1.00055 >= SR * 0.45) break;
        for (var s = 0; s < 3; s++) if (weights[s] > 0.001) {
          var angle = TWO_PI * hz * (1 + detunes[s]) / SR, amp = Math.pow(bright, h - 1) / Math.pow(h, 0.95) * weights[s] / norm * (h === 1 && p.warmth ? 1 + p.warmth : 1);
          modes.push({ re: 1, im: 0, co: Math.cos(angle), si: Math.sin(angle),
            fast: amp * (0.22 + 0.16 * vel), slow: amp * (0.78 - 0.16 * vel),
            fastDecay: Math.exp(-1 / (SR * (0.12 + 0.16 / h))),
            slowDecay: Math.exp(-1 / (SR * tau / (1 + 0.42 * (h - 1)))) });
        }
      }
      var release = SR * 0.12, limit = Math.min(maxOut, len + release, gate) | 0, hammer = 0;
      var activeModes = modes.length, cHam = 1 - Math.exp(-TWO_PI * (1000 + 3000 * vel) / SR);
      var hamScale = p.hammer !== undefined ? p.hammer : 0.18;
      var eHam = hamScale * vel, dHam = Math.exp(-1 / (SR * 0.0025)), hamEnd = SR * 0.01, finP = Number.isFinite(gate), gP = vel * (p.gain || 0.2);
      for (var i = 0; i < limit; i++) {
        while (activeModes > 0 && modes[activeModes - 1].fast + modes[activeModes - 1].slow < 0.000002) activeModes--;
        var sample = 0;
        for (var m = 0; m < activeModes; m++) {
          var mode = modes[m];
          if (mode.fast + mode.slow < 0.000002) continue;
          var re = mode.re * mode.co - mode.im * mode.si;
          mode.im = mode.re * mode.si + mode.im * mode.co; mode.re = re;
          sample += mode.im * (mode.fast + mode.slow);
          mode.fast *= mode.fastDecay; mode.slow *= mode.slowDecay;
        }
        if (i < hamEnd) { var hit = rnd() * 2 - 1; hammer += (hit - hammer) * cHam; sample += hammer * (legacySound ? hamScale * vel * Math.exp(-i / (SR * 0.0025)) : eHam); eHam *= dHam; }
        var env = Math.min(1, i / (SR * 0.002));
        if (i > len) env *= Math.max(0, 1 - (i - len) / release);
        if (finP) env *= Math.min(1, (gate - i) / gateFade);
        out[i] = sample * env * gP;
      }
      return limit;
    }

    function voiceWoodwind(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      var phase = 0, noiseLP = 0, noiseTone = makeSVF(), attack = SR * p.attack, release = SR * p.release;
      var limit = Math.min(maxOut, len + release, gate) | 0, nh = Math.min(p.harmonics.length, Math.floor(SR * 0.45 / f));
      noiseTone.set(Math.min(4800, f * 3 + 1500), 0.8);
      var cAirW = 1 - Math.exp(-TWO_PI * 1400 / SR), finW = Number.isFinite(gate), gW = vel * p.gain;
      var vibAmp = p.vibDepth !== undefined ? p.vibDepth : 0.002;
      for (var i = 0; i < limit; i++) {
        var t = i / SR, vib = vibAmp * Math.min(1, Math.max(0, t - 0.25) / 0.3) * sinT(t * 5.05);
        phase = (phase + f * (1 + vib) / SR) % 1;
        var x = 0;
        for (var h = 0; h < nh; h++) x += sinT(phase * (h + 1)) * p.harmonics[h] * (h ? 0.6 + 0.65 * vel : 1);
        var air = rnd() * 2 - 1; noiseLP += (air - noiseLP) * cAirW;
        x += noiseTone.lp(air - noiseLP) * p.noise * (0.8 + 0.4 * vel);
        var env = Math.min(1, i / attack) * (0.95 + 0.025 * sinT(t * 0.8));
        if (i > len) env *= Math.max(0, 1 - (i - len) / release);
        if (finW) env *= Math.min(1, (gate - i) / gateFade);
        out[i] = x * env * gW;
      }
      return limit;
    }

    function voiceMallet(out, maxOut, f, vel, len, gate, gateFade, p) {
      var modes = [], tau = p.tau * Math.pow(440 / f, 0.28), release = SR * 0.18;
      for (var h = 0; h < p.ratios.length; h++) {
        var hz = f * p.ratios[h]; if (hz >= SR * 0.45) continue;
        var angle = TWO_PI * hz / SR;
        modes.push({ re: 1, im: 0, co: Math.cos(angle), si: Math.sin(angle), amp: p.amplitudes[h] * (h ? 0.45 + 0.8 * vel : 1),
          decay: Math.exp(-1 / (SR * tau / (1 + 0.35 * h))) });
      }
      var limit = Math.min(maxOut, len + release, gate) | 0, finM = Number.isFinite(gate), gM = vel * p.gain;
      var attM = SR * (p.softAttack || 0.0015);
      for (var i = 0; i < limit; i++) {
        var x = 0;
        for (var h = 0; h < modes.length; h++) {
          var mode = modes[h], re = mode.re * mode.co - mode.im * mode.si;
          mode.im = mode.re * mode.si + mode.im * mode.co; mode.re = re; x += mode.im * mode.amp; mode.amp *= mode.decay;
        }
        var env = Math.min(1, i / attM) * (1 - (p.tremolo || 0) * (0.5 + 0.5 * sinT(4.2 * i / SR)));
        if (i > len) env *= Math.max(0, 1 - (i - len) / release);
        if (finM) env *= Math.min(1, (gate - i) / gateFade);
        out[i] = x * env * gM;
      }
      return limit;
    }

    function voiceChoir(out, maxOut, f, vel, len, gate, gateFade, rnd, p) {
      p = p || {};
      var fmts = p.formants || [700, 1250, 2600], wts = p.weights || [0.8, 0.4, 0.2];
      var phases = [rnd(), rnd(), rnd()], detunes = [0.9985, 1, 1.0015], formants = [makeSVF(), makeSVF(), makeSVF()];
      formants[0].set(fmts[0], 2.4); formants[1].set(fmts[1], 3.2); formants[2].set(fmts[2], 3.2);
      var attack = SR * (p.attack || 0.28), release = SR * (p.release || 0.5), limit = Math.min(maxOut, len + release, gate) | 0;
      var finC = Number.isFinite(gate), gC = vel * (p.gain || 0.12), cAirC = p.air ? 1 - Math.exp(-TWO_PI * 1600 / SR) : 0, airLP = 0;
      for (var i = 0; i < limit; i++) {
        var x = 0, t = i / SR;
        for (var j = 0; j < 3; j++) { var step = f * detunes[j] * (1 + 0.001 * sinT(t * (4.8 + j * 0.2) + j * 0.31)) / SR; phases[j] = (phases[j] + step) % 1; x += polySaw(phases[j], step) / 3; }
        var y = sinT(phases[1]) * 0.28;
        for (var j = 0; j < 3; j++) { formants[j].lp(x); y += formants[j].bp * wts[j]; }
        if (p.air) { var cN = rnd() * 2 - 1; airLP += (cN - airLP) * cAirC; y += (cN - airLP) * p.air; }
        var env = Math.min(1, i / attack);
        if (i > len) env *= Math.max(0, 1 - (i - len) / release);
        if (finC) env *= Math.min(1, (gate - i) / gateFade);
        out[i] = y * env * gC;
      }
      return limit;
    }

    var scratch = new Float32Array(Math.min(total, Math.ceil(SR * 4)));
    for (var n = noteStart; n < noteEnd; n++) {
      var note = notes[n];
      var startS = Math.round(tm.secOf(note.start) * SR);
      if (startS >= total) continue;
      var len = Math.max(24, Math.round((tm.secOf(note.start + note.dur) - tm.secOf(note.start)) * SR));
      // Auto-arranged notes carry a harmonic boundary. Release envelopes must
      // finish before it, including when a tempo change occurs inside the note.
      var gate = Number.isFinite(note.harmonyEnd) ? Math.max(0, Math.round(tm.secOf(note.harmonyEnd) * SR) - startS) : Infinity;
      if (!gate) continue;
      len = Math.min(len, gate);
      var gateFade = Math.min(SR * 0.012, gate);
      var f = NSG.mtof(note.pitch);
      var vel = (note.vel === undefined ? 90 : note.vel) / 127;
      var originalKind = note.inst || 'pad', preset = NSG.Instruments.get(originalKind);
      var kind = preset && preset.family !== 'chip' ? preset.family : originalKind;
      if (kind === 'drumkit') kind = DRUM_BY_NOTE[Math.round(note.pitch)] || 'snare';
      var rnd = rndFor(n);
      var maxOut = Math.min(total - startS, len + Math.ceil(SR * 1.4));
      if (maxOut > scratch.length) scratch = new Float32Array(maxOut);
      var out = scratch;
      var usedLen = 0;
      var i2, t, e, ph, ph2, ph3, j;

      if (/^chip/.test(kind)) {
        var chipLen = Math.min(maxOut, len);
        var chipNoise = kind === 'chipNoise', chipKick = kind === 'chipKick' || kind === 'chipTom';
        ph = chipNoise || chipKick ? 0 : (f * startS / SR) % 1;
        var drum = note.chipDrum || 'snare', lfsr = 1 + (n * 127 % 32766), noiseClock = 0;
        var noiseHz = drum === 'hat' || drum === 'openhat' ? 13000 : drum === 'rim' ? 7000 : 5500;
        var decay = drum === 'hat' ? 0.025 : drum === 'openhat' ? 0.09 : drum === 'crash' || drum === 'ride' ? 0.24 : 0.065;
        var tones = Array.isArray(note.chipTones) && note.chipTones.length ? note.chipTones.filter(Number.isFinite).slice(0, 4) : [note.pitch];
        if (!tones.length) tones = [note.pitch];
        var pwmLead = kind === 'chipPWM' && (note.role === 'melodySample' || note.role === 'instrumentalLead'), pwmRate = pwmLead ? 2.6 : 1.3, pwmPhase = (n * 0.37) % 1;
        var chipTable = kind === 'chipTable' ? Array.from({ length: 32 }, function (_, index) {
          var angle = TWO_PI * index / 32, wave = Math.sin(angle);
          if (f * 2 < SR * 0.45) wave += 0.38 * Math.sin(angle * 2 + 0.3);
          if (f * 3 < SR * 0.45) wave += 0.22 * Math.sin(angle * 3);
          if (f * 5 < SR * 0.45) wave += 0.1 * Math.sin(angle * 5);
          return Math.round(wave / 1.7 * 127) / 127;
        }) : null;
        var chipGain = chipNoise ? 0.09 : chipKick ? 0.25 : kind === 'chipTriangle' ? 0.15 : kind === 'chipHybrid' ? 0.15 : kind === 'chipArp' ? 0.14 :
          pwmLead ? 0.105 : kind === 'chipPWM' ? 0.085 : 0.072;
        var eChip = 1, dChip = Math.exp(-1 / (SR * (chipNoise ? decay : chipKick ? 0.085 : 0.12)));
        var eKickF = 1, dKickF = Math.exp(-1 / (SR * (kind === 'chipKick' ? 0.018 : 0.025)));
        for (i2 = 0; i2 < chipLen; i2++) {
          t = i2 / SR;
          var frequency = kind === 'chipArp' ? NSG.mtof(tones[Math.floor(t * 50) % tones.length]) : f;
          if (pwmLead) frequency *= 1 + 0.011 * Math.min(1, Math.max(0, t - 0.15) / 0.2) * sinT(5.6 * t);
          if (chipKick) {
            var kfEnv = legacySound ? Math.exp(-t / (kind === 'chipKick' ? 0.018 : 0.025)) : eKickF;
            frequency = kind === 'chipKick' ? 42 + 155 * kfEnv : NSG.mtof(note.pitch - 9) * (1 + 0.7 * kfEnv);
            eKickF *= dKickF;
          }
          var step = Math.min(0.42, frequency / SR), value;
          ph += step; if (ph >= 1) ph -= 1;
          if (chipNoise) {
            noiseClock += Math.min(noiseHz, SR * 0.8) / SR;
            while (noiseClock >= 1) { var feedback = (lfsr ^ (lfsr >> (drum === 'perc' ? 6 : 1))) & 1; lfsr = (lfsr >> 1) | (feedback << 14); noiseClock--; }
            value = (lfsr & 1) ? 1 : -1;
          } else if (kind === 'chipTriangle' || chipKick) {
            var triangleStep = Math.floor((chipKick ? ph : (ph + 0.5) % 1) * 32);
            value = (triangleStep < 16 ? triangleStep : 31 - triangleStep) / 7.5 - 1;
          } else if (kind === 'chipTable') {
            var tablePos = ((ph + 0.25) % 1) * 32, tableIndex = Math.floor(tablePos), mix = tablePos - tableIndex;
            value = chipTable[tableIndex] * (1 - mix) + chipTable[(tableIndex + 1) % 32] * mix;
          } else if (kind === 'chipHybrid') {
            value = polySaw((ph + 0.75) % 1, step) * 0.55 + pulse((ph + 0.125) % 1, 0.25, step) * 0.45;
          } else if (kind === 'chipSaw') {
            value = polySaw((ph + 0.75) % 1, step);
          } else {
            var width = kind === 'chipPWM' ? 0.29 + 0.21 * tri(pwmRate * t + pwmPhase) : kind === 'chipPulse12' ? 0.125 :
              kind === 'chipPulse25' ? 0.25 : kind === 'chipPulse75' ? 0.75 : kind === 'chipPulse87' ? 0.875 : 0.5;
            value = pulse((ph + width * 0.5) % 1, width, step);
          }
          e = Math.min(1, i2 / (SR * 0.003)) * Math.min(1, (len - i2) / (SR * 0.008));
          var cEnv = legacySound ? Math.exp(-t / (chipNoise ? decay : chipKick ? 0.085 : 0.12)) : eChip;
          eChip *= dChip;
          if (chipNoise || chipKick) e *= cEnv;
          else if (kind !== 'chipTriangle') e *= 0.72 + 0.28 * cEnv;
          out[i2] = value * e * vel * chipGain;
        }
        usedLen = chipLen;
      } else if (kind === 'bass') {
        usedLen = voiceBass(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'electronic') {
        usedLen = voiceElectronic(out, maxOut, f, vel, len, gate, gateFade, rnd, preset.sound);
      } else if (kind === 'pad') {
        usedLen = voicePad(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'strings') {
        usedLen = voiceStrings(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'ep') {
        usedLen = voiceEP(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'arp') {
        usedLen = voiceSynthPluck(out, maxOut, f, vel, len, gate, gateFade, rnd);
      } else if (kind === 'lead') {
        usedLen = voiceLead(out, maxOut, f, vel, len, gate, gateFade);
      } else if (kind === 'string') {
        usedLen = voiceString(out, maxOut, f, vel, len, gate, gateFade, rnd, originalKind, preset.sound);
      } else if (kind === 'organ') {
        usedLen = voiceOrgan(out, maxOut, f, vel, len, gate, gateFade, rnd);
      } else if (kind === 'brass') {
        usedLen = voiceBrass(out, maxOut, f, vel, len, gate, gateFade, rnd);
      } else if (kind === 'piano') {
        usedLen = voicePiano(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'woodwind') {
        usedLen = voiceWoodwind(out, maxOut, f, vel, len, gate, gateFade, rnd, preset.sound);
      } else if (kind === 'mallet') {
        usedLen = voiceMallet(out, maxOut, f, vel, len, gate, gateFade, preset.sound);
      } else if (kind === 'choir') {
        usedLen = voiceChoir(out, maxOut, f, vel, len, gate, gateFade, rnd, preset && preset.sound);
      } else if (kind === 'accordion') {
        ph = 0; ph2 = 0; ph3 = 0; var aLP = 0, accLen = Math.min(maxOut, len);
        var aCut = 1450 + f * (0.85 + 0.5 * vel), cAcc = 1 - Math.exp(-TWO_PI * Math.min(aCut, SR * 0.4) / SR), gAcc = vel * 0.06;
        for (i2 = 0; i2 < accLen; i2++) {
          t = i2 / SR;
          ph += f / SR; if (ph >= 1) ph -= 1; ph2 += f * 1.0058 / SR; if (ph2 >= 1) ph2 -= 1; ph3 += f * 0.5 / SR; if (ph3 >= 1) ph3 -= 1;
          var reed = polySaw(ph, f / SR) * 0.6 + pulse(ph, 0.3, f / SR) * 0.5 + polySaw(ph2, f * 1.0058 / SR) * 0.6 +
            pulse(ph2, 0.3, f * 1.0058 / SR) * 0.5 + polySaw(ph3, f * 0.5 / SR) * 0.35;
          aLP += (reed - aLP) * cAcc;
          e = Math.min(1, i2 / (SR * 0.025)) * Math.min(1, (len - i2) / (SR * 0.03)) * (0.92 + 0.08 * (legacySound ? Math.sin(TWO_PI * 4.5 * t) : sinT(4.5 * t)));
          out[i2] = aLP * e * gAcc;
        }
        usedLen = accLen;
      } else if (kind === 'tuba') {
        ph = 0;
        var tuAir = 0, tuDrift = 0, tuPhase = rnd(), tuStep = f / SR;
        var tuAttack = Math.min(0.055, len / SR * 0.28), tuRelease = SR * 0.065;
        var tuLen = Math.min(maxOut, len + tuRelease, gate) | 0;
        var tuCount = Math.min(20, Math.floor(SR * 0.44 / (f * 1.015)));
        var tuWeights = [], tuBright = 0;
        for (j = 1; j <= tuCount; j++) {
          var tuHz = j * f;
          tuWeights[j] = Math.pow(j, -1.35) * (1 + 0.6 * Math.exp(-Math.pow((tuHz - 420) / 280, 2))) /
            Math.sqrt(1 + Math.pow(tuHz / 1800, 4));
        }
        var cTuAir = 1 - Math.exp(-TWO_PI * 900 / SR), finTu = Number.isFinite(gate), gTu = vel * 0.075;
        var eTu1 = 1, dTu1 = Math.exp(-1 / (SR * 0.18)), eTu2 = 1, dTu2 = Math.exp(-1 / (SR * 0.045));
        for (i2 = 0; i2 < tuLen; i2++) {
          t = i2 / SR;
          var tuRise = Math.min(1, t / tuAttack);
          tuRise *= tuRise * (3 - 2 * tuRise);
          var tuOff = Math.max(0, 1 - Math.max(0, i2 - len) / tuRelease);
          if ((i2 & 31) === 0) {
            tuDrift += (rnd() * 2 - 1 - tuDrift) * 0.07;
            var tuCents = -9 * Math.exp(-t / 0.025) + tuDrift * 3 +
              2.5 * Math.min(1, Math.max(0, t - 0.25) / 0.35) * sinT(t * 4.7 + tuPhase);
            tuStep = f / SR * Math.pow(2, tuCents / 1200);
            tuBright = (0.38 + 0.42 * vel) * (0.65 + 0.35 * tuRise) * (0.75 + 0.25 * tuOff);
          }
          ph += tuStep; ph -= Math.floor(ph);
          var tuTone = 0, tuRoll = 1;
          for (j = 1; j <= tuCount; j++) {
            tuTone += tuWeights[j] * tuRoll * sinT(ph * j);
            tuRoll *= tuBright;
          }
          tuAir += ((rnd() * 2 - 1) - tuAir) * cTuAir;
          e = tuRise * tuOff * tuOff * (0.93 + 0.07 * (legacySound ? Math.exp(-t / 0.18) : eTu1)) *
            (1 + 0.009 * sinT(t * 1.8 + tuPhase));
          if (finTu) e *= Math.min(1, (gate - i2) / gateFade);
          out[i2] = (tuTone + tuAir * (0.012 + 0.025 * (legacySound ? Math.exp(-t / 0.045) : eTu2))) * e * gTu;
          eTu1 *= dTu1; eTu2 *= dTu2;
        }
        usedLen = tuLen;
      } else {
        usedLen = voiceDrum(out, maxOut, kind, note.pitch, vel, rnd, nextClosedHat[n] - tm.secOf(note.start));
      }
      var mixLen = usedLen;
      if (Array.isArray(note.noteEq) && (note.noteEq.length === 48 || note.noteEq.length === 64) && note.noteEq.every(Number.isFinite)) {
        mixLen = Math.min(maxOut, usedLen + ((EQ_L - 1) >> 1));
        if (mixLen > usedLen) out.fill(0, usedLen, mixLen);
        var eqScale = Number.isFinite(note.noteEqRoot) ? Math.pow(2, (note.pitch - note.noteEqRoot) / 12) : 1;
        NSG.DSP.applyOutEq(out.subarray(0, mixLen), note.noteEq, SR, eqScale);
      }
      var pan = Number.isFinite(note.pan) ? Math.max(-1, Math.min(1, note.pan)) : preset && Number.isFinite(preset.pan) ? preset.pan : (pans[originalKind] || 0);
      // Centre retains the historical per-channel level; pan changes neither timing nor pitch.
      var lg = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
      var rg = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
      var hasGainCurve = !!(note.gainPoints && note.gainPoints.length);
      var snd = spaceProfile ? sendFor(originalKind, kind, note) : null;
      // Allocate each stereo bus on its first send, outside the sample loop.
      if (snd) {
        if (snd.h && !hallL) { hallL = new Float32Array(bufLen); hallR = new Float32Array(bufLen); }
        if (snd.p && !plateL) { plateL = new Float32Array(bufLen); plateR = new Float32Array(bufLen); }
        if (snd.d && !delayL) { delayL = new Float32Array(bufLen); delayR = new Float32Array(bufLen); }
        if (snd.c && !chorusL) { chorusL = new Float32Array(bufLen); chorusR = new Float32Array(bufLen); }
      }
      var localStart = startS - bufOffset;
      if (hasGainCurve) {
        var singleSeg = tm.count === 1, beat0 = tm.beatOf(startS / SR), beatStep = singleSeg ? (tm.segs[0].bpm / 60 / SR) : 0;
        var gVal = 1;
        for (var s = 0; s < mixLen; s++) {
          if (singleSeg) {
            if ((s & 7) === 0) gVal = NSG.TUNING.noteGain(note, (beat0 + s * beatStep - note.start) / note.dur);
          } else {
            if ((s & 7) === 0) gVal = NSG.TUNING.noteGain(note, (tm.beatOf((startS + s) / SR) - note.start) / note.dur);
          }
          var lOut = out[s] * lg * gVal, rOut = out[s] * rg * gVal, idxS = localStart + s;
          left[idxS] += lOut; right[idxS] += rOut;
          if (snd) {
            if (snd.h) { hallL[idxS] += lOut * snd.h; hallR[idxS] += rOut * snd.h; }
            if (snd.p) { plateL[idxS] += lOut * snd.p; plateR[idxS] += rOut * snd.p; }
            if (snd.d) { delayL[idxS] += lOut * snd.d; delayR[idxS] += rOut * snd.d; }
            if (snd.c) { chorusL[idxS] += lOut * snd.c; chorusR[idxS] += rOut * snd.c; }
          }
        }
      } else {
        var constGain = note.gain !== undefined ? NSG.TUNING.noteGain(note, 0) : 1;
        var lScale = lg * constGain, rScale = rg * constGain;
        if (snd) {
          var lh = lScale * snd.h, rh = rScale * snd.h, lp = lScale * snd.p, rp2 = rScale * snd.p;
          var ld = lScale * snd.d, rd = rScale * snd.d, lc = lScale * snd.c, rc = rScale * snd.c;
          for (var sc = 0; sc < mixLen; sc++) {
            var sv = out[sc], idxS2 = localStart + sc;
            left[idxS2] += sv * lScale; right[idxS2] += sv * rScale;
            if (snd.h) { hallL[idxS2] += sv * lh; hallR[idxS2] += sv * rh; }
            if (snd.p) { plateL[idxS2] += sv * lp; plateR[idxS2] += sv * rp2; }
            if (snd.d) { delayL[idxS2] += sv * ld; delayR[idxS2] += sv * rd; }
            if (snd.c) { chorusL[idxS2] += sv * lc; chorusR[idxS2] += sv * rc; }
          }
        } else {
          for (var sc0 = 0; sc0 < mixLen; sc0++) {
            var sv0 = out[sc0];
            left[localStart + sc0] += sv0 * lScale; right[localStart + sc0] += sv0 * rScale;
          }
        }
      }
    }

    if (noteRange) {
      return {
        offset: bufOffset, length: bufLen, total: total, sr: SR,
        spaceName: spaceName, spb0: tm.spbAt(0), legacySound: legacySound,
        left: left, right: right,
        hallL: hallL || null, hallR: hallR || null,
        plateL: plateL || null, plateR: plateR || null,
        delayL: delayL || null, delayR: delayR || null,
        chorusL: chorusL || null, chorusR: chorusR || null
      };
    }

    if (spaceProfile) {
      var hasSig = function (a, b) {
        if (!a) return false;
        for (var k = 0; k < total; k++) if (a[k] !== 0 || b[k] !== 0) return true;
        return false;
      };
      var spbD = tm.spbAt(0);
      if (hasSig(chorusL, chorusR)) runAccompSpaceEffect('chorus', chorusL, chorusR, left, right, SR, spaceProfile, spbD);
      if (hasSig(delayL, delayR)) runAccompSpaceEffect('delay', delayL, delayR, left, right, SR, spaceProfile, spbD);
      if (hasSig(plateL, plateR)) runAccompSpaceEffect('plate', plateL, plateR, left, right, SR, spaceProfile, spbD);
      if (hasSig(hallL, hallR)) runAccompSpaceEffect('hall', hallL, hallR, left, right, SR, spaceProfile, spbD);
    }

    return finalizeAccompMix(left, right, SR, spaceProfile, legacySound);
  };

  return NSG.DSP;
  }
  NSG.LEGACY_SOUND = !!NSG.LEGACY_SOUND;
  NSG.setLegacySound = function (flag) {
    NSG.LEGACY_SOUND = !!flag;
    return NSG.LEGACY_SOUND;
  };
  var standard = createEngine(NSG, 16000), legacyRender = standard.render, legacyRenderTrack = standard.renderTrack,
    legacyPlanVocalSlices = standard.planVocalSlices, legacyRenderVocalSlice = standard.renderVocalSlice,
    legacyFinalizeVocalSlices = standard.finalizeVocalSlices,
    legacyControlFrames = standard.controlFrames, legacyPhonemeTimeline = standard.phonemeTimeline,
    highDefinition = null, previousHD = null;
  function hdEngine(opt) {
    var calibrated = !opt || opt.modeBCalibration !== false;
    if (calibrated ? !highDefinition : !previousHD) {
      var isolated = Object.create(NSG);
      isolated.DSP = {};
      var engine = createEngine(isolated, 48000, calibrated);
      if (calibrated) highDefinition = engine; else previousHD = engine;
    }
    return calibrated ? highDefinition : previousHD;
  }
  standard.render = function (score, timbre, opt) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyRender(score, timbre, opt);
      return hdEngine(opt).render(score, timbre, opt);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.renderTrack = function (score, trk, timbre, opt) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyRenderTrack(score, trk, timbre, opt);
      return hdEngine(opt).renderTrack(score, trk, timbre, opt);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.planVocalSlices = function (score, trk, timbre, opt, maxSlices) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyPlanVocalSlices(score, trk, timbre, opt, maxSlices);
      return hdEngine(opt).planVocalSlices(score, trk, timbre, opt, maxSlices);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.renderVocalSlice = function (score, trk, timbre, opt, sliceRange) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyRenderVocalSlice(score, trk, timbre, opt, sliceRange);
      return hdEngine(opt).renderVocalSlice(score, trk, timbre, opt, sliceRange);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.finalizeVocalSlices = function (chunks, total, mixGains, opt) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyFinalizeVocalSlices(chunks, total, mixGains, opt);
      return hdEngine(opt).finalizeVocalSlices(chunks, total, mixGains, opt);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.controlFrames = function (score, timbre, opt) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyControlFrames(score, timbre, opt);
      return hdEngine(opt).controlFrames(score, timbre, opt);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
  standard.phonemeTimeline = function (score, timbre, opt) {
    var prev = NSG.LEGACY_SOUND;
    if (opt && opt.legacySound !== undefined) NSG.LEGACY_SOUND = !!opt.legacySound;
    try {
      if (!opt || opt.hd !== true) return legacyPhonemeTimeline(score, timbre, opt);
      return hdEngine(opt).phonemeTimeline(score, timbre, opt);
    } finally {
      NSG.LEGACY_SOUND = prev;
    }
  };
})(typeof window !== 'undefined' ? window : global);
