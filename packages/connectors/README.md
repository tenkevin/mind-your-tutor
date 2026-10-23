# Curriculum import connector

CSV imports accept quoted and multiline values, doubled quotes, UTF-8 or UTF-16 byte order marks, and CRLF or LF line endings. To bound parser memory, each CSV header is limited to 1,024 decoded characters and each data cell to 256,000 decoded characters. A longer header or cell refuses that file and identifies the source and limit.

Zip imports first check the sum of declared uncompressed sizes against the remaining 100 MB import budget. CSV archives also match every recognized entry to its canonical pack tab before reading entry data; duplicate tabs are reported without inflating or parsing their contents. Declared sizes are checked again against actual inflated output as entries are read.

The hostile archive regressions must run in a resource-bounded container after `pnpm build`; they are intentionally separate from Vitest so an importer regression cannot kill the test runner:

```sh
docker run --network none --read-only --memory 768m --memory-swap 768m --cpus 1 --pids-limit 64 --ulimit core=0 --rm -v "$PWD":/repo:ro -w /repo/packages/connectors node:22.22.0-bookworm timeout 45s node scripts/c1cx1-bounded.mjs
```
