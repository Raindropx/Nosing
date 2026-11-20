;; Radix-2 forward FFT. f64 arithmetic and operation order match js/dsp.js.
;; Fixed scratch space: real[8192], imaginary[8192], stage cos[14], sin[14].
;; JS supplies the same Math.cos/sin constants once when instantiating.
(module
  (memory (export "memory") 3 3)
  (func (export "fft") (param $n i32)
    (local $i i32) (local $j i32) (local $bit i32)
    (local $m i32) (local $stage i32) (local $k i32) (local $h i32)
    (local $a i32) (local $b i32)
    (local $t f64) (local $wr f64) (local $wi f64)
    (local $wmr f64) (local $wmi f64) (local $nwr f64)
    (local $ur f64) (local $ui f64) (local $vr f64) (local $vi f64)
    (local.set $i (i32.const 1))
    (block $permutationDone
      (loop $permutation
        (br_if $permutationDone (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $bit (i32.shr_u (local.get $n) (i32.const 1)))
        (block $bitsDone
          (loop $bits
            (br_if $bitsDone (i32.eqz (i32.and (local.get $j) (local.get $bit))))
            (local.set $j (i32.xor (local.get $j) (local.get $bit)))
            (local.set $bit (i32.shr_u (local.get $bit) (i32.const 1)))
            (br $bits)))
        (local.set $j (i32.xor (local.get $j) (local.get $bit)))
        (if (i32.lt_u (local.get $i) (local.get $j))
          (then
            (local.set $t (f64.load (i32.shl (local.get $i) (i32.const 3))))
            (f64.store (i32.shl (local.get $i) (i32.const 3)) (f64.load (i32.shl (local.get $j) (i32.const 3))))
            (f64.store (i32.shl (local.get $j) (i32.const 3)) (local.get $t))
            (local.set $t (f64.load (i32.add (i32.const 65536) (i32.shl (local.get $i) (i32.const 3)))))
            (f64.store (i32.add (i32.const 65536) (i32.shl (local.get $i) (i32.const 3))) (f64.load (i32.add (i32.const 65536) (i32.shl (local.get $j) (i32.const 3)))))
            (f64.store (i32.add (i32.const 65536) (i32.shl (local.get $j) (i32.const 3))) (local.get $t))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $permutation)))
    (local.set $m (i32.const 2))
    (local.set $stage (i32.const 1))
    (block $stagesDone
      (loop $stages
        (br_if $stagesDone (i32.gt_u (local.get $m) (local.get $n)))
        (local.set $wmr (f64.load (i32.add (i32.const 131072) (i32.shl (local.get $stage) (i32.const 3)))))
        (local.set $wmi (f64.load (i32.add (i32.const 131200) (i32.shl (local.get $stage) (i32.const 3)))))
        (local.set $k (i32.const 0))
        (block $blocksDone
          (loop $blocks
            (br_if $blocksDone (i32.ge_u (local.get $k) (local.get $n)))
            (local.set $wr (f64.const 1))
            (local.set $wi (f64.const 0))
            (local.set $h (i32.const 0))
            (block $butterfliesDone
              (loop $butterflies
                (br_if $butterfliesDone (i32.ge_u (local.get $h) (i32.shr_u (local.get $m) (i32.const 1))))
                (local.set $a (i32.add (local.get $k) (local.get $h)))
                (local.set $b (i32.add (local.get $a) (i32.shr_u (local.get $m) (i32.const 1))))
                (local.set $ur (f64.load (i32.shl (local.get $a) (i32.const 3))))
                (local.set $ui (f64.load (i32.add (i32.const 65536) (i32.shl (local.get $a) (i32.const 3)))))
                (local.set $vr (f64.sub (f64.mul (f64.load (i32.shl (local.get $b) (i32.const 3))) (local.get $wr)) (f64.mul (f64.load (i32.add (i32.const 65536) (i32.shl (local.get $b) (i32.const 3)))) (local.get $wi))))
                (local.set $vi (f64.add (f64.mul (f64.load (i32.shl (local.get $b) (i32.const 3))) (local.get $wi)) (f64.mul (f64.load (i32.add (i32.const 65536) (i32.shl (local.get $b) (i32.const 3)))) (local.get $wr))))
                (f64.store (i32.shl (local.get $a) (i32.const 3)) (f64.add (local.get $ur) (local.get $vr)))
                (f64.store (i32.add (i32.const 65536) (i32.shl (local.get $a) (i32.const 3))) (f64.add (local.get $ui) (local.get $vi)))
                (f64.store (i32.shl (local.get $b) (i32.const 3)) (f64.sub (local.get $ur) (local.get $vr)))
                (f64.store (i32.add (i32.const 65536) (i32.shl (local.get $b) (i32.const 3))) (f64.sub (local.get $ui) (local.get $vi)))
                (local.set $nwr (f64.sub (f64.mul (local.get $wr) (local.get $wmr)) (f64.mul (local.get $wi) (local.get $wmi))))
                (local.set $wi (f64.add (f64.mul (local.get $wr) (local.get $wmi)) (f64.mul (local.get $wi) (local.get $wmr))))
                (local.set $wr (local.get $nwr))
                (local.set $h (i32.add (local.get $h) (i32.const 1)))
                (br $butterflies)))
            (local.set $k (i32.add (local.get $k) (local.get $m)))
            (br $blocks)))
        (local.set $m (i32.shl (local.get $m) (i32.const 1)))
        (local.set $stage (i32.add (local.get $stage) (i32.const 1)))
        (br $stages))))
)
