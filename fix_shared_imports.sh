#!/bin/bash
# Fix all shared module import paths

echo "🔧 Fixing shared module import paths..."

# Backend service
find backend/src -name "*.js" -exec sed -i '' 's|../../../../shared/|../../shared/|g' {} \;
find backend/src -name "*.js" -exec sed -i '' 's|../../../shared/|../shared/|g' {} \;

# Crawler service
find crawler/src -name "*.js" -exec sed -i '' 's|../../../../shared/|../../shared/|g' {} \;
find crawler/src -name "*.js" -exec sed -i '' 's|../../../shared/|../shared/|g' {} \;

# Parser service  
find parser/src -name "*.js" -exec sed -i '' 's|../../../../shared/|../../shared/|g' {} \;
find parser/src -name "*.js" -exec sed -i '' 's|../../../shared/|../shared/|g' {} \;

echo "✅ Fixed shared module imports for all services"