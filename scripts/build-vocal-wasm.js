'use strict';
// Builds wasm/vocal-core with Rust + WASM SIMD128, writes assets/dsp/vocal-core.wasm,
// and updates the offline Base64 fallback in js/vocal-wasm.js.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function findCargo() {
  const candidates = [
    path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo'),
    process.platform === 'win32' ? 'cargo.exe' : 'cargo'
  ];
  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }
  return candidates[candidates.length - 1];
}

function main() {
  const root = path.resolve(__dirname, '..');
  const manifest = path.join(root, 'wasm', 'vocal-core', 'Cargo.toml');
  const cargo = findCargo();
  const cargoBin = path.dirname(cargo);
  const env = Object.assign({}, process.env, {
    RUSTFLAGS: '-C target-feature=+simd128',
    PATH: path.isAbsolute(cargo) ? cargoBin + path.delimiter + (process.env.PATH || '') : process.env.PATH
  });
  execFileSync(cargo, ['build', '--manifest-path', manifest, '--release', '--target', 'wasm32-unknown-unknown'], {
    stdio: 'inherit', env
  });
  const built = path.join(root, 'wasm', 'vocal-core', 'target', 'wasm32-unknown-unknown', 'release', 'vocal_core.wasm');
  const bytes = fs.readFileSync(built);
  if (!WebAssembly.validate(bytes)) throw new Error('Invalid WebAssembly binary: ' + built);
  const outPath = path.join(root, 'assets', 'dsp', 'vocal-core.wasm');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bytes);
  const loaderPath = path.join(root, 'js', 'vocal-wasm.js');
  const b64 = bytes.toString('base64');
  const loaderSrc = fs.readFileSync(loaderPath, 'utf8');
  const replaced = loaderSrc.replace(/var WASM_B64 = '[^']*';/, "var WASM_B64 = '" + b64 + "';");
  if (replaced === loaderSrc && !loaderSrc.includes("var WASM_B64 = '" + b64 + "';")) {
    throw new Error('Could not find WASM_B64 marker in js/vocal-wasm.js');
  }
  fs.writeFileSync(loaderPath, replaced, 'utf8');
  console.log('Built assets/dsp/vocal-core.wasm: ' + bytes.length + ' bytes (Base64 updated in js/vocal-wasm.js)');
}

main();
