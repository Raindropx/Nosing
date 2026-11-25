use core::f64::consts::{LN_10, LN_2, PI};
use crate::fft::out_eq_db_at;
use crate::filters::{hpc_coeffs, RateConst};

pub const LOG10_OVER_20: f64 = LN_10 / 20.0;
pub const LOG10_OVER_10: f64 = LN_10 / 10.0;
pub const PITCH_EXP: f64 = -0.5;

pub const REFINE_BODY: &[(f64, f64)] = &[
    (2000.0, 0.0), (3000.0, -0.02), (4000.0, -0.25), (5000.0, -0.65),
    (6000.0, -1.3), (7000.0, -3.8), (8000.0, -4.6), (12000.0, -4.7),
    (16000.0, -6.0), (20000.0, -10.3),
];
pub const REFINE_CORE: &[(f64, f64)] = &[
    (6000.0, -3.0), (8000.0, -5.8), (12000.0, -6.2), (16000.0, -7.5), (20000.0, -11.0),
];
pub const REFINE_FRICTION: &[(f64, f64)] = &[
    (2000.0, 0.0), (3000.0, -0.02), (4000.0, -0.2), (5000.0, -0.65),
    (6000.0, -1.1), (7000.0, -3.1), (8000.0, -4.4), (12000.0, -4.6),
    (16000.0, -7.0), (20000.0, -11.0),
];

#[inline]
pub fn refine_db(anchors: &[(f64, f64)], hz: f64) -> f64 {
    if hz <= anchors[0].0 {
        return anchors[0].1;
    }
    for i in 1..anchors.len() {
        if hz <= anchors[i].0 {
            let mut x = (hz / anchors[i - 1].0).ln() / (anchors[i].0 / anchors[i - 1].0).ln();
            x = x * x * (3.0 - 2.0 * x);
            return anchors[i - 1].1 + x * (anchors[i].1 - anchors[i - 1].1);
        }
    }
    anchors[anchors.len() - 1].1
}

pub fn build_refine_curve(anchors: &[(f64, f64)]) -> [f64; 64] {
    let mut out = [0.0_f64; 64];
    for i in 0..64 {
        let hz = 50.0 * 400.0_f64.powf((i as f64) / 63.0);
        out[i] = refine_db(anchors, hz);
    }
    out
}

#[derive(Clone)]
pub struct Mulberry32 {
    a: u32,
}

impl Mulberry32 {
    #[inline(always)]
    pub fn new(seed: u32) -> Self {
        Self { a: seed }
    }

    #[inline(always)]
    pub fn next(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6D2B79F5);
        let mut t = (self.a ^ (self.a >> 15)).wrapping_mul(1 | self.a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        ((t ^ (t >> 14)) as f64) * (1.0 / 4294967296.0)
    }
}

pub struct GlottalParams {
    pub has_gl: bool,
    pub b0: f64, pub b1: f64, pub b2: f64,
    pub a0: f64, pub a1: f64, pub a2: f64,
    pub has_source_eq: bool,
    pub source_eq: [f64; 32],
    pub has_out_eq: bool,
    pub out_eq_len: usize,
    pub out_eq: [f64; 64],
    pub tail_db: f64,
}

impl GlottalParams {
    pub fn new(
        sr: f64,
        has_gl: bool,
        gl_f: f64,
        gl_bw: f64,
        gl_db: f64,
        has_source_eq: bool,
        source_eq: &[f64],
        has_out_eq: bool,
        out_eq: &[f64],
        tail_db: f64,
    ) -> Self {
        let (mut b0, mut b1, mut b2, mut a0, mut a1, mut a2) = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if has_gl {
            let cap_a = 10.0_f64.powf(gl_db / 40.0);
            let w0 = 2.0 * PI * gl_f / sr;
            let q = (gl_f / gl_bw).max(0.3);
            let alpha = w0.sin() / (2.0 * q);
            let c0 = -2.0 * w0.cos();
            b0 = 1.0 + alpha * cap_a; b1 = c0; b2 = 1.0 - alpha * cap_a;
            a0 = 1.0 + alpha / cap_a; a1 = c0; a2 = 1.0 - alpha / cap_a;
        }
        let mut seq = [0.0; 32];
        if has_source_eq {
            let n = source_eq.len().min(32);
            seq[..n].copy_from_slice(&source_eq[..n]);
        }
        let mut oeq = [0.0; 64];
        let oeq_len = if has_out_eq { out_eq.len().min(64) } else { 0 };
        if oeq_len > 0 {
            oeq[..oeq_len].copy_from_slice(&out_eq[..oeq_len]);
        }
        Self {
            has_gl, b0, b1, b2, a0, a1, a2,
            has_source_eq, source_eq: seq,
            has_out_eq: oeq_len > 0, out_eq_len: oeq_len, out_eq: oeq,
            tail_db,
        }
    }

    #[inline]
    pub fn source_db_at(&self, hz: f64, sr: f64) -> f64 {
        let mut base = 0.0;
        if self.has_gl {
            let w = 2.0 * PI * hz / sr;
            let c1 = w.cos();
            let s1 = w.sin();
            let c2 = c1 * c1 - s1 * s1;
            let s2 = 2.0 * c1 * s1;
            let nr = self.b0 + self.b1 * c1 + self.b2 * c2;
            let ni = -(self.b1 * s1 + self.b2 * s2);
            let dr = self.a0 + self.a1 * c1 + self.a2 * c2;
            let di = -(self.a1 * s1 + self.a2 * s2);
            let ratio_sq = (nr * nr + ni * ni) / (dr * dr + di * di);
            base = if ratio_sq <= 1e-18 { -180.0 } else { 10.0 * ratio_sq.log10() };
        }
        if !self.has_source_eq {
            return base;
        }
        let log100 = 100.0_f64.ln();
        let inv_log76 = 1.0 / 76.0_f64.ln();
        let last = 31usize;
        let x = if hz <= 100.0 { 0.0 } else { (hz.ln() - log100) * inv_log76 * (last as f64) };
        if x >= last as f64 {
            return base + self.source_eq[last];
        }
        let mut i = x as usize;
        if i >= last { i = last - 1; }
        base + self.source_eq[i] + (self.source_eq[i + 1] - self.source_eq[i]) * (x - (i as f64))
    }

    #[inline]
    pub fn out_eq_slice(&self) -> &[f64] {
        &self.out_eq[..self.out_eq_len]
    }
}

pub struct LfTable {
    pub nrd: usize,
    pub nh: usize,
    pub rd_min: f64,
    pub rd_step: f64,
    pub phase: Vec<f64>,      // [nrd * nh]
    pub mag_delta: Vec<f64>,  // [nrd * nh]
    pub rd_comp_db: Vec<f64>, // [nrd]
}

#[inline]
pub fn voiced_high_shape(hz: f64, f6: f64, wideband: bool, tract_join: bool, sb: f64, studio: bool) -> f64 {
    let scale = (f6 / 5200.0).clamp(0.65, 1.6);
    let mut smooth_val = 0.0;
    if sb > 0.0 {
        let env_start = (f6 * 0.85).clamp(3600.0, 6200.0);
        let mut env_fade = ((hz - env_start) / 1500.0).clamp(0.0, 1.0);
        env_fade = env_fade * env_fade * (3.0 - 2.0 * env_fade);
        let ref_hz = (f6 * 0.96).max(5200.0);
        let slope = (hz / ref_hz).max(1.0).powf(if studio { -1.65 } else { -1.18 });
        let env_top = if studio {
            if hz <= 11500.0 {
                1.0
            } else if hz >= 16000.0 {
                0.0
            } else {
                0.5 + 0.5 * (PI * (hz - 11500.0) / 4500.0).cos()
            }
        } else if hz <= 15000.0 {
            1.0
        } else if hz >= 20000.0 {
            0.0
        } else {
            0.5 + 0.5 * (PI * (hz - 15000.0) / 5000.0).cos()
        };
        smooth_val = env_fade * env_top * slope * 0.68;
        if sb >= 1.0 {
            return smooth_val;
        }
    }
    let start = if tract_join { (f6 - 150.0).clamp(3800.0, 6000.0) } else { 6000.0 };
    let f7 = (f6 + 1500.0 * scale).max(start + 1100.0);
    let f8 = f7 + 2000.0 * scale;
    let mut fade = ((hz - start) / 1100.0).clamp(0.0, 1.0);
    fade = fade * fade * (3.0 - 2.0 * fade);
    let d7 = (hz - f7) / (850.0 * scale);
    let peak7 = 1.0 / (1.0 + d7 * d7).sqrt();
    let d8 = (hz - f8) / (1100.0 * scale);
    let peak8 = 1.0 / (1.0 + d8 * d8).sqrt();
    let ref_val = if !wideband {
        fade * ((16000.0 - hz) / 2000.0).clamp(0.0, 1.0) * (0.7 * peak7 + 0.3 * peak8)
    } else {
        let top = if hz <= 18000.0 {
            1.0
        } else if hz >= 20000.0 {
            0.0
        } else {
            0.5 + 0.5 * (PI * (hz - 18000.0) / 2000.0).cos()
        };
        let f9 = f8 + 3400.0 * scale;
        let d9 = (hz - f9) / (2400.0 * scale);
        let peak9 = 1.0 / (1.0 + d9 * d9).sqrt();
        let dip_hz = f8 + 1300.0 * scale;
        let dd = (hz - dip_hz) / (1100.0 * scale);
        let dip = 1.0 - 0.22 * (-dd * dd).exp();
        let shelf = 10.0_f64.powf(7.8 * (hz / 8000.0).max(1.0).log2() / 20.0);
        fade * top * shelf * dip * (0.5 * peak7 + 0.3 * peak8 + 0.22 * peak9)
    };
    if sb > 0.0 { ref_val + (smooth_val - ref_val) * sb } else { ref_val }
}

#[allow(clippy::too_many_arguments)]
pub fn chain_power(
    rc: &RateConst,
    pairs: &[(f64, f64); 6],
    f0: f64,
    amps: &[f64],
    tilt_db: f64,
    gl: &GlottalParams,
    include_out_eq: bool,
    studio: bool,
    harm_octaves: &[f64; 513],
    legacy_trig: bool,
) -> f64 {
    let rate = rc.sr;
    let calibrated = rc.mode_b && rate == 48000.0 && !studio;
    let rad_shelf = rc.mode_b && studio;
    let rad_a = if rad_shelf { (-2.0 * PI * 4800.0 / rate).exp() } else { 0.0 };
    let rad_num2 = if rad_shelf { (1.0 - rad_a) * (1.0 - rad_a) } else { 1.0 };
    let rad_den_b = 1.0 + rad_a * rad_a;
    let rad_2a = 2.0 * rad_a;
    let hc_c = if rad_shelf { Some(hpc_coeffs(pairs[5].0, rate)) } else { None };
    let max_k = if rate == 48000.0 { 256 } else { 64 };
    let top_hz = if rate == 48000.0 { 20000.0 } else { 7600.0 };
    let k_lim = ((top_hz / f0.max(40.0)).floor() as usize).clamp(1, max_k);
    let n = amps.len();
    let last = amps[n - 1];
    let last_oct = (n as f64).ln() / LN_2;
    let pitch_db = 20.0 * (f0 / 262.0).ln() * PITCH_EXP;
    let mut cp_b = [0.0_f64; 6];
    let mut cp_c = [0.0_f64; 6];
    let mut cp_a2 = [0.0_f64; 6];
    let mut cp_corr = [0.0_f64; 6];
    let mut cp_len = 0usize;
    for j in 0..6 {
        let (f, bw) = pairs[j];
        if !(f > 20.0) || f >= rate * 0.5 {
            continue;
        }
        let r = (-PI * bw / rate).exp();
        let b = 2.0 * r * (2.0 * PI * f / rate).cos();
        let c = -r * r;
        let a = (1.0 - b - c).max(1e-9);
        cp_b[cp_len] = b;
        cp_c[cp_len] = c;
        cp_a2[cp_len] = a * a;
        if calibrated {
            cp_corr[cp_len] = rc.rate_correction(f, bw);
        }
        cp_len += 1;
    }
    let mut p = 0.0_f64;
    let w0 = 2.0 * PI * f0 / rate;
    let cw0 = w0.cos();
    let sw0 = w0.sin();
    let mut cw = 1.0;
    let mut sw = 0.0;
    let out_eq_slice = if include_out_eq && gl.has_out_eq { gl.out_eq_slice() } else { &[] };
    for k in 1..=k_lim {
        let oct = harm_octaves[k];
        let mut db = if k <= n { amps[k - 1] } else { last + gl.tail_db * (oct - last_oct) };
        db += tilt_db * oct + pitch_db;
        let fk = (k as f64) * f0;
        db += gl.source_db_at(fk, rate);
        if !out_eq_slice.is_empty() {
            db += out_eq_db_at(out_eq_slice, fk);
        }
        let ak2 = (db * LOG10_OVER_10).exp();
        if legacy_trig {
            let w = (k as f64) * w0;
            cw = w.cos();
            sw = w.sin();
        } else {
            let next_cw = cw * cw0 - sw * sw0;
            sw = sw * cw0 + cw * sw0;
            cw = next_cw;
        }
        let c2 = cw * cw - sw * sw;
        let s2 = 2.0 * cw * sw;
        let mut g2 = 1.0;
        if calibrated {
            let one_minus_cw = 1.0 - cw;
            for q in 0..cp_len {
                let bq = cp_b[q];
                let cq = cp_c[q];
                let dr = 1.0 - bq * cw - cq * c2;
                let di = bq * sw + cq * s2;
                let cf = 1.0 + cp_corr[q] * one_minus_cw;
                g2 *= cp_a2[q] / (dr * dr + di * di + 1e-18) * (cf * cf);
            }
        } else {
            for q in 0..cp_len {
                let bq = cp_b[q];
                let cq = cp_c[q];
                let dr = 1.0 - bq * cw - cq * c2;
                let di = bq * sw + cq * s2;
                g2 *= cp_a2[q] / (dr * dr + di * di + 1e-18);
            }
        }
        if let Some(ref hc) = hc_c {
            let h_nr = hc[0] + hc[1] * cw + hc[2] * c2;
            let h_ni = -(hc[1] * sw + hc[2] * s2);
            let h_dr = 1.0 + hc[3] * cw + hc[4] * c2;
            let h_di = -(hc[3] * sw + hc[4] * s2);
            g2 *= (h_nr * h_nr + h_ni * h_ni) / (h_dr * h_dr + h_di * h_di + 1e-18);
        }
        let rad_factor = if rad_shelf {
            rad_num2 / (rad_den_b - rad_2a * cw).max(1e-9)
        } else {
            1.0
        };
        p += ak2 * g2 * (2.0 - 2.0 * cw) * rad_factor;
    }
    p
}

#[repr(align(16))]
pub struct HarmBufF32 {
    pub data: [f32; 512],
}

impl HarmBufF32 {
    pub fn zero() -> Self {
        Self { data: [0.0; 512] }
    }
}

pub struct VocalSource {
    pub phase: [f64; 512],
    pub amp: HarmBufF32,
    pub target: HarmBufF32,
    pub step: HarmBufF32,
    pub full_target: [f64; 512],
    pub high_amp: HarmBufF32,
    pub high_target: HarmBufF32,
    pub high_step: HarmBufF32,
    pub rand_phase: [f64; 512],
    pub phase_off: HarmBufF32,
    pub phase_off_target: [f64; 512],
    pub phase_off_step: HarmBufF32,
    pub amps: [f64; 16],
    pub amps_len: usize,
    pub count: usize,
    pub k_cur: usize,
    pub next_k: usize,
    pub active_k: usize,
    pub low_active_k: usize,
    pub high_active_k: usize,
    pub high_start: usize,
    pub next_high_start: usize,
    pub high_silent: bool,
    pub next_high_silent: bool,
    pub wideband: bool,
    pub air_amp: f64,
    pub air_target: f64,
    pub air_step: f64,
    pub master_phase: f64,
    pub harm_drift: [f64; 32],
    pub harm_drift_coef: [f64; 32],
    pub harm_drift_gain: [f64; 32],
    pub harm_drift_out: [f64; 32],
    pub harm_rnd: Mulberry32,
    pub part_phase_jit: [f64; 512],
    pub part_phase_vel: [f64; 512],
    pub part_rnd: Mulberry32,
}

impl VocalSource {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        amps_in: &[f64],
        hd: bool,
        wideband: bool,
        sr: f64,
        hop: f64,
        organic_amt: f64,
        humanize_amt: f64,
        seed_salt: u32,
    ) -> Self {
        let count = if wideband { 512 } else if hd { 256 } else { 64 };
        let mut rnd = Mulberry32::new(0x9e3779b9);
        let mut phase = [0.0_f64; 512];
        let mut rand_phase = [0.0_f64; 512];
        let mut phase_off = HarmBufF32::zero();
        let mut phase_off_target = [0.0_f64; 512];
        for k in 0..count {
            let v = rnd.next();
            phase[k] = v;
            if humanize_amt > 0.0 {
                rand_phase[k] = v;
                phase_off.data[k] = v as f32;
                phase_off_target[k] = v;
            }
        }
        let mut amps = [0.0_f64; 16];
        let amps_len = amps_in.len().min(16);
        amps[..amps_len].copy_from_slice(&amps_in[..amps_len]);

        let mut harm_drift_coef = [0.0_f64; 32];
        let mut harm_drift_gain = [0.0_f64; 32];
        if organic_amt > 0.0 {
            let dt_frame = hop / sr;
            for b in 0..32 {
                let fc = 5.5 + (b as f64) * 0.25;
                let a = (-2.0 * PI * fc * dt_frame).exp();
                harm_drift_coef[b] = a;
                harm_drift_gain[b] = ((1.0 + a) / (1.0 - a).max(1e-12)).sqrt();
            }
        }

        Self {
            phase,
            amp: HarmBufF32::zero(),
            target: HarmBufF32::zero(),
            step: HarmBufF32::zero(),
            full_target: [0.0; 512],
            high_amp: HarmBufF32::zero(),
            high_target: HarmBufF32::zero(),
            high_step: HarmBufF32::zero(),
            rand_phase,
            phase_off,
            phase_off_target,
            phase_off_step: HarmBufF32::zero(),
            amps,
            amps_len,
            count,
            k_cur: count,
            next_k: 0,
            active_k: 0,
            low_active_k: 0,
            high_active_k: 0,
            high_start: count,
            next_high_start: count,
            high_silent: true,
            next_high_silent: true,
            wideband,
            air_amp: 0.0,
            air_target: 0.0,
            air_step: 0.0,
            master_phase: 0.0,
            harm_drift: [0.0; 32],
            harm_drift_coef,
            harm_drift_gain,
            harm_drift_out: [0.0; 32],
            harm_rnd: Mulberry32::new(0x6c8e9cf5),
            part_phase_jit: [0.0; 512],
            part_phase_vel: [0.0; 512],
            part_rnd: Mulberry32::new(0x517cc1b7 ^ seed_salt),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_harmonics(
        &mut self,
        sr: f64,
        hop: f64,
        source_top: f64,
        mode_b: bool,
        studio: bool,
        legacy_sound: bool,
        f0: f64,
        tilt_db: f64,
        gl: &GlottalParams,
        smooth_cutoff: f64,
        smooth_blend: f64,
        organic_amt: f64,
        organic_gate: f64,
        humanize_amt: f64,
        rd: f64,
        snap_phase: bool,
        lf: Option<&LfTable>,
        harm_octaves: &[f64; 513],
    ) {
        let n = self.amps_len;
        let last = self.amps[n - 1];
        let last_oct = (n as f64).ln() / LN_2;
        let pitch_db = 20.0 * (f0 / 262.0).ln() * PITCH_EXP;
        let count = self.count;
        let k_lim = ((source_top / f0.max(40.0)).floor() as usize).clamp(1, count);
        if mode_b {
            self.full_target[k_lim..count].fill(0.0);
        }
        self.target.data[k_lim..count].fill(0.0);
        self.step.data[k_lim..count].fill(0.0);
        let mut low_top = 0usize;
        for outgoing in k_lim..self.active_k {
            let a = self.amp.data[outgoing];
            if a != 0.0 {
                self.step.data[outgoing] = (-(a as f64) / hop) as f32;
                low_top = outgoing + 1;
            }
        }
        self.active_k = k_lim;
        let sb = smooth_blend;
        let xf_start = if smooth_cutoff > 0.0 && sb > 0.0 {
            (smooth_cutoff * 0.98).clamp(4000.0, 6800.0)
        } else {
            0.0
        };
        let org_harm_eff = if organic_amt > 0.0 { organic_amt * organic_gate } else { 0.0 };
        if organic_amt > 0.0 {
            let active_bands = k_lim.min(32);
            let mut drift_mean = 0.0;
            for hb in 0..32 {
                let hx = (self.harm_rnd.next() + self.harm_rnd.next() + self.harm_rnd.next() - 1.5) * 2.0;
                let a_h = self.harm_drift_coef[hb];
                let dv = (1.0 - a_h) * hx + a_h * self.harm_drift[hb];
                self.harm_drift[hb] = dv;
                let sc = dv * self.harm_drift_gain[hb];
                let bounded = sc / (1.0 + sc.abs() * 0.38);
                self.harm_drift_out[hb] = bounded;
                if hb < active_bands {
                    drift_mean += bounded;
                }
            }
            drift_mean /= active_bands.max(1) as f64;
            for hb2 in 0..32 {
                self.harm_drift_out[hb2] -= drift_mean;
            }
        }

        let mut lf_ri = 0usize;
        let mut lf_modal_row = 0usize;
        let mut lf_fr = 0.0_f64;
        let mut lf_nh = 0usize;
        let mut f_coh = 2400.0_f64;
        let mut st_disp_start = 1550.0_f64;
        let mut st_rd = 1.05_f64;
        let mut st_coh_ceil = 0.25_f64;
        let mut st_coh_start = 4800.0_f64;
        let mut rd_comp = 0.0_f64;
        let st_dt = hop / sr;
        let use_lf = humanize_amt > 0.0 && lf.is_some();
        if let Some(lt) = lf {
            if use_lf {
                let rd_max = lt.rd_min + ((lt.nrd - 1) as f64) * lt.rd_step;
                let rd_clamped = rd.clamp(lt.rd_min, rd_max);
                st_rd = rd_clamped;
                let r_pos = (rd_clamped - lt.rd_min) / lt.rd_step;
                lf_ri = (r_pos as usize).min(lt.nrd - 2);
                lf_fr = r_pos - (lf_ri as f64);
                lf_nh = lt.nh;
                lf_modal_row = (((1.0 - lt.rd_min) / lt.rd_step).round() as usize).min(lt.nrd - 1) * lt.nh;
                f_coh = (2650.0 - 480.0 * (rd_clamped - 1.0)).clamp(1500.0, 3000.0);
                if studio {
                    st_disp_start = (1320.0 - 320.0 * (rd_clamped - 1.0)).clamp(950.0, 1650.0);
                    let st_rd_u = ((rd_clamped - 0.8) / 0.7).clamp(0.0, 1.0);
                    st_coh_ceil = 0.38 - 0.14 * st_rd_u;
                    st_coh_start = 5400.0 - 800.0 * st_rd_u;
                    if lt.rd_comp_db.len() > lf_ri + 1 {
                        rd_comp = lt.rd_comp_db[lf_ri]
                            + (lt.rd_comp_db[lf_ri + 1] - lt.rd_comp_db[lf_ri]) * lf_fr;
                    }
                }
            }
        }
        let inv_hop = 1.0 / hop;
        for k in 1..=k_lim {
            let oct = harm_octaves[k];
            let mut db = if k <= n { self.amps[k - 1] } else { last + gl.tail_db * (oct - last_oct) };
            db += tilt_db * oct + pitch_db;
            if studio && use_lf && st_rd > 1.35 && oct > 0.85 {
                db -= 1.15 * (st_rd - 1.35) * (oct - 0.85);
            }
            let khz = (k as f64) * f0;
            db += gl.source_db_at(khz, sr);
            if use_lf {
                let lt = lf.unwrap();
                let m_idx = if k <= lf_nh { k - 1 } else { lf_nh - 1 };
                let row0 = lf_ri * lf_nh;
                let row1 = (lf_ri + 1) * lf_nh;
                let m_delta = lt.mag_delta[row0 + m_idx] + (lt.mag_delta[row1 + m_idx] - lt.mag_delta[row0 + m_idx]) * lf_fr;
                if studio {
                    let m_clamped = m_delta.clamp(-10.0, 6.5);
                    let lf_scale = if m_clamped > 0.0 {
                        let fk_t = ((khz - 1200.0) / 2200.0).clamp(0.0, 1.0);
                        let k_t = (((k as f64) - 4.0) / 10.0).clamp(0.0, 1.0);
                        let u_t = fk_t.max(k_t);
                        1.0 - 0.82 * (u_t * u_t * (3.0 - 2.0 * u_t))
                    } else {
                        0.75
                    };
                    db += lf_scale * m_clamped;
                    db += rd_comp;
                    if st_rd > 1.12 {
                        let oq_u = (st_rd - 1.12).min(1.1);
                        if k == 1 {
                            db += 3.8 * oq_u;
                        } else if k == 2 {
                            db -= 1.4 * oq_u;
                        }
                    } else if st_rd < 0.96 {
                        let skew_u = (0.96 - st_rd).min(0.45) / 0.45;
                        if k == 1 {
                            db -= 0.9 * skew_u;
                        } else if k == 2 {
                            db += 2.6 * skew_u;
                        } else if k == 3 {
                            db += 1.2 * skew_u;
                        }
                    }
                } else {
                    db += 0.68 * m_delta;
                }
                let mut tgt_off;
                if studio {
                    let lf_ph_st = if k <= lf_nh {
                        let p_a = lt.phase[row0 + k - 1];
                        let p_b = lt.phase[row1 + k - 1];
                        p_a + (p_b - p_a) * lf_fr
                    } else {
                        0.0
                    };
                    if khz > st_disp_start {
                        let u_disp = ((khz - st_disp_start) / 2200.0).min(1.0);
                        let w_decoh = u_disp * u_disp * (3.0 - 2.0 * u_disp);
                        let rp_st = self.rand_phase[k - 1];
                        let base_ph = lf_ph_st + w_decoh * (rp_st - lf_ph_st - (rp_st - lf_ph_st).round());
                        let disp_rate = 1.8 + 3.2 * u_disp;
                        let disp_amp = (0.006 + 0.018 * u_disp.powf(1.35))
                            * (0.75 + 0.45 * (st_rd - 0.85).clamp(0.0, 1.0));
                        let a_d = (-2.0 * PI * disp_rate * st_dt).exp();
                        let u_tri = (self.part_rnd.next() + self.part_rnd.next() - 1.0) * 2.44948974;
                        let v_d = a_d * self.part_phase_vel[k - 1] + (1.0 - a_d * a_d).max(0.0).sqrt() * u_tri;
                        self.part_phase_vel[k - 1] = v_d;
                        let j_d = a_d * self.part_phase_jit[k - 1] + (1.0 - a_d) * (disp_amp * 1.4 * v_d);
                        self.part_phase_jit[k - 1] = j_d;
                        tgt_off = base_ph + j_d;
                    } else {
                        self.part_phase_vel[k - 1] *= 0.7;
                        self.part_phase_jit[k - 1] *= 0.7;
                        tgt_off = lf_ph_st + self.part_phase_jit[k - 1];
                    }
                } else {
                    let mut w_coh = if khz <= f_coh {
                        1.0
                    } else if khz >= f_coh + 2200.0 {
                        0.0
                    } else {
                        1.0 - (khz - f_coh) / 2200.0
                    };
                    w_coh = w_coh * w_coh * (3.0 - 2.0 * w_coh) * humanize_amt;
                    let rp = self.rand_phase[k - 1];
                    tgt_off = rp;
                    if w_coh > 1e-6 && k <= lf_nh {
                        let p_a = lt.phase[row0 + k - 1];
                        let p_b = lt.phase[row1 + k - 1];
                        let lf_ph = p_a + (p_b - p_a) * lf_fr;
                        let modal_turn = (lt.phase[lf_modal_row + k - 1] - rp).round();
                        tgt_off = rp + w_coh * (lf_ph - rp - modal_turn);
                    }
                }
                if snap_phase {
                    let mut p_snap = tgt_off - tgt_off.floor();
                    if p_snap < 0.0 { p_snap += 1.0; }
                    self.phase_off.data[k - 1] = p_snap as f32;
                    self.phase_off_target[k - 1] = p_snap;
                    self.phase_off_step.data[k - 1] = 0.0;
                } else {
                    let mut cur_off = self.phase_off.data[k - 1] as f64;
                    let mut d_off = tgt_off - cur_off;
                    d_off -= d_off.round();
                    if studio {
                        d_off = d_off.clamp(-0.045, 0.045);
                    }
                    if cur_off + d_off < 0.0 { cur_off += 1.0; }
                    self.phase_off.data[k - 1] = cur_off as f32;
                    self.phase_off_target[k - 1] = cur_off + d_off;
                    self.phase_off_step.data[k - 1] = (d_off * inv_hop) as f32;
                }
            }
            if org_harm_eff > 1e-5 {
                let b_idx = if k <= 32 { k - 1 } else { 20 + ((k - 33) % 12) };
                let h_depth = 0.14 + 0.56 * (((k - 1) as f64) / 8.0).min(1.0);
                db += h_depth * org_harm_eff * self.harm_drift_out[b_idx];
            }
            let a = if legacy_sound { 10.0_f64.powf(db / 20.0) } else { (db * LOG10_OVER_20).exp() };
            if mode_b {
                self.full_target[k - 1] = a;
            }
            let mut target = if a < 1e-6 { 0.0 } else { a };
            if use_lf && studio && khz > st_coh_start && target > 0.0 {
                let xt_c = ((khz - st_coh_start) / 4200.0).min(1.0);
                let s_coh = xt_c * xt_c * (3.0 - 2.0 * xt_c);
                target *= 1.0 - (1.0 - st_coh_ceil) * s_coh;
            }
            if xf_start > 0.0 && khz > xf_start {
                let xr = ((khz - xf_start) / 1400.0).min(1.0);
                target *= 1.0 - sb * xr * xr * (3.0 - 2.0 * xr);
            }
            let tgt_f = target as f32;
            let cur_f = self.amp.data[k - 1];
            let st_f = ((target - (cur_f as f64)) * inv_hop) as f32;
            self.target.data[k - 1] = tgt_f;
            self.step.data[k - 1] = st_f;
            if tgt_f != 0.0 || st_f != 0.0 || cur_f != 0.0 {
                if k > low_top { low_top = k; }
            }
        }
        self.low_active_k = low_top.max(1);
        if self.wideband {
            self.k_cur = k_lim.max(self.next_k);
            self.next_k = k_lim;
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_voiced_high(
        &mut self,
        rc: &RateConst,
        f0: f64,
        pairs: &[(f64, f64); 6],
        voiced_high_gate: f64,
        n_mix: f64,
        c_av: f64,
        eff_tilt: f64,
        source_tilt: f64,
        gl: &GlottalParams,
        strength: f64,
        compensate_eq: bool,
        wideband: bool,
        has_air: bool,
        air_power: f64,
        air_fraction: f64,
        air_trim_gain: f64,
        effort: f64,
        endpoint: &[f64],
        refine: bool,
        tract_join: bool,
        sb: f64,
        pb: f64,
        studio: bool,
        c_rd: f64,
        legacy_sound: bool,
        harm_octaves: &[f64; 513],
    ) {
        let gate = voiced_high_gate * (1.0 - n_mix).max(0.0);
        let inv_hop = 1.0 / rc.hop;
        if strength <= 0.0 || gate <= 1e-6 || c_av < 1e-6 {
            let mut h_top0 = 0usize;
            if !self.high_silent {
                for h0 in self.high_start..self.k_cur {
                    self.high_target.data[h0] = 0.0;
                    let ha = self.high_amp.data[h0];
                    if ha != 0.0 {
                        self.high_step.data[h0] = (-(ha as f64) * inv_hop) as f32;
                        h_top0 = h0 + 1;
                    } else {
                        self.high_step.data[h0] = 0.0;
                    }
                }
            }
            self.high_active_k = h_top0;
            self.next_high_start = self.count;
            self.next_high_silent = true;
            self.air_target = 0.0;
            self.air_step = -self.air_amp * inv_hop;
            return;
        }
        let f6 = pairs[5].0;
        let use_hnm = (pb > 0.0 || effort != 0.0) && has_air;
        let old_start = if tract_join { (f6 - 150.0).clamp(3800.0, 6000.0) } else { 6000.0 };
        let new_start = (f6 * 0.85).clamp(3600.0, 6200.0);
        let start = if sb >= 1.0 { new_start } else if sb <= 0.0 { old_start } else { old_start.min(new_start) };
        let mut k_start = ((start / f0).floor() as usize).min(self.k_cur);
        while k_start > 0 && (k_start as f64) * f0 > start {
            k_start -= 1;
        }
        let mut h_top = 0usize;
        if !self.high_silent {
            for kz in self.high_start..k_start {
                self.high_target.data[kz] = 0.0;
                let ha = self.high_amp.data[kz];
                if ha != 0.0 {
                    self.high_step.data[kz] = (-(ha as f64) * inv_hop) as f32;
                    h_top = kz + 1;
                } else {
                    self.high_step.data[kz] = 0.0;
                }
            }
            if k_start < self.high_start {
                self.high_start = k_start;
            }
        } else {
            self.high_start = k_start;
        }
        self.next_high_start = k_start;
        self.high_silent = false;
        self.next_high_silent = false;

        let has_out_eq = compensate_eq && gl.has_out_eq;
        let out_eq_slice = if has_out_eq { gl.out_eq_slice() } else { &[] };
        let two_pi_over_sr = 2.0 * PI / rc.sr;
        let effort_norm = (source_tilt / 2.5).clamp(-1.0, 1.0);
        let max_frac = 0.72 + (0.86 - 0.72) * pb;
        let effort_slope = 0.28 + (0.22 - 0.28) * pb;
        let base_fraction = if has_air {
            (air_fraction * (1.0 - effort_slope * effort_norm)).clamp(0.03, max_frac)
        } else {
            0.0
        };
        let hnm_start = (f6 * 0.86).clamp(5000.0, 6000.0);
        let hnm_span = 7500.0;
        let dw = two_pi_over_sr * f0;
        let w_start = dw * ((k_start + 1) as f64);
        let cw_step = dw.cos();
        let sw_step = dw.sin();
        let mut cw_cur = w_start.cos();
        let mut sw_cur = w_start.sin();
        let rd_high_u = ((c_rd - 0.8) / 0.7).clamp(0.0, 1.0);
        let st_high_ceil = 0.42 - 0.16 * rd_high_u;
        let st_high_start = 5600.0 - 900.0 * rd_high_u;
        let rad_a_hi = if studio { (-2.0 * PI * 4800.0 / rc.sr).exp() } else { 0.0 };
        let rad_num2_hi = (1.0 - rad_a_hi) * (1.0 - rad_a_hi);
        let rad_den_b_hi = 1.0 + rad_a_hi * rad_a_hi;
        let rad_2a_hi = 2.0 * rad_a_hi;

        let mut power = 0.0_f64;
        let mut shape_only_power = 0.0_f64;
        let mut ref_power = 0.0_f64;
        let mut tmp_high = [0.0_f64; 512];
        for k in k_start..self.k_cur {
            let hz = ((k + 1) as f64) * f0;
            let ref_shape = voiced_high_shape(hz, f6, wideband, tract_join, 0.0, studio);
            let new_shape = if sb > 0.0 { voiced_high_shape(hz, f6, wideband, tract_join, 1.0, studio) } else { ref_shape };
            let a_shape = if sb >= 1.0 { new_shape } else if sb <= 0.0 { ref_shape } else { ref_shape + (new_shape - ref_shape) * sb };
            let mut coh = 1.0;
            if studio {
                if hz > st_high_start {
                    let xt_s = ((hz - st_high_start) / 4200.0).min(1.0);
                    coh = 1.0 - (1.0 - st_high_ceil) * (xt_s * xt_s * (3.0 - 2.0 * xt_s));
                }
                if hz > 10500.0 {
                    let xt_u = ((hz - 10500.0) / 4500.0).min(1.0);
                    coh *= 1.0 - (xt_u * xt_u * (3.0 - 2.0 * xt_u));
                }
            } else {
                if use_hnm && hz > hnm_start {
                    let xt = ((hz - hnm_start) / hnm_span).min(1.0);
                    let hnm_coh = 0.22 + 0.78 * (1.0 - xt * xt * (3.0 - 2.0 * xt)).max(0.0);
                    coh = 1.0 - pb * (1.0 - hnm_coh);
                }
                if has_air && effort != 0.0 {
                    let (band, u) = if hz < 7000.0 { (0, (hz - 5000.0) / 2000.0) } else { (1, (hz - 7000.0) / 3000.0) };
                    let residual = endpoint[band] + u.clamp(0.0, 1.0) * (endpoint[band + 1] - endpoint[band]);
                    coh = (coh * coh + effort.abs() * ((1.0 - residual) / (1.0 - base_fraction) - coh * coh)).max(0.0).sqrt();
                }
            }
            let ft = self.full_target[k];
            let a_base = ft * a_shape;
            let a = a_base * coh;
            tmp_high[k] = a;
            let eq = if has_out_eq { (out_eq_db_at(out_eq_slice, hz) * LOG10_OVER_20).exp() } else { 1.0 };
            let cos_val = if legacy_sound { (two_pi_over_sr * hz).cos() } else { cw_cur };
            if !legacy_sound {
                let next_cw = cw_cur * cw_step - sw_cur * sw_step;
                sw_cur = sw_cur * cw_step + cw_cur * sw_step;
                cw_cur = next_cw;
            }
            let rad_f_hi = if studio {
                rad_num2_hi / (rad_den_b_hi - rad_2a_hi * cos_val).max(1e-9)
            } else {
                1.0
            };
            let w = eq * eq * (2.0 - 2.0 * cos_val) * rad_f_hi;
            power += a * a * w;
            shape_only_power += a_base * a_base * w;
            let a_ref = ft * ref_shape;
            ref_power += a_ref * a_ref * w;
        }
        let body_power = chain_power(
            rc, pairs, f0, &self.amps[..self.amps_len], eff_tilt + source_tilt,
            gl, compensate_eq, studio, harm_octaves, legacy_sound,
        );
        let colour = (3.0 * (pairs[1].0.max(200.0) / 1500.0).log2()).clamp(-5.0, 3.0);
        let level_db = if studio {
            -32.0
                + 4.5 * strength
                + (eff_tilt * 0.5).clamp(-3.0, 3.0)
                + 0.65 * colour
                + 1.1 * (c_rd - 1.0).max(0.0)
                + 0.65 * source_tilt
        } else {
            (if wideband { -32.5 } else { -36.0 })
                + 10.0 * strength
                + (eff_tilt * 0.5).clamp(-4.0, 3.0)
                + colour
                + 2.0 * source_tilt
        };
        let budget = body_power.max(0.0) * (level_db * LOG10_OVER_10).exp();
        let cal_base = if use_hnm { shape_only_power } else { power };
        let cal_smooth = shape_only_power.max(ref_power * 0.90);
        let cal_power = if sb >= 1.0 { cal_smooth } else if sb <= 0.0 { cal_base } else { cal_base + (cal_smooth - cal_base) * sb };
        let coh_ratio = if use_hnm && shape_only_power > 1e-30 { power / shape_only_power } else { 1.0 };
        let fraction = if has_air {
            if studio {
                (base_fraction + 0.16 * (c_rd - 1.0).max(0.0)).clamp(0.14, 0.65)
            } else if use_hnm {
                let floor = if effort != 0.0 { 0.0 } else { base_fraction };
                floor.max(1.0 - (1.0 - base_fraction) * coh_ratio)
            } else { base_fraction }
        } else {
            0.0
        };
        let gain = if strength > 0.0 && cal_power > 1e-30 {
            gate * (budget * (1.0 - base_fraction) / cal_power).sqrt()
        } else {
            0.0
        };
        let air_gain = if has_air && air_power > 1e-30 {
            gate * (0.5 * budget * fraction / air_power).sqrt() * air_trim_gain
        } else {
            0.0
        };
        self.air_target = air_gain;
        self.air_step = (air_gain - self.air_amp) * inv_hop;
        for h in k_start..self.k_cur {
            let ref_g = if refine { (refine_db(REFINE_CORE, ((h + 1) as f64) * f0) * LOG10_OVER_20).exp() } else { 1.0 };
            let ht = tmp_high[h] * gain * ref_g;
            let ht_f = ht as f32;
            let cur_f = self.high_amp.data[h];
            let hst_f = ((ht - (cur_f as f64)) * inv_hop) as f32;
            self.high_target.data[h] = ht_f;
            self.high_step.data[h] = hst_f;
            if ht_f != 0.0 || hst_f != 0.0 || cur_f != 0.0 {
                if h + 1 > h_top { h_top = h + 1; }
            }
        }
        self.high_active_k = h_top;
    }
}
