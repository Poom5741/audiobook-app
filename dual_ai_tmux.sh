#!/bin/bash
# Dual AI Workflow - Claude + Gemini in iTerm2 with tmux

echo "🤖 Starting Claude-Gemini Dual AI Session with tmux"
echo "=================================================="

# Create tmux session with split panes
tmux new-session -d -s claude-gemini -c ~/codingZone/buildSomething/audiobook/audiobook-app

# Split window vertically (side by side)
tmux split-window -h -t claude-gemini

# Set pane titles and content
tmux send-keys -t claude-gemini:0.0 'echo "🤖 CLAUDE MANAGER & AUDITOR"' Enter
tmux send-keys -t claude-gemini:0.0 'echo "=========================="' Enter
tmux send-keys -t claude-gemini:0.0 'echo "Status: Dockerfiles FIXED ✅"' Enter
tmux send-keys -t claude-gemini:0.0 'echo "Next: Monitor Gemini work"' Enter
tmux send-keys -t claude-gemini:0.0 'echo ""' Enter

tmux send-keys -t claude-gemini:0.1 'echo "🤖 GEMINI HEAVY WORKER"' Enter
tmux send-keys -t claude-gemini:0.1 'echo "===================="' Enter
tmux send-keys -t claude-gemini:0.1 'echo "Task: Test Docker builds"' Enter
tmux send-keys -t claude-gemini:0.1 'echo "Ready for commands..."' Enter
tmux send-keys -t claude-gemini:0.1 'echo ""' Enter

# Open iTerm2 and attach to tmux session
osascript << 'EOF'
tell application "iTerm2"
    activate
    create window with default profile
    tell current session of current window
        write text "tmux attach-session -t claude-gemini"
    end tell
end tell
EOF

echo "✅ iTerm2 opened with tmux session 'claude-gemini'"
echo ""
echo "🎬 VISUAL SETUP:"
echo "├─ Left Pane: Claude (Manager/Auditor)"
echo "└─ Right Pane: Gemini (Heavy Worker)"
echo ""
echo "🎯 In right pane, start Gemini with:"
echo "   gemini -i"
echo ""
echo "📋 Then tell Gemini:"
echo "   'I'm working with Claude. Test these fixed Docker builds: docker-compose build backend crawler parser'"