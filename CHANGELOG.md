# Changelog

## 1.2.0 - Skill combat and smoother play

- Raised movement speed and acceleration for faster, more immediate control.
- Pulled the camera farther back and higher for a clearer top-down view of the arena.
- Made clean punch knockback travel exactly 2.5 tiles before control returns.
- Added committed punch recovery, momentum and flank bonuses, frontal bracing, and perfect-dodge counter bonuses.
- Raised authoritative snapshots to 30 Hz and reduced remote interpolation delay to 65 ms.
- Updated Bot Mode to use dodges and bracing while preserving one-punch, no-health combat.
- Added simultaneous-punch clashes, full-length punch telegraphs, hit flashes/reaction poses, brace shields, counter halos, and combat callouts.
- Reduced render cost by disabling shadows/antialiasing, lowering pixel density, removing decorative model loads and debris, and cutting idle arena draw calls.
- Replaced 285 fixed tile bodies with standalone colliders and stopped uploading unchanged tile transforms every frame.

## 1.1.0 - Snappy gameplay, audio, and sky-arena polish

- Moved local physics to a bounded 60 Hz accumulator while preserving the 30 Hz server and 20 Hz snapshots.
- Added a shared time-based movement controller, 4.8 m dodge, corrected camera pitch, one model-forward correction, and shortest-angle facing.
- Rebuilt the punch as a 10 m capsule/cone hybrid with tuned timing, knockback, control lock, wall blocking, and clearer combat effects.
- Added immediate online prediction/reconciliation, latched one-shot inputs, 100 ms remote interpolation, measured latency, and snapshot telemetry.
- Replaced oscillator placeholders with licensed CC0 music and effects, mixer buses, positional falloff, footsteps, and UI feedback.
- Shifted the arena to a bright floating-sky presentation, instanced all 285 tiles into one draw, and added low-poly CC0 sky-island decoration.
- Added live `?debug=1` diagnostics, expanded unit/integration/E2E coverage, and a repeatable endurance/private-match playtest harness.

## 1.0.0 - 2026-07-24

- Added the complete Knockback Arena monorepo foundation.
- Added offline Bot Mode with three difficulties and shared fighter controls.
- Added third-person free camera, Rapier physics, procedural characters, arena, hazards, and effects.
- Added authoritative Socket.IO private rooms, Quick Play, rematches, validation, rate limiting, reconnect windows, and status endpoints.
- Added deterministic arena/hazard rules, fixed-tick round flow, automated tests, deployment manifests, and documentation.
- Excluded test-only modules from production TypeScript builds for hosts that omit development dependencies.
- Kept server compile-time HTTP declarations available during production-only Render installs.
- Re-send saved reconnect tokens after each transport reconnect and restore the live room snapshot.
- Exposed authoritative snapshot positions and ticks through the existing automated-test seam.
- Added server-authoritative bouncer arcs, control lock, dynamic safe-edge landings, cooldowns, coyote time, and jump buffering.
