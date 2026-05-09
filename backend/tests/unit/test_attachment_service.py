from __future__ import annotations

from app.services.attachment_service import (
    AttachmentUpload,
    AttachmentValidationError,
    MAX_CHARS_PER_FILE,
    MAX_TOTAL_CHARS,
    MAX_ATTACHMENTS,
    MAX_FILE_BYTES,
    parse_attachment_uploads,
)


def test_parse_txt_attachment():
    parsed = parse_attachment_uploads(
        [
            AttachmentUpload(
                name="brief.txt",
                content_type="text/plain",
                data=b"Hello from txt",
            )
        ]
    )

    assert parsed.files_metadata[0].name == "brief.txt"
    assert parsed.files_metadata[0].size_bytes == len(b"Hello from txt")
    assert parsed.attachment_context[0].text == "Hello from txt"


def test_parse_markdown_attachment():
    parsed = parse_attachment_uploads(
        [
            AttachmentUpload(
                name="deck.md",
                content_type="text/markdown",
                data="# Title\n\nICP details".encode("utf-8"),
            )
        ]
    )

    assert parsed.attachment_context[0].text == "# Title\n\nICP details"


def test_parse_pdf_attachment():
    parsed = parse_attachment_uploads(
        [
            AttachmentUpload(
                name="deck.pdf",
                content_type="application/pdf",
                data=_build_pdf_bytes("Hello PDF"),
            )
        ]
    )

    assert "Hello PDF" in parsed.attachment_context[0].text


def test_rejects_unsupported_type():
    try:
        parse_attachment_uploads(
            [
                AttachmentUpload(
                    name="deck.docx",
                    content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    data=b"nope",
                )
            ]
        )
    except AttachmentValidationError as exc:
        assert "Allowed formats: PDF, MD, TXT" in str(exc)
    else:  # pragma: no cover - explicit failure branch
        raise AssertionError("expected AttachmentValidationError")


def test_rejects_file_too_large():
    data = b"a" * (MAX_FILE_BYTES + 1)

    try:
        parse_attachment_uploads(
            [AttachmentUpload(name="big.txt", content_type="text/plain", data=data)]
        )
    except AttachmentValidationError as exc:
        assert "5 MB limit" in str(exc)
    else:  # pragma: no cover - explicit failure branch
        raise AssertionError("expected AttachmentValidationError")


def test_rejects_more_than_three_files():
    uploads = [
        AttachmentUpload(name=f"file-{idx}.txt", content_type="text/plain", data=b"x")
        for idx in range(MAX_ATTACHMENTS + 1)
    ]

    try:
        parse_attachment_uploads(uploads)
    except AttachmentValidationError as exc:
        assert "up to 3 files" in str(exc)
    else:  # pragma: no cover - explicit failure branch
        raise AssertionError("expected AttachmentValidationError")


def test_truncates_per_file_and_total_context():
    uploads = [
        AttachmentUpload(
            name="long.txt",
            content_type="text/plain",
            data=("a" * (MAX_CHARS_PER_FILE + 50)).encode("utf-8"),
        ),
        AttachmentUpload(
            name="mid.txt",
            content_type="text/plain",
            data=("b" * 10_000).encode("utf-8"),
        ),
        AttachmentUpload(
            name="tail.txt",
            content_type="text/plain",
            data=("c" * 10_000).encode("utf-8"),
        ),
    ]

    parsed = parse_attachment_uploads(uploads)

    assert len(parsed.attachment_context[0].text) == MAX_CHARS_PER_FILE
    assert parsed.files_metadata[0].note == f"text truncated to {MAX_CHARS_PER_FILE} chars"
    assert len(parsed.attachment_context[1].text) == 10_000
    assert len(parsed.attachment_context[2].text) == MAX_TOTAL_CHARS - MAX_CHARS_PER_FILE - 10_000
    assert parsed.files_metadata[2].note == f"shared attachment context capped at {MAX_TOTAL_CHARS} chars"
    assert sum(len(item.text) for item in parsed.attachment_context) == MAX_TOTAL_CHARS


def _build_pdf_bytes(text: str) -> bytes:
    stream = f"BT\n/F1 24 Tf\n72 120 Td\n({text}) Tj\nET".encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    chunks = [b"%PDF-1.4\n"]
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("latin-1"))
        chunks.append(obj)
        chunks.append(b"\nendobj\n")

    xref_offset = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets:
        chunks.append(f"{offset:010d} 00000 n \n".encode("latin-1"))
    chunks.append(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("latin-1")
    )
    return b"".join(chunks)
