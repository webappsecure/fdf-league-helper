import { expect, test, type Locator, type Page } from "@playwright/test";

// Specs share one database and run in parallel, so every league name is unique.
function uniqueName(label: string): string {
  return `${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createLeague(page: Page, label: string, divisions = false): Promise<string> {
  const name = uniqueName(label);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill(name);
  await page.getByLabel("Number of teams").fill("8");
  if (divisions) {
    await page.getByLabel("Divisions", { exact: true }).check();
    await page.getByRole("button", { name: "Add division" }).click();
    await page.getByRole("button", { name: "Add division" }).click();
    await page.getByLabel("Division name").nth(0).fill("Lakeshore");
    await page.getByLabel("Teams", { exact: true }).nth(0).fill("4");
    await page.getByLabel("Division name").nth(1).fill("Prairie");
    await page.getByLabel("Teams", { exact: true }).nth(1).fill("4");
  }
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return name;
}

async function generate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft" })).toBeVisible();
}

// The text of every body cell of the tables whose names end this way, row by
// row across all of them.
async function tableRows(page: Page, name: RegExp): Promise<string[][]> {
  const tables = page.getByRole("table", { name });
  await expect(tables.first()).toBeVisible();
  return tables
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => Array.from(row.children, (cell) => cell.textContent ?? "")),
    );
}

function inputValues(page: Page, name: RegExp): Promise<string[]> {
  return page
    .getByRole("textbox", { name })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

// A league page list such as "PROLIFIC" and "SOLID, RELIABLE•" as card lines.
function cardLines(profile: string, qualities: string): string[] {
  return [
    ...(profile === "AVERAGE" ? [] : [profile]),
    ...(qualities === "None" ? [] : qualities.split(", ")),
  ];
}

function cards(page: Page): Locator {
  return page.getByRole("article", { name: / card$/ });
}

test("offers no cards before a league is generated", async ({ page }) => {
  await createLeague(page, "Cardless League");

  await expect(page.getByRole("link", { name: "View team cards" })).toHaveCount(0);

  await page.goto(`${page.url()}/cards`);
  await expect(page.getByText("Generate this league to see its cards.")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print cards" })).toHaveCount(0);
});

test("shows a card for every team with that team's stored values", async ({ page }) => {
  const league = await createLeague(page, "Carded League");
  await generate(page);
  const cities = await inputValues(page, / city$/);
  const nicknames = await inputValues(page, / nickname$/);
  const coaches = await inputValues(page, / head coach name$/);
  const offense = await tableRows(page, /offense$/);
  const defense = await tableRows(page, /defense$/);
  const special = await tableRows(page, /special teams$/);
  expect(cities).toHaveLength(8);

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(page.getByRole("heading", { level: 1, name: `${league} team cards` })).toBeVisible();
  await expect(page.getByText("This league is a draft. Its cards may change.")).toBeVisible();
  await expect(cards(page)).toHaveCount(8);

  for (let index = 0; index < 8; index++) {
    const name = `${cities[index]} ${nicknames[index]}`;
    const card = page.getByRole("article", { name: `${name} card`, exact: true });
    await expect(card.locator("header p")).toHaveText([
      cities[index],
      `Head Coach: ${coaches[index]}`,
      nicknames[index],
      "Season 1",
    ]);
    await expect(card.getByRole("region", { name: "Offense" }).getByRole("listitem")).toHaveText(
      cardLines(offense[index][1], offense[index][2]),
    );
    await expect(card.getByRole("region", { name: "Defense" }).getByRole("listitem")).toHaveText(
      cardLines(defense[index][1], defense[index][2]),
    );
    const [, kickReturn, puntReturn, fg, xp] = special[index];
    await expect(card.getByRole("term")).toHaveText([
      "KRKick return",
      "PRPunt return",
      "FGField goal",
      "XPExtra point",
    ]);
    await expect(card.getByRole("definition")).toHaveText([
      kickReturn === "None" ? "none" : kickReturn,
      puntReturn === "None" ? "none" : puntReturn,
      fg,
      xp,
    ]);

    await expect(card).not.toContainText(/Grade|MEDDLING|SAVVY|SELFISH|LOYAL|\bFP\b/);
    const logo = card.getByRole("img", { name: "Fast Drive Football" });
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  }

  await page.getByRole("link", { name: league }).click();
  await expect(page.getByRole("heading", { level: 1, name: league, exact: true })).toBeVisible();
});

test("groups cards under divisions without printing the division on a card", async ({ page }) => {
  await createLeague(page, "Divided Cards", true);
  await generate(page);

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(page.getByRole("list", { name: "Lakeshore cards" }).getByRole("article")).toHaveCount(
    4,
  );
  await expect(page.getByRole("list", { name: "Prairie cards" }).getByRole("article")).toHaveCount(4);
  for (const card of await cards(page).all()) {
    await expect(card).not.toContainText(/Lakeshore|Prairie/);
  }
});

test("shows an accepted league's cards without the draft line", async ({ page }) => {
  await createLeague(page, "Accepted Cards");
  await generate(page);
  await page.getByRole("button", { name: "Accept league" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept league" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Accepted" })).toBeVisible();

  await page.getByRole("link", { name: "View team cards" }).click();

  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByText("Its cards may change.")).toHaveCount(0);
});

test("gives the not-found page for a malformed league id", async ({ page }) => {
  await page.goto("/leagues/abc/cards");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

function cardNames(scope: Page | Locator): Promise<string[]> {
  return scope
    .getByRole("article", { name: / card$/ })
    .evaluateAll((articles) => articles.map((article) => article.getAttribute("aria-label") ?? ""));
}

test("prints only sheets of six cards with cut lines between them", async ({ page }) => {
  const league = await createLeague(page, "Printed Cards", true);
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(cards(page)).toHaveCount(8);
  const sheets = page.getByRole("list", { name: /^Sheet \d+$/ });
  await expect(sheets).toHaveCount(0);
  const onScreen = await cardNames(page);

  await page.emulateMedia({ media: "print" });

  await expect(sheets).toHaveCount(2);
  await expect(sheets.nth(0).getByRole("article")).toHaveCount(6);
  await expect(sheets.nth(1).getByRole("article")).toHaveCount(2);
  expect(await cardNames(page)).toEqual(onScreen);

  await expect(page.getByRole("banner")).toBeHidden();
  await expect(page.getByRole("link", { name: league })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  await expect(page.getByText("Its cards may change.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print cards" })).toBeHidden();
  await expect(page.getByText("Prints six cards per page")).toBeHidden();
  await expect(page.getByRole("list", { name: "Lakeshore cards" })).toBeHidden();

  // A sheet is the whole page, and a card's printing stands the same distance
  // inside its cell on every side, give or take the width of a cut line.
  const sheet = await sheets.nth(0).evaluate((list) => {
    const box = list.getBoundingClientRect();
    return [box.width / 96, box.height / 96];
  });
  expect(sheet[0]).toBeCloseTo(11, 2);
  expect(sheet[1]).toBeCloseTo(8.5, 2);
  const margins = await sheets
    .nth(0)
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") })
    .evaluateAll((cells) =>
      cells.map((cell) => {
        const outer = cell.getBoundingClientRect();
        const article = cell.querySelector("article")!;
        const card = article.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(article.firstElementChild!).paddingTop);
        return [
          card.left - outer.left,
          card.top - outer.top,
          outer.right - card.right,
          outer.bottom - card.bottom,
        ].map((gap) => (gap + padding) / 96);
      }),
    );
  for (const sides of margins) {
    expect(Math.min(...sides)).toBeGreaterThan(0.2);
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(0.03);
  }

  // Lines run between cells only: right of the left column, under rows one and two.
  const lines = await sheets
    .nth(0)
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") })
    .evaluateAll((cells) =>
      cells.map((cell) => {
        const style = getComputedStyle(cell);
        return [
          style.borderRightWidth === "0px" ? "" : style.borderRightStyle,
          style.borderBottomWidth === "0px" ? "" : style.borderBottomStyle,
          style.borderTopWidth === "0px" && style.borderLeftWidth === "0px" ? "" : "outside",
        ].join("|");
      }),
    );
  expect(lines).toEqual([
    "dotted|dotted|",
    "|dotted|",
    "dotted|dotted|",
    "|dotted|",
    "dotted||",
    "||",
  ]);
});

test("opens the print dialog from the print button", async ({ page }) => {
  await page.addInitScript(() => {
    const counter = window as unknown as { printCalls: number };
    counter.printCalls = 0;
    window.print = () => {
      counter.printCalls += 1;
    };
  });
  await createLeague(page, "Print Button");
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(
    page.getByText("Prints six cards per page on letter paper in landscape."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Print cards" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printCalls: number }).printCalls))
    .toBe(1);
});

test("prints eight cards on two landscape letter pages", async ({ page }) => {
  await createLeague(page, "Paged Cards");
  await generate(page);
  await page.getByRole("link", { name: "View team cards" }).click();
  await expect(cards(page)).toHaveCount(8);

  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");

  // Letter in landscape is 792 by 612 points.
  expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  expect(pdf.match(/\/MediaBox\s*\[0 0 792 612\]/g)).toHaveLength(2);
});
