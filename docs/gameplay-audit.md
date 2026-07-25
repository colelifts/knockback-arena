# Gameplay audit

Audit date: 2026-07-25. The baseline was captured from the untouched `main` implementation on the `fix/snappy-gameplay-audio-assets` branch before gameplay edits.

## Baseline findings

| Area                          | Before                                                                                                                                                                  | Target / verification                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Client simulation             | 30 Hz Rapier step, 200 ms accumulator cap, unlimited catch-up steps                                                                                                     | 60 Hz, 100 ms cap, at most 5 substeps                                                                            |
| Server simulation / snapshots | 30 Hz / 20 Hz                                                                                                                                                           | Preserve 30 Hz / 20 Hz authority                                                                                 |
| Ground movement               | Local uses a fixed 0.18 velocity blend per 30 Hz step; server uses a different acceleration formula that usually snaps to full speed                                    | One shared time-based controller; 7.25 m/s run target, 7.75 m/s cap, distinct acceleration/deceleration/reversal |
| One-second forward travel     | 2.855 m measured after countdown in Chromium                                                                                                                            | Responsive launch and frame-rate-independent travel                                                              |
| Character facing              | The face is modeled toward local -Z while movement yaw treats +Z as forward. Baseline screenshot shows the character looking into the camera while moving away from it. | One model-forward correction and shortest-angle, time-based visual rotation                                      |
| Camera pitch                  | Clamp is approximately -14° to +64° and the non-inverted vertical sign is opposite the requested convention                                                             | Mouse up looks up, mouse down looks down, invert reverses it; -65° to +55° clamp                                 |
| Punch                         | 12 m point/cone check, 36° half-angle, 3.5 m vertical tolerance, 15.5 horizontal and 5.2 vertical knockback                                                             | 10 m capsule/cone hybrid, 29° half-angle, 2.5 m vertical tolerance, 11.5 horizontal and 3.4 vertical knockback   |
| Online input                  | 30 Hz send samples one-shot actions directly; local avatar waits for snapshots and lerps toward the latest authoritative state                                          | Latched one-shots, immediate local prediction/replay, thresholded reconciliation, 100 ms remote interpolation    |
| Audio                         | Runtime oscillators only; no decoded audio assets, buses, ambience, positional falloff, or license records                                                              | Repo-local licensed OGG/MP3 assets, music/SFX/ambience buses, spatial gameplay audio                             |
| Rendering                     | 285 individually rendered tile meshes/materials plus per-frame temporary vectors; dark scene and heavy vignette                                                         | Brighter whimsical sky presentation, shared/batched resources, allocation-free hot paths                         |
| Telemetry                     | Ping hard-coded to 1 ms; no loss, prediction, render, physics, or action diagnostics                                                                                    | `?debug=1` overlay with requested live metrics                                                                   |
| Bot                           | Basic steering and distance check; no stuck recovery                                                                                                                    | Updated ranges/timing, hazard/edge response, recovery behavior                                                   |

## Measured baseline

- Production build output: 2,963.34 kB JavaScript and 9.83 kB CSS uncompressed; approximately 1,026.10 kB gzip JavaScript and 3.27 kB gzip CSS. Source maps are emitted separately.
- Typical two-player snapshot envelope: 632 bytes (JSON, no active meteor).
- Headless Chromium at 1280×720: 30.6 presented frames/s, 50 ms worst sampled frame, 20.4 MiB CDP JS heap (25.9 MB via the browser memory API), 413 DOM nodes. Headless software/WebGL scheduling makes this a regression reference, not a desktop GPU ceiling.
- Baseline automated smoke: bot match passed; the settings/private-room flow timed out because the online screen re-rendered and detached the `CONTINUE ONLINE` button during its health check.
- Audio asset payload: 0 bytes. All effects are synthesized oscillators.
- The pre-instrumentation renderer did not expose draw calls, triangle counts, shadow casters, physics duration, or live body counts. The debug instrumentation added in this branch will capture those values for the after comparison without guessing.

## Root causes prioritized

1. Local and server movement use different formulas, and the local fixed blend has no separate release/reversal behavior.
2. Online play has no local prediction; each local transform is delayed by network snapshots.
3. Model-forward and simulation-forward conventions disagree by 180 degrees.
4. Camera pitch has the wrong user-facing vertical convention and an overly narrow upward range.
5. Combat checks and feedback are broad but visually quiet, making valid hits difficult to read.
6. Hundreds of separate tile materials/draws and repeated vector allocation add avoidable render/GC cost.

The after measurements and final playtest results are appended once the implementation is complete.

## After measurements

| Metric                      | After                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First-second forward travel | 5.544 m (up from 2.855 m)                                                                                                                                                                                                            |
| Local simulation            | 60 Hz, 100 ms accumulator cap, maximum 5 substeps                                                                                                                                                                                    |
| Physics work                | 0.30 ms sampled in the active bot match                                                                                                                                                                                              |
| Render complexity           | 119–124 calls and 19.3k–19.9k triangles from the normal gameplay camera; all 285 floor tiles render in one instanced draw                                                                                                            |
| Physics bodies              | 296 during a bot match; arena bodies are removed on mode reset so the count does not accumulate                                                                                                                                      |
| Headless regression sample  | 26–30 presented frames/s and 33–50 ms worst frame under Chromium's software/headless WebGL scheduling. This environment also capped the untouched baseline near 30 FPS; desktop GPU validation remains the 60 FPS acceptance target. |
| Production build            | 3,058.84 kB JS / 1,056.09 kB gzip plus 10.14 kB CSS / 3.39 kB gzip                                                                                                                                                                   |
| Repo-local media payload    | 4,529,086 bytes, well below the 25 MB gate                                                                                                                                                                                           |
| Long-run browser heap       | 15 round samples ranged from 17.1 MB to 25.3 MB. The first-to-last increase was 6.7 MB while decoded audio/model caches warmed; samples repeatedly fell after GC and did not grow monotonically.                                     |

## Playtest record

- Five complete bot matches passed across Easy, Normal, and Hard. Each exercised movement, jump, dodge, and punch before three controlled ring-outs.
- Fifteen consecutive bot rounds completed in one browser process with no console errors or physics-body accumulation.
- Three complete two-browser private-room matches passed create, join, ready, gameplay, match-over, and rematch voting. Immediate predicted travel in the first measured 250 ms was 1.15 m. Later rematches exposed and led to a fix for input remaining disabled after match-over.
- A 4,000-tick authoritative simulation reached all five collapse rings and remained in the playing phase.
- The final automated suite covers movement rate independence, diagonal normalization, braking/reversal, cardinal facing, shortest-angle wrap, camera pitch direction/clamps, punch volume/timing/wall blocking/knockback/control lock, room lifecycle, and two-client predicted movement.
