mod accomp_fx;
mod accomp_voices;
mod fft;
mod filters;
mod harmonics;
mod render;

use accomp_voices::AccompEngine;
use core::cell::UnsafeCell;
use render::{VocalEngine, FRAME_STRIDE};

struct EngineCell(UnsafeCell<Option<VocalEngine>>);
unsafe impl Sync for EngineCell {}

struct AccompCell(UnsafeCell<Option<AccompEngine>>);
unsafe impl Sync for AccompCell {}

static ENGINE: EngineCell = EngineCell(UnsafeCell::new(None));
static ACCOMP: AccompCell = AccompCell(UnsafeCell::new(None));

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

#[inline]
fn accomp() -> &'static mut AccompEngine {
    unsafe {
        let slot = &mut *ACCOMP.0.get();
        if slot.is_none() {
            *slot = Some(AccompEngine::new());
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
pub extern "C" fn vocal_cfg_len() -> u32 {
    render::CONFIG_LEN as u32
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

#[no_mangle]
pub extern "C" fn accomp_begin(buf_len: u32) {
    let _ = engine();
    accomp().begin(buf_len as usize);
}

#[no_mangle]
pub extern "C" fn accomp_params_ptr() -> *mut f64 {
    accomp().params.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn accomp_extra_alloc(n: u32) -> *mut f64 {
    accomp().ensure_extra(n as usize)
}

#[no_mangle]
pub extern "C" fn accomp_scratch_alloc(n: u32) -> *mut f32 {
    accomp().alloc_scratch(n as usize)
}

#[no_mangle]
pub extern "C" fn accomp_scratch_ptr() -> *mut f32 {
    accomp().scratch.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn accomp_render_note(voice_id: u32, auto_mix: u32) -> u32 {
    accomp().render_note(voice_id, auto_mix != 0) as u32
}

#[no_mangle]
pub extern "C" fn accomp_mix_scratch(local_start: u32, mix_len: u32) {
    accomp().mix_scratch(local_start as usize, mix_len as usize);
}

#[no_mangle]
pub extern "C" fn accomp_bus_active(bus_id: u32) -> u32 {
    let a = accomp();
    let active = match bus_id {
        0 | 1 => true,
        2 => a.acc_mono.len() >= a.buf_len,
        3 | 4 => a.has_hall,
        5 | 6 => a.has_plate,
        7 | 8 => a.has_delay,
        9 | 10 => a.has_chorus,
        _ => false,
    };
    if active { a.buf_len as u32 } else { 0 }
}

#[no_mangle]
pub extern "C" fn accomp_bus_ptr(bus_id: u32) -> *const f32 {
    let a = accomp();
    match bus_id {
        0 => a.acc_l.as_ptr(),
        1 => a.acc_r.as_ptr(),
        2 => a.acc_mono.as_ptr(),
        3 => a.hall_l.as_ptr(),
        4 => a.hall_r.as_ptr(),
        5 => a.plate_l.as_ptr(),
        6 => a.plate_r.as_ptr(),
        7 => a.delay_l.as_ptr(),
        8 => a.delay_r.as_ptr(),
        9 => a.chorus_l.as_ptr(),
        10 => a.chorus_r.as_ptr(),
        _ => core::ptr::null(),
    }
}

#[no_mangle]
pub extern "C" fn accomp_run_all_space_and_finalize(sr: f64, spb0: f64, has_space: u32, legacy: u32) {
    accomp().run_all_space_and_finalize(sr, spb0, has_space != 0, legacy != 0);
}

#[no_mangle]
pub extern "C" fn accomp_fx_alloc(total: u32) {
    let _ = engine();
    accomp().alloc_fx(total as usize);
}

#[no_mangle]
pub extern "C" fn accomp_fx_left_ptr() -> *mut f32 {
    accomp().fx_l.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn accomp_fx_right_ptr() -> *mut f32 {
    accomp().fx_r.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn accomp_fx_mono_ptr() -> *const f32 {
    accomp().fx_mono.as_ptr()
}

#[no_mangle]
pub extern "C" fn accomp_fx_space_run(effect_id: u32, total: u32, sr: f64, spb0: f64) {
    accomp().run_fx_space_inplace(effect_id, total as usize, sr, spb0);
}

#[no_mangle]
pub extern "C" fn accomp_fx_finalize_run(total: u32, sr: f64, has_space: u32, legacy: u32) {
    accomp().run_fx_finalize(total as usize, sr, has_space != 0, legacy != 0);
}
