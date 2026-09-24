import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Middleware chỉ chạy khi dev (npm run dev): nhận vị trí các vật thể sau khi
// người dùng kéo thả và ghi đè trực tiếp vào src/layout.json trên đĩa.
function saveLayoutPlugin() {
  return {
    name: 'save-layout',
    configureServer(server) {
      server.middlewares.use('/api/save-layout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const layout = JSON.parse(body)
            const file = path.resolve(server.config.root, 'src/layout.json')
            fs.writeFileSync(file, `${JSON.stringify(layout, null, 2)}\n`)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveLayoutPlugin()],
})
