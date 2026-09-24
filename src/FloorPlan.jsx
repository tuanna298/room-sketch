import { useCallback, useRef, useState } from 'react'
import defaultLayout from './layout.json'

// Bản vẽ mặt bằng được số hoá lại từ bản phác thảo gốc (đơn vị: mm).
// Toạ độ gốc (0,0) đặt tại góc trên-trái của toàn bộ mặt bằng, trục x sang phải, trục y xuống dưới.
// Tường và đường kích thước giữ cố định (đúng theo số đo gốc); chỉ cửa và thiết bị
// (lấy từ layout.json) là có thể kéo thả để sắp xếp lại, rồi lưu đè vào chính file đó.

const GRID_MINOR = 100 // mm mỗi ô lưới nhỏ
const GRID_MAJOR = 500 // mm mỗi ô lưới lớn (đậm hơn, dễ đếm)

const WALL_COLOR = '#e8e8e8'
const DOOR_COLOR = '#f2f2f2'
const FIXTURE_COLOR = '#c98a4b'
const DIM_COLOR = '#39d353'
const WALL_WIDTH = 16
const COLORS = { door: DOOR_COLOR, fixture: FIXTURE_COLOR, wall: WALL_COLOR }

// Toàn bộ bao ngoài mặt bằng
const W = 2820
const H = 2900

// Các mốc tường chính, suy ra trực tiếp từ các số đo trên bản gốc:
// - Trên: 1620 + 1200 = 2820 (khớp đúng chiều rộng tổng)
// - Trái: 900 + 1200 + 800 = 2900 (khớp đúng chiều cao tổng)
// - Dưới: 985 + 1700 = 2685 (lệch nhẹ so với 2820 do mốc đo tới mặt trong tường phải)
// - Phải: 600 / 1000 / 2150 là các đường đo nội bộ dọc theo tường phải, giữ nguyên số liệu gốc
const X = { A_B: 1620, C_D: 630, D_edge: 985, BIG_left: 1120, right: 2820 }
const Y = { top_row: 900, C_bottom: 2100, bottom: 2900, nook: 600 }

const MARGIN = { top: 420, left: 520, right: 620, bottom: 380 }
const SNAP = 20 // mm — làm tròn vị trí khi thả để các vật thể thẳng hàng dễ hơn

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function snap(v) {
  return Math.round(v / SNAP) * SNAP
}

function Wall({ x1, y1, x2, y2 }) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={WALL_COLOR}
      strokeWidth={WALL_WIDTH}
      strokeLinecap="square"
      pointerEvents="none"
    />
  )
}

function Tick({ x, y, size = 45 }) {
  const d = size / Math.SQRT2
  return (
    <line
      x1={x - d} y1={y + d} x2={x + d} y2={y - d}
      stroke={DIM_COLOR}
      strokeWidth={7}
    />
  )
}

// Đường kích thước ngang: points = mảng {x, label?} theo thứ tự tăng dần trên trục x
function HDimension({ y, points, textOffset = -55 }) {
  const x0 = points[0].x
  const x1 = points[points.length - 1].x
  return (
    <g pointerEvents="none">
      <line x1={x0} y1={y} x2={x1} y2={y} stroke={DIM_COLOR} strokeWidth={4} />
      {points.map((p, i) => <Tick key={i} x={p.x} y={y} />)}
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1]
        const mid = (p.x + next.x) / 2
        return (
          <text
            key={i}
            x={mid}
            y={y + textOffset}
            fill={DIM_COLOR}
            fontSize={90}
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            textAnchor="middle"
          >
            {next.label}
          </text>
        )
      })}
    </g>
  )
}

// Đường kích thước dọc: points = mảng {y, label?} theo thứ tự tăng dần trên trục y
// Chữ được xoay để đọc từ dưới lên trên, đúng quy ước của bản gốc.
function VDimension({ x, points, textOffset = -55 }) {
  const y0 = points[0].y
  const y1 = points[points.length - 1].y
  return (
    <g pointerEvents="none">
      <line x1={x} y1={y0} x2={x} y2={y1} stroke={DIM_COLOR} strokeWidth={4} />
      {points.map((p, i) => <Tick key={i} x={x} y={p.y} />)}
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1]
        const mid = (p.y + next.y) / 2
        return (
          <text
            key={i}
            x={x + textOffset}
            y={mid}
            fill={DIM_COLOR}
            fontSize={90}
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            textAnchor="middle"
            transform={`rotate(-90 ${x + textOffset} ${mid})`}
          >
            {next.label}
          </text>
        )
      })}
    </g>
  )
}

// Cửa đi bản lề trên; dir="down" mở vào phía dưới bản lề, dir="up" mở lên phía trên.
function Door({ x, y, width, dir = 'down', color = DOOR_COLOR }) {
  const sign = dir === 'up' ? -1 : 1
  const tipX = x
  const tipY = y + sign * width
  const closedX = x + width
  const closedY = y
  const sweepFlag = dir === 'up' ? 1 : 0
  return (
    <g stroke={color} strokeWidth={7} fill="none">
      <line x1={x} y1={y} x2={tipX} y2={tipY} />
      <path d={`M ${tipX} ${tipY} A ${width} ${width} 0 0 ${sweepFlag} ${closedX} ${closedY}`} />
    </g>
  )
}

// Bồn cầu (ký hiệu đơn giản): két nước + bệ hình chữ U. (x,y) là tâm bệ.
function Toilet({ x, y, color = FIXTURE_COLOR }) {
  const tankW = 220
  const tankH = 70
  const bowlW = 240
  const bowlH = 260
  return (
    <g stroke={color} strokeWidth={6} fill="none">
      <rect x={x - tankW / 2} y={y - bowlH / 2 - tankH} width={tankW} height={tankH} />
      <path
        d={`M ${x - bowlW / 2} ${y - bowlH / 2}
            L ${x - bowlW / 2} ${y + bowlH / 2 - bowlW / 2}
            A ${bowlW / 2} ${bowlW / 2} 0 0 0 ${x + bowlW / 2} ${y + bowlH / 2 - bowlW / 2}
            L ${x + bowlW / 2} ${y - bowlH / 2}`}
      />
      <line
        x1={x - bowlW / 2 + 25} y1={y - bowlH / 2 + 55}
        x2={x + bowlW / 2 - 25} y2={y - bowlH / 2 + 55}
      />
    </g>
  )
}

// Tủ / kệ áp tường (chỉ là khối tham chiếu, không có số đo riêng trong bản gốc)
function Cabinet({ x, y, width, height, color = FIXTURE_COLOR }) {
  return <rect x={x} y={y} width={width} height={height} stroke={color} strokeWidth={6} fill="none" />
}

// Thiết bị dạng hộp (máy giặt / bình nóng lạnh...) kèm chân/ống thoát nhỏ phía dưới
function BoxFixture({ x, y, width, height, color = WALL_COLOR }) {
  const tabW = width * 0.28
  return (
    <g stroke={color} strokeWidth={6} fill="none">
      <rect x={x} y={y} width={width} height={height} />
      <rect x={x + (width - tabW) / 2} y={y + height} width={tabW} height={height * 0.14} />
    </g>
  )
}

function itemBounds(item) {
  switch (item.kind) {
    case 'toilet':
      return { w: 260, h: 400 }
    case 'cabinet':
    case 'box':
      return { w: item.width, h: item.height }
    case 'door':
    default:
      return { w: item.width, h: item.width }
  }
}

function renderItem(id, item) {
  const color = COLORS[item.color] ?? item.color
  switch (item.kind) {
    case 'door':
      return <Door key={id} x={item.x} y={item.y} width={item.width} dir={item.dir} color={color} />
    case 'toilet':
      return <Toilet key={id} x={item.x} y={item.y} color={color} />
    case 'cabinet':
      return <Cabinet key={id} x={item.x} y={item.y} width={item.width} height={item.height} color={color} />
    case 'box':
      return <BoxFixture key={id} x={item.x} y={item.y} width={item.width} height={item.height} color={color} />
    default:
      return null
  }
}

function GridBackground() {
  return (
    <>
      <defs>
        <pattern id="grid-minor" width={GRID_MINOR} height={GRID_MINOR} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID_MINOR} 0 L 0 0 0 ${GRID_MINOR}`} fill="none" stroke="#182018" strokeWidth={2} />
        </pattern>
        <pattern id="grid-major" width={GRID_MAJOR} height={GRID_MAJOR} patternUnits="userSpaceOnUse">
          <rect width={GRID_MAJOR} height={GRID_MAJOR} fill="url(#grid-minor)" />
          <path d={`M ${GRID_MAJOR} 0 L 0 0 0 ${GRID_MAJOR}`} fill="none" stroke="#24402c" strokeWidth={3} />
        </pattern>
      </defs>
      <rect x={-2000} y={-2000} width={W + 5000} height={H + 5000} fill="url(#grid-major)" pointerEvents="none" />
    </>
  )
}

export default function FloorPlan() {
  const [items, setItems] = useState(defaultLayout)
  const [draggingId, setDraggingId] = useState(null)
  const [status, setStatus] = useState('')
  const svgRef = useRef(null)
  const dragOffset = useRef({ dx: 0, dy: 0 })

  const toSvgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }, [])

  const handlePointerDown = useCallback((id) => (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = toSvgPoint(e.clientX, e.clientY)
    const item = items[id]
    dragOffset.current = { dx: item.x - start.x, dy: item.y - start.y }
    setDraggingId(id)
    setStatus('')
  }, [items, toSvgPoint])

  const handlePointerMove = useCallback((id) => (e) => {
    if (draggingId !== id) return
    const cur = toSvgPoint(e.clientX, e.clientY)
    const { dx, dy } = dragOffset.current
    const { w, h } = itemBounds(items[id])
    const nextX = clamp(snap(cur.x + dx), -MARGIN.left + 20, W + MARGIN.right - w - 20)
    const nextY = clamp(snap(cur.y + dy), -MARGIN.top + 20, H + MARGIN.bottom - h - 20)
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], x: nextX, y: nextY } }))
  }, [draggingId, items, toSvgPoint])

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDraggingId(null)
  }, [])

  const handleSave = useCallback(async () => {
    setStatus('Đang lưu…')
    try {
      const res = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items, null, 2),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('Đã lưu vào src/layout.json')
    } catch {
      setStatus('Không lưu được — chỉ hoạt động khi chạy npm run dev')
    }
  }, [items])

  const handleReset = useCallback(() => {
    setItems(defaultLayout)
    setStatus('Đã khôi phục vị trí mặc định (chưa lưu)')
  }, [])

  const viewBox = `${-MARGIN.left} ${-MARGIN.top} ${W + MARGIN.left + MARGIN.right} ${H + MARGIN.top + MARGIN.bottom}`

  return (
    <div className="plan-shell">
      <div className="plan-toolbar">
        <button type="button" onClick={handleSave}>Lưu thay đổi</button>
        <button type="button" className="secondary" onClick={handleReset}>Khôi phục mặc định</button>
        {status && <span className="plan-status">{status}</span>}
      </div>

      <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ display: 'block' }}>
        <GridBackground />

        {/* ===== Tường bao và tường ngăn (cố định) ===== */}
        <Wall x1={0} y1={0} x2={W} y2={0} />
        <Wall x1={0} y1={0} x2={0} y2={H} />
        <Wall x1={W} y1={0} x2={W} y2={Y.bottom} />
        <Wall x1={0} y1={H} x2={X.D_edge} y2={H} />
        <Wall x1={X.D_edge} y1={H} x2={W} y2={H} />

        <Wall x1={X.A_B} y1={0} x2={X.A_B} y2={Y.top_row} />
        <Wall x1={0} y1={Y.top_row} x2={X.C_D} y2={Y.top_row} />
        <Wall x1={X.C_D} y1={Y.top_row} x2={X.C_D} y2={Y.C_bottom} />
        <Wall x1={X.C_D} y1={Y.C_bottom} x2={X.D_edge} y2={Y.C_bottom} />
        <Wall x1={X.D_edge} y1={Y.C_bottom} x2={X.D_edge} y2={H} />

        <Wall x1={X.BIG_left} y1={Y.top_row} x2={W} y2={Y.top_row} />
        <Wall x1={X.BIG_left} y1={Y.top_row} x2={X.BIG_left} y2={Y.C_bottom} />
        <Wall x1={X.BIG_left} y1={Y.C_bottom} x2={X.BIG_left} y2={H} />

        <Wall x1={X.A_B} y1={Y.nook} x2={W} y2={Y.nook} />

        {/* ===== Cửa & thiết bị: kéo thả được, vị trí lấy từ layout.json ===== */}
        {Object.entries(items).map(([id, item]) => {
          const { w, h } = itemBounds(item)
          const hitPad = 40
          return (
            <g
              key={id}
              onPointerDown={handlePointerDown(id)}
              onPointerMove={handlePointerMove(id)}
              onPointerUp={handlePointerUp}
              style={{ cursor: draggingId === id ? 'grabbing' : 'grab', touchAction: 'none' }}
              opacity={draggingId === id ? 0.65 : 1}
            >
              <rect
                x={item.x - hitPad}
                y={item.y - (item.kind === 'toilet' ? h / 2 : 0) - hitPad}
                width={w + hitPad * 2}
                height={h + hitPad * 2}
                fill="transparent"
              />
              {renderItem(id, item)}
            </g>
          )
        })}

        {/* ===== Kích thước trên ===== */}
        <HDimension
          y={-160}
          points={[{ x: 0 }, { x: X.A_B, label: '1620' }, { x: W, label: '1200' }]}
        />

        {/* ===== Kích thước trái ===== */}
        <VDimension
          x={-160}
          points={[
            { y: 0 },
            { y: Y.top_row, label: '900' },
            { y: Y.C_bottom, label: '1200' },
            { y: H, label: '800' },
          ]}
        />

        {/* ===== Kích thước phải (giữ nguyên số liệu gốc: 600 / 1000 / 2150) ===== */}
        <VDimension
          x={W + 160}
          points={[
            { y: Y.top_row },
            { y: Y.top_row + 600, label: '600' },
            { y: Y.top_row + 1600, label: '1000' },
          ]}
        />
        <VDimension
          x={W + 340}
          points={[{ y: Y.top_row }, { y: H, label: '2150' }]}
        />

        {/* ===== Kích thước giữa (mốc nội bộ, theo đúng nhãn gốc) ===== */}
        <VDimension
          x={620}
          points={[
            { y: Y.top_row },
            { y: Y.top_row + 600, label: '600' },
            { y: Y.top_row + 630, label: '630' },
          ]}
          textOffset={-55}
        />
        <HDimension
          y={Y.top_row + 250}
          points={[{ x: X.BIG_left }, { x: W, label: '1700' }]}
        />

        {/* ===== Kích thước dưới ===== */}
        <HDimension
          y={H + 200}
          points={[{ x: 0 }, { x: X.D_edge, label: '985' }, { x: X.D_edge + 1700, label: '1700' }]}
          textOffset={130}
        />
      </svg>
    </div>
  )
}
