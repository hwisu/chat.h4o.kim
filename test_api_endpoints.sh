#!/bin/bash

# API Endpoint Testing Script
# Based on src/svelte/services/api.js

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:8787"
PASSWORD="250511"
SESSION_TOKEN=""
USER_API_KEY=""

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Test function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local expected_status=${5:-200}
    
    log_test "$description"
    
    local curl_cmd="curl -s -w '%{http_code}' -X $method '$BASE_URL$endpoint'"
    
    # Add headers
    local headers="-H 'Content-Type: application/json'"
    
    if [[ -n "$SESSION_TOKEN" ]]; then
        headers="$headers -H 'X-Session-Token: $SESSION_TOKEN'"
    fi
    
    if [[ -n "$USER_API_KEY" ]]; then
        headers="$headers -H 'X-User-API-Key: $USER_API_KEY'"
    fi
    
    # Add data for POST requests
    if [[ "$method" == "POST" && -n "$data" ]]; then
        curl_cmd="$curl_cmd $headers -d '$data'"
    else
        curl_cmd="$curl_cmd $headers"
    fi
    
    # Execute curl and capture response
    local response=$(eval $curl_cmd)
    local status_code="${response: -3}"
    local body="${response%???}"
    
    echo "Status: $status_code"
    echo "Response: $body" | jq . 2>/dev/null || echo "Response: $body"
    
    if [[ "$status_code" == "$expected_status" ]]; then
        log_success "Test passed (Status: $status_code)"
        echo "$body"
    else
        log_error "Test failed (Expected: $expected_status, Got: $status_code)"
        echo "$body"
        return 1
    fi
    
    echo "---"
    return 0
}

# Main test sequence
main() {
    echo -e "${BLUE}=== API Endpoint Testing ===${NC}"
    echo "Base URL: $BASE_URL"
    echo "Date: $(date)"
    echo ""
    
    # 1. Health check (if exists)
    test_endpoint "GET" "/health" "" "Health Check" 200 || true
    
    # 2. Auth Status (unauthenticated)
    test_endpoint "GET" "/api/auth-status" "" "Auth Status (Unauthenticated)" 200 || true
    
    # 3. Login with wrong password
    test_endpoint "POST" "/api/login" '{"password":"wrong"}' "Login (Wrong Password)" 401 || true
    
    # 4. Login with correct password
    log_test "Login (Correct Password)"
    response=$(curl -s -X POST "$BASE_URL/api/login" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"$PASSWORD\"}")
    
    echo "Login Response: $response" | jq . 2>/dev/null || echo "Login Response: $response"
    
    # Extract session token
    SESSION_TOKEN=$(echo "$response" | jq -r '.session_token // empty' 2>/dev/null)
    
    if [[ -n "$SESSION_TOKEN" && "$SESSION_TOKEN" != "null" ]]; then
        log_success "Login successful, token received"
        echo "Session Token: ${SESSION_TOKEN:0:20}..."
    else
        log_error "Login failed or no token received"
        echo "---"
        return 1
    fi
    echo "---"
    
    # 5. Auth Status (authenticated)
    test_endpoint "GET" "/api/auth-status" "" "Auth Status (Authenticated)" 200 || true
    
    # 6. Get Models
    test_endpoint "GET" "/api/models" "" "Get Models" 200 || true
    
    # 7. Get Roles
    test_endpoint "GET" "/api/roles" "" "Get Roles" 200 || true
    
    # 8. Get Context Info
    test_endpoint "GET" "/api/context" "" "Get Context Info" 200 || true
    
    # 9. Set Model (if we have models)
    test_endpoint "POST" "/api/set-model" '{"model":"meta-llama/llama-4-scout:free"}' "Set Model" 200 || true
    
    # 10. Set Role (if we have roles)
    test_endpoint "POST" "/api/set-role" '{"role":"coding-assistant"}' "Set Role" 200 || true
    
    # 11. Send Chat Message
    test_endpoint "POST" "/api/chat" '{"message":"Hello, this is a test message. Please respond briefly."}' "Send Chat Message" 200 || true
    
    # 12. Set API Key (test with dummy key)
    test_endpoint "POST" "/api/set-api-key" '{"apiKey":"sk-or-v1-test-api-key-12345"}' "Set API Key" 200 || true
    
    # 13. Test unauthorized access (without token)
    SESSION_TOKEN_BACKUP="$SESSION_TOKEN"
    SESSION_TOKEN=""
    test_endpoint "GET" "/api/models" "" "Models (Unauthorized)" 401 || true
    SESSION_TOKEN="$SESSION_TOKEN_BACKUP"
    
    # 14. Context operations
    test_endpoint "GET" "/api/context" "" "Get Context After Chat" 200 || true
    
    # 15. Help endpoint (if exists)
    test_endpoint "GET" "/api/help" "" "Help Endpoint" 200 || true
    
    echo -e "${GREEN}=== Test Completed ===${NC}"
}

# Check if server is running
check_server() {
    log_test "Checking if server is running at $BASE_URL"
    if curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null 2>&1 || \
       curl -s --connect-timeout 5 "$BASE_URL/api/auth-status" > /dev/null 2>&1; then
        log_success "Server is responding"
        return 0
    else
        log_error "Server is not responding at $BASE_URL"
        log_warning "Please start the development server with: npm run dev"
        return 1
    fi
}

# Check prerequisites
check_prereqs() {
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found. JSON responses will not be formatted."
    fi
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not found"
        return 1
    fi
}

# Run the tests
if check_prereqs && check_server; then
    main
else
    exit 1
fi 
