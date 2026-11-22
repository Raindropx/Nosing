/* 莫名其妙的眼睛模式 · 动态视觉效果引擎（25 种演出：8 种晒调教 + 17 种莫名其妙×120，支持隐藏播放指针，全主题自适应） */
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

  function noteTopY(roll, n) {
    return Math.round(roll.rowY(n.pitch)) + 1;
  }

  function noteCenterY(roll, n) {
    return Math.round(roll.rowY(n.pitch)) + 1 + Math.max(4, roll.rowH - 2) * 0.5;
  }

  /* 查找当前播放位置对应的正在发音音符、前一个结束音符与下一个待发音音符 */
  function getPlaybackNoteContext(roll, playPos) {
    var notes = (!roll || roll.activeTrackVisible === false) ? [] : (roll.notes || []);
    var cur = null, prev = null, next = null;
    var prevEnd = -Infinity, nextStart = Infinity;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (!n) continue;
      var s = n.start, e = n.start + n.dur;
      if (playPos >= s - 1e-4 && playPos <= e + 1e-4) {
        if (!cur || s > cur.start || (s === cur.start && n.pitch > cur.pitch)) cur = n;
      }
    }
    for (var j = 0; j < notes.length; j++) {
      var n2 = notes[j];
      if (!n2 || n2 === cur) continue;
      var s2 = n2.start, e2 = n2.start + n2.dur;
      if (e2 <= playPos + 1e-4 && e2 > prevEnd) {
        prevEnd = e2;
        prev = n2;
      }
      if (s2 > playPos - 1e-4 && s2 < nextStart) {
        nextStart = s2;
        next = n2;
      }
    }
    return { cur: cur, prev: prev, next: next };
  }

  /* 通用跳跃轨迹状态机（开场破底跃入 + 音符间抛物线跳跃 + 零间隙连音微跳 + 音轨末尾纵身跳出屏幕，绝不瞬移） */
  function stepHopperState(fx, roll, dt, jumped, opts) {
    opts = opts || {};
    var ms = fx.modeState;
    var playPos = roll.playPos;
    var ctx = getPlaybackNoteContext(roll, playPos);
    var x = roll.beatX(playPos);
    var minY = roll.rulerH + (opts.topPad || 18);
    var maxY = roll.gridBottom() - (opts.botPad || 6);
    var trackNotes = (!roll || roll.activeTrackVisible === false) ? [] : (roll.notes || []);
    var firstNote = null, firstStart = Infinity;
    var lastNote = null, lastEnd = -Infinity;
    for (var ni = 0; ni < trackNotes.length; ni++) {
      var tn = trackNotes[ni];
      if (!tn) continue;
      if (tn.start < firstStart) { firstStart = tn.start; firstNote = tn; }
      if (tn.start + tn.dur > lastEnd) { lastEnd = tn.start + tn.dur; lastNote = tn; }
    }

    if (opts.droneOnMiss && !ms.missCache) ms.missCache = Object.create(null);

    var evalVaultArc = function (u, destNote, spanPx) {
      var y0 = roll.gridBottom() + 42;
      var lift = (opts.droneOnMiss && destNote && isNoteG2pMiss(roll, destNote, ms.missCache))
        ? clamp(roll.rowH * 1.15, 16, 26) : 0;
      var y1 = clamp(noteTopY(roll, destNote) - lift, minY, maxY);
      var maxOver = Math.max(24, y1 - minY);
      var over = clamp(opts.entryOvershoot || 46, 24, maxOver);
      var yCtrl = Math.max(minY - 8, y1 - over * 1.45);
      var om = 1 - u;
      var yVal = om * om * y0 + 2 * om * u * yCtrl + u * u * y1;
      var dyDu = 2 * om * (yCtrl - y0) + 2 * u * (y1 - yCtrl);
      var angVal = clamp(Math.atan2(dyDu, Math.max(44, spanPx)), -0.92, 0.52);
      return { y: yVal, angle: angVal, y1: y1 };
    };

    // 音轨开场：从屏幕底部跃起并以大抛物线降落到第一个音符上
    if (opts.entryVault && firstNote) {
      var evalEntryArc = function (u, spanPx) { return evalVaultArc(u, firstNote, spanPx); };

      var maxLead = opts.entryLeadBeats || 1.15;
      if (playPos < firstStart - 0.02) {
        ms.entryDone = false;
        ms.entryDrop = null;
        if (jumped || !roll.isPlaying) {
          ms.entryLaunched = false;
          ms.entrySpan = null;
        }
      } else if (playPos > firstStart + 0.22 && !ms.entryDrop) {
        ms.entryDone = true;
      }

      // 情况 A：处于第一个音符之前的前奏区
      if (!ctx.cur && !ctx.prev && ctx.next === firstNote && playPos < firstStart - 1e-4) {
        var distToFirst = firstStart - playPos;
        if (!roll.isPlaying) {
          // 暂停在开头前时在屏幕底部探头待命
          var peekY = roll.gridBottom() + 11;
          ms.hopperInit = true;
          ms.visY = peekY;
          ms.wasAir = false;
          ms.lastNoteId = null;
          ms.wasPlaying = false;
          ms.pose = {
            x: x,
            y: peekY,
            angle: -0.14,
            inAir: false,
            airU: 0,
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            entryVaulting: false,
            entryOffsetPx: 0,
            cliffFalling: false,
            cliffDone: false,
            hidden: false
          };
          return ms.pose;
        }
        if (distToFirst > maxLead) {
          // 播放长前奏且未进入跃入窗口时先藏在屏幕下方待机
          ms.entryLaunched = false;
          ms.entrySpan = null;
          ms.hopperInit = true;
          ms.visY = roll.gridBottom() + 56;
          ms.wasAir = true;
          ms.lastNoteId = null;
          ms.wasPlaying = true;
          ms.pose = {
            x: x,
            y: ms.visY,
            angle: -0.4,
            inAir: true,
            airU: 0,
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            entryVaulting: false,
            entryOffsetPx: 0,
            cliffFalling: false,
            cliffDone: false,
            hidden: true
          };
          return ms.pose;
        }
        // 进入跃入窗口：从底边起跳，精准落到第一个音符左边缘
        if (!ms.entryLaunched) {
          ms.entryLaunched = true;
          ms.entrySpan = clamp(distToFirst, 0.18, maxLead);
          if (opts.onEntryLaunch) opts.onEntryLaunch(x, roll.gridBottom() - 2, firstNote);
        }
        var span = ms.entrySpan || maxLead;
        var eu = clamp(1 - distToFirst / Math.max(1e-4, span), 0, 1);
        var earc = evalEntryArc(eu, span * roll.pxBeat);
        ms.hopperInit = true;
        ms.visY = earc.y;
        ms.wasAir = true;
        ms.lastNoteId = null;
        ms.wasPlaying = true;
        ms.pose = {
          x: x,
          y: earc.y,
          angle: earc.angle,
          inAir: true,
          airU: eu,
          onNote: null,
          ctx: ctx,
          groundY: null,
          landT: 0,
          entryVaulting: true,
          entryOffsetPx: 0,
          cliffFalling: false,
          cliffDone: false,
          hidden: false
        };
        return ms.pose;
      }

      // 情况 B：无前奏（如首个音符直接位于第 0 拍或紧贴起播点），起播时执行实时快速跃入
      if (!ms.entryDone && !ms.entryDrop && !ms.entryLaunched && roll.isPlaying &&
          Math.abs(playPos - firstStart) <= 0.14 &&
          (!ms.wasPlaying || !ms.hopperInit || (fx.prevPlayPos !== null && fx.prevPlayPos < firstStart - 1e-4))) {
        ms.entryDrop = { t: 0, dur: opts.entryDropDur || 0.42, leadPx: 76 };
        ms.entryLaunched = true;
        if (opts.onEntryLaunch) opts.onEntryLaunch(Math.max(roll.kbW + 12, x - 76), roll.gridBottom() - 2, firstNote);
      }
      if (ms.entryDrop) {
        ms.entryDrop.t += dt;
        var du = clamp(ms.entryDrop.t / ms.entryDrop.dur, 0, 1);
        var darc = evalEntryArc(du, ms.entryDrop.leadPx + 40);
        if (du >= 1) {
          ms.entryDrop = null;
          ms.entryDone = true;
          ms.visY = darc.y1;
          ms.wasAir = false;
          ms.landT = opts.landDur || 0.18;
          ms.lastNoteId = firstNote.id;
          if (opts.onLand) opts.onLand(x, darc.y1, firstNote);
        } else {
          var dxOff = -(1 - du) * ms.entryDrop.leadPx;
          ms.hopperInit = true;
          ms.visY = darc.y;
          ms.wasAir = true;
          ms.lastNoteId = firstNote.id;
          ms.wasPlaying = !!roll.isPlaying;
          ms.pose = {
            x: x + dxOff,
            y: darc.y,
            angle: darc.angle,
            inAir: true,
            airU: du,
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            entryVaulting: true,
            entryOffsetPx: dxOff,
            cliffFalling: false,
            cliffDone: false,
            hidden: false
          };
          return ms.pose;
        }
      }
    }

    // 较长乐句间奏：先从上一句尾音跳出屏幕底部，等下一段开始前再从底部破空跃回音符上！
    if (opts.interludeCliff) {
      var minInterlude = opts.interludeMinBeats || 3.2;
      var inLongInterlude = !ctx.cur && ctx.prev && ctx.next && (ctx.next.start - (ctx.prev.start + ctx.prev.dur)) >= minInterlude;
      if (!inLongInterlude) {
        ms.interludeFall = null;
        ms.interludeVaultKey = null;
      } else {
        var ig0 = ctx.prev.start + ctx.prev.dur;
        var ig1 = ctx.next.start;
        var iGap = ig1 - ig0;
        var reLead = clamp(opts.entryLeadBeats || 1.15, 0.45, Math.min(1.15, iGap * 0.42));
        var reStart = ig1 - reLead;
        var iKey = String(ctx.prev.id) + '->' + String(ctx.next.id);

        if (playPos < reStart) {
          ms.interludeVaultKey = null;
          if (!ms.interludeFall || ms.interludeFall.key !== iKey) {
            var iStartY = clamp(ms.hopperInit && isFinite(ms.visY) && !jumped ? ms.visY : noteTopY(roll, ctx.prev), minY, maxY);
            var iHeadroom = Math.max(0, iStartY - minY);
            var iJumpVy = -clamp((opts.cliffVyMin || 175) + iHeadroom * 2.1, opts.cliffVyMin || 175, opts.cliffVyMax || 265);
            var iBaseVx = clamp(roll.pxBeat * (opts.cliffVxScale || 2.1), opts.cliffVxMin || 115, opts.cliffVxMax || 215);
            var skipAlreadyOff = jumped && (playPos > ig0 + 0.6);
            ms.interludeFall = {
              key: iKey,
              baseBeat: ig0,
              offsetPx: Math.max(0, (playPos - ig0) * roll.pxBeat),
              y: skipAlreadyOff ? (roll.gridBottom() + 60) : iStartY,
              vx: iBaseVx,
              vy: iJumpVy,
              angle: opts.cliffInitAng || -0.4,
              t: 0,
              done: skipAlreadyOff
            };
            ms.hop = null;
            ms.landT = 0;
            if (!skipAlreadyOff && opts.onCliffJump) {
              opts.onCliffJump(roll.beatX(ig0) + ms.interludeFall.offsetPx, iStartY, ctx.prev);
            }
          }
          var icf = ms.interludeFall;
          if (!icf.done) {
            icf.t += dt;
            icf.vy += (opts.cliffGravity || 760) * dt;
            icf.offsetPx += icf.vx * dt;
            icf.y += icf.vy * dt;
            var iVelAng = clamp(Math.atan2(icf.vy, Math.max(40, icf.vx)), -0.58, 1.32);
            icf.angle += (iVelAng - icf.angle) * (1 - Math.exp(-10 * dt));
            if (icf.y > roll.gridBottom() + 56) icf.done = true;
          }
          var icfX = roll.beatX(icf.baseBeat) + icf.offsetPx;
          ms.hopperInit = true;
          ms.visY = icf.y;
          ms.wasAir = true;
          ms.lastNoteId = null;
          ms.wasPlaying = !!roll.isPlaying;
          ms.pose = {
            x: icfX,
            y: icf.y,
            angle: icf.angle,
            inAir: true,
            airU: clamp(icf.t / 0.8, 0, 1),
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            entryVaulting: false,
            entryOffsetPx: 0,
            cliffFalling: true,
            cliffDone: icf.done,
            cliffBaseBeat: icf.baseBeat,
            cliffOffsetPx: icf.offsetPx,
            cliffAge: icf.t,
            hidden: icf.done,
            interludeReEntryBeat: reStart
          };
          return ms.pose;
        } else {
          // 下一段即将开始：从屏幕底部破空跃回下一个音符！
          ms.interludeFall = null;
          if (ms.interludeVaultKey !== iKey) {
            ms.interludeVaultKey = iKey;
            if (opts.onEntryLaunch) opts.onEntryLaunch(x, roll.gridBottom() - 2, ctx.next);
          }
          var reU = clamp((playPos - reStart) / Math.max(1e-4, reLead), 0, 1);
          var reArc = evalVaultArc(reU, ctx.next, reLead * roll.pxBeat);
          ms.hopperInit = true;
          ms.visY = reArc.y;
          ms.wasAir = true;
          ms.lastNoteId = null;
          ms.wasPlaying = !!roll.isPlaying;
          ms.pose = {
            x: x,
            y: reArc.y,
            angle: reArc.angle,
            inAir: true,
            airU: reU,
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            entryVaulting: true,
            entryOffsetPx: 0,
            cliffFalling: false,
            cliffDone: false,
            hidden: false,
            interludeReEntryBeat: reStart
          };
          return ms.pose;
        }
      }
    }

    // 音轨结束时从最后一个音符边缘跃起并坠出屏幕底部
    if (opts.endCliffFall) {
      if (!lastNote || playPos < lastEnd - 0.02) {
        ms.cliffFall = null;
      } else {
        var arrivedAtEnd = playPos > lastEnd + 1e-4 ||
          (fx.prevPlayPos !== null && !jumped && playPos >= lastEnd - 0.015 && (roll.isPlaying || ms.wasPlaying) && fx.prevPlayPos < lastEnd - 1e-4);
        if (!ms.cliffFall && arrivedAtEnd) {
          var startY = clamp(ms.hopperInit && isFinite(ms.visY) ? ms.visY : noteTopY(roll, lastNote), minY, maxY);
          var headroom = Math.max(0, startY - minY);
          var jumpVy = -clamp((opts.cliffVyMin || 175) + headroom * 2.1, opts.cliffVyMin || 175, opts.cliffVyMax || 265);
          var baseVx = clamp(roll.pxBeat * (opts.cliffVxScale || 2.1), opts.cliffVxMin || 115, opts.cliffVxMax || 215);
          ms.cliffFall = {
            baseBeat: lastEnd,
            offsetPx: Math.max(0, (playPos - lastEnd) * roll.pxBeat),
            y: startY,
            vx: baseVx,
            vy: jumpVy,
            angle: opts.cliffInitAng || -0.4,
            t: 0,
            done: false
          };
          ms.hop = null;
          ms.landT = 0;
          if (opts.onCliffJump) opts.onCliffJump(roll.beatX(lastEnd) + ms.cliffFall.offsetPx, startY, lastNote);
        }
        if (ms.cliffFall) {
          var cf = ms.cliffFall;
          if (!cf.done) {
            cf.t += dt;
            cf.vy += (opts.cliffGravity || 760) * dt;
            cf.offsetPx += cf.vx * dt;
            cf.y += cf.vy * dt;
            var velAng = clamp(Math.atan2(cf.vy, Math.max(40, cf.vx)), -0.58, 1.32);
            cf.angle += (velAng - cf.angle) * (1 - Math.exp(-10 * dt));
            if (cf.y > roll.gridBottom() + 56) cf.done = true;
          }
          var cfX = roll.beatX(cf.baseBeat) + cf.offsetPx;
          ms.hopperInit = true;
          ms.visY = cf.y;
          ms.wasAir = true;
          ms.lastNoteId = null;
          ms.wasPlaying = !!roll.isPlaying;
          ms.pose = {
            x: cfX,
            y: cf.y,
            angle: cf.angle,
            inAir: true,
            airU: clamp(cf.t / 0.8, 0, 1),
            onNote: null,
            ctx: ctx,
            groundY: null,
            landT: 0,
            cliffFalling: true,
            cliffDone: cf.done,
            cliffBaseBeat: cf.baseBeat,
            cliffOffsetPx: cf.offsetPx,
            cliffAge: cf.t
          };
          return ms.pose;
        }
      }
    }

    if (opts.droneOnMiss) {
      if (!ms.missCache) ms.missCache = Object.create(null);
      var droneLift = clamp(roll.rowH * 1.15, 16, 26);
      var curMissed = !!(ctx.cur && isNoteG2pMiss(roll, ctx.cur, ms.missCache));
      var prevMissed = !!(ctx.prev && isNoteG2pMiss(roll, ctx.prev, ms.missCache));
      var nextMissed = !!(ctx.next && isNoteG2pMiss(roll, ctx.next, ms.missCache));
      var gapBothMissed = !ctx.cur && prevMissed && nextMissed;
      if (curMissed || gapBothMissed) {
        var hoverBase;
        var missGroundY = null;
        if (curMissed) {
          var noteTop = noteTopY(roll, ctx.cur);
          hoverBase = noteTop - droneLift;
          missGroundY = clamp(noteTop, minY, maxY);
        } else {
          var mg0 = ctx.prev.start + ctx.prev.dur;
          var mg1 = ctx.next.start;
          var mu = clamp((playPos - mg0) / Math.max(1e-4, mg1 - mg0), 0, 1);
          hoverBase = (noteTopY(roll, ctx.prev) + (noteTopY(roll, ctx.next) - noteTopY(roll, ctx.prev)) * mu) - droneLift;
        }
        var hoverMinY = Math.min(maxY - 8, minY + 18);
        var hoverBob = Math.sin(fx.elapsed * 9.5) * 2.4;
        var hoverTarget = clamp(hoverBase + hoverBob, hoverMinY, maxY - 8);
        if (jumped || !ms.hopperInit || !isFinite(ms.visY)) {
          ms.hopperInit = true;
          ms.visY = hoverTarget;
        } else {
          var dk = 1 - Math.exp(-16 * dt);
          ms.visY += (hoverTarget - ms.visY) * dk;
        }
        if (curMissed && ms.lastMissNoteId !== ctx.cur.id) {
          ms.lastMissNoteId = ctx.cur.id;
          if (opts.onMissAirlift && roll.isPlaying && !jumped) {
            opts.onMissAirlift(x, ms.visY, ctx.cur);
          }
        }
        if (curMissed && firstNote && ctx.cur.id === firstNote.id) ms.entryDone = true;
        ms.hop = null;
        ms.landT = 0;
        ms.wasAir = true;
        ms.wasDroneCarry = true;
        ms.lastNoteId = null;
        ms.wasPlaying = !!roll.isPlaying;
        ms.pose = {
          x: x,
          y: ms.visY,
          angle: Math.sin(fx.elapsed * 7.5) * 0.13 + 0.04,
          inAir: true,
          airU: 0.5,
          onNote: null,
          ctx: ctx,
          groundY: missGroundY,
          landT: 0,
          entryVaulting: false,
          entryOffsetPx: 0,
          cliffFalling: false,
          cliffDone: false,
          hidden: false,
          droneCarry: true,
          missNote: curMissed ? ctx.cur : null
        };
        return ms.pose;
      }
    }

    var targetY, inGap = false, airU = 0, angle = 0, onNote = null;
    var droneLiftGap = opts.droneOnMiss ? clamp(roll.rowH * 1.15, 16, 26) : 0;

    if (ctx.cur) {
      targetY = noteTopY(roll, ctx.cur);
      onNote = ctx.cur;
    } else if (ctx.prev && ctx.next) {
      var g0 = ctx.prev.start + ctx.prev.dur;
      var g1 = ctx.next.start;
      var u = clamp((playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
      var y0 = noteTopY(roll, ctx.prev) - ((opts.droneOnMiss && isNoteG2pMiss(roll, ctx.prev, ms.missCache)) ? droneLiftGap : 0);
      var y1 = noteTopY(roll, ctx.next) - ((opts.droneOnMiss && isNoteG2pMiss(roll, ctx.next, ms.missCache)) ? droneLiftGap : 0);
      var gapPx = Math.max(0, (g1 - g0) * roll.pxBeat);
      var arcH = clamp(
        (opts.minArc || 26) + Math.abs(y1 - y0) * (opts.dyScale || 0.34) + Math.min(gapPx * (opts.gapScale || 0.16), opts.maxGapBoost || 44),
        opts.minArc || 26,
        opts.maxArc || 92
      );
      targetY = y0 + (y1 - y0) * u - 4 * arcH * u * (1 - u);
      var dyDu = (y1 - y0) - 4 * arcH * (1 - 2 * u);
      angle = clamp(Math.atan2(dyDu, Math.max(26, gapPx)), opts.minAng || -0.58, opts.maxAng || 0.48);
      inGap = true;
      airU = u;
    } else if (ctx.next) {
      var dist = ctx.next.start - playPos;
      var ny = noteTopY(roll, ctx.next);
      if (dist > 0 && dist < 0.45) {
        var uLead = clamp(1 - dist / 0.45, 0, 1);
        var leadArc = (opts.minArc || 26) * 0.72;
        targetY = ny - 4 * leadArc * uLead * (1 - uLead);
        angle = clamp((2 * uLead - 1) * 0.34, -0.34, 0.34);
        inGap = true;
        airU = uLead;
      } else {
        targetY = ny;
      }
    } else if (ctx.prev) {
      targetY = noteTopY(roll, ctx.prev);
    } else {
      targetY = (roll.rulerH + roll.gridBottom()) * 0.5;
    }
    targetY = clamp(targetY, minY, maxY);

    if (jumped || !ms.hopperInit) {
      ms.hopperInit = true;
      ms.visY = targetY;
      ms.hop = null;
      ms.landT = 0;
      ms.wasAir = inGap;
      ms.wasDroneCarry = false;
      ms.lastMissNoteId = null;
      ms.lastNoteId = onNote ? onNote.id : null;
    } else {
      // 从无人机吊运（Miss 音符）直接零间隙衔接到正常音符时，平滑降落而不是瞬间闪现
      if (ms.wasDroneCarry && onNote && !inGap && Math.abs(targetY - ms.visY) > 2.5) {
        ms.hop = {
          fromY: ms.visY,
          toY: targetY,
          t: 0,
          dur: 0.13,
          arcH: 6
        };
        ms.wasDroneCarry = false;
        ms.lastMissNoteId = null;
      } else {
        ms.wasDroneCarry = false;
        ms.lastMissNoteId = null;
        // 零间隙/极短间隙连音换音高时触发弹性微跳，防止瞬移
        if (onNote && onNote.id !== ms.lastNoteId && !ms.wasAir && Math.abs(targetY - ms.visY) > 2.5) {
          var dyHop = Math.abs(targetY - ms.visY);
          ms.hop = {
            fromY: ms.visY,
            toY: targetY,
            t: 0,
            dur: clamp(0.11 + dyHop * 0.0014, 0.11, 0.22),
            arcH: clamp((opts.legatoArc || 18) + dyHop * 0.26, opts.legatoArc || 18, (opts.maxArc || 92) * 0.65)
          };
          if (opts.onTakeoff) opts.onTakeoff(x, ms.visY);
        }
        if (inGap && !ms.wasAir) {
          ms.hop = null;
          if (opts.onTakeoff) opts.onTakeoff(x, ms.visY);
        } else if (!inGap && ms.wasAir) {
          ms.hop = null;
          ms.landT = opts.landDur || 0.18;
          if (onNote && firstNote && onNote.id === firstNote.id) ms.entryDone = true;
          if (opts.onLand) opts.onLand(x, targetY, onNote);
        }
      }

      if (ms.hop) {
        ms.hop.toY = targetY;
        ms.hop.t += dt;
        if (ms.hop.t >= ms.hop.dur) {
          ms.hop = null;
          ms.visY = targetY;
          ms.landT = opts.landDur || 0.16;
          if (onNote && firstNote && onNote.id === firstNote.id) ms.entryDone = true;
          if (opts.onLand) opts.onLand(x, targetY, onNote);
        } else {
          var hu = ms.hop.t / ms.hop.dur;
          ms.visY = clamp(ms.hop.fromY + (ms.hop.toY - ms.hop.fromY) * hu - 4 * ms.hop.arcH * hu * (1 - hu), minY, maxY);
          var hdy = (ms.hop.toY - ms.hop.fromY) - 4 * ms.hop.arcH * (1 - 2 * hu);
          angle = clamp(Math.atan2(hdy, 44), opts.minAng || -0.58, opts.maxAng || 0.48);
        }
      } else {
        ms.visY = targetY;
      }

      ms.landT = Math.max(0, (ms.landT || 0) - dt);
      ms.wasAir = inGap;
      ms.lastNoteId = onNote ? onNote.id : null;
    }

    ms.wasPlaying = !!roll.isPlaying;
    var inAirNow = inGap || !!ms.hop;
    var airFrac = inGap ? airU : (ms.hop ? clamp(ms.hop.t / ms.hop.dur, 0, 1) : 0);
    ms.pose = {
      x: x,
      y: ms.visY,
      angle: angle,
      inAir: inAirNow,
      airU: airFrac,
      onNote: onNote,
      ctx: ctx,
      groundY: onNote ? clamp(noteTopY(roll, onNote), minY, maxY) : null,
      landT: ms.landT || 0,
      entryVaulting: false,
      entryOffsetPx: 0,
      cliffFalling: false,
      cliffDone: false,
      hidden: false,
      droneCarry: false,
      missNote: null
    };
    return ms.pose;
  }

  /* Miss 救援无人机：在音符 G2P/词典失败时用吊绳将小车或青蛙吊运飞过 */
  function drawRescueDrone(c, attachX, attachY, elapsed, scale, roll, A, swayAng) {
    var topLimit = (roll ? roll.rulerH : 0) + 12;
    var maxCable = Math.max(8, attachY - topLimit);
    var cableLen = clamp(24 * scale, 8, maxCable);
    var droneX = attachX - Math.sin(swayAng || 0) * cableLen * 0.28;
    var droneY = attachY - cableLen;

    c.save();
    // 1. 吊运钢索（略带摆动张力弧）与救援挂钩
    c.strokeStyle = A && A.isDark ? '#e2e8f0' : '#334155';
    c.lineWidth = Math.max(1.2, 1.5 * scale);
    c.beginPath();
    c.moveTo(droneX, droneY + 3.2 * scale);
    c.quadraticCurveTo(
      (droneX + attachX) * 0.5 - Math.sin(swayAng || 0) * 3.5 * scale,
      (droneY + attachY) * 0.5,
      attachX,
      attachY
    );
    c.stroke();

    // 挂钩圆环 + 警示黄黑卡扣
    c.fillStyle = '#f59e0b';
    c.strokeStyle = '#1e293b';
    c.lineWidth = Math.max(1, 1.1 * scale);
    c.beginPath();
    c.arc(attachX, attachY - 0.5 * scale, 2.5 * scale, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    // 2. 四旋翼救援无人机机身
    c.translate(droneX, droneY);
    c.rotate(0.08 + Math.sin(elapsed * 7.5) * 0.05);
    c.scale(scale, scale);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // 下吹气流弧线
    var washA = 0.22 + 0.14 * Math.sin(elapsed * 26);
    c.strokeStyle = 'rgba(125, 211, 252, ' + washA.toFixed(2) + ')';
    c.lineWidth = 1.1;
    var rotorXs = [-16.5, 16.5];
    for (var wi = 0; wi < 2; wi++) {
      var rwx = rotorXs[wi];
      c.beginPath();
      c.arc(rwx, 2.5, 4.5, Math.PI * 0.18, Math.PI * 0.82);
      c.stroke();
      c.beginPath();
      c.arc(rwx, 6.0, 6.2, Math.PI * 0.22, Math.PI * 0.78);
      c.stroke();
    }

    // 机臂碳纤横梁与起落架
    c.strokeStyle = '#334155';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-16.5, -1.6);
    c.lineTo(16.5, -1.6);
    c.stroke();

    // 底部起落滑橇 + 绞盘座
    c.strokeStyle = '#475569';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-7.5, 2.2); c.lineTo(-9.2, 5.4); c.lineTo(-5.0, 5.4);
    c.moveTo(7.5, 2.2); c.lineTo(9.2, 5.4); c.lineTo(5.0, 5.4);
    c.stroke();
    c.fillStyle = '#1e293b';
    roundRect(c, -2.6, 2.4, 5.2, 2.6, 1);
    c.fill();

    // 左右电机罩与高速旋转桨叶
    for (var ri = 0; ri < 2; ri++) {
      var rx = rotorXs[ri];
      // 电机支柱
      c.fillStyle = '#475569';
      c.fillRect(rx - 2, -4.6, 4, 3.6);
      c.fillStyle = '#ef4444';
      c.fillRect(rx - 1.6, -5.2, 3.2, 1.4);
      // 模糊桨盘
      c.fillStyle = A && A.isDark ? 'rgba(186, 230, 253, 0.28)' : 'rgba(56, 189, 248, 0.24)';
      c.beginPath();
      c.ellipse(rx, -5.5, 9.2, 1.8, 0, 0, Math.PI * 2);
      c.fill();
      // 高频闪烁桨叶条
      var spinW = 2.5 + Math.abs(Math.cos(elapsed * 68 + ri * 1.4)) * 6.8;
      c.strokeStyle = A && A.isDark ? '#f8fafc' : '#1e293b';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(rx - spinW, -5.5);
      c.lineTo(rx + spinW, -5.5);
      c.stroke();
    }

    // 白色救援流线主机身
    c.fillStyle = '#f8fafc';
    c.strokeStyle = '#1e293b';
    c.lineWidth = 1.3;
    roundRect(c, -10.2, -4.4, 20.4, 7.2, 3.2);
    c.fill();
    c.stroke();

    // 救援红橙条纹 + 前置青色镜头眼
    c.fillStyle = '#ef4444';
    c.fillRect(-8.8, -1.6, 14.5, 2.1);
    c.fillStyle = '#38bdf8';
    c.strokeStyle = '#0f172a';
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(6.8, -0.6, 1.9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(7.3, -1.1, 0.55, 0, Math.PI * 2);
    c.fill();

    // 顶部红白闪烁救援警示灯
    var blink = Math.sin(elapsed * 18) > 0;
    c.fillStyle = blink ? '#ff2a3c' : '#fca5a5';
    c.beginPath();
    c.arc(0, -5.4, 2.0, Math.PI, Math.PI * 2);
    c.fill();
    if (blink) {
      c.fillStyle = 'rgba(255, 42, 60, 0.36)';
      c.beginPath();
      c.arc(0, -5.8, 5.2, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  /* 通用平滑纵向跟随（用于指读、放大镜、娃娃机、聚光灯等） */
  function stepSmoothFollowerY(fx, roll, dt, jumped, targetY, speed) {
    var ms = fx.modeState;
    if (jumped || ms.followY === undefined || !isFinite(ms.followY)) {
      ms.followY = targetY;
    } else {
      var k = 1 - Math.exp(-(speed || 15) * dt);
      ms.followY += (targetY - ms.followY) * k;
    }
    return ms.followY;
  }

  /* 音游模式通用统计与曲终伪结算画面 */
  function recordRhythmHit(fx) {
    var ms = fx.modeState;
    ms.combo = (ms.combo || 0) + 1;
    ms.hitCount = (ms.hitCount || 0) + 1;
    if (ms.combo > (ms.maxCombo || 0)) ms.maxCombo = ms.combo;
    ms.comboPop = 1;
  }

  function recordRhythmCp(fx) {
    var ms = fx.modeState;
    ms.cpHits = (ms.cpHits || 0) + 1;
  }

  function recordRhythmMiss(fx) {
    var ms = fx.modeState;
    ms.combo = 0;
    ms.missCount = (ms.missCount || 0) + 1;
    ms.missFlash = 1;
  }

  /* 判定音符是否因 G2P 失败或词典未命中而视为 Miss（自动排除休止、换气、延音续接与手动音素） */
  function isNoteG2pMiss(roll, n, cache) {
    if (!n) return false;
    var rawLyric = String(n.lyric || '').trim();
    var lang = (roll && typeof roll.noteLanguage === 'function')
      ? roll.noteLanguage(n)
      : (n.noteLang || (n.langSource === 'note' ? n.lang : '') || (roll && roll.phonemizer) || n.lang || (roll && roll.lang) || 'zh');
    var hasEnDict = !!(root.NSG_DICT && root.NSG_DICT.en);
    var cacheKey = String(n.id) + '\x00' + rawLyric + '\x00' + lang + '\x00' +
      String(n.phonesSource || '') + '\x00' + (n.slur ? '1' : '0') + '\x00' + (hasEnDict ? '1' : '0');
    if (cache && Object.prototype.hasOwnProperty.call(cache, cacheKey)) return cache[cacheKey];

    var missed = false;
    var pronInfo = roll && roll._cachedPronInfo && roll._cachedPronInfo[n.id];
    if (pronInfo && pronInfo.error) {
      missed = true;
    } else if (n._phonemeError) {
      missed = true;
    } else if (!n.slur &&
               !(pronInfo && pronInfo.custom && pronInfo.phones && pronInfo.phones.length) &&
               !(/^(manual|imported)$/.test(n.phonesSource || '') && n.phones && n.phones.length)) {
      var kind = (NSG.noteKind && typeof NSG.noteKind === 'function') ? NSG.noteKind(n) : 'voiced';
      var stripped = rawLyric.replace(/\s*\[[^\]]*\]/g, '').trim();
      var isSlurSym = /^(?:\+[~*]?|[-—–―‿=＿~～]+|ー)$/.test(stripped);
      if (kind === 'voiced' && !isSlurSym) {
        if (!stripped) {
          missed = true;
        } else if (NSG.g2p && typeof NSG.g2p === 'function') {
          try {
            var syls = NSG.g2p(rawLyric, lang);
            if (!syls || !syls.length) {
              missed = true;
            } else {
              for (var si = 0; si < syls.length; si++) {
                var sy = syls[si];
                if (!sy) continue;
                var rm = String(sy.roman || '').trim();
                if (rm === '?' || (lang === 'en' && hasEnDict && rm === '(规则推导)')) {
                  missed = true;
                  break;
                }
                if (!sy.phones || !sy.phones.length) {
                  missed = true;
                  break;
                }
              }
            }
          } catch (e) {
            missed = true;
          }
        }
      }
    }
    if (cache) cache[cacheKey] = missed;
    return missed;
  }

  /* 音游长条判定：严格长于 1/4 小节（即 > 1 拍）才作为滑条/连打长条 */
  function isLongRhythmNote(n) {
    return !!(n && n.dur > 1 + 1e-4);
  }

  /* 将连续的延音与拆词音符归并为一整根“面条”，共享总时长与滑条/连打判定 */
  function getRhythmNoodles(roll) {
    var notes = (!roll || roll.activeTrackVisible === false) ? [] : (roll.notes || []);
    var byNoteId = Object.create(null);
    var list = [];
    if (!notes.length) return { list: list, byNoteId: byNoteId };

    var sorted = notes.slice().sort(function (a, b) {
      return (a.start - b.start) || (a.pitch - b.pitch);
    });
    var pronGroups = roll._cachedPronGroups || null;
    if (!pronGroups && NSG.pronunciationGroups) {
      try { pronGroups = NSG.pronunciationGroups(sorted, roll._frameNotes || undefined); } catch (e) { pronGroups = null; }
    }

    var curNoodle = null;
    var prev = null;
    for (var i = 0; i < sorted.length; i++) {
      var n = sorted[i];
      if (!n) continue;
      var touching = prev && Math.abs(prev.start + prev.dur - n.start) < 0.004;
      var sameGroup = false;
      if (touching && curNoodle) {
        var pg = pronGroups && pronGroups[n.id];
        var pgPrev = pronGroups && pronGroups[prev.id];
        if (pg && pgPrev && pg.index >= 0 && pgPrev.index >= 0) {
          sameGroup = (pg.headId === curNoodle.head.id);
        } else {
          var lyr = String(n.lyric || '').trim();
          var prevLyr = String(prev.lyric || '').trim();
          var numbered = lyr.match(/^(.+?)#([1-9]\d*)$/);
          var prevNum = prevLyr.match(/^(.+?)#([1-9]\d*)$/);
          sameGroup = !!(
            n.slur ||
            /^(?:\+[~*]?|[-—–―‿=＿~～]+|ー)$/.test(lyr) ||
            (numbered && +numbered[2] > 1 && prevNum && numbered[1] === prevNum[1] && +numbered[2] === +prevNum[2] + 1) ||
            /^[-+].+/.test(lyr) || /.+[-+]$/.test(prevLyr) ||
            n.wordJoinDirection === 'left' || n.wordJoinDirection === 'middle' ||
            /^(right|middle)$/.test(prev.wordJoinDirection || '') ||
            (!n.wordJoinDirection && n.wordJoin && prev.wordJoin && !(numbered && +numbered[2] === 1))
          );
          if (n.phonemeWordJoin !== undefined) sameGroup = n.phonemeWordJoin === true;
        }
      }
      if (sameGroup && curNoodle) {
        curNoodle.notes.push(n);
        curNoodle.end = Math.max(curNoodle.end, n.start + n.dur);
        curNoodle.dur = curNoodle.end - curNoodle.start;
        curNoodle.isLong = curNoodle.dur > 1 + 1e-4;
        byNoteId[n.id] = curNoodle;
      } else {
        var nd = {
          id: n.id,
          head: n,
          notes: [n],
          start: n.start,
          end: n.start + n.dur,
          dur: n.dur,
          isLong: n.dur > 1 + 1e-4,
          index: list.length
        };
        list.push(nd);
        byNoteId[n.id] = nd;
        curNoodle = nd;
      }
      prev = n;
    }
    return { list: list, byNoteId: byNoteId };
  }

  /* 计算“面条”在任意拍位 beat 处的中心 Y（以各音段音高为中心、段间平滑 S 弯衔接，首尾严格对齐音符正中，不受跨音符滑音拖偏） */
  function sampleNoodleY(roll, noodle, beat) {
    var list = noodle && noodle.notes;
    if (!list || !list.length) return (roll.rulerH + roll.gridBottom()) * 0.5;
    if (list.length === 1) return noteCenterY(roll, list[0]);
    var b = clamp(beat, noodle.start, noodle.end);
    for (var i = 0; i + 1 < list.length; i++) {
      var a = list[i], nxt = list[i + 1];
      var jb = a.start + a.dur;
      var half = Math.min(0.16, a.dur * 0.35, nxt.dur * 0.35);
      if (half > 1e-4 && b >= jb - half && b <= jb + half) {
        var u = clamp((b - (jb - half)) / (2 * half), 0, 1);
        var su = u * u * (3 - 2 * u);
        var ya = noteCenterY(roll, a), yb = noteCenterY(roll, nxt);
        return ya + (yb - ya) * su;
      }
    }
    for (var j = 0; j < list.length; j++) {
      var seg = list[j];
      if (b <= seg.start + seg.dur + 1e-4 || j === list.length - 1) return noteCenterY(roll, seg);
    }
    return noteCenterY(roll, list[0]);
  }

  /* 采样整根“面条”的平滑滑条中心曲线：起点严格落于首音符开头正中（与击打圆圈圆心重合），段间平滑弯折 */
  function sampleNoodleCurve(roll, noodle) {
    var list = noodle && noodle.notes;
    var pts = [];
    if (!list || !list.length) return pts;
    var headY = noteCenterY(roll, list[0]);
    pts.push({ x: roll.beatX(noodle.start), y: headY });
    for (var i = 0; i + 1 < list.length; i++) {
      var a = list[i], nxt = list[i + 1];
      var ya = noteCenterY(roll, a), yb = noteCenterY(roll, nxt);
      if (Math.abs(yb - ya) <= 0.5) continue;
      var jb = a.start + a.dur;
      var half = Math.min(0.16, a.dur * 0.35, nxt.dur * 0.35);
      if (half > 1e-4) {
        var steps = 8;
        for (var s = 0; s <= steps; s++) {
          var u = s / steps;
          var sb = (jb - half) + 2 * half * u;
          var su = u * u * (3 - 2 * u);
          pts.push({ x: roll.beatX(sb), y: ya + (yb - ya) * su });
        }
      } else {
        pts.push({ x: roll.beatX(jb), y: ya });
        pts.push({ x: roll.beatX(jb), y: yb });
      }
    }
    var tailY = noteCenterY(roll, list[list.length - 1]);
    var endX = roll.beatX(noodle.end);
    if (!pts.length || Math.hypot(endX - pts[pts.length - 1].x, tailY - pts[pts.length - 1].y) >= 0.5) {
      pts.push({ x: endX, y: tailY });
    }
    return pts;
  }

  function formatCommaInt(n) {
    return String(Math.max(0, Math.round(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function stepRhythmResults(fx, roll, dt, jumped, styleId, opts) {
    var ms = fx.modeState;
    var notes = (!roll || roll.activeTrackVisible === false) ? [] : (roll.notes || []);
    var lastEnd = -Infinity;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n && n.start + n.dur > lastEnd) lastEnd = n.start + n.dur;
    }
    if (!notes.length || roll.playPos < lastEnd - 0.15) {
      ms.results = null;
      ms.endHoldT = 0;
      if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) {
        ms.hitCount = 0;
        ms.missCount = 0;
        ms.maxCombo = 0;
        ms.cpHits = 0;
      }
      ms.wasPlaying = !!roll.isPlaying;
      return;
    }

    var hitsNow = ms.hitCount || ms.combo || 0;
    var missNow = ms.missCount || 0;
    if ((hitsNow + missNow) > 0 && roll.playPos >= lastEnd - 0.08) {
      var pastEnd = roll.playPos > lastEnd + 0.05;
      var stoppedAtEnd = !roll.isPlaying && (ms.wasPlaying || pastEnd || roll.playPos >= lastEnd - 0.06);
      if (pastEnd || stoppedAtEnd) {
        if (!ms.results) {
          ms.endHoldT = (ms.endHoldT || 0) + dt;
          if (!roll.isPlaying || ms.endHoldT >= 0.26) {
            var total = (opts && opts.totalCount > 0) ? opts.totalCount : notes.length;
            var hits = Math.max(0, hitsNow);
            var misses = Math.max(0, missNow);
            var maxCombo = Math.max(0, ms.maxCombo || ms.combo || 0);
            var cpHits = ms.cpHits || 0;
            var spinBonus = ms.spinBonusCount || 0;
            var full = misses === 0 && hits >= total;
            var judged = Math.max(1, hits + misses);
            var acc = misses === 0
              ? (full ? 100 : Number(clamp(93.5 + clamp(hits / Math.max(1, total), 0.5, 1) * 6.45, 93.5, 99.95).toFixed(2)))
              : Number(clamp((hits / judged) * 100, 0, 99.99).toFixed(2));
            var hitRatio = clamp(hits / Math.max(1, total), 0, 1);
            var comboRatio = clamp(maxCombo / Math.max(1, total), 0, 1);
            var score;
            if (styleId === 'judgeLineSpin') {
              score = full ? 1000000 : Math.round(900000 * hitRatio + 100000 * comboRatio);
            } else if (styleId === 'railHighway') {
              score = full ? 1000000 : Math.round(900000 * hitRatio + 100000 * comboRatio + cpHits * 100);
            } else if (styleId === 'twinOrbits') {
              score = Math.round(hits * 500 + maxCombo * 180 + cpHits * 300);
            } else if (styleId === 'drumParade') {
              score = Math.round(hits * 1200 + maxCombo * 250 + cpHits * 500);
            } else {
              score = Math.round(hits * 300 * (1 + maxCombo * 0.12) + cpHits * 100 + spinBonus * 1000);
            }
            ms.results = {
              styleId: styleId,
              t: 0,
              stamped: false,
              total: total,
              hits: hits,
              misses: misses,
              maxCombo: maxCombo,
              cpHits: cpHits,
              spinBonus: spinBonus,
              full: full,
              score: score,
              acc: acc
            };
          }
        }
      }
    }

    if (ms.results) {
      ms.results.t += dt;
      if (ms.results.t >= 0.34 && !ms.results.stamped) {
        ms.results.stamped = true;
        var gridH = roll.gridBottom();
        var viewW = Math.max(1, roll.w - roll.kbW);
        var viewH = Math.max(1, gridH - roll.rulerH);
        var cardW = clamp(viewW * 0.78, 280, 470);
        var cx = roll.kbW + viewW * 0.5;
        var cy = roll.rulerH + viewH * 0.5;
        var rx = cx + cardW * 0.28;
        var ry = cy - 4;
        var stampCol = styleId === 'railHighway' ? '#00f5ff' : (styleId === 'drumParade' ? '#ff4b3e' : '#ffe042');
        fx.spawn({ kind: 'ring', x: rx, y: ry, r: 12, maxR: 72, color: stampCol, lineW: 3.5, life: 0.55 });
        fx.spawn({ kind: 'ring', x: rx, y: ry, r: 8, maxR: 50, color: '#ffffff', lineW: 2, life: 0.45 });
        for (var si = 0; si < 12; si++) {
          var sa = (si / 12) * Math.PI * 2;
          var sp = 65 + Math.random() * 85;
          fx.spawn({
            kind: styleId === 'judgeLineSpin' ? 'square' : 'star',
            x: rx, y: ry,
            vx: Math.cos(sa) * sp,
            vy: Math.sin(sa) * sp,
            r: 3.5 + Math.random() * 2.5,
            rot: sa,
            vrot: (Math.random() - 0.5) * 10,
            color: si % 2 ? '#ffe042' : stampCol,
            life: 0.72
          });
        }
      }
    }
    ms.wasPlaying = !!roll.isPlaying;
  }

  function drawRhythmResults(fx, c, roll, T, A) {
    var ms = fx.modeState;
    var res = ms && ms.results;
    if (!res) return;

    var gridH = roll.gridBottom();
    var viewW = Math.max(1, roll.w - roll.kbW);
    var viewH = Math.max(1, gridH - roll.rulerH);
    var cx = roll.kbW + viewW * 0.5;
    var cy = roll.rulerH + viewH * 0.5;
    var cardW = clamp(viewW * 0.78, 276, 476);
    var cardH = clamp(viewH * 0.74, 166, 246);
    var t = res.t;
    var bgAlpha = clamp(t / 0.24, 0, 1);
    var cardEase = 1 - Math.pow(1 - clamp(t / 0.28, 0, 1), 3);
    var rollEase = 1 - Math.pow(1 - clamp(t / 0.55, 0, 1), 3);
    var dispScore = Math.round(res.score * rollEase);
    var lang = langCode();
    var st = res.styleId;

    // 风格配置（五种音游各自独立配色、评级徽章与统计项，含 G2P/词典失败 MISS 降级）
    var hasMiss = (res.misses || 0) > 0;
    var missStr = String(res.misses || 0);
    var missCol = hasMiss ? '#f87171' : '#94a3b8';
    var cfg;
    if (st === 'judgeLineSpin') {
      var jRank = res.full ? 'Φ' : (!hasMiss ? 'V' : (res.acc >= 95 ? 'S' : (res.acc >= 85 ? 'A' : (res.acc >= 70 ? 'B' : 'C'))));
      cfg = {
        bgTop: 'rgba(10, 18, 38, 0.93)',
        bgBot: 'rgba(18, 30, 56, 0.93)',
        border: hasMiss ? '#f87171' : '#ffe566',
        accent: '#5ce1e6',
        accent2: hasMiss ? '#fca5a5' : '#ffe566',
        title: lang === 'ja' ? 'リザルト' : (lang === 'en' ? 'STAGE CLEAR' : '演奏结算'),
        badge: res.full ? 'ALL PERFECT' : (!hasMiss ? 'FULL COMBO' : (res.acc >= 70 ? 'STAGE CLEAR' : 'TRACK FAILED')),
        rank: jRank,
        rankCol: res.full ? '#fff2a6' : (hasMiss ? (res.acc >= 85 ? '#38bdf8' : '#f87171') : '#5ce1e6'),
        rankStroke: res.full ? '#d97706' : (hasMiss ? '#7f1d1d' : '#0369a1'),
        scoreText: String(dispScore).padStart(7, '0'),
        rows: [
          ['PERFECT', String(res.hits), '#ffe566'],
          ['GOOD / BAD', '0 / 0', '#5ce1e6'],
          ['MISS', missStr, missCol],
          ['MAX COMBO', res.maxCombo + ' / ' + res.total, '#ffffff']
        ]
      };
    } else if (st === 'drumParade') {
      var dRank = res.full ? (lang === 'en' ? 'MAX' : '极') : (!hasMiss ? (lang === 'en' ? 'S' : '良') : (res.acc >= 90 ? (lang === 'en' ? 'A' : '优') : (res.acc >= 70 ? (lang === 'en' ? 'B' : '可') : (lang === 'en' ? 'F' : '不可'))));
      cfg = {
        bgTop: 'rgba(66, 16, 18, 0.94)',
        bgBot: 'rgba(38, 12, 16, 0.94)',
        border: hasMiss ? '#f87171' : '#ffe042',
        accent: '#ff4b3e',
        accent2: '#ffe042',
        title: lang === 'ja' ? '演奏結果発表！' : (lang === 'en' ? 'FESTIVAL CLEAR!' : '祭典演奏结算！'),
        badge: res.full ? (lang === 'en' ? 'FULL COMBO!' : '全连达成！') : (!hasMiss ? (lang === 'en' ? 'STAGE CLEAR!' : '通关达成！') : (res.acc >= 70 ? (lang === 'en' ? 'CLEARED' : '勉强通关') : (lang === 'en' ? 'FAILED!' : '祭典翻车！'))),
        rank: dRank,
        rankCol: hasMiss && res.acc < 70 ? '#f87171' : '#ffe042',
        rankStroke: '#b91c1c',
        scoreText: formatCommaInt(dispScore) + (lang === 'en' ? ' pts' : ' 分'),
        rows: [
          [lang === 'en' ? 'GREAT' : '良', String(res.hits), '#ffe042'],
          [lang === 'en' ? 'OK / MISS' : '可 / 不可', '0 / ' + missStr, hasMiss ? '#f87171' : '#fb923c'],
          [lang === 'ja' ? '連打' : (lang === 'en' ? 'ROLLS' : '连打'), String(res.cpHits), '#38bdf8'],
          [lang === 'en' ? 'MAX COMBO' : '最大连击', String(res.maxCombo), '#ffffff']
        ]
      };
    } else if (st === 'twinOrbits') {
      var tRank = res.full ? 'P' : (!hasMiss ? 'S+' : (res.acc >= 95 ? 'A' : (res.acc >= 80 ? 'B' : 'C')));
      cfg = {
        bgTop: 'rgba(34, 10, 22, 0.94)',
        bgBot: 'rgba(8, 22, 42, 0.94)',
        border: hasMiss ? '#f87171' : '#ff5247',
        accent: '#ff3b30',
        accent2: '#00d4ff',
        title: lang === 'ja' ? '双星リザルト' : (lang === 'en' ? 'ORBIT RESULTS' : '双星旋舞结算'),
        badge: res.full ? 'PURE PERFECT!' : (!hasMiss ? 'TRACK CLEAR!' : (res.acc >= 70 ? 'ORBIT CLEAR' : 'DERAILED!')),
        rank: tRank,
        rankCol: hasMiss ? (res.acc >= 80 ? '#72f2ff' : '#f87171') : '#fff0a6',
        rankStroke: '#e11d48',
        scoreText: res.acc.toFixed(2) + '% · ' + formatCommaInt(dispScore),
        rows: [
          ['PERFECT', String(res.hits), '#ffe066'],
          ['MISS', missStr, missCol],
          ['SWIRLS (PIT)', String(res.cpHits), '#c084fc'],
          ['MAX STREAK', String(res.maxCombo), '#ff6b57']
        ]
      };
    } else if (st === 'railHighway') {
      var rRank = res.full ? 'AAA+' : (!hasMiss ? 'EX+' : (res.acc >= 95 ? 'AA' : (res.acc >= 85 ? 'A' : (res.acc >= 70 ? 'B' : 'C'))));
      cfg = {
        bgTop: 'rgba(8, 14, 34, 0.94)',
        bgBot: 'rgba(26, 10, 44, 0.94)',
        border: hasMiss ? '#f87171' : '#00f5ff',
        accent: '#ff38b8',
        accent2: '#00f5ff',
        title: lang === 'ja' ? 'RESULT · TRACK CLEAR' : (lang === 'en' ? 'RESULT · TRACK CLEAR' : '街机结算 · RESULT'),
        badge: !hasMiss ? 'NEW RECORD!!' : (res.acc >= 70 ? 'TRACK CLEAR' : 'STAGE FAILED'),
        rank: rRank,
        rankCol: hasMiss && res.acc < 70 ? '#f87171' : '#00f5ff',
        rankStroke: '#d91b7a',
        scoreText: formatCommaInt(dispScore),
        rows: [
          ['MARVELOUS', String(res.hits), '#ffe042'],
          ['PERFECT / GREAT', '0 / 0', '#00f5ff'],
          ['MISS', missStr, missCol],
          ['MAX CHAIN', String(res.maxCombo), '#ff66cc']
        ]
      };
    } else {
      var cRank = res.full ? 'SS' : (!hasMiss ? 'S' : (res.acc >= 95 ? 'A' : (res.acc >= 85 ? 'B' : (res.acc >= 70 ? 'C' : 'D'))));
      cfg = {
        bgTop: 'rgba(28, 12, 38, 0.94)',
        bgBot: 'rgba(14, 18, 42, 0.94)',
        border: hasMiss ? '#f87171' : '#ff5ca8',
        accent: '#38d9ff',
        accent2: '#ffe042',
        title: lang === 'ja' ? 'リザルト · RANKING' : (lang === 'en' ? 'RESULTS · RANKING' : '演奏结算 · RANKING'),
        badge: res.full ? 'FULL COMBO!' : (!hasMiss ? 'PASSED!' : (res.acc >= 50 ? 'CLEAR' : 'FAIL...')),
        rank: cRank,
        rankCol: hasMiss ? (res.acc >= 85 ? '#4ce886' : (res.acc >= 70 ? '#c084fc' : '#f87171')) : '#ffe566',
        rankStroke: hasMiss ? '#450a0a' : '#b45309',
        scoreText: formatCommaInt(dispScore),
        rows: [
          ['300', String(res.hits), '#38d9ff'],
          ['100 / 50', '0 / 0', '#4ce886'],
          ['MISS', missStr, missCol],
          ['MAX COMBO', res.maxCombo + 'x · ' + res.acc.toFixed(2) + '%', '#ff7ac3']
        ]
      };
    }

    // 1. 全屏柔暗背幕
    c.save();
    c.fillStyle = 'rgba(4, 8, 20, ' + (0.58 * bgAlpha).toFixed(3) + ')';
    c.fillRect(roll.kbW, roll.rulerH, viewW, viewH);

    // 2. 结算卡片主体（平滑弹入）
    var x0 = cx - cardW * 0.5;
    var y0 = cy - cardH * 0.5 + (1 - cardEase) * 18;
    c.globalAlpha = clamp(cardEase * 1.15, 0, 1);

    var cg = c.createLinearGradient(x0, y0, x0 + cardW, y0 + cardH);
    cg.addColorStop(0, cfg.bgTop);
    cg.addColorStop(1, cfg.bgBot);
    c.fillStyle = cg;
    roundRect(c, x0, y0, cardW, cardH, 12);
    c.fill();

    // 顶部炫彩细横条
    c.save();
    roundRect(c, x0, y0, cardW, cardH, 12);
    c.clip();
    var barG = c.createLinearGradient(x0, 0, x0 + cardW, 0);
    barG.addColorStop(0, cfg.accent);
    barG.addColorStop(0.5, cfg.border);
    barG.addColorStop(1, cfg.accent2);
    c.fillStyle = barG;
    c.fillRect(x0, y0, cardW, 4);
    // 卡片背景斜向高光装饰带
    c.fillStyle = 'rgba(255, 255, 255, 0.04)';
    c.beginPath();
    c.moveTo(x0 + cardW * 0.54, y0);
    c.lineTo(x0 + cardW, y0);
    c.lineTo(x0 + cardW, y0 + cardH);
    c.lineTo(x0 + cardW * 0.42, y0 + cardH);
    c.closePath();
    c.fill();
    c.restore();

    // 外边框
    c.strokeStyle = cfg.border;
    c.lineWidth = 2;
    roundRect(c, x0, y0, cardW, cardH, 12);
    c.stroke();

    // 3. 左侧：标题 + 通关徽章 + 滚动大分数 + 详细判定行
    var padX = 18;
    var leftX = x0 + padX;
    var curY = y0 + 22;
    drawTextHalo(c, cfg.title, leftX, curY, 12, '#cbd5e1', 'rgba(0,0,0,0.6)', 2, 'left', 'Tahoma, "Microsoft YaHei", sans-serif');

    // 右侧标题胶囊（ALL PERFECT / FULL COMBO / NEW RECORD!!）
    var pillTxt = cfg.badge;
    c.save();
    c.font = 'bold 10.5px Tahoma, "Microsoft YaHei", sans-serif';
    var pillW = c.measureText(pillTxt).width + 14;
    var pillX = x0 + cardW - padX - pillW;
    var pillPulse = st === 'railHighway' ? (0.65 + 0.35 * Math.sin(fx.elapsed * 12)) : 1;
    c.globalAlpha *= pillPulse;
    c.fillStyle = colorAlpha(cfg.border, 0.22);
    c.strokeStyle = cfg.border;
    c.lineWidth = 1.2;
    roundRect(c, pillX, curY - 9, pillW, 18, 9);
    c.fill(); c.stroke();
    drawTextHalo(c, pillTxt, pillX + pillW * 0.5, curY + 0.5, 10.5, cfg.accent2, 'rgba(0,0,0,0.7)', 2, 'center', 'Tahoma, "Microsoft YaHei", sans-serif');
    c.restore();

    // 滚动大分数
    curY += 28;
    drawTextHalo(c, cfg.scoreText, leftX, curY, clamp(cardW * 0.068, 22, 30), '#ffffff', colorAlpha(cfg.accent, 0.75), 3.2, 'left', 'Impact, Consolas, monospace');

    // 判定统计行
    var rowStartY = curY + 26;
    var rowGap = clamp((cardH - 104) / 4, 17, 24);
    var valColX = x0 + Math.min(cardW * 0.56, 255);
    for (var ri = 0; ri < cfg.rows.length; ri++) {
      var rw = cfg.rows[ri];
      var ry = rowStartY + ri * rowGap;
      drawTextHalo(c, rw[0], leftX, ry, 11.5, rw[2], 'rgba(0,0,0,0.72)', 2, 'left', 'Tahoma, "Microsoft YaHei", sans-serif');
      drawTextHalo(c, rw[1], valColX, ry, 12.5, '#ffffff', 'rgba(0,0,0,0.75)', 2.2, 'right', 'Consolas, Tahoma, sans-serif');
    }

    // 4. 右侧：砸章入场的巨型评级徽章（SS / Φ / 极 / AAA+）
    if (t >= 0.30) {
      var stT = clamp((t - 0.30) / 0.22, 0, 1);
      var stampScale = 2.2 - 1.2 * (1 - Math.pow(1 - stT, 3));
      var rankX = x0 + cardW * 0.78;
      var rankY = y0 + cardH * 0.50;
      c.save();
      c.translate(rankX, rankY);
      // 背后缓转光芒星芒
      c.save();
      c.globalAlpha = 0.24 * stT;
      c.fillStyle = cfg.rankCol;
      drawStar(c, 0, 0, 10, clamp(cardH * 0.34, 42, 64), clamp(cardH * 0.19, 24, 36), fx.elapsed * 0.7);
      c.fill();
      c.restore();

      c.scale(stampScale, stampScale);
      c.rotate(-0.08);
      var rankSz = cfg.rank.length >= 3 ? clamp(cardH * 0.23, 30, 44) : clamp(cardH * 0.34, 42, 64);
      c.shadowColor = cfg.rankCol;
      c.shadowBlur = A.isPixel ? 0 : 18;
      drawTextHalo(c, cfg.rank, 0, 0, rankSz, cfg.rankCol, cfg.rankStroke, 5.5, 'center', 'Impact, Georgia, "Microsoft YaHei", serif');
      c.shadowBlur = 0;
      c.restore();
    }

    // 5. 底部吐槽提示栏
    var footTxt = hasMiss
      ? (lang === 'ja'
        ? ('💥 ' + res.misses + ' 個の音符が G2P/辞書不一致（MISS）· 巻戻しで復帰')
        : (lang === 'en'
          ? ('💥 ' + res.misses + ' note(s) failed G2P/dict lookup (MISS) · Rewind to return')
          : ('💥 有 ' + res.misses + ' 个音符 G2P/词典匹配失败（已判 MISS）· 倒带继续调教')))
      : (lang === 'ja'
        ? '✨ MODS: 全自動歌唱 · ルーラークリック / 巻戻しで復帰'
        : (lang === 'en'
          ? '✨ MODS: AUTO-SING · Click ruler or rewind to return'
          : '✨ 实际判定：全自动摸鱼代打 · 点击标尺或倒带继续调教'));
    drawTextHalo(c, footTxt, cx, y0 + cardH - 13, 10.5, hasMiss ? '#fca5a5' : 'rgba(226, 232, 240, 0.88)', 'rgba(0,0,0,0.75)', 2, 'center', 'Tahoma, "Microsoft YaHei", sans-serif');
    c.restore();
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
  var POINT_LINES = {
    zh: ['唱!', '这里!', '这个!', '跟上!', '看这!', '对对对!', '下一个!'],
    en: ['SING!', 'HERE!', 'THIS ONE!', 'KEEP UP!', 'LOOK!', 'NEXT!'],
    ja: ['ここ!', 'これ!', '歌って!', '注目!', 'はい!', '次!']
  };
  var FROG_LINES = {
    zh: ['呱!', '咕呱!', '呱呱!', '真香!', '跳!'],
    en: ['RIBBIT!', 'CROAK!', 'BOING!', 'YUM!', 'HOP!'],
    ja: ['ケロ!', 'ゲコ!', 'ケロケロ!', 'ぴょん!', 'うまっ!']
  };
  var CLUE_LINES = {
    zh: ['线索!', '破案了!', '真相只有一个!', '音准波动!', '可疑!', '发现目标!'],
    en: ['CLUE!', 'AHA!', 'SUSPICIOUS!', 'ELEMENTARY!', 'FOUND IT!', 'PITCH?!'],
    ja: ['証拠発見!', '真実は一つ!', '怪しい!', 'なるほど!', '手がかり!']
  };
  var CLAW_LINES = {
    zh: ['松爪了!', '差一点!', '黑心机器!', '再来一币!', '滑掉了!'],
    en: ['SLIPPED!', 'SO CLOSE!', 'RIGGED!!', 'INSERT COIN!', 'NOOO!'],
    ja: ['あっ…', '惜しい!', 'アーム弱すぎ!', 'もう一回!', '落ちた!']
  };

  /* ========================================================================
   * 25 种模式定义
   * 8 种正常/晒调教模式 (showcase: true) + 17 种莫名其妙×120模式
   * ======================================================================== */
  var MODES = [
    /* --- A. 适合晒调教（8种） --- */
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

    {
      id: 'spotlightStage',
      showcase: true,
      usesPit: true,
      hidePlayhead: true,
      linger: 0.85,
      nameKey: 'eye.mode.spotlightStage',
      fallbackName: '聚光灯独白',
      eyeColor: { iris: '#ffe066', ring: '#ffffff', pupil: '#1a1628' },
      onControlPoint: function (fx, n, cp, T, A) {
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 3, maxR: 22, color: '#ffe885', lineW: 1.8, life: 0.62 });
        fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 18, r: 2.2, color: '#ffffff', life: 0.55 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var pitchInfo = roll._lastPitchInfo || null;
        var targetY = (roll.rulerH + roll.gridBottom()) * 0.5;
        if (ctx.cur) {
          var rel = ctx.cur.dur > 0 ? clamp((roll.playPos - ctx.cur.start) / ctx.cur.dur, 0, 1) : 0;
          var nInfo = pitchInfo ? pitchInfo[ctx.cur.id] : null;
          targetY = (roll.showPitch && nInfo) ? samplePitchY(roll, ctx.cur, rel, nInfo) : noteCenterY(roll, ctx.cur);
        } else if (ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var u = clamp((roll.playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
          var smoothU = u * u * (3 - 2 * u);
          targetY = noteCenterY(roll, ctx.prev) + (noteCenterY(roll, ctx.next) - noteCenterY(roll, ctx.prev)) * smoothU;
        } else if (ctx.next) {
          targetY = noteCenterY(roll, ctx.next);
        } else if (ctx.prev) {
          targetY = noteCenterY(roll, ctx.prev);
        }
        targetY = clamp(targetY, roll.rulerH + 18, roll.gridBottom() - 18);
        stepSmoothFollowerY(fx, roll, dt, jumped, targetY, 16);
        fx.modeState.ctx = ctx;

        // 聚光灯光柱中漂浮的细微舞台尘埃
        if (roll.isPlaying && Math.random() < 0.24) {
          var sx = roll.beatX(roll.playPos);
          if (sx >= roll.kbW && sx <= roll.w) {
            fx.spawn({
              kind: 'spark',
              x: sx + (Math.random() - 0.5) * 64,
              y: fx.modeState.followY + (Math.random() - 0.5) * 56,
              vx: (Math.random() - 0.5) * 10,
              vy: -6 - Math.random() * 12,
              r: 1.1 + Math.random() * 1.4,
              color: Math.random() < 0.65 ? '#fff3b8' : '#ffffff',
              life: 0.9 + Math.random() * 0.6
            });
          }
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var gridH = roll.gridBottom();
        var spotX = roll.beatX(roll.playPos);
        var spotY = fx.modeState.followY !== undefined ? fx.modeState.followY : (roll.rulerH + gridH) * 0.5;
        var spotR = clamp(roll.rowH * 4.2, 68, 128);

        // 舞台暗场渐晕 + 聚光灯中心暖色照明池
        c.save();
        var vg = c.createRadialGradient(spotX, spotY, spotR * 0.22, spotX, spotY, spotR * 2.15);
        vg.addColorStop(0, A.isDark ? 'rgba(255, 245, 198, 0.16)' : 'rgba(255, 248, 212, 0.14)');
        vg.addColorStop(0.42, 'rgba(255, 240, 185, 0.02)');
        vg.addColorStop(0.72, A.isDark ? 'rgba(4, 6, 16, 0.44)' : 'rgba(12, 20, 36, 0.28)');
        vg.addColorStop(1, A.isDark ? 'rgba(4, 6, 16, 0.64)' : 'rgba(12, 20, 36, 0.44)');
        c.fillStyle = vg;
        c.fillRect(roll.kbW, roll.rulerH, roll.w - roll.kbW, gridH - roll.rulerH);

        // 顶灯投射下来的体积光锥
        var lampX = roll.kbW + (roll.w - roll.kbW) * 0.5;
        var lampY = roll.rulerH - 8;
        var dx = spotX - lampX, dy = spotY - lampY;
        var len = Math.max(1, Math.hypot(dx, dy));
        var nx = -dy / len, ny = dx / len;
        var beamR = spotR * 0.68;
        var cone = c.createLinearGradient(lampX, lampY, spotX, spotY + beamR * 0.4);
        cone.addColorStop(0, A.isDark ? 'rgba(255, 248, 214, 0.22)' : 'rgba(255, 244, 190, 0.20)');
        cone.addColorStop(0.75, A.isDark ? 'rgba(255, 236, 168, 0.10)' : 'rgba(255, 232, 150, 0.09)');
        cone.addColorStop(1, 'rgba(255, 236, 168, 0)');
        c.fillStyle = cone;
        c.beginPath();
        c.moveTo(lampX - 10, lampY);
        c.lineTo(lampX + 10, lampY);
        c.lineTo(spotX + nx * beamR, spotY + ny * beamR);
        c.lineTo(spotX - nx * beamR, spotY - ny * beamR);
        c.closePath();
        c.fill();

        // 正在演唱的音符获得温暖舞台追光边与光丝 PIT
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;
          c.globalAlpha = alpha * 0.85;
          c.shadowColor = '#ffe484';
          c.shadowBlur = A.isPixel ? 0 : 14;
          c.strokeStyle = '#fff0a8';
          c.lineWidth = 2;
          roundRect(c, g.x - 1, g.y - 1, g.w + 2, g.h + 2, (T.noteRadius || 0) + 1);
          c.stroke();
          c.shadowBlur = 0;

          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(10, Math.ceil(g.w * prog / 3)));
            if (curve.length > 1) {
              c.lineCap = 'round'; c.lineJoin = 'round';
              c.strokeStyle = 'rgba(255, 230, 130, 0.42)';
              c.lineWidth = 5.5;
              c.beginPath();
              for (var k = 0; k < curve.length; k++) { if (!k) c.moveTo(curve[k].x, curve[k].y); else c.lineTo(curve[k].x, curve[k].y); }
              c.stroke();
              c.strokeStyle = '#fff9d6';
              c.lineWidth = 2;
              c.stroke();
            }
          }
        }
        c.restore();
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var gridH = roll.gridBottom();
        var spotX = roll.beatX(roll.playPos);
        var spotY = fx.modeState.followY !== undefined ? fx.modeState.followY : (roll.rulerH + gridH) * 0.5;

        // 追光中心柔和星芒焦点（取代播放指针）
        if (spotX >= roll.kbW - 20 && spotX <= roll.w + 20) {
          c.save();
          var pulse = 0.88 + 0.12 * Math.sin(fx.elapsed * 7);
          c.strokeStyle = 'rgba(255, 242, 180, 0.55)';
          c.lineWidth = 1.4;
          c.beginPath(); c.arc(spotX, spotY, 10 * pulse, 0, Math.PI * 2); c.stroke();
          c.fillStyle = '#ffffff';
          c.shadowColor = '#ffe066'; c.shadowBlur = A.isPixel ? 0 : 12;
          drawStar(c, spotX, spotY, 4, 7.2 * pulse, 2.4, fx.elapsed * 1.4);
          c.fill();
          c.shadowBlur = 0;
          c.restore();
        }

        // 优雅舞台独白字幕
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? clamp(it.age * 5, 0, 1) : it.exitAlpha * 0.8;
          if (alpha <= 0) continue;
          var lyr = cleanLyric(it.n);
          var tx = clamp(g.x + g.w * 0.5, roll.kbW + 30, roll.w - 30);
          var ty = Math.max(roll.rulerH + 16, g.y - 14 - (it.active ? 0 : it.exitAge * 10));
          c.save();
          c.globalAlpha = alpha;
          drawTextHalo(c, lyr, tx, ty, clamp(roll.rowH * 0.96, 14, 22), '#fff9dd', 'rgba(12, 10, 24, 0.88)', 3.4, 'center', 'Georgia, "Songti SC", "Microsoft YaHei", serif');
          c.restore();
        }
      }
    },

    {
      id: 'judgeLineSpin',
      showcase: true,
      usesPit: true,
      hidePlayhead: true,
      linger: 0.72,
      nameKey: 'eye.mode.judgeLineSpin',
      fallbackName: '旋转判定线',
      eyeColor: { iris: '#ffe066', ring: '#5ce1e6', pupil: '#0c162d' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        if (!ms.missCache) ms.missCache = Object.create(null);
        var cx = geo.x + 2, cy = geo.y + geo.h * 0.5;
        if (isNoteG2pMiss(fx.roll, n, ms.missCache)) {
          st.missed = true;
          recordRhythmMiss(fx);
          fx.spawn({ kind: 'glyph', text: 'MISS', x: clamp(cx, fx.roll.kbW + 26, fx.roll.w - 26), y: Math.max(fx.roll.rulerH + 16, cy - 18), vx: 0, vy: -24, size: 13.5, color: '#f87171', life: 0.62 });
          fx.spawn({ kind: 'ring', x: cx, y: cy, r: 5, maxR: 26, color: '#ef4444', lineW: 2.2, life: 0.36 });
          return;
        }
        recordRhythmHit(fx);
        ms.linePulse = 1;
        var prevPitch = ms.lastPitch;
        ms.lastPitch = n.pitch;
        // 遇到大跳音程时让判定线顺滑甩出一圈优雅翻转
        if (prevPitch !== undefined && Math.abs(n.pitch - prevPitch) >= 7) {
          ms.spinKick = (n.pitch > prevPitch ? -1 : 1) * Math.PI;
        }
        // 旋转展开的金色几何方框击打特效
        fx.spawn({ kind: 'square', x: cx, y: cy, r: 8, maxR: 34, rot: Math.PI * 0.25, vrot: 2.2, color: '#ffe566', lineW: 2.4, hollow: true, life: 0.42 });
        fx.spawn({ kind: 'square', x: cx, y: cy, r: 5, maxR: 22, rot: 0, vrot: -2.8, color: '#5ce1e6', lineW: 1.6, hollow: true, life: 0.34 });
        for (var i = 0; i < 4; i++) {
          var a = Math.PI * 0.25 + i * Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;
          var sp = 68 + Math.random() * 54;
          fx.spawn({
            kind: 'square',
            x: cx, y: cy,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: 3.4 + Math.random() * 1.8,
            rot: a,
            vrot: (Math.random() - 0.5) * 10,
            color: i % 2 ? '#ffe566' : '#ffffff',
            life: 0.44
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        recordRhythmCp(fx);
        fx.modeState.linePulse = Math.max(fx.modeState.linePulse || 0, 0.55);
        fx.spawn({ kind: 'square', x: cp.x, y: cp.y, r: 4, maxR: 18, rot: Math.PI * 0.25, vrot: 3.2, color: '#5ce1e6', lineW: 1.8, hollow: true, life: 0.34 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) {
          ms.combo = 0;
          ms.lastPitch = undefined;
          ms.spinKick = 0;
        }
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var pitchInfo = roll._lastPitchInfo || null;
        var gridH = roll.gridBottom();
        var targetY = (roll.rulerH + gridH) * 0.5;
        var targetTilt = 0;
        if (ctx.cur) {
          var rel = ctx.cur.dur > 0 ? clamp((roll.playPos - ctx.cur.start) / ctx.cur.dur, 0, 1) : 0;
          var nInfo = pitchInfo ? pitchInfo[ctx.cur.id] : null;
          targetY = (roll.showPitch && nInfo) ? samplePitchY(roll, ctx.cur, rel, nInfo) : noteCenterY(roll, ctx.cur);
          if (ctx.next) targetTilt = clamp((ctx.cur.pitch - ctx.next.pitch) * 0.032, -0.34, 0.34);
        } else if (ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var u = clamp((roll.playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
          var su = u * u * (3 - 2 * u);
          var y0 = noteCenterY(roll, ctx.prev), y1 = noteCenterY(roll, ctx.next);
          targetY = y0 + (y1 - y0) * su;
          targetTilt = clamp((y1 - y0) * 0.0028, -0.52, 0.52);
        } else if (ctx.next) {
          targetY = noteCenterY(roll, ctx.next);
        } else if (ctx.prev) {
          targetY = noteCenterY(roll, ctx.prev);
        }
        targetY = clamp(targetY, roll.rulerH + 20, gridH - 20);
        stepSmoothFollowerY(fx, roll, dt, jumped, targetY, 16);

        if (jumped || ms.tilt === undefined) {
          ms.tilt = targetTilt;
          ms.spinKick = 0;
        } else {
          ms.tilt += (targetTilt - ms.tilt) * (1 - Math.exp(-9 * dt));
          if (ms.spinKick) {
            ms.spinKick *= Math.exp(-8.5 * dt);
            if (Math.abs(ms.spinKick) < 0.01) ms.spinKick = 0;
          }
        }
        ms.comboPop = Math.max(0, (ms.comboPop || 0) - dt * 4.5);
        ms.linePulse = Math.max(0, (ms.linePulse || 0) - dt * 3.8);
        ms.missFlash = Math.max(0, (ms.missFlash || 0) - dt * 3.5);
        stepRhythmResults(fx, roll, dt, jumped, 'judgeLineSpin');
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;
          c.save();
          // 简洁几何蓝金高亮长条与光丝 PIT
          c.globalAlpha = alpha * (A.isDark ? 0.38 : 0.30);
          var hg = c.createLinearGradient(g.x, 0, g.x + g.w, 0);
          hg.addColorStop(0, '#5ce1e6');
          hg.addColorStop(1, '#ffe566');
          c.fillStyle = hg;
          roundRect(c, g.x, g.y, g.w * prog, g.h, T.noteRadius || 0);
          c.fill();

          c.globalAlpha = alpha * 0.92;
          c.strokeStyle = it.active ? '#ffe566' : '#5ce1e6';
          c.lineWidth = 1.8;
          roundRect(c, g.x - 0.5, g.y - 0.5, g.w + 1, g.h + 1, T.noteRadius || 0);
          c.stroke();

          if (roll.showPitch && it.nInfo) {
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(10, Math.ceil(g.w * prog / 3)));
            if (curve.length > 1) {
              c.lineCap = 'round'; c.lineJoin = 'round';
              c.strokeStyle = 'rgba(255, 229, 102, 0.38)';
              c.lineWidth = 5;
              c.beginPath();
              for (var k = 0; k < curve.length; k++) { if (!k) c.moveTo(curve[k].x, curve[k].y); else c.lineTo(curve[k].x, curve[k].y); }
              c.stroke();
              c.strokeStyle = '#ffffff';
              c.lineWidth = 1.8;
              c.stroke();
            }
          }
          c.restore();

          // 长按期间周期性从判定点迸出小菱形脉冲
          if (it.active && Math.random() < 0.14) {
            var px = roll.beatX(roll.playPos);
            var py = it.nInfo ? samplePitchY(roll, it.n, prog, it.nInfo) : (g.y + g.h * 0.5);
            fx.spawn({ kind: 'square', x: px, y: py, r: 3, maxR: 16, rot: Math.PI * 0.25, vrot: 2.5, color: '#ffe566', lineW: 1.4, hollow: true, life: 0.28 });
          }
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var px = roll.beatX(roll.playPos);
        var py = ms.followY !== undefined ? ms.followY : (roll.rulerH + roll.gridBottom()) * 0.5;
        var ang = Math.PI * 0.5 + (ms.tilt || 0) + (ms.spinKick || 0);
        var pulse = ms.linePulse || 0;

        // 浮空动态旋转判定线（中心菱形始终精准锁住播放点）
        if (px >= roll.kbW - 30 && px <= roll.w + 30) {
          var halfLen = clamp((roll.gridBottom() - roll.rulerH) * 0.38, 110, 210);
          c.save();
          c.translate(px, py);
          c.rotate(ang);
          var lg = c.createLinearGradient(-halfLen, 0, halfLen, 0);
          lg.addColorStop(0, 'rgba(255, 229, 102, 0)');
          lg.addColorStop(0.22, A.isDark ? 'rgba(255, 232, 128, 0.85)' : 'rgba(232, 168, 12, 0.85)');
          lg.addColorStop(0.5, '#ffffff');
          lg.addColorStop(0.78, A.isDark ? 'rgba(92, 225, 230, 0.85)' : 'rgba(14, 165, 233, 0.85)');
          lg.addColorStop(1, 'rgba(92, 225, 230, 0)');
          // 外层辉光（失误时闪红警示）
          var mFl = ms.missFlash || 0;
          c.strokeStyle = mFl > 0.08
            ? ('rgba(248, 113, 113, ' + (0.35 + mFl * 0.45).toFixed(2) + ')')
            : ('rgba(255, 229, 102, ' + (0.28 + pulse * 0.32).toFixed(2) + ')');
          c.lineWidth = 7 + pulse * 4 + mFl * 3;
          c.beginPath(); c.moveTo(-halfLen, 0); c.lineTo(halfLen, 0); c.stroke();
          // 细锐主判定线
          c.strokeStyle = lg;
          c.lineWidth = 2.4 + pulse * 1.1;
          c.beginPath(); c.moveTo(-halfLen, 0); c.lineTo(halfLen, 0); c.stroke();
          // 中心定位菱形
          c.rotate(Math.PI * 0.25);
          var dr = 5.5 + pulse * 2.5;
          c.fillStyle = '#ffffff';
          c.strokeStyle = '#ffe566';
          c.lineWidth = 1.8;
          c.fillRect(-dr, -dr, dr * 2, dr * 2);
          c.strokeRect(-dr, -dr, dr * 2, dr * 2);
          c.restore();
        }

        // 极简几何音游 HUD（右上角连击 + 全连完美/失误提示）
        if ((ms.combo || 0) > 0 || (ms.missCount || 0) > 0) {
          var hudX = roll.w - 18;
          var hudY = roll.rulerH + 26;
          var pop = 1 + (ms.comboPop || 0) * 0.18;
          var hasJMiss = (ms.missCount || 0) > 0;
          c.save();
          c.translate(hudX, hudY);
          c.scale(pop, pop);
          drawTextHalo(c, String(ms.combo || 0), 0, 0, 26, hasJMiss ? '#e2e8f0' : '#ffe566', A.halo, 3.6, 'right', '"Segoe UI", Tahoma, sans-serif');
          c.restore();
          var subHud = hasJMiss ? ('COMBO · MISS ' + ms.missCount) : 'COMBO · ALL PERFECT';
          drawTextHalo(c, subHud, hudX, hudY + 19, 10, hasJMiss ? '#f87171' : (A.isDark ? '#b8f2ff' : '#0369a1'), A.halo, 2.4, 'right', '"Segoe UI", Tahoma, sans-serif');
        }
        drawRhythmResults(fx, c, roll, T, A);
      }
    },

    {
      id: 'railHighway',
      showcase: true,
      usesPit: true,
      linger: 0.65,
      nameKey: 'eye.mode.railHighway',
      fallbackName: '流光落键轨',
      eyeColor: { iris: '#00f5ff', ring: '#ff38b8', pupil: '#090f29' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        if (!ms.missCache) ms.missCache = Object.create(null);
        var hitX = geo.x + 2, hitY = geo.y + geo.h * 0.5;
        if (isNoteG2pMiss(fx.roll, n, ms.missCache)) {
          st.missed = true;
          recordRhythmMiss(fx);
          fx.spawn({
            kind: 'glyph',
            text: 'MISS!!',
            x: clamp(hitX + 24, fx.roll.kbW + 42, fx.roll.w - 42),
            y: Math.max(fx.roll.rulerH + 16, geo.y - 12),
            vx: 6,
            vy: -24,
            size: 13,
            color: '#f87171',
            life: 0.65
          });
          fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 5, maxR: 26, color: '#ef4444', lineW: 2.4, life: 0.36 });
          return;
        }
        recordRhythmHit(fx);
        var label = (ms.combo % 5 === 0) ? 'MARVELOUS!!' : 'PERFECT!';
        var col = (ms.combo % 5 === 0) ? '#ffe042' : '#00f5ff';
        fx.spawn({
          kind: 'glyph',
          text: label,
          x: clamp(hitX + 26, fx.roll.kbW + 46, fx.roll.w - 46),
          y: Math.max(fx.roll.rulerH + 16, geo.y - 12),
          vx: 8,
          vy: -28,
          size: 11.5,
          color: col,
          life: 0.58
        });
        fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 4, maxR: 24, color: col, lineW: 2.2, life: 0.36 });
        for (var i = 0; i < 6; i++) {
          var a = (Math.random() - 0.5) * Math.PI * 1.4;
          var sp = 50 + Math.random() * 75;
          fx.spawn({
            kind: 'spark',
            x: hitX, y: hitY,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: 2 + Math.random() * 1.6,
            color: i % 2 ? '#00f5ff' : '#ff38b8',
            life: 0.38
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        recordRhythmCp(fx);
        fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: -30, vy: -35, r: 2.6, color: '#ffe042', life: 0.34 });
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 2, maxR: 15, color: '#ff38b8', lineW: 1.6, life: 0.32 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) ms.combo = 0;
        ms.comboPop = Math.max(0, (ms.comboPop || 0) - dt * 5);
        stepRhythmResults(fx, roll, dt, jumped, 'railHighway');
      },
      drawCustomPlayhead: function (fx, c, roll, T, px) {
        // 街机双核激光判定条（替代普通红线）
        c.save();
        c.strokeStyle = 'rgba(0, 245, 255, 0.24)';
        c.lineWidth = 11;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        c.strokeStyle = 'rgba(255, 56, 184, 0.58)';
        c.lineWidth = 4;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(px, 0); c.lineTo(px, roll.h); c.stroke();
        // 标尺霓虹判定卡扣
        c.fillStyle = '#00f5ff';
        c.strokeStyle = '#081226';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(px - 7, 1); c.lineTo(px + 7, 1); c.lineTo(px + 5, 11); c.lineTo(px, 17); c.lineTo(px - 5, 11);
        c.closePath();
        c.fill(); c.stroke();
        c.restore();
        return true;
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var px = roll.beatX(roll.playPos);
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;

          // 按键瞬间整条音高轨道点亮流光光束（MISS 音符闪红警示）
          c.save();
          var beamW = Math.min(roll.w - roll.kbW, 240);
          var bg = c.createLinearGradient(px - beamW, 0, px + beamW * 0.65, 0);
          var isMissIt = !!(it.st && it.st.missed);
          bg.addColorStop(0, isMissIt ? 'rgba(239, 68, 68, 0)' : 'rgba(0, 245, 255, 0)');
          bg.addColorStop(0.58, colorAlpha(isMissIt ? '#ef4444' : A.cyan, (A.isDark ? 0.34 : 0.24) * alpha));
          bg.addColorStop(0.66, colorAlpha(isMissIt ? '#fca5a5' : '#ffffff', 0.45 * alpha));
          bg.addColorStop(1, isMissIt ? 'rgba(239, 68, 68, 0)' : 'rgba(255, 56, 184, 0)');
          c.fillStyle = bg;
          c.fillRect(roll.kbW, g.y - 1, roll.w - roll.kbW, g.h + 2);

          // 音符霓虹按键边框 + 实时激光 PIT 导轨
          c.globalAlpha = alpha;
          c.strokeStyle = isMissIt ? '#ef4444' : '#00f5ff';
          c.lineWidth = 2;
          roundRect(c, g.x - 1, g.y - 1, g.w + 2, g.h + 2, T.noteRadius || 0);
          c.stroke();

          if (roll.showPitch && it.nInfo) {
            var prog = it.active ? clamp(it.rel, 0, 1) : 1;
            var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(10, Math.ceil(g.w * prog / 3)));
            if (curve.length > 1) {
              c.lineCap = 'round';
              c.strokeStyle = 'rgba(255, 56, 184, 0.48)';
              c.lineWidth = 5.5;
              c.beginPath();
              for (var k = 0; k < curve.length; k++) { if (!k) c.moveTo(curve[k].x, curve[k].y); else c.lineTo(curve[k].x, curve[k].y); }
              c.stroke();
              c.strokeStyle = '#ffffff';
              c.lineWidth = 2;
              c.stroke();
            }
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var px = roll.beatX(roll.playPos);
        var ms = fx.modeState;
        // 长按交点处迸发高能十字星芒与火花
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) continue;
          var iy = it.nInfo ? samplePitchY(roll, it.n, clamp(it.rel, 0, 1), it.nInfo) : (g.y + g.h * 0.5);
          if (px >= roll.kbW && px <= roll.w) {
            c.save();
            var flare = 0.85 + 0.25 * Math.sin(fx.elapsed * 28 + it.st.seed * 6);
            c.fillStyle = '#ffffff';
            c.shadowColor = '#00f5ff';
            c.shadowBlur = A.isPixel ? 0 : 14;
            drawStar(c, px, iy, 4, 13 * flare, 3.2, fx.elapsed * 4);
            c.fill();
            c.shadowBlur = 0;
            c.restore();
            if (Math.random() < 0.32) {
              fx.spawn({
                kind: 'spark',
                x: px, y: iy,
                vx: -40 - Math.random() * 55,
                vy: (Math.random() - 0.5) * 65,
                r: 1.8 + Math.random() * 1.4,
                color: Math.random() < 0.5 ? '#00f5ff' : '#ffe042',
                life: 0.34
              });
            }
          }
        }
        // 左下角街机连击计数
        if ((ms.combo || 0) > 0) {
          var cx = roll.kbW + 18;
          var cy = roll.gridBottom() - 26;
          var pop = 1 + (ms.comboPop || 0) * 0.2;
          c.save();
          c.translate(cx, cy);
          c.scale(pop, pop);
          drawTextHalo(c, ms.combo + ' CHAIN', 0, 0, 19, '#00f5ff', A.halo, 3.4, 'left', 'Impact, "Segoe UI", sans-serif');
          c.restore();
        }
        drawRhythmResults(fx, c, roll, T, A);
      }
    },

    {
      id: 'twinOrbits',
      showcase: true,
      usesPit: true,
      hidePlayhead: true,
      linger: 0.72,
      nameKey: 'eye.mode.twinOrbits',
      fallbackName: '双星旋舞',
      eyeColor: { iris: '#ff3b30', ring: '#00d4ff', pupil: '#0b1026' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        if (!ms.missCache) ms.missCache = Object.create(null);
        var cx = geo.x + 2, cy = geo.y + geo.h * 0.5;
        if (isNoteG2pMiss(fx.roll, n, ms.missCache)) {
          st.missed = true;
          recordRhythmMiss(fx);
          fx.spawn({
            kind: 'glyph',
            text: 'MISS!',
            x: clamp(cx, fx.roll.kbW + 30, fx.roll.w - 30),
            y: Math.max(fx.roll.rulerH + 16, cy - 20),
            vx: 0,
            vy: -24,
            size: 13,
            color: '#f87171',
            life: 0.6
          });
          fx.spawn({ kind: 'ring', x: cx, y: cy, r: 5, maxR: 28, color: '#ef4444', lineW: 2.6, life: 0.38 });
          return;
        }
        recordRhythmHit(fx);
        var isFire = (ms.combo % 2 === 1);
        fx.spawn({
          kind: 'glyph',
          text: 'PERFECT!',
          x: clamp(cx, fx.roll.kbW + 34, fx.roll.w - 34),
          y: Math.max(fx.roll.rulerH + 16, cy - 20),
          vx: 0,
          vy: -26,
          size: 11.5,
          color: isFire ? '#ffbe42' : '#72f2ff',
          life: 0.52
        });
      },
      onControlPoint: function (fx, n, cp) {
        recordRhythmCp(fx);
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 4, maxR: 22, color: '#c084fc', lineW: 2.2, life: 0.4 });
        fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: 0, vy: -28, r: 2.6, color: '#ffe066', life: 0.38 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) {
          ms.combo = 0;
          ms.lastTileIdx = -1;
          ms.fireTrail = [];
          ms.iceTrail = [];
        }
        if (!ms.fireTrail) ms.fireTrail = [];
        if (!ms.iceTrail) ms.iceTrail = [];
        ms.comboPop = Math.max(0, (ms.comboPop || 0) - dt * 5);

        // 构建踩踏方块路径：每个音符头为节拍砖块，长音符与长休止中段补充等拍踏板以维持优雅旋转半径
        var rawNotes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
        var sorted = rawNotes.slice().sort(function (a, b) { return (a.start - b.start) || (b.pitch - a.pitch); });
        var tiles = [];
        for (var i = 0; i < sorted.length; i++) {
          var n = sorted[i];
          if (!n) continue;
          if (tiles.length && Math.abs(n.start - tiles[tiles.length - 1].beat) < 0.025) continue;
          tiles.push({ beat: n.start, pitch: n.pitch, isHead: true, note: n, dir: 1, flip: false });
          if (n.dur > 1.05) {
            for (var sb = n.start + 1; sb < n.start + n.dur - 0.15; sb += 1) {
              tiles.push({ beat: sb, pitch: n.pitch, isHead: false, note: n, dir: 1, flip: false });
            }
          }
          var nextN = null;
          for (var j = i + 1; j < sorted.length; j++) {
            if (sorted[j] && sorted[j].start > n.start + 0.025) { nextN = sorted[j]; break; }
          }
          if (nextN) {
            var gStart = n.start + n.dur;
            var gDur = nextN.start - gStart;
            if (gDur > 1.55) {
              var steps = Math.max(1, Math.floor(gDur) - 1);
              for (var s = 1; s <= steps; s++) {
                var uG = s / (steps + 1);
                var bG = gStart + gDur * uG;
                if (bG - tiles[tiles.length - 1].beat > 0.25 && nextN.start - bG > 0.25) {
                  tiles.push({
                    beat: bG,
                    pitch: n.pitch + (nextN.pitch - n.pitch) * uG,
                    isHead: false,
                    bridge: true,
                    note: null,
                    dir: 1,
                    flip: false
                  });
                }
              }
            }
          }
        }

        // 计算每块踏板的旋转方向（急转折音高自动触发方向翻转漩涡！）
        var curDir = 1;
        for (var ti = 0; ti < tiles.length; ti++) {
          if (ti >= 2) {
            var dpPrev = tiles[ti - 1].pitch - tiles[ti - 2].pitch;
            var dpNext = tiles[ti].pitch - tiles[ti - 1].pitch;
            if ((dpPrev > 2 && dpNext < -2) || (dpPrev < -2 && dpNext > 2) || Math.abs(dpNext) >= 7) {
              curDir = -curDir;
              tiles[ti - 1].flip = true;
            }
          }
          tiles[ti].dir = curDir;
        }

        var playPos = roll.playPos;
        var tileY = function (tl) { return Math.round(roll.rowY(tl.pitch)) + 1 + Math.max(4, roll.rowH - 2) * 0.5; };
        var firePos, icePos, pivotIdx = -1, orbitR = 46, pivotPos = null;

        if (!tiles.length) {
          var mx = roll.beatX(playPos), my = (roll.rulerH + roll.gridBottom()) * 0.5;
          var idleAng = fx.elapsed * 3.6;
          firePos = { x: mx, y: my };
          icePos = { x: mx + Math.cos(idleAng) * 40, y: my + Math.sin(idleAng) * 40 };
          pivotPos = firePos;
          orbitR = 40;
        } else if (playPos < tiles[0].beat - 1e-4) {
          // 首个踏板前：赤星稳坐首块，青星绕其待命公转
          var t0x = roll.beatX(tiles[0].beat), t0y = tileY(tiles[0]);
          var waitAng = -Math.PI + (playPos - tiles[0].beat) * Math.PI;
          firePos = { x: t0x, y: t0y };
          icePos = { x: t0x + Math.cos(waitAng) * 44, y: t0y + Math.sin(waitAng) * 44 };
          pivotPos = firePos;
          orbitR = 44;
          pivotIdx = -1;
        } else {
          // 定位当前轴心踏板 k（tiles[k].beat <= playPos < tiles[k+1].beat）
          var k = 0;
          for (var qi = 0; qi < tiles.length; qi++) {
            if (tiles[qi].beat <= playPos + 1e-4) k = qi; else break;
          }
          pivotIdx = k;
          var tk = tiles[k];
          var px = roll.beatX(tk.beat), py = tileY(tk);
          var fireIsPivot = (k % 2 === 0);
          var ox, oy;

          if (k + 1 < tiles.length) {
            var tn = tiles[k + 1];
            var nx = roll.beatX(tn.beat), ny = tileY(tn);
            var u = clamp((playPos - tk.beat) / Math.max(1e-4, tn.beat - tk.beat), 0, 1);
            var prevX, prevY;
            if (k > 0) {
              prevX = roll.beatX(tiles[k - 1].beat);
              prevY = tileY(tiles[k - 1]);
            } else {
              prevX = px - 44;
              prevY = py;
            }
            var r0 = Math.max(18, Math.hypot(prevX - px, prevY - py));
            var r1 = Math.max(18, Math.hypot(nx - px, ny - py));
            var a0 = Math.atan2(prevY - py, prevX - px);
            var a1 = Math.atan2(ny - py, nx - px);
            var dir = tk.dir || 1;
            var delta;
            if (dir > 0) {
              delta = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
              if (delta < 0.35) delta += Math.PI * 2;
            } else {
              delta = -(((a0 - a1) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
              if (Math.abs(delta) < 0.35) delta -= Math.PI * 2;
            }
            orbitR = r0 + (r1 - r0) * u;
            var curAng = a0 + delta * u;
            ox = px + Math.cos(curAng) * orbitR;
            oy = py + Math.sin(curAng) * orbitR;
          } else {
            // 踏上最后一块后持续欢庆公转
            var endAng = (playPos - tk.beat) * Math.PI * 1.4 + fx.elapsed * (roll.isPlaying ? 0 : 2.8);
            orbitR = 42;
            ox = px + Math.cos(endAng) * orbitR;
            oy = py + Math.sin(endAng) * orbitR;
          }

          pivotPos = { x: px, y: py };
          if (fireIsPivot) {
            firePos = { x: px, y: py };
            icePos = { x: ox, y: oy };
          } else {
            icePos = { x: px, y: py };
            firePos = { x: ox, y: oy };
          }

          // 落砖瞬间触发红/蓝星落地冲击环与火花！
          if (!jumped && roll.isPlaying && ms.lastTileIdx !== undefined && k > ms.lastTileIdx) {
            var colLand = fireIsPivot ? '#ff3b30' : '#00d4ff';
            if (px >= roll.kbW - 20 && px <= roll.w + 20) {
              fx.spawn({ kind: 'ring', x: px, y: py, r: 6, maxR: 32, color: colLand, lineW: 2.6, life: 0.38 });
              for (var si = 0; si < 7; si++) {
                var sa = (si / 7) * Math.PI * 2 + Math.random() * 0.3;
                var sp = 42 + Math.random() * 52;
                fx.spawn({
                  kind: 'spark',
                  x: px, y: py,
                  vx: Math.cos(sa) * sp,
                  vy: Math.sin(sa) * sp,
                  r: 2.1 + Math.random() * 1.2,
                  color: si % 2 ? colLand : '#ffffff',
                  life: 0.36
                });
              }
            }
          }
          ms.lastTileIdx = k;
        }

        // 用拍位坐标记录赤/青双星拖尾，滚屏与相对运动模式自动跟随！
        var pushOrbTrail = function (arr, pos) {
          var bVal = roll.scrollBeat + (pos.x - roll.kbW) / Math.max(1, roll.pxBeat);
          var last = arr.length ? arr[arr.length - 1] : null;
          if (!last || Math.hypot(pos.x - roll.beatX(last.beat), pos.y - last.y) > 2.2) {
            arr.push({ beat: bVal, y: pos.y, t: fx.elapsed });
            if (arr.length > 34) arr.shift();
          }
          while (arr.length && (fx.elapsed - arr[0].t > 0.36)) arr.shift();
        };
        if (firePos) pushOrbTrail(ms.fireTrail, firePos);
        if (icePos) pushOrbTrail(ms.iceTrail, icePos);

        ms.orbitState = {
          tiles: tiles,
          pivotIdx: pivotIdx,
          pivotPos: pivotPos,
          orbitR: orbitR,
          firePos: firePos,
          icePos: icePos
        };
        stepRhythmResults(fx, roll, dt, jumped, 'twinOrbits');
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var ms = fx.modeState;
        var st = ms && ms.orbitState;
        if (!st || !st.tiles.length) return;
        var tiles = st.tiles;
        var pk = st.pivotIdx;
        var tileY = function (tl) { return Math.round(roll.rowY(tl.pitch)) + 1 + Math.max(4, roll.rowH - 2) * 0.5; };
        var startI = Math.max(0, pk - 5);
        var endI = Math.min(tiles.length - 1, pk + 12);
        var tileSz = clamp(roll.rowH * 0.72, 10, 16);

        // 1. 踏板之间的连接荧光步道
        c.save();
        c.lineCap = 'round';
        c.lineJoin = 'round';
        for (var i = startI; i < endI; i++) {
          var a = tiles[i], b = tiles[i + 1];
          var ax = roll.beatX(a.beat), ay = tileY(a);
          var bx = roll.beatX(b.beat), by = tileY(b);
          if ((ax > roll.w + 40 && bx > roll.w + 40) || (ax < roll.kbW - 40 && bx < roll.kbW - 40)) continue;
          var stepped = i < pk;
          var alpha = stepped ? clamp(1 - (pk - i) * 0.18, 0.14, 0.78) : clamp(1 - Math.max(0, i - pk) * 0.075, 0.22, 0.9);
          c.globalAlpha = alpha;
          c.strokeStyle = stepped
            ? ((i % 2 === 0) ? 'rgba(255, 92, 68, 0.55)' : 'rgba(0, 212, 255, 0.55)')
            : (A.isDark ? 'rgba(226, 232, 240, 0.28)' : 'rgba(51, 65, 85, 0.22)');
          c.lineWidth = tileSz * 0.75;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        }
        c.restore();

        // 2. 发光旋转节拍踏板方块（已踩亮红/蓝，变向块带紫金漩涡标！）
        c.save();
        for (var k = startI; k <= endI; k++) {
          var tl = tiles[k];
          var tx = roll.beatX(tl.beat), ty = tileY(tl);
          if (tx < roll.kbW - 30 || tx > roll.w + 30) continue;
          var isPast = k < pk;
          var isCur = k === pk;
          var fade = isPast ? clamp(1 - (pk - k) * 0.18, 0.16, 0.85) : clamp(1 - Math.max(0, k - pk) * 0.07, 0.28, 1);
          var sz = tileSz * (isCur ? 1.18 : (tl.isHead ? 1.0 : 0.76));
          var col = (k % 2 === 0) ? '#ff453a' : '#00d4ff';

          c.save();
          c.globalAlpha = fade;
          c.translate(tx, ty);
          c.fillStyle = (isCur || isPast)
            ? colorAlpha(col, isCur ? 0.88 : 0.42)
            : (A.isDark ? 'rgba(30, 41, 66, 0.85)' : 'rgba(255, 255, 255, 0.88)');
          c.strokeStyle = isCur ? '#ffffff' : (tl.flip ? '#c084fc' : colorAlpha(col, isPast ? 0.8 : 0.75));
          c.lineWidth = isCur ? 2.4 : 1.6;
          roundRect(c, -sz * 0.68, -sz * 0.68, sz * 1.36, sz * 1.36, 4);
          c.fill(); c.stroke();

          // 变向漩涡标（翻转公转方向！）
          if (tl.flip) {
            c.strokeStyle = isCur ? '#ffffff' : '#e879f9';
            c.lineWidth = 1.6;
            c.beginPath();
            c.arc(0, 0, sz * 0.34, 0, Math.PI * 1.45);
            c.stroke();
          }
          c.restore();
        }
        c.restore();

        // 3. 活跃音符实时 PIT 光丝（晒调教友好）
        for (var ii = 0; ii < items.length; ii++) {
          var it = items[ii], g = it.geo;
          var aIt = it.active ? 1 : it.exitAlpha;
          if (aIt <= 0 || !roll.showPitch || !it.nInfo) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;
          var curve = samplePitchCurve(roll, it.n, it.nInfo, 0, prog, Math.max(8, Math.ceil(g.w * prog / 4)));
          if (curve.length > 1) {
            c.save();
            c.globalAlpha = aIt * 0.85;
            c.lineCap = 'round';
            c.strokeStyle = (pk % 2 === 0) ? '#ff6b4a' : '#38e8ff';
            c.lineWidth = 2.2;
            c.beginPath();
            for (var ci = 0; ci < curve.length; ci++) { if (!ci) c.moveTo(curve[ci].x, curve[ci].y); else c.lineTo(curve[ci].x, curve[ci].y); }
            c.stroke();
            c.restore();
          }
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var st = ms && ms.orbitState;
        if (!st) return;

        // 1. 当前轴心周围柔和公转轨道参考环
        if (st.pivotPos && st.pivotPos.x >= roll.kbW - 60 && st.pivotPos.x <= roll.w + 60) {
          c.save();
          c.strokeStyle = A.isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(30, 41, 59, 0.20)';
          c.lineWidth = 1.4;
          c.setLineDash([4, 4]);
          c.beginPath();
          c.arc(st.pivotPos.x, st.pivotPos.y, st.orbitR, 0, Math.PI * 2);
          c.stroke();
          c.restore();
        }

        // 2. 赤/青双星彗星拖尾
        var drawOrbTrail = function (arr, colMain, colCore) {
          if (!arr || arr.length < 2) return;
          c.save();
          c.lineCap = 'round';
          for (var i = 1; i < arr.length; i++) {
            var p0 = arr[i - 1], p1 = arr[i];
            var x0 = roll.beatX(p0.beat), x1 = roll.beatX(p1.beat);
            if (Math.abs(x1 - x0) > 120) continue;
            var u = i / arr.length;
            var age = clamp(1 - (fx.elapsed - p1.t) / 0.36, 0, 1);
            c.globalAlpha = u * age * 0.72;
            c.strokeStyle = colMain;
            c.lineWidth = 2.5 + u * 8.5;
            c.beginPath(); c.moveTo(x0, p0.y); c.lineTo(x1, p1.y); c.stroke();
            c.globalAlpha = u * age * 0.85;
            c.strokeStyle = colCore;
            c.lineWidth = 1.2 + u * 3;
            c.stroke();
          }
          c.restore();
        };
        drawOrbTrail(ms.fireTrail, '#ff3b30', '#ffe066');
        drawOrbTrail(ms.iceTrail, '#00b4ff', '#d8f8ff');

        // 3. 赤焰星与寒霜星本体（带径向发光球核）
        var drawPlanet = function (pos, coreCol, midCol, outerCol, glowCol) {
          if (!pos || pos.x < roll.kbW - 30 || pos.x > roll.w + 30) return;
          var r = clamp(roll.rowH * 0.52, 7.5, 11.5);
          c.save();
          c.shadowColor = glowCol;
          c.shadowBlur = A.isPixel ? 0 : 16;
          var pg = c.createRadialGradient(pos.x - r * 0.25, pos.y - r * 0.25, 1, pos.x, pos.y, r);
          pg.addColorStop(0, coreCol);
          pg.addColorStop(0.55, midCol);
          pg.addColorStop(1, outerCol);
          c.fillStyle = pg;
          c.beginPath(); c.arc(pos.x, pos.y, r, 0, Math.PI * 2); c.fill();
          c.shadowBlur = 0;
          c.strokeStyle = '#ffffff';
          c.lineWidth = 1.5;
          c.stroke();
          c.restore();
        };
        drawPlanet(st.firePos, '#fff7cc', '#ff6b2b', '#e11d48', '#ff3b30');
        drawPlanet(st.icePos, '#ffffff', '#5ce1ff', '#0284c7', '#00d4ff');

        // 4. 左下角双星步数连击 HUD
        if ((ms.combo || 0) > 0 && !ms.results) {
          var pop = 1 + (ms.comboPop || 0) * 0.2;
          c.save();
          c.translate(roll.kbW + 18, roll.gridBottom() - 24);
          c.scale(pop, pop);
          drawTextHalo(c, ms.combo + ' STEP', 0, 0, 19, (st.pivotIdx % 2 === 0) ? '#ff7b54' : '#5ce1ff', A.halo, 3.4, 'left', 'Impact, Tahoma, sans-serif');
          c.restore();
        }
        drawRhythmResults(fx, c, roll, T, A);
      }
    },

    /* --- B. 莫名其妙程度×120（17种） --- */
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
        if (!fx.modeState.missCache) fx.modeState.missCache = Object.create(null);
        st.lastHitRel = -0.2;
        st.koSpawned = false;
        st.missed = isNoteG2pMiss(fx.roll, n, fx.modeState.missCache);
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
        if (st.missed) {
          var escTxt = langCode() === 'ja' ? '逃亡!' : (langCode() === 'en' ? 'ESCAPED!' : '逃走了!');
          fx.spawn({
            kind: 'glyph',
            text: escTxt,
            x: geo.x + geo.w / 2,
            y: geo.y - 10,
            vx: 10, vy: -32,
            size: 12,
            color: '#cbd5e1',
            life: 0.85
          });
          return;
        }
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
            if (koAlpha > 0 && !it.st.missed) {
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
          // 周期性受击伤害数字与白闪（G2P/词典失败则全部 MISS 闪避！）
          if (it.rel - (it.st.lastHitRel || 0) >= 0.28) {
            it.st.lastHitRel = it.rel;
            if (it.st.missed) {
              var missTxt = langCode() === 'ja' ? 'ミス!' : (langCode() === 'en' ? 'MISS!' : (Math.random() < 0.5 ? 'MISS!' : '闪避!'));
              fx.spawn({
                kind: 'glyph',
                text: missTxt,
                x: g.x + g.w * clamp(it.rel, 0.1, 0.9),
                y: g.y - 12,
                vx: (Math.random() - 0.5) * 28,
                vy: -44 - Math.random() * 18,
                size: 12.5,
                color: '#cbd5e1',
                life: 0.72
              });
            } else {
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
          }
          // 轻微受击抖动 + 白闪
          var flashing = !it.st.missed && it.st.flashUntil && fx.elapsed < it.st.flashUntil;
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
              if (it.st.missed) {
                c.fillStyle = '#42e858';
                c.fillRect(koBx, koBy, koBarW, 5);
              }
              c.strokeStyle = it.st.missed ? '#cbd5e1' : '#ff5a72'; c.lineWidth = 0.9;
              c.strokeRect(koBx - 1, koBy - 1, koBarW + 2, 7);
              c.restore();
            }
            continue;
          }
          var hp = it.st.missed ? 1 : clamp(1 - it.rel, 0, 1);
          // 英雄剑气斩击弧光（MISS 时挥空变淡灰）
          var sx = g.x + g.w * clamp(it.rel, 0, 1);
          var sy = g.y + g.h / 2;
          c.save();
          c.strokeStyle = it.st.missed ? 'rgba(148, 163, 184, 0.65)' : '#ffffff';
          c.shadowColor = it.st.missed ? '#64748b' : '#00e8ff'; c.shadowBlur = A.isPixel ? 0 : 10;
          c.lineWidth = it.st.missed ? 1.8 : 2.6;
          c.beginPath();
          c.arc(sx - 6, sy, g.h * 0.95, -0.95, 0.95);
          c.stroke();
          c.shadowBlur = 0;

          // 头顶 RPG 血条（全闪避则保持满血嘲讽）
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
    },

    {
      id: 'cityPaintCar',
      showcase: false,
      usesPit: false,
      hidePlayhead: true,
      linger: 0.65,
      nameKey: 'eye.mode.cityPaintCar',
      fallbackName: '城市巡游车',
      eyeColor: { iris: '#ff3b30', ring: '#ffe066', pupil: '#142442' },
      onControlPoint: function (fx, n, cp) {
        if (isNoteG2pMiss(fx.roll, n, fx.modeState.missCache)) return;
        fx.modeState.wheelieT = 0.24;
        for (var i = 0; i < 6; i++) {
          fx.spawn({
            kind: 'spark',
            x: cp.x - 10,
            y: cp.y,
            vx: -65 - Math.random() * 55,
            vy: (Math.random() - 0.5) * 45,
            r: 2.2 + Math.random() * 1.4,
            color: i % 2 ? '#00e5ff' : '#ffe042',
            life: 0.34
          });
        }
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (!ms.painted) {
          ms.painted = Object.create(null);
          ms.paintedDone = Object.create(null);
          ms.missCache = Object.create(null);
          ms.wheelRot = 0;
          ms.exhaustCd = 0;
          ms.wheelieT = 0;
        }
        if (!ms.missCache) ms.missCache = Object.create(null);
        var pose = stepHopperState(fx, roll, dt, jumped, {
          minArc: 26,
          maxArc: 90,
          dyScale: 0.35,
          gapScale: 0.16,
          maxGapBoost: 42,
          legatoArc: 17,
          topPad: 22,
          botPad: 6,
          landDur: 0.16,
          entryVault: true,
          entryLeadBeats: 1.15,
          entryOvershoot: 46,
          entryDropDur: 0.42,
          interludeCliff: true,
          interludeMinBeats: 3.2,
          onEntryLaunch: function (ex, ey) {
            for (var i = 0; i < 8; i++) {
              fx.spawn({
                kind: 'spark',
                x: ex + (Math.random() - 0.5) * 14,
                y: ey,
                vx: (Math.random() - 0.5) * 75,
                vy: -65 - Math.random() * 80,
                r: 2.4 + Math.random() * 1.4,
                color: i % 2 ? '#ffe042' : '#00f0ff',
                life: 0.48
              });
            }
            for (var p = 0; p < 5; p++) {
              fx.spawn({
                kind: 'puff',
                x: ex + (Math.random() - 0.5) * 16,
                y: ey,
                vx: (Math.random() - 0.5) * 45,
                vy: -25 - Math.random() * 35,
                r: 3.6 + Math.random() * 2.2,
                color: '#ffffff',
                life: 0.52
              });
            }
          },
          endCliffFall: true,
          cliffVyMin: 185,
          cliffVyMax: 270,
          cliffVxScale: 2.15,
          cliffGravity: 760,
          onCliffJump: function (jx, jy) {
            for (var i = 0; i < 8; i++) {
              fx.spawn({
                kind: 'spark',
                x: jx - 6,
                y: jy - 2,
                vx: -45 - Math.random() * 65,
                vy: -20 - Math.random() * 55,
                r: 2.4 + Math.random() * 1.4,
                color: i % 2 ? '#ffe042' : '#ff4d4d',
                life: 0.45
              });
            }
            for (var p = 0; p < 4; p++) {
              fx.spawn({
                kind: 'puff',
                x: jx - 10,
                y: jy - 4,
                vx: -24 - Math.random() * 34,
                vy: -12 - Math.random() * 24,
                r: 3.2 + Math.random() * 2,
                color: '#ffffff',
                life: 0.48
              });
            }
          },
          onTakeoff: function (tx, ty) {
            for (var i = 0; i < 4; i++) {
              fx.spawn({
                kind: 'spark',
                x: tx - 8 + (Math.random() - 0.5) * 6,
                y: ty - 1,
                vx: -35 - Math.random() * 45,
                vy: -12 - Math.random() * 28,
                r: 2.1,
                color: i % 2 ? '#ffe042' : '#ff6b35',
                life: 0.32
              });
            }
          },
          onLand: function (lx, ly) {
            for (var i = 0; i < 5; i++) {
              fx.spawn({
                kind: 'puff',
                x: lx + (Math.random() - 0.5) * 14,
                y: ly - 1,
                vx: (Math.random() - 0.5) * 44 - 16,
                vy: -10 - Math.random() * 20,
                r: 3 + Math.random() * 2.5,
                color: '#ffffff',
                life: 0.38
              });
            }
          },
          droneOnMiss: true,
          onMissAirlift: function (mx, my) {
            fx.spawn({ kind: 'ring', x: mx, y: my - 8, r: 5, maxR: 28, color: '#ef4444', lineW: 2.2, life: 0.44 });
            fx.spawn({
              kind: 'glyph',
              text: 'MISS!',
              x: clamp(mx, roll.kbW + 26, roll.w - 26),
              y: Math.max(roll.rulerH + 18, my - 26),
              vx: 6,
              vy: -32,
              size: 13,
              color: '#ef4444',
              life: 0.72
            });
          }
        });

        // 更新车辆驶过的音符染色进度（Miss 音符被无人机吊运跳过不涂色；倒带/寻道到音符之前时自动洗掉涂色）
        var playPos = roll.playPos;
        var prevPos = fx.prevPlayPos;
        var notes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
        for (var i = 0; i < notes.length; i++) {
          var n = notes[i];
          if (isNoteG2pMiss(roll, n, ms.missCache)) {
            if (ms.painted[n.id] !== undefined) {
              delete ms.painted[n.id];
              delete ms.paintedDone[n.id];
            }
            continue;
          }
          var ns = n.start, ne = n.start + n.dur;
          if (playPos < ns - 1e-4) {
            if (ms.painted[n.id] !== undefined) {
              delete ms.painted[n.id];
              delete ms.paintedDone[n.id];
            }
          } else if (playPos >= ns - 1e-4 && playPos <= ne + 1e-4) {
            var rel = n.dur > 0 ? clamp((playPos - ns) / n.dur, 0, 1) : 1;
            ms.painted[n.id] = (jumped || (prevPos !== null && playPos < prevPos)) ? rel : Math.max(ms.painted[n.id] || 0, rel);
          } else if (!jumped && prevPos !== null && prevPos <= ne + 1e-4 && playPos >= ne - 1e-4 && playPos >= prevPos) {
            // 防止极短音符在一帧内跨过而漏涂
            ms.painted[n.id] = 1;
          }
          if (ms.painted[n.id] >= 0.96 && !ms.paintedDone[n.id]) {
            ms.paintedDone[n.id] = true;
            var gx = roll.beatX(n.start), gw = Math.max(6, n.dur * roll.pxBeat), gy = noteTopY(roll, n);
            if (gx + gw >= roll.kbW && gx <= roll.w) {
              fx.spawn({
                kind: 'glyph',
                text: '+100',
                x: gx + gw * 0.5,
                y: gy - 12,
                vx: 0,
                vy: -34,
                size: 11,
                color: '#ffe042',
                life: 0.65
              });
              for (var s = 0; s < 5; s++) {
                var a = -Math.PI + (s / 4) * Math.PI;
                fx.spawn({
                  kind: 'spark',
                  x: gx + gw,
                  y: gy + 4,
                  vx: Math.cos(a) * 42,
                  vy: Math.sin(a) * 38 - 10,
                  r: 2.2,
                  color: s % 2 ? '#ffe042' : '#00f0ff',
                  life: 0.42
                });
              }
            }
          }
        }

        if (ms.wheelieT > 0) ms.wheelieT = Math.max(0, ms.wheelieT - dt);
        if (pose.entryVaulting) {
          ms.wheelRot += dt * 30;
          ms.exhaustCd -= dt;
          if (ms.exhaustCd <= 0 && pose.x >= roll.kbW && pose.x <= roll.w && pose.y < roll.gridBottom() + 10) {
            ms.exhaustCd = 0.07;
            fx.spawn({
              kind: 'puff',
              x: pose.x - 10,
              y: pose.y,
              vx: -24 - Math.random() * 18,
              vy: 14 + Math.random() * 18,
              r: 2.8 + Math.random() * 1.8,
              color: '#72f2ff',
              life: 0.42
            });
          }
        } else if (pose.cliffFalling && !pose.cliffDone) {
          ms.wheelRot += dt * 32;
          ms.exhaustCd -= dt;
          if (ms.exhaustCd <= 0 && (pose.cliffAge || 0) < 0.75) {
            ms.exhaustCd = 0.09;
            if (pose.x >= roll.kbW && pose.x <= roll.w && pose.y < roll.gridBottom() + 16) {
              fx.spawn({
                kind: 'puff',
                x: pose.x - 10,
                y: pose.y - 4,
                vx: -20 - Math.random() * 20,
                vy: -10 - Math.random() * 14,
                r: 2.8 + Math.random() * 1.8,
                color: A.isDark ? '#e8f4ff' : '#ffffff',
                life: 0.45
              });
            }
          }
        } else if (pose.droneCarry) {
          ms.wheelRot += dt * 7;
        } else if (roll.isPlaying) {
          ms.wheelRot += dt * (pose.inAir ? 22 : 28);
          ms.exhaustCd -= dt;
          if (ms.exhaustCd <= 0 && !pose.inAir) {
            ms.exhaustCd = 0.08;
            var cx = roll.beatX(playPos);
            if (cx >= roll.kbW && cx <= roll.w) {
              fx.spawn({
                kind: 'puff',
                x: cx - 15,
                y: pose.y - 4,
                vx: -28 - Math.random() * 18,
                vy: -8 - Math.random() * 12,
                r: 2.6 + Math.random() * 1.8,
                color: ms.wheelieT > 0 ? '#72f2ff' : (A.isDark ? '#e8f4ff' : '#ffffff'),
                life: 0.42
              });
            }
          }
        }
      },
      renderUnder: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        if (!ms || !ms.painted) return;
        var notes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
        var rad = T.noteRadius || 0;
        var roadTop = A.isDark ? '#ffe44d' : '#ff6b35';
        var roadBot = A.isDark ? '#ff9f1c' : '#ffba08';
        var curbCol = A.isDark ? '#00f5ff' : '#fff7d6';
        var stripeCol = A.isDark ? '#1a1230' : '#ffffff';

        for (var i = 0; i < notes.length; i++) {
          var n = notes[i];
          var x = roll.beatX(n.start) + 0.5;
          var w = Math.max(6, n.dur * roll.pxBeat) - 1;
          if (x > roll.w + 20 || x + w < roll.kbW - 20) continue;
          if (isNoteG2pMiss(roll, n, ms.missCache)) {
            if (roll.playPos >= n.start - 2.5) {
              var my = Math.round(roll.rowY(n.pitch)) + 1;
              var mh = Math.max(4, roll.rowH - 2);
              c.save();
              c.fillStyle = A.isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.13)';
              roundRect(c, x, my, w, mh, rad);
              c.fill();
              c.strokeStyle = 'rgba(239, 68, 68, 0.78)';
              c.lineWidth = 1.4;
              c.setLineDash([4, 3]);
              roundRect(c, x, my, w, mh, rad);
              c.stroke();
              c.restore();
            }
            continue;
          }
          var prog = ms.painted[n.id];
          if (!prog || prog <= 0.005) continue;
          var y = Math.round(roll.rowY(n.pitch)) + 1;
          var h = Math.max(4, roll.rowH - 2);
          var paintW = Math.min(w, Math.max(2, w * prog));

          c.save();
          roundRect(c, x, y, w, h, rad);
          c.clip();

          // 被车驶过的路面重新刷漆变色！
          var rg = c.createLinearGradient(0, y, 0, y + h);
          rg.addColorStop(0, roadTop);
          rg.addColorStop(1, roadBot);
          c.fillStyle = rg;
          c.fillRect(x, y, paintW, h);

          // 顶边亮漆反光与底边路缘线
          c.fillStyle = curbCol;
          c.fillRect(x, y, paintW, Math.max(1.5, h * 0.16));
          c.fillStyle = 'rgba(20, 12, 36, 0.28)';
          c.fillRect(x, y + h - 2, paintW, 2);

          // 公路虚线车道标线（复古主机公路涂色氛围）
          if (h >= 9 && paintW >= 10) {
            c.fillStyle = stripeCol;
            c.globalAlpha = A.isDark ? 0.55 : 0.72;
            var midY = Math.round(y + h * 0.52);
            for (var dx = 4; dx < paintW - 2; dx += 12) {
              c.fillRect(x + dx, midY, Math.min(6, paintW - dx), 1.6);
            }
            c.globalAlpha = 1;
          }

          // 漆刷前沿闪光
          if (prog < 0.995) {
            var edgeX = x + paintW;
            c.fillStyle = 'rgba(255, 255, 255, 0.92)';
            c.fillRect(edgeX - 2.5, y, 3, h);
          }

          // 重绘清晰的歌词确保涂色后仍可读
          if (w > 14) {
            c.fillStyle = A.isDark ? '#140c24' : '#2a1204';
            c.font = 'bold ' + Math.min(12, Math.max(8, h - 3)) + 'px Tahoma, "Microsoft YaHei", sans-serif';
            c.textBaseline = 'alphabetic';
            c.textAlign = 'left';
            c.fillText(cleanLyric(n), x + 4, y + h - 3);
          }
          c.restore();

          // 涂满整条音符时加一圈复古金框
          if (prog >= 0.98) {
            c.save();
            c.strokeStyle = A.isDark ? '#fff176' : '#d9480f';
            c.lineWidth = 1.4;
            roundRect(c, x, y, w, h, rad);
            c.stroke();
            c.restore();
          }
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var pose = ms && ms.pose;
        if (!pose || pose.cliffDone || pose.hidden) return;
        var x = pose.cliffFalling
          ? (roll.beatX(pose.cliffBaseBeat) + pose.cliffOffsetPx)
          : (roll.beatX(roll.playPos) + (pose.entryOffsetPx || 0));
        if (x < roll.kbW - 36 || x > roll.w + 36) return;
        var y = pose.y;
        var scale = clamp(roll.rowH / 16, 0.85, 1.35);

        // 落地阴影（离音符表面越远越淡越小）
        if (pose.groundY !== null) {
          var airH = Math.max(0, pose.groundY - y);
          var shAlpha = clamp(0.38 * (1 - airH / 95), 0.05, 0.38);
          var shW = 14 * scale * clamp(1 - airH / 140, 0.45, 1);
          c.save();
          c.fillStyle = 'rgba(0, 0, 0, ' + shAlpha.toFixed(2) + ')';
          c.beginPath();
          c.ellipse(x, pose.groundY + 0.5, shW, 2.4 * scale, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }

        var landFrac = pose.landT > 0 ? Math.sin((pose.landT / 0.16) * Math.PI) : 0;
        var sy = 1 - landFrac * 0.22;
        var sx = 1 + landFrac * 0.18;
        var rumble = (!pose.inAir && roll.isPlaying) ? Math.sin(fx.elapsed * 38) * 0.65 : 0;
        var wheelie = (!pose.cliffFalling && !pose.droneCarry && ms.wheelieT > 0) ? -0.26 * (ms.wheelieT / 0.24) : 0;
        var ang = pose.angle + wheelie;

        c.save();
        c.translate(x, y + rumble);
        c.rotate(ang);
        c.scale(scale * sx, scale * sy);

        // 前大灯暖黄光锥
        c.save();
        var hg = c.createLinearGradient(13, -7, 36, -5);
        hg.addColorStop(0, 'rgba(255, 245, 150, 0.58)');
        hg.addColorStop(1, 'rgba(255, 245, 150, 0)');
        c.fillStyle = hg;
        c.beginPath();
        c.moveTo(13, -8.5);
        c.lineTo(36, -13);
        c.lineTo(36, -1);
        c.lineTo(13, -5);
        c.closePath();
        c.fill();
        c.restore();

        // 氮气小火苗（压到控制点翘头加速时！）
        if (ms.wheelieT > 0) {
          c.fillStyle = '#00f5ff';
          c.beginPath();
          c.moveTo(-15, -4.5);
          c.lineTo(-26 - Math.random() * 6, -5.5);
          c.lineTo(-15, -7.5);
          c.closePath();
          c.fill();
        }

        // 复古 FC 掀背车车体（经典红白蓝配色）
        // 车顶/座舱（白色）
        c.fillStyle = '#ffffff';
        c.strokeStyle = '#141a2e';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(-11, -9);
        c.lineTo(-8, -16.5);
        c.lineTo(3.5, -16.5);
        c.lineTo(8.5, -9);
        c.closePath();
        c.fill();
        c.stroke();

        // 车顶红饰条 + 天线
        c.fillStyle = '#ff2a3c';
        c.fillRect(-7.5, -16.2, 10.5, 2);
        c.strokeStyle = '#141a2e';
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(-8, -16.5);
        c.lineTo(-12.5, -21);
        c.stroke();

        // 天蓝色车窗
        c.fillStyle = '#56d8ff';
        c.beginPath();
        c.moveTo(-6.8, -10.2);
        c.lineTo(-5.2, -14.3);
        c.lineTo(-0.5, -14.3);
        c.lineTo(-0.5, -10.2);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(1, -10.2);
        c.lineTo(1, -14.3);
        c.lineTo(3.2, -14.3);
        c.lineTo(6.6, -10.2);
        c.closePath();
        c.fill();

        // 下车身（鲜艳红色 + 蓝色腰线）
        c.fillStyle = '#ff3131';
        roundRect(c, -14.5, -9.8, 28.5, 6.8, 2.2);
        c.fill();
        c.strokeStyle = '#141a2e';
        c.lineWidth = 1.4;
        c.stroke();

        c.fillStyle = '#2563eb';
        c.fillRect(-13.8, -7.2, 27.2, 2);

        // 车头灯 & 尾灯 & 排气管
        c.fillStyle = '#fff066';
        c.fillRect(11.6, -9, 2.4, 2.6);
        c.fillStyle = '#ff9f1c';
        c.fillRect(-14.4, -8.8, 2, 2.4);
        c.fillStyle = '#526072';
        c.fillRect(-16.5, -5.2, 2.4, 1.8);

        // 两个旋转轮胎（轮胎底边精准贴合 y = 0 即音符上表面）
        var wheels = [-8.2, 7.6];
        var wRot = ms.wheelRot || 0;
        for (var wi = 0; wi < wheels.length; wi++) {
          var wx = wheels[wi], wy = -3.8;
          c.save();
          c.translate(wx, wy);
          c.fillStyle = '#181c28';
          c.beginPath(); c.arc(0, 0, 3.8, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#f1f5f9';
          c.beginPath(); c.arc(0, 0, 2.0, 0, Math.PI * 2); c.fill();
          c.rotate(wRot);
          c.strokeStyle = '#334155';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(-1.8, 0); c.lineTo(1.8, 0);
          c.moveTo(0, -1.8); c.lineTo(0, 1.8);
          c.stroke();
          c.restore();
        }
        c.restore();

        // Miss 音符：救援无人机用吊绳吊着小车飞过！
        if (pose.droneCarry) {
          var roofX = x + 16.0 * scale * Math.sin(ang);
          var roofY = y + rumble - 16.0 * scale * Math.cos(ang);
          drawRescueDrone(c, roofX, roofY, fx.elapsed, scale, roll, A, ang);
        }
      }
    },

    {
      id: 'pointingFinger',
      showcase: false,
      usesPit: false,
      hidePlayhead: true,
      linger: 0.65,
      nameKey: 'eye.mode.pointingFinger',
      fallbackName: '灵魂指读',
      eyeColor: { iris: '#ffb703', ring: '#fff3b0', pupil: '#3b2400' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        ms.pokeT = 0.28;
        var pool = POINT_LINES[langCode()] || POINT_LINES.zh;
        st.pointTag = pool[Math.floor(Math.random() * pool.length)];
        var touchY = geo.y < fx.roll.rulerH + 48 ? (geo.y + geo.h) : geo.y;
        fx.spawn({ kind: 'ring', x: geo.x + Math.min(geo.w * 0.25, 12), y: touchY, r: 3, maxR: 22, color: '#ff3b5c', lineW: 2.2, life: 0.42 });
        if (Math.random() < 0.65) {
          fx.spawn({
            kind: 'glyph',
            text: st.pointTag,
            x: clamp(geo.x + 18, fx.roll.kbW + 30, fx.roll.w - 30),
            y: Math.max(fx.roll.rulerH + 16, geo.y - 26),
            vx: 10 + (Math.random() - 0.5) * 18,
            vy: -34,
            size: 12,
            color: '#ff3b5c',
            life: 0.68
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        fx.modeState.pokeT = 0.18;
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 2, maxR: 16, color: '#ffb703', lineW: 1.8, life: 0.36 });
        fx.spawn({
          kind: 'glyph',
          text: cp.cents >= 0 ? '↗' : '↘',
          x: cp.x,
          y: cp.y - 8,
          vx: 0,
          vy: -28,
          size: 13,
          color: '#ffb703',
          life: 0.52
        });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var gridH = roll.gridBottom();
        var refNote = ctx.cur || ctx.next || ctx.prev;
        var targetTop = refNote ? noteTopY(roll, refNote) : (roll.rulerH + gridH) * 0.5;
        if (!ctx.cur && ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var u = clamp((roll.playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
          var su = u * u * (3 - 2 * u);
          targetTop = noteTopY(roll, ctx.prev) + (noteTopY(roll, ctx.next) - noteTopY(roll, ctx.prev)) * su;
        }
        var flipUp = targetTop < roll.rulerH + 46;
        var targetY = flipUp ? (targetTop + Math.max(6, roll.rowH - 2)) : targetTop;
        targetY = clamp(targetY, roll.rulerH + 10, gridH - 12);
        stepSmoothFollowerY(fx, roll, dt, jumped, targetY, 18);
        ms.flipUp = flipUp;
        ms.ctx = ctx;
        if (ms.pokeT > 0) ms.pokeT = Math.max(0, ms.pokeT - dt);
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          var prog = it.active ? clamp(it.rel, 0, 1) : 1;

          c.save();
          // 黄色荧光笔划重点！
          c.globalAlpha = alpha * (A.isDark ? 0.34 : 0.45);
          c.fillStyle = '#fff04d';
          roundRect(c, g.x - 1, g.y - 2, g.w * prog + 2, g.h + 4, (T.noteRadius || 0) + 2);
          c.fill();

          // 老师红笔重点圈画 + 下划线
          if (it.active) {
            c.globalAlpha = 0.92;
            c.strokeStyle = '#ff2d55';
            c.lineWidth = 2.2;
            c.beginPath();
            c.ellipse(g.x + g.w / 2, g.y + g.h / 2, Math.max(12, g.w / 2 + 5), Math.max(8, g.h / 2 + 4), -0.04, 0, Math.PI * 2);
            c.stroke();
            c.beginPath();
            c.moveTo(g.x, g.y + g.h + 4);
            c.lineTo(g.x + g.w * prog, g.y + g.h + 4);
            c.stroke();
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var ms = fx.modeState;
        var px = roll.beatX(roll.playPos);
        if (px < roll.kbW - 36 || px > roll.w + 36) return;
        var y = ms.followY !== undefined ? ms.followY : (roll.rulerH + roll.gridBottom()) * 0.5;
        var flipUp = !!ms.flipUp;
        var poke = ms.pokeT > 0 ? Math.sin((ms.pokeT / 0.28) * Math.PI) : 0;
        var hoverBob = (ms.ctx && ms.ctx.cur) ? Math.abs(Math.sin(fx.elapsed * 12)) * 4 : Math.sin(fx.elapsed * 6) * 4;
        var dir = flipUp ? 1 : -1;
        var size = clamp(roll.rowH * 1.9, 26, 40);
        // 指尖贴近音符边缘，戳下去时略微前探并放大一点
        var offset = (size * 0.54 + 4 + hoverBob - poke * 7) * dir;
        var fingerY = y + offset;
        var emoji = flipUp ? '👆' : '👇';

        c.save();
        // 指尖落点小光斑
        if (ms.ctx && ms.ctx.cur) {
          c.fillStyle = 'rgba(255, 59, 92, 0.72)';
          c.beginPath();
          c.arc(px, y, 3.2 + poke * 2.4, 0, Math.PI * 2);
          c.fill();
        }

        // 绘制超大表情包手指 emoji（带柔和投影以便任意主题都清晰）
        c.translate(px, fingerY);
        c.rotate(Math.sin(fx.elapsed * 8) * 0.06 + poke * 0.09 * (flipUp ? -1 : 1));
        var sc = 1 + poke * 0.14;
        c.scale(sc, sc);
        c.font = Math.round(size) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = A.isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.35)';
        c.shadowBlur = A.isPixel ? 0 : 8;
        c.shadowOffsetY = 2;
        c.fillText(emoji, 0, 0);
        c.restore();

        // 课本点读放大歌词气泡
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          if (!it.active) continue;
          var lyr = cleanLyric(it.n);
          var bx = clamp(g.x + g.w * 0.5, roll.kbW + 32, roll.w - 32);
          var by = flipUp ? Math.min(roll.gridBottom() - 14, g.y + g.h + size + 14) : Math.max(roll.rulerH + 14, g.y - size - 12);
          c.save();
          c.font = 'bold 13px Tahoma, "Microsoft YaHei", sans-serif';
          var tw = c.measureText(lyr).width + 16;
          c.fillStyle = A.isDark ? '#1e1b2e' : '#fffbe6';
          c.strokeStyle = '#ff3b5c';
          c.lineWidth = 1.6;
          roundRect(c, bx - tw / 2, by - 10, tw, 20, 8);
          c.fill(); c.stroke();
          c.fillStyle = A.isDark ? '#fff066' : '#b91c1c';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(lyr, bx, by + 0.5);
          c.restore();
        }
      }
    },

    {
      id: 'frogHopper',
      showcase: false,
      usesPit: false,
      hidePlayhead: true,
      linger: 0.85,
      nameKey: 'eye.mode.frogHopper',
      fallbackName: '青蛙跳荷叶',
      eyeColor: { iris: '#22c55e', ring: '#bbf7d0', pupil: '#052e16' },
      onEnterNote: function (fx, n, st, geo) {
        if (isNoteG2pMiss(fx.roll, n, fx.modeState.missCache)) return;
        if (Math.random() < 0.42) {
          var pool = FROG_LINES[langCode()] || FROG_LINES.zh;
          fx.spawn({
            kind: 'glyph',
            text: pool[Math.floor(Math.random() * pool.length)],
            x: geo.x + Math.min(geo.w * 0.5, 22),
            y: Math.max(fx.roll.rulerH + 16, geo.y - 20),
            vx: (Math.random() - 0.5) * 16,
            vy: -32,
            size: 12,
            color: '#4ade80',
            life: 0.68
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        if (isNoteG2pMiss(fx.roll, n, fx.modeState.missCache)) return;
        // 控制点变成小飞虫，青蛙闪电伸舌头吃掉！
        fx.modeState.tongue = { beat: cp.beat, y: cp.y, t: 0, dur: 0.22 };
        fx.spawn({ kind: 'spark', x: cp.x, y: cp.y, vx: 0, vy: -24, r: 3.2, color: '#ff70a6', life: 0.35 });
        fx.spawn({ kind: 'glyph', text: '+1🦟', x: cp.x, y: cp.y - 10, vx: 0, vy: -34, size: 11, color: '#fde047', life: 0.62 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (!ms.promptCache) ms.promptCache = Object.create(null);
        if (!ms.missCache) ms.missCache = Object.create(null);
        var pose = stepHopperState(fx, roll, dt, jumped, {
          minArc: 32,
          maxArc: 104,
          dyScale: 0.42,
          gapScale: 0.2,
          maxGapBoost: 48,
          legatoArc: 22,
          topPad: 22,
          botPad: 6,
          landDur: 0.2,
          entryVault: true,
          entryLeadBeats: 1.15,
          entryOvershoot: 56,
          entryDropDur: 0.44,
          interludeCliff: true,
          interludeMinBeats: 3.2,
          onEntryLaunch: function (ex, ey) {
            fx.spawn({ kind: 'ring', x: ex, y: ey, r: 5, maxR: 32, color: '#38bdf8', lineW: 2.2, life: 0.52 });
            for (var i = 0; i < 8; i++) {
              fx.spawn({
                kind: 'drop',
                x: ex + (Math.random() - 0.5) * 16,
                y: ey,
                vx: (Math.random() - 0.5) * 85,
                vy: -75 - Math.random() * 75,
                r: 2.5 + Math.random() * 1.5,
                color: '#38bdf8',
                life: 0.56
              });
            }
            var hi = langCode() === 'ja' ? 'ぴょん!' : (langCode() === 'en' ? 'BOING!' : '跳!');
            fx.spawn({
              kind: 'glyph',
              text: hi,
              x: clamp(ex, roll.kbW + 24, roll.w - 24),
              y: Math.max(roll.rulerH + 20, ey - 20),
              vx: 10,
              vy: -42,
              size: 13,
              color: '#4ade80',
              life: 0.65
            });
          },
          endCliffFall: true,
          cliffVyMin: 210,
          cliffVyMax: 300,
          cliffVxScale: 2.0,
          cliffGravity: 740,
          onCliffJump: function (jx, jy) {
            fx.spawn({ kind: 'ring', x: jx, y: jy, r: 4, maxR: 28, color: '#38bdf8', lineW: 2, life: 0.5 });
            for (var i = 0; i < 7; i++) {
              fx.spawn({
                kind: 'drop',
                x: jx + (Math.random() - 0.5) * 10,
                y: jy - 2,
                vx: -25 - Math.random() * 65,
                vy: -35 - Math.random() * 55,
                r: 2.4 + Math.random() * 1.4,
                color: '#38bdf8',
                life: 0.52
              });
            }
            var bye = langCode() === 'ja' ? 'ケロ〜!' : (langCode() === 'en' ? 'RIBBIT~!' : '呱〜!');
            fx.spawn({
              kind: 'glyph',
              text: bye,
              x: clamp(jx, roll.kbW + 24, roll.w - 24),
              y: Math.max(roll.rulerH + 16, jy - 22),
              vx: 14,
              vy: -34,
              size: 13,
              color: '#4ade80',
              life: 0.72
            });
          },
          onTakeoff: function (tx, ty) {
            fx.spawn({ kind: 'ring', x: tx, y: ty, r: 3, maxR: 20, color: '#38bdf8', lineW: 1.6, life: 0.42 });
          },
          onLand: function (lx, ly) {
            fx.spawn({ kind: 'ring', x: lx, y: ly, r: 4, maxR: 26, color: '#38bdf8', lineW: 2, life: 0.48 });
            for (var i = 0; i < 6; i++) {
              fx.spawn({
                kind: 'drop',
                x: lx + (Math.random() - 0.5) * 10,
                y: ly - 2,
                vx: (Math.random() - 0.5) * 84,
                vy: -45 - Math.random() * 45,
                r: 2.2 + Math.random() * 1.4,
                color: '#38bdf8',
                life: 0.48
              });
            }
          },
          droneOnMiss: true,
          onMissAirlift: function (mx, my) {
            fx.spawn({ kind: 'ring', x: mx, y: my - 8, r: 5, maxR: 28, color: '#ef4444', lineW: 2.2, life: 0.44 });
            fx.spawn({
              kind: 'glyph',
              text: 'MISS!',
              x: clamp(mx, roll.kbW + 26, roll.w - 26),
              y: Math.max(roll.rulerH + 18, my - 26),
              vx: 6,
              vy: -32,
              size: 13,
              color: '#ef4444',
              life: 0.72
            });
          }
        });

        // 即将跳上的荷叶音符打字演出：逐字输对后青蛙起跳落地
        var getPrompt = function (note) {
          var raw = cleanLyric(note).replace(/#\d+$/, '').trim() || 'a';
          var lang = (roll && typeof roll.noteLanguage === 'function')
            ? roll.noteLanguage(note)
            : (note.noteLang || (note.langSource === 'note' ? note.lang : '') || (roll && roll.phonemizer) || note.lang || (roll && roll.lang) || 'zh');
          var key = String(note.id) + '\x00' + raw + '\x00' + lang;
          if (ms.promptCache[key]) return ms.promptCache[key];
          var res;
          if (/^[A-Za-z0-9''~+=-]+$/.test(raw)) {
            res = { chars: raw.toLowerCase().split('').slice(0, 12), display: null };
          } else {
            var rom = '';
            if (NSG.g2p) {
              try {
                var syls = NSG.g2p(raw, lang) || [];
                var parts = [];
                for (var si = 0; si < syls.length; si++) {
                  var rStr = String((syls[si] && syls[si].roman) || '').replace(/[0-9ˊˇˋ\s]+/g, '').toLowerCase();
                  if (/^[a-z]+$/.test(rStr)) parts.push(rStr);
                }
                rom = parts.join('');
              } catch (e) { rom = ''; }
            }
            if (rom && rom.length <= 12) {
              res = { chars: rom.split(''), display: raw };
            } else {
              res = { chars: Array.from(raw).slice(0, 8), display: null };
            }
          }
          ms.promptCache[key] = res;
          return res;
        };

        var ctx = pose && pose.ctx;
        var target = (ctx && ctx.next) || null;
        var preview = null;
        if (target) {
          var allNotes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
          var bestStart = Infinity;
          for (var ni = 0; ni < allNotes.length; ni++) {
            var cand = allNotes[ni];
            if (cand && cand !== target && cand.start > target.start + 1e-4 && cand.start < bestStart) {
              bestStart = cand.start;
              preview = cand;
            }
          }
        }

        if (jumped) {
          ms.typingNoteId = null;
          ms.typingNote = null;
          ms.typingPrompt = null;
          ms.typingPrevCount = 0;
          ms.typingDonePop = 0;
          ms.typingKeyPop = 0;
          ms.typingWasMiss = false;
          ms.typingMissPopId = null;
        }
        ms.typingKeyPop = Math.max(0, (ms.typingKeyPop || 0) - dt * 6);
        ms.typingDonePop = Math.max(0, (ms.typingDonePop || 0) - dt * 3.5);

        // 辅助：补全并弹出从 fromIdx 到 toIdx-1 之间所有刚输入的字母与完成光环
        var emitTypedLetters = function (note, prompt, fromIdx, toIdx) {
          if (!note || !prompt || !roll.isPlaying || toIdx <= fromIdx) return;
          var chars = prompt.chars || [];
          var total = Math.max(1, chars.length);
          var gx = roll.beatX(note.start) + Math.max(6, note.dur * roll.pxBeat) * 0.5;
          var gy = noteTopY(roll, note);
          var py = gy < roll.rulerH + 46 ? (gy + Math.max(8, roll.rowH) + 18) : (gy - 22);
          if (gx < roll.kbW - 20 || gx > roll.w + 20) return;
          for (var ci = fromIdx; ci < toIdx && ci < total; ci++) {
            var ch = chars[ci] || '';
            fx.spawn({
              kind: 'glyph',
              text: ch.toUpperCase(),
              x: clamp(gx + (ci + 0.5 - total * 0.5) * 9.5, roll.kbW + 18, roll.w - 18),
              y: py - 4,
              vx: (Math.random() - 0.5) * 16,
              vy: -34,
              size: 11,
              color: '#4ade80',
              life: 0.44
            });
          }
          if (toIdx >= total && fromIdx < total) {
            ms.typingDonePop = 1;
            fx.spawn({ kind: 'ring', x: clamp(gx, roll.kbW + 18, roll.w - 18), y: py, r: 6, maxR: 26, color: '#22c55e', lineW: 2.2, life: 0.38 });
          }
        };

        // 若青蛙刚刚跳上之前的目标音符（零间隙连音切换时 target 已推进到下一个音符），补发未弹完的末尾字母！
        if (ms.typingNoteId && !ms.typingWasMiss && (!target || target.id !== ms.typingNoteId) &&
            ctx && ctx.cur && ctx.cur.id === ms.typingNoteId && ms.typingNote && ms.typingPrompt) {
          var prevTotal = Math.max(1, (ms.typingPrompt.chars || []).length);
          if ((ms.typingPrevCount || 0) < prevTotal) {
            emitTypedLetters(ms.typingNote, ms.typingPrompt, ms.typingPrevCount || 0, prevTotal);
            ms.typingPrevCount = prevTotal;
          }
        }

        if (target) {
          var targetMissed = isNoteG2pMiss(roll, target, ms.missCache);
          var previewMissed = !!(preview && isNoteG2pMiss(roll, preview, ms.missCache));
          var prompt = getPrompt(target);
          var len = Math.max(1, prompt.chars.length);
          // 精准卡在青蛙起跳前完成最后一个字母输入：
          // - 若与下一音符之间为长间奏（>= 3.2 拍），青蛙会先跳出屏幕，等到间奏末尾再破底跃上，故打字对齐重新跃入时刻；
          // - 正在前一个音符上（非长间奏）时，起跳点为 cur.end；
          // - 处于短休止间隙（已在空中飞跃）时，说明已全部输对并起跳；
          // - 处于首个音符前奏时，起跳点为入场跃起时刻 firstStart - entryLead。
          var launchBeat;
          var maxWin;
          var interludeMin = 3.2;
          var gapAfterPrev = (ctx.cur ? (target.start - (ctx.cur.start + ctx.cur.dur)) : (ctx.prev ? (target.start - (ctx.prev.start + ctx.prev.dur)) : 0));
          if ((ctx.cur || ctx.prev) && gapAfterPrev >= interludeMin) {
            var reLeadI = clamp(1.15, 0.45, Math.min(1.15, gapAfterPrev * 0.42));
            launchBeat = target.start - reLeadI;
            maxWin = Math.max(0.25, Math.min(gapAfterPrev - reLeadI, 1.25));
          } else if (ctx.cur) {
            launchBeat = ctx.cur.start + ctx.cur.dur;
            maxWin = Math.max(0.14, ctx.cur.dur * 0.92);
          } else if (ctx.prev) {
            launchBeat = ctx.prev.start + ctx.prev.dur;
            maxWin = 0.65;
          } else {
            var leadSpan = Math.min(target.start, 1.15);
            launchBeat = Math.max(0, target.start - leadSpan);
            maxWin = Math.max(0.2, Math.min(launchBeat, 1.1));
          }
          var typeWin = clamp(0.32 + len * 0.13, 0.14, Math.max(0.14, Math.min(1.25, maxWin)));
          var finishBeat = launchBeat - Math.min(0.035, typeWin * 0.10);
          var startBeat = launchBeat - typeWin;
          var typed;
          if (targetMissed) {
            typed = 0;
            if (ms.typingNoteId !== target.id) {
              ms.typingNoteId = target.id;
              ms.typingNote = target;
              ms.typingPrompt = prompt;
              ms.typingPrevCount = 0;
              ms.typingWasMiss = true;
            }
            if (roll.isPlaying && !jumped && roll.playPos >= finishBeat - 1e-4 && ms.typingMissPopId !== target.id) {
              ms.typingMissPopId = target.id;
              ms.typingDonePop = 1;
              var mgx = roll.beatX(target.start) + Math.max(6, target.dur * roll.pxBeat) * 0.5;
              var mgy = noteTopY(roll, target);
              var mpy = mgy < roll.rulerH + 46 ? (mgy + Math.max(8, roll.rowH) + 18) : (mgy - 22);
              if (mgx >= roll.kbW - 20 && mgx <= roll.w + 20) {
                fx.spawn({ kind: 'glyph', text: '✗', x: clamp(mgx, roll.kbW + 18, roll.w - 18), y: mpy - 4, vx: 0, vy: -32, size: 13, color: '#ef4444', life: 0.48 });
              }
            }
          } else {
            if (roll.playPos >= finishBeat - 1e-4) {
              typed = len;
            } else if (roll.playPos <= startBeat) {
              typed = 0;
            } else {
              var frac = clamp((roll.playPos - startBeat) / Math.max(1e-4, finishBeat - startBeat), 0, 1);
              typed = Math.min(len - 1, Math.floor(frac * len));
            }

            if (ms.typingNoteId !== target.id) {
              ms.typingNoteId = target.id;
              ms.typingNote = target;
              ms.typingPrompt = prompt;
              ms.typingPrevCount = 0;
              ms.typingWasMiss = false;
              if (typed > 0 && roll.isPlaying && !jumped) {
                emitTypedLetters(target, prompt, 0, typed);
                ms.typingKeyPop = 1;
              }
              ms.typingPrevCount = typed;
            } else if (typed > (ms.typingPrevCount || 0) && roll.isPlaying) {
              emitTypedLetters(target, prompt, ms.typingPrevCount || 0, typed);
              ms.typingKeyPop = 1;
              ms.typingPrevCount = typed;
            } else if (typed < (ms.typingPrevCount || 0)) {
              ms.typingPrevCount = typed;
            }
          }

          ms.typingState = {
            note: target,
            prompt: prompt,
            typed: typed,
            done: !targetMissed && typed >= len,
            isMiss: targetMissed,
            preview: (preview && preview.start - target.start <= 4.5) ? { note: preview, prompt: getPrompt(preview), isMiss: previewMissed } : null
          };
        } else {
          ms.typingState = null;
          ms.typingNoteId = null;
          ms.typingNote = null;
          ms.typingPrompt = null;
          ms.typingWasMiss = false;
        }

        if (ms.tongue) {
          ms.tongue.t += dt;
          if (ms.tongue.t >= ms.tongue.dur) ms.tongue = null;
        }
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        var ms = fx.modeState;
        // 被青蛙踩过的音符变成翠绿荷叶；G2P/词典失败的 Miss 音符没有荷叶，改绘红色警示虚框！
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 1 : it.exitAlpha;
          if (alpha <= 0) continue;
          if (isNoteG2pMiss(roll, it.n, ms && ms.missCache)) {
            c.save();
            c.globalAlpha = alpha * 0.85;
            c.fillStyle = A.isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.14)';
            roundRect(c, g.x, g.y, g.w, g.h, Math.min(g.h * 0.48, 8));
            c.fill();
            c.strokeStyle = '#ef4444';
            c.lineWidth = 1.4;
            c.setLineDash([4, 3]);
            c.stroke();
            c.restore();
            continue;
          }
          c.save();
          c.globalAlpha = alpha * (A.isDark ? 0.55 : 0.48);
          var lg = c.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
          lg.addColorStop(0, '#4ade80');
          lg.addColorStop(1, '#15803d');
          c.fillStyle = lg;
          roundRect(c, g.x, g.y, g.w, g.h, Math.min(g.h * 0.48, 8));
          c.fill();
          c.strokeStyle = '#86efac';
          c.lineWidth = 1.4;
          c.stroke();
          // 荷叶叶脉纹
          if (g.w > 18) {
            c.strokeStyle = 'rgba(220, 252, 231, 0.48)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(g.x + 5, g.y + g.h * 0.5);
            c.lineTo(g.x + g.w - 5, g.y + g.h * 0.5);
            c.stroke();
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var pose = ms && ms.pose;

        // 0. 绘制即将跳上的荷叶打字牌（全部字母输对亮绿 ✓ 后青蛙才起跳落地；Miss 音符亮红 ✗ 并由无人机吊运）
        var ts = ms && ms.typingState;
        if (ts && ts.note) {
          var drawTypingPlaque = function (note, prompt, typedCount, isDone, isPreview, isMiss) {
            var nx = roll.beatX(note.start);
            var nw = Math.max(6, note.dur * roll.pxBeat);
            if (nx > roll.w + 40 || nx + nw < roll.kbW - 40) return;
            var ny = noteTopY(roll, note);
            var nh = Math.max(6, roll.rowH - 2);
            var below = ny < roll.rulerH + 46;
            var px = clamp(nx + nw * 0.5, roll.kbW + 38, roll.w - 38);
            var py = below ? Math.min(roll.gridBottom() - 16, ny + nh + 18) : Math.max(roll.rulerH + 16, ny - 21);

            var chars = prompt.chars || [];
            var disp = prompt.display;
            var fsz = isPreview ? 11 : 13;
            var hasWide = false;
            for (var wi = 0; wi < chars.length; wi++) {
              if (chars[wi] && chars[wi].charCodeAt(0) > 127) { hasWide = true; break; }
            }
            var chW = hasWide ? (isPreview ? 11.5 : 13.5) : (isPreview ? 7.4 : 9.2);
            var keysW = chars.length * chW;
            var dispW = disp ? (Math.min(28, disp.length * 13) + 8) : 0;
            var checkW = (isDone || isMiss) ? 14 : 0;
            var boxW = Math.max(30, keysW + dispW + checkW + 16);
            var boxH = isPreview ? 20 : 24;
            var pop = (!isPreview && (ms.typingDonePop || ms.typingKeyPop))
              ? (1 + (ms.typingDonePop || 0) * 0.14 + (ms.typingKeyPop || 0) * 0.05)
              : 1;
            var shakeX = (isMiss && !isPreview) ? Math.sin(fx.elapsed * 32) * 1.35 : 0;

            c.save();
            c.globalAlpha = isPreview ? 0.80 : 0.96;
            c.translate(px + shakeX, py);
            c.scale(pop, pop);

            // 指向荷叶的小尖角 + 圆角打字牌底座
            var bgCol = isMiss
              ? (A.isDark ? '#3b0d18' : '#fee2e2')
              : (isDone ? (A.isDark ? '#06331e' : '#dcfce7') : (A.isDark ? '#142030' : '#ffffff'));
            var bdCol = isMiss ? '#ef4444' : (isDone ? '#22c55e' : (isPreview ? '#64748b' : '#0ea5e9'));
            c.fillStyle = bgCol;
            c.strokeStyle = bdCol;
            c.lineWidth = (isDone || isMiss) ? 2 : 1.5;
            roundRect(c, -boxW / 2, -boxH / 2, boxW, boxH, 7);
            c.fill();
            c.stroke();

            // 尖角连向目标荷叶
            c.beginPath();
            if (below) {
              c.moveTo(-4, -boxH / 2); c.lineTo(0, -boxH / 2 - 5); c.lineTo(4, -boxH / 2);
            } else {
              c.moveTo(-4, boxH / 2); c.lineTo(0, boxH / 2 + 5); c.lineTo(4, boxH / 2);
            }
            c.closePath();
            c.fill();

            var curX = -boxW / 2 + 8;
            c.textBaseline = 'middle';

            // 若有中文/假名原歌词，先绘制原字与细分隔线
            if (disp) {
              c.font = 'bold ' + (fsz - 0.5) + 'px Tahoma, "Microsoft YaHei", sans-serif';
              c.textAlign = 'left';
              c.fillStyle = isMiss
                ? (A.isDark ? '#fca5a5' : '#b91c1c')
                : (isDone ? (A.isDark ? '#86efac' : '#15803d') : (A.isDark ? '#e2e8f0' : '#0f172a'));
              c.fillText(disp, curX, 0.5);
              curX += dispW - 4;
              c.strokeStyle = isMiss ? 'rgba(239,68,68,0.4)' : (A.isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.3)');
              c.lineWidth = 1;
              c.beginPath(); c.moveTo(curX, -boxH * 0.28); c.lineTo(curX, boxH * 0.28); c.stroke();
              curX += 5;
            }

            // 逐字母绘制打字进度（已输入=亮绿，当前待输入=闪烁下划线光标，未输入=淡灰；Miss=红色报错）
            c.font = 'bold ' + fsz + 'px Consolas, "Courier New", Tahoma, "Microsoft YaHei", sans-serif';
            c.textAlign = 'center';
            for (var ci = 0; ci < chars.length; ci++) {
              var cxChar = curX + ci * chW + chW * 0.5;
              var typed = !isMiss && ci < typedCount;
              var isCursor = !isPreview && !isDone && !isMiss && ci === typedCount;
              c.fillStyle = isMiss
                ? (A.isDark ? '#f87171' : '#dc2626')
                : (typed
                  ? (A.isDark ? '#4ade80' : '#16a34a')
                  : (isCursor ? (A.isDark ? '#ffffff' : '#0f172a') : (A.isDark ? 'rgba(203,213,225,0.82)' : '#64748b')));
              c.fillText(chars[ci], cxChar, 0.5);
              if (isCursor && Math.sin(fx.elapsed * 18) > -0.35) {
                c.fillStyle = '#22c55e';
                c.fillRect(cxChar - chW * 0.42, boxH * 0.28, chW * 0.84, 2);
              }
            }

            // 全部输对亮出绿色 ✓，Miss 亮出红色 ✗
            if (isMiss) {
              c.font = 'bold ' + fsz + 'px Tahoma, sans-serif';
              c.fillStyle = A.isDark ? '#f87171' : '#dc2626';
              c.fillText('✗', boxW / 2 - 10, 0.5);
            } else if (isDone) {
              c.font = 'bold ' + fsz + 'px Tahoma, sans-serif';
              c.fillStyle = A.isDark ? '#4ade80' : '#16a34a';
              c.fillText('✓', boxW / 2 - 10, 0.5);
            }
            c.restore();
          };

          if (ts.preview) {
            drawTypingPlaque(ts.preview.note, ts.preview.prompt, 0, false, true, !!ts.preview.isMiss);
          }
          drawTypingPlaque(ts.note, ts.prompt, ts.typed, ts.done, false, !!ts.isMiss);
        }

        if (!pose || pose.cliffDone || pose.hidden) return;
        var x = pose.cliffFalling
          ? (roll.beatX(pose.cliffBaseBeat) + pose.cliffOffsetPx)
          : (roll.beatX(roll.playPos) + (pose.entryOffsetPx || 0));
        if (x < roll.kbW - 36 || x > roll.w + 36) return;
        var y = pose.y;
        var scale = clamp(roll.rowH / 16, 0.85, 1.35);

        // 闪电粉红舌头（从嘴角弹出捕食控制点飞虫！）
        if (ms.tongue && !pose.cliffFalling && !pose.entryVaulting && !pose.droneCarry) {
          var tg = ms.tongue;
          var tp = tg.t / tg.dur;
          var reach = tp < 0.45 ? (tp / 0.45) : (1 - (tp - 0.45) / 0.55);
          var tx = roll.beatX(tg.beat), ty = tg.y;
          var mx = x + 10.5 * scale, my = y - 6.6 * scale;
          var ex = mx + (tx - mx) * reach, ey = my + (ty - my) * reach;
          c.save();
          c.strokeStyle = '#ff4d8d';
          c.lineWidth = 2.8 * scale;
          c.lineCap = 'round';
          c.beginPath(); c.moveTo(mx, my); c.lineTo(ex, ey); c.stroke();
          c.fillStyle = '#ff2a70';
          c.beginPath(); c.arc(ex, ey, 3.0 * scale, 0, Math.PI * 2); c.fill();
          c.restore();
        }

        // 落地荷叶水影
        if (pose.groundY !== null) {
          var airH = Math.max(0, pose.groundY - y);
          c.save();
          c.fillStyle = 'rgba(5, 46, 22, ' + clamp(0.32 * (1 - airH / 110), 0.04, 0.32).toFixed(2) + ')';
          c.beginPath();
          c.ellipse(x + 0.5 * scale, pose.groundY + 1, 12 * scale * clamp(1 - airH / 150, 0.4, 1), 2.4 * scale, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }

        var landFrac = pose.landT > 0 ? Math.sin((pose.landT / 0.2) * Math.PI) : 0;
        var sx = pose.droneCarry ? 1.0 : (pose.inAir ? 1.14 : (1 + landFrac * 0.22));
        var sy = pose.droneCarry ? 1.0 : (pose.inAir ? 0.88 : (1 - landFrac * 0.24));
        var croak = (!pose.inAir && pose.onNote) ? Math.abs(Math.sin(fx.elapsed * 14)) : 0;
        var outline = '#14532d';

        c.save();
        c.translate(x, y);
        c.rotate(pose.angle);
        c.scale(scale * sx, scale * sy);
        c.lineCap = 'round';
        c.lineJoin = 'round';

        // 1. 远侧眼包（在头顶右后方，与近侧眼清晰错开）
        c.fillStyle = '#22c55e';
        c.strokeStyle = outline;
        c.lineWidth = 1.3;
        c.beginPath(); c.arc(8.0, -12.4, 3.3, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(8.3, -12.5, 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0f172a';
        c.beginPath(); c.arc(9.0, -12.5, 1.15, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(8.5, -13.1, 0.45, 0, Math.PI * 2); c.fill();

        // 2. 远侧前腿
        var kickFar = pose.droneCarry ? Math.sin(fx.elapsed * 22 + Math.PI) * 2.0 : 0;
        c.strokeStyle = outline;
        c.lineWidth = 2.6;
        c.beginPath();
        if (pose.droneCarry) {
          c.moveTo(7.0, -4.4); c.lineTo(8.8, 0.2 + kickFar * 0.5);
        } else if (pose.inAir) {
          c.moveTo(7.4, -4.4); c.lineTo(10.8, -2.0);
        } else {
          c.moveTo(6.6, -4.6); c.lineTo(8.4, -0.7); c.lineTo(10.0, -0.6);
        }
        c.stroke();
        c.strokeStyle = '#16a34a';
        c.lineWidth = 1.4;
        c.stroke();

        // 3. 空中远侧后腿（无人机吊运时下垂扑腾；普通跳跃时向后舒展）
        if (pose.droneCarry) {
          c.strokeStyle = outline;
          c.lineWidth = 3.2;
          c.beginPath();
          c.moveTo(-4.8, -3.4); c.lineTo(-6.2, 1.4 + kickFar * 0.4); c.lineTo(-3.8, 4.8 + kickFar);
          c.stroke();
          c.strokeStyle = '#16a34a';
          c.lineWidth = 1.8;
          c.stroke();
        } else if (pose.inAir) {
          c.strokeStyle = outline;
          c.lineWidth = 3.2;
          c.beginPath();
          c.moveTo(-6.5, -3.6); c.lineTo(-14.5, -1.2); c.lineTo(-19.5, 0.8);
          c.stroke();
          c.strokeStyle = '#16a34a';
          c.lineWidth = 1.8;
          c.stroke();
        }

        // 4. 圆润饱满的小青蛙身体与宽吻轮廓（鸣叫时喉部轮廓直接一体鼓起，无外挂割裂感）
        var drawBodyPath = function () {
          c.beginPath();
          c.moveTo(-8.4, -1.2);
          c.bezierCurveTo(-11.4, -4.8, -8.4, -11.0, -1.6, -11.4);
          c.bezierCurveTo(3.6, -11.8, 11.4, -10.5, 12.2, -7.2);
          c.bezierCurveTo(12.5 + croak * 2.6, -4.2 + croak * 1.1, 8.8 + croak * 3.0, -1.6 + croak * 1.1, 3.2, -1.0);
          c.bezierCurveTo(-1.2, -0.5, -6.0, -0.5, -8.4, -1.2);
          c.closePath();
        };
        var bodyG = c.createLinearGradient(0, -12, 0, 0);
        bodyG.addColorStop(0, '#5ee86e');
        bodyG.addColorStop(0.55, '#22c55e');
        bodyG.addColorStop(1, '#16a34a');
        c.fillStyle = bodyG;
        drawBodyPath();
        c.fill();

        // 奶绿柔和肚皮 + 喉部一体鼓动高光（全部裁剪在身体轮廓内部）
        c.save();
        drawBodyPath();
        c.clip();
        c.fillStyle = '#ecfccb';
        c.beginPath();
        c.ellipse(3.6 + croak * 2.2, -2.0 + croak * 0.25, 7.6 + croak * 2.2, 3.6 + croak * 1.25, -0.1, 0, Math.PI * 2);
        c.fill();
        if (croak > 0.05) {
          c.fillStyle = 'rgba(254, 249, 195, ' + (0.65 * croak).toFixed(2) + ')';
          c.beginPath();
          c.ellipse(8.8 + croak * 1.4, -3.2 + croak * 0.4, 3.2 + croak * 1.8, 2.2 + croak * 1.2, 0.1, 0, Math.PI * 2);
          c.fill();
        }
        // 背部清透高光
        c.fillStyle = 'rgba(220, 252, 231, 0.42)';
        c.beginPath();
        c.ellipse(-3.2, -8.8, 4.2, 1.5, -0.28, 0, Math.PI * 2);
        c.fill();
        c.restore();

        c.strokeStyle = outline;
        c.lineWidth = 1.35;
        drawBodyPath();
        c.stroke();

        // 6. 可爱表情：小鼻孔 + 粉嫩腮红 + 开心大微笑（被无人机吊着时露出惊讶小 o 嘴）
        c.fillStyle = outline;
        c.beginPath(); c.arc(10.5, -8.6, 0.65, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255, 110, 155, 0.52)';
        c.beginPath(); c.ellipse(5.8, -7.5, 2.0, 1.15, 0, 0, Math.PI * 2); c.fill();
        if (pose.droneCarry) {
          c.fillStyle = '#ff6b8b';
          c.strokeStyle = outline;
          c.lineWidth = 1.15;
          c.beginPath();
          c.ellipse(9.5, -6.1, 1.4, 1.75, 0, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        } else {
          c.strokeStyle = outline;
          c.lineWidth = 1.25;
          c.beginPath();
          c.moveTo(11.9, -6.5);
          c.quadraticCurveTo(8.8, -5.0, 5.4, -6.2);
          c.stroke();
        }

        // 7. 近侧大眼（自然长在头顶，无割裂黑框）
        c.fillStyle = '#38d959';
        c.beginPath(); c.arc(3.2, -12.6, 3.8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = outline;
        c.lineWidth = 1.3;
        c.beginPath(); c.arc(3.2, -12.6, 3.8, Math.PI * 0.92, Math.PI * 2.15); c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(3.5, -12.7, 2.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#0f172a';
        c.beginPath(); c.arc(4.3, -12.7, 1.35, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(3.7, -13.4, 0.58, 0, Math.PI * 2); c.fill();

        // 8. 近侧后腿与前爪（无人机吊运时扑腾下垂 / 蹲坐蜷折 Z 字蛙腿 / 跳跃向后蹬直蹼足）
        if (pose.droneCarry) {
          var kick = Math.sin(fx.elapsed * 22) * 2.2;
          c.strokeStyle = outline;
          c.lineWidth = 3.8;
          c.beginPath();
          c.moveTo(-6.2, -3.6); c.lineTo(-9.2, 1.4 + kick * 0.4); c.lineTo(-7.2, 5.2 + kick);
          c.stroke();
          c.strokeStyle = '#22c55e';
          c.lineWidth = 2.1;
          c.stroke();
          c.strokeStyle = outline;
          c.lineWidth = 2.8;
          c.beginPath(); c.moveTo(3.2, -4.4); c.lineTo(5.6, 0.6 - kick * 0.5); c.stroke();
          c.strokeStyle = '#22c55e';
          c.lineWidth = 1.4;
          c.stroke();
        } else if (pose.inAir) {
          // 蹬直的青蛙后腿 + 三趾蹼爪
          c.strokeStyle = outline;
          c.lineWidth = 4.2;
          c.beginPath();
          c.moveTo(-6.2, -4.4); c.lineTo(-13.2, -2.8); c.lineTo(-19.5, -1.2);
          c.stroke();
          c.strokeStyle = '#22c55e';
          c.lineWidth = 2.4;
          c.stroke();
          // 蹼足三趾
          c.strokeStyle = outline;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(-19.5, -1.2); c.lineTo(-23.2, -3.0);
          c.moveTo(-19.5, -1.2); c.lineTo(-23.8, -0.4);
          c.moveTo(-19.5, -1.2); c.lineTo(-22.4, 1.8);
          c.stroke();
          // 收起的前臂
          c.strokeStyle = outline;
          c.lineWidth = 3.0;
          c.beginPath(); c.moveTo(3.4, -4.8); c.lineTo(6.2, -1.8); c.stroke();
          c.strokeStyle = '#22c55e';
          c.lineWidth = 1.5;
          c.stroke();
        } else {
          // 经典蹲坐折叠蛙腿 + 贴地小脚掌
          c.fillStyle = '#1fb854';
          c.strokeStyle = outline;
          c.lineWidth = 1.3;
          c.beginPath();
          c.ellipse(-5.2, -4.2, 4.9, 3.3, -0.22, 0, Math.PI * 2);
          c.fill(); c.stroke();
          // 后脚掌与脚趾贴合荷叶表面 y = 0
          c.strokeStyle = outline;
          c.lineWidth = 2.6;
          c.beginPath(); c.moveTo(-7.2, -1.2); c.lineTo(-2.4, -0.6); c.stroke();
          c.strokeStyle = '#22c55e';
          c.lineWidth = 1.3;
          c.stroke();
          // 撑地前臂与小爪
          c.strokeStyle = outline;
          c.lineWidth = 3.0;
          c.beginPath(); c.moveTo(2.6, -5.0); c.lineTo(4.2, -0.8); c.lineTo(6.2, -0.6); c.stroke();
          c.strokeStyle = '#34d35e';
          c.lineWidth = 1.5;
          c.stroke();
        }
        c.restore();

        // Miss 音符：救援无人机用吊绳吊着小青蛙飞过！
        if (pose.droneCarry) {
          var backX = x + 11.2 * scale * Math.sin(pose.angle);
          var backY = y - 11.2 * scale * Math.cos(pose.angle);
          drawRescueDrone(c, backX, backY, fx.elapsed, scale, roll, A, pose.angle);
        }
      }
    },

    {
      id: 'magnifyingGlass',
      showcase: false,
      usesPit: true,
      hidePlayhead: true,
      linger: 0.7,
      nameKey: 'eye.mode.magnifyingGlass',
      fallbackName: '名侦探放大镜',
      eyeColor: { iris: '#d4a373', ring: '#fefae0', pupil: '#1f160d' },
      onEnterNote: function (fx, n, st, geo) {
        if (Math.random() < 0.45) {
          var pool = CLUE_LINES[langCode()] || CLUE_LINES.zh;
          fx.spawn({
            kind: 'glyph',
            text: '🔍 ' + pool[Math.floor(Math.random() * pool.length)],
            x: clamp(geo.x + 16, fx.roll.kbW + 42, fx.roll.w - 42),
            y: Math.max(fx.roll.rulerH + 18, geo.y - 34),
            vx: 6,
            vy: -24,
            size: 11.5,
            color: '#f59e0b',
            life: 0.8
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 4, maxR: 22, color: '#ef4444', lineW: 2.2, life: 0.5 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var pitchInfo = roll._lastPitchInfo || null;
        var gridH = roll.gridBottom();
        var targetY = (roll.rulerH + gridH) * 0.5;
        if (ctx.cur) {
          var rel = ctx.cur.dur > 0 ? clamp((roll.playPos - ctx.cur.start) / ctx.cur.dur, 0, 1) : 0;
          var nInfo = pitchInfo ? pitchInfo[ctx.cur.id] : null;
          targetY = (roll.showPitch && nInfo) ? samplePitchY(roll, ctx.cur, rel, nInfo) : noteCenterY(roll, ctx.cur);
        } else if (ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var u = clamp((roll.playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
          var su = u * u * (3 - 2 * u);
          targetY = noteCenterY(roll, ctx.prev) + (noteCenterY(roll, ctx.next) - noteCenterY(roll, ctx.prev)) * su;
        } else if (ctx.next) {
          targetY = noteCenterY(roll, ctx.next);
        } else if (ctx.prev) {
          targetY = noteCenterY(roll, ctx.prev);
        }
        targetY = clamp(targetY, roll.rulerH + 24, gridH - 24);
        stepSmoothFollowerY(fx, roll, dt, jumped, targetY, 14);
        fx.modeState.ctx = ctx;
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        // 给经过侦探鉴定的音符打上红色铅笔调查框
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var alpha = it.active ? 0.9 : it.exitAlpha * 0.55;
          if (alpha <= 0) continue;
          c.save();
          c.globalAlpha = alpha;
          c.strokeStyle = '#ef4444';
          c.lineWidth = 1.5;
          c.setLineDash([4, 3]);
          roundRect(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, (T.noteRadius || 0) + 2);
          c.stroke();
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var lx = roll.beatX(roll.playPos);
        if (lx < roll.kbW - 64 || lx > roll.w + 64) return;
        var ly = ms.followY !== undefined ? ms.followY : (roll.rulerH + roll.gridBottom()) * 0.5;
        var R = clamp(roll.rowH * 2.55, 36, 56);
        var zoom = 1.85;

        // 1. 放大镜整体投影
        c.save();
        c.fillStyle = 'rgba(0, 0, 0, 0.24)';
        c.beginPath(); c.arc(lx + 4, ly + 6, R + 4, 0, Math.PI * 2); c.fill();
        c.restore();

        // 2. 镜片内部：真实 1.85x 实时光学放大卷帘画布！
        c.save();
        c.beginPath();
        c.arc(lx, ly, R, 0, Math.PI * 2);
        c.clip();

        c.fillStyle = A.isDark ? '#0e1424' : '#f4f9ff';
        c.fillRect(lx - R, ly - R, R * 2, R * 2);

        if (roll.base && roll.base.width > 0 && roll.base.height > 0) {
          var dpr = roll.base.width / Math.max(1, roll.w);
          var srcR = R / zoom;
          var sx0 = clamp(lx - srcR, 0, roll.w);
          var sy0 = clamp(ly - srcR, 0, roll.h);
          var sx1 = clamp(lx + srcR, 0, roll.w);
          var sy1 = clamp(ly + srcR, 0, roll.h);
          if (sx1 > sx0 + 1 && sy1 > sy0 + 1) {
            var dx0 = lx + (sx0 - lx) * zoom;
            var dy0 = ly + (sy0 - ly) * zoom;
            c.drawImage(
              roll.base,
              sx0 * dpr, sy0 * dpr, (sx1 - sx0) * dpr, (sy1 - sy0) * dpr,
              dx0, dy0, (sx1 - sx0) * zoom, (sy1 - sy0) * zoom
            );
          }
        }

        // 镜片内放大版刑侦准星（精确指示播放位置）
        c.strokeStyle = 'rgba(239, 68, 68, 0.72)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(lx, ly - R); c.lineTo(lx, ly - 7);
        c.moveTo(lx, ly + 7); c.lineTo(lx, ly + R);
        c.moveTo(lx - 12, ly); c.lineTo(lx - 5, ly);
        c.moveTo(lx + 5, ly); c.lineTo(lx + 12, ly);
        c.stroke();
        c.beginPath(); c.arc(lx, ly, 4.5, 0, Math.PI * 2); c.stroke();

        // 球面玻璃高光折射反光
        var gl = c.createRadialGradient(lx - R * 0.32, ly - R * 0.32, R * 0.08, lx, ly, R);
        gl.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
        gl.addColorStop(0.55, 'rgba(180, 235, 255, 0.06)');
        gl.addColorStop(1, 'rgba(0, 120, 180, 0.18)');
        c.fillStyle = gl;
        c.fillRect(lx - R, ly - R, R * 2, R * 2);
        c.fillStyle = 'rgba(255, 255, 255, 0.45)';
        c.beginPath();
        c.ellipse(lx - R * 0.35, ly - R * 0.38, R * 0.28, R * 0.11, -0.65, 0, Math.PI * 2);
        c.fill();
        c.restore();

        // 3. 镜柄（45°斜向下红木+黄铜箍）
        var ang = Math.PI * 0.26;
        var hx0 = lx + Math.cos(ang) * (R + 2);
        var hy0 = ly + Math.sin(ang) * (R + 2);
        var hLen = clamp(R * 0.92, 34, 52);
        c.save();
        c.translate(hx0, hy0);
        c.rotate(ang);
        // 黄铜连接颈
        c.fillStyle = '#d9a441';
        c.strokeStyle = '#4a310a';
        c.lineWidth = 1.4;
        roundRect(c, -2, -4.5, 11, 9, 2);
        c.fill(); c.stroke();
        // 红木侦探手柄
        var hg = c.createLinearGradient(0, -6.5, 0, 6.5);
        hg.addColorStop(0, '#9c4a24');
        hg.addColorStop(0.45, '#5c260e');
        hg.addColorStop(1, '#3b1506');
        c.fillStyle = hg;
        roundRect(c, 8, -6.2, hLen, 12.4, 5.5);
        c.fill(); c.stroke();
        // 手柄高光条
        c.fillStyle = 'rgba(255, 225, 180, 0.35)';
        c.fillRect(12, -4, hLen - 10, 2.2);
        c.restore();

        // 4. 黄铜镜框外环
        c.save();
        var rim = c.createLinearGradient(lx - R, ly - R, lx + R, ly + R);
        rim.addColorStop(0, '#fff0a6');
        rim.addColorStop(0.35, '#d9a441');
        rim.addColorStop(0.7, '#7c5312');
        rim.addColorStop(1, '#f3ca6b');
        c.strokeStyle = rim;
        c.lineWidth = 5.5;
        c.beginPath(); c.arc(lx, ly, R + 1.5, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#3d2506';
        c.lineWidth = 1.3;
        c.beginPath(); c.arc(lx, ly, R + 4.2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(lx, ly, R - 1.2, 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    },

    {
      id: 'clawCrane',
      showcase: false,
      usesPit: false,
      hidePlayhead: true,
      linger: 0.85,
      nameKey: 'eye.mode.clawCrane',
      fallbackName: '黑心娃娃机',
      eyeColor: { iris: '#ff4d8d', ring: '#7bf1ff', pupil: '#2b0820' },
      onEnterNote: function (fx, n, st) {
        st.hoistMax = 0;
        fx.modeState.releaseT = 0;
      },
      onControlPoint: function (fx, n, cp) {
        // 抓到控制点掉落扭蛋星星！
        fx.spawn({
          kind: 'star',
          x: cp.x, y: cp.y,
          vx: (Math.random() - 0.5) * 60,
          vy: -55 - Math.random() * 35,
          r: 4.5, rot: 0, vrot: 9,
          color: Math.random() < 0.5 ? '#ff4d8d' : '#00f5ff',
          life: 0.72
        });
      },
      onExitNote: function (fx, n, st, geo) {
        // 经典黑心娃娃机：快成功时突然松爪！
        fx.modeState.releaseT = 0.28;
        if (Math.random() < 0.55) {
          var pool = CLAW_LINES[langCode()] || CLAW_LINES.zh;
          fx.spawn({
            kind: 'glyph',
            text: pool[Math.floor(Math.random() * pool.length)],
            x: clamp(geo.x + geo.w * 0.5, fx.roll.kbW + 36, fx.roll.w - 36),
            y: Math.max(fx.roll.rulerH + 18, geo.y - 24),
            vx: (Math.random() - 0.5) * 20,
            vy: -36,
            size: 12,
            color: '#ff4d8d',
            life: 0.75
          });
        }
        fx.spawn({ kind: 'spark', x: geo.x + geo.w, y: geo.y - 6, vx: 32, vy: -30, r: 2.5, color: '#ffe042', life: 0.32 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var gridH = roll.gridBottom();
        var targetY = roll.rulerH + 34;
        if (ctx.cur) {
          var rel = ctx.cur.dur > 0 ? clamp((roll.playPos - ctx.cur.start) / ctx.cur.dur, 0, 1) : 0;
          var lift = clamp(rel * 20, 0, 20);
          targetY = Math.max(roll.rulerH + 18, noteTopY(roll, ctx.cur) - lift);
        } else if (ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var u = clamp((roll.playPos - g0) / Math.max(1e-4, g1 - g0), 0, 1);
          var y0 = Math.max(roll.rulerH + 18, noteTopY(roll, ctx.prev) - 18);
          var y1 = noteTopY(roll, ctx.next);
          targetY = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * 14;
        } else if (ctx.next) {
          targetY = Math.max(roll.rulerH + 18, noteTopY(roll, ctx.next) - 10);
        } else if (ctx.prev) {
          targetY = Math.max(roll.rulerH + 18, noteTopY(roll, ctx.prev) - 16);
        }
        targetY = clamp(targetY, roll.rulerH + 16, gridH - 16);
        stepSmoothFollowerY(fx, roll, dt, jumped, targetY, 16);
        ms.ctx = ctx;
        if (ms.releaseT > 0) ms.releaseT = Math.max(0, ms.releaseT - dt);
      },
      drawCustomPlayhead: function (fx, c, roll, T, px) {
        // 标尺上方的娃娃机机械滑轨与发光天车小车（取代默认播放指针！）
        var railY = Math.min(roll.rulerH - 2, 18);
        c.save();
        // 顶轨阴影槽
        c.fillStyle = 'rgba(20, 14, 34, 0.32)';
        c.fillRect(roll.kbW, 0, roll.w - roll.kbW, 4);
        // 机械滑车本体
        var tw = 26, th = Math.max(12, railY - 1);
        var tg = c.createLinearGradient(px - tw / 2, 0, px + tw / 2, 0);
        tg.addColorStop(0, '#ff4d8d');
        tg.addColorStop(0.5, '#ff85b3');
        tg.addColorStop(1, '#d81b60');
        c.fillStyle = tg;
        c.strokeStyle = '#1f102b';
        c.lineWidth = 1.4;
        roundRect(c, px - tw / 2, 1, tw, th, 4);
        c.fill(); c.stroke();
        // 跑马灯 LED
        var blink = Math.floor(fx.elapsed * 10) % 2 === 0;
        c.fillStyle = blink ? '#7bf1ff' : '#ffe042';
        c.beginPath(); c.arc(px - 6, 1 + th * 0.5, 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = blink ? '#ffe042' : '#7bf1ff';
        c.beginPath(); c.arc(px + 6, 1 + th * 0.5, 2.2, 0, Math.PI * 2); c.fill();
        // 卷绳轮轴
        c.fillStyle = '#e2e8f0';
        c.fillRect(px - 2.5, th - 1, 5, 4);
        c.restore();
        return true;
      },
      renderUnder: function (fx, c, roll, T, A, items) {
        // 擦除被抓起或刚松爪下落的音符原位
        for (var i = 0; i < items.length; i++) {
          var g = items[i].geo;
          roll._paintGridPatch(c, g.x - 2, g.y - 2, g.w + 4, g.h + 4, T);
        }
      },
      renderOver: function (fx, c, roll, T, A, items) {
        var ms = fx.modeState;
        var px = roll.beatX(roll.playPos);
        var clawY = ms.followY !== undefined ? ms.followY : (roll.rulerH + 40);

        // 1. 绘制被抓起摇晃 / 松爪砸落的音符
        for (var i = 0; i < items.length; i++) {
          var it = items[i], g = it.geo;
          var lift = 0, sway = 0;
          if (it.active) {
            lift = clamp(it.rel * 20, 0, 20);
            it.st.hoistMax = lift;
            sway = Math.sin(fx.elapsed * 16 + it.st.seed * 6) * 0.085;
          } else {
            var startLift = it.st.hoistMax || 16;
            var fallFrac = clamp(1 - it.exitAge / 0.22, 0, 1);
            var dropLift = startLift * fallFrac * fallFrac;
            var landAge = Math.max(0, it.exitAge - 0.22);
            var bounce = Math.abs(Math.sin(landAge * 16)) * Math.exp(-landAge * 6) * 9 * (fallFrac > 0 ? 0 : 1);
            lift = dropLift + bounce;
            sway = fallFrac > 0 ? Math.sin(it.exitAge * 26) * 0.14 * fallFrac : 0;
          }
          var cx = g.x + g.w / 2;
          var cy = g.y + g.h / 2 - lift;
          c.save();
          c.translate(cx, cy);
          c.rotate(sway);
          drawStyledNote(c, roll, it.n, -g.w / 2, -g.h / 2, g.w, g.h, T);
          if (it.active) {
            // 慌张汗滴
            c.fillStyle = '#38bdf8';
            c.beginPath();
            c.arc(g.w / 2 + 4, -g.h / 2 + ((fx.elapsed * 22) % 8), 2, 0, Math.PI * 2);
            c.fill();
          }
          c.restore();
        }

        // 2. 绘制钢丝绳与三爪金属抓手
        if (px >= roll.kbW - 32 && px <= roll.w + 32) {
          var isGrabbing = !!(ms.ctx && ms.ctx.cur);
          var spread = isGrabbing ? 0.32 : (ms.releaseT > 0 ? 0.92 : 0.65);
          var headY = Math.max(roll.rulerH + 6, clawY - 12);

          c.save();
          // 金属钢缆
          c.strokeStyle = A.isDark ? '#cbd5e1' : '#475569';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(px, roll.rulerH);
          c.lineTo(px, headY);
          c.stroke();

          // 抓手关节座
          c.translate(px, headY);
          var mg = c.createLinearGradient(-8, -5, 8, 5);
          mg.addColorStop(0, '#f8fafc');
          mg.addColorStop(0.5, '#94a3b8');
          mg.addColorStop(1, '#475569');
          c.fillStyle = mg;
          c.strokeStyle = '#0f172a';
          c.lineWidth = 1.4;
          roundRect(c, -7, -5, 14, 9, 3);
          c.fill(); c.stroke();

          // 左右机械钢爪
          for (var side = -1; side <= 1; side += 2) {
            c.save();
            c.translate(side * 4.5, 3);
            c.rotate(-side * spread);
            c.strokeStyle = '#0f172a';
            c.lineWidth = 4.2;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(side * 7, 7);
            c.lineTo(side * 2, 15);
            c.stroke();
            c.strokeStyle = '#e2e8f0';
            c.lineWidth = 2;
            c.stroke();
            c.restore();
          }
          // 中央红宝石状态灯（抓紧变红，松开变青）
          c.fillStyle = isGrabbing ? '#ff2d55' : '#00f5ff';
          c.beginPath(); c.arc(0, -0.5, 2.3, 0, Math.PI * 2); c.fill();
          c.restore();
        }
      }
    },

    {
      id: 'circleClicker',
      showcase: false,
      usesPit: true,
      hidePlayhead: true,
      linger: 0.55,
      nameKey: 'eye.mode.circleClicker',
      fallbackName: '缩圈戳泡泡',
      eyeColor: { iris: '#ff66aa', ring: '#ffffff', pupil: '#3b0724' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        if (!ms.missCache) ms.missCache = Object.create(null);
        var noodles = ms.noodles || getRhythmNoodles(fx.roll);
        var nd = noodles.byNoteId[n.id];
        var hitX = geo.x + 2, hitY = geo.y + geo.h * 0.5;
        // 同一根延音/拆词面条的后续音段：不重复生成新击打圆圈与 300，改为滑条拐点脉冲
        if (nd && n.id !== nd.head.id) {
          if (nd.isLong && !isNoteG2pMiss(fx.roll, nd.head, ms.missCache)) {
            recordRhythmCp(fx);
            fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 4, maxR: 18, color: '#ffe042', lineW: 2, life: 0.30 });
            fx.spawn({ kind: 'glyph', text: '+10', x: clamp(hitX, fx.roll.kbW + 20, fx.roll.w - 20), y: Math.max(fx.roll.rulerH + 14, hitY - 12), vx: 0, vy: -24, size: 10.5, color: '#ffe042', life: 0.44 });
          }
          return;
        }
        if (isNoteG2pMiss(fx.roll, n, ms.missCache)) {
          st.missed = true;
          recordRhythmMiss(fx);
          fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 8, maxR: 30, color: '#ef4444', lineW: 2.8, life: 0.38 });
          fx.spawn({
            kind: 'glyph',
            text: '✗ MISS',
            x: clamp(hitX, fx.roll.kbW + 30, fx.roll.w - 30),
            y: Math.max(fx.roll.rulerH + 16, hitY - 18),
            vx: 0,
            vy: -24,
            size: 14,
            color: '#f87171',
            life: 0.62
          });
          return;
        }
        recordRhythmHit(fx);
        var palette = ['#ff5ca8', '#38d9ff', '#ffbe2e', '#4ce886'];
        var col = palette[Math.floor((ms.combo - 1) / 4) % palette.length];
        fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 12, maxR: 38, color: '#ffffff', lineW: 3, life: 0.36 });
        fx.spawn({ kind: 'ring', x: hitX, y: hitY, r: 10, maxR: 30, color: col, lineW: 2.2, life: 0.42 });
        fx.spawn({
          kind: 'glyph',
          text: '300',
          x: clamp(hitX, fx.roll.kbW + 24, fx.roll.w - 24),
          y: Math.max(fx.roll.rulerH + 16, hitY - 18),
          vx: 0,
          vy: -30,
          size: 14,
          color: '#38d9ff',
          life: 0.55
        });
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
          fx.spawn({
            kind: 'spark',
            x: hitX, y: hitY,
            vx: Math.cos(a) * (45 + Math.random() * 45),
            vy: Math.sin(a) * (45 + Math.random() * 45),
            r: 2.2,
            color: i % 2 ? col : '#ffffff',
            life: 0.38
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        // 滑条中途判定点（Tick）
        recordRhythmCp(fx);
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 3, maxR: 16, color: '#ffe042', lineW: 2, life: 0.32 });
        fx.spawn({ kind: 'glyph', text: '+10', x: cp.x, y: cp.y - 10, vx: 0, vy: -26, size: 10.5, color: '#ffe042', life: 0.48 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) {
          ms.combo = 0;
          ms.spinKey = null;
          ms.spinClearKey = null;
          ms.spinAngle = 0;
          ms.spinBonusCount = 0;
          fx.trail = [];
        }
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var noodles = getRhythmNoodles(roll);
        ms.noodles = noodles;
        var gridH = roll.gridBottom();
        var viewW = Math.max(1, roll.w - roll.kbW);
        var viewH = Math.max(1, gridH - roll.rulerH);
        var midX = roll.kbW + viewW * 0.5;
        var midY = roll.rulerH + viewH * 0.5;
        var discR = clamp(Math.min(viewW, viewH) * 0.43, 54, 195);
        var orbitR = discR * 0.44;

        var curX = roll.beatX(roll.playPos);
        var curY = midY;
        var directPos = false;
        ms.spinner = null;
        ms.warn = null;
        ms.cursorCustomX = null;

        if (ctx.cur) {
          var curNd = noodles.byNoteId[ctx.cur.id];
          if (curNd && curNd.isLong) {
            curY = sampleNoodleY(roll, curNd, roll.playPos);
            directPos = true;
          } else {
            curY = noteCenterY(roll, ctx.cur);
          }
        } else if (ctx.prev && ctx.next) {
          var g0 = ctx.prev.start + ctx.prev.dur, g1 = ctx.next.start;
          var gapDur = g1 - g0;
          var rem = g1 - roll.playPos;
          var y0 = noteCenterY(roll, ctx.prev);
          var y1 = noteCenterY(roll, ctx.next);
          var warnBeats = gapDur >= 2.6 ? clamp(gapDur * 0.35, 1.15, 1.85) : 0;

          if (warnBeats > 0 && rem > 0 && rem <= warnBeats) {
            ms.warn = { rem: rem, total: warnBeats, frac: clamp(1 - rem / warnBeats, 0, 1) };
          }

          if (gapDur >= 3.2) {
            // 较大乐句间奏：把钢琴窗当大转盘旋转！
            var spinStart = g0 + 0.28;
            var spinEnd = g1 - warnBeats - 0.12;
            var spinKey = String(ctx.prev.id) + '->' + String(ctx.next.id);
            if (roll.playPos >= spinStart && roll.playPos <= spinEnd) {
              var su = clamp((roll.playPos - spinStart) / Math.max(1e-4, spinEnd - spinStart), 0, 1);
              if (ms.spinKey !== spinKey) {
                ms.spinKey = spinKey;
                ms.spinAngle = 0;
                ms.cursorOrbit = -Math.PI * 0.5;
                ms.spinBonusCount = 0;
                ms.spinClearKey = null;
              }
              var rpmRate = 160 + 280 * Math.pow(su, 0.72);
              var omega = (rpmRate / 60) * Math.PI * 2;
              if (roll.isPlaying) {
                ms.spinAngle = (ms.spinAngle || 0) + omega * 0.42 * dt;
                ms.cursorOrbit = (ms.cursorOrbit || 0) + omega * dt;
                var revs = Math.floor(ms.cursorOrbit / (Math.PI * 2));
                if (su > 0.42 && revs > (ms.spinBonusCount || 0)) {
                  ms.spinBonusCount = revs;
                  fx.spawn({
                    kind: 'glyph',
                    text: '+1000',
                    x: midX + (Math.random() - 0.5) * 44,
                    y: midY - discR * 0.34,
                    vx: 0,
                    vy: -36,
                    size: 13.5,
                    color: '#ffe042',
                    life: 0.62
                  });
                  fx.spawn({ kind: 'ring', x: midX, y: midY, r: discR * 0.28, maxR: discR * 0.95, color: '#ff5ca8', lineW: 2.2, life: 0.42 });
                }
              }
              curX = midX + Math.cos(ms.cursorOrbit || 0) * orbitR;
              curY = midY + Math.sin(ms.cursorOrbit || 0) * orbitR;
              ms.cursorCustomX = curX;
              ms.spinLastX = curX;
              ms.spinLastY = curY;
              directPos = true;
              var env = Math.min(clamp(su / 0.12, 0, 1), clamp((1 - su) / 0.10, 0, 1));
              ms.spinner = {
                active: true,
                su: su,
                env: env,
                rpm: Math.round(rpmRate),
                angle: ms.spinAngle || 0,
                discR: discR,
                cx: midX,
                cy: midY
              };
            } else if (roll.playPos < spinStart) {
              // 从前一句尾音平滑滑入中央转盘轨道
              var eu = clamp((roll.playPos - g0) / Math.max(1e-4, spinStart - g0), 0, 1);
              var esu = eu * eu * (3 - 2 * eu);
              var sxIn = roll.beatX(g0);
              curX = sxIn + (midX - sxIn) * esu;
              curY = y0 + ((midY - orbitR) - y0) * esu;
              ms.cursorCustomX = curX;
              directPos = true;
            } else {
              // 大转盘收尾结算爆发，随后滑向下一乐句首音符
              if (ms.spinKey === spinKey && ms.spinClearKey !== spinKey) {
                ms.spinClearKey = spinKey;
                fx.spawn({ kind: 'ring', x: midX, y: midY, r: discR * 0.35, maxR: discR * 1.28, color: '#ffe042', lineW: 4, life: 0.55 });
                fx.spawn({ kind: 'ring', x: midX, y: midY, r: discR * 0.2, maxR: discR * 1.05, color: '#38d9ff', lineW: 2.6, life: 0.48 });
                fx.spawn({ kind: 'glyph', text: 'CLEAR!', x: midX, y: midY - 12, vx: 0, vy: -26, size: 22, color: '#ffe042', life: 0.85 });
                for (var bi = 0; bi < 14; bi++) {
                  var ba = (bi / 14) * Math.PI * 2;
                  var bsp = 95 + Math.random() * 85;
                  fx.spawn({
                    kind: 'spark',
                    x: midX, y: midY,
                    vx: Math.cos(ba) * bsp,
                    vy: Math.sin(ba) * bsp,
                    r: 2.6 + Math.random() * 1.5,
                    color: bi % 3 === 0 ? '#ffe042' : (bi % 3 === 1 ? '#ff5ca8' : '#38d9ff'),
                    life: 0.58
                  });
                }
              }
              var xu = clamp((roll.playPos - spinEnd) / Math.max(1e-4, g1 - spinEnd), 0, 1);
              var xsu = xu * xu * (3 - 2 * xu);
              var sxOut = ms.spinLastX !== undefined ? ms.spinLastX : midX;
              var syOut = ms.spinLastY !== undefined ? ms.spinLastY : midY;
              var txNext = roll.beatX(g1);
              curX = sxOut + (txNext - sxOut) * xsu;
              curY = syOut + (y1 - syOut) * xsu;
              ms.cursorCustomX = curX;
              directPos = true;
            }
          } else {
            var u = clamp((roll.playPos - g0) / Math.max(1e-4, gapDur), 0, 1);
            var su2 = u * u * (3 - 2 * u);
            // 轻微弧线甩动光标，模拟手绘滑移手感
            var bow = Math.sin(u * Math.PI) * clamp((y0 - y1) * 0.14, -22, 22);
            curY = y0 + (y1 - y0) * su2 + bow;
          }
        } else if (ctx.next) {
          curY = noteCenterY(roll, ctx.next);
          if (ctx.next.start >= 3.2) {
            var remIntro = ctx.next.start - roll.playPos;
            if (remIntro > 0 && remIntro <= 1.6) {
              ms.warn = { rem: remIntro, total: 1.6, frac: clamp(1 - remIntro / 1.6, 0, 1) };
            }
          }
        } else if (ctx.prev) {
          curY = noteCenterY(roll, ctx.prev);
        }

        curY = clamp(curY, roll.rulerH + 14, gridH - 14);
        if (directPos) {
          ms.followY = curY;
          ms.cursorY = curY;
        } else {
          stepSmoothFollowerY(fx, roll, dt, jumped, curY, 22);
          ms.cursorY = ms.followY;
        }
        ms.ctx = ctx;
        ms.comboPop = Math.max(0, (ms.comboPop || 0) - dt * 5);

        // 记录丝滑的光标拖尾
        if (curX >= roll.kbW - 20 && curX <= roll.w + 20) {
          var lastPt = fx.trail.length ? fx.trail[fx.trail.length - 1] : null;
          if (!lastPt || Math.hypot(curX - lastPt.x, ms.cursorY - lastPt.y) > 2) {
            fx.trail.push({ x: curX, y: ms.cursorY, t: fx.elapsed });
            if (fx.trail.length > 42) fx.trail.shift();
          }
        }
        while (fx.trail.length && (fx.elapsed - fx.trail[0].t > 0.34)) fx.trail.shift();
        stepRhythmResults(fx, roll, dt, jumped, 'circleClicker', { totalCount: noodles.list.length });
      },
      renderUnder: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var notes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
        var pitchInfo = roll._lastPitchInfo || null;
        var playPos = roll.playPos;
        var leadBeats = 1.75;
        var circleR = clamp(roll.rowH * 0.72, 11, 17);
        var palette = ['#ff5ca8', '#38d9ff', '#ffbe2e', '#4ce886'];

        // 0. 间奏大转盘：把钢琴窗本身卷进中央霓虹唱盘疯狂旋转！
        if (ms && ms.spinner && ms.spinner.active) {
          var sp = ms.spinner;
          var env = sp.env;
          var r = sp.discR;
          var gridH = roll.gridBottom();

          // 舞台压暗背幕，突出旋转钢琴窗圆盘
          c.save();
          c.fillStyle = 'rgba(6, 10, 24, ' + ((A.isDark ? 0.54 : 0.36) * env).toFixed(3) + ')';
          c.fillRect(roll.kbW, roll.rulerH, roll.w - roll.kbW, gridH - roll.rulerH);
          c.restore();

          // 旋转的钢琴窗大圆盘本体
          c.save();
          c.globalAlpha = env;
          c.beginPath();
          c.arc(sp.cx, sp.cy, r, 0, Math.PI * 2);
          c.clip();

          c.fillStyle = A.isDark ? '#0c1226' : '#ecf6ff';
          c.fillRect(sp.cx - r, sp.cy - r, r * 2, r * 2);

          c.save();
          c.translate(sp.cx, sp.cy);
          c.rotate(sp.angle);
          if (roll.base && roll.base.width > 0 && roll.base.height > 0) {
            var dpr = roll.base.width / Math.max(1, roll.w);
            var sx0 = clamp(sp.cx - r, 0, roll.w);
            var sy0 = clamp(sp.cy - r, 0, roll.h);
            var sx1 = clamp(sp.cx + r, 0, roll.w);
            var sy1 = clamp(sp.cy + r, 0, roll.h);
            if (sx1 > sx0 + 1 && sy1 > sy0 + 1) {
              c.drawImage(
                roll.base,
                sx0 * dpr, sy0 * dpr, (sx1 - sx0) * dpr, (sy1 - sy0) * dpr,
                sx0 - sp.cx, sy0 - sp.cy, sx1 - sx0, sy1 - sy0
              );
            }
          }
          // 旋转光束辐条与唱盘同心霓虹纹
          for (var si = 0; si < 8; si++) {
            var sa = (si / 8) * Math.PI * 2;
            c.fillStyle = si % 2 ? 'rgba(255, 92, 168, 0.14)' : 'rgba(56, 217, 255, 0.14)';
            c.beginPath();
            c.moveTo(0, 0);
            c.arc(0, 0, r, sa, sa + Math.PI / 16);
            c.closePath();
            c.fill();
          }
          c.strokeStyle = 'rgba(255, 255, 255, 0.24)';
          c.lineWidth = 1.2;
          for (var gi = 1; gi <= 3; gi++) {
            c.beginPath(); c.arc(0, 0, r * (gi * 0.28), 0, Math.PI * 2); c.stroke();
          }
          c.restore();
          c.restore();

          // 转盘外圈：充能进度弧 + 渐缩倒计时外环 + 中心轴与实时 RPM
          c.save();
          c.globalAlpha = env;
          // 渐缩外圈（随间奏进度从 1.38r 缩至中心）
          var appSpinR = r * (1.36 - sp.su * 1.12);
          c.strokeStyle = 'rgba(255, 224, 66, 0.85)';
          c.lineWidth = 2.6;
          c.beginPath(); c.arc(sp.cx, sp.cy, Math.max(12, appSpinR), 0, Math.PI * 2); c.stroke();

          // 圆盘金属霓虹底框
          c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          c.lineWidth = 5;
          c.beginPath(); c.arc(sp.cx, sp.cy, r, 0, Math.PI * 2); c.stroke();

          // 充能发光进度弧（满槽后闪耀金粉光晕）
          var chargeCol = sp.su > 0.72 ? '#ffe042' : (sp.su > 0.38 ? '#ff5ca8' : '#38d9ff');
          c.strokeStyle = chargeCol;
          c.lineWidth = 5.5;
          c.lineCap = 'round';
          c.shadowColor = chargeCol;
          c.shadowBlur = A.isPixel ? 0 : 12;
          c.beginPath();
          c.arc(sp.cx, sp.cy, r, -Math.PI * 0.5, -Math.PI * 0.5 + sp.su * Math.PI * 2);
          c.stroke();
          c.shadowBlur = 0;

          // 中央旋转靶心轴
          c.save();
          c.translate(sp.cx, sp.cy);
          c.rotate(-sp.angle * 1.6);
          c.fillStyle = '#ffffff';
          c.strokeStyle = '#ff5ca8';
          c.lineWidth = 3;
          c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill(); c.stroke();
          c.strokeStyle = '#38d9ff';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(-8, 0); c.lineTo(8, 0);
          c.moveTo(0, -8); c.lineTo(0, 8);
          c.stroke();
          c.restore();

          // 实时转速 RPM 提示
          drawTextHalo(c, sp.rpm + ' RPM', sp.cx, sp.cy + r * 0.56, 15, '#ffe042', 'rgba(8, 10, 22, 0.9)', 3.4, 'center', 'Impact, Tahoma, sans-serif');
          drawTextHalo(c, 'SPIN!', sp.cx, sp.cy - r * 0.56, 16, '#ffffff', '#ff4d94', 3.4, 'center', 'Impact, Tahoma, sans-serif');
          c.restore();
        }

        // 收集即将到来及正在滑行的面条（延音与拆词已合并为一整根）
        var noodles = (ms && ms.noodles) || getRhythmNoodles(roll);
        var upcoming = [];
        for (var i = 0; i < noodles.list.length; i++) {
          var nd = noodles.list[i];
          if (!nd) continue;
          if (nd.end < playPos - 0.05 || nd.start > playPos + leadBeats) continue;
          var hx = roll.beatX(nd.start);
          var tw = Math.max(6, nd.dur * roll.pxBeat);
          if (hx > roll.w + 50 || hx + tw < roll.kbW - 50) continue;
          var tailNote = nd.notes[nd.notes.length - 1] || nd.head;
          upcoming.push({
            nd: nd,
            idx: nd.index,
            hx: hx,
            hy: noteCenterY(roll, nd.head),
            tx: roll.beatX(nd.end),
            ty: noteCenterY(roll, tailNote),
            w: tw
          });
        }
        upcoming.sort(function (a, b) { return a.nd.start - b.nd.start; });

        // 1. 相邻待击圆圈之间的虚点引导线（Follow Points）
        c.save();
        for (var f = 0; f + 1 < upcoming.length; f++) {
          var a = upcoming[f], b = upcoming[f + 1];
          if (b.nd.start - a.nd.end > 1.5) continue;
          var ax = a.nd.isLong ? a.tx : a.hx, ay = a.nd.isLong ? a.ty : a.hy;
          var dx = b.hx - ax, dy = b.hy - ay;
          var d = Math.hypot(dx, dy);
          if (d < 18 || d > 280) continue;
          var dots = Math.min(8, Math.max(2, Math.floor(d / 20)));
          var vis = clamp(1 - (b.nd.start - playPos) / leadBeats, 0.15, 0.72);
          c.fillStyle = colorAlpha('#ffffff', vis * 0.7);
          for (var di = 1; di < dots; di++) {
            var u = di / dots;
            c.beginPath();
            c.arc(ax + dx * u, ay + dy * u, 2, 0, Math.PI * 2);
            c.fill();
          }
        }
        c.restore();

        // 2. 倒序绘制滑条与缩圈（越早需要击打的圆圈画在越上层）
        for (var k = upcoming.length - 1; k >= 0; k--) {
          var uItem = upcoming[k];
          var noodle = uItem.nd;
          var col = palette[Math.floor(uItem.idx / 4) % palette.length];
          var num = (uItem.idx % 4) + 1;
          var dtStart = noodle.start - playPos;
          var isSlider = noodle.isLong;
          var fadeIn = dtStart > 0 ? clamp(1 - (dtStart / leadBeats) * 0.72, 0.28, 1) : 1;

          c.save();
          c.globalAlpha = fadeIn;

          // 长音符/延音拆词合体面条：整根平滑滑条轨道，外径与首圆圈严丝合缝对齐
          if (isSlider) {
            var pts = sampleNoodleCurve(roll, noodle);
            if (pts.length > 1) {
              c.lineCap = 'round';
              c.lineJoin = 'round';
              c.strokeStyle = '#ffffff';
              c.lineWidth = circleR * 2 + 2.6;
              c.beginPath();
              for (var s = 0; s < pts.length; s++) { if (!s) c.moveTo(pts[s].x, pts[s].y); else c.lineTo(pts[s].x, pts[s].y); }
              c.stroke();
              c.strokeStyle = colorAlpha(col, A.isDark ? 0.56 : 0.44);
              c.lineWidth = Math.max(4, circleR * 2 - 2.6);
              c.stroke();
              // 滑条尾端圆点
              var tail = pts[pts.length - 1];
              c.fillStyle = '#ffffff';
              c.beginPath(); c.arc(tail.x, tail.y, 3.2, 0, Math.PI * 2); c.fill();
            }
          }

          // 音符头部待击圆圈 + 缩圈环（未击打前显示）
          if (dtStart >= -0.04) {
            var approachFrac = clamp(dtStart / leadBeats, 0, 1);
            var appR = circleR * (1 + approachFrac * 2.15);

            // 渐缩外圈（Approach Circle）
            c.strokeStyle = col;
            c.lineWidth = 2.4;
            c.beginPath();
            c.arc(uItem.hx, uItem.hy, appR, 0, Math.PI * 2);
            c.stroke();

            // 击打泡泡本体（亮白外圈 + 彩底 + 序号）
            c.fillStyle = colorAlpha(col, 0.88);
            c.beginPath(); c.arc(uItem.hx, uItem.hy, circleR, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#ffffff';
            c.lineWidth = 2.6;
            c.stroke();
            // 顶部高光月牙
            c.fillStyle = 'rgba(255,255,255,0.28)';
            c.beginPath(); c.arc(uItem.hx, uItem.hy - circleR * 0.25, circleR * 0.62, Math.PI, 0); c.fill();

            drawTextHalo(c, String(num), uItem.hx, uItem.hy + 0.5, Math.round(circleR * 0.95), '#ffffff', 'rgba(0,0,0,0.45)', 2.2, 'center', 'Tahoma, sans-serif');
          }
          c.restore();
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var cx = (ms.cursorCustomX !== null && ms.cursorCustomX !== undefined) ? ms.cursorCustomX : roll.beatX(roll.playPos);
        var cy = ms.cursorY !== undefined ? ms.cursorY : (roll.rulerH + roll.gridBottom()) * 0.5;
        var circleR = clamp(roll.rowH * 0.72, 11, 17);

        // 0. 即将重返乐句时：钢琴窗四个角闪烁向内的预警双箭头！
        if (ms.warn) {
          var gridH = roll.gridBottom();
          var left = roll.kbW, right = roll.w, top = roll.rulerH, bot = gridH;
          var pad = clamp(Math.min(right - left, bot - top) * 0.085, 26, 48);
          var phase = roll.isPlaying ? ((ms.warn.rem * 2) % 1) : ((fx.elapsed * 2.2) % 1);
          var blink = 0.20 + 0.80 * Math.pow(Math.sin(phase * Math.PI), 0.72);
          var slide = (1 - phase) * 11;
          var corners = [
            { x: left + pad, y: top + pad, ang: Math.PI * 0.25 },
            { x: right - pad, y: top + pad, ang: Math.PI * 0.75 },
            { x: left + pad, y: bot - pad, ang: -Math.PI * 0.25 },
            { x: right - pad, y: bot - pad, ang: -Math.PI * 0.75 }
          ];
          c.save();
          for (var ci = 0; ci < corners.length; ci++) {
            var cn = corners[ci];
            c.save();
            c.translate(cn.x, cn.y);
            c.rotate(cn.ang);
            c.translate(slide, 0);
            c.globalAlpha = blink;
            // 绘制两枚紧跟向内闪烁的厚实箭头（>>）
            for (var ch = 0; ch < 2; ch++) {
              var ox = ch * 13 - 6;
              var chAlpha = ch === 1 ? 1 : 0.65;
              c.save();
              c.globalAlpha = blink * chAlpha;
              c.lineJoin = 'round';
              c.lineCap = 'round';
              // 外层暗色描边 + 霓虹辉光，确保亮暗主题都醒目
              c.strokeStyle = A.isDark ? 'rgba(10, 12, 26, 0.88)' : 'rgba(20, 24, 38, 0.68)';
              c.lineWidth = 8.5;
              c.beginPath();
              c.moveTo(ox - 9, -11);
              c.lineTo(ox + 4, 0);
              c.lineTo(ox - 9, 11);
              c.stroke();

              c.shadowColor = '#ff5ca8';
              c.shadowBlur = A.isPixel ? 0 : 12;
              c.strokeStyle = ch === 1 ? '#ffe042' : '#ff5ca8';
              c.lineWidth = 4.6;
              c.stroke();

              c.shadowBlur = 0;
              c.strokeStyle = '#ffffff';
              c.lineWidth = 1.6;
              c.stroke();
              c.restore();
            }
            c.restore();
          }
          c.restore();
        }

        // 1. 丝滑光标霓虹拖尾
        if (fx.trail.length > 1) {
          c.save();
          c.lineCap = 'round';
          for (var i = 1; i < fx.trail.length; i++) {
            var p0 = fx.trail[i - 1], p1 = fx.trail[i];
            if (Math.abs(p1.x - p0.x) > 120) continue;
            var u = i / fx.trail.length;
            var age = clamp(1 - (fx.elapsed - p1.t) / 0.32, 0, 1);
            c.globalAlpha = u * age * 0.65;
            c.strokeStyle = '#ff66aa';
            c.lineWidth = 2 + u * 8;
            c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
          }
          c.restore();
        }

        // 2. 正在滑条（含延音/拆词合体面条）上时画滑球随动外圈（Follow Circle）
        if (ms.ctx && ms.ctx.cur && cx >= roll.kbW - 24 && cx <= roll.w + 24) {
          var curNoodle = ms.noodles && ms.noodles.byNoteId[ms.ctx.cur.id];
          if (curNoodle ? curNoodle.isLong : isLongRhythmNote(ms.ctx.cur)) {
            c.save();
            var pulse = 1 + 0.08 * Math.sin(fx.elapsed * 18);
            c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            c.lineWidth = 2;
            c.beginPath(); c.arc(cx, cy, circleR * 1.55 * pulse, 0, Math.PI * 2); c.stroke();
            c.fillStyle = 'rgba(255, 255, 255, 0.25)';
            c.fill();
            c.strokeStyle = '#ffe042';
            c.lineWidth = 2.6;
            c.beginPath(); c.arc(cx, cy, circleR * 0.82, 0, Math.PI * 2); c.stroke();
            c.restore();
          }
        }

        // 3. 发光游戏光标本体（取代播放指针）
        if (cx >= roll.kbW - 24 && cx <= roll.w + 24) {
          c.save();
          c.shadowColor = '#ff5ca8';
          c.shadowBlur = A.isPixel ? 0 : 12;
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#ff5ca8';
          c.lineWidth = 2.8;
          c.stroke();
          c.shadowBlur = 0;
          c.fillStyle = '#ffe042';
          c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
          c.restore();
        }

        // 4. 左下角连击数（12x）
        if ((ms.combo || 0) > 0) {
          var pop = 1 + (ms.comboPop || 0) * 0.24;
          c.save();
          c.translate(roll.kbW + 18, roll.gridBottom() - 24);
          c.scale(pop, pop);
          drawTextHalo(c, ms.combo + 'x', 0, 0, 26, '#ffffff', '#ff4d94', 4.2, 'left', 'Impact, Tahoma, sans-serif');
          c.restore();
        }
        drawRhythmResults(fx, c, roll, T, A);
      }
    },

    {
      id: 'drumParade',
      showcase: false,
      usesPit: false,
      linger: 0.65,
      nameKey: 'eye.mode.drumParade',
      fallbackName: '咚咔祭典鼓',
      eyeColor: { iris: '#ff4b3e', ring: '#ffe042', pupil: '#2b0d0a' },
      onEnterNote: function (fx, n, st, geo) {
        var ms = fx.modeState;
        if (!ms.missCache) ms.missCache = Object.create(null);
        var cx = geo.x + 2, cy = geo.y + geo.h * 0.5;
        if (isNoteG2pMiss(fx.roll, n, ms.missCache)) {
          st.missed = true;
          recordRhythmMiss(fx);
          ms.fever = Math.max(0, (ms.fever || 0) - 0.14);
          var badTxt = langCode() === 'en' ? 'MISS!' : '不可!';
          fx.spawn({
            kind: 'glyph',
            text: badTxt,
            x: clamp(cx, fx.roll.kbW + 24, fx.roll.w - 24),
            y: Math.max(fx.roll.rulerH + 16, cy - 22),
            vx: 0,
            vy: -24,
            size: 14,
            color: '#f87171',
            life: 0.6
          });
          fx.spawn({ kind: 'ring', x: cx, y: cy, r: 6, maxR: 26, color: '#ef4444', lineW: 2.6, life: 0.34 });
          return;
        }
        recordRhythmHit(fx);
        ms.fever = Math.min(1, (ms.fever || 0) + 0.08);
        ms.hitFlash = 1;
        if (!ms.flyers) ms.flyers = [];
        var isRed = ((n.pitch || 0) % 2 === 0);
        // 击中后的小鼓面欢快地朝右上角祭典槽抛物线飞去！
        ms.flyers.push({
          x: cx,
          y: cy,
          tx: fx.roll.w - 42,
          ty: fx.roll.rulerH + 18,
          t: 0,
          dur: 0.55,
          isRed: isRed,
          isLong: isLongRhythmNote(n)
        });
        if (ms.flyers.length > 24) ms.flyers.shift();

        var judgeTxt = langCode() === 'en' ? 'GREAT!' : '良!';
        fx.spawn({
          kind: 'glyph',
          text: judgeTxt,
          x: clamp(cx, fx.roll.kbW + 24, fx.roll.w - 24),
          y: Math.max(fx.roll.rulerH + 16, cy - 22),
          vx: 0,
          vy: -32,
          size: 14,
          color: '#ffe042',
          life: 0.52
        });
        fx.spawn({ kind: 'ring', x: cx, y: cy, r: 8, maxR: 34, color: isRed ? '#ff4b3e' : '#38bdf8', lineW: 3, life: 0.36 });
        for (var i = 0; i < 8; i++) {
          var a = (i / 8) * Math.PI * 2;
          fx.spawn({
            kind: 'spark',
            x: cx, y: cy,
            vx: Math.cos(a) * (50 + Math.random() * 45),
            vy: Math.sin(a) * (50 + Math.random() * 45) - 18,
            r: 2.6,
            color: i % 2 ? '#ffe042' : (isRed ? '#ff4b3e' : '#38bdf8'),
            life: 0.44
          });
        }
      },
      onControlPoint: function (fx, n, cp) {
        recordRhythmCp(fx);
        fx.modeState.hitFlash = 0.7;
        fx.spawn({ kind: 'glyph', text: '+1 HIT!', x: cp.x, y: cp.y - 14, vx: 0, vy: -30, size: 11, color: '#ffca28', life: 0.48 });
        fx.spawn({ kind: 'ring', x: cp.x, y: cp.y, r: 4, maxR: 20, color: '#ffca28', lineW: 2.2, life: 0.32 });
      },
      onStep: function (fx, dt, roll, T, A, jumped) {
        var ms = fx.modeState;
        if (jumped && fx.prevPlayPos !== null && roll.playPos < fx.prevPlayPos - 0.1) {
          ms.combo = 0;
          ms.fever = 0;
          ms.flyers = [];
          ms.rollNoteId = null;
          ms.rollCount = 0;
          ms.rollLinger = 0;
        }
        var ctx = getPlaybackNoteContext(roll, roll.playPos);
        var gridH = roll.gridBottom();
        var refNote = ctx.cur || ctx.next || ctx.prev;
        var targetY = refNote ? noteCenterY(roll, refNote) : (roll.rulerH + gridH) * 0.5;
        stepSmoothFollowerY(fx, roll, dt, jumped, clamp(targetY, roll.rulerH + 20, gridH - 20), 18);
        ms.comboPop = Math.max(0, (ms.comboPop || 0) - dt * 5);
        ms.hitFlash = Math.max(0, (ms.hitFlash || 0) - dt * 6);
        ms.rollPop = Math.max(0, (ms.rollPop || 0) - dt * 7.5);
        ms.ctx = ctx;

        // 黄色长条（长于 1/4 小节，即 dur > 1 拍）高速连打演出！（若 G2P/词典失败则不触发连打）
        if (isLongRhythmNote(ctx.cur) && !isNoteG2pMiss(roll, ctx.cur, ms.missCache)) {
          if (ms.rollNoteId !== ctx.cur.id) {
            ms.rollNoteId = ctx.cur.id;
            ms.rollCount = 0;
            ms.rollCd = 0;
          }
          ms.rollLinger = 0.68;
          ms.rollAnchorY = noteCenterY(roll, ctx.cur);
          if (roll.isPlaying) {
            ms.rollCd = (ms.rollCd || 0) - dt;
            if (ms.rollCd <= 0) {
              ms.rollCd = 0.065; // ~15 次/秒高速连打
              ms.rollCount = (ms.rollCount || 0) + 1;
              ms.rollPop = 1;
              ms.hitFlash = 1;
              ms.fever = Math.min(1, (ms.fever || 0) + 0.012);
              recordRhythmCp(fx);

              var rx = roll.beatX(roll.playPos);
              var ry = ms.rollAnchorY;
              var altRed = (ms.rollCount % 2 === 1);
              if (rx >= roll.kbW - 10 && rx <= roll.w + 10) {
                if (!ms.flyers) ms.flyers = [];
                // 每次连打都飞出一枚小鼓面朝右上角祭典槽冲去
                ms.flyers.push({
                  x: rx,
                  y: ry,
                  tx: roll.w - 42,
                  ty: roll.rulerH + 18,
                  t: 0,
                  dur: 0.48,
                  isRed: altRed,
                  isLong: false
                });
                if (ms.flyers.length > 28) ms.flyers.shift();

                fx.spawn({
                  kind: 'ring',
                  x: rx, y: ry,
                  r: 7, maxR: 28,
                  color: altRed ? '#ff4b3e' : '#38bdf8',
                  lineW: 2.6,
                  life: 0.24
                });
                for (var si = 0; si < 3; si++) {
                  var sa = (Math.random() - 0.5) * Math.PI * 1.6;
                  var ssp = 55 + Math.random() * 65;
                  fx.spawn({
                    kind: 'spark',
                    x: rx, y: ry,
                    vx: Math.cos(sa) * ssp,
                    vy: Math.sin(sa) * ssp - 20,
                    r: 2.3 + Math.random() * 1.2,
                    color: si === 0 ? '#ffe042' : (altRed ? '#ff4b3e' : '#38bdf8'),
                    life: 0.30
                  });
                }
                if (ms.rollCount % 2 === 1) {
                  var shout = langCode() === 'en' ? (altRed ? 'DON!' : 'KA!') : (langCode() === 'ja' ? (altRed ? 'ドン!' : 'カッ!') : (altRed ? '咚!' : '咔!'));
                  fx.spawn({
                    kind: 'glyph',
                    text: shout,
                    x: clamp(rx + (Math.random() - 0.5) * 18, roll.kbW + 20, roll.w - 20),
                    y: Math.max(roll.rulerH + 16, ry - 14),
                    vx: (Math.random() - 0.5) * 28,
                    vy: -42,
                    size: 12,
                    color: altRed ? '#ff6b57' : '#5ce1ff',
                    life: 0.34
                  });
                }
              }
            }
          }
        } else {
          if (ms.rollLinger > 0) {
            ms.rollLinger = Math.max(0, ms.rollLinger - dt);
            if (ms.rollLinger <= 0) {
              ms.rollNoteId = null;
              ms.rollCount = 0;
            }
          }
        }

        if (ms.flyers) {
          for (var i = ms.flyers.length - 1; i >= 0; i--) {
            ms.flyers[i].t += dt;
            if (ms.flyers[i].t >= ms.flyers[i].dur) ms.flyers.splice(i, 1);
          }
        }
        stepRhythmResults(fx, roll, dt, jumped, 'drumParade');
      },
      drawCustomPlayhead: function (fx, c, roll, T, px) {
        var ms = fx.modeState;
        var ty = ms.followY !== undefined ? ms.followY : (roll.rulerH + roll.gridBottom()) * 0.5;
        var flash = ms.hitFlash || 0;
        var r = clamp(roll.rowH * 0.82, 12, 18);

        c.save();
        // 柔和纵向节拍参考线
        c.strokeStyle = 'rgba(255, 224, 66, 0.35)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(px, roll.rulerH); c.lineTo(px, roll.h); c.stroke();

        // 标尺顶部迷你祭典小鼓图标
        c.fillStyle = '#d97706';
        c.strokeStyle = '#451a03';
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(px, 10, 8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#fffbeb';
        c.beginPath(); c.arc(px, 10, 5.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ef4444';
        c.beginPath(); c.arc(px, 10, 2.5, 0, Math.PI * 2); c.fill();

        // 音高位置上的双层圆环敲击判定框
        c.strokeStyle = flash > 0.1 ? '#ffe042' : 'rgba(255, 255, 255, 0.88)';
        c.lineWidth = 3 + flash * 2.5;
        c.beginPath(); c.arc(px, ty, r + 2 + flash * 3, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(20, 20, 30, 0.55)';
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(px, ty, r - 2, 0, Math.PI * 2); c.stroke();
        c.restore();
        return true;
      },
      renderUnder: function (fx, c, roll, T, A) {
        var notes = roll.activeTrackVisible === false ? [] : (roll.notes || []);
        var playPos = roll.playPos;
        var r = clamp(roll.rowH * 0.68, 10, 15);

        // 辅助绘制可爱表情圆鼓面
        var drawDrumFace = function (x, y, rad, fillCol, happy) {
          c.save();
          c.translate(x, y);
          c.fillStyle = '#ffffff';
          c.strokeStyle = '#1f2937';
          c.lineWidth = 1.6;
          c.beginPath(); c.arc(0, 0, rad, 0, Math.PI * 2); c.fill(); c.stroke();
          c.fillStyle = fillCol;
          c.beginPath(); c.arc(0, 0, rad * 0.76, 0, Math.PI * 2); c.fill();
          // 呆萌小眼睛 & 嘴巴
          c.fillStyle = '#18181b';
          c.beginPath();
          c.arc(-rad * 0.28, -rad * 0.1, Math.max(1.2, rad * 0.11), 0, Math.PI * 2);
          c.arc(rad * 0.28, -rad * 0.1, Math.max(1.2, rad * 0.11), 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#18181b';
          c.lineWidth = 1.3;
          c.beginPath();
          if (happy) {
            c.arc(0, rad * 0.08, rad * 0.24, 0.15, Math.PI - 0.15);
          } else {
            c.arc(0, rad * 0.18, rad * 0.16, 0, Math.PI);
          }
          c.stroke();
          c.restore();
        };

        // 给视野内待击与进行中的音符换上祭典红咚/蓝咔/金长条外观
        for (var i = 0; i < notes.length; i++) {
          var n = notes[i];
          if (!n) continue;
          var endB = n.start + n.dur;
          if (endB < playPos - 0.05) continue;
          var nx = roll.beatX(n.start);
          var nw = Math.max(6, n.dur * roll.pxBeat);
          if (nx > roll.w + 30 || nx + nw < roll.kbW - 30) continue;
          var ny = noteCenterY(roll, n);
          var isLong = isLongRhythmNote(n);
          var isRed = ((n.pitch || 0) % 2 === 0);

          if (isLong) {
            // 金黄色连打长鼓条（连打越快越发红发烫并高速震动！）
            var barH = r * 1.45;
            var ms = fx.modeState;
            var isRolling = !!(ms && ms.rollNoteId === n.id && playPos >= n.start - 1e-4 && playPos <= endB + 1e-4);
            var heat = isRolling ? clamp((ms.rollCount || 0) / 18, 0, 1) : 0;
            var shakeY = isRolling ? Math.sin(fx.elapsed * 58) * (1.2 + heat * 1.3) : 0;
            c.save();
            var jg = c.createLinearGradient(0, ny - barH / 2 + shakeY, 0, ny + barH / 2 + shakeY);
            jg.addColorStop(0, heat > 0.5 ? '#ffe082' : '#fff176');
            jg.addColorStop(0.5, heat > 0.65 ? '#ff5722' : (heat > 0.25 ? '#ff9800' : '#ffca28'));
            jg.addColorStop(1, heat > 0.5 ? '#dc2626' : '#f59e0b');
            c.fillStyle = jg;
            c.strokeStyle = isRolling ? '#fff59d' : '#78350f';
            c.lineWidth = isRolling ? 2.2 : 1.6;
            roundRect(c, nx, ny - barH / 2 + shakeY, Math.max(barH, nw), barH, barH / 2);
            c.fill(); c.stroke();
            c.restore();
            drawDrumFace(nx + r * 0.2, ny + shakeY, r, isRolling ? (heat > 0.5 ? '#ff5722' : '#ff9800') : '#ffca28', true);
          } else if (n.start >= playPos - 0.04) {
            drawDrumFace(nx, ny, r, isRed ? '#ff4b3e' : '#38bdf8', false);
          }
        }
      },
      renderOver: function (fx, c, roll, T, A) {
        var ms = fx.modeState;
        var r = clamp(roll.rowH * 0.62, 9, 13);

        // 1. 飞向右上角祭典槽的欢呼小鼓面
        if (ms.flyers) {
          for (var i = 0; i < ms.flyers.length; i++) {
            var fl = ms.flyers[i];
            var u = clamp(fl.t / fl.dur, 0, 1);
            var fxX = fl.x + (fl.tx - fl.x) * u;
            var fxY = fl.y + (fl.ty - fl.y) * u - Math.sin(u * Math.PI) * 75;
            c.save();
            c.globalAlpha = 1 - u * 0.35;
            c.translate(fxX, fxY);
            c.rotate(u * Math.PI * 2);
            c.fillStyle = '#ffffff';
            c.strokeStyle = '#1f2937';
            c.lineWidth = 1.4;
            c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
            c.fillStyle = fl.isLong ? '#ffca28' : (fl.isRed ? '#ff4b3e' : '#38bdf8');
            c.beginPath(); c.arc(0, 0, r * 0.72, 0, Math.PI * 2); c.fill();
            c.restore();
          }
        }

        // 1.5 黄色长条连打计数大气泡（15 连打!!）
        if ((ms.rollCount || 0) > 0 && (ms.rollLinger || 0) > 0 && !ms.results) {
          var isRollActive = !!(ms.ctx && isLongRhythmNote(ms.ctx.cur));
          var rollAlpha = isRollActive ? 1 : clamp(ms.rollLinger / 0.45, 0, 1);
          var rPop = 1 + (ms.rollPop || 0) * 0.28;
          var rbx = clamp(roll.beatX(roll.playPos), roll.kbW + 64, roll.w - 64);
          var rby = Math.max(roll.rulerH + 34, (ms.rollAnchorY || ms.followY || 120) - 38);
          var rollLabel = langCode() === 'ja'
            ? (ms.rollCount + ' 連打!!')
            : (langCode() === 'en' ? (ms.rollCount + ' ROLL!!') : (ms.rollCount + ' 连打!!'));
          c.save();
          c.globalAlpha = rollAlpha;
          c.translate(rbx, rby);
          c.scale(rPop, rPop);
          c.font = '900 17px Impact, "Microsoft YaHei", sans-serif';
          var bw = c.measureText(rollLabel).width + 22;
          var bh = 28;
          var bg = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
          bg.addColorStop(0, '#fff9c4');
          bg.addColorStop(1, '#ffca28');
          c.fillStyle = bg;
          c.strokeStyle = '#dc2626';
          c.lineWidth = 2.6;
          roundRect(c, -bw / 2, -bh / 2, bw, bh, 14);
          c.fill(); c.stroke();
          drawTextHalo(c, rollLabel, 0, 0.5, 17, '#dc2626', '#ffffff', 3.2, 'center', 'Impact, "Microsoft YaHei", sans-serif');
          c.restore();
        }

        // 2. 右上角祭典热闹能量槽 + 魂/FEVER 徽章
        var gaugeW = 132, gaugeH = 12;
        var gx = roll.w - gaugeW - 44;
        var gy = roll.rulerH + 12;
        var fever = clamp(ms.fever || 0, 0, 1);
        c.save();
        c.fillStyle = 'rgba(20, 16, 28, 0.78)';
        roundRect(c, gx, gy, gaugeW, gaugeH, 6);
        c.fill();
        if (fever > 0.01) {
          var fg = c.createLinearGradient(gx, 0, gx + gaugeW, 0);
          if (fever >= 0.99) {
            fg.addColorStop(0, '#ff4b3e');
            fg.addColorStop(0.35, '#ffe042');
            fg.addColorStop(0.7, '#4ade80');
            fg.addColorStop(1, '#38bdf8');
          } else {
            fg.addColorStop(0, '#f59e0b');
            fg.addColorStop(1, '#ef4444');
          }
          c.fillStyle = fg;
          roundRect(c, gx + 1.5, gy + 1.5, (gaugeW - 3) * fever, gaugeH - 3, 4.5);
          c.fill();
        }
        c.strokeStyle = fever >= 0.99 ? '#ffe042' : '#ffffff';
        c.lineWidth = 1.5;
        roundRect(c, gx, gy, gaugeW, gaugeH, 6);
        c.stroke();
        // 终点圆章
        var badgeX = gx + gaugeW + 16, badgeY = gy + gaugeH * 0.5;
        c.fillStyle = fever >= 0.99 ? '#ff4b3e' : '#334155';
        c.strokeStyle = '#ffe042';
        c.lineWidth = 1.8;
        c.beginPath(); c.arc(badgeX, badgeY, 11, 0, Math.PI * 2); c.fill(); c.stroke();
        drawTextHalo(c, langCode() === 'en' ? 'MAX' : '魂', badgeX, badgeY + 0.5, langCode() === 'en' ? 8.5 : 11, '#ffe042', 'rgba(0,0,0,0.65)', 2);
        c.restore();

        // 3. 左下角连击数
        if ((ms.combo || 0) > 0) {
          var pop = 1 + (ms.comboPop || 0) * 0.22;
          c.save();
          c.translate(roll.kbW + 18, roll.gridBottom() - 24);
          c.scale(pop, pop);
          drawTextHalo(c, ms.combo + (langCode() === 'en' ? ' COMBO!' : ' 连击!'), 0, 0, 20, '#ffe042', '#b91c1c', 3.8, 'left', 'Impact, "Microsoft YaHei", sans-serif');
          c.restore();
        }
        drawRhythmResults(fx, c, roll, T, A);
      }
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
    this.modeState = Object.create(null);
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
    this.modeState = Object.create(null);
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
    this._step(this.lastTs);
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

    if (this.mode.onStep) this.mode.onStep(this, dt, roll, T, A, jumped);

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
      } else if (p.kind === 'puff') {
        p.vx *= Math.pow(0.25, dt);
        p.vy -= 18 * dt;
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
    if (!this.active || !this.mode) return false;
    if (this.mode.drawCustomPlayhead) {
      var handled = !!this.mode.drawCustomPlayhead(this, c, this.roll, T, px);
      if (handled) return true;
    }
    return !!this.mode.hidePlayhead;
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
      } else if (p.kind === 'square') {
        var sqR = p.maxR ? (p.r + (p.maxR - p.r) * (1 - Math.pow(1 - u, 2))) : p.r * (1 - u * 0.45);
        c.translate(p.x, p.y);
        c.rotate(p.rot || 0);
        if (p.hollow) {
          c.strokeStyle = p.color;
          c.lineWidth = (p.lineW || 2) * (1 - u * 0.65);
          c.strokeRect(-sqR, -sqR, sqR * 2, sqR * 2);
        } else {
          c.fillStyle = p.color;
          c.fillRect(-sqR, -sqR, sqR * 2, sqR * 2);
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
      } else if (p.kind === 'puff') {
        c.globalAlpha = clamp((1 - u) * 0.72, 0, 1);
        c.fillStyle = p.color || '#ffffff';
        c.beginPath();
        c.arc(p.x, p.y, Math.max(1.2, (p.r || 3) * (0.85 + u * 1.35)), 0, Math.PI * 2);
        c.fill();
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
