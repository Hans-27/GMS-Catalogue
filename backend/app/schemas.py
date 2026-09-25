import uuid
import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=1024)
    remember_me: bool = False

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return value.strip()


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    username: str = Field(
        min_length=3,
        max_length=80,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    email: EmailStr
    password: str = Field(min_length=12, max_length=1024)

    @field_validator("full_name", "username")
    @classmethod
    def strip_text_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("password")
    @classmethod
    def require_strong_password(cls, value: str) -> str:
        checks = (
            re.search(r"[a-z]", value),
            re.search(r"[A-Z]", value),
            re.search(r"\d", value),
            re.search(r"[^A-Za-z0-9]", value),
        )
        if not all(checks):
            raise ValueError(
                "Password must include uppercase, lowercase, number and symbol."
            )
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: EmailStr
    full_name: str
    roles: list[str]
    permissions: list[str]
    effective_permissions: list[str] = []
    is_superadmin: bool = False
    department: str | None = None
    position: str | None = None
    permissions_version: int = 1
    data_scopes: dict = {}


class AuthResponse(BaseModel):
    message: str
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
