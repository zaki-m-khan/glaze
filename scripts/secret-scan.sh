#!/usr/bin/env bash
# Fails if any secret value from .env.local, or a known key pattern, appears in tracked files or history.
set -euo pipefail
cd "$(dirname "$0")/.."

patterns=('sk-ant-[A-Za-z0-9_-]{10,}' 'clay-api-key:[[:space:]]*[A-Za-z0-9_-]{8,}')
if [[ -f .env.local ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ "$key" == *KEY* && ${#value} -ge 8 ]] && patterns+=("$value")
  done < .env.local
fi

found=0
for p in "${patterns[@]}"; do
  if git grep -qE -e "$p" -- . ':!scripts/secret-scan.sh' 2>/dev/null; then
    echo "secret pattern found in working tree"; found=1
  fi
  if git log --all -p | grep -E -e "$p" >/dev/null; then
    echo "secret pattern found in git history"; found=1
  fi
done
[[ $found -eq 0 ]] && echo "secret scan: clean"
exit $found
