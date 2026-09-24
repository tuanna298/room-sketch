// Client Supabase dùng chung cho toàn app — kết nối tới bảng lưu bản vẽ dùng
// chung giữa nhiều người, thay cho localStorage (chỉ lưu riêng trên từng máy)
// hay file trên đĩa (chỉ ghi được khi chạy npm run dev).
import { createClient } from "@supabase/supabase-js";

// Ưu tiên tiền tố chuẩn VITE_; chấp nhận thêm tên không tiền tố cho trường
// hợp CI/host (vd. Vercel) không cho đặt tiền tố VITE_ — xem envPrefix trong
// vite.config.js, nếu thiếu khai báo đó thì tên không tiền tố sẽ bị Vite lược
// bỏ khỏi bundle và luôn đọc ra undefined dù đã set đúng trên host.
const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY;

// Chưa cấu hình .env.local thì để null — FloorPlan.jsx sẽ tự phát hiện và
// chạy chế độ chỉ-lưu-cục-bộ (localStorage) kèm cảnh báo, thay vì crash cả app.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const PROJECT_ID = "default";
