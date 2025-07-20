# 🚨 HOTFIX Delegation to Gemini - Critical Docker Issues

## Claude Manager Analysis

### Issue #9: Shared Module Access (CRITICAL)
**Problem**: Backend Dockerfile copies `/shared` to container but builds fail
**Root Cause**: Build context vs. copy paths mismatch
**Evidence**: 
- Backend Dockerfile line 13: `COPY shared/ /shared/`
- Build context in docker-compose: `context: .` (correct)
- Services expect `../../../shared/logger` paths

### Issue #10: Frontend Wrong App (HIGH)
**Problem**: Frontend Dockerfile copying wrong source 
**Root Cause**: Build context is `./frontend` but copies entire directory
**Evidence**:
- Frontend build context: `./frontend` (line 5)
- Copies entire current directory (line 17: `COPY . .`)
- May be copying parent directory contents

## 🎯 GEMINI ASSIGNMENT: Heavy Docker Debugging

### Task 1: Fix Shared Module Access (CRITICAL)
```bash
# Gemini, analyze these files and generate fixes:
1. Review backend/Dockerfile lines 11-16
2. Check all services that import shared modules
3. Test Docker build context paths
4. Generate working Dockerfiles for all services
```

**Expected Deliverable**: `fixed_backend_dockerfile.txt`

### Task 2: Fix Frontend Build Context (HIGH)
```bash
# Gemini, debug frontend build:
1. Analyze frontend/Dockerfile multi-stage build
2. Check what's being copied in line 17 `COPY . .`
3. Verify frontend source is audiobook app, not BlockEdge
4. Generate corrected frontend Dockerfile
```

**Expected Deliverable**: `fixed_frontend_dockerfile.txt`

### Task 3: Generate Test Commands
```bash
# Gemini, create test scripts:
1. Docker build commands to test each fix
2. Verification steps for shared module imports
3. Frontend app identity verification
4. Complete rebuild sequence
```

**Expected Deliverable**: `test_docker_fixes.sh`

## 🔧 Immediate Workaround (While Waiting for Gemini)

### Quick Fix for Shared Modules:
```bash
# Copy shared directory directly into each service
cp -r shared/ backend/shared/
cp -r shared/ crawler/shared/
cp -r shared/ parser/shared/
```

### Frontend Quick Check:
```bash
# Verify frontend source
ls -la frontend/
head -20 frontend/package.json
```

## 📊 Current Status Assessment

### Services Down:
- ❌ Backend (5001): MODULE_NOT_FOUND shared/logger
- ❌ Crawler (3001): MODULE_NOT_FOUND shared/logger  
- ❌ Parser: MODULE_NOT_FOUND shared/logger
- ❌ Frontend (3000): Serving BlockEdge app

### Services Working:
- ✅ TTS API (8000): Functional
- ✅ PostgreSQL (5433): Running
- ✅ Redis (6380): Running

### System Functionality:
- **Core Pipeline**: 0% (all services down)
- **Infrastructure**: 60% (DB/cache working)
- **User Access**: 0% (frontend broken)

## 🎯 Gemini Work Instructions

1. **Priority**: Fix shared module access first (unblocks 3 services)
2. **Testing**: Each fix must be Docker build tested
3. **Verification**: Provide exact commands to verify fixes
4. **Documentation**: Explain what was wrong and how fixed

## ⏰ Timeline Expectations

- **Gemini Analysis**: 30-60 minutes (when quota resets)
- **Fix Implementation**: 15-30 minutes 
- **Testing**: 15 minutes
- **Total Recovery Time**: 1-2 hours

## 🔄 Post-Fix Actions (Claude Manager)

1. Apply Gemini's fixes
2. Test all services
3. Update hotfix status in GitHub
4. Generate recovery report
5. Continue with Sprint 1 completion

---
*Manager: Claude | Heavy Lifting: Delegated to Gemini*
*Priority: CRITICAL - System completely down*