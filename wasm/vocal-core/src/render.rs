use core::f64::consts::PI;

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

use crate::fft::{apply_out_eq_inplace, build_out_eq_kernel, EqKernel, FftWorkspace};
use crate::filters::{
    nasal_zero_bw, AntiResonator, DynamicNotch, DynamicShelf, FricativeFrontCavity,
    HiFiNasalBranch, NasalBranch, Piriform, RateConst, Resonator,
};
use crate::harmonics::{
    build_refine_curve, GlottalParams, LfTable, Mulberry32, VocalSource, REFINE_BODY,
    REFINE_FRICTION,
};

pub const FRAME_STRIDE: usize = 46;
pub const CONFIG_LEN: usize = 73;

pub struct EqCacheEntry {
    pub key: Vec<u64>,
    pub kernel: EqKernel,
}

pub struct VocalEngine {
    pub sin_tab: [f32; 2049],
    pub harm_octaves: [f64; 513],
    pub fft_ws: FftWorkspace,
    pub eq_cache: Vec<EqCacheEntry>,
    pub cfg_buf: Vec<f64>,
    pub harm_buf: Vec<f64>,
    pub source_eq_buf: Vec<f64>,
    pub out_eq_buf: Vec<f64>,
    pub air_eq_buf: Vec<f64>,
    pub lf_phase_buf: Vec<f64>,
    pub lf_mag_buf: Vec<f64>,
    pub frames_buf: Vec<f64>,
    pub out_buf: Vec<f32>,
    pub body_stage: Vec<f32>,
    pub fric_stage: Vec<f32>,
    pub body_mask: Vec<f32>,
    pub upper_air: Vec<f32>,
}

impl VocalEngine {
    pub fn new() -> Self {
        let mut sin_tab = [0.0_f32; 2049];
        for i in 0..=2048 {
            sin_tab[i] = (2.0 * PI * (i as f64) / 2048.0).sin() as f32;
        }
        let mut harm_octaves = [0.0_f64; 513];
        for k in 1..=512 {
            harm_octaves[k] = (k as f64).log2();
        }
        Self {
            sin_tab,
            harm_octaves,
            fft_ws: FftWorkspace::new(),
            eq_cache: Vec::with_capacity(16),
            cfg_buf: vec![0.0; CONFIG_LEN],
            harm_buf: vec![0.0; 16],
            source_eq_buf: vec![0.0; 32],
            out_eq_buf: vec![0.0; 64],
            air_eq_buf: vec![0.0; 64],
            lf_phase_buf: Vec::new(),
            lf_mag_buf: Vec::new(),
            frames_buf: Vec::new(),
            out_buf: Vec::new(),
            body_stage: Vec::new(),
            fric_stage: Vec::new(),
            body_mask: Vec::new(),
            upper_air: Vec::new(),
        }
    }

    fn get_or_build_eq_kernel(&mut self, eq: &[f64], sr: f64, hd: bool, is_delta: bool) -> usize {
        let mut key = Vec::with_capacity(eq.len() + 2);
        key.push(sr.to_bits());
        key.push(((hd as u64) << 1) | (is_delta as u64));
        for &v in eq {
            key.push(v.to_bits());
        }
        for i in 0..self.eq_cache.len() {
            if self.eq_cache[i].key == key {
                return i;
            }
        }
        let kernel = build_out_eq_kernel(&mut self.fft_ws, eq, sr, hd, is_delta);
        if self.eq_cache.len() >= 16 {
            self.eq_cache.remove(0);
        }
        self.eq_cache.push(EqCacheEntry { key, kernel });
        self.eq_cache.len() - 1
    }

    fn apply_cached_eq(&mut self, which: u8, eq: &[f64], sr: f64, hd: bool, is_delta: bool) {
        let k_idx = self.get_or_build_eq_kernel(eq, sr, hd, is_delta);
        // Split borrows cleanly
        let ws = &mut self.fft_ws;
        let kernel = &self.eq_cache[k_idx].kernel;
        let pcm = match which {
            0 => &mut self.out_buf[..],
            1 => &mut self.body_stage[..],
            2 => &mut self.fric_stage[..],
            _ => &mut self.upper_air[..],
        };
        apply_out_eq_inplace(ws, pcm, kernel);
    }

    pub fn render_frames(&mut self, n_frames: usize) -> usize {
        let cfg = &self.cfg_buf;
        let sr = cfg[0];
        let hop_f = cfg[1];
        let hop = hop_f as usize;
        let flags = cfg[2] as u32;
        let hd = (flags & 1) != 0;
        let mode_b = (flags & 2) != 0;
        let raw_src = (flags & 4) != 0;
        let research = (flags & 8) != 0;
        let refine = (flags & 16) != 0;
        let voiced_high = (flags & 32) != 0;
        let wideband = (flags & 64) != 0;
        let tract_join = (flags & 128) != 0;
        let compensate_high_eq = (flags & 256) != 0;
        let nasal_tract = (flags & 512) != 0;
        let use_organic = (flags & 1024) != 0;
        let use_humanize = (flags & 2048) != 0;
        let has_front_cavity = (flags & 4096) != 0;
        let has_upper_air = (flags & 8192) != 0;
        let has_piriform = (flags & 16384) != 0;
        let legacy_sound = (flags & 32768) != 0;
        let has_gl = (flags & 65536) != 0;
        let has_source_eq = (flags & 131072) != 0;
        let has_out_eq = (flags & 262144) != 0;
        let studio = (flags & 524288) != 0;

        let kernels: [f64; 26] = cfg[45..71].try_into().unwrap();
        let eff_breath = cfg[71];
        let jit = cfg[72];
        let seed_salt = cfg[3] as u32;
        let nas_scale = cfg[4];
        let nas_bw_scale = cfg[5];
        let nasal_lowpass_hz = cfg[6];
        let consonant_softness = cfg[7];
        let high_strength = cfg[8];
        let smooth_blend = cfg[9];
        let perturb_blend = cfg[10];
        let asp_air_mix = cfg[11];
        let organic_amt = cfg[12];
        let humanize_amt = cfg[13];
        let hum_pf_ref = cfg[14];
        let air_power = cfg[15];
        let air_fraction = cfg[16];
        let air_trim_gain = cfg[17];
        let fric_trim = cfg[18];
        let tail_db = cfg[19];
        let front_cavity_amount = cfg[20];
        let gl_f = cfg[21];
        let gl_bw = cfg[22];
        let gl_db = cfg[23];
        let pf_b0 = cfg[24];
        let pf_b1 = cfg[25];
        let pf_b2 = cfg[26];
        let pf_a1 = cfg[27];
        let pf_a2 = cfg[28];
        let lf_nrd = cfg[29] as usize;
        let lf_nh = cfg[30] as usize;
        let lf_rd_min = cfg[31];
        let lf_rd_step = cfg[32];
        let out_eq_len = cfg[33] as usize;
        let air_eq_len = cfg[34] as usize;
        let harm_len = (cfg[35] as usize).clamp(1, 16);
        let slice_total = cfg[36] as usize;

        self.out_buf.clear();
        self.out_buf.resize(slice_total, 0.0);
        if refine {
            self.body_stage.clear();
            self.body_stage.resize(slice_total, 0.0);
            self.fric_stage.clear();
            self.fric_stage.resize(slice_total, 0.0);
            self.body_mask.clear();
            self.body_mask.resize(slice_total, 0.0);
        }
        if has_upper_air {
            self.upper_air.clear();
            self.upper_air.resize(slice_total, 0.0);
        }
        if n_frames == 0 || slice_total == 0 {
            return slice_total;
        }

        let rc = RateConst::new(sr, hop_f, mode_b);
        let source_top = if hd { 20000.0 } else { 7600.0 };
        let source_fade = if hd { 1000.0 } else { 400.0 };
        let band_limit = source_top - source_fade;

        let gl = GlottalParams::new(
            sr, has_gl, gl_f, gl_bw, gl_db,
            has_source_eq, &self.source_eq_buf,
            has_out_eq, &self.out_eq_buf[..out_eq_len.min(64)],
            tail_db,
        );

        let lf_table = if use_humanize && lf_nrd >= 2 && lf_nh >= 1
            && self.lf_phase_buf.len() >= lf_nrd * lf_nh
            && self.lf_mag_buf.len() >= lf_nrd * lf_nh
        {
            let mag_slice = &self.lf_mag_buf[..lf_nrd * lf_nh];
            let mut rd_comp_db = vec![0.0_f64; lf_nrd];
            let nh_lim = lf_nh.min(10);
            for ri3 in 0..lf_nrd {
                let mut w_sum = 0.0_f64;
                let mut p_sum_lf = 0.0_f64;
                let row = &mag_slice[ri3 * lf_nh..];
                for k3 in 0..nh_lim {
                    let kf = (k3 + 1) as f64;
                    let wk = 1.0 / (kf * kf);
                    w_sum += wk;
                    p_sum_lf += wk * 10.0_f64.powf(row[k3] / 10.0);
                }
                let shift_db = 10.0 * (p_sum_lf / w_sum).max(1e-6).log10();
                rd_comp_db[ri3] = (-0.85 * shift_db).clamp(-5.0, 7.0);
            }
            Some(LfTable {
                nrd: lf_nrd,
                nh: lf_nh,
                rd_min: lf_rd_min,
                rd_step: lf_rd_step,
                phase: self.lf_phase_buf[..lf_nrd * lf_nh].to_vec(),
                mag_delta: mag_slice.to_vec(),
                rd_comp_db,
            })
        } else {
            None
        };

        let mut src = VocalSource::new(
            &self.harm_buf[..harm_len], hd, wideband, sr, hop_f, organic_amt, humanize_amt, seed_salt,
        );
        let res_cal = mode_b && !studio;
        let mut res = [
            Resonator::new(res_cal), Resonator::new(res_cal), Resonator::new(res_cal),
            Resonator::new(res_cal), Resonator::new(res_cal), Resonator::new(res_cal),
        ];
        let mut nas_hifi = HiFiNasalBranch::new();
        let mut nas_std = NasalBranch::new();
        let mut n_pole = Resonator::new(false);
        let mut n_zero = AntiResonator::new();
        let mut fric_res = Resonator::new(false);
        let mut fric_hp = Resonator::new(false);
        let mut shock_res = if studio { Some(Resonator::new(false)) } else { None };
        let mut last_shock_hz = 5000.0_f64;
        let mut last_shock_bw = 1200.0_f64;
        let mut front_cavity = if has_front_cavity {
            Some(FricativeFrontCavity::new(front_cavity_amount))
        } else {
            None
        };
        let mut sub_notch = if use_humanize && !raw_src { Some(DynamicNotch::new()) } else { None };
        let mut sub_notch2 = if use_humanize && !raw_src && studio { Some(DynamicNotch::new()) } else { None };
        let mut hpc_shelf = if !raw_src && studio { Some(DynamicShelf::new()) } else { None };
        let mut pharynx_notch = if use_humanize && !raw_src && (studio || !has_piriform) {
            Some(DynamicNotch::new())
        } else {
            None
        };
        let mut piriform = if has_piriform && !raw_src && !studio {
            Some(Piriform::new(pf_b0, pf_b1, pf_b2, pf_a1, pf_a2))
        } else {
            None
        };

        let mut org_cycle_rnd = Mulberry32::new(0x94d049bb ^ seed_salt);
        let org_cycle_alpha = 1.0 - (-1.0 / (sr * 0.0015)).exp();
        let org_jit_alpha = 1.0 - (-1.0 / (sr * if studio { 0.00065 } else { 0.0015 })).exp();
        let mut org_shim_cur = 1.0_f64;
        let mut org_shim_tgt = 1.0_f64;
        let mut org_jit_cur = 1.0_f64;
        let mut org_jit_tgt = 1.0_f64;
        let mut prev_org_air = 1.0_f64;

        let mut glottal_noise = Mulberry32::new(0x3c6ef372 ^ seed_salt);
        let mut mid_lp = 0.0_f64;
        let mut mid_hp = 0.0_f64;
        let mid_lp_coef = (-2.0 * PI * 4800.0 / sr).exp();
        let mid_hp_coef = (-2.0 * PI * if studio { 1450.0 } else { 1600.0 } / sr).exp();
        let mid_norm = if studio { 3.10 } else if hd { 3.2 } else { 2.1 };
        let mut air_form_res = if studio && has_upper_air { Some(Resonator::new(false)) } else { None };
        let mut air_lp1 = 0.0_f64;
        let mut air_lp2 = 0.0_f64;
        let air_lp_coef = (-2.0 * PI * if studio { 10800.0 } else { 13500.0 } / sr).exp();

        let mut fry_parity: u32 = 0;
        let mut fry_gain_cur = 1.0_f64;
        let mut fry_gain_tgt = 1.0_f64;
        let fry_alpha = 1.0 - (-1.0 / (sr * 0.0012)).exp();
        let mut prev_rd = 1.05_f64;
        let mut prev_oq = 0.65_f64;
        let mut prev_ta = 0.04_f64;

        let mut velvet_rem: i32 = 0;
        let mut velvet_pos: i32 = 0;
        let mut velvet_sign = 1.0_f64;
        let mut air_ap_z = 0.0_f64;
        let mut air_noise = Mulberry32::new(0x73e91a45 ^ seed_salt);
        let mut noise = Mulberry32::new(0x1234567 ^ seed_salt);
        let mut tnoise = Mulberry32::new(0x2545f491 ^ seed_salt);

        let mut hf_y = 0.0_f64;
        let mut rad_prev = 0.0_f64;
        let mut rad_y = 0.0_f64;
        let mut fric_rad_prev = 0.0_f64;
        let mut br_lp1 = 0.0_f64;
        let mut br_lp2 = 0.0_f64;
        let breath_lp_coef = (-2.0 * PI * if studio { 5600.0 } else { 3400.0 } / sr).exp();
        let mut sib_air_hp = 0.0_f64;
        let mut sib_air_lp1 = 0.0_f64;
        let mut sib_air_lp2 = 0.0_f64;
        let sib_air_hp_coef = (-2.0 * PI * 6800.0 / sr).exp();
        let sib_air_lp_coef = (-2.0 * PI * 11200.0 / sr).exp();
        let fu_w0 = 2.0 * PI * 13200.0 / sr;
        let fu_cw = fu_w0.cos();
        let fu_al = fu_w0.sin() / (2.0 * std::f64::consts::FRAC_1_SQRT_2);
        let fu_a0 = 1.0 + fu_al;
        let fu_b0 = (1.0 - fu_cw) * 0.5 / fu_a0;
        let fu_b1 = (1.0 - fu_cw) / fu_a0;
        let fu_b2 = fu_b0;
        let fu_a1 = -2.0 * fu_cw / fu_a0;
        let fu_a2 = (1.0 - fu_al) / fu_a0;
        let mut fu_x1 = 0.0_f64;
        let mut fu_x2 = 0.0_f64;
        let mut fu_y1 = 0.0_f64;
        let mut fu_y2 = 0.0_f64;
        let mut breath_gate = 0.0_f64;
        let a_br_gate = 1.0 - (-1.0 / (sr * 0.003)).exp();
        let mut cur_a_rad = (-2.0 * PI * 3800.0 / sr).exp();
        let mut rad_step = 0.0_f64;
        let mut prev_burst_imp = 0.0_f64;
        let mut shock_env = 0.0_f64;
        let mut shock_amp = 0.0_f64;
        let mut shock_is_affr = false;
        let shock_alpha = (-1.0 / (sr * 0.0022)).exp();
        let shock_alpha_affr = (-1.0 / (sr * 0.0028)).exp();
        let mut shock_phase = 1.0_f64;
        let shock_phase_step = 1.0 / (sr * 0.00035);
        let mut last_f0 = -1.0_f64;
        let mut consonant_lp = 0.0_f64;
        let mut tract_lp = 0.0_f64;
        let consonant_coef = (-2.0 * PI * 1800.0 / sr).exp();
        let mut tract_soft1 = 0.0_f64;
        let mut tract_soft2 = 0.0_f64;
        let mut tn_soft_coef = 0.0_f64;
        let mut last_tn_lp_hz = 0.0_f64;

        let mut nasal_lp1 = 0.0_f64;
        let mut nasal_lp2 = 0.0_f64;
        let nasal_coef = if nasal_lowpass_hz > 0.0 { (-2.0 * PI * nasal_lowpass_hz / sr).exp() } else { 0.0 };

        let mut prev_amp = 0.0_f64;
        let mut prev_asp = 0.0_f64;
        let mut prev_nasal = 0.0_f64;
        let mut prev_fric = 0.0_f64;
        let mut prev_tn = 0.0_f64;
        let mut prev_mix = 0.0_f64;
        let mut prev_cavity = 0.0_f64;
        let mut prev_cavity_gain = 1.0_f64;

        let bcoef = (-2.0 * PI * 6000.0 / sr).exp();
        let asp_coef = (-2.0 * PI * if studio { 950.0 } else { 1000.0 } / sr).exp();
        let mut asp_lp = 0.0_f64;
        let mut asp_lp2 = 0.0_f64;
        let air_coef = (-2.0 * PI * 6500.0 / sr).exp();
        let body_coef = (-2.0 * PI * 2800.0 / sr).exp();
        let mut asp_air = 0.0_f64;
        let mut asp_body = 0.0_f64;

        let use_mode_b_delay = mode_b && !raw_src && !studio;
        let mut mode_b_delay = [0.0_f64; 18];
        let mut delay_index: usize = 0;

        let mut body_prev = 0.0_f64;
        let mut fric_prev = 0.0_f64;
        let mut mask_prev = 0.0_f64;
        let mask_alpha = 1.0 - (-1.0 / (sr * 0.012)).exp();

        let sin_tab = &self.sin_tab;
        let harm_octaves = &self.harm_octaves;
        let frames = &self.frames_buf;
        let inv_hop = 1.0 / hop_f;
        let inv_sr = 1.0 / sr;

        for fr in 0..n_frames {
            let base = fr * FRAME_STRIDE;
            let effort = frames[base + 36];
            let ep = if effort < 0.0 { 37 } else { 41 };
            let endpoint = &cfg[ep..ep + 4];
            let depth = endpoint[3];
            let pulse_norm = if effort == 0.0 { 1.0 } else {
                1.0 / (1.0 - 1.25 * depth + 67.0 / 128.0 * depth * depth).sqrt()
            };
            let pairs: [(f64, f64); 6] = [
                (frames[base], frames[base + 1]),
                (frames[base + 2], frames[base + 3]),
                (frames[base + 4], frames[base + 5]),
                (frames[base + 6], frames[base + 7]),
                (frames[base + 8], frames[base + 9]),
                (frames[base + 10], frames[base + 11]),
            ];
            let f0 = frames[base + 12];
            let c_av = frames[base + 13];
            let c_ah = frames[base + 14];
            let c_fric = frames[base + 15];
            let c_tn = frames[base + 16];
            let c_tn_lp_hz = frames[base + 17];
            let c_nasal = frames[base + 18];
            let np_hz = frames[base + 19];
            let nzf = frames[base + 20];
            let n_mix = frames[base + 21];
            let friction_hz = frames[base + 22];
            let friction_bw = frames[base + 23];
            let c_front_cavity = frames[base + 24];
            let cavity_gain = frames[base + 25];
            let c_rd = frames[base + 26];
            let c_oq = frames[base + 27];
            let c_ta = frames[base + 28];
            let c_fry = frames[base + 29];
            let org_frame_gate = frames[base + 30];
            let c_org_air = frames[base + 31];
            let harm_tilt_db = frames[base + 32];
            let voiced_high_gate = frames[base + 33];
            let eff_tilt = frames[base + 34];
            let source_tilt = frames[base + 35];
            let raw_cav_fc = frames[base + 37];
            let c_lip = frames[base + 38];
            let c_abd = frames[base + 39];
            let c_asp_sc = frames[base + 40];
            let c_burst_imp = frames[base + 41];
            let c_burst_gain = frames[base + 42];
            let is_affr_burst = frames[base + 43] != 0.0;
            let raw_fric_hz = frames[base + 44];
            let is_breath = frames[base + 45] != 0.0;

            let first = fr == 0;
            if use_humanize {
                res[0].set_damped(&rc, pairs[0].0, pairs[0].1, humanize_amt, first, if studio { 0.035 } else { 0.0 }, 1.0);
                if studio {
                    res[1].set_damped(&rc, pairs[1].0, pairs[1].1, humanize_amt, first, 0.0, 0.45);
                    for r in 2..6 {
                        res[r].set(&rc, pairs[r].0, pairs[r].1, first);
                    }
                } else {
                    for r in 1..6 {
                        res[r].set(&rc, pairs[r].0, pairs[r].1, first);
                    }
                }
            } else {
                for r in 0..6 {
                    res[r].set(&rc, pairs[r].0, pairs[r].1, first);
                }
            }
            if first && use_humanize {
                prev_rd = c_rd;
                prev_oq = c_oq;
                prev_ta = c_ta;
            }
            if studio {
                let sub_open_st = ((c_rd - 0.65) / 1.5).clamp(0.0, 1.0);
                if let Some(ref mut sn) = sub_notch {
                    let sub1_hz = (600.0 * nas_scale).clamp(460.0, 820.0);
                    sn.set(sr, hop_f, sub1_hz, 4.2, -(1.3 + 2.2 * sub_open_st) * humanize_amt, first);
                }
                if let Some(ref mut sn2) = sub_notch2 {
                    let sub2_hz = (1280.0 * nas_scale.powf(0.78)).clamp(1080.0, 1620.0);
                    sn2.set(sr, hop_f, sub2_hz, 5.2, -(0.9 + 1.4 * sub_open_st) * humanize_amt, first);
                }
                if let Some(ref mut pn) = pharynx_notch {
                    let px_st_hz = (4400.0 * (hum_pf_ref / 5200.0).powf(0.45)
                        + 0.10 * (pairs[0].0 - 500.0)
                        - 0.06 * (pairs[1].0 - 1500.0))
                        .clamp(3800.0, 5200.0);
                    pn.set(sr, hop_f, px_st_hz, 3.6, -2.0 * humanize_amt, first);
                }
                if let Some(ref mut hs) = hpc_shelf {
                    hs.set(sr, hop_f, pairs[5].0, first);
                }
                if let Some(ref mut afr) = air_form_res {
                    let fc_air = (5600.0 + 1.8 * pairs[1].0 - 1800.0 * c_lip).clamp(7200.0, 10800.0);
                    afr.set(&rc, fc_air, 5200.0, first);
                }
                let f_rad_st = (3400.0 + 2.2 * (pairs[0].0 - 400.0) - 2200.0 * c_lip).clamp(2600.0, 5200.0);
                let tgt_a_rad = (-2.0 * PI * f_rad_st / sr).exp();
                if first {
                    cur_a_rad = tgt_a_rad;
                }
                rad_step = (tgt_a_rad - cur_a_rad) * inv_hop;
            } else {
                if let Some(ref mut sn) = sub_notch {
                    let sub_hz = (1340.0 * nas_scale).clamp(900.0, 2200.0);
                    let sub_open = ((c_rd - 0.65) / 1.5).clamp(0.0, 1.0);
                    sn.set(sr, hop_f, sub_hz, 5.5, -(1.6 + 1.9 * sub_open) * humanize_amt, first);
                }
                if let Some(ref mut pn) = pharynx_notch {
                    let px_hz = (4680.0 * (hum_pf_ref / 5200.0).powf(0.35) + 0.08 * (pairs[0].0 - 500.0))
                        .clamp(4100.0, 5400.0);
                    pn.set(sr, hop_f, px_hz, 4.5, -2.2 * humanize_amt, first);
                }
            }
            let c_rd_open_st = if studio { ((c_rd - 0.72) / 1.35).max(0.0) } else { 0.0 };
            let c_st_asp_gate = if studio { 0.28 * (0.45 + 2.0 * c_rd_open_st * c_rd_open_st) * (1.0 + 2.2 * c_abd) } else { 1.0 };
            let f0_for_turb = if f0 > 0.0 { f0 } else { 200.0 };
            let low_turb_scale = (250.0 / f0_for_turb.max(120.0)).clamp(0.85, 1.28);
            let c_st_turb_gain = if studio {
                (eff_breath * 0.075 + 0.015 * c_rd_open_st.powf(1.45)) * low_turb_scale * (1.0 + 2.5 * c_abd) * (0.35 + 0.65 * c_asp_sc)
            } else {
                0.0
            };
            let tgt_br_gate = if studio && is_breath { 1.0 } else { 0.0 };

            if nasal_tract {
                nas_hifi.set(&rc, nas_scale, nas_bw_scale, pairs[0].0, first);
            } else {
                let nf = 270.0 + 0.04 * (pairs[0].0 - 500.0);
                nas_std.set(sr, hop_f, nf, 90.0, nf, 110.0, first);
            }
            n_pole.set(&rc, np_hz, 100.0, first);
            n_zero.set(sr, hop_f, nzf, nasal_zero_bw(np_hz, nzf), first);
            let st_is_sibilant = studio && raw_fric_hz >= 2800.0 && c_front_cavity > 0.05 && !is_breath;
            let sib_air_amt = if st_is_sibilant {
                if raw_fric_hz >= 5000.0 { 0.88 } else if raw_fric_hz >= 3700.0 { 1.45 } else { 0.48 }
            } else {
                0.0
            };
            fric_res.set(&rc, friction_hz, friction_bw, first);
            fric_hp.set(&rc, (friction_hz * 0.55).min(7000.0), 2400.0, first);
            if let Some(ref mut sr_sh) = shock_res {
                if studio && is_affr_burst {
                    last_shock_hz = if raw_fric_hz >= 5000.0 { 2700.0 } else if raw_fric_hz >= 3700.0 { 3600.0 } else { 2300.0 };
                    last_shock_bw = 1600.0;
                } else if !(shock_env > 0.01) {
                    last_shock_hz = friction_hz;
                    last_shock_bw = (friction_bw * 0.8).max(900.0);
                }
                let snap_shock = first || (c_burst_imp > 0.7 && prev_burst_imp <= 0.15 && shock_env <= 0.01);
                sr_sh.set(&rc, last_shock_hz, last_shock_bw, snap_shock);
            }
            if let Some(ref mut fc) = front_cavity {
                let cavity_fc = if studio { raw_cav_fc } else { (friction_hz / 25.0).round() * 25.0 };
                fc.set(sr, hop_f, cavity_fc, studio, first);
                if first {
                    prev_cavity_gain = cavity_gain;
                }
            }
            if c_tn_lp_hz > 0.0 && c_tn_lp_hz != last_tn_lp_hz {
                tn_soft_coef = (-2.0 * PI * c_tn_lp_hz / sr).exp();
                last_tn_lp_hz = c_tn_lp_hz;
            }
            if studio {
                if c_burst_imp > 0.7 && prev_burst_imp <= 0.15 {
                    shock_env = 1.0;
                    shock_phase = 0.0;
                    shock_is_affr = is_affr_burst;
                    shock_amp = if shock_is_affr { (c_burst_gain * 0.90).min(0.14) } else { c_burst_gain.min(0.095) };
                }
                prev_burst_imp = c_burst_imp;
            }
            if last_f0 < 0.0 {
                last_f0 = f0;
            }
            src.set_harmonics(
                sr, hop_f, source_top, mode_b, studio, legacy_sound, f0, harm_tilt_db, &gl,
                if smooth_blend > 0.0 { pairs[5].0 } else { 0.0 },
                smooth_blend, organic_amt, org_frame_gate, humanize_amt, c_rd, first,
                lf_table.as_ref(), harm_octaves,
            );
            if voiced_high {
                src.set_voiced_high(
                    &rc, f0, &pairs, voiced_high_gate, n_mix, c_av, eff_tilt, source_tilt, &gl,
                    high_strength, compensate_high_eq, wideband, has_upper_air, air_power,
                    air_fraction, air_trim_gain, effort, endpoint, refine, tract_join, smooth_blend, perturb_blend,
                    studio, c_rd, legacy_sound, harm_octaves,
                );
            }

            let mut phase_cycles = 0.0_f64;
            let k_lim = src.k_cur;
            let active_limit = if legacy_sound {
                k_lim
            } else {
                k_lim.min(src.low_active_k.max(if voiced_high { src.high_active_k } else { 0 }).max(1))
            };
            let skip_harmonics = prev_amp == 0.0 && c_av == 0.0;
            let high_start = if voiced_high { active_limit.min(src.high_start) } else { active_limit };
            let mut master_ph = src.master_phase;

            for n in 0..hop {
                let idx = fr * hop + n;
                if idx >= slice_total {
                    break;
                }
                let last_sample = n == hop - 1;
                let mix = ((n + 1) as f64) * inv_hop;
                let mut sample_f0 = last_f0 + (f0 - last_f0) * mix;
                if use_organic {
                    if skip_harmonics {
                        org_shim_tgt = 1.0;
                        org_jit_tgt = 1.0;
                    }
                    org_shim_cur += (org_shim_tgt - org_shim_cur) * org_cycle_alpha;
                    org_jit_cur += (org_jit_tgt - org_jit_cur) * org_jit_alpha;
                    sample_f0 *= org_jit_cur;
                }
                let inc = sample_f0 * inv_sr;
                let mut gci_wrap = false;
                if use_humanize {
                    if master_ph + inc >= 1.0 { gci_wrap = true; }
                    master_ph += inc;
                    if master_ph >= 1.0 {
                        master_ph -= if master_ph < 2.0 { 1.0 } else { master_ph.floor() };
                    }
                } else if use_organic && !skip_harmonics && src.phase[0] + inc >= 1.0 {
                    gci_wrap = true;
                }
                if gci_wrap && !skip_harmonics {
                    if use_organic {
                        let og_eff = organic_amt * org_frame_gate;
                        if studio {
                            let gci_jit_depth = 0.0044 * og_eff + if jit > 0.0 { jit * 1.9 } else { 0.0 };
                            if og_eff > 1e-5 || gci_jit_depth > 1e-6 {
                                let g_shim_st = (org_cycle_rnd.next() + org_cycle_rnd.next() + org_cycle_rnd.next() - 1.5) * 2.0;
                                let g_jit_st = (org_cycle_rnd.next() + org_cycle_rnd.next() + org_cycle_rnd.next() - 1.5) * 2.0;
                                org_shim_tgt = (1.0 + 0.023 * og_eff * g_shim_st).clamp(0.91, 1.09);
                                org_jit_tgt = (1.0 + gci_jit_depth * g_jit_st).clamp(0.975, 1.025);
                            } else {
                                org_shim_tgt = 1.0;
                                org_jit_tgt = 1.0;
                            }
                        } else if og_eff > 1e-5 {
                            let g_shim = (org_cycle_rnd.next() + org_cycle_rnd.next() + org_cycle_rnd.next() - 1.5) * 2.0;
                            let g_jit = (org_cycle_rnd.next() + org_cycle_rnd.next() + org_cycle_rnd.next() - 1.5) * 2.0;
                            org_shim_tgt = (1.0 + 0.022 * og_eff * g_shim).clamp(0.91, 1.09);
                            org_jit_tgt = (1.0 + 0.0022 * og_eff * g_jit).clamp(0.99, 1.01);
                        } else {
                            org_shim_tgt = 1.0;
                            org_jit_tgt = 1.0;
                        }
                    }
                    if use_humanize {
                        fry_parity ^= 1;
                        if c_fry > 0.01 {
                            fry_gain_tgt = 1.0 + (if fry_parity != 0 { 0.16 } else { -0.16 }) * c_fry * humanize_amt;
                        } else {
                            fry_gain_tgt = 1.0;
                        }
                    }
                }
                if use_humanize {
                    if skip_harmonics || c_fry <= 0.01 {
                        fry_gain_tgt = 1.0;
                    }
                    fry_gain_cur += (fry_gain_tgt - fry_gain_cur) * fry_alpha;
                }
                phase_cycles += inc;
                let amp = prev_amp + (c_av - prev_amp) * mix;
                let asp = prev_asp + (c_ah - prev_asp) * mix;
                let nasal_amt = prev_nasal + (c_nasal - prev_nasal) * mix;
                let fg = prev_fric + (c_fric - prev_fric) * mix;

                let mut s = 0.0_f64;
                let mut high_source = 0.0_f64;

                if !skip_harmonics {
                    let k_full = (((band_limit / sample_f0).floor() as isize) - 1).clamp(0, active_limit as isize) as usize;
                    if use_humanize {
                        let m_ph_2048 = (master_ph * 2048.0) as f32;
                        let (s_part, h_part) = synth_harmonics_humanize(
                            &mut src,
                            sin_tab,
                            m_ph_2048,
                            sample_f0 as f32,
                            source_top as f32,
                            (1.0 / source_fade) as f32,
                            k_full,
                            high_start,
                            active_limit,
                            voiced_high,
                        );
                        s = s_part as f64;
                        high_source = h_part as f64;
                    } else {
                        let (s_part, h_part) = synth_harmonics_free(
                            &mut src,
                            sin_tab,
                            inc,
                            sample_f0,
                            source_top,
                            1.0 / source_fade,
                            k_full,
                            high_start,
                            active_limit,
                            voiced_high,
                        );
                        s = s_part;
                        high_source = h_part;
                    }
                    if last_sample {
                        for kz in 0..active_limit {
                            src.amp.data[kz] = src.target.data[kz];
                            if voiced_high {
                                src.high_amp.data[kz] = src.high_target.data[kz];
                            }
                            if use_humanize {
                                let ptz = src.phase_off_target[kz];
                                src.phase_off.data[kz] = (ptz - ptz.floor()) as f32;
                            }
                        }
                    }
                }

                if use_organic {
                    s *= org_shim_cur;
                    high_source *= org_shim_cur;
                }
                if use_humanize {
                    s *= fry_gain_cur;
                    high_source *= fry_gain_cur;
                }
                s *= 0.30;

                let mut open_gate = 0.0_f64;
                let mut rd_cur = 1.05_f64;
                if use_humanize {
                    rd_cur = prev_rd + (c_rd - prev_rd) * mix;
                    let oq_cur = prev_oq + (c_oq - prev_oq) * mix;
                    let ta_cur = prev_ta + (c_ta - prev_ta) * mix;
                    if !skip_harmonics {
                        let open_start = 1.0 - oq_cur;
                        if master_ph >= open_start {
                            let u_o = (master_ph - open_start) / oq_cur.max(0.15);
                            let u_s = (u_o * (1.28 - 0.28 * u_o)).min(1.0);
                            let u_idx = ((u_s * 1024.0) as usize).min(2048);
                            open_gate = sin_tab[u_idx] as f64;
                        } else {
                            let u_ret = 3.0 * master_ph / ta_cur.max(0.015);
                            open_gate = 0.35 / (1.0 + u_ret * (1.0 + 0.5 * u_ret));
                        }
                    }
                }

                let asp_white = noise.next() * 2.0 - 1.0;
                asp_lp = (1.0 - asp_coef) * asp_white + asp_coef * asp_lp;
                let mut asp_colour = asp_lp;
                if studio {
                    asp_lp2 = (1.0 - asp_coef) * asp_lp + asp_coef * asp_lp2;
                    asp_colour = asp_lp2;
                }
                if research && !studio {
                    asp_air = (1.0 - air_coef) * asp_white + air_coef * asp_air;
                    asp_body = (1.0 - body_coef) * asp_white + body_coef * asp_body;
                    asp_colour += asp_air_mix * (asp_air - asp_body);
                }
                let mut mod_sin = 0.0_f64;
                if !skip_harmonics {
                    let p0 = if use_humanize { master_ph } else { src.phase[0] };
                    let sx0 = p0 * 2048.0;
                    let i0p = (sx0 as usize) & 2047;
                    let s0p = sin_tab[i0p] as f64;
                    mod_sin = s0p + ((sin_tab[i0p + 1] as f64) - s0p) * (sx0 - (sx0.floor()));
                }
                let asp_depth = 0.8 * amp.min(1.0);
                let mut asp_mod = if asp_depth > 0.0 {
                    (1.0 + asp_depth * mod_sin) / (1.0 + asp_depth * asp_depth * 0.5).sqrt()
                } else {
                    1.0
                };
                if studio {
                    if use_humanize && !skip_harmonics {
                        let flow_sq = (0.22 + 1.45 * open_gate * open_gate) * 1.14;
                        asp_mod += (flow_sq - asp_mod) * humanize_amt * amp.min(1.0);
                        let g_white_st = glottal_noise.next() * 2.0 - 1.0;
                        mid_lp = (1.0 - mid_lp_coef) * g_white_st + mid_lp_coef * mid_lp;
                        mid_hp = (1.0 - mid_hp_coef) * mid_lp + mid_hp_coef * mid_hp;
                        let mid_band_st = (mid_lp - mid_hp) * mid_norm;
                        s += mid_band_st * c_st_turb_gain * (0.35 + 0.65 * amp.min(1.0)) * flow_sq;
                    }
                    s += asp_colour * 1.41 * asp * 0.55 * c_st_asp_gate * asp_mod;
                } else {
                    if use_humanize && !skip_harmonics {
                        let lf_asp_mod = (0.35 + 1.25 * open_gate) * 0.92;
                        asp_mod += (lf_asp_mod - asp_mod) * humanize_amt * amp.min(1.0);
                    }
                    s += asp_colour * 1.41 * asp * 0.6 * asp_mod;
                    if use_humanize && !skip_harmonics {
                        let g_white = glottal_noise.next() * 2.0 - 1.0;
                        mid_lp = (1.0 - mid_lp_coef) * g_white + mid_lp_coef * mid_lp;
                        mid_hp = (1.0 - mid_hp_coef) * mid_lp + mid_hp_coef * mid_hp;
                        let mid_band = (mid_lp - mid_hp) * mid_norm;
                        let flow_mod = (0.28 + 1.38 * open_gate) * 0.92;
                        let turb_level = humanize_amt
                            * (0.015 + 0.052 * (rd_cur - 0.85).max(0.0))
                            * (0.35 + 0.65 * amp.min(1.0));
                        s += mid_band * turb_level * flow_mod;
                    }
                }
                hf_y = (1.0 - bcoef) * s + bcoef * hf_y;
                s = hf_y;

                let mut y = s * amp;
                let mut nasal_input = y;
                if use_mode_b_delay {
                    nasal_input = mode_b_delay[delay_index];
                    mode_b_delay[delay_index] = y;
                }
                let tn_amt = prev_tn + (c_tn - prev_tn) * mix;
                if c_tn_lp_hz > 0.0 {
                    if tn_amt > 0.0 || prev_tn > 0.0 {
                        let mut tw = tnoise.next() * 2.0 - 1.0;
                        if consonant_softness > 0.0 {
                            tract_lp = (1.0 - consonant_coef) * tw + consonant_coef * tract_lp;
                            tw = (1.0 - consonant_softness) * tw + consonant_softness * tract_lp;
                        }
                        tract_soft1 = (1.0 - tn_soft_coef) * tw + tn_soft_coef * tract_soft1;
                        tract_soft2 = (1.0 - tn_soft_coef) * tract_soft1 + tn_soft_coef * tract_soft2;
                        y += tract_soft2 * tn_amt;
                    } else {
                        if consonant_softness > 0.0 { tract_lp *= consonant_coef; }
                        tract_soft1 *= tn_soft_coef;
                        tract_soft2 *= tn_soft_coef;
                    }
                } else {
                    if tract_soft1 != 0.0 || tract_soft2 != 0.0 {
                        tract_soft1 = 0.0;
                        tract_soft2 = 0.0;
                    }
                    if consonant_softness > 0.0 {
                        if tn_amt > 0.0 || prev_tn > 0.0 {
                            let tw = tnoise.next() * 2.0 - 1.0;
                            tract_lp = (1.0 - consonant_coef) * tw + consonant_coef * tract_lp;
                            y += ((1.0 - consonant_softness) * tw + consonant_softness * tract_lp) * tn_amt;
                        } else {
                            tract_lp *= consonant_coef;
                        }
                    } else if tn_amt > 0.0 || prev_tn > 0.0 {
                        y += (tnoise.next() * 2.0 - 1.0) * tn_amt;
                    }
                }

                if !raw_src {
                    y = if use_humanize { res[0].run_damped(y, open_gate) } else { res[0].run(y) };
                    if studio && use_humanize {
                        y = res[1].run_damped(y, open_gate);
                        for r2 in 2..6 {
                            y = res[r2].run(y);
                        }
                    } else {
                        for r2 in 1..6 {
                            y = res[r2].run(y);
                        }
                    }
                    if let Some(ref mut hs) = hpc_shelf { y = hs.run(y); }
                    let yn = n_zero.run(n_pole.run(y));
                    y += (yn - y) * (prev_mix + (n_mix - prev_mix) * mix);
                    let nasal_raw = if nasal_tract { nas_hifi.run(nasal_input) } else { nas_std.run(nasal_input) };
                    let st_nas_gain = if studio { 0.85 } else { 0.5 };
                    let ny = if nasal_lowpass_hz > 0.0 {
                        nasal_lp1 = (1.0 - nasal_coef) * nasal_raw + nasal_coef * nasal_lp1;
                        nasal_lp2 = (1.0 - nasal_coef) * nasal_lp1 + nasal_coef * nasal_lp2;
                        nasal_lp2 * nasal_amt * st_nas_gain
                    } else {
                        nasal_raw * nasal_amt * st_nas_gain
                    };
                    y = y * (1.0 - nasal_amt) + ny;
                    if let Some(ref mut sn) = sub_notch { y = sn.run(y); }
                    if let Some(ref mut sn2) = sub_notch2 { y = sn2.run(y); }
                    if let Some(ref mut pn) = pharynx_notch { y = pn.run(y); }
                }
                let body_sample = y;
                if voiced_high {
                    if use_mode_b_delay {
                        let high_sample = mode_b_delay[delay_index + 12];
                        mode_b_delay[delay_index + 12] = high_source * 0.30 * amp;
                        y += high_sample;
                    } else {
                        y += high_source * 0.30 * amp;
                    }
                }
                if let Some(ref mut pf) = piriform {
                    y = pf.run(y);
                }

                let nz = noise.next() * 2.0 - 1.0;
                let mut fz = fric_res.run(nz) - fric_hp.run(nz) * 0.5;
                if let Some(ref mut fc) = front_cavity {
                    let guided = fc.run(fz) * (prev_cavity_gain + (cavity_gain - prev_cavity_gain) * mix);
                    let cavity_amount = prev_cavity + (c_front_cavity - prev_cavity) * mix;
                    if cavity_amount > 0.0 {
                        fz += (guided - fz) * cavity_amount;
                    }
                }
                if studio {
                    sib_air_hp = (1.0 - sib_air_hp_coef) * nz + sib_air_hp_coef * sib_air_hp;
                    let sib_air_hi = nz - sib_air_hp;
                    sib_air_lp1 = (1.0 - sib_air_lp_coef) * sib_air_hi + sib_air_lp_coef * sib_air_lp1;
                    sib_air_lp2 = (1.0 - sib_air_lp_coef) * sib_air_lp1 + sib_air_lp_coef * sib_air_lp2;
                    if sib_air_amt > 0.0 {
                        fz += sib_air_lp2 * sib_air_amt * 1.45;
                    }
                }
                let mut friction = if consonant_softness > 0.0 {
                    consonant_lp = (1.0 - consonant_coef) * fz + consonant_coef * consonant_lp;
                    ((1.0 - consonant_softness) * fz + consonant_softness * consonant_lp) * fg * fric_trim
                } else {
                    fz * fg * fric_trim
                };
                if studio {
                    if let Some(ref mut sr_sh) = shock_res {
                        let mut shock_in = 0.0_f64;
                        if shock_env > 0.01 {
                            let n_w = if shock_phase < 1.0 { (2.0 * PI * shock_phase).sin() * 1.35 } else { 0.0 };
                            if shock_phase < 1.0 { shock_phase += shock_phase_step; }
                            let r_sp = noise.next();
                            let spk = if r_sp < 0.09 { -1.6 } else if r_sp > 0.91 { 1.6 } else { 0.0 };
                            if shock_is_affr {
                                shock_in = shock_env * (n_w * 1.15 + (noise.next() * 2.0 - 1.0) * 1.15 + spk * 0.8);
                                shock_env *= shock_alpha_affr;
                            } else {
                                shock_in = shock_env * (n_w + spk);
                                shock_env *= shock_alpha;
                            }
                        }
                        friction += sr_sh.run(shock_in) * shock_amp * 0.80;
                    }
                }
                if use_mode_b_delay {
                    let delayed_fric = mode_b_delay[delay_index + 6];
                    mode_b_delay[delay_index + 6] = friction;
                    friction = delayed_fric;
                    delay_index += 1;
                    if delay_index == 6 { delay_index = 0; }
                }
                if studio {
                    let rad_diff = y - rad_prev;
                    rad_prev = y;
                    cur_a_rad += rad_step;
                    rad_y = (1.0 - cur_a_rad) * rad_diff + cur_a_rad * rad_y;
                    let fric_rad = friction - fric_rad_prev;
                    fric_rad_prev = friction;
                    br_lp1 = (1.0 - breath_lp_coef) * fric_rad + breath_lp_coef * br_lp1;
                    br_lp2 = (1.0 - breath_lp_coef) * br_lp1 + breath_lp_coef * br_lp2;
                    breath_gate += (tgt_br_gate - breath_gate) * a_br_gate;
                    let mut fric_rad_out = fric_rad + (br_lp2 - fric_rad) * breath_gate;
                    let fu_y = fu_b0 * fric_rad_out + fu_b1 * fu_x1 + fu_b2 * fu_x2 - fu_a1 * fu_y1 - fu_a2 * fu_y2;
                    fu_x2 = fu_x1;
                    fu_x1 = fric_rad_out;
                    fu_y2 = fu_y1;
                    fu_y1 = fu_y;
                    fric_rad_out = fu_y;
                    self.out_buf[idx] = (rad_y + fric_rad_out) as f32;
                } else {
                    y += friction;
                    let rad = y - rad_prev;
                    rad_prev = y;
                    self.out_buf[idx] = rad as f32;
                }

                if refine {
                    self.body_stage[idx] = (body_sample - body_prev) as f32;
                    body_prev = body_sample;
                    self.fric_stage[idx] = (friction - fric_prev) as f32;
                    fric_prev = friction;
                    let body_gate = if voiced_high_gate > 0.0 && amp > 1e-5 { 1.0 } else { 0.0 };
                    mask_prev += (body_gate - mask_prev) * mask_alpha;
                    self.body_mask[idx] = mask_prev as f32;
                }

                if has_upper_air {
                    src.air_amp = if last_sample { src.air_target } else { src.air_amp + src.air_step };
                    let mut air_mod = 1.0_f64;
                    if !skip_harmonics {
                        if studio && use_humanize {
                            let flow_sq_air = (0.28 + 1.35 * open_gate * open_gate) * 1.10;
                            air_mod = 1.0 + amp.min(1.0) * (flow_sq_air - 1.0);
                        } else {
                            let open = 0.5 + 0.5 * mod_sin;
                            let pulsed_old = (0.16 + 0.84 * open * open) * 1.76963;
                            let pulsed_new = (0.72 + 0.28 * open * open) / 0.85888;
                            let pulsed_blend = smooth_blend.max(perturb_blend);
                            let mut pulsed = if pulsed_blend >= 1.0 {
                                pulsed_new
                            } else if pulsed_blend <= 0.0 {
                                pulsed_old
                            } else {
                                pulsed_old + (pulsed_new - pulsed_old) * pulsed_blend
                            };
                            if effort != 0.0 {
                                pulsed += effort.abs() * ((1.0 - depth + depth * open * open) * pulse_norm - pulsed);
                            }
                            air_mod = 1.0 + amp.min(1.0) * (pulsed - 1.0);
                        }
                    }
                    let mut air_sample = if perturb_blend > 0.0 {
                        let base_noise = (air_noise.next() + air_noise.next() - 1.0) * 1.41421356;
                        if velvet_rem == 0 {
                            let vlen = 3 + (air_noise.next() * 5.0).floor() as i32;
                            velvet_pos = (air_noise.next() * (vlen as f64)).floor() as i32;
                            velvet_sign = (if air_noise.next() < 0.5 { -1.0 } else { 1.0 }) * ((vlen as f64) / 3.0).sqrt();
                            velvet_rem = vlen;
                        }
                        velvet_rem -= 1;
                        let raw_velvet = if velvet_rem == velvet_pos { velvet_sign } else { 0.0 };
                        let ap_y = -0.5 * raw_velvet + air_ap_z;
                        air_ap_z = raw_velvet + 0.5 * ap_y;
                        if perturb_blend >= 1.0 {
                            0.63372 * ap_y + 0.77356 * base_noise
                        } else {
                            let vw = 0.63372 * perturb_blend;
                            let nw = (1.0 - vw * vw).max(0.0).sqrt();
                            vw * ap_y + nw * base_noise
                        }
                    } else {
                        air_noise.next() * 2.0 - 1.0
                    };
                    if studio {
                        if let Some(ref mut afr) = air_form_res {
                            air_sample = afr.run(air_sample);
                            air_lp1 = (1.0 - air_lp_coef) * air_sample + air_lp_coef * air_lp1;
                            air_lp2 = (1.0 - air_lp_coef) * air_lp1 + air_lp_coef * air_lp2;
                            air_sample = air_lp2;
                        }
                    }
                    let org_air_s = if use_organic { prev_org_air + (c_org_air - prev_org_air) * mix } else { 1.0 };
                    self.upper_air[idx] = (air_sample * src.air_amp * 0.30 * amp * air_mod * org_air_s) as f32;
                }
            }

            if use_humanize {
                src.master_phase = master_ph;
                if skip_harmonics {
                    for ka in 0..k_lim {
                        src.amp.data[ka] = src.target.data[ka];
                        if voiced_high {
                            src.high_amp.data[ka] = src.high_target.data[ka];
                        }
                        let pth = src.phase_off_target[ka];
                        src.phase_off.data[ka] = (pth - pth.floor()) as f32;
                    }
                } else if active_limit < k_lim {
                    for ki in active_limit..k_lim {
                        let pti = src.phase_off_target[ki];
                        src.phase_off.data[ki] = (pti - pti.floor()) as f32;
                    }
                }
            } else if skip_harmonics {
                for kp in 0..src.count {
                    let sp = src.phase[kp] + phase_cycles * ((kp + 1) as f64);
                    src.phase[kp] = sp - sp.floor();
                }
                for ka in 0..k_lim {
                    src.amp.data[ka] = src.target.data[ka];
                    if voiced_high {
                        src.high_amp.data[ka] = src.high_target.data[ka];
                    }
                }
            } else if src.wideband || active_limit < src.count {
                let inactive_start = if legacy_sound {
                    if src.wideband { src.k_cur } else { src.count }
                } else {
                    active_limit
                };
                for inactive in inactive_start..src.count {
                    let sp = src.phase[inactive] + phase_cycles * ((inactive + 1) as f64);
                    src.phase[inactive] = sp - sp.floor();
                }
            }
            if voiced_high {
                src.high_start = src.next_high_start;
                src.high_silent = src.next_high_silent;
            }
            last_f0 = f0;
            prev_amp = c_av;
            prev_asp = c_ah;
            prev_nasal = c_nasal;
            prev_fric = c_fric;
            prev_tn = c_tn;
            prev_mix = n_mix;
            if use_organic { prev_org_air = c_org_air; }
            if use_humanize { prev_rd = c_rd; prev_oq = c_oq; prev_ta = c_ta; }
            if let Some(ref mut fc) = front_cavity {
                prev_cavity = c_front_cavity;
                prev_cavity_gain = cavity_gain;
                fc.snap();
            }
        }

        // Delay compensation + in-WASM SIMD FFT EQ stages (zero copies back to JS!)
        if use_mode_b_delay && slice_total > 6 {
            self.out_buf.copy_within(6..slice_total, 0);
            self.out_buf[slice_total - 6..slice_total].fill(0.0);
        }
        if refine {
            if slice_total > 6 {
                self.body_stage.copy_within(6..slice_total, 0);
                self.body_stage[slice_total - 6..slice_total].fill(0.0);
                self.fric_stage.copy_within(6..slice_total, 0);
                self.fric_stage[slice_total - 6..slice_total].fill(0.0);
                self.body_mask.copy_within(6..slice_total, 0);
                self.body_mask[slice_total - 6..slice_total].fill(0.0);
            }
            let body_curve = build_refine_curve(REFINE_BODY);
            self.apply_cached_eq(1, &body_curve, sr, hd, true);
            for i in 0..slice_total {
                self.out_buf[i] += self.body_stage[i] * self.body_mask[i];
            }
            let fric_curve = build_refine_curve(REFINE_FRICTION);
            self.apply_cached_eq(2, &fric_curve, sr, hd, true);
            for i in 0..slice_total {
                self.out_buf[i] += self.fric_stage[i];
            }
        }
        if has_upper_air && air_eq_len > 0 {
            let air_curve: Vec<f64> = self.air_eq_buf[..air_eq_len.min(64)].to_vec();
            self.apply_cached_eq(3, &air_curve, sr, hd, false);
            let frames = &self.frames_buf[..n_frames * FRAME_STRIDE];
            if !studio && frames.chunks_exact(FRAME_STRIDE).any(|f| f[36] != 0.0) {
                let input = self.upper_air[..slice_total].to_vec();
                for (f, frame) in frames.chunks_exact(FRAME_STRIDE).enumerate() {
                    let amount = frame[36];
                    if amount == 0.0 { continue; }
                    let taps = if amount < 0.0 { &kernels[..13] } else { &kernels[13..] };
                    for i in f * hop..slice_total.min((f + 1) * hop) {
                        let dry = input[i] as f64;
                        let mut filtered = dry * taps[0];
                        for j in 1..13 {
                            let left = if i >= j { input[i-j] } else { 0.0 };
                            let right = input.get(i+j).copied().unwrap_or(0.0);
                            filtered += taps[j] * (left as f64 + right as f64);
                        }
                        self.upper_air[i] = (dry + amount.abs() * (filtered - dry)) as f32;
                    }
                }
            }
            for i in 0..slice_total {
                self.out_buf[i] += self.upper_air[i];
            }
        }
        if !raw_src && has_out_eq && out_eq_len > 0 {
            let out_curve: Vec<f64> = self.out_eq_buf[..out_eq_len.min(64)].to_vec();
            self.apply_cached_eq(0, &out_curve, sr, hd, false);
        }

        slice_total
    }
}

#[inline(always)]
fn sin_lookup_scalar(sin_tab: &[f32; 2049], sx: f32) -> f32 {
    let i0 = sx as i32;
    let fr = sx - (i0 as f32);
    let idx = (i0 & 2047) as usize;
    unsafe {
        let s0 = *sin_tab.get_unchecked(idx);
        let s1 = *sin_tab.get_unchecked(idx + 1);
        s0 + (s1 - s0) * fr
    }
}

#[allow(clippy::too_many_arguments)]
#[inline]
fn synth_harmonics_humanize(
    src: &mut VocalSource,
    sin_tab: &[f32; 2049],
    m_ph_2048: f32,
    sample_f0: f32,
    source_top: f32,
    inv_source_fade: f32,
    k_full: usize,
    high_start: usize,
    active_limit: usize,
    voiced_high: bool,
) -> (f32, f32) {
    let mut s = 0.0_f32;
    let mut high_source = 0.0_f32;

    let amp = &mut src.amp.data;
    let step = &src.step.data;
    let hamp = &mut src.high_amp.data;
    let hstep = &src.high_step.data;
    let po = &mut src.phase_off.data;
    let po_step = &src.phase_off_step.data;

    let k_low = if voiced_high { k_full.min(high_start) } else { k_full };

    // Region 1: 0 .. k_low (low harmonics only, full band) — SIMD f32x4!
    let mut k = 0usize;
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    unsafe {
        let v_mph = f32x4_splat(m_ph_2048);
        let v_2048 = f32x4_splat(2048.0);
        let v_mask = i32x4_splat(2047);
        let v_step4 = f32x4_splat(4.0);
        let mut v_k = f32x4(1.0, 2.0, 3.0, 4.0);
        let mut s_acc = f32x4_splat(0.0);
        let sin_p = sin_tab.as_ptr();
        let amp_p = amp.as_mut_ptr();
        let stp_p = step.as_ptr();
        let po_p = po.as_mut_ptr();
        let pos_p = po_step.as_ptr();
        while k + 4 <= k_low {
            let po_v = f32x4_add(v128_load(po_p.add(k) as *const v128), v128_load(pos_p.add(k) as *const v128));
            v128_store(po_p.add(k) as *mut v128, po_v);
            let a_v = f32x4_add(v128_load(amp_p.add(k) as *const v128), v128_load(stp_p.add(k) as *const v128));
            v128_store(amp_p.add(k) as *mut v128, a_v);
            let sx = f32x4_add(f32x4_mul(v_k, v_mph), f32x4_mul(po_v, v_2048));
            let i_v = i32x4_trunc_sat_f32x4(sx);
            let fr_v = f32x4_sub(sx, f32x4_convert_i32x4(i_v));
            let im = v128_and(i_v, v_mask);
            let i0 = i32x4_extract_lane::<0>(im) as usize;
            let i1 = i32x4_extract_lane::<1>(im) as usize;
            let i2 = i32x4_extract_lane::<2>(im) as usize;
            let i3 = i32x4_extract_lane::<3>(im) as usize;
            let s0 = f32x4(*sin_p.add(i0), *sin_p.add(i1), *sin_p.add(i2), *sin_p.add(i3));
            let s1 = f32x4(*sin_p.add(i0 + 1), *sin_p.add(i1 + 1), *sin_p.add(i2 + 1), *sin_p.add(i3 + 1));
            let sine = f32x4_add(s0, f32x4_mul(f32x4_sub(s1, s0), fr_v));
            s_acc = f32x4_add(s_acc, f32x4_mul(a_v, sine));
            v_k = f32x4_add(v_k, v_step4);
            k += 4;
        }
        s += f32x4_extract_lane::<0>(s_acc)
            + f32x4_extract_lane::<1>(s_acc)
            + f32x4_extract_lane::<2>(s_acc)
            + f32x4_extract_lane::<3>(s_acc);
    }
    while k < k_low {
        let po_k = po[k] + po_step[k];
        po[k] = po_k;
        let a_k = amp[k] + step[k];
        amp[k] = a_k;
        if a_k != 0.0 {
            let sx = ((k + 1) as f32) * m_ph_2048 + po_k * 2048.0;
            s += a_k * sin_lookup_scalar(sin_tab, sx);
        }
        k += 1;
    }

    if voiced_high {
        // Region 2: k_low .. k_full (both low & high harmonics, full band) — SIMD f32x4!
        let mut kh = k_low;
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let v_mph = f32x4_splat(m_ph_2048);
            let v_2048 = f32x4_splat(2048.0);
            let v_mask = i32x4_splat(2047);
            let v_step4 = f32x4_splat(4.0);
            let kf0 = (kh + 1) as f32;
            let mut v_k = f32x4(kf0, kf0 + 1.0, kf0 + 2.0, kf0 + 3.0);
            let mut s_acc = f32x4_splat(0.0);
            let mut h_acc = f32x4_splat(0.0);
            let sin_p = sin_tab.as_ptr();
            let amp_p = amp.as_mut_ptr();
            let stp_p = step.as_ptr();
            let hamp_p = hamp.as_mut_ptr();
            let hstp_p = hstep.as_ptr();
            let po_p = po.as_mut_ptr();
            let pos_p = po_step.as_ptr();
            while kh + 4 <= k_full {
                let po_v = f32x4_add(v128_load(po_p.add(kh) as *const v128), v128_load(pos_p.add(kh) as *const v128));
                v128_store(po_p.add(kh) as *mut v128, po_v);
                let a_v = f32x4_add(v128_load(amp_p.add(kh) as *const v128), v128_load(stp_p.add(kh) as *const v128));
                v128_store(amp_p.add(kh) as *mut v128, a_v);
                let ha_v = f32x4_add(v128_load(hamp_p.add(kh) as *const v128), v128_load(hstp_p.add(kh) as *const v128));
                v128_store(hamp_p.add(kh) as *mut v128, ha_v);
                let sx = f32x4_add(f32x4_mul(v_k, v_mph), f32x4_mul(po_v, v_2048));
                let i_v = i32x4_trunc_sat_f32x4(sx);
                let fr_v = f32x4_sub(sx, f32x4_convert_i32x4(i_v));
                let im = v128_and(i_v, v_mask);
                let i0 = i32x4_extract_lane::<0>(im) as usize;
                let i1 = i32x4_extract_lane::<1>(im) as usize;
                let i2 = i32x4_extract_lane::<2>(im) as usize;
                let i3 = i32x4_extract_lane::<3>(im) as usize;
                let s0 = f32x4(*sin_p.add(i0), *sin_p.add(i1), *sin_p.add(i2), *sin_p.add(i3));
                let s1 = f32x4(*sin_p.add(i0 + 1), *sin_p.add(i1 + 1), *sin_p.add(i2 + 1), *sin_p.add(i3 + 1));
                let sine = f32x4_add(s0, f32x4_mul(f32x4_sub(s1, s0), fr_v));
                s_acc = f32x4_add(s_acc, f32x4_mul(a_v, sine));
                h_acc = f32x4_add(h_acc, f32x4_mul(ha_v, sine));
                v_k = f32x4_add(v_k, v_step4);
                kh += 4;
            }
            s += f32x4_extract_lane::<0>(s_acc)
                + f32x4_extract_lane::<1>(s_acc)
                + f32x4_extract_lane::<2>(s_acc)
                + f32x4_extract_lane::<3>(s_acc);
            high_source += f32x4_extract_lane::<0>(h_acc)
                + f32x4_extract_lane::<1>(h_acc)
                + f32x4_extract_lane::<2>(h_acc)
                + f32x4_extract_lane::<3>(h_acc);
        }
        while kh < k_full {
            let po_k = po[kh] + po_step[kh];
            po[kh] = po_k;
            let a_k = amp[kh] + step[kh];
            amp[kh] = a_k;
            let ha_k = hamp[kh] + hstep[kh];
            hamp[kh] = ha_k;
            if a_k != 0.0 || ha_k != 0.0 {
                let sx = ((kh + 1) as f32) * m_ph_2048 + po_k * 2048.0;
                let sine = sin_lookup_scalar(sin_tab, sx);
                s += a_k * sine;
                high_source += ha_k * sine;
            }
            kh += 1;
        }
        // Region 3: k_full .. active_limit (band taper)
        for kh2 in k_full..active_limit {
            let po_k = po[kh2] + po_step[kh2];
            po[kh2] = po_k;
            let a_k = amp[kh2] + step[kh2];
            amp[kh2] = a_k;
            let ha_k = hamp[kh2] + hstep[kh2];
            hamp[kh2] = ha_k;
            let band = (source_top - sample_f0 * ((kh2 + 1) as f32)) * inv_source_fade;
            if band > 0.0 && (a_k != 0.0 || ha_k != 0.0) {
                let b = if band > 1.0 { 1.0 } else { band };
                let sx = ((kh2 + 1) as f32) * m_ph_2048 + po_k * 2048.0;
                let sine = sin_lookup_scalar(sin_tab, sx);
                s += a_k * b * sine;
                high_source += ha_k * b * sine;
            }
        }
    } else {
        for kf in k_full..active_limit {
            let po_k = po[kf] + po_step[kf];
            po[kf] = po_k;
            let a_k = amp[kf] + step[kf];
            amp[kf] = a_k;
            if a_k != 0.0 {
                let band = (source_top - sample_f0 * ((kf + 1) as f32)) * inv_source_fade;
                if band > 0.0 {
                    let b = if band > 1.0 { 1.0 } else { band };
                    let sx = ((kf + 1) as f32) * m_ph_2048 + po_k * 2048.0;
                    s += a_k * b * sin_lookup_scalar(sin_tab, sx);
                }
            }
        }
    }
    (s, high_source)
}

#[allow(clippy::too_many_arguments)]
#[inline]
fn synth_harmonics_free(
    src: &mut VocalSource,
    sin_tab: &[f32; 2049],
    inc: f64,
    sample_f0: f64,
    source_top: f64,
    inv_source_fade: f64,
    k_full: usize,
    high_start: usize,
    active_limit: usize,
    voiced_high: bool,
) -> (f64, f64) {
    let mut s = 0.0_f64;
    let mut high_source = 0.0_f64;
    let phase = &mut src.phase;
    let amp = &mut src.amp.data;
    let step = &src.step.data;
    let hamp = &mut src.high_amp.data;
    let hstep = &src.high_step.data;
    let k_low = if voiced_high { k_full.min(high_start) } else { k_full };

    for k in 0..k_low {
        let mut p = phase[k] + inc * ((k + 1) as f64);
        if p >= 1.0 { p -= if p < 2.0 { 1.0 } else { p.floor() }; }
        phase[k] = p;
        let a = amp[k] + step[k];
        amp[k] = a;
        if a != 0.0 {
            s += (a as f64) * (sin_lookup_scalar(sin_tab, (p * 2048.0) as f32) as f64);
        }
    }
    if voiced_high {
        for kh in k_low..k_full {
            let mut p = phase[kh] + inc * ((kh + 1) as f64);
            if p >= 1.0 { p -= if p < 2.0 { 1.0 } else { p.floor() }; }
            phase[kh] = p;
            let a = amp[kh] + step[kh];
            amp[kh] = a;
            let ha = hamp[kh] + hstep[kh];
            hamp[kh] = ha;
            if a != 0.0 || ha != 0.0 {
                let sine = sin_lookup_scalar(sin_tab, (p * 2048.0) as f32) as f64;
                s += (a as f64) * sine;
                high_source += (ha as f64) * sine;
            }
        }
        for kh2 in k_full..active_limit {
            let mut p = phase[kh2] + inc * ((kh2 + 1) as f64);
            if p >= 1.0 { p -= if p < 2.0 { 1.0 } else { p.floor() }; }
            phase[kh2] = p;
            let a = amp[kh2] + step[kh2];
            amp[kh2] = a;
            let ha = hamp[kh2] + hstep[kh2];
            hamp[kh2] = ha;
            let band = (source_top - sample_f0 * ((kh2 + 1) as f64)) * inv_source_fade;
            if band > 0.0 && (a != 0.0 || ha != 0.0) {
                let b = band.min(1.0);
                let sine = sin_lookup_scalar(sin_tab, (p * 2048.0) as f32) as f64;
                s += (a as f64) * b * sine;
                high_source += (ha as f64) * b * sine;
            }
        }
    } else {
        for kf in k_full..active_limit {
            let mut p = phase[kf] + inc * ((kf + 1) as f64);
            if p >= 1.0 { p -= if p < 2.0 { 1.0 } else { p.floor() }; }
            phase[kf] = p;
            let a = amp[kf] + step[kf];
            amp[kf] = a;
            if a != 0.0 {
                let band = (source_top - sample_f0 * ((kf + 1) as f64)) * inv_source_fade;
                if band > 0.0 {
                    let b = band.min(1.0);
                    s += (a as f64) * b * (sin_lookup_scalar(sin_tab, (p * 2048.0) as f32) as f64);
                }
            }
        }
    }
    (s, high_source)
}
