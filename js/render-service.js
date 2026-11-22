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
    if (!data || type === 'accomp' || type === 'extract' || type === 'analyzeVocal') return [];
    if (type === 'read') return data.kind === 'nsg' ? [] : ['zh', 'en'];
    var extra = data.options && (data.options.phonemizer || data.options.lang);
    if (type === 'normalize' && data.imported) {
      return NSG.collectScoreLanguages ? NSG.collectScoreLanguages(data.imported, extra) : ['zh', 'en', 'ja'];
    }
    if (data.score && NSG.collectScoreLanguages) return NSG.collectScoreLanguages(data.score, extra);
    return ['zh'];
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
  function renderVocalWithCache(score, timbre, opt) {
    if (!NSG.DSP.renderTrack || !NSG.DSP.mixVocalTracks) return NSG.DSP.render(score, timbre, opt);
    var tracks = (score && score.tracks) || [];
    var hasVocalType = tracks.some(function (t) { return t && t.type === 'vocal'; });
    var vocalTracks = hasVocalType
      ? tracks.filter(function (t) { return t && t.type === 'vocal' && !t.muted && t.notes && t.notes.length; })
      : (tracks[0] && !tracks[0].muted && tracks[0].notes && tracks[0].notes.length ? [tracks[0]] : []);
    if (!vocalTracks.length) return NSG.DSP.render(score, timbre, opt);
    var items = vocalTracks.map(function (trk) {
      var keyObj = {
        tempo: score.tempo, tempos: score.tempos, notes: trk.notes,
        pit: trk.pit && trk.pit.length ? trk.pit : undefined,
        lang: trk.lang || score.lang,
        phonemizer: trk.phonemizer !== undefined ? trk.phonemizer : score.phonemizer,
        timbre: trk.timbre || timbre,
        rawSource: !!opt.rawSource, hd: opt.hd === true,
        legacySound: !!(opt.legacySound || NSG.LEGACY_SOUND),
        modeBFricWaveguide: opt.modeBFricWaveguide,
        modeBHighPolish: opt.modeBHighPolish
      };
      var k = JSON.stringify(keyObj);
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
    } else if (type === 'analyzeVocal') {
      result = {
        grid: NSG.AN.spectrumGrid(data.pcm, { hop: 512, sampleRate: data.sr }),
        harmonics: data.f0 > 0 ? NSG.AN.harmonics(data.pcm, data.f0, 16, data.sr) : null
      };
    } else if (type === 'accomp') {
      var acc = NSG.DSP.renderAccomp(data.score, { legacySound: data.legacySound, space: data.space });
      var accLevels = acc ? meter(acc.channels, acc.sr) : { peak: 0, env: null };
      result = { audio: acc, peak: accLevels.peak, env: accLevels.env };
    } else if (type === 'extract') {
      result = NSG.AN.extractFormants(data.pcm, data.sr, data.widePcm ? { widePcm: data.widePcm, wideRate: data.wideRate } : undefined);
    } else if (type === 'tune' || type === 'fit') {
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
      } else result = { fit: NSG.TUNING.simplifyPitch(targets, data.tolerance === undefined ? 1 : data.tolerance, { score: trScore, track: tr }), notes: notes, pit: tr.pit || [] };
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
    this.sentDicts = Object.create(null);
  }
  function portableWorkerMain() {
    self.NSG_DICT = self.NSG_DICT || {};
    var ready = NSG.WASM && NSG.WASM.init ? NSG.WASM.init() : Promise.resolve(false);
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
  Client.prototype._portableWorker = function () {
    var modules = root.NSG_WORKER_MODULES;
    var names = ['phonemes', 'timbre', 'g2p', 'tempo', 'tuning', 'instruments', 'fft-wasm',
      'dsp', 'analyze', 'compose', 'fzstd', 'fflate', 'project-imports', 'io', 'render-service'];
    var parts = ['self.window = self; self.global = self;\n'];
    names.forEach(function (name) {
      if (!modules || !modules[name]) throw Error('后台模块未就绪：' + name);
      parts.push('(' + modules[name].toString() + ')(self);\n');
    });
    parts.push('(' + portableWorkerMain.toString() + ')();');
    var url = root.URL.createObjectURL(new root.Blob(parts, { type: 'text/javascript' }));
    var worker;
    try {
      worker = new root.Worker(url);
      this.sentDicts = Object.create(null);
      worker.postMessage({ initialize: true, dictionaries: {} });
      this.workerUrl = url;
      return worker;
    } catch (e) { if (worker) worker.terminate(); root.URL.revokeObjectURL(url); throw e; }
  };
  Client.prototype._releaseWorker = function () {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.sentDicts = Object.create(null);
    if (this.workerUrl) { root.URL.revokeObjectURL(this.workerUrl); this.workerUrl = null; }
  };
  Client.prototype._worker = function () {
    if (this.worker || this.disabled) return this.worker;
    var self = this;
    try {
      if (!this.options.workerFactory && root.location && root.location.protocol === 'file:') this.portable = true;
      this.worker = this.options.workerFactory ? this.options.workerFactory() :
        this.portable ? this._portableWorker() : new root.Worker('js/render-worker.js');
      this.worker.onmessage = function (event) {
        var message = event.data, job = self.active;
        if (message.ready) {
          self.started = true; clearTimeout(self.startupTimer);
          if (self.workerUrl) { root.URL.revokeObjectURL(self.workerUrl); self.workerUrl = null; }
          return;
        }
        if (!job || message.id !== job.id) return;
        clearTimeout(self.startupTimer);
        if (message.error) self._finish(job, new Error(message.error));
        else { message.result.mode = 'worker'; self._finish(job, null, message.result); }
      };
      this.worker.onerror = function (event) {
        if (event.preventDefault) event.preventDefault();
        self._fallback();
      };
      this.worker.onmessageerror = function () { self._fallback(); };
    } catch (e) {
      this._releaseWorker();
      if (!this.options.workerFactory && !this.portable && root.NSG_WORKER_MODULES) {
        this.portable = true; return this._worker();
      }
      this.disabled = true;
    }
    return this.worker;
  };
  Client.prototype._fallback = function () {
    if (this.disabled && !this.worker) return;
    clearTimeout(this.startupTimer);
    this._releaseWorker(); this.started = false;
    if (!this.options.workerFactory && !this.portable && root.NSG_WORKER_MODULES) this.portable = true;
    else this.disabled = true;
    if (this.active) this._dispatch(this.active);
  };
  Client.prototype._dispatch = async function (job) {
    var self = this, worker = this._worker();
    if (worker) {
      var needed;
      if (this.portable) {
        needed = jobDictLangs(job.type, job.data);
        try { await Promise.all(needed.map(function (lang) { return NSG.loadDict(lang); })); }
        catch (e) { if (this.worker === worker) this._finish(job, e); return; }
        if (this.worker !== worker || this.active !== job) return;
      }
      try {
        // Only the first response has a startup deadline; long songs may take longer.
        if (!this.started) this.startupTimer = setTimeout(function () { self._fallback(); }, 30000);
        var payload = { id: job.id, type: job.type, data: job.data };
        if (this.portable && root.NSG_DICT) {
          var unsent = null;
          for (var i = 0; i < needed.length; i++) {
            var L = needed[i];
            if (!this.sentDicts[L] && root.NSG_DICT[L] !== undefined) {
              if (!unsent) unsent = {};
              unsent[L] = root.NSG_DICT[L];
              this.sentDicts[L] = true;
            }
          }
          if (unsent) payload.dicts = unsent;
        }
        worker.postMessage(payload);
        return;
      } catch (e) { this._fallback(); return; }
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
    this.started = true; this.active = null;
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
    this.closed = true; clearTimeout(this.startupTimer);
    this._releaseWorker();
    if (this.active) this.active.reject(cancelled());
    this.queue.forEach(function (job) { job.reject(cancelled()); });
    this.active = null; this.queue = []; this.cache = {}; this.vocalByMode = { std: null, hd: null };
  };
  NSG.Renderer = { create: function (options) { return new Client(options); },
    vocalKey: vocalKey, accompKey: accompKey, jobDictLangs: jobDictLangs, execute: execute };
})(typeof window !== 'undefined' ? window : globalThis);
