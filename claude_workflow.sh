#!/bin/bash
# Claude-Gemini Workflow Script for Audiobook App
# This script runs Claude with the provided prompt and creates a summary for Gemini

# Check if prompt is provided
if [ -z "$1" ]; then
    echo "Usage: ./claude_workflow.sh \"Your prompt to Claude\""
    exit 1
fi

# Run Claude with the provided prompt and capture output
echo "Running Claude Code CLI..."
claude "$1" > claude_output.txt 2>&1

# Create summary file with timestamp
echo "Claude Code CLI Output Summary ($(date))" > claude_summary.txt
echo "=====================================" >> claude_summary.txt
echo "" >> claude_summary.txt

# Add prompt to summary
echo "PROMPT:" >> claude_summary.txt
echo "$1" >> claude_summary.txt
echo "" >> claude_summary.txt

# List generated files
echo "GENERATED FILES:" >> claude_summary.txt
if [ -f refactored_code.py ]; then
    echo "- refactored_code.py ($(wc -l < refactored_code.py) lines)" >> claude_summary.txt
fi
if [ -f commit_message.txt ]; then
    echo "- commit_message.txt ($(wc -l < commit_message.txt) lines)" >> claude_summary.txt
fi
if [ -f audit_report.md ]; then
    echo "- audit_report.md ($(wc -l < audit_report.md) lines)" >> claude_summary.txt
fi
echo "" >> claude_summary.txt

# Extract key actions and findings
echo "SUMMARY OF ACTIONS:" >> claude_summary.txt
echo "-------------------" >> claude_summary.txt

# Extract audit results
if grep -q "Audit results" claude_output.txt 2>/dev/null; then
    grep -A 10 "Audit results" claude_output.txt >> claude_summary.txt 2>/dev/null
fi

# Extract security findings
if grep -q -i "security" claude_output.txt 2>/dev/null; then
    echo "" >> claude_summary.txt
    echo "Security Findings:" >> claude_summary.txt
    grep -i -A 3 "security\|vulnerabilit" claude_output.txt | head -20 >> claude_summary.txt 2>/dev/null
fi

# Extract performance findings
if grep -q -i "performance" claude_output.txt 2>/dev/null; then
    echo "" >> claude_summary.txt
    echo "Performance Findings:" >> claude_summary.txt
    grep -i -A 3 "performance\|optimization" claude_output.txt | head -20 >> claude_summary.txt 2>/dev/null
fi

# Extract deprecated API findings
if grep -q -i "deprecated" claude_output.txt 2>/dev/null; then
    echo "" >> claude_summary.txt
    echo "Deprecated APIs:" >> claude_summary.txt
    grep -i -A 3 "deprecated\|obsolete" claude_output.txt | head -20 >> claude_summary.txt 2>/dev/null
fi

echo "" >> claude_summary.txt
echo "Full output saved in: claude_output.txt" >> claude_summary.txt
echo "=====================================" >> claude_summary.txt

# Display the full output to console
cat claude_output.txt

# Show summary location
echo ""
echo "Summary saved to: claude_summary.txt"
echo "Ready for Gemini recheck with:"
echo "gemini -p \"Recheck claude_summary.txt and refactored_code.py in $(pwd) for additional bugs, deprecated APIs, or performance issues. Suggest improvements and generate updated code in improved_code.py.\""