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
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const { data: progress, error: progressError } = useSWR<Progress>(
    "voting/progress",
    api,
    { refreshInterval: 20000, shouldRetryOnError: false },
  );
  async function login(mode: "vote" | "review" | "admin") {
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
        const result = await api<Me>("auth/voter", {
          code,
          ...credentials,
          website: "",
        });
        if (mode === "review" && !result.ballot) {
          setError("Bạn chưa nộp phiếu. Hãy chọn Bình chọn để bắt đầu.");
          return;
        }
        if (mode === "vote" && result.ballot) {
          router.push("/phieu?mode=review");
          return;
        }
        router.push(`/phieu?mode=${mode}`);
      }
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
      <Header />
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
              <b>1</b> Nhập mã cá nhân
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
                  <strong>{progress.submitted}</strong> / {progress.total} người
                  đã bình chọn
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
              Mã 4 chữ số được cấp riêng cho từng nhân viên.
            </p>
            {error && !admin && (
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
              disabled={code.length !== 4 || !!busy}
              onClick={() => void login("review")}
            >
              <History size={17} />
              Xem lại KQ
            </Button>
          </div>
          <div className="privacy">
            <Check size={16} />
            <span>Phiếu được lưu sau khi bạn xác nhận nộp.</span>
          </div>
        </section>
        <section className="home-note">
          <LockKeyhole size={17} />
          <p>
            Mã bình chọn là thông tin cá nhân. Vui lòng không chia sẻ mã với
            người khác.
            <br />
            <span>
              Kết quả bình chọn là căn cứ tham khảo cho công tác xét thi đua,
              khen thưởng.
            </span>
          </p>
        </section>
      </main>
      <footer className="site-footer">
        <span>VCX · Trung tâm Công nghệ & Kỹ thuật</span>
        <span>Thi đua, khen thưởng năm 2026</span>
      </footer>
      <Dialog
        open={admin}
        onOpenChange={setAdmin}
        title="Tổng hợp kết quả"
        description="Dành cho quản trị viên được phân quyền."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login("admin");
          }}
        >
          <label htmlFor="admin-code">Mã quản trị</label>
          <input
            id="admin-code"
            type="password"
            autoComplete="off"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
            required
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button className="full" disabled={!!busy}>
            {busy ? "Đang xác thực…" : "Đăng nhập"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
