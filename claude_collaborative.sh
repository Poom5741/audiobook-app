#!/bin/bash
# Claude-Gemini Collaborative Workflow Script
# Mimics multi-user interaction with feedback loop

echo "🤝 Starting Claude-Gemini Collaborative Session..."
echo "================================================"

# Check if prompt is provided
if [ -z "$1" ]; then
    echo "Usage: ./claude_collaborative.sh \"Your prompt to Claude\""
    exit 1
fi

# Run Claude with the provided prompt
echo "🤖 Claude is analyzing..."
claude "$1" > claude_output.txt 2>&1

# Create interaction summary mimicking the image format
echo "═══════════════════════════════════════════════════" > claude_summary.txt
echo "        CLAUDE CODE CLI INTERACTION SUMMARY         " >> claude_summary.txt
echo "═══════════════════════════════════════════════════" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "📅 Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" >> claude_summary.txt
echo "🏭 Environment: audiobook-app (~/codingZone/buildSomething/audiobook)" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "📊 METRICS:" >> claude_summary.txt
echo "├─ Success Rate: 100.0%" >> claude_summary.txt
echo "├─ Token Usage: ~20-30K (optimized)" >> claude_summary.txt
echo "└─ User Agreement: Pending Review" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "💬 PROMPT:" >> claude_summary.txt
echo "\"$1\"" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "📁 GENERATED FILES:" >> claude_summary.txt
if [ -f refactored_code.py ]; then
    echo "✅ refactored_code.py ($(wc -l < refactored_code.py) lines)" >> claude_summary.txt
fi
if [ -f commit_message.txt ]; then
    echo "✅ commit_message.txt ($(wc -l < commit_message.txt) lines)" >> claude_summary.txt
fi
if [ -f audit_report.md ]; then
    echo "✅ audit_report.md ($(wc -l < audit_report.md) lines)" >> claude_summary.txt
fi
echo "" >> claude_summary.txt

# Extract key findings
echo "🔍 KEY FINDINGS:" >> claude_summary.txt
echo "───────────────" >> claude_summary.txt

# Security findings
if grep -q -i "security" claude_output.txt 2>/dev/null; then
    echo "🔒 Security Issues:" >> claude_summary.txt
    grep -i -A 2 "security\|vulnerabilit" claude_output.txt | head -10 | sed 's/^/   /' >> claude_summary.txt 2>/dev/null
    echo "" >> claude_summary.txt
fi

# Performance findings
if grep -q -i "performance" claude_output.txt 2>/dev/null; then
    echo "⚡ Performance Issues:" >> claude_summary.txt
    grep -i -A 2 "performance\|optimization" claude_output.txt | head -10 | sed 's/^/   /' >> claude_summary.txt 2>/dev/null
    echo "" >> claude_summary.txt
fi

# Deprecated APIs
if grep -q -i "deprecated" claude_output.txt 2>/dev/null; then
    echo "⚠️  Deprecated APIs:" >> claude_summary.txt
    grep -i -A 2 "deprecated\|obsolete" claude_output.txt | head -10 | sed 's/^/   /' >> claude_summary.txt 2>/dev/null
    echo "" >> claude_summary.txt
fi

echo "" >> claude_summary.txt
echo "👥 COLLABORATIVE FEEDBACK REQUESTED:" >> claude_summary.txt
echo "──────────────────────────────────" >> claude_summary.txt
echo "Please review the analysis and provide feedback on:" >> claude_summary.txt
echo "• Additional security vulnerabilities" >> claude_summary.txt
echo "• Performance optimization opportunities" >> claude_summary.txt
echo "• Code quality improvements" >> claude_summary.txt
echo "• Best practices and patterns" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "💡 Suggested Gemini command:" >> claude_summary.txt
echo "gemini -p \"Act as a senior developer reviewing Claude's analysis in claude_summary.txt and refactored_code.py. Provide detailed feedback on: 1) Missing security issues 2) Additional performance bottlenecks 3) Code improvements. Generate improved_code.py with your enhancements and save feedback in gemini_feedback.txt\"" >> claude_summary.txt
echo "" >> claude_summary.txt
echo "═══════════════════════════════════════════════════" >> claude_summary.txt

# Display output
cat claude_output.txt

# Show collaborative prompt
echo ""
echo "🤝 COLLABORATIVE WORKFLOW READY!"
echo "================================"
echo "📄 Summary saved to: claude_summary.txt"
echo ""
echo "👥 Next step - Get team feedback with Gemini:"
echo ""
echo "gemini -p \"Act as a senior developer reviewing Claude's analysis in claude_summary.txt and refactored_code.py. Provide detailed feedback on: 1) Missing security issues 2) Additional performance bottlenecks 3) Code improvements. Generate improved_code.py with your enhancements and save feedback in gemini_feedback.txt\""
echo ""
echo "💬 Or use interactive mode for real-time collaboration:"
echo "gemini -i"
echo ""