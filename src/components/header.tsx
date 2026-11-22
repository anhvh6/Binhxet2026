import Link from "next/link";
import { Trophy, ShieldCheck } from "lucide-react";
export function Header() {
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
          <span className="secure">
            <ShieldCheck size={15} />
            Nội bộ
          </span>
        </div>
      </div>
    </header>
  );
}
