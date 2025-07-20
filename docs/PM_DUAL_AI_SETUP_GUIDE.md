# 🎯 PM Dual AI Setup Guide - Complete Fresh Start Protocol

## Overview
This guide enables a PM/Manager to quickly deploy and command two AI coding agents:
- **Gemini** (Google AI - Advanced reasoning, complex tasks)
- **OpenCode** (Local Llama3.1:8b - Real code editing, TTS integration, local execution)

---

## 🚀 Quick Start Commands

### 1. Initial Setup (One-time)
```bash
# Install dependencies
pip install opencode-ai

# Ensure Ollama is running with llama3.1:8b model
ollama pull llama3.1:8b  # if not already available
```

### 2. Deploy Both AI Agents
```bash
# Create Gemini session
tmux new-session -d -s gemini-session
tmux send-keys -t gemini-session 'gemini -y' C-m

# Create OpenCode session in project directory
tmux new-session -d -s opencode-ai
tmux send-keys -t opencode-ai 'cd /Users/poomcryptoman/codingZone/buildSomething/audiobook/audiobook-app' C-m
tmux send-keys -t opencode-ai 'opencode -m ollama/llama3.1:8b' C-m

# Wait for both to be ready (check with monitoring commands below)
```

### 3. Verify Both Agents Active
```bash
# Gemini will auto-detect project directory
# OpenCode will open in TUI mode with file browser and code editing
# Both agents ready for task assignment
```

---

## 📊 Monitoring & Management

### Status Checks
```bash
# Check Gemini work
tmux capture-pane -t gemini-session -p | tail -20

# Check OpenCode work  
tmux capture-pane -t opencode-ai -p | tail -20

# Interactive monitoring
tmux attach -t gemini-session    # Switch to Gemini view
tmux attach -t opencode-ai       # Switch to OpenCode view
# Press Ctrl+B then D to detach
```

### Task Assignment
```bash
# Send task to Gemini
tmux send-keys -t gemini-session 'Task: [your detailed task description]' C-m

# Send task to OpenCode (can browse files with /files, edit with /editor)
tmux send-keys -t opencode-ai '[task description]' C-m
```

---

## 🎯 AI Agent Capabilities & Best Use Cases

### Gemini (Google AI)
**Strengths:**
- Complex system architecture 
- Multi-file analysis
- Docker/infrastructure tasks
- Advanced reasoning
- Integration between services

**Best For:**
- System-wide changes
- Docker composition
- Service integration
- Complex debugging
- Architecture decisions

**Sample Tasks:**
```bash
tmux send-keys -t gemini-session 'Analyze the entire audiobook system architecture and optimize Docker services for production deployment' C-m

tmux send-keys -t gemini-session 'Debug and fix all Docker container networking issues between frontend, backend, and database' C-m
```

### OpenCode (Llama3.1:8b)
**Strengths:**
- **REAL CODE EDITING** - Direct file modification
- TUI file browser (/files command)
- Syntax highlighting & code viewing
- Local execution (no API limits)
- TTS/audio processing integration
- Direct Git integration potential

**Best For:**
- **Actual code editing** (unlike Trae AI which failed)
- API development with real file changes
- TTS integration implementation
- Backend service modification
- File-by-file code improvements
- Local development without API costs

**Sample Tasks:**
```bash
tmux send-keys -t opencode-ai 'Open parser/app.py and add TTS API integration endpoints. Connect to localhost:8000 TTS service.' C-m

tmux send-keys -t opencode-ai 'Look at the existing TTS API files and integrate them with the parser service for audio conversion.' C-m

tmux send-keys -t opencode-ai '/files' C-m  # Browse project files
tmux send-keys -t opencode-ai '/editor' C-m  # Open code editor
```

---

## 🛠️ Emergency Procedures

### Stop AI Agents
```bash
# Stop current tasks
tmux send-keys -t gemini-session C-c
tmux send-keys -t opencode-ai '/exit' C-m

# Kill sessions completely
tmux kill-session -t gemini-session
tmux kill-session -t opencode-ai
```

### Restart from Scratch
```bash
# Kill existing sessions
tmux kill-session -t gemini-session 2>/dev/null || true
tmux kill-session -t opencode-ai 2>/dev/null || true

# Restart both (run deployment commands from section 2)
```

### Handle Stuck AI
```bash
# Force interrupt
tmux send-keys -t [session-name] C-c
tmux send-keys -t [session-name] Escape

# Send new task
tmux send-keys -t [session-name] 'MANAGER OVERRIDE: Stop current task. New priority task: [description]' C-m
```

---

## 📋 PM Task Management Templates

### Project Planning Template
```bash
# 1. Assign architecture/system tasks to Gemini
tmux send-keys -t gemini-session 'TASK 1: [system-level work]' C-m

# 2. Assign coding/implementation to Trae AI  
tmux send-keys -t trae-session '[implementation work]' C-m

# 3. Monitor both and reassign as needed
```

### Task Prioritization
**High Priority → Gemini:**
- System architecture
- Multi-service integration
- Production deployment
- Complex debugging

**High Priority → OpenCode:**
- **Real code file editing**
- API development with actual file changes
- TTS integration implementation
- Single service code modifications
- File-by-file improvements

---

## 🔧 Troubleshooting

### Common Issues

**Gemini Not Responding:**
```bash
tmux send-keys -t gemini-session C-c
tmux send-keys -t gemini-session 'restart session' C-m
```

**OpenCode Config Error:**
```bash
# Check Ollama is running
curl -s http://localhost:11434/api/tags

# Verify OpenCode config
cat ~/.config/opencode/opencode.json

# Test llama3.1:8b model
ollama run llama3.1:8b "test"
```

**Session Lost:**
```bash
# List sessions
tmux list-sessions

# Recreate if missing
[Run deployment commands from section 2]
```

---

## 📈 Success Metrics

### Verify Both AI Agents Working
```bash
# Both should show active work
tmux capture-pane -t gemini-session -p | tail -5
tmux capture-pane -t opencode-ai -p | tail -5

# No error messages in output
# Both responding to new tasks within 30 seconds
```

### Ready State Indicators
- **Gemini**: Shows project path and "Ready for commands" or working on task
- **OpenCode**: Shows TUI interface with `>` prompt, file browser accessible via `/files`

---

## 🎯 Quick Reference Commands

```bash
# Deploy both AI agents
tmux new-session -d -s gemini-session && tmux send-keys -t gemini-session 'gemini -y' C-m
tmux new-session -d -s opencode-ai && tmux send-keys -t opencode-ai 'cd /Users/poomcryptoman/codingZone/buildSomething/audiobook/audiobook-app && opencode -m ollama/llama3.1:8b' C-m

# Monitor both
tmux capture-pane -t gemini-session -p | tail -10 && echo "--- OPENCODE ---" && tmux capture-pane -t opencode-ai -p | tail -10

# Send tasks
tmux send-keys -t gemini-session 'Task: [description]' C-m
tmux send-keys -t opencode-ai '[description]' C-m

# Emergency stop
tmux send-keys -t gemini-session C-c && tmux send-keys -t opencode-ai '/exit' C-m
```

---

*PM Protocol v2.0 - Gemini + OpenCode Dual AI Command & Control System*
*✅ CONFIRMED: OpenCode with llama3.1:8b provides REAL code editing capabilities*