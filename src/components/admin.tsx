"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Download,
  LogOut,
  RefreshCw,
  Search,
  Users,
  Vote,
  CheckCheck,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import { Header } from "./header";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { api } from "@/lib/client";
import type { Dashboard } from "@/lib/types";
import { cstdStatus } from "@/lib/domain";

export function Admin() {
  const router = useRouter();
  const {
      data,
      error: loadError,
      mutate,
    } = useSWR<Dashboard>("admin/dashboard", api, {
      refreshInterval: 20000,
      shouldRetryOnError: false,
    }),
    [query, setQuery] = useState(""),
    [team, setTeam] = useState(""),
    [tab, setTab] = useState("ldtt"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [resetModal, setResetModal] = useState(false),
    [resetAdminCode, setResetAdminCode] = useState(""),
    [resetSuccess, setResetSuccess] = useState("");

  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      await mutate();
      setNotice("Đã cập nhật hệ thống thành công.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("admin/logout", {});
    router.push("/");
  }

  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/export");
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error);
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        r.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "Ket_qua_binh_chon_TDKT_2026.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setError("");
    setResetSuccess("");
    try {
      await api("admin/reset", { adminCode: resetAdminCode });
      setResetSuccess("Đã khôi phục hoàn toàn dữ liệu về mặc định ban đầu.");
      await mutate();
      setTimeout(() => {
        setResetModal(false);
        setResetSuccess("");
        setResetAdminCode("");
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <>
        <Header />
        <main className="page-shell">
          <div className={loadError ? "error" : "empty"}>
            {loadError?.message ?? "Đang tải trang tổng hợp kết quả…"}
          </div>
          <div className="mt-4">
            <Link href="/" className="back-link">Về trang chủ</Link>
          </div>
        </main>
      </>
    );

  const e = data.election,
    snapshot = e?.snapshot ?? data.source,
    total = snapshot?.candidates.length ?? 0,
    submitted = data.submitted ?? 0,
    percent = total ? Math.round((submitted / total) * 100) : 0;

  // Sắp xếp LĐTT: từ cao xuống thấp theo Số Bình chọn LĐTT
  const results = (data.results ?? [])
    .filter(
      (c) =>
        (!team || c.team === team) &&
        `${c.id} ${c.name}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );

  // Bảng CSTĐ 2026: lọc ra những người đủ điều kiện CSTĐ
  const cstdList = (data.results ?? [])
    .filter((c) => /CSTĐ/i.test(c.basis) || data.cstd.some((r) => r.id === c.id))
    .map((c) => ({
      ...c,
      cstdState:
        data.cstd.find((r) => r.id === c.id)?.status ?? cstdStatus(c.basis),
    }))
    .filter(
      (c) =>
        (!team || c.team === team) &&
        `${c.id} ${c.name}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );

  return (
    <>
      <Header onResetClick={() => setResetModal(true)} />
      <main className="page-shell admin-shell">
        <div className="page-topline">
          <span className="secure">
            <LockKeyhole size={15} />
            Khu vực tổng hợp kết quả (Admin)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError("");
                setResetAdminCode("");
                setResetModal(true);
              }}
            >
              <RotateCcw size={15} />
              Reset dữ liệu
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut size={16} />
              Đăng xuất
            </Button>
          </div>
        </div>

        <div className="page-title-row">
          <div>
            <div className="eyebrow">TRUNG TÂM CÔNG NGHỆ & KỸ THUẬT · NĂM 2026</div>
            <h1>Tổng hợp kết quả bình chọn</h1>
            <p>Theo dõi tiến độ, bảng xếp hạng LĐTT, tổng hợp theo Team và danh sách đủ điều kiện CSTĐ.</p>
          </div>
          <Button onClick={() => void download()} disabled={busy || !e}>
            <Download size={18} />
            Tải kết quả Excel
          </Button>
        </div>

        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}

        {/* Khối thống kê tổng quan */}
        <div className="stat-grid">
          <Stat
            icon={<Users size={20} />}
            label="Đã tham gia"
            value={`${submitted} / ${total}`}
            hint={`${total - submitted} người chưa bình chọn`}
          />
          <Stat
            icon={<CheckCheck size={20} />}
            label="Tỷ lệ tham gia"
            value={`${percent}%`}
            hint={`${submitted} phiếu đã nộp thành công`}
          />
          <Stat
            icon={<Vote size={20} />}
            label="Tổng lượt chọn LĐTT"
            value={String(data.totalChoices)}
            hint={`${submitted} phiếu × 18 lựa chọn/phiếu`}
          />
          <Stat
            icon={<RefreshCw size={20} />}
            label="Lưu trữ Google Sheets"
            value="Đã kết nối"
            hint={`Cập nhật lúc ${new Date(data.updatedAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`}
          />
        </div>

        {/* Tab chuyển đổi giữa 3 bảng theo đúng yêu cầu */}
        <div
          className="admin-tabs"
          role="tablist"
          aria-label="Bảng tổng hợp"
        >
          {[
            ["ldtt", "Bình chọn LĐTT"],
            ["teams", "Tổng hợp theo Team"],
            ["cstd", "Bình chọn CSTĐ 2026"],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="results-panel">
          <div className="results-heading">
            <div>
              <h2>
                {tab === "ldtt"
                  ? "Bảng kết quả bình chọn LĐTT 2026"
                  : tab === "teams"
                    ? "Bảng tổng hợp số lượng được bình chọn theo Team"
                    : "Bình chọn CSTĐ 2026"}
              </h2>
              <p>
                {tab === "ldtt"
                  ? "Xếp theo thứ tự từ cao xuống thấp số lượt được bình chọn trong cột 'Bình chọn LĐTT' không phân biệt team."
                  : tab === "teams"
                    ? "Tổng số nhân viên là tổng số người trong team đó, số người được chọn là tổng số mọi người đã bình chọn cho nhân viên thuộc team đó."
                    : "Danh sách các nhân viên đủ điều kiện bình chọn CSTĐ theo dữ liệu nguồn."}
              </p>
            </div>
            <BarChart3 size={24} />
          </div>

          {(tab === "ldtt" || tab === "cstd") && (
            <div className="table-filters">
              <div className="search">
                <Search size={18} />
                <input
                  aria-label="Tìm kết quả"
                  placeholder="Tìm MNV hoặc họ tên…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                aria-label="Lọc team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">Tất cả team</option>
                {snapshot?.teams.map((t) => (
                  <option key={t.id}>{t.id}</option>
                ))}
              </select>
            </div>
          )}

          <div className="table-scroll">
            {tab === "ldtt" ? (
              /* BẢNG 1: KẾT QUẢ BÌNH CHỌN LĐTT */
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>MNV</th>
                    <th>Họ Và Tên</th>
                    <th>Team</th>
                    <th>Số Bình chọn LĐTT</th>
                    <th>Tỷ lệ chọn</th>
                    <th>Điểm TB 3 quý</th>
                    <th>Xếp loại KI dự kiến</th>
                    <th>Sáng kiến - Ý Tưởng</th>
                    <th>Khen thưởng ĐV + TĐ</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((c, i) => (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td className="mono">{c.id}</td>
                      <td className="name-cell">
                        <strong>{c.name}</strong>
                        {c.lead && <em>Lead</em>}
                      </td>
                      <td>{c.team}</td>
                      <td>
                        <strong className="vote-value">{c.votes}</strong>
                      </td>
                      <td>{(c.rate * 100).toFixed(1)}%</td>
                      <td>{c.score.toFixed(3)}</td>
                      <td>
                        <span className={`ki ki-${c.ki}`}>{c.ki}</span>
                      </td>
                      <td>{c.initiative || "—"}</td>
                      <td>{c.reward || "—"}</td>
                    </tr>
                  ))}
                  {!results.length && (
                    <tr>
                      <td colSpan={10} className="text-center py-6 text-slate-500">
                        Không có dữ liệu phù hợp với tìm kiếm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : tab === "teams" ? (
              /* BẢNG 2: TỔNG HỢP THEO TEAM */
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Team</th>
                    <th>Tổng số NV</th>
                    <th>Số người được chọn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.teams.map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{t.id}</strong>
                      </td>
                      <td>{t.size}</td>
                      <td>
                        <strong>{t.votes}</strong> lượt
                      </td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={2}>Tổng cộng</td>
                    <td>{total}</td>
                    <td>
                      <strong>{data.totalChoices}</strong> lượt
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              /* BẢNG 3: BÌNH CHỌN CSTĐ 2026 */
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>MNV</th>
                    <th>Họ Và Tên</th>
                    <th>Team</th>
                    <th>Số Bình chọn LĐTT</th>
                    <th>Tỷ lệ chọn</th>
                    <th>Điểm TB 3 quý</th>
                    <th>Xếp loại KI dự kiến</th>
                    <th>Sáng kiến - Ý Tưởng</th>
                    <th>Khen thưởng ĐV + TĐ</th>
                    <th>Bình chọn CSTĐ</th>
                  </tr>
                </thead>
                <tbody>
                  {cstdList.map((c, i) => (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td className="mono">{c.id}</td>
                      <td className="name-cell">
                        <strong>{c.name}</strong>
                        {c.lead && <em>Lead</em>}
                      </td>
                      <td>{c.team}</td>
                      <td>
                        <strong className="vote-value">{c.votes}</strong>
                      </td>
                      <td>{(c.rate * 100).toFixed(1)}%</td>
                      <td>{c.score.toFixed(3)}</td>
                      <td>
                        <span className={`ki ki-${c.ki}`}>{c.ki}</span>
                      </td>
                      <td>{c.initiative || "—"}</td>
                      <td>{c.reward || "—"}</td>
                      <td>
                        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                          {c.cstdState || "Đủ chuẩn sơ bộ"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!cstdList.length && (
                    <tr>
                      <td colSpan={11} className="text-center py-6 text-slate-500">
                        Chưa có ứng viên đủ điều kiện CSTĐ theo tiêu chuẩn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Nút thao tác dưới cùng */}
        <div className="admin-operations">
          <span className="secure">
            Trạng thái kỳ: <strong>{e?.status === "open" ? "Đang mở bình chọn" : "Đã đóng"}</strong>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void action("admin/sync")}
            >
              <RefreshCw size={16} />
              Cập nhật bảng kết quả
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => void download()}
              disabled={busy || !e}
            >
              <Download size={16} />
              Tải kết quả (Excel)
            </Button>
          </div>
        </div>
      </main>

      {/* Dialog Reset hệ thống */}
      <Dialog
        open={resetModal}
        onOpenChange={setResetModal}
        title="Khôi phục hoàn toàn dữ liệu về mặc định"
        description="Thao tác này sẽ xóa tất cả các phiếu đã bình chọn nháp, làm sạch kết quả và đưa hệ thống về trạng thái ban đầu để chạy bình chọn thực tế."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleReset();
          }}
        >
          <label htmlFor="admin-reset-pwd">Nhập mã quản trị để xác nhận</label>
          <input
            id="admin-reset-pwd"
            type="password"
            autoComplete="off"
            placeholder="Nhập mã (anhvh6)"
            value={resetAdminCode}
            onChange={(e) => setResetAdminCode(e.target.value)}
            required
          />
          {resetSuccess && (
            <div className="notice" role="status">
              {resetSuccess}
            </div>
          )}
          {error && resetModal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button
            className="full mt-3"
            variant="destructive"
            disabled={!resetAdminCode || busy}
          >
            {busy ? "Đang xử lý…" : "Xác nhận khôi phục"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}
