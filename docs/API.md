# API và phân quyền

Mọi API ghi chỉ nhận cùng origin. Cookie `vcx_session` HttpOnly, SameSite Strict và Secure trên production. Backend Google không được gọi trực tiếp từ frontend.

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| GET | /api/challenge | Công khai, proof-of-work trước đăng nhập |
| GET | /api/voting/progress | Công khai, chỉ tổng số và trạng thái kỳ |
| GET | /api/election | Công khai, cùng dữ liệu tiến độ không có danh sách nhân sự |
| POST | /api/auth/voter | Mã bốn số, proof và counter; cấp cookie phiên |
| POST | /api/auth/logout | Xóa phiên |
| GET | /api/ballot/me | Người bình chọn; phiếu thuộc cookie hiện tại |
| GET | /api/candidates hoặc /api/teams | Người bình chọn; snapshot cùng phiên |
| POST | /api/ballot/validate | Người bình chọn; choices, revision, idempotencyKey |
| POST | /api/ballot/submit | Người bình chọn; cùng payload, idempotent |
| PUT | /api/ballot | Nộp thay revision, phải mở sửa trước |
| POST | /api/ballot/unlock-edit | Mã xác nhận sửa + cookie cá nhân |
| POST | /api/admin/login | Mã quản trị riêng, proof và counter |
| POST | /api/admin/logout | Xóa phiên |
| GET | /api/admin/dashboard | Chỉ admin |
| GET | /api/admin/results/ldtt, /teams, /cstd | Chỉ admin; cùng snapshot kết quả |
| GET | /api/admin/source | Chỉ admin; đối chiếu nguồn và cảnh báo |
| POST | /api/admin/election/freeze | Chỉ admin; acknowledgeWarnings trước mở kỳ |
| POST | /api/admin/election/close | Chỉ admin; không xóa dữ liệu |
| POST | /api/admin/cstd | Chỉ admin; candidateId, status, ghi audit |
| GET | /api/admin/export | Chỉ admin; file Excel có chi tiết mã người chọn |
| POST | /api/admin/sync | Chỉ admin; tái tạo bảng kết quả từ phiếu hiện hành |
| GET | /api/admin/credentials/status | Chỉ admin; trạng thái, không trả mã bí mật |
| POST | /api/admin/credentials/state | Chỉ admin; voterId, status |

Các endpoint cấp lại mã và restore tự động chưa cung cấp trong kỳ này để tránh vô hiệu hóa mã hoặc phiếu đang hoạt động. 40 mã ban đầu đã được cấp trực tiếp vào Sheet theo yêu cầu mới. Không có polling queue hay database sync riêng vì Sheets là kho chính.

Backend Apps Script chỉ nhận POST có `payload` (JSON string) và `signature` (HMAC-SHA256). Payload bao gồm action, data, timestamp, nonce; token phiên chỉ truyền ở dạng SHA-256 hash. Không đặt URL backend hoặc secret vào biến NEXT_PUBLIC.
