// The firm's local pages: a dashboard over the client workspaces a firm lists, and a page for answering one received
// audit package. Both listen on 127.0.0.1 only, accept only their own Host, and accept changes only from their own page.
import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { firmSummary, packageState, respondInPackage } from './audit.ts';
import { inside } from './files.ts';

const UI = join(import.meta.dirname, 'ui');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const send = (res: ServerResponse, status: number, data: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
};

export function serveFirm(mode: 'firm' | 'package', target: string, port: number): void {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const page = mode === 'firm' ? 'firm.html' : 'package.html';
  const server = createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host ?? '')) return send(res, 421, { error: 'unexpected Host' });
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return send(res, 200, mode === 'firm' ? firmSummary(target) : packageState(target));
        if (mode === 'package' && url.pathname.startsWith('/files/')) return send(res, 200, readFileSync(inside(join(target, 'workspace'), decodeURIComponent(url.pathname.slice(7)))), 'application/octet-stream');
        const file = url.pathname === '/' ? page : url.pathname.slice(1);
        if (![page, 'app.css', 'firm.js'].includes(file)) return send(res, 404, { error: 'not found' });
        return send(res, 200, readFileSync(join(UI, file)), TYPES[extname(file)]);
      }
      if (req.method !== 'POST' || mode !== 'package') return send(res, 405, { error: 'method not allowed' });
      if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'changes must come from this page' });
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (url.pathname !== '/api/respond') return send(res, 404, { error: 'not found' });
      respondInPackage(target, String(b.id), String(b.version), { by: String(b.by ?? ''), text: b.text || undefined, status: b.status || undefined, select: b.select, exception: b.exception });
      return send(res, 200, { state: packageState(target) });
    } catch (e) {
      const msg = (e as Error).message;
      return send(res, /changed since/.test(msg) ? 409 : 400, { error: msg, conflict: /changed since/.test(msg) });
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Evidence Desk (${mode === 'firm' ? 'firm dashboard' : 'audit package'}) is open at http://127.0.0.1:${port}/ for ${target}\nPress Ctrl-C to stop.`));
}
