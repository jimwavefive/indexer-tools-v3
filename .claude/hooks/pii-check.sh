#!/bin/bash
# Pre-commit hook: scan staged diff for personally identifiable information.
# Patterns are loaded from .claude/hooks/pii-patterns.txt (one grep -iE regex per line).
# If the patterns file doesn't exist, the check is skipped.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Only intercept git commit commands
if [[ "$COMMAND" != *"git commit"* ]]; then
  exit 0
fi

PATTERNS_FILE="$CLAUDE_PROJECT_DIR/.claude/hooks/pii-patterns.txt"

if [[ ! -f "$PATTERNS_FILE" ]]; then
  echo "PII check skipped: no patterns file at $PATTERNS_FILE" >&2
  exit 0
fi

# Get the staged diff
DIFF=$(git diff --cached --unified=0 2>/dev/null)
if [[ -z "$DIFF" ]]; then
  exit 0
fi

# Only check added lines (lines starting with +, excluding +++ headers)
ADDED_LINES=$(echo "$DIFF" | grep '^+' | grep -v '^+++')

FOUND=0
while IFS= read -r pattern; do
  # Skip empty lines and comments
  [[ -z "$pattern" || "$pattern" == \#* ]] && continue

  MATCHES=$(echo "$ADDED_LINES" | grep -iE "$pattern" 2>/dev/null)
  if [[ -n "$MATCHES" ]]; then
    if [[ "$FOUND" -eq 0 ]]; then
      echo "PII detected in staged changes — commit blocked:" >&2
      FOUND=1
    fi
    echo "  Pattern: $pattern" >&2
    echo "$MATCHES" | while IFS= read -r line; do
      echo "    $line" >&2
    done
  fi
done < "$PATTERNS_FILE"

if [[ "$FOUND" -eq 1 ]]; then
  echo "Remove PII before committing. Patterns file: $PATTERNS_FILE" >&2
  exit 2
fi

exit 0
