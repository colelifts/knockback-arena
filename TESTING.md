# Testing and QA

## Automated gates

Run from the repository root:

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Unit tests cover seeded random generation, room codes, input schemas, ring calculations, active tiles, collapse order, safe bouncer landings, the exact meteor stun constant, punch cone/range, wall blocking, ring-outs, simultaneous draws, reconnection expiry, matchmaking, and room cleanup. Socket integration tests create/join/ready a room, submit authoritative input, receive snapshots, reject invalid input, and pair Quick Play clients. Playwright covers menu load, Bot Mode startup, movement, floor stability, punch, pause, persistent settings, offline online-menu behavior, and room-code validation.

`node scripts/production-smoke.mjs` runs the deployed two-browser private-room, authoritative-movement, console-error, and reconnect check and records `docs/production-smoke.json` plus a production screenshot.

## Dependency audit

`npm audit --omit=dev` reports zero production vulnerabilities. The full development-tree audit reports five high-severity entries in the ESLint-only `minimatch` → `brace-expansion` chain (GHSA-mh99-v99m-4gvg, denial of service through unbounded pattern expansion). These packages are not shipped to either runtime and do not process player input. npm's available remediation is a major ESLint 10 upgrade; it is intentionally deferred until the TypeScript ESLint peer range supports that upgrade, rather than forcing an incompatible linter install.

## Manual release checklist

### Gameplay and frame pacing

- [ ] Cap at 30 FPS and verify responsive movement, landing, wall collision, and no seam falls.
- [ ] Test at 60 FPS.
- [ ] Test at 120 or 144 FPS; speed and jump height must match lower rates.
- [ ] Verify the character always spawns above the map.
- [ ] Push into every test wall from all directions; no corner penetration.
- [ ] Jump onto low and medium obstacles and land without snagging.
- [ ] Verify coyote-time feel and no accidental double jump.
- [ ] Verify A is camera-relative left and D is camera-relative right.
- [ ] Rotate the camera 360°, zoom both ways, and test collision against the tower and walls.
- [ ] Verify the camera never turns toward the opponent without mouse input and no lock-on exists.
- [ ] Verify punch reach is about three tiles, forward-only, and blocked by walls.
- [ ] Verify there is no health, damage, stamina, heavy attack, block, grab, or special UI.

### Hazards and round flow

- [ ] Observe the full 45-second opening phase and two-second yellow/red collapse warning.
- [ ] Let every configured outer ring collapse; tiles, supported obstacles, and bouncers must fall or disable together.
- [ ] Verify the final safe region remains playable and pressure accelerates.
- [ ] Trigger each bouncer route; controls lock during flight and landing is on the final safe tile, never the void.
- [ ] Shrink the arena, then verify bouncer landings recalculate.
- [ ] Stand in a meteor impact. Movement stops, no launch occurs, and six stars remain for exactly 1,000 ms / 30 ticks.
- [ ] Confirm the bot flees nearby meteor markers and warning edges.
- [ ] Test a simultaneous ring-out; the round replays as a draw.
- [ ] Win three rounds, rematch, and repeat for ten consecutive rematches while watching memory usage.

### Browser matrix

- [ ] Chrome current on Windows/macOS.
- [ ] Edge current on Windows.
- [ ] Firefox current on Windows/macOS.
- [ ] Safari current on macOS where available.
- [ ] Confirm mobile/tablet menus work and recommend keyboard/mouse without claiming touch play.
- [ ] Deny pointer lock once and confirm the game remains recoverable.
- [ ] Disable audio and confirm play remains possible.
- [ ] Test Low, Medium, and High quality presets.
- [ ] Hide the tab and confirm rendering/simulation load reduces safely.

### Multiplayer and adverse network

- [ ] Test on two physical computers through the production HTTPS URL.
- [ ] Create/join a private room, Quick Play, ready, start, move, punch, ring-out, and rematch.
- [ ] Confirm both clients show the same meteor and collapse ticks.
- [ ] Apply 150 ms latency, jitter, and 2–5% packet loss; verify remote interpolation remains bounded.
- [ ] Disconnect one player for under 15 seconds; verify restoration.
- [ ] Disconnect longer than 15 seconds; verify a clear expiration message and cleanup.
- [ ] Stop the server and verify the waking/offline message, cancel control, and working Bot Mode.
- [ ] Verify an invalid origin is rejected and malformed/rate-limited messages receive safe errors.
