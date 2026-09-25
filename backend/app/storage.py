import hashlib
import io
import json
import re
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader

from app.config import settings


SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
COVER_TYPES = {**IMAGE_TYPES, "application/pdf": ".pdf"}
COVER_ASSET_TYPES = {**IMAGE_TYPES, "image/svg+xml": ".svg"}
UNSAFE_SVG_TEXT = re.compile(r"<!DOCTYPE|<!ENTITY|javascript:|expression\s*\(|@import", re.IGNORECASE)


@dataclass
class StoredMedia:
    storage_key: str
    preview_storage_key: str | None
    original_filename: str
    mime_type: str
    file_size: int
    width: int | None
    height: int | None
    checksum: str
    duration_seconds: float | None = None


VIDEO_EXTENSIONS = {"video/mp4": ".mp4", "video/webm": ".webm"}
DESIGN_ASSET_TYPES = {
    **IMAGE_TYPES,
    "application/pdf": ".pdf",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, key: str) -> Path:
        if not key or Path(key).is_absolute() or ".." in Path(key).parts:
            raise HTTPException(status_code=400, detail="Invalid storage key.")
        resolved = (self.root / key).resolve()
        if resolved != self.root and self.root not in resolved.parents:
            raise HTTPException(status_code=400, detail="Invalid storage key.")
        return resolved

    def public_url(self, key: str | None) -> str | None:
        normalized = key.replace(chr(92), "/") if key else None
        return f"/uploads/{normalized}" if normalized else None

    def delete(self, key: str | None) -> None:
        if not key:
            return
        path = self.resolve(key)
        if path.is_file():
            path.unlink()

    async def save_design_asset(self, upload: UploadFile, *, owner_id: uuid.UUID) -> StoredMedia:
        maximum = min(max(settings.max_upload_mb, settings.max_cover_upload_mb), 100) * 1024 * 1024
        content = await upload.read(maximum + 1)
        if not content:
            raise HTTPException(status_code=422, detail="The uploaded file is empty.")
        if len(content) > maximum:
            raise HTTPException(status_code=413, detail="The design asset is too large.")
        original = "".join(
            character for character in Path(upload.filename or "asset").name
            if character.isprintable() and character not in "\r\n\0"
        ).strip()[:255] or "asset"
        mime = (upload.content_type or "").split(";", 1)[0].casefold()
        expected = DESIGN_ASSET_TYPES.get(mime)
        suffix = Path(original).suffix.casefold()
        allowed_suffixes = {".jpg", ".jpeg"} if expected == ".jpg" else {expected}
        if not expected or suffix not in allowed_suffixes:
            raise HTTPException(status_code=415, detail="Use JPG, PNG, WebP, PDF, MP4, or WebM files.")
        width = height = None
        duration = None
        if mime.startswith("image/"):
            try:
                with Image.open(io.BytesIO(content)) as image:
                    image.verify()
                with Image.open(io.BytesIO(content)) as image:
                    width, height = image.size
            except (UnidentifiedImageError, OSError) as error:
                raise HTTPException(status_code=422, detail="The image is invalid or unsafe.") from error
        elif mime == "application/pdf":
            try:
                PdfReader(io.BytesIO(content))
            except Exception as error:
                raise HTTPException(status_code=422, detail="The PDF is invalid.") from error
        elif mime == "video/mp4" and (len(content) < 8 or content[4:8] != b"ftyp"):
            raise HTTPException(status_code=422, detail="The MP4 file signature is invalid.")
        elif mime == "video/webm" and not content.startswith(b"\x1a\x45\xdf\xa3"):
            raise HTTPException(status_code=422, detail="The WebM file signature is invalid.")

        token = uuid.uuid4().hex
        safe_stem = SAFE_NAME.sub("-", Path(original).stem).strip("-.")[:70] or "asset"
        key = f"design-assets/{owner_id}/{token}-{safe_stem}{expected}"
        target = self.resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return StoredMedia(
            key, None, original, mime, len(content), width, height,
            hashlib.sha256(content).hexdigest(), duration,
        )

    async def save_product_video(
        self,
        upload: UploadFile,
        *,
        product_id: uuid.UUID,
    ) -> StoredMedia:
        """Stream a validated MP4/WebM to private storage without buffering it."""
        original = "".join(
            character
            for character in Path(upload.filename or "product-video").name
            if character.isprintable() and character not in "\r\n\0"
        ).strip()[:255] or "product-video"
        mime = (upload.content_type or "").split(";", 1)[0].casefold()
        extension = Path(original).suffix.casefold()
        expected = VIDEO_EXTENSIONS.get(mime)
        if mime not in settings.allowed_product_video_types or not expected or extension != expected:
            raise HTTPException(status_code=415, detail="This video format is not supported. Use MP4 or WebM.")

        token = uuid.uuid4().hex
        safe_stem = SAFE_NAME.sub("-", Path(original).stem).strip("-.")[:70] or "product-video"
        key = f"{product_id}/{token}-{safe_stem}{expected}"
        target = self.resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        maximum = settings.product_video_max_size_mb * 1024 * 1024
        total = 0
        digest = hashlib.sha256()
        first = b""
        try:
            with target.open("xb") as stream:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    if not first:
                        first = chunk[:16]
                    total += len(chunk)
                    if total > maximum:
                        raise HTTPException(
                            status_code=413,
                            detail=f"The video exceeds the maximum allowed size of {settings.product_video_max_size_mb} MB.",
                        )
                    digest.update(chunk)
                    stream.write(chunk)
            if not total:
                raise HTTPException(status_code=422, detail="The uploaded video is empty.")
            valid_signature = (
                mime == "video/mp4" and len(first) >= 8 and first[4:8] == b"ftyp"
            ) or (
                mime == "video/webm" and first.startswith(b"\x1a\x45\xdf\xa3")
            )
            if not valid_signature:
                raise HTTPException(status_code=422, detail="The video file signature does not match its format.")
        except Exception:
            if target.exists():
                target.unlink()
            raise
        finally:
            await upload.close()
        try:
            duration, width, height = self._probe_video(target)
            if duration is not None and duration > settings.product_video_max_duration_seconds:
                raise HTTPException(status_code=422, detail=f"The video exceeds the maximum duration of {settings.product_video_max_duration_seconds} seconds.")
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return StoredMedia(key, None, original, mime, total, width, height, digest.hexdigest(), duration)

    @staticmethod
    def _probe_video(path: Path) -> tuple[float | None, int | None, int | None]:
        """Read metadata with ffprobe when installed; uploads remain supported without it."""
        executable = shutil.which("ffprobe")
        if not executable:
            return None, None, None
        try:
            completed = subprocess.run(
                [executable, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path)],
                capture_output=True, text=True, timeout=15, check=False,
            )
            if completed.returncode != 0:
                raise HTTPException(status_code=422, detail="The video file is not a valid playable MP4 or WebM file.")
            payload = json.loads(completed.stdout or "{}")
            stream = (payload.get("streams") or [{}])[0]
            duration_value = (payload.get("format") or {}).get("duration")
            return (float(duration_value) if duration_value else None, int(stream["width"]) if stream.get("width") else None, int(stream["height"]) if stream.get("height") else None)
        except HTTPException:
            raise
        except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.SubprocessError):
            return None, None, None

    async def save_video_thumbnail(
        self,
        upload: UploadFile,
        *,
        product_id: uuid.UUID,
        video_id: uuid.UUID,
    ) -> StoredMedia:
        maximum = min(settings.max_upload_mb, 10) * 1024 * 1024
        content = await upload.read(maximum + 1)
        if not content:
            raise HTTPException(status_code=422, detail="The thumbnail is empty.")
        if len(content) > maximum:
            raise HTTPException(status_code=413, detail="The thumbnail is too large.")
        mime = (upload.content_type or "").split(";", 1)[0].casefold()
        expected = IMAGE_TYPES.get(mime)
        original = Path(upload.filename or "video-thumbnail").name[:255]
        extension = Path(original).suffix.casefold()
        if not expected or extension not in ({".jpg", ".jpeg"} if expected == ".jpg" else {expected}):
            raise HTTPException(status_code=415, detail="Use a JPG, PNG, or WebP thumbnail.")
        try:
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
            with Image.open(io.BytesIO(content)) as image:
                width, height = image.size
        except (UnidentifiedImageError, OSError) as error:
            raise HTTPException(status_code=422, detail="The thumbnail is invalid or unsafe.") from error
        key = f"{product_id}/{video_id}/thumbnail-{uuid.uuid4().hex}{expected}"
        path = self.resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return StoredMedia(key, None, original, mime, len(content), width, height, hashlib.sha256(content).hexdigest())

    async def save_video_caption(self, upload: UploadFile, *, product_id: uuid.UUID, video_id: uuid.UUID) -> StoredMedia:
        content = await upload.read(2 * 1024 * 1024 + 1)
        if not content or len(content) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413 if content else 422, detail="Caption files must be non-empty and no larger than 2 MB.")
        original = Path(upload.filename or "captions.vtt").name[:255]
        if Path(original).suffix.casefold() != ".vtt" or (upload.content_type or "").split(";", 1)[0].casefold() not in {"text/vtt", "text/plain", "application/octet-stream"}:
            raise HTTPException(status_code=415, detail="Use a WebVTT (.vtt) caption file.")
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise HTTPException(status_code=422, detail="The caption file must use UTF-8 encoding.") from error
        if not text.lstrip().startswith("WEBVTT") or "<script" in text.casefold():
            raise HTTPException(status_code=422, detail="The WebVTT caption file is invalid or unsafe.")
        key = f"{product_id}/{video_id}/captions-{uuid.uuid4().hex}.vtt"
        path = self.resolve(key); path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(content)
        return StoredMedia(key, None, original, "text/vtt", len(content), None, None, hashlib.sha256(content).hexdigest())

    async def save_cover(self, upload: UploadFile, *, folder: str = "catalogue-covers") -> StoredMedia:
        content = await upload.read(settings.max_cover_upload_mb * 1024 * 1024 + 1)
        if not content:
            raise HTTPException(status_code=422, detail="The uploaded file is empty.")
        if len(content) > settings.max_cover_upload_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Cover files may not exceed {settings.max_cover_upload_mb} MB.")
        original = "".join(character for character in Path(upload.filename or "cover").name if character.isprintable() and character not in "\r\n\0").strip()[:255] or "cover"
        extension = Path(original).suffix.casefold()
        mime = (upload.content_type or "").casefold()
        expected = COVER_TYPES.get(mime)
        if not expected or extension not in ({".jpg", ".jpeg"} if expected == ".jpg" else {expected}):
            raise HTTPException(status_code=422, detail="Use a JPG, JPEG, PNG, WebP, or single-page PDF file.")

        width = height = None
        preview_bytes: bytes | None = None
        if mime == "application/pdf":
            try:
                reader = PdfReader(io.BytesIO(content))
                if len(reader.pages) != 1:
                    raise HTTPException(status_code=422, detail="The title-page PDF must contain exactly one page.")
            except HTTPException:
                raise
            except Exception as error:
                raise HTTPException(status_code=422, detail="The uploaded PDF is invalid.") from error
        else:
            try:
                with Image.open(io.BytesIO(content)) as image:
                    image.verify()
                with Image.open(io.BytesIO(content)) as image:
                    width, height = image.size
                    if width < settings.min_cover_width or height < settings.min_cover_height:
                        raise HTTPException(status_code=422, detail=f"Cover images must be at least {settings.min_cover_width} x {settings.min_cover_height} pixels.")
                    preview = image.convert("RGB")
                    preview.thumbnail((1600, 1600))
                    preview_stream = io.BytesIO()
                    preview.save(preview_stream, format="WEBP", quality=84, method=6)
                    preview_bytes = preview_stream.getvalue()
            except HTTPException:
                raise
            except (UnidentifiedImageError, OSError) as error:
                raise HTTPException(status_code=422, detail="The uploaded image is invalid or unsafe.") from error

        token = uuid.uuid4().hex
        safe_stem = SAFE_NAME.sub("-", Path(original).stem).strip("-.")[:70] or "cover"
        key = f"{folder}/{token}-{safe_stem}{expected}"
        path = self.resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        preview_key = None
        if preview_bytes:
            preview_key = f"{folder}/previews/{token}.webp"
            preview_path = self.resolve(preview_key)
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            preview_path.write_bytes(preview_bytes)
        return StoredMedia(key, preview_key, original, mime, len(content), width, height, hashlib.sha256(content).hexdigest())

    async def save_cover_asset(
        self,
        upload: UploadFile,
        *,
        catalogue_id: uuid.UUID,
        asset_type: str,
    ) -> StoredMedia:
        """Validate and store a private cover-builder image.

        SVG is accepted only after structural inspection. The original bytes are
        never placed in the source tree or in a publicly mounted upload folder.
        """
        content = await upload.read(settings.max_cover_upload_mb * 1024 * 1024 + 1)
        if not content:
            raise HTTPException(status_code=422, detail="The uploaded image is empty.")
        if len(content) > settings.max_cover_upload_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Cover assets may not exceed {settings.max_cover_upload_mb} MB.")
        original = "".join(character for character in Path(upload.filename or asset_type).name if character.isprintable() and character not in "\r\n\0").strip()[:255] or asset_type
        extension = Path(original).suffix.casefold()
        mime = (upload.content_type or "").split(";", 1)[0].casefold()
        expected = COVER_ASSET_TYPES.get(mime)
        allowed_extensions = {".jpg", ".jpeg"} if expected == ".jpg" else {expected}
        if not expected or extension not in allowed_extensions:
            raise HTTPException(status_code=422, detail="Use a PNG, JPG, JPEG, WebP, or safely structured SVG image.")

        preview_bytes: bytes | None = None
        if mime == "image/svg+xml":
            width, height = self._validate_svg(content)
        else:
            try:
                with Image.open(io.BytesIO(content)) as image:
                    image.verify()
                with Image.open(io.BytesIO(content)) as image:
                    width, height = image.size
                    if width > settings.max_cover_dimension or height > settings.max_cover_dimension:
                        raise HTTPException(status_code=422, detail=f"Image dimensions may not exceed {settings.max_cover_dimension} pixels.")
                    preview = image.convert("RGBA")
                    preview.thumbnail((1800, 1800))
                    preview_stream = io.BytesIO()
                    preview.save(preview_stream, format="WEBP", quality=88, method=6)
                    preview_bytes = preview_stream.getvalue()
            except HTTPException:
                raise
            except (UnidentifiedImageError, OSError, ValueError) as error:
                raise HTTPException(status_code=422, detail="The uploaded image is invalid or unsafe.") from error

        token = uuid.uuid4().hex
        safe_stem = SAFE_NAME.sub("-", Path(original).stem).strip("-.")[:70] or asset_type
        folder = f"{catalogue_id}/{asset_type}"
        key = f"{folder}/{token}-{safe_stem}{expected}"
        path = self.resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        preview_key = None
        if preview_bytes:
            preview_key = f"{folder}/previews/{token}.webp"
            preview_path = self.resolve(preview_key)
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            preview_path.write_bytes(preview_bytes)
        return StoredMedia(key, preview_key, original, mime, len(content), width, height, hashlib.sha256(content).hexdigest())

    @staticmethod
    def _validate_svg(content: bytes) -> tuple[int, int]:
        if UNSAFE_SVG_TEXT.search(content.decode("utf-8", errors="ignore")):
            raise HTTPException(status_code=422, detail="The SVG contains unsafe content.")
        try:
            root = ET.fromstring(content)
        except ET.ParseError as error:
            raise HTTPException(status_code=422, detail="The SVG is not valid XML.") from error
        if root.tag.rsplit("}", 1)[-1].casefold() != "svg":
            raise HTTPException(status_code=422, detail="The uploaded file is not an SVG image.")
        blocked_elements = {"script", "foreignobject", "iframe", "object", "embed", "audio", "video"}
        for node in root.iter():
            if node.tag.rsplit("}", 1)[-1].casefold() in blocked_elements:
                raise HTTPException(status_code=422, detail="The SVG contains an unsafe element.")
            for name, value in node.attrib.items():
                attribute = name.rsplit("}", 1)[-1].casefold()
                normalized = value.strip().casefold()
                if attribute.startswith("on") or (attribute in {"href", "xlink:href"} and normalized and not normalized.startswith("#")):
                    raise HTTPException(status_code=422, detail="The SVG contains an unsafe reference.")
                if ("url(" in normalized and "url(#" not in normalized) or "data:" in normalized:
                    raise HTTPException(status_code=422, detail="The SVG contains an unsafe embedded resource.")
                if attribute == "style" and UNSAFE_SVG_TEXT.search(value):
                    raise HTTPException(status_code=422, detail="The SVG contains unsafe styling.")

        def dimension(name: str) -> float | None:
            raw = root.attrib.get(name, "").strip().casefold().replace("px", "")
            try:
                return float(raw) if raw else None
            except ValueError:
                return None

        width, height = dimension("width"), dimension("height")
        if (not width or not height) and root.attrib.get("viewBox"):
            try:
                _, _, width, height = [float(value) for value in root.attrib["viewBox"].replace(",", " ").split()]
            except (ValueError, TypeError):
                width = height = None
        if not width or not height or width <= 0 or height <= 0:
            raise HTTPException(status_code=422, detail="The SVG must define valid width, height, or viewBox dimensions.")
        if width > settings.max_cover_dimension or height > settings.max_cover_dimension:
            raise HTTPException(status_code=422, detail=f"Image dimensions may not exceed {settings.max_cover_dimension} pixels.")
        return int(round(width)), int(round(height))


storage = LocalStorage(settings.upload_dir)
cover_storage = LocalStorage(settings.cover_upload_dir)
video_storage = LocalStorage(settings.product_video_upload_dir)
# Promotion banners and terms use unguessable keys below the public uploads root.
# Promotion videos remain in the existing private video store and are streamed by API.
promotion_storage = storage
