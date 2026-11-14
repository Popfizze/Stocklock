#!/usr/bin/env bash
# Builds one Lambda zip per collector that has a handler.py:
#   backend/collectors/<step>/ + backend/app/  ->  build/collectors/<step>.zip
# The optional requirements.txt is installed for the Lambda runtime (Python 3.12, x86_64) with uv.
# Usage: bash infra/scripts/build-collectors.sh   (needs uv and Python 3)
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/backend/collectors"
out="$root/build/collectors"
python="$(command -v python3 || command -v python)"
mkdir -p "$out"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

shopt -s nullglob
for dir in "$src"/*/; do
  step="$(basename "$dir")"
  [ -f "$dir/handler.py" ] || continue
  stage="$work/$step"
  mkdir -p "$stage"
  if [ -f "$dir/requirements.txt" ]; then
    uv pip install --quiet --python-platform x86_64-manylinux_2_34 --python-version 3.12 \
      --only-binary=:all: --target "$stage" -r "$dir/requirements.txt"
  fi
  cp -R "$dir". "$stage/"
  # Collectors reuse the API's code (data loaders, config, score table contract): the `app` package
  # goes next to handler.py, without the narration agents (AgentCore code, Strands dependencies).
  cp -R "$root/backend/app" "$stage/app"
  rm -rf "$stage/app/agents"
  find "$stage" \( -name __pycache__ -o -name '*.pyc' -o -name requirements.txt \) -prune -exec rm -rf {} +
  # Sorted entries, fixed timestamps and modes keep the zip, hence the Lambda code hash, stable.
  "$python" - "$stage" "$work/$step.zip" <<'EOF'
import os
import sys
import zipfile

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as archive:
    for base, dirs, files in os.walk(src):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(base, name)
            info = zipfile.ZipInfo(os.path.relpath(path, src).replace(os.sep, "/"), (1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100755 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as fh:
                archive.writestr(info, fh.read())
EOF
  mv -f "$work/$step.zip" "$out/$step.zip"
  echo "built build/collectors/$step.zip ($(du -h "$out/$step.zip" | cut -f1))"
done
