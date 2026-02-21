#!/usr/bin/env python3
"""
setup.py – one-time data preparation script for the Prawo Jazdy practice app.

What it does:
  1. Downloads the official question xlsx (if not already present)
  2. Parses it and generates questions.json filtered to category B
  3. Downloads the multimedia archive (if not already present) — 8.8 GB, takes a while
  4. Extracts JPG images → media/
  5. Converts WMV videos (referenced by category-B questions) → WebM via ffmpeg → media/

Requirements:
  uv run scripts/setup.py   (installs dependencies automatically via pyproject.toml)
  -or- pip install openpyxl requests
  ffmpeg available on PATH (for video conversion)
"""

import json
import os
import subprocess
import sys
import zipfile

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)

XLSX_URL = "https://www.gov.pl/attachment/c694a7f2-9374-4f54-94e7-7e52c52f6332"
ZIP_URL = "https://www.gov.pl/pliki/mi/multimedia_do_pytan.zip"

XLSX_PATH = os.path.join(REPO_ROOT, "pytania.xlsx")
ZIP_PATH = os.path.join(REPO_ROOT, "multimedia_do_pytan.zip")
JSON_PATH = os.path.join(REPO_ROOT, "questions.json")
MEDIA_DIR = os.path.join(REPO_ROOT, "media")

CATEGORY_FILTER = "B"   # change to None to include all categories


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def download(url: str, dest: str) -> None:
    """Stream-download url to dest, showing a progress indicator."""
    try:
        import requests
    except ImportError:
        print("ERROR: 'requests' not installed. Run:  pip install requests")
        sys.exit(1)

    print(f"Downloading {url}")
    print(f"  → {dest}")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        downloaded = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    mb = downloaded / 1024 / 1024
                    print(f"\r  {pct:.1f}%  ({mb:.0f} MB)", end="", flush=True)
    print()
    print("  Done.")


def ffmpeg_available() -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def wmv_to_webm(src_path: str, dst_path: str) -> bool:
    """Convert a WMV file to WebM (VP9). Returns True on success."""
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",                   # overwrite without asking
            "-i", src_path,
            "-c:v", "libvpx-vp9",
            "-b:v", "0",
            "-crf", "35",           # quality 0-63, lower = better; 35 is good enough for practice
            "-an",                   # strip audio (not needed for these clips)
            dst_path,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


# ---------------------------------------------------------------------------
# Step 1 – Download xlsx
# ---------------------------------------------------------------------------
def ensure_xlsx() -> None:
    if os.path.exists(XLSX_PATH):
        print(f"[1/5] xlsx already present: {XLSX_PATH}")
        return
    print("[1/5] Downloading question xlsx …")
    download(XLSX_URL, XLSX_PATH)


# ---------------------------------------------------------------------------
# Step 2 – Parse xlsx → questions.json
# ---------------------------------------------------------------------------
def parse_xlsx() -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        print("ERROR: 'openpyxl' not installed. Run:  pip install openpyxl")
        sys.exit(1)

    print("[2/5] Parsing xlsx …")
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active

    questions = []
    skipped = 0

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # header

        lp         = row[0]   # L.p.
        number     = row[1]   # Numer pytania
        text       = row[2]   # Pytanie (Polish)
        ans_a      = row[3]   # Odpowiedź A
        ans_b      = row[4]   # Odpowiedź B
        ans_c      = row[5]   # Odpowiedź C
        correct    = row[6]   # Poprawna odp (T/N/A/B/C)
        media_name = row[7]   # Media filename (or None)
        structure  = row[8]   # PODSTAWOWY / SPECJALISTYCZNY
        categories = row[9]   # comma-separated list, e.g. "A,B,C,D,T,AM,A1,A2,B1,C1,D1"

        if not text or not correct:
            skipped += 1
            continue

        # Category filter
        if CATEGORY_FILTER:
            cats = [c.strip() for c in str(categories).split(",")]
            if CATEGORY_FILTER not in cats:
                skipped += 1
                continue

        # Determine question type
        if correct in ("T", "N"):
            q_type = "TN"
            answers = None
        else:
            q_type = "ABC"
            answers = {}
            if ans_a:
                answers["A"] = str(ans_a).strip()
            if ans_b:
                answers["B"] = str(ans_b).strip()
            if ans_c:
                answers["C"] = str(ans_c).strip()

        # Normalise media filename: WMV → will become WebM; keep JPGs as-is
        media_file = None
        if media_name:
            media_name = str(media_name).strip()
            if media_name.lower().endswith(".wmv"):
                media_file = os.path.splitext(media_name)[0] + ".webm"
            else:
                media_file = media_name

        questions.append({
            "id":        int(number) if number else lp,
            "text":      str(text).strip(),
            "type":      q_type,
            "answers":   answers,
            "correct":   str(correct).strip(),
            "media":     media_file,
            "mediaOrig": str(media_name).strip() if media_name else None,
            "structure": str(structure).strip() if structure else "PODSTAWOWY",
        })

    wb.close()
    print(f"  Parsed {len(questions)} questions (skipped {skipped}).")
    return questions


def write_json(questions: list[dict]) -> None:
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=None, separators=(",", ":"))
    size_kb = os.path.getsize(JSON_PATH) / 1024
    print(f"  Written {JSON_PATH}  ({size_kb:.0f} KB)")


# ---------------------------------------------------------------------------
# Step 3 – Download multimedia zip
# ---------------------------------------------------------------------------
def ensure_zip() -> None:
    if os.path.exists(ZIP_PATH):
        size_gb = os.path.getsize(ZIP_PATH) / 1024 / 1024 / 1024
        print(f"[3/5] Multimedia zip already present ({size_gb:.1f} GB): {ZIP_PATH}")
        return
    print("[3/5] Downloading multimedia archive (≈8.8 GB) …")
    print("  This will take a long time depending on your connection.")
    download(ZIP_URL, ZIP_PATH)


# ---------------------------------------------------------------------------
# Steps 4 & 5 – Extract images and convert videos
# ---------------------------------------------------------------------------
def extract_and_convert(questions: list[dict]) -> None:
    os.makedirs(MEDIA_DIR, exist_ok=True)

    # Build sets of original filenames needed
    needed_images: set[str] = set()
    needed_videos: set[str] = set()  # original .wmv names

    for q in questions:
        orig = q.get("mediaOrig")
        if not orig:
            continue
        if orig.lower().endswith(".wmv"):
            needed_videos.add(orig)
        else:
            needed_images.add(orig)

    print(f"[4/5] Extracting {len(needed_images)} images …")

    images_done = 0
    images_skip = 0

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        # Build a lookup: basename → full zip path
        name_map: dict[str, str] = {}
        for member in zf.namelist():
            name_map[os.path.basename(member).lower()] = member

        for img_name in needed_images:
            dst = os.path.join(MEDIA_DIR, img_name)
            if os.path.exists(dst):
                images_skip += 1
                continue
            zipped = name_map.get(img_name.lower())
            if zipped is None:
                print(f"  WARNING: {img_name} not found in zip")
                continue
            with zf.open(zipped) as src, open(dst, "wb") as out:
                out.write(src.read())
            images_done += 1

        print(f"  Extracted {images_done} images ({images_skip} already existed).")

        has_ffmpeg = ffmpeg_available()
        if not has_ffmpeg:
            print("[5/5] WARNING: ffmpeg not found. Skipping video conversion.")
            print("      Install ffmpeg and re-run this script to enable video questions.")
            return

        print(f"[5/5] Converting {len(needed_videos)} WMV → WebM …")

        videos_done = 0
        videos_skip = 0
        videos_fail = 0

        for wmv_name in sorted(needed_videos):
            webm_name = os.path.splitext(wmv_name)[0] + ".webm"
            dst_webm = os.path.join(MEDIA_DIR, webm_name)
            if os.path.exists(dst_webm):
                videos_skip += 1
                continue

            # Extract WMV to a temp path inside MEDIA_DIR
            tmp_wmv = os.path.join(MEDIA_DIR, "_tmp_" + wmv_name)
            zipped = name_map.get(wmv_name.lower())
            if zipped is None:
                print(f"  WARNING: {wmv_name} not found in zip")
                videos_fail += 1
                continue

            with zf.open(zipped) as src, open(tmp_wmv, "wb") as out:
                out.write(src.read())

            ok = wmv_to_webm(tmp_wmv, dst_webm)
            os.remove(tmp_wmv)

            if ok:
                videos_done += 1
                if videos_done % 50 == 0:
                    print(f"  … {videos_done}/{len(needed_videos)} videos converted")
            else:
                print(f"  WARNING: conversion failed for {wmv_name}")
                videos_fail += 1

        print(
            f"  Videos: {videos_done} converted, "
            f"{videos_skip} already existed, {videos_fail} failed."
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("=== Prawo Jazdy – Data Setup ===")
    print(f"Repo root:  {REPO_ROOT}")
    print(f"Category filter: {CATEGORY_FILTER or 'all'}")
    print()

    ensure_xlsx()
    questions = parse_xlsx()
    write_json(questions)
    ensure_zip()
    extract_and_convert(questions)

    print()
    print("=== Setup complete! ===")
    print("Next steps:")
    print(f"  1. Commit questions.json and media/ to git")
    print(f"  2. cd {REPO_ROOT} && python -m http.server 8000")
    print(f"  3. Open http://localhost:8000 in your browser")


if __name__ == "__main__":
    main()
