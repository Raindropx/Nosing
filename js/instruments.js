/* Original procedural accompaniment presets. No sampled audio or SoundFont data. */
(function nsgModule(root) {
  'use strict';
  if (typeof document !== 'undefined') (root.NSG_WORKER_MODULES = root.NSG_WORKER_MODULES || {})['instruments'] = nsgModule;
  var NSG = root.NSG = root.NSG || {};
  var list = [], byId = Object.create(null), byProgram = Object.create(null);
  function preset(id, name, group, family, program, range, pan, description, sound) {
    var p = { id: id, name: name, group: group, family: family, program: program,
      range: range, pan: pan, description: description, sound: sound || {}, procedural: true };
    list.push(p); byId[id] = p;
    if (!byProgram[program]) byProgram[program] = id;
    return p;
  }
  preset('piano', '原声钢琴', '键盘', 'piano', 0, [36, 96], 0.05, '清楚的锤击音头，低音厚实，高音轻亮。');
  preset('ep', '音叉电钢', '键盘', 'ep', 4, [40, 91], -0.3, '柔和圆润，重弹带一点金属齿音。', { index: 1.2, velocityIndex: 2.4, ratio: 1, release: 0.1, gain: 0.092 });
  preset('epReed', '簧片电钢', '键盘', 'ep', 5, [40, 88], -0.25, '中频更厚，重弹带沙感，适合节奏和弦。', { index: 0.75, velocityIndex: 2.8, ratio: 2, release: 0.085, gain: 0.068, reed: true });
  preset('guitar', '钢弦吉他', '吉他', 'string', 25, [40, 88], 0.35, '拨片音头清楚，琴箱温暖，适合扫弦与分解。', { pick: 0.2, excite: 0.42, velocityExcite: 0.25, tau: 1.3, reference: 196, release: 0.12, body: 190, bodyGain: 0.55, cutoff: 4200, gain: 0.144 });
  preset('guitarNylon', '尼龙吉他', '吉他', 'string', 24, [40, 88], 0.3, '音头柔软、圆润，适合轻柔指弹与 Bossa。', { pick: 0.25, excite: 0.28, velocityExcite: 0.16, tau: 1.65, reference: 196, release: 0.16, body: 165, bodyGain: 0.62, cutoff: 2900, gain: 0.19 });
  preset('guitarClean', '清音电吉他', '吉他', 'string', 27, [40, 91], 0.3, '紧实明亮，带拾音器的空心感，适合切分。', { pick: 0.11, excite: 0.62, velocityExcite: 0.2, tau: 1.8, reference: 196, release: 0.12, body: 750, bodyGain: 0.1, cutoff: 5800, pickup: 0.055, gain: 0.12 });
  preset('guitarMuted', '闷音电吉他', '吉他', 'string', 28, [40, 88], 0.3, '短促、收紧的拨弦音头，适合反拍与节奏。', { pick: 0.14, excite: 0.62, velocityExcite: 0.2, tau: 0.15, reference: 196, release: 0.035, body: 340, bodyGain: 0.18, cutoff: 3300, pickup: 0.075, gain: 0.3 });
  preset('guitarOverdrive', '过载电吉他', '吉他', 'string', 29, [40, 88], 0.28, '保留拨弦轮廓的温和过载，适合蓝调和摇滚。', { pick: 0.14, excite: 0.6, velocityExcite: 0.2, tau: 2.2, reference: 196, release: 0.09, body: 700, bodyGain: 0.12, cutoff: 4800, pickup: 0.06, drive: 5, cabinet: 3600, gain: 0.06 });
  preset('guitarDistortion', '失真电吉他', '吉他', 'string', 30, [40, 88], 0.3, '更密实的延音与颗粒，适合强力和弦。', { pick: 0.1, excite: 0.68, velocityExcite: 0.15, tau: 2.6, reference: 196, release: 0.075, body: 820, bodyGain: 0.08, cutoff: 6000, pickup: 0.045, drive: 13, cabinet: 4200, gain: 0.05 });
  preset('bass', '指弹贝斯', '贝斯', 'bass', 33, [28, 64], 0, '低频稳，指弹音头略亮，余音自然收拢。', { cutoff: 1300, tau: 1.8, noise: 0.08, attack: 0.004, release: 0.05, gain: 0.42 });
  preset('bassPick', '拨片贝斯', '贝斯', 'bass', 34, [28, 64], 0, '拨片轮廓清楚，比指弹更硬、更亮。', { cutoff: 2600, tau: 1.65, noise: 0.13, attack: 0.0025, release: 0.045, harmonic: 0.16, gain: 0.39 });
  preset('bassSlap', 'Slap 贝斯', '贝斯', 'bass', 36, [28, 69], 0, '带敲击和弹弦感的亮音头，主体仍有分量。', { cutoff: 4300, tau: 1.25, noise: 0.2, attack: 0.0015, release: 0.05, harmonic: 0.38, gain: 0.39 });
  preset('bassSynth', '合成贝斯', '贝斯', 'bass', 38, [24, 72], 0, '持续的锯齿与方波低音，音头有谐振扫动。', { cutoff: 2000, tau: 0, noise: 0, attack: 0.005, release: 0.08, square: 0.3, resonance: 1.6, gain: 0.35 });
  preset('strings', '弦乐合奏', '弦乐与拨弦', 'strings', 48, [43, 91], 0.25, '起弓柔和，力度越大弓压与亮度越明显。', { attack: 0.16, release: 0.36, gain: 0.08 });
  preset('stringsSlow', '慢弦乐', '弦乐与拨弦', 'strings', 49, [43, 91], 0.22, '缓慢展开的柔和弦乐，适合长和弦。', { attack: 0.48, release: 0.6, dark: 0.68, gain: 0.09 });
  preset('pizzicato', '拨奏弦乐', '弦乐与拨弦', 'string', 45, [36, 88], 0.2, '圆而短的弹拨，带一点弦乐琴体共鸣。', { pick: 0.29, excite: 0.38, velocityExcite: 0.14, tau: 0.42, reference: 196, release: 0.06, body: 470, bodyGain: 0.6, cutoff: 3600, gain: 0.24 });
  preset('harp', '竖琴', '弦乐与拨弦', 'string', 46, [36, 96], -0.25, '清透、自然散开的拨弦，适合琶音与点缀。', { pick: 0.17, excite: 0.67, velocityExcite: 0.18, tau: 2.8, reference: 220, release: 0.65, body: 330, bodyGain: 0.3, cutoff: 7800, gain: 0.135 });
  preset('pluck', '筝式拨弦', '弦乐与拨弦', 'string', 107, [45, 96], -0.35, '明亮的泛音音头，余音比吉他更开阔。', { pick: 0.13, excite: 0.62, velocityExcite: 0.2, tau: 2.2, reference: 220, release: 0.5, body: 420, bodyGain: 0.25, cutoff: 9000, overtone: 0.12, gain: 0.107 });
  preset('brass', '铜管合奏', '管乐', 'brass', 61, [43, 84], 0.15, '起音有冲力，重吹更明亮，适合短句强调。');
  preset('tuba', '大号', '管乐', 'tuba', 58, [28, 65], 0, '厚实圆润的低铜管，适合进行曲与波尔卡。');
  preset('flute', '长笛', '管乐', 'woodwind', 73, [60, 96], -0.12, '轻、清澈，音头带少量气息。', { harmonics: [1, 0.22, 0.09, 0.035], attack: 0.04, release: 0.11, noise: 0.025, gain: 0.085 });
  preset('clarinet', '单簧管', '管乐', 'woodwind', 71, [50, 88], 0.12, '温暖的空心木管，低中音有鲜明簧片感。', { harmonics: [1, 0.035, 0.42, 0.06, 0.19, 0.035, 0.08], attack: 0.03, release: 0.085, noise: 0.012, gain: 0.075 });
  preset('vibraphone', '颤音琴', '键盘打击', 'mallet', 11, [48, 96], -0.15, '柔亮的金属余音，带缓慢的音量颤动。', { ratios: [1, 4, 9.8], amplitudes: [1, 0.24, 0.09], tau: 2.4, tremolo: 0.12, gain: 0.095 });
  preset('marimba', '马林巴', '键盘打击', 'mallet', 12, [45, 91], 0.2, '木质、圆润的敲击，短尾适合节奏分解。', { ratios: [1, 4, 10], amplitudes: [1, 0.32, 0.12], tau: 0.65, gain: 0.1 });
  preset('musicBox', '八音盒', '键盘打击', 'mallet', 10, [60, 103], -0.18, '细小清脆的金属拨齿，余音有闪光感。', { ratios: [1, 2.01, 3.96, 6.25], amplitudes: [1, 0.38, 0.25, 0.12], tau: 1.55, gain: 0.085 });
  preset('organ', '拉杆风琴', '持续与合成', 'organ', 16, [36, 96], 0.2, '稳定的拉杆和声，带键击与旋转音箱的起伏。');
  preset('accordion', '手风琴', '持续与合成', 'accordion', 21, [45, 91], 0.2, '簧片温暖明亮，带风箱和微失谐的颤动。');
  preset('pad', '暖铺底', '持续与合成', 'pad', 89, [36, 91], -0.25, '慢起音、暗而宽厚的背景和声。', { attack: 0.28, release: 0.45, cutoff: 1, sub: 0.22, gain: 0.08 });
  preset('padAiry', '空气铺底', '持续与合成', 'pad', 91, [48, 96], 0.25, '轻盈的高处铺底，带柔和空气感。', { attack: 0.4, release: 0.65, cutoff: 1.8, sub: 0, air: 0.04, gain: 0.085 });
  preset('choir', '合唱铺底', '持续与合成', 'choir', 52, [48, 88], 0.2, '无歌词的人声共鸣，适合持续背景和声。');
  preset('arp', '合成拨音', '持续与合成', 'arp', 81, [40, 96], -0.4, '短促的谐振拨音，适合重复琶音。');
  preset('lead', '合成主奏', '持续与合成', 'lead', 81, [48, 96], 0.12, '持续、圆润的主奏，带轻微滑入与延迟颤音。');
  // Modular electronic presets: independent amplitude/filter motion, no chip quantization.
  preset('synthAcid', '酸性低音', '电子合成', 'electronic', 38, [28, 64], 0, '带共鸣的短促扫频低音，重弹时滤波器张得更开。',
    { oscs: [{wave:'saw',ratio:1,cents:0,gain:0.8},{wave:'sine',ratio:0.5,cents:0,gain:0.2}], attack:0.004,decay:0.16,sustain:0.65,release:0.07,cutoff:110,keytrack:0.7,sweep:4.3,filterDecay:0.15,filterSustain:0.03,q:2.2,serial:true,rate:0.3,motion:0.04,pwm:0,gain:0.16 });
  preset('synthUnison', '叠锯主奏', '电子合成', 'electronic', 81, [48, 91], 0.1, '三层微失谐锯齿，明亮饱满，适合电子旋律。',
    { oscs: [{wave:'saw',ratio:1,cents:-9,gain:0.34},{wave:'saw',ratio:1,cents:0,gain:0.34},{wave:'saw',ratio:1,cents:9,gain:0.34}], attack:0.018,decay:0.25,sustain:0.8,release:0.14,cutoff:1500,keytrack:2,sweep:1.7,filterDecay:0.3,filterSustain:0.45,q:0.8,rate:0.4,motion:0.12,pwm:0,gain:0.18 });
  preset('synthPWM', '流动脉宽', '电子合成', 'electronic', 80, [40, 88], -0.1, '平滑变化的脉宽音色，带轻微失谐和柔和收音。',
    { oscs: [{wave:'pulse',ratio:1,cents:-3,gain:0.5},{wave:'pulse',ratio:1,cents:3,gain:0.5}], attack:0.04,decay:0.3,sustain:0.8,release:0.2,cutoff:900,keytrack:2,sweep:1.6,filterDecay:0.4,filterSustain:0.4,q:0.8,rate:0.8,motion:0.2,pwm:0.22,gain:0.12 });
  preset('synthSweep', '扫频铺底', '电子合成', 'electronic', 95, [40, 88], 0.18, '慢慢展开的双层滤波铺底，适合电子和声与氛围。',
    { oscs: [{wave:'saw',ratio:1,cents:-6,gain:0.4},{wave:'saw',ratio:1,cents:6,gain:0.4},{wave:'sine',ratio:0.5,cents:0,gain:0.2}], attack:0.4,decay:0.8,sustain:0.85,release:0.8,cutoff:350,keytrack:1,sweep:2.6,filterAttack:0.7,filterDecay:0.8,filterSustain:0.6,q:1.1,serial:true,rate:0.22,motion:0.7,pwm:0,gain:0.18 });
  // Shared defaults keep patches complete; each preset owns its parameter object.
  function electronic(id, name, group, program, range, description, oscillators, settings) {
    var sound = Object.assign({ oscs: oscillators, attack:0.012, decay:0.25, sustain:0.75,
      release:0.12, cutoff:800, keytrack:1, sweep:1.5, filterAttack:0.006,
      filterDecay:0.25, filterSustain:0.2, q:0.707, serial:false,
      rate:0.4, motion:0, pwm:0, gain:0.16 }, settings);
    preset(id, name, group, 'electronic', program, range, 0, description, sound);
  }
  function oscillator(wave, ratio, cents, gain) { return {wave:wave, ratio:ratio, cents:cents, gain:gain}; }
  electronic('synthSub', '深潜低音', '电子低音', 38, [24,60], '干净深沉的正弦低音，少量高八度帮助小音箱辨认音高。',
    [oscillator('sine',1,0,0.86),oscillator('sine',2,0,0.14)],
    {attack:0.018,release:0.1,cutoff:500,keytrack:2,sweep:0,sustain:1,gain:0.19});
  electronic('synthReese', '失谐低音', '电子低音', 38, [28,60], '双锯齿缓慢拍动，低频扎实，适合持续低音线。',
    [oscillator('saw',1,-11,0.4),oscillator('saw',1,11,0.4),oscillator('sine',1,0,0.2)],
    {cutoff:450,sweep:1.2,filterSustain:0.5,serial:true,sustain:0.95,release:0.16,gain:0.23});
  electronic('synthRubber', '弹跳低音', '电子低音', 39, [28,64], '圆润有弹性的扫频音头，适合切分与跳跃低音。',
    [oscillator('pulse',1,0,0.65),oscillator('sine',1,0,0.35)],
    {attack:0.005,decay:0.13,sustain:0.28,cutoff:140,sweep:3.6,filterDecay:0.09,filterSustain:0.02,q:1.35,serial:true,pwm:0.06,gain:0.18});
  electronic('synthOctave', '八度低音', '电子低音', 39, [28,60], '基音与高八度交织，音头鲜明，适合快速电子节奏。',
    [oscillator('saw',1,0,0.6),oscillator('pulse',2,0,0.25),oscillator('sine',1,0,0.15)],
    {attack:0.003,decay:0.18,sustain:0.55,cutoff:450,sweep:2.8,filterDecay:0.12,q:0.9,gain:0.19});
  electronic('synthSoftLead', '柔笛主奏', '电子主奏', 80, [48,91], '圆滑柔和的旋律音色，带少量高八度，不抢人声。',
    [oscillator('sine',1,0,0.8),oscillator('sine',2,0,0.15),oscillator('sine',3,0,0.05)],
    {attack:0.035,release:0.18,cutoff:1500,sweep:0.5,sustain:0.9,gain:0.15});
  electronic('synthFifth', '五度主奏', '电子主奏', 86, [48,84], '带纯五度的亮色主奏，适合单音旋律和短句强调。',
    [oscillator('saw',1,-3,0.55),oscillator('saw',1.5,3,0.3),oscillator('sine',1,0,0.15)],
    {cutoff:1600,sweep:1.2,release:0.17,gain:0.2});
  electronic('synthBrass', '复古合成铜管', '电子主奏', 62, [43,84], '开头明亮、随后收拢的合成铜管，适合短和弦与反拍。',
    [oscillator('saw',1,-4,0.5),oscillator('saw',1,4,0.5)],
    {attack:0.025,decay:0.15,sustain:0.62,cutoff:600,sweep:2.8,filterAttack:0.025,filterDecay:0.18,filterSustain:0.12,q:0.9,serial:true,gain:0.21});
  electronic('synthGlass', '玻璃拨音', '电子拨音', 98, [48,96], '清透的高次泛音与轻巧音头，适合琶音和细碎点缀。',
    [oscillator('sine',1,0,0.65),oscillator('sine',3,0,0.23),oscillator('sine',7,0,0.12)],
    {attack:0.002,decay:0.22,sustain:0,release:0.25,cutoff:7000,keytrack:2,sweep:0,gain:0.19});
  electronic('synthPluck', '紧致拨音', '电子拨音', 81, [43,91], '短促的双层低通拨音，适合密集琶音与重复节奏。',
    [oscillator('saw',1,-3,0.5),oscillator('saw',1,3,0.5)],
    {attack:0.003,decay:0.12,sustain:0,release:0.09,cutoff:300,sweep:4,filterDecay:0.085,filterSustain:0,q:1.1,serial:true,gain:0.23});
  electronic('synthVelvet', '丝绒铺底', '电子铺底', 89, [40,84], '暗而柔软的持续和声，缓慢起音，适合托住主旋律。',
    [oscillator('pulse',1,-4,0.35),oscillator('pulse',1,4,0.35),oscillator('sine',1,0,0.3)],
    {attack:0.5,decay:0.8,sustain:0.9,release:0.9,cutoff:350,sweep:0.8,filterAttack:0.6,filterSustain:0.7,serial:true,rate:0.17,pwm:0.12,motion:0.15,gain:0.16});
  electronic('synthShimmer', '星光铺底', '电子铺底', 92, [48,88], '基音与高八度缓慢交织，明亮轻盈，适合悬浮和声。',
    [oscillator('saw',1,-5,0.4),oscillator('saw',2,5,0.25),oscillator('sine',1,0,0.35)],
    {attack:0.35,decay:0.7,sustain:0.85,release:1.1,cutoff:1800,sweep:0.8,filterAttack:0.4,filterSustain:0.6,rate:0.3,motion:0.45,gain:0.19});
  electronic('synthHollow', '空心氛围', '电子铺底', 95, [43,84], '稀疏奇次泛音构成的空心和声，适合安静的电子氛围。',
    [oscillator('sine',1,0,0.65),oscillator('sine',3,-4,0.25),oscillator('sine',5,4,0.1)],
    {attack:0.24,decay:0.7,sustain:0.8,release:0.75,cutoff:1200,sweep:1,filterAttack:0.35,filterSustain:0.5,rate:0.19,motion:0.6,gain:0.16});
  // Selected sound-design ideas from the V2 bank; original patches, not conversions.
  electronic('synthMouth', '口型共鸣', '电子特色', 54, [43,79], '像元音般缓慢开合的双共鸣，适合带说话感的旋律与铺底。',
    [oscillator('saw',1,0,0.8),oscillator('pulse',1,3,0.2)],
    {attack:0.06,release:0.25,cutoff:4500,sweep:0.3,rate:0.55,formants:[[350,800],[1100,1900]],gain:0.14});
  electronic('synthJaw', '弹簧口簧', '电子特色', 104, [36,72], '拨响后口腔共鸣迅速合拢，带弹簧般的“哇”声。',
    [oscillator('pulse',1,0,0.8),oscillator('sine',1,0,0.2)],
    {attack:0.003,decay:0.25,sustain:0.06,release:0.09,cutoff:3800,sweep:0,filterDecay:0.12,filterSustain:0,formantEnvelope:true,formants:[[280,1150],[900,2400]],gain:0.22});
  electronic('synthDarkBell', '幽金钟', '电子特色', 14, [43,84], '非整数泛音带来幽暗的金属感，适合稀疏敲击与悬疑点缀。',
    [oscillator('sine',1,0,0.55),oscillator('sine',2.71,0,0.28),oscillator('sine',4.13,0,0.17)],
    {attack:0.002,decay:0.85,sustain:0,release:0.65,cutoff:6500,sweep:0,filterDecay:0.3,gain:0.18});
  electronic('synthRandom', '随机光点', '电子特色', 98, [43,88], '音高保持不变，滤波亮度不规则跳动，长音也有颗粒般的变化。',
    [oscillator('pulse',1,0,0.65),oscillator('saw',1,5,0.35)],
    {attack:0.006,decay:0.3,sustain:0.65,release:0.12,cutoff:650,sweep:1.4,q:1.5,serial:true,randomRate:9,randomDepth:2.2,gain:0.11});
  // Expressive ballad, acoustic, orchestral & East Asian procedural voices (append after existing 52 so byProgram stays stable).
  preset('epBell', '水晶铃音电钢', '键盘', 'ep', 4, [48, 96], -0.22, '晶莹的 FM 铃音起振叠加柔和电钢体，适合九十年代抒情与前奏钩子。',
    { index: 1.0, velocityIndex: 1.8, ratio: 1, release: 0.22, gain: 0.088, bell: 0.42, bellDecay: 0.48, warmth: 0.16 });
  preset('pianoWarm', '暖色抒情钢琴', '键盘', 'piano', 1, [36, 96], 0.04, '毡槌柔润起音，中低音温厚绵长，适合抒情铺陈。',
    { brightBase: 0.38, brightVel: 0.28, hammer: 0.09, tauScale: 1.28, warmth: 0.22, gain: 0.205 });
  preset('celesta', '钢片琴', '键盘打击', 'mallet', 8, [60, 103], -0.2, '柔和毡槌击打金属音片，清澈空灵、余音微颤。',
    { ratios: [1, 2.756, 5.404, 8.93], amplitudes: [1, 0.34, 0.14, 0.05], tau: 1.9, softAttack: 0.004, gain: 0.092 });
  preset('guitarSteel12', '十二弦木吉他', '吉他', 'string', 25, [40, 88], 0.34, '主弦叠加高八度复弦共鸣，声场宽阔明亮，适合慢歌副歌前递进。',
    { pick: 0.19, excite: 0.46, velocityExcite: 0.24, tau: 1.65, reference: 196, release: 0.18, body: 205, bodyGain: 0.52, cutoff: 5200, octaveString: 0.26, gain: 0.135 });
  preset('guitarChorus', '合唱清音吉他', '吉他', 'string', 27, [40, 91], 0.28, '清透拾音器叠加轻微合唱双弦波动，泛音丰满柔和。',
    { pick: 0.13, excite: 0.54, velocityExcite: 0.2, tau: 2.35, reference: 196, release: 0.2, body: 640, bodyGain: 0.16, cutoff: 5400, pickup: 0.058, chorus: 0.36, gain: 0.118 });
  preset('bassFretless', '无品贝斯', '贝斯', 'bass', 35, [28, 64], 0, '柔和滑入音高并带鼻音中频歌唱共鸣，适合抒情慢歌托底。',
    { cutoff: 1450, tau: 2.5, noise: 0.025, attack: 0.012, release: 0.09, scoop: -0.022, mwah: 0.48, gain: 0.41 });
  preset('stringsCinema', '影院宽弦乐', '弦乐与拨弦', 'strings', 49, [40, 91], 0.2, '七声部宽失谐叠加八度暖厚度与自然弓压起伏，适合副歌长线条托举。',
    { attack: 0.32, release: 0.58, dark: 0.84, voices: 7, octave: 0.22, swell: 0.22, lush: true, gain: 0.082 });
  preset('stringsCello', '大提琴独奏', '弦乐与拨弦', 'strings', 42, [36, 76], -0.16, '温润深沉的低中音拉弦，带轻微滑音与琴腔共振，适合桥段对位。',
    { attack: 0.11, release: 0.24, dark: 0.72, voices: 2, solo: true, scoop: -0.014, bodyLow: 250, bodyHigh: 640, gain: 0.105 });
  preset('erhuSynth', '柔弦胡琴', '弦乐与拨弦', 'strings', 110, [55, 91], 0.14, '滑入明显、双共振峰带弓弦揉音的东方拉弦音色，适合国风间奏。',
    { attack: 0.085, release: 0.18, dark: 0.92, voices: 2, solo: true, scoop: -0.024, vibDepth: 0.0055, bodyLow: 960, bodyHigh: 2150, nasal: 0.75, gain: 0.095 });
  preset('choirSoft', '柔美人声铺底', '持续与合成', 'choir', 53, [48, 88], 0.18, '更柔和的元音“嗯/啊”共振与细腻气息，适合副歌温柔托举人声。',
    { formants: [520, 1020, 2450], weights: [0.85, 0.36, 0.14], attack: 0.36, release: 0.62, air: 0.022, gain: 0.115 });
  preset('padWarmGlass', '暖玻璃氛围垫', '持续与合成', 'pad', 88, [36, 91], -0.2, '深沉暖底上浮现缓慢玻璃泛音闪烁，适合前奏与尾奏留白。',
    { attack: 0.48, release: 0.78, cutoff: 1.15, sub: 0.2, air: 0.028, glass: 0.24, gain: 0.082 });
  preset('ocarina', '陶笛', '管乐', 'woodwind', 79, [60, 96], -0.14, '圆润纯净、带柔和气息的陶土吹奏感，适合抒情与民谣点缀。',
    { harmonics: [1, 0.14, 0.03], attack: 0.045, release: 0.13, noise: 0.036, vibDepth: 0.0028, gain: 0.092 });
  // The nearest GM family for chip colors remains compatible with existing MIDI exports.
  var chip = { chipPWM: [80, 'SID PWM'], chipSaw: [81, '锯齿波'], chipTable: [80, 'SCC 风格波表'],
    chipHybrid: [38, '混合低音'], chipTriangle: [38, 'NES 三角波'], chipArp: [80, '快速和弦琶音'],
    chipPulse: [80, '脉冲波'], chipPulse12: [80, '12.5% 脉冲'], chipPulse25: [80, '25% 脉冲'],
    chipPulse50: [80, '50% 脉冲'], chipPulse75: [80, '75% 脉冲'], chipPulse87: [80, '87.5% 脉冲'] };
  Object.keys(chip).forEach(function (id) { byId[id] = { id: id, name: chip[id][1], family: 'chip', program: chip[id][0] }; });
  byProgram[81] = 'lead';
  function fromProgram(program) {
    if (byProgram[program]) return byProgram[program];
    if (program < 4) return 'piano';
    if (program < 8) return 'ep';
    if (program <= 10) return 'musicBox';
    if (program === 11) return 'vibraphone';
    if (program < 16) return 'marimba';
    if (program < 24) return 'organ';
    if (program < 32) return 'guitar';
    if (program < 40) return 'bass';
    if (program < 56) return 'strings';
    if (program < 64) return 'brass';
    if (program < 72) return 'clarinet';
    if (program < 80) return 'flute';
    if (program < 88) return 'lead';
    if (program === 112) return 'musicBox';
    if (program >= 113 && program <= 118) return 'marimba';
    return 'pad';
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value);
    }
    return value;
  }
  NSG.Instruments = Object.freeze({ list: freeze(list), all: freeze(byId), version: 1,
    get: function (id) { return byId[id] || null; }, fromProgram: fromProgram });
})(typeof window !== 'undefined' ? window : global);
