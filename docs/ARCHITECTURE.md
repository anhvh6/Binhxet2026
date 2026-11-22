# Kiến trúc sau điều chỉnh của người dùng

Người dùng yêu cầu bỏ Supabase, cấp 40 mã bốn số trực tiếp trên Google Sheet và lưu kết quả vào cùng file. Vì vậy bản triển khai dùng **Next.js → Google Apps Script → Google Sheets**, không có PostgreSQL, ORM hay tài khoản Service Account. Đây là thay đổi có chủ đích so với file yêu cầu ban đầu.

## Các lớp

- UI: Next.js App Router, React, TypeScript strict, Tailwind, các primitive shadcn/ui dựa trên Radix, Lucide, SWR.
- API `/api/[...path]`: cùng origin, kiểm tra Zod, cookie HttpOnly/Secure/SameSite Strict, không trả kết quả quản trị công khai.
- `src/server/bridge.ts`: POST được ký HMAC-SHA256 kèm timestamp và nonce; khóa ký chỉ nằm trong Vercel Environment và Apps Script Properties.
- Apps Script `Code.gs`: nguồn nhân sự, chốt phiên, xác thực, phiên, phiếu, kết quả, audit và hạn chế thử mã. LockService bao quanh toàn bộ đọc/kiểm tra/ghi.
- Sheets API v4 `spreadsheets.batchUpdate`: cập nhật phiếu hiệu lực, revision, idempotency, trạng thái mã, chi tiết và bảng tổng hợp cùng một batch nguyên tử. API trả lỗi thì không báo nộp thành công. Nếu mất phản hồi sau commit, gửi lại cùng idempotency key trả phiếu cũ.

## Luồng

Trang chủ → mã cá nhân → Apps Script xác thực → danh sách snapshot → kiểm tra đủ chỉ tiêu → xác nhận → nộp → xem lại. Sửa phiếu: mã cá nhân + mã xác nhận sửa, grant 15 phút, đối chiếu revision; phiếu cũ giữ hiệu lực đến khi thay thế. Grant sửa ở mọi phiên của cùng người được tiêu thụ khi nộp lại.

Quản trị: mã quản trị được kiểm tra bằng scrypt tại Next.js → phiên 30 phút trên Sheet → đối chiếu nguồn/cảnh báo → chốt v1 → kết quả, Excel, CSTĐ, nhật ký, đóng kỳ. Snapshot không thể thay thế giữa kỳ. Kỳ tiếp theo cần phiên bản election ID mới, không xóa phiếu cũ.

## Mô hình dữ liệu trên Sheets

| Sheet | Khóa / nội dung |
|---|---|
| MA BINH CHON | Một hàng/MNV, mã chuỗi đúng 4 số duy nhất, trạng thái, giờ nộp/sửa |
| CAU HINH BINH CHON | election metadata, teams JSON và mỗi ứng viên một hàng JSON; snapshot bất biến |
| PHIEU BINH CHON | Một hàng/MNV/kỳ có hiệu lực, lựa chọn JSON, revision, version |
| PHIEN BAN PHIEU | Một hàng cho mỗi revision để kiểm toán |
| CHI TIET PHIEU | Một hàng/lựa chọn hiệu lực; tái tạo từ canonical ballots |
| KET QUA LDTT | Tất cả ứng viên, kể cả 0 lượt, đếm từ phiếu hiện hành |
| KET QUA TEAM | Tổng lượt theo team, không đếm số người có ít nhất một phiếu |
| KET QUA CSTĐ | Trạng thái thủ công có audit, không dùng phiếu LĐTT làm CSTĐ |
| PHIEN DANG NHAP | Hash token, vai trò, MNV, hạn phiên, quyền sửa; gắn fingerprint mã |
| YEU CAU DA XU LY | MNV + idempotency key + digest nội dung + response |
| GIOI HAN TRUY CAP | Bộ đếm mã/IP đã HMAC, 15 phút, dùng chung giữa các server Vercel |
| NHAT KY HE THONG | Giờ, actor, sự kiện và chi tiết không chứa bí mật |

## Giới hạn cần hiểu rõ

LockService chỉ khóa các lần chạy **cùng dự án Apps Script**. Chỉnh Sheet bằng tay, tạo backend thứ hai hoặc script khác sẽ vượt ngoài khóa. Trong kỳ đang mở, chỉ một backend được quyền ghi các sheet hệ thống. Không cho người bình chọn quyền xem file nguồn: theo yêu cầu mới, mã plaintext ở MA BINH CHON và kết quả nằm chung file, mọi người xem file đều có thể đọc. Ẩn sheet/bảo vệ chỉnh sửa không bảo mật việc đọc.

Chống dò: giới hạn 20 lần/IP/15 phút và 8 lần/mã/15 phút, khóa sửa 5 lần/15 phút, proof-of-work ở web, nonce, audit lỗi xác thực. Mã 4 số vẫn là lớp xác thực yếu, phù hợp phạm vi nội bộ được quản lý. Rate limit dựa trên IP do Vercel cấp, không tin header tự đặt từ client.

Apps Script/Sheets có quota, timeout và độ trễ lớn hơn database. Web không công bố thành công nếu batch chưa ghi. Đây không có hàng đợi database độc lập vì Sheets là kho chính; khi dịch vụ Sheets tạm ngừng, người dùng phải giữ trang và thử lại. Dữ liệu phiếu không chỉ nằm trong localStorage (không dùng localStorage).

Code.gs có phạm vi đọc nguồn giới hạn 200 dòng để tránh lấy cả lưới không cần thiết; cần điều chỉnh có kiểm tra trước khi tăng quy mô nhân sự. Hiện tại 44 người nằm trong giới hạn này.
