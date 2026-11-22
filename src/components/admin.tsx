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
  ClipboardCheck,
  AlertTriangle,
  LockKeyhole,
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
      refreshInterval: 30000,
      shouldRetryOnError: false,
    }),
    [query, setQuery] = useState(""),
    [team, setTeam] = useState(""),
    [tab, setTab] = useState("ldtt"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(""),
    [ack, setAck] = useState(false),
    [cstdFilter, setCstdFilter] = useState("all");
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      await mutate();
      setConfirm("");
      setNotice("Đã cập nhật Google Sheets thành công.");
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
  if (!data)
    return (
      <>
        <Header />
        <main className="page-shell">
          <div className={loadError ? "error" : "empty"}>
            {loadError?.message ?? "Đang tải trang quản trị…"}
          </div>
          <Link href="/">Về trang đăng nhập</Link>
        </main>
      </>
    );
  const e = data.election,
    snapshot = e?.snapshot ?? data.source,
    total = snapshot?.candidates.length ?? 0,
    submitted = data.submitted ?? 0,
    percent = total ? Math.round((submitted / total) * 100) : 0;
  const results = (data.results ?? []).filter(
      (c) =>
        (!team || c.team === team) &&
        `${c.id} ${c.name}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    ),
    cstd = (data.results ?? [])
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
            .includes(query.toLocaleLowerCase("vi")) &&
          (cstdFilter === "all" ||
            (cstdFilter === "eligible" && /Đủ chuẩn CSTĐ/.test(c.basis)) ||
            (cstdFilter === "verify" && c.cstdState === "Cần xác minh")),
      );
  return (
    <>
      <Header />
      <main className="page-shell admin-shell">
        <div className="page-topline">
          <span className="secure">
            <LockKeyhole size={15} />
            Khu vực quản trị
          </span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut size={16} />
            Đăng xuất
          </Button>
        </div>
        <div className="page-title-row">
          <div>
            <div className="eyebrow">THI ĐUA, KHEN THƯỞNG 2026</div>
            <h1>Tổng hợp kết quả</h1>
            <p>Theo dõi tiến độ, ghi nhận đóng góp và quản lý đợt bình chọn.</p>
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
        {!e && (
          <section className="setup-panel">
            <div className="soft-icon">
              <ClipboardCheck size={26} />
            </div>
            <h2>Chốt dữ liệu trước khi mở bình chọn</h2>
            <p>
              Đã đối chiếu PTUD (2), Binh xet và TONG HOP TEAM. Danh sách và chỉ
              tiêu sẽ được giữ nguyên trong kỳ.
            </p>
            <div className="setup-counts">
              <strong>{total} nhân sự đủ điều kiện</strong>
              <strong>{snapshot?.teams.length} team</strong>
              <strong>
                {snapshot?.teams.reduce((n, t) => n + t.quota, 0)} người / phiếu
              </strong>
            </div>
            {snapshot?.conflicts.map((c, i) => (
              <div className="error" key={i}>
                {c}
              </div>
            ))}
            {snapshot?.warnings.map((w, i) => (
              <div className="warning" key={i}>
                <AlertTriangle size={16} />
                {w}
              </div>
            ))}
            <label className="ack">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Tôi đã kiểm tra danh sách, chỉ tiêu và xác nhận các cảnh báo ở
              trên.
            </label>
            <Button
              disabled={busy || !ack || !!snapshot?.conflicts.length}
              onClick={() => setConfirm("freeze")}
            >
              Chốt danh sách & mở bình chọn
            </Button>
          </section>
        )}
        {e && (
          <>
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
                label="Lượt chọn LĐTT"
                value={String(data.totalChoices)}
                hint={`${submitted} phiếu × ${snapshot?.teams.reduce((n, t) => n + t.quota, 0)} lựa chọn`}
              />
              <Stat
                icon={<RefreshCw size={20} />}
                label="Lưu trữ Google Sheets"
                value="Đã kết nối"
                hint={`Cập nhật ${new Date(data.updatedAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`}
              />
            </div>
            <div
              className="admin-tabs"
              role="tablist"
              aria-label="Bảng tổng hợp"
            >
              {[
                ["ldtt", "Kết quả LĐTT"],
                ["teams", "Theo team"],
                ["cstd", "CSTĐ 2026"],
                ["audit", "Nhật ký"],
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
                      ? "Tổng hợp kết quả bình chọn LĐTT 2026"
                      : tab === "teams"
                        ? "Tổng hợp bình chọn theo team"
                        : tab === "cstd"
                          ? "Bình chọn CSTĐ 2026"
                          : "Nhật ký hệ thống"}
                  </h2>
                  <p>
                    {tab === "ldtt"
                      ? "Xếp hạng toàn trung tâm · Tỷ lệ trên số người đã nộp phiếu"
                      : tab === "cstd"
                        ? "CSTĐ là nghiệp vụ riêng. KI loại A không tự động đồng nghĩa đủ điều kiện."
                        : tab === "teams"
                          ? "Số người được chọn là tổng lượt chọn dành cho team."
                          : "Lịch sử quản trị, nộp phiếu và chỉnh sửa gần nhất."}
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
                  {tab === "cstd" && (
                    <select
                      aria-label="Lọc điều kiện CSTĐ"
                      value={cstdFilter}
                      onChange={(e) => setCstdFilter(e.target.value)}
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="eligible">
                        Đủ chuẩn sơ bộ theo nguồn
                      </option>
                      <option value="verify">Cần xác minh</option>
                    </select>
                  )}
                </div>
              )}
              <div className="table-scroll">
                {tab === "ldtt" || tab === "cstd" ? (
                  <table>
                    <thead>
                      <tr>
                        {[
                          "STT",
                          "MNV",
                          "Họ Và Tên",
                          "Team",
                          "Số Bình chọn LĐTT",
                          "Tỷ lệ chọn (%)",
                          "Điểm TB 3 quý",
                          "KI dự kiến",
                          "Sáng kiến - Ý Tưởng",
                          "Khen thưởng ĐV + TĐ",
                          ...(tab === "cstd"
                            ? ["Điều kiện nguồn", "Bình chọn CSTĐ"]
                            : []),
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(tab === "cstd" ? cstd : results).map((c, i) => (
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
                          {tab === "cstd" && (
                            <>
                              <td>{c.basis}</td>
                              <td>
                                <select
                                  aria-label={`Trạng thái CSTĐ ${c.name}`}
                                  disabled={busy}
                                  value={
                                    data.cstd.find((r) => r.id === c.id)
                                      ?.status ?? cstdStatus(c.basis)
                                  }
                                  onChange={(ev) =>
                                    void action("admin/cstd", {
                                      candidateId: c.id,
                                      status: ev.target.value,
                                    })
                                  }
                                >
                                  {[
                                    "Cần xác minh",
                                    "Chờ bỏ phiếu CSTĐ",
                                    "Đủ tiêu chuẩn sơ bộ",
                                    "Chưa đủ điều kiện",
                                    "Đạt CSTĐ",
                                    "Không đạt CSTĐ",
                                  ].map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : tab === "teams" ? (
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
                          <td>{t.votes} lượt</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td colSpan={2}>Tổng cộng</td>
                        <td>{total}</td>
                        <td>{data.totalChoices} lượt</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Actor</th>
                        <th>Sự kiện</th>
                        <th>Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.audit].reverse().map((r, i) => (
                        <tr key={i}>
                          {r.map((v, j) => (
                            <td key={j}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            <div className="admin-operations">
              <span className="secure">
                Snapshot v{e.version} ·{" "}
                {e.status === "open" ? "Đang mở" : "Đã đóng"}
              </span>
              <div>
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
                  variant="destructive"
                  size="sm"
                  disabled={busy || e.status === "closed"}
                  onClick={() => setConfirm("close")}
                >
                  Đóng kỳ bình chọn
                </Button>
              </div>
            </div>
          </>
        )}
        <div className="ballot-disclaimer">
          <CheckCheck size={18} />
          Bình chọn LĐTT và xét CSTĐ là hai nghiệp vụ riêng. Kết quả chưa phải
          quyết định trao danh hiệu.
        </div>
      </main>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm("");
        }}
        title={
          confirm === "close"
            ? "Đóng kỳ bình chọn?"
            : "Chốt danh sách và mở bình chọn?"
        }
        description={
          confirm === "close"
            ? "Sau khi đóng, người dùng không thể nộp mới hoặc sửa phiếu. Các phiếu đã nộp được giữ nguyên."
            : "Danh sách và chỉ tiêu hiện tại được lưu thành snapshot v1; không tự thay đổi khi nguồn nhân sự thay đổi."
        }
      >
        <Button
          className="full"
          disabled={busy}
          onClick={() =>
            void action(
              confirm === "close"
                ? "admin/election/close"
                : "admin/election/freeze",
              { acknowledgeWarnings: ack },
            )
          }
        >
          {busy ? "Đang xử lý…" : "Xác nhận"}
        </Button>
        {error && <div className="error">{error}</div>}
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
