use core::f64::consts::{LN_2, PI};

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

use crate::accomp_fx::{
    finalize_accomp_mix, flush_f32, run_space_effect, run_space_effect_inplace, sin_t, sin_t_pos,
    sin_t_unit, SpaceParams,
};
use crate::harmonics::Mulberry32;

const TWO_PI: f64 = 2.0 * PI;

#[inline(always)]
fn saw(ph: f64) -> f64 {
    (ph - ph.floor()) * 2.0 - 1.0
}

#[inline(always)]
fn tri(ph: f64) -> f64 {
    saw(ph).abs() * 2.0 - 1.0
}

#[inline(always)]
fn blep(phase: f64, step: f64) -> f64 {
    if phase < step {
        let x = phase / step;
        x + x - x * x - 1.0
    } else if phase > 1.0 - step {
        let y = (phase - 1.0) / step;
        y * y + y + y + 1.0
    } else {
        0.0
    }
}

#[inline(always)]
fn wrap01_fast(mut x: f64) -> f64 {
    if x >= 1.0 {
        x -= 1.0;
        if x >= 1.0 {
            x -= x.floor();
        }
    }
    x
}

#[inline(always)]
fn pulse(phase: f64, width: f64, step: f64) -> f64 {
    let base = if phase < width { 1.0 } else { -1.0 };
    let mut pw = phase - width;
    if pw < 0.0 {
        pw += 1.0;
    }
    base - (2.0 * width - 1.0) + blep(phase, step) - blep(pw, step)
}

#[inline(always)]
fn poly_saw(phase: f64, step: f64) -> f64 {
    phase * 2.0 - 1.0 - blep(phase, step)
}

#[inline(always)]
fn js_round(x: f64) -> usize {
    (x + 0.5).floor().max(0.0) as usize
}

#[derive(Clone, Copy)]
struct Svf {
    ic1: f64,
    ic2: f64,
    a1: f64,
    a2: f64,
    a3: f64,
    bp: f64,
}

impl Svf {
    #[inline(always)]
    fn new() -> Self {
        Self {
            ic1: 0.0,
            ic2: 0.0,
            a1: 1.0,
            a2: 0.0,
            a3: 0.0,
            bp: 0.0,
        }
    }

    #[inline(always)]
    fn set(&mut self, sr: f64, fc: f64, q: f64) {
        let g = (PI * fc.clamp(20.0, sr * 0.45) / sr).tan();
        let k = 1.0 / q;
        self.a1 = 1.0 / (1.0 + g * (g + k));
        self.a2 = g * self.a1;
        self.a3 = g * self.a2;
    }

    #[inline(always)]
    fn lp(&mut self, x: f64) -> f64 {
        let v3 = x - self.ic2;
        let v1 = self.a1 * self.ic1 + self.a2 * v3;
        let v2 = self.ic2 + self.a2 * self.ic1 + self.a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
        self.ic2 = 2.0 * v2 - self.ic2;
        self.bp = v1;
        v2
    }
}

pub struct AccompEngine {
    pub sin_tab: [f64; 2049],
    pub params: [f64; 64],
    pub extra_f64: Vec<f64>,
    pub scratch: Vec<f32>,
    pub buf_len: usize,
    pub acc_l: Vec<f32>,
    pub acc_r: Vec<f32>,
    pub acc_mono: Vec<f32>,
    pub hall_l: Vec<f32>,
    pub hall_r: Vec<f32>,
    pub plate_l: Vec<f32>,
    pub plate_r: Vec<f32>,
    pub delay_l: Vec<f32>,
    pub delay_r: Vec<f32>,
    pub chorus_l: Vec<f32>,
    pub chorus_r: Vec<f32>,
    pub has_hall: bool,
    pub has_plate: bool,
    pub has_delay: bool,
    pub has_chorus: bool,
    // Standalone FX buffers for Worker-pool runAccompSpace / finalizeAccomp
    pub fx_l: Vec<f32>,
    pub fx_r: Vec<f32>,
    pub fx_mono: Vec<f32>,
    // Reusable Karplus-Strong / chorus work buffers
    ks_buf: Vec<f32>,
    ks_ex: Vec<f32>,
    ks_obuf: Vec<f32>,
    ks_oex: Vec<f32>,
    ks_chbuf: Vec<f32>,
}

impl AccompEngine {
    pub fn new() -> Self {
        let mut sin_tab = [0.0_f64; 2049];
        for i in 0..=2048 {
            sin_tab[i] = ((TWO_PI * (i as f64) / 2048.0).sin() as f32) as f64;
        }
        Self {
            sin_tab,
            params: [0.0; 64],
            extra_f64: Vec::new(),
            scratch: Vec::new(),
            buf_len: 0,
            acc_l: Vec::new(),
            acc_r: Vec::new(),
            acc_mono: Vec::new(),
            hall_l: Vec::new(),
            hall_r: Vec::new(),
            plate_l: Vec::new(),
            plate_r: Vec::new(),
            delay_l: Vec::new(),
            delay_r: Vec::new(),
            chorus_l: Vec::new(),
            chorus_r: Vec::new(),
            has_hall: false,
            has_plate: false,
            has_delay: false,
            has_chorus: false,
            fx_l: Vec::new(),
            fx_r: Vec::new(),
            fx_mono: Vec::new(),
            ks_buf: Vec::new(),
            ks_ex: Vec::new(),
            ks_obuf: Vec::new(),
            ks_oex: Vec::new(),
            ks_chbuf: Vec::new(),
        }
    }

    pub fn begin(&mut self, buf_len: usize) {
        self.buf_len = buf_len;
        if self.acc_l.len() < buf_len {
            self.acc_l.resize(buf_len, 0.0);
        }
        if self.acc_r.len() < buf_len {
            self.acc_r.resize(buf_len, 0.0);
        }
        self.acc_l[..buf_len].fill(0.0);
        self.acc_r[..buf_len].fill(0.0);
        self.has_hall = false;
        self.has_plate = false;
        self.has_delay = false;
        self.has_chorus = false;
    }

    #[inline]
    fn ensure_scratch(&mut self, n: usize) {
        if self.scratch.len() < n {
            self.scratch.resize(n, 0.0);
        }
    }

    pub fn ensure_extra(&mut self, n: usize) -> *mut f64 {
        if self.extra_f64.len() < n {
            self.extra_f64.resize(n, 0.0);
        }
        self.extra_f64.as_mut_ptr()
    }

    pub fn alloc_scratch(&mut self, n: usize) -> *mut f32 {
        self.ensure_scratch(n);
        self.scratch.as_mut_ptr()
    }

    pub fn alloc_fx(&mut self, total: usize) {
        if self.fx_l.len() < total {
            self.fx_l.resize(total, 0.0);
        }
        if self.fx_r.len() < total {
            self.fx_r.resize(total, 0.0);
        }
    }

    pub fn read_space_params(&self, offset: usize) -> SpaceParams {
        let p = &self.params;
        SpaceParams {
            hall_time: p[offset],
            hall_damp: p[offset + 1],
            hall_mix: p[offset + 2],
            plate_time: p[offset + 3],
            plate_mix: p[offset + 4],
            delay_mix: p[offset + 5],
            delay_fb: p[offset + 6],
            chorus_mix: p[offset + 7],
            pocket_db: p[offset + 8],
            air_db: p[offset + 9],
            comp_ratio: p[offset + 10],
            comp_thresh: p[offset + 11],
        }
    }

    pub fn run_fx_space_inplace(
        &mut self,
        effect_id: u32,
        total: usize,
        sr: f64,
        spb0: f64,
    ) {
        let sp = self.read_space_params(0);
        run_space_effect_inplace(
            &self.sin_tab,
            effect_id,
            &mut self.fx_l[..total],
            &mut self.fx_r[..total],
            sr,
            &sp,
            spb0,
        );
    }

    pub fn run_fx_finalize(&mut self, total: usize, sr: f64, has_space: bool, legacy: bool) {
        if self.fx_mono.len() < total {
            self.fx_mono.resize(total, 0.0);
        }
        let sp = self.read_space_params(0);
        finalize_accomp_mix(
            &mut self.fx_l[..total],
            &mut self.fx_r[..total],
            &mut self.fx_mono[..total],
            sr,
            has_space,
            &sp,
            legacy,
        );
    }

    pub fn run_all_space_and_finalize(
        &mut self,
        sr: f64,
        spb0: f64,
        has_space: bool,
        legacy: bool,
    ) {
        let total = self.buf_len;
        let sp = self.read_space_params(0);
        if has_space {
            let has_sig = |a: &[f32], b: &[f32]| -> bool {
                for i in 0..total {
                    if a[i] != 0.0 || b[i] != 0.0 {
                        return true;
                    }
                }
                false
            };
            if self.has_chorus && has_sig(&self.chorus_l[..total], &self.chorus_r[..total]) {
                run_space_effect(
                    &self.sin_tab,
                    0,
                    &self.chorus_l[..total],
                    &self.chorus_r[..total],
                    &mut self.acc_l[..total],
                    &mut self.acc_r[..total],
                    sr,
                    &sp,
                    spb0,
                    false,
                );
            }
            if self.has_delay && has_sig(&self.delay_l[..total], &self.delay_r[..total]) {
                run_space_effect(
                    &self.sin_tab,
                    1,
                    &self.delay_l[..total],
                    &self.delay_r[..total],
                    &mut self.acc_l[..total],
                    &mut self.acc_r[..total],
                    sr,
                    &sp,
                    spb0,
                    false,
                );
            }
            if self.has_plate && has_sig(&self.plate_l[..total], &self.plate_r[..total]) {
                run_space_effect(
                    &self.sin_tab,
                    2,
                    &self.plate_l[..total],
                    &self.plate_r[..total],
                    &mut self.acc_l[..total],
                    &mut self.acc_r[..total],
                    sr,
                    &sp,
                    spb0,
                    false,
                );
            }
            if self.has_hall && has_sig(&self.hall_l[..total], &self.hall_r[..total]) {
                run_space_effect(
                    &self.sin_tab,
                    3,
                    &self.hall_l[..total],
                    &self.hall_r[..total],
                    &mut self.acc_l[..total],
                    &mut self.acc_r[..total],
                    sr,
                    &sp,
                    spb0,
                    false,
                );
            }
        }
        if self.acc_mono.len() < total {
            self.acc_mono.resize(total, 0.0);
        }
        finalize_accomp_mix(
            &mut self.acc_l[..total],
            &mut self.acc_r[..total],
            &mut self.acc_mono[..total],
            sr,
            has_space,
            &sp,
            legacy,
        );
    }

    pub fn mix_scratch(&mut self, local_start: usize, mix_len: usize) {
        if mix_len == 0 || local_start >= self.buf_len {
            return;
        }
        let n = mix_len.min(self.buf_len - local_start);
        let l_scale = self.params[10] as f32;
        let r_scale = self.params[11] as f32;
        let sh = self.params[12] as f32;
        let sp = self.params[13] as f32;
        let sd = self.params[14] as f32;
        let sc = self.params[15] as f32;

        if sh != 0.0 && !self.has_hall {
            if self.hall_l.len() < self.buf_len {
                self.hall_l.resize(self.buf_len, 0.0);
                self.hall_r.resize(self.buf_len, 0.0);
            }
            self.hall_l[..self.buf_len].fill(0.0);
            self.hall_r[..self.buf_len].fill(0.0);
            self.has_hall = true;
        }
        if sp != 0.0 && !self.has_plate {
            if self.plate_l.len() < self.buf_len {
                self.plate_l.resize(self.buf_len, 0.0);
                self.plate_r.resize(self.buf_len, 0.0);
            }
            self.plate_l[..self.buf_len].fill(0.0);
            self.plate_r[..self.buf_len].fill(0.0);
            self.has_plate = true;
        }
        if sd != 0.0 && !self.has_delay {
            if self.delay_l.len() < self.buf_len {
                self.delay_l.resize(self.buf_len, 0.0);
                self.delay_r.resize(self.buf_len, 0.0);
            }
            self.delay_l[..self.buf_len].fill(0.0);
            self.delay_r[..self.buf_len].fill(0.0);
            self.has_delay = true;
        }
        if sc != 0.0 && !self.has_chorus {
            if self.chorus_l.len() < self.buf_len {
                self.chorus_l.resize(self.buf_len, 0.0);
                self.chorus_r.resize(self.buf_len, 0.0);
            }
            self.chorus_l[..self.buf_len].fill(0.0);
            self.chorus_r[..self.buf_len].fill(0.0);
            self.has_chorus = true;
        }

        let src = &self.scratch[..n];
        mix_stereo_pair(
            src,
            &mut self.acc_l[local_start..local_start + n],
            &mut self.acc_r[local_start..local_start + n],
            l_scale,
            r_scale,
        );
        if sh != 0.0 {
            mix_stereo_pair(
                src,
                &mut self.hall_l[local_start..local_start + n],
                &mut self.hall_r[local_start..local_start + n],
                l_scale * sh,
                r_scale * sh,
            );
        }
        if sp != 0.0 {
            mix_stereo_pair(
                src,
                &mut self.plate_l[local_start..local_start + n],
                &mut self.plate_r[local_start..local_start + n],
                l_scale * sp,
                r_scale * sp,
            );
        }
        if sd != 0.0 {
            mix_stereo_pair(
                src,
                &mut self.delay_l[local_start..local_start + n],
                &mut self.delay_r[local_start..local_start + n],
                l_scale * sd,
                r_scale * sd,
            );
        }
        if sc != 0.0 {
            mix_stereo_pair(
                src,
                &mut self.chorus_l[local_start..local_start + n],
                &mut self.chorus_r[local_start..local_start + n],
                l_scale * sc,
                r_scale * sc,
            );
        }
    }

    /// Synthesizes one note into `self.scratch`.
    /// If `auto_mix` is true, also accumulates directly into `acc_l/r` + send buses.
    pub fn render_note(&mut self, voice_id: u32, auto_mix: bool) -> usize {
        let max_out = self.params[6].max(0.0) as usize;
        if max_out == 0 {
            return 0;
        }
        self.ensure_scratch(max_out);
        let sin_tab_ptr: *const [f64; 2049] = &self.sin_tab;
        let sin_tab: &[f64; 2049] = unsafe { &*sin_tab_ptr };
        let used_len = match voice_id {
            1 => self.voice_piano(),
            2 => self.voice_pad(sin_tab),
            3 => self.voice_string(sin_tab),
            4 => self.voice_bass(sin_tab),
            5 => self.voice_strings(sin_tab),
            6 => self.voice_ep(sin_tab),
            7 => self.voice_mallet(sin_tab),
            8 => self.voice_drum(sin_tab),
            9 => self.voice_synth_pluck(),
            10 => self.voice_lead(sin_tab),
            11 => self.voice_organ(sin_tab),
            12 => self.voice_brass(sin_tab),
            13 => self.voice_choir(sin_tab),
            14 => self.voice_woodwind(sin_tab),
            15 => self.voice_accordion(sin_tab),
            16 => self.voice_tuba(sin_tab),
            17 => self.voice_electronic(sin_tab),
            18 => self.voice_chip(sin_tab),
            _ => 0,
        };
        if auto_mix && used_len > 0 {
            let local_start = self.params[9] as usize;
            self.mix_scratch(local_start, used_len);
        }
        used_len
    }

    // -------------------------------------------------------------------------
    // 1. Piano (SIMD128 f64x2 vectorized modal bank)
    // -------------------------------------------------------------------------
    fn voice_piano(&mut self) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        let tau_scale = p[16];
        let bright_base = p[17];
        let bright_vel = p[18];
        let warmth = p[19];
        let ham_scale = p[20];
        let gain = p[21];

        let key = 69.0 + 12.0 * (f / 440.0).ln() / LN_2;
        let blend = |lo: f64, hi: f64| -> f64 {
            let x = ((key - lo) / (hi - lo)).clamp(0.0, 1.0);
            x * x * (3.0 - 2.0 * x)
        };
        let stiffness = 0.000035 + 0.00016 * blend(55.0, 96.0);
        let tau = (2.65 * tau_scale * (261.6 / f).powf(0.65)).clamp(0.45, 5.0);
        let weights = [1.0, blend(36.0, 52.0), blend(52.0, 68.0)];
        let detunes = [0.0, -0.00055, 0.00055];
        let norm = weights[0] + weights[1] + weights[2];
        let bright = bright_base + bright_vel * vel;

        let mut re = [0.0_f64; 64];
        let mut im = [0.0_f64; 64];
        let mut co = [1.0_f64; 64];
        let mut si = [0.0_f64; 64];
        let mut fast = [0.0_f64; 64];
        let mut slow = [0.0_f64; 64];
        let mut fast_dec = [0.0_f64; 64];
        let mut slow_dec = [0.0_f64; 64];
        let mut n_modes = 0usize;

        for h in 1..=20 {
            let hf = h as f64;
            let hz = f * hf * ((1.0 + stiffness * hf * hf) / (1.0 + stiffness)).sqrt();
            if hz * 1.00055 >= sr * 0.45 {
                break;
            }
            for s in 0..3 {
                if weights[s] > 0.001 {
                    let angle = TWO_PI * hz * (1.0 + detunes[s]) / sr;
                    let mut amp =
                        bright.powi(h - 1) / hf.powf(0.95) * weights[s] / norm;
                    if h == 1 && warmth != 0.0 {
                        amp *= 1.0 + warmth;
                    }
                    re[n_modes] = 1.0;
                    im[n_modes] = 0.0;
                    co[n_modes] = angle.cos();
                    si[n_modes] = angle.sin();
                    fast[n_modes] = amp * (0.22 + 0.16 * vel);
                    slow[n_modes] = amp * (0.78 - 0.16 * vel);
                    fast_dec[n_modes] = (-1.0 / (sr * (0.12 + 0.16 / hf))).exp();
                    slow_dec[n_modes] = (-1.0 / (sr * tau / (1.0 + 0.42 * (hf - 1.0)))).exp();
                    n_modes += 1;
                }
            }
        }

        let release = sr * 0.12;
        let limit = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let mut active_modes = n_modes;
        let mut hammer = 0.0_f64;
        let c_ham = 1.0 - (-TWO_PI * (1000.0 + 3000.0 * vel) / sr).exp();
        let mut e_ham = ham_scale * vel;
        let d_ham = (-1.0 / (sr * 0.0025)).exp();
        let ham_end = sr * 0.01;
        let g_p = vel * gain;
        let att_inv = 1.0 / (sr * 0.002);
        let rel_inv = 1.0 / release;
        let out = &mut self.scratch[..limit];

        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let v_thresh = f64x2_splat(0.000002);
            for i in 0..limit {
                while active_modes > 0
                    && fast[active_modes - 1] + slow[active_modes - 1] < 0.000002
                {
                    active_modes -= 1;
                }
                let mut v_sum = f64x2_splat(0.0);
                let mut m = 0usize;
                while m + 1 < active_modes {
                    let v_fast = v128_load(fast.as_ptr().add(m) as *const v128);
                    let v_slow = v128_load(slow.as_ptr().add(m) as *const v128);
                    let v_amp = f64x2_add(v_fast, v_slow);
                    let v_mask = f64x2_ge(v_amp, v_thresh);

                    let v_re = v128_load(re.as_ptr().add(m) as *const v128);
                    let v_im = v128_load(im.as_ptr().add(m) as *const v128);
                    let v_co = v128_load(co.as_ptr().add(m) as *const v128);
                    let v_si = v128_load(si.as_ptr().add(m) as *const v128);

                    let new_re = f64x2_sub(f64x2_mul(v_re, v_co), f64x2_mul(v_im, v_si));
                    let new_im = f64x2_add(f64x2_mul(v_re, v_si), f64x2_mul(v_im, v_co));
                    v128_store(re.as_mut_ptr().add(m) as *mut v128, new_re);
                    v128_store(im.as_mut_ptr().add(m) as *mut v128, new_im);

                    let contrib = v128_and(f64x2_mul(new_im, v_amp), v_mask);
                    v_sum = f64x2_add(v_sum, contrib);

                    let v_fd = v128_load(fast_dec.as_ptr().add(m) as *const v128);
                    let v_sd = v128_load(slow_dec.as_ptr().add(m) as *const v128);
                    v128_store(fast.as_mut_ptr().add(m) as *mut v128, f64x2_mul(v_fast, v_fd));
                    v128_store(slow.as_mut_ptr().add(m) as *mut v128, f64x2_mul(v_slow, v_sd));
                    m += 2;
                }
                let mut sample =
                    f64x2_extract_lane::<0>(v_sum) + f64x2_extract_lane::<1>(v_sum);
                if m < active_modes {
                    let amp = fast[m] + slow[m];
                    if amp >= 0.000002 {
                        let nr = re[m] * co[m] - im[m] * si[m];
                        let ni = re[m] * si[m] + im[m] * co[m];
                        re[m] = nr;
                        im[m] = ni;
                        sample += ni * amp;
                        fast[m] *= fast_dec[m];
                        slow[m] *= slow_dec[m];
                    }
                }
                let fi = i as f64;
                if fi < ham_end {
                    let hit = rnd.next() * 2.0 - 1.0;
                    hammer += (hit - hammer) * c_ham;
                    sample += hammer
                        * if legacy {
                            ham_scale * vel * (-fi / (sr * 0.0025)).exp()
                        } else {
                            e_ham
                        };
                    e_ham *= d_ham;
                }
                let mut env = (fi * att_inv).min(1.0);
                if fi > len {
                    env *= (1.0 - (fi - len) * rel_inv).max(0.0);
                }
                if fin_gate {
                    env *= ((gate - fi) / gate_fade).min(1.0);
                }
                *out.get_unchecked_mut(i) = (sample * env * g_p) as f32;
            }
        }

        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        {
            for i in 0..limit {
                while active_modes > 0
                    && fast[active_modes - 1] + slow[active_modes - 1] < 0.000002
                {
                    active_modes -= 1;
                }
                let mut sample = 0.0_f64;
                for m in 0..active_modes {
                    let amp = fast[m] + slow[m];
                    if amp < 0.000002 {
                        continue;
                    }
                    let nr = re[m] * co[m] - im[m] * si[m];
                    let ni = re[m] * si[m] + im[m] * co[m];
                    re[m] = nr;
                    im[m] = ni;
                    sample += ni * amp;
                    fast[m] *= fast_dec[m];
                    slow[m] *= slow_dec[m];
                }
                let fi = i as f64;
                if fi < ham_end {
                    let hit = rnd.next() * 2.0 - 1.0;
                    hammer += (hit - hammer) * c_ham;
                    sample += hammer
                        * if legacy {
                            ham_scale * vel * (-fi / (sr * 0.0025)).exp()
                        } else {
                            e_ham
                        };
                    e_ham *= d_ham;
                }
                let mut env = (fi * att_inv).min(1.0);
                if fi > len {
                    env *= (1.0 - (fi - len) * rel_inv).max(0.0);
                }
                if fin_gate {
                    env *= ((gate - fi) / gate_fade).min(1.0);
                }
                out[i] = (sample * env * g_p) as f32;
            }
        }
        limit
    }

    // -------------------------------------------------------------------------
    // 2. Pad
    // -------------------------------------------------------------------------
    fn voice_pad(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let attack = p[16];
        let release = p[17];
        let cutoff = p[18];
        let sub = p[19];
        let air_amt = p[20];
        let glass = p[21];
        let gain = p[22];

        let mut p0 = rnd.next();
        let mut p1 = rnd.next();
        let mut p2 = rnd.next();
        let mut p_sub = 0.0_f64;
        let mut pf = Svf::new();
        let s0 = f / sr;
        let s1 = f * 1.0041 / sr;
        let s2 = f * 0.9959 / sr;
        let s_sub = f * 0.5 / sr;
        let p_att = sr * attack;
        let p_rel = sr * release;
        let p_len = (len + p_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let mut p_air_lp = 0.0_f64;
        let p_cut = (f * 2.6 + 250.0).min(2600.0) * (0.8 + 0.3 * vel) * cutoff;
        let p_lfo = rnd.next();
        let g = vel * gain;
        let c_air = if air_amt != 0.0 {
            1.0 - (-TWO_PI * 2000.0 / sr).exp()
        } else {
            0.0
        };
        let glass2 = glass != 0.0 && f * 2.0 < sr * 0.44;
        let glass3 = glass != 0.0 && f * 3.0 < sr * 0.44;
        let out = &mut self.scratch[..p_len];

        for i in 0..p_len {
            let fi = i as f64;
            if (i & 31) == 0 {
                let fc = p_cut
                    * (1.0 + 0.22 * sin_t(sin_tab, 0.21 * fi / sr + p_lfo))
                    * (0.6 + 0.4 * (fi / p_att).min(1.0));
                pf.set(sr, fc, 0.85);
            }
            p0 += s0;
            if p0 >= 1.0 { p0 -= 1.0; }
            p1 += s1;
            if p1 >= 1.0 { p1 -= 1.0; }
            p2 += s2;
            if p2 >= 1.0 { p2 -= 1.0; }
            p_sub += s_sub;
            if p_sub >= 1.0 { p_sub -= 1.0; }

            let mut px = (poly_saw(p0, s0) + poly_saw(p1, s1) + poly_saw(p2, s2)) * 0.2667
                + pulse(p_sub, 0.5, s_sub) * sub;
            if air_amt != 0.0 {
                let air = rnd.next() * 2.0 - 1.0;
                p_air_lp += (air - p_air_lp) * c_air;
                px += (air - p_air_lp) * air_amt;
            }
            let mut e = if fi < p_att { fi / p_att } else { 1.0 };
            if fi > len {
                e *= (1.0 - (fi - len) / p_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            let mut p_out = pf.lp(px);
            if glass != 0.0 {
                let g_env = (fi / (p_att * 1.35)).min(1.0)
                    * (0.7 + 0.3 * sin_t(sin_tab, 0.35 * fi / sr + p_lfo));
                let g_wave = (if glass2 { sin_t(sin_tab, p0 * 2.0) * 0.65 } else { 0.0 })
                    + (if glass3 { sin_t(sin_tab, p1 * 3.0) * 0.35 } else { 0.0 });
                p_out += g_wave * glass * g_env;
            }
            out[i] = (p_out * e * g) as f32;
        }
        p_len
    }

    // -------------------------------------------------------------------------
    // 3. String (Karplus-Strong guitar / harp / pluck + 12-string + ADAA + chorus)
    // -------------------------------------------------------------------------
    fn voice_string(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let excite = p[16];
        let vel_excite = p[17];
        let pick = p[18];
        let tau = p[19];
        let reference = p[20];
        let release = p[21];
        let body = p[22];
        let cutoff = p[23];
        let body_gain = p[24];
        let pickup = p[25];
        let overtone = p[26];
        let drive_amt = p[27];
        let cabinet = p[28];
        let oct_str = p[29];
        let chorus_amt = p[30];
        let gain = p[31];

        let k_per = sr / f;
        let mut k_n = ((k_per - 0.5).floor() as isize).max(2) as usize;
        let mut k_fr = k_per - 0.5 - (k_n as f64);
        if k_fr < 0.15 && k_n > 2 {
            k_n -= 1;
            k_fr += 1.0;
        }
        let k_c = (1.0 - k_fr) / (1.0 + k_fr);
        if self.ks_buf.len() < k_n { self.ks_buf.resize(k_n, 0.0); }
        if self.ks_ex.len() < k_n { self.ks_ex.resize(k_n, 0.0); }
        let k_buf = &mut self.ks_buf[..k_n];
        let k_ex = &mut self.ks_ex[..k_n];
        let mut k_lp = 0.0_f64;
        let k_coef = excite + vel_excite * vel;
        for j in 0..k_n {
            k_lp += ((rnd.next() * 2.0 - 1.0) - k_lp) * k_coef;
            k_ex[j] = k_lp as f32;
        }
        let k_pick = js_round((k_n as f64) * pick).max(1);
        for j in 0..k_n {
            k_buf[j] = k_ex[j] - k_ex[(j + k_pick) % k_n] * 0.9;
        }

        let k_tau = (tau * (reference / f).powf(0.5)).clamp(0.08, 4.0);
        let k_damp = (-1.0 / (f * k_tau)).exp();
        let k_mute = (-1.0 / (f * 0.05)).exp();
        let k_rel = sr * release;
        let k_len = (len + k_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;

        let mut kk = 0usize;
        let mut k_prev = 0.0_f64;
        let mut k_x1 = 0.0_f64;
        let mut k_y1 = 0.0_f64;
        let mut k_body = Svf::new();
        let mut k_tone = Svf::new();
        k_body.set(sr, body, 1.3);
        k_tone.set(sr, cutoff, 0.7);

        let has_cab = drive_amt != 0.0;
        let mut k_cab = Svf::new();
        if has_cab {
            k_cab.set(sr, cabinet, 0.65);
        }
        let mut k_drive_prev = 0.0_f64;
        let has_pickup = pickup != 0.0;
        let k_pickup = js_round((k_n as f64) * if has_pickup { pickup } else { 0.01 }).max(1);

        let has_oct = oct_str != 0.0 && f * 2.0 < sr * 0.42;
        let mut o_n = 0usize;
        let mut o_c = 0.0_f64;
        let mut ok = 0usize;
        let mut o_prev = 0.0_f64;
        let mut o_x1 = 0.0_f64;
        let mut o_y1 = 0.0_f64;
        let mut o_damp = 0.0_f64;
        let mut o_mute = 0.0_f64;
        if has_oct {
            let o_per = sr / (f * 2.0012);
            o_n = ((o_per - 0.5).floor() as isize).max(2) as usize;
            let mut o_fr = o_per - 0.5 - (o_n as f64);
            if o_fr < 0.15 && o_n > 2 {
                o_n -= 1;
                o_fr += 1.0;
            }
            o_c = (1.0 - o_fr) / (1.0 + o_fr);
            if self.ks_obuf.len() < o_n { self.ks_obuf.resize(o_n, 0.0); }
            if self.ks_oex.len() < o_n { self.ks_oex.resize(o_n, 0.0); }
            let mut o_lp = 0.0_f64;
            for j in 0..o_n {
                o_lp += ((rnd.next() * 2.0 - 1.0) - o_lp) * (k_coef * 0.9);
                self.ks_oex[j] = o_lp as f32;
            }
            let o_pick = js_round((o_n as f64) * pick).max(1);
            for j in 0..o_n {
                self.ks_obuf[j] = self.ks_oex[j] - self.ks_oex[(j + o_pick) % o_n] * 0.9;
            }
            o_damp = (-1.0 / (f * 2.0 * k_tau * 0.85)).exp();
            o_mute = (-1.0 / (f * 2.0 * 0.05)).exp();
        }

        let ch_size = if chorus_amt != 0.0 {
            ((sr * 0.022).ceil() as usize).max(64)
        } else {
            0
        };
        if ch_size > 0 {
            if self.ks_chbuf.len() < ch_size {
                self.ks_chbuf.resize(ch_size, 0.0);
            }
            self.ks_chbuf[..ch_size].fill(0.0);
        }
        let mut ch_idx = 0usize;
        let g_k = vel * gain;
        let mut ph = 0.0_f64;
        let ot_on = overtone != 0.0 && f * 4.0 < sr * 0.45;
        let ot_end = sr * 0.15;

        let out = &mut self.scratch[..k_len];
        let k_buf = &mut self.ks_buf[..k_n];
        let o_buf = &mut self.ks_obuf[..o_n];
        let ch_buf = &mut self.ks_chbuf[..ch_size];

        for i in 0..k_len {
            let fi = i as f64;
            let k_d = k_buf[kk] as f64;
            let k_l = (k_d + k_prev) * 0.5 * if fi > len { k_mute } else { k_damp };
            k_prev = k_d;
            let k_a = k_c * k_l + k_x1 - k_c * k_y1;
            k_x1 = k_l;
            k_y1 = k_a;
            k_buf[kk] = flush_f32(k_a as f32);
            kk += 1;
            if kk == k_n { kk = 0; }
            let mut k_sig = if has_pickup {
                k_d - (k_buf[(kk + k_pickup) % k_n] as f64) * 0.65
            } else {
                k_d
            };
            if has_oct {
                let o_d = o_buf[ok] as f64;
                let o_l = (o_d + o_prev) * 0.5 * if fi > len { o_mute } else { o_damp };
                o_prev = o_d;
                let o_a = o_c * o_l + o_x1 - o_c * o_y1;
                o_x1 = o_l;
                o_y1 = o_a;
                o_buf[ok] = flush_f32(o_a as f32);
                ok += 1;
                if ok == o_n { ok = 0; }
                k_sig += o_d * oct_str;
            }
            let mut k_y = k_tone.lp(k_sig);
            k_body.lp(k_y);
            k_y += k_body.bp * body_gain;
            if ot_on && fi < ot_end {
                ph += f * 4.0 / sr;
                if ph >= 1.0 { ph -= 1.0; }
                k_y += sin_t(sin_tab, ph) * overtone * vel * (-fi / (sr * 0.03)).exp();
            }
            if has_cab {
                let drive = k_y * drive_amt;
                let saturated = (drive + k_drive_prev)
                    / ((1.0 + drive * drive).sqrt() + (1.0 + k_drive_prev * k_drive_prev).sqrt());
                k_drive_prev = drive;
                k_y = k_cab.lp(saturated);
            }
            if ch_size > 0 {
                ch_buf[ch_idx] = k_y as f32;
                let d_sam = (0.008 + 0.0028 * sin_t(sin_tab, 0.85 * fi / sr)) * sr;
                let d_int = d_sam as usize;
                let d_fr = d_sam - (d_int as f64);
                let r1 = if ch_idx >= d_int { ch_idx - d_int } else { ch_idx + ch_size - d_int };
                let r0 = if r1 > 0 { r1 - 1 } else { ch_size - 1 };
                k_y = k_y * (1.0 - chorus_amt * 0.35)
                    + ((ch_buf[r1] as f64) * (1.0 - d_fr) + (ch_buf[r0] as f64) * d_fr)
                        * chorus_amt;
                ch_idx += 1;
                if ch_idx == ch_size { ch_idx = 0; }
            }
            let mut e = (fi / (sr * 0.0015)).min(1.0);
            if fi > len {
                e *= (1.0 - (fi - len) / k_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (k_y * e * g_k) as f32;
        }
        k_len
    }

    // -------------------------------------------------------------------------
    // 4. Bass
    // -------------------------------------------------------------------------
    fn voice_bass(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        let release = p[16];
        let tau = p[17];
        let mwah = p[18];
        let harmonic = p[19];
        let noise_amt = p[20];
        let attack = p[21];
        let gain = p[22];
        let scoop = p[23];
        let cutoff = p[24];
        let resonance = p[25];
        let square = p[26];

        let mut ph = 0.0_f64;
        let mut bf = Svf::new();
        let b_rel = sr * release;
        let b_len = (len + b_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let mut b_noise = 0.0_f64;
        let b_tau = if tau != 0.0 {
            (tau * (98.0 / f).powf(0.35)).clamp(0.45, 4.0)
        } else {
            0.0
        };
        let has_mwah = mwah != 0.0;
        let mut b_mwah = Svf::new();
        if has_mwah {
            b_mwah.set(sr, (f * 4.5 + 320.0).min(1400.0), 2.8);
        }
        let out = &mut self.scratch[..b_len];

        if !legacy {
            let b_step = f / sr;
            let b_harm_on = harmonic != 0.0 && f * 2.0 < sr * 0.45;
            let mut e_harm = harmonic * vel;
            let d_harm = (-1.0 / (sr * 0.045)).exp();
            let mut e_env = 1.0_f64;
            let d_env = (-1.0 / (sr * if b_tau != 0.0 { b_tau } else { 0.3 })).exp();
            let mut e_scoop = 1.0_f64;
            let d_scoop = (-1.0 / (sr * 0.032)).exp();
            let mut e_noise = noise_amt;
            let d_noise = (-1.0 / (sr * 0.003)).exp();
            let c_noise = 1.0 - (-TWO_PI * 1800.0 / sr).exp();
            let att_inv = 1.0 / (sr * attack);
            let noise_end = sr * 0.012;
            let g_b = vel * gain;
            for i in 0..b_len {
                let fi = i as f64;
                let step_now = if scoop != 0.0 { b_step * (1.0 + scoop * e_scoop) } else { b_step };
                ph += step_now;
                if ph >= 1.0 { ph -= 1.0; }
                if (i & 15) == 0 {
                    bf.set(sr, f * 1.8 + (250.0 + cutoff * vel) * (-(fi / sr) / 0.07).exp(), resonance);
                }
                let b_wave = poly_saw(ph, step_now)
                    + if square != 0.0 { pulse(ph, 0.35, step_now) * square } else { 0.0 };
                let mut bx = bf.lp(b_wave) * 0.62 + sin_t(sin_tab, ph) * 0.5;
                if has_mwah {
                    b_mwah.lp(b_wave);
                    bx += b_mwah.bp * mwah * (1.0 - e_scoop) * 0.55;
                }
                if b_harm_on {
                    bx += sin_t(sin_tab, ph * 2.0) * e_harm;
                    e_harm *= d_harm;
                }
                if fi < noise_end {
                    let bn = rnd.next() * 2.0 - 1.0;
                    b_noise += (bn - b_noise) * c_noise;
                    bx += (bn - b_noise) * e_noise;
                    e_noise *= d_noise;
                }
                let att_b = (fi * att_inv).min(1.0);
                let mut e = att_b * if b_tau != 0.0 { e_env } else { 0.72 + 0.28 * e_env };
                e_env *= d_env;
                e_scoop *= d_scoop;
                if fi > len {
                    e *= (1.0 - (fi - len) / b_rel).max(0.0);
                }
                if fin_gate {
                    e *= ((gate - fi) / gate_fade).min(1.0);
                }
                out[i] = (bx * e * g_b) as f32;
            }
        } else {
            let c_noise = 1.0 - (-TWO_PI * 1800.0 / sr).exp();
            let noise_end = sr * 0.012;
            let b_harm_on = harmonic != 0.0 && f * 2.0 < sr * 0.45;
            let g_b = vel * gain;
            for i in 0..b_len {
                let fi = i as f64;
                let t = fi / sr;
                let scoop_l = if scoop != 0.0 { 1.0 + scoop * (-t / 0.032).exp() } else { 1.0 };
                let step_l = f * scoop_l / sr;
                ph += step_l;
                if ph >= 1.0 { ph -= 1.0; }
                if (i & 15) == 0 {
                    bf.set(sr, f * 1.8 + (250.0 + cutoff * vel) * (-t / 0.07).exp(), resonance);
                }
                let b_wave = poly_saw(ph, step_l)
                    + if square != 0.0 { pulse(ph, 0.35, step_l) * square } else { 0.0 };
                let mut bx = bf.lp(b_wave) * 0.62 + sin_t(sin_tab, ph) * 0.5;
                if has_mwah {
                    b_mwah.lp(b_wave);
                    bx += b_mwah.bp * mwah * (1.0 - (-t / 0.032).exp()) * 0.55;
                }
                if b_harm_on {
                    bx += sin_t(sin_tab, ph * 2.0) * harmonic * vel * (-t / 0.045).exp();
                }
                if fi < noise_end {
                    let bn = rnd.next() * 2.0 - 1.0;
                    b_noise += (bn - b_noise) * c_noise;
                    bx += (bn - b_noise) * noise_amt * (-t / 0.003).exp();
                }
                let mut e = (fi / (sr * attack)).min(1.0)
                    * if b_tau != 0.0 { (-t / b_tau).exp() } else { 0.72 + 0.28 * (-t / 0.3).exp() };
                if fi > len {
                    e *= (1.0 - (fi - len) / b_rel).max(0.0);
                }
                if fin_gate {
                    e *= ((gate - fi) / gate_fade).min(1.0);
                }
                out[i] = (bx * e * g_b) as f32;
            }
        }
        b_len
    }

    // -------------------------------------------------------------------------
    // 5. Strings
    // -------------------------------------------------------------------------
    fn voice_strings(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let voices = p[16] as usize;
        let body_high = p[17];
        let nasal = p[18];
        let body_low = p[19];
        let solo = p[20] != 0.0;
        let lush = p[21] != 0.0;
        let attack = p[22];
        let release = p[23];
        let gain = p[24];
        let vib_target = p[25];
        let scoop = p[26];
        let swell = p[27];
        let dark = p[28];
        let octave = p[29];

        let (nv, s_det): (usize, [f64; 7]) = if voices == 7 {
            (7, [1.0, 1.0036, 0.9964, 1.0017, 0.9983, 1.0058, 0.9942])
        } else if voices == 2 {
            (2, [1.0, 1.0018, 1.0, 1.0, 1.0, 1.0, 1.0])
        } else {
            (5, [1.0, 1.0036, 0.9964, 1.0017, 0.9983, 1.0, 1.0])
        };
        let mut s_ph = [0.0_f64; 7];
        let mut s_vib = [0.0_f64; 7];
        let mut s_step = [0.0_f64; 7];
        for d in 0..nv {
            s_ph[d] = rnd.next();
            s_vib[d] = rnd.next();
        }
        let mut sf = Svf::new();
        let mut s_body = Svf::new();
        let mut s_low_body = Svf::new();
        let mut s_air_body = Svf::new();
        s_body.set(sr, body_high, if nasal != 0.0 { 2.1 } else { 1.4 });
        s_low_body.set(sr, body_low, if solo { 1.5 } else { 1.15 });
        if lush {
            s_air_body.set(sr, 2200.0, 1.2);
        }
        let mut s_hp = 0.0_f64;
        let mut oct_ph = 0.0_f64;
        let oct_step = f * 0.5 / sr;
        let s_att = sr * attack * (1.2 - 0.3 * vel);
        let s_rel = sr * release;
        let s_len = (len + s_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let c_hp = 1.0 - (-TWO_PI * 2700.0 / sr).exp();
        let g_s = vel * gain;
        let mut e_scoop = 1.0_f64;
        let d_scoop = (-1.0 / (sr * 0.045)).exp();
        let inv_nv = 1.0 / (nv as f64);
        let nasal_w = if nasal != 0.0 { nasal } else { 0.45 };
        let low_w = if solo { 0.32 } else { 0.16 };
        let vib_delay = if solo { 0.14 } else { 0.22 };
        let sf_q = if solo { 0.85 } else { 0.7 };
        let len_den = len.max(1.0);
        let out = &mut self.scratch[..s_len];

        for i in 0..s_len {
            let fi = i as f64;
            let t = fi / sr;
            let sa = (fi / s_att).min(1.0);
            let vib_d = vib_target * ((t - vib_delay).max(0.0) / 0.35).min(1.0);
            let scoop_fac = if scoop != 0.0 { 1.0 + scoop * e_scoop } else { 1.0 };
            if (i & 31) == 0 {
                let swell_b = if swell != 0.0 {
                    1.0 + swell * (PI * (fi / len_den).min(1.0)).sin()
                } else {
                    1.0
                };
                let fc = (f * (1.7 + (1.1 + 2.5 * vel) * sa) + 380.0 + 400.0 * vel).min(7500.0)
                    * dark
                    * swell_b;
                sf.set(sr, fc, sf_q);
                for d in 0..nv {
                    s_step[d] = f
                        * scoop_fac
                        * s_det[d]
                        * (1.0 + vib_d * sin_t(sin_tab, (5.1 + (d as f64) * 0.23) * t + s_vib[d]))
                        / sr;
                }
            }
            let mut sx = 0.0_f64;
            for d in 0..nv {
                s_ph[d] += s_step[d];
                if s_ph[d] >= 1.0 { s_ph[d] -= 1.0; }
                sx += poly_saw(s_ph[d], s_step[d]);
            }
            sx *= inv_nv;
            if octave != 0.0 {
                oct_ph += oct_step;
                if oct_ph >= 1.0 { oct_ph -= 1.0; }
                sx += sin_t(sin_tab, oct_ph) * octave;
            }
            let sn = rnd.next() * 2.0 - 1.0;
            s_hp += (sn - s_hp) * c_hp;
            sx += (sn - s_hp) * (0.06 + 0.1 * vel) * (1.0 - sa);
            let mut sy = sf.lp(sx);
            s_body.lp(sy);
            sy += s_body.bp * nasal_w;
            s_low_body.lp(sy);
            sy += s_low_body.bp * low_w;
            if lush {
                s_air_body.lp(sy);
                sy += s_air_body.bp * 0.18;
            }
            let mut e = sa * sa * (3.0 - 2.0 * sa);
            if swell != 0.0 {
                e *= 0.82 + 0.28 * (PI * (fi / len_den).min(1.0)).sin();
            }
            if fi > len {
                e *= (1.0 - (fi - len) / s_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (sy * e * g_s) as f32;
            e_scoop *= d_scoop;
        }
        s_len
    }

    // -------------------------------------------------------------------------
    // 6. Electric Piano
    // -------------------------------------------------------------------------
    fn voice_ep(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;

        let bell = p[16];
        let release = p[17];
        let index = p[18];
        let vel_index = p[19];
        let gain = p[20];
        let bell_decay = p[21];
        let ratio = p[22];
        let warmth = p[23];
        let reed = p[24] != 0.0;

        let e_tau = ((if bell != 0.0 { 1.45 } else { 1.1 }) * (261.6 / f).powf(0.45)).clamp(0.5, 2.6);
        let e_rel = sr * release;
        let e_len = (len + e_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let e_i0 = index + vel_index * vel;
        let g = vel * gain;
        let s1 = f / sr;
        let s14 = f * 14.0 / sr;
        let tine_on = f * 14.0 < sr * 0.45;
        let mut ph = 0.0_f64;
        let mut ph2 = 0.0_f64;
        let s_bell7 = f * 7.01 / sr;
        let bell7_on = bell != 0.0 && f * 7.01 < sr * 0.45;
        let mut ph_bell = 0.0_f64;
        let mut amp = 1.0_f64;
        let d_amp = (-1.0 / (sr * e_tau)).exp();
        let mut idx = e_i0;
        let d_idx = (-1.0 / (sr * 0.12)).exp();
        let mut tine = 0.07 * vel;
        let d_tine = (-1.0 / (sr * 0.02)).exp();
        let mut e_bell = bell * (0.65 + 0.55 * vel);
        let d_bell = (-1.0 / (sr * bell_decay)).exp();
        let inv_two_pi = 1.0 / TWO_PI;
        let att_inv = 1.0 / (sr * 0.003);
        let rel_inv = 1.0 / e_rel;
        let gate_fade_inv = 1.0 / gate_fade;
        let trem_step = 4.6 / sr;
        let mut trem_ph = 0.0_f64;
        let has_warmth = warmth != 0.0;
        let has_bell = bell != 0.0;
        let tine_cutoff = 1e-8_f64;
        let out = &mut self.scratch[..e_len];

        for i in 0..e_len {
            let fi = i as f64;
            ph += s1;
            if ph >= 1.0 { ph -= 1.0; }
            let mut e = if fi * att_inv < 1.0 { fi * att_inv } else { 1.0 }
                * amp
                * (0.95 - 0.05 * sin_t_unit(sin_tab, trem_ph));
            trem_ph += trem_step;
            if trem_ph >= 1.0 { trem_ph -= 1.0; }
            if fi > len {
                e *= (1.0 - (fi - len) * rel_inv).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) * gate_fade_inv).min(1.0);
            }
            let e_mod = sin_t_pos(sin_tab, ph * ratio) * (idx + 0.3);
            let carrier_ph = ph + e_mod * inv_two_pi + 16.0;
            let mut e_wave = if carrier_ph >= 0.0 {
                sin_t_pos(sin_tab, carrier_ph)
            } else {
                sin_t(sin_tab, carrier_ph)
            };
            if tine_on && tine > tine_cutoff {
                ph2 += s14;
                if ph2 >= 1.0 { ph2 -= 1.0; }
                e_wave += sin_t_unit(sin_tab, ph2) * tine;
                tine *= d_tine;
            }
            if has_warmth {
                e_wave += sin_t_pos(sin_tab, ph * 2.0) * warmth * amp;
            }
            if has_bell {
                if bell7_on {
                    ph_bell += s_bell7;
                    if ph_bell >= 1.0 { ph_bell -= 1.0; }
                    e_wave += (sin_t_pos(sin_tab, ph * 3.0) * 0.55
                        + sin_t_unit(sin_tab, ph_bell) * 0.45)
                        * e_bell;
                } else {
                    e_wave += sin_t_pos(sin_tab, ph * 3.0) * 0.55 * e_bell;
                }
                e_bell *= d_bell;
            }
            if reed {
                e_wave = e_wave * 0.85
                    + (e_wave / (1.0 + e_wave * e_wave * vel * 1.8).sqrt()) * 0.35;
            }
            unsafe { *out.get_unchecked_mut(i) = (e_wave * e * g) as f32; }
            amp *= d_amp;
            idx *= d_idx;
        }
        e_len
    }

    // -------------------------------------------------------------------------
    // 7. Mallet (SIMD128 f64x2 vectorized modal bank)
    // -------------------------------------------------------------------------
    fn voice_mallet(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;

        let tau_base = p[16];
        let gain = p[17];
        let soft_attack = p[18];
        let tremolo = p[19];
        let n_ratios = (p[20] as usize).min(32);

        let tau = tau_base * (440.0 / f).powf(0.28);
        let release = sr * 0.18;

        let mut re = [0.0_f64; 32];
        let mut im = [0.0_f64; 32];
        let mut co = [1.0_f64; 32];
        let mut si = [0.0_f64; 32];
        let mut amp = [0.0_f64; 32];
        let mut dec = [0.0_f64; 32];
        let mut n_modes = 0usize;

        for h in 0..n_ratios {
            let hz = f * self.extra_f64[h];
            if hz >= sr * 0.45 {
                continue;
            }
            let angle = TWO_PI * hz / sr;
            re[n_modes] = 1.0;
            im[n_modes] = 0.0;
            co[n_modes] = angle.cos();
            si[n_modes] = angle.sin();
            amp[n_modes] =
                self.extra_f64[n_ratios + h] * if h > 0 { 0.45 + 0.8 * vel } else { 1.0 };
            dec[n_modes] = (-1.0 / (sr * tau / (1.0 + 0.35 * (h as f64)))).exp();
            n_modes += 1;
        }

        let limit = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let g_m = vel * gain;
        let att_m = sr * soft_attack;
        let out = &mut self.scratch[..limit];

        for i in 0..limit {
            let fi = i as f64;
            let mut x: f64;
            #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
            unsafe {
                let mut v_sum = f64x2_splat(0.0);
                let mut m = 0usize;
                while m + 1 < n_modes {
                    let v_re = v128_load(re.as_ptr().add(m) as *const v128);
                    let v_im = v128_load(im.as_ptr().add(m) as *const v128);
                    let v_co = v128_load(co.as_ptr().add(m) as *const v128);
                    let v_si = v128_load(si.as_ptr().add(m) as *const v128);
                    let v_amp = v128_load(amp.as_ptr().add(m) as *const v128);
                    let v_dec = v128_load(dec.as_ptr().add(m) as *const v128);
                    let nr = f64x2_sub(f64x2_mul(v_re, v_co), f64x2_mul(v_im, v_si));
                    let ni = f64x2_add(f64x2_mul(v_re, v_si), f64x2_mul(v_im, v_co));
                    v128_store(re.as_mut_ptr().add(m) as *mut v128, nr);
                    v128_store(im.as_mut_ptr().add(m) as *mut v128, ni);
                    v_sum = f64x2_add(v_sum, f64x2_mul(ni, v_amp));
                    v128_store(amp.as_mut_ptr().add(m) as *mut v128, f64x2_mul(v_amp, v_dec));
                    m += 2;
                }
                x = f64x2_extract_lane::<0>(v_sum) + f64x2_extract_lane::<1>(v_sum);
                if m < n_modes {
                    let nr = re[m] * co[m] - im[m] * si[m];
                    let ni = re[m] * si[m] + im[m] * co[m];
                    re[m] = nr;
                    im[m] = ni;
                    x += ni * amp[m];
                    amp[m] *= dec[m];
                }
            }
            #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
            {
                x = 0.0;
                for m in 0..n_modes {
                    let nr = re[m] * co[m] - im[m] * si[m];
                    let ni = re[m] * si[m] + im[m] * co[m];
                    re[m] = nr;
                    im[m] = ni;
                    x += ni * amp[m];
                    amp[m] *= dec[m];
                }
            }
            let mut env = (fi / att_m).min(1.0)
                * (1.0 - tremolo * (0.5 + 0.5 * sin_t(sin_tab, 4.2 * fi / sr)));
            if fi > len {
                env *= (1.0 - (fi - len) / release).max(0.0);
            }
            if fin_gate {
                env *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (x * env * g_m) as f32;
        }
        limit
    }

    // -------------------------------------------------------------------------
    // 8. Drum
    // -------------------------------------------------------------------------
    fn voice_drum(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let vel = p[2];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        // 0=kick, 1=snare, 2=tom, 3=rim, 4=clap, 5=hat, 6=openhat, 7=ride, 8=crash, 9=perc
        let dk = p[16] as u32;
        let pitch = p[17];
        let choke = p[18];
        let fin_choke = choke < 1e14 && choke >= -1e14;

        let cymbal = dk >= 5 && dk <= 8;
        let r_pitch = (pitch + 0.5).floor() as i32;
        let duration = if dk == 9 && (r_pitch == 55 || r_pitch == 81 || r_pitch == 84) {
            0.82
        } else {
            match dk {
                0 => 0.42,
                1 => 0.28,
                2 => 0.48,
                3 => 0.08,
                4 => 0.22,
                5 => 0.085,
                6 => 0.32,
                7 => 0.72,
                8 => 0.85,
                _ => 0.13,
            }
        };
        let count = max_out.min((duration * sr).ceil() as usize);
        let mut noise_filter = Svf::new();
        let mut tone_filter = Svf::new();
        let mut phase = 0.0_f64;
        let mut phase2 = 0.0_f64;
        let cutoff: f64 = if cymbal || (dk == 9 && r_pitch == 55) {
            if dk == 8 || r_pitch == 55 { 7500.0 } else { 6500.0 }
        } else if dk == 0 {
            1800.0
        } else if dk == 4 {
            3300.0
        } else {
            4200.0
        };
        noise_filter.set(sr, cutoff.min(sr * 0.36), 0.707);
        tone_filter.set(
            sr,
            if cymbal || (dk == 9 && r_pitch == 55) {
                1400.0
            } else if dk == 4 {
                650.0
            } else {
                450.0
            },
            0.707,
        );
        let metal_freq = [2137.0, 2873.0, 3593.0, 4217.0, 5279.0, 6343.0];
        let mut metal_phases = [
            rnd.next(),
            rnd.next(),
            rnd.next(),
            rnd.next(),
            rnd.next(),
            rnd.next(),
        ];
        let base = if dk == 2 {
            (110.0 * 2.0_f64.powf((pitch - 43.0) / 24.0)).clamp(70.0, 260.0)
        } else {
            49.0
        };
        let out = &mut self.scratch[..count];

        if !legacy && dk != 4 {
            let inv_sr = 1.0 / sr;
            let att_den = 1.0 / ((if dk == 8 { 0.003 } else { 0.0007 }) * sr);
            let fade_den = 1.0 / (sr * 0.012);
            let (mut e1, mut d1) = (1.0_f64, 1.0_f64);
            let (mut e2, mut d2) = (1.0_f64, 1.0_f64);
            let (mut e3, mut d3) = (1.0_f64, 1.0_f64);
            let (mut e4, mut d4) = (1.0_f64, 1.0_f64);
            let (mut e5, mut d5) = (1.0_f64, 1.0_f64);
            let mut m_env = [0.0_f64; 6];
            let mut m_dec = [0.0_f64; 6];
            let mut m_step = [0.0_f64; 6];
            let mut m_count = 0usize;

            struct BellNote {
                start_i: usize,
                step1: f64,
                step2: f64,
                ph1: f64,
                ph2: f64,
                env: f64,
                dec: f64,
            }
            let mut bell_notes: [BellNote; 8] = core::array::from_fn(|_| BellNote {
                start_i: 0,
                step1: 0.0,
                step2: 0.0,
                ph1: 0.0,
                ph2: 0.0,
                env: 0.0,
                dec: 1.0,
            });
            let mut n_bells = 0usize;

            if dk == 0 {
                d1 = (-inv_sr / 0.016).exp();
                d2 = (-inv_sr / 0.09).exp();
                d3 = (-inv_sr / 0.004).exp();
            } else if dk == 1 {
                d1 = (-inv_sr / 0.012).exp();
                d2 = (-inv_sr / 0.002).exp();
                d3 = (-inv_sr / (0.035 + 0.015 * vel)).exp();
                d4 = (-inv_sr / 0.045).exp();
                d5 = (-inv_sr / 0.003).exp();
            } else if dk == 2 {
                d1 = (-inv_sr / 0.022).exp();
                d2 = (-inv_sr / 0.045).exp();
                d3 = (-inv_sr / 0.11).exp();
                d4 = (-inv_sr / 0.006).exp();
            } else if dk == 3 {
                d1 = (-inv_sr / 0.012).exp();
                d2 = (-inv_sr / 0.002).exp();
            } else if cymbal || (dk == 9 && (r_pitch == 55 || r_pitch == 81)) {
                let c_dec = if r_pitch == 81 {
                    0.24
                } else if dk == 5 {
                    0.018
                } else if dk == 6 {
                    0.07
                } else if dk == 7 {
                    0.18
                } else {
                    0.22
                };
                let tri_freqs = [2420.0, 5670.0, 8140.0];
                let freqs: &[f64] = if r_pitch == 81 { &tri_freqs } else { &metal_freq };
                for mc in 0..freqs.len() {
                    let chz = freqs[mc] * if dk == 7 { 0.74 } else { 1.0 };
                    if chz > sr * 0.43 {
                        continue;
                    }
                    m_env[m_count] = if r_pitch == 81 {
                        if mc == 0 { 0.55 } else if mc == 1 { 0.28 } else { 0.14 }
                    } else {
                        1.0 / 6.0
                    };
                    m_dec[m_count] = if r_pitch == 55 {
                        1.0
                    } else {
                        (-inv_sr / (c_dec * (1.2 - (mc as f64) * 0.13))).exp()
                    };
                    m_step[m_count] = chz * inv_sr;
                    metal_phases[m_count] = if metal_phases[mc] != 0.0 {
                        metal_phases[mc]
                    } else {
                        rnd.next()
                    };
                    m_count += 1;
                }
                d1 = (-inv_sr / (c_dec * 0.62)).exp();
                d2 = (-inv_sr / 0.11).exp();
            } else if dk == 9 && r_pitch == 84 {
                for bk in 0..8 {
                    let bf = 1950.0 * 1.088_f64.powi(bk as i32);
                    if bf > sr * 0.43 {
                        break;
                    }
                    bell_notes[n_bells] = BellNote {
                        start_i: js_round((bk as f64) * 0.068 * sr),
                        step1: bf * inv_sr,
                        step2: if bf * 2.756 < sr * 0.43 { bf * 2.756 * inv_sr } else { 0.0 },
                        ph1: rnd.next(),
                        ph2: rnd.next(),
                        env: 0.072,
                        dec: (-inv_sr / 0.095).exp(),
                    };
                    n_bells += 1;
                }
            } else if dk == 9 && r_pitch == 54 {
                d1 = (-inv_sr / 0.032).exp();
                d2 = (-inv_sr / 0.028).exp();
            } else if dk == 9 && r_pitch == 56 {
                d1 = (-inv_sr / 0.045).exp();
                d2 = (-inv_sr / 0.004).exp();
            } else {
                d1 = (-inv_sr / 0.022).exp();
                d2 = (-inv_sr / 0.009).exp();
            }

            if dk == 0 {
                for fi in 0..count {
                    let f_noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
                    phase += (base + 100.0 * e1) * inv_sr;
                    let f_val = sin_t_pos(sin_tab, phase) * e2 * 0.42 + f_noise * e3 * 0.045;
                    e1 *= d1; e2 *= d2; e3 *= d3;
                    let f_att = ((fi as f64) * att_den).min(1.0);
                    let f_fade = (((count - 1 - fi) as f64) * fade_den).min(1.0);
                    unsafe { *out.get_unchecked_mut(fi) = (f_val * f_att * f_fade * vel) as f32; }
                }
                return count;
            }
            if dk == 1 {
                for fi in 0..count {
                    let f_noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
                    let f_band = f_noise - tone_filter.lp(f_noise);
                    phase += (175.0 + 45.0 * e1) * inv_sr;
                    phase2 += 315.0 * inv_sr;
                    let f_val = (sin_t_pos(sin_tab, phase) * 0.19 + sin_t_pos(sin_tab, phase2) * 0.085) * e4
                        + f_band * (1.0 - e2) * e3 * 0.24
                        + f_noise * e5 * 0.04;
                    e1 *= d1; e2 *= d2; e3 *= d3; e4 *= d4; e5 *= d5;
                    let f_att = ((fi as f64) * att_den).min(1.0);
                    let f_fade = (((count - 1 - fi) as f64) * fade_den).min(1.0);
                    unsafe { *out.get_unchecked_mut(fi) = (f_val * f_att * f_fade * vel) as f32; }
                }
                return count;
            }
            if dk == 2 {
                for fi in 0..count {
                    let f_noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
                    phase += base * (1.0 + 0.28 * e1) * inv_sr;
                    let f_val = (sin_t_pos(sin_tab, phase) * 0.29 + sin_t_pos(sin_tab, phase * 1.59) * e2 * 0.07) * e3
                        + f_noise * e4 * 0.03;
                    e1 *= d1; e2 *= d2; e3 *= d3; e4 *= d4;
                    let f_att = ((fi as f64) * att_den).min(1.0);
                    let f_fade = (((count - 1 - fi) as f64) * fade_den).min(1.0);
                    unsafe { *out.get_unchecked_mut(fi) = (f_val * f_att * f_fade * vel) as f32; }
                }
                return count;
            }
            if cymbal {
                let metal_g = if dk == 7 { 0.12 } else { 0.065 };
                let air_g = if dk == 8 { 0.12 } else { 0.075 };
                let is_ride = dk == 7;
                let is_oh_choke = dk == 6 && fin_choke;
                for fi in 0..count {
                    let ft = (fi as f64) * inv_sr;
                    let f_noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
                    let f_band = f_noise - tone_filter.lp(f_noise);
                    let mut f_metal = 0.0;
                    for fm in 0..m_count {
                        metal_phases[fm] += m_step[fm];
                        f_metal += sin_t_pos(sin_tab, metal_phases[fm]) * m_env[fm];
                        m_env[fm] *= m_dec[fm];
                    }
                    let mut v = f_metal * metal_g + f_band * e1 * air_g;
                    if is_ride {
                        v += sin_t_pos(sin_tab, ft * 1370.0) * e2 * 0.022;
                    }
                    if is_oh_choke {
                        v *= ((choke + 0.009 - ft) / 0.009).clamp(0.0, 1.0);
                    }
                    e1 *= d1; e2 *= d2;
                    let f_att = ((fi as f64) * att_den).min(1.0);
                    let f_fade = (((count - 1 - fi) as f64) * fade_den).min(1.0);
                    unsafe { *out.get_unchecked_mut(fi) = (v * f_att * f_fade * vel) as f32; }
                }
                return count;
            }

            for fi in 0..count {
                let ft = (fi as f64) * inv_sr;
                let f_noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
                let f_band = f_noise - tone_filter.lp(f_noise);
                let f_val: f64;
                if dk == 3 {
                    f_val = (sin_t_pos(sin_tab, ft * 780.0) * 0.15 + sin_t_pos(sin_tab, ft * 1730.0) * 0.09) * e1
                        + f_band * e2 * 0.025;
                    e1 *= d1; e2 *= d2;
                } else if dk == 9 && r_pitch == 55 {
                    let mut sw_metal = 0.0;
                    for sw in 0..m_count {
                        metal_phases[sw] += m_step[sw];
                        sw_metal += sin_t(sin_tab, metal_phases[sw]) * m_env[sw];
                    }
                    let sw_env = if ft < 0.72 {
                        (ft / 0.72).powf(2.3)
                    } else {
                        (1.0 - (ft - 0.72) / 0.09).max(0.0)
                    };
                    f_val = (sw_metal * 0.09 + f_band * 0.105) * sw_env;
                } else if dk == 9 && r_pitch == 81 {
                    let mut tr_metal = 0.0;
                    for tm2 in 0..m_count {
                        metal_phases[tm2] += m_step[tm2];
                        tr_metal += sin_t(sin_tab, metal_phases[tm2]) * m_env[tm2];
                        m_env[tm2] *= m_dec[tm2];
                    }
                    f_val = tr_metal * 0.105;
                } else if dk == 9 && r_pitch == 84 {
                    let mut bl_sum = 0.0;
                    for bi in 0..n_bells {
                        let bn = &mut bell_notes[bi];
                        if fi < bn.start_i {
                            continue;
                        }
                        bn.ph1 += bn.step1;
                        let mut bv = sin_t(sin_tab, bn.ph1);
                        if bn.step2 != 0.0 {
                            bn.ph2 += bn.step2;
                            bv += sin_t(sin_tab, bn.ph2) * 0.34;
                        }
                        bl_sum += bv * bn.env * (((fi - bn.start_i) as f64) / (sr * 0.0012)).min(1.0);
                        bn.env *= bn.dec;
                    }
                    f_val = bl_sum;
                } else if cymbal {
                    let mut f_metal = 0.0;
                    for fm in 0..m_count {
                        metal_phases[fm] += m_step[fm];
                        f_metal += sin_t(sin_tab, metal_phases[fm]) * m_env[fm];
                        m_env[fm] *= m_dec[fm];
                    }
                    let mut v = f_metal * if dk == 7 { 0.12 } else { 0.065 }
                        + f_band * e1 * if dk == 8 { 0.12 } else { 0.075 };
                    if dk == 7 {
                        v += sin_t(sin_tab, ft * 1370.0) * e2 * 0.022;
                    }
                    if dk == 6 && fin_choke {
                        v *= ((choke + 0.009 - ft) / 0.009).clamp(0.0, 1.0);
                    }
                    e1 *= d1; e2 *= d2;
                    f_val = v;
                } else if dk == 9 && r_pitch == 54 {
                    f_val = f_band * e1 * 0.11
                        + (sin_t(sin_tab, ft * 4280.0) + sin_t(sin_tab, ft * 5910.0) * 0.7) * e2 * 0.022;
                    e1 *= d1; e2 *= d2;
                } else if dk == 9 && r_pitch == 56 {
                    f_val = (sin_t(sin_tab, ft * 560.0) + sin_t(sin_tab, ft * 845.0) * 0.75) * e1 * 0.085
                        + f_band * e2 * 0.03;
                    e1 *= d1; e2 *= d2;
                } else {
                    f_val = f_band * e1 * 0.10 + sin_t(sin_tab, ft * 3100.0) * e2 * 0.016;
                    e1 *= d1; e2 *= d2;
                }
                let f_att = ((fi as f64) * att_den).min(1.0);
                let f_fade = (((count - 1 - fi) as f64) * fade_den).min(1.0);
                out[fi] = (f_val * f_att * f_fade * vel) as f32;
            }
            return count;
        }

        // Legacy drum path (and clap in all modes)
        for i in 0..count {
            let t = (i as f64) / sr;
            let noise = noise_filter.lp(rnd.next() * 2.0 - 1.0);
            let band_noise = noise - tone_filter.lp(noise);
            let value: f64;
            if dk == 0 {
                phase += (base + 100.0 * (-t / 0.016).exp()) / sr;
                value = sin_t(sin_tab, phase) * (-t / 0.09).exp() * 0.42
                    + noise * (-t / 0.004).exp() * 0.045;
            } else if dk == 1 {
                phase += (175.0 + 45.0 * (-t / 0.012).exp()) / sr;
                phase2 += 315.0 / sr;
                let wire = (1.0 - (-t / 0.002).exp()) * (-t / (0.035 + 0.015 * vel)).exp();
                value = (sin_t(sin_tab, phase) * 0.19 + sin_t(sin_tab, phase2) * 0.085)
                    * (-t / 0.045).exp()
                    + band_noise * wire * 0.24
                    + noise * (-t / 0.003).exp() * 0.04;
            } else if dk == 2 {
                phase += base * (1.0 + 0.28 * (-t / 0.022).exp()) / sr;
                value = (sin_t(sin_tab, phase) * 0.29
                    + sin_t(sin_tab, phase * 1.59) * (-t / 0.045).exp() * 0.07)
                    * (-t / 0.11).exp()
                    + noise * (-t / 0.006).exp() * 0.03;
            } else if dk == 3 {
                value = (sin_t(sin_tab, t * 780.0) * 0.15 + sin_t(sin_tab, t * 1730.0) * 0.09)
                    * (-t / 0.012).exp()
                    + band_noise * (-t / 0.002).exp() * 0.025;
            } else if dk == 4 {
                let mut bursts = 0.0;
                for b in 0..3 {
                    let dt = t - (b as f64) * 0.009;
                    if dt >= 0.0 {
                        bursts += (1.0 - (-dt / 0.0007).exp()) * (-dt / 0.0035).exp();
                    }
                }
                let tail_t = (t - 0.018).max(0.0);
                value = band_noise
                    * (bursts * 0.42
                        + if t > 0.018 {
                            (1.0 - (-tail_t / 0.002).exp()) * (-tail_t / 0.027).exp() * 0.19
                        } else {
                            0.0
                        });
            } else if cymbal {
                let decay = if dk == 5 {
                    0.018
                } else if dk == 6 {
                    0.07
                } else if dk == 7 {
                    0.18
                } else {
                    0.22
                };
                let mut metal = 0.0;
                for m in 0..6 {
                    let hz = metal_freq[m] * if dk == 7 { 0.74 } else { 1.0 };
                    if hz > sr * 0.43 {
                        continue;
                    }
                    metal_phases[m] += hz / sr;
                    metal += sin_t(sin_tab, metal_phases[m])
                        * (-t / (decay * (1.2 - (m as f64) * 0.13))).exp()
                        / 6.0;
                }
                let air = band_noise * (-t / (decay * 0.62)).exp();
                let mut v = metal * if dk == 7 { 0.12 } else { 0.065 }
                    + air * if dk == 8 { 0.12 } else { 0.075 };
                if dk == 7 {
                    v += sin_t(sin_tab, t * 1370.0) * (-t / 0.11).exp() * 0.022;
                }
                if dk == 6 && fin_choke {
                    v *= ((choke + 0.009 - t) / 0.009).clamp(0.0, 1.0);
                }
                value = v;
            } else if dk == 9 && r_pitch == 54 {
                value = band_noise * (-t / 0.032).exp() * 0.11
                    + (sin_t(sin_tab, t * 4280.0) + sin_t(sin_tab, t * 5910.0) * 0.7)
                        * (-t / 0.028).exp()
                        * 0.022;
            } else if dk == 9 && r_pitch == 56 {
                value = (sin_t(sin_tab, t * 560.0) + sin_t(sin_tab, t * 845.0) * 0.75)
                    * (-t / 0.045).exp()
                    * 0.085
                    + band_noise * (-t / 0.004).exp() * 0.03;
            } else {
                value = band_noise * (-t / 0.022).exp() * 0.10
                    + sin_t(sin_tab, t * 3100.0) * (-t / 0.009).exp() * 0.016;
            }
            let attack = (t / if dk == 8 { 0.003 } else { 0.0007 }).min(1.0);
            let fade = (((count - 1 - i) as f64) / (sr * 0.012)).min(1.0);
            out[i] = (value * attack * fade * vel) as f32;
        }
        count
    }

    // -------------------------------------------------------------------------
    // 9. Synth Pluck (arp)
    // -------------------------------------------------------------------------
    fn voice_synth_pluck(&mut self) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        let mut ph = 0.0_f64;
        let mut ph2 = rnd.next();
        let mut af = Svf::new();
        let a_rel = sr * 0.04;
        let a_len = (len + a_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let a_s = f / sr;
        let a_s2 = f * 1.006 / sr;
        let mut e_env = 1.0_f64;
        let d_env = (-1.0 / (sr * 0.28)).exp();
        let g_a = vel * 0.068;
        let out = &mut self.scratch[..a_len];

        for i in 0..a_len {
            let fi = i as f64;
            let t = fi / sr;
            ph += a_s;
            if ph >= 1.0 { ph -= 1.0; }
            ph2 += a_s2;
            if ph2 >= 1.0 { ph2 -= 1.0; }
            if (i & 15) == 0 {
                af.set(sr, (f * 1.3 + (1500.0 + 5500.0 * vel) * (-t / 0.055).exp()).min(9000.0), 2.4);
            }
            let ax = af.lp(poly_saw(ph, a_s) * 0.6 + pulse(ph2, 0.5, a_s2) * 0.4);
            let mut e = (fi / (sr * 0.002)).min(1.0)
                * if legacy { (-t / 0.28).exp() } else { e_env };
            e_env *= d_env;
            if fi > len {
                e *= (1.0 - (fi - len) / a_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (ax * e * g_a) as f32;
        }
        a_len
    }

    // -------------------------------------------------------------------------
    // 10. Lead
    // -------------------------------------------------------------------------
    fn voice_lead(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let legacy = p[8] != 0.0;

        let mut p0 = 0.0_f64;
        let mut p1 = 0.23_f64;
        let mut filter = Svf::new();
        let release = sr * 0.085;
        let limit = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let attack = (sr * 0.018).min(len * 0.25).max(1.0);
        let g_l = vel * 0.13;
        let mut e_scoop = 1.0_f64;
        let d_scoop = (-1.0 / (sr * 0.025)).exp();
        let mut e_body = 1.0_f64;
        let d_body = (-1.0 / (sr * 0.18)).exp();
        let out = &mut self.scratch[..limit];

        for i in 0..limit {
            let fi = i as f64;
            let t = fi / sr;
            let vib_s = if legacy { (TWO_PI * 5.2 * t).sin() } else { sin_t(sin_tab, 5.2 * t) };
            let vibrato = 0.0028 * ((t - 0.22).max(0.0) / 0.25).min(1.0) * vib_s;
            let scoop = if legacy { (-t / 0.025).exp() } else { e_scoop };
            let step = f * (1.0 - 0.009 * scoop + vibrato) / sr;
            let detune = step * 1.002;
            p0 = wrap01_fast(p0 + step);
            p1 = wrap01_fast(p1 + detune);
            if (i & 15) == 0 {
                filter.set(sr, (f * (2.5 + 2.0 * vel) + 900.0 * (-t / 0.12).exp()).min(6500.0), 0.8);
            }
            let pwm_mod = if legacy { (TWO_PI * 0.7 * t).sin() } else { sin_t_pos(sin_tab, 0.7 * t) };
            let x = pulse(p0, 0.42 + 0.025 * pwm_mod, step) * 0.48
                + poly_saw(p1, detune) * 0.32
                + sin_t_unit(sin_tab, p0) * 0.3;
            let mut env = (fi / attack).min(1.0)
                * (0.82 + 0.18 * if legacy { (-t / 0.18).exp() } else { e_body });
            e_scoop *= d_scoop;
            e_body *= d_body;
            if fi > len {
                env *= (1.0 - (fi - len) / release).max(0.0);
            }
            if fin_gate {
                env *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (filter.lp(x) * env * g_l) as f32;
        }
        limit
    }

    // -------------------------------------------------------------------------
    // 11. Organ
    // -------------------------------------------------------------------------
    fn voice_organ(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let oh = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
        let oa = [0.42, 1.0, 0.5, 0.48, 0.28, 0.22];
        let mut o_ph = [0.0_f64; 6];
        let mut o_s = [0.0_f64; 6];
        let mut o_d = [0.0_f64; 6];
        let mut nh = 0usize;
        for h in 0..6 {
            if f * oh[h] < sr * 0.45 {
                o_s[nh] = f * oh[h] / sr;
                o_d[nh] = 0.0009 * oh[h];
                nh += 1;
            }
        }
        let mut perc = 0.55_f64;
        let d_perc = (-1.0 / (sr * 0.18)).exp();
        let g = vel * 0.05;
        let o_rel = sr * 0.05;
        let o_len = (len + o_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let mut o_click = 0.0_f64;
        let click_end = sr * 0.004;
        let out = &mut self.scratch[..o_len];

        for i in 0..o_len {
            let fi = i as f64;
            let o_rot = sin_t(sin_tab, 6.3 * fi / sr);
            let mut ox = 0.0_f64;
            for h in 0..nh {
                o_ph[h] += o_s[h] * (1.0 + o_d[h] * o_rot);
                if o_ph[h] >= 1.0 { o_ph[h] -= 1.0; }
                let w = if h == 4 { oa[h] + perc } else { oa[h] };
                ox += sin_t(sin_tab, o_ph[h]) * w;
            }
            perc *= d_perc;
            if fi < click_end {
                o_click += ((rnd.next() * 2.0 - 1.0) - o_click) * 0.5;
                ox += o_click * 0.5 * (1.0 - fi / click_end);
            }
            let mut e = (fi / (sr * 0.005)).min(1.0) * (1.0 + 0.1 * o_rot);
            if fi > len {
                e *= (1.0 - (fi - len) / o_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (ox * e * g) as f32;
        }
        o_len
    }

    // -------------------------------------------------------------------------
    // 12. Brass
    // -------------------------------------------------------------------------
    fn voice_brass(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        let mut ph = 0.0_f64;
        let mut ph2 = rnd.next();
        let mut br_f = Svf::new();
        let br_rel = sr * 0.08;
        let br_len = (len + br_rel)
            .min(if fin_gate { gate } else { 1e15 })
            .min(max_out as f64) as usize;
        let mut br_s = f / sr;
        let g_br = vel * 0.072;
        let mut e_br = 1.0_f64;
        let d_br = (-1.0 / (sr * 0.2)).exp();
        let out = &mut self.scratch[..br_len];

        for i in 0..br_len {
            let fi = i as f64;
            let t = fi / sr;
            let br_a = (t / 0.045).min(1.0);
            if (i & 15) == 0 {
                let cents = -30.0 * (-t / 0.03).exp()
                    + 14.0 * ((t - 0.3).max(0.0) / 0.3).min(1.0) * sin_t(sin_tab, 5.2 * t);
                let br_p = f * 2.0_f64.powf(cents / 1200.0);
                br_s = br_p / sr;
                let fc = (br_p * (1.2 + (1.8 + 3.5 * vel) * br_a * (0.7 + 0.3 * (-t / 0.15).exp()))
                    + 150.0)
                    .min(8000.0);
                br_f.set(sr, fc, 1.1);
            }
            ph += br_s;
            if ph >= 1.0 { ph -= 1.0; }
            ph2 += br_s * 1.004;
            if ph2 >= 1.0 { ph2 -= 1.0; }
            let br_x = br_f.lp(poly_saw(ph, br_s) + poly_saw(ph2, br_s * 1.004) * 0.6);
            let mut e = br_a * (0.82 + 0.18 * if legacy { (-t / 0.2).exp() } else { e_br });
            e_br *= d_br;
            if fi > len {
                e *= (1.0 - (fi - len) / br_rel).max(0.0);
            }
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (br_x * e * g_br) as f32;
        }
        br_len
    }

    // -------------------------------------------------------------------------
    // 13. Choir
    // -------------------------------------------------------------------------
    fn voice_choir(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let fmts = [p[16], p[17], p[18]];
        let wts = [p[19], p[20], p[21]];
        let attack_s = p[22];
        let release_s = p[23];
        let gain = p[24];
        let air_amt = p[25];

        let mut phases = [rnd.next(), rnd.next(), rnd.next()];
        let detunes = [0.9985, 1.0, 1.0015];
        let mut formants = [Svf::new(), Svf::new(), Svf::new()];
        formants[0].set(sr, fmts[0], 2.4);
        formants[1].set(sr, fmts[1], 3.2);
        formants[2].set(sr, fmts[2], 3.2);
        let attack = sr * attack_s;
        let release = sr * release_s;
        let limit = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let g_c = vel * gain;
        let c_air = if air_amt != 0.0 {
            1.0 - (-TWO_PI * 1600.0 / sr).exp()
        } else {
            0.0
        };
        let mut air_lp = 0.0_f64;
        let out = &mut self.scratch[..limit];

        for i in 0..limit {
            let fi = i as f64;
            let t = fi / sr;
            let mut x = 0.0_f64;
            for j in 0..3 {
                let jf = j as f64;
                let step = f
                    * detunes[j]
                    * (1.0 + 0.001 * sin_t_pos(sin_tab, t * (4.8 + jf * 0.2) + jf * 0.31))
                    / sr;
                phases[j] = wrap01_fast(phases[j] + step);
                x += poly_saw(phases[j], step) * (1.0 / 3.0);
            }
            let mut y = sin_t_unit(sin_tab, phases[1]) * 0.28;
            for j in 0..3 {
                formants[j].lp(x);
                y += formants[j].bp * wts[j];
            }
            if air_amt != 0.0 {
                let cn = rnd.next() * 2.0 - 1.0;
                air_lp += (cn - air_lp) * c_air;
                y += (cn - air_lp) * air_amt;
            }
            let mut env = (fi / attack).min(1.0);
            if fi > len {
                env *= (1.0 - (fi - len) / release).max(0.0);
            }
            if fin_gate {
                env *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (y * env * g_c) as f32;
        }
        limit
    }

    // -------------------------------------------------------------------------
    // 14. Woodwind
    // -------------------------------------------------------------------------
    fn voice_woodwind(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let attack = sr * p[16];
        let release = sr * p[17];
        let noise_amt = p[18];
        let gain = p[19];
        let vib_amp = p[20];
        let n_harm_in = p[21] as usize;

        let limit = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let nh = n_harm_in.min(((sr * 0.45 / f).floor().max(0.0)) as usize);
        let mut phase = 0.0_f64;
        let mut noise_lp = 0.0_f64;
        let mut noise_tone = Svf::new();
        noise_tone.set(sr, (f * 3.0 + 1500.0).min(4800.0), 0.8);
        let c_air = 1.0 - (-TWO_PI * 1400.0 / sr).exp();
        let g_w = vel * gain;
        let harm_scale = 0.6 + 0.65 * vel;
        let noise_gain = noise_amt * (0.8 + 0.4 * vel);
        let out = &mut self.scratch[..limit];
        let harms = &self.extra_f64[..nh];

        for i in 0..limit {
            let fi = i as f64;
            let t = fi / sr;
            let vib = vib_amp * ((t - 0.25).max(0.0) / 0.3).min(1.0) * sin_t_pos(sin_tab, t * 5.05);
            phase = wrap01_fast(phase + f * (1.0 + vib) / sr);
            let mut x = 0.0_f64;
            for h in 0..nh {
                let w = if h > 0 { harms[h] * harm_scale } else { harms[h] };
                x += sin_t_pos(sin_tab, phase * ((h + 1) as f64)) * w;
            }
            let air = rnd.next() * 2.0 - 1.0;
            noise_lp += (air - noise_lp) * c_air;
            x += noise_tone.lp(air - noise_lp) * noise_gain;
            let mut env = (fi / attack).min(1.0) * (0.95 + 0.025 * sin_t(sin_tab, t * 0.8));
            if fi > len {
                env *= (1.0 - (fi - len) / release).max(0.0);
            }
            if fin_gate {
                env *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (x * env * g_w) as f32;
        }
        limit
    }

    // -------------------------------------------------------------------------
    // 15. Accordion
    // -------------------------------------------------------------------------
    fn voice_accordion(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let max_out = p[6] as usize;
        let legacy = p[8] != 0.0;

        let mut ph = 0.0_f64;
        let mut ph2 = 0.0_f64;
        let mut ph3 = 0.0_f64;
        let mut a_lp = 0.0_f64;
        let acc_len = max_out.min(len as usize);
        let a_cut = 1450.0 + f * (0.85 + 0.5 * vel);
        let c_acc = 1.0 - (-TWO_PI * a_cut.min(sr * 0.4) / sr).exp();
        let g_acc = vel * 0.06;
        let s1 = f / sr;
        let s2 = f * 1.0058 / sr;
        let s3 = f * 0.5 / sr;
        let out = &mut self.scratch[..acc_len];

        for i in 0..acc_len {
            let fi = i as f64;
            let t = fi / sr;
            ph += s1;
            if ph >= 1.0 { ph -= 1.0; }
            ph2 += s2;
            if ph2 >= 1.0 { ph2 -= 1.0; }
            ph3 += s3;
            if ph3 >= 1.0 { ph3 -= 1.0; }
            let reed = poly_saw(ph, s1) * 0.6
                + pulse(ph, 0.3, s1) * 0.5
                + poly_saw(ph2, s2) * 0.6
                + pulse(ph2, 0.3, s2) * 0.5
                + poly_saw(ph3, s3) * 0.35;
            a_lp += (reed - a_lp) * c_acc;
            let trem = if legacy { (TWO_PI * 4.5 * t).sin() } else { sin_t(sin_tab, 4.5 * t) };
            let e = (fi / (sr * 0.025)).min(1.0)
                * ((len - fi) / (sr * 0.03)).min(1.0)
                * (0.92 + 0.08 * trem);
            out[i] = (a_lp * e * g_acc) as f32;
        }
        acc_len
    }

    // -------------------------------------------------------------------------
    // 16. Tuba
    // -------------------------------------------------------------------------
    fn voice_tuba(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);
        let legacy = p[8] != 0.0;

        let mut ph = 0.0_f64;
        let mut tu_air = 0.0_f64;
        let mut tu_drift = 0.0_f64;
        let tu_phase = rnd.next();
        let mut tu_step = f / sr;
        let tu_attack = (len / sr * 0.28).min(0.055);
        let tu_release = sr * 0.065;
        let tu_len = (max_out as f64)
            .min(len + tu_release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let tu_count = 20usize.min(((sr * 0.44 / (f * 1.015)).floor().max(0.0)) as usize);
        let mut tu_weights = [0.0_f64; 21];
        for j in 1..=tu_count {
            let jf = j as f64;
            let tu_hz = jf * f;
            let d = (tu_hz - 420.0) / 280.0;
            let r = tu_hz / 1800.0;
            let r2 = r * r;
            tu_weights[j] = jf.powf(-1.35) * (1.0 + 0.6 * (-d * d).exp()) / (1.0 + r2 * r2).sqrt();
        }
        let mut tu_bright = 0.0_f64;
        let c_tu_air = 1.0 - (-TWO_PI * 900.0 / sr).exp();
        let g_tu = vel * 0.075;
        let mut e_tu1 = 1.0_f64;
        let d_tu1 = (-1.0 / (sr * 0.18)).exp();
        let mut e_tu2 = 1.0_f64;
        let d_tu2 = (-1.0 / (sr * 0.045)).exp();
        let out = &mut self.scratch[..tu_len];

        for i in 0..tu_len {
            let fi = i as f64;
            let t = fi / sr;
            let mut tu_rise = (t / tu_attack).min(1.0);
            tu_rise *= tu_rise * (3.0 - 2.0 * tu_rise);
            let tu_off = (1.0 - (fi - len).max(0.0) / tu_release).max(0.0);
            if (i & 31) == 0 {
                tu_drift += (rnd.next() * 2.0 - 1.0 - tu_drift) * 0.07;
                let tu_cents = -9.0 * (-t / 0.025).exp()
                    + tu_drift * 3.0
                    + 2.5 * ((t - 0.25).max(0.0) / 0.35).min(1.0)
                        * sin_t(sin_tab, t * 4.7 + tu_phase);
                tu_step = f / sr * 2.0_f64.powf(tu_cents / 1200.0);
                tu_bright = (0.38 + 0.42 * vel) * (0.65 + 0.35 * tu_rise) * (0.75 + 0.25 * tu_off);
            }
            ph += tu_step;
            ph -= ph.floor();
            let mut tu_tone = 0.0_f64;
            let mut tu_roll = 1.0_f64;
            for j in 1..=tu_count {
                tu_tone += tu_weights[j] * tu_roll * sin_t(sin_tab, ph * (j as f64));
                tu_roll *= tu_bright;
            }
            tu_air += ((rnd.next() * 2.0 - 1.0) - tu_air) * c_tu_air;
            let mut e = tu_rise
                * tu_off
                * tu_off
                * (0.93 + 0.07 * if legacy { (-t / 0.18).exp() } else { e_tu1 })
                * (1.0 + 0.009 * sin_t(sin_tab, t * 1.8 + tu_phase));
            if fin_gate {
                e *= ((gate - fi) / gate_fade).min(1.0);
            }
            let air_e = 0.012 + 0.025 * if legacy { (-t / 0.045).exp() } else { e_tu2 };
            out[i] = ((tu_tone + tu_air * air_e) * e * g_tu) as f32;
            e_tu1 *= d_tu1;
            e_tu2 *= d_tu2;
        }
        tu_len
    }

    // -------------------------------------------------------------------------
    // 17. Electronic
    // -------------------------------------------------------------------------
    fn voice_electronic(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let gate = p[4];
        let fin_gate = gate < 1e14 && gate >= 0.0;
        let gate_fade = p[5];
        let max_out = p[6] as usize;
        let mut rnd = Mulberry32::new(p[7] as u32);

        let release_s = p[16];
        let base_cutoff = p[17];
        let attack = p[18];
        let decay = p[19];
        let sustain = p[20];
        let filter_attack = p[21];
        let filter_decay = p[22];
        let filter_sustain = p[23];
        let keytrack = p[24];
        let sweep = p[25];
        let motion = p[26];
        let rate = p[27];
        let random_rate = p[28];
        let random_depth = p[29];
        let q = p[30];
        let pwm = p[31];
        let serial = p[32] != 0.0;
        let gain = p[33];
        let has_formants = p[34] != 0.0;
        let formant_env = p[35] != 0.0;
        let fmts = [[p[36], p[37]], [p[38], p[39]]];
        let n_oscs = (p[40] as usize).min(3);

        let mut phases = [rnd.next(), rnd.next(), rnd.next()];
        let mut filters = [Svf::new(), Svf::new()];
        let release = sr * release_s;
        let end = (max_out as f64)
            .min(len + release)
            .min(if fin_gate { gate } else { 1e15 }) as usize;
        let mut cutoff = base_cutoff;
        let lfo_phase = rnd.next();
        let mut color_filters = [Svf::new(), Svf::new()];
        let mut random_step: i64 = -1;
        let mut random_target = 0.0_f64;
        let mut random_color = 0.0_f64;
        let c_rand = 1.0 - (-1.0 / (sr * 0.008)).exp();
        let c_cut = 1.0 - (-1.0 / (sr * 0.003)).exp();

        let mut osc_wave = [0u8; 3];
        let mut osc_step = [0.0_f64; 3];
        let mut osc_gain = [0.0_f64; 3];
        for k in 0..n_oscs {
            let base = k * 4;
            osc_wave[k] = self.extra_f64[base] as u8;
            let ratio = self.extra_f64[base + 1];
            let cents = self.extra_f64[base + 2];
            osc_gain[k] = self.extra_f64[base + 3];
            osc_step[k] = (f * ratio * 2.0_f64.powf(cents / 1200.0) / sr).min(0.44);
        }

        let envelope = |t: f64, att: f64, dec: f64, sus: f64| -> f64 {
            if t < att {
                let a = t / att;
                a * a * (3.0 - 2.0 * a)
            } else {
                sus + (1.0 - sus) * (-(t - att) / dec).exp()
            }
        };
        let len_sec = len / sr;
        let off_level = envelope(len_sec, attack, decay, sustain);
        let g_e = vel * gain;
        let out = &mut self.scratch[..end];

        for i in 0..end {
            let fi = i as f64;
            let t = fi / sr;
            let lfo = sin_t(sin_tab, t * rate + lfo_phase);
            if random_rate != 0.0 {
                let tick = (t * random_rate).floor() as i64;
                if tick != random_step {
                    random_step = tick;
                    random_target = rnd.next() * 2.0 - 1.0;
                }
                random_color += (random_target - random_color) * c_rand;
            }
            let mut amp = if fi < len {
                envelope(t, attack, decay, sustain)
            } else {
                let r = (1.0 - (fi - len) / release).max(0.0);
                off_level * r * r
            };
            let mut fe = envelope(t.min(len_sec), filter_attack, filter_decay, filter_sustain);
            if fi >= len {
                fe *= (1.0 - (fi - len) / release).max(0.0);
            }
            let target = (base_cutoff + f * keytrack)
                * 2.0_f64.powf(fe * sweep * (0.35 + 0.65 * vel) + motion * lfo + random_color * random_depth);
            cutoff += (target - cutoff) * c_cut;
            if (i & 7) == 0 {
                let fc = cutoff.min(sr * 0.2);
                filters[0].set(sr, fc, q);
                filters[1].set(sr, fc, 0.707);
            }
            let mut value = 0.0_f64;
            for k in 0..n_oscs {
                let step = osc_step[k];
                phases[k] = wrap01_fast(phases[k] + step);
                let w = match osc_wave[k] {
                    1 => sin_t_unit(sin_tab, phases[k]),
                    2 => pulse(phases[k], 0.5 + pwm * lfo, step),
                    _ => poly_saw(phases[k], step),
                };
                value += osc_gain[k] * w;
            }
            value = filters[0].lp(value);
            if serial {
                value = filters[1].lp(value);
            }
            if has_formants {
                let mouth = if formant_env { fe } else { (lfo + 1.0) * 0.5 };
                let mut colored = 0.0;
                for band in 0..2 {
                    if (i & 7) == 0 {
                        color_filters[band].set(
                            sr,
                            fmts[band][0] + (fmts[band][1] - fmts[band][0]) * mouth,
                            3.0,
                        );
                    }
                    color_filters[band].lp(value);
                    colored += color_filters[band].bp / 3.0;
                }
                value = value * 0.25 + colored * 1.8;
            }
            if fin_gate {
                amp *= ((gate - fi) / gate_fade).min(1.0);
            }
            out[i] = (value * amp * g_e) as f32;
        }
        end
    }

    // -------------------------------------------------------------------------
    // 18. Chip
    // -------------------------------------------------------------------------
    fn voice_chip(&mut self, sin_tab: &[f64; 2049]) -> usize {
        let p = &self.params;
        let sr = p[0];
        let f = p[1];
        let vel = p[2];
        let len = p[3];
        let max_out = p[6] as usize;
        let legacy = p[8] != 0.0;

        // 0=chipNoise, 1=chipKick, 2=chipTom, 3=chipTriangle, 4=chipTable,
        // 5=chipHybrid, 6=chipSaw, 7=chipPWM, 8=chipPulse12, 9=chipPulse25,
        // 10=chipPulse50/chipPulse, 11=chipPulse75, 12=chipPulse87, 13=chipArp
        let ck = p[16] as u32;
        let start_s = p[17];
        let note_idx = p[18] as usize;
        let drum_k = p[19] as u32; // 0=snare, 1=hat, 2=openhat, 3=rim, 4=crash/ride, 5=perc
        let pwm_lead = p[20] != 0.0;
        let tom_base_hz = p[21]; // precomputed mtof(pitch - 9)
        let n_tones = (p[22] as usize).clamp(1, 4);
        let tone_hz = [p[23], p[24], p[25], p[26]];

        let chip_len = max_out.min(len as usize);
        let chip_noise = ck == 0;
        let chip_kick = ck == 1 || ck == 2;
        let mut ph = if chip_noise || chip_kick {
            0.0
        } else {
            (f * start_s / sr) % 1.0
        };
        let mut lfsr: u32 = 1 + ((note_idx * 127) % 32766) as u32;
        let mut noise_clock = 0.0_f64;
        let noise_hz: f64 = match drum_k {
            1 | 2 => 13000.0,
            3 => 7000.0,
            _ => 5500.0,
        };
        let decay = match drum_k {
            1 => 0.025,
            2 => 0.09,
            4 => 0.24,
            _ => 0.065,
        };
        let pwm_rate = if pwm_lead { 2.6 } else { 1.3 };
        let pwm_phase = ((note_idx as f64) * 0.37) % 1.0;

        let mut chip_table = [0.0_f64; 32];
        if ck == 4 {
            for idx in 0..32 {
                let angle = TWO_PI * (idx as f64) / 32.0;
                let mut wave = angle.sin();
                if f * 2.0 < sr * 0.45 { wave += 0.38 * (angle * 2.0 + 0.3).sin(); }
                if f * 3.0 < sr * 0.45 { wave += 0.22 * (angle * 3.0).sin(); }
                if f * 5.0 < sr * 0.45 { wave += 0.1 * (angle * 5.0).sin(); }
                chip_table[idx] = (wave / 1.7 * 127.0).round() / 127.0;
            }
        }

        let chip_gain = if chip_noise {
            0.09
        } else if chip_kick {
            0.25
        } else if ck == 3 || ck == 5 {
            0.15
        } else if ck == 13 {
            0.14
        } else if pwm_lead {
            0.105
        } else if ck == 7 {
            0.085
        } else {
            0.072
        };

        let env_tau = if chip_noise {
            decay
        } else if chip_kick {
            0.085
        } else {
            0.12
        };
        let mut e_chip = 1.0_f64;
        let d_chip = (-1.0 / (sr * env_tau)).exp();
        let kick_tau = if ck == 1 { 0.018 } else { 0.025 };
        let mut e_kick_f = 1.0_f64;
        let d_kick_f = (-1.0 / (sr * kick_tau)).exp();
        let lfsr_shift = if drum_k == 5 { 6 } else { 1 };
        let out = &mut self.scratch[..chip_len];

        for i in 0..chip_len {
            let fi = i as f64;
            let t = fi / sr;
            let mut frequency = if ck == 13 {
                tone_hz[((t * 50.0).floor() as usize) % n_tones]
            } else {
                f
            };
            if pwm_lead {
                frequency *= 1.0 + 0.011 * ((t - 0.15).max(0.0) / 0.2).min(1.0) * sin_t(sin_tab, 5.6 * t);
            }
            if chip_kick {
                let kf_env = if legacy { (-t / kick_tau).exp() } else { e_kick_f };
                frequency = if ck == 1 {
                    42.0 + 155.0 * kf_env
                } else {
                    tom_base_hz * (1.0 + 0.7 * kf_env)
                };
                e_kick_f *= d_kick_f;
            }
            let step = (frequency / sr).min(0.42);
            ph += step;
            if ph >= 1.0 { ph -= 1.0; }
            let value = if chip_noise {
                noise_clock += noise_hz.min(sr * 0.8) / sr;
                while noise_clock >= 1.0 {
                    let fb = (lfsr ^ (lfsr >> lfsr_shift)) & 1;
                    lfsr = (lfsr >> 1) | (fb << 14);
                    noise_clock -= 1.0;
                }
                if (lfsr & 1) != 0 { 1.0 } else { -1.0 }
            } else if ck == 3 || chip_kick {
                let p_tri = if chip_kick { ph } else { wrap01_fast(ph + 0.5) };
                let tri_step = (p_tri * 32.0).floor();
                let s = if tri_step < 16.0 { tri_step } else { 31.0 - tri_step };
                s / 7.5 - 1.0
            } else if ck == 4 {
                let tpos = wrap01_fast(ph + 0.25) * 32.0;
                let tidx = tpos.floor() as usize;
                let mix = tpos - (tidx as f64);
                chip_table[tidx] * (1.0 - mix) + chip_table[(tidx + 1) & 31] * mix
            } else if ck == 5 {
                poly_saw(wrap01_fast(ph + 0.75), step) * 0.55
                    + pulse(wrap01_fast(ph + 0.125), 0.25, step) * 0.45
            } else if ck == 6 {
                poly_saw(wrap01_fast(ph + 0.75), step)
            } else {
                let width = match ck {
                    7 => 0.29 + 0.21 * tri(pwm_rate * t + pwm_phase),
                    8 => 0.125,
                    9 => 0.25,
                    11 => 0.75,
                    12 => 0.875,
                    _ => 0.5,
                };
                pulse(wrap01_fast(ph + width * 0.5), width, step)
            };
            let mut e = (fi / (sr * 0.003)).min(1.0) * ((len - fi) / (sr * 0.008)).min(1.0);
            let c_env = if legacy { (-t / env_tau).exp() } else { e_chip };
            e_chip *= d_chip;
            if chip_noise || chip_kick {
                e *= c_env;
            } else if ck != 3 {
                e *= 0.72 + 0.28 * c_env;
            }
            out[i] = (value * e * vel * chip_gain) as f32;
        }
        chip_len
    }
}

#[inline(always)]
fn mix_stereo_pair(src: &[f32], dst_l: &mut [f32], dst_r: &mut [f32], gl: f32, gr: f32) {
    let n = src.len();
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    unsafe {
        let v_gl = f32x4_splat(gl);
        let v_gr = f32x4_splat(gr);
        let mut i = 0usize;
        while i + 3 < n {
            let v_s = v128_load(src.as_ptr().add(i) as *const v128);
            let v_l = v128_load(dst_l.as_ptr().add(i) as *const v128);
            let v_r = v128_load(dst_r.as_ptr().add(i) as *const v128);
            v128_store(
                dst_l.as_mut_ptr().add(i) as *mut v128,
                f32x4_add(v_l, f32x4_mul(v_s, v_gl)),
            );
            v128_store(
                dst_r.as_mut_ptr().add(i) as *mut v128,
                f32x4_add(v_r, f32x4_mul(v_s, v_gr)),
            );
            i += 4;
        }
        while i < n {
            let s = *src.get_unchecked(i);
            *dst_l.get_unchecked_mut(i) += s * gl;
            *dst_r.get_unchecked_mut(i) += s * gr;
            i += 1;
        }
    }
    #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
    {
        for i in 0..n {
            let s = src[i];
            dst_l[i] += s * gl;
            dst_r[i] += s * gr;
        }
    }
}
