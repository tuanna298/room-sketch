import { useCallback, useEffect, useRef, useState } from 'react'
import fileLayout from './layout.json'
import { FURNITURE_TYPES, CONTAINER_TYPES, MIN_SIZE, FurnitureShape, typeOf } from './furniture'

// Bản vẽ không còn một căn phòng đóng cứng nào — "container" (khối tường / cột)
// là một đối tượng như bao đối tượng khác, do người dùng thêm và kéo-giãn để dựng
// lại ranh giới phòng hoặc đánh dấu vật cản cố định. Đường kích thước không còn
// vẽ sẵn: chúng tự xuất hiện giữa một món nội thất và cạnh container gần nhất khi
// khoảng cách đủ nhỏ. Trạng thái toàn bộ bản vẽ tự lưu vào localStorage của trình
// duyệt sau mỗi thay đổi; nút "Lưu ra file" chỉ để xuất một bản chụp ra layout.json.

const GRID_MINOR = 100 // mm mỗi ô lưới nhỏ
const GRID_MAJOR = 500 // mm mỗi ô lưới lớn (đậm hơn, dễ đếm)

const WALL_COLOR = '#e8e8e8'
const FURNITURE_COLOR = '#c98a4b'
const DIM_COLOR = '#39d353'
const SELECT_COLOR = '#5ab8ff'
const GUIDE_COLOR = '#ff5ac8'

// Không còn canvas cố định theo kích thước một căn phòng cụ thể — khung nhìn tự co
// giãn quanh các đối tượng hiện có (xem computeFitViewBox), chỉ đóng băng lại trong
// lúc đang kéo/resize để tránh giật hình. GRID_SPAN là vùng kẻ ô phủ sẵn, đủ rộng
// cho hầu hết mọi bố cục; WORLD_LIMIT chỉ để chặn việc kéo vật thể ra xa vô hạn.
const GRID_SPAN = 9000
const WORLD_LIMIT = 20000
const DEFAULT_VIEW = { x: -500, y: -500, w: 4000, h: 3000 }
const FIT_PADDING = 600
const FIT_MIN_W = 3000
const FIT_MIN_H = 2400

const SNAP = 20 // mm — làm tròn khi không khoá theo vật thể khác
const HANDLE_SIZE = 70 // mm — kích thước ô vuông tay cầm ở góc
const ALIGN_SNAP = 60 // mm — "khoá nhẹ" khi cạnh/tâm vật thể gần trùng vật khác
const AUTO_DIM_THRESHOLD = 300 // mm — hiện đường kích thước nếu cách container trong khoảng này
const STORAGE_KEY = 'floorplan-layout-v1'

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

// Vật xoay 90°/270° đổi chỗ chiều rộng/chiều cao trên màn hình dù width/height lưu
// trong dữ liệu vẫn là kích thước "tự nhiên" dùng để vẽ chi tiết bên trong. Hai hàm
// dưới quy đổi qua lại giữa khung toạ độ cục bộ (lưu trong item) và hộp bao trên
// màn hình (dùng để chọn, kéo góc, tính khoảng cách và khoá nhẹ).
function toScreenBox(item) {
  const rotation = item.rotation ?? 0
  if (rotation % 180 === 90) {
    const cx = item.x + item.width / 2
    const cy = item.y + item.height / 2
    return { x: cx - item.height / 2, y: cy - item.width / 2, width: item.height, height: item.width }
  }
  return { x: item.x, y: item.y, width: item.width, height: item.height }
}

function fromScreenBox(item, screenBox) {
  const rotation = item.rotation ?? 0
  if (rotation % 180 === 90) {
    const cx = screenBox.x + screenBox.width / 2
    const cy = screenBox.y + screenBox.height / 2
    const width = screenBox.height
    const height = screenBox.width
    return { x: cx - width / 2, y: cy - height / 2, width, height }
  }
  return { x: screenBox.x, y: screenBox.y, width: screenBox.width, height: screenBox.height }
}

// Khung nhìn tự co theo các đối tượng hiện có (giống "zoom to fit"), luôn chừa
// FIT_PADDING mm quanh mép ngoài cùng và không bao giờ nhỏ hơn FIT_MIN_W x FIT_MIN_H
// (để một vật thể lẻ loi không bị phóng to bất thường). Không có đối tượng nào thì
// dùng DEFAULT_VIEW để vẫn thấy nền kẻ ô mà đặt món đầu tiên vào.
function computeFitViewBox(list) {
  if (!list.length) return DEFAULT_VIEW
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of list) {
    const b = toScreenBox(it)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  const w = Math.max(FIT_MIN_W, maxX - minX)
  const h = Math.max(FIT_MIN_H, maxY - minY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { x: cx - w / 2 - FIT_PADDING, y: cy - h / 2 - FIT_PADDING, w: w + FIT_PADDING * 2, h: h + FIT_PADDING * 2 }
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

function edgesOf(box) {
  return {
    xs: [box.x, box.x + box.width / 2, box.x + box.width],
    ys: [box.y, box.y + box.height / 2, box.y + box.height],
  }
}

// "Khoá nhẹ": khi kéo một vật thể, nếu cạnh trái/phải/tâm hoặc trên/dưới/tâm của nó
// nằm trong ALIGN_SNAP mm so với một vật thể khác (container hoặc nội thất), hút
// đúng vào vị trí đó thay vì chỉ làm tròn theo lưới. Trả về độ lệch cần cộng thêm
// và toạ độ đường gióng để hiển thị phản hồi trực quan khi đang kéo.
function computeAlignSnap(box, others) {
  const mine = edgesOf(box)
  let bestDX = null
  let bestDY = null
  let guideX = null
  let guideY = null
  for (const other of others) {
    const theirs = edgesOf(other)
    for (const mx of mine.xs) {
      for (const tx of theirs.xs) {
        const d = tx - mx
        if (Math.abs(d) <= ALIGN_SNAP && (bestDX === null || Math.abs(d) < Math.abs(bestDX))) {
          bestDX = d
          guideX = tx
        }
      }
    }
    for (const my of mine.ys) {
      for (const ty of theirs.ys) {
        const d = ty - my
        if (Math.abs(d) <= ALIGN_SNAP && (bestDY === null || Math.abs(d) < Math.abs(bestDY))) {
          bestDY = d
          guideY = ty
        }
      }
    }
  }
  return { dx: bestDX ?? 0, dy: bestDY ?? 0, guideX, guideY }
}

// Với một món nội thất, dò các container mà nó nằm gần cạnh (trong AUTO_DIM_THRESHOLD
// mm) để phát sinh đường kích thước tự động — không cần vẽ sẵn, không cần fix cứng.
function computeAutoDims(item, containers) {
  const itemBox = toScreenBox(item)
  const dims = []
  for (const c of containers) {
    const cBox = toScreenBox(c)
    const overlapX = Math.min(itemBox.x + itemBox.width, cBox.x + cBox.width) - Math.max(itemBox.x, cBox.x)
    const overlapY = Math.min(itemBox.y + itemBox.height, cBox.y + cBox.height) - Math.max(itemBox.y, cBox.y)
    if (overlapX > 0) {
      const midX = Math.max(itemBox.x, cBox.x) + overlapX / 2
      const gapTop = itemBox.y - cBox.y
      if (gapTop >= 0 && gapTop <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-top`, axis: 'v', x1: midX, y1: cBox.y, x2: midX, y2: itemBox.y, label: Math.round(gapTop) })
      }
      const gapBottom = cBox.y + cBox.height - (itemBox.y + itemBox.height)
      if (gapBottom >= 0 && gapBottom <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-bottom`, axis: 'v', x1: midX, y1: itemBox.y + itemBox.height, x2: midX, y2: cBox.y + cBox.height, label: Math.round(gapBottom) })
      }
    }
    if (overlapY > 0) {
      const midY = Math.max(itemBox.y, cBox.y) + overlapY / 2
      const gapLeft = itemBox.x - cBox.x
      if (gapLeft >= 0 && gapLeft <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-left`, axis: 'h', x1: cBox.x, y1: midY, x2: itemBox.x, y2: midY, label: Math.round(gapLeft) })
      }
      const gapRight = cBox.x + cBox.width - (itemBox.x + itemBox.width)
      if (gapRight >= 0 && gapRight <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-right`, axis: 'h', x1: itemBox.x + itemBox.width, y1: midY, x2: cBox.x + cBox.width, y2: midY, label: Math.round(gapRight) })
      }
    }
  }
  return dims
}

function AutoDim({ x1, y1, x2, y2, axis, label }) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const tick = 30
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM_COLOR} strokeWidth={4} />
      {axis === 'v' ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke={DIM_COLOR} strokeWidth={4} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke={DIM_COLOR} strokeWidth={4} />
          <text x={midX + 18} y={midY} fill={DIM_COLOR} fontSize={60}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" dominantBaseline="middle">{label}</text>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke={DIM_COLOR} strokeWidth={4} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke={DIM_COLOR} strokeWidth={4} />
          <text x={midX} y={midY - 18} fill={DIM_COLOR} fontSize={60}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" textAnchor="middle">{label}</text>
        </>
      )}
    </g>
  )
}

function AlignGuides({ x, y, view }) {
  return (
    <g pointerEvents="none">
      {x !== null && (
        <line x1={x} y1={view.y} x2={x} y2={view.y + view.h}
          stroke={GUIDE_COLOR} strokeWidth={Math.max(3, view.w * 0.0007)} strokeDasharray="20 14" />
      )}
      {y !== null && (
        <line x1={view.x} y1={y} x2={view.x + view.w} y2={y}
          stroke={GUIDE_COLOR} strokeWidth={Math.max(3, view.w * 0.0007)} strokeDasharray="20 14" />
      )}
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
        x={-GRID_SPAN} y={-GRID_SPAN} width={GRID_SPAN * 2} height={GRID_SPAN * 2}
        fill="url(#grid-major)"
        onPointerDown={onPointerDown}
      />
    </>
  )
}

function ObjectToolbar({ onAdd }) {
  return (
    <div className="furniture-toolbar">
      <div className="toolbar-section-label">Cấu trúc cố định</div>
      {CONTAINER_TYPES.map((t) => (
        <button key={t.id} type="button" className="furniture-btn" onClick={() => onAdd('container', t.id)}>
          <svg viewBox={`0 0 ${t.width} ${t.height}`} className="furniture-icon">
            <FurnitureShape type={t.id} w={t.width} h={t.height} color={WALL_COLOR} />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
      <div className="toolbar-section-label">Nội thất</div>
      {FURNITURE_TYPES.map((t) => (
        <button key={t.id} type="button" className="furniture-btn" onClick={() => onAdd('furniture', t.id)}>
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
  const type = typeOf(item.category, item.type)
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
        <button type="button" onClick={onRotate}>Xoay 90° ({item.rotation ?? 0}°)</button>
        <button type="button" className="danger" onClick={onDelete}>Xoá</button>
      </div>
    </aside>
  )
}

function loadInitialItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage không khả dụng (chế độ riêng tư, bị chặn...) — bắt đầu trắng.
  }
  return []
}

export default function FloorPlan() {
  const [items, setItems] = useState(loadInitialItems)
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState('')
  const [guides, setGuides] = useState({ x: null, y: null })
  const [view, setView] = useState(() => computeFitViewBox(loadInitialItems()))
  const svgRef = useRef(null)
  const drag = useRef(null)
  const addCount = useRef(0)
  const itemsRef = useRef(items)

  // Tự lưu vào trình duyệt sau mỗi thay đổi — không cần bấm nút nào.
  useEffect(() => {
    itemsRef.current = items
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // bỏ qua nếu trình duyệt chặn localStorage
    }
  }, [items])

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
    const screen = toScreenBox(item)
    const offX = screen.x - item.x
    const offY = screen.y - item.y

    const rawScreenX = cur.x + d.dx + offX
    const rawScreenY = cur.y + d.dy + offY
    const others = items.filter((it) => it.id !== id).map(toScreenBox)
    const { dx, dy, guideX, guideY } = computeAlignSnap(
      { x: rawScreenX, y: rawScreenY, width: screen.width, height: screen.height },
      others,
    )

    let screenX = guideX !== null ? rawScreenX + dx : snap(rawScreenX)
    let screenY = guideY !== null ? rawScreenY + dy : snap(rawScreenY)
    screenX = clamp(screenX, -WORLD_LIMIT, WORLD_LIMIT - screen.width)
    screenY = clamp(screenY, -WORLD_LIMIT, WORLD_LIMIT - screen.height)

    setGuides({ x: guideX, y: guideY })
    updateItem(id, { x: screenX - offX, y: screenY - offY })
  }, [items, toSvgPoint, updateItem])

  // Khung nhìn chỉ co giãn lại SAU khi thả chuột — đóng băng trong lúc kéo/resize
  // để không bị giật hình khi vật thể đang di chuyển gần rìa vùng nhìn hiện tại.
  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    const wasDragging = drag.current !== null
    drag.current = null
    setGuides({ x: null, y: null })
    if (wasDragging) setView(computeFitViewBox(itemsRef.current))
  }, [])

  const handleHandlePointerDown = useCallback((id, corner) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const item = items.find((it) => it.id === id)
    drag.current = { mode: 'resize', id, corner, item }
    setSelectedId(id)
    setStatus('')
  }, [items])

  const handleHandlePointerMove = useCallback((id, corner) => (e) => {
    const d = drag.current
    if (!d || d.mode !== 'resize' || d.id !== id || d.corner !== corner) return
    const cur = toSvgPoint(e.clientX, e.clientY)
    const newScreenBox = resizeBox(toScreenBox(d.item), corner, cur)
    updateItem(id, fromScreenBox(d.item, newScreenBox))
  }, [toSvgPoint, updateItem])

  const handleAdd = useCallback((category, typeId) => {
    const type = typeOf(category, typeId)
    const cascade = (addCount.current % 6) * 60
    addCount.current += 1
    const centerX = view.x + view.w / 2
    const centerY = view.y + view.h / 2
    const newItem = {
      id: `${typeId}-${Date.now()}-${addCount.current}`,
      category,
      type: typeId,
      x: snap(centerX - type.width / 2 + cascade),
      y: snap(centerY - type.height / 2 + cascade),
      width: type.width,
      height: type.height,
      rotation: 0,
    }
    const next = [...items, newItem]
    setItems(next)
    setSelectedId(newItem.id)
    setStatus('')
    setView(computeFitViewBox(next))
  }, [items, view])

  const handleRotate = useCallback(() => {
    if (!selectedId) return
    setItems((prev) => prev.map((it) => (
      it.id === selectedId ? { ...it, rotation: ((it.rotation ?? 0) + 90) % 360 } : it
    )))
  }, [selectedId])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    const next = items.filter((it) => it.id !== selectedId)
    setItems(next)
    setSelectedId(null)
    setView(computeFitViewBox(next))
  }, [selectedId, items])

  const handleSaveFile = useCallback(async () => {
    setStatus('Đang lưu ra file…')
    try {
      const res = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }, null, 2),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('Đã lưu ra src/layout.json')
    } catch {
      setStatus('Không lưu được — chỉ hoạt động khi chạy npm run dev')
    }
  }, [items])

  const handleLoadFile = useCallback(() => {
    const next = fileLayout.items ?? []
    setItems(next)
    setSelectedId(null)
    setStatus('Đã tải lại nội dung từ src/layout.json')
    setView(computeFitViewBox(next))
  }, [])

  const handleClearAll = useCallback(() => {
    if (items.length > 0 && !window.confirm('Xoá toàn bộ bản vẽ hiện tại?')) return
    setItems([])
    setSelectedId(null)
    setStatus('Đã xoá — bắt đầu lại từ trắng')
    setView(DEFAULT_VIEW)
  }, [items.length])

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

  const viewBoxStr = `${view.x} ${view.y} ${view.w} ${view.h}`
  const selectedItem = items.find((it) => it.id === selectedId) ?? null
  const containers = items.filter((it) => it.category === 'container')
  const furniture = items.filter((it) => it.category !== 'container')

  return (
    <div className="plan-shell">
      <div className="plan-toolbar">
        <button type="button" onClick={handleSaveFile}>Lưu ra file</button>
        <button type="button" className="secondary" onClick={handleLoadFile}>Tải từ file</button>
        <button type="button" className="secondary" onClick={handleClearAll}>Xoá hết</button>
        {status && <span className="plan-status">{status}</span>}
      </div>

      <div className="editor-body">
        <ObjectToolbar onAdd={handleAdd} />

        <svg
          ref={svgRef} viewBox={viewBoxStr} width="100%" height="100%"
          style={{ display: 'block' }}
        >
          <GridBackground onPointerDown={() => setSelectedId(null)} />

          {[...containers, ...furniture].map((item) => (
            <g
              key={item.id}
              transform={`translate(${item.x} ${item.y}) rotate(${item.rotation ?? 0} ${item.width / 2} ${item.height / 2})`}
              onPointerDown={handleBodyPointerDown(item.id)}
              onPointerMove={handleBodyPointerMove(item.id)}
              onPointerUp={handlePointerUp}
              style={{ cursor: 'grab', touchAction: 'none' }}
              opacity={drag.current?.id === item.id ? 0.65 : 1}
            >
              <rect x={0} y={0} width={item.width} height={item.height} fill="transparent" />
              <FurnitureShape
                type={item.type} w={item.width} h={item.height}
                color={item.category === 'container' ? WALL_COLOR : FURNITURE_COLOR}
              />
            </g>
          ))}

          {/* ===== Đường kích thước tự động: nội thất <-> cạnh container gần nhất ===== */}
          {furniture.flatMap((item) => computeAutoDims(item, containers)).map(({ dimKey, ...dim }) => (
            <AutoDim key={dimKey} {...dim} />
          ))}

          {/* ===== Đường gióng khoá nhẹ khi đang kéo ===== */}
          <AlignGuides x={guides.x} y={guides.y} view={view} />

          {/* ===== Khung chọn + tay cầm kéo-giãn cho vật thể đang chọn (theo hộp bao màn hình) ===== */}
          {selectedItem && (
            <g pointerEvents="none">
              <rect
                x={toScreenBox(selectedItem).x} y={toScreenBox(selectedItem).y}
                width={toScreenBox(selectedItem).width} height={toScreenBox(selectedItem).height}
                fill="none" stroke={SELECT_COLOR} strokeWidth={5} strokeDasharray="24 16"
              />
            </g>
          )}
          {selectedItem && CORNERS.map(({ id: corner, cursor }) => {
            const p = cornerPoint(toScreenBox(selectedItem), corner)
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
