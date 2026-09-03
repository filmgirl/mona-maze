import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const portText = process.env.PORT ?? '4177';
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}
const port = Number(portText);

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
}).listen(port, '127.0.0.1', () => console.log(`Mona is ready at http://127.0.0.1:${port}`));
