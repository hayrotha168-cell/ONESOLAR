# ONE SOLAR

An installable Progressive Web App (Next.js + three.js) for solar installers:

- **Cable size calculator**: DC (PV string / battery), AC single-phase and AC three-phase. Checks both voltage drop and current-carrying capacity (IEC 60364-5-52 / EN 50618 reference values), with derating for temperature and grouping, copper or aluminium. Shows the recommended size, voltage drop, cable loss and a full comparison table.
- **3D sun & shade survey**
  - NOAA sun position: sunrise, sunset, solar noon, day length and max sun height for any location and date.
  - Interactive 3D sun-path dome showing the selected date plus Jun 21 and Dec 21, hour markers, a tilted panel array with real-time shadows, and a time slider with playback.
  - Phone survey: use the compass, motion sensors and back camera to record obstacle heights (trees, buildings) around the horizon. They appear in 3D and feed the shade-loss estimate.
  - Roof tilt meter (lay the phone on the roof) that can set the panel tilt and azimuth.
  - Clear-sky energy estimates for the day and the year, annual shade loss %, and JSON export of the survey.
- Works offline once loaded (service worker), with data saved on the device.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production (service worker enabled)
npm test           # hand-checked cable sizing cases against IEC 60364-5-52 / EN 50618
```

## Standards used by the cable calculator

| What | Source |
| --- | --- |
| Current capacity, copper PVC (methods B2, E, D1) | IEC 60364-5-52 Annex B, Tables B.52.2, B.52.4, B.52.10 |
| PV cable capacity (single cable, free air, 60 °C) | EN 50618 / IEC 62930, Table A.3 |
| Temperature correction | IEC 60364-5-52 Tables B.52.14 (air), B.52.15 (ground); EN 50618 Table A.4 |
| Grouping correction | IEC 60364-5-52 Tables B.52.17 (bunched), B.52.19 (ducts in ground) |
| Voltage drop (ρ1 = 1.25·ρ20, λ = 0.08 mΩ/m) | IEC 60364-5-52 Annex G |
| Minimum aluminium size (16 mm²) | IEC 60364-5-52 Table 52.2 |
| PV string current factor (Isc × 1.25) | IEC 62548 |
| Protective device coordination (Ib ≤ In ≤ Iz) | IEC 60364-4-43 |

Motion sensors, camera and geolocation need **HTTPS** (or `localhost`). To test on a phone, deploy to an HTTPS host such as Vercel, or tunnel your dev server.

## Structure

```
src/app/            layout, page (tabs), manifest, global styles
src/components/     CableCalculator, SunSurvey, SunScene3D (three.js), SensorSurvey
src/lib/cable.ts    cable sizing maths and tables
src/lib/solar.ts    sun position, clear-sky irradiance, horizon shading
public/sw.js        offline service worker
```

> Results are engineering estimates. Verify against local wiring rules and manufacturer data before installation.

## Telegram sign-in

Users register and sign in with Telegram. The Worker in `worker/index.ts` checks Telegram's signature,
sets a 60-day session cookie, and records each user in the `USERS` KV namespace (`user:<telegram id>`).
Until a bot token is set, sign-in is switched off and the app is open to everyone.

1. In Telegram, open **@BotFather** → `/newbot` and follow the steps.
2. Still in @BotFather: `/setdomain` → choose the bot → `onesolar.1dev.biz`.
3. Store the bot token as a Worker secret (it is never written to the repo):
   `npx wrangler secret put TELEGRAM_BOT_TOKEN`
4. Sign-in is on immediately (no redeploy needed).

List registered users: `npx wrangler kv key list --binding USERS --remote`

## Projects and PDF reports

**Save project** (under the 3D view) stores the inputs, cable sizing and a picture of the 3D view in
IndexedDB on the device. The **Projects** tab lists them; **Share PDF** builds an A4 survey report
(project info, 3D view, sun, PV design, energy, cable sizing, standards, signature block) and opens the
phone's share sheet, or downloads the file on desktop.

## Versions and updates

The app version comes from `version` in `package.json` and is shown under **Settings → App version**,
with the release date, git commit and a "What's new" list (`src/lib/version.ts`).

Each build publishes `/version.json`. Open apps check it on start, when brought back to the screen and
every 30 minutes. When a newer build is live they show **New version available → Update now**.

To publish a release:
1. Raise `version` in `package.json` (for example `1.2.0` → `1.3.0`).
2. Add the release notes at the top of `CHANGELOG` in `src/lib/version.ts`, in English and Khmer.
3. Commit, then `npm run deploy`.

To test a production build locally (no Telegram sign-in): `npx next build`, then `npx wrangler dev --local`.
