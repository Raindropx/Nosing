# Nosing.!

> In my personal, subjective, and one-sided opinion, they are not singing.
> -- Mr.Sickduck

[中文版](README.zh-CN.md)

Nosing (小市唱) is an offline singing synthesizer. You draw the notes, type in the lyrics, hit play, and the algorithms simulating vocal cords, oral cavities, and nasal passages (zero pre-recorded playback, zero AI model weights).After giving it a listen, Mr.Sickduck decided to stick to his original opinion.

## Make it say “ah”

1. Open `index.html` in Chrome or Edge. The browser edition runs offline with nothing to install.
2. Load the built-in demo or import a project of your own. In the piano roll, pick a note and change its lyric to “ah”.
3. Press play. For a more heartfelt “ah”, make the note longer.

You can enter lyrics in several languages, add independent vocal layers, and turn on automatic accompaniment. The interface speaks English, Simplified Chinese, and Japanese. Vocals render at 16 kHz by default, or 48 kHz in HiFi mode.

You can export the current vocal layer as a WAV, all vocal layers as a ZIP of WAVs, the accompaniment, the mix, or MIDI.

## Frequently asked questions

**Q. What's the perk of having no real human voice provider?**

A. Zero drama.

**Q. Why did the chicken cross the road?**

A. To get to the other side.

**Q. Why does my song start with four seconds of silence?**

A. You put the first note at 0:05.

**Q. Can it sing a duet?**

A. Yes. Add a second vocal layer. Both parties are now equally responsible for the song.

## Credits and license

Nosing's own code and the FFT WebAssembly module compiled from it use the [Apache License 2.0](LICENSE). Sources, credits, and recorded terms for third-party libraries, dictionaries, backgrounds, and scores are in the [third-party notices](THIRD_PARTY_NOTICES.md).

The demo score features *Xiaocao* (《小草》), the theme song from the opera *Fangcaoxin* (《芳草心》). Lyrics by Xiang Tong and He Zhaohua. Music by Wang Zujie and Zhang Zhuoya. [Interview with the songwriters (in Chinese)](https://www.chinawriter.com.cn/n1/2020/0305/c405057-31617478.html)

This Readme is for reference only. Please refer to the physical product.
