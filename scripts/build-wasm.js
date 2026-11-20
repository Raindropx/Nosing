'use strict';
// npm install --prefix <tool-directory> --no-save --ignore-scripts wabt@1.0.39
// node scripts/build-wasm.js <tool-directory>/node_modules/wabt
const fs = require('node:fs'), path = require('node:path');
async function main() {
  const wabt = await require(process.argv[2] ? path.resolve(process.argv[2]) : 'wabt')();
  const source = path.join(__dirname, '../wasm/fft.wat');
  const parsed = wabt.parseWat(source, fs.readFileSync(source, 'utf8'));
  try {
    parsed.resolveNames(); parsed.validate();
    const { buffer } = parsed.toBinary({ canonicalize_lebs: true });
    if (!WebAssembly.validate(buffer)) throw Error('Invalid WebAssembly');
    const output = path.join(__dirname, '../assets/dsp/fft.wasm');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, buffer);
    console.log(path.relative(path.join(__dirname, '..'), output) + ': ' + buffer.length + ' bytes');
  } finally { parsed.destroy(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
