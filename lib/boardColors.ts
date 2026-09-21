/** Every board is created with this shared gray, so on its own it cannot tell boards apart. */
export const DEFAULT_BOARD_COLOR = "#64748b";

/** Distinct mid-tone hues that stay legible as dots, borders and tinted bars on the warm light theme. */
export const BOARD_PALETTE = ["#2f6fb0", "#3f8f5a", "#8a4fb5", "#c7477a", "#b8801a", "#1f8f8f", "#b5432c", "#6b7a3d"];

/** A board keeps a custom color; boards still on the default gray get a stable palette color by position. */
export function boardColor(board: { id: string; color: string }, boards: { id: string }[]) {
  if (board.color && board.color.toLowerCase() !== DEFAULT_BOARD_COLOR) return board.color;
  const index = boards.findIndex(b => b.id === board.id);
  return BOARD_PALETTE[Math.max(index, 0) % BOARD_PALETTE.length];
}
