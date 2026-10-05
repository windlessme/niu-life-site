#!/usr/bin/env python3
"""Render the Android privacy policy Markdown into privacy.html.

The policy's source of truth is docs/android-privacy-policy.md in
windlessme/niu-app-android; rerun this after it changes:

    python3 build_privacy.py ../niu-app-android/docs/android-privacy-policy.md
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    return re.sub(r"\[(.+?)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', text)


def render(markdown: str) -> tuple[str, str, str]:
    title, updated, out, items = "", "", [], []

    def flush():
        if items:
            out.append("<ul>\n" + "\n".join(f"  <li>{i}</li>" for i in items) + "\n</ul>")
            items.clear()

    for line in markdown.splitlines():
        line = line.rstrip()
        if line.startswith("# "):
            title = line[2:].strip()
        elif line.startswith("更新日期："):
            updated = line
        elif line.startswith("### "):
            flush(); out.append(f"<h3>{inline(line[4:])}</h3>")
        elif line.startswith("## "):
            flush(); out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("- "):
            items.append(inline(line[2:]))
        elif line:
            flush(); out.append(f"<p>{inline(line)}</p>")
        else:
            flush()
    flush()
    if not title or not updated:
        sys.exit("policy is missing its title or 更新日期 line")
    return title, updated, "\n".join(out)


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "../niu-app-android/docs/android-privacy-policy.md")
    title, updated, body = render(source.read_text(encoding="utf-8"))
    page = (ROOT / "privacy.template.html").read_text(encoding="utf-8")
    page = page.replace("{{title}}", html.escape(title)).replace("{{updated}}", html.escape(updated)).replace("{{body}}", body)
    (ROOT / "privacy.html").write_text(page, encoding="utf-8")
    print(f"privacy.html ← {source} ({updated})")


if __name__ == "__main__":
    main()
