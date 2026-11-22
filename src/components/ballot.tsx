"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  LockKeyhole,
  LoaderCircle,
  Search,
  LogOut,
  Pencil,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Header } from "./header";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { api } from "@/lib/client";
import type { Ballot, Me } from "@/lib/types";
import type { Candidate } from "@/lib/domain";
export function BallotScreen() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [stage, setStage] = useState<"vote" | "confirm" | "review" | "success">(
      "vote",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [editDialog, setEditDialog] = useState(false),
    [editCode, setEditCode] = useState(""),
    [key, setKey] = useState("");
  useEffect(() => {
    api<Me>("ballot/me")
      .then((data) => {
        setMe(data);
        setSelected(data.ballot?.choices ?? []);
        setStage(data.ballot ? "review" : "vote");
        setKey(crypto.randomUUID());
      })
      .catch((e) => setError(e.message));
  }, []);
  async function logout() {
    setBusy(true);
    try {
      await api("auth/logout", {});
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await api("ballot/unlock-edit", { code: editCode });
      setEditDialog(false);
      setStage("vote");
      setKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function proceed() {
    setBusy(true);
    setError("");
    try {
      await api("ballot/validate", {
        choices: selected,
        revision: me?.ballot?.revision ?? 0,
        idempotencyKey: key,
      });
      setStage("confirm");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!me) return;
    setBusy(true);
    setError("");
    try {
      const ballot = await api<Ballot>("ballot/submit", {
        choices: selected,
        revision: me.ballot?.revision ?? 0,
        idempotencyKey: key,
      });
      setMe({ ...me, ballot });
      setStage("success");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function toggle(c: Candidate) {
    setError("");
    setKey(crypto.randomUUID());
    setSelected((prev) => {
      if (prev.includes(c.id)) return prev.filter((id) => id !== c.id);
      const team = me!.election.snapshot.teams.find((t) => t.id === c.team)!;
      const count = prev.filter(
        (id) =>
          me!.election.snapshot.candidates.find((c) => c.id === id)?.team ===
          team.id,
      ).length;
      if (count >= team.quota) return prev;
      return [...prev, c.id];
    });
  }
  if (!me)
    return (
      <>
        <Header />
        <main className="page-shell">
          <div className={error ? "error" : "empty"}>
            {error || "Đang tải phiếu của bạn…"}
          </div>
          <Link href="/">Về trang chủ</Link>
        </main>
      </>
    );
  const { teams, candidates } = me.election.snapshot,
    total = teams.reduce((n, t) => n + t.quota, 0),
    counts = new Map(
      teams.map((t) => [
        t.id,
        selected.filter(
          (id) => candidates.find((c) => c.id === id)?.team === t.id,
        ).length,
      ]),
    ),
    done = teams.filter((t) => counts.get(t.id) === t.quota).length,
    readOnly = stage === "review" || stage === "success",
    onlySelected = stage !== "vote";
  return (
    <>
      <Header />
      <main className="page-shell ballot-shell">
        <div className="page-topline">
          <Link href="/" className="back-link">
            <ChevronLeft size={16} />
            Trang chủ
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
            disabled={busy}
          >
            <LogOut size={16} />
            Đăng xuất
          </Button>
        </div>
        {stage === "success" && (
          <div className="success-panel">
            <span>
              <CheckCheck size={28} />
            </span>
            <div>
              <h2>Nộp phiếu thành công</h2>
              <p>Phiếu của bạn đã được ghi nhận trên Google Sheets.</p>
            </div>
          </div>
        )}
        <div className="page-title-row">
          <div>
            <div className="eyebrow">THI ĐUA, KHEN THƯỞNG 2026 · LĐTT</div>
            <h1>
              {stage === "confirm"
                ? "Xác nhận trước khi nộp kết quả"
                : readOnly
                  ? "Kết quả bình chọn của bạn"
                  : "Cùng ghi nhận đồng nghiệp"}
            </h1>
            <p>
              {stage === "vote"
                ? "Chọn đúng chỉ tiêu của mỗi team. Bạn có thể chọn Lead, đồng nghiệp khác team và chính mình."
                : stage === "confirm"
                  ? "Kiểm tra danh sách đã chọn trước khi gửi phiếu chính thức."
                  : "Danh sách lựa chọn trong phiếu có hiệu lực gần nhất của bạn."}
            </p>
          </div>
          <div className="identity-card">
            <LockKeyhole size={18} />
            <div>
              <span>Mã bình chọn của bạn</span>
              <strong>{me.code}</strong>
            </div>
          </div>
        </div>
        <div className="ballot-meta">
          <span>
            Phiên dữ liệu <b>v{me.election.version}</b>
          </span>
          <span>
            {readOnly
              ? "Đã nộp"
              : me.election.status === "closed"
                ? "Kỳ bình chọn đã đóng"
                : "Kỳ bình chọn đang mở"}
          </span>
          {me.ballot && (
            <span>
              Nộp gần nhất:{" "}
              {new Date(me.ballot.updatedAt).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
          )}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {stage === "vote" && (
          <>
            <nav className="team-nav" aria-label="Các team">
              {teams.map((t) => (
                <a
                  key={t.id}
                  href={`#team-${t.order}`}
                  className={counts.get(t.id) === t.quota ? "complete" : ""}
                >
                  {t.id}
                  <span>
                    {counts.get(t.id)}/{t.quota}
                  </span>
                </a>
              ))}
            </nav>
            <div className="search">
              <Search size={18} />
              <input
                aria-label="Tìm ứng viên"
                placeholder="Tìm theo họ tên hoặc mã nhân viên…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </>
        )}
        {teams.map((team) => {
          const people = candidates.filter(
            (c) =>
              c.team === team.id &&
              (!onlySelected || selected.includes(c.id)) &&
              (!query ||
                onlySelected ||
                `${c.name} ${c.id}`
                  .toLocaleLowerCase("vi")
                  .includes(query.toLocaleLowerCase("vi"))),
          );
          return (
            <section
              className="team-section"
              id={`team-${team.order}`}
              key={team.id}
            >
              <div className="team-heading">
                <div>
                  <span className="team-number">{team.label}</span>
                  <div>
                    <h2>Team {team.id}</h2>
                    <p>
                      {onlySelected
                        ? `${people.length} người được chọn`
                        : `Cùng Team, Tích chọn ${team.quota} người · ${team.size} nhân sự`}
                    </p>
                  </div>
                </div>
                <span
                  className={`count-pill ${counts.get(team.id) === team.quota ? "complete" : ""}`}
                >
                  {counts.get(team.id) === team.quota && <Check size={15} />}Đã
                  chọn {counts.get(team.id)}/{team.quota}
                </span>
              </div>
              <div className="candidate-table">
                <div className="candidate-header">
                  <span>STT</span>
                  <span>MNV · HỌ VÀ TÊN</span>
                  <span>TEAM</span>
                  <span>ĐIỂM TB / KI</span>
                  <span>SÁNG KIẾN - Ý TƯỞNG</span>
                  <span>KHEN THƯỞNG ĐV + TĐ</span>
                  <span>LĐTT</span>
                </div>
                {people.map((c, i) => {
                  const checked = selected.includes(c.id),
                    disabled =
                      onlySelected ||
                      busy ||
                      me.election.status !== "open" ||
                      (!checked && counts.get(team.id) === team.quota);
                  return (
                    <label
                      className={`candidate-row ${checked ? "selected" : ""} ${disabled && !checked ? "disabled" : ""}`}
                      key={c.id}
                    >
                      <span className="candidate-index">{i + 1}</span>
                      <div className="candidate-name">
                        <span className="candidate-id">{c.id}</span>
                        <strong>
                          {c.name}
                          {c.lead && <em>Lead</em>}
                        </strong>
                      </div>
                      <span className="candidate-team">{c.team}</span>
                      <span className="candidate-score">
                        <b>{c.score.toFixed(3)}</b>
                        <span className={`ki ki-${c.ki}`}>{c.ki}</span>
                      </span>
                      <span className="candidate-detail">
                        <small>Sáng kiến</small>
                        {c.initiative || "—"}
                      </span>
                      <span className="candidate-detail">
                        <small>Khen thưởng</small>
                        {c.reward || "—"}
                      </span>
                      <span className="candidate-check">
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${c.name}`}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(c)}
                        />
                      </span>
                    </label>
                  );
                })}
                {!people.length && (
                  <div className="empty">Không có ứng viên khớp tìm kiếm.</div>
                )}
              </div>
            </section>
          );
        })}
        {readOnly && (
          <div className="review-actions">
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setEditCode("");
                setEditDialog(true);
              }}
              disabled={me.election.status !== "open"}
            >
              <Pencil size={17} />
              Sửa phiếu
            </Button>
            <Button variant="ghost" onClick={() => void logout()}>
              Xem phiếu khác
            </Button>
            <span>
              Để xem phiếu khác, đăng nhập lại bằng mã cá nhân tương ứng.
            </span>
          </div>
        )}
        <div className="ballot-disclaimer">
          <ShieldCheck size={18} />
          Kết quả LĐTT là căn cứ tham khảo, chưa phải quyết định trao danh hiệu
          cuối cùng.
        </div>
      </main>
      {!readOnly && (
        <div className="sticky-ballot">
          <div>
            <div>
              <strong>
                Đã chọn {selected.length}
                <span>/{total}</span>
              </strong>
              <p>
                {done}/{teams.length} team hoàn thành
              </p>
            </div>
            <div className="sticky-actions">
              {stage === "confirm" ? (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setStage("vote")}
                  >
                    <Pencil size={16} />
                    Sửa
                  </Button>
                  <Button
                    disabled={busy || me.election.status !== "open"}
                    onClick={() => void submit()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Send size={18} />
                    )}
                    Nộp phiếu
                  </Button>
                </>
              ) : (
                <>
                  <span className="desktop-only">
                    {teams
                      .filter((t) => counts.get(t.id) !== t.quota)
                      .map(
                        (t) =>
                          `${t.id} thiếu ${t.quota - (counts.get(t.id) ?? 0)}`,
                      )
                      .join(" · ") || "Bạn đã chọn đủ chỉ tiêu."}
                  </span>
                  <Button
                    disabled={
                      done !== teams.length ||
                      busy ||
                      me.election.status !== "open"
                    }
                    onClick={() => void proceed()}
                  >
                    {busy ? "Đang kiểm tra…" : "Tiếp tục"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <Dialog
        open={editDialog}
        onOpenChange={setEditDialog}
        title="Nhập mã xác nhận để chỉnh sửa phiếu"
        description="Phiếu cũ vẫn có hiệu lực cho đến khi bạn nộp lại thành công."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <label htmlFor="edit-code">Mã xác nhận sửa</label>
          <input
            id="edit-code"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={editCode}
            onChange={(e) => setEditCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button disabled={busy || editCode.length !== 4} className="full">
            {busy ? "Đang xác thực…" : "Mở chỉnh sửa"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
