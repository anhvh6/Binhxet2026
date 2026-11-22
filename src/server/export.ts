import ExcelJS from "exceljs";
import type { Dashboard } from "@/lib/types";
import { cstdStatus } from "@/lib/domain";
export async function exportExcel(data: Dashboard) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VCX";
  wb.created = new Date();
  function add(name: string, headers: string[], rows: (string | number)[][]) {
    const sheet = wb.addWorksheet(name);
    sheet.addRow(headers);
    sheet.addRows(rows);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: headers.length },
    };
    sheet.columns = headers.map((h, i) => ({
      width: i === 2 ? 28 : h === "Chi tiết" ? 45 : 20,
    }));
    sheet.eachRow((row, index) => {
      row.font = { name: "Aptos", size: 11 };
      row.alignment = { vertical: "middle", wrapText: true };
      if (index === 1) {
        row.height = 36;
        row.font = {
          name: "Aptos",
          size: 11,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF10233F" },
          };
        });
      }
    });
    sheet.headerFooter.oddHeader = `VCX 2026 | Xuất: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} | ${data.submitted} phiếu hợp lệ`;
    return sheet;
  }
  const ldtt = add(
    "KET QUA LDTT",
    [
      "STT",
      "MNV",
      "Họ Và Tên",
      "Team",
      "Số Bình chọn LĐTT",
      "Tỷ lệ chọn (%)",
      "Điểm TB 3 quý",
      "Xếp loại KI dự kiến",
      "Sáng kiến - Ý Tưởng",
      "Khen thưởng ĐV + TĐ",
      "Chi tiết",
    ],
    data.results.map((c, i) => [
      i + 1,
      c.id,
      c.name,
      c.team,
      c.votes,
      c.rate,
      c.score,
      c.ki,
      c.initiative,
      c.reward,
      (data.ballots ?? [])
        .filter((b) => b.choices.includes(c.id))
        .map((b) => b.voterId)
        .join(", "),
    ]),
  );
  ldtt.getColumn(6).numFmt = "0.00%";
  ldtt.getColumn(7).numFmt = "0.000";

  // Sắp xếp LĐTT để xác định Top 18
  const sorted = [...data.results].sort(
    (a, b) =>
      b.votes - a.votes ||
      b.rate - a.rate ||
      b.score - a.score ||
      a.id.localeCompare(b.id)
  );
  const top18 = sorted.slice(0, 18);
  const top18Ids = new Set(top18.map((c) => c.id));

  // Thống kê % của từng team trong top 18
  const teamPctMap: Record<string, { count: number; pctStr: string; members: string[] }> = {};
  for (const t of data.teams) {
    const inTeam = top18.filter((c) => c.team === t.id);
    teamPctMap[t.id] = {
      count: inTeam.length,
      pctStr: ((inTeam.length / 18) * 100).toFixed(1) + "%",
      members: inTeam.map((c) => c.name),
    };
  }

  // Bảng 2: TONG HOP TEAM (Số người trong team thuộc Top 18 LĐTT và Tỷ lệ % trên 18)
  const teamRows = data.teams.map((t, i) => {
    const top18InTeam = top18.filter((c) => c.team === t.id).length;
    const pct = top18InTeam / 18;
    return [i + 1, t.id, t.size, top18InTeam, pct];
  });
  const totalNv = data.teams.reduce((n, t) => n + t.size, 0);
  const totalTop18 = top18.length;
  const teamSheet = add(
    "TONG HOP TEAM",
    ["STT", "Team", "Tổng số NV", "Số người được chọn", "Tỷ lệ %"],
    [
      ...teamRows,
      [
        "Tổng cộng",
        "",
        totalNv,
        totalTop18,
        totalTop18 / 18,
      ],
    ],
  );
  teamSheet.getColumn(5).numFmt = "0.0%";

  // Bảng 3: Bình chọn CSTĐ 2026
  // Lọc ra các nhân viên đảm bảo đủ các tiêu chí:
  // 1) Kết quả xếp loại KI năm 2026: Đạt loại A trở lên
  // 2) Đạt CẢ 2 tiêu chuẩn thành tích:
  //    • Là 1 trong 18 người có số phiếu bầu nhiều nhất từ trên xuống (đạt danh hiệu LĐTT)
  //    • VÀ có SÁNG KIẾN - Ý TƯỞNG
  const cstdCandidates = sorted.filter((c) => {
    const isKiA =
      c.score >= 3.5 ||
      c.ki === "A" ||
      c.ki === "A+" ||
      c.ki?.toUpperCase().startsWith("A");
    if (!isKiA) return false;

    const isTop18 = top18Ids.has(c.id);
    const hasInitiative =
      Boolean(c.initiative) &&
      c.initiative.trim() !== "" &&
      c.initiative.trim() !== "—" &&
      c.initiative.trim() !== "Không";

    return isTop18 && hasInitiative;
  });

  const cstd = add(
    "Bình chọn CSTĐ 2026",
    [
      "STT",
      "MNV",
      "Họ Và Tên",
      "Team",
      "Số Bình chọn LĐTT",
      "Tỷ lệ chọn (%)",
      "Điểm TB 3 quý",
      "Xếp loại KI dự kiến",
      "Sáng kiến - Ý Tưởng",
      "Khen thưởng ĐV + TĐ",
      "Bình chọn CSTĐ",
    ],
    cstdCandidates.map((c, i) => {
      const defaultStatus = "Top 18 LĐTT + Sáng kiến (KI loại A)";
      return [
        i + 1,
        c.id,
        c.name,
        c.team,
        c.votes,
        c.rate,
        c.score,
        c.ki,
        c.initiative,
        c.reward,
        data.cstd.find((r) => r.id === c.id)?.status ?? defaultStatus,
      ];
    }),
  );
  cstd.getColumn(6).numFmt = "0.00%";
  cstd.getColumn(7).numFmt = "0.000";
  add(
    "NHAT KY BINH CHON",
    [
      "Mã phiếu",
      "Mã bình chọn",
      "Thời gian nộp",
      "Thời gian sửa cuối",
      "Số lần sửa",
      "Trạng thái",
    ],
    (data.ballots ?? []).map((b) => [
      b.id,
      b.voterId,
      b.submittedAt,
      b.updatedAt,
      b.revision - 1,
      "Đã nộp",
    ]),
  );
  return await wb.xlsx.writeBuffer();
}
