#!/usr/bin/env bash
# Rebuilds every generated file: workbook assets, the offline page, the live
# import test pack, and the three packaged skills. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
SK=skills/common-cartridge
LT=dist/live-tests
export PYTHONDONTWRITEBYTECODE=1

"$PY" $SK/scripts/make_template.py
node $SK/scripts/build_html.js

mkdir -p "$LT" tests/out/live_files
rm -f "$LT"/Test_* "$LT"/README.md
"$PY" -c "
import sys; sys.path.insert(0, '$SK/scripts')
from make_template import make_pdf
make_pdf('tests/out/live_files/Test_B_handout.pdf', ['Test B handout.', 'If you can open this PDF in Schoology, the File item imported.'], 'Test B handout')
"
PYTHON="$PY" node $SK/scripts/cc_build.js tests/live/spec_A_assignment_with_rubric_table.json --out "$LT/Test_A_assignment_with_rubric_table.imscc" --no-inventory
PYTHON="$PY" node $SK/scripts/cc_build.js tests/live/spec_B_all_item_types.json --out "$LT/Test_B_all_item_types.imscc" --files tests/out/live_files --no-inventory
PYTHON="$PY" node $SK/scripts/cc_build.js tests/live/spec_C_quiz_types.json --out "$LT/Test_C_quiz_types.imscc" --no-inventory
"$PY" tests/make_qti21_test.py "$LT/Test_D_qti21_matching.zip"
cp tests/live/README.md "$LT/README.md"

mkdir -p dist
rm -f dist/*.skill
(cd skills && for s in common-cartridge schoology-assignment schoology-course-review; do
  zip -q -r "../dist/$s.skill" "$s" -x '*.DS_Store' '*__pycache__*' '*/.gitkeep'
done)
ls -1 dist dist/live-tests
