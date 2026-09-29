"""Word (.doc/.docx) → PDF conversion via headless LibreOffice."""
import logging
import os
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

WORD_EXTENSIONS = {
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


class DocumentConversionError(Exception):
    pass


def word_extension_for(content_type: str | None, filename: str | None) -> str | None:
    """Return ".doc"/".docx" if the upload is a Word document, else None. Falls back to the
    filename extension since some browsers send an empty/generic content type for Word files."""
    if content_type in WORD_EXTENSIONS:
        return WORD_EXTENSIONS[content_type]
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if ext in (".doc", ".docx") else None


def convert_word_to_pdf(data: bytes, extension: str, soffice_path: str, timeout: int = 60) -> bytes:
    """Convert Word document bytes to PDF bytes. Each call uses its own temp LibreOffice profile
    so concurrent conversions don't fight over the shared user profile lock (which makes
    soffice silently exit or hang)."""
    with tempfile.TemporaryDirectory(prefix="docconv-") as tmp:
        src = Path(tmp) / f"input{extension}"
        src.write_bytes(data)
        profile_uri = (Path(tmp) / "lo-profile").as_uri()
        cmd = [
            soffice_path,
            f"-env:UserInstallation={profile_uri}",
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            tmp,
            str(src),
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        except FileNotFoundError:
            raise DocumentConversionError(
                f"LibreOffice not found at '{soffice_path}'. Install LibreOffice or set LIBREOFFICE_PATH."
            )
        except subprocess.TimeoutExpired:
            raise DocumentConversionError("Document conversion timed out")

        out = Path(tmp) / "input.pdf"
        if result.returncode != 0 or not out.exists():
            logger.error(
                "LibreOffice conversion failed (rc=%s): %s",
                result.returncode,
                result.stderr.decode(errors="replace")[:1000],
            )
            raise DocumentConversionError("Could not convert the Word document to PDF")
        return out.read_bytes()
