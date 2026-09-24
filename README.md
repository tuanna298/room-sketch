# Floor Plan Viewer

Tái hiện lại bản vẽ mặt bằng khu phụ (WC) từ bản phác thảo gốc bằng React + Vite, kèm nền kẻ ô (100mm/500mm) để tiện theo dõi tỉ lệ.

## Chạy thử

```bash
npm install
npm run dev
```

## Kéo thả & lưu bố cục

Cửa và thiết bị (bồn cầu, tủ, thiết bị dạng hộp) kéo thả được ngay trên bản vẽ.
Sau khi sắp xếp xong, bấm **Lưu thay đổi** để ghi đè vị trí mới vào `src/layout.json`.
Nút này gọi endpoint `/api/save-layout` do một plugin của Vite cung cấp
(xem `vite.config.js`) — chỉ hoạt động khi chạy `npm run dev`, không có tác dụng
trên bản build tĩnh (`npm run build`). **Khôi phục mặc định** chỉ đổi lại trên
màn hình, cần bấm **Lưu thay đổi** thêm lần nữa nếu muốn ghi xuống file.

## Cấu trúc

- `src/FloorPlan.jsx` — component vẽ mặt bằng bằng SVG (tường, đường kích thước cố định; cửa/thiết bị đọc vị trí từ `layout.json` và kéo thả được), toạ độ tính bằng milimét.
- `src/layout.json` — vị trí hiện tại của cửa và thiết bị; bị ghi đè mỗi khi bấm Lưu thay đổi.
- `src/App.jsx` — trang đơn hiển thị bản vẽ kèm chú giải.
- `vite.config.js` — plugin dev-server nhận vị trí kéo thả và ghi vào `src/layout.json`.
