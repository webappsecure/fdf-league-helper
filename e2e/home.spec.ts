import { expect, test } from "@playwright/test";

test("home page shows the empty state on a fresh database", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("FDF League Helper");
  await expect(page.getByRole("heading", { name: "Leagues" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("No leagues yet.");
  await expect(page.getByRole("link", { name: "Create your first league" })).toHaveAttribute(
    "href",
    "/leagues/new",
  );
  expect(pageErrors).toEqual([]);
});
