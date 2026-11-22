# Bình chọn Thi đua, Khen thưởng 2026 – VCX

Ứng dụng nội bộ tiếng Việt cho Trung tâm Công nghệ & Kỹ thuật. Next.js chạy trên Vercel; Google Apps Script xử lý phiếu và lưu trực tiếp vào Google Sheet. **Không cần Supabase, PostgreSQL hoặc Google Service Account**, theo yêu cầu điều chỉnh của người dùng.

## Chạy tại máy

Yêu cầu Node.js 22 trở lên.

```powershell
npm ci
Copy-Item .env.example .env.local
# Điền các biến môi trường theo hướng dẫn bên dưới
npm run dev
```

Mở http://127.0.0.1:3000. Khi chưa cấu hình backend, trang chủ hiển thị rõ trạng thái chờ kết nối, không tạo nhân viên giả hoặc phiếu giả.

## Thiết lập Google Apps Script

1. Mở https://script.google.com, tạo **một** dự án dùng cho kỳ này, đặt tên VCX – Bình xét 2026.
2. Dán `apps-script/Code.gs` vào file mã.
3. Cài đặt dự án → bật hiển thị appsscript.json → thay bằng `apps-script/appsscript.json`. Manifest chỉ yêu cầu quyền Sheets và gọi HTTP ngoài để sử dụng Sheets API.
4. Thuộc tính tập lệnh: `SPREADSHEET_ID=1_m3YR8j_MobxiKh7UXFdjEsIM9pEuuP3ijrZCvP-rvE`, `BRIDGE_SECRET=<khóa ngẫu nhiên ít nhất 32 byte, giống Vercel>`.
5. Tài khoản triển khai phải có quyền chỉnh sửa Google Sheet. Chạy hàm `setup` một lần và tự xác nhận màn hình quyền Google. Hàm chỉ tạo các tab hệ thống thiếu, không xóa tab nguồn và không tạo lại mã đã có.
6. Triển khai → Lần triển khai mới → Ứng dụng web → thực thi dưới tài khoản của bạn; quyền truy cập **Bất kỳ ai**. Endpoint chỉ nhận POST có chữ ký HMAC hợp lệ; GET không trả dữ liệu. Lưu URL kết thúc bằng `/exec` vào `GOOGLE_APPS_SCRIPT_URL`.
7. Đăng nhập quản trị trên web, kiểm tra nguồn và cảnh báo, xác nhận rồi bấm **Chốt danh sách & mở bình chọn**. Chưa chốt thì người dùng chưa thể bỏ phiếu.

Nếu Google hiển thị cảnh báo ứng dụng chưa xác minh hoặc cần chấp thuận quyền, chủ tài khoản cần tự xem xét và thực hiện. Không chia sẻ khóa ký, token hoặc URL có bí mật.

## Secret và Vercel

Chạy `npm run secrets` trên máy tin cậy. Nhập mã quản trị và mã xác nhận sửa theo yêu cầu nghiệp vụ riêng; lệnh tạo scrypt hash và hai secret ngẫu nhiên. Không commit output hoặc .env.local. Các mã nghiệp vụ thật không nằm trong mã nguồn công khai.

Vercel → Add New Project → Import `anhvh6/Binhxet2026`, framework Next.js. Thêm ở Environment Variables:

- `GOOGLE_APPS_SCRIPT_URL`
- `BRIDGE_SECRET`
- `SESSION_SECRET`
- `ADMIN_RESULT_CODE_HASH`
- `BALLOT_EDIT_CODE_HASH`
- `APP_TIMEZONE=Asia/Ho_Chi_Minh`

Cấu hình Production và Preview riêng; Preview nên dùng bản sao file Sheet và Apps Script riêng để không ghi dữ liệu thử vào kỳ thật. Deploy Production sau khi lưu các biến; khi thay biến, redeploy. Không cần cron vì batch nộp phiếu ghi trực tiếp tất cả kết quả; nút “Cập nhật bảng kết quả” tái tạo các bảng từ phiếu hiệu lực.

CLI nếu đã đăng nhập:

```powershell
vercel link
vercel env add GOOGLE_APPS_SCRIPT_URL production
# Thêm các biến còn lại qua stdin/console, không đặt secret trong command line
vercel --prod
```

Không thêm dữ liệu nhân sự, mã cá nhân hoặc bản sao Sheet vào GitHub. Chỉ mã nguồn và fixture kiểm thử tổng hợp được commit.

## Cấp mã và sử dụng

40 mã thật đã được tạo trong tab **MA BINH CHON**, cột E; cột B là MNV, cột C họ tên, cột D team. Mã là văn bản đúng bốn chữ số, sinh bằng `crypto.randomInt`, duy nhất trong kỳ. Người quản trị gửi riêng từng mã cho đúng nhân viên. Không gửi cả danh sách mã cho tập thể. Không tạo lại hoặc thay mã trong kỳ đang có phiếu nếu chưa có quy trình thu hồi/đối chiếu.

Người tham gia truy cập **web Vercel**, không mở file Sheet. Nhập mã → Bình chọn → chọn đủ chỉ tiêu từng team → Tiếp tục → kiểm tra danh sách → Nộp phiếu. Mỗi mã chỉ có một phiếu hiệu lực. Mã đã nộp được chuyển tới trang xem lại.

Xem lại KQ: nhập mã trên trang chủ. Sửa: nhập mã xác nhận sửa, thay lựa chọn rồi nộp lại; phiếu cũ tiếp tục hiệu lực nếu hủy. Xem phiếu khác: đăng xuất và xác thực lại mã mới. Nút về trang chủ không tự xóa phiếu.

## Quản trị

Tổng hợp kết quả có trường đăng nhập riêng, không giới hạn 4 số. Quản trị viên xem dashboard, xếp hạng toàn trung tâm, tìm MNV/tên, lọc team, xem tổng lượt theo team, cập nhật trạng thái CSTĐ riêng và xuất bốn sheet Excel. Xuất chi tiết chứa mã người chọn nên chỉ dùng trong báo cáo quản trị và có nhật ký.

Tab CSTĐ mặc định hiển thị đầy đủ với trạng thái; chọn bộ lọc **Đủ chuẩn sơ bộ theo nguồn** để xem BA xác nhận CSTĐ. Không xem KI A như quyết định CSTĐ. Đóng kỳ chặn nộp mới và sửa phiếu. Snapshot không thay đổi khi dữ liệu nguồn đổi.

Trong MA BINH CHON có thể khóa/thu hồi mã bằng trạng thái; API quản trị `/api/admin/credentials/state` hỗ trợ `Bị khóa`, `Đã thu hồi`, `Chưa sử dụng` và ghi audit. Không sửa mã đã có phiếu để tạo phiếu thứ hai. Không công khai Sheet: ai có quyền xem Sheet đều có thể xem mã plaintext và kết quả.

## Kiểm thử

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration chạy chính Code.gs trong VM với Google Sheets API giả lập nguyên tử: mapping, quota, rate limit, phân quyền, idempotency, revision, lỗi ghi và Excel. Fixture tổng hợp chỉ dùng cho test; không được dùng làm danh sách sản xuất. Kiểm tra dữ liệu nguồn thật cục bộ dùng file .private/source.json (bị gitignore); CI bỏ qua ca này khi không có file.

E2E kiểm tra giao diện 360, 375, 390, 430, 768, 1024, 1440px, số 0 đầu và chặn API quản trị chưa đăng nhập. Kiểm thử VM/giả lập không thay thế kiểm thử live Apps Script: trước khi mở kỳ thật cần thử trên **bản sao** Sheet với ít nhất hai request đồng thời và mất mạng sau gửi. Không tạo phiếu thử trong file thật.

## Tài liệu

- [Data mapping](docs/DATA_MAPPING.md)
- [Kiến trúc, mô hình dữ liệu và giới hạn](docs/ARCHITECTURE.md)
- [Kết quả kiểm tra](docs/TEST_REPORT.md)

Sao lưu file Sheet định kỳ bằng chức năng Make a copy, bảo vệ quyền chỉnh sửa các tab hệ thống, dùng lịch sử phiên bản để phục hồi khi có sửa tay. Sau phục hồi, kiểm tra phiếu, revision và request keys trước khi mở tiếp; không tự xóa các phiếu đã nộp.
