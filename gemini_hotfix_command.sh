#!/bin/bash
# Command to delegate hotfix work to Gemini when quota resets

echo "🚨 CRITICAL: Execute this when Gemini quota resets"
echo "=================================================="
echo ""
echo "gemini -p \"URGENT HOTFIX REQUIRED: Analyze hotfix_delegation.md for critical Docker issues. Issue #9: Shared module access failing (CRITICAL) - 3 services down. Issue #10: Frontend serving wrong app (HIGH). Generate fixed Dockerfiles and test commands. Focus on shared module import paths and frontend build context. Provide working fixes, not just analysis.\""
echo ""
echo "Or use interactive mode:"
echo "gemini -i"
echo "Then paste the hotfix_delegation.md content"