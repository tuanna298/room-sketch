# Floor Plan Viewer

Trình vẽ mặt bằng bằng React + Vite: không có căn phòng nào đóng cứng sẵn — bắt
đầu từ trắng, tự dựng ranh giới phòng (và cột, hộp gen...) bằng đối tượng
"container", rồi thêm nội thất. Nền kẻ ô (100mm/500mm) và khung nhìn tự co theo
nội dung để lúc nào cũng dễ theo dõi tỉ lệ.

## Chạy thử

```bash
npm install
npm run dev
```

## Container: dựng ranh giới phòng / cột

Mục "Cấu trúc cố định" trong toolbar có 2 khối khởi tạo (Phòng/Tường, Cột) —
về bản chất chỉ là MỘT loại đối tượng hình chữ nhật dùng để đánh dấu vật cố
định trong không gian: kéo lớn ra thì thành ranh giới phòng, thu nhỏ lại thì
thành cột hay hộp kỹ thuật. Không có gì bắt buộc phải "là căn phòng" — tuỳ
người dùng đặt tên hình học ấy dùng để làm gì.

## Toolbar nội thất

Mục "Nội thất" liệt kê Giường, Bàn, Ghế, Cửa, Tủ, Sofa, Kệ tivi, Bồn rửa, Bồn
cầu... Mỗi loại chỉ là một khối hình học chữ nhật (kèm vài chi tiết trang trí
vẽ theo tỉ lệ) với kích thước khởi tạo — không có kích thước nào bị đóng cứng.
Bấm một loại để thêm vào giữa khung nhìn hiện tại, sau đó:

- **Kéo phần thân** để di chuyển — khi cạnh hoặc tâm của vật thể đến gần cạnh
  hay tâm một vật khác (container hoặc nội thất khác) trong khoảng 60mm, nó sẽ
  "khoá nhẹ" và hút thẳng hàng, kèm một đường gióng màu hồng để biết vừa khoá
  vào đâu.
- **Kéo 4 tay cầm ở góc** (ô vuông xanh khi đang chọn) để đổi kích cỡ tự do.
- Hoặc chỉnh số liệu chính xác ở **bảng thuộc tính** bên phải (X, Y, Rộng, Cao),
  xoay 90° hoặc xoá.

## Đường kích thước tự động

Không còn đường kích thước vẽ sẵn nào. Với mỗi món nội thất, nếu nó nằm gần
cạnh một container (khoảng cách ≤ 300mm) và còn chồng chiều còn lại lên
container đó, một đường kích thước xanh sẽ tự hiện ra giữa hai cạnh, ghi rõ
khoảng cách (mm) — biến mất ngay khi kéo món đồ ra xa hơn ngưỡng đó.

## Lưu trữ

Mọi thay đổi (thêm/xoá/kéo/resize/xoay) **tự lưu vào localStorage của trình
duyệt** ngay sau khi xảy ra — không cần bấm nút nào. Lần mở lại trang sau sẽ
tự khôi phục đúng bố cục đó; nếu trình duyệt chưa từng lưu gì, trang bắt đầu
trắng hoàn toàn.

Ba nút ở thanh trên chỉ thao tác với **file** (để backup/chia sẻ), tách biệt
với autosave ở trên:

- **Lưu ra file** — xuất bản chụp hiện tại vào `src/layout.json`, qua endpoint
  `/api/save-layout` do một plugin của Vite cung cấp (xem `vite.config.js`) —
  chỉ hoạt động khi chạy `npm run dev`, không có tác dụng trên bản build tĩnh.
- **Tải từ file** — nạp lại đúng nội dung đang có trong `src/layout.json`,
  ghi đè bản vẽ hiện tại (kể cả localStorage).
- **Xoá hết** — xoá toàn bộ bản vẽ hiện tại (có xác nhận trước khi xoá).

## Cấu trúc

- `src/FloorPlan.jsx` — canvas SVG (khung nhìn tự co theo nội dung), toolbar
  thêm container/nội thất, tương tác kéo/resize/chọn kèm khoá nhẹ, đường kích
  thước tự động, và bảng thuộc tính. Tự lưu `items` vào localStorage.
- `src/furniture.jsx` — danh mục loại container (`CONTAINER_TYPES`) và nội
  thất (`FURNITURE_TYPES`), cùng hàm vẽ hình dạng theo toạ độ cục bộ
  (0,0) → (width,height) cho từng loại.
- `src/layout.json` — bản chụp cho hai nút Lưu ra file / Tải từ file; không
  còn là nguồn dữ liệu chính khi chạy bình thường (đó là localStorage).
- `src/App.jsx` — trang đơn hiển thị bản vẽ kèm chú giải.
- `vite.config.js` — plugin dev-server nhận danh sách đối tượng và ghi vào
  `src/layout.json`.
