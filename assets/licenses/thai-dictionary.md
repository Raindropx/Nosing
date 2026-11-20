# Thai pronunciation dictionary attribution

The generated data in `js/data/th.js` is based on readings by English Wiktionary contributors.
PyThaiNLP extracted and cleaned the [23 July 2022 corpus](https://github.com/PyThaiNLP/thai-g2p-wiktionary-corpus/blob/3c96f5e948a64b8262be78fa98beecf1d43b1965/wiktionary-23-7-2022-clean.tsv)
and [published it under CC BY-SA 3.0](https://github.com/PyThaiNLP/thai-g2p-wiktionary-corpus/blob/3c96f5e948a64b8262be78fa98beecf1d43b1965/README.md).
Credit and revision history for each entry are available at
`https://en.wiktionary.org/wiki/WORD#Thai` (replace WORD with the Thai headword).

NSG keeps Thai-script headwords, removes unrecognized transcriptions, selects the first usable pronunciation
for each headword, and converts IPA to NSG phones, tone numbers and vowel-length categories.
The converted dictionary is shared under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
Regenerate it with `node scripts/build-thai-dictionary.js` or pass the source TSV file as the first argument.
