# Floor Plan Viewer

Tái hiện lại bản vẽ mặt bằng khu phụ (WC) từ bản phác thảo gốc bằng React + Vite, kèm nền kẻ ô (100mm/500mm) để tiện theo dõi tỉ lệ.

## Chạy thử

```bash
npm install
npm run dev
```

## Toolbar nội thất

Toolbar bên trái liệt kê các loại nội thất (Giường, Bàn, Ghế, Cửa, Tủ, Sofa, Kệ
tivi, Bồn rửa, Bồn cầu...). Mỗi loại chỉ là một khối hình học chữ nhật (kèm vài
chi tiết trang trí vẽ theo tỉ lệ) với kích thước khởi tạo — không có kích thước
nào bị đóng cứng. Bấm một loại để thêm vào giữa bản vẽ, sau đó:

- **Kéo phần thân** để di chuyển.
- **Kéo 4 tay cầm ở góc** (ô vuông xanh khi đang chọn) để đổi kích cỡ tự do.
- Hoặc chỉnh số liệu chính xác ở **bảng thuộc tính** bên phải (X, Y, Rộng, Cao),
  xoay 90° hoặc xoá.

Sau khi sắp xếp xong, bấm **Lưu thay đổi** để ghi đè danh sách nội thất vào
`src/layout.json`. Nút này gọi endpoint `/api/save-layout` do một plugin của
Vite cung cấp (xem `vite.config.js`) — chỉ hoạt động khi chạy `npm run dev`,
không có tác dụng trên bản build tĩnh (`npm run build`). **Khôi phục đã lưu**
chỉ đổi lại trên màn hình về đúng nội dung `layout.json` hiện có; cần bấm
**Lưu thay đổi** thêm lần nữa nếu muốn ghi đè xuống file sau khi chỉnh tiếp.

## Cấu trúc

- `src/FloorPlan.jsx` — mặt bằng SVG (tường, đường kích thước cố định), toolbar
  thêm nội thất, tương tác kéo/resize/chọn, và bảng thuộc tính.
- `src/furniture.jsx` — danh mục loại nội thất (`FURNITURE_TYPES`) và hàm vẽ
  hình dạng theo toạ độ cục bộ (0,0) → (width,height) cho từng loại.
- `src/layout.json` — danh sách nội thất hiện tại (`{ items: [...] }`); bị ghi
  đè mỗi khi bấm Lưu thay đổi.
- `src/App.jsx` — trang đơn hiển thị bản vẽ kèm chú giải.
- `vite.config.js` — plugin dev-server nhận danh sách nội thất và ghi vào
  `src/layout.json`.
