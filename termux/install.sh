#!/data/data/com.termux/files/usr/bin/bash
# One-time setup. Run from the project folder:  bash termux/install.sh
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR" || exit 1

echo "== Installing packages =="
pkg update -y
pkg install -y nodejs git curl ffmpeg
# These are only needed for streaming/downloading; one missing is not fatal.
for p in yt-dlp aria2 fzf ani-cli; do
  pkg install -y "$p" || echo "!! could not install $p from pkg"
done
if ! command -v ani-cli >/dev/null 2>&1; then
  echo "!! ani-cli is not installed. The app needs it to find streams."
  echo "   See https://github.com/pystardust/ani-cli for the Termux install steps."
fi

echo "== Installing project packages =="
npm install

chmod +x termux/*.sh backend/mpv-print

echo "== Start on boot (needs the Termux:Boot app) =="
mkdir -p "$HOME/.termux/boot"
cat >"$HOME/.termux/boot/ani-cli-streaming" <<BOOT
#!/data/data/com.termux/files/usr/bin/bash
bash "$APP_DIR/termux/start.sh"
BOOT
chmod +x "$HOME/.termux/boot/ani-cli-streaming"

echo "== Home-screen button (needs the Termux:Widget app) =="
mkdir -p "$HOME/.shortcuts"
cat >"$HOME/.shortcuts/anime-start" <<SHORT
#!/data/data/com.termux/files/usr/bin/bash
bash "$APP_DIR/termux/start.sh"
SHORT
chmod +x "$HOME/.shortcuts/anime-start"

echo "== Start whenever a Termux session opens =="
MARK="# ani-cli-streaming autostart"
if ! grep -q "$MARK" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n%s\nbash "%s/termux/start.sh" >/dev/null 2>&1\n' "$MARK" "$APP_DIR" >>"$HOME/.bashrc"
fi

echo
echo "Done. Start it now with:  bash termux/start.sh"
echo "Then open http://localhost:5173 in Chrome and choose Install app / Add to Home screen."
