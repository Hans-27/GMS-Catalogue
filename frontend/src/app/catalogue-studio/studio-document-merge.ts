import type { StudioElement, StudioPageDocument } from "@/lib/studio-api";

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function chooseChangedValue<T>(base: T, local: T, remote: T): T {
  return sameValue(local, base) ? remote : local;
}

/**
 * Three-way merge used when another Studio tab saved a newer revision.
 *
 * In particular, remote-only elements must survive. Without this merge an old
 * tab can retry its whole page after a 409 and silently delete a carousel (or
 * any other element) that was added by the newer tab.
 */
export function mergeStudioDocuments(
  base: StudioPageDocument,
  local: StudioPageDocument,
  remote: StudioPageDocument,
): StudioPageDocument {
  const baseElements = new Map(base.elements.map((element) => [element.id, element]));
  const localElements = new Map(local.elements.map((element) => [element.id, element]));
  const remoteElements = new Map(remote.elements.map((element) => [element.id, element]));
  const orderedIds = [
    ...remote.elements.map((element) => element.id),
    ...local.elements.map((element) => element.id).filter((id) => !remoteElements.has(id)),
  ];
  const elements: StudioElement[] = [];

  for (const id of orderedIds) {
    const original = baseElements.get(id);
    const localElement = localElements.get(id);
    const remoteElement = remoteElements.get(id);

    if (!original) {
      // Added after this tab loaded. Keep additions from either side.
      if (localElement && remoteElement) {
        elements.push(sameValue(localElement, remoteElement) ? remoteElement : localElement);
      } else if (localElement) {
        elements.push(localElement);
      } else if (remoteElement) {
        elements.push(remoteElement);
      }
      continue;
    }

    if (!localElement) {
      // It existed in this tab's base, so its absence is an intentional local deletion.
      continue;
    }
    if (!remoteElement) {
      // Respect a remote deletion unless this tab also edited the element.
      if (!sameValue(localElement, original)) elements.push(localElement);
      continue;
    }

    elements.push(chooseChangedValue(original, localElement, remoteElement));
  }

  return {
    ...remote,
    pageId: chooseChangedValue(base.pageId, local.pageId, remote.pageId),
    pageType: chooseChangedValue(base.pageType, local.pageType, remote.pageType),
    name: chooseChangedValue(base.name, local.name, remote.name),
    dataMode: chooseChangedValue(base.dataMode, local.dataMode, remote.dataMode),
    canvas: {
      ...remote.canvas,
      ...Object.fromEntries(Object.keys(local.canvas).map((key) => {
        const name = key as keyof StudioPageDocument["canvas"];
        return [name, chooseChangedValue(base.canvas[name], local.canvas[name], remote.canvas[name])];
      })),
    },
    elements,
  };
}
