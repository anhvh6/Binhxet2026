import { test, expect } from "@playwright/test";
test("homepage is readable at required viewport sizes", async ({ page }) => {
  await page.route("**/api/voting/progress", (r) =>
    r.fulfill({
      json: {
        ready: true,
        total: 40,
        submitted: 12,
        quota: 18,
        status: "open",
      },
    }),
  );
  for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Bình chọn thi đua/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bình chọn", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("leading zero input and separate admin dialog", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("Nhập mã bí mật của bạn");
  await input.fill("0038");
  await page.getByRole("button", { name: "Hiện mã", exact: true }).click();
  await expect(input).toHaveValue("0038");
  await page
    .getByRole("button", { name: "Tổng hợp kết quả", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Mã quản trị")).toHaveAttribute(
    "type",
    "password",
  );
});
test("unauthenticated results endpoint is denied", async ({ request }) => {
  const response = await request.get("/api/admin/dashboard");
  expect(response.status()).toBe(401);
});
