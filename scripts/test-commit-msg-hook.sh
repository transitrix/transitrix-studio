#!/bin/bash
# Test suite for .githooks/commit-msg hook.
# Run with: bash scripts/test-commit-msg-hook.sh

HOOK=".githooks/commit-msg"
PASS=0
FAIL=0

test_case() {
  local name="$1"
  local msg="$2"
  local should_pass="$3"

  local tmpfile="/tmp/test-msg-$$.txt"
  echo "$msg" > "$tmpfile"

  if bash "$HOOK" "$tmpfile" >/dev/null 2>&1; then
    # Hook returned success
    if [ "$should_pass" = "yes" ]; then
      echo "✓ PASS: $name"
      PASS=$((PASS + 1))
    else
      echo "✗ FAIL: $name (should have been rejected)"
      FAIL=$((FAIL + 1))
    fi
  else
    # Hook returned failure
    if [ "$should_pass" = "no" ]; then
      echo "✓ PASS: $name (correctly rejected)"
      PASS=$((PASS + 1))
    else
      echo "✗ FAIL: $name (should have been accepted)"
      FAIL=$((FAIL + 1))
    fi
  fi

  rm -f "$tmpfile"
}

echo "Testing .githooks/commit-msg hook..."
echo ""

# Positive cases (should pass)
test_case "Valid THQ reference" "
fix: something

Work item: THQ-571
" "yes"

test_case "Valid message without Work item line" "
feat: add a new feature

This change adds something useful.
" "yes"

test_case "Clean message with multiple paragraphs" "
feat: implement reference form guard

Prevent cross-repository references from reaching the public repository.
The hook runs before the commit object exists.

Work item: THQ-571
" "yes"

# Negative cases (should fail)
test_case "Reject owner/repo#number pattern" "
fix: something per owner/repo#123

Work item: THQ-571
" "no"

test_case "Reject github.com URL" "
docs: update per https://github.com/owner/repo

Work item: THQ-571
" "no"

test_case "Reject invalid Work item format (bare number)" "
fix: something

Work item: 123
" "no"

test_case "Reject invalid Work item format (no THQ prefix)" "
fix: something

Work item: 571
" "no"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -gt 0 ]; then
  exit 1
fi

exit 0
