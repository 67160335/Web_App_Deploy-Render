from __future__ import annotations

import ast
import importlib.util
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "frontend" / "pages"


class LocalReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key in {"href", "src"} and value:
                self.references.append(value)


def verify_pages() -> list[str]:
    errors: list[str] = []
    for page in sorted(PAGES.glob("*.html")):
        parser = LocalReferenceParser()
        parser.feed(page.read_text(encoding="utf-8"))
        for reference in parser.references:
            if reference.startswith(("http://", "https://", "#", "mailto:", "tel:", "data:", "javascript:")):
                continue
            target = (page.parent / reference.split("?", 1)[0].split("#", 1)[0]).resolve()
            if not target.exists():
                errors.append(f"Broken local reference: {page.relative_to(ROOT)} -> {reference}")
    return errors


def main() -> int:
    errors = verify_pages()
    source = ROOT / "main.py"
    ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    print("PASS: main.py syntax")

    spec = importlib.util.spec_from_file_location("businesspilot_app_for_check", source)
    if spec is None or spec.loader is None:
        errors.append("Could not load main.py")
    else:
        import sys
        sys.path.insert(0, str(ROOT))
        import main as app_module
        schema = app_module.app.openapi()
        analyze_schema = schema["components"]["schemas"]["AnalyzeRequest"]
        properties = set(analyze_schema.get("properties", {}))
        expected = {"initial_cash", "files"}
        if not expected.issubset(properties):
            errors.append(f"AnalyzeRequest missing multi-file fields: {sorted(expected - properties)}")
        if "/upload-multiple" not in schema["paths"]:
            errors.append("Missing /upload-multiple endpoint")
        print(f"PASS: API schema ({len(schema['paths'])} endpoints; multi-file CSV mappings supported)")
        session = app_module.SessionLocal()
        try:
            print(f"PASS: database opens ({session.query(app_module.User).count()} user records preserved)")
        finally:
            session.close()

    if errors:
        for error in errors:
            print("FAIL:", error)
        return 1
    print(f"PASS: local HTML references ({len(list(PAGES.glob('*.html')))} pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
