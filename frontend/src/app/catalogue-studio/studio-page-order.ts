export type StudioPageDropPosition = "before" | "after";

type StructuredStudioPage = { id: string; page_type: string };

function structureRank(pageType: string) {
  if (pageType === "cover") return 0;
  if (pageType === "promotion") return 1;
  return 2;
}

/** Keep cover, optional promotions, then catalogue content while preserving order inside each group. */
export function structuredStudioPageIds(pages: StructuredStudioPage[]): string[] {
  return pages
    .map((page, index) => ({ page, index }))
    .sort((left, right) => structureRank(left.page.page_type) - structureRank(right.page.page_type) || left.index - right.index)
    .map(({ page }) => page.id);
}

export function reorderStudioPageIds(
  pageIds: string[],
  draggedId: string,
  targetId: string,
  position: StudioPageDropPosition,
): string[] {
  if (draggedId === targetId || !pageIds.includes(draggedId) || !pageIds.includes(targetId)) return pageIds;

  const reordered = pageIds.filter((id) => id !== draggedId);
  const targetIndex = reordered.indexOf(targetId);
  reordered.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, draggedId);

  return reordered.every((id, index) => id === pageIds[index]) ? pageIds : reordered;
}

export function reorderStructuredStudioPageIds(
  pages: StructuredStudioPage[],
  draggedId: string,
  targetId: string,
  position: StudioPageDropPosition,
): string[] {
  const reorderedIds = reorderStudioPageIds(pages.map((page) => page.id), draggedId, targetId, position);
  const byId = new Map(pages.map((page) => [page.id, page]));
  return structuredStudioPageIds(reorderedIds.map((id) => byId.get(id)).filter((page): page is StructuredStudioPage => Boolean(page)));
}
