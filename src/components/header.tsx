import Link from "next/link";
import { Trophy, ShieldCheck } from "lucide-react";
export function Header({
  onResetClick,
}: {
  onResetClick?: () => void;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand">
          <a
            href="https://docs.google.com/spreadsheets/d/1_m3YR8j_MobxiKh7UXFdjEsIM9pEuuP3ijrZCvP-rvE/edit?pli=1&gid=66119832#gid=66119832"
            target="_blank"
            rel="noopener noreferrer"
            className="brand-icon"
            title="Mở Google Sheet bình xét thi đua 2026"
            aria-label="Mở Google Sheet bình xét thi đua 2026"
          >
            <Trophy size={22} />
          </a>
          <Link href="/" className="brand-text">
            <span>
              VCX<span className="brand-divider">/</span>
              <span className="brand-sub">Thi đua 2026</span>
            </span>
          </Link>
        </div>
        <div className="header-right">
          <span className="desktop-only">TRUNG TÂM CÔNG NGHỆ & KỸ THUẬT</span>
          {onResetClick ? (
            <button
              type="button"
              className="secure cursor-pointer hover:bg-slate-100 transition-colors border border-slate-300 rounded-full px-3 py-1 text-slate-700 flex items-center gap-1.5"
              onClick={onResetClick}
              title="Nhấn để mở chức năng khôi phục/reset dữ liệu"
            >
              <ShieldCheck size={15} />
              Nội bộ
            </button>
          ) : (
            <span className="secure">
              <ShieldCheck size={15} />
              Nội bộ
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
