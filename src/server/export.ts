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
  add(
    "TONG HOP TEAM",
    ["STT", "Team", "Tổng số NV", "Số người được chọn"],
    [
      ...data.teams.map((t, i) => [i + 1, t.id, t.size, t.votes]),
      [
        "Tổng",
        "",
        data.teams.reduce((n, t) => n + t.size, 0),
        data.totalChoices,
      ],
    ],
  );
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
    data.results
      .filter(
        (c) => /CSTĐ/.test(c.basis) || data.cstd.some((r) => r.id === c.id),
      )
      .map((c, i) => [
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
        data.cstd.find((r) => r.id === c.id)?.status ?? cstdStatus(c.basis),
      ]),
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
