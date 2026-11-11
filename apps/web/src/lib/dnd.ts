/**
 * Small helpers shared by the two drag-and-drop screens (the kitchen board and the
 * admin menu editor). They are plain functions so the moving logic can be reasoned
 * about — and tested — without a browser.
 */

/** A copy of `list` with the item at `from` moved to `to`. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

/** The MIME type the drag carries. Using our own type keeps stray drops from other pages out. */
export const DRAG_TYPE = 'application/x-food-delivery';

export function setDragPayload(event: React.DragEvent, value: string | number) {
  event.dataTransfer.setData(DRAG_TYPE, String(value));
  event.dataTransfer.setData('text/plain', String(value)); // fallback for browsers that insist on it
  event.dataTransfer.effectAllowed = 'move';
}

export function readDragPayload(event: React.DragEvent): string {
  return event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData('text/plain');
}
