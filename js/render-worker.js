'use strict';
// Existing engine/data modules use window/global; both refer to this worker scope.
self.window = self;
self.global = self;
importScripts('phonemes.js', 'timbre.js', 'g2p.js', 'tempo.js', 'tuning.js', 'instruments.js',
  'fft-wasm.js', 'vocal-wasm.js', 'dsp.js', 'analyze.js', 'compose.js', 'fzstd.js', 'fflate.js', 'project-imports.js', 'io.js', 'render-service.js');
var DICT_LANGS = { zh: 1, 'zh-x-sichuan': 1, yue: 1, ja: 1, en: 1, de: 1, nan: 1, hak: 1, 'nan-x-teochew': 1, th: 1, xdi8: 1 };
var loadedScripts = Object.create(null);
var wasmReady = Promise.all([
  NSG.WASM.init('../assets/dsp/fft.wasm'),
  NSG.VOCAL_WASM && NSG.VOCAL_WASM.init ? NSG.VOCAL_WASM.init('../assets/dsp/vocal-core.wasm') : Promise.resolve(false)
]);
wasmReady.then(function () { self.postMessage({ ready: true }); }, function () { self.postMessage({ ready: true }); });
async function ensureJobDicts(type, data) {
  var langs = NSG.Renderer.jobDictLangs(type, data);
  for (var i = 0; i < langs.length; i++) {
    var lang = langs[i];
    if (!DICT_LANGS[lang]) continue;
    if (!loadedScripts[lang] && !(self.NSG_DICT && self.NSG_DICT[lang])) {
      importScripts('data/' + lang + '.js');
      loadedScripts[lang] = true;
    }
    await NSG.loadDict(lang);
  }
}
function transfers(value, buffers) {
  if (!value || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value)) {
    if (buffers.indexOf(value.buffer) < 0) buffers.push(value.buffer);
  } else Object.keys(value).forEach(function (key) { transfers(value[key], buffers); });
}
self.onmessage = async function (event) {
  var message = event.data;
  try {
    await wasmReady;
    await ensureJobDicts(message.type, message.data);
    var result = NSG.Renderer.execute(message.type, message.data), buffers = [];
    transfers(result, buffers);
    self.postMessage({ id: message.id, result: result }, buffers);
  } catch (e) { self.postMessage({ id: message.id, error: e.message || String(e) }); }
};
