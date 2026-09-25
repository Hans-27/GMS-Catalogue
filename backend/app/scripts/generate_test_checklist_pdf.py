"""Generate the printable platform QA checklist PDF from its Markdown source."""

from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "PLATFORM_TEST_CHECKLIST.md"
OUTPUT = ROOT / "GMS_PLATFORM_TEST_CHECKLIST.pdf"
GREEN = colors.HexColor("#08683A")
PALE_GREEN = colors.HexColor("#EDF7F0")
INK = colors.HexColor("#14271D")
MUTED = colors.HexColor("#607168")


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("**", "")
        .replace("`", "")
    )


def footer(canvas, document) -> None:
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(colors.HexColor("#C9DDD0"))
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 9 * mm, "GMS Catalogue Platform — Release QA")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"Page {document.page}")
    canvas.restoreState()


def build() -> None:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "ChecklistTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=24, leading=29, textColor=GREEN, alignment=TA_CENTER,
        spaceAfter=8 * mm,
    )
    section = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=15, leading=19, textColor=GREEN, spaceBefore=6 * mm,
        spaceAfter=3 * mm, keepWithNext=True,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=9.3, leading=13, textColor=INK, spaceAfter=2.2 * mm,
    )
    check = ParagraphStyle(
        "Check", parent=body, leftIndent=7 * mm, firstLineIndent=-7 * mm,
        spaceAfter=2.5 * mm,
    )
    subcheck = ParagraphStyle(
        "Subcheck", parent=check, leftIndent=14 * mm, firstLineIndent=-7 * mm,
    )
    code = ParagraphStyle(
        "Code", parent=body, fontName="Courier", fontSize=8, leading=11,
        leftIndent=5 * mm, rightIndent=5 * mm, backColor=colors.HexColor("#F2F5F3"),
        borderPadding=4 * mm, spaceBefore=2 * mm, spaceAfter=3 * mm,
    )

    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=19 * mm,
        title="GMS Catalogue Platform Test Checklist",
        author="GMS Catalogue Platform",
    )
    story = []
    in_code = False
    code_lines: list[str] = []
    first_heading = True

    for raw in SOURCE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Paragraph("<br/>".join(escape(item) for item in code_lines), code))
                code_lines = []
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(line or " ")
            continue
        if line.startswith("# "):
            story.append(Spacer(1, 7 * mm))
            story.append(Paragraph(escape(line[2:]), title))
            story.append(Table(
                [["Release acceptance", "Regression testing", "123 checks"]],
                colWidths=[55 * mm, 55 * mm, 45 * mm],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), PALE_GREEN),
                    ("TEXTCOLOR", (0, 0), (-1, -1), GREEN),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#B9D8C4")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CFE3D6")),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]),
            ))
            story.append(Spacer(1, 5 * mm))
        elif line.startswith("## "):
            if not first_heading:
                story.append(Spacer(1, 1 * mm))
            first_heading = False
            story.append(Paragraph(escape(line[3:]), section))
        elif re.match(r"^\s*- \[ \] ", line):
            indent = len(line) - len(line.lstrip())
            text = re.sub(r"^\s*- \[ \] ", "", line)
            story.append(Paragraph(f"&#9744;&nbsp;&nbsp;{escape(text)}", subcheck if indent else check))
        elif re.match(r"^\s*- ", line):
            indent = len(line) - len(line.lstrip())
            text = re.sub(r"^\s*- ", "", line)
            story.append(Paragraph(f"•&nbsp;&nbsp;{escape(text)}", subcheck if indent else check))
        elif line:
            story.append(Paragraph(escape(line), body))
        else:
            story.append(Spacer(1, 1.5 * mm))

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    build()
