# Floor Plan Viewer

Tái hiện lại bản vẽ mặt bằng khu phụ (WC) từ bản phác thảo gốc bằng React + Vite, kèm nền kẻ ô (100mm/500mm) để tiện theo dõi tỉ lệ.

## Chạy thử

```bash
npm install
npm run dev
```

## Cấu trúc

- `src/FloorPlan.jsx` — component vẽ mặt bằng bằng SVG (tường, cửa, thiết bị, đường kích thước), toạ độ tính bằng milimét.
- `src/App.jsx` — trang đơn hiển thị bản vẽ kèm chú giải.
