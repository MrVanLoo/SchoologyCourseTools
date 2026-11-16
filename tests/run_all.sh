#!/usr/bin/env bash
# Runs every acceptance test in HANDOFF.md section 9. Exits non-zero on any failure.
#
#   tests/run_all.sh
#
# Needs: node (18+, 22+ for the browser test), python3 with openpyxl, zip.
# Set PYTHON=/path/to/python3 if your default python3 lacks openpyxl.
# Set CHROME=/path/to/chrome if Chrome or Chromium is not in a standard place.
set -u
cd "$(dirname "$0")/.."
export PYTHONDONTWRITEBYTECODE=1

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3 .venv/bin/python python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import openpyxl' 2>/dev/null; then PY="$c"; break; fi
  done
fi
if [ -z "$PY" ] || ! "$PY" -c 'import openpyxl' 2>/dev/null; then
  echo "FAIL: no python3 with openpyxl found. Install it (pip install openpyxl) or set PYTHON=..."; exit 1
fi
export PYTHON="$PY"

OUT=tests/out
rm -rf "${OUT:?}/check" "${OUT:?}/errors"
mkdir -p "$OUT/check" "$OUT/errors"
failed=0
step() { echo; echo "######## $1"; }

step "Build generated files (templates, offline page, live tests, .skill packages)"
if bash tests/build_dist.sh; then echo "ok   build_dist.sh"; else echo "FAIL build_dist.sh"; failed=1; fi

step "1. node tests/smoke.js"
if node tests/smoke.js > "$OUT/check/smoke.log" 2>&1; then echo "ok   smoke test passes"; else echo "FAIL smoke test"; cat "$OUT/check/smoke.log"; failed=1; fi

step "2-12, 14. Python acceptance checks"
if "$PY" tests/check_all.py "$OUT/check"; then :; else failed=1; fi

step "13. Offline pages (builder and reviewer) in headless Chrome"
"$PY" -c "
import sys; sys.path.insert(0, 'skills/common-cartridge/scripts')
from workbook_io import write_workbook
write_workbook('$OUT/errors/unknown_type.xlsx', [{'Unit': 'U', 'Type': 'Lesson', 'Title': 'X'}])
"
node tests/browser_test.js "$OUT/check/example.imscc"
rc=$?
if [ $rc -eq 3 ]; then echo "NOT RUN: test 13 (both offline pages) needs Chrome or Chromium. This is not a pass."; failed=1
elif [ $rc -ne 0 ]; then failed=1; fi

echo
if [ $failed -ne 0 ]; then echo "RESULT: FAILED"; exit 1; fi
echo "RESULT: ALL TESTS PASSED"
