#!/usr/bin/env python3
"""
Gemini Auto-Yes Helper
Automatically handles confirmation prompts in Gemini interactive sessions
"""

import pexpect
import sys
import time

def send_task_with_auto_yes(task_description):
    """Send task to Gemini and auto-confirm any prompts"""
    try:
        print(f"🚀 Starting Gemini with task: {task_description}")
        
        # Start Gemini with auto-yes mode
        g = pexpect.spawn('gemini -y', timeout=60)
        g.expect('Ready for commands')
        print("✅ Gemini ready")
        
        # Send task
        g.sendline(f'Task: {task_description}')
        
        # Handle potential confirmation prompts
        while True:
            i = g.expect([
                'Are you sure you want to continue? [y/N]',
                'Do you want to proceed? [y/N]', 
                'Continue? [y/N]',
                'Ready for commands',
                pexpect.TIMEOUT,
                pexpect.EOF
            ], timeout=30)
            
            if i in [0, 1, 2]:  # Confirmation prompts
                print("🤖 Auto-confirming prompt...")
                g.sendline('y')
                continue
            elif i == 3:  # Ready for commands
                print("✅ Task completed")
                break
            elif i == 4:  # Timeout
                print("⏰ Timeout waiting for response")
                break
            elif i == 5:  # EOF
                print("🔚 Gemini session ended")
                break
        
        # Get output
        output = g.before.decode() if g.before else ""
        print(f"📄 Output: {output[-500:]}")  # Last 500 chars
        
        # Exit gracefully
        g.sendline('exit')
        g.close()
        
        return output
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python gemini_auto_yes.py 'Your task description'")
        print("Example: python gemini_auto_yes.py 'Delete all logs'")
        sys.exit(1)
    
    task = " ".join(sys.argv[1:])
    result = send_task_with_auto_yes(task)
    
    if result:
        print("🎉 Task completed successfully")
    else:
        print("💥 Task failed")