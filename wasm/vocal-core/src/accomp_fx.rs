use core::f64::consts::{LN_2, PI};

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

const TWO_PI: f64 = 2.0 * PI;
const INV_LN2: f64 = 1.0 / LN_2;

#[inline(always)]
pub fn flush_f32(x: f32) -> f32 {
    if x.abs() < 1e-20_f32 { 0.0 } else { x }
}

#[inline(always)]
pub fn sin_t(sin_tab: &[f64; 2049], p: f64) -> f64 {
    let x = p * 2048.0;
    let i0 = x.floor() as i32;
    let fr = x - (i0 as f64);
    let idx = (i0 & 2047) as usize;
    unsafe {
        let s0 = *sin_tab.get_unchecked(idx);
        let s1 = *sin_tab.get_unchecked(idx + 1);
        s0 + (s1 - s0) * fr
    }
}

/// Faster sin_t when `p >= 0.0` and `p * 2048.0 < u32::MAX`.
#[inline(always)]
pub fn sin_t_pos(sin_tab: &[f64; 2049], p: f64) -> f64 {
    let x = p * 2048.0;
    let i0 = x as u32;
    let fr = x - (i0 as f64);
    let idx = (i0 & 2047) as usize;
    unsafe {
        let s0 = *sin_tab.get_unchecked(idx);
        let s1 = *sin_tab.get_unchecked(idx + 1);
        s0 + (s1 - s0) * fr
    }
}

/// Fastest sin_t when `0.0 <= p < 1.0`.
#[inline(always)]
pub fn sin_t_unit(sin_tab: &[f64; 2049], p: f64) -> f64 {
    let x = p * 2048.0;
    let idx = (x as usize) & 2047;
    let fr = x - (idx as f64);
    unsafe {
        let s0 = *sin_tab.get_unchecked(idx);
        let s1 = *sin_tab.get_unchecked(idx + 1);
        s0 + (s1 - s0) * fr
    }
}

/// High-accuracy (~1e-8) fast x^p for x > 0 without software libm::pow.
#[inline(always)]
fn fast_pow_pos(x: f64, p: f64) -> f64 {
    let bits = x.to_bits();
    let exp_i = ((bits >> 52) as i64) - 1023;
    let mant = f64::from_bits((bits & 0x000F_FFFF_FFFF_FFFF) | 0x3FF0_0000_0000_0000);
    let u = (mant - 1.0) / (mant + 1.0);
    let u2 = u * u;
    let log2_m = (2.0 * INV_LN2)
        * u
        * (1.0 + u2 * (1.0 / 3.0 + u2 * (0.2 + u2 * (1.0 / 7.0 + u2 * (1.0 / 9.0 + u2 / 11.0)))));
    let y = p * ((exp_i as f64) + log2_m);
    let k = y.floor() as i64;
    if k < -1022 {
        return 0.0;
    }
    if k > 1023 {
        return f64::INFINITY;
    }
    let z = (y - (k as f64)) * LN_2;
    let ez = 1.0
        + z * (1.0
            + z * (0.5
                + z * (1.0 / 6.0
                    + z * (1.0 / 24.0
                        + z * (1.0 / 120.0
                            + z * (1.0 / 720.0
                                + z * (1.0 / 5040.0 + z * (1.0 / 40320.0 + z / 362880.0))))))));
    let scale = f64::from_bits(((k + 1023) as u64) << 52);
    ez * scale
}

/// Space profile numeric parameters packed for WASM.
#[derive(Clone, Copy)]
pub struct SpaceParams {
    pub hall_time: f64,
    pub hall_damp: f64,
    pub hall_mix: f64,
    pub plate_time: f64,
    pub plate_mix: f64,
    pub delay_mix: f64,
    pub delay_fb: f64,
    pub chorus_mix: f64,
    pub pocket_db: f64,
    pub air_db: f64,
    pub comp_ratio: f64,
    pub comp_thresh: f64,
}

#[allow(clippy::too_many_arguments)]
pub fn run_space_effect(
    sin_tab: &[f64; 2049],
    effect_id: u32,
    in_l: &[f32],
    in_r: &[f32],
    out_l: &mut [f32],
    out_r: &mut [f32],
    sr: f64,
    sp: &SpaceParams,
    spb0: f64,
    in_place: bool,
) {
    let total = in_l.len();
    if total == 0 {
        return;
    }
    match effect_id {
        0 => run_chorus(sin_tab, in_l, in_r, out_l, out_r, sr, sp.chorus_mix, in_place),
        1 => run_delay(in_l, in_r, out_l, out_r, sr, sp.delay_fb, sp.delay_mix, spb0, in_place),
        2 => run_plate(in_l, in_r, out_l, out_r, sr, sp.plate_time, sp.plate_mix, in_place),
        3 => run_hall(in_l, in_r, out_l, out_r, sr, sp.hall_time, sp.hall_damp, sp.hall_mix, in_place),
        _ => {}
    }
}

pub fn run_space_effect_inplace(
    sin_tab: &[f64; 2049],
    effect_id: u32,
    buf_l: &mut [f32],
    buf_r: &mut [f32],
    sr: f64,
    sp: &SpaceParams,
    spb0: f64,
) {
    let total = buf_l.len();
    if total == 0 {
        return;
    }
    unsafe {
        let in_l = core::slice::from_raw_parts(buf_l.as_ptr(), total);
        let in_r = core::slice::from_raw_parts(buf_r.as_ptr(), total);
        run_space_effect(sin_tab, effect_id, in_l, in_r, buf_l, buf_r, sr, sp, spb0, true);
    }
}

fn run_chorus(
    sin_tab: &[f64; 2049],
    in_l: &[f32],
    in_r: &[f32],
    out_l: &mut [f32],
    out_r: &mut [f32],
    sr: f64,
    c_wet: f64,
    in_place: bool,
) {
    let total = in_l.len();
    let c_buf_sz = ((sr * 0.032).ceil() as usize).max(64);
    let mut c_ring_l = vec![0.0_f32; c_buf_sz];
    let mut c_ring_r = vec![0.0_f32; c_buf_sz];
    let mut c_w = 0usize;
    let c_base = (0.011 * sr) as f32;
    let c_dep = (0.0038 * sr) as f32;
    let c_step1 = 0.43 / sr;
    let c_step2 = 0.59 / sr;
    let mut c_ph1 = 0.0_f64;
    let mut c_ph2 = 0.5_f64;
    let c_wet_f = c_wet as f32;
    unsafe {
        for ci in 0..total {
            *c_ring_l.get_unchecked_mut(c_w) = *in_l.get_unchecked(ci);
            *c_ring_r.get_unchecked_mut(c_w) = *in_r.get_unchecked(ci);
            c_ph1 += c_step1;
            if c_ph1 >= 1.0 { c_ph1 -= 1.0; }
            c_ph2 += c_step2;
            if c_ph2 >= 1.0 { c_ph2 -= 1.0; }
            let d_l = c_base + c_dep * (sin_t_unit(sin_tab, c_ph1) as f32);
            let d_r = c_base + c_dep * (sin_t_unit(sin_tab, c_ph2) as f32);
            let i_l = d_l as usize;
            let f_l = d_l - (i_l as f32);
            let i_r = d_r as usize;
            let f_r = d_r - (i_r as f32);
            let p_l1 = if c_w >= i_l { c_w - i_l } else { c_w + c_buf_sz - i_l };
            let p_l0 = if p_l1 > 0 { p_l1 - 1 } else { c_buf_sz - 1 };
            let p_r1 = if c_w >= i_r { c_w - i_r } else { c_w + c_buf_sz - i_r };
            let p_r0 = if p_r1 > 0 { p_r1 - 1 } else { c_buf_sz - 1 };
            let s_l1 = *c_ring_l.get_unchecked(p_l1);
            let s_l0 = *c_ring_l.get_unchecked(p_l0);
            let s_r1 = *c_ring_r.get_unchecked(p_r1);
            let s_r0 = *c_ring_r.get_unchecked(p_r0);
            let tap_l = s_l1 + (s_l0 - s_l1) * f_l;
            let tap_r = s_r1 + (s_r0 - s_r1) * f_r;
            let wl = (tap_l - tap_r * 0.22_f32) * c_wet_f;
            let wr = (tap_r - tap_l * 0.22_f32) * c_wet_f;
            if in_place {
                *out_l.get_unchecked_mut(ci) = wl;
                *out_r.get_unchecked_mut(ci) = wr;
            } else {
                *out_l.get_unchecked_mut(ci) += wl;
                *out_r.get_unchecked_mut(ci) += wr;
            }
            c_w += 1;
            if c_w == c_buf_sz { c_w = 0; }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_delay(
    in_l: &[f32],
    in_r: &[f32],
    out_l: &mut [f32],
    out_r: &mut [f32],
    sr: f64,
    d_fb: f64,
    d_wet: f64,
    spb0: f64,
    in_place: bool,
) {
    let total = in_l.len();
    let mut d_sec = spb0 * 0.75;
    while d_sec > 0.62 { d_sec *= 0.5; }
    while d_sec < 0.18 { d_sec *= 2.0; }
    let d_s1 = ((d_sec * sr).round() as usize).max(16);
    let d_s2 = ((d_sec * 1.006 * sr).round() as usize).max(16);
    let mut d_ring_l = vec![0.0_f32; d_s1];
    let mut d_ring_r = vec![0.0_f32; d_s2];
    let mut d_idx_l = 0usize;
    let mut d_idx_r = 0usize;
    let d_lp_coef = (1.0 - (-TWO_PI * (sr * 0.4).min(3400.0) / sr).exp()) as f32;
    let d_hp_coef = (1.0 - (-TWO_PI * 240.0 / sr).exp()) as f32;
    let d_fb_f = d_fb as f32;
    let d_wet_f = d_wet as f32;
    let mut d_lp_l = 0.0_f32;
    let mut d_lp_r = 0.0_f32;
    let mut d_hp_l = 0.0_f32;
    let mut d_hp_r = 0.0_f32;
    unsafe {
        for di in 0..total {
            // Passband (-400 dBFS) anti-denormal keeps all recursive f32 states far above 1.175e-38.
            let dn = if (di & 16) == 0 { 1e-20_f32 } else { -1e-20_f32 };
            let out_dl = *d_ring_l.get_unchecked(d_idx_l) + dn;
            let out_dr = *d_ring_r.get_unchecked(d_idx_r) - dn;
            d_lp_l += (out_dl - d_lp_l) * d_lp_coef;
            d_hp_l += (d_lp_l - d_hp_l) * d_hp_coef;
            d_lp_r += (out_dr - d_lp_r) * d_lp_coef;
            d_hp_r += (d_lp_r - d_hp_r) * d_hp_coef;
            let clean_l = d_lp_l - d_hp_l;
            let clean_r = d_lp_r - d_hp_r;
            let d_in = (*in_l.get_unchecked(di) + *in_r.get_unchecked(di)) * 0.55_f32;
            *d_ring_r.get_unchecked_mut(d_idx_r) = d_in + clean_l * d_fb_f;
            *d_ring_l.get_unchecked_mut(d_idx_l) = clean_r * 0.86_f32;
            let wl = clean_l * d_wet_f;
            let wr = clean_r * d_wet_f;
            if in_place {
                *out_l.get_unchecked_mut(di) = wl;
                *out_r.get_unchecked_mut(di) = wr;
            } else {
                *out_l.get_unchecked_mut(di) += wl;
                *out_r.get_unchecked_mut(di) += wr;
            }
            d_idx_l += 1;
            if d_idx_l == d_s1 { d_idx_l = 0; }
            d_idx_r += 1;
            if d_idx_r == d_s2 { d_idx_r = 0; }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_plate(
    in_l: &[f32],
    in_r: &[f32],
    out_l: &mut [f32],
    out_r: &mut [f32],
    sr: f64,
    plate_time: f64,
    p_wet: f64,
    in_place: bool,
) {
    let total = in_l.len();
    let p_pre_n = ((0.012 * sr).round() as usize).max(4);
    let mut p_pre_l = vec![0.0_f32; p_pre_n];
    let mut p_pre_r = vec![0.0_f32; p_pre_n];
    let mut p_pre_i = 0usize;

    let pdn_l1 = ((0.0031 * sr).round() as usize).max(4);
    let pdn_l2 = ((0.0053 * sr).round() as usize).max(4);
    let pdn_r1 = ((0.0037 * sr).round() as usize).max(4);
    let pdn_r2 = ((0.0061 * sr).round() as usize).max(4);
    let mut pdb_l1 = vec![0.0_f32; pdn_l1];
    let mut pdb_l2 = vec![0.0_f32; pdn_l2];
    let mut pdb_r1 = vec![0.0_f32; pdn_r1];
    let mut pdb_r2 = vec![0.0_f32; pdn_r2];
    let (mut pdi_l1, mut pdi_l2, mut pdi_r1, mut pdi_r2) = (0usize, 0usize, 0usize, 0usize);
    let p_dg = 0.55_f32;

    let pl0 = ((0.0173 * sr).round() as usize).max(8);
    let pl1 = ((0.0239 * sr).round() as usize).max(8);
    let pl2 = ((0.0311 * sr).round() as usize).max(8);
    let pl3 = ((0.0417 * sr).round() as usize).max(8);
    let mut pb0 = vec![0.0_f32; pl0];
    let mut pb1 = vec![0.0_f32; pl1];
    let mut pb2 = vec![0.0_f32; pl2];
    let mut pb3 = vec![0.0_f32; pl3];
    let pg0 = 0.001_f64.powf((pl0 as f64 / sr) / plate_time) as f32;
    let pg1 = 0.001_f64.powf((pl1 as f64 / sr) / plate_time) as f32;
    let pg2 = 0.001_f64.powf((pl2 as f64 / sr) / plate_time) as f32;
    let pg3 = 0.001_f64.powf((pl3 as f64 / sr) / plate_time) as f32;
    let (mut pi0, mut pi1, mut pi2p, mut pi3) = (0usize, 0usize, 0usize, 0usize);
    let p_damp = (1.0 - (-TWO_PI * (sr * 0.42).min(5200.0) / sr).exp()) as f32;
    let p_hp_coef = (1.0 - (-TWO_PI * 180.0 / sr).exp()) as f32;
    let (mut p_hp_l, mut p_hp_r) = (0.0_f32, 0.0_f32);
    let p_wet_f = p_wet as f32;

    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    unsafe {
        let mut plp = f32x4_splat(0.0);
        let v_damp = f32x4_splat(p_damp);
        let v_pg = f32x4(pg0, pg1, pg2, pg3);
        let v_half = f32x4_splat(0.5);
        for i in 0..total {
            let dn = if (i & 16) == 0 { 1e-20_f32 } else { -1e-20_f32 };
            let pre_l = *p_pre_l.get_unchecked(p_pre_i) + dn;
            let pre_r = *p_pre_r.get_unchecked(p_pre_i) - dn;
            *p_pre_l.get_unchecked_mut(p_pre_i) = *in_l.get_unchecked(i);
            *p_pre_r.get_unchecked_mut(p_pre_i) = *in_r.get_unchecked(i);
            p_pre_i += 1; if p_pre_i == p_pre_n { p_pre_i = 0; }

            let pd1_l = *pdb_l1.get_unchecked(pdi_l1);
            let pv1_l = pre_l - p_dg * pd1_l;
            let py1_l = pd1_l + p_dg * pv1_l;
            *pdb_l1.get_unchecked_mut(pdi_l1) = pv1_l;
            pdi_l1 += 1; if pdi_l1 == pdn_l1 { pdi_l1 = 0; }

            let pd2_l = *pdb_l2.get_unchecked(pdi_l2);
            let pv2_l = py1_l - p_dg * pd2_l;
            let in_pl = pd2_l + p_dg * pv2_l;
            *pdb_l2.get_unchecked_mut(pdi_l2) = pv2_l;
            pdi_l2 += 1; if pdi_l2 == pdn_l2 { pdi_l2 = 0; }

            let pd1_r = *pdb_r1.get_unchecked(pdi_r1);
            let pv1_r = pre_r - p_dg * pd1_r;
            let py1_r = pd1_r + p_dg * pv1_r;
            *pdb_r1.get_unchecked_mut(pdi_r1) = pv1_r;
            pdi_r1 += 1; if pdi_r1 == pdn_r1 { pdi_r1 = 0; }

            let pd2_r = *pdb_r2.get_unchecked(pdi_r2);
            let pv2_r = py1_r - p_dg * pd2_r;
            let in_pr = pd2_r + p_dg * pv2_r;
            *pdb_r2.get_unchecked_mut(pdi_r2) = pv2_r;
            pdi_r2 += 1; if pdi_r2 == pdn_r2 { pdi_r2 = 0; }

            let x0 = *pb0.get_unchecked(pi0);
            let x1 = *pb1.get_unchecked(pi1);
            let x2 = *pb2.get_unchecked(pi2p);
            let x3 = *pb3.get_unchecked(pi3);
            let x_v = f32x4(x0, x1, x2, x3);
            plp = f32x4_add(plp, f32x4_mul(f32x4_sub(x_v, plp), v_damp));

            let sh1 = i32x4_shuffle::<2, 3, 0, 1>(plp, plp);
            let s1 = f32x4_add(plp, sh1);
            let sh2 = i32x4_shuffle::<1, 0, 3, 2>(s1, s1);
            let sum_v = f32x4_mul(f32x4_add(s1, sh2), v_half);
            let in_v = f32x4(in_pl, -in_pr, in_pr * 0.85, -in_pl * 0.85);
            let fb = f32x4_add(in_v, f32x4_mul(f32x4_sub(plp, sum_v), v_pg));
            *pb0.get_unchecked_mut(pi0) = f32x4_extract_lane::<0>(fb);
            *pb1.get_unchecked_mut(pi1) = f32x4_extract_lane::<1>(fb);
            *pb2.get_unchecked_mut(pi2p) = f32x4_extract_lane::<2>(fb);
            *pb3.get_unchecked_mut(pi3) = f32x4_extract_lane::<3>(fb);
            pi0 += 1; if pi0 == pl0 { pi0 = 0; }
            pi1 += 1; if pi1 == pl1 { pi1 = 0; }
            pi2p += 1; if pi2p == pl2 { pi2p = 0; }
            pi3 += 1; if pi3 == pl3 { pi3 = 0; }

            let out_pl = (x0 + x1 - x2 + x3) * 0.45 + dn;
            let out_pr = (x0 - x1 + x2 + x3) * 0.45 - dn;
            p_hp_l += (out_pl - p_hp_l) * p_hp_coef;
            p_hp_r += (out_pr - p_hp_r) * p_hp_coef;
            let wl = (out_pl - p_hp_l) * p_wet_f;
            let wr = (out_pr - p_hp_r) * p_wet_f;
            if in_place {
                *out_l.get_unchecked_mut(i) = wl;
                *out_r.get_unchecked_mut(i) = wr;
            } else {
                *out_l.get_unchecked_mut(i) += wl;
                *out_r.get_unchecked_mut(i) += wr;
            }
        }
    }

    #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
    {
        let (mut plp0, mut plp1, mut plp2, mut plp3) = (0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32);
        for i in 0..total {
            let dn = if (i & 16) == 0 { 1e-20_f32 } else { -1e-20_f32 };
            let pre_l = p_pre_l[p_pre_i] + dn;
            let pre_r = p_pre_r[p_pre_i] - dn;
            p_pre_l[p_pre_i] = in_l[i];
            p_pre_r[p_pre_i] = in_r[i];
            p_pre_i += 1; if p_pre_i == p_pre_n { p_pre_i = 0; }
            let pd1_l = pdb_l1[pdi_l1]; let pv1_l = pre_l - p_dg * pd1_l; let py1_l = pd1_l + p_dg * pv1_l;
            pdb_l1[pdi_l1] = pv1_l; pdi_l1 += 1; if pdi_l1 == pdn_l1 { pdi_l1 = 0; }
            let pd2_l = pdb_l2[pdi_l2]; let pv2_l = py1_l - p_dg * pd2_l; let in_pl = pd2_l + p_dg * pv2_l;
            pdb_l2[pdi_l2] = pv2_l; pdi_l2 += 1; if pdi_l2 == pdn_l2 { pdi_l2 = 0; }
            let pd1_r = pdb_r1[pdi_r1]; let pv1_r = pre_r - p_dg * pd1_r; let py1_r = pd1_r + p_dg * pv1_r;
            pdb_r1[pdi_r1] = pv1_r; pdi_r1 += 1; if pdi_r1 == pdn_r1 { pdi_r1 = 0; }
            let pd2_r = pdb_r2[pdi_r2]; let pv2_r = py1_r - p_dg * pd2_r; let in_pr = pd2_r + p_dg * pv2_r;
            pdb_r2[pdi_r2] = pv2_r; pdi_r2 += 1; if pdi_r2 == pdn_r2 { pdi_r2 = 0; }
            let (x0, x1, x2, x3) = (pb0[pi0], pb1[pi1], pb2[pi2p], pb3[pi3]);
            plp0 += (x0 - plp0) * p_damp; plp1 += (x1 - plp1) * p_damp;
            plp2 += (x2 - plp2) * p_damp; plp3 += (x3 - plp3) * p_damp;
            let sum_p = (plp0 + plp1 + plp2 + plp3) * 0.5;
            pb0[pi0] = in_pl + (plp0 - sum_p) * pg0;
            pb1[pi1] = -in_pr + (plp1 - sum_p) * pg1;
            pb2[pi2p] = in_pr * 0.85 + (plp2 - sum_p) * pg2;
            pb3[pi3] = -in_pl * 0.85 + (plp3 - sum_p) * pg3;
            pi0 += 1; if pi0 == pl0 { pi0 = 0; }
            pi1 += 1; if pi1 == pl1 { pi1 = 0; }
            pi2p += 1; if pi2p == pl2 { pi2p = 0; }
            pi3 += 1; if pi3 == pl3 { pi3 = 0; }
            let out_pl = (x0 + x1 - x2 + x3) * 0.45 + dn;
            let out_pr = (x0 - x1 + x2 + x3) * 0.45 - dn;
            p_hp_l += (out_pl - p_hp_l) * p_hp_coef;
            p_hp_r += (out_pr - p_hp_r) * p_hp_coef;
            if in_place {
                out_l[i] = (out_pl - p_hp_l) * p_wet_f;
                out_r[i] = (out_pr - p_hp_r) * p_wet_f;
            } else {
                out_l[i] += (out_pl - p_hp_l) * p_wet_f;
                out_r[i] += (out_pr - p_hp_r) * p_wet_f;
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_hall(
    in_l: &[f32],
    in_r: &[f32],
    out_l: &mut [f32],
    out_r: &mut [f32],
    sr: f64,
    hall_time: f64,
    hall_damp: f64,
    h_wet: f64,
    in_place: bool,
) {
    let total = in_l.len();
    let h_pre_n = ((0.026 * sr).round() as usize).max(4);
    let mut h_pre_l = vec![0.0_f32; h_pre_n];
    let mut h_pre_r = vec![0.0_f32; h_pre_n];
    let mut h_pre_i = 0usize;

    let hdn_l1 = ((0.0047 * sr).round() as usize).max(4);
    let hdn_l2 = ((0.0079 * sr).round() as usize).max(4);
    let hdn_r1 = ((0.0053 * sr).round() as usize).max(4);
    let hdn_r2 = ((0.0089 * sr).round() as usize).max(4);
    let mut hdb_l1 = vec![0.0_f32; hdn_l1];
    let mut hdb_l2 = vec![0.0_f32; hdn_l2];
    let mut hdb_r1 = vec![0.0_f32; hdn_r1];
    let mut hdb_r2 = vec![0.0_f32; hdn_r2];
    let (mut hdi_l1, mut hdi_l2, mut hdi_r1, mut hdi_r2) = (0usize, 0usize, 0usize, 0usize);
    let h_dg = 0.6_f32;

    let hl0 = ((0.0297 * sr).round() as usize).max(8);
    let hl1 = ((0.0371 * sr).round() as usize).max(8);
    let hl2 = ((0.0433 * sr).round() as usize).max(8);
    let hl3 = ((0.0539 * sr).round() as usize).max(8);
    let hl4 = ((0.0617 * sr).round() as usize).max(8);
    let hl5 = ((0.0713 * sr).round() as usize).max(8);
    let hl6 = ((0.0831 * sr).round() as usize).max(8);
    let hl7 = ((0.0977 * sr).round() as usize).max(8);
    let mut hb0 = vec![0.0_f32; hl0];
    let mut hb1 = vec![0.0_f32; hl1];
    let mut hb2 = vec![0.0_f32; hl2];
    let mut hb3 = vec![0.0_f32; hl3];
    let mut hb4 = vec![0.0_f32; hl4];
    let mut hb5 = vec![0.0_f32; hl5];
    let mut hb6 = vec![0.0_f32; hl6];
    let mut hb7 = vec![0.0_f32; hl7];
    let hg0 = 0.001_f64.powf((hl0 as f64 / sr) / hall_time) as f32;
    let hg1 = 0.001_f64.powf((hl1 as f64 / sr) / hall_time) as f32;
    let hg2 = 0.001_f64.powf((hl2 as f64 / sr) / hall_time) as f32;
    let hg3 = 0.001_f64.powf((hl3 as f64 / sr) / hall_time) as f32;
    let hg4 = 0.001_f64.powf((hl4 as f64 / sr) / hall_time) as f32;
    let hg5 = 0.001_f64.powf((hl5 as f64 / sr) / hall_time) as f32;
    let hg6 = 0.001_f64.powf((hl6 as f64 / sr) / hall_time) as f32;
    let hg7 = 0.001_f64.powf((hl7 as f64 / sr) / hall_time) as f32;
    let (mut hi0, mut hi1, mut hi2p, mut hi3) = (0usize, 0usize, 0usize, 0usize);
    let (mut hi4, mut hi5, mut hi6, mut hi7) = (0usize, 0usize, 0usize, 0usize);
    let h_damp = (1.0 - (-TWO_PI * (sr * 0.42).min(hall_damp) / sr).exp()) as f32;
    let h_hp_coef = (1.0 - (-TWO_PI * 160.0 / sr).exp()) as f32;
    let (mut h_hp_l, mut h_hp_r) = (0.0_f32, 0.0_f32);
    let h_wet_f = h_wet as f32;
    let h_norm = 0.35355339059327373_f32;

    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    unsafe {
        let mut hlp03 = f32x4_splat(0.0);
        let mut hlp47 = f32x4_splat(0.0);
        let v_damp = f32x4_splat(h_damp);
        let v_norm = f32x4_splat(h_norm);
        let v_hg03 = f32x4(hg0, hg1, hg2, hg3);
        let v_hg47 = f32x4(hg4, hg5, hg6, hg7);
        for i in 0..total {
            let dn = if (i & 16) == 0 { 1e-20_f32 } else { -1e-20_f32 };
            let pre_hl = *h_pre_l.get_unchecked(h_pre_i) + dn;
            let pre_hr = *h_pre_r.get_unchecked(h_pre_i) - dn;
            *h_pre_l.get_unchecked_mut(h_pre_i) = *in_l.get_unchecked(i);
            *h_pre_r.get_unchecked_mut(h_pre_i) = *in_r.get_unchecked(i);
            h_pre_i += 1; if h_pre_i == h_pre_n { h_pre_i = 0; }

            let hd1_l = *hdb_l1.get_unchecked(hdi_l1);
            let hv1_l = pre_hl - h_dg * hd1_l;
            let hy1_l = hd1_l + h_dg * hv1_l;
            *hdb_l1.get_unchecked_mut(hdi_l1) = hv1_l;
            hdi_l1 += 1; if hdi_l1 == hdn_l1 { hdi_l1 = 0; }

            let hd2_l = *hdb_l2.get_unchecked(hdi_l2);
            let hv2_l = hy1_l - h_dg * hd2_l;
            let in_hl = (hd2_l + h_dg * hv2_l) * 0.65;
            *hdb_l2.get_unchecked_mut(hdi_l2) = hv2_l;
            hdi_l2 += 1; if hdi_l2 == hdn_l2 { hdi_l2 = 0; }

            let hd1_r = *hdb_r1.get_unchecked(hdi_r1);
            let hv1_r = pre_hr - h_dg * hd1_r;
            let hy1_r = hd1_r + h_dg * hv1_r;
            *hdb_r1.get_unchecked_mut(hdi_r1) = hv1_r;
            hdi_r1 += 1; if hdi_r1 == hdn_r1 { hdi_r1 = 0; }

            let hd2_r = *hdb_r2.get_unchecked(hdi_r2);
            let hv2_r = hy1_r - h_dg * hd2_r;
            let in_hr = (hd2_r + h_dg * hv2_r) * 0.65;
            *hdb_r2.get_unchecked_mut(hdi_r2) = hv2_r;
            hdi_r2 += 1; if hdi_r2 == hdn_r2 { hdi_r2 = 0; }

            let y0 = *hb0.get_unchecked(hi0);
            let y1 = *hb1.get_unchecked(hi1);
            let y2 = *hb2.get_unchecked(hi2p);
            let y3 = *hb3.get_unchecked(hi3);
            let y4 = *hb4.get_unchecked(hi4);
            let y5 = *hb5.get_unchecked(hi5);
            let y6 = *hb6.get_unchecked(hi6);
            let y7 = *hb7.get_unchecked(hi7);

            let y03 = f32x4(y0, y1, y2, y3);
            let y47 = f32x4(y4, y5, y6, y7);
            hlp03 = f32x4_add(hlp03, f32x4_mul(f32x4_sub(y03, hlp03), v_damp));
            hlp47 = f32x4_add(hlp47, f32x4_mul(f32x4_sub(y47, hlp47), v_damp));

            let ev = i32x4_shuffle::<0, 2, 4, 6>(hlp03, hlp47);
            let od = i32x4_shuffle::<1, 3, 5, 7>(hlp03, hlp47);
            let a_ev = f32x4_add(ev, od);
            let a_od = f32x4_sub(ev, od);
            let ae_lo = i32x4_shuffle::<0, 4, 2, 6>(a_ev, a_od);
            let ae_hi = i32x4_shuffle::<1, 5, 3, 7>(a_ev, a_od);
            let b_add = f32x4_add(ae_lo, ae_hi);
            let b_sub = f32x4_sub(ae_lo, ae_hi);
            let b03 = i32x4_shuffle::<0, 1, 4, 5>(b_add, b_sub);
            let b47 = i32x4_shuffle::<2, 3, 6, 7>(b_add, b_sub);
            let w03 = f32x4_mul(f32x4_add(b03, b47), v_norm);
            let w47 = f32x4_mul(f32x4_sub(b03, b47), v_norm);

            let fb03 = f32x4_add(f32x4(in_hl, in_hr, -in_hl, -in_hr), f32x4_mul(w03, v_hg03));
            let fb47 = f32x4_add(f32x4(in_hr, -in_hl, -in_hr, in_hl), f32x4_mul(w47, v_hg47));

            *hb0.get_unchecked_mut(hi0) = f32x4_extract_lane::<0>(fb03);
            *hb1.get_unchecked_mut(hi1) = f32x4_extract_lane::<1>(fb03);
            *hb2.get_unchecked_mut(hi2p) = f32x4_extract_lane::<2>(fb03);
            *hb3.get_unchecked_mut(hi3) = f32x4_extract_lane::<3>(fb03);
            *hb4.get_unchecked_mut(hi4) = f32x4_extract_lane::<0>(fb47);
            *hb5.get_unchecked_mut(hi5) = f32x4_extract_lane::<1>(fb47);
            *hb6.get_unchecked_mut(hi6) = f32x4_extract_lane::<2>(fb47);
            *hb7.get_unchecked_mut(hi7) = f32x4_extract_lane::<3>(fb47);

            hi0 += 1; if hi0 == hl0 { hi0 = 0; }
            hi1 += 1; if hi1 == hl1 { hi1 = 0; }
            hi2p += 1; if hi2p == hl2 { hi2p = 0; }
            hi3 += 1; if hi3 == hl3 { hi3 = 0; }
            hi4 += 1; if hi4 == hl4 { hi4 = 0; }
            hi5 += 1; if hi5 == hl5 { hi5 = 0; }
            hi6 += 1; if hi6 == hl6 { hi6 = 0; }
            hi7 += 1; if hi7 == hl7 { hi7 = 0; }

            let out_hl = (y0 + y1 - y2 - y3 + y4 + y5 - y6 - y7) * 0.42 + dn;
            let out_hr = (y0 - y1 + y2 - y3 - y4 + y5 - y6 + y7) * 0.42 - dn;
            h_hp_l += (out_hl - h_hp_l) * h_hp_coef;
            h_hp_r += (out_hr - h_hp_r) * h_hp_coef;
            let wl = (out_hl - h_hp_l) * h_wet_f;
            let wr = (out_hr - h_hp_r) * h_wet_f;
            if in_place {
                *out_l.get_unchecked_mut(i) = wl;
                *out_r.get_unchecked_mut(i) = wr;
            } else {
                *out_l.get_unchecked_mut(i) += wl;
                *out_r.get_unchecked_mut(i) += wr;
            }
        }
    }

    #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
    {
        let mut hlp = [0.0_f32; 8];
        for i in 0..total {
            let dn = if (i & 16) == 0 { 1e-20_f32 } else { -1e-20_f32 };
            let pre_hl = h_pre_l[h_pre_i] + dn;
            let pre_hr = h_pre_r[h_pre_i] - dn;
            h_pre_l[h_pre_i] = in_l[i];
            h_pre_r[h_pre_i] = in_r[i];
            h_pre_i += 1; if h_pre_i == h_pre_n { h_pre_i = 0; }
            let hd1_l = hdb_l1[hdi_l1]; let hv1_l = pre_hl - h_dg * hd1_l; let hy1_l = hd1_l + h_dg * hv1_l;
            hdb_l1[hdi_l1] = hv1_l; hdi_l1 += 1; if hdi_l1 == hdn_l1 { hdi_l1 = 0; }
            let hd2_l = hdb_l2[hdi_l2]; let hv2_l = hy1_l - h_dg * hd2_l; let in_hl = hd2_l + h_dg * hv2_l;
            hdb_l2[hdi_l2] = hv2_l; hdi_l2 += 1; if hdi_l2 == hdn_l2 { hdi_l2 = 0; }
            let hd1_r = hdb_r1[hdi_r1]; let hv1_r = pre_hr - h_dg * hd1_r; let hy1_r = hd1_r + h_dg * hv1_r;
            hdb_r1[hdi_r1] = hv1_r; hdi_r1 += 1; if hdi_r1 == hdn_r1 { hdi_r1 = 0; }
            let hd2_r = hdb_r2[hdi_r2]; let hv2_r = hy1_r - h_dg * hd2_r; let in_hr = hd2_r + h_dg * hv2_r;
            hdb_r2[hdi_r2] = hv2_r; hdi_r2 += 1; if hdi_r2 == hdn_r2 { hdi_r2 = 0; }
            let y0 = hb0[hi0]; let y1 = hb1[hi1]; let y2 = hb2[hi2p]; let y3 = hb3[hi3];
            let y4 = hb4[hi4]; let y5 = hb5[hi5]; let y6 = hb6[hi6]; let y7 = hb7[hi7];
            hlp[0] += (y0 - hlp[0]) * h_damp; hlp[1] += (y1 - hlp[1]) * h_damp;
            hlp[2] += (y2 - hlp[2]) * h_damp; hlp[3] += (y3 - hlp[3]) * h_damp;
            hlp[4] += (y4 - hlp[4]) * h_damp; hlp[5] += (y5 - hlp[5]) * h_damp;
            hlp[6] += (y6 - hlp[6]) * h_damp; hlp[7] += (y7 - hlp[7]) * h_damp;
            let a0 = hlp[0] + hlp[1]; let a1 = hlp[0] - hlp[1]; let a2 = hlp[2] + hlp[3]; let a3 = hlp[2] - hlp[3];
            let a4 = hlp[4] + hlp[5]; let a5 = hlp[4] - hlp[5]; let a6 = hlp[6] + hlp[7]; let a7 = hlp[6] - hlp[7];
            let b0 = a0 + a2; let b1 = a1 + a3; let b2 = a0 - a2; let b3 = a1 - a3;
            let b4 = a4 + a6; let b5 = a5 + a7; let b6 = a4 - a6; let b7 = a5 - a7;
            hb0[hi0] = in_hl * 0.65 + (b0 + b4) * h_norm * hg0;
            hb1[hi1] = in_hr * 0.65 + (b1 + b5) * h_norm * hg1;
            hb2[hi2p] = -in_hl * 0.65 + (b2 + b6) * h_norm * hg2;
            hb3[hi3] = -in_hr * 0.65 + (b3 + b7) * h_norm * hg3;
            hb4[hi4] = in_hr * 0.65 + (b0 - b4) * h_norm * hg4;
            hb5[hi5] = -in_hl * 0.65 + (b1 - b5) * h_norm * hg5;
            hb6[hi6] = -in_hr * 0.65 + (b2 - b6) * h_norm * hg6;
            hb7[hi7] = in_hl * 0.65 + (b3 - b7) * h_norm * hg7;
            hi0 += 1; if hi0 == hl0 { hi0 = 0; }
            hi1 += 1; if hi1 == hl1 { hi1 = 0; }
            hi2p += 1; if hi2p == hl2 { hi2p = 0; }
            hi3 += 1; if hi3 == hl3 { hi3 = 0; }
            hi4 += 1; if hi4 == hl4 { hi4 = 0; }
            hi5 += 1; if hi5 == hl5 { hi5 = 0; }
            hi6 += 1; if hi6 == hl6 { hi6 = 0; }
            hi7 += 1; if hi7 == hl7 { hi7 = 0; }
            let out_hl = (y0 + y1 - y2 - y3 + y4 + y5 - y6 - y7) * 0.42 + dn;
            let out_hr = (y0 - y1 + y2 - y3 - y4 + y5 - y6 + y7) * 0.42 - dn;
            h_hp_l += (out_hl - h_hp_l) * h_hp_coef;
            h_hp_r += (out_hr - h_hp_r) * h_hp_coef;
            if in_place {
                out_l[i] = (out_hl - h_hp_l) * h_wet_f;
                out_r[i] = (out_hr - h_hp_r) * h_wet_f;
            } else {
                out_l[i] += (out_hl - h_hp_l) * h_wet_f;
                out_r[i] += (out_hr - h_hp_r) * h_wet_f;
            }
        }
    }
}

fn make_biquad(kind: u8, sr: f64, fc: f64, q_or_s: f64, db_gain: f64) -> (f64, f64, f64, f64, f64) {
    let w0 = TWO_PI * fc.clamp(15.0, sr * 0.42) / sr;
    let cw = w0.cos();
    let sw = w0.sin();
    let cap_a = 10.0_f64.powf(db_gain / 40.0);
    let (b0, b1, b2, a0, a1, a2) = match kind {
        0 => {
            let alpha = sw / (2.0 * q_or_s);
            ((1.0 + cw) * 0.5, -(1.0 + cw), (1.0 + cw) * 0.5, 1.0 + alpha, -2.0 * cw, 1.0 - alpha)
        }
        1 => {
            let alpha = sw / (2.0 * q_or_s);
            (1.0 + alpha * cap_a, -2.0 * cw, 1.0 - alpha * cap_a, 1.0 + alpha / cap_a, -2.0 * cw, 1.0 - alpha / cap_a)
        }
        _ => {
            let alpha = sw * 0.5 * ((cap_a + 1.0 / cap_a) * (1.0 / q_or_s - 1.0) + 2.0).sqrt();
            let sq = 2.0 * cap_a.sqrt() * alpha;
            (
                cap_a * ((cap_a + 1.0) + (cap_a - 1.0) * cw + sq),
                -2.0 * cap_a * ((cap_a - 1.0) + (cap_a + 1.0) * cw),
                cap_a * ((cap_a + 1.0) + (cap_a - 1.0) * cw - sq),
                (cap_a + 1.0) - (cap_a - 1.0) * cw + sq,
                2.0 * ((cap_a - 1.0) - (cap_a + 1.0) * cw),
                (cap_a + 1.0) - (cap_a - 1.0) * cw - sq,
            )
        }
    };
    (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

pub fn finalize_accomp_mix(
    left: &mut [f32],
    right: &mut [f32],
    mono: &mut [f32],
    sr: f64,
    has_space: bool,
    sp: &SpaceParams,
    legacy_sound: bool,
) {
    let total = left.len();
    let mut pk: f64;

    if has_space {
        let (hp_b0, hp_b1, hp_b2, hp_a1, hp_a2) = make_biquad(0, sr, 28.0, 0.707, 0.0);
        let (dp_b0, dp_b1, dp_b2, dp_a1, dp_a2) = make_biquad(1, sr, (sr * 0.36).min(2200.0), 0.9, sp.pocket_db);
        let (ar_b0, ar_b1, ar_b2, ar_a1, ar_a2) = make_biquad(2, sr, (sr * 0.36).min(9200.0), 0.707, sp.air_db);
        let mut comp_env = 0.0_f64;
        let c_att = 1.0 - (-1.0 / (sr * 0.015)).exp();
        let c_rel = 1.0 - (-1.0 / (sr * 0.15)).exp();
        let c_thresh = sp.comp_thresh;
        let inv_thresh = 1.0 / c_thresh;
        let neg_slope = -(1.0 - 1.0 / sp.comp_ratio);
        let c_makeup = 1.12_f64;

        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let v_hp_b0 = f64x2_splat(hp_b0); let v_hp_b1 = f64x2_splat(hp_b1); let v_hp_b2 = f64x2_splat(hp_b2);
            let v_hp_a1 = f64x2_splat(hp_a1); let v_hp_a2 = f64x2_splat(hp_a2);
            let v_dp_b0 = f64x2_splat(dp_b0); let v_dp_b1 = f64x2_splat(dp_b1); let v_dp_b2 = f64x2_splat(dp_b2);
            let v_dp_a1 = f64x2_splat(dp_a1); let v_dp_a2 = f64x2_splat(dp_a2);
            let v_ar_b0 = f64x2_splat(ar_b0); let v_ar_b1 = f64x2_splat(ar_b1); let v_ar_b2 = f64x2_splat(ar_b2);
            let v_ar_a1 = f64x2_splat(ar_a1); let v_ar_a2 = f64x2_splat(ar_a2);
            let mut hp_z1 = f64x2_splat(0.0); let mut hp_z2 = f64x2_splat(0.0);
            let mut dp_z1 = f64x2_splat(0.0); let mut dp_z2 = f64x2_splat(0.0);
            let mut ar_z1 = f64x2_splat(0.0); let mut ar_z2 = f64x2_splat(0.0);
            let mut pk_f = 1e-9_f32;

            for mi in 0..total {
                // Passband anti-denormal (-500 dBFS in f64) prevents all biquad & envelope denormals.
                let dn = if (mi & 16) == 0 { 1e-25_f64 } else { -1e-25_f64 };
                let x = f64x2((*left.get_unchecked(mi) as f64) + dn, (*right.get_unchecked(mi) as f64) - dn);

                let y1 = f64x2_add(f64x2_mul(v_hp_b0, x), hp_z1);
                hp_z1 = f64x2_add(f64x2_sub(f64x2_mul(v_hp_b1, x), f64x2_mul(v_hp_a1, y1)), hp_z2);
                hp_z2 = f64x2_sub(f64x2_mul(v_hp_b2, x), f64x2_mul(v_hp_a2, y1));

                let y2 = f64x2_add(f64x2_mul(v_dp_b0, y1), dp_z1);
                dp_z1 = f64x2_add(f64x2_sub(f64x2_mul(v_dp_b1, y1), f64x2_mul(v_dp_a1, y2)), dp_z2);
                dp_z2 = f64x2_sub(f64x2_mul(v_dp_b2, y1), f64x2_mul(v_dp_a2, y2));

                let y3 = f64x2_add(f64x2_mul(v_ar_b0, y2), ar_z1);
                ar_z1 = f64x2_add(f64x2_sub(f64x2_mul(v_ar_b1, y2), f64x2_mul(v_ar_a1, y3)), ar_z2);
                ar_z2 = f64x2_sub(f64x2_mul(v_ar_b2, y2), f64x2_mul(v_ar_a2, y3));

                let yl3 = f64x2_extract_lane::<0>(y3);
                let yr3 = f64x2_extract_lane::<1>(y3);
                let det = yl3.abs().max(yr3.abs());
                comp_env += (det - comp_env) * if det > comp_env { c_att } else { c_rel };
                let g = if comp_env > c_thresh {
                    fast_pow_pos(comp_env * inv_thresh, neg_slope) * c_makeup
                } else {
                    c_makeup
                };
                let ol = (yl3 * g) as f32;
                let or = (yr3 * g) as f32;
                *left.get_unchecked_mut(mi) = ol;
                *right.get_unchecked_mut(mi) = or;
                let al = ol.abs();
                let ar = or.abs();
                if al > pk_f { pk_f = al; }
                if ar > pk_f { pk_f = ar; }
            }
            pk = pk_f as f64;
        }

        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        {
            pk = 1e-9;
            let (mut hp_z1_l, mut hp_z2_l, mut hp_z1_r, mut hp_z2_r) = (0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64);
            let (mut dp_z1_l, mut dp_z2_l, mut dp_z1_r, mut dp_z2_r) = (0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64);
            let (mut ar_z1_l, mut ar_z2_l, mut ar_z1_r, mut ar_z2_r) = (0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64);
            for mi in 0..total {
                let dn = if (mi & 16) == 0 { 1e-25_f64 } else { -1e-25_f64 };
                let l = (left[mi] as f64) + dn;
                let r = (right[mi] as f64) - dn;
                let yl1 = hp_b0 * l + hp_z1_l; hp_z1_l = hp_b1 * l - hp_a1 * yl1 + hp_z2_l; hp_z2_l = hp_b2 * l - hp_a2 * yl1;
                let yr1 = hp_b0 * r + hp_z1_r; hp_z1_r = hp_b1 * r - hp_a1 * yr1 + hp_z2_r; hp_z2_r = hp_b2 * r - hp_a2 * yr1;
                let yl2 = dp_b0 * yl1 + dp_z1_l; dp_z1_l = dp_b1 * yl1 - dp_a1 * yl2 + dp_z2_l; dp_z2_l = dp_b2 * yl1 - dp_a2 * yl2;
                let yr2 = dp_b0 * yr1 + dp_z1_r; dp_z1_r = dp_b1 * yr1 - dp_a1 * yr2 + dp_z2_r; dp_z2_r = dp_b2 * yr1 - dp_a2 * yr2;
                let yl3 = ar_b0 * yl2 + ar_z1_l; ar_z1_l = ar_b1 * yl2 - ar_a1 * yl3 + ar_z2_l; ar_z2_l = ar_b2 * yl2 - ar_a2 * yl3;
                let yr3 = ar_b0 * yr2 + ar_z1_r; ar_z1_r = ar_b1 * yr2 - ar_a1 * yr3 + ar_z2_r; ar_z2_r = ar_b2 * yr2 - ar_a2 * yr3;
                let det = yl3.abs().max(yr3.abs());
                comp_env += (det - comp_env) * if det > comp_env { c_att } else { c_rel };
                let g = if comp_env > c_thresh {
                    fast_pow_pos(comp_env * inv_thresh, neg_slope) * c_makeup
                } else {
                    c_makeup
                };
                let ol = (yl3 * g) as f32;
                let or = (yr3 * g) as f32;
                left[mi] = ol;
                right[mi] = or;
                let al = (ol as f64).abs();
                let ar = (or as f64).abs();
                if al > pk { pk = al; }
                if ar > pk { pk = ar; }
            }
        }
    } else {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let mut v_pk = f32x4_splat(1e-9_f32);
            let mut i = 0usize;
            while i + 3 < total {
                let vl = f32x4_abs(v128_load(left.as_ptr().add(i) as *const v128));
                let vr = f32x4_abs(v128_load(right.as_ptr().add(i) as *const v128));
                v_pk = f32x4_pmax(v_pk, f32x4_pmax(vl, vr));
                i += 4;
            }
            let p0 = f32x4_extract_lane::<0>(v_pk) as f64;
            let p1 = f32x4_extract_lane::<1>(v_pk) as f64;
            let p2 = f32x4_extract_lane::<2>(v_pk) as f64;
            let p3 = f32x4_extract_lane::<3>(v_pk) as f64;
            pk = p0.max(p1).max(p2).max(p3).max(1e-9);
            while i < total {
                let al = (*left.get_unchecked(i) as f64).abs();
                let ar = (*right.get_unchecked(i) as f64).abs();
                if al > pk { pk = al; }
                if ar > pk { pk = ar; }
                i += 1;
            }
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        {
            pk = 1e-9;
            for i in 0..total {
                let al = (left[i] as f64).abs();
                let ar = (right[i] as f64).abs();
                if al > pk { pk = al; }
                if ar > pk { pk = ar; }
            }
        }
    }

    let gg = if pk > 0.92 { 0.92 / pk } else { 1.0 };
    let g_drive = gg * 1.02;
    if legacy_sound {
        for i in 0..total {
            let yl = ((left[i] as f64) * g_drive).tanh() * 0.97;
            let yr = ((right[i] as f64) * g_drive).tanh() * 0.97;
            left[i] = yl as f32;
            right[i] = yr as f32;
            mono[i] = ((yl + yr) * 0.5) as f32;
        }
    } else {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let v_gd = f32x4_splat(g_drive as f32);
            let v_945 = f32x4_splat(945.0_f32);
            let v_105 = f32x4_splat(105.0_f32);
            let v_420 = f32x4_splat(420.0_f32);
            let v_15 = f32x4_splat(15.0_f32);
            let v_097 = f32x4_splat(0.97_f32);
            let v_half = f32x4_splat(0.5_f32);
            let v_min = f32x4_splat(1e-15_f32);
            let mut i = 0usize;
            while i + 3 < total {
                let rl = v128_load(left.as_ptr().add(i) as *const v128);
                let xl = f32x4_mul(v128_and(rl, f32x4_gt(f32x4_abs(rl), v_min)), v_gd);
                let xl2 = f32x4_mul(xl, xl);
                let num_l = f32x4_mul(xl, f32x4_add(v_945, f32x4_mul(f32x4_add(v_105, xl2), xl2)));
                let den_l = f32x4_add(v_945, f32x4_mul(f32x4_add(v_420, f32x4_mul(v_15, xl2)), xl2));
                let yl = f32x4_mul(f32x4_div(num_l, den_l), v_097);

                let rr = v128_load(right.as_ptr().add(i) as *const v128);
                let xr = f32x4_mul(v128_and(rr, f32x4_gt(f32x4_abs(rr), v_min)), v_gd);
                let xr2 = f32x4_mul(xr, xr);
                let num_r = f32x4_mul(xr, f32x4_add(v_945, f32x4_mul(f32x4_add(v_105, xr2), xr2)));
                let den_r = f32x4_add(v_945, f32x4_mul(f32x4_add(v_420, f32x4_mul(v_15, xr2)), xr2));
                let yr = f32x4_mul(f32x4_div(num_r, den_r), v_097);

                let ym = f32x4_mul(f32x4_add(yl, yr), v_half);
                v128_store(left.as_mut_ptr().add(i) as *mut v128, yl);
                v128_store(right.as_mut_ptr().add(i) as *mut v128, yr);
                v128_store(mono.as_mut_ptr().add(i) as *mut v128, ym);
                i += 4;
            }
            while i < total {
                let xl = (*left.get_unchecked(i) as f64) * g_drive;
                let xl2 = xl * xl;
                let yl = xl * (945.0 + (105.0 + xl2) * xl2) / (945.0 + (420.0 + 15.0 * xl2) * xl2) * 0.97;
                let xr = (*right.get_unchecked(i) as f64) * g_drive;
                let xr2 = xr * xr;
                let yr = xr * (945.0 + (105.0 + xr2) * xr2) / (945.0 + (420.0 + 15.0 * xr2) * xr2) * 0.97;
                *left.get_unchecked_mut(i) = yl as f32;
                *right.get_unchecked_mut(i) = yr as f32;
                *mono.get_unchecked_mut(i) = ((yl + yr) * 0.5) as f32;
                i += 1;
            }
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        {
            pk = 1e-9;
            for i in 0..total {
                let lv = left[i] as f64;
                let rv = right[i] as f64;
                if lv == 0.0 && rv == 0.0 {
                    mono[i] = 0.0;
                    continue;
                }
                let xl = lv * g_drive;
                let xl2 = xl * xl;
                let yl = xl * (945.0 + (105.0 + xl2) * xl2) / (945.0 + (420.0 + 15.0 * xl2) * xl2) * 0.97;
                left[i] = yl as f32;
                if lv == rv {
                    right[i] = yl as f32;
                    mono[i] = yl as f32;
                } else {
                    let xr = rv * g_drive;
                    let xr2 = xr * xr;
                    let yr = xr * (945.0 + (105.0 + xr2) * xr2) / (945.0 + (420.0 + 15.0 * xr2) * xr2) * 0.97;
                    right[i] = yr as f32;
                    mono[i] = ((yl + yr) * 0.5) as f32;
                }
            }
        }
    }
}
