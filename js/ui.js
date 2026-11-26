/* ==========================================================================
   NSG · 界面主控
   ========================================================================== */
(function (root) {
  'use strict';
  var NSG = root.NSG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) {
    var rootEl = r || document;
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(rootEl.querySelectorAll(s));
  };

  function formatFallback(template, vars) {
    var str = String(template === undefined ? '' : template);
    if (!vars || typeof vars !== 'object') return str;
    return str.replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined ? String(vars[k]) : m;
    });
  }
  function t(key, vars, fallback) {
    if (NSG && NSG.I18N && typeof NSG.I18N.t === 'function') {
      return NSG.I18N.t(key, vars, fallback);
    }
    return formatFallback(fallback !== undefined ? fallback : key, vars);
  }
  function tMsg(msg) {
    return (NSG && NSG.I18N && typeof NSG.I18N.translateMessage === 'function')
      ? NSG.I18N.translateMessage(msg) : msg;
  }
  function i18nCall(fnName, arg1, arg2) {
    var i18n = NSG && NSG.I18N;
    if (i18n && typeof i18n[fnName] === 'function') return i18n[fnName](arg1, arg2);
    return arg2 !== undefined ? arg2 : arg1;
  }
  function tLangName(code) { return i18nCall('tLangName', code, (NSG.langName && NSG.langName[code]) || code); }
  function tPresetName(p) { return p ? i18nCall('tPresetName', p.preset || p.id, p.name) : ''; }
  function tPresetDesc(p) { return p ? i18nCall('tPresetDesc', p.preset || p.id, p.desc || '') : ''; }
  function tComposeStyleName(st) { return st ? i18nCall('tComposeStyleName', st.id, st.name) : ''; }
  function tComposeStyleTip(st) { return st ? i18nCall('tComposeStyleTip', st.id, st.tip || '') : ''; }
  function tArrangeStyleName(st) { return st ? i18nCall('tArrangeStyleName', st.id, st.name) : ''; }
  function tArrangeStyleTip(st) { return st ? i18nCall('tArrangeStyleTip', st.id, st.tip || '') : ''; }
  function tArrangeMoodName(m) { return m ? i18nCall('tArrangeMoodName', m.id, m.name) : ''; }
  function tTuneStyleName(st) { return st ? i18nCall('tTuneStyleName', st.id, st.name) : ''; }
  function tTuneStyleTip(st) { return st ? i18nCall('tTuneStyleTip', st.id, st.tip || '') : ''; }
  function tPitchShapeName(sh) { return sh ? i18nCall('tPitchShapeName', sh.id, sh.name) : ''; }
  function tInstName(p, fallback) { return p ? i18nCall('tInstrumentName', p.id, p.name) : (fallback || ''); }
  function tInstDesc(p) { return p ? i18nCall('tInstrumentDesc', p.id, p.description || '') : ''; }
  function tInstGroup(g) { return i18nCall('tInstrumentGroup', g, g); }
  function tArrInstName(k, fallback) { return i18nCall('tArrInstName', k, fallback || k); }
  function tThemeName(item) { return item ? i18nCall('tThemeName', item.id, item.name) : ''; }
  function tSchemeName(scheme) { return scheme ? i18nCall('tSchemeName', scheme.id, scheme.name) : ''; }
  function tBgName(item) { return item ? i18nCall('tBgName', item.id, item.name) : ''; }
  function tEyeName(name) { return i18nCall('tEyeName', name, name); }
  function tEyeTip(name, fallback) { return i18nCall('tEyeTip', name, fallback || ''); }
  if (NSG && NSG.I18N && typeof NSG.I18N.init === 'function') {
    NSG.I18N.init();
  }


  var BG_LIST = [
    { id: 'a1', name: '抽象1', file: 'assets/bg/a1.svg', css: 'linear-gradient(160deg,#8fd6ff,#c6f0d8 55%,#ffe9a8)', seedColor: '#168c9e' },
    { id: 'a2', name: '抽象2', file: 'assets/bg/a2.svg', css: 'linear-gradient(160deg,#5ec8f2,#9df0c4 60%,#e8ffd0)', seedColor: '#087d9d' },
    { id: 'a3', name: '抽象3', file: 'assets/bg/a3.svg', css: 'linear-gradient(160deg,#7ec9ff,#a8e6ff 40%,#ffe0f0)', seedColor: '#3d98d6' },
    { id: 'a4', name: '抽象4', file: 'assets/bg/a4.svg', css: 'linear-gradient(160deg,#a0e8ff,#8fd8a8 55%,#f4ffbc)', seedColor: '#479e6b' },
    { id: 'a5', name: '抽象5', file: 'assets/bg/a5.svg', css: 'linear-gradient(160deg,#63b8ea,#89e0e0 50%,#fff2b8)', seedColor: '#248d4c' },
    { id: 'b1', name: '美女1', file: 'assets/bg/b1.svg', css: 'linear-gradient(160deg,#bfe6ff,#e8f6ff 55%,#ffd9e8)', seedColor: '#cd077c' },
    { id: 'b2', name: '美女2', file: 'assets/bg/b2.svg', css: 'linear-gradient(160deg,#c9e0ff,#dff0ff 55%,#ffe6c9)', seedColor: '#038ca3' },
    { id: 'b3', name: '美女3', file: 'assets/bg/b3.svg', css: 'linear-gradient(160deg,#d8ecff,#eaf8f0 55%,#ffe9d0)', seedColor: '#4f3fd4' },
    { id: 'b4', name: '美女4', file: 'assets/bg/b4.svg', css: 'linear-gradient(160deg,#cfe8ff,#e6f2ff 55%,#f0d8ff)', seedColor: '#8c3b64' }
  ];

  function resolveModernYear() {
    try {
      if (typeof window === 'undefined' && typeof document === 'undefined') return '2021';
      if (typeof Date !== 'function') return '2021';
      var now = new Date();
      var year = now && typeof now.getFullYear === 'function' ? now.getFullYear() : NaN;
      if (typeof year === 'number' && isFinite(year) && year >= 1971 && year <= 9999) {
        return ('0000' + Math.floor(year)).slice(-4);
      }
    } catch (e) { }
    return '2021';
  }

  var THEME_LIST = [
    {
      id: 'aero',
      name: 'Aero',
      versionSuffix: '2008',
      supportsTransparency: true
    },
    {
      id: '9x',
      name: '9X',
      versionSuffix: '1998',
      supportsTransparency: false
    },
    {
      id: 'cyberpunk',
      name: '赛博朋克',
      versionSuffix: '2077',
      supportsTransparency: false
    },
    {
      id: 'xp',
      name: 'eXperience',
      versionSuffix: '2001',
      supportsTransparency: false
    },
    {
      id: 'pixel',
      name: '合成',
      versionSuffix: '1986',
      supportsTransparency: false
    },
    {
      id: 'modern',
      name: '现代',
      get versionSuffix() { return resolveModernYear(); },
      supportsTransparency: false
    }
  ];

  var DEFAULT_THEME_SCHEMES = {
    '9x': 'standard',
    xp: 'classic-blue',
    cyberpunk: 'neon-dusk',
    pixel: 'synth-sunset',
    modern: 'baseline'
  };

  var THEME_SCHEMES = {
    '9x': [
      {
        id: 'standard', name: '标准灰',
        isDefault: true, swatches: ['#008080', '#c0c0c0', '#000080', '#1084d0']
      },
      {
        id: 'mystery', name: '神秘暗紫',
        swatches: ['#385048', '#a0a890', '#583c5c', '#c88038'],
        tokens: {
          bg: '#2c3d38', surf: '#a0a890', surf2: '#7a826c', rowAlt: '#f2f4ea', rowMain: '#ffffff',
          border: '#5e6652', borderStrong: '#202418', text: '#000000', textSoft: '#3a4230',
          accent: '#583c5c', accent2: '#88688c', accent3: '#c88038',
          barTop: '#583c5c', barBot: '#88688c', barText: '#ffffff',
          note: '#b8c4a0', note2: '#8e9c78', noteText: '#000000',
          sel: '#c88038', sel2: '#7a4b1e', selText: '#ffffff', play: '#c84828', isDark: false
        }
      },
      {
        id: 'brick', name: '暖砖红',
        swatches: ['#420000', '#c2b69e', '#800000', '#a85430'],
        tokens: {
          bg: '#420000', surf: '#c2b69e', surf2: '#9a8c74', rowAlt: '#f7f2e6', rowMain: '#fffdf7',
          border: '#7d705c', borderStrong: '#261410', text: '#1a0804', textSoft: '#4f3e2e',
          accent: '#800000', accent2: '#b34b28', accent3: '#b83214',
          barTop: '#800000', barBot: '#b34b28', barText: '#fff5e0',
          note: '#dbc9a6', note2: '#b89f74', noteText: '#220804',
          sel: '#961c1c', sel2: '#5c0808', selText: '#ffffff', play: '#d63218', isDark: false
        }
      },
      {
        id: 'eggplant', name: '茄紫罗兰',
        swatches: ['#402848', '#b8b0c4', '#603878', '#207090'],
        tokens: {
          bg: '#402848', surf: '#b8b0c4', surf2: '#9288a0', rowAlt: '#f4f0fa', rowMain: '#ffffff',
          border: '#7a7088', borderStrong: '#261830', text: '#100818', textSoft: '#483c58',
          accent: '#603878', accent2: '#207090', accent3: '#7a4999',
          barTop: '#603878', barBot: '#207090', barText: '#ffffff',
          note: '#d4c8e6', note2: '#a896c4', noteText: '#1a0826',
          sel: '#603878', sel2: '#207090', selText: '#ffffff', play: '#b83278', isDark: false
        }
      },
      {
        id: 'rainy', name: '雨天石板蓝',
        swatches: ['#30485e', '#b4bcc4', '#385874', '#6088a8'],
        tokens: {
          bg: '#30485e', surf: '#b4bcc4', surf2: '#8e98a4', rowAlt: '#eff4f8', rowMain: '#ffffff',
          border: '#707a86', borderStrong: '#1c242c', text: '#0a1016', textSoft: '#3f4c59',
          accent: '#385874', accent2: '#6088a8', accent3: '#2c5270',
          barTop: '#385874', barBot: '#6088a8', barText: '#ffffff',
          note: '#c6d6e4', note2: '#9cb4ca', noteText: '#0a1a28',
          sel: '#385874', sel2: '#1f364b', selText: '#ffffff', play: '#c84a32', isDark: false
        }
      },
      {
        id: 'hcblack', name: '高对比度黑',
        swatches: ['#000000', '#181818', '#00e676', '#800080'],
        tokens: {
          bg: '#000000', surf: '#181818', surf2: '#333333', rowAlt: '#0e0e0e', rowMain: '#000000',
          border: '#707070', borderStrong: '#ffffff', text: '#ffffff', textSoft: '#c8c8c8',
          accent: '#00e676', accent2: '#00b0ff', accent3: '#ffea00',
          barTop: '#800080', barBot: '#0000a8', barText: '#ffffff',
          note: '#003e78', note2: '#00264c', noteText: '#ffffff',
          sel: '#800080', sel2: '#4d004d', selText: '#ffff00', play: '#00e676', isDark: true
        }
      }
    ],
    xp: [
      {
        id: 'classic-blue', name: '经典晴空蓝',
        isDefault: true, swatches: ['#3b7ee6', '#ece9d8', '#0054e3', '#3c8f38'],
        preview: {
          bg: '#3b7ee6', border: '#0054e3',
          bar: 'linear-gradient(180deg, #3f8cf3 0%, #0961ee 18%, #0054e3 58%, #003cb3 100%)',
          dot: '#46b32c', body: '#ece9d8', note1: '#2a72dc', note2: '#46b32c'
        }
      },
      {
        id: 'olive', name: '橄榄抹茶绿',
        swatches: ['#6b883f', '#ece9d6', '#6f853d', '#e87b28'],
        preview: {
          bg: '#6b883f', border: '#6f843e',
          bar: 'linear-gradient(180deg, #a7be6c 0%, #7f9749 20%, #6f853d 60%, #4e6126 100%)',
          dot: '#e87b28', body: '#ece9d6', note1: '#7f9749', note2: '#e87b28'
        },
        tokens: {
          bg: '#4e6828', surf: '#f1f0e2', surf2: '#dddbc4', rowAlt: '#f7f8ee', rowMain: '#ffffff',
          border: '#9aaa74', borderStrong: '#4f622a', text: '#242e12', textSoft: '#59663c',
          accent: '#68823c', accent2: '#d67e2c', accent3: '#8fa956',
          barTop: '#90a660', barBot: '#5e7334', barText: '#ffffff',
          note: '#dce8ba', note2: '#b3c97b', noteText: '#26340c',
          sel: '#d67e2c', sel2: '#a45414', selText: '#ffffff', play: '#d6681c', isDark: false
        }
      },
      {
        id: 'silver', name: '拉丝银灰',
        swatches: ['#8890a4', '#ebebf0', '#b0b2c4', '#3c6eb4'],
        preview: {
          bg: '#8890a4', border: '#7d7f94',
          bar: 'linear-gradient(180deg, #f3f4fa 0%, #cfd1e0 28%, #b0b2c4 66%, #8d8fa4 100%)',
          dot: '#3c6eb4', body: '#ebebf0', note1: '#3c6eb4', note2: '#8b92a6'
        },
        tokens: {
          bg: '#555d72', surf: '#e4e6ee', surf2: '#ccd0dc', rowAlt: '#f4f6fa', rowMain: '#ffffff',
          border: '#a6acbc', borderStrong: '#5a6278', text: '#1c202a', textSoft: '#52586a',
          accent: '#3c6eb4', accent2: '#7a849c', accent3: '#4a80cc',
          barTop: '#dcdfe8', barBot: '#8b92a6', barText: '#141822',
          note: '#d4dfee', note2: '#a8bcd6', noteText: '#10223a',
          sel: '#3c6eb4', sel2: '#234a82', selText: '#ffffff', play: '#d44820', isDark: false
        }
      },
      {
        id: 'royal-blue', name: '皇室深蓝',
        swatches: ['#1648a6', '#e9eef7', '#164eb8', '#2b9c46'],
        preview: {
          bg: '#1648a6', border: '#1749a8',
          bar: 'linear-gradient(180deg, #6aa7f8 0%, #2b6be0 20%, #164eb8 58%, #0c2f78 100%)',
          dot: '#2b9c46', body: '#e9eef7', note1: '#2a6fd0', note2: '#2b9c46'
        },
        tokens: {
          bg: '#163d7a', surf: '#ebeef5', surf2: '#d4dced', rowAlt: '#f4f7fc', rowMain: '#ffffff',
          border: '#7294cc', borderStrong: '#1c4f9e', text: '#101c34', textSoft: '#42587c',
          accent: '#2a6fd0', accent2: '#2b9c46', accent3: '#5ca0ff',
          barTop: '#4e8ee6', barBot: '#1c52a8', barText: '#ffffff',
          note: '#cce0ff', note2: '#8ebaff', noteText: '#082454',
          sel: '#2a6fd0', sel2: '#184990', selText: '#ffffff', play: '#e05818', isDark: false
        }
      },
      {
        id: 'charcoal-orange', name: '酷黑活力橙',
        swatches: ['#161618', '#252529', '#323238', '#e86c1a'],
        preview: {
          bg: '#161618', border: '#44444c',
          bar: 'linear-gradient(180deg, #4b4b52 0%, #323238 50%, #19191c 100%)',
          dot: '#e86c1a', body: '#252529', note1: '#e86c1a', note2: '#ff9c52'
        },
        tokens: {
          bg: '#161618', surf: '#252529', surf2: '#1d1d21', rowAlt: '#1c1c20', rowMain: '#16161a',
          border: '#47474f', borderStrong: '#80808a', text: '#f0f0f4', textSoft: '#9c9ca8',
          accent: '#e86c1a', accent2: '#ff9c52', accent3: '#ffb26b',
          barTop: '#4b4b52', barBot: '#222226', barText: '#ffffff',
          note: '#7a3b14', note2: '#52250a', noteText: '#fff0e6',
          sel: '#e65a1c', sel2: '#a63808', selText: '#ffffff', play: '#e65a1c', isDark: true
        }
      },
      {
        id: 'noir', name: '暗夜曜黑',
        swatches: ['#14161f', '#22252f', '#2c3140', '#4888d8'],
        preview: {
          bg: '#14161f', border: '#384054',
          bar: 'linear-gradient(180deg, #434a5e 0%, #2c3140 50%, #151820 100%)',
          dot: '#4888d8', body: '#22252f', note1: '#4888d8', note2: '#7ab0ff'
        },
        tokens: {
          bg: '#111318', surf: '#242830', surf2: '#1a1d24', rowAlt: '#1e222a', rowMain: '#181b22',
          border: '#444b5a', borderStrong: '#76849e', text: '#eef2f8', textSoft: '#9aa6ba',
          accent: '#4888d8', accent2: '#48b868', accent3: '#f09438',
          barTop: '#3e4452', barBot: '#181b22', barText: '#f4f8ff',
          note: '#2c4c7c', note2: '#1d3456', noteText: '#e4f0ff',
          sel: '#4888d8', sel2: '#295b9c', selText: '#ffffff', play: '#f08c28', isDark: true
        }
      }
    ],
    cyberpunk: [
      {
        id: 'neon-dusk', name: '霓虹夜幕',
        isDefault: true, swatches: ['#070912', '#101424', '#00f0ff', '#ff2a6d']
      },
      {
        id: 'crimson-corp', name: '警戒红',
        swatches: ['#0c0608', '#180c10', '#e61c2e', '#ff9e00'],
        tokens: {
          bg: '#0c0608', surf: '#180c10', surf2: '#10070a', rowAlt: '#12080c', rowMain: '#0a0507',
          border: '#6e1c28', borderStrong: '#e61c2e', text: '#ffecee', textSoft: '#c4868e',
          accent: '#e61c2e', accent2: '#ff9e00', accent3: '#ff4d5a',
          barTop: '#380910', barBot: '#140508', barText: '#ffccd2',
          note: '#5c101b', note2: '#34070e', noteText: '#ffdfe3',
          sel: '#ff9e00', sel2: '#a85a00', selText: '#1a0600', play: '#e61c2e', isDark: true
        }
      },
      {
        id: 'netrunner', name: '矩阵荧光绿',
        swatches: ['#030d09', '#071a13', '#00ff9d', '#4df0ff'],
        tokens: {
          bg: '#030d09', surf: '#071a13', surf2: '#05120d', rowAlt: '#06140f', rowMain: '#030c08',
          border: '#0c5239', borderStrong: '#00ff9d', text: '#dcfff0', textSoft: '#6ec4a2',
          accent: '#00ff9d', accent2: '#4df0ff', accent3: '#b8ff4d',
          barTop: '#062c1e', barBot: '#03120c', barText: '#00ff9d',
          note: '#07402b', note2: '#032418', noteText: '#b8ffe2',
          sel: '#4df0ff', sel2: '#0e788a', selText: '#02161a', play: '#ff2e63', isDark: true
        }
      },
      {
        id: 'neon-yellow', name: '街头霓虹黄',
        swatches: ['#0d0c04', '#181608', '#fcee09', '#ff2a85'],
        tokens: {
          bg: '#0d0c04', surf: '#181608', surf2: '#100f05', rowAlt: '#131107', rowMain: '#0b0a04',
          border: '#5e5614', borderStrong: '#fcee09', text: '#fffde0', textSoft: '#c8be74',
          accent: '#fcee09', accent2: '#ff2a85', accent3: '#00f0ff',
          barTop: '#332f08', barBot: '#121004', barText: '#fcee09',
          note: '#474208', note2: '#262304', noteText: '#fffbb8',
          sel: '#ff2a85', sel2: '#8c0e44', selText: '#ffffff', play: '#ff2a85', isDark: true
        }
      },
      {
        id: 'quantum', name: '量子紫',
        swatches: ['#0b0618', '#150c2e', '#d65cff', '#00f5ff'],
        tokens: {
          bg: '#0b0618', surf: '#150c2e', surf2: '#0e0720', rowAlt: '#120a26', rowMain: '#090514',
          border: '#4f288a', borderStrong: '#d65cff', text: '#f6ebff', textSoft: '#ab8ad6',
          accent: '#d65cff', accent2: '#00f5ff', accent3: '#ff5eb8',
          barTop: '#2c105c', barBot: '#110626', barText: '#f2ccff',
          note: '#38156e', note2: '#1f0a42', noteText: '#ecc9ff',
          sel: '#00f5ff', sel2: '#0b6878', selText: '#05141a', play: '#ff42b0', isDark: true
        }
      }
    ],
    pixel: [
      {
        id: 'synth-sunset', name: '落日霓虹',
        isDefault: true, swatches: ['#06010f', '#130829', '#ff2e97', '#00f5d4']
      },
      {
        id: 'retro-red', name: '红白复古金',
        swatches: ['#1b0509', '#2b0b12', '#c82534', '#f5c962'],
        tokens: {
          bg: '#1b0509', surf: '#2b0b12', surf2: '#1c070c', rowAlt: '#24090f', rowMain: '#160408',
          border: '#8f2d36', borderStrong: '#d4a84f', text: '#f7eed6', textSoft: '#c7a98c',
          accent: '#f5c962', accent2: '#c82534', accent3: '#78e86b',
          barTop: '#9c1a27', barBot: '#5e0d16', barText: '#ffe270',
          note: '#6e1620', note2: '#420a11', noteText: '#fff0cc',
          sel: '#f5c962', sel2: '#9c6e14', selText: '#220608', play: '#78e86b', isDark: true
        }
      },
      {
        id: 'handheld-green', name: '掌机绿幕',
        swatches: ['#0f380f', '#174417', '#9bbc0f', '#8bac0f'],
        tokens: {
          bg: '#0f380f', surf: '#174417', surf2: '#0b260b', rowAlt: '#133b13', rowMain: '#0e300e',
          border: '#306230', borderStrong: '#9bbc0f', text: '#c6e043', textSoft: '#8bac0f',
          accent: '#9bbc0f', accent2: '#d4ef4d', accent3: '#8bac0f',
          barTop: '#306230', barBot: '#0f380f', barText: '#d4ef4d',
          note: '#306230', note2: '#1f471f', noteText: '#d4ef4d',
          sel: '#9bbc0f', sel2: '#6b8e14', selText: '#0f380f', play: '#d4ef4d', isDark: true
        }
      },
      {
        id: 'home-indigo', name: '靛蓝复古',
        swatches: ['#251d7a', '#352879', '#70a4b2', '#b8c76f'],
        tokens: {
          bg: '#251d7a', surf: '#352879', surf2: '#1f174e', rowAlt: '#2e226e', rowMain: '#23195c',
          border: '#6c5eb5', borderStrong: '#b8c76f', text: '#d8d2ff', textSoft: '#9f96e8',
          accent: '#70a4b2', accent2: '#b8c76f', accent3: '#68372b',
          barTop: '#4b3d9c', barBot: '#271d5e', barText: '#b8c76f',
          note: '#4d3ea3', note2: '#312573', noteText: '#ffffff',
          sel: '#b8c76f', sel2: '#7a8834', selText: '#1c154a', play: '#70c774', isDark: true
        }
      },
      {
        id: 'amber-crt', name: '琥珀终端',
        swatches: ['#0c0700', '#170d00', '#ffb000', '#ff7300'],
        tokens: {
          bg: '#0c0700', surf: '#170d00', surf2: '#0a0600', rowAlt: '#130b00', rowMain: '#0a0500',
          border: '#6b4500', borderStrong: '#ffb000', text: '#ffcc52', textSoft: '#c28412',
          accent: '#ffb000', accent2: '#ff7300', accent3: '#ffe285',
          barTop: '#4a2b00', barBot: '#1d1100', barText: '#ffb000',
          note: '#523200', note2: '#2e1b00', noteText: '#ffd978',
          sel: '#ffb000', sel2: '#9c6200', selText: '#120800', play: '#ff7300', isDark: true
        }
      }
    ],
    modern: [
      { id: 'baseline', name: '紫罗兰', seed: '#6750a4', isDefault: true, swatches: ['#fef7ff', '#eaddff', '#6750a4', '#7d5260'] },
      { id: 'teal', name: '碧青冷萃', seed: '#006a6a', swatches: ['#f4fbfa', '#cce8e7', '#006a6a', '#4a6363'] },
      { id: 'ocean', name: '晴海蔚蓝', seed: '#1a68b8', swatches: ['#f6f9ff', '#d6e4ff', '#1a68b8', '#445e91'] },
      { id: 'forest', name: '森野翡翠', seed: '#2d7a47', swatches: ['#f5fbf5', '#cdeed5', '#2d7a47', '#52634f'] },
      { id: 'terracotta', name: '赤陶暖橘', seed: '#b8561e', swatches: ['#fff8f5', '#ffdbcb', '#b8561e', '#77574a'] },
      { id: 'rose', name: '绯樱玫瑰', seed: '#a83268', swatches: ['#fff8f9', '#ffd9e4', '#a83268', '#74565f'] },
      { id: 'amber', name: '琥珀曜金', seed: '#8a6d00', swatches: ['#fff9ee', '#ffdf90', '#8a6d00', '#6a5d3f'] },
      { id: 'slate', name: '石墨青岩', seed: '#525e70', swatches: ['#f7f9fc', '#dbe2f0', '#525e70', '#5b5f71'] },
      { id: 'dark-violet', name: '暗夜紫韵', seed: '#6750a4', dark: true, swatches: ['#17141d', '#3e2d68', '#d0bcff', '#efb8c8'] },
      { id: 'dark-teal', name: '深海翡翠', seed: '#007a7a', dark: true, swatches: ['#111818', '#0d4747', '#80d8d8', '#b0cccb'] },
      { id: 'dark-ocean', name: '午夜星蓝', seed: '#256ec2', dark: true, swatches: ['#12161e', '#173e6e', '#a8c8ff', '#bfc6dc'] },
      { id: 'dark-rose', name: '黑曜绯樱', seed: '#b83c72', dark: true, swatches: ['#1c1317', '#5e1a3a', '#ffb0cf', '#e2bdc8'] }
    ]
  };

  /* ---------------- Material You 动态取色（现代主题） ---------------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clampRange(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [103, 80, 164];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    var h = function (x) {
      var s = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return s.length < 2 ? '0' + s : s;
    };
    return '#' + h(r) + h(g) + h(b);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp01(s); l = clamp01(l);
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var hk = h / 360;
    var conv = function (t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(conv(hk + 1 / 3) * 255), Math.round(conv(hk) * 255), Math.round(conv(hk - 1 / 3) * 255)];
  }

  function hslHex(h, s, l) {
    var rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }

  function hslRgba(h, s, l, a) {
    var rgb = hslToRgb(h, s, l);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }

  function hexAlpha(hex, a) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }

  function rgbaPrefix(hex) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',';
  }

  function mixHex(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB), u = clamp01(t);
    return rgbToHex(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
  }

  function shadeHex(hex, deltaL) {
    var rgb = hexToRgb(hex), hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    return hslHex(hsl[0], hsl[1], clamp01(hsl[2] + deltaL));
  }

  function hueDistance(a, b) {
    var d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
    return d;
  }

  function pickDistinctHue(candidates, avoidHues, preferred) {
    var best = candidates[0], bestScore = -1;
    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i], minD = 180;
      for (var j = 0; j < avoidHues.length; j++) {
        minD = Math.min(minD, hueDistance(cand, avoidHues[j]));
      }
      var bonus = preferred !== undefined && hueDistance(cand, preferred) < 8 ? 6 : 0;
      var score = minD + bonus;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best;
  }

  var SCHEME_TUNING = {
    '9x:mystery': { pit: '#1d2219', ctrl: '#c82868', vib: '#147a72' },
    '9x:brick': { pit: '#1f1410', ctrl: '#d62870', vib: '#1a7a5e' },
    '9x:eggplant': { pit: '#1c1428', ctrl: '#e03c6e', vib: '#0f7e8c' },
    '9x:rainy': { pit: '#16202b', ctrl: '#dc326c', vib: '#1e8848' },
    '9x:hcblack': { pit: '#ffffff', ctrl: '#ff4081', vib: '#00e676' },
    'xp:olive': { pit: '#222b14', ctrl: '#d82b72', vib: '#1e6ec8' },
    'xp:silver': { pit: '#1c222e', ctrl: '#d93674', vib: '#1e8a58' },
    'xp:royal-blue': { pit: '#162238', ctrl: '#e0357a', vib: '#1c8c42' },
    'xp:charcoal-orange': { pit: '#f0f4ff', ctrl: '#ff4da6', vib: '#38d8b0' },
    'xp:noir': { pit: '#eef4ff', ctrl: '#ff528e', vib: '#48d678' },
    'cyberpunk:crimson-corp': { pit: '#fff0f2', ctrl: '#00f0ff', vib: '#52ff8f' },
    'cyberpunk:netrunner': { pit: '#e8fff6', ctrl: '#ff3b82', vib: '#ffe640' },
    'cyberpunk:neon-yellow': { pit: '#fffde8', ctrl: '#00f0ff', vib: '#48ff7b' },
    'cyberpunk:quantum': { pit: '#f7ebff', ctrl: '#ff4db8', vib: '#52ff9c' },
    'pixel:retro-red': { pit: '#fff6e0', ctrl: '#4dd8ff', vib: '#78e86b' },
    'pixel:handheld-green': { pit: '#f0ff9e', ctrl: '#ffd84d', vib: '#5ce6a0' },
    'pixel:home-indigo': { pit: '#ffffff', ctrl: '#ff70a6', vib: '#70e0c8' },
    'pixel:amber-crt': { pit: '#fff2cc', ctrl: '#ff5c33', vib: '#66e0a3' }
  };

  function buildSchemeCanvasPalettes(themeId, scheme) {
    if (!scheme || scheme.isDefault || !scheme.tokens) return null;
    var t = scheme.tokens;
    var sharp = themeId === '9x' || themeId === 'cyberpunk' || themeId === 'pixel';
    var rNote = themeId === '9x' ? 0 : themeId === 'cyberpunk' ? 2 : themeId === 'pixel' ? 0 : 4;
    var rBtn = sharp ? 0 : 5;
    var isDark = !!t.isDark;
    var edgeHi = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.78)';
    var edgeLow = isDark ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.22)';
    var blackKeyFill = isDark
      ? [
          mixHex(t.bg, '#000000', 0.32),
          mixHex(t.bg, '#000000', 0.58),
          mixHex(t.bg, '#000000', 0.74),
          mixHex(t.bg, '#000000', 0.45)
        ]
      : [
          mixHex('#42454c', t.accent, 0.16),
          mixHex('#27292e', t.accent, 0.14),
          mixHex('#14161a', t.accent, 0.12),
          mixHex('#31343a', t.accent, 0.15)
        ];
    var whiteKeyGrad = isDark
      ? [shadeHex(t.surf, 0.10), t.surf, mixHex(t.surf, t.surf2, 0.65)]
      : (themeId === '9x' ? [t.rowMain, t.rowAlt, t.surf] : ['#ffffff', t.rowAlt, t.surf2]);
    var kbBlackHi = isDark
      ? (themeId === 'cyberpunk' || themeId === 'pixel' ? hexAlpha(t.accent, 0.58) : 'rgba(255,255,255,0.26)')
      : (themeId === '9x' ? mixHex(t.borderStrong, '#ffffff', 0.48) : 'rgba(255,255,255,0.28)');
    var kbBlackStroke = isDark
      ? (themeId === 'cyberpunk' || themeId === 'pixel' ? t.accent : t.borderStrong)
      : (themeId === '9x' ? '#000000' : mixHex(t.borderStrong, '#000000', 0.65));
    var kbKeyDivider = isDark
      ? mixHex(t.border, t.surf2, 0.35)
      : (themeId === '9x' ? t.border : mixHex(t.border, '#ffffff', 0.35));

    var specLow = hexToRgb(t.bg);
    var specMid = hexToRgb(t.accent);
    var specHigh = hexToRgb(t.accent2);

    var tuningSpec = SCHEME_TUNING[themeId + ':' + scheme.id];
    var pitLineColor, ctrlColor, vibColor;
    if (tuningSpec) {
      pitLineColor = tuningSpec.pit;
      ctrlColor = tuningSpec.ctrl;
      vibColor = tuningSpec.vib;
    } else {
      var noteH = rgbToHsl.apply(null, hexToRgb(t.note))[0];
      var selH = rgbToHsl.apply(null, hexToRgb(t.sel))[0];
      var ctrlH = pickDistinctHue([338, 22, 195, 295, 45], [noteH, selH], 338);
      var vibH = pickDistinctHue([158, 128, 205, 265, 85, 36], [noteH, selH, ctrlH], 158);
      pitLineColor = isDark ? '#eef4ff' : '#1e2630';
      ctrlColor = hslHex(ctrlH, 0.84, isDark ? 0.64 : 0.48);
      vibColor = hslHex(vibH, 0.78, isDark ? 0.64 : 0.38);
    }
    var pitOutlineColor = hexAlpha(t.rowMain, isDark ? 0.94 : 0.90);
    var nodeStroke = isDark ? t.rowMain : (themeId === '9x' ? '#000000' : '#ffffff');
    var nodeHi = isDark ? '#ffffff' : (themeId === '9x' ? '#ffffff' : mixHex(ctrlColor, '#ffffff', 0.85));

    return {
      spec: { low: specLow, mid: specMid, high: specHigh },
      roll: {
        noteStyle: themeId, kbStyle: themeId, nodeStyle: themeId,
        rowBlack: rgbaPrefix(t.rowAlt),
        rowWhite: rgbaPrefix(t.rowMain),
        octaveLine: t.border,
        gridBar: t.borderStrong, gridBeat: t.border, gridSub: t.surf2, barText: t.textSoft,
        tempoLine: t.accent3 || t.play, tempoText: t.accent3 || t.play,
        noteRadius: rNote, noteGloss: themeId === 'aero',
        noteSelGrad: [t.sel, t.sel, t.sel2, t.sel2],
        noteGrad: [t.note, t.note, t.note2, t.note2],
        noteSelStroke: themeId === 'cyberpunk' ? t.sel : t.borderStrong,
        noteStroke: (themeId === 'cyberpunk' || themeId === 'pixel') ? t.accent : t.borderStrong,
        noteSelEdge: isDark ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.82)',
        noteEdge: isDark ? hexAlpha(t.accent, 0.82) : 'rgba(255,255,255,0.78)',
        noteSelBevelLo: isDark ? 'rgba(0,0,0,0.65)' : hexAlpha(t.sel2 || t.borderStrong, 0.72),
        noteBevelLo: isDark ? 'rgba(0,0,0,0.62)' : hexAlpha(t.borderStrong, 0.58),
        noteNeonBar: t.accent, noteSelNeonBar: t.sel,
        noteSelText: t.selText, noteText: t.noteText,
        slurMark: t.accent2, slurArc: t.accent,
        wordJoinSel: t.selText, wordJoin: t.accent,
        bandFill: hexAlpha(t.accent, 0.16), bandStroke: t.accent,
        velBg: [rgbaPrefix(t.surf), rgbaPrefix(t.surf2)],
        velTop: t.borderStrong, velHi: edgeHi,
        consDash: t.accent2,
        velBarSel: t.sel, velBarCons: t.accent2, velBar: t.accent,
        velBarHi: edgeHi,
        kbBg: [t.surf, t.surf2], kbBlackRow: isDark ? mixHex(t.bg, '#000000', 0.25) : t.surf2,
        kbBlackGrad: blackKeyFill,
        kbBlackHi: kbBlackHi,
        kbBlackStroke: kbBlackStroke,
        kbWhiteGrad: whiteKeyGrad, kbWhiteHi: isDark ? 'rgba(255,255,255,0.22)' : '#ffffff',
        kbKeyDivider: kbKeyDivider,
        kbOctaveText: t.accent, kbBorder: t.border,
        rulerGrad: [t.surf, t.surf2, t.surf2, t.surf],
        rulerTop: t.borderStrong, rulerBottom: t.borderStrong, rulerLabel: t.text,
        rulerTickBar: t.borderStrong, rulerTickBeat: t.border, rulerBarText: t.text, rulerTempoText: t.accent3 || t.play,
        btnRadius: rBtn,
        btnConsOn: [t.accent2, t.accent2, t.accent, t.accent2],
        btnVelOn: [t.barTop, t.barTop, t.barBot, t.barTop],
        btnOff: [t.surf, t.surf2, t.surf2, t.surf],
        btnConsStroke: t.accent2, btnVelStroke: t.borderStrong, btnOffStroke: t.border,
        btnTextOn: t.barText, btnTextOff: t.textSoft,
        playGlow: hexAlpha(t.play, 0.25), playLine: t.play,
        playHead: [t.play, t.accent3 || t.play, t.play],
        playHeadStroke: t.text,
        phoneCustom: t.accent2, phoneDefault: t.textSoft,
        pitOutline: pitOutlineColor, pitLine: pitLineColor,
        pitCtrlLine: ctrlColor, vibLine: vibColor,
        pitNodeFill: ctrlColor, pitNodeStroke: nodeStroke, pitNodeHi: nodeHi,
        vibBtnOn: [t.barTop, t.barTop, t.barBot],
        vibBtnOff: [t.surf, t.surf2, t.surf2],
        vibBtnOnStroke: t.accent, vibBtnOffStroke: t.border, vibBtnText: t.textSoft, vibBtnOnText: t.barText,
        vibHandle: vibColor, vibRateLine: t.accent, vibRateDot: t.accent
      },
      phone: {
        pairs: [
          { ink: isDark ? t.accent : t.text, fill: hexAlpha(t.accent, isDark ? 0.22 : 0.16), selected: hexAlpha(t.accent, isDark ? 0.40 : 0.34) },
          { ink: isDark ? t.accent2 : t.text, fill: hexAlpha(t.accent2, isDark ? 0.22 : 0.16), selected: hexAlpha(t.accent2, isDark ? 0.40 : 0.34) }
        ],
        silence: { ink: t.textSoft, fill: hexAlpha(t.border, 0.20), selected: hexAlpha(t.border, 0.38) },
        fallback: t.textSoft,
        bg: [rgbaPrefix(t.rowMain), rgbaPrefix(t.rowAlt), rgbaPrefix(t.surf2)],
        topLine: t.borderStrong, hiLine: edgeHi,
        capText: t.text, subText: t.textSoft,
        beatBar: t.borderStrong, beatTick: t.border, baseLine: t.borderStrong,
        labelBg: hexAlpha(t.surf, 0.92), emptyText: t.textSoft,
        rampFill: hexAlpha(t.accent, 0.30), gripFill: t.surf
      },
      ui: {
        bgTop: isDark ? t.rowMain : t.surf, bgMid: t.rowAlt, bgBot: t.surf2,
        grid: hexAlpha(t.border, isDark ? 0.42 : 0.35), axisText: t.textSoft,
        curveGlow: hexAlpha(t.accent, 0.28), curveLine: t.accent,
        curveArea: [hexAlpha(t.accent, 0.32), hexAlpha(t.accent2, 0.18), hexAlpha(t.accent2, 0.04)],
        formant0: t.accent2, formantRest: hexAlpha(t.accent3 || t.play, 0.72), formantText: t.text,
        specGrid: edgeLow, specText: t.barText, specFormant: hexAlpha(t.accent2, 0.90),
        harmBg: [isDark ? t.rowMain : t.surf, t.surf2],
        harmHi: [t.sel, t.sel, t.sel2, t.sel2],
        harmBar: [t.accent, t.accent2, t.note, t.note2],
        harmGloss: edgeHi, harmSheen: 'rgba(255,255,255,.16)',
        harmLabel: t.textSoft, harmMeas: t.text, harmVal: t.accent2, harmBase: t.border,
        eyeBg: [isDark ? t.rowMain : t.surf, t.surf2], eyeGrid: t.border, eyeAxis: t.textSoft,
        eyeTick: t.borderStrong,
        eyeSelFill: [hexAlpha(t.sel, 0.32), hexAlpha(t.sel, 0.15), hexAlpha(t.sel, 0.04)],
        eyeFill: [hexAlpha(t.accent, 0.24), hexAlpha(t.accent, 0.10), hexAlpha(t.accent, 0.03)],
        eyeSelGlow: hexAlpha(t.sel, 0.52), eyeGlow: hexAlpha(t.accent, 0.35),
        eyeSelStroke: t.sel, eyeStroke: t.accent,
        eyeSelHandle: t.sel, eyeHandle: t.accent, eyeEndSel: t.play, eyeEnd: t.accent2,
        eyeStepHalo: hexAlpha(t.surf, 0.92), eyeStepLine: t.play,
        eyeMom: hexAlpha(t.accent2, 0.72),
        eyeTitle: t.accent, eyeLegend: t.play
      }
    };
  }

  function extractSeedColorFromImage(img) {
    try {
      if (!img || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
      var cv = document.createElement('canvas');
      if (!cv || typeof cv.getContext !== 'function') return null;
      var W = 32, H = 18;
      cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, W, H);
      var data = ctx.getImageData(0, 0, W, H).data;
      var buckets = [];
      for (var bi = 0; bi < 36; bi++) buckets.push({ w: 0, r: 0, g: 0, b: 0 });
      var totalW = 0, sumR = 0, sumG = 0, sumB = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var hsl = rgbToHsl(r, g, b);
        var s = hsl[1], l = hsl[2];
        // 优先高饱和度、明度适中的点，避免大面积白底或黑底主导
        var lumWeight = Math.max(0.15, 1 - Math.abs(l - 0.50) * 1.45);
        var chromaWeight = s > 0.08 ? (0.25 + s * 3.2) : 0.04;
        var w = chromaWeight * lumWeight;
        var idx = Math.floor(((hsl[0] % 360) + 360) % 360 / 10) % 36;
        buckets[idx].w += w;
        buckets[idx].r += r * w;
        buckets[idx].g += g * w;
        buckets[idx].b += b * w;
        totalW += 1; sumR += r; sumG += g; sumB += b;
      }
      var best = buckets[0];
      for (var j = 1; j < buckets.length; j++) {
        if (buckets[j].w > best.w) best = buckets[j];
      }
      if (best.w > 0.01) {
        return rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w);
      }
      if (totalW > 0) return rgbToHex(sumR / totalW, sumG / totalW, sumB / totalW);
    } catch (e) { }
    return null;
  }

  function buildModernPalette(seedHex, isDark) {
    var dark = !!isDark;
    var rgb = hexToRgb(seedHex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var h = hsl[0];
    var s = clampRange(hsl[1], 0.28, 0.78);
    // 亮黄/青绿区间在白字对比度上需要稍压深明度以保持 M3 按钮可读性
    var primaryL = dark ? 0.78 : ((h > 42 && h < 192) ? 0.33 : 0.41);
    var h2 = (h + 52) % 360;
    var h3 = (h + 150) % 360;
    var sMuted = clampRange(s * 0.42, 0.14, 0.34);
    var sSurf = clampRange(s * 0.34, 0.10, 0.28);

    var primary = hslHex(h, clampRange(s, 0.38, 0.78), primaryL);
    var primaryHover = hslHex(h, clampRange(s, 0.40, 0.80), dark ? 0.84 : primaryL - 0.05);
    var primaryPress = hslHex(h, clampRange(s, 0.42, 0.78), dark ? 0.70 : primaryL - 0.09);
    var primaryDeep = hslHex(h, clampRange(s, 0.45, 0.78), dark ? 0.83 : primaryL - 0.11);
    var onPrimary = dark ? hslHex(h, clampRange(s, 0.45, 0.80), 0.14) : '#ffffff';
    var primaryCont = hslHex(h, clampRange(s * (dark ? 0.65 : 0.85), dark ? 0.28 : 0.42, dark ? 0.60 : 0.86), dark ? 0.27 : 0.90);
    var primaryContMid = hslHex(h, clampRange(s * (dark ? 0.62 : 0.80), dark ? 0.26 : 0.38, dark ? 0.56 : 0.82), dark ? 0.32 : 0.85);
    var onPrimaryCont = hslHex(h, clampRange(s, 0.45, 0.82), dark ? 0.90 : 0.16);
    var secCont = hslHex(h, sMuted, dark ? 0.24 : 0.90);
    var onSecCont = hslHex(h, clampRange(sMuted * 1.2, 0.18, 0.45), dark ? 0.88 : 0.17);
    var tertiary = hslHex(h2, clampRange(s * 0.72, 0.32, 0.68), dark ? 0.78 : 0.38);
    var tertiaryCont = hslHex(h2, clampRange(s * (dark ? 0.58 : 0.78), dark ? 0.26 : 0.38, dark ? 0.56 : 0.78), dark ? 0.28 : 0.90);
    var onTertiaryCont = hslHex(h2, clampRange(s * 0.68, 0.32, 0.72), dark ? 0.90 : 0.17);
    var accent = hslHex(h3, clampRange(s * 0.72, 0.36, 0.72), dark ? 0.74 : 0.34);
    var accentCont = hslHex(h3, clampRange(s * (dark ? 0.55 : 0.72), dark ? 0.26 : 0.36, dark ? 0.52 : 0.74), dark ? 0.26 : 0.89);

    var surfL = dark ? 0.10 : 0.985;
    var surfLowL = dark ? 0.13 : 0.96;
    var surfContL = dark ? 0.16 : 0.94;
    var surfHighL = dark ? 0.20 : 0.905;
    var surfHighestL = dark ? 0.24 : 0.87;

    var surf = hslHex(h, sSurf, surfL);
    var surfLow = hslHex(h, clampRange(sSurf * 0.85, 0.08, 0.24), surfLowL);
    var surfCont = hslHex(h, clampRange(sSurf * 0.80, 0.08, 0.22), surfContL);
    var surfHigh = hslHex(h, clampRange(sSurf * 0.76, 0.07, 0.20), surfHighL);
    var surfHighest = hslHex(h, clampRange(sSurf * 0.72, 0.06, 0.18), surfHighestL);
    var inputBg = dark ? hslHex(h, sSurf, 0.08) : '#ffffff';
    var onSurf = hslHex(h, 0.10, dark ? 0.91 : 0.11);
    var onSurfVar = hslHex(h, 0.08, dark ? 0.76 : 0.30);
    var outline = hslHex(h, 0.10, dark ? 0.56 : 0.48);
    var outlineVar = hslHex(h, 0.12, dark ? 0.30 : 0.79);
    var gridBar = hslHex(h, clampRange(s * 0.32, 0.12, 0.28), dark ? 0.34 : 0.70);

    var cssVars = {
      '--md-seed': rgbToHex(rgb[0], rgb[1], rgb[2]),
      '--md-primary': primary,
      '--md-primary-hover': primaryHover,
      '--md-primary-press': primaryPress,
      '--md-primary-deep': primaryDeep,
      '--md-on-primary': onPrimary,
      '--md-primary-container': primaryCont,
      '--md-primary-container-mid': primaryContMid,
      '--md-on-primary-container': onPrimaryCont,
      '--md-secondary-container': secCont,
      '--md-on-secondary-container': onSecCont,
      '--md-tertiary': tertiary,
      '--md-tertiary-container': tertiaryCont,
      '--md-on-tertiary-container': onTertiaryCont,
      '--md-accent': accent,
      '--md-accent-container': accentCont,
      '--md-surface': surf,
      '--md-surface-low': surfLow,
      '--md-surface-container': surfCont,
      '--md-surface-high': surfHigh,
      '--md-surface-highest': surfHighest,
      '--md-input-bg': inputBg,
      '--md-on-surface': onSurf,
      '--md-on-surface-variant': onSurfVar,
      '--md-outline': outline,
      '--md-outline-variant': outlineVar,
      '--md-error': dark ? '#f2b8b5' : '#b3261e',
      '--md-error-container': dark ? '#8c1d18' : '#f9dedc',
      '--md-on-error-container': dark ? '#f9dedc' : '#410e0b',
      '--md-error-border': dark ? '#b3261e' : '#f2b8b5',
      '--md-primary-08': hslRgba(h, s, primaryL, dark ? 0.12 : 0.08),
      '--md-primary-18': hslRgba(h, s, primaryL, dark ? 0.22 : 0.18),
      '--md-primary-26': hslRgba(h, s, primaryL, dark ? 0.30 : 0.26),
      '--md-primary-34': hslRgba(h, s, primaryL, dark ? 0.38 : 0.34),
      '--md-glow-1': hslRgba(h, clampRange(s, 0.35, 0.75), dark ? 0.32 : 0.82, dark ? 0.42 : 0.55),
      '--md-glow-2': hslRgba(h3, clampRange(s * 0.7, 0.3, 0.65), dark ? 0.30 : 0.82, dark ? 0.36 : 0.45)
    };

    var specLow = hslToRgb(h, clampRange(s * 0.55, 0.22, 0.50), dark ? 0.08 : 0.16);
    var specMid = hslToRgb(h, clampRange(s * 0.75, 0.35, 0.70), dark ? 0.54 : 0.48);
    var specHigh = hslToRgb(h2, clampRange(s * 0.80, 0.45, 0.82), dark ? 0.88 : 0.86);

    var modCtrlHue = pickDistinctHue([338, 24, 195, 295, 44], [h, h2], 338);
    var modVibHue = pickDistinctHue([168, 138, 205, 265, 85, 36], [h, h2, modCtrlHue], 168);
    var modPitLine = dark ? hslHex(h, 0.14, 0.92) : hslHex(h, 0.22, 0.20);
    var modCtrlLine = hslHex(modCtrlHue, 0.82, dark ? 0.68 : 0.45);
    var modVibLine = hslRgba(modVibHue, 0.78, dark ? 0.66 : 0.36, 0.90);
    var modVibHandle = hslHex(modVibHue, 0.78, dark ? 0.66 : 0.36);

    return {
      seed: cssVars['--md-seed'],
      dark: dark,
      cssVars: cssVars,
      spec: { low: specLow, mid: specMid, high: specHigh },
      roll: {
        noteStyle: 'modern', kbStyle: 'modern', nodeStyle: 'modern',
        rowBlack: 'rgba(' + hslToRgb(h, clampRange(sSurf * 0.8, 0.08, 0.22), surfContL).join(',') + ',',
        rowWhite: 'rgba(' + hslToRgb(h, sSurf, surfL).join(',') + ',',
        octaveLine: outlineVar,
        gridBar: gridBar, gridBeat: surfHighest, gridSub: surfCont, barText: onSurfVar,
        tempoLine: tertiary, tempoText: tertiary,
        noteRadius: 6, noteGloss: false,
        noteSelGrad: [hslHex(h, clampRange(s, 0.38, 0.78), dark ? 0.82 : primaryL + 0.08), primary, primary, primaryDeep],
        noteGrad: [hslHex(h, clampRange(s * (dark ? 0.65 : 0.85), dark ? 0.30 : 0.42, dark ? 0.62 : 0.86), dark ? 0.30 : 0.93), primaryCont, primaryContMid, primaryCont],
        noteSelStroke: primaryDeep, noteStroke: hslHex(h, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.52 : 0.62),
        noteSelEdge: dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.28)',
        noteEdge: dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)',
        noteSelText: onPrimary, noteText: onPrimaryCont,
        slurMark: tertiary, slurArc: primary,
        wordJoinSel: primaryCont, wordJoin: primary,
        bandFill: hslRgba(h, s, primaryL, 0.16), bandStroke: primary,
        velBg: ['rgba(' + hslToRgb(h, clampRange(sSurf * 0.85, 0.08, 0.24), surfLowL).join(',') + ',',
                'rgba(' + hslToRgb(h, clampRange(sSurf * 0.76, 0.07, 0.20), surfHighL).join(',') + ','],
        velTop: outlineVar, velHi: dark ? surfHighest : surf,
        consDash: accent,
        velBarSel: tertiary, velBarCons: accent, velBar: primary,
        velBarHi: 'rgba(255,255,255,.35)',
        kbBg: [surfCont, surfHigh], kbBlackRow: surfCont,
        kbBlackGrad: dark
          ? [hslHex(h, 0.10, 0.20), hslHex(h, 0.10, 0.14), hslHex(h, 0.10, 0.10), hslHex(h, 0.10, 0.16)]
          : [hslHex(h, 0.10, 0.30), hslHex(h, 0.10, 0.22), hslHex(h, 0.10, 0.17), hslHex(h, 0.10, 0.25)],
        kbBlackHi: 'rgba(255,255,255,.16)',
        kbBlackStroke: dark ? outlineVar : hslHex(h, 0.10, 0.14),
        kbWhiteGrad: dark ? [surfHighest, surfHigh, surfCont] : [surf, surfLow, surfCont],
        kbWhiteHi: dark ? 'rgba(255,255,255,.14)' : '#ffffff',
        kbKeyDivider: outlineVar,
        kbOctaveText: primary, kbBorder: outlineVar,
        rulerGrad: [surfLow, surfCont, surfHigh, surfCont],
        rulerTop: surf, rulerBottom: outlineVar, rulerLabel: onSurfVar,
        rulerTickBar: outline, rulerTickBeat: outlineVar, rulerBarText: onSurf, rulerTempoText: tertiary,
        btnRadius: 8,
        btnConsOn: [accentCont, accentCont, accentCont, accentCont],
        btnVelOn: [primaryCont, primaryContMid, primaryContMid, primaryCont],
        btnOff: [surf, surfCont, surfHigh, surfCont],
        btnConsStroke: accent, btnVelStroke: primary, btnOffStroke: outlineVar,
        btnTextOn: onPrimaryCont, btnTextOff: onSurfVar,
        playGlow: hslRgba(h2, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.68 : 0.42, 0.24), playLine: tertiary,
        playHead: [hslHex(h2, clampRange(s * 0.75, 0.38, 0.70), dark ? 0.80 : 0.56), tertiary, hslHex(h2, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.52 : 0.28)],
        playHeadStroke: surf,
        phoneCustom: tertiary, phoneDefault: onSurfVar,
        pitOutline: 'rgba(' + hslToRgb(h, sSurf, surfL).join(',') + ', 0.90)', pitLine: modPitLine,
        pitCtrlLine: modCtrlLine, vibLine: modVibLine,
        pitNodeFill: modCtrlLine, pitNodeStroke: surf, pitNodeHi: surf,
        vibBtnOn: [primaryCont, primaryContMid, primaryContMid],
        vibBtnOff: [surf, surfCont, surfHigh],
        vibBtnOnStroke: primary, vibBtnOffStroke: outlineVar, vibBtnText: onSurfVar, vibBtnOnText: onPrimaryCont,
        vibHandle: modVibHandle, vibRateLine: primary, vibRateDot: primary
      },
      phone: {
        pairs: [
          { ink: primaryDeep, fill: hslRgba(h, clampRange(s, 0.38, 0.78), primaryL, 0.20), selected: hslRgba(h, clampRange(s, 0.38, 0.78), primaryL, 0.38) },
          { ink: accent, fill: hslRgba(h3, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.68 : 0.34, 0.18), selected: hslRgba(h3, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.68 : 0.34, 0.36) }
        ],
        silence: { ink: onSurfVar, fill: hslRgba(h, 0.10, dark ? 0.60 : 0.48, 0.16), selected: hslRgba(h, 0.10, dark ? 0.60 : 0.48, 0.30) },
        fallback: onSurfVar,
        bg: ['rgba(' + hslToRgb(h, sSurf, surfL).join(',') + ',',
             'rgba(' + hslToRgb(h, clampRange(sSurf * 0.85, 0.08, 0.24), surfLowL).join(',') + ',',
             'rgba(' + hslToRgb(h, clampRange(sSurf * 0.80, 0.08, 0.22), surfContL).join(',') + ','],
        topLine: outlineVar, hiLine: dark ? 'rgba(255,255,255,.14)' : '#ffffff',
        capText: primaryDeep, subText: onSurfVar,
        beatBar: gridBar, beatTick: surfHigh, baseLine: outlineVar,
        labelBg: 'rgba(' + hslToRgb(h, sSurf, surfL).join(',') + ',.94)', emptyText: onSurfVar,
        rampFill: hslRgba(h, clampRange(s * 0.8, 0.4, 0.8), dark ? 0.34 : 0.82, 0.34), gripFill: surf
      },
      ui: {
        bgTop: surf, bgMid: surfLow, bgBot: surfCont,
        grid: hslRgba(h, clampRange(s, 0.35, 0.7), primaryL, 0.18), axisText: onSurfVar,
        curveGlow: hslRgba(h, clampRange(s, 0.38, 0.72), primaryL, 0.24), curveLine: primary,
        curveArea: [hslRgba(h, clampRange(s, 0.38, 0.72), primaryL, 0.30), hslRgba(h, clampRange(s * 0.8, 0.38, 0.8), dark ? 0.36 : 0.80, 0.20), hslRgba(h, clampRange(s * 0.8, 0.38, 0.8), dark ? 0.25 : 0.90, 0.04)],
        formant0: tertiary, formantRest: hslRgba(h2, clampRange(s * 0.7, 0.3, 0.6), dark ? 0.70 : 0.40, 0.64), formantText: onTertiaryCont,
        specGrid: 'rgba(255,255,255,.45)', specText: '#fffbfe', specFormant: hslRgba(h2, 0.8, 0.88, 0.92),
        harmBg: [surf, surfCont],
        harmHi: [tertiaryCont, tertiary, tertiary, onTertiaryCont],
        harmBar: [primaryCont, hslHex(h, clampRange(s * 0.78, 0.36, 0.75), dark ? 0.56 : 0.76), hslHex(h, clampRange(s, 0.38, 0.72), dark ? 0.66 : 0.54), primary],
        harmGloss: dark ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.55)', harmSheen: 'rgba(255,255,255,.16)',
        harmLabel: onSurfVar, harmMeas: onSurf, harmVal: tertiary, harmBase: outlineVar,
        eyeBg: [surf, surfCont], eyeGrid: surfHigh, eyeAxis: onSurfVar,
        eyeTick: outlineVar,
        eyeSelFill: [hslRgba(h, s, primaryL, 0.32), hslRgba(h, s, primaryL, 0.14), hslRgba(h, s, primaryL, 0.03)],
        eyeFill: [hslRgba(h, 0.14, dark ? 0.58 : 0.42, 0.24), hslRgba(h, 0.14, dark ? 0.58 : 0.42, 0.10), hslRgba(h, 0.14, dark ? 0.58 : 0.42, 0.02)],
        eyeSelGlow: hslRgba(h, 0.78, dark ? 0.42 : 0.82, 0.65), eyeGlow: hslRgba(h, 0.2, dark ? 0.35 : 0.8, 0.5),
        eyeSelStroke: primary, eyeStroke: onSurfVar,
        eyeSelHandle: primary, eyeHandle: onSurfVar, eyeEndSel: tertiary, eyeEnd: onTertiaryCont,
        eyeStepHalo: 'rgba(' + hslToRgb(h, sSurf, surfL).join(',') + ',.94)', eyeStepLine: tertiary,
        eyeMom: hslRgba(h3, clampRange(s * 0.72, 0.35, 0.68), dark ? 0.68 : 0.34, 0.66),
        eyeTitle: primary, eyeLegend: tertiary
      }
    };
  }

  function applyModernDynamicColor(seedHex, opts) {
    var dark = !!(opts && opts.dark);
    var pal = buildModernPalette(seedHex || '#6750a4', dark);
    NSG.modernPalette = pal;
    if (typeof document !== 'undefined' && document.documentElement &&
        document.documentElement.style && typeof document.documentElement.style.setProperty === 'function') {
      var vars = pal.cssVars;
      Object.keys(vars).forEach(function (k) {
        document.documentElement.style.setProperty(k, vars[k]);
      });
    }
    if (state.theme === 'modern' && (!opts || opts.draw !== false)) {
      if (roll && typeof roll.draw === 'function') roll.draw();
      if (typeof drawCurve === 'function') drawCurve();
      if (typeof drawGrid === 'function') drawGrid();
      if (typeof drawHarm === 'function') drawHarm();
    }
    return pal;
  }
  NSG.applyModernDynamicColor = applyModernDynamicColor;

  function blankScore() {
    return {
      tempo: 120, lang: 'zh', root: 62,
      tracks: [
        { id: 'v', name: '人声', type: 'vocal', notes: [] },
        { id: 'i', name: '伴奏', type: 'inst', notes: [] }
      ]
    };
  }

  var state = {
    score: blankScore(),
    activeTrackIndex: 0,
    timbre: NSG.presetTimbre('m1'),
    presetDirty: false,
    pcm: null, vox: null, voxAudio: null, acc: null, voxSr: 16000, hd: false,
    hifiWaveguide: 1, hifiHighPolish: 1,
    dirty: true, playing: false, ctx: null, src: null,
    playStart: 0, playFromBeat: 0,
    rawSrc: false, forceSnap: false, relativeMotion: false, bgId: 'a1', theme: 'aero', uiTransparency: 24, harmHi: null,
    themeSchemes: {
      '9x': 'standard',
      xp: 'classic-blue',
      cyberpunk: 'neon-dusk',
      pixel: 'synth-sunset',
      modern: 'baseline'
    },
    modernCustom: null,
    volVox: 0.56, volAcc: 0.75, muteVox: false, muteAcc: false,
    loveReverb: false, reverbReturn: null,
    accPcm: null, accAudio: null, voxPeak: 0, accPeak: 0, voxEnv: null, accEnv: null,
    gainVox: null, gainAcc: null, srcs: null,
    vowel: 'a',
    /* 谱曲 / 编曲的当前选择 */
    composeStyle: 'pop', composeFullSong: false, composeCycleMode: 'group', composeIntroBars: 4, eyeSet: null, eyeSel: 0, eyeName: '',
    arrStyle: 'pop', arrSeed: 0, arrIntro: true, arrKit: true, arrSample: false, arrSampleAmt: 1, arrImprov: 50, arrMeter: 'auto', arrGridMode: 'auto', arrSpace: 'auto', arrChip: false, arrOffset: '',
    arrHuman: 1, arrSwing: 6, arrDensity: 1, arrExpression: 1, arrChordRate: 1, arrMood: 'auto', arrKey: 'auto', arrHalfBpm: false, arrTrackScope: 'all', tm: null,
    tuneStyle: 'natural', tuneParts: { pit: true, vibrato: true, vel: true, effort: false, consonantSpeed: true },
    tuneSeed: Math.floor(Math.random() * 999999), tuneHuman: 60, tuneExpression: 100,
    title: ''
  };
  state.eyeSet = NSG.COMPOSE.EYE.preset('单眼·峰偏左');
  state.eyeName = state.eyeSet.name;

  var roll, raf = 0;

  /* ---------------- 音层管理（多轨） ---------------- */
  var LAYER_COLORS = ['#2a6ae8', '#e04f47', '#c2d800', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777'];
  var trackUndoMap = typeof WeakMap === 'function' ? new WeakMap() : null;

  function isVocalTrack(tr) { return !!(tr && tr.type === 'vocal'); }
  function isAccompTrack(tr) { return !!(tr && tr.type === 'inst'); }

  function selectedVocalTrack() {
    var tr = state.score.tracks[state.activeTrackIndex];
    return isVocalTrack(tr) ? tr : null;
  }

  function vocalTrackIndices(score) {
    var tracks = (score && score.tracks) || [];
    var out = [];
    for (var i = 0; i < tracks.length; i++) if (isVocalTrack(tracks[i])) out.push(i);
    return out;
  }

  function accompTrackIndex(score) {
    var tracks = (score && score.tracks) || [];
    for (var i = 0; i < tracks.length; i++) if (isAccompTrack(tracks[i])) return i;
    return -1;
  }

  function accompTrack(score) {
    var s = score || state.score;
    var idx = accompTrackIndex(s);
    return idx >= 0 ? s.tracks[idx] : null;
  }

  function isDscAccompTrack(tr) {
    return !!(tr && (tr.sourceFormat === 'DSC' || (tr.notes || []).some(function (n) { return !!n.dscSource; })));
  }

  /**
   * 最多只允许存在一条 NSG 伴奏轨（type: 'inst'），并保留其中最新/有效的一条。
   */
  function enforceSingleAccompTrack(score, preferLast) {
    var s = score || state.score;
    if (!s || !Array.isArray(s.tracks)) return null;
    var instIndices = [];
    for (var i = 0; i < s.tracks.length; i++) if (isAccompTrack(s.tracks[i])) instIndices.push(i);
    if (!instIndices.length) return null;
    var keep = preferLast ? instIndices[instIndices.length - 1] : instIndices[0];
    if (!preferLast) {
      for (var k = instIndices.length - 1; k >= 0; k--) {
        if (s.tracks[instIndices[k]].notes && s.tracks[instIndices[k]].notes.length) { keep = instIndices[k]; break; }
      }
    }
    var keptTrack = s.tracks[keep];
    var activeTrack = s.tracks[state.activeTrackIndex];
    s.tracks = s.tracks.filter(function (tr, idx) { return !isAccompTrack(tr) || idx === keep; });
    if (activeTrack && isVocalTrack(activeTrack)) {
      var ni = s.tracks.indexOf(activeTrack);
      if (ni >= 0) state.activeTrackIndex = ni;
    }
    return keptTrack;
  }

  function ensureAccompTrack(score) {
    var s = score || state.score;
    if (!s) return null;
    if (!Array.isArray(s.tracks)) s.tracks = [];
    var existing = enforceSingleAccompTrack(s, false);
    if (existing) return existing;
    var created = { id: 'i', name: '伴奏', type: 'inst', notes: [] };
    s.tracks.push(created);
    return created;
  }

  function activeVocalTrackIndex() {
    var s = state.score;
    if (!s || !Array.isArray(s.tracks)) return 0;
    if (!s.tracks.some(isVocalTrack)) s.tracks.unshift({ id: 'v', name: '人声', type: 'vocal', notes: [] });
    var cur = s.tracks[state.activeTrackIndex];
    if (isVocalTrack(cur)) return state.activeTrackIndex;
    var vIdx = vocalTrackIndices(s)[0];
    state.activeTrackIndex = vIdx;
    return vIdx;
  }

  function activeVocalTrack() {
    var s = state.score;
    return s && s.tracks ? s.tracks[activeVocalTrackIndex()] : null;
  }

  function trackColor(tr, vocalOrder) {
    return (tr && tr.color) || LAYER_COLORS[(vocalOrder || 0) % LAYER_COLORS.length];
  }

  function trackTimbre(tr) {
    return (tr && tr.timbre) || state.timbre;
  }

  function trackLang(tr) {
    return (tr && tr.lang) || (state.score && state.score.lang) || 'zh';
  }

  function trackPhonemizer(tr) {
    return tr && tr.phonemizer !== undefined ? tr.phonemizer : (state.score && state.score.phonemizer);
  }

  function trackEffectiveLang(tr) {
    return trackPhonemizer(tr) || trackLang(tr) || 'zh';
  }

  var TRACK_VOL_MAX = 4;
  var TRACK_VOL_DB_MIN = -24;
  var TRACK_VOL_DB_MAX = 12;
  var TRACK_VOL_SLIDER_MIN = -24.1; // leftmost stop = -∞ (vol = 0); -24.0..+12.0 = 0.1 dB steps

  function trackVol(tr) {
    return tr && typeof tr.vol === 'number' && isFinite(tr.vol) ? Math.max(0, Math.min(TRACK_VOL_MAX, tr.vol)) : 1;
  }

  function roundTrackVol(v) {
    return v < 0.2 ? Math.round(v * 10000) / 10000 : Math.round(v * 1000) / 1000;
  }

  function trackVolDb(vol) {
    var v = typeof vol === 'number' && isFinite(vol) ? Math.max(0, Math.min(TRACK_VOL_MAX, vol)) : 1;
    if (v <= 1e-4) return -Infinity;
    return 20 * Math.log10(v);
  }

  function trackVolFromSliderDb(db) {
    if (!isFinite(db) || db <= TRACK_VOL_SLIDER_MIN + 1e-6) return 0;
    var clamped = Math.max(TRACK_VOL_DB_MIN, Math.min(TRACK_VOL_DB_MAX, db));
    if (Math.abs(clamped) < 0.05) return 1;
    return roundTrackVol(Math.pow(10, clamped / 20));
  }

  function trackVolToSliderDb(vol) {
    var db = trackVolDb(vol);
    if (!isFinite(db)) return TRACK_VOL_SLIDER_MIN;
    var rounded = Math.round(db * 10) / 10;
    if (Math.abs(rounded) < 0.05) return 0;
    return Math.max(TRACK_VOL_DB_MIN, Math.min(TRACK_VOL_DB_MAX, rounded));
  }

  function formatLayerVol(vol) {
    var db = trackVolDb(vol);
    if (!isFinite(db)) return '-∞';
    var rounded = Math.round(db * 10) / 10;
    if (Math.abs(rounded) < 0.05) return '0.0dB';
    return (rounded > 0 ? '+' : '') + rounded.toFixed(1) + 'dB';
  }

  function trackPan(tr) {
    return tr && typeof tr.pan === 'number' && isFinite(tr.pan) ? Math.max(-1, Math.min(1, tr.pan)) : 0;
  }

  var LANG_SHORT_CODES = {
    'zh-x-sichuan': 'SC',
    'nan-x-teochew': 'TEO'
  };

  function langShortCode(code) {
    if (NSG && typeof NSG.langShortCode === 'function') return NSG.langShortCode(code);
    var s = String(code || 'zh').trim();
    if (!s) return 'ZH';
    var lower = s.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LANG_SHORT_CODES, lower)) {
      return LANG_SHORT_CODES[lower];
    }
    var xm = /-x-([a-z0-9]+)/i.exec(s);
    if (xm && xm[1]) return xm[1].toUpperCase().slice(0, 5);
    return s.toUpperCase().slice(0, 5);
  }

  function formatLayerPan(pan) {
    var pct = Math.round(trackPan({ pan: pan }) * 100);
    if (!pct) return 'C';
    return (pct < 0 ? 'L' : 'R') + Math.abs(pct);
  }

  function syncActiveTrackToUI() {
    var tr = activeVocalTrack();
    if (!tr) return;
    if (tr.timbre) state.timbre = tr.timbre;
    else if (vocalTrackIndices(state.score).length > 1) tr.timbre = state.timbre;
    state.presetDirty = !!tr.presetDirty;
    var tLang = trackLang(tr);
    var tPh = tr.phonemizer;
    if (state.score) {
      state.score.lang = tLang;
      if (tPh !== undefined) state.score.phonemizer = tPh;
      else delete state.score.phonemizer;
    }
    var effLang = tPh || tLang;
    var langSel = $('#langSel');
    if (langSel) langSel.value = effLang;
    if (roll) {
      roll.lang = tLang;
      roll.phonemizer = tPh;
      roll.timbre = state.timbre;
    }
    if (typeof applyTimbreToUI === 'function') applyTimbreToUI();
  }

  function isTrackVisible(tr) { return tr ? tr.visible !== false : true; }

  function isTrackMuted(tr) {
    if (!tr) return false;
    if (isAccompTrack(tr)) return !!state.muteAcc;
    return !!tr.muted;
  }

  function hasPlayableVocalNotes(score) {
    var tracks = ((score || state.score) && (score || state.score).tracks) || [];
    return tracks.some(function (t) { return isVocalTrack(t) && !t.muted && t.notes && t.notes.length; });
  }

  function firstArrangeVocalIndex(score) {
    var s = score || state.score;
    var activeIdx = activeVocalTrackIndex();
    var active = s && s.tracks && s.tracks[activeIdx];
    if (active && !active.muted && active.notes && active.notes.length) return activeIdx;
    var indices = vocalTrackIndices(s);
    for (var i = 0; i < indices.length; i++) {
      var tr = s.tracks[indices[i]];
      if (!tr.muted && tr.notes && tr.notes.length) return indices[i];
    }
    for (var j = 0; j < indices.length; j++) {
      if (s.tracks[indices[j]].notes && s.tracks[indices[j]].notes.length) return indices[j];
    }
    return activeIdx;
  }

  function resolveArrangeTrackOpt(scope, score) {
    var s = score || state.score;
    if (!scope || scope === 'all') return {};
    if (scope === 'active') return { trackIndex: activeVocalTrackIndex() };
    var m = /^track:(\d+)$/.exec(String(scope));
    if (m) {
      var idx = parseInt(m[1], 10);
      var tr = s && s.tracks && s.tracks[idx];
      if (isVocalTrack(tr) && tr.notes && tr.notes.length) return { trackIndex: idx };
    }
    return {};
  }

  function saveActiveRollUndo() {
    if (!trackUndoMap || !roll) return;
    var tr = activeVocalTrack();
    if (!tr || typeof tr !== 'object') return;
    trackUndoMap.set(tr, {
      undo: Array.isArray(roll.undoStack) ? roll.undoStack.slice() : [],
      redo: Array.isArray(roll.redoStack) ? roll.redoStack.slice() : []
    });
  }

  function syncRollTracks(opts) {
    opts = opts || {};
    var idx = activeVocalTrackIndex();
    var tracks = (state.score && state.score.tracks) || [];
    var active = tracks[idx];
    var ghosts = [];
    var vOrder = 0;
    for (var i = 0; i < tracks.length; i++) {
      var tr = tracks[i];
      if (!isVocalTrack(tr)) continue;
      if (i !== idx && isTrackVisible(tr)) {
        ghosts.push({
          name: tr.name || ('人声 ' + (vOrder + 1)),
          color: trackColor(tr, vOrder),
          notes: tr.notes || []
        });
      }
      vOrder++;
    }
    if (roll) {
      if (typeof roll.setGhostTracks === 'function') roll.setGhostTracks(ghosts);
      if (typeof roll.setActiveTrackVisible === 'function') roll.setActiveTrackVisible(isTrackVisible(active));
      if (!opts.ghostOnly && !opts.skipSetNotes && active && typeof roll.setNotes === 'function') {
        var stacks = trackUndoMap ? trackUndoMap.get(active) : null;
        roll.setNotes(active.notes, {
          pit: active.pit || [],
          preserveView: !!opts.preserveView,
          undoStack: stacks ? stacks.undo : [],
          redoStack: stacks ? stacks.redo : [],
          preserveClip: true
        });
      } else if (opts.ghostOnly && typeof roll.draw === 'function') {
        roll.draw();
      }
    }
    renderLayerList();
  }

  function layerLyricPreview(notes) {
    if (!notes || !notes.length) return t('layer.emptyPreview', null, '空音层 · 点击进入编辑');
    var words = [];
    for (var i = 0; i < notes.length && words.join('').length < 18; i++) {
      var lyr = notes[i].lyric;
      if (lyr && !/^(?:-|‿|=|\+|\+~|\+\*|SP|br[1-5]?|AP)$/i.test(lyr)) words.push(lyr);
    }
    var txt = words.join(' ').trim();
    return t('layer.noteCount', { n: notes.length }, notes.length + ' 音符') + (txt ? ' · ' + txt.slice(0, 20) : '');
  }

  function SVG_EYE_OPEN() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/></svg>';
  }
  function SVG_EYE_CLOSED() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8s2.3-3.6 6-3.6c1 0 1.9.3 2.7.7M14 8s-2.3 3.6-6 3.6c-1 0-1.9-.3-2.7-.7M2.5 2.5l11 11"/></svg>';
  }
  function SVG_SPK_ON() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2h2.6L8.5 3.3v9.4L5.1 9.8H2.5z" fill="currentColor" stroke="none"/><path d="M10.8 5.6a3.5 3.5 0 0 1 0 4.8M12.6 3.8a6 6 0 0 1 0 8.4"/></svg>';
  }
  function SVG_SPK_OFF() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2h2.6L8.5 3.3v9.4L5.1 9.8H2.5z" fill="currentColor" stroke="none"/><path d="M10.8 5.8l3.4 4.4M14.2 5.8l-3.4 4.4"/></svg>';
  }
  function SVG_TRASH() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.2h10M6 2.5h4M5 4.2v8.8h6V4.2M6.8 6.5v4.3M9.2 6.5v4.3"/></svg>';
  }
  function SVG_NSG_LOGO() {
    return '<svg class="orb-svg" viewBox="0 0 32 32" focusable="false" aria-hidden="true">'
      + '<defs>'
      + '<radialGradient id="nsgLayerSphere" cx="34%" cy="24%" r="76%"><stop offset="0%" stop-color="#ffffff"/><stop offset="18%" stop-color="#ccf6ff"/><stop offset="48%" stop-color="#2bbdf0"/><stop offset="78%" stop-color="#0b68a3"/><stop offset="100%" stop-color="#053252"/></radialGradient>'
      + '<radialGradient id="nsgLayerAurora" cx="70%" cy="82%" r="55%"><stop offset="0%" stop-color="#76ffbc" stop-opacity="0.85"/><stop offset="100%" stop-color="#1180b8" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="nsgLayerGloss" x1="35%" y1="0%" x2="55%" y2="100%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>'
      + '</defs>'
      + '<circle cx="16" cy="16" r="14.6" fill="url(#nsgLayerSphere)" stroke="#ffffff" stroke-opacity="0.92" stroke-width="1.3"/>'
      + '<circle cx="16" cy="16" r="14" fill="url(#nsgLayerAurora)"/>'
      + '<ellipse cx="16" cy="16" rx="12.2" ry="4.8" transform="rotate(-22 16 16)" fill="none" stroke="#7affce" stroke-opacity="0.65" stroke-width="1.1"/>'
      + '<path d="M 4.5 17 L 7.2 17 L 9 22.2 L 11 8.5 L 20.8 22.8 L 22.8 8.8 L 24.6 15.5 L 27.5 15.5" fill="none" stroke="#042b47" stroke-opacity="0.65" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M 4.5 17 L 7.2 17 L 9 22.2 L 11 8.5 L 20.8 22.8 L 22.8 8.8 L 24.6 15.5 L 27.5 15.5" fill="none" stroke="#b5f8ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="M 9 22.2 L 11 8.5 L 20.8 22.8 L 22.8 8.8" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<ellipse cx="12.5" cy="7.5" rx="8.2" ry="4.3" transform="rotate(-18 12.5 7.5)" fill="url(#nsgLayerGloss)"/>'
      + '</svg>';
  }

  function renderLayerList() {
    var listEl = $('#layerList');
    if (!listEl || typeof document.createElement !== 'function' || typeof listEl.appendChild !== 'function') return;
    var s = state.score;
    var tracks = (s && s.tracks) || [];
    var vIndices = vocalTrackIndices(s);
    var instIdx = accompTrackIndex(s);
    var instTr = instIdx >= 0 ? tracks[instIdx] : null;
    var hasInst = !!(instTr && instTr.notes && instTr.notes.length);
    var countEl = $('#layerCount');
    if (countEl) countEl.textContent = t('layer.count', {
      n: vIndices.length,
      plural: vIndices.length === 1 ? '' : 's',
      acc: hasInst ? t('layer.countAccSuffix', null, ' + 伴奏') : ''
    }, vIndices.length + ' 人声' + (hasInst ? ' + 伴奏' : ''));
    var activeIdx = activeVocalTrackIndex();

    listEl.innerHTML = '';
    vIndices.forEach(function (trackIdx, vOrder) {
      var tr = tracks[trackIdx];
      var color = trackColor(tr, vOrder);
      var visible = isTrackVisible(tr);
      var muted = isTrackMuted(tr);
      var active = trackIdx === activeIdx;
      var card = document.createElement('div');
      card.className = 'layer-item' + (active ? ' active' : '') + (muted ? ' muted' : '') + (!visible ? ' hidden-layer' : '');
      card.dataset.trackIndex = String(trackIdx);

      var swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'layer-swatch';
      swatch.style.background = color;
      swatch.title = t('layer.swatchTitle', null, '切换音层颜色');
      swatch.setAttribute('aria-label', t('layer.swatchTitle', null, '切换音层颜色'));
      swatch.onclick = function (e) { e.stopPropagation(); cycleTrackColor(trackIdx); };

      var body = document.createElement('div');
      body.className = 'layer-main';

      var head = document.createElement('div');
      head.className = 'layer-head';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      var dispName = tr.name === '人声' ? t('layer.defaultSingle', null, '人声')
        : (/^人声 (\d+)$/.test(tr.name || '') ? t('layer.defaultName', { n: RegExp.$1 }, tr.name)
        : (tr.name || t('layer.defaultName', { n: vOrder + 1 }, '人声 ' + (vOrder + 1))));
      nameSpan.textContent = dispName;
      head.appendChild(nameSpan);

      var tTimbre = trackTimbre(tr);
      var timbreTag = document.createElement('span');
      timbreTag.className = 'layer-timbre';
      var timbreLabel = tTimbre ? (tTimbre.preset ? tPresetName(tTimbre) : tTimbre.name) : '';
      timbreTag.textContent = timbreLabel || t('layer.timbreFallback', null, '音色');
      timbreTag.title = t('layer.timbreTitle', { name: timbreTag.textContent }, '音层音色：' + timbreTag.textContent);
      head.appendChild(timbreTag);

      if (active) {
        var curBadge = document.createElement('span');
        curBadge.className = 'layer-badge';
        curBadge.textContent = t('layer.activeBadge', null, '当前');
        head.appendChild(curBadge);
      }

      var info = document.createElement('div');
      info.className = 'layer-info';
      info.textContent = layerLyricPreview(tr.notes);

      var actions = document.createElement('div');
      actions.className = 'layer-actions';

      var eyeBtn = document.createElement('button');
      eyeBtn.type = 'button';
      eyeBtn.className = 'layer-btn layer-eye' + (visible ? ' on' : '');
      eyeBtn.title = visible ? t('layer.hideTitle', null, '隐藏卷帘音层') : t('layer.showTitle', null, '显示卷帘音层');
      eyeBtn.setAttribute('aria-pressed', String(visible));
      eyeBtn.innerHTML = visible ? SVG_EYE_OPEN() : SVG_EYE_CLOSED();
      eyeBtn.onclick = function (e) { e.stopPropagation(); toggleTrackVisible(trackIdx); };

      var muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'layer-btn layer-mute' + (!muted ? ' on' : '');
      muteBtn.title = muted ? t('layer.unmuteTitle', null, '取消静音') : t('layer.muteTitle', null, '静音此音层');
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.innerHTML = muted ? SVG_SPK_OFF() : SVG_SPK_ON();
      muteBtn.onclick = function (e) { e.stopPropagation(); toggleTrackMuted(trackIdx); };

      var renBtn = document.createElement('button');
      renBtn.type = 'button';
      renBtn.className = 'layer-btn layer-rename';
      renBtn.title = t('layer.renameTitle', null, '重命名音层');
      renBtn.innerHTML = '<span class="layer-tt">TT</span>';
      renBtn.onclick = function (e) { e.stopPropagation(); renameTrack(trackIdx); };

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'layer-btn layer-del';
      delBtn.title = vIndices.length <= 1 ? t('layer.keepOneAlert', null, '至少保留一条人声音层') : t('layer.deleteTitle', null, '删除此音层');
      delBtn.disabled = vIndices.length <= 1;
      delBtn.innerHTML = SVG_TRASH();
      delBtn.onclick = function (e) { e.stopPropagation(); deleteTrack(trackIdx); };

      actions.appendChild(eyeBtn);
      actions.appendChild(muteBtn);
      var sep = document.createElement('span');
      sep.className = 'layer-sep';
      actions.appendChild(sep);
      actions.appendChild(renBtn);
      actions.appendChild(delBtn);

      var mixBox = document.createElement('div');
      mixBox.className = 'layer-mix';
      mixBox.onclick = function (e) { e.stopPropagation(); };
      mixBox.onmousedown = function (e) { e.stopPropagation(); };

      var curVol = trackVol(tr);
      var volRow = document.createElement('label');
      volRow.className = 'layer-mix-row';
      volRow.title = t('layer.volTitle', null, '音层人声音量（-∞ / -24 ~ +12 dB，双击复位 0.0 dB）');
      var volTag = document.createElement('span');
      volTag.className = 'layer-mix-k';
      volTag.textContent = t('layer.volTag', null, '量');
      var volInput = document.createElement('input');
      volInput.type = 'range';
      volInput.className = 'layer-vol';
      volInput.min = String(TRACK_VOL_SLIDER_MIN);
      volInput.max = String(TRACK_VOL_DB_MAX);
      volInput.step = '0.1';
      volInput.value = String(trackVolToSliderDb(curVol));
      volInput.setAttribute('aria-label', t('layer.volAria', { name: dispName }, (tr.name || '人声') + ' 音量'));
      var volVal = document.createElement('span');
      volVal.className = 'layer-mix-v';
      volVal.textContent = formatLayerVol(curVol);
      volInput.oninput = function () {
        var rawDb = parseFloat(this.value);
        var v = trackVolFromSliderDb(isFinite(rawDb) ? rawDb : 0);
        tr.vol = v;
        volVal.textContent = formatLayerVol(v);
        state.dirty = true;
        renderAndAnalyze(40);
      };
      volInput.ondblclick = function (e) {
        e.stopPropagation();
        tr.vol = 1;
        this.value = '0';
        volVal.textContent = formatLayerVol(1);
        state.dirty = true;
        renderAndAnalyze(40);
        setStatus(t('ui.layerVolReset', { name: dispName }, '「' + (tr.name || '人声') + '」音量已复位 0.0 dB'));
      };
      volRow.appendChild(volTag);
      volRow.appendChild(volInput);
      volRow.appendChild(volVal);

      var curPanPct = Math.round(trackPan(tr) * 100);
      var panRow = document.createElement('label');
      panRow.className = 'layer-mix-row';
      panRow.title = t('layer.panTitle', null, '音层声像 Pan（双击居中 C）');
      var panTag = document.createElement('span');
      panTag.className = 'layer-mix-k';
      panTag.textContent = t('layer.panTag', null, '像');
      var panInput = document.createElement('input');
      panInput.type = 'range';
      panInput.className = 'layer-pan';
      panInput.min = '-100';
      panInput.max = '100';
      panInput.step = '1';
      panInput.value = String(curPanPct);
      panInput.setAttribute('aria-label', t('layer.panAria', { name: dispName }, (tr.name || '人声') + ' 声像'));
      var panVal = document.createElement('span');
      panVal.className = 'layer-mix-v';
      panVal.textContent = formatLayerPan(tr.pan);
      panInput.oninput = function () {
        var p = Math.max(-100, Math.min(100, +this.value || 0)) / 100;
        tr.pan = Math.round(p * 1000) / 1000;
        panVal.textContent = formatLayerPan(tr.pan);
        state.dirty = true;
        renderAndAnalyze(40);
      };
      panInput.ondblclick = function (e) {
        e.stopPropagation();
        tr.pan = 0;
        this.value = '0';
        panVal.textContent = 'C';
        state.dirty = true;
        renderAndAnalyze(40);
        setStatus(t('ui.layerPanReset', { name: dispName }, '「' + (tr.name || '人声') + '」声像已居中'));
      };
      panRow.appendChild(panTag);
      panRow.appendChild(panInput);
      panRow.appendChild(panVal);

      mixBox.appendChild(volRow);
      mixBox.appendChild(panRow);
      actions.appendChild(mixBox);

      var effLang = trackEffectiveLang(tr);
      var shortCode = langShortCode(effLang);
      var langBadge = document.createElement('span');
      langBadge.className = 'layer-lang' + (shortCode.length >= 5 ? ' layer-lang-5' : shortCode.length === 4 ? ' layer-lang-4' : '');
      langBadge.textContent = shortCode;
      langBadge.title = t('layer.phonemizerTitle', { name: tLangName(effLang) }, '音层音素器：' + ((NSG.langName && NSG.langName[effLang]) || effLang));

      body.appendChild(head);
      body.appendChild(info);
      body.appendChild(actions);
      card.appendChild(swatch);
      card.appendChild(body);
      card.appendChild(langBadge);
      card.onclick = function () { selectVocalLayer(trackIdx); };
      listEl.appendChild(card);
    });

    if (hasInst) {
      var instMuted = !!state.muteAcc;
      var isDscAcc = isDscAccompTrack(instTr);
      var scard = document.createElement('div');
      scard.className = 'layer-item layer-special' + (instMuted ? ' muted' : '');
      scard.dataset.trackIndex = String(instIdx);

      var sSwatch = document.createElement('span');
      sSwatch.className = 'layer-swatch special';
      sSwatch.innerHTML = SVG_NSG_LOGO();
      sSwatch.title = isDscAcc ? t('layer.dscAccompSwatchTitle', null, 'DSC伴奏轨（唯一）') : t('layer.accompSwatchTitle', null, 'NSG 伴奏轨（唯一）');

      var sBody = document.createElement('div');
      sBody.className = 'layer-main';

      var sHead = document.createElement('div');
      sHead.className = 'layer-head';
      var sName = document.createElement('span');
      sName.className = 'layer-name';
      sName.textContent = (!instTr.name || instTr.name === '伴奏') ? t('layer.accompName', null, '伴奏') : instTr.name;
      var sBadge = document.createElement('span');
      sBadge.className = 'layer-badge special';
      sBadge.textContent = isDscAcc ? t('layer.dscAccompBadge', null, 'DSC伴奏轨') : t('layer.accompBadge', null, 'NSG 伴奏轨');
      sHead.appendChild(sName);
      sHead.appendChild(sBadge);

      var sInfo = document.createElement('div');
      sInfo.className = 'layer-info';
      sInfo.textContent = t('layer.noteCount', { n: instTr.notes.length }, instTr.notes.length + ' 音符');

      var sActions = document.createElement('div');
      sActions.className = 'layer-actions';

      var sMute = document.createElement('button');
      sMute.type = 'button';
      sMute.className = 'layer-btn layer-mute' + (!instMuted ? ' on' : '');
      sMute.title = instMuted ? t('layer.accompUnmuteTitle', null, '取消伴奏静音') : t('layer.accompMuteTitle', null, '静音伴奏轨');
      sMute.setAttribute('aria-pressed', String(instMuted));
      sMute.innerHTML = instMuted ? SVG_SPK_OFF() : SVG_SPK_ON();
      sMute.onclick = function (e) { e.stopPropagation(); toggleTrackMuted(instIdx); };

      var sDel = document.createElement('button');
      sDel.type = 'button';
      sDel.className = 'layer-btn layer-del';
      sDel.title = t('layer.accompDelTitle', null, '删除伴奏轨');
      sDel.innerHTML = SVG_TRASH();
      sDel.onclick = function (e) { e.stopPropagation(); deleteTrack(instIdx); };

      sActions.appendChild(sMute);
      sActions.appendChild(sDel);
      sBody.appendChild(sHead);
      sBody.appendChild(sInfo);
      sBody.appendChild(sActions);
      scard.appendChild(sSwatch);
      scard.appendChild(sBody);
      scard.onclick = function () { setStatus(t('layer.accompClickStatus', null, '伴奏轨为特殊轨道，可在工具栏「自动伴奏 / 伴奏乐器」中调整，或点删除移除')); };
      listEl.appendChild(scard);
    }
  }

  function selectVocalLayer(index) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!isVocalTrack(tr)) return;
    if (index === activeVocalTrackIndex()) return;
    saveActiveRollUndo();
    state.activeTrackIndex = index;
    state.harmHi = null;
    syncActiveTrackToUI();
    syncRollTracks({ preserveView: true });
    updateStat();
    syncInspector();
    drawHarm();
    setStatus(t('ui.layerSelected', { name: tr.name || t('layer.defaultSingle', null, '人声') }, '当前编辑音层：「' + (tr.name || '人声') + '」'));
  }

  function addVocalLayer(name, notes) {
    if (!state.score || !Array.isArray(state.score.tracks)) return -1;
    saveActiveRollUndo();
    var cur = activeVocalTrack();
    var vIndices = vocalTrackIndices(state.score);
    var vCount = vIndices.length;
    var color = LAYER_COLORS[vCount % LAYER_COLORS.length];
    var cur = activeVocalTrack();
    if (cur) {
      if (!cur.timbre) cur.timbre = NSG.cloneTimbre(trackTimbre(cur));
      if (!cur.lang) cur.lang = trackLang(cur);
    }
    var tr = {
      id: 'v' + uid(),
      name: name || ('人声 ' + (vCount + 1)),
      type: 'vocal',
      color: color,
      visible: true,
      muted: false,
      vol: 1,
      pan: 0,
      lang: trackLang(cur),
      phonemizer: trackPhonemizer(cur),
      timbre: NSG.cloneTimbre(trackTimbre(cur)),
      presetDirty: !!(cur && cur.presetDirty),
      notes: notes ? normNotes(notes) : []
    };
    var instIdx = accompTrackIndex(state.score);
    var insertAt = instIdx >= 0 ? instIdx : state.score.tracks.length;
    state.score.tracks.splice(insertAt, 0, tr);
    state.activeTrackIndex = insertAt;
    state.harmHi = null;
    syncActiveTrackToUI();
    syncRollTracks({ preserveView: true });
    updateStat();
    syncInspector();
    state.dirty = true;
    setStatus(t('ui.layerAdded', { name: tr.name }, '已新建音层「' + tr.name + '」'));
    return insertAt;
  }

  function toggleTrackVisible(index) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!isVocalTrack(tr)) return;
    tr.visible = !isTrackVisible(tr);
    syncRollTracks({ ghostOnly: true });
    setStatus((tr.name || t('layer.defaultSingle', null, '音层')) + t(tr.visible ? 'ui.layerShown' : 'ui.layerHidden', null, tr.visible ? ' 已显示' : ' 已隐藏'));
  }

  function toggleTrackMuted(index) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!tr) return;
    if (isAccompTrack(tr)) {
      state.muteAcc = !state.muteAcc;
      if (!state.muteAcc) startAccLive();
      applyLive();
      updateMix();
      setStatus(state.muteAcc ? t('ui.accMuted', null, '伴奏已静音') : t('ui.accUnmuted', { pct: Math.round(state.volAcc * 100) }, '伴奏已恢复 · ' + Math.round(state.volAcc * 100) + '%'));
      return;
    }
    tr.muted = !tr.muted;
    state.dirty = true;
    renderLayerList();
    renderAndAnalyze(80);
    setStatus((tr.name || t('layer.defaultSingle', null, '音层')) + t(tr.muted ? 'ui.layerMuted' : 'ui.layerUnmuted', null, tr.muted ? ' 已静音' : ' 已恢复发声'));
  }

  function renameTrack(index, newName) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!isVocalTrack(tr)) return;
    if (typeof newName === 'string') {
      var trimmed = newName.trim();
      if (!trimmed) return;
      tr.name = trimmed;
      renderLayerList();
      setStatus(t('ui.layerRenamed', { name: trimmed }, '音层已重命名为「' + trimmed + '」'));
      return;
    }
    askText(t('ui.layerRenameTitle', null, '重命名音层'), t('ui.layerRenameLabel', null, '输入新的音层名称：'), tr.name || '', function (val) {
      var trimmed = String(val || '').trim();
      if (!trimmed) return;
      tr.name = trimmed;
      renderLayerList();
      setStatus(t('ui.layerRenamed', { name: trimmed }, '音层已重命名为「' + trimmed + '」'));
    });
  }

  function cycleTrackColor(index) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!isVocalTrack(tr)) return;
    var vOrder = vocalTrackIndices(state.score).indexOf(index);
    var cur = trackColor(tr, Math.max(0, vOrder));
    var ci = LAYER_COLORS.indexOf(cur);
    tr.color = LAYER_COLORS[(ci + 1) % LAYER_COLORS.length];
    syncRollTracks({ ghostOnly: true });
    setStatus(t('ui.layerColorChanged', { name: tr.name || t('layer.defaultSingle', null, '音层') }, '已切换「' + (tr.name || '音层') + '」的颜色'));
  }

  function deleteTrack(index) {
    var tracks = (state.score && state.score.tracks) || [];
    var tr = tracks[index];
    if (!tr) return false;
    if (isAccompTrack(tr)) {
      tracks.splice(index, 1);
      if (state.activeTrackIndex > index) state.activeTrackIndex--;
      state.accPcm = null; state.accAudio = null; state.accKey = null;
      state.accPeak = 0; state.accEnv = null;
      if (state.gainAcc) { try { state.gainAcc.disconnect(); } catch (e) {} state.gainAcc = null; }
      updateMix();
      renderLayerList();
      updateStat();
      setStatus(isDscAccompTrack(tr) ? t('ui.layerDscAccompDeleted', null, '已删除 DSC伴奏轨') : t('ui.layerAccompDeleted', null, '已删除 NSG 伴奏轨'));
      return true;
    }
    var vIndices = vocalTrackIndices(state.score);
    if (vIndices.length <= 1) {
      alert(t('layer.keepOneAlert', null, '至少保留一条人声音层'));
      return false;
    }
    var wasActive = index === activeVocalTrackIndex();
    var removedName = tr.name || t('layer.defaultSingle', null, '音层');
    if (trackUndoMap && typeof tr === 'object') trackUndoMap.delete(tr);
    tracks.splice(index, 1);
    if (wasActive) {
      var remaining = vocalTrackIndices(state.score);
      state.activeTrackIndex = remaining[0] || 0;
      state.harmHi = null;
      syncActiveTrackToUI();
    } else if (state.activeTrackIndex > index) {
      state.activeTrackIndex--;
    }
    syncRollTracks({ preserveView: true });
    updateStat();
    syncInspector();
    state.dirty = true;
    renderAndAnalyze(80);
    setStatus(t('ui.layerDeleted', { name: removedName }, '已删除音层「' + removedName + '」'));
    return true;
  }

  function setAllVocalMuted(muted) {
    var tracks = (state.score && state.score.tracks) || [];
    var changed = false;
    tracks.forEach(function (tr) {
      if (isVocalTrack(tr) && !!tr.muted !== !!muted) { tr.muted = !!muted; changed = true; }
    });
    if (changed) { state.dirty = true; renderAndAnalyze(80); }
    renderLayerList();
    setStatus(t(muted ? 'ui.layerAllMuted' : 'ui.layerAllUnmuted', null, muted ? '已静音全部人声音层' : '已取消全部人声音层静音'));
  }

  function setAllVocalVisible(visible) {
    var tracks = (state.score && state.score.tracks) || [];
    tracks.forEach(function (tr) { if (isVocalTrack(tr)) tr.visible = !!visible; });
    syncRollTracks({ ghostOnly: true });
    setStatus(t(visible ? 'ui.layerAllShown' : 'ui.layerAllHidden', null, visible ? '已显示全部人声音层' : '已隐藏全部人声音层'));
  }

  function bindLayerControls() {
    var addBtn = $('#layerAdd');
    if (addBtn && addBtn.addEventListener) addBtn.addEventListener('click', function () { addVocalLayer(); });
    var impBtn = $('#layerImport');
    if (impBtn && impBtn.addEventListener) impBtn.addEventListener('click', function () { pickLayerFile(); });
    var unmuteAllBtn = $('#layerUnmuteAll');
    if (unmuteAllBtn && unmuteAllBtn.addEventListener) unmuteAllBtn.addEventListener('click', function () { setAllVocalMuted(false); });
    var muteAllBtn = $('#layerMuteAll');
    if (muteAllBtn && muteAllBtn.addEventListener) muteAllBtn.addEventListener('click', function () { setAllVocalMuted(true); });
    var showAllBtn = $('#layerShowAll');
    if (showAllBtn && showAllBtn.addEventListener) showAllBtn.addEventListener('click', function () { setAllVocalVisible(true); });
    var hideAllBtn = $('#layerHideAll');
    if (hideAllBtn && hideAllBtn.addEventListener) hideAllBtn.addEventListener('click', function () { setAllVocalVisible(false); });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    makeBubbles();
    var steps = [
      { t: t('boot.step1', null, '正在加载资源库'), p: 12 },
      { t: t('boot.step2', null, '正在校准共振腔'), p: 30 },
      { t: t('boot.step3', null, '正在装载音色参数块'), p: 48 },
      { t: t('boot.step4', null, '正在准备多语种发音规则'), p: 66 },
      { t: t('boot.step5', null, '正在初始化声带脉冲表'), p: 84 },
      { t: t('boot.step6', null, '正在绘制频率网格'), p: 96 }
    ];
    var i = 0;
    var langs = NSG.collectScoreLanguages(NSG.DEMO_PROJECT.score, undefined, true);
    var loaded = 0, failed = [];
    langs.forEach(function (L) {
      NSG.loadDict(L).then(function () { loaded++; }, function () { failed.push(L); });
    });
    // 只等待示例使用的词典；其他语言在选用或导入时加载。
    var tick = setInterval(function () {
      var s = steps[Math.min(i, steps.length - 1)];
      if (i === 3) {
        if (failed.length) {
          clearInterval(tick);
          $('#progText').textContent = t('boot.dictFailed', { list: failed.join('、') }, '字典加载失败：' + failed.join('、') + '，请刷新重试');
          return;
        }
        if (loaded < langs.length) {
          $('#progText').textContent = t('boot.dictLoading', { loaded: loaded, total: langs.length }, '正在解析字典 ' + loaded + '/' + langs.length); return;
        }
      }
      $('#progText').textContent = s.t;
      $('#progFill').style.width = s.p + '%';
      i++;
      if (i > steps.length) {
        clearInterval(tick);
        $('#progFill').style.width = '100%';
        setTimeout(startApp, 160);
      }
    }, 110);
  }

  function makeBubbles() {
    var box = $('#bubbles');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    /* 三层景深水晶气泡：远景柔焦光斑泡 + 中景虹彩水泡 + 近景露珠微光泡 */
    var tiers = [
      { count: 5, cls: 'bub bokeh', minSz: 72, maxSz: 132, minDur: 20, maxDur: 32, drift: 26 },
      { count: 13, cls: 'bub', minSz: 14, maxSz: 52, minDur: 10, maxDur: 21, drift: 18 },
      { count: 6, cls: 'bub sparkle', minSz: 6, maxSz: 13, minDur: 8, maxDur: 15, drift: 12 }
    ];
    for (var ti = 0; ti < tiers.length; ti++) {
      var tier = tiers[ti];
      for (var i = 0; i < tier.count; i++) {
        var d = document.createElement('div');
        var sz = tier.minSz + Math.random() * (tier.maxSz - tier.minSz);
        var drift = ((Math.random() < 0.5 ? -1 : 1) * (tier.drift * 0.45 + Math.random() * tier.drift * 0.55)).toFixed(1) + 'px';
        d.className = tier.cls;
        d.style.width = sz.toFixed(1) + 'px';
        d.style.height = sz.toFixed(1) + 'px';
        d.style.left = (Math.random() * 100).toFixed(2) + '%';
        d.style.bottom = (-Math.round(sz + 36)) + 'px';
        d.style.setProperty('--bub-drift', drift);
        d.style.animationDuration = (tier.minDur + Math.random() * (tier.maxDur - tier.minDur)).toFixed(1) + 's';
        d.style.animationDelay = (-Math.random() * tier.maxDur).toFixed(1) + 's';
        box.appendChild(d);
      }
    }
  }

  function startApp() {
    var bootEl = $('#boot');
    bootEl.classList.add('leaving');
    setTimeout(function () { bootEl.classList.add('hidden'); }, 360);
    $('#app').classList.remove('hidden');
    $('#app').classList.add('entering');
    setTimeout(function () { $('#app').classList.remove('entering'); }, 600);
    roll = new NSG.PianoRoll($('#roll'), $('#rollScroll'));
    roll._eyeFx = NSG.EyeFx ? new NSG.EyeFx(roll) : null;
    roll.timbre = state.timbre;
    roll.theme = state.theme;
    roll.forceSnap = !!state.forceSnap;
    var forceSnapChkInit = $('#forceSnapChk');
    if (forceSnapChkInit) forceSnapChkInit.checked = !!roll.forceSnap;
    state.relativeMotion = false;
    roll.relativeMotion = false;
    roll.isPlaying = !!state.playing;
    var relativeMotionChkInit = $('#relativeMotionChk');
    if (relativeMotionChkInit) relativeMotionChkInit.checked = false;
    roll.onContextMenu = onRollContextMenu;
    roll.onSelectionChange = syncInspector;
    roll.onTuningInput = syncInspector;
    roll.onViewChange = function () {
      $('#zoomX').value = roll.pxBeat; $('#zoomY').value = roll.rowH;
    };
    var resumeAfterSeek = false;
    roll.onSeek = function (beat) {
      if (state.playing || playPending) { stopPlay(); resumeAfterSeek = true; }
      roll.playPos = beat;
      syncCursor();
    };
    roll.onSeekEnd = function () {
      if (resumeAfterSeek) { resumeAfterSeek = false; startPlay(); }
    };
    setUITransparency(state.uiTransparency);
    roll.onChange = function (notes, pit) {
      var trk = activeVocalTrack();
      if (trk) {
        trk.notes = notes;
        if (pit !== undefined) {
          if (pit && pit.length) trk.pit = pit;
          else delete trk.pit;
        }
      }
      state.dirty = true;
      updateStat();
      syncInspector();
      renderAndAnalyze(120);
    };
    roll.defaultLyric = 'a';
    roll.onEditLyric = function (note, apply) {
      askText(t('ui.editLyricTitle', null, '编辑歌词'),
        t('ui.editLyricHint', null, '歌词可填汉字 / 假名 / 罗马字。+ 接续前一个词，由音素器分配音节；+~ 或 +* 明确延长元音。兼容 - 延音。'),
        note.lyric === '‿' ? '-' : (note.lyric || 'a'), apply);
    };
    roll.onEditPhones = function (note, info, apply) {
      askText(t('ui.editPhonesTitle', null, '编辑音素'),
        t('ui.editPhonesHint', null, '音素以空格分隔；清空恢复自动发音。* 表示自定义发音。英语 / Asaxi 也可填 [音素标注]。'),
        info.phones.join(' '), function (value) {
          if (apply(value) !== false && value !== null) renderAndAnalyze(60);
        });
    };
    roll.onPhoneError = function (message) { alert(tMsg(message)); };
    bindPhoneInspector();
    /* 调试/自测用的只读出口：拿到当前乐谱（不含任何写操作） */
    NSG.__score = function () { return state.score; };
    NSG.__roll = function () { return roll; };
    NSG.__syncTempo = function () { state.tm = null; syncRollTempos(); };
    bindHarmEdit();
    var acousticDet = $('.acoustic-inspector');
    if (acousticDet && typeof acousticDet.addEventListener === 'function') {
      acousticDet.addEventListener('toggle', function () {
        if (acousticDet.open) {
          drawCurve();
          ensureAcousticAnalysis();
        }
      });
    }
    window.addEventListener('resize', function () { roll.resize(); });
    if (window.ResizeObserver) new ResizeObserver(function () { roll.resize(); }).observe($('#roll').parentNode);
    bindUI();
    buildSingerGrid();
    fillKeySel();
    fillScaleSel();
    applyTimbreToUI();
    loadDemo(true);
    roll.showControlPoints = true;
    var ctrlBtn = $('#showControlPoints');
    if (ctrlBtn && ctrlBtn.classList && ctrlBtn.classList.toggle) {
      ctrlBtn.classList.toggle('active', true);
      ctrlBtn.setAttribute('aria-pressed', 'true');
    }
    setTool('select', true);
    refreshBlockList();
    syncRollTempos();
    setBg(state.bgId);
    applyUiLanguage();
    setStatus(t('status.ready', null, '就绪'));
    renderAndAnalyze(300);
    if (location.hash.indexOf('#t=') === 0) {
      var act = location.hash.slice(3);
      setTimeout(function () { doAct(act); }, 700);
    }
  }

  function bindPhoneInspector() {
    var ids = { symbol: 'phoneSymbol', start: 'phoneStart', duration: 'phoneDuration', anticipation: 'phoneAnticipation', crossfade: 'phoneCrossfade', word: 'phoneWordGroup' };
    var options = document.createDocumentFragment();
    Object.keys(NSG.PHONES).filter(function (id) { return id.indexOf('__') !== 0 && !/^(SP|AP|br[1-5]?)$/.test(id); }).sort().forEach(function (id) {
      var option = document.createElement('option'); option.value = id; options.appendChild(option);
    });
    $('#phoneSymbols').appendChild(options);
    roll.onPhoneSelectionChange = function (phone, group) {
      $('#phoneInspector').disabled = !phone || phone.readOnly;
      var owner = phone && NSG.pronunciationGroups(roll.notes, roll._phoneTimeline().notes)[phone.noteId];
      var caption = phone ? (owner && owner.word ? owner.word + ' / ' : '') + phone.phone : t('phone.selectHint', null, '请选择音素');
      $('#phoneSelected').textContent = caption; $('#phoneSelected').title = caption;
      var values = phone ? { symbol: phone.phone, start: Math.round((phone.t0 - group.tm.secOf(group.note.start)) * 1000),
        duration: Math.round((phone.t1 - phone.t0) * 10000) / 10, anticipation: Math.round((phone.anticipation || 0) * 10) / 10, crossfade: Math.round(phone.crossfade * 10) / 10,
        word: group.note.phonemeWordJoin === undefined ? 'auto' : group.note.phonemeWordJoin ? 'join' : 'new' } :
        { symbol: '', start: '', duration: '', anticipation: '', crossfade: '', word: 'auto' };
      Object.keys(ids).forEach(function (field) { if (document.activeElement !== $('#' + ids[field])) $('#' + ids[field]).value = values[field]; });
      $('#phoneCrossfade').max = phone ? Math.round(phone.maxCrossfade * 10) / 10 : 200;
      $('#phoneCrossfade').disabled = !phone || phone.maxCrossfade <= 0;
      $('#phoneAnticipation').max = phone ? Math.floor((phone.maxAnticipation || 0) * 10) / 10 : 200;
      $('#phoneAnticipation').disabled = !phone || !(phone.maxAnticipation > 0);
    };
    Object.keys(ids).forEach(function (field) {
      $('#' + ids[field]).addEventListener('change', function () {
        roll.updatePhone(field, this.value);
        this.blur(); roll._syncPhoneSelection();
      });
    });
    roll.onEditPhone = function () { $('#phoneSymbol').focus(); $('#phoneSymbol').select(); };
    roll.onPhoneCommit = function () { renderAndAnalyze(80); };
    $('#phoneTimingReset').addEventListener('click', function () { roll.updatePhone('reset'); });
    $('#phoneSequence').addEventListener('click', function () {
      var phone = roll.selectedPhone(); if (!phone || phone.readOnly) return;
      var group = roll._phoneGroup(phone);
      roll.editPhones({ note: group.note, info: NSG.pronunciationInfo(group.runtime) });
    });
    $('#phonePanel').addEventListener('click', function () {
      roll.showPhonePanel = !roll.showPhonePanel;
      this.classList.toggle('active', roll.showPhonePanel); this.setAttribute('aria-pressed', String(roll.showPhonePanel));
      $('#phoneInspectorRow').hidden = !roll.showPhonePanel;
      roll.centerOn(); roll.resize();
    });
  }

  /* ---------------- 界面绑定 ---------------- */
  function renderUiLangMenu() {
    var menu = $('#uiLangMenu');
    if (!menu || !NSG || !NSG.I18N || typeof document.createElement !== 'function') return;
    var cur = NSG.I18N.getLanguage();
    menu.innerHTML = '';
    NSG.I18N.getLanguages().forEach(function (item) {
      var a = document.createElement('a');
      a.tabIndex = 0;
      a.setAttribute('role', 'menuitem');
      a.dataset.lang = item.code;
      a.textContent = (item.code === cur ? '✓ ' : '') + item.nativeName;
      var pick = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        $$('.mg').forEach(function (x) {
          x.classList.remove('open');
          var b = x.querySelector('.mbtn[aria-haspopup], .wbtn[aria-haspopup]');
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        setUiLanguage(item.code);
      };
      a.addEventListener('click', pick);
      a.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') pick(e);
      });
      menu.appendChild(a);
    });
  }

  function syncSelectOptions(sel, map) {
    if (!sel || !sel.options) return;
    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      if (Object.prototype.hasOwnProperty.call(map, opt.value)) {
        opt.textContent = map[opt.value];
      }
    }
  }

  function syncEyeModeButton() {
    var btn = $('#btnEyeMode');
    if (!btn) return;
    var fx = roll && roll._eyeFx;
    var on = !!(fx && fx.active);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    if (on && fx.mode) {
      var modeName = fx.modeLabel();
      var ec = fx.mode.eyeColor;
      btn.dataset.eyeMode = fx.mode.id;
      if (ec) {
        btn.style.setProperty('--eye-mode-iris', ec.iris);
        btn.style.setProperty('--eye-mode-ring', ec.ring);
        btn.style.setProperty('--eye-mode-pupil', ec.pupil);
      }
      btn.title = t('transport.eyeTitleActive', { mode: modeName }, '莫名其妙模式：' + modeName + '（再次点击弹起退出）');
    } else {
      delete btn.dataset.eyeMode;
      btn.style.removeProperty('--eye-mode-iris');
      btn.style.removeProperty('--eye-mode-ring');
      btn.style.removeProperty('--eye-mode-pupil');
      btn.title = t('transport.eyeTitle', null, '……？');
    }
  }

  function applyUiLanguage() {
    if (NSG && NSG.I18N && typeof NSG.I18N.applyDom === 'function' && typeof document !== 'undefined') {
      NSG.I18N.applyDom(document);
    }
    if (roll && roll.cv) {
      roll._defaultCvTitle = roll.cv.title || '';
    }
    syncEyeModeButton();
    if ($('#eyeFxPanel') && !$('#eyeFxPanel').hidden && typeof renderEyeFxPanel === 'function') {
      renderEyeFxPanel();
    }
    var langBtn = $('#uiLangBtn');
    if (langBtn) {
      var meta = NSG && NSG.I18N && typeof NSG.I18N.getLanguageMeta === 'function' ? NSG.I18N.getLanguageMeta() : null;
      langBtn.textContent = (meta && meta.buttonLabel) || t('lang.button', null, 'language');
      langBtn.title = t('lang.buttonTitle', null, 'Switch UI Language (English / 中文 / 日本語)');
      if (langBtn.setAttribute) langBtn.setAttribute('aria-label', t('lang.buttonAria', null, '切换界面语言 / Switch Language'));
    }
    var mq = $('#marquee');
    if (mq) {
      var mqText = t('app.bootMarquee', null, '正在加载资源库 …… 正在校准共振腔 …… 正在装载音色参数块 …… 正在准备七语种发音规则 …… 正在初始化声带脉冲表 ……');
      mq.innerHTML = mqText + '&nbsp;&nbsp;&nbsp;&nbsp;' + mqText + '&nbsp;&nbsp;&nbsp;&nbsp;';
    }
    var langSel = $('#langSel');
    if (langSel && langSel.options) {
      for (var i = 0; i < langSel.options.length; i++) {
        langSel.options[i].textContent = tLangName(langSel.options[i].value);
      }
    }
    fillScaleSel();
    var openCpScale = $('#cpScale');
    if (openCpScale) {
      var curCpScale = openCpScale.value || 'penta';
      openCpScale.innerHTML = scaleOptionsHtml();
      openCpScale.value = NSG.COMPOSE.SCALES[curCpScale] ? curCpScale : 'penta';
    }
    syncSelectOptions($('#octSel'), {
      '-12': t('left.octLow', null, '低'),
      '0': t('left.octMid', null, '中'),
      '12': t('left.octHigh', null, '高')
    });
    syncSelectOptions($('#snapSel'), {
      '0.3333': t('transport.triplet', null, '三连音')
    });
    syncSelectOptions($('#phoneWordGroup'), {
      auto: t('phone.wordAuto', null, '自动区分'),
      join: t('phone.wordJoin', null, '接前词'),
      'new': t('phone.wordNew', null, '新词')
    });
    syncSelectOptions($('#pitShape'), {
      '': t('ins.pitMixed', null, '多种形状'),
      s: tPitchShapeName({ id: 's', name: '缓入缓出（S 曲线）' }),
      l: tPitchShapeName({ id: 'l', name: '直线' }),
      i: tPitchShapeName({ id: 'i', name: '缓入' }),
      o: tPitchShapeName({ id: 'o', name: '缓出' }),
      sp: tPitchShapeName({ id: 'sp', name: '平滑（样条）' })
    });
    var noteInsEl = $('#noteInspector');
    if (noteInsEl && noteInsEl.parentNode && noteInsEl.parentNode.querySelector) {
      var noteHeading = noteInsEl.parentNode.querySelector('.ins-heading b');
      if (noteHeading) noteHeading.textContent = t('ins.heading', null, '音符 / 调教');
    }
    var focusBtn = $('#focusRoll');
    if (focusBtn) {
      var appEl = $('#app');
      var focused = !!(appEl && appEl.classList && appEl.classList.contains('roll-focused'));
      focusBtn.textContent = focused ? t('rolltools.focusRestore', null, '恢复侧栏') : t('rolltools.focus', null, '专注卷帘');
    }
    var curveVowel = $('#curveVowel');
    if (curveVowel) curveVowel.title = t('an.curveVowelTitle', null, '点击切换元音');
    var phoneSelEl = $('#phoneSelected');
    if (phoneSelEl && (!roll || !roll.selectedPhone || !roll.selectedPhone())) {
      phoneSelEl.textContent = t('phone.selectHint', null, '请选择音素');
    }
    renderUiLangMenu();
    if (typeof buildSingerGrid === 'function') buildSingerGrid();
    if (typeof refreshBlockList === 'function') refreshBlockList();
    if (typeof renderLayerList === 'function') renderLayerList();
    if (typeof syncInspector === 'function' && roll) syncInspector();
    if (typeof syncQuality === 'function') syncQuality();
    if (typeof syncRollTempos === 'function') syncRollTempos();
    if (typeof syncCursor === 'function' && roll) syncCursor();
    if (typeof updateTransparencyVisibility === 'function') updateTransparencyVisibility(resolveTheme(state.theme));
    paintProcessingElapsed();
    paintStatus();
    if (roll && typeof roll.draw === 'function') roll.draw();
    if (typeof drawCurve === 'function') drawCurve();
    if (typeof drawGrid === 'function') drawGrid();
  }

  function setUiLanguage(lang, opts) {
    if (!NSG || !NSG.I18N || typeof NSG.I18N.setLanguage !== 'function') return 'zh-CN';
    var applied = NSG.I18N.setLanguage(lang, opts);
    applyUiLanguage();
    var meta = NSG.I18N.getLanguageMeta(applied);
    if (!opts || opts.silent !== true) {
      setStatus(t('lang.switched', { name: (meta && meta.nativeName) || applied }, '界面语言已切换为 ' + ((meta && meta.nativeName) || applied)));
    }
    return applied;
  }
  NSG.setUiLanguage = setUiLanguage;
  NSG.getUiLanguage = function () { return NSG.I18N ? NSG.I18N.getLanguage() : 'zh-CN'; };

  function openLanguage() {
    var langs = (NSG && NSG.I18N && NSG.I18N.getLanguages) ? NSG.I18N.getLanguages() : [{ code: 'zh-CN', nativeName: '简体中文', name: '简体中文' }];
    var cur = NSG.getUiLanguage();
    var html = '<div class="eyestyles" id="uiLangOptions">' + langs.map(function (item) {
      var on = item.code === cur;
      return '<button type="button" class="eyestyle' + (on ? ' on' : '') + '" data-lang-code="' + escAttr(item.code) + '" aria-pressed="' + on + '">' + escAttr(item.nativeName) + '</button>';
    }).join('') + '</div>';
    var m = modal(t('lang.menuTitle', null, '界面语言 / Language'), html, '<button class="abtn primary" data-close>' + escAttr(t('common.done', null, '完成')) + '</button>');
    $$('[data-lang-code]', m.el).forEach(function (btn) {
      btn.onclick = function () {
        setUiLanguage(btn.dataset.langCode);
        m.close();
      };
    });
    return m;
  }

  function bindUI() {
    $('#hdVoice').addEventListener('click', function () {
      stopPlay();
      state.hd = !state.hd;
      state.dirty = true;
      syncQuality(); drawCurve();
      renderAndAnalyze(0);
      setStatus(t(state.hd ? 'ui.hdOnStatus' : 'ui.hdOffStatus', null, state.hd ? '模式B已开启 · 原生 48kHz · 正在重新渲染' : '已切回既有 16kHz 合成 · 正在重新渲染'));
    });
    $('#uiTransparency').addEventListener('input', function () {
      setUITransparency(this.value);
      try { localStorage.setItem('nsg.uiTransparency', String(state.uiTransparency)); } catch (e) { }
    });
    // 菜单：点开后鼠标滑到相邻菜单即切换；Esc 关闭；菜单项可用键盘 Enter 触发
    function closeMenus() {
      $$('.mg').forEach(function (x) {
        x.classList.remove('open');
        var b = x.querySelector('.mbtn[aria-haspopup], .wbtn[aria-haspopup]');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
    function openMenu(g) {
      closeMenus();
      g.classList.add('open');
      var b = g.querySelector('.mbtn, .wbtn');
      if (b) b.setAttribute('aria-expanded', 'true');
      var vocalExport = g.querySelector('[data-act="expVocal"]');
      if (vocalExport) vocalExport.setAttribute('aria-disabled', String(!selectedVocalTrack()));
    }
    $$('.mg').forEach(function (g) {
      var btn = g.querySelector('.mbtn, .wbtn');
      if (!btn || !g.querySelector('.dropdown')) return;
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (g.classList.contains('open')) closeMenus(); else openMenu(g);
      });
      btn.addEventListener('mouseenter', function () {
        if (!g.classList.contains('open') && $('.mg.open')) openMenu(g);
      });
      $$('.dropdown a', g).forEach(function (a) {
        a.tabIndex = 0;
        a.setAttribute('role', 'menuitem');
        a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } });
      });
    });
    renderUiLangMenu();
    document.addEventListener('click', function (e) {
      closeMenus();
      closeContextMenu();
      var ep = $('#eyeFxPanel');
      if (ep && !ep.hidden && (!e || (!ep.contains(e.target) && e.target !== $('#btnEyeMode') && !($('#btnEyeMode') && $('#btnEyeMode').contains(e.target))))) {
        closeEyeFxPanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#eyeFxPanel') && !$('#eyeFxPanel').hidden) { closeEyeFxPanel(); e.stopPropagation(); return; }
      if (e.key === 'Escape' && $('#ctxMenu') && !$('#ctxMenu').hidden) { closeContextMenu(); e.stopPropagation(); return; }
      if (e.key === 'Escape' && $('.mg.open')) { closeMenus(); e.stopPropagation(); }
    }, true);
    bindGlobalContextMenu();

    $$('[data-act]').forEach(function (el) {
      if ((el.classList.contains('mbtn') || el.classList.contains('wbtn')) &&
          el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('mg') &&
          el.parentNode.querySelector('.dropdown')) return;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (el.id === 'btnPlay') return;
        closeMenus();
        doAct(el.dataset.act);
      });
    });

    $('#btnPlay').addEventListener('click', togglePlay);
    $$('.tool').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.dataset.tool); });
    });
    $('#snapSel').addEventListener('change', function () { roll.snap = parseFloat(this.value); roll.draw(); });
    var forceSnapChk = $('#forceSnapChk');
    if (forceSnapChk) {
      forceSnapChk.addEventListener('change', function () {
        state.forceSnap = !!this.checked;
        roll.forceSnap = state.forceSnap;
        try {
          if (state.forceSnap) localStorage.setItem('nsg.forceSnap', '1');
          else localStorage.removeItem('nsg.forceSnap');
        } catch (e) { }
        setStatus(t(state.forceSnap ? 'ui.forceSnapOnStatus' : 'ui.forceSnapOffStatus', null,
          state.forceSnap
            ? '强制吸附网格已开启 · 拖动音符起点与结尾将严格对齐网格线（按住 Alt 拖动可临时关闭）'
            : '强制吸附网格已关闭 · 拖动音符将保持原有相对偏移（按住 Alt 拖动可临时开启）'));
      });
    }
    var relativeMotionChk = $('#relativeMotionChk');
    if (relativeMotionChk) {
      relativeMotionChk.addEventListener('change', function () {
        state.relativeMotion = !!this.checked;
        if (roll) roll.relativeMotion = state.relativeMotion;
        if (state.relativeMotion && state.playing && roll) {
          applyRelativeMotionScroll(roll.playPos);
          roll.draw();
        }
        setStatus(t(state.relativeMotion ? 'ui.relativeMotionOnStatus' : 'ui.relativeMotionOffStatus', null,
          state.relativeMotion
            ? '相对运动已开启 · 播放时指针停在第一小节位置，由钢琴窗向左滚动'
            : '相对运动已关闭 · 播放时恢复常规翻页跟随'));
      });
    }
    bindRollControls();
    $('#tempo').addEventListener('change', function () {
      var v = Math.max(20, Math.min(400, parseFloat(this.value) || 120));
      this.value = Math.round(v * 100) / 100;
      /* 这里改的是「第 0 拍的速度」；后面的分段速度在「分段…」里改 */
      var list = NSG.TEMPO.list(state.score);
      list[0].bpm = v;
      applyTempos(list);
      setStatus(t('ui.tempoStatus', {
        bpm: v,
        segs: list.length > 1 ? t('ui.tempoSegsSuffix', { n: list.length }, '（全曲共 ' + list.length + ' 段速度）') : ''
      }, '速度：' + v + ' BPM' + (list.length > 1 ? '（全曲共 ' + list.length + ' 段速度）' : '')));
    });
    $('#langSel').addEventListener('change', function () {
      changeLanguage(this.value);
    });

    // 音色滑杆
    var map = [
      ['sGen', 'gen', 'vGen', 0],
      ['sHeight', 'height', 'vHeight', 0], ['sBw', 'bwScale', 'vBw', 2],
      ['sHi', 'hiShift', 'vHi', 2], ['sLip', 'lip', 'vLip', 2],
      ['sTilt', 'tiltDb', 'vTilt', 0], ['sBre', 'breath', 'vBre', 2],
      ['sNas', 'nasal', 'vNas', 2],
      ['sScale', 'fScale', 'vScale', 2], ['sWarp', 'warp', 'vWarp', 2],
      ['sJit', 'jitter', 'vJit', 'pct'], ['sGlo', 'glottal', 'vGlo', 2],
      ['sModeBHigh', 'modeBHigh', 'vModeBHigh', 'pct'],
      ['sArticMorph', 'articMorph', 'vArticMorph', 'pct'],
      ['sVowelOpening', 'highVowelOpening', 'vVowelOpening', 'pct']
    ];
    map.forEach(function (m) {
      var el = $('#' + m[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        state.timbre[m[1]] = parseFloat(this.value);
        $('#' + m[2]).textContent = m[3] === 0 ? (+this.value).toFixed(0)
          : m[3] === 'pct' ? (+this.value * 100).toFixed(2) + '%' : (+this.value).toFixed(2);
        state.dirty = true;
        markEdited();
        drawCurve();
        renderAndAnalyze(600);
      });
    });

    [
      ['sWaveguide', 'hifiWaveguide', 'vWaveguide'],
      ['sHighPolish', 'hifiHighPolish', 'vHighPolish']
    ].forEach(function (item) {
      var el = $('#' + item[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        var v = normHifiAmount(parseFloat(this.value), 1);
        state[item[1]] = v;
        var out = $('#' + item[2]);
        if (out) out.textContent = Math.round(v * 100) + '%';
        state.dirty = true;
        renderAndAnalyze(200);
      });
    });

    ['f4', 'f5', 'f6'].forEach(function (id, i) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener('change', function () {
        var v = Math.max(1200, Math.min(7600, parseFloat(this.value) || state.timbre.higher[i]));
        state.timbre.higher[i] = Math.round(v);
        this.value = state.timbre.higher[i];
        state.dirty = true;
        markEdited();
        drawCurve();
        renderAndAnalyze(500);
      });
    });

    $('#keySel').addEventListener('change', function () {
      state.score.root = +this.value;
      state.dirty = true;
      setStatus(t('ui.keyStatus', { key: keyName(+this.value), midi: this.value }, '调性：' + keyName(+this.value) + '（主音 MIDI ' + this.value + '）'));
    });
    $('#octSel').addEventListener('change', function () {
      var o = +this.value;
      var octLabel = o > 0 ? t('octLabel.high', null, '高（+12 半音）') : o < 0 ? t('octLabel.low', null, '低（−12 半音）') : t('octLabel.mid', null, '中');
      setStatus(t('ui.octStatus', { oct: octLabel }, '铺音符的起始八度：' + octLabel));
    });

    bindMixer();
    bindLayerControls();
    $('#rawChk').addEventListener('change', function () {
      state.rawSrc = this.checked;
      state.dirty = true;
      syncQuality();
      renderAndAnalyze(30);
      setStatus(t(this.checked ? 'ui.rawOnStatus' : 'ui.rawOffStatus', null,
        this.checked ? '正在听未经滤波的声带音（共振腔已旁路）' : '已恢复：声带音 → 口腔/鼻腔共振'));
    });
  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeEyeFxPanel() {
    var panel = $('#eyeFxPanel');
    if (panel) panel.hidden = true;
  }

  function renderEyeFxPanel() {
    var panel = $('#eyeFxPanel');
    if (!panel || !roll || !roll._eyeFx) return;
    var fx = roll._eyeFx;
    var modes = (NSG.EyeFx && NSG.EyeFx.MODES) || [];
    var opts = fx.getOptions ? fx.getOptions() : { opacity: 1, motionAmp: 1, floatingText: true, danmaku: true, circleSpinner: true, clawHookProb: 0, judgeSpin: true };
    var activeId = (fx.active && fx.mode) ? fx.mode.id : '';
    var modesBox = panel.querySelector('.eye-fx-modes');
    var prevScroll = modesBox ? modesBox.scrollTop : 0;

    var showcaseModes = modes.filter(function (m) { return !!m.showcase; });
    var weirdModes = modes.filter(function (m) { return !m.showcase; });

    function renderModeBtns(list) {
      return list.map(function (m) {
        var isOn = m.id === activeId;
        var dotCol = (m.eyeColor && m.eyeColor.iris) || '#38bdf8';
        return '<button type="button" class="eyestyle eye-fx-mode-btn' + (isOn ? ' on' : '') + '" data-eye-mode-id="' + m.id + '">' +
          '<span class="eye-fx-mode-dot" style="background:' + dotCol + '"></span>' +
          '<span class="eye-fx-mode-name">' + escapeHtml(fx.modeLabel(m)) + '</span>' +
          '</button>';
      }).join('');
    }

    var modeOptsHtml = '';
    if (activeId === 'danmakuCat') {
      modeOptsHtml += '<label class="eye-fx-chk"><input type="checkbox" id="eyeOptDanmaku"' + (opts.danmaku ? ' checked' : '') + '><span>' + escapeHtml(t('eye.panel.danmaku', null, '开启弹幕')) + '</span></label>';
    } else if (activeId === 'circleClicker') {
      modeOptsHtml += '<label class="eye-fx-chk"><input type="checkbox" id="eyeOptSpinner"' + (opts.circleSpinner ? ' checked' : '') + '><span>' + escapeHtml(t('eye.panel.spinner', null, '开启间奏大转盘')) + '</span></label>';
    } else if (activeId === 'clawCrane') {
      var hookPct = Math.round((opts.clawHookProb || 0) * 100);
      modeOptsHtml += '<label class="eye-fx-slider-row"><span>' + escapeHtml(t('eye.panel.clawHook', null, '上钩概率')) + '</span>' +
        '<input type="range" id="eyeOptClawHook" min="0" max="100" step="5" value="' + hookPct + '">' +
        '<span class="eye-fx-slider-val" id="eyeOptClawHookVal">' + hookPct + '%</span></label>';
    } else if (activeId === 'judgeLineSpin') {
      modeOptsHtml += '<label class="eye-fx-chk"><input type="checkbox" id="eyeOptJudgeSpin"' + (opts.judgeSpin ? ' checked' : '') + '><span>' + escapeHtml(t('eye.panel.judgeSpin', null, '判定线旋转')) + '</span></label>';
    }

    var opPct = Math.round((opts.opacity !== undefined ? opts.opacity : 1) * 100);
    var ampPct = Math.round((opts.motionAmp !== undefined ? opts.motionAmp : 1) * 100);

    panel.innerHTML =
      '<div class="eye-fx-head">' +
        '<span class="eye-fx-title">' + escapeHtml(fx.active && fx.mode ? ('👁 ' + fx.modeLabel(fx.mode)) : t('eye.panel.title', null, '👁 选择莫名其妙效果')) + '</span>' +
        '<div class="eye-fx-head-actions">' +
          '<button type="button" class="abtn" id="eyePanelRandom">' + escapeHtml(t('eye.panel.random', null, '🎲 随机')) + '</button>' +
          '<button type="button" class="abtn" id="eyePanelOff"' + (fx.active ? '' : ' disabled') + '>' + escapeHtml(t('eye.panel.off', null, '关闭')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="eye-fx-modes">' +
        '<div>' +
          '<div class="eye-fx-group-label">' + escapeHtml(t('eye.panel.showcaseGroup', null, '✨ 适合晒调教')) + '</div>' +
          '<div class="eye-fx-grid">' + renderModeBtns(showcaseModes) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="eye-fx-group-label">' + escapeHtml(t('eye.panel.weirdGroup', null, '🌀 莫名其妙')) + '</div>' +
          '<div class="eye-fx-grid">' + renderModeBtns(weirdModes) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ctx-sep"></div>' +
      '<div class="eye-fx-opts">' +
        '<div class="eye-fx-opt-head">' +
          '<span>' + escapeHtml(t('eye.panel.options', null, '效果选项')) + '</span>' +
          '<button type="button" class="eye-fx-reset" id="eyePanelReset">' + escapeHtml(t('eye.panel.reset', null, '恢复默认')) + '</button>' +
        '</div>' +
        '<label class="eye-fx-slider-row">' +
          '<span>' + escapeHtml(t('eye.panel.opacity', null, '效果透明度')) + '</span>' +
          '<input type="range" id="eyeOptOpacity" min="10" max="100" step="5" value="' + opPct + '">' +
          '<span class="eye-fx-slider-val" id="eyeOptOpacityVal">' + opPct + '%</span>' +
        '</label>' +
        '<label class="eye-fx-slider-row">' +
          '<span>' + escapeHtml(t('eye.panel.motionAmp', null, '动作幅度')) + '</span>' +
          '<input type="range" id="eyeOptMotionAmp" min="0" max="200" step="5" value="' + ampPct + '">' +
          '<span class="eye-fx-slider-val" id="eyeOptMotionAmpVal">' + ampPct + '%</span>' +
        '</label>' +
        '<div class="eye-fx-checks">' +
          '<label class="eye-fx-chk" title="' + escapeHtml(t('eye.panel.floatingTextHint', null, '如 呱呱、高音～、暴击 等与谱面无关的文字粒子')) + '">' +
            '<input type="checkbox" id="eyeOptFloatingText"' + (opts.floatingText ? ' checked' : '') + '>' +
            '<span>' + escapeHtml(t('eye.panel.floatingText', null, '浮动文字')) + '</span>' +
          '</label>' +
        '</div>' +
        (modeOptsHtml ? '<div class="eye-fx-mode-opts">' + modeOptsHtml + '</div>' : '') +
      '</div>';

    var newModesBox = panel.querySelector('.eye-fx-modes');
    if (newModesBox && prevScroll > 0) newModesBox.scrollTop = prevScroll;

    $$('[data-eye-mode-id]', panel).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = fx.enter(btn.dataset.eyeModeId);
        syncEyeModeButton();
        renderEyeFxPanel();
        if (mode) {
          var modeName = fx.modeLabel(mode);
          setStatus(t(mode.showcase ? 'eye.enteredShowcase' : 'eye.entered', { mode: modeName },
            '👁 进入莫名其妙模式：「' + modeName + '」' + (mode.showcase ? '✨（适合晒调教）' : '')));
        }
      });
    });

    var randBtn = $('#eyePanelRandom', panel);
    if (randBtn) randBtn.addEventListener('click', function () {
      var mode = fx.enter();
      syncEyeModeButton();
      renderEyeFxPanel();
      if (mode) {
        var modeName = fx.modeLabel(mode);
        setStatus(t(mode.showcase ? 'eye.enteredShowcase' : 'eye.entered', { mode: modeName },
          '👁 进入莫名其妙模式：「' + modeName + '」' + (mode.showcase ? '✨（适合晒调教）' : '')));
      }
    });

    var offBtn = $('#eyePanelOff', panel);
    if (offBtn) offBtn.addEventListener('click', function () {
      fx.exit();
      syncEyeModeButton();
      closeEyeFxPanel();
      setStatus(t('eye.exited', null, '已退出莫名其妙模式，回到正常视图'));
    });

    var resetBtn = $('#eyePanelReset', panel);
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (fx.resetOptions) fx.resetOptions();
      renderEyeFxPanel();
    });

    var opInp = $('#eyeOptOpacity', panel);
    if (opInp) opInp.addEventListener('input', function () {
      var v = Math.max(10, Math.min(100, Number(opInp.value) || 100));
      $('#eyeOptOpacityVal', panel).textContent = v + '%';
      if (fx.setOptions) fx.setOptions({ opacity: v / 100 });
    });

    var ampInp = $('#eyeOptMotionAmp', panel);
    if (ampInp) ampInp.addEventListener('input', function () {
      var v = Math.max(0, Math.min(200, Number(ampInp.value) || 0));
      $('#eyeOptMotionAmpVal', panel).textContent = v + '%';
      if (fx.setOptions) fx.setOptions({ motionAmp: v / 100 });
    });

    var floatChk = $('#eyeOptFloatingText', panel);
    if (floatChk) floatChk.addEventListener('change', function () {
      if (fx.setOptions) fx.setOptions({ floatingText: !!floatChk.checked });
    });

    var dmChk = $('#eyeOptDanmaku', panel);
    if (dmChk) dmChk.addEventListener('change', function () {
      if (fx.setOptions) fx.setOptions({ danmaku: !!dmChk.checked });
    });

    var spChk = $('#eyeOptSpinner', panel);
    if (spChk) spChk.addEventListener('change', function () {
      if (fx.setOptions) fx.setOptions({ circleSpinner: !!spChk.checked });
    });

    var hookInp = $('#eyeOptClawHook', panel);
    if (hookInp) hookInp.addEventListener('input', function () {
      var v = Math.max(0, Math.min(100, Number(hookInp.value) || 0));
      $('#eyeOptClawHookVal', panel).textContent = v + '%';
      if (fx.setOptions) fx.setOptions({ clawHookProb: v / 100 });
    });

    var judgeChk = $('#eyeOptJudgeSpin', panel);
    if (judgeChk) judgeChk.addEventListener('change', function () {
      if (fx.setOptions) fx.setOptions({ judgeSpin: !!judgeChk.checked });
    });
  }

  function openEyeFxPanel(anchorEl) {
    var panel = $('#eyeFxPanel');
    if (!panel || !roll || !roll._eyeFx || !roll._eyeFx.active) return;
    closeMenus();
    closeContextMenu();
    renderEyeFxPanel();
    panel.hidden = false;
    panel.style.left = '0px';
    panel.style.top = '0px';
    var ar = anchorEl ? anchorEl.getBoundingClientRect() : { left: 16, bottom: 48, right: 48, top: 16 };
    var pr = panel.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    var vh = window.innerHeight || document.documentElement.clientHeight || 768;
    var x = Math.min(Math.max(8, ar.left), Math.max(8, vw - pr.width - 8));
    var y = ar.bottom + 6;
    if (y + pr.height > vh - 8) {
      y = Math.max(8, ar.top - pr.height - 6);
    }
    panel.style.left = Math.round(x) + 'px';
    panel.style.top = Math.round(y) + 'px';
  }

    var eyeBtn = $('#btnEyeMode');
    if (eyeBtn) {
      var eyePanel = $('#eyeFxPanel');
      if (eyePanel) {
        eyePanel.addEventListener('click', function (e) { e.stopPropagation(); });
        eyePanel.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });
      }
      eyeBtn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!roll || !roll._eyeFx || !roll._eyeFx.active) return;
        var ep = $('#eyeFxPanel');
        if (ep && !ep.hidden) closeEyeFxPanel();
        else openEyeFxPanel(eyeBtn);
      });
      eyeBtn.addEventListener('click', function () {
        if (!roll || !roll._eyeFx) return;
        var mode = roll._eyeFx.toggle();
        syncEyeModeButton();
        if ($('#eyeFxPanel') && !$('#eyeFxPanel').hidden) {
          if (mode) renderEyeFxPanel();
          else closeEyeFxPanel();
        }
        if (mode) {
          var modeName = roll._eyeFx.modeLabel(mode);
          setStatus(t(mode.showcase ? 'eye.enteredShowcase' : 'eye.entered', { mode: modeName },
            '👁 进入莫名其妙模式：「' + modeName + '」' + (mode.showcase ? '✨（适合晒调教）' : '')));
        } else {
          setStatus(t('eye.exited', null, '已退出莫名其妙模式，回到正常视图'));
        }
      });
      var transportBar = eyeBtn.closest('.transport');
      if (transportBar) {
        transportBar.addEventListener('mousemove', function (e) {
          var r = eyeBtn.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var dx = e.clientX - cx, dy = e.clientY - cy;
          var dist = Math.hypot(dx, dy) || 1;
          var mag = Math.min(2.3, dist / 28);
          eyeBtn.style.setProperty('--eye-dx', ((dx / dist) * mag).toFixed(2) + 'px');
          eyeBtn.style.setProperty('--eye-dy', ((dy / dist) * mag * 0.72).toFixed(2) + 'px');
        });
        transportBar.addEventListener('mouseleave', function () {
          eyeBtn.style.setProperty('--eye-dx', '0px');
          eyeBtn.style.setProperty('--eye-dy', '0px');
        });
      }
    }
    $('#curveVowel').style.cursor = 'pointer';
    $('#curveVowel').title = t('an.curveVowelTitle', null, '点击切换元音');
    $('#curveVowel').addEventListener('click', function () {
      var seq = ['a', 'i', 'u', 'e', 'o', 'E', 'y', '1', 'A', 'O'];
      var i = seq.indexOf(state.vowel);
      state.vowel = seq[(i + 1) % seq.length];
      drawCurve();
    });

    var TOOL_KEYS = { '1': 'pen', '2': 'select', '3': 'erase', '4': 'bend', '5': 'pit' };
    document.addEventListener('keydown', function (e) {
      if ($('#modalRoot').classList.contains('on')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.target.tagName === 'SUMMARY' && e.code === 'Space') return;
      var mod = e.ctrlKey || e.metaKey, plain = !mod && !e.altKey, key = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelectedNotes(); }
      else if (mod && key === 'x') { e.preventDefault(); cutNotes(); }
      else if (mod && key === 'c') copyNotes();
      else if (mod && key === 'v') pasteNotes();
      else if (mod && !e.shiftKey && !e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); shiftBarUI(-1); }
      else if (mod && !e.shiftKey && !e.altKey && e.key === 'ArrowRight') { e.preventDefault(); shiftBarUI(1); }
      else if (e.shiftKey && !mod && !e.altKey && e.key === 'ArrowUp') { e.preventDefault(); transposeOctaveUI(1); }
      else if (e.shiftKey && !mod && !e.altKey && e.key === 'ArrowDown') { e.preventDefault(); transposeOctaveUI(-1); }
      else if (mod && key === 'a') { e.preventDefault(); roll.selectAll(); syncInspector(); }
      else if (mod && key === 'z') { e.preventDefault(); roll.undo(e.shiftKey); }
      else if (mod && key === 'y') { e.preventDefault(); roll.undo(true); }
      else if (plain && key === 'i') $('#showPitch').click();
      else if (plain && key === 'o') $('#showControlPoints').click();
      else if (plain && key === 'u') $('#showVibrato').click();
      else if (plain && key === 's') { e.preventDefault(); toggleSlur(); }
      else if (plain && TOOL_KEYS[e.key]) setTool(TOOL_KEYS[e.key]);
      else if (plain && key === 'f') $('#fitRoll').click();
      else if (plain && e.key === 'Home') { e.preventDefault(); if (state.playing || playPending) stopPlay(); roll.playPos = 0; roll.scrollBeat = 0; roll.draw(); syncCursor(); }
      else if (plain && e.key === 'Escape') { roll.sel = {}; roll.draw(); syncInspector(); }
      else if (e.key === 'F1' || (plain && e.key === '?')) { e.preventDefault(); openHelp(); }
    });
  }

  var TOOL_NAMES = { pen: '画笔', select: '框选', erase: '擦除', bend: 'PIT 控制点', pit: 'PIT画笔' };
  function toolDisplayName(tool) {
    return t('tool.' + tool, null, TOOL_NAMES[tool] || tool);
  }
  function setTool(tool, silent) {
    if (roll) {
      roll.tool = tool;
      if (tool === 'pit' && !roll.showPitch) {
        roll.showPitch = true;
        var sp = $('#showPitch');
        if (sp && sp.classList && sp.classList.toggle) {
          sp.classList.toggle('active', true);
          sp.setAttribute('aria-pressed', 'true');
        }
      }
      if (tool === 'bend' && !roll.showControlPoints) {
        roll.showControlPoints = true;
        var sc = $('#showControlPoints');
        if (sc && sc.classList && sc.classList.toggle) {
          sc.classList.toggle('active', true);
          sc.setAttribute('aria-pressed', 'true');
        }
      }
      if (typeof roll.draw === 'function') roll.draw();
    }
    $$('.tool').forEach(function (x) {
      var on = x && x.dataset ? x.dataset.tool === tool : false;
      if (x && x.classList && x.classList.toggle) x.classList.toggle('on', on);
      if (x && x.setAttribute) x.setAttribute('aria-pressed', String(on));
    });
    var cv = $('#roll');
    if (cv && cv.setAttribute) cv.setAttribute('data-tool', tool);
    if (cv && cv.style) cv.style.cursor = '';
    if (!silent && TOOL_NAMES[tool]) setStatus(t('ui.toolStatus', { name: toolDisplayName(tool) }, '工具：' + TOOL_NAMES[tool]));
  }

  var trackLanguageRequest = 0;
  async function changeLanguage(lang) {
    // Keep source lyrics and pronunciation overrides intact. The phonemizer
    // works on runtime copies, so switching back restores their original meaning.
    if (state.playing || playPending) stopPlay();
    var tr = activeVocalTrack();
    var request = ++trackLanguageRequest;
    try { await NSG.loadDict(lang); }
    catch (e) {
      if (request === trackLanguageRequest && tr === activeVocalTrack()) {
        $('#langSel').value = roll.trackLanguage();
        setStatus(tMsg(e.message));
      }
      return;
    }
    if (request !== trackLanguageRequest || tr !== activeVocalTrack()) return;
    if (tr) {
      var tracks = (state.score && state.score.tracks) || [];
      tracks.forEach(function (other) {
        if (other && other !== tr && isVocalTrack(other) && other.phonemizer === undefined) {
          other.phonemizer = other.lang || (state.score && (state.score.phonemizer || state.score.lang)) || 'zh';
        }
      });
      (tr.notes || []).forEach(function (n) {
        if ((n.phones || n.slurPhones) && !n.phonesLang) n.phonesLang = n.noteLang || n.lang || tr.lang || state.score.lang;
      });
      tr.phonemizer = lang;
      tr.lang = lang;
    }
    state.score.phonemizer = lang;
    state.score.lang = lang;
    state.dirty = true;
    if (roll) {
      roll.lang = lang;
      roll.phonemizer = lang;
      if (typeof roll.draw === 'function') roll.draw();
    }
    syncInspector();
    renderLayerList();
    renderAndAnalyze(60);
    setStatus(t('ui.phonemizerSwitch', {
      layer: (tr && tr.name) || t('layer.defaultSingle', null, '人声'),
      lang: tLangName(lang)
    }, '音层「' + ((tr && tr.name) || '人声') + '」音素器切换为 ' + NSG.langName[lang] + ' · 已重新解析发音'));
  }

  function syncCursor() {
    var beat = roll.playPos, text = t('roll.cursor', {
      bar: Math.floor(beat / 4) + 1,
      beat: ((beat % 4) + 1).toFixed(2)
    }, '游标 ' + (Math.floor(beat / 4) + 1) + ':' + ((beat % 4) + 1).toFixed(2));
    var out = $('#cursorPosition');
    if (out.textContent !== text) out.textContent = text;
  }
  function syncInspector() {
    var picked = roll.selected(), n = picked[0];
    $('#noteInspector').disabled = !n;
    $('#insCount').textContent = n ? t('ins.selectedCount', {
      n: picked.length,
      slur: n.slur ? t('ins.selectedSlur', null, ' · 延音') : ''
    }, '已选 ' + picked.length + ' 个音符' + (n.slur ? ' · 延音' : '')) : t('ins.selectNote', null, '请选择音符');
    if (!n) {
      var vibBtn = $('#vibToggle');
      if (vibBtn) {
        vibBtn.textContent = t('ins.vibEnable', null, '启用颤音');
        vibBtn.setAttribute('aria-pressed', 'false');
      }
      return;
    }
    var values = { insLyric: n.lyric || 'a', insPitch: n.pitch, insDur: n.dur, insVel: n.vel || 96,
      insConsonantSpeed: n.consonantSpeed != null ? NSG.TUNING.consonantSpeed(n.consonantSpeed) :
        n.consonantLength != null ? NSG.TUNING.speedFromLength(n.consonantLength) : 100 };
    var v = NSG.TUNING.vibrato(n.vibrato);
    ['length', 'depth', 'rate', 'phase', 'fadeIn', 'fadeOut'].forEach(function (field) {
      values['vib' + field.charAt(0).toUpperCase() + field.slice(1)] = +v[field].toFixed(2);
    });
    Object.keys(values).forEach(function (id) {
      var input = $('#' + id);
      if (document.activeElement !== input) input.value = values[id];
    });
    var shapeInfo = roll._lastPitchInfo || roll._pitchInfo();
    var firstShape = null, hasShape = false, mixedShapes = false;
    outerShape: for (var si = 0; si < picked.length; si++) {
      var notePts = roll._editablePB(picked[si], shapeInfo[picked[si].id]);
      for (var pi = 0; pi < notePts.length - 1; pi++) {
        var sh = notePts[pi][2];
        if (!hasShape) { firstShape = sh; hasShape = true; }
        else if (sh !== firstShape) { mixedShapes = true; break outerShape; }
      }
    }
    $('#pitShape').value = mixedShapes ? '' : (hasShape ? (firstShape || 's') : 's');
    $('#vibToggle').textContent = !n.vibrato ? t('ins.vibEnableNote', null, '启用独立颤音')
      : (v.enabled ? t('ins.vibDisable', null, '关闭颤音') : t('ins.vibEnable', null, '启用颤音'));
    $('#vibToggle').setAttribute('aria-pressed', String(!!n.vibrato && v.enabled));
  }
  function transposeOctaveUI(direction) {
    var result = roll.transposeOctave(direction);
    if (result.limited) setStatus(t('ui.octLimited', null, '无法移动完整八度：音符将超出 MIDI 音高范围（0–127）'));
    else if (!result.n) setStatus(t('ui.noNotesToAdjust', null, '当前轨道没有可调整的音符'));
    else {
      state.dirty = true;
      setStatus(t('ui.octDone', {
        scope: result.selected ? t('ui.scopeSelected', null, '选中音符') : t('ui.scopeTrack', null, '当前轨道'),
        dir: direction === 1 ? t('ui.dirUp', null, '升高') : t('ui.dirDown', null, '降低'),
        n: result.n
      }, (result.selected ? '选中音符' : '当前轨道') + '已' + (direction === 1 ? '升高' : '降低') + '八度 · ' + result.n + ' 个音符 · 可撤销'));
      renderAndAnalyze(60);
    }
    return result;
  }
  function shiftBarUI(direction) {
    var result = roll.shiftBar(direction);
    if (result.limited) setStatus(t('ui.barLimited', null, '已到达第 1 小节起点，无法继续前移完整小节'));
    else if (!result.n) setStatus(t('ui.noNotesToMove', null, '当前轨道没有可移动的音符'));
    else {
      state.dirty = true;
      setStatus(t('ui.barDone', {
        scope: result.selected ? t('ui.scopeSelected', null, '选中音符') : t('ui.scopeTrack', null, '当前轨道'),
        dir: direction < 0 ? t('ui.dirLeft', null, '前移') : t('ui.dirRight', null, '后移'),
        n: result.n
      }, (result.selected ? '选中音符' : '当前轨道') + '已' + (direction < 0 ? '前移' : '后移') + ' 1 小节 · ' + result.n + ' 个音符 · 可撤销'));
      renderAndAnalyze(60);
    }
    return result;
  }
  function quantizeToGridUI() {
    var result = roll.quantizeToGrid();
    if (!result.n) setStatus(t('ui.noNotesToAdjust', null, '当前轨道没有可调整的音符'));
    else if (!result.changed) {
      setStatus(t('ui.quantizeAlreadyAligned', {
        scope: result.selected ? t('ui.scopeSelected', null, '选中音符') : t('ui.scopeTrack', null, '当前轨道')
      }, (result.selected ? '选中音符' : '当前轨道') + '已对齐到当前网格'));
    } else {
      state.dirty = true;
      setStatus(t('ui.quantizeDone', {
        scope: result.selected ? t('ui.scopeSelected', null, '选中音符') : t('ui.scopeTrack', null, '当前轨道'),
        n: result.changed
      }, (result.selected ? '选中音符' : '当前轨道') + '已吸附到网格 · 调整 ' + result.changed + ' 个音符 · 可撤销'));
      renderAndAnalyze(60);
    }
    return result;
  }
  function cutNotes() {
    var n = roll.cut();
    if (!n) { setStatus(t('ui.cutEmpty', null, '请先选中要剪切的音符')); return 0; }
    state.dirty = true;
    setStatus(t('ui.cutDone', { n: n }, '已剪切 ' + n + ' 个音符'));
    return n;
  }
  function copyNotes() {
    var n = roll.copy();
    setStatus(n ? t('ui.copyDone', { n: n }, '已复制 ' + n + ' 个音符') : t('ui.copyEmpty', null, '请先选中要复制的音符'));
    return n;
  }
  function pasteNotes(atBeat) {
    var target = typeof atBeat === 'number' && isFinite(atBeat) ? atBeat
      : Math.max(0, roll.playPos >= 0 ? roll.playPos : roll.scrollBeat + 1);
    var n = roll.paste(target);
    if (!n) { setStatus(t('ui.pasteEmpty', null, '剪贴板为空，请先复制或剪切音符')); return 0; }
    state.dirty = true;
    setStatus(t('ui.pasteDone', { n: n }, '已粘贴 ' + n + ' 个音符'));
    return n;
  }
  function deleteSelectedNotes() {
    var n = roll.deleteSel();
    if (!n) { setStatus(t('ui.delEmpty', null, '请先选中要删除的音符')); return 0; }
    state.dirty = true;
    setStatus(t('ui.delDone', { n: n }, '已删除 ' + n + ' 个音符'));
    return n;
  }
  function resetSelectedPitUI() {
    var list = roll.selected();
    if (!list.length) { setStatus(t('ui.resetPitEmpty', null, '请先选中要重置 PIT 的音符')); return 0; }
    list.forEach(function (n) { delete n.pb; delete n.pitchPoints; });
    if (roll.pit && roll.pit.length && NSG.TUNING && NSG.TUNING.replacePitSpan) {
      var nextPit = roll.pit;
      list.forEach(function (n) {
        nextPit = NSG.TUNING.replacePitSpan(nextPit, n.start, n.start + n.dur, [], 0.005);
      });
      roll.pit = nextPit;
    }
    roll._emit();
    state.dirty = true;
    setStatus(t('ui.resetPitDone', { n: list.length }, '已重置 ' + list.length + ' 个音符的 PIT 包络'));
    renderAndAnalyze(60);
    return list.length;
  }
  function clearPitBrushUI(allTrack) {
    if (!roll.pit || !roll.pit.length) { setStatus(t('ui.clearPitBrushNone', null, '当前没有画笔 PIT 曲线')); return 0; }
    if (allTrack) {
      roll.pit = [];
      roll._emit();
      state.dirty = true;
      setStatus(t('ui.clearPitBrushAll', null, '已清除整轨画笔 PIT 曲线'));
      renderAndAnalyze(60);
      return 1;
    }
    var list = roll.selected();
    if (!list.length) { setStatus(t('ui.clearPitBrushEmpty', null, '请先选中要清除画笔 PIT 的音符')); return 0; }
    var nextPit = roll.pit;
    list.forEach(function (n) {
      nextPit = NSG.TUNING.replacePitSpan(nextPit, n.start, n.start + n.dur, [], 0.005);
    });
    roll.pit = nextPit;
    roll._emit();
    state.dirty = true;
    setStatus(t('ui.clearPitBrushSel', { n: list.length }, '已清除 ' + list.length + ' 个音符的画笔 PIT 曲线'));
    renderAndAnalyze(60);
    return list.length;
  }

  function bindRollControls() {
    ['octaveUp', 'octaveDown'].forEach(function (id, index) {
      $('#' + id).addEventListener('click', function () {
        transposeOctaveUI(index === 0 ? 1 : -1);
      });
    });
    ['Pitch', 'ControlPoints', 'Vibrato', 'Phones'].forEach(function (kind) {
      var btn = $('#show' + kind);
      if (!btn) return;
      btn.addEventListener('click', function () {
        roll['show' + kind] = !roll['show' + kind];
        this.classList.toggle('active', roll['show' + kind]);
        this.setAttribute('aria-pressed', String(roll['show' + kind]));
        roll.draw();
      });
    });
    $('#zoomX').addEventListener('input', function () { roll.setZoomX(+this.value); });
    $('#zoomY').addEventListener('input', function () { roll.rowH = +this.value; roll.requestDraw(true); });
    $('#fitRoll').addEventListener('click', function () {
      roll.fit(); $('#zoomX').value = roll.pxBeat; $('#zoomY').value = roll.rowH;
    });
    $('#focusRoll').addEventListener('click', function () {
      var focused = $('#app').classList.toggle('roll-focused');
      this.setAttribute('aria-pressed', String(focused));
      this.textContent = focused ? t('rolltools.focusRestore', null, '恢复侧栏') : t('rolltools.focus', null, '专注卷帘');
      roll.resize();
    });
    $('#undoRoll').addEventListener('click', function () { roll.undo(); });
    $('#redoRoll').addEventListener('click', function () { roll.undo(true); });
    var fields = { insPitch: ['pitch', 24, 100], insDur: ['dur', 0.0625, 1024], insVel: ['vel', 1, 127],
      insConsonantSpeed: ['consonantSpeed', 0, 200] };
    Object.keys(fields).forEach(function (id) {
      $('#' + id).addEventListener('change', function () {
        if (!Number.isFinite(parseFloat(this.value))) { syncInspector(); return; }
        var f = fields[id], value = NSG.TUNING.clamp(+this.value, f[1], f[2]);
        if (id !== 'insDur') value = Math.round(value);
        this.value = value;
        roll.selected().forEach(function (n) {
          n[f[0]] = value;
          if (f[0] === 'consonantSpeed') delete n.consonantLength;   // 新参数取代旧的辅音长度
        }); roll._emit();
      });
    });
    $('#insLyric').addEventListener('change', function () {
      var lyric = this.value.trim();
      roll.selected().forEach(function (n) { roll.applyNoteLyric(n, lyric); });
      roll._emit();
    });
    ['length', 'depth', 'rate', 'phase', 'fadeIn', 'fadeOut'].forEach(function (field) {
      var input = $('#vib' + field.charAt(0).toUpperCase() + field.slice(1));
      input.addEventListener('change', function () {
        if (!Number.isFinite(parseFloat(this.value))) { syncInspector(); return; }
        var value = NSG.TUNING.clamp(+this.value, +this.min, +this.max); this.value = value;
        roll.selected().forEach(function (n) {
          n.vibrato = NSG.TUNING.vibrato(n.vibrato); n.vibrato[field] = value;
        }); roll._emit();
      });
    });
    $('#vibToggle').addEventListener('click', function () {
      var notes = roll.selected(), allOn = notes.every(function (n) { return n.vibrato && n.vibrato.enabled !== false; });
      notes.forEach(function (n) { n.vibrato = NSG.TUNING.vibrato(n.vibrato); n.vibrato.enabled = !allOn; }); roll._emit();
    });
    $('#pitReset').addEventListener('click', function () {
      resetSelectedPitUI();
    });
    $('#pitShape').addEventListener('change', function () {
      var shape = this.value, info = roll._pitchInfo();
      roll.selected().forEach(function (n) { n.pitchPoints = roll._editablePB(n, info[n.id]); delete n.pb; n.pitchPoints.forEach(function (p) { p[2] = shape; }); }); roll._emit();
    });
  }

  /* 延音符：选中的音改成「接着上一个音节唱」 */
  function toggleSlur() {
    var r = roll.toggleSlur();
    if (!r.n) { setStatus(t('ui.slurEmpty', null, '先选中要处理音符，再点「延音」')); return; }
    state.dirty = true;
    setStatus(r.on ? t('ui.slurOn', { n: r.n }, '已把 ' + r.n + ' 个音标成延音（不重发辅音）')
                   : t('ui.slurOff', { n: r.n }, '已取消 ' + r.n + ' 个音的延音'));
    renderAndAnalyze(60);
  }

  var statusMessage = '就绪', statusKey = 'status.ready', processingCount = 0, processingStarted = 0, processingTimer = null;
  function paintProcessingElapsed() {
    var el = $('#processingElapsed');
    if (el) el.textContent = t('status.elapsed', { s: Math.floor((Date.now() - processingStarted) / 1000) }, '已用时 ' + Math.floor((Date.now() - processingStarted) / 1000) + ' 秒');
  }
  function setStatus(s) {
    statusKey = null;
    statusMessage = s;
    paintStatus();
  }
  function paintStatus() {
    var el = $('#status');
    var notice = $('#processingNotice');
    if (notice) notice.hidden = processingCount === 0;
    var curMsg = statusKey ? t(statusKey, null, statusMessage) : statusMessage;
    var procTxt = t('status.processing', null, '处理中');
    var s = processingCount ? procTxt : curMsg;
    if (el) {
      el.title = processingCount ? t('status.processingTitle', { msg: curMsg }, '处理中 · ' + curMsg) : curMsg;
      if (el.classList && el.classList.toggle) el.classList.toggle('processing', processingCount > 0);
      if (el.textContent === s) return;
      el.textContent = s;
      // 状态变化时闪一下，提示用户看状态栏
      if (el.classList && el.classList.add && el.classList.remove) {
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
      }
    }
  }
  function beginProcessing() {
    if (processingCount === 0) {
      processingStarted = Date.now(); paintProcessingElapsed();
      if (typeof setInterval === 'function') processingTimer = setInterval(paintProcessingElapsed, 1000);
    }
    processingCount++;
    paintStatus();
    var finished = false;
    return function () {
      if (finished) return;
      finished = true;
      processingCount--;
      if (processingCount === 0 && processingTimer !== null) { clearInterval(processingTimer); processingTimer = null; }
      paintStatus();
    };
  }
  function processingPaint() {
    // Let the red lamp reach the screen before main-thread fallback/encoding work.
    if (!root.requestAnimationFrame || document.hidden) return null;
    return new Promise(function (resolve) {
      root.requestAnimationFrame(function () { setTimeout(resolve, 0); });
    });
  }
  async function processingTask(task) {
    var finish = beginProcessing();
    try {
      var paint = processingPaint();
      if (paint) await paint;
      return await task();
    }
    finally { finish(); }
  }
  function setPlayingClass(on) {
    if (roll) roll.isPlaying = !!on;
    if (document.body && document.body.classList) document.body.classList.toggle('is-playing', on);
  }
  function updateStat() {
    syncCursor();
    renderLayerList();
  }

  /* ---------------- 操作分发 ---------------- */
  function doAct(a) {
    switch (a) {
      case 'play': togglePlay(); break;
      case 'stop': if (state.playing || playPending) stopPlay(); else rewindToFirstNote(); break;
      case 'newProject': newProject(); break;
      case 'fileImport': pickFile(); break;
      case 'demo': loadDemo(false); break;
      case 'expVocal': exportWav('vocal'); break;
      case 'expVocalLayers': exportWav('vocalLayers'); break;
      case 'expAccomp': exportWav('accompaniment'); break;
      case 'expMix': exportWav('mix'); break;
      case 'expMidi': exportMidi('all'); break;
      case 'expVocalMidi': exportMidi('vocal'); break;
      case 'expAccompMidi': exportMidi('accompaniment'); break;
      case 'expProj': exportProject(); break;
      case 'expUfdata': exportUfdata(); break;
      case 'compose': openCompose(); break;
      case 'arrange': openArrange(); break;
      case 'accompPresets': openAccompPresets(); break;
      case 'autoTune': openAutoTune(); break;
      case 'simplifyPitch': return simplifyPitch();
      case 'tempoMap': openTempo(); break;
      case 'extract': openExtract(); break;
      case 'bg': openBg(); break;
      case 'theme': openTheme(); break;
      case 'uiLang': openLanguage(); break;
      case 'about': openAbout(); break;
      case 'saveBlock': saveBlock(); break;
      case 'delBlock': delBlock(); break;
      case 'toNotes': lyricToNotes(); break;
      case 'batchLyric': openBatchLyric(); break;
      case 'shiftBarLeft': shiftBarUI(-1); break;
      case 'shiftBarRight': shiftBarUI(1); break;
      case 'cutNotes': cutNotes(); break;
      case 'copyNotes': copyNotes(); break;
      case 'pasteNotes': pasteNotes(); break;
      case 'slur': toggleSlur(); break;
      case 'help': openHelp(); break;
    }
  }

  /* ---------------- 音色 ---------------- */
  function applyTimbreToUI() {
    var t = state.timbre;
    var tr = activeVocalTrack();
    if (tr && (tr.timbre || vocalTrackIndices(state.score).length > 1)) {
      tr.timbre = t;
      tr.presetDirty = !!state.presetDirty;
    }
    if (roll) { roll.timbre = t; if (typeof roll.draw === 'function') roll.draw(); }
    if ($('#sHeight')) {
      $('#sHeight').value = t.height; $('#vHeight').textContent = t.height;
      $('#sGen').value = NSG.genValue(t); $('#vGen').textContent = NSG.genValue(t).toFixed(0);
      $('#sBw').value = t.bwScale; $('#vBw').textContent = (+t.bwScale).toFixed(2);
      $('#sHi').value = t.hiShift; $('#vHi').textContent = (+t.hiShift).toFixed(2);
      $('#sLip').value = t.lip; $('#vLip').textContent = (+t.lip).toFixed(2);
      $('#sTilt').value = t.tiltDb; $('#vTilt').textContent = (+t.tiltDb).toFixed(0);
      $('#sBre').value = t.breath; $('#vBre').textContent = (+t.breath).toFixed(2);
      $('#sNas').value = t.nasal; $('#vNas').textContent = (+t.nasal).toFixed(2);
      $('#sScale').value = t.fScale === undefined ? 1 : t.fScale;
      $('#vScale').textContent = (+(t.fScale === undefined ? 1 : t.fScale)).toFixed(2);
      $('#sWarp').value = t.warp || 0; $('#vWarp').textContent = (+(t.warp || 0)).toFixed(2);
      $('#sJit').value = t.jitter || 0; $('#vJit').textContent = ((t.jitter || 0) * 100).toFixed(2) + '%';
      $('#sGlo').value = t.glottal || 0; $('#vGlo').textContent = (+(t.glottal || 0)).toFixed(2);
      var modeBHigh = t.modeBHigh === undefined ? 0.4 : t.modeBHigh;
      $('#sModeBHigh').value = modeBHigh; $('#vModeBHigh').textContent = (modeBHigh * 100).toFixed(0) + '%';
      var articMorph = t.articMorph === undefined ? 0.5 : t.articMorph;
      if ($('#sArticMorph')) { $('#sArticMorph').value = articMorph; $('#vArticMorph').textContent = Math.round(articMorph * 100) + '%'; }
      var opening = t.highVowelOpening || 0;
      $('#sVowelOpening').value = opening; $('#vVowelOpening').textContent = Math.round(opening * 100) + '%';
      var hi = t.higher || [3300, 4200, 5200];
      $('#f4').value = hi[0]; $('#f5').value = hi[1]; $('#f6').value = hi[2];
    }
    if (typeof drawCurve === 'function') drawCurve();
    syncSingers();
    syncBlockSelection();
    renderLayerList();
  }

  /* ---------------- 预置歌手 ---------------- */
  function buildSingerGrid() {
    var box = $('#singerGrid');
    if (!box) return;
    box.innerHTML = '';
    NSG.PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'singer';
      b.dataset.id = p.preset;
      b.title = presetTip(p);
      var nb = document.createElement('b'); nb.textContent = tPresetName(p);
      var ni = document.createElement('i'); ni.textContent = p.height + 'cm';
      b.appendChild(nb); b.appendChild(ni);
      b.addEventListener('click', function () { loadSinger(p.preset); });
      box.appendChild(b);
    });
  }

  /* 悬停提示：一句音色描述 + 这个嗓子的建议音域 */
  function presetTip(p) {
    var desc = tPresetDesc(p);
    if (p.range) {
      return t('presets.tipRange', {
        desc: desc,
        lo: noteName(p.range[0]),
        hi: noteName(p.range[1])
      }, desc + '（建议音域 ' + noteName(p.range[0]) + ' – ' + noteName(p.range[1]) + '）');
    }
    return desc;
  }
  function noteName(m) {
    return KEY_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  /* 高亮当前歌手；改过滑杆的加 * ，表示已不是原样 */
  function syncSingers() {
    var box = $('#singerGrid');
    if (!box || typeof box.querySelectorAll !== 'function') return;
    var cur = state.timbre.preset;
    $$('.singer', box).forEach(function (b) {
      var on = b.dataset.id === cur;
      b.classList.toggle('on', on);
      b.classList.toggle('mod', on && state.presetDirty);
      b.title = presetTip(NSG.presetById(b.dataset.id) || {});
    });
  }

  /* 切换歌手时明确不动的：乐谱、速度、语种、混音推子。只有音色参数被换掉 */
  function loadSinger(id) {
    var p = NSG.presetById(id);
    if (!p) return;
    state.timbre = NSG.presetTimbre(id);
    state.presetDirty = false;
    state.harmHi = null;
    state.dirty = true;
    applyTimbreToUI();
    renderAndAnalyze(200);
    setStatus(t('ui.singerStatus', {
      name: tPresetName(p),
      height: p.height,
      desc: tPresetDesc(p)
    }, '歌手：' + p.name + '（' + p.height + 'cm）· ' + (p.desc || '')));
  }

  /* 任何一次参数改动都把歌手标成「已修改」，避免看起来还是原样 */
  function markEdited() {
    var sel = $('#blockSel');
    if (sel) sel.value = '';
    var tr = activeVocalTrack();
    if (state.timbre.preset && !state.presetDirty) {
      state.presetDirty = true;
      if (tr) tr.presetDirty = true;
      syncSingers();
    }
    if (tr) tr.timbre = state.timbre;
  }

  function syncBlockSelection() {
    var sel = $('#blockSel');
    if (!sel || !sel.options) return;
    var name = '';
    if (!state.timbre.preset) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === state.timbre.name) { name = state.timbre.name; break; }
      }
    }
    sel.value = name;
  }

  function refreshBlockList() {
    var sel = $('#blockSel');
    if (!sel) return;
    var all = NSG.listTimbres();
    sel.innerHTML = '';
    var hint = document.createElement('option');
    hint.value = '';
    hint.textContent = all.length ? t('left.blockSelectHint', null, '（选择音色块以应用）') : t('left.blockEmptyHint', null, '（暂无自定义音色块）');
    hint.disabled = true;
    sel.appendChild(hint);
    sel.onchange = null;
    if (!all.length) {
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    all.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.name; o.textContent = t.name + ' · ' + t.height + 'cm';
      sel.appendChild(o);
    });
    syncBlockSelection();
    sel.onchange = function () {
      var sel2 = this;
      var item = all.filter(function (x) { return x.name === sel2.value; })[0];
      if (item) {
        state.timbre = NSG.cloneTimbre(item);
        state.presetDirty = false;
        state.harmHi = null;
        state.dirty = true;
        applyTimbreToUI();
        renderAndAnalyze(200);
        setStatus(t('ui.blockLoaded', { name: item.name }, '已载入音色块：' + item.name));
      }
    };
  }

  function saveBlock() {
    var curName = state.timbre.preset ? tPresetName(state.timbre) : state.timbre.name;
    askText(t('ui.saveBlockTitle', null, '保存音色块'), t('ui.saveBlockLabel', null, '名称'), curName + ' ' + state.timbre.height + 'cm', function (name) {
      if (!name || !name.trim()) return;
      var nm = name.trim();
      /* 预置歌手只读：同名保存改为另存副本，不覆盖预置 */
      var renamed = false;
      if (NSG.presetByName(nm)) { nm += t('ui.saveBlockCopySuffix', null, ' 副本'); renamed = true; }
      state.timbre.name = nm;
      delete state.timbre.preset;          // 存成自己的块之后，就不再是预置歌手
      state.presetDirty = false;
      var tr = activeVocalTrack();
      if (tr) { tr.timbre = state.timbre; tr.presetDirty = false; }
      NSG.saveTimbre(state.timbre);
      refreshBlockList();
      syncSingers();
      renderLayerList();
      setStatus(t('ui.saveBlockDone', {
        name: nm,
        note: renamed ? t('ui.saveBlockRenamed', null, '（与预置歌手同名，已存为副本）') : ''
      }, '音色块已保存：' + nm + (renamed ? '（与预置歌手同名，已存为副本）' : '')));
    });
  }
  function delBlock() {
    var name = $('#blockSel').value;
    if (!name) { setStatus(t('ui.delBlockNone', null, '没有可删除的自定义音色块')); return; }
    if (!confirm(t('ui.delBlockConfirm', { name: name }, '删除音色块「' + name + '」？'))) return;
    NSG.deleteTimbre(name);
    refreshBlockList();
    setStatus(t('ui.delBlockDone', { name: name }, '已删除音色块：' + name));
  }

  /* ---------------- 乐谱 ---------------- */
  var noteIdSequence = 0;
  // 批量导入常在同一毫秒内完成，随机短后缀会碰撞，使 PIT 按 id 取到别的音符。
  function uid() { return 'n' + Date.now().toString(36) + '-' + (++noteIdSequence).toString(36); }
  /* 归一化导入/生成的音符。注意 inst 必须原样保留 ——
     旧版在这里把它丢了，于是贝斯、琶音、鼓全都退回成 pad，
     自动编曲听上去就是一片糊住的铺底。 */
  function normNotes(list) {
    return (list || []).map(function (n) {
      var o = {
        id: uid(), start: Math.max(0, n.start), dur: Math.max(n.inst ? 0.001 : 0.0625, n.dur),
        pitch: Math.round(n.pitch), lyric: n.lyric || 'a', vel: n.vel || 96,
        vib: n.vib === undefined ? 0.5 : n.vib, pb: NSG.TUNING.points(n.pb), phones: n.phones || null
      };
      if (n.vibrato) o.vibrato = NSG.TUNING.vibrato(n.vibrato);
      if (Number.isFinite(n.gain)) o.gain = NSG.TUNING.clamp(n.gain, 0, 16);
      if (n.effortPoints) o.effortPoints = NSG.TUNING.effortPoints(n.effortPoints);
      if (n.gainPoints) o.gainPoints = NSG.TUNING.gainPoints(n.gainPoints);
      if (n.dscSource) o.dscSource = Object.assign({}, n.dscSource);
      if (Array.isArray(n.noteEq) && (n.noteEq.length === 48 || n.noteEq.length === 64) && n.noteEq.every(Number.isFinite)) o.noteEq = n.noteEq.slice();
      if (Number.isFinite(n.noteEqRoot)) o.noteEqRoot = n.noteEqRoot;
      // 旧工程的辅音长度 % 换算成辅音速度保存。
      if (n.consonantSpeed != null) o.consonantSpeed = NSG.TUNING.consonantSpeed(n.consonantSpeed);
      else if (n.consonantLength != null) o.consonantSpeed = NSG.TUNING.speedFromLength(n.consonantLength);
      if (Number.isFinite(n.pan)) o.pan = NSG.TUNING.clamp(n.pan, -1, 1);
      if (n.pitchPoints) o.pitchPoints = NSG.TUNING.junctionPoints(n.pitchPoints);
      if (n.pitchJoin === false) o.pitchJoin = false;
      if (n._pitchFit) o._pitchFit = Object.assign({}, n._pitchFit);
      if (n.rest) o.rest = true;
      if (n.lang) o.lang = n.lang;
      if (n.noteLang) o.noteLang = n.noteLang;
      if (n.langSource) o.langSource = n.langSource;
      if (n.phonesLang) o.phonesLang = n.phonesLang;
      if (n.phonesSource) o.phonesSource = n.phonesSource;
      if (n.phonemeTiming) o.phonemeTiming = JSON.parse(JSON.stringify(n.phonemeTiming));
      if (n.phonemeWordJoin !== undefined) o.phonemeWordJoin = n.phonemeWordJoin;
      if (n.wordJoinDirection) o.wordJoinDirection = n.wordJoinDirection;
      if (n.ignorePhoneticHint) o.ignorePhoneticHint = true;
      if (n.lyricGroup) o.lyricGroup = n.lyricGroup;
      if (n.slurLyric) o.slurLyric = n.slurLyric;
      if (n.slurPhones) o.slurPhones = n.slurPhones.slice();
      if (n.inst) o.inst = n.inst;
      if (n.inst && ['bass', 'left', 'pad', 'comp', 'arp', 'strings', 'brass', 'fill'].indexOf(n.arrangePart) >= 0) o.arrangePart = n.arrangePart;
      if (n.role === 'fill') o.role = 'fill';
      ['midiProgram', 'midiChannel', 'midiBankMSB', 'midiBankLSB'].forEach(function (field) {
        if (Number.isInteger(n[field])) o[field] = n[field];
      });
      if (n.midiPart) o.midiPart = n.midiPart;
      if (n.role === 'melodySample') {
        o.role = n.role; o.sampleSource = n.sampleSource;
        if (n.sampleMode) o.sampleMode = n.sampleMode;
        if (Number.isFinite(n.sampleDelay)) o.sampleDelay = n.sampleDelay;
      }
      if (n.role === 'instrumentalLead') {
        o.role = n.role; o.leadMode = n.leadMode; o.leadSection = n.leadSection;
        if (Number.isFinite(n.sampleSource)) o.sampleSource = n.sampleSource;
      }
      if (n.chipTones) o.chipTones = n.chipTones.slice();
      if (n.chipDrum) o.chipDrum = n.chipDrum;
      if (Number.isFinite(n.harmonyEnd) && n.harmonyEnd > o.start) {
        o.harmonyEnd = n.harmonyEnd; o.dur = Math.min(o.dur, n.harmonyEnd - o.start);
      }
      if (n.eye) o.eye = n.eye;
      if (n.composeSection) o.composeSection = n.composeSection;
      if (n.velPan) o.velPan = n.velPan;
      if (n.slur) o.slur = true;            // 延音符：只延长上一个元音，不重发辅音
      if (n.wordJoin) o.wordJoin = true;    // 英语拆词：与上一个音符同属一个词
      return o;
    });
  }

  function newProject() {
    stopPlay(true);
    importRequest++;
    state.score = blankScore();
    state.activeTrackIndex = 0;
    state.score.tracks[0].lang = state.score.lang;
    state.score.tracks[0].vol = 1;
    state.score.tracks[0].pan = 0;
    state.score.tracks[0].timbre = state.timbre;
    state.score.tracks[0].presetDirty = state.presetDirty;
    state.title = '';
    state.hd = false;
    state.hifiWaveguide = 1;
    state.hifiHighPolish = 1;
    syncQuality();
    state.tm = null;
    state.pcm = state.vox = state.voxAudio = state.acc = state.accPcm = state.accAudio = null;
    state.voxKey = state.accKey = null;
    state.voxPeak = state.accPeak = 0;
    state.voxEnv = state.accEnv = state.spectrumGrid = state.harmonics = null;
    state.harmHi = null;
    state.dirty = true;
    syncActiveTrackToUI();
    roll.setNotes(state.score.tracks[0].notes, { pit: [] });
    syncRollTracks({ skipSetNotes: true });
    $('#tempo').value = state.score.tempo;
    $('#langSel').value = state.score.lang;
    $('#lyrBox').value = '';
    fillKeySel();
    syncRollTempos();
    updateStat();
    syncInspector();
    syncCursor();
    updateMix();
    setTool('select', true);
    renderAndAnalyze(0);
    setStatus(t('ui.newProjDone', null, '已新建空白工程'));
  }

  function loadDemo(silent) {
    // Clone the bundled project so edits never change the next demo load.
    var p = NSG.IO.loadProject(JSON.stringify(NSG.DEMO_PROJECT));
    stopPlay(true);
    importRequest++;
    state.score = p.score;
    enforceSingleAccompTrack(state.score);
    state.activeTrackIndex = vocalTrackIndices(state.score)[0] || 0;
    state.title = t('ui.demoTitle', null, '小草');
    var baseTimbre = NSG.migrateTimbre(p.timbre);
    (state.score.tracks || []).forEach(function (tr) {
      if (!isVocalTrack(tr)) return;
      tr.timbre = tr.timbre ? NSG.migrateTimbre(tr.timbre) : NSG.cloneTimbre(baseTimbre);
      if (!tr.lang && state.score.lang) tr.lang = state.score.lang;
      if (tr.phonemizer === undefined && state.score.phonemizer !== undefined) tr.phonemizer = state.score.phonemizer;
      if (typeof tr.vol !== 'number' || !isFinite(tr.vol)) tr.vol = 1;
      if (typeof tr.pan !== 'number' || !isFinite(tr.pan)) tr.pan = 0;
    });
    state.timbre = activeVocalTrack().timbre || baseTimbre;
    state.presetDirty = false;
    state.harmHi = null;
    state.hd = !!p.mix.hd;
    state.hifiWaveguide = normHifiAmount(p.mix && p.mix.hifiWaveguide, 1);
    state.hifiHighPolish = normHifiAmount(p.mix && p.mix.hifiHighPolish, 1);
    state.loveReverb = !!p.mix.loveReverb;
    state.volVox = p.mix.volVox;
    state.volAcc = p.mix.volAcc;
    state.muteVox = !!p.mix.muteVox;
    state.muteAcc = !!p.mix.muteAcc;
    state.tm = null;
    state.pcm = state.vox = state.voxAudio = state.acc = state.accPcm = state.accAudio = null;
    state.voxKey = state.accKey = null;
    state.voxPeak = state.accPeak = 0;
    state.voxEnv = state.accEnv = state.spectrumGrid = state.harmonics = null;
    syncQuality();
    updateMix();
    syncActiveTrackToUI();
    roll.setNotes(activeVocalTrack().notes, { pit: activeVocalTrack().pit || [] });
    syncRollTracks({ skipSetNotes: true });
    roll.scrollBeat = 0;
    $('#tempo').value = state.score.tempo;
    $('#langSel').value = roll.phonemizer || roll.lang;
    $('#lyrBox').value = '';
    fillKeySel();
    syncRollTempos();
    setTool('select', true);
    updateStat();
    syncInspector();
    syncCursor();
    state.dirty = true;
    if (!silent) { renderAndAnalyze(60); setStatus(t('ui.demoLoaded', null, '已载入示例乐谱：小草')); }
  }
  /* 调性：主音 MIDI 60–71 对应 C…B，与「自动谱曲」共用 state.score.root */
  var KEY_NAMES = ['C', 'bD', 'D', 'bE', 'E', 'F', '#F', 'G', 'bA', 'A', 'bB', 'B'];
  function keyName(midi) { return KEY_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
  function keyOptionsHtml() {
    var h = '';
    for (var i = 0; i < 12; i++) {
      h += '<option value="' + (60 + i) + '">' + KEY_NAMES[i] + '</option>';
    }
    return h;
  }
  function fillKeySel() {
    var sel = $('#keySel');
    if (!sel) return;
    sel.innerHTML = keyOptionsHtml();
    sel.value = String(state.score.root || 60);
  }
  function scaleOptionsHtml() {
    var groups = (NSG.COMPOSE && NSG.COMPOSE.SCALE_GROUPS) || [];
    var list = (NSG.COMPOSE && NSG.COMPOSE.SCALE_LIST) || [];
    var esc = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    };
    if (!groups.length || !list.length) {
      return '<option value="penta">' + esc(t('scale.penta', null, '五声（宫调）')) + '</option>';
    }
    return groups.map(function (g) {
      var items = list.filter(function (item) { return item.group === g.id; });
      if (!items.length) return '';
      var label = esc(t('scaleGroup.' + g.id, null, g.name));
      var opts = items.map(function (item) {
        return '<option value="' + esc(item.id) + '">' + esc(t('scale.' + item.id, null, item.name)) + '</option>';
      }).join('');
      return '<optgroup label="' + label + '">' + opts + '</optgroup>';
    }).join('');
  }
  function fillScaleSel() {
    var sel = $('#scaleSel');
    if (!sel) return;
    var cur = sel.value || 'penta';
    sel.innerHTML = scaleOptionsHtml();
    sel.value = (NSG.COMPOSE && NSG.COMPOSE.SCALES && NSG.COMPOSE.SCALES[cur]) ? cur : 'penta';
  }

  /* ---------------- 分段速度 ---------------- */
  function applyTempos(list) {
    NSG.TEMPO.apply(state.score, list);
    state.tm = null;                 // 播放换算表要重建
    state.dirty = true;
    var tp = $('#tempo');
    if (tp) tp.value = Math.round(state.score.tempo * 100) / 100;
    syncRollTempos();
    renderAndAnalyze(420);
  }

  /* 卷帘上标出速度变化点 */
  function syncRollTempos() {
    if (!roll) return;
    roll.tempos = NSG.TEMPO.list(state.score);
    var btn = $('#tempoSeg');
    if (btn) {
      var n = roll.tempos.length;
      btn.textContent = n > 1 ? t('transport.tempoMapCount', { n: n }, '分段 ' + n) : t('transport.tempoMap', null, '分段…');
      btn.classList.toggle('on', n > 1);
      btn.title = n > 1
        ? t('transport.tempoMapTip', {
          n: n,
          list: roll.tempos.map(function (seg) {
            return t('transport.tempoMapBarItem', { bar: NSG.TEMPO.beatToBar(seg.beat), bpm: seg.bpm },
              '第' + NSG.TEMPO.beatToBar(seg.beat) + '小节 ' + seg.bpm);
          }).join(' / ')
        }, '全曲 ' + n + ' 段速度：' + roll.tempos.map(function (t) {
          return '第' + NSG.TEMPO.beatToBar(t.beat) + '小节 ' + t.bpm;
        }).join(' / '))
        : t('transport.tempoMapTitle', null, '分段速度（Tempo Map）');
    }
    roll.draw();
  }

  function openTempo() {
    var list = NSG.TEMPO.list(state.score);
    var body =
      '<p class="eyehint">' + t('tempo.hint', null, '长歌常常前慢后快、或者副歌提速。这里按「第几拍」放速度点：第 0 段是全曲基准，改它等于改工具条上的 BPM 框。位置可以直接改成小节数（4/4 拍）。') + '</p>' +
      '<div id="tsegList"></div>' +
      '<div class="row2"><button class="abtn" id="tAdd">' + t('tempo.addBtn', null, '在播放头（或当前位置）加一段') + '</button></div>';
    var m = modal(t('tempo.title', null, '分段速度（Tempo Map）'), body, '<button class="abtn" id="tOk">' + t('common.done', null, '完成') + '</button>');
    var box = $('#tsegList', m.el);

    function render() {
      box.innerHTML = '';
      list.forEach(function (seg, i) {
        var row = document.createElement('div');
        row.className = 'row2 tseg';
        var barLab = document.createElement('span');
        barLab.className = 'lb';
        barLab.style.width = '74px';
        barLab.textContent = t('tempo.barLabel', { bar: NSG.TEMPO.beatToBar(seg.beat) }, '第 ' + NSG.TEMPO.beatToBar(seg.beat) + ' 小节');
        var beatIn = document.createElement('input');
        beatIn.type = 'number'; beatIn.className = 'numin tbar'; beatIn.style.width = '74px';
        beatIn.min = '0'; beatIn.step = '0.25'; beatIn.value = Math.round(seg.beat * 100) / 100;
        beatIn.title = t('tempo.beatTitle', null, '这一段的起始拍（0 = 全曲开头）');
        var bpmIn = document.createElement('input');
        bpmIn.type = 'number'; bpmIn.className = 'numin tbpm'; bpmIn.style.width = '70px';
        bpmIn.min = '20'; bpmIn.max = '400'; bpmIn.step = '1'; bpmIn.value = seg.bpm;
        var del = document.createElement('button');
        del.className = 'abtn tdel'; del.textContent = t('tempo.delBtn', null, '删');
        del.disabled = i === 0;
        del.title = i === 0 ? t('tempo.delRootTitle', null, '第 0 段是基准速度，不能删') : t('tempo.delSegTitle', null, '删掉这一段');

        function commit() {
          var nb = Math.max(0, parseFloat(beatIn.value) || 0);
          var nv = Math.max(20, Math.min(400, parseFloat(bpmIn.value) || seg.bpm));
          list[i] = { beat: i === 0 ? 0 : nb, bpm: nv };
          applyTempos(list.slice());
          list = NSG.TEMPO.list(state.score);
          render();
        }
        beatIn.addEventListener('change', commit);
        bpmIn.addEventListener('change', commit);
        del.onclick = function () {
          if (i === 0) return;
          list.splice(i, 1);
          applyTempos(list.slice());
          list = NSG.TEMPO.list(state.score);
          render();
          setStatus(t('tempo.deleted', { n: list.length }, '已删掉一段速度，还剩 ' + list.length + ' 段'));
        };
        row.appendChild(barLab); row.appendChild(beatIn);
        row.appendChild(document.createTextNode(t('tempo.beatUnit', null, ' 拍 ')));
        row.appendChild(bpmIn);
        row.appendChild(document.createTextNode(' BPM '));
        row.appendChild(del);
        box.appendChild(row);
      });
      if (list.length > 1) {
        var info = document.createElement('p');
        info.className = 'eyehint';
        info.textContent = t('tempo.summary', { n: list.length }, '共 ' + list.length + ' 段。总长会随速度变化，导出 WAV 与播放都按这张表走。');
        box.appendChild(info);
      }
    }

    $('#tAdd', m.el).onclick = function () {
      var at = state.playing ? roll.playPos : roll.scrollBeat + 4;
      at = Math.max(0, Math.round(at * 4) / 4);
      var cur = NSG.TEMPO.map(state.score).bpmAt(at);
      list.push({ beat: at, bpm: cur });
      applyTempos(list);
      list = NSG.TEMPO.list(state.score);
      render();
      setStatus(t('tempo.added', { beat: at, bpm: cur }, '已在第 ' + at + ' 拍加一段速度（' + cur + ' BPM），改它的数值即可'));
    };
    $('#tOk', m.el).onclick = function () {
      m.close();
      setStatus(t('tempo.done', { n: list.length }, '分段速度：' + list.length + ' 段'));
    };
    render();
  }

  /* 按歌词铺音符：接在序列末尾，不再覆盖已有音符。
     每个音节一个四分音符，音高在所选调性/音阶上走一个拱形（主音 → 高八度 → 主音）。 */
  function lyricToNotes() {
    var txt = $('#lyrBox').value.trim();
    if (!txt) { alert(t('ui.lyricToNotesEmpty', null, '请先在左侧输入歌词')); return; }
    var syl = NSG.g2p(txt, state.score.lang);
    if (!syl.length) { alert(t('ui.lyricToNotesNoSyl', null, '没有解析出音节')); return; }

    var trk = activeVocalTrack();
    var old = trk.notes || [];
    var end = 0;
    for (var i = 0; i < old.length; i++) end = Math.max(end, old[i].start + old[i].dur);
    var at = Math.max(0, Math.ceil(end - 1e-6));      // 接在最后一个音之后，落在整拍上

    var SC = NSG.COMPOSE.SCALES;
    var degs = SC[$('#scaleSel').value] || SC.penta;
    var tonic = (state.score.root || 60) + (+$('#octSel').value);
    /* 拱顶：短句收着（三度～四度），长句才铺开到八度，避免两三个字就跳一个八度 */
    var n = syl.length;
    var apex = Math.max(3, Math.min(degs.length, Math.round(n / 2)));
    var add = syl.map(function (s, k) {
      var t = n > 1 ? k / (n - 1) : 0;
      var step = Math.round(apex * Math.sin(Math.PI * t));
      if (n === 2 && k === 1) step = apex;             // 两个字时给一个明确的落点
      return {
        start: at + k, dur: 1,
        pitch: NSG.COMPOSE.degToMidi(tonic, degs, step),
        lyric: s.text, phones: s.phones, phonesSource: state.score.lang === 'zh' ? 'auto' : undefined, vel: 96, vib: 0.5
      };
    });

    trk.notes = old.concat(normNotes(add));
    var visBeats = (roll.w - roll.kbW) / roll.pxBeat;
    if (typeof roll._emit === 'function') {
      roll.notes = trk.notes;
      roll.sel = {};
      if (at > roll.scrollBeat + visBeats * 0.75) {
        roll.scrollBeat = Math.max(0, at - visBeats * 0.2);
      }
      if (typeof roll.centerOn === 'function') roll.centerOn();
      roll._emit();
    } else {
      roll.setNotes(trk.notes, {
        pit: trk.pit,
        undoStack: roll.undoStack,
        redoStack: [],
        preserveView: true
      });
      if (at > roll.scrollBeat + visBeats * 0.75) {
        roll.scrollBeat = Math.max(0, at - visBeats * 0.2);
        roll.draw();
      }
    }
    updateStat(); state.dirty = true;
    renderAndAnalyze(60);
    setStatus(old.length
      ? t('ui.lyricToNotesAppend', { n: add.length, beat: at, key: keyName(tonic) }, '已在末尾追加 ' + add.length + ' 个音符（第 ' + at + ' 拍起，' + keyName(tonic) + '）')
      : t('ui.lyricToNotesNew', { n: add.length, key: keyName(tonic) }, '已按歌词铺 ' + add.length + ' 个音符（第 0 拍起，' + keyName(tonic) + '）'));
  }

  /* ---------------- 渲染 ---------------- */
  var renderTimer = 0, renderer = null;
  var playRequest = 0, playPending = false;
  function getRenderer() {
    if (renderer) return renderer;
    renderer = NSG.Renderer.create();
    ['vocal', 'accomp', 'compute', 'extract'].forEach(function (name) {
      var method = renderer[name];
      if (!method) return;
      renderer[name] = function () {
        var args = arguments;
        return processingTask(function () { return method.apply(renderer, args); });
      };
    });
    return renderer;
  }
  function normHifiAmount(v, fallback) {
    if (v === false || v === 'off') return 0;
    if (v === 'light') return 0.5;
    if (v === true || v === 'strong') return 1;
    if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.min(1, v));
    return fallback === undefined ? 1 : fallback;
  }
  function projectKey() {
    var base = [state.score, state.timbre, state.rawSrc, state.hd];
    if (state.hifiWaveguide !== 1 || state.hifiHighPolish !== 1) {
      base.push(state.hifiWaveguide, state.hifiHighPolish);
    }
    return JSON.stringify(base);
  }
  function syncQuality() {
    state.hifiWaveguide = normHifiAmount(state.hifiWaveguide, 1);
    state.hifiHighPolish = normHifiAmount(state.hifiHighPolish, 1);
    $('#hdVoice').classList.toggle('active', state.hd);
    $('#hdVoice').setAttribute('aria-pressed', String(state.hd));
    var hifiBox = $('#hifiControls');
    if (hifiBox) hifiBox.hidden = !state.hd;
    var sWg = $('#sWaveguide'), vWg = $('#vWaveguide');
    if (sWg) sWg.value = state.hifiWaveguide;
    if (vWg) vWg.textContent = Math.round(state.hifiWaveguide * 100) + '%';
    var sHp = $('#sHighPolish'), vHp = $('#vHighPolish');
    if (sHp) sHp.value = state.hifiHighPolish;
    if (vHp) vHp.textContent = Math.round(state.hifiHighPolish * 100) + '%';
    $('#audioQuality').textContent = t('status.quality', {
      vox: state.hd ? t('status.quality48k', null, '48kHz 模式B') : t('status.quality16k', null, '16kHz')
    }, '人声 ' + (state.hd ? '48kHz 模式B' : '16kHz') + ' 单声道 · 伴奏 48kHz 立体声');
  }
  function dialogOpen(m) { return !m.isOpen || m.isOpen(); }
  function installNotes(notes, pit) {
    roll.notes.forEach(function (note, index) {
      Object.keys(note).forEach(function (key) { delete note[key]; });
      Object.assign(note, notes[index]);
    });
    if (pit !== undefined) {
      var cleanPit = pit && pit.length && NSG.TUNING && NSG.TUNING.pitPoints ? NSG.TUNING.pitPoints(pit) : [];
      var trk = activeVocalTrack();
      if (trk) {
        if (cleanPit.length) trk.pit = cleanPit;
        else delete trk.pit;
      }
      if (typeof roll.setPit === 'function') roll.setPit(cleanPit);
      else roll.pit = cleanPit;
    }
  }
  window.addEventListener('beforeunload', function () { if (renderer) renderer.close(); });
  function vocalAudio() {
    if (!state.vox) return null;
    return state.voxAudio || { channels: [state.vox], sr: state.voxSr || 16000 };
  }
  function isAcousticOpen() {
    var det = $('.acoustic-inspector');
    return !!(det && det.open);
  }
  async function ensureAcousticAnalysis() {
    if (!isAcousticOpen() || !state.vox || !state.vox.length) return;
    if (state.spectrumGrid) { drawGrid(); drawHarm(); return; }
    var targetPcm = state.vox, targetSr = state.voxSr || 16000;
    var tracks = (state.score && state.score.tracks) || [];
    var vTrk = tracks.find(function (tr) { return tr && tr.type === 'vocal' && !tr.muted && tr.notes && tr.notes.length; }) ||
      tracks.find(function (tr) { return tr && tr.type === 'vocal'; }) || tracks[0];
    var vNotes = (vTrk && vTrk.notes) || [];
    var f0 = vNotes.length ? NSG.mtof(vNotes[Math.min(vNotes.length - 1, Math.floor(vNotes.length * 0.4))].pitch) : 0;
    try {
      var res = await getRenderer().compute('analyzeVocal', { pcm: targetPcm, sr: targetSr, f0: f0 });
      if (state.vox !== targetPcm) return;
      state.spectrumGrid = res.grid;
      state.harmonics = res.harmonics;
      if (isAcousticOpen()) { drawGrid(); drawHarm(); }
    } catch (e) { }
  }
  function currentVocalKey() {
    return NSG.Renderer.vocalKey(state.score, state.timbre, state.rawSrc, state.hd, state.hifiWaveguide, state.hifiHighPolish);
  }
  async function renderNow() {
    var key = currentVocalKey();
    var rClient = getRenderer();
    rClient.includeAnalysis = isAcousticOpen();
    var r = await rClient.vocal(state.score, state.timbre, state.rawSrc, state.hd, state.hifiWaveguide, state.hifiHighPolish);
    // Editing remains possible during rendering. Never install audio for an old score.
    if (key !== currentVocalKey()) return false;
    state.vox = r.pcm;
    state.voxSr = r.sr;
    state.voxAudio = r.channels && r.channels.length ? { channels: r.channels, sr: r.sr } : { channels: [r.pcm], sr: r.sr };
    state.pcm = r.pcm;
    state.voxPeak = r.peak;
    state.voxEnv = r.env;
    state.spectrumGrid = r.grid; state.harmonics = r.harmonics;
    state.voxKey = key;
    state.dirty = false;
    var dt = Math.round(r.milliseconds);
    var sec = (r.pcm.length / r.sr).toFixed(2);
    var chLabel = r.channels && r.channels.length === 2 ? t('status.stereo', null, '立体声') : t('status.mono', null, '单声道');
    $('#renderInfo').textContent = t('status.renderInfo', {
      dt: dt,
      sec: sec,
      sr: r.sr,
      ch: chLabel,
      modeB: state.hd ? t('status.modeBTag', null, ' · 模式B') : ''
    }, '渲染 ' + dt + 'ms · ' + sec + 's · ' + r.sr + 'Hz ' + chLabel + (state.hd ? ' · 模式B' : ''));
    return true;
  }
  async function ensureRendered() {
    while (!state.vox || state.dirty || state.voxKey !== currentVocalKey()) {
      try { await renderNow(); } catch (e) { if (e.name !== 'AbortError' || getRenderer().closed) throw e; }
    }
  }
  async function ensureAudio(includeAcc) {
    // A tempo/project change while either track is rendering must refresh both.
    for (;;) {
      await Promise.all([ensureRendered(), includeAcc ? ensureAcc() : Promise.resolve()]);
      if (state.voxKey === currentVocalKey() && !state.dirty &&
          (!includeAcc || state.accKey === NSG.Renderer.accompKey(state.score))) return;
    }
  }
  function renderAndAnalyze(delay) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(async function () {
      try {
        if (!await renderNow()) return;
        if (isAcousticOpen()) {
          drawCurve();
          if (state.spectrumGrid) { drawGrid(); drawHarm(); }
          else ensureAcousticAnalysis();
        }
        await ensureAcc(); updateMix();
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(e);
        setStatus(t('ui.renderFail', { msg: tMsg(e.message) }, '渲染失败：' + e.message));
      }
    }, delay || 0);
  }

  /* ---------------- 混音台 ---------------- */
  function voxGain() { return state.muteVox ? 0 : state.volVox; }
  function accGain() { return state.muteAcc ? 0 : state.volAcc; }

  /* 每 20ms 一块的峰值包络，供电平表在播放时逐帧读取 */

  /* 人声/音色编辑不影响伴奏；速度和伴奏音符参与独立缓存键。 */
  async function ensureAcc() {
    for (;;) {
      var key = NSG.Renderer.accompKey(state.score);
      if (state.accKey === key && state.accAudio) return state.accPcm;
      var r;
      try { r = await getRenderer().accomp(state.score); }
      catch (e) { if (e.name === 'AbortError' && !getRenderer().closed) continue; throw e; }
      if (key !== NSG.Renderer.accompKey(state.score)) continue;
      state.accAudio = r.audio;
      state.accPcm = r.audio ? r.audio.pcm : null;
      state.accPeak = r.peak; state.accEnv = r.env; state.accKey = key;
      return state.accPcm;
    }
  }

  function accompanimentAudio() {
    // Legacy PCM is accepted for old callers; newly rendered tracks carry their rate and channels.
    if (!state.accPcm) return null;
    return state.accAudio || { channels: [state.accPcm], sr: 16000 };
  }

  var audioBufferCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function audioBuffer(ctx, audio) {
    var ch0 = audio && audio.channels && audio.channels[0];
    var ch1 = audio && audio.channels && audio.channels.length > 1 ? audio.channels[1] : null;
    if (audioBufferCache && ch0 && typeof ch0 === 'object') {
      var hit = audioBufferCache.get(ch0);
      if (hit && hit.ctx === ctx && hit.ch1 === ch1 && hit.sr === audio.sr && hit.nCh === audio.channels.length) {
        return hit.buffer;
      }
    }
    var buffer = ctx.createBuffer(audio.channels.length, audio.channels[0].length, audio.sr);
    audio.channels.forEach(function (channel, c) { buffer.copyToChannel(channel, c); });
    if (audioBufferCache && ch0 && typeof ch0 === 'object') {
      audioBufferCache.set(ch0, { ctx: ctx, ch1: ch1, sr: audio.sr, nCh: audio.channels.length, buffer: buffer });
    }
    return buffer;
  }

  function setLeds(el, peak, gain) {
    if (!el) return;
    var v = peak * gain;
    var db = 20 * Math.log10(Math.max(1e-5, v));
    var th = [-42, -30, -20, -12, -6];
    var on = 0;
    for (var i = 0; i < th.length; i++) if (db >= th[i]) on = i + 1;
    // 播放时每帧都会调用：灯数没变就不碰 DOM
    var sig = on + (v > 0.96 ? 'c' : '');
    if (el._ledSig === sig) return;
    el._ledSig = sig;
    for (var j = 0; j < el.children.length; j++) {
      if (j < on) el.children[j].classList.add('on');
      else el.children[j].classList.remove('on');
    }
    if (v > 0.96) el.classList.add('clip'); else el.classList.remove('clip');
  }

  function updateMetersAt(sec) {
    var blk = 0.02;
    var idx = Math.floor(sec / blk), vm = 0, am = 0;
    for (var d = 0; d < 3; d++) {
      var j = idx - d;
      if (state.voxEnv && j >= 0 && j < state.voxEnv.length && state.voxEnv[j] > vm) vm = state.voxEnv[j];
      if (state.accEnv && j >= 0 && j < state.accEnv.length && state.accEnv[j] > am) am = state.accEnv[j];
    }
    setLeds($('#lVox'), vm, voxGain());
    setLeds($('#lAcc'), am, accGain());
  }

  /* 播放中才把伴奏拉起来：现挂一路源，从当前位置切入，不用重播 */
  async function startAccLive() {
    if (!state.playing || state.gainAcc || !state.master) return;
    if (accGain() <= 0) return;
    var session = state.src, accPcm;
    try { accPcm = await ensureAcc(); }
    catch (e) { setStatus(t('ui.accompRenderFail', { msg: tMsg(e.message) }, '伴奏渲染失败：' + e.message)); return; }
    if (!state.playing || state.src !== session || state.gainAcc || !state.master || accGain() <= 0) return;
    if (!accPcm || !accPcm.length) return;
    var ctx = state.ctx;
    var ba = audioBuffer(ctx, accompanimentAudio());
    var off = Math.max(0, ctx.currentTime - state.playStart);
    if (off > ba.duration - 0.05) return;
    var ga = ctx.createGain();
    ga.gain.value = 0;
    rampGain(ga.gain, accGain(), 0.008);
    ga.connect(state.master);
    var sa = ctx.createBufferSource();
    sa.buffer = ba; sa.connect(ga);
    sa.start(0, off);
    state.gainAcc = ga;
    if (state.srcs) state.srcs.push(sa);
    state.playAccDuration = ba.duration;
    if (ba.duration > state.playDuration) {
      state.playDuration = ba.duration;
      var session = state.src;
      state.srcs.forEach(function (source) { source.onended = null; });
      sa.onended = function () {
        if (state.playing && state.src === session && ctx.currentTime - state.playStart >= state.playDuration - 0.02) stopPlay();
      };
    }
  }

  function applyLive() {
    if (state.gainVox) rampGain(state.gainVox.gain, voxGain(), 0.010);
    if (state.gainAcc) rampGain(state.gainAcc.gain, accGain(), 0.010);
  }

  var reverbOffTimer = null, reverbOffToken = 0;
  function clearReverbOffTimer() {
    reverbOffToken++;
    if (reverbOffTimer) {
      if (typeof clearTimeout === 'function') clearTimeout(reverbOffTimer);
      reverbOffTimer = null;
    }
  }
  function applyReverb() {
    clearReverbOffTimer();
    if (state.playing && state.src && !state.reverbReturn && state.loveReverb) {
      state.reverbReturn = NSG.Reverb.connect(state.ctx, state.src, state.gainVox, false);
    }
    if (state.reverbReturn) {
      rampGain(state.reverbReturn.gain.gain, state.loveReverb ? NSG.Reverb.wet : 0, 0.020);
      if (!state.loveReverb) {
        var closingReturn = state.reverbReturn, tok = reverbOffToken;
        reverbOffTimer = setTimeout(function () {
          if (tok !== reverbOffToken) return;
          reverbOffTimer = null;
          if (!state.loveReverb && state.reverbReturn === closingReturn) {
            closingReturn.disconnect();
            state.reverbReturn = null;
          }
        }, 35);
      }
    }
    if (state.playing) state.playDuration = Math.max(state.playVoxDuration + (state.loveReverb ? NSG.Reverb.tail : 0), state.playAccDuration);
  }

  function updateMix() {
    var vv = $('#volVox'), va = $('#volAcc');
    if (!vv || !va) return;
    if (+vv.value !== Math.round(state.volVox * 100)) vv.value = Math.round(state.volVox * 100);
    if (+va.value !== Math.round(state.volAcc * 100)) va.value = Math.round(state.volAcc * 100);
    $('#vvVox').textContent = Math.round(state.volVox * 100) + '%';
    $('#vvAcc').textContent = Math.round(state.volAcc * 100) + '%';
    $('#vvVox').style.opacity = state.muteVox ? '.4' : '1';
    $('#vvAcc').style.opacity = state.muteAcc ? '.4' : '1';
    $('#mVox').classList.toggle('on', !!state.muteVox);
    $('#mAcc').classList.toggle('on', !!state.muteAcc);
    $('#loveReverb').classList.toggle('on', state.loveReverb);
    $('#loveReverb').setAttribute('aria-pressed', String(state.loveReverb));
    setLeds($('#lVox'), state.voxPeak, voxGain());
    setLeds($('#lAcc'), state.accPeak, accGain());
    renderLayerList();
  }

  function bindMixer() {
    var vv = $('#volVox'), va = $('#volAcc');
    if (!vv || !va) return;

    vv.addEventListener('input', function () {
      state.volVox = (+this.value) / 100;
      if (state.volVox > 0 && state.muteVox) state.muteVox = false;
      applyLive(); updateMix();
    });
    va.addEventListener('input', function () {
      state.volAcc = (+this.value) / 100;
      if (state.volAcc > 0 && state.muteAcc) state.muteAcc = false;
      if (state.volAcc > 0) startAccLive();
      applyLive(); updateMix();
    });
    // 双击推子回到出厂平衡
    vv.addEventListener('dblclick', function () {
      state.volVox = 0.56; state.muteVox = false;
      applyLive(); updateMix(); setStatus(t('ui.voxVolReset', null, '人声推子已复位 56%'));
    });
    va.addEventListener('dblclick', function () {
      state.volAcc = 0.75; state.muteAcc = false;
      startAccLive(); applyLive(); updateMix(); setStatus(t('ui.accVolReset', null, '伴奏推子已复位 75%'));
    });
    $('#mVox').addEventListener('click', function () {
      state.muteVox = !state.muteVox;
      applyLive(); updateMix();
      setStatus(state.muteVox ? t('ui.voxMuted', null, '人声已静音') : t('ui.voxUnmuted', { pct: Math.round(state.volVox * 100) }, '人声已恢复 · ' + Math.round(state.volVox * 100) + '%'));
    });
    $('#mAcc').addEventListener('click', function () {
      state.muteAcc = !state.muteAcc;
      if (!state.muteAcc) startAccLive();
      applyLive(); updateMix();
      setStatus(state.muteAcc ? t('ui.accMuted', null, '伴奏已静音') : t('ui.accUnmuted', { pct: Math.round(state.volAcc * 100) }, '伴奏已恢复 · ' + Math.round(state.volAcc * 100) + '%'));
    });
    $('#loveReverb').addEventListener('click', function () {
      state.loveReverb = !state.loveReverb;
      if (state.loveReverb) {
        state.prevVolVox = state.volVox;
        state.volVox = 0.32;
      } else if (typeof state.prevVolVox === 'number' && Math.abs(state.volVox - 0.32) < 1e-4) {
        state.volVox = state.prevVolVox;
        state.prevVolVox = null;
      }
      applyReverb(); applyLive(); updateMix();
      setStatus(state.loveReverb ? t('ui.reverbOn', null, '情歌混响已开启 · 人声音量 32% · 人声导出仍为单声道干声') : t('ui.reverbOff', null, '情歌混响已关闭'));
    });
    $('#panic').addEventListener('click', panicAudio);
    updateMix();
  }

  /* ---------------- 播放 ---------------- */
  async function mixedPcm() {
    var vocal = vocalAudio();
    var accompaniment = accompanimentAudio(), vg = voxGain(), ag = accGain();
    if (vocal && state.loveReverb) vocal = await NSG.Reverb.renderVocal(vocal);
    return NSG.IO.mixAudioAsync(vocal, accompaniment, vg, ag, { resample: 'sinc' });
  }

  function ensureCtx() {
    if (!state.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      state.ctx = new AC();
    }
    if (state.ctx.state === 'suspended') state.ctx.resume();
    return state.ctx;
  }

  function togglePlay() { state.playing || playPending ? stopPlay() : startPlay(); }

  function rampGain(param, target, seconds) {
    var now = state.ctx.currentTime;
    var current = param.value;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else param.cancelScheduledValues(now);
    // 显式锚定本次起点；否则已结束的旧 ramp 可能被延长到新的终点。
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(target, now + seconds);
  }

  var playbackCurve = null;
  var playbackLimiter = null, playbackScale = null, playbackGuard = null, playbackGuardContext = null;
  function outputGuard(ctx, master) {
    // 主总线保护链：先经 Web Audio 原生预读压缩器平滑压住超限峰值，
    // 再缩到 1/4（并补偿压缩器约 +0.57dB 的内置补偿增益）送入 4x 过采样软削波兜底。
    // 正常电平下透明直通；多音层合唱或大推子时平滑限幅，避免削波破音与混叠。
    if (!playbackCurve) {
      playbackCurve = new Float32Array(4097);
      for (var i = 0; i < playbackCurve.length; i++) {
        var x = (i / (playbackCurve.length - 1) * 2 - 1) * 4;
        var a = Math.abs(x);
        playbackCurve[i] = a <= 0.90 ? x : Math.sign(x) * (0.90 + 0.09 * Math.tanh((a - 0.90) / 0.09));
      }
    }
    // 重播短暂交叠的两路 master 也必须在同一个保护节点内相加。
    if (playbackGuardContext !== ctx) {
      playbackGuard = ctx.createWaveShaper();
      playbackGuard.curve = playbackCurve;
      playbackGuard.oversample = '4x';
      playbackGuard.connect(ctx.destination);
      if (typeof ctx.createDynamicsCompressor === 'function') {
        playbackLimiter = ctx.createDynamicsCompressor();
        playbackLimiter.threshold.value = -1;
        playbackLimiter.knee.value = 0;
        playbackLimiter.ratio.value = 20;
        playbackLimiter.attack.value = 0.003;
        playbackLimiter.release.value = 0.08;
        playbackScale = ctx.createGain();
        playbackScale.gain.value = 0.235;
        playbackLimiter.connect(playbackScale);
        playbackScale.connect(playbackGuard);
      } else {
        playbackLimiter = null;
        playbackScale = null;
      }
      playbackGuardContext = ctx;
    }
    master.gain.value = 0;
    if (playbackLimiter) {
      master.connect(playbackLimiter);
      rampGain(master.gain, 1, 0.008);
    } else {
      master.connect(playbackGuard);
      rampGain(master.gain, 0.25, 0.008);
    }
  }

  function killSrcs(immediate) {
    clearReverbOffTimer();
    var stopAt = state.ctx ? state.ctx.currentTime : 0;
    if (state.master && state.ctx) {
      if (immediate) { state.master.gain.cancelScheduledValues(stopAt); state.master.gain.setValueAtTime(0, stopAt); }
      else { rampGain(state.master.gain, 0, 0.006); stopAt += 0.008; }
    }
    if (state.reverbReturn) {
      var tail = state.reverbReturn;
      if (immediate) tail.disconnect();
      else setTimeout(function () { tail.disconnect(); }, 30);
      state.reverbReturn = null;
    }
    if (state.srcs) {
      for (var i = 0; i < state.srcs.length; i++) {
        try { state.srcs[i].stop(stopAt); } catch (e) { }
      }
    }
    state.srcs = null; state.src = null; state.master = null;
    state.gainVox = null; state.gainAcc = null;
  }

  async function startPlay() {
    var finish = beginProcessing();
    try { await preparePlayback(); }
    finally { finish(); }
  }
  async function preparePlayback() {
    var request = ++playRequest;
    playPending = true;
    setStatus(t('ui.rendering', null, '渲染中…'));
    var ctx;
    try {
      ctx = ensureCtx(); // Resume within the original user gesture, before awaiting work.
      var paint = processingPaint();
      if (paint) await paint;
      await ensureAudio(accGain() > 0);
    } catch (e) {
      if (request === playRequest) { playPending = false; setStatus(t('ui.renderFail', { msg: tMsg(e.message) }, '渲染失败：' + e.message)); }
      return;
    }
    if (request !== playRequest) return;
    playPending = false;
    if (!state.vox || !state.vox.length) { setStatus(t('ui.noNotes', null, '没有音符')); return; }
    var vocalTracks = (state.score.tracks || []).filter(function (tr) { return isVocalTrack(tr) && tr.notes && tr.notes.length; });
    if (vocalTracks.length && vocalTracks.every(function (tr) { return tr.muted; }) &&
        !(accGain() > 0 && state.accPcm && state.accPcm.length)) {
      setStatus(t('ui.allVocalLayersMuted', null, '所有人声音层已静音，请在音层面板取消静音后播放'));
      return;
    }
    killSrcs();

    var master = ctx.createGain();
    outputGuard(ctx, master);
    state.master = master;

    var gv = ctx.createGain();
    gv.gain.value = voxGain();
    gv.connect(master);
    var bv = audioBuffer(ctx, vocalAudio());
    var sv = ctx.createBufferSource();
    sv.buffer = bv; sv.connect(gv);
    state.srcs = [sv]; state.src = sv; state.gainVox = gv; state.gainAcc = null;
    if (state.loveReverb) state.reverbReturn = NSG.Reverb.connect(ctx, sv, gv, true);

    var ba = null, sa = null;
    var accPcm = accGain() > 0 ? state.accPcm : null;
    if (accPcm && accPcm.length) {
      var ga = ctx.createGain();
      ga.gain.value = accGain();
      ga.connect(master);
      ba = audioBuffer(ctx, accompanimentAudio());
      sa = ctx.createBufferSource();
      sa.buffer = ba; sa.connect(ga);
      state.srcs.push(sa);
      state.gainAcc = ga;
    }

    state.playVoxDuration = bv.duration;
    state.playAccDuration = ba ? ba.duration : 0;
    var dur = Math.max(bv.duration + (state.loveReverb ? NSG.Reverb.tail : 0), state.playAccDuration);
    /* 起播点要按速度表换算：有变速时 60/tempo 会直接算错秒数 */
    state.tm = NSG.TEMPO.map(state.score);
    var off = Math.max(0, state.tm.secOf(roll.playPos));
    if (off >= dur) { killSrcs(); setStatus(t('ui.cursorPastEnd', null, '游标已在音频末尾之后，请点击标尺选择起播位置')); return; }
    sv.start(0, Math.min(off, bv.duration));
    if (sa) sa.start(0, Math.min(off, ba.duration));

    state.playing = true;
    state.playStart = ctx.currentTime - off;
    state.lastEnd = (state.score.tracks || []).reduce(function (m, tr) {
      if (!isVocalTrack(tr) || tr.muted) return m;
      return (tr.notes || []).reduce(function (mm, n) { return Math.max(mm, n.start + n.dur); }, m);
    }, 0);
    $('#btnPlay').classList.add('on');
    setPlayingClass(true);
    setStatus(t('ui.playing', { vox: Math.round(voxGain() * 100), acc: Math.round(accGain() * 100) }, '播放中… 人声 ' + Math.round(voxGain() * 100) + '% / 伴奏 ' + Math.round(accGain() * 100) + '%'));
    var endingSource = ba && ba.duration > bv.duration ? sa : sv;
    state.playDuration = dur;
    endingSource.onended = function () {
      if (state.playing && state.src === sv && ctx.currentTime - state.playStart >= state.playDuration - 0.02) stopPlay();
    };
    animPlayhead();
  }

  // 已停止时再按停止：视图与播放指针都回到第一个音素前一小格（没有音符时回到开头），以便完整播放发音；
  // 若播放指针已在第一个音素前，则再按一次移到曲谱最开头；若已在最开头，则再按一次跳到第一个音素前
  function rewindToFirstNote() {
    if (!roll.notes || !roll.notes.length) {
      roll.playPos = 0; roll.scrollBeat = 0;
      roll.draw(); syncCursor();
      setStatus(t('ui.rewoundStart', null, '已回到开头'));
      return;
    }
    var first = Infinity;
    roll.notes.forEach(function (n) { if (n.start < first) first = n.start; });
    var timeline = typeof roll._phoneTimeline === 'function' ? roll._phoneTimeline() :
      (NSG.DSP && NSG.DSP.phonemeTimeline ? NSG.DSP.phonemeTimeline({
        lang: roll.lang || (state.score && state.score.lang) || 'zh',
        phonemizer: roll.phonemizer !== undefined ? roll.phonemizer : (state.score && state.score.phonemizer),
        tempo: roll.tempo || (state.score && state.score.tempo) || 120,
        tempos: roll.tempos || (state.score && state.score.tempos),
        tracks: [{ type: 'vocal', notes: roll.notes }]
      }, roll.timbre || state.timbre || (NSG.defaultTimbre && NSG.defaultTimbre())) : null);
    if (timeline && timeline.phones && timeline.phones.length && timeline.tm) {
      var sounding = timeline.phones.filter(function (p) { return p.phone !== 'SP'; });
      var list = sounding.length ? sounding : timeline.phones;
      var minSec = Infinity;
      list.forEach(function (p) {
        var onsetSec = p.t0 - (p.anticipation || 0) / 1000;
        if (Number.isFinite(onsetSec) && onsetSec < minSec) minSec = onsetSec;
      });
      if (Number.isFinite(minSec)) {
        first = timeline.tm.beatOf(Math.max(0, minSec));
      }
    }
    var snap = (roll && Number.isFinite(roll.snap) && roll.snap > 0) ? roll.snap : 0.25;
    var target = Math.max(0, first - snap);
    var cur = Number.isFinite(roll.playPos) ? roll.playPos : 0;
    var atStart = cur <= 1e-6;
    if ((!atStart && (cur <= target + 1e-6 || cur < first - 1e-6)) || (atStart && target <= 1e-6)) {
      roll.playPos = 0; roll.scrollBeat = 0;
      roll.draw(); syncCursor();
      setStatus(t('ui.rewoundStart', null, '已回到开头'));
      return;
    }
    roll.playPos = target; roll.scrollBeat = Math.max(0, target - 1);
    roll.draw(); syncCursor();
    setStatus(atStart ? t('ui.jumpedFirst', null, '已跳到第一个音素前') : t('ui.rewoundFirst', null, '已回到第一个音素前'));
  }

  function stopPlay(immediate) {
    playRequest++; playPending = false;
    if (state.playing && state.ctx) {
      var time = Math.max(0, Math.min(state.playDuration || Infinity, state.ctx.currentTime - state.playStart));
      roll.playPos = (state.tm || NSG.TEMPO.map(state.score)).beatOf(time);
    }
    state.playing = false;
    killSrcs(immediate);
    $('#btnPlay').classList.remove('on');
    setPlayingClass(false);
    roll.draw(); syncCursor();
    setStatus(t('ui.stopped', null, '已停止'));
    cancelAnimationFrame(raf);
    updateMix();
  }

  function panicAudio() {
    var ctx = state.ctx;
    stopPlay(true);
    // Close the whole live context: no buffered output or old effect tail can resume.
    if (playbackGuardContext === ctx) {
      if (playbackLimiter) { playbackLimiter.disconnect(); playbackLimiter = null; }
      if (playbackScale) { playbackScale.disconnect(); playbackScale = null; }
      if (playbackGuard) { playbackGuard.disconnect(); playbackGuard = null; }
      playbackGuardContext = null;
    }
    state.ctx = null;
    if (ctx) ctx.close().catch(function () {});
    setStatus(t('ui.panic', null, 'Panic · 已停止所有音频'));
  }

  function applyRelativeMotionScroll(beat) {
    var viewBeats = Math.max(0.5, (roll.w - roll.kbW) / roll.pxBeat);
    // 播放指针固定在第一小节末尾（4 拍）处；指针在第一小节前面时先向右走至该处再滚动钢琴窗
    var anchorBeats = Math.min(4, viewBeats * 0.8);
    roll.scrollBeat = Math.max(0, beat - anchorBeats);
  }

  function animPlayhead() {
    if (!state.playing) return;
    var t = state.ctx.currentTime - state.playStart;
    if (!state.tm) state.tm = NSG.TEMPO.map(state.score);
    var beat = state.tm.beatOf(t);
    roll.playPos = beat;
    syncCursor();
    if (state.relativeMotion) {
      applyRelativeMotionScroll(beat);
    } else {
      var viewBeats = (roll.w - roll.kbW) / roll.pxBeat;   // 键区不占时间轴，可视拍数要扣掉
      if (beat > roll.scrollBeat + viewBeats * 0.82) roll.scrollBeat = beat - viewBeats * 0.5;
      else if (beat < roll.scrollBeat) roll.scrollBeat = Math.max(0, beat - 2);
    }
    // 只有翻页或滚屏时才整屏重画，其余帧只移动播放头
    if (roll.drawCursor) roll.drawCursor(); else roll.draw();
    updateMetersAt(t);
    if (t >= state.playDuration) { stopPlay(); return; }
    raf = requestAnimationFrame(animPlayhead);
  }

  /* ---------------- 分析绘制 ---------------- */
  var UI_CANVAS_THEMES = {
    aero: {
      bgTop: '#f9feff', bgMid: '#e6f7ff', bgBot: '#ccf0ff',
      grid: 'rgba(84,174,224,.26)', axisText: '#3e7da0',
      curveGlow: 'rgba(34, 214, 255, 0.58)', curveLine: '#0684cc',
      curveArea: ['rgba(30,204,255,.58)', 'rgba(62,234,226,.30)', 'rgba(116,252,196,.08)'],
      formant0: '#ec5e16', formantRest: 'rgba(236,94,22,.58)', formantText: '#b54608',
      specGrid: 'rgba(255,255,255,.56)', specText: 'rgba(255,255,255,.92)', specFormant: 'rgba(255,144,68,.90)',
      harmBg: ['#f9feff', '#d2f0ff'],
      harmHi: ['#ffffe4', '#ffde62', '#f5ac12', '#c87604'],
      harmBar: ['#e8fcff', '#6cd8ff', '#169ae8', '#0a6cb4'],
      harmGloss: 'rgba(255,255,255,.92)', harmSheen: 'rgba(255,255,255,.36)',
      harmLabel: '#3b7b9e', harmMeas: 'rgba(255,255,255,.96)', harmVal: '#b47206', harmBase: '#98cce8',
      eyeBg: ['#f9feff', '#d6f2ff'], eyeGrid: 'rgba(86,174,222,.26)', eyeAxis: '#4c88aa',
      eyeTick: 'rgba(68,158,210,.38)',
      eyeSelFill: ['rgba(255,212,68,.66)', 'rgba(255,184,38,.30)', 'rgba(255,210,77,.07)'],
      eyeFill: ['rgba(34,202,255,.54)', 'rgba(68,234,228,.26)', 'rgba(110,248,210,.07)'],
      eyeSelGlow: 'rgba(255,240,168,.72)', eyeGlow: 'rgba(118,236,255,.65)',
      eyeSelStroke: '#ce8406', eyeStroke: '#0884cc',
      eyeSelHandle: '#b47206', eyeHandle: '#0f92d6', eyeEndSel: '#ea5c14', eyeEnd: '#289ad4',
      eyeStepHalo: 'rgba(255,255,255,.90)', eyeStepLine: '#ea5c14', eyeMom: 'rgba(38,162,74,.62)',
      eyeTitle: '#18648e', eyeLegend: '#b05414'
    },
    '9x': {
      bgTop: '#000800', bgMid: '#001000', bgBot: '#000800',
      grid: 'rgba(0,160,64,.30)', axisText: '#00c850',
      curveGlow: 'rgba(0, 255, 102, 0.35)', curveLine: '#00ff66',
      curveArea: ['rgba(0,255,102,.32)', 'rgba(0,200,80,.14)', 'rgba(0,120,40,.03)'],
      formant0: '#ffff00', formantRest: 'rgba(255,255,0,.55)', formantText: '#ffff00',
      specGrid: 'rgba(255,255,255,.45)', specText: '#ffffff', specFormant: '#ffff00',
      harmBg: ['#000800', '#001200'],
      harmHi: ['#ffff80', '#ffff00', '#cccc00', '#808000'],
      harmBar: ['#80ff80', '#00e040', '#00b020', '#006800'],
      harmGloss: 'rgba(255,255,255,.5)', harmSheen: 'rgba(255,255,255,.12)',
      harmLabel: '#00c850', harmMeas: '#ffffff', harmVal: '#ffff00', harmBase: '#008030',
      eyeBg: ['#ffffff', '#f2f2f2'], eyeGrid: '#d0d0d0', eyeAxis: '#404040',
      eyeTick: '#808080',
      eyeSelFill: ['rgba(0,0,128,.34)', 'rgba(0,0,128,.18)', 'rgba(0,0,128,.04)'],
      eyeFill: ['rgba(0,128,128,.32)', 'rgba(0,128,128,.16)', 'rgba(0,128,128,.04)'],
      eyeSelGlow: 'rgba(255,255,255,.8)', eyeGlow: 'rgba(255,255,255,.7)',
      eyeSelStroke: '#000080', eyeStroke: '#008080',
      eyeSelHandle: '#000080', eyeHandle: '#008080', eyeEndSel: '#800000', eyeEnd: '#404040',
      eyeStepHalo: 'rgba(255,255,255,.9)', eyeStepLine: '#cc0000', eyeMom: 'rgba(0,128,0,.65)',
      eyeTitle: '#000080', eyeLegend: '#800000'
    },
    cyberpunk: {
      bgTop: '#060a16', bgMid: '#091022', bgBot: '#050812',
      grid: 'rgba(0,240,255,.18)', axisText: '#62b8d8',
      curveGlow: 'rgba(0, 240, 255, 0.5)', curveLine: '#00f0ff',
      curveArea: ['rgba(0,240,255,.38)', 'rgba(255,42,133,.18)', 'rgba(255,42,133,.03)'],
      formant0: '#fcee0a', formantRest: 'rgba(255,42,133,.72)', formantText: '#fcee0a',
      specGrid: 'rgba(0,240,255,.42)', specText: '#d4fbff', specFormant: 'rgba(252,238,10,.9)',
      harmBg: ['#060a16', '#0b1226'],
      harmHi: ['#fff896', '#fcee0a', '#e0b800', '#9c7200'],
      harmBar: ['#9efaff', '#00f0ff', '#00a8c6', '#074e6e'],
      harmGloss: 'rgba(255,255,255,.75)', harmSheen: 'rgba(0,240,255,.22)',
      harmLabel: '#6cc8e8', harmMeas: '#ff2a85', harmVal: '#fcee0a', harmBase: '#1d4f73',
      eyeBg: ['#080d1c', '#050812'], eyeGrid: 'rgba(0,240,255,.18)', eyeAxis: '#67b7d6',
      eyeTick: 'rgba(0,240,255,.35)',
      eyeSelFill: ['rgba(255,42,133,.46)', 'rgba(255,42,133,.20)', 'rgba(255,42,133,.04)'],
      eyeFill: ['rgba(0,240,255,.42)', 'rgba(0,240,255,.18)', 'rgba(0,240,255,.04)'],
      eyeSelGlow: 'rgba(255,42,133,.55)', eyeGlow: 'rgba(0,240,255,.48)',
      eyeSelStroke: '#ff2a85', eyeStroke: '#00f0ff',
      eyeSelHandle: '#fcee0a', eyeHandle: '#00f0ff', eyeEndSel: '#fcee0a', eyeEnd: '#ff4da6',
      eyeStepHalo: 'rgba(5,8,18,.9)', eyeStepLine: '#fcee0a', eyeMom: 'rgba(0,255,170,.65)',
      eyeTitle: '#00f0ff', eyeLegend: '#fcee0a'
    },
    xp: {
      bgTop: '#03122b', bgMid: '#071d42', bgBot: '#04122b',
      grid: 'rgba(92,168,255,.26)', axisText: '#8ec2ff',
      curveGlow: 'rgba(56, 232, 72, 0.38)', curveLine: '#38e848',
      curveArea: ['rgba(56,232,72,.34)', 'rgba(36,120,235,.18)', 'rgba(36,120,235,.04)'],
      formant0: '#ffaa2b', formantRest: 'rgba(255,170,43,.62)', formantText: '#ffd166',
      specGrid: 'rgba(160,210,255,.42)', specText: '#e6f3ff', specFormant: 'rgba(255,170,43,.9)',
      harmBg: ['#04122b', '#081d42'],
      harmHi: ['#fff0a8', '#ffbb33', '#e88b00', '#a65d00'],
      harmBar: ['#b8e0ff', '#589af8', '#2468df', '#0e3c96'],
      harmGloss: 'rgba(255,255,255,.72)', harmSheen: 'rgba(255,255,255,.22)',
      harmLabel: '#99c4f5', harmMeas: '#38e848', harmVal: '#ffd166', harmBase: '#2d5796',
      eyeBg: ['#ffffff', '#eef3fb'], eyeGrid: '#d0d9ea', eyeAxis: '#3b5885',
      eyeTick: '#7e9ac7',
      eyeSelFill: ['rgba(248,179,50,.48)', 'rgba(248,179,50,.22)', 'rgba(248,179,50,.04)'],
      eyeFill: ['rgba(36,104,223,.40)', 'rgba(36,104,223,.18)', 'rgba(36,104,223,.04)'],
      eyeSelGlow: 'rgba(255,222,135,.75)', eyeGlow: 'rgba(130,180,255,.6)',
      eyeSelStroke: '#c97800', eyeStroke: '#0054e3',
      eyeSelHandle: '#b86800', eyeHandle: '#0054e3', eyeEndSel: '#d8371c', eyeEnd: '#3b8c23',
      eyeStepHalo: 'rgba(255,255,255,.92)', eyeStepLine: '#d8371c', eyeMom: 'rgba(45,135,24,.65)',
      eyeTitle: '#0054e3', eyeLegend: '#b84300'
    },
    pixel: {
      bgTop: '#0b0618', bgMid: '#130926', bgBot: '#090414',
      grid: 'rgba(255,46,151,.24)', axisText: '#00f5d4',
      curveGlow: 'rgba(72, 255, 123, 0.35)', curveLine: '#48ff7b',
      curveArea: ['rgba(72,255,123,.32)', 'rgba(0,245,212,.14)', 'rgba(255,46,151,.04)'],
      formant0: '#ffd319', formantRest: 'rgba(255,123,41,.72)', formantText: '#ffd319',
      specGrid: 'rgba(0,245,212,.4)', specText: '#fff0fa', specFormant: 'rgba(255,211,25,.92)',
      harmBg: ['#0b0618', '#150a2b'],
      harmHi: ['#fff394', '#ffd319', '#ff7b29', '#c93064'],
      harmBar: ['#9effbe', '#48ff7b', '#00c48c', '#0b5e54'],
      harmGloss: 'rgba(255,255,255,.65)', harmSheen: 'rgba(0,245,212,.22)',
      harmLabel: '#b494e8', harmMeas: '#ff2e97', harmVal: '#ffd319', harmBase: '#452873',
      eyeBg: ['#110a24', '#090514'], eyeGrid: 'rgba(138,79,255,.26)', eyeAxis: '#00f5d4',
      eyeTick: 'rgba(255,46,151,.55)',
      eyeSelFill: ['rgba(255,123,41,.46)', 'rgba(255,46,151,.22)', 'rgba(255,46,151,.04)'],
      eyeFill: ['rgba(0,245,212,.38)', 'rgba(0,245,212,.16)', 'rgba(0,245,212,.04)'],
      eyeSelGlow: 'rgba(255,123,41,.48)', eyeGlow: 'rgba(0,245,212,.42)',
      eyeSelStroke: '#ffd319', eyeStroke: '#00f5d4',
      eyeSelHandle: '#ffd319', eyeHandle: '#48ff7b', eyeEndSel: '#ff2e97', eyeEnd: '#ff7b29',
      eyeStepHalo: 'rgba(9,4,20,.92)', eyeStepLine: '#ff2e97', eyeMom: 'rgba(72,255,123,.72)',
      eyeTitle: '#ffd319', eyeLegend: '#ff2e97'
    },
    modern: {
      bgTop: '#fef7ff', bgMid: '#f7f2fa', bgBot: '#f3edf7',
      grid: 'rgba(103,80,164,.16)', axisText: '#49454f',
      curveGlow: 'rgba(103, 80, 164, 0.22)', curveLine: '#6750a4',
      curveArea: ['rgba(103,80,164,.30)', 'rgba(208,188,255,.20)', 'rgba(234,221,255,.04)'],
      formant0: '#b3261e', formantRest: 'rgba(125,82,96,.6)', formantText: '#7d5260',
      specGrid: 'rgba(255,255,255,.45)', specText: '#fffbfe', specFormant: 'rgba(255,216,228,.92)',
      harmBg: ['#fef7ff', '#f3edf7'],
      harmHi: ['#ffd8e4', '#e88da8', '#b3261e', '#7d5260'],
      harmBar: ['#eaddff', '#d0bcff', '#7f67be', '#6750a4'],
      harmGloss: 'rgba(255,255,255,.55)', harmSheen: 'rgba(255,255,255,.18)',
      harmLabel: '#49454f', harmMeas: '#1d1b20', harmVal: '#b3261e', harmBase: '#cac4d0',
      eyeBg: ['#fef7ff', '#f3edf7'], eyeGrid: '#e6e0e9', eyeAxis: '#49454f',
      eyeTick: '#cac4d0',
      eyeSelFill: ['rgba(103,80,164,.32)', 'rgba(103,80,164,.14)', 'rgba(103,80,164,.03)'],
      eyeFill: ['rgba(98,91,113,.24)', 'rgba(98,91,113,.10)', 'rgba(98,91,113,.02)'],
      eyeSelGlow: 'rgba(208,188,255,.65)', eyeGlow: 'rgba(204,194,220,.5)',
      eyeSelStroke: '#6750a4', eyeStroke: '#625b71',
      eyeSelHandle: '#6750a4', eyeHandle: '#625b71', eyeEndSel: '#b3261e', eyeEnd: '#7d5260',
      eyeStepHalo: 'rgba(254,247,255,.94)', eyeStepLine: '#b3261e', eyeMom: 'rgba(0,106,106,.62)',
      eyeTitle: '#6750a4', eyeLegend: '#b3261e'
    }
  };
  function uiCanvasPalette() {
    if (state.theme === 'modern' && NSG.modernPalette && NSG.modernPalette.ui) {
      return NSG.modernPalette.ui;
    }
    if (NSG.schemePalettes && NSG.schemePalettes[state.theme] && NSG.schemePalettes[state.theme].ui) {
      return NSG.schemePalettes[state.theme].ui;
    }
    return UI_CANVAS_THEMES[state.theme] || UI_CANVAS_THEMES.aero;
  }

  function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(2) + 'k' : Math.round(v) + ''; }

  function drawCurve() {
    var cv = $('#cvCurve'); if (!cv || typeof cv.getContext !== 'function' || !NSG.AN || !state.timbre) return;
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var P = uiCanvasPalette();
    c.clearRect(0, 0, W, H);
    var rate = state.hd ? 48000 : 16000, maxHz = rate / 2;
    var r = NSG.AN.filterCurve(state.timbre, state.vowel, rate);
    var pts = r.points;
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.bgTop); g.addColorStop(0.55, P.bgMid); g.addColorStop(1, P.bgBot);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 网格
    c.strokeStyle = P.grid; c.lineWidth = 1;
    c.font = '8px Consolas, monospace'; c.fillStyle = P.axisText;
    (state.hd ? [100, 500, 1000, 2000, 4000, 8000, 16000, 24000] : [100, 200, 500, 1000, 2000, 4000, 6000, 8000]).forEach(function (hz) {
      var x = Math.log(1 + hz / 60) / Math.log(1 + maxHz / 60) * W;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      c.fillText(fmtHz(hz), x + 2, H - 2);
    });
    for (var db = 0; db >= -60; db -= 12) {
      var y = H - 6 - (db + 72) / 72 * (H - 12);
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    // 曲线
    c.beginPath();
    for (var i = 0; i < 512; i++) {
      var hz2 = maxHz * i / 511;
      var x2 = Math.log(1 + hz2 / 60) / Math.log(1 + maxHz / 60) * W;
      var y2 = H - 6 - (pts[i] + 72) / 72 * (H - 12);
      if (i === 0) c.moveTo(x2, y2); else c.lineTo(x2, y2);
    }
    c.strokeStyle = P.curveGlow; c.lineWidth = 3.6; c.stroke();
    c.strokeStyle = P.curveLine; c.lineWidth = 1.7; c.stroke();
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    var gg = c.createLinearGradient(0, 0, 0, H);
    gg.addColorStop(0, P.curveArea[0]);
    gg.addColorStop(0.55, P.curveArea[1]);
    gg.addColorStop(1, P.curveArea[2]);
    c.fillStyle = gg; c.fill();
    // 共振峰标记
    r.formants.f.forEach(function (f, i) {
      if (f >= maxHz) return;
      var x3 = Math.log(1 + f / 60) / Math.log(1 + maxHz / 60) * W;
      c.strokeStyle = i === 0 ? P.formant0 : P.formantRest;
      c.setLineDash([2, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x3, 0); c.lineTo(x3, H); c.stroke();
      c.setLineDash([]);
      c.fillStyle = P.formantText; c.font = 'bold 8px Consolas';
      c.fillText('F' + (i + 1), x3 + 1, 9 + i * 0);
    });
    if (state.theme === 'aero') {
      var glassTop = c.createLinearGradient(0, 0, 0, H * 0.42);
      glassTop.addColorStop(0, 'rgba(255,255,255,.52)');
      glassTop.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = glassTop;
      c.fillRect(0, 0, W, H * 0.42);
    }
    $('#curveVowel').textContent = '/' + (state.vowel === '1' ? 'ɿ' : state.vowel) + '/';
  }

  function drawGrid() {
    var cv = $('#cvGrid'); if (!cv || !state.pcm) return;
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var P = uiCanvasPalette();
    var g = state.spectrumGrid; if (!g) return;
    var maxHz = g.cols * g.colHz;
    $('#gridResolution').textContent = t('an.gridRes', { hz: g.colHz }, g.colHz + 'Hz / 列');
    var img = c.createImageData(g.cols, g.rows);
    for (var i = 0; i < g.cols * g.rows; i++) {
      var v = Math.max(0, Math.min(1, (g.data[i] + 96) / 96));
      var col = palette(v);
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    var tmp = document.createElement('canvas');
    tmp.width = g.cols; tmp.height = g.rows;
    tmp.getContext('2d').putImageData(img, 0, 0);
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    // 频率轴为横轴：把 (列=频率, 行=时间) 直接铺开
    c.drawImage(tmp, 0, 0, W, H);
    c.strokeStyle = P.specGrid; c.lineWidth = 1;
    for (var f = 1; f <= 8; f++) {
      var x = f / 8 * W;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      c.fillStyle = P.specText; c.font = '7px Consolas';
      c.fillText((f * maxHz / 8000) + 'k', x + 1, 8);
    }
    // 共振峰标记
    var fm = NSG.formantsOf(NSG.phoneOf(state.vowel), state.timbre);
    fm.f.forEach(function (hz) {
      var x2 = Math.min(W - 1, hz / maxHz * W);
      c.strokeStyle = P.specFormant; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x2, 0); c.lineTo(x2, H); c.stroke(); c.setLineDash([]);
    });
  }

  function palette(v) {
    if (state.theme !== 'aero' && state.theme !== 'modern' &&
        NSG.schemePalettes && NSG.schemePalettes[state.theme] && NSG.schemePalettes[state.theme].spec) {
      var sp = NSG.schemePalettes[state.theme].spec;
      var c1, c2, st;
      if (v < 0.5) { c1 = sp.low; c2 = sp.mid; st = v / 0.5; }
      else { c1 = sp.mid; c2 = sp.high; st = (v - 0.5) / 0.5; }
      return [
        (c1[0] + (c2[0] - c1[0]) * st) | 0,
        (c1[1] + (c2[1] - c1[1]) * st) | 0,
        (c1[2] + (c2[2] - c1[2]) * st) | 0
      ];
    }
    if (state.theme === 'cyberpunk') {
      // 赛博朋克霓虹光谱：暗紫黑 → 霓虹品红 → 电光青 → 赛博黄白
      var cr, cg, cb;
      if (v < 0.30) { var ct = v / 0.30; cr = 8 + 62 * ct; cg = 8 + 6 * ct; cb = 22 + 78 * ct; }
      else if (v < 0.65) { var ct2 = (v - 0.30) / 0.35; cr = 70 + 185 * ct2; cg = 14 + 36 * ct2; cb = 100 + 40 * ct2; }
      else if (v < 0.88) { var ct3 = (v - 0.65) / 0.23; cr = 255 - 240 * ct3; cg = 50 + 195 * ct3; cb = 140 + 115 * ct3; }
      else { var ct4 = (v - 0.88) / 0.12; cr = 15 + 240 * ct4; cg = 245 + 10 * ct4; cb = 255 - 60 * ct4; }
      return [cr | 0, cg | 0, cb | 0];
    }
    if (state.theme === '9x') {
      // 9X 复古荧光分析仪色谱：深墨 → 军绿 → 荧光绿 → 亮黄
      var wr, wg, wb;
      if (v < 0.35) { var wt = v / 0.35; wr = 0; wg = 16 + 96 * wt; wb = 16 * wt; }
      else if (v < 0.72) { var wt2 = (v - 0.35) / 0.37; wr = 60 * wt2; wg = 112 + 130 * wt2; wb = 16 + 20 * wt2; }
      else { var wt3 = (v - 0.72) / 0.28; wr = 60 + 195 * wt3; wg = 242 + 13 * wt3; wb = 36 + 140 * wt3; }
      return [wr | 0, wg | 0, wb | 0];
    }
    if (state.theme === 'xp') {
      // eXperience 经典声波图色谱：深蓝 → 皇家蓝 → 翡翠绿 → 琥珀白
      var xr, xg, xb;
      if (v < 0.34) { var xt = v / 0.34; xr = 4 + 14 * xt; xg = 18 + 72 * xt; xb = 46 + 150 * xt; }
      else if (v < 0.72) { var xt2 = (v - 0.34) / 0.38; xr = 18 + 38 * xt2; xg = 90 + 138 * xt2; xb = 196 - 110 * xt2; }
      else { var xt3 = (v - 0.72) / 0.28; xr = 56 + 199 * xt3; xg = 228 + 27 * xt3; xb = 86 + 140 * xt3; }
      return [xr | 0, xg | 0, xb | 0];
    }
    if (state.theme === 'pixel') {
      // 像素 Outrun / Tracker 烈焰色谱：午夜黑紫 → 霓虹品红 → 烈焰橙 → 高能金白
      var pr, pg, pb;
      if (v < 0.30) { var pt = v / 0.30; pr = 8 + 247 * pt; pg = 2 + 44 * pt; pb = 20 + 131 * pt; }
      else if (v < 0.66) { var pt2 = (v - 0.30) / 0.36; pr = 255; pg = 46 + 77 * pt2; pb = 151 - 110 * pt2; }
      else { var pt3 = (v - 0.66) / 0.34; pr = 255; pg = 123 + 122 * pt3; pb = 41 + 127 * pt3; }
      return [pr | 0, pg | 0, pb | 0];
    }
    if (state.theme === 'modern') {
      // Material Design 3 动态壁纸色谱
      var mspec = (NSG.modernPalette && NSG.modernPalette.spec) || {
        low: [33, 22, 60], mid: [103, 80, 164], high: [255, 226, 238]
      };
      var m1, m2, mt;
      if (v < 0.5) {
        m1 = mspec.low; m2 = mspec.mid; mt = v / 0.5;
      } else {
        m1 = mspec.mid; m2 = mspec.high; mt = (v - 0.5) / 0.5;
      }
      return [
        (m1[0] + (m2[0] - m1[0]) * mt) | 0,
        (m1[1] + (m2[1] - m1[1]) * mt) | 0,
        (m1[2] + (m2[2] - m1[2]) * mt) | 0
      ];
    }
    // Frutiger Aero 海洋极光水晶色谱：澄海宝石蓝 → 电光晴空蓝 → 晶莹翡翠青 → 极光嫩绿 → 日光珍珠白
    var r, g, b;
    if (v < 0.28) { var t = v / 0.28; r = 6 + 12 * t; g = 32 + 96 * t; b = 76 + 126 * t; }
    else if (v < 0.62) { var t2 = (v - 0.28) / 0.34; r = 18 + 56 * t2; g = 128 + 112 * t2; b = 202 + 46 * t2; }
    else if (v < 0.86) { var t3 = (v - 0.62) / 0.24; r = 74 + 132 * t3; g = 240 + 13 * t3; b = 248 - 44 * t3; }
    else { var t4 = (v - 0.86) / 0.14; r = 206 + 49 * t4; g = 253 + 2 * t4; b = 204 + 51 * t4; }
    return [r | 0, g | 0, b | 0];
  }

  function drawHarm() {
    var cv = $('#cvHarm'); if (!cv || typeof cv.getContext !== 'function') return;
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var P = uiCanvasPalette();
    c.clearRect(0, 0, W, H);
    var bgG = c.createLinearGradient(0, 0, 0, H);
    bgG.addColorStop(0, P.harmBg[0]); bgG.addColorStop(1, P.harmBg[1]);
    c.fillStyle = bgG; c.fillRect(0, 0, W, H);
    var bw = W / 16;
    // 底色：参数块里的倍频振幅（可拖动编辑）
    var tdb = state.timbre.harm;
    for (var i = 0; i < 16; i++) {
      var v = Math.max(0, (tdb[i] + 60) / 60);
      var hgt = v * (H - 18);
      var bx = i * bw + 1.5, by = H - 11 - hgt, bwidth = bw - 3;
      var stops = i === state.harmHi ? P.harmHi : P.harmBar;
      var g = c.createLinearGradient(0, by, 0, H - 11);
      g.addColorStop(0, stops[0]); g.addColorStop(0.45, stops[1]); g.addColorStop(0.5, stops[2]); g.addColorStop(1, stops[3]);
      c.fillStyle = g;
      c.fillRect(bx, by, bwidth, hgt);
      if (hgt > 2) {
        c.fillStyle = P.harmGloss;
        c.fillRect(bx + 0.5, by, Math.max(1, bwidth - 1), 1.5);
        c.fillStyle = P.harmSheen;
        c.fillRect(bx + 1, by + 1.5, Math.max(1, bwidth * 0.35), Math.max(0, hgt - 2));
      }
      c.fillStyle = P.harmLabel; c.font = '7px Consolas';
      c.fillText((i + 1) + '', i * bw + 2, H - 2);
    }
    // 实测值
    if (state.pcm && hasPlayableVocalNotes()) {
      var amps = state.harmonics; if (!amps) return;
      c.strokeStyle = P.harmMeas; c.lineWidth = 1.4; c.beginPath();
      for (var k = 0; k < 16; k++) {
        var vv = Math.max(0, (amps[k] + 60) / 60) * (H - 18);
        var y = H - 11 - vv;
        if (k === 0) c.moveTo(k * bw + bw / 2, y); else c.lineTo(k * bw + bw / 2, y);
      }
      c.stroke();
    }
    if (state.harmHi !== null) {
      c.fillStyle = P.harmVal; c.font = 'bold 9px Consolas';
      c.fillText(tdb[state.harmHi].toFixed(1) + 'dB', Math.min(W - 34, state.harmHi * bw), 9);
    }
    if (state.theme === 'aero') {
      var hGlass = c.createLinearGradient(0, 0, 0, H * 0.38);
      hGlass.addColorStop(0, 'rgba(255,255,255,.46)');
      hGlass.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hGlass;
      c.fillRect(0, 0, W, H * 0.38);
    }
    c.strokeStyle = P.harmBase; c.beginPath(); c.moveTo(0, H - 11); c.lineTo(W, H - 11); c.stroke();
  }

  function bindHarmEdit() {
    var cv = $('#cvHarm');
    var drag = null, highlightTimer = 0;
    function apply(e) {
      if (state.timbre !== drag.timbre || activeVocalTrack() !== drag.track || !cv.clientWidth || !cv.clientHeight) return;
      var r = cv.getBoundingClientRect();
      var x = (e.clientX - r.left - cv.clientLeft) * cv.width / cv.clientWidth;
      var y = (e.clientY - r.top - cv.clientTop) * cv.height / cv.clientHeight;
      var i = Math.max(0, Math.min(15, Math.floor(x / (cv.width / 16))));
      // 与柱高的 −60 至 0 dB 刻度互为逆运算。
      var db = 60 * ((cv.height - 11 - y) / (cv.height - 18) - 1);
      db = Math.max(-60, Math.min(0, Math.round(db * 10) / 10));
      state.harmHi = i;
      if (drag.timbre.harm[i] !== db) {
        drag.timbre.harm[i] = db;
        state.dirty = true;
        renderAndAnalyze(320);
      }
      drawHarm();
    }
    function finish() {
      if (!drag) return;
      var edit = drag;
      drag = null;
      if (state.timbre !== edit.timbre || activeVocalTrack() !== edit.track) return;
      highlightTimer = setTimeout(function () { state.harmHi = null; drawHarm(); }, 700);
      var after = edit.timbre.harm.slice();
      if (after.every(function (db, i) { return db === edit.before[i]; })) return;
      markEdited();
      roll.recordEdit(function (redo) {
        if (state.timbre !== edit.timbre || activeVocalTrack() !== edit.track) return false;
        edit.timbre.harm = (redo ? after : edit.before).slice();
        if (redo) markEdited();
        else if (edit.cleanPreset && edit.cleanPreset === JSON.stringify(edit.timbre)) {
          state.presetDirty = false;
          edit.track.presetDirty = false;
          syncSingers();
        }
        state.harmHi = null;
        state.dirty = true;
        drawHarm();
        renderAndAnalyze(0);
        return true;
      });
    }
    cv.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || drag) return;
      clearTimeout(highlightTimer);
      var timbre = state.timbre;
      drag = {
        track: activeVocalTrack(), timbre: timbre, before: timbre.harm.slice(),
        cleanPreset: timbre.preset && !state.presetDirty ? JSON.stringify(timbre) : null
      };
      cv.focus({ preventScroll: true });
      apply(e);
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) { if (drag) apply(e); });
    window.addEventListener('mouseup', function (e) { if (e.button === 0) finish(); });
    window.addEventListener('blur', finish);
  }

  /* ---------------- 导出 ---------------- */
  function saveExport(data, name, description) {
    setStatus(t('exp.exporting', null, '正在导出…'));
    var finish = beginProcessing();
    // Invoke the save picker in the click; yield only inside its data producer.
    return NSG.IO.download(async function () {
      var paint = processingPaint();
      if (paint) await paint;
      return typeof data === 'function' ? data() : data;
    }, name).then(function (result) {
      if (!result) { setStatus(t('exp.canceled', null, '已取消导出')); return; }
      var detail = typeof description === 'function' ? description() : description;
      setStatus((result.method === 'save' ? t('exp.saved', { name: result.name || '' }, '已保存：' + (result.name || '')) : t('exp.downloaded', null, '已发起下载：')) + detail);
    }).catch(function (e) {
      var emsg = tMsg(e.message);
      setStatus(t('exp.failed', { msg: emsg }, '导出失败：' + emsg));
      alert(t('exp.failed', { msg: emsg }, '导出失败：' + emsg));
    }).finally(finish);
  }

  function vocalStemName(track) {
    var name = String(track.name || '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').trim().replace(/[. ]+$/, '');
    return Array.from(name || t('layer.defaultSingle', null, '人声')).slice(0, 40).join('');
  }

  function exportVocalWavs(tracks, bits, asZip, label) {
    var score = state.score;
    // Capture the project before the save dialog or a switch to another layer.
    var snapshot = JSON.parse(JSON.stringify({
      tempo: score.tempo, tempos: score.tempos, lang: score.lang, phonemizer: score.phonemizer,
      tracks: tracks.map(function (track) { return Object.assign({}, track, { muted: false, vol: 1, pan: 0 }); }),
      timbre: state.timbre, raw: state.rawSrc, hd: state.hd,
      waveguide: state.hifiWaveguide, highPolish: state.hifiHighPolish
    }));
    var size = snapshot.tracks.length;
    var sr, prefix = 'NSG_' + NSG.IO.stamp() + '_';

    return saveExport(async function () {
      // Export has its own queue, so editing or playing cannot replace a stem render.
      var client = NSG.Renderer.create();
      async function encodeStem(track, index) {
        setStatus(t('exp.renderingLayer', { n: index + 1, total: size }, '正在渲染人声音层 ' + (index + 1) + '/' + size + '…'));
        var part = { tempo: snapshot.tempo, tempos: snapshot.tempos, lang: snapshot.lang,
          phonemizer: snapshot.phonemizer, tracks: [track] };
        var audio = await client.vocal(part, snapshot.timbre, snapshot.raw, snapshot.hd,
          snapshot.waveguide, snapshot.highPolish, { includeAnalysis: false, headroom: false });
        sr = audio.sr;
        setStatus(t('exp.encodingWav', null, '正在编码 WAV…'));
        return NSG.IO.encodeWAVAsync(audio.pcm, sr, bits);
      }
      async function* files() {
        var digits = Math.max(2, String(size).length);
        for (var i = 0; i < size; i++) {
          var track = snapshot.tracks[i];
          var number = String(i + 1).padStart(digits, '0');
          yield { name: number + '-' + vocalStemName(track) + '.wav', bytes: await encodeStem(track, i) };
        }
      }
      try {
        var blob = asZip ? await NSG.IO.packZip(files()) : new Blob([await encodeStem(snapshot.tracks[0], 0)], { type: 'audio/wav' });
        setStatus(t('exp.writingFile', null, '正在写入文件…'));
        return blob;
      } finally { client.close(); }
    }, prefix + (asZip ? 'vocal_layers_' + bits + 'bit.zip' : 'vocal_' + vocalStemName(snapshot.tracks[0]) + '_' + bits + 'bit.wav'), function () {
      return asZip
        ? t('exp.vocalLayersDetail', { n: size, bits: bits }, '人声音层 ZIP（' + size + ' 个 ' + bits + 'bit WAV）')
        : t('exp.wavDetail', { label: label, bits: bits, sr: sr, ch: t('status.mono', null, '单声道') },
          label + ' WAV（' + bits + 'bit / ' + sr + 'Hz / 单声道）');
    });
  }

  function exportWav(kind, bits) {
    var zhKind = { vocal: '本层人声', vocalLayers: '所有人声音层', accompaniment: '伴奏', mix: '混音' }[kind];
    var label = t('exp.kind.' + kind, null, zhKind);
    var vocal = kind === 'vocal', asZip = kind === 'vocalLayers';
    var current = vocal ? selectedVocalTrack() : null;
    if (vocal && !current) return;
    if (!bits) {
      var m = modal(t('exp.modalTitle', { label: label }, '导出' + label),
        '<p>' + (vocal || asZip
          ? t('exp.vocalDesc', { sr: state.hd ? t('status.quality48k', null, '48kHz 模式B') : t('status.quality16k', null, '16kHz') }, (state.hd ? '48kHz 模式B' : '16kHz') + ' 单声道人声干声，不含混响。')
          : t('exp.mixDesc', null, '伴奏或带混响的混音为 48kHz 立体声；仅干声时采用当前人声采样率和单声道。')) +
        (kind === 'mix' ? t('exp.mixModeNote', null, '按当前音量、静音和情歌混响设置导出，保留混响尾音。') : t('exp.stemModeNote', null, '导出独立轨，使用原始音量，不受混音台静音影响。')) +
        (asZip ? t('exp.vocalLayersDesc', null, '每层生成一个 WAV，统一从工程零点开始，并打包为 ZIP。') : '') + '</p>' +
        '<label>' + t('exp.wavBits', null, 'WAV 位深') + ' <select id="wavBits"><option value="16">16bit PCM</option><option value="24">24bit PCM</option></select></label>',
        '<button class="abtn" id="wavGo">' + t('exp.goBtn', { label: label }, '导出' + label) + '</button><button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
      $('#wavGo', m.el).onclick = function () { var bits = +$('#wavBits', m.el).value; m.close(); exportWav(kind, bits); };
      return;
    }
    if (vocal || asZip) {
      var tracks = vocal ? [current] : state.score.tracks.filter(isVocalTrack);
      if (!tracks.length || (vocal && !(current.notes || []).length)) {
        setStatus(t('exp.nothingToExport', { label: label }, '没有可导出的' + label));
        return;
      }
      return exportVocalWavs(tracks, bits, asZip, label);
    }
    var audio;
    return saveExport(async function () {
      setStatus(t('exp.renderingAudio', null, '正在渲染音频…'));
      if (kind === 'accompaniment') { await ensureAcc(); audio = accompanimentAudio(); }
      else {
        await ensureAudio(true);
        audio = await mixedPcm();
      }
      if (!audio) throw new Error(t('exp.nothingToExport', { label: label }, '没有可导出的' + label));
      setStatus(t('exp.encodingWav', null, '正在编码 WAV…'));
      var buf = await NSG.IO.encodeWAVAsync(audio.channels, audio.sr, bits);
      setStatus(t('exp.writingFile', null, '正在写入文件…'));
      return new Blob([buf], { type: 'audio/wav' });
    }, 'NSG_' + NSG.IO.stamp() + '_' + kind + '_' + bits + 'bit.wav', function () {
      return t('exp.wavDetail', {
        label: label,
        bits: bits,
        sr: audio.sr,
        ch: audio.channels.length === 1 ? t('status.mono', null, '单声道') : t('status.stereo', null, '立体声')
      }, label + ' WAV（' + bits + 'bit / ' + audio.sr + 'Hz / ' + (audio.channels.length === 1 ? '单声道' : '立体声') + '）');
    });
  }

  function exportMidi(kind) {
    kind = kind || 'all';
    var zhKind = { all: '全曲', vocal: '人声', accompaniment: '伴奏' }[kind];
    var label = t('exp.midiKind.' + kind, null, zhKind);
    return saveExport(function () {
      return new Blob([NSG.IO.writeMIDI(state.score, { kind: kind })], { type: 'audio/midi' });
    }, 'NSG_' + NSG.IO.stamp() + '_' + kind + '.mid', label + ' MIDI' + (kind === 'accompaniment' ? '' : t('exp.midiLyrics', null, '（含歌词元事件）')));
  }

  function exportProject() {
    var tr = activeVocalTrack();
    if (tr) {
      if (!tr.timbre) tr.timbre = state.timbre;
      if (!tr.lang && state.score && state.score.lang) tr.lang = state.score.lang;
    }
    return saveExport(function () {
      var txt = NSG.IO.saveProject(state.score, state.timbre, {
        volVox: state.volVox, volAcc: state.volAcc,
        muteVox: !!state.muteVox, muteAcc: !!state.muteAcc,
        loveReverb: state.loveReverb, hd: state.hd,
        hifiWaveguide: state.hifiWaveguide,
        hifiHighPolish: state.hifiHighPolish,
        activeTrackIndex: activeVocalTrackIndex()
      });
      return new Blob([txt], { type: 'application/json' });
    }, 'NSG_' + NSG.IO.stamp() + '.nsg', t('exp.projectDesc', null, '工程文件'));
  }

  function exportUfdata() {
    return saveExport(function () {
      var txt = NSG.IO.writeUfdata(state.score, { title: state.title || t('exp.ufdataTitle', null, 'NSG 工程'), timbre: state.timbre });
      return new Blob([txt], { type: 'application/json' });
    }, 'NSG_' + NSG.IO.stamp() + '.ufdata', t('exp.ufdataDesc', null, ' Ufdata（UtaFormatix 数据：人声轨 + 伴奏轨，480 分辨率）'));
  }

  /* ---------------- 导入 ----------------
     一律按内容嗅探，不看扩展名：VSQ 其实是 SMF、DSC 与 SVP 都是 JSON、
     ufdata 也是 JSON，光看后缀会把它们喂给错的解析器。 */
  function pickFile() { $('#fileInput').click(); }
  function pickLayerFile() { var inp = $('#layerFileInput'); if (inp) inp.click(); }

  function unmuteVprSelection(res, tracks) {
    // VPR audio clips are not imported; an entirely muted selection needs a playable vocal.
    var nonEmpty = tracks.filter(function (tr) { return tr && tr.notes && tr.notes.length; });
    return res.format === 'VPR' && nonEmpty.length > 0 && nonEmpty.every(function (tr) { return tr.muted; });
  }

  function applyImported(f, res) {
    var pickedTracks = (res.selectedTracks && res.selectedTracks.length) ? res.selectedTracks : null;
    var rawTracks = pickedTracks || [{
      name: res.selectedTrackName || t('layer.defaultSingle', null, '人声'),
      notes: res.notes || [],
      pit: res.pit,
      sampledPit: res.sampledPit,
      lang: res.lang,
      phonemizer: res.phonemizer,
      timbre: res.timbre,
      vol: res.vol,
      pan: res.pan,
      muted: res.muted
    }];
    var notes = [];
    rawTracks.forEach(function (tr) { if (tr.notes && tr.notes.length) notes = notes.concat(tr.notes); });
    if (!notes.length) throw new Error(t('imp.noNotes', null, '这个文件里没有音符'));
    var unmuteVpr = unmuteVprSelection(res, rawTracks);
    // 外部工程不继承上一工程的人声效果和音量。
    state.hd = false;
    state.hifiWaveguide = 1;
    state.hifiHighPolish = 1;
    state.loveReverb = false;
    state.volVox = 0.56;
    syncQuality();
    updateMix();
    /* 分段速度优先，其次单一速度。丢掉速度点，长歌会越走越偏 */
    if (res.tempos && res.tempos.length) {
      NSG.TEMPO.apply(state.score, res.tempos);
    } else if (res.tempo) {
      NSG.TEMPO.apply(state.score, [{ beat: 0, bpm: res.tempo }]);
    }
    if (res.tempo) $('#tempo').value = Math.round(state.score.tempo * 100) / 100;
    var prevPh = state.score && state.score.phonemizer;
    if (res.lang) state.score.lang = res.lang;
    // The source language recommends a phonemizer; the user's next selection
    // overrides every imported per-note language without rewriting the lyrics.
    roll.lang = state.score.lang;
    roll.phonemizer = rawTracks.length > 1 ? undefined : prevPh;
    if (rawTracks.length > 1 && state.score) delete state.score.phonemizer;
    if (res.root) { state.score.root = res.root; $('#keySel').value = String(res.root); }
    state.title = res.title || f.name.replace(/\.[^.]+$/, '');

    // 没有音色的外部工程统一用女声2，不沿用上一个工程的歌手。
    var baseTimbre = res.timbre ? NSG.migrateTimbre(res.timbre) : NSG.presetTimbre('f2');
    var instNotes = res.acc ? normNotes(res.acc) : [];
    state.score.tracks = rawTracks.map(function (tr, i) {
      var tLang = tr.lang || res.lang || state.score.lang || 'zh';
      var tPh = tr.phonemizer !== undefined ? tr.phonemizer : (rawTracks.length === 1 ? prevPh : undefined);
      var trackNotes = normNotes(tr.notes || []);
      var trackPit = NSG.TUNING && NSG.TUNING.decoupleTrackPitch
        ? NSG.TUNING.decoupleTrackPitch(trackNotes, tr.pit, { sampledPit: !!(tr.sampledPit || res.sampledPit) })
        : (tr.pit || []);
      var trackObj = {
        id: i === 0 ? 'v' : ('v' + (i + 1)),
        name: tr.name || (rawTracks.length > 1 ? t('layer.defaultName', { n: i + 1 }, '人声 ' + (i + 1)) : t('layer.defaultSingle', null, '人声')),
        type: 'vocal',
        color: LAYER_COLORS[i % LAYER_COLORS.length],
        visible: true,
        muted: !unmuteVpr && !!tr.muted,
        vol: typeof tr.vol === 'number' && isFinite(tr.vol) ? Math.max(0, Math.min(TRACK_VOL_MAX, tr.vol)) : 1,
        pan: typeof tr.pan === 'number' && isFinite(tr.pan) ? Math.max(-1, Math.min(1, tr.pan)) : 0,
        lang: tLang,
        phonemizer: tPh,
        timbre: tr.timbre ? NSG.migrateTimbre(tr.timbre) : (rawTracks.length > 1 ? NSG.cloneTimbre(baseTimbre) : undefined),
        presetDirty: false,
        notes: trackNotes
      };
      if (trackPit && trackPit.length) trackObj.pit = trackPit;
      return trackObj;
    });
    var importedAccomp = { id: 'i', name: t('layer.accompName', null, '伴奏'), type: 'inst', notes: instNotes };
    if (res.format === 'DSC' && instNotes.length) importedAccomp.sourceFormat = 'DSC';
    state.score.tracks.push(importedAccomp);
    state.activeTrackIndex = 0;
    state.voxAudio = null;
    state.accPcm = null; state.accAudio = null; state.accKey = null; state.accPeak = 0; state.accEnv = null;

    state.timbre = state.score.tracks[0].timbre || baseTimbre;
    state.presetDirty = false;
    state.harmHi = null;
    syncActiveTrackToUI();
    if (res.eye) {
      var es = NSG.COMPOSE.EYE.fromDsc(res.eye);
      if (es) { state.eyeSet = es; state.eyeName = es.name; }
    }
    roll.setNotes(activeVocalTrack().notes, { pit: activeVocalTrack().pit || [] });
    syncRollTracks({ skipSetNotes: true });
    roll.scrollBeat = 0;
    updateStat();
    state.dirty = true;
    state.tm = null;
    syncRollTempos();
    renderAndAnalyze(60);

    var extra = [];
    if (unmuteVpr) extra.push(t('imp.vprUnmuted', null, '所选 VPR 人声轨全部静音，已自动取消静音'));
    if (res.pitchFit) extra.push(t('imp.extraPitchFit', { before: res.pitchFit.before, after: res.pitchFit.after, tol: res.pitchFit.tolerance || 1 }, 'PIT 预拟合 ' + res.pitchFit.before + ' → ' + res.pitchFit.after + ' 点（拟合误差 ≤' + (res.pitchFit.tolerance || 1) + ' 音分）'));
    if (res.pitchCleanup && res.pitchCleanup.repaired) extra.push(t('imp.extraCleanup', { n: res.pitchCleanup.repaired }, '修复边界异常采样 ' + res.pitchCleanup.repaired + ' 处'));
    if (res.pitchFit && res.pitchFit.vibratoNotes) extra.push(t('imp.extraVib', { n: res.pitchFit.vibratoNotes }, '提取颤音 ' + res.pitchFit.vibratoNotes + ' 处'));
    if (rawTracks.length > 1) extra.push(t('imp.extraLayers', { n: rawTracks.length }, rawTracks.length + ' 条人声音层'));
    else if (res.selectedTrackName) extra.push(t('imp.extraTrack', { name: res.selectedTrackName }, '轨道「' + res.selectedTrackName + '」'));
    var nt = NSG.TEMPO.list(state.score).length;
    if (nt > 1) extra.push(t('imp.extraTempos', { n: nt }, '分段速度 ' + nt + ' 段'));
    if (res.acc) {
      var kinds = {};
      res.acc.forEach(function (n) { kinds[n.inst] = (kinds[n.inst] || 0) + 1; });
      extra.push(t('imp.extraAcc', { n: res.acc.length }, '伴奏 ' + res.acc.length + ' 音'));
    }
    /* 延音符与英语拆词：导入时已经统一成本软件的写法，提示一声有多少 */
    var nSlur = 0, nJoin = 0;
    notes.forEach(function (n) { if (n.slur) nSlur++; if (n.wordJoin) nJoin++; });
    if (nSlur) extra.push(t('imp.extraSlur', { n: nSlur }, '延音 ' + nSlur + ' 处'));
    if (nJoin) extra.push(t('imp.extraJoin', { n: nJoin }, '拆词 ' + nJoin + ' 处'));
    extra.push(t('imp.extraTimbre', { name: state.timbre.name ? tPresetName({ id: state.timbre.id || '', name: state.timbre.name }) : 'DSC' }, '音色「' + (state.timbre.name || 'DSC') + '」'));
    if (res.eye) extra.push(t('imp.extraEye', null, '眼睛曲线已载入'));
    if (res.vocalRowCount > 1) extra.push(t('imp.extraRows', { n: res.vocalRowCount }, res.vocalRowCount + ' 行首尾相接'));
    if (!res.acc && res.patterns && res.patterns.length) {
      extra.push(t('imp.extraDscPat', { n: res.patterns.length }, 'DSC 编曲片段 ' + res.patterns.length + ' 个（未摆放，按「自动伴奏」可生成伴奏）'));
    }
    if (res.warn) extra.push(tMsg(res.warn));
    if (res.enc && res.enc !== 'utf-8') extra.push(t('imp.extraEnc', { enc: encLabel(res.enc) }, '编码 ' + encLabel(res.enc)));
    if (res.repaired) extra.push(t('imp.extraRepaired', { n: res.repaired }, '修复乱码歌词 ' + res.repaired + ' 处'));
    setTool('select', true);
    setStatus(t('imp.importedSummary', { fmt: res.format || '', name: f.name, notes: notes.length, extra: extra.length ? ' · ' + extra.join(' · ') : '' }, '已导入 ' + (res.format || '') + '「' + f.name + '」：' + notes.length + ' 个音符' +
      (extra.length ? ' · ' + extra.join(' · ') : '')));
  }

  function formatTempoSummary(tempos) {
    var list = Array.isArray(tempos) && tempos.length ? tempos : [{ beat: 0, bpm: 120 }];
    var head = Math.round(list[0].bpm * 100) / 100;
    return list.length > 1 ? t('imp.bpmSegs', { bpm: head, n: list.length }, head + ' BPM（共 ' + list.length + ' 段）') : (head + ' BPM');
  }

  function promptImportedBpm(currentTempos, importedTempos, fileName, notice) {
    notice = notice || '';
    var curText = formatTempoSummary(currentTempos);
    var impText = formatTempoSummary(importedTempos);
    var same = JSON.stringify(currentTempos) === JSON.stringify(importedTempos);
    var body = '<p>' + t('imp.bpmIntro', { name: escAttr(fileName) }, '已将「' + escAttr(fileName) + '」附加为新人声音层。') + '</p>' +
      '<div class="import-bpm-summary">' +
      '<div>' + t('imp.bpmCur', null, '现有工程 BPM：') + '<b>' + escAttr(curText) + '</b></div>' +
      '<div>' + t('imp.bpmImp', null, '导入轨道 BPM：') + '<b>' + escAttr(impText) + '</b></div>' +
      '</div>' +
      '<p>' + (same ? t('imp.bpmSame', null, '两者速度一致，可选择保持现有设置或应用导入速度点。') : t('imp.bpmDiff', null, '请选择保持现有工程的 BPM，还是改为使用导入轨道的 BPM：')) + '</p>' +
      (notice ? '<p>' + escAttr(notice) + '</p>' : '');
    var m = modal(t('imp.bpmTitle', null, '选择工程 BPM'), body,
      '<button class="abtn primary" id="bpmKeep">' + t('imp.bpmKeep', null, '保持现有 BPM') + '</button>' +
      '<button class="abtn" id="bpmUse">' + t('imp.bpmUse', null, '使用导入轨道的 BPM') + '</button>');
    m.el.setAttribute('role', 'dialog');
    m.el.setAttribute('aria-modal', 'true');
    m.el.setAttribute('aria-label', t('imp.bpmTitle', null, '选择工程 BPM'));
    $('#bpmKeep', m.el).onclick = function () {
      m.close();
      setStatus(t('imp.appendedKeepStatus', { name: fileName, bpm: curText }, '已附加音层「' + fileName + '」· 保持现有 BPM（' + curText + '）') + (notice ? ' · ' + notice : ''));
    };
    $('#bpmUse', m.el).onclick = function () {
      m.close();
      applyTempos(importedTempos);
      setStatus(t('imp.appendedUseStatus', { name: fileName, bpm: impText }, '已附加音层「' + fileName + '」· 已切换为导入轨道 BPM（' + impText + '）') + (notice ? ' · ' + notice : ''));
    };
    return m;
  }

  function applyAppended(f, res) {
    var rawTracks = (res.selectedTracks && res.selectedTracks.length)
      ? res.selectedTracks
      : [{
          name: res.selectedTrackName || '',
          notes: res.notes || [],
          pit: res.pit,
          sampledPit: res.sampledPit,
          lang: res.lang,
          phonemizer: res.phonemizer,
          timbre: res.timbre,
          vol: res.vol,
          pan: res.pan,
          muted: res.muted
        }];
    var nonEmpty = rawTracks.filter(function (tr) { return tr && tr.notes && tr.notes.length; });
    if (!nonEmpty.length) throw new Error(t('imp.noNotes', null, '这个文件里没有音符'));
    var unmuteVpr = unmuteVprSelection(res, nonEmpty);

    saveActiveRollUndo();
    enforceSingleAccompTrack(state.score);
    var currentTempos = NSG.TEMPO.list(state.score);
    var curActive = activeVocalTrack();
    if (curActive && !curActive.timbre) curActive.timbre = NSG.cloneTimbre(state.timbre);
    var fallbackLang = trackLang(curActive);
    var fallbackTimbre = state.timbre;
    var baseName = f.name.replace(/\.[^.]+$/, '') || t('imp.defaultTrackName', null, '导入音轨');
    var vOrder = vocalTrackIndices(state.score).length;
    var instIdx = accompTrackIndex(state.score);
    var insertAt = instIdx >= 0 ? instIdx : state.score.tracks.length;
    var firstAddedIdx = insertAt;
    var addedNotes = 0;

    nonEmpty.forEach(function (tr, k) {
      var name = tr.name || (nonEmpty.length > 1 ? baseName + ' #' + (k + 1) : baseName);
      var norm = normNotes(tr.notes);
      var trPit = (!res.fromNsgProject && NSG.TUNING && NSG.TUNING.decoupleTrackPitch)
        ? NSG.TUNING.decoupleTrackPitch(norm, tr.pit, { sampledPit: !!(tr.sampledPit || res.sampledPit) })
        : (tr.pit ? NSG.TUNING.pitPoints(tr.pit) : []);
      addedNotes += norm.length;
      var tLang = tr.lang || res.lang || fallbackLang;
      var tPh = tr.phonemizer !== undefined ? tr.phonemizer : (tr.lang || undefined);
      var tTimbre = tr.timbre ? NSG.migrateTimbre(tr.timbre) : (res.timbre ? NSG.migrateTimbre(res.timbre) : NSG.cloneTimbre(fallbackTimbre));
      var trackObj = {
        id: 'v' + uid(),
        name: name,
        type: 'vocal',
        color: LAYER_COLORS[(vOrder + k) % LAYER_COLORS.length],
        visible: true,
        muted: !unmuteVpr && !!tr.muted,
        vol: typeof tr.vol === 'number' && isFinite(tr.vol) ? Math.max(0, Math.min(TRACK_VOL_MAX, tr.vol)) : 1,
        pan: typeof tr.pan === 'number' && isFinite(tr.pan) ? Math.max(-1, Math.min(1, tr.pan)) : 0,
        lang: tLang,
        phonemizer: tPh,
        timbre: tTimbre,
        presetDirty: false,
        notes: norm
      };
      if (trPit && trPit.length) trackObj.pit = trPit;
      state.score.tracks.splice(insertAt + k, 0, trackObj);
    });

    state.activeTrackIndex = firstAddedIdx;
    syncActiveTrackToUI();
    syncRollTracks({ preserveView: true });
    updateStat();
    syncInspector();
    state.dirty = true;
    renderAndAnalyze(60);
    setTool('select', true);

    var importedTempos = (res.tempos && res.tempos.length)
      ? NSG.TEMPO.list({ tempo: res.tempos[0].bpm, tempos: res.tempos })
      : NSG.TEMPO.list({ tempo: res.tempo || state.score.tempo || 120 });
    var notice = [
      unmuteVpr ? t('imp.vprUnmuted', null, '所选 VPR 人声轨全部静音，已自动取消静音') : '',
      res.warn ? tMsg(res.warn) : ''
    ].filter(Boolean).join(' · ');
    setStatus(t('imp.appendedStatus', { tracks: nonEmpty.length, notes: addedNotes }, '已附加 ' + nonEmpty.length + ' 条音层（' + addedNotes + ' 个音符），请确认 BPM') + (notice ? ' · ' + notice : ''));
    promptImportedBpm(currentTempos, importedTempos, f.name, notice);
  }

  function encLabel(e) {
    return ({ shift_jis: 'Shift-JIS', gbk: 'GBK', 'euc-jp': 'EUC-JP' })[e] ||
      String(e || '').replace(/_/g, '-').toUpperCase();
  }

  var importRequest = 0;
  function currentImport(context) {
    if (context.ticket !== importRequest) return false;
    if (context.key !== projectKey()) { setStatus(t('imp.staleProject', null, '工程已变化，本次导入结果未应用，请重新导入')); return false; }
    return true;
  }
  async function finishImport(f, res, context) {
    context = context || { ticket: importRequest, key: projectKey() };
    var isAppend = !!(context && context.mode === 'append');
    if (!res.project && !res.fromNsgProject) {
      setStatus(t('imp.normalizing', null, '正在整理导入的音高曲线…'));
      res = (await getRenderer().compute('normalize', { imported: res, options: { decouple: true } })).imported;
    }
    if (!currentImport(context)) return;
    await NSG.ensureScoreDicts(res);
    if (!currentImport(context)) return;
    if (state.playing || playPending) stopPlay();
    if (isAppend) {
      applyAppended(f, res);
      return;
    }
    if (res.project) {
      /* NSG 原生工程：完整恢复工程设置、多音层参数及伴奏轨。 */
      var p = res.project;
      state.score = p.score;
      if (!state.score.tracks[1]) state.score.tracks[1] = { id: 'i', name: t('layer.accompName', null, '伴奏'), type: 'inst', notes: [] };
      enforceSingleAccompTrack(state.score);
      var reqActive = p.mix && Number.isInteger(p.mix.activeTrackIndex) ? p.mix.activeTrackIndex : -1;
      state.activeTrackIndex = reqActive >= 0 && isVocalTrack(state.score.tracks[reqActive])
        ? reqActive : (vocalTrackIndices(state.score)[0] || 0);
      var baseTimbre = p.timbre ? NSG.migrateTimbre(p.timbre) : NSG.presetTimbre('f2');
      var multiVocal = vocalTrackIndices(state.score).length > 1;
      (state.score.tracks || []).forEach(function (tr) {
        if (!isVocalTrack(tr)) return;
        if (tr.timbre) tr.timbre = NSG.migrateTimbre(tr.timbre);
        else if (multiVocal) tr.timbre = NSG.cloneTimbre(baseTimbre);
        if (typeof tr.vol === 'number' && isFinite(tr.vol)) tr.vol = Math.max(0, Math.min(TRACK_VOL_MAX, tr.vol));
        if (typeof tr.pan === 'number' && isFinite(tr.pan)) tr.pan = Math.max(-1, Math.min(1, tr.pan));
      });
      state.timbre = (activeVocalTrack() && activeVocalTrack().timbre) || baseTimbre;
      state.presetDirty = !!(activeVocalTrack() && activeVocalTrack().presetDirty);
      state.harmHi = null;
      state.loveReverb = !!(p.mix && p.mix.loveReverb === true);
      state.hd = !!(p.mix && p.mix.hd === true);
      state.hifiWaveguide = normHifiAmount(p.mix && p.mix.hifiWaveguide, 1);
      state.hifiHighPolish = normHifiAmount(p.mix && p.mix.hifiHighPolish, 1);
      state.muteVox = !!(p.mix && p.mix.muteVox === true);
      state.muteAcc = !!(p.mix && p.mix.muteAcc === true);
      syncQuality();
      state.volVox = 0.56;
      if (p.mix) {
        if (typeof p.mix.volVox === 'number') state.volVox = Math.max(0, Math.min(1.3, p.mix.volVox));
        if (typeof p.mix.volAcc === 'number') state.volAcc = Math.max(0, Math.min(1.3, p.mix.volAcc));
      }
      state.voxAudio = null;
      state.accPcm = null; state.accAudio = null; state.accKey = null;
      state.tm = null;
      if (!state.score.tempos || state.score.tempos.length <= 1) {
        NSG.TEMPO.apply(state.score, NSG.TEMPO.list(state.score));
      }
      updateMix();
      syncActiveTrackToUI();
      roll.setNotes(activeVocalTrack().notes, { pit: activeVocalTrack().pit || [] });
      syncRollTracks({ skipSetNotes: true });
      $('#tempo').value = state.score.tempo;
      $('#langSel').value = roll.phonemizer || roll.lang;
      fillKeySel();
      state.dirty = true;
      syncRollTempos();
      renderAndAnalyze(60);
      setTool('select', true);
      setStatus(t('imp.loadedNsg', { name: f.name, notes: activeVocalTrack().notes.length }, '工程已载入：' + f.name + '（' + activeVocalTrack().notes.length + ' 个音符）') +
        (res.selectedTrackName ? t('imp.loadedTrack', { name: res.selectedTrackName }, ' · 轨道「' + res.selectedTrackName + '」') : '') +
        (res.repaired ? t('imp.repairedLyrics', { n: res.repaired }, ' · 修复乱码歌词 ' + res.repaired + ' 处') : ''));
      return;
    }
    applyImported(f, res);
  }

  function chooseImportTrack(f, res, context) {
    context = context || { ticket: importRequest, key: projectKey() };
    var isAppend = !!(context && context.mode === 'append');
    if (res.project) {
      if (!isAppend) return finishImport(f, res, context);
      var p = res.project;
      var vTracks = ((p.score && p.score.tracks) || []).filter(function (tr) { return isVocalTrack(tr) && tr.notes && tr.notes.length; });
      if (!vTracks.length) throw new Error(t('imp.noVocalTracks', null, '这个工程里没有可附加的人声轨道'));
      res = {
        format: 'NSG',
        title: res.title || f.name,
        tempo: (p.score && p.score.tempo) || 120,
        tempos: NSG.TEMPO.list(p.score),
        fromNsgProject: true,
        importTracks: vTracks.map(function (tr, i) {
          return {
            name: tr.name || t('layer.defaultName', { n: i + 1 }, '人声 ' + (i + 1)), notes: tr.notes.slice(), pit: tr.pit ? tr.pit.slice() : undefined, repaired: 0,
            lang: tr.lang || (p.score && p.score.lang) || 'zh',
            phonemizer: tr.phonemizer !== undefined ? tr.phonemizer : (p.score && p.score.phonemizer),
            timbre: tr.timbre || p.timbre,
            vol: tr.vol, pan: tr.pan, muted: !!tr.muted
          };
        })
      };
    }
    var tracks = res.importTracks || [];
    var nonEmpty = [];
    var onlyVocal = res.format === 'DSC' && tracks.some(function (tr) { return tr.vocalRowCount !== 0 && tr.notes && tr.notes.length; });
    tracks.forEach(function (tr, index) {
      if (onlyVocal && tr.vocalRowCount === 0) return;
      if (tr.notes && tr.notes.length) nonEmpty.push(index);
    });
    if (!nonEmpty.length) return finishImport(f, res, context);
    var first = nonEmpty[0];
    // 单条非空轨道直接导入，无需多余确认。
    if (nonEmpty.length === 1) {
      var single = NSG.IO.selectImportTracks ? NSG.IO.selectImportTracks(res, nonEmpty) : NSG.IO.selectImportTrack(res, first);
      return finishImport(f, single, context);
    }
    var body = '<p>' + (isAppend
      ? t('imp.chooseTrackAppendLead', { name: escAttr(f.name) }, '「' + escAttr(f.name) + '」包含多个轨道。请勾选要附加为新人声音层的轨道，或点击「导入全部轨道」。')
      : t('imp.chooseTrackReplaceLead', { name: escAttr(f.name) }, '「' + escAttr(f.name) + '」包含多个轨道。请勾选要导入的轨道（多选将作为独立人声音层），或点击「导入全部轨道」。')) + '</p>' +
      '<div class="import-track-list" role="group" aria-label="' + escAttr(t('imp.chooseTrackAria', null, '导入轨道')) + '">';
    tracks.forEach(function (tr, index) {
      if (onlyVocal && tr.vocalRowCount === 0) return;
      body += '<label class="import-track-row' + (tr.notes.length ? '' : ' empty') + '">' +
        '<input type="checkbox" name="importTrack" value="' + index + '"' + (index === first || (res.format === 'DSC' && tr.vocalRowCount !== 0) ? ' checked' : '') +
        (tr.notes.length ? '' : ' disabled') + '><span class="import-track-name">' + escAttr(tr.name) +
        '</span><span class="import-track-count">' + escAttr(t('layer.noteCount', { n: tr.notes.length }, tr.notes.length + ' 个音符')) + '</span></label>';
    });
    body += '</div><p>' + (isAppend
      ? t('imp.chooseTrackAppendFoot', null, '所选轨道将作为新的人声音层附加到当前工程，不会覆盖现有音轨或音色。')
      : t('imp.chooseTrackReplaceFoot', null, '多选轨道将分别建立独立音层，其余未选轨道不会叠加或转为伴奏。')) + '</p>';
    setStatus(t('imp.chooseTrackStatus', null, '请选择要导入的轨道'));
    var m = modal(t('imp.chooseTrackTitle', null, '选择导入轨道'), body,
      '<button class="abtn primary" id="importTrackOk">' + t('imp.chooseTrackOk', null, '导入所选轨道') + '</button>' +
      '<button class="abtn" id="importTrackAll">' + t('imp.chooseTrackAll', null, '导入全部轨道') + '</button>' +
      '<button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    m.el.setAttribute('role', 'dialog');
    m.el.setAttribute('aria-modal', 'true');
    m.el.setAttribute('aria-label', t('imp.chooseTrackTitle', null, '选择导入轨道'));
    async function runTrackSelection(indices) {
      try {
        var selected = NSG.IO.selectImportTracks ? NSG.IO.selectImportTracks(res, indices) : NSG.IO.selectImportTrack(res, indices[0]);
        m.close();
        await processingTask(function () { return finishImport(f, selected, context); });
      } catch (e) {
        var emsg = tMsg(e.message);
        alert(t('imp.failed', { msg: emsg }, '导入失败：' + emsg));
        setStatus(t('imp.failed', { msg: emsg }, '导入失败：' + emsg));
      }
    }
    $('#importTrackOk', m.el).onclick = function () {
      var boxes = $$('input[name="importTrack"]:checked', m.el);
      if (!boxes || !boxes.length) {
        var singleBox = $('input[name="importTrack"]:checked', m.el);
        if (singleBox) boxes = [singleBox];
      }
      var indices = [];
      for (var i = 0; i < (boxes ? boxes.length : 0); i++) {
        var idx = Number(boxes[i].value);
        if (isFinite(idx)) indices.push(idx);
      }
      if (!indices.length) { alert(t('imp.chooseTrackNoneAlert', null, '请至少选择一个轨道')); return; }
      return runTrackSelection(indices);
    };
    $('#importTrackAll', m.el).onclick = function () {
      return runTrackSelection(nonEmpty);
    };
    m.el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); m.close(); }
    });
    var firstBox = $('input[name="importTrack"]:checked', m.el);
    if (firstBox && firstBox.focus) firstBox.focus();
  }

  function readImportFile(f, mode, inputEl) {
    if (!f) return Promise.resolve();
    var context = { ticket: ++importRequest, key: projectKey(), mode: mode || 'replace' };
    setStatus(t('imp.reading', null, '正在读取工程…'));
    var finish = beginProcessing();
    var rd = new FileReader();
    rd.onload = async function () {
      try {
        var bytes = new Uint8Array(rd.result);
        var kind = NSG.IO.sniff(bytes, f.name);
        if (kind === 'unknown') { setStatus(t('imp.unknownFormat', null, '无法识别文件格式')); alert(t('imp.unknownFormatAlert', null, '认不出这个文件格式。支持 MIDI、VSQ、VSQX、VPR、SVP、UST、USTX、TLP、TLPX、NN、Y77、AISP、ACEP、VCP、VSP、DSC、ufdata、NSG、CCS、CCST、TSSLN、DV、SK、MTP、VSPX 和 VOG。')); return; }
        setStatus(t('imp.reading', null, '正在读取工程…'));
        var res = (await getRenderer().compute('read', { name: f.name, bytes: bytes, kind: kind })).imported;
        if (!currentImport(context)) return;
        await chooseImportTrack(f, res, context);
      } catch (e) {
        if (context.ticket !== importRequest || e.name === 'AbortError') return;
        var emsg = tMsg(e.message);
        alert(t('imp.failed', { msg: emsg }, '导入失败：' + emsg));
        setStatus(t('imp.failed', { msg: emsg }, '导入失败：' + emsg));
      }
    };
    if (inputEl) inputEl.value = '';
    // FileReader remains on the UI thread; parsing and fitting run in the worker.
    return new Promise(function (resolve) {
      var loaded = rd.onload;
      function complete() { finish(); resolve(); }
      rd.onload = function () { Promise.resolve(loaded()).finally(complete); };
      rd.onerror = function () { if (context.ticket === importRequest) setStatus(t('imp.readError', null, '读取文件失败')); complete(); };
      rd.onabort = function () { if (context.ticket === importRequest) setStatus(t('imp.canceled', null, '已取消导入')); complete(); };
      try { rd.readAsArrayBuffer(f); }
      catch (e) { setStatus(t('imp.readErrorDetail', { msg: tMsg(e.message) }, '读取文件失败：' + e.message)); complete(); }
    });
  }

  function bindFileInput() {
    var mainInp = $('#fileInput');
    if (mainInp) mainInp.addEventListener('change', function () { return readImportFile(this.files[0], 'replace', this); });
    var layerInp = $('#layerFileInput');
    if (layerInp) layerInp.addEventListener('change', function () { return readImportFile(this.files[0], 'append', this); });
  }

  /* ---------------- 模态 ---------------- */
  function modal(title, body, foot) {
    closeContextMenu();
    var rootEl = $('#modalRoot');
    rootEl.classList.add('on');
    rootEl.innerHTML = '';
    var mask = document.createElement('div');
    mask.className = 'mask';
    var box = document.createElement('div');
    box.className = 'modal';
    if (typeof box.setAttribute === 'function') {
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', String(title || '').replace(/<[^>]*>/g, '').trim());
    }
    var closeAria = escAttr(t('common.close', null, '关闭'));
    box.innerHTML = '<div class="mhead"><span>' + title + '</span><button type="button" data-close aria-label="' + closeAria + '">×</button></div>' +
      '<div class="mbody">' + body + '</div>' +
      '<div class="mfoot">' + (foot || '<button class="abtn" data-close>' + t('common.close', null, '关闭') + '</button>') + '</div>';
    rootEl.appendChild(mask); rootEl.appendChild(box);
    if (document.body && document.body.classList) document.body.classList.add('modal-open');
    // Esc 关闭；关闭后把焦点还给打开前的控件
    var opener = document.activeElement;
    if (modal.detach) modal.detach();   // 弹窗套弹窗时，旧弹窗的 Esc 监听一并撤掉
    var closed = false;
    var api = { el: box, close: close, onClose: null, isOpen: function () { return box.parentNode === rootEl; } };
    function cleanupModal() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (modal.detach === cleanupModal) {
        modal.detach = null;
        if (document.body && document.body.classList) document.body.classList.remove('modal-open');
      }
      if (typeof api.onClose === 'function') {
        var fn = api.onClose; api.onClose = null; fn();
      }
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    function close() {
      cleanupModal();
      rootEl.classList.remove('on'); rootEl.innerHTML = '';
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    document.addEventListener('keydown', onKey);
    modal.detach = cleanupModal;
    mask.onclick = close;
    $$('[data-close]', box).forEach(function (b) { b.onclick = close; });
    var first = box.querySelector('.mfoot .abtn.primary') || box.querySelector('.mfoot .abtn:not([data-close])') || box.querySelector('.mfoot [data-close]');
    if (first && first.focus) setTimeout(function () { if (!box.contains(document.activeElement)) first.focus(); }, 0);
    return api;
  }

  function openHelp() {
    var rows = [
      [t('help.sec.play', null, '播放')],
      [t('help.k.space', null, '<kbd>空格</kbd>'), t('help.d.space', null, '从游标播放 / 停止（停止保留位置）')],
      [t('help.k.home', null, '<kbd>Home</kbd>'), t('help.d.home', null, '游标回到开头')],
      [t('help.k.ruler', null, '点击 / 拖动标尺'), t('help.d.ruler', null, '定位游标')],
      [t('help.sec.edit', null, '编辑')],
      [t('help.k.tools', null, '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd>'), t('help.d.tools', null, '画笔 / 框选（默认） / 擦除 / PIT 控制点 / PIT画笔（右键或 Shift+左键擦除画笔曲线）')],
      [t('help.k.undo', null, '<kbd>Ctrl</kbd>+<kbd>Z</kbd> · <kbd>Ctrl</kbd>+<kbd>Y</kbd>'), t('help.d.undo', null, '撤销 · 重做')],
      [t('help.k.clip', null, '<kbd>Ctrl</kbd>+<kbd>X</kbd> · <kbd>C</kbd> · <kbd>V</kbd>'), t('help.d.clip', null, '剪切 · 复制 · 粘贴')],
      [t('help.k.oct', null, '<kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd>'), t('help.d.oct', null, '升高 / 降低八度')],
      [t('help.k.bar', null, '<kbd>Ctrl</kbd>+<kbd>←</kbd> / <kbd>→</kbd>'), t('help.d.bar', null, '前移 / 后移一个小节（4 拍）')],
      [t('help.k.sel', null, '<kbd>Ctrl</kbd>+<kbd>A</kbd> · <kbd>Esc</kbd>'), t('help.d.sel', null, '全选 · 取消选择')],
      [t('help.k.del', null, '<kbd>Delete</kbd>'), t('help.d.del', null, '删除选中音符')],
      [t('help.k.slur', null, '<kbd>S</kbd>'), t('help.d.slur', null, '延音（接着上一个音节唱）')],
      [t('help.k.dbl', null, '双击音符'), t('help.d.dbl', null, '编辑歌词（或在右键菜单点批量填词）')],
      [t('help.k.rclick', null, '右键'), t('help.d.rclick', null, '在 PIT 控制点上选择后段形状或删除；其他位置：框选模式弹出组件菜单，画笔/擦除模式删除音符')],
      [t('help.k.mclick', null, '中键'), t('help.d.mclick', null, '点击 PIT 内部控制点直接删除；曲线首尾点不可删除')],
      [t('help.k.cclick', null, '<kbd>Ctrl</kbd>+点击'), t('help.d.cclick', null, '逐个加选 / 取消选中音符')],
      [t('help.k.sclick', null, '<kbd>Shift</kbd>+点击'), t('help.d.sclick', null, '先点首音符，再 Shift+点尾音符，选中整个范围；PIT 模式下切换 S 曲线 / 直线；右键控制点选择后段形状或删除')],
      [t('help.k.altDrag', null, '<kbd>Alt</kbd>+拖动'), t('help.d.altDrag', null, '临时切换强制吸附网格（拖动音符起点或结尾严格对齐当前网格线）')],
      [t('help.sec.view', null, '视图')],
      [t('help.k.fit', null, '<kbd>F</kbd>'), t('help.d.fit', null, '适配全曲')],
      [t('help.k.vis', null, '<kbd>I</kbd> · <kbd>O</kbd> · <kbd>U</kbd>'), t('help.d.vis', null, '显示 / 隐藏 PIT 曲线 · 控制点 · 颤音按钮')],
      [t('help.k.wheel', null, '滚轮 · <kbd>Shift</kbd>+滚轮'), t('help.d.wheel', null, '上下 · 横向滚动')],
      [t('help.k.cwheel', null, '<kbd>Ctrl</kbd>+滚轮'), t('help.d.cwheel', null, '以鼠标为中心横向缩放')],
      [t('help.k.f1', null, '<kbd>F1</kbd> · <kbd>?</kbd>'), t('help.d.f1', null, '打开本页')]
    ];
    var html = '<table class="keys">' + rows.map(function (r) {
      return r.length === 1 ? '<tr class="sec"><td colspan="2">' + r[0] + '</td></tr>'
        : '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>';
    }).join('') + '</table>';
    modal(t('help.title', null, '快捷键与操作'), html,
      '<button class="abtn" id="helpAbout">' + t('help.aboutBtn', null, '关于本软件') + '</button><button class="abtn primary" data-close>' + t('common.gotIt', null, '知道了') + '</button>');
    $('#helpAbout').onclick = openAbout;
  }

  function escAttr(t) {
    return String(t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function askText(title, label, value, cb) {
    var m = modal(title,
      '<h3>' + label + '</h3>' +
      '<input id="askIn" class="numin" style="width:100%;height:26px;font-size:13px" value="' + escAttr(value) + '">',
      '<button class="abtn" id="askOk">' + t('common.ok', null, '确定') + '</button><button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    var inp = $('#askIn', m.el);
    setTimeout(function () { inp.focus(); inp.select(); }, 30);
    function ok() { var v = inp.value; m.close(); cb(v); }
    $('#askOk', m.el).onclick = ok;
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') ok();
      else if (e.key === 'Escape') m.close();
    });
  }

  /* ---------------- 批量输入歌词 ---------------- */
  function hideBatchSlurs(text, lang) {
    var wordLang = lang === 'vi' || NSG.isWordPhonemizer(lang);
    var separator = /[\s,.!?¡¿;:，。！？；：、()（）「」『』“”"«»…]/;
    return text.replace(/\[[^\]]*\]|\+[~*]|[-—–―‿=＿~～]+/g, function (mark, offset) {
      if (mark.charAt(0) === '[') return mark;
      // Word-internal hyphens and joins belong to the lyric, not to a slur note.
      var before = text.charAt(offset - 1), after = text.charAt(offset + mark.length);
      if (wordLang && ((before && !separator.test(before)) || (after && !separator.test(after)))) return mark;
      // Keep adjacent romanized lyrics or rest/breath tokens from merging.
      return /[a-zA-Z0-9]/.test(before) && /[a-zA-Z0-9]/.test(after) ? ' ' : '';
    });
  }

  function formatNotesForBatchBox(notes, lang) {
    var out = '';
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var tok = n.slur ? (n.lyric === '+~' || n.lyric === '+*' ? n.lyric : '-') : (n.lyric || 'a');
      if (i > 0) {
        var prev = out.slice(-1);
        var needSpace = lang === 'vi' || NSG.isWordPhonemizer(lang) ||
          (/[a-zA-Z0-9+*\]-]$/.test(prev) && /^[a-zA-Z0-9+\[]/.test(tok)) ||
          tok === '+' || tok === '+~' || tok === '+*';
        if (needSpace) out += ' ';
      }
      out += tok;
    }
    return out;
  }

  function openBatchLyric(options) {
    var opts = options || {};
    var all = (roll.notes || []).slice().sort(function (a, b) {
      return a.start - b.start || (a.id > b.id ? 1 : -1);
    });
    if (!all.length) {
      alert(t('batch.emptyTrackAlert', null, '当前轨道没有音符，请先在左侧点「按歌词铺音符」或切换画笔绘制音符。'));
      return;
    }
    var picked = all.filter(function (n) { return roll.sel[n.id]; });
    var fromSelCount = picked.length ? (all.length - all.indexOf(picked[0])) : 0;
    var defaultScope = opts.scope || (picked.length ? 'selected' : 'all');
    if (defaultScope === 'selected' && !picked.length) defaultScope = 'all';
    var lang = roll.phonemizer || roll.lang || state.score.lang || 'zh';
    var langLabel = tLangName(lang);

    var html =
      '<p class="eyehint">' + t('batch.hint', { lang: escAttr(langLabel) }, '按当前语种（<b>' + escAttr(langLabel) + '</b>）自动分词并逐个填入目标音符。支持 <code>-</code> / <code>‿</code> 延音，<code>+</code> / <code>+~</code> 接续多音节，<code>SP</code> / <code>br</code> / <code>AP</code> 休止换气，以及 <code>[音素标注]</code>。') + '</p>' +
      '<fieldset class="tune-group"><legend>' + t('batch.scopeLegend', null, '填入范围') + '</legend><div class="tune-options">' +
      '<label><input type="radio" name="batchScope" value="selected"' + (picked.length ? (defaultScope === 'selected' ? ' checked' : '') : ' disabled') + '> ' + t('batch.scopeSelected', { n: picked.length }, '仅选中音符（' + picked.length + '）') + '</label>' +
      '<label><input type="radio" name="batchScope" value="fromSelected"' + (picked.length ? (defaultScope === 'fromSelected' ? ' checked' : '') : ' disabled') + '> ' + t('batch.scopeFromSelected', { n: fromSelCount }, '从首个选中起顺延（' + fromSelCount + '）') + '</label>' +
      '<label><input type="radio" name="batchScope" value="all"' + (defaultScope === 'all' ? ' checked' : '') + '> ' + t('batch.scopeAll', { n: all.length }, '全部音符（' + all.length + '）') + '</label>' +
      '</div></fieldset>' +
      '<div class="tune-options" style="margin:6px 0 8px">' +
      '<label><input type="checkbox" id="batchSkipSlur"> ' + t('batch.skipSlur', null, '跳过已有延音符（- / ‿）') + '</label>' +
      '<label><input type="checkbox" id="batchAutoSplit" checked> ' + t('batch.autoSplit', null, '多音节外语词自动补 + 延展') + '</label>' +
      '</div>' +
      '<div class="row2" style="margin-bottom:6px">' +
      '<button type="button" class="abtn tiny" id="batchFromNotes">' + t('batch.fromNotes', null, '读取现有歌词') + '</button>' +
      '<button type="button" class="abtn tiny" id="batchFromLyr">' + t('batch.fromLyr', null, '从左侧歌词框导入') + '</button>' +
      '<button type="button" class="abtn tiny" id="batchClear">' + t('batch.clear', null, '清空') + '</button>' +
      '</div>' +
      '<textarea id="batchInput" rows="4" style="width:100%;font-size:13px" placeholder="' + escAttr(t('batch.placeholder', null, '在这里输入或粘贴批量歌词…')) + '"></textarea>' +
      '<div class="cap2" style="margin-top:8px">' + t('batch.previewCap', null, '实时分词预览') + '<span class="mini" id="batchSummary"></span></div>' +
      '<div class="batch-lyric-preview" id="batchPreview"></div>';

    var m = modal(t('batch.title', null, '批量输入 / 修改歌词'), html,
      '<button type="button" class="abtn primary" id="batchOk">' + t('batch.okBtn', null, '确定填入') + '</button><button type="button" class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    m.el.classList.add('wide');

    var inp = $('#batchInput', m.el);
    var skipChk = $('#batchSkipSlur', m.el);
    var autoChk = $('#batchAutoSplit', m.el);
    var previewEl = $('#batchPreview', m.el);
    var summaryEl = $('#batchSummary', m.el);
    var fullInputText = '';

    function setInputText(text, keepSelection) {
      fullInputText = text;
      var visible = skipChk.checked ? hideBatchSlurs(text, lang) : text;
      if (inp.value === visible) return;
      var start = inp.selectionStart, end = inp.selectionEnd;
      inp.value = visible;
      if (keepSelection && typeof inp.setSelectionRange === 'function') {
        inp.setSelectionRange(hideBatchSlurs(text.slice(0, start), lang).length,
          hideBatchSlurs(text.slice(0, end), lang).length);
      }
    }

    function currentScope() {
      var checked = $('input[name="batchScope"]:checked', m.el);
      return checked ? checked.value : 'all';
    }
    function allForScope() {
      var scope = currentScope();
      return scope === 'selected' && picked.length ? picked
        : scope === 'fromSelected' && picked.length ? all.slice(all.indexOf(picked[0]))
        : all;
    }
    function targetNotes() {
      var base = allForScope();
      return skipChk.checked ? base.filter(function (n) { return !n.slur; }) : base;
    }
    function parsedTokens() {
      return NSG.tokenizeBatchLyrics(inp.value, lang, { autoSplitMultiSyllable: autoChk.checked });
    }
    function refreshPreview() {
      var targets = targetNotes();
      var tokens = parsedTokens();
      var total = Math.max(targets.length, tokens.length);
      var htmlChips = '';
      var limit = Math.min(total, 180);
      for (var i = 0; i < limit; i++) {
        if (i < targets.length && i < tokens.length) {
          var tok = tokens[i], isSlurTok = /^(?:-|‿|=|\+|\+~|\+\*)$/.test(tok);
          htmlChips += '<span class="batch-lyric-chip' + (isSlurTok ? ' slur' : '') + '">' +
            '<span class="idx">#' + (i + 1) + ' ' + escAttr(noteName(targets[i].pitch)) + '</span>' +
            '<span class="arr">→</span><span class="tok">' + escAttr(tok) + '</span></span>';
        } else if (i >= targets.length) {
          htmlChips += '<span class="batch-lyric-chip extra" title="' + escAttr(t('batch.extraTitle', null, '超出目标音符数量，将忽略')) + '">' +
            '<span class="idx">' + escAttr(t('batch.extraBadge', null, '多余')) + '</span><span class="tok">' + escAttr(tokens[i]) + '</span></span>';
        } else {
          htmlChips += '<span class="batch-lyric-chip unfilled" title="' + escAttr(t('batch.keepTitle', null, '未覆盖的音符将保持原歌词')) + '">' +
            '<span class="idx">#' + (i + 1) + ' ' + escAttr(noteName(targets[i].pitch)) + '</span>' +
            '<span class="tok">' + escAttr(t('batch.keepBadge', { lyric: targets[i].lyric || 'a' }, '保持「' + (targets[i].lyric || 'a') + '」')) + '</span></span>';
        }
      }
      if (total > limit) {
        htmlChips += '<span class="batch-lyric-chip unfilled">' + escAttr(t('batch.moreItems', { n: total }, '…共 ' + total + ' 项')) + '</span>';
      }
      previewEl.innerHTML = htmlChips || '<span class="eyehint">' + escAttr(t('batch.emptyPreview', null, '输入歌词后将在这里预览每个音符的对应歌词')) + '</span>';
      var diffMsg = tokens.length > targets.length ? t('batch.diffExtra', { n: tokens.length - targets.length }, ' · 多出 ' + (tokens.length - targets.length) + ' 个词将忽略')
        : tokens.length < targets.length ? t('batch.diffKeep', { n: targets.length - tokens.length }, ' · 其余 ' + (targets.length - tokens.length) + ' 个音保持原词')
        : t('batch.diffExact', null, ' · 数量完全匹配');
      summaryEl.textContent = t('batch.summary', { targets: targets.length, tokens: tokens.length, diff: tokens.length ? diffMsg : '' }, '目标 ' + targets.length + ' 音符 · 解析 ' + tokens.length + ' 词元' + (tokens.length ? diffMsg : ''));
      $('#batchOk', m.el).disabled = !targets.length || !tokens.length;
    }

    setInputText(typeof opts.seedText === 'string' && opts.seedText.trim()
      ? opts.seedText
      : formatNotesForBatchBox(targetNotes(), lang));

    $$('input[name="batchScope"]', m.el).forEach(function (r) { r.onchange = refreshPreview; });
    skipChk.onchange = function () {
      setInputText(fullInputText);
      refreshPreview();
    };
    autoChk.onchange = refreshPreview;
    inp.addEventListener('input', function (e) {
      if (e.isComposing) return;
      setInputText(inp.value, true);
      refreshPreview();
    });
    inp.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        $('#batchOk', m.el).click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        m.close();
      }
    });
    $('#batchFromNotes', m.el).onclick = function () {
      setInputText(formatNotesForBatchBox(allForScope(), lang));
      refreshPreview();
      inp.focus();
    };
    $('#batchFromLyr', m.el).onclick = function () {
      setInputText($('#lyrBox') ? $('#lyrBox').value : '');
      refreshPreview();
      inp.focus();
    };
    $('#batchClear', m.el).onclick = function () {
      setInputText('');
      refreshPreview();
      inp.focus();
    };
    $('#batchOk', m.el).onclick = function () {
      var targets = targetNotes();
      var tokens = parsedTokens();
      var res = roll.batchSetLyrics(targets, tokens);
      if (!res.updated) return;
      state.dirty = true;
      updateStat();
      syncInspector();
      renderAndAnalyze(60);
      m.close();
      setStatus(t('batch.doneStatus', { n: res.updated }, '已批量填入 ' + res.updated + ' 个音符歌词 · 可撤销'));
    };
    refreshPreview();
    setTimeout(function () { inp.focus(); inp.select(); }, 30);
  }

  /* ---------------- 组件右键菜单 ---------------- */
  function notePhoneInfo(note) {
    if (!note) return { phones: [] };
    if (roll && roll._phoneLabels) {
      var found = roll._phoneLabels.filter(function (l) { return l.note && l.note.id === note.id; })[0];
      if (found && found.info) return found.info;
    }
    var resolved = roll && roll._phonemizedNotes ? roll._phonemizedNotes()
      : NSG.phonemizeNotes(roll ? roll.notes : [], state.score.lang, state.score.phonemizer);
    var idx = resolved.findIndex(function (r) { return r.id === note.id; });
    if (idx < 0) return { phones: [] };
    var prev = idx > 0 ? NSG.pronunciationInfo(resolved[idx - 1]) : null;
    return NSG.pronunciationInfo(resolved[idx], prev);
  }

  function editSingleNoteLyric(note) {
    if (!note) return;
    askText(t('ui.editLyricTitle', null, '编辑歌词'),
      t('ui.editLyricHint', null, '歌词可填汉字 / 假名 / 罗马字。+ 接续前一个词，由音素器分配音节；+~ 或 +* 明确延长元音。兼容 - 延音。'),
      note.lyric === '‿' ? '-' : (note.lyric || 'a'), function (val) {
        if (roll.applyNoteLyric(note, val)) {
          roll._emit();
          state.dirty = true;
          renderAndAnalyze(60);
        }
      });
  }

  var NOTE_LANG_LIST = [
    'zh', 'yue', 'ja', 'en', 'de', 'pl', 'ru', 'uk', 'fi', 'es', 'pt', 'it', 'fr', 'ro',
    'nan', 'hak', 'nan-x-teochew', 'zh-x-sichuan', 'ko', 'vi', 'fil', 'id', 'ms', 'th',
    'tok', 'eo', 'asaxi', 'xdi8', 'tlh'
  ];

  var noteLanguageRequests = new WeakMap();
  async function setSelectedNotesLanguage(lang, targetNotes) {
    if (!roll || typeof roll.setNoteLanguage !== 'function') return { n: 0, changed: 0 };
    var nextLang = (lang && typeof lang === 'string') ? lang.trim() : '';
    var tr = activeVocalTrack(), request = {};
    var targets = targetNotes || roll.selected();
    targets.forEach(function (n) { noteLanguageRequests.set(n, request); });
    try { if (nextLang) await NSG.loadDict(nextLang); }
    catch (e) {
      if (tr === activeVocalTrack() && targets.some(function (n) { return noteLanguageRequests.get(n) === request; })) setStatus(tMsg(e.message));
      return;
    }
    if (tr !== activeVocalTrack()) return;
    var current = new Set(roll.notes);
    targets = targets.filter(function (n) { return current.has(n) && noteLanguageRequests.get(n) === request; });
    if (!targets.length) return;
    var res = roll.setNoteLanguage(nextLang, targets);
    if (!res.n) return res;
    state.dirty = true;
    updateStat();
    syncInspector();
    renderAndAnalyze(60);
    var trkLang = roll.trackLanguage ? roll.trackLanguage() : (roll.phonemizer || roll.lang || state.score.lang || 'zh');
    if (nextLang) {
      setStatus(t('ui.noteLangSet', { n: res.n, lang: tLangName(nextLang) }, '已将 ' + res.n + ' 个音符的语言设为 ' + tLangName(nextLang) + ' · 可撤销'));
    } else {
      setStatus(t('ui.noteLangReset', { n: res.n, lang: tLangName(trkLang) }, '已恢复 ' + res.n + ' 个音符跟随音层语言（' + tLangName(trkLang) + '）· 可撤销'));
    }
    return res;
  }

  function buildNoteLanguageMenuItem(targetNotes) {
    var list = (targetNotes || []).filter(Boolean);
    var trkLang = (roll && roll.trackLanguage) ? roll.trackLanguage() : ((roll && (roll.phonemizer || roll.lang)) || state.score.lang || 'zh');
    var trkLangLabel = tLangName(trkLang);
    if (!list.length) {
      return {
        label: t('ctx.noteLang', null, '音符语言'),
        shortcut: '▸',
        disabled: true
      };
    }
    var allFollow = true;
    var firstExplicit = null, sameExplicit = true;
    var firstEff = null, sameEff = true;
    list.forEach(function (n, idx) {
      var exp = n.noteLang || (n.langSource === 'note' ? n.lang : '');
      var eff = (roll && roll.noteLanguage) ? roll.noteLanguage(n) : (exp || trkLang);
      var hasOverride = !!(exp || (!(roll && roll.phonemizer) && n.lang && n.lang !== trkLang));
      if (hasOverride) allFollow = false;
      if (idx === 0) {
        firstExplicit = exp;
        firstEff = eff;
      } else {
        if (exp !== firstExplicit) sameExplicit = false;
        if (eff !== firstEff) sameEff = false;
      }
    });

    var statusText = allFollow
      ? t('ctx.noteLangFollowShort', { lang: trkLangLabel }, '跟随音层（' + trkLangLabel + '）')
      : sameEff ? tLangName(firstEff) : t('ctx.noteLangMixed', null, '多种语种');
    var badgeKey = allFollow ? langShortCode(trkLang) : (sameEff ? langShortCode(firstEff) : '');
    var langCodes = NOTE_LANG_LIST.slice();
    if (NSG && NSG.langName) {
      Object.keys(NSG.langName).forEach(function (k) {
        if (langCodes.indexOf(k) < 0) langCodes.push(k);
      });
    }

    var children = [
      {
        label: (allFollow ? '✓ ' : '') + t('ctx.noteLangFollow', { lang: trkLangLabel }, '跟随音层默认（' + trkLangLabel + '）'),
        shortcut: langShortCode(trkLang),
        active: allFollow,
        fullRow: true,
        onClick: function () { setSelectedNotesLanguage('', list); }
      },
      '-'
    ];
    langCodes.forEach(function (code) {
      var isCur = !allFollow && sameExplicit && firstExplicit === code;
      children.push({
        label: (isCur ? '✓ ' : '') + tLangName(code),
        shortcut: langShortCode(code),
        active: isCur,
        onClick: function () { setSelectedNotesLanguage(code, list); }
      });
    });

    return {
      label: t('ctx.noteLangWithCur', { lang: statusText }, '音符语言：' + statusText),
      shortcut: (badgeKey ? badgeKey + ' ' : '') + '▸',
      submenuCols: 2,
      children: children
    };
  }

  function closeContextMenu() {
    var menu = $('#ctxMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.innerHTML = '';
  }

  function openContextMenu(x, y, items, title) {
    var menu = $('#ctxMenu');
    if (!menu || typeof document.createElement !== 'function') return false;
    closeContextMenu();
    if (title) {
      var head = document.createElement('div');
      head.className = 'ctx-head';
      head.textContent = title;
      menu.appendChild(head);
    }
    var actionButtons = [];
    var openSubmenus = [];
    function hideAllSubmenus(except) {
      openSubmenus.forEach(function (entry) {
        if (entry.sub !== except) {
          entry.sub.hidden = true;
          entry.btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    function appendMenuEntry(container, item, isSub) {
      if (!item || item === '-' || item.sep) {
        var sep = document.createElement('div');
        sep.className = 'ctx-sep';
        sep.setAttribute('role', 'separator');
        container.appendChild(sep);
        return;
      }
      var hasChildren = Array.isArray(item.children) && item.children.length > 0 && !item.disabled;
      var wrap = hasChildren ? document.createElement('div') : container;
      if (hasChildren) wrap.className = 'ctx-sub-wrap';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-item' +
        (item.danger ? ' danger' : '') +
        (item.active ? ' on' : '') +
        (item.disabled ? ' disabled' : '') +
        (hasChildren ? ' has-sub' : '') +
        (item.fullRow ? ' full-row' : '');
      btn.setAttribute('role', 'menuitem');
      btn.disabled = !!item.disabled;
      var labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      btn.appendChild(labelSpan);
      if (item.shortcut) {
        var keySpan = document.createElement('span');
        keySpan.className = 'ctx-key';
        keySpan.textContent = item.shortcut;
        btn.appendChild(keySpan);
      }
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      btn.addEventListener('mouseenter', function () {
        if (document.activeElement && document.activeElement !== menu &&
            menu.contains && menu.contains(document.activeElement) && menu.focus) {
          menu.focus();
        }
      });

      if (hasChildren) {
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        var sub = document.createElement('div');
        sub.className = 'ctx-menu ctx-submenu' + (item.submenuCols === 2 ? ' cols-2' : '');
        sub.setAttribute('role', 'menu');
        sub.hidden = true;
        item.children.forEach(function (child) { appendMenuEntry(sub, child, true); });
        openSubmenus.push({ btn: btn, sub: sub });

        var showSub = function () {
          hideAllSubmenus(sub);
          sub.style.left = '100%';
          sub.style.right = 'auto';
          sub.style.top = '-5px';
          sub.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          if (sub.getBoundingClientRect && menu.getBoundingClientRect && btn.getBoundingClientRect) {
            var vw2 = window.innerWidth || 1024, vh2 = window.innerHeight || 768;
            var mRect = menu.getBoundingClientRect();
            var bRect = btn.getBoundingClientRect();
            var sRect = sub.getBoundingClientRect();
            if (mRect.right + sRect.width + 8 > vw2 && mRect.left - sRect.width - 4 >= 4) {
              sub.style.left = 'auto';
              sub.style.right = '100%';
            }
            if (bRect.top + sRect.height + 8 > vh2) {
              var offsetTop = Math.max(6 - bRect.top, vh2 - 8 - sRect.height - bRect.top);
              sub.style.top = Math.round(offsetTop) + 'px';
            }
          }
        };
        wrap.addEventListener('mouseenter', showSub);
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (sub.hidden) showSub(); else { sub.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
        });
        btn.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            showSub();
            var firstSubBtn = sub.querySelector('.ctx-item:not(:disabled)');
            if (firstSubBtn && firstSubBtn.focus) firstSubBtn.focus();
          }
        });
        sub.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            sub.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (btn.focus) btn.focus();
          }
        });
        wrap.appendChild(btn);
        wrap.appendChild(sub);
        container.appendChild(wrap);
      } else {
        if (!isSub) {
          btn.addEventListener('mouseenter', function () { hideAllSubmenus(null); });
        }
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (item.disabled) return;
          closeContextMenu();
          if (typeof item.onClick === 'function') item.onClick();
        });
        container.appendChild(btn);
      }
      if (!item.disabled && !isSub) actionButtons.push(btn);
    }
    (items || []).forEach(function (item) { appendMenuEntry(menu, item, false); });
    menu.hidden = false;
    var vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    var rect = menu.getBoundingClientRect ? menu.getBoundingClientRect() : { width: 240, height: 300 };
    var left = Math.max(6, Math.min(x, vw - rect.width - 8));
    var top = Math.max(6, Math.min(y, vh - rect.height - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.tabIndex = -1;
    if (menu.focus) {
      menu.focus();
    }
    return true;
  }

  function buildRollContextItems(e, p, hitNote, area, pitHit) {
    var selNotes = roll.selected(), nSel = selNotes.length, hasNotes = roll.notes.length > 0;
    var primary = hitNote || selNotes[0] || null;
    var clickBeat = roll._snapGrid
      ? roll._snapGrid(roll.xBeat(p ? p.x : roll.kbW))
      : Math.max(0, Math.round(roll.xBeat(p ? p.x : roll.kbW) / (roll.snap || 0.25)) * (roll.snap || 0.25));

    if (area === 'pit' && pitHit) {
      var firstPoint = pitHit.index === 0, lastPoint = pitHit.index === pitHit.points.length - 1;
      return { title: lastPoint ? t('ctx.pitEnd', null, 'PIT 终点 · 后面没有曲线段') : t('ctx.pitSeg', null, 'PIT · 此点到下一点的曲线形状'),
        items: NSG.TUNING.pitchShapes.map(function (shape) {
          var active = pitHit.points[pitHit.index][2] === shape.id;
          return { label: (active ? '✓ ' : '') + tPitchShapeName(shape), active: active, disabled: lastPoint,
            onClick: function () { roll.editPitchPoint(pitHit, shape.id); } };
        }).concat(['-', { label: t('ctx.pitDel', null, '删除控制点'), danger: true, disabled: firstPoint || lastPoint,
          onClick: function () { roll.editPitchPoint(pitHit, null, true); } },
          { label: t('ctx.pitDelLeft', null, '删除左侧所有控制点'), danger: true, disabled: pitHit.index <= 1,
            onClick: function () { roll.editPitchPoint(pitHit, null, 'left'); } },
          { label: t('ctx.pitDelRight', null, '删除右侧所有控制点'), danger: true, disabled: pitHit.index >= pitHit.points.length - 2,
            onClick: function () { roll.editPitchPoint(pitHit, null, 'right'); } }]) };
    }

    if (area === 'ruler') {
      return {
        title: t('ctx.rulerTitle', { bar: Math.floor(clickBeat / 4) + 1 }, '时间标尺 · 第 ' + (Math.floor(clickBeat / 4) + 1) + ' 小节'),
        items: [
          { label: t('ctx.seekHere', null, '定位播放头到此处'), onClick: function () { roll.seek(clickBeat); syncCursor(); } },
          { label: t('ctx.playFromHere', null, '从此处开始播放'), onClick: function () { roll.seek(clickBeat); syncCursor(); if (state.playing || playPending) stopPlay(); startPlay(); } },
          '-',
          { label: t('ctx.pasteAtCursor', null, '在游标处粘贴音符'), shortcut: 'Ctrl+V', disabled: !roll.clip.length, onClick: function () { pasteNotes(clickBeat); } },
          { label: t('ctx.selectAllNotes', null, '全选音符'), shortcut: 'Ctrl+A', disabled: !hasNotes, onClick: function () { roll.selectAll(); syncInspector(); } },
          { label: t('ctx.fitView', null, '适配全曲视图'), shortcut: 'F', onClick: function () { $('#fitRoll').click(); } }
        ]
      };
    }

    if (area === 'phoneme') {
      var sp = roll.selectedPhone ? roll.selectedPhone() : null;
      var spNote = (sp && roll.notes.filter(function (n) { return n.id === sp.noteId; })[0]) || primary;
      var phoneLangTargets = nSel ? selNotes : (spNote ? [spNote] : []);
      return {
        title: sp ? t('ctx.phoneTitle', { phone: sp.phone }, '音素 · ' + sp.phone) : t('ctx.phonePanelTitle', null, '音素编辑面板'),
        items: [
          { label: t('ctx.phoneRename', null, '更换当前音素名称'), disabled: !sp || sp.readOnly || !roll.onEditPhone, onClick: function () { roll.onEditPhone(sp); } },
          { label: t('ctx.phoneEditNote', null, '编辑所属音符整组音素…'), disabled: !spNote, onClick: function () { roll.editPhones({ note: spNote, info: notePhoneInfo(spNote) }); } },
          buildNoteLanguageMenuItem(phoneLangTargets),
          { label: t('ctx.phoneResetTiming', null, '恢复自动音素时序'), disabled: !sp || !roll.updatePhone, onClick: function () { roll.updatePhone('reset'); } },
          '-',
          { label: t('ctx.batchLyrics', null, '批量填词 / 修改歌词…'), disabled: !hasNotes, onClick: function () { openBatchLyric(); } }
        ]
      };
    }

    if (area === 'velocity') {
      var targetVel = nSel ? selNotes : roll.notes;
      var scopeShort = nSel ? t('ctx.scopeSelShort', null, '所选') : t('ctx.scopeAllShort', null, '全部');
      return {
        title: roll.laneParam === 'effort' ? t('tune.effort', null, '轻重') : roll.laneParam === 'pitd' ? t('ctx.lanePitdTitle', null, '参数窗 · PITD 相对音高') :
          roll.laneParam === 'dyn' ? t('ctx.laneDynTitle', null, '参数窗 · DYN 音量包络') :
          roll.laneParam === 'cons' ? t('ctx.laneConsTitle', null, '参数窗 · 辅音速度') : t('ctx.laneVelTitle', null, '参数窗 · VEL 力度'),
        items: [
          { label: (roll.laneParam === 'vel' ? '✓ ' : '') + t('ctx.laneShowVel', null, '显示 VEL 力度'), active: roll.laneParam === 'vel', onClick: function () { roll.setLaneParam('vel'); } },
          { label: (roll.laneParam === 'cons' ? '✓ ' : '') + t('ctx.laneShowCons', null, '显示辅音速度'), active: roll.laneParam === 'cons', onClick: function () { roll.setLaneParam('cons'); } },
          { label: (roll.laneParam === 'pitd' ? '✓ ' : '') + t('ctx.laneShowPitd', null, '显示 PITD 相对音高'), active: roll.laneParam === 'pitd', onClick: function () { roll.setLaneParam('pitd'); } },
          { label: (roll.laneParam === 'dyn' ? '✓ ' : '') + t('ctx.laneShowDyn', null, '显示 DYN 音量包络'), active: roll.laneParam === 'dyn', onClick: function () { roll.setLaneParam('dyn'); } },
          { label: (roll.laneParam === 'effort' ? '✓ ' : '') + t('tune.effort', null, '轻重'), active: roll.laneParam === 'effort', onClick: function () { roll.setLaneParam('effort'); } },
          { label: t('ctx.laneCurveHelp', null, '曲线：左键绘制；Shift / 右键拖动重置'), disabled: true },
        ].concat(roll.laneParam === 'pitd' ? [50, 100, 200, 400, 800, 1200, 2400].map(function (range) {
          return { label: t('ctx.lanePitdRange', null, 'PITD 显示范围') + ' ±' + range,
            active: roll.pitdRange === range, onClick: function () { roll.setPitdRange(range); } };
        }) : [], [
          '-',
          { label: t('ctx.laneResetPitd', { scope: scopeShort }, '重置' + (nSel ? '所选' : '全部') + ' PITD 为 0 音分'), disabled: !(roll.pit && roll.pit.length), onClick: function () { roll.resetLaneCurve('pitd', !nSel); } },
          { label: t('ctx.laneResetEffort', { scope: scopeShort }, '重置' + scopeShort + '轻重为 100'), disabled: !targetVel.length, onClick: function () { roll.resetLaneCurve('effort', !nSel); } },
          { label: t('ctx.laneResetDyn', { scope: scopeShort }, '重置' + (nSel ? '所选' : '全部') + ' DYN 为 100%'), disabled: !targetVel.length, onClick: function () { roll.resetLaneCurve('dyn', !nSel); } },
          { label: t('ctx.laneResetVel', { scope: scopeShort }, '重置' + (nSel ? '所选' : '全部') + '音符 VEL 力度为 96'), disabled: !targetVel.length, onClick: function () { targetVel.forEach(function (n) { n.vel = 96; }); roll._emit(); syncInspector(); renderAndAnalyze(60); } },
          { label: t('ctx.laneResetCons', { scope: scopeShort }, '重置' + (nSel ? '所选' : '全部') + '音符辅音速度为 100%'), disabled: !targetVel.length, onClick: function () { targetVel.forEach(function (n) { delete n.consonantSpeed; delete n.consonantLength; }); roll._emit(); syncInspector(); renderAndAnalyze(60); } }
        ])
      };
    }

    if (area === 'keys') {
      var midi = p ? roll.yPitch(p.y) : 60;
      return {
        title: t('ctx.keysTitle', { note: noteName(midi) }, '琴键 · ' + noteName(midi)),
        items: [
          { label: t('ctx.selectAllNotes', null, '全选音符'), shortcut: 'Ctrl+A', disabled: !hasNotes, onClick: function () { roll.selectAll(); syncInspector(); } },
          { label: t('ctx.trackOctUp', null, '全轨升八度 (+12)'), shortcut: 'Shift+↑', disabled: !hasNotes, onClick: function () { roll.sel = {}; roll.draw(); transposeOctaveUI(1); } },
          { label: t('ctx.trackOctDown', null, '全轨降八度 (-12)'), shortcut: 'Shift+↓', disabled: !hasNotes, onClick: function () { roll.sel = {}; roll.draw(); transposeOctaveUI(-1); } },
          { label: t('ctx.fitView', null, '适配全曲视图'), shortcut: 'F', onClick: function () { $('#fitRoll').click(); } }
        ]
      };
    }

    var scopeSuffix = nSel ? t('ctx.rollScopeSel', { n: nSel }, '（已选 ' + nSel + ' 音）') : t('ctx.rollScopeAll', null, '（全轨）');
    var langTargets = nSel ? selNotes : (primary ? [primary] : []);
    var title = nSel > 1 ? t('ctx.rollMultiTitle', { n: nSel }, '已选中 ' + nSel + ' 个音符')
      : primary ? t('ctx.rollNoteTitle', { note: noteName(primary.pitch), lyric: primary.lyric || '' }, '音符 ' + noteName(primary.pitch) + ' · 「' + (primary.lyric || '') + '」')
      : t('ctx.rollToolTitle', { tool: toolDisplayName(roll.tool) }, '钢琴窗 · 工具：' + (TOOL_NAMES[roll.tool] || roll.tool));
    return {
      title: title,
      items: [
        { label: t('ctx.batchLyrics', null, '批量填词 / 修改歌词…'), disabled: !hasNotes, onClick: function () { openBatchLyric(); } },
        { label: t('ctx.editCurLyric', null, '修改当前音符歌词…'), shortcut: t('ctx.dblClickKey', null, '双击'), disabled: !primary, onClick: function () { editSingleNoteLyric(primary); } },
        { label: t('ctx.editPhones', null, '编辑音素…'), disabled: !primary, onClick: function () { roll.editPhones({ note: primary, info: notePhoneInfo(primary) }); } },
        buildNoteLanguageMenuItem(langTargets),
        { label: (primary && primary.slur) ? t('ctx.unslur', null, '取消延音') : t('ctx.slur', null, '设为延音 (-)'), shortcut: 'S', disabled: !nSel, onClick: toggleSlur },
        '-',
        { label: t('ctx.octUp', null, '升八度') + scopeSuffix, shortcut: 'Shift+↑', disabled: !hasNotes, onClick: function () { transposeOctaveUI(1); } },
        { label: t('ctx.octDown', null, '降八度') + scopeSuffix, shortcut: 'Shift+↓', disabled: !hasNotes, onClick: function () { transposeOctaveUI(-1); } },
        { label: t('ctx.barLeft', null, '前移一个小节') + scopeSuffix, shortcut: 'Ctrl+←', disabled: !hasNotes, onClick: function () { shiftBarUI(-1); } },
        { label: t('ctx.barRight', null, '后移一个小节') + scopeSuffix, shortcut: 'Ctrl+→', disabled: !hasNotes, onClick: function () { shiftBarUI(1); } },
        { label: t('ctx.quantizeToGrid', null, '吸附到网格') + scopeSuffix, disabled: !hasNotes, onClick: quantizeToGridUI },
        '-',
        { label: t('ctx.cut', null, '剪切'), shortcut: 'Ctrl+X', disabled: !nSel, onClick: cutNotes },
        { label: t('ctx.copy', null, '复制'), shortcut: 'Ctrl+C', disabled: !nSel, onClick: copyNotes },
        { label: t('ctx.pasteHere', null, '粘贴到此处'), shortcut: 'Ctrl+V', disabled: !roll.clip.length, onClick: function () { pasteNotes(clickBeat); } },
        { label: t('ctx.deleteSel', null, '删除选中音符'), shortcut: 'Del', danger: true, disabled: !nSel, onClick: deleteSelectedNotes },
        { label: t('ctx.selectAll', null, '全选'), shortcut: 'Ctrl+A', disabled: !hasNotes, onClick: function () { roll.selectAll(); syncInspector(); } },
        '-',
        { label: t('ctx.autoTune', null, '自动调教…'), disabled: !hasNotes, onClick: openAutoTune },
        { label: t('ctx.quickCompose', null, '快速谱曲…'), onClick: openCompose },
        { label: t('ctx.resetSelPit', null, '重置所选音符 PIT 包络'), disabled: !nSel, onClick: resetSelectedPitUI },
        { label: t('ctx.clearPitBrush', null, '清除画笔 PIT 曲线') + (nSel ? t('ctx.pitBrushSel', null, '（已选）') : t('ctx.pitBrushTrack', null, '（整轨）')), disabled: !(roll.pit && roll.pit.length), onClick: function () { clearPitBrushUI(!nSel); } },
        '-',
        { label: (roll.tool === 'select' ? '✓ ' : '') + t('ctx.switchTool', { name: toolDisplayName('select') }, '切换工具：框选'), shortcut: '2', active: roll.tool === 'select', onClick: function () { setTool('select'); } },
        { label: (roll.tool === 'pen' ? '✓ ' : '') + t('ctx.switchTool', { name: toolDisplayName('pen') }, '切换工具：画笔'), shortcut: '1', active: roll.tool === 'pen', onClick: function () { setTool('pen'); } },
        { label: (roll.tool === 'bend' ? '✓ ' : '') + t('ctx.switchTool', { name: toolDisplayName('bend') }, '切换工具：PIT 控制点'), shortcut: '4', active: roll.tool === 'bend', onClick: function () { setTool('bend'); } },
        { label: (roll.tool === 'pit' ? '✓ ' : '') + t('ctx.switchTool', { name: toolDisplayName('pit') }, '切换工具：PIT画笔'), shortcut: '5', active: roll.tool === 'pit', onClick: function () { setTool('pit'); } },
        { label: (roll.tool === 'erase' ? '✓ ' : '') + t('ctx.switchTool', { name: toolDisplayName('erase') }, '切换工具：擦除'), shortcut: '3', active: roll.tool === 'erase', onClick: function () { setTool('erase'); } },
        '-',
        { label: t('ctx.undo', null, '撤销'), shortcut: 'Ctrl+Z', disabled: !roll.undoStack.length, onClick: function () { roll.undo(); } },
        { label: t('ctx.redo', null, '重做'), shortcut: 'Ctrl+Y', disabled: !roll.redoStack.length, onClick: function () { roll.undo(true); } }
      ]
    };
  }

  function onRollContextMenu(e, p, hitNote, area, pitHit) {
    var cfg = buildRollContextItems(e, p, hitNote, area, pitHit);
    openContextMenu(e.clientX, e.clientY, cfg.items, cfg.title);
  }

  function buildTextInputMenu(el) {
    var start = typeof el.selectionStart === 'number' ? el.selectionStart : 0;
    var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : 0;
    var hasSel = end > start;
    var ro = !!el.readOnly || !!el.disabled;
    var selectedText = hasSel ? String(el.value || '').slice(start, end) : '';
    var replaceRange = function (txt) {
      if (ro) return;
      var val = String(el.value || '');
      el.value = val.slice(0, start) + txt + val.slice(end);
      if (el.setSelectionRange) {
        el.focus();
        el.setSelectionRange(start + txt.length, start + txt.length);
      }
      if (typeof Event === 'function' && el.dispatchEvent) el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    var items = [];
    if (el.id === 'lyrBox') {
      items.push(
        { label: t('ctx.batchToNotes', null, '批量填词到音符…'), disabled: !(roll && roll.notes.length), onClick: function () { openBatchLyric({ seedText: el.value }); } },
        { label: t('ctx.appendByLyric', null, '按歌词铺音符（接在末尾）'), disabled: !String(el.value || '').trim(), onClick: lyricToNotes },
        { label: t('ctx.quickCompose', null, '快速谱曲…'), onClick: openCompose },
        '-'
      );
    }
    items.push(
      { label: t('ctx.cut', null, '剪切'), shortcut: 'Ctrl+X', disabled: ro || !hasSel, onClick: function () {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(selectedText).catch(function () {});
        replaceRange('');
      } },
      { label: t('ctx.copy', null, '复制'), shortcut: 'Ctrl+C', disabled: !hasSel, onClick: function () {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(selectedText).catch(function () {});
      } },
      { label: t('ctx.pasteText', null, '粘贴'), shortcut: 'Ctrl+V', disabled: ro || !(navigator.clipboard && navigator.clipboard.readText), onClick: function () {
        navigator.clipboard.readText().then(function (txt) { replaceRange(txt || ''); }).catch(function () {
          setStatus(t('ctx.clipboardDenied', null, '浏览器未授予剪贴板读取权限，请使用 Ctrl+V 粘贴'));
        });
      } },
      { label: t('ctx.selectAll', null, '全选'), shortcut: 'Ctrl+A', disabled: !String(el.value || '').length, onClick: function () {
        el.focus();
        if (el.select) el.select();
      } },
      { label: t('ctx.clearText', null, '清空内容'), danger: true, disabled: ro || !String(el.value || '').length, onClick: function () {
        start = 0; end = String(el.value || '').length; replaceRange('');
      } }
    );
    return { title: el.id === 'lyrBox' ? t('ctx.lyrBoxTitle', null, '歌词输入框') : t('ctx.textBoxTitle', null, '文本编辑'), items: items };
  }

  function buildTargetContextMenu(target) {
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !/^(range|checkbox|radio|file|button|submit)$/i.test(target.type || '')) {
      return buildTextInputMenu(target);
    }
    if (target && target.closest && target.closest('.mixer')) {
      return {
        title: t('ctx.mixerTitle', null, '混音台'),
        items: [
          { label: state.muteVox ? t('ctx.unmuteVocal', null, '取消人声静音') : t('ctx.muteVocal', null, '静音人声'), onClick: function () { $('#mVox').click(); } },
          { label: state.muteAcc ? t('ctx.unmuteAccomp', null, '取消伴奏静音') : t('ctx.muteAccomp', null, '静音伴奏'), onClick: function () { $('#mAcc').click(); } },
          { label: state.loveReverb ? t('ctx.reverbOff', null, '关闭情歌混响') : t('ctx.reverbOn', null, '开启情歌混响'), onClick: function () { $('#loveReverb').click(); } },
          '-',
          { label: t('ctx.resetVocalVol', null, '复位人声音量 (56%)'), onClick: function () { state.volVox = 0.56; state.muteVox = false; applyLive(); updateMix(); setStatus(t('ui.voxVolReset', null, '人声推子已复位 56%')); } },
          { label: t('ctx.resetAccompVol', null, '复位伴奏音量 (75%)'), onClick: function () { state.volAcc = 0.75; state.muteAcc = false; startAccLive(); applyLive(); updateMix(); setStatus(t('ui.accVolReset', null, '伴奏推子已复位 75%')); } },
          '-',
          { label: t('ctx.expVocalWav', null, '导出本层人声 WAV…'), disabled: !selectedVocalTrack(), onClick: function () { exportWav('vocal'); } },
          { label: t('ctx.expVocalLayers', null, '导出所有人声音层…'), onClick: function () { exportWav('vocalLayers'); } },
          { label: t('ctx.expAccompWav', null, '导出伴奏 WAV…'), onClick: function () { exportWav('accompaniment'); } },
          { label: t('ctx.expMixWav', null, '导出混音 WAV…'), onClick: function () { exportWav('mix'); } },
          '-',
          { label: t('ctx.panicStop', null, 'Panic · 立即停止所有音频'), danger: true, onClick: panicAudio }
        ]
      };
    }
    if (target && target.closest && target.closest('aside.left')) {
      return {
        title: t('ctx.leftPanelTitle', null, '音色与歌词面板'),
        items: [
          { label: t('ctx.batchLyrics', null, '批量填词 / 修改歌词…'), disabled: !(roll && roll.notes.length), onClick: function () { openBatchLyric(); } },
          { label: t('left.toNotes', null, '按歌词铺音符'), onClick: lyricToNotes },
          { label: t('ctx.quickCompose', null, '快速谱曲…'), onClick: openCompose },
          '-',
          { label: t('ctx.saveAsBlock', null, '保存当前为音色块…'), onClick: saveBlock },
          { label: t('ctx.jitterTimbre', null, '随机微调当前音色参数'), onClick: function () {
            state.timbre.gen = Math.max(0, Math.min(127, Math.round((NSG.genValue(state.timbre) + (Math.random() - 0.5) * 14))));
            state.timbre.bwScale = +(Math.max(0.5, Math.min(2.0, (state.timbre.bwScale || 1) + (Math.random() - 0.5) * 0.16))).toFixed(2);
            state.timbre.hiShift = +(Math.max(0.75, Math.min(1.25, (state.timbre.hiShift || 1) + (Math.random() - 0.5) * 0.08))).toFixed(2);
            state.dirty = true; markEdited(); applyTimbreToUI(); renderAndAnalyze(200);
            setStatus(t('ctx.jitterTimbreStatus', null, '已微调音色参数 · 可点击保存为音色块'));
          } },
          { label: t('ctx.resetPreset', null, '恢复预置歌手默认参数'), onClick: function () { loadSinger(state.timbre.preset || 'm1'); } },
          '-',
          { label: t('ctx.extractTimbre', null, '音色撅取…'), onClick: openExtract }
        ]
      };
    }
    if (target && target.closest && target.closest('aside.right')) {
      return {
        title: t('ctx.rightPanelTitle', null, '声学分析监控'),
        items: [
          { label: t('ctx.refreshAnalysis', null, '刷新声学分析与合成渲染'), onClick: function () { state.dirty = true; renderAndAnalyze(0); setStatus(t('ctx.refreshingAnalysis', null, '正在刷新声学分析…')); } },
          { label: t('ctx.cycleVowel', { v: state.vowel === '1' ? 'ɿ' : state.vowel }, '切换滤波曲线试听元音（/' + (state.vowel === '1' ? 'ɿ' : state.vowel) + '/）'), onClick: function () { $('#curveVowel').click(); } },
          '-',
          { label: state.playing ? t('ctx.stopPlay', null, '停止播放') : t('ctx.playCursor', null, '从游标播放'), shortcut: t('ctx.spaceKey', null, '空格'), onClick: togglePlay },
          { label: t('ctx.expMixWav', null, '导出混音 WAV…'), onClick: function () { exportWav('mix'); } }
        ]
      };
    }
    return {
      title: t('app.name', null, 'NSG 歌声合成器'),
      items: [
        { label: state.playing ? t('ctx.stopPlay', null, '停止播放') : t('ctx.playCursor', null, '从游标播放'), shortcut: t('ctx.spaceKey', null, '空格'), onClick: togglePlay },
        { label: t('ctx.batchLyrics', null, '批量填词 / 修改歌词…'), disabled: !(roll && roll.notes.length), onClick: function () { openBatchLyric(); } },
        '-',
        { label: t('ctx.undo', null, '撤销'), shortcut: 'Ctrl+Z', disabled: !(roll && roll.undoStack.length), onClick: function () { roll.undo(); } },
        { label: t('ctx.redo', null, '重做'), shortcut: 'Ctrl+Y', disabled: !(roll && roll.redoStack.length), onClick: function () { roll.undo(true); } },
        '-',
        { label: (roll && roll.tool === 'select' ? '✓ ' : '') + t('ctx.selectMode', null, '框选模式'), shortcut: '2', onClick: function () { setTool('select'); } },
        { label: (roll && roll.tool === 'pen' ? '✓ ' : '') + t('ctx.penMode', null, '画笔模式'), shortcut: '1', onClick: function () { setTool('pen'); } },
        '-',
        { label: t('ctx.newBlank', null, '新建空白工程'), onClick: newProject },
        { label: t('ctx.importProj', null, '导入工程文件…'), onClick: pickFile },
        { label: t('ctx.exportProj', null, '导出工程文件 .nsg'), onClick: exportProject },
        '-',
        { label: t('ctx.helpGuide', null, '快捷键与操作指南'), shortcut: 'F1', onClick: openHelp }
      ]
    };
  }

  function bindGlobalContextMenu() {
    window.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (e.target && e.target.id === 'roll') return;
      var cfg = buildTargetContextMenu(e.target);
      if (cfg && cfg.items && cfg.items.length) {
        var x = e.clientX, y = e.clientY;
        if (!x && !y && e.target && e.target.getBoundingClientRect) {
          var r = e.target.getBoundingClientRect();
          x = Math.round(r.left + Math.min(24, r.width / 2));
          y = Math.round(r.top + Math.min(24, r.height / 2));
        }
        openContextMenu(x, y, cfg.items, cfg.title);
      }
    });
    window.addEventListener('mousedown', function (e) {
      var menu = $('#ctxMenu');
      if (menu && !menu.hidden && !menu.contains(e.target)) closeContextMenu();
    });
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('wheel', closeContextMenu, { passive: true });
    var menu = $('#ctxMenu');
    if (menu && menu.addEventListener) {
      menu.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        var activeSub = document.activeElement && document.activeElement.closest
          ? document.activeElement.closest('.ctx-submenu')
          : null;
        var scope = activeSub && !activeSub.hidden ? activeSub : menu;
        var enabled = $$('.ctx-item:not(:disabled)', scope).filter(function (el) {
          if (el.closest && el.closest('[hidden]')) return false;
          if (scope === menu && el.closest && el.closest('.ctx-submenu')) return false;
          return true;
        });
        if (!enabled.length) return;
        var idx = enabled.indexOf(document.activeElement);
        var next = e.key === 'ArrowDown' ? (idx + 1) % enabled.length : (idx <= 0 ? enabled.length - 1 : idx - 1);
        enabled[next].focus();
      });
    }
  }

  /* ---------------- 关于 ---------------- */
  function openAbout() {
    var m = modal(t('about.title', null, '关于 NSG 歌声合成器'),
      '<h3>' + t('about.heading', null, 'NSG 歌声合成器 V10') + '</h3>' +
      '<p>' + t('about.p1', null, '发声方法：先算出没有滤波的声带音——最多 64 阶倍频振幅叠加（表内 16 阶给定，表外按 −12dB/oct 续接），各阶固定随机相位；再让它穿过口腔与鼻腔的共振腔。口腔用六级共振峰级联（F1–F6，各自带中心频率与带宽，F4/F5/F6 位置由参数块单独给出），鼻腔以极点＋零点支路并联耦合；清擦音单独走并行噪声通道，最后叠加回主干，出口再过一级唇端辐射（+6dB/oct）。') + '</p>' +
      '<p>' + t('about.p2', null, '人声默认为 16kHz 单声道；工具栏“模式B”可切换至原生 48kHz 合成。') + '</p>' +
      '<div class="row2" style="margin-top:10px"><label class="tl"><input type="checkbox" id="legacySoundToggle"' +
        (NSG.LEGACY_SOUND ? ' checked' : '') + '> ' +
        t('about.legacySound', null, '兼容旧版音色细节（撤销引擎声学微调，恢复优化前听感）') +
        '</label></div>',
      '<button class="abtn" data-close>' + t('common.gotIt', null, '知道了') + '</button>');
    var legacyChk = $('#legacySoundToggle', m.el);
    if (legacyChk) {
      legacyChk.onchange = function () {
        var on = !!this.checked;
        if (NSG.setLegacySound) NSG.setLegacySound(on);
        try {
          if (on) localStorage.setItem('nsg.legacySound', '1');
          else localStorage.removeItem('nsg.legacySound');
        } catch (e) { }
        state.dirty = true;
        state.voxKey = null;
        state.accKey = null;
        renderAndAnalyze(20);
        setStatus(on
          ? t('ui.legacySoundOn', null, '已切换为旧版音色兼容模式，正在重新渲染…')
          : t('ui.legacySoundOff', null, '已恢复优化音色模式，正在重新渲染…'));
      };
    }
  }

  /* ---------------- 背景 ---------------- */
  function setUITransparency(value) {
    var amount = Number(value);
    if (value === null || value === '' || !isFinite(amount)) amount = 24;
    amount = Math.max(0, Math.min(80, Math.round(amount)));
    state.uiTransparency = amount;
    var alpha = 1 - amount / 100;
    document.documentElement.style.setProperty('--ui-surface-alpha', alpha);
    // 越透明越该看清背景：模糊半径随不透明度一起收
    document.documentElement.style.setProperty('--ui-blur', Math.round(5 + alpha * 14) + 'px');
    $('#uiTransparency').value = amount;
    $('#uiTransparency').setAttribute('aria-valuetext', t('ui.transparencyAria', { pct: amount }, amount + '% 透明'));
    $('#uiTransparencyValue').textContent = amount + '%';
    if (roll) { roll.backgroundOpacity = alpha; roll.requestDraw(true); }
  }

  function setBg(id) {
    if (id === 'custom' && state.customBgUrl) {
      state.bgId = 'custom';
      var customLayer = $('#bgLayer');
      if (customLayer) customLayer.style.backgroundImage = 'url("' + state.customBgUrl + '")';
      try { localStorage.setItem('nsg.bg', 'custom'); } catch (e) { }
      return;
    }
    var item = BG_LIST.filter(function (x) { return x.id === id; })[0] || BG_LIST[0];
    state.bgId = item.id;
    state.customBgUrl = null;
    var layer = $('#bgLayer');
    if (typeof Image === 'function') {
      var probe = new Image();
      probe.onload = function () {
        if (state.bgId !== item.id) return;
        layer.style.backgroundImage = 'url("' + item.file + '")';
      };
      probe.onerror = function () {
        if (state.bgId !== item.id) return;
        layer.style.backgroundImage = item.css;
      };
      probe.src = item.file;
    } else if (layer) {
      layer.style.backgroundImage = item.css;
    }
    try {
      localStorage.setItem('nsg.bg', item.id);
      localStorage.removeItem('nsg.customBg');
    } catch (e) { }
  }

  function resolveThemeScheme(themeId, schemeId) {
    var list = THEME_SCHEMES[themeId];
    if (!list || !list.length) return null;
    var key = String(schemeId || '').trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === key) return list[i];
    }
    return list[0];
  }

  function persistThemeSchemes() {
    try { localStorage.setItem('nsg.themeSchemes', JSON.stringify(state.themeSchemes)); } catch (e) { }
  }

  function redrawSchemeCanvases() {
    if (roll && typeof roll.draw === 'function') roll.draw();
    if (typeof drawCurve === 'function') drawCurve();
    if (typeof drawGrid === 'function') drawGrid();
    if (typeof drawHarm === 'function') drawHarm();
  }

  function applyThemeScheme(themeId, schemeId, opts) {
    var item = resolveTheme(themeId);
    if (item.supportsTransparency !== false) {
      NSG.themeScheme = '';
      if (typeof document !== 'undefined' && document.documentElement) {
        if (typeof document.documentElement.removeAttribute === 'function') {
          document.documentElement.removeAttribute('data-scheme');
        } else if (typeof document.documentElement.setAttribute === 'function') {
          document.documentElement.setAttribute('data-scheme', '');
        }
      }
      return null;
    }
    var scheme = resolveThemeScheme(item.id, schemeId);
    if (!scheme) return null;
    state.themeSchemes[item.id] = scheme.id;
    NSG.themeScheme = scheme.id;
    if (typeof document !== 'undefined' && document.documentElement &&
        typeof document.documentElement.setAttribute === 'function') {
      document.documentElement.setAttribute('data-scheme', scheme.id);
    }
    if (item.id === 'modern') {
      if (state.modernCustom && state.modernCustom.seed) {
        NSG.themeScheme = 'custom';
        if (typeof document !== 'undefined' && document.documentElement &&
            typeof document.documentElement.setAttribute === 'function') {
          document.documentElement.setAttribute('data-scheme', 'custom');
        }
        applyModernDynamicColor(state.modernCustom.seed, { draw: false, dark: !!state.modernCustom.dark });
      } else {
        applyModernDynamicColor(scheme.seed || '#6750a4', { draw: false, dark: !!scheme.dark });
      }
    } else {
      if (!NSG.schemePalettes) NSG.schemePalettes = {};
      NSG.schemePalettes[item.id] = buildSchemeCanvasPalettes(item.id, scheme);
    }
    if (!opts || opts.draw !== false) redrawSchemeCanvases();
    if (!opts || opts.persist !== false) persistThemeSchemes();
    return scheme;
  }

  function setColorScheme(schemeId, themeId) {
    var targetTheme = resolveTheme(themeId || state.theme);
    if (targetTheme.supportsTransparency !== false) return null;
    if (targetTheme.id === 'modern') {
      state.modernCustom = null;
      try { localStorage.removeItem('nsg.modernCustom'); } catch (e) { }
    }
    var applied = applyThemeScheme(targetTheme.id, schemeId, { draw: true, persist: true });
    if (applied) setStatus(t('scheme.switched', { name: tSchemeName(applied) }, '已切换配色方案：' + applied.name));
    return applied;
  }
  NSG.setColorScheme = setColorScheme;

  function renderSchemeCard(s, active) {
    var sw = (s.swatches || []).slice(0, 4);
    var bg = sw[0] || '#1e1e1e';
    var surf = sw[1] || '#c0c0c0';
    var acc = sw[2] || '#0078d7';
    var title = sw[3] || acc;
    var p = s.preview || {};
    var pBg = p.bg || bg;
    var pBorder = p.border || acc;
    var pBar = p.bar || title;
    var pDot = p.dot || acc;
    var pBody = p.body || surf;
    var pNote1 = p.note1 || acc;
    var pNote2 = p.note2 || title;
    var chips = sw.map(function (c) {
      return '<i style="background:' + c + '"></i>';
    }).join('');
    return '<button type="button" class="schemecard' + (active ? ' sel' : '') + '" data-scheme-id="' + s.id + '" aria-pressed="' + active + '">' +
      '<div class="scheme-preview" style="background:' + pBg + ';border-color:' + pBorder + '">' +
        '<div class="sp-bar" style="background:' + pBar + '"><span class="sp-dot" style="background:' + pDot + '"></span></div>' +
        '<div class="sp-body" style="background:' + pBody + '">' +
          '<span class="sp-note" style="background:' + pNote1 + '"></span>' +
          '<span class="sp-note sp-note2" style="background:' + pNote2 + '"></span>' +
        '</div>' +
      '</div>' +
      '<div class="scheme-meta"><b>' + tSchemeName(s) + '</b><span class="scheme-swatches">' + chips + '</span></div>' +
    '</button>';
  }

  function openColorScheme() {
    var themeItem = resolveTheme(state.theme);
    var themeTitle = tThemeName(themeItem);
    var list = THEME_SCHEMES[themeItem.id] || [];
    var curId = state.themeSchemes[themeItem.id] || (list[0] && list[0].id);
    var isCustomModern = themeItem.id === 'modern' && state.modernCustom && state.modernCustom.seed;
    var html = '<h3>' + t('scheme.heading', { theme: themeTitle }, themeItem.name + ' · 配色方案') + '</h3><div class="schemegrid">';
    list.forEach(function (s) {
      var active = !isCustomModern && s.id === curId;
      html += renderSchemeCard(s, active);
    });
    html += '</div>';
    if (themeItem.id === 'modern') {
      var curSeed = (isCustomModern ? state.modernCustom.seed : (resolveThemeScheme('modern', curId) || {}).seed) || '#6750a4';
      var curDark = isCustomModern ? !!state.modernCustom.dark : !!(resolveThemeScheme('modern', curId) || {}).dark;
      html += '<h3 style="margin-top:12px">' + t('scheme.customHeading', null, '自定义配色') + '</h3>' +
        '<div class="scheme-custom-bar">' +
          '<label>' + t('scheme.seed', null, '种子色') + ' <input type="color" id="schemeCustomSeed" value="' + curSeed + '"></label>' +
          '<label><input type="checkbox" id="schemeCustomDark"' + (curDark ? ' checked' : '') + '> ' + t('scheme.darkMode', null, '深色模式') + '</label>' +
          '<button type="button" class="abtn primary" id="schemeCustomApply">' + t('common.apply', null, '应用') + '</button>' +
        '</div>';
    }
    var m = modal(t('scheme.modalTitle', { theme: themeTitle }, '配色方案 · ' + themeItem.name), html, '<button class="abtn primary" data-close>' + t('common.done', null, '完成') + '</button>');
    m.el.classList.add('theme-modal');
    var syncSchemeCards = function (activeId) {
      $$('.schemecard', m.el).forEach(function (x) {
        var on = activeId ? (x.dataset.schemeId === activeId) : false;
        x.classList.toggle('sel', on);
        x.setAttribute('aria-pressed', String(on));
      });
    };
    $$('.schemecard', m.el).forEach(function (el) {
      el.onclick = function () {
        var applied = setColorScheme(el.dataset.schemeId, themeItem.id);
        syncSchemeCards(applied && applied.id);
        if (themeItem.id === 'modern' && applied) {
          var seedInp = $('#schemeCustomSeed', m.el);
          var darkChk = $('#schemeCustomDark', m.el);
          if (seedInp) seedInp.value = applied.seed || '#6750a4';
          if (darkChk) darkChk.checked = !!applied.dark;
        }
      };
    });
    if (themeItem.id === 'modern') {
      var applyBtn = $('#schemeCustomApply', m.el);
      if (applyBtn) {
        applyBtn.onclick = function () {
          var seedInp = $('#schemeCustomSeed', m.el);
          var darkChk = $('#schemeCustomDark', m.el);
          var seed = (seedInp && seedInp.value) || '#6750a4';
          var dark = !!(darkChk && darkChk.checked);
          state.modernCustom = { seed: seed, dark: dark };
          try { localStorage.setItem('nsg.modernCustom', JSON.stringify(state.modernCustom)); } catch (e) { }
          NSG.themeScheme = 'custom';
          if (typeof document !== 'undefined' && document.documentElement &&
              typeof document.documentElement.setAttribute === 'function') {
            document.documentElement.setAttribute('data-scheme', 'custom');
          }
          applyModernDynamicColor(seed, { draw: true, dark: dark });
          syncSchemeCards(null);
          setStatus(t('scheme.customApplied', null, '已应用自定义配色'));
        };
      }
    }
    return m;
  }

  function openBg() {
    var themeItem = resolveTheme(state.theme);
    if (themeItem.supportsTransparency === false) {
      return openColorScheme();
    }
    var html = '<h3>' + t('bg.presets', null, '预置背景') + '</h3><div class="bggrid">';
    BG_LIST.forEach(function (b) {
      html += '<div class="bgitem' + (b.id === state.bgId ? ' sel' : '') + '" data-bg="' + b.id + '" style="background-image:url(' + b.file + '),' + b.css + '"><span>' + tBgName(b) + '</span></div>';
    });
    html += '</div><h3 style="margin-top:12px">' + t('bg.custom', null, '自定义') + '</h3><p class="eyehint">' + t('bg.customHint', null, '选择一张本地图片作为背景（只保存在本机）。') + '</p>';
    var m = modal(t('bg.title', null, '背景'), html, '<button class="abtn" id="bgPick">' + t('bg.pickBtn', null, '选择本地图片') + '</button><button class="abtn" data-close>' + t('common.close', null, '关闭') + '</button>');
    $$('.bgitem', m.el).forEach(function (el) {
      el.onclick = function () {
        setBg(el.dataset.bg);
        $$('.bgitem', m.el).forEach(function (x) { x.classList.remove('sel'); });
        el.classList.add('sel');
      };
    });
    $('#bgPick', m.el).onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var dataUrl = fr.result;
          state.bgId = 'custom';
          state.customBgUrl = dataUrl;
          $('#bgLayer').style.backgroundImage = 'url("' + dataUrl + '")';
          $$('.bgitem', m.el).forEach(function (x) { x.classList.remove('sel'); });
          try {
            localStorage.setItem('nsg.customBg', dataUrl);
            localStorage.setItem('nsg.bg', 'custom');
          } catch (e) { }
        };
        fr.readAsDataURL(f);
      };
      inp.click();
    };
    return m;
  }

  /* ---------------- 主题 ---------------- */
  function resolveTheme(id) {
    var key = String(id || '').trim().toLowerCase();
    if (key === 'win9x') key = '9x';
    if (key === '赛博朋克') key = 'cyberpunk';
    if (key === 'winxp' || key === 'windowsxp' || key === 'experience') key = 'xp';
    if (key === '合成' || key === '像素' || key === 'outrun' || key === 'tracker' || key === 'synthwave') key = 'pixel';
    if (key === '现代' || key === 'material' || key === 'md3' || key === 'material3' || key === 'material-design-3') key = 'modern';
    for (var i = 0; i < THEME_LIST.length; i++) {
      if (THEME_LIST[i].id === key) return THEME_LIST[i];
    }
    return THEME_LIST[0];
  }

  function updateVersionLabel(item) {
    var verEl = $('#appVersionTag') || $('.tb-left i');
    if (!verEl) return;
    var cur = String(verEl.textContent || 'v10.2008');
    verEl.textContent = /\.\d{4}$/.test(cur)
      ? cur.replace(/\.\d{4}$/, '.' + item.versionSuffix)
      : 'v10.' + item.versionSuffix;
  }

  function updateTransparencyVisibility(item) {
    var supported = !item || item.supportsTransparency !== false;
    var wrap = $('.ui-transparency');
    if (wrap) wrap.hidden = !supported;
    var input = $('#uiTransparency');
    if (input) input.disabled = !supported;
    var bgBtn = $('.mbtn[data-act="bg"]');
    if (bgBtn) bgBtn.title = supported ? t('menu.bgTitleImage', null, '背景图片') : t('menu.bgTitleScheme', null, '配色方案（当前主题）');
  }

  function setTheme(id, opts) {
    var item = resolveTheme(id);
    state.theme = item.id;
    NSG.theme = item.id;
    if (typeof document !== 'undefined' && document.documentElement &&
        typeof document.documentElement.setAttribute === 'function') {
      document.documentElement.setAttribute('data-theme', item.id);
    }
    updateVersionLabel(item);
    updateTransparencyVisibility(item);
    applyThemeScheme(item.id, state.themeSchemes[item.id], { draw: false, persist: false });
    if (roll) {
      roll.theme = item.id;
      if (typeof roll.draw === 'function') roll.draw();
    }
    if (typeof drawCurve === 'function') drawCurve();
    if (typeof drawGrid === 'function') drawGrid();
    if (typeof drawHarm === 'function') drawHarm();
    if (!opts || opts.persist !== false) {
      try { localStorage.setItem('nsg.theme', item.id); } catch (e) { }
    }
    return item;
  }
  NSG.setTheme = setTheme;

  function openTheme() {
    var html = '<h3>' + t('theme.heading', null, '界面主题') + '</h3><div class="themegrid">';
    THEME_LIST.forEach(function (th) {
      var sel = th.id === state.theme ? ' sel' : '';
      html += '<button type="button" class="themecard' + sel + '" data-theme-id="' + th.id + '" aria-pressed="' + (th.id === state.theme) + '">' +
        '<div class="theme-preview tp-' + th.id + '">' +
        '<div class="tp-bar"><span class="tp-dot"></span><span class="tp-title">NSG</span></div>' +
        '<div class="tp-body"><span class="tp-note"></span><span class="tp-note tp-note2"></span></div>' +
        '</div>' +
        '<div class="theme-meta"><b>' + tThemeName(th) + '</b></div>' +
        '</button>';
    });
    html += '</div>';
    var m = modal(t('theme.title', null, '主题'), html, '<button class="abtn primary" data-close>' + t('common.done', null, '完成') + '</button>');
    m.el.classList.add('theme-modal');
    $$('.themecard', m.el).forEach(function (el) {
      el.onclick = function () {
        var applied = setTheme(el.dataset.themeId);
        $$('.themecard', m.el).forEach(function (x) {
          var on = x.dataset.themeId === applied.id;
          x.classList.toggle('sel', on);
          x.setAttribute('aria-pressed', String(on));
        });
        setStatus(t('theme.switched', { name: tThemeName(applied) }, '已切换主题：' + applied.name));
      };
    });
  }

  /* ======================================================================
     快速谱曲 · 曲线编辑器
     ----------------------------------------------------------------------
     一条「眼睛」= 一句歌的音高轮廓。峰偏左（唱到 85% 才到最高音）
     是最像人唱的形状；三只眼睛连起来就是「上—下—上」。
     这里把 DSC 工程里的「眼睛数组」原样搬过来，并且能拖：
       拖峰点   → 峰的时间 / 峰值
       拖两端   → 开始基值 / 结束基值
       拖角上的小方块 → 峰的左右位置
     ====================================================================== */
  var EYE_CV = { W: 640, H: 268, l: 40, r: 14, t: 14, b: 30 };

  function eyePlotX(x, cv) { var c = cv || EYE_CV; return c.l + x * (c.W - c.l - c.r); }
  function eyePlotY(y, cv) { var c = cv || EYE_CV; return c.H - c.b - y * (c.H - c.t - c.b); }
  function eyeInvX(px, cv) { var c = cv || EYE_CV; return (px - c.l) / (c.W - c.l - c.r); }
  function eyeInvY(py, cv) { var c = cv || EYE_CV; return (c.H - c.b - py) / (c.H - c.t - c.b); }

  /* 一串音节沿句子横轴的落点（用于画刻度与量化后的阶梯线） */
  function eyeSyllables(lyric) {
    var syl = [];
    try { syl = NSG.g2p(lyric || '', state.score.lang) || []; } catch (e) { syl = []; }
    if (!syl.length) {
      /* 没解析出音节就按字数虚拟 */
      var n = Math.max(4, Math.min(40, (lyric || '啊').length));
      for (var i = 0; i < n; i++) syl.push({ text: '·' });
    }
    return syl;
  }

  function drawEyeEditor(cv, ctxData) {
    var c = cv.getContext('2d');
    var W = EYE_CV.W, H = EYE_CV.H;
    var P = uiCanvasPalette();
    var set = state.eyeSet;
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.eyeBg[0]); g.addColorStop(1, P.eyeBg[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    /* 网格 */
    c.strokeStyle = P.eyeGrid; c.lineWidth = 1;
    c.font = '9px Consolas, monospace'; c.fillStyle = P.eyeAxis;
    for (var i = 0; i <= 4; i++) {
      var x = eyePlotX(i / 4), y = eyePlotY(i / 4);
      c.beginPath(); c.moveTo(x, eyePlotY(0)); c.lineTo(x, eyePlotY(1)); c.stroke();
      c.beginPath(); c.moveTo(eyePlotX(0), y); c.lineTo(eyePlotX(1), y); c.stroke();
      /* 0% 与 100% 贴在边框上会和纵轴刻度挤在一起，只标中间三档 */
      if (i > 0 && i < 4) c.fillText((i * 25) + '%', x - 8, H - 9);
      if (i > 0) c.fillText((i * 0.25).toFixed(2), 6, y + 3);
    }

    var syl = (ctxData && ctxData.syl) || [];
    var N = syl.length;
    /* 音节刻度 */
    if (N) {
      c.strokeStyle = P.eyeTick;
      for (var s = 0; s < N; s++) {
        var range = ctxData.ranges && ctxData.ranges[s];
        var xx = eyePlotX(range ? (range[0] + range[1]) / 2 : (s + 0.5) / N);
        c.beginPath(); c.moveTo(xx, eyePlotY(0)); c.lineTo(xx, eyePlotY(0) - 5); c.stroke();
      }
    }

    /* 眼睛本体 */
    (set.eyes || []).forEach(function (e, idx) {
      var E = NSG.COMPOSE.EYE.eye(e);
      var sel = idx === state.eyeSel;
      var pa = eyePlotX(E['开始']), pb = eyePlotX(E['结束']);
      c.beginPath();
      var steps = 90;
      for (var k = 0; k <= steps; k++) {
        var t = k / steps;
        var xv = E['开始'] + (E['结束'] - E['开始']) * t;
        var yv = NSG.COMPOSE.EYE.at(E, xv);
        var px = eyePlotX(xv), py = eyePlotY(yv);
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.lineTo(pb, eyePlotY(0));
      c.lineTo(pa, eyePlotY(0));
      c.closePath();
      var fill = c.createLinearGradient(0, eyePlotY(1), 0, eyePlotY(0));
      var fStops = sel ? P.eyeSelFill : P.eyeFill;
      fill.addColorStop(0, fStops[0]);
      fill.addColorStop(0.55, fStops[1]);
      fill.addColorStop(1, fStops[2]);
      c.fillStyle = fill; c.fill();
      c.beginPath();
      for (var k2 = 0; k2 <= steps; k2++) {
        var t2 = k2 / steps;
        var xv2 = E['开始'] + (E['结束'] - E['开始']) * t2;
        var px2 = eyePlotX(xv2), py2 = eyePlotY(NSG.COMPOSE.EYE.at(E, xv2));
        if (k2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
      }
      c.strokeStyle = sel ? P.eyeSelGlow : P.eyeGlow;
      c.lineWidth = sel ? 4.2 : 3.0;
      c.stroke();
      c.strokeStyle = sel ? P.eyeSelStroke : P.eyeStroke;
      c.lineWidth = sel ? 2.2 : 1.5;
      c.stroke();

      /* 峰与两端把手 */
      c.fillStyle = sel ? P.eyeSelHandle : P.eyeHandle;
      c.beginPath(); c.arc(eyePlotX(E['峰的时间']), eyePlotY(E['峰值']), sel ? 5.5 : 4, 0, 6.2832); c.fill();
      c.fillStyle = sel ? P.eyeEndSel : P.eyeEnd;
      [[E['开始'], E['开始基值']], [E['结束'], E['结束基值']]].forEach(function (p) {
        c.fillRect(eyePlotX(p[0]) - 3.5, eyePlotY(p[1]) - 3.5, 7, 7);
      });
    });

    /* 量化后的实际音高阶梯（把眼睛变成离散音级）
       画成一条连续折线：音级变化处拉竖线，一眼能看出「眼睛」被压成了几级 */
    if (ctxData && ctxData.steps && ctxData.steps.length) {
      var span = ctxData.span || 7;
      var nSt = ctxData.steps.length;
      var pts = [];
      for (var q = 0; q < nSt; q++) {
        var yq = eyePlotY(Math.max(0, Math.min(1, ctxData.steps[q] / span)));
        var qr = ctxData.ranges && ctxData.ranges[q];
        pts.push([eyePlotX(qr ? qr[0] : q / nSt), yq], [eyePlotX(qr ? qr[1] : (q + 1) / nSt), yq]);
      }
      /* 描边打底，压在填充上也看得清 */
      c.lineJoin = 'round';
      c.strokeStyle = P.eyeStepHalo; c.lineWidth = 4.5;
      c.beginPath();
      for (var pp = 0; pp < pts.length; pp++) {
        if (pp === 0) c.moveTo(pts[pp][0], pts[pp][1]); else c.lineTo(pts[pp][0], pts[pp][1]);
      }
      c.stroke();
      c.strokeStyle = P.eyeStepLine; c.lineWidth = 2;
      c.beginPath();
      for (var pp2 = 0; pp2 < pts.length; pp2++) {
        if (pp2 === 0) c.moveTo(pts[pp2][0], pts[pp2][1]); else c.lineTo(pts[pp2][0], pts[pp2][1]);
      }
      c.stroke();
    }

    /* 谱全曲模式下的段落分界线与段落标记 */
    var fsMeta = ctxData && ctxData.fullSongMeta;
    if (fsMeta && fsMeta.sections && fsMeta.sections.length > 1) {
      c.save();
      c.font = 'bold 9px Consolas, monospace';
      c.textAlign = 'center';
      fsMeta.sections.forEach(function (sec, si) {
        if (si > 0) {
          var sx = eyePlotX(sec.startRatio);
          c.strokeStyle = P.eyeMom;
          c.globalAlpha = 0.55;
          c.setLineDash([2, 3]);
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(sx, eyePlotY(1)); c.lineTo(sx, eyePlotY(0)); c.stroke();
          c.setLineDash([]);
        }
        var midX = eyePlotX((sec.startRatio + sec.endRatio) * 0.5);
        var shortName = t('arr.sec.' + sec.role, null, { verse: '主', pre: '预', chorus: '副', bridge: '桥', outro: '尾' }[sec.role] || sec.role);
        c.globalAlpha = 0.88;
        c.fillStyle = P.eyeTitle;
        c.fillText(shortName, midX, eyePlotY(1) + 11);
      });
      c.restore();
    }

    /* 整体势虚线（谱全曲模式绘制全曲多波峰宏观势曲线） */
    var mom = NSG.COMPOSE.EYE.momentum(set.momentum);
    if (ctxData && ctxData.momOn) {
      if (fsMeta && fsMeta.macroCurve && fsMeta.macroCurve.length > 1) {
        c.strokeStyle = P.eyeMom; c.setLineDash([4, 4]); c.lineWidth = 1.5;
        c.beginPath();
        fsMeta.macroCurve.forEach(function (pt, mi) {
          var xm = eyePlotX(pt.x), ym = eyePlotY(pt.y);
          if (mi === 0) c.moveTo(xm, ym); else c.lineTo(xm, ym);
        });
        c.stroke(); c.setLineDash([]);
      } else if (mom) {
        c.strokeStyle = P.eyeMom; c.setLineDash([4, 4]); c.lineWidth = 1.3;
        c.beginPath();
        for (var m = 0; m <= 100; m++) {
          var xm2 = eyePlotX(m / 100), ym2 = eyePlotY(NSG.COMPOSE.EYE.momValue(mom, m / 100));
          if (m === 0) c.moveTo(xm2, ym2); else c.lineTo(xm2, ym2);
        }
        c.stroke(); c.setLineDash([]);
      }
    }

    /* 试听乐谱时的播放头 */
    if (ctxData && typeof ctxData.playheadX === 'number' && isFinite(ctxData.playheadX)) {
      var phX = eyePlotX(Math.max(0, Math.min(1, ctxData.playheadX)));
      c.save();
      c.strokeStyle = P.eyeStepHalo; c.lineWidth = 4;
      c.beginPath(); c.moveTo(phX, eyePlotY(1)); c.lineTo(phX, eyePlotY(0)); c.stroke();
      c.strokeStyle = P.eyeStepLine; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(phX, eyePlotY(1)); c.lineTo(phX, eyePlotY(0)); c.stroke();
      c.fillStyle = P.eyeStepLine;
      c.beginPath();
      c.moveTo(phX, eyePlotY(1) + 5);
      c.lineTo(phX - 4, eyePlotY(1) - 1);
      c.lineTo(phX + 4, eyePlotY(1) - 1);
      c.closePath();
      c.fill();
      c.restore();
    }

    /* 标题（左上）与图例（右上）：都贴着画布内侧画，别越界 */
    c.fillStyle = P.eyeTitle; c.font = 'bold 10px Consolas, monospace';
    c.textAlign = 'left';
    var eyeTitle = (!state.eyeSet.name || state.eyeSet.name === '自定义')
      ? t('common.custom', null, '自定义')
      : tEyeName(state.eyeSet.name);
    c.fillText(eyeTitle, eyePlotX(0) + 3, 12);
    c.font = '9px Consolas, monospace'; c.fillStyle = P.eyeLegend;
    c.textAlign = 'right';
    c.fillText(t('compose.legend', null, '红线 = 落到的音级'), eyePlotX(1) - 2, 12);
    c.textAlign = 'left';
  }

  function eyeParamsHtml() {
    var e = NSG.COMPOSE.EYE.eye(state.eyeSet.eyes[state.eyeSel] || {});
    var span = Math.max(1e-6, e['结束'] - e['开始']);
    var pad = Math.min(0.02, span * 0.25);
    var pxMin = fmt2(Math.min(e['峰的时间'], e['开始'] + pad));
    var pxMax = fmt2(Math.max(e['峰的时间'], e['结束'] - pad));
    function row(id, label, min, max, step, val) {
      var fv = fmt2(val);
      return '<div class="row eyerow"><label>' + label + '</label>' +
        '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + fv + '">' +
        '<span class="val" id="' + id + 'v">' + fv + '</span></div>';
    }
    return row('eyePx', t('compose.eyePx', null, '峰位置'), pxMin, pxMax, 0.01, e['峰的时间'])
      + row('eyePy', t('compose.eyePy', null, '峰高度'), 0, 1, 0.01, e['峰值'])
      + row('eyeKl', t('compose.eyeKl', null, '左尖锐'), 0.4, 3, 0.05, e['左尖锐'])
      + row('eyeKr', t('compose.eyeKr', null, '右尖锐'), 0.4, 3, 0.05, e['右尖锐'])
      + row('eyeY0', t('compose.eyeY0', null, '起点基值'), 0, 1, 0.01, e['开始基值'])
      + row('eyeY1', t('compose.eyeY1', null, '终点基值'), 0, 1, 0.01, e['结束基值']);
  }
  function fmt2(v) { return (+v).toFixed(2); }

  function openCompose() {
    /* 关掉的旧编辑器如果还挂着 window 上的鼠标监听，先摘掉，
       否则开几次之后每次移动鼠标都会往已经拆掉的画布上画 */
    if (window.__nsgEyeCleanup) { window.__nsgEyeCleanup(); window.__nsgEyeCleanup = null; }
    var picked = roll.selected(), selectionMode = picked.length > 1;
    var selectedStart = 0, selectedEnd = 0;
    if (selectionMode) {
      selectedStart = Math.min.apply(null, picked.map(function (n) { return n.start; }));
      selectedEnd = Math.max.apply(null, picked.map(function (n) { return n.start + n.dur; }));
    }
    var txt = $('#lyrBox').value.trim() || t('compose.defaultLyric', null, '月亮出来亮汪汪，想起我的阿哥在深山');
    if (selectionMode) txt = picked.slice().sort(function (a, b) { return a.start - b.start; })
      .map(function (n) { return n.lyric || ''; }).join(' ');
    var body =
      '<p class="eyehint">' + (selectionMode
        ? t('compose.selHint', { n: picked.length }, '当前选中 ' + picked.length + ' 个音符：只调整所选发声音符的音高，保留起点、长度、歌词与调教；休止和换气保持原样。')
        : t('compose.appendHint', null, '生成的旋律将接在当前钢琴窗最后一个音符的末尾。')) + '</p>' +
      '<div class="eyewrap">' +
      '<div class="eyeleft">' +
      '<canvas id="eyeCv" width="' + EYE_CV.W + '" height="' + EYE_CV.H + '"></canvas>' +
      '<div class="eyebar">' +
      '<button class="abtn" id="eyeAdd">' + t('compose.addEye', null, '＋ 加一只眼睛') + '</button>' +
      '<button class="abtn" id="eyeDel">' + t('compose.delEye', null, '－ 删掉这只') + '</button>' +
      '<button class="abtn" id="eyeMirror">' + t('compose.mirrorEye', null, '左右翻转') + '</button>' +
      '<label class="tl eyemom"><input type="checkbox" id="eyeMomChk" checked> ' + t('compose.momentum', null, '整体势') + '</label>' +
      '</div>' +
      '<div class="eyebar eyefullbar">' +
      '<label class="tl" title="' + escAttr(t('compose.fullSongTitle', null, '自动识别空行段落或起承转合，按乐句长度循环使用眼睛曲线，并加入全曲宏观势、变奏与节奏呼吸，便于长歌词谱曲与自动伴奏')) + '"><input type="checkbox" id="eyeFullChk"' + (state.composeFullSong ? ' checked' : '') + '> ' + t('compose.fullSong', null, '谱全曲') + '</label>' +
      '<label class="tl eyectl' + (state.composeFullSong ? '' : ' off') + '" id="eyeCycleWrap">' +
      '<span>' + t('compose.cycleMode', null, '循环方式') + '</span>' +
      '<select id="eyeCycleMode" class="tiny"' + (state.composeFullSong ? '' : ' disabled') + '>' +
      '<option value="group"' + (state.composeCycleMode !== 'perEye' ? ' selected' : '') + '>' + t('compose.cycleGroup', null, '整组循环') + '</option>' +
      '<option value="perEye"' + (state.composeCycleMode === 'perEye' ? ' selected' : '') + '>' + t('compose.cyclePerEye', null, '逐眼分配') + '</option>' +
      '</select></label>' +
      (selectionMode ? '' :
        '<label class="tl eyectl' + (state.composeFullSong ? '' : ' off') + '" id="eyeIntroWrap" title="' + escAttr(t('compose.introBarsTitle', null, '在第一句起唱前预留的空白小节数，方便自动伴奏演奏前奏')) + '">' +
        '<span>' + t('compose.introBars', null, '前奏留白') + '</span>' +
        '<input type="number" id="eyeIntroBars" class="numin" min="0" max="16" step="1" value="' + (Number.isFinite(state.composeIntroBars) ? state.composeIntroBars : 4) + '"' + (state.composeFullSong ? '' : ' disabled') + '>' +
        '<span>' + t('compose.barsUnit', null, '小节') + '</span></label>') +
      '</div>' +
      '<div id="eyeParams" class="eyeparams">' + eyeParamsHtml() + '</div>' +
      '<p class="eyehint">' + t('compose.dragHint', null, '拖峰点改「峰在哪、峰多高」；拖两端的方块改起落高度。峰越靠近句尾，最后几个字才冲上去；左右尖锐越大，峰越尖。') + '</p>' +
      '</div>' +
      '<div class="eyeright">' +
      '<div class="cap2">' + t('compose.presetsCap', null, '样式') + '<span class="mini">' + t('compose.presetsNote', null, '点一下即换') + '</span></div>' +
      '<div class="eyepresets" id="eyePresets"></div>' +
      '<div class="cap2" id="cpLyrCap">' + (selectionMode ? t('compose.selLyrics', null, '选中段歌词（只读）') : (state.composeFullSong ? t('compose.fullLyrics', null, '全曲歌词') + '<span class="mini">' + t('compose.fullLyricsNote', null, '空行分段落') + '</span>' : t('compose.phraseLyrics', null, '这句歌词'))) + '</div>' +
      '<textarea id="cpLyr" rows="' + (!selectionMode && state.composeFullSong ? 4 : 3) + '"' + (selectionMode ? ' readonly' : '') + '>' + txt.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea>' +
      '<div class="row2"><label class="lb">' + t('left.key', null, '调性') + '</label><select id="cpRoot" class="tiny">' + keyOptionsHtml() + '</select></div>' +
      '<div class="row2"><label class="lb">' + t('left.scale', null, '音阶') + '</label><select id="cpScale" class="tiny">' +
      scaleOptionsHtml() + '</select></div>' +
      '<div class="row2"><label class="lb">' + t('compose.span', null, '跨度') + '</label><input type="number" id="cpSpan" class="numin" min="2" max="14" step="1" value="7" style="width:56px"><span class="mini">' + t('compose.spanUnit', null, '级') + '</span></div>' +
      '<div class="cap2">' + t('compose.contourCap', null, '旋律轮廓') + '</div>' +
      '<div id="eyeOut" class="eyeout"></div>' +
      '<div class="eyepreview">' +
      '<button type="button" class="abtn" id="cpPrevScale" title="' + escAttr(t('compose.previewScaleTitle', null, '用钢琴弹奏当前选定的音阶')) + '">' + t('compose.previewScale', null, '▶ 预览音阶') + '</button>' +
      '<button type="button" class="abtn" id="cpPrevScore" title="' + escAttr(t('compose.previewScoreTitle', null, '用钢琴弹奏当前谱曲设定下的实际乐谱')) + '">' + t('compose.previewScore', null, '▶ 预览乐谱') + '</button>' +
      '</div>' +
      '</div></div>';

    var m = modal(t('compose.title', null, '快速谱曲 · 曲线编辑器'), body,
      '<button class="abtn" id="cpGo">' + (selectionMode ? t('compose.applySel', null, '应用到选中段') : t('compose.appendBtn', null, '追加旋律')) + '</button><button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    m.el.classList.add('wide');

    var cv = $('#eyeCv', m.el);
    var momChk = $('#eyeMomChk', m.el);
    var fullChk = $('#eyeFullChk', m.el);
    var cycleSel = $('#eyeCycleMode', m.el);
    var cycleWrap = $('#eyeCycleWrap', m.el);
    var introIn = $('#eyeIntroBars', m.el);
    var introWrap = $('#eyeIntroWrap', m.el);
    var lyrCap = $('#cpLyrCap', m.el);
    var lyrBox = $('#cpLyr', m.el);
    var rootSel = $('#cpRoot', m.el);
    var scaleSel = $('#cpScale', m.el);
    var spanIn = $('#cpSpan', m.el);
    var prevScaleBtn = $('#cpPrevScale', m.el);
    var prevScoreBtn = $('#cpPrevScore', m.el);
    rootSel.value = String(state.score.root || 62);
    scaleSel.value = $('#scaleSel').value || 'penta';

    function syncFullSongUI() {
      var on = !!(fullChk && fullChk.checked);
      state.composeFullSong = on;
      if (cycleSel) {
        cycleSel.disabled = !on;
        state.composeCycleMode = cycleSel.value === 'perEye' ? 'perEye' : 'group';
      }
      if (cycleWrap) cycleWrap.classList.toggle('off', !on);
      if (introIn) {
        introIn.disabled = !on;
        var ib = parseInt(introIn.value, 10);
        if (isFinite(ib)) state.composeIntroBars = Math.max(0, Math.min(16, ib));
      }
      if (introWrap) introWrap.classList.toggle('off', !on);
      if (!selectionMode) {
        if (lyrBox) lyrBox.rows = on ? 4 : 3;
        if (lyrCap) {
          lyrCap.innerHTML = on
            ? t('compose.fullLyrics', null, '全曲歌词') + '<span class="mini">' + t('compose.fullLyricsNote', null, '空行分段落') + '</span>'
            : t('compose.phraseLyrics', null, '这句歌词');
        }
      }
    }

    /* 钢琴预览（选定音阶 / 当前设定实际乐谱） */
    var previewSource = null, previewRenderer = null, previewReq = 0;
    var previewKind = null, previewBusy = false, previewRaf = 0, previewPlayheadX = null;

    function syncPreviewBtns() {
      var prepLabel = t('compose.previewPrep', null, '… 准备中');
      var stopLabel = t('compose.previewStop', null, '■ 停止预览');
      var scaleActive = previewKind === 'scale';
      var scoreActive = previewKind === 'score';
      if (prevScaleBtn) {
        prevScaleBtn.textContent = scaleActive ? (previewBusy ? prepLabel : stopLabel) : t('compose.previewScale', null, '▶ 预览音阶');
        prevScaleBtn.classList.toggle('gold', scaleActive);
      }
      if (prevScoreBtn) {
        prevScoreBtn.textContent = scoreActive ? (previewBusy ? prepLabel : stopLabel) : t('compose.previewScore', null, '▶ 预览乐谱');
        prevScoreBtn.classList.toggle('gold', scoreActive);
      }
    }

    function stopComposePreview(closeWorker) {
      previewReq++;
      var hadVisual = previewPlayheadX !== null || !!previewRaf;
      if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
      previewPlayheadX = null;
      if (previewSource) {
        var src = previewSource;
        previewSource = null;
        src.onended = null;
        try { src.stop(); } catch (e) {}
        try { src.disconnect(); } catch (e) {}
      }
      if ((closeWorker || previewBusy) && previewRenderer) {
        previewRenderer.close();
        previewRenderer = null;
      }
      previewKind = null;
      previewBusy = false;
      syncPreviewBtns();
      if (hadVisual && m.isOpen()) redraw();
    }

    function buildScalePreviewData() {
      var root = parseInt(rootSel.value, 10);
      if (!isFinite(root)) root = 60;
      var degs = NSG.COMPOSE.SCALES[scaleSel.value] || NSG.COMPOSE.SCALES.penta;
      var stepBeats = degs.length > 8 ? 0.35 : 0.45;
      var notes = [];
      for (var i = 0; i <= degs.length; i++) {
        var isLast = i === degs.length;
        notes.push({
          start: i * stepBeats,
          dur: isLast ? stepBeats * 2.4 : stepBeats * 1.15,
          pitch: NSG.COMPOSE.degToMidi(root, degs, i),
          vel: (i === 0 || isLast) ? 94 : 84,
          inst: 'piano'
        });
      }
      return {
        score: { tempo: 120, tracks: [{ type: 'inst', space: 'intimate', notes: notes }] },
        trackPlayhead: null
      };
    }

    function buildScorePreviewData() {
      var res = buildMelody();
      if (!res.notes.length) return null;
      var tm = NSG.TEMPO.map(state.score);
      var offset = res.notes[0].start || 0;
      var previewNotes = res.notes.map(function (n) {
        return {
          start: Math.max(0, n.start - offset),
          dur: Math.max(0.0625, n.dur),
          pitch: n.pitch,
          vel: n.vel || 96,
          inst: 'piano'
        };
      });
      var endBeat = 0;
      previewNotes.forEach(function (n) { endBeat = Math.max(endBeat, n.start + n.dur); });
      var previewScore;
      if (selectionMode) {
        var shiftedTempos = [{ beat: 0, bpm: tm.bpmAt(offset) }];
        tm.list.forEach(function (seg) {
          if (seg.beat > offset + 1e-6) {
            shiftedTempos.push({ beat: seg.beat - offset, bpm: seg.bpm });
          }
        });
        previewScore = {
          tempo: shiftedTempos[0].bpm,
          tempos: shiftedTempos,
          tracks: [{ type: 'inst', space: 'intimate', notes: previewNotes }]
        };
      } else {
        var appendStart = 0;
        roll.notes.forEach(function (n) { appendStart = Math.max(appendStart, n.start + n.dur); });
        previewScore = {
          tempo: tm.bpmAt(appendStart),
          tracks: [{ type: 'inst', space: 'intimate', notes: previewNotes }]
        };
      }
      var shiftedTm = NSG.TEMPO.map(previewScore);
      var selDur = selectedEnd - selectedStart || 1;
      var fsVocalStart = res.fullSongMeta ? (res.fullSongMeta.vocalStart || 0) : 0;
      var fsVocalDur = res.fullSongMeta && res.fullSongMeta.vocalBeats > 0 ? res.fullSongMeta.vocalBeats : 0;
      return {
        score: previewScore,
        trackPlayhead: function (elapsedSec) {
          if (elapsedSec < 0) return 0;
          var curBeat = shiftedTm.beatOf(elapsedSec);
          if (curBeat > endBeat) return null;
          if (selectionMode) {
            return Math.max(0, Math.min(1, (offset + curBeat - selectedStart) / selDur));
          }
          if (fsVocalDur > 0) {
            return Math.max(0, Math.min(1, (offset + curBeat - fsVocalStart) / fsVocalDur));
          }
          var totalN = previewNotes.length;
          if (!totalN) return null;
          if (curBeat <= previewNotes[0].start) return 0;
          for (var q = 0; q < totalN; q++) {
            var nt = previewNotes[q];
            if (curBeat <= nt.start + nt.dur) {
              var frac = nt.dur > 0 ? Math.max(0, Math.min(1, (curBeat - nt.start) / nt.dur)) : 1;
              return (q + frac) / totalN;
            }
            if (q + 1 < totalN && curBeat < previewNotes[q + 1].start) {
              return (q + 1) / totalN;
            }
          }
          return 1;
        }
      };
    }

    async function playComposePreview(kind) {
      if (previewKind === kind) {
        stopComposePreview(false);
        return;
      }
      stopComposePreview(false);
      stopPlay();
      var data = kind === 'scale' ? buildScalePreviewData() : buildScorePreviewData();
      if (!data || !data.score) {
        setStatus(selectionMode
          ? t('compose.noNotesAlertSel', null, '选中段没有可谱曲的发声音符')
          : t('compose.noNotesAlert', null, '没有可用的音节'));
        return;
      }
      var req = previewReq;
      var ctx = ensureCtx();
      previewKind = kind;
      previewBusy = true;
      syncPreviewBtns();
      try {
        if (!previewRenderer) previewRenderer = NSG.Renderer.create();
        var r = await previewRenderer.accomp(data.score);
        if (!m.isOpen() || req !== previewReq) return;
        previewBusy = false;
        if (!r || !r.audio || !r.audio.channels || !r.audio.channels[0] || !r.audio.channels[0].length) {
          stopComposePreview(false);
          return;
        }
        if (ctx.state === 'suspended') await ctx.resume();
        if (!m.isOpen() || req !== previewReq) return;
        var audio = r.audio;
        var buffer = ctx.createBuffer(audio.channels.length, audio.channels[0].length, audio.sr);
        audio.channels.forEach(function (pcm, ch) { buffer.copyToChannel(pcm, ch); });
        var src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        previewSource = src;
        syncPreviewBtns();
        var startAt = ctx.currentTime;
        src.onended = function () {
          try { src.disconnect(); } catch (e) {}
          if (previewSource === src) {
            previewSource = null;
            if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0; }
            previewPlayheadX = null;
            previewKind = null;
            previewBusy = false;
            syncPreviewBtns();
            if (m.isOpen()) redraw();
          }
        };
        src.start(startAt);
        if (kind === 'score' && data.trackPlayhead) {
          var tick = function () {
            if (!m.isOpen() || req !== previewReq || previewSource !== src) return;
            var ph = data.trackPlayhead(ctx.currentTime - startAt);
            previewPlayheadX = ph;
            redraw();
            if (ph !== null) previewRaf = requestAnimationFrame(tick);
            else previewRaf = 0;
          };
          previewRaf = requestAnimationFrame(tick);
        }
      } catch (e) {
        if (m.isOpen() && req === previewReq && e.name !== 'AbortError') {
          previewBusy = false;
          previewKind = null;
          syncPreviewBtns();
          setStatus(t('compose.previewFail', { msg: tMsg(e.message) }, '钢琴预览失败：' + e.message));
        }
      }
    }

    if (prevScaleBtn) prevScaleBtn.onclick = function () { playComposePreview('scale'); };
    if (prevScoreBtn) prevScoreBtn.onclick = function () { playComposePreview('score'); };

    function currentStyle() {
      var st = NSG.COMPOSE.styleById(state.composeStyle);
      return st;
    }
    function refreshOut() {
      if (previewKind === 'score') stopComposePreview(false);
      var st = currentStyle();
      spanIn.value = spanIn.value || st.span;
      var res = buildMelody();
      var scaleNotes = res.degs.map(function (d) { return KEY_NAMES[((res.root + d) % 12 + 12) % 12]; }).join(' ');
      scaleSel.title = scaleNotes;
      var secSummaryHtml = '';
      if (res.fullSongMeta && res.fullSongMeta.sections && res.fullSongMeta.sections.length) {
        var secParts = [];
        if (res.fullSongMeta.introBars > 0) {
          secParts.push(t('compose.sec.introTag', { n: res.fullSongMeta.introBars }, '前奏(' + res.fullSongMeta.introBars + '小节)'));
        }
        res.fullSongMeta.sections.forEach(function (s) {
          var lb = t('compose.sec.' + s.role, null, { verse: '主歌', pre: '导歌', chorus: '副歌', bridge: '桥段', outro: '尾声' }[s.role] || s.role);
          secParts.push(lb + '(' + s.phraseCount + ')');
        });
        var secLabels = secParts.join('→');
        secSummaryHtml = '<div style="margin-top:3px;font-size:10px;opacity:.92">' +
          t('compose.fullSongSummary', {
            secs: secLabels,
            bars: res.fullSongMeta.totalBars
          }, '段落：' + secLabels + ' · ' + res.fullSongMeta.totalBars + ' 小节') + '</div>';
      }
      $('#eyeOut', m.el).innerHTML = (res.notes.length
        ? t('compose.outSummary', {
            n: res.notes.length,
            lo: noteName(Math.min.apply(null, res.notes.map(function (n) { return n.pitch; }))),
            hi: noteName(Math.max.apply(null, res.notes.map(function (n) { return n.pitch; })))
          }, '音符 <b>' + res.notes.length + '</b> · 音域 ' + noteName(Math.min.apply(null, res.notes.map(function (n) { return n.pitch; }))) +
          '–' + noteName(Math.max.apply(null, res.notes.map(function (n) { return n.pitch; }))))
        : '<span style="color:#b03020">' + (selectionMode ? t('compose.noVoicedSel', null, '选中段没有发声音符') : t('compose.noSyl', null, '没有解析出音节')) + '</span>') +
        secSummaryHtml +
        '<div style="margin-top:3px;opacity:.82;font-size:10px">' + scaleNotes + '</div>';
      if (prevScoreBtn) prevScoreBtn.disabled = !res.notes.length;
      lastRes = res;
      drawEyeEditor(cv, {
        syl: res.syl, steps: res.steps, ranges: res.ranges, span: res.span,
        momOn: momChk.checked, playheadX: previewPlayheadX, fullSongMeta: res.fullSongMeta
      });
    }
    function buildMelody() {
      var lyric = lyrBox.value;
      var syl = selectionMode ? [] : eyeSyllables(lyric);
      var root = parseInt(rootSel.value, 10);
      var degs = NSG.COMPOSE.SCALES[scaleSel.value] || NSG.COMPOSE.SCALES.penta;
      var span = Math.max(2, Math.min(14, +spanIn.value || 7));
      var fullSong = !!(fullChk && fullChk.checked);
      var cycleMode = (cycleSel && cycleSel.value === 'perEye') ? 'perEye' : 'group';
      var introBars = introIn ? Math.max(0, Math.min(16, Math.round(+introIn.value || 0))) : (Number.isFinite(state.composeIntroBars) ? state.composeIntroBars : 4);
      var options = {
        root: root, style: state.composeStyle, eye: state.eyeSet,
        span: span, degs: degs,
        momentumWeight: momChk.checked ? 0.35 : 0,
        fullSong: fullSong,
        eyeCycleMode: cycleMode,
        introBars: introBars
      };
      var notes = selectionMode ? NSG.COMPOSE.reshapeMelody(picked, state.score.lang, options)
        : NSG.COMPOSE.melody(lyric, state.score.lang, options);
      var fullSongMeta = notes.fullSongMeta || null;
      var ranges = null;
      if (selectionMode) {
        syl = notes.map(function (n) { return { text: n.lyric }; });
        var duration = selectedEnd - selectedStart || 1;
        ranges = notes.map(function (n) {
          return [(n.start - selectedStart) / duration, (n.start + n.dur - selectedStart) / duration];
        });
      } else if (fullSongMeta && fullSongMeta.vocalBeats > 0) {
        syl = notes.map(function (n) { return { text: n.lyric }; });
        var fsStart = fullSongMeta.vocalStart || 0;
        var fsDur = fullSongMeta.vocalBeats;
        ranges = notes.map(function (n) {
          return [(n.start - fsStart) / fsDur, (n.start + n.dur - fsStart) / fsDur];
        });
      }
      /* 量化后的音级：单调音阶按音级序绘制；非单调音阶（如「大」）按实际半音高度映射，
         让红线直接反映出大跳与离调拐折的真实轮廓 */
      var nonMonotonic = degs.some(function (v, idx) { return idx > 0 && v < degs[idx - 1]; });
      var steps = notes.map(function (n) {
        var d = n.pitch - root;
        if (nonMonotonic) return (d / 12) * span;
        var oct = Math.floor(d / 12), pc = ((d % 12) + 12) % 12;
        var idx = degs.indexOf(pc);
        return idx < 0 ? (oct + 0.5) * degs.length : oct * degs.length + idx;
      });
      return { notes: notes, steps: steps, ranges: ranges, syl: syl, span: span, degs: degs, root: root, fullSongMeta: fullSongMeta };
    }

    /* 预置按钮 */
    var pbox = $('#eyePresets', m.el);
    NSG.COMPOSE.EYE.PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'eyepreset';
      b.textContent = tEyeName(p.name);
      b.title = tEyeTip(p.name, p.tip || '');
      b.dataset.name = p.name;
      b.onclick = function () {
        state.eyeSet = NSG.COMPOSE.EYE.preset(p.name);
        state.eyeName = p.name;
        state.eyeSel = 0;
        syncEyeUI();
        refreshOut();
        setStatus(t('compose.eyeStatus', { name: tEyeName(p.name), tip: tEyeTip(p.name, p.tip || '') }, '眼睛曲线：' + p.name + ' —— ' + (p.tip || '')));
      };
      pbox.appendChild(b);
    });

    function syncEyeUI() {
      $('#eyeParams', m.el).innerHTML = eyeParamsHtml();
      bindEyeParams();
      $$('.eyepreset', m.el).forEach(function (b) {
        b.classList.toggle('on', b.dataset.name === state.eyeSet.name);
      });
      /* 样式下拉跟着眼睛走：找到用这只眼睛的曲风 */
      var st = NSG.COMPOSE.STYLES.filter(function (x) { return x.eye === state.eyeSet.name; })[0];
      if (st) { state.composeStyle = st.id; spanIn.value = st.span; }
      $$('.eyestyle', m.el).forEach(function (b) { b.classList.toggle('on', b.dataset.id === state.composeStyle); });
    }

    function bindEyeParams() {
      var e = state.eyeSet.eyes[state.eyeSel];
      function bind(id, key) {
        var el = $('#' + id, m.el);
        if (!el) return;
        el.addEventListener('input', function () {
          var v = parseFloat(this.value);
          e[key] = v;
          $('#' + id + 'v', m.el).textContent = v.toFixed(2);
          state.eyeSet.name = '自定义';
          $$('.eyepreset', m.el).forEach(function (b) { b.classList.remove('on'); });
          refreshOut();
        });
      }
      bind('eyePx', '峰的时间'); bind('eyePy', '峰值');
      bind('eyeKl', '左尖锐'); bind('eyeKr', '右尖锐');
      bind('eyeY0', '开始基值'); bind('eyeY1', '结束基值');
    }

    function updateEyeParamInputs() {
      var e = NSG.COMPOSE.EYE.eye(state.eyeSet.eyes[state.eyeSel] || {});
      var span = Math.max(1e-6, e['结束'] - e['开始']);
      var pad = Math.min(0.02, span * 0.25);
      var pxEl = $('#eyePx', m.el);
      if (pxEl) {
        pxEl.min = fmt2(Math.min(e['峰的时间'], e['开始'] + pad));
        pxEl.max = fmt2(Math.max(e['峰的时间'], e['结束'] - pad));
      }
      [
        ['eyePx', e['峰的时间']],
        ['eyePy', e['峰值']],
        ['eyeKl', e['左尖锐']],
        ['eyeKr', e['右尖锐']],
        ['eyeY0', e['开始基值']],
        ['eyeY1', e['结束基值']]
      ].forEach(function (pair) {
        var fv = fmt2(pair[1]);
        var input = $('#' + pair[0], m.el);
        var valEl = $('#' + pair[0] + 'v', m.el);
        if (input) input.value = fv;
        if (valEl) valEl.textContent = fv;
      });
    }

    var lastRes = null;
    function redraw() {
      drawEyeEditor(cv, {
        syl: lastRes ? lastRes.syl : [],
        steps: lastRes ? lastRes.steps : null,
        ranges: lastRes ? lastRes.ranges : null,
        span: lastRes ? lastRes.span : 1,
        momOn: momChk.checked,
        playheadX: previewPlayheadX,
        fullSongMeta: lastRes ? lastRes.fullSongMeta : null
      });
    }
    /* 拖动 */
    var drag = null;
    function canvasPos(ev) {
      var r = cv.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * EYE_CV.W / r.width,
        y: (ev.clientY - r.top) * EYE_CV.H / r.height
      };
    }
    function hitTestOne(i, p) {
      var eyes = state.eyeSet.eyes;
      if (i < 0 || i >= eyes.length) return null;
      var E = NSG.COMPOSE.EYE.eye(eyes[i]);
      if (Math.abs(p.x - eyePlotX(E['峰的时间'])) < 12 && Math.abs(p.y - eyePlotY(E['峰值'])) < 12) return { i: i, part: 'peak' };
      if (Math.abs(p.x - eyePlotX(E['开始'])) < 10 && Math.abs(p.y - eyePlotY(E['开始基值'])) < 10) return { i: i, part: 'start' };
      if (Math.abs(p.x - eyePlotX(E['结束'])) < 10 && Math.abs(p.y - eyePlotY(E['结束基值'])) < 10) return { i: i, part: 'end' };
      return null;
    }
    function hitTest(p) {
      var h = hitTestOne(state.eyeSel, p);
      if (h) return h;
      var eyes = state.eyeSet.eyes;
      for (var i = eyes.length - 1; i >= 0; i--) {
        if (i === state.eyeSel) continue;
        h = hitTestOne(i, p);
        if (h) return h;
      }
      return null;
    }
    cv.addEventListener('mousedown', function (ev) {
      var p = canvasPos(ev);
      var hit = hitTest(p);
      if (hit) {
        state.eyeSel = hit.i;
        drag = hit;
        syncEyeUI();
      } else {
        /* 点进哪只眼睛就选哪只 */
        var x = Math.max(0, Math.min(1, eyeInvX(p.x)));
        var eyes = state.eyeSet.eyes;
        for (var i = eyes.length - 1; i >= 0; i--) {
          var E = NSG.COMPOSE.EYE.eye(eyes[i]);
          if (x >= E['开始'] && x <= E['结束']) { state.eyeSel = i; break; }
        }
        syncEyeUI();
        drag = null;      // 只选中；要拖就按住峰点那个圆
      }
      redraw();
      ev.preventDefault();
    });
    function onEyeMove(ev) {
      if (!drag) return;
      var p = canvasPos(ev);
      var eyes = state.eyeSet.eyes;
      var e = eyes[drag.i];
      if (!e) return;
      var x = Math.max(0, Math.min(1, eyeInvX(p.x)));
      var y = Math.max(0, Math.min(1, eyeInvY(p.y)));
      if (drag.part === 'peak') {
        var pad = Math.min(0.02, Math.max(0.005, (e['结束'] - e['开始']) * 0.25));
        e['峰的时间'] = +(Math.max(e['开始'] + pad, Math.min(e['结束'] - pad, x))).toFixed(2);
        e['峰值'] = +y.toFixed(2);
      } else if (drag.part === 'start') {
        var minStart = drag.i > 0 ? eyes[drag.i - 1]['开始'] + 0.04 : 0;
        var padS = Math.min(0.02, Math.max(0.005, (e['结束'] - minStart) * 0.2));
        e['开始'] = +(Math.max(minStart, Math.min(e['峰的时间'] - padS, x))).toFixed(2);
        e['开始基值'] = +y.toFixed(2);
        if (drag.i > 0 && eyes[drag.i - 1]['结束'] > e['开始']) {
          var prev = eyes[drag.i - 1];
          var oldSpanP = Math.max(1e-6, prev['结束'] - prev['开始']);
          var uPrev = Math.max(0.1, Math.min(0.9, (prev['峰的时间'] - prev['开始']) / oldSpanP));
          prev['结束'] = e['开始'];
          var newSpanP = Math.max(1e-6, prev['结束'] - prev['开始']);
          var padPrev = Math.min(0.02, newSpanP * 0.25);
          prev['峰的时间'] = +(Math.max(prev['开始'] + padPrev, Math.min(prev['结束'] - padPrev, prev['开始'] + uPrev * newSpanP))).toFixed(2);
        }
      } else {
        var maxEnd = drag.i < eyes.length - 1 ? eyes[drag.i + 1]['结束'] - 0.04 : 1;
        var padE = Math.min(0.02, Math.max(0.005, (maxEnd - e['开始']) * 0.2));
        e['结束'] = +(Math.max(e['峰的时间'] + padE, Math.min(maxEnd, x))).toFixed(2);
        e['结束基值'] = +y.toFixed(2);
        if (drag.i < eyes.length - 1 && eyes[drag.i + 1]['开始'] < e['结束']) {
          var next = eyes[drag.i + 1];
          var oldSpanN = Math.max(1e-6, next['结束'] - next['开始']);
          var uNext = Math.max(0.1, Math.min(0.9, (next['峰的时间'] - next['开始']) / oldSpanN));
          next['开始'] = e['结束'];
          var newSpanN = Math.max(1e-6, next['结束'] - next['开始']);
          var padNext = Math.min(0.02, newSpanN * 0.25);
          next['峰的时间'] = +(Math.max(next['开始'] + padNext, Math.min(next['结束'] - padNext, next['开始'] + uNext * newSpanN))).toFixed(2);
        }
      }
      state.eyeSet.name = '自定义';
      $$('.eyepreset', m.el).forEach(function (b) { b.classList.remove('on'); });
      updateEyeParamInputs();
      refreshOut();
    }
    function onEyeUp() {
      if (!drag) return;
      drag = null;
      syncEyeUI();
      refreshOut();
    }
    window.addEventListener('mousemove', onEyeMove);
    window.addEventListener('mouseup', onEyeUp);
    function cleanupEyeListeners() {
      stopComposePreview(true);
      if (window.removeEventListener) {
        window.removeEventListener('mousemove', onEyeMove);
        window.removeEventListener('mouseup', onEyeUp);
      }
      if (window.__nsgEyeCleanup === cleanupEyeListeners) window.__nsgEyeCleanup = null;
    }
    window.__nsgEyeCleanup = cleanupEyeListeners;
    m.onClose = cleanupEyeListeners;
    var origModalClose = m.close;
    m.close = function () { cleanupEyeListeners(); origModalClose(); };

    $('#eyeAdd', m.el).onclick = function () {
      var eyes = state.eyeSet.eyes;
      var cur = eyes[state.eyeSel] || NSG.COMPOSE.EYE.eye({});
      var E = NSG.COMPOSE.EYE.eye(cur);
      var n = eyes.length;
      var split = n > 0 ? n / (n + 1) : 0.5;
      var maxEnd = 0;
      eyes.forEach(function (e) {
        var E0 = NSG.COMPOSE.EYE.eye(e);
        if (E0['结束'] > maxEnd) maxEnd = E0['结束'];
      });
      if (maxEnd > split && maxEnd > 1e-6) {
        var scale = split / maxEnd;
        eyes.forEach(function (e) {
          var E0 = NSG.COMPOSE.EYE.eye(e);
          var a = E0['开始'], b = E0['结束'];
          var span = Math.max(1e-6, b - a);
          var u = Math.max(0.05, Math.min(0.95, (E0['峰的时间'] - a) / span));
          var na = +(a * scale).toFixed(2);
          var nb = +(b * scale).toFixed(2);
          var nSpan = Math.max(1e-6, nb - na);
          var pad = Math.min(0.02, nSpan * 0.25);
          e['开始'] = na;
          e['结束'] = nb;
          e['峰的时间'] = +(Math.max(na + pad, Math.min(nb - pad, na + u * nSpan))).toFixed(2);
        });
      }
      var newStart = +(maxEnd > split ? split : (maxEnd > 0.08 ? maxEnd : split)).toFixed(2);
      var newEnd = 1;
      var newPeak = +(newStart + (newEnd - newStart) * 0.5).toFixed(2);
      var add = NSG.COMPOSE.EYE.eye({
        '开始': newStart, '结束': newEnd, '峰的时间': newPeak, '峰值': +(Math.min(1, E['峰值'] + 0.1)).toFixed(2),
        '左尖锐': E['左尖锐'], '右尖锐': E['右尖锐'], '开始基值': 0.15, '结束基值': 0.2
      });
      eyes.push(add);
      state.eyeSel = eyes.length - 1;
      state.eyeSet.name = '自定义';
      syncEyeUI(); refreshOut();
    };
    $('#eyeDel', m.el).onclick = function () {
      if (state.eyeSet.eyes.length <= 1) { setStatus(t('compose.keepOneEye', null, '至少留一只眼睛')); return; }
      state.eyeSet.eyes.splice(state.eyeSel, 1);
      state.eyeSel = 0;
      state.eyeSet.name = '自定义';
      syncEyeUI(); refreshOut();
    };
    $('#eyeMirror', m.el).onclick = function () {
      state.eyeSet.eyes.forEach(function (e) {
        var E = NSG.COMPOSE.EYE.eye(e);
        var na = +(1 - E['结束']).toFixed(2), nb = +(1 - E['开始']).toFixed(2);
        e['开始'] = na; e['结束'] = nb; e['峰的时间'] = +(1 - E['峰的时间']).toFixed(2);
        var t = e['左尖锐']; e['左尖锐'] = e['右尖锐']; e['右尖锐'] = t;
        var y = e['开始基值']; e['开始基值'] = e['结束基值']; e['结束基值'] = y;
      });
      state.eyeSet.eyes.reverse();
      state.eyeSel = Math.max(0, state.eyeSet.eyes.length - 1 - state.eyeSel);
      state.eyeSet.name = '自定义';
      syncEyeUI(); refreshOut();
    };
    momChk.onchange = refreshOut;
    if (fullChk) fullChk.onchange = function () { syncFullSongUI(); refreshOut(); };
    if (cycleSel) cycleSel.onchange = function () { syncFullSongUI(); refreshOut(); };
    if (introIn) introIn.onchange = function () {
      var v = Math.max(0, Math.min(16, Math.round(+introIn.value || 0)));
      introIn.value = String(v);
      syncFullSongUI();
      refreshOut();
    };
    lyrBox.addEventListener('input', function () { refreshOut(); });
    rootSel.onchange = function () { if (previewKind === 'scale') stopComposePreview(false); refreshOut(); };
    scaleSel.onchange = function () { if (previewKind === 'scale') stopComposePreview(false); refreshOut(); };
    spanIn.onchange = refreshOut;

    /* 风格按钮（一行小字，跟眼睛联动） */
    var styleRow = document.createElement('div');
    styleRow.className = 'eyestyles';
    NSG.COMPOSE.STYLES.forEach(function (st) {
      var b = document.createElement('button');
      b.className = 'eyestyle' + (st.id === state.composeStyle ? ' on' : '');
      b.dataset.id = st.id;
      b.textContent = tComposeStyleName(st);
      b.title = tComposeStyleTip(st);
      b.onclick = function () {
        state.composeStyle = st.id;
        state.eyeSet = NSG.COMPOSE.EYE.preset(st.eye);
        state.eyeName = st.eye;
        state.eyeSel = 0;
        spanIn.value = st.span;
        syncEyeUI(); refreshOut();
      };
      styleRow.appendChild(b);
    });
    var capW = document.createElement('div');
    capW.className = 'cap2';
    capW.innerHTML = t('compose.stylesCap', null, '曲风') + '<span class="mini">' + t('compose.stylesNote', null, '换风格 = 换眼睛 + 换跨度') + '</span>';
    var styleCap = pbox.previousElementSibling;
    if (styleCap && styleCap.parentNode) {
      styleCap.parentNode.insertBefore(capW, styleCap);
      styleCap.parentNode.insertBefore(styleRow, styleCap);
    }

    syncFullSongUI();
    syncEyeUI();
    setTimeout(refreshOut, 20);

    $('#cpGo', m.el).onclick = function () {
      var res = buildMelody();
      if (!res.notes.length) { alert(selectionMode ? t('compose.noNotesAlertSel', null, '选中段没有可谱曲的发声音符') : t('compose.noNotesAlert', null, '没有可用的音节')); return; }
      state.score.root = res.root;
      $('#keySel').value = String(res.root);
      if ($('#scaleSel')) $('#scaleSel').value = scaleSel.value;
      var isFull = !!(fullChk && fullChk.checked);
      if (selectionMode) {
        var updates = {};
        res.notes.forEach(function (n) { updates[n.id] = { pitch: n.pitch, composeSection: n.composeSection }; });
        roll.notes.forEach(function (n) {
          if (Object.prototype.hasOwnProperty.call(updates, n.id)) {
            n.pitch = updates[n.id].pitch;
            if (isFull && updates[n.id].composeSection) n.composeSection = updates[n.id].composeSection;
            else if (!isFull && n.composeSection) delete n.composeSection;
          }
        });
      } else {
        var end = 0;
        roll.notes.forEach(function (n) { end = Math.max(end, n.start + n.dur); });
        if (isFull && end > 0) end = Math.ceil(end / 4) * 4;
        var add = normNotes(res.notes);
        add.forEach(function (n) { n.start += end; });
        roll.notes = roll.notes.concat(add);
        roll.sel = {};
        var visBeats = (roll.w - roll.kbW) / roll.pxBeat;
        if (end > roll.scrollBeat + visBeats * 0.75) roll.scrollBeat = Math.max(0, end - visBeats * 0.2);
      }
      roll.centerOn();
      roll._emit();
      updateStat(); state.dirty = true;
      m.close();
      renderAndAnalyze(60);
      var eyeDisplayName = (!state.eyeSet.name || state.eyeSet.name === '自定义')
        ? t('common.custom', null, '自定义')
        : tEyeName(state.eyeSet.name);
      setStatus(selectionMode
        ? t('compose.doneSel', { n: res.notes.length, name: eyeDisplayName, span: res.span }, '选中段快速谱曲完成：' + res.notes.length + ' 个音符 · ' + state.eyeSet.name + ' · 跨度 ' + res.span + ' 级')
        : t('compose.doneAppend', { n: res.notes.length, name: eyeDisplayName, span: res.span }, '快速谱曲已追加：' + res.notes.length + ' 个音符 · ' + state.eyeSet.name + ' · 跨度 ' + res.span + ' 级'));
    };
  }

  async function simplifyPitch() {
    var selected = roll.selected(), targets = selected.length ? selected : roll.notes;
    var key = projectKey();
    setStatus(t('fit.running', null, '正在精简 PIT…'));
    try {
      var result = await getRenderer().compute('fit', { score: state.score, trackIndex: activeVocalTrackIndex(),
        tolerance: 5, indices: targets.map(function (n) { return roll.notes.indexOf(n); }) });
      if (key !== projectKey()) { setStatus(t('fit.stale', null, '工程已变化，本次 PIT 精简结果未应用')); return; }
      var fit = result.fit;
      if (!fit.notes && !fit.pitReduced) { setStatus(t('fit.noChange', null, 'PIT 无需精简：没有可在 5 音分误差内合并的冗余点')); return; }
      installNotes(result.notes, result.pit);
      if (state.playing || playPending) stopPlay();
      roll._emit(); syncInspector(); renderAndAnalyze(60);
      setStatus(t('fit.done', {
        scope: selected.length ? t('fit.scopeSel', null, '选中音符') : t('fit.scopeTrack', null, '整个人声轨'),
        before: fit.before,
        after: fit.after,
        notes: fit.notes ? t('fit.notesPart', { n: fit.notes }, ' · ' + fit.notes + ' 个音符') : '',
        vib: fit.vibratoNotes ? t('fit.vibPart', { n: fit.vibratoNotes }, ' · 提取颤音 ' + fit.vibratoNotes + ' 处') : ''
      }, (selected.length ? '选中音符' : '整个人声轨') + ' PIT 已精简：' + fit.before + ' → ' + fit.after +
        ' 点' + (fit.notes ? ' · ' + fit.notes + ' 个音符' : '') + (fit.vibratoNotes ? ' · 提取颤音 ' + fit.vibratoNotes + ' 处' : '') + ' · 误差 ≤5 音分 · 可撤销'));
    } catch (e) { if (e.name !== 'AbortError') setStatus(t('fit.failed', { msg: tMsg(e.message) }, 'PIT 精简失败：' + e.message)); }
  }

  /* ---------------- 自动调教 ---------------- */
  function openAutoTune() {
    var T = NSG.TUNING, picked = roll.selected(), hasSelection = picked.length > 0;
    var html = '<p class="eyehint">' + t('tune.intro', null, '根据音符衔接、发音长短、曲速与乐句位置生成调教。辅音速度随音长、曲速与音素自动适配；VEL 按当前音色合成并平衡发音响度。') + '</p>' +
      '<div class="cap2">' + t('tune.stylesCap', null, '调教风格') + '</div><div class="eyestyles" id="tuneStyles" role="group" aria-label="' + escAttr(t('tune.stylesCap', null, '调教风格')) + '"></div>' +
      '<div class="eyeout" id="tuneDescription"></div>' +
      '<fieldset class="tune-group"><legend>' + t('tune.itemsLegend', null, '调教项目') + '</legend><div class="tune-options">' +
      '<label><input type="checkbox" id="tunePit"> ' + t('tune.pit', null, 'PIT 音高曲线') + '</label>' +
      '<label><input type="checkbox" id="tuneVibrato"> ' + t('tune.vibrato', null, '颤音') + '</label>' +
      '<label><input type="checkbox" id="tuneVel"> ' + t('tune.vel', null, 'VEL 响度平衡') + '</label>' +
      '<label><input type="checkbox" id="tuneEffort"> ' + t('tune.effort', null, '轻重') + '</label>' +
      '<label><input type="checkbox" id="tuneConsonantSpeed"> ' + t('tune.consonantSpeed', null, '辅音速度') + '</label></div></fieldset>' +
      '<div class="row2"><label class="lb" for="tuneExpression">' + t('tune.expr', null, '表现力') + '</label>' +
      '<input type="range" id="tuneExpression" min="0" max="150" step="1" value="' + state.tuneExpression + '" style="flex:1">' +
      '<span id="tuneExpressionVal" style="width:42px;text-align:right">' + state.tuneExpression + '%</span></div>' +
      '<p class="eyehint">' + t('tune.exprHint', null, '表现力控制回勾、滑入、过冲、甩尾和颤音的幅度；100% 为风格默认，调到 120–150% 更鲜明。0% 保留音符间过渡，关闭表现性弯音与颤音。') + '</p>' +
      '<div class="row2"><label class="lb" for="tuneHuman">' + t('tune.human', null, '随机度') + '</label>' +
      '<input type="range" id="tuneHuman" min="0" max="100" step="1" value="' + state.tuneHuman + '" style="flex:1">' +
      '<span id="tuneHumanVal" style="width:42px;text-align:right">' + state.tuneHuman + '%</span></div>' +
      '<div class="row2"><label class="lb" for="tuneSeed">' + t('tune.seed', null, '随机种子') + '</label>' +
      '<input type="number" id="tuneSeed" class="numin" style="width:110px" value="' + state.tuneSeed + '">' +
      '<button class="abtn" id="tuneDice" style="flex:none">' + t('tune.dice', null, '换一个') + '</button></div>' +
      '<p class="eyehint">' + t('tune.humanHint', null, '随机度控制每个音的滑音、过冲、句尾和颤音变化幅度，0% 为风格标准曲线。同一种子结果相同，换一个种子得到另一版调教。') + '</p>' +
      '<fieldset class="tune-group"><legend>' + t('tune.scopeLegend', null, '应用范围') + '</legend><div class="tune-options">' +
      '<label><input type="radio" name="tuneScope" value="selected"' + (hasSelection ? ' checked' : ' disabled') + '> ' + t('tune.scopeSel', { n: picked.length }, '选中音符（' + picked.length + '）') + '</label>' +
      '<label><input type="radio" name="tuneScope" value="all"' + (hasSelection ? '' : ' checked') + '> ' + t('tune.scopeAll', null, '整个人声轨') + '</label></div></fieldset>' +
      '<p class="eyehint">' + t('tune.footerHint', null, '勾选项目会覆盖范围内已有的对应调教，未勾选的项目保持原样。休止与换气自动跳过；应用后可撤销。') + '</p>' +
      '<div class="eyeout tune-summary" id="tuneSummary" role="status" aria-live="polite"></div>';
    var m = modal(t('tune.title', null, '自动调教'), html,
      '<button class="abtn" id="tuneGo">' + t('tune.goBtn', null, '应用调教') + '</button><button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    m.el.setAttribute('role', 'dialog'); m.el.setAttribute('aria-modal', 'true'); m.el.setAttribute('aria-label', t('tune.title', null, '自动调教'));
    var styles = $('#tuneStyles', m.el), go = $('#tuneGo', m.el), tuningBusy = false;
    function targets() { return $('input[name="tuneScope"]:checked', m.el).value === 'selected' ? picked : roll.notes; }
    function refresh() {
      var count = targets().filter(T.hasPitch).length;
      var parts = [];
      if ($('#tunePit', m.el).checked) parts.push(t('tune.partPit', null, 'PIT'));
      if ($('#tuneVibrato', m.el).checked) parts.push(t('tune.partVib', null, '颤音'));
      if ($('#tuneVel', m.el).checked) parts.push(t('tune.partVel', null, 'VEL'));
      if ($('#tuneEffort', m.el).checked) parts.push(t('tune.effort', null, '轻重'));
      if ($('#tuneConsonantSpeed', m.el).checked) parts.push(t('tune.partCons', null, '辅音速度'));
      go.disabled = tuningBusy || !count || !parts.length;
      $('#tuneSummary', m.el).textContent = !parts.length ? t('tune.needItem', null, '请至少勾选一项调教项目。') : !count ?
        t('tune.noTargets', null, '当前范围没有可调教的发声音符，请先铺音符、导入旋律或调整范围。') : t('tune.summary', { count: count, n: count, parts: parts.join('、') }, '将为 ' + count + ' 个发声音符生成 ' + parts.join('、') + '。');
      var style = T.autoStyles.filter(function (s) { return s.id === state.tuneStyle; })[0];
      $('#tuneDescription', m.el).textContent = tTuneStyleTip(style);
    }
    T.autoStyles.forEach(function (style) {
      var b = document.createElement('button');
      b.className = 'eyestyle' + (style.id === state.tuneStyle ? ' on' : '');
      b.dataset.id = style.id; b.textContent = tTuneStyleName(style); b.title = tTuneStyleTip(style);
      b.setAttribute('aria-pressed', String(style.id === state.tuneStyle));
      b.onclick = function () {
        state.tuneStyle = style.id;
        $$('.eyestyle', styles).forEach(function (button) {
          var on = button.dataset.id === style.id;
          button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
        });
        refresh();
      };
      styles.appendChild(b);
    });
    ['pit', 'vibrato', 'vel', 'effort', 'consonantSpeed'].forEach(function (part) {
      var input = $('#tune' + part.charAt(0).toUpperCase() + part.slice(1), m.el);
      input.checked = !!state.tuneParts[part];
      input.onchange = function () { state.tuneParts[part] = this.checked; refresh(); };
    });
    $$('input[name="tuneScope"]', m.el).forEach(function (input) { input.onchange = refresh; });
    $('#tuneExpression', m.el).oninput = function () {
      state.tuneExpression = +this.value; $('#tuneExpressionVal', m.el).textContent = this.value + '%';
    };
    $('#tuneHuman', m.el).oninput = function () {
      state.tuneHuman = +this.value; $('#tuneHumanVal', m.el).textContent = this.value + '%';
    };
    $('#tuneSeed', m.el).onchange = function () { state.tuneSeed = parseInt(this.value, 10) || 0; };
    $('#tuneDice', m.el).onclick = function () {
      state.tuneSeed = Math.floor(Math.random() * 999999); $('#tuneSeed', m.el).value = state.tuneSeed;
    };
    go.onclick = async function () {
      if (go.disabled) return;
      if (state.playing || playPending) stopPlay();
      state.tuneSeed = parseInt($('#tuneSeed', m.el).value, 10) || 0;
      var key = projectKey(), chosenStyle = state.tuneStyle, chosenSeed = state.tuneSeed;
      tuningBusy = true; go.disabled = true; setStatus(t('tune.applying', null, '正在应用自动调教…'));
      try {
        var noteIdxMap = new Map();
        roll.notes.forEach(function (n, idx) { noteIdxMap.set(n, idx); });
        var result = await getRenderer().compute('tune', { score: state.score, trackIndex: activeVocalTrackIndex(),
          indices: targets().map(function (n) { var ix = noteIdxMap.get(n); return ix === undefined ? -1 : ix; }), options: { style: chosenStyle,
          pit: state.tuneParts.pit, vibrato: state.tuneParts.vibrato, vel: state.tuneParts.vel, effort: state.tuneParts.effort,
          consonantSpeed: state.tuneParts.consonantSpeed,
          seed: state.tuneSeed, human: state.tuneHuman / 100, expression: state.tuneExpression / 100,
          timbre: state.timbre, rawSource: state.rawSrc, hd: state.hd,
          modeBFricWaveguide: state.hifiWaveguide, modeBHighPolish: state.hifiHighPolish } });
        if (!dialogOpen(m)) return;
        if (key !== projectKey()) { setStatus(t('tune.stale', null, '工程已变化，本次自动调教结果未应用')); return; }
        installNotes(result.notes, result.pit);
        var count = result.count;
        roll._emit(); syncInspector();
        m.close(); renderAndAnalyze(60);
        var styleObj = T.autoStyles.filter(function (s) { return s.id === chosenStyle; })[0];
        setStatus(t('tune.done', { n: count, style: tTuneStyleName(styleObj), seed: chosenSeed }, '自动调教完成：' + count + ' 个音符 · ' + styleObj.name + ' · 种子 ' + chosenSeed + ' · 可撤销'));
      } catch (e) { if (e.name !== 'AbortError') setStatus(t('tune.failed', { msg: tMsg(e.message) }, '自动调教失败：' + e.message)); }
      finally { tuningBusy = false; if (dialogOpen(m)) refresh(); }
    };
    m.el.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); m.close(); } });
    refresh(); $('.eyestyle.on', styles).focus();
  }

  /* ---------------- 自动伴奏 ---------------- */
  var accompPresetHistories = new WeakMap();
  function openAccompPresets() {
    var I = NSG.Instruments, score = state.score, history = accompPresetHistories.get(score) || [], source = null, previewRenderer = null, auditionRequest = 0;
    accompPresetHistories.set(score, history);
    var groups = {}, options = '';
    I.list.forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });
    Object.keys(groups).forEach(function (group) {
      options += '<optgroup label="' + escAttr(tInstGroup(group)) + '">';
      groups[group].forEach(function (p) { options += '<option value="' + p.id + '">' + escAttr(tInstName(p)) + '</option>'; });
      options += '</optgroup>';
    });
    var m = modal(t('instModal.title', null, '伴奏乐器'),
      '<p>' + t('instModal.intro', null, '选择音色试听，或替换伴奏中的一个声部。音符位置、时长和力度保留。') + '</p>' +
      '<div class="row2"><label class="lb" for="accompPreset">' + t('instModal.inst', null, '乐器') + '</label><select id="accompPreset" style="flex:1">' + options + '</select>' +
      '<button class="abtn" id="accompAudition">' + t('instModal.audition', null, '试听') + '</button><button class="abtn" id="accompAuditionStop">' + t('instModal.stop', null, '停止') + '</button></div>' +
      '<p id="accompPresetDescription"></p><p id="accompPresetRange" class="eyehint"></p>' +
      '<div class="row2"><label class="lb" for="accompSource">' + t('instModal.replace', null, '替换声部') + '</label><select id="accompSource" style="flex:1"></select></div>' +
      '<div class="row2"><label class="lb" for="accompSpace">' + t('instModal.space', null, '伴奏空间') + '</label><select id="accompSpace" style="flex:1">' +
        [['off', t('arr.spaceOff', null, '纯干声')], ['hall', t('arr.spaceHall', null, '抒情大厅')], ['studio', t('arr.spaceStudio', null, '录音棚')], ['wide', t('arr.spaceWide', null, '宽广现场')], ['intimate', t('arr.spaceIntimate', null, '近场原声')]].map(function (o) {
          return '<option value="' + o[0] + '">' + escAttr(o[1]) + '</option>';
        }).join('') + '</select></div>' +
      '<p id="accompPresetStatus" role="status"></p><hr>' +
      '<label for="accompMidiFile">' + t('instModal.importMidi', null, '导入伴奏 MIDI') + '</label> <input id="accompMidiFile" type="file" accept=".mid,.midi">' +
      '<div id="accompMidiChoice" hidden><label for="accompMidiTrack">' + t('instModal.track', null, '轨道') + '</label> <select id="accompMidiTrack"></select>' +
      '<button class="abtn" id="accompMidiAppend">' + t('instModal.append', null, '追加') + '</button><button class="abtn" id="accompMidiReplace">' + t('instModal.replaceAll', null, '替换全部伴奏') + '</button></div>' +
      '<p class="eyehint">' + t('instModal.midiHint', null, 'MIDI 可选择一轨或全部音乐轨。空工程沿用文件速度；已有工程按当前速度播放。') + '</p>',
      '<button class="abtn" id="accompPresetUndo" disabled>' + t('instModal.undo', null, '撤销替换 / 导入') + '</button><button class="abtn primary" id="accompPresetApply">' + t('instModal.apply', null, '应用音色') + '</button><button class="abtn" data-close>' + t('common.close', null, '关闭') + '</button>');
    var select = $('#accompPreset', m.el), sourceSelect = $('#accompSource', m.el), spaceSelect = $('#accompSpace', m.el), status = $('#accompPresetStatus', m.el);
    function active() { return state.score === score && m.isOpen(); }
    function stopAudition() {
      auditionRequest++;
      if (source) { try { source.stop(); } catch (e) {} source.disconnect(); source = null; }
      if (previewRenderer) { previewRenderer.close(); previewRenderer = null; }
    }
    // Also release preview audio when closing through the mask, X, Escape or another dialog.
    var observer = typeof MutationObserver === 'function' ? new MutationObserver(function () {
      if (!m.isOpen()) { stopAudition(); observer.disconnect(); }
    }) : null;
    if (observer) observer.observe($('#modalRoot'), { childList: true });
    function parts() {
      var old = sourceSelect.value, counts = {}, accTrack = ensureAccompTrack(score), notes = (accTrack || {}).notes || [];
      var curSpace = (accTrack && accTrack.space) || 'off';
      if (history.length && (history[history.length - 1].after !== JSON.stringify(notes) ||
        history[history.length - 1].afterTempos !== JSON.stringify(NSG.TEMPO.list(score)) ||
        history[history.length - 1].afterSpace !== curSpace)) history.length = 0;
      $('#accompPresetUndo', m.el).disabled = !history.length;
      if (spaceSelect) spaceSelect.value = curSpace;
      notes.forEach(function (n) { var id = n.inst || 'pad'; counts[id] = (counts[id] || 0) + 1; });
      sourceSelect.innerHTML = '<option value="*">' + escAttr(t('instModal.allParts', null, '全部旋律声部（保留鼓组）')) + '</option>';
      Object.keys(counts).forEach(function (id) {
        var p = I.get(id), drum = NSG.IO.drumPitch({ inst: id, pitch: 60 });
        if (drum !== null) return;
        sourceSelect.innerHTML += '<option value="' + escAttr(id) + '">' + escAttr(t('instModal.partCount', { name: tInstName(p, id), n: counts[id] }, (p ? p.name : id) + ' · ' + counts[id] + ' 音')) + '</option>';
      });
      if (counts[old]) sourceSelect.value = old;
      else if (sourceSelect.options.length > 1) sourceSelect.selectedIndex = 1;
      $('#accompPresetApply', m.el).disabled = sourceSelect.options.length < 2;
      status.textContent = notes.length ? t('instModal.statusCount', { n: notes.length }, '伴奏共 ' + notes.length + ' 个音符') : t('instModal.statusEmpty', null, '当前没有伴奏。可先自动编曲或在下方导入 MIDI。');
    }
    function describe() {
      var p = I.get(select.value);
      $('#accompPresetDescription', m.el).textContent = tInstDesc(p);
      $('#accompPresetRange', m.el).textContent = t('instModal.range', { lo: noteName(p.range[0]), hi: noteName(p.range[1]), prog: p.program + 1 }, '建议音域 ' + noteName(p.range[0]) + '–' + noteName(p.range[1]) + ' · MIDI 乐器 ' + (p.program + 1));
    }
    function commit(notes, message, tempos, spaceVal) {
      if (!active()) return;
      stopAudition(); stopPlay();
      var accTr = ensureAccompTrack(score);
      var prevSpace = accTr.space || 'off';
      history.push({ notes: JSON.parse(JSON.stringify(accTr.notes)), tempos: NSG.TEMPO.list(score), space: prevSpace, after: JSON.stringify(notes) });
      if (history.length > 20) history.shift();
      accTr.notes = notes;
      if (spaceVal !== undefined) {
        if (!spaceVal || spaceVal === 'off') delete accTr.space;
        else accTr.space = spaceVal;
        state.dirty = true;
      }
      if (tempos) { NSG.TEMPO.apply(score, tempos); $('#tempo').value = score.tempo; syncRollTempos(); state.dirty = true; }
      history[history.length - 1].afterTempos = JSON.stringify(NSG.TEMPO.list(score));
      history[history.length - 1].afterSpace = accTr.space || 'off';
      state.accPcm = state.accAudio = null; state.accKey = null;
      $('#accompPresetUndo', m.el).disabled = false;
      parts(); renderLayerList(); status.textContent = message; setStatus(message); renderAndAnalyze(0);
    }
    select.value = I.get(sourceSelect.value) ? sourceSelect.value : 'piano';
    select.addEventListener('change', describe);
    if (spaceSelect) spaceSelect.addEventListener('change', function () {
      var sp = this.value || 'off';
      var spLabels = { off: t('arr.spaceOff', null, '纯干声'), hall: t('arr.spaceHall', null, '抒情大厅'), studio: t('arr.spaceStudio', null, '录音棚'), wide: t('arr.spaceWide', null, '宽广现场'), intimate: t('arr.spaceIntimate', null, '近场原声') };
      commit(ensureAccompTrack(score).notes, t('instModal.spaceApplied', { space: spLabels[sp] || sp }, '伴奏空间已设为 ' + (spLabels[sp] || sp) + ' · 可撤销'), null, sp);
    });
    $('#accompPresetApply', m.el).onclick = function () {
      var id = select.value, selected = sourceSelect.value, count = 0;
      var notes = ensureAccompTrack(score).notes.map(function (n) {
        var matches = selected === '*' ? NSG.IO.drumPitch(n) === null : (n.inst || 'pad') === selected;
        if (!matches) return n;
        count++; var copy = Object.assign({}, n, { inst: id });
        delete copy.midiProgram; delete copy.midiBankMSB; delete copy.midiBankLSB;
        return copy;
      });
      if (count) commit(notes, t('instModal.applied', { name: tInstName(I.get(id)), n: count }, '已应用 ' + I.get(id).name + ' · ' + count + ' 个伴奏音符 · 可撤销'));
    };
    $('#accompPresetUndo', m.el).onclick = function () {
      if (!active()) return;
      parts(); if (!history.length) return;
      stopAudition(); stopPlay(); var before = history.pop(), accTr = ensureAccompTrack(score); accTr.notes = before.notes;
      if (!before.space || before.space === 'off') delete accTr.space; else accTr.space = before.space;
      NSG.TEMPO.apply(score, before.tempos); $('#tempo').value = score.tempo; syncRollTempos(); state.dirty = true;
      state.accPcm = state.accAudio = null; state.accKey = null;
      this.disabled = !history.length; parts(); renderLayerList(); setStatus(t('instModal.undone', null, '已撤销伴奏乐器操作')); renderAndAnalyze(0);
    };
    $('#accompAuditionStop', m.el).onclick = stopAudition;
    $('#accompAudition', m.el).onclick = async function () {
      stopAudition(); stopPlay(); var request = auditionRequest, ctx = ensureCtx(), p = I.get(select.value);
      var root = Math.max(p.range[0] + 5, Math.min(p.range[1] - 7, p.group === '贝斯' ? 40 : 60));
      var notes = [0, 4, 7, 12].map(function (step, i) { return { start: i * 0.8, dur: i === 3 ? 2 : 0.65, pitch: Math.min(p.range[1], root + step), vel: [55, 75, 100, 80][i], inst: p.id }; });
      var instName = tInstName(p);
      status.textContent = t('instModal.auditionPrep', { name: instName }, '正在准备 ' + p.name + ' 试听…');
      try {
        previewRenderer = NSG.Renderer.create();
        var r = await previewRenderer.accomp({ tempo: 120, tracks: [{ type: 'inst', space: p.family === 'chip' ? 'off' : 'intimate', notes: notes }] });
        if (!active() || request !== auditionRequest) return;
        var audio = r.audio, buffer = ctx.createBuffer(2, audio.channels[0].length, audio.sr);
        audio.channels.forEach(function (pcm, channel) { buffer.copyToChannel(pcm, channel); });
        source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
        var playing = source;
        playing.onended = function () { playing.disconnect(); if (source === playing) source = null; };
        source.start();
        status.textContent = t('instModal.auditionPlaying', { name: instName }, '试听 ' + p.name + ' · 轻 / 中 / 重力度 / 长音');
      } catch (e) { if (active() && request === auditionRequest && e.name !== 'AbortError') status.textContent = t('instModal.auditionFail', { msg: tMsg(e.message) }, '试听失败：' + e.message); }
    };
    var imported = null, importSerial = 0;
    $('#accompMidiFile', m.el).addEventListener('change', async function () {
      var file = this.files[0]; if (!file) return;
      var serial = ++importSerial; imported = null; $('#accompMidiChoice', m.el).hidden = true;
      status.textContent = t('instModal.midiReading', null, '正在读取伴奏 MIDI…');
      try {
        var result = (await getRenderer().compute('read', { name: file.name, bytes: await file.arrayBuffer() })).imported;
        if (!active() || serial !== importSerial) return;
        if (result.format !== 'MIDI') throw Error(t('instModal.midiNeedStd', null, '请选择标准 MIDI 文件'));
        if (!(result.importTracks || []).some(function (tr) { return tr.notes.length; })) throw Error(t('instModal.midiNoNotes', null, '文件没有音乐音符'));
        imported = result;
        var trackSelect = $('#accompMidiTrack', m.el); trackSelect.innerHTML = '<option value="*">' + escAttr(t('instModal.midiAllTracks', null, '全部音乐轨')) + '</option>';
        result.importTracks.forEach(function (tr, index) { trackSelect.innerHTML += '<option value="' + index + '">' + escAttr(t('instModal.partCount', { name: tr.name, n: tr.notes.length }, tr.name + ' · ' + tr.notes.length + ' 音')) + '</option>'; });
        $('#accompMidiChoice', m.el).hidden = false; status.textContent = t('instModal.midiLoaded', { name: file.name }, '已读取 ' + file.name + '，选择追加或替换。');
      } catch (e) { if (active()) status.textContent = t('imp.failed', { msg: tMsg(e.message) }, '导入失败：' + e.message); }
    });
    function importMidi(append) {
      if (!imported || !active()) return;
      var choice = $('#accompMidiTrack', m.el).value, prefix = 'midi-' + uid(), all = [];
      imported.importTracks.forEach(function (tr, index) {
        if (choice === '*' || Number(choice) === index) all = all.concat(NSG.IO.accompanimentNotes(tr, prefix + ':' + index));
      });
      var empty = !score.tracks.some(function (tr) { return tr.notes.length; });
      var added = normNotes(all), notes = append ? ensureAccompTrack(score).notes.concat(added) : added;
      var actLabel = append ? t('instModal.midiActionAppend', null, '追加') : t('instModal.midiActionReplace', null, '替换');
      commit(notes, t('instModal.midiDone', { action: actLabel, n: added.length }, '已' + (append ? '追加' : '替换') + '伴奏 MIDI · ' + added.length + ' 个音符 · 可撤销'), empty ? imported.tempos : null);
    }
    $('#accompMidiAppend', m.el).onclick = function () { importMidi(true); };
    $('#accompMidiReplace', m.el).onclick = function () { importMidi(false); };
    parts();
    var initial = I.get(sourceSelect.value); if (initial && initial.family !== 'chip') select.value = initial.id;
    describe();
  }

  function openArrange() {
    var hasAnyVocal = (state.score.tracks || []).some(function (t) { return isVocalTrack(t) && t.notes && t.notes.length; });
    if (!hasAnyVocal) { alert(t('arr.noVocalAlert', null, '请先生成或导入旋律')); return; }
    var nonEmptyVocals = vocalTrackIndices(state.score).filter(function (i) {
      var tr = state.score.tracks[i];
      return tr && tr.notes && tr.notes.length;
    });
    if (nonEmptyVocals.length <= 1) state.arrTrackScope = 'all';
    else if (state.arrTrackScope !== 'all' && state.arrTrackScope !== 'active') {
      var smScope = /^track:(\d+)$/.exec(String(state.arrTrackScope || ''));
      if (!smScope || nonEmptyVocals.indexOf(parseInt(smScope[1], 10)) < 0) state.arrTrackScope = 'all';
    }
    var activeTrack = activeVocalTrack();
    var activeName = (activeTrack && activeTrack.name) || t('layer.defaultSingle', null, '人声');
    var trackScopeHtml = nonEmptyVocals.length > 1
      ? '<div class="row2"><label class="lb" for="arrTrackScope">' + t('arr.trackScope', null, '参考音层') + '</label>' +
        '<select id="arrTrackScope" class="numin" style="width:220px">' +
        '<option value="all"' + (state.arrTrackScope === 'all' ? ' selected' : '') + '>' + escAttr(t('arr.trackScopeAll', null, '全部未静音音层（自动综合）')) + '</option>' +
        '<option value="active"' + (state.arrTrackScope === 'active' ? ' selected' : '') + '>' + escAttr(t('arr.trackScopeActive', { name: activeName }, '仅当前音层（' + activeName + '）')) + '</option>' +
        nonEmptyVocals.map(function (idx, orderIdx) {
          var tr = state.score.tracks[idx];
          var label = tr.name || t('layer.defaultName', { n: orderIdx + 1 }, '人声 ' + (orderIdx + 1));
          if (tr.muted) label += t('arr.trackScopeMuted', null, '（已静音）');
          var val = 'track:' + idx;
          return '<option value="' + val + '"' + (state.arrTrackScope === val ? ' selected' : '') + '>' + escAttr(t('arr.trackScopeOne', { name: label }, '仅：' + label)) + '</option>';
        }).join('') +
        '</select></div>'
      : '';
    var html =
      '<div class="cap2">' + t('arr.stylesCap', null, '风格') + '</div>' +
      '<div class="eyestyles" id="arrStyles"></div>' +
      '<div class="arrange-grid"><div class="arrange-column">' +
      trackScopeHtml +
      '<div class="row2"><label class="lb" for="arrMood">' + t('arr.mood', null, '情绪') + '</label><select id="arrMood" class="numin">' +
        NSG.COMPOSE.ARRANGE_MOODS.map(function (o) { return '<option value="' + o.id + '"' + (state.arrMood === o.id ? ' selected' : '') + '>' + escAttr(tArrangeMoodName(o)) + '</option>'; }).join('') + '</select>' +
        '<label class="lb" for="arrKey" style="margin-left:10px">' + t('arr.key', null, '调性') + '</label><select id="arrKey" class="numin" style="width:110px">' +
        '<option value="auto"' + (state.arrKey === 'auto' ? ' selected' : '') + '>' + t('arr.keyAuto', null, '自动判断') + '</option>' +
        KEY_NAMES.map(function (name, idx) {
          var majVal = idx + ':0', minVal = idx + ':1';
          return '<option value="' + majVal + '"' + (state.arrKey === majVal ? ' selected' : '') + '>' + escAttr(t('arr.keyMaj', { name: name }, name + ' 大调')) + '</option>' +
            '<option value="' + minVal + '"' + (state.arrKey === minVal ? ' selected' : '') + '>' + escAttr(t('arr.keyMin', { name: name }, name + ' 小调')) + '</option>';
        }).join('') + '</select></div>' +
      '<div class="row2"><label class="lb" for="arrSpace">' + t('arr.space', null, '混响空间') + '</label><select id="arrSpace" class="numin" style="width:150px">' +
        [['auto', t('arr.spaceAuto', null, '随风格自动')], ['hall', t('arr.spaceHall', null, '抒情大厅')], ['studio', t('arr.spaceStudio', null, '录音棚')], ['wide', t('arr.spaceWide', null, '宽广现场')], ['intimate', t('arr.spaceIntimate', null, '近场原声')], ['off', t('arr.spaceOff', null, '纯干声')]].map(function (o) {
          return '<option value="' + o[0] + '"' + (state.arrSpace === o[0] ? ' selected' : '') + '>' + escAttr(o[1]) + '</option>';
        }).join('') + '</select></div>' +
      '<p class="eyehint">' + t('arr.spaceHint', null, '为伴奏加上大厅/板式混响、同步立体声延时、合唱、人声频段避让均衡与轻总线压缩，让各声部融入立体声空间。') + '</p>' +
      '<p class="eyehint">' + t('arr.moodHint', null, '同一流派下调整疏密、和弦转换与色彩、鼓组和铺底力度。自动参考调性、速度、音区与旋律密度推断，也可手动指定。') + '</p>' +
      '<p class="eyehint">' + t('arr.sectionHint', null, '结合旋律轮廓、节奏和重复判断主副歌；主副歌之间短而有对比的过渡句可识别为「桥」，证据不足时保留主歌判断。') + '</p>' +
      '<div class="row2"><label class="lb" for="arrMeter">' + t('arr.meter', null, '拍号') + '</label><select id="arrMeter" class="numin" style="width:110px">' +
        [['auto', t('arr.meterAuto', null, '自动')], ['4', t('arr.meter4', null, '4/4')], ['3', t('arr.meter3', null, '3/4（华尔兹）')]].map(function (o) { return '<option value="' + o[0] + '"' + (state.arrMeter === o[0] ? ' selected' : '') + '>' + escAttr(o[1]) + '</option>'; }).join('') +
        '</select><label class="lb" for="arrGridMode" style="margin-left:10px">' + t('arr.gridMode', null, '小节线') + '</label><select id="arrGridMode" class="numin" style="width:150px">' +
        [['auto', t('arr.gridAuto', null, '自动')], ['fixed', t('arr.gridFixed', null, '按卷帘网格')], ['tracked', t('arr.gridTracked', null, '跟随演唱（自由速度）')]].map(function (o) { return '<option value="' + o[0] + '"' + (state.arrGridMode === o[0] ? ' selected' : '') + '>' + escAttr(o[1]) + '</option>'; }).join('') +
        '</select></div>' +
      '<p class="eyehint">' + t('arr.gridHint', null, '没有对齐卷帘、带渐快渐慢的演唱工程，「自动」会沿着强音追踪小节线；伴奏跟着演唱的速度走，旋律不动。') + '</p>' +
      '<div class="row2"><label class="tl"><input type="checkbox" id="arrHalfBpm" ' + (state.arrHalfBpm ? 'checked' : '') + '> ' + t('arr.halfBpm', null, 'BPM 减半（适用于双倍 BPM 扒谱的工程）') + '</label></div>' +
      '<p class="eyehint">' + t('arr.halfBpmHint', null, '例如工程 180 BPM，按 90 BPM 编配；鼓点、和弦与乐句按减半后的速度分析。工程速度与人声位置保持不变，变速段也按比例处理。') + '</p>' +
      '<div class="row2"><label class="lb" for="arrOffset">' + t('arr.offset', null, '小节偏移') + '</label><input type="number" id="arrOffset" class="numin" style="width:110px" min="0" max="' + (state.arrHalfBpm ? '7.99' : '3.99') + '" step="0.0625" placeholder="' + escAttr(t('arr.offsetPh', null, '自动估计')) + '" value="' + state.arrOffset + '"><span>' + t('arr.offsetUnit', null, '工程拍（留空自动）') + '</span></div>' +
      '<p class="eyehint">' + t('arr.offsetHint', null, '音乐小节线相对卷帘小节线向后偏移的拍数；0 为直接对齐卷帘。只调整伴奏，不移动旋律。') + '</p>' +
      '<div class="row2"><label class="lb">' + t('arr.seed', null, '随机种子') + '</label>' +
      '<input type="number" id="arrSeed" class="numin" style="width:110px" value="' + (state.arrSeed || Math.floor(Math.random() * 999999)) + '">' +
      '<button class="abtn" id="arrDice" style="flex:none">' + t('arr.dice', null, '换一个') + '</button></div>' +
      '<p class="eyehint">' + t('arr.seedHint', null, '同一个种子每次编出来完全一样；换个种子就是另一个版本。') + '</p>' +
      '</div><div class="arrange-column">' +
      '<div class="row"><label>' + t('arr.density', null, '密度') + '</label><input type="range" id="arrDen" min="0.4" max="1.6" step="0.05" value="' + state.arrDensity + '"><span class="val" id="arrDenV">' + state.arrDensity.toFixed(2) + '</span></div>' +
      '<div class="row"><label for="arrChordRate" style="width:90px;white-space:nowrap">' + t('arr.chordRate', null, '和弦转换频率') + '</label><input type="range" id="arrChordRate" min="0.4" max="2" step="0.1" value="' + state.arrChordRate + '"><span class="val" id="arrChordRateV">' + state.arrChordRate.toFixed(1) + '</span></div>' +
      '<p class="eyehint">' + t('arr.chordRateHint', null, '与情绪共同决定换和弦倾向：温柔、忧郁偏慢，明亮、紧张偏快。滑块 1 为情绪默认；低值更稳，高值更活跃，转调仍按乐句位置发生。') + '</p>' +
      '<div class="row"><label for="arrExpr">' + t('arr.expr', null, '层次起伏') + '</label><input type="range" id="arrExpr" min="0" max="2" step="0.1" value="' + state.arrExpression + '"><span class="val" id="arrExprV">' + state.arrExpression.toFixed(1) + '</span></div>' +
      '<p class="eyehint">' + t('arr.exprHint', null, '0 关闭起伏，1 自然起伏，2 强化对比；乐句渐强后收束，重复副歌逐步展开，密集唱词处伴奏让位，和弦声部按音区在左右展开。') + '</p>' +
      '<div class="row"><label>' + t('arr.human', null, '人性化') + '</label><input type="range" id="arrHum" min="0" max="2" step="0.1" value="' + state.arrHuman + '"><span class="val" id="arrHumV">' + state.arrHuman.toFixed(1) + '</span></div>' +
      '<div class="row"><label>' + t('arr.swing', null, '摇摆') + '</label><input type="range" id="arrSw" min="0" max="20" step="1" value="' + state.arrSwing + '"><span class="val" id="arrSwV">' + state.arrSwing + '%</span></div>' +
      '<div class="arrange-options">' +
      '<div class="row2"><label class="tl"><input type="checkbox" id="arrIntro" ' + (state.arrIntro ? 'checked' : '') + '> ' + t('arr.intro', null, '加前奏（首小节只铺和声）') + '</label></div>' +
      '<div class="row2"><label class="tl"><input type="checkbox" id="arrKit" ' + (state.arrKit ? 'checked' : '') + '> ' + t('arr.kit', null, '加鼓组（按段落自动进出）') + '</label></div>' +
      '</div>' +
      '<div class="row2"><label class="tl"><input type="checkbox" id="arrChip" ' + (state.arrChip ? 'checked' : '') + '> ' + t('arr.chip', null, '8bit 音色伴奏') + '</label></div>' +
      '<p class="eyehint">' + t('arr.chipHint', null, '采样旋律用 SID 式 PWM 主奏（需同时勾选采样曲谱）；和弦用 PWM / 锯齿波 / 12.5%·25%·50% 方波，铺底变快速琶音，低音为三角波与锯齿＋脉冲，另有 SCC 风格波表及噪声鼓组。选 Chiptune 风格时不勾选也会自动使用 8bit 音色。') + '</p>' +
      '</div></div><div class="arrange-sampling">' +
      '<div class="row2"><label class="tl"><input type="checkbox" id="arrSample" ' + (state.arrSample ? 'checked' : '') + '> ' + t('arr.sample', null, '采样曲谱（卡农追奏、句间呼应、前奏/间奏/尾奏 Lead）') + '</label></div>' +
      '<div class="arrange-grid">' +
      '<div class="row"><label for="arrImprov">' + t('arr.improv', null, '即兴度') + '</label><input type="range" id="arrImprov" min="0" max="100" step="1" value="' + state.arrImprov + '"><span class="val" id="arrImprovV">' + state.arrImprov + '%</span></div>' +
      '<div class="row"><label>' + t('arr.sampAmt', null, '采样量') + '</label><input type="range" id="arrSampAmt" min="0.3" max="2" step="0.1" value="' + state.arrSampleAmt + '"><span class="val" id="arrSampAmtV">' + (+state.arrSampleAmt).toFixed(1) + '</span></div>' +
      '</div>' +
      '<p class="eyehint">' + t('arr.improvHint', null, '0% 只复现旋律，不改写旋律音高、不添加即兴音；可调整八度，冲突处留空。向右增加前奏/间奏/尾奏的即兴收尾，50% 为默认。主奏只用现有演唱与尾奏空档，人声回来前收束。') + '</p>' +
      '</div>' +
      '<div id="arrOut" class="eyeout"></div>';
    var m = modal(t('menu.arrange', null, '自动伴奏'), html,
      '<button class="abtn" id="arrGo">' + t('arr.goBtn', null, '生成伴奏') + '</button><button class="abtn" data-close>' + t('common.cancel', null, '取消') + '</button>');
    m.el.classList.add('arrange-modal');

    var sbox = $('#arrStyles', m.el);
    NSG.COMPOSE.ARRANGE_STYLES.forEach(function (st) {
      var b = document.createElement('button');
      b.className = 'eyestyle' + (st.id === state.arrStyle ? ' on' : '');
      b.dataset.id = st.id;
      b.textContent = tArrangeStyleName(st);
      var stTip = tArrangeStyleTip(st);
      if (stTip) b.title = stTip;
      b.onclick = function () {
        state.arrStyle = st.id;
        $$('.eyestyle', sbox).forEach(function (x) { x.classList.toggle('on', x.dataset.id === st.id); });
        preview();
      };
      sbox.appendChild(b);
    });
    $('#arrDice', m.el).onclick = function () {
      $('#arrSeed', m.el).value = Math.floor(Math.random() * 999999);
      preview();
    };
    $('#arrDen', m.el).oninput = function () { $('#arrDenV', m.el).textContent = (+this.value).toFixed(2); };
    $('#arrExpr', m.el).oninput = function () { $('#arrExprV', m.el).textContent = (+this.value).toFixed(1); };
    $('#arrChordRate', m.el).oninput = function () { $('#arrChordRateV', m.el).textContent = (+this.value).toFixed(1); };
    $('#arrHum', m.el).oninput = function () { $('#arrHumV', m.el).textContent = (+this.value).toFixed(1); };
    $('#arrSw', m.el).oninput = function () { $('#arrSwV', m.el).textContent = this.value + '%'; };
    $('#arrSampAmt', m.el).oninput = function () { $('#arrSampAmtV', m.el).textContent = (+this.value).toFixed(1); };
    $('#arrImprov', m.el).oninput = function () { $('#arrImprovV', m.el).textContent = this.value + '%'; };

    var previewRequest = 0, arranging = false;
    async function preview() {
      if (!dialogOpen(m)) return;
      $('#arrOffset', m.el).max = $('#arrHalfBpm', m.el).checked ? '7.99' : '3.99';
      var ticket = ++previewRequest, key = projectKey();
      $('#arrGo', m.el).disabled = true;
      $('#arrOut', m.el).textContent = t('arr.analyzing', null, '正在分析乐句与和声…');
      try {
        var arrKeySpec = ($('#arrKey', m.el).value || 'auto').split(':');
        var lockedKey = arrKeySpec.length === 2 ? parseInt(arrKeySpec[0], 10) : undefined;
        var lockedMinor = arrKeySpec.length === 2 ? arrKeySpec[1] === '1' : undefined;
        var previewScope = ($('#arrTrackScope', m.el) && $('#arrTrackScope', m.el).value) || 'all';
        var previewTrackOpt = resolveArrangeTrackOpt(previewScope, state.score);
        var result = await getRenderer().compute('arrange', { score: state.score, options: Object.assign({}, previewTrackOpt, {
          style: state.arrStyle,
          mood: $('#arrMood', m.el).value || 'auto',
          space: ($('#arrSpace', m.el) && $('#arrSpace', m.el).value) || 'auto',
          key: Number.isInteger(lockedKey) ? lockedKey : undefined,
          minor: lockedMinor,
          seed: parseInt($('#arrSeed', m.el).value, 10) || 0,
          intro: $('#arrIntro', m.el).checked,
          kit: $('#arrKit', m.el).checked,
          sampleMelody: $('#arrSample', m.el).checked,
          sampleAmount: parseFloat($('#arrSampAmt', m.el).value) || 1,
          improvisation: parseFloat($('#arrImprov', m.el).value) / 100,
          meter: $('#arrMeter', m.el).value === 'auto' ? undefined : +$('#arrMeter', m.el).value,
          gridMode: $('#arrGridMode', m.el).value,
          halfBpm: $('#arrHalfBpm', m.el).checked,
          chip8bit: $('#arrChip', m.el).checked,
          barOffset: $('#arrOffset', m.el).value === '' ? undefined : parseFloat($('#arrOffset', m.el).value),
          density: parseFloat($('#arrDen', m.el).value),
          expression: parseFloat($('#arrExpr', m.el).value),
          chordRate: parseFloat($('#arrChordRate', m.el).value),
          humanize: parseFloat($('#arrHum', m.el).value),
          swing: parseFloat($('#arrSw', m.el).value) / 100
        }) });
        if (ticket !== previewRequest || !dialogOpen(m)) return;
        if (key !== projectKey()) { $('#arrOut', m.el).textContent = t('arr.stalePreview', null, '工程已变化，请重新预览'); return; }
        var acc = Object.assign(result.notes, result.meta);
        var kinds = {};
        acc.forEach(function (n) { kinds[n.inst] = (kinds[n.inst] || 0) + 1; });
        var nameMap = {
          bass: '贝斯', bassFretless: '无品贝斯', pad: '铺底', padWarmGlass: '暖玻璃氛围垫', ep: '电钢', epBell: '水晶铃音电钢',
          arp: '琶音', guitar: '吉他', guitarSteel12: '十二弦木吉他', guitarChorus: '合唱清音吉他',
          strings: '弦乐', stringsSlow: '慢弦乐', stringsCinema: '影院宽弦乐', stringsCello: '大提琴独奏', erhuSynth: '柔弦胡琴',
          choir: '合唱铺底', choirSoft: '柔美人声铺底', celesta: '钢片琴', ocarina: '陶笛',
          kick: '底鼓', snare: '军鼓', hat: '踩镲', openhat: '开镲', crash: '吊镲', tom: '通鼓',
          perc: '沙锤/打击', ride: '叮叮', rim: '边击', clap: '拍手', organ: '风琴', brass: '铜管',
          piano: '钢琴', pianoWarm: '暖色抒情钢琴', pluck: '拨弦', accordion: '手风琴', tuba: '大号', lead: 'Lead 主奏',
          chipPWM: 'SID PWM', chipSaw: '锯齿波', chipTable: 'SCC 风格波表', chipHybrid: '锯齿＋脉冲低音', chipArp: '快速和弦琶音', chipTriangle: 'NES 三角波',
          chipPulse12: 'NES 12.5% 方波', chipPulse25: 'NES 25% 方波', chipPulse50: 'NES 50% 方波', chipPulse75: 'NES 75% 方波',
          chipPulse87: '87.5% 方波', chipNoise: '8bit 噪声打击', chipKick: '8bit 底鼓', chipTom: '8bit 通鼓'
        };
        var sepList = i18nCall('getLanguage') === 'en' ? ', ' : '、';
        var secTxt = (acc.sections || []).map(function (s) {
          return t('arr.sec.' + s, null, { intro: '前', verse: '主', pre: '预', bridge: '桥', chorus: '副', outro: '尾' }[s] || s);
        }).join(' ');
        var phraseTxt = (acc.phrases || []).map(function (p, i) {
          return t('arr.phraseItem', {
            idx: i + 1,
            bridge: p.section === 'bridge' ? t('arr.phraseBridge', null, '【桥】') : '',
            key: KEY_NAMES[p.key],
            mode: p.minor ? t('arr.phraseMin', null, '小调') : t('arr.phraseMaj', null, '大调'),
            start: (p.start + 1).toFixed(2),
            end: (p.end + 1).toFixed(2),
            len: p.length.toFixed(2)
          }, (i + 1) + (p.section === 'bridge' ? '【桥】' : '') + '：' + KEY_NAMES[p.key] + (p.minor ? ' 小调' : ' 大调') +
            '（' + (p.start + 1).toFixed(2) + '–' + (p.end + 1).toFixed(2) + ' 拍；有效旋律 ' + p.length.toFixed(2) + ' 拍）');
        }).join(sepList);
        var chordNames = (acc.harmonies || []).map(function (h) { return h.name; }).filter(function (name, i, names) {
          return i === 0 || name !== names[i - 1];
        });
        var moodName = acc.mood ? tArrangeMoodName({ id: acc.mood.id, name: acc.mood.name }) : '';
        var spaceLabelMap = {
          hall: t('arr.spaceHall', null, '抒情大厅'),
          studio: t('arr.spaceStudio', null, '录音棚'),
          wide: t('arr.spaceWide', null, '宽广现场'),
          intimate: t('arr.spaceIntimate', null, '近场原声'),
          off: t('arr.spaceOff', null, '纯干声')
        };
        var spaceLabel = spaceLabelMap[acc.space || 'studio'] || acc.space;
        var ensembleTxt = '';
        if (acc.vocalEnsemble && acc.vocalEnsemble.trackCount > 1) {
          var ensModeMap = {
            relay: t('arr.ensMode.relay', null, '分轨接唱'),
            harmony: t('arr.ensMode.harmony', null, '主唱＋和声'),
            duet: t('arr.ensMode.duet', null, '多声部对唱'),
            mixed: t('arr.ensMode.mixed', null, '多轨对唱＋和声')
          };
          var escEnsName = function (tr) { return escAttr(tr.name); };
          var leadNames = acc.vocalEnsemble.tracks.filter(function (tr) { return tr.role === 'lead'; }).map(escEnsName);
          var duetNames = acc.vocalEnsemble.tracks.filter(function (tr) { return tr.role === 'duet'; }).map(escEnsName);
          var harmNames = acc.vocalEnsemble.tracks.filter(function (tr) { return tr.role === 'harmony'; }).map(escEnsName);
          var ensParts = [];
          if (leadNames.length) ensParts.push(t('arr.ensLead', { list: leadNames.join(sepList) }, '主唱：' + leadNames.join(sepList)));
          if (duetNames.length) ensParts.push(t('arr.ensDuet', { list: duetNames.join(sepList) }, '对唱：' + duetNames.join(sepList)));
          if (harmNames.length) ensParts.push(t('arr.ensHarmony', { list: harmNames.join(sepList) }, '和声：' + harmNames.join(sepList)));
          var ensModeText = ensModeMap[acc.vocalEnsemble.mode] || acc.vocalEnsemble.mode;
          ensembleTxt = t('arr.outEnsemble', {
            n: acc.vocalEnsemble.trackCount,
            mode: ensModeText,
            roles: ensParts.join(' · ')
          }, '<br>多轨分析：' + acc.vocalEnsemble.trackCount + ' 音层（' + ensModeText + '）' +
            (ensParts.length ? ' · ' + ensParts.join(' · ') : ''));
        }
        $('#arrOut', m.el).innerHTML =
          t('arr.outTotal', { n: acc.length, sec: secTxt }, '共 <b>' + acc.length + '</b> 个伴奏音 · 段落：' + secTxt) +
          ensembleTxt +
          (acc.halfBpm ? t('arr.outHalfBpm', { bpm: acc.arrangementBpm }, '<br>编配速度：BPM 减半（起始 ' + acc.arrangementBpm + ' BPM）') : '') +
          (acc.mood ? t('arr.outMood', { name: moodName, src: acc.mood.automatic ? t('arr.outMoodAuto', null, '自动推断，可手动调整') : t('arr.outMoodManual', null, '手动指定') }, '<br>情绪：' + acc.mood.name + (acc.mood.automatic ? '（自动推断，可手动调整）' : '（手动指定）')) : '') +
          t('arr.outSpace', { space: spaceLabel }, '<br>混响空间：' + spaceLabel) +
          t('arr.outExpr', { val: acc.expression > 0 ? t('arr.outExprOn', { val: acc.expression.toFixed(1) }, acc.expression.toFixed(1) + ' · 乐句呼吸 / 主唱让位 / 声部展开') : t('arr.outExprOff', null, '关闭') }, '<br>层次起伏：' + (acc.expression > 0 ? acc.expression.toFixed(1) + ' · 乐句呼吸 / 主唱让位 / 声部展开' : '关闭')) +
          (acc.grid ? (acc.grid.mode === 'tracked'
            ? t('arr.outGridTracked', { mode: acc.grid.automatic ? t('arr.outGridTrackedAuto', null, '检测到自由速度') : t('arr.outGridTrackedMan', null, '手动指定'), barLen: acc.grid.barLength.toFixed(2) }, '<br>小节线：跟随演唱（' + (acc.grid.automatic ? '检测到自由速度' : '手动指定') + '，平均每小节 ' + acc.grid.barLength.toFixed(2) + ' 拍）')
            : t('arr.outGridOffset', {
                offset: acc.grid.offset.toFixed(3),
                mode: acc.grid.automatic
                  ? t('arr.outGridOffsetAuto', { lowConf: acc.grid.confidence < 0.08 ? t('arr.outGridLowConf', null, '（强拍证据不足，可手动校正）') : '' }, '自动估计' + (acc.grid.confidence < 0.08 ? '（强拍证据不足，可手动校正）' : ''))
                  : t('arr.outGridOffsetMan', null, '手动指定')
              }, '<br>小节偏移：' + acc.grid.offset.toFixed(3) + ' 拍 · ' + (acc.grid.automatic ? '自动估计' + (acc.grid.confidence < 0.08 ? '（强拍证据不足，可手动校正）' : '') : '手动指定'))) +
            t('arr.outMeter', { m: acc.grid.meter || 4, auto: acc.grid.meterAutomatic ? t('arr.outMeterAuto', null, '（自动）') : '' }, ' · 拍号 ' + (acc.grid.meter || 4) + '/4' + (acc.grid.meterAutomatic ? '（自动）' : '')) : '') +
          ($('#arrSample', m.el).checked ? t('arr.outSample', {
            notes: new Set(acc.filter(function (n) { return n.role === 'melodySample'; }).map(function (n) { return n.sampleSource; })).size,
            segs: (acc.samples || []).length,
            ans: (acc.samples || []).filter(function (s) { return s.mode === 'answer'; }).length,
            can: (acc.samples || []).filter(function (s) { return s.mode === 'canon'; }).length
          }, '<br>旋律采样：引用 ' + new Set(acc.filter(function (n) { return n.role === 'melodySample'; }).map(function (n) { return n.sampleSource; })).size +
            ' 个旋律音，' + (acc.samples || []).length + ' 段（句间呼应 ' +
            (acc.samples || []).filter(function (s) { return s.mode === 'answer'; }).length + ' · 句内追奏 ' +
            (acc.samples || []).filter(function (s) { return s.mode === 'canon'; }).length + '）') : '') +
          ($('#arrSample', m.el).checked ? t('arr.outLead', {
            intro: (acc.leads || []).filter(function (s) { return s.section === 'intro'; }).length,
            inter: (acc.leads || []).filter(function (s) { return s.section === 'interlude'; }).length,
            outro: (acc.leads || []).filter(function (s) { return s.section === 'outro'; }).length,
            mode: !(acc.leads || []).length ? t('arr.outLeadNone', null, '（没有足够的空档）') : +$('#arrImprov', m.el).value === 0 ? t('arr.outLeadLiteral', null, ' · 只复现旋律') : t('arr.outLeadImprov', null, ' · 乐句引用＋即兴'),
            imp: $('#arrImprov', m.el).value
          }, '<br>Lead 主奏：前奏 ' + (acc.leads || []).filter(function (s) { return s.section === 'intro'; }).length +
            ' 段 · 间奏 ' + (acc.leads || []).filter(function (s) { return s.section === 'interlude'; }).length +
            ' 段 · 尾奏 ' + (acc.leads || []).filter(function (s) { return s.section === 'outro'; }).length + ' 段' +
            (!(acc.leads || []).length ? '（没有足够的空档）' : +$('#arrImprov', m.el).value === 0 ? ' · 只复现旋律' : ' · 乐句引用＋即兴') +
            ' · 即兴度 ' + $('#arrImprov', m.el).value + '%') : '') +
          t('arr.outPhrases', { list: phraseTxt }, '<br>乐句调性：' + phraseTxt) +
          (chordNames.length ? t('arr.outChords', { chords: chordNames.slice(0, 32).join(' → '), more: chordNames.length > 32 ? ' …' : '', changes: chordNames.length - 1 }, '<br>和弦：' + chordNames.slice(0, 32).join(' → ') +
            (chordNames.length > 32 ? ' …' : '') + '（切换 ' + (chordNames.length - 1) + ' 次）') : '') +
          t('arr.outInsts', { list: Object.keys(kinds).map(function (k) {
            return tArrInstName(k, nameMap[k] || k) + '×' + kinds[k];
          }).join(sepList) }, '<br>配器：' + Object.keys(kinds).map(function (k) {
            return (nameMap[k] || k) + '×' + kinds[k];
          }).join('、'));
      } catch (e) {
        if (ticket === previewRequest && dialogOpen(m) && e.name !== 'AbortError') $('#arrOut', m.el).textContent = t('arr.previewFail', { msg: tMsg(e.message) }, '伴奏预览失败：' + e.message);
      } finally {
        if (ticket === previewRequest && dialogOpen(m)) $('#arrGo', m.el).disabled = arranging;
      }
    }
    ['arrTrackScope', 'arrSeed', 'arrMood', 'arrKey', 'arrSpace', 'arrIntro', 'arrKit', 'arrSample', 'arrSampAmt', 'arrImprov', 'arrMeter', 'arrGridMode', 'arrHalfBpm', 'arrChip', 'arrOffset', 'arrDen', 'arrExpr', 'arrChordRate', 'arrHum', 'arrSw'].forEach(function (id) {
      var el = $('#' + id, m.el);
      if (el) el.addEventListener('change', preview);
      if (el && id !== 'arrSeed') el.addEventListener('input', preview);
    });
    setTimeout(preview, 10);

    $('#arrGo', m.el).onclick = async function () {
      if (arranging) return;
      arranging = true; $('#arrGo', m.el).disabled = true;
      var key = projectKey();
      try {
        state.arrTrackScope = ($('#arrTrackScope', m.el) && $('#arrTrackScope', m.el).value) || 'all';
        var goTrackOpt = resolveArrangeTrackOpt(state.arrTrackScope, state.score);
        state.arrSeed = parseInt($('#arrSeed', m.el).value, 10) || 0;
        state.arrMood = $('#arrMood', m.el).value || 'auto';
        state.arrSpace = ($('#arrSpace', m.el) && $('#arrSpace', m.el).value) || 'auto';
        state.arrKey = $('#arrKey', m.el).value || 'auto';
        var goKeySpec = state.arrKey.split(':');
        var goKey = goKeySpec.length === 2 ? parseInt(goKeySpec[0], 10) : undefined;
        var goMinor = goKeySpec.length === 2 ? goKeySpec[1] === '1' : undefined;
        state.arrIntro = $('#arrIntro', m.el).checked;
        state.arrKit = $('#arrKit', m.el).checked;
        state.arrSample = $('#arrSample', m.el).checked;
        state.arrSampleAmt = parseFloat($('#arrSampAmt', m.el).value) || 1;
        state.arrImprov = parseFloat($('#arrImprov', m.el).value);
        state.arrMeter = $('#arrMeter', m.el).value;
        state.arrGridMode = $('#arrGridMode', m.el).value;
        state.arrHalfBpm = $('#arrHalfBpm', m.el).checked;
        state.arrChip = $('#arrChip', m.el).checked;
        state.arrOffset = $('#arrOffset', m.el).value;
        state.arrDensity = parseFloat($('#arrDen', m.el).value);
        state.arrExpression = parseFloat($('#arrExpr', m.el).value);
        state.arrChordRate = parseFloat($('#arrChordRate', m.el).value);
        state.arrHuman = parseFloat($('#arrHum', m.el).value);
        state.arrSwing = parseFloat($('#arrSw', m.el).value);
        setStatus(t('arr.generating', null, '正在生成伴奏…'));
        var result = await getRenderer().compute('arrange', { score: state.score, options: Object.assign({}, goTrackOpt, {
          style: state.arrStyle, mood: state.arrMood, space: state.arrSpace, key: Number.isInteger(goKey) ? goKey : undefined, minor: goMinor, seed: state.arrSeed, intro: state.arrIntro,
          kit: state.arrKit, density: state.arrDensity, expression: state.arrExpression, chordRate: state.arrChordRate,
          sampleMelody: state.arrSample, sampleAmount: state.arrSampleAmt, improvisation: state.arrImprov / 100, chip8bit: state.arrChip,
          meter: state.arrMeter === 'auto' ? undefined : +state.arrMeter, gridMode: state.arrGridMode,
          halfBpm: state.arrHalfBpm,
          barOffset: state.arrOffset === '' ? undefined : parseFloat(state.arrOffset),
          humanize: state.arrHuman, swing: state.arrSwing / 100
        }) });
        if (!dialogOpen(m)) return;
        if (key !== projectKey()) { setStatus(t('arr.staleCommit', null, '工程已变化，本次伴奏结果未应用')); return; }
        var acc = result.notes;
        enforceSingleAccompTrack(state.score);
        var generatedAccomp = ensureAccompTrack(state.score);
        generatedAccomp.notes = normNotes(acc);
        var resolvedSpace = result.meta && result.meta.space;
        if (!resolvedSpace || resolvedSpace === 'off') delete generatedAccomp.space;
        else generatedAccomp.space = resolvedSpace;
        delete generatedAccomp.sourceFormat;
        state.accPcm = null; state.accAudio = null; state.accKey = null; state.accPeak = 0; state.accEnv = null;
        updateStat(); state.dirty = true;
        m.close();
        renderAndAnalyze(60);
        var arrStyleObj = NSG.COMPOSE.arrangeStyleById(state.arrStyle);
        setStatus(t('arr.done', { n: acc.length, style: tArrangeStyleName(arrStyleObj), seed: state.arrSeed }, '自动伴奏完成：' + acc.length + ' 个伴奏音 · ' +
          arrStyleObj.name + ' · 种子 ' + state.arrSeed));
      } catch (e) { if (e.name !== 'AbortError') setStatus(t('arr.failed', { msg: tMsg(e.message) }, '伴奏生成失败：' + e.message)); }
      finally { arranging = false; if (dialogOpen(m)) $('#arrGo', m.el).disabled = false; }
    };
  }

  /* ---------------- 音色撅取 ---------------- */
  function openExtract() {
    var m = modal(t('ext.title', null, '音色撅取'),
      '<h3>' + t('ext.methodHead', null, '做法') + '</h3>' +
      '<p>' + t('ext.methodDesc', null, '从独唱或朗读中选取稳定的浊音，拟合声道、声门谐波、气声及其随音高的变化。普通引擎和 48 kHz 模式 B 分别按实测音高重唱，再与对应的录音片段比较，生成各自的输出均衡。') + '</p>' +
      '<p class="eyehint">' + t('ext.tip', null, '建议使用 5–30 秒无伴奏、少混响的清晰清唱（干声），包含不同元音与音高。输出均衡会连同话筒与声学色彩一起记录；身高保持中性，声道长短与咽腔比例由缩放及共振峰比例参数表达。误差是频谱误差，不是声音相似度评分。') + '</p>' +
      '<div class="row2"><button class="abtn" id="exPick">' + t('ext.pickBtn', null, '选择人声音频') + '</button><span id="exName" class="eyehint" style="margin:0">' + t('ext.nonePicked', null, '未选择') + '</span></div>' +
      '<div class="mini-prog"><div id="exProg"></div></div>' +
      '<div id="exOut"></div>',
      '<button class="abtn" id="exGo" disabled>' + t('ext.goBtn', null, '生成音色块') + '</button><button class="abtn" data-close>' + t('common.close', null, '关闭') + '</button>');
    var res = null, sourceName = '', request = 0;
    $('#exPick', m.el).onclick = function () {
      var ticket = ++request;
      res = null;
      $('#exGo', m.el).disabled = true;
      pickAudio(function (buf, name, widePcm, wideRate) {
        if (ticket !== request) return;
        sourceName = name.replace(/\.[^.]+$/, '');
        $('#exOut', m.el).textContent = t('ext.analyzing', null, '正在从歌唱音频拟合声源与声道，并与合成结果对比（约数秒）…');
        $('#exName', m.el).textContent = name + ' · ' + (buf.length / 16000).toFixed(1) + 's';
        $('#exProg', m.el).style.width = '30%';
        setTimeout(async function () {
          try {
            if (ticket !== request) return;
            var fitted = await getRenderer().extract(buf, 16000, widePcm, wideRate);
            if (ticket !== request) return;
            res = fitted;
            $('#exProg', m.el).style.width = '100%';
            var d = res.diagnostics, tb = res.timbre;
            var fRatioStr = Array.isArray(tb.fRatio) ? '（' + tb.fRatio.map(function (v) { return v.toFixed(2); }).join('/') + '）' : '';
            var h1h2Str = Array.isArray(tb.harm) && typeof tb.harm[1] === 'number' ? ' · H2 ' + tb.harm[1].toFixed(1) + ' dB' : '';
            $('#exOut', m.el).innerHTML = '<table class="tbl">' +
              '<tr><td>' + t('ext.rowFrames', null, '有效浊音帧 / 元音类') + '</td><td>' + d.frames + ' / ' + d.vowelClasses + '</td></tr>' +
              '<tr><td>' + t('ext.rowF0', null, '基频中位数') + '</td><td>' + t('ext.rowF0Unit', { f0: d.medianF0 }, d.medianF0 + ' Hz（不改变乐谱音高）') + '</td></tr>' +
              '<tr><td>' + t('ext.rowScale', null, '声道缩放 / 带宽') + '</td><td>' + tb.fScale.toFixed(3) + fRatioStr + ' / ' + tb.bwScale.toFixed(2) + '</td></tr>' +
              '<tr><td>' + t('ext.rowTilt', null, '声源谱倾斜 / 气声') + '</td><td>' + tb.tiltDb.toFixed(2) + ' dB/oct' + h1h2Str + ' / ' + tb.breath + '</td></tr>' +
              '<tr><td>' + t('tune.effort', null, '轻重') + '</td><td>' +
                (tb.effortProfile ? t('ext.effortMeasured', null, '已从录音估计轻唱与重唱参数') :
                  t('ext.effortDefault', null, '使用默认参数；可用同音高、同元音的轻唱和重唱干声校准')) + '</td></tr>' +
              (tb.vowelSpace ? '<tr><td>' + t('ext.rowSpace', null, '元音分布倍率（F1 / F2）') + '</td><td>' + tb.vowelSpace.map(function (v) { return v.toFixed(2); }).join(' / ') + '</td></tr>' : '') +
              (tb.harmTailDb !== undefined ? '<tr><td>' + t('ext.rowTail', null, 'H16 以上谐波斜率') + '</td><td>' + tb.harmTailDb.toFixed(1) + ' dB/oct</td></tr>' : '') +
              '<tr><td>' + t('ext.rowHoldout', null, '留出频谱误差') + '</td><td>' + d.baselineDb + ' → ' + d.fittedDb + ' dB</td></tr>' +
              (d.spectrumDb !== undefined ? '<tr><td>' + t('ext.rowLongSpec', null, '普通模式重合成频谱误差') + '</td><td>' + d.spectrumDb0 + ' → ' + d.spectrumDb + ' dB</td></tr>' : '') +
              (d.modeBDb !== undefined ? '<tr><td>' + t('ext.rowModeB', null, '模式 B 重合成频谱误差') + '</td><td>' + d.modeBDb0 + ' → ' + d.modeBDb + ' dB</td></tr>' : '') +
              '</table>' +
              (d.vowelClasses < 3 ? '<p>' + t('ext.lowVowels', null, '元音覆盖较少，建议选用包含多种元音的歌唱干声片段。') + '</p>' : '');
            $('#exGo', m.el).disabled = false;
          } catch (e) {
            if (ticket !== request) return;
            res = null; $('#exGo', m.el).disabled = true;
            $('#exOut', m.el).textContent = tMsg(e.message);
          }
        }, 60);
      });
    };
    $('#exGo', m.el).onclick = function () {
      if (!res) return;
      state.timbre = NSG.cloneTimbre(res.timbre);
      state.timbre.name = t('ext.blockPrefix', null, '撅取 ') + sourceName;
      state.presetDirty = false;
      applyTimbreToUI();
      NSG.saveTimbre(state.timbre);
      refreshBlockList();
      state.dirty = true;
      m.close();
      renderAndAnalyze(60);
      setStatus(t('ext.doneStatus', { name: state.timbre.name }, '已生成音色块：' + state.timbre.name));
    };
  }

  function pickAudio(cb) {
    var inp = $('#audioInput');
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = async function () {
        try {
          // Decode at a known rate, independently of the playback device.
          var decoder = new OfflineAudioContext(1, 1, 48000);
          var ab = await decoder.decodeAudioData(fr.result);
          async function monoAt(rate) {
            if (ab.sampleRate === rate && ab.numberOfChannels === 1) return ab.getChannelData(0);
            var ctx = new OfflineAudioContext(1, Math.ceil(ab.duration * rate), rate);
            var src = ctx.createBufferSource();
            src.buffer = ab; src.connect(ctx.destination); src.start();
            return (await ctx.startRendering()).getChannelData(0);
          }
          var channels = await Promise.all([monoAt(16000), monoAt(48000)]);
          cb(channels[0], f.name, channels[1], 48000);
        } catch (e) { alert(t('ext.decodeFail', null, '无法解码该音频')); }
      };
      fr.readAsArrayBuffer(f);
      inp.value = '';
    };
    inp.click();
  }

  /* ---------------- 启动 ---------------- */
  window.addEventListener('error', function (e) {
    try { $('#status').textContent = t('ui.scriptError', { msg: e.message || e.type }, '脚本错误：' + (e.message || e.type)); } catch (x) { }
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('visibilitychange', function () {
      if (document.body && document.body.classList) {
        document.body.classList.toggle('page-hidden', !!document.hidden);
      }
    });
    if (NSG && NSG.I18N && typeof NSG.I18N.init === 'function') NSG.I18N.init();
    applyUiLanguage();
    bindFileInput();
    var savedBg = 'a1';
    var savedCustomBg = null;
    var savedTheme = 'aero';
    var savedTransparency = null;
    try {
      savedBg = localStorage.getItem('nsg.bg') || 'a1';
      savedCustomBg = localStorage.getItem('nsg.customBg');
      savedTheme = localStorage.getItem('nsg.theme') || 'aero';
      savedTransparency = localStorage.getItem('nsg.uiTransparency');
      state.forceSnap = localStorage.getItem('nsg.forceSnap') === '1';
      state.relativeMotion = false;
      localStorage.removeItem('nsg.relativeMotion');
      if (localStorage.getItem('nsg.legacySound') === '1' && NSG.setLegacySound) NSG.setLegacySound(true);
      var savedSchemesRaw = localStorage.getItem('nsg.themeSchemes');
      if (savedSchemesRaw) {
        var parsedSchemes = JSON.parse(savedSchemesRaw);
        if (parsedSchemes && typeof parsedSchemes === 'object') {
          Object.keys(DEFAULT_THEME_SCHEMES).forEach(function (k) {
            if (typeof parsedSchemes[k] === 'string' && parsedSchemes[k]) {
              state.themeSchemes[k] = parsedSchemes[k];
            }
          });
        }
      }
      var savedCustomRaw = localStorage.getItem('nsg.modernCustom');
      if (savedCustomRaw) {
        var parsedCustom = JSON.parse(savedCustomRaw);
        if (parsedCustom && typeof parsedCustom.seed === 'string') {
          state.modernCustom = { seed: parsedCustom.seed, dark: !!parsedCustom.dark };
        }
      }
    } catch (e) { }
    state.bgId = savedBg;
    if (savedCustomBg) state.customBgUrl = savedCustomBg;
    setTheme(savedTheme, { persist: false });
    setUITransparency(savedTransparency);
    boot();
    setBg(savedBg);
  });
  window.addEventListener('load', function () { });
})(window);
