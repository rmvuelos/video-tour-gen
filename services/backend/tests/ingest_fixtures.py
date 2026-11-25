"""Fixtures generated in code: no binaries live in the repo."""

import io
import struct
import zlib

import pikepdf
import pypdfium2 as pdfium
from PIL import Image

PNG_SIGNATURE = bytes.fromhex("89504e470d0a1a0a")


def image_bytes(fmt: str, size: tuple[int, int] = (64, 48), **save: object) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(out, fmt, **save)
    return out.getvalue()


def pdf_bytes(pages: int = 3, size: tuple[int, int] = (595, 842)) -> bytes:
    pdf = pdfium.PdfDocument.new()
    for _ in range(pages):
        pdf.new_page(*size)
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def encrypted_pdf_bytes() -> bytes:
    out = io.BytesIO()
    with pikepdf.open(io.BytesIO(pdf_bytes(1))) as pdf:
        pdf.save(out, encryption=pikepdf.Encryption(owner="o", user="u"))
    return out.getvalue()


def _png_chunk(tag: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body))


def png_header_only(width: int, height: int) -> bytes:
    """A PNG that declares a size but carries no pixel data (a decompression bomb probe)."""
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return PNG_SIGNATURE + _png_chunk(b"IHDR", header) + _png_chunk(b"IEND", b"")


def mpo_bytes(size: tuple[int, int] = (64, 48)) -> bytes:
    """Multi-picture JPEG as written by some cameras (two frames)."""
    first = Image.new("RGB", size, (200, 30, 30))
    out = io.BytesIO()
    first.save(out, "MPO", save_all=True, append_images=[Image.new("RGB", size, (0, 0, 255))])
    return out.getvalue()
