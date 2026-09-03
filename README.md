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
For a separate preview, use `PORT=4178 npm start`. The server stays loopback-only
and rejects ports outside the integer range 1-65535.

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
- Each board also has three optional hardware pickups, on their own tiles:
  a computer chip (+250 points), an overclock battery (1.3x movement speed for
  six seconds), and a firewall shield (absorbs one bug hit, expires after eight
  seconds). Their labels and minimap symbols are `C`, `+`, and `F`.
- Overclock, firewall, and Super Merge can be active together. Only Super Merge
  allows captures; a capture does not spend the shield. Absorbing a hit spends
  the shield and protects Mona from overlapping bugs for one second to escape.
- Timers count playing time only, freeze on pause, and survive theme/view
  changes. Death (including game over), restart, and progression clear effects.
  Collected items stay spent after a death; restarting restores them.
- Only **blue bugs marked `+ CATCH`** can be captured. Other bugs are dangerous.
- Captured bugs are visibly held in the central pen for five seconds. After
  release, a one-second grace period prevents an immediate collision.
- Collect every commit to unlock the north deployment portal. Follow the green
  trail and walk through the portal to advance, preserving score and lives.
- Two repository **themes** alternate, without an upper level limit. Levels 1
  and 2 retain their introductory layouts. Starting at level 3, deterministic
  procedural mazes use the run seed and level number for new boards. Open
  plazas, the connected pen-release ring, and the north portal remain.
- Every open tile is checked for reachability with the portal locked. Optional
  items never count toward the commit total or gate deployment.
- Restart replays the current level's board with a fresh score and three lives.
  Selecting a repository starts its introductory level. A page reload starts
  a new seeded run; later boards may differ without making enemies faster.
- For reproducible engine scenarios, use `new Game(index, onEvent, { seed })`.
  `reset(index, level)` rebuilds that exact seeded level. Disconnected generated
  components are joined through interior walls (never the pen or boundary),
  then validated; invalid maps fail explicitly rather than reuse an old board.
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
