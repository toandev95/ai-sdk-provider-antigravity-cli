# Google Antigravity: phạm vi sử dụng và tích hợp OpenCode

Đối chiếu ngày 24/10/2026, múi giờ Asia/Bangkok. Chỉ dùng nguồn chính thức; đây là ghi nhận kỹ thuật về chính sách, không phải bảo đảm pháp lý hoặc bảo đảm tài khoản không bị đình chỉ.

## Kết luận từ chính sách

**Không nên dùng đăng nhập Antigravity consumer làm backend cho OpenCode, kể cả qua executable `agy` chính thức.** FAQ Google gọi tên OpenCode trong nhóm phần mềm bên thứ ba không được dùng với đăng nhập Antigravity; đồng thời phân biệt scripting/CI trực tiếp với việc bọc `agy` bên trong coding agent hoặc ứng dụng bên thứ ba. Trường hợp thứ hai không được hỗ trợ trên consumer plans. FAQ khuyến nghị Gemini Enterprise hoặc Google AI Studio API key cho coding agent bên thứ ba. [FAQ chính thức](https://www.antigravity.google/docs/faq/).

Điều 6 của Additional Terms cấm truy cập dịch vụ bằng phần mềm/công cụ/dịch vụ bên thứ ba và nêu khả năng đình chỉ hoặc chấm dứt tài khoản Antigravity và/hoặc Gemini CLI. Đây là hạn chế về cách sử dụng, không chỉ về hình dạng request. [Điều khoản Antigravity, mục 6](https://www.antigravity.google/terms).

## Headless được tài liệu hóa, nhưng không cấp quyền dùng consumer login trong OpenCode

Google có tài liệu chính thức cho `agy -p`, `--input-format stream-json`, lập trình qua stdin/stdout và CI. Headless sử dụng credentials đã lưu nếu chạy theo cơ chế đăng nhập tài khoản. Khả năng kỹ thuật này không xóa giới hạn mà FAQ nêu cho coding agent bên thứ ba. [Headless mode](https://www.antigravity.google/docs/cli/headless/).

**Suy luận triển khai:** payload giống `agy`, đổi User-Agent hoặc bỏ tên ứng dụng không tạo ngoại lệ chính sách. Không triển khai giả mạo client, trích xuất/replay OAuth token, đổi tài khoản để né quota, hoặc che giấu nguồn truy cập. Không thể suy ra tài khoản đã vi phạm hay sẽ bị khóa chỉ từ việc một smoke test trả thành công.

## Các hướng được Google tài liệu hóa

| Hướng                             | Credentials                           | Phạm vi                                                                                                       |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OpenCode gọi Gemini API trực tiếp | Google AI Studio/Gemini API key       | Hướng phù hợp khuyến nghị trong FAQ cho coding agent bên thứ ba; áp dụng điều khoản Gemini API.               |
| Google Cloud/Gemini Enterprise    | API key/ADC và project được cấp quyền | Phải kiểm tra hợp đồng/quyền của tổ chức; không tự suy ra consumer subscription chuyển sang quyền enterprise. |
| `agy` cho scripting/CI trực tiếp  | Cơ chế xác thực được CLI hỗ trợ       | Được tài liệu hóa; không dùng điều đó để khẳng định consumer wrapper trong OpenCode được phép.                |

Phần mở đầu điều khoản Antigravity có ngoại lệ cho các phương thức enterprise được liệt kê, áp dụng điều khoản do quản trị viên chấp nhận. Ngoại lệ này không có nghĩa mọi tài khoản doanh nghiệp hoặc mọi wrapper đều được cho phép. [Điều khoản Antigravity](https://www.antigravity.google/terms).

CLI có chế độ Gemini API key: phải đặt **cả** `modelProvider: "gemini"` trong `~/.gemini/antigravity-cli/settings.json` và biến môi trường `GEMINI_API_KEY`. Chỉ đặt biến môi trường không có tác dụng. Tài liệu nói chế độ này gửi request tới Gemini API và không thiết lập account session. Vì settings được dùng chung, không tự đổi cấu hình xác thực hiện có của người dùng. [Authenticate](https://www.antigravity.google/docs/install/#using-a-gemini-api-key).

## Model và API thay thế

Gemini API công khai model ID `gemini-3.8-flash` và `gemini-4-argon`; đây là base ID API, khác slug biến thể CLI như `gemini-3.8-flash-medium`. [Danh mục Gemini API](https://ai.google.dev/gemini-api/docs/models).

Google còn cung cấp Antigravity managed agent qua Interactions API với `antigravity-preview-09-2026`, cho phép chọn model nền. Agent chạy trong sandbox Linux do Google lưu trữ; không nên coi đây là cùng môi trường file/tool của OpenCode local. [Antigravity agent API](https://ai.google.dev/gemini-api/docs/antigravity-agent).

Gemini API có điều khoản riêng và yêu cầu tuân thủ vùng khả dụng, hạn chế sử dụng, chính sách cấm và cơ chế safety. Với unpaid services, tài liệu cảnh báo không gửi thông tin nhạy cảm/bí mật/cá nhân; không mặc định quota consumer áp dụng cho API. [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms).

Tài liệu Google Cloud cũng liệt kê `gemini-4-argon` trong Gemini Enterprise Agent Platform. Quyền dùng, billing và vùng triển khai cần xác nhận theo project. [Model trên Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon).

## Quyết định cho repo

Giữ adapter CLI ở đúng giao thức headless chính thức, không giả mạo hoặc tự tái tạo request nội bộ của Google. Khi dùng OpenCode, ưu tiên native Google provider với API key hoặc endpoint enterprise được phép; giữ model/provider cấu hình được và không tự chuyển sang consumer OAuth khi thiếu key. Không gọi thật bằng consumer login để kiểm chứng khả năng né hạn chế. Cần xác nhận lại điều khoản khi phát hành hoặc khi Google thay đổi dịch vụ.
