"""Glue the two documents: for each page N, overlay doc A's page N (the body,
which stops at the seam) with doc B's page N (the band below the seam).

Real rules, not just concatenation:
- doc A keeps its white background; doc B's background rect is dropped so the
  band does not paint over the body.
- Both documents print a page number and they disagree about where (doc A's
  sits mid-margin on the deep bottom margin, doc B's at the canonical 799.02).
  The glued page shows neither; the composite is what the seam looks like.
"""
import re
import sys
import os

A, B, OUT = sys.argv[1], sys.argv[2], sys.argv[3]


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def split(svg):
    """Typst emits <defs> at the END of the SVG, after the content. Return the
    defs block and the content with the defs block removed."""
    m = re.search(r"<defs>.*?</defs>", svg, re.S)
    if not m:
        return "", svg
    return m.group(0), svg[: m.start()] + svg[m.end():]


def strip_number(svg):
    """Remove the trailing page-number group (the last top-level translate
    group) and the document's closing tag."""
    svg = svg.replace("</svg>", "").rstrip()
    cut = svg.rfind('<g transform="translate(')
    return svg[:cut].rstrip() if cut != -1 else svg


a_pages = sorted(f for f in os.listdir(A) if f.endswith(".svg"))
b_pages = sorted(f for f in os.listdir(B) if f.endswith(".svg"))
n = max(len(a_pages), len(b_pages))

with open(os.path.join(A, a_pages[0]), encoding="utf-8") as f:
    first = f.read()
head = re.match(r"<svg[^>]*>", first).group(0)

all_defs = []
for i in range(1, n + 1):
    a_file = os.path.join(A, f"glue.page-{i}.svg")
    b_file = os.path.join(B, f"glue.page-{i}.svg")
    if os.path.exists(a_file):
        defs, body = split(read(a_file))
        if defs:
            all_defs.append(defs)
        body = strip_number(body)
    else:
        body = ""
    if os.path.exists(b_file):
        defs, bbody = split(read(b_file))
        if defs:
            all_defs.append(defs)
        # Drop doc B's white background rect (its first child path).
        bbody = re.sub(r'<path fill="#ffffff".*?/>', "", bbody, count=1)
        body += strip_number(bbody)
    body = body.replace("</svg>", "").rstrip()
    with open(os.path.join(OUT, f"glued.page-{i}.svg"), "w", encoding="utf-8") as f:
        f.write(head + "".join(dict.fromkeys(all_defs)) + body + "</svg>")

print(f"glued {n} page(s) -> {OUT}")
