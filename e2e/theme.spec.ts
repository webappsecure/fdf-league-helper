import { expect, test, type Page } from "@playwright/test";

const LIGHT = { background: "rgb(255, 255, 255)", color: "rgb(23, 23, 23)" };
const DARK = { background: "rgb(10, 10, 10)", color: "rgb(237, 237, 237)" };
const TOGGLE_NAME = "Switch between light and dark mode";

type Colors = { background: string; color: string };

async function bodyColors(page: Page): Promise<Colors> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color };
  });
}

async function pinnedTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

for (const [scheme, expected, errorSurface] of [
  ["light", LIGHT, "rgb(254, 242, 242)"],
  ["dark", DARK, "rgb(70, 8, 9)"],
] as const) {
  test.describe(`with a ${scheme} system setting`, () => {
    test.use({ colorScheme: scheme });

    test("the league list follows the system", async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Leagues" })).toBeVisible();
      expect(await bodyColors(page)).toEqual(expected);
      expect(await pinnedTheme(page)).toBeNull();
      expect(errors).toEqual([]);
    });

    test("the create form and its errors follow the system", async ({ page }) => {
      await page.goto("/leagues/new");
      await page.getByRole("button", { name: "Create league" }).click();

      const summary = page.getByRole("main").getByRole("alert");
      await expect(summary).toContainText("League name is required.");
      expect(await bodyColors(page)).toEqual(expected);
      await expect(summary).toHaveCSS("background-color", errorSurface);
    });

    test("the league page and delete dialog follow the system", async ({ page }) => {
      const name = `Theme League ${scheme} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      await page.goto("/leagues/new");
      await page.getByLabel("League name").fill(name);
      await page.getByLabel("Number of teams").fill("8");
      await page.getByRole("button", { name: "Create league" }).click();
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

      await page.getByRole("button", { name: "Delete league" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      expect(await bodyColors(page)).toEqual(expected);
      await expect(dialog).toHaveCSS("background-color", expected.background);
      await expect(dialog).toHaveCSS("color", expected.color);
    });
  });
}

test.describe("theme toggle", () => {
  test.use({ colorScheme: "light" });

  test("is the first and leftmost item in the header", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: TOGGLE_NAME });
    const appName = page.getByRole("link", { name: "FDF League Helper" });

    await expect(page.locator("header").locator("button, a").first()).toHaveAccessibleName(
      TOGGLE_NAME,
    );
    const toggleBox = await toggle.boundingBox();
    const nameBox = await appName.boundingBox();
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(nameBox!.x);
  });

  test("switches to dark and back, and remembers the choice", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    const toggle = page.getByRole("button", { name: TOGGLE_NAME });
    expect(await bodyColors(page)).toEqual(LIGHT);

    await toggle.click();
    expect(await pinnedTheme(page)).toBe("dark");
    expect(await bodyColors(page)).toEqual(DARK);

    await page.reload();
    expect(await pinnedTheme(page)).toBe("dark");
    expect(await bodyColors(page)).toEqual(DARK);

    await page.goto("/leagues/new");
    expect(await bodyColors(page)).toEqual(DARK);

    await page.getByRole("button", { name: TOGGLE_NAME }).click();
    expect(await pinnedTheme(page)).toBe("light");
    expect(await bodyColors(page)).toEqual(LIGHT);
    await page.reload();
    expect(await bodyColors(page)).toEqual(LIGHT);
    expect(errors).toEqual([]);
  });

  test("works from the keyboard", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: TOGGLE_NAME });

    await toggle.focus();
    await page.keyboard.press("Enter");
    expect(await bodyColors(page)).toEqual(DARK);

    await page.keyboard.press("Space");
    expect(await bodyColors(page)).toEqual(LIGHT);
  });

  test("shows the icon for the mode a click switches to", async ({ page }) => {
    await page.goto("/");
    const moon = page.locator(".theme-icon-moon");
    const sun = page.locator(".theme-icon-sun");

    await expect(moon).toHaveCSS("color", LIGHT.color);
    await expect(sun).toHaveCSS("color", "rgba(0, 0, 0, 0)");

    await page.getByRole("button", { name: TOGGLE_NAME }).click();
    await expect(sun).toHaveCSS("color", DARK.color);
    await expect(moon).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  });

  test("still switches when storage is blocked", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const blocked = () => {
        throw new Error("storage blocked");
      };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
    });
    await page.goto("/");

    await page.getByRole("button", { name: TOGGLE_NAME }).click();

    expect(await bodyColors(page)).toEqual(DARK);
    expect(errors).toEqual([]);
  });
});

test.describe("stored choice against the system setting", () => {
  test.describe("dark system", () => {
    test.use({ colorScheme: "dark" });

    test("a stored light choice wins", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fdf-theme", "light"));
      await page.goto("/");

      expect(await pinnedTheme(page)).toBe("light");
      expect(await bodyColors(page)).toEqual(LIGHT);
    });

    test("an unrecognized stored value is ignored", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fdf-theme", "purple"));
      await page.goto("/");

      expect(await pinnedTheme(page)).toBeNull();
      expect(await bodyColors(page)).toEqual(DARK);
      expect(await page.evaluate(() => localStorage.getItem("fdf-theme"))).toBe("purple");
    });
  });

  test.describe("light system", () => {
    test.use({ colorScheme: "light" });

    test("a stored dark choice wins", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("fdf-theme", "dark"));
      await page.goto("/");

      expect(await pinnedTheme(page)).toBe("dark");
      expect(await bodyColors(page)).toEqual(DARK);
    });
  });
});
