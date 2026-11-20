/* ==========================================================================
   NSG · 分段速度（Tempo Map）
   ----------------------------------------------------------------------
   score.tempos = [{ beat: 0, bpm: 120 }, { beat: 32, bpm: 90 }, …]
   第一段必须从第 0 拍开始；score.tempo 保留为第一段的 BPM，供老工程与
   老代码读取。所有「拍 → 秒」的换算都必须走这里，不能再用 60/tempo：
   一旦有变速，常量 spb 会把整首歌按同一个速度铺，越往后越对不上。
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['tempo'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  var T = NSG.TEMPO = {};

  T.DEFAULT = 120;
  T.MIN = 20;
  T.MAX = 400;

  function clampBpm(v) {
    v = +v;
    if (!isFinite(v) || v <= 0) return T.DEFAULT;
    return Math.max(T.MIN, Math.min(T.MAX, v));
  }

  /* 读成规范化的段表：按拍排序、首段补齐到 0、去掉挨得太近的重复 */
  T.list = function (score) {
    var arr = (score && score.tempos && score.tempos.length) ? score.tempos : null;
    if (!arr) {
      return [{ beat: 0, bpm: clampBpm(score && score.tempo) }];
    }
    var tmp = [];
    for (var i = 0; i < arr.length; i++) {
      var b = +arr[i].beat, v = +arr[i].bpm;
      if (!isFinite(b) || b < 0) b = 0;
      tmp.push({ beat: b, bpm: clampBpm(v) });
    }
    tmp.sort(function (a, b2) { return a.beat - b2.beat; });
    var out = [tmp[0]];
    for (var j = 1; j < tmp.length; j++) {
      if (tmp[j].beat - out[out.length - 1].beat > 0.05) out.push(tmp[j]);
    }
    // 单个速度点表示全局 BPM，与它在导入工程中的位置无关。
    if (out.length === 1) out[0].beat = 0;
    else if (out[0].beat > 0.0001) out.unshift({ beat: 0, bpm: out[0].bpm });
    return out;
  };

  /* 段表 → 换算器。sec 是每段的起始秒，预先累好，查询就是一次查找 */
  T.map = function (score) {
    var list = T.list(score);
    var segs = [{ beat: list[0].beat, bpm: list[0].bpm, sec: 0 }];
    for (var i = 1; i < list.length; i++) {
      var prev = segs[segs.length - 1];
      prev.secEnd = prev.sec + (list[i].beat - prev.beat) * 60 / prev.bpm;
      segs.push({ beat: list[i].beat, bpm: list[i].bpm, sec: prev.secEnd });
    }
    segs[segs.length - 1].secEnd = Infinity;

    function idxOf(beat) {
      var len = segs.length;
      if (len === 1) return 0;
      var lo = 0, hi = len - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (beat >= segs[mid].beat - 1e-9) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    }
    return {
      list: list,
      segs: segs,
      count: segs.length,
      /* 第 beat 拍对应的秒 */
      secOf: function (beat) {
        if (!isFinite(beat)) beat = 0;
        var k = idxOf(beat), s = segs[k];
        return s.sec + (beat - s.beat) * 60 / s.bpm;
      },
      /* 第 sec 秒对应的拍 */
      beatOf: function (sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        var len = segs.length, k = 0;
        if (len > 1) {
          var lo = 0, hi = len - 1;
          while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (sec >= segs[mid].sec - 1e-9) lo = mid;
            else hi = mid - 1;
          }
          k = lo;
        }
        var s = segs[k];
        return s.beat + (sec - s.sec) * s.bpm / 60;
      },
      /* 某一拍的「每拍多少秒」，供颤音、包络这类按拍算的时长使用 */
      spbAt: function (beat) { return 60 / segs[idxOf(beat)].bpm; },
      bpmAt: function (beat) { return segs[idxOf(beat)].bpm; },
      /* 第 beat 拍所在段的序号（编辑器里高亮用） */
      segIndexAt: function (beat) { return idxOf(beat); }
    };
  };

  /* 写入/修改/删除一段。返回新的段表（同步回 score） */
  T.set = function (score, beat, bpm) {
    var list = T.list(score);
    beat = Math.max(0, +beat || 0);
    bpm = clampBpm(bpm);
    var hit = -1;
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(list[i].beat - beat) < 0.05) { hit = i; break; }
    }
    if (hit >= 0) list[hit].bpm = bpm;
    else list.push({ beat: beat, bpm: bpm });
    return T.apply(score, list);
  };

  T.remove = function (score, idx) {
    var list = T.list(score);
    if (list.length <= 1) return list;
    if (idx <= 0) return list;              // 第 0 段删不得，它是全曲的基准速度
    list.splice(idx, 1);
    return T.apply(score, list);
  };

  /* 把段表写回 score：排好序、填好 score.tempo */
  T.apply = function (score, list) {
    list.sort(function (a, b) { return a.beat - b.beat; });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var b = Math.max(0, +list[i].beat || 0);
      if (out.length && b - out[out.length - 1].beat < 0.05) continue;
      out.push({ beat: Math.round(b * 1000) / 1000, bpm: clampBpm(list[i].bpm) });
    }
    if (!out.length) out = [{ beat: 0, bpm: T.DEFAULT }];
    if (out.length === 1) out[0].beat = 0;
    else if (out[0].beat > 0) out.unshift({ beat: 0, bpm: out[0].bpm });
    score.tempos = out;
    score.tempo = out[0].bpm;
    return out;
  };

  /* 全曲总时长（秒），最后一拍的 endBeat 由调用方给 */
  T.duration = function (score, endBeat) {
    return T.map(score).secOf(Math.max(0, endBeat || 0));
  };

  /* 小节号 → 拍（4/4）。编辑器里按小节输入时用 */
  T.barToBeat = function (bar) { return Math.max(0, (+bar - 1) * 4); };
  T.beatToBar = function (beat) { return Math.floor(beat / 4) + 1; };
})(typeof window !== 'undefined' ? window : global);
