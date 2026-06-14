#!/usr/bin/env python3
"""
PDF parser using pdfminer.six with layout-aware extraction.

This script is invoked as a subprocess by src/utils/pdf-parser.ts.
It does what plain text extractors (like pdf-parse) can't:

  1. Reads each text block's (x0, y0, x1, y1) coordinates from PDF.
  2. Detects double-column layout by checking column distribution.
  3. Reorders blocks so reading order is correct (left column top->bottom,
     then right column top->bottom) instead of being interleaved row-by-row.
  4. Strips common academic-paper junk (arXiv watermarks, standalone page
     numbers, "Under review at..." banners).
  5. Splits the cleaned text into sections by academic-style keywords.

Output: a single JSON object on stdout:
    { "paperId": str, "fullText": str, "sections": [{"title", "content"}] }

Errors go to stderr and exit code 2.

Requires: Python 3.8+, pdfminer.six (pip install pdfminer.six)
"""
import json
import re
import sys
from typing import Dict, List, Tuple

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTPage, LTTextContainer

# Common academic section headers. Order doesn't matter — we sort by where
# they appear in the text after extraction.
SECTION_KEYWORDS = [
    "Abstract", "Introduction", "Background", "Related Work", "Preliminaries",
    "Method", "Methods", "Methodology", "Approach", "Model",
    "Experiments", "Experimental Setup", "Evaluation", "Results",
    "Discussion", "Analysis", "Limitations", "Conclusion", "Conclusions",
    "Future Work", "References", "Acknowledgments",
]

# Patterns we strip line-by-line. Conservative: only kill stuff that's
# clearly junk on its own line, never inside a paragraph.
JUNK_PATTERNS = [
    # arXiv watermark, e.g. "arXiv:2310.11511v3 [cs.CL] 17 Oct 2023"
    re.compile(r"^\s*arXiv:\d{4}\.\d{4,5}(v\d+)?\s*\[[^\]]*\]\s*\d{1,2}\s+\w+\s+\d{4}\s*$", re.MULTILINE),
    # Conference banners
    re.compile(r"^\s*Under review as a conference paper.*$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^\s*Published as a conference paper.*$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^\s*Preprint\.\s*Under review\.?\s*$", re.MULTILINE | re.IGNORECASE),
    # Bare page numbers (1–3 digits on their own line)
    re.compile(r"^\s*\d{1,3}\s*$", re.MULTILINE),
]


# ---------- Layout-aware extraction ----------

def extract_pdf_text(pdf_path: str) -> str:
    """Walk pages, process each page's blocks in correct reading order."""
    out_pages: List[str] = []
    for page in extract_pages(pdf_path):
        text = process_page(page)
        if text.strip():
            out_pages.append(text)
    return "\n\n".join(out_pages)


def process_page(page: LTPage) -> str:
    """For one page: collect text blocks with bbox, detect column layout, sort."""
    blocks: List[Tuple[float, float, float, float, str]] = []
    for el in page:
        if isinstance(el, LTTextContainer):
            text = el.get_text()
            if text.strip() and not is_margin_noise(el, page.width):
                blocks.append((el.x0, el.y0, el.x1, el.y1, text))

    if not blocks:
        return ""

    if detect_double_column(blocks, page.width):
        return order_double_column(blocks, page.width)
    return order_single_column(blocks)


def is_margin_noise(box: LTTextContainer, page_width: float) -> bool:
    """Filter out narrow text boxes glued to the left/right page edge.

    These are almost always one of:
      - The arXiv vertical watermark ("arXiv:1234.5678v1 [cs.CL]" rotated 90°,
        which pdfminer often splits into per-character boxes).
      - Line numbers from ICLR-style "under review" templates.
      - Per-page binding/copyright stamps.

    Real body text is wider than 5% of page width AND its center sits comfortably
    away from the edges. So we kill anything narrow that hugs an edge.
    """
    bbox_width = box.x1 - box.x0
    edge_margin = page_width * 0.05  # boxes within 5% of the edge
    narrow = bbox_width < page_width * 0.05  # boxes thinner than 5% of page
    near_left = box.x0 < edge_margin
    near_right = box.x1 > page_width - edge_margin
    return narrow and (near_left or near_right)


def detect_double_column(blocks, page_width: float) -> bool:
    """Heuristic for double-column:
    - No (or few) blocks straddle the page midline.
    - At least 2 blocks on each side of the midline.
    Single-column papers usually have full-width paragraphs that straddle."""
    if len(blocks) < 4:
        return False
    page_mid = page_width / 2
    # A block "straddles" if it crosses the midline with reasonable width on both sides
    margin = page_width * 0.05
    straddling = [b for b in blocks if b[0] < page_mid - margin and b[2] > page_mid + margin]
    # If too many blocks span across the middle, it's a single wide column
    if len(straddling) > len(blocks) * 0.2:
        return False
    left_count = sum(1 for b in blocks if (b[0] + b[2]) / 2 < page_mid)
    right_count = sum(1 for b in blocks if (b[0] + b[2]) / 2 >= page_mid)
    return left_count >= 2 and right_count >= 2


def order_double_column(blocks, page_width: float) -> str:
    """Read full left column top->bottom first, then right column."""
    page_mid = page_width / 2
    left = [b for b in blocks if (b[0] + b[2]) / 2 < page_mid]
    right = [b for b in blocks if (b[0] + b[2]) / 2 >= page_mid]
    # In PDF coordinates y increases UP, so 'sort by -y' = top to bottom
    left.sort(key=lambda b: -b[3])
    right.sort(key=lambda b: -b[3])
    return "\n".join(b[4].rstrip() for b in (left + right))


def order_single_column(blocks) -> str:
    """Plain top-to-bottom ordering."""
    blocks.sort(key=lambda b: -b[3])
    return "\n".join(b[4].rstrip() for b in blocks)


# ---------- Cleaning ----------

def clean_text(text: str) -> str:
    """Strip junk patterns, normalize whitespace, mend hyphenated words."""
    for p in JUNK_PATTERNS:
        text = p.sub("", text)
    # Mend words split across lines by typesetter hyphens, e.g. "typi-\ncally" -> "typically".
    # Conservative: only when the next line starts with a lowercase letter (real soft hyphens).
    # Don't touch hard hyphens like "state-of-the-art" or compound nouns.
    text = re.sub(r"([a-z])-\n([a-z])", r"\1\2", text)
    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse runs of spaces/tabs (don't touch newlines)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


# ---------- Section split ----------

def extract_sections(text: str) -> List[Dict[str, str]]:
    """Find each keyword that appears as a *standalone heading line*, then slice
    text between consecutive matches into sections.

    The strict rule (vs. matching anywhere in the text):
      - the line, after stripping, must be ONLY the keyword, optionally with
        a leading section number ("3", "3.1", "IV.", etc.) and optional trailing
        period.

    This rejects matches like the word "Evaluation" appearing inside an
    Introduction paragraph, which our previous less-strict regex picked up
    and mis-treated as a section boundary.
    """
    lines = text.split("\n")
    # Pre-compute char offset of each line in the original text
    offsets: List[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line) + 1  # +1 for the \n that split() consumed

    matches: List[Tuple[str, int]] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Heading lines are short. Body sentences that happen to start with a
        # keyword are usually long.
        if not stripped or len(stripped) > 60:
            continue
        for kw in SECTION_KEYWORDS:
            # Allow leading number like "3", "3.", "3.1", "3.1.", "IV.",
            # then the keyword, then optional ".", and that's the whole line.
            pattern = re.compile(
                r"^\s*(?:\d{1,2}(?:\.\d+)?\.?\s+|[IVX]{1,4}\.?\s+)?"
                + re.escape(kw)
                + r"\s*\.?\s*$",
                re.IGNORECASE,
            )
            if pattern.match(stripped):
                matches.append((kw, offsets[i]))
                break  # one heading match per line is enough

    # Keep only the first occurrence of each keyword (some papers repeat
    # "Conclusion" inside the appendix; the document-level section is the
    # earliest hit).
    seen: set = set()
    deduped: List[Tuple[str, int]] = []
    for kw, off in matches:
        if kw not in seen:
            deduped.append((kw, off))
            seen.add(kw)
    matches = deduped

    if not matches:
        return [{"title": "Body", "content": text.strip()}]

    matches.sort(key=lambda m: m[1])

    sections: List[Dict[str, str]] = []
    # Anything before the first heading (title page, authors, abstract maybe)
    if matches[0][1] > 50:
        header = text[: matches[0][1]].strip()
        if len(header) > 20:
            sections.append({"title": "Header", "content": header})

    for i, (kw, idx) in enumerate(matches):
        end = matches[i + 1][1] if i + 1 < len(matches) else len(text)
        content = text[idx:end].strip()
        if len(content) > 50:
            sections.append({"title": kw, "content": content})
    return sections


# ---------- Entry point ----------

def main() -> None:
    if len(sys.argv) != 3:
        sys.stderr.write(json.dumps({"error": "usage: pdf_parser.py <pdf_path> <paper_id>"}))
        sys.exit(1)
    pdf_path, paper_id = sys.argv[1], sys.argv[2]
    try:
        raw = extract_pdf_text(pdf_path)
        cleaned = clean_text(raw)
        sections = extract_sections(cleaned)
        result = {
            "paperId": paper_id,
            "fullText": cleaned,
            "sections": sections,
        }
        # ensure_ascii=False so Chinese / accented chars survive
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(json.dumps({"error": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()
