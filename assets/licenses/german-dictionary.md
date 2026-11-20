# German pronunciation dictionary attribution

The generated data in `js/data/de.js` is derived from **Wiktionary contributors**,
extracted by **devio-at** in [german-ipa-dict](https://github.com/devio-at/german-ipa-dict).

- Source: `de_enwikt.csv`, revision `a08113e0ab80f049b625fc360196491f56243ca1`.
- [Upstream license](https://github.com/devio-at/german-ipa-dict/blob/a08113e0ab80f049b625fc360196491f56243ca1/LICENSE.md): CC BY-SA, following the Wikipedia/Wiktionary reuse license.
- [Wiktionary copyright and reuse](https://en.wiktionary.org/wiki/Wiktionary:Copyrights);
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Attribution for individual entries and their revision history is available at
  `https://en.wiktionary.org/wiki/WORD#German` (replace WORD with the original word).

Changes made by NSG: filter to word entries, choose one pronunciation (preferring
explicit standard pronunciations over regional/colloquial variants), lowercase
lookup keys, add ae/oe/ue/ss aliases, map IPA to NSG acoustic phonemes, split into
syllables, and omit entries with unsupported IPA symbols. Generated dictionary
data is shared under CC BY-SA 4.0. This notice does not change the license of the
application code. Regenerate with `node scripts/build-german-dictionary.js CSV_PATH`.

No VirSyn/CANTOR dictionary data is included.
