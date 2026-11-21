/* Additional singing project readers. Format reference: LibreSVIP (MIT). */
(function projectImports(root) {
  'use strict';
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['project-imports'] = projectImports;
  const NSG = root.NSG = root.NSG || {};
  const PPQ = 480;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const utf16 = new TextDecoder('utf-16le', { fatal: true });
  const gb18030 = new TextDecoder('gb18030', { fatal: true });

  function check(valid, format) {
    if (!valid) throw new Error(format + ' 工程结构无效或数据不完整');
  }

  class Reader {
    constructor(bytes, format) {
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.pos = 0;
      this.format = format;
    }
    take(length) {
      const start = this.pos;
      check(Number.isSafeInteger(length) && length >= 0 && length <= this.bytes.length - start, this.format);
      this.pos += length;
      return start;
    }
    skip(length) { this.take(length); }
    u8() { return this.view.getUint8(this.take(1)); }
    u32() { return this.view.getUint32(this.take(4), true); }
    i32() { return this.view.getInt32(this.take(4), true); }
    f64() { return this.view.getFloat64(this.take(8), true); }
    i64() { return Number(this.view.getBigInt64(this.take(8), true)); }
    block(length) { const start = this.take(length); return this.bytes.subarray(start, this.pos); }
    section() { return new Reader(this.block(this.u32()), this.format); }
    string() {
      const bytes = this.block(this.u32());
      try { return utf8.decode(bytes); }
      catch (error) {
        // Some SHARPKEY projects contain legacy GBK strings alongside UTF-8.
        return gb18030.decode(bytes);
      }
    }
    wide(length) { return utf16.decode(this.block(length)).replace(/\0.*$/s, ''); }
    expect(value) { check(this.u8() === value, this.format); }
    array(count, minSize, read) {
      check(count <= Math.floor((this.bytes.length - this.pos) / minSize), this.format);
      return Array.from({ length: count }, () => read(this));
    }
  }

  // Both XML formats also load in Web Workers, where DOMParser is unavailable.
  function xml(text, format) {
    const doc = { name: '', children: [], text: '' };
    const stack = [doc];
    const token = /<!--[^]*?-->|<\?[^]*?\?>|<!\[CDATA\[[^]*?\]\]>|<\/(\w[\w.:-]*)\s*>|<(\w[\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|[^<]+/gy;
    const attr = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    function unescape(value) {
      return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, key) => {
        if (key[0] !== '#') return entities[key];
        const scalar = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        check(scalar > 0 && scalar <= 0x10ffff && !(scalar >= 0xd800 && scalar <= 0xdfff), format);
        return String.fromCodePoint(scalar);
      });
    }
    let end = 0, match;
    while ((match = token.exec(text))) {
      end = token.lastIndex;
      const full = match[0], node = stack[stack.length - 1];
      if (match[1]) {
        check(stack.length > 1 && match[1] === node.name, format);
        stack.pop();
      } else if (match[2]) {
        const props = Object.create(null);
        for (const [, key, quoted, single] of match[3].matchAll(attr)) props[key] = unescape(quoted ?? single);
        const child = { name: match[2], props, children: [], text: '' };
        node.children.push(child);
        if (!match[4]) stack.push(child);
      } else if (full.startsWith('<![CDATA[')) {
        node.text += full.slice(9, -3);
      } else if (full[0] !== '<' && full.trim()) {
        node.text += unescape(full);
      }
    }
    check(end === text.length && stack.length === 1 && doc.children.length === 1 && !doc.text, format);
    return doc.children[0];
  }

  function children(node, name) { return node ? node.children.filter(child => child.name === name) : []; }
  function child(node, name) { return node?.children.find(item => item.name === name); }
  function element(node, name) { return child(node, name)?.text.trim(); }
  function path(nodes, ...names) {
    for (const name of names) nodes = nodes.flatMap(node => children(node, name));
    return nodes;
  }

  function tempoMap(events) {
    const sorted = events.filter(p => Number.isFinite(p.tick) && Number.isFinite(p.bpm) && p.bpm > 0)
      .sort((a, b) => a.tick - b.tick);
    const byBeat = new Map();
    for (const p of sorted) {
      const beat = Math.max(0, p.tick / PPQ);
      byBeat.set(beat, p.bpm);
    }
    const tempos = [{ beat: 0, bpm: byBeat.values().next().value || 120 }];
    for (const [beat, bpm] of byBeat) {
      if (bpm !== tempos.at(-1).bpm) tempos.push({ beat, bpm });
    }
    return tempos;
  }

  function noteAt(tick, length, pitch, lyric, lang, format, helpers) {
    if (![tick, length, pitch].every(Number.isFinite) || length <= 0 || tick + length <= 0 || pitch < 0 || pitch > 127) return null;
    const start = Math.max(0, tick);
    return helpers.setLyric({ start: start / PPQ, dur: (tick + length - start) / PPQ, pitch, vib: 0 }, lyric, format, lang);
  }

  // Convert sparse/dense source samples to per-note cents. A null sample marks
  // a break; ignore that span so an undefined pitch never bridges two regions.
  function applyPitch(notes, samples) {
    if (!notes.length || !samples.length) return;
    samples.sort((a, b) => a[0] - b[0]);
    const points = samples.filter((p, i) => p[0] !== samples[i + 1]?.[0]);
    for (const note of notes) {
      const start = note.start * PPQ, end = (note.start + note.dur) * PPQ;
      let lo = 0, hi = points.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid][0] <= start) lo = mid + 1;
        else hi = mid;
      }
      const base = note.pitch * 100;
      const bend = [];
      function push(tick, value) {
        const p = [(tick - start) / (end - start), value === null ? 0 : value - base, 'l'];
        if (bend.at(-1)?.[0] === p[0]) bend.pop();
        bend.push(p);
      }
      for (let i = Math.max(0, lo - 1); i < points.length && points[i][0] < end; i++) {
        const [x, y] = points[i], next = points[i + 1];
        if (y === null || !next || next[0] <= start) continue;
        const [x2, y2] = next;
        const from = Math.max(start, x), to = Math.min(end, x2);
        const valueAt = tick => y2 === null ? y : y + (y2 - y) * (tick - x) / (x2 - x);
        if (from > start && points[i - 1]?.[1] == null) push(Math.max(start, from - 0.02), null);
        push(from, valueAt(from));
        if (to === end || y2 === null) push(Math.max(from, to === end ? to : to - 0.02), valueAt(to));
        if (y2 === null && to < end) push(to, null);
      }
      if (bend.some(p => Math.abs(p[1]) > 0.25)) note.pb = bend;
    }
  }

  function groupPart(notes, helpers) {
    notes.sort((a, b) => a.start - b.start);
    if (notes.length) notes[0].pitchJoin = false;
    helpers.groupLyrics(notes);
    return notes;
  }

  function hasMeterChanges(meters, firstBar = 0) {
    return meters.some(m => m.numerator !== 4 || m.denominator !== 4 || m.bar > firstBar);
  }

  function barTicks(meter) {
    return meter?.numerator > 0 && meter?.denominator > 0 ? PPQ * 4 * meter.numerator / meter.denominator : 4 * PPQ;
  }

  function trackLanguage(notes, helpers) {
    return notes.some(note => /[\u3041-\u30ff]/.test(note?.lyric || '')) ? 'ja' : helpers.guessLyricLanguage(notes.filter(Boolean));
  }

  function readSharpkey(bytes, format, helpers) {
    const file = new Reader(bytes, format);
    check(utf8.decode(file.block(8)) === 'SHARPKEY', format);
    file.u32(); // Version; optional record fields are declared by the feature tags.
    const project = file.section(), features = new Set();
    while (project.bytes[project.pos] === 0x65 && project.bytes[project.pos + 1] === 0x78 &&
           project.bytes[project.pos + 2] === 0x74) features.add(utf8.decode(project.block(4)));
    function sectionArray(reader, minSize, read) {
      const section = reader.section();
      return section.array(section.u32(), minSize, read);
    }
    const events = sectionArray(project, 8, r => ({ tick: r.i32(), bpm: r.u32() / 100 }));
    const meters = sectionArray(project, 12, r => ({ bar: r.i32(), numerator: r.u32(), denominator: r.u32() }))
      .sort((a, b) => a.bar - b.bar);
    // The native editor counts both clip and tempo positions from the
    // beginning of its fixed pre-measures (bar -3 through bar 0).
    let prefix = meters.length ? 0 : 4 * PPQ * 4;
    for (let i = 0; i < meters.length && meters[i].bar <= 1; i++) {
      const meter = meters[i];
      const end = Math.min(1, meters[i + 1]?.bar ?? 1);
      prefix += (end - meter.bar) * Math.round(barTicks(meter));
    }
    events.forEach(p => { p.tick -= prefix; });
    let audio = false;
    const tracks = project.array(project.u32(), 22, r => {
      const type = r.u32(), name = r.string(), muted = !!r.u8();
      r.skip(9); // Solo, level and balance (legacy editor units).
      check(type === 0 || type === 1, format);
      if (type === 1) {
        const clips = r.section();
        audio ||= clips.u32() > 0;
        return null;
      }
      const parts = sectionArray(r, 44, s => {
        const offset = s.u32() - prefix;
        s.skip(4); // Clip length
        s.string(); // Clip name
        s.string(); // Voicebank
        const entries = sectionArray(s, 33, n => {
          const tick = offset + n.i32(), length = n.u32(), key = 115 - n.u32();
          n.skip(4);
          const reading = n.string(), lyric = n.string();
          n.skip(1);
          n.section(); // Note vibrato
          n.section(); // Additional note parameters
          if (features.has('ext1')) n.skip(18);
          if (features.has('ext2')) n.skip(16);
          if (features.has('ext4')) n.skip(4);
          if (features.has('ext7')) { n.string(); n.skip(4); }
          return { tick, length, key, reading, lyric };
        });
        s.section(); // Volume
        const samples = sectionArray(s, 8, p => {
          const tick = p.i32(), cents = p.i32();
          return tick < 0 ? null : [offset + tick, cents >= 0 ? 11550 - cents : null];
        }).filter(Boolean);
        s.section(); // Breath
        for (const feature of ['ext3', 'ext5', 'ext6', 'ext7']) if (features.has(feature)) s.section();
        return { entries, samples };
      });
      const lang = trackLanguage(parts.flatMap(part => part.entries), helpers) || 'zh';
      const notes = parts.flatMap(part => {
        const clip = part.entries.map(n => {
          const note = noteAt(n.tick, n.length, n.key, n.lyric || n.reading, lang, format, helpers);
          if (note && lang === 'zh') helpers.nnReading(note, note.lyric, n.reading);
          return note;
        }).filter(Boolean);
        applyPitch(clip, part.samples);
        return groupPart(clip, helpers);
      });
      return { name, lang, muted, notes };
    }).filter(Boolean);
    return { tracks, events, audio, meter: hasMeterChanges(meters, 1) };
  }

  function readMuta(bytes, format, helpers) {
    const r = new Reader(bytes, format);
    r.u32(); // File version
    function list(reader, minSize, read) {
      reader.expect(10);
      return reader.array(reader.u32(), minSize + 1, item => { item.expect(10); return read(item); });
    }
    const events = list(r, 8, t => ({ tick: t.i32(), bpm: t.u32() / 100 }));
    const meters = list(r, 12, m => ({ bar: m.i32() + 1, numerator: m.u32(), denominator: m.u32() }));
    const prefix = Math.round(barTicks(meters.find(m => m.bar >= 0)));
    events.forEach(p => { p.tick += prefix; });
    let audio = false, talk = false;
    const tracks = list(r, 89, t => {
      const type = t.u32(), count = t.u32();
      t.expect(10);
      const muted = !!t.u32();
      t.skip(12); // Solo, level and pan
      const name = t.wide(12);
      t.skip(52);
      check(type >= 1 && type <= 3, format);
      const parts = t.array(count, 13, s => {
        s.expect(10);
        const offset = s.u32();
        s.skip(4);
        if (type === 3) { s.skip(s.u32()); audio = true; return []; }
        s.skip(520); // Speaker/singer name and ID
        if (type === 1) {
          s.expect(10);
          s.skip(s.u32());
          s.expect(10);
          s.skip(8);
          s.expect(10);
          const phonemes = s.u32();
          check(phonemes <= Math.floor((s.bytes.length - s.pos) / 15), format);
          for (let i = 0; i < phonemes; i++) {
            s.expect(10);
            s.skip(10);
            s.skip(s.u32());
          }
          talk = true;
          return [];
        }
        const notes = list(s, 84, n => {
          const tick = offset + n.i32(), length = n.u32(), key = 139 - n.u32();
          const lyric = n.wide(16), reading = n.wide(16);
          n.skip(40);
          const note = noteAt(tick, length, key, lyric || reading, 'zh', format, helpers);
          if (note) helpers.nnReading(note, note.lyric, reading);
          return note;
        }).filter(Boolean);
        let samples;
        for (let i = 0; i < 8; i++) {
          if (i === 3) {
            samples = list(s, 8, p => {
              const tick = p.i32(), cents = p.i32();
              return [offset + tick, cents > 0 && cents < 12900 ? cents + 1200 : null];
            });
          } else {
            s.expect(10);
            const size = s.u32();
            s.skip(size * 9);
          }
        }
        applyPitch(notes, samples);
        return groupPart(notes, helpers);
      });
      return type === 2 ? { name, muted, lang: 'zh', notes: parts.flat() } : null;
    }).filter(Boolean);
    r.expect(10);
    return { tracks, events, audio, talk, meter: hasMeterChanges(meters, 1) };
  }

  function normalizeLanguage(value, helpers) {
    const name = String(value || '');
    return helpers.importLang(name) || helpers.importLang(name.split(/[-_]/)[0]);
  }

  function bool(value) { return value === true || /^(true|1)$/i.test(value); }

  // JUCE ValueTree properties have length-prefixed variants, including an
  // embedded binary ValueTree in the PluginData property of a singing track.
  function readValueTree(r, depth = 0) {
    check(depth < 64, r.format);
    function number() {
      const width = r.u8();
      check(width <= 4, r.format);
      let result = 0;
      for (let i = 0; i < width; i++) result += r.u8() * 256 ** i;
      return result;
    }
    function string() {
      const end = r.bytes.indexOf(0, r.pos);
      check(end >= 0, r.format);
      const value = utf8.decode(r.block(end - r.pos));
      r.skip(1);
      return value;
    }
    const name = string(), props = Object.create(null), count = number();
    check(name && count <= (r.bytes.length - r.pos) / 2, r.format);
    for (let i = 0; i < count; i++) {
      const key = string();
      const bytes = r.block(number());
      if (!bytes.length) continue;
      const prop = new Reader(bytes, r.format);
      switch (prop.u8()) {
        case 1: props[key] = prop.i32(); break;
        case 2: props[key] = true; break;
        case 3: props[key] = false; break;
        case 4: props[key] = prop.f64(); break;
        case 5:
          check(bytes.at(-1) === 0, r.format);
          props[key] = utf8.decode(bytes.subarray(1, -1));
          break;
        case 6: props[key] = prop.i64(); break;
        case 8:
          if (key === 'PluginData') props[key] = readValueTree(prop, depth + 1);
          break;
      }
    }
    return { name, props, children: r.array(number(), 3, item => readValueTree(item, depth + 1)) };
  }

  function cevioScore(songs, defaultLang, format, helpers) {
    return path(songs, 'Score', 'Note').map(node => {
      const p = node.props;
      const languageId = Number(p.NoteLanguage);
      const lang = (languageId === 1 ? 'ja' : languageId === 2 ? 'en' : undefined) ||
        normalizeLanguage(p.Language, helpers) || (/[\u3041-\u30ff]/.test(p.Lyric || '') ? 'ja' : defaultLang);
      const lyric = p.Lyric === 'ー' ? '-' : p.Lyric;
      if (!lyric) return null;
      const note = noteAt(p.Clock / 2, p.Duration / 2, +p.PitchStep + 12 * (+p.PitchOctave + 1), lyric, lang, format, helpers);
      if (note && lang === 'en' && !note.slur && !note.wordJoin && /^[12]$/.test(p.Syllabic)) {
        note.wordJoin = true;
        note.wordJoinDirection = +p.Syllabic === 1 ? 'right' : 'left';
      }
      return note;
    }).filter(Boolean);
  }

  function cevioPitch(curves, toTick, notes) {
    for (const curve of curves) {
      let cursor = +(curve.props.Index ?? 0);
      const samples = [];
      for (const event of curve.children) {
        const index = +(event.props.Index ?? cursor);
        const count = +(event.props.Repeat ?? 1);
        const logHz = +(event.props.Value ?? event.text);
        if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(count) || count <= 0) continue;
        if (index > cursor) samples.push([toTick(cursor), null]);
        const midi = 6900 + (logHz - Math.log(440)) * 1200 / Math.LN2;
        const cents = event.name === 'Data' && midi >= 0 && midi <= 12700 ? midi : null;
        samples.push([toTick(index), cents]);
        cursor = index + count;
        if (count > 1) samples.push([toTick(cursor - 1), cents]);
      }
      if (samples.length) samples.push([toTick(cursor), null]);
      applyPitch(notes, samples);
    }
  }

  function readTechnoSpeech(doc, format, helpers) {
    const voisona = format === 'VoiSona';
    let sources, audio = false, talk = false;
    if (voisona) {
      check(doc.name === 'TSSolution', format);
      sources = path([doc], 'Tracks', 'Track').flatMap(track => {
        const p = track.props;
        if (p.Type === 2) { audio ||= !!child(track, 'AudioEvent'); return []; }
        const state = p.PluginData || child(child(track, 'PluginData'), 'StateInformation');
        const songs = children(state, 'Song');
        if (!songs.length) return [];
        const voice = child(state, 'VoiceInformation');
        return [{ name: p.Name, lang: normalizeLanguage(voice?.props.Language, helpers) || 'ja',
          muted: !!(p.State & 1), level: p.Volume, pan: p.Pan, songs, params: children(state, 'Parameter') }];
      });
    } else {
      check(doc.name === 'Scenario' || doc.name === 'Definition', format);
      const scenes = doc.name === 'Scenario' ? path([doc], 'Sequence', 'Scene') : [doc];
      sources = scenes.flatMap(scene => {
        const groups = new Map(path([scene], 'Groups', 'Group').map(group => [group.props.Id, group.props]));
        return path([scene], 'Units', 'Unit').flatMap(unit => {
          const p = unit.props, group = groups.get(p.Group) || {};
          if (p.Category === 'OuterAudio') { audio = true; return []; }
          if (p.Category !== 'SingerSong') { talk ||= p.Category === 'TextVocal'; return []; }
          const songs = children(unit, 'Song');
          return [{ name: group.Name, lang: normalizeLanguage(group.Language || p.Language, helpers) || 'ja',
            muted: bool(group.IsMuted), level: group.Volume, pan: +group.Pan / 100, songs, params: path(songs, 'Parameter') }];
        });
      });
    }
    const events = new Map();
    let tempoConflict = false, meter = false;
    const tracks = sources.map(source => {
      const ownEvents = path(source.songs, 'Tempo', 'Sound').map(node => ({ tick: node.props.Clock / 2, bpm: +node.props.Tempo }))
        .filter(event => Number.isFinite(event.tick) && Number.isFinite(event.bpm) && event.bpm > 0);
      for (const event of ownEvents) {
        if (!events.has(event.tick)) events.set(event.tick, event);
        else tempoConflict ||= events.get(event.tick).bpm !== event.bpm;
      }
      meter ||= path(source.songs, 'Beat', 'Time').some(t => +t.props.Beats !== 4 || +t.props.BeatType !== 4 || +t.props.Clock > 0);
      const notes = groupPart(cevioScore(source.songs, source.lang, format, helpers), helpers);
      const ctick = path(source.params, 'LogF0CTick');
      if (ctick.some(curve => curve.children.length)) {
        // Common Tick samples are spaced ten 960-PPQ clocks apart.
        cevioPitch(ctick, sample => sample * 5, notes);
      } else {
        const tm = NSG.TEMPO.map({ tempos: tempoMap(ownEvents) });
        cevioPitch(path(source.params, 'LogF0'), sample => tm.beatOf(sample / 200) * PPQ, notes);
      }
      const lang = notes.length && notes.every(note => note.lang === notes[0].lang) ? notes[0].lang : source.lang;
      return helpers.assignTrackMix({ name: source.name, lang, notes }, helpers.dbToLinear(Number(source.level) || 0, -96),
        Number(source.pan) || 0, source.muted);
    });
    return { tracks, events: [...events.values()], audio, talk, meter, tempoConflict };
  }

  function midiPitch(value) {
    const m = /^([A-G])([#♯b♭]*)(-?\d+)$/i.exec(value || '');
    if (!m) return NaN;
    let pitch = 'C D EF G A B'.indexOf(m[1].toUpperCase()) + (Number(m[3]) + 1) * 12;
    for (const sign of m[2]) pitch += sign === '#' || sign === '♯' ? 1 : -1;
    return pitch;
  }

  function readVocalSharp(doc, format, helpers) {
    const project = child(doc, 'Project');
    check(doc.name === 'VSPX' && project, format);
    const meters = children(project, 'Beat').map(node => ({
      bar: +element(node, 'barIndex'), numerator: +element(node, 'beatPerBar'), denominator: +element(node, 'barDivide')
    }));
    const prefix = Math.round(barTicks(meters.find(m => m.bar === 0)));
    const events = children(project, 'Tempo').map(t => {
      const tick = Number(element(t, 'pos') ?? 0);
      return { tick: tick === 0 ? 0 : tick + prefix, bpm: Number(element(t, 'bpm') ?? 120) };
    });
    const tracks = children(project, 'NoteTrack').map(track => {
      const entries = children(track, 'Note').map(n => ({
        tick: Number(element(n, 'pos')), length: Number(element(n, 'duration')),
        pitch: midiPitch(element(n, 'pitch')), lyric: element(n, 'lyric')
      }));
      const singer = element(track, 'Singer') || '';
      const lang = /日[语語]|Japanese/i.test(singer) ? 'ja' :
        /[中汉漢][文语語]|Mandarin/i.test(singer) ? 'zh' : trackLanguage(entries, helpers);
      const notes = entries.map(n => noteAt(n.tick, n.length, n.pitch, n.lyric, lang, format, helpers)).filter(Boolean);
      const samples = path([track], 'Parameter', 'P').map(p => [+element(p, 't'), +element(p, 'v')])
        .filter(p => p.every(Number.isFinite) && p[0] >= 0).sort((a, b) => a[0] - b[0]);
      const pit = [];
      for (let i = 0; i < samples.length; i++) {
        const [tick, cents] = samples[i];
        // P is an offset in cents over the source's generated pitch. Keep it
        // as an offset over Nosing's own transitions, with zero in undrawn gaps.
        if (tick > 0 && (!i || tick - samples[i - 1][0] > 1)) pit.push([(tick - 0.02) / PPQ, 0]);
        pit.push([tick / PPQ, cents]);
        if (!samples[i + 1] || samples[i + 1][0] - tick > 1) pit.push([(tick + 0.02) / PPQ, 0]);
      }
      const name = element(track, 'Name'), muted = bool(element(track, 'IsMute'));
      return helpers.assignTrackMix({ name, lang, muted, notes: groupPart(notes, helpers),
        pit: NSG.TUNING ? NSG.TUNING.fitPit(pit, 1) : pit },
        helpers.dbToLinear(Number(element(track, 'Gain')) || 0, -96), Number(element(track, 'Pan')) || 0, muted);
    });
    const audio = project.children.some(n => n.name === 'MonoTrack' || n.name === 'StereoTrack');
    return { tracks, events, audio, meter: hasMeterChanges(meters) };
  }

  function readVogen(bytes, format, helpers) {
    const { text, names } = helpers.zipProjectText(bytes, 'chart.json', format);
    const project = JSON.parse(text);
    check(project && Number.isFinite(project.bpm0) && project.bpm0 > 0 && Array.isArray(project.utts), format);
    const tracks = project.utts.map(utt => {
      check(utt && Array.isArray(utt.notes), format);
      const lang = normalizeLanguage(utt.romScheme === 'man' ? 'zh' : utt.romScheme, helpers) || trackLanguage(utt.notes, helpers);
      const notes = utt.notes.map(n => {
        if (!n) return null;
        const note = noteAt(n.on, n.dur, n.pitch, n.lyric || n.rom, lang, format, helpers);
        if (note && lang === 'zh') helpers.nnReading(note, note.lyric, n.rom || '');
        return note;
      }).filter(Boolean);
      return { name: utt.name, lang, notes: groupPart(notes, helpers) };
    });
    return { tracks, events: [{ tick: 0, bpm: project.bpm0 }], meter: !!project.timeSig0 && project.timeSig0 !== '4/4',
      audio: names.some(name => /^accom\.path$/i.test(name) || /\.(?:wav|mp3|flac|ogg|m4a|aac)$/i.test(name)) };
  }

  const formats = { dv: 'DeepVocal', sk: 'Sharpkey', mtp: 'MUTA', ccs: 'CeVIO', ccst: 'CeVIO',
    tssln: 'VoiSona', vspx: 'VocalSharp', vog: 'Vogen' };
  NSG.readExternalProject = function (kind, bytes, helpers) {
    const format = formats[kind];
    let result, enc = 'utf-8';
    switch (kind) {
      case 'dv':
      case 'sk': result = readSharpkey(bytes, format, helpers); enc = undefined; break;
      case 'mtp': result = readMuta(bytes, format, helpers); enc = 'utf-16le'; break;
      case 'tssln': result = readTechnoSpeech(readValueTree(new Reader(bytes, format)), format, helpers); break;
      case 'ccs':
      case 'ccst':
      case 'vspx': {
        const decoded = helpers.decodeText(bytes);
        enc = decoded.enc;
        const doc = xml(decoded.text, format);
        result = kind === 'vspx' ? readVocalSharp(doc, format, helpers) : readTechnoSpeech(doc, format, helpers);
        break;
      }
      case 'vog': result = readVogen(bytes, format, helpers); break;
    }
    if (!result.tracks.some(track => track.notes.length)) throw new Error(format + ' 工程中没有可导入的人声音符');
    // Pitch fitting indexes its source notes by ID before the editor assigns its own IDs.
    for (const track of result.tracks) track.notes.forEach((note, i) => { note.id = i + 1; });
    const tempos = tempoMap(result.events);
    let warn = '原声库、手工音素、独立颤音与效果未转换';
    if (result.audio) warn += '；伴奏与音频轨未导入';
    if (result.talk) warn += '；说话轨未导入';
    if (result.meter) warn += '；拍号及拍号变化暂不转换';
    if (result.tempoConflict) warn += '；同位置的不同轨道速度以首条为准';
    return helpers.withImportTracks({ format, enc, tempo: tempos[0].bpm, tempos, warn }, result.tracks);
  };
})(typeof window !== 'undefined' ? window : global);
