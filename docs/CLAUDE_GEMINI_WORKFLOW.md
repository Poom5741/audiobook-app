# Claude-Gemini Workflow for Audiobook App

## Overview
This workflow implements a token-efficient auditing system where Claude performs initial analysis (~20K-30K tokens) and creates summaries, then Gemini rechecks the output using its 1M token context window (free tier).

## Setup Status
- ✅ `claude_workflow.sh` script created and executable
- ⏳ Gemini CLI installation pending (run: `npm install -g @google/gemini-cli`)
- 📁 Project directory: `~/codingZone/buildSomething/audiobook/audiobook-app`

## Workflow Steps

### 1. Run Claude Analysis
```bash
cd ~/codingZone/buildSomething/audiobook/audiobook-app
./claude_workflow.sh "Audit ~/codingZone/buildSomething/audiobook/audiobook-app for security vulnerabilities and performance issues. Generate refactored code in refactored_code.py and detailed commit messages in commit_message.txt."
```

### 2. Review Generated Files
- `claude_output.txt` - Full Claude output
- `claude_summary.txt` - Automated summary with key findings
- `refactored_code.py` - Refactored code (if requested)
- `commit_message.txt` - Commit messages (if requested)
- `audit_report.md` - Audit report (if generated)

### 3. Run Gemini Recheck
```bash
gemini -p "Recheck claude_summary.txt and refactored_code.py in ~/codingZone/buildSomething/audiobook/audiobook-app for additional bugs, deprecated APIs, or performance issues. Suggest improvements and generate updated code in improved_code.py."
```

### 4. Optional: Claude Final Review
```bash
./claude_workflow.sh "Audit improved_code.py from Gemini CLI for security and performance, ensuring compatibility with audiobook app requirements. Update refactored_code.py and commit_message.txt."
```

### 5. Commit Changes
```bash
git add refactored_code.py improved_code.py commit_message.txt claude_summary.txt
git commit -F commit_message.txt
gh pr create --title "Audiobook App Audit and Refactor" --body "Processed with Claude-Gemini workflow"
```

## Token Savings
- Claude: ~20K-30K tokens per audit (vs ~300K for full analysis)
- Gemini: ~20K-50K tokens (free tier, 1,000 requests/day)
- **Total Savings: ~90% reduction in Claude token usage**

## Example Prompts

### Security Audit
```bash
./claude_workflow.sh "Perform security audit on tts-api/ focusing on input validation, authentication, and API security. Generate refactored_code.py with fixes."
```

### Performance Optimization
```bash
./claude_workflow.sh "Analyze backend/ and tts-api/ for performance bottlenecks. Focus on database queries, async operations, and caching. Generate optimized code."
```

### Code Quality
```bash
./claude_workflow.sh "Review code quality in frontend/ and backend/. Check for deprecated APIs, unused imports, and code duplication. Generate refactored versions."
```

## Troubleshooting
- **Gemini rate limits**: Wait 60s between requests or use paid tier
- **File not found**: Ensure you're in the correct directory
- **Permission denied**: Run `chmod +x claude_workflow.sh`
- **Claude errors**: Check API key with `echo $ANTHROPIC_API_KEY`

## Next Steps
1. Install Gemini CLI: `npm install -g @google/gemini-cli`
2. Authenticate Gemini: `gemini login`
3. Test workflow with a small module first
4. Scale to full codebase analysis

## Notes
- The script automatically extracts security, performance, and deprecated API findings
- Summary includes line counts for generated files
- Gemini command is displayed after each Claude run for easy copy/paste
- All outputs are preserved for audit trail