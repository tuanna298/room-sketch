import { useCallback, useEffect, useRef, useState } from 'react'
import defaultLayout from './layout.json'
import { FURNITURE_TYPES, MIN_SIZE, FurnitureShape, furnitureType } from './furniture'

// Bản vẽ mặt bằng được số hoá lại từ bản phác thảo gốc (đơn vị: mm).
// Toạ độ gốc (0,0) đặt tại góc trên-trái của toàn bộ mặt bằng, trục x sang phải, trục y xuống dưới.
// Tường và đường kích thước giữ cố định (đúng theo số đo gốc); nội thất là các khối
// hình học chữ nhật lấy từ toolbar, có thể kéo di chuyển, kéo góc để đổi kích cỡ,
// hoặc sửa số liệu trực tiếp trong bảng thuộc tính — rồi lưu đè vào layout.json.

const GRID_MINOR = 100 // mm mỗi ô lưới nhỏ
const GRID_MAJOR = 500 // mm mỗi ô lưới lớn (đậm hơn, dễ đếm)

const WALL_COLOR = '#e8e8e8'
const FURNITURE_COLOR = '#c98a4b'
const DIM_COLOR = '#39d353'
const SELECT_COLOR = '#5ab8ff'
const WALL_WIDTH = 16

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
const SNAP = 20 // mm — làm tròn vị trí/kích thước để các vật thể thẳng hàng dễ hơn
const HANDLE_SIZE = 70 // mm — kích thước ô vuông tay cầm ở góc

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function snap(v) {
  return Math.round(v / SNAP) * SNAP
}

const CORNERS = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
]

function cornerPoint(box, corner) {
  const x = corner.includes('w') ? box.x : box.x + box.width
  const y = corner.includes('n') ? box.y : box.y + box.height
  return { x, y }
}

// Tính lại {x,y,width,height} khi kéo một góc tới vị trí con trỏ hiện tại (cur),
// giữ nguyên cạnh đối diện với góc đang kéo.
function resizeBox(box, corner, cur) {
  let { x, y, width, height } = box
  const right = box.x + box.width
  const bottom = box.y + box.height
  if (corner.includes('e')) width = clamp(cur.x - x, MIN_SIZE, 100000)
  if (corner.includes('s')) height = clamp(cur.y - y, MIN_SIZE, 100000)
  if (corner.includes('w')) {
    x = clamp(cur.x, right - 100000, right - MIN_SIZE)
    width = right - x
  }
  if (corner.includes('n')) {
    y = clamp(cur.y, bottom - 100000, bottom - MIN_SIZE)
    height = bottom - y
  }
  return { x: snap(x), y: snap(y), width: snap(width), height: snap(height) }
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
  return <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} stroke={DIM_COLOR} strokeWidth={7} />
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
          <text key={i} x={mid} y={y + textOffset} fill={DIM_COLOR} fontSize={90}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" textAnchor="middle">
            {next.label}
          </text>
        )
      })}
    </g>
  )
}

// Đường kích thước dọc: points = mảng {y, label?} theo thứ tự tăng dần trên trục y
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
          <text key={i} x={x + textOffset} y={mid} fill={DIM_COLOR} fontSize={90}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" textAnchor="middle"
            transform={`rotate(-90 ${x + textOffset} ${mid})`}>
            {next.label}
          </text>
        )
      })}
    </g>
  )
}

function GridBackground({ onPointerDown }) {
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
      <rect
        x={-2000} y={-2000} width={W + 5000} height={H + 5000}
        fill="url(#grid-major)"
        onPointerDown={onPointerDown}
      />
    </>
  )
}

function FurnitureToolbar({ onAdd }) {
  return (
    <div className="furniture-toolbar">
      {FURNITURE_TYPES.map((t) => (
        <button key={t.id} type="button" className="furniture-btn" onClick={() => onAdd(t.id)}>
          <svg viewBox={`0 0 ${t.width} ${t.height}`} className="furniture-icon">
            <FurnitureShape type={t.id} w={t.width} h={t.height} color={FURNITURE_COLOR} />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

function PropertiesPanel({ item, onChange, onRotate, onDelete }) {
  if (!item) {
    return (
      <aside className="properties-panel empty">
        Chọn một đối tượng trên bản vẽ, hoặc thêm mới từ toolbar bên trái để chỉnh sửa thuộc tính.
      </aside>
    )
  }
  const type = furnitureType(item.type)
  const field = (key, label) => (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(item[key])}
        step={SNAP}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isNaN(v)) return
          const min = key === 'width' || key === 'height' ? MIN_SIZE : -100000
          onChange({ ...item, [key]: clamp(v, min, 100000) })
        }}
      />
    </label>
  )
  return (
    <aside className="properties-panel">
      <h3>{type.label}</h3>
      <div className="prop-grid">
        {field('x', 'X (mm)')}
        {field('y', 'Y (mm)')}
        {field('width', 'Rộng (mm)')}
        {field('height', 'Cao (mm)')}
      </div>
      <div className="prop-actions">
        <button type="button" onClick={onRotate}>Xoay 90°</button>
        <button type="button" className="danger" onClick={onDelete}>Xoá</button>
      </div>
    </aside>
  )
}

export default function FloorPlan() {
  const [items, setItems] = useState(defaultLayout.items ?? [])
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState('')
  const svgRef = useRef(null)
  const drag = useRef(null)
  const addCount = useRef(0)

  const toSvgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }, [])

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const handleBodyPointerDown = useCallback((id) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = toSvgPoint(e.clientX, e.clientY)
    const item = items.find((it) => it.id === id)
    drag.current = { mode: 'move', id, dx: item.x - start.x, dy: item.y - start.y }
    setSelectedId(id)
    setStatus('')
  }, [items, toSvgPoint])

  const handleBodyPointerMove = useCallback((id) => (e) => {
    const d = drag.current
    if (!d || d.mode !== 'move' || d.id !== id) return
    const cur = toSvgPoint(e.clientX, e.clientY)
    const item = items.find((it) => it.id === id)
    const nextX = clamp(snap(cur.x + d.dx), -MARGIN.left + 20, W + MARGIN.right - item.width - 20)
    const nextY = clamp(snap(cur.y + d.dy), -MARGIN.top + 20, H + MARGIN.bottom - item.height - 20)
    updateItem(id, { x: nextX, y: nextY })
  }, [items, toSvgPoint, updateItem])

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
  }, [])

  const handleHandlePointerDown = useCallback((id, corner) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const item = items.find((it) => it.id === id)
    drag.current = { mode: 'resize', id, corner, box: { x: item.x, y: item.y, width: item.width, height: item.height } }
    setSelectedId(id)
    setStatus('')
  }, [items])

  const handleHandlePointerMove = useCallback((id, corner) => (e) => {
    const d = drag.current
    if (!d || d.mode !== 'resize' || d.id !== id || d.corner !== corner) return
    const cur = toSvgPoint(e.clientX, e.clientY)
    updateItem(id, resizeBox(d.box, corner, cur))
  }, [toSvgPoint, updateItem])

  const handleAdd = useCallback((typeId) => {
    const type = furnitureType(typeId)
    const cascade = (addCount.current % 6) * 60
    addCount.current += 1
    const newItem = {
      id: `${typeId}-${Date.now()}-${addCount.current}`,
      type: typeId,
      x: snap(W / 2 - type.width / 2 + cascade),
      y: snap(H / 2 - type.height / 2 + cascade),
      width: type.width,
      height: type.height,
    }
    setItems((prev) => [...prev, newItem])
    setSelectedId(newItem.id)
    setStatus('')
  }, [])

  const handleRotate = useCallback(() => {
    if (!selectedId) return
    setItems((prev) => prev.map((it) => (
      it.id === selectedId ? { ...it, width: it.height, height: it.width } : it
    )))
  }, [selectedId])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    setItems((prev) => prev.filter((it) => it.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const handleSave = useCallback(async () => {
    setStatus('Đang lưu…')
    try {
      const res = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }, null, 2),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('Đã lưu vào src/layout.json')
    } catch {
      setStatus('Không lưu được — chỉ hoạt động khi chạy npm run dev')
    }
  }, [items])

  const handleReset = useCallback(() => {
    setItems(defaultLayout.items ?? [])
    setSelectedId(null)
    setStatus('Đã khôi phục danh sách đã lưu gần nhất (chưa ghi lại xuống file)')
  }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (!selectedId) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDelete()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, handleDelete])

  const viewBox = `${-MARGIN.left} ${-MARGIN.top} ${W + MARGIN.left + MARGIN.right} ${H + MARGIN.top + MARGIN.bottom}`
  const selectedItem = items.find((it) => it.id === selectedId) ?? null

  return (
    <div className="plan-shell">
      <div className="plan-toolbar">
        <button type="button" onClick={handleSave}>Lưu thay đổi</button>
        <button type="button" className="secondary" onClick={handleReset}>Khôi phục đã lưu</button>
        {status && <span className="plan-status">{status}</span>}
      </div>

      <div className="editor-body">
        <FurnitureToolbar onAdd={handleAdd} />

        <svg
          ref={svgRef} viewBox={viewBox} width="100%" height="100%"
          style={{ display: 'block' }}
        >
          <GridBackground onPointerDown={() => setSelectedId(null)} />

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

          {/* ===== Nội thất: thêm từ toolbar, kéo để di chuyển ===== */}
          {items.map((item) => (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.y})`}
              onPointerDown={handleBodyPointerDown(item.id)}
              onPointerMove={handleBodyPointerMove(item.id)}
              onPointerUp={handlePointerUp}
              style={{ cursor: 'grab', touchAction: 'none' }}
              opacity={drag.current?.id === item.id ? 0.65 : 1}
            >
              <rect x={0} y={0} width={item.width} height={item.height} fill="transparent" />
              <FurnitureShape type={item.type} w={item.width} h={item.height} color={FURNITURE_COLOR} />
            </g>
          ))}

          {/* ===== Khung chọn + tay cầm kéo-giãn cho vật thể đang chọn ===== */}
          {selectedItem && (
            <g pointerEvents="none">
              <rect
                x={selectedItem.x} y={selectedItem.y}
                width={selectedItem.width} height={selectedItem.height}
                fill="none" stroke={SELECT_COLOR} strokeWidth={5} strokeDasharray="24 16"
              />
            </g>
          )}
          {selectedItem && CORNERS.map(({ id: corner, cursor }) => {
            const p = cornerPoint(selectedItem, corner)
            const s = HANDLE_SIZE
            return (
              <rect
                key={corner}
                x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
                fill={SELECT_COLOR} stroke="#08131c" strokeWidth={4}
                style={{ cursor, touchAction: 'none' }}
                onPointerDown={handleHandlePointerDown(selectedItem.id, corner)}
                onPointerMove={handleHandlePointerMove(selectedItem.id, corner)}
                onPointerUp={handlePointerUp}
              />
            )
          })}

          {/* ===== Kích thước trên ===== */}
          <HDimension y={-160} points={[{ x: 0 }, { x: X.A_B, label: '1620' }, { x: W, label: '1200' }]} />

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
          <VDimension x={W + 340} points={[{ y: Y.top_row }, { y: H, label: '2150' }]} />

          {/* ===== Kích thước giữa (mốc nội bộ, theo đúng nhãn gốc) ===== */}
          <VDimension
            x={620}
            points={[
              { y: Y.top_row },
              { y: Y.top_row + 600, label: '600' },
              { y: Y.top_row + 630, label: '630' },
            ]}
          />
          <HDimension y={Y.top_row + 250} points={[{ x: X.BIG_left }, { x: W, label: '1700' }]} />

          {/* ===== Kích thước dưới ===== */}
          <HDimension
            y={H + 200}
            points={[{ x: 0 }, { x: X.D_edge, label: '985' }, { x: X.D_edge + 1700, label: '1700' }]}
            textOffset={130}
          />
        </svg>

        <PropertiesPanel
          item={selectedItem}
          onChange={(next) => updateItem(next.id, next)}
          onRotate={handleRotate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
