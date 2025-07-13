#!/bin/bash
# PM Monitoring Script - Check Gemini Progress Every 5 Minutes

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="/Users/poomcryptoman/codingZone/buildSomething/audiobook/audiobook-app/gemini_monitor.log"

echo "[$TIMESTAMP] PM Check: Monitoring Gemini progress..." >> "$LOG_FILE"

# Capture current Gemini session output
GEMINI_OUTPUT=$(tmux capture-pane -t gemini-session -p 2>/dev/null || echo "Gemini session not found")

# Send PM check message to Claude session
tmux send-keys -t claude-gemini "PM STATUS CHECK: $(date '+%H:%M') - Gemini progress update needed. Last Gemini output: ${GEMINI_OUTPUT: -200}" C-m 2>/dev/null

# Log the check
echo "[$TIMESTAMP] Sent PM check to Claude. Gemini status: ${GEMINI_OUTPUT: -100}" >> "$LOG_FILE"

# Check if Gemini is responsive
if echo "$GEMINI_OUTPUT" | grep -q "Ready for commands\|Using 1 MCP server"; then
    echo "[$TIMESTAMP] Gemini appears responsive" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] WARNING: Gemini may be stuck or unresponsive" >> "$LOG_FILE"
    tmux send-keys -t claude-gemini "ALERT: Gemini appears stuck at $(date '+%H:%M'). Need intervention." C-m 2>/dev/null
fi