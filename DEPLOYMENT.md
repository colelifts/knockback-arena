# Deployment

Deploy the persistent multiplayer server before the static browser client so the final HTTPS server URL can be built into Vite.

## Render server

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repository, and approve `render.yaml`.
3. Set `ALLOWED_ORIGINS` to the exact Vercel origin. Add comma-separated preview origins only when explicitly required.
4. Deploy and verify `https://YOUR-SERVICE.onrender.com/health`, `/version`, and `/status`.
5. Expect cold starts on the free plan. The client reports a waking service and keeps Bot Mode available.

Render uses `npm install && npm run build --workspace @knockback/shared && npm run build --workspace @knockback/server` and `npm run start --workspace @knockback/server`.

## Vercel client

1. Import the same GitHub repository into Vercel.
2. Keep the repository root as the project root; `vercel.json` supplies the build/output configuration.
3. Configure:
   - `VITE_GAME_SERVER_URL=https://YOUR-SERVICE.onrender.com`
   - `VITE_APP_ENV=production`
   - `VITE_ENABLE_QUICK_PLAY=true`
   - `VITE_ENABLE_PRIVATE_ROOMS=true`
4. Deploy a preview and smoke-test Bot Mode.
5. Promote only after the preview succeeds, then copy the production origin back into Render's `ALLOWED_ORIGINS` and redeploy the server if it changed.

CLI equivalents, after interactive login:

```bash
npx vercel link
npx vercel env add VITE_GAME_SERVER_URL production
npx vercel
npx vercel --prod
```

## Production verification

- Open the production URL and check the browser console.
- Start Bot Mode, move, jump, punch, pause, and confirm settings persist.
- Confirm `/health` succeeds and an unapproved web origin cannot establish a session.
- In two independent browser contexts, create/join a room, ready both players, move and punch, observe a shared meteor and collapse state, score a ring-out, rematch, disconnect one player briefly, and reconnect within 15 seconds.
- Confirm no development URL or secret appears in the production bundle or server logs.

Free-tier hosting is appropriate for hobby testing, not guaranteed uptime.
