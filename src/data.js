// data.js — EMBERWICK sample GDD content

const team = {
  AK: { id: "AK", name: "Anya Kessler",   role: "Creative Director", color: "#d8902c" },
  MR: { id: "MR", name: "Marco Reyes",     role: "Lead Designer",     color: "#5a83d6" },
  JO: { id: "JO", name: "Jonas Östberg",   role: "Narrative",         color: "#4d9a6a", initials: "JÖ" },
  LP: { id: "LP", name: "Lena Park",       role: "Art Director",      color: "#b3559e" },
  TS: { id: "TS", name: "Theo Sun",        role: "Systems Designer",  color: "#cf6a4a" },
};

const sections = [
  { id: "overview",   icon: "compass",  name: "Overview & Pillars", prog: 92, status: "done",   count: 4,  color: "#d8902c" },
  { id: "mechanics",  icon: "gear",     name: "Mechanics & Systems",prog: 64, status: "wip",    count: 12, color: "#cf6a4a" },
  { id: "narrative",  icon: "book",     name: "Narrative & Lore",   prog: 51, status: "wip",    count: 9,  color: "#4d9a6a" },
  { id: "world",      icon: "map",      name: "World & Levels",     prog: 38, status: "wip",    count: 7,  color: "#5a83d6" },
  { id: "art",        icon: "palette",  name: "Art Direction",      prog: 60, status: "review", count: 8,  color: "#b3559e" },
  { id: "audio",      icon: "wave",     name: "Audio & Music",      prog: 22, status: "todo",   count: 5,  color: "#7a8cc0" },
  { id: "uiux",       icon: "frame",    name: "UI / UX",            prog: 44, status: "review", count: 6,  color: "#d28b4a" },
  { id: "economy",    icon: "coin",     name: "Progression & Economy", prog: 33, status: "wip", count: 6,  color: "#c98a3a" },
  { id: "production", icon: "check",    name: "Production Board",   prog: 0,  status: "todo",   count: 38, color: "#8a8278" },
  { id: "library",    icon: "stack",    name: "Asset Library",      prog: 71, status: "wip",    count: 214,color: "#6aa0a0" },
];

// rich-text block helpers used in page bodies
const P  = (t) => ({ t: "p", text: t });
const H  = (t) => ({ t: "h", text: t });
const CO = (tone, title, text) => ({ t: "callout", tone, title, text });
const MD = (label, ratio) => ({ t: "media", label, ratio: ratio || "16 / 8" });
const LI = (...items) => ({ t: "list", items });
const TB = (cols, rows) => ({ t: "table", cols, rows });
const LK = (...ids) => ({ t: "links", ids });
const QT = (text, by) => ({ t: "quote", text, by });

const pages = {
  ember: {
    id: "ember", section: "mechanics", title: "The Ember", kind: "Core mechanic",
    status: "wip", owner: "MR", updated: "2h ago", tags: ["core", "warmth", "survival"],
    summary: "The player carries a single living ember. It is light, heat, currency, and the heartbeat of every system in the game.",
    links: ["warmth", "shrines", "crafting"],
    body: [
      P("EMBERWICK begins with one rule: the ember must not go out. Everything the player does — moving, crafting, exploring, resting — is measured against the slow, inevitable cooling of the flame they carry."),
      CO("accent", "Design pillar", "Warmth is a resource. We never show the player a health bar; we show them a flame. Survival is emotional, not punitive."),
      H("How it works"),
      P("The ember lives inside the player's lantern and burns continuously. Cold environments drain it faster; shelter, fuel, and rekindled shrines slow the burn. When the ember is bright the world opens up — paths reveal, creatures calm, the player moves freely. As it dims, the world contracts."),
      MD("Warmth loop — whiteboard diagram", "16 / 7"),
      H("Ember states"),
      TB(["State", "Warmth", "World response"], [
        ["Roaring", "80–100%", "Full vision, fast travel, creatures friendly"],
        ["Steady", "40–79%", "Normal play — the default loop"],
        ["Guttering", "15–39%", "Vision narrows, cold-fauna emerge"],
        ["Embered", "1–14%", "Slowed, screen desaturates, last-stand tension"],
      ]),
      CO("warn", "Open question", "Should death reset the ember to a checkpoint shrine, or should the ember be transferable to a companion? Owner: Anya — needs a call before vertical slice."),
      H("Connected systems"),
      P("The ember is the hub the rest of the design hangs from. These pages define how it feeds the wider game:"),
      LK("warmth", "shrines", "crafting"),
    ],
  },
  warmth: {
    id: "warmth", section: "mechanics", title: "Warmth Meter", kind: "System",
    status: "review", owner: "TS", updated: "1d ago", tags: ["core", "ui", "balance"],
    summary: "The single survival stat. Replaces health, hunger, and stamina with one legible value the player feels rather than reads.",
    links: ["ember", "hud", "frostmere"],
    body: [
      P("Warmth is the only survival meter in EMBERWICK. It unifies what other survival games split into three or four bars. One number, surfaced as a ring of light around the lantern, that the player learns to read at a glance."),
      H("Drain & gain"),
      TB(["Source", "Effect", "Notes"], [
        ["Ambient cold", "−1 to −6 /min", "Scales with biome and weather"],
        ["Sprinting", "−2 /min", "Encourages deliberate movement"],
        ["Fuel / kindling", "+restores", "Consumable, crafted or foraged"],
        ["Shrine aura", "pauses drain", "Safe zones — see Shrine Network"],
      ]),
      CO("accent", "Feel target", "The player should never math this. They should feel cold creeping in and instinctively head for light."),
      H("Surfacing"),
      P("Warmth is shown only as the lantern ring — never a number — except in the accessibility mode. See the Lantern HUD spec for the exact treatment."),
      LK("ember", "hud", "frostmere"),
    ],
  },
  shrines: {
    id: "shrines", section: "mechanics", title: "Shrine Network", kind: "System",
    status: "wip", owner: "MR", updated: "3d ago", tags: ["world", "progression", "warmth"],
    summary: "Rekindling shrines is the game's spine of progression — each one you relight pushes the dark back and reshapes the map.",
    links: ["ember", "economy", "frostmere"],
    body: [
      P("Shrines are the persistent progression layer. Lighting one consumes ember but permanently warms a region, opens fast-travel between lit shrines, and visibly changes the world from grey to alive."),
      CO("accent", "Restoration over conquest", "EMBERWICK is about bringing a world back, not clearing it. Shrines are the readable proof of that."),
      MD("Shrine network — region overview", "16 / 8"),
      H("Lighting cost"),
      LI("Each shrine has an ember-cost gated behind exploration, not grinding.",
         "Lit shrines link into a fast-travel constellation.",
         "Re-darkening (story event) is possible and dramatic — used sparingly."),
      LK("ember", "economy", "frostmere"),
    ],
  },
  crafting: {
    id: "crafting", section: "mechanics", title: "Crafting & Foraging", kind: "System",
    status: "wip", owner: "TS", updated: "5d ago", tags: ["loop", "economy"],
    summary: "Gentle, legible crafting focused on fuel, light, and comfort rather than weapons.",
    links: ["ember", "economy"],
    body: [
      P("Crafting in EMBERWICK is cozy, not combative. Recipes center on keeping the ember alive and making camps feel like home: lanterns, fuel, warm food, shelter upgrades."),
      H("Categories"),
      LI("Fuel — extends ember burn time", "Light — tools that project or store warmth",
         "Comfort — camp upgrades, cosmetic warmth", "Tools — traversal and foraging aids"),
      H("Foraging"),
      P("Materials are gathered from the world, not bought. Cold biomes hide warm things — resin in frozen bark, dry tinder under sunken cabins — so foraging doubles as a reason to explore and a small survival puzzle: where is it still dry enough to burn?"),
      CO("accent", "Cozy, not punishing", "Recipes are forgiving and discoverable. There's no durability anxiety and no failed-craft penalty — crafting should feel like tending a hearth, not managing a spreadsheet."),
      H("Sample recipes"),
      TB(["Item", "Makes", "Cost"], [
        ["Pitch bundle", "Long-burn fuel", "Resin + dry tinder"],
        ["Hearth-pot", "Warm meal (slows drain)", "Forage + kindling"],
        ["Storm lantern", "Wind-proof light", "Glass shard + frame"],
        ["Bedroll", "Camp comfort upgrade", "Reed + hide"],
      ]),
      LK("ember", "economy"),
    ],
  },
  wickbearer: {
    id: "wickbearer", section: "narrative", title: "The Wick-bearer", kind: "Character",
    status: "wip", owner: "JO", updated: "6h ago", tags: ["protagonist", "lore"],
    summary: "The player character — the last person trusted to carry fire through the Long Dusk.",
    links: ["dusk", "ember", "frostmere"],
    body: [
      P("The Wick-bearer is not a hero in armor. They are a keeper — chosen, or perhaps simply the one who stayed — entrusted with the last ember when every other fire in the world went cold."),
      MD("Wick-bearer — concept sheet", "16 / 9"),
      CO("accent", "Voice", "Quiet, weathered, kind. The Wick-bearer rarely speaks; the world speaks to them. Warmth is how they show care."),
      H("Arc"),
      P("From custodian to gardener of light: the journey reframes survival as stewardship. By the end, the Wick-bearer must choose whether to keep the ember or give it away."),
      QT("\"You don't own the fire. You only carry it for a while.\"", "— Elder Mosswen, opening monologue"),
      LK("dusk", "ember", "frostmere"),
    ],
  },
  dusk: {
    id: "dusk", section: "narrative", title: "The Long Dusk", kind: "Lore",
    status: "wip", owner: "JO", updated: "2d ago", tags: ["worldbuilding", "lore"],
    summary: "The setting: a world that never fully night-fell, caught in an endless cooling twilight.",
    links: ["wickbearer", "frostmere"],
    body: [
      P("The Long Dusk is not an apocalypse — it's a slow forgetting. The sun didn't die; it dimmed, and the world learned to live grey. EMBERWICK is the story of remembering warmth."),
      CO("accent", "Tone", "Melancholy, not bleak. The Dusk is sad the way an empty house is sad — full of the shape of warmth that used to be there. Hope is always one lit shrine away."),
      H("What happened"),
      P("Three generations ago the sky began to cool. No one agreed why. The Hearth-keepers — an order who tended the great fires — gathered the last true flames into wicks small enough to carry, and scattered to relight the world shrine by shrine. Most never returned. Their embers went out on the road."),
      H("How the world changed"),
      TB(["Before the Dusk", "Now", "What the player sees"], [
        ["Open trade roads", "Silent, frost-locked paths", "Ruined waystones, frozen carts"],
        ["Living shrines", "Cold stone, dormant", "Grey until rekindled"],
        ["Warm fauna", "Cold-adapted, wary", "Calm near light, skittish in dark"],
        ["Settled villages", "Hollow, half-buried", "Stories left in objects, not people"],
      ]),
      CO("warn", "Open question", "How much explicit history do we tell vs. leave in the environment? @Jonas leaning heavily environmental — needs an alignment pass with Anya before the narrative bible locks."),
      H("Why it matters to the loop"),
      LI("The Dusk justifies the single-resource design — in a cold world, warmth is everything.",
         "It frames progression as restoration: every shrine pushes the grey back.",
         "It makes silence the default, so the smallest warm sound or color lands hard."),
      QT("“The world didn't end. It just got cold, and we forgot how to be warm.”", "— Elder Mosswen"),
      LK("wickbearer", "frostmere"),
    ],
  },
  frostmere: {
    id: "frostmere", section: "world", title: "Frostmere", kind: "Region",
    status: "wip", owner: "AK", updated: "1d ago", tags: ["biome", "level", "tutorial"],
    summary: "The opening region — a hushed frozen wetland where the player learns to read warmth and light their first shrine.",
    links: ["shrines", "warmth", "dusk"],
    body: [
      P("Frostmere is where EMBERWICK teaches itself. A still, blue-grey wetland of frozen reeds and sunken cabins, it introduces the warmth loop in a forgiving space with short distances between shelter."),
      MD("Frostmere — region moodboard", "16 / 8"),
      H("Beats"),
      TB(["Beat", "Teaches", "Status"], [
        ["Awakening", "Movement & the lantern ring", "done"],
        ["First Cold", "Warmth drain & shelter", "wip"],
        ["The Sunken Shrine", "Lighting your first shrine", "wip"],
        ["Leaving Frostmere", "Fast travel & the map", "todo"],
      ]),
      CO("warn", "Greybox note", "Distances feel ~15% too large in the current block-out — Marco to retune before art pass."),
      LK("shrines", "warmth", "dusk"),
    ],
  },
  palette: {
    id: "palette", section: "art", title: "Warm vs Cold Palette", kind: "Art spec",
    status: "review", owner: "LP", updated: "4d ago", tags: ["color", "style"],
    summary: "The whole game reads on a single axis: the warmth you carry vs the cold you walk through.",
    links: ["frostmere"],
    body: [
      P("Every frame in EMBERWICK is a negotiation between two palettes — the ember-warm pool the player carries and the blue-grey cold of the world. Color is the warmth meter."),
      MD("Palette study — warm pool in cold field", "16 / 7"),
      H("The two families"),
      TB(["Family", "Hues", "Where it lives"], [
        ["Ember warm", "Amber, rust, honey, rose-gold", "Lantern light, fire, the player's reach"],
        ["Dusk cold", "Slate blue, frost grey, deep teal", "The world, distance, shadow"],
        ["Neutral bridge", "Warm stone, bone, ash", "Architecture, ground, transition zones"],
      ]),
      CO("accent", "The one rule", "Warmth is earned, not given. The world starts almost monochrome blue-grey; saturated warm color only exists where the player has brought light. Lighting a shrine literally returns color to a region."),
      H("How it tracks warmth"),
      LI("High warmth — the warm pool extends further; the world picks up amber rim-light.",
         "Low warmth — the pool shrinks to the lantern; the frame desaturates toward blue.",
         "Embered state — near-total desaturation, only the dying ember holds color."),
      H("Lighting"),
      P("Light is colored, shadow is too. Warm light is never neutral white — it's honey-gold — and cold shadow leans blue, never black. The contrast between the two does the emotional work of the whole game."),
      CO("warn", "Art-pass note", "Lock the warm/cold value ramp before any environment artist starts texturing — retrofitting palette is expensive. @Lena owns the master swatch."),
      LK("frostmere"),
    ],
  },
  hud: {
    id: "hud", section: "uiux", title: "Lantern HUD", kind: "UI spec",
    status: "review", owner: "MR", updated: "3d ago", tags: ["hud", "diegetic"],
    summary: "A near-diegetic HUD: the lantern ring is the warmth meter, and almost everything else is hidden until needed.",
    links: ["warmth", "ember"],
    body: [
      P("The HUD is built around restraint. The lantern's ring of light IS the warmth meter; there are no floating bars. Inventory, map, and prompts fade in only on intent."),
      MD("Lantern HUD — states", "16 / 7"),
      H("Principles"),
      LI("Diegetic first — if the world can show it, the HUD shouldn't.",
         "One glance, one read — warmth is legible in under a second from the ring alone.",
         "Fade on intent — panels appear when the player reaches for them, then get out of the way.",
         "Never a number — warmth is a feeling, surfaced as light, color, and sound."),
      H("Elements"),
      TB(["Element", "Surfacing", "Trigger"], [
        ["Warmth ring", "Always — around the lantern", "Persistent, diegetic"],
        ["Inventory wheel", "Radial overlay", "Hold — fades on release"],
        ["Map", "Full-screen", "Toggle — pauses world"],
        ["Interaction prompt", "Small glyph near target", "Proximity + look-at"],
        ["Damage / cold spike", "Screen-edge frost", "Event — auto-clears"],
      ]),
      CO("accent", "Feel target", "A new player should never see a tutorial pointing at the HUD. They should just notice the light getting smaller and feel the urge to find warmth."),
      H("Accessibility mode"),
      P("An optional readout layer adds a numeric warmth value, high-contrast ring, and text labels on every prompt. It's a true layer — toggled independently — so the diegetic default is never compromised for players who don't need it."),
      CO("warn", "Open question", "Do controller players get a held-radial inventory or a quick-swap? @Marco prototyping both for the slice."),
      LK("warmth", "ember"),
    ],
  },
};

// light pages so every section opens a coherent doc
pages.vision = {
  id: "vision", section: "overview", title: "Vision & Pillars", kind: "Overview",
  status: "done", owner: "AK", updated: "1w ago", tags: ["pillars", "vision"],
  summary: "A cozy survival game where warmth is the only resource and rekindling the world is the only goal.",
  links: ["ember", "wickbearer", "shrines"],
  body: [
    QT("“Carry the last ember through a world gone dark.”", "— EMBERWICK, one line"),
    P("EMBERWICK is a single-player survival-crafting adventure about stewardship rather than conquest. The player carries the last living ember across a world caught in an endless dusk, rekindling shrines to push the cold back one region at a time."),
    H("The three pillars"),
    CO("accent", "1 · Warmth is a resource", "No health bar — a flame. Survival is felt, never punitive. See The Ember."),
    CO("accent", "2 · Gentle survival", "Forgiving, cozy systems. Tension comes from cold and distance, not enemies."),
    CO("accent", "3 · A world worth rekindling", "Every shrine lit visibly heals the world. Restoration is the reward."),
    LK("ember", "wickbearer", "shrines"),
  ],
};
pages.score = {
  id: "score", section: "audio", title: "Adaptive Score", kind: "Audio direction",
  status: "todo", owner: "AK", updated: "1w ago", tags: ["music", "adaptive"],
  summary: "Music swells with warmth and thins with cold — the score is a second warmth meter.",
  links: ["warmth"],
  body: [
    P("The soundtrack is driven by the warmth value. A bright ember brings in warm strings and hearth tones; as the cold creeps in, layers strip away to lone, glassy textures."),
    H("Adaptive layers"),
    TB(["Warmth", "What you hear", "Feeling"], [
      ["Roaring", "Full ensemble — warm strings, low hearth drum", "Safe, expansive"],
      ["Steady", "Melody + soft pad", "Companionable"],
      ["Guttering", "Layers strip away, lone instrument", "Exposed"],
      ["Embered", "Near silence — breath, a single glass tone", "Held breath"],
    ]),
    CO("accent", "The score is a second warmth meter", "A player who closes their eyes should still know how warm they are. Music carries the same information as the lantern ring, through a different sense."),
    H("Instrumentation"),
    LI("Warm core — felted piano, cello, low brass played soft.",
       "Cold edge — bowed glass, prepared strings, breath and wind.",
       "Diegetic seams — wind, ice, distant shrine hums blend into the score so the line between world and music blurs."),
    CO("warn", "Status", "Direction agreed; no recorded material yet. @Anya scoring a Frostmere vertical-slice cue first to prove the adaptive system."),
    LK("warmth"),
  ],
};
pages.embers = {
  id: "embers", section: "economy", title: "Ember Economy", kind: "Economy",
  status: "wip", owner: "TS", updated: "4d ago", tags: ["economy", "progression"],
  summary: "Embers and kindling are the only currencies — spent on shrines, comfort, and survival.",
  links: ["shrines", "crafting", "ember"],
  body: [
    P("The economy runs on two soft currencies: kindling (common, keeps you alive) and embers (rare, spent to light shrines and unlock the fast-travel constellation). No hard money, no shops in the traditional sense."),
    H("The two currencies"),
    TB(["Currency", "Rarity", "Source", "Spent on"], [
      ["Kindling", "Common", "Foraging, fuel crafting", "Burn time, warm food, comfort"],
      ["Embers", "Rare", "Story beats, deep exploration", "Lighting shrines, fast-travel links"],
    ]),
    CO("accent", "No grind, no shop", "Embers are gated behind exploration and story, never behind repetition. You can't farm your way to progress — you have to go somewhere new."),
    H("Sinks & faucets"),
    LI("Faucets — foraging routes, fuel recipes, rekindled regions yielding more over time.",
       "Sinks — shrine lighting (the big one), comfort upgrades, traversal tools.",
       "Soft pressure — ambient cold is a constant, gentle drain that keeps kindling meaningful without ever feeling punishing."),
    CO("warn", "Balance risk", "If embers feel too scarce, shrine progression stalls and the world stays grey too long. @Theo tuning the exploration-to-ember ratio in the Frostmere slice."),
    LK("shrines", "crafting", "ember"),
  ],
};
pages.prodboard = {
  id: "prodboard", section: "production", title: "Production Board", kind: "Tracker",
  status: "todo", owner: "MR", updated: "today", tags: ["production"],
  summary: "Live task board across all disciplines toward the vertical slice.",
  links: ["frostmere", "hud"],
  body: [ P("The production board tracks every task toward the vertical slice milestone, grouped by discipline. This page links the design docs to their build status."), LK("frostmere", "hud") ],
};
pages.assetlib = {
  id: "assetlib", section: "library", title: "Asset Library", kind: "Library",
  status: "wip", owner: "LP", updated: "2d ago", tags: ["assets", "pipeline"],
  summary: "214 tracked assets — models, textures, audio, and concept art — linked to the docs they belong to.",
  links: ["palette", "frostmere"],
  body: [ P("Every asset in the build is catalogued here and cross-linked to the design page it serves, so a moodboard always knows which region it dresses."), MD("Asset gallery — recent uploads", "16 / 6"), LK("palette", "frostmere") ],
};

const sectionPrimary = {
  overview: "vision", mechanics: "ember", narrative: "wickbearer", world: "frostmere",
  art: "palette", audio: "score", uiux: "hud", economy: "embers",
  production: "prodboard", library: "assetlib",
};

// production board
const boardCols = [
  { id: "backlog", name: "Backlog" },
  { id: "design",  name: "Designing" },
  { id: "prod",    name: "In production" },
  { id: "review",  name: "Review" },
  { id: "done",    name: "Done" },
];
const colStatus = { backlog: "todo", design: "wip", prod: "wip", review: "review", done: "done" };
let _tid = 0;
const T = (col, title, section, who, due, page) => ({ id: "t" + (++_tid), col, title, section, who, due, page });
const tasks = [
  T("backlog", "Crafting recipe tree v2", "mechanics", "TS", "Jul 2", "crafting"),
  T("backlog", "SFX pass — Frostmere ambience", "audio", "AK", "Jul 9", "score"),
  T("backlog", "Shop / barter loop", "economy", "TS", "Jul 5", "embers"),
  T("backlog", "Region 3 concept brief", "world", "AK", "Jul 11"),
  T("design", "Sunken Shrine puzzle beat", "world", "MR", "Jun 24", "frostmere"),
  T("design", "Side-quest framework", "narrative", "JO", "Jun 27", "wickbearer"),
  T("design", "Warmth drain tuning", "mechanics", "TS", "Jun 21", "warmth"),
  T("prod", "Wick-bearer concept sheet", "art", "LP", "Jun 22", "wickbearer"),
  T("prod", "Lantern HUD build", "uiux", "MR", "Jun 25", "hud"),
  T("prod", "Tree & reed models — Frostmere", "library", "LP", "Jun 28", "assetlib"),
  T("review", "Combat-free encounter tuning", "mechanics", "TS", "Jun 20", "ember"),
  T("review", "Warm vs cold palette lock", "art", "LP", "Jun 19", "palette"),
  T("done", "Design pillars locked", "overview", "AK", "Apr 10", "vision"),
  T("done", "Frostmere greybox", "world", "MR", "Apr 12", "frostmere"),
  T("done", "Ember states spec", "mechanics", "MR", "May 02", "ember"),
];

const activity = [
  { who: "MR", action: "edited", target: "The Ember", page: "ember", when: "2h" },
  { who: "JO", action: "commented on", target: "The Wick-bearer", page: "wickbearer", when: "6h" },
  { who: "LP", action: "moved", target: "Warm vs Cold Palette", page: "palette", chip: "In review", when: "8h" },
  { who: "AK", action: "edited", target: "Frostmere", page: "frostmere", when: "1d" },
  { who: "TS", action: "linked", target: "Warmth Meter", page: "warmth", chip: "→ Lantern HUD", when: "1d" },
];

const milestones = [
  { name: "Greybox complete", date: "Apr 12", status: "done" },
  { name: "Vertical slice", date: "Jun 30", status: "wip" },
  { name: "First playable", date: "Sep 15", status: "todo" },
  { name: "Alpha", date: "Dec 01", status: "todo" },
];

// canvas node layout (% of board) + edges (page ids)
const canvas = {
  nodes: [
    { id: "ember",      x: 41, y: 36 },
    { id: "warmth",     x: 16, y: 16 },
    { id: "shrines",    x: 70, y: 18 },
    { id: "crafting",   x: 72, y: 56 },
    { id: "frostmere",  x: 14, y: 60 },
    { id: "wickbearer", x: 43, y: 74 },
    { id: "hud",        x: 12, y: 38 },
    { id: "dusk",       x: 73, y: 80 },
  ],
  edges: [
    ["ember","warmth"], ["ember","shrines"], ["ember","crafting"],
    ["warmth","hud"], ["warmth","frostmere"], ["shrines","frostmere"],
    ["wickbearer","ember"], ["wickbearer","dusk"], ["frostmere","wickbearer"],
  ],
};

const comments = {
  ember: [
    { who: "AK", text: "Love where this is. @Marco can we lock the death/checkpoint question before slice?", when: "5h ago", replies: [
      { who: "MR", text: "@Anya I lean toward the companion transfer — it keeps the no-fail-state feel. Writing it up now.", when: "4h ago" },
      { who: "TS", text: "Transfer plays nicely with the warmth economy too. +1 from systems.", when: "3h ago" },
    ] },
    { who: "TS", text: "Tuning the Guttering threshold to 39% felt right in playtest 12. @Marco want to lock that number?", when: "1d ago", replies: [] },
  ],
  warmth: [
    { who: "MR", text: "Reminder: no numeric readout outside accessibility mode. @Theo flagging so the tuning UI doesn't leak into the real HUD.", when: "9h ago", replies: [
      { who: "TS", text: "Understood — debug overlay is dev-only and stripped from slice builds.", when: "8h ago" },
    ] },
  ],
  wickbearer: [
    { who: "AK", text: "The “carry it for a while” line is the whole game. Keep it. @Jonas don't let anyone talk you out of it.", when: "6h ago", replies: [
      { who: "JO", text: "It's load-bearing. Locked.", when: "5h ago" },
    ] },
  ],
  frostmere: [
    { who: "AK", text: "@Marco the sunken-shrine sightline reads beautifully now. Distances still feel a touch long though.", when: "1d ago", replies: [
      { who: "MR", text: "On it — pulling shelter spacing in ~15% before the art pass.", when: "1d ago" },
    ] },
  ],
};

// backlinks computed from links
const backlinks = {};
Object.values(pages).forEach((pg) => (pg.links || []).forEach((to) => {
  (backlinks[to] = backlinks[to] || []).push(pg.id);
}));

export const data = {
  team, sections, pages, activity, milestones, canvas, comments, backlinks, sectionPrimary, boardCols, colStatus, tasks,
  game: { name: "EMBERWICK", tagline: "Carry the last ember through a world gone dark.",
          genre: "Survival-crafting adventure", progress: 47 },
};
