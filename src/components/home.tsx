"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Trophy,
  Eye,
  EyeOff,
  Vote,
  ChartNoAxesCombined,
  History,
  LockKeyhole,
  Users,
  Check,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { Header } from "./header";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { api, proof } from "@/lib/client";
import type { Me, Progress } from "@/lib/types";

export function Home() {
  const router = useRouter(),
    [code, setCode] = useState(""),
    [show, setShow] = useState(false),
    [admin, setAdmin] = useState(false),
    [adminCode, setAdminCode] = useState(""),
    [reviewModal, setReviewModal] = useState(false),
    [reviewCode, setReviewCode] = useState(""),
    [resetModal, setResetModal] = useState(false),
    [resetAdminCode, setResetAdminCode] = useState(""),
    [resetSuccess, setResetSuccess] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");

  const { data: progress, error: progressError, mutate: refreshProgress } = useSWR<Progress>(
    "voting/progress",
    api,
    { refreshInterval: 15000, shouldRetryOnError: false },
  );

  async function login(mode: "vote" | "review" | "admin", targetCode?: string) {
    setError("");
    setBusy(mode);
    try {
      const credentials = await proof();
      if (mode === "admin") {
        await api("admin/login", {
          code: adminCode,
          ...credentials,
          website: "",
        });
        router.push("/admin");
      } else {
        const useCode = targetCode || code;
        if (!/^\d{4}$/.test(useCode)) {
          setError("Vui lòng nhập đúng mã bí mật gồm 4 chữ số.");
          return;
        }
        const result = await api<Me>("auth/voter", {
          code: useCode,
          ...credentials,
          website: "",
        });
        if (mode === "review") {
          if (!result.ballot) {
            setError(`Mã ${useCode} chưa nộp phiếu. Hãy chọn Bình chọn để bắt đầu.`);
            return;
          }
          router.push(`/phieu?mode=review&code=${useCode}`);
          return;
        }
        if (mode === "vote") {
          if (result.ballot) {
            // Đã nộp rồi, không cho bình chọn nữa mà chuyển sang xem lại
            router.push(`/phieu?mode=review&code=${useCode}&submitted=1`);
            return;
          }
          router.push(`/phieu?mode=vote&code=${useCode}`);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function handleResetData() {
    setBusy("reset");
    setError("");
    setResetSuccess("");
    try {
      await api("admin/reset", { adminCode: resetAdminCode });
      setResetSuccess("Đã khôi phục hoàn toàn dữ liệu về ban đầu thành công! Bạn có thể bắt đầu bình chọn ngay.");
      await refreshProgress();
      setResetAdminCode("");
      setTimeout(() => {
        setResetModal(false);
        setResetSuccess("");
      }, 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const percent = progress?.total
    ? Math.round((progress.submitted / progress.total) * 100)
    : 0;

  return (
    <>
      <Header onResetClick={() => {
        setError("");
        setResetSuccess("");
        setResetAdminCode("");
        setResetModal(true);
      }} />
      <main className="home-shell">
        <section className="intro">
          <div className="eyebrow">
            <span className="line" /> CÙNG GHI NHẬN NHỮNG ĐÓNG GÓP
          </div>
          <h1>
            Bình chọn thi đua,
            <br />
            <span>khen thưởng 2026</span>
          </h1>
          <p>
            Mỗi lá phiếu là một sự ghi nhận.
            <br className="mobile-only" /> Cùng tôn vinh những đóng góp
            <br className="desktop-only" /> và nỗ lực của đồng nghiệp trong năm
            vừa qua.
          </p>
          <div className="year-mark">
            <Trophy size={78} strokeWidth={1} />
            <span>2026</span>
            <div className="year-caption">
              GHI NHẬN NỖ LỰC · LAN TỎA GIÁ TRỊ
            </div>
          </div>
          <div className="process">
            <span>
              <b>1</b> Nhập mã bí mật
            </span>
            <i />
            <span>
              <b>2</b> Chọn đồng nghiệp
            </span>
            <i />
            <span>
              <b>3</b> Xác nhận & nộp
            </span>
          </div>
        </section>
        <section className="entry-card">
          <div className="card-top">
            <div>
              <span className="section-kicker">BÌNH CHỌN NỘI BỘ</span>
              <h2>Lá phiếu của bạn</h2>
            </div>
            <div className="soft-icon">
              <Vote size={24} />
            </div>
          </div>
          <div className="participation">
            <div className="progress-label">
              <span>
                <Users size={16} />
                Tiến độ tham gia
              </span>
              <strong>{progress?.ready ? `${percent}%` : "—"}</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${percent}%` }} />
            </div>
            <p>
              {progress?.ready ? (
                <>
                  Đã bình chọn: <strong>{progress.submitted}</strong> / {progress.total} người đủ điều kiện
                </>
              ) : progressError ? (
                "Đang chờ kết nối hệ thống"
              ) : (
                "Đang tải tiến độ…"
              )}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login("vote");
            }}
          >
            <label htmlFor="voter-code">Nhập mã bí mật của bạn</label>
            <div className="code-input">
              <input
                id="voter-code"
                type={show ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="off"
                placeholder="• • • •"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
              <button
                type="button"
                aria-label={show ? "Ẩn mã" : "Hiện mã"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="input-hint">
              <LockKeyhole size={13} />
              Mã bí mật gồm 4 chữ số riêng biệt, hoàn toàn ẩn danh.
            </p>
            {error && !admin && !reviewModal && !resetModal && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <Button className="full" disabled={code.length !== 4 || !!busy}>
              {busy === "vote" ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Vote size={18} />
              )}{" "}
              Bình chọn
            </Button>
          </form>
          <div className="secondary-actions">
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                setError("");
                setAdmin(true);
              }}
            >
              <ChartNoAxesCombined size={17} />
              Tổng hợp kết quả
            </Button>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => {
                if (code.length === 4) {
                  void login("review");
                } else {
                  setError("");
                  setReviewCode("");
                  setReviewModal(true);
                }
              }}
            >
              <History size={17} />
              Xem lại KQ
            </Button>
          </div>
          <div className="privacy">
            <Check size={16} />
            <span>Mã bình chọn không liên kết với thông tin cá nhân của người bỏ phiếu.</span>
          </div>
        </section>
        <section className="home-note">
          <LockKeyhole size={17} />
          <p>
            Mã bình chọn là thông tin bảo mật của bạn. Vui lòng không chia sẻ mã với người khác.
            <br />
            <span>
              Kết quả bình chọn là căn cứ tham khảo cho công tác xét thi đua, khen thưởng năm 2026.
            </span>
          </p>
        </section>
      </main>
      <footer className="site-footer">
        <span>VCX · Trung tâm Công nghệ & Kỹ thuật</span>
        <span>Thi đua, khen thưởng năm 2026</span>
      </footer>

      {/* Dialog Tổng hợp kết quả (Mã quản trị: anhvh6) */}
      <Dialog
        open={admin}
        onOpenChange={setAdmin}
        title="Tổng hợp kết quả"
        description="Nhập mã 'anhvh6' để xem bảng kết quả thi đua khen thưởng."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login("admin");
          }}
        >
          <label htmlFor="admin-code">Mã tổng hợp kết quả</label>
          <input
            id="admin-code"
            type="password"
            autoComplete="off"
            placeholder="Nhập mã (anhvh6)"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
            required
          />
          {error && admin && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button className="full" disabled={!adminCode || !!busy}>
            {busy === "admin" ? "Đang xác thực…" : "Xem kết quả"}
          </Button>
        </form>
      </Dialog>

      {/* Dialog Xem lại KQ khi chưa nhập mã trên trang chủ */}
      <Dialog
        open={reviewModal}
        onOpenChange={setReviewModal}
        title="Xem lại kết quả bình chọn"
        description="Nhập mã bí mật 4 chữ số để kiểm tra lại các lựa chọn đã nộp."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login("review", reviewCode);
          }}
        >
          <label htmlFor="modal-review-code">Mã bí mật (4 chữ số)</label>
          <input
            id="modal-review-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            placeholder="• • • •"
            value={reviewCode}
            onChange={(e) => setReviewCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          {error && reviewModal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button className="full" disabled={reviewCode.length !== 4 || !!busy}>
            {busy === "review" ? "Đang tải…" : "Xem kết quả phiếu"}
          </Button>
        </form>
      </Dialog>

      {/* Dialog Reset / Khôi phục dữ liệu mặc định (Nút Nội bộ) */}
      <Dialog
        open={resetModal}
        onOpenChange={setResetModal}
        title="Khôi phục dữ liệu mặc định"
        description="Xóa toàn bộ các phiếu đã bình chọn nháp và đưa hệ thống về trạng thái ban đầu sạch sẽ để chạy thực tế."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleResetData();
          }}
        >
          <label htmlFor="reset-admin-code">Mã xác nhận quản trị</label>
          <input
            id="reset-admin-code"
            type="password"
            autoComplete="off"
            placeholder="Nhập mã quản trị (anhvh6)"
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
          <div className="text-xs text-slate-500 my-2 leading-relaxed">
            Hệ thống sẽ đồng bộ lại danh sách nhân sự từ sheet PTUD (2), xóa các phiếu thử nghiệm, đặt lại 40 mã bí mật về trạng thái chưa sử dụng và mở đợt bình chọn ngay lập tức.
          </div>
          <Button
            className="full"
            variant="destructive"
            disabled={!resetAdminCode || !!busy}
          >
            {busy === "reset" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <RotateCcw size={18} />
            )}
            Xác nhận khôi phục về ban đầu
          </Button>
        </form>
      </Dialog>
    </>
  );
}
