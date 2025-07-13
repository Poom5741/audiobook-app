#!/bin/bash
# Dual AI Workflow - Claude + Gemini Side-by-Side

echo "🤖 Starting Claude-Gemini Dual AI Session"
echo "=========================================="
echo ""
echo "💡 WORKFLOW:"
echo "├─ Claude (Left): Manager & Auditor"
echo "└─ Gemini (Right): Heavy Worker & Implementer"
echo ""

# Create collaboration session file
cat > ai_collaboration_session.md << 'EOF'
# 🤖 AI COLLABORATION SESSION

## Current Status
- ✅ Dockerfiles FIXED (backend, crawler, parser)
- 🎯 Next: Test builds and deploy services
- 📊 System: Ready for recovery

## Claude's Role (Manager/Auditor)
- Monitor progress
- Validate fixes
- Make decisions
- Report status

## Gemini's Role (Heavy Worker)
- Test Docker builds
- Fix any remaining issues
- Generate deployment scripts
- Implement solutions

## Current Task for Gemini:
Test the fixed Dockerfiles and get services running!
EOF

echo "📋 Session file created: ai_collaboration_session.md"
echo ""
echo "🚀 Opening Gemini in interactive mode..."
echo "   (You'll see this in the right terminal)"
echo ""

# Open Gemini in interactive mode
osascript << 'EOF'
tell application "Terminal"
    activate
    set newTab to do script "cd ~/codingZone/buildSomething/audiobook/audiobook-app && echo '🤖 GEMINI WORKSPACE - Ready for collaboration' && echo '===========================================' && echo '' && echo 'Claude says: Test the fixed Dockerfiles!' && echo '' && gemini -i"
    set current settings of newTab to settings set "Pro"
end tell
EOF

echo "✅ Gemini terminal opened!"
echo ""
echo "🎬 VISUAL SETUP COMPLETE:"
echo "├─ Left Terminal: Claude (this one)"
echo "└─ Right Terminal: Gemini (just opened)"
echo ""
echo "🎯 Now tell Gemini:"
echo "   'Test these fixed Docker builds: docker-compose build backend crawler parser'"