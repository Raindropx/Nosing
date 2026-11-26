/* ==========================================================================
   NSG · 文件读写
   导入：MIDI / VSQ(VOCALOID2, 实为 SMF) / VSQX(V3、V4) / VPR(V5、V6) / SVP / UST / USTX / NN /
         TuneLab(TLP / TLPX) / VSP(VOCALINA) / VCP(CANTOR 2) / DSC / ufdata(UtaFormatix) / NSG
         及 project-imports.js 中的 CeVIO / VoiSona / DeepVocal / Sharpkey / MUTA / VocalSharp / Vogen / Y77 / AISingers
   导出：WAV / ZIP / MIDI / ufdata / NSG 工程
   格式一律按「内容嗅探」判定，不看扩展名 —— 有的 .vsq 其实是 SMF、
   别人的 .vsq 可能是 XML，扩展名靠不住。
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['io'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  if (!NSG.Instruments && typeof require === 'function') require('./instruments.js');
  var IO = NSG.IO = {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { var x = parseFloat(v); return isFinite(x) ? x : d; }
  var MAX_TRACK_VOL = 4;
  var MAX_TRACK_DB = 12;
  function roundMix(v) { return Math.round(v * 1000) / 1000; }
  function roundVol(v) { return v < 0.2 ? Math.round(v * 10000) / 10000 : Math.round(v * 1000) / 1000; }
  function dbToLinear(db, muteDb) {
    if (!isFinite(db)) return 1;
    if (db <= (muteDb === undefined ? -80 : muteDb)) return 0;
    return clamp(Math.pow(10, Math.min(db, MAX_TRACK_DB) / 20), 0, MAX_TRACK_VOL);
  }
  function assignTrackMix(tr, vol, pan, muted) {
    if (isFinite(vol) && Math.abs(vol - 1) >= 0.001) tr.vol = roundVol(clamp(vol, 0, MAX_TRACK_VOL));
    if (isFinite(pan) && Math.abs(pan) >= 0.001) tr.pan = roundMix(clamp(pan, -1, 1));
    if (muted) tr.muted = true;
    return tr;
  }

  // Share the exact arithmetic between synchronous tools/Worker use and UI work.
  function finishSteps(steps) {
    var step; do { step = steps.next(); } while (!step.done);
    return step.value;
  }
  async function responsiveSteps(steps) {
    var step, start = performance.now();
    do {
      step = steps.next();
      if (!step.done && performance.now() - start >= 8) {
        // A new task lets the browser paint and handle input; a resolved Promise does not.
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
        start = performance.now();
      }
    } while (!step.done);
    return step.value;
  }

  /* ---------------- WAV ---------------- */
  function* encodeWAVSteps(pcm, sr, bits) {
    sr = sr || 16000; bits = bits || 16;
    if ([16, 24, 32].indexOf(bits) < 0) throw new Error('不支持的 WAV 位深');
    var channels = Array.isArray(pcm) ? pcm : [pcm];
    var ch = channels.length, frames = ch ? channels[0].length : 0, bytes = bits / 8;
    if (!ch || channels.some(function (c) { return c.length !== frames; })) throw new Error('声道长度不一致');
    var dataLen = frames * ch * bytes;
    var buf = new ArrayBuffer(44 + dataLen);
    var v = new DataView(buf);
    function str(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true);
    v.setUint16(22, ch, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * bytes, true); v.setUint16(32, ch * bytes, true);
    v.setUint16(34, bits, true); str(36, 'data'); v.setUint32(40, dataLen, true);
    var o = 44;
    for (var i = 0; i < frames; i++) {
      if ((i & 4095) === 0) yield;
      for (var c = 0; c < ch; c++) {
        var s = Math.max(-1, Math.min(1, channels[c][i]));
        if (bits === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
        else if (bits === 24) {
          var q = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
          v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); o += 3;
        } else { v.setFloat32(o, s, true); o += 4; }
      }
    }
    return buf;
  }
  IO.encodeWAV = function (pcm, sr, bits) { return finishSteps(encodeWAVSteps(pcm, sr, bits)); };
  IO.encodeWAVAsync = function (pcm, sr, bits) { return responsiveSteps(encodeWAVSteps(pcm, sr, bits)); };

  IO.packZip = async function (files) {
    var flate = root.fflate;
    if (!flate && typeof require === 'function') flate = require('./fflate.js');
    var chunks = [], total = 0, count = 0;
    // Store each WAV as it is encoded without concatenating another archive-sized buffer.
    var zip = new flate.Zip(function (err, chunk) {
      if (err) throw err;
      total += chunk.byteLength;
      if (total >= 0xffffffff) throw new Error('ZIP 超出大小或文件数限制');
      chunks.push(chunk);
    });
    for await (var file of files) {
      if (++count >= 0xffff || total + file.bytes.byteLength >= 0xffffffff) throw new Error('ZIP 超出大小或文件数限制');
      var entry = new flate.ZipPassThrough(file.name);
      zip.add(entry);
      entry.push(new Uint8Array(file.bytes), true);
    }
    zip.end();
    return new Blob(chunks, { type: 'application/zip' });
  };

  function lanczosKernel(half, f) {
    var taps = half * 2, weights = new Float64Array(taps), sum = 0;
    for (var m = 0; m < taps; m++) {
      var k = m - half + 1, x = f - k;
      var w = Math.abs(x) < 1e-9 ? 1 :
        Math.abs(x) >= half ? 0 :
        (Math.sin(Math.PI * x) / (Math.PI * x)) * (Math.sin(Math.PI * x / half) / (Math.PI * x / half));
      weights[m] = w; sum += w;
    }
    if (sum) for (var j = 0; j < taps; j++) weights[j] /= sum;
    return weights;
  }

  // Upsample only the mono vocal when mixing with a higher-rate accompaniment.
  // Both tracks start at time zero; preserve the longest tail and L/R separation.
  function* mixAudioSteps(vocal, accompaniment, vocalGain, accompanimentGain, opt) {
    var sinc = !!(opt && opt.resample === 'sinc');
    var sources = [];
    if (vocal) sources.push({ audio: vocal, gain: vocalGain });
    if (accompaniment) sources.push({ audio: accompaniment, gain: accompanimentGain });
    if (!sources.length) return null;
    var sr = 0, count = 1, duration = 0;
    sources.forEach(function (s) {
      sr = Math.max(sr, s.audio.sr); count = Math.max(count, s.audio.channels.length);
      duration = Math.max(duration, s.audio.channels[0].length / s.audio.sr);
    });
    var length = Math.ceil(duration * sr), channels = [];
    for (var c = 0; c < count; c++) channels.push(new Float32Array(length));
    for (var si = 0; si < sources.length; si++) {
      var s = sources[si];
      if (!s.gain) continue;
      var ratio = s.audio.sr / sr, exact = s.audio.sr === sr;
      var half = 6, taps = half * 2, factor = ratio < 1 ? Math.round(1 / ratio) : 0;
      var poly = sinc && factor > 1 && Math.abs(ratio * factor - 1) < 1e-9 ?
        Array.from({ length: factor }, function (_, ph) { return lanczosKernel(half, ph / factor); }) : null;
      if (s.audio.channels.length === 1 && count > 1) {
        var monoIn = s.audio.channels[0];
        var monoEnd = Math.min(length, exact ? monoIn.length : Math.ceil(monoIn.length / ratio)), monoGain = s.gain;
        if (exact) {
          for (var mi = 0; mi < monoEnd; mi++) {
            if ((mi & 4095) === 0) yield;
            var mv0 = monoIn[mi] * monoGain;
            for (var mc0 = 0; mc0 < count; mc0++) channels[mc0][mi] += mv0;
          }
        } else if (sinc && ratio < 1) {
          var monoN = monoIn.length;
          for (var mi2 = 0; mi2 < monoEnd; mi2++) {
            if ((mi2 & 4095) === 0) yield;
            var mpos = mi2 * ratio, ma = Math.floor(mpos), mw = poly ? poly[mi2 % factor] : lanczosKernel(half, mpos - ma);
            var macc = 0;
            for (var mm = 0; mm < taps; mm++) {
              var midx = ma + mm - half + 1;
              if (midx >= 0 && midx < monoN) macc += monoIn[midx] * mw[mm];
            }
            var mv1 = macc * monoGain;
            for (var mc1 = 0; mc1 < count; mc1++) channels[mc1][mi2] += mv1;
          }
        } else {
          for (var mi3 = 0; mi3 < monoEnd; mi3++) {
            if ((mi3 & 4095) === 0) yield;
            var mpos2 = mi3 * ratio, ma2 = Math.floor(mpos2), mf = mpos2 - ma2;
            var mv2 = (monoIn[ma2] * (1 - mf) + monoIn[Math.min(ma2 + 1, monoIn.length - 1)] * mf) * monoGain;
            for (var mc2 = 0; mc2 < count; mc2++) channels[mc2][mi3] += mv2;
          }
        }
        continue;
      }
      for (var c = 0; c < count; c++) {
        var input = s.audio.channels[Math.min(c, s.audio.channels.length - 1)], output = channels[c];
        var end = Math.min(length, exact ? input.length : Math.ceil(input.length / ratio)), gain = s.gain;
        if (exact) {
          for (var i = 0; i < end; i++) {
            if ((i & 4095) === 0) yield;
            output[i] += input[i] * gain;
          }
        } else if (sinc && ratio < 1) {
          var nIn = input.length;
          for (var i = 0; i < end; i++) {
            if ((i & 4095) === 0) yield;
            var pos = i * ratio, a = Math.floor(pos), w = poly ? poly[i % factor] : lanczosKernel(half, pos - a);
            var acc = 0;
            for (var m = 0; m < taps; m++) {
              var idx = a + m - half + 1;
              if (idx >= 0 && idx < nIn) acc += input[idx] * w[m];
            }
            output[i] += acc * gain;
          }
        } else {
          for (var i = 0; i < end; i++) {
            if ((i & 4095) === 0) yield;
            var pos = i * ratio, a = Math.floor(pos), f = pos - a;
            output[i] += (input[a] * (1 - f) + input[Math.min(a + 1, input.length - 1)] * f) * gain;
          }
        }
      }
    }
    var peak = 0;
    for (var c = 0; c < count; c++) for (var i = 0; i < length; i++) {
      if ((i & 4095) === 0) yield;
      peak = Math.max(peak, Math.abs(channels[c][i]));
    }
    if (peak > 0.92 && NSG.DSP && typeof NSG.DSP.limitLookahead === 'function') {
      yield;
      NSG.DSP.limitLookahead(channels, sr, 0.92, 0.97);
    } else if (peak > 0.99) {
      for (var c = 0; c < count; c++) for (var i = 0; i < length; i++) {
        if ((i & 4095) === 0) yield;
        channels[c][i] *= 0.99 / peak;
      }
    }
    return { channels: channels, sr: sr };
  }
  IO.mixAudio = function (vocal, accompaniment, vg, ag, opt) { return finishSteps(mixAudioSteps(vocal, accompaniment, vg, ag, opt)); };
  IO.mixAudioAsync = function (vocal, accompaniment, vg, ag, opt) { return responsiveSteps(mixAudioSteps(vocal, accompaniment, vg, ag, opt)); };

  // Ask for a destination while the click still has user activation, before
  // rendering/encoding audio. A file:// Blob download can receive ZoneId=4 on
  // Windows. The native save path still follows the browser's security policy.
  IO.download = async function (data, name) {
    var handle = null;
    if (typeof root.showSaveFilePicker === 'function' && root.isSecureContext !== false) {
      var ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      var formats = {
        '.wav': ['WAV 音频', 'audio/wav'], '.mid': ['MIDI 乐谱', 'audio/midi'],
        '.nsg': ['NSG 工程', 'application/json'], '.ufdata': ['UtaFormatix 数据', 'application/json'],
        '.zip': ['ZIP 压缩包', 'application/zip']
      };
      var options = { suggestedName: name };
      if (formats[ext]) {
        var accept = {}; accept[formats[ext][1]] = [ext];
        options.types = [{ description: formats[ext][0], accept: accept }];
      }
      try { handle = await root.showSaveFilePicker(options); }
      catch (e) {
        if (e.name === 'AbortError') return null; // Cancel must not start a download.
        throw e; // Do not silently retry a denied save through another path.
      }
    }
    var blobOrBuf = typeof data === 'function' ? await data() : data;
    var blob = blobOrBuf instanceof Blob ? blobOrBuf : new Blob([blobOrBuf]);
    if (handle) {
      var stream = await handle.createWritable();
      try { await stream.write(blob); await stream.close(); }
      catch (e) {
        try { await stream.abort(); } catch (ignored) { }
        throw e;
      }
      return { method: 'save', name: handle.name || name };
    }
    // Compatibility path for browsers without the native save API. Download
    // initiation is observable here; successful disk persistence is not.
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    try { a.click(); }
    finally { setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 60000); }
    return { method: 'download', name: name };
  };

  /* ---------------- 文本解码 ----------------
     工程文件的编码五花八门：DSC / SVP / USTX / ufdata / NSG 是 UTF-8（DSC 带 BOM），
     VSQX 由 XML 声明指定（老工程常是 Shift-JIS / GBK，Windows 工具还写 UTF-16），
     VOCALOID2 .vsq 的文本元事件与 MIDI 的 FF05 歌词是逐字节的。

     关键：GBK 与 Shift-JIS 的双字节区间大量重叠，「哪个不抛异常就用哪个」是错的。
       0x82 0xA0 用 GBK 解是「偁」，用 Shift-JIS 解才是「あ」；
       0xD6 0xD0 用 Shift-JIS 解会变成两个半角片假名「ﾖﾐ」。
     两者几乎都能「解成功」，先试谁全凭碰运气 —— 日文工程因此会变成
     「偨」「偱偂」一类生僻字。这里对每个候选编码各解一遍，按
     「字节结构 + 解出来的字符」打分，取分最高的那个。 */
  var TEXT_ENCS = ['utf-8', 'shift_jis', 'euc-jp', 'gbk'];
  var ENC_ALIAS = {
    'utf-8': 'utf-8', 'utf8': 'utf-8', 'utf-8-sig': 'utf-8',
    'shift-jis': 'shift_jis', 'sjis': 'shift_jis', 'x-sjis': 'shift_jis',
    'cp932': 'shift_jis', 'ms-kanji': 'shift_jis', 'windows-31j': 'shift_jis',
    'shift-jis-x0213': 'shift_jis',
    'euc-jp': 'euc-jp', 'eucjp': 'euc-jp', 'x-euc-jp': 'euc-jp',
    'gbk': 'gbk', 'gb2312': 'gbk', 'gb18030': 'gbk', 'cp936': 'gbk', 'chinese': 'gbk',
    'utf-16': 'utf-16le', 'utf-16le': 'utf-16le', 'utf-16be': 'utf-16be', 'unicode': 'utf-16le'
  };
  function normEnc(e) {
    return ENC_ALIAS[String(e || '').toLowerCase().replace(/_/g, '-').trim()] || '';
  }
  IO.normEnc = normEnc;
  function toU8(x) {
    return x instanceof Uint8Array ? x : new Uint8Array(x);
  }
  function latin1(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  /* 字节结构分：不合法的序列直接淘汰该编码；合法区间再按「像不像本文字」给分。
     GBK 的 0x81–0xA0 / 0xAA– 是扩展生僻字区，日文假名按 GBK 解全落在这里，
     所以给负分；GB2312 的 0xB0A1–0xF7FE 常用汉字区给正分。 */
  function byteScore(b, enc) {
    var n = b.length, s = 0, i = 0;
    while (i < n) {
      var x = b[i];
      if (x < 0x80) {
        s += (x >= 0x20 || x === 9 || x === 10 || x === 13) ? 0.2 : -6;
        i++; continue;
      }
      if (x === 0x7f) { s -= 6; i++; continue; }
      if (enc === 'utf-8') {
        var len = x >= 0xf0 && x <= 0xf4 ? 4 : x >= 0xe0 ? 3 : x >= 0xc0 ? 2 : 0;
        if (!len) return -1e9;
        for (var k = 1; k < len; k++) if (i + k >= n || (b[i + k] & 0xc0) !== 0x80) return -1e9;
        s += len >= 3 ? 3 : 2; i += len; continue;
      }
      if (enc === 'shift_jis') {
        if (x >= 0xa1 && x <= 0xdf) { s += 0.3; i++; continue; }   // 半角片假名单字节
        if (!((x >= 0x81 && x <= 0x9f) || (x >= 0xe0 && x <= 0xfc))) return -1e9;
        if (i + 1 >= n) return -1e9;
        var t = b[i + 1];
        if (!((t >= 0x40 && t <= 0x7e) || (t >= 0x80 && t <= 0xfc))) return -1e9;
        s += (x === 0x81 || x === 0x82 || x === 0x83) ? 4 : 2.5;   // 假名/日文标点/汉字
        i += 2; continue;
      }
      if (enc === 'euc-jp') {
        if (x === 0x8e || x === 0x8f) {                              // SS2 半角 / JIS X 0212
          var step = x === 0x8e ? 2 : 3;
          if (i + step > n) return -1e9;
          s += 1; i += step; continue;
        }
        if (x < 0xa1 || x > 0xfe || i + 1 >= n || b[i + 1] < 0xa1 || b[i + 1] > 0xfe) return -1e9;
        s += (x === 0xa4 || x === 0xa5) ? 4 : 2.5;                   // 平/片假名区
        i += 2; continue;
      }
      /* gbk */
      if (x < 0x81 || x > 0xfe || i + 1 >= n) return -1e9;
      var g = b[i + 1];
      if (g < 0x40 || g === 0x7f || g > 0xfe) return -1e9;
      if (x >= 0xb0 && x <= 0xf7 && g >= 0xa1) s += 3;               // GB2312 常用汉字
      else if (x <= 0xa0 || x >= 0xaa) s -= 3;                        // 扩展生僻字区：乱码高发
      else s += 0.8;                                                  // 标点/符号区
      i += 2;
    }
    return s;
  }

  /* 解出来的字符分：全角假名是日语的铁证；半角片假名要弱给分，
     因为中文 GBK 被错解成 Shift-JIS 时也会冒出一串半角片假名。 */
  function charScore(text) {
    var s = 0, fullKana = 0, cjk = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) continue;
      if (c >= 0x3040 && c <= 0x30ff) { s += 6; fullKana++; }
      else if ((c >= 0x31f0 && c <= 0x31ff) || (c >= 0x3000 && c <= 0x303f)) { s += 4; fullKana++; }
      else if (c >= 0xff61 && c <= 0xff9f) s += 0.2;
      else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) { s += 0.3; cjk++; }
      else if (c === 0xfffd || c < 0x20) s -= 8;
    }
    if (fullKana && !cjk) s += fullKana * 2;      // 纯假名串几乎只可能是日语
    return s;
  }

  function tryDecode(b, enc) {
    if (enc === 'utf-16le' || enc === 'utf-16be') {
      try { return { text: new TextDecoder(enc, { fatal: true }).decode(b), enc: enc, score: 1 }; }
      catch (e) { return null; }
    }
    var text;
    try { text = new TextDecoder(enc, { fatal: true }).decode(b); } catch (e) { return null; }
    var bs = byteScore(b, enc);
    if (bs <= -1e8) return null;
    return { text: text, enc: enc, score: bs + charScore(text) };
  }
  IO.tryDecode = tryDecode;

  /* XML 声明里的 encoding 是强提示（+12 分），但不是铁律：
     确实有导出器声明 UTF-8 却写 Shift-JIS 字节，内容分能把它否决。 */
  function xmlDeclaredEnc(b) {
    var h = latin1(b.subarray(0, Math.min(256, b.length)));
    var m = h.match(/<\?xml[\s\S]{0,200}?encoding\s*=\s*["']([^"']+)["']/i);
    return m ? normEnc(m[1]) : '';
  }

  IO.decodeText = function (buf, hint) {
    var b = toU8(buf), skip = 0, enc16 = '', bomUtf8 = false;
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { enc16 = 'utf-16le'; skip = 2; }
    else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) { enc16 = 'utf-16be'; skip = 2; }
    else if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { skip = 3; bomUtf8 = true; }
    var body = b.subarray(skip);
    if (enc16) {
      /* Windows 工具常写带 BOM 的 UTF-16；非严格模式只是兜底，缺 BOM 时不猜 UTF-16 */
      try { return { text: new TextDecoder(enc16, { fatal: true }).decode(body), enc: enc16 }; }
      catch (e) { try { return { text: new TextDecoder(enc16).decode(body), enc: enc16 }; } catch (e2) { } }
    }
    var declared = normEnc(hint) || xmlDeclaredEnc(body) || (bomUtf8 ? 'utf-8' : '');
    /* 纯 ASCII 不必评分（四种编码结果完全一样） */
    var hasHigh = false;
    for (var z = 0; z < body.length; z++) if (body[z] >= 0x80) { hasHigh = true; break; }
    if (!hasHigh) return { text: new TextDecoder('utf-8').decode(body), enc: 'utf-8' };
    function bestOf(sample) {
      var best = null;
      for (var i = 0; i < TEXT_ENCS.length; i++) {
        var r = tryDecode(sample, TEXT_ENCS[i]);
        if (!r) continue;
        if (r.enc === declared) r.score += 12;
        if (!best || r.score > best.score) best = r;
      }
      return best;
    }
    /* 25MB 的工程没必要把四种编码各解一遍：前 256KB 里既有 XML 声明也有歌词，
       足够定编码；判完再只解一次全份。若全份严格解失败或出现替换符，
       说明样本不具代表性（例如前面全是参数表、歌词在文件末尾），退回全量评分。 */
    var SCORE_MAX = 262144;
    var probe = body.length > SCORE_MAX ? body.subarray(0, SCORE_MAX) : body;
    var chosen = bestOf(probe);
    if (chosen) {
      if (probe.length === body.length) return { text: chosen.text, enc: chosen.enc };
      var full = null;
      try { full = new TextDecoder(chosen.enc, { fatal: true }).decode(body); } catch (e) { }
      if (full !== null && full.indexOf('\ufffd') < 0) return { text: full, enc: chosen.enc };
    }
    var fallback = bestOf(body);
    if (fallback) return { text: fallback.text, enc: fallback.enc };
    return { text: latin1(body), enc: 'latin1' };
  };

  /* 猜一小段字节的编码（MIDI 歌词元事件、轨名、VSQ 的 DM 文本）。
     list 可以是 Uint8Array，也可以是它们组成的数组 —— 按段分别解，
     不拼起来，免得段与段交界处凑出一个假的汉字。 */
  IO.detectEnc = function (list, hint) {
    var arrs;
    if (list instanceof Uint8Array || (Array.isArray(list) && (list.length === 0 || typeof list[0] === 'number'))) {
      arrs = [toU8(list)];
    } else {
      arrs = (list || []).map(toU8);
    }
    /* 纯半角片假名字节流（0xA1–0xDF）没有第二种解释 */
    var flat = [];
    for (var q = 0; q < arrs.length && flat.length < 512; q++) {
      for (var w = 0; w < arrs[q].length && flat.length < 512; w++) flat.push(arrs[q][w]);
    }
    if (flat.length && flat.every(function (v) { return v >= 0xa1 && v <= 0xdf; })) return 'shift_jis';
    var declared = normEnc(hint), best = 'utf-8', bestScore = -Infinity;
    for (var e = 0; e < TEXT_ENCS.length; e++) {
      var enc = TEXT_ENCS[e], total = 0, fails = 0;
      for (var i = 0; i < arrs.length && i < 200; i++) {
        var r = tryDecode(arrs[i], enc);
        if (r) total += r.score; else { total -= 20; fails++; }
      }
      if (fails > Math.max(1, Math.min(arrs.length, 200)) * 0.5) continue;
      if (enc === declared) total += 12;
      if (total > bestScore) { bestScore = total; best = enc; }
    }
    return bestScore === -Infinity ? 'utf-8' : best;
  };

  /* 只解一小段字节：优先用传入的编码，没有就按内容猜。 */
  IO.decodeBytes = function (bytes, prefer) {
    var arr = toU8(bytes);
    var enc = normEnc(prefer) || IO.detectEnc([arr]);
    var r = tryDecode(arr, enc);
    if (r) return r.text;
    for (var i = 0; i < TEXT_ENCS.length; i++) {
      var r2 = tryDecode(arr, TEXT_ENCS[i]);
      if (r2) return r2.text;
    }
    return latin1(arr);
  };

  /* ---------------- 格式嗅探 ---------------- */
  function isTuneLabProject(j) {
    return j && Number.isInteger(j.version) && Array.isArray(j.tempos) &&
      Array.isArray(j.timeSignatures) && Array.isArray(j.tracks);
  }
  function isVPRProject(j) {
    return j && j.version && Number.isInteger(j.version.major) && j.masterTrack && Array.isArray(j.tracks);
  }
  function sniffCore(buf, name) {
    var b = toU8(buf);
    var nm = String(name || '').toLowerCase();
    var out = { kind: 'unknown', bytes: b, decoded: null, json: null, cbor: null };
    function done(k) { out.kind = k; return out; }
    /* ACE Studio 2.x 是二进制容器（'ACEP'+版本号），文本嗅探一定失手 */
    if (IO.isACEPBinary(b)) return done('acep');
    if (IO.isVCPBinary(b)) return done('vcp');
    if (IO.isVSPBinary(b)) return done('vsp');
    var signature = latin1(b.subarray(0, 17));
    if (signature.startsWith('SHARPKEY')) return done(/\.sk$/.test(nm) ? 'sk' : 'dv');
    if (signature.startsWith('TSSolution\0')) return done('tssln');
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) {
      if (/\.vog$/.test(nm)) return done('vog');
      try {
        if (zipProjectEntry(b, 'Project/sequence.json', 'VPR')) return done('vpr');
        if (zipProjectEntry(b, 'chart.json', 'Vogen')) return done('vog');
      } catch (ignored) { }
      return done(/\.vpr$/.test(nm) ? 'vpr' : 'unknown');
    }
    var projectExt = nm.match(/\.(ccs|ccst|tssln|dv|sk|mtp|vspx|vog|y77|aisp)$/);
    if (projectExt) return done(projectExt[1]);
    // TLPX is a bare CBOR map, without a file magic; inspect its root fields.
    if (b.length && (b[0] >> 5 === 5 || b[0] >> 5 === 6)) {
      try {
        var cborObj = cborDecode(b, true);
        if (isTuneLabProject(cborObj)) { out.cbor = cborObj; return done('tlpx'); }
      } catch (ignored) { }
    }
    /* 带 BOM 的 UTF-16 头部是交错空字节，必须先按 BOM 解出来再嗅探 */
    var enc16 = (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) ? 'utf-16le'
      : (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) ? 'utf-16be' : '';
    var head = '';
    if (enc16) {
      try { head = new TextDecoder(enc16).decode(b.subarray(2, Math.min(2 + 256, b.length))).slice(0, 120); }
      catch (e) { head = ''; }
    } else {
      var off = (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) ? 3 : 0;
      for (var i = off; i < Math.min(off + 96, b.length); i++) head += String.fromCharCode(b[i]);
    }
    if (head.indexOf('MThd') === 0) return done('smf');               // MIDI 与 VOCALOID2 .vsq
    if (/^\s*\[#(?:VERSION|SETTING|\d+)\]/i.test(head)) return done('ust');
    // 袅袅：数字头（速度、拍号、小节数、版本等），下一行是音符数。
    if (/^\s*\d+(?:\.\d+)?(?:[ \t]+\d+){9}[ \t]*\r?\n\d+[ \t]*(?:\r?\n|$)/.test(head)) return done('nn');
    var xmlHead = head.replace(/^\s*<\?xml[^?]*\?>\s*/, '').trimStart();
    if (/^<(?:Scenario|Definition)(?:[\s>])/.test(xmlHead)) return done('ccs');
    if (/^<VSPX(?:[\s>])/.test(xmlHead)) return done('vspx');
    if (/^\s*<\?xml|^\s*<vsq/m.test(head)) return done('vsqx');
    var h = head.replace(/^\uFEFF/, '').replace(/^\s+/, '');
    if (h.charAt(0) === '{') {
      var decoded = IO.decodeText(b);
      out.decoded = decoded;
      var jsonText = decoded.text, t = jsonText.slice(0, 600);
      // 3.x 袅袅使用 JSON；轨道字段可能排在很长的声库路径/参数之后。
      // 检查顶层结构，不能把 JSON 默认送给 SVP，也不能匹配歌词里的字段名。
      try {
        var json = JSON.parse(jsonText);
        out.json = json;
        if (json && Object.prototype.hasOwnProperty.call(json, 'track_dict_list')) return done('nn');
        if (isTuneLabProject(json)) return done('tlp');
        if (isVPRProject(json)) return done('vpr');
      } catch (ignored) { }
      if (/"文件签名"\s*:\s*"/.test(t)) return done('dsc');
      if (/"formatVersion"\s*:/.test(t)) return done('ufdata');
      if (/"format"\s*:\s*"NSG-SCORE"/.test(t)) return done('nsg');
      if (/\.acep$/.test(nm) || /"compressMethod"\s*:/.test(t)) return done('acep');
      if (/"library"|"time"\s*:/.test(t)) return done('svp');
      if (/"project"\s*:/.test(t)) return done('ufdata');
      if (/\.nn$/.test(nm)) return done('nn');
      if (/\.tlpx?$/.test(nm)) return done('tlp');
      return done(/\.dsc$/.test(nm) ? 'dsc' : 'svp');
    }
    if (/ustx_version\s*:|^name\s*:|voice_parts\s*:/.test(head)) return done('ustx');
    if (/\.ustx$/.test(nm)) return done('ustx');
    if (/\.ust$/.test(nm)) return done('ust');
    if (/\.nn$/.test(nm)) return done('nn');
    if (/\.tlpx$/.test(nm)) return done('tlpx');
    if (/\.tlp$/.test(nm)) return done('tlp');
    if (/\.vpr$/.test(nm)) return done('vpr');
    if (/\.acep$/.test(nm)) return done('acep');
    if (/\.dsc$/.test(nm)) return done('dsc');
    if (/\.ufdata$|\.ufd$/.test(nm)) return done('ufdata');
    if (/\.vsqx$|\.vsq$/.test(nm)) return done('vsqx');
    if (/\.svp$/.test(nm)) return done('svp');
    if (/\.mid|\.midi$/.test(nm)) return done('smf');
    return out;
  }
  IO.sniff = function (buf, name) {
    return sniffCore(buf, name).kind;
  };

  /* ---------------- MIDI 读取 ----------------
     重点：歌词只认 FF 05（Lyric）元事件。旧版把 FF 01（任意文本）也当歌词，
     于是 VOCALOID 导出的 MIDI 里「0001: PBS=-40;0 PBW=40…」这类参数串
     被当成歌词塞进每个音符，卷帘上全是乱码。
     另外按轨分开：带歌词的轨按人声处理，其余轨自动落到伴奏轨。 */
  function PROG_INST(p) { return NSG.Instruments.fromProgram(clamp(p | 0, 0, 127)); }
  var DRUM_MAP = { 35: 'kick', 36: 'kick', 37: 'rim', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tom', 42: 'hat', 43: 'tom', 44: 'hat', 45: 'tom', 46: 'openhat', 47: 'tom', 48: 'tom', 49: 'crash', 50: 'tom', 51: 'ride', 52: 'crash', 53: 'ride', 55: 'crash', 57: 'crash', 59: 'ride' };
  IO.DRUM_MAP = DRUM_MAP;
  IO.progToInst = PROG_INST;

  IO.readMIDI = function (buf) {
    var v = new DataView(buf);
    var pos = 0;
    function u8() { return v.getUint8(pos++); }
    function u16() { var x = v.getUint16(pos); pos += 2; return x; }
    function u32() { var x = v.getUint32(pos); pos += 4; return x; }
    function tag() { var s = ''; for (var i = 0; i < 4; i++) s += String.fromCharCode(u8()); return s; }
    if (tag() !== 'MThd') throw new Error('不是有效的 MIDI 文件');
    u32(); u16();
    var ntrk = u16(), div = u16();
    if (div & 0x8000) throw new Error('不支持 SMPTE 时基的 MIDI');

    var tracks = [], tempos = [], dmAllBytes = [], allLyricBytes = [], channelSettings = [];
    for (var t = 0; t < ntrk; t++) {
      if (pos + 8 > v.byteLength) break;
      var tk = tag(); var len = u32(); var end = Math.min(v.byteLength, pos + len);
      if (tk !== 'MTrk') { pos = end; continue; }
      var tick = 0, running = 0, active = {}, notes = [], lyrBytes = [], prog = 0, hadLyric = false;
      var programs = new Array(16).fill(0), banksMSB = new Array(16).fill(0), banksLSB = new Array(16).fill(0), programChanges = [];
      var trChannelVol = Object.create(null), trChannelPan = Object.create(null);
      var nameBytes = null, trDmBytes = [];
      while (pos < end) {
        var d = 0, b;
        do { b = u8(); d = (d << 7) | (b & 0x7f); } while (b & 0x80);
        tick += d;
        if (pos >= end) break;
        var st = v.getUint8(pos);
        var eventOrder = pos;
        if (st & 0x80) { pos++; running = st; } else st = running;
        var hi = st & 0xf0, chn = st & 0x0f;
        if (hi === 0x90 || hi === 0x80) {
          var nn = u8(), vv = u8();
          var noteKey = chn + ':' + nn;
          if (hi === 0x90 && vv > 0) {
            (active[noteKey] = active[noteKey] || []).push({ tick: tick, vel: vv, ch: chn,
              program: programs[chn], bankMSB: banksMSB[chn], bankLSB: banksLSB[chn], order: eventOrder });
          } else {
            var arr = active[noteKey];
            if (arr && arr.length) {
              var st0 = arr.shift();
              notes.push({ startTick: st0.tick, durTick: Math.max(1, tick - st0.tick), pitch: nn, vel: st0.vel, ch: st0.ch,
                program: st0.program, bankMSB: st0.bankMSB, bankLSB: st0.bankLSB, order: st0.order });
            }
          }
        } else if (hi === 0xb0) {
          var cc = u8(), value = u8();
          if (cc === 0) banksMSB[chn] = value;
          if (cc === 32) banksLSB[chn] = value;
          if (cc === 7) trChannelVol[chn] = value;
          if (cc === 10) trChannelPan[chn] = value;
          if (cc === 0 || cc === 32 || cc === 7 || cc === 10) channelSettings.push({ tick: tick, order: eventOrder, channel: chn, cc: cc, value: value });
        } else if (hi === 0xa0 || hi === 0xe0) { pos += 2; }
        else if (hi === 0xc0) {
          prog = u8(); programs[chn] = prog;
          var change = { beat: tick / div, channel: chn, program: prog, bankMSB: banksMSB[chn], bankLSB: banksLSB[chn] };
          programChanges.push(change);
          channelSettings.push({ tick: tick, order: eventOrder, channel: chn, program: prog, change: change });
        }
        else if (hi === 0xd0) { pos += 1; }
        else if (st === 0xff) {
          var type = u8(), mlen = 0, mb;
          do { mb = u8(); mlen = (mlen << 7) | (mb & 0x7f); } while (mb & 0x80);
          if (type === 0x51 && mlen === 3) {
            var us2 = (v.getUint8(pos) << 16) | (v.getUint8(pos + 1) << 8) | v.getUint8(pos + 2);
            if (us2 > 0) tempos.push({ tick: tick, bpm: 60000000 / us2 });          } else if (type === 0x05) {
            var lb = new Uint8Array(mlen);
            for (var i2 = 0; i2 < mlen; i2++) lb[i2] = v.getUint8(pos + i2);
            lyrBytes.push({ tick: tick, bytes: lb, order: lyrBytes.length });
            hadLyric = true;
          } else if (type === 0x01) {
            /* VOCALOID2 的 VSQ 把工程写在这些文本里，按轨收集「原始字节」。
               以前存成 latin1 字符串、再靠 decodeURIComponent(escape(s)) 反推 UTF-8，
               遇到 Shift-JIS 的假名就解不出、退成乱码（偨、偱偂一类）。
               现在统一在整份文件判完编码之后再解。 */
            var raw = [];
            for (var i3 = 0; i3 < Math.min(mlen, 4096); i3++) raw.push(v.getUint8(pos + i3));
            /* "DM:nnnn:" 是块号，不是工程文本。必须在字节层抹掉：
               导出器按固定字节数切块，切点会落在双字节字符中间，
               前缀混在里面会让解码错位（Shift-JIS 假名尤其容易中招）。 */
            var pfx = 0;
            if (raw.length > 4 && raw[0] === 0x44 && raw[1] === 0x4d && raw[2] === 0x3a) {
              var j3 = 3;
              while (j3 < raw.length && raw[j3] >= 0x30 && raw[j3] <= 0x39) j3++;
              if (j3 < raw.length && j3 > 3 && raw[j3] === 0x3a) pfx = j3 + 1;
            }
            if (pfx || trDmBytes.length) {
              for (var k3 = pfx; k3 < raw.length; k3++) {
                trDmBytes.push(raw[k3]); dmAllBytes.push(raw[k3]);
              }
            }
          } else if (type === 0x03 && !nameBytes) {
            var nb = new Uint8Array(mlen);
            for (var i4 = 0; i4 < mlen; i4++) nb[i4] = v.getUint8(pos + i4);
            nameBytes = nb;
          }
          pos += mlen;
        } else if (st === 0xf0 || st === 0xf7) {
          var sl = 0, sb;
          do { sb = u8(); sl = (sl << 7) | (sb & 0x7f); } while (sb & 0x80);
          pos += sl;
        } else { pos += 1; }
      }
      pos = end;
      notes.sort(function (a, b) { return a.startTick - b.startTick || a.pitch - b.pitch; });
      lyrBytes.forEach(function (x) { allLyricBytes.push(x.bytes); });
      tracks.push({
        index: t, nameBytes: nameBytes, notes: notes, lyricRaw: lyrBytes,
        prog: prog, programChanges: programChanges, hadLyric: hadLyric, dmBytes: trDmBytes,
        channelVol: trChannelVol, channelPan: trChannelPan
      });
    }

    // Channel settings belong to the whole SMF, including a separate setup track.
    // Resolve them in musical time; track/file order only breaks simultaneous ties.
    channelSettings.sort(function (a, b) { return a.tick - b.tick || a.order - b.order; });
    var channelPrograms = new Array(16).fill(0), channelMSB = new Array(16).fill(0), channelLSB = new Array(16).fill(0);
    var channelVol = new Array(16).fill(undefined), channelPan = new Array(16).fill(undefined), settingIndex = 0;
    function setting(s) {
      if (s.program !== undefined) {
        channelPrograms[s.channel] = s.program;
        s.change.bankMSB = channelMSB[s.channel]; s.change.bankLSB = channelLSB[s.channel];
      } else if (s.cc === 0) channelMSB[s.channel] = s.value;
      else if (s.cc === 32) channelLSB[s.channel] = s.value;
      else if (s.cc === 7) channelVol[s.channel] = s.value;
      else if (s.cc === 10) channelPan[s.channel] = s.value;
    }
    var allMidiNotes = [];
    tracks.forEach(function (tr) { allMidiNotes = allMidiNotes.concat(tr.notes); });
    allMidiNotes.sort(function (a, b) { return a.startTick - b.startTick || a.order - b.order; }).forEach(function (n) {
      while (settingIndex < channelSettings.length && (channelSettings[settingIndex].tick < n.startTick ||
        (channelSettings[settingIndex].tick === n.startTick && channelSettings[settingIndex].order < n.order))) setting(channelSettings[settingIndex++]);
      n.program = channelPrograms[n.ch]; n.bankMSB = channelMSB[n.ch]; n.bankLSB = channelLSB[n.ch];
      delete n.order;
    });
    while (settingIndex < channelSettings.length) setting(channelSettings[settingIndex++]);

    /* 整份文件只判一次编码：歌词、轨名、VSQ 的 DM 文本全都用它。
       逐条歌词猜编码会在「单字假名」上翻车（一条 0x82 0xA0 用 GBK 也解得开）。 */
    var fileEnc = allLyricBytes.length ? IO.detectEnc(allLyricBytes)
      : dmAllBytes.length ? IO.detectEnc([Uint8Array.from(dmAllBytes)]) : 'utf-8';
    var dmEnc = dmAllBytes.length ? IO.detectEnc([Uint8Array.from(dmAllBytes)]) : fileEnc;
    var dmText = dmAllBytes.length ? IO.decodeBytes(Uint8Array.from(dmAllBytes), dmEnc) : '';
    tracks.forEach(function (tr) {
      tr.name = tr.nameBytes ? IO.decodeBytes(tr.nameBytes, fileEnc) : '';
      tr.lyrics = tr.lyricRaw.map(function (x) {
        return { tick: x.tick, text: IO.decodeBytes(x.bytes, fileEnc), order: x.order };
      });
      tr.dmText = tr.dmBytes.length ? IO.decodeBytes(Uint8Array.from(tr.dmBytes), dmEnc) : '';
      delete tr.nameBytes; delete tr.lyricRaw; delete tr.dmBytes;
    });
    var dmTrackInfo = tracks.filter(function (tr) { return tr.dmText; });
    var dmTracks = dmTrackInfo.map(function (tr) { return tr.dmText; });

    var vocal = tracks.filter(function (tr) { return tr.notes.length; })[0];
    var bpm = tempos.length ? tempos[0].bpm : 120;
    /* 速度点：按 tick 排好再换算成拍，只留真正变化的点。
       分段 BPM 是长歌能不能对上的关键，导入时丢掉就再也补不回来。 */
    var tempoList = [];
    tempos.slice().sort(function (a, b) { return a.tick - b.tick; }).forEach(function (tp) {
      var beat = tp.tick / div;
      var last = tempoList[tempoList.length - 1];
      if (last && Math.abs(last.beat - beat) < 0.01) { last.bpm = Math.round(tp.bpm * 1000) / 1000; return; }
      if (last && Math.abs(last.bpm - tp.bpm) < 0.01) return;
      tempoList.push({ beat: Math.round(beat * 1000) / 1000, bpm: Math.round(tp.bpm * 1000) / 1000 });
    });
    if (!vocal) {
      /* 没有任何 note 事件：留给调用方判断这是不是 VOCALOID2 的 .vsq */
      return {
        format: 'MIDI', tempo: Math.round(bpm * 100) / 100, tempos: tempoList, notes: [], acc: null,
        dmText: dmText, dmTracks: dmTracks, dmTrackInfo: dmTrackInfo, enc: fileEnc
      };
    }

    function melodyNotes(vocal) {
      var out = vocal.notes.map(function (n) {
        return { start: n.startTick / div, dur: n.durTick / div, pitch: n.pitch, vel: n.vel, lyric: '',
          midiChannel: n.ch, midiProgram: n.program, midiBankMSB: n.bankMSB, midiBankLSB: n.bankLSB };
      });
      /* 歌词按时间顺序贴到音符上（同 tick 的歌词贴给最近的音符） */
      var li = 0;
      for (var i = 0; i < out.length && li < vocal.lyrics.length; i++) {
        var target = out[i].start * div, tol = div * 0.06;
        while (li < vocal.lyrics.length && vocal.lyrics[li].tick < target - tol) li++;
        if (li < vocal.lyrics.length && Math.abs(vocal.lyrics[li].tick - target) <= Math.max(tol, div * 0.5)) {
          setLyric(out[i], vocal.lyrics[li].text);
          li++;
        }
      }

      return out;
    }
    return withImportTracks({
      format: 'MIDI', tempo: Math.round(bpm * 100) / 100, tempos: tempoList,
      division: div, dmText: dmText, dmTracks: dmTracks, dmTrackInfo: dmTrackInfo, enc: fileEnc
    }, tracks.filter(function (tr) { return tr.notes.length; }).map(function (tr) {
      // Pure tempo/metadata tracks are not musical tracks.
      var ch = tr.notes[0].ch;
      var ccVol = tr.channelVol[ch] !== undefined ? tr.channelVol[ch] : channelVol[ch];
      var ccPan = tr.channelPan[ch] !== undefined ? tr.channelPan[ch] : channelPan[ch];
      var outTr = { name: tr.name || ('轨道 ' + (tr.index + 1)), notes: melodyNotes(tr), programChanges: tr.programChanges };
      var volVal = ccVol !== undefined ? clamp(ccVol / 100, 0, 2) : 1;
      var panVal = ccPan !== undefined ? (ccPan === 64 ? 0 : (ccPan < 64 ? (ccPan - 64) / 64 : (ccPan - 64) / 63)) : 0;
      return assignTrackMix(outTr, volVal, panVal, false);
    }));
  };

  /* ---------------- 歌词清理 ----------------
     VOCALOID 的 MIDI 里没有歌词元事件时，音符会挂空歌词；
     参数串（"0001: PBS=-40;…"）绝不能当歌词用 */
  function cleanLyric(s) {
    s = String(s === undefined || s === null ? '' : s);
    if (!s) return '';
    if (/^[0-9]{3,4}\s*:/.test(s)) return '';            // "0001: PBS=-40;..."
    if (/=\s*-?[\d.]/.test(s) && /[A-Za-z]{2,}=/.test(s)) return ''; // "mod=0 PBS=..."
    return s.replace(/[\u0000-\u001f]/g, '').trim();
  }
  IO.cleanLyric = cleanLyric;

  /* ---------------- 歌词语义：延音符与英语拆词 ----------------
     各家的「延续上一个音节」写法不一样：
       VOCALOID / SVP : "-"
       英语 USTX / SVP 的 "+" 是下一音节；USTX "+*" / "+~" 是延音。
       本软件          : "‿"（下标弧线，卷帘上画成一条连音线）
     保留 + / +* / +~，由当前音素器在运行时解释。其他显式延音兼容为
     「‿」与 slur 标记，不再发辅音，也不重新起音。
     英语把一个词拆到几个音符时（beau- / -ty），词内连字符要摘掉，
     只留音节本身，并记 wordJoin 表示它属于同一个词。 */
  function slurMark(s) { return /^(?:-|\+|\+\*|\+~|‿|＿|=|—)$/.test(s); }
  IO.lyricInfo = function (raw, format, lang) {
    var s = cleanLyric(raw);
    if (!s) return { lyric: '', slur: false, wordJoin: false };
    // Keep extension tokens as lyrics. The selected phonemizer interprets them
    // at render time; importing must not bake the guessed language into a word.
    if (s === '+') {
      return { lyric: '+', slur: false, wordJoin: true };
    }
    if (s === '+*' || s === '+~') return { lyric: s, slur: true, wordJoin: false };
    if (slurMark(s)) return { lyric: '‿', slur: true, wordJoin: false };
    var wj = false, direction;
    /* 只在「真的还有字母/假名/汉字」时才当作拆词连字符，避免把 '-' 吃掉 */
    if (s.length > 1) {
      if (/[-+]$/.test(s) && /[\w\u00C0-\u024F\u0E01-\u0E4E\u3040-\u30ff\u4e00-\u9fff]/.test(s.slice(0, -1))) {
        direction = /^[-+]/.test(s) ? 'middle' : 'right';
        s = s.replace(/^[-+]+|[-+]+$/g, ''); wj = true;
      } else if (/^[-+]/.test(s) && /[\w\u00C0-\u024F\u0E01-\u0E4E\u3040-\u30ff\u4e00-\u9fff]/.test(s.slice(1))) {
        s = s.replace(/^[-+]+/, ''); wj = true; direction = 'left';
      }
    }
    var info = { lyric: s, slur: false, wordJoin: wj };
    if (direction) info.wordJoinDirection = direction;
    return info;
  };

  /* 把歌词写进音符对象（统一入口，所有解析器都走这里） */
  function setLyric(o, raw, format, lang) {
    var li = IO.lyricInfo(raw, format, lang);
    o.lyric = li.lyric || 'a';
    if (lang) o.lang = lang;
    if (li.slur) o.slur = true;
    if (li.wordJoin) o.wordJoin = true;
    if (li.wordJoinDirection) o.wordJoinDirection = li.wordJoinDirection;
    return o;
  }
  IO.setLyric = setLyric;

  function importLang(value) {
    var key = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (/^(?:zh-)?hak(?:-|$)/.test(key) || /^(hakka|客家[話话語语]|客[語语])$/.test(key)) return 'hak';
    if (/^(nan-x-teochew|teochew|chaozhou|潮州[話话語语]|潮[語语])$/.test(key)) return 'nan-x-teochew';
    if (/^(?:zh|cmn)-x-(?:sichuan|chengdu)$/.test(key) || /^(sichuan(?:ese)?|chengdu|四川[話话語语]?|成都[話话語语]?|蜀[語语]|川[話话])$/.test(key)) return 'zh-x-sichuan';
    if (/^(?:art-x-)?(?:xdi8|shidinn|xiding)$/.test(key) || /^(希[顶頂][語语]?)$/.test(key)) return 'xdi8';
    if (/^(?:tlh|tlhingan(?:-hol)?|klingon|piqad)(?:-|$)/.test(key) || /^(克林[贡貢][語语]?)$/.test(key)) return 'tlh';
    if (/^eo(?:-|$)/.test(key) || /^(epo|esperanto|世界语)$/.test(key)) return 'eo';
    if (/^de(?:-|$)/.test(key) || /^(deu|ger|german|deutsch|德语)$/.test(key)) return 'de';
    if (/^pl(?:-|$)/.test(key) || /^(pol|polish|polski|波兰语)$/.test(key)) return 'pl';
    if (/^ru(?:-|$)/.test(key) || /^(rus|russian|русский|俄罗斯语|俄语)$/.test(key)) return 'ru';
    if (/^(uk|ua)(?:-|$)/.test(key) || /^(ukr|ukrainian|українська|украинский|乌克兰语)$/.test(key)) return 'uk';
    if (/^fi(?:-|$)/.test(key) || /^(fin|finnish|suomi|芬兰语)$/.test(key)) return 'fi';
    if (/^es(?:-|$)/.test(key) || /^(spa|spanish|español|castellano|西班牙语)$/.test(key)) return 'es';
    if (/^pt(?:-|$)/.test(key) || /^(por|portuguese|português|葡萄牙语)$/.test(key)) return 'pt';
    if (/^it(?:-|$)/.test(key) || /^(ita|italian|italiano|意大利语)$/.test(key)) return 'it';
    if (/^fr(?:-|$)/.test(key) || /^(fra|fre|french|français|法语)$/.test(key)) return 'fr';
    if (/^ro(?:-|$)/.test(key) || /^(ron|rum|romanian|română|româna|罗马尼亚语)$/.test(key)) return 'ro';
    if (/^(?:fil|tl|tgl)(?:-|$)/.test(key) || /^(filipino|tagalog|菲律宾语(?:（他加禄语）)?|他加禄语)$/.test(key)) return 'fil';
    if (/^(?:id|in|ind)(?:-|$)/.test(key) || /^(indonesian|bahasa[ -]indonesia|印尼语|印度尼西亚语)$/.test(key)) return 'id';
    if (/^(?:ms|msa|may|zsm)(?:-|$)/.test(key) || /^(malay|bahasa[ -](?:melayu|malaysia)|马来语)$/.test(key)) return 'ms';
    if (/^(?:th|tha)(?:-|$)/.test(key) || /^(thai|ภาษาไทย|ไทย|泰语)$/.test(key)) return 'th';
    if (/^ko(?:-|$)/.test(key)) return 'ko';
    if (/^vi(?:-|$)/.test(key)) return 'vi';
    if (/^(?:tok|toki[- ]?pona)(?:-|$)/.test(key) || key === '道本语') return 'tok';
    if (key === 'asaxi' || key === 'art-x-asaxi') return 'asaxi';
    return { en: 'en', eng: 'en', english: 'en', zh: 'zh', chn: 'zh', chinese: 'zh', mandarin: 'zh',
      ja: 'ja', jpn: 'ja', japanese: 'ja', yue: 'yue', cantonese: 'yue',
      kor: 'ko', korean: 'ko', '朝鲜语': 'ko', '韩语': 'ko', '한국어': 'ko',
      vie: 'vi', vietnamese: 'vi', '越南语': 'vi', 'tiếng việt': 'vi' }[key];
  }
  function phonemizerLang(value) {
    var name = String(value || '');
    var code = importLang(name);
    if (/^(eo|fi|es|pt|it|fr|ro|fil|id|ms|th|hak|nan-x-teochew|zh-x-sichuan|xdi8|tlh)$/.test(code)) return code;
    if (/Hakka/i.test(name)) return 'hak';
    if (/Teochew|Chaozhou/i.test(name)) return 'nan-x-teochew';
    if (/Sichuan|Chengdu|四川|成都/i.test(name)) return 'zh-x-sichuan';
    if (/Xdi8|Shidinn|希[顶頂]/i.test(name)) return 'xdi8';
    if (/Klingon|tlhIngan|pIqaD|克林[贡貢]/i.test(name)) return 'tlh';
    if (/Esperanto/i.test(name)) return 'eo';
    if (/(?:^|[.\s])(?:Finnish|Suomi)/i.test(name)) return 'fi';
    if (/Spanish|Español|Castellano/i.test(name)) return 'es';
    if (/Portuguese|Português/i.test(name)) return 'pt';
    if (/Italian/i.test(name)) return 'it';
    if (/French|Français/i.test(name)) return 'fr';
    if (/Romanian|Română/i.test(name)) return 'ro';
    if (/Tagalog|Filipino/i.test(name)) return 'fil';
    if (/Indonesian|Bahasa.?Indonesia/i.test(name)) return 'id';
    if (/Malay|Bahasa.?Melayu/i.test(name)) return 'ms';
    if (/Thai/i.test(name)) return 'th';
    if (/Toki.?Pona/i.test(name)) return 'tok';
    if (/Asaxi/i.test(name)) return 'asaxi';
    if (/Korean|Hangul/i.test(name)) return 'ko';
    if (/Vietnamese/i.test(name)) return 'vi';
    if (/Polish|Polski/i.test(name)) return 'pl';
    if (/Ukrainian|Українська/i.test(name)) return 'uk';
    if (/Russian|Cyrillic|Русский/i.test(name)) return 'ru';
    if (/German|Deutsch/i.test(name)) return 'de';
    if (/English|Arpasing/i.test(name)) return 'en';
    if (/Cantonese/i.test(name)) return 'yue';
    if (/Chinese|Mandarin|Pinyin/i.test(name)) return 'zh';
    if (/Japanese/i.test(name)) return 'ja';
  }
  // A spelling check independent of dictionary loading: many pinyin syllables
  // (you, an, long, shang...) also occur in the English dictionary.
  var PINYIN = new Set(('a ai an ang ao e ei en eng er o ou m n ng ' +
    'ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ' +
    'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu ' +
    'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu ' +
    'fa fan fang fei fen feng fo fou fu ' +
    'da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo ' +
    'ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo ' +
    'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve nue ' +
    'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve lue ' +
    'ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ' +
    'ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo ' +
    'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ' +
    'ji jia jian jiang jiao jie jin jing jiong jiu ju jue juan jun ' +
    'qi qia qian qiang qiao qie qin qing qiong qiu qu que quan qun ' +
    'xi xia xian xiang xiao xie xin xing xiong xiu xu xue xuan xun ' +
    'zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo ' +
    'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ' +
    'sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo ' +
    'ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo ' +
    'za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo ' +
    'ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo ' +
    'sa sai san sang sao se sen seng si song sou su suan sui sun suo ' +
    'ya yan yang yao ye yi yin ying yo yong you yu yue yuan yun wa wai wan wang wei wen weng wo wu').split(/\s+/));
  function guessLyricLanguage(notes) {
    var lyrics = notes.map(function (n) { return cleanLyric(n.lyric || n.lyrics || ''); });
    if (lyrics.some(function (s) { return /[\uf8d0-\uf8e9]/.test(s); })) return 'tlh';
    if (lyrics.some(function (s) { return /[ก-ฮ]/.test(s); })) return 'th';
    if (lyrics.some(function (s) { return /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(s); })) return 'ko';
    if (lyrics.some(function (s) { return /[ăâđêôơư\u1ea0-\u1ef9]/i.test(s.normalize('NFC')); })) return 'vi';
    if (lyrics.some(function (s) { return /[єіїґ]/i.test(s.normalize('NFC')); })) return 'uk';
    if (lyrics.some(function (s) { return /[\u0400-\u04ff]/.test(s); })) return 'ru';
    if (lyrics.some(function (s) { return /[ąćęłńśźż]/i.test(s.normalize('NFC')); })) return 'pl';
    if (lyrics.some(function (s) { return /[ĉĝĥĵŝŭ]/i.test(s.normalize('NFC')); })) return 'eo';
    if (lyrics.some(function (s) { return /[\u3040-\u30ff\u3400-\u9fff]/.test(s); })) return undefined;
    if (lyrics.some(function (s) { return /^[a-z][a-z'’]*#[1-9]\d*$/i.test(s); })) return 'en';
    var words = lyrics.filter(function (s) { return s && !slurMark(s) && !/^(?:R|rest|SP|br[1-5]?|AP)$/i.test(s); });
    var pinyin = words.filter(function (s) { return PINYIN.has(s.toLowerCase().replace(/ü/g, 'v').replace(/u:/g, 'v').replace(/[1-5]$/, '')); });
    // Require a predominantly pinyin phrase, not an isolated ambiguous "you".
    var distinctPinyin = pinyin.some(function (s) {
      return !/^(?:a|an|ban|bang|can|chi|dan|den|ding|dong|dun|duo|fan|fang|fen|gang|gong|ha|hang|he|hen|hong|long|ma|man|me|men|mi|mu|nan|pa|pan|pang|pen|pi|pin|ping|qi|ran|rang|re|sang|she|song|sun|tan|tang|ti|ting|tong|wan|wang|xi|ya|yang|yin|yo|you)$/i.test(s);
    });
    if (pinyin.length >= 2 && pinyin.length >= words.length * 0.8 && distinctPinyin) return 'zh';
    var common = lyrics.filter(function (s) { return /^(?:I|I'm|I'll|I've|don't|can't|the|you|your|my|it's|love|and|with|for|of)$/i.test(s); });
    if (common.length >= 2 || lyrics.some(function (s) { return /^[a-z][a-z'’]*#[1-9]\d*$/i.test(s); })) return 'en';
    if (lyrics.indexOf('+') >= 0 && lyrics.some(function (s) {
      if (/^[a-z]+(?:ing|tion|ness|ful)$/i.test(s)) return true;
      if (!NSG.g2p || !root.NSG_DICT || !root.NSG_DICT.en || !/^[a-z][a-z'’]{2,}$/i.test(s)) return false;
      var reading = NSG.g2p(s, 'en')[0];
      return reading && reading.roman !== '(规则推导)';
    })) return 'en';
    return undefined;
  }
  // Preserve phrase boundaries so a leading '+' cannot borrow a word from a
  // different source clip. Lyrics themselves stay editable and reversible.
  var lyricGroupId = 0;
  function groupLyrics(notes) {
    var group = 'import-' + (++lyricGroupId);
    notes.forEach(function (n) { n.lyricGroup = group; });
    return notes;
  }

  /* 导出时把延音符换回通用写法（'-'），别的软件才认 */
  IO.exportLyric = function (n) {
    if (!n) return 'a';
    if (/^\+(?:\*|~)?$/.test(n.lyric)) return n.lyric;
    if (n.slur) return '-';
    return n.lyric || 'a';
  };

  /* ---------------- VOCALOID2 .vsq（SMF + DM 文本） ----------------
     .vsq 是货真价实的 SMF，但音符并不发成 note on/off，而是写在轨道的
     文本元事件里：
        [EventList]   tick=ID#0003      —— 每个事件的绝对 tick
        [ID#0003]     Type=Anote / Length / Note# / Dynamics / LyricHandle=h#0003
        [h#0003]      L0="は","h a",…   —— 歌词
     所以只按 SMF 音符读会得到「0 个音符」。这里按 DM 文本重建。 */
  IO.parseVSQText = function (text) {
    /* 每 127 字节一个文本事件，串起来是一份「虚拟文本文件」，
       每个事件开头都带着 "DM:nnnn:" 的块号。必须原样抹掉、
       不能换成换行 —— 块边界常常落在数字或单词中间，
       换成换行会把 Length=900 切成 "Length=9" 与 "00"。 */
    var t = String(text).replace(/DM:\d+:/g, '');
    var lines = t.split(/\r?\n/);
    var sec = '', cur = null;
    var anote = {}, handles = {}, eventList = [], common = {};
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i].trim();
      if (!L) continue;
      var mSec = L.match(/^\[([^\]]+)\]$/);
      if (mSec) {
        sec = mSec[1];
        if (/^ID#/.test(sec)) { cur = sec; anote[cur] = anote[cur] || {}; }
        else if (/^h#/.test(sec)) { cur = sec; handles[cur] = handles[cur] || {}; }
        else cur = sec;
        continue;
      }
      var mKV = L.match(/^([^=]+)=(.+)$/);
      if (!mKV) continue;
      var k = mKV[1].trim(), val = mKV[2];
      if (sec === 'EventList') { eventList.push({ tick: parseInt(k, 10), id: val.trim() }); continue; }
      if (sec === 'Common' || sec === '[Common]' || sec === 'Master') { common[k] = val; continue; }
      if (cur && /^ID#/.test(cur)) { anote[cur][k] = val; }
      else if (cur && /^h#/.test(cur)) {
        if (/^L\d+$/.test(k)) {
          var mm = val.match(/^"([^"]*)"/);
          handles[cur][k] = mm ? unescapeVSQ(mm[1]) : val;
        } else handles[cur][k] = val;
      }
    }
    function unescapeVSQ(s) {
      /* 兼容老写法：DM 文本是 UTF-8 字节被当成 latin1 字符存下来的情况。
         现在 DM 文本已按检测出的编码解成真 Unicode，含有 U+0100 以上字符时
         绝不能再走 escape()/decodeURIComponent()，否则 %uXXXX 会让整串报废。 */
      if (/[\u0100-\uffff]/.test(s) || !/[\u0080-\u00ff]/.test(s)) return s;
      try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    }
    var notes = [];
    eventList.sort(function (a, b) { return a.tick - b.tick; });
    eventList.forEach(function (ev) {
      var a = anote[ev.id];
      if (!a || a.Type !== 'Anote') return;
      var lyr = '';
      var hh = (a.LyricHandle || '').trim();
      if (hh && handles[hh]) {
        var hs = handles[hh];
        lyr = hs.L0 || hs.L1 || '';
      }
      var nVsq = {
        startTick: ev.tick,
        durTick: Math.max(1, num(a.Length, 480)),
        pitch: Math.round(num(a['Note#'], 60)),
        vel: Math.round(num(a.Dynamics, 64) / 127 * 127) || 64
      };
      setLyric(nVsq, lyr);
      notes.push(nVsq);
    });
    return notes;
  };

  /* VSQ 就是 SMF：不能把整个二进制当文本解码（旧的 readVSQ 那么干，
     二进制里的 0xFF / 0x00 会让严格解码全线失败，最后退回 latin1，
     假名就再也回不来了）。先按 SMF 逐轨取 DM 文本字节，解好码再解析。 */
  IO.readVSQ = function (buf, parsedMidi) {
    var b = toU8(buf);
    var ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    var mid = parsedMidi || null;
    if (!mid) { try { mid = IO.readMIDI(ab); } catch (e) { mid = null; } }
    var candidates = [];
    var vsqMixer = {};
    function collectVSQMixer(text) {
      var inMix = false;
      String(text || '').replace(/DM:\d+:/g, '').split(/\r?\n/).forEach(function (line) {
        var s = line.trim();
        if (!s) return;
        if (/^\[/.test(s)) { inMix = /^\[Mixer\]$/i.test(s); return; }
        if (!inMix) return;
        var m = s.match(/^(Feder|Panpot|Mute)(\d+)=(.+)$/);
        if (m) {
          var idx = parseInt(m[2], 10);
          vsqMixer[idx] = vsqMixer[idx] || {};
          vsqMixer[idx][m[1]] = parseFloat(m[3]);
        }
      });
    }
    ((mid && mid.dmTrackInfo) || []).forEach(function (tr) {
      collectVSQMixer(tr.dmText);
      candidates.push({ name: tr.name || ('轨道 ' + (tr.index + 1)), notes: IO.parseVSQText(tr.dmText) });
    });
    if (!candidates.length) {
      var fallback = mid && mid.dmText ? mid.dmText : IO.decodeText(b).text;
      collectVSQMixer(fallback);
      candidates.push({ name: '人声', notes: IO.parseVSQText(fallback) });
    }
    candidates.forEach(function (tr, idx) {
      var mx = vsqMixer[idx];
      if (mx) {
        var volVal = mx.Feder !== undefined ? dbToLinear(mx.Feder / 10, -89) : 1;
        var panVal = mx.Panpot !== undefined ? clamp(mx.Panpot / 64, -1, 1) : 0;
        assignTrackMix(tr, volVal, panVal, !!mx.Mute);
      }
      tr.notes = tr.notes.map(function (n) {
        var o = {
          start: n.startTick / 480, dur: n.durTick / 480, pitch: n.pitch,
          vel: n.vel, lyric: n.lyric || 'a'
        };
        if (n.slur) o.slur = true;
        if (n.wordJoin) o.wordJoin = true;
        if (n.wordJoinDirection) o.wordJoinDirection = n.wordJoinDirection;
        return o;
      });
    });
    if (!candidates.some(function (tr) { return tr.notes.length; })) throw new Error('VSQ 里没有找到音符（DM 文本为空）');
    return withImportTracks({
      format: 'VSQ', tempo: mid ? mid.tempo : 120, tempos: (mid && mid.tempos) || null, enc: mid && mid.enc
    }, candidates);
  };

  /* ---------------- SVP（Synthesizer V） ----------------
     有的导出器会在 JSON 末尾补一个 \x00，JSON.parse 直接抛
     "Unexpected non-whitespace character after JSON"。先裁干净。 */
  IO.readSVP = function (text) {
    var t = String(text).replace(/^\uFEFF/, '').replace(/[\u0000\s]+$/, '');
    var i = t.indexOf('{');
    if (i > 0) t = t.slice(i);
    var j;
    try { j = JSON.parse(t); }
    catch (e) {
      /* 极少数文件尾部有多余对象，截到最后一个能解析的 '}'（上限 8 次尝试防 O(N^2) 卡死） */
      var k = t.lastIndexOf('}'), attempts = 0;
      while (k > 0 && attempts < 8) {
        attempts++;
        try { j = JSON.parse(t.slice(0, k + 1)); break; } catch (e2) { k = t.lastIndexOf('}', k - 1); }
      }
      if (!j) throw new Error('SVP 不是合法 JSON：' + e.message);
    }
    var BL = 705600000;
    var bpm = 120;
    var tempoList = [];
    if (j.time && j.time.tempo && j.time.tempo.length) {
      /* time.tempo 是数组：每一个 {position, bpm} 就是一个速度点，
         长歌里能有几十个，只取第一个会让后半首全部错位 */
      j.time.tempo.slice().sort(function (a, b) { return num(a.position, 0) - num(b.position, 0); })
        .forEach(function (tp) {
          var v = num(tp.bpm, 120), beat = num(tp.position, 0) / BL;
          var last = tempoList[tempoList.length - 1];
          if (last && Math.abs(last.beat - beat) < 0.01) { last.bpm = Math.round(v * 100) / 100; return; }
          if (last && Math.abs(last.bpm - v) < 0.01) return;
          tempoList.push({ beat: Math.round(beat * 1000) / 1000, bpm: Math.round(v * 100) / 100 });
        });
      if (tempoList.length) bpm = tempoList[0].bpm;
    } else {
      bpm = num(j.time && j.time.bpm, num(j.tempo, 120));
      tempoList = [{ beat: 0, bpm: bpm }];
    }
    var tracks = [], res, trackLang;
    function pushNotes(ns, tag, ref) {
      ref = ref || {};
      var db = ref.database || {};
      var lang = importLang(db.languageOverride || db.language) || trackLang || guessLyricLanguage(ns || []);
      var groupNotes = [];
      (ns || []).forEach(function (n) {
        var lyric = n.lyrics || n.lyric || '';
        var nSvp = {
          start: (num(n.onset, 0) + num(ref.blickOffset, 0)) / BL,
          dur: Math.max(1 / 64, num(n.duration, BL / 4) / BL),
          pitch: Math.round(num(n.pitch, 60) + num(ref.pitchOffset, 0)),
          vel: Math.round(clamp(num(n.velocity, 100), 1, 127)),
          tag: tag || ''
        };
        setLyric(nSvp, lyric, 'SVP', importLang(n.attributes && n.attributes.languageOverride) || lang);
        groupNotes.push(nSvp);
        res.push(nSvp);
      });
      groupLyrics(groupNotes);
    }
    var library = {};
    (j.library || []).forEach(function (g) { library[g.uuid] = g; });
    function pushRef(ref, main, name) {
      if (!ref && !main) return;
      ref = ref || {};
      var group = main || library[ref.groupID] || ref;
      pushNotes(group.notes, name || group.name, ref);
    }
    (j.tracks || []).forEach(function (tr) {
      res = [];
      var db = (tr.mainRef || {}).database || {};
      trackLang = importLang(db.languageOverride || db.language);
      pushRef(tr.mainRef, tr.mainGroup || tr.group || (tr.notes ? tr : null), tr.name);
      (tr.groups || []).forEach(function (ref) { pushRef(ref, null, tr.name); });
      var mx = tr.mixer || {};
      var svpVol = mx.gainDecibel !== undefined ? dbToLinear(num(mx.gainDecibel, 0), -80) : 1;
      var svpPan = mx.pan !== undefined ? clamp(num(mx.pan, 0), -1, 1) : 0;
      tracks.push(assignTrackMix({ name: tr.name, notes: res, lang: trackLang || (res[0] || {}).lang }, svpVol, svpPan, !!mx.mute));
    });
    if (!tracks.length) (j.library || []).forEach(function (g) {
      res = []; pushNotes(g.notes, g.name);
      tracks.push({ name: g.name, notes: res, lang: (res[0] || {}).lang });
    });
    if (!tracks.some(function (tr) { return tr.notes.length; })) throw new Error('SVP 中没有找到音符');
    return withImportTracks({ format: 'SVP', tempo: Math.round(bpm * 100) / 100, tempos: tempoList }, tracks);
  };

  /* ---------------- ACE Studio .acep ----------------
     1.x：JSON 文本，或 { compressMethod:'zstd', content:base64 } 的信封。
     2.x：二进制容器 —— 文件头 'ACEP'+版本号，8..11 为 zstd 帧偏移（u32 LE），
          16..23 为帧长度（u64 LE），帧解压后是 CBOR 对象。CBOR 的字段名与
          1.x 的 JSON 基本一致（tracks/patterns/notes/pos/dur/pitch/lyric），
          所以解码后直接复用同一条轨道解析路径。 */
  var ACEP_MAGIC = [0x41, 0x43, 0x45, 0x50];
  var utf8Decoder = null;
  function utf8Str(u8) {
    if (!utf8Decoder) { try { utf8Decoder = new TextDecoder('utf-8'); } catch (e) { utf8Decoder = false; } }
    if (utf8Decoder) return utf8Decoder.decode(u8);
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  IO.isACEPBinary = function (bytes) {
    var b = toU8(bytes);
    if (!b || b.length < 5) return false;
    for (var i = 0; i < 4; i++) if (b[i] !== ACEP_MAGIC[i]) return false;
    return b[4] >= 0x20 && b[4] <= 0x39;   // 后面跟的是版本号字符，排除同名文本
  };

  /* 最小 CBOR（RFC 8949）解码器：工程里只出现无符号/负整数、字节串、
     文本、数组、映射、标签与浮点数，够用即可。 */
  function cborDecode(b, strict) {
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), p = 0, depth = 0;
    function need(n) { if (n < 0 || !Number.isSafeInteger(n) || p + n > b.length) throw new Error('CBOR 数据不完整'); }
    function head() {
      need(1);
      var ib = b[p++], mt = ib >> 5, ai = ib & 31, val;
      if (ai < 24) val = ai;
      else if (ai === 24) { need(1); val = b[p++]; }
      else if (ai === 25) { need(2); val = dv.getUint16(p); p += 2; }
      else if (ai === 26) { need(4); val = dv.getUint32(p); p += 4; }
      else if (ai === 27) { need(8); val = dv.getUint32(p) * 4294967296 + dv.getUint32(p + 4); p += 8; }
      else if (ai === 31) val = -1;
      else throw new Error('CBOR 长度字段非法');
      return { mt: mt, ai: ai, val: val };
    }
    function half(h) {
      var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
      if (e === 31) return f ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + f / 1024);
    }
    function store(map, k, v) { if (k !== '__proto__') map[k] = v; }
    function item() {
      if (++depth > 128) throw new Error('CBOR 嵌套过深');
      try { return readItem(); } finally { depth--; }
    }
    function end() { need(1); if (b[p++] !== 0xff) throw new Error('CBOR 缺少结束标记'); }
    function readItem() {
      var h = head(), i, k, arr, map;
      if (h.val < 0 && h.mt !== 4 && h.mt !== 5) throw new Error('CBOR 类型不支持不定长度');
      switch (h.mt) {
        case 0: return h.val;
        case 1: return -1 - h.val;
        case 2: need(h.val); i = p; p += h.val; return b.subarray(i, p);
        case 3: need(h.val); i = p; p += h.val; return utf8Str(b.subarray(i, p));
        case 4:
          arr = [];
          if (h.val < 0) { while (p < b.length && b[p] !== 0xff) arr.push(item()); end(); }
          else for (i = 0; i < h.val; i++) arr.push(item());
          return arr;
        case 5:
          map = {};
          if (h.val < 0) { while (p < b.length && b[p] !== 0xff) { k = item(); store(map, k, item()); } end(); }
          else for (i = 0; i < h.val; i++) { k = item(); store(map, k, item()); }
          return map;
        case 6: return item();
        default:
          if (h.ai === 20) return false;
          if (h.ai === 21) return true;
          if (h.ai === 22 || h.ai === 23) return null;
          if (h.ai === 25) return half(h.val);
          if (h.ai === 26) return dv.getFloat32(p - 4);
          if (h.ai === 27) return dv.getFloat64(p - 8);
          return null;
      }
    }
    var result = item();
    if (strict && p !== b.length) throw new Error('CBOR 末尾存在多余数据');
    return result;
  }
  IO.decodeCBOR = cborDecode;

  /* 从二进制容器里切出 zstd 帧；头部长度字段不可靠时退化为扫描魔数 */
  function acepZstdFrame(b) {
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    function at(o) { return o >= 0 && o + 4 <= b.length && b[o] === 0x28 && b[o + 1] === 0xb5 && b[o + 2] === 0x2f && b[o + 3] === 0xfd; }
    var off = -1, len = 0;
    if (IO.isACEPBinary(b) && b.length >= 32) {
      off = dv.getUint32(8, true);
      len = dv.getUint32(16, true) + dv.getUint32(20, true) * 4294967296;
    }
    if (!at(off)) {
      off = -1; len = 0;
      for (var i = 0, n = Math.min(b.length - 4, 8192); i <= n; i++) if (at(i)) { off = i; break; }
    }
    if (off < 0) return null;
    return b.subarray(off, len && off + len <= b.length ? off + len : b.length);
  }

  function decodeACEPBinary(b) {
    var frame = acepZstdFrame(b);
    if (!frame) {
      /* 少数版本把 CBOR 直接写在头部之后，不做压缩 */
      var dvb = new DataView(b.buffer, b.byteOffset, b.byteLength);
      var direct = IO.isACEPBinary(b) && b.length >= 32 ? dvb.getUint32(8, true) : 32;
      if (direct < b.length && (b[direct] & 0xe0) === 0xa0) return cborDecode(b.subarray(direct));
      throw new Error('二进制工程里找不到 zstd 数据块');
    }
    if (!root.fzstd) throw new Error('缺少 Zstandard 解码器');
    var raw = root.fzstd.decompress(frame);
    var u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (u8.length >= 2 && u8[0] === 0x7b) return JSON.parse(utf8Str(u8));  // 个别版本内层仍是 JSON
    return cborDecode(u8);
  }

  function acepObject(src) {
    if (typeof src !== 'string') {
      var b = toU8(src);
      if (IO.isACEPBinary(b)) return decodeACEPBinary(b);
      src = IO.decodeText(b).text;
    }
    var j = JSON.parse(String(src).replace(/^\uFEFF/, ''));
    if (j.content !== undefined) {
      if (j.compressMethod === 'zstd') {
        if (!root.fzstd) throw new Error('缺少 Zstandard 解码器');
        var binary = atob(j.content), bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var innerBytes = root.fzstd.decompress(bytes);
        if (!(innerBytes instanceof Uint8Array)) innerBytes = new Uint8Array(innerBytes);
        try { return JSON.parse(utf8Str(innerBytes)); }
        catch (inner) { return cborDecode(innerBytes); }
      }
      if (j.compressMethod && j.compressMethod !== 'none') {
        throw new Error('不支持压缩方式 ' + j.compressMethod);
      }
      j = typeof j.content === 'string' ? JSON.parse(j.content) : j.content;
    }
    return j;
  }

  /* ---------------- ACEP 的 PIT（音高曲线） ----------------
     parameters.pitchDelta 名字带 delta，实际存的是「绝对音高曲线」：
     单位是半音（MIDI 音高），逐点 [tick, 半音, tick, 半音…]，锚点密到 1~5 tick；
     不唱的地方会掉到 0 / -12 这种无值点。这里把它按音符切成 pb
     （0..1 相对时间 + 音分），与 ufdata 的绝对曲线处理保持一致。 */
  function acepPitchCurve(param) {
    var xs = [], ys = [], i, j;
    (Array.isArray(param) ? param : []).forEach(function (seg) {
      var pts = seg && seg.points;
      if (!Array.isArray(pts)) return;
      for (var k = 0; k + 1 < pts.length; k += 2) {
        var x = num(pts[k], NaN), y = num(pts[k + 1], NaN);
        if (isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y); }
      }
    });
    if (xs.length < 2) return null;
    var order = xs.map(function (v, k) { return k; }).sort(function (a, b) { return xs[a] - xs[b]; });
    var out = { x: [], y: [] };
    for (i = 0; i < order.length; i++) {
      j = order[i];
      out.x.push(xs[j]); out.y.push(ys[j]);
    }
    return out;
  }

  /* 垂直误差下的 Douglas–Peucker：音高曲线只关心每个时刻偏了多少音分 */
  function simplifyPB(pts, tol) {
    var n = pts.length;
    if (n < 3) return pts;
    var keep = new Array(n), stack = [[0, n - 1]], i;
    keep[0] = keep[n - 1] = true;
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      if (b - a < 2) continue;
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      var span = (bx - ax) || 1e-9, best = -1, hit = -1;
      for (i = a + 1; i < b; i++) {
        var line = ay + (by - ay) * (pts[i][0] - ax) / span;
        var dev = Math.abs(pts[i][1] - line);
        if (dev > best) { best = dev; hit = i; }
      }
      if (best > tol) { keep[hit] = true; stack.push([a, hit], [hit, b]); }
    }
    var out = [];
    for (i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  function acepNotePB(curve, pitch, t0, t1) {
    if (!curve || !(t1 > t0)) return null;
    var xs = curve.x, ys = curve.y, n = xs.length;
    function at(t) {
      var lo = 0, hi = n;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (xs[mid] < t) lo = mid + 1; else hi = mid; }
      if (lo <= 0) return ys[0];
      if (lo >= n) return ys[n - 1];
      var x0 = xs[lo - 1], x1 = xs[lo];
      return x1 > x0 ? ys[lo - 1] + (ys[lo] - ys[lo - 1]) * (t - x0) / (x1 - x0) : ys[lo];
    }
    var pts = [], lastT = -Infinity, hold = 0;
    function push(t, v) {
      var cents = (v - pitch) * 100;
      /* 静音段的 0 / -12 之类无值点：沿用上一个有效值，别把整轨拉低几个半音 */
      if (!isFinite(cents) || cents < -1200 || cents > 1200) cents = hold;
      hold = cents;
      cents = Math.round(cents);
      var f = (t - t0) / (t1 - t0);
      f = Math.round((f < 0 ? 0 : f > 1 ? 1 : f) * 1e4) / 1e4;
      /* 1 tick 内、或四舍五入后同位置的重复点会让卷帘上出现垂直线，只留后一个 */
      if (pts.length && (t - lastT <= 1 || f <= pts[pts.length - 1][0])) pts[pts.length - 1][1] = cents;
      else pts.push([f, cents]);
      lastT = t;
    }
    push(t0, at(t0));
    var lo = 0, hi = n;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (xs[mid] <= t0) lo = mid + 1; else hi = mid; }
    for (var i = lo; i < n && xs[i] < t1; i++) push(xs[i], ys[i]);
    /* 结束点取 t1 前一点：相邻音符共用边界，t1 处的值已经属于下一个音 */
    push(t1 - 0.5, at(t1 - 0.5));
    pts = simplifyPB(pts, 5);
    if (!pts.length) return null;
    var peak = 0;
    pts.forEach(function (p) { peak = Math.max(peak, Math.abs(p[1])); });
    if (peak < 2) return null;
    /* 最后一个锚点之后曲线本来就是常值，直接把它对齐到音符结束，
       否则卷帘上会出现「曲线差一点没画到头」的假象 */
    if (pts.length === 1) pts.push([1, pts[0][1]]);
    else pts[pts.length - 1][0] = 1;
    return pts;
  }

  IO.readACEP = function (src) {
    var j;
    try { j = acepObject(src); }
    catch (e) { throw new Error('无法读取 ACEP（支持 JSON / Zstandard 信封 / ACEP2 二进制工程）：' + e.message); }
    if (!j || !Array.isArray(j.tracks)) throw new Error('ACEP 中没有轨道');
    var tempos = (j.tempos || []).map(function (t) { return { beat: num(t.position, 0) / 480, bpm: num(t.bpm, 120) }; });
    if (!tempos.length) tempos.push({ beat: 0, bpm: 120 });
    var tracks = [];
    j.tracks.forEach(function (tr) {
      if (tr.type !== 'sing' && tr.type !== 'instrument') return;
      var notes = [], lang = importLang(tr.language);
      (tr.patterns || []).forEach(function (pt) {
        if (pt.enabled === false) return;
        if (pt.timeUnit && pt.timeUnit !== 'tick') throw new Error('暂不支持按秒计时的 ACEP 音符片段');
        var base = num(pt.pos, 0), clipStart = num(pt.clipPos, 0);
        var clipEnd = clipStart + num(pt.clipDur, num(pt.dur, Infinity));
        var curve = acepPitchCurve(pt.parameters && pt.parameters.pitchDelta);
        var partNotes = [];
        (pt.notes || []).forEach(function (n) {
          var start = Math.max(num(n.pos, 0), clipStart, -base);
          var end = Math.min(num(n.pos, 0) + num(n.dur, 0), clipEnd);
          if (end <= start) return;
          var noteLang = importLang(n.language || pt.language) || lang;
          var note = { start: (base + start) / 480, dur: (end - start) / 480,
            pitch: Math.round(num(n.pitch, 60)), vel: 96 };
          setLyric(note, n.lyric, 'ACEP', noteLang);
          if (/#\d+$/.test(note.lyric) && noteLang === 'en') note.wordJoin = true;
          if (noteLang === 'en' && !note.slur && NSG.englishPhones) {
            var phones = NSG.englishPhones(n.syllable || n.freezedDefaultSyllable);
            if (phones && phones.length) {
              note.phones = phones;
              note.phonesSource = n.syllable && n.syllable !== n.freezedDefaultSyllable ? 'imported' : 'auto';
              note.phonesLang = noteLang;
            }
          }
          var pb = curve ? acepNotePB(curve, note.pitch, start, end) : null;
          /* 曲线里已经含颤音，再叠一层声库颤音会抖成两倍 */
          if (pb) { note.pb = pb; note.vib = 0; }
          notes.push(note); partNotes.push(note);
        });
        groupLyrics(partNotes);
      });
      var aceVol = tr.gain !== undefined ? dbToLinear(num(tr.gain, 0), -80) : 1;
      var acePan = tr.pan !== undefined ? clamp(num(tr.pan, 0), -1, 1) : 0;
      tracks.push(assignTrackMix({ name: tr.name, notes: notes, lang: lang || (notes[0] || {}).lang }, aceVol, acePan, !!tr.mute));
    });
    if (!tracks.some(function (tr) { return tr.notes.length; })) throw new Error('ACEP 中没有可导入的音符');
    var warn = j.tracks.some(function (tr) { return tr.type === 'audio'; }) ? '伴奏与音频轨未导入' : '';
    return withImportTracks({ format: 'ACEP', tempo: tempos[0].bpm, tempos: tempos, warn: warn }, tracks);
  };

  /* ---------------- TuneLab .tlp / .tlpx ----------------
     JSON v0: part.pos + dur; v1: pos is an anchor, visible range is
     [pos + startOffset, pos + endOffset]. Note/pitch positions are relative
     to that anchor; 480 ticks per quarter. TLPX is bare CBOR.
     Reference: LiuYunPlayer/TuneLab, Extensions/Formats/TLP. */
  function tlLower(points, x) {
    var lo = 0, hi = points.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (points[mid][0] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function tlLinear(points, x, fallback) {
    if (!points.length) return fallback;
    var i = tlLower(points, x);
    if (!i) return points[0][1];
    if (i === points.length) return points[i - 1][1];
    var a = points[i - 1], b = points[i];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  function tlPairs(values) {
    var out = [];
    for (var i = 0; Array.isArray(values) && i + 1 < values.length; i += 2) {
      if (Number.isFinite(values[i]) && Number.isFinite(values[i + 1])) out.push([values[i], values[i + 1]]);
    }
    out.sort(function (a, b) { return a[0] - b[0]; });
    return out.filter(function (p, i) { return i === out.length - 1 || p[0] !== out[i + 1][0]; });
  }
  function tlPitchLines(pitch) {
    return (Array.isArray(pitch) ? pitch : []).map(function (values) {
      var pts = tlPairs(values), sampled = [];
      // Monotone cubic Hermite: zero end slopes, harmonic means inside.
      // Flatten with a curvature bound of 0.25 cent; retain every anchor.
      var slopes = pts.map(function (p, i) {
        if (!i || i === pts.length - 1) return 0;
        var left = (p[1] - pts[i - 1][1]) / (p[0] - pts[i - 1][0]);
        var right = (pts[i + 1][1] - p[1]) / (pts[i + 1][0] - p[0]);
        return left * right <= 0 ? 0 : 2 / (1 / left + 1 / right);
      });
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        var m0 = slopes[i] * dx, m1 = slopes[i + 1] * dx;
        var c3 = -2 * dy + m0 + m1, c2 = 3 * dy - 2 * m0 - m1;
        var count = Math.max(1, Math.ceil(Math.sqrt(Math.max(Math.abs(2 * c2), Math.abs(6 * c3 + 2 * c2)) / 0.02)));
        if (!Number.isFinite(count) || count > 100000) throw new Error('TuneLab 音高曲线数值超出范围');
        for (var k = 0; k < count; k++) {
          var u = k / count;
          sampled.push([a[0] + dx * u, ((c3 * u + c2) * u + m0) * u + a[1]]);
        }
      }
      if (pts.length) sampled.push(pts[pts.length - 1]);
      return sampled;
    }).filter(function (line) { return line.length; }).sort(function (a, b) { return a[0][0] - b[0][0]; });
  }
  function tlLanguage(properties) {
    properties = properties || {};
    return importLang(properties.Language || properties.language) || phonemizerLang(properties.G2PScript);
  }
  function tlNotePitch(note, start, end, base, lines, vibratos, envelope, tm) {
    var relevant = lines.filter(function (line) { return line[0][0] <= end && line[line.length - 1][0] >= start; });
    var vibes = vibratos.filter(function (v) { return v.pos < end && v.pos + v.dur > start && v.amplitude; });
    if (!relevant.length && !vibes.length) return;
    var ticks = [start, end], epsilon = Math.max(0.001, (end - start) * 0.000002);
    relevant.forEach(function (line) {
      var first = line[0][0], last = line[line.length - 1][0];
      if (first > start && first < end) ticks.push(first - Math.min(epsilon, (first - start) / 2));
      if (last > start && last < end) ticks.push(last + Math.min(epsilon, (end - last) / 2));
      for (var i = tlLower(line, start); i < line.length && line[i][0] <= end; i++) ticks.push(line[i][0]);
    });
    function sec(tick) { return tm.secOf((base + tick) / 480); }
    vibes.forEach(function (v) {
      ticks.push(clamp(v.pos, start, end), clamp(v.pos + v.dur, start, end));
      if (v.pos > start && v.pos < end) ticks.push(v.pos - Math.min(epsilon, (v.pos - start) / 2));
      if (v.pos + v.dur > start && v.pos + v.dur < end) ticks.push(v.pos + v.dur + Math.min(epsilon, (end - v.pos - v.dur) / 2));
      v.time = sec(v.pos); v.endTime = sec(v.pos + v.dur);
    });
    if (vibes.length) {
      // Seconds keep the vibrato rate stable across tempo changes.
      var t0 = sec(start), t1 = sec(end);
      var maxRate = vibes.reduce(function (r, v) { return Math.max(r, Math.abs(v.frequency)); }, 1);
      var count = Math.ceil((t1 - t0) * Math.max(200, maxRate * 40));
      if (!Number.isFinite(count) || count > 1000000) throw new Error('TuneLab 颤音时长或频率超出范围');
      for (var i = 1; i < count; i++) ticks.push(tm.beatOf(t0 + (t1 - t0) * i / count) * 480 - base);
    }
    var envPoints = tlPitchLines([envelope && envelope.values])[0] || [], envDefault = num(envelope && envelope.default, 1);
    envPoints.forEach(function (p) { if (p[0] > start && p[0] < end) ticks.push(p[0]); });
    tm.list.forEach(function (tp) { var tick = tp.beat * 480 - base; if (tick > start && tick < end) ticks.push(tick); });
    ticks.sort(function (a, b) { return a - b; });
    note.pb = ticks.filter(function (tick, i) { return !i || tick - ticks[i - 1] > 1e-8; }).map(function (tick) {
      var pitch = note.pitch;
      for (var i = 0; i < relevant.length; i++) {
        var line = relevant[i];
        if (tick >= line[0][0] && tick <= line[line.length - 1][0]) { pitch = tlLinear(line, tick, pitch); break; }
      }
      var time = vibes.length ? sec(tick) : 0, deviation = 0;
      vibes.forEach(function (v) {
        if (tick < v.pos || tick > v.pos + v.dur) return;
        var attack = v.attack > 0 ? clamp((time - v.time) / v.attack, 0, 1) : 1;
        var release = v.release > 0 ? clamp((v.endTime - time) / v.release, 0, 1) : 1;
        var env = attack * attack * (3 - 2 * attack) * release * release * (3 - 2 * release);
        deviation += v.amplitude * env * Math.sin(2 * Math.PI * v.frequency * (time - v.time) - v.phase * Math.PI);
      });
      deviation *= Math.max(0, envDefault + tlLinear(envPoints, tick, 0));
      return [(tick - start) / (end - start), (pitch - note.pitch + deviation) * 100, 'l'];
    });
  }
  IO.readTuneLab = function (src, binary, preDecoded) {
    var j;
    try {
      if (preDecoded && typeof preDecoded === 'object') {
        j = preDecoded;
      } else {
        if (typeof src === 'string' && (!src.trim() || /^\0+$/.test(src))) throw new Error('文件为空或全部为零字节，工程数据已损坏');
        j = typeof src === 'string' ? JSON.parse(src.replace(/^\uFEFF/, '')) : cborDecode(toU8(src), true);
      }
    }
    catch (e) { throw new Error('无法读取 TuneLab 工程：' + e.message); }
    if (!isTuneLabProject(j)) throw new Error('TuneLab 工程缺少轨道、速度或拍号数据');
    if (j.version < 0 || j.version > 1) throw new Error('暂不支持 TuneLab 工程版本 ' + j.version);
    var tempos = j.tempos.filter(function (t) { return Number.isFinite(t.pos) && t.bpm > 0 && Number.isFinite(t.bpm); })
      .map(function (t) { return { beat: t.pos / 480, bpm: t.bpm }; }).sort(function (a, b) { return a.beat - b.beat; });
    if (!tempos.length) tempos.push({ beat: 0, bpm: 120 });
    if (!NSG.TEMPO && typeof require === 'function') require('./tempo.js');
    var tm = NSG.TEMPO.map({ tempos: tempos }), audioCount = 0;
    var tracks = j.tracks.map(function (tr) {
      var notes = [], trackLang = tlLanguage(tr.properties);
      (Array.isArray(tr.parts) ? tr.parts : []).forEach(function (part) {
        if (part.type === 'audio') { audioCount++; return; }
        if (part.type !== 'midi') return;
        var base = num(part.pos, 0), clipStart = j.version < 1 ? 0 : num(part.startOffset, 0);
        var clipEnd = j.version < 1 ? num(part.dur, 0) : num(part.endOffset, 0);
        var sourceNotes = Array.isArray(part.notes) ? part.notes : [];
        var lang = tlLanguage(part.properties) || trackLang || guessLyricLanguage(sourceNotes);
        var lines = tlPitchLines(part.pitch), vibes = (Array.isArray(part.vibratos) ? part.vibratos : [])
          .filter(function (v) { return Number.isFinite(v.pos) && v.dur > 0 && Number.isFinite(v.dur); })
          .map(function (v) { return { pos: v.pos, dur: v.dur, amplitude: num(v.amplitude, 0),
            frequency: num(v.frequency, 5.5), phase: num(v.phase, 0), attack: num(v.attack, 0), release: num(v.release, 0) }; });
        var partNotes = [];
        sourceNotes.forEach(function (n) {
          if (!Number.isFinite(n.pos) || !Number.isFinite(n.dur) || !Number.isFinite(n.pitch)) return;
          var start = Math.max(n.pos, clipStart, -base), end = Math.min(n.pos + n.dur, clipEnd);
          if (end <= start) return;
          var noteLang = tlLanguage(n.properties) || lang;
          var note = { start: (base + start) / 480, dur: (end - start) / 480, pitch: Math.round(n.pitch), vel: 96, vib: 0 };
          setLyric(note, n.lyric, 'TuneLab', noteLang);
          if (noteLang === 'zh' || !noteLang) nnReading(note, note.lyric, n.pronunciation || '');
          tlNotePitch(note, start, end, base, lines, vibes, part.automations && part.automations.VibratoEnvelope, tm);
          notes.push(note); partNotes.push(note);
        });
        partNotes.sort(function (a, b) { return a.start - b.start; });
        if (partNotes.length) partNotes[0].pitchJoin = false;
        groupLyrics(partNotes);
      });
      var tlVol = tr.gain !== undefined ? dbToLinear(num(tr.gain, 0), -80) : 1;
      var tlPan = tr.pan !== undefined ? clamp(num(tr.pan, 0), -1, 1) : 0;
      return assignTrackMix({ name: tr.name, notes: notes, lang: trackLang || (notes[0] || {}).lang }, tlVol, tlPan, !!tr.mute);
    });
    if (!tracks.some(function (tr) { return tr.notes.length; })) throw new Error('TuneLab 工程中没有可导入的音符');
    var warn = 'TuneLab 声库、效果、手工音素及声库自动化暂不转换；未绘制音高处按本地音符重新合成';
    if (audioCount) warn += '；' + audioCount + ' 个外部音频片段未导入';
    if (j.timeSignatures.some(function (s) { return s.numerator !== 4 || s.denominator !== 4 || s.barIndex !== 0; })) {
      warn += '；拍号及拍号变化暂不转换';
    }
    return withImportTracks({ format: binary ? 'TLPX' : 'TLP', tempo: tempos[0].bpm, tempos: tempos, warn: warn }, tracks);
  };

  /* ---------------- 迷你 YAML（USTX 用） ----------------
     OpenUtau 的 .ustx 是 YAML。旧版拿正则逐行抓，遇到 0.9 版把音高写成
     `tone:`、速度写在 `tempos: - bpm:` 就全抓不到。这里写个能用的
     缩进解析器，够处理 USTX 里出现的映射、序列和内联 {a: b}。 */
  function parseScalar(s) {
    s = String(s).trim();
    if (!s) return '';
    if (s === 'null' || s === '~') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
    if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    if (s.length > 1 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s.slice(1, -1);
    if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') {
      var o = {}, body = s.slice(1, -1);
      body.split(',').forEach(function (kv) {
        var p = kv.indexOf(':');
        if (p < 0) return;
        o[kv.slice(0, p).trim()] = parseScalar(kv.slice(p + 1));
      });
      return o;
    }
    if (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']') {
      var a = [], bd = s.slice(1, -1);
      if (!bd.trim()) return a;
      bd.split(',').forEach(function (x) { a.push(parseScalar(x)); });
      return a;
    }
    return s;
  }

  function yamlLite(text) {
    var raw = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var L = raw[i];
      if (!L.trim() || /^\s*#/.test(L)) continue;
      var ind = L.match(/^ */)[0].length;
      lines.push({ ind: ind, s: L.slice(ind) });
    }
    var p = 0;
    function parseBlock(indent) {
      if (p >= lines.length) return null;
      var line = lines[p];
      if (line.ind < indent) return null;
      if (/^- /.test(line.s) || line.s === '-') return parseSeq(line.ind);
      return parseMap(line.ind);
    }
    function parseMap(indent) {
      var o = {}, any = false;
      while (p < lines.length) {
        var line = lines[p];
        if (line.ind < indent) break;
        if (line.ind > indent) { p++; continue; }
        if (/^- /.test(line.s)) break;
        var ci = line.s.indexOf(':');
        if (ci < 0) { p++; continue; }
        var k = line.s.slice(0, ci).trim();
        var rest = line.s.slice(ci + 1).trim();
        any = true;
        p++;
        if (rest !== '') { o[k] = parseScalar(rest); continue; }
        /* 值在下一行的更深缩进里；也可能是同缩进的 '- ' 序列 */
        if (p < lines.length && lines[p].ind > indent) o[k] = parseBlock(lines[p].ind);
        else if (p < lines.length && lines[p].ind === indent && /^- /.test(lines[p].s)) o[k] = parseSeq(indent);
        else o[k] = null;
      }
      return any ? o : null;
    }
    function parseSeq(indent) {
      var a = [];
      while (p < lines.length) {
        var line = lines[p];
        if (line.ind !== indent || !/^- /.test(line.s)) {
          if (line.ind < indent) break;
          if (line.ind === indent) break;
          p++; continue;
        }
        var rest = line.s.slice(2).trim();
        if (rest === '') {
          p++;
          a.push(p < lines.length && lines[p].ind > indent ? parseBlock(lines[p].ind) : null);
          continue;
        }
        var ci = rest.indexOf(':');
        /* '- key: value' → 一个映射项，后续同缩进的键都属于它 */
        if (ci > 0 && !/^["'{[]/.test(rest)) {
          var itemIndent = indent + 2;
          var firstK = rest.slice(0, ci).trim();
          var firstV = rest.slice(ci + 1).trim();
          var obj = {};
          p++;
          if (firstV !== '') obj[firstK] = parseScalar(firstV);
          else if (p < lines.length && lines[p].ind > itemIndent) obj[firstK] = parseBlock(lines[p].ind);
          else if (p < lines.length && lines[p].ind === itemIndent && /^- /.test(lines[p].s)) obj[firstK] = parseSeq(itemIndent);
          else obj[firstK] = null;
          while (p < lines.length && lines[p].ind === itemIndent && !/^- /.test(lines[p].s)) {
            var l2 = lines[p], c2 = l2.s.indexOf(':');
            if (c2 < 0) { p++; continue; }
            var k2 = l2.s.slice(0, c2).trim(), v2 = l2.s.slice(c2 + 1).trim();
            p++;
            if (v2 !== '') obj[k2] = parseScalar(v2);
            else if (p < lines.length && lines[p].ind > itemIndent) obj[k2] = parseBlock(lines[p].ind);
            else if (p < lines.length && lines[p].ind === itemIndent && /^- /.test(lines[p].s)) obj[k2] = parseSeq(itemIndent);
            else obj[k2] = null;
          }
          a.push(obj);
          continue;
        }
        a.push(parseScalar(rest));
        p++;
      }
      return a;
    }
    var out = parseBlock(lines.length ? lines[0].ind : 0);
    return out || {};
  }
  IO.yamlLite = yamlLite;

  // Foreign control-point X is milliseconds from the note onset; native X is
  // beats. Do not clamp negative X: it is the preceding note's transition.
  function pitchBeatAtMs(note, ms, tm) {
    var seconds = tm.secOf(note.start) + ms / 1000;
    return (seconds < 0 ? seconds / tm.spbAt(0) : tm.beatOf(seconds)) - note.start;
  }
  function importPitchPoints(note, data, tm) {
    var pts = (data || []).filter(function (p) { return p && isFinite(+p.x) && isFinite(+p.y); }).map(function (p) {
      return [pitchBeatAtMs(note, +p.x, tm), +p.y * 10, NSG.TUNING.pitchShape(p.shape, 's')];
    });
    if (pts.length) note.pitchPoints = NSG.TUNING.junctionPoints(pts);
  }

  /* ---------------- USTX（OpenUtau） ----------------
     0.4–0.8 用 notes: {position, duration, pitch, lyric}
     0.9+   用 notes: {position, duration, tone, lyric}，速度在 tempos: - bpm:
     两版都要认，否则 0.9 的工程会「找不到音符」。 */
  IO.readUSTX = function (text) {
    var j = yamlLite(text);
    var res = Math.max(1, num(j.resolution, 480));
    var bpm = 120;
    var tempoList = [];
    if (Array.isArray(j.tempos) && j.tempos.length) {
      /* tempos: - position: 480 tick / bpm: 90 */
      j.tempos.slice().sort(function (a, b) { return num(a.position, 0) - num(b.position, 0); })
        .forEach(function (tp) {
          var v = num(tp.bpm, 120), beat = num(tp.position, 0) / res;
          var last = tempoList[tempoList.length - 1];
          if (last && Math.abs(last.beat - beat) < 0.01) { last.bpm = Math.round(v * 100) / 100; return; }
          if (last && Math.abs(last.bpm - v) < 0.01) return;
          tempoList.push({ beat: Math.round(beat * 1000) / 1000, bpm: Math.round(v * 100) / 100 });
        });
      bpm = tempoList[0].bpm;
    } else {
      bpm = num(j.bpm, num(j.tempo, 120));
      tempoList = [{ beat: 0, bpm: Math.round(bpm * 100) / 100 }];
    }
    var parts = [], tracks = [];
    function trackAt(index) {
      while (tracks.length <= index) {
        var src = (j.tracks || [])[tracks.length] || {};
        var ustxVol = src.volume !== undefined ? dbToLinear(num(src.volume, 0), -80) : 1;
        var ustxPan = src.pan !== undefined ? clamp(num(src.pan, 0) / 100, -1, 1) : 0;
        tracks.push(assignTrackMix({ name: src.track_name || src.name, notes: [],
          lang: importLang(src.language) || phonemizerLang(src.phonemizer) }, ustxVol, ustxPan, !!src.mute));
      }
      return tracks[index];
    }
    function addPart(pt, index) {
      parts.push({ part: pt, track: trackAt(Math.max(0, Math.floor(num(index, 0)))) });
    }
    if (Array.isArray(j.voice_parts)) j.voice_parts.forEach(function (pt) { addPart(pt, pt.track_no); });
    if (Array.isArray(j.tracks)) {
      j.tracks.forEach(function (t, index) {
        trackAt(index);
        if (Array.isArray(t.voice_parts)) t.voice_parts.forEach(function (pt) { addPart(pt, index); });
        if (Array.isArray(t.notes)) addPart(t, index);
      });
    }
    if (Array.isArray(j.notes)) addPart({ notes: j.notes }, 0);
    var out = [];
    parts.forEach(function (entry) {
      var pt = entry.part;
      if (!pt || !Array.isArray(pt.notes)) return;
      var base = num(pt.position, 0);
      var lang = entry.track.lang || guessLyricLanguage(pt.notes);
      if (lang) entry.track.lang = lang;
      var partNotes = [], tm = NSG.TEMPO.map({ tempo: bpm, tempos: tempoList });
      pt.notes.slice().sort(function (a, b) {
        return num(a && a.position, num(a && a.tick, 0)) - num(b && b.position, num(b && b.tick, 0));
      }).forEach(function (n) {
        if (!n || typeof n !== 'object') return;
        var pos = num(n.position, num(n.tick, 0));
        var dur = num(n.duration, res / 4);
        /* 0.9 版把音高写在 tone，pitch 是个 {data:[...]} 的音高曲线对象，
           直接 num(pitch) 会得到 NaN → 整条轨变成同一个音 */
        var pitch;
        if (typeof n.pitch === 'number' || (typeof n.pitch === 'string' && /^-?[\d.]+$/.test(n.pitch))) pitch = num(n.pitch, 60);
        else pitch = num(n.tone, 60);
        var lyric = String(n.lyric === undefined ? 'a' : n.lyric);
        var nU = {
          start: (base + pos) / res, dur: Math.max(1, dur) / res,
          pitch: Math.round(pitch), vel: Math.round(clamp(num(n.velocity, 96), 1, 127)), vib: 0
        };
        if (!partNotes.length) nU.pitchJoin = false;
        setLyric(nU, lyric, 'USTX', lang);
        var rawPitch = n.pitch && typeof n.pitch === 'object' ? n.pitch : null;
        if (rawPitch && Array.isArray(rawPitch.data)) {
          importPitchPoints(nU, rawPitch.data, tm);
          if (nU.pitchPoints && nU.pitchPoints.length && rawPitch.snap_first !== false && rawPitch.snapFirst !== false) {
            var prev = partNotes[partNotes.length - 1];
            nU.pitchPoints[0][1] = prev && NSG.TUNING.adjacent(prev, nU) ? (prev.pitch - nU.pitch) * 100 : 0;
          }
        }
        partNotes.push(nU);
        out.push(nU);
        entry.track.notes.push(nU);
      });
      groupLyrics(partNotes);
      if (Array.isArray(pt.curves) && NSG.TUNING && NSG.TUNING.pitPoints) {
        pt.curves.forEach(function (cv) {
          if (!cv || String(cv.abbr || '').toLowerCase() !== 'pitd') return;
          if (!Array.isArray(cv.xs) || !Array.isArray(cv.ys)) return;
          var len = Math.min(cv.xs.length, cv.ys.length), pts = [];
          for (var ci = 0; ci < len; ci++) {
            var bx = (base + num(cv.xs[ci], 0)) / res, cy = num(cv.ys[ci], 0);
            if (isFinite(bx) && isFinite(cy) && bx >= 0) pts.push([bx, clamp(cy, -2400, 2400)]);
          }
          if (pts.length) {
            entry.track.pit = NSG.TUNING.pitPoints((entry.track.pit || []).concat(pts));
          }
        });
      }
    });
    if (!out.length) throw new Error('USTX 中没有找到音符（需为 OpenUtau 0.4+ 格式）');
    out.sort(function (a, b) { return a.start - b.start; });
    var hasPitd = tracks.some(function (t) { return t.pit && t.pit.length; });
    return withImportTracks({ format: 'USTX', tempo: Math.round(bpm * 100) / 100, tempos: tempoList,
      warn: hasPitd ? '已读取 USTX 控制点与 PITD 曲线；独立颤音与声库参数未转换' : '已读取 USTX 控制点；独立颤音与声库参数未转换' }, tracks);
  };

  /* ---------------- UST（UTAU，顺序音符，480 tick/拍） ----------------
     编号允许重复，不能拿节名当字典键（部分转换器把每节都写成 #0000）。
     R 不生成发声音符，但 Length 和 Tempo 仍要生效，包括零长度的速度标签。
     UTAU 的 VoiceDir / Flags / Envelope 等属于采样引擎，不映射为本机音色。 */
  IO.readUST = function (text) {
    var settings = Object.create(null), sections = [], current = null, foundSetting = false;
    String(text).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).forEach(function (line) {
      var header = line.trim().match(/^\[#([^\]]+)\]$/);
      if (header) {
        var tag = header[1].toUpperCase();
        current = null;
        if (tag === 'SETTING') { current = settings; foundSetting = true; }
        else if (/^\d+$/.test(tag)) { current = Object.create(null); sections.push(current); }
        return;
      }
      var eq = line.indexOf('=');
      if (current && eq > 0) current[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
    });
    if (!foundSetting) throw new Error('UST 缺少 [#SETTING] 工程设置');
    var tick = 0, notes = [], tempoList = [], pitchImports = [], sampledImports = [];
    var mode2 = String(settings.mode2 || '').toLowerCase() !== 'false';
    function addTempo(value) {
      var bpm = Number(String(value || '').replace(',', '.'));
      // 某些 UST 写入 500000 等占位速度，应由音符节里的真实速度替代。
      if (!isFinite(bpm) || bpm <= 0 || bpm >= 10000) return;
      var last = tempoList[tempoList.length - 1], beat = tick / 480;
      if (last && last.beat === beat) { last.bpm = bpm; return; }
      if (!last || last.bpm !== bpm) tempoList.push({ beat: beat, bpm: bpm });
    }
    addTempo(settings.tempo);
    // UST 没有可靠的语种字段。假名可确认日语；纯罗马字沿用界面语种，
    // 不用英文常见词猜测，免得把拼音 you / wo / mei 等误认作英语。
    var lang = sections.some(function (s) { return /[\u3040-\u30ff]/.test(s.lyric || ''); }) ? 'ja' :
      guessLyricLanguage(sections.filter(function (s) { return /[ก-ฮ\u1100-\u11ff\uac00-\ud7a3ăâđêôơư\u1ea0-\u1ef9\u0400-\u04ffąćęłńśźż]/i.test((s.lyric || '').normalize('NFC')); }));
    sections.forEach(function (s, index) {
      var length = Number(s.length);
      if (!isFinite(length) || length < 0 || s.length === undefined || s.length === '') {
        throw new Error('UST 第 ' + (index + 1) + ' 个音符的 Length 无效');
      }
      addTempo(s.tempo);
      var lyric = cleanLyric(s.lyric);
      // VCV 的前一个元音只是采样别名的一部分，不应再次唱出。
      lyric = lyric.replace(/^(?:[-aiueonN]|[あいうえおん])\s+((?:[\u3040-\u30ff]+|R)(?:[↑↓])?)$/, '$1');
      lyric = lyric.replace(/^([\u3040-\u30ff]+)[↑↓]$/, '$1');
      if (length > 0) {
        if (/^(?:R|rest|SP|休止|休止符)$/i.test(lyric)) {
          // 暂存休止以隔断英语拆词，输出前删掉，保留累计时间。
          notes.push({ start: tick / 480, dur: length / 480, lyric: 'SP', rest: true });
        } else {
          var pitch = Number(s.notenum);
          if (!isFinite(pitch) || s.notenum === undefined || s.notenum === '' || pitch < 0 || pitch > 127) {
            throw new Error('UST 第 ' + (index + 1) + ' 个音符的 NoteNum 无效');
          }
          var n = { start: tick / 480, dur: length / 480, pitch: Math.round(pitch),
            vel: Math.round(clamp(num(s.intensity, 100) * 0.96, 1, 127)), vib: 0 };
          // UTAU 的 Velocity 就是辅音速度（0–200，越大越短），定义与本软件一致。
          if (s.velocity !== undefined && s.velocity !== '' && isFinite(Number(s.velocity))) n.consonantSpeed = Math.round(clamp(Number(s.velocity), 0, 200));
          setLyric(n, lyric, 'UST', lang);
          if (!mode2) sampledImports.push({ note: n, source: s });
          else if (s.pbs !== undefined && s.pbs !== '') pitchImports.push({ note: n, source: s });
          notes.push(n);
        }
      }
      tick += length;
    });
    groupLyrics(notes);
    notes = notes.filter(function (n) { return !n.rest; });
    if (!notes.length) throw new Error('UST 中没有找到发声音符');
    if (!tempoList.length) tempoList.push({ beat: 0, bpm: 120 });
    else if (tempoList[0].beat > 0) tempoList.unshift({ beat: 0, bpm: tempoList[0].bpm });
    var tm = NSG.TEMPO.map({ tempos: tempoList });
    var noteIndexMap = null;
    if (pitchImports.length) {
      noteIndexMap = new Map();
      for (var ni = 0; ni < notes.length; ni++) noteIndexMap.set(notes[ni], ni);
    }
    pitchImports.forEach(function (entry) {
      var n = entry.note, s = entry.source, start = s.pbs.split(/[;,]/), x = num(start[0], 0);
      var widths = s.pbw === undefined || s.pbw === '' ? [] : s.pbw.split(',');
      var heights = (s.pby || '').split(','), modes = (s.pbm || '').split(',');
      var data = [{ x: x, y: num(start[1], 0) }];
      widths.forEach(function (width, i) {
        x += Math.max(0, num(width, 0));
        data.push({ x: x, y: num(heights[i], 0) });
      });
      data.forEach(function (p, i) {
        var mode = (modes[i] || '').trim().toLowerCase();
        p.shape = mode === 's' ? 'l' : mode === 'r' ? 'o' : mode === 'j' ? 'i' : 's';
      });
      // A missing PBS height follows the adjacent note; explicit PBS heights
      // are authored controls and must survive the import.
      var index = noteIndexMap.get(n), prev = index > 0 ? notes[index - 1] : undefined;
      if ((start.length < 2 || start[1].trim() === '') && NSG.TUNING.adjacent(prev, n)) data[0].y = (prev.pitch - n.pitch) * 10;
      importPitchPoints(n, data, tm);
    });
    sampledImports.forEach(function (entry) {
      var n = entry.note, s = entry.source;
      var text = s.pitchbend || s.pitches || s.piches || '';
      var values = text ? text.split(',') : [];
      var start = pitchBeatAtMs(n, num(s.pbstart, 0), tm);
      var pts = values.map(function (v, i) { return [start + i * 5 / 480, num(v, 0), 'l']; });
      if (!pts.length) pts = [[0, 0, 'l'], [n.dur, 0, 'l']];
      else {
        if (start > 0) pts.unshift([0, 0, 'l']);
        var end = pts[pts.length - 1][0] + 5 / 480;
        if (end < n.dur) pts.push([end, 0, 'l'], [n.dur, 0, 'l']);
      }
      // Mode 1 is sampled at 5 ticks, in cents. Dormant Mode 2 handles must
      // not replace it. Fit samples once, retaining negative PBStart positions.
      n.pitchPoints = NSG.TUNING.fitPitch(NSG.TUNING.junctionPoints(pts), 1);
    });
    return withImportTracks({ format: 'UST', title: settings.projectname || settings.project,
      tempo: tempoList[0].bpm, tempos: tempoList,
      warn: '已读取 UST 音高曲线；独立颤音、音量包络与采样声库设置未转换' }, [{ name: settings.projectname || settings.project || 'UTAU 人声', lang: lang, notes: notes, sampledPit: !mode2 }]);
  };

  function nnReading(n, lyric, pinyin, allowRomanLyric) {
    // 歌词显示保持原样，发音优先使用工程保存的拼音（包括多音字）。
    var useReading = /[\u3400-\u9fff]/.test(lyric) || (allowRomanLyric && lyric !== pinyin && NSG.noteKind(n) === 'voiced');
    if (!n.slur && useReading && /^[a-zvü]+[1-5]?$/i.test(pinyin) && NSG.g2p) {
      var reading = NSG.g2p(pinyin, 'zh');
      if (reading.length) {
        n.phones = reading.reduce(function (all, s) { return all.concat(s.phones); }, []);
        // A saved reading can agree with the isolated character yet disagree
        // with the automatic phrase reading after adjacent notes are resolved.
        n.phonesSource = 'imported';
        n.phonesLang = 'zh';
      }
    }
  }

  // JSON 版每拍 16 格，MIDI = 95 - row（比旧文本的 key 多 12）。
  function readNNJSON(text) {
    var j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('NN 不是合法 JSON：' + e.message); }
    if (!j || !Array.isArray(j.track_dict_list) || typeof j.bpm_float !== 'number' ||
        !Number.isFinite(j.bpm_float) || j.bpm_float <= 0) throw new Error('NN JSON 工程头无效');
    var skipped = false;
    var tracks = j.track_dict_list.map(function (tr, trackIndex) {
      if (!tr || typeof tr !== 'object') throw new Error('NN 第 ' + (trackIndex + 1) + ' 条轨道数据无效');
      if (tr.type !== undefined && tr.type !== 0) { skipped = true; return null; }
      if (!Array.isArray(tr.note_dict_list) ||
          (tr.num_note !== undefined && tr.num_note !== tr.note_dict_list.length)) {
        throw new Error('NN 第 ' + (trackIndex + 1) + ' 条轨道音符数量无效或文件不完整');
      }
      var notes = tr.note_dict_list.map(function (src, index) {
        var label = 'NN 第 ' + (trackIndex + 1) + ' 条轨道第 ' + (index + 1) + ' 个音符';
        if (!src || ![src.start_64note, src.len_64note, src.row].every(function (v) {
          return typeof v === 'number' && Number.isFinite(v);
        }) || src.start_64note < 0 || src.len_64note <= 0 || !Number.isInteger(src.row) ||
            95 - src.row < 0 || 95 - src.row > 127) throw new Error(label + '数据无效');
        var n = { start: src.start_64note / 16, dur: src.len_64note / 16,
          pitch: 95 - src.row, vel: 96, vib: 0 };
        setLyric(n, src.lyric, 'NN');
        nnReading(n, String(src.lyric || ''), src.pinyin || '');
        if (src.PIT_list !== undefined) {
          if (!Array.isArray(src.PIT_list) || !src.PIT_list.every(function (v) {
            return typeof v === 'number' && Number.isFinite(v);
          }) || (src.PBS !== undefined && (typeof src.PBS !== 'number' || !Number.isFinite(src.PBS) || src.PBS < 0))) {
            throw new Error(label + '曲线数据无效');
          }
          var sensitivity = (src.PBS === undefined ? 0 : src.PBS) + 1;
          if (src.PIT_list.length) n.pb = src.PIT_list.map(function (v, i) {
            return [i / Math.max(1, src.PIT_list.length - 1), (v - 50) * 2 * sensitivity];
          });
        }
        return n;
      });
      return { name: tr.name || ('袅袅人声 ' + (trackIndex + 1)), lang: 'zh', notes: notes };
    }).filter(function (tr) { return tr !== null; });
    if (!tracks.some(function (tr) { return tr.notes.length; })) throw new Error('NN 中没有找到发声音符');
    return withImportTracks({ format: 'NN', tempo: j.bpm_float, tempos: [{ beat: 0, bpm: j.bpm_float }],
      warn: 'NN 颤音、音量包络与声库设置未转换' + (skipped ? '；非人声轨道未导入' : '') }, tracks);
  }

  /* ---------------- NN（袅袅，19 版每拍 8 格，旧版每拍 16 格） ----------------
     key 向下递增，MIDI = 83 - key。每行的两组曲线各自以点数开头。
     格式映射参考 LibreSVIP 的 nn 插件；不导入 #CHORD / #DRUM 的旧伴奏。 */
  IO.readNN = function (text) {
    var source = String(text).replace(/^\uFEFF/, '').trim();
    if (source.charAt(0) === '{') return readNNJSON(source);
    var lines = source.split(/\r\n|\n|\r/);
    var header = lines[0].trim().split(/\s+/).map(Number);
    if (header.length !== 10 || !header.every(Number.isFinite) || header[0] <= 0 || header[1] <= 0 || header[2] <= 0) {
      throw new Error('NN 工程头无效');
    }
    var count = Number(lines[1]), units = header[4] === 19 ? 8 : 16, notes = [];
    if (!Number.isInteger(count) || count <= 0 || count > lines.length - 2) throw new Error('NN 音符数量无效或文件不完整');
    for (var i = 0; i < count; i++) {
      var fields = lines[i + 2].trim().split(/\s+/);
      var values = fields.slice(2, 11).map(Number);
      if (fields.length !== 14 || !values.every(Number.isFinite) || values[0] < 0 || values[1] <= 0 ||
          !Number.isFinite(Number(fields[13])) || 83 - values[2] < 0 || 83 - values[2] > 127) {
        throw new Error('NN 第 ' + (i + 1) + ' 个音符数据无效');
      }
      var n = { start: values[0] / units, dur: values[1] / units, pitch: 83 - values[2],
        vel: Math.round(clamp(values[4] * 1.92, 1, 127)), vib: 0 };
      setLyric(n, fields[0], 'NN');
      nnReading(n, fields[0], fields[1]);
      var dynamics = fields[11].split(',').map(Number), curve = fields[12].split(',').map(Number);
      if (!dynamics.every(Number.isFinite) || dynamics[0] !== dynamics.length - 1 ||
          !curve.every(Number.isFinite) || curve[0] !== curve.length - 1) {
        throw new Error('NN 第 ' + (i + 1) + ' 个音符曲线不完整');
      }
      if (curve[0] > 0) {
        var sensitivity = Number(fields[13]) + 1;
        n.pb = curve.slice(1).map(function (v, index) {
          return [index / Math.max(1, curve[0] - 1), (v - 50) * 2 * sensitivity];
        });
      }
      notes.push(n);
    }
    return withImportTracks({ format: 'NN', tempo: header[0], tempos: [{ beat: 0, bpm: header[0] }],
      warn: 'NN 颤音、音量包络与声库设置未转换' + (/#(?:CHORD|DRUM)/.test(lines.slice(count + 2).join('\n')) ? '；旧版伴奏未导入' : '')
    }, [{ name: '袅袅人声', lang: 'zh', notes: notes }]);
  };

  /* ---------------- VPR（VOCALOID5 / VOCALOID6） ----------------
     ZIP metadata is read before inflating only Project/sequence.json. Embedded
     audio is never decompressed. Central sizes also support data descriptors.
     Field reference: sdercolin/utaformatix3 core/io/Vpr.kt. */
  function zipProjectEntry(b, entryName, format, names) {
    var v = new DataView(b.buffer, b.byteOffset, b.byteLength), eocd = -1;
    function need(off, len) {
      if (off < 0 || off + len > b.length) throw new Error(format + ' ZIP 数据不完整');
    }
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === b.length) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(format + ' ZIP 目录缺失或文件已截断');
    if (v.getUint16(eocd + 4, true) || v.getUint16(eocd + 6, true) ||
        v.getUint16(eocd + 8, true) !== v.getUint16(eocd + 10, true)) throw new Error('不支持分卷 ' + format + ' ZIP');
    var count = v.getUint16(eocd + 10, true), size = v.getUint32(eocd + 12, true), off = v.getUint32(eocd + 16, true);
    if (count === 65535 || size === 0xffffffff || off === 0xffffffff) throw new Error('暂不支持 ZIP64 ' + format);
    var dirStart = off, dirEnd = off + size, entry = null;
    if (dirEnd > eocd) throw new Error(format + ' ZIP 目录越界');
    for (var i = 0; i < count; i++) {
      need(off, 46);
      if (v.getUint32(off, true) !== 0x02014b50) throw new Error(format + ' ZIP 目录无效');
      var nameLen = v.getUint16(off + 28, true), extraLen = v.getUint16(off + 30, true), commentLen = v.getUint16(off + 32, true);
      var next = off + 46 + nameLen + extraLen + commentLen;
      if (next > dirEnd) throw new Error(format + ' ZIP 目录长度无效');
      var name = new TextDecoder('utf-8').decode(b.subarray(off + 46, off + 46 + nameLen));
      var path = name.replace(/\\/g, '/');
      if (names) names.push(path);
      if (path === entryName) {
        if (entry) throw new Error(format + ' ZIP 包含重复工程数据');
        entry = { flags: v.getUint16(off + 8, true), method: v.getUint16(off + 10, true),
          crc: v.getUint32(off + 16, true), packed: v.getUint32(off + 20, true),
          size: v.getUint32(off + 24, true), offset: v.getUint32(off + 42, true), name: name, dir: dirStart };
        if (v.getUint16(off + 34, true)) throw new Error('不支持分卷 ' + format + ' ZIP');
      }
      off = next;
    }
    if (off !== dirEnd) throw new Error(format + ' ZIP 目录长度不匹配');
    return entry;
  }
  var CRC32_TABLE = null;
  function zipProjectText(bytes, entryName, format) {
    var names = [], entry = zipProjectEntry(bytes, entryName, format, names);
    if (!entry) throw new Error(format + ' 中缺少 ' + entryName);
    if (entry.flags & 1) throw new Error('暂不支持加密 ' + format);
    if (entry.method !== 0 && entry.method !== 8) throw new Error('不支持此 ' + format + ' ZIP 压缩方式');
    if (!entry.size || entry.size > 64 * 1024 * 1024) throw new Error(format + ' 工程 JSON 大小无效或超过 64 MB');
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), off = entry.offset;
    if (off + 30 > entry.dir || v.getUint32(off, true) !== 0x04034b50) throw new Error(format + ' ZIP 文件头无效');
    var nameLen = v.getUint16(off + 26, true), begin = off + 30 + nameLen + v.getUint16(off + 28, true);
    if (begin + entry.packed > entry.dir || v.getUint16(off + 8, true) !== entry.method ||
        v.getUint16(off + 6, true) !== entry.flags ||
        new TextDecoder().decode(bytes.subarray(off + 30, off + 30 + nameLen)) !== entry.name) throw new Error(format + ' ZIP 文件头或长度不匹配');
    var raw = bytes.subarray(begin, begin + entry.packed);
    if (entry.method === 8) {
      var flate = root.fflate;
      if (!flate && typeof require === 'function') flate = require('./fflate.js');
      if (!flate) throw new Error(format + ' 解压模块未加载');
      raw = flate.inflateSync(raw, { out: new Uint8Array(entry.size) });
    }
    if (raw.length !== entry.size) throw new Error(format + ' JSON 解压长度不匹配');
    if (!CRC32_TABLE) {
      CRC32_TABLE = new Uint32Array(256);
      for (var ti = 0; ti < 256; ti++) {
        var tc = ti;
        for (var tk = 0; tk < 8; tk++) tc = (tc >>> 1) ^ (tc & 1 ? 0xedb88320 : 0);
        CRC32_TABLE[ti] = tc >>> 0;
      }
    }
    var crc = -1;
    for (var i = 0; i < raw.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ raw[i]) & 0xff];
    if (((crc ^ -1) >>> 0) !== entry.crc) throw new Error(format + ' JSON 校验失败，文件可能已损坏');
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(raw), names: names };
  }
  function vprEvents(events) {
    var points = (Array.isArray(events) ? events : []).filter(function (p) {
      return p && Number.isFinite(p.pos) && Number.isFinite(p.value);
    }).map(function (p) { return [p.pos, p.value]; }).sort(function (a, b) { return a[0] - b[0]; });
    return points.filter(function (p, i) { return i === points.length - 1 || p[0] !== points[i + 1][0]; });
  }
  function vprStep(points, tick, fallback) {
    var i = tlLower(points, tick);
    return i < points.length && points[i][0] === tick ? points[i][1] : i ? points[i - 1][1] : fallback;
  }
  function vprNotePitch(note, start, end, pit, pbs) {
    if (!pit.length) return;
    var ticks = [start, end], epsilon = Math.min(0.001, (end - start) * 0.000002);
    // MIDI-style controllers hold their last value. Narrow linear pairs retain
    // discontinuities in NSG's continuous editable curves, without long ramps.
    [pit, pbs].forEach(function (line) {
      for (var i = tlLower(line, start); i < line.length && line[i][0] < end; i++) {
        var tick = line[i][0];
        if (tick > start) ticks.push(Math.max(start, tick - epsilon), tick);
      }
    });
    ticks.sort(function (a, b) { return a - b; });
    var points = ticks.filter(function (t, i) { return !i || t !== ticks[i - 1]; }).map(function (tick) {
      // End-of-note uses the left limit; a new event belongs to the next note.
      var t = tick === end ? end - Math.min(epsilon, (end - start) / 2) : tick;
      return [(tick - start) / (end - start), clamp(vprStep(pit, t, 0), -8192, 8191) / 8192 *
        clamp(vprStep(pbs, t, 2), 0, 24) * 100, 'l'];
    });
    if (points.some(function (p) { return Math.abs(p[1]) > 1e-8; })) note.pb = points;
  }
  IO.readVPR = function (src) {
    var j;
    try {
      var text = typeof src === 'string' ? src : zipProjectText(toU8(src), 'Project/sequence.json', 'VPR').text;
      j = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (e) { throw new Error('无法读取 VPR 工程：' + e.message); }
    if (!isVPRProject(j)) throw new Error('VPR 工程缺少版本、主轨道或轨道数据');
    if (j.version.major !== 5 && j.version.major !== 6) throw new Error('暂不支持 VPR 版本 ' + j.version.major + '（支持 VOCALOID5 / 6）');
    var master = j.masterTrack, tempo = master.tempo || {}, globalTempo = tempo.global;
    var tempos = vprEvents(tempo.events).filter(function (p) { return p[0] >= 0 && p[1] > 0; })
      .map(function (p) { return { beat: p[0] / 480, bpm: p[1] / 100 }; });
    if (globalTempo && globalTempo.isEnabled && num(globalTempo.value, 0) > 0) {
      tempos = [{ beat: 0, bpm: num(globalTempo.value, 12000) / 100 }];
    }
    if (!tempos.length) tempos = [{ beat: 0, bpm: 120 }];
    var audioCount = 0, unsupportedLanguage = false;
    var tracks = j.tracks.map(function (tr) {
      var notes = [];
      (Array.isArray(tr.parts) ? tr.parts : []).forEach(function (part) {
        if (tr.type === 1 || part.wav) { audioCount++; return; }
        var base = num(part.pos, 0), clipEnd = num(part.duration, Infinity), partNotes = [];
        var voice = part.voice || {}, ids = part.aiVoice && part.aiVoice.langIDs;
        var langID = voice.langID;
        if (langID === undefined && Array.isArray(ids) && ids.length === 1) langID = typeof ids[0] === 'object' ? ids[0].langID : ids[0];
        var controllers = Array.isArray(part.controllers) ? part.controllers : [];
        function controller(name) {
          return vprEvents(controllers.reduce(function (events, c) { return c.name === name ? events.concat(c.events || []) : events; }, []));
        }
        var pit = controller('pitchBend'), pbs = controller('pitchBendSens');
        (Array.isArray(part.notes) ? part.notes : []).forEach(function (n) {
          if (!Number.isFinite(n.pos) || !Number.isFinite(n.duration) || !Number.isFinite(n.number) || n.number < 0 || n.number > 127) return;
          var start = Math.max(0, n.pos, -base), end = Math.min(n.pos + n.duration, clipEnd);
          if (end <= start) return;
          var id = n.langID === undefined ? langID : n.langID;
          var lang = { 0: 'ja', 1: 'en', 2: 'ko', 4: 'zh' }[id];
          if (id !== undefined && !lang) unsupportedLanguage = true;
          var note = { start: (base + start) / 480, dur: (end - start) / 480, pitch: Math.round(n.number), vel: 96, vib: 0 };
          setLyric(note, n.lyric, 'VPR', lang);
          vprNotePitch(note, start, end, pit, pbs);
          // V6 directPitches are per-note cent offsets and take precedence.
          if (Array.isArray(n.directPitches) && n.directPitches.length) {
            var direct = n.directPitches.filter(function (p) { return p && Number.isFinite(p.pos) && p.pos >= 0 && p.pos <= n.duration; })
              .map(function (p) { return { pos: n.pos + p.pos, value: Number.isFinite(p.value) ? p.value : 0 }; });
            var line = vprEvents(direct);
            if (line.length) {
              var ticks = [start].concat(line.filter(function (p) { return p[0] > start && p[0] < end; }).map(function (p) { return p[0]; }), [end]);
              note.pb = ticks.map(function (tick) { return [(tick - start) / (end - start), tlLinear(line, tick, 0), 'l']; });
            }
          }
          notes.push(note); partNotes.push(note);
        });
        partNotes.sort(function (a, b) { return a.start - b.start; });
        if (partNotes.length) partNotes[0].pitchJoin = false;
        groupLyrics(partNotes);
      });
      var vol = vprStep(vprEvents(tr.volume && tr.volume.events), 0, 0);
      var pan = vprStep(vprEvents(tr.panpot && tr.panpot.events), 0, 0);
      return assignTrackMix({ name: tr.name, notes: notes, lang: (notes[0] || {}).lang }, dbToLinear(vol / 10, -89), clamp(pan / 64, -1, 1), !!tr.isMuted);
    });
    if (!tracks.some(function (tr) { return tr.notes.length; })) throw new Error('VPR 中没有可导入的音符');
    var warn = 'VPR 声库、效果、手工音素、独立颤音、自动演唱及混音自动化暂不转换；未绘制音高处按本地音符重新合成';
    if (audioCount) warn += '；' + audioCount + ' 个音频片段未导入';
    if (unsupportedLanguage) warn += '；部分语种不受支持，请手动选择音素器';
    if ((master.timeSig && master.timeSig.events || []).some(function (s) { return s.bar !== 0 || s.numer !== 4 || s.denom !== 4; })) warn += '；拍号及拍号变化暂不转换';
    return withImportTracks({ format: 'VPR', title: j.title, tempo: tempos[0].bpm, tempos: tempos, warn: warn }, tracks);
  };

  /* ---------------- VSQX（VOCALOID3 vsq3 / VOCALOID4 vsq4） ----------------
     两代标签完全不同：
       vsq3: <posTick> <durTick> <noteNum> <velocity> <lyric>，速度 <bpm>
       vsq4: <t> <dur> <n> <v> <y>，速度 <v>
     而且速度是 ×100 的整数（13400 = 134BPM），旧版直接当 13400 用。
     用字符串扫描而不是 DOMParser：25MB 的工程解析 DOM 会卡死好几秒。 */
  IO.readVSQX = function (text) {
    var t = String(text).replace(/^\uFEFF/, '');
    var res = num((t.match(/<resolution>\s*(\d+)\s*<\/resolution>/) || [])[1], 480);
    var bpm = 120;
    var tempoList = [];
    var mt = t.match(/<masterTrack>([\s\S]*?)<\/masterTrack>/);
    var scope = mt ? mt[1] : t;
    /* 变速工程里 masterTrack 有多条 <tempo>，全部读出来；
       速度字段是 ×100 的整数（13400 = 134BPM），或在 vsq3 里叫 <bpm> */
    var reT = /<tempo>([\s\S]*?)<\/tempo>/g, mtv;
    while ((mtv = reT.exec(scope))) {
      var body = mtv[1];
      var raw = num((body.match(/<bpm>\s*([\d.]+)\s*<\/bpm>/) || [])[1], NaN);
      if (!isFinite(raw)) raw = num((body.match(/<v>\s*([\d.]+)\s*<\/v>/) || [])[1], NaN);
      if (!isFinite(raw) || raw <= 0) continue;
      var bpmV = raw > 1000 ? raw / 100 : raw;
      var tickV = num((body.match(/<t>\s*(\d+)\s*<\/t>/) || [])[1],
        num((body.match(/<posTick>\s*(\d+)\s*<\/posTick>/) || [])[1], 0));
      var beatV = tickV / res;
      var lastT = tempoList[tempoList.length - 1];
      if (lastT && Math.abs(lastT.beat - beatV) < 0.01) { lastT.bpm = Math.round(bpmV * 100) / 100; continue; }
      tempoList.push({ beat: Math.round(beatV * 1000) / 1000, bpm: Math.round(bpmV * 100) / 100 });
    }
    if (tempoList.length) bpm = tempoList[0].bpm;
    var tagReCache = Object.create(null);
    function tagRe(name) {
      return tagReCache[name] || (tagReCache[name] = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
    }
    function grab(block, names) {
      for (var i = 0; i < names.length; i++) {
        /* 内容可能是 CDATA（<lyric><![CDATA[あ]]></lyric>），
           所以不能排除 '<'，否则整段歌词被判成空 */
        var m = block.match(tagRe(names[i]));
        if (m) return m[1];
      }
      return null;
    }
    var cdataRe = /<!\[CDATA\[([\s\S]*?)\]\]>/, stripTagRe = /<[^>]*>/g;
    function cdataText(s) {
      if (s === null) return '';
      var m = s.match(cdataRe);
      if (m) return m[1].trim();
      return s.replace(stripTagRe, '').trim();
    }
    /* 同一轨的多个 part 保持在一轨，part 起点要加到音符的相对位置上。 */
    var vsUnits = {}, unitPos = 0, reUnit = /<vsUnit>([\s\S]*?)<\/vsUnit>/g, mu;
    while ((mu = reUnit.exec(t))) {
      var ub = mu[1];
      var uNo = num(grab(ub, ['vsTrackNo', 'tNo']), unitPos);
      vsUnits[uNo] = {
        mute: num(grab(ub, ['mute', 'm']), 0) > 0,
        pan: num(grab(ub, ['pan', 'p']), 64),
        vol: num(grab(ub, ['vol', 'v']), 0)
      };
      unitPos++;
    }
    var trackBlocks = [], reTrack = /<vsTrack>([\s\S]*?)<\/vsTrack>/g, matchTrack;
    while ((matchTrack = reTrack.exec(t))) trackBlocks.push(matchTrack[1]);
    if (!trackBlocks.length) trackBlocks = [t];
    var tracks = [], out = [];
    trackBlocks.forEach(function (trackBlock, trackIdx) {
      var pCut4 = trackBlock.indexOf('<vsPart>'), pCut3 = trackBlock.indexOf('<musicalPart>');
      var pCut = pCut4 >= 0 ? (pCut3 >= 0 ? Math.min(pCut4, pCut3) : pCut4) : pCut3;
      var trackHdr = pCut >= 0 ? trackBlock.slice(0, pCut) : trackBlock;
      var track = { name: cdataText(grab(trackHdr, ['trackName', 'name'])), notes: [] };
      var tNo = num(grab(trackHdr, ['vsTrackNo', 'tNo']), trackIdx);
      var unit = vsUnits[tNo];
      if (unit) {
        var vsVol = dbToLinear(unit.vol / 10, -89);
        var vsPan = unit.pan === 64 ? 0 : (unit.pan < 64 ? (unit.pan - 64) / 64 : (unit.pan - 64) / 63);
        assignTrackMix(track, vsVol, vsPan, unit.mute);
      }
      tracks.push(track);
      var containers = [];
      var re4 = /<vsPart>([\s\S]*?)<\/vsPart>/g, m4;
      while ((m4 = re4.exec(trackBlock))) containers.push(m4[1]);
      if (!containers.length) {
        var re3 = /<musicalPart>([\s\S]*?)<\/musicalPart>/g, m3;
        while ((m3 = re3.exec(trackBlock))) containers.push(m3[1]);
      }
      if (!containers.length) containers = [trackBlock];

      containers.forEach(function (ct) {
        var header = ct.split('<note>')[0];
        var base = ct === trackBlock ? 0 : num(grab(header, ['posTick', 't']), 0);
        var reN = /<note>([\s\S]*?)<\/note>/g, mn;
        while ((mn = reN.exec(ct))) {
          var b = mn[1];
          var pos = grab(b, ['posTick', 't']);
          var dur = grab(b, ['durTick', 'dur']);
          var pit = grab(b, ['noteNum', 'n']);
          var vel = grab(b, ['velocity', 'v']);
          var lyr = grab(b, ['lyric', 'y']);
          if (pos === null || pit === null) continue;
          var nV = {
            start: (base + num(pos, 0)) / res,
            dur: Math.max(1, num(dur, res / 4)) / res,
            pitch: Math.round(num(pit, 60)),
            vel: Math.round(clamp(num(vel, 64), 1, 127))
          };
          setLyric(nV, cdataText(lyr));
          out.push(nV);
          track.notes.push(nV);
        }
      });
    });
    if (!out.length) throw new Error('VSQX 中没有找到音符');
    out.sort(function (a, b) { return a.start - b.start; });
    return withImportTracks({ format: 'VSQX', tempo: Math.round(bpm * 100) / 100, tempos: tempoList }, tracks);
  };

  /* ---------------- 导入速度整理 ----------------
     保留音符、伴奏与变速点的原始位置，包括开头的空白和预备拍。
     单个速度点仍表示全局 BPM，从第 0 拍生效。 */
  var preparedUfNotes = new WeakSet();
  function prepareUfdataPitch(notes) {
    var sorted = notes.slice().sort(function (a, b) { return a.start - b.start; });
    var result = { repaired: 0, collapsed: 0, boundaries: 0 };
    function controls(n) { return n.pb && n.pb.length ? NSG.TUNING.points(n.pb) : []; }
    var curves = sorted.map(controls), fresh = sorted.map(function (n) { return !preparedUfNotes.has(n); });
    // Some conversions interpolate the change in the relative key reference
    // over a few ticks. In absolute pitch this becomes an isolated dip/peak.
    // Require a stable bridge on both sides AND an error in the key-jump
    // direction. Real hard jumps and narrow turns away from a seam survive.
    for (var i = 1; i < sorted.length; i++) {
      var prev = sorted[i - 1], n = sorted[i], a = curves[i - 1], b = curves[i];
      if (!fresh[i] || !fresh[i - 1] || !a.length || !b.length || Math.abs(prev.start + prev.dur - n.start) > 1e-6) continue;
      var jump = (n.pitch - prev.pitch) * 100;
      function tickA(p) { return (prev.start + p[0] * prev.dur - n.start) * 480; }
      function tickB(p) { return p[0] * n.dur * 480; }
      var left = a.filter(function (p) { var x = tickA(p); return x >= -12 && x <= -5; }).pop();
      var right = b.filter(function (p) { var x = tickB(p); return x >= 5 && x <= 12; })[0];
      if (left && right && Math.abs(jump) >= 50) {
        var lx = tickA(left), rx = tickB(right), ly = prev.pitch * 100 + left[1], ry = n.pitch * 100 + right[1];
        if (Math.abs(ry - ly) <= Math.max(50, Math.abs(jump) * 0.2)) {
          b.forEach(function (p) {
            var x = tickB(p), expected = ly + (ry - ly) * (x - lx) / (rx - lx);
            var error = n.pitch * 100 + p[1] - expected;
            if (x >= 0 && x < 5 && error * jump > 0 && Math.abs(error) > Math.max(15, Math.abs(jump) * 0.15) && Math.abs(error) <= Math.abs(jump) * 1.1) {
              p[1] = expected - n.pitch * 100; result.repaired++;
            }
          });
        }
      }
      // A missing sample at tickOn must use the common absolute boundary,
      // rather than holding each note's unrelated first/last offset to it.
      var tail = a[a.length - 1], head = b[0], tx = tickA(tail), hx = tickB(head);
      var ty = prev.pitch * 100 + tail[1], hy = n.pitch * 100 + head[1];
      if (tx <= 0 && tx >= -6 && hx >= 0 && hx <= 6 && hx > tx && Math.abs(hy - ty) <= 75) {
        var y = ty + (hy - ty) * -tx / (hx - tx);
        a.push([1, y - prev.pitch * 100, 'l']); b.unshift([0, y - n.pitch * 100, 'l']); result.boundaries++;
      }
    }
    curves.forEach(function (curve, index) {
      var n = sorted[index];
      if (!fresh[index] || !curve.length) return;
      var out = [];
      for (var i = 0; i < curve.length;) {
        var end = i;
        while (end + 1 < curve.length && Math.abs(curve[end + 1][1] - curve[i][1]) < 1e-8) end++;
        var before = curve[i - 1], after = curve[end + 1];
        // A short repeated sample inside a monotonic glide is sampling-clock
        // stair stepping, not a musical hold. Centre its timestamp (<=2 ticks).
        if (end > i && before && after && (curve[end][0] - curve[i][0]) * n.dur * 480 <= 4 &&
            (curve[i][1] - before[1]) * (after[1] - curve[end][1]) > 0) {
          out.push([(curve[i][0] + curve[end][0]) / 2, curve[i][1], 'l']); result.collapsed += end - i;
        } else for (var j = i; j <= end; j++) out.push(curve[j]);
        i = end + 1;
      }
      n.pb = NSG.TUNING.points(out);
      if (n.pb.length === 1) n.pb = [[0, n.pb[0][1], 'l'], [1, n.pb[0][1], 'l']];
      preparedUfNotes.add(n);
    });
    return result;
  }
  IO.prepareUfdataPitch = prepareUfdataPitch;
  IO.normalizeImport = function (res, options) {
    // Fit the selected external vocal track(s). Native snapshots keep their
    // saved handles; the editor offers an undoable fit for existing projects.
    options = options || {};
    if (res.tempos && res.tempos.length) {
      var list = res.tempos.slice().sort(function (a, b) { return a.beat - b.beat; });
      if (list.length === 1) {
        list = [{ beat: 0, bpm: list[0].bpm }];
      }
      res.tempos = list;
      res.tempo = list[0].bpm;
    }
    if (!res.project && NSG.TUNING) {
      var hasSelectedTracks = Array.isArray(res.selectedTracks) && res.selectedTracks.length;
      var trackEntries = hasSelectedTracks
        ? res.selectedTracks
        : [{ notes: res.notes || [], pit: res.pit, sampledPit: res.sampledPit }];
      var totalCleanup = { repaired: 0, collapsed: 0, boundaries: 0 };
      var totalFit = { notes: 0, before: 0, after: 0, vibratoNotes: 0, tolerance: res.format === 'Ufdata' ? 5 : 1 };
      trackEntries.forEach(function (tr) {
        var noteList = tr.notes || [];
        if (res.format === 'Ufdata') {
          var cleanup = prepareUfdataPitch(noteList);
          totalCleanup.repaired += cleanup.repaired || 0;
          totalCleanup.collapsed += cleanup.collapsed || 0;
          totalCleanup.boundaries += cleanup.boundaries || 0;
        }
        if (options.decouple && NSG.TUNING.decoupleTrackPitch) {
          var nextPit = NSG.TUNING.decoupleTrackPitch(noteList, tr.pit, { sampledPit: !!(tr.sampledPit || res.sampledPit) });
          if (nextPit && nextPit.length) tr.pit = nextPit;
          else delete tr.pit;
          if (!hasSelectedTracks) {
            if (nextPit && nextPit.length) res.pit = nextPit;
            else delete res.pit;
          }
          return;
        }
        if (!NSG.TUNING.simplifyPitch) return;
        // UST/USTX handles are authored, not dense samples. Keep their exact
        // positions and shapes on import; manual "精简 PIT" remains available.
        var fitNotes = /^(UST|USTX)$/.test(res.format) ? noteList.filter(function (n) { return !n.pitchPoints; }) : noteList;
        var tolerance = res.format === 'Ufdata' ? 5 : 1;
        var fit = NSG.TUNING.simplifyPitch(fitNotes, tolerance, { score: res });
        if (fit.notes) {
          totalFit.notes += fit.notes;
          totalFit.before += fit.before;
          totalFit.after += fit.after;
          totalFit.vibratoNotes += fit.vibratoNotes || 0;
        }
      });
      if (totalCleanup.repaired || totalCleanup.collapsed || totalCleanup.boundaries) res.pitchCleanup = totalCleanup;
      if (totalFit.notes) res.pitchFit = totalFit;
    }
    return res;
  };

  /* ---------------- DSC 工程 ----------------
     文件签名 "dscm"，UTF-8 BOM + CRLF + Tab 缩进的 JSON，键全是中文。
     结构：
       声乐曲[]  —— 每一行：角色/语种/调号/每分钟拍数/音符[]/技巧[]
                    音符是「顺序排列」的（没有绝对时间），时间靠累加时长；
                    纯音乐=true 归伴奏，跟随上一行一起播放=true 锚定在上一非跟随行起点。
       音色[]    —— 音色参数块（身高、倍频振幅、共振峰宽度、高阶共振峰、滤波、抖动…）
       编曲{}    —— 编曲片段库 musica_N_*（手编对齐与自动加花片段）
       打节拍{}  —— 打节拍配置（内置节拍与工程内配置，含周期音高和弦调制）
       谱曲{}    —— 眼睛曲线（眼睛[]：开始/峰的时间/结束/峰值/左尖锐/右尖锐） */
  var DSC_BUILTIN_BEAT = {
    '名称': '内置节拍',
    '开始长度': 2,
    '周期长度': 2,
    '周期音高循环方式': 'n个周期',
    '周期音高循环周期数': 7,
    '开始': [
      { '乐器名称': '默认乐器_鼓', '开始时间': 0, '持续时间': 0.75, '音高': 36, '力度': 0.32981344596972895 },
      { '乐器名称': '默认乐器_鼓', '开始时间': 1.25, '持续时间': 0.75, '音高': 36, '力度': 0.6311158042942626 }
    ],
    '音符数组': [
      { '乐器名称': '默认乐器_鼓', '开始时间': 0, '持续时间': 0.3, '音高': 60, '力度': 1 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0, '持续时间': 0.7, '音高': 29, '力度': 1 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0, '持续时间': 0.7, '音高': 41, '力度': 0.4 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0, '持续时间': 0.7, '音高': 48, '力度': 1 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0.5, '持续时间': 0.7, '音高': 29, '力度': 1 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0.5, '持续时间': 0.7, '音高': 41, '力度': 0.4 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0.5, '持续时间': 0.7, '音高': 48, '力度': 0.3 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1, '持续时间': 0.7, '音高': 29, '力度': 1 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1, '持续时间': 0.7, '音高': 41, '力度': 0.4 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1, '持续时间': 0.7, '音高': 58, '力度': 0.8019657808518383 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1.5, '持续时间': 0.7, '音高': 29, '力度': 0.8 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1.5, '持续时间': 0.7, '音高': 41, '力度': 0.4 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1.5, '持续时间': 0.7, '音高': 53, '力度': 0.4 }
    ],
    '周期音高': {
      '控制点数组': [
        { 'm开始x': 0, 'm峰的x': 0, 'm结束x': 0.6804489264801559, 'm峰值': 0.15275590551181106, 'm左尖锐': 1, 'm右尖锐': 1, 'm增加': true },
        { 'm开始x': 0.774983734547821, 'm峰的x': 1, 'm结束x': 1, 'm峰值': 0.1023622047244096, 'm左尖锐': 1, 'm右尖锐': 1, 'm增加': true },
        { 'm开始x': 0.44381912817176294, 'm峰的x': 0.6798959011060515, 'm结束x': 0.8860442420299283, 'm峰值': 0.1716535433070867, 'm左尖锐': 1, 'm右尖锐': 1, 'm增加': false }
      ],
      '最小值x': 0, '最大值x': 1, '最小值y': -24, '最大值y': 24, '只能为正': false
    }
  };

  // The latter two plucks of the bundled clove pattern have harmonic filters.
  // Keep those controls: dropping them turns all four strokes equally bright.
  DSC_BUILTIN_BEAT['音符数组'].forEach(function (n) {
    if (n['乐器名称'] !== '默认乐器_吉他' || n['开始时间'] < 1) return;
    var shape = n['音高'] === 29 ? [4.728627236988359, 6.689411550713853, 8.643367666709054]
      : n['音高'] === 58 ? [4.313935366998406, 6.148217466935143, 11.707548404380752]
      : [7.5713673720584875, 9.56377723923115, 11.707548404380752];
    n['滤波单位是基频倍数不是绝对频率'] = true;
    n['滤波'] = { '最大值x': 50, '控制点数组': [
      { m开始x: shape[0], m峰的x: shape[1], m结束x: 50, m峰值: 1, m左尖锐: 1, m右尖锐: 0.1, m增加: false },
      { m开始x: shape[2], m峰的x: 50, m结束x: 50, m峰值: 1, m左尖锐: 0.1, m右尖锐: 0.1, m增加: false }
    ] };
  });

  // Broken 12-string guitar + drum groove for legacy "风格": "clove4" projects,
  // modelled after the 4-beat arpeggiated bass/guitar skeleton measured in the reference WAV.
  var DSC_CLOVE4_BEAT = {
    '名称': '丁香',
    '开始长度': 0,
    '周期长度': 4,
    _clove4FollowKey: true,
    '开始': [],
    '音符数组': [
      { '乐器名称': '默认乐器_鼓', '开始时间': 0, '持续时间': 0.35, '音高': 36, '力度': 0.35 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0, '持续时间': 0.48, '音高': 48, '力度': 0.85 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0, '持续时间': 0.48, '音高': 60, '力度': 0.34 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0.5, '持续时间': 0.48, '音高': 47, '力度': 0.78 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 0.5, '持续时间': 0.48, '音高': 59, '力度': 0.32 },
      { '乐器名称': '默认乐器_鼓', '开始时间': 1, '持续时间': 0.4, '音高': 36, '力度': 0.72 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1, '持续时间': 0.48, '音高': 43, '力度': 0.76 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1, '持续时间': 0.48, '音高': 55, '力度': 0.30 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1.5, '持续时间': 1.2, '音高': 41, '力度': 0.74 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 1.5, '持续时间': 1.15, '音高': 53, '力度': 0.30 },
      { '乐器名称': '默认乐器_鼓', '开始时间': 2.25, '持续时间': 0.2, '音高': 42, '力度': 0.22 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 2.75, '持续时间': 0.48, '音高': 47, '力度': 0.74 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 2.75, '持续时间': 0.48, '音高': 59, '力度': 0.32 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 3.25, '持续时间': 0.48, '音高': 48, '力度': 0.82 },
      { '乐器名称': '默认乐器_吉他', '开始时间': 3.25, '持续时间': 0.48, '音高': 60, '力度': 0.34 },
      { '乐器名称': '默认乐器_鼓', '开始时间': 3.75, '持续时间': 0.3, '音高': 38, '力度': 0.78 },
      { '乐器名称': '默认乐器_鼓', '开始时间': 3.75, '持续时间': 0.2, '音高': 42, '力度': 0.35 }
    ]
  };
  DSC_CLOVE4_BEAT['音符数组'].forEach(function (n) {
    if (n['乐器名称'] !== '默认乐器_吉他') return;
    var isOctave = n['音高'] >= 53;
    var cut = isOctave ? [4.5, 6.5, 10.5] : [6.5, 9.0, 12.0];
    n['滤波单位是基频倍数不是绝对频率'] = true;
    n['滤波'] = { '最大值x': 50, '控制点数组': [
      { m开始x: cut[0], m峰的x: cut[1], m结束x: 50, m峰值: 1, m左尖锐: 1, m右尖锐: 0.1, m增加: false },
      { m开始x: cut[2], m峰的x: 50, m结束x: 50, m峰值: 1, m左尖锐: 0.1, m右尖锐: 0.1, m增加: false }
    ] };
  });

  function dscBell(x, a, p, b, leftSharp, rightSharp) {
    if (x <= a || x >= b) {
      if (Math.abs(x - p) < 1e-9 && x >= a && x <= b) return 1;
      return 0;
    }
    if (x <= p) {
      var uL = p > a ? (p - x) / (p - a) : 0;
      return Math.pow(Math.max(0, (1 + Math.cos(-Math.PI * uL)) * 0.5), Math.max(0.05, leftSharp));
    }
    var uR = b > p ? (x - p) / (b - p) : 0;
    return Math.pow(Math.max(0, (1 + Math.cos(Math.PI * uR)) * 0.5), Math.max(0.05, rightSharp));
  }

  function dscCtrlCurveVal(curve, x) {
    var pts = curve && curve['控制点数组'];
    if (!pts || !pts.length) return 0;
    var sum = 0;
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var val = num(pt['m峰值'], 0) * dscBell(
        x, num(pt['m开始x'], 0), num(pt['m峰的x'], 0), num(pt['m结束x'], 1),
        num(pt['m左尖锐'], 1), num(pt['m右尖锐'], 1)
      );
      sum += pt['m增加'] === false ? -val : val;
    }
    return clamp(sum, curve['只能为正'] ? 0 : -1, 1);
  }

  function dscFilterGain(y) {
    if (y <= 0) return clamp(1 + y, 1e-3, 1);
    if (y <= 0.5) return 1 + 2 * y;
    if (y <= 0.875) return 2 + (y - 0.5) / 0.375 * 6;
    return 8 + (y - 0.875) / 0.125 * 24;
  }

  function dscSkillEnv(s, t) {
    var a = num(s['开始'], 0), p = num(s['峰的时间'], a), b = num(s['结束'], p);
    var v = num(s['峰值'], 0), k = Math.max(0.05, num(s['峰尖锐'], 1));
    if (t <= a || t >= b || !v) return 0;
    return v * dscBell(t, a, p, b, k, k);
  }

  function dscSkillType(s) { return String(s && (s['类型'] || s['名称']) || ''); }
  function dscSectionStart(row) { return !!(row['自动谱曲'] && row['自动谱曲']['自然段开始'] || row['自然段开始']); }
  function dscBeatName(row) { return String(row['打节拍配置名称'] !== undefined ? row['打节拍配置名称'] : row['节拍配置名称'] || '').trim(); }

  function dscTrillWarp(relT, upDur, downDur, grad) {
    var slowRate, fastRate;
    if (grad < 0) {
      slowRate = 1 / 3 + (1 - 1 / 3) * (grad + 1);
      fastRate = 3 + (1 - 3) * (grad + 1);
    } else {
      slowRate = 1 + 2 * grad;
      fastRate = 1 + (1 / 3 - 1) * grad;
    }
    if (relT <= upDur) {
      var r1 = upDur > 1e-6 ? 1 + (slowRate - 1) * (1 - relT / upDur) : 1;
      return ((slowRate + r1) * 0.5) * relT;
    }
    var r2 = downDur > 1e-6 ? 1 + (fastRate - 1) * clamp((relT - upDur) / downDur, 0, 1) : 1;
    return ((slowRate + 1) * 0.5) * upDur + ((1 + r2) * 0.5) * (relT - upDur);
  }

  IO.readDSC = function (text) {
    var t = String(text).replace(/^\uFEFF/, '');
    var j;
    try { j = JSON.parse(t); }
    catch (e1) {
      /* 手工改过的 DSC 偶尔会留下尾逗号 */
      try { j = JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); }
      catch (e2) { throw new Error('DSC 不是合法 JSON：' + e1.message); }
    }
    if (j['文件签名'] !== 'dscm') throw new Error('不是有效的 DSC 工程文件（文件签名不是 dscm）');
    var rows = j['声乐曲'] || [];
    var tempo = 120, root = 60;
    var acc = [];
    var title = j['歌曲名称'] || j['文件名'] || 'DSC 工程';
    var importWarnings = [];
    var langMap = { chinese: 'zh', cantonese: 'yue', japanese: 'ja', english: 'en', german: 'de', polish: 'pl', russian: 'ru', ukrainian: 'uk', taiwanese: 'nan', minnan: 'nan', korean: 'ko', vietnamese: 'vi' };

    function toArr(v) { return Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]); }
    function noteLyric(n) {
      var s = n['音节发音'] || {};
      var lyr = n['歌词'] || s['音符显示'] || s['原文'] || '';
      lyr = String(lyr).replace(/[\u0000-\u001f]/g, '').trim();
      if (!lyr) {
        var py = String(s['原生表音法的音节'] || '').replace(/\d+$/, '');
        lyr = py || 'a';
      }
      return lyr;
    }
    function isArticTied(raw, prevRaw) {
      if (raw && raw['连音']) return true;
      var s = raw && raw['音节发音'];
      var next = s && s['后面的音节过度发音小段'];
      if (next && next['用于过度时使能'] && next['音节发音'] === '过度到浊辅音前声带音') return true;
      if (prevRaw) {
        var ps = prevRaw['音节发音'];
        var pnext = ps && ps['后面的音节过度发音小段'];
        if (pnext && pnext['用于过度时使能'] && pnext['音节发音'] === '过度到浊辅音前声带音') return true;
      }
      return false;
    }
    /** Compute AllSing's speaker spoken MIDI pitch from timbre height (fallback 160 cm -> MIDI 53). */
    function dscSpokenMidi(spec) {
      var h = clamp(num(spec && spec['身高'], 160), 110, 210);
      var hz2 = 26100.908615 + (30423.272 - 26100.908615) * (h - 178.0) / (116.6 - 178.0);
      var hz = hz2 / h;
      return Math.round(clamp(Math.log(hz / 261.63) / Math.LN2 * 12 + 60, 24, 96));
    }
    function buildRowNotes(row, withPitch, speechBasePitch) {
      var isSpeech = speechBasePitch !== undefined && speechBasePitch !== null;
      var out = [], tt = 0, seq = row['音符'] || [];
      seq.forEach(function (n, idx) {
        var dur = num(n['时长'], 1);
        // AllSing rap / spoken rows ignore note['音高'] and sing on a flat speaker base pitch.
        var rawPitch = isSpeech ? speechBasePitch : num(n['音高'], 60);
        var pit = isSpeech ? speechBasePitch : Math.round(rawPitch);
        var isRest = !!n['休止符'] || !!(n['音节发音'] && n['音节发音']['休止符']);
        var slur = !!(n['连音'] && out.length && !isRest);
        out.push({
          start: tt,
          dur: Math.max(0.0625, dur),
          rawDur: Math.max(0.0625, dur),
          pitch: pit,
          rawPitch: rawPitch,
          vel: 96,
          lyric: slur ? '‿' : (isRest ? 'R' : noteLyric(n)),
          slur: slur,
          rest: isRest,
          raw: n,
          stress: !!((n['自动谱曲'] && n['自动谱曲']['节拍结束']) || (n['音节发音'] && n['音节发音']['重音'])),
          decor: toArr(n['编曲修饰']),
          idx: idx
        });
        tt += dur;
      });
      if (!withPitch || !out.length) return out;

      var skills = toArr(row['技巧']);
      var pitchSkills = skills.filter(function (s) {
        return s && /^(frequency|trill)$/.test(dscSkillType(s)) && num(s['峰值'], 0) > 0;
      });
      // Compute note-to-note transition windows in row beat coordinates (disabled for flat speech rows).
      var bounds = [];
      if (!isSpeech) {
        for (var bi = 0; bi + 1 < out.length; bi++) {
          var left = out[bi], right = out[bi + 1];
          if (left.rest || right.rest || Math.abs(left.rawPitch - right.rawPitch) < 1e-6) continue;
          var outR = clamp(num(left.raw['右侧过度时长'], 0.09375), 0, left.rawDur * 0.5);
          var inL = clamp(num(right.raw['左侧过度时长'], 0.09375), 0, right.rawDur * 0.5);
          var span = outR + inL;
          if (span > 1e-6) {
            bounds.push({
              t0: right.start - outR,
              t1: right.start + inL,
              p0: left.rawPitch,
              p1: right.rawPitch
            });
          }
        }
      }
      function baseSemiAt(i, t) {
        var cur = out[i], p = cur.rawPitch;
        for (var k = 0; k < bounds.length; k++) {
          var b = bounds[k];
          if (t >= b.t0 && t <= b.t1) {
            var u = (t - b.t0) / (b.t1 - b.t0);
            p = b.p0 + (b.p1 - b.p0) * 0.5 * (1 - Math.cos(Math.PI * u));
            break;
          }
        }
        return p;
      }
      function dropSemiAt(i, t) {
        var cur = out[i], raw = cur.raw;
        var prevRaw = i > 0 ? out[i - 1].raw : null;
        var nextRaw = i + 1 < out.length ? out[i + 1].raw : null;
        var s0 = cur.start, s1 = cur.start + cur.rawDur, semi = 0;
        var dropL = clamp(num(raw['左侧频率沿着吐字降低率'], 0), 0, 2);
        if (dropL > 0 && !cur.slur && !isArticTied(raw, prevRaw)) {
          var delayL = Math.max(0, num(raw['左侧吐字延迟开始'], 0));
          var buildL = Math.max(0, num(raw['左侧吐字建立耗时'], 0));
          var durL = Math.max(0, num(raw['左侧频率沿着吐字降低时长'], 0.09375));
          var tBuildL = s0 + delayL + buildL, tEndL = tBuildL + durL;
          if (t < tBuildL) {
            semi -= 12 * dropL;
          } else if (t <= tEndL) {
            var uL = durL > 1e-6 ? Math.sin(0.5 * Math.PI * clamp((t - tBuildL) / durL, 0, 1)) : 0.5;
            semi -= 12 * (1 - uL) * dropL;
          }
        }
        var dropR = clamp(num(raw['右侧频率沿着吐字降低率'], 0), 0, 2);
        if (dropR > 0 && !(nextRaw && nextRaw['连音']) && !isArticTied(nextRaw, raw)) {
          var earlyR = Math.max(0, num(raw['右侧吐字提前结束'], 0));
          var fadeR = Math.max(0, num(raw['右侧吐字消失耗时'], 0));
          var durR = Math.max(0, num(raw['右侧频率沿着吐字降低时长'], 0.09375));
          var tFadeR = s1 - earlyR - fadeR, tStartR = tFadeR - durR;
          if (t > tFadeR) {
            semi -= 12 * dropR;
          } else if (t >= tStartR) {
            var xR = durR > 1e-6 ? clamp((t - tStartR) / durR, 0, 1) : 0.5;
            var uR = 0.5 * (1 + Math.cos(xR * Math.PI));
            semi -= 12 * (1 - uR) * dropR;
          }
        }
        return semi;
      }
      function skillSemiAt(t) {
        var semi = 0;
        for (var si = 0; si < pitchSkills.length; si++) {
          var sk = pitchSkills[si];
          var a = num(sk['开始'], 0), b = num(sk['结束'], a);
          if (t <= a || t >= b) continue;
          var env = dscSkillEnv(sk, t);
          if (!env) continue;
          if (dscSkillType(sk) === 'frequency') {
            semi += (sk['频率增加'] ? 4 : -4) * env;
          } else if (dscSkillType(sk) === 'trill') {
            var p = num(sk['峰的时间'], a);
            var speed = Math.max(0.05, num(sk['颤音速度'], 1));
            var grad = clamp(num(sk['颤音速度渐变'], 0), -1, 1);
            var sineRatio = clamp(num(sk['颤音正弦比例'], 1), 0, 1);
            var phase = num(sk['颤音相位'], 0);
            var amp = env <= 0.5 ? (2 * env) : (1 + 18 * (env - 0.5));
            var tw = a + dscTrillWarp(t - a, Math.max(0, p - a), Math.max(0, b - p), grad);
            var cyc = (tw - phase) * speed;
            var wave = Math.sin(2 * Math.PI * 6 * cyc);
            if (sineRatio < 1) {
              var irr = Math.sin(2 * Math.PI * 8.37 * cyc) * 0.6 + Math.sin(2 * Math.PI * 13.73 * cyc) * 0.4;
              wave = sineRatio * wave + (1 - sineRatio) * irr;
            }
            semi += 0.375 * amp * wave;
          }
        }
        return semi;
      }

      for (var ni = 0; ni < out.length; ni++) {
        var note = out[ni];
        if (note.rest) continue;
        var n0 = note.start, n1 = n0 + note.rawDur;
        var hasTrill = false, hasCurve = Math.abs(note.rawPitch - note.pitch) > 1e-4;
        for (var bi2 = 0; !hasCurve && bi2 < bounds.length; bi2++) {
          if (bounds[bi2].t1 >= n0 && bounds[bi2].t0 <= n1) hasCurve = true;
        }
        if (!hasCurve && (num(note.raw['左侧频率沿着吐字降低率'], 0) > 0 || num(note.raw['右侧频率沿着吐字降低率'], 0) > 0)) {
          hasCurve = true;
        }
        for (var si2 = 0; si2 < pitchSkills.length; si2++) {
          var sk2 = pitchSkills[si2];
          if (num(sk2['结束'], 0) >= n0 && num(sk2['开始'], 0) <= n1) {
            hasCurve = true;
            if (dscSkillType(sk2) === 'trill') hasTrill = true;
          }
        }
        if (!hasCurve) continue;

        var step = hasTrill ? (1 / 48) : (1 / 24);
        var ts = [n0, n1];
        for (var gt = n0 + step; gt < n1 - 1e-6; gt += step) ts.push(gt);
        var bL = n0 + Math.max(0, num(note.raw['左侧吐字延迟开始'], 0)) + Math.max(0, num(note.raw['左侧吐字建立耗时'], 0));
        var eL = bL + Math.max(0, num(note.raw['左侧频率沿着吐字降低时长'], 0.09375));
        var fR = n1 - Math.max(0, num(note.raw['右侧吐字提前结束'], 0)) - Math.max(0, num(note.raw['右侧吐字消失耗时'], 0));
        var sR = fR - Math.max(0, num(note.raw['右侧频率沿着吐字降低时长'], 0.09375));
        [bL, eL, sR, fR].forEach(function (bt) { if (bt > n0 && bt < n1) ts.push(bt); });
        for (var bi3 = 0; bi3 < bounds.length; bi3++) {
          var bk = bounds[bi3];
          if (bk.t0 > n0 && bk.t0 < n1) ts.push(bk.t0);
          if (bk.t1 > n0 && bk.t1 < n1) ts.push(bk.t1);
        }
        for (var si3 = 0; si3 < pitchSkills.length; si3++) {
          var sk3 = pitchSkills[si3];
          [num(sk3['开始'], 0), num(sk3['峰的时间'], 0), num(sk3['结束'], 0)].forEach(function (st3) {
            if (st3 > n0 && st3 < n1) ts.push(st3);
          });
        }
        ts.sort(function (a, b) { return a - b; });
        var pb = [], maxAbs = 0;
        for (var ti = 0; ti < ts.length; ti++) {
          if (ti > 0 && ts[ti] - ts[ti - 1] < 1e-6) continue;
          var tt2 = ts[ti];
          var totalSemi = baseSemiAt(ni, tt2) + dropSemiAt(ni, tt2) + skillSemiAt(tt2);
          var cents = Math.round((totalSemi - note.pitch) * 1000) / 10;
          if (Math.abs(cents) > maxAbs) maxAbs = Math.abs(cents);
          var u = clamp((tt2 - n0) / note.rawDur, 0, 1);
          pb.push([Math.round(u * 10000) / 10000, cents, 'l']);
        }
        if (maxAbs > 0.1 && pb.length >= 2) {
          note.pb = pb;
          note.vib = 0;
        }
      }
      return out;
    }

    function resolveDscInst(name, roleHint) {
      var s = String(name || '').trim();
      var m154 = s.match(/154\s*,\s*(\d+)/);
      if (m154) return { inst: 'drumkit', drumPitch: clamp(parseInt(m154[1], 10), 0, 127) };
      if (s === '默认乐器_鼓') return { inst: 'drumkit', drumPitch: null };
      if (s === '默认乐器_沙锤') return { inst: 'drumkit', drumPitch: 70 };
      if (s === '默认乐器_吉他') return { inst: 'guitar', drumPitch: null };
      if (s === '默认乐器_钢琴') return { inst: 'piano', drumPitch: null };
      var mMidi = s.match(/MidiInstrument[^\d]*(\d+)\s*$/i);
      if (mMidi) return { inst: PROG_INST(parseInt(mMidi[1], 10)), drumPitch: null };
      if (/^MidiInstrument/i.test(s)) return { inst: PROG_INST(0), drumPitch: null };
      if (/^\d+$/.test(s)) return { inst: PROG_INST(parseInt(s, 10)), drumPitch: null };
      var combined = s + ' ' + String(roleHint || '');
      if (/鼓|镲|钹|鼓组|沙锤|通鼓|tom|drum|kick|snare|hat|perc/i.test(combined)) return { inst: 'drumkit', drumPitch: null };
      if (/低音|贝斯|bass|巴松|大提/i.test(combined)) return { inst: 'bass', drumPitch: null };
      if (/弦|提琴|strings|violin/i.test(combined)) return { inst: 'strings', drumPitch: null };
      if (/电钢|rhodes|\bep\b/i.test(combined)) return { inst: 'ep', drumPitch: null };
      if (/钢琴|piano|keys/i.test(combined)) return { inst: 'piano', drumPitch: null };
      if (/竖琴|harp/i.test(combined)) return { inst: 'harp', drumPitch: null };
      if (/吉他|guitar|拨|pluck|\barp\b/i.test(combined)) return { inst: 'guitar', drumPitch: null };
      if (/长笛|flute/i.test(combined)) return { inst: 'flute', drumPitch: null };
      if (/单簧管|clarinet/i.test(combined)) return { inst: 'clarinet', drumPitch: null };
      if (/铜管|brass|小号|trumpet/i.test(combined)) return { inst: 'brass', drumPitch: null };
      return { inst: 'pad', drumPitch: null };
    }
    function dscInst(name, roleHint) {
      var info = resolveDscInst(name, roleHint), s = String(name || '').trim();
      info.source = s;
      var m = s.match(/(?:^|✾)(\d+)$/);
      if (m && info.inst !== 'drumkit') info.program = clamp(Number(m[1]), 0, 127);
      return info;
    }

    function rowSlots(row, key) {
      var slots = toArr(row[key]).slice();
      for (var i = 1; i <= 2; i++) if (!slots[i] && row['副' + key + i]) slots[i] = row['副' + key + i];
      return slots;
    }
    function rowDynamics(row, slot, start, dur, toBeat) {
      var beatAmpOnly = slot === null;
      var skills = toArr(row['技巧']), relevant = skills.filter(function (s) {
        return s && (dscSkillType(s) === 'amplitude' || (!beatAmpOnly && /^timbre_switch_[1-4]$/.test(dscSkillType(s))));
      });
      if (beatAmpOnly && !relevant.length) return null;
      var gain = beatAmpOnly ? 1 : clamp(num(row['声乐曲音量'], 0.84), 0, 2) / 0.84;
      function at(t) {
        var amp = 1, weights = [0, 0, 0, 0, 0];
        relevant.forEach(function (s) {
          var type = dscSkillType(s), v = dscSkillEnv(s, t);
          if (type === 'amplitude') amp *= Math.max(0, 1 + (s['强度增加'] ? v : -v));
          else if (!beatAmpOnly && t >= num(s['开始'], 0) && t <= num(s['结束'], 0)) weights[Number(type.slice(-1))] = clamp(v, 0, 1);
        });
        if (beatAmpOnly) return clamp(amp, 0, 16);
        var sum = weights[1] + weights[2] + weights[3] + weights[4];
        return clamp(amp * (slot === 0 ? Math.max(0, 1 - sum) : weights[slot] / Math.max(1, sum)), 0, 16);
      }
      var cuts = [start, start + dur];
      relevant.forEach(function (s) {
        ['开始', '峰的时间', '结束'].forEach(function (k) { var t = num(s[k], start); if (t > start && t < start + dur) cuts.push(t); });
      });
      cuts.sort(function (a, b) { return a - b; });
      cuts = cuts.filter(function (x, i) { return !i || x - cuts[i - 1] > 1e-8; });
      var sampled = [[cuts[0], at(cuts[0])]];
      function segment(a, b, va, vb, depth) {
        var m = (a + b) / 2, vm = at(m), q1 = at((a + m) / 2), q3 = at((m + b) / 2);
        if (depth < 12 && Math.max(Math.abs(vm - (va + vb) / 2), Math.abs(q1 - (va * 3 + vb) / 4), Math.abs(q3 - (va + vb * 3) / 4)) > 0.001) {
          segment(a, m, va, vm, depth + 1); segment(m, b, vm, vb, depth + 1);
        } else sampled.push([b, vb]);
      }
      for (var i = 1; i < cuts.length; i++) segment(cuts[i - 1], cuts[i], at(cuts[i - 1]), at(cuts[i]), 0);
      var base = toBeat(start), span = Math.max(1e-9, toBeat(start + dur) - base);
      var values = sampled.map(function (p) { return [clamp((toBeat(p[0]) - base) / span, 0, 1), p[1]]; });
      var first = values[0][1];
      if (values.every(function (p) { return Math.abs(p[1] - first) < 1e-8; })) return { gain: gain * first };
      return { gain: gain, gainPoints: values };
    }

    function pushAcc(start, dur, pitch, vel, instInfo, dynamics) {
      if (!(vel > 0) || (dynamics && dynamics.gain === 0)) return;
      var st = Math.max(0, start), du = Math.max(0.0625, dur);
      var p = instInfo.drumPitch !== null && instInfo.drumPitch !== undefined ? instInfo.drumPitch : Math.round(pitch);
      var note = {
        start: Math.round(st * 10000) / 10000,
        dur: Math.round(du * 10000) / 10000,
        pitch: p,
        vel: clamp(Math.round(vel), 1, 127),
        inst: instInfo.inst || 'pad'
      };
      if (instInfo.program !== undefined) note.midiProgram = instInfo.program;
      if (instInfo.source) note.dscSource = { instrument: instInfo.source };
      if (dynamics) Object.assign(note, dynamics);
      acc.push(note);
    }

    /* 解析编曲片段库 musica_N_* 供音符级「编曲修饰」展开 */
    var patterns = [], patByName = Object.create(null);
    try {
      var arr = j['编曲'] || {};
      var cnt = num(arr['musica_array_length'], 0);
      for (var mi = 0; mi < cnt; mi++) {
        var pref = 'musica_' + mi + '_';
        var ln = num(arr[pref + 'user_define_music_sheet_length'], 0);
        var insts = [];
        for (var ii = 0; ii < 8; ii++) {
          if (arr[pref + 'user_define_instrument_' + ii] !== undefined) insts.push(String(arr[pref + 'user_define_instrument_' + ii]));
        }
        var ns = [];
        for (var si = 0; si < ln; si++) {
          var sp = pref + 'user_define_music_sheet_' + si + '_';
          ns.push({
            instrument: num(arr[sp + 'instrument_index'], 0),
            pitch: num(arr[sp + 'pitch'], 60),
            start: num(arr[sp + 'start'], 0),
            dur: num(arr[sp + 'duration'], 0.5),
            strength: num(arr[sp + 'strength'], 1)
          });
        }
        var patObj = {
          name: arr[pref + 'name'] || ('片段' + (mi + 1)),
          type: arr[pref + 'type'] || '',
          sheetType: arr[pref + 'music_sheet_type'] || 'user_edit',
          align: arr[pref + 'align'] || 'right',
          alignPoint: num(arr[pref + 'user_define_align_point'], 0),
          vol: num(arr[pref + 'user_define_volume'], 1),
          echo: num(arr[pref + 'echo_volume'], 1),
          echoInst: arr[pref + 'echo_instrument'] !== undefined ? String(arr[pref + 'echo_instrument']) : '0',
          instruments: insts,
          notes: ns
        };
        patterns.push(patObj);
        if (patObj.name) patByName[patObj.name] = patObj;
      }
    } catch (e) { patterns = []; }

    /* 收集打节拍配置（内置默认配置 + 工程 j['打节拍']） */
    var beatPresets = Object.create(null);
    beatPresets[DSC_BUILTIN_BEAT['名称']] = DSC_BUILTIN_BEAT;
    beatPresets['\u4e01\u9999'] = DSC_BUILTIN_BEAT;
    var beatArr = (j['打节拍'] && Array.isArray(j['打节拍']['打节拍'])) ? j['打节拍']['打节拍'] : (Array.isArray(j['打节拍']) ? j['打节拍'] : []);
    beatArr.forEach(function (bp) {
      if (!bp || !bp['名称']) return;
      if (Array.isArray(bp['音符数组'])) beatPresets[bp['名称']] = bp;
      else if (bp['风格'] === 'clove4') {
        // Old projects save a style identifier, not expanded notes.
        // Use the broken 12-string guitar arpeggio approximation instead of the block-chord 2026 preset.
        beatPresets[bp['名称']] = Object.assign({}, DSC_CLOVE4_BEAT, { '名称': bp['名称'] });
        if (importWarnings.indexOf('旧版 clove4 按分解十二弦吉他模板近似导入，旧版完整算法尚未公开') < 0)
          importWarnings.push('旧版 clove4 按分解十二弦吉他模板近似导入，旧版完整算法尚未公开');
      } else importWarnings.push('未支持的旧版节拍：' + bp['名称']);
    });
    var customMelInst = j['打节拍'] && typeof j['打节拍']['旋律乐器'] === 'string' ? j['打节拍']['旋律乐器'] : '';
    var customDrumInst = j['打节拍'] && typeof j['打节拍']['鼓乐器'] === 'string' ? j['打节拍']['鼓乐器'] : '';
    function beatInstInfo(name) {
      if (name === '默认乐器_鼓' && customDrumInst) return dscInst(customDrumInst, name);
      if ((name === '默认乐器_吉他' || name === '默认乐器_钢琴') && customMelInst) return dscInst(customMelInst, name);
      return dscInst(name, name);
    }
    function beatFilter(note, pitch) {
      var curve = note['滤波'];
      if (!curve || !curve['控制点数组'] || !curve['控制点数组'].length) return null;
      var follow = !!note['滤波单位是基频倍数不是绝对频率'];
      var baseHz = 440 * Math.pow(2, (pitch - 69) / 12), eq = [];
      for (var i = 0; i < 64; i++) {
        var x = 50 * Math.pow(400, i / 63) / (follow ? baseHz : 1);
        // DSC holds its last filter value past the authored frequency range.
        x = Math.min(x, num(curve['最大值x'], follow ? 50 : 8000));
        eq.push(clamp(20 * Math.log10(dscFilterGain(dscCtrlCurveVal(curve, x))), -60, 30));
      }
      var result = { noteEq: eq };
      if (follow) result.noteEqRoot = pitch;
      return result;
    }

    /* 检查是否包含音符：若全工程只有纯音乐行，则兜底作为主轨音符 */
    var anyRowsWithNotes = rows.filter(function (row) { return (row['音符'] || []).length > 0; });
    var realVocalRows = anyRowsWithNotes.filter(function (row) { return !row['纯音乐']; });
    var treatAllAsVocal = !realVocalRows.length;
    if (!anyRowsWithNotes.length) throw new Error('DSC 里没有音符');

    var firstVocalRow = realVocalRows[0] || anyRowsWithNotes[0];
    var rowLang = importLang(firstVocalRow['语种']);
    tempo = num(firstVocalRow['每分钟拍数'], 120);
    root = ((num(firstVocalRow['调号'], 60) % 12) + 12) % 12 + 60;

    var roleSet = Object.create(null);
    var hasVocalFollow = false;
    (treatAllAsVocal ? anyRowsWithNotes : realVocalRows).forEach(function (r) {
      var roleName = String(toArr(r['角色'])[0] || '').trim();
      if (roleName) roleSet[roleName] = true;
      if (r['跟随上一行一起播放']) hasVocalFollow = true;
    });
    var splitVocalTracks = Object.keys(roleSet).length > 1 || hasVocalFollow;

    var tempoSegs = [{ beat: 0, bpm: Math.round(tempo * 1000) / 1000 }];
    var specs = j['音色'] || [];
    function findSpecForRole(roleName) {
      if (!specs.length) return null;
      if (roleName) {
        for (var i = 0; i < specs.length; i++) {
          if (specs[i] && specs[i]['名称'] === roleName) return specs[i];
        }
      }
      return specs[0];
    }

    var vocalFollowLayer = 0;
    var beatCursor = 0, prevBeatKey = '';
    var vocalBuckets = Object.create(null), vocalBucketOrder = [];
    var totalVocalRowCount = 0;

    /* 预计算每个自然段起始与长度（用于周期音高循环方式 = '自然段'） */
    var rowDurs = rows.map(function (r) {
      var d = 0, s = r['音符'] || [];
      for (var i = 0; i < s.length; i++) d += num(s[i]['时长'], 1);
      return d;
    });
    // Build the entire tempo map first. Follow rows keep their own seconds even
    // when they outlast the anchor and cross a later tempo change.
    var cursor = 0, cursorSeconds = 0, anchorSeconds = 0;
    tempo = Math.max(1, num(rows[0] && rows[0]['每分钟拍数'], tempo));
    tempoSegs = [{ beat: 0, bpm: tempo }];
    var rowPlan = rows.map(function (row, i) {
      var bpm = num(row['每分钟拍数'], tempo); if (!(bpm > 0)) bpm = tempo;
      var follow = i > 0 && !!row['跟随上一行一起播放'];
      var seconds = follow ? anchorSeconds : cursorSeconds;
      if (!follow) {
        var last = tempoSegs[tempoSegs.length - 1];
        if (Math.abs(last.bpm - bpm) > 1e-6) {
          if (Math.abs(last.beat - cursor) < 1e-9) last.bpm = bpm;
          else tempoSegs.push({ beat: cursor, bpm: bpm });
        }
        anchorSeconds = seconds;
        cursor += rowDurs[i]; cursorSeconds += rowDurs[i] * 60 / bpm;
      }
      return { seconds: seconds, bpm: bpm, follow: follow };
    });
    var rowTimeMap = NSG.TEMPO.map({ tempos: tempoSegs });
    function sectionDurAt(rowIdx) {
      var sum = 0, secStart = 0;
      for (var k = rowIdx; k >= 0; k--) {
        if (k !== rowIdx && rows[k]['跟随上一行一起播放']) continue;
        if (dscSectionStart(rows[k]) || k === 0) { secStart = k; break; }
      }
      for (var m = secStart; m < rows.length; m++) {
        if (rows[m]['跟随上一行一起播放']) continue;
        if (m > secStart && dscSectionStart(rows[m])) break;
        sum += rowDurs[m];
      }
      return Math.max(0.5, sum);
    }

    rows.forEach(function (row, ri) {
      var hasNotes = (row['音符'] || []).length > 0;
      var isPure = !!row['纯音乐'] && !treatAllAsVocal;
      var isSpeech = !isPure && !!(row['说唱'] || row['纯朗读']);
      var plan = rowPlan[ri], isFollow = plan.follow, rowBpm = plan.bpm;
      var rowKeyMidi = num(row['调号'], 60);
      function rowBeat(local) { return rowTimeMap.beatOf(plan.seconds + local * 60 / rowBpm); }
      function rowSpan(local, dur) { return rowBeat(local + dur) - rowBeat(local); }
      function rowPoints(points, local, dur) {
        var base = rowBeat(local), span = Math.max(1e-9, rowSpan(local, dur));
        return points.map(function (p) { return [(rowBeat(local + p[0] * dur) - base) / span, p[1], p[2]]; });
      }
      if (!isFollow) vocalFollowLayer = 0;

      if (!hasNotes) {
        prevBeatKey = '';
        beatCursor = 0;
        return;
      }

      var roleName = String(toArr(row['角色'])[0] || '').trim();
      var speechBasePitch = isSpeech ? dscSpokenMidi(findSpecForRole(roleName)) : null;
      if (isSpeech) {
        var speechWarn = '说唱/纯朗读行已按说话基准音高展平旋律（保留 frequency/trill/吐字降低率 PIT 曲线；DSC 引擎内置语音微调未写入工程文件）';
        if (importWarnings.indexOf(speechWarn) < 0) importWarnings.push(speechWarn);
      }
      var seq = buildRowNotes(row, !isPure, speechBasePitch);
      var rowLocalDur = 0;
      seq.forEach(function (n) { rowLocalDur = Math.max(rowLocalDur, n.start + n.rawDur); });

      var switches = toArr(row['技巧']).filter(function (s) { return /^timbre_switch_[1-4]$/.test(dscSkillType(s)); });
      function slotUsed(slot) { return slot === 0 || switches.some(function (s) { return dscSkillType(s) === 'timbre_switch_' + slot && num(s['峰值'], 0) > 0; }); }

      if (!isPure) {
        totalVocalRowCount++;
        if (isFollow) vocalFollowLayer++;
        var layer = isFollow ? vocalFollowLayer : 0;
        var roles = rowSlots(row, '角色');
        if (!roles.length) roles = [''];
        roles.forEach(function (role, slot) {
          if (!slotUsed(slot) || (slot > 0 && !role)) return;
          var bKey = String(role || '') + '\0' + layer + '\0slot' + slot;
          if (!vocalBuckets[bKey]) {
            var dispName = splitVocalTracks || slot > 0
              ? ((role || '人声') + (layer > 0 ? (' 和声' + layer) : '') + (slot > 0 ? (' 切换' + slot) : '')) : null;
            vocalBuckets[bKey] = { name: dispName, role: role, vocalRowCount: 0, notes: [] };
            vocalBucketOrder.push(bKey);
          }
          var bucket = vocalBuckets[bKey];
          bucket.vocalRowCount++;
          seq.forEach(function (n) {
            var src = { row: ri, slot: slot, localStart: n.start };
            if (isSpeech) src.speech = true;
            var c = {
              start: rowBeat(n.start), dur: Math.max(0.0001, rowSpan(n.start, n.dur)),
              pitch: n.pitch, vel: 96, vib: 0, lyric: n.lyric, rest: n.rest,
              dscSource: src
            };
            Object.assign(c, rowDynamics(row, slot, n.start, n.dur, rowBeat));
            if (n.slur) c.slur = true;
            if (n.pb) c.pb = rowPoints(n.pb, n.start, n.dur);
            bucket.notes.push(c);
          });
        });
      } else {
        /* Slot indices are significant: empty slots must not shift later switches. */
        var rawSlots = rowSlots(row, '乐器');
        if (!rawSlots[0]) rawSlots[0] = roleName || '钢琴';
        rawSlots.forEach(function (slotStr, slot) {
          if (!slotStr || !slotUsed(slot)) return;
          var info = dscInst(slotStr, roleName);
          seq.forEach(function (n) {
            if (n.rest) return;
            var dynamics = rowDynamics(row, slot, n.start, n.dur, rowBeat);
            dynamics.dscSource = { row: ri, slot: slot, localStart: n.start, instrument: String(slotStr) };
            pushAcc(rowBeat(n.start), rowSpan(n.start, n.dur), n.pitch, 96, info, dynamics);
          });
        });
      }

      /* 音符级「编曲修饰」展开（j['编曲'] musica_N_*） */
      var rowDecorVol = clamp(num(row['编曲修饰音量'], 0.42), 0, 2);
      seq.forEach(function (n, ni) {
        if (!n.decor || !n.decor.length || n.rest) return;
        n.decor.forEach(function (dName) {
          var pat = patByName[dName];
          if (!pat) return;
          var style = String(pat.sheetType || 'user_edit')
            .replace(/echo_count_/g, 'count_')
            .replace(/long_duration_count_/g, 'count_');
          if (style === 'musica_before_climax_auto_generate') style = 'climax_auto_generate';
          if (style !== 'user_edit') {
            var gen = [];
            if (style === 'climax_auto_generate') {
              var nextP = (ni + 1 < seq.length) ? seq[ni + 1].pitch : (n.pitch + clamp(Math.round(n.rawDur / 0.5), 6, 10) - 1);
              var mCnt = clamp(Math.round(n.rawDur / 0.5), 6, 10);
              for (var gk = 0; gk < mCnt; gk++) {
                gen.push({ pitch: Math.floor(n.pitch + (nextP - n.pitch) * gk / (mCnt - 1)), dur: n.rawDur / (mCnt + 1) });
              }
            } else {
              var backCnt = style === 'count_2' ? 2 : style === 'count_3' ? 3 : style === 'count_4' ? 4 : style === 'count_half_quarter' ? Math.ceil(n.rawDur / 0.5) : 0;
              if (style === 'count_last_beat') {
                backCnt = 1;
                var hasStress = seq.some(function (q) { return q.stress; });
                for (var bi = ni - 1; bi >= 0; bi--) {
                  if (hasStress ? seq[bi].stress : (seq[bi].rawDur > seq[bi + 1].rawDur)) break;
                  backCnt++;
                }
              }
              backCnt = clamp(backCnt, 2, ni + 1);
              if (backCnt >= 2 && ni + 1 >= 2) {
                var sumD = 0;
                for (var ki = 0; ki < backCnt; ki++) {
                  var srcN = seq[ni - (backCnt - 1) + ki];
                  var gDur = ki === backCnt - 1 ? (sumD / backCnt) : srcN.rawDur;
                  sumD += gDur;
                  gen.push({ pitch: srcN.pitch + 24, dur: gDur });
                }
                if (sumD > 0) {
                  var targetD = n.rawDur * backCnt / (backCnt + 1);
                  var dMul = targetD / sumD;
                  gen.forEach(function (g) { g.dur *= dMul; });
                }
              }
            }
            if (gen.length) {
              var gSpan = gen.reduce(function (s, g) { return s + g.dur; }, 0);
              var gBase = pat.align === 'left' ? n.start : (n.start + n.rawDur - gSpan);
              var gCur = 0;
              var autoInst = dscInst(pat.echoInst, pat.name);
              var autoVel = 96 * pat.echo * rowDecorVol;
              gen.forEach(function (g) {
                pushAcc(rowBeat(gBase + gCur), rowSpan(gBase + gCur, g.dur), g.pitch + rowKeyMidi - 60, autoVel, autoInst);
                gCur += g.dur;
              });
              return;
            }
          }
          if (!pat.notes.length) return;
          var uBase = (pat.align === 'left' ? n.start : (n.start + n.rawDur)) - pat.alignPoint;
          pat.notes.forEach(function (cn) {
            var instStr = pat.instruments[cn.instrument] !== undefined ? pat.instruments[cn.instrument] : (pat.instruments[0] || '0');
            var info = dscInst(instStr, pat.name);
            var v = 96 * cn.strength * pat.vol * rowDecorVol;
            pushAcc(rowBeat(uBase + cn.start), rowSpan(uBase + cn.start, cn.dur), cn.pitch, v, info);
          });
        });
      });

      /* 兼容旧式/简化 JSON 直接挂在 row 上的 编曲修饰 / 打节拍旋律 / 打节拍鼓 */
      function pushInlineAcc(list, fallbackInst) {
        (Array.isArray(list) ? list : []).forEach(function (it) {
          if (!it || typeof it !== 'object') return;
          var st = num(it['开始'], num(it['开始时间'], 0));
          var du = num(it['持续'], num(it['持续时间'], 1));
          var pi = num(it['音高'], 60);
          var rawL = num(it['力度'], 0.6);
          var ve = rawL * (rawL <= 1 ? 127 : 1);
          var nm = it['乐器名称'] || it['乐器'] || '';
          pushAcc(rowBeat(st), rowSpan(st, du), pi, ve, nm ? dscInst(nm, nm) : { inst: fallbackInst, drumPitch: null });
        });
      }
      pushInlineAcc(row['编曲修饰'], 'pad');
      pushInlineAcc(row['打节拍旋律'], 'ep');
      pushInlineAcc(row['打节拍鼓'], 'drumkit');

      /* 打节拍（非跟随行且选定了打节拍配置时按节拍相位连续展开） */
      if (!isFollow) {
        var beatName = dscBeatName(row);
        var preset = beatName ? beatPresets[beatName] : null;
        if (!preset || rowLocalDur <= 0) {
          prevBeatKey = '';
          beatCursor = 0;
        } else {
          var beatKey = beatName + '|' + (isPure ? '1' : '0');
          var joinMode = String(row['打节拍衔接'] || '自动');
          var restart = !prevBeatKey || joinMode === '重新开始' || (joinMode !== '继续上一行' && (beatKey !== prevBeatKey || dscSectionStart(row)));
          if (restart) beatCursor = 0;
          prevBeatKey = beatKey;

          var bStart = beatCursor, bEnd = beatCursor + rowLocalDur;
          beatCursor = bEnd;

          var bMelVol = clamp(num(row['打节拍旋律音量'], 0.5), 0, 2);
          var bDrumVol = clamp(num(row['打节拍鼓音量'], 0.5), 0, 2);
          var startLen = Math.max(0, num(preset['开始长度'], 0));
          var cycleLen = Math.max(0.25, num(preset['周期长度'], 2));

          var nextRi = -1;
          for (var nri = ri + 1; nri < rows.length; nri++) {
            if (!rows[nri]['跟随上一行一起播放']) { nextRi = nri; break; }
          }
          var clipAtRowEnd = false;
          if (nextRi >= 0) {
            var nextRow = rows[nextRi];
            var nextHasNotes = (nextRow['音符'] || []).length > 0;
            var nextBeatName = dscBeatName(nextRow);
            var nextBeatKey = nextBeatName + '|' + ((!!nextRow['纯音乐'] && !treatAllAsVocal) ? '1' : '0');
            var nextJoin = String(nextRow['打节拍衔接'] || '自动');
            var nextContinues = nextHasNotes && !!(nextBeatName && beatPresets[nextBeatName]) && nextJoin !== '重新开始' &&
              (nextJoin === '继续上一行' || (nextBeatKey === beatKey && !dscSectionStart(nextRow)));
            clipAtRowEnd = !nextContinues;
          }

          function emitBeatNote(bn, tRel, rawDur, pitch) {
            var dur = clipAtRowEnd ? Math.min(rawDur, rowLocalDur - tRel) : rawDur;
            if (dur <= 1e-4) return;
            var info = beatInstInfo(bn['乐器名称']);
            var vol = (info.inst === 'drumkit' ? bDrumVol : bMelVol) * clamp(num(bn['力度'], 1), 0, 2) * 96;
            var flt = beatFilter(bn, pitch), amp = rowDynamics(row, null, tRel, dur, rowBeat);
            var dyn = flt && amp ? Object.assign({}, flt, amp) : (flt || amp);
            pushAcc(rowBeat(tRel), rowSpan(tRel, dur), pitch, vol, info, dyn);
          }

          if (Array.isArray(preset['开始'])) {
            preset['开始'].forEach(function (bn) {
              var tRel = num(bn['开始时间'], 0) - bStart;
              var dDur = Math.max(0.0625, num(bn['持续时间'], 0.5));
              if (tRel >= 0 && tRel < rowLocalDur - 1e-4) emitBeatNote(bn, tRel, dDur, num(bn['音高'], 60));
            });
          }

          var cStart = Math.max(Math.floor((bStart - startLen) / cycleLen + 1e-6), 0);
          var cEnd = (bEnd - startLen) / cycleLen;
          var cycCurve = preset['周期音高'];
          var cycMode = String(preset['周期音高循环方式'] || 'n个周期');
          var nCycleMod = Math.max(1, Math.round(num(preset['周期音高循环周期数'], 1)));
          var patNotes = Array.isArray(preset['音符数组']) ? preset['音符数组'] : [];

          for (var ci = cStart; ci < cEnd - 1e-6; ci++) {
            var cycOrigin = startLen + ci * cycleLen;
            var cycleSemi = 0;
            if (preset._clove4FollowKey) {
              cycleSemi = rowKeyMidi - 60;
              while (41 + cycleSemi < 40) cycleSemi += 12;
              while (48 + cycleSemi > 64) cycleSemi -= 12;
            }
            if (cycCurve && cycCurve['控制点数组'] && cycCurve['控制点数组'].length) {
              var modCount = nCycleMod;
              if (cycMode === '句子') modCount = Math.round((rowLocalDur - (restart ? startLen : 0)) / cycleLen);
              else if (cycMode === '自然段') modCount = Math.round((sectionDurAt(ri) - startLen) / cycleLen);
              if (modCount > 1) {
                var cu = ((ci % modCount) + 0.5) / modCount;
                var rawVal = dscCtrlCurveVal(cycCurve, cu);
                var minY = num(cycCurve['最小值y'], -24), maxY = num(cycCurve['最大值y'], 24);
                cycleSemi = Math.round(minY + (maxY - minY) * (rawVal + 1) * 0.5);
              }
            }
            for (var pni = 0; pni < patNotes.length; pni++) {
              var pn = patNotes[pni];
              var pRel = (cycOrigin - bStart) + num(pn['开始时间'], 0);
              if (pRel < -1e-4 || pRel >= rowLocalDur - 1e-4) continue;
              var info2 = beatInstInfo(pn['乐器名称']);
              var pDur = Math.max(0.0625, num(pn['持续时间'], 0.5));
              var pPitch = info2.inst === 'drumkit' ? num(pn['音高'], 36) : (num(pn['音高'], 60) + cycleSemi);
              emitBeatNote(pn, Math.max(0, pRel), pDur, pPitch);
            }
          }
        }
      }
    });

    acc.sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });

    var tempoWarn = '';
    var tempos = {};
    anyRowsWithNotes.forEach(function (row) { var v = num(row['每分钟拍数'], tempo); tempos[v] = (tempos[v] || 0) + 1; });
    var tkeys = Object.keys(tempos);
    if (tkeys.length > 1) {
      tempoWarn = '各行速度不同（' + tkeys.join('/') + '），已按时间轴/分段速度映射';
    }

    var vocalTracks = vocalBucketOrder.map(function (key) {
      var b = vocalBuckets[key];
      var trSpec = findSpecForRole(b.role);
      return {
        name: b.name || ('人声（' + b.vocalRowCount + ' 行）'),
        notes: b.notes,
        vocalRowCount: b.vocalRowCount,
        timbre: trSpec ? IO.dscTimbre(trSpec) : null
      };
    });
    if (!vocalTracks.length) throw new Error('DSC 里没有音符');

    var mainTrack = vocalTracks[0];
    var timbre = mainTrack.timbre;
    var importTracks = vocalTracks.concat(acc.length ? [{ name: '伴奏', notes: acc, vocalRowCount: 0 }] : []);

    return {
      format: 'DSC', title: title, tempo: Math.round(tempo * 100) / 100,
      tempos: tempoSegs,
      lang: langMap[firstVocalRow['语种']] || (/^(fi|eo|hak|nan-x-teochew|zh-x-sichuan|xdi8|tlh)$/.test(rowLang) ? rowLang : 'zh'),
      root: root, notes: mainTrack.notes,
      acc: acc.length ? acc : null,
      importTracks: importTracks,
      timbre: timbre,
      patterns: patterns,
      eye: (j['谱曲'] && j['谱曲']['眼睛']) || null,
      beatPreset: dscBeatName(firstVocalRow),
      rowCount: rows.length, vocalRowCount: mainTrack.vocalRowCount || totalVocalRowCount,
      warn: [tempoWarn].concat(importWarnings).filter(Boolean).join('；')
    };
  };

  /* DSC 音色 → NSG 音色：身高、共振峰宽度、高阶共振峰位置、第一/二倍频振幅、
     保持低倍频、振幅/频率微扰，以及 48 段固定频率滤波轮廓（outEq）。 */
  IO.dscTimbre = function (spec) {
    var out = NSG.defaultTimbre ? NSG.defaultTimbre() : {};
    if (!spec) return null;
    out.name = spec['名称'] || 'DSC 音色';
    out.gen = 0;
    out.height = Math.round(clamp(num(spec['身高'], 160), 110, 210));
    if (typeof spec['共振峰宽度'] === 'number') {
      /* DSC 的基准是 2.4，本引擎基准是 1.0 */
      out.bwScale = Math.round(clamp(spec['共振峰宽度'] / 2.4, 0.35, 2.2) * 100) / 100;
    }
    if (typeof spec['高阶共振峰频谱位置'] === 'number') {
      var rawWarp = spec['高阶共振峰频谱位置'];
      out.warp = Math.round(clamp(rawWarp, -0.35, 0.35) * 100) / 100;
      if (rawWarp < -0.35) {
        out.hiShift = Math.round(clamp(1 + (rawWarp + 0.35) * 0.25, 0.7, 1) * 100) / 100;
      }
    }
    var h1Raw = spec['第一倍频振幅'] !== undefined ? spec['第一倍频振幅'] : spec['一倍频振幅'];
    var h1 = num(h1Raw, 1);
    var h2 = num(spec['第二倍频振幅'], 0.35);
    var h = NSG.defaultHarm();
    /* 第二倍频相对第一倍频的 dB，再按 −12dB/oct 往上续；
       注意 k 是 0 基的数组下标，对应第 k+1 阶 */
    var h2db = clamp(20 * Math.log10(Math.max(1e-4, h1 > 0 ? h2 / h1 : 0.35)), -24, 9);
    h[0] = 0;
    for (var k = 1; k < 16; k++) {
      h[k] = Math.round((h2db - 12 * Math.log2((k + 1) / 2)) * 10) / 10;
    }
    out.harm = h;
    /* 音色.频率变化 / 振幅变化 → 基频微扰与气声质感 */
    try {
      var fc = spec['音色']['频率变化']['控制点数组'];
      if (fc && fc.length) {
        var amp = Math.max(Math.abs(num(fc[0]['m最小值'], 0)), Math.abs(num(fc[0]['m最大值'], 0)));
        out.jitter = Math.round(clamp(amp / 30, 0, 0.02) * 1000) / 1000;
      }
      var ac = spec['音色']['振幅变化']['控制点数组'];
      if (ac && ac.length) {
        var av = Math.abs(num(ac[0]['m值'], 0));
        if (av > 0) out.breath = Math.round(clamp(0.02 + av * 0.12, 0.02, 0.35) * 1000) / 1000;
      }
    } catch (e) { }
    var keepLow = spec['保留低倍频'] !== undefined ? spec['保留低倍频'] : spec['保留一倍频'];
    if (keepLow) out.glottal = 0.35;
    try {
      var filt = spec['滤波'];
      if (filt && filt['控制点数组'] && filt['控制点数组'].length && !spec['滤波跟随频率'] && NSG.OUT_EQ && NSG.outEqHz) {
        var eq = [], maxEqAbs = 0;
        for (var ei = 0; ei < NSG.OUT_EQ.n; ei++) {
          var hz = NSG.outEqHz(ei);
          var fy = dscCtrlCurveVal(filt, hz);
          var db = clamp(20 * Math.log10(Math.max(1e-3, dscFilterGain(fy))), NSG.OUT_EQ.min, NSG.OUT_EQ.max);
          db = Math.round(db * 100) / 100;
          if (Math.abs(db) > maxEqAbs) maxEqAbs = Math.abs(db);
          eq.push(db);
        }
        if (maxEqAbs >= 0.05) out.outEq = eq;
      }
    } catch (e2) { }
    delete out.preset;
    out.dsc = spec['名称'] || 'DSC 音色';
    return out;
  };

  /* ---------------- ufdata（UtaFormatix data v1） ----------------
     分辨率固定 480。音符 tickOn/tickOff/key/lyric，
     音高曲线 pitch:{ticks, values, isAbsolute}（values 是半音偏移）。 */
  IO.readUfdata = function (text) {
    var j = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    var pj = j.project || j;
    var tempos = pj.tempos || [];
    var bpm = tempos.length ? num(tempos[0].bpm, 120) : 120;
    var tracks = pj.tracks || [];
    var RES = 480;
    /* 速度表：tickPosition → 拍。UtaFormatix 的工程本来就带分段速度 */
    var tempoList = [];
    tempos.slice().sort(function (a, b) { return num(a.tickPosition, 0) - num(b.tickPosition, 0); })
      .forEach(function (tp) {
        var v = num(tp.bpm, 120), beat = num(tp.tickPosition, 0) / RES;
        var last = tempoList[tempoList.length - 1];
        if (last && Math.abs(last.beat - beat) < 0.01) { last.bpm = Math.round(v * 100) / 100; return; }
        if (last && Math.abs(last.bpm - v) < 0.01) return;
        tempoList.push({ beat: Math.round(beat * 1000) / 1000, bpm: Math.round(v * 100) / 100 });
      });
    if (tempoList.length) bpm = tempoList[0].bpm;
    function trackNotes(tr) {
      var list = (tr.notes || []).map(function (n) {
        var st = num(n.tickOn, 0) / RES, en = num(n.tickOff, 0) / RES;
        var nUf = {
          start: st, dur: Math.max(1 / RES, en - st),
          pitch: Math.round(num(n.key, 60)), vel: 96
        };
        setLyric(nUf, n.lyric);
        return nUf;
      }).sort(function (a, b) { return a.start - b.start; });
      /* pitch 曲线按音符切成 pb（相对音分） */
      var pb = tr.pitch;
      if (pb && Array.isArray(pb.ticks) && Array.isArray(pb.values) && pb.ticks.length) {
        var abs = !!pb.isAbsolute, ticks = pb.ticks, vals = pb.values, tLen = ticks.length;
        var isSorted = Number.isFinite(ticks[0]);
        if (isSorted) {
          for (var si = 1; si < tLen; si++) {
            if (!Number.isFinite(ticks[si]) || ticks[si] < ticks[si - 1]) { isSorted = false; break; }
          }
        }
        list.forEach(function (n, noteIndex) {
          n.vib = 0;
          var t0 = Math.round(n.start * RES), t1 = Math.round((n.start + n.dur) * RES);
          var next = list[noteIndex + 1], sharedEnd = next && Math.round(next.start * RES) === t1;
          var pts = [];
          var startIdx = 0;
          if (isSorted) {
            var lo = 0, hi = tLen;
            while (lo < hi) {
              var mid = (lo + hi) >> 1;
              if (ticks[mid] < t0) lo = mid + 1;
              else hi = mid;
            }
            startIdx = lo;
          }
          for (var i = startIdx; i < tLen; i++) {
            var tk = ticks[i];
            if (isSorted && tk > t1) break;
            // Relative offsets belong to the note active at the sample's tick.
            // The old ±1 tick window clamped the next note's offset onto this
            // note's tail (and the previous note's offset onto the onset).
            if (!Number.isFinite(tk) || tk < t0 || tk > t1 || (sharedEnd && tk === t1 && !abs)) continue;
            var v = vals[i];
            if (v !== null && !Number.isFinite(v)) continue;
            var cents = v === null ? 0 : abs ? (v - n.pitch) * 100 : v * 100;
            pts.push([clamp((tk - t0) / Math.max(1, t1 - t0), 0, 1), cents]);
          }
          if (pts.length === 1) pts = [[0, pts[0][1]], [1, pts[0][1]]];
          if (pts.length) n.pb = pts;
        });
      }
      return list;
    }
    if (!tracks.length) throw new Error('ufdata 里没有轨道');
    var candidates = tracks.map(function (tr) { return { name: tr.name, notes: trackNotes(tr) }; });
    if (!candidates.some(function (tr) { return tr.notes.length; })) throw new Error('ufdata 里没有音符');
    return withImportTracks({
      format: 'Ufdata', title: (pj.name || 'Ufdata 工程'), tempo: Math.round(bpm * 100) / 100,
      tempos: tempoList
    }, candidates);
  };

  IO.writeUfdata = function (score, opt) {
    opt = opt || {};
    var RES = 480;
    function ticks(beat) { return Math.round(beat * RES); }
    function trackOut(tr) {
      var notes = (tr.notes || []).slice().sort(function (a, b) { return a.start - b.start; });
      var out = [], pit = { ticks: [], values: [], isAbsolute: false };
      notes.forEach(function (n) {
        var on = ticks(n.start), off = ticks(n.start + n.dur);
        out.push({
          key: Math.round(n.pitch), tickOn: on, tickOff: Math.max(on + 1, off),
          /* 延音符写回 '-'：UtaFormatix 与 VOCALOID 系都认这个写法 */
          lyric: IO.exportLyric(n)
        });
        if (n.pb && n.pb.length) {
          n.pb.forEach(function (p) {
            pit.ticks.push(on + Math.round((off - on) * clamp(p[0], 0, 1)));
            pit.values.push(Math.round(p[1]) / 100);
          });
        }
      });
      var t = { name: tr.name || 'Track', notes: out };
      // Bake the shared junction/vibrato model so interchange exports keep audible tuning.
      if (tr.type === 'vocal' && NSG.TUNING && NSG.TEMPO) {
        if (NSG.phonemizeNotes) notes = NSG.phonemizeNotes(notes, score.lang, score.phonemizer);
        var tuning = NSG.TUNING, model = tuning.pitchModel(notes, tr.pit), tm = NSG.TEMPO.map(score);
        var samples = new Map(), chainStart = 0;
        notes.forEach(function (n, index) {
          if (!tuning.hasPitch(n)) return;
          if (!tuning.connected(notes[index - 1], n)) chainStart = tm.secOf(n.start);
          var duration = tm.secOf(n.start + n.dur) - tm.secOf(n.start);
          var vib = tuning.vibrato(n.vibrato), vibStart = tm.secOf(n.start + n.dur * (1 - vib.length / 100));
          var steps = Math.max(1, Math.ceil(n.dur * 96));
          for (var k = 0; k <= steps; k++) {
            var rel = k / steps, beat = n.start + n.dur * rel, seconds = tm.secOf(beat);
            var midi = model.midiAt(beat, n.pitch) + tuning.vibCents(n, rel, duration, opt.timbre, seconds - chainStart, seconds - vibStart) / 100;
            samples.set(ticks(beat), Math.round(midi * 10000) / 10000);
          }
        });
        pit = { ticks: [], values: [], isAbsolute: true };
        Array.from(samples.keys()).sort(function (a, b) { return a - b; }).forEach(function (tick) {
          pit.ticks.push(tick); pit.values.push(samples.get(tick));
        });
      }
      if (pit.ticks.length) t.pitch = pit;
      return t;
    }
    var tracks = [], accTr = null;
    (score.tracks || []).forEach(function (tr) {
      if (tr.type === 'vocal' && tr.notes && tr.notes.length) tracks.push(trackOut(tr));
      else if (tr.type === 'inst' && tr.notes && tr.notes.length && !accTr) accTr = tr;
    });
    if (accTr && accTr.notes.length && opt.withAcc !== false) tracks.push(trackOut(accTr));
    if (!tracks.length) throw new Error('没有可导出的音符');
    var obj = {
      formatVersion: 1,
      project: {
        name: opt.title || 'NSG 导出',
        tracks: tracks,
        timeSignatures: [{ measurePosition: 0, numerator: 4, denominator: 4 }],
        tempos: (function () {
          var tl = (score.tempos && score.tempos.length ? score.tempos : [{ beat: 0, bpm: score.tempo || 120 }]);
          return tl.slice().sort(function (a, b) { return a.beat - b.beat; }).map(function (t) {
            return {
              tickPosition: Math.max(0, Math.round(t.beat * RES)),
              bpm: Math.round((+t.bpm || 120) * 1e6) / 1e6
            };
          });
        })()
      }
    };
    return JSON.stringify(obj);
  };

  /* ---------------- MIDI 写入 ---------------- */
  // GM program bytes are zero-based (0..127). Acoustic instruments use their
  // GM counterparts; synthesized/chip voices use the closest GM sound family.
  var MIDI_INST = Object.create(null);
  Object.keys(NSG.Instruments.all).forEach(function (id) {
    var preset = NSG.Instruments.get(id); MIDI_INST[id] = [preset.program, preset.name];
  });
  var MIDI_DRUM = { kick: 36, snare: 38, rim: 37, clap: 39, hat: 42,
    openhat: 46, tom: 45, crash: 49, ride: 51, perc: 70 };
  IO.instToProgram = function (inst) { return (MIDI_INST[inst] || MIDI_INST.pad)[0]; };
  function midiDrumPitch(n) {
    var inst = n.inst, pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
    if (inst === 'drumkit') return pitch;
    if (inst === 'chipKick') inst = 'kick';
    else if (inst === 'chipTom') inst = 'tom';
    else if (inst === 'chipNoise') inst = n.chipDrum || 'snare';
    if (MIDI_DRUM[inst] === undefined) return null;
    // Keep GM tom/cymbal variants when the note already selects that drum.
    if (DRUM_MAP[pitch] === inst || (inst === 'perc' && (pitch === 54 || pitch === 55 || pitch === 56 || pitch === 69 || pitch === 70 || pitch === 81 || pitch === 84))) return pitch;
    return MIDI_DRUM[inst];
  }
  IO.drumPitch = midiDrumPitch;
  function vlq(n) {
    var out = [n & 0x7f];
    n >>= 7;
    while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
    return out;
  }
  var _utf8Enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function txtMeta(type, str) {
    var bytes;
    if (_utf8Enc) {
      bytes = Array.from(_utf8Enc.encode(str));
    } else {
      bytes = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.codePointAt(i);
        if (c > 0xffff) i++;
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return [0xff, type].concat(vlq(bytes.length), bytes);
  }
  function trackChunk(events) {
    var body = [];
    for (var i = 0; i < events.length; i++) {
      var delta = vlq(events[i][0]), data = events[i][1];
      for (var d = 0; d < delta.length; d++) body.push(delta[d]);
      for (var e = 0; e < data.length; e++) body.push(data[e]);
    }
    body.push(0x00, 0xff, 0x2f, 0x00);
    var n = body.length;
    var head = [0x4d, 0x54, 0x72, 0x6b, (n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    return head.concat(body);
  }

  IO.writeMIDI = function (score, opt) {
    opt = opt || {};
    var kind = opt.kind || 'all';
    if (['all', 'vocal', 'accompaniment'].indexOf(kind) < 0) throw new Error('未知的 MIDI 导出类型');
    var PPQ = 480;
    /* 分段速度：每个速度点一个 FF 51；同一 tick 只留最后一个 */
    var tl = (score.tempos && score.tempos.length ? score.tempos : [{ beat: 0, bpm: score.tempo || 120 }])
      .slice().sort(function (a, b) { return a.beat - b.beat; });
    var evTempo = [[0, txtMeta(0x03, 'NSG 主轨')],
      [0, [0xff, 0x58, 0x04, 4, 2, 24, 8]]];
    var lastTick = 0;
    var timeSegments = [{ beat: 0, sec: 0, bpm: 120 }];
    tl.forEach(function (seg) {
      var tick = Math.max(0, Math.round(seg.beat * PPQ));
      var bpm = Math.max(20, Math.min(400, +seg.bpm || 120));
      var us = Math.round(60000000 / bpm);
      evTempo.push([Math.max(0, tick - lastTick), [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]);
      lastTick = tick;
      var prev = timeSegments[timeSegments.length - 1], beat = tick / PPQ;
      if (beat === prev.beat) prev.bpm = 60000000 / us;
      else timeSegments.push({ beat: beat, sec: prev.sec + (beat - prev.beat) * 60 / prev.bpm, bpm: 60000000 / us });
    });
    function secOf(beat) {
      var seg = timeSegments[0];
      for (var i = 1; i < timeSegments.length && beat >= timeSegments[i].beat; i++) seg = timeSegments[i];
      return seg.sec + (beat - seg.beat) * 60 / seg.bpm;
    }
    function beatOf(sec) {
      var seg = timeSegments[0];
      for (var i = 1; i < timeSegments.length && sec >= timeSegments[i].sec; i++) seg = timeSegments[i];
      return seg.beat + (sec - seg.sec) * seg.bpm / 60;
    }

    var tracks = [trackChunk(evTempo)], parts = [], drumNotes = [];
    (score.tracks || []).forEach(function (trk) {
      var vocal = trk.type === 'vocal';
      if ((kind === 'vocal' && !vocal) || (kind === 'accompaniment' && vocal)) return;
      if (vocal) {
        var notes = trk.notes || [];
        if (kind === 'vocal' || notes.length) parts.push({ name: trk.name || '人声', vocal: true, program: 0,
          notes: notes.map(function (n) { return { note: n, pitch: n.pitch }; }) });
        return;
      }
      var groups = {};
      (trk.notes || []).forEach(function (n) {
        var drumPitch = midiDrumPitch(n);
        if (drumPitch !== null) { drumNotes.push({ note: n, pitch: drumPitch }); return; }
        var mapped = MIDI_INST[n.inst];
        var program = Number.isInteger(n.midiProgram) && n.midiProgram >= 0 && n.midiProgram <= 127 ? n.midiProgram :
          mapped ? mapped[0] : Number.isInteger(trk.program) && trk.program >= 0 && trk.program <= 127 ? trk.program : IO.instToProgram(n.inst);
        var bankMSB = Number.isInteger(n.midiBankMSB) ? clamp(n.midiBankMSB, 0, 127) : 0;
        var bankLSB = Number.isInteger(n.midiBankLSB) ? clamp(n.midiBankLSB, 0, 127) : 0;
        var groupKey = program + ':' + bankMSB + ':' + bankLSB + ':' + (n.midiPart || '');
        // Voices mapped to the same GM sound share one part, keeping all the
        // built-in chip colors within GM's fifteen melodic channels.
        if (!groups[groupKey]) {
          groups[groupKey] = { name: (trk.name || '伴奏') + ' · ' + (mapped && mapped[0] === program ? mapped[1] : 'GM ' + (program + 1)),
            program: program, bankMSB: bankMSB, bankLSB: bankLSB, notes: [] };
          parts.push(groups[groupKey]);
        }
        var tones = n.inst === 'chipArp' && Array.isArray(n.chipTones) ? n.chipTones.filter(Number.isFinite).slice(0, 4) : [];
        if (tones.length > 1) {
          // This fast chord cycle is the chip pad. Export its full 50-Hz
          // sequence, including across tempo changes, rather than just a root.
          var from = secOf(n.start), to = secOf(n.start + n.dur);
          for (var step = 0; from + step / 50 < to - 1e-9; step++) {
            groups[groupKey].notes.push({ note: n, pitch: tones[step % tones.length],
              start: beatOf(from + step / 50), end: beatOf(Math.min(to, from + (step + 1) / 50)) });
          }
        } else groups[groupKey].notes.push({ note: n, pitch: tones.length ? tones[0] : n.pitch });
      });
    });
    if (kind !== 'vocal' && parts.length > 15) throw new Error('乐器声部超过 GM 的 15 个旋律通道，请减少同时导出的声部');
    if (kind === 'vocal' && parts.length > 15 * 128) throw new Error('人声音层超过 MIDI 端口容量');
    if (drumNotes.length) parts.push({ name: '伴奏 · 鼓组', drums: true, notes: drumNotes });
    var melodicIndex = 0;
    parts.forEach(function (part) {
      var evs = [];
      evs.push([0, txtMeta(0x03, part.name)]);
      var channel = 9;
      if (!part.drums) {
        var port = Math.floor(melodicIndex / 15);
        channel = melodicIndex++ % 15;
        if (channel >= 9) channel++;
        if (port) evs.push([0, [0xff, 0x21, 0x01, port]]);
        if (part.bankMSB || part.bankLSB) { evs.push([0, [0xb0 | channel, 0, part.bankMSB || 0]]); evs.push([0, [0xb0 | channel, 32, part.bankLSB || 0]]); }
        evs.push([0, [0xc0 | channel, part.program]]);
      }
      var abs = [];
      part.notes.forEach(function (entry) {
        var n = entry.note, start = Math.max(0, Math.round((entry.start === undefined ? n.start : entry.start) * PPQ));
        abs.push({ t: start, on: true, n: n, pitch: entry.pitch });
        abs.push({ t: Math.max(start + 1, Math.round((entry.end === undefined ? n.start + n.dur : entry.end) * PPQ)), on: false, n: n, pitch: entry.pitch });
      });
      abs.sort(function (a, b) { return a.t - b.t || Number(a.on) - Number(b.on); });
      var last = 0;
      abs.forEach(function (e) {
        var d = Math.max(0, e.t - last); last = e.t;
        var nn = Math.max(0, Math.min(127, Math.round(e.pitch)));
        var vel = Math.max(1, Math.min(127, Math.round(e.n.vel === undefined ? 96 : e.n.vel)));
        if (e.on) {
          evs.push([d, [0x90 | channel, nn, vel]]);
          var lyric = IO.exportLyric(e.n);
          if (part.vocal && lyric && lyric !== 'R') evs.push([0, txtMeta(0x05, lyric)]);
        } else {
          evs.push([d, [0x80 | channel, nn, 0x40]]);
        }
      });
      tracks.push(trackChunk(evs));
    });

    var header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1];
    var ntr = tracks.length;
    header.push((ntr >> 8) & 255, ntr & 255, (PPQ >> 8) & 255, PPQ & 255);
    var all = header;
    tracks.forEach(function (t) { all = all.concat(t); });
    return new Uint8Array(all).buffer;
  };

  /* ---------------- 工程文件 ---------------- */
  IO.saveProject = function (score, timbre, mix) {
    return JSON.stringify({
      format: 'NSG-SCORE',
      version: 2,
      saved: new Date().toISOString(),
      score: score,
      timbre: timbre,
      mix: mix || { volVox: 0.56, volAcc: 0.75 }
    }, null, 1);
  };
  IO.loadProject = function (text) {
    var j = JSON.parse(String(text).replace(/^\uFEFF/, ''));
    if (j.format !== 'NSG-SCORE') throw new Error('不是 NSG 工程文件');
    var tracks = j.score && Array.isArray(j.score.tracks) ? j.score.tracks : [];
    tracks.forEach(function (track) {
      if (!track || !Array.isArray(track.notes)) return;
      track.notes.forEach(function (note) {
        if (!note || note.effortPoints === undefined) return;
        var points = NSG.TUNING.effortPoints(note.effortPoints);
        if (points.length) note.effortPoints = points; else delete note.effortPoints;
      });
    });
    return j;
  };

  /* ---------------- 乱码歌词反查 ----------------
     旧版本若把 Shift-JIS 假名按 GBK 解过一次，存进 .nsg 的歌词就成了
     「偨」「偱」「偂」这类生僻字。它们全落在 GBK 扩展区（与 500 个
     最常用汉字零交集），可以由同一对字节反查回原来的假名：
       GBK 0x82 0xBD → 「偨」，Shift-JIS 0x82 0xBD → 「た」。
     不逐字盲改：只有整份工程没有假名、且多数歌词全由这些字组成时才整体修，
     中文歌词不会被动到。 */
  var MOJI_FROM = '丂丄丅丒丣並丷丼乀乁乂乆乊乑乕乣乲乴乹乺乻乼乽乿亀亁亂亃仹伂偀偁偂偄偅偆偉偊偋偍偐偑偒偓偔偖偗偘偙偛偝偞偟偠偡偢偣偤偦偧偨偩偪偫偭偮偯偰偱偲偳側偵偸偹偺偼偽傁傂傃傄傆傇傉傊傋傌傎傏傐傑傒傓傔傕傖傗傘備傚傛傜傝傞傟傠傡傢傤傦傪傫傽傾傿僀僁僂僃僄僅僆僇僈僉僊僋僌働僎僐僑僒僓僔僕僗僘僙僛僜僝僞僟僠僡僢僣僤僥僨僩僪僫僯僰僱僲僴僶僷僸價僺僼僽僾僿儀儁儂儃億儅儈儉儊儌儍儎儏儐儑儓儔儕儖儗儘儙儚儛儜儝儞償儠儢';
  var MOJI_TO = '　、。・゛゜ヽヾゝゞ〃々〆〇ー〜〔〕〈〉《》「」『』【】〒〓ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ';
  var KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff\uff61-\uff9f]/;
  IO.repairMojibake = function (s) {
    if (!s || typeof s !== 'string' || KANA_RE.test(s)) return s;
    var out = '', hit = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), k = MOJI_FROM.indexOf(ch);
      if (k >= 0) { out += MOJI_TO.charAt(k); hit++; }
      else if (s.charCodeAt(i) < 0x80) out += ch;
      else if (/[\u3000-\u303f\u30fc\uff5e]/.test(ch)) out += ch;  // 日文标点可穿过
      else return s;                       // 混进一个正常汉字就不改
    }
    return hit ? out : s;
  };
  function repairNotes(notes) {
    if (!notes || !notes.length) return 0;
    var cand = [], hasKana = false;
    notes.forEach(function (n) {
      var s = n && n.lyric;
      if (typeof s !== 'string' || !s || s === 'a' || s === '‿' || s === 'R') return;
      if (!/[^\x00-\x7f]/.test(s)) return;
      if (KANA_RE.test(s)) hasKana = true;
      cand.push(n);
    });
    if (hasKana || cand.length < 2) return 0;
    var hits = cand.filter(function (n) { return IO.repairMojibake(n.lyric) !== n.lyric; });
    if (hits.length < 2 || hits.length < cand.length * 0.6) return 0;
    cand.forEach(function (n) { n.lyric = IO.repairMojibake(n.lyric); });
    return hits.length;
  }
  IO.repairProjectLyrics = function (p) {
    if (!p || !p.score || !p.score.tracks) return 0;
    var n = 0;
    p.score.tracks.forEach(function (tr) { n += repairNotes(tr.notes); });
    return n;
  };

  /* 解析阶段保留原轨边界；界面确认后才提交其中一轨。 */
  function withImportTracks(res, tracks) {
    res.importTracks = tracks.map(function (tr, index) {
      tr.name = tr.name || ('轨道 ' + (index + 1));
      tr.notes.sort(function (a, b) { return a.start - b.start; });
      return tr;
    });
    var first = tracks.filter(function (tr) { return tr.notes.length; })[0];
    res.notes = first ? first.notes : [];
    if (first && first.lang) res.lang = first.lang;
    if (first && first.vol !== undefined) res.vol = first.vol;
    if (first && first.pan !== undefined) res.pan = first.pan;
    if (first && first.muted !== undefined) res.muted = first.muted;
    if (first && first.pit && first.pit.length) res.pit = first.pit;
    if (first && first.sampledPit) res.sampledPit = true;
    return res;
  }

  IO.selectImportTrack = function (res, index) {
    var tr = (res.importTracks || [])[index];
    if (!tr || !tr.notes.length) throw new Error('请选择有音符的轨道');
    var keepAcc = res.format === 'DSC' && tr.vocalRowCount !== 0 ? (res.acc || null) : null;
    var selected = Object.assign({}, res, {
      notes: tr.notes, acc: keepAcc, selectedTrackName: tr.name, repaired: tr.repaired || 0,
      lang: tr.lang || (tr.notes[0] || {}).lang || res.lang
    });
    if (tr.timbre) selected.timbre = tr.timbre;
    if (tr.vol !== undefined) selected.vol = tr.vol; else delete selected.vol;
    if (tr.pan !== undefined) selected.pan = tr.pan; else delete selected.pan;
    if (tr.muted !== undefined) selected.muted = tr.muted; else delete selected.muted;
    if (tr.pit && tr.pit.length) selected.pit = tr.pit; else delete selected.pit;
    if (tr.sampledPit) selected.sampledPit = true; else delete selected.sampledPit;
    if (tr.vocalRowCount !== undefined) selected.vocalRowCount = tr.vocalRowCount;
    if (res.project) {
      selected.project = Object.assign({}, res.project, { score: Object.assign({}, res.project.score, {
        tracks: [Object.assign({}, tr, { id: 'v', type: 'vocal' }), { id: 'i', name: '伴奏', type: 'inst', notes: [] }]
      }) });
    }
    return selected;
  };

  IO.selectImportTracks = function (res, indices) {
    var list = res.importTracks || [];
    var seen = Object.create(null), picked = [];
    (indices || []).forEach(function (idx) {
      if (!Number.isInteger(idx) || seen[idx]) return;
      seen[idx] = true;
      var tr = list[idx];
      if (!tr || !tr.notes || !tr.notes.length) return;
      picked.push(Object.assign({}, tr, {
        notes: tr.notes.map(function (n) { return Object.assign({}, n); })
      }));
    });
    if (!picked.length) throw new Error('请至少选择一个有音符的轨道');
    var first = picked[0];
    var keepAcc = res.format === 'DSC' && picked.every(function (tr) { return tr.vocalRowCount !== 0; })
      ? (res.acc || null) : null;
    var selected = Object.assign({}, res, {
      notes: first.notes,
      acc: keepAcc,
      selectedTracks: picked,
      selectedTrackName: picked.map(function (tr) { return tr.name; }).join('、'),
      repaired: picked.reduce(function (sum, tr) { return sum + (tr.repaired || 0); }, 0),
      lang: first.lang || (first.notes[0] || {}).lang || res.lang
    });
    if (first.timbre) selected.timbre = first.timbre;
    if (picked.length === 1 && first.vocalRowCount !== undefined) selected.vocalRowCount = first.vocalRowCount;
    if (res.project) {
      selected.project = Object.assign({}, res.project, { score: Object.assign({}, res.project.score, {
        tracks: picked.map(function (tr, i) {
          return Object.assign({}, tr, { id: tr.id || ('v' + (i ? i + 1 : '')), type: 'vocal' });
        }).concat([{ id: 'i', name: '伴奏', type: 'inst', notes: [] }])
      }) });
    }
    return selected;
  };

  // Explicit accompaniment import; vocal track selection keeps its established behavior.
  IO.accompanimentNotes = function (track, partPrefix) {
    return (track.notes || []).map(function (note) {
      var n = Object.assign({}, note), channel = Number.isInteger(n.midiChannel) ? n.midiChannel : 0;
      if (channel === 9) n.inst = 'drumkit';
      else n.inst = PROG_INST(Number.isInteger(n.midiProgram) ? n.midiProgram : track.program || 0);
      n.midiPart = String(partPrefix || track.name || 'midi') + ':' + channel;
      return n;
    });
  };

  /* VOCALINA Studio 2, VSPF 1.11 (little endian).
     All chunk/record lengths include their own headers. Walk the directory;
     embedded BGM PCM can contain arbitrary bytes, including apparent tags.
     Positions pack bar:16, beat:4, tick:12; ticks are 1/480 quarter notes.
     Pitch is an inverted piano row (119 - MIDI), NOT a MIDI note number.
     Confirmed against the original editor: mlh starts at beat 3, row 51 = G#4.
     Only 4/4 is verified; reject other meters rather than misplace bar positions. */
  IO.isVSPBinary = function (buf) {
    var b = toU8(buf);
    return b.length >= 4 && latin1(b.subarray(0, 4)) === 'VSPF';
  };
  IO.readVSP = function (buf) {
    var b = toU8(buf);
    if (!IO.isVSPBinary(b)) throw new Error('不是 VOCALINA VSP 工程');
    var v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    function need(off, size, end) {
      if (off < 0 || size < 0 || off + size > (end === undefined ? b.length : end)) {
        throw new Error('VSP 工程不完整或区块长度无效');
      }
    }
    function utf16(off, size, end) {
      need(off, size, end);
      if (size % 2) throw new Error('VSP 文本长度或编码无效');
      try { return new TextDecoder('utf-16le', { fatal: true }).decode(b.subarray(off, off + size)).replace(/\u0000+$/, ''); }
      catch (e) { throw new Error('VSP 文本长度或编码无效'); }
    }
    function position(raw) {
      var bar = raw >>> 16, beat = (raw >>> 12) & 15, tick = raw & 4095;
      if (beat >= 4 || tick >= 480) throw new Error('VSP 时间位置无效');
      return bar * 4 + beat + tick / 480;
    }
    need(0, 17);
    var off = v.getUint32(4, true), total = v.getUint32(8, true);
    if (total !== b.length || off < 17 || off !== 17 + v.getUint16(15, true)) {
      throw new Error('VSP 文件头长度与文件不匹配');
    }
    need(0, off);
    if (b[12] !== 1 || v.getUint16(13, true) !== 11) throw new Error('暂不支持此 VSP 版本（支持 VOCALINA Studio 2 / VSPF 1.11）');
    utf16(17, off - 17, off);
    var chunks = Object.create(null);
    while (off < b.length) {
      need(off, 8);
      var tag = latin1(b.subarray(off, off + 4)), size = v.getUint32(off + 4, true);
      if (size < 8) throw new Error('VSP 工程不完整或区块长度无效');
      need(off, size);
      if (chunks[tag]) throw new Error('VSP 工程包含重复区块');
      chunks[tag] = { start: off + 8, end: off + size }; off += size;
    }
    ['TMPO', 'BEAT', 'TRCK', 'NOTE'].forEach(function (tag) {
      if (!chunks[tag]) throw new Error('VSP 工程缺少必要区块');
    });
    function events(tag, visit) {
      var ch = chunks[tag], p = ch.start; need(p, 2, ch.end);
      var count = v.getUint16(p, true); p += 2;
      if (!count || p + count * 6 !== ch.end) throw new Error('VSP 速度或拍号事件长度无效');
      for (var i = 0; i < count; i++, p += 6) visit(p);
    }
    events('BEAT', function (p) {
      position(v.getUint32(p, true));
      if (b[p + 4] !== 4 || b[p + 5] !== 4) throw new Error('VSP 暂仅支持 4/4 拍号');
    });
    var tempos = [];
    events('TMPO', function (p) {
      var bpm = v.getUint16(p + 4, true);
      if (bpm < 20 || bpm > 400) throw new Error('VSP 速度值无效（支持 20–400 BPM）');
      tempos.push({ beat: position(v.getUint32(p, true)), bpm: bpm });
    });
    tempos.sort(function (a, z) { return a.beat - z.beat; });
    var uniqueTempos = [];
    tempos.forEach(function (t) {
      var last = uniqueTempos[uniqueTempos.length - 1];
      if (last && last.beat === t.beat) last.bpm = t.bpm;
      else uniqueTempos.push(t);
    });
    tempos = uniqueTempos;
    if (tempos[0].beat > 0) tempos.unshift({ beat: 0, bpm: tempos[0].bpm });
    var ch = chunks.TRCK, p = ch.start; need(p, 2, ch.end);
    var trackCount = v.getUint16(p, true), tracks = []; p += 2;
    for (var ti = 0; ti < trackCount; ti++) {
      need(p, 4, ch.end);
      var len = v.getUint16(p, true), textLen = v.getUint16(p + 2, true);
      if (len < 4 || textLen > len - 4) throw new Error('VSP 轨道记录无效');
      need(p, len, ch.end);
      tracks.push({ name: utf16(p + 4, textLen, p + len), notes: [] }); p += len;
    }
    // A flag byte and two length-prefixed mixer tracks (Master and BGM).
    need(p, 1, ch.end); p++;
    for (var mi = 0; mi < 2; mi++) {
      need(p, 2, ch.end); var mixLen = v.getUint16(p, true);
      if (mixLen < 2) throw new Error('VSP 轨道记录无效');
      need(p, mixLen, ch.end); p += mixLen;
    }
    if (p !== ch.end) throw new Error('VSP 轨道记录无效');
    ch = chunks.NOTE; p = ch.start; need(p, 4, ch.end);
    var noteCount = v.getUint16(p + 2, true); p += 4;
    for (var ni = 0; ni < noteCount; ni++) {
      need(p, 17, ch.end);
      var noteLen = v.getUint16(p, true), track = v.getUint16(p + 2, true);
      if (noteLen < 44 || track >= tracks.length) throw new Error('VSP 音符记录或轨道编号无效');
      need(p, noteLen, ch.end);
      var paramLen = v.getUint16(p + 15, true), lyricOff = p + 15 + paramLen;
      if (paramLen < 25) throw new Error('VSP 音符参数长度无效');
      need(lyricOff, 2, p + noteLen);
      var lyricLen = v.getUint16(lyricOff, true);
      if (lyricOff + 4 + lyricLen !== p + noteLen) throw new Error('VSP 音符歌词长度无效');
      var start = position(v.getUint32(p + 4, true)), end = position(v.getUint32(p + 8, true));
      var pitch = 119 - b[p + 12];
      if (pitch < 0 || end <= start) throw new Error('VSP 音符音高或时长无效');
      var note = { start: start, dur: end - start, pitch: pitch, vel: 96, vib: 0 };
      setLyric(note, utf16(lyricOff + 2, lyricLen, p + noteLen), 'VSP');
      tracks[track].notes.push(note); p += noteLen;
    }
    if (p !== ch.end) throw new Error('VSP 音符数量与区块长度不匹配');
    if (!noteCount) throw new Error('VSP 中没有可导入的音符');
    tracks.forEach(function (tr) {
      var lyrics = tr.notes.map(function (n) { return n.lyric; }).join('');
      tr.lang = guessLyricLanguage(tr.notes) || (KANA_RE.test(lyrics) ? 'ja' : /[\u3400-\u9fff]/.test(lyrics) ? 'zh' : undefined);
      if (tr.lang) tr.notes.forEach(function (n) { n.lang = tr.lang; });
      groupLyrics(tr.notes);
    });
    return withImportTracks({ format: 'VSP', enc: 'utf-16le', tempo: tempos[0].bpm, tempos: tempos,
      warn: 'VOCALINA 声库、音频、效果、手工音素、音高曲线、颤音及混音自动化暂不转换；音符按本地音色重新合成' }, tracks);
  };

  /* CANTOR 2: VST bank header (big endian), version-4 payload (little endian).
     Each of eight parts is a list of 98 + 1664-byte note records, closed by 99.
     These offsets are relative to the complete VCP, not the payload. Never scan
     arbitrary preset/phoneme memory for things that merely resemble notes. */
  IO.isVCPBinary = function (buf) {
    var b = toU8(buf);
    return b.length >= 20 && latin1(b.subarray(0, 4)) === 'CcnK' &&
      latin1(b.subarray(8, 12)) === 'FBCh' && latin1(b.subarray(16, 20)) === 'VCNR';
  };
  IO.readVCP = function (buf) {
    var b = toU8(buf);
    if (!IO.isVCPBinary(b)) throw new Error('不是 CANTOR VCP 工程');
    var v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    function need(off, size) {
      if (off + size > b.length) throw new Error('VCP 工程不完整（数据被截断）');
    }
    need(160, 4);
    if (v.getUint32(160, true) !== 4) throw new Error('暂不支持此 VCP 版本（支持 CANTOR 2 / 数据版本 4）');
    need(0, 362996);
    function text(off, size) {
      var end = off;
      while (end < off + size && b[end]) end++;
      // Legacy CANTOR stores Windows Western-European text. Stop at NUL:
      // unused bytes in the fixed-size lyric field contain stale heap memory.
      return new TextDecoder('windows-1252').decode(b.subarray(off, end)).trim();
    }
    var bpm = v.getFloat32(362888, true), tracks = [], off = 362964, count = 0;
    if (!isFinite(bpm) || bpm < 20 || bpm > 400) throw new Error('VCP 速度值无效');
    for (var part = 0; part < 8; part++) {
      var lang = v.getFloat32(372 + part * 928, true) >= 0.5 ? 'de' : 'en';
      var voice = text(196 + part * 928, 32);
      var tr = { name: '轨道 ' + (part + 1) + (voice ? ' · ' + voice : ''), lang: lang, notes: [] };
      while (true) {
        need(off, 4);
        var tag = v.getUint32(off, true);
        if (tag === 99) { off += 4; break; }
        if (tag !== 98) throw new Error('VCP 轨道 ' + (part + 1) + ' 的音符结构无效');
        need(off, 1668);
        var pitch = v.getInt32(off + 12, true), start = v.getFloat32(off + 16, true);
        var end = v.getFloat32(off + 1664, true);
        if (pitch < 0 || pitch > 127 || !isFinite(start) || !isFinite(end) || start < 0 || end <= start ||
            v.getUint32(off + 64, true) !== 32 || v.getUint32(off + 1648, true) !== 98) {
          throw new Error('VCP 轨道 ' + (part + 1) + ' 包含无效音符');
        }
        var note = { start: start / 15360, dur: (end - start) / 15360, pitch: pitch, vel: 96, vib: 0 };
        setLyric(note, text(off + 68, 32), 'VCP', lang);
        tr.notes.push(note); count++; off += 1668;
      }
      groupLyrics(tr.notes); tracks.push(tr);
    }
    // Version 4 appends two additional 32-bit values per note. They are not
    // NSG tuning data, but their length still guards against truncated files.
    if (b.length - off !== count * 8) throw new Error('VCP 工程尾部长度异常或数据不完整');
    if (!count) throw new Error('VCP 中没有可导入的音符');
    return withImportTracks({ format: 'VCP', title: text(164, 32), tempo: Math.round(bpm * 1000) / 1000,
      tempos: [{ beat: 0, bpm: Math.round(bpm * 1000) / 1000 }],
      warn: 'CANTOR 音色、效果、手工音素及自动化曲线暂不转换；歌词按所选音素器重新发音' }, tracks);
  };

  /* ---------------- 统一入口 ----------------
     返回 { format, tempo?, notes, importTracks?, acc?, timbre?, lang?, root?, title?, project?, enc?, repaired? } */
  IO.readAny = function (name, buf) {
    var info = sniffCore(buf, name);
    var kind = info.kind, bytes = info.bytes, res;
    function dec() {
      if (info.decoded) return info.decoded;
      // UST 2.0 可在 VERSION 段声明 Charset；未声明时仍按内容评分，
      // 不能一律强制 Shift-JIS（中文 GBK 与 UTF-8 工程也很常见）。
      var charset = kind === 'ust' && latin1(bytes.subarray(0, 4096)).match(/(?:^|[\r\n])Charset\s*=\s*([^\r\n]+)/i);
      return IO.decodeText(bytes, charset ? charset[1] : undefined);
    }
    switch (kind) {
      case 'smf': {
        var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        var mid = null;
        try { mid = IO.readMIDI(ab); } catch (e) { mid = null; }
        if (mid && mid.notes.length) { res = mid; break; }
        // VSQ 的 DM 文本按轨分别解析，编号不会跨轨互相覆盖。
        res = IO.readVSQ(ab, mid);
        break;
      }
      case 'vsqx': { var d1 = dec(); res = IO.readVSQX(d1.text); res.enc = d1.enc; break; }
      case 'vpr': {
        res = IO.readVPR(bytes[0] === 0x50 && bytes[1] === 0x4b ? bytes : dec().text); break;
      }
      case 'svp': { var d2 = dec(); res = IO.readSVP(d2.text); res.enc = d2.enc; break; }
      case 'ustx': { var d3 = dec(); res = IO.readUSTX(d3.text); res.enc = d3.enc; break; }
      case 'ust': { var du = dec(); res = IO.readUST(du.text); res.enc = du.enc; break; }
      case 'nn': { var dn = dec(); res = IO.readNN(dn.text); res.enc = dn.enc; break; }
      case 'vcp': { res = IO.readVCP(bytes); break; }
      case 'vsp': { res = IO.readVSP(bytes); break; }
      case 'ccs': case 'ccst': case 'tssln': case 'dv': case 'sk': case 'mtp': case 'vspx': case 'vog':
      case 'y77': case 'aisp': {
        if (!NSG.readExternalProject && typeof require === 'function') require('./project-imports.js');
        res = NSG.readExternalProject(kind, bytes, {
          decodeText: IO.decodeText, setLyric: setLyric, importLang: importLang, guessLyricLanguage: guessLyricLanguage,
          groupLyrics: groupLyrics, nnReading: nnReading, assignTrackMix: assignTrackMix, dbToLinear: dbToLinear,
          withImportTracks: withImportTracks, zipProjectText: zipProjectText
        });
        break;
      }
      case 'tlp': { var dtl = dec(); res = IO.readTuneLab(dtl.text, false, info.json); res.enc = dtl.enc; break; }
      case 'tlpx': { res = IO.readTuneLab(bytes, true, info.cbor); break; }
      case 'acep': {
        if (IO.isACEPBinary(bytes)) { res = IO.readACEP(bytes); res.enc = 'utf-8'; }
        else { var d7 = dec(); res = IO.readACEP(d7.text); res.enc = d7.enc; }
        break;
      }
      case 'dsc': { var d4 = dec(); res = IO.readDSC(d4.text); res.enc = d4.enc; break; }
      case 'ufdata': { var d5 = dec(); res = IO.readUfdata(d5.text); res.enc = d5.enc; break; }
      case 'nsg': { var d6 = dec(); res = { format: 'NSG', enc: d6.enc, project: IO.loadProject(d6.text) }; break; }
      default: throw new Error('无法识别的文件格式');
    }
    // 外部工程的 velocity / Dynamics / intensity 与 NSG 的人声 VEL 定义不同。
    // 所有可选导入轨都使用本地默认力度；原生工程仍完整恢复已保存的调教。
    if (!res.project) {
      (res.importTracks || []).forEach(function (tr) {
        if (res.format === 'DSC' && tr.vocalRowCount === 0) return;
        tr.notes.forEach(function (n) { n.vel = 96; });
      });
      (res.notes || []).forEach(function (n) { n.vel = 96; });
    }
    /* 兜底：万一某种导出器的字节还是被判错，按整份文档的歌词特征反查一次 */
    if (res.project) {
      res.importTracks = (res.project.score.tracks || []).map(function (tr, index) {
        return Object.assign({}, tr, { name: tr.name || ('轨道 ' + (index + 1)), notes: tr.notes || [] });
      });
    }
    if (res.importTracks) {
      res.importTracks.forEach(function (tr) { tr.repaired = repairNotes(tr.notes); });
      var current = res.importTracks.filter(function (tr) { return tr.notes === res.notes; })[0];
      if (current && current.repaired) res.repaired = current.repaired;
      if (res.project) res.repaired = res.importTracks.reduce(function (sum, tr) { return sum + tr.repaired; }, 0);
    } else if (res.notes) {
      var n1 = repairNotes(res.notes); if (n1) res.repaired = n1;
    }
    return res;
  };

  /* ---------------- 下载文件名 ---------------- */
  IO.stamp = function () {
    var d = new Date(), p = function (x) { return ('0' + x).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  };
})(typeof window !== 'undefined' ? window : global);
