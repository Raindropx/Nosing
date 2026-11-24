use core::f64::consts::PI;

pub struct RateConst {
    pub sr: f64,
    pub hop: f64,
    pub mode_b: bool,
    pub c1_16: f64,
    pub s1_16: f64,
    pub c2_16: f64,
    pub s2_16: f64,
    pub c1_sr: f64,
    pub s1_sr: f64,
    pub c2_sr: f64,
    pub s2_sr: f64,
    pub one_minus_c1_sr: f64,
}

impl RateConst {
    pub fn new(sr: f64, hop: f64, mode_b: bool) -> Self {
        let w16 = 2.0 * PI * 5500.0 / 16000.0;
        let wsr = 2.0 * PI * 5500.0 / sr;
        let c1_sr = wsr.cos();
        Self {
            sr,
            hop,
            mode_b,
            c1_16: w16.cos(),
            s1_16: w16.sin(),
            c2_16: (2.0 * w16).cos(),
            s2_16: (2.0 * w16).sin(),
            c1_sr,
            s1_sr: wsr.sin(),
            c2_sr: (2.0 * wsr).cos(),
            s2_sr: (2.0 * wsr).sin(),
            one_minus_c1_sr: 1.0 - c1_sr,
        }
    }

    #[inline]
    pub fn rate_correction(&self, f: f64, bw: f64) -> f64 {
        if !self.mode_b || !(f > 20.0 && f < 7600.0) {
            return 0.0;
        }
        let r1 = (-PI * bw / 16000.0).exp();
        let b1 = 2.0 * r1 * (2.0 * PI * f / 16000.0).cos();
        let c1 = -r1 * r1;
        let d1r = 1.0 - b1 * self.c1_16 - c1 * self.c2_16;
        let d1i = b1 * self.s1_16 + c1 * self.s2_16;
        let m1 = (1.0 - b1 - c1) / (d1r * d1r + d1i * d1i).sqrt();
        let r2 = (-PI * bw / self.sr).exp();
        let b2 = 2.0 * r2 * (2.0 * PI * f / self.sr).cos();
        let c2 = -r2 * r2;
        let d2r = 1.0 - b2 * self.c1_sr - c2 * self.c2_sr;
        let d2i = b2 * self.s1_sr + c2 * self.s2_sr;
        let m2 = (1.0 - b2 - c2) / (d2r * d2r + d2i * d2i).sqrt();
        ((m1 / m2 - 1.0) / self.one_minus_c1_sr).clamp(0.0, 8.0)
    }
}

#[derive(Clone)]
pub struct Resonator {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub y1: f64,
    pub y2: f64,
    pub da: f64,
    pub db: f64,
    pub dc: f64,
    pub calibrated: bool,
    pub g: f64,
    pub dg: f64,
    pub cos_w: f64,
    pub d_cos_w: f64,
    pub cos_w_open: f64,
    pub d_cos_w_open: f64,
    pub r_closed: f64,
    pub dr_closed: f64,
    pub r_open: f64,
    pub dr_open: f64,
}

impl Resonator {
    pub fn new(calibrated: bool) -> Self {
        Self {
            a: 1.0, b: 0.0, c: 0.0, y1: 0.0, y2: 0.0,
            da: 0.0, db: 0.0, dc: 0.0,
            calibrated, g: 0.0, dg: 0.0,
            cos_w: 1.0, d_cos_w: 0.0,
            cos_w_open: 1.0, d_cos_w_open: 0.0,
            r_closed: 0.0, dr_closed: 0.0,
            r_open: 0.0, dr_open: 0.0,
        }
    }

    #[inline]
    pub fn set(&mut self, rc: &RateConst, f: f64, mut bw: f64, snap: bool) {
        if !(bw > 0.0) {
            bw = 30.0;
        }
        let valid = f > 0.0 && f < rc.sr * 0.5;
        let r = if valid { (-PI * bw / rc.sr).exp() } else { 0.0 };
        let b = if valid { 2.0 * r * (2.0 * PI * f / rc.sr).cos() } else { 0.0 };
        let c = -r * r;
        let a = 1.0 - b - c;
        if self.calibrated {
            let g = if valid { rc.rate_correction(f, bw) } else { 0.0 };
            if snap {
                self.g = g;
                self.dg = 0.0;
            } else {
                self.dg = (g - self.g) / rc.hop;
            }
        }
        if snap {
            self.a = a; self.b = b; self.c = c;
            self.da = 0.0; self.db = 0.0; self.dc = 0.0;
            return;
        }
        self.da = (a - self.a) / rc.hop;
        self.db = (b - self.b) / rc.hop;
        self.dc = (c - self.c) / rc.hop;
    }

    #[inline]
    #[allow(clippy::too_many_arguments)]
    pub fn set_damped(
        &mut self,
        rc: &RateConst,
        f: f64,
        mut bw: f64,
        damp_amt: f64,
        snap: bool,
        f_shift_ratio: f64,
        damp_scale: f64,
    ) {
        if !(bw > 0.0) {
            bw = 30.0;
        }
        let valid = f > 0.0 && f < rc.sr * 0.5;
        let ds = damp_amt * damp_scale;
        let cw = if valid { (2.0 * PI * f / rc.sr).cos() } else { 1.0 };
        let cw_open = if valid && f_shift_ratio != 0.0 {
            (2.0 * PI * (f * (1.0 + f_shift_ratio)).min(rc.sr * 0.46) / rc.sr).cos()
        } else {
            cw
        };
        let bw_c = (bw * (1.0 - 0.14 * ds)).max(30.0);
        let bw_o = (bw * (1.0 + 0.90 * ds)).min(rc.sr * 0.28);
        let r_c = if valid { (-PI * bw_c / rc.sr).exp().min(0.998) } else { 0.0 };
        let r_o = if valid { (-PI * bw_o / rc.sr).exp().min(0.998) } else { 0.0 };
        if self.calibrated {
            let g = if valid { rc.rate_correction(f, bw) } else { 0.0 };
            if snap {
                self.g = g;
                self.dg = 0.0;
            } else {
                self.dg = (g - self.g) / rc.hop;
            }
        }
        if snap {
            self.cos_w = cw; self.d_cos_w = 0.0;
            self.cos_w_open = cw_open; self.d_cos_w_open = 0.0;
            self.r_closed = r_c; self.dr_closed = 0.0;
            self.r_open = r_o; self.dr_open = 0.0;
            return;
        }
        self.d_cos_w = (cw - self.cos_w) / rc.hop;
        self.d_cos_w_open = (cw_open - self.cos_w_open) / rc.hop;
        self.dr_closed = (r_c - self.r_closed) / rc.hop;
        self.dr_open = (r_o - self.r_open) / rc.hop;
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        self.a += self.da;
        self.b += self.db;
        self.c += self.dc;
        let y = self.a * x + self.b * self.y1 + self.c * self.y2;
        let out = if self.calibrated {
            self.g += self.dg;
            (1.0 + self.g) * self.y1 - 0.5 * self.g * (y + self.y2)
        } else {
            y
        };
        self.y2 = self.y1;
        self.y1 = y;
        out
    }

    #[inline(always)]
    pub fn run_damped(&mut self, x: f64, open_gate: f64) -> f64 {
        self.cos_w += self.d_cos_w;
        self.cos_w_open += self.d_cos_w_open;
        self.r_closed += self.dr_closed;
        self.r_open += self.dr_open;
        let r = self.r_closed + (self.r_open - self.r_closed) * open_gate;
        let cw = self.cos_w + (self.cos_w_open - self.cos_w) * open_gate;
        let b = 2.0 * r * cw;
        let c = -r * r;
        let a = 1.0 - b - c;
        let y = a * x + b * self.y1 + c * self.y2;
        let out = if self.calibrated {
            self.g += self.dg;
            (1.0 + self.g) * self.y1 - 0.5 * self.g * (y + self.y2)
        } else {
            y
        };
        self.y2 = self.y1;
        self.y1 = y;
        out
    }
}

pub struct DynamicNotch {
    b0: f64, b1: f64, b2: f64, a1: f64, a2: f64,
    db0: f64, db1: f64, db2: f64, da1: f64, da2: f64,
    x1: f64, x2: f64, y1: f64, y2: f64,
}

impl DynamicNotch {
    pub fn new() -> Self {
        Self {
            b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            db0: 0.0, db1: 0.0, db2: 0.0, da1: 0.0, da2: 0.0,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0,
        }
    }

    #[inline]
    pub fn set(&mut self, sr: f64, hop: f64, hz: f64, q: f64, db: f64, snap: bool) {
        let (mut b0, mut b1, mut b2, mut a1, mut a2) = (1.0, 0.0, 0.0, 0.0, 0.0);
        if hz > 40.0 && hz < sr * 0.48 && db.abs() > 0.01 {
            let cap_a = 10.0_f64.powf(db / 40.0);
            let w0 = 2.0 * PI * hz / sr;
            let alpha = w0.sin() / (2.0 * q.max(0.5));
            let c = -2.0 * w0.cos();
            let a0 = 1.0 + alpha / cap_a;
            b0 = (1.0 + alpha * cap_a) / a0;
            b1 = c / a0;
            b2 = (1.0 - alpha * cap_a) / a0;
            a1 = c / a0;
            a2 = (1.0 - alpha / cap_a) / a0;
        }
        if snap {
            self.b0 = b0; self.b1 = b1; self.b2 = b2; self.a1 = a1; self.a2 = a2;
            self.db0 = 0.0; self.db1 = 0.0; self.db2 = 0.0; self.da1 = 0.0; self.da2 = 0.0;
            return;
        }
        self.db0 = (b0 - self.b0) / hop;
        self.db1 = (b1 - self.b1) / hop;
        self.db2 = (b2 - self.b2) / hop;
        self.da1 = (a1 - self.a1) / hop;
        self.da2 = (a2 - self.a2) / hop;
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        self.b0 += self.db0; self.b1 += self.db1; self.b2 += self.db2;
        self.a1 += self.da1; self.a2 += self.da2;
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1; self.x1 = x;
        self.y2 = self.y1; self.y1 = y;
        y
    }
}

#[inline]
pub fn hpc_coeffs(f6: f64, sr: f64) -> [f64; 5] {
    let f6_eff = if f6 > 0.0 { f6 } else { 5200.0 };
    let fc = (3800.0 * (f6_eff / 5200.0)).clamp(3200.0, 4400.0);
    let cap_a = 10.0_f64.powf(11.5 / 40.0);
    let w0 = 2.0 * PI * fc / sr;
    let cw0 = w0.cos();
    let sw0 = w0.sin();
    let alpha = sw0 / (2.0 * 0.60);
    let tsa = 2.0 * cap_a.sqrt() * alpha;
    let a0 = (cap_a + 1.0) - (cap_a - 1.0) * cw0 + tsa;
    [
        (cap_a * ((cap_a + 1.0) + (cap_a - 1.0) * cw0 + tsa)) / a0,
        (-2.0 * cap_a * ((cap_a - 1.0) + (cap_a + 1.0) * cw0)) / a0,
        (cap_a * ((cap_a + 1.0) + (cap_a - 1.0) * cw0 - tsa)) / a0,
        (2.0 * ((cap_a - 1.0) - (cap_a + 1.0) * cw0)) / a0,
        ((cap_a + 1.0) - (cap_a - 1.0) * cw0 - tsa) / a0,
    ]
}

pub struct DynamicShelf {
    b0: f64, b1: f64, b2: f64, a1: f64, a2: f64,
    db0: f64, db1: f64, db2: f64, da1: f64, da2: f64,
    x1: f64, x2: f64, y1: f64, y2: f64,
}

impl DynamicShelf {
    pub fn new() -> Self {
        Self {
            b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            db0: 0.0, db1: 0.0, db2: 0.0, da1: 0.0, da2: 0.0,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0,
        }
    }

    #[inline]
    pub fn set(&mut self, sr: f64, hop: f64, f6: f64, snap: bool) {
        let c = hpc_coeffs(f6, sr);
        if snap {
            self.b0 = c[0]; self.b1 = c[1]; self.b2 = c[2]; self.a1 = c[3]; self.a2 = c[4];
            self.db0 = 0.0; self.db1 = 0.0; self.db2 = 0.0; self.da1 = 0.0; self.da2 = 0.0;
            return;
        }
        self.db0 = (c[0] - self.b0) / hop;
        self.db1 = (c[1] - self.b1) / hop;
        self.db2 = (c[2] - self.b2) / hop;
        self.da1 = (c[3] - self.a1) / hop;
        self.da2 = (c[4] - self.a2) / hop;
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        self.b0 += self.db0; self.b1 += self.db1; self.b2 += self.db2;
        self.a1 += self.da1; self.a2 += self.da2;
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1; self.x1 = x;
        self.y2 = self.y1; self.y1 = y;
        y
    }
}

pub struct AntiResonator {
    a: f64, b: f64, c: f64, x1: f64, x2: f64,
    da: f64, db: f64, dc: f64,
}

impl AntiResonator {
    pub fn new() -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, x1: 0.0, x2: 0.0, da: 0.0, db: 0.0, dc: 0.0 }
    }

    #[inline]
    pub fn set(&mut self, sr: f64, hop: f64, f: f64, mut bw: f64, snap: bool) {
        if !(bw > 0.0) { bw = 30.0; }
        let valid = f > 0.0 && f < sr * 0.5;
        let (mut a, mut bz, mut cz) = (1.0, 0.0, 0.0);
        if valid {
            let r = (-PI * bw / sr).exp();
            let b = 2.0 * r * (2.0 * PI * f / sr).cos();
            let c = -r * r;
            let a0 = 1.0 - b - c;
            if a0.abs() > 1e-12 {
                a = 1.0 / a0;
                bz = -b / a0;
                cz = -c / a0;
            }
        }
        if snap {
            self.a = a; self.b = bz; self.c = cz;
            self.da = 0.0; self.db = 0.0; self.dc = 0.0;
            return;
        }
        self.da = (a - self.a) / hop;
        self.db = (bz - self.b) / hop;
        self.dc = (cz - self.c) / hop;
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        self.a += self.da; self.b += self.db; self.c += self.dc;
        let y = self.a * x + self.b * self.x1 + self.c * self.x2;
        self.x2 = self.x1; self.x1 = x;
        y
    }
}

pub struct NasalBranch {
    b1: f64, b2: f64, a1: f64, a2: f64,
    db1: f64, db2: f64, da1: f64, da2: f64,
    x1: f64, x2: f64, y1: f64, y2: f64,
}

impl NasalBranch {
    pub fn new() -> Self {
        Self {
            b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            db1: 0.0, db2: 0.0, da1: 0.0, da2: 0.0,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0,
        }
    }

    #[inline]
    pub fn set(&mut self, sr: f64, hop: f64, f_pole: f64, bw_pole: f64, f_zero: f64, bw_zero: f64, snap: bool) {
        let rp = (-PI * bw_pole / sr).exp();
        let rz = (-PI * bw_zero / sr).exp();
        let a1 = 2.0 * rp * (2.0 * PI * f_pole / sr).cos();
        let a2 = -rp * rp;
        let b1 = -2.0 * rz * (2.0 * PI * f_zero / sr).cos();
        let b2 = rz * rz;
        if snap {
            self.a1 = a1; self.a2 = a2; self.b1 = b1; self.b2 = b2;
            self.da1 = 0.0; self.da2 = 0.0; self.db1 = 0.0; self.db2 = 0.0;
            return;
        }
        self.da1 = (a1 - self.a1) / hop;
        self.da2 = (a2 - self.a2) / hop;
        self.db1 = (b1 - self.b1) / hop;
        self.db2 = (b2 - self.b2) / hop;
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        self.a1 += self.da1; self.a2 += self.da2;
        self.b1 += self.db1; self.b2 += self.db2;
        let y = x + self.b1 * self.x1 + self.b2 * self.x2 + self.a1 * self.y1 + self.a2 * self.y2;
        self.x2 = self.x1; self.x1 = x;
        self.y2 = self.y1; self.y1 = y;
        y
    }
}

pub struct HiFiNasalBranch {
    n1: Resonator,
    z1: AntiResonator,
    n2: Resonator,
    n3: Resonator,
}

impl HiFiNasalBranch {
    pub fn new() -> Self {
        Self {
            n1: Resonator::new(false),
            z1: AntiResonator::new(),
            n2: Resonator::new(false),
            n3: Resonator::new(false),
        }
    }

    #[inline]
    pub fn set(&mut self, rc: &RateConst, scale: f64, bw_scale: f64, f1_hz: f64, snap: bool) {
        let s = scale.clamp(0.7, 1.5);
        let bw = bw_scale.clamp(0.7, 1.5);
        let lim = rc.sr * 0.45;
        let n1 = (275.0 * s + 0.04 * (f1_hz - 500.0)).min(lim);
        let z1 = (520.0 * s).max(n1 + 120.0).min(lim);
        let n2 = (1040.0 * s).max(z1 + 180.0).min(lim);
        let n3 = (2150.0 * s.powf(0.7)).max(n2 + 300.0).min(lim);
        self.n1.set(rc, n1, 85.0 * bw, snap);
        self.z1.set(rc.sr, rc.hop, z1, 150.0 * bw, snap);
        self.n2.set(rc, n2, 200.0 * bw, snap);
        self.n3.set(rc, n3, 270.0 * bw, snap);
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        let n1_out = self.n1.run(x);
        let low = self.z1.run(n1_out);
        0.64 * low + 0.22 * self.n2.run(x) + 0.14 * self.n3.run(x)
    }
}

pub struct FricativeFrontCavity {
    forward: [f64; 64],
    backward: [f64; 64],
    stub: [f64; 64],
    index: usize,
    stub_index: usize,
    delay: f64, target: f64, step: f64,
    stub_delay: f64, stub_target: f64, stub_step: f64,
    loss: f64, stub_loss: f64,
    f_ap_x1: f64, f_ap_y1: f64, b_ap_x1: f64, b_ap_y1: f64,
    s_ap_x1: f64, s_ap_y1: f64,
    last_int_d: usize, last_stub_int_d: usize,
    amount: f64,
    lp: f64, lp_t: f64, lp_step: f64,
    lp_z: f64, lp_zt: f64, lp_z_step: f64,
    r_back: f64, r_back_t: f64, r_back_step: f64,
    r_lip: f64, r_lip_t: f64, r_lip_step: f64,
    r_stub: f64, r_stub_t: f64, r_stub_step: f64,
    r_j: f64, r_j_t: f64, r_j_step: f64,
    last_f: f64,
    last_studio: bool,
    steady: bool,
    s_int: usize, s_ap: f64, int_d: usize, ap: f64,
}

impl FricativeFrontCavity {
    pub fn new(amount: f64) -> Self {
        Self {
            forward: [0.0; 64], backward: [0.0; 64], stub: [0.0; 64],
            index: 0, stub_index: 0,
            delay: 2.0, target: 2.0, step: 0.0,
            stub_delay: 12.0, stub_target: 12.0, stub_step: 0.0,
            loss: 0.0, stub_loss: 0.0,
            f_ap_x1: 0.0, f_ap_y1: 0.0, b_ap_x1: 0.0, b_ap_y1: 0.0,
            s_ap_x1: 0.0, s_ap_y1: 0.0,
            last_int_d: 1, last_stub_int_d: 1,
            amount: amount.clamp(0.0, 1.0),
            lp: 0.5, lp_t: 0.5, lp_step: 0.0,
            lp_z: 0.6, lp_zt: 0.6, lp_z_step: 0.0,
            r_back: 0.4, r_back_t: 0.4, r_back_step: 0.0,
            r_lip: 0.36, r_lip_t: 0.36, r_lip_step: 0.0,
            r_stub: 0.4, r_stub_t: 0.4, r_stub_step: 0.0,
            r_j: 0.16, r_j_t: 0.16, r_j_step: 0.0,
            last_f: -1.0, last_studio: false, steady: false,
            s_int: 1, s_ap: 0.0, int_d: 1, ap: 0.0,
        }
    }

    #[inline]
    fn cache_steady(&mut self) {
        self.s_int = ((self.stub_delay - 0.45).floor() as isize).max(1) as usize;
        let s_delta = self.stub_delay - (self.s_int as f64);
        self.s_ap = (1.0 - s_delta) / (1.0 + s_delta);
        self.int_d = ((self.delay - 0.45).floor() as isize).max(1) as usize;
        let delta = self.delay - (self.int_d as f64);
        self.ap = (1.0 - delta) / (1.0 + delta);
    }

    #[inline]
    pub fn snap(&mut self) {
        self.delay = self.target;
        self.stub_delay = self.stub_target;
        self.lp = self.lp_t;
        self.lp_z = self.lp_zt;
        self.r_back = self.r_back_t;
        self.r_lip = self.r_lip_t;
        self.r_stub = self.r_stub_t;
        self.r_j = self.r_j_t;
        self.cache_steady();
    }

    #[inline]
    pub fn set(&mut self, sr: f64, hop: f64, hz: f64, studio: bool, snap: bool) {
        let f = hz.max(1000.0);
        if f != self.last_f || studio != self.last_studio {
            self.last_f = f;
            self.last_studio = studio;
            let amt = self.amount;
            let t_pal = ((f - 3100.0) / (4200.0 - 3100.0)).clamp(0.0, 1.0);
            let t_alv = ((f - 4200.0) / (6100.0 - 4200.0)).clamp(0.0, 1.0);
            let place = |sh: f64, x: f64, s: f64| -> f64 {
                let sx = sh + (x - sh) * t_pal;
                sx + (s - sx) * t_alv
            };
            let f_pole = if studio { place(3650.0, 6100.0, 9000.0) } else { place(2750.0, 5600.0, 8200.0) };
            let lp_hz = if studio { place(10500.0, 13000.0, 18000.0) } else { place(9000.0, 10500.0, 16500.0) };
            let f_zero = place(1350.0, 2350.0, 2700.0);
            let lp_zero = place(2400.0, 2300.0, 4200.0);
            let couple = |light_v: f64, strong_v: f64| -> f64 {
                if amt >= 1.0 { strong_v }
                else if amt <= 0.5 { light_v * (amt / 0.5) }
                else { light_v + (strong_v - light_v) * ((amt - 0.5) / 0.5) }
            };
            self.r_back_t = couple(place(0.40, 0.38, 0.30), place(0.62, 0.54, 0.48));
            self.r_lip_t = couple(place(0.36, 0.34, 0.26), place(0.56, 0.48, 0.42));
            self.r_stub_t = couple(place(0.34, 0.36, 0.34), place(0.58, 0.56, 0.58));
            self.r_j_t = couple(place(0.14, 0.14, 0.14), place(0.22, 0.22, 0.24));
            self.lp_t = (-2.0 * PI * lp_hz / sr).exp();
            let w = 2.0 * PI * f_pole / sr;
            let lr = 1.0 - self.lp_t * w.cos();
            let li = self.lp_t * w.sin();
            let tau_lp = li.atan2(lr) / w.max(1e-6);
            self.target = (sr / (4.0 * f_pole) - 0.5 * tau_lp).clamp(1.15, 14.0);
            self.lp_zt = (-2.0 * PI * lp_zero / sr).exp();
            let wz = 2.0 * PI * f_zero / sr;
            let lzr = 1.0 - self.lp_zt * wz.cos();
            let lzi = self.lp_zt * wz.sin();
            let tau_lz = lzi.atan2(lzr) / wz.max(1e-6);
            self.stub_target = (sr / (2.0 * f_zero) - tau_lz).clamp(2.0, 36.0);
        }
        if snap {
            self.snap();
        }
        self.step = (self.target - self.delay) / hop;
        self.stub_step = (self.stub_target - self.stub_delay) / hop;
        self.lp_step = (self.lp_t - self.lp) / hop;
        self.lp_z_step = (self.lp_zt - self.lp_z) / hop;
        self.r_back_step = (self.r_back_t - self.r_back) / hop;
        self.r_lip_step = (self.r_lip_t - self.r_lip) / hop;
        self.r_stub_step = (self.r_stub_t - self.r_stub) / hop;
        self.r_j_step = (self.r_j_t - self.r_j) / hop;
        self.steady = self.step == 0.0 && self.stub_step == 0.0 && self.lp_step == 0.0
            && self.lp_z_step == 0.0 && self.r_back_step == 0.0 && self.r_lip_step == 0.0
            && self.r_stub_step == 0.0 && self.r_j_step == 0.0;
        if self.steady {
            self.cache_steady();
        }
    }

    #[inline(always)]
    pub fn run(&mut self, x: f64) -> f64 {
        let (s_int, s_ap, int_d, ap) = if self.steady {
            (self.s_int, self.s_ap, self.int_d, self.ap)
        } else {
            self.delay += self.step;
            self.stub_delay += self.stub_step;
            self.lp += self.lp_step;
            self.lp_z += self.lp_z_step;
            self.r_back += self.r_back_step;
            self.r_lip += self.r_lip_step;
            self.r_stub += self.r_stub_step;
            self.r_j += self.r_j_step;
            let si = ((self.stub_delay - 0.45).floor() as isize).max(1) as usize;
            let sd = self.stub_delay - (si as f64);
            let sap = (1.0 - sd) / (1.0 + sd);
            let id = ((self.delay - 0.45).floor() as isize).max(1) as usize;
            let dl = self.delay - (id as f64);
            let a = (1.0 - dl) / (1.0 + dl);
            (si, sap, id, a)
        };
        if s_int != self.last_stub_int_d {
            let sp = (self.stub_index + 64 - 1 - s_int) & 63;
            self.s_ap_x1 = self.stub[sp];
            self.last_stub_int_d = s_int;
        }
        let s_tap = (self.stub_index + 64 - s_int) & 63;
        let s_in = self.stub[s_tap];
        let s_out = s_ap * s_in + self.s_ap_x1 - s_ap * self.s_ap_y1;
        self.s_ap_x1 = s_in;
        self.s_ap_y1 = s_out;
        self.stub_loss = (1.0 - self.lp_z) * s_out + self.lp_z * self.stub_loss;
        let stub_refl = self.r_stub * self.stub_loss;
        self.stub[self.stub_index] = x + self.r_j * stub_refl;
        self.stub_index = (self.stub_index + 1) & 63;
        let junc = x + (1.0 + self.r_j) * stub_refl;

        if int_d != self.last_int_d {
            let p_idx = (self.index + 64 - 1 - int_d) & 63;
            self.f_ap_x1 = self.forward[p_idx];
            self.b_ap_x1 = self.backward[p_idx];
            self.last_int_d = int_d;
        }
        let tap = (self.index + 64 - int_d) & 63;
        let f_in = self.forward[tap];
        let b_in = self.backward[tap];
        let ahead = ap * f_in + self.f_ap_x1 - ap * self.f_ap_y1;
        self.f_ap_x1 = f_in;
        self.f_ap_y1 = ahead;
        let back = ap * b_in + self.b_ap_x1 - ap * self.b_ap_y1;
        self.b_ap_x1 = b_in;
        self.b_ap_y1 = back;
        self.loss = (1.0 - self.lp) * ahead + self.lp * self.loss;
        let lip_refl = -self.r_lip * self.loss;
        self.forward[self.index] = junc + self.r_back * back;
        self.backward[self.index] = lip_refl;
        self.index = (self.index + 1) & 63;
        ahead + lip_refl
    }
}

pub struct Piriform {
    pub b0: f64, pub b1: f64, pub b2: f64, pub a1: f64, pub a2: f64,
    pub x1: f64, pub x2: f64, pub y1: f64, pub y2: f64,
}

impl Piriform {
    pub fn new(b0: f64, b1: f64, b2: f64, a1: f64, a2: f64) -> Self {
        Self { b0, b1, b2, a1, a2, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    #[inline(always)]
    pub fn run(&mut self, y: f64) -> f64 {
        let py = self.b0 * y + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1; self.x1 = y;
        self.y2 = self.y1; self.y1 = py;
        py
    }
}

#[inline]
pub fn nasal_zero_bw(pole: f64, zero: f64) -> f64 {
    100.0 + (400.0 - 100.0) * ((zero - pole) / 600.0).clamp(0.0, 1.0)
}
