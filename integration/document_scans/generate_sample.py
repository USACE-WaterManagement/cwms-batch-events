"""Generate a synthetic, deliberately untagged accessibility test document."""

from io import BytesIO
from pathlib import Path
import sys

from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor


def sample_pdf(font_path=None):
    regular, bold = "Helvetica", "Helvetica-Bold"
    if font_path:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        pdfmetrics.registerFont(TTFont("EmbeddedSample", str(font_path)))
        regular = bold = "EmbeddedSample"
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(612, 792), invariant=1)
    pdf.setTitle("Synthetic SWT accessibility test")
    pdf.setAuthor("Local test fixture")
    pdf.setFillColor(HexColor("#15324f"))
    pdf.rect(0, 680, 612, 112, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#ffffff"))
    pdf.setFont(bold, 22)
    pdf.drawString(48, 731, "SWT document scan sample")
    pdf.setFont(regular, 11)
    pdf.drawString(
        48, 708, "Synthetic data - deliberately missing PDF accessibility tags"
    )
    pdf.setFillColor(HexColor("#15324f"))
    pdf.setFont(bold, 15)
    pdf.drawString(48, 640, "Example inspection summary")
    pdf.setFont(regular, 12)
    for index, line in enumerate(
        [
            "This document is a local scanner test fixture, not an operational report.",
            "Example site: Sample Lake. Inspection date: January 15, 2026.",
            "Observation: The sample walkway is clear and the gauge is readable.",
            "Expected scanner outcome: automated accessibility findings.",
            "The file intentionally omits document tags and a language declaration.",
            "A visually readable PDF can still fail machine accessibility checks.",
        ]
    ):
        pdf.drawString(48, 605 - index * 25, line)
    pdf.setFont(regular, 10)
    pdf.drawString(48, 48, "Test use only | No real user or document content | Page 1")
    pdf.save()
    return output.getvalue()


if __name__ == "__main__":
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(sample_pdf())
    print(target)
