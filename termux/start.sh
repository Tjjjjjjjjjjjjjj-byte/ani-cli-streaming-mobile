#!/data/data/com.termux/files/usr/bin/bash
# Starts the API (port 3001) and the Vite dev server (port 5173) in the
# background. Safe to run any number of times: anything already running is
# left alone.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/.ani-cli-streaming"
mkdir -p "$LOG_DIR"

# Keeps Termux (and the servers) alive when the screen is off.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

cd "$APP_DIR" || exit 1
export HOST=127.0.0.1
chmod +x backend/mpv-print 2>/dev/null

if [ ! -d node_modules ]; then
  echo "First run: installing packages..."
  npm install || exit 1
fi

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

start() {
  local name="$1" port="$2"
  shift 2
  if port_up "$port"; then
    echo "$name already running on :$port"
    return
  fi
  nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$LOG_DIR/$name.pid"
  echo "$name starting on :$port (log: $LOG_DIR/$name.log)"
}

start api 3001 npm run server
start web 5173 npm run dev -- --port 5173 --strictPort
