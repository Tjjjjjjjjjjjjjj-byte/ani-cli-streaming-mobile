# Anime (mobile)

Phone-only version of ani-cli-streaming. The whole app runs inside Termux on your phone
and is installed as a PWA from Chrome. Nothing is deployed and nothing needs a PC.

## Setup (Termux, once)

    pkg install -y git
    git clone <this repo> ~/anime && cd ~/anime
    bash termux/install.sh
    bash termux/start.sh

Open http://localhost:5173 in Chrome, then menu > Install app / Add to Home screen.
`localhost` counts as a secure origin, so it installs as a PWA.
The app and API only listen on the phone itself (127.0.0.1).

## Starting automatically

- `termux/start.sh` starts the API (3001) and the web app (5173) in the background. Safe to run twice.
- Opening Termux runs it (install.sh adds it to ~/.bashrc).
- Termux:Boot app: starts it when the phone boots.
- Termux:Widget app: adds an `anime-start` home-screen button.

If the servers are down when you open the installed app, it shows a "Waiting for the server…"
page with an Open Termux button, and reloads itself once the app is up.

`npm run stop` (or `bash termux/stop.sh`) stops everything. Logs: `~/.ani-cli-streaming/`.

## Notes

- Downloads are stored in `backend/downloads` and `backend/library` inside the project folder.
  Run `termux-setup-storage` once if you want to reach files from other apps.
- Streaming and downloading need `ani-cli` (plus `ffmpeg` / `yt-dlp`). `install.sh` tries to
  install them; if `ani-cli` isn't in Termux's packages, see https://github.com/pystardust/ani-cli.
- Android may kill Termux in the background. `start.sh` takes a wake lock; also set Termux's
  battery setting to "Unrestricted".
