/* Shared articulation-junction pitch model, legacy note curves and explicit vibrato. */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['tuning'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function value(x, fallback) { return Number.isFinite(+x) && x !== null && x !== undefined ? +x : fallback; }
  // Imported mix automation is independent of VEL (which also changes voice colour).
  // Positions are fractions of a note, so moving/resizing notes preserves the envelope.
  function envelopePoints(input, maxValue) {
    var sorted = (Array.isArray(input) ? input : []).filter(function (p) {
      return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    }).map(function (p) { return [clamp(p[0], 0, 1), clamp(p[1], 0, maxValue)]; })
      .sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    sorted.forEach(function (p) {
      if (out.length && p[0] === out[out.length - 1][0]) out[out.length - 1] = p;
      else out.push(p);
    });
    return out;
  }
  function gainPoints(input) { return envelopePoints(input, 16); }
  function effortPoints(input) { return envelopePoints(input, 2); }
  function noteGain(note, u) {
    return clamp(value(note.gain, 1), 0, 16) * envelopeAt(note.gainPoints, u);
  }
  function envelopeAt(pts, u) {
    if (!pts || !pts.length) return 1;
    if (u <= pts[0][0]) return pts[0][1];
    var last = pts.length - 1;
    if (u >= pts[last][0]) return pts[last][1];
    var lo = 0, hi = last;
    while (lo + 1 < hi) { var mid = (lo + hi) >> 1; if (pts[mid][0] <= u) lo = mid; else hi = mid; }
    var a = pts[lo], b = pts[hi];
    return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
  }
  // Edit the audible DYN envelope while preserving imported gain outside the stroke.
  // Both coordinates and feather are fractions of the note; a zero-gain note can be raised again.
  function replaceEnvelopeSpan(old, from, to, points, feather, maxValue, base) {
    from = clamp(from, 0, 1); to = clamp(to, from, 1);
    feather = Math.max(0.00001, value(feather, 0.005));
    var left = Math.max(0, from - feather), right = Math.min(1, to + feather);
    function at(u) { return base * envelopeAt(old, u); }
    var next = old.filter(function (p) { return p[0] < left || p[0] > right; }).map(function (p) { return [p[0], p[1] * base]; });
    if (left > 0) next.push([0, at(0)]);
    if (right < 1) next.push([1, at(1)]);
    if (from > 0) next.push([left, at(left)]);
    if (to < 1) next.push([right, at(right)]);
    points.forEach(function (p) { next.push([clamp(p[0], from, to), clamp(p[1], 0, maxValue)]); });
    next.sort(function (a, b) { return a[0] - b[0]; });
    var dedup = [];
    next.forEach(function (p) {
      if (dedup.length && Math.abs(p[0] - dedup[dedup.length - 1][0]) < 1e-9) dedup[dedup.length - 1] = p;
      else dedup.push(p);
    });
    return dedup;
  }
  function replaceNoteEffortSpan(note, from, to, points, feather) {
    note.effortPoints = replaceEnvelopeSpan(effortPoints(note.effortPoints), from, to, points, feather, 2, 1);
  }
  function replaceNoteGainSpan(note, from, to, points, feather) {
    var base = clamp(value(note.gain, 1), 0, 16);
    var dedup = replaceEnvelopeSpan(gainPoints(note.gainPoints), from, to, points, feather, 256, base);
    var maxGain = dedup.reduce(function (m, p) { return Math.max(m, p[1]); }, 1);
    var factor = Math.max(1, maxGain / 16);
    if (factor === 1) delete note.gain; else note.gain = factor;
    note.gainPoints = dedup.map(function (p) { return [p[0], p[1] / factor]; });
  }
  function fitNoteGain(note) {
    if (!note.gainPoints) return;
    note.gainPoints = fitPitSpan(gainPoints(note.gainPoints), 0.0001);
    if (note.gainPoints.every(function (p) { return Math.abs(p[1] - 1) < 1e-9; })) delete note.gainPoints;
  }
  function fitNoteEffort(note) {
    note.effortPoints = fitPitSpan(effortPoints(note.effortPoints), 0.001);
    if (note.effortPoints.every(function (p) { return Math.abs(p[1] - 1) < 1e-9; })) delete note.effortPoints;
  }
  function consonantLength(x) { return clamp(value(x, 100), 25, 200); }
  /* 辅音速度（与 UTAU 的 Velocity 同义）：0–200，默认 100，越大辅音越短。
     时长倍率 = 2^((100 − 速度) / 100)：200 → ½，100 → 1，0 → 2 倍。 */
  function consonantSpeed(x) { return clamp(Math.round(value(x, 100)), 0, 200); }
  // 旧工程的「辅音长度 %」(25–200) 换算为速度；50% 以下超出速度范围，按 200（½ 长度）处理。
  function speedFromLength(x) { return consonantSpeed(100 - 100 * Math.log(consonantLength(x) / 100) / Math.LN2); }
  function consonantScale(n) {
    if (n && n.consonantSpeed != null) return Math.pow(2, (100 - consonantSpeed(n.consonantSpeed)) / 100);
    if (n && n.consonantLength != null) return consonantLength(n.consonantLength) / 100;
    return 1;
  }
  var pitchShapes = [
    { id: 's', name: '缓入缓出（S 曲线）' }, { id: 'l', name: '直线' },
    { id: 'i', name: '缓入' }, { id: 'o', name: '缓出' }, { id: 'sp', name: '平滑（样条）' }
  ];
  function pitchShape(shape, fallback) {
    if (shape === 'io') return 's';
    return pitchShapes.some(function (s) { return s.id === shape; }) ? shape : (fallback || 'l');
  }
  function ease(shape, u) {
    if (shape === 's' || shape === 'sp') return (1 - Math.cos(Math.PI * u)) / 2;
    if (shape === 'i') return 1 - Math.cos(Math.PI * u / 2);
    if (shape === 'o') return Math.sin(Math.PI * u / 2);
    return u;
  }
  // Nonuniform Catmull-Rom tangents, shared by display, synthesis and fitting.
  // Two-point smooth curves use the S shape, as in OpenUtau.
  function splineCoefficients(curve, index) {
    var a = curve[index], b = curve[index + 1], prev = curve[index - 1] || a, next = curve[index + 2] || b;
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var m0 = (b[1] - prev[1]) * dx / (b[0] - prev[0]);
    var m1 = (next[1] - a[1]) * dx / (next[0] - a[0]);
    return [-2 * dy + m0 + m1, 3 * dy - 2 * m0 - m1, m0, a[1]];
  }
  function segmentAt(curve, index, x) {
    var a = curve[index], b = curve[index + 1];
    if (!b || x <= a[0]) return a[1];
    if (x >= b[0]) return b[1];
    var u = (x - a[0]) / (b[0] - a[0]);
    if (a[2] === 'sp' && curve.length > 2) {
      var c = splineCoefficients(curve, index);
      return ((c[0] * u + c[1]) * u + c[2]) * u + c[3];
    }
    return a[1] + (b[1] - a[1]) * ease(a[2], u);
  }
  function segmentCurvature(curve, index) {
    var a = curve[index], b = curve[index + 1];
    if (!b) return 0;
    var dx2 = Math.pow(b[0] - a[0], 2), dy = Math.abs(b[1] - a[1]);
    if (a[2] === 'sp' && curve.length > 2) {
      var c = splineCoefficients(curve, index);
      return Math.max(Math.abs(2 * c[1]), Math.abs(6 * c[0] + 2 * c[1])) / dx2;
    }
    if (a[2] === 's' || a[2] === 'sp') return dy * Math.PI * Math.PI / (2 * dx2);
    return a[2] === 'i' || a[2] === 'o' ? dy * Math.PI * Math.PI / (4 * dx2) : 0;
  }
  function points(pb) {
    var out = [];
    (Array.isArray(pb) ? pb : []).filter(function (p) {
      return Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]);
    }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (p) {
      var pt = [clamp(+p[0], 0, 1), clamp(+p[1], -2400, 2400), pitchShape(p[2], 'l')];
      if (out.length && Math.abs(out[out.length - 1][0] - pt[0]) < 1e-6) out[out.length - 1] = pt;
      else out.push(pt);
    });
    return out;
  }
  function interp(pb, x) {
    if (!pb || !pb.length) return 0;
    if (x <= pb[0][0]) return pb[0][1];
    var last = pb.length - 1;
    if (x >= pb[last][0]) return pb[last][1];
    var lo = 1, hi = last;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (x <= pb[mid][0]) hi = mid;
      else lo = mid + 1;
    }
    return segmentAt(pb, lo - 1, x);
  }
  function vibrato(v) {
    v = v || {};
    var out = { enabled: v.enabled !== false, length: clamp(value(v.length, 65), 0, 100),
      depth: clamp(value(v.depth, 35), 0, 200), rate: clamp(value(v.rate, 5.2), 1, 12),
      fadeIn: clamp(value(v.fadeIn, 20), 0, 100), fadeOut: clamp(value(v.fadeOut, 20), 0, 100),
      phase: clamp(value(v.phase, 0), 0, 360) };
    if (v.fadeShape === 's') out.fadeShape = 's';
    return out;
  }
  function vibCents(note, rel, duration, timbre, chainTime, vibElapsed) {
    if (note.vibrato) {
      var v = vibrato(note.vibrato), start = 1 - v.length / 100;
      if (!v.enabled || !v.length || rel < start || rel > 1) return 0;
      var u = (rel - start) / (1 - start);
      var env = Math.min(1, v.fadeIn ? u / (v.fadeIn / 100) : 1,
        v.fadeOut ? (1 - u) / (v.fadeOut / 100) : 1);
      if (v.fadeShape === 's') env = (1 - Math.cos(Math.PI * clamp(env, 0, 1))) / 2;
      var elapsed = vibElapsed === undefined ? (rel - start) * duration : vibElapsed;
      return v.depth * Math.max(0, env) * Math.sin(2 * Math.PI * v.rate * elapsed + v.phase * Math.PI / 180);
    }
    // Preserve the timbre-dependent vibrato in older projects until explicitly edited.
    var old = (timbre && timbre.vib) || {}, tt = chainTime === undefined ? rel * duration : chainTime;
    var delay = value(old.delay, 0.22), ramp = clamp((tt - delay) / 0.35, 0, 1);
    return value(note.vib, 1) * value(old.depth, 0.18) * 100 * ramp * Math.sin(2 * Math.PI * value(old.rate, 5.2) * tt);
  }
  function isRest(n) {
    return NSG.noteKind(n) === 'rest';
  }
  function isBreath(n) {
    return NSG.noteKind(n) === 'breath';
  }
  function hasPitch(n) {
    return NSG.noteKind(n) === 'voiced';
  }
  function connected(a, b) {
    return !!a && !!b && !!b.slur && hasPitch(a) && hasPitch(b) && Math.abs(a.start + a.dur - b.start) < 0.002;
  }
  function adjacent(a, b) {
    return !!a && !!b && b.pitchJoin !== false && hasPitch(a) && hasPitch(b) && Math.abs(a.start + a.dur - b.start) < 0.002;
  }
  // Junction points belong to the following note and may precede its onset.
  // Offset is in beats, height is in cents relative to that note's pitch.
  function junctionPoints(pts) {
    var out = [];
    (Array.isArray(pts) ? pts : []).filter(function (p) {
      return Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]);
    }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (p) {
      var pt = [+p[0], clamp(+p[1], -2400, 2400), pitchShape(p[2], 's')];
      if (out.length && Math.abs(out[out.length - 1][0] - pt[0]) < 1e-6) out[out.length - 1] = pt;
      else out.push(pt);
    });
    return out;
  }
  // Pre-fit sampled PIT with a vertical (cents) error bound, independent of zoom,
  // note length and tempo. Check between source controls too, including splines.
  function fitPitch(pts, tolerance, options) {
    tolerance = Math.max(0, value(tolerance, 1));
    if (pts.length <= 2) return pts.map(function (p) { return p.slice(); });
    var keep = new Uint8Array(pts.length), last = pts.length - 1;
    keep[0] = keep[last] = 1;
    // Start at meaningful curve boundaries, so a dip followed by a hold and a
    // rise is fitted as complete gestures rather than arbitrary RDP fragments.
    // These are provisional anchors; the merge pass may still remove them.
    var anchors = [0], stack = [], shapes = Object.create(null);
    for (var i = 1; i < last; i++) {
      var before = pts[i][1] - pts[i - 1][1], after = pts[i + 1][1] - pts[i][1];
      if (before * after < 0 || (before === 0) !== (after === 0)) { keep[i] = 1; anchors.push(i); }
    }
    anchors.push(last);
    for (i = 1; i < anchors.length; i++) stack.push([anchors[i - 1], anchors[i]]);
    function spanError(lo, hi, shape) {
      var a = pts[lo], b = pts[hi], candidate = [[a[0], a[1], shape], b];
      var worst = 0, split = lo + 1;
      for (var j = lo; j < hi; j++) {
        var left = pts[j][0], right = pts[j + 1][0];
        var curvature = segmentCurvature(pts, j) + segmentCurvature(candidate, 0);
        function error(x) {
          var e = Math.abs(segmentAt(pts, j, x) - segmentAt(candidate, 0, x));
          if (e > worst) { worst = e; split = Math.max(lo + 1, Math.min(hi - 1, j + 1)); }
          return e;
        }
        var intervals = [[left, right, error(left), error(right), 0]], checks = 0;
        while (intervals.length) {
          var it = intervals.pop(), edge = Math.max(it[2], it[3]);
          var bound = edge + curvature * Math.pow(it[1] - it[0], 2) / 8;
          if (bound <= tolerance + 1e-9) {
            if (bound > worst) { worst = bound; split = Math.max(lo + 1, Math.min(hi - 1, j + 1)); }
            continue;
          }
          if (edge > tolerance + 1e-9) continue;
          var mid = (it[0] + it[1]) / 2, e = error(mid);
          if (e > tolerance + 1e-9) continue;
          if (++checks >= 256 || it[4] >= 24 || mid === it[0] || mid === it[1]) {
            if (bound > worst) { worst = bound; split = Math.max(lo + 1, Math.min(hi - 1, j + 1)); }
            continue;
          }
          intervals.push([it[0], mid, it[2], e, it[4] + 1], [mid, it[1], e, it[3], it[4] + 1]);
        }
      }
      return { error: worst, split: split, shape: shape };
    }
    function bestSpan(lo, hi) {
      var best = spanError(lo, hi, 'l');
      ['s', 'i', 'o'].some(function (shape) {
        if (best.error <= tolerance + 1e-9) return true;
        var candidate = spanError(lo, hi, shape);
        if (candidate.error < best.error) best = candidate;
        return false;
      });
      return best;
    }
    var whole = bestSpan(0, last);
    if (whole.error <= tolerance + 1e-9) {
      var head = pts[0].slice(); head[2] = whole.shape;
      return [head, pts[last].slice()];
    }
    while (stack.length) {
      var span = stack.pop(), lo = span[0], hi = span[1];
      if (hi <= lo + 1) continue;
      var best = bestSpan(lo, hi);
      if (best.error <= tolerance + 1e-9) shapes[lo] = best.shape;
      else { keep[best.split] = 1; stack.push([lo, best.split], [best.split, hi]); }
    }
    var indices = [];
    for (i = 0; i <= last; i++) if (keep[i]) indices.push(i);
    // Retry combinations of neighbouring fitted spans against the ORIGINAL
    // curve, never against an already approximated result (no error stacking).
    // Bounded lookahead keeps noisy, long imports from doing quadratic work.
    for (var from = 0; from < indices.length - 2;) {
      var merged = false;
      for (var to = Math.min(indices.length - 1, from + 32); to > from + 1; to--) {
        var combined = bestSpan(indices[from], indices[to]);
        if (combined.error > tolerance + 1e-9) continue;
        for (i = from + 1; i < to; i++) keep[indices[i]] = 0;
        shapes[indices[from]] = combined.shape;
        from = to; merged = true; break;
      }
      if (!merged) from++;
    }
    var out = [];
    for (i = 0; i <= last; i++) if (keep[i]) {
      var pt = pts[i].slice();
      if (shapes[i]) pt[2] = shapes[i];
      out.push(pt);
    }
    out = options && options.fixed ? out : fitFreePitch(pts, out, tolerance);
    // Removing neighbours changes spline tangents outside the merged span too.
    if (pts.some(function (p) { return p[2] === 'sp'; }) && pitchCurveError(pts, out, tolerance) > tolerance + 1e-9)
      return pts.map(function (p) { return p.slice(); });
    return out;
  }
  // Continuous certificate for independently positioned knots. Both curves use
  // the shared segment interpolator, so bounding their second derivatives
  // on the union of their knots also bounds the error between all samples.
  function pitchCurveError(source, fitted, limit) {
    var xs = source.concat(fitted).map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
    var si = 0, fi = 0, worst = 0;
    for (var i = 1; i < xs.length; i++) {
      var left = xs[i - 1], right = xs[i];
      if (right <= left) continue;
      while (si + 1 < source.length && source[si + 1][0] <= left) si++;
      while (fi + 1 < fitted.length && fitted[fi + 1][0] <= left) fi++;
      var curv = segmentCurvature(source, si) + segmentCurvature(fitted, fi);
      function error(x) { return Math.abs(segmentAt(source, si, x) - segmentAt(fitted, fi, x)); }
      var intervals = [[left, right, error(left), error(right), 0]], checks = 0;
      while (intervals.length) {
        var p = intervals.pop(), edge = Math.max(p[2], p[3]), width = p[1] - p[0];
        if (edge > limit + 1e-9) return edge;
        var bound = edge + curv * width * width / 8;
        if (bound <= limit + 1e-9) { worst = Math.max(worst, bound); continue; }
        var mid = (p[0] + p[1]) / 2, e = error(mid);
        if (e > limit + 1e-9) return e;
        if (++checks >= 256 || p[4] >= 24 || mid === p[0] || mid === p[1]) return bound;
        intervals.push([p[0], mid, p[2], e, p[4] + 1], [mid, p[1], e, p[3], p[4] + 1]);
      }
    }
    return worst;
  }
  function subPitchCurveError(source, sLo, sHi, fitted, limit, xMin, xMax) {
    var xs = [xMin, fitted[1][0], xMax];
    for (var m = sLo; m <= sHi; m++) {
      var mx = source[m][0];
      if (mx > xMin && mx < xMax) xs.push(mx);
    }
    xs.sort(function (a, b) { return a - b; });
    var si = Math.max(0, sLo), fi = 0, worst = 0;
    while (si + 1 < source.length && source[si + 1][0] <= xMin) si++;
    for (var i = 1; i < xs.length; i++) {
      var left = xs[i - 1], right = xs[i];
      if (right <= left) continue;
      while (si + 1 < source.length && source[si + 1][0] <= left) si++;
      while (fi + 1 < fitted.length && fitted[fi + 1][0] <= left) fi++;
      var curv = segmentCurvature(source, si) + segmentCurvature(fitted, fi);
      var eL = Math.abs(segmentAt(source, si, left) - segmentAt(fitted, fi, left));
      var eR = Math.abs(segmentAt(source, si, right) - segmentAt(fitted, fi, right));
      var intervals = [[left, right, eL, eR, 0]], checks = 0;
      while (intervals.length) {
        var p = intervals.pop(), edge = Math.max(p[2], p[3]), width = p[1] - p[0];
        if (edge > limit + 1e-9) return edge;
        var bound = edge + curv * width * width / 8;
        if (bound <= limit + 1e-9) { worst = Math.max(worst, bound); continue; }
        var mid = (p[0] + p[1]) * 0.5;
        var e = Math.abs(segmentAt(source, si, mid) - segmentAt(fitted, fi, mid));
        if (e > limit + 1e-9) return e;
        if (++checks >= 256 || p[4] >= 24 || mid === p[0] || mid === p[1]) return bound;
        intervals.push([p[0], mid, p[2], e, p[4] + 1], [mid, p[1], e, p[3], p[4] + 1]);
      }
    }
    return worst;
  }
  function fitFreePitch(source, initial, tolerance) {
    if (initial.length < 4 || !tolerance) return initial;
    var out = initial.map(function (p) { return p.slice(); });
    var sourceHasSp = false;
    for (var spCheck = 0; spCheck < source.length; spCheck++) {
      if (source[spCheck][2] === 'sp') { sourceHasSp = true; break; }
    }
    var outHasSp = false;
    for (var opCheck = 0; opCheck < out.length; opCheck++) {
      if (out[opCheck][2] === 'sp') { outHasSp = true; break; }
    }
    var sourceIndex = 0;
    function sourceAt(x) {
      while (sourceIndex + 1 < source.length && source[sourceIndex + 1][0] < x) sourceIndex++;
      while (sourceIndex > 0 && source[sourceIndex][0] > x) sourceIndex--;
      return segmentAt(source, sourceIndex, x);
    }
    var bufCap = 128;
    var sampX = new Float64Array(bufCap), sampY = new Float64Array(bufCap);
    var bases = new Float64Array(bufCap), weights = new Float64Array(bufCap);
    var diffs = new Float64Array(bufCap), invWeights = new Float64Array(bufCap);
    function ensureBuf(need) {
      if (need <= bufCap) return;
      while (bufCap < need) bufCap *= 2;
      sampX = new Float64Array(bufCap); sampY = new Float64Array(bufCap);
      bases = new Float64Array(bufCap); weights = new Float64Array(bufCap);
      diffs = new Float64Array(bufCap); invWeights = new Float64Array(bufCap);
    }
    // Replace two interior points with one freely positioned point. Its height
    // is a one-variable minimax fit; search its time continuously, not on ticks.
    for (var i = 0; i + 3 < out.length;) {
      var a = out[i], d = out[i + 3], a0 = a[0], a1 = a[1], d0 = d[0], d1 = d[1], width = d0 - a0;
      var lo = 0, hi = source.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (source[mid][0] < a0) lo = mid + 1;
        else hi = mid;
      }
      var jEnd = lo;
      while (jEnd < source.length && source[jEnd][0] <= d0) jEnd++;
      var rawCount = jEnd - lo;
      ensureBuf(rawCount * 2 + 34);
      var nSamp = 0;
      for (var j = lo; j < jEnd; j++) {
        sampX[nSamp] = source[j][0];
        sampY[nSamp] = source[j][1];
        nSamp++;
        if (j + 1 < jEnd) {
          var mx = (source[j][0] + source[j + 1][0]) * 0.5;
          sampX[nSamp] = mx;
          sampY[nSamp] = sourceAt(mx);
          nSamp++;
        }
      }
      for (j = 0; j <= 32; j++) {
        var sx = a0 + width * j / 32;
        sampX[nSamp] = sx;
        sampY[nSamp] = sourceAt(sx);
        nSamp++;
      }
      var best = null;
      function evaluate(u, first, second, limit) {
        var x = a0 + width * clamp(u, 0.000001, 0.999999), num = 0, den = 0;
        var invLeft = 1 / (x - a0), invRight = 1 / (d0 - x);
        var sFirst = first === 's', sSecond = second === 's';
        var minBound = 0;
        for (var q = 0; q < nSamp; q++) {
          var px = sampX[q], py = sampY[q];
          var before = px <= x;
          var t = before ? (px - a0) * invLeft : (px - x) * invRight;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var et = (before ? sFirst : sSecond) ? (1 - Math.cos(Math.PI * t)) * 0.5 : t;
          var weight = before ? et : 1 - et, base = before ? (1 - et) * a1 : et * d1;
          var diff = py - base;
          bases[q] = base; weights[q] = weight; diffs[q] = diff;
          if (weight >= 1e-12) {
            invWeights[q] = 1 / weight;
            num += weight * diff; den += weight * weight;
          } else {
            invWeights[q] = 0;
            var absDiff = diff < 0 ? -diff : diff;
            if (absDiff > minBound) minBound = absDiff;
          }
        }
        if (minBound > limit) return minBound;
        var y = clamp(num / Math.max(1e-12, den), -2400, 2400), upper = 0;
        for (var k = 0; k < nSamp; k++) {
          var err = Math.abs(weights[k] * y - diffs[k]);
          if (err > upper) upper = err;
        }
        if (limit < upper) {
          var cLow = -2400, cHigh = 2400;
          for (var ck = 0; ck < nSamp && cLow <= cHigh; ck++) {
            var cInvW = invWeights[ck], cDiff = diffs[ck];
            if (cInvW === 0) { if (Math.abs(cDiff) > limit) cLow = Infinity; }
            else {
              var cLoB = (cDiff - limit) * cInvW, cHiB = (cDiff + limit) * cInvW;
              if (cLoB > cLow) cLow = cLoB;
              if (cHiB < cHigh) cHigh = cHiB;
            }
          }
          if (cLow > cHigh) return limit + 1;
          upper = limit; y = (cLow + cHigh) * 0.5;
        }
        var lower = minBound;
        for (var iteration = 0; iteration < 16 && upper - lower > 0.0001; iteration++) {
          var error = (lower + upper) * 0.5, low = -2400, high = 2400;
          for (k = 0; k < nSamp && low <= high; k++) {
            var invW = invWeights[k], diffK = diffs[k];
            if (invW === 0) { if (Math.abs(diffK) > error) low = Infinity; }
            else {
              var loB = (diffK - error) * invW, hiB = (diffK + error) * invW;
              if (loB > low) low = loB;
              if (hiB < high) high = hiB;
            }
          }
          if (low <= high) { upper = error; y = (low + high) * 0.5; } else lower = error;
        }
        var result = { error: upper, x: x, y: y, first: first, second: second, u: u };
        if (!best || result.error < best.error) best = result;
        return result.error;
      }
      var shapes = ['l', 's'];
      for (var fs1 = 0; fs1 < 2; fs1++) {
        var first = shapes[fs1];
        for (var fs2 = 0; fs2 < 2; fs2++) {
          var second = shapes[fs2];
          var shapeBest = null;
          for (var k = 1; k < 24; k++) {
            var uk = k / 24;
            var e = evaluate(uk, first, second, shapeBest ? shapeBest.error : Infinity);
            if (!shapeBest || e < shapeBest.error) shapeBest = { u: uk, error: e };
          }
          evaluate((out[i + 1][0] - a0) / width, first, second, best ? best.error : Infinity);
          evaluate((out[i + 2][0] - a0) / width, first, second, best ? best.error : Infinity);
          if (shapeBest.error <= Math.max(tolerance * 3, best ? best.error * 2 : Infinity)) {
            var loU = Math.max(0.000001, shapeBest.u - 1 / 24), hiU = Math.min(0.999999, shapeBest.u + 1 / 24);
            for (k = 0; k < 14; k++) {
              var u1 = loU + (hiU - loU) / 3, u2 = hiU - (hiU - loU) / 3;
              var e1 = evaluate(u1, first, second, Infinity);
              var e2 = evaluate(u2, first, second, e1);
              if (e1 < e2) hiU = u2; else loU = u1;
            }
          }
        }
      }
      if (best.error <= tolerance * 0.999) {
        var ok = false;
        var midPt = [best.x, best.y, best.second];
        if (!sourceHasSp && !outHasSp) {
          var subCandidate = [[a0, a1, best.first], midPt, [d0, d1, d[2]]];
          if (subPitchCurveError(source, Math.max(0, lo - 1), Math.min(source.length - 1, jEnd), subCandidate, tolerance, a0, d0) <= tolerance + 1e-9) ok = true;
        } else {
          var candidate = out.map(function (p) { return p.slice(); });
          candidate[i][2] = best.first;
          candidate.splice(i + 1, 2, midPt);
          if (pitchCurveError(source, candidate, tolerance) <= tolerance + 1e-9) {
            out = candidate; i = Math.max(0, i - 2); continue;
          }
        }
        if (ok) {
          out[i][2] = best.first;
          out.splice(i + 1, 2, midPt);
          i = Math.max(0, i - 2);
          continue;
        }
      }
      i++;
    }
    return out;
  }
  function fitPitchVibrato(n, original, key, score, tolerance, baseline) {
    // Explicit vibrato is already audible and must not be extracted a second
    // time. Only unmodulated imported PIT is eligible for decomposition.
    if (!tolerance || !score || !NSG.TEMPO || n.vibrato || n.vib !== 0 || original.length < 16 || baseline.length < 6) return null;
    var tm = NSG.TEMPO.map(score), duration = tm.secOf(n.start + n.dur) - tm.secOf(n.start);
    if (duration < 0.3) return null;
    var scale = key === 'pb' ? 1 : n.dur;
    if (original[0][0] < 0 || original[original.length - 1][0] > scale) return null;
    var N_SAMP = 128;
    var sampRel = new Float64Array(N_SAMP), sampSec = new Float64Array(N_SAMP);
    var sampY = new Float64Array(N_SAMP), yCentered = new Float64Array(N_SAMP);
    var tNote0 = tm.secOf(n.start);
    var turns = 0, direction = 0, extreme = interp(original, 0.25 * scale), ySum = 0;
    for (var i = 0; i < N_SAMP; i++) {
      var rel = 0.25 + 0.75 * i / 127, y = interp(original, rel * scale);
      sampRel[i] = rel;
      sampSec[i] = tm.secOf(n.start + n.dur * rel) - tNote0;
      sampY[i] = y;
      ySum += y;
      if (!direction) { if (Math.abs(y - extreme) >= 2) direction = y > extreme ? 1 : -1; }
      else if (direction > 0) {
        if (y > extreme) extreme = y;
        else if (extreme - y >= 2) { turns++; direction = -1; extreme = y; }
      } else {
        if (y < extreme) extreme = y;
        else if (y - extreme >= 2) { turns++; direction = 1; extreme = y; }
      }
    }
    if (turns < 3) return null;
    var mean = ySum / N_SAMP, variance = 0;
    var m00 = N_SAMP, m01 = 0, m11 = 0, v1Base = 0;
    for (i = 0; i < N_SAMP; i++) {
      var r = sampRel[i], yc = sampY[i] - mean;
      yCentered[i] = yc;
      variance += yc * yc;
      m01 += r;
      m11 += r * r;
      v1Base += r * yc;
    }
    var aMat = new Float64Array(20);
    var coefOut = new Float64Array(4);
    function solveFlat(m02, m03, m12, m13, m22, m23, m33, v2, v3) {
      aMat[0] = m00;  aMat[1] = m01;  aMat[2] = m02;  aMat[3] = m03;  aMat[4] = 0;
      aMat[5] = m01;  aMat[6] = m11;  aMat[7] = m12;  aMat[8] = m13;  aMat[9] = v1Base;
      aMat[10] = m02; aMat[11] = m12; aMat[12] = m22; aMat[13] = m23; aMat[14] = v2;
      aMat[15] = m03; aMat[16] = m13; aMat[17] = m23; aMat[18] = m33; aMat[19] = v3;
      for (var col = 0; col < 4; col++) {
        var pivot = col, maxAbs = Math.abs(aMat[col * 5 + col]);
        for (var row = col + 1; row < 4; row++) {
          var candAbs = Math.abs(aMat[row * 5 + col]);
          if (candAbs > maxAbs) { maxAbs = candAbs; pivot = row; }
        }
        if (maxAbs < 1e-9) return false;
        if (pivot !== col) {
          var r1 = col * 5, r2 = pivot * 5;
          for (var c = col; c <= 4; c++) {
            var tmp = aMat[r1 + c]; aMat[r1 + c] = aMat[r2 + c]; aMat[r2 + c] = tmp;
          }
        }
        var rowBase = col * 5, divisor = aMat[rowBase + col];
        for (var k = col; k <= 4; k++) aMat[rowBase + k] /= divisor;
        for (row = 0; row < 4; row++) if (row !== col) {
          var oBase = row * 5, factor = aMat[oBase + col];
          for (k = col; k <= 4; k++) aMat[oBase + k] -= factor * aMat[rowBase + k];
        }
      }
      coefOut[0] = aMat[4]; coefOut[1] = aMat[9]; coefOut[2] = aMat[14]; coefOut[3] = aMat[19];
      return true;
    }
    var trigCache = Object.create(null);
    function getTrig(rate) {
      var entry = trigCache[rate];
      if (!entry) {
        var sinArr = new Float64Array(N_SAMP), cosArr = new Float64Array(N_SAMP);
        var w = 2 * Math.PI * rate;
        for (var ti = 0; ti < N_SAMP; ti++) {
          var angle = w * sampSec[ti];
          sinArr[ti] = Math.sin(angle);
          cosArr[ti] = Math.cos(angle);
        }
        entry = trigCache[rate] = { sin: sinArr, cos: cosArr };
      }
      return entry;
    }
    var envBuf = new Float64Array(N_SAMP);
    var envRelBuf = new Float64Array(N_SAMP), env2Buf = new Float64Array(N_SAMP), envYBuf = new Float64Array(N_SAMP);
    function fillEnv(length, fadeIn, fadeOut, fadeShape, out, outRel, out2, outY) {
      var start = 1 - length / 100;
      var span = 1 - start;
      var sFadeIn = fadeIn ? 100 / (fadeIn * span) : 0;
      var sFadeOut = fadeOut ? 100 / (fadeOut * span) : 0;
      var isS = fadeShape === 's';
      var iStart = start <= 0.25 ? 0 : Math.min(N_SAMP - 1, Math.max(0, Math.floor((start - 0.25) * 127 / 0.75)));
      for (var ei = iStart; ei < N_SAMP; ei++) {
        var r = sampRel[ei];
        var ev = 0;
        if (r >= start) {
          var e = 1;
          if (fadeIn) {
            var eIn = (r - start) * sFadeIn;
            if (eIn < e) e = eIn;
          }
          if (fadeOut) {
            var eOut = (1 - r) * sFadeOut;
            if (eOut < e) e = eOut;
          }
          if (e > 0) {
            if (e > 1) e = 1;
            ev = isS ? (1 - Math.cos(Math.PI * e)) * 0.5 : e;
          }
        }
        out[ei] = ev;
        outRel[ei] = ev * r;
        out2[ei] = ev * ev;
        outY[ei] = ev * yCentered[ei];
      }
      return iStart;
    }
    var lengths = [100, 80, 70, 60, 50, 40], fades = [0, 25, 50, 75], shapes = ['l', 's'];
    var envList = [];
    for (var li = 0; li < lengths.length; li++) {
      var len0 = lengths[li];
      for (var fi = 0; fi < fades.length; fi++) {
        var in0 = fades[fi];
        if (!in0 && len0 !== 100) continue;
        for (var fo = 0; fo < fades.length; fo++) {
          var out0 = fades[fo];
          for (var si = 0; si < 2; si++) {
            var shp0 = shapes[si];
            var env = new Float64Array(N_SAMP), envRel = new Float64Array(N_SAMP);
            var env2 = new Float64Array(N_SAMP), envY = new Float64Array(N_SAMP);
            var iS = fillEnv(len0, in0, out0, shp0, env, envRel, env2, envY);
            envList.push({ length: len0, fadeIn: in0, fadeOut: out0, fadeShape: shp0,
              iStart: iS, env: env, envRel: envRel, env2: env2, envY: envY });
          }
        }
      }
    }
    var best = null, bestErr = Infinity;
    function evalKernel(sinArr, cosArr, envObj) {
      var iStart = envObj.iStart, env = envObj.env, envRel = envObj.envRel, env2 = envObj.env2, envY = envObj.envY;
      var m02 = 0, m03 = 0, m12 = 0, m13 = 0, m22 = 0, m23 = 0, m33 = 0, v2 = 0, v3 = 0;
      for (var k = iStart; k < N_SAMP; k++) {
        var s = sinArr[k], c = cosArr[k], e = env[k];
        var er = envRel[k], ee = env2[k], ey = envY[k];
        m02 += e * s; m03 += e * c;
        m12 += er * s; m13 += er * c;
        m22 += ee * s * s; m23 += ee * s * c; m33 += ee * c * c;
        v2 += ey * s; v3 += ey * c;
      }
      if (!solveFlat(m02, m03, m12, m13, m22, m23, m33, v2, v3)) return false;
      var c2 = coefOut[2], c3 = coefOut[3];
      var depth = Math.hypot(c2, c3);
      if (depth < 2 || depth > 200) return false;
      var error = Math.max(0, variance - (coefOut[1] * v1Base + c2 * v2 + c3 * v3));
      if (error < bestErr) {
        bestErr = error;
        return depth;
      }
      return false;
    }
    for (var rate = 1; rate <= 12; rate += 0.5) {
      var trig = getTrig(rate), sinArr = trig.sin, cosArr = trig.cos;
      var minDurRate = duration * rate;
      for (var ei = 0; ei < envList.length; ei++) {
        var eo = envList[ei];
        if (minDurRate * eo.length < 130) continue;
        var winDepth = evalKernel(sinArr, cosArr, eo);
        if (winDepth !== false) {
          best = {
            params: { rate: rate, length: eo.length, fadeIn: eo.fadeIn, fadeOut: eo.fadeOut, fadeShape: eo.fadeShape },
            coef: [coefOut[0] + mean, coefOut[1], coefOut[2], coefOut[3]],
            depth: winDepth, error: bestErr
          };
        }
      }
    }
    if (!best) return null;
    var polishEnvObj = { iStart: 0, env: envBuf, envRel: envRelBuf, env2: env2Buf, envY: envYBuf };
    function tryPolish(rateP, lenP, inP, outP, shpP) {
      if (lenP < 20 || lenP > 100 || rateP < 1 || rateP > 12 ||
          inP < 0 || inP > 100 || outP < 0 || outP > 100 ||
          (!inP && lenP !== 100) || duration * lenP / 100 * rateP < 1.3) return;
      var tP = getTrig(rateP);
      polishEnvObj.iStart = fillEnv(lenP, inP, outP, shpP, envBuf, envRelBuf, env2Buf, envYBuf);
      var winD = evalKernel(tP.sin, tP.cos, polishEnvObj);
      if (winD !== false) {
        best = {
          params: { rate: rateP, length: lenP, fadeIn: inP, fadeOut: outP, fadeShape: shpP },
          coef: [coefOut[0] + mean, coefOut[1], coefOut[2], coefOut[3]],
          depth: winD, error: bestErr
        };
      }
    }
    var steps = [1, 0.4, 0.15, 0.05];
    for (var stIdx = 0; stIdx < steps.length; stIdx++) {
      var step = steps[stIdx];
      for (var pass = 0; pass < 2; pass++) {
        for (var dir = -1; dir <= 1; dir += 2) tryPolish(best.params.rate + dir * step * 0.3, best.params.length, best.params.fadeIn, best.params.fadeOut, best.params.fadeShape);
        for (dir = -1; dir <= 1; dir += 2) tryPolish(best.params.rate, best.params.length + dir * step * 15, best.params.fadeIn, best.params.fadeOut, best.params.fadeShape);
        for (dir = -1; dir <= 1; dir += 2) tryPolish(best.params.rate, best.params.length, best.params.fadeIn + dir * step * 15, best.params.fadeOut, best.params.fadeShape);
        for (dir = -1; dir <= 1; dir += 2) tryPolish(best.params.rate, best.params.length, best.params.fadeIn, best.params.fadeOut + dir * step * 15, best.params.fadeShape);
      }
    }
    if (best.error > variance * 0.35) return null;
    var params = best.params, onset = 1 - params.length / 100;
    var elapsed = tm.secOf(n.start + onset * n.dur) - tm.secOf(n.start);
    var phase = (Math.atan2(best.coef[3], best.coef[2]) + 2 * Math.PI * params.rate * elapsed) * 180 / Math.PI;
    var vibr = vibrato(Object.assign({}, params, { enabled: true, depth: best.depth, phase: ((phase % 360) + 360) % 360 }));
    function vibAt(x) {
      var r = x / scale;
      return vibCents({ vibrato: vibr }, r, duration, null, 0,
        tm.secOf(n.start + n.dur * r) - tm.secOf(n.start + onset * n.dur));
    }
    var source = original.map(function (p) { return p.slice(); });
    if (source[0][0] > 0) source.unshift([0, source[0][1], 'l']);
    if (source[source.length - 1][0] < scale) source.push([scale, source[source.length - 1][1], 'l']);
    var breaks = source.map(function (p) { return p[0]; });
    [onset, onset + params.length / 100 * params.fadeIn / 100,
      1 - params.length / 100 * params.fadeOut / 100,
      onset + params.length / 100 * params.fadeIn / Math.max(1, params.fadeIn + params.fadeOut)]
      .forEach(function (r) { if (r > 0 && r < 1) breaks.push(r * scale); });
    tm.list.forEach(function (t) { var x = (t.beat - n.start) / n.dur * scale; if (x > 0 && x < scale) breaks.push(x); });
    breaks.sort(function (a, b) { return a - b; });
    var residual = [], budget = tolerance * 0.15, sourceIndex = 0;
    function residualAt(x) { return interp(source, x) - vibAt(x); }
    for (i = 1; i < breaks.length; i++) {
      var left = breaks[i - 1], right = breaks[i];
      if (right - left < 1e-10) continue;
      while (sourceIndex + 1 < source.length && source[sourceIndex + 1][0] <= left) sourceIndex++;
      var curvature = segmentCurvature(source, sourceIndex);
      var secondsPerX = n.dur / scale * tm.spbAt(n.start + n.dur * (left + right) / (2 * scale));
      var omega = 2 * Math.PI * params.rate * secondsPerX;
      var positiveFades = [params.fadeIn, params.fadeOut].filter(function (x) { return x > 0; });
      var slope = positiveFades.length ? 10000 / (scale * params.length * Math.min.apply(null, positiveFades)) : 0;
      var envelopeCurvature = 0;
      if (params.fadeShape === 's') { envelopeCurvature = slope * slope * Math.PI * Math.PI / 2; slope *= Math.PI / 2; }
      curvature += vibr.depth * (omega * omega + 2 * slope * Math.abs(omega) + envelopeCurvature);
      var steps = Math.max(1, Math.ceil((right - left) * Math.sqrt(curvature / (8 * budget))));
      for (var k = 0; k < steps; k++) {
        var x = left + (right - left) * k / steps;
        residual.push([x, residualAt(x), 'l']);
      }
    }
    residual.push([scale, residualAt(scale), 'l']);
    var fitted = fitPitch(residual, tolerance * 0.8);
    if (fitted.some(function (p) { return Math.abs(p[1]) > 2400; })) return null;
    if (fitted.length >= baseline.length) return null;
    return { points: fitted, vibrato: vibr };
  }
  function markPitNorm(arr) {
    Object.defineProperty(arr, '_pitNorm', { value: true, enumerable: false, configurable: true });
    return arr;
  }
  function lowerBoundPit(arr, beat) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid][0] < beat) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function upperBoundPit(arr, beat) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid][0] <= beat) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  // Decoupled continuous pitch deviation curve: [[beat, cents], ...].
  // Zero points are retained only as anchors next to non-zero points.
  function pitPoints(pit) {
    if (pit && pit._pitNorm) return pit.slice();
    var sorted = (Array.isArray(pit) ? pit : []).filter(function (p) {
      return Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1]) && +p[0] >= 0;
    }).sort(function (a, b) { return a[0] - b[0]; });
    var dedup = [];
    for (var i = 0; i < sorted.length; i++) {
      var pt = [+sorted[i][0], clamp(+sorted[i][1], -2400, 2400)];
      if (dedup.length && Math.abs(dedup[dedup.length - 1][0] - pt[0]) < 1e-6) dedup[dedup.length - 1] = pt;
      else dedup.push(pt);
    }
    var out = [];
    for (i = 0; i < dedup.length; i++) {
      var nonZero = Math.abs(dedup[i][1]) > 1e-6;
      var leftNonZero = i > 0 && Math.abs(dedup[i - 1][1]) > 1e-6;
      var rightNonZero = i + 1 < dedup.length && Math.abs(dedup[i + 1][1]) > 1e-6;
      if (nonZero || leftNonZero || rightNonZero) out.push(dedup[i]);
    }
    return markPitNorm(out);
  }
  function pitAt(pit, beat) {
    if (!pit || !pit.length || !Number.isFinite(beat)) return 0;
    if (beat < pit[0][0]) return 0;
    if (beat === pit[0][0]) return pit[0][1];
    var last = pit.length - 1;
    if (beat > pit[last][0]) return 0;
    if (beat === pit[last][0]) return pit[last][1];
    var lo = 1, hi = last;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (beat <= pit[mid][0]) hi = mid;
      else lo = mid + 1;
    }
    var a = pit[lo - 1], b = pit[lo], span = b[0] - a[0];
    return span > 1e-12 ? a[1] + (b[1] - a[1]) * (beat - a[0]) / span : b[1];
  }
  function replacePitSpanCore(pit, fromBeat, toBeat, newPts, feather, inPlace) {
    fromBeat = Math.max(0, value(fromBeat, 0));
    toBeat = Math.max(fromBeat, value(toBeat, fromBeat));
    feather = Math.max(0.001, value(feather, 0.015));
    var clean = (pit && pit._pitNorm) ? pit : pitPoints(pit);
    var leftBeat = Math.max(0, fromBeat - feather), rightBeat = toBeat + feather;
    var leftVal = fromBeat > 1e-6 ? pitAt(clean, leftBeat) : 0;
    var rightVal = pitAt(clean, rightBeat);
    var validNew = [];
    if (Array.isArray(newPts) && newPts.length) {
      var needsSort = false;
      for (var ni = 0; ni < newPts.length; ni++) {
        var np = newPts[ni];
        if (Array.isArray(np) && Number.isFinite(+np[0]) && Number.isFinite(+np[1]) && +np[0] >= 0) {
          var bx = +np[0], cy = clamp(+np[1], -2400, 2400);
          if (validNew.length && bx < validNew[validNew.length - 1][0]) needsSort = true;
          validNew.push([bx, cy]);
        }
      }
      if (needsSort) validNew.sort(function (a, b) { return a[0] - b[0]; });
    }
    var inserted = [];
    if (validNew.length) {
      if (fromBeat > 1e-6 && leftBeat < validNew[0][0] - 1e-6 &&
          (Math.abs(leftVal) > 1e-6 || (validNew[0][0] <= fromBeat + 1e-6 && Math.abs(validNew[0][1]) > 1e-6))) {
        inserted.push([leftBeat, leftVal]);
      }
      if (validNew[0][0] > fromBeat + 1e-6) inserted.push([fromBeat, 0]);
      for (var i = 0; i < validNew.length; i++) inserted.push(validNew[i]);
      if (validNew[validNew.length - 1][0] < toBeat - 1e-6) inserted.push([toBeat, 0]);
      if (rightBeat > validNew[validNew.length - 1][0] + 1e-6 &&
          (Math.abs(rightVal) > 1e-6 || (validNew[validNew.length - 1][0] >= toBeat - 1e-6 && Math.abs(validNew[validNew.length - 1][1]) > 1e-6))) {
        inserted.push([rightBeat, rightVal]);
      }
    } else {
      if (fromBeat > 1e-6 && Math.abs(leftVal) > 1e-6) inserted.push([leftBeat, leftVal]);
      inserted.push([fromBeat, 0]);
      if (toBeat > fromBeat + 1e-6) inserted.push([toBeat, 0]);
      if (Math.abs(rightVal) > 1e-6) inserted.push([rightBeat, rightVal]);
    }
    if (!clean.length) {
      var fresh = pitPoints(inserted);
      if (inPlace && pit && pit._pitNorm) {
        Array.prototype.push.apply(pit, fresh);
        return pit;
      }
      return fresh;
    }

    var cutLo = lowerBoundPit(clean, fromBeat - 1e-6);
    var cutHi = upperBoundPit(clean, toBeat + 1e-6);
    var minIns = leftBeat, maxIns = rightBeat;
    for (var mi = 0; mi < inserted.length; mi++) {
      if (inserted[mi][0] < minIns) minIns = inserted[mi][0];
      if (inserted[mi][0] > maxIns) maxIns = inserted[mi][0];
    }
    var winLo = Math.max(0, lowerBoundPit(clean, minIns - 1e-6) - 2);
    var winHi = Math.min(clean.length, upperBoundPit(clean, maxIns + 1e-6) + 2);
    if (winLo > cutLo) winLo = cutLo;
    if (winHi < cutHi) winHi = cutHi;

    var hasLeftGuard = winLo > 0;
    var hasRightGuard = winHi < clean.length;
    var local = [];
    if (hasLeftGuard) local.push(clean[winLo - 1]);
    for (var li = winLo; li < cutLo; li++) local.push(clean[li]);
    for (var ii = 0; ii < inserted.length; ii++) local.push(inserted[ii]);
    for (var ri = cutHi; ri < winHi; ri++) local.push(clean[ri]);
    if (hasRightGuard) local.push(clean[winHi]);

    local.sort(function (a, b) { return a[0] - b[0]; });
    var dedup = [];
    for (var di = 0; di < local.length; di++) {
      var dp = local[di];
      if (dedup.length && Math.abs(dedup[dedup.length - 1][0] - dp[0]) < 1e-6) dedup[dedup.length - 1] = dp;
      else dedup.push(dp);
    }
    var startD = hasLeftGuard ? 1 : 0;
    var endD = hasRightGuard ? dedup.length - 1 : dedup.length;
    var midOut = [];
    for (var pi = startD; pi < endD; pi++) {
      var nz = Math.abs(dedup[pi][1]) > 1e-6;
      var lnz = pi > 0 && Math.abs(dedup[pi - 1][1]) > 1e-6;
      var rnz = pi + 1 < dedup.length && Math.abs(dedup[pi + 1][1]) > 1e-6;
      if (nz || lnz || rnz) midOut.push(dedup[pi]);
    }
    if (inPlace && pit && pit._pitNorm) {
      Array.prototype.splice.apply(clean, [winLo, winHi - winLo].concat(midOut));
      return clean;
    }
    var prefixLen = winLo, suffixLen = clean.length - winHi;
    var res = new Array(prefixLen + midOut.length + suffixLen);
    var pos = 0;
    for (var k0 = 0; k0 < prefixLen; k0++) res[pos++] = clean[k0];
    for (var k1 = 0; k1 < midOut.length; k1++) res[pos++] = midOut[k1];
    for (var k2 = winHi; k2 < clean.length; k2++) res[pos++] = clean[k2];
    return markPitNorm(res);
  }
  function replacePitSpan(pit, fromBeat, toBeat, newPts, feather) {
    return replacePitSpanCore(pit, fromBeat, toBeat, newPts, feather, false);
  }
  function fitPitSpan(pts, tolerance) {
    if (pts.length <= 2) return pts.slice();
    var keep = new Uint8Array(pts.length), last = pts.length - 1;
    keep[0] = keep[last] = 1;
    var stack = [[0, last]];
    while (stack.length) {
      var seg = stack.pop(), lo = seg[0], hi = seg[1];
      if (hi <= lo + 1) continue;
      var a = pts[lo], b = pts[hi], dx = b[0] - a[0], dy = b[1] - a[1];
      var worst = -1, split = lo + 1;
      for (var i = lo + 1; i < hi; i++) {
        var expected = dx > 1e-12 ? a[1] + dy * (pts[i][0] - a[0]) / dx : a[1];
        var err = Math.abs(pts[i][1] - expected);
        if (err > worst) { worst = err; split = i; }
      }
      if (worst > tolerance + 1e-9) {
        keep[split] = 1;
        stack.push([lo, split], [split, hi]);
      }
    }
    var out = [];
    for (var j = 0; j <= last; j++) if (keep[j]) out.push(pts[j]);
    return out;
  }
  function fitPit(pit, tolerance, fromBeat, toBeat) {
    tolerance = Math.max(0, value(tolerance, 1));
    var clean = pitPoints(pit);
    if (clean.length <= 2) return clean;
    if (fromBeat !== undefined && toBeat !== undefined) {
      var before = [], inside = [], after = [];
      for (var k = 0; k < clean.length; k++) {
        if (clean[k][0] < fromBeat - 1e-6) before.push(clean[k]);
        else if (clean[k][0] > toBeat + 1e-6) after.push(clean[k]);
        else inside.push(clean[k]);
      }
      return pitPoints(before.concat(fitPitSpan(inside, tolerance), after));
    }
    var out = [], start = 0;
    for (var i = 0; i < clean.length; i++) {
      var isZero = Math.abs(clean[i][1]) <= 1e-6;
      if (isZero && i > start && i + 1 < clean.length && Math.abs(clean[i + 1][1]) <= 1e-6) {
        out = out.concat(fitPitSpan(clean.slice(start, i + 1), tolerance));
        start = i + 1;
      }
    }
    if (start < clean.length) out = out.concat(fitPitSpan(clean.slice(start), tolerance));
    return pitPoints(out);
  }
  function simplifyPitch(notes, tolerance, options) {
    tolerance = Math.max(0, value(tolerance, 1)); options = options || {};
    var result = { notes: 0, before: 0, after: 0, vibratoNotes: 0, pitReduced: false };
    (notes || []).forEach(function (n) {
      if (!hasPitch(n)) return;
      var junction = junctionPoints(n.pitchPoints), key = junction.length ? 'pitchPoints' : 'pb';
      var original = junction.length ? junction : points(n.pb);
      function fingerprint(curve) {
        var text = JSON.stringify([key, curve, n.vibrato || null, n.vib]), hash = 2166136261;
        for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
        return hash.toString(16);
      }
      // Persist a small signature so import -> normalize -> manual fit and
      // save/reopen cannot repeatedly spend another cents-error allowance on
      // an unchanged curve. Editing the curve/vibrato invalidates the signature.
      var matched = n._pitchFit && (n._pitchFit.version === 3 || n._pitchFit.version === 4) && n._pitchFit.hash === fingerprint(original);
      var prior = matched ? n._pitchFit.tolerance : 0;
      if (matched && prior >= tolerance) {
        result.before += original.length; result.after += original.length; return;
      }
      // Raising the editor's error allowance spends only the remaining budget.
      // E.g. a previously fitted 1-cent curve gets 4 more cents, not another 5.
      var budget = Math.max(0, tolerance - prior);
      var fitted = fitPitch(original, budget);
      var decomposed = fitPitchVibrato(n, original, key, options.score, budget, fitted);
      if (decomposed) { fitted = decomposed.points; n.vibrato = decomposed.vibrato; result.vibratoNotes++; }
      result.before += original.length; result.after += fitted.length;
      if (fitted.length < original.length) {
        n[key] = fitted; n._pitchFit = { version: 4, tolerance: tolerance, hash: fingerprint(fitted) }; result.notes++;
      }
    });
    var track = options.track || (options.score && Array.isArray(options.score.tracks)
      ? options.score.tracks.filter(function (t) { return t && t.pit && t.pit.length && (t.notes === notes || (notes && notes.length && t.notes.indexOf(notes[0]) >= 0)); })[0]
      : null);
    var pitSrc = options.pit || (track && track.pit);
    if (pitSrc && pitSrc.length) {
      var cleanPit = pitPoints(pitSrc), pitBefore = cleanPit.length, nextPit = cleanPit;
      if (!track || (notes && notes.length >= (track.notes || []).length)) {
        nextPit = fitPit(cleanPit, tolerance);
      } else {
        (notes || []).forEach(function (n) {
          if (hasPitch(n)) nextPit = fitPit(nextPit, tolerance, n.start, n.start + n.dur);
        });
      }
      result.before += pitBefore; result.after += nextPit.length;
      if (nextPit.length < pitBefore) {
        result.pitReduced = true;
        if (track) {
          if (nextPit.length) track.pit = nextPit;
          else delete track.pit;
        }
      }
    }
    return result;
  }
  function pitchModel(notes, pit) {
    var sorted = notes.slice().sort(function (a, b) { return a.start - b.start; });
    var records = [], byId = Object.create(null);
    sorted.forEach(function (n, i) {
      var prev = sorted[i - 1], pts = junctionPoints(n.pitchPoints), pb = points(n.pb);
      // Imported whole-note curves already contain their transitions; do not add a second glide.
      var legacy = !pts.length && pb.length > 0;
      var join = adjacent(prev, n) && !legacy;
      var span = Math.min(0.16, n.dur * 0.35, join ? prev.dur * 0.35 : 0.16);
      if (!pts.length) {
        var prevRecord = records[i - 1];
        var previousCents = join ? interp(prevRecord.points, prev.dur - span) : 0;
        var from = join ? (prev.pitch - n.pitch) * 100 + previousCents : 0;
        pts = join ? [[-span, from, 's'], [span, 0, 's']] : [[0, 0, 's'], [span, 0, 's']];
        if (legacy) pts = pb.map(function (p) { return [p[0] * n.dur, p[1], p[2]]; });
      }
      if (pts.length === 1) pts.push([pts[0][0] + Math.max(0.001, span), pts[0][1], pts[0][2]]);
      var record = { note: n, points: pts, pb: pb, legacy: legacy, joined: join, index: i, begin: n.start + pts[0][0] };
      records.push(record); byId[n.id] = record;
    });
    var cleanPit = pit && pit.length ? pitPoints(pit) : [];
    function baseMidiAt(beat, fallback) {
      var lo = 0, hi = records.length;
      while (lo < hi) { var mid = (lo + hi) >>> 1; if (records[mid].note.start <= beat) lo = mid + 1; else hi = mid; }
      var r = records[lo - 1], next = records[lo];
      if (next && next.joined && next.begin <= beat) r = next;
      if (!r) r = records[0];
      if (!r) return fallback === undefined ? 60 : fallback;
      var n = r.note;
      if (r.legacy && beat >= n.start) {
        return n.pitch + interp(r.pb, clamp((beat - n.start) / n.dur, 0, 1)) / 100;
      }
      return n.pitch + interp(r.points, beat - n.start) / 100;
    }
    function midiAt(beat, fallback) {
      var base = baseMidiAt(beat, fallback);
      return cleanPit.length ? base + pitAt(cleanPit, beat) / 100 : base;
    }
    return { records: records, byId: byId, baseMidiAt: baseMidiAt, midiAt: midiAt, pit: cleanPit };
  }
  // Bind the audible contour to note-local time and pitch while retaining the
  // track PIT representation used by old projects, the brush and the renderer.
  function bindingModelKnots(model) {
    var knots = [];
    model.records.forEach(function (r) {
      knots.push([r.note.start]);
      r.points.forEach(function (p) { knots.push([r.note.start + p[0]]); });
    });
    return knots.sort(function (a, b) { return a[0] - b[0]; });
  }
  function bindingBaseKey(model, n) {
    var own = model.byId[n.id], parts = [];
    if (!own) return '';
    for (var i = own.index; i < model.records.length; i++) {
      var r = model.records[i];
      if (i > own.index && r.note.start >= n.start + n.dur && (!r.joined || r.begin >= n.start + n.dur)) break;
      parts.push([r.note.start, r.note.pitch, r.points, r.legacy ? r.pb : null]);
    }
    return JSON.stringify(parts);
  }
  function sampleBoundCurve(xs, at) {
    xs.sort(function (a, b) { return a - b; });
    var pts = [], last = -Infinity;
    function segment(x0, y0, x1, y1, depth) {
      var width = x1 - x0, mid = (x0 + x1) / 2, ym = at(mid);
      var error = Math.max(Math.abs(ym - (y0 + y1) / 2),
        Math.abs(at(x0 + width / 4) - (y0 * 0.75 + y1 * 0.25)),
        Math.abs(at(x0 + width * 0.75) - (y0 * 0.25 + y1 * 0.75)));
      if (error > 0.05 && depth < 16 && width > 1e-7) {
        segment(x0, y0, mid, ym, depth + 1); segment(mid, ym, x1, y1, depth + 1);
      } else pts.push([x1, y1]);
    }
    xs.forEach(function (x) {
      if (x - last < 1e-7) return;
      var y = at(x);
      if (pts.length) { var p = pts[pts.length - 1]; segment(p[0], p[1], x, y, 0); }
      else pts.push([x, y]);
      last = x;
    });
    return fitPitSpan(pts, 0.025);
  }
  function capturePitBindings(notes, pit) {
    var clean = pitPoints(pit), bindings = [];
    if (!clean.length) return bindings;
    var model = pitchModel(notes, clean), knots = bindingModelKnots(model), seam = 1e-5;
    notes.forEach(function (n) {
      if (!hasPitch(n) || !(n.dur > 0)) return;
      var start = n.start, own = model.byId[n.id], next = own && model.records[own.index + 1];
      var end = Math.min(start + n.dur, next ? next.note.start : Infinity);
      if (end <= start) return;
      var lo = lowerBoundPit(clean, start), hi = upperBoundPit(clean, end - seam);
      var xs = [start, end], active = Math.abs(pitAt(clean, start)) > 1e-6 || Math.abs(pitAt(clean, end - seam)) > 1e-6;
      for (var i = lo; i < hi; i++) {
        xs.push(clean[i][0]);
        if (Math.abs(clean[i][1]) > 1e-6) active = true;
      }
      if (!active) return;
      // Preserve curved default/control-point joins as well as linear PIT knots.
      var k0 = upperBoundPit(knots, start), k1 = lowerBoundPit(knots, end);
      for (i = k0; i < k1; i++) xs.push(knots[i][0]);
      var pts = sampleBoundCurve(xs, function (b) {
        var sample = b === end ? end - Math.min(seam, n.dur / 1000) : b;
        return (model.midiAt(sample, n.pitch) - n.pitch) * 100;
      });
      bindings.push({ id: n.id, start: start, dur: n.dur, pitch: n.pitch,
        baseKey: bindingBaseKey(model, n), points: pts.map(function (p) { return [(p[0] - start) / n.dur, p[1]]; }) });
    });
    return bindings;
  }
  // Replace disjoint spans in one pass. Tiny guards isolate note boundaries;
  // unlike brush feathering they do not alter a neighbour's tuned samples.
  function spliceBoundPit(pit, spans) {
    if (!spans.length) return pitPoints(pit);
    var clean = pitPoints(pit), out = [], pos = 0, seam = 1e-5;
    spans.sort(function (a, b) { return a.start - b.start; });
    // Deletion spans form a union; inserted contours follow pitchModel's rule
    // that the later note owns an overlapping part of the timeline.
    var merged = [];
    spans.forEach(function (s) {
      var prev = merged[merged.length - 1];
      if (prev && !prev.points && !s.points && s.start <= prev.start + prev.dur) {
        prev.dur = Math.max(prev.start + prev.dur, s.start + s.dur) - prev.start;
      } else merged.push(Object.assign({}, s));
    });
    spans = merged;
    spans.forEach(function (s, index) {
      var prev = spans[index - 1], next = spans[index + 1];
      var end = Math.min(s.start + s.dur, next ? next.start : Infinity);
      if (end <= s.start) return;
      var left = Math.max(0, s.start - seam), right = end + seam;
      while (pos < clean.length && clean[pos][0] < left - 1e-7) out.push(clean[pos++]);
      if (s.start > 0 && (!prev || prev.start + prev.dur < s.start - seam)) out.push([left, pitAt(clean, left)]);
      var source = s.points || [[s.start, 0], [end, 0]];
      var pts = [[s.start, pitAt(source, s.start)]];
      source.forEach(function (p) { if (p[0] > s.start && p[0] < end) pts.push(p); });
      pts.push([end, pitAt(source, end)]);
      pts.forEach(function (p) {
        // The following note owns the exact shared boundary.
        var b = p[0] >= end - 1e-7 && next && next.start <= end + seam ? end - seam : p[0];
        out.push([b, p[1]]);
      });
      while (pos < clean.length && clean[pos][0] <= right + 1e-7) pos++;
      if (!next || next.start > end + seam) out.push([right, pitAt(clean, right)]);
    });
    while (pos < clean.length) out.push(clean[pos++]);
    return pitPoints(out);
  }
  function restorePitBindings(notes, pit, bindings, clearedSpans) {
    var byId = Object.create(null), model = pitchModel(notes), knots = bindingModelKnots(model), spans = [];
    notes.forEach(function (n) { byId[n.id] = n; });
    (bindings || []).forEach(function (binding) {
      var n = byId[binding.id];
      if (!n || !(n.dur > 0)) return;
      if (clearedSpans && binding.start === n.start && binding.dur === n.dur && binding.pitch === n.pitch &&
          binding.baseKey === bindingBaseKey(model, n) && !clearedSpans.some(function (s) {
            return s.start < n.start + n.dur - 1e-6 && s.start + s.dur > n.start + 1e-6;
          })) return;
      var own = model.byId[n.id], next = own && model.records[own.index + 1];
      var end = Math.min(n.start + n.dur, next ? next.note.start : Infinity);
      if (end <= n.start) return;
      var maxU = (end - n.start) / n.dur;
      var xs = binding.points.filter(function (p) { return p[0] < maxU; }).map(function (p) { return p[0]; });
      xs.push(0, maxU);
      var k0 = upperBoundPit(knots, n.start), k1 = lowerBoundPit(knots, end);
      for (var i = k0; i < k1; i++) xs.push((knots[i][0] - n.start) / n.dur);
      var pts = sampleBoundCurve(xs, function (u) {
        var b = n.start + u * n.dur;
        var sample = u === maxU ? b - Math.min(1e-5, n.dur / 1000) : b;
        return n.pitch * 100 + pitAt(binding.points, u) - model.baseMidiAt(sample, n.pitch) * 100;
      });
      spans.push({ start: n.start, dur: end - n.start,
        points: pts.map(function (p) { return [n.start + p[0] * n.dur, p[1]]; }) });
    });
    return spliceBoundPit(pit, spans);
  }
  function moveNotePit(oldNotes, oldPit, notes, bindings) {
    var byId = Object.create(null), changed = [];
    notes.forEach(function (n) { byId[n.id] = n; });
    oldNotes.forEach(function (old) {
      var n = byId[old.id];
      if (!n || n.start !== old.start || n.dur !== old.dur || n.pitch !== old.pitch) changed.push(old);
    });
    if (!changed.length || !oldPit || !oldPit.length) return oldPit;
    // A whole-track translation also carries PIT painted in silent gaps.
    var first = byId[oldNotes[0].id], delta = first ? first.start - oldNotes[0].start : 0;
    if (notes.length === oldNotes.length && first && oldNotes.every(function (old) {
      var n = byId[old.id];
      return n && n.start - old.start === delta && n.dur === old.dur && n.pitch - old.pitch === first.pitch - oldNotes[0].pitch;
    })) return pitPoints(oldPit.map(function (p) { return [Math.max(0, p[0] + delta), p[1]]; }));
    bindings = bindings || capturePitBindings(oldNotes, oldPit);
    var cleared = spliceBoundPit(oldPit, changed.map(function (n) { return { start: n.start, dur: n.dur }; }));
    // Restoring untouched bindings also rebases their joins when a neighbour moves.
    return restorePitBindings(notes, cleared, bindings, changed);
  }
  function decoupleTrackPitch(notes, existingPit, options) {
    options = options || {};
    var sorted = (notes || []).slice().sort(function (a, b) { return a.start - b.start; });
    var pit = pitPoints(existingPit);
    var sampledMode = !!options.sampledPit;
    var isTarget = sorted.map(function (n) {
      if (!hasPitch(n)) return false;
      var pb = points(n.pb);
      if (pb.length > 0) return true;
      var jPts = junctionPoints(n.pitchPoints);
      return jPts.length > 0 && (sampledMode || jPts.length > 24);
    });
    if (!isTarget.some(Boolean)) return pit;
    var hasNonZeroCurve = sorted.some(function (n, idx) {
      if (!isTarget[idx]) return false;
      var pb = points(n.pb);
      if (pb.length) return pb.some(function (p) { return Math.abs(p[1]) > 0.25; });
      return junctionPoints(n.pitchPoints).some(function (p) { return Math.abs(p[1]) > 0.25; });
    });
    var origModel = pitchModel(sorted);
    sorted.forEach(function (n, idx) {
      if (!isTarget[idx]) return;
      delete n.pitchPoints;
      delete n.pb;
      delete n._pitchFit;
    });
    if (!hasNonZeroCurve && !pit.length) return [];
    var baseModel = pitchModel(sorted);
    var seamEps = 1e-4;
    for (var i = 0; i < sorted.length;) {
      if (!isTarget[i]) { i++; continue; }
      var startIdx = i, endIdx = i;
      while (endIdx + 1 < sorted.length && isTarget[endIdx + 1] &&
          Math.abs(sorted[endIdx].start + sorted[endIdx].dur - sorted[endIdx + 1].start) < 0.002) {
        endIdx++;
      }
      var first = sorted[startIdx], last = sorted[endIdx];
      var origFirst = origModel.byId[first.id], baseFirst = baseModel.byId[first.id];
      var chainStart = Math.max(0, Math.min(first.start, origFirst.begin, baseFirst.begin));
      var nextAfter = sorted[endIdx + 1];
      var hasNextAdj = !!nextAfter && hasPitch(nextAfter) && Math.abs(last.start + last.dur - nextAfter.start) < 0.002;
      var chainEnd = last.start + last.dur - (hasNextAdj && last.dur > seamEps * 2 ? seamEps : 0);
      var xs = [chainStart, chainEnd];
      for (var k = startIdx; k <= endIdx; k++) {
        var nk = sorted[k];
        if (nk.start > chainStart && nk.start < chainEnd) {
          xs.push(nk.start - seamEps, nk.start);
        }
        var nEnd = nk.start + nk.dur;
        if (nEnd > chainStart && nEnd < chainEnd) xs.push(nEnd - seamEps, nEnd);
        var oRec = origModel.byId[nk.id], bRec = baseModel.byId[nk.id];
        (oRec ? oRec.points : []).forEach(function (p) {
          var bx = nk.start + p[0];
          if (bx > chainStart && bx < chainEnd) xs.push(bx);
        });
        (bRec ? bRec.points : []).forEach(function (p) {
          var bx = nk.start + p[0];
          if (bx > chainStart && bx < chainEnd) xs.push(bx);
        });
      }
      if (hasNextAdj) {
        var oNext = origModel.byId[nextAfter.id], bNext = baseModel.byId[nextAfter.id];
        (oNext ? oNext.points : []).forEach(function (p) {
          var bx = nextAfter.start + p[0];
          if (bx > chainStart && bx < chainEnd) xs.push(bx);
        });
        (bNext ? bNext.points : []).forEach(function (p) {
          var bx = nextAfter.start + p[0];
          if (bx > chainStart && bx < chainEnd) xs.push(bx);
        });
      }
      xs.sort(function (a, b) { return a - b; });
      var dedupXs = [];
      xs.forEach(function (x) {
        if (!dedupXs.length || x - dedupXs[dedupXs.length - 1] > 1e-6) dedupXs.push(x);
      });
      var raw = [], maxAbs = 0;
      for (var m = 0; m < dedupXs.length; m++) {
        var x0 = dedupXs[m];
        var v0 = clamp((origModel.midiAt(x0) - baseModel.baseMidiAt(x0)) * 100, -2400, 2400);
        if (Math.abs(v0) < 0.05) v0 = 0;
        if (Math.abs(v0) > maxAbs) maxAbs = Math.abs(v0);
        raw.push([x0, v0]);
        if (m + 1 < dedupXs.length) {
          var x1 = dedupXs[m + 1], segW = x1 - x0;
          var sub = segW > 0.005 ? Math.max(1, Math.min(16, Math.ceil(segW / 0.025))) : 1;
          for (var s = 1; s < sub; s++) {
            var sx = x0 + segW * s / sub;
            var vs = clamp((origModel.midiAt(sx) - baseModel.baseMidiAt(sx)) * 100, -2400, 2400);
            if (Math.abs(vs) < 0.05) vs = 0;
            if (Math.abs(vs) > maxAbs) maxAbs = Math.abs(vs);
            raw.push([sx, vs]);
          }
        }
      }
      var delta = maxAbs > 0.25 ? fitPit(raw, 0.4) : [];
      var feather = ((startIdx > 0 && adjacent(sorted[startIdx - 1], first)) || hasNextAdj) ? seamEps : 0.005;
      pit = replacePitSpanCore(pit, chainStart, chainEnd, delta, feather, true);
      i = endIdx + 1;
    }
    return pitPoints(pit);
  }
  // Times are seconds, pitch amounts are cents.
  // glide/lead: transition length and the share placed before the onset; prep: opposite-direction
  // preparation before a leap; over/overMax/ring/settle: overshoot past the target and its damped
  // return; scoop/scoopProb: bend-in at phrase starts; shakuri: probability of holding low and
  // snapping up on rising notes; drift: wander on sustains; fall/fallProb/fallTime: phrase-end
  // fall (negative) or flip up (positive). Vibrato: depth/rate/maxLen/delay/delayRatio/fadeIn,
  // endBoost deepens phrase-final notes. kobushi: rolling turns early in a note (depth in
  // cents, turn = seconds per half turn) with placement probabilities for phrase ends, crests,
  // falling steps and other notes of at least minSec; vibrato then starts after the turns. Vibrato goes on phrase-final notes; inside a phrase
  // only notes of at least 0.9 s get it, with probability midVib.
  var autoStyles = [
    { id: 'natural', name: '自然流行', tip: '有咬字起伏的同音回勾，先压后扬的滑入，旋律高点冲高回弹，长音渐入颤音。',
      glide: 0.12, lead: 0.4, prep: 12, over: 0.13, overMax: 40, ring: 0.4, settle: 0.06, scoop: 65, scoopProb: 0.6,
      repeat: 65, hook: 24,
      shakuri: 0.2, drift: 6, fall: -45, fallProb: 0.5, fallTime: 0.14,
      depth: 32, rate: 5.4, maxLen: 60, delay: 0.28, delayRatio: 0.3, minVib: 0.4, midVib: 0.4, fadeIn: 35, endBoost: 1.25, vel: 96, accent: 5 },
    { id: 'ballad', name: '温柔抒情', tip: '慢速连音与预备动作，句首深滑入，深而慢的颤音缓缓渐入，句尾柔和下落。',
      glide: 0.16, lead: 0.55, prep: 14, over: 0.05, overMax: 18, ring: 0.3, settle: 0.12, scoop: 60, scoopProb: 0.8,
      repeat: 45, hook: 30,
      shakuri: 0.35, drift: 9, fall: -90, fallProb: 0.75, fallTime: 0.22,
      depth: 48, rate: 4.9, maxLen: 70, delay: 0.35, delayRatio: 0.38, minVib: 0.42, midVib: 0.6, fadeIn: 55, endBoost: 1.35, vel: 80, accent: 8 },
    { id: 'bright', name: '明亮元气', tip: '快速跳音带明显过冲与回弹，常见抽音，快而浅的颤音，句尾上挑。',
      glide: 0.09, lead: 0.3, prep: 6, over: 0.16, overMax: 45, ring: 0.5, settle: 0.05, scoop: 45, scoopProb: 0.5,
      repeat: 90, hook: 45,
      shakuri: 0.45, drift: 4, fall: 35, fallProb: 0.55, fallTime: 0.09,
      depth: 26, rate: 6.4, maxLen: 50, delay: 0.2, delayRatio: 0.25, minVib: 0.34, midVib: 0.3, fadeIn: 25, endBoost: 1.15, vel: 105, accent: 8 },
    { id: 'rock', name: '强力摇滚', tip: '深回勾、先压后扬的抽音与冲高回落，宽而有力的颤音，句尾大幅甩落。',
      glide: 0.14, lead: 0.35, prep: 16, over: 0.22, overMax: 70, ring: 0.45, settle: 0.065, scoop: 170, scoopProb: 0.85,
      repeat: 150, hook: 70,
      shakuri: 0.5, drift: 12, fall: -220, fallProb: 0.7, fallTime: 0.18,
      depth: 64, rate: 5.8, maxLen: 62, delay: 0.18, delayRatio: 0.22, minVib: 0.32, midVib: 0.5, fadeIn: 22, endBoost: 1.3, vel: 113, accent: 9 },
    { id: 'electronic', name: '平直电子', tip: '直线瞬切音高，无颤音无过冲，类似硬修音的机械感，力度均衡。',
      glide: 0.014, lead: 0.5, prep: 0, over: 0, overMax: 0, ring: 0, settle: 0, scoop: 0, scoopProb: 0,
      repeat: 0, hook: 0,
      shakuri: 0, drift: 0, fall: 0, fallProb: 0, fallTime: 0, shape: 'l',
      depth: 0, rate: 5.2, maxLen: 0, delay: 0, delayRatio: 0, minVib: 0, midVib: 0, fadeIn: 0, endBoost: 1, vel: 100, accent: 0 },
    { id: 'enka', name: '演歌', tip: '浓重的转音连续回勾，句首深压后扬的抽音，宽而慢的颤音长时间摇曳，句尾深沉下落。',
      glide: 0.17, lead: 0.5, prep: 18, over: 0.12, overMax: 45, ring: 0.55, settle: 0.09, scoop: 150, scoopProb: 0.9,
      repeat: 110, hook: 60,
      kobushi: { depth: 130, turn: 0.085, end: 0.95, crest: 0.85, down: 0.75, mid: 0.4, minSec: 0.6 },
      shakuri: 0.7, drift: 10, fall: -160, fallProb: 0.8, fallTime: 0.24,
      depth: 85, rate: 5.0, maxLen: 75, delay: 0.3, delayRatio: 0.35, minVib: 0.38, midVib: 0.75, fadeIn: 45, endBoost: 1.45, vel: 100, accent: 10 },
    { id: 'da', name: '大', tip: '温和自然的音高过渡，高点明显上冲回弹与句中折返，约 4.7 Hz 宽润缓入的歌唱颤音，句尾柔和回落。',
      glide: 0.13, lead: 0.48, prep: 10, over: 0.18, overMax: 58, ring: 0.45, settle: 0.08, scoop: 55, scoopProb: 0.55,
      repeat: 50, hook: 48,
      shakuri: 0.38, drift: 8, fall: -100, fallProb: 0.65, fallTime: 0.18,
      depth: 56, rate: 4.7, maxLen: 75, delay: 0.20, delayRatio: 0.22, minVib: 0.36, midVib: 0.55, fadeIn: 50, endBoost: 1.32, vel: 94, accent: 8 }
  ];
  // Per-note random stream keyed by seed and note id, so a take is reproducible and
  // retuning a selection does not reshuffle untouched notes.
  function noteRandom(seed, key) {
    var h = (2166136261 ^ (seed >>> 0)) >>> 0;
    for (var i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    var a = h;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function consonantOnset(n, lang, phonemizer) {
    var phones = n.phones && n.phones.length ? n.phones : null;
    if (!phones && NSG.g2p) {
      var explicitLang = n.noteLang || (n.langSource === 'note' ? n.lang : '');
      var syl = NSG.g2p(n.lyric || '', explicitLang || phonemizer || n.lang || lang || 'zh');
      phones = syl.length ? syl[0].phones : null;
    }
    return !!(phones && phones.length && NSG.phoneOf(phones[0]).t !== 'V');
  }

  function prepareBalanceState(notes, score, style, targets, hd) {
    var allVoiced = notes.filter(hasPitch);
    if (!allVoiced.length) return null;
    var workNotes = notes, workScore = score, workTargets = targets, origMap = null, forceWholeTrack;
    // Fast local window when retuning a small selection inside a large (>48 voiced notes) track:
    // include +/-2 neighbour context around selected notes plus up to 24 evenly spaced reference notes,
    // packed into a compact timeline so selecting 2 notes on a 3,000-note song renders ~35 notes instead of 9,000.
    var targetCount = targets ? allVoiced.filter(function (n) { return targets.has(n); }).length : allVoiced.length;
    if (targets && targetCount > 0 && allVoiced.length > 48 && targetCount < allVoiced.length * 0.35) {
      var keepSet = new Set();
      for (var ti = 0; ti < notes.length; ti++) {
        if (targets.has(notes[ti])) {
          for (var nb = Math.max(0, ti - 2); nb <= Math.min(notes.length - 1, ti + 2); nb++) keepSet.add(notes[nb]);
        }
      }
      var stepRef = Math.max(1, Math.floor(allVoiced.length / 24));
      for (var ri = 0; ri < allVoiced.length; ri += stepRef) keepSet.add(allVoiced[ri]);
      var subset = notes.filter(function (n) { return keepSet.has(n); });
      // Pack large silent gaps (>4 beats) between non-adjacent clusters down to 1 beat while preserving local BPMs.
      var origTm = NSG.TEMPO.map(score);
      var packedNotes = [], packedMap = new Map(), packedTempos = [], curBeat = 0;
      for (var si = 0; si < subset.length; si++) {
        var origN = subset[si], prevN = subset[si - 1];
        if (!prevN) curBeat = Math.min(1, origN.start);
        else {
          var origGap = origN.start - (prevN.start + prevN.dur);
          curBeat += prevN.dur + (origGap > 4 ? 1 : origGap);
        }
        var localBpm = 60 / Math.max(0.05, origTm.secOf(origN.start + 0.25) - origTm.secOf(origN.start)) * 0.25;
        if (!packedTempos.length || Math.abs(packedTempos[packedTempos.length - 1].bpm - localBpm) > 0.05) {
          packedTempos.push({ beat: Math.max(0, curBeat), bpm: localBpm });
        }
        var cloneN = Object.assign({}, origN, { start: curBeat });
        delete cloneN.phonemeTiming;
        packedNotes.push(cloneN);
        packedMap.set(cloneN, origN);
      }
      if (!packedTempos.length) packedTempos.push({ beat: 0, bpm: score.tempo || 120 });
      packedTempos[0].beat = 0;
      var packedTargets = new Set();
      packedNotes.forEach(function (cn) { if (targets.has(packedMap.get(cn))) packedTargets.add(cn); });
      workNotes = packedNotes;
      workTargets = packedTargets;
      origMap = packedMap;
      forceWholeTrack = false;
      workScore = Object.assign({}, score, {
        tempo: packedTempos[0].bpm,
        tempos: packedTempos.length > 1 ? packedTempos : undefined,
        tracks: [{ type: 'vocal', notes: packedNotes }]
      });
    }
    // Measure every voiced note, including syllabic m/毋 and ng (no vowel required).
    // Their nasal-tract output must participate in both the reference and headroom.
    var voiced = workNotes.filter(hasPitch);
    var contour = voiced.map(function (n) { return workTargets && !workTargets.has(n) ? 1 : n.vel / style.vel; });
    // Pass 0 uses fast 16 kHz neutral probe to equalize vowel/pitch loudness;
    // Pass 1 renders at the target quality (48 kHz HD if enabled) to lock in nonlinear saturation & contour.
    var passes = hd === true
      ? [{ hd: false, contour: false, damp: 0.9 }, { hd: true, contour: true, damp: 0.9 }]
      : [{ hd: false, contour: false, damp: 0.9 }, { hd: false, contour: true, damp: 0.85 }];
    return {
      workNotes: workNotes, workScore: workScore, workTargets: workTargets, origMap: origMap,
      targets: targets, tm: NSG.TEMPO.map(workScore), voiced: voiced, contour: contour,
      forceWholeTrack: forceWholeTrack, passes: passes
    };
  }

  function buildBalanceProbe(state, passIndex) {
    var notes = passIndex === 0
      ? state.workNotes.map(function (n) { return Object.assign({}, n, { vel: 96 }); })
      : state.workNotes.map(function (n) { return Object.assign({}, n); });
    return Object.assign({}, state.workScore, { tracks: [{ type: 'vocal', notes: notes }] });
  }

  function applyBalancePass(state, passIndex, audio) {
    var pass = state.passes[passIndex];
    var tm = state.tm, voiced = state.voiced, score = state.workScore;
    var targets = state.workTargets, contour = state.contour;
    var block = Math.round(audio.sr * 0.02);
    var bleed = Math.round(audio.sr * 0.03);
    var records = voiced.map(function (n, index) {
      var begin = Math.max(0, Math.round(tm.secOf(n.start) * audio.sr));
      var end = Math.min(audio.pcm.length, Math.round(tm.secOf(n.start + n.dur) * audio.sr));
      var prev = voiced[index - 1];
      var follows = prev && Math.abs(tm.secOf(prev.start + prev.dur) - tm.secOf(n.start)) < 1e-6;
      var from = follows && consonantOnset(n, score.lang, score.phonemizer) && end - begin > bleed * 4 ? begin + bleed : begin;
      var sum = 0, windows = [];
      for (var i = from; i < end; i += block) {
        var stop = Math.min(end, i + block), sq = 0;
        for (var j = i; j < stop; j++) sq += audio.pcm[j] * audio.pcm[j];
        sum += sq; windows.push(Math.sqrt(sq / Math.max(1, stop - i)));
      }
      windows.sort(function (a, b) { return a - b; });
      var rms = Math.sqrt(sum / Math.max(1, end - from));
      // Sustained level plus a short-window guard catches conspicuous consonants.
      var body = windows.length ? windows[Math.floor((windows.length - 1) * 0.7)] : 0;
      var peak = windows.length ? windows[windows.length - 1] : 0;
      return { note: n, level: Math.max(rms, body, peak * 0.65) };
    });
    var levels = records.map(function (r) { return r.level; }).filter(function (v) { return v > 1e-9; })
      .sort(function (a, b) { return a - b; });
    if (!levels.length) return false;
    var reference = levels[Math.floor((levels.length - 1) / 2)];
    var maxRequested = 0;
    records.forEach(function (r, index) {
      var n = r.note;
      if ((targets && !targets.has(n)) || r.level < 1e-9) return;
      var target = reference * (pass.contour ? contour[index] : 1);
      var correction = clamp(20 * Math.log10(target / r.level) * pass.damp, -18, 12);
      r.requested = n.vel * Math.pow(10, correction / 20);
      maxRequested = Math.max(maxRequested, r.requested);
    });
    var wholeTrack = state.forceWholeTrack !== undefined ? state.forceWholeTrack : records.every(function (r) { return !targets || targets.has(r.note); });
    var trim = wholeTrack && maxRequested > 127 ? 127 / maxRequested : 1;
    records.forEach(function (r) {
      if (r.requested === undefined) return;
      r.note.vel = Math.round(clamp(r.requested * trim, 8, 127));
    });
    return true;
  }

  function commitBalanceState(state) {
    if (!state || !state.origMap) return;
    state.workNotes.forEach(function (cn) {
      var orig = state.origMap.get(cn);
      if (!state.targets || state.targets.has(orig)) orig.vel = cn.vel;
    });
  }

  function balanceVelocity(notes, score, timbre, style, targets, rawSource, hd, waveguide, highPolish) {
    var state = prepareBalanceState(notes, score, style, targets, hd);
    if (!state) return;
    for (var pass = 0; pass < state.passes.length; pass++) {
      var probe = buildBalanceProbe(state, pass);
      var audio = NSG.DSP.render(probe, timbre, { rawSource: !!rawSource, hd: state.passes[pass].hd === true,
        modeBFricWaveguide: waveguide, modeBHighPolish: highPolish });
      if (!applyBalancePass(state, pass, audio)) break;
    }
    commitBalanceState(state);
  }
  // Probe the current singer once per occupied register. Measure upper/body
  // energy on a sustained vowel; relative dB cancels playback gain and VEL.
  function effortCalibration(notes, targets, options) {
    var registers = new Map();
    if (!NSG.DSP || !NSG.DSP.render) return registers;
    function register(pitch) { return clamp(Math.round(pitch / 12), 3, 7); }
    notes.forEach(function (n) {
      if (hasPitch(n) && (!targets || targets.has(n))) registers.set(register(n.pitch), []);
    });
    var probes = [];
    registers.forEach(function (levels, key) {
      [0, 1, 2].forEach(function (level) {
        probes.push({ id: 'effort' + probes.length, start: probes.length * 0.48, dur: 0.36, pitch: key * 12,
          lyric: 'a', phones: ['a'], vel: 96, vib: 0, effortPoints: [[0, level]] });
      });
    });
    if (!probes.length) return registers;
    var audio = NSG.DSP.render({ lang: 'zh', tempo: 60, tracks: [{ type: 'vocal', notes: probes }] },
      options.timbre || NSG.defaultTimbre(), { hd: !!options.hd, rawSource: !!options.rawSource,
        modeBFricWaveguide: options.modeBFricWaveguide, modeBHighPolish: options.modeBHighPolish });
    var size = audio.sr > 16000 ? 2048 : 1024;
    probes.forEach(function (n) {
      var re = new Float64Array(size), im = new Float64Array(size), low = 0, high = 0;
      var offset = Math.round((n.start + 0.18) * audio.sr);
      for (var i = 0; i < size; i++) re[i] = audio.pcm[offset + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
      NSG.fft(re, im);
      for (var k = 1; k < size / 2; k++) {
        var hz = k * audio.sr / size, power = re[k] * re[k] + im[k] * im[k];
        if (hz >= 250 && hz < 1800) low += power;
        if (hz >= 2500 && hz <= 12000) high += power;
      }
      registers.get(register(n.pitch)).push(10 * Math.log10((high + 1e-20) / (low + 1e-20)));
    });
    return registers;
  }

  // Closest predicted colour to the style target, regularized toward the drawn
  // gesture when the singer has little response in this pitch register.
  function calibratedEffort(gesture, levels) {
    var prior = clamp(gesture, -1, 1);
    if (!levels || !prior) return 1 + prior;
    var slope = prior < 0 ? levels[1] - levels[0] : levels[2] - levels[1];
    if (!(slope > 0)) return 1 + prior;
    var best = prior * (5 * slope + 4) / (slope * slope + 4);
    return 1 + clamp(best, -1, 1);
  }

  // Mutate only requested fields on the supplied target notes. All notes provide
  // phrase/transition context, including unselected notes and rests.
  // options.seed picks a take (same seed = same result); options.human (0–1) scales the
  // per-note variation, 0 gives the style's textbook curve. options.expression (0–1.5)
  // scales gestures, independently of variation; junction intervals stay in tune.
  function autoTune(notes, score, options) {
    options = options || {};
    var style = autoStyles.filter(function (s) { return s.id === options.style; })[0] || autoStyles[0];
    var targets = options.targets ? new Set(options.targets) : null;
    var sorted = notes.slice().sort(function (a, b) { return a.start - b.start; });
    var tm = NSG.TEMPO.map(score), model = pitchModel(sorted), count = 0;
    var pit = options.pit !== false, vib = options.vibrato !== false, vel = options.vel !== false;
    var seed = Math.floor(value(options.seed, 0)), human = clamp(value(options.human, 0.6), 0, 1);
    var expression = clamp(value(options.expression, 1), 0, 1.5);
    var effort = options.effort === true;
    if (!pit && !vib && !vel && !effort) return 0;
    var track = options.track || (score && Array.isArray(score.tracks)
      ? score.tracks.filter(function (t) { return t && t.notes === notes; })[0]
      : null);
    if (!track && Number.isInteger(options.trackIndex) && score && Array.isArray(score.tracks)) {
      track = score.tracks[options.trackIndex] || null;
    }
    var effortLevels = effort && expression ? effortCalibration(sorted, targets, options) : null;
    var trackPit = pit && track ? pitPoints(track.pit) : [];
    sorted.forEach(function (n, i) {
      if ((targets && !targets.has(n)) || !hasPitch(n)) return;
      var prev = sorted[i - 1], next = sorted[i + 1];
      var begin = tm.secOf(n.start), duration = Math.max(0.001, tm.secOf(n.start + n.dur) - begin);
      var phraseEnd = !adjacent(n, next), phraseStart = !adjacent(prev, n);
      var key = String(n.id !== undefined ? n.id : i);
      var rnd = noteRandom(seed, key + ':tail');
      function vary(x, amount) { return x * (1 + (rnd() * 2 - 1) * amount * human); }
      function chance(p) { var x = rnd(); return human ? x < p : p >= 0.5; }
      function at(sec) { return tm.beatOf(begin + sec) - n.start; }
      var tail = phraseEnd && !!style.fall && duration > 0.22 && chance(style.fallProb);
      var fallSec = tail ? Math.min(vary(style.fallTime, 0.3), duration * 0.35) : 0;
      var bodyEnd = duration - fallSec;
      // A local melodic crest gets a stronger arrival; a held syllable does not get
      // the same re-attack as a new lyric at the same pitch.
      var crest = !phraseStart && n.pitch > prev.pitch && (phraseEnd || n.pitch >= next.pitch);
      var emphasis = crest ? 1.2 : 1;
      // Kobushi goes where enka singers use it: phrase-final sustains, melodic crests and
      // falling steps; other long notes only with randomness. Never on same-pitch holds.
      // It has its own random stream so vibrato placement does not depend on the PIT channel.
      var kob = null;
      if (style.kobushi && expression > 0 && !(n.slur && prev && prev.pitch === n.pitch)) {
        var K = style.kobushi, krnd = noteRandom(seed, key + ':kobushi');
        var falling = !phraseStart && n.pitch < prev.pitch;
        var kp = phraseEnd ? K.end : crest ? K.crest : falling ? K.down : K.mid, kx = krnd();
        var kStart = Math.min(0.32, duration * 0.35), turnSec = K.turn * (1 + (krnd() * 2 - 1) * 0.2 * human);
        var turns = Math.min(phraseEnd || crest ? 3 : 2, Math.floor((bodyEnd - kStart - 0.15) / (turnSec * 2)));
        if (duration >= K.minSec && turns >= 1 && (human ? kx < kp : kp >= 0.5))
          kob = { start: kStart, turns: turns, sec: turnSec, end: kStart + (turns * 2 + 1) * turnSec,
            depth: K.depth * (1 + (krnd() * 2 - 1) * 0.25 * human) * expression * emphasis };
      }
      if (pit) {
        rnd = noteRandom(seed, key + ':pit');
        var joined = adjacent(prev, n), shape = style.shape || 's', pts = [], basePts = [];
        var add = function (x, cents) {
          if (x > n.dur + 1e-9 || (pts.length && x <= pts[pts.length - 1][0] + 1e-4)) return;
          pts.push([x, clamp(cents, -2400, 2400) + 0, shape]);
        };
        var cursor;
        if (joined) {
          var d = (n.pitch - prev.pitch) * 100, dir = d > 0 ? 1 : d < 0 ? -1 : 0, size = Math.min(1, Math.abs(d) / 700);
          var glide = vary(style.glide * (0.75 + 0.5 * size), 0.3), lead = clamp(vary(style.lead, 0.35), 0.1, 0.8);
          var prevSec = begin - tm.secOf(prev.start);
          var before = Math.max(0.0001, Math.min(glide * lead, prevSec * 0.4));
          var after = Math.max(0.0001, Math.min(glide * (1 - lead), bodyEnd * 0.35));
          var span = n.start - tm.beatOf(begin - before);
          var previous = prev.pitchPoints || model.records[i - 1].points;
          var from = (prev.pitch - n.pitch) * 100 + interp(previous, prev.dur - span);
          add(-span, from);
          basePts.push([-span, clamp(from, -2400, 2400) + 0, shape]);
          var afterBeat = Math.min(n.dur, Math.max(0.0001, at(after)));
          basePts.push([afterBeat, 0, shape]);
          // Preparation: a small move against the leap direction before it starts.
          var prep = vary(style.prep * (0.5 + size), 0.5) * expression;
          if (dir && prep > 0.5 && before > 0.03) add(-span * 0.4, from - dir * prep);
          // Reserve the stable body and release even on fast, very short notes.
          var settle = Math.min(vary(style.settle, 0.35), (bodyEnd - after) * 0.3);
          if (!dir) {
            var dip = connected(prev, n) ? 0 : vary(style.repeat, 0.35) * expression * Math.min(1, duration / 0.18);
            add(at(after * 0.85), -dip);
            add(at(after + settle), dip * 0.15);
            add(at(after + settle * 2), 0);
          } else {
            if (dir > 0 && chance(style.shakuri)) {
              // Two-stage arrival: hold below target, then snap upward.
              // Scale the hold with both interval and style; never overshoot the source pitch.
              var hold = Math.min(vary(style.scoop * 0.8 + Math.abs(d) * 0.12, 0.3) * expression, Math.abs(d) * 0.8);
              add(at(after * 0.3), -hold);
              add(at(after * 0.68), -hold * 0.9);
            }
            var os = dir * Math.min(vary(Math.abs(d) * style.over, 0.4), style.overMax) * expression * emphasis;
            add(at(after), os);
            if (os) {
              add(at(after + settle), -os * vary(style.ring, 0.4));
              add(at(after + settle * 2), 0);
            }
          }
          cursor = after + settle * 2;
        } else {
          var scoopAmt = (chance(style.scoopProb) ? vary(style.scoop, 0.4) : vary(style.scoop * 0.25, 0.5)) * expression;
          var rise = Math.max(0.006, Math.min(vary(style.glide * 1.1, 0.3), bodyEnd * 0.35));
          rise = Math.min(rise, bodyEnd * 0.35);
          var settleIn = Math.min(vary(style.settle, 0.35), (bodyEnd - rise) * 0.3);
          var defSpan = Math.min(0.16, n.dur * 0.35);
          basePts.push([0, 0, shape]);
          basePts.push([defSpan, 0, shape]);
          add(0, -scoopAmt);
          // Keep the low preparation audible instead of spreading it across one smooth ramp.
          if (scoopAmt > 1) add(at(rise * 0.45), -scoopAmt * 0.85);
          add(at(rise), scoopAmt * style.over * 0.6);
          add(at(rise + settleIn), 0);
          cursor = rise + settleIn;
        }
        // A slow hook on longer, newly articulated notes adds direction before the release.
        // Sustained syllables use only small drift, keeping held vowels stable.
        if (kob) {
          // Rolling turns: flick above, dip below, each a little smaller, then settle. The window
          // is fixed so vibrato timing stays PIT-independent; a late arrival drops turns.
          var k0 = Math.max(cursor, kob.start);
          var fit = Math.min(kob.turns, Math.floor((kob.end - k0 - kob.sec) / (kob.sec * 2) + 1e-9));
          for (var t = 0; t < fit; t++) {
            var decay = 1 - 0.25 * t;
            add(at(k0 + kob.sec * (2 * t + 1)), kob.depth * decay);
            add(at(k0 + kob.sec * (2 * t + 2)), -kob.depth * 0.45 * decay);
          }
          if (fit > 0) { cursor = k0 + kob.sec * (2 * fit + 1); add(at(cursor), 0); }
        } else if (style.hook && !n.slur && bodyEnd - cursor > 0.24) {
          var room = bodyEnd - cursor, hook = vary(style.hook, 0.4) * expression * emphasis;
          add(at(cursor + room * 0.38), -hook * 0.55);
          add(at(cursor + room * 0.72), hook * 0.35);
          cursor += room * 0.72;
        }
        // Sustain wander: a slow, irregular sag or lift instead of a ruler-straight line.
        if (style.drift && bodyEnd - cursor > 0.3) {
          var room = bodyEnd - cursor;
          var wander = function (fallback) { var x = rnd() * 2 - 1; return (human ? x : fallback) * style.drift * (0.4 + human) * expression; };
          add(at(cursor + room * vary(0.45, 0.3)), wander(-1));
          add(at(cursor + room * vary(0.8, 0.1)), wander(0.7) * 0.7);
        }
        if (tail) {
          add(at(bodyEnd), 0);
          add(n.dur, vary(style.fall, 0.35) * expression);
        } else add(n.dur, 0);
        if (pts.length === 1) pts.push([n.dur, 0, shape]);
        if (options.decouple === false || !track) {
          n.pitchPoints = pts;
        } else {
          var xStart = joined ? basePts[0][0] : 0;
          var xs = [xStart, n.dur];
          pts.forEach(function (p) { if (p[0] > xStart && p[0] < n.dur) xs.push(p[0]); });
          basePts.forEach(function (p) { if (p[0] > xStart && p[0] < n.dur) xs.push(p[0]); });
          xs.sort(function (a, b) { return a - b; });
          var dedupXs = [];
          xs.forEach(function (x) {
            if (!dedupXs.length || x - dedupXs[dedupXs.length - 1] > 1e-6) dedupXs.push(x);
          });
          var raw = [];
          for (var k = 0; k < dedupXs.length; k++) {
            var x0 = dedupXs[k];
            raw.push([Math.max(0, n.start + x0), interp(pts, x0) - interp(basePts, x0)]);
            if (k + 1 < dedupXs.length) {
              var x1 = dedupXs[k + 1], segW = x1 - x0;
              if (shape !== 'l' && segW > 1e-6) {
                var sub = Math.max(3, Math.min(16, Math.ceil(segW / 0.015)));
                for (var s = 1; s < sub; s++) {
                  var sx = x0 + segW * s / sub;
                  raw.push([Math.max(0, n.start + sx), interp(pts, sx) - interp(basePts, sx)]);
                }
              }
            }
          }
          var maxAbs = 0;
          for (var m = 0; m < raw.length; m++) maxAbs = Math.max(maxAbs, Math.abs(raw[m][1]));
          var deltaPts = maxAbs > 0.25 ? fitPit(raw, 0.35) : [];
          trackPit = replacePitSpanCore(trackPit, Math.max(0, n.start + xStart), n.start + n.dur, deltaPts, 0.005, true);
          n.pitchPoints = basePts;
        }
        delete n.pb;
        delete n._pitchFit;
      }
      if (vib) {
        rnd = noteRandom(seed, key + ':vibrato');
        var pick = phraseEnd || duration >= 0.9 && chance(style.midVib);
        var on = style.depth > 0 && expression > 0 && duration >= style.minVib && pick;
        var delaySec = vary(Math.max(style.delay, duration * style.delayRatio), 0.25);
        if (kob) delaySec = Math.max(delaySec, kob.end + 0.1);
        var length = clamp(vary((1 - delaySec / duration) * 100, 0.1), 0, style.maxLen + (phraseEnd ? 15 : 0));
        var depth = vary(style.depth * (0.65 + 0.35 * Math.min(1, duration / 1.5)) * (phraseEnd ? style.endBoost : 1), 0.2) * expression;
        var rate = style.rate + (rnd() * 2 - 1) * 0.45 * human;
        var vibSec = Math.max(0.05, duration * length / 100);
        var fadeOut = tail ? clamp((fallSec + 0.08) / vibSec * 100, 15, 60) : phraseEnd ? 35 : 15;
        var phase = rnd() * 360 * human;
        n.vibrato = vibrato({ enabled: on && length > 0, length: length, depth: depth, rate: rate,
          fadeIn: clamp(vary(style.fadeIn, 0.3), 10, 80), fadeOut: fadeOut, phase: phase });
      }
      if (effort) {
        // Style and melodic stress set the target effort. Enter repeated/slurred notes
        // gently, support sustained notes, and relax the end of each phrase.
        var body = (style.vel - 96) / 43 + (crest ? 0.20 : 0);
        var spread = style.accent / 9;
        var onset = body + (n.slur ? 0 : phraseStart ? -0.24 : 0.10) * spread;
        var sustain = body + 0.18 * Math.min(1, duration / 0.8) * spread;
        var end = body - (phraseEnd ? 0.40 : 0.06) * spread;
        var levels = effortLevels && effortLevels.get(clamp(Math.round(n.pitch / 12), 3, 7));
        function level(x) { return Math.round(100 * calibratedEffort(expression * x, levels)) / 100; }
        n.effortPoints = [[0, level(onset)], [at(Math.min(0.12, duration * 0.3)) / n.dur, level(body)],
          [at(duration * 0.65) / n.dur, level(sustain)], [1, level(end)]];
        fitNoteEffort(n);
      }
      if (vel) {
        var beat = ((n.start % 4) + 4) % 4;
        var accent = beat < 0.02 ? 1 : Math.abs(beat - 2) < 0.02 ? 0.5 : -0.35;
        n.vel = Math.round(clamp(style.vel + style.accent * 0.35 * (accent + (phraseStart ? 0.35 : 0) - (phraseEnd ? 0.8 : 0)), 1, 127));
      }
      count++;
    });
    if (pit && track) {
      trackPit = pitPoints(trackPit);
      if (trackPit.length) track.pit = trackPit;
      else delete track.pit;
    }
    if (vel && count && !options.skipVelocityBalance && NSG.DSP && NSG.DSP.render) {
      var tuneScore = (options.lang || options.phonemizer !== undefined)
        ? Object.assign({}, score, { lang: options.lang || score.lang,
            phonemizer: options.phonemizer !== undefined ? options.phonemizer : score.phonemizer })
        : score;
      balanceVelocity(sorted, tuneScore, options.timbre || NSG.defaultTimbre(), style, targets,
        options.rawSource, options.hd, options.modeBFricWaveguide, options.modeBHighPolish);
    }
    return count;
  }
  NSG.TUNING = { pitchShapes: pitchShapes, pitchShape: pitchShape, clamp: clamp, points: points, interp: interp, vibrato: vibrato, consonantLength: consonantLength,
    effortPoints: effortPoints, envelopeAt: envelopeAt, replaceNoteEffortSpan: replaceNoteEffortSpan, fitNoteEffort: fitNoteEffort,
    gainPoints: gainPoints, noteGain: noteGain, replaceNoteGainSpan: replaceNoteGainSpan, fitNoteGain: fitNoteGain,
    consonantSpeed: consonantSpeed, speedFromLength: speedFromLength, consonantScale: consonantScale,
    autoStyles: autoStyles, autoTune: autoTune, fitPitch: fitPitch, simplifyPitch: simplifyPitch,
    prepareBalance: prepareBalanceState, buildBalanceProbe: buildBalanceProbe,
    applyBalancePass: applyBalancePass, commitBalance: commitBalanceState,
    vibCents: vibCents, connected: connected, adjacent: adjacent, isRest: isRest, isBreath: isBreath, hasPitch: hasPitch,
    junctionPoints: junctionPoints, pitchModel: pitchModel,
    capturePitBindings: capturePitBindings, restorePitBindings: restorePitBindings, moveNotePit: moveNotePit,
    pitPoints: pitPoints, pitAt: pitAt, replacePitSpan: replacePitSpan, fitPit: fitPit, decoupleTrackPitch: decoupleTrackPitch };
  NSG.interpPB = interp;
})(typeof window !== 'undefined' ? window : global);
