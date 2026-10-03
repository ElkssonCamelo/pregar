'use strict';
// node tests/slowserver.js [porta] [atraso_ms]  — serve o app atrasando os .js (simula internet lenta) para testar a ordem de carregamento.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 8124, delay = +process.argv[3] || 600;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const send = () => { const body = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': body.length }); res.end(body); };
  path.extname(f) === '.js' && !/app\.js$|sw\.js$/.test(f) ? setTimeout(send, delay) : send(); // todo .js (menos app.js e sw.js) chega atrasado
}).listen(port, () => console.log(`servidor lento em http://localhost:${port} (atraso ${delay} ms nos scripts)`));
