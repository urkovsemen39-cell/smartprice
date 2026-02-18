#!/bin/bash

# Health check script for production monitoring

API_URL="${API_URL:-http://localhost:3001}"
TIMEOUT=5

echo "🏥 Running health checks..."

# Check API health
echo -n "Checking API health... "
if curl -f -s --max-time $TIMEOUT "$API_URL/health" > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

# Check database
echo -n "Checking database... "
RESPONSE=$(curl -s --max-time $TIMEOUT "$API_URL/health")
if echo "$RESPONSE" | grep -q '"database":"healthy"'; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

# Check Redis
echo -n "Checking Redis... "
if echo "$RESPONSE" | grep -q '"redis":"healthy"'; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

echo "✅ All health checks passed!"
exit 0
