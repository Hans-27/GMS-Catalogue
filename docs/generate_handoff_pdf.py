"""Generate the current GMS platform handoff as a styled PDF."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "GMS-Platform-Handoff-2026-09-21.pdf"

GREEN = colors.HexColor("#0B5A36")
DARK_GREEN = colors.HexColor("#073D28")
MINT = colors.HexColor("#EAF5EE")
PALE = colors.HexColor("#F6FAF7")
INK = colors.HexColor("#13251C")
MUTED = colors.HexColor("#587064")
BORDER = colors.HexColor("#C9DBD0")
AMBER = colors.HexColor("#9A6200")
PALE_AMBER = colors.HexColor("#FFF7E3")


def register_fonts() -> None:
    regular = Path("C:/Windows/Fonts/arial.ttf")
    bold = Path("C:/Windows/Fonts/arialbd.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("GMSArial", str(regular)))
        pdfmetrics.registerFont(TTFont("GMSArial-Bold", str(bold)))
    else:
        pdfmetrics.registerFontFamily(
            "GMSArial",
            normal="Helvetica",
            bold="Helvetica-Bold",
        )


def inline_markup(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(
        r"`([^`]+)`",
        r'<font color="#0B5A36"><b>\1</b></font>',
        escaped,
    )


def render_markdown(path: Path, styles: dict[str, ParagraphStyle]) -> list:
    story: list = []
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))
        story.append(Spacer(1, 2.5 * mm))
        paragraph_lines.clear()

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            continue
        if line.startswith("# "):
            flush_paragraph()
            continue
        if line.startswith("## "):
            flush_paragraph()
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph(inline_markup(line[3:]), styles["section"]))
            story.append(Spacer(1, 1.5 * mm))
            continue
        if re.match(r"^\d+\.\s", line):
            flush_paragraph()
            number, text = line.split(".", 1)
            story.append(
                Paragraph(
                    f'<font color="#0B5A36"><b>{number}.</b></font> {inline_markup(text.strip())}',
                    styles["numbered"],
                )
            )
            continue
        if line.startswith("- "):
            flush_paragraph()
            story.append(
                Paragraph(
                    f'<font color="#0B5A36"><b>•</b></font> {inline_markup(line[2:])}',
                    styles["bullet"],
                )
            )
            continue
        paragraph_lines.append(line)

    flush_paragraph()
    return story


def page_chrome(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, height - 15 * mm, width - doc.rightMargin, height - 15 * mm)
    canvas.setFont("GMSArial-Bold", 8)
    canvas.setFillColor(GREEN)
    canvas.drawString(doc.leftMargin, height - 11.5 * mm, "GMS CATALOGUE PLATFORM")
    canvas.setFont("GMSArial", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - doc.rightMargin, height - 11.5 * mm, "Development handoff")
    canvas.line(doc.leftMargin, 14 * mm, width - doc.rightMargin, 14 * mm)
    canvas.drawString(doc.leftMargin, 9.5 * mm, "Prepared 21 September 2026")
    canvas.drawRightString(width - doc.rightMargin, 9.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf() -> Path:
    register_fonts()
    samples = getSampleStyleSheet()
    styles = {
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=samples["Normal"],
            fontName="GMSArial-Bold",
            fontSize=9,
            leading=12,
            textColor=GREEN,
            alignment=TA_CENTER,
            spaceAfter=4 * mm,
            uppercase=True,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=samples["Title"],
            fontName="GMSArial-Bold",
            fontSize=28,
            leading=33,
            textColor=DARK_GREEN,
            alignment=TA_CENTER,
            spaceAfter=5 * mm,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=samples["Normal"],
            fontName="GMSArial",
            fontSize=11,
            leading=17,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=samples["Heading2"],
            fontName="GMSArial-Bold",
            fontSize=16,
            leading=20,
            textColor=DARK_GREEN,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=samples["BodyText"],
            fontName="GMSArial",
            fontSize=9.2,
            leading=13.5,
            textColor=INK,
            alignment=TA_LEFT,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=samples["BodyText"],
            fontName="GMSArial",
            fontSize=8.9,
            leading=12.8,
            textColor=INK,
            leftIndent=5 * mm,
            firstLineIndent=-4 * mm,
            spaceAfter=1.3 * mm,
            wordWrap="CJK",
        ),
        "numbered": ParagraphStyle(
            "Numbered",
            parent=samples["BodyText"],
            fontName="GMSArial",
            fontSize=8.9,
            leading=12.8,
            textColor=INK,
            leftIndent=7 * mm,
            firstLineIndent=-6 * mm,
            spaceAfter=1.6 * mm,
            wordWrap="CJK",
        ),
        "cardTitle": ParagraphStyle(
            "CardTitle",
            parent=samples["BodyText"],
            fontName="GMSArial-Bold",
            fontSize=9,
            leading=12,
            textColor=MUTED,
        ),
        "cardValue": ParagraphStyle(
            "CardValue",
            parent=samples["BodyText"],
            fontName="GMSArial-Bold",
            fontSize=12,
            leading=15,
            textColor=DARK_GREEN,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=samples["BodyText"],
            fontName="GMSArial",
            fontSize=9.5,
            leading=14,
            textColor=AMBER,
            wordWrap="CJK",
        ),
    }

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title="GMS Catalogue Platform Development Handoff",
        author="GMS Catalogue Platform",
        subject="Development handoff and continuation guide",
    )

    story: list = [
        Spacer(1, 25 * mm),
        Paragraph("ENGINEERING CONTINUITY PACK", styles["eyebrow"]),
        Paragraph("GMS Catalogue Platform<br/>Development Handoff", styles["title"]),
        Paragraph(
            "Current implementation state, verified work, operational cautions, and the next safe actions for the receiving engineer.",
            styles["subtitle"],
        ),
        Spacer(1, 14 * mm),
    ]

    status_table = Table(
        [
            [Paragraph("TRANSFER STATE", styles["cardTitle"]), Paragraph("BRANCH", styles["cardTitle"]), Paragraph("HEAD", styles["cardTitle"])],
            [Paragraph("HANDED OFF", styles["cardValue"]), Paragraph("master", styles["cardValue"]), Paragraph("74a20ca", styles["cardValue"])],
        ],
        colWidths=[55 * mm, 55 * mm, 48 * mm],
        rowHeights=[10 * mm, 15 * mm],
    )
    status_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), MINT),
                ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    story.extend(
        [
            status_table,
            Spacer(1, 12 * mm),
            Table(
                [[Paragraph(
                    "Important: the working tree contains mixed, uncommitted source changes and runtime artifacts. Preserve it until ownership and release scope are confirmed.",
                    styles["callout"],
                )]],
                colWidths=[158 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), PALE_AMBER),
                        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#E5B74F")),
                        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
                    ]
                ),
            ),
            Spacer(1, 13 * mm),
            Paragraph("Prepared: 21 September 2026 · Asia/Bangkok", styles["subtitle"]),
            PageBreak(),
        ]
    )

    story.extend(render_markdown(DOCS / "current-state.md", styles))
    story.append(PageBreak())
    story.extend(render_markdown(DOCS / "next-task.md", styles))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Repository safeguards", styles["section"]))
    story.append(Spacer(1, 2 * mm))
    story.extend(render_markdown(DOCS / "agent-handoff.md", styles))

    doc.build(story, onFirstPage=page_chrome, onLaterPages=page_chrome)
    return OUTPUT


if __name__ == "__main__":
    print(build_pdf())
