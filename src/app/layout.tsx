import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bình chọn Thi đua, Khen thưởng 2026 | VCX",
  description: "Hệ thống bình chọn nội bộ Trung tâm Công nghệ & Kỹ thuật",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
