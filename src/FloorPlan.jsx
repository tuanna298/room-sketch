// Bản vẽ mặt bằng được số hoá lại từ bản phác thảo gốc (đơn vị: mm).
// Toạ độ gốc (0,0) đặt tại góc trên-trái của toàn bộ mặt bằng, trục x sang phải, trục y xuống dưới.

const GRID_MINOR = 100 // mm mỗi ô lưới nhỏ
const GRID_MAJOR = 500 // mm mỗi ô lưới lớn (đậm hơn, dễ đếm)

const WALL_COLOR = '#e8e8e8'
const DOOR_COLOR = '#f2f2f2'
const FIXTURE_COLOR = '#c98a4b'
const DIM_COLOR = '#39d353'
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

function Wall({ x1, y1, x2, y2 }) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={WALL_COLOR}
      strokeWidth={WALL_WIDTH}
      strokeLinecap="square"
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
    <g>
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
    <g>
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

// Cửa đi bản lề trên, mở xuống dưới (theo mẫu trong bản gốc)
function DoorSwingDown({ hingeX, hingeY, width, color = DOOR_COLOR }) {
  const tipX = hingeX
  const tipY = hingeY + width
  const closedX = hingeX + width
  const closedY = hingeY
  return (
    <g stroke={color} strokeWidth={7} fill="none">
      <line x1={hingeX} y1={hingeY} x2={tipX} y2={tipY} />
      <path d={`M ${tipX} ${tipY} A ${width} ${width} 0 0 0 ${closedX} ${closedY}`} />
    </g>
  )
}

// Cửa đi bản lề trên, mở lên trên (dùng cho phòng C, cửa ở tường dưới mở vào phòng phía trên nó)
function DoorSwingUp({ hingeX, hingeY, width, color = DOOR_COLOR }) {
  const tipX = hingeX
  const tipY = hingeY - width
  const closedX = hingeX + width
  const closedY = hingeY
  return (
    <g stroke={color} strokeWidth={7} fill="none">
      <line x1={hingeX} y1={hingeY} x2={tipX} y2={tipY} />
      <path d={`M ${tipX} ${tipY} A ${width} ${width} 0 0 1 ${closedX} ${closedY}`} />
    </g>
  )
}

// Bồn cầu (ký hiệu đơn giản): két nước + bệ hình chữ U
function ToiletFixture({ cx, cy, color = FIXTURE_COLOR }) {
  const tankW = 220
  const tankH = 70
  const bowlW = 240
  const bowlH = 260
  return (
    <g stroke={color} strokeWidth={6} fill="none">
      <rect x={cx - tankW / 2} y={cy - bowlH / 2 - tankH} width={tankW} height={tankH} />
      <path
        d={`M ${cx - bowlW / 2} ${cy - bowlH / 2}
            L ${cx - bowlW / 2} ${cy + bowlH / 2 - bowlW / 2}
            A ${bowlW / 2} ${bowlW / 2} 0 0 0 ${cx + bowlW / 2} ${cy + bowlH / 2 - bowlW / 2}
            L ${cx + bowlW / 2} ${cy - bowlH / 2}`}
      />
      <line
        x1={cx - bowlW / 2 + 25} y1={cy - bowlH / 2 + 55}
        x2={cx + bowlW / 2 - 25} y2={cy - bowlH / 2 + 55}
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
      <rect x={-2000} y={-2000} width={W + 5000} height={H + 5000} fill="url(#grid-major)" />
    </>
  )
}

export default function FloorPlan() {
  const margin = { top: 420, left: 520, right: 620, bottom: 380 }
  const viewBox = `${-margin.left} ${-margin.top} ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`

  return (
    <svg viewBox={viewBox} width="100%" height="100%" style={{ display: 'block' }}>
      <GridBackground />

      {/* ===== Tường bao và tường ngăn ===== */}
      {/* Bao ngoài */}
      <Wall x1={0} y1={0} x2={W} y2={0} />
      <Wall x1={0} y1={0} x2={0} y2={H} />
      <Wall x1={W} y1={0} x2={W} y2={Y.bottom} />
      <Wall x1={0} y1={H} x2={X.D_edge} y2={H} />
      <Wall x1={X.D_edge} y1={H} x2={W} y2={H} />

      {/* Ngăn phòng A / phòng B (hàng trên) */}
      <Wall x1={X.A_B} y1={0} x2={X.A_B} y2={Y.top_row} />
      {/* Tường dưới hàng trên, từ trái tới đầu phòng C */}
      <Wall x1={0} y1={Y.top_row} x2={X.C_D} y2={Y.top_row} />
      {/* Tường phải phòng C */}
      <Wall x1={X.C_D} y1={Y.top_row} x2={X.C_D} y2={Y.C_bottom} />
      {/* Tường dưới phòng C, nối sang tường phải phòng D */}
      <Wall x1={X.C_D} y1={Y.C_bottom} x2={X.D_edge} y2={Y.C_bottom} />
      <Wall x1={X.D_edge} y1={Y.C_bottom} x2={X.D_edge} y2={H} />

      {/* Cạnh trong của phòng lớn (chỉ vẽ phần không trùng cửa/mở) */}
      <Wall x1={X.BIG_left} y1={Y.top_row} x2={W} y2={Y.top_row} />
      <Wall x1={X.BIG_left} y1={Y.top_row} x2={X.BIG_left} y2={Y.C_bottom} />
      <Wall x1={X.BIG_left} y1={Y.C_bottom} x2={X.BIG_left} y2={H} />

      {/* Vách hộp kỹ thuật cạnh phòng B */}
      <Wall x1={X.A_B} y1={Y.nook} x2={W} y2={Y.nook} />

      {/* ===== Cửa ===== */}
      <DoorSwingDown hingeX={650} hingeY={0} width={700} />
      <DoorSwingDown hingeX={X.A_B + 40} hingeY={Y.nook} width={320} color={FIXTURE_COLOR} />
      <DoorSwingDown hingeX={220} hingeY={Y.top_row} width={420} color={FIXTURE_COLOR} />

      {/* ===== Thiết bị ===== */}
      <ToiletFixture cx={(X.A_B + W) / 2} cy={Y.nook - 300} />
      <Cabinet x={0} y={Y.top_row} width={600} height={620} />
      <BoxFixture x={200} y={Y.C_bottom + 160} width={430} height={430} />

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
  )
}
