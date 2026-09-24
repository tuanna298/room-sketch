import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite mặc định chỉ nhúng vào bundle frontend các biến có tiền tố VITE_ (an
  // toàn: tránh lộ biến môi trường phía server vào code chạy trên trình
  // duyệt). Khai báo thêm "SUPABASE_" ở đây để chấp nhận cả tên không tiền tố
  // (trường hợp Vercel/CI không cho đặt tiền tố VITE_) — xem supabaseClient.js.
  envPrefix: ["VITE_", "SUPABASE_"],
})
