# VOID: game client

Cinematic co-op space shooter in the browser. See `../Project VOID — Blueprint v3.md`.

## Run

```sh
npm install
npm run dev          # http://localhost:5173  (add ?gl=webgl2 to test the fallback)
npm run ci           # lint, typecheck, tests, build, bundle budget
```

## Deploy (Cloudflare Pages)

One-time: create a Cloudflare account, then `npx wrangler login` and `npm run build && npm run deploy`.
For CI deploys, add repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
