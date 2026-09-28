// Màn hình vào app: danh sách "phòng" (mỗi phòng là một bản vẽ độc lập, một
// dòng riêng trong bảng layouts trên Supabase) — mở, tạo mới, đổi tên, xoá.
// Chưa cấu hình Supabase thì vẫn hoạt động được, chỉ khác là danh sách lưu
// trong localStorage của riêng trình duyệt này (không chia sẻ được).
import { useEffect, useRef, useState } from "react";
import { supabase, LEGACY_ROOM_ID } from "./supabaseClient";
import { DEFAULT_GRID } from "./FloorPlan";

const ROOMS_INDEX_KEY = "roomsketch-rooms-index-v1";
const NAME_MIGRATION_HINT = `alter table layouts add column if not exists name text not null default 'Phòng chưa đặt tên';`;

function newRoomId() {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readLocalIndex() {
  try {
    const raw = localStorage.getItem(ROOMS_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalIndex(rooms) {
  try {
    localStorage.setItem(ROOMS_INDEX_KEY, JSON.stringify(rooms));
  } catch {
    // localStorage không khả dụng — bỏ qua, danh sách chỉ tồn tại trong phiên này
  }
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoomList({ onOpen }) {
  const [rooms, setRooms] = useState(null); // null = đang tải
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadRooms() {
    if (!supabase) {
      setRooms(readLocalIndex());
      return;
    }
    const { data, error: err } = await supabase
      .from("layouts")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false });
    if (!mountedRef.current) return;
    if (err) {
      setError(err.message);
      setRooms([]);
      return;
    }
    setError(null);
    setRooms(
      data.map((r) => ({
        id: r.id,
        name:
          r.name ||
          (r.id === LEGACY_ROOM_ID ? "Phòng cũ" : "Phòng chưa đặt tên"),
        updatedAt: r.updated_at,
      })),
    );
  }

  useEffect(() => {
    loadRooms();
    if (!supabase) return undefined;
    // Danh sách tự cập nhật khi có ai đó tạo/đổi tên/xoá phòng ở máy khác.
    const channel = supabase
      .channel("rooms-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "layouts" },
        () => loadRooms(),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoom() {
    const name = newName.trim() || "Phòng chưa đặt tên";
    setCreating(true);
    const id = newRoomId();
    const data = { items: [], gridSize: DEFAULT_GRID, comments: [] };
    if (supabase) {
      const { error: err } = await supabase
        .from("layouts")
        .insert({ id, name, data });
      setCreating(false);
      if (err) {
        setError(err.message);
        return;
      }
    } else {
      const next = [
        { id, name, updatedAt: new Date().toISOString() },
        ...readLocalIndex(),
      ];
      writeLocalIndex(next);
      setRooms(next);
      setCreating(false);
    }
    setNewName("");
    onOpen(id, name);
  }

  async function renameRoom(id) {
    const name = renameText.trim();
    setRenamingId(null);
    if (!name) return;
    if (supabase) {
      const { error: err } = await supabase
        .from("layouts")
        .update({ name })
        .eq("id", id);
      if (err) {
        setError(err.message);
        return;
      }
      loadRooms();
    } else {
      const next = readLocalIndex().map((r) =>
        r.id === id ? { ...r, name } : r,
      );
      writeLocalIndex(next);
      setRooms(next);
    }
  }

  async function deleteRoom(id, name) {
    if (!window.confirm(`Xoá phòng "${name}"? Không thể hoàn tác.`)) return;
    if (supabase) {
      const { error: err } = await supabase
        .from("layouts")
        .delete()
        .eq("id", id);
      if (err) {
        setError(err.message);
        return;
      }
      loadRooms();
    } else {
      const next = readLocalIndex().filter((r) => r.id !== id);
      writeLocalIndex(next);
      setRooms(next);
      try {
        localStorage.removeItem(`roomsketch-project-v1:${id}`);
      } catch {
        // bỏ qua
      }
    }
  }

  return (
    <div className="plan-shell room-list-shell">
      <div className="room-list-page">
        <header className="room-list-header">
          <h1>RoomSketch</h1>
          <p>
            {supabase
              ? "Chọn một phòng để mở, hoặc tạo phòng mới."
              : "Chưa cấu hình Supabase: danh sách phòng chỉ lưu trên trình duyệt này, không chia sẻ được."}
          </p>
        </header>

        <form
          className="room-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!creating) createRoom();
          }}
        >
          <input
            type="text"
            placeholder="Tên phòng mới (vd. Căn hộ 502)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={creating}>
            {creating ? "Đang tạo…" : "Tạo phòng mới"}
          </button>
        </form>

        {error && (
          <div className="room-list-error">
            <p>Không tải được danh sách phòng: {error}</p>
            <p>
              Có thể bảng <code>layouts</code> chưa có cột <code>name</code> —
              chạy trong SQL Editor của Supabase:
            </p>
            <pre>{NAME_MIGRATION_HINT}</pre>
          </div>
        )}

        {rooms === null ? (
          <p className="room-list-empty">Đang tải…</p>
        ) : rooms.length === 0 ? (
          <p className="room-list-empty">
            Chưa có phòng nào — tạo phòng đầu tiên ở trên.
          </p>
        ) : (
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.id} className="room-card">
                {renamingId === r.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => renameRoom(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="room-card-open"
                    onClick={() => onOpen(r.id, r.name)}
                  >
                    <span className="room-card-name">{r.name}</span>
                    {r.updatedAt && (
                      <span className="room-card-time">
                        Cập nhật {formatTime(r.updatedAt)}
                      </span>
                    )}
                  </button>
                )}
                <div className="room-card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(r.id);
                      setRenameText(r.name);
                    }}
                  >
                    Đổi tên
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => deleteRoom(r.id, r.name)}
                  >
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
