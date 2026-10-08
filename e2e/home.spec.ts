import { expect, test } from "@playwright/test";

test("home page renders without errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
