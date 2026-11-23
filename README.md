# Personal Home Assistant

A small self-hosted web app (Node.js, no framework) that controls the TV, a tablet, the router and the server of a home network from a phone. It is written for one household, published as a showcase of the architecture.

## Features
- **TV and tablet remote:** ADB key events, taps and swipes, app launcher, screenshots, brightness, power, volume (Chromecast).
- **Radio and media:** cast a stream to the TV or play it on a tablet or inside the web app.
- **Router client:** lists connected devices, renames them and blocks or unblocks internet access per device (GL.iNet JSON-RPC).
- **Routines:** time-based scenes such as "start the radio at 07:00" or "cut a device's internet at night".
- **Assistant:** a rule-based command parser with an optional local LLM fallback. Anything the model proposes needs a confirmation tap first.
- **Verification language:** every action reports `done`, `sent but unverified` or `failed` by reading the device state back.
- PIN login with signed cookies, brute-force lockout and tokenised media URLs.

## Run
```bash
npm install
cp config.example.json config.json   # adjust the IP addresses for your network
node server.js                       # first start generates the PIN and secrets
```
The router password is entered in the UI and stored in `secrets/`. Both files are git-ignored.

## Notes
- The UI text is Turkish. Translating it is a small, mechanical job.
- The Android wrapper app is not included in this release.

License: MIT
