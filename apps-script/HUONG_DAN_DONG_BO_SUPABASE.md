# HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG ĐỒNG BỘ 2 CHIỀU SUPABASE TRÊN GOOGLE SHEETS

Google Sheet: `https://docs.google.com/spreadsheets/d/1_m3YR8j_MobxiKh7UXFdjEsIM9pEuuP3ijrZCvP-rvE/edit`

---

## 1. CÁCH CẬP NHẬT MÃ APPS SCRIPT TRÊN GOOGLE SHEETS
1. Mở file Google Sheet của bạn trên trình duyệt.
2. Trên thanh công cụ, chọn **Tiện ích mở rộng** (Extensions) ➔ **Apps Script**.
3. Trong tệp **Mã.gs** (hoặc `Code.gs`):
   - Nhấn `Ctrl + A` để chọn toàn bộ mã cũ và xóa đi.
   - Sao chép toàn bộ nội dung từ file `apps-script/Code.gs` và dán vào.
4. Nhấn biểu tượng **Lưu** (Save / Ctrl + S).
5. Tải lại (F5) tab Google Sheet.

Sau khi F5, trên thanh Menu của Google Sheet sẽ xuất hiện menu mới:
👉 **⚡ VCX - Đồng bộ Supabase**

---

## 2. CÁC TÍNH NĂNG TRÊN MENU GOOGLE SHEETS

### 📥 1. Cập nhật TOÀN BỘ từ Supabase về Sheet
- Tự động lấy kết quả bình chọn mới nhất từ Supabase (siêu tốc qua PostgREST Views).
- Tự động điền và định dạng đẹp mắt 6 tab:
  1. **`KET QUA LDTT`**: Xếp hạng từ cao xuống thấp theo số phiếu bình chọn LĐTT (STT, MNV, Họ tên, Team, Số phiếu, Tỷ lệ %, Điểm TB 3 quý, Xếp loại KI, Sáng kiến, Khen thưởng).
  2. **`TONG HOP TEAM` / `KET QUA TEAM`**: Tổng hợp số người được chọn theo từng team và tổng cộng toàn đơn vị.
  3. **`Bình chọn CSTĐ 2026`**: Lọc các nhân sự đủ điều kiện CSTĐ và số phiếu.
  4. **`PHIEU BINH CHON`**: Danh sách chi tiết các phiếu bầu đã nộp (mã bí mật, ngày nộp, danh sách MNV đã chọn).
  5. **`MA BINH CHON`**: Trạng thái 40 mã bí mật (Chưa sử dụng / Đã nộp phiếu / Được phép sửa) - **hoàn toàn ẩn danh, không có tên nhân viên**.
  6. **`XUAT CHI TIET`**: Bảng chi tiết liệt kê cụ thể các mã bí mật nào đã bầu cho từng nhân viên (ví dụ: `1024, 1408, 2048...`).

### 📥 2. Cập nhật Sheet HIỆN TẠI từ Supabase
- Tự động nhận diện tab đang mở và chỉ làm mới tab đó (ví dụ đang xem tab `KET QUA LDTT` thì chỉ tải dữ liệu LĐTT).

### 📤 3. Đẩy TOÀN BỘ nhân sự nguồn lên Supabase
- Đọc danh sách 40 nhân sự đủ điều kiện từ tab `PTUD (2)` & `Binh xet`, cấu hình 7 nhóm từ `TONG HOP TEAM` và 40 mã bí mật từ `MA BINH CHON`.
- Đẩy trực tiếp (upsert) lên cơ sở dữ liệu Supabase để đồng bộ danh sách nhân sự mới nhất.

### 📤 4. Đẩy Sheet HIỆN TẠI lên Supabase
- Chỉ đẩy dữ liệu của tab hiện tại đang thao tác (ví dụ vừa chỉnh sửa thông tin trong `PTUD (2)` hoặc `TONG HOP TEAM`).

### 📊 5. Xuất bảng CHI TIẾT mã đã chọn cho từng người
- Tạo ngay tab `XUAT CHI TIET` hiển thị rõ ràng từng nhân viên được những mã bình chọn nào tích chọn.

### 🔍 6. Kiểm tra kết nối Supabase
- Kiểm tra trạng thái máy chủ Supabase, đo độ trễ (latency ms), báo cáo số lượng ứng viên và số phiếu đã nộp thực tế.

### ⚙️ 7. Cấu hình Supabase (URL & API Key)
- Mở popup cho phép bạn kiểm tra hoặc thay đổi `SUPABASE_URL` và `SUPABASE_KEY` trực tiếp ngay trên Google Sheet mà không cần đụng vào code.
