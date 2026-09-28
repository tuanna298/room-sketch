import { useEffect, useState } from "react";
import FloorPlan from "./FloorPlan";
import RoomList from "./RoomList";

// Điều hướng đơn giản bằng hash (#/r/<id>/<tên đã encode>), không cần thêm
// thư viện router — hoạt động tốt trên static hosting (Vercel...) vì không
// cần server rewrite, và F5 giữa chừng vẫn về đúng phòng đang mở.
function parseHash() {
  const m = /^#\/r\/([^/]+)(?:\/(.*))?$/.exec(window.location.hash);
  if (!m) return null;
  return { id: decodeURIComponent(m[1]), name: m[2] ? decodeURIComponent(m[2]) : "" };
}

function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route) {
    return (
      <FloorPlan
        key={route.id}
        roomId={route.id}
        roomName={route.name}
        onBack={() => {
          window.location.hash = "";
        }}
      />
    );
  }

  return (
    <RoomList
      onOpen={(id, name) => {
        window.location.hash = `#/r/${encodeURIComponent(id)}/${encodeURIComponent(name)}`;
      }}
    />
  );
}

export default App;
