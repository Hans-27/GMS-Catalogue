import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


FeedbackType = Literal[
    "bug",
    "improvement",
    "new_feature",
    "ui_change",
    "workflow_change",
    "permission_change",
    "report_request",
]
FeedbackPriority = Literal["low", "medium", "high"]
FeedbackStatus = Literal[
    "new", "under_review", "accepted", "rejected", "completed"
]


class FeedbackCreate(BaseModel):
    module_page: str = Field(min_length=2, max_length=160)
    feedback_type: FeedbackType
    title: str = Field(min_length=3, max_length=220)
    description: str = Field(min_length=5, max_length=20_000)
    suggested_change: str = Field(default="", max_length=20_000)
    priority: FeedbackPriority = "medium"

    @field_validator(
        "module_page", "title", "description", "suggested_change", mode="before"
    )
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class FeedbackManageUpdate(BaseModel):
    priority: FeedbackPriority | None = None
    status: FeedbackStatus | None = None
    internal_note: str | None = Field(default=None, max_length=20_000)
    assigned_to_id: uuid.UUID | None = None
    clear_assignment: bool = False

    @field_validator("internal_note", mode="before")
    @classmethod
    def strip_note(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def ensure_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one management field is required.")
        if self.clear_assignment and self.assigned_to_id is not None:
            raise ValueError("Choose an assignee or clear the assignment, not both.")
        return self


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    module_page: str
    feedback_type: FeedbackType
    title: str
    description: str
    suggested_change: str
    priority: FeedbackPriority
    status: FeedbackStatus
    internal_note: str
    screenshot_original_name: str | None
    screenshot_url: str | None
    screenshot_content_type: str | None
    screenshot_size: int | None
    submitted_by_id: uuid.UUID | None
    submitted_by_name: str
    assigned_to_id: uuid.UUID | None
    assigned_to_name: str | None
    created_at: datetime
    updated_at: datetime


class FeedbackPage(BaseModel):
    items: list[FeedbackResponse]
    total: int
    page: int
    page_size: int
    pages: int
