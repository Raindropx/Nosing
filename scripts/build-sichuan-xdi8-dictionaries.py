"""Rebuild offline single-character dictionaries for Sichuanese (Chengdu) and Shidinn (Xdi8) on Windows (Python 3)."""
from collections import defaultdict
import ctypes
import io
import json
from pathlib import Path
import re
from urllib.request import urlopen
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = "https://raw.githubusercontent.com/"
CHENGDU_URL = RAW + "GiantAILab/DiaMoE-TTS/main/dialect_frontend/frontend/dialect/chengdu/hanzi.xlsx"
CHENGDU_LICENSE_URL = RAW + "GiantAILab/DiaMoE-TTS/main/LICENSE"
XDI8_URL = RAW + "DGCK81LNN/xdi8-transcriber/main/data/dict.tsv"


def fetch_bytes(url):
    with urlopen(url, timeout=45) as response:
        return response.read()


def fetch_text(url):
    return fetch_bytes(url).decode("utf-8-sig")


def read_xlsx_rows(data):
    zf = zipfile.ZipFile(io.BytesIO(data))
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in root.findall("a:si", ns):
            shared.append("".join(t.text or "" for t in si.findall(".//a:t", ns)))
    root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in root.findall(".//a:sheetData/a:row", ns):
        vals = {}
        for cell in row.findall("a:c", ns):
            ref = cell.attrib.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            ctype = cell.attrib.get("t", "")
            val = cell.find("a:v", ns)
            if val is not None and val.text is not None:
                vals[col] = shared[int(val.text)] if ctype == "s" else val.text
            else:
                inline = cell.find("a:is", ns)
                if inline is not None:
                    vals[col] = "".join(t.text or "" for t in inline.findall(".//a:t", ns))
        rows.append(vals)
    return rows


def load_zh_map():
    text = (ROOT / "js/data/zh.js").read_text(encoding="utf-8")
    match = re.search(r'"(.*)"', text, re.S)
    result = {}
    if not match:
        return result
    for entry in match.group(1).split(","):
        if len(entry) >= 2:
            result[entry[0]] = entry[1:]
    return result


def mandarin_to_chengdu(py):
    """Regular Mandarin -> Chengdu Sichuanese fallback for rare Hanzi outside hanzi.xlsx."""
    tone_m = re.search(r"([1-5])$", py)
    tone = tone_m.group(1) if tone_m else ""
    stem = py[:-1] if tone else py
    stem = stem.lower().replace("ü", "v").replace("u:", "v")
    if stem in ("m", "n", "ng", "er"):
        return stem + tone
    # Retroflex -> flat alveolar, r -> rz
    if stem.startswith("zh"):
        stem = "z" + stem[2:]
    elif stem.startswith("ch"):
        stem = "c" + stem[2:]
    elif stem.startswith("sh"):
        stem = "s" + stem[2:]
    elif stem.startswith("r"):
        stem = "rz" + stem[1:]
    # n/l merger outside palatal i/v
    if re.match(r"^n(?![iv])", stem):
        stem = "l" + stem[1:]
    # hu -> fu (only monophthong u)
    if stem == "hu":
        stem = "fu"
    # eng -> ong after labials, else en; ing -> in
    if re.match(r"^[bpmf]eng$", stem):
        stem = stem[0] + "ong"
    elif stem.endswith("eng") and stem != "eng":
        stem = stem[:-1]
    elif stem == "eng":
        stem = "ngen"
    elif stem.endswith("ing"):
        stem = stem[:-1]
    # uo -> o after d/t/l/z/c/s/rz
    if re.match(r"^(?:rz|[dtlzcs])uo$", stem):
        stem = stem[:-2] + "o"
    # weng -> ong
    if stem == "weng":
        stem = "ong"
    return stem + tone


def sichuanese(zh_map):
    rows = read_xlsx_rows(fetch_bytes(CHENGDU_URL))
    grouped = defaultdict(list)
    for row in rows[1:]:
        hz = row.get("A", "").strip()
        std = row.get("B", "").strip()
        dp = row.get("C", "").strip()
        if len(hz) != 1 or not dp:
            continue
        # Fix upstream typo: 眾/衆 zhong4 -> zong4
        if dp == "zhong4":
            dp = "zong4"
        grouped[hz].append((std, dp))

    result = {}
    for hz, choices in grouped.items():
        if len(choices) == 1:
            result[hz] = choices[0][1]
            continue
        zh_py = zh_map.get(hz, "")
        zh_base = re.sub(r"[1-5]$", "", zh_py)
        chosen = None
        if zh_py:
            for std, dp in choices:
                parts = [p.strip() for p in std.split(",") if p.strip()]
                if zh_py in parts:
                    chosen = dp
                    break
        if not chosen and zh_base:
            for std, dp in choices:
                parts = [re.sub(r"[1-5]$", "", p.strip()) for p in std.split(",") if p.strip()]
                if zh_base in parts:
                    chosen = dp
                    break
        if not chosen:
            for std, dp in choices:
                if not std:
                    chosen = dp
                    break
        result[hz] = chosen or choices[0][1]

    # Expand Simplified <-> Traditional variants where unambiguous
    add_variants(result, 0x02000000)
    add_variants(result, 0x04000000)

    # Common Sichuanese colloquial characters not present in hanzi.xlsx
    colloquial = {
        "噻": "sai1", "咋": "za3", "娃": "wa2", "唔": "wu2", "嘞": "le1",
        "啷": "lang3", "孬": "lao1", "嫑": "biao4", "挼": "lo2", "搛": "jian1",
        "怼": "dui3", "蹦": "bong4", "娃": "wa2", "崽": "zai3", "啥": "sa4",
    }
    for hz, rd in colloquial.items():
        result.setdefault(hz, rd)

    # Derive regular Chengdu readings for rarer Hanzi present in zh.js
    for hz, zh_py in zh_map.items():
        if hz not in result:
            result[hz] = mandarin_to_chengdu(zh_py)
    return result


def xdi8():
    tsv = fetch_text(XDI8_URL)
    preferred = {}
    fallback = {}
    for line in tsv.splitlines():
        if not line or line.startswith(";"):
            continue
        parts = line.split("\t")
        hz = parts[0].strip()
        spell = parts[1].strip() if len(parts) > 1 else ""
        hh = parts[3].strip() if len(parts) > 3 else ""
        xh = parts[4].strip() if len(parts) > 4 else ""
        if len(hz) != 1 or not spell:
            continue
        if hh == "-" and xh == "-":
            continue  # legacy spelling
        if hh == "-":
            fallback.setdefault(hz, spell)
        else:
            preferred.setdefault(hz, spell)
    result = dict(preferred)
    for hz, spell in fallback.items():
        result.setdefault(hz, spell)
    add_variants(result, 0x02000000)
    add_variants(result, 0x04000000)
    return result


def add_variants(readings, flag):
    aliases = defaultdict(set)
    for char, reading in readings.items():
        buf = ctypes.create_unicode_buffer(8)
        n = ctypes.windll.kernel32.LCMapStringEx("zh-CN", flag, char, -1, buf, len(buf), None, None, 0)
        if not n:
            raise ctypes.WinError()
        if len(buf.value) == 1 and buf.value not in readings:
            aliases[buf.value].add(reading)
    readings.update({c: next(iter(v)) for c, v in aliases.items() if len(v) == 1})


def write_dict(lang, readings, notice):
    chars = sorted(
        c for c in readings
        if c == "〇" or 0x3400 <= ord(c) <= 0x9FFF or 0x20000 <= ord(c) <= 0x323AF
    )
    entries = ",".join(c + readings[c] for c in chars)
    data = json.dumps(entries, ensure_ascii=False)
    out = ROOT / "js/data" / (lang + ".js")
    out.write_text(
        "/* " + notice + " */\n" + f'window.NSG_DICT["{lang}"]={data};\n',
        encoding="utf-8",
    )
    print(lang, len(chars), f"{out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    zh_map = load_zh_map()
    sc = sichuanese(zh_map)
    sc_license = fetch_text(CHENGDU_LICENSE_URL).strip()
    write_dict(
        "zh-x-sichuan",
        sc,
        "Chengdu Sichuanese readings derived from GiantAILab/DiaMoE-TTS (MIT) with regular fallback from zh.js.\n"
        + sc_license,
    )
    xd = xdi8()
    write_dict(
        "xdi8",
        xd,
        "Hanzi-to-Shidinn (Xdi8) dictionary derived from DGCK81LNN/xdi8-transcriber (MIT License, Copyright DGCK81LNN).\n"
        "See assets/licenses/sichuan-xdi8.md.",
    )
