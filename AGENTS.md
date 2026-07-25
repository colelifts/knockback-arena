# Knockback Arena Agent Guide

Read the whole repository before making major architectural changes. Preserve existing working systems and keep changes small, reviewable, and documented.

## Non-negotiable gameplay contracts

- Keep the multiplayer server authoritative for movement, hits, hazards, ring-outs, scores, seeds, bouncers, and collapse timing.
- Never add damage, health, or stamina without explicit approval.
- Never add automatic camera lock-on or opponent-facing camera behavior.
- Keep exactly one regular punch. Its tuned reach is 2.5 tiles (10 metres).
- Preserve the meteor's exactly one-second authoritative stun. Meteors stop players but never damage, bounce, or launch them.
- Preserve the bouncer control lock and its safe far-edge landing behavior.
- Preserve camera-relative movement: A is visual left and D is visual right.
- Keep all simulation timing on fixed ticks or delta time; authoritative timers must not use `setTimeout`.

## Engineering standards

- Run targeted tests after each material change and all quality gates before deployment.
- Avoid giant files. Put shared contracts and deterministic logic in `packages/shared`.
- Keep rendering/UI separate from simulation and networking.
- Update README, TESTING, DEPLOYMENT, ATTRIBUTIONS, and CHANGELOG when behavior changes.
- Never commit secrets or generated environment files.
- Never deploy a broken build.
- Make small logical commits and never force-push.
