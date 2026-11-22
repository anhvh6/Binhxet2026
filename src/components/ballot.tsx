"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Award,
  Sparkles,
} from "lucide-react";
import { Header } from "./header";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { api } from "@/lib/client";
import type { Ballot, Me, ReviewResult } from "@/lib/types";
import { validateChoices, type Candidate } from "@/lib/domain";

export function BallotScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode");
  const isSubmittedParam = searchParams.get("submitted") === "1";

  const [me, setMe] = useState<Me | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [stage, setStage] = useState<"vote" | "confirm" | "review" | "success">(
      initialMode === "review" ? "review" : "vote",
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(
      isSubmittedParam
        ? "Mã này đã nộp phiếu bình chọn. Bạn có thể xem lại hoặc nhập mã xác nhận để sửa phiếu."
        : "",
    ),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [editDialog, setEditDialog] = useState(false),
    [editCode, setEditCode] = useState(""),
    [nextReviewCode, setNextReviewCode] = useState(""),
    [key, setKey] = useState("");

  useEffect(() => {
    api<Me>("ballot/me")
      .then((data) => {
        setMe(data);
        setSelected(data.ballot?.choices ?? []);
        if (data.ballot && !data.canEdit && initialMode !== "vote") {
          setStage("review");
        } else if (data.ballot && !data.canEdit && initialMode === "vote") {
          setStage("review");
          setNotice("Mã này đã nộp phiếu. Nếu muốn sửa lại, vui lòng nhấn 'Sửa' và nhập mã xác nhận.");
        } else {
          setStage(initialMode === "review" && data.ballot ? "review" : "vote");
        }
        setKey(crypto.randomUUID());
      })
      .catch((e) => setError((e as Error).message));
  }, [initialMode]);

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
      await api("ballot/unlock-edit", {
        code: editCode,
        voterCode: me?.code,
      });
      setEditDialog(false);
      setStage("vote");
      setNotice("Đã mở quyền sửa phiếu thành công. Bạn có thể thay đổi các lựa chọn và nộp lại.");
      setKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function lookupNextCode() {
    if (!/^\d{4}$/.test(nextReviewCode)) {
      setError("Vui lòng nhập đúng mã bí mật gồm 4 chữ số.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api<ReviewResult>("auth/review", { code: nextReviewCode });
      if (res && res.ballot) {
        setMe({
          voterId: res.code,
          code: res.code,
          ballot: res.ballot,
          election: res.election,
          canEdit: false,
        });
        setSelected(res.ballot.choices);
        setStage("review");
        setNotice(`Đang hiển thị kết quả bình chọn của mã bí mật ${res.code}.`);
        setNextReviewCode("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function proceedToConfirm() {
    if (!me) return;
    setBusy(true);
    setError("");
    try {
      validateChoices(me.election.snapshot, selected);
      await api("ballot/validate", {
        choices: selected,
        revision: me.ballot?.revision ?? 0,
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
    if (stage !== "vote") return;
    setError("");
    setNotice("");
    setKey(crypto.randomUUID());
    setSelected((prev) => {
      if (prev.includes(c.id)) return prev.filter((id) => id !== c.id);
      const team = me!.election.snapshot.teams.find((t) => t.id === c.team)!;
      const count = prev.filter(
        (id) =>
          me!.election.snapshot.candidates.find((x) => x.id === id)?.team ===
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
            {error || "Đang tải dữ liệu bình chọn…"}
          </div>
          <div className="mt-4">
            <Link href="/" className="back-link">
              <ChevronLeft size={16} /> Về trang chủ
            </Link>
          </div>
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
    isConfirm = stage === "confirm",
    onlySelected = stage !== "vote"; // Ở màn hình confirm và review: LOẠI BỎ CÁC DÒNG KHÔNG ĐƯỢC CHỌN

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
            Thoát
          </Button>
        </div>

        {stage === "success" && (
          <div className="success-panel">
            <span>
              <CheckCheck size={28} />
            </span>
            <div>
              <h2>Nộp phiếu thành công!</h2>
              <p>Phiếu của mã bình chọn <strong>{me.code}</strong> đã được ghi nhận trực tiếp vào Google Sheets.</p>
            </div>
          </div>
        )}

        <div className="page-title-row">
          <div>
            <div className="eyebrow">THI ĐUA, KHEN THƯỞNG 2026 · LĐTT</div>
            <h1>
              {isConfirm
                ? "Xác nhận trước khi nộp kết quả"
                : readOnly
                  ? "Xem lại kết quả bình chọn"
                  : "Bình chọn Lao động tiên tiến 2026"}
            </h1>
            <p>
              {stage === "vote"
                ? "Tích chọn đúng số lượng quy định cho từng team. Bạn có thể chọn Lead, đồng nghiệp khác team và chính mình."
                : isConfirm
                  ? "Danh sách các bạn đã được chọn. Vui lòng kiểm tra kỹ trước khi ấn Nộp."
                  : "Danh sách các bạn đã được chọn bởi mã bình chọn này."}
            </p>
          </div>
          <div className="identity-card">
            <LockKeyhole size={18} />
            <div>
              <span>Mã bình chọn</span>
              <strong>{me.code}</strong>
            </div>
          </div>
        </div>

        {/* Khung tìm kiếm mã bí mật khác ở chế độ xem lại */}
        {stage === "review" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Xem kết quả của mã bí mật tiếp theo:</span>
            </div>
            <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="Nhập mã khác (4 số)"
                value={nextReviewCode}
                onChange={(e) => setNextReviewCode(e.target.value.replace(/\D/g, ""))}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-44"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={nextReviewCode.length !== 4 || busy}
                onClick={() => void lookupNextCode()}
              >
                Xem
              </Button>
            </div>
          </div>
        )}

        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {/* Thanh điều hướng team chỉ hiện ở chế độ vote */}
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

        {/* Danh sách ứng viên theo từng team */}
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

          if (onlySelected && people.length === 0) return null;

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
                        : `Team ${team.id} (Cùng Team, Tích chọn ${team.quota} người) · ${team.size} nhân sự`}
                    </p>
                  </div>
                </div>
                <span
                  className={`count-pill ${counts.get(team.id) === team.quota ? "complete" : ""}`}
                >
                  {counts.get(team.id) === team.quota && <Check size={15} />}
                  Đã chọn {counts.get(team.id)}/{team.quota}
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
                  <span>BÌNH CHỌN LĐTT</span>
                </div>
                {people.map((c, i) => {
                  const checked = selected.includes(c.id),
                    // Quy tắc: khi đã chọn đủ quota của team (ví dụ IPCC chọn đủ 6) thì không được chọn thêm người khác trong team này
                    disabled =
                      onlySelected ||
                      busy ||
                      me.election.status !== "open" ||
                      (!checked && counts.get(team.id) === team.quota);

                  const hasReward =
                    Boolean(c.reward) &&
                    c.reward.trim() !== "" &&
                    c.reward.trim() !== "—" &&
                    c.reward.trim() !== "Không";

                  const hasInitiative =
                    Boolean(c.initiative) &&
                    c.initiative.trim() !== "" &&
                    c.initiative.trim() !== "—" &&
                    c.initiative.trim() !== "Không";

                  const hasMerit = hasReward || hasInitiative;

                  return (
                    <label
                      className={`candidate-row ${checked ? "selected" : ""} ${disabled && !checked ? "disabled" : ""} ${hasMerit ? "has-merit" : ""} ${hasReward ? "has-reward" : ""} ${hasInitiative ? "has-initiative" : ""}`}
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
                      <span className="candidate-detail candidate-initiative">
                        <small>Sáng kiến</small>
                        {hasInitiative ? (
                          <span className="merit-tag initiative-tag">
                            <Sparkles size={12} className="merit-icon" />
                            {c.initiative}
                          </span>
                        ) : (
                          c.initiative || "—"
                        )}
                      </span>
                      <span className="candidate-detail candidate-reward">
                        <small>Khen thưởng</small>
                        {hasReward ? (
                          <span className="merit-tag reward-tag">
                            <Award size={12} className="merit-icon" />
                            {c.reward}
                          </span>
                        ) : (
                          c.reward || "—"
                        )}
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
              </div>
            </section>
          );
        })}

        {/* Khung tìm kiếm mã bí mật khác ở cuối trang xem lại */}
        {stage === "review" && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-6 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Xem kết quả của mã bí mật tiếp theo:</span>
            </div>
            <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="Nhập mã khác (4 số)"
                value={nextReviewCode}
                onChange={(e) => setNextReviewCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nextReviewCode.length === 4) {
                    void lookupNextCode();
                  }
                }}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-44"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={nextReviewCode.length !== 4 || busy}
                onClick={() => void lookupNextCode()}
              >
                Xem
              </Button>
            </div>
          </div>
        )}

        {/* Các nút hành động ở màn hình xem lại kết quả */}
        {readOnly && (
          <div className="review-actions">
            <Button
              variant="default"
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
            <Button variant="outline" onClick={() => router.push("/")}>
              Về trang chủ
            </Button>
            <span>
              Muốn sửa lại phiếu đã nộp, nhấn nút &quot;Sửa phiếu&quot; và nhập mã xác nhận.
            </span>
          </div>
        )}

        <div className="ballot-disclaimer">
          <ShieldCheck size={18} />
          Kết quả bình chọn LĐTT là căn cứ ghi nhận tập thể, mã bình chọn hoàn toàn ẩn danh.
        </div>
      </main>

      {/* Thanh sticky dưới chân màn hình vote và confirm */}
      {!readOnly && (
        <div className="sticky-ballot">
          <div>
            <div>
              <strong>
                Đã chọn {selected.length}
                <span>/{total}</span> người
              </strong>
              <p>
                {done}/{teams.length} team đã đủ chỉ tiêu
              </p>
            </div>
            <div className="sticky-actions">
              {stage === "confirm" ? (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setStage("vote");
                      window.scrollTo({ top: 0 });
                    }}
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
                    Nộp
                  </Button>
                </>
              ) : (
                <>
                  <span className="desktop-only text-xs">
                    {teams
                      .filter((t) => counts.get(t.id) !== t.quota)
                      .map(
                        (t) =>
                          `${t.id} ${
                            (counts.get(t.id) ?? 0) < t.quota
                              ? `thiếu ${t.quota - (counts.get(t.id) ?? 0)}`
                              : `thừa ${(counts.get(t.id) ?? 0) - t.quota}`
                          }`,
                      )
                      .join(" · ") || "Đã chọn đủ 18 người."}
                  </span>
                  <Button
                    disabled={
                      selected.length !== total ||
                      done !== teams.length ||
                      busy ||
                      me.election.status !== "open"
                    }
                    onClick={() => void proceedToConfirm()}
                  >
                    {busy ? "Đang kiểm tra…" : "Tiếp tục"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog nhập mã xác nhận để sửa phiếu */}
      <Dialog
        open={editDialog}
        onOpenChange={setEditDialog}
        title="Nhập mã xác nhận để sửa phiếu"
        description="Nhập mã xác nhận để mở quyền chỉnh sửa lại phiếu bình chọn cho mã này."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <label htmlFor="edit-code">Mã xác nhận sửa phiếu</label>
          <input
            id="edit-code"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="Nhập mã xác nhận"
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
            {busy ? "Đang xác thực…" : "Xác nhận sửa phiếu"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
