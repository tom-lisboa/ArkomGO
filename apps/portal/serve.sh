#!/bin/bash
# ARKOM dash — servidor local persistente (build standalone).
# Uso: ./serve.sh  (ou: bash serve.sh)
# Mata o ocupante da porta e sobe desacoplado do terminal (sobrevive a fechamento).
cd "$(dirname "$0")"
PORT="${PORT:-3001}"
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null
nohup env PORT=$PORT node .next/standalone/Projects/arkom-dash/server.js \
  > /tmp/arkom-dash-$PORT.log 2>&1 &
disown
sleep 2
echo "ARKOM dash → http://localhost:$PORT (log: /tmp/arkom-dash-$PORT.log)"
