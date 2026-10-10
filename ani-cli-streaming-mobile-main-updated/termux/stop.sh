#!/data/data/com.termux/files/usr/bin/bash
# Stops the servers started by start.sh.
LOG_DIR="$HOME/.ani-cli-streaming"
for name in api web; do
  pidfile="$LOG_DIR/$name.pid"
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  # npm spawns children, so stop the whole group when possible.
  pkill -P "$pid" 2>/dev/null
  kill "$pid" 2>/dev/null
  rm -f "$pidfile"
  echo "$name stopped"
done
command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock
