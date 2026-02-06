#!/bin/bash
# Pre-commit hook: verify Docker build compiles before allowing git commit.
# Uses layer caching — fast if nothing changed, catches TS errors if files changed.
# Only triggers on git commit commands.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Only intercept git commit commands
if [[ "$COMMAND" != *"git commit"* ]]; then
  exit 0
fi

# Check if docker compose is available and compose file exists
if ! docker compose config --quiet 2>/dev/null; then
  echo "Build check skipped: no docker-compose.yml found" >&2
  exit 0
fi

# Run docker compose build — catches TypeScript and other compilation errors
# Uses layer caching so it's fast when only non-source files changed
echo "Verifying Docker build compiles..." >&2
if ! docker compose build 2>&1; then
  echo "Docker build failed — fix errors before committing" >&2
  exit 2
fi

exit 0
