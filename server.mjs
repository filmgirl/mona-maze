import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  try {
    const html = await readFile(new URL('./dist/mona-merge-maze.html', import.meta.url));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    console.error('Unable to serve game artifact.', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Game build is unavailable. Run npm run build and reload.');
  }
}).listen(4177, '127.0.0.1', () => console.log('Mona is ready at http://127.0.0.1:4177'));
