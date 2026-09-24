// Client Supabase dùng chung cho toàn app — kết nối tới bảng lưu bản vẽ dùng
// chung giữa nhiều người, thay cho localStorage (chỉ lưu riêng trên từng máy)
// hay file trên đĩa (chỉ ghi được khi chạy npm run dev).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Chưa cấu hình .env.local thì để null — FloorPlan.jsx sẽ tự phát hiện và
// chạy chế độ chỉ-lưu-cục-bộ (localStorage) kèm cảnh báo, thay vì crash cả app.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const PROJECT_ID = "default";
