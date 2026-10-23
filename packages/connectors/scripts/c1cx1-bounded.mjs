import { crc32, deflateRawSync } from 'node:zlib';
import v8 from 'node:v8';
import { importPack } from '../dist/index.js';

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const raw = Buffer.from(data);
    const packed = deflateRawSync(raw);
    const entryName = Buffer.from(name);
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    const directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(entryName.length, 26);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(entryName.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(local, entryName, packed);
    central.push(directory, entryName);
    offset += local.length + entryName.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function run(name, bytes, verify) {
  const started = performance.now();
  const result = await importPack(new File([bytes], `${name}.zip`));
  const ms = performance.now() - started;
  const issueCounts = {};
  for (const issue of result.issues) issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
  const summary = {
    name,
    zippedBytes: bytes.length,
    ms,
    ok: result.ok,
    issueCounts,
    firstMessages: result.issues.slice(0, 3).map(({ code, message }) => ({ code, message })),
    maxRssKiB: process.resourceUsage().maxRSS,
  };
  console.log(JSON.stringify(summary));
  verify(result, ms);
}

const tabs = ['Course', 'Units', 'Ideas', 'Links', 'Categories', 'Assessment', 'Personas', 'Library'];
console.log(JSON.stringify({ node: process.version, heapLimitBytes: v8.getHeapStatistics().heap_size_limit }));

await run(
  'eight-10m-cells',
  zip(tabs.map((tab) => ({ name: `${tab}.csv`, data: `h\n${'a'.repeat(10 * 1024 * 1024)}` }))),
  (result, ms) => {
    if (result.ok || !result.issues.some((issue) => /cell longer than 256,000 characters/.test(issue.message))) {
      throw new Error('10 MiB CSV cells were not refused with the documented cell limit.');
    }
    if (ms >= 2_000) throw new Error(`The 10 MiB CSV cell case took ${ms} ms.`);
  },
);

await run(
  'eight-1m-cells',
  zip(tabs.map((tab) => ({ name: `${tab}.csv`, data: `h\n${'a'.repeat(1024 * 1024)}` }))),
  (result, ms) => {
    if (result.ok || !result.issues.some((issue) => /cell longer than 256,000 characters/.test(issue.message))) {
      throw new Error('1 MiB CSV cells were not refused with the documented cell limit.');
    }
    if (ms >= 2_000) throw new Error(`The 1 MiB CSV cell case took ${ms} ms.`);
  },
);

const duplicateArchive = zip(
  Array.from({ length: 100 }, (_, i) => ({
    name: `part${i}/Ideas.csv`,
    data: 'a'.repeat(1024 * 1024),
  })),
);
await run(
  '100-duplicate-1m-cells',
  duplicateArchive,
  (result, ms) => {
    if (result.ok || !result.issues.some((issue) => issue.code === 'tab_duplicate')) {
      throw new Error('Duplicate canonical tabs were not reported.');
    }
    if (result.issues.some((issue) => issue.code === 'file_refused')) {
      throw new Error('The duplicate archive was read instead of being rejected in preflight.');
    }
    if (ms >= 2_000) throw new Error(`The duplicate tab case took ${ms} ms.`);
  },
);
