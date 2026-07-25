# Changelog

## 1.0.0 - 2026-07-24

- Added the complete Knockback Arena monorepo foundation.
- Added offline Bot Mode with three difficulties and shared fighter controls.
- Added third-person free camera, Rapier physics, procedural characters, arena, hazards, effects, and code-generated audio.
- Added authoritative Socket.IO private rooms, Quick Play, rematches, validation, rate limiting, reconnect windows, and status endpoints.
- Added deterministic arena/hazard rules, fixed-tick round flow, automated tests, deployment manifests, and documentation.
- Excluded test-only modules from production TypeScript builds for hosts that omit development dependencies.
- Kept server compile-time HTTP declarations available during production-only Render installs.
- Re-send saved reconnect tokens after each transport reconnect and restore the live room snapshot.
- Exposed authoritative snapshot positions and ticks through the existing automated-test seam.
