# Gemini Interactive Mode Instructions

## When Quota Resets (after 24h), Run:

### Option 1: Interactive Mode
```bash
cd ~/codingZone/buildSomething/audiobook/audiobook-app
gemini -i
```

Then paste:
```
Please analyze the audiobook app codebase in interactive mode. Start by reviewing refactored_code.py and the security issues found. Then systematically go through each service (tts-api/, backend/, auth/, frontend/) to find additional vulnerabilities, deprecated APIs, and performance bottlenecks. 

Focus on:
1. Security vulnerabilities not covered in refactored_code.py
2. Deprecated Node.js/Python APIs
3. Performance bottlenecks in database queries
4. Frontend React optimization opportunities
5. Docker security improvements

Provide specific code examples and fixes for each issue found.
```

### Option 2: Batch Analysis with Output
```bash
cd ~/codingZone/buildSomething/audiobook/audiobook-app

# Analyze each service separately to avoid token limits
gemini "Review tts-api/*.py for security vulnerabilities, deprecated APIs, and performance issues. Provide specific fixes." > gemini_tts_analysis.txt

gemini "Review backend/*.js for security vulnerabilities, deprecated APIs, and performance issues. Focus on database queries and API endpoints." > gemini_backend_analysis.txt

gemini "Review frontend/app/**/*.tsx for React performance issues, deprecated patterns, and security vulnerabilities." > gemini_frontend_analysis.txt

gemini "Review Docker configurations (Dockerfile*, docker-compose*.yml) for security issues and optimization opportunities." > gemini_docker_analysis.txt
```

### Option 3: Quick Security Scan
```bash
# One-liner for critical security issues
gemini "Find critical security vulnerabilities in audiobook app: SQL injection, XSS, CSRF, path traversal, exposed secrets in tts-api/, backend/, auth/" > gemini_security_critical.txt
```

## Current Status:
- ✅ Claude identified critical security issues in refactored_code.py
- ❌ Gemini quota exceeded (429 error) - wait 24h
- 📝 Use gemini_summary.txt from claude_workflow.sh for context

## Next Steps When Gemini Available:
1. Run interactive analysis
2. Compare findings with refactored_code.py
3. Generate improved_code.py with Gemini's suggestions
4. Run final Claude review if needed