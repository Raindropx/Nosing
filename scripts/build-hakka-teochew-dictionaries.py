"""Rebuild the offline single-character dictionaries on Windows (Python 3)."""
from collections import Counter, defaultdict
import ctypes
import json
from pathlib import Path
import re
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = "https://raw.githubusercontent.com/"
HAKKA = RAW + "kyootoya/hakka-sixian-rime/82ce45e9d3d4e9b8ced2e158322e953f7e4f38dd/"
TEOCHEW = RAW + "p1an-lin-jung/teochew-g2p/c31db2ca8da68c0ffb7ca1f66295bfa48b56e54b/"


def fetch(url):
    with urlopen(url, timeout=45) as response:
        return response.read().decode("utf-8-sig")


def sixian():
    labels = fetch(HAKKA + "lua/hakka_sixian_south_filter.lua")
    southern = set(re.findall(r'\["([^"]+)\\t([^"]+)"\] = true', labels))
    marks = str.maketrans({"1": "ˊ", "2": "ˇ", "3": "ˋ", "4": ""})

    def rows(name):
        for line in fetch(HAKKA + name).splitlines():
            if "\t" in line:
                word, reading = line.split("\t")[:2]
                if (word, reading.translate(marks)) not in southern:
                    yield word, reading

    # Input-method candidates are ordered by spelling. Rank alternate readings
    # by their occurrences in aligned dictionary phrases, then by source order.
    votes = defaultdict(Counter)
    for word, roman in rows("hakka_sixian_phrase.dict.yaml"):
        syllables = roman.split()
        if len(word) == len(syllables):
            for char, reading in zip(word, syllables):
                votes[char][reading] += 1
    choices = defaultdict(list)
    for char, reading in rows("hakka_sixian_core.dict.yaml"):
        if len(char) == 1:
            choices[char].append(reading)
    result = {}
    for char, readings in choices.items():
        code = max(readings, key=votes[char].__getitem__)
        stem = code[:-1]
        # The IME encodes tone marks with keys 1..4. Store conventional tone
        # categories, distinguishing short checked tones from the open tones.
        tones = {"3": "4", "4": "8"} if stem.endswith(("b", "d", "g")) and not stem.endswith("ng") else {
            "1": "1", "2": "5", "3": "2", "4": "3"}
        result[char] = stem + tones[code[-1]]
    return result


def teochew():
    result = {}
    for line in fetch(TEOCHEW + "pypengim/data/char_dict/char_main.txt").splitlines():
        char, readings = line.split("#")
        if len(char) == 1:
            result.setdefault(char, readings.split("|")[0])
    return result


def add_variants(readings, flag):
    # Windows NLS supplies the single-character simplification/traditionalization.
    # An explicit source entry wins. Skip conflicting inferred readings.
    aliases = defaultdict(set)
    for char, reading in readings.items():
        buf = ctypes.create_unicode_buffer(8)
        n = ctypes.windll.kernel32.LCMapStringEx("zh-CN", flag, char, -1, buf, len(buf), None, None, 0)
        if not n:
            raise ctypes.WinError()
        if len(buf.value) == 1 and buf.value not in readings:
            aliases[buf.value].add(reading)
    readings.update({c: next(iter(v)) for c, v in aliases.items() if len(v) == 1})


def write(lang, readings, notice):
    # Some source or Windows variants are font-specific private-use glyphs.
    # Keep only Unicode Han characters accepted by the lyric tokenizer.
    chars = sorted(c for c in readings if c == "〇" or 0x3400 <= ord(c) <= 0x9FFF
                   or 0x20000 <= ord(c) <= 0x323AF)
    entries = ",".join(c + readings[c] for c in chars)
    data = json.dumps(entries, ensure_ascii=False)
    (ROOT / "js/data" / (lang + ".js")).write_text(
        "/* " + notice + " */\n" + f'window.NSG_DICT["{lang}"]={data};\n', encoding="utf-8")
    print(lang, len(chars))


if __name__ == "__main__":
    hak = sixian()
    add_variants(hak, 0x02000000)
    write("hak", hak, "Sixian data by Otoya, Hakka Affairs Council and Taiwan Ministry of Education. "
          "Adapted under CC BY 4.0. See assets/licenses/hakka-teochew.md.")
    teo = teochew()
    add_variants(teo, 0x04000000)
    # Embed the full BSD notice so standalone copies of the dictionary retain it.
    write("nan-x-teochew", teo, fetch(TEOCHEW + "LICENSE").strip())
