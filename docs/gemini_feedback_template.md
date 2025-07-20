# Gemini Collaborative Feedback Template

## 👥 Team Member Prompts (Simulating Multi-User Interaction)

### Prompt 1: Security Expert Review
```bash
gemini -p "Act as a security expert (like 'Nat Weerawan' in the team). Review claude_summary.txt and refactored_code.py for the audiobook app. Focus on: 1) SQL injection vulnerabilities 2) Authentication bypass risks 3) File upload security 4) API endpoint protection. Generate improved_code.py with security hardening and document findings in gemini_feedback.txt"
```

### Prompt 2: Performance Engineer Review  
```bash
gemini -p "Act as a performance engineer (like 'Anuchit Chalothorn' in the team). Analyze claude_summary.txt and refactored_code.py for performance issues. Focus on: 1) Database query optimization 2) Caching strategies 3) Async processing opportunities 4) Memory usage. Generate improved_code.py with optimizations and save analysis in gemini_feedback.txt"
```

### Prompt 3: Code Quality Reviewer
```bash
gemini -p "Act as a senior developer reviewing code quality. Examine claude_summary.txt and refactored_code.py. Check for: 1) Code duplication 2) SOLID principles violations 3) Error handling gaps 4) Testing requirements. Generate improved_code.py with clean code practices and document in gemini_feedback.txt"
```

### Prompt 4: DevOps Specialist Review
```bash
gemini -p "Act as a DevOps specialist. Review Docker configurations and deployment setup in claude_summary.txt. Focus on: 1) Container security 2) Resource limits 3) Health checks 4) Logging/monitoring. Generate improved deployment configs and document in gemini_feedback.txt"
```

## 🔄 Interactive Collaboration Mode

### Start Interactive Session:
```bash
gemini -i
```

### Then interact as different team members:

**You (Project Lead)**: "Review the security findings in claude_summary.txt. What critical issues might Claude have missed?"

**Gemini Response**: [Provides analysis]

**You (as Security Expert)**: "I'm concerned about the TTS API endpoints. Can you check for rate limiting and input validation?"

**Gemini Response**: [Detailed security review]

**You (as Performance Engineer)**: "The database queries look slow. Can you suggest indexing strategies and query optimizations?"

**Gemini Response**: [Performance recommendations]

## 📊 Expected Feedback Format

Gemini should create `gemini_feedback.txt` with:

```
═══════════════════════════════════════════════════
         GEMINI COLLABORATIVE FEEDBACK
═══════════════════════════════════════════════════

📅 Review Date: [timestamp]
👤 Reviewer Role: [Security Expert/Performance Engineer/etc]
📊 Agreement with Claude: [percentage]

🔍 ADDITIONAL FINDINGS:
━━━━━━━━━━━━━━━━━━━━

1. Security Issues:
   - [New vulnerability found]
   - [Risk assessment]
   - [Proposed fix]

2. Performance Bottlenecks:
   - [Issue description]
   - [Impact analysis]
   - [Optimization strategy]

3. Code Quality:
   - [Pattern violations]
   - [Refactoring suggestions]
   - [Best practices]

💡 IMPROVEMENTS IMPLEMENTED:
━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Generated: improved_code.py
   - [List of enhancements]
   - [Performance gains]
   - [Security hardening]

🤝 COLLABORATION NOTES:
━━━━━━━━━━━━━━━━━━━━━

- Areas of agreement with Claude
- Divergent opinions requiring discussion
- Recommended next steps

═══════════════════════════════════════════════════
```

## 🎯 Workflow Success Metrics

After collaboration, check:
- ✅ Both AI perspectives considered
- ✅ Security vulnerabilities addressed
- ✅ Performance optimizations applied
- ✅ Code quality improved
- ✅ Token usage minimized (~90% reduction)