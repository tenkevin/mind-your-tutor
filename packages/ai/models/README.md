# On-device NER model (A7, D33)

`ner-bert-tiny-v1.bin` (4.75 MB) is what the student app runs on the device to find people's
names and places. It is committed so CI needs no network at test time.

|               |                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source        | `gagan3012/bert-tiny-finetuned-ner` on Hugging Face (`pytorch_model.bin`, sha256 `0d10049bb6ee5ff10f0a73fd1ca30100a563dc0d5019fa4470123a319424c909`)                                                                                                                                                    |
| Base model    | `prajjwal1/bert-tiny` (MIT), 2 layers, 128 wide, uncased                                                                                                                                                                                                                                                |
| Fine-tuned on | CoNLL-2003 (tags PER, ORG, LOC, MISC). Reported by the model card: F1 0.82 on CoNLL-2003 dev                                                                                                                                                                                                            |
| Licence       | The model card gives none. The base model is MIT. CoNLL-2003 text comes from Reuters news and carries its own terms. **Needs a coordinator or user decision before release**                                                                                                                            |
| Conversion    | `python scripts/model/export_ner.py <dir> packages/ai/models/ner-bert-tiny-v1.bin`: weight matrices to int8 with one scale per row, vector parameters kept as float32, vocabulary included. Numpy only                                                                                                  |
| Runtime       | `packages/ai/src/ner-model.ts`: plain TypeScript forward pass, plus a 272-byte WebAssembly SIMD matrix kernel (`scripts/model/kernel.wat`, built into `src/ner-kernel.ts` by `scripts/model/build_kernel.mjs`, which needs `npm i --no-save wabt`). Falls back to JavaScript if there is no WebAssembly |

Only PER and LOC are acted on. ORG and MISC are ignored, so teams and other interests stay
specific (D27). Schools come from the pattern rules.

## Measuring A7-P1 in a real browser

```sh
cd packages/ai && npx tsc src/ner-model.ts --outDir /tmp/ner-bench --target es2022 \
  --module es2022 --moduleResolution bundler --strict --skipLibCheck
cp models/ner-bert-tiny-v1.bin ../../scripts/model/bench/{index.html,run.cjs} /tmp/ner-bench/
cd /tmp/ner-bench && node run.cjs   # Playwright Chromium, CPU throttle 1x and 4x
```
