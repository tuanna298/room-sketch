import { useCallback, useEffect, useRef, useState } from "react";
import fileLayout from "./layout.json";
import {
  FURNITURE_TYPES,
  CONTAINER_TYPES,
  MIN_SIZE,
  FurnitureShape,
  typeOf,
} from "./furniture";

// Không có căn phòng đóng cứng nào — "container" (khối tường / cột) là một đối
// tượng như bao đối tượng khác, do người dùng thêm và kéo-giãn để dựng ranh giới
// phòng hoặc đánh dấu vật cản cố định. Đường kích thước tự xuất hiện giữa một món
// nội thất và cạnh container gần nhất. Có thể gộp nhiều vật thể thành một nhóm để
// kéo/xoá cùng lúc, có khoá nhẹ khi kéo lại gần vật khác, và đầy đủ phím tắt quen
// thuộc (Cmd/Ctrl+Z/A/C/X/V/D/G). Toàn bộ trạng thái tự lưu: ở dev ghi thẳng
// vào src/layout.json trên đĩa, ở bản deploy tĩnh (không có dev-server) tự
// chuyển sang localStorage của người xem.

const FURNITURE_COLOR = "#c98a4b";
const DIM_COLOR = "#1f9d4d";
const SELECT_COLOR = "#2f80ed";
const GUIDE_COLOR = "#e0369d";
const MARQUEE_COLOR = "#2f80ed";

// Tường/lưới cần đảo màu giữa 2 theme để luôn nổi trên nền (trắng thì vô hình trên
// nền sáng, cần chuyển sẫm màu) — các màu còn lại giữ nguyên vì đọc ổn trên cả hai.
const THEME_COLORS = {
  light: {
    canvasBg: "#f4f4f2",
    wall: "#2b2b2b",
    gridMinor: "#e3e3df",
    gridMajor: "#c7c9c2",
  },
  dark: {
    canvasBg: "#050505",
    wall: "#e8e8e8",
    gridMinor: "#182018",
    gridMajor: "#2a4632",
  },
};
const THEME_STORAGE_KEY = "floorplan-dark-mode";

const GRID_SPAN = 20000;
const WORLD_LIMIT = 20000;
const DEFAULT_VIEW = { x: -500, y: -500, w: 4000, h: 3000 };
const FIT_PADDING = 600;
const FIT_MIN_W = 3000;
const FIT_MIN_H = 2400;

// Thao tác chuột/trackpad kiểu Figma: cuộn để pan, Ctrl/Cmd+cuộn (hoặc pinch trên
// trackpad — trình duyệt tự báo về dưới dạng wheel + ctrlKey) để zoom quanh vị trí
// con trỏ, giữ Space hoặc kéo bằng nút chuột giữa để pan bằng tay.
const MIN_VIEW_W = 300; // mm — zoom vào gần nhất
const MAX_VIEW_W = 40000; // mm — zoom ra xa nhất
const ZOOM_WHEEL_SENSITIVITY = 0.0022;
const ZOOM_KEY_FACTOR = 0.85;

const DEFAULT_GRID = 400; // mm — kích cỡ mỗi ô lưới, ánh xạ theo ô gạch thực tế
const MIN_GRID = 50;
const MAX_GRID = 2000;
const GRID_MAJOR_MULT = 4; // đường lưới đậm cứ mỗi 4 ô

const RESIZE_SNAP = 10; // mm — làm tròn khi kéo góc/tay cầm
const HANDLE_SIZE = 70; // mm — kích thước ô vuông tay cầm ở góc
const ALIGN_SNAP = 60; // mm — "khoá nhẹ" khi cạnh/tâm vật thể gần trùng vật khác
const AUTO_DIM_THRESHOLD = 300; // mm — hiện đường kích thước nếu cách container trong khoảng này
const AUTO_DIM_EPS = 2; // mm — dung sai nổi dấu phẩy động, tránh mất hiển thị khi khoảng cách ~0
const NUDGE_STEP = 10; // mm — phím mũi tên
const HISTORY_LIMIT = 60;
const AUTOSAVE_DEBOUNCE = 600; // ms — gộp các thay đổi liên tiếp (vd. cả một lượt kéo) thành một lần ghi file

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const CORNERS = [
  { id: "nw", cursor: "nwse-resize" },
  { id: "ne", cursor: "nesw-resize" },
  { id: "se", cursor: "nwse-resize" },
  { id: "sw", cursor: "nesw-resize" },
];

function cornerPoint(box, corner) {
  const x = corner.includes("w") ? box.x : box.x + box.width;
  const y = corner.includes("n") ? box.y : box.y + box.height;
  return { x, y };
}

// Vật xoay 90°/270° đổi chỗ chiều rộng/chiều cao trên màn hình dù width/height lưu
// trong dữ liệu vẫn là kích thước "tự nhiên" dùng để vẽ chi tiết bên trong. Hai hàm
// dưới quy đổi qua lại giữa khung toạ độ cục bộ (lưu trong item) và hộp bao trên
// màn hình (dùng để chọn, kéo góc, tính khoảng cách và khoá nhẹ).
function toScreenBox(item) {
  const rotation = item.rotation ?? 0;
  if (rotation % 180 === 90) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    return {
      x: cx - item.height / 2,
      y: cy - item.width / 2,
      width: item.height,
      height: item.width,
    };
  }
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

function fromScreenBox(rotation, screenBox) {
  if ((rotation ?? 0) % 180 === 90) {
    const cx = screenBox.x + screenBox.width / 2;
    const cy = screenBox.y + screenBox.height / 2;
    const width = screenBox.height;
    const height = screenBox.width;
    return { x: cx - width / 2, y: cy - height / 2, width, height };
  }
  return {
    x: screenBox.x,
    y: screenBox.y,
    width: screenBox.width,
    height: screenBox.height,
  };
}

function boundsOf(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boxesIntersect(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

// "Phòng / Tường" chỉ có viền mỏng về mặt hiển thị, nhưng vẫn là một hình chữ nhật
// đặc về mặt dữ liệu (x,y,width,height) — nếu dùng giao-bbox thông thường, một khung
// marquee kéo GỌN TRONG LÒNG phòng (không chạm tường) sẽ vô tình "trúng" luôn cả
// phòng. Nên với loại 'room', chỉ tính là trúng khi khung kéo thực sự chạm dải viền
// (cùng bề rộng hit-area với lúc bấm chọn/kéo — xem ROOM_BORDER_HIT).
const ROOM_BORDER_HIT = 80; // mm — nửa bề rộng dải viền bắt marquee (khớp strokeWidth=160 lúc kéo)

function marqueeHitsItem(item, rect) {
  const box = toScreenBox(item);
  if (!boxesIntersect(box, rect)) return false;
  if (item.type !== "room") return true;
  const pad = ROOM_BORDER_HIT;
  const inner = {
    x: box.x + pad,
    y: box.y + pad,
    width: Math.max(0, box.width - pad * 2),
    height: Math.max(0, box.height - pad * 2),
  };
  const fullyInsideInner =
    rect.x >= inner.x &&
    rect.y >= inner.y &&
    rect.x + rect.width <= inner.x + inner.width &&
    rect.y + rect.height <= inner.y + inner.height;
  return !fullyInsideInner;
}

// Khung nhìn tự co theo các đối tượng hiện có (giống "zoom to fit"), luôn chừa
// FIT_PADDING mm quanh mép ngoài cùng và không bao giờ nhỏ hơn FIT_MIN_W x FIT_MIN_H.
function computeFitViewBox(list) {
  if (!list.length) return DEFAULT_VIEW;
  const b = boundsOf(list.map(toScreenBox));
  const w = Math.max(FIT_MIN_W, b.width);
  const h = Math.max(FIT_MIN_H, b.height);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return {
    x: cx - w / 2 - FIT_PADDING,
    y: cy - h / 2 - FIT_PADDING,
    w: w + FIT_PADDING * 2,
    h: h + FIT_PADDING * 2,
  };
}

// Tính lại {x,y,width,height} khi kéo một góc tới vị trí con trỏ hiện tại (cur),
// giữ nguyên cạnh đối diện với góc đang kéo.
function resizeBox(box, corner, cur) {
  let { x, y, width, height } = box;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (corner.includes("e")) width = clamp(cur.x - x, MIN_SIZE, 100000);
  if (corner.includes("s")) height = clamp(cur.y - y, MIN_SIZE, 100000);
  if (corner.includes("w")) {
    x = clamp(cur.x, right - 100000, right - MIN_SIZE);
    width = right - x;
  }
  if (corner.includes("n")) {
    y = clamp(cur.y, bottom - 100000, bottom - MIN_SIZE);
    height = bottom - y;
  }
  return {
    x: roundTo(x, RESIZE_SNAP),
    y: roundTo(y, RESIZE_SNAP),
    width: roundTo(width, RESIZE_SNAP),
    height: roundTo(height, RESIZE_SNAP),
  };
}

function edgesOf(box) {
  return {
    xs: [box.x, box.x + box.width / 2, box.x + box.width],
    ys: [box.y, box.y + box.height / 2, box.y + box.height],
  };
}

// "Khoá nhẹ": khi kéo một vật thể, nếu cạnh trái/phải/tâm hoặc trên/dưới/tâm của nó
// nằm trong ALIGN_SNAP mm so với một vật thể khác (container hoặc nội thất), hút
// đúng vào vị trí đó thay vì chỉ làm tròn theo lưới.
function computeAlignSnap(box, others) {
  const mine = edgesOf(box);
  let bestDX = null;
  let bestDY = null;
  let guideX = null;
  let guideY = null;
  for (const other of others) {
    const theirs = edgesOf(other);
    for (const mx of mine.xs) {
      for (const tx of theirs.xs) {
        const d = tx - mx;
        if (
          Math.abs(d) <= ALIGN_SNAP &&
          (bestDX === null || Math.abs(d) < Math.abs(bestDX))
        ) {
          bestDX = d;
          guideX = tx;
        }
      }
    }
    for (const my of mine.ys) {
      for (const ty of theirs.ys) {
        const d = ty - my;
        if (
          Math.abs(d) <= ALIGN_SNAP &&
          (bestDY === null || Math.abs(d) < Math.abs(bestDY))
        ) {
          bestDY = d;
          guideY = ty;
        }
      }
    }
  }
  return { dx: bestDX ?? 0, dy: bestDY ?? 0, guideX, guideY };
}

// Với một món nội thất, dò các container mà nó nằm gần cạnh (trong AUTO_DIM_THRESHOLD
// mm) để phát sinh đường kích thước tự động. AUTO_DIM_EPS bù sai số dấu phẩy động khi
// khoảng cách thực chất là 0 (vd. vừa khoá nhẹ vào đúng cạnh tường).
function computeAutoDims(item, containers) {
  const itemBox = toScreenBox(item);
  const dims = [];
  for (const c of containers) {
    const cBox = toScreenBox(c);
    const overlapX =
      Math.min(itemBox.x + itemBox.width, cBox.x + cBox.width) -
      Math.max(itemBox.x, cBox.x);
    const overlapY =
      Math.min(itemBox.y + itemBox.height, cBox.y + cBox.height) -
      Math.max(itemBox.y, cBox.y);
    if (overlapX > 0) {
      const midX = Math.max(itemBox.x, cBox.x) + overlapX / 2;
      const gapTop = itemBox.y - cBox.y;
      if (gapTop >= -AUTO_DIM_EPS && gapTop <= AUTO_DIM_THRESHOLD) {
        dims.push({
          dimKey: `${item.id}-${c.id}-top`,
          axis: "v",
          x1: midX,
          y1: cBox.y,
          x2: midX,
          y2: itemBox.y,
          label: Math.max(0, Math.round(gapTop)),
        });
      }
      const gapBottom = cBox.y + cBox.height - (itemBox.y + itemBox.height);
      if (gapBottom >= -AUTO_DIM_EPS && gapBottom <= AUTO_DIM_THRESHOLD) {
        dims.push({
          dimKey: `${item.id}-${c.id}-bottom`,
          axis: "v",
          x1: midX,
          y1: itemBox.y + itemBox.height,
          x2: midX,
          y2: cBox.y + cBox.height,
          label: Math.max(0, Math.round(gapBottom)),
        });
      }
    }
    if (overlapY > 0) {
      const midY = Math.max(itemBox.y, cBox.y) + overlapY / 2;
      const gapLeft = itemBox.x - cBox.x;
      if (gapLeft >= -AUTO_DIM_EPS && gapLeft <= AUTO_DIM_THRESHOLD) {
        dims.push({
          dimKey: `${item.id}-${c.id}-left`,
          axis: "h",
          x1: cBox.x,
          y1: midY,
          x2: itemBox.x,
          y2: midY,
          label: Math.max(0, Math.round(gapLeft)),
        });
      }
      const gapRight = cBox.x + cBox.width - (itemBox.x + itemBox.width);
      if (gapRight >= -AUTO_DIM_EPS && gapRight <= AUTO_DIM_THRESHOLD) {
        dims.push({
          dimKey: `${item.id}-${c.id}-right`,
          axis: "h",
          x1: itemBox.x + itemBox.width,
          y1: midY,
          x2: cBox.x + cBox.width,
          y2: midY,
          label: Math.max(0, Math.round(gapRight)),
        });
      }
    }
  }
  return dims;
}

function AutoDim({ x1, y1, x2, y2, axis, label }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const tick = 34;
  return (
    <g pointerEvents="none">
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={DIM_COLOR}
        strokeWidth={4}
      />
      {axis === "v" ? (
        <>
          <line
            x1={x1 - tick}
            y1={y1}
            x2={x1 + tick}
            y2={y1}
            stroke={DIM_COLOR}
            strokeWidth={4}
          />
          <line
            x1={x2 - tick}
            y1={y2}
            x2={x2 + tick}
            y2={y2}
            stroke={DIM_COLOR}
            strokeWidth={4}
          />
          <text
            x={midX + 20}
            y={midY}
            fill={DIM_COLOR}
            fontSize={70}
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            dominantBaseline="middle"
          >
            {label}
          </text>
        </>
      ) : (
        <>
          <line
            x1={x1}
            y1={y1 - tick}
            x2={x1}
            y2={y1 + tick}
            stroke={DIM_COLOR}
            strokeWidth={4}
          />
          <line
            x1={x2}
            y1={y2 - tick}
            x2={x2}
            y2={y2 + tick}
            stroke={DIM_COLOR}
            strokeWidth={4}
          />
          <text
            x={midX}
            y={midY - 20}
            fill={DIM_COLOR}
            fontSize={70}
            fontFamily="'JetBrains Mono', ui-monospace, monospace"
            textAnchor="middle"
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
}

function AlignGuides({ x, y, view }) {
  const w = Math.max(3, view.w * 0.0006);
  return (
    <g pointerEvents="none">
      {x !== null && (
        <line
          x1={x}
          y1={view.y}
          x2={x}
          y2={view.y + view.h}
          stroke={GUIDE_COLOR}
          strokeWidth={w}
          strokeDasharray="20 14"
        />
      )}
      {y !== null && (
        <line
          x1={view.x}
          y1={y}
          x2={view.x + view.w}
          y2={y}
          stroke={GUIDE_COLOR}
          strokeWidth={w}
          strokeDasharray="20 14"
        />
      )}
    </g>
  );
}

function GridBackground({
  gridSize,
  theme,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) {
  const major = gridSize * GRID_MAJOR_MULT;
  return (
    <>
      <defs>
        <pattern
          id="grid-minor"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke={theme.gridMinor}
            strokeWidth={2}
          />
        </pattern>
        <pattern
          id="grid-major"
          width={major}
          height={major}
          patternUnits="userSpaceOnUse"
        >
          <rect width={major} height={major} fill="url(#grid-minor)" />
          <path
            d={`M ${major} 0 L 0 0 0 ${major}`}
            fill="none"
            stroke={theme.gridMajor}
            strokeWidth={3}
          />
        </pattern>
      </defs>
      <rect
        x={-GRID_SPAN}
        y={-GRID_SPAN}
        width={GRID_SPAN * 2}
        height={GRID_SPAN * 2}
        fill="url(#grid-major)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "none" }}
      />
    </>
  );
}

function ObjectToolbar({ theme, onAdd }) {
  return (
    <div className="furniture-toolbar">
      <div className="toolbar-section-label">Cấu trúc cố định</div>
      {CONTAINER_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="furniture-btn"
          onClick={() => onAdd("container", t.id)}
        >
          <svg
            viewBox={`0 0 ${t.width} ${t.height}`}
            className="furniture-icon"
          >
            <FurnitureShape
              type={t.id}
              w={t.width}
              h={t.height}
              color={theme.wall}
            />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
      <div className="toolbar-section-label">Nội thất</div>
      {FURNITURE_TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="furniture-btn"
          onClick={() => onAdd("furniture", t.id)}
        >
          <svg
            viewBox={`0 0 ${t.width} ${t.height}`}
            className="furniture-icon"
          >
            <FurnitureShape
              type={t.id}
              w={t.width}
              h={t.height}
              color={FURNITURE_COLOR}
            />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// Input số "mềm": cho gõ tự do (chọn hết, xoá, gõ lại) — chỉ ép kiểu + giới hạn min
// khi rời khỏi ô (blur) hoặc bấm Enter, không phải trên từng phím gõ.
function NumberField({ label, value, step = 1, min = -100000, onCommit }) {
  const [text, setText] = useState(String(Math.round(value)));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setText(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    editingRef.current = false;
    const v = Number(text);
    if (text.trim() !== "" && !Number.isNaN(v)) {
      onCommit(clamp(v, min, 100000));
    } else {
      setText(String(Math.round(value)));
    }
  };

  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        onFocus={() => {
          editingRef.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(String(Math.round(value)));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function SinglePropertiesPanel({
  item,
  onChange,
  onRotate,
  onUngroup,
  onDelete,
}) {
  const type = typeOf(item.category, item.type);
  return (
    <aside className="properties-panel">
      <h3>{type.label}</h3>
      <div className="prop-grid">
        <NumberField
          label="X (mm)"
          value={item.x}
          step={RESIZE_SNAP}
          onCommit={(v) => onChange({ x: v })}
        />
        <NumberField
          label="Y (mm)"
          value={item.y}
          step={RESIZE_SNAP}
          onCommit={(v) => onChange({ y: v })}
        />
        <NumberField
          label="Rộng (mm)"
          value={item.width}
          step={RESIZE_SNAP}
          min={MIN_SIZE}
          onCommit={(v) => onChange({ width: v })}
        />
        <NumberField
          label="Cao (mm)"
          value={item.height}
          step={RESIZE_SNAP}
          min={MIN_SIZE}
          onCommit={(v) => onChange({ height: v })}
        />
      </div>
      <div className="prop-actions">
        <button type="button" onClick={onRotate}>
          Xoay 90° ({item.rotation ?? 0}°)
        </button>
        {item.groupId && (
          <button type="button" onClick={onUngroup}>
            Rã nhóm
          </button>
        )}
        <button type="button" className="danger" onClick={onDelete}>
          Xoá
        </button>
      </div>
    </aside>
  );
}

function MultiPropertiesPanel({
  count,
  box,
  isGroup,
  onMove,
  onRotateEach,
  onGroup,
  onUngroup,
  onDelete,
}) {
  return (
    <aside className="properties-panel">
      <h3>
        {isGroup ? `Nhóm (${count} vật thể)` : `${count} vật thể đã chọn`}
      </h3>
      <div className="prop-grid">
        <NumberField
          label="X (mm)"
          value={box.x}
          step={RESIZE_SNAP}
          onCommit={(v) => onMove(v - box.x, 0)}
        />
        <NumberField
          label="Y (mm)"
          value={box.y}
          step={RESIZE_SNAP}
          onCommit={(v) => onMove(0, v - box.y)}
        />
        <div className="prop-field">
          <span>Kích thước tổng</span>
          <div className="prop-readonly">
            {Math.round(box.width)} × {Math.round(box.height)}
          </div>
        </div>
      </div>
      <div className="prop-actions">
        {isGroup ? (
          <button type="button" onClick={onUngroup}>
            Rã nhóm
          </button>
        ) : (
          <button type="button" onClick={onGroup}>
            Nhóm lại
          </button>
        )}
        <button type="button" onClick={onRotateEach}>
          Xoay từng món 90°
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          Xoá tất cả
        </button>
      </div>
    </aside>
  );
}

function GridSizeControl({ value, onChange }) {
  const [text, setText] = useState(String(value));
  const editingRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setText(String(value));
  }, [value]);
  const commit = () => {
    editingRef.current = false;
    const v = Number(text);
    if (!Number.isNaN(v) && text.trim() !== "")
      onChange(clamp(Math.round(v), MIN_GRID, MAX_GRID));
    else setText(String(value));
  };
  return (
    <label className="grid-size-field">
      <span>Ô lưới</span>
      <input
        type="number"
        value={text}
        step={50}
        onFocus={() => {
          editingRef.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span>mm</span>
    </label>
  );
}

// ===== Icon SVG nhỏ, gọn — cùng phong cách nét đơn với phần còn lại của app =====
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconMove() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2 L12 22 M2 12 L22 12 M12 2 L9 5 M12 2 L15 5 M12 22 L9 19 M12 22 L15 19 M2 12 L5 9 M2 12 L5 15 M22 12 L19 9 M22 12 L19 15" />
    </svg>
  );
}
function IconHand() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11.5V6a1.5 1.5 0 0 1 3 0v8M8 13l-1.8-1.8a1.4 1.4 0 0 0-2 2L8 17a6 6 0 0 0 6 3h1a6 6 0 0 0 6-6v-3.5a1.5 1.5 0 0 0-3 0" />
    </svg>
  );
}
function IconComment() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H9l-4 4V5Z" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function IconHelp() {
  return (
    <svg {...ICON_PROPS} width={22} height={22}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.3a2.8 2.8 0 1 1 3.9 2.6c-.9.4-1.4 1-1.4 1.9v.4" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

function ToolDock({ tool, onChange }) {
  const tools = [
    { id: "move", label: "Di chuyển (V)", icon: <IconMove /> },
    { id: "hand", label: "Bàn tay (H)", icon: <IconHand /> },
    { id: "comment", label: "Bình luận (C)", icon: <IconComment /> },
  ];
  return (
    <div className="tool-dock">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          className={`tool-dock-btn${tool === t.id ? " active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

function CommentPin({ x, y, active, onClick }) {
  return (
    <button
      type="button"
      className={`comment-pin${active ? " active" : ""}`}
      style={{ left: x, top: y }}
      onClick={onClick}
    >
      <IconComment />
    </button>
  );
}

function CommentPopup({ x, y, text, onChangeText, onClose, onDelete }) {
  const areaRef = useRef(null);
  useEffect(() => {
    areaRef.current?.focus();
  }, []);
  return (
    <div
      className="comment-popup"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={areaRef}
        value={text}
        placeholder="Viết bình luận…"
        onChange={(e) => onChangeText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onClose();
        }}
      />
      <div className="comment-popup-actions">
        <button type="button" className="danger" onClick={onDelete}>
          <IconTrash />
        </button>
        <button type="button" onClick={onClose}>
          Xong
        </button>
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Hướng dẫn sử dụng</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <section>
          <h3>Chuột / trackpad</h3>
          <ul>
            <li>Cuộn — pan toàn canvas</li>
            <li>Ctrl/Cmd + cuộn, hoặc pinch trackpad — zoom quanh con trỏ</li>
            <li>
              Giữ Space và kéo, hoặc kéo bằng nút chuột giữa — pan bằng tay
            </li>
            <li>
              Kéo trên nền trống (công cụ Di chuyển) — chọn nhiều bằng khung
            </li>
          </ul>
        </section>

        <section>
          <h3>Công cụ (thanh dưới cùng)</h3>
          <ul>
            <li>
              <b>V</b> — Di chuyển: chọn, kéo, resize vật thể
            </li>
            <li>
              <b>H</b> — Bàn tay: chỉ để pan, không chọn/di chuyển gì
            </li>
            <li>
              <b>C</b> — Bình luận: click vào bản vẽ để để lại ghi chú
            </li>
          </ul>
        </section>

        <section>
          <h3>Phím tắt</h3>
          <ul>
            <li>Cmd/Ctrl + Z / Shift+Z — Hoàn tác / Làm lại</li>
            <li>Cmd/Ctrl + A — Chọn tất cả</li>
            <li>Cmd/Ctrl + C / X / V — Copy / Cắt / Dán</li>
            <li>Cmd/Ctrl + D — Nhân đôi lựa chọn</li>
            <li>Cmd/Ctrl + G / Shift+G — Nhóm / Rã nhóm</li>
            <li>Cmd/Ctrl + '+' / '-' — Zoom vào / ra</li>
            <li>Shift + 1 — Zoom vừa khít toàn bộ</li>
            <li>Shift + 2 — Zoom vừa khít lựa chọn</li>
            <li>Delete / Backspace — Xoá lựa chọn</li>
            <li>Mũi tên (giữ Shift: theo ô lưới) — Di chuyển lựa chọn</li>
            <li>Escape — Bỏ chọn</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// Ghi thẳng ra src/layout.json chỉ khả thi khi có dev-server (endpoint
// /api/save-layout do plugin Vite cung cấp) — một bản deploy tĩnh như Vercel
// không có gì để chạy plugin đó, và cũng không có ổ đĩa ghi được. Nên ở môi
// trường dev, layout.json là nguồn dữ liệu chính; ở bản build/deploy tĩnh,
// tự chuyển sang lưu trong localStorage của trình xem, và bundle của
// layout.json chỉ còn là nội dung khởi tạo mặc định.
const IS_DEV = import.meta.env.DEV;
const PROJECT_STORAGE_KEY = "roomsketch-project-v1";

function fileState() {
  if (Array.isArray(fileLayout)) {
    return { items: fileLayout, gridSize: DEFAULT_GRID, comments: [] };
  }
  return {
    items: fileLayout.items ?? [],
    gridSize: fileLayout.gridSize ?? DEFAULT_GRID,
    comments: fileLayout.comments ?? [],
  };
}

function loadInitialState() {
  if (IS_DEV) return fileState();
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        items: parsed.items ?? [],
        gridSize: parsed.gridSize ?? DEFAULT_GRID,
        comments: parsed.comments ?? [],
      };
    }
  } catch {
    // localStorage không khả dụng (chế độ riêng tư, bị chặn...) — dùng bản
    // đóng gói sẵn trong layout.json làm mặc định.
  }
  return fileState();
}

function loadInitialDarkMode() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export default function FloorPlan() {
  const initialState = useRef(loadInitialState()).current;
  const [items, setItems] = useState(initialState.items);
  const [gridSize, setGridSize] = useState(initialState.gridSize);
  const [comments, setComments] = useState(initialState.comments);
  const [openCommentId, setOpenCommentId] = useState(null);
  const [darkMode, setDarkMode] = useState(loadInitialDarkMode);
  const [tool, setTool] = useState("move");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState("");
  const [guides, setGuides] = useState({ x: null, y: null });
  const [marquee, setMarquee] = useState(null);
  const [view, setView] = useState(() => computeFitViewBox(initialState.items));
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const marqueeDrag = useRef(null);
  const panDrag = useRef(null);
  const addCount = useRef(0);
  const itemsRef = useRef(items);
  const viewRef = useRef(view);
  const clipboard = useRef([]);
  const past = useRef([]);
  const future = useRef([]);

  const theme = THEME_COLORS[darkMode ? "dark" : "light"];
  const saveTimer = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Tự lưu sau mỗi thay đổi (gộp lại theo AUTOSAVE_DEBOUNCE để một lượt kéo
  // chỉ lưu một lần). Ở dev, ghi thẳng vào src/layout.json qua endpoint
  // /api/save-layout do plugin Vite cung cấp. Ở bản deploy tĩnh (không có
  // dev-server, vd. Vercel), tự chuyển sang lưu vào localStorage của người
  // xem — không có ổ đĩa chung nào để ghi ra một file thực sự ở đó.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return undefined;
    }
    setStatus("Đang lưu…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = { gridSize, items, comments };
      if (!IS_DEV) {
        try {
          localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));
          setStatus("Đã lưu (trên trình duyệt này)");
        } catch {
          setStatus("Không lưu được");
        }
        return;
      }
      try {
        const res = await fetch("/api/save-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload, null, 2),
        });
        if (!res.ok) throw new Error(await res.text());
        setStatus("Đã lưu");
      } catch {
        setStatus("Không lưu được — chỉ hoạt động khi chạy npm run dev");
      }
    }, AUTOSAVE_DEBOUNCE);
    return () => clearTimeout(saveTimer.current);
  }, [items, gridSize, comments]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, String(darkMode));
    } catch {
      // bỏ qua nếu trình duyệt chặn localStorage
    }
  }, [darkMode]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const toSvgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }, []);

  // Giữ Space để pan bằng tay (con trỏ đổi thành bàn tay), giống Figma. Bỏ qua khi
  // đang gõ trong một ô nhập để không chặn phím cách bình thường.
  useEffect(() => {
    function down(e) {
      if (e.code !== "Space" || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function up(e) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const applyZoom = useCallback((pivotX, pivotY, factor) => {
    setView((v) => {
      const newW = clamp(v.w * factor, MIN_VIEW_W, MAX_VIEW_W);
      const applied = newW / v.w;
      const newH = v.h * applied;
      return {
        x: pivotX - (pivotX - v.x) * applied,
        y: pivotY - (pivotY - v.y) * applied,
        w: newW,
        h: newH,
      };
    });
  }, []);

  // Cuộn để pan (kéo hai ngón trên trackpad, hoặc lăn chuột); giữ Ctrl/Cmd để zoom
  // quanh vị trí con trỏ — trình duyệt tự báo cử chỉ pinch trên trackpad thành sự
  // kiện wheel kèm ctrlKey nên không cần xử lý riêng.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const pivotX = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
        const pivotY = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
        const factor = clamp(1 + e.deltaY * ZOOM_WHEEL_SENSITIVITY, 0.82, 1.18);
        applyZoom(pivotX, pivotY, factor);
        return;
      }
      const dx = (e.deltaX / rect.width) * v.w;
      const dy = (e.deltaY / rect.height) * v.h;
      setView((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // Pan bằng tay: giữ Space rồi kéo, kéo bằng nút chuột giữa, hoặc đang ở công cụ
  // Bàn tay (H) — bắt ở pha capture trên toàn canvas để "đè" trước mọi thao tác
  // chọn/di chuyển vật thể hay đặt bình luận ở bên dưới, y hệt Figma. Ở công cụ
  // Bình luận (C), một cú click (không kéo) sẽ mở/tạo ghi chú tại đúng điểm đó.
  const handleCanvasPointerDownCapture = useCallback(
    (e) => {
      if (spaceHeld || tool === "hand" || e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        panDrag.current = {
          startClient: { x: e.clientX, y: e.clientY },
          startView: { ...viewRef.current },
        };
        setIsPanning(true);
        return;
      }
      if (tool === "comment") {
        e.preventDefault();
        e.stopPropagation();
        const pt = toSvgPoint(e.clientX, e.clientY);
        const tolerance = viewRef.current.w * 0.025;
        const hit = comments.find(
          (c) => Math.hypot(c.x - pt.x, c.y - pt.y) <= tolerance,
        );
        if (hit) {
          setOpenCommentId(hit.id);
        } else {
          const created = { id: uid("comment"), x: pt.x, y: pt.y, text: "" };
          setComments((prev) => [...prev, created]);
          setOpenCommentId(created.id);
        }
      }
    },
    [spaceHeld, tool, comments, toSvgPoint],
  );

  const handleCanvasPointerMove = useCallback((e) => {
    const p = panDrag.current;
    if (!p) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dxPx = e.clientX - p.startClient.x;
    const dyPx = e.clientY - p.startClient.y;
    setView({
      ...p.startView,
      x: p.startView.x - (dxPx / rect.width) * p.startView.w,
      y: p.startView.y - (dyPx / rect.height) * p.startView.h,
    });
  }, []);

  const handleCanvasPointerUp = useCallback((e) => {
    if (!panDrag.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    panDrag.current = null;
    setIsPanning(false);
  }, []);

  const pushHistory = useCallback(() => {
    past.current = [
      ...past.current.slice(-HISTORY_LIMIT + 1),
      itemsRef.current,
    ];
    future.current = [];
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [itemsRef.current, ...future.current].slice(
      0,
      HISTORY_LIMIT,
    );
    setItems(prev);
    setSelectedIds([]);
    setView(computeFitViewBox(prev));
    setStatus("");
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, itemsRef.current].slice(-HISTORY_LIMIT);
    setItems(next);
    setSelectedIds([]);
    setView(computeFitViewBox(next));
    setStatus("");
  }, []);

  const groupMembersOf = useCallback(
    (item) => {
      if (!item.groupId) return [item.id];
      return items
        .filter((it) => it.groupId === item.groupId)
        .map((it) => it.id);
    },
    [items],
  );

  const updateItem = useCallback((id, patch) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  // ===== Kéo di chuyển (đơn lẻ, nhóm, hoặc nhiều vật thể đang chọn cùng lúc) =====
  const handleBodyPointerDown = useCallback(
    (id) => (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const clicked = items.find((it) => it.id === id);
      let nextSelection;
      if (e.shiftKey) {
        const members = groupMembersOf(clicked);
        const allIn = members.every((m) => selectedIds.includes(m));
        nextSelection = allIn
          ? selectedIds.filter((s) => !members.includes(s))
          : [...new Set([...selectedIds, ...members])];
      } else if (selectedIds.includes(id)) {
        nextSelection = selectedIds;
      } else {
        nextSelection = groupMembersOf(clicked);
      }
      setSelectedIds(nextSelection);
      const start = toSvgPoint(e.clientX, e.clientY);
      const startItems = items
        .filter((it) => nextSelection.includes(it.id))
        .map((it) => ({ id: it.id, x: it.x, y: it.y }));
      drag.current = {
        mode: "move",
        anchorId: id,
        startPointer: start,
        startItems,
        historyPushed: false,
      };
      setStatus("");
    },
    [items, selectedIds, groupMembersOf, toSvgPoint],
  );

  const handleBodyPointerMove = useCallback(
    (id) => (e) => {
      const d = drag.current;
      if (!d || d.mode !== "move" || d.anchorId !== id) return;
      if (!d.historyPushed) {
        pushHistory();
        d.historyPushed = true;
      }
      const cur = toSvgPoint(e.clientX, e.clientY);
      const anchorStart = d.startItems.find((s) => s.id === id);
      const anchorItem = itemsRef.current.find((it) => it.id === id);
      const anchorScreen = toScreenBox({
        ...anchorItem,
        x: anchorStart.x,
        y: anchorStart.y,
      });
      const offX = anchorScreen.x - anchorStart.x;
      const offY = anchorScreen.y - anchorStart.y;

      const dxWorld = cur.x - d.startPointer.x;
      const dyWorld = cur.y - d.startPointer.y;
      const rawScreenX = anchorStart.x + dxWorld + offX;
      const rawScreenY = anchorStart.y + dyWorld + offY;

      const movingIds = new Set(d.startItems.map((s) => s.id));
      const others = itemsRef.current
        .filter((it) => !movingIds.has(it.id))
        .map(toScreenBox);
      const { dx, dy, guideX, guideY } = computeAlignSnap(
        {
          x: rawScreenX,
          y: rawScreenY,
          width: anchorScreen.width,
          height: anchorScreen.height,
        },
        others,
      );

      let screenX =
        guideX !== null ? rawScreenX + dx : roundTo(rawScreenX, gridSize);
      let screenY =
        guideY !== null ? rawScreenY + dy : roundTo(rawScreenY, gridSize);
      screenX = clamp(screenX, -WORLD_LIMIT, WORLD_LIMIT - anchorScreen.width);
      screenY = clamp(screenY, -WORLD_LIMIT, WORLD_LIMIT - anchorScreen.height);

      const finalDX = screenX - offX - anchorStart.x;
      const finalDY = screenY - offY - anchorStart.y;

      setGuides({ x: guideX, y: guideY });
      setItems((prev) =>
        prev.map((it) => {
          const s = d.startItems.find((st) => st.id === it.id);
          return s ? { ...it, x: s.x + finalDX, y: s.y + finalDY } : it;
        }),
      );
    },
    [gridSize, toSvgPoint, pushHistory],
  );

  const handlePointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setGuides({ x: null, y: null });
  }, []);

  // ===== Kéo góc: co giãn hộp bao của TOÀN BỘ lựa chọn hiện tại (1 vật hoặc cả nhóm) =====
  const handleHandlePointerDown = useCallback(
    (corner) => (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const selected = items.filter((it) => selectedIds.includes(it.id));
      const startBox = boundsOf(selected.map(toScreenBox));
      const startItems = selected.map((it) => ({
        id: it.id,
        screen: toScreenBox(it),
        rotation: it.rotation ?? 0,
      }));
      drag.current = {
        mode: "resize",
        corner,
        startBox,
        startItems,
        historyPushed: false,
      };
      setStatus("");
    },
    [items, selectedIds],
  );

  const handleHandlePointerMove = useCallback(
    (corner) => (e) => {
      const d = drag.current;
      if (!d || d.mode !== "resize" || d.corner !== corner) return;
      if (!d.historyPushed) {
        pushHistory();
        d.historyPushed = true;
      }
      const cur = toSvgPoint(e.clientX, e.clientY);
      const newBox = resizeBox(d.startBox, corner, cur);
      setItems((prev) =>
        prev.map((it) => {
          const s = d.startItems.find((st) => st.id === it.id);
          if (!s) return it;
          const relX =
            d.startBox.width === 0
              ? 0
              : (s.screen.x - d.startBox.x) / d.startBox.width;
          const relY =
            d.startBox.height === 0
              ? 0
              : (s.screen.y - d.startBox.y) / d.startBox.height;
          const relW =
            d.startBox.width === 0 ? 1 : s.screen.width / d.startBox.width;
          const relH =
            d.startBox.height === 0 ? 1 : s.screen.height / d.startBox.height;
          const newScreen = {
            x: newBox.x + relX * newBox.width,
            y: newBox.y + relY * newBox.height,
            width: Math.max(MIN_SIZE, relW * newBox.width),
            height: Math.max(MIN_SIZE, relH * newBox.height),
          };
          return { ...it, ...fromScreenBox(s.rotation, newScreen) };
        }),
      );
    },
    [toSvgPoint, pushHistory],
  );

  // ===== Chọn theo khung kéo (marquee) trên nền lưới trống =====
  const handleGridPointerDown = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const start = toSvgPoint(e.clientX, e.clientY);
      marqueeDrag.current = { start, moved: false, pointerId: e.pointerId };
      setMarquee({ x: start.x, y: start.y, width: 0, height: 0 });
    },
    [toSvgPoint],
  );

  const handleGridPointerMove = useCallback(
    (e) => {
      const m = marqueeDrag.current;
      if (!m) return;
      const cur = toSvgPoint(e.clientX, e.clientY);
      const dx = cur.x - m.start.x;
      const dy = cur.y - m.start.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) m.moved = true;
      setMarquee({
        x: Math.min(m.start.x, cur.x),
        y: Math.min(m.start.y, cur.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    },
    [toSvgPoint],
  );

  const handleGridPointerUp = useCallback(
    (e) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      const m = marqueeDrag.current;
      marqueeDrag.current = null;
      const rect = marquee;
      setMarquee(null);
      if (!m) return;
      if (!m.moved) {
        setSelectedIds([]);
        return;
      }
      const hits = itemsRef.current.filter((it) => marqueeHitsItem(it, rect));
      const ids = new Set();
      for (const it of hits) for (const mid of groupMembersOf(it)) ids.add(mid);
      setSelectedIds([...ids]);
    },
    [marquee, groupMembersOf],
  );

  const centerOfView = useCallback(
    () => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 }),
    [view],
  );

  const handleAdd = useCallback(
    (category, typeId) => {
      pushHistory();
      const type = typeOf(category, typeId);
      const cascade = (addCount.current % 6) * 60;
      addCount.current += 1;
      const center = centerOfView();
      const newItem = {
        id: uid(typeId),
        category,
        type: typeId,
        x: roundTo(center.x - type.width / 2 + cascade, RESIZE_SNAP),
        y: roundTo(center.y - type.height / 2 + cascade, RESIZE_SNAP),
        width: type.width,
        height: type.height,
        rotation: 0,
      };
      const next = [...items, newItem];
      setItems(next);
      setSelectedIds([newItem.id]);
      setStatus("");
    },
    [items, centerOfView, pushHistory],
  );

  const rotateIds = useCallback(
    (ids) => {
      pushHistory();
      setItems((prev) =>
        prev.map((it) =>
          ids.includes(it.id)
            ? { ...it, rotation: ((it.rotation ?? 0) + 90) % 360 }
            : it,
        ),
      );
    },
    [pushHistory],
  );

  const deleteIds = useCallback(
    (ids) => {
      if (ids.length === 0) return;
      pushHistory();
      const next = items.filter((it) => !ids.includes(it.id));
      setItems(next);
      setSelectedIds([]);
    },
    [items, pushHistory],
  );

  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    pushHistory();
    const gid = uid("group");
    setItems((prev) =>
      prev.map((it) =>
        selectedIds.includes(it.id) ? { ...it, groupId: gid } : it,
      ),
    );
  }, [selectedIds, pushHistory]);

  const ungroupSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    pushHistory();
    setItems((prev) =>
      prev.map((it) => {
        if (!selectedIds.includes(it.id)) return it;
        const { groupId: _groupId, ...rest } = it;
        return rest;
      }),
    );
  }, [selectedIds, pushHistory]);

  const moveSelection = useCallback(
    (dxWorld, dyWorld) => {
      if (selectedIds.length === 0) return;
      pushHistory();
      setItems((prev) =>
        prev.map((it) =>
          selectedIds.includes(it.id)
            ? { ...it, x: it.x + dxWorld, y: it.y + dyWorld }
            : it,
        ),
      );
    },
    [selectedIds, pushHistory],
  );

  const copySelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    clipboard.current = items
      .filter((it) => selectedIds.includes(it.id))
      .map((it) => ({ ...it }));
    setStatus(`Đã copy ${clipboard.current.length} đối tượng`);
  }, [items, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (clipboard.current.length === 0) return;
    pushHistory();
    const offset = gridSize / 2;
    const idMap = new Map();
    const groupMap = new Map();
    const pasted = clipboard.current.map((it) => {
      const newId = uid(it.type);
      idMap.set(it.id, newId);
      let groupId;
      if (it.groupId) {
        if (!groupMap.has(it.groupId)) groupMap.set(it.groupId, uid("group"));
        groupId = groupMap.get(it.groupId);
      }
      return { ...it, id: newId, x: it.x + offset, y: it.y + offset, groupId };
    });
    const next = [...items, ...pasted];
    setItems(next);
    setSelectedIds(pasted.map((it) => it.id));
    setStatus(`Đã dán ${pasted.length} đối tượng`);
  }, [items, gridSize, pushHistory]);

  const duplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    pushHistory();
    const offset = gridSize / 2;
    const groupMap = new Map();
    const source = items.filter((it) => selectedIds.includes(it.id));
    const dup = source.map((it) => {
      const newId = uid(it.type);
      let groupId;
      if (it.groupId) {
        if (!groupMap.has(it.groupId)) groupMap.set(it.groupId, uid("group"));
        groupId = groupMap.get(it.groupId);
      }
      return { ...it, id: newId, x: it.x + offset, y: it.y + offset, groupId };
    });
    const next = [...items, ...dup];
    setItems(next);
    setSelectedIds(dup.map((it) => it.id));
    setStatus(`Đã nhân đôi ${dup.length} đối tượng`);
  }, [items, selectedIds, gridSize, pushHistory]);

  // ===== Phím tắt =====
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(itemsRef.current.map((it) => it.id));
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        copySelection();
        deleteIds(selectedIds);
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const v = viewRef.current;
        applyZoom(v.x + v.w / 2, v.y + v.h / 2, ZOOM_KEY_FACTOR);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        const v = viewRef.current;
        applyZoom(v.x + v.w / 2, v.y + v.h / 2, 1 / ZOOM_KEY_FACTOR);
        return;
      }
      if (e.shiftKey && e.key === "1") {
        e.preventDefault();
        setView(computeFitViewBox(itemsRef.current));
        return;
      }
      if (e.shiftKey && e.key === "2") {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setView(
            computeFitViewBox(
              itemsRef.current.filter((it) => selectedIds.includes(it.id)),
            ),
          );
        }
        return;
      }
      if (e.key === "Escape") {
        if (openCommentId) {
          setOpenCommentId(null);
          return;
        }
        setSelectedIds([]);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteIds(selectedIds);
        return;
      }
      if (e.key.startsWith("Arrow")) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? gridSize : NUDGE_STEP;
        const delta = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[e.key];
        if (delta) moveSelection(delta[0], delta[1]);
        return;
      }
      if (!mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "v") {
          setTool("move");
          return;
        }
        if (k === "h") {
          setTool("hand");
          return;
        }
        if (k === "c") {
          setTool("comment");
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedIds,
    gridSize,
    openCommentId,
    undo,
    redo,
    copySelection,
    deleteIds,
    pasteClipboard,
    duplicateSelection,
    groupSelected,
    ungroupSelected,
    moveSelection,
    applyZoom,
  ]);

  const viewBoxStr = `${view.x} ${view.y} ${view.w} ${view.h}`;
  const selectedItems = items.filter((it) => selectedIds.includes(it.id));
  const selectionBox =
    selectedItems.length > 0 ? boundsOf(selectedItems.map(toScreenBox)) : null;
  const isGroupSelection =
    selectedItems.length > 1 &&
    selectedItems.every(
      (it) => it.groupId && it.groupId === selectedItems[0].groupId,
    );
  const containers = items.filter((it) => it.category === "container");
  const furniture = items.filter((it) => it.category !== "container");

  const canvasCursor = isPanning
    ? "grabbing"
    : spaceHeld || tool === "hand"
      ? "grab"
      : tool === "comment"
        ? "crosshair"
        : "default";

  const worldToScreen = (wx, wy) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((wx - view.x) / view.w) * rect.width,
      y: ((wy - view.y) / view.h) * rect.height,
    };
  };
  const openComment = comments.find((c) => c.id === openCommentId) ?? null;
  const openCommentPos = openComment
    ? worldToScreen(openComment.x, openComment.y)
    : null;

  return (
    <div className="plan-shell" data-theme={darkMode ? "dark" : "light"}>
      <div className="floating-topbar">
        <GridSizeControl value={gridSize} onChange={setGridSize} />
        <button
          type="button"
          className="icon-btn theme-toggle"
          title={darkMode ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"}
          onClick={() => setDarkMode((v) => !v)}
        >
          {darkMode ? <IconSun /> : <IconMoon />}
        </button>
        {status && <span className="plan-status">{status}</span>}
      </div>

      <ObjectToolbar theme={theme} onAdd={handleAdd} />

      <svg
        ref={svgRef}
        viewBox={viewBoxStr}
        className="floor-canvas"
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        style={{
          cursor: canvasCursor === "default" ? undefined : canvasCursor,
          background: theme.canvasBg,
        }}
      >
        <GridBackground
          gridSize={gridSize}
          theme={theme}
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
            style={{
              cursor: canvasCursor === "default" ? "grab" : canvasCursor,
              touchAction: "none",
            }}
            opacity={
              drag.current?.mode === "move" &&
              drag.current.startItems.some((s) => s.id === item.id)
                ? 0.65
                : 1
            }
          >
            {item.type === "room" ? (
              // Phòng/tường: chỉ bắt sự kiện ở dải viền (đủ rộng để dễ nắm), để phần
              // giữa trống "xuyên qua" cho marquee-select hoặc nội thất bên trong.
              <rect
                x={0}
                y={0}
                width={item.width}
                height={item.height}
                fill="none"
                stroke="transparent"
                strokeWidth={ROOM_BORDER_HIT * 2}
                pointerEvents="stroke"
              />
            ) : (
              <rect
                x={0}
                y={0}
                width={item.width}
                height={item.height}
                fill="transparent"
              />
            )}
            <FurnitureShape
              type={item.type}
              w={item.width}
              h={item.height}
              color={
                item.category === "container" ? theme.wall : FURNITURE_COLOR
              }
            />
          </g>
        ))}

        {/* ===== Đường kích thước tự động: nội thất <-> cạnh container gần nhất ===== */}
        {furniture
          .flatMap((item) => computeAutoDims(item, containers))
          .map(({ dimKey, ...dim }) => (
            <AutoDim key={dimKey} {...dim} />
          ))}

        {/* ===== Đường gióng khoá nhẹ khi đang kéo ===== */}
        <AlignGuides x={guides.x} y={guides.y} view={view} />

        {/* ===== Khung kéo chọn (marquee) ===== */}
        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill={MARQUEE_COLOR}
            fillOpacity={0.12}
            stroke={MARQUEE_COLOR}
            strokeWidth={3}
            pointerEvents="none"
          />
        )}

        {/* ===== Khung chọn + tay cầm kéo-giãn cho lựa chọn hiện tại ===== */}
        {selectionBox && (
          <g pointerEvents="none">
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="none"
              stroke={SELECT_COLOR}
              strokeWidth={5}
              strokeDasharray="24 16"
            />
          </g>
        )}
        {selectionBox &&
          CORNERS.map(({ id: corner, cursor }) => {
            const p = cornerPoint(selectionBox, corner);
            const s = HANDLE_SIZE;
            return (
              <rect
                key={corner}
                x={p.x - s / 2}
                y={p.y - s / 2}
                width={s}
                height={s}
                fill={SELECT_COLOR}
                stroke="#08131c"
                strokeWidth={4}
                style={{ cursor, touchAction: "none" }}
                onPointerDown={handleHandlePointerDown(corner)}
                onPointerMove={handleHandlePointerMove(corner)}
                onPointerUp={handlePointerUp}
              />
            );
          })}
      </svg>

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

      <div className="comment-layer">
        {comments.map((c) => {
          const pos = worldToScreen(c.x, c.y);
          if (!pos) return null;
          return (
            <CommentPin
              key={c.id}
              x={pos.x}
              y={pos.y}
              active={c.id === openCommentId}
              onClick={(e) => {
                e.stopPropagation();
                setOpenCommentId(c.id);
              }}
            />
          );
        })}
        {openComment && openCommentPos && (
          <CommentPopup
            x={openCommentPos.x}
            y={openCommentPos.y}
            text={openComment.text}
            onChangeText={(text) =>
              setComments((prev) =>
                prev.map((c) => (c.id === openComment.id ? { ...c, text } : c)),
              )
            }
            onClose={() => {
              if (openComment.text.trim() === "") {
                setComments((prev) =>
                  prev.filter((c) => c.id !== openComment.id),
                );
              }
              setOpenCommentId(null);
            }}
            onDelete={() => {
              setComments((prev) =>
                prev.filter((c) => c.id !== openComment.id),
              );
              setOpenCommentId(null);
            }}
          />
        )}
      </div>

      <ToolDock tool={tool} onChange={setTool} />

      <button
        type="button"
        className="help-fab"
        title="Hướng dẫn sử dụng"
        onClick={() => setHelpOpen(true)}
      >
        <IconHelp />
      </button>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
