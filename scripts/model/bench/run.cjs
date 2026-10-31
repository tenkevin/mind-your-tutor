const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const dir = __dirname;
const srv = http.createServer((q, r) => {
  const f = path.join(dir, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream';
  fs.readFile(f, (e, d) => e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { 'content-type': t }), r.end(d)));
}).listen(0, async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const cdp = await p.context().newCDPSession(p);
  await p.goto(`http://localhost:${srv.address().port}/`);
  await p.waitForFunction('window.ready');
  console.log('load ms', await p.evaluate('window.loadMs'));
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    console.log(`throttle ${rate}x: predict(500 chars) avg ms`, (await p.evaluate('window.run(15)')).toFixed(1));
  }
  await b.close(); srv.close();
});
