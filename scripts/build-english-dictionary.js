'use strict';
// Usage: node scripts/build-english-dictionary.js <cmudict.dict> <LICENSE>
// Keep established pronunciations and add missing CMU headwords offline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [source, licensePath] = process.argv.slice(2);
if (!source || !licensePath) throw new Error('Expected cmudict.dict and its LICENSE paths');
const output = path.join(__dirname, '../js/data/en.js');
const current = fs.readFileSync(output, 'utf8').match(/window\.NSG_DICT\.en=("(?:[^"\\]|\\.)*");/);
if (!current) throw new Error('Unrecognized existing dictionary format');
const entries = new Map();
for (const row of JSON.parse(current[1]).split(',')) {
  const match = row.match(/^([a-z'\-]+)([A-Z].*)$/);
  if (!match) throw new Error('Invalid existing row: ' + row);
  entries.set(match[1], match[2].replace(/\s+#.*$/, ''));
}
const before = entries.size, raw = fs.readFileSync(source);
for (const row of raw.toString('utf8').split(/\r?\n/)) {
  // Numeric entries and alternate-pronunciation suffixes are outside this format.
  const match = row.match(/^([a-z'\-]+) (.+?)(?:\s+#.*)?$/);
  if (match && !entries.has(match[1])) entries.set(match[1], match[2]);
}
const license = fs.readFileSync(licensePath, 'utf8').trim();
if (license.includes('*/') || !license.includes('Carnegie Mellon University')) throw new Error('Unexpected license');
const hash = crypto.createHash('sha256').update(raw).digest('hex');
const header = '/* CMU US English Dictionary: https://github.com/cmusphinx/cmudict\n' +
  'Source SHA-256: ' + hash + '\n' +
  'Existing pronunciations retained; missing alphabetic headwords added.\n\n' + license + '\n*/\n';
const packed = [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([word, arp]) => word + arp).join(',');
fs.writeFileSync(output, header + 'window.NSG_DICT.en=' + JSON.stringify(packed) + ';\n');
console.log(JSON.stringify({ before, added: entries.size - before, total: entries.size, sourceSHA256: hash, bytes: fs.statSync(output).size }));
