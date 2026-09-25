from pathlib import Path


COMPANY_NAME = "G.M.S. Corporation Co., Ltd."
SHORT_NAME = "GMS"
APPLICATION_NAME = "GMS Catalogue Platform"
LOGO_ALT_TEXT = COMPANY_NAME
LOGO_VERSION = "gms-corporation-logo-v1"
LOGO_FILENAME = f"{LOGO_VERSION}.jpg"
LOGO_PATH = (Path(__file__).resolve().parent / "static" / "branding" / LOGO_FILENAME).resolve()


def default_logo_path() -> Path | None:
    """Return the packaged logo without exposing a filesystem path through the API."""
    return LOGO_PATH if LOGO_PATH.is_file() else None

