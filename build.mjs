import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['main.js'], bundle: true, minify: true,
  format: 'iife', write: false, target: 'es2022',
});
const template = await readFile('index.html', 'utf8');
const css = await readFile('style.css', 'utf8');
const font = (await readFile('assets/mona-sans.woff2')).toString('base64');
const mark = (await readFile('assets/mark-github.svg', 'utf8')).replace('<svg ', '<svg aria-hidden="true" fill="currentColor" ');
const licenses = await readFile('assets/Mona-Sans-OFL.txt', 'utf8') + '\n\n' + await readFile('assets/Octicons-LICENSE.txt', 'utf8');
const html = template.replace('/* APP_STYLE */', () => css)
  .replace('MONA_SANS_FONT_DATA', () => font)
  .replace('<!-- GITHUB_MARK -->', () => mark)
  .replace('<!-- ASSET_LICENSES -->', () => `<script type="text/plain" id="third-party-licenses">${licenses}</script>`)
  .replace('/* APP_SCRIPT */', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script'));
await mkdir('dist', { recursive: true });
await writeFile('dist/mona-merge-maze.html', html);
console.log('Built dist/mona-merge-maze.html (self-contained, offline-ready)');
