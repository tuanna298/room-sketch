import FloorPlan from './FloorPlan'

function App() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Mặt bằng khu phụ (WC)</h1>
        <p>
          Số hoá lại từ bản phác thảo gốc, đơn vị milimét. Nền kẻ ô: ô nhỏ 100mm,
          ô đậm 500mm, dùng để ước lượng khoảng cách khi xem bản vẽ.
        </p>
      </header>

      <main className="plan-wrap">
        <FloorPlan />
      </main>

      <footer className="legend">
        <span><i className="swatch wall" /> Tường</span>
        <span><i className="swatch door" /> Cửa đi</span>
        <span><i className="swatch fixture" /> Thiết bị / tủ kệ</span>
        <span><i className="swatch dim" /> Đường kích thước (mm)</span>
      </footer>
    </div>
  )
}

export default App
