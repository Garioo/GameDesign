import { loadSchedule, mutateSchedule } from "@/lib/ganttRepo";
import type { BoardCard } from "@/lib/boardRepo";

/** Fields the board's task editor saves in one go (same call as the classic task dialog). */
export interface CardPatch {
  title?: string;
  sub?: string;
  kind?: string;
  category_id?: string | null;
  priority?: string | null;
  owners?: string[];
  column_id?: string;
}

/** Save a task's fields. Changing column_id to another board's stage moves it to that board. */
export async function saveCard(workspaceId: string, card: BoardCard, columnId: string, patch: CardPatch): Promise<void> {
  const snapshot = await loadSchedule(workspaceId);
  await mutateSchedule(workspaceId, snapshot, {
    op: "card",
    card: {
      id: card.id,
      title: card.title,
      sub: card.sub,
      kind: card.kind,
      category_id: card.categoryId ?? null,
      tags: card.tags,
      priority: card.priority,
      owners: card.ownerIds,
      column_id: columnId,
      ...patch,
    },
  });
}
