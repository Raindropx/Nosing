/* 莫名其妙的眼睛模式 · 动态视觉效果引擎（14 种演出：4 种晒调教 + 10 种莫名其妙×120，全主题自适应） */
(function (root) {
  'use strict';
  var NSG = root.NSG = root.NSG || {};

  function tr(key, fallback, vars) {
    if (NSG.I18N && typeof NSG.I18N.t === 'function') return NSG.I18N.t(key, vars || null, fallback);
    return fallback;
  }

  function langCode() {
    var l = (NSG.I18N && typeof NSG.I18N.getLanguage === 'function' ? NSG.I18N.getLanguage() : 'zh') || 'zh';
    if (l.indexOf('ja') === 0) return 'ja';
    if (l.indexOf('en') === 0) return 'en';
    return 'zh';
  }

  function cleanLyric(n) {
    var s = String((n && n.lyric) || 'a').replace(/\s*\[[^\]]*\]/g, '').trim();
    return s || 'a';
  }

  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function parseColorRgb(str) {
    if (!str || typeof str !== 'string') return [245, 250, 255];
    var mHex = /^#([0-9a-f]{6})$/i.exec(str.trim());
    if (mHex) {
      var n = parseInt(mHex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var mRgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(str);
    if (mRgb) return [+mRgb[1], +mRgb[2], +mRgb[3]];
    return [245, 250, 255];
  }

  function colorAlpha(str, alpha) {
    var rgb = parseColorRgb(str);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + clamp(alpha, 0, 1).toFixed(3) + ')';
  }

  function isDarkPalette(T) {
    var rgb = parseColorRgb((T && T.rowWhite) || '#ffffff');
    var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return lum < 0.45;
  }

  function fillStops(grad, stops) {
    if (!Array.isArray(stops) || !stops.length) { grad.addColorStop(0, '#4cc9f0'); grad.addColorStop(1, '#4361ee'); return grad; }
    var pos = stops.length === 3 ? [0, 0.5, 1] : stops.length === 4 ? [0, 0.48, 0.52, 1] : [0, 1];
    for (var i = 0; i < stops.length; i++) grad.addColorStop(pos[i] !== undefined ? pos[i] : i / Math.max(1, stops.length - 1), stops[i]);
    return grad;
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    if (r <= 0) { c.rect(x, y, w, h); return; }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function getAccents(T, themeId) {
    var dark = isDarkPalette(T);
    var style = (T && T.noteStyle) || themeId || 'aero';
    var isPixel = style === 'pixel' || themeId === 'pixel';
    var is9x = style === '9x' || themeId === '9x';
    return {
      isDark: dark,
      isPixel: isPixel,
      is9x: is9x,
      style: style,
      primary: T.playLine || '#ff5232',
      ctrl: T.pitCtrlLine || T.pitNodeFill || '#e83b74',
      vib: T.vibLine || '#16946c',
      noteStroke: T.noteStroke || '#52a3d4',
      noteSelStroke: T.noteSelStroke || '#c48b1b',
      noteText: T.noteText || (dark ? '#ffffff' : '#08334e'),
      pitLine: T.pitLine || (dark ? '#eef8ff' : '#24303c'),
      pitOutline: T.pitOutline || (dark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.92)'),
      ink: dark ? '#ffffff' : '#102436',
      halo: dark ? 'rgba(6, 10, 22, 0.88)' : 'rgba(255, 255, 255, 0.92)',
      gold: dark ? '#ffe042' : '#d98600',
      goldBright: '#ffd83b',
      cyan: dark ? '#00f5ff' : '#0092d6',
      magenta: dark ? '#ff38b8' : '#d81b7a',
      lime: dark ? '#48ff7b' : '#24a844'
    };
  }

  function drawTextHalo(c, text, x, y, size, fill, stroke, lineW, align, fontFamily) {
    c.save();
    c.font = 'bold ' + Math.round(size) + 'px ' + (fontFamily || 'Tahoma, "Microsoft YaHei", sans-serif');
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    if (stroke && lineW > 0) {
      c.lineJoin = 'round';
      c.lineWidth = lineW;
      c.strokeStyle = stroke;
      c.strokeText(text, x, y);
    }
    c.fillStyle = fill;
    c.fillText(text, x, y);
    c.restore();
  }

  function drawStyledNote(c, roll, n, nx, ny, nw, nh, T, opts) {
    opts = opts || {};
    var themeId = roll.theme || NSG.theme || 'aero';
    var noteStyle = T.noteStyle || themeId || 'aero';
    var selected = !!roll.sel[n.id];
    var gradStops = opts.gradStops || (selected ? T.noteSelGrad : T.noteGrad);
    var strokeCol = opts.stroke || (selected ? T.noteSelStroke : T.noteStroke);
    var radius = opts.radius !== undefined ? opts.radius : (T.noteRadius || 0);

    var grd = fillStops(c.createLinearGradient(0, ny, 0, ny + nh), gradStops);
    c.fillStyle = opts.fillOverride || grd;
    roundRect(c, nx, ny, nw, nh, radius);
    c.fill();
    c.strokeStyle = strokeCol;
    c.lineWidth = opts.lineWidth || 1;
    c.stroke();

    if (!opts.skipDetail) {
      if (noteStyle === 'aero' || T.noteGloss) {
        c.fillStyle = 'rgba(255,255,255,0.48)';
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 2), Math.max(2, nh * 0.44 - 1));
        c.fillStyle = 'rgba(255,255,255,0.88)';
        c.fillRect(nx + 2, ny + 1, Math.max(0, nw - 4), 1.4);
      } else if (noteStyle === '9x') {
        c.fillStyle = selected ? T.noteSelEdge : T.noteEdge;
        c.fillRect(nx + 0.5, ny + 0.5, Math.max(0, nw - 1), 1);
        c.fillRect(nx + 0.5, ny + 0.5, 1, Math.max(0, nh - 1));
      } else if (noteStyle === 'pixel') {
        c.fillStyle = selected ? T.noteSelEdge : T.noteEdge;
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 3), 1);
        c.fillRect(nx + 1, ny + 1, 1, Math.max(0, nh - 3));
      } else if (noteStyle === 'cyberpunk') {
        c.fillStyle = selected ? (T.noteSelNeonBar || T.noteSelEdge) : (T.noteNeonBar || T.noteEdge);
        c.fillRect(nx + 1.5, ny + 1, Math.max(0, nw - 3), 1.5);
      } else if (noteStyle === 'xp') {
        c.fillStyle = selected ? T.noteSelEdge : T.noteEdge;
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 2), 1);
      }
    }

    if (!opts.hideLyric && nw > 14) {
      c.save();
      c.beginPath(); c.rect(nx + 2, ny, Math.max(0, nw - 4), nh); c.clip();
      c.fillStyle = opts.textColor || (selected ? T.noteSelText : T.noteText);
      c.font = Math.min(12, Math.max(8, nh - 3)) + 'px Tahoma, "Microsoft YaHei", sans-serif';
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      c.fillText(opts.lyricOverride !== undefined ? opts.lyricOverride : cleanLyric(n), nx + 4, ny + nh - 3);
      c.restore();
    }
  }

  function drawMiniEye(c, x, y, rx, ry, lookX, lookY, irisCol, scleraCol, pupilCol, outlineCol, openAmt) {
    openAmt = clamp(openAmt === undefined ? 1 : openAmt, 0.06, 1.15);
    var ery = ry * openAmt;
    c.save();
    c.beginPath();
    c.moveTo(x - rx, y);
    c.quadraticCurveTo(x, y - ery * 1.45, x + rx, y);
    c.quadraticCurveTo(x, y + ery * 1.45, x - rx, y);
    c.closePath();
    c.fillStyle = scleraCol || '#ffffff';
    c.fill();
    c.save();
    c.clip();
    var ang = Math.atan2(lookY - y, lookX - x);
    var dist = Math.min(rx * 0.32, Math.hypot(lookX - x, lookY - y) * 0.04);
    var ix = x + Math.cos(ang) * dist;
    var iy = y + Math.sin(ang) * dist * 0.72;
    var ir = Math.min(rx, ry) * 0.56;
    c.fillStyle = irisCol || '#ff3b9a';
    c.beginPath(); c.arc(ix, iy, ir, 0, Math.PI * 2); c.fill();
    c.fillStyle = pupilCol || '#090915';
    c.beginPath(); c.arc(ix, iy, ir * 0.48, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(ix - ir * 0.28, iy - ir * 0.28, Math.max(1, ir * 0.22), 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = outlineCol || '#111111';
    c.lineWidth = Math.max(1, rx * 0.12);
    c.stroke();
    c.restore();
  }

  function drawStar(c, x, y, spikes, outerR, innerR, rot) {
    c.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var r = (i & 1) ? innerR : outerR;
      var a = (rot || 0) + (i * Math.PI) / spikes;
      var px = x + Math.cos(a) * r;
      var py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  /* 从 PianoRoll 安全采样实时 PIT 曲线与控制点 */
  function samplePitchY(roll, n, rel, nInfo) {
    var baseY = roll.rowY(n.pitch) + roll.rowH / 2;
    if (!nInfo || !NSG.TUNING || !NSG.TUNING.hasPitch(n)) return baseY;
    try {
      var cents = roll._centsAt(n, clamp(rel, 0, 1), nInfo, !!roll.showVibrato);
      return baseY - (cents / 100) * roll.rowH;
    } catch (e) {
      return baseY;
    }
  }

  function samplePitchCurve(roll, n, nInfo, rel0, rel1, steps) {
    var pts = [];
    var x0 = roll.beatX(n.start), wd = Math.max(6, n.dur * roll.pxBeat);
    steps = Math.max(4, steps || 24);
    for (var i = 0; i <= steps; i++) {
      var rel = rel0 + (rel1 - rel0) * (i / steps);
      pts.push({
        rel: rel,
        x: x0 + rel * wd,
        y: samplePitchY(roll, n, rel, nInfo)
      });
    }
    return pts;
  }

  function getControlPoints(roll, n, nInfo) {
    if (!nInfo || !nInfo.points || !roll._hasVisibleControlPoints || !roll._hasVisibleControlPoints(n)) return [];
    var x0 = roll.beatX(n.start);
    var baseY = roll.rowY(n.pitch) + roll.rowH / 2;
    var out = [];
    for (var i = 0; i < nInfo.points.length; i++) {
      var pt = nInfo.points[i];
      out.push({
        idx: i,
        beat: n.start + pt[0],
        x: x0 + pt[0] * roll.pxBeat,
        y: baseY - (pt[1] / 100) * roll.rowH,
        cents: pt[1]
      });
    }
    return out;
  }

  /* 文案池（中 / 英 / 日） */
  var ESCAPE_LINES = {
    zh: ['别碰我!!', '救命!!', '走开啦!', '不要唱我!', '跑啊!!', '快逃!!', '我音不准别唱!'],
    en: ['DONT TOUCH!', 'HELP!!', 'NOPE!!', 'RUN!!', 'WAIT NO!', 'TOO HIGH!!'],
    ja: ['触るな!!', '逃げる!!', '助けて!!', '待って!!', '高すぎ!!', 'やめて!!']
  };
  var DANMAKU_POOL = {
    zh: ['好听！！', '神调教', '这PIT太丝滑了', '高能预警', '8888888', '？？？', '耳朵怀孕了', '草', '前方高音', '声带起飞', '太强了', '莫名其妙但好爽'],
    en: ['SO SMOOTH!!', 'GOD TIER TUNING', '8888888', 'WHAT IS THIS?!', 'HIGH NOTE!!', 'CLEAN PIT!', 'LOL', 'VIBRATO GO BRRR', 'PEAK'],
    ja: ['神調教！！', 'PIT滑らかすぎ', '8888888', '？？？', '高音注意', '草', '良すぎ', '謎演出w', 'うおおお']
  };
  var GLITCH_WORDS = ['0xDEAD', 'ERR_PIT', 'NaN Hz', '锟斤拷', 'NULL', '0x48K', 'SEGFAULT', '???', '燙燙燙', 'BUFFER'];
  var CRIT_LABELS = {
    zh: ['暴击!', '调教暴击!', '会心一击!', '超高音!', 'PERFECT!'],
    en: ['CRIT!', 'PITCH CRIT!', 'SUPER EFFECTIVE!', 'PERFECT!'],
    ja: ['会心!', '調教必殺!', '超絶技巧!', 'PERFECT!']
  };

  /* ========================================================================
   * 14 种模式定义
   * 4 种正常/晒调教模式 (showcase: true) + 10 种莫名其妙×120模式
   * ======================================================================== */
  var MODES = [
    /* --- A. 适合晒调教（4种） --- */
    {
      id: 'karaokeGlow',
      showcase: true,
      usesPit: true,
      linger: 0.75,
      nameKey: 'eye.mode.karaokeGlow',
      fallbackName: '极光卡拉OK',
      eyeColor: { iris: '#00d4ff', ring: '#ffe45e', pupil: '#062642' },
      onEnterNote: function (fx, n, st, geo, T, A) {
        var cnt = A.isPixel ? 6 : 10;
        for (var i = 0; i < cnt; i++) {
          var ang = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
          var spd = 28 + Math.random() * 68;
          fx.spawn({
            kind: 'spark',
            x: geo.x + 2,
            y: geo.y + Math.random() * geo.h,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 15,
            r: 1.8 + Math.random() * 2.4,
            color: i % 2 ? A.cyan : A.goldBright,
            life: 0.45 + Math.random() * 0.35
          });
        }
      },
      onControlPoint: function (fx, n, cp, T, A) {
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 4, maxR: 26, color: A.ctrl, lineW: 2.2, life: 0.55 });
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
          fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: Math.cos(a) * 48, vy: Math.sin(a) * 48, r: 2, color: A.ctrl, life: 0.42 });
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo, alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;
          var sweepW = g.w * prog;
          c.save();
          // 柔和发光外晕
          c.globalAlpha = alpha * (A.isDark ? 0.5 : 0.32);
          c.shadowColor = A.cyan;
          c.shadowBlur = A.isPixel ? 0 : 14;
          c.strokeStyle = A.cyan;
          c.lineWidth = 2.5;
          roundRect(c, g.x - 1, g.y - 1, g.w + 2, g.h + 2, (T.noteRadius || 0) + 1);
          c.stroke();
          c.shadowBlur = 0;

          // 卡拉OK进度扫光填充
          c.globalAlpha = alpha * (A.isDark ? 0.52 : 0.42);
          c.beginPath();
          roundRect(c, g.x, g.y, g.w, g.h, T.noteRadius || 0);
          c.clip();
          var sg = c.createLinearGradient(g.x, g.y, g.x + Math.max(12, sweepW), g.y + g.h);
          sg.addColorStop(0, A.cyan);
          sg.addColorStop(0.55, A.goldBright);
          sg.addColorStop(1, A.magenta);
          c.fillStyle = sg;
          c.fillRect(g.x, g.y, sweepW, g.h);

          // 扫光亮边
          if (it.active && sweepW > 1) {
            var edgeX = g.x + sweepW;
            var beam = c.createLinearGradient(edgeX - 10, 0, edgeX + 4, 0);
            beam.addColorStop(0, 'rgba(255,255,255,0)');
            beam.addColorStop(0.75, 'rgba(255,255,255,0.92)');
            beam.addColorStop(1, 'rgba(255,255,255,0)');
            c.globalAlpha = alpha;
            c.fillStyle = beam;
            c.fillRect(edgeX - 10, g.y, 14, g.h);
          }
          c.restore();

          // 高亮 PIT 彗星尾（到播放头位置）
          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(10, Math.ceil(sweepW / 3)));
            if (curve.length > 1) {
              c.save();
              c.globalAlpha = alpha;
              c.lineCap = 'round'; c.lineJoin = 'round';
              c.strokeStyle = colorAlpha(A.cyan, A.isDark ? 0.55 : 0.42);
              c.lineWidth = 6.5;
              c.beginPath();
              for (var k = 0; k < curve.length; k++) { if (!k) c.moveTo(curve[k].x, curve[k].y); else c.lineTo(curve[k].x, curve[k].y); }
              c.stroke();
              c.strokeStyle = A.goldBright;
              c.lineWidth = 2.4;
              c.stroke();
              if (it.active) {
                var tip = curve[curve.length - 1];
                c.fillStyle = '#ffffff';
                c.shadowColor = A.goldBright; c.shadowBlur = A.isPixel ? 0 : 12;
                c.beginPath(); c.arc(tip.x, tip.y, 4.2, 0, Math.PI * 2); c.fill();
                c.shadowBlur = 0;
              }
              c.restore();
            }
          }
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) continue;
          var lyr = cleanLyric(it.n);
          var pop = 1 + 0.16 * Math.exp(-it.age * 7) * Math.sin(it.age * 18);
          var fsz = clamp(roll.rowH * 0.92, 13, 22) * pop;
          var tx = clamp(g.x + g.w * 0.5, roll.kbW + 24, roll.w - 24);
          var ty = Math.max(roll.rulerH + 14, g.y - 13);
          c.save();
          c.font = 'bold ' + Math.round(fsz) + 'px Tahoma, "Microsoft YaHei", sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          var tw = c.measureText(lyr).width;
          // 底层未唱色
          c.lineWidth = 3.5; c.lineJoin = 'round';
          c.strokeStyle = A.halo;
          c.strokeText(lyr, tx, ty);
          c.fillStyle = A.isDark ? 'rgba(255,255,255,0.68)' : 'rgba(32,68,98,0.65)';
          c.fillText(lyr, tx, ty);
          // 已唱双色裁剪扫过
          c.beginPath();
          c.rect(tx - tw / 2 - 4, ty - fsz, (tw + 8) * clamp(it.rel, 0, 1), fsz * 2);
          c.clip();
          var kg = c.createLinearGradient(tx - tw / 2, ty - fsz / 2, tx + tw / 2, ty + fsz / 2);
          kg.addColorStop(0, A.goldBright);
          kg.addColorStop(0.55, A.cyan);
          kg.addColorStop(1, A.magenta);
          c.fillStyle = kg;
          c.fillText(lyr, tx, ty);
          c.restore();
        }
      }
    },

    {
      id: 'pianoRibbon',
      showcase: true,
      usesPit: true,
      linger: 0.9,
      nameKey: 'eye.mode.pianoRibbon',
      fallbackName: '丝绸星轨',
      eyeColor: { iris: '#18e09b', ring: '#b8fff0', pupil: '#053022' },
      onControlPoint: function (fx, n, cp, T, A) {
        var glyphs = ['♪', '♫', '✦', '✧'];
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 3, maxR: 22, color: A.vib, lineW: 1.8, life: 0.55 });
        for (var i = 0; i < 3; i++) {
          fx.spawn({
            kind: 'glyph',
            text: glyphs[(cp.idx + i) % glyphs.length],
            x: cp.x + (Math.random() - 0.5) * 8,
            y: cp.y,
            vx: (Math.random() - 0.5) * 28,
            vy: -32 - Math.random() * 34,
            size: 11 + Math.random() * 5,
            color: i % 2 ? A.vib : A.cyan,
            life: 0.85 + Math.random() * 0.35
          });
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var relMotion = !!(roll && roll.relativeMotion);
        var maxTrail = relMotion ? 180 : 72;
        // 呼吸音符柔光边框
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var pulse = 0.72 + 0.28 * Math.sin(fx.elapsed * 9 + it.st.seed * 6);
          c.save();
          c.globalAlpha = alpha * 0.75 * pulse;
          c.strokeStyle = A.vib;
          c.lineWidth = 2.2;
          roundRect(c, g.x - 1.5, g.y - 1.5, g.w + 3, g.h + 3, (T.noteRadius || 0) + 2);
          c.stroke();
          c.fillStyle = colorAlpha(A.vib, A.isDark ? 0.22 : 0.16);
          c.fill();
          c.restore();

          // 追踪 PIT 丝绸轨迹点
          if (it.active && it.nInfo) {
            var py = samplePitchY(roll, it.n, it.rel, it.nInfo);
            var pyPrev = samplePitchY(roll, it.n, Math.max(0, it.rel - 0.03), it.nInfo);
            var slope = Math.abs(py - pyPrev);
            var px = roll.beatX(roll.playPos);
            if (!fx.trail.length || Math.hypot(px - fx.trail[fx.trail.length - 1].x, py - fx.trail[fx.trail.length - 1].y) > 1.5) {
              fx.trail.push({ x: px, y: py, w: clamp(3 + slope * 0.65, 3, 14), t: fx.elapsed });
              if (fx.trail.length > maxTrail) fx.trail.shift();
            }
            if (Math.random() < 0.38) {
              fx.spawn({
                kind: 'spark',
                x: px, y: py,
                vx: -18 - Math.random() * 35,
                vy: (Math.random() - 0.5) * 32,
                r: 1.5 + Math.random() * 2.1,
                color: Math.random() < 0.5 ? A.vib : A.cyan,
                life: 0.45 + Math.random() * 0.3
              });
            }
          }
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var relMotion = !!(roll && roll.relativeMotion);
        var trailLife = relMotion ? 3.2 : 1.25;
        // 清理过旧尾迹
        while (fx.trail.length && (fx.elapsed - fx.trail[0].t > trailLife || (relMotion && fx.trail.length > 2 && fx.trail[0].x < roll.kbW - 40 && fx.trail[1].x < roll.kbW - 40))) fx.trail.shift();
        if (fx.trail.length < 2) return;
        c.save();
        c.lineCap = 'round';
        c.lineJoin = 'round';
        for (var i = 1; i < fx.trail.length; i++) {
          var p0 = fx.trail[i - 1], p1 = fx.trail[i];
          if (Math.abs(p1.x - p0.x) > 80) continue; // 跳过寻道跳跃
          var age = clamp(1 - (fx.elapsed - p1.t) / trailLife, 0, 1);
          var ratio = i / fx.trail.length;
          c.globalAlpha = age * ratio * (A.isDark ? 0.55 : 0.42);
          c.strokeStyle = A.cyan;
          c.lineWidth = p1.w * 2.1 * ratio;
          c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();

          c.globalAlpha = age * ratio * 0.92;
          c.strokeStyle = i % 2 ? A.vib : '#ffffff';
          c.lineWidth = Math.max(1.4, p1.w * 0.55 * ratio);
          c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
        }
        var head = fx.trail[fx.trail.length - 1];
        if (fx.elapsed - head.t < 0.25) {
          c.globalAlpha = 1;
          c.fillStyle = '#ffffff';
          c.shadowColor = A.cyan; c.shadowBlur = A.isPixel ? 0 : 14;
          drawStar(c, head.x, head.y, 4, 8.5, 3, fx.elapsed * 3.2);
          c.fill();
          c.shadowBlur = 0;
        }
        c.restore();
      }
    },

    {
      id: 'prismWave',
      showcase: true,
      usesPit: true,
      linger: 0.55,
      nameKey: 'eye.mode.prismWave',
      fallbackName: '声波棱镜',
      eyeColor: { iris: '#5b7cff', ring: '#ff66d9', pupil: '#10144a' },
      renderUnder: function (fx, c, roll, T, A, items) {
        var gridH = roll.gridBottom();
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var velFactor = clamp((it.n.vel || 96) / 110, 0.35, 1.2);
          var px = roll.beatX(roll.playPos);
          var liveY = it.nInfo ? samplePitchY(roll, it.n, clamp(it.rel, 0, 1), it.nInfo) : (g.y + g.h / 2);

          c.save();
          // 棱镜纵向光柱（从实时音高点向上下扩散）
          if (it.active && px >= roll.kbW && px <= roll.w) {
            var beamH = Math.max(60, roll.rowH * 5);
            var bg = c.createLinearGradient(0, liveY - beamH, 0, liveY + beamH);
            bg.addColorStop(0, colorAlpha(A.cyan, 0));
            bg.addColorStop(0.5, colorAlpha(A.cyan, A.isDark ? 0.34 : 0.24));
            bg.addColorStop(1, colorAlpha(A.magenta, 0));
            c.fillStyle = bg;
            c.fillRect(px - 10, Math.max(roll.rulerH, liveY - beamH), 20, Math.min(gridH, liveY + beamH) - Math.max(roll.rulerH, liveY - beamH));
          }

          // 音符内部的实时谐波频谱柱
          c.globalAlpha = alpha;
          c.beginPath(); roundRect(c, g.x + 1, g.y + 1, Math.max(2, g.w - 2), Math.max(2, g.h - 2), T.noteRadius || 0); c.clip();
          var barW = A.isPixel ? 4 : 3.5;
          var gap = 2;
          var count = Math.max(2, Math.floor((g.w - 4) / (barW + gap)));
          for (var b = 0; b < count; b++) {
            var u = (b + 0.5) / count;
            var dist = Math.abs(u - clamp(it.rel, 0, 1));
            var env = Math.exp(-dist * 3.8) * 0.8 + 0.25;
            var wave = 0.5 + 0.5 * Math.sin(fx.elapsed * 14 + b * 0.9 + it.n.pitch * 0.4);
            var bh = Math.max(2, (g.h - 3) * clamp(wave * env * velFactor, 0.12, 0.96));
            var bx = g.x + 2 + b * (barW + gap);
            c.fillStyle = (b % 3 === 0) ? colorAlpha(A.cyan, 0.72) : (b % 3 === 1 ? colorAlpha(A.magenta, 0.65) : colorAlpha(A.goldBright, 0.7));
            c.fillRect(bx, g.y + g.h - 1 - bh, barW, bh);
          }
          c.restore();

          // 轻度棱镜色散边框
          c.save();
          c.globalAlpha = alpha * 0.72;
          c.strokeStyle = A.cyan; c.lineWidth = 1.4;
          roundRect(c, g.x - 2, g.y - 1, g.w + 2, g.h + 2, T.noteRadius || 0); c.stroke();
          c.strokeStyle = A.magenta;
          roundRect(c, g.x + 1, g.y + 1, g.w + 1, g.h, T.noteRadius || 0); c.stroke();
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) continue;
          var lyr = cleanLyric(it.n);
          var tx = clamp(g.x + g.w * 0.5, roll.kbW + 24, roll.w - 24);
          var ty = Math.max(roll.rulerH + 13, g.y - 12);
          var fsz = clamp(roll.rowH * 0.86, 12, 19);
          drawTextHalo(c, lyr, tx - 1.2, ty, fsz, colorAlpha(A.cyan, 0.65), null, 0);
          drawTextHalo(c, lyr, tx + 1.2, ty, fsz, colorAlpha(A.magenta, 0.65), null, 0);
          drawTextHalo(c, lyr, tx, ty, fsz, A.isDark ? '#ffffff' : A.ink, A.halo, 3);
        }
      }
    },

    {
      id: 'inkCalligraphy',
      showcase: true,
      usesPit: true,
      linger: 1.0,
      nameKey: 'eye.mode.inkCalligraphy',
      fallbackName: '水墨流韵',
      eyeColor: { iris: '#c9972c', ring: '#fff2cc', pupil: '#1c1812' },
      onEnterNote: function (fx, n, st, geo, T, A) {
        fx.spawn({
          kind: 'ring',
          x: geo.x + Math.min(geo.w * 0.3, 18),
          y: geo.y + geo.h / 2,
          r: 4,
          maxR: Math.max(26, geo.h * 1.9),
          color: A.isDark ? '#e6c57a' : '#253545',
          lineW: 2.6,
          life: 0.72
        });
      },
      onControlPoint: function (fx, n, cp, T, A) {
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 3, maxR: 17, color: '#c83e3b', lineW: 2.0, life: 0.8 });
        fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: 0, vy: -12, r: 2.6, color: '#e6b84c', life: 0.65 });
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var inkCol = A.isDark ? '#f2e6c8' : '#1b2632';
        var goldCol = A.isDark ? '#ffd978' : '#b87d14';
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;

          // 水墨晕染底座 + 金箔描边
          c.save();
          c.globalAlpha = alpha * (A.isDark ? 0.28 : 0.16);
          var rg = c.createRadialGradient(g.x + g.w * prog, g.y + g.h / 2, 2, g.x + g.w * prog, g.y + g.h / 2, Math.max(28, g.w * 0.55));
          rg.addColorStop(0, inkCol);
          rg.addColorStop(1, colorAlpha(inkCol, 0));
          c.fillStyle = rg;
          c.fillRect(g.x - 24, g.y - 24, g.w + 48, g.h + 48);

          c.globalAlpha = alpha * 0.85;
          c.strokeStyle = goldCol;
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(g.x, g.y);
          c.lineTo(g.x + g.w * prog, g.y);
          c.moveTo(g.x, g.y + g.h);
          c.lineTo(g.x + g.w * prog, g.y + g.h);
          c.stroke();

          // 粗细随滑音速度变化的毛笔 PIT 墨线
          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(12, Math.ceil(g.w * prog / 4)));
            c.lineCap = 'round';
            for (var k = 1; k < curve.length; k++) {
              var dx = curve[k].x - curve[k - 1].x;
              var dy = curve[k].y - curve[k - 1].y;
              var speed = Math.abs(dy) / Math.max(0.5, dx);
              var lw = clamp(5.8 - speed * 2.2, 1.4, 5.8);
              c.strokeStyle = inkCol;
              c.lineWidth = lw;
              c.beginPath();
              c.moveTo(curve[k - 1].x, curve[k - 1].y);
              c.lineTo(curve[k].x, curve[k].y);
              c.stroke();
            }
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var inkCol = A.isDark ? '#fff5dc' : '#1c2630';
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var txtFade = it.relMotion ? 1.5 : 0.8;
          var alpha = it.active ? clamp(it.age * 4, 0, 1) : clamp(1 - it.exitAge / txtFade, 0, 1);
          if (alpha <= 0) continue;
          var rise = it.active ? Math.min(10, it.age * 14) : 10 + it.exitAge * 16;
          var tx = clamp(g.x + g.w * 0.5, roll.kbW + 24, roll.w - 24);
          var ty = Math.max(roll.rulerH + 14, g.y - 8 - rise);
          c.save();
          c.globalAlpha = alpha;
          drawTextHalo(c, cleanLyric(it.n), tx, ty, clamp(roll.rowH * 0.95, 14, 22), inkCol, A.halo, 3.2, 'center', '"KaiTi", "STKaiti", "Yu Mincho", Georgia, serif');
          c.restore();
        }
      }
    },

    /* --- B. 莫名其妙程度×120（10种） --- */
    {
      id: 'escapeLegs',
      showcase: false,
      usesPit: false,
      linger: 0.7,
      nameKey: 'eye.mode.escapeLegs',
      fallbackName: '长腿逃跑',
      eyeColor: { iris: '#ff6b2b', ring: '#ffe082', pupil: '#3d0e00' },
      onEnterNote: function (fx, n, st, geo) {
        var pool = ESCAPE_LINES[langCode()] || ESCAPE_LINES.zh;
        st.shout = (Math.random() < 0.45) ? (cleanLyric(n) + '!!') : pool[Math.floor(Math.random() * pool.length)];
        st.dir = Math.random() < 0.5 ? 1 : -1;
      },
      onControlPoint: function (fx, n, cp, T, A) {
        // 控制点长出翅膀扑棱飞走！
        fx.spawn({
          kind: 'moth',
          x: cp.x, y: cp.y,
          vx: (Math.random() - 0.5) * 90,
          vy: -55 - Math.random() * 55,
          color: A.ctrl,
          phase: Math.random() * 6,
          life: 1.25
        });
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        // 先擦掉原位，让音符真的“长腿逃离”格子！
        for (var i = 0; i < items.length; i++) {
          var g = items[i].geo;
          roll._paintGridPatch(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, T);
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo, st = it.st;
          var panic = it.active ? clamp(it.age * 5, 0, 1) : it.exitAlpha;
          var t = it.active ? it.age : (0.7 * it.exitAlpha + (it.relMotion ? Math.min(0.6, it.exitAge * 0.4) : 0));
          var runPhase = fx.elapsed * 26 + st.seed * 10;
          var hopY = -Math.abs(Math.sin(runPhase * 0.5)) * (14 + roll.rowH * 0.65) * panic;
          var fleeX = Math.sin(runPhase * 0.32) * 20 * panic + (st.dir || 1) * Math.min(28, t * 34) * panic;
          var tilt = Math.sin(runPhase * 0.5) * 0.2 * panic;

          var cx = g.x + g.w / 2 + fleeX;
          var cy = g.y + g.h / 2 + hopY;

          c.save();
          c.translate(cx, cy);
          c.rotate(tilt);

          // 狂奔的小火柴腿
          var legL = Math.max(10, g.h * 0.62);
          var swing = Math.sin(runPhase) * 9;
          c.strokeStyle = A.ink;
          c.lineWidth = 2.2;
          c.lineCap = 'round';
          c.beginPath();
          // 左腿
          c.moveTo(-Math.min(g.w * 0.25, 10), g.h / 2 - 1);
          c.lineTo(-Math.min(g.w * 0.25, 10) + swing, g.h / 2 + legL);
          c.lineTo(-Math.min(g.w * 0.25, 10) + swing + 4 * (st.dir || 1), g.h / 2 + legL);
          // 右腿
          c.moveTo(Math.min(g.w * 0.25, 10), g.h / 2 - 1);
          c.lineTo(Math.min(g.w * 0.25, 10) - swing, g.h / 2 + legL);
          c.lineTo(Math.min(g.w * 0.25, 10) - swing + 4 * (st.dir || 1), g.h / 2 + legL);
          // 慌张乱挥的小手臂
          c.moveTo(-g.w / 2 + 1, 0);
          c.lineTo(-g.w / 2 - 8, -7 + Math.cos(runPhase) * 6);
          c.moveTo(g.w / 2 - 1, 0);
          c.lineTo(g.w / 2 + 8, -7 - Math.cos(runPhase) * 6);
          c.stroke();

          // 音符本体
          drawStyledNote(c, roll, it.n, -g.w / 2, -g.h / 2, g.w, g.h, T);

          // 惊恐大眼 O_O
          var eyeR = clamp(g.h * 0.26, 3.5, 6.5);
          var px = roll.beatX(roll.playPos);
          drawMiniEye(c, -eyeR * 1.25, -g.h * 0.1, eyeR, eyeR * 1.15, px - cx, 0, '#ffffff', '#ffffff', '#111111', '#111111', 1.1);
          drawMiniEye(c, eyeR * 1.25, -g.h * 0.1, eyeR, eyeR * 1.15, px - cx, 0, '#ffffff', '#ffffff', '#111111', '#111111', 1.1);

          // 狂飙汗滴
          if (it.active || (it.relMotion && it.exitAlpha > 0.5)) {
            c.fillStyle = '#4ad8ff';
            var dropY = ((fx.elapsed * 28) % 10);
            c.beginPath();
            c.arc(g.w / 2 + 5, -g.h / 2 - 3 + dropY, 2.3, 0, Math.PI * 2);
            c.fill();
          }
          c.restore();

          // 尖叫气泡
          if (it.active && st.shout) {
            var bx = clamp(cx, roll.kbW + 38, roll.w - 38);
            var by = Math.max(roll.rulerH + 16, cy - g.h / 2 - 16);
            c.save();
            c.font = 'bold 11px Tahoma, "Microsoft YaHei", sans-serif';
            var bw = c.measureText(st.shout).width + 12;
            c.fillStyle = A.isDark ? '#1a1030' : '#ffffff';
            c.strokeStyle = A.primary;
            c.lineWidth = 1.6;
            roundRect(c, bx - bw / 2, by - 9, bw, 18, 6);
            c.fill(); c.stroke();
            c.fillStyle = A.isDark ? '#fff280' : '#c02210';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(st.shout, bx, by + 0.5);
            c.restore();
          }
        }
      }
    },

    {
      id: 'nuclearKaraoke',
      showcase: false,
      usesPit: false,
      linger: 0.75,
      nameKey: 'eye.mode.nuclearKaraoke',
      fallbackName: '2003土味KTV',
      eyeColor: { iris: '#ff1493', ring: '#ffee00', pupil: '#3b0030' },
      onEnterNote: function (fx, n, st, geo) {
        // 砸扁音符时的炫彩五角星爆炸！
        var cols = ['#ff0080', '#ffee00', '#00f0ff', '#55ff00', '#ff6600'];
        for (var i = 0; i < 14; i++) {
          var a = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
          var sp = 55 + Math.random() * 90;
          fx.spawn({
            kind: 'star',
            x: geo.x + geo.w * 0.3,
            y: geo.y + geo.h / 2,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 25,
            r: 4 + Math.random() * 4.5,
            rot: Math.random() * 6,
            vrot: (Math.random() - 0.5) * 14,
            color: cols[i % cols.length],
            life: 0.65 + Math.random() * 0.35
          });
        }
        fx.spawn({ kind: 'ring', x: geo.x + geo.w * 0.3, y: geo.y + geo.h / 2, r: 5, maxR: 56, color: '#ffea00', lineW: 3.5, life: 0.48 });
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var gridH = roll.gridBottom();
        // 如果有任何激活音符，从卷帘四角打出土味迪厅霓虹光柱！
        var hasActive = false;
        for (var j = 0; j < items.length; j++) if (items[j].active) { hasActive = true; break; }
        if (hasActive) {
          c.save();
          var sw1 = Math.sin(fx.elapsed * 3.8) * 140;
          var sw2 = Math.cos(fx.elapsed * 4.3) * 140;
          var beams = [
            { ox: roll.kbW, oy: roll.rulerH, tx: roll.kbW + (roll.w - roll.kbW) * 0.45 + sw1, col: 'rgba(255, 0, 170, 0.16)' },
            { ox: roll.w, oy: roll.rulerH, tx: roll.kbW + (roll.w - roll.kbW) * 0.55 + sw2, col: 'rgba(0, 235, 255, 0.16)' },
            { ox: (roll.kbW + roll.w) * 0.5, oy: roll.rulerH, tx: (roll.kbW + roll.w) * 0.5 - sw1 * 0.8, col: 'rgba(255, 238, 0, 0.13)' }
          ];
          for (var bi = 0; bi < beams.length; bi++) {
            var bm = beams[bi];
            c.fillStyle = bm.col;
            c.beginPath();
            c.moveTo(bm.ox, bm.oy);
            c.lineTo(bm.tx - 55, gridH);
            c.lineTo(bm.tx + 55, gridH);
            c.closePath();
            c.fill();
          }
          c.restore();
        }
        // 擦除原音符以便绘制被重球砸扁弹跳的效果
        for (var i = 0; i < items.length; i++) {
          var g = items[i].geo;
          roll._paintGridPatch(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, T);
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          // 旋转金芒底盘
          var cx = g.x + g.w / 2, cy = g.y + g.h / 2;
          c.save();
          c.globalAlpha = alpha * 0.72;
          c.fillStyle = '#ffee00';
          drawStar(c, cx, cy, 12, Math.max(26, g.h * 1.9), Math.max(12, g.h * 0.9), fx.elapsed * 3.5);
          c.fill();
          c.strokeStyle = '#ff0088'; c.lineWidth = 1.6; c.stroke();
          c.restore();

          // 被卡拉OK弹球砸扁再弹起的音符
          var squash = it.active ? (1 - 0.55 * Math.exp(-it.age * 9) * Math.cos(it.age * 24)) : (it.relMotion ? (1 - 0.24 * it.exitAlpha) : 1);
          var sx = 1 / Math.max(0.55, squash);
          c.save();
          c.translate(cx, g.y + g.h);
          c.scale(sx, squash);
          drawStyledNote(c, roll, it.n, -g.w / 2, -g.h, g.w, g.h, T, {
            gradStops: ['#ff0088', '#ffae00', '#00e5ff'],
            stroke: '#ffee00',
            lineWidth: 2,
            hideLyric: true
          });
          c.restore();

          // 超大 3D 彩虹艺术字 WordArt 歌词！
          if (it.active) {
            var lyr = '>>> ' + cleanLyric(it.n) + ' <<<';
            var bounce = Math.abs(Math.sin(fx.elapsed * 11)) * 9;
            var fsz = clamp(roll.rowH * 1.35, 18, 30);
            var tx = clamp(cx, roll.kbW + 64, roll.w - 64);
            var ty = Math.max(roll.rulerH + 22, g.y - 22 - bounce);
            c.save();
            c.translate(tx, ty);
            c.rotate(Math.sin(fx.elapsed * 9) * 0.08);
            c.font = '900 ' + Math.round(fsz) + 'px Impact, "Microsoft YaHei", sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            // 3D 立体挤出阴影
            for (var d = 5; d >= 1; d--) {
              c.fillStyle = d > 2 ? '#5a0060' : '#ff0066';
              c.fillText(lyr, d * 1.1, d * 1.1);
            }
            var wg = c.createLinearGradient(-50, -fsz / 2, 50, fsz / 2);
            wg.addColorStop(0, '#ffff00');
            wg.addColorStop(0.35, '#00ffaa');
            wg.addColorStop(0.7, '#00d8ff');
            wg.addColorStop(1, '#ff48e8');
            c.lineWidth = 3; c.strokeStyle = '#ffffff';
            c.strokeText(lyr, 0, 0);
            c.fillStyle = wg;
            c.fillText(lyr, 0, 0);
            c.restore();

            // 巨型弹跳卡拉OK红金大球
            var ballX = g.x + g.w * clamp(it.rel, 0, 1);
            var ballBounce = Math.abs(Math.sin(it.rel * Math.PI * 3)) * 24;
            var ballY = g.y - 8 - ballBounce;
            c.save();
            var bg2 = c.createRadialGradient(ballX - 3, ballY - 3, 1, ballX, ballY, 9);
            bg2.addColorStop(0, '#ffffff');
            bg2.addColorStop(0.35, '#ffea00');
            bg2.addColorStop(1, '#ff0055');
            c.fillStyle = bg2;
            c.beginPath(); c.arc(ballX, ballY, 8.5, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#ffffff'; c.lineWidth = 1.4; c.stroke();
            c.restore();
          }
        }
      }
    },

    {
      id: 'ufoAbduction',
      showcase: false,
      usesPit: false,
      linger: 0.85,
      nameKey: 'eye.mode.ufoAbduction',
      fallbackName: '外星人绑架',
      eyeColor: { iris: '#39ff14', ring: '#c8ff80', pupil: '#082900' },
      onControlPoint: function (fx, n, cp) {
        fx.spawn({
          kind: 'glyph',
          text: Math.random() < 0.5 ? '🐄' : '👽',
          x: cp.x, y: cp.y,
          vx: (Math.random() - 0.5) * 18,
          vy: -78 - Math.random() * 35,
          size: 13,
          color: '#72ff9a',
          life: 0.9
        });
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var g = items[i].geo;
          roll._paintGridPatch(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, T);
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var px = roll.beatX(roll.playPos);
        var activeOne = null;
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (it.active) activeOne = it;
          var lift = it.active ? clamp(it.rel * 1.15, 0.1, 1) : 0;
          if (it.active) it.st.lastLift = lift;
          var fallT = (!it.active && it.relMotion) ? clamp(1 - it.exitAge / 0.28, 0, 1) : 0;
          var residualLift = fallT * fallT * (it.st.lastLift || 0.7);
          var landAge = (!it.active && it.relMotion) ? Math.max(0, it.exitAge - 0.28) : it.exitAge;
          var dropBounce = !it.active ? Math.abs(Math.sin(landAge * 14)) * Math.exp(-landAge * 5) * 18 * (fallT > 0 ? 0 : 1) : 0;
          var ufoY = Math.max(roll.rulerH + 20, g.y - 54);
          var noteLiftY = it.active
            ? (g.y - (g.y - ufoY - 14) * lift * 0.72)
            : (g.y - (g.y - ufoY - 14) * residualLift * 0.72 - dropBounce);

          // 绿色外星牵引光束锥
          if (it.active) {
            c.save();
            var beamWTop = 14, beamWBot = Math.max(g.w * 0.75, 42);
            var beamX = g.x + g.w / 2;
            var bg = c.createLinearGradient(0, ufoY + 6, 0, g.y + g.h + 12);
            bg.addColorStop(0, 'rgba(72, 255, 138, 0.55)');
            bg.addColorStop(0.7, 'rgba(54, 238, 195, 0.24)');
            bg.addColorStop(1, 'rgba(72, 255, 138, 0.04)');
            c.fillStyle = bg;
            c.beginPath();
            c.moveTo(beamX - beamWTop, ufoY + 6);
            c.lineTo(beamX + beamWTop, ufoY + 6);
            c.lineTo(beamX + beamWBot, g.y + g.h + 10);
            c.lineTo(beamX - beamWBot, g.y + g.h + 10);
            c.closePath();
            c.fill();
            // 光束内上升扫描环
            for (var r = 0; r < 3; r++) {
              var u = 1 - ((fx.elapsed * 1.5 + r / 3) % 1);
              var ry = ufoY + 10 + (g.y + g.h - ufoY) * u;
              var rw = beamWTop + (beamWBot - beamWTop) * u;
              c.strokeStyle = 'rgba(180, 255, 200, ' + (0.65 * (1 - Math.abs(u - 0.5) * 1.6)).toFixed(2) + ')';
              c.lineWidth = 1.5;
              c.beginPath(); c.ellipse(beamX, ry, rw * 0.75, 4, 0, 0, Math.PI * 2); c.stroke();
            }
            c.restore();
          }

          // 被吸上天、无助翻滚拉长的音符
          c.save();
          var cx = g.x + g.w / 2 + (it.active ? Math.sin(fx.elapsed * 11 + it.st.seed * 6) * 5 : 0);
          var cy = noteLiftY + g.h / 2;
          c.translate(cx, cy);
          if (it.active) {
            c.rotate(Math.sin(fx.elapsed * 8 + it.st.seed * 5) * 0.28 * lift);
            c.scale(1 - lift * 0.22, 1 + lift * 0.45);
          } else {
            var daze = it.relMotion ? it.exitAlpha : 0;
            if (daze > 0) {
              var tiltDir = it.st.seed < 0.5 ? -1 : 1;
              c.rotate(tiltDir * 0.16 * daze * (1 - fallT) + Math.sin(fx.elapsed * 8 + it.st.seed * 5) * 0.24 * fallT);
            }
            var sq = 1 - 0.28 * Math.exp(-landAge * 7) * Math.cos(landAge * 22) - 0.18 * daze * (1 - fallT);
            sq = Math.max(0.58, sq);
            c.scale(1 / sq, sq);
          }
          drawStyledNote(c, roll, it.n, -g.w / 2, -g.h / 2, g.w, g.h, T);
          c.restore();

          if (it.active) {
            drawTextHalo(c, '???', cx + g.w * 0.35, cy - g.h * 0.9, 12, '#7dff9e', A.halo, 2.5);
          }
        }

        // 绘制飞碟（贴在当前被吸音符上方，或悬停在播放头上方）
        if (px >= roll.kbW && px <= roll.w) {
          var ux = activeOne ? (activeOne.geo.x + activeOne.geo.w / 2) : px;
          var uy = activeOne ? Math.max(roll.rulerH + 20, activeOne.geo.y - 54) : (roll.rulerH + 22);
          uy += Math.sin(fx.elapsed * 6) * 3.5;
          c.save();
          c.translate(ux, uy);
          c.rotate(Math.sin(fx.elapsed * 4) * 0.08);
          // 玻璃穹顶
          c.fillStyle = 'rgba(130, 255, 220, 0.78)';
          c.strokeStyle = '#185c48'; c.lineWidth = 1.4;
          c.beginPath(); c.arc(0, -3, 10, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
          // 飞碟金属盘
          var dg = c.createLinearGradient(-22, 0, 22, 0);
          dg.addColorStop(0, '#5a7284'); dg.addColorStop(0.5, '#e8f5ff'); dg.addColorStop(1, '#485e70');
          c.fillStyle = dg;
          c.beginPath(); c.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#1a2a38'; c.lineWidth = 1.4; c.stroke();
          // 跑马彩灯
          for (var li = -2; li <= 2; li++) {
            var on = Math.floor(fx.elapsed * 10 + li + 4) % 3 === 0;
            c.fillStyle = on ? '#6bff7c' : '#ff3ca6';
            c.beginPath(); c.arc(li * 7.5, 1, 2.1, 0, Math.PI * 2); c.fill();
          }
          c.restore();
        }
      }
    },

    {
      id: 'pitSnake',
      showcase: false,
      usesPit: true,
      linger: 0.85,
      nameKey: 'eye.mode.pitSnake',
      fallbackName: 'PIT贪吃蛇',
      eyeColor: { iris: '#84cc16', ring: '#ffeb3b', pupil: '#1a2e05' },
      onControlPoint: function (fx, n, cp) {
        fx.snakeChomp = 0.28;
        fx.spawn({ kind: 'glyph', text: '+100!', x: cp.x, y: cp.y - 6, vx: 0, vy: -42, size: 12, color: '#ffea00', life: 0.72 });
        for (var i = 0; i < 8; i++) {
          var a = Math.random() * Math.PI * 2;
          fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: Math.cos(a) * 65, vy: Math.sin(a) * 65, r: 2.5, color: i % 2 ? '#ff3b78' : '#72ff5c', life: 0.45 });
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        // 被贪吃蛇啃出咬痕的音符！
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var bites = Math.floor(clamp(it.active ? it.rel : 1, 0, 1) * 4);
          if (bites > 0) {
            for (var b = 0; b < bites; b++) {
              var bx = g.x + ((b + 0.5) / 4) * g.w;
              var by = g.y + ((b % 2) ? g.h : 0);
              var br = Math.min(8, g.h * 0.42);
              roll._paintGridPatch(c, bx - br, by - br, br * 2, br * 2, T);
            }
          }
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var px = roll.beatX(roll.playPos);
        var activeIt = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i].active) { activeIt = items[i]; break; }
        }
        var relMotion = !!(roll && roll.relativeMotion);
        var maxSnake = relMotion ? 64 : 42;
        var snakeLife = relMotion ? 3.2 : 1.8;
        if (activeIt && px >= roll.kbW && px <= roll.w) {
          var py = samplePitchY(roll, activeIt.n, clamp(activeIt.rel, 0, 1), activeIt.nInfo);
          if (!fx.trail.length || Math.hypot(px - fx.trail[fx.trail.length - 1].x, py - fx.trail[fx.trail.length - 1].y) > 2.5) {
            fx.trail.push({ x: px, y: py, t: fx.elapsed });
            if (fx.trail.length > maxSnake) fx.trail.shift();
          }
          if (Math.random() < 0.22) {
            fx.spawn({ kind: 'spark', x: px, y: py, vx: -25 - Math.random() * 45, vy: (Math.random() - 0.5) * 40, r: 2.2, color: A.noteSelStroke, life: 0.4 });
          }
        }
        while (fx.trail.length && (fx.elapsed - fx.trail[0].t > snakeLife || (relMotion && fx.trail.length > 2 && fx.trail[0].x < roll.kbW - 40 && fx.trail[1].x < roll.kbW - 40))) fx.trail.shift();
        if (fx.trail.length < 2) return;

        // 画一条色彩鲜明、圆滚滚扭动的 PIT 贪吃蛇身体
        c.save();
        for (var s = 0; s < fx.trail.length; s++) {
          var pt = fx.trail[s];
          var u = s / fx.trail.length;
          var wob = Math.sin(fx.elapsed * 15 - s * 0.55) * 2.4 * (1 - u * 0.5);
          var rad = 3.2 + u * 5.8;
          c.fillStyle = (s % 2 === 0) ? '#3be858' : '#1eb848';
          c.strokeStyle = '#0c4d1c';
          c.lineWidth = 1.4;
          c.beginPath();
          c.arc(pt.x, pt.y + wob, rad, 0, Math.PI * 2);
          c.fill(); c.stroke();
        }
        // 呆萌蛇头 + 吐信子 + 嚼控制点大嘴
        var head = fx.trail[fx.trail.length - 1];
        var prev = fx.trail[Math.max(0, fx.trail.length - 2)];
        var ang = Math.atan2(head.y - prev.y, Math.max(1, head.x - prev.x));
        c.translate(head.x, head.y);
        c.rotate(clamp(ang, -0.9, 0.9));
        // 分叉红信子
        if (Math.sin(fx.elapsed * 18) > -0.2) {
          c.strokeStyle = '#ff2855'; c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(9, 0); c.lineTo(18, 0);
          c.moveTo(18, 0); c.lineTo(22, -3.5);
          c.moveTo(18, 0); c.lineTo(22, 3.5);
          c.stroke();
        }
        // 蛇头（吃控制点时大张嘴）
        var mouth = fx.snakeChomp > 0 ? 0.55 : (0.14 + 0.1 * Math.abs(Math.sin(fx.elapsed * 10)));
        c.fillStyle = '#48f264';
        c.strokeStyle = '#0c4d1c'; c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, 10.5, mouth, Math.PI * 2 - mouth);
        c.closePath();
        c.fill(); c.stroke();
        // 斗鸡眼
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(2, -5.5, 3.8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#111111';
        c.beginPath(); c.arc(3.4, -5.2, 1.8, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    },

    {
      id: 'glitchMatrix',
      showcase: false,
      usesPit: true,
      linger: 0.65,
      nameKey: 'eye.mode.glitchMatrix',
      fallbackName: '显存炸了',
      eyeColor: { iris: '#ff004c', ring: '#00f5ff', pupil: '#090014' },
      onEnterNote: function (fx, n, st) {
        st.glitchWord = GLITCH_WORDS[Math.floor(Math.random() * GLITCH_WORDS.length)];
      },
      onControlPoint: function (fx, n, cp) {
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 2, maxR: 28, color: '#ff0066', lineW: 2.2, life: 0.35 });
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;

          // 背后若隐若现的诡异巨大半透明“凝视之眼”（小惊吓！）
          if (it.active) {
            var cx = g.x + g.w / 2, cy = g.y + g.h / 2;
            var blink = Math.sin(it.age * 9) > -0.78 ? 1 : 0.1;
            c.save();
            c.globalAlpha = 0.24;
            drawMiniEye(c, cx, cy, Math.max(36, g.w * 0.48), Math.max(20, g.h * 1.45), fx.mouse.inside ? fx.mouse.x : roll.beatX(roll.playPos), fx.mouse.inside ? fx.mouse.y : cy, '#ff0066', A.isDark ? '#180828' : '#e8f4ff', '#00f5ff', '#ff0066', blink);
            c.restore();
          }

          // RGB 通道撕裂重影
          var jitter = Math.sin(fx.elapsed * 42 + it.st.seed * 19) * 5.5;
          var j2 = Math.cos(fx.elapsed * 33 + it.st.seed * 11) * 4;
          c.save();
          c.globalAlpha = alpha * 0.65;
          c.fillStyle = '#00f5ff';
          c.fillRect(g.x - 4 + jitter, g.y - 1, g.w, g.h * 0.48);
          c.fillStyle = '#ff0066';
          c.fillRect(g.x + 4 - jitter, g.y + g.h * 0.45, g.w, g.h * 0.55);
          // 水平扫描裂条
          for (var s = 0; s < 3; s++) {
            var sy = g.y + ((s * 7 + Math.floor(fx.elapsed * 24)) % Math.max(4, Math.floor(g.h)));
            c.fillStyle = s % 2 ? '#ffffff' : '#000000';
            c.fillRect(g.x - 10 + j2 * (s - 1), sy, g.w + 20, 2);
          }

          // PIT 曲线化为锯齿状高频紫青电弧！
          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, it.active ? clamp(it.rel, 0, 1) : 1, 20);
            if (curve.length > 1) {
              c.globalAlpha = alpha * 0.92;
              c.strokeStyle = (Math.floor(fx.elapsed * 16) % 2) ? '#00f5ff' : '#ff2a9d';
              c.lineWidth = 2.2;
              c.beginPath();
              for (var k = 0; k < curve.length; k++) {
                var zx = curve[k].x;
                var zy = curve[k].y + (k % 2 ? 1 : -1) * (3 + Math.sin(fx.elapsed * 50 + k * 4) * 5);
                if (!k) c.moveTo(zx, zy); else c.lineTo(zx, zy);
              }
              c.stroke();
            }
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) continue;
          var corrupted = Math.sin(fx.elapsed * 18 + it.st.seed * 7) > 0.25;
          var txt = corrupted ? (it.st.glitchWord || '0xERR') : cleanLyric(it.n);
          var tx = clamp(g.x + g.w * 0.5, roll.kbW + 30, roll.w - 30);
          var ty = Math.max(roll.rulerH + 14, g.y - 11);
          drawTextHalo(c, txt, tx - 2.2, ty, 14, '#00f5ff', null, 0, 'center', 'Consolas, monospace');
          drawTextHalo(c, txt, tx + 2.2, ty, 14, '#ff0066', null, 0, 'center', 'Consolas, monospace');
          drawTextHalo(c, txt, tx, ty, 14, A.isDark ? '#ffffff' : '#111111', A.halo, 2.2, 'center', 'Consolas, monospace');
        }
      }
    },

    {
      id: 'ragdollShatter',
      showcase: false,
      usesPit: false,
      linger: 1.4,
      nameKey: 'eye.mode.ragdollShatter',
      fallbackName: '激光碎玻璃',
      eyeColor: { iris: '#f43f8e', ring: '#ffffff', pupil: '#380520' },
      onEnterNote: function (fx, n, st, geo, T, A) {
        st.lastShardRel = 0;
        var lyr = cleanLyric(n);
        fx.spawn({
          kind: 'shardText',
          text: lyr,
          x: geo.x + Math.min(geo.w * 0.4, 16),
          y: geo.y + geo.h / 2,
          vx: -45 - Math.random() * 50,
          vy: -75 - Math.random() * 60,
          rot: 0,
          vrot: (Math.random() - 0.5) * 10,
          color: A.isDark ? '#ffffff' : A.ink,
          halo: A.halo,
          life: 1.5
        });
      },
      onControlPoint: function (fx, n, cp, T, A) {
        // 控制点像螺丝钉一样弹飞落地弹跳
        fx.spawn({
          kind: 'shard',
          x: cp.x, y: cp.y,
          vx: -30 + (Math.random() - 0.5) * 90,
          vy: -90 - Math.random() * 55,
          w: 7, h: 7,
          rot: Math.random() * 6,
          vrot: (Math.random() - 0.5) * 16,
          color: A.ctrl,
          stroke: A.halo,
          life: 1.35
        });
      },
      drawCustomPlayhead: function (fx, c, roll, T, px) {
        // 灼热激光切割射线！
        c.save();
        c.strokeStyle = 'rgba(255, 40, 120, 0.35)'; c.lineWidth = 10;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        c.strokeStyle = '#ff2878'; c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        c.restore();
        return true;
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo, st = it.st;
          var cutRel = it.active ? clamp(it.rel, 0, 1) : 1;
          var cutW = g.w * cutRel;
          // 擦除已被激光切碎的左半边！
          if (cutW > 1) {
            roll._paintGridPatch(c, g.x - 1, g.y - 1, cutW + 2, g.h + 2, T);
          }
          // 随切割进度持续蹦出玻璃碎片与火花
          if (it.active && cutRel - (st.lastShardRel || 0) >= 0.14) {
            st.lastShardRel = cutRel;
            var cx = g.x + cutW;
            var col = (T.noteGrad && T.noteGrad[1]) || A.cyan;
            for (var s = 0; s < 3; s++) {
              fx.spawn({
                kind: 'shard',
                x: cx,
                y: g.y + Math.random() * g.h,
                vx: -30 - Math.random() * 85,
                vy: -60 - Math.random() * 85,
                w: 5 + Math.random() * 8,
                h: 4 + Math.random() * 7,
                rot: Math.random() * 6,
                vrot: (Math.random() - 0.5) * 14,
                color: s === 2 ? '#ffffff' : col,
                stroke: T.noteStroke || '#ffffff',
                life: 1.25 + Math.random() * 0.45
              });
            }
            fx.spawn({ kind: 'spark', x: cx, y: g.y + g.h * Math.random(), vx: -90 - Math.random() * 50, vy: (Math.random() - 0.5) * 90, r: 2.3, color: '#ffea00', life: 0.35 });
          }
          // 切口处的白热光斑
          if (it.active && cutW > 0 && cutW < g.w) {
            c.save();
            c.fillStyle = '#ffffff';
            c.shadowColor = '#ff2878'; c.shadowBlur = A.isPixel ? 0 : 12;
            c.beginPath(); c.arc(g.x + cutW, g.y + g.h / 2, 5.5, 0, Math.PI * 2); c.fill();
            c.restore();
          }
        }
      },
      renderOver: function () {}
    },

    {
      id: 'rubberJelly',
      showcase: false,
      usesPit: true,
      linger: 0.95,
      nameKey: 'eye.mode.rubberJelly',
      fallbackName: '果冻蹦迪',
      eyeColor: { iris: '#ff70c8', ring: '#7af7ff', pupil: '#4a0836' },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var g = items[i].geo;
          roll._paintGridPatch(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, T);
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var env = it.active ? clamp(it.age * 6, 0, 1) : it.exitAlpha;
          if (env <= 0) continue;
          var t = fx.elapsed * 16 + it.st.seed * 8;
          var damp = it.active ? 1 : (it.relMotion ? (0.18 + 0.82 * Math.exp(-it.exitAge * 1.4)) * it.exitAlpha : Math.exp(-it.exitAge * 3.2));
          var sy = 1 + (0.65 * env + Math.sin(t) * 0.42 * damp);
          var sx = 1 / Math.sqrt(Math.max(0.45, sy));
          var cx = g.x + g.w / 2, cy = g.y + g.h / 2;

          // 像过度拨动的橡皮筋一样疯狂弹跳的 PIT 曲线
          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, 1, 20);
            c.save();
            c.strokeStyle = A.magenta;
            c.lineWidth = 3;
            c.beginPath();
            for (var k = 0; k < curve.length; k++) {
              var u = k / (curve.length - 1);
              var bow = Math.sin(u * Math.PI) * Math.sin(t * 1.15) * 16 * damp * env;
              if (!k) c.moveTo(curve[k].x, curve[k].y + bow);
              else c.lineTo(curve[k].x, curve[k].y + bow);
            }
            c.stroke();
            c.restore();
          }

          // 果冻本体（半透明高光Q弹膨胀）
          c.save();
          c.translate(cx, cy);
          c.transform(sx, Math.sin(t * 0.7) * 0.14 * damp, Math.cos(t * 0.8) * 0.14 * damp, sy, 0, 0);
          var jg = c.createLinearGradient(0, -g.h / 2, 0, g.h / 2);
          jg.addColorStop(0, colorAlpha(A.cyan, 0.85));
          jg.addColorStop(0.5, colorAlpha(A.magenta, 0.78));
          jg.addColorStop(1, colorAlpha(A.goldBright, 0.85));
          c.fillStyle = jg;
          roundRect(c, -g.w / 2, -g.h / 2, g.w, g.h, Math.min(g.h * 0.48, 12));
          c.fill();
          c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.stroke();
          // 果冻晶莹反光泡泡
          c.fillStyle = 'rgba(255,255,255,0.72)';
          c.beginPath();
          c.ellipse(-g.w * 0.2, -g.h * 0.22, Math.max(4, g.w * 0.18), Math.max(2, g.h * 0.14), -0.15, 0, Math.PI * 2);
          c.fill();
          // 跟着拉丝变形的歌词
          c.fillStyle = '#ffffff';
          c.font = 'bold ' + Math.min(13, Math.max(9, g.h - 3)) + 'px Tahoma, "Microsoft YaHei", sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(cleanLyric(it.n), 0, 1);
          c.restore();

          // 滴落的果冻液滴
          if (it.active && Math.random() < 0.14) {
            fx.spawn({
              kind: 'drop',
              x: g.x + Math.random() * g.w,
              y: g.y + g.h,
              vx: (Math.random() - 0.5) * 14,
              vy: 25 + Math.random() * 35,
              r: 2.5 + Math.random() * 2.2,
              color: Math.random() < 0.5 ? A.magenta : A.cyan,
              life: 0.75
            });
          }
        }
      }
    },

    {
      id: 'bossBattle',
      showcase: false,
      usesPit: false,
      linger: 0.8,
      nameKey: 'eye.mode.bossBattle',
      fallbackName: '回合制讨伐',
      eyeColor: { iris: '#e6392e', ring: '#ffd700', pupil: '#2b0604' },
      onEnterNote: function (fx, n, st, geo) {
        st.lastHitRel = -0.2;
        st.koSpawned = false;
      },
      onControlPoint: function (fx, n, cp) {
        // 掉落旋转金币！
        fx.spawn({
          kind: 'coin',
          x: cp.x, y: cp.y,
          vx: (Math.random() - 0.5) * 70,
          vy: -85 - Math.random() * 40,
          phase: Math.random() * 6,
          life: 1.05
        });
      },
      onExitNote: function (fx, n, st, geo) {
        if (st.koSpawned) return;
        st.koSpawned = true;
        fx.spawn({
          kind: 'glyph',
          text: 'EXP +' + (20 + Math.round(n.dur * 30)),
          x: geo.x + geo.w / 2,
          y: geo.y - 10,
          vx: 0, vy: -36,
          size: 12,
          color: '#ffe042',
          life: 0.95
        });
        for (var i = 0; i < 10; i++) {
          var a = (i / 10) * Math.PI * 2;
          fx.spawn({
            kind: 'star',
            x: geo.x + geo.w / 2, y: geo.y + geo.h / 2,
            vx: Math.cos(a) * (40 + Math.random() * 55),
            vy: Math.sin(a) * (40 + Math.random() * 55) - 20,
            r: 4, rot: 0, vrot: 8,
            color: i % 2 ? '#ffe042' : '#ff4878',
            life: 0.65
          });
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) {
            var koAlpha = it.exitAlpha;
            if (koAlpha > 0) {
              c.save();
              c.globalAlpha = koAlpha * 0.58;
              c.fillStyle = A.isDark ? '#090612' : '#2a2234';
              roundRect(c, g.x, g.y, g.w, g.h, T.noteRadius || 0);
              c.fill();
              c.globalAlpha = koAlpha * 0.85;
              c.strokeStyle = '#ff4d6d';
              c.lineWidth = 1.8;
              c.beginPath();
              c.moveTo(g.x + 2, g.y + g.h - 2);
              c.lineTo(g.x + g.w - 2, g.y + 2);
              c.stroke();
              c.restore();
            }
            continue;
          }
          // 周期性受击伤害数字与白闪
          if (it.rel - (it.st.lastHitRel || 0) >= 0.28) {
            it.st.lastHitRel = it.rel;
            it.st.flashUntil = fx.elapsed + 0.09;
            var isCrit = Math.random() < 0.35;
            var dmg = isCrit ? (999 + Math.floor(Math.random() * 8999)) : (120 + Math.floor(Math.random() * 680));
            var crits = CRIT_LABELS[langCode()] || CRIT_LABELS.zh;
            fx.spawn({
              kind: 'glyph',
              text: isCrit ? (crits[Math.floor(Math.random() * crits.length)] + ' -' + dmg) : ('-' + dmg),
              x: g.x + g.w * clamp(it.rel, 0.1, 0.9),
              y: g.y - 12,
              vx: (Math.random() - 0.5) * 32,
              vy: -54 - Math.random() * 24,
              size: isCrit ? 14 : 11.5,
              color: isCrit ? '#ffea00' : '#ff4d4d',
              life: 0.78
            });
          }
          // 轻微受击抖动 + 白闪
          var flashing = it.st.flashUntil && fx.elapsed < it.st.flashUntil;
          if (flashing) {
            c.save();
            c.fillStyle = 'rgba(255, 255, 255, 0.85)';
            roundRect(c, g.x + (Math.random() - 0.5) * 4, g.y + (Math.random() - 0.5) * 3, g.w, g.h, T.noteRadius || 0);
            c.fill();
            c.restore();
          }
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) {
            if (it.exitAlpha > 0) {
              var koBarW = Math.max(36, Math.min(g.w, 120));
              var koBx = clamp(g.x + g.w / 2 - koBarW / 2, roll.kbW + 4, roll.w - koBarW - 4);
              var koBy = Math.max(roll.rulerH + 4, g.y - 11);
              c.save();
              c.globalAlpha = it.exitAlpha * 0.72;
              c.fillStyle = '#181420';
              c.fillRect(koBx - 1, koBy - 1, koBarW + 2, 7);
              c.strokeStyle = '#ff5a72'; c.lineWidth = 0.9;
              c.strokeRect(koBx - 1, koBy - 1, koBarW + 2, 7);
              c.restore();
            }
            continue;
          }
          var hp = clamp(1 - it.rel, 0, 1);
          // 英雄剑气斩击弧光
          var sx = g.x + g.w * clamp(it.rel, 0, 1);
          var sy = g.y + g.h / 2;
          c.save();
          c.strokeStyle = '#ffffff';
          c.shadowColor = '#00e8ff'; c.shadowBlur = A.isPixel ? 0 : 10;
          c.lineWidth = 2.6;
          c.beginPath();
          c.arc(sx - 6, sy, g.h * 0.95, -0.95, 0.95);
          c.stroke();
          c.shadowBlur = 0;

          // 头顶 RPG 血条
          var barW = Math.max(36, Math.min(g.w, 120));
          var bx = clamp(g.x + g.w / 2 - barW / 2, roll.kbW + 4, roll.w - barW - 4);
          var by = Math.max(roll.rulerH + 4, g.y - 11);
          c.fillStyle = '#181420';
          c.fillRect(bx - 1, by - 1, barW + 2, 7);
          c.fillStyle = hp > 0.5 ? '#42e858' : (hp > 0.22 ? '#ffc424' : '#ff3248');
          c.fillRect(bx, by, barW * hp, 5);
          c.strokeStyle = '#ffffff'; c.lineWidth = 0.9;
          c.strokeRect(bx - 1, by - 1, barW + 2, 7);
          c.restore();
        }
      }
    },

    {
      id: 'surrealEyes',
      showcase: false,
      usesPit: true,
      linger: 0.95,
      nameKey: 'eye.mode.surrealEyes',
      fallbackName: '千眼凝视',
      eyeColor: { iris: '#f5b800', ring: '#fff7c2', pupil: '#291700' },
      renderUnder: function (fx, c, roll, T, A, items) {
        var lookX = fx.mouse.inside ? fx.mouse.x : roll.beatX(roll.playPos);
        var lookY = fx.mouse.inside ? fx.mouse.y : (roll.gridBottom() * 0.45);
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? clamp(it.age * 5, 0, 1) : it.exitAlpha;
          if (alpha <= 0) continue;
          var cx = g.x + g.w / 2, cy = g.y + g.h / 2;

          // 圣经天使般的同心旋转光轮！
          c.save();
          c.globalAlpha = alpha * (A.isDark ? 0.85 : 0.72);
          c.translate(cx, cy);
          var r1 = Math.max(22, g.h * 1.45);
          var r2 = r1 * 1.48;
          c.strokeStyle = A.gold;
          c.lineWidth = 1.8;
          c.save();
          c.rotate(fx.elapsed * 1.4 + it.st.seed * 6);
          c.beginPath(); c.ellipse(0, 0, r2, r1 * 0.62, 0, 0, Math.PI * 2); c.stroke();
          c.restore();
          c.save();
          c.rotate(-fx.elapsed * 1.9 + it.st.seed * 3);
          c.strokeStyle = A.ctrl;
          c.beginPath(); c.ellipse(0, 0, r2 * 0.9, r1 * 0.55, Math.PI / 3, 0, Math.PI * 2); c.stroke();
          c.restore();
          c.restore();

          // PIT 线散发圣光羽芒
          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, 1, 14);
            c.save();
            c.globalAlpha = alpha * 0.55;
            c.strokeStyle = A.gold;
            c.lineWidth = 1.3;
            for (var k = 0; k < curve.length; k += 2) {
              var ray = 6 + 4 * Math.sin(fx.elapsed * 8 + k);
              c.beginPath();
              c.moveTo(curve[k].x, curve[k].y - ray);
              c.lineTo(curve[k].x, curve[k].y + ray);
              c.stroke();
            }
            c.restore();
          }

          // 控制点全部长成眨眼的小眼球！
          var cps = getControlPoints(roll, it.n, it.nInfo);
          for (var ci = 0; ci < cps.length; ci++) {
            var cp = cps[ci];
            var blinkC = Math.sin(fx.elapsed * 3.8 + ci * 1.9) > -0.88 ? 1 : 0.12;
            c.save();
            c.globalAlpha = alpha;
            drawMiniEye(c, cp.x, cp.y, 7.2, 4.6, lookX, lookY, A.ctrl, '#ffffff', '#120820', A.gold, blinkC);
            c.restore();
          }
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var lookX = fx.mouse.inside ? fx.mouse.x : roll.beatX(roll.playPos);
        var lookY = fx.mouse.inside ? fx.mouse.y : (roll.gridBottom() * 0.5);
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? clamp(it.age * 5, 0, 1) : it.exitAlpha;
          if (alpha <= 0) continue;
          // 在音符表面密密麻麻睁开一排盯着你的眼睛！
          var eyeCount = clamp(Math.floor(g.w / 24), 1, 6);
          var erx = clamp(g.h * 0.44, 5.5, 10.5);
          var ery = clamp(g.h * 0.30, 3.6, 6.8);
          c.save();
          c.globalAlpha = alpha;
          for (var e = 0; e < eyeCount; e++) {
            var ex = g.x + ((e + 0.5) / eyeCount) * g.w;
            var ey = g.y + g.h / 2 + Math.sin(fx.elapsed * 5 + e * 2) * 1.5;
            var blink = Math.sin(fx.elapsed * 3.1 + it.st.seed * 12 + e * 2.3) > -0.86 ? 1 : 0.08;
            drawMiniEye(c, ex, ey, erx, ery, lookX, lookY, e % 2 ? A.cyan : A.magenta, '#ffffff', '#0b0818', A.gold, blink);
          }
          c.restore();
        }
      }
    },

    {
      id: 'danmakuCat',
      showcase: false,
      usesPit: false,
      linger: 0.75,
      nameKey: 'eye.mode.danmakuCat',
      fallbackName: '弹幕结界',
      eyeColor: { iris: '#a855f7', ring: '#f0abfc', pupil: '#240548' },
      onEnterNote: function (fx, n, st, geo, T, A) {
        // 发射一条音符歌词弹幕 + 一条神评弹幕！
        var pool = DANMAKU_POOL[langCode()] || DANMAKU_POOL.zh;
        var cols = [A.cyan, A.magenta, A.goldBright, A.lime, '#ffffff'];
        var lyr = cleanLyric(n);
        fx.spawnDanmaku('「' + lyr + '~~~」', geo.y + (Math.random() - 0.5) * 32, cols[Math.floor(Math.random() * cols.length)], 16);
        if (Math.random() < 0.78) {
          var rowY = fx.roll.rulerH + 20 + Math.random() * Math.max(40, fx.roll.gridBottom() - fx.roll.rulerH - 40);
          fx.spawnDanmaku(pool[Math.floor(Math.random() * pool.length)], rowY, cols[Math.floor(Math.random() * cols.length)], 13 + Math.random() * 5);
        }
        // 东方符卡式螺旋星弹幕爆发！
        var arms = 8;
        var baseAng = fx.elapsed * 2.3;
        for (var i = 0; i < arms; i++) {
          var a = baseAng + (i / arms) * Math.PI * 2;
          fx.spawn({
            kind: 'bullet',
            x: geo.x + 4,
            y: geo.y + geo.h / 2,
            vx: Math.cos(a) * 88,
            vy: Math.sin(a) * 88,
            r: 4.5,
            color: cols[i % cols.length],
            life: 1.35
          });
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? clamp(it.age * 5, 0, 1) : it.exitAlpha;
          if (alpha <= 0) continue;
          var cx = g.x + g.w * clamp(it.active ? it.rel : 1, 0, 1);
          var cy = g.y + g.h / 2;
          var rad = Math.max(26, g.h * 1.7);
          // 旋转六芒星符卡魔法阵
          c.save();
          c.globalAlpha = alpha * (A.isDark ? 0.65 : 0.48);
          c.translate(cx, cy);
          c.rotate(fx.elapsed * 2.4);
          c.strokeStyle = A.magenta; c.lineWidth = 1.6;
          c.beginPath(); c.arc(0, 0, rad, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.arc(0, 0, rad * 0.78, 0, Math.PI * 2); c.stroke();
          for (var t = 0; t < 2; t++) {
            c.beginPath();
            for (var k = 0; k < 3; k++) {
              var a = t * Math.PI / 3 + k * Math.PI * 2 / 3;
              var px = Math.cos(a) * rad * 0.78, py = Math.sin(a) * rad * 0.78;
              if (!k) c.moveTo(px, py); else c.lineTo(px, py);
            }
            c.closePath(); c.stroke();
          }
          c.restore();

          if (it.active && Math.random() < 0.16) {
            var ba = fx.elapsed * 6.5;
            fx.spawn({
              kind: 'bullet',
              x: cx, y: cy,
              vx: Math.cos(ba) * 78,
              vy: Math.sin(ba) * 78,
              r: 3.6,
              color: Math.random() < 0.5 ? A.cyan : A.goldBright,
              life: 1.1
            });
          }
        }
      },
      renderOver: function () {}
    }
  ];

  /* ========================================================================
   * EyeFx 引擎类
   * ======================================================================== */
  function EyeFx(roll) {
    this.roll = roll;
    this.active = false;
    this.mode = null;
    this.bag = [];
    this.lastModeId = null;
    this.noteStates = Object.create(null);
    this.particles = [];
    this.danmaku = [];
    this.trail = [];
    this.snakeChomp = 0;
    this.prevPlayPos = null;
    this.prevScrollBeat = null;
    this.elapsed = 0;
    this.lastTs = 0;
    this.rafId = 0;
    this.mouse = { x: 0, y: 0, inside: false };
    this._bindMouse();
  }

  EyeFx.MODES = MODES;

  EyeFx.prototype._bindMouse = function () {
    var self = this, cv = this.roll && this.roll.cv;
    if (!cv || !cv.addEventListener) return;
    cv.addEventListener('mousemove', function (e) {
      if (!self.active) return;
      var r = cv.getBoundingClientRect();
      self.mouse.x = e.clientX - r.left;
      self.mouse.y = e.clientY - r.top;
      self.mouse.inside = true;
    });
    cv.addEventListener('mouseleave', function () { self.mouse.inside = false; });
  };

  EyeFx.prototype._pickRandomMode = function () {
    if (!this.bag.length) {
      this.bag = [];
      for (var i = 0; i < MODES.length; i++) this.bag.push(i);
      for (var j = this.bag.length - 1; j > 0; j--) {
        var r = Math.floor(Math.random() * (j + 1));
        var tmp = this.bag[j]; this.bag[j] = this.bag[r]; this.bag[r] = tmp;
      }
      // 防止洗牌后首尾紧接重复同一个效果
      if (this.bag.length > 1 && MODES[this.bag[this.bag.length - 1]].id === this.lastModeId) {
        var swap = this.bag[0];
        this.bag[0] = this.bag[this.bag.length - 1];
        this.bag[this.bag.length - 1] = swap;
      }
    }
    var idx = this.bag.pop();
    var chosen = MODES[idx];
    this.lastModeId = chosen.id;
    return chosen;
  };

  EyeFx.prototype.modeLabel = function (m) {
    m = m || this.mode;
    if (!m) return '';
    return tr(m.nameKey, m.fallbackName);
  };

  EyeFx.prototype.resetTransient = function () {
    this.noteStates = Object.create(null);
    this.particles = [];
    this.danmaku = [];
    this.trail = [];
    this.snakeChomp = 0;
    this.prevPlayPos = null;
    this.prevScrollBeat = this.roll ? this.roll.scrollBeat : null;
  };

  EyeFx.prototype._syncScrollShift = function () {
    var roll = this.roll;
    if (!roll) return;
    if (this.prevScrollBeat === null || this.prevScrollBeat === undefined) {
      this.prevScrollBeat = roll.scrollBeat;
      return;
    }
    var dBeat = roll.scrollBeat - this.prevScrollBeat;
    this.prevScrollBeat = roll.scrollBeat;
    if (!dBeat) return;
    var dx = dBeat * roll.pxBeat;
    if (!isFinite(dx)) return;
    if (Math.abs(dx) > roll.w) {
      this.trail = [];
      return;
    }
    for (var ti = 0; ti < this.trail.length; ti++) this.trail[ti].x -= dx;
    for (var pi = 0; pi < this.particles.length; pi++) this.particles[pi].x -= dx;
  };

  EyeFx.prototype.enter = function (forceModeId) {
    this.resetTransient();
    var chosen = null;
    if (forceModeId) {
      for (var i = 0; i < MODES.length; i++) if (MODES[i].id === forceModeId) { chosen = MODES[i]; break; }
    }
    this.mode = chosen || this._pickRandomMode();
    this.active = true;
    this.elapsed = 0;
    this.lastTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._startLoop();
    if (this.roll) this.roll.drawCursor();
    return this.mode;
  };

  EyeFx.prototype.exit = function () {
    this.active = false;
    this.mode = null;
    this._stopLoop();
    this.resetTransient();
    if (this.roll) this.roll.draw();
  };

  EyeFx.prototype.toggle = function () {
    if (this.active) { this.exit(); return null; }
    return this.enter();
  };

  EyeFx.prototype._startLoop = function () {
    if (this.rafId || typeof requestAnimationFrame !== 'function') return;
    var self = this;
    function tick(ts) {
      if (!self.active) { self.rafId = 0; return; }
      self._step(ts);
      if (self.roll) self.roll.drawCursor();
      self.rafId = requestAnimationFrame(tick);
    }
    this.rafId = requestAnimationFrame(tick);
  };

  EyeFx.prototype._stopLoop = function () {
    if (this.rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  };

  EyeFx.prototype._effectiveLinger = function () {
    var base = (this.mode && this.mode.linger) || 0.7;
    return (this.roll && this.roll.relativeMotion) ? Math.max(base * 2.5, 2.4) : base;
  };

  EyeFx.prototype.spawn = function (p) {
    var relMotion = !!(this.roll && this.roll.relativeMotion);
    var maxParticles = relMotion ? 380 : 260;
    if (this.particles.length >= maxParticles) this.particles.shift();
    p.age = 0;
    var baseLife = p.life || 0.6;
    if (relMotion) {
      var mul = (p.kind === 'shard' || p.kind === 'shardText' || p.kind === 'coin' || p.kind === 'moth' || p.kind === 'drop') ? 1.85 : 1.35;
      p.life = baseLife * mul;
    } else {
      p.life = baseLife;
    }
    this.particles.push(p);
  };

  EyeFx.prototype.spawnDanmaku = function (text, y, color, size) {
    if (this.danmaku.length >= 34) this.danmaku.shift();
    this.danmaku.push({
      text: text,
      x: this.roll.w + 16,
      y: clamp(y, this.roll.rulerH + 16, Math.max(this.roll.rulerH + 20, this.roll.gridBottom() - 16)),
      vx: -(140 + Math.random() * 140),
      color: color || '#ffffff',
      size: size || 14
    });
  };

  EyeFx.prototype._step = function (ts) {
    var now = ts || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    var dt = this.lastTs ? clamp((now - this.lastTs) / 1000, 0.001, 0.05) : 0.016;
    this.lastTs = now;
    this.elapsed += dt;
    if (this.snakeChomp > 0) this.snakeChomp = Math.max(0, this.snakeChomp - dt);

    var roll = this.roll;
    if (!roll || !this.mode) return;
    this._syncScrollShift();
    var T = roll._themePalette();
    var A = getAccents(T, roll.theme || NSG.theme || 'aero');
    var playPos = roll.playPos;
    var prevPos = this.prevPlayPos;
    var jumped = prevPos !== null && (playPos < prevPos - 0.15 || playPos - prevPos > 2.5);
    var gridH = roll.gridBottom();

    // 扫描被播放指针触及的音符
    var touchedIds = Object.create(null);
    var noteById = Object.create(null);
    var notes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
    var pitchInfo = roll._lastPitchInfo || null;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      noteById[n.id] = n;
      if (playPos >= n.start - 1e-4 && playPos <= n.start + n.dur + 1e-4) {
        touchedIds[n.id] = n;
        var st = this.noteStates[n.id];
        var geo = {
          x: roll.beatX(n.start),
          y: Math.round(roll.rowY(n.pitch)) + 1,
          w: Math.max(6, n.dur * roll.pxBeat) - 1,
          h: Math.max(4, roll.rowH - 2)
        };
        var rel = n.dur > 0 ? clamp((playPos - n.start) / n.dur, 0, 1) : 0;
        if (!st || !st.active) {
          st = this.noteStates[n.id] = {
            id: n.id,
            active: true,
            enteredAt: this.elapsed,
            exitedAt: null,
            fadeAge: 0,
            rel: rel,
            seed: hashStr(String(n.id || i)),
            crossedPts: Object.create(null)
          };
          if (this.mode.onEnterNote) this.mode.onEnterNote(this, n, st, geo, T, A);
        } else {
          st.rel = rel;
        }

        // 检测播放指针扫过的控制点
        if (this.mode.onControlPoint && pitchInfo && pitchInfo[n.id] && !jumped && prevPos !== null && playPos >= prevPos) {
          var cps = getControlPoints(roll, n, pitchInfo[n.id]);
          for (var ci = 0; ci < cps.length; ci++) {
            var cp = cps[ci];
            if (!st.crossedPts[ci] && cp.beat >= prevPos - 1e-4 && cp.beat <= playPos + 1e-4) {
              st.crossedPts[ci] = true;
              this.mode.onControlPoint(this, n, cp, T, A);
            }
          }
        }
      }
    }

    // 处理已离开播放指针的音符（进入余韵/收尾阶段）
    var baseLinger = this.mode.linger || 0.7;
    var relMotion = !!(roll && roll.relativeMotion);
    var isPlaying = !!(roll && roll.isPlaying);
    var effLinger = this._effectiveLinger();
    var offLeftMargin = 84;
    var keys = Object.keys(this.noteStates);
    for (var k = 0; k < keys.length; k++) {
      var id = keys[k], s = this.noteStates[id];
      var note = noteById[id] || null;
      if (s.active && !touchedIds[id]) {
        s.active = false;
        s.exitedAt = this.elapsed;
        s.fadeAge = 0;
        if (this.mode.onExitNote && note) {
          this.mode.onExitNote(this, note, s, {
            x: roll.beatX(note.start),
            y: Math.round(roll.rowY(note.pitch)) + 1,
            w: Math.max(6, note.dur * roll.pxBeat) - 1,
            h: Math.max(4, roll.rowH - 2)
          }, T, A);
        }
      } else if (!s.active) {
        if (!note || playPos < note.start - 1e-4) {
          delete this.noteStates[id];
          continue;
        }
        if (relMotion) {
          var nx = roll.beatX(note.start);
          var nw = Math.max(6, note.dur * roll.pxBeat);
          if (nx + nw < roll.kbW - offLeftMargin) {
            // 相对运动模式下，待被揍过的音符移出屏幕左边界后再恢复
            delete this.noteStates[id];
            continue;
          }
          if (isPlaying) {
            s.fadeAge = 0;
          } else {
            s.fadeAge = (s.fadeAge || 0) + dt;
            if (s.fadeAge > effLinger) delete this.noteStates[id];
          }
        } else {
          s.fadeAge = (s.fadeAge || 0) + dt;
          if (s.fadeAge > baseLinger) delete this.noteStates[id];
        }
      }
    }

    this.prevPlayPos = playPos;

    // 更新粒子物理
    for (var pi = this.particles.length - 1; pi >= 0; pi--) {
      var p = this.particles[pi];
      p.age += dt;
      if (p.age >= p.life || (relMotion && p.x < roll.kbW - 90)) { this.particles.splice(pi, 1); continue; }
      if (p.kind === 'shard' || p.kind === 'shardText' || p.kind === 'coin') {
        p.vy += 380 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.rot !== undefined) p.rot += (p.vrot || 0) * dt;
        if (p.y > gridH - 6) {
          p.y = gridH - 6;
          p.vy = -Math.abs(p.vy) * 0.54;
          p.vx *= 0.82;
        }
      } else if (p.kind === 'drop') {
        p.vy += 220 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'moth') {
        p.x += (p.vx + Math.sin(this.elapsed * 16 + p.phase) * 35) * dt;
        p.y += (p.vy + Math.cos(this.elapsed * 12 + p.phase) * 18) * dt;
      } else if (p.kind === 'ring') {
        // 半径随 age/life 插值
      } else {
        p.x += (p.vx || 0) * dt;
        p.y += (p.vy || 0) * dt;
        if (p.rot !== undefined) p.rot += (p.vrot || 0) * dt;
      }
    }

    // 更新弹幕
    for (var di = this.danmaku.length - 1; di >= 0; di--) {
      var dm = this.danmaku[di];
      dm.x += dm.vx * dt;
      if (dm.x < roll.kbW - 260) this.danmaku.splice(di, 1);
    }
  };

  EyeFx.prototype._collectItems = function () {
    var roll = this.roll;
    var out = [];
    if (!roll || roll.activeTrackVisible === false) return out;
    var relMotion = !!roll.relativeMotion;
    var linger = this._effectiveLinger();
    var leftCull = relMotion ? 84 : 40;
    var pitchInfo = roll._lastPitchInfo || null;
    var notes = roll.notes || [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var st = this.noteStates[n.id];
      if (!st) continue;
      var x = roll.beatX(n.start);
      var wd = Math.max(6, n.dur * roll.pxBeat);
      if (x > roll.w + 40 || x + wd < roll.kbW - leftCull) continue;
      var exitAge = st.exitedAt !== null ? Math.max(0, this.elapsed - st.exitedAt) : 0;
      var fadeAge = st.exitedAt !== null ? (st.fadeAge !== undefined ? st.fadeAge : exitAge) : 0;
      out.push({
        n: n,
        st: st,
        active: st.active,
        rel: st.rel,
        age: Math.max(0, this.elapsed - st.enteredAt),
        exitAge: exitAge,
        fadeAge: fadeAge,
        linger: linger,
        exitAlpha: st.active ? 1 : clamp(1 - fadeAge / linger, 0, 1),
        relMotion: relMotion,
        nInfo: pitchInfo ? pitchInfo[n.id] : null,
        geo: {
          x: x + 0.5,
          y: Math.round(roll.rowY(n.pitch)) + 1,
          w: wd - 1,
          h: Math.max(4, roll.rowH - 2)
        }
      });
    }
    return out;
  };

  EyeFx.prototype.drawCustomPlayhead = function (c, T, px) {
    if (!this.active || !this.mode || !this.mode.drawCustomPlayhead) return false;
    return !!this.mode.drawCustomPlayhead(this, c, this.roll, T, px);
  };

  EyeFx.prototype.renderUnderPlayhead = function (c, T) {
    if (!this.active || !this.mode) return;
    this._syncScrollShift();
    var roll = this.roll, gridH = roll.gridBottom();
    var A = getAccents(T, roll.theme || NSG.theme || 'aero');
    this._frameItems = this._collectItems();
    c.save();
    c.beginPath();
    c.rect(roll.kbW, roll.rulerH, Math.max(0, roll.w - roll.kbW), Math.max(0, gridH - roll.rulerH));
    c.clip();
    if (this.mode.renderUnder) this.mode.renderUnder(this, c, roll, T, A, this._frameItems);
    c.restore();
  };

  EyeFx.prototype.renderOverPlayhead = function (c, T) {
    if (!this.active || !this.mode) return;
    var roll = this.roll, gridH = roll.gridBottom();
    var A = getAccents(T, roll.theme || NSG.theme || 'aero');
    var items = this._frameItems || this._collectItems();

    c.save();
    c.beginPath();
    c.rect(roll.kbW, roll.rulerH, Math.max(0, roll.w - roll.kbW), Math.max(0, gridH - roll.rulerH));
    c.clip();

    if (this.mode.renderOver) this.mode.renderOver(this, c, roll, T, A, items);
    this._renderParticles(c, A);
    this._renderDanmaku(c, A);

    c.restore();
    this._frameItems = null;
  };

  EyeFx.prototype._renderParticles = function (c, A) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var u = clamp(p.age / p.life, 0, 1);
      var alpha = u < 0.75 ? 1 : (1 - (u - 0.75) / 0.25);
      c.save();
      c.globalAlpha = clamp(alpha, 0, 1);

      if (p.kind === 'ring') {
        var r = p.r + (p.maxR - p.r) * (1 - Math.pow(1 - u, 2));
        c.strokeStyle = p.color;
        c.lineWidth = (p.lineW || 2) * (1 - u * 0.7);
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'spark') {
        c.fillStyle = p.color;
        if (A.isPixel) {
          var s = Math.max(2, Math.round(p.r * 2 * (1 - u * 0.5)));
          c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        } else {
          c.beginPath(); c.arc(p.x, p.y, Math.max(0.8, p.r * (1 - u * 0.45)), 0, Math.PI * 2); c.fill();
        }
      } else if (p.kind === 'star') {
        c.fillStyle = p.color;
        drawStar(c, p.x, p.y, 5, p.r, p.r * 0.45, p.rot || 0);
        c.fill();
      } else if (p.kind === 'glyph') {
        drawTextHalo(c, p.text, p.x, p.y, p.size || 13, p.color, A.halo, 2.6);
      } else if (p.kind === 'shard') {
        c.translate(p.x, p.y);
        c.rotate(p.rot || 0);
        c.fillStyle = p.color;
        c.strokeStyle = p.stroke || '#ffffff';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-p.w / 2, -p.h / 2);
        c.lineTo(p.w / 2, -p.h * 0.2);
        c.lineTo(p.w * 0.25, p.h / 2);
        c.lineTo(-p.w * 0.4, p.h * 0.35);
        c.closePath();
        c.fill(); c.stroke();
      } else if (p.kind === 'shardText') {
        c.translate(p.x, p.y);
        c.rotate(p.rot || 0);
        drawTextHalo(c, p.text, 0, 0, 13, p.color, p.halo, 2.5);
      } else if (p.kind === 'drop') {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.beginPath();
        c.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.32, 0, Math.PI * 2);
        c.fill();
      } else if (p.kind === 'coin') {
        var scaleX = Math.cos(this.elapsed * 16 + (p.phase || 0));
        c.translate(p.x, p.y);
        c.scale(Math.max(0.2, Math.abs(scaleX)), 1);
        c.fillStyle = '#ffd83b';
        c.strokeStyle = '#9c5a00';
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#fff5b0';
        c.fillRect(-1.2, -3, 2.4, 6);
      } else if (p.kind === 'moth') {
        var flap = Math.sin(this.elapsed * 32 + (p.phase || 0)) * 0.7;
        c.translate(p.x, p.y);
        c.fillStyle = 'rgba(255,255,255,0.88)';
        c.strokeStyle = p.color; c.lineWidth = 1.2;
        c.save(); c.rotate(-0.5 + flap);
        c.beginPath(); c.ellipse(-5, -2, 6, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.restore();
        c.save(); c.rotate(0.5 - flap);
        c.beginPath(); c.ellipse(5, -2, 6, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.restore();
        c.fillStyle = p.color;
        c.beginPath(); c.arc(0, 0, 3.2, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'bullet') {
        c.fillStyle = p.color;
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.4;
        drawStar(c, p.x, p.y, 5, p.r + 1.5, p.r * 0.5, this.elapsed * 5);
        c.fill(); c.stroke();
      }
      c.restore();
    }
  };

  EyeFx.prototype._renderDanmaku = function (c, A) {
    for (var i = 0; i < this.danmaku.length; i++) {
      var dm = this.danmaku[i];
      drawTextHalo(c, dm.text, dm.x, dm.y, dm.size, dm.color, A.isDark ? 'rgba(0,0,0,0.9)' : 'rgba(20,24,36,0.85)', 3.2, 'left');
    }
  };

  NSG.EyeFx = EyeFx;
})(typeof window !== 'undefined' ? window : globalThis);
