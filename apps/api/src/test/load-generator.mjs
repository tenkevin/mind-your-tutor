// The load generator for M2-P1, in its own process so its CPU work (timers, HTTP
// clients, response parsing) never stalls the API's event loop. Reads a plan file,
// sends each request at its due time over keep-alive HTTP, and writes one latency per
// request (milliseconds, in plan order) and the run's wall time to the output file.
//
//   node load-generator.mjs <plan.json> <out.json>
//
// plan.json: { port, ratePerSecond, headers, requests: [{ headers, body }] }

import { readFileSync, writeFileSync } from 'node:fs';
import { Agent, request } from 'node:http';

const [planPath, outPath] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const agent = new Agent({ keepAlive: true, maxSockets: 128 });

function send(req) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(req.body);
    const started = performance.now();
    const r = request(
      {
        host: '127.0.0.1',
        port: plan.port,
        method: 'POST',
        path: '/events',
        agent,
        headers: { ...plan.headers, ...req.headers, 'content-length': body.length },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const ms = performance.now() - started;
          let accepted = 0;
          if (res.statusCode === 200) {
            accepted = JSON.parse(Buffer.concat(chunks).toString()).accepted.length;
          }
          resolve({ ms, status: res.statusCode, accepted });
        });
      },
    );
    r.on('error', reject);
    r.end(body);
  });
}

const results = new Array(plan.requests.length);
const started = performance.now();
await Promise.all(
  plan.requests.map(async (req, i) => {
    const wait = started + (i / plan.ratePerSecond) * 1000 - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    results[i] = await send(req);
  }),
);
const seconds = (performance.now() - started) / 1000;
agent.destroy();
writeFileSync(outPath, JSON.stringify({ seconds, results }));
