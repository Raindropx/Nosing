/* Phoneme lane: actual synthesis timing, per-word colours and reversible edits. */
(function (root) {
  'use strict';
  var NSG = root.NSG, P = NSG.PianoRoll.prototype;
  function tr(key, vars, fallback) {
    return (NSG.I18N && NSG.I18N.t) ? NSG.I18N.t(key, vars, fallback) : fallback;
  }
  var COLORS = NSG.PHONE_COLORS = [
    { ink: '#186291', fill: 'rgba(68,176,240,.40)', selected: 'rgba(52,168,238,.68)' },
    { ink: '#1b7a6e', fill: 'rgba(72,202,176,.36)', selected: 'rgba(54,192,164,.64)' }
  ];
  var SILENCE = { ink: '#6e8796', fill: 'rgba(153,178,194,.22)', selected: 'rgba(140,168,186,.36)' };
  var PHONE_THEMES = {
    aero: {
      pairs: COLORS, silence: SILENCE, fallback: '#727b83',
      bg: ['rgba(250,254,255,', 'rgba(235,247,255,', 'rgba(222,240,252,'],
      topLine: '#8ec2e2', hiLine: 'rgba(255,255,255,.85)',
      capText: '#255a7a', subText: '#3b6d8c',
      beatBar: '#b4c9dc', beatTick: '#dce6ef', baseLine: '#c8d8e6',
      labelBg: 'rgba(247,251,255,.85)', emptyText: '#7b8e9a',
      rampFill: 'rgba(255,255,255,.28)', gripFill: '#fff'
    },
    '9x': {
      pairs: [
        { ink: '#000080', fill: 'rgba(0,128,128,.24)', selected: 'rgba(0,0,128,.40)' },
        { ink: '#006400', fill: 'rgba(0,128,0,.22)', selected: 'rgba(0,128,0,.40)' }
      ],
      silence: { ink: '#404040', fill: 'rgba(128,128,128,.20)', selected: 'rgba(128,128,128,.38)' },
      fallback: '#404040',
      bg: ['rgba(223,223,223,', 'rgba(192,192,192,', 'rgba(192,192,192,'],
      topLine: '#808080', hiLine: '#ffffff',
      capText: '#000000', subText: '#000080',
      beatBar: '#808080', beatTick: '#a8a8a8', baseLine: '#808080',
      labelBg: '#ffffff', emptyText: '#404040',
      rampFill: 'rgba(255,255,255,.45)', gripFill: '#ffffff'
    },
    cyberpunk: {
      pairs: [
        { ink: '#00f0ff', fill: 'rgba(0,240,255,.24)', selected: 'rgba(0,240,255,.48)' },
        { ink: '#ff4da6', fill: 'rgba(255,42,133,.24)', selected: 'rgba(255,42,133,.48)' }
      ],
      silence: { ink: '#7e9bb8', fill: 'rgba(56,92,128,.24)', selected: 'rgba(84,132,178,.42)' },
      fallback: '#7ea2bf',
      bg: ['rgba(11,16,33,', 'rgba(8,12,26,', 'rgba(6,9,18,'],
      topLine: '#00f0ff', hiLine: 'rgba(0,240,255,.25)',
      capText: '#00f0ff', subText: '#8ce8ff',
      beatBar: '#1e4a70', beatTick: '#11253d', baseLine: '#1d4466',
      labelBg: 'rgba(8,13,28,.92)', emptyText: '#6893b5',
      rampFill: 'rgba(252,238,10,.18)', gripFill: '#050812'
    },
    xp: {
      pairs: [
        { ink: '#0054e3', fill: 'rgba(42,114,220,.26)', selected: 'rgba(36,104,223,.48)' },
        { ink: '#268114', fill: 'rgba(68,176,44,.26)', selected: 'rgba(52,158,34,.48)' }
      ],
      silence: { ink: '#5a6b82', fill: 'rgba(155,172,196,.24)', selected: 'rgba(130,150,180,.42)' },
      fallback: '#5a6b82',
      bg: ['rgba(255,255,255,', 'rgba(244,242,232,', 'rgba(232,229,214,'],
      topLine: '#7f9db9', hiLine: '#ffffff',
      capText: '#003c99', subText: '#245edb',
      beatBar: '#8aa8d8', beatTick: '#cfd8eb', baseLine: '#aca899',
      labelBg: '#ffffff', emptyText: '#5a6b82',
      rampFill: 'rgba(248,179,50,.22)', gripFill: '#ffffff'
    },
    pixel: {
      pairs: [
        { ink: '#00f5d4', fill: 'rgba(0,245,212,.26)', selected: 'rgba(0,245,212,.52)' },
        { ink: '#ff7b29', fill: 'rgba(255,123,41,.28)', selected: 'rgba(255,46,151,.54)' }
      ],
      silence: { ink: '#b594ff', fill: 'rgba(92,58,150,.30)', selected: 'rgba(130,86,204,.50)' },
      fallback: '#b594ff',
      bg: ['rgba(14,5,32,', 'rgba(9,3,22,', 'rgba(5,1,12,'],
      topLine: '#ff2e97', hiLine: 'rgba(0,245,212,.38)',
      capText: '#ffd319', subText: '#48ff7b',
      beatBar: '#ff2e97', beatTick: '#3e1a6e', baseLine: '#7a2fa8',
      labelBg: '#090316', emptyText: '#b594ff',
      rampFill: 'rgba(255,211,25,.26)', gripFill: '#05010c'
    },
    modern: {
      pairs: [
        { ink: '#4f378b', fill: 'rgba(103,80,164,.20)', selected: 'rgba(103,80,164,.38)' },
        { ink: '#006a6a', fill: 'rgba(0,106,106,.18)', selected: 'rgba(0,106,106,.36)' }
      ],
      silence: { ink: '#625b71', fill: 'rgba(121,116,126,.16)', selected: 'rgba(121,116,126,.30)' },
      fallback: '#625b71',
      bg: ['rgba(254,247,255,', 'rgba(247,242,250,', 'rgba(243,237,247,'],
      topLine: '#cac4d0', hiLine: '#ffffff',
      capText: '#4f378b', subText: '#625b71',
      beatBar: '#b6a8c8', beatTick: '#e6e0e9', baseLine: '#cac4d0',
      labelBg: 'rgba(254,247,255,.94)', emptyText: '#625b71',
      rampFill: 'rgba(208,188,255,.32)', gripFill: '#fef7ff'
    }
  };
  NSG.phoneThemeColors = function (theme) {
    if (theme === 'modern' && NSG.modernPalette && NSG.modernPalette.phone) {
      return NSG.modernPalette.phone;
    }
    if (NSG.schemePalettes && NSG.schemePalettes[theme] && NSG.schemePalettes[theme].phone) {
      return NSG.schemePalettes[theme].phone;
    }
    return PHONE_THEMES[theme] || PHONE_THEMES.aero;
  };
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function key(phone) { return phone.noteId + ':' + phone.index; }

  function samePhoneArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  P._phoneTimeline = function () {
    var cacheKey = this._notesPhoneSig ? (this._notesPhoneSig() + '|' + this._temposSig())
      : JSON.stringify([this.notes, this.lang, this.phonemizer, this.tempo, this.tempos]);
    if (cacheKey !== this._phoneTimelineKey) {
      this._phoneTimelineKey = cacheKey;
      var tl = NSG.DSP.phonemeTimeline({ lang: this.lang || 'zh', phonemizer: this.phonemizer,
        tempo: this.tempo || 120, tempos: this.tempos, tracks: [{ type: 'vocal', notes: this.notes }] },
        this.timbre || NSG.defaultTimbre());
      var groups = NSG.pronunciationGroups(this.notes, tl.notes);
      var wordEnds = {}, byKey = Object.create(null);
      for (var i = 0; i < tl.phones.length; i++) {
        var ph = tl.phones[i];
        byKey[key(ph)] = ph;
        var grp = groups[ph.noteId];
        if (grp && ph.t1 > (wordEnds[grp.headId] || 0)) wordEnds[grp.headId] = ph.t1;
      }
      tl._groups = groups;
      tl._wordEnds = wordEnds;
      tl._byKey = byKey;
      this._phoneTimelineValue = tl;
    }
    return this._phoneTimelineValue;
  };
  P._phoneGroup = function (phone) {
    var timeline = this._phoneTimeline(), original = this.notes.find(function (n) { return n.id === phone.noteId; });
    if (!original) return null;
    var list = timeline.phones.filter(function (p) { return p.noteId === phone.noteId; }).sort(function (a, b) { return a.index - b.index; });
    var runtime = timeline.notes.find(function (n) { return n.id === phone.noteId; });
    var chain = timeline.notes.filter(function (n) { return n.id === phone.noteId || (n._slur && n._legato === runtime._start); });
    var span = Math.max.apply(null, chain.map(function (n) { return n.start + n.dur; })) - original.start;
    return { note: original, runtime: runtime, list: list, span: span, tm: timeline.tm };
  };
  P.selectedPhone = function () {
    var selected = this.phoneSelection;
    if (!selected) return null;
    var tl = this._phoneTimeline();
    return (tl._byKey && tl._byKey[selected]) || tl.phones.find(function (p) { return key(p) === selected; }) || null;
  };
  P.selectPhone = function (phone) {
    this.phoneSelection = phone ? key(phone) : null;
    this.sel = {};
    if (phone) this.sel[phone.noteId] = 1;
    this.draw();
  };
  P._syncPhoneSelection = function () {
    var phone = this.selectedPhone();
    if (phone && !this.sel[phone.noteId]) phone = null;
    if (!phone) this.phoneSelection = null;
    if (this.onPhoneSelectionChange) {
      var group = phone ? this._phoneGroup(phone) : null;
      var sig = phone ? (key(phone) + '|' + phone.phone + '|' + phone.t0 + '|' + phone.t1 + '|' +
        phone.crossfade + '|' + (phone.anticipation || 0) + '|' + (group && group.note ? group.note.phonemeWordJoin : '')) : '';
      if (sig !== this._lastPhoneSelSig) {
        this._lastPhoneSelSig = sig;
        this.onPhoneSelectionChange(phone, group);
      }
    }
  };
  P._drawPhoneLane = function () {
    this._phoneBlocks = [];
    this._phoneLabelBoxes = [];
    if (!this.showPhonePanel) return;
    var self = this, c = this.ctx, y = this.gridBottom(), timeline = this._phoneTimeline();
    var groups = timeline._groups || NSG.pronunciationGroups(this.notes, timeline.notes);
    var pt = NSG.phoneThemeColors(this.theme || NSG.theme || 'aero');
    var themeId = this.theme || NSG.theme;
    var bgAlpha = themeId === 'aero' ? this.backgroundOpacity : (themeId === 'cyberpunk' ? 0.85 : 1);
    c.save();
    var phBg = c.createLinearGradient(0, y, 0, y + this.phoneLane);
    phBg.addColorStop(0, pt.bg[0] + bgAlpha + ')');
    phBg.addColorStop(0.5, pt.bg[1] + bgAlpha + ')');
    phBg.addColorStop(1, pt.bg[2] + bgAlpha + ')');
    c.fillStyle = phBg;
    c.fillRect(0, y, this.w, this.phoneLane);
    c.strokeStyle = pt.topLine; c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(this.w, y + 0.5); c.stroke();
    c.strokeStyle = pt.hiLine; c.beginPath(); c.moveTo(0, y + 1.5); c.lineTo(this.w, y + 1.5); c.stroke();
    c.fillStyle = pt.capText; c.font = 'bold 11px "Microsoft YaHei", sans-serif'; c.fillText(tr('phonePanel.canvas.phone', null, '音素'), 10, y + 25);
    c.font = '9px "Microsoft YaHei", sans-serif'; c.fillStyle = pt.subText; c.fillText(tr('phonePanel.canvas.dur', null, '时长'), 10, y + 59); c.fillText(tr('phonePanel.canvas.xfade', null, '交叉'), 10, y + 75);
    c.beginPath(); c.rect(this.kbW, y + 1, this.w - this.kbW, this.phoneLane - 1); c.clip();
    c.setLineDash([2, 3]);
    for (var b = Math.floor(this.scrollBeat); b <= this.xBeat(this.w); b++) {
      var bx = this.beatX(b);
      c.strokeStyle = b % 4 === 0 ? pt.beatBar : pt.beatTick;
      c.beginPath(); c.moveTo(bx, y); c.lineTo(bx, y + this.phoneLane); c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = pt.baseLine; c.beginPath(); c.moveTo(this.kbW, y + 86); c.lineTo(this.w, y + 86); c.stroke();
    var wordHeads = {}, wordEnds = timeline._wordEnds || {}, labels = [], labelEnds = [this.kbW, this.kbW];
    var tViewMin = timeline.tm.secOf(Math.max(0, this.scrollBeat)) - 0.01;
    var tViewMax = timeline.tm.secOf(Math.max(0, this.xBeat(this.w))) + 0.25;
    var phList = timeline.phones;
    for (var phoneIndex = 0; phoneIndex < phList.length; phoneIndex++) {
      var phone = phList[phoneIndex];
      if (phone.t1 < tViewMin) continue;
      if (phone.t0 - (phone.anticipation || 0) / 1000 > tViewMax) break;
      var x = self.beatX(timeline.tm.beatOf(phone.t0)), endX = self.beatX(timeline.tm.beatOf(phone.t1));
      var onsetX = self.beatX(timeline.tm.beatOf(phone.t0 - (phone.anticipation || 0) / 1000));
      if (endX < self.kbW || onsetX > self.w) continue;
      var group = groups[phone.noteId] || { index: -1, word: '', headId: phone.noteId };
      var color = group.index < 0 ? pt.silence : pt.pairs[group.index % 2];
      var selected = key(phone) === self.phoneSelection;
      var xfX = self.beatX(timeline.tm.beatOf(phone.t0 + phone.crossfade / 1000));
      var next = phList[phoneIndex + 1];
      var joined = next && !next.readOnly && Math.abs(next.t0 - phone.t1) < 1e-6;
      var fadeOutX = joined ? self.beatX(timeline.tm.beatOf(next.t0 - (next.anticipation || 0) / 1000)) : endX;
      var fadeEndX = joined ? self.beatX(timeline.tm.beatOf(next.t0 + next.crossfade / 1000)) : endX;
      var maxX = self.beatX(timeline.tm.beatOf(phone.t0 + phone.maxCrossfade / 1000));
      var block = { phone: phone, x: x, onsetX: onsetX, endX: endX, xfX: xfX, maxX: maxX, y: y + 50, bottom: y + 86 };
      self._phoneBlocks.push(block);
      if (!wordHeads[group.headId]) {
        wordHeads[group.headId] = true;
        var wordEndX = self.beatX(timeline.tm.beatOf(wordEnds[group.headId] || phone.t1));
        c.save(); c.beginPath(); c.rect(x, y + 3, Math.max(0, wordEndX - x), 18); c.clip();
        c.font = '10px "Microsoft YaHei", sans-serif'; c.fillStyle = color.ink;
        c.fillText(group.word || (phone.phone === 'SP' ? tr('phonePanel.canvas.rest', null, '休止') : phone.phone === 'br' ? tr('phonePanel.canvas.breath', null, '换气') : ''), Math.max(x + 3, self.kbW + 3), y + 15);
        c.restore();
      }
      c.fillStyle = selected ? color.selected : color.fill;
      c.strokeStyle = color.ink; c.lineWidth = selected ? 1.8 : 1.1;
      c.beginPath(); c.moveTo(onsetX, y + 86); c.lineTo(xfX, y + 52);
      c.lineTo(Math.max(xfX, fadeOutX), y + 52); c.lineTo(fadeEndX, y + 86); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = pt.hiLine; c.lineWidth = 1;
      c.beginPath(); c.moveTo(xfX + 1, y + 53.2); c.lineTo(Math.max(xfX + 1, fadeOutX - 1), y + 53.2); c.stroke();
      c.strokeStyle = color.ink; c.lineWidth = selected ? 1.8 : 1.1;
      // A lightly shaded incoming ramp is the actual crossfade used in synthesis.
      if (phone.crossfade > 0 || phone.anticipation > 0) {
        c.fillStyle = pt.rampFill; c.fillRect(onsetX, y + 52, xfX - onsetX, 34);
        c.setLineDash([3, 2]); c.beginPath(); c.moveTo(xfX, y + 52); c.lineTo(xfX, y + 86); c.stroke(); c.setLineDash([]);
      }
      c.font = '11px Consolas, "Microsoft YaHei", monospace';
      var labelX = Math.max(x + 2, self.kbW + 2), labelWidth = c.measureText(phone.phone).width + 5;
      var labelRow = labelX >= labelEnds[0] + 2 ? 0 : labelX >= labelEnds[1] + 2 ? 1 : -1;
      if (labelRow >= 0) {
        labelEnds[labelRow] = labelX + labelWidth;
        labels.push({ block: block, x: labelX, y: y + 20 + labelRow * 14, width: labelWidth, color: color });
      }
      if (selected && endX - x > 45) {
        c.font = '9px Consolas, monospace'; c.fillStyle = color.ink;
        c.fillText(Math.round((phone.t1 - phone.t0) * 1000) + 'ms', x + 3, y + 77);
      }
      if (!phone.readOnly) {
        c.fillStyle = color.ink;
        c.beginPath(); c.moveTo(x - 3, y + 90); c.lineTo(x + 3, y + 90); c.lineTo(x, y + 84); c.closePath(); c.fill();
        // Separate attack grip from the nominal timing boundary and ramp end.
        if (selected && phone.maxAnticipation > 0) {
          c.strokeStyle = color.ink; c.lineWidth = 1;
          c.beginPath(); c.moveTo(onsetX, y + 66); c.lineTo(onsetX, y + 86); c.stroke();
          c.fillStyle = pt.gripFill; c.fillRect(onsetX - 3, y + 62, 6, 6); c.strokeRect(onsetX - 3, y + 62, 6, 6);
        }
        if (selected && phone.maxCrossfade > 0) {
          c.fillStyle = pt.gripFill; c.beginPath(); c.moveTo(xfX, y + 46); c.lineTo(xfX + 4, y + 51);
          c.lineTo(xfX, y + 56); c.lineTo(xfX - 4, y + 51); c.closePath(); c.fill(); c.stroke();
        }
      }
    }
    labels.forEach(function (label) {
      var block = label.block;
      c.fillStyle = pt.labelBg; c.fillRect(label.x, label.y, label.width, 12);
      if (label.width > block.endX - block.x - 2) {
        c.strokeStyle = label.color.ink; c.lineWidth = 0.6; c.strokeRect(label.x + 0.5, label.y + 0.5, label.width, 12);
      }
      c.fillStyle = label.color.ink; c.font = '11px Consolas, "Microsoft YaHei", monospace';
      c.fillText(block.phone.phone, label.x + 2, label.y + 10);
    });
    this._phoneLabelBoxes = labels;
    if (!timeline.phones.length) {
      c.fillStyle = pt.emptyText; c.font = '11px "Microsoft YaHei", sans-serif';
      c.fillText(tr('phonePanel.canvas.empty', null, '添加音符后显示音素 · 下方竖线调边界 · 菱形调交叉 · 双击更换音素'), this.kbW + 12, y + 53);
    }
    c.restore(); this._syncPhoneSelection();
  };
  P.hitPhoneBlock = function (x, y) {
    if (!this.showPhonePanel || x < this.kbW || y < this.gridBottom() || y >= this.h - this.velLane) return null;
    var blocks = this._phoneBlocks || [];
    // Incoming crossfade handle takes precedence over the same block's start boundary.
    var selected = blocks.find(function (b) { return key(b.phone) === this.phoneSelection; }, this);
    if (selected && selected.phone.maxAnticipation > 0 && Math.abs(x - selected.onsetX) <= 7 && Math.abs(y - (selected.y + 15)) <= 7)
      return { block: selected, mode: 'phoneAnticipation' };
    if (selected && selected.phone.maxCrossfade > 0 && Math.abs(x - selected.xfX) <= 7 && Math.abs(y - (selected.y + 1)) <= 8)
      return { block: selected, mode: 'phoneCrossfade' };
    var labels = this._phoneLabelBoxes || [];
    for (var l = labels.length - 1; l >= 0; l--) {
      var label = labels[l];
      if (x >= label.x && x < label.x + label.width && y >= label.y && y < label.y + 12) return { block: label.block };
    }
    for (var i = blocks.length - 1; i >= 0; i--) {
      var block = blocks[i];
      if (!block.phone.readOnly && y >= block.y + 14 && Math.abs(x - block.x) <= 5)
        return { block: block, mode: 'phoneBoundary', boundary: block.phone.index };
    }
    for (var j = blocks.length - 1; j >= 0; j--) {
      var last = blocks[j];
      if (!last.phone.readOnly && y >= last.y + 14 && Math.abs(x - last.endX) <= 5)
        return { block: last, mode: 'phoneBoundary', boundary: last.phone.index + 1 };
      if (x >= last.onsetX && x < last.endX) return { block: last };
    }
    return null;
  };
  P._timingFromGroup = function (group) {
    var old = group.note.phonemeTiming;
    var curPhones = group.list.map(function (p) { return p.phone; });
    var keepOld = old && old.lang === group.runtime.lang && samePhoneArray(old.phones, curPhones);
    return { lang: group.runtime.lang, phones: curPhones, span: group.span,
      boundaries: group.list.map(function (p) { return group.tm.beatOf(p.t0) - group.note.start; }).concat([
        group.tm.beatOf(group.list[group.list.length - 1].t1) - group.note.start]),
      crossfades: keepOld && old.crossfades ? old.crossfades.slice() : group.list.map(function (p) { return p.crossfade; }),
      anticipations: keepOld && old.anticipations ? old.anticipations.slice() : group.list.map(function (p) { return p.anticipation || 0; }) };
  };
  P._phoneDown = function (p, e) {
    if (!this.showPhonePanel || p.y < this.gridBottom() || p.y >= this.h - this.velLane) return false;
    if (e.preventDefault) e.preventDefault();
    if (e.button === 2) {
      var rightHit = this.hitPhoneBlock(p.x, p.y);
      if (rightHit) this.selectPhone(rightHit.block.phone);
      return true;
    }
    if (e.button !== 0) return true;
    var hit = this.hitPhoneBlock(p.x, p.y);
    if (!hit) { this.selectPhone(null); return true; }
    var group = this._phoneGroup(hit.block.phone);
    this.selectPhone(hit.block.phone);
    if (hit.mode && !hit.block.phone.readOnly) this.drag = { mode: hit.mode, note: group.note, group: group,
      phone: hit.block.phone, boundary: hit.boundary, timing: this._timingFromGroup(group), x0: p.x };
    return true;
  };
  P._setPhoneBoundary = function (group, timing, index, beat) {
    var tm = group.tm, start = group.note.start;
    var lo = index ? tm.secOf(start + timing.boundaries[index - 1]) : 0;
    var hi = index < timing.boundaries.length - 1 ? tm.secOf(start + timing.boundaries[index + 1]) : tm.secOf(start + group.span);
    var margin = Math.min(0.001, (hi - lo) / 3);
    var sec = clamp(tm.secOf(beat), index ? lo + margin : lo, index < timing.boundaries.length - 1 ? hi - margin : hi);
    timing.boundaries[index] = tm.beatOf(sec) - start;
    group.note.phonemeTiming = timing;
  };
  P._phoneMove = function (p) {
    var d = this.drag;
    if (Math.abs(p.x - d.x0) < 0.5) return;
    var timing = JSON.parse(JSON.stringify(d.timing));
    if (d.mode === 'phoneBoundary') this._setPhoneBoundary(d.group, timing, d.boundary, this.xBeat(p.x));
    else {
      var sec = d.group.tm.secOf(this.xBeat(p.x));
      if (d.mode === 'phoneAnticipation') timing.anticipations[d.phone.index] = clamp((d.phone.t0 - sec) * 1000, 0, d.phone.maxAnticipation);
      else timing.crossfades[d.phone.index] = clamp((sec - d.phone.t0) * 1000, 0, d.phone.maxCrossfade);
      d.note.phonemeTiming = timing;
    }
    this.requestDraw();
  };
  P._phoneDoubleClick = function (p, e) {
    var hit = this.hitPhoneBlock(p.x, p.y);
    if (!hit) return;
    e.preventDefault(); this.selectPhone(hit.block.phone);
    if (!hit.block.phone.readOnly && this.onEditPhone) this.onEditPhone(hit.block.phone);
  };
  P.updatePhone = function (field, value) {
    var phone = this.selectedPhone();
    if (!phone || phone.readOnly) return false;
    var group = this._phoneGroup(phone), note = group.note, timing = this._timingFromGroup(group);
    if (field === 'symbol') {
      value = String(value).trim();
      if (!NSG.PHONES[value] || value.indexOf('__') === 0 || /^(SP|br)$/.test(value)) {
        if (this.onPhoneError) this.onPhoneError(tr('phonePanel.invalidSymbol', null, '请输入一个有效的发声音素名称。休止和换气请通过歌词设置。'));
        return false;
      }
      timing.phones[phone.index] = value;
      note.phones = timing.phones.slice(); note.phonesLang = group.runtime.lang; note.phonesSource = 'manual';
      note.phonemeTiming = timing;
    } else if (field === 'start' || field === 'duration') {
      value = Number(value); if (!Number.isFinite(value) || (field === 'duration' && value <= 0)) return false;
      var sec = field === 'start' ? group.tm.secOf(note.start) + value / 1000 : phone.t0 + value / 1000;
      this._setPhoneBoundary(group, timing, phone.index + (field === 'duration' ? 1 : 0), group.tm.beatOf(sec));
    } else if (field === 'crossfade') {
      value = Number(value); if (!Number.isFinite(value)) return false;
      timing.crossfades[phone.index] = clamp(value, 0, phone.maxCrossfade); note.phonemeTiming = timing;
    } else if (field === 'anticipation') {
      value = Number(value); if (!Number.isFinite(value)) return false;
      timing.anticipations[phone.index] = clamp(value, 0, phone.maxAnticipation); note.phonemeTiming = timing;
    } else if (field === 'word') {
      if (value === 'auto') delete note.phonemeWordJoin;
      else note.phonemeWordJoin = value === 'join';
    } else if (field === 'reset') delete note.phonemeTiming;
    else return false;
    if (this._emit() && this.onPhoneCommit) this.onPhoneCommit();
    return true;
  };
  P._defaultCanvasTitle = function () {
    if (this._defaultCvTitle === undefined) this._defaultCvTitle = (this.cv && this.cv.title) || '';
    var i18nKey = (this.cv && typeof this.cv.getAttribute === 'function')
      ? this.cv.getAttribute('data-i18n-title')
      : null;
    if (i18nKey) return tr(i18nKey, null, this._defaultCvTitle);
    if (NSG.I18N && typeof NSG.I18N.has === 'function' && NSG.I18N.has('roll.canvasTitle')) {
      return tr('roll.canvasTitle', null, this._defaultCvTitle);
    }
    return this._defaultCvTitle;
  };
  P._updateHover = function (p) {
    var defaultTitle = this._defaultCanvasTitle();
    var hit = this.hitPhoneBlock(p.x, p.y);
    this.cv.style.cursor = hit ? (hit.mode === 'phoneBoundary' || hit.mode === 'phoneAnticipation' ? 'ew-resize' : hit.mode === 'phoneCrossfade' ? 'col-resize' : 'pointer')
      : (this._hoverCursor ? this._hoverCursor(p) : '');
    if (hit) {
      var durMs = Math.round((hit.block.phone.t1 - hit.block.phone.t0) * 1000);
      var antMs = Math.round(hit.block.phone.anticipation || 0);
      var xfMs = Math.round(hit.block.phone.crossfade);
      this.cv.title = tr('phonePanel.canvas.hover', {
        phone: hit.block.phone.phone, dur: durMs, ant: antMs, xf: xfMs
      }, hit.block.phone.phone + ' · ' + durMs +
        'ms · 音头提前 ' + antMs + 'ms · 交叉 ' + xfMs + 'ms · 双击更换音素');
    } else {
      this.cv.title = defaultTitle;
    }
  };
})(typeof window !== 'undefined' ? window : global);
