from typing import Literal

from pydantic import BaseModel, Field


class GlobalSearchItem(BaseModel):
    kind: Literal["product", "catalogue", "promotion", "brand", "category"]
    id: str
    title: str
    subtitle: str = ""
    href: str
    search_value: str = ""


class GlobalSearchResponse(BaseModel):
    query: str
    groups: dict[str, list[GlobalSearchItem]] = Field(default_factory=dict)
    total: int = 0

