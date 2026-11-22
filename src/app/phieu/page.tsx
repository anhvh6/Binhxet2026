import { Suspense } from "react";
import { BallotScreen } from "@/components/ballot";

export default function Page() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="empty">Đang tải lá phiếu…</div></div>}>
      <BallotScreen />
    </Suspense>
  );
}
