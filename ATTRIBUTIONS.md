# Attributions

## Audio

- Kenney Impact Sounds and Interface Sounds — CC0 1.0 Universal.
- “Upbeat Title Theme Loop” by beardalaxy (OpenGameArt) — CC0.
- “Plains Stage” by MintoDog (OpenGameArt) — CC0.

See `docs/audio-selection.md` for source URLs, selection rationale, and original-to-game filename mappings.

## Visual assets

- Kenney Nature Kit — CC0 1.0 Universal. Selected low-poly tree, flower, and cliff models are used for decorative floating islands. See `docs/asset-selection.md`.

Knockback Arena uses no downloaded character, environment, image, texture, music, or sound-effect assets. Fighter geometry, arena art, particles, stars, sky, and sound cues are created procedurally at runtime by project code.

Open-source runtime dependencies:

- [Three.js](https://threejs.org/) — MIT License — 3D renderer.
- [Rapier](https://rapier.rs/) — Apache-2.0 License — client collision and physics.
- [Socket.IO](https://socket.io/) — MIT License — multiplayer transport and rooms.
- [Zod](https://zod.dev/) — MIT License — protocol and environment validation.
- [Express](https://expressjs.com/) — MIT License — health/status HTTP service.

Complete dependency license texts are available from their published npm packages. Redistribution notes are mirrored under `apps/client/public/assets/licenses/README.md`.
