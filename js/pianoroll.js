/* ==========================================================================
   NSG · 钢琴卷帘
   支持：连接处 PIT 控制点、逐音颤音、撤销重做、游标定位、音符编辑与缩放。
   ========================================================================== */
(function (root) {
  'use strict';
  var NSG = root.NSG = root.NSG || {};
  function tr(key, fallback) {
    return (NSG.I18N && NSG.I18N.t) ? NSG.I18N.t(key, null, fallback) : fallback;
  }
  var noteIdSequence = 0;
  function noteId(used) {
    var id;
    do { id = 'p' + Date.now().toString(36) + '-' + (++noteIdSequence).toString(36); } while (used[id]);
    used[id] = true;
    return id;
  }
  function noteIds(notes) {
    var used = Object.create(null);
    notes.forEach(function (n) { if (n.id) used[n.id] = true; });
    return used;
  }

  function roundBeat(v) {
    return Math.round(v * 1e6) / 1e6;
  }

  function PianoRoll(canvas, scrollbar) {
    this.cv = canvas;
    this.viewCtx = canvas.getContext('2d');
    // 静态画面先画到离屏底图上；播放时每帧只需贴底图再画播放头。
    this.base = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
    this.ctx = this.base ? this.base.getContext('2d') : this.viewCtx;
    this._raf = 0;
    this.notes = [];
    this.pit = [];
    this.sel = {};
    this._selectionAnchor = null;
    this.tool = 'select';
    this.onContextMenu = null;
    this._rightClickAction = null;
    this.snap = 0.25;
    this.forceSnap = false;
    this.relativeMotion = false;
    this.isPlaying = false;
    this.pxBeat = 88;
    this.rowH = 20;
    this.lowPitch = 40;
    this.scrollBeat = 0;
    this.velLane = 104;
    this.laneParam = 'vel';   // vel / cons / pitd / dyn
    this.pitdRange = 200;     // 音分；参数栏滚轮缩放纵向范围。
    this.kbW = 56;
    this.rulerH = 28;
    this.playPos = 0;
    this.showPitch = true;
    this.showControlPoints = true;
    this.showVibrato = true;
    this.showPhones = true;
    this.showPhonePanel = true;
    this.phoneLane = 96;
    this.undoStack = [];
    this.redoStack = [];
    this._committed = this._snapshot();
    this.ghostTracks = [];
    this.activeTrackVisible = true;
    this._ghostRev = 0;
    this.backgroundOpacity = 0.85;
    this.onChange = null;
    this.drag = null;
    this.phoneSelection = null;
    this.clip = [];
    this.clipPit = [];
    this.scrollbar = scrollbar || null;
    this._ignoreScrollLeft = null;
    this._bind();
    this.resize();
  }

  PianoRoll.prototype.setGhostTracks = function (tracks) {
    this.ghostTracks = tracks || [];
    this._ghostRev = (this._ghostRev || 0) + 1;
    this.requestDraw();
  };

  PianoRoll.prototype.setActiveTrackVisible = function (visible) {
    var next = visible !== false;
    if (this.activeTrackVisible === next) return;
    this.activeTrackVisible = next;
    this._ghostRev = (this._ghostRev || 0) + 1;
    this.requestDraw();
  };

  PianoRoll.prototype._snapshot = function () {
    return this.pit && this.pit.length ? JSON.stringify({ notes: this.notes, pit: this.pit }) : JSON.stringify(this.notes);
  };

  PianoRoll.prototype.setPit = function (pit) {
    this.pit = (pit && NSG.TUNING && NSG.TUNING.pitPoints) ? NSG.TUNING.pitPoints(pit) : [];
    this.requestDraw();
  };

  PianoRoll.prototype.setNotes = function (notes, opts) {
    opts = opts || {};
    this.notes = notes || [];
    this.pit = (opts.pit && NSG.TUNING && NSG.TUNING.pitPoints) ? NSG.TUNING.pitPoints(opts.pit) : [];
    // 兼容已保存过重复/缺失编号的旧工程；只修复身份，不改音符和调教。
    var used = noteIds(this.notes), seen = Object.create(null);
    this.notes.forEach(function (n) {
      if (typeof n.id !== 'string' || !n.id || seen[n.id]) n.id = noteId(used);
      seen[n.id] = true;
    });
    this.sel = {};
    this._selectionAnchor = null;
    this.drag = null;
    this.phoneSelection = null;
    this.undoStack = Array.isArray(opts.undoStack) ? opts.undoStack : [];
    this.redoStack = Array.isArray(opts.redoStack) ? opts.redoStack : [];
    if (!opts.preserveClip) { this.clip = []; this.clipPit = []; }
    this._committed = this._snapshot();
    if (!opts.preserveView) {
      this.playPos = 0;
      this.scrollBeat = 0;
      this.centerOn();
    }
    this.draw();
  };

  PianoRoll.prototype.centerOn = function () {
    if (!this.notes.length) return;
    var lo = 999, hi = -999, self = this;
    this.notes.forEach(function (n) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); });
    var rows = Math.max(6, Math.floor((this.gridBottom() - this.rulerH) / this.rowH));
    if (lo < this.lowPitch + 1 || hi > this.lowPitch + rows - 2) {
      this.lowPitch = Math.max(24, Math.round((lo + hi) / 2 - rows / 2));
    }
  };

  PianoRoll.prototype.resize = function () {
    /* 用 clientWidth/Height（布局尺寸）：getBoundingClientRect 会受入场动画 scale(.985) 影响，
       而 transform 结束不会触发 ResizeObserver，导致卷帘初始化后填不满边框 */
    var p = this.cv.parentNode;
    var dpr = window.devicePixelRatio || 1;
    this.w = Math.max(1, p.clientWidth);
    this.h = Math.max(1, p.clientHeight);
    this.cv.width = this.w * dpr;
    this.cv.height = this.h * dpr;
    this.cv.style.width = this.w + 'px';
    this.cv.style.height = this.h + 'px';
    if (this.base) { this.base.width = this.cv.width; this.base.height = this.cv.height; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.viewCtx !== this.ctx) this.viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.notes.length) {
      var lo = Math.min.apply(null, this.notes.map(function (n) { return n.pitch; }));
      var hi = Math.max.apply(null, this.notes.map(function (n) { return n.pitch; }));
      this.rowH = Math.max(10, Math.min(this.rowH, (this.gridBottom() - this.rulerH) / Math.max(6, hi - lo + 3)));
    }
    this.centerOn();
    this.draw();
  };

  PianoRoll.prototype.gridBottom = function () {
    return this.h - this.velLane - (this.showPhonePanel && this._drawPhoneLane ? this.phoneLane : 0);
  };
  PianoRoll.prototype.rowY = function (pitch) {
    return this.gridBottom() - (pitch - this.lowPitch + 1) * this.rowH;
  };
  PianoRoll.prototype.yPitch = function (y) {
    return Math.floor((this.gridBottom() - y) / this.rowH) + this.lowPitch;
  };
  PianoRoll.prototype.xBeat = function (x) { return (x - this.kbW) / this.pxBeat + this.scrollBeat; };
  PianoRoll.prototype.beatX = function (b) { return this.kbW + (b - this.scrollBeat) * this.pxBeat; };
  PianoRoll.prototype._snapStep = function () {
    var snap = (Number.isFinite(this.snap) && this.snap > 1e-4) ? this.snap : 0.25;
    return Math.abs(snap - 1 / 3) < 1e-3 ? 1 / 3 : snap;
  };
  PianoRoll.prototype._snapGrid = function (beat) {
    var step = this._snapStep();
    return Math.max(0, roundBeat(Math.round(beat / step) * step));
  };

  PianoRoll.prototype.setZoomX = function (pxBeat) {
    if (!Number.isFinite(pxBeat)) return;
    pxBeat = Math.max(8, Math.min(360, pxBeat));
    if (pxBeat === this.pxBeat) return;
    var centerX = this.kbW + Math.max(1, this.w - this.kbW) / 2;
    var cursorX = this.beatX(this.playPos);
    // 可见播放标尺作为缩放支点；没有可见标尺时保持当前视野中心。
    var anchorX = Number.isFinite(this.playPos) && this.playPos >= 0 && cursorX >= this.kbW && cursorX <= this.w
      ? cursorX : centerX;
    var anchorBeat = this.xBeat(anchorX);
    this.pxBeat = pxBeat;
    this.scrollBeat = Math.max(0, anchorBeat - (anchorX - this.kbW) / this.pxBeat);
    this.requestDraw();
  };

  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var ROLL_THEMES = {
    aero: {
      noteStyle: 'aero', kbStyle: 'aero', nodeStyle: 'aero',
      rowBlack: 'rgba(225,239,250,', rowWhite: 'rgba(250,254,255,', octaveLine: '#cbe0f0',
      gridBar: '#8dbde0', gridBeat: '#cbe0f0', gridSub: '#e6f1f9', barText: '#6f8ba3',
      tempoLine: 'rgba(226,97,31,.7)', tempoText: '#b04a10',
      noteRadius: 4, noteGloss: true,
      noteSelGrad: ['#fffef7', '#fff1b8', '#ffe382', '#fff3bd'],
      noteGrad: ['#f7fdff', '#d8f2ff', '#bce6fc', '#d6f2ff'],
      noteSelStroke: '#c48b1b', noteStroke: '#52a3d4',
      noteSelEdge: 'rgba(255,252,225,0.75)', noteEdge: 'rgba(230,252,255,0.75)',
      noteSelText: '#422900', noteText: '#08334e',
      slurMark: 'rgba(255,255,255,.68)', slurArc: 'rgba(20,80,120,.72)',
      wordJoinSel: 'rgba(156,102,12,.68)', wordJoin: 'rgba(28,118,172,.68)',
      bandFill: 'rgba(45,155,235,.16)', bandStroke: '#1f84c4',
      velBg: ['rgba(244,251,255,', 'rgba(222,240,252,'], velTop: '#99c2dc', velHi: 'rgba(255,255,255,.75)',
      consDash: '#82bf92',
      velBarSel: 'rgba(232,162,24,.92)', velBarCons: 'rgba(72,182,102,.88)', velBar: 'rgba(56,162,228,.85)',
      velBarHi: 'rgba(255,255,255,.75)',
      kbBg: ['#f7fbff', '#dcecf8'], kbBlackRow: '#e4f0fa',
      kbBlackGrad: ['#467498', '#234c6c', '#14334d', '#265274'], kbBlackHi: 'rgba(215,245,255,.45)',
      kbBlackStroke: '#12324c',
      kbWhiteGrad: ['#ffffff', '#f2f9ff', '#dfeffa'], kbWhiteHi: 'rgba(255,255,255,.9)', kbKeyDivider: '#c2daec',
      kbOctaveText: '#2d6488', kbBorder: '#8eb8d4',
      rulerGrad: ['#f8fdff', '#dcf1fc', '#b8e0f7', '#d6effd'],
      rulerTop: 'rgba(255,255,255,.92)', rulerBottom: '#86b4d2', rulerLabel: '#1d5578',
      rulerTickBar: '#759bb8', rulerTickBeat: '#b9cfdf', rulerBarText: '#255b7d', rulerTempoText: '#a34e12',
      btnRadius: 5,
      btnConsOn: ['#e6fbd2', '#8ad957', '#4ea622', '#78cf46'], btnVelOn: ['#cceeff', '#65bff5', '#1f86c9', '#48aef0'],
      btnOff: ['#ffffff', '#ecf7fe', '#d2e9f8', '#e4f3fc'],
      btnConsStroke: '#3d8a18', btnVelStroke: '#166da6', btnOffStroke: '#8eb8d4',
      btnTextOn: '#ffffff', btnTextOff: '#2d5e7c',
      playGlow: 'rgba(255, 110, 60, 0.32)', playLine: '#ff5232',
      playHead: ['#ffae8e', '#f25636', '#c93318'], playHeadStroke: 'rgba(255,255,255,0.85)',
      phoneCustom: '#d32f2f', phoneDefault: '#727b83',
      pitOutline: 'rgba(255, 255, 255, 0.90)', pitLine: '#2d3b48', pitCtrlLine: '#e83b74', vibLine: 'rgba(22, 148, 108, 0.88)',
      pitNodeFill: '#e83b74', pitNodeStroke: '#ffffff', pitNodeHi: 'rgba(255,255,255,.92)',
      vibBtnOn: ['#eefbe2', '#c6edab', '#9ad977'], vibBtnOff: ['#ffffff', '#edf6fc', '#d8ebf8'],
      vibBtnOnStroke: '#4b9e56', vibBtnOffStroke: '#6792ab', vibBtnText: '#255370',
      vibHandle: '#16946c', vibRateLine: '#2b6d96', vibRateDot: '#16946c'
    },
    '9x': {
      noteStyle: '9x', kbStyle: '9x', nodeStyle: '9x',
      rowBlack: 'rgba(232,232,232,', rowWhite: 'rgba(255,255,255,', octaveLine: '#808080',
      gridBar: '#808080', gridBeat: '#c0c0c0', gridSub: '#e4e4e4', barText: '#000080',
      tempoLine: '#800000', tempoText: '#800000',
      noteRadius: 0, noteGloss: false,
      noteSelGrad: ['#0000a8', '#000080', '#000080', '#000060'],
      noteGrad: ['#109898', '#008080', '#008080', '#006868'],
      noteSelStroke: '#000000', noteStroke: '#004040',
      noteSelEdge: '#8080ff', noteEdge: '#80dfdf',
      noteSelBevelLo: '#000038', noteBevelLo: '#004848',
      noteSelText: '#ffffff', noteText: '#ffffff',
      slurMark: '#ffff00', slurArc: '#000080',
      wordJoinSel: '#ffff00', wordJoin: '#000080',
      bandFill: 'rgba(0,0,128,.16)', bandStroke: '#000080',
      velBg: ['rgba(212,208,200,', 'rgba(192,192,192,'], velTop: '#808080', velHi: '#ffffff',
      consDash: '#008000',
      velBarSel: '#000080', velBarCons: '#008000', velBar: '#008080',
      velBarHi: 'rgba(255,255,255,.5)',
      kbBg: ['#c0c0c0', '#c0c0c0'], kbBlackRow: '#d4d0c8',
      kbBlackGrad: ['#444444', '#222222', '#000000', '#2b2b2b'], kbBlackHi: '#9a9a9a',
      kbBlackStroke: '#000000',
      kbWhiteGrad: ['#ffffff', '#ecece8', '#d4d0c8'], kbWhiteHi: '#ffffff', kbKeyDivider: '#808080',
      kbOctaveText: '#000080', kbBorder: '#808080',
      rulerGrad: ['#d4d0c8', '#c0c0c0', '#c0c0c0', '#b8b8b8'],
      rulerTop: '#ffffff', rulerBottom: '#808080', rulerLabel: '#000000',
      rulerTickBar: '#404040', rulerTickBeat: '#808080', rulerBarText: '#000000', rulerTempoText: '#800000',
      btnRadius: 0,
      btnConsOn: ['#008000', '#008000', '#006800', '#006800'], btnVelOn: ['#000080', '#000080', '#000060', '#000060'],
      btnOff: ['#dfdfdf', '#c0c0c0', '#c0c0c0', '#b0b0b0'],
      btnConsStroke: '#000000', btnVelStroke: '#000000', btnOffStroke: '#808080',
      btnTextOn: '#ffffff', btnTextOff: '#000000',
      playGlow: 'rgba(255, 0, 0, 0.2)', playLine: '#ff0000',
      playHead: ['#ff4040', '#ff0000', '#aa0000'], playHeadStroke: '#000000',
      phoneCustom: '#cc0000', phoneDefault: '#404040',
      pitOutline: 'rgba(255, 255, 255, 0.90)', pitLine: '#1a1a1a', pitCtrlLine: '#e60073', vibLine: '#d96b00',
      pitNodeFill: '#e60073', pitNodeStroke: '#000000', pitNodeHi: '#ffffff',
      vibBtnOn: ['#008000', '#008000', '#006800'], vibBtnOff: ['#dfdfdf', '#c0c0c0', '#b0b0b0'],
      vibBtnOnStroke: '#000000', vibBtnOffStroke: '#808080', vibBtnText: '#000000',
      vibHandle: '#d96b00', vibRateLine: '#000080', vibRateDot: '#000080'
    },
    cyberpunk: {
      noteStyle: 'cyberpunk', kbStyle: 'cyberpunk', nodeStyle: 'cyberpunk',
      rowBlack: 'rgba(7,10,22,', rowWhite: 'rgba(13,19,38,', octaveLine: 'rgba(0,240,255,0.42)',
      gridBar: '#22527a', gridBeat: '#163252', gridSub: '#0e1d34', barText: '#00f0ff',
      tempoLine: 'rgba(252,238,10,0.8)', tempoText: '#fcee0a',
      noteRadius: 2, noteGloss: false,
      noteSelGrad: ['#78144a', '#4d0b2f', '#380722', '#5c1039'],
      noteGrad: ['#105978', '#0a3a52', '#072a3d', '#0d4a66'],
      noteSelStroke: '#ff2a85', noteStroke: '#00f0ff',
      noteSelEdge: 'rgba(252,238,10,0.88)', noteEdge: 'rgba(0,240,255,0.88)',
      noteSelText: '#fff0f8', noteText: '#d8fbff',
      slurMark: '#fcee0a', slurArc: '#00f0ff',
      wordJoinSel: '#fcee0a', wordJoin: '#00f0ff',
      bandFill: 'rgba(0,240,255,.16)', bandStroke: '#00f0ff',
      velBg: ['rgba(10,14,28,', 'rgba(6,9,18,'], velTop: '#00f0ff', velHi: 'rgba(0,240,255,0.22)',
      consDash: '#00ffaa',
      velBarSel: '#ff2a85', velBarCons: '#00ffaa', velBar: '#00f0ff',
      velBarHi: 'rgba(255,255,255,.65)',
      kbBg: ['#0b1021', '#070b17'], kbBlackRow: '#060913',
      kbBlackGrad: ['#142038', '#091020', '#040710', '#0c1528'], kbBlackHi: 'rgba(0,240,255,.50)',
      kbBlackStroke: '#00f0ff',
      kbWhiteGrad: ['#1e2b48', '#16213a', '#10182c'], kbWhiteHi: 'rgba(0,240,255,.26)', kbKeyDivider: '#1e4668',
      kbOctaveText: '#00f0ff', kbBorder: '#1f5378',
      rulerGrad: ['#0e152b', '#0a1022', '#070c1a', '#0c1328'],
      rulerTop: 'rgba(0,240,255,.35)', rulerBottom: '#00f0ff', rulerLabel: '#fcee0a',
      rulerTickBar: '#00f0ff', rulerTickBeat: '#224b6e', rulerBarText: '#9beeff', rulerTempoText: '#fcee0a',
      btnRadius: 2,
      btnConsOn: ['#0c4738', '#08362a', '#05261d', '#0a3d2f'], btnVelOn: ['#0d455e', '#083347', '#052433', '#0a3b52'],
      btnOff: ['#151e36', '#10182b', '#0b1120', '#121a2e'],
      btnConsStroke: '#00ffaa', btnVelStroke: '#00f0ff', btnOffStroke: '#234a6b',
      btnTextOn: '#ffffff', btnTextOff: '#84c9e8',
      playGlow: 'rgba(252, 238, 10, 0.36)', playLine: '#fcee0a',
      playHead: ['#fff67a', '#fcee0a', '#d6b600'], playHeadStroke: '#050811',
      phoneCustom: '#ff2a85', phoneDefault: '#7ea2bf',
      pitOutline: 'rgba(5, 8, 18, 0.92)', pitLine: '#edf6ff', pitCtrlLine: '#ff3b9a', vibLine: '#00ff9d',
      pitNodeFill: '#ff3b9a', pitNodeStroke: '#050812', pitNodeHi: '#fff0f8',
      vibBtnOn: ['#0a3d2f', '#072b21', '#0d4737'], vibBtnOff: ['#161f38', '#10172b', '#0c1222'],
      vibBtnOnStroke: '#00ffaa', vibBtnOffStroke: '#265378', vibBtnText: '#9aeaff',
      vibHandle: '#00ff9d', vibRateLine: '#00f0ff', vibRateDot: '#fcee0a'
    },
    xp: {
      noteStyle: 'xp', kbStyle: 'xp', nodeStyle: 'xp',
      rowBlack: 'rgba(235,241,250,', rowWhite: 'rgba(255,255,255,', octaveLine: '#8aa8d8',
      gridBar: '#85a3d4', gridBeat: '#c8d6ee', gridSub: '#e7edf8', barText: '#003c99',
      tempoLine: '#d8371c', tempoText: '#b82810',
      noteRadius: 3, noteGloss: false,
      noteSelGrad: ['#ffefb3', '#ffd666', '#f2a418', '#ffcb4d'],
      noteGrad: ['#9ec8ff', '#5c9df5', '#2a72dc', '#4b8cf0'],
      noteSelStroke: '#9e5800', noteStroke: '#003c99',
      noteSelEdge: 'rgba(255,250,224,0.85)', noteEdge: 'rgba(225,242,255,0.8)',
      noteSelText: '#2c1500', noteText: '#ffffff',
      slurMark: '#ffe066', slurArc: '#003c99',
      wordJoinSel: '#9e5800', wordJoin: '#0054e3',
      bandFill: 'rgba(36,104,223,.18)', bandStroke: '#0054e3',
      velBg: ['rgba(245,244,234,', 'rgba(232,229,214,'], velTop: '#aca899', velHi: '#ffffff',
      consDash: '#2d8718',
      velBarSel: '#e59700', velBarCons: '#3aa823', velBar: '#2468df',
      velBarHi: 'rgba(255,255,255,.65)',
      kbBg: ['#ece9d8', '#e2dfd0'], kbBlackRow: '#e3e8f2',
      kbBlackGrad: ['#4b5e7a', '#283850', '#162235', '#2e405b'], kbBlackHi: 'rgba(210,232,255,.42)',
      kbBlackStroke: '#121d2e',
      kbWhiteGrad: ['#ffffff', '#f7f8fc', '#e8edf7'], kbWhiteHi: '#ffffff', kbKeyDivider: '#c2cde0',
      kbOctaveText: '#0054e3', kbBorder: '#7f9db9',
      rulerGrad: ['#ffffff', '#ece9d8', '#dcd8c6', '#e6e3d3'],
      rulerTop: '#ffffff', rulerBottom: '#aca899', rulerLabel: '#003c74',
      rulerTickBar: '#5c78a3', rulerTickBeat: '#aca899', rulerBarText: '#003c74', rulerTempoText: '#c83418',
      btnRadius: 3,
      btnConsOn: ['#78db56', '#46b32c', '#2d8718', '#5cc43e'], btnVelOn: ['#6aa6f8', '#2a72dc', '#104bb5', '#3e84ea'],
      btnOff: ['#ffffff', '#f3f2eb', '#e2dfd5', '#ece9dc'],
      btnConsStroke: '#1e5c0f', btnVelStroke: '#003c74', btnOffStroke: '#7f9db9',
      btnTextOn: '#ffffff', btnTextOff: '#003c74',
      playGlow: 'rgba(224, 67, 40, 0.25)', playLine: '#e04328',
      playHead: ['#ff856d', '#e04328', '#b0240e'], playHeadStroke: '#ffffff',
      phoneCustom: '#d8371c', phoneDefault: '#5a6b82',
      pitOutline: 'rgba(255, 255, 255, 0.90)', pitLine: '#242e3b', pitCtrlLine: '#e02878', vibLine: '#238c18',
      pitNodeFill: '#e02878', pitNodeStroke: '#ffffff', pitNodeHi: '#fff0f6',
      vibBtnOn: ['#78db56', '#46b32c', '#2d8718'], vibBtnOff: ['#ffffff', '#f3f2eb', '#e2dfd5'],
      vibBtnOnStroke: '#1e5c0f', vibBtnOffStroke: '#7f9db9', vibBtnText: '#003c74', vibBtnOnText: '#ffffff',
      vibHandle: '#238c18', vibRateLine: '#0054e3', vibRateDot: '#0054e3'
    },
    pixel: {
      noteStyle: 'pixel', kbStyle: 'pixel', nodeStyle: 'pixel',
      rowBlack: 'rgba(10,4,22,', rowWhite: 'rgba(19,9,38,', octaveLine: '#ff2e97',
      gridBar: '#d62483', gridBeat: '#4a217a', gridSub: '#271247', barText: '#ffd319',
      tempoLine: '#ff7b29', tempoText: '#ffd319',
      noteRadius: 0, noteGloss: false,
      noteSelGrad: ['#ffe042', '#ff7b29', '#ff2e97', '#c4146b'],
      noteGrad: ['#7afcf0', '#00f5d4', '#00a89b', '#007d78'],
      noteSelStroke: '#fff7a8', noteStroke: '#9afff0',
      noteSelEdge: '#ffffff', noteEdge: '#d4fff9',
      noteSelBevelLo: '#7a093f', noteBevelLo: '#005450',
      noteSelText: '#ffffff', noteText: '#041417',
      slurMark: '#ffd319', slurArc: '#00f5d4',
      wordJoinSel: '#ffd319', wordJoin: '#ff2e97',
      bandFill: 'rgba(255,46,151,.25)', bandStroke: '#ff2e97',
      velBg: ['rgba(12,5,26,', 'rgba(6,2,14,'], velTop: '#ff2e97', velHi: '#00f5d4',
      consDash: '#48ff7b',
      velBarSel: '#ffd319', velBarCons: '#48ff7b', velBar: '#00f5d4',
      velBarHi: 'rgba(255,255,255,.75)',
      kbBg: ['#14092e', '#0a041a'], kbBlackRow: '#080314',
      kbBlackGrad: ['#321661', '#1a0a36', '#0a0317', '#230d47'], kbBlackHi: 'rgba(255,46,151,.65)',
      kbBlackStroke: '#ff2e97',
      kbWhiteGrad: ['#331a63', '#25124a', '#190a36'], kbWhiteHi: 'rgba(0,245,212,.45)', kbKeyDivider: '#58289e',
      kbOctaveText: '#ffd319', kbBorder: '#ff2e97',
      rulerGrad: ['#291152', '#1b0b38', '#110626', '#210e42'],
      rulerTop: '#00f5d4', rulerBottom: '#ff2e97', rulerLabel: '#ffd319',
      rulerTickBar: '#ff2e97', rulerTickBeat: '#5c2d96', rulerBarText: '#00f5d4', rulerTempoText: '#ff7b29',
      btnRadius: 0,
      btnConsOn: ['#48ff7b', '#22c956', '#108f38', '#1cb04a'], btnVelOn: ['#ff2e97', '#c91872', '#940d52', '#b31466'],
      btnOff: ['#241147', '#1a0b36', '#110626', '#180a30'],
      btnConsStroke: '#48ff7b', btnVelStroke: '#ff2e97', btnOffStroke: '#783dc4',
      btnTextOn: '#ffffff', btnTextOff: '#ead9ff',
      playGlow: 'rgba(255, 211, 25, 0.48)', playLine: '#ffd319',
      playHead: ['#fff79e', '#ffd319', '#ff7b29'], playHeadStroke: '#05010c',
      phoneCustom: '#ff2e97', phoneDefault: '#b594ff',
      pitOutline: 'rgba(5, 1, 12, 0.95)', pitLine: '#f4eeff', pitCtrlLine: '#e070ff', vibLine: '#48ff7b',
      pitNodeFill: '#e070ff', pitNodeStroke: '#05010c', pitNodeHi: '#ffffff',
      vibBtnOn: ['#1b8f42', '#12662e', '#1a803b'], vibBtnOff: ['#241147', '#180a30', '#100521'],
      vibBtnOnStroke: '#48ff7b', vibBtnOffStroke: '#783dc4', vibBtnText: '#ead9ff', vibBtnOnText: '#ffffff',
      vibHandle: '#48ff7b', vibRateLine: '#00f5d4', vibRateDot: '#ffd319'
    },
    modern: {
      noteStyle: 'modern', kbStyle: 'modern', nodeStyle: 'modern',
      rowBlack: 'rgba(243,237,247,', rowWhite: 'rgba(254,247,255,', octaveLine: '#cac4d0',
      gridBar: '#b6a8c8', gridBeat: '#e6e0e9', gridSub: '#f3edf7', barText: '#49454f',
      tempoLine: '#b3261e', tempoText: '#b3261e',
      noteRadius: 6, noteGloss: false,
      noteSelGrad: ['#7f67be', '#6750a4', '#6750a4', '#553d91'],
      noteGrad: ['#efe6ff', '#eaddff', '#e2d2fc', '#eaddff'],
      noteSelStroke: '#4f378b', noteStroke: '#9a82db',
      noteSelEdge: 'rgba(255,255,255,0.28)', noteEdge: 'rgba(255,255,255,0.65)',
      noteSelText: '#ffffff', noteText: '#21005d',
      slurMark: '#7d5260', slurArc: '#6750a4',
      wordJoinSel: '#eaddff', wordJoin: '#6750a4',
      bandFill: 'rgba(103,80,164,.14)', bandStroke: '#6750a4',
      velBg: ['rgba(247,242,250,', 'rgba(236,230,240,'], velTop: '#cac4d0', velHi: '#fef7ff',
      consDash: '#006a6a',
      velBarSel: '#b3261e', velBarCons: '#006a6a', velBar: '#6750a4',
      velBarHi: 'rgba(255,255,255,.45)',
      kbBg: ['#f3edf7', '#ece6f0'], kbBlackRow: '#ede7f3',
      kbBlackGrad: ['#49454f', '#36323c', '#2b2831', '#3d3944'], kbBlackHi: 'rgba(255,255,255,.16)',
      kbBlackStroke: '#2b2831',
      kbWhiteGrad: ['#fef7ff', '#f7f2fa', '#efe9f5'], kbWhiteHi: '#ffffff', kbKeyDivider: '#dad3e2',
      kbOctaveText: '#6750a4', kbBorder: '#cac4d0',
      rulerGrad: ['#f7f2fa', '#f3edf7', '#ece6f0', '#f3edf7'],
      rulerTop: '#fef7ff', rulerBottom: '#cac4d0', rulerLabel: '#49454f',
      rulerTickBar: '#79747e', rulerTickBeat: '#cac4d0', rulerBarText: '#1d1b20', rulerTempoText: '#b3261e',
      btnRadius: 8,
      btnConsOn: ['#cce8e7', '#bfe0df', '#b4d8d7', '#bfe0df'], btnVelOn: ['#eaddff', '#e2d2fc', '#d9c5fa', '#e2d2fc'],
      btnOff: ['#fef7ff', '#f3edf7', '#ece6f0', '#f3edf7'],
      btnConsStroke: '#006a6a', btnVelStroke: '#6750a4', btnOffStroke: '#cac4d0',
      btnTextOn: '#21005d', btnTextOff: '#49454f',
      playGlow: 'rgba(179, 38, 30, 0.22)', playLine: '#b3261e',
      playHead: ['#e46962', '#b3261e', '#8c1d18'], playHeadStroke: '#fef7ff',
      phoneCustom: '#b3261e', phoneDefault: '#625b71',
      pitOutline: 'rgba(254, 247, 255, 0.90)', pitLine: '#2d2936', pitCtrlLine: '#d83878', vibLine: 'rgba(0, 122, 122, 0.88)',
      pitNodeFill: '#d83878', pitNodeStroke: '#fef7ff', pitNodeHi: '#fef7ff',
      vibBtnOn: ['#eaddff', '#e2d2fc', '#d9c5fa'], vibBtnOff: ['#fef7ff', '#f3edf7', '#ece6f0'],
      vibBtnOnStroke: '#6750a4', vibBtnOffStroke: '#cac4d0', vibBtnText: '#49454f', vibBtnOnText: '#21005d',
      vibHandle: '#007a7a', vibRateLine: '#6750a4', vibRateDot: '#6750a4'
    }
  };
  PianoRoll.prototype._themePalette = function () {
    var id = this.theme || NSG.theme || 'aero';
    if (id === 'modern' && NSG.modernPalette && NSG.modernPalette.roll) {
      return NSG.modernPalette.roll;
    }
    if (NSG.schemePalettes && NSG.schemePalettes[id] && NSG.schemePalettes[id].roll) {
      return NSG.schemePalettes[id].roll;
    }
    return ROLL_THEMES[id] || ROLL_THEMES.aero;
  };

  function parseRollColor(str) {
    if (!str || typeof str !== 'string') return null;
    var s = str.trim();
    var mHex6 = /^#([0-9a-f]{6})$/i.exec(s);
    if (mHex6) {
      var n6 = parseInt(mHex6[1], 16);
      return { r: (n6 >> 16) & 255, g: (n6 >> 8) & 255, b: n6 & 255, a: 1, rgba: false };
    }
    var mHex3 = /^#([0-9a-f]{3})$/i.exec(s);
    if (mHex3) {
      var h3 = mHex3[1];
      return {
        r: parseInt(h3[0] + h3[0], 16),
        g: parseInt(h3[1] + h3[1], 16),
        b: parseInt(h3[2] + h3[2], 16),
        a: 1,
        rgba: false
      };
    }
    var mRgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(s);
    if (mRgb) {
      return {
        r: Math.max(0, Math.min(255, +mRgb[1])),
        g: Math.max(0, Math.min(255, +mRgb[2])),
        b: Math.max(0, Math.min(255, +mRgb[3])),
        a: mRgb[4] !== undefined ? Math.max(0, Math.min(1, +mRgb[4])) : 1,
        rgba: mRgb[4] !== undefined || /^rgba/i.test(s)
      };
    }
    return null;
  }

  function rollRgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return [h, s, l];
  }

  function rollHslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    l = l < 0 ? 0 : l > 1 ? 1 : l;
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var hk = h / 360;
    function conv(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [
      Math.round(conv(hk + 1 / 3) * 255),
      Math.round(conv(hk) * 255),
      Math.round(conv(hk - 1 / 3) * 255)
    ];
  }

  function formatRollColor(r, g, b, a, rgba) {
    if (rgba) return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    function hx(x) {
      var s = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + hx(r) + hx(g) + hx(b);
  }

  function shiftRollColor(str, deltaHue, satBoost) {
    var c = parseRollColor(str);
    if (!c) return str;
    var hsl = rollRgbToHsl(c.r, c.g, c.b);
    if (hsl[1] < 0.025) return str;
    var nh = (hsl[0] + deltaHue + 360) % 360;
    var ns = hsl[1];
    if (satBoost && ns < 0.45) ns = Math.min(0.92, ns + satBoost);
    else if (satBoost) ns = Math.min(1, ns * 1.05);
    var rgb = rollHslToRgb(nh, ns, hsl[2]);
    return formatRollColor(rgb[0], rgb[1], rgb[2], c.a, c.rgba);
  }

  function rollHueDist(a, b) {
    return Math.abs(((a - b) % 360 + 540) % 360 - 180);
  }

  function rollColorHue(str, fallbackHue) {
    var c = parseRollColor(str);
    if (!c) return fallbackHue;
    var hsl = rollRgbToHsl(c.r, c.g, c.b);
    return hsl[1] >= 0.025 ? hsl[0] : fallbackHue;
  }

  /* 异种语言副音符配色：基于当前主题/配色的音符主色做适度邻近色相偏转（约 34°），
     自动避开选中态与颤音曲线色相，无需逐套主题手写副音符颜色，且保持主题视觉统一。 */
  PianoRoll.prototype._altNotePalette = function (T) {
    var baseT = T || this._themePalette();
    if (baseT._altNoteCache) return baseT._altNoteCache;
    var hNote = rollColorHue(baseT.noteGrad && (baseT.noteGrad[1] || baseT.noteGrad[0]), -1);
    if (hNote < 0) hNote = rollColorHue(baseT.noteStroke, 200);
    var hSel = rollColorHue(baseT.noteSelGrad && (baseT.noteSelGrad[1] || baseT.noteSelGrad[0]), -1);
    if (hSel < 0) hSel = rollColorHue(baseT.noteSelStroke, (hNote + 150) % 360);
    var hVib = rollColorHue(baseT.vibLine || baseT.vibHandle, (hNote + 120) % 360);

    var step = 34;
    var candPlus = (hNote + step) % 360;
    var candMinus = (hNote - step + 360) % 360;
    var scorePlus = rollHueDist(candPlus, hSel) * 1.5 + rollHueDist(candPlus, hVib) * 0.6 + 0.5;
    var scoreMinus = rollHueDist(candMinus, hSel) * 1.5 + rollHueDist(candMinus, hVib) * 0.6;
    var deltaNote = scorePlus >= scoreMinus ? step : -step;
    var hAlt = (hNote + deltaNote + 360) % 360;

    var selStep = 26;
    var selPlus = (hSel + selStep) % 360;
    var selMinus = (hSel - selStep + 360) % 360;
    var selScorePlus = Math.min(rollHueDist(selPlus, hNote), rollHueDist(selPlus, hAlt));
    var selScoreMinus = Math.min(rollHueDist(selMinus, hNote), rollHueDist(selMinus, hAlt));
    var deltaSel = selScorePlus >= selScoreMinus ? selStep : -selStep;

    function mapArr(arr, d, sb) {
      return Array.isArray(arr) ? arr.map(function (c) { return shiftRollColor(c, d, sb); }) : arr;
    }

    var noteGrad = mapArr(baseT.noteGrad, deltaNote, 0.08);
    var noteSelGrad = mapArr(baseT.noteSelGrad, deltaSel, 0.05);
    var noteStroke = shiftRollColor(baseT.noteStroke, deltaNote, 0.08);
    var noteSelStroke = shiftRollColor(baseT.noteSelStroke, deltaSel, 0.05);
    var noteText = shiftRollColor(baseT.noteText, deltaNote, 0.04);
    var noteSelText = shiftRollColor(baseT.noteSelText, deltaSel, 0.04);

    var alt = {
      noteGrad: noteGrad,
      noteSelGrad: noteSelGrad,
      noteStroke: noteStroke,
      noteSelStroke: noteSelStroke,
      noteEdge: shiftRollColor(baseT.noteEdge, deltaNote, 0.06),
      noteSelEdge: shiftRollColor(baseT.noteSelEdge, deltaSel, 0.05),
      noteBevelLo: baseT.noteBevelLo ? shiftRollColor(baseT.noteBevelLo, deltaNote, 0.06) : undefined,
      noteSelBevelLo: baseT.noteSelBevelLo ? shiftRollColor(baseT.noteSelBevelLo, deltaSel, 0.05) : undefined,
      noteNeonBar: baseT.noteNeonBar ? shiftRollColor(baseT.noteNeonBar, deltaNote, 0.08) : undefined,
      noteSelNeonBar: baseT.noteSelNeonBar ? shiftRollColor(baseT.noteSelNeonBar, deltaSel, 0.06) : undefined,
      noteText: noteText,
      noteSelText: noteSelText,
      wordJoin: shiftRollColor(baseT.wordJoin, deltaNote, 0.08),
      wordJoinSel: shiftRollColor(baseT.wordJoinSel, deltaSel, 0.05),
      badgeBg: (noteGrad && (noteGrad[2] || noteGrad[1])) || noteStroke,
      badgeStroke: noteStroke,
      badgeText: noteText,
      badgeSelBg: (noteSelGrad && (noteSelGrad[2] || noteSelGrad[1])) || noteSelStroke,
      badgeSelStroke: noteSelStroke,
      badgeSelText: noteSelText
    };
    baseT._altNoteCache = alt;
    return alt;
  };

  PianoRoll.prototype.trackLanguage = function () {
    return this.phonemizer || this.lang || 'zh';
  };

  PianoRoll.prototype.noteLanguage = function (n) {
    if (!n) return this.trackLanguage();
    var explicitLang = n.noteLang || (n.langSource === 'note' ? n.lang : '');
    return explicitLang || this.phonemizer || n.lang || this.lang || 'zh';
  };

  PianoRoll.prototype._syncScrollbar = function () {
    if (!this.scrollbar) return;
    var width = Math.max(1, this.w - this.kbW, this.scrollbar.clientWidth || 0), end = 16;
    this.notes.forEach(function (n) { end = Math.max(end, Math.ceil((n.start + n.dur) / 4) * 4 + 4); });
    (this.ghostTracks || []).forEach(function (tr) {
      (tr.notes || []).forEach(function (n) { end = Math.max(end, Math.ceil((n.start + n.dur) / 4) * 4 + 4); });
    });
    // Keep the current view reachable when wheel scrolling beyond the last note.
    end = Math.max(end, this.scrollBeat + width / this.pxBeat);
    var prevScrollLeft = this.scrollbar.scrollLeft;
    var widthPx = Math.ceil(end * this.pxBeat) + 'px';
    if (this.scrollbar.firstElementChild.style.width !== widthPx) {
      this.scrollbar.firstElementChild.style.width = widthPx;
    }
    var left = Math.max(0, this.scrollBeat * this.pxBeat);
    if (Math.abs(this.scrollbar.scrollLeft - left) > 0.5) this.scrollbar.scrollLeft = left;
    if (this.scrollbar.scrollLeft !== prevScrollLeft) {
      this._ignoreScrollLeft = this.scrollbar.scrollLeft;
    }
  };

  /* 合并同一帧内的多次重绘请求（拖动、滚轮、滚动条），避免一次鼠标事件重画一遍整屏 */
  PianoRoll.prototype.requestDraw = function () {
    if (typeof requestAnimationFrame !== 'function') { this.draw(); return; }
    if (this._raf) return;
    var self = this;
    this._raf = requestAnimationFrame(function () { self._raf = 0; self.draw(); });
  };

  PianoRoll.prototype._sceneView = function () {
    return this.scrollBeat + ':' + this.lowPitch + ':' + this.pxBeat + ':' + this.rowH + ':' + this.w + ':' + this.h + ':' +
      (this.theme || NSG.theme || 'aero') + ':' + (NSG.themeScheme || '') + ':' + (this._ghostRev || 0) + ':' +
      (this.activeTrackVisible !== false ? '1' : '0') + ':' + this.trackLanguage();
  };

  /* 只移动播放头：视图没变就贴底图 + 画播放头，不重算音符与 PIT 曲线 */
  PianoRoll.prototype.drawCursor = function () {
    if (!this.base || this._raf || this._sceneKey !== this._sceneView()) { this.draw(); return; }
    this._present();
  };

  function fillStops(grad, stops) {
    var pos = stops.length === 3 ? [0, 0.5, 1] : stops.length === 4 ? [0, 0.48, 0.52, 1] : [0, 1];
    for (var i = 0; i < stops.length; i++) grad.addColorStop(pos[i], stops[i]);
    return grad;
  }

  PianoRoll.prototype._paintGridPatch = function (c, rx, ry, rw, rh, T) {
    var kbW = this.kbW, gridH = this.gridBottom();
    var x0 = Math.max(kbW, rx), y0 = Math.max(this.rulerH, ry);
    var x1 = Math.min(this.w, rx + rw), y1 = Math.min(gridH, ry + rh);
    if (x1 <= x0 || y1 <= y0) return;
    T = T || this._themePalette();
    var themeId = this.theme || NSG.theme;
    var bgAlpha = themeId === 'aero' ? this.backgroundOpacity : (themeId === 'cyberpunk' ? 0.85 : 1);
    c.save();
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.clearRect(x0, y0, x1 - x0, y1 - y0);
    var topP = this.yPitch(y0), botP = this.yPitch(y1);
    for (var p = botP; p <= topP; p++) {
      var py = this.rowY(p);
      c.fillStyle = (BLACK[p % 12] ? T.rowBlack : T.rowWhite) + bgAlpha + ')';
      c.fillRect(x0, py, x1 - x0, this.rowH);
      if (p % 12 === 0) { c.fillStyle = T.octaveLine; c.fillRect(x0, py + this.rowH - 1, x1 - x0, 1); }
    }
    var step = this._snapStep();
    var b0 = Math.max(0, this.xBeat(x0 - 2)), b1 = this.xBeat(x1 + 2);
    var gridPaths = [[], [], []];
    for (var k = Math.floor(b0 / step); ; k++) {
      var b = k * step;
      if (b > b1 + 1e-9) break;
      var gx = Math.round(this.beatX(b));
      if (gx < x0 - 1 || gx > x1 + 1) continue;
      var isBar = Math.abs(b / 4 - Math.round(b / 4)) < 1e-6;
      var isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      gridPaths[isBar ? 0 : isBeat ? 1 : 2].push(gx + 0.5);
    }
    [[T.gridBar, 1.4], [T.gridBeat, 1], [T.gridSub, 1]].forEach(function (style, idx) {
      if (!gridPaths[idx].length) return;
      c.strokeStyle = style[0]; c.lineWidth = style[1]; c.beginPath();
      gridPaths[idx].forEach(function (gx) { c.moveTo(gx, y0); c.lineTo(gx, y1); });
      c.stroke();
    });
    c.restore();
  };

  PianoRoll.prototype._present = function () {
    var v = this.viewCtx, T = this._themePalette();
    if (v !== this.ctx) {
      v.save(); v.setTransform(1, 0, 0, 1, 0, 0);
      v.clearRect(0, 0, this.cv.width, this.cv.height);
      v.drawImage(this.base, 0, 0);
      v.restore();
    }
    var eyeFx = this._eyeFx;
    var eyeOn = !!(eyeFx && eyeFx.active);
    if (eyeOn) eyeFx.renderUnderPlayhead(v, T);
    if (this.playPos >= 0) {
      var px2 = this.beatX(this.playPos);
      if (px2 >= this.kbW && px2 <= this.w) {
        if (!(eyeOn && eyeFx.drawCustomPlayhead && eyeFx.drawCustomPlayhead(v, T, px2))) {
          v.strokeStyle = T.playGlow; v.lineWidth = 5;
          v.beginPath(); v.moveTo(px2, 0); v.lineTo(px2, this.h); v.stroke();
          v.strokeStyle = T.playLine; v.lineWidth = 1.6;
          v.beginPath(); v.moveTo(px2, 0); v.lineTo(px2, this.h); v.stroke();
          var pHead = fillStops(v.createLinearGradient(0, 0, 0, 18), T.playHead);
          v.fillStyle = pHead; v.beginPath(); v.moveTo(px2 - 6.5, 0); v.lineTo(px2 + 6.5, 0); v.lineTo(px2 + 6.5, 11); v.lineTo(px2, 18); v.lineTo(px2 - 6.5, 11); v.closePath(); v.fill();
          v.strokeStyle = T.playHeadStroke; v.lineWidth = 1; v.stroke();
        }
      }
    }
    if (eyeOn) eyeFx.renderOverPlayhead(v, T);
  };

  PianoRoll.prototype.draw = function () {
    if (this._raf && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(this._raf); this._raf = 0; }
    this._syncScrollbar();
    var c = this.ctx, w = this.w, h = this.h, self = this, T = this._themePalette();
    var kbW = this.kbW;
    var gridH = this.gridBottom();
    // 本帧内音素化只做一次，音符与 PIT 曲线共用
    this._frameNotes = this._phonemizedNotes();
    c.clearRect(0, 0, w, h);
    c.save(); c.beginPath(); c.rect(kbW, this.rulerH, Math.max(0, w - kbW), Math.max(0, gridH - this.rulerH)); c.clip();

    // 行背景
    var themeId = this.theme || NSG.theme;
    var bgAlpha = themeId === 'aero' ? this.backgroundOpacity : (themeId === 'cyberpunk' ? 0.85 : 1);
    var top = this.yPitch(0), bot = this.yPitch(gridH);
    for (var p = bot; p <= top; p++) {
      var y = this.rowY(p);
      var isBlack = BLACK[p % 12];
      c.fillStyle = (isBlack ? T.rowBlack : T.rowWhite) + bgAlpha + ')';
      c.fillRect(kbW, y, w - kbW, this.rowH);
      if (p % 12 === 0) { c.fillStyle = T.octaveLine; c.fillRect(kbW, y + this.rowH - 1, w - kbW, 1); }
    }
    // 网格
    // 同一种线合成一条路径一次描完，缩小时线条上百根也不卡
    var step = this._snapStep();
    var b0 = Math.floor(this.scrollBeat), b1 = this.xBeat(w);
    var gridPaths = [[], [], []];
    for (var k = Math.floor(b0 / step); ; k++) {
      var b = k * step;
      if (b > b1 + 1e-9) break;
      var x = Math.round(this.beatX(b));
      if (x < kbW - 0.5) continue;
      var isBar = Math.abs(b / 4 - Math.round(b / 4)) < 1e-6;
      var isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      gridPaths[isBar ? 0 : isBeat ? 1 : 2].push(x + 0.5);
    }
    [[T.gridBar, 1.4], [T.gridBeat, 1], [T.gridSub, 1]].forEach(function (style, k) {
      if (!gridPaths[k].length) return;
      c.strokeStyle = style[0]; c.lineWidth = style[1]; c.beginPath();
      gridPaths[k].forEach(function (gx) { c.moveTo(gx, 0); c.lineTo(gx, gridH); });
      c.stroke();
    });
    // 小节号
    c.fillStyle = T.barText; c.font = '10px Tahoma, sans-serif';
    for (var bb = Math.floor(b0 / 4) * 4; bb <= b1; bb += 4) {
      var xx = this.beatX(bb);
      if (xx >= kbW - 0.5) c.fillText((bb / 4 + 1) + '', xx + 3, 12);   // 第 1 小节贴着键边，也要编号
    }
    // 速度变化点：虚线 + 速度值（分段 BPM 一眼能看到在哪一拍变）
    if (this.tempos && this.tempos.length > 1) {
      for (var ti = 1; ti < this.tempos.length; ti++) {
        var tb = this.tempos[ti].beat;
        if (tb < b0 - 0.01 || tb > b1 + 0.01) continue;
        var tx = this.beatX(tb);
        if (tx < kbW - 0.5) continue;
        c.strokeStyle = T.tempoLine;
        c.setLineDash([4, 4]); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(tx + 0.5, 0); c.lineTo(tx + 0.5, gridH); c.stroke();
        c.setLineDash([]);
        c.fillStyle = T.tempoText; c.font = 'bold 9px Consolas, monospace';
        c.fillText('♩=' + Math.round(this.tempos[ti].bpm), tx + 3, 22);
      }
    }
    // 其他可见音层的淡色背景音符（类似 MidiEditor / PS 底层参考）
    if (this.ghostTracks && this.ghostTracks.length) {
      this.ghostTracks.forEach(function (gt) {
        var gColor = gt.color || '#6a9ab8';
        c.save();
        (gt.notes || []).forEach(function (gn) {
          var gx = self.beatX(gn.start), gy = self.rowY(gn.pitch);
          var gwd = Math.max(6, gn.dur * self.pxBeat);
          if (gx > w || gx + gwd < kbW) return;
          c.globalAlpha = 0.24;
          c.fillStyle = gColor;
          if (T.noteRadius > 0) {
            roundRect(c, gx + 0.5, gy + 1, gwd - 1, self.rowH - 2, T.noteRadius);
          } else {
            c.beginPath(); c.rect(gx + 0.5, gy + 1, gwd - 1, self.rowH - 2);
          }
          c.fill();
          c.globalAlpha = 0.55;
          c.strokeStyle = gColor;
          c.lineWidth = 1;
          c.stroke();
          if (gwd > 22) {
            c.globalAlpha = 0.62;
            c.fillStyle = T.noteText;
            c.font = Math.min(11, self.rowH - 5) + 'px Tahoma, "Microsoft YaHei", sans-serif';
            c.save();
            c.beginPath(); c.rect(gx + 3, gy + 1, gwd - 5, self.rowH - 2); c.clip();
            c.fillText(String(gn.lyric || 'a').replace(/\s*\[[^\]]*\]/g, ''), gx + 4, gy + self.rowH - 3);
            c.restore();
          }
        });
        c.restore();
      });
    }
    // 音符（按起点排序）
    var drawList = this.activeTrackVisible === false ? [] : this.notes.slice().sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
    var resolved = {};
    this._frameNotes.forEach(function (n) { resolved[n.id] = n; });
    var noteStyle = T.noteStyle || themeId || 'aero';
    var altT = this._altNotePalette(T);
    var trackLang = this.trackLanguage();
    var prevNoteLang = trackLang;
    var noteLangMap = Object.create(null);
    var firstForeignLangMap = Object.create(null);
    drawList.forEach(function (n) {
      var r = resolved[n.id];
      var nLang = (r && r.lang) || self.noteLanguage(n);
      noteLangMap[n.id] = nLang;
      if (nLang !== trackLang && nLang !== prevNoteLang) {
        firstForeignLangMap[n.id] = nLang;
      }
      prevNoteLang = nLang;
    });
    drawList.forEach(function (n) {
      var x = self.beatX(n.start), y = self.rowY(n.pitch);
      if (x > w || x + Math.max(6, n.dur * self.pxBeat) < kbW) return;   // 视口外的音符不画
      var isSlur = !!(resolved[n.id] || n).slur;
      var wd = Math.max(6, n.dur * self.pxBeat);
      var selected = !!self.sel[n.id];
      var isForeignLang = noteLangMap[n.id] !== trackLang;
      var NP = isForeignLang ? altT : T;
      var nx = noteStyle === '9x' || noteStyle === 'pixel' ? Math.round(x) + 0.5 : x + 0.5;
      var ny = Math.round(y) + 1;
      var nw = noteStyle === '9x' || noteStyle === 'pixel' ? Math.max(5, Math.round(wd) - 1) : wd - 1;
      var nh = Math.max(4, self.rowH - 2);
      var grd = fillStops(c.createLinearGradient(0, y, 0, y + self.rowH), selected ? NP.noteSelGrad : NP.noteGrad);
      c.fillStyle = grd;
      if (T.noteRadius > 0) {
        roundRect(c, nx, ny, nw, nh, T.noteRadius);
      } else {
        c.beginPath(); c.rect(nx, ny, nw, nh);
      }
      c.fill();
      c.strokeStyle = selected ? NP.noteSelStroke : NP.noteStroke;
      c.lineWidth = 1;
      c.stroke();
      if (noteStyle === 'aero' || T.noteGloss) {
        // Frutiger Aero 浅色水晶凝胶高光：上半截通透弧光 + 顶边纯白亮线 + 底部内折射亮边
        c.fillStyle = 'rgba(255,255,255,0.52)';
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 2), Math.max(2, self.rowH * 0.45 - 1.5));
        c.fillStyle = 'rgba(255,255,255,0.92)';
        c.fillRect(nx + 2, ny + 1, Math.max(0, nw - 4), 1.5);
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.fillRect(nx + 2, ny + nh - 2, Math.max(0, nw - 4), 1);
      } else if (noteStyle === '9x') {
        // 9X 立体凸起斜角：左上亮边 + 右下暗边
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.fillRect(nx + 0.5, ny + 0.5, Math.max(0, nw - 1), 1);
        c.fillRect(nx + 0.5, ny + 0.5, 1, Math.max(0, nh - 1));
        c.fillStyle = selected ? (NP.noteSelBevelLo || NP.noteSelStroke) : (NP.noteBevelLo || NP.noteStroke);
        c.fillRect(nx + 0.5, ny + nh - 1.5, Math.max(0, nw - 1), 1);
        c.fillRect(nx + nw - 1.5, ny + 0.5, 1, Math.max(0, nh - 1));
      } else if (noteStyle === 'pixel') {
        // 8-bit 像素台阶高光与阴影（留出斜角像素）
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 3), 1);
        c.fillRect(nx + 1, ny + 1, 1, Math.max(0, nh - 3));
        c.fillStyle = selected ? (NP.noteSelBevelLo || NP.noteSelStroke) : (NP.noteBevelLo || NP.noteStroke);
        c.fillRect(nx + 2, ny + nh - 2, Math.max(0, nw - 3), 1);
        c.fillRect(nx + nw - 2, ny + 2, 1, Math.max(0, nh - 3));
      } else if (noteStyle === 'cyberpunk') {
        // 赛博朋克霓虹顶边灯条 + 内底边
        c.fillStyle = selected ? (NP.noteSelNeonBar || NP.noteSelEdge) : (NP.noteNeonBar || NP.noteEdge);
        c.fillRect(nx + 1.5, ny + 1, Math.max(0, nw - 3), 1.5);
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.globalAlpha = 0.35;
        c.fillRect(nx + 2, ny + nh - 2, Math.max(0, nw - 4), 1);
        c.globalAlpha = 1;
      } else if (noteStyle === 'xp') {
        // XP 光泽塑料顶沿高光 + 底沿反光
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.fillRect(nx + 1, ny + 1, Math.max(0, nw - 2), 1);
        c.fillStyle = selected ? NP.noteSelEdge : NP.noteEdge;
        c.globalAlpha = 0.45;
        c.fillRect(nx + 2, ny + nh - 2, Math.max(0, nw - 4), 1);
        c.globalAlpha = 1;
      }
      if (wd > 16) {
        c.fillStyle = selected ? NP.noteSelText : NP.noteText;
        c.font = Math.min(12, self.rowH - 4) + 'px Tahoma, "Microsoft YaHei", sans-serif';
        c.save();
        c.beginPath(); c.rect(x + 3, y + 1, wd - 5, self.rowH - 2); c.clip();
        c.fillText(String(n.lyric || 'a').replace(/\s*\[[^\]]*\]/g, ''), x + 4, y + self.rowH - 3);
        c.restore();
      }
      /* 延音符：左侧标记条 */
      if (isSlur) {
        c.save();
        c.beginPath(); c.rect(nx, ny, nw, nh); c.clip();
        c.fillStyle = T.slurMark;
        c.fillRect(nx, ny, Math.min(3, nw), nh);
        c.restore();
      }
      /* 英语拆词：底部一道虚线，表示与上一个音同属一个词 */
      if (n.wordJoin && !isSlur) {
        c.save();
        c.strokeStyle = selected ? NP.wordJoinSel : NP.wordJoin; c.lineWidth = 1;
        c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(x + 2, y + self.rowH - 2.5); c.lineTo(x + wd - 2, y + self.rowH - 2.5); c.stroke();
        c.restore();
      }

    });
    this._lastPitchInfo = null;
    if (this.activeTrackVisible !== false) this._drawTuning();
    if (this.drag && this.drag.mode === 'band') {
      c.fillStyle = T.bandFill; c.strokeStyle = T.bandStroke;
      c.fillRect(this.drag.x0, this.drag.y0, this.drag.x1 - this.drag.x0, this.drag.y1 - this.drag.y0);
      c.strokeRect(this.drag.x0, this.drag.y0, this.drag.x1 - this.drag.x0, this.drag.y1 - this.drag.y0);
    }
    // 音素与异种语言标记作为最上层叠加绘制，不被音符、调教曲线或选框盖住。
    if (this.activeTrackVisible !== false) this._drawPhones(drawList, resolved, firstForeignLangMap, altT);
    c.restore();

    // 参数窗：逐音参数与连续曲线共用时间轴。
    if (this._drawPhoneLane) this._drawPhoneLane();
    var vy = h - this.velLane, cons = this.laneParam === 'cons', barH = this.velLane - 20;
    var velBg = c.createLinearGradient(0, vy, 0, h);
    velBg.addColorStop(0, T.velBg[0] + bgAlpha + ')');
    velBg.addColorStop(1, T.velBg[1] + bgAlpha + ')');
    c.fillStyle = velBg; c.fillRect(0, vy, w, this.velLane);
    c.strokeStyle = T.velTop; c.beginPath(); c.moveTo(0, vy + 0.5); c.lineTo(w, vy + 0.5); c.stroke();
    c.fillStyle = T.velHi; c.fillRect(0, vy + 1, w, 1);
    var curveLane = this.laneParam === 'pitd' || this.laneParam === 'dyn';
    if (curveLane) this._drawParamCurve(T);
    if (!curveLane && cons) {
      // 默认 100 的参考线：线上更快更短，线下更慢更长。
      var midY = Math.round(vy + this.velLane - 6 - barH / 2) + 0.5;
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = T.consDash;
      c.beginPath(); c.moveTo(kbW, midY); c.lineTo(w, midY); c.stroke(); c.restore();
    }
    if (!curveLane && this.activeTrackVisible !== false) this.notes.forEach(function (n) {
      var x = self.beatX(n.start);
      if (x < kbW || x > w) return;
      var vh = (cons ? self.consonantSpeedOf(n) / 200 : (n.vel || 96) / 127) * barH;
      var topY = vy + self.velLane - 6 - vh;
      c.fillStyle = self.sel[n.id] ? T.velBarSel : cons ? T.velBarCons : T.velBar;
      c.fillRect(x, topY, 3.5, vh);
      c.fillStyle = T.velBarHi;
      c.fillRect(x + 0.5, topY, 1.2, Math.max(1, vh));
    });

    // 键盘
    var kbStyle = T.kbStyle || themeId || 'aero';
    c.save(); c.beginPath(); c.rect(0, this.rulerH, kbW, Math.max(0, gridH - this.rulerH)); c.clip();
    var kbBg = fillStops(c.createLinearGradient(0, 0, kbW, 0), T.kbBg);
    c.fillStyle = kbBg; c.fillRect(0, 0, kbW, gridH);
    for (var pp = bot; pp <= top; pp++) {
      var yy = this.rowY(pp);
      if (BLACK[pp % 12]) {
        c.fillStyle = T.kbBlackRow;
        c.fillRect(0, yy, kbW - 1, this.rowH - 1);
        if (T.kbKeyDivider) {
          c.fillStyle = T.kbKeyDivider;
          c.fillRect(0, yy + this.rowH - 1, kbW - 1, 1);
        }
        var bkw = kbW - 14, bkh = Math.max(2, this.rowH - 1.5);
        var bkGrad = fillStops(c.createLinearGradient(0, yy, 0, yy + this.rowH - 1), T.kbBlackGrad);
        c.fillStyle = bkGrad;
        if (kbStyle !== '9x' && kbStyle !== 'pixel' && T.btnRadius > 0) {
          roundRect(c, 0, yy + 0.5, bkw, bkh, 2);
          c.fill();
        } else {
          c.beginPath(); c.rect(0, yy + 0.5, bkw, bkh);
          c.fill();
        }
        if (kbStyle === '9x') {
          c.fillStyle = T.kbBlackHi;
          c.fillRect(0, yy + 0.5, bkw, 1);
          c.fillRect(0, yy + 0.5, 1, bkh);
          c.fillStyle = T.kbBlackStroke || '#000000';
          c.fillRect(0, yy + 0.5 + bkh - 1, bkw, 1);
          c.fillRect(bkw - 1, yy + 0.5, 1, bkh);
        } else if (kbStyle === 'pixel') {
          c.strokeStyle = T.kbBlackStroke || T.kbBorder;
          c.lineWidth = 1;
          c.strokeRect(0.5, Math.round(yy) + 0.5, bkw - 1, Math.max(2, Math.round(bkh)));
          c.fillStyle = T.kbBlackHi;
          c.fillRect(1, Math.round(yy) + 1, Math.max(0, bkw - 3), 1);
        } else if (kbStyle === 'cyberpunk') {
          c.strokeStyle = T.kbBlackStroke || T.kbBorder;
          c.lineWidth = 1;
          c.stroke();
          c.fillStyle = T.kbBlackHi;
          c.fillRect(1, yy + 1.5, Math.max(0, bkw - 3), 1.5);
        } else if (kbStyle === 'modern') {
          c.strokeStyle = T.kbBlackStroke || T.kbBorder;
          c.lineWidth = 0.8;
          c.stroke();
          c.fillStyle = T.kbBlackHi;
          c.fillRect(1, yy + 1.5, Math.max(0, bkw - 3), 1);
        } else {
          c.fillStyle = T.kbBlackHi;
          c.fillRect(1, yy + 1.5, Math.max(0, kbW - 17), Math.max(1, this.rowH * 0.35));
        }
      } else {
        var wkGrad = c.createLinearGradient(0, yy, kbW, yy);
        wkGrad.addColorStop(0, T.kbWhiteGrad[0]);
        wkGrad.addColorStop(0.75, T.kbWhiteGrad[1]);
        wkGrad.addColorStop(1, T.kbWhiteGrad[2]);
        c.fillStyle = wkGrad;
        c.fillRect(0, yy, kbW - 1, this.rowH - 1);
        c.fillStyle = T.kbWhiteHi;
        c.fillRect(0, yy, kbW - 1, 1);
        if (kbStyle === '9x') {
          c.fillRect(0, yy, 1, this.rowH - 1);
          c.fillStyle = T.kbKeyDivider || T.kbBorder;
          c.fillRect(0, yy + this.rowH - 1, kbW - 1, 1);
        } else if (T.kbKeyDivider) {
          c.fillStyle = T.kbKeyDivider;
          c.fillRect(0, yy + this.rowH - 1, kbW - 1, 1);
        }
      }
      if (pp % 12 === 0) {
        c.fillStyle = T.kbOctaveText; c.font = 'bold 9px Tahoma, sans-serif';
        c.fillText(NAMES[pp % 12] + (Math.floor(pp / 12) - 1), 3, yy + this.rowH - 3);
      }
    }
    c.strokeStyle = T.kbBorder; c.beginPath(); c.moveTo(kbW - 0.5, 0); c.lineTo(kbW - 0.5, gridH); c.stroke();
    c.restore();
    // Separate ruler and lane headers keep labels out of the editable notes.
    var rulerGrad = fillStops(c.createLinearGradient(0, 0, 0, this.rulerH), T.rulerGrad);
    c.fillStyle = rulerGrad; c.fillRect(0, 0, w, this.rulerH);
    c.fillStyle = T.rulerTop; c.fillRect(0, 0, w, 1);
    c.fillStyle = T.rulerBottom; c.fillRect(0, this.rulerH - 1, w, 1);
    c.fillStyle = T.rulerLabel; c.font = '11px Tahoma, sans-serif'; c.fillText(tr('roll.canvas.bar', '小节'), 10, 17);
    // 参数窗标签（同 VOCALOID 的参数切换）：当前参数高亮，点击切换。
    ['vel', 'cons', 'pitd', 'dyn'].forEach(function (key, i) {
      var ty = vy + 4 + i * 24, on = self.laneParam === key;
      var stops = on ? (key === 'cons' ? T.btnConsOn : T.btnVelOn) : T.btnOff;
      var btnGrad = fillStops(c.createLinearGradient(0, ty, 0, ty + 22), stops);
      c.fillStyle = btnGrad;
      if (T.btnRadius > 0) {
        roundRect(c, 3, ty, kbW - 8, 22, T.btnRadius);
      } else {
        c.beginPath(); c.rect(3, ty, kbW - 8, 22);
      }
      c.fill();
      c.strokeStyle = on ? (key === 'cons' ? T.btnConsStroke : T.btnVelStroke) : T.btnOffStroke;
      c.lineWidth = 1; c.stroke();
      c.fillStyle = on ? T.btnTextOn : T.btnTextOff; c.font = '11px Tahoma, sans-serif';
      c.fillText(key === 'cons' ? tr('roll.canvas.consSpeed', '辅音速度') : key.toUpperCase(), 7, ty + 15);
    });
    c.save(); c.beginPath(); c.rect(kbW, 0, w - kbW, this.rulerH); c.clip();
    for (var rb = Math.floor(this.scrollBeat); rb <= this.xBeat(w); rb++) {
      var rx = this.beatX(rb), bar = rb % 4 === 0;
      c.strokeStyle = bar ? T.rulerTickBar : T.rulerTickBeat; c.beginPath();
      c.moveTo(rx + 0.5, bar ? 0 : 19); c.lineTo(rx + 0.5, this.rulerH); c.stroke();
      if (bar) { c.fillStyle = T.rulerBarText; c.fillText(String(rb / 4 + 1), rx + 5, 16); }
    }
    (this.tempos || []).forEach(function (tempo) {
      var tx = self.beatX(tempo.beat);
      c.fillStyle = T.rulerTempoText; c.font = '10px Tahoma, sans-serif';
      c.fillText('♩' + Math.round(tempo.bpm), tx + 21, 17);
    });
    c.restore();
    this._frameNotes = null;
    this._sceneKey = this._sceneView();

    // 播放头画在可见画布上，底图保持干净以便播放时复用
    this._present();
    if (this.onSelectionChange) {
      var pickedNow = this.selected();
      var firstSel = pickedNow[0];
      var key = pickedNow.length + ':' + Object.keys(this.sel).join(',');
      if (firstSel) {
        var fv = firstSel.vibrato;
        key += '|' + (firstSel.lyric || '') + '|' + (firstSel.noteLang || '') + '|' + firstSel.pitch + '|' + firstSel.dur + '|' +
          firstSel.vel + '|' + firstSel.consonantSpeed + '|' + firstSel.consonantLength + '|' +
          (fv ? fv.enabled + ',' + fv.length + ',' + fv.depth + ',' + fv.rate + ',' + fv.phase + ',' + fv.fadeIn + ',' + fv.fadeOut : '') + '|' +
          (firstSel.pitchPoints ? firstSel.pitchPoints.length : 0);
      }
      if (key !== this._selectionKey) { this._selectionKey = key; this.onSelectionChange(pickedNow); }
    }
    var viewKey = this.pxBeat + ':' + this.rowH;
    if (this.onViewChange && viewKey !== this._viewKey) { this._viewKey = viewKey; this.onViewChange(); }
  };

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  PianoRoll.prototype.hit = function (mx, my) {
    var self = this;
    for (var i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      var x = this.beatX(n.start), y = this.rowY(n.pitch);
      var wd = Math.max(6, n.dur * this.pxBeat);
      if (mx >= x && mx <= x + wd && my >= y && my <= y + this.rowH) return { note: n, edge: (mx > x + wd - 6) };
    }
    return null;
  };

  PianoRoll.prototype._pos = function (e) {
    var r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  PianoRoll.prototype.selected = function () {
    var self = this;
    return this.notes.filter(function (n) { return self.sel[n.id]; });
  };
  PianoRoll.prototype._selectNote = function (note, additive, range) {
    var self = this;
    if (range) {
      // Work on a copy: imported notes need not be stored in timeline order.
      var ordered = this.notes.slice().sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
      var anchor = ordered.findIndex(function (n) { return n.id === self._selectionAnchor && self.sel[n.id]; });
      if (anchor < 0) anchor = ordered.findIndex(function (n) { return self.sel[n.id]; });
      var end = ordered.indexOf(note);
      if (anchor < 0) anchor = end;
      this._selectionAnchor = ordered[anchor].id;
      if (!additive) this.sel = {};
      for (var i = Math.min(anchor, end); i <= Math.max(anchor, end); i++) this.sel[ordered[i].id] = 1;
    } else if (additive) {
      if (this.sel[note.id]) delete this.sel[note.id];
      else this.sel[note.id] = 1;
      this._selectionAnchor = this.sel[note.id] ? note.id : null;
    } else {
      // Preserve a group when clicking a selected note to move/resize it.
      if (!this.sel[note.id]) { this.sel = {}; this.sel[note.id] = 1; }
      this._selectionAnchor = note.id;
    }
  };
  PianoRoll.prototype.seek = function (beat) {
    this.playPos = Math.max(0, beat);
    if (this.onSeek) this.onSeek(this.playPos);
    this.drawCursor();
  };
  PianoRoll.prototype.undo = function (redo) {
    var source = redo ? this.redoStack : this.undoStack, dest = redo ? this.undoStack : this.redoStack;
    while (typeof source[source.length - 1] === 'function') {
      var restore = source.pop();
      if (restore(redo)) { dest.push(restore); return; }
    }
    if (!source.length) return;
    dest.push(this._committed);
    this._committed = source.pop();
    var parsed = JSON.parse(this._committed);
    if (Array.isArray(parsed)) {
      this.notes = parsed;
      this.pit = [];
    } else {
      this.notes = parsed.notes || [];
      this.pit = parsed.pit || [];
    }
    this.sel = {}; this.drag = null;
    this._selectionAnchor = null;
    this.draw(); if (this.onChange) this.onChange(this.notes, this.pit);
  };
  PianoRoll.prototype.fit = function () {
    var end = Math.max.apply(null, [4].concat(this.notes.map(function (n) { return n.start + n.dur; })));
    this.scrollBeat = 0; this.pxBeat = Math.max(8, Math.min(160, (this.w - this.kbW - 30) / end));
    if (this.notes.length) {
      var lo = Math.min.apply(null, this.notes.map(function (n) { return n.pitch; }));
      var hi = Math.max.apply(null, this.notes.map(function (n) { return n.pitch; }));
      this.rowH = Math.max(10, Math.min(26, (this.gridBottom() - this.rulerH) / Math.max(12, hi - lo + 5)));
      this.lowPitch = Math.max(12, Math.floor((lo + hi) / 2 - (this.gridBottom() - this.rulerH) / this.rowH / 2));
    }
    this.draw();
  };
  function mixInt(h, v) {
    return Math.imul(h ^ (v | 0), 16777619) >>> 0;
  }
  function mixNum(h, v) {
    if (v === undefined || v === null) return mixInt(h, 0x9e3779b9);
    var n = +v;
    if (!Number.isFinite(n)) return mixInt(h, 0x7f4a7c15);
    var scaled = Math.round(n * 1000000);
    h = mixInt(h, scaled | 0);
    return mixInt(h, Math.floor(scaled / 4294967296) | 0);
  }
  function mixStr(h, s) {
    if (!s) return mixInt(h, 0);
    var str = String(s);
    h = mixInt(h, str.length);
    for (var i = 0; i < str.length; i++) h = mixInt(h, str.charCodeAt(i));
    return h;
  }
  function mixArr(h, arr) {
    if (!Array.isArray(arr)) return mixInt(h, -1);
    h = mixInt(h, arr.length);
    for (var i = 0; i < arr.length; i++) h = typeof arr[i] === 'number' ? mixNum(h, arr[i]) : mixStr(h, arr[i]);
    return h;
  }

  PianoRoll.prototype._notesPhoneSig = function () {
    var notes = this.notes || [];
    var h1 = 2166136261, h2 = 0x811c9dc5 ^ 0x5bd1e995;
    h1 = mixStr(h1, this.lang || 'zh'); h2 = mixStr(h2, this.phonemizer || '');
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      h1 = mixStr(h1, n.id); h2 = mixStr(h2, n.lyric);
      h1 = mixNum(h1, n.start); h2 = mixNum(h2, n.dur);
      h1 = mixStr(h1, (n.noteLang || '') + '|' + (n.langSource || '') + '|' + (n.lang || '')); h2 = mixStr(h2, n.lyricGroup || '');
      var flags = (n.slur ? 1 : 0) | (n.rest ? 2 : 0) | (n.wordJoin ? 4 : 0) |
        (n.ignorePhoneticHint ? 8 : 0) | (n.phonemeWordJoin === true ? 16 : n.phonemeWordJoin === false ? 32 : 0);
      h1 = mixInt(h1, flags); h2 = mixStr(h2, (n.wordJoinDirection || '') + '|' + (n.phonesLang || '') + '|' + (n.phonesSource || ''));
      h1 = mixNum(h1, n.consonantSpeed); h2 = mixNum(h2, n.consonantLength);
      if (n.phones) h1 = mixArr(h1, n.phones); else h1 = mixInt(h1, -1);
      if (n.slurPhones) h2 = mixArr(h2, n.slurPhones); else h2 = mixInt(h2, -1);
      var pt = n.phonemeTiming;
      if (pt) {
        h1 = mixStr(h1, pt.lang || ''); h2 = mixNum(h2, pt.span);
        h1 = mixArr(h1, pt.phones); h2 = mixArr(h2, pt.boundaries);
        h1 = mixArr(h1, pt.crossfades); h2 = mixArr(h2, pt.anticipations);
      } else {
        h1 = mixInt(h1, -2);
      }
    }
    return notes.length + ':' + h1 + ':' + h2;
  };

  PianoRoll.prototype._temposSig = function () {
    var h = mixNum(2166136261, this.tempo || 120);
    var ts = this.tempos;
    if (Array.isArray(ts)) {
      h = mixInt(h, ts.length);
      for (var i = 0; i < ts.length; i++) { h = mixNum(h, ts[i].beat); h = mixNum(h, ts[i].bpm); }
    }
    return h;
  };

  PianoRoll.prototype._notesPitchSig = function () {
    var phoneSig = this._notesPhoneSig();
    var h1 = this._temposSig(), h2 = 0x27d4eb2d;
    var notes = this.notes || [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      h1 = mixNum(h1, n.pitch); h2 = mixNum(h2, n.vib);
      h1 = mixInt(h1, n.pitchJoin === false ? 0 : 1);
      var v = n.vibrato;
      if (v) {
        h1 = mixInt(h1, v.enabled === false ? 0 : 1);
        h1 = mixNum(h1, v.length); h2 = mixNum(h2, v.depth);
        h1 = mixNum(h1, v.rate); h2 = mixNum(h2, v.phase);
        h1 = mixNum(h1, v.fadeIn); h2 = mixNum(h2, v.fadeOut);
      } else h1 = mixInt(h1, -1);
      var pps = n.pitchPoints;
      if (Array.isArray(pps)) {
        h2 = mixInt(h2, pps.length);
        for (var j = 0; j < pps.length; j++) {
          h1 = mixNum(h1, pps[j][0]); h2 = mixNum(h2, pps[j][1]); h1 = mixStr(h1, pps[j][2] || 's');
        }
      } else h2 = mixInt(h2, -1);
      var pb = n.pb;
      if (Array.isArray(pb)) {
        h1 = mixInt(h1, pb.length);
        for (var k = 0; k < pb.length; k++) { h1 = mixNum(h1, pb[k][0]); h2 = mixNum(h2, pb[k][1]); }
      }
    }
    var pit = this.pit;
    if (pit && pit.length) {
      if (pit !== this._lastPitRef) {
        this._lastPitRef = pit;
        this._pitRefId = (this._pitRefId || 0) + 1;
      }
      h1 = mixInt(h1, this._pitRefId || 1);
      h2 = mixInt(h2, pit.length);
      var step = Math.max(1, pit.length >> 5);
      for (var pi = 0; pi < pit.length; pi += step) {
        h1 = mixNum(h1, pit[pi][0]); h2 = mixNum(h2, pit[pi][1]);
      }
      var lastP = pit[pit.length - 1];
      h1 = mixNum(h1, lastP[0]); h2 = mixNum(h2, lastP[1]);
    } else {
      h1 = mixInt(h1, 0);
    }
    return phoneSig + '|' + h1 + ':' + h2;
  };

  PianoRoll.prototype._phonemizedNotes = function () {
    var sig = this._notesPhoneSig();
    if (sig !== this._cachedPhoneSig || !this._cachedPhoneNotes) {
      this._cachedPhoneSig = sig;
      this._cachedPhoneNotes = NSG.phonemizeNotes ? NSG.phonemizeNotes(this.notes, this.lang || 'zh', this.phonemizer)
        : this.notes.slice().sort(function (a, b) { return a.start - b.start; });
      this._cachedPronInfo = null;
      this._cachedPronGroups = null;
    }
    // Pronunciation is cached on runtime copies. Tuning edits do not change
    // pronunciation, but their current values must reach the displayed model.
    var byId = Object.create(null);
    this.notes.forEach(function (n) { byId[n.id] = n; });
    var fields = ['pitch', 'pitchJoin', 'pitchPoints', 'pb', 'vib', 'vibrato', 'vel', 'gain', 'gainPoints'];
    this._cachedPhoneNotes.forEach(function (resolved) {
      var source = byId[resolved.id];
      if (!source) return;
      fields.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(source, key)) resolved[key] = source[key];
        else delete resolved[key];
      });
    });
    return this._cachedPhoneNotes;
  };
  PianoRoll.prototype._drawPhones = function (drawList, resolved, firstForeignLangMap, altT) {
    var self = this, c = this.ctx, T = this._themePalette();
    var alt = altT || this._altNotePalette(T);
    var pColors = (NSG.phoneThemeColors && NSG.phoneThemeColors(this.theme || NSG.theme || 'aero')) ||
      { pairs: NSG.PHONE_COLORS, fallback: T.phoneDefault };
    this._phoneLabels = [];
    this._langBadges = [];
    var canShowPhones = !!(this.showPhones && NSG.pronunciationInfo);
    var info = null, phoneGroups = null;
    if (canShowPhones) {
      var frameNotes = this._frameNotes || this._phonemizedNotes();
      if (!this._cachedPronInfo) {
        var infoMap = {}, previous = null;
        frameNotes.forEach(function (n) {
          var item = NSG.pronunciationInfo(n, previous);
          infoMap[n.id] = item;
          previous = { phones: item.phones };
        });
        this._cachedPronInfo = infoMap;
        this._cachedPronGroups = NSG.pronunciationGroups ? NSG.pronunciationGroups(this.notes, frameNotes) : null;
      }
      info = this._cachedPronInfo;
      phoneGroups = this._cachedPronGroups;
    }
    var gridBot = this.gridBottom();
    var badgeRadius = Math.min(3, T.noteRadius || 0);
    c.save();
    var cachedStarWidth = -1;
    drawList.forEach(function (n) {
      var rawX = self.beatX(n.start);
      if (rawX > self.w) return;
      var rowTop = self.rowY(n.pitch);
      var y = rowTop - 12;
      var fLang = firstForeignLangMap && firstForeignLangMap[n.id];
      var badgeOffset = 0;
      if (fLang && rowTop < gridBot && rowTop + self.rowH > self.rulerH) {
        var tag = NSG.langShortCode ? NSG.langShortCode(fLang) : String(fLang).toUpperCase().slice(0, 5);
        var badgeFont = (tag.length >= 4 ? 'bold 8px ' : 'bold 8.5px ') + 'Consolas, Tahoma, "Microsoft YaHei", sans-serif';
        c.font = badgeFont;
        var tw = c.measureText(tag).width;
        var bw = Math.max(14, Math.ceil(tw) + 6), bh = 11;
        var bx = Math.round(rawX) + 2;
        var by = y >= self.rulerH ? Math.round(y) : Math.max(self.rulerH + 1, Math.round(rowTop) + 1);
        if (bx + bw >= self.kbW && by + bh <= gridBot) {
          var sel = !!self.sel[n.id];
          c.fillStyle = sel ? alt.badgeSelBg : alt.badgeBg;
          c.strokeStyle = sel ? alt.badgeSelStroke : alt.badgeStroke;
          c.lineWidth = 1;
          if (badgeRadius > 0) {
            roundRect(c, bx + 0.5, by + 0.5, bw - 1, bh - 1, badgeRadius);
          } else {
            c.beginPath(); c.rect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
          }
          c.fill();
          c.stroke();
          c.fillStyle = sel ? alt.badgeSelText : alt.badgeText;
          c.fillText(tag, bx + (bw - tw) / 2, by + 8.5);
          self._langBadges.push({ note: n, lang: fLang, tag: tag, x: bx, y: by, width: bw, height: bh });
        }
        if (y >= self.rulerH) badgeOffset = bw + 2;
      }
      if (!canShowPhones || !info) return;
      var item = info[n.id];
      if (!item) return;
      if (y < self.rulerH || y + 12 > gridBot) return;
      var x = rawX + 3 + badgeOffset;
      if (x > self.w) return;
      c.font = '10px Consolas, "Microsoft YaHei", monospace';
      var body = item.error ? tr('roll.canvas.invalidPhone', '? 音素无效') : (item.slur ? '‿ ' : '') + item.phones.join(' ');
      var text = (item.custom ? '*' : '') + body;
      if (x + Math.max(12, text.length * 12 + 8) < self.kbW) return;
      var starWidth = 0;
      if (item.custom) {
        if (cachedStarWidth < 0) cachedStarWidth = c.measureText('*').width;
        starWidth = cachedStarWidth;
      }
      var width = Math.max(6, starWidth + c.measureText(body).width);
      if (x + width < self.kbW) return;
      // 仅由整个卷帘视口裁切，文字及可双击区域均可超出音符长度。
      if (item.custom) { c.fillStyle = T.phoneCustom; c.fillText('*', x, y + 10); }
      var group = phoneGroups && phoneGroups[n.id];
      c.fillStyle = group && group.index >= 0 && pColors.pairs ? pColors.pairs[group.index % 2].ink : pColors.fallback;
      c.fillText(body, x + starWidth, y + 10);
      self._phoneLabels.push({ note: n, x: x, y: y, width: width, info: item, text: text });
    });
    c.restore();
  };
  PianoRoll.prototype.hitPhones = function (x, y) {
    if (!this.showPhones) return null;
    if (x < this.kbW || y < this.rulerH || y >= this.gridBottom()) return null;
    var labels = this._phoneLabels || [];
    for (var i = labels.length - 1; i >= 0; i--) {
      var p = labels[i];
      if (x >= p.x && x <= p.x + p.width && y >= p.y && y < p.y + 12) return p;
    }
    return null;
  };
  PianoRoll.prototype.editPhones = function (label) {
    var self = this, target = label.note;
    var apply = function (value) {
      if (value == null) return;
      var text = String(value).trim().replace(/^\*\s*/, ''), phones = null;
      var lang = self.noteLanguage ? self.noteLanguage(target) : (self.phonemizer || self.lang || target.lang || 'zh');
      if (text) {
        if (/^\[.*\]$/.test(text)) {
          var hint = text.slice(1, -1);
          phones = lang === 'asaxi' && NSG.asaxiPhones ? NSG.asaxiPhones(hint) :
            lang === 'en' && NSG.englishPhones ? NSG.englishPhones(hint) : null;
        } else {
          phones = text.split(/\s+/);
          if (!phones.every(function (p) { return NSG.PHONES[p] && p.indexOf('__') !== 0; })) phones = null;
        }
        if (!phones || !phones.length) {
          if (self.onPhoneError) self.onPhoneError(tr('roll.phoneInvalidMsg', '有无法识别的音素，未修改。请使用显示的音素名称，以空格分隔。'));
          return false;
        }
        target.phones = phones; target.phonesLang = lang; target.phonesSource = 'manual';
      } else {
        delete target.phones; delete target.phonesLang; delete target.phonesSource;
        // Keep the imported lyric reversible, but stop applying its bracket hint.
        if (/\[[^\]]*\]/.test(target.lyric || '')) target.ignorePhoneticHint = true;
      }
      delete target.phonemeTiming;
      self._emit();
      return true;
    };
    if (self.onEditPhones) self.onEditPhones(target, label.info, apply);
    else apply(prompt(tr('roll.promptPhones', '编辑音素（空格分隔；清空恢复自动）'), label.info.phones.join(' ')));
  };
  PianoRoll.prototype._pitchInfo = function () {
    var sig = this._notesPitchSig();
    if (sig === this._cachedPitchSig && this._cachedPitchInfo) return this._cachedPitchInfo;
    var tm = NSG.TEMPO.map({ tempo: this.tempo || 120, tempos: this.tempos }), info = {};
    var sorted = this._frameNotes || this._phonemizedNotes();
    var model = NSG.TUNING.pitchModel(sorted, this.pit);
    var spans = [];
    sorted.forEach(function (n, i) {
      var prev = sorted[i - 1], joined = NSG.TUNING.connected(prev, n), before = joined ? info[prev.id] : null;
      var start = tm.secOf(n.start), duration = tm.secOf(n.start + n.dur) - start;
      info[n.id] = { tm: tm, start: start, duration: duration,
        model: model, points: model.byId[n.id].points,
        chainStart: before ? before.chainStart : start };
      if (NSG.TUNING.hasPitch(n)) {
        var s0 = n.start - 1e-6, s1 = n.start + n.dur + 1e-6;
        if (spans.length && s0 <= spans[spans.length - 1][1]) {
          if (s1 > spans[spans.length - 1][1]) spans[spans.length - 1][1] = s1;
        } else spans.push([s0, s1]);
      }
    });
    info._model = model;
    info._pitchedSpans = spans;
    this._cachedPitchSig = sig;
    this._cachedPitchInfo = info;
    return info;
  };
  PianoRoll.prototype._yToMidi = function (y) {
    return (this.gridBottom() - y) / this.rowH + this.lowPitch - 0.5;
  };
  PianoRoll.prototype._applyPitBrush = function (b0, midi0, b1, midi1, erase, baseModel) {
    var T = NSG.TUNING;
    var lo = Math.max(0, Math.min(b0, b1)), hi = Math.max(0, Math.max(b0, b1));
    var feather = Math.min(0.02, 4 / Math.max(8, this.pxBeat));
    if (erase) {
      if (hi - lo < 1e-6) {
        var half = Math.max(0.015, 4 / Math.max(8, this.pxBeat));
        lo = Math.max(0, lo - half);
        hi = hi + half;
      }
      this.pit = T.replacePitSpan(this.pit, lo, hi, [], feather);
      return;
    }
    var step = Math.min(0.02, Math.max(0.002, 3 / Math.max(8, this.pxBeat)));
    var count = Math.max(1, Math.ceil((hi - lo) / step));
    var pts = [];
    for (var i = 0; i <= count; i++) {
      var u = count === 0 ? 0 : i / count;
      var b = Math.max(0, b0 + (b1 - b0) * u);
      var m = midi0 + (midi1 - midi0) * u;
      var base = baseModel.baseMidiAt(b);
      pts.push([b, T.clamp((m - base) * 100, -2400, 2400)]);
    }
    this.pit = T.replacePitSpan(this.pit, lo, hi, pts, feather);
  };
  PianoRoll.prototype._laneValue = function (y, key) {
    var top = this.h - this.velLane + 24, bottom = this.h - 8;
    var u = NSG.TUNING.clamp((bottom - y) / Math.max(1, bottom - top), 0, 1);
    var val = key === 'pitd' ? (u * 2 - 1) * this.pitdRange : u * 200;
    var neutral = key === 'pitd' ? 0 : 100;
    return Math.abs(val - neutral) <= (key === 'pitd' ? this.pitdRange * 0.02 : 2) ? neutral : Math.round(val);
  };
  PianoRoll.prototype._laneY = function (val, key) {
    var top = this.h - this.velLane + 24, bottom = this.h - 8;
    var u = key === 'pitd' ? (val / this.pitdRange + 1) / 2 : val / 200;
    return bottom - NSG.TUNING.clamp(u, 0, 1) * (bottom - top);
  };
  PianoRoll.prototype._drawParamCurve = function (pal) {
    var c = this.ctx, self = this, key = this.laneParam, top = this.h - this.velLane;
    var low = key === 'pitd' ? -this.pitdRange : 0, high = key === 'pitd' ? this.pitdRange : 200;
    var neutral = key === 'pitd' ? 0 : 100;
    c.save(); c.beginPath(); c.rect(this.kbW, top + 1, this.w - this.kbW, this.velLane - 1); c.clip();
    c.font = '10px Tahoma, sans-serif'; c.fillStyle = pal.btnTextOff;
    c.fillText(key === 'pitd' ? tr('roll.canvas.pitdHint', 'PITD · 相对音高（音分）· 滚轮缩放') :
      tr('roll.canvas.dynHint', 'DYN · 音量包络（%）· 100 = 原始音量'), this.kbW + 6, top + 14);
    var step = Math.max(0.25, Math.pow(2, Math.ceil(Math.log(20 / this.pxBeat) / Math.LN2)));
    for (var b = Math.ceil(this.scrollBeat / step) * step; b <= this.xBeat(this.w); b += step) {
      var x = this.beatX(b);
      c.strokeStyle = b % 4 === 0 ? pal.gridBar : pal.gridSub; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, top + 20); c.lineTo(x, this.h); c.stroke();
    }
    [high, neutral, low].forEach(function (v) {
      var y = self._laneY(v, key);
      c.strokeStyle = v === neutral ? pal.consDash : pal.gridBeat;
      c.setLineDash(v === neutral ? [4, 3] : []);
      c.beginPath(); c.moveTo(self.kbW, y); c.lineTo(self.w, y); c.stroke();
      c.fillStyle = pal.btnTextOff; c.fillText(String(v), self.kbW + 3, y - 2);
    });
    c.setLineDash([]);
    // Curves can contain narrow imported peaks: include their exact knots as well as screen samples.
    var drawLine = function (from, to, knots, valueAt, color) {
      var xs = [from, to];
      for (var x = from; x < to; x += 3) xs.push(x);
      knots.forEach(function (b) { var x = self.beatX(b); if (x >= from && x <= to) xs.push(x); });
      xs.sort(function (a, b) { return a - b; });
      c.beginPath();
      xs.forEach(function (x, i) { var y = self._laneY(valueAt(self.xBeat(x)), key); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.strokeStyle = color; c.lineWidth = 1.8; c.stroke();
    };
    if (this.activeTrackVisible !== false && key === 'pitd') {
      drawLine(this.kbW, this.w, this.pit.map(function (p) { return p[0]; }), function (b) {
        return NSG.TUNING.pitAt(self.pit, b);
      }, pal.pitCtrlLine);
    } else if (this.activeTrackVisible !== false) this.notes.forEach(function (n) {
      if (!NSG.TUNING.hasPitch(n)) return;
      var from = Math.max(self.kbW, self.beatX(n.start)), to = Math.min(self.w, self.beatX(n.start + n.dur));
      if (to < from) return;
      drawLine(from, to, (n.gainPoints || []).map(function (p) { return n.start + p[0] * n.dur; }), function (b) {
        return NSG.TUNING.noteGain(n, (b - n.start) / n.dur) * 100;
      }, self.sel[n.id] ? pal.velBarSel : pal.velBar);
    });
    c.restore();
  };
  PianoRoll.prototype._applyParamBrush = function (b0, v0, b1, v1, erase, key) {
    var T = NSG.TUNING, lo = Math.max(0, Math.min(b0, b1)), hi = Math.max(0, Math.max(b0, b1));
    var feather = Math.min(0.02, 2 / Math.max(8, this.pxBeat));
    if (hi - lo < 1e-6) { var half = Math.max(0.002, 2 / this.pxBeat); lo = Math.max(0, lo - half); hi += half; }
    var valueAt = function (b) { return Math.abs(b1 - b0) < 1e-6 ? v1 : v0 + (v1 - v0) * (b - b0) / (b1 - b0); };
    if (key === 'pitd') {
      this.pit = T.replacePitSpan(this.pit, lo, hi, erase ? [] : [[lo, valueAt(lo)], [hi, valueAt(hi)]], feather);
    } else this.notes.forEach(function (n) {
      if (!T.hasPitch(n) || n.start + n.dur <= lo || n.start >= hi) return;
      var from = Math.max(lo, n.start), to = Math.min(hi, n.start + n.dur);
      var u0 = (from - n.start) / n.dur, u1 = (to - n.start) / n.dur;
      T.replaceNoteGainSpan(n, u0, u1, [[u0, erase ? 1 : valueAt(from) / 100], [u1, erase ? 1 : valueAt(to) / 100]], feather / n.dur);
      if (this.drag && this.drag.touched) this.drag.touched[n.id] = n;
    }, this);
  };
  PianoRoll.prototype.resetLaneCurve = function (key, all) {
    var T = NSG.TUNING, picked = this.selected(), list = all || !picked.length ? this.notes : picked;
    if (key === 'pitd') {
      if (all || !picked.length) this.pit = [];
      else list.forEach(function (n) { this.pit = T.replacePitSpan(this.pit, n.start, n.start + n.dur, []); }, this);
    } else if (key === 'dyn') list.forEach(function (n) { delete n.gain; delete n.gainPoints; });
    this._emit();
  };
  PianoRoll.prototype._centsAt = function (n, rel, info, withVib) {
    var T = NSG.TUNING;
    var cents = (info.model.midiAt(n.start + rel * n.dur, n.pitch) - n.pitch) * 100;
    if (withVib) {
      var time = info.tm.secOf(n.start + rel * n.dur), v = T.vibrato(n.vibrato);
      cents += T.vibCents(n, rel, info.duration, this.timbre, time - info.chainStart,
        time - info.tm.secOf(n.start + n.dur * (1 - v.length / 100)));
    }
    return cents;
  };
  function drawControlPoint(c, ptx, pty, T, nodeStyle) {
    if (nodeStyle === '9x') {
      var sx = Math.round(ptx) - 3.5, sy = Math.round(pty) - 3.5;
      c.fillStyle = T.pitNodeFill; c.fillRect(sx, sy, 7, 7);
      c.strokeStyle = T.pitNodeStroke; c.lineWidth = 1; c.strokeRect(sx, sy, 7, 7);
      c.fillStyle = T.pitNodeHi; c.fillRect(sx + 1, sy + 1, 2, 2);
      return;
    }
    if (nodeStyle === 'pixel') {
      var px = Math.round(ptx) - 3.5, py = Math.round(pty) - 3.5;
      c.fillStyle = T.pitNodeFill; c.fillRect(px, py, 7, 7);
      c.strokeStyle = T.pitNodeStroke; c.lineWidth = 1; c.strokeRect(px, py, 7, 7);
      c.fillStyle = T.pitNodeHi; c.fillRect(px + 2, py + 2, 3, 3);
      return;
    }
    if (nodeStyle === 'cyberpunk') {
      var dr = 4.6;
      c.fillStyle = T.pitNodeFill; c.strokeStyle = T.pitNodeStroke; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(ptx, pty - dr); c.lineTo(ptx + dr, pty);
      c.lineTo(ptx, pty + dr); c.lineTo(ptx - dr, pty);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = T.pitNodeHi;
      c.beginPath(); c.arc(ptx, pty, 1.3, 0, Math.PI * 2); c.fill();
      return;
    }
    if (nodeStyle === 'modern') {
      c.fillStyle = T.pitNodeFill; c.strokeStyle = T.pitNodeStroke; c.lineWidth = 1.6;
      c.beginPath(); c.arc(ptx, pty, 4.2, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = T.pitNodeHi;
      c.beginPath(); c.arc(ptx, pty, 1.5, 0, Math.PI * 2); c.fill();
      return;
    }
    c.fillStyle = T.pitNodeFill; c.strokeStyle = T.pitNodeStroke; c.lineWidth = 1.3;
    c.beginPath(); c.arc(ptx, pty, 3.9, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = T.pitNodeHi;
    c.beginPath(); c.arc(ptx - 1, pty - 1, 1.25, 0, Math.PI * 2); c.fill();
  }
  PianoRoll.prototype._drawTuning = function () {
    var self = this, c = this.ctx, info = this._pitchInfo(), T = this._themePalette();
    this._lastPitchInfo = info;
    var nodeStyle = T.nodeStyle || this.theme || NSG.theme || 'aero';
    var model = info._model || null;
    var spans = info._pitchedSpans || [];
    if (this.showPitch && this.pit && this.pit.length && spans.length && model) {
      var viewB0 = Math.max(0, this.xBeat(this.kbW)), viewB1 = this.xBeat(this.w);
      var pitArr = this.pit, bStart = Math.max(viewB0, pitArr[0][0]), bEnd = Math.min(viewB1, pitArr[pitArr.length - 1][0]);
      if (bEnd > bStart) {
        var gapStep = Math.max(0.01, 2 / Math.max(8, this.pxBeat));
        var spIdx = 0, spLen = spans.length;
        c.save();
        c.globalAlpha = 0.45;
        c.strokeStyle = T.pitLine;
        c.lineWidth = 1.4;
        c.beginPath();
        var penDown = false;
        for (var gb = bStart; gb <= bEnd + 1e-6; gb += gapStep) {
          var curB = Math.min(bEnd, gb);
          while (spIdx < spLen && spans[spIdx][1] < curB) spIdx++;
          var inside = spIdx < spLen && curB >= spans[spIdx][0] && curB <= spans[spIdx][1];
          if (inside || Math.abs(NSG.TUNING.pitAt(pitArr, curB)) <= 0.5) {
            penDown = false;
            continue;
          }
          var gx = this.beatX(curB), gy = this.rowY(model.midiAt(curB)) + this.rowH / 2;
          if (!penDown) { c.moveTo(gx, gy); penDown = true; }
          else c.lineTo(gx, gy);
        }
        c.stroke();
        c.restore();
      }
    }
    var brushMode = this.tool === 'pit';
    this.notes.forEach(function (n) {
      var x = self.beatX(n.start), width = n.dur * self.pxBeat, y = self.rowY(n.pitch) + self.rowH / 2;
      if (x + width < self.kbW || x > self.w || !NSG.TUNING.hasPitch(n)) return;
      var steps = Math.max(16, Math.min(1200, Math.ceil(width / 2)));
      var nInfo = info[n.id], v = NSG.TUNING.vibrato(n.vibrato);
      var hasVibWave = n.vibrato ? (v.enabled && v.length > 0 && v.depth > 0) : (n.vib !== 0);
      if (self.showPitch) {
        c.beginPath();
        for (var k = 0; k <= steps; k++) {
          var rel = k / steps, py = y - self._centsAt(n, rel, nInfo, !!self.showVibrato) / 100 * self.rowH;
          if (!k) c.moveTo(x, py); else c.lineTo(x + rel * width, py);
        }
        c.strokeStyle = T.pitOutline; c.lineWidth = 3.2; c.stroke();
        c.strokeStyle = T.pitLine; c.lineWidth = 1.7; c.stroke();
      }
      if (self.showVibrato && hasVibWave) {
        var vibStartRel = n.vibrato ? Math.max(0, 1 - v.length / 100) : 0;
        c.strokeStyle = T.vibLine; c.lineWidth = 1.25; c.beginPath();
        var vibStarted = false;
        for (var vk = 0; vk <= steps; vk++) {
          var vr = vibStartRel + (1 - vibStartRel) * vk / steps;
          var baseCents = (nInfo.model.baseMidiAt(n.start + vr * n.dur, n.pitch) - n.pitch) * 100;
          var vTime = nInfo.tm.secOf(n.start + vr * n.dur);
          var vc = NSG.TUNING.vibCents(n, vr, nInfo.duration, self.timbre, vTime - nInfo.chainStart,
            vTime - nInfo.tm.secOf(n.start + n.dur * (1 - v.length / 100)));
          var vpy = y - (baseCents + vc) / 100 * self.rowH;
          if (!vibStarted) { c.moveTo(x + vr * width, vpy); vibStarted = true; }
          else c.lineTo(x + vr * width, vpy);
        }
        c.stroke();
      }
      if (self._hasVisibleControlPoints(n)) {
        if (brushMode) { c.save(); c.globalAlpha = 0.25; }
        var pts = self._editablePB(n, nInfo);
        if (pts.length >= 2) {
          // 仅绘制音符自身的控制点段（如前音尾到本音头的过渡），不在同音内部头尾控制点之间画连线。
          var cStart = pts[0][0], cEnd = pts[pts.length - 1][0];
          if (cEnd > cStart + 1e-6) {
            var cSteps = Math.max(12, Math.min(400, Math.ceil((cEnd - cStart) * self.pxBeat / 3)));
            c.save();
            if (!brushMode) c.globalAlpha = 0.85;
            c.beginPath();
            for (var ck = 0; ck <= cSteps; ck++) {
              var cxBeat = cStart + (cEnd - cStart) * ck / cSteps;
              var cx = x + cxBeat * self.pxBeat;
              var cy = y - NSG.TUNING.interp(pts, cxBeat) / 100 * self.rowH;
              if (!ck) c.moveTo(cx, cy); else c.lineTo(cx, cy);
            }
            c.strokeStyle = T.pitCtrlLine || T.pitNodeFill; c.lineWidth = 1.45; c.stroke();
            c.restore();
          }
        }
        pts.forEach(function (pt) {
          var ptx = x + pt[0] * self.pxBeat, pty = y - pt[1] / 100 * self.rowH;
          drawControlPoint(c, ptx, pty, T, nodeStyle);
        });
        if (brushMode) c.restore();
      }
      if (self.showVibrato) {
        if (brushMode) { c.save(); c.globalAlpha = 0.28; }
        var vy = y + self.rowH / 2 + 10, v = NSG.TUNING.vibrato(n.vibrato);
        var vibGrad = fillStops(c.createLinearGradient(0, vy - 6, 0, vy + 7),
          (n.vibrato && v.enabled) ? T.vibBtnOn : T.vibBtnOff);
        c.fillStyle = vibGrad;
        c.strokeStyle = n.vibrato && v.enabled ? T.vibBtnOnStroke : T.vibBtnOffStroke; c.lineWidth = 1;
        c.fillRect(x + width - 20, vy - 6, 19, 13); c.strokeRect(x + width - 20, vy - 6, 19, 13);
        c.fillStyle = (n.vibrato && v.enabled && T.vibBtnOnText) ? T.vibBtnOnText :
          ((n.vibrato && v.enabled && T.btnTextOn && (self.theme || NSG.theme) === '9x') ? T.btnTextOn : T.vibBtnText);
        c.font = 'bold 12px Tahoma'; c.fillText('~', x + width - 16, vy + 4);
        if (n.vibrato && v.enabled) {
          var vx = x + width * (1 - v.length / 100), dy = y - v.depth / 100 * self.rowH;
          c.strokeStyle = T.vibHandle; c.beginPath(); c.moveTo(vx, vy); c.lineTo(x + width - 23, vy); c.stroke();
          c.fillStyle = T.vibHandle; c.fillRect(vx - 4, vy - 4, 8, 8);
          c.fillRect(x + width * 0.85 - 4, dy - 4, 8, 8);
          var rate = self._vibratoRateControl(n);
          c.strokeStyle = T.vibRateLine; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(rate.x, rate.y); c.lineTo(rate.x + rate.width, rate.y); c.stroke();
          c.fillStyle = T.vibRateDot; c.beginPath();
          c.arc(rate.x + (v.rate - 1) / 11 * rate.width, rate.y, 3.8, 0, Math.PI * 2); c.fill();
          c.font = '10px Tahoma'; c.fillText(v.rate.toFixed(1) + ' Hz', rate.x + rate.width + 7, rate.y + 4);
        }
        if (brushMode) c.restore();
      }
    });
  };
  PianoRoll.prototype._vibratoRateControl = function (n) {
    var width = n.dur * this.pxBeat;
    var y = this.rowY(n.pitch) + this.rowH + 26;
    if (y > this.gridBottom() - 8) y = Math.max(this.rulerH + 8, this.rowY(n.pitch) - 16);
    return { x: this.beatX(n.start) + Math.max(0, width - 124),
      y: y,
      width: NSG.TUNING.clamp(width - 52, 24, 72) };
  };
  PianoRoll.prototype._setVibratoRate = function (n, x) {
    var control = this._vibratoRateControl(n);
    n.vibrato.rate = Math.round(NSG.TUNING.clamp(1 + (x - control.x) / control.width * 11, 1, 12) * 10) / 10;
  };
  PianoRoll.prototype._editablePB = function (n, info) {
    var pts = info ? info.points : NSG.TUNING.pitchModel(this._phonemizedNotes()).byId[n.id].points;
    return pts.map(function (p) { return p.slice(); });
  };
  PianoRoll.prototype._hasVisibleControlPoints = function (n) {
    return !!this.showControlPoints && (this.tool === 'bend' || !!(n.pitchPoints && n.pitchPoints.length) || !!(n.pb && n.pb.length) || n.pitchJoin !== false);
  };
  PianoRoll.prototype.hitPitchPoint = function (p) {
    if (!this.showControlPoints || p.x < this.kbW || p.y < this.rulerH || p.y > this.gridBottom()) return null;
    var self = this, info = this._pitchInfo(), best = null;
    this.notes.forEach(function (n) {
      if (!NSG.TUNING.hasPitch(n) || !self._hasVisibleControlPoints(n)) return;
      info[n.id].points.forEach(function (pt, index) {
        var distance = Math.hypot(p.x - self.beatX(n.start + pt[0]),
          p.y - (self.rowY(n.pitch) + self.rowH / 2 - pt[1] / 100 * self.rowH));
        if (distance <= 7 && (!best || distance < best.distance || (distance === best.distance && self.sel[n.id])))
          best = { note: n, index: index, points: info[n.id].points, distance: distance };
      });
    });
    return best;
  };
  PianoRoll.prototype.editPitchPoint = function (hit, shape, remove) {
    var n = hit && hit.note;
    if (!n || this.notes.indexOf(n) < 0) return;
    var pts = this._editablePB(n), index = hit.index;
    if (!pts[index] || (!remove && index >= pts.length - 1)) return;
    if (remove) {
      // Delete only interior points; side actions exclude the clicked point.
      var first = remove === 'left' ? 1 : remove === 'right' ? index + 1 : index;
      var end = remove === 'left' ? index : remove === 'right' ? pts.length - 1 : index + 1;
      first = Math.max(1, first); end = Math.min(pts.length - 1, end);
      if (end <= first) return;
      pts.splice(first, end - first);
    } else pts[index][2] = NSG.TUNING.pitchShape(shape, 's');
    n.pitchPoints = pts; delete n.pb;
    this._emit();
  };
  PianoRoll.prototype._tuningDown = function (p, e) {
    if (this.tool === 'pit') return false;
    var self = this, T = NSG.TUNING, selected = this.notes, info = this._pitchInfo();
    if (e.button === 2) {
      if (this.hitPitchPoint(p)) { this._rightClickAction = 'contextmenu'; return true; }
      if (this.tool !== 'bend') return false;
    }
    if (this.showVibrato && e.button === 0) {
      for (var vi = selected.length - 1; vi >= 0; vi--) {
        var vn = selected[vi], vx = this.beatX(vn.start), vw = vn.dur * this.pxBeat;
        if (!T.hasPitch(vn)) continue;
        var cy = this.rowY(vn.pitch) + this.rowH / 2, vy = cy + this.rowH / 2 + 10;
        var v = T.vibrato(vn.vibrato);
        if (Math.abs(p.y - vy) < 8 && p.x >= vx + vw - 21 && p.x <= vx + vw + 1) {
          this.sel = {}; this.sel[vn.id] = 1;
          v.enabled = !(vn.vibrato && v.enabled); vn.vibrato = v; this._emit(); return true;
        }
        if (vn.vibrato && v.enabled) {
          var lengthHit = Math.abs(p.x - (vx + vw * (1 - v.length / 100))) < 7 && Math.abs(p.y - vy) < 7;
          var depthHit = Math.abs(p.x - (vx + vw * 0.85)) < 7 && Math.abs(p.y - (cy - v.depth / 100 * this.rowH)) < 7;
          if (lengthHit || depthHit) { this.sel = {}; this.sel[vn.id] = 1; this.drag = { mode: lengthHit ? 'vibLength' : 'vibDepth', note: vn }; return true; }
          var rate = this._vibratoRateControl(vn);
          if (Math.abs(p.y - rate.y) < 7 && p.x >= rate.x - 7 && p.x <= rate.x + rate.width + 7) {
            this.sel = {}; this.sel[vn.id] = 1; vn.vibrato = v;
            this.drag = { mode: 'vibRate', note: vn };
            this._setVibratoRate(vn, p.x); this.draw(); return true;
          }
        }
      }
    }
    if (this.showVibrato && e.button === 0 && this.tool !== 'erase') {
      // Visible PIT handles take priority even where the two curves cross.
      var onPitchHandle = this.showControlPoints && selected.some(function (n) {
        if (!T.hasPitch(n) || !self._hasVisibleControlPoints(n)) return false;
        return info[n.id].points.some(function (pt) {
          return Math.hypot(p.x - self.beatX(n.start + pt[0]),
            p.y - (self.rowY(n.pitch) + self.rowH / 2 - pt[1] / 100 * self.rowH)) <= 7;
        });
      });
      if (!onPitchHandle) for (var phaseIndex = selected.length - 1; phaseIndex >= 0; phaseIndex--) {
        var phaseNote = selected[phaseIndex], phaseVib = T.vibrato(phaseNote.vibrato);
        if (!phaseNote.vibrato || !phaseVib.enabled || !phaseVib.length || !phaseVib.depth || !T.hasPitch(phaseNote)) continue;
        var phaseBeat = this.xBeat(p.x), phaseRel = (phaseBeat - phaseNote.start) / phaseNote.dur;
        if (phaseRel < 1 - phaseVib.length / 100 || phaseRel > 1) continue;
        var phaseInfo = info[phaseNote.id];
        var phaseY = this.rowY(phaseNote.pitch) + this.rowH / 2 - this._centsAt(phaseNote, phaseRel, phaseInfo, true) / 100 * this.rowH;
        var vibBaseCents = (phaseInfo.model.baseMidiAt(phaseBeat, phaseNote.pitch) - phaseNote.pitch) * 100;
        var vibTime = phaseInfo.tm.secOf(phaseBeat);
        var vibOnlyCents = vibBaseCents + T.vibCents(phaseNote, phaseRel, phaseInfo.duration, this.timbre,
          vibTime - phaseInfo.chainStart, vibTime - phaseInfo.tm.secOf(phaseNote.start + phaseNote.dur * (1 - phaseVib.length / 100)));
        var vibOnlyY = this.rowY(phaseNote.pitch) + this.rowH / 2 - vibOnlyCents / 100 * this.rowH;
        if (Math.abs(p.y - phaseY) > 6 && Math.abs(p.y - vibOnlyY) > 6) continue;
        this.sel = {}; this.sel[phaseNote.id] = 1;
        this.drag = { mode: 'vibPhase', note: phaseNote, phase: phaseVib.phase,
          time: phaseInfo.tm.secOf(phaseBeat), tm: phaseInfo.tm };
        this.draw(); return true;
      }
    }
    if (this.tool === 'erase' || !this.showControlPoints) return false;
    var list = this.notes.slice().sort(function (a, b) { return (self.sel[a.id] ? 1 : 0) - (self.sel[b.id] ? 1 : 0); });
    for (var i = list.length - 1; i >= 0; i--) {
      var n = list[i], x = this.beatX(n.start), w = n.dur * this.pxBeat;
      if (!T.hasPitch(n) || !this._hasVisibleControlPoints(n)) continue;
      var pointMin = info[n.id].points[0][0] * this.pxBeat;
      var pointMax = info[n.id].points[info[n.id].points.length - 1][0] * this.pxBeat;
      if (p.x < x + Math.min(0, pointMin) - 7 || p.x > x + Math.max(w, pointMax) + 7) continue;
      var pts = this._editablePB(n, info[n.id]), y = this.rowY(n.pitch) + this.rowH / 2;
      for (var j = 0; j < pts.length; j++) {
        if (Math.hypot(p.x - (x + pts[j][0] * this.pxBeat), p.y - (y - pts[j][1] / 100 * this.rowH)) > 7) continue;
        n.pitchPoints = pts; delete n.pb;
        this.sel = {}; this.sel[n.id] = 1;
        if (e.shiftKey) { pts[j][2] = pts[j][2] === 's' ? 'l' : 's'; this._emit(); }
        else this.drag = { mode: 'pit', note: n, index: j };
        this.draw(); return true;
      }
      var rel = T.clamp((this.xBeat(p.x) - n.start) / n.dur, 0, 1);
      var curveY = y - this._centsAt(n, rel, info[n.id], false) / 100 * this.rowH;
      var ctrlY = y - T.interp(pts, this.xBeat(p.x) - n.start) / 100 * this.rowH;
      if (this.tool === 'bend' && e.button === 0 && (Math.abs(p.y - ctrlY) < 9 || (this.showPitch && Math.abs(p.y - curveY) < 9) || (this.sel[n.id] && p.x >= x && p.x <= x + w))) {
        var owner = info[n.id].model.records.filter(function (record) {
          return record.joined && record.begin <= self.xBeat(p.x) && record.note.start > self.xBeat(p.x);
        })[0];
        if (owner) {
          // record.note 是音素化后的副本；改它不会落到乐谱里，必须换回原音符
          n = self.notes.filter(function (x) { return x.id === owner.note.id; })[0] || owner.note;
          pts = self._editablePB(n, info[n.id]); y = self.rowY(n.pitch) + self.rowH / 2;
        }
        var offset = self.xBeat(p.x) - n.start;
        pts.push([offset, Math.round(T.clamp((y - p.y) / this.rowH * 100, -2400, 2400)), 's']);
        n.pitchPoints = T.junctionPoints(pts); delete n.pb; this.sel = {}; this.sel[n.id] = 1;
        var index = n.pitchPoints.findIndex(function (pt) { return Math.abs(pt[0] - offset) < 1e-6; });
        this.drag = { mode: 'pit', note: n, index: index }; this.draw(); return true;
      }
    }
    // PIT mode never deletes a note on a missed right click.
    if (this.tool === 'bend' && e.button === 2) {
      this._rightClickAction = 'contextmenu';
      return true;
    }
    return false;
  };

  PianoRoll.prototype._bind = function () {
    var self = this, cv = this.cv;
    if (this.scrollbar) {
      this.scrollbar.addEventListener('scroll', function () {
        var cur = self.scrollbar.scrollLeft;
        // Ignore async scroll events caused by _syncScrollbar after pxBeat/scrollBeat changed.
        if (self._ignoreScrollLeft !== null && Math.abs(cur - self._ignoreScrollLeft) < 0.01) return;
        self._ignoreScrollLeft = null;
        var beat = cur / self.pxBeat;
        if (Math.abs(beat - self.scrollBeat) * self.pxBeat <= 0.5) return;
        self.scrollBeat = Math.max(0, beat);
        self.requestDraw();
      });
    }

    cv.addEventListener('mousedown', function (e) {
      self._rightClickAction = null;
      var p = self._pos(e);
      if (e.button === 1) {
        e.preventDefault();
        if (self.tool !== 'pit') {
          var pitHit = self.hitPitchPoint(p);
          if (pitHit) self.editPitchPoint(pitHit, null, true);
        }
        return;
      }
      if (self._phoneDown && self._phoneDown(p, e)) {
        if (e.button === 2) self._rightClickAction = 'contextmenu';
        return;
      }
      if (p.x < self.kbW && p.y > self.h - self.velLane && e.button === 0) {
        var laneIndex = Math.floor((p.y - (self.h - self.velLane) - 4) / 24);
        self.setLaneParam(['vel', 'cons', 'pitd', 'dyn'][laneIndex]);
        return;
      }
      if (p.x < self.kbW) {   // 键区不参与编辑
        if (e.button === 2) self._rightClickAction = 'contextmenu';
        return;
      }
      if (p.y < self.rulerH) {
        if (e.button === 0) { self.drag = { mode: 'seek' }; self.seek(self.xBeat(p.x)); }
        else if (e.button === 2) self._rightClickAction = 'contextmenu';
        return;
      }
      var beat = self.xBeat(p.x), pitch = self.yPitch(p.y);
      var snapB = self._snapGrid(beat);
      var inVel = p.y > self.h - self.velLane;
      if (!inVel && self.tool === 'pit') {
        if (e.button === 0) {
          self.showPitch = true;
          var erase = !!e.shiftKey;
          var baseModel = NSG.TUNING.pitchModel(self._phonemizedNotes());
          var b0 = Math.max(0, beat), m0 = self._yToMidi(p.y);
          self.drag = { mode: 'pitBrush', erase: erase, moved: true, baseModel: baseModel, prevBeat: b0, prevMidi: m0 };
          self._applyPitBrush(b0, m0, b0, m0, erase, baseModel);
          self.draw();
        } else if (e.button === 2) {
          var baseModel2 = NSG.TUNING.pitchModel(self._phonemizedNotes());
          self.drag = { mode: 'pitBrush', erase: true, moved: false, x0: p.x, y0: p.y, baseModel: baseModel2, prevBeat: Math.max(0, beat), prevMidi: self._yToMidi(p.y) };
        }
        return;
      }
      var hit = inVel ? null : self.hit(p.x, p.y);

      // Selection modifiers take priority over overlapping tuning handles.
      if (hit && e.button === 0 && (self.tool === 'select' || self.tool === 'pen') && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        self._selectNote(hit.note, e.ctrlKey || e.metaKey, e.shiftKey);
        self.drag = null;
        self.draw();
        return;
      }

      // The first click of a phoneme-label double click must never create/move a note.
      if (!inVel && e.button === 0 && self.hitPhones(p.x, p.y)) return;

      if (!inVel && self._tuningDown(p, e)) return;
      if (!inVel && !hit && e.button === 0 && Math.abs(p.x - self.beatX(self.playPos)) < 5) {
        self.drag = { mode: 'seek' }; self.seek(beat); return;
      }

      if (inVel) {
        if (self.laneParam === 'pitd' || self.laneParam === 'dyn') {
          if (self.activeTrackVisible === false || (e.button !== 0 && e.button !== 2)) return;
          var laneVal = self._laneValue(p.y, self.laneParam), laneBeat = Math.max(0, beat);
          self.drag = { mode: 'paramBrush', key: self.laneParam, erase: e.button === 2 || !!e.shiftKey,
            moved: e.button === 0, x0: p.x, y0: p.y, prevBeat: laneBeat, prevValue: laneVal, touched: {} };
          if (e.button === 0) { self._applyParamBrush(laneBeat, laneVal, laneBeat, laneVal, self.drag.erase, self.drag.key); self.requestDraw(); }
          return;
        }
        if (e.button === 2) { self._rightClickAction = 'contextmenu'; return; }
        var vh = self.notes.filter(function (n) { return Math.abs(self.beatX(n.start) - p.x) < 12; });
        if (vh.length) { self.drag = { mode: 'vel', list: vh }; self._applyVel(vh, p); }
        return;
      }
      if (e.button === 2) {
        if (self.tool === 'select') {
          if (hit && !self.sel[hit.note.id]) {
            self.sel = {}; self.sel[hit.note.id] = 1;
            self.draw();
            if (self.onSelectionChange) self.onSelectionChange();
          }
          self._rightClickAction = 'contextmenu';
        } else if (self.tool === 'pen' || self.tool === 'erase') {
          if (hit) {
            delete self.sel[hit.note.id];
            self.notes = self.notes.filter(function (n) { return n !== hit.note; });
            self._emit();
            self._rightClickAction = 'deleteNote';
          } else {
            self._rightClickAction = 'contextmenu';
          }
        } else {
          self._rightClickAction = 'contextmenu';
        }
        return;
      }
      if (self.tool === 'erase') {
        if (hit) { self.notes = self.notes.filter(function (n) { return n !== hit.note; }); self._emit(); }
        return;
      }
      if (self.tool === 'bend') {
        if (hit) { self.sel = {}; self.sel[hit.note.id] = 1; self.draw(); }
        return;
      }
      if (hit) {
        self._selectNote(hit.note, false, false);
        var moving = self.notes.filter(function (n) { return !!self.sel[n.id]; });
        var anchorIdx = moving.indexOf(hit.note);
        if (anchorIdx < 0) anchorIdx = 0;
        self.drag = {
          mode: hit.edge ? 'resize' : 'move',
          x0: p.x, y0: p.y, beat0: beat, moved: false, movedX: false,
          anchorIdx: anchorIdx,
          list: moving,
          orig: moving.map(function (n) { return { start: n.start, dur: n.dur, pitch: n.pitch }; })
        };
        if (self.pit.length) self.drag.pitEdit = {
          notes: self.notes.map(function (n) { return Object.assign({}, n); }),
          pit: self.pit,
          bindings: NSG.TUNING.capturePitBindings(self.notes, self.pit)
        };
        self.draw();
        return;
      }
      if (self.tool === 'pen') {
        var step = self._snapStep();
        var nn = {
          id: noteId(noteIds(self.notes)),
          start: Math.max(0, snapB), dur: Math.max(step, 1), pitch: Math.max(24, Math.min(96, pitch)),
          lyric: self.defaultLyric || 'a', vel: 96, vib: 0.5
        };
        self.notes.push(nn);
        self.sel = {}; self.sel[nn.id] = 1;
        self._selectionAnchor = nn.id;
        self.drag = { mode: 'new', x0: p.x, y0: p.y, beat0: beat, moved: false, movedX: false, list: [nn], orig: [{ start: nn.start, dur: nn.dur, pitch: nn.pitch }] };
        self._emit();
        return;
      }
      if (self.tool === 'select') {
        self.sel = {};
        self._selectionAnchor = null;
        self.drag = { mode: 'band', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        self.draw();
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (!self.drag) return;
      var p = self._pos(e);
      var d = self.drag;
      if (d.mode === 'phoneBoundary' || d.mode === 'phoneCrossfade' || d.mode === 'phoneAnticipation') { self._phoneMove(p); return; }
      if (d.mode === 'seek') { self.seek(self.xBeat(p.x)); return; }
      if (d.mode === 'paramBrush') {
        if (!d.moved) {
          if (Math.hypot(p.x - d.x0, p.y - d.y0) < 3) return;
          d.moved = true; self._rightClickAction = 'eraseParam';
        }
        var paramBeat = Math.max(0, self.xBeat(p.x)), paramValue = self._laneValue(p.y, d.key);
        self._applyParamBrush(d.prevBeat, d.prevValue, paramBeat, paramValue, d.erase, d.key);
        d.prevBeat = paramBeat; d.prevValue = paramValue;
        self.requestDraw(); return;
      }
      if (d.mode === 'pitBrush') {
        if (!d.moved) {
          if (Math.hypot(p.x - d.x0, p.y - d.y0) < 3) return;
          d.moved = true;
          self._rightClickAction = 'erasePit';
        }
        var curBeat = Math.max(0, self.xBeat(p.x)), curMidi = self._yToMidi(p.y);
        self._applyPitBrush(d.prevBeat, d.prevMidi, curBeat, curMidi, d.erase, d.baseModel);
        d.prevBeat = curBeat; d.prevMidi = curMidi;
        self.requestDraw(); return;
      }
      if (d.mode === 'pit') {
        var pts = d.note.pitchPoints, pt = pts[d.index];
        var isEndpoint = d.index === 0 || d.index === pts.length - 1;
        var sep = 1e-5;
        var minimum = d.index ? pts[d.index - 1][0] + sep : -d.note.start;
        var maximum = d.index < pts.length - 1 ? pts[d.index + 1][0] - sep : d.note.dur;
        if (minimum > maximum) minimum = maximum = pt[0];
        pt[0] = NSG.TUNING.clamp(self.xBeat(p.x) - d.note.start, minimum, maximum);
        // 首尾控制点仅可左右移动（不越过同曲线相邻点），不可上下移动；中间控制点可上下与横向移动。
        if (!isEndpoint) {
          pt[1] = Math.round(NSG.TUNING.clamp((self.rowY(d.note.pitch) + self.rowH / 2 - p.y) / self.rowH * 100, -2400, 2400));
        }
        self.requestDraw(); return;
      }
      if (d.mode === 'vibRate') {
        self._setVibratoRate(d.note, p.x); self.requestDraw(); return;
      }
      if (d.mode === 'vibPhase') {
        var deltaSeconds = d.tm.secOf(self.xBeat(p.x)) - d.time;
        var phase = d.phase - 360 * NSG.TUNING.vibrato(d.note.vibrato).rate * deltaSeconds;
        d.note.vibrato.phase = ((phase % 360) + 360) % 360;
        if (self.onTuningInput) self.onTuningInput();
        self.requestDraw(); return;
      }
      if (d.mode === 'vibLength' || d.mode === 'vibDepth') {
        if (d.mode === 'vibLength') d.note.vibrato.length = NSG.TUNING.clamp((1 - (self.xBeat(p.x) - d.note.start) / d.note.dur) * 100, 1, 100);
        else d.note.vibrato.depth = Math.round(NSG.TUNING.clamp(Math.abs(p.y - (self.rowY(d.note.pitch) + self.rowH / 2)) / self.rowH * 100, 0, 200));
        self.requestDraw(); return;
      }
      if (d.mode === 'band') {
        d.x1 = p.x; d.y1 = p.y;
        var x1 = Math.min(d.x0, p.x), x2 = Math.max(d.x0, p.x);
        var y1 = Math.min(d.y0, p.y), y2 = Math.max(d.y0, p.y);
        self.sel = {};
        self.notes.forEach(function (n) {
          var nx = self.beatX(n.start), ny = self.rowY(n.pitch);
          var nw = Math.max(6, n.dur * self.pxBeat);
          if (nx < x2 && nx + nw > x1 && ny < y2 && ny + self.rowH > y1) self.sel[n.id] = 1;
        });
        self.requestDraw();
        return;
      }
      if (d.mode === 'vel') {
        self._applyVel(d.list, p);
        return;
      }
      if (!d.moved) {
        if (Math.hypot(p.x - d.x0, p.y - d.y0) < 3) return;
        d.moved = true;
      }
      if (!d.movedX && Math.abs(p.x - d.x0) >= 3) d.movedX = true;
      var step = self._snapStep();
      var forceSnap = !!(self.forceSnap !== !!e.altKey);
      var dBeat = (p.x - d.x0) / self.pxBeat;
      var dPitch = Math.round((d.y0 - p.y) / self.rowH);
      if (d.mode === 'move') {
        // Quantize and constrain the displacement once, preserving the group's spacing.
        var minStart = Infinity, minPitch = Infinity, maxPitch = -Infinity;
        d.orig.forEach(function (o) {
          minStart = Math.min(minStart, o.start);
          minPitch = Math.min(minPitch, o.pitch); maxPitch = Math.max(maxPitch, o.pitch);
        });
        if (!d.movedX) {
          dBeat = 0;
        } else if (forceSnap) {
          var anchorOrig = d.orig[d.anchorIdx || 0] || d.orig[0];
          var snappedAnchor = self._snapGrid(anchorOrig.start + dBeat);
          dBeat = snappedAnchor - anchorOrig.start;
          if (minStart + dBeat < 0) {
            var extraSteps = Math.ceil((-minStart - dBeat - 1e-9) / step);
            dBeat += Math.max(0, extraSteps) * step;
          }
        } else {
          dBeat = Math.max(-minStart, Math.round(dBeat / step) * step);
        }
        // Imported notes outside the editor range must not jump on a horizontal move.
        dPitch = Math.max(Math.min(24, minPitch) - minPitch,
          Math.min(Math.max(100, maxPitch) - maxPitch, dPitch));
      }
      d.list.forEach(function (n, i) {
        var o = d.orig[i];
        if (d.mode === 'resize') {
          if (forceSnap) {
            var rawEnd = o.start + o.dur + dBeat;
            var minGap = Math.min(step * 0.25, 0.03125);
            var minEnd = roundBeat(Math.ceil((o.start + minGap - 1e-9) / step) * step);
            var snappedEnd = Math.max(minEnd, self._snapGrid(rawEnd));
            n.dur = Math.max(minGap, roundBeat(snappedEnd - o.start));
          } else {
            n.dur = Math.max(step, roundBeat(Math.round((o.dur + dBeat) / step) * step));
          }
        } else if (d.mode === 'move') {
          n.start = Math.max(0, roundBeat(o.start + dBeat));
          n.pitch = o.pitch + dPitch;
        } else if (d.mode === 'new') {
          if (forceSnap) {
            var curEnd = self._snapGrid(self.xBeat(p.x));
            n.dur = Math.max(step, roundBeat(curEnd - o.start));
          } else {
            n.dur = dBeat >= 0 ? Math.max(step, roundBeat(Math.round(dBeat / step) * step)) : step;
          }
        }
      });
      if (d.pitEdit) self.pit = NSG.TUNING.moveNotePit(d.pitEdit.notes, d.pitEdit.pit, self.notes, d.pitEdit.bindings);
      self.requestDraw();
    });

    window.addEventListener('mouseup', function () {
      if (!self.drag) return;   // 与卷帘无关的点击不必重画
      var wasSeek = self.drag.mode === 'seek';
      var wasParam = self.drag.mode === 'paramBrush';
      var wasBrush = self.drag.mode === 'pitBrush' || wasParam;
      var brushMoved = wasBrush && !!self.drag.moved;
      var wasPhone = /^phone/.test(self.drag.mode);
      if (wasBrush && brushMoved && (!wasParam || self.drag.key === 'pitd') && !self.drag.erase && NSG.TUNING && NSG.TUNING.fitPit) {
        self.pit = NSG.TUNING.fitPit(self.pit, 0.35);
      }
      if (wasParam && brushMoved && self.drag.key === 'dyn') Object.keys(self.drag.touched).forEach(function (id) {
        NSG.TUNING.fitNoteGain(self.drag.touched[id]);
      });
      self.drag = null;
      var changed = false;
      if (!wasSeek && (!wasBrush || brushMoved)) changed = self._emit();
      else self.draw();
      if (wasSeek && self.onSeekEnd) self.onSeekEnd(self.playPos);
      if (wasPhone && changed && self.onPhoneCommit) self.onPhoneCommit();
    });

    cv.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      var act = self._rightClickAction;
      self._rightClickAction = null;
      if (act === 'deleteNote' || act === 'deletePitPoint' || act === 'erasePit' || act === 'eraseParam') return;
      var p = self._pos(e);
      var pitHit = self.tool === 'pit' ? null : self.hitPitchPoint(p);
      if (pitHit) {
        self.sel = {}; self.sel[pitHit.note.id] = 1; self.draw();
        if (self.onSelectionChange) self.onSelectionChange();
        if (self.onContextMenu) self.onContextMenu(e, p, pitHit.note, 'pit', pitHit);
        return;
      }
      var inVel = p.y > self.h - self.velLane;
      var inPhone = self.showPhonePanel && self._drawPhoneLane && p.y >= self.gridBottom() && p.y < self.h - self.velLane;
      var hit = (!inVel && !inPhone && p.x >= self.kbW && p.y >= self.rulerH && p.y <= self.gridBottom()) ? self.hit(p.x, p.y) : null;
      if (self.tool === 'select' && hit && !self.sel[hit.note.id]) {
        self.sel = {}; self.sel[hit.note.id] = 1;
        self.draw();
        if (self.onSelectionChange) self.onSelectionChange();
      }
      if (typeof self.onContextMenu === 'function') {
        var area = inVel ? 'velocity' : p.x < self.kbW ? 'keys'
          : p.y < self.rulerH ? 'ruler'
          : inPhone ? 'phoneme'
          : inVel ? 'velocity'
          : 'grid';
        self.onContextMenu(e, p, hit ? hit.note : null, area);
      }
    });

    cv.addEventListener('dblclick', function (e) {
      if ((self.tool === 'select' || self.tool === 'pen') && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
      var p = self._pos(e);
      if (self.showPhonePanel && self._phoneDoubleClick && p.y >= self.gridBottom() && p.y < self.h - self.velLane) {
        self._phoneDoubleClick(p, e); return;
      }
      var phoneLabel = self.hitPhones(p.x, p.y);
      if (phoneLabel) { e.preventDefault(); self.editPhones(phoneLabel); return; }
      if (p.y < self.rulerH || p.y > self.gridBottom() || self.tool === 'bend' || self.tool === 'pit') return;
      var hit = self.hit(p.x, p.y);
      if (!hit) return;
      var target = hit.note;
      var apply = function (val) {
        if (self.applyNoteLyric(target, val)) self._emit();
      };
      if (self.onEditLyric) self.onEditLyric(target, apply);
      else apply(prompt(tr('roll.promptLyric', '歌词（一个音节，可填罗马字或假名）'), target.lyric || 'a'));
    });

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var wheelPos = self._pos(e);
      if (wheelPos.y > self.h - self.velLane && self.laneParam === 'pitd' && !e.ctrlKey && !e.shiftKey && !e.deltaX) {
        self.setPitdRange(self.pitdRange * (e.deltaY > 0 ? 2 : 0.5)); return;
      }
      if (e.ctrlKey) {
        var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 300 : e.deltaY;
        if (!dy) return;
        var p = self._pos(e);
        var anchorX = Math.max(self.kbW, Math.min(self.w, p.x));
        var anchor = self.xBeat(anchorX);
        var factor = Math.pow(1.12, Math.max(-3, Math.min(3, -dy / 100)));
        var nextPxBeat = Math.max(8, Math.min(360, self.pxBeat * factor));
        if (nextPxBeat === self.pxBeat) return;
        self.pxBeat = nextPxBeat;
        self.scrollBeat = Math.max(0, anchor - (anchorX - self.kbW) / self.pxBeat);
      } else if (e.shiftKey || Math.abs(e.deltaX || 0) > Math.abs(e.deltaY)) {
        self.scrollBeat = Math.max(0, self.scrollBeat + (e.deltaX || e.deltaY) / self.pxBeat);
      } else {
        self.lowPitch = Math.max(12, Math.min(84, self.lowPitch - Math.sign(e.deltaY) * 2));
      }
      self.requestDraw();
    }, { passive: false });

    cv.addEventListener('mousemove', function (e) {
      if (self.drag) return;
      var p = self._pos(e);
      self._updateHover(p);
    });
    cv.addEventListener('mouseleave', function () {
      if (!self.drag) cv.style.cursor = '';
    });
  };

  PianoRoll.prototype._updateHover = function (p) {
    this.cv.style.cursor = this._hoverCursor(p);
  };

  PianoRoll.prototype._hoverCursor = function (p) {
    if (p && p.y > this.h - this.velLane) return p.x < this.kbW ? 'pointer' :
      this.laneParam === 'pitd' || this.laneParam === 'dyn' ? 'crosshair' : 'ns-resize';
    if (this.tool !== 'select' || !p) return '';
    if (p.y < this.rulerH) return 'ew-resize';
    var gridH = this.gridBottom();
    if (p.x < this.kbW || p.y > gridH) return '';
    var T = NSG.TUNING;
    if (this.showControlPoints && this._lastPitchInfo) {
      for (var ci = this.notes.length - 1; ci >= 0; ci--) {
        var cn = this.notes[ci];
        if (!T.hasPitch(cn) || !this._hasVisibleControlPoints(cn)) continue;
        var cx0 = this.beatX(cn.start), cw = cn.dur * this.pxBeat;
        if (p.x < cx0 - 60 || p.x > cx0 + cw + 60) continue;
        var cEntry = this._lastPitchInfo[cn.id];
        if (!cEntry || !cEntry.points) continue;
        var cy = this.rowY(cn.pitch) + this.rowH / 2;
        for (var pj = 0; pj < cEntry.points.length; pj++) {
          var cpt = cEntry.points[pj];
          if (Math.hypot(p.x - this.beatX(cn.start + cpt[0]), p.y - (cy - cpt[1] / 100 * this.rowH)) <= 7) {
            return 'pointer';
          }
        }
      }
    }
    if (this.showVibrato) {
      for (var vi = this.notes.length - 1; vi >= 0; vi--) {
        var vn = this.notes[vi];
        if (!T.hasPitch(vn)) continue;
        var vx = this.beatX(vn.start), vw = vn.dur * this.pxBeat;
        if (p.x < vx - 30 || p.x > vx + vw + 50) continue;
        var vcy = this.rowY(vn.pitch) + this.rowH / 2, vy = vcy + this.rowH / 2 + 10;
        var v = T.vibrato(vn.vibrato);
        if (Math.abs(p.y - vy) < 8 && p.x >= vx + vw - 21 && p.x <= vx + vw + 1) return 'pointer';
        if (vn.vibrato && v.enabled) {
          if (Math.abs(p.x - (vx + vw * (1 - v.length / 100))) < 7 && Math.abs(p.y - vy) < 7) return 'ew-resize';
          if (Math.abs(p.x - (vx + vw * 0.85)) < 7 && Math.abs(p.y - (vcy - v.depth / 100 * this.rowH)) < 7) return 'ns-resize';
          var rate = this._vibratoRateControl(vn);
          if (Math.abs(p.y - rate.y) < 7 && p.x >= rate.x - 7 && p.x <= rate.x + rate.width + 7) return 'ew-resize';
          if (this._lastPitchInfo && this._lastPitchInfo[vn.id] && v.length > 0 && v.depth > 0) {
            var pBeat = this.xBeat(p.x), pRel = (pBeat - vn.start) / vn.dur;
            if (pRel >= 1 - v.length / 100 && pRel <= 1) {
              var pInfo = this._lastPitchInfo[vn.id];
              var phaseY = vcy - this._centsAt(vn, pRel, pInfo, true) / 100 * this.rowH;
              var vibBase = (pInfo.model.baseMidiAt(pBeat, vn.pitch) - vn.pitch) * 100;
              var vibT = pInfo.tm.secOf(pBeat);
              var vibY = vcy - (vibBase + T.vibCents(vn, pRel, pInfo.duration, this.timbre,
                vibT - pInfo.chainStart, vibT - pInfo.tm.secOf(vn.start + vn.dur * (1 - v.length / 100)))) / 100 * this.rowH;
              if (Math.abs(p.y - phaseY) <= 6 || Math.abs(p.y - vibY) <= 6) return 'ew-resize';
            }
          }
        }
      }
    }
    var hit = this.hit(p.x, p.y);
    if (hit) return hit.edge ? 'ew-resize' : '';
    if (Math.abs(p.x - this.beatX(this.playPos)) < 5) return 'ew-resize';
    return '';
  };

  PianoRoll.prototype._applyVel = function (list, p) {
    var vh = Math.max(0, Math.min(1, (this.h - 6 - p.y) / (this.velLane - 20)));
    if (this.laneParam === 'cons') {
      var speed = Math.round(vh * 200);
      if (Math.abs(speed - 100) <= 3) speed = 100;   // 默认值附近吸附，方便拖回 100
      list.forEach(function (n) { n.consonantSpeed = speed; delete n.consonantLength; });
    } else list.forEach(function (n) { n.vel = Math.max(1, Math.round(vh * 127)); });
    this.requestDraw();
  };
  // 辅音速度显示值：旧工程的辅音长度 % 按同一换算显示。
  PianoRoll.prototype.consonantSpeedOf = function (n) {
    var T = NSG.TUNING;
    return n.consonantSpeed != null ? T.consonantSpeed(n.consonantSpeed) :
      n.consonantLength != null ? T.speedFromLength(n.consonantLength) : 100;
  };
  PianoRoll.prototype.setLaneParam = function (key) {
    if (['vel', 'cons', 'pitd', 'dyn'].indexOf(key) < 0 || this.drag) return;
    this.laneParam = key;
    if (this.onLaneParam) this.onLaneParam(key);
    this.requestDraw();
  };
  PianoRoll.prototype.setPitdRange = function (range) {
    if (this.drag) return;
    this.pitdRange = NSG.TUNING.clamp(Math.round(range), 50, 2400);
    this.requestDraw();
  };

  PianoRoll.prototype.recordEdit = function (entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  };

  PianoRoll.prototype._emit = function () {
    // Inspector edits, octave/shift commands and all deletion paths share the
    // committed geometry. Explicitly installed/painted PIT takes precedence.
    var prior = JSON.parse(this._committed);
    if (!Array.isArray(prior) && prior.pit && prior.pit.length &&
        JSON.stringify(prior.pit) === JSON.stringify(this.pit)) {
      this.pit = NSG.TUNING.moveNotePit(prior.notes, prior.pit, this.notes);
    }
    var snapshot = this._snapshot();
    var changed = snapshot !== this._committed;
    if (changed) {
      this.recordEdit(this._committed);
      this._committed = snapshot;
    }
    this.draw();
    if (changed && this.onChange) this.onChange(this.notes, this.pit);
    return changed;
  };

  PianoRoll.prototype.transposeOctave = function (direction) {
    // this.notes is the current track loaded into the piano roll, never all project tracks.
    var picked = this.selected(), list = picked.length ? picked : this.notes;
    var delta = direction === 1 ? 12 : direction === -1 ? -12 : 0;
    if (!list.length || !delta) return { n: 0 };
    // Keep the full octave and all intervals intact at MIDI pitch boundaries.
    if (list.some(function (n) {
      return !Number.isFinite(n.pitch) || n.pitch + delta < 0 || n.pitch + delta > 127;
    })) return { n: 0, limited: true };
    list.forEach(function (n) { n.pitch += delta; });
    this.centerOn();
    this._emit();
    return { n: list.length, selected: !!picked.length };
  };

  PianoRoll.prototype.shiftBeats = function (deltaBeats) {
    var delta = +deltaBeats || 0;
    var notes = this.notes;
    var self = this;
    var picked = notes.filter(function (n) { return self.sel[n.id]; });
    var list = picked.length ? picked : notes;
    if (!list.length || !delta) return { n: 0 };
    if (list.some(function (n) { return !Number.isFinite(n.start) || n.start + delta < -1e-9; })) {
      return { n: 0, limited: true };
    }
    list.forEach(function (n) {
      n.start = Math.max(0, Math.round((n.start + delta) * 1e6) / 1e6);
    });
    var minBeat = Infinity, maxBeat = -Infinity;
    list.forEach(function (n) {
      if (n.start < minBeat) minBeat = n.start;
      if (n.start + n.dur > maxBeat) maxBeat = n.start + n.dur;
    });
    var visBeats = Math.max(4, (this.w - this.kbW) / this.pxBeat);
    if (minBeat < this.scrollBeat || maxBeat > this.scrollBeat + visBeats) {
      this.scrollBeat = Math.max(0, Math.floor(minBeat / 4) * 4);
    }
    this._emit();
    return { n: list.length, selected: !!picked.length };
  };
  PianoRoll.prototype.shiftBar = function (direction) {
    var dir = direction < 0 ? -1 : direction > 0 ? 1 : 0;
    return this.shiftBeats(dir * 4);
  };
  PianoRoll.prototype.quantizeToGrid = function () {
    var self = this;
    var picked = this.selected(), list = picked.length ? picked : this.notes;
    if (!list.length) return { n: 0, changed: 0, selected: !!picked.length };
    var step = this._snapStep();
    var changed = 0;
    list.forEach(function (n) {
      if (!Number.isFinite(n.start) || !Number.isFinite(n.dur)) return;
      var newStart = self._snapGrid(n.start);
      var rawEnd = n.start + n.dur;
      var newEnd = Math.max(roundBeat(newStart + step), self._snapGrid(rawEnd));
      var newDur = roundBeat(newEnd - newStart);
      if (Math.abs(newStart - n.start) > 1e-6 || Math.abs(newDur - n.dur) > 1e-6) {
        n.start = newStart;
        n.dur = newDur;
        changed++;
      }
    });
    if (changed) this._emit();
    return { n: list.length, changed: changed, selected: !!picked.length };
  };

  PianoRoll.prototype.applyNoteLyric = function (target, val) {
    if (!target || val === null || val === undefined) return false;
    var raw = String(val).trim();
    if (/^(?:[-—–―ー‿=＿~～]|\+[~*])$/.test(raw)) {
      if (!target.slur) { target.slurLyric = target.lyric; target.slurPhones = target.phones ? target.phones.slice() : null; }
      target.lyric = /^\+/.test(raw) ? raw : '‿';
      target.slur = true;
    } else {
      target.lyric = raw || 'a';
      delete target.slur;
      delete target.slurLyric; delete target.slurPhones;
      if (!/[-+]$/.test(raw) && !/^[-+]/.test(raw)) delete target.wordJoin;
      else target.wordJoin = true;
    }
    delete target.phones;
    delete target.phonesLang;
    delete target.phonesSource; delete target.ignorePhoneticHint;
    delete target.phonemeTiming; delete target.wordJoinDirection; delete target.phonemeWordJoin;
    return true;
  };

  PianoRoll.prototype.batchSetLyrics = function (targetNotes, tokens) {
    var list = (targetNotes || []).slice();
    var toks = tokens || [];
    var count = Math.min(list.length, toks.length);
    if (!count) return { updated: 0, totalNotes: list.length, totalTokens: toks.length };
    var applied = 0;
    for (var i = 0; i < count; i++) {
      if (this.applyNoteLyric(list[i], toks[i])) applied++;
    }
    this._emit();
    return { updated: applied, totalNotes: list.length, totalTokens: toks.length };
  };

  PianoRoll.prototype.deleteSel = function () {
    var self = this, before = this.notes.length;
    this.notes = this.notes.filter(function (n) { return !self.sel[n.id]; });
    this.sel = {};
    var deleted = before - this.notes.length;
    if (deleted > 0) this._emit();
    return deleted;
  };
  PianoRoll.prototype.copy = function () {
    var self = this;
    this.clip = this.notes.filter(function (n) { return self.sel[n.id]; }).map(function (n) {
      return JSON.parse(JSON.stringify(n));
    });
    this.clipPit = NSG.TUNING.capturePitBindings(this.notes, this.pit).filter(function (b) { return self.sel[b.id]; });
    return this.clip.length;
  };
  PianoRoll.prototype.cut = function () {
    var count = this.copy();
    if (count > 0) this.deleteSel();
    return count;
  };
  PianoRoll.prototype.paste = function (atBeat) {
    if (!this.clip.length) return 0;
    var base = Math.min.apply(null, this.clip.map(function (c) { return c.start; }));
    var target = typeof atBeat === 'number' && isFinite(atBeat) && atBeat >= 0
      ? this._snapGrid(atBeat)
      : (this.forceSnap
        ? this._snapGrid(Math.max(0, this.playPos >= 0 ? this.playPos : 0))
        : Math.max(0, this.playPos >= 0 ? this.playPos : 0));
    var self = this, used = noteIds(this.notes), bindings = NSG.TUNING.capturePitBindings(this.notes, this.pit);
    this.sel = {};
    this.clip.forEach(function (c) {
      var n = JSON.parse(JSON.stringify(c));
      n.id = noteId(used);
      n.start = Math.max(0, Math.round((target + (c.start - base)) * 1e6) / 1e6);
      var binding = (self.clipPit || []).find(function (b) { return b.id === c.id; });
      if (binding) bindings.push(Object.assign({}, binding, { id: n.id }));
      self.notes.push(n); self.sel[n.id] = 1;
    });
    if (bindings.length) this.pit = NSG.TUNING.restorePitBindings(this.notes, this.pit, bindings);
    this._emit();
    return this.clip.length;
  };
  /* 延音符开关：选中的音若都已是延音就取消，否则整批标成延音。
     延音 = 接着上一个音节唱，不重发辅音；音高变化会滑过去。 */
  PianoRoll.prototype.toggleSlur = function () {
    var self = this;
    var ids = Object.keys(this.sel);
    if (!ids.length) return { n: 0, on: false };
    var picked = this.notes.filter(function (n) { return self.sel[n.id]; });
    if (!picked.length) return { n: 0, on: false };
    var all = picked.every(function (n) { return !!n.slur; });
    /* 取消延音时得把歌词还回去：找一个能唱的元音 */
    picked.forEach(function (n) {
      if (all) {
        delete n.slur;
        n.lyric = n.slurLyric || (/^(?:‿|\+[~*])$/.test(n.lyric) ? 'a' : n.lyric);
        if (n.slurPhones) n.phones = n.slurPhones.slice();
        delete n.slurLyric; delete n.slurPhones;
      } else {
        if (!n.slur) { n.slurLyric = n.lyric; n.slurPhones = n.phones ? n.phones.slice() : null; }
        n.slur = true; n.lyric = '‿';
        delete n.phones;
      }
    });
    this._emit();
    return { n: picked.length, on: !all };
  };

  PianoRoll.prototype.setNoteLanguage = function (lang, targetNotes) {
    var list = (targetNotes && targetNotes.length) ? targetNotes : this.selected();
    if (!list.length) return { n: 0, changed: 0, lang: lang || '' };
    var nextLang = (lang && typeof lang === 'string') ? lang.trim() : '';
    var trackLang = this.trackLanguage();
    var changed = 0;
    var self = this;
    list.forEach(function (n) {
      if (!n) return;
      var curExplicit = n.noteLang || (n.langSource === 'note' ? n.lang : '');
      var curEff = self.noteLanguage(n);
      if (nextLang) {
        if (curExplicit === nextLang && n.langSource === 'note') return;
        if ((n.phones || n.slurPhones) && !n.phonesLang) {
          n.phonesLang = curEff;
        }
        n.noteLang = nextLang;
        n.langSource = 'note';
        changed++;
      } else {
        var hadOverride = !!(n.noteLang || n.langSource === 'note' || (!self.phonemizer && n.lang && n.lang !== trackLang));
        if (!hadOverride) return;
        if ((n.phones || n.slurPhones) && !n.phonesLang) {
          n.phonesLang = curEff;
        }
        delete n.noteLang;
        if (n.langSource === 'note') delete n.langSource;
        if (!self.phonemizer && n.lang && n.lang !== trackLang) delete n.lang;
        changed++;
      }
    });
    if (changed) this._emit();
    else this.draw();
    return { n: list.length, changed: changed, lang: nextLang };
  };

  PianoRoll.prototype.selectAll = function () {
    var self = this;
    this.sel = {};
    this.notes.forEach(function (n) { self.sel[n.id] = 1; });
    this.draw();
  };

  NSG.PianoRoll = PianoRoll;
})(typeof window !== 'undefined' ? window : global);
