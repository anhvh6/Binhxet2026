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
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Trophy size={22} />
          </span>
          <span>
            VCX<span className="brand-divider">/</span>
            <span className="brand-sub">Thi đua 2026</span>
          </span>
        </Link>
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
