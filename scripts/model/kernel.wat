;; SIMD matrix-vector kernel for packages/ai/src/ner-model.ts (A7, D33).
;; out[t][o] = bias[o] + sum_i x[t][i] * w[o][i], all float32, cols a multiple of 4.
;; Build: node scripts/model/build_kernel.mjs  (writes packages/ai/src/ner-kernel.ts)
(module
  (memory (export "mem") 1)
  (func (export "linear")
    (param $x i32) (param $w i32) (param $b i32) (param $out i32)
    (param $n i32) (param $rows i32) (param $cols i32)
    (local $t i32) (local $o i32) (local $i i32)
    (local $xp i32) (local $wp i32) (local $acc v128)
    (local.set $t (i32.const 0))
    (block $done_t
      (loop $next_t
        (br_if $done_t (i32.ge_u (local.get $t) (local.get $n)))
        (local.set $o (i32.const 0))
        (block $done_o
          (loop $next_o
            (br_if $done_o (i32.ge_u (local.get $o) (local.get $rows)))
            (local.set $xp (i32.add (local.get $x)
              (i32.shl (i32.mul (local.get $t) (local.get $cols)) (i32.const 2))))
            (local.set $wp (i32.add (local.get $w)
              (i32.shl (i32.mul (local.get $o) (local.get $cols)) (i32.const 2))))
            (local.set $acc (v128.const f32x4 0 0 0 0))
            (local.set $i (i32.const 0))
            (block $done_i
              (loop $next_i
                (br_if $done_i (i32.ge_u (local.get $i) (local.get $cols)))
                (local.set $acc (f32x4.add (local.get $acc)
                  (f32x4.mul (v128.load (local.get $xp)) (v128.load (local.get $wp)))))
                (local.set $xp (i32.add (local.get $xp) (i32.const 16)))
                (local.set $wp (i32.add (local.get $wp) (i32.const 16)))
                (local.set $i (i32.add (local.get $i) (i32.const 4)))
                (br $next_i)))
            (f32.store
              (i32.add (local.get $out)
                (i32.shl (i32.add (i32.mul (local.get $t) (local.get $rows)) (local.get $o)) (i32.const 2)))
              (f32.add
                (f32.add
                  (f32.add (f32x4.extract_lane 0 (local.get $acc)) (f32x4.extract_lane 1 (local.get $acc)))
                  (f32.add (f32x4.extract_lane 2 (local.get $acc)) (f32x4.extract_lane 3 (local.get $acc))))
                (f32.load (i32.add (local.get $b) (i32.shl (local.get $o) (i32.const 2))))))
            (local.set $o (i32.add (local.get $o) (i32.const 1)))
            (br $next_o)))
        (local.set $t (i32.add (local.get $t) (i32.const 1)))
        (br $next_t)))))
