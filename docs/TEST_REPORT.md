# Kết quả kiểm thử – 22/11/2026

## Đã thực hiện

- `npm run lint`: đạt, không lỗi hoặc cảnh báo.
- `npm run typecheck`: đạt, TypeScript strict.
- `npm test`: 14/14 ca unit/integration đạt (bổ sung kiểm tra cùng origin và chặn cross-origin). Bao gồm 40 người/7 team/18 lựa chọn, giữ số 0 đầu; mã sai/rate limit; thiếu, thừa, trùng và ứng viên ngoài snapshot; nộp trùng idempotency; sửa và thay kết quả; quyền quản trị và quyền xem phiếu; tỷ lệ 75%; tổng team 120/60; lỗi batch giữ dữ liệu; snapshot bất biến/đóng kỳ; chữ ký sai/khóa bận; xung đột nguồn; xuất Excel 4 tab và audit.
- Ca dữ liệu thật: trực tiếp sử dụng bản đọc từ Google Sheet đã xác minh, 40 ứng viên, không xung đột danh sách, bảy team và tổng 18 chỉ tiêu. Fixture này bị gitignore, CI không chứa dữ liệu cá nhân.
- `npm run build`: đạt với Next.js webpack. Turbopack trên sandbox Windows ban đầu lỗi tạo tiến trình; chuyển sang webpack và build ngoài sandbox thành công.
- `npm run test:e2e`: 3/3 đạt trên Chrome. Kiểm tra không tràn ngang ở 360, 375, 390, 430, 768, 1024, 1440px; giữ mã có 0 đầu; hộp đăng nhập quản trị riêng; API kết quả trả 401 khi chưa đăng nhập.
- Đọc lại Google Sheet: MA BINH CHON có đúng 40 MNV duy nhất, 40 mã duy nhất, mọi mã đúng bốn chữ số và định dạng TEXT. Header navy, freeze hàng đầu/ba cột đầu, autofilter, chiều rộng cột và wrap đã kiểm tra qua metadata.

## Phạm vi giới hạn

Unit/integration sử dụng chính Code.gs với bộ mô phỏng Sheets API nguyên tử và LockService. Kiểm thử này không chứng minh quota, độ trễ hoặc concurrency của hạ tầng Google thật. Không nộp phiếu thử vào kỳ sản xuất để giữ sạch dữ liệu. Trước vận hành, khuyến nghị kiểm tra nộp/sửa đồng thời và mất kết nối trên **bản sao** Google Sheet cùng Apps Script riêng.

Các ca E2E giao diện công khai và phân quyền đã chạy; luồng nộp/sửa trên dữ liệu sản xuất chưa được chạy vì sẽ tạo phiếu thật. Quy tắc nghiệp vụ luồng đó đã có kiểm thử dịch vụ.
