import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { cabinetDirectory, pin, verifyCabinet } from './setup.mjs';

verifyCabinet();
const port = Number(process.env.CABINET_PORT ?? 4261);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CABINET_PORT');
const candidate = await readFile('dist/mona-merge-maze.html');
const catalog = JSON.parse(await readFile(`${cabinetDirectory}/games.json`, 'utf8'));
const mona = catalog.find(game => game.id === 'mona-maze');
if (!mona) throw new Error('Pinned cabinet has no mona-maze entry');
mona.url = '../mona-maze/';
// A second candidate instance exercises the real cabinet's switching lifecycle offline.
catalog.push({ ...mona, id: 'mona-lifecycle', title: 'Mona lifecycle fixture', url: '../mona-maze/?lifecycle' });
const root = resolve(cabinetDirectory);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let body;
    let type;
    if (pathname === '/mona-maze/' || pathname === '/mona-maze/index.html') {
      body = candidate;
      type = 'text/html';
    } else if (pathname === '/arcade/games.json') {
      body = JSON.stringify(catalog);
      type = 'application/json';
    } else if (pathname === '/__cabinet_health') {
      body = JSON.stringify({ revision: pin.revision });
      type = 'application/json';
    } else if (pathname.startsWith('/arcade/')) {
      const relative = pathname.slice('/arcade/'.length);
      if (relative.split('/').includes('..')) {
        response.writeHead(404).end('Not found');
        return;
      }
      const file = resolve(root, relative || 'index.html');
      const allowed = ['index.html', 'styles.css', 'games.json', 'favicon.ico'].includes(relative)
        || relative === '' || relative.startsWith('src/') || relative.startsWith('assets/');
      if (!allowed || !file.startsWith(root + sep) || !(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      body = await readFile(file);
      type = types[extname(file)] ?? 'application/octet-stream';
    } else {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  } catch (error) {
    if (error.code === 'ENOENT') response.writeHead(404).end('Not found');
    else {
      console.error(error);
      response.writeHead(500).end('Harness error');
    }
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Real cabinet: http://127.0.0.1:${port}/arcade/`));
