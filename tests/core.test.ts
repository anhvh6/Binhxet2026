import { describe, it, expect } from "vitest";
import { harness, seed } from "./gas-harness";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { exportExcel } from "../src/server/export";
import type { Dashboard } from "../src/lib/types";
import ExcelJS from "exceljs";
describe("Google Sheets voting service", () => {
  it("reconciles 40 eligible candidates, 7 teams, 18 choices and preserves leading zeros", () => {
    const h = harness(),
      s = seed(h);
    expect(s.source.candidates).toHaveLength(40);
    expect(s.source.teams).toHaveLength(7);
    expect(s.choices).toHaveLength(18);
    expect(s.source.candidates[0].id).toBe("000001");
    expect(
      h.call("dispatch", "login", {
        code: "0000",
        newTokenHash: "v",
        ipHash: "a",
      }),
    ).toMatchObject({ code: "0000", voterId: "0000" });
  });
  it("rejects nonexistent codes and rate limits persistent buckets", () => {
    const h = harness();
    seed(h);
    for (let i = 0; i < 8; i++)
      expect(() =>
        h.call("dispatch", "login", {
          code: "9999",
          newTokenHash: "v",
          ipHash: "a",
        }),
      ).toThrow("Không thể xác thực");
    expect(() =>
      h.call("dispatch", "login", {
        code: "9999",
        newTokenHash: "v",
        ipHash: "a",
      }),
    ).toThrow("Không thể xác thực");
    expect(h.data.get("GIOI HAN TRUY CAP")!.length).toBeGreaterThan(1);
  });
  it("validates complete team quotas, rejects 17 choices, excess, duplicates and foreign candidates", () => {
    const h = harness(),
      s = seed(h),
      e = h.call<{ snapshot: unknown }>("election");
    expect(h.call("validate", e.snapshot, s.choices)).toBe(true);
    expect(() => h.call("validate", e.snapshot, s.choices.slice(1))).toThrow(
      "đã chọn",
    );
    expect(() =>
      h.call("validate", e.snapshot, [
        ...s.choices,
        s.source.candidates[12].id,
      ]),
    ).toThrow();
    expect(() =>
      h.call("validate", e.snapshot, [...s.choices, s.choices[0]]),
    ).toThrow();
    expect(() =>
      h.call("validate", e.snapshot, ["outside", ...s.choices.slice(1)]),
    ).toThrow();
  });
  it("commits once, retries idempotently and disallows a new ballot from submitted code", () => {
    const h = harness(),
      s = seed(h);
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    const input = {
      tokenHash: "v",
      choices: s.choices,
      revision: 0,
      idempotencyKey: randomUUID(),
    };
    const first = h.call("dispatch", "submit", input);
    expect(h.call("dispatch", "submit", input)).toEqual(first);
    expect(h.data.get("PHIEU BINH CHON")!.filter((r) => r[0]).length).toBe(2);
    expect(() =>
      h.call("dispatch", "submit", { ...input, idempotencyKey: randomUUID() }),
    ).toThrow("Phiếu đã nộp");
    expect(() =>
      h.call("dispatch", "submit", { ...input, choices: s.choices.slice(1) }),
    ).toThrow("Khóa yêu cầu");
  });
  it("replaces a revision, changes candidate counts without increasing participation and consumes all edit grants", () => {
    const h = harness(),
      s = seed(h);
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    h.call("dispatch", "submit", {
      tokenHash: "v",
      choices: s.choices,
      revision: 0,
      idempotencyKey: randomUUID(),
    });
    h.call("dispatch", "unlock", { tokenHash: "v", verified: true });
    const replacement = s.source.candidates.filter(
        (c) => c.team === "Team 1",
      )[12].id,
      choices = [replacement, ...s.choices.slice(1)];
    h.call("dispatch", "submit", {
      tokenHash: "v",
      choices,
      revision: 1,
      idempotencyKey: randomUUID(),
    });
    const result = h.call<Dashboard>("dispatch", "dashboard", {
      tokenHash: s.admin,
    });
    expect(result.submitted).toBe(1);
    expect(result.totalChoices).toBe(18);
    expect(result.results.find((c) => c.id === s.choices[0])?.votes).toBe(0);
    expect(result.results.find((c) => c.id === replacement)?.votes).toBe(1);
    expect(h.data.get("PHIEN BAN PHIEU")).toHaveLength(3);
    expect(() =>
      h.call("dispatch", "submit", {
        tokenHash: "v",
        choices,
        revision: 2,
        idempotencyKey: randomUUID(),
      }),
    ).toThrow("Phiếu đã nộp");
  });
  it("requires admin session for results, export and source, and restricts me to session owner", () => {
    const h = harness(),
      s = seed(h);
    for (const action of [
      "dashboard",
      "export",
      "source",
      "freeze",
      "close",
      "sync",
      "credentialStatus",
    ])
      expect(() => h.call("dispatch", action, { tokenHash: "fake" })).toThrow(
        "Phiên đăng nhập",
      );
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    expect(
      h.call("dispatch", "me", { tokenHash: "v", voterId: "0000" }),
    ).toMatchObject({ voterId: "0000" });
    expect(() => h.call("dispatch", "dashboard", { tokenHash: "v" })).toThrow();
    expect(s.admin).toBeTruthy();
  });
  it("calculates 15/20 = 75%, team totals 120/60 and includes zero-vote candidates", () => {
    const h = harness(),
      s = seed(h),
      e = h.call<{ snapshot: unknown }>("election"),
      first = s.choices[0],
      replacement = s.source.candidates[12].id,
      bs = Array.from({ length: 20 }, (_, i) => ({
        choices:
          i < 15
            ? s.choices
            : [replacement, ...s.choices.filter((id) => id !== first)],
      }));
    const a = h.call<Dashboard>("aggregate", e.snapshot, bs);
    expect(a.results.find((c) => c.id === first)?.rate).toBe(0.75);
    expect(a.teams[0].votes).toBe(120);
    expect(a.teams[2].votes).toBe(60);
    expect(a.teams.reduce((n, t) => n + t.votes, 0)).toBe(a.totalChoices);
    expect(a.results).toHaveLength(40);
    expect(
      h
        .call<Dashboard>("aggregate", e.snapshot, [])
        .results.every((c) => c.rate === 0),
    ).toBe(true);
  });
  it("retains the previous ballot when Sheets atomic write fails and retry remains safe", () => {
    const h = harness(),
      s = seed(h);
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    const input = {
      tokenHash: "v",
      choices: s.choices,
      revision: 0,
      idempotencyKey: randomUUID(),
    };
    h.setFail(true);
    expect(() => h.call("dispatch", "submit", input)).toThrow("Không ghi được");
    expect(h.data.get("PHIEU BINH CHON")).toHaveLength(1);
    h.setFail(false);
    h.call("dispatch", "submit", input);
    expect(h.data.get("PHIEU BINH CHON")).toHaveLength(2);
  });
  it("never changes the frozen snapshot, blocks writes when closed and blocks stale revision", () => {
    const h = harness(),
      s = seed(h);
    expect(() =>
      h.call("dispatch", "freeze", {
        tokenHash: s.admin,
        acknowledgeWarnings: true,
      }),
    ).toThrow("Đã có snapshot");
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    expect(() =>
      h.call("dispatch", "submit", {
        tokenHash: "v",
        choices: s.choices,
        revision: 9,
        idempotencyKey: randomUUID(),
      }),
    ).toThrow("phiên khác");
    h.call("dispatch", "close", { tokenHash: s.admin });
    expect(() =>
      h.call("dispatch", "submit", {
        tokenHash: "v",
        choices: s.choices,
        revision: 0,
        idempotencyKey: randomUUID(),
      }),
    ).toThrow("đã đóng");
  });
  it("rejects invalid signatures and returns busy for a competing lock", () => {
    const h = harness();
    seed(h);
    expect(
      h.call<{ text: string }>("doPost", {
        postData: {
          contents: JSON.stringify({ payload: "{}", signature: "bad" }),
        },
      }).text,
    ).toContain("Không được phép");
    const payload = JSON.stringify({
        timestamp: Date.now(),
        nonce: "n",
        action: "progress",
      }),
      signature = h.call("hmac", payload);
    h.setLocked(true);
    expect(
      h.call<{ text: string }>("doPost", {
        postData: { contents: JSON.stringify({ payload, signature }) },
      }).text,
    ).toContain("đang bận");
  });
  it("detects source duplicates, conflicts and requires warning acknowledgement", () => {
    const h = harness(),
      s = seed(h);
    h.data.get("Binh xet")!.push(h.data.get("Binh xet")![6]);
    expect(
      h.call<{ conflicts: string[] }>("readSource").conflicts.length,
    ).toBeGreaterThan(0);
    expect(s.source.teams).toHaveLength(7);
  });
  it("exports 4 formatted Excel tabs, exact choices, codes as text and audit entry", async () => {
    const h = harness(),
      s = seed(h);
    h.call("dispatch", "login", {
      code: "0000",
      newTokenHash: "v",
      ipHash: "a",
    });
    h.call("dispatch", "submit", {
      tokenHash: "v",
      choices: s.choices,
      revision: 0,
      idempotencyKey: randomUUID(),
    });
    const data = h.call<Dashboard>("dispatch", "export", {
        tokenHash: s.admin,
      }),
      buffer = await exportExcel(data),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "KET QUA LDTT",
      "TONG HOP TEAM",
      "Bình chọn CSTĐ 2026",
      "NHAT KY BINH CHON",
    ]);
    expect(wb.worksheets[0].getCell("B2").value).toBe("000001");
    expect(wb.worksheets[0].getCell("K2").value).toBe("0000");
    expect(wb.worksheets[0].getColumn(6).numFmt).toBe("0.00%");
    expect(wb.worksheets[3].rowCount).toBe(2);
    expect(
      h.data.get("NHAT KY HE THONG")!.some((r) => r[2] === "EXCEL_EXPORT"),
    ).toBe(true);
  });
  it.skipIf(!fs.existsSync(".private/source.json"))(
    "validates directly read real source without publishing personnel fixtures",
    () => {
      const source = JSON.parse(
          fs.readFileSync(".private/source.json", "utf8"),
        ),
        h = harness(),
        s = h.call<{
          candidates: { id: string }[];
          teams: { size: number; quota: number }[];
          conflicts: string[];
          warnings: string[];
        }>("parseSource", source.ptud, source.ballot, source.teams);
      expect(s.candidates).toHaveLength(40);
      expect(s.conflicts).toEqual([]);
      expect(s.teams.map((t) => t.size)).toEqual([13, 6, 7, 2, 3, 4, 5]);
      expect(s.teams.reduce((n, t) => n + t.quota, 0)).toBe(18);
      expect(s.warnings.some((w) => w.includes("QA"))).toBe(true);
      expect(s.candidates.some((c) => c.id === "008973")).toBe(true);
    },
  );
});
