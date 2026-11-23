"use client";
import { useState, useMemo } from "react";
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
  Award,
  Sparkles,
} from "lucide-react";
import { Header } from "./header";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { api } from "@/lib/client";
import type { Dashboard } from "@/lib/types";

export function Admin() {
  const router = useRouter();
  const {
      data,
      error: loadError,
      mutate,
    } = useSWR<Dashboard>("admin/dashboard", api, {
      refreshInterval: 15000,
      dedupingInterval: 5000,
      revalidateOnFocus: true,
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

  // 1. Sắp xếp toàn bộ ứng viên LĐTT: từ cao xuống thấp theo Số Bình chọn LĐTT -> Tỷ lệ -> Điểm TB -> MNV
  const sortedCandidates = useMemo(() => {
    if (!data?.results) return [];
    return [...data.results].sort(
      (a, b) =>
        b.votes - a.votes ||
        b.rate - a.rate ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    );
  }, [data?.results]);

  // Top 18 người có số phiếu bầu lớn nhất từ trên xuống (đạt danh hiệu LĐTT)
  const top18 = useMemo(() => sortedCandidates.slice(0, 18), [sortedCandidates]);
  const top18Ids = useMemo(() => new Set(top18.map((c) => c.id)), [top18]);

  // Bảng 1: Kết quả LĐTT hiển thị (có tìm kiếm và lọc team)
  const results = useMemo(() => {
    return sortedCandidates.filter(
      (c) =>
        (!team || c.team === team) &&
        `${c.id} ${c.name}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );
  }, [sortedCandidates, team, query]);

  // Thống kê tỷ lệ % của từng team trong Top 18
  const teamStatsMap = useMemo(() => {
    const map: Record<string, { count: number; percentage: string; members: string[] }> = {};
    if (!data?.teams) return map;
    for (const t of data.teams) {
      const inTeam = top18.filter((c) => c.team === t.id);
      map[t.id] = {
        count: inTeam.length,
        percentage: ((inTeam.length / 18) * 100).toFixed(1),
        members: inTeam.map((c) => c.name),
      };
    }
    return map;
  }, [data?.teams, top18]);

  // Bảng 2: Tổng hợp theo Team (số người được chọn là số người trong team nằm trong top 18 người có số phiếu lớn nhất và tỷ lệ % trên 18)
  const teamSummary = useMemo(() => {
    if (!data?.teams) return [];
    return data.teams.map((t) => {
      const top18InTeam = top18.filter((c) => c.team === t.id).length;
      const percentage = ((top18InTeam / 18) * 100).toFixed(1);
      return {
        ...t,
        top18Count: top18InTeam,
        percentage,
        members: teamStatsMap[t.id]?.members ?? [],
      };
    });
  }, [data?.teams, top18, teamStatsMap]);

  // Danh sách chi tiết các cán bộ nhân viên thỏa mãn điều kiện lọt Top 18 LĐTT
  const top18Filtered = useMemo(() => {
    return top18.filter(
      (c) =>
        (!team || c.team === team) &&
        `${c.id} ${c.name}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi")),
    );
  }, [top18, team, query]);

  // Bảng 3: Bình chọn CSTĐ 2026
  // Lọc ra các nhân viên đảm bảo đủ các tiêu chí:
  // 1) Cột "Xếp loại KI dự kiến" đạt loại A trở lên (chỉ dùng điều kiện cột KI, không dùng điều kiện điểm)
  // 2) Đạt 1 trong các tiêu chuẩn thành tích:
  //    • Là 1 trong 18 người có số phiếu bầu nhiều nhất từ trên xuống (đạt danh hiệu LĐTT)
  //    • HOẶC có SÁNG KIẾN - Ý TƯỞNG
  const cstdList = useMemo(() => {
    const cstdListSource = data?.cstd ?? [];
    return sortedCandidates
      .filter((c) => {
        // Tiêu chí 1: Chỉ lọc theo cột "Xếp loại KI dự kiến", loại bỏ các cá nhân có KI dưới A (B, C, D)
        const isKiA =
          Boolean(c.ki) &&
          (c.ki === "A" ||
           c.ki === "A+" ||
           c.ki.toUpperCase().startsWith("A"));
        if (!isKiA) return false;

        // Tiêu chí 2: Đạt 1 trong các tiêu chuẩn: Thuộc Top 18 LĐTT HOẶC Có Sáng kiến - Ý tưởng
        const isTop18 = top18Ids.has(c.id);
        const hasInitiative =
          Boolean(c.initiative) &&
          c.initiative.trim() !== "" &&
          c.initiative.trim() !== "—" &&
          c.initiative.trim() !== "Không";

        return isTop18 || hasInitiative;
      })
      .map((c) => {
        const isTop18 = top18Ids.has(c.id);
        const hasInitiative =
          Boolean(c.initiative) &&
          c.initiative.trim() !== "" &&
          c.initiative.trim() !== "—" &&
          c.initiative.trim() !== "Không";

        let defaultReason = "Đủ chuẩn sơ bộ";
        if (isTop18 && hasInitiative) {
          defaultReason = "Top 18 LĐTT + Sáng kiến";
        } else if (isTop18) {
          defaultReason = "Top 18 LĐTT (KI loại A)";
        } else {
          defaultReason = "Có Sáng kiến (KI loại A)";
        }

        return {
          ...c,
          cstdState:
            cstdListSource.find((r) => r.id === c.id)?.status ?? defaultReason,
        };
      })
      .filter(
        (c) =>
          (!team || c.team === team) &&
          `${c.id} ${c.name}`
            .toLocaleLowerCase("vi")
            .includes(query.toLocaleLowerCase("vi")),
      );
  }, [sortedCandidates, top18Ids, data?.cstd, team, query]);

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

  const totalTop18Count = top18.length;
  const totalTop18Pct = ((totalTop18Count / 18) * 100).toFixed(1);

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
                    ? "Tổng hợp số nhân sự của từng team nằm trong Top 18 người có số phiếu bầu lớn nhất từ trên xuống (đạt danh hiệu LĐTT) và tỷ lệ % trên 18."
                    : "Lọc các nhân sự đủ tiêu chuẩn: Cột Xếp loại KI dự kiến đạt loại A trở lên VÀ (thuộc Top 18 LĐTT có số phiếu bầu nhiều nhất HOẶC có Sáng kiến - Ý tưởng)."}
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
                  {results.map((c, i) => {
                    const hasReward = Boolean(c.reward) && c.reward.trim() !== "" && c.reward.trim() !== "—" && c.reward.trim() !== "Không";
                    const hasInitiative = Boolean(c.initiative) && c.initiative.trim() !== "" && c.initiative.trim() !== "—" && c.initiative.trim() !== "Không";
                    const hasMerit = hasReward || hasInitiative;
                    return (
                      <tr key={c.id} className={hasMerit ? "has-merit-row" : ""}>
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
                        <td>
                          {hasInitiative ? (
                            <span className="merit-tag initiative-tag">
                              <Sparkles size={11} className="merit-icon" />
                              {c.initiative}
                            </span>
                          ) : (
                            <span className="text-slate-400">{c.initiative || "—"}</span>
                          )}
                        </td>
                        <td>
                          {hasReward ? (
                            <span className="merit-tag reward-tag">
                              <Award size={11} className="merit-icon" />
                              {c.reward}
                            </span>
                          ) : (
                            <span className="text-slate-400">{c.reward || "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
              <div className="space-y-8">
                {/* 1. BẢNG TỔNG HỢP CƠ CẤU 7 TEAM */}
                <div>
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-slate-800">
                      1. Tổng hợp cơ cấu số lượng &amp; tỷ lệ % của từng Team trong Top 18
                    </h4>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Team</th>
                        <th>Tổng số NV</th>
                        <th>Số người được chọn (Top 18)</th>
                        <th>Tỷ lệ % (chiếm % của 18)</th>
                        <th>Danh sách nhân sự lọt Top 18</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamSummary.map((t, i) => (
                        <tr key={t.id}>
                          <td>{i + 1}</td>
                          <td>
                            <strong>{t.id}</strong>
                          </td>
                          <td>{t.size}</td>
                          <td>
                            <strong className="vote-value">{t.top18Count}</strong> người
                          </td>
                          <td>
                            <span className="font-semibold text-emerald-700">
                              {t.percentage}%
                            </span>
                          </td>
                          <td>
                            {t.members && t.members.length > 0 ? (
                              <span className="font-medium text-slate-900">
                                {t.members.join(", ")}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Chưa có người trong Top 18</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td colSpan={2}>Tổng cộng</td>
                        <td>{total}</td>
                        <td>
                          <strong className="vote-value">{totalTop18Count}</strong> / 18 người
                        </td>
                        <td>
                          <strong className="text-emerald-700">
                            {totalTop18Pct}%
                          </strong>
                        </td>
                        <td>18 người lọt Top</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 2. BẢNG CHI TIẾT DANH SÁCH 18 CÁN BỘ NHÂN VIÊN LỌT TOP 18 */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="mb-3">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Award size={16} className="text-emerald-600" />
                      2. Danh sách cán bộ nhân viên thỏa mãn điều kiện thuộc Top 18 LĐTT có số phiếu bầu lớn nhất
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Được sắp xếp từ cao xuống thấp theo số phiếu bầu LĐTT, kèm cột tỷ lệ % đại diện của từng Team trong Top 18.
                    </p>
                  </div>
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
                        <th>Tỷ lệ % Team trong 18</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top18Filtered.map((c, i) => {
                        const hasReward = Boolean(c.reward) && c.reward.trim() !== "" && c.reward.trim() !== "—" && c.reward.trim() !== "Không";
                        const hasInitiative = Boolean(c.initiative) && c.initiative.trim() !== "" && c.initiative.trim() !== "—" && c.initiative.trim() !== "Không";
                        const hasMerit = hasReward || hasInitiative;
                        return (
                          <tr key={c.id} className={hasMerit ? "has-merit-row" : ""}>
                            <td>{i + 1}</td>
                            <td className="mono">{c.id}</td>
                            <td className="name-cell">
                              <strong>{c.name}</strong>
                              {c.lead && <em>Lead</em>}
                            </td>
                            <td>
                              <strong>{c.team}</strong>
                            </td>
                            <td>
                              <strong className="vote-value">{c.votes}</strong>
                            </td>
                            <td>{(c.rate * 100).toFixed(1)}%</td>
                            <td>{c.score.toFixed(3)}</td>
                            <td>
                              <span className={`ki ki-${c.ki}`}>{c.ki}</span>
                            </td>
                            <td>
                              {hasInitiative ? (
                                <span className="merit-tag initiative-tag">
                                  <Sparkles size={11} className="merit-icon" />
                                  {c.initiative}
                                </span>
                              ) : (
                                <span className="text-slate-400">{c.initiative || "—"}</span>
                              )}
                            </td>
                            <td>
                              {hasReward ? (
                                <span className="merit-tag reward-tag">
                                  <Award size={11} className="merit-icon" />
                                  {c.reward}
                                </span>
                              ) : (
                                <span className="text-slate-400">{c.reward || "—"}</span>
                              )}
                            </td>
                            <td>
                              <span className="font-semibold text-emerald-700">
                                {teamStatsMap[c.team]?.percentage || "0.0"}% ({teamStatsMap[c.team]?.count || 0}/18)
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {!top18Filtered.length && (
                        <tr>
                          <td colSpan={11} className="text-center py-6 text-slate-500">
                            Không có dữ liệu phù hợp với tìm kiếm.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
                    <th>Tỷ lệ % Team (Top 18)</th>
                    <th>Tiêu chuẩn CSTĐ thỏa mãn</th>
                  </tr>
                </thead>
                <tbody>
                  {cstdList.map((c, i) => {
                    const hasReward = Boolean(c.reward) && c.reward.trim() !== "" && c.reward.trim() !== "—" && c.reward.trim() !== "Không";
                    const hasInitiative = Boolean(c.initiative) && c.initiative.trim() !== "" && c.initiative.trim() !== "—" && c.initiative.trim() !== "Không";
                    const hasMerit = hasReward || hasInitiative;
                    const st = c.cstdState || "Đủ chuẩn sơ bộ";
                    const badgeClass =
                      st.includes("Sáng kiến") && st.includes("Top 18")
                        ? "bg-purple-100 text-purple-800 border-purple-200"
                        : st.includes("Top 18")
                        ? "bg-blue-100 text-blue-800 border-blue-200"
                        : "bg-amber-100 text-amber-800 border-amber-200";

                    return (
                      <tr key={c.id} className={hasMerit ? "has-merit-row" : ""}>
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
                        <td>
                          {hasInitiative ? (
                            <span className="merit-tag initiative-tag">
                              <Sparkles size={11} className="merit-icon" />
                              {c.initiative}
                            </span>
                          ) : (
                            <span className="text-slate-400">{c.initiative || "—"}</span>
                          )}
                        </td>
                        <td>
                          {hasReward ? (
                            <span className="merit-tag reward-tag">
                              <Award size={11} className="merit-icon" />
                              {c.reward}
                            </span>
                          ) : (
                            <span className="text-slate-400">{c.reward || "—"}</span>
                          )}
                        </td>
                        <td>
                          <span className="font-semibold text-emerald-700">
                            {teamStatsMap[c.team]?.percentage || "0.0"}% ({teamStatsMap[c.team]?.count || 0}/18)
                          </span>
                        </td>
                        <td>
                          <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${badgeClass}`}>
                            {st}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!cstdList.length && (
                    <tr>
                      <td colSpan={12} className="text-center py-6 text-slate-500">
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
            placeholder="Nhập mã xác nhận quản trị"
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
