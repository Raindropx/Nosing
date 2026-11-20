/* Optional f64 FFT accelerator. Missing/blocked WASM always leaves JS usable. */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['fft-wasm'] = nsgModule;
  var NSG = root.NSG = root.NSG || {}, instance = null, pending = null;
  var real, imag;
  var WASM_B64 = 'AGFzbQEAAAABBQFgAX8AAwIBAAUEAQEDAwcQAgZtZW1vcnkCAANmZnQAAAqFBAGCBAIJfwp8QQEhAQJAA0AgASAATw0BIABBAXYhAwJAA0AgAiADcUUNASACIANzIQIgA0EBdiEDDAALCyACIANzIQIgASACSQRAIAFBA3QrAwAhCiABQQN0IAJBA3QrAwA5AwAgAkEDdCAKOQMAQYCABCABQQN0aisDACEKQYCABCABQQN0akGAgAQgAkEDdGorAwA5AwBBgIAEIAJBA3RqIAo5AwALIAFBAWohAQwACwtBAiEEQQEhBQJAA0AgBCAASw0BQYCACCAFQQN0aisDACENQYCBCCAFQQN0aisDACEOQQAhBgJAA0AgBiAATw0BRAAAAAAAAPA/IQtEAAAAAAAAAAAhDEEAIQcCQANAIAcgBEEBdk8NASAGIAdqIQggCCAEQQF2aiEJIAhBA3QrAwAhEEGAgAQgCEEDdGorAwAhESAJQQN0KwMAIAuiQYCABCAJQQN0aisDACAMoqEhEiAJQQN0KwMAIAyiQYCABCAJQQN0aisDACALoqAhEyAIQQN0IBAgEqA5AwBBgIAEIAhBA3RqIBEgE6A5AwAgCUEDdCAQIBKhOQMAQYCABCAJQQN0aiARIBOhOQMAIAsgDaIgDCAOoqEhDyALIA6iIAwgDaKgIQwgDyELIAdBAWohBwwACwsgBiAEaiEGDAALCyAEQQF0IQQgBUEBaiEFDAALCws=';
  function decodeB64(b64) {
    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var clean = b64.replace(/=+$/, ''), len = clean.length;
    var out = new Uint8Array((len * 3) >>> 2), o = 0;
    for (var i = 0; i < len; i += 4) {
      var n = (alpha.indexOf(clean[i]) << 18) | (alpha.indexOf(clean[i + 1]) << 12) |
        ((i + 2 < len ? alpha.indexOf(clean[i + 2]) : 0) << 6) | (i + 3 < len ? alpha.indexOf(clean[i + 3]) : 0);
      out[o++] = (n >>> 16) & 255;
      if (o < out.length) out[o++] = (n >>> 8) & 255;
      if (o < out.length) out[o++] = n & 255;
    }
    return out;
  }
  var W = NSG.WASM = { enabled: true, ready: false, error: null };
  W.init = function (source) {
    if (pending) return pending;
    pending = Promise.resolve().then(function () {
      if (typeof WebAssembly === 'undefined') throw Error('WebAssembly unavailable');
      if (typeof source !== 'string' && source) return source;
      if (typeof fetch !== 'function') return decodeB64(WASM_B64);
      return fetch(source || 'assets/dsp/fft.wasm').then(function (r) {
        if (!r.ok) throw Error('FFT WASM HTTP ' + r.status);
        return r.arrayBuffer();
      }, function () {
        return decodeB64(WASM_B64);
      }).catch(function () {
        return decodeB64(WASM_B64);
      });
    }).then(function (bytes) {
      return WebAssembly.instantiate(bytes, {});
    }).then(function (r) {
      instance = r.instance.exports;
      real = new Float64Array(instance.memory.buffer, 0, 8192);
      imag = new Float64Array(instance.memory.buffer, 65536, 8192);
      var cos = new Float64Array(instance.memory.buffer, 131072, 14);
      var sin = new Float64Array(instance.memory.buffer, 131200, 14);
      for (var i = 1, m = 2; i <= 13; i++, m *= 2) {
        var angle = -2 * Math.PI / m;
        cos[i] = Math.cos(angle); sin[i] = Math.sin(angle);
      }
      W.ready = true; return true;
    }).catch(function (e) { W.error = e.message; return false; });
    return pending;
  };
  W.fft = function (re, im) {
    var n = re.length;
    // Float32 arrays round every butterfly in the original implementation.
    if (!W.enabled || !W.ready || !(re instanceof Float64Array) || !(im instanceof Float64Array) ||
        n !== im.length || n < 2 || n > 8192 || (n & (n - 1))) return false;
    real.set(re); imag.set(im);
    instance.fft(n);
    re.set(real.subarray(0, n)); im.set(imag.subarray(0, n));
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
