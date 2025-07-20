# AI-TO-AI COMMUNICATION PROTOCOL

## INITIALIZATION
```
AGENT_ID: GEMINI
COORDINATOR_ID: CLAUDE_OPUS_4
PROJECT: AUDIOBOOK_SYSTEM_FIX
MODE: AUTONOMOUS_IMPLEMENTATION
COMMUNICATION: STRUCTURED_AI_PROTOCOL
```

## TASK EXECUTION FRAMEWORK

### RESPONSE PROTOCOL
```json
{
  "agent": "GEMINI",
  "timestamp": "ISO_8601",
  "task": {
    "id": "TASK_ID",
    "status": "ANALYZING|IMPLEMENTING|TESTING|COMPLETED|BLOCKED",
    "progress": 0-100,
    "confidence": 0-100
  },
  "actions": [
    {
      "type": "CODE_GENERATION|FILE_MODIFICATION|DEPENDENCY_INSTALL|TEST_EXECUTION",
      "target": "FILE_PATH",
      "result": "SUCCESS|FAILURE",
      "details": {}
    }
  ],
  "analysis": {
    "files_examined": [],
    "patterns_detected": [],
    "decisions_made": []
  },
  "next_steps": [],
  "blockers": [],
  "require_coordinator_input": false
}
```

## CURRENT MISSION BRIEF

### SYSTEM CONTEXT
- **Project**: Self-Hosted Audiobook System (Docker-based)
- **Architecture**: Microservices (Frontend, Backend, TTS, Parser, Crawler)
- **Current State**: ~40% functional, multiple broken integrations
- **Target State**: 100% functional with all features working

### COMPLETED WORK
- ✅ Database schema and connections fixed
- ✅ Basic service structure in place
- ✅ Docker compose configuration exists

### PRIORITY TASK SEQUENCE

#### IMMEDIATE TASK: Fix Missing Middleware (Task 2.1)
```yaml
TASK_ID: 2.1_MIDDLEWARE_IMPLEMENTATION
PRIORITY: CRITICAL
LOCATION: backend/src/middleware/

SUBTASKS:
  1_VALIDATION_MIDDLEWARE:
    file: validation.js
    requirements:
      - Use Joi for schema validation
      - Validate request bodies and query params
      - Return standardized error format
      - Export validateBook, validateChapter, validateTTS functions
    
  2_SECURITY_ENHANCEMENT:
    file: security.js (enhance existing)
    requirements:
      - Add comprehensive CORS configuration
      - Implement Helmet.js security headers
      - Add XSS protection middleware
      - Implement rate limiting per endpoint
    
  3_CACHE_MIDDLEWARE:
    file: cacheExtended.js
    requirements:
      - Redis integration for response caching
      - Dynamic cache key generation
      - Cache invalidation on mutations
      - Configurable TTL per route

VALIDATION:
  - All middleware must follow Express pattern: (req, res, next) => {}
  - Error handling must use existing patterns
  - Must integrate with current route structure
```

#### TASK QUEUE (Execute Sequentially After 2.1)
```yaml
QUEUE:
  - TASK_2.2: Fix service communication & circuit breakers
  - TASK_3.1: Fix TTS engine initialization
  - TASK_3.2: Implement TTS queue processing
  - TASK_4.1: Audio streaming with range requests
  - TASK_4.2: Audio player controls
  - TASK_5.1: Book CRUD operations
  - TASK_5.2: File upload system
  - TASK_6.1: PDF/EPUB parser fixes
  - TASK_7.1: Web scraping implementation
  - TASK_8.1: Frontend UI components
  - TASK_9.1: Queue management system
  - TASK_10.1: Service health checks
```

## IMPLEMENTATION GUIDELINES

### CODE STANDARDS
```yaml
PATTERNS:
  - Follow existing code conventions
  - Use async/await for all async operations
  - Implement proper error boundaries
  - Add comprehensive logging
  
DEPENDENCIES:
  - Check package.json before adding new deps
  - Prefer existing libraries over new ones
  - Validate all external library usage
  
TESTING:
  - Write tests for critical paths
  - Use existing test patterns
  - Ensure backward compatibility
```

### FILE OPERATIONS
```yaml
BEFORE_MODIFY:
  - Read current file content
  - Understand existing patterns
  - Preserve working code
  
DURING_MODIFY:
  - Make incremental changes
  - Test after each change
  - Commit logical units
  
AFTER_MODIFY:
  - Run relevant tests
  - Check service integration
  - Update progress status
```

## AUTONOMOUS OPERATION MODE

### DECISION FRAMEWORK
```yaml
CAN_PROCEED_WITHOUT_COORDINATOR:
  - Clear implementation path exists
  - No architectural decisions needed
  - Dependencies are available
  - Tests can validate correctness

MUST_CONSULT_COORDINATOR:
  - Architectural changes required
  - New dependencies needed
  - Breaking changes detected
  - Security implications identified
```

### PROGRESS REPORTING
```yaml
REPORT_FREQUENCY: After each subtask completion
REPORT_CONTENT:
  - Task ID and current progress
  - Files modified with line ranges
  - Tests passed/failed
  - Next planned action
  - Any discovered issues
```

## EXECUTION COMMAND

BEGIN AUTONOMOUS IMPLEMENTATION OF TASK 2.1 NOW.

Analyze the current backend middleware structure, implement the three required middleware files following the specifications above, and report progress using the defined protocol. Proceed with confidence and make decisions based on the existing codebase patterns.