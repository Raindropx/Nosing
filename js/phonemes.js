/* ==========================================================================
   NSG · 音素参数库（共振峰测量表）
   共振峰频率（Hz）与带宽（Hz）采用声学近似和歌唱标定参数，基准身高 160cm，16000Hz 单声道。
   字段：t 类型 / f 共振峰 1-5 频率 / b 共振峰 1-5 带宽 / nz 鼻腔耦合度
        na 噪声通道 {f 中心频率, b 带宽, g 增益, v 是否带声}
   ========================================================================== */
(function nsgModule(root) {
  'use strict';
  // Keep a current initializer for an offline Blob Worker; no duplicate engine bundle.
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['phonemes'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};

  function V(f, b, extra) {
    var o = { t: 'V', f: f, b: b, nz: 0 };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function N(f, b, nz) { return { t: 'N', f: f, b: b, nz: nz, murmur: 1 }; }
  function L(f, b) { return { t: 'L', f: f, b: b, nz: 0 }; }
  function G(f, b) { return { t: 'G', f: f, b: b, nz: 0 }; }
  function F(f, b, g, v) { return { t: 'F', f: [500, 1500, 2500, 3400, 4400], b: [200, 200, 300, 400, 500], nz: 0, na: { f: f, b: b, g: g, v: !!v } }; }
  function S(f, b, g, v) { return { t: 'S', f: [300, 1600, 2600, 3400, 4400], b: [200, 200, 300, 400, 500], nz: 0, na: { f: f, b: b, g: g, v: !!v } }; }
  /* 塞擦音：先闭合再摩擦，比例由各音素的 closure 指定。 */
  function AF(f, b, g, v) { return { t: 'A', f: [320, 1600, 2600, 3400, 4400], b: [200, 200, 300, 400, 500], nz: 0, na: { f: f, b: b, g: g, v: !!v } }; }

  var P = {};

  /* ---- 元音：F1 / F2 / F3（160cm 基准）+ 固定圆唇加长量 ---- */
  /* 高阶共振峰 F4/F5/F6 由音色块的「高阶共振峰位置」统一给出，不随元音变 */
  function V3(f, lip) { return { t: 'V', f: f, b: [70, 92, 132, 190, 240], nz: 0, lip: lip || 0 }; }
  function VN3(f, lip) { return { t: 'V', f: f, b: [80, 100, 150, 200, 250], nz: 0.9, lip: lip || 0 }; }

  P.a  = V3([730, 1090, 2440], 0);        // 央低 a
  P.A  = V3([700, 1050, 2400], 0);        // 后低 ɑ（粤 aa / 英 aa）
  P.af = V3([750, 1420, 2550], 0);        // 前低 a（普通话 an、ai），与 ang 的后 ɑ 拉开
  P.e  = V3([530, 1840, 2480], 0);        // 前中 e
  P.E  = V3([550, 1770, 2500], 0);        // ɛ
  P.i  = V3([300, 2290, 3010], 0);        // i
  /* lip 会把全部共振峰再按 1/(1+lip) 下移。o/ɔ 的表值本身已是圆唇元音的测量值，
     再叠 0.10–0.12 等于圆两次：o 实际只剩 F1≈540、F2≈800，F2 与 u 几乎重合，
     普通话 uo/o、粤语 o 听起来接近 u。这里取更开的中后元音，圆唇只留少量。 */
  /* 普通话 o/uo 与 ou 分开；唇音后 o 用试听选定的 o_lab，
     wo/duo/ong 使用 o。ou 使用独立 o_ou/U_ou，不能改变 iu/iong 和 wo 短过渡共用的 U。 */
  P.o  = V3([625, 920, 2450], 0.05);      // ɔ̝（普通话 o/uo）；F2 仍须明显高于 u
  P.o_lab = V3([665, 920, 2450], 0.05);  // b/p/m/f + o：J 版稍开的主元音
  P.oU = V3([510, 1130, 2450], 0.03);     // 保留 iu 的原主元音及显式音素兼容
  P.o_ou = V3([470, 950, 2450], 0.05);   // ou：G 版主元音
  P.O  = V3([620, 930, 2450], 0.07);      // ɔ（粤语 o、英语 aw、闽南语 oo）；再开就与 ɑ 混（粤语 aa/o）
  P.u  = V3([320, 800, 2240], 0.13);      // u
  /* 唇音后 o 的短 u 介音：J 版保留 45ms，再转入 o_lab；长音落在 o_lab。 */
  P.u_o = V3([320, 800, 2240], 0.13); P.u_o.onset = 0.045;
  P.U  = V3([420, 1000, 2350], 0.06);     // ʊ
  P.U_ou = V3([350, 760, 2300], 0.10);   // ou 专用收尾，避免改动共享 U
  P.U_ou.coda = 0.160; P.U_ou.glide = true;
  /* 普通话 ao/iao：主元音 Ao 比 la 的 a、ang 的 A 更后（F2 更低），收尾 U_a 真正滑向圆唇的 [ʊ/o]。
     原先 ao = A + U：A 与 a 只差约 40Hz，U 的 F2 也只比 A 低约 100Hz、只占最后 70ms，
     长音里几乎全程是 a，lao/mao 听起来像 la/ma。U_a 的 F2 明显降低并带圆唇，
     时长加长到 coda 字段指定的长度，且在整段内线性滑过去（glide），而不是一下跳到终点。 */
  P.Ao  = V3([710, 1000, 2400], 0);       // ɑ（普通话 ao、iao 的主元音）
  P.U_a = V3([440, 840, 2300], 0.10);     // ao 的收尾 ʊ→o，F2 远低于主元音
  P.U_a.coda = 0.150; P.U_a.glide = true;
  P.I  = V3([390, 1990, 2550], 0);        // ɪ
  P.y  = V3([300, 2100, 2700], 0.11);     // y（ü）
  // 普通话介音基准（中速）：在 dsp.js 中按音符时长自适应缩放并按比例压短音。
  P.y_ue = Object.assign({}, P.y, { onset: 0.085, lip: 0.20 });
  P.u_medial = Object.assign({}, P.u, { onset: 0.045 });
  P.y_medial = Object.assign({}, P.y, { onset: 0.055 });
  P.u_labial = Object.assign({}, P.u_o, { onset: 0.050 });
  P['7'] = V3([500, 1400, 2450], 0);      // ɤ（拼音 e）
  P['@'] = V3([500, 1500, 2500], 0);      // ə
  P['3'] = V3([490, 1350, 1690], 0.03);   // ɝ / ɚ
  P['1'] = V3([400, 1400, 2600], 0);      // ɿ（z c s 后）
  P['1r'] = V3([420, 1300, 1800], 0);     // ʅ（zh ch sh r 后）
  P['6'] = V3([490, 1350, 1690], 0.03);   // ɚ（er）
  P.ae = V3([660, 1720, 2410], 0);        // æ
  P['V'] = V3([640, 1190, 2390], 0.02);   // ʌ

  /* ---- 鼻化元音（闽南语）---- */
  P['a~'] = VN3([730, 1090, 2440], 0);
  P['o~'] = VN3([610, 960, 2480], 0.05);
  P['O~'] = VN3([620, 930, 2450], 0.07); // 臺羅 onn = ɔ̃
  P['e~'] = VN3([530, 1840, 2480], 0);
  P['i~'] = VN3([300, 2290, 3010], 0);
  P['u~'] = VN3([320, 800, 2240], 0.13);

  /* ---- 日语元音 ---- */
  P['a_j'] = V3([780, 1200, 2500], 0);
  P['i_j'] = V3([300, 2150, 2900], 0);
  P['u_j'] = V3([350, 1350, 2350], 0.04);
  P['e_j'] = V3([480, 1850, 2500], 0);
  P['o_j'] = V3([510, 900, 2450], 0.07);   // お：中元音，应比う明显开

  /* 朝鲜语 / 越南语专用元音；合成初值，独立于已试听标定的旧语种。 */
  /* ㅏ 原借共享 a（F2 1090，偏后），与 ㅓ 的 F2 几乎相同，어/아、워/와 难分。
     按首尔音测量值取央低 [ɐ]（F2 ≈1350），ㅓ 的 F2 略降。 */
  P.a_ko = V3([740, 1350, 2500], 0);    // ㅏ /ɐ/
  P.eo_ko = V3([600, 1040, 2450], 0);   // ㅓ /ʌ/
  P.eu_ko = V3([350, 1450, 2400], 0);   // ㅡ /ɯ/
  P.u_ko = V3([320, 800, 2240], 0.06);
  /* 首尔音 ㅐ/ㅔ 已合并为 [e̞]；ㅐ 原先借英语 æ（660Hz），사랑해 听起来像英语 cat 的元音。 */
  P.e_ko = V3([500, 1850, 2500], 0);
  P.a_vi = V3([750, 1350, 2500], 0);
  P.aw_vi = V3([780, 1450, 2500], 0);   // ă
  P.aa_vi = V3([550, 1400, 2450], 0);   // â /ɤ̆/
  P.ow_vi = V3([480, 1350, 2450], 0);   // ơ /ɤ/
  P.uw_vi = V3([330, 1550, 2500], 0);   // ư /ɯ/
  P.o_vi = V3([450, 860, 2450], 0.05);  // ô /o/：比 o /ɔ/ 明显闭，女声原先只差 4.7dB
  P.O_vi = V3([620, 1000, 2450], 0.04); // o /ɔ/
  /* e /ɛ/ 与 ê /e/ 是音位对立；共用表里 E/e 只差 20Hz/70Hz，em/êm、đẹp/đệp 听不出区别。 */
  P.E_vi = V3([620, 1800, 2500], 0);    // e /ɛ/
  P.e_vi = V3([420, 2080, 2650], 0);    // ê /e/
  // 潮拼 en、ên、on 的鼻化元音与各自的口元音保持相同共振峰。
  ['eu_ko', 'e_vi', 'o_vi'].forEach(function (id) {
    P[id + '~'] = VN3(P[id].f.slice(), P[id].lip);
  });
  P.at_vi = V3([500, 1550, 2500], 0);   // iê/ươ/uô 的短央元音收尾
  P.at_vi.coda = 0.095; P.at_vi.glide = true;
  P.I_vi = V3([350, 2150, 2800], 0);
  P.U_vi = V3([350, 800, 2300], 0.06);
  P.I_vi.coda = P.U_vi.coda = 0.09;
  P.I_vi.glide = P.U_vi.glide = true;
  /* ay/au/ây/âu：短韵腹 + 长滑音，与 ai/ao 的长韵腹 + 短滑音对立。 */
  P.I2_vi = Object.assign({}, P.I_vi, { coda: 0.20 });
  P.U2_vi = Object.assign({}, P.U_vi, { coda: 0.20 });

  /* ---- 鼻音 ---- */
  P.m  = N([250, 950, 2100, 3300, 4200], [80, 220, 320, 360, 400], 0.85);
  P.n  = N([250, 1750, 2650, 3400, 4400], [80, 190, 250, 320, 380], 0.80);
  P.ng = N([250, 2000, 2700, 3400, 4400], [80, 220, 270, 330, 390], 0.82);
  P.ny = N([250, 1900, 2600, 3400, 4400], [80, 200, 260, 320, 380], 0.70);
  P.N_j = N([250, 1250, 2400, 3300, 4300], [90, 220, 270, 330, 390], 0.85); // 日语 ん
  /* 口腔闭塞形成的反共振（零点，Hz，160cm 基准），位置随闭塞部位：唇 ~1kHz、齿龈 ~1.7kHz、
     软腭 ~3kHz。它压下 F2 一带，鼻音才有鼻腔“嗡”声，而不是一个变弱的 l。 */
  P.m.az = 1350; P.n.az = 1200; P.ng.az = 3000; P.ny.az = 2200; P.N_j.az = 1400;

  /* ---- 流音 / 近音 ---- */
  // 边音：F1 比鼻音高、F3 高，F2–F3 一带能量明显强于鼻音；不带鼻腔耦合。
  P.l  = L([400, 1250, 2850, 3400, 4400], [70, 110, 170, 230, 290]);
  // 普通话声母 l：表值同 l，合成时按韵母换算边音形状并快速除阻（见 dsp.js mandarinLateral）。
  // 单独的音素名让手动指定的旧序列 l 保持原读法。
  P.l_zh = Object.assign({}, P.l);
  P.r  = L([400, 1450, 1800, 3200, 4200], [75, 120, 180, 240, 300]);  // 普通话 r
  P.rj = L([420, 1300, 1700, 3200, 4200], [80, 120, 180, 240, 300]);  // 英语 ɹ
  /* 日语 ら行 / 英语 flap 的闪音 ɾ：舌尖一碰即离，声带不停，没有闭塞静音和送气。
     原先按清塞音处理（15ms 静音 + 4kHz 爆破），听起来就是一个弱 t，ら/た/だ 难分。 */
  P.dx = { t: 'T', f: [400, 1600, 2600, 3400, 4400], b: [90, 140, 200, 300, 400], nz: 0, na: { f: 3200, b: 2000, g: 0.05, v: true } };
  P.w  = G([300, 650, 2200, 3200, 4200], [70, 90, 160, 220, 280]);
  P.jj = G([280, 2200, 3000, 3500, 4400], [60, 100, 170, 230, 290]);

  /* ---- 擦音 ---- */
  P.f  = F(2300, 1500, 0.22, false);
  P.v  = F(2300, 1500, 0.14, true);
  P.s  = F(6100, 1300, 0.30, false);
  P.z  = F(5600, 1200, 0.18, true);
  P.sr = F(3100, 1100, 0.30, false);   // ʂ（sh）
  P.zr = F(3100, 1100, 0.18, true);    // ʐ
  P.xc = F(4200, 1300, 0.26, false);   // ɕ（x）
  P.h  = F(1700, 2200, 0.18, false);
  P.th = F(5200, 2400, 0.16, false);   // θ（英语 th）
  P.dh = F(5200, 2400, 0.12, true);
  P.sh = F(3100, 1100, 0.30, false);   // ʃ
  P.zh = F(3100, 1100, 0.18, true);    // ʒ
  P.fj = F(1850, 900, 0.16, false);    // ɸ（日语 ふ）
  P.xj = F(2900, 2200, 0.05, false);   // 日语 ひ /ç/（非咝音腭部气流）
  P.xj.nonSibilant = true;

  /* 独立呼吸音 / 休止：不经过普通语言的拼读规则。 */
  P.br = F(1700, 2200, 0.18, false);
  P.br.t = 'B';
  P.AP = P.br;
  P.SP = { t: 'R' };
  NSG.specialPhone = function (text, lang) {
    var s = String(text === undefined ? '' : text).trim();
    if (/^br$/i.test(s) || s === 'AP' || (!/^(yue|nan|hak|nan-x-teochew|zh-x-sichuan|xdi8|ko|vi|pl|ru|uk|fi|eo|tok|asaxi|es|pt|it|fr|ro|fil|id|ms|th)$/.test(lang || '') && /^ap$/i.test(s))) return 'br';
    if (/^SP$/i.test(s)) return 'SP';
    return null;
  };
  NSG.noteKind = function (n) {
    var lyric = String(n.lyric === undefined ? '' : n.lyric).trim();
    var special = NSG.specialPhone(lyric, n.lang);
    var phone = n.phones && n.phones.length === 1 ? NSG.specialPhone(n.phones[0]) : null;
    if (n.rest || special === 'SP' || phone === 'SP' || /^(?:R|r|rest|休止|休止符)$/.test(lyric)) return 'rest';
    if (special === 'br' || phone === 'br') return 'breath';
    return lyric ? 'voiced' : 'rest';
  };

  /* ---- 塞擦音（闭合 + 摩擦）---- */
  P.ts   = AF(6100, 1300, 0.28, false);  // z（ts）
  P.tsh  = AF(6100, 1300, 0.40, false);  // c（tsʰ）
  P.ts_r = AF(3100, 1100, 0.26, false);  // zh（ʈʂ）
  P.tsh_r= AF(3100, 1100, 0.38, false);  // ch（ʈʂʰ）
  P.ts_j = AF(4400, 1300, 0.26, false);  // j（tɕ）
  P.tsh_j= AF(4400, 1300, 0.38, false);  // q（tɕʰ）
  P.dz_j = AF(4400, 1300, 0.18, true);   // 日语 じ / 粤语 dz
  P.dz   = AF(6100, 1300, 0.18, true);   // 浊 ts
  P.z_r  = AF(3100, 1100, 0.18, true);   // 闽南语 j（ʑ）
  // 英语 /tʃ dʒ/ 各是一个塞擦音，闭塞后直接进入摩擦，不另插塞音爆破。
  P.ch_en = AF(3100, 1100, 0.30, false);
  P.jh_en = AF(3100, 1100, 0.18, true);

  /* ---- 塞音（闭合静音 + 爆破噪声）---- */
  P.p  = S(900, 900, 0.45, false);
  P.ph = S(900, 900, 0.52, false);
  P.b  = S(720, 650, 0.46, false);   // 不送气清音 p
  P.t  = S(3800, 1600, 0.55, false);
  P.t_h  = S(3800, 1600, 0.60, false);   // 送气 t（普通话/tʰ）
  P.d  = S(3400, 1500, 0.46, false); // 不送气清音 t：齿龈爆破偏高、偏强，否则淹没在元音起音里
  P.k  = S(2200, 1200, 0.55, false);
  P.kh = S(2200, 1200, 0.62, false);
  P.g  = S(1900, 620, 0.36, false); // 不送气清音 k
  // 日语 ぱ た か：词首有中等送气（VOT 约 35–50ms，k 最长），介于普通话 b/d/g 与 p/t/k 之间。
  // 原先用不送气的 p/t/k，释放段只有 ~21ms，与浊音 だ が（~16ms）几乎一样长。
  P.p_j = S(900, 900, 0.45, false);
  P.t_j = S(3800, 1600, 0.55, false);
  P.k_j = S(1900, 900, 0.55, false);
  P.p_j.aspLv = P.t_j.aspLv = P.k_j.aspLv = 0.22;   // 送气比普通话 p t k（ASP_LEVEL 0.28）弱一些
  // 浊塞音（日语 ば だ が、闽南语 b g、英语 b d g）：闭塞期间声带持续振动（浊音杠），
  // 与不送气清音 b d g 区分。
  P.bv = S(720, 600, 0.30, true);
  // 浊音的释放段带声，爆破容易被盖住：だ 的爆破须明显偏高、偏强，が 集中在中频，部位才分得开。
  P.dv = S(3800, 1600, 0.44, true);
  P.gv = S(1850, 560, 0.36, true);
  // 臺羅韵尾 -h = ʔ：只有闭塞，没有 h 的摩擦或塞音的爆破。
  P.q = { t: 'Q', f: [500, 1500, 2500], b: [70, 92, 132], nz: 0, dur: 35 };

  /* 歌唱咬字基准（ms），是可继续试听调整的合成参数，并非实测语料统计。
     拼音 p/t/k 分别使用 ph/t_h/kh；不能与不送气的 b/d/g 共用时长。
     closure 是闭塞占比；asp 是释放段持续送气的相对电平。 */
  var timing = {
    b: [42, 0.70], d: [44, 0.60], g: [46, 0.67], dx: [30],
    p_j: [74, 0.46, 0.20], t_j: [72, 0.45, 0.20], k_j: [84, 0.42, 0.22],
    bv: [55, 0.72], dv: [50, 0.68], gv: [58, 0.70],
    p: [54, 0.62], t: [52, 0.60], k: [60, 0.58],
    ph: [105, 0.26, 0.30], t_h: [100, 0.25, 0.30], kh: [110, 0.27, 0.32],
    ts: [85, 0.30], ts_r: [90, 0.30], ts_j: [90, 0.28],
    tsh: [130, 0.22], tsh_r: [140, 0.22], tsh_j: [135, 0.20],
    dz: [85, 0.28], dz_j: [90, 0.28], z_r: [90, 0.28],
    ch_en: [115, 0.28], jh_en: [90, 0.28],
    s: [115], sr: [125], xc: [115], sh: [120], xj: [85],
    f: [95], h: [85], m: [70], n: [65], ng: [75], ny: [65],
    w: [48], jj: [48]
  };
  Object.keys(timing).forEach(function (id) {
    P[id].dur = timing[id][0];
    if (timing[id][1] !== undefined) P[id].closure = timing[id][1];
    if (timing[id][2] !== undefined) P[id].asp = timing[id][2];
  });

  /* 发音部位：决定辅音段的声道形状（音轨 locus），由合成时按相邻元音换算。
     lab 唇 / alv 齿龈 / ret 卷舌 / pal 龈腭 / vel 软腭 / glo 喉（沿用元音声道）。
     塞音的闭塞本身无声，听感上的部位线索主要来自释放后共振峰滑向元音的那几十毫秒；
     若闭塞段直接用元音的共振峰，b/d/g 只剩爆破噪声可区分。 */
  var place = {
    lab: ['p', 'ph', 'p_j', 'b', 'bv', 'f', 'v', 'fj'],
    alv: ['t', 't_h', 't_j', 'd', 'dv', 'dx', 's', 'z', 'th', 'dh', 'ts', 'tsh', 'dz'],
    ret: ['sr', 'zr', 'sh', 'zh', 'ts_r', 'tsh_r', 'ch_en', 'jh_en'],
    pal: ['xc', 'xj', 'ts_j', 'tsh_j', 'dz_j', 'z_r'],
    vel: ['k', 'kh', 'k_j', 'g', 'gv'],
    glo: ['h']
  };
  Object.keys(place).forEach(function (pl) {
    place[pl].forEach(function (id) { P[id].pl = pl; });
  });
  // 平音、紧音、送气音分开；不改动共用 b/d/g 与送气音参数。
  function variant(id, base, extra) { P[id] = Object.assign({}, P[base], extra); }
  variant('kk_ko', 'g', { dur: 65, closure: 0.85 });
  variant('tt_ko', 'd', { dur: 65, closure: 0.85 });
  variant('pp_ko', 'b', { dur: 65, closure: 0.85 });
  variant('jj_ko', 'ts_j', { dur: 100, closure: 0.50 });
  variant('ss_ko', 's', { dur: 145 });
  variant('ss_i_ko', 'xc', { dur: 145 });
  variant('x_vi', 'h', { pl: 'vel', na: { f: 2400, b: 1300, g: 0.26, v: false } });
  variant('gh_vi', 'h', { pl: 'vel', na: { f: 1900, b: 1000, g: 0.12, v: true } });
  // 不除阻塞音韵尾：闭塞收声，无额外爆破、送气或补元音。
  ['p', 't', 'k'].forEach(function (id) {
    variant(id + '_cl', 'q', { dur: 65, pl: { p: 'lab', t: 'alv', k: 'vel' }[id] });
  });
  /* 朝鲜语：元音或 ㄴㅁㅇㄹ 后的 ㅎ 弱化为带声的气声 [ɦ]（전화、은행），不再切断词内连贯。
     breathy 是带声电平（相对元音），breathyNoise 是经元音声道塑形的气流倍数。
     初版 50ms/0.55 只比元音低约 2dB，헤 听成 에；现取与清 h 相当的时长和压低量，只保留声带不断。 */
  variant('h_ko', 'h', { dur: 90, breathy: 0.10, breathyNoise: 1.5, na: { f: 1700, b: 2200, g: 0.05, v: true } });
  /* 越南语（河内）。
     q_vi：元音开头音节的喉塞起音 [ʔ]，连唱 anh ơi 时音节不糊在一起。
     c_vi：ch/tr 是以闭塞为主的 [c]，比普通话 j 的摩擦短、弱。
     c_cl：-ch 的前化闭塞收尾；kp_cl/ngm_vi：u/ô/o 后 -c/-ng 的唇软腭收尾 [k͡p ŋ͡m]。 */
  variant('q_vi', 'q', { dur: 30 });
  variant('c_vi', 'ts_j', { dur: 85, closure: 0.62, na: { f: 4000, b: 1500, g: 0.15, v: false } });
  variant('c_cl', 'q', { dur: 65, pl: 'pal' });
  variant('kp_cl', 'q', { dur: 65, pl: 'lv' });
  variant('ngm_vi', 'ng', { f: [250, 1250, 2450, 3400, 4400], az: 1500, pl: 'lv' });
  /* 粤语专用元音与收尾（声学近似，参考粤语单元音共振峰测量的相对位置）。
     aa 是央低 [aː]，不是普通话 ang 的后 ɑ，否则与 o [ɔː] 太近；短 a [ɐ] 比 aa 闭。
     oe [œː] 是半开前圆唇，原先借高元音 y，香/脚听成 hyng/gyk；eo [ɵ] 是圆唇央元音。 */
  variant('A_yue', 'A', { f: [780, 1300, 2450] });
  variant('a_yue', 'a', { f: [600, 1400, 2500] });
  variant('e_yue', 'e', { f: [430, 2060, 2600] });
  variant('oe_yue', 'y', { f: [560, 1600, 2450], lip: 0.08 });
  variant('eo_yue', 'y', { f: [480, 1500, 2400], lip: 0.06 });
  // 长韵腹（aai/aau/oi/ui/iu）后短收尾；短韵腹（ai/au/ei/ou/eoi）后收尾更长。
  variant('I_yue', 'I', { f: [350, 2150, 2800], coda: 0.09, glide: true });
  variant('U_yue', 'U', { f: [350, 760, 2300], lip: 0.10, coda: 0.09, glide: true });
  variant('I2_yue', 'I', { f: [350, 2150, 2800], coda: 0.16, glide: true });
  variant('U2_yue', 'U', { f: [350, 760, 2300], lip: 0.10, coda: 0.16, glide: true });
  variant('Y2_yue', 'y', { coda: 0.16, glide: true });
  /* Asaxi：独立变体，避免改变已经标定的旧语种。声学参数为规则近似，待作者试听。 */
  variant('a_ax', 'a_j', {});
  variant('u_ax', 'eu_ko', { lip: 0 }); // ù /ɯ/
  variant('x_ax', 'h_ko', {});         // x /ɦ/
  variant('h_ax', 'x_vi', {});         // h：采用作者辅音表 /x/
  variant('zh_ax', 'xc', { na: { f: 4200, b: 1300, g: 0.18, v: true } });
  variant('v_ax', 'dz', { pl: 'lab', closure: 0.28, na: { f: 2300, b: 1500, g: 0.14, v: true } }); // /b̪v/
  variant('chx_ax', 'ch_en', { dur: 135, closure: 0.22, asp: 0.30 });
  variant('I_ax', 'I', { coda: 0.12, glide: true });
  variant('U_ax', 'u', { coda: 0.12, glide: true });
  variant('W_ax', 'u', { coda: 0.09, glide: true }); // ů /uw/ 的短收尾
  // ýj /ɪj/ 的收尾须滑向 [i/j]；原先借 I_ax（同为 ɪ），听感与单个 ý 无别。
  variant('J_ax', 'i', { coda: 0.12, glide: true });
  variant('n_tok', 'n', { syllabic: true }); // 道本语感叹词 n /n̩/
  ['m', 'n', 'ng'].forEach(function (id) { variant(id + '_ax', id, { syllabic: true }); });
  variant('N_ax', 'N_j', { syllabic: true }); // 词尾 nn /ɴ̩/ 的声学近似
  variant('cl_ax', 'q', { dur: 55 }); // DiffSinger cl：持阻，不另加一次爆破
  // 重辅音只持阻一次；塞音保留原来的释放时长，不重复两个爆破。
  ['bv', 'ch_en', 'dv', 'dh', 'dx', 'f', 'gv', 'x_ax', 'h_ax', 'jh_en', 'k', 'l',
    'p', 'rj', 's', 'xc', 'sh', 't', 'th', 'v_ax', 'w', 'jj', 'z', 'zh_ax', 'ts', 'dz', 'ny',
    'ph', 't_h', 'kh', 'chx_ax', 'xj'].forEach(function (id) {
    var base = P[id], duration = base.dur || 70;
    var extra = { dur: duration * 2 };
    if (base.closure !== undefined) extra.closure = 1 - (1 - base.closure) / 2;
    variant(id + '_long_ax', id, extra);
  });
  /* 未单独标注的音素仍使用类型基准。 */
  var DUR = { V: 130, N: 72, L: 62, G: 52, F: 92, S: 58, A: 78, T: 30 };
  P.__DUR = DUR;

  /* 芬兰语的八个元音、长音与双元音收尾。共振峰采用歌唱合成初值。 */
  var finnishVowels = {
    a: [[730, 1080, 2490], 0], e: [[445, 2050, 2660], 0], i: [[290, 2300, 2990], 0],
    o: [[455, 890, 2440], 0.08], u: [[310, 790, 2250], 0.10], y: [[300, 1910, 2470], 0.08],
    ae: [[675, 1720, 2520], 0], oe: [[440, 1580, 2340], 0.06]
  };
  Object.keys(finnishVowels).forEach(function (id) {
    var base = id + '_fi', spec = finnishVowels[id];
    P[base] = V3(spec[0], spec[1]);
    variant(id + '_long_fi', base, { vowelWeight: 2 });
  });
  ['e', 'i', 'o', 'u', 'y', 'oe'].forEach(function (id) {
    variant(id + '_glide_fi', id + '_fi', { coda: 0.125, glide: true });
  });
  variant('r_fi', 'dx', { dur: 58, taps: 2 }); // /r/
  P.v_fi = G([340, 1350, 2410, 3370, 4300], [75, 120, 165, 220, 290]); // /ʋ/

  /* 罗曼语族的共振峰与辅音时长采用歌唱合成初值。 */
  P.e_rom = V3([450, 2030, 2640], 0);
  P.E_rom = V3([595, 1790, 2520], 0);
  P.o_rom = V3([460, 895, 2410], 0.04);
  P.O_rom = V3([605, 1020, 2460], 0.05);
  variant('I_rom', 'i', { coda: 0.10, glide: true });
  variant('U_rom', 'u', { coda: 0.11, glide: true });
  P.oe_th = V3([485, 1330, 2450], 0); // /ɤ/
  variant('a_off_th', 'a_j', { coda: 0.15, glide: true });
  variant('ly_rom', 'l', { f: [335, 1970, 2950, 3450, 4400], pl: 'pal' }); // /ʎ/
  variant('rr_es', 'dx', { dur: 76, pl: 'alv', taps: 3 });
  variant('x_es', 'x_vi', { dur: 95 });
  variant('y_es', 'jj', { dur: 65, f: [310, 2080, 2900, 3450, 4380] }); // /ʝ/ 近似
  variant('B_es', 'v', { pl: 'lab', dur: 55, na: { f: 1600, b: 1100, g: 0.07, v: true } }); // /β̞/
  variant('dh_es', 'dh', { pl: 'alv', dur: 52, nonSibilant: true, na: { f: 3200, b: 1800, g: 0.06, v: true } }); // /ð̞/
  variant('G_es', 'x_vi', { dur: 55, na: { f: 1700, b: 1250, g: 0.07, v: true } }); // /ɣ˕/

  P.at_pt = V3([615, 1420, 2500], 0); // /ɐ/
  P.a_nas_pt = VN3([580, 1390, 2480], 0);
  P.e_nas_pt = VN3([445, 2000, 2620], 0);
  P.o_nas_pt = VN3([470, 900, 2410], 0.04);
  P.i_nas_pt = VN3([320, 2210, 2940], 0);
  P.u_nas_pt = VN3([330, 790, 2250], 0.09);
  variant('I_nas_pt', 'i_nas_pt', { coda: 0.10, glide: true });
  variant('U_nas_pt', 'u_nas_pt', { coda: 0.11, glide: true });

  P.oe_fr = V3([425, 1640, 2340], 0.06); // /ø/
  P.OE_fr = V3([585, 1520, 2320], 0.06); // /œ/
  P.a_nas_fr = VN3([685, 1120, 2450], 0.03);
  P.o_nas_fr = VN3([535, 850, 2380], 0.06);
  P.E_nas_fr = VN3([575, 1820, 2520], 0);
  P.OE_nas_fr = VN3([575, 1530, 2350], 0.06);
  P.H_fr = G([300, 1760, 2470, 3350, 4200], [70, 100, 170, 230, 290]); // /ɥ/
  variant('r_fr', 'h', { pl: 'vel', dur: 62, na: { f: 1460, b: 1100, g: 0.12, v: true } }); // /ʁ/

  P.I_ro = V3([340, 1470, 2450], 0); // /ɨ/
  P.e_glide_ro = G([445, 1980, 2650, 3450, 4360], [70, 95, 160, 220, 290]); // /e̯/
  P.o_glide_ro = G([455, 890, 2390, 3340, 4200], [70, 95, 160, 220, 290]); // /o̯/
  variant('J_ro', 'i', { coda: 0.035, glide: true }); // 词尾辅音腭化的短过渡

  /* Standard German: independent vowel qualities; do not retune other languages.
     Long/lax pairs differ in spectrum, while sung duration follows the note. */
  var germanVowels = {
    a_de: [730, 1350, 2500], aa_de: [700, 1200, 2450],
    i_de: [280, 2300, 3000], I_de: [435, 1850, 2500],
    e_de: [350, 2200, 2750], E_de: [600, 1800, 2500],
    o_de: [420, 850, 2450], O_de: [600, 1000, 2450],
    u_de: [300, 750, 2250], U_de: [430, 1100, 2400],
    y_de: [285, 1850, 2200], Y_de: [425, 1520, 2280],
    oe_de: [380, 1700, 2250], OE_de: [570, 1380, 2250],
    at_de: [480, 1500, 2500], ar_de: [620, 1350, 2500]
  };
  Object.keys(germanVowels).forEach(function (id) { P[id] = V3(germanVowels[id], 0); });
  ['I', 'U', 'O', 'Y', 'ar'].forEach(function (id) {
    variant(id + '_glide_de', id + '_de', { coda: 0.12, glide: true });
  });
  variant('ch_de', 'h', { pl: 'pal', dur: 105, na: { f: 3700, b: 1700, g: 0.22, v: false } }); // ich /ç/
  variant('x_de', 'h', { pl: 'vel', dur: 105, na: { f: 1800, b: 1500, g: 0.25, v: false } }); // ach /x/
  variant('r_de', 'h', { pl: 'vel', dur: 60, na: { f: 1400, b: 1100, g: 0.10, v: true } }); // /ʁ/, acoustic approximation
  P.pf_de = AF(2300, 1500, 0.26, false);
  Object.assign(P.pf_de, { dur: 110, closure: 0.32, pl: 'lab' });
  ['m', 'n', 'l', 'ng'].forEach(function (id) { variant(id + '_syll_de', id, { syllabic: true }); });

  /* Polish (pl): 6 oral vowels, 2 nasal vowels, alveolo-palatal/retroflex sibilants & affricates, velar /x/, tap /r/. */
  P.a_pl = V3([730, 1320, 2500], 0);
  P.E_pl = V3([570, 1820, 2520], 0);
  P.i_pl = V3([290, 2280, 2980], 0);
  P.y_pl = V3([370, 1750, 2550], 0);
  P.O_pl = V3([580, 960, 2450], 0.05);
  P.u_pl = V3([315, 780, 2250], 0.12);
  P.O_nas_pl = VN3([580, 960, 2450], 0.05);
  P.E_nas_pl = VN3([570, 1820, 2520], 0);
  P.zx_pl = F(4200, 1300, 0.18, true);
  Object.assign(P.zx_pl, { dur: 110, pl: 'pal' });
  P.dz_r = AF(3100, 1100, 0.18, true);
  Object.assign(P.dz_r, { dur: 90, closure: 0.28, pl: 'ret' });
  variant('x_pl', 'h', { pl: 'vel', dur: 100, na: { f: 1850, b: 1400, g: 0.25, v: false } });
  variant('r_pl', 'dx', { dur: 32, pl: 'alv' });

  /* Russian (ru): 6 stressed vowels + 2 reduced unstressed vowels (аканье/иканье), hard vs soft (palatalized) consonants. */
  P.a_ru = V3([740, 1300, 2480], 0);
  P.o_ru = V3([500, 900, 2450], 0.07);
  P.u_ru = V3([310, 760, 2250], 0.12);
  P.e_ru = V3([510, 1860, 2520], 0);
  P.i_ru = V3([290, 2280, 2980], 0);
  P.y_ru = V3([345, 1520, 2450], 0);
  P.at_ru = V3([600, 1380, 2480], 0);
  P.I_ru = V3([380, 2020, 2650], 0);
  P.l_ru = L([380, 920, 2800, 3400, 4400], [70, 110, 170, 230, 290]);
  P.l_ru.pl = 'vel';
  P.ly_ru = L([330, 1980, 2950, 3450, 4400], [70, 105, 165, 230, 290]);
  P.ly_ru.pl = 'pal';
  variant('r_ru', 'dx', { dur: 32, pl: 'alv' });
  variant('ry_ru', 'dx', { dur: 34, pl: 'pal', f: [350, 1980, 2800, 3450, 4400], na: { f: 3800, b: 1800, g: 0.06, v: true } });
  variant('my_ru', 'm', { pl: 'pal', f: [250, 1650, 2500, 3350, 4300], az: 1650 });
  variant('py_ru', 'p', { pl: 'pal', dur: 58, closure: 0.58, na: { f: 2200, b: 1400, g: 0.45, v: false } });
  variant('by_ru', 'bv', { pl: 'pal', dur: 58, closure: 0.68, na: { f: 2000, b: 1200, g: 0.30, v: true } });
  variant('ty_ru', 't', { pl: 'pal', dur: 58, closure: 0.55, na: { f: 4200, b: 1500, g: 0.55, v: false } });
  variant('dy_ru', 'dv', { pl: 'pal', dur: 54, closure: 0.65, na: { f: 4000, b: 1500, g: 0.44, v: true } });
  variant('ky_ru', 'k', { pl: 'pal', dur: 62, closure: 0.56, na: { f: 3000, b: 1300, g: 0.55, v: false } });
  variant('gy_ru', 'gv', { pl: 'pal', dur: 60, closure: 0.68, na: { f: 2800, b: 1000, g: 0.36, v: true } });
  variant('fy_ru', 'f', { pl: 'pal', na: { f: 2800, b: 1600, g: 0.14, v: false } });
  variant('vy_ru', 'v', { pl: 'pal', na: { f: 2600, b: 1500, g: 0.11, v: true } });
  variant('sy_ru', 's', { pl: 'pal', na: { f: 5600, b: 1500, g: 0.28, v: false } });
  variant('zy_ru', 'z', { pl: 'pal', na: { f: 5200, b: 1400, g: 0.18, v: true } });
  variant('x_ru', 'h', { pl: 'vel', dur: 100, na: { f: 1850, b: 1400, g: 0.25, v: false } });
  variant('xy_ru', 'h', { pl: 'pal', dur: 100, na: { f: 3600, b: 1600, g: 0.23, v: false } });
  variant('xc_ru', 'xc', { dur: 135, pl: 'pal' });
  P.m.pl = 'lab'; P.n.pl = 'alv'; P.ny.pl = 'pal'; P.ng.pl = 'vel'; P.l.pl = 'alv';

  /* Ukrainian (uk): 6 vowels (и = /ɪ/ distinct from і = /i/ and е = /ɛ/), voiced glottal /ɦ/, hard/soft dentals & /w/ coda. */
  P.a_uk = V3([735, 1300, 2480], 0);
  P.e_uk = V3([550, 1820, 2500], 0);
  P.y_uk = V3([380, 1920, 2580], 0);
  P.i_uk = V3([290, 2290, 2990], 0);
  P.o_uk = V3([560, 930, 2450], 0.06);
  P.u_uk = V3([315, 770, 2250], 0.12);
  P.l_uk = L([390, 1080, 2850, 3400, 4400], [70, 110, 170, 230, 290]);
  P.l_uk.pl = 'alv';
  variant('r_uk', 'dx', { dur: 32, pl: 'alv' });
  variant('x_uk', 'x_ru', {});
  variant('hh_uk', 'h', { pl: 'glo', dur: 80, breathy: 0.20, breathyNoise: 1.4, na: { f: 1650, b: 2000, g: 0.08, v: true } });

  /* Shidinn / Xdi8 (xdi8): dedicated nasal vowels, central rounded /ʉ/, and diphthong offglides;
     do not retune existing languages. */
  P.u_bar_xd = V3([310, 1550, 2350], 0.10);      // /ʉ/
  P.ae_nas_xd = VN3([660, 1720, 2410], 0);       // /æ̃/ (Xdi8 2)
  P.a_nas_xd = VN3([700, 1300, 2460], 0);        // /ɐ̃/ (Xdi8 T)
  P.e_nas_xd = VN3([460, 1980, 2600], 0);        // /ẽ/ (Xdi8 8 nucleus)
  P.at_nas_xd = VN3([500, 1480, 2480], 0);       // /ə̃/ (Xdi8 3 nucleus)
  variant('I_nas_xd', 'i_nas_pt', { coda: 0.11, glide: true });   // /ɪ̯̃/ (Xdi8 8 offglide)
  variant('U_nas_xd', 'u_nas_pt', { coda: 0.11, glide: true });   // /ʊ̯̃/ (Xdi8 3 offglide)
  variant('E_off_xd', 'e_rom', { coda: 0.11, glide: true });      // /e̯/ (Xdi8 Y offglide)
  variant('O_off_xd', 'o_rom', { coda: 0.11, glide: true });      // /o̯/ (Xdi8 L offglide)
  variant('U_off_xd', 'U_ou', { coda: 0.12, glide: true });       // /ʊ̯/ (Xdi8 6 offglide)
  variant('I_off_xd', 'I_rom', { coda: 0.11, glide: true });      // /ɪ̯/ (Xdi8 V offglide)

  NSG.PHONES = P;

  /* 音节合成辅助：把属性拼成渲染用的音素实例 */
  NSG.phoneOf = function (id) {
    return P[id] || P['@'];
  };
  NSG.phones = Object.keys(P).filter(function (k) { return k.indexOf('__') !== 0; });
})(typeof window !== 'undefined' ? window : global);
