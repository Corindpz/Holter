from io import BytesIO
from pathlib import Path
from typing import Dict, Any
from jinja2 import Environment, FileSystemLoader
from xhtml2pdf import pisa


_TEMPLATE_DIR = Path(__file__).parent / "templates"


def generate_pdf(data: Dict[str, Any]) -> bytes:
    env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)))
    template = env.get_template("report.html")
    html_str = template.render(**data)
    buf = BytesIO()
    result = pisa.CreatePDF(html_str, dest=buf, encoding="utf-8")
    if result.err:
        raise RuntimeError(f"PDF generation error: {result.err}")
    return buf.getvalue()
