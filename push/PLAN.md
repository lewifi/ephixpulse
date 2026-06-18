# Push notifications — deployment plan

The **app client** is already built (header bell -> priming modal -> permission ->
registers an Expo push token with `/api/push-register`). What remains is server +
credentials. None of this works in Expo Go — you need an EAS build.

## 1. Supabase
Run `push/schema.sql` (creates `push_tokens` + RLS policies).

## 2. Register endpoint
`functions/api/push-register.js` is already in the Pages project. It uses the same
`SUPABASE_URL` / `SUPABASE_KEY` env vars you set for `/api/movers`. No extra config.

## 3. Sender (scheduled Worker)
`push/push-cron-worker.js` is a **separate Worker** (Pages Functions can't run cron):
```
npm i -g wrangler
wrangler kv namespace create PUSH_KV        # put the id in wrangler.toml
wrangler secret put SUPABASE_URL            # or use [vars]
wrangler secret put SUPABASE_KEY
wrangler deploy
```
Cron is set in the toml header comment (hourly). Test manually: visit the worker URL
with `?run=1`.

## 4. Build credentials (the gating step)
- **Android (FCM, free):** create a Firebase project, add an Android app
  (`net.ephix.pulse`), download `google-services.json`, and give EAS the FCM v1
  service-account key (`eas credentials`). Then `eas build --profile preview --platform android`.
- **iOS (needs paid Apple Developer, $99/yr):** EAS generates the APNs key once your
  Apple account is linked. Until then iOS simply won't receive push.

## 5. EAS projectId
`getExpoPushTokenAsync` needs your EAS project id. After `eas init` it lands in
`app.json` under `extra.eas.projectId` (the client already reads it from there).

## Flow recap
app bell -> permission -> Expo token -> `/api/push-register` -> `push_tokens`.
hourly worker -> diff latest Top-25 vs KV -> new entries -> Expo push API -> devices.
