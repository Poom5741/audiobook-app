# 🔨 Gemini Work Assignment from Claude Manager

## Priority Tasks (Based on GitHub Issues Analysis)

### 🚨 CRITICAL - Issue #9: Shared Module Access Failing
**Status**: OPEN - Blocking core services
**Heavy Work Required**:
1. Analyze all Dockerfiles in backend/, crawler/, parser/ directories
2. Check Docker build contexts and COPY commands
3. Trace shared module import paths in all Node.js services
4. Generate fixed Dockerfiles with proper shared module copying
5. Test container builds and verify module resolution

### 🚨 HIGH - Issue #10: Frontend Serving Wrong Application  
**Status**: OPEN - User experience broken
**Heavy Work Required**:
1. Examine frontend/Dockerfile and build process
2. Check for cached layers or wrong source copying
3. Verify frontend/package.json points to audiobook app
4. Generate corrected Dockerfile with cache busting
5. Test frontend serves correct application

### ✅ RESOLVED - Issue #11: TTS AudioProcessor
**Status**: CLOSED - But verify implementation
**Verification Work**:
1. Review tts-api/simple_audio_utils.py
2. Confirm get_duration method exists and works
3. Run test cases for audio processing
4. Document any remaining issues

### 📊 Sprint Progress Analysis
**Current State**: Sprint 1 at 90% (missing pre-commit hooks)
**Heavy Analysis Required**:
1. Review all completed security implementations
2. Analyze test coverage reports (68% unit, 51% integration)
3. Check CI/CD workflows effectiveness
4. Identify gaps in current implementation
5. Generate comprehensive security audit report

## Specific Code Analysis Tasks

### 1. Docker Infrastructure Review
```bash
# Analyze all Docker configurations
find . -name "Dockerfile*" -o -name "docker-compose*.yml" | xargs cat > docker_analysis.txt
# Check for security issues, optimization opportunities
# Generate improved configurations
```

### 2. Shared Module Dependencies
```bash
# Find all shared module imports
grep -r "shared/" --include="*.js" --include="*.ts" . > shared_imports.txt
# Analyze import paths vs Docker contexts
# Generate fix recommendations
```

### 3. Security Vulnerability Deep Scan
```bash
# Review all auth endpoints
find auth/ backend/ -name "*.js" | xargs grep -l "router\|app\." > endpoints.txt
# Check for missing validations, rate limits
# Generate security patches
```

### 4. Performance Bottleneck Analysis
```bash
# Analyze database queries
find . -name "*.js" | xargs grep -l "query\|findOne\|findAll" > db_queries.txt
# Check for N+1 queries, missing indexes
# Generate optimization queries
```

## Expected Deliverables from Gemini

1. **fixed_dockerfiles.zip** - All corrected Dockerfiles
2. **shared_module_fixes.md** - Step-by-step fixes for module issues
3. **security_audit_report.md** - Comprehensive security findings
4. **performance_optimizations.sql** - Database indexes and query improvements
5. **frontend_fix_instructions.md** - How to fix frontend serving issue
6. **gemini_work_summary.json** - Structured summary of all findings

## Instructions for Gemini

1. Start with CRITICAL issues (#9, #10) - these block functionality
2. Use interactive mode to provide real-time updates
3. Generate actual code fixes, not just descriptions
4. Test each fix in isolation before recommending
5. Create a priority-ordered action plan
6. Report back with time estimates for each fix

## Claude Manager Notes

- I've identified 5 open issues, 2 critical
- Security infrastructure is 100% complete but needs audit
- Testing at 90% but missing pre-commit hooks
- Focus on unblocking services first, then optimization
- Token budget: Use up to 100K tokens for thorough analysis

