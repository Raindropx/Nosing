/* Fixed ballad vocal space. Shared impulse and wet level for playback/export. */
(function (root) {
  'use strict';
  var NSG = root.NSG = root.NSG || {};
  var SR = 48000, TAIL = 2.8, WET = 0.28;
  var impulse = null;
  var impulseBuffers = typeof WeakMap === 'function' ? new WeakMap() : null;

  function makeImpulse(ctx) {
    if (impulseBuffers && ctx && typeof ctx === 'object') {
      var cached = impulseBuffers.get(ctx);
      if (cached) return cached;
    }
    if (!impulse) {
      impulse = [];
      for (var c = 0; c < 2; c++) {
        var pcm = new Float32Array(Math.round(TAIL * SR));
        var seed = c ? 0x735ace21 : 0x145db937, low = 0, bass = 0, energy = 0;
        for (var i = Math.round(0.032 * SR); i < pcm.length; i++) {
          var t = i / SR - 0.032;
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          var noise = seed / 2147483648 - 1;
          // Gradually darken the diffuse tail; remove low rumble from the return.
          var lp = 1 - Math.exp(-2 * Math.PI * (2600 + 3400 * Math.exp(-t * 2)) / SR);
          low += lp * (noise - low);
          bass += (1 - Math.exp(-2 * Math.PI * 180 / SR)) * (low - bass);
          var attack = Math.min(1, t / 0.045);
          var fade = Math.min(1, (TAIL - i / SR) / 0.16);
          pcm[i] = (low - bass) * attack * Math.exp(-t * Math.log(1000) / 1.85) * fade;
          energy += pcm[i] * pcm[i];
        }
        var scale = 0.9 / Math.sqrt(energy);
        for (var j = 0; j < pcm.length; j++) pcm[j] *= scale;
        // Slightly different early reflection times widen the room around a centred voice.
        [0.047, 0.079, 0.113].forEach(function (time, k) {
          pcm[Math.round((time + c * (k + 1) * 0.003) * SR)] += [0.28, -0.19, 0.13][k];
        });
        impulse.push(pcm);
      }
    }
    var buffer = ctx.createBuffer(2, impulse[0].length, SR);
    impulse.forEach(function (channel, c) { buffer.copyToChannel(channel, c); });
    if (impulseBuffers && ctx && typeof ctx === 'object') impulseBuffers.set(ctx, buffer);
    return buffer;
  }

  var Reverb = NSG.Reverb = { tail: TAIL, wet: WET };
  // Source also connects directly to destination. The return stays before the vocal fader.
  Reverb.connect = function (ctx, source, destination, enabled) {
    var convolver = ctx.createConvolver(), gain = ctx.createGain();
    convolver.normalize = false;
    convolver.buffer = makeImpulse(ctx);
    gain.gain.value = enabled ? WET : 0;
    source.connect(convolver); convolver.connect(gain); gain.connect(destination);
    return { gain: gain, disconnect: function () {
      source.disconnect(convolver); convolver.disconnect(); gain.disconnect();
    } };
  };

  Reverb.renderVocal = async function (audio) {
    if (!audio || !audio.channels[0].length) return audio;
    var frames = Math.ceil(audio.channels[0].length / audio.sr * SR) + Math.round(TAIL * SR) - 1;
    var OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    var ctx = new OC(2, frames, SR);
    var buffer = ctx.createBuffer(audio.channels.length, audio.channels[0].length, audio.sr);
    audio.channels.forEach(function (channel, c) { buffer.copyToChannel(channel, c); });
    var source = ctx.createBufferSource(); source.buffer = buffer;
    source.connect(ctx.destination);
    Reverb.connect(ctx, source, ctx.destination, true);
    source.start();
    var rendered = await ctx.startRendering();
    return { sr: SR, channels: [rendered.getChannelData(0), rendered.getChannelData(1)] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
