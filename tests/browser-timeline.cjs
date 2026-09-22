// Browser → mocked Supabase transport → real migrated PostgreSQL (PGlite).
// No requests mutate the connected workspace. Run against a local dev server.
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { createPhaseFixture, id } = require("./fixtures/phase-db.cjs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const db = await createPhaseFixture();
  let browser;
  try {
    const phaseSnapshot = async () =>
      (await db.query("select phase_snapshot($1) s", [id(1)])).rows[0].s;
    const taskSnapshot = async () =>
      (await db.query("select gantt_snapshot($1) s", [id(1)])).rows[0].s;
    await db.exec(
      `update board_columns set is_completed=true where id='${id(6)}'`,
    );
    const env = fs.readFileSync(".env.local", "utf8");
    const host = new URL(
      env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1],
    ).hostname;
    const profile = {
      id: id(99),
      name: "Phase tester",
      initials: "PT",
      color: "#849884",
      onboarded_at: "2026-01-01",
    };
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    let viewer = false,
      writes = 0;
    const errors = [];
    await context.addInitScript(
      ({ host, user }) => {
        localStorage.setItem(
          `sb-${host.split(".")[0]}-auth-token`,
          JSON.stringify({
            access_token: "test-session",
            refresh_token: "test-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 86400,
            expires_in: 86400,
            token_type: "bearer",
            user: {
              id: user,
              email: "fixture@example.test",
              aud: "authenticated",
              role: "authenticated",
            },
          }),
        );
      },
      { host, user: id(99) },
    );
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.hostname !== host) return route.continue();
      const name = u.pathname.split("/").pop();
      let data = [];
      try {
        if (u.pathname.includes("/auth/")) data = { user: profile };
        else if (u.pathname.includes("/rpc/")) {
          const body = req.postDataJSON();
          if (name === "phase_snapshot") data = await phaseSnapshot();
          else if (name === "gantt_snapshot") data = await taskSnapshot();
          else if (
            ["phase_mutate", "gantt_mutate", "gantt_mutate_hierarchy"].includes(
              name,
            )
          ) {
            writes++;
            data = (
              await db.query(`select ${name}($1,$2,$3) s`, [
                body.p_project,
                body.p_expected,
                body.p_action,
              ])
            ).rows[0].s;
          } else if (name === "board_stage_snapshot")
            data = (
              await db.query("select board_stage_snapshot($1,$2) s", [
                body.p_project,
                body.p_board,
              ])
            ).rows[0].s;
          else if (name === "save_board_stages")
            data = (
              await db.query("select save_board_stages($1,$2,$3,$4,$5,$6) s", [
                body.p_project,
                body.p_board,
                body.p_expected,
                body.p_name,
                body.p_stages,
                body.p_transfers,
              ])
            ).rows[0].s;
        } else if (
          [
            "boards",
            "board_columns",
            "board_cards",
            "board_categories",
          ].includes(name)
        )
          data = (
            await db.query(
              `select * from ${name} order by position nulls last,id`,
            )
          ).rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                v instanceof Date ? v.toISOString().slice(0, 10) : v,
              ]),
            ),
          );
        else if (name === "profiles")
          data = u.searchParams.get("id") ? profile : [profile];
        else if (name === "project_members")
          data = [
            {
              project_id: id(1),
              role: viewer ? "viewer" : "owner",
              user_id: id(99),
              profile,
              profiles: profile,
              projects: { id: id(1), name: "Phase fixture", color: "#849884" },
            },
          ];
        else if (name === "projects")
          data = { id: id(1), name: "Phase fixture" };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      } catch (e) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: e.message, code: "P0001" }),
        });
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.APP_URL || "http://localhost:3100";
    await page.goto(base + "/table");
    await page.getByRole("main", { name: "Gantt planning" }).waitFor();
    const gameplay = page.locator(`[data-phase-id="${id(3)}"]`);
    await gameplay.waitFor();
    assert.match(await gameplay.innerText(), /50%/);
    assert.match(await gameplay.innerText(), /1 of 2 complete/);
    assert.equal(await page.locator(".phase-row").count(), 3);
    assert.equal(await page.getByText("Prototype", { exact: true }).count(), 0);
    await page.screenshot({
      path: "/tmp/foundry-phases-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Collapse Gameplay" }).click();
    assert.equal(await page.locator(".phase-row").count(), 2);
    await page.getByRole("button", { name: "Expand Gameplay" }).click();
    const originalTasks = await taskSnapshot();
    await page.getByRole("button", { name: "Edit mechanic dates" }).click();
    await page.getByLabel("Phase start", { exact: true }).fill("2026-09-10");
    await page.getByLabel("Phase end", { exact: true }).fill("2026-09-25");
    await page.getByRole("button", { name: "Save dates", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await phaseSnapshot()).phases[0].effective_end, "2026-09-25");
    assert.deepEqual(await taskSnapshot(), originalTasks);
    await page.getByRole("button", { name: "Undo schedule change" }).click();
    await page.getByRole("status").waitFor({ state: "hidden" });
    assert.equal((await phaseSnapshot()).phases[0].effective_end, "2026-09-18");
    // Drag the exposed bottom edge of a parent bar, then resize the child end.
    const parentBar = gameplay.locator(".phase-bar");
    const box = await parentBar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height - 3, {
      steps: 6,
    });
    await page.mouse.up();
    await page.getByRole("status").waitFor();
    assert.equal((await phaseSnapshot()).phases[0].start_date, "2026-09-16");
    await page.getByRole("button", { name: "Undo schedule change" }).click();
    await page.getByRole("status").waitFor({ state: "hidden" });
    const childRow = page.locator(".phase-child").first(),
      handle = await childRow.locator(".phase-resize-end").boundingBox();
    await page.mouse.move(handle.x + 3, handle.y + 10);
    await page.mouse.down();
    await page.mouse.move(handle.x + 83, handle.y + 10, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("status").waitFor();
    assert.equal(
      (await phaseSnapshot()).phases.find((p) => p.category_id).end_date,
      "2026-09-18",
    );
    await page.getByRole("button", { name: "Undo schedule change" }).click();
    await page.getByRole("status").waitFor({ state: "hidden" });
    // Date a second phase and create a dependency using the browser form.
    await page
      .locator(`[data-phase-id="${id(4)}"]`)
      .getByRole("button", { name: "+ Set dates", exact: true })
      .click();
    await page.getByLabel("Phase start", { exact: true }).fill("2026-09-01");
    await page.getByLabel("Phase end", { exact: true }).fill("2026-09-03");
    await page.getByRole("button", { name: "Save dates", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /^Dependencies/ }).click();
    await page
      .getByLabel("Predecessor phase", { exact: true })
      .selectOption(id(3));
    await page
      .getByLabel("Successor phase", { exact: true })
      .selectOption(id(4));
    await page.getByRole("button", { name: "Add link", exact: true }).click();
    await page.locator(".phase-link-item").waitFor();
    assert.equal(
      (await phaseSnapshot()).phases.find((p) => p.id === id(4)).start_date,
      "2026-09-19",
    );
    assert.equal(await page.locator(".phase-arrows>path").count(), 1);
    // A concurrent change must surface as a conflict rather than overwrite dates.
    await page.getByRole("button", { name: "Edit mechanic dates" }).click();
    const changed = (await phaseSnapshot()).phases.find((p) => p.category_id);
    await db.query("select phase_mutate($1,$2,$3)", [
      id(1),
      await phaseSnapshot(),
      { op: "move", id: changed.id, days: 1 },
    ]);
    await page.getByLabel("Phase end", { exact: true }).fill("2026-10-02");
    await page.getByRole("button", { name: "Save dates", exact: true }).click();
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert.match(
      await page.getByRole("dialog").getByRole("alert").innerText(),
      /changed/,
    );
    await page.getByRole("button", { name: "Close and refresh" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    // The category link opens only matching tasks and shows the subphase window.
    await page
      .getByRole("link", { name: "Open mechanic board", exact: true })
      .click();
    await page.locator(".card").first().waitFor();
    assert.equal(await page.locator(".card").count(), 1);
    assert.match(
      await page.locator(".board-phase-summary").innerText(),
      /subphase/,
    );
    assert.match(page.url(), /category=/);
    await page.goto(base + "/table");
    await gameplay.waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/foundry-phases-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "+ New phase", exact: true })
      .click();
    await page.getByLabel("Board name", { exact: true }).fill("Production");
    await page
      .getByRole("button", { name: "Create board", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.ok(
      (await phaseSnapshot()).phases.some(
        (p) => p.title === "Production" && !p.category_id,
      ),
    );
    // Creating a phase while every phase is shown keeps the "All phases" view.
    await page.getByRole("button", { name: "Show phases", exact: true }).click();
    assert.ok(
      await page
        .getByRole("group", { name: "Phases to show" })
        .getByLabel("All phases", { exact: true })
        .isChecked(),
    );
    await page.keyboard.press("Escape");
    viewer = true;
    await db.exec("set test.role='viewer'");
    await page.reload();
    await gameplay.waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "+ New phase", exact: true })
        .count(),
      0,
    );
    assert.ok(
      await gameplay
        .getByRole("button", { name: "Gameplay", exact: true })
        .isDisabled(),
    );
    assert.deepEqual(errors, []);
    console.log(
      `Phase browser flow passed (${writes} RPC writes; task dates preserved).`,
    );
  } finally {
    await browser?.close();
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
