// Domain types + seed data for the game design documents.
// Local-only for now — no backend yet. Swap this out for Supabase later.

export type Status = "todo" | "wip" | "review" | "done";

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To do",
  wip: "In progress",
  review: "In review",
  done: "Done",
};

export interface DocSection {
  heading: string;
  body: string;
}

export interface DesignDoc {
  id: string;
  title: string;
  group: string; // sidebar grouping, e.g. "Mechanics"
  kind: string; // what this doc is, e.g. "Core mechanic"
  status: Status;
  owner: string;
  tags: string[];
  sections: DocSection[];
}

export const seedDocs: DesignDoc[] = [
  {
    id: "ember",
    title: "The Ember",
    group: "Mechanics",
    kind: "Core mechanic",
    status: "wip",
    owner: "MR",
    tags: ["core", "warmth", "survival"],
    sections: [
      {
        heading: "Summary",
        body: "The ember is the player's lifeline — a fragile flame carried through a frozen world. It must be fed, sheltered, and protected. Lose it and the run ends.",
      },
      {
        heading: "Player goal",
        body: "Keep the ember alive long enough to reach and relight the next shrine, extending your safe range across the map.",
      },
    ],
  },
  {
    id: "warmth",
    title: "Warmth Meter",
    group: "Mechanics",
    kind: "System",
    status: "review",
    owner: "TS",
    tags: ["core", "ui", "balance"],
    sections: [
      {
        heading: "Summary",
        body: "A continuous meter that drains in the cold and refills near heat sources. At zero the player begins to take damage.",
      },
      {
        heading: "Open questions",
        body: "Should warmth drain pause indoors, or only slow down? Needs a balance pass.",
      },
    ],
  },
  {
    id: "wickbearer",
    title: "The Wick-bearer",
    group: "Narrative",
    kind: "Character",
    status: "wip",
    owner: "JO",
    tags: ["protagonist", "lore"],
    sections: [
      {
        heading: "Who they are",
        body: "The last keeper of the flame, bound by duty to carry the ember to the heart of the Long Dusk.",
      },
    ],
  },
  {
    id: "frostmere",
    title: "Frostmere",
    group: "World",
    kind: "Region",
    status: "todo",
    owner: "AK",
    tags: ["biome", "tutorial"],
    sections: [
      {
        heading: "Summary",
        body: "The opening region — a frozen lake town that teaches warmth management and basic foraging.",
      },
    ],
  },
];
