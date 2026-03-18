#!/usr/bin/env bash
# rouge-diff-scope: Categorize branch changes by type
# Usage: eval $(rouge-diff-scope <base-branch>)
# Sets: SCOPE_FRONTEND, SCOPE_BACKEND, SCOPE_PROMPTS, SCOPE_TESTS, SCOPE_DOCS, SCOPE_CONFIG
# Inspired by GStack's gstack-diff-scope (0.6.3)

set -euo pipefail

BASE="${1:-main}"
DIFF_FILES=$(git diff "$BASE" --name-only 2>/dev/null || echo "")

if [ -z "$DIFF_FILES" ]; then
  echo "SCOPE_FRONTEND=false SCOPE_BACKEND=false SCOPE_PROMPTS=false SCOPE_TESTS=false SCOPE_DOCS=false SCOPE_CONFIG=false"
  exit 0
fi

FRONTEND=false
BACKEND=false
PROMPTS=false
TESTS=false
DOCS=false
CONFIG=false

while IFS= read -r file; do
  case "$file" in
    # Frontend: CSS, HTML, JSX, TSX, Vue, Svelte, static assets
    *.css|*.scss|*.less|*.html|*.jsx|*.tsx|*.vue|*.svelte|*.svg|*.png|*.jpg|*.ico)
      FRONTEND=true ;;
    # Also frontend: component/page/layout directories
    src/components/*|src/pages/*|src/app/*|src/layouts/*|src/styles/*|public/*)
      FRONTEND=true ;;
    # Backend: server, API, database, workers
    src/server/*|src/api/*|src/workers/*|src/lib/server/*|supabase/*|*.sql)
      BACKEND=true ;;
    # Prompts: skill files, phase prompts
    .claude/*|*.md.tmpl|*SKILL.md|*phase-prompt*)
      PROMPTS=true ;;
    # Tests
    *.test.*|*.spec.*|test/*|tests/*|__tests__/*|*.test.ts|*.test.js)
      TESTS=true ;;
    # Docs
    *.md|docs/*|README*|CHANGELOG*|LICENSE*)
      DOCS=true ;;
    # Config
    *.json|*.yaml|*.yml|*.toml|*.env*|wrangler.*|tsconfig*|vite.config*|tailwind.config*|.gitignore)
      CONFIG=true ;;
    # Catch-all: backend files (ts/js not in frontend dirs)
    *.ts|*.js)
      # Check if it's a test
      if echo "$file" | grep -qE '\.test\.|\.spec\.|__tests__'; then
        TESTS=true
      # Check if it's in a frontend directory
      elif echo "$file" | grep -qE 'components/|pages/|app/|layouts/|styles/'; then
        FRONTEND=true
      else
        BACKEND=true
      fi ;;
  esac
done <<< "$DIFF_FILES"

echo "SCOPE_FRONTEND=$FRONTEND SCOPE_BACKEND=$BACKEND SCOPE_PROMPTS=$PROMPTS SCOPE_TESTS=$TESTS SCOPE_DOCS=$DOCS SCOPE_CONFIG=$CONFIG"
