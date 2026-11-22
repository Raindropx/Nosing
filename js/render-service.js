/* Background rendering with independent vocal/accompaniment caches and a bounded queue. */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['render-service'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  function cancelled() { var e = new Error('已被新的计算请求替代'); e.name = 'AbortError'; return e; }
  function scorePart(score, type) {
    var tracks = score.tracks.filter(function (t) { return t && t.type === type; });
    if (type === 'vocal') {
      tracks = tracks.map(function (t) {
        var o = { type: t.type, muted: !!t.muted, notes: t.muted ? [] : (t.notes || []) };
        if (!t.muted && t.pit && t.pit.length) o.pit = t.pit;
        if (t.lang) o.lang = t.lang;
        if (t.phonemizer !== undefined) o.phonemizer = t.phonemizer;
        if (t.timbre) o.timbre = t.timbre;
        if (typeof t.vol === 'number' && isFinite(t.vol) && Math.abs(t.vol - 1) >= 0.00005) o.vol = Math.round(t.vol * 10000) / 10000;
        if (typeof t.pan === 'number' && isFinite(t.pan) && Math.abs(t.pan) >= 0.0005) o.pan = Math.round(t.pan * 1000) / 1000;
        return o;
      });
    } else {
      tracks = tracks.map(function (t) {
        var o = { type: t.type, notes: t.notes || [] };
        if (t.space && t.space !== 'off') o.space = t.space;
        return o;
      });
    }
    var part = { tempo: score.tempo, tempos: score.tempos, tracks: tracks };
    if (type === 'vocal') { part.lang = score.lang; part.phonemizer = score.phonemizer; }
    return part;
  }
  function stableKey(value) {
    return JSON.stringify(value, function (key, v) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      var sorted = {};
      Object.keys(v).sort().forEach(function (k) { sorted[k] = v[k]; });
      return sorted;
    });
  }
  function normWaveguideKey(waveguide) {
    if (waveguide === false || waveguide === 'off') return 'off';
    if (waveguide === 'light') return 'light';
    if (waveguide === true || waveguide === 'strong' || waveguide === undefined || waveguide === null) return undefined;
    if (typeof waveguide === 'number' && isFinite(waveguide)) {
      var w = Math.max(0, Math.min(1, Math.round(waveguide * 1000) / 1000));
      if (w <= 0) return 'off';
      if (w >= 1) return undefined;
      return w;
    }
    return undefined;
  }
  function normHighPolishKey(highPolish) {
    if (highPolish === false || highPolish === 'off') return 0;
    if (highPolish === true || highPolish === 'both' || highPolish === undefined || highPolish === null) return undefined;
    if (typeof highPolish === 'number' && isFinite(highPolish)) {
      var p = Math.max(0, Math.min(1, Math.round(highPolish * 1000) / 1000));
      if (p >= 1) return undefined;
      return p;
    }
    return undefined;
  }
  function vocalKey(score, timbre, raw, hd, waveguide, highPolish) {
    var key = { score: scorePart(score, 'vocal'), timbre: timbre, rawSource: !!raw, hd: hd === true };
    if (NSG.LEGACY_SOUND) key.legacySound = true;
    if (hd === true && !raw) {
      var wg = normWaveguideKey(waveguide);
      if (wg !== undefined) key.modeBFricWaveguide = wg;
      var hp = normHighPolishKey(highPolish);
      if (hp !== undefined) key.modeBHighPolish = hp;
    }
    return JSON.stringify(key);
  }
  function accompKey(score) {
    var key = { score: scorePart(score, 'inst') };
    if (NSG.LEGACY_SOUND) key.legacySound = true;
    return JSON.stringify(key);
  }
  function jobDictLangs(type, data) {
    if (!data || type === 'accomp' || type === 'accompSlice' || type === 'accompSpace' ||
        type === 'accompFinalize' || type === 'vocalFinalizeTrack' || type === 'vocalMixAnalyze' ||
        type === 'tuneStep' || type === 'extract' || type === 'analyzeVocal') return [];
    if (type === 'read') return data.kind === 'nsg' ? [] : ['zh', 'en'];
    var extra = data.options && (data.options.phonemizer || data.options.lang);
    if (type === 'normalize' && data.imported) {
      return NSG.collectScoreLanguages ? NSG.collectScoreLanguages(data.imported, extra) : ['zh', 'en', 'ja'];
    }
    if (data.score && NSG.collectScoreLanguages) return NSG.collectScoreLanguages(data.score, extra);
    return ['zh'];
  }
  function collectTransfers(value, buffers) {
    if (!value || typeof value !== 'object') return;
    if (ArrayBuffer.isView(value)) {
      if (buffers.indexOf(value.buffer) < 0) buffers.push(value.buffer);
    } else if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectTransfers(value[i], buffers);
    } else {
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) collectTransfers(value[keys[k]], buffers);
    }
  }
  function activeVocalTracksOf(score) {
    var tracks = (score && score.tracks) || [];
    var hasVocalType = tracks.some(function (t) { return t && t.type === 'vocal'; });
    return hasVocalType
      ? tracks.filter(function (t) { return t && t.type === 'vocal' && !t.muted && t.notes && t.notes.length; })
      : (tracks[0] && !tracks[0].muted && tracks[0].notes && tracks[0].notes.length ? [tracks[0]] : []);
  }
  function dryTrackKeyOf(score, trk, timbre, opt) {
    return JSON.stringify({
      tempo: score.tempo, tempos: score.tempos, notes: trk.notes,
      pit: trk.pit && trk.pit.length ? trk.pit : undefined,
      lang: trk.lang || score.lang,
      phonemizer: trk.phonemizer !== undefined ? trk.phonemizer : score.phonemizer,
      timbre: trk.timbre || timbre,
      rawSource: !!opt.rawSource, hd: opt.hd === true,
      legacySound: !!(opt.legacySound || NSG.LEGACY_SOUND),
      modeBFricWaveguide: opt.modeBFricWaveguide,
      modeBHighPolish: opt.modeBHighPolish
    });
  }
  function meter(channels, sr) {
    var block = Math.round(sr * 0.02), peak = 0;
    var env = new Float32Array(Math.ceil(channels[0].length / block));
    channels.forEach(function (pcm) {
      for (var i = 0; i < pcm.length; i++) {
        var v = Math.abs(pcm[i]), b = Math.floor(i / block);
        if (v > peak) peak = v;
        if (v > env[b]) env[b] = v;
      }
    });
    return { peak: peak, env: env };
  }
  var MAX_DRY_TRACK_BYTES = 256 * 1024 * 1024;
  var dryTrackCache = new Map(), dryTrackBytes = 0;
  var tuneSessions = new Map(), tuneSessionSerial = 0;
  function renderVocalWithCache(score, timbre, opt) {
    if (!NSG.DSP.renderTrack || !NSG.DSP.mixVocalTracks) return NSG.DSP.render(score, timbre, opt);
    var vocalTracks = activeVocalTracksOf(score);
    if (!vocalTracks.length) return NSG.DSP.render(score, timbre, opt);
    var items = vocalTracks.map(function (trk) {
      var k = dryTrackKeyOf(score, trk, timbre, opt);
      var hit = dryTrackCache.get(k);
      if (hit) {
        dryTrackCache.delete(k);
        dryTrackCache.set(k, hit);
      } else {
        hit = NSG.DSP.renderTrack(score, trk, timbre, opt);
        var bytes = hit.pcm.buffer.byteLength;
        if (bytes <= MAX_DRY_TRACK_BYTES) {
          while (dryTrackCache.size >= 24 || dryTrackBytes + bytes > MAX_DRY_TRACK_BYTES) {
            var oldest = dryTrackCache.keys().next().value;
            dryTrackBytes -= dryTrackCache.get(oldest).pcm.buffer.byteLength;
            dryTrackCache.delete(oldest);
          }
          dryTrackCache.set(k, hit);
          dryTrackBytes += bytes;
        }
      }
      return { pcm: hit.pcm, sr: hit.sr, vol: trk.vol, pan: trk.pan };
    });
    var sr = items[0] && items[0].sr ? items[0].sr : (opt.hd === true ? 48000 : 16000);
    var mixed = NSG.DSP.mixVocalTracks(items, sr, { headroom: opt.headroom === true });
    // A Worker transfers the output buffer. Copy only when the cache retains the dry PCM.
    if (!mixed.channels && items.length === 1 && mixed.pcm === items[0].pcm &&
        mixed.pcm.buffer.byteLength <= MAX_DRY_TRACK_BYTES) {
      return { pcm: new Float32Array(mixed.pcm), sr: mixed.sr };
    }
    return mixed;
  }

  function execute(type, data) {
    var start = performance.now(), result;
    if (type === 'vocal') {
      var audio = renderVocalWithCache(data.score, data.timbre, { rawSource: data.rawSource, hd: data.hd,
        legacySound: data.legacySound,
        modeBFricWaveguide: data.modeBFricWaveguide, modeBHighPolish: data.modeBHighPolish,
        headroom: data.headroom === true });
      var levels = meter(audio.channels || [audio.pcm], audio.sr);
      var wantAnalysis = data.includeAnalysis !== false;
      var grid = null, harmonics = null;
      if (wantAnalysis) {
        var vocalTrack = data.score.tracks.find(function (t) { return t && t.type === 'vocal' && !t.muted && t.notes && t.notes.length; }) ||
          data.score.tracks.find(function (t) { return t && t.type === 'vocal'; }) || data.score.tracks[0];
        var vNotes = vocalTrack ? vocalTrack.notes : [];
        grid = NSG.AN.spectrumGrid(audio.pcm, { hop: 512, sampleRate: audio.sr });
        harmonics = vNotes.length ? NSG.AN.harmonics(audio.pcm,
          NSG.mtof(vNotes[Math.min(vNotes.length - 1, Math.floor(vNotes.length * 0.4))].pitch), 16, audio.sr) : null;
      }
      result = { pcm: audio.pcm, sr: audio.sr, peak: levels.peak, env: levels.env,
        grid: grid, harmonics: harmonics };
      if (audio.channels) result.channels = audio.channels;
    } else if (type === 'vocalPlan') {
      result = NSG.DSP.planVocalSlices(data.score, data.trk, data.timbre, data.opt, data.maxSlices);
    } else if (type === 'vocalSlice') {
      result = NSG.DSP.renderVocalSlice(data.score, data.trk, data.timbre, data.opt, data.sliceRange);
    } else if (type === 'vocalTrack') {
      result = NSG.DSP.renderTrack(data.score, data.trk, data.timbre, data.opt);
    } else if (type === 'vocalFinalizeTrack') {
      result = NSG.DSP.finalizeVocalSlices(data.chunks, data.total, data.mixGains, data.opt);
    } else if (type === 'vocalMixAnalyze') {
      var mixedAudio = NSG.DSP.mixVocalTracks(data.items, data.sr, { headroom: data.headroom === true });
      var mLevels = meter(mixedAudio.channels || [mixedAudio.pcm], mixedAudio.sr);
      var mGrid = null, mHarmonics = null;
      if (data.includeAnalysis !== false) {
        mGrid = NSG.AN.spectrumGrid(mixedAudio.pcm, { hop: 512, sampleRate: mixedAudio.sr });
        mHarmonics = data.harmF0 > 0 ? NSG.AN.harmonics(mixedAudio.pcm, data.harmF0, 16, mixedAudio.sr) : null;
      }
      result = { pcm: mixedAudio.pcm, sr: mixedAudio.sr, peak: mLevels.peak, env: mLevels.env,
        grid: mGrid, harmonics: mHarmonics };
      if (mixedAudio.channels) result.channels = mixedAudio.channels;
    } else if (type === 'analyzeVocal') {
      result = {
        grid: NSG.AN.spectrumGrid(data.pcm, { hop: 512, sampleRate: data.sr }),
        harmonics: data.f0 > 0 ? NSG.AN.harmonics(data.pcm, data.f0, 16, data.sr) : null
      };
    } else if (type === 'accomp') {
      var acc = NSG.DSP.renderAccomp(data.score, { legacySound: data.legacySound, space: data.space });
      var accLevels = acc ? meter(acc.channels, acc.sr) : { peak: 0, env: null };
      result = { audio: acc, peak: accLevels.peak, env: accLevels.env };
    } else if (type === 'accompSlice') {
      result = NSG.DSP.renderAccomp(data.score, {
        legacySound: data.legacySound, space: data.space, noteRange: data.noteRange
      }) || { empty: true };
    } else if (type === 'accompSpace') {
      result = NSG.DSP.runAccompSpace(data.effect, data.left, data.right, data.sr, data.spaceName, data.spb0);
    } else if (type === 'accompFinalize') {
      var leftF = data.left, rightF = data.right, wetList = data.wetList || [];
      for (var wi = 0; wi < wetList.length; wi++) {
        var wl = wetList[wi].left, wr = wetList[wi].right;
        for (var si = 0; si < leftF.length; si++) { leftF[si] += wl[si]; rightF[si] += wr[si]; }
      }
      var accF = NSG.DSP.finalizeAccomp(leftF, rightF, data.sr, data.spaceName, data.legacySound);
      var accFLevels = accF ? meter(accF.channels, accF.sr) : { peak: 0, env: null };
      result = { audio: accF, peak: accFLevels.peak, env: accFLevels.env };
    } else if (type === 'extract') {
      result = NSG.AN.extractFormants(data.pcm, data.sr, data.widePcm ? { widePcm: data.widePcm, wideRate: data.wideRate } : undefined);
    } else if (type === 'tune' || type === 'fit' || type === 'tuneStart') {
      var trackIdx = Number.isInteger(data.trackIndex) && data.score.tracks[data.trackIndex] ? data.trackIndex : 0;
      var tr = data.score.tracks[trackIdx];
      var notes = tr.notes;
      var targets = data.indices.map(function (index) { return notes[index]; });
      var trScore = (tr.lang || tr.phonemizer !== undefined)
        ? Object.assign({}, data.score, {
            lang: tr.lang || data.score.lang,
            phonemizer: tr.phonemizer !== undefined ? tr.phonemizer : data.score.phonemizer
          })
        : data.score;
      if (type === 'tune') {
        var options = Object.assign({}, data.options, {
          targets: targets,
          track: tr,
          timbre: (tr && tr.timbre) || (data.options && data.options.timbre),
          lang: trScore.lang,
          phonemizer: trScore.phonemizer
        });
        result = { count: NSG.TUNING.autoTune(notes, trScore, options), notes: notes, pit: tr.pit || [] };
      } else if (type === 'tuneStart') {
        var startOpts = Object.assign({}, data.options, {
          targets: targets,
          track: tr,
          timbre: (tr && tr.timbre) || (data.options && data.options.timbre),
          lang: trScore.lang,
          phonemizer: trScore.phonemizer,
          skipVelocityBalance: true
        });
        var tCount = NSG.TUNING.autoTune(notes, trScore, startOpts);
        var styleObj = NSG.TUNING.autoStyles.filter(function (s) { return s.id === startOpts.style; })[0] || NSG.TUNING.autoStyles[0];
        var sortedNotes = notes.slice().sort(function (a, b) { return a.start - b.start; });
        var targetSet = new Set(targets);
        var balState = (startOpts.vel !== false && tCount && NSG.TUNING.prepareBalance)
          ? NSG.TUNING.prepareBalance(sortedNotes, trScore, styleObj, targetSet, startOpts.hd)
          : null;
        if (!balState || !balState.passes.length) {
          result = { done: true, count: tCount, notes: notes, pit: tr.pit || [] };
        } else {
          var sid = ++tuneSessionSerial;
          while (tuneSessions.size >= 4) tuneSessions.delete(tuneSessions.keys().next().value);
          tuneSessions.set(sid, { count: tCount, notes: notes, track: tr, state: balState });
          result = {
            done: false, tuneId: sid, passes: balState.passes,
            probe: NSG.TUNING.buildBalanceProbe(balState, 0),
            timbre: startOpts.timbre || NSG.defaultTimbre()
          };
        }
      } else result = { fit: NSG.TUNING.simplifyPitch(targets, data.tolerance === undefined ? 1 : data.tolerance, { score: trScore, track: tr }), notes: notes, pit: tr.pit || [] };
    } else if (type === 'tuneStep') {
      var sess = tuneSessions.get(data.tuneId);
      if (!sess) throw Error('自动调教会话已失效');
      var ok = NSG.TUNING.applyBalancePass(sess.state, data.passIndex, { pcm: data.pcm, sr: data.sr });
      var nextPass = data.passIndex + 1;
      if (!ok || nextPass >= sess.state.passes.length) {
        NSG.TUNING.commitBalance(sess.state);
        tuneSessions.delete(data.tuneId);
        result = { done: true, count: sess.count, notes: sess.notes, pit: sess.track.pit || [] };
      } else {
        result = { done: false, probe: NSG.TUNING.buildBalanceProbe(sess.state, nextPass) };
      }
    } else if (type === 'arrange') {
      var arranged = NSG.COMPOSE.arrange(data.score, data.options), meta = {};
      Object.keys(arranged).forEach(function (key) { if (!/^\d+$/.test(key)) meta[key] = arranged[key]; });
      result = { notes: Array.from(arranged), meta: meta };
    } else if (type === 'read') {
      result = { imported: NSG.IO.readAny(data.name, data.bytes) };
    } else if (type === 'normalize') {
      result = { imported: NSG.IO.normalizeImport(data.imported, data.options) };
    } else throw Error('未知计算类型：' + type);
    result.milliseconds = performance.now() - start;
    result.backend = NSG.WASM && NSG.WASM.ready && NSG.WASM.enabled ? 'wasm' : 'js';
    return result;
  }
  function Client(options) {
    this.options = options || {}; this.worker = null; this.disabled = false; this.closed = false;
    this.active = null; this.queue = []; this.cache = {}; this.vocalByMode = { std: null, hd: null }; this.serial = 0;
    this.reqSerial = 0; this.sentDicts = Object.create(null);
    this.pool = []; this.portableBlobUrl = null;
    this.dryTrackCache = new Map(); this.dryTrackBytes = 0;
    if (Number.isInteger(this.options.maxWorkers)) {
      this.maxWorkers = Math.max(1, Math.min(8, this.options.maxWorkers));
    } else if (this.options.workerFactory || typeof root.Worker !== 'function') {
      this.maxWorkers = 1;
    } else {
      var cores = root.navigator && root.navigator.hardwareConcurrency ? root.navigator.hardwareConcurrency : 4;
      this.maxWorkers = Math.min(6, Math.max(1, cores - 1));
    }
  }
  function portableWorkerMain() {
    self.NSG_DICT = self.NSG_DICT || {};
    var ready = Promise.all([
      NSG.WASM && NSG.WASM.init ? NSG.WASM.init() : Promise.resolve(false),
      NSG.VOCAL_WASM && NSG.VOCAL_WASM.init ? NSG.VOCAL_WASM.init() : Promise.resolve(false)
    ]);
    function transfers(value, buffers) {
      if (!value || typeof value !== 'object') return;
      if (ArrayBuffer.isView(value)) {
        if (buffers.indexOf(value.buffer) < 0) buffers.push(value.buffer);
      } else Object.keys(value).forEach(function (key) { transfers(value[key], buffers); });
    }
    self.onmessage = async function (event) {
      var message = event.data;
      if (message.initialize) {
        var initDicts = message.dictionaries || {};
        Object.keys(initDicts).forEach(function (lang) { self.NSG_DICT[lang] = initDicts[lang]; });
        ready = Promise.all([ready].concat(Object.keys(initDicts).map(function (lang) { return NSG.loadDict(lang); })));
        try { await ready; self.postMessage({ ready: true }); }
        catch (e) { throw e; }
        return;
      }
      try {
        await ready;
        if (message.dicts) {
          var langs = Object.keys(message.dicts);
          for (var i = 0; i < langs.length; i++) {
            self.NSG_DICT[langs[i]] = message.dicts[langs[i]];
            await NSG.loadDict(langs[i]);
          }
        }
        var result = NSG.Renderer.execute(message.type, message.data), buffers = [];
        transfers(result, buffers);
        self.postMessage({ id: message.id, result: result }, buffers);
      } catch (e) { self.postMessage({ id: message.id, error: e.message || String(e) }); }
    };
  }
  Client.prototype._ensurePortableBlobUrl = function () {
    if (this.portableBlobUrl) return this.portableBlobUrl;
    var modules = root.NSG_WORKER_MODULES;
    var names = ['phonemes', 'timbre', 'g2p', 'tempo', 'tuning', 'instruments', 'fft-wasm', 'vocal-wasm',
      'dsp', 'analyze', 'compose', 'fzstd', 'fflate', 'project-imports', 'io', 'render-service'];
    var parts = ['self.window = self; self.global = self;\n'];
    names.forEach(function (name) {
      if (!modules || !modules[name]) throw Error('后台模块未就绪：' + name);
      parts.push('(' + modules[name].toString() + ')(self);\n');
    });
    parts.push('(' + portableWorkerMain.toString() + ')();');
    this.portableBlobUrl = root.URL.createObjectURL(new root.Blob(parts, { type: 'text/javascript' }));
    return this.portableBlobUrl;
  };
  Client.prototype._spawnRawWorker = function () {
    if (this.options.workerFactory) return this.options.workerFactory();
    if (this.portable) {
      var url = this._ensurePortableBlobUrl();
      var w = new root.Worker(url);
      w.postMessage({ initialize: true, dictionaries: {} });
      return w;
    }
    return new root.Worker('js/render-worker.js');
  };
  Client.prototype._releaseWorker = function () {
    for (var i = 0; i < this.pool.length; i++) {
      var slot = this.pool[i];
      if (!slot) continue;
      if (slot.worker) { try { slot.worker.terminate(); } catch (e) {} }
      slot.pending.forEach(function (p) { p.reject(cancelled()); });
      slot.pending.clear();
    }
    this.pool = [];
    this.worker = null;
    this.sentDicts = Object.create(null);
    if (this.portableBlobUrl) { root.URL.revokeObjectURL(this.portableBlobUrl); this.portableBlobUrl = null; }
  };
  Client.prototype._slot = function (index) {
    if (this.disabled) return null;
    if (this.pool[index] && this.pool[index].worker) return this.pool[index];
    var self = this;
    try {
      if (!this.options.workerFactory && root.location && root.location.protocol === 'file:') this.portable = true;
      var raw = this._spawnRawWorker();
      var slot = { index: index, worker: raw, sentDicts: Object.create(null), started: false, pending: new Map() };
      raw.onmessage = function (event) {
        var message = event.data;
        if (message.ready) {
          slot.started = true;
          if (index === 0) { self.started = true; clearTimeout(self.startupTimer); }
          return;
        }
        var p = slot.pending.get(message.id);
        if (!p) return;
        slot.pending.delete(message.id);
        if (index === 0) clearTimeout(self.startupTimer);
        slot.started = true;
        if (message.error) p.reject(new Error(message.error));
        else p.resolve(message.result);
      };
      raw.onerror = function (event) {
        if (event.preventDefault) event.preventDefault();
        if (index === 0) self._fallback();
        else {
          slot.pending.forEach(function (p) { p.reject(new Error('工作线程错误')); });
          slot.pending.clear();
          try { raw.terminate(); } catch (e) {}
          self.pool[index] = null;
        }
      };
      raw.onmessageerror = function () {
        if (index === 0) self._fallback();
        else {
          slot.pending.forEach(function (p) { p.reject(new Error('工作线程消息错误')); });
          slot.pending.clear();
          try { raw.terminate(); } catch (e) {}
          self.pool[index] = null;
        }
      };
      this.pool[index] = slot;
      if (index === 0) this.worker = raw;
      return slot;
    } catch (e) {
      if (index === 0) {
        this._releaseWorker();
        if (!this.options.workerFactory && !this.portable && root.NSG_WORKER_MODULES) {
          this.portable = true; return this._slot(0);
        }
        this.disabled = true;
      }
      return null;
    }
  };
  Client.prototype._callSlot = async function (slotIndex, type, data, transferInput) {
    var slot = this._slot(slotIndex) || this._slot(0);
    if (!slot) throw new Error('Worker unavailable');
    var needed = null;
    if (this.portable) {
      needed = jobDictLangs(type, data);
      if (needed.length) await Promise.all(needed.map(function (lang) { return NSG.loadDict(lang); }));
      if (this.closed || this.pool[slot.index] !== slot) throw cancelled();
    }
    var reqId = ++this.reqSerial;
    var payload = { id: reqId, type: type, data: data };
    if (this.portable && root.NSG_DICT && needed && needed.length) {
      var unsent = null;
      for (var i = 0; i < needed.length; i++) {
        var L = needed[i];
        if (!slot.sentDicts[L] && root.NSG_DICT[L] !== undefined) {
          if (!unsent) unsent = {};
          unsent[L] = root.NSG_DICT[L];
          slot.sentDicts[L] = true;
        }
      }
      if (unsent) payload.dicts = unsent;
    }
    var inBuffers = [];
    if (transferInput) collectTransfers(data, inBuffers);
    var self = this;
    return new Promise(function (resolve, reject) {
      slot.pending.set(reqId, { resolve: resolve, reject: reject });
      try {
        if (slot.index === 0 && !self.started && !self.startupTimer) {
          self.startupTimer = setTimeout(function () { self._fallback(); }, 30000);
        }
        if (inBuffers.length) slot.worker.postMessage(payload, inBuffers);
        else slot.worker.postMessage(payload);
      } catch (e) {
        slot.pending.delete(reqId);
        reject(e);
      }
    });
  };
  Client.prototype._cacheDryTrack = function (key, hit) {
    var bytes = hit.pcm.buffer.byteLength;
    if (bytes > MAX_DRY_TRACK_BYTES) return;
    while (this.dryTrackCache.size >= 24 || this.dryTrackBytes + bytes > MAX_DRY_TRACK_BYTES) {
      var oldest = this.dryTrackCache.keys().next().value;
      this.dryTrackBytes -= this.dryTrackCache.get(oldest).pcm.buffer.byteLength;
      this.dryTrackCache.delete(oldest);
    }
    this.dryTrackCache.set(key, hit);
    this.dryTrackBytes += bytes;
  };
  Client.prototype._renderTrackParallel = async function (job, score, trk, timbre, opt) {
    var allowSlice = opt.hd === true || (trk.notes && trk.notes.length >= 80);
    if (!allowSlice || this.maxWorkers <= 1 || !NSG.DSP || !NSG.DSP.planVocalSlices) {
      return this._callSlot(0, 'vocalTrack', { score: score, trk: trk, timbre: timbre, opt: opt }, false);
    }
    var plan = NSG.DSP.planVocalSlices(score, trk, timbre, opt, this.maxWorkers);
    if (!plan.slices || plan.slices.length <= 1) {
      return this._callSlot(0, 'vocalTrack', { score: score, trk: trk, timbre: timbre, opt: opt }, false);
    }
    var self = this;
    var chunks = await Promise.all(plan.slices.map(function (spec, idx) {
      return self._callSlot(idx % self.maxWorkers, 'vocalSlice', {
        score: score, trk: trk, timbre: timbre, opt: opt, sliceRange: spec
      }, false);
    }));
    if (this.closed || this.active !== job) throw cancelled();
    return this._callSlot(0, 'vocalFinalizeTrack', {
      chunks: chunks, total: 0, mixGains: null, opt: opt
    }, true);
  };
  Client.prototype._runVocalParallel = async function (job) {
    var start = performance.now(), data = job.data;
    var opt = {
      rawSource: data.rawSource, hd: data.hd, legacySound: data.legacySound,
      modeBFricWaveguide: data.modeBFricWaveguide, modeBHighPolish: data.modeBHighPolish,
      headroom: data.headroom === true
    };
    var vocalTracks = activeVocalTracksOf(data.score);
    if (!vocalTracks.length) {
      var emptyRes = await this._callSlot(0, 'vocal', data, false);
      emptyRes.mode = 'worker';
      return emptyRes;
    }
    var entries = vocalTracks.map(function (trk) {
      var k = dryTrackKeyOf(data.score, trk, data.timbre, opt);
      var hit = this.dryTrackCache.get(k);
      if (hit) { this.dryTrackCache.delete(k); this.dryTrackCache.set(k, hit); }
      return { trk: trk, key: k, hit: hit || null };
    }, this);
    var uncached = entries.filter(function (e) { return !e.hit; });
    if (uncached.length === 1) {
      var one = uncached[0];
      one.hit = await this._renderTrackParallel(job, data.score, one.trk, data.timbre, opt);
      if (this.closed || this.active !== job) throw cancelled();
      this._cacheDryTrack(one.key, one.hit);
    } else if (uncached.length > 1) {
      var self = this, nextIdx = 0;
      var concurrency = Math.min(this.maxWorkers, uncached.length);
      var workers = [];
      for (var w = 0; w < concurrency; w++) {
        (function (slotIdx) {
          workers.push((async function () {
            while (nextIdx < uncached.length) {
              var e = uncached[nextIdx++];
              var res = await self._callSlot(slotIdx, 'vocalTrack', {
                score: data.score, trk: e.trk, timbre: data.timbre, opt: opt
              }, false);
              if (self.closed || self.active !== job) throw cancelled();
              e.hit = res;
              self._cacheDryTrack(e.key, res);
            }
          })());
        })(w);
      }
      await Promise.all(workers);
      if (this.closed || this.active !== job) throw cancelled();
    }
    var items = entries.map(function (e) {
      // Clone if retained in cache so transferring to Worker 0 does not detach the cached buffer.
      var pcmCopy = this.dryTrackCache.has(e.key) ? new Float32Array(e.hit.pcm) : e.hit.pcm;
      return { pcm: pcmCopy, sr: e.hit.sr, vol: e.trk.vol, pan: e.trk.pan };
    }, this);
    var sr = items[0] && items[0].sr ? items[0].sr : (opt.hd === true ? 48000 : 16000);
    var vNotes = vocalTracks[0] ? vocalTracks[0].notes : [];
    var harmF0 = data.includeAnalysis !== false && vNotes.length
      ? NSG.mtof(vNotes[Math.min(vNotes.length - 1, Math.floor(vNotes.length * 0.4))].pitch) : 0;
    var out = await this._callSlot(0, 'vocalMixAnalyze', {
      items: items, sr: sr, headroom: opt.headroom === true,
      includeAnalysis: data.includeAnalysis !== false, harmF0: harmF0
    }, true);
    out.milliseconds = performance.now() - start;
    out.mode = 'worker-pool';
    return out;
  };
  Client.prototype._runAccompParallel = async function (job) {
    var start = performance.now(), data = job.data;
    var tracks = (data.score && data.score.tracks) || [];
    var instTrk = null;
    for (var i = 0; i < tracks.length; i++) if (tracks[i] && tracks[i].type === 'inst') { instTrk = tracks[i]; break; }
    var noteCount = instTrk && Array.isArray(instTrk.notes) ? instTrk.notes.length : 0;
    if (noteCount < 48 || this.maxWorkers <= 1) {
      var singleRes = await this._callSlot(0, 'accomp', data, false);
      singleRes.mode = 'worker';
      return singleRes;
    }
    var W = Math.min(this.maxWorkers, Math.max(2, Math.floor(noteCount / 40)));
    var self = this, slicePromises = [];
    for (var w = 0; w < W; w++) {
      var a = Math.floor(noteCount * w / W), b = Math.floor(noteCount * (w + 1) / W);
      if (b <= a) continue;
      slicePromises.push(this._callSlot(w, 'accompSlice', {
        score: data.score, legacySound: data.legacySound, space: data.space, noteRange: [a, b]
      }, false));
    }
    var slices = await Promise.all(slicePromises);
    if (this.closed || this.active !== job) throw cancelled();
    var valid = slices.filter(function (s) { return s && !s.empty && s.total > 0; });
    if (!valid.length) {
      return { audio: null, peak: 0, env: null, milliseconds: performance.now() - start, backend: 'wasm', mode: 'worker-pool' };
    }
    var total = valid[0].total, sr = valid[0].sr, spaceName = valid[0].spaceName, spb0 = valid[0].spb0;
    var legacySound = !!valid[0].legacySound;
    var left = new Float32Array(total), right = new Float32Array(total), mainEnd = 0;
    var busNames = ['hall', 'plate', 'delay', 'chorus'];
    var buses = {}, busEnds = { hall: 0, plate: 0, delay: 0, chorus: 0 };
    for (var bi = 0; bi < busNames.length; bi++) {
      var bn = busNames[bi];
      if (spaceName && valid.some(function (s) { return !!s[bn + 'L']; })) {
        buses[bn] = [new Float32Array(total), new Float32Array(total)];
      }
    }
    function accStereoSpan(dL, dR, sL, sR, off, len, prevEnd) {
      var over = off < prevEnd ? Math.min(len, prevEnd - off) : 0;
      for (var k = 0; k < over; k++) { dL[off + k] += sL[k]; dR[off + k] += sR[k]; }
      if (over === 0) { dL.set(sL, off); dR.set(sR, off); }
      else if (over < len) { dL.set(sL.subarray(over), off + over); dR.set(sR.subarray(over), off + over); }
      return Math.max(prevEnd, off + len);
    }
    for (var si = 0; si < valid.length; si++) {
      var ch = valid[si], off = ch.offset, len = ch.length;
      mainEnd = accStereoSpan(left, right, ch.left, ch.right, off, len, mainEnd);
      for (var bj = 0; bj < busNames.length; bj++) {
        var bName = busNames[bj], pair = buses[bName];
        if (!pair) continue;
        var sL = ch[bName + 'L'], sR = ch[bName + 'R'];
        if (!sL) continue;
        busEnds[bName] = accStereoSpan(pair[0], pair[1], sL, sR, off, len, busEnds[bName]);
      }
    }
    var wetList = [];
    if (spaceName) {
      var activeEffects = [];
      for (var bk = 0; bk < busNames.length; bk++) {
        var eName = busNames[bk], bPair = buses[eName];
        if (!bPair) continue;
        var nonZero = false, a0 = bPair[0], b0 = bPair[1];
        for (var z = 0; z < total; z++) { if (a0[z] !== 0 || b0[z] !== 0) { nonZero = true; break; } }
        if (nonZero) activeEffects.push({ effect: eName, left: a0, right: b0 });
      }
      if (activeEffects.length) {
        wetList = await Promise.all(activeEffects.map(function (ef, idx) {
          return self._callSlot(idx % self.maxWorkers, 'accompSpace', {
            effect: ef.effect, left: ef.left, right: ef.right, sr: sr, spaceName: spaceName, spb0: spb0
          }, true);
        }));
        if (this.closed || this.active !== job) throw cancelled();
      }
    }
    var out = await this._callSlot(0, 'accompFinalize', {
      left: left, right: right, wetList: wetList, sr: sr, spaceName: spaceName, legacySound: legacySound
    }, true);
    out.milliseconds = performance.now() - start;
    out.mode = 'worker-pool';
    return out;
  };
  Client.prototype._runTuneParallel = async function (job) {
    var start = performance.now(), data = job.data;
    if ((data.options && data.options.vel === false) || this.maxWorkers <= 1) {
      var singleRes = await this._callSlot(0, 'tune', data, false);
      singleRes.mode = 'worker';
      return singleRes;
    }
    var init = await this._callSlot(0, 'tuneStart', data, false);
    if (this.closed || this.active !== job) throw cancelled();
    if (init.done) {
      init.milliseconds = performance.now() - start;
      init.mode = 'worker-pool';
      return init;
    }
    var probe = init.probe, passes = init.passes, timbre = init.timbre;
    var baseOpt = data.options || {};
    for (var p = 0; p < passes.length; p++) {
      var passOpt = {
        rawSource: !!baseOpt.rawSource,
        hd: passes[p].hd === true,
        modeBFricWaveguide: baseOpt.modeBFricWaveguide,
        modeBHighPolish: baseOpt.modeBHighPolish
      };
      var rendered = await this._renderTrackParallel(job, probe, probe.tracks[0], timbre, passOpt);
      if (this.closed || this.active !== job) throw cancelled();
      var step = await this._callSlot(0, 'tuneStep', {
        tuneId: init.tuneId, passIndex: p, pcm: rendered.pcm, sr: rendered.sr
      }, true);
      if (this.closed || this.active !== job) throw cancelled();
      if (step.done) {
        step.milliseconds = performance.now() - start;
        step.mode = 'worker-pool';
        return step;
      }
      probe = step.probe;
    }
    throw new Error('自动调教未正常完成');
  };
  Client.prototype._fallback = function () {
    if (this.disabled && !this.pool.length) return;
    clearTimeout(this.startupTimer); this.startupTimer = null;
    this._releaseWorker(); this.started = false;
    if (!this.options.workerFactory && !this.portable && root.NSG_WORKER_MODULES) this.portable = true;
    else this.disabled = true;
    if (this.active) this._dispatch(this.active);
  };
  Client.prototype._dispatch = async function (job) {
    var self = this, slot = this._slot(0);
    if (slot) {
      try {
        var result;
        if (this.maxWorkers > 1 && job.type === 'vocal') {
          result = await this._runVocalParallel(job);
        } else if (this.maxWorkers > 1 && job.type === 'accomp') {
          result = await this._runAccompParallel(job);
        } else if (this.maxWorkers > 1 && job.type === 'tune') {
          result = await this._runTuneParallel(job);
        } else {
          result = await this._callSlot(0, job.type, job.data, false);
          result.mode = 'worker';
        }
        if (this.closed || this.active !== job) return;
        this._finish(job, null, result);
      } catch (e) {
        if (this.closed || this.active !== job) return;
        if (e && e.name === 'AbortError') return;
        if (!this.started) { this._fallback(); return; }
        this._finish(job, e);
      }
      return;
    }
    // When every Worker is denied, fail visibly instead of freezing the browser.
    // Keep the synchronous route for Node tools and explicit fallback diagnostics.
    if (typeof document !== 'undefined' && !this.options.allowMainThread) {
      this._finish(job, new Error('浏览器无法启用后台计算，请允许 Web Worker 后重试'));
      return;
    }
    setTimeout(function () {
      if (self.closed || self.active !== job) return;
      try {
        var result = execute(job.type, job.data); result.mode = 'main';
        self._finish(job, null, result);
      } catch (e) { self._finish(job, e); }
    }, 0);
  };
  Client.prototype._finish = function (job, error, result) {
    if (this.active !== job) return;
    this.started = true; clearTimeout(this.startupTimer); this.startupTimer = null; this.active = null;
    if (error) job.reject(error);
    else {
      if (job.key !== null) {
        var entry = { key: job.key, result: result, noAnalysis: !!job.noAnalysis };
        this.cache[job.type] = entry;
        if (job.type === 'vocal') this.vocalByMode[job.data && job.data.hd === true ? 'hd' : 'std'] = entry;
      }
      job.resolve(result);
    }
    this._pump();
  };
  Client.prototype._pump = function () {
    if (this.closed || this.active || !this.queue.length) return;
    this.active = this.queue.shift(); this._dispatch(this.active);
  };
  Client.prototype._submit = function (type, data, key, isHd, requireAnalysis) {
    if (this.closed) return Promise.reject(cancelled());
    if (key !== null && type === 'vocal') {
      var modeKey = isHd !== undefined ? (isHd ? 'hd' : 'std') : (data && data.hd === true ? 'hd' : 'std');
      var modeCached = this.vocalByMode[modeKey];
      if (modeCached && modeCached.key === key && (!requireAnalysis || !modeCached.noAnalysis)) {
        this.cache.vocal = modeCached;
        return Promise.resolve(modeCached.result);
      }
    }
    var cached = this.cache[type];
    if (key !== null && cached && cached.key === key && !(type === 'vocal' && requireAnalysis && cached.noAnalysis)) {
      return Promise.resolve(cached.result);
    }
    if (key !== null && this.active && this.active.type === type && this.active.key === key &&
        !(type === 'vocal' && requireAnalysis && this.active.noAnalysis)) {
      return this.active.promise;
    }
    for (var i = 0; i < this.queue.length; i++) {
      var old = this.queue[i];
      if (old.type !== type) continue;
      if (key !== null && old.key === key && !(type === 'vocal' && requireAnalysis && old.noAnalysis)) return old.promise;
      this.queue.splice(i--, 1); old.reject(cancelled());
    }
    var resolvedData = typeof data === 'function' ? data() : data;
    var job = {
      id: ++this.serial, type: type, key: key, data: resolvedData,
      noAnalysis: !!(type === 'vocal' && resolvedData && resolvedData.includeAnalysis === false)
    };
    job.promise = new Promise(function (resolve, reject) { job.resolve = resolve; job.reject = reject; });
    this.queue.push(job); this._pump(); return job.promise;
  };
  Client.prototype.vocal = function (score, timbre, raw, hd, waveguide, highPolish, opt) {
    var baseKey = vocalKey(score, timbre, raw, hd, waveguide, highPolish);
    var headroom = !(opt && opt.headroom === false);
    var key = headroom ? baseKey : baseKey + '|limited';
    var includeAnalysis = opt ? opt.includeAnalysis !== false : this.includeAnalysis !== false;
    return this._submit('vocal', function () {
      var d = JSON.parse(baseKey);
      if (!includeAnalysis) d.includeAnalysis = false;
      d.headroom = headroom;
      return d;
    }, key, hd === true, includeAnalysis);
  };
  Client.prototype.accomp = function (score) {
    var key = accompKey(score);
    return this._submit('accomp', function () { return JSON.parse(key); }, key, false, false);
  };
  Client.prototype.extract = function (pcm, sr, widePcm, wideRate) {
    var data = { pcm: pcm.slice(), sr: sr };
    if (widePcm) { data.widePcm = widePcm.slice(); data.wideRate = wideRate; }
    return this._submit('extract', data, null);
  };
  Client.prototype.compute = function (type, data) {
    if (type === 'read' && data && data.bytes instanceof Uint8Array) {
      return this._submit(type, { name: data.name, bytes: data.bytes, kind: data.kind }, null);
    }
    if (type === 'analyzeVocal' && data && data.pcm instanceof Float32Array) {
      return this._submit(type, { pcm: data.pcm, sr: data.sr, f0: data.f0 }, null);
    }
    // Capture now, before waiting behind an active render. Keep typed arrays and shared references.
    var snapshot = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
    return this._submit(type, snapshot, type === 'arrange' ? stableKey(data) : null);
  };
  Client.prototype.close = function () {
    this.closed = true; clearTimeout(this.startupTimer); this.startupTimer = null;
    this._releaseWorker();
    if (this.active) this.active.reject(cancelled());
    this.queue.forEach(function (job) { job.reject(cancelled()); });
    this.active = null; this.queue = []; this.cache = {}; this.vocalByMode = { std: null, hd: null };
    this.dryTrackCache.clear(); this.dryTrackBytes = 0;
  };
  NSG.Renderer = { create: function (options) { return new Client(options); },
    vocalKey: vocalKey, accompKey: accompKey, jobDictLangs: jobDictLangs, execute: execute };
})(typeof window !== 'undefined' ? window : globalThis);
