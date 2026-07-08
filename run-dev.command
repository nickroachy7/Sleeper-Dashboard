#!/bin/bash
# Sleeper Dashboard – minimal launcher, no tee, no pipes
cd "$(dirname "$0")/dashboard/dist" || exit 1
echo "=== $(date) ==="
echo "cwd: $(pwd)"
echo "Starting python3 http.server on 127.0.0.1:8765..."
echo "Open http://127.0.0.1:8765/ in your browser."
echo
exec /opt/homebrew/bin/python3 -u -m http.server 8765 --bind 127.0.0.1
