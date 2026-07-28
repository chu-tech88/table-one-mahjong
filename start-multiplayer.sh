#!/bin/bash

# Multiplayer Game Startup Script
# Runs server and client in separate terminals

set -e

echo "🎮 Mahjong Multiplayer Launcher"
echo "================================"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

echo "🚀 Starting server and client..."
echo ""
echo "Server will run on: ws://localhost:8080"
echo "Client will run on: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Start server in background
npm run dev:server &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start client in background
npm run dev &
CLIENT_PID=$!

# Cleanup on exit / Ctrl+C
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; echo 'Stopped'" EXIT INT TERM

# Wait for both processes
wait $SERVER_PID $CLIENT_PID
