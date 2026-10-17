# Number Drop

A playful number-doubling game with bouncing characters, chain merges, and mobile controls.

**[Play Number Drop](https://brendansudol.github.io/number-drop/)**

## How to play

- Move your pointer or slide your finger to aim, then click or release to drop. You can also use the Drop button.
- On a keyboard, use the left/right arrows and press Space while the board is focused. Press P to pause.
- Matching numbers combine into their double: **2 + 2 = 4**, then **4 + 4 = 8**. Each merge earns ten times the new number in points.
- **Unlimited play** makes room at the bottom when the board fills. **Challenge** ends when a settled number stays above the dotted line.
- Choose drops from 1–5, 1–10, or 1–20. Your game and personal best are saved in this browser, on this device.

## Run locally

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. No build or package installation is required.

## Verify the game

With Node.js installed:

```sh
node --check game.js
node tests/game.cjs
```

The tests exercise real physics: matching merges, chain reactions, simultaneous collisions, pause, persistence, range changes, and both overflow modes.

## Deployment

GitHub Pages publishes the root of the `main` branch. Push changes to `main` to update the game. `.nojekyll` tells Pages to serve the files directly.

## Built with

HTML, CSS, Canvas, and the bundled, MIT-licensed [Matter.js 0.20.0](https://brm.io/matter-js/). Google Fonts supplies Nunito and DM Sans, with local font fallbacks. Original number characters are drawn with Canvas.

Inspired by [this number-doubling game](https://x.com/teachthemx3/status/2105999241248129130). The reference video and its artwork are not bundled.
