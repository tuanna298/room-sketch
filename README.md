# RoomSketch

Trình vẽ mặt bằng bằng React + Vite, giao diện toàn màn hình kiểu Figma (canvas
trải kín, các bảng nổi phía trên). Không có căn phòng nào đóng cứng sẵn — bắt
đầu từ trắng, tự dựng ranh giới phòng (và cột, hộp gen...) bằng đối tượng
"container", rồi thêm nội thất. Nền kẻ ô ánh xạ theo kích thước gạch lát thật,
khung nhìn tự co theo nội dung để lúc nào cũng dễ theo dõi tỉ lệ.

## Chạy thử

```bash
npm install
npm run dev
```

## Container: dựng ranh giới phòng / cột

Mục "Cấu trúc" trong toolbar có 2 khối khởi tạo (Phòng/Tường, Cột) —
về bản chất chỉ là MỘT loại đối tượng hình chữ nhật dùng để đánh dấu vật cố
định trong không gian: kéo lớn ra thì thành ranh giới phòng, thu nhỏ lại thì
thành cột hay hộp kỹ thuật. Không có gì bắt buộc phải "là căn phòng" — tuỳ
người dùng đặt tên hình học ấy dùng để làm gì. Viền vẽ mỏng cố định (20mm),
không phình theo kích thước như nội thất.

Vì "Phòng/Tường" chỉ có viền mà không đặc ruột, việc chọn/kéo và marquee-select
chỉ tính là trúng khi chạm dải viền — kéo khung chọn ngay trong lòng phòng để
chọn đồ đạc bên trong sẽ không vô tình "nuốt" luôn cả bức tường.

## Toolbar nội thất

Mục "Nội thất" liệt kê Giường, Bàn, Ghế, Cửa, Tủ, Sofa, Kệ tivi, Bồn rửa, Bồn
cầu, Chậu cây, Hộc tủ, Kệ sách, Gương, Đo kích thước... Mỗi loại chỉ là một
khối hình học chữ nhật (kèm vài chi tiết trang trí vẽ theo tỉ lệ) với kích
thước khởi tạo — không có kích thước nào bị đóng cứng. Bấm một loại để thêm
vào giữa khung nhìn hiện tại, sau đó:

- **Kéo phần thân** để di chuyển — khi cạnh hoặc tâm của vật thể đến gần cạnh
  hay tâm một vật khác (container hoặc nội thất khác) trong khoảng 60mm, nó sẽ
  "khoá nhẹ" và hút thẳng hàng, kèm một đường gióng màu hồng để biết vừa khoá
  vào đâu. Khi không khoá, vị trí làm tròn theo đúng ô lưới hiện tại.
- **Kéo 4 tay cầm ở góc** (ô vuông xanh khi đang chọn) để đổi kích cỡ tự do.
- Hoặc chỉnh số liệu chính xác ở **bảng thuộc tính** bên phải (X, Y, Rộng,
  Cao) — gõ tự do (chọn hết, xoá, gõ số mới) rồi Tab/Enter/click ra ngoài để
  áp dụng, không còn bị ép về giá trị tối thiểu ngay trên từng phím gõ.
- **Chuột phải vào một vật thể** để mở menu "Đưa lên trên cùng" / "Đưa xuống
  dưới cùng" (2 nút này cũng có sẵn trong bảng thuộc tính) — chỉnh thứ tự
  chồng lớp khi 2 vật thể đè lên nhau. Menu chuột phải mặc định của trình
  duyệt đã bị tắt trên toàn bộ canvas.

## Nhóm nhiều vật thể

- **Shift + click** để thêm/bớt một vật vào lựa chọn hiện tại; **kéo khung
  chọn** (marquee) trên nền trống để chọn nhiều vật cùng lúc.
- Bấm **Nhóm lại** để gộp các vật đang chọn thành một nhóm — từ đó chỉ cần
  click vào một món trong nhóm là chọn (và kéo) được cả cụm cùng lúc. **Rã
  nhóm** để tách ra lại.
- Với từ 2 vật trở lên đang chọn (nhóm hay không), 4 tay cầm ở góc co-giãn tỉ
  lệ TOÀN BỘ lựa chọn cùng lúc, giữ đúng vị trí tương đối giữa các món.

## Đo kích thước

Không có đường kích thước nào tự vẽ sẵn. Cần ghi chú khoảng cách ở đâu thì tự
thêm item **"Đo kích thước"** trong toolbar Nội thất — một đường mũi tên 2
đầu màu xanh lá, ở giữa là text số đo (mm), text này **tự tính theo chiều dài
hiện tại của đường** (chính là "Rộng" trong bảng thuộc tính), không cần gõ
tay. Kéo-thả, resize, xoay, xoá như mọi món nội thất khác — kéo 2 tay cầm ở
hai đầu (góc trái/phải) để chỉnh đúng độ dài cần đo.

## Ô lưới nền

Ô lưới mặc định 100×100mm, ô đậm mỗi 4 ô nhỏ.
Chỉnh lại kích cỡ ô ở khung "Ô lưới" trên thanh công cụ — áp dụng ngay cho cả
hiển thị lẫn mức làm tròn khi kéo vật thể tự do (không khoá theo vật khác).

## Di chuyển & zoom bằng chuột/trackpad (kiểu Figma)

- **Cuộn** (lăn chuột, hoặc vuốt hai ngón trên trackpad) — pan toàn canvas.
- **Ctrl/Cmd + cuộn**, hoặc **pinch hai ngón** trên trackpad — zoom quanh đúng
  vị trí con trỏ.
- **Giữ phím Space rồi kéo**, hoặc **kéo bằng nút chuột giữa** — pan bằng tay
  (con trỏ đổi thành bàn tay), hoạt động xuyên qua mọi vật thể mà không làm
  chúng bị chọn hay di chuyển.
- Kéo-thả bình thường (không giữ gì) trên nền trống vẫn là **marquee-select**
  như trước — không xung đột với việc pan.

Khung nhìn không còn tự "nhảy" theo mỗi lần thêm/kéo/resize nữa — chỉ tự co
theo toàn bộ nội dung khi tải trang hoặc Undo/Redo, để không phá vị trí
pan/zoom người dùng vừa tự chỉnh.

## Thanh công cụ (giữa, dưới cùng)

Ba công cụ chọn bằng chuột hoặc phím tắt một chữ cái (không cần Cmd/Ctrl):

- **V — Di chuyển**: mặc định. Chọn, kéo, resize, marquee-select như mô tả ở
  trên.
- **H — Bàn tay**: mọi thao tác kéo đều thành pan, xuyên qua mọi vật thể mà
  không chọn hay di chuyển gì (giữ Space ở công cụ Di chuyển cũng có tác dụng
  tương đương, tạm thời).
- **C — Bình luận**: click vào bản vẽ để để lại một ghi chú tại đúng điểm đó
  (ghim vàng); click ghim đã có để xem/sửa lại, dù đang ở công cụ nào. Bỏ
  trống nội dung rồi đóng lại sẽ tự xoá ghi chú đó.

## Giao diện sáng / tối

Mặc định nền sáng. Bấm icon mặt trời/mặt trăng ở thanh trên để đổi — lựa chọn
được nhớ lại cho lần mở sau (riêng với dữ liệu bản vẽ).

## Phím tắt

| Phím                               | Chức năng                               |
| ---------------------------------- | --------------------------------------- |
| Cmd/Ctrl + Z                       | Hoàn tác                                |
| Cmd/Ctrl + Shift + Z (hoặc Ctrl+Y) | Làm lại                                 |
| Cmd/Ctrl + A                       | Chọn tất cả                             |
| Cmd/Ctrl + C / X / V               | Copy / Cắt / Dán                        |
| Cmd/Ctrl + D                       | Nhân đôi lựa chọn                       |
| Cmd/Ctrl + G                       | Nhóm lại                                |
| Cmd/Ctrl + Shift + G               | Rã nhóm                                 |
| Cmd/Ctrl + '+' / '-'               | Zoom vào / ra (quanh tâm khung nhìn)    |
| Shift + 1                          | Zoom vừa khít toàn bộ nội dung          |
| Shift + 2                          | Zoom vừa khít lựa chọn hiện tại         |
| Delete / Backspace                 | Xoá lựa chọn                            |
| Mũi tên                            | Di chuyển 10mm (giữ Shift: theo ô lưới) |
| Escape                             | Bỏ chọn                                 |

Không hoạt động khi đang gõ trong một ô nhập số (để không phá thao tác gõ
thông thường của trình duyệt).

## Lưu trữ — dùng chung qua Supabase

Mọi thay đổi (thêm/xoá/kéo/resize/xoay/nhóm/bình luận) **tự lưu** — không cần
bấm nút nào — lên một bảng dùng chung trên Supabase, nên nhiều người mở cùng
một link đều thấy chung một bản vẽ, sửa ở máy này thì máy khác tự cập nhật
gần như ngay lập tức qua Supabase Realtime (không cần tự bấm tải lại trang).
Các thay đổi liên tiếp trong một lượt thao tác (vd. cả quá trình kéo một vật
thể) được gộp lại theo debounce ~600ms thành một lần ghi.

### Thiết lập lần đầu

1. Tạo tài khoản (miễn phí) và một project mới tại
   [supabase.com](https://supabase.com).
2. Vào **SQL Editor** của project, chạy:

   ```sql
   create table layouts (
     id text primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );

   alter publication supabase_realtime add table layouts;
   ```

3. Vào **Project Settings → API**, lấy **Project URL** và khoá **anon public**.
4. Copy `.env.local.example` thành `.env.local`, điền 2 giá trị đó vào
   `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. File `.env.local` không
   commit lên git (đã có trong `.gitignore`).
5. Khởi động lại `npm run dev` (hoặc deploy lại nếu đang chạy trên Vercel —
   nhớ khai báo 2 biến môi trường trên ở phần cấu hình project của Vercel).

Chưa cấu hình `.env.local` thì app vẫn chạy được bình thường, chỉ tự chuyển
sang lưu tạm vào **localStorage của riêng trình duyệt đang mở** (trạng thái
hiện "chưa cấu hình Supabase") — không chia sẻ được với người khác, chỉ dùng
để xem thử giao diện.

## Cấu trúc

- `src/FloorPlan.jsx` — canvas SVG toàn màn hình (pan/zoom bằng chuột-trackpad,
  khung nhìn tự co theo nội dung khi tải/undo), toolbar container/nội thất,
  thanh công cụ Di chuyển/Bàn tay/Bình luận, giao diện sáng/tối, modal hướng
  dẫn, chọn đơn/nhóm/marquee, kéo-di chuyển-cả-cụm, resize tỉ lệ, khoá nhẹ,
  undo/redo, clipboard, toàn bộ phím tắt, và đồng bộ dữ liệu qua Supabase.
- `src/furniture.jsx` — danh mục loại container (`CONTAINER_TYPES`) và nội
  thất (`FURNITURE_TYPES`), cùng hàm vẽ hình dạng theo toạ độ cục bộ
  (0,0) → (width,height) cho từng loại.
- `src/supabaseClient.js` — khởi tạo client Supabase từ 2 biến môi trường
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (đọc từ `.env.local`).
- `src/layout.json` — chỉ còn là nội dung khởi tạo mặc định, dùng để tạo
  dòng đầu tiên trên Supabase khi bảng `layouts` còn trống.
- `src/App.jsx` — điểm vào, chỉ render `<FloorPlan />`.
