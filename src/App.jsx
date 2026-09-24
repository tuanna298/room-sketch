import FloorPlan from './FloorPlan'

function App() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Mặt bằng khu phụ (WC)</h1>
        <p>
          Số hoá lại từ bản phác thảo gốc, đơn vị milimét. Nền kẻ ô: ô nhỏ 100mm,
          ô đậm 500mm. Thêm nội thất từ toolbar bên trái, kéo để di chuyển, kéo góc
          để đổi kích cỡ hoặc chỉnh số liệu ở bảng thuộc tính bên phải, rồi bấm
          "Lưu thay đổi" để ghi đè vào file.
        </p>
      </header>

      <main className="plan-wrap">
        <FloorPlan />
      </main>

      <footer className="legend">
        <span><i className="swatch wall" /> Tường</span>
        <span><i className="swatch fixture" /> Nội thất</span>
        <span><i className="swatch dim" /> Đường kích thước (mm)</span>
      </footer>
    </div>
  )
}

export default App
