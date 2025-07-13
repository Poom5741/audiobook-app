#!/bin/bash
# PM Quick Deploy Script - Instantly deploy both AI agents

set -e

echo "🎯 PM Dual AI Agent Deployment"
echo "================================"

# Kill existing sessions if they exist
echo "🧹 Cleaning existing sessions..."
tmux kill-session -t gemini-session 2>/dev/null || true
tmux kill-session -t trae-session 2>/dev/null || true

# Deploy Gemini
echo "🚀 Deploying Gemini AI..."
tmux new-session -d -s gemini-session
tmux send-keys -t gemini-session 'gemini -y' C-m

# Deploy Trae AI
echo "🤖 Deploying Trae AI with DeepSeek Coder..."
tmux new-session -d -s trae-session
tmux send-keys -t trae-session 'trae-cli interactive --provider ollama --model deepseek-coder:6.7b --config-file /Users/poomcryptoman/trae-agent/trae_config.json' C-m

# Wait for initialization
echo "⏳ Waiting for AI agents to initialize..."
sleep 8

# Set Trae AI working directory
echo "📁 Setting Trae AI working directory..."
tmux send-keys -t trae-session '/Users/poomcryptoman/codingZone/buildSomething/audiobook/audiobook-app' C-m

sleep 3

echo ""
echo "✅ DEPLOYMENT COMPLETE"
echo "======================"
echo ""
echo "📊 AI Agent Status:"
echo "  - Gemini AI: tmux attach -t gemini-session"
echo "  - Trae AI:   tmux attach -t trae-session"
echo ""
echo "🎯 Quick Commands:"
echo "  - Send task to Gemini: tmux send-keys -t gemini-session 'Task: [description]' C-m"
echo "  - Send task to Trae:   tmux send-keys -t trae-session '[description]' C-m"
echo "  - Monitor both:        ./pm_monitor.sh"
echo ""
echo "🔥 Both AI agents ready for task assignment!"