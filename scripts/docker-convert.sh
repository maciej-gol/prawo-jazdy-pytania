#!/bin/bash
# Parallel WMV → WebM converter (runs inside Docker)
# Mount: /input  — directory containing .wmv source files (read-only)
#         /output — directory to write .webm files
set -euo pipefail

INPUT_DIR="/input"
OUTPUT_DIR="/output"
JOBS=$(nproc)
CRF="${CRF:-35}"   # VP9 quality: 0–63, lower = better; 35 is fine for practice

echo "=== WMV → WebM converter ==="
echo "Input:  $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo "Jobs:   $JOBS  ($(nproc) CPUs available)"
echo "CRF:    $CRF"
echo ""

total=$(find "$INPUT_DIR" -type f -iname "*.wmv" | wc -l)
echo "Files to process: $total"
echo ""

# Export variables needed by child bash processes launched by xargs
export OUTPUT_DIR CRF

convert_one() {
    local f="$1"
    local base
    base=$(basename "$f")
    # Strip extension case-insensitively
    local name="${base%.[Ww][Mm][Vv]}"
    # Fallback: sed-based strip (handles mixed case like .Wmv)
    name=$(echo "$base" | sed 's/\.[Ww][Mm][Vv]$//')
    local out="$OUTPUT_DIR/${name}.webm"

    if [ -f "$out" ]; then
        echo "SKIP  $name"
        return 0
    fi

    if ffmpeg -y \
        -i "$f" \
        -c:v libvpx-vp9 \
        -b:v 0 -crf "$CRF" \
        -deadline good \
        -an \
        "$out" 2>/dev/null
    then
        echo "OK    $name"
    else
        echo "FAIL  $name"
        rm -f "$out"   # remove incomplete output file
        return 1
    fi
}

export -f convert_one

find "$INPUT_DIR" -type f -iname "*.wmv" -print0 \
    | xargs -0 -P "$JOBS" -I{} bash -c 'convert_one "$@"' _ {}

echo ""
echo "=== Conversion complete ==="
