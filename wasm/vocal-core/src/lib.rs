mod fft;
mod filters;
mod harmonics;
mod render;

use core::cell::UnsafeCell;
use render::{VocalEngine, FRAME_STRIDE};

struct EngineCell(UnsafeCell<Option<VocalEngine>>);
unsafe impl Sync for EngineCell {}

static ENGINE: EngineCell = EngineCell(UnsafeCell::new(None));

#[inline]
fn engine() -> &'static mut VocalEngine {
    unsafe {
        let slot = &mut *ENGINE.0.get();
        if slot.is_none() {
            *slot = Some(VocalEngine::new());
        }
        slot.as_mut().unwrap()
    }
}

#[no_mangle]
pub extern "C" fn vocal_init() -> u32 {
    let _ = engine();
    FRAME_STRIDE as u32
}

#[no_mangle]
pub extern "C" fn vocal_cfg_ptr() -> *mut f64 {
    engine().cfg_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_harm_ptr() -> *mut f64 {
    engine().harm_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_source_eq_ptr() -> *mut f64 {
    engine().source_eq_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_out_eq_ptr() -> *mut f64 {
    engine().out_eq_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_air_eq_ptr() -> *mut f64 {
    engine().air_eq_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_lf_alloc(count: u32) -> u32 {
    let e = engine();
    let n = count as usize;
    if e.lf_phase_buf.len() < n {
        e.lf_phase_buf.resize(n, 0.0);
    }
    if e.lf_mag_buf.len() < n {
        e.lf_mag_buf.resize(n, 0.0);
    }
    n as u32
}

#[no_mangle]
pub extern "C" fn vocal_lf_phase_ptr() -> *mut f64 {
    engine().lf_phase_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_lf_mag_ptr() -> *mut f64 {
    engine().lf_mag_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_frames_alloc(n_frames: u32) -> *mut f64 {
    let e = engine();
    let need = (n_frames as usize) * FRAME_STRIDE;
    if e.frames_buf.len() < need {
        e.frames_buf.resize(need, 0.0);
    }
    e.frames_buf.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn vocal_render(n_frames: u32) -> u32 {
    engine().render_frames(n_frames as usize) as u32
}

#[no_mangle]
pub extern "C" fn vocal_out_ptr() -> *const f32 {
    engine().out_buf.as_ptr()
}

#[no_mangle]
pub extern "C" fn fft_real_ptr() -> *mut f64 {
    engine().fft_ws.re.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn fft_imag_ptr() -> *mut f64 {
    engine().fft_ws.im.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn fft_run(n: u32) {
    engine().fft_ws.fft(n as usize);
}
