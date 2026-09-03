# Mona's Merge Maze

A 3D maze-chase game starring Mona the Octocat. Collect commits, resolve bugs,
and walk through deployment portals to reach the next repository.

## Play

Open **[`dist/mona-merge-maze.html`](dist/mona-merge-maze.html)** directly in a
modern browser. The game, original chiptune soundtrack, and Mona Sans font are
embedded in this single file. No network connection is required.

Or run the local server with Node.js 22 or newer:

```sh
npm start
```

Then visit <http://127.0.0.1:4177>.

## Controls

| Action | Control |
| --- | --- |
| Arcade movement | WASD or arrow keys; turns queue at junctions |
| First-person movement | Hold W/S or up/down |
| First-person turn | A/D or left/right turns 90 degrees |
| Switch camera | V |
| Pause/resume | P or Escape |
| Start | Enter or the Play button |
| Theme, music, effects | Separate buttons in the header |

Touch controls and the minimap sit outside the game viewport.

## Rules

- Green gems are commits worth 10 points.
- Pull-request power-ups grant eight seconds of Super Merge.
- Only **blue bugs marked `+ CATCH`** can be captured. Other bugs are dangerous.
- Captured bugs are visibly held in the central pen for five seconds. After
  release, a one-second grace period prevents an immediate collision.
- Collect every commit to unlock the north deployment portal. Follow the green
  trail and walk through the portal to advance, preserving score and lives.
- Two repository layouts repeat through successive levels.
- Best scores and the light/dark preference are saved locally when browser
  storage is available.

## Develop

```sh
npm ci
npm test
npm run build
npm start
```

The server reads the built file on every request. Rebuild and refresh after
editing source. Commit the updated `dist/mona-merge-maze.html` when shipping a
change so the standalone download stays current.

## Source layout

| File | Purpose |
| --- | --- |
| `engine.js` | Maze generation, movement, enemy AI, captures, and progression |
| `main.js` | Three.js rendering, input, HUD, theme, and effects |
| `timing.js` | Frame-rate-independent simulation substeps |
| `music.js` | Original synthesized Web Audio soundtrack |
| `index.html`, `style.css` | Responsive interface and theme tokens |
| `build.mjs` | Single-file bundling and asset/license embedding |
| `server.mjs` | Loopback-only local preview server |
| `*.test.js` | Node.js tests for gameplay, timing, and audio lifecycle |

## Credits

An unofficial arcade project, not a GitHub product.

- Mona Sans: [github/mona-sans](https://github.com/github/mona-sans),
  distributed under the [SIL Open Font License](assets/Mona-Sans-OFL.txt).
- GitHub mark: [Primer Octicons](https://github.com/primer/octicons),
  distributed under its [MIT license](assets/Octicons-LICENSE.txt).
- Three.js: MIT-licensed 3D library.
- The procedural game art and synthesized soundtrack were created for this
  project. No external audio tracks are downloaded.

The font and icon license texts are also embedded in the standalone HTML.
