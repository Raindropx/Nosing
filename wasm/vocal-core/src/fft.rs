use core::f64::consts::PI;

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::*;

/// In-place forward Radix-2 FFT on f64 arrays with precomputed twiddles & SIMD128 butterflies.
pub struct FftWorkspace {
    pub re: Vec<f64>,
    pub im: Vec<f64>,
    pub bitrev_4096: Vec<u16>,
    pub bitrev_8192: Vec<u16>,
    pub tw_re_8192: Vec<f64>,
    pub tw_im_8192: Vec<f64>,
    pub tw_re_4096: Vec<f64>,
    pub tw_im_4096: Vec<f64>,
}

fn build_bitrev(n: usize) -> Vec<u16> {
    let mut rev = vec![0u16; n];
    let bits = n.trailing_zeros();
    for i in 0..n {
        rev[i] = (i.reverse_bits() >> (usize::BITS - bits)) as u16;
    }
    rev
}

fn build_twiddles(n: usize) -> (Vec<f64>, Vec<f64>) {
    // Store twiddle factors for stages m = 2, 4, ..., n contiguously.
    // Total entries = 1 + 2 + 4 + ... + n/2 = n - 1.
    let mut tw_re = Vec::with_capacity(n);
    let mut tw_im = Vec::with_capacity(n);
    let mut m = 2usize;
    while m <= n {
        let half = m >> 1;
        let step = -2.0 * PI / (m as f64);
        for h in 0..half {
            let ang = step * (h as f64);
            tw_re.push(ang.cos());
            tw_im.push(ang.sin());
        }
        m <<= 1;
    }
    (tw_re, tw_im)
}

impl FftWorkspace {
    pub fn new() -> Self {
        let (tw_re_8192, tw_im_8192) = build_twiddles(8192);
        let (tw_re_4096, tw_im_4096) = build_twiddles(4096);
        Self {
            re: vec![0.0; 8192],
            im: vec![0.0; 8192],
            bitrev_4096: build_bitrev(4096),
            bitrev_8192: build_bitrev(8192),
            tw_re_8192,
            tw_im_8192,
            tw_re_4096,
            tw_im_4096,
        }
    }

    pub fn fft(&mut self, n: usize) {
        if n == 8192 {
            fft_with_tables(&mut self.re, &mut self.im, 8192, &self.bitrev_8192, &self.tw_re_8192, &self.tw_im_8192);
        } else if n == 4096 {
            fft_with_tables(&mut self.re, &mut self.im, 4096, &self.bitrev_4096, &self.tw_re_4096, &self.tw_im_4096);
        } else {
            fft_generic(&mut self.re, &mut self.im, n);
        }
    }
}

#[inline]
fn fft_with_tables(re: &mut [f64], im: &mut [f64], n: usize, bitrev: &[u16], tw_re: &[f64], tw_im: &[f64]) {
    unsafe {
        let r_ptr = re.as_mut_ptr();
        let i_ptr = im.as_mut_ptr();
        for i in 0..n {
            let j = *bitrev.get_unchecked(i) as usize;
            if i < j {
                core::ptr::swap(r_ptr.add(i), r_ptr.add(j));
                core::ptr::swap(i_ptr.add(i), i_ptr.add(j));
            }
        }
        // Stage m = 2 (twiddle = 1, 0)
        let mut k = 0usize;
        while k < n {
            let ur = *r_ptr.add(k);
            let ui = *i_ptr.add(k);
            let vr = *r_ptr.add(k + 1);
            let vi = *i_ptr.add(k + 1);
            *r_ptr.add(k) = ur + vr;
            *i_ptr.add(k) = ui + vi;
            *r_ptr.add(k + 1) = ur - vr;
            *i_ptr.add(k + 1) = ui - vi;
            k += 2;
        }
        // Remaining stages m = 4, 8, ..., n (half >= 2 -> SIMD f64x2!)
        let mut tw_off = 1usize;
        let mut m = 4usize;
        while m <= n {
            let half = m >> 1;
            let twr_ptr = tw_re.as_ptr().add(tw_off);
            let twi_ptr = tw_im.as_ptr().add(tw_off);
            let mut k = 0usize;
            while k < n {
                #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
                {
                    let mut h = 0usize;
                    while h < half {
                        let a = k + h;
                        let b = a + half;
                        let ur = v128_load(r_ptr.add(a) as *const v128);
                        let ui = v128_load(i_ptr.add(a) as *const v128);
                        let br = v128_load(r_ptr.add(b) as *const v128);
                        let bi = v128_load(i_ptr.add(b) as *const v128);
                        let wr = v128_load(twr_ptr.add(h) as *const v128);
                        let wi = v128_load(twi_ptr.add(h) as *const v128);
                        let vr = f64x2_sub(f64x2_mul(br, wr), f64x2_mul(bi, wi));
                        let vi = f64x2_add(f64x2_mul(br, wi), f64x2_mul(bi, wr));
                        v128_store(r_ptr.add(a) as *mut v128, f64x2_add(ur, vr));
                        v128_store(i_ptr.add(a) as *mut v128, f64x2_add(ui, vi));
                        v128_store(r_ptr.add(b) as *mut v128, f64x2_sub(ur, vr));
                        v128_store(i_ptr.add(b) as *mut v128, f64x2_sub(ui, vi));
                        h += 2;
                    }
                }
                #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
                {
                    for h in 0..half {
                        let a = k + h;
                        let b = a + half;
                        let ur = *r_ptr.add(a);
                        let ui = *i_ptr.add(a);
                        let br = *r_ptr.add(b);
                        let bi = *i_ptr.add(b);
                        let wr = *twr_ptr.add(h);
                        let wi = *twi_ptr.add(h);
                        let vr = br * wr - bi * wi;
                        let vi = br * wi + bi * wr;
                        *r_ptr.add(a) = ur + vr;
                        *i_ptr.add(a) = ui + vi;
                        *r_ptr.add(b) = ur - vr;
                        *i_ptr.add(b) = ui - vi;
                    }
                }
                k += m;
            }
            tw_off += half;
            m <<= 1;
        }
    }
}

pub fn fft_generic(re: &mut [f64], im: &mut [f64], n: usize) {
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while (j & bit) != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut m = 2usize;
    while m <= n {
        let half = m >> 1;
        let ang = -2.0 * PI / (m as f64);
        let wmr = ang.cos();
        let wmi = ang.sin();
        let mut k = 0usize;
        while k < n {
            let mut wr = 1.0;
            let mut wi = 0.0;
            for h in 0..half {
                let a = k + h;
                let b = a + half;
                let ur = re[a];
                let ui = im[a];
                let vr = re[b] * wr - im[b] * wi;
                let vi = re[b] * wi + im[b] * wr;
                re[a] = ur + vr;
                im[a] = ui + vi;
                re[b] = ur - vr;
                im[b] = ui - vi;
                let nwr = wr * wmr - wi * wmi;
                wi = wr * wmi + wi * wmr;
                wr = nwr;
            }
            k += m;
        }
        m <<= 1;
    }
}

pub fn out_eq_db_at(eq: &[f64], hz: f64) -> f64 {
    let len = eq.len();
    if len == 0 {
        return 0.0;
    }
    let last = len - 1;
    if hz <= 50.0 {
        return eq[0];
    }
    let is64 = len == 64;
    let hi = if is64 { 20000.0 } else { 8000.0 };
    if hz >= hi {
        return eq[last];
    }
    let log50 = 50.0_f64.ln();
    let inv_log = if is64 { 1.0 / 400.0_f64.ln() } else { 1.0 / 160.0_f64.ln() };
    let x = (hz.ln() - log50) * inv_log * (last as f64);
    let mut i = x as usize;
    if i >= last {
        i = last - 1;
    }
    eq[i] + (eq[i + 1] - eq[i]) * (x - (i as f64))
}

pub struct EqKernel {
    pub re: Vec<f64>,
    pub im: Vec<f64>,
    pub eq_l: usize,
    pub eq_fft: usize,
}

pub fn build_out_eq_kernel(
    ws: &mut FftWorkspace,
    eq: &[f64],
    sr: f64,
    hd: bool,
    is_delta: bool,
) -> EqKernel {
    let eq_l: usize = if hd { 3071 } else { 1023 };
    let eq_fft: usize = if hd { 8192 } else { 4096 };
    let m: usize = if hd { 8192 } else { 2048 };
    ws.re[..m].fill(0.0);
    ws.im[..m].fill(0.0);
    for k in 0..=(m / 2) {
        let hz = (k as f64) * sr / (m as f64);
        let g = 10.0_f64.powf(out_eq_db_at(eq, hz) / 20.0);
        ws.re[k] = g;
        if k > 0 && k < m / 2 {
            ws.re[m - k] = g;
        }
    }
    ws.fft(m);
    let mut hr = vec![0.0; eq_fft];
    let mut hi = vec![0.0; eq_fft];
    let c = (eq_l - 1) / 2;
    let inv_m = 1.0 / (m as f64);
    let denom = (eq_l + 1) as f64;
    for n in 0..eq_l {
        let d = (n as isize) - (c as isize);
        let w = 0.5 + 0.5 * (2.0 * PI * (d as f64) / denom).cos();
        let idx = ((d + (m as isize)) as usize) % m;
        hr[n] = ws.re[idx] * inv_m * w;
    }
    if is_delta {
        hr[c] -= 1.0;
    }
    ws.re[..eq_fft].copy_from_slice(&hr);
    ws.im[..eq_fft].fill(0.0);
    ws.fft(eq_fft);
    hr.copy_from_slice(&ws.re[..eq_fft]);
    hi.copy_from_slice(&ws.im[..eq_fft]);
    EqKernel { re: hr, im: hi, eq_l, eq_fft }
}

/// Dual-block SIMD128 overlap-add linear-phase FIR EQ in-place on `pcm`.
pub fn apply_out_eq_inplace(ws: &mut FftWorkspace, pcm: &mut [f32], kernel: &EqKernel) {
    let n = pcm.len();
    if n == 0 {
        return;
    }
    let eq_fft = kernel.eq_fft;
    let eq_l = kernel.eq_l;
    let b_sz = eq_fft - eq_l + 1;
    let overlap = eq_l - 1;
    let c = overlap >> 1;
    let inv_fft = 1.0 / (eq_fft as f64);
    let mut tail = vec![0.0_f64; overlap];
    let kr = &kernel.re;
    let ki = &kernel.im;

    let mut s = 0usize;
    while s < n {
        let len_a = b_sz.min(n - s);
        let mut nz_a = false;
        for z in 0..len_a {
            if pcm[s + z] != 0.0 {
                nz_a = true;
                break;
            }
        }
        let is_last_a = s + b_sz >= n;
        let ws_a = if s < c { c - s } else { 0 };
        let we_a = if is_last_a { n + c - s } else { b_sz };
        if !nz_a {
            for zi in ws_a..we_a {
                pcm[s + zi - c] = (if zi < overlap { tail[zi] } else { 0.0 }) as f32;
            }
            if !is_last_a {
                tail.fill(0.0);
            }
            s += b_sz;
            continue;
        }
        let s_b = s + b_sz;
        let mut has_b = false;
        let mut len_b = 0usize;
        if !is_last_a {
            len_b = b_sz.min(n - s_b);
            for zb in 0..len_b {
                if pcm[s_b + zb] != 0.0 {
                    has_b = true;
                    break;
                }
            }
        }
        for ia in 0..len_a {
            ws.re[ia] = pcm[s + ia] as f64;
        }
        ws.re[len_a..eq_fft].fill(0.0);
        if has_b {
            for ib in 0..len_b {
                ws.im[ib] = pcm[s_b + ib] as f64;
            }
            ws.im[len_b..eq_fft].fill(0.0);
        } else {
            ws.im[..eq_fft].fill(0.0);
        }
        ws.fft(eq_fft);

        // Complex multiply + conjugate in SIMD f64x2
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        unsafe {
            let rp = ws.re.as_mut_ptr();
            let ip = ws.im.as_mut_ptr();
            let krp = kr.as_ptr();
            let kip = ki.as_ptr();
            let mut k = 0usize;
            while k < eq_fft {
                let rk = v128_load(rp.add(k) as *const v128);
                let ik = v128_load(ip.add(k) as *const v128);
                let krk = v128_load(krp.add(k) as *const v128);
                let kik = v128_load(kip.add(k) as *const v128);
                let out_r = f64x2_sub(f64x2_mul(rk, krk), f64x2_mul(ik, kik));
                let out_i = f64x2_neg(f64x2_add(f64x2_mul(rk, kik), f64x2_mul(ik, krk)));
                v128_store(rp.add(k) as *mut v128, out_r);
                v128_store(ip.add(k) as *mut v128, out_i);
                k += 2;
            }
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        {
            for k in 0..eq_fft {
                let rk = ws.re[k];
                let ik = ws.im[k];
                let krk = kr[k];
                let kik = ki[k];
                ws.re[k] = rk * krk - ik * kik;
                ws.im[k] = -(rk * kik + ik * krk);
            }
        }

        ws.fft(eq_fft);

        for wi in ws_a..we_a {
            let t = if wi < overlap { tail[wi] } else { 0.0 };
            pcm[s + wi - c] = (t + ws.re[wi] * inv_fft) as f32;
        }
        if !is_last_a {
            for ja in 0..overlap {
                tail[ja] = ws.re[b_sz + ja] * inv_fft;
            }
        }
        if has_b {
            let is_last_b = s_b + b_sz >= n;
            let we_b = if is_last_b { n + c - s_b } else { b_sz };
            for wb in 0..we_b {
                let t = if wb < overlap { tail[wb] } else { 0.0 };
                pcm[s_b + wb - c] = (t - ws.im[wb] * inv_fft) as f32;
            }
            if !is_last_b {
                for jb in 0..overlap {
                    tail[jb] = -ws.im[b_sz + jb] * inv_fft;
                }
            }
            s += b_sz + b_sz;
        } else {
            s += b_sz;
        }
    }
}
