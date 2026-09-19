# Zane Pointless

Public OBS scoreboard/controller project.

## Hosted pages

- `controller.html` — operator controls
- `overlay.html` — 1920×1080 OBS Browser Source

The hosted controller/overlay pair uses Firebase Realtime Database for remote sync.

## Required asset folder

Upload the `assets` folder from the v0.6 package so the repository contains:

```
assets/
  backdrop.png
  points_bar.png
  sounds/
    camera-flash.mp3
    incorrect-answer.mp3
    winning-bell.mp3
    countdown-tick-1.wav
    countdown-tick-2.wav
    countdown-tick-3.wav
    countdown-tick-4.wav
    countdown-tick-5.wav
    countdown-tick-6.wav
    countdown-tick-7.wav
```

## GitHub Pages

In repository Settings → Pages:

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

Expected site:
`https://heyopc.github.io/zane-pointless/`

## Firebase

Paste the Firebase Web App config into `firebase-config.js`, enable Realtime Database, and publish the rules from `database.rules.json`.
