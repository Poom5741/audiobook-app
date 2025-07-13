#!/bin/bash
# PM Monitoring Script - Check both AI agents status

echo "🎯 PM DUAL AI AGENT STATUS"
echo "=========================="
echo ""

# Check if sessions exist
GEMINI_EXISTS=$(tmux has-session -t gemini-session 2>/dev/null && echo "✅" || echo "❌")
TRAE_EXISTS=$(tmux has-session -t trae-session 2>/dev/null && echo "✅" || echo "❌")

echo "📊 Session Status:"
echo "  - Gemini AI: $GEMINI_EXISTS"
echo "  - Trae AI:   $TRAE_EXISTS"
echo ""

if [ "$GEMINI_EXISTS" = "✅" ]; then
    echo "🤖 GEMINI AI OUTPUT (Last 10 lines):"
    echo "======================================="
    tmux capture-pane -t gemini-session -p | tail -10
    echo ""
else
    echo "❌ Gemini session not found!"
    echo ""
fi

if [ "$TRAE_EXISTS" = "✅" ]; then
    echo "🔧 TRAE AI OUTPUT (Last 10 lines):"
    echo "===================================="
    tmux capture-pane -t trae-session -p | tail -10
    echo ""
else
    echo "❌ Trae session not found!"
    echo ""
fi

echo "🎯 Quick Actions:"
echo "  - View Gemini: tmux attach -t gemini-session"
echo "  - View Trae:   tmux attach -t trae-session"
echo "  - Redeploy:    ./pm_quick_deploy.sh"
echo ""

# Check if both are working
if [ "$GEMINI_EXISTS" = "✅" ] && [ "$TRAE_EXISTS" = "✅" ]; then
    echo "🚀 Both AI agents operational - Ready for task assignment!"
else
    echo "⚠️  One or more AI agents need redeployment"
fi