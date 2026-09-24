import { useCallback, useEffect, useRef, useState } from 'react'
import fileLayout from './layout.json'
import { FURNITURE_TYPES, CONTAINER_TYPES, MIN_SIZE, FurnitureShape, typeOf } from './furniture'

// Không có căn phòng đóng cứng nào — "container" (khối tường / cột) là một đối
// tượng như bao đối tượng khác, do người dùng thêm và kéo-giãn để dựng ranh giới
// phòng hoặc đánh dấu vật cản cố định. Đường kích thước tự xuất hiện giữa một món
// nội thất và cạnh container gần nhất. Có thể gộp nhiều vật thể thành một nhóm để
// kéo/xoá cùng lúc, có khoá nhẹ khi kéo lại gần vật khác, và đầy đủ phím tắt quen
// thuộc (Cmd/Ctrl+Z/A/C/X/V/D/G). Toàn bộ trạng thái tự lưu vào localStorage.

const WALL_COLOR = '#e8e8e8'
const FURNITURE_COLOR = '#c98a4b'
const DIM_COLOR = '#39d353'
const SELECT_COLOR = '#5ab8ff'
const GUIDE_COLOR = '#ff5ac8'
const MARQUEE_COLOR = '#5ab8ff'

const GRID_SPAN = 20000
const WORLD_LIMIT = 20000
const DEFAULT_VIEW = { x: -500, y: -500, w: 4000, h: 3000 }
const FIT_PADDING = 600
const FIT_MIN_W = 3000
const FIT_MIN_H = 2400

const DEFAULT_GRID = 400 // mm — kích cỡ mỗi ô lưới, ánh xạ theo ô gạch thực tế
const MIN_GRID = 50
const MAX_GRID = 2000
const GRID_MAJOR_MULT = 4 // đường lưới đậm cứ mỗi 4 ô

const RESIZE_SNAP = 10 // mm — làm tròn khi kéo góc/tay cầm
const HANDLE_SIZE = 70 // mm — kích thước ô vuông tay cầm ở góc
const ALIGN_SNAP = 60 // mm — "khoá nhẹ" khi cạnh/tâm vật thể gần trùng vật khác
const AUTO_DIM_THRESHOLD = 300 // mm — hiện đường kích thước nếu cách container trong khoảng này
const AUTO_DIM_EPS = 2 // mm — dung sai nổi dấu phẩy động, tránh mất hiển thị khi khoảng cách ~0
const NUDGE_STEP = 10 // mm — phím mũi tên
const HISTORY_LIMIT = 60

const STORAGE_KEY = 'floorplan-state-v2'

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function roundTo(v, step) {
  return Math.round(v / step) * step
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
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

function fromScreenBox(rotation, screenBox) {
  if ((rotation ?? 0) % 180 === 90) {
    const cx = screenBox.x + screenBox.width / 2
    const cy = screenBox.y + screenBox.height / 2
    const width = screenBox.height
    const height = screenBox.width
    return { x: cx - width / 2, y: cy - height / 2, width, height }
  }
  return { x: screenBox.x, y: screenBox.y, width: screenBox.width, height: screenBox.height }
}

function boundsOf(boxes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function boxesIntersect(a, b) {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

// "Phòng / Tường" chỉ có viền mỏng về mặt hiển thị, nhưng vẫn là một hình chữ nhật
// đặc về mặt dữ liệu (x,y,width,height) — nếu dùng giao-bbox thông thường, một khung
// marquee kéo GỌN TRONG LÒNG phòng (không chạm tường) sẽ vô tình "trúng" luôn cả
// phòng. Nên với loại 'room', chỉ tính là trúng khi khung kéo thực sự chạm dải viền
// (cùng bề rộng hit-area với lúc bấm chọn/kéo — xem ROOM_BORDER_HIT).
const ROOM_BORDER_HIT = 80 // mm — nửa bề rộng dải viền bắt marquee (khớp strokeWidth=160 lúc kéo)

function marqueeHitsItem(item, rect) {
  const box = toScreenBox(item)
  if (!boxesIntersect(box, rect)) return false
  if (item.type !== 'room') return true
  const pad = ROOM_BORDER_HIT
  const inner = {
    x: box.x + pad, y: box.y + pad,
    width: Math.max(0, box.width - pad * 2), height: Math.max(0, box.height - pad * 2),
  }
  const fullyInsideInner = rect.x >= inner.x && rect.y >= inner.y
    && rect.x + rect.width <= inner.x + inner.width && rect.y + rect.height <= inner.y + inner.height
  return !fullyInsideInner
}

// Khung nhìn tự co theo các đối tượng hiện có (giống "zoom to fit"), luôn chừa
// FIT_PADDING mm quanh mép ngoài cùng và không bao giờ nhỏ hơn FIT_MIN_W x FIT_MIN_H.
function computeFitViewBox(list) {
  if (!list.length) return DEFAULT_VIEW
  const b = boundsOf(list.map(toScreenBox))
  const w = Math.max(FIT_MIN_W, b.width)
  const h = Math.max(FIT_MIN_H, b.height)
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
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
  return { x: roundTo(x, RESIZE_SNAP), y: roundTo(y, RESIZE_SNAP), width: roundTo(width, RESIZE_SNAP), height: roundTo(height, RESIZE_SNAP) }
}

function edgesOf(box) {
  return {
    xs: [box.x, box.x + box.width / 2, box.x + box.width],
    ys: [box.y, box.y + box.height / 2, box.y + box.height],
  }
}

// "Khoá nhẹ": khi kéo một vật thể, nếu cạnh trái/phải/tâm hoặc trên/dưới/tâm của nó
// nằm trong ALIGN_SNAP mm so với một vật thể khác (container hoặc nội thất), hút
// đúng vào vị trí đó thay vì chỉ làm tròn theo lưới.
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
// mm) để phát sinh đường kích thước tự động. AUTO_DIM_EPS bù sai số dấu phẩy động khi
// khoảng cách thực chất là 0 (vd. vừa khoá nhẹ vào đúng cạnh tường).
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
      if (gapTop >= -AUTO_DIM_EPS && gapTop <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-top`, axis: 'v', x1: midX, y1: cBox.y, x2: midX, y2: itemBox.y, label: Math.max(0, Math.round(gapTop)) })
      }
      const gapBottom = cBox.y + cBox.height - (itemBox.y + itemBox.height)
      if (gapBottom >= -AUTO_DIM_EPS && gapBottom <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-bottom`, axis: 'v', x1: midX, y1: itemBox.y + itemBox.height, x2: midX, y2: cBox.y + cBox.height, label: Math.max(0, Math.round(gapBottom)) })
      }
    }
    if (overlapY > 0) {
      const midY = Math.max(itemBox.y, cBox.y) + overlapY / 2
      const gapLeft = itemBox.x - cBox.x
      if (gapLeft >= -AUTO_DIM_EPS && gapLeft <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-left`, axis: 'h', x1: cBox.x, y1: midY, x2: itemBox.x, y2: midY, label: Math.max(0, Math.round(gapLeft)) })
      }
      const gapRight = cBox.x + cBox.width - (itemBox.x + itemBox.width)
      if (gapRight >= -AUTO_DIM_EPS && gapRight <= AUTO_DIM_THRESHOLD) {
        dims.push({ dimKey: `${item.id}-${c.id}-right`, axis: 'h', x1: itemBox.x + itemBox.width, y1: midY, x2: cBox.x + cBox.width, y2: midY, label: Math.max(0, Math.round(gapRight)) })
      }
    }
  }
  return dims
}

function AutoDim({ x1, y1, x2, y2, axis, label }) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const tick = 34
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM_COLOR} strokeWidth={4} />
      {axis === 'v' ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke={DIM_COLOR} strokeWidth={4} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke={DIM_COLOR} strokeWidth={4} />
          <text x={midX + 20} y={midY} fill={DIM_COLOR} fontSize={70}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" dominantBaseline="middle">{label}</text>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke={DIM_COLOR} strokeWidth={4} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke={DIM_COLOR} strokeWidth={4} />
          <text x={midX} y={midY - 20} fill={DIM_COLOR} fontSize={70}
            fontFamily="'JetBrains Mono', ui-monospace, monospace" textAnchor="middle">{label}</text>
        </>
      )}
    </g>
  )
}

function AlignGuides({ x, y, view }) {
  const w = Math.max(3, view.w * 0.0006)
  return (
    <g pointerEvents="none">
      {x !== null && (
        <line x1={x} y1={view.y} x2={x} y2={view.y + view.h} stroke={GUIDE_COLOR} strokeWidth={w} strokeDasharray="20 14" />
      )}
      {y !== null && (
        <line x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke={GUIDE_COLOR} strokeWidth={w} strokeDasharray="20 14" />
      )}
    </g>
  )
}

function GridBackground({ gridSize, onPointerDown, onPointerMove, onPointerUp }) {
  const major = gridSize * GRID_MAJOR_MULT
  return (
    <>
      <defs>
        <pattern id="grid-minor" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#182018" strokeWidth={2} />
        </pattern>
        <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
          <rect width={major} height={major} fill="url(#grid-minor)" />
          <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#2a4632" strokeWidth={3} />
        </pattern>
      </defs>
      <rect
        x={-GRID_SPAN} y={-GRID_SPAN} width={GRID_SPAN * 2} height={GRID_SPAN * 2}
        fill="url(#grid-major)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: 'none' }}
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

// Input số "mềm": cho gõ tự do (chọn hết, xoá, gõ lại) — chỉ ép kiểu + giới hạn min
// khi rời khỏi ô (blur) hoặc bấm Enter, không phải trên từng phím gõ.
function NumberField({ label, value, step = 1, min = -100000, onCommit }) {
  const [text, setText] = useState(String(Math.round(value)))
  const editingRef = useRef(false)

  useEffect(() => {
    if (!editingRef.current) setText(String(Math.round(value)))
  }, [value])

  const commit = () => {
    editingRef.current = false
    const v = Number(text)
    if (text.trim() !== '' && !Number.isNaN(v)) {
      onCommit(clamp(v, min, 100000))
    } else {
      setText(String(Math.round(value)))
    }
  }

  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        onFocus={() => { editingRef.current = true }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setText(String(Math.round(value))); e.currentTarget.blur() }
        }}
      />
    </label>
  )
}

function SinglePropertiesPanel({ item, onChange, onRotate, onUngroup, onDelete }) {
  const type = typeOf(item.category, item.type)
  return (
    <>
      <h3>{type.label}</h3>
      <div className="prop-grid">
        <NumberField label="X (mm)" value={item.x} step={RESIZE_SNAP} onCommit={(v) => onChange({ x: v })} />
        <NumberField label="Y (mm)" value={item.y} step={RESIZE_SNAP} onCommit={(v) => onChange({ y: v })} />
        <NumberField label="Rộng (mm)" value={item.width} step={RESIZE_SNAP} min={MIN_SIZE} onCommit={(v) => onChange({ width: v })} />
        <NumberField label="Cao (mm)" value={item.height} step={RESIZE_SNAP} min={MIN_SIZE} onCommit={(v) => onChange({ height: v })} />
      </div>
      <div className="prop-actions">
        <button type="button" onClick={onRotate}>Xoay 90° ({item.rotation ?? 0}°)</button>
        {item.groupId && <button type="button" onClick={onUngroup}>Rã nhóm</button>}
        <button type="button" className="danger" onClick={onDelete}>Xoá</button>
      </div>
    </>
  )
}

function MultiPropertiesPanel({ count, box, isGroup, onMove, onRotateEach, onGroup, onUngroup, onDelete }) {
  return (
    <>
      <h3>{isGroup ? `Nhóm (${count} vật thể)` : `${count} vật thể đã chọn`}</h3>
      <div className="prop-grid">
        <NumberField label="X (mm)" value={box.x} step={RESIZE_SNAP} onCommit={(v) => onMove(v - box.x, 0)} />
        <NumberField label="Y (mm)" value={box.y} step={RESIZE_SNAP} onCommit={(v) => onMove(0, v - box.y)} />
        <div className="prop-field">
          <span>Kích thước tổng</span>
          <div className="prop-readonly">{Math.round(box.width)} × {Math.round(box.height)}</div>
        </div>
      </div>
      <div className="prop-actions">
        {isGroup ? (
          <button type="button" onClick={onUngroup}>Rã nhóm</button>
        ) : (
          <button type="button" onClick={onGroup}>Nhóm lại</button>
        )}
        <button type="button" onClick={onRotateEach}>Xoay từng món 90°</button>
        <button type="button" className="danger" onClick={onDelete}>Xoá tất cả</button>
      </div>
    </>
  )
}

function GridSizeControl({ value, onChange }) {
  const [text, setText] = useState(String(value))
  const editingRef = useRef(false)
  useEffect(() => { if (!editingRef.current) setText(String(value)) }, [value])
  const commit = () => {
    editingRef.current = false
    const v = Number(text)
    if (!Number.isNaN(v) && text.trim() !== '') onChange(clamp(Math.round(v), MIN_GRID, MAX_GRID))
    else setText(String(value))
  }
  return (
    <label className="grid-size-field">
      <span>Ô lưới</span>
      <input
        type="number" value={text} step={50}
        onFocus={() => { editingRef.current = true }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <span>mm</span>
    </label>
  )
}

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return { items: parsed, gridSize: DEFAULT_GRID }
      return { items: parsed.items ?? [], gridSize: parsed.gridSize ?? DEFAULT_GRID }
    }
  } catch {
    // localStorage không khả dụng (chế độ riêng tư, bị chặn...) — bắt đầu trắng.
  }
  return { items: [], gridSize: DEFAULT_GRID }
}

function fileItems() {
  if (Array.isArray(fileLayout)) return fileLayout
  return fileLayout.items ?? []
}

export default function FloorPlan() {
  const initialState = useRef(loadInitialState()).current
  const [items, setItems] = useState(initialState.items)
  const [gridSize, setGridSize] = useState(initialState.gridSize)
  const [selectedIds, setSelectedIds] = useState([])
  const [status, setStatus] = useState('')
  const [guides, setGuides] = useState({ x: null, y: null })
  const [marquee, setMarquee] = useState(null)
  const [view, setView] = useState(() => computeFitViewBox(initialState.items))
  const svgRef = useRef(null)
  const drag = useRef(null)
  const marqueeDrag = useRef(null)
  const addCount = useRef(0)
  const itemsRef = useRef(items)
  const clipboard = useRef([])
  const past = useRef([])
  const future = useRef([])

  useEffect(() => {
    itemsRef.current = items
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ gridSize, items }))
    } catch {
      // bỏ qua nếu trình duyệt chặn localStorage
    }
  }, [items, gridSize])

  const pushHistory = useCallback(() => {
    past.current = [...past.current.slice(-HISTORY_LIMIT + 1), itemsRef.current]
    future.current = []
  }, [])

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    const prev = past.current[past.current.length - 1]
    past.current = past.current.slice(0, -1)
    future.current = [itemsRef.current, ...future.current].slice(0, HISTORY_LIMIT)
    setItems(prev)
    setSelectedIds([])
    setView(computeFitViewBox(prev))
    setStatus('')
  }, [])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    const next = future.current[0]
    future.current = future.current.slice(1)
    past.current = [...past.current, itemsRef.current].slice(-HISTORY_LIMIT)
    setItems(next)
    setSelectedIds([])
    setView(computeFitViewBox(next))
    setStatus('')
  }, [])

  const toSvgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }, [])

  const groupMembersOf = useCallback((item) => {
    if (!item.groupId) return [item.id]
    return items.filter((it) => it.groupId === item.groupId).map((it) => it.id)
  }, [items])

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  // ===== Kéo di chuyển (đơn lẻ, nhóm, hoặc nhiều vật thể đang chọn cùng lúc) =====
  const handleBodyPointerDown = useCallback((id) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const clicked = items.find((it) => it.id === id)
    let nextSelection
    if (e.shiftKey) {
      const members = groupMembersOf(clicked)
      const allIn = members.every((m) => selectedIds.includes(m))
      nextSelection = allIn ? selectedIds.filter((s) => !members.includes(s)) : [...new Set([...selectedIds, ...members])]
    } else if (selectedIds.includes(id)) {
      nextSelection = selectedIds
    } else {
      nextSelection = groupMembersOf(clicked)
    }
    setSelectedIds(nextSelection)
    const start = toSvgPoint(e.clientX, e.clientY)
    const startItems = items.filter((it) => nextSelection.includes(it.id)).map((it) => ({ id: it.id, x: it.x, y: it.y }))
    drag.current = { mode: 'move', anchorId: id, startPointer: start, startItems, historyPushed: false }
    setStatus('')
  }, [items, selectedIds, groupMembersOf, toSvgPoint])

  const handleBodyPointerMove = useCallback((id) => (e) => {
    const d = drag.current
    if (!d || d.mode !== 'move' || d.anchorId !== id) return
    if (!d.historyPushed) { pushHistory(); d.historyPushed = true }
    const cur = toSvgPoint(e.clientX, e.clientY)
    const anchorStart = d.startItems.find((s) => s.id === id)
    const anchorItem = itemsRef.current.find((it) => it.id === id)
    const anchorScreen = toScreenBox({ ...anchorItem, x: anchorStart.x, y: anchorStart.y })
    const offX = anchorScreen.x - anchorStart.x
    const offY = anchorScreen.y - anchorStart.y

    const dxWorld = cur.x - d.startPointer.x
    const dyWorld = cur.y - d.startPointer.y
    const rawScreenX = anchorStart.x + dxWorld + offX
    const rawScreenY = anchorStart.y + dyWorld + offY

    const movingIds = new Set(d.startItems.map((s) => s.id))
    const others = itemsRef.current.filter((it) => !movingIds.has(it.id)).map(toScreenBox)
    const { dx, dy, guideX, guideY } = computeAlignSnap(
      { x: rawScreenX, y: rawScreenY, width: anchorScreen.width, height: anchorScreen.height },
      others,
    )

    let screenX = guideX !== null ? rawScreenX + dx : roundTo(rawScreenX, gridSize)
    let screenY = guideY !== null ? rawScreenY + dy : roundTo(rawScreenY, gridSize)
    screenX = clamp(screenX, -WORLD_LIMIT, WORLD_LIMIT - anchorScreen.width)
    screenY = clamp(screenY, -WORLD_LIMIT, WORLD_LIMIT - anchorScreen.height)

    const finalDX = screenX - offX - anchorStart.x
    const finalDY = screenY - offY - anchorStart.y

    setGuides({ x: guideX, y: guideY })
    setItems((prev) => prev.map((it) => {
      const s = d.startItems.find((st) => st.id === it.id)
      return s ? { ...it, x: s.x + finalDX, y: s.y + finalDY } : it
    }))
  }, [gridSize, toSvgPoint, pushHistory])

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    const wasDragging = drag.current !== null
    drag.current = null
    setGuides({ x: null, y: null })
    if (wasDragging) setView(computeFitViewBox(itemsRef.current))
  }, [])

  // ===== Kéo góc: co giãn hộp bao của TOÀN BỘ lựa chọn hiện tại (1 vật hoặc cả nhóm) =====
  const handleHandlePointerDown = useCallback((corner) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const selected = items.filter((it) => selectedIds.includes(it.id))
    const startBox = boundsOf(selected.map(toScreenBox))
    const startItems = selected.map((it) => ({ id: it.id, screen: toScreenBox(it), rotation: it.rotation ?? 0 }))
    drag.current = { mode: 'resize', corner, startBox, startItems, historyPushed: false }
    setStatus('')
  }, [items, selectedIds])

  const handleHandlePointerMove = useCallback((corner) => (e) => {
    const d = drag.current
    if (!d || d.mode !== 'resize' || d.corner !== corner) return
    if (!d.historyPushed) { pushHistory(); d.historyPushed = true }
    const cur = toSvgPoint(e.clientX, e.clientY)
    const newBox = resizeBox(d.startBox, corner, cur)
    setItems((prev) => prev.map((it) => {
      const s = d.startItems.find((st) => st.id === it.id)
      if (!s) return it
      const relX = d.startBox.width === 0 ? 0 : (s.screen.x - d.startBox.x) / d.startBox.width
      const relY = d.startBox.height === 0 ? 0 : (s.screen.y - d.startBox.y) / d.startBox.height
      const relW = d.startBox.width === 0 ? 1 : s.screen.width / d.startBox.width
      const relH = d.startBox.height === 0 ? 1 : s.screen.height / d.startBox.height
      const newScreen = {
        x: newBox.x + relX * newBox.width,
        y: newBox.y + relY * newBox.height,
        width: Math.max(MIN_SIZE, relW * newBox.width),
        height: Math.max(MIN_SIZE, relH * newBox.height),
      }
      return { ...it, ...fromScreenBox(s.rotation, newScreen) }
    }))
  }, [toSvgPoint, pushHistory])

  // ===== Chọn theo khung kéo (marquee) trên nền lưới trống =====
  const handleGridPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const start = toSvgPoint(e.clientX, e.clientY)
    marqueeDrag.current = { start, moved: false, pointerId: e.pointerId }
    setMarquee({ x: start.x, y: start.y, width: 0, height: 0 })
  }, [toSvgPoint])

  const handleGridPointerMove = useCallback((e) => {
    const m = marqueeDrag.current
    if (!m) return
    const cur = toSvgPoint(e.clientX, e.clientY)
    const dx = cur.x - m.start.x
    const dy = cur.y - m.start.y
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) m.moved = true
    setMarquee({
      x: Math.min(m.start.x, cur.x), y: Math.min(m.start.y, cur.y),
      width: Math.abs(dx), height: Math.abs(dy),
    })
  }, [toSvgPoint])

  const handleGridPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    const m = marqueeDrag.current
    marqueeDrag.current = null
    const rect = marquee
    setMarquee(null)
    if (!m) return
    if (!m.moved) {
      setSelectedIds([])
      return
    }
    const hits = itemsRef.current.filter((it) => marqueeHitsItem(it, rect))
    const ids = new Set()
    for (const it of hits) for (const mid of groupMembersOf(it)) ids.add(mid)
    setSelectedIds([...ids])
  }, [marquee, groupMembersOf])

  const centerOfView = useCallback(() => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 }), [view])

  const handleAdd = useCallback((category, typeId) => {
    pushHistory()
    const type = typeOf(category, typeId)
    const cascade = (addCount.current % 6) * 60
    addCount.current += 1
    const center = centerOfView()
    const newItem = {
      id: uid(typeId),
      category,
      type: typeId,
      x: roundTo(center.x - type.width / 2 + cascade, RESIZE_SNAP),
      y: roundTo(center.y - type.height / 2 + cascade, RESIZE_SNAP),
      width: type.width,
      height: type.height,
      rotation: 0,
    }
    const next = [...items, newItem]
    setItems(next)
    setSelectedIds([newItem.id])
    setStatus('')
    setView(computeFitViewBox(next))
  }, [items, centerOfView, pushHistory])

  const rotateIds = useCallback((ids) => {
    pushHistory()
    setItems((prev) => prev.map((it) => (
      ids.includes(it.id) ? { ...it, rotation: ((it.rotation ?? 0) + 90) % 360 } : it
    )))
  }, [pushHistory])

  const deleteIds = useCallback((ids) => {
    if (ids.length === 0) return
    pushHistory()
    const next = items.filter((it) => !ids.includes(it.id))
    setItems(next)
    setSelectedIds([])
    setView(computeFitViewBox(next))
  }, [items, pushHistory])

  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return
    pushHistory()
    const gid = uid('group')
    setItems((prev) => prev.map((it) => (selectedIds.includes(it.id) ? { ...it, groupId: gid } : it)))
  }, [selectedIds, pushHistory])

  const ungroupSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    pushHistory()
    setItems((prev) => prev.map((it) => {
      if (!selectedIds.includes(it.id)) return it
      const { groupId, ...rest } = it
      return rest
    }))
  }, [selectedIds, pushHistory])

  const moveSelection = useCallback((dxWorld, dyWorld) => {
    if (selectedIds.length === 0) return
    pushHistory()
    setItems((prev) => prev.map((it) => (
      selectedIds.includes(it.id) ? { ...it, x: it.x + dxWorld, y: it.y + dyWorld } : it
    )))
  }, [selectedIds, pushHistory])

  const copySelection = useCallback(() => {
    if (selectedIds.length === 0) return
    clipboard.current = items.filter((it) => selectedIds.includes(it.id)).map((it) => ({ ...it }))
    setStatus(`Đã copy ${clipboard.current.length} đối tượng`)
  }, [items, selectedIds])

  const pasteClipboard = useCallback(() => {
    if (clipboard.current.length === 0) return
    pushHistory()
    const offset = gridSize / 2
    const idMap = new Map()
    const groupMap = new Map()
    const pasted = clipboard.current.map((it) => {
      const newId = uid(it.type)
      idMap.set(it.id, newId)
      let groupId
      if (it.groupId) {
        if (!groupMap.has(it.groupId)) groupMap.set(it.groupId, uid('group'))
        groupId = groupMap.get(it.groupId)
      }
      return { ...it, id: newId, x: it.x + offset, y: it.y + offset, groupId }
    })
    const next = [...items, ...pasted]
    setItems(next)
    setSelectedIds(pasted.map((it) => it.id))
    setView(computeFitViewBox(next))
    setStatus(`Đã dán ${pasted.length} đối tượng`)
  }, [items, gridSize, pushHistory])

  const duplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    pushHistory()
    const offset = gridSize / 2
    const groupMap = new Map()
    const source = items.filter((it) => selectedIds.includes(it.id))
    const dup = source.map((it) => {
      const newId = uid(it.type)
      let groupId
      if (it.groupId) {
        if (!groupMap.has(it.groupId)) groupMap.set(it.groupId, uid('group'))
        groupId = groupMap.get(it.groupId)
      }
      return { ...it, id: newId, x: it.x + offset, y: it.y + offset, groupId }
    })
    const next = [...items, ...dup]
    setItems(next)
    setSelectedIds(dup.map((it) => it.id))
    setView(computeFitViewBox(next))
    setStatus(`Đã nhân đôi ${dup.length} đối tượng`)
  }, [items, selectedIds, gridSize, pushHistory])

  const handleSaveFile = useCallback(async () => {
    setStatus('Đang lưu ra file…')
    try {
      const res = await fetch('/api/save-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridSize, items }, null, 2),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('Đã lưu ra src/layout.json')
    } catch {
      setStatus('Không lưu được — chỉ hoạt động khi chạy npm run dev')
    }
  }, [items, gridSize])

  const handleLoadFile = useCallback(() => {
    pushHistory()
    const next = fileItems()
    setItems(next)
    if (!Array.isArray(fileLayout) && fileLayout.gridSize) setGridSize(fileLayout.gridSize)
    setSelectedIds([])
    setStatus('Đã tải lại nội dung từ src/layout.json')
    setView(computeFitViewBox(next))
  }, [pushHistory])

  const handleClearAll = useCallback(() => {
    if (items.length > 0 && !window.confirm('Xoá toàn bộ bản vẽ hiện tại?')) return
    pushHistory()
    setItems([])
    setSelectedIds([])
    setStatus('Đã xoá — bắt đầu lại từ trắng')
    setView(DEFAULT_VIEW)
  }, [items.length, pushHistory])

  // ===== Phím tắt =====
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelectedIds(itemsRef.current.map((it) => it.id)); return }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return }
      if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelection(); deleteIds(selectedIds); return }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected(); else groupSelected()
        return
      }
      if (e.key === 'Escape') { setSelectedIds([]); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteIds(selectedIds); return }
      if (e.key.startsWith('Arrow')) {
        if (selectedIds.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? gridSize : NUDGE_STEP
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (delta) moveSelection(delta[0], delta[1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, gridSize, undo, redo, copySelection, deleteIds, pasteClipboard, duplicateSelection, groupSelected, ungroupSelected, moveSelection])

  const viewBoxStr = `${view.x} ${view.y} ${view.w} ${view.h}`
  const selectedItems = items.filter((it) => selectedIds.includes(it.id))
  const selectionBox = selectedItems.length > 0 ? boundsOf(selectedItems.map(toScreenBox)) : null
  const isGroupSelection = selectedItems.length > 1 && selectedItems.every((it) => it.groupId && it.groupId === selectedItems[0].groupId)
  const containers = items.filter((it) => it.category === 'container')
  const furniture = items.filter((it) => it.category !== 'container')

  return (
    <div className="plan-shell">
      <div className="floating-topbar">
        <button type="button" onClick={handleSaveFile}>Lưu ra file</button>
        <button type="button" className="secondary" onClick={handleLoadFile}>Tải từ file</button>
        <button type="button" className="secondary" onClick={handleClearAll}>Xoá hết</button>
        <GridSizeControl value={gridSize} onChange={setGridSize} />
        {status && <span className="plan-status">{status}</span>}
      </div>

      <ObjectToolbar onAdd={handleAdd} />

      <svg
        ref={svgRef} viewBox={viewBoxStr}
        className="floor-canvas"
      >
        <GridBackground
          gridSize={gridSize}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
        />

        {[...containers, ...furniture].map((item) => (
          <g
            key={item.id}
            transform={`translate(${item.x} ${item.y}) rotate(${item.rotation ?? 0} ${item.width / 2} ${item.height / 2})`}
            onPointerDown={handleBodyPointerDown(item.id)}
            onPointerMove={handleBodyPointerMove(item.id)}
            onPointerUp={handlePointerUp}
            style={{ cursor: 'grab', touchAction: 'none' }}
            opacity={drag.current?.mode === 'move' && drag.current.startItems.some((s) => s.id === item.id) ? 0.65 : 1}
          >
            {item.type === 'room' ? (
              // Phòng/tường: chỉ bắt sự kiện ở dải viền (đủ rộng để dễ nắm), để phần
              // giữa trống "xuyên qua" cho marquee-select hoặc nội thất bên trong.
              <rect
                x={0} y={0} width={item.width} height={item.height}
                fill="none" stroke="transparent" strokeWidth={ROOM_BORDER_HIT * 2} pointerEvents="stroke"
              />
            ) : (
              <rect x={0} y={0} width={item.width} height={item.height} fill="transparent" />
            )}
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

        {/* ===== Khung kéo chọn (marquee) ===== */}
        {marquee && (
          <rect
            x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
            fill={MARQUEE_COLOR} fillOpacity={0.12} stroke={MARQUEE_COLOR} strokeWidth={3}
            pointerEvents="none"
          />
        )}

        {/* ===== Khung chọn + tay cầm kéo-giãn cho lựa chọn hiện tại ===== */}
        {selectionBox && (
          <g pointerEvents="none">
            <rect
              x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height}
              fill="none" stroke={SELECT_COLOR} strokeWidth={5} strokeDasharray="24 16"
            />
          </g>
        )}
        {selectionBox && CORNERS.map(({ id: corner, cursor }) => {
          const p = cornerPoint(selectionBox, corner)
          const s = HANDLE_SIZE
          return (
            <rect
              key={corner}
              x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
              fill={SELECT_COLOR} stroke="#08131c" strokeWidth={4}
              style={{ cursor, touchAction: 'none' }}
              onPointerDown={handleHandlePointerDown(corner)}
              onPointerMove={handleHandlePointerMove(corner)}
              onPointerUp={handlePointerUp}
            />
          )
        })}
      </svg>

      <aside className="properties-panel">
        {selectedItems.length === 0 && (
          <p className="properties-empty">
            Chọn một đối tượng trên bản vẽ (hoặc kéo khung để chọn nhiều), hoặc thêm mới
            từ toolbar bên trái để chỉnh sửa thuộc tính.
          </p>
        )}
        {selectedItems.length === 1 && (
          <SinglePropertiesPanel
            item={selectedItems[0]}
            onChange={(patch) => updateItem(selectedItems[0].id, patch)}
            onRotate={() => rotateIds([selectedItems[0].id])}
            onUngroup={ungroupSelected}
            onDelete={() => deleteIds([selectedItems[0].id])}
          />
        )}
        {selectedItems.length > 1 && selectionBox && (
          <MultiPropertiesPanel
            count={selectedItems.length}
            box={selectionBox}
            isGroup={isGroupSelection}
            onMove={(dx, dy) => moveSelection(dx, dy)}
            onRotateEach={() => rotateIds(selectedIds)}
            onGroup={groupSelected}
            onUngroup={ungroupSelected}
            onDelete={() => deleteIds(selectedIds)}
          />
        )}
      </aside>
    </div>
  )
}
