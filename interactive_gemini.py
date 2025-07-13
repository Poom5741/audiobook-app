#!/usr/bin/env python3
import pexpect
import sys
import time

def run_interactive_gemini():
    print("🤖 Starting Claude Code x Gemini Interactive Workflow")
    print("=====================================================")
    
    try:
        # Start Gemini interactive session
        print("📡 Launching Gemini interactive session...")
        g = pexpect.spawn('gemini -i "Ready to fix audiobook frontend Docker issue"', timeout=60)
        g.logfile_read = sys.stdout.buffer  # Show Gemini output in real-time
        
        # Wait for Gemini to be ready
        print("⏳ Waiting for Gemini to be ready...")
        g.expect(['Ready for commands', 'gemini>'], timeout=30)
        print("✅ Gemini is ready!")
        
        # Task 1: Fix frontend Docker issue
        print("\n🎯 Task 1: Fix frontend serving BlockEdge instead of audiobook")
        task1 = """Task: Fix frontend Docker issue. Frontend builds correctly with audiobook routes but serves BlockEdge HTML content at runtime. Need to clear Docker HTML cache layers. Frontend source has 'AudioBook Central' title in layout.tsx but curl localhost:3000 shows 'IREC Certificates - BlockEdge Platform'. Please fix and confirm when done."""
        
        g.sendline(task1)
        g.expect(['Ready for commands', 'gemini>'], timeout=120)
        
        # Task 2: Test the fix
        print("\n🧪 Task 2: Test the frontend fix")
        task2 = """Task: Test if frontend now serves audiobook content. Check if curl localhost:3000 shows 'AudioBook Central' or 'Audiobook' instead of 'BlockEdge'. Confirm system is 100% functional."""
        
        g.sendline(task2)
        g.expect(['Ready for commands', 'gemini>'], timeout=60)
        
        # Task 3: Get final status
        print("\n📊 Task 3: Get final system status")
        task3 = """Task: Provide final status report. List which services are working: Backend (5001), Crawler (3001), Parser (3002), Frontend (3000). Confirm if system is 100% functional."""
        
        g.sendline(task3)
        g.expect(['Ready for commands', 'gemini>'], timeout=30)
        
        # Close session
        print("\n🔚 Closing Gemini session...")
        g.sendline('exit')
        g.close()
        
        print("\n✅ Interactive Gemini workflow completed!")
        return True
        
    except pexpect.TIMEOUT:
        print("\n⏰ Timeout waiting for Gemini response")
        return False
    except pexpect.EOF:
        print("\n📡 Gemini session ended")
        return True
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = run_interactive_gemini()
    sys.exit(0 if success else 1)