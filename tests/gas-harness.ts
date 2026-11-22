import vm from "node:vm";
import fs from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
export function harness() {
  const data = new Map<string, unknown[][]>(),
    ids = new Map<number, string>();
  let id = 1,
    failCommit = false,
    locked = false;
  function sheet(name: string) {
    return {
      getSheetId: () => [...ids].find(([, n]) => n === name)![0],
      getLastRow: () => data.get(name)!.length,
      getRange: (...args: unknown[]) => ({
        getDisplayValues: () => {
          if (typeof args[0] === "string") return data.get(name)!;
          const [start, col, height, width] = args as number[];
          return Array.from({ length: height }, (_, i) =>
            Array.from({ length: width }, (_, j) =>
              String(data.get(name)?.[start - 1 + i]?.[col - 1 + j] ?? ""),
            ),
          );
        },
        setValues: (v: unknown[][]) => {
          data.set(name, v);
          return sheet(name).getRange(...args);
        },
        setBackground: () => sheet(name).getRange(...args),
        setFontColor: () => sheet(name).getRange(...args),
        setFontWeight: () => sheet(name).getRange(...args),
        setWrap: () => sheet(name).getRange(...args),
      }),
      setFrozenRows: () => {},
      setColumnWidths: () => {},
      setHiddenGridlines: () => {},
    };
  }
  function put(name: string, rows: unknown[][]) {
    if (!data.has(name)) ids.set(id++, name);
    data.set(name, rows);
  }
  const ss = {
    getId: () => "test-spreadsheet",
    getSheetByName: (name: string) => (data.has(name) ? sheet(name) : null),
    insertSheet: (name: string) => {
      put(name, []);
      return sheet(name);
    },
  };
  const cache = new Map<string, string>();
  const context = vm.createContext({
    console,
    Date,
    Set,
    Number,
    Array,
    JSON,
    Math,
    Error,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) =>
          key === "SPREADSHEET_ID" ? "test-spreadsheet" : "x".repeat(64),
      }),
    },
    SpreadsheetApp: { openById: () => ss, flush: () => {} },
    ScriptApp: { getOAuthToken: () => "fake-oauth" },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (locked) return false;
          locked = true;
          return true;
        },
        waitLock: () => {
          locked = true;
        },
        hasLock: () => locked,
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key: string) => cache.get(key),
        put: (key: string, value: string) => cache.set(key, value),
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_: string, v: string) => [
        ...createHash("sha256").update(v).digest(),
      ],
      computeHmacSha256Signature: (v: string, key: string) => [
        ...createHmac("sha256", key).update(v).digest(),
      ],
      getUuid: randomUUID,
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({
        setMimeType: () => ({ text }),
        text,
      }),
    },
    UrlFetchApp: {
      fetch: (_: string, options: { payload: string }) => {
        if (failCommit) return { getResponseCode: () => 503 };
        const clone = new Map(
          [...data].map(([k, v]) => [k, structuredClone(v)]),
        );
        const { requests } = JSON.parse(options.payload);
        for (const req of requests) {
          if (req.updateCells) {
            const u = req.updateCells,
              name = ids.get(u.range.sheetId)!;
            const rows = clone.get(name)!;
            u.rows.forEach(
              (
                r: {
                  values: {
                    userEnteredValue: {
                      stringValue?: string;
                      numberValue?: number;
                    };
                  }[];
                },
                i: number,
              ) => {
                const at = u.range.startRowIndex + i;
                rows[at] ??= [];
                r.values.forEach((c, j) => {
                  rows[at][u.range.startColumnIndex + j] =
                    c.userEnteredValue.stringValue ??
                    c.userEnteredValue.numberValue;
                });
              },
            );
          } else if (req.appendCells) {
            const a = req.appendCells;
            clone
              .get(ids.get(a.sheetId)!)!
              .push(
                ...a.rows.map(
                  (r: {
                    values: {
                      userEnteredValue: {
                        stringValue?: string;
                        numberValue?: number;
                      };
                    }[];
                  }) =>
                    r.values.map(
                      (c) =>
                        c.userEnteredValue.stringValue ??
                        c.userEnteredValue.numberValue,
                    ),
                ),
              );
          } else throw new Error("Unsupported test request");
        }
        for (const [key, rows] of clone) data.set(key, rows);
        return { getResponseCode: () => 200 };
      },
    },
  });
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), context);
  const call = <T = unknown>(name: string, ...args: unknown[]): T =>
    context[name](...args);
  call("setup");
  return {
    call,
    put,
    data,
    context,
    setFail: (v: boolean) => {
      failCommit = v;
    },
    setLocked: (v: boolean) => {
      locked = v;
    },
  };
}
export function seed(h: ReturnType<typeof harness>) {
  const ptud: unknown[][] = [[], [], [], [], [], []],
    ballot: unknown[][] = [[], [], [], [], [], []],
    teamRows: unknown[][] = [
      ["NHÓM", "TEAM", "NHÂN SỰ ĐỦ ĐIỀU KIỆN", "TÍCH CHỌN", "LEAD"],
    ],
    sizes = [13, 6, 7, 2, 3, 4, 5],
    labels = ["I", "II", "III", "IV", "V", "VI", "VII"];
  let id = 0;
  sizes.forEach((size, t) => {
    teamRows.push([
      labels[t],
      `Team ${t + 1}`,
      size,
      Math.floor(size / 2),
      t === 3 ? "Chưa xác định Lead" : `Nhân viên thử nghiệm ${id + 1}`,
    ]);
    for (let i = 0; i < size; i++) {
      id++;
      const row = Array(59).fill("");
      row[1] = String(id).padStart(6, "0");
      row[2] = `Nhân viên thử nghiệm ${id}`;
      row[38] = `Team ${t + 1}`;
      row[39] = i === 0 && t !== 3 ? "Lead" : "";
      row[43] = String(4 - i * 0.01).replace(".", ",");
      row[44] = "A";
      row[45] = "Đạt (>=6 tháng)";
      row[46] = "Hoàn thành tốt NV";
      row[47] = "Không";
      row[49] = "Đủ điều kiện";
      row[52] =
        id === 1 ? "Đủ chuẩn CSTĐ cơ sở (Chờ bỏ phiếu >50%)" : "Đủ chuẩn LĐTT";
      ptud.push(row);
      ballot.push([...row]);
    }
  });
  h.put("PTUD (2)", ptud);
  h.put("Binh xet", ballot);
  h.put("TONG HOP TEAM", teamRows);
  h.put("MA BINH CHON", [
    [
      "STT",
      "Mã bình chọn",
      "Trạng thái",
      "Ngày nộp",
      "Ngày sửa",
    ],
    ...ballot
      .slice(6)
      .map((r, i) => [
        i + 1,
        String(i).padStart(4, "0"),
        "Chưa sử dụng",
        "",
        "",
      ]),
  ]);
  const admin = "admin-token";
  h.call("dispatch", "adminLogin", {
    verified: true,
    ipHash: "local",
    newTokenHash: admin,
  });
  h.call("dispatch", "freeze", { tokenHash: admin, acknowledgeWarnings: true });
  const source = h.call<{
    candidates: { id: string; team: string }[];
    teams: { id: string; quota: number }[];
  }>("readSource");
  const choices = source.teams.flatMap((t) =>
    source.candidates
      .filter((c) => c.team === t.id)
      .slice(0, t.quota)
      .map((c) => c.id),
  );
  return { admin, source, choices };
}
