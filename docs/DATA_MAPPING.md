# Dữ liệu thực tế – kiểm tra ngày 22/11/2026

Đã đọc metadata và trực tiếp các vùng PTUD (2)!A1:BG80, Binh xet!A1:BG80, TONG HOP TEAM!A1:H15 và KHONG DU DIEU KIEN!A1:L30 bằng Google Sheets connector. ID nguồn: `1_m3YR8j_MobxiKh7UXFdjEsIM9pEuuP3ijrZCvP-rvE`. Không lưu dữ liệu nhân sự thật vào GitHub.

| Trường | PTUD (2) | Binh xet | Quy tắc |
|---|---|---|---|
| MNV | B | B | Chuỗi, giữ số 0 đầu; khóa ghép nguồn |
| Họ tên | C | C | Bỏ hậu tố (Lead) khi lưu, hiển thị badge |
| Team | AM | AM (header trống) | Đối chiếu MNV với PTUD |
| Lead | AN | AN (header trống) | Giá trị Lead hoặc hậu tố (Lead) |
| Điểm TB | AR | AR | Nguồn Binh xet có ba số lẻ; PTUD hiển thị hai số lẻ |
| KI dự kiến | AS | AS | Không suy diễn CSTĐ từ KI |
| Công tác >=6 tháng | AT | AT | Dữ liệu chính thức hiện dùng Đạt (>=6 tháng) |
| HTNV và kỷ luật | AU | AU | Hiển thị/đối chiếu, không tự đặt quy tắc mới |
| Sáng kiến | AV | AV | Giữ văn bản |
| Phiếu CSTĐ nguồn | AW | AW | Nghiệp vụ riêng LĐTT |
| Điều kiện khác | AX | AX | Đối chiếu, chờ xác minh nếu nguồn chưa kết luận |
| Đánh giá danh hiệu | BA | BA | Đủ chuẩn LĐTT / Đủ chuẩn CSTĐ / Không xét |
| Khen thưởng ĐV + TĐ | BD | **BE** | Binh xet đã dịch cột; BD có thể giữ bản sao, dùng BE chính thức |
| Checkbox LĐTT | BE | **BF** | Không ghi lượt người dùng vào ô nguồn |
| Checkbox CSTĐ | BF | **BG** | Không dùng phiếu LĐTT thay CSTĐ |

Hàng 6 là header nghiệp vụ. Một dòng được coi là nhân viên khi cột B là chuỗi chữ số và C có tên; các dòng I–VII là nhóm, không là nhân viên.

PTUD (2) có 44 MNV duy nhất, trong đó 4 người không đạt AT. Tập 40 người đạt AT và có BA chứa “Đủ chuẩn” khớp hoàn toàn 40 MNV tại Binh xet. Không phát hiện MNV trùng trong hai nguồn ở lần đọc này.

| Team | Quân số | FLOOR(quân số/2) |
|---|---:|---:|
| IPCC | 13 | 6 |
| Lite ERP+Số hóa | 6 | 3 |
| AI | 7 | 3 |
| QA | 2 | 1 |
| vCOC | 3 | 1 |
| KnowXHub | 4 | 2 |
| SP nội bộ | 5 | 2 |
| Tổng | 40 | 18 |

Các số trên là kết quả đối chiếu, **không phải hằng số trong logic**. Chỉ tiêu được đọc từ nguồn và kiểm tra lại với FLOOR. Sáu team có đúng một Lead; QA không có Lead được xác định, cần người quản trị xác nhận cảnh báo. Lead không bị loại khỏi ứng viên.

PTUD (2) có 31 ô lỗi #ERROR!/#N/A trong các cột tháng (AA và K). Những lỗi này nằm ngoài các trường nghiệp vụ được dùng; cảnh báo được giữ khi chốt. Không sửa công thức nguồn. Điểm AR được đọc theo giá trị hiển thị từ Binh xet, không tự tính lại từ các ô tháng lỗi.

Metadata nguồn đang đặt múi giờ America/Los_Angeles. Ứng dụng và Apps Script dùng Asia/Ho_Chi_Minh, ghi ISO UTC cho nhật ký; không tự thay đổi múi giờ file nguồn.

Các trường chưa có căn cứ: Lead QA; tiêu chí/chỉ tiêu cho vòng phiếu CSTĐ độc lập. Phiên bản này quản lý trạng thái CSTĐ thủ công có audit, không mở vòng CSTĐ riêng.
