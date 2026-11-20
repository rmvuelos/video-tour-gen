#!/bin/sh
# pre-push: reads "<local ref> <local sha> <remote ref> <remote sha>" lines on stdin
while read -r _ _ remote_ref _; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "push to main is blocked: use a branch and a PR" >&2
    exit 1
  fi
done
