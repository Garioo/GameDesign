// Domain types + seed data for the game design documents.
// Local-only for now — no backend yet. Swap this out for Supabase later.

export type Status = "todo" | "wip" | "review" | "done";

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  wip: "In progress",
  review: "In review",
  done: "Done",
};

// ---- block editor ----------------------------------------------------------
// The doc body is an ordered list of Notion-style blocks.
export type BlockType =
  | "text"
  | "h2"
  | "h3"
  | "bullet"
  | "quote"
  | "callout"
  | "divider"
  | "table";

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  rows?: string[][]; // grid content for table blocks (first row is the header)
}

// Icon hint for linked-reference cards in the right rail.
export type RefIcon = "mechanic" | "doc" | "vision" | "economy";

export interface LinkedRef {
  icon: RefIcon;
  title: string;
  text: string;
}

export interface DesignDoc {
  id: string;
  sectionId?: string; // owning section (DB id)
  parentId?: string; // parent page (nested tree) or undefined for top-level
  position?: number; // order within its sibling group
  title: string;
  group: string; // sidebar grouping, e.g. "Mechanics & Systems"
  kind: string; // what this doc is, e.g. "Core mechanic"
  status: Status;
  ownerId?: string; // profiles.id when assigned
  owner: string; // initials, shown in the avatar
  ownerName: string; // full name
  ownerColor: string; // avatar background
  subtitle: string; // lead sentence under the title
  tags: string[];
  links: string[]; // "Links to" chips
  blocks: Block[]; // the editable body
  refs: LinkedRef[]; // "Linked references" rail
  updatedAt?: string; // ISO timestamp from the DB (for "last edited")
}

export const seedDocs: DesignDoc[] = [
  {
    id: "ember",
    title: "The Ember",
    group: "Mechanics & Systems",
    kind: "Core mechanic",
    status: "wip",
    owner: "MR",
    ownerName: "Marco Reyes",
    ownerColor: "#5a83d6",
    subtitle:
      "The player carries a single living ember. It is light, heat, currency, and the heartbeat of every system in the game.",
    tags: ["core", "warmth", "survival"],
    links: ["Warmth Meter", "Shrine Network", "Crafting & Foraging"],
    blocks: [
      {
        id: "ember-1",
        type: "callout",
        text: "EMBERWICK begins with one rule: the ember must not go out. Everything the player does — moving, crafting, exploring, resting — is measured against the slow, inevitable cooling of the flame they carry.",
      },
      {
        id: "ember-2",
        type: "callout",
        text: "Design pillar — warmth is a resource. We never show the player a health bar; we show them a flame. Survival is emotional, not punitive.",
      },
      { id: "ember-3", type: "h2", text: "How it works" },
      {
        id: "ember-4",
        type: "text",
        text: "The ember lives inside the player's lantern and burns continuously. Cold environments draw warmth faster; shelter, shrines, and good fuel slow the burn down to a comfortable breath.",
      },
      {
        id: "ember-5",
        type: "text",
        text: "As it dims, the world contracts — the circle of light shrinks, colors desaturate, and the soundtrack pulls inward until only the heartbeat of the flame remains.",
      },
      { id: "ember-6", type: "h3", text: "Drain by environment" },
      {
        id: "ember-7",
        type: "table",
        text: "",
        rows: [
          ["Environment", "Warmth drain", "Notes"],
          ["Sheltered camp", "Very slow", "Safe to linger and craft"],
          ["Open snowfield", "Fast", "Keep moving between heat"],
          ["Blizzard", "Severe", "Lantern light shrinks hard"],
        ],
      },
    ],
    refs: [
      { icon: "mechanic", title: "Warmth Meter", text: "The single survival stat. Replaces health, hunger, and stamina with one legible…" },
      { icon: "mechanic", title: "Shrine Network", text: "Rekindling shrines is the game's spine of progression — each one you relight…" },
      { icon: "mechanic", title: "Crafting & Foraging", text: "Gentle, legible crafting focused on fuel, light, and comfort rather than weapons." },
      { icon: "doc", title: "The Wick-bearer", text: "The player character — the last person trusted to carry fire through the Long…" },
      { icon: "doc", title: "Lantern HUD", text: "A near-diegetic HUD: the lantern ring is the warmth meter, and almost everythin…" },
      { icon: "vision", title: "Vision & Pillars", text: "A cozy survival game where warmth is the only resource and rekindling the…" },
      { icon: "economy", title: "Ember Economy", text: "Embers and kindling are the only currencies — spent on shrines, comfort,…" },
    ],
  },
  {
    id: "warmth",
    title: "Warmth Meter",
    group: "Mechanics & Systems",
    kind: "System",
    status: "review",
    owner: "TS",
    ownerName: "Tariq Said",
    ownerColor: "#3f9d6e",
    subtitle:
      "One continuous meter stands in for health, hunger, and stamina — the only number the player ever needs to read.",
    tags: ["core", "ui", "balance"],
    links: ["The Ember", "Lantern HUD"],
    blocks: [
      {
        id: "warmth-1",
        type: "callout",
        text: "Warmth drains in the cold and refills near heat. At zero the world stops being forgiving — but we always warn the player long before that moment arrives.",
      },
      {
        id: "warmth-2",
        type: "callout",
        text: "Design pillar — legibility over realism. A glance at the lantern ring should tell you everything about how safe you are right now.",
      },
      { id: "warmth-3", type: "h2", text: "Behaviour" },
      {
        id: "warmth-4",
        type: "text",
        text: "Indoors and beside fires the meter climbs; in open snowfields it falls. Wind, altitude, and wet clothing all multiply the drain rate.",
      },
      {
        id: "warmth-5",
        type: "quote",
        text: "Open question: should warmth drain pause entirely indoors, or merely slow? Needs a balance pass.",
      },
    ],
    refs: [
      { icon: "mechanic", title: "The Ember", text: "The single living flame the whole game is built around. Warmth is its read-out." },
      { icon: "doc", title: "Lantern HUD", text: "The lantern ring renders the warmth meter near-diegetically around the flame." },
    ],
  },
  {
    id: "wickbearer",
    title: "The Wick-bearer",
    group: "Narrative",
    kind: "Character",
    status: "wip",
    owner: "JÖ",
    ownerName: "Johan Östlund",
    ownerColor: "#d4763a",
    subtitle:
      "The last keeper of the flame, bound by duty to carry the ember to the heart of the Long Dusk.",
    tags: ["protagonist", "lore"],
    links: ["The Ember", "Vision & Pillars"],
    blocks: [
      {
        id: "wick-1",
        type: "callout",
        text: "The Wick-bearer never speaks. Their whole character is told through how they shelter the flame — cupping it from the wind, feeding it the last of the kindling.",
      },
      { id: "wick-2", type: "h2", text: "Who they are" },
      {
        id: "wick-3",
        type: "text",
        text: "Chosen not for strength but for stubbornness: the one villager who refused to let the central hearth die when everyone else fled the cold.",
      },
    ],
    refs: [
      { icon: "mechanic", title: "The Ember", text: "The flame the Wick-bearer is sworn to protect across the whole journey." },
      { icon: "vision", title: "Vision & Pillars", text: "A cozy survival game where warmth is the only resource and rekindling the…" },
    ],
  },
  {
    id: "frostmere",
    title: "Frostmere",
    group: "World",
    kind: "Region",
    status: "todo",
    owner: "AK",
    ownerName: "Aki Korhonen",
    ownerColor: "#b7553d",
    subtitle:
      "The opening region — a frozen lake town that teaches warmth management and basic foraging.",
    tags: ["biome", "tutorial"],
    links: ["Warmth Meter", "Crafting & Foraging"],
    blocks: [
      {
        id: "frost-1",
        type: "callout",
        text: "Frostmere is gentle by design. Heat sources are never more than a short walk apart, so the player learns the warmth loop without ever feeling truly punished.",
      },
      { id: "frost-2", type: "h2", text: "Summary" },
      {
        id: "frost-3",
        type: "text",
        text: "A cluster of half-sunken cabins on a frozen lake. The first shrine sits at the church at the town's heart — relighting it opens the road north.",
      },
    ],
    refs: [
      { icon: "mechanic", title: "Warmth Meter", text: "Frostmere is the tutorial space where the warmth loop is first taught." },
    ],
  },
];
