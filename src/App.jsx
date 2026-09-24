import FloorPlan from './FloorPlan'

function App() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Trình vẽ mặt bằng</h1>
        <p>
          Bắt đầu bằng cách thêm một khối "Phòng / Tường" từ toolbar rồi kéo-giãn
          thành ranh giới căn phòng, sau đó thêm nội thất. Đường kích thước tự hiện
          ra khi một món đồ đặt gần cạnh tường/cột; kéo lại gần vật khác sẽ tự khoá
          thẳng hàng. Mọi thay đổi tự lưu vào trình duyệt này — "Lưu ra file" chỉ để
          xuất một bản chụp ra src/layout.json.
        </p>
      </header>

      <main className="plan-wrap">
        <FloorPlan />
      </main>

      <footer className="legend">
        <span><i className="swatch wall" /> Container (tường/cột)</span>
        <span><i className="swatch fixture" /> Nội thất</span>
        <span><i className="swatch dim" /> Kích thước tự động (mm)</span>
      </footer>
    </div>
  )
}

export default App
