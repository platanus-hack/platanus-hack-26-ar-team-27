"""Attachment parsing and validation for the diagnostic flow."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from app.schemas.gtm import SourceFile

MAX_ATTACHMENTS = 3
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_CHARS_PER_FILE = 15_000
MAX_TOTAL_CHARS = 30_000

_PDF_TYPES = {"application/pdf"}
_MARKDOWN_TYPES = {"text/markdown", "text/x-markdown", "application/x-markdown"}
_TEXT_TYPES = {"text/plain"}


class AttachmentValidationError(ValueError):
    """Raised when an attachment is invalid or cannot be parsed."""


class AttachmentContextFile(BaseModel):
    name: str
    content_type: str | None = None
    text: str


@dataclass(slots=True)
class AttachmentUpload:
    name: str
    content_type: str | None
    data: bytes


@dataclass(slots=True)
class ParsedAttachments:
    files_metadata: list[SourceFile]
    attachment_context: list[AttachmentContextFile]


async def parse_upload_files(files: list[UploadFile]) -> ParsedAttachments:
    uploads: list[AttachmentUpload] = []
    for file in files:
        data = await file.read()
        uploads.append(
            AttachmentUpload(
                name=file.filename or "attachment",
                content_type=file.content_type,
                data=data,
            )
        )
        await file.close()
    return parse_attachment_uploads(uploads)


def parse_attachment_uploads(files: list[AttachmentUpload]) -> ParsedAttachments:
    if len(files) > MAX_ATTACHMENTS:
        raise AttachmentValidationError(
            f"Too many attachments. You can upload up to {MAX_ATTACHMENTS} files."
        )

    files_metadata: list[SourceFile] = []
    attachment_context: list[AttachmentContextFile] = []
    remaining_total = MAX_TOTAL_CHARS

    for file in files:
        file_kind = _detect_file_kind(file.name, file.content_type)
        size_bytes = len(file.data)
        if size_bytes > MAX_FILE_BYTES:
            raise AttachmentValidationError(
                f"File '{file.name}' exceeds the 5 MB limit."
            )

        text = _extract_text(file_kind, file.data, file.name).strip()
        if not text:
            raise AttachmentValidationError(
                f"File '{file.name}' does not contain extractable text."
            )

        note: str | None = None
        if len(text) > MAX_CHARS_PER_FILE:
            text = text[:MAX_CHARS_PER_FILE]
            note = _append_note(note, f"text truncated to {MAX_CHARS_PER_FILE} chars")

        excerpt = text
        if len(excerpt) > remaining_total:
            excerpt = excerpt[:remaining_total]
            note = _append_note(note, f"shared attachment context capped at {MAX_TOTAL_CHARS} chars")
        elif remaining_total == 0:
            excerpt = ""
            note = _append_note(note, f"shared attachment context capped at {MAX_TOTAL_CHARS} chars")

        metadata = SourceFile(
            name=file.name,
            content_type=file.content_type,
            size_bytes=size_bytes,
            note=note,
        )
        files_metadata.append(metadata)

        if excerpt:
            attachment_context.append(
                AttachmentContextFile(
                    name=file.name,
                    content_type=file.content_type,
                    text=excerpt,
                )
            )

        remaining_total = max(0, remaining_total - len(excerpt))

    return ParsedAttachments(
        files_metadata=files_metadata,
        attachment_context=attachment_context,
    )


def _detect_file_kind(
    filename: str,
    content_type: str | None,
) -> Literal["pdf", "md", "txt"]:
    extension = Path(filename).suffix.lower()
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()

    if extension == ".pdf" or normalized_type in _PDF_TYPES:
        return "pdf"
    if extension == ".md" or normalized_type in _MARKDOWN_TYPES:
        return "md"
    if extension == ".txt" or normalized_type in _TEXT_TYPES:
        return "txt"

    raise AttachmentValidationError(
        f"Unsupported file '{filename}'. Allowed formats: PDF, MD, TXT."
    )


def _extract_text(file_kind: Literal["pdf", "md", "txt"], data: bytes, filename: str) -> str:
    if file_kind == "pdf":
        return _extract_pdf_text(data, filename)
    return _decode_text(data)


def _extract_pdf_text(data: bytes, filename: str) -> str:
    try:
        reader = PdfReader(BytesIO(data))
    except Exception as exc:  # pragma: no cover - pypdf error details vary
        raise AttachmentValidationError(f"Could not parse PDF '{filename}'.") from exc

    chunks: list[str] = []
    for page in reader.pages:
        chunks.append(page.extract_text() or "")

    text = "\n".join(chunk.strip() for chunk in chunks if chunk and chunk.strip())
    if not text:
        raise AttachmentValidationError(
            f"Could not extract text from PDF '{filename}'."
        )
    return text


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def _append_note(current: str | None, message: str) -> str:
    if current:
        return f"{current}; {message}"
    return message
