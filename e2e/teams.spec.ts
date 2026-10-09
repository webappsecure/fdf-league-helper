import { expect, test, type Locator, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createLeague(page: Page, label: string): Promise<void> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// The cells of the first team in the league's table.
function firstTeam(page: Page) {
  const row = page.getByRole("table").getByRole("row").nth(1);
  return {
    row,
    city: row.getByRole("textbox").nth(0),
    nickname: row.getByRole("textbox").nth(1),
    coach: row.getByRole("textbox").nth(2),
    primary: row.locator('input[type="color"]').nth(0),
    secondary: row.locator('input[type="color"]').nth(1),
  };
}

async function colorPair(team: { primary: Locator; secondary: Locator }): Promise<string> {
  return `${await team.primary.inputValue()}/${await team.secondary.inputValue()}`;
}

// Resolves once the Server Action started by the given step has answered.
async function saved(page: Page, step: () => Promise<unknown>): Promise<void> {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    step(),
  ]);
}

test("fills every team under its conference and division", async ({ page }) => {
  const name = uniqueName("Identity League");
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("10");
  await page.getByLabel("Conferences with divisions").check();
  for (const [index, sizes] of [
    [3, 2],
    [4, 1],
  ].entries()) {
    await page.getByRole("button", { name: "Add conference" }).click();
    await page.getByLabel("Conference name").nth(index).fill(index === 0 ? "American" : "National");
    const conference = page.locator(`[id="field-conferences.${index}.divisions"]`);
    await conference.getByRole("button", { name: "Add division" }).click();
    await conference.getByLabel("Division name").nth(0).fill("East");
    await conference.getByLabel("Teams").nth(0).fill(String(sizes[0]));
    await conference.getByLabel("Division name").nth(1).fill("West");
    await conference.getByLabel("Teams").nth(1).fill(String(sizes[1]));
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  const main = page.getByRole("main");
  // Each conference name is an input inside its heading.
  await expect(main.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(main.getByRole("heading", { level: 3, name: "American" })).toBeVisible();
  await expect(main.getByRole("heading", { level: 3, name: "National" })).toBeVisible();
  const conferenceNames = main.getByRole("textbox", { name: / conference name$/ });
  expect(
    await conferenceNames.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    ),
  ).toEqual(["American", "National"]);
  const tables = main.getByRole("table");
  await expect(tables).toHaveCount(4);
  // Each table has a header row and one row per team in its division.
  for (const [index, teams] of [3, 2, 4, 1].entries()) {
    await expect(tables.nth(index).getByRole("row")).toHaveCount(teams + 1);
  }
  await expect(tables.nth(0).getByRole("columnheader")).toHaveText([
    "City",
    "Nickname",
    "Head coach",
    "Colors",
    "Offense tag",
  ]);

  // Matched by name because color inputs are reported as text boxes too.
  const textCells = main.getByRole("textbox", { name: / (city|nickname|head coach name)$/ });
  await expect(textCells).toHaveCount(30);
  for (const value of await textCells.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  )) {
    expect(value.trim()).not.toBe("");
  }
  const colors = await main
    .getByRole("textbox", { name: / color$/ })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(colors).toHaveLength(20);
  for (let team = 0; team < 10; team++) {
    expect(colors[team * 2]).not.toBe(colors[team * 2 + 1]);
  }
  const cities = await main
    .getByRole("textbox", { name: / city$/ })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(new Set(cities).size).toBe(10);
});

test("names every cell and button after its team", async ({ page }) => {
  await createLeague(page, "Label League");
  const team = firstTeam(page);
  const name = `${await team.city.inputValue()} ${await team.nickname.inputValue()}`;

  for (const field of ["city", "nickname", "head coach name"]) {
    await expect(team.row.getByRole("textbox", { name: `${name} ${field}` })).toBeVisible();
    await expect(
      team.row.getByRole("button", { name: `Re-roll ${field} for ${name}` }),
    ).toBeVisible();
  }
  await expect(team.primary).toHaveAccessibleName(`${name} primary color`);
  await expect(team.secondary).toHaveAccessibleName(`${name} secondary color`);
  await expect(team.row.getByRole("button", { name: `Re-roll colors for ${name}` })).toBeVisible();
});

test("saves typed edits and keeps them after a reload", async ({ page }) => {
  await createLeague(page, "Edit League");
  const team = firstTeam(page);

  await team.city.fill("  Green Bay  ");
  await saved(page, () => team.city.blur());
  await expect(team.city).toHaveValue("Green Bay");

  await team.nickname.fill("Testers");
  await saved(page, () => team.nickname.press("Enter"));
  await expect(team.nickname).toBeFocused();
  await expect(
    team.row.getByRole("button", { name: "Re-roll city for Green Bay Testers" }),
  ).toBeVisible();

  await team.coach.fill("Pat Example");
  await saved(page, () => team.coach.blur());
  await saved(page, () => team.primary.fill("#123456"));
  await saved(page, () => team.secondary.fill("#abcdef"));

  await page.reload();
  await expect(team.city).toHaveValue("Green Bay");
  await expect(team.nickname).toHaveValue("Testers");
  await expect(team.coach).toHaveValue("Pat Example");
  await expect(team.primary).toHaveValue("#123456");
  await expect(team.secondary).toHaveValue("#abcdef");
});

test("allows a typed duplicate city", async ({ page }) => {
  await createLeague(page, "Duplicate League");
  const rows = page.getByRole("table").getByRole("row");
  const second = rows.nth(2).getByRole("textbox").nth(0);
  const firstCity = await firstTeam(page).city.inputValue();

  await second.fill(firstCity);
  await saved(page, () => second.blur());

  await page.reload();
  await expect(second).toHaveValue(firstCity);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("rejects an empty value beside its cell and keeps the saved one", async ({ page }) => {
  await createLeague(page, "Invalid League");
  const team = firstTeam(page);
  const original = await team.nickname.inputValue();

  await team.nickname.fill("   ");
  await team.nickname.blur();

  // Scoped to main: Next.js adds its own route announcer with the alert role.
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toHaveText("Enter a nickname.");
  await expect(team.row.getByRole("alert")).toHaveCount(1);
  await expect(team.nickname).toHaveAttribute("aria-invalid", "true");
  await expect(team.nickname).toHaveAccessibleDescription("Enter a nickname.");
  await expect(team.nickname).toHaveValue("   ");

  await page.reload();
  await expect(team.nickname).toHaveValue(original);
  await expect(alert).toHaveCount(0);

  await team.nickname.fill("");
  await team.nickname.blur();
  await expect(alert).toHaveText("Enter a nickname.");
  await team.nickname.fill("Recovered");
  await saved(page, () => team.nickname.blur());
  await expect(alert).toHaveCount(0);
  await expect(team.nickname).not.toHaveAttribute("aria-invalid");
});

test("re-rolls one cell at a time and keeps the result after a reload", async ({ page }) => {
  await createLeague(page, "Reroll League");
  const team = firstTeam(page);
  const before = {
    city: await team.city.inputValue(),
    nickname: await team.nickname.inputValue(),
    coach: await team.coach.inputValue(),
    colors: await colorPair(team),
  };

  await team.row.getByRole("button", { name: /^Re-roll city for/ }).click();
  await expect(team.city).not.toHaveValue(before.city);
  await expect(team.nickname).toHaveValue(before.nickname);
  await expect(team.coach).toHaveValue(before.coach);
  expect(await colorPair(team)).toBe(before.colors);

  await team.row.getByRole("button", { name: /^Re-roll nickname for/ }).click();
  await expect(team.nickname).not.toHaveValue(before.nickname);
  await expect(team.coach).toHaveValue(before.coach);

  await team.row.getByRole("button", { name: /^Re-roll head coach name for/ }).click();
  await expect(team.coach).not.toHaveValue(before.coach);
  expect(await colorPair(team)).toBe(before.colors);

  await team.row.getByRole("button", { name: /^Re-roll colors for/ }).click();
  await expect.poll(() => colorPair(team)).not.toBe(before.colors);

  const after = {
    city: await team.city.inputValue(),
    nickname: await team.nickname.inputValue(),
    coach: await team.coach.inputValue(),
    colors: await colorPair(team),
  };
  await page.reload();
  await expect(team.city).toHaveValue(after.city);
  await expect(team.nickname).toHaveValue(after.nickname);
  await expect(team.coach).toHaveValue(after.coach);
  expect(await colorPair(team)).toBe(after.colors);
});

test("sends a typed value once and keeps text typed while it saves", async ({ page }) => {
  await createLeague(page, "Slow League");
  const team = firstTeam(page);

  // Hold every save back until released, and count them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") {
      saves += 1;
      await held;
    }
    await route.continue();
  });

  await team.city.fill("Alpha");
  await team.city.press("Enter");
  await expect(team.row.locator('[aria-busy="true"]')).toHaveCount(1);
  await team.city.blur();
  await team.city.evaluate((input: HTMLInputElement) => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await team.city.pressSequentially("bet");
  expect(saves).toBe(1);

  await saved(page, async () => release());
  await expect(team.row.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(team.city).toHaveValue("Alphabet");
  expect(saves).toBe(1);

  await saved(page, () => team.city.blur());
  expect(saves).toBe(2);
  await page.reload();
  await expect(team.city).toHaveValue("Alphabet");
});

test("clears a color error when the saved color is chosen again", async ({ page, context }) => {
  await createLeague(page, "Vanishing League");
  const team = firstTeam(page);
  const original = await team.primary.inputValue();

  // Deleting the league in another tab makes the next save here fail.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Delete league" }).click();
  await other.getByRole("button", { name: "Delete permanently" }).click();
  await expect(other).toHaveURL(/\/$/);
  await other.close();

  await team.primary.fill(original === "#123456" ? "#654321" : "#123456");
  const alert = team.row.getByRole("alert");
  await expect(alert).toHaveText("That team could not be found.");
  await expect(team.primary).toHaveAttribute("aria-invalid", "true");

  await team.primary.fill(original);
  await expect(alert).toHaveCount(0);
  await expect(team.primary).not.toHaveAttribute("aria-invalid");
  await expect(team.secondary).not.toHaveAttribute("aria-invalid");
});

test("saves the original value again when it is retyped during a save", async ({ page }) => {
  await createLeague(page, "Revert League");
  const team = firstTeam(page);
  const original = await team.city.inputValue();

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });

  await team.city.fill("Alpha");
  await team.city.press("Enter");
  await expect(team.row.locator('[aria-busy="true"]')).toHaveCount(1);
  await team.city.fill(original);
  await team.city.blur();

  release();
  await expect(team.row.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(team.city).toHaveValue(original);
  await expect(team.city).toHaveAccessibleName(
    `${original} ${await team.nickname.inputValue()} city`,
  );
  await page.reload();
  await expect(team.city).toHaveValue(original);
});

test("keeps focus on a re-roll button after a keyboard re-roll", async ({ page }) => {
  await createLeague(page, "Focused Reroll League");
  const team = firstTeam(page);
  const before = await team.city.inputValue();
  const button = team.row.getByRole("button", { name: /^Re-roll city for/ });

  await button.focus();
  await saved(page, () => button.press("Enter"));

  await expect(team.city).not.toHaveValue(before);
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  await expect(button).toBeFocused();
});

test("ignores a second press of a re-roll button while it saves", async ({ page }) => {
  await createLeague(page, "Busy Reroll League");
  const team = firstTeam(page);
  const button = team.row.getByRole("button", { name: /^Re-roll city for/ });

  // Hold every save back until released, and count them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") {
      saves += 1;
      await held;
    }
    await route.continue();
  });

  await button.click();
  await expect(button).toHaveAttribute("aria-disabled", "true");
  // Playwright's own click waits for an aria-disabled button, so press it directly.
  await button.evaluate((element: HTMLButtonElement) => element.click());
  expect(saves).toBe(1);

  await saved(page, async () => release());
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  expect(saves).toBe(1);
});

test("re-rolls a cell clicked straight after typing in it", async ({ page }) => {
  await createLeague(page, "Quick League");
  const team = firstTeam(page);
  const original = await team.city.inputValue();

  await team.city.fill("Zed");
  await team.row.getByRole("button", { name: /^Re-roll city for/ }).click();

  await expect(team.city).not.toHaveValue("Zed");
  await expect(team.city).not.toHaveValue(original);
  const rolled = await team.city.inputValue();
  await page.reload();
  await expect(team.city).toHaveValue(rolled);
});

test("saves text typed in one cell when another cell is re-rolled", async ({ page }) => {
  await createLeague(page, "Neighbor League");
  const team = firstTeam(page);
  const neighbor = page.getByRole("table").getByRole("row").nth(2);
  const neighborNickname = neighbor.getByRole("textbox").nth(1);
  const before = await neighborNickname.inputValue();

  await team.city.fill("Typed Town");
  await neighbor.getByRole("button", { name: /^Re-roll nickname for/ }).click();
  await expect(neighborNickname).not.toHaveValue(before);

  await page.reload();
  await expect(team.city).toHaveValue("Typed Town");
});

test("names the offense tag select after its team", async ({ page }) => {
  await createLeague(page, "Tag Label League");
  const team = firstTeam(page);
  const name = `${await team.city.inputValue()} ${await team.nickname.inputValue()}`;

  const select = team.row.getByRole("combobox");
  await expect(select).toHaveAccessibleName(`${name} offense tag`);
  await expect(select).toHaveValue("");
  await expect(select.getByRole("option")).toHaveText(["None", "R", "R+", "P", "P+"]);
});

test("shows a failed offense tag save beside the select and goes back to the saved tag", async ({
  page,
  context,
}) => {
  await createLeague(page, "Vanishing Tag League");
  const select = firstTeam(page).row.getByRole("combobox");

  // Deleting the league in another tab makes the next save here fail.
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Delete league" }).click();
  await other.getByRole("button", { name: "Delete permanently" }).click();
  await expect(other).toHaveURL(/\/$/);
  await other.close();

  await select.selectOption("R");
  const alert = firstTeam(page).row.getByRole("alert");
  await expect(alert).toHaveText("That team could not be found.");
  await expect(select).toHaveValue("");
  await expect(select).toHaveAttribute("aria-invalid", "true");

  // Choosing the saved tag again fires no change, so leaving the select clears it.
  await select.focus();
  await select.blur();
  await expect(alert).toHaveCount(0);
  await expect(select).not.toHaveAttribute("aria-invalid");
});

test("keeps focus on the offense tag select while and after it saves", async ({ page }) => {
  await createLeague(page, "Focused Tag League");
  const select = firstTeam(page).row.getByRole("combobox");

  await select.focus();
  await saved(page, () => select.selectOption("R+"));

  await expect(select).toHaveValue("R+");
  await expect(select).toBeFocused();
  await expect(select).not.toHaveAttribute("aria-disabled", "true");
});

test("ignores a second offense tag choice while the first is saving", async ({ page }) => {
  await createLeague(page, "Busy Tag League");
  const select = firstTeam(page).row.getByRole("combobox");

  // Hold every save back until released, and count them.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/leagues/*", async (route) => {
    if (route.request().method() === "POST") {
      saves += 1;
      await held;
    }
    await route.continue();
  });

  await select.selectOption("R");
  await expect(select).toHaveAttribute("aria-disabled", "true");
  // A second choice made the way the browser reports one. Playwright's own
  // selectOption waits for an aria-disabled select to be enabled.
  await select.evaluate((element: HTMLSelectElement) => {
    element.value = "P";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(select).toHaveValue("R");
  expect(saves).toBe(1);

  await saved(page, async () => release());
  await expect(select).not.toHaveAttribute("aria-disabled", "true");
  await expect(select).toHaveValue("R");
  expect(saves).toBe(1);
  await page.reload();
  await expect(firstTeam(page).row.getByRole("combobox")).toHaveValue("R");
});

// Two conferences that each have an East, 8 teams in all.
async function createStructuredLeague(page: Page, label: string): Promise<void> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  await page.getByLabel("Conferences with divisions").check();
  for (const [index, conferenceName] of ["American", "National"].entries()) {
    await page.getByRole("button", { name: "Add conference" }).click();
    await page.getByLabel("Conference name").nth(index).fill(conferenceName);
    const conference = page.locator(`[id="field-conferences.${index}.divisions"]`);
    await conference.getByRole("button", { name: "Add division" }).click();
    await conference.getByLabel("Division name").nth(0).fill("East");
    await conference.getByLabel("Teams").nth(0).fill("2");
    await conference.getByLabel("Division name").nth(1).fill("West");
    await conference.getByLabel("Teams").nth(1).fill("2");
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("names every conference and division input after where it sits", async ({ page }) => {
  await createStructuredLeague(page, "Group Label League");

  await expect(page.getByRole("textbox", { name: / (conference|division) name$/ })).toHaveCount(6);
  for (const name of [
    "American conference name",
    "National conference name",
    "American East division name",
    "American West division name",
    "National East division name",
    "National West division name",
  ]) {
    await expect(page.getByRole("textbox", { name, exact: true })).toBeVisible();
  }
});

test("renames a conference and a division and keeps both after a reload", async ({ page }) => {
  await createStructuredLeague(page, "Renamed Groups");
  // A field's name follows its saved value, so these find the fields by position.
  const conference = page.getByRole("heading", { level: 3 }).first().getByRole("textbox");
  const division = page.getByRole("textbox", { name: / division name$/ }).nth(2);

  await saved(page, async () => {
    await conference.fill("  Eastern ");
    await conference.press("Enter");
  });
  await saved(page, async () => {
    await division.fill("Metro");
    await division.blur();
  });

  await expect(conference).toHaveValue("Eastern");
  await expect(page.getByRole("table", { name: "Metro teams" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Eastern conference name", exact: true }),
  ).toHaveValue("Eastern");
  await expect(
    page.getByRole("textbox", { name: "National Metro division name", exact: true }),
  ).toHaveValue("Metro");
  await expect(page.getByRole("heading", { level: 3, name: "Eastern" })).toBeVisible();
});

test("shows a renamed division in the other sections and on the cards page", async ({ page }) => {
  await createStructuredLeague(page, "Renamed Cards");
  const division = page.getByRole("textbox", { name: "American West division name", exact: true });
  await saved(page, async () => {
    await division.fill("Pacific");
    await division.press("Enter");
  });
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();

  await expect(page.getByRole("table", { name: "Pacific offense" })).toBeVisible();
  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(page.getByRole("list", { name: "Pacific cards" }).getByRole("article")).toHaveCount(
    2,
  );
  await expect(page.getByRole("list", { name: "West cards" })).toHaveCount(1);
});

test("shows an empty group name beside its field and keeps the saved name", async ({ page }) => {
  await createStructuredLeague(page, "Blank Groups");

  for (const [name, error] of [
    ["American conference name", "Conference name is required."],
    ["American East division name", "Division name is required."],
  ] as const) {
    const field = page.getByRole("textbox", { name, exact: true });
    const saved_ = await field.inputValue();
    await saved(page, async () => {
      await field.fill("   ");
      await field.press("Enter");
    });

    const alert = page.getByRole("alert").filter({ hasText: error });
    await expect(alert).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");

    await field.fill(saved_);
    await field.blur();
    await expect(alert).toHaveCount(0);
    await expect(field).not.toHaveAttribute("aria-invalid");
  }
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "American conference name", exact: true }),
  ).toHaveValue("American");
});

test("renames the conference and division of an accepted league", async ({ page }) => {
  await createStructuredLeague(page, "Accepted Groups");
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  // An accepted league opens on the summary; editing happens in the detailed view.
  await page
    .getByRole("navigation", { name: "Teams view" })
    .getByRole("link", { name: "Detailed" })
    .click();

  const conference = page.getByRole("textbox", { name: "National conference name", exact: true });
  await saved(page, async () => {
    await conference.fill("Western");
    await conference.press("Enter");
  });
  const division = page.getByRole("textbox", { name: "Western West division name", exact: true });
  await saved(page, async () => {
    await division.fill("Coast");
    await division.press("Enter");
  });

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Western conference name", exact: true }),
  ).toHaveValue("Western");
  await expect(
    page.getByRole("textbox", { name: "Western Coast division name", exact: true }),
  ).toHaveValue("Coast");
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();
});
