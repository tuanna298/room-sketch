// Danh mục nội thất: mỗi loại chỉ định nghĩa tỉ lệ khối hình học mặc định
// (width x height, đơn vị mm) và một hàm vẽ theo toạ độ cục bộ (0,0) -> (width,height).
// Không có kích thước nào bị đóng cứng khi hiển thị trên bản vẽ — toolbar chỉ cấp
// kích thước khởi tạo, người dùng chỉnh lại tự do bằng cách kéo góc hoặc nhập số
// trong bảng thuộc tính.

export const MIN_SIZE = 100 // mm — kích thước nhỏ nhất khi thu nhỏ một đối tượng
const CONTAINER_STROKE = 20 // mm — viền container cố định, không phình theo kích thước

export const FURNITURE_TYPES = [
  { id: 'bed', label: 'Giường', width: 1600, height: 2000 },
  { id: 'table', label: 'Bàn', width: 1200, height: 700 },
  { id: 'chair', label: 'Ghế', width: 450, height: 450 },
  { id: 'door', label: 'Cửa', width: 800, height: 800 },
  { id: 'wardrobe', label: 'Tủ', width: 1000, height: 600 },
  { id: 'sofa', label: 'Sofa', width: 1800, height: 800 },
  { id: 'tv-cabinet', label: 'Kệ tivi', width: 1200, height: 400 },
  { id: 'sink', label: 'Bồn rửa', width: 600, height: 500 },
  { id: 'toilet', label: 'Bồn cầu', width: 400, height: 600 },
  { id: 'plant', label: 'Chậu cây', width: 400, height: 400 },
  { id: 'drawer', label: 'Hộc tủ', width: 800, height: 450 },
  { id: 'bookshelf', label: 'Kệ sách', width: 900, height: 350 },
  { id: 'mirror', label: 'Gương', width: 700, height: 60 },
]

export function furnitureType(id) {
  return FURNITURE_TYPES.find((t) => t.id === id) ?? FURNITURE_TYPES[0]
}

// "Container" là khối hình học cố định (tường bao căn phòng, cột, hộp kỹ thuật...).
// Không đại diện cho một vật thể cụ thể nào — cùng một hình chữ nhật, kéo lớn ra
// thì dùng làm ranh giới căn phòng, thu nhỏ lại thì dùng làm cột hoặc hộp gen.
// Đây là đối tượng duy nhất được dùng làm mốc cho các đường kích thước tự động.
export const CONTAINER_TYPES = [
  { id: 'room', label: 'Phòng / Tường', width: 3000, height: 3000, category: 'container' },
  { id: 'column', label: 'Cột', width: 300, height: 300, category: 'container' },
]

export function containerType(id) {
  return CONTAINER_TYPES.find((t) => t.id === id) ?? CONTAINER_TYPES[0]
}

export function typeOf(category, id) {
  return category === 'container' ? containerType(id) : furnitureType(id)
}

// Vẽ hình dạng của một loại nội thất trong hệ toạ độ cục bộ 0..w, 0..h.
// Mọi tỉ lệ bên trong đều tính theo w/h nên co giãn theo đúng kích thước hiện tại.
// Riêng container dùng viền dày cố định (CONTAINER_STROKE) thay vì phình theo
// kích thước — một căn phòng 6m không nên có tường dày gấp đôi phòng 3m.
export function FurnitureShape({ type, w, h, color }) {
  const isContainer = type === 'room' || type === 'column'
  const common = {
    stroke: color,
    strokeWidth: isContainer ? CONTAINER_STROKE : Math.max(4, Math.min(w, h) * 0.02),
    fill: 'none',
  }

  switch (type) {
    case 'bed': {
      const pillowW = w * 0.42
      const pillowH = h * 0.14
      const gap = w * 0.06
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <rect x={w * 0.06} y={h * 0.06} width={pillowW} height={pillowH} />
          <rect x={w * 0.06 + pillowW + gap} y={h * 0.06} width={pillowW} height={pillowH} />
          <line x1={0} y1={h * 0.32} x2={w} y2={h * 0.32} />
        </g>
      )
    }
    case 'table':
      return <rect {...common} x={0} y={0} width={w} height={h} rx={Math.min(w, h) * 0.05} />
    case 'chair':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <rect x={0} y={0} width={w} height={h * 0.16} fill={color} opacity={0.6} />
        </g>
      )
    case 'door':
      return (
        <g {...common}>
          <line x1={0} y1={0} x2={0} y2={h} />
          <path d={`M 0 ${h} A ${w} ${h} 0 0 0 ${w} 0`} />
        </g>
      )
    case 'wardrobe':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
          <line x1={w * 0.46} y1={h * 0.45} x2={w * 0.46} y2={h * 0.55} />
          <line x1={w * 0.54} y1={h * 0.45} x2={w * 0.54} y2={h * 0.55} />
        </g>
      )
    case 'sofa':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <rect x={0} y={0} width={w} height={h * 0.28} />
          <line x1={w / 3} y1={h * 0.28} x2={w / 3} y2={h} />
          <line x1={(2 * w) / 3} y1={h * 0.28} x2={(2 * w) / 3} y2={h} />
        </g>
      )
    case 'tv-cabinet':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <line x1={w / 3} y1={0} x2={w / 3} y2={h} />
          <line x1={(2 * w) / 3} y1={0} x2={(2 * w) / 3} y2={h} />
        </g>
      )
    case 'sink':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.35} ry={h * 0.32} />
        </g>
      )
    case 'toilet': {
      const tankH = h * 0.25
      const bowlTop = tankH
      const bowlH = h - tankH
      const rx = w / 2
      const ry = bowlH * 0.8
      const archY = bowlTop + bowlH - ry
      return (
        <g {...common}>
          <rect x={w * 0.1} y={0} width={w * 0.8} height={tankH} />
          <path
            d={`M 0 ${bowlTop} L 0 ${archY} A ${rx} ${ry} 0 0 0 ${w} ${archY} L ${w} ${bowlTop}`}
          />
        </g>
      )
    }
    case 'plant': {
      const r = Math.min(w, h) / 2
      const cx = w / 2
      const cy = h / 2
      const leaf = (angle) => {
        const rad = (angle * Math.PI) / 180
        const x2 = cx + Math.cos(rad) * r * 0.85
        const y2 = cy + Math.sin(rad) * r * 0.85
        return <line key={angle} x1={cx} y1={cy} x2={x2} y2={y2} />
      }
      return (
        <g {...common}>
          <ellipse cx={cx} cy={cy} rx={r} ry={r} />
          <ellipse cx={cx} cy={cy} rx={r * 0.55} ry={r * 0.55} />
          {[-140, -90, -40, -160].map(leaf)}
        </g>
      )
    }
    case 'drawer': {
      const rows = 3
      const lines = []
      for (let i = 1; i < rows; i += 1) {
        const y = (h * i) / rows
        lines.push(<line key={i} x1={0} y1={y} x2={w} y2={y} />)
      }
      const handles = []
      for (let i = 0; i < rows; i += 1) {
        const cy = (h * (i + 0.5)) / rows
        handles.push(<line key={`h${i}`} x1={w * 0.4} y1={cy} x2={w * 0.6} y2={cy} />)
      }
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          {lines}
          {handles}
        </g>
      )
    }
    case 'bookshelf':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <line x1={w / 3} y1={0} x2={w / 3} y2={h} />
          <line x1={(2 * w) / 3} y1={0} x2={(2 * w) / 3} y2={h} />
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} />
        </g>
      )
    case 'mirror':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} />
          <line x1={0} y1={0} x2={w} y2={h} />
          <line x1={0} y1={h} x2={w} y2={0} />
        </g>
      )
    case 'room':
      return <rect {...common} x={0} y={0} width={w} height={h} />
    case 'column':
      return (
        <g {...common}>
          <rect x={0} y={0} width={w} height={h} fill={color} opacity={0.35} />
          <line x1={0} y1={0} x2={w} y2={h} />
          <line x1={w} y1={0} x2={0} y2={h} />
        </g>
      )
    default:
      return <rect {...common} x={0} y={0} width={w} height={h} />
  }
}
