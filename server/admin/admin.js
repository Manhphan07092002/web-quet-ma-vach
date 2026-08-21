// ===== BIẾN TOÀN CỤC HỆ THỐNG ADMIN =====
var currentTab = 'dashboard';
var scanViewMode = 'grouped'; // 'grouped' | 'flat'
var cachedScans = [];
var chartTimeline = null;
var chartCategories = null;
var chartStaff = null;
var chartOrders = null;
var productSearchTimer = null;
var orderSearchTimer = null;

// ===== QUẢN LÝ GIAO DIỆN DARK / LIGHT MODE =====
function initAdminTheme() {
  const savedTheme = localStorage.getItem('admin_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyAdminTheme(savedTheme);
}

function applyAdminTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('admin_theme', theme);
  const icon = document.getElementById('adminThemeIcon');
  const text = document.getElementById('adminThemeText');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  if (text) text.textContent = theme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối';

  // Đồng bộ màu đường lưới và chữ trên Chart.js
  updateChartsTheme(theme);
}

function toggleAdminTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyAdminTheme(newTheme);
}

function updateChartsTheme(theme) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const doughnutBorder = isDark ? '#131b2e' : '#ffffff';

  const lineAndBarCharts = [
    typeof chartTimeline !== 'undefined' ? chartTimeline : null,
    typeof chartStaff !== 'undefined' ? chartStaff : null,
    typeof chartOrders !== 'undefined' ? chartOrders : null
  ];

  lineAndBarCharts.forEach(chart => {
    if (chart && chart.options && chart.options.scales) {
      if (chart.options.scales.x) {
        chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
        chart.options.scales.x.ticks.color = textColor;
        if (chart.options.scales.x.grid) chart.options.scales.x.grid.color = gridColor;
      }
      if (chart.options.scales.y) {
        chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
        chart.options.scales.y.ticks.color = textColor;
        if (chart.options.scales.y.grid) chart.options.scales.y.grid.color = gridColor;
      }
      chart.update();
    }
  });

  if (typeof chartCategories !== 'undefined' && chartCategories && chartCategories.data && chartCategories.data.datasets && chartCategories.data.datasets[0]) {
    chartCategories.data.datasets[0].borderColor = doughnutBorder;
    if (chartCategories.options && chartCategories.options.plugins && chartCategories.options.plugins.legend) {
      chartCategories.options.plugins.legend.labels = chartCategories.options.plugins.legend.labels || {};
      chartCategories.options.plugins.legend.labels.color = textColor;
    }
    chartCategories.update();
  }
}

// Khởi chạy theme ngay khi nạp script
initAdminTheme();

// ===== KIỂM TRA ĐĂNG NHẬP & PHÂN QUYỀN (RBAC AUTH GUARD) =====
function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem('adminUser') || '{}');
  } catch (e) {
    return {};
  }
}

function authFetch(url, options = {}) {
  const token = localStorage.getItem('adminToken');
  options.headers = options.headers || {};
  if (token) {
    if (options.headers instanceof Headers) {
      options.headers.set('Authorization', `Bearer ${token}`);
    } else {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return fetch(url, options);
}

function checkAdminAuth() {
  const token = localStorage.getItem('adminToken');
  const userJson = localStorage.getItem('adminUser');
  if (!token || !userJson) {
    window.location.href = 'login.html';
    return false;
  }
  try {
    const user = JSON.parse(userJson);
    if (user.role === 'scanner') {
      window.location.href = 'login.html';
      return false;
    }

    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    if (nameEl) nameEl.textContent = user.fullName || user.full_name || user.username;
    if (roleEl) {
      if (user.role === 'admin') roleEl.textContent = '👑 Quản trị viên';
      else if (user.role === 'manager') roleEl.textContent = '🏢 Quản lý kho';
      else roleEl.textContent = '📱 Nhân viên';
    }

    // Ẩn các chức năng nhạy cảm nếu không phải Admin tối cao
    if (user.role === 'manager') {
      const clearBtn = document.getElementById('clearBtn');
      if (clearBtn) clearBtn.style.display = 'none';

      const addBtn = document.querySelector('[onclick="showAddUserModal()"]');
      if (addBtn) addBtn.style.display = 'none';
    }

    return true;
  } catch (e) {
    window.location.href = 'login.html';
    return false;
  }
}

function handleLogout() {
  Swal.fire({
    title: 'Đăng xuất?',
    text: 'Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Đăng xuất',
    cancelButtonText: 'Hủy'
  }).then(r => {
    if (r.isConfirmed) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = 'login.html';
    }
  });
}

// Kiểm tra xác thực ngay khi nạp trang
checkAdminAuth();

const tbody = document.getElementById('scanTableBody');
const lastUpdateEl = document.getElementById('lastUpdate');
const connectionBadge = document.getElementById('connectionBadge');

let eventSource = null;

function updateConnectionStatus(status) {
  if (!connectionBadge) return;
  connectionBadge.className = 'connection-badge ' + status;
  if (status === 'connected') {
    connectionBadge.textContent = 'Trực tiếp (Live)';
  } else if (status === 'connecting') {
    connectionBadge.textContent = 'Đang kết nối...';
  } else {
    connectionBadge.textContent = 'Mất kết nối';
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('vi-VN', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function setScanViewMode(mode) {
  scanViewMode = mode;
  const btnGrouped = document.getElementById('btnViewGrouped');
  const btnFlat = document.getElementById('btnViewFlat');
  const flatWrapper = document.getElementById('flatTableWrapper');
  const groupedWrapper = document.getElementById('groupedOrdersWrapper');

  if (btnGrouped) btnGrouped.classList.toggle('active', mode === 'grouped');
  if (btnFlat) btnFlat.classList.toggle('active', mode === 'flat');

  if (flatWrapper) flatWrapper.style.display = mode === 'flat' ? 'block' : 'none';
  if (groupedWrapper) groupedWrapper.style.display = mode === 'grouped' ? 'flex' : 'none';

  renderScans();
}

window.setScanViewMode = setScanViewMode;

function handleScanFilterChange() {
  renderScans();
}

window.handleScanFilterChange = handleScanFilterChange;

function filterScansByOrder(orderCode) {
  const filterSelect = document.getElementById('scanOrderFilterSelect');
  if (filterSelect) {
    filterSelect.value = orderCode || 'ALL';
  }
  renderScans();
}

window.filterScansByOrder = filterScansByOrder;

function updateScanOrderFilterOptions(scans) {
  const select = document.getElementById('scanOrderFilterSelect');
  if (!select) return;

  const currentVal = select.value;
  const uniqueOrders = new Set();
  scans.forEach(s => {
    if (s.order_code) uniqueOrders.add(s.order_code);
  });

  if (Array.isArray(cachedOrders)) {
    cachedOrders.forEach(o => {
      if (o.order_code) uniqueOrders.add(o.order_code);
    });
  }

  let optionsHtml = `<option value="ALL">-- Tất cả đơn hàng (${scans.length} mã) --</option>`;
  Array.from(uniqueOrders).sort().forEach(code => {
    const orderObj = (cachedOrders || []).find(o => o.order_code === code);
    const orderLabel = orderObj ? `${code} - ${orderObj.order_name}` : code;
    const count = scans.filter(s => s.order_code === code).length;
    optionsHtml += `<option value="${code}">📦 ${orderLabel} (${count} mã)</option>`;
  });
  const freeScansCount = scans.filter(s => !s.order_code).length;
  optionsHtml += `<option value="NO_ORDER">-- Quét tự do / Không theo đơn (${freeScansCount} mã) --</option>`;

  select.innerHTML = optionsHtml;
  if (Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

async function fetchScans(highlightId = null) {
  try {
    const response = await fetch('/api/scans');
    const result = await response.json();
    
    if (result.success) {
      cachedScans = result.data || [];
      updateScanOrderFilterOptions(cachedScans);
      renderScans(highlightId);
      
      const now = new Date();
      if (lastUpdateEl) lastUpdateEl.textContent = `Cập nhật lúc: ${now.toLocaleTimeString('vi-VN')}`;
      
      const selectAll = document.getElementById('selectAll');
      if (selectAll) selectAll.checked = false;
    }
  } catch (err) {
    console.error('Failed to fetch scans:', err);
    if (lastUpdateEl) lastUpdateEl.textContent = 'Cập nhật thất bại!';
  }
}

function clearDateFilter() {
  const dateInput = document.getElementById('scanDateFilter');
  if (dateInput) dateInput.value = '';
  renderScans();
}

window.clearDateFilter = clearDateFilter;

function renderScans(highlightId = null) {
  const flatTbody = document.getElementById('scanTableBody');
  const groupedWrapper = document.getElementById('groupedOrdersWrapper');
  const orderFilter = document.getElementById('scanOrderFilterSelect')?.value || 'ALL';
  const dateFilter = document.getElementById('scanDateFilter')?.value || '';
  const query = document.getElementById('scanSearchInput')?.value.trim().toLowerCase() || '';

  let filtered = cachedScans.filter(scan => {
    // 1. Lọc theo đơn hàng
    if (orderFilter === 'NO_ORDER') {
      if (scan.order_code) return false;
    } else if (orderFilter !== 'ALL') {
      if (scan.order_code !== orderFilter) return false;
    }

    // 2. Lọc theo ngày quét
    if (dateFilter && scan.scanned_at) {
      const scanDate = new Date(scan.scanned_at).toISOString().slice(0, 10);
      if (scanDate !== dateFilter) return false;
    }

    // 3. Tìm kiếm theo từ khóa
    if (query) {
      const matchRaw = (scan.raw_data || '').toLowerCase().includes(query);
      const matchName = (scan.product_name || '').toLowerCase().includes(query);
      const matchSerial = (scan.serial_number || '').toLowerCase().includes(query);
      const matchUser = (scan.user_name || '').toLowerCase().includes(query);
      const matchOrder = (scan.order_code || '').toLowerCase().includes(query);
      if (!matchRaw && !matchName && !matchSerial && !matchUser && !matchOrder) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    if (flatTbody) flatTbody.innerHTML = `<tr><td colspan="11" class="loading-state">Không tìm thấy mã quét nào phù hợp.</td></tr>`;
    if (groupedWrapper) groupedWrapper.innerHTML = `<div class="loading-state" style="padding: 40px; text-align: center; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color);">Chưa có mã quét nào theo bộ lọc này.</div>`;
    return;
  }

  // 1. Render Flat Table
  if (flatTbody) {
    flatTbody.innerHTML = filtered.map(scan => renderScanRow(scan, highlightId, true)).join('');
  }

  // 2. Render Grouped by Order View
  if (groupedWrapper) {
    const groups = new Map();
    filtered.forEach(scan => {
      const key = scan.order_code || '__FREE__';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(scan);
    });

    let groupedHtml = '';
    for (const [orderCode, scansList] of groups.entries()) {
      const isFree = orderCode === '__FREE__';
      const orderObj = (cachedOrders || []).find(o => o.order_code === orderCode);
      const title = isFree ? 'Quét Tự Do (Không theo đơn hàng)' : (orderObj ? `${orderObj.order_name}` : `Đơn hàng ${orderCode}`);
      const subtitle = isFree ? 'Các mã quét tự do phát sinh ngoài danh sách đơn hàng' : `Khách hàng: ${orderObj?.customer_name || 'Nội bộ'} ${orderObj?.notes ? `| ${orderObj.notes}` : ''}`;
      const badgePill = isFree ? `<span class="order-badge" style="background:#e2e8f0; color:#475569;">Tự do</span>` : `<span class="order-badge-pill">${orderCode}</span>`;
      const idsJson = JSON.stringify(scansList.map(s => s.id));

      groupedHtml += `
        <div class="scan-order-group-card">
          <div class="scan-order-group-header">
            <div class="order-header-left">
              ${badgePill}
              <div>
                <div class="order-group-title">${title}</div>
                <div class="order-group-subtitle">${subtitle}</div>
              </div>
            </div>
            <div class="order-header-right">
              <span class="order-count-badge">🔢 ${scansList.length} mã đã quét</span>
              ${!isFree && orderObj ? `<button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="viewOrderDetail(${orderObj.id})">🔍 Tiến độ</button>` : ''}
              <button class="btn btn-success" style="padding: 4px 10px; font-size: 12px;" onclick='exportScansByIds(${idsJson})' title="Xuất Excel cho riêng đơn hàng này">📥 Xuất Excel</button>
            </div>
          </div>
          <div class="table-container" style="border: none; border-radius: 0; box-shadow: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th width="40"><input type="checkbox" class="group-select-all" onclick="toggleGroupSelectAll(this)"></th>
                  <th>Thời gian</th>
                  <th>Nhân viên</th>
                  <th>Hình ảnh</th>
                  <th>Dữ liệu gốc (S/N)</th>
                  <th>Loại mã</th>
                  <th>Sản phẩm</th>
                  <th>Serial</th>
                  <th>Thiết bị</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${scansList.map(scan => renderScanRow(scan, highlightId, false)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
    groupedWrapper.innerHTML = groupedHtml;
  }
}

function renderScanRow(scan, highlightId, showOrderCol = true) {
  const rawEscaped = (scan.raw_data || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const nameEscaped = (scan.product_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const serialEscaped = (scan.serial_number || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const deviceEscaped = (scan.device_id || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const typeEscaped = (scan.code_type || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const isNewClass = highlightId && scan.id === highlightId ? ' class="row-new"' : '';

  return `
    <tr${isNewClass}>
      <td style="text-align: center;"><input type="checkbox" class="scan-checkbox" value="${scan.id}"></td>
      <td>${new Date(scan.scanned_at).toLocaleString('vi-VN')}</td>
      <td><span class="user-badge-table">👤 ${scan.user_name || 'Nội bộ'}</span></td>
      ${showOrderCol ? `<td>${scan.order_code ? `<span class="order-badge" style="cursor:pointer;" onclick="filterScansByOrder('${scan.order_code}')" title="Nhấn để lọc riêng đơn này">${scan.order_code}</span>` : '<span style="color:#9ca3af;font-size:12px;">-</span>'}</td>` : ''}
      <td>${scan.image_path ? `<button onclick="viewImage('${scan.image_path}')" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;">Xem ảnh</button>` : '<span style="color:#9ca3af;font-size:12px;">Không có</span>'}</td>
      <td style="font-weight: 500; font-family: monospace;">${scan.raw_data}</td>
      <td><span class="status-badge ${scan.code_type === 'OCR_TEXT' ? 'ocr' : ''}">${scan.code_type || 'N/A'}</span></td>
      <td style="font-weight: 600;">${scan.product_name || '-'}</td>
      <td>${scan.serial_number || '-'}</td>
      <td>${scan.device_id || '-'}</td>
      <td style="display:flex; gap:4px; flex-wrap:wrap;">
        <button class="btn btn-primary" style="padding:4px 8px;font-size:12px;" onclick="editScan(${scan.id}, '${rawEscaped}', '${nameEscaped}', '${serialEscaped}', '${deviceEscaped}', '${typeEscaped}')">Sửa</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:12px;" onclick="deleteScan(${scan.id})">Xóa</button>
      </td>
    </tr>
  `;
}

function toggleGroupSelectAll(sourceCheckbox) {
  const table = sourceCheckbox.closest('table');
  if (!table) return;
  const checkboxes = table.querySelectorAll('.scan-checkbox');
  checkboxes.forEach(cb => cb.checked = sourceCheckbox.checked);
}

window.toggleGroupSelectAll = toggleGroupSelectAll;

async function clearScans() {
  const currentUser = getAdminUser();
  if (currentUser.role !== 'admin') {
    Swal.fire('Quyền hạn', 'Chỉ Quản trị viên (Admin) mới có quyền Xóa toàn bộ lịch sử quét!', 'warning');
    return;
  }

  const result = await Swal.fire({
    title: 'Xóa tất cả?',
    text: "Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử quét không? Hành động này không thể hoàn tác!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Đúng, Xóa tất cả!',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;
  
  try {
    const response = await authFetch('/api/scans', { method: 'DELETE' });
    const data = await response.json();
    if (data.success) {
      Swal.fire('Thành công!', 'Đã xóa toàn bộ lịch sử.', 'success');
      fetchScans();
    } else {
      Swal.fire('Lỗi', "Lỗi xóa dữ liệu: " + data.message, 'error');
    }
  } catch (err) {
    Swal.fire('Lỗi', 'Không thể kết nối đến máy chủ', 'error');
  }
}

async function deleteSelectedScans() {
  const checkboxes = document.querySelectorAll('.scan-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  if (ids.length === 0) {
    Swal.fire('Oops...', 'Vui lòng chọn ít nhất một mục để xóa!', 'info');
    return;
  }

  const result = await Swal.fire({
    title: 'Xóa mục đã chọn?',
    text: `Bạn có chắc chắn muốn xóa ${ids.length} mục đã chọn không?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#f59e0b',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Đồng ý xóa',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;

  try {
    const response = await fetch('/api/scans/delete', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await response.json();
    
    if (data.success) {
      Swal.fire('Thành công!', data.message, 'success');
      fetchScans();
    } else {
      Swal.fire('Lỗi', "Lỗi xóa dữ liệu: " + data.message, 'error');
    }
  } catch (err) {
    console.error('Lỗi khi gọi API xóa:', err);
    Swal.fire('Lỗi mạng', "Không thể kết nối đến máy chủ để xóa!", 'error');
  }
}

async function exportScansByIds(ids = []) {
  try {
    const response = await fetch('/api/scans/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.length > 0 ? ids : [] })
    });
    
    if (!response.ok) {
      const data = await response.json();
      Swal.fire('Lỗi', data.message || "Lỗi xuất file", 'error');
      return;
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_sach_quet_ma_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    
    Swal.fire({
      title: 'Xuất file thành công!',
      text: ids.length > 0 ? `Đã xuất ${ids.length} mã quét.` : 'Đã xuất toàn bộ dữ liệu.',
      icon: 'success',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000
    });
  } catch (err) {
    console.error('Lỗi khi xuất file:', err);
    Swal.fire('Lỗi mạng', "Không thể tải file Excel!", 'error');
  }
}

window.exportScansByIds = exportScansByIds;

async function exportScans() {
  const checkboxes = document.querySelectorAll('.scan-checkbox:checked');
  let ids = Array.from(checkboxes).map(cb => parseInt(cb.value));

  // Nếu không chọn checkbox nào nhưng đang lọc theo 1 đơn hàng cụ thể -> Xuất các mã của đơn đó
  if (ids.length === 0) {
    const orderFilter = document.getElementById('scanOrderFilterSelect')?.value;
    if (orderFilter && orderFilter !== 'ALL') {
      const filteredScans = cachedScans.filter(s => orderFilter === 'NO_ORDER' ? !s.order_code : s.order_code === orderFilter);
      ids = filteredScans.map(s => s.id);
    }
  }
  
  await exportScansByIds(ids);
}

function toggleSelectAll() {
  const isChecked = document.getElementById('selectAll').checked;
  const checkboxes = document.querySelectorAll('.scan-checkbox');
  checkboxes.forEach(cb => cb.checked = isChecked);
}

function viewImage(imagePath) {
  Swal.fire({
    title: 'Ảnh chụp mã vạch',
    imageUrl: imagePath,
    imageAlt: 'Barcode Image',
    imageWidth: '100%',
    width: '600px',
    showConfirmButton: false,
    showCloseButton: true
  });
}

window.deleteScan = async function(id) {
  const result = await Swal.fire({
    title: 'Xóa mục này?',
    text: "Bạn không thể hoàn tác!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Xóa',
    cancelButtonText: 'Hủy'
  });

  if (result.isConfirmed) {
    try {
      const response = await fetch('/api/scans/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] })
      });
      const data = await response.json();
      if (data.success) {
        Swal.fire({ title: 'Đã xóa!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        fetchScans();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi mạng', "Không kết nối được máy chủ", 'error');
    }
  }
};

window.editScan = async function(id, rawData, productName, serialNumber, deviceId, codeType) {
  // Lấy danh sách sản phẩm từ server
  let productsList = [];
  try {
    const pRes = await fetch('/api/products');
    const pData = await pRes.json();
    if (pData.success && Array.isArray(pData.data)) {
      productsList = pData.data;
    }
  } catch (e) {
    console.error("Không tải được danh mục:", e);
  }

  const { value: formValues } = await Swal.fire({
    title: 'Sửa thông tin',
    html: `
      <style>
        .edit-form { text-align: left; }
        .edit-form .swal-form-group { margin-bottom: 12px; }
        .edit-form label { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 4px; color: #374151; font-size: 13px; }
        .edit-form input.swal2-input { margin: 0; width: 100%; box-sizing: border-box; height: 38px; font-size: 14px; border-radius: 8px; border: 1px solid #d1d5db; font-family: inherit; }
        .edit-form input.swal2-input:focus { border-color: #4f46e5; outline: none; }
        .autocomplete-container { position: relative; }
        .autocomplete-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 210px;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 99999;
          display: none;
        }
        .autocomplete-item {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.15s ease;
        }
        .autocomplete-item:hover {
          background-color: #eef2ff;
        }
        .autocomplete-item:last-child {
          border-bottom: none;
        }
      </style>
      <div class="edit-form">
        <div class="swal-form-group">
          <label>Mã gốc (Không thể sửa)</label>
          <input type="text" class="swal2-input" value="${rawData}" disabled style="background:#f3f4f6; color:#9ca3af; cursor:not-allowed; font-family:monospace;">
        </div>
        <div class="swal-form-group">
          <label>
            <span>Tên sản phẩm</span>
            <span style="font-size: 11px; color: #4f46e5; font-weight: 600;">⚡ Gõ để tìm kiếm tự động</span>
          </label>
          <div class="autocomplete-container">
            <input id="swal-name" class="swal2-input" value="${productName || ''}" placeholder="🔍 Nhập để tìm kiếm SP (VD: RG, Cáp, Sophos...)" autocomplete="off">
            <div id="swal-autocomplete-list" class="autocomplete-list"></div>
          </div>
        </div>
        <div class="swal-form-group">
          <label>Số Serial</label>
          <input id="swal-serial" class="swal2-input" value="${serialNumber || ''}" placeholder="Nhập serial...">
        </div>
        <div class="swal-form-group">
          <label>Ghi chú / Thiết bị</label>
          <input id="swal-device" class="swal2-input" value="${deviceId || ''}" placeholder="Ghi chú thiết bị...">
        </div>
        <div class="swal-form-group">
          <label>Loại mã</label>
          <input id="swal-type" class="swal2-input" value="${codeType || 'CODE_128'}">
        </div>
      </div>
    `,
    didOpen: () => {
      const input = document.getElementById('swal-name');
      const list = document.getElementById('swal-autocomplete-list');

      function renderSuggestions(query = '') {
        const q = query.trim().toLowerCase();
        let matches = [];
        if (!q) {
          matches = productsList.slice(0, 10);
        } else {
          matches = productsList.filter(p => 
            (p.product_name && p.product_name.toLowerCase().includes(q)) ||
            (p.product_code && p.product_code.toLowerCase().includes(q)) ||
            (p.model && p.model.toLowerCase().includes(q))
          ).slice(0, 15);
        }

        if (matches.length === 0) {
          list.innerHTML = `<div style="padding: 10px; color: #94a3b8; font-size: 12px; text-align: center;">Không tìm thấy sản phẩm phù hợp</div>`;
          list.style.display = 'block';
          return;
        }

        list.innerHTML = matches.map(p => `
          <div class="autocomplete-item" data-name="${(p.product_name || '').replace(/"/g, '&quot;')}" data-code="${(p.product_code || '').replace(/"/g, '&quot;')}">
            <div style="font-weight: 600; color: #1e293b; font-size: 13px; line-height: 1.3;">${p.product_name}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              Mã: <span style="color: #4f46e5; font-weight: 600;">${p.product_code}</span> ${p.model ? `| Model: ${p.model}` : ''}
            </div>
          </div>
        `).join('');

        list.querySelectorAll('.autocomplete-item').forEach(item => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = item.getAttribute('data-name');
            list.style.display = 'none';
          });
        });

        list.style.display = 'block';
      }

      input.addEventListener('input', () => {
        renderSuggestions(input.value);
      });

      input.addEventListener('focus', () => {
        renderSuggestions(input.value);
      });

      input.addEventListener('blur', () => {
        setTimeout(() => { list.style.display = 'none'; }, 200);
      });
    },
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Lưu thay đổi',
    cancelButtonText: 'Hủy',
    width: '520px',
    preConfirm: () => {
      return {
        productName: document.getElementById('swal-name').value.trim(),
        serialNumber: document.getElementById('swal-serial').value.trim(),
        deviceId: document.getElementById('swal-device').value.trim(),
        codeType: document.getElementById('swal-type').value.trim()
      }
    }
  });

  if (formValues) {
    try {
      const response = await fetch('/api/scans/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const result = await response.json();
      if (result.success) {
        Swal.fire({ title: 'Đã cập nhật!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        fetchScans();
      } else {
        Swal.fire('Lỗi', result.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không kết nối được máy chủ', 'error');
    }
  }
};

function initSSE() {
  if (eventSource) {
    eventSource.close();
  }

  updateConnectionStatus('connecting');
  eventSource = new EventSource('/api/scans/stream');

  eventSource.addEventListener('connected', () => {
    updateConnectionStatus('connected');
  });

  eventSource.onopen = () => {
    updateConnectionStatus('connected');
  };

  eventSource.addEventListener("order_created", (e) => {
    if (currentTab === 'orders') fetchOrders();
  });

  eventSource.addEventListener("order_updated", (e) => {
    if (currentTab === 'orders') fetchOrders();
  });

  eventSource.addEventListener("order_deleted", (e) => {
    if (currentTab === 'orders') fetchOrders();
  });

  eventSource.addEventListener("user_created", (e) => {
    if (currentTab === 'users') fetchUsers();
  });

  eventSource.addEventListener("user_updated", (e) => {
    if (currentTab === 'users') fetchUsers();
  });

  eventSource.addEventListener("user_deleted", (e) => {
    if (currentTab === 'users') fetchUsers();
  });

  eventSource.addEventListener('scan_created', (e) => {
    try {
      const newScan = JSON.parse(e.data);
      if (currentTab === 'scans') {
        fetchScans(newScan.id);
      } else if (currentTab === 'dashboard') {
        fetchDashboardStats();
      } else if (currentTab === 'orders') {
        fetchOrders();
      }
    } catch (err) {
      console.error('Error handling scan_created SSE:', err);
    }
  });

  eventSource.addEventListener('scan_updated', () => {
    fetchScans();
  });

  eventSource.addEventListener('scan_deleted', () => {
    fetchScans();
  });

  eventSource.addEventListener('scan_cleared', () => {
    fetchScans();
  });

  eventSource.onerror = (err) => {
    console.warn("SSE Connection lost. Retrying in 5s...", err);
    updateConnectionStatus('disconnected');
  };
}

// ===== QUẢN LÝ TAB (DASHBOARD, ĐƠN HÀNG, LỊCH SỬ, SẢN PHẨM, NHÂN SỰ) =====
const productTbody = document.getElementById('productTableBody');
const orderTbody = document.getElementById('orderTableBody');
const userTbody = document.getElementById('userTableBody');

function switchTab(tab) {
  currentTab = tab;
  const tabs = ['dashboard', 'orders', 'scans', 'products', 'users'];
  tabs.forEach(t => {
    const navEl = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
    const paneEl = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (navEl) navEl.classList.toggle('active', t === tab);
    if (paneEl) paneEl.style.display = t === tab ? (t === 'dashboard' || t === 'scans' || t === 'orders' || t === 'products' || t === 'users' ? 'block' : 'flex') : 'none';
  });

  if (tab === 'dashboard') {
    fetchDashboardStats();
  } else if (tab === 'orders') {
    fetchOrders();
  } else if (tab === 'scans') {
    fetchScans();
  } else if (tab === 'products') {
    fetchProducts();
  } else if (tab === 'users') {
    fetchUsers();
  }
}

window.switchTab = switchTab;

// ===== DASHBOARD & CHART.JS INSTANCES =====

async function fetchDashboardStats() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const result = await res.json();
    if (!result.success) return;

    const { kpi, charts } = result.data;

    // Cập nhật các thẻ KPI
    const kpiScans = document.getElementById('kpiTotalScans');
    const kpiOrders = document.getElementById('kpiOrdersSummary');
    const kpiProds = document.getElementById('kpiTotalProducts');
    const kpiRate = document.getElementById('kpiOverallRate');
    const dashUpdate = document.getElementById('dashLastUpdate');

    if (kpiScans) kpiScans.textContent = kpi.total_scans.toLocaleString();
    if (kpiOrders) kpiOrders.innerHTML = `<b>${kpi.total_orders}</b> <span style="font-size:12px;font-weight:600;color:#64748b;">(${kpi.completed_orders} xong)</span>`;
    if (kpiProds) kpiProds.textContent = kpi.total_products.toLocaleString();
    if (kpiRate) kpiRate.textContent = `${kpi.overall_rate}%`;
    if (dashUpdate) dashUpdate.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;

    // 1. Render Chart: Timeline (Xu hướng quét)
    const ctxTimeline = document.getElementById('chartScansTimeline')?.getContext('2d');
    if (ctxTimeline) {
      const dates = charts.scans_by_date.map(d => d.date);
      const counts = charts.scans_by_date.map(d => d.count);

      if (chartTimeline) {
        chartTimeline.data.labels = dates;
        chartTimeline.data.datasets[0].data = counts;
        chartTimeline.update();
      } else {
        chartTimeline = new Chart(ctxTimeline, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Lượt quét',
              data: counts,
              borderColor: '#4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.12)',
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointBackgroundColor: '#4f46e5',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { precision: 0 } },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

    // 2. Render Chart: Categories Doughnut (Phân bố thiết bị)
    const ctxCategories = document.getElementById('chartProductCategories')?.getContext('2d');
    if (ctxCategories) {
      const catLabels = charts.product_categories.map(c => c.category);
      const catData = charts.product_categories.map(c => c.count);
      const palette = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];

      if (chartCategories) {
        chartCategories.data.labels = catLabels;
        chartCategories.data.datasets[0].data = catData;
        chartCategories.update();
      } else {
        chartCategories = new Chart(ctxCategories, {
          type: 'doughnut',
          data: {
            labels: catLabels,
            datasets: [{
              data: catData,
              backgroundColor: palette.slice(0, catLabels.length),
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
            }
          }
        });
      }
    }

    // 3. Render Chart: Staff Productivity (Năng suất nhân viên)
    const ctxStaff = document.getElementById('chartStaffProductivity')?.getContext('2d');
    if (ctxStaff) {
      const staffNames = charts.staff_productivity.map(s => s.user_name);
      const staffCounts = charts.staff_productivity.map(s => s.count);

      if (chartStaff) {
        chartStaff.data.labels = staffNames;
        chartStaff.data.datasets[0].data = staffCounts;
        chartStaff.update();
      } else {
        chartStaff = new Chart(ctxStaff, {
          type: 'bar',
          data: {
            labels: staffNames,
            datasets: [{
              label: 'Số mã đã quét',
              data: staffCounts,
              backgroundColor: '#3b82f6',
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0 } },
              y: { grid: { display: false } }
            }
          }
        });
      }
    }

    // 4. Render Chart: Orders Progress (Tiến độ đơn hàng)
    const ctxOrders = document.getElementById('chartOrdersProgress')?.getContext('2d');
    if (ctxOrders) {
      const orderCodes = charts.orders_progress.map(o => o.order_code);
      const orderPercents = charts.orders_progress.map(o => o.percent);

      if (chartOrders) {
        chartOrders.data.labels = orderCodes;
        chartOrders.data.datasets[0].data = orderPercents;
        chartOrders.update();
      } else {
        chartOrders = new Chart(ctxOrders, {
          type: 'bar',
          data: {
            labels: orderCodes,
            datasets: [{
              label: 'Tiến độ (%)',
              data: orderPercents,
              backgroundColor: orderPercents.map(p => p === 100 ? '#10b981' : '#6366f1'),
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
              x: { grid: { display: false } }
            }
          }
        });
      }
    }

  } catch(e) {
    console.error("Lỗi cập nhật dashboard stats:", e);
  }
}

// ===== QUẢN LÝ NGƯỜI DÙNG & PHÂN QUYỀN =====
async function fetchUsers() {
  if (!userTbody) return;
  try {
    const res = await authFetch('/api/users');
    const result = await res.json();
    if (result.success) {
      const users = result.data;
      const currentUser = getAdminUser();
      const isAdmin = currentUser.role === 'admin';

      if (users.length === 0) {
        userTbody.innerHTML = `<tr><td colspan="7" class="loading-state">Chưa có người dùng nào.</td></tr>`;
      } else {
        userTbody.innerHTML = users.map((u, idx) => {
          let roleLabel = 'Nhân viên quét';
          let roleClass = 'scanner';
          if (u.role === 'admin') { roleLabel = '👑 Quản trị viên'; roleClass = 'admin'; }
          else if (u.role === 'manager') { roleLabel = '🏢 Quản lý kho'; roleClass = 'manager'; }

          const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '-';
          const nameEsc = (u.full_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const userEsc = (u.username || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

          let actionButtons = '';
          if (isAdmin) {
            actionButtons = `
              <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="editUser(${u.id}, '${nameEsc}', '${u.role}', '${u.pin_code || ''}')">Sửa</button>
              ${u.username !== 'admin' ? `<button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteUser(${u.id}, '${userEsc}')">Xóa</button>` : ''}
            `;
          } else {
            actionButtons = `<span style="font-size: 11.5px; color: #94a3b8; font-style: italic;">🔒 Chỉ xem</span>`;
          }

          return `
            <tr>
              <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
              <td style="font-weight: 700; font-family: monospace; color: var(--primary);">${u.username}</td>
              <td style="font-weight: 600;">${u.full_name}</td>
              <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
              <td style="font-family: monospace; letter-spacing: 2px;">${u.pin_code ? '••••' : '-'}</td>
              <td>${createdDate}</td>
              <td style="display: flex; gap: 6px; align-items: center;">
                ${actionButtons}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch(e) {
    userTbody.innerHTML = `<tr><td colspan="7" class="loading-state">Lỗi kết nối khi tải danh sách nhân sự!</td></tr>`;
  }
}

async function showAddUserModal() {
  const currentUser = getAdminUser();
  if (currentUser.role !== 'admin') {
    Swal.fire('Quyền hạn', 'Chỉ Quản trị viên (Admin) mới có quyền Thêm nhân viên mới!', 'warning');
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: 'Thêm Nhân Viên Mới',
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Tên đăng nhập (*)</label>
          <input id="swal-user-name" placeholder="Ví dụ: nvkho3" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Họ và tên (*)</label>
          <input id="swal-full-name" placeholder="Ví dụ: Hoàng Văn D" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Vai trò phân quyền</label>
          <select id="swal-role" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
            <option value="scanner">📱 Nhân viên quét kho (Chỉ quét & xem checklist)</option>
            <option value="manager">🏢 Quản lý kho (Tạo đơn hàng & xem báo cáo)</option>
            <option value="admin">👑 Quản trị viên (Toàn quyền hệ thống)</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Mã PIN nhanh (4 số)</label>
          <input id="swal-pin" type="password" maxlength="6" value="1234" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Tạo tài khoản',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const u = document.getElementById('swal-user-name').value.trim();
      const fn = document.getElementById('swal-full-name').value.trim();
      const r = document.getElementById('swal-role').value;
      const p = document.getElementById('swal-pin').value.trim();
      if (!u || !fn) {
        Swal.showValidationMessage('Vui lòng nhập Tên đăng nhập và Họ tên!');
        return false;
      }
      return { username: u, fullName: fn, role: r, pinCode: p };
    }
  });

  if (formValues) {
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã tạo nhân viên!', showConfirmButton: false, timer: 1500 });
        fetchUsers();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch(e) {
      Swal.fire('Lỗi', 'Không kết nối được máy chủ', 'error');
    }
  }
}

async function editUser(id, currentName, currentRole, currentPin) {
  const currentUser = getAdminUser();
  if (currentUser.role !== 'admin') {
    Swal.fire('Quyền hạn', 'Chỉ Quản trị viên (Admin) mới có quyền Sửa nhân viên!', 'warning');
    return;
  }

  const { value: formValues } = await Swal.fire({
    title: 'Sửa Thông Tin Nhân Viên',
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Họ và tên (*)</label>
          <input id="swal-full-name" value="${currentName}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Vai trò phân quyền</label>
          <select id="swal-role" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
            <option value="scanner" ${currentRole === 'scanner' ? 'selected' : ''}>📱 Nhân viên quét kho</option>
            <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>🏢 Quản lý kho</option>
            <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>👑 Quản trị viên</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Mã PIN nhanh</label>
          <input id="swal-pin" type="text" maxlength="6" value="${currentPin || '1234'}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-family: monospace;">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Lưu thay đổi',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const fn = document.getElementById('swal-full-name').value.trim();
      const r = document.getElementById('swal-role').value;
      const p = document.getElementById('swal-pin').value.trim();
      if (!fn) {
        Swal.showValidationMessage('Vui lòng nhập Họ tên!');
        return false;
      }
      return { fullName: fn, role: r, pinCode: p };
    }
  });

  if (formValues) {
    try {
      const res = await authFetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã cập nhật nhân viên!', showConfirmButton: false, timer: 1500 });
        fetchUsers();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch(e) {
      Swal.fire('Lỗi', 'Không kết nối được máy chủ', 'error');
    }
  }
}

async function deleteUser(id, username) {
  const currentUser = getAdminUser();
  if (currentUser.role !== 'admin') {
    Swal.fire('Quyền hạn', 'Chỉ Quản trị viên (Admin) mới có quyền Xóa nhân viên!', 'warning');
    return;
  }

  const result = await Swal.fire({
    title: 'Xóa nhân viên?',
    text: `Bạn có chắc chắn muốn xóa tài khoản "${username}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Đúng, Xóa!',
    cancelButtonText: 'Hủy'
  });

  if (result.isConfirmed) {
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã xóa người dùng', showConfirmButton: false, timer: 1500 });
        fetchUsers();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch(e) {
      Swal.fire('Lỗi mạng', 'Không thể xóa người dùng', 'error');
    }
  }
}

async function fetchProducts(searchQuery = '') {
  try {
    const url = searchQuery ? `/api/products?search=${encodeURIComponent(searchQuery)}` : '/api/products';
    const response = await fetch(url);
    const result = await response.json();

    if (result.success) {
      const products = result.data;
      if (products.length === 0) {
        productTbody.innerHTML = `<tr><td colspan="7" class="loading-state">Không có sản phẩm nào.</td></tr>`;
      } else {
        productTbody.innerHTML = products.map((prod, index) => {
          const codeEsc = (prod.product_code || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const nameEsc = (prod.product_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const modelEsc = (prod.model || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const descEsc = (prod.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const createdDate = prod.created_at ? new Date(prod.created_at).toLocaleDateString('vi-VN') : '-';

          return `
            <tr>
              <td style="text-align: center; color: var(--text-muted);">${index + 1}</td>
              <td style="font-weight: 600; color: var(--primary);">${prod.product_code}</td>
              <td style="font-weight: 500;">${prod.product_name}</td>
              <td>${prod.model || '-'}</td>
              <td style="color: var(--text-muted); max-width: 250px;">${prod.description || '-'}</td>
              <td>${createdDate}</td>
              <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; font-weight: 700;" onclick="printProductLabel('${codeEsc}', '${nameEsc}', '${modelEsc}')" title="In tem mã vạch / QR">🏷️ In Tem</button>
                <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="editProduct(${prod.id}, '${codeEsc}', '${nameEsc}', '${modelEsc}', '${descEsc}')">Sửa</button>
                <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteProduct(${prod.id}, '${nameEsc}')">Xóa</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Lỗi khi tải danh mục sản phẩm:', err);
    productTbody.innerHTML = `<tr><td colspan="7" class="loading-state">Lỗi kết nối máy chủ!</td></tr>`;
  }
}

function handleProductSearch() {
  clearTimeout(productSearchTimer);
  const val = document.getElementById('productSearchInput').value;
  productSearchTimer = setTimeout(() => {
    fetchProducts(val);
  }, 300);
}

async function showAddProductModal() {
  const { value: formValues } = await Swal.fire({
    title: 'Thêm sản phẩm mới',
    html: `
      <style>
        .form-group { text-align: left; margin-bottom: 12px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 13px; color: #374151; }
        .form-group input, .form-group textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 14px; }
        .form-group input:focus, .form-group textarea:focus { border-color: #4f46e5; outline: none; }
      </style>
      <div class="form-group">
        <label>Mã sản phẩm (Barcode / SKU) *</label>
        <input id="swal-prod-code" placeholder="Ví dụ: SP-1001 hoặc mã vạch 13 số">
      </div>
      <div class="form-group">
        <label>Tên sản phẩm *</label>
        <input id="swal-prod-name" placeholder="Ví dụ: Cáp sạc Type-C Anker 60W">
      </div>
      <div class="form-group">
        <label>Model / Quy cách</label>
        <input id="swal-prod-model" placeholder="Ví dụ: A8188 - Dài 0.9m">
      </div>
      <div class="form-group">
        <label>Mô tả / Ghi chú</label>
        <textarea id="swal-prod-desc" rows="2" placeholder="Ghi chú thêm về sản phẩm..."></textarea>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Lưu sản phẩm',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const code = document.getElementById('swal-prod-code').value.trim();
      const name = document.getElementById('swal-prod-name').value.trim();
      if (!code || !name) {
        Swal.showValidationMessage('Vui lòng nhập đầy đủ Mã và Tên sản phẩm!');
        return false;
      }
      return {
        productCode: code,
        productName: name,
        model: document.getElementById('swal-prod-model').value.trim(),
        description: document.getElementById('swal-prod-desc').value.trim()
      };
    }
  });

  if (formValues) {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const result = await res.json();
      if (result.success) {
        Swal.fire({ title: 'Thành công!', text: 'Đã thêm sản phẩm mới', icon: 'success', timer: 1500, showConfirmButton: false });
        fetchProducts();
      } else {
        Swal.fire('Lỗi', result.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể kết nối đến máy chủ', 'error');
    }
  }
}

async function editProduct(id, code, name, model, desc) {
  const { value: formValues } = await Swal.fire({
    title: 'Chỉnh sửa sản phẩm',
    html: `
      <style>
        .form-group { text-align: left; margin-bottom: 12px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 13px; color: #374151; }
        .form-group input, .form-group textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 14px; }
        .form-group input:focus, .form-group textarea:focus { border-color: #4f46e5; outline: none; }
      </style>
      <div class="form-group">
        <label>Mã sản phẩm (Barcode / SKU) *</label>
        <input id="swal-prod-code" value="${code}">
      </div>
      <div class="form-group">
        <label>Tên sản phẩm *</label>
        <input id="swal-prod-name" value="${name}">
      </div>
      <div class="form-group">
        <label>Model / Quy cách</label>
        <input id="swal-prod-model" value="${model}">
      </div>
      <div class="form-group">
        <label>Mô tả / Ghi chú</label>
        <textarea id="swal-prod-desc" rows="2">${desc}</textarea>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Cập nhật',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const codeVal = document.getElementById('swal-prod-code').value.trim();
      const nameVal = document.getElementById('swal-prod-name').value.trim();
      if (!codeVal || !nameVal) {
        Swal.showValidationMessage('Vui lòng nhập đầy đủ Mã và Tên sản phẩm!');
        return false;
      }
      return {
        productCode: codeVal,
        productName: nameVal,
        model: document.getElementById('swal-prod-model').value.trim(),
        description: document.getElementById('swal-prod-desc').value.trim()
      };
    }
  });

  if (formValues) {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const result = await res.json();
      if (result.success) {
        Swal.fire({ title: 'Thành công!', text: 'Đã cập nhật sản phẩm', icon: 'success', timer: 1500, showConfirmButton: false });
        fetchProducts();
      } else {
        Swal.fire('Lỗi', result.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể kết nối đến máy chủ', 'error');
    }
  }
}

async function deleteProduct(id, name) {
  const result = await Swal.fire({
    title: 'Xóa sản phẩm?',
    text: `Bạn có chắc muốn xóa sản phẩm "${name}" không?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Xóa',
    cancelButtonText: 'Hủy'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ title: 'Đã xóa!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        fetchProducts();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể kết nối đến máy chủ', 'error');
    }
  }
}

async function exportProducts() {
  try {
    const res = await fetch('/api/products/export');
    if (!res.ok) {
      const data = await res.json();
      Swal.fire('Lỗi', data.message || "Lỗi xuất file", 'error');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_muc_san_pham_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    Swal.fire({ title: 'Xuất file thành công!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
  } catch (err) {
    Swal.fire('Lỗi', 'Không thể tải file Excel danh mục', 'error');
  }
}

async function handleProductImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson = XLSX.utils.sheet_to_json(worksheet);

    if (rawJson.length === 0) {
      Swal.fire('Thông báo', 'File Excel không có dữ liệu!', 'warning');
      event.target.value = '';
      return;
    }

    // Map các cột Tiếng Việt / Tiếng Anh linh hoạt
    const products = rawJson.map(row => {
      const product_code = row['Mã sản phẩm'] || row['Mã SP'] || row['Barcode'] || row['product_code'] || row['Code'] || '';
      const product_name = row['Tên sản phẩm'] || row['Tên SP'] || row['Product Name'] || row['product_name'] || row['Name'] || '';
      const model = row['Model / Quy cách'] || row['Model/Quy cách'] || row['Model'] || row['Quy cách'] || row['model'] || '';
      const description = row['Mô tả'] || row['Ghi chú'] || row['Description'] || row['description'] || '';

      return { product_code, product_name, model, description };
    }).filter(p => p.product_code && p.product_name);

    if (products.length === 0) {
      Swal.fire('Lỗi định dạng', 'Không tìm thấy các cột "Mã sản phẩm" và "Tên sản phẩm" trong file!', 'error');
      event.target.value = '';
      return;
    }

    Swal.fire({
      title: 'Đang nhập dữ liệu...',
      text: `Đang xử lý ${products.length} sản phẩm từ file...`,
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const res = await fetch('/api/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products })
    });
    const result = await res.json();

    if (result.success) {
      Swal.fire('Thành công!', result.message, 'success');
      fetchProducts();
    } else {
      Swal.fire('Lỗi', result.message, 'error');
    }
  } catch (err) {
    console.error("Lỗi đọc file Excel:", err);
    Swal.fire('Lỗi', 'Không thể đọc dữ liệu từ file Excel này!', 'error');
  }

  event.target.value = '';
}

// ===== QUẢN LÝ ĐƠN HÀNG & TIẾN ĐỘ KIỂM KÊ =====
let cachedOrders = [];

async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const result = await res.json();
    if (result.success) {
      cachedOrders = result.data || [];
      renderOrderTable(cachedOrders);
      updateScanOrderFilterOptions(cachedScans);
    }
  } catch (err) {
    console.error('Lỗi khi tải danh sách đơn hàng:', err);
    if (orderTbody) orderTbody.innerHTML = `<tr><td colspan="8" class="loading-state">Lỗi tải dữ liệu đơn hàng!</td></tr>`;
  }
}

function renderOrderTable(orders) {
  if (!orderTbody) return;
  if (orders.length === 0) {
    orderTbody.innerHTML = `<tr><td colspan="8" class="loading-state">Chưa có đơn hàng nào. Nhấn "+ Tạo đơn hàng mới" để bắt đầu.</td></tr>`;
    return;
  }

  orderTbody.innerHTML = orders.map((order, idx) => {
    const isCompleted = order.is_completed || order.status === 'completed';
    const statusClass = isCompleted ? 'completed' : 'in_progress';
    const statusText = isCompleted ? '✅ Hoàn thành' : '⏳ Đang quét';
    const percent = order.percent || 0;
    const progressClass = isCompleted ? 'completed' : (percent === 0 ? 'empty' : '');

    const createdDate = order.created_at ? new Date(order.created_at).toLocaleDateString('vi-VN') : '-';

    return `
      <tr>
        <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
        <td><span class="order-badge">${order.order_code}</span></td>
        <td>
          <div style="font-weight: 600; color: #0f172a;">${order.order_name}</div>
          <div style="font-size: 12px; color: #64748b;">Khách: ${order.customer_name || 'Nội bộ'} ${order.notes ? `| ${order.notes}` : ''}</div>
        </td>
        <td>
          <div class="progress-container">
            <div class="progress-track">
              <div class="progress-fill ${progressClass}" style="width: ${percent}%;"></div>
            </div>
            <div class="progress-text">
              <span>${percent}%</span>
              <span>${order.total_scanned} / ${order.total_expected} SP</span>
            </div>
          </div>
        </td>
        <td style="font-weight: 600; text-align: center;">${order.items_count} mặt hàng</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${createdDate}</td>
        <td style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="viewOrderDetail(${order.id})">🔍 Tiến độ</button>
          <button class="btn btn-warning" style="padding: 4px 8px; font-size: 12px; background: #f59e0b; color: white;" onclick="showEditOrderModal(${order.id})" title="Chỉnh sửa đơn hàng">✏️ Sửa</button>
          <button class="btn btn-success" style="padding: 4px 8px; font-size: 12px;" onclick="exportOrder(${order.id})" title="Xuất biên bản Excel">📥 Excel</button>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; background: #6366f1; color: white; border: none; font-weight: 600;" onclick="printOrderHandoverReport(${order.id})" title="In Biên bản bàn giao & kiểm đếm A4">🖨️ In Biên Bản</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteOrder(${order.id}, '${order.order_code}')">Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleOrderSearch() {
  clearTimeout(orderSearchTimer);
  const q = document.getElementById('orderSearchInput').value.trim().toLowerCase();
  orderSearchTimer = setTimeout(() => {
    if (!q) {
      renderOrderTable(cachedOrders);
    } else {
      const filtered = cachedOrders.filter(o => 
        (o.order_code && o.order_code.toLowerCase().includes(q)) ||
        (o.order_name && o.order_name.toLowerCase().includes(q)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q))
      );
      renderOrderTable(filtered);
    }
  }, 250);
}

async function viewOrderDetail(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const order = result.data;
    const items = order.items || [];

    let checklistRows = items.map((it, idx) => {
      let pillClass = 'missing';
      let pillText = 'Chưa quét';
      if (it.is_completed) {
        pillClass = 'done';
        pillText = '✅ Đủ số lượng';
      } else if (it.quantity_scanned > 0) {
        pillClass = 'pending';
        pillText = `Thiếu ${it.quantity_expected - it.quantity_scanned}`;
      }

      return `
        <tr>
          <td style="text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="font-family: monospace; font-weight: 700; color: #4338ca;">${it.product_code}</td>
          <td style="font-weight: 600; color: #0f172a;">${it.product_name}</td>
          <td style="text-align: center; font-weight: 700; color: #64748b;">${it.quantity_expected} ${it.notes ? `(${it.notes})` : ''}</td>
          <td style="text-align: center; font-weight: 800; color: ${it.is_completed ? '#059669' : (it.quantity_scanned > 0 ? '#d97706' : '#94a3b8')}; font-size: 14px;">${it.quantity_scanned}</td>
          <td style="text-align: center;"><span class="item-status-pill ${pillClass}">${pillText}</span></td>
        </tr>
      `;
    }).join('');

    const html = `
      <div style="text-align: left;">
        <div class="order-detail-header">
          <div class="stat-box">
            <h4>MÃ ĐƠN HÀNG</h4>
            <p style="color: #4338ca; font-family: monospace;">${order.order_code}</p>
          </div>
          <div class="stat-box">
            <h4>TIẾN ĐỘ TỔNG THỂ</h4>
            <p style="color: ${order.percent === 100 ? '#059669' : '#4f46e5'};">${order.percent}%</p>
          </div>
          <div class="stat-box">
            <h4>ĐÃ QUÉT / TỔNG YÊU CẦU</h4>
            <p>${order.total_scanned} / ${order.total_expected}</p>
          </div>
        </div>
        <div style="font-size: 13px; color: #475569; margin-bottom: 12px;">
          <b>Tên đơn:</b> ${order.order_name} | <b>Khách hàng:</b> ${order.customer_name || 'Nội bộ'}
        </div>
        <div style="max-height: 55vh; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table class="checklist-table">
            <thead>
              <tr>
                <th width="40">STT</th>
                <th>Mã SP</th>
                <th>Tên sản phẩm</th>
                <th width="90" style="text-align: center;">Yêu cầu</th>
                <th width="90" style="text-align: center;">Đã quét</th>
                <th width="110" style="text-align: center;">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              ${checklistRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Swal.fire({
      title: `Tiến độ kiểm đếm: ${order.order_code}`,
      html: html,
      width: '850px',
      showCloseButton: true,
      confirmButtonText: 'Xuất Excel biên bản',
      showCancelButton: true,
      cancelButtonText: 'Đóng',
      confirmButtonColor: '#10b981'
    }).then((r) => {
      if (r.isConfirmed) {
        exportOrder(order.id);
      }
    });

  } catch (err) {
    Swal.fire('Lỗi', 'Không thể tải chi tiết đơn hàng: ' + err.message, 'error');
  }
}

async function showCreateOrderModal() {
  let productsList = [];
  try {
    const pRes = await fetch('/api/products');
    const pData = await pRes.json();
    if (pData.success) productsList = pData.data;
  } catch (e) {}

  const defaultCode = `DH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(Math.random()*900 + 100)}`;

  function setupItemRowEvents(row) {
    const searchInput = row.querySelector('.item-product-search');
    const hiddenName = row.querySelector('.item-product-name');
    const hiddenCode = row.querySelector('.item-product-code');
    const dropdown = row.querySelector('.item-autocomplete-dropdown');

    function renderDropdown(q = '') {
      const query = q.trim().toLowerCase();
      let matches = [];
      if (!query) {
        matches = productsList.slice(0, 15);
      } else {
        matches = productsList.filter(p => 
          (p.product_name && p.product_name.toLowerCase().includes(query)) ||
          (p.product_code && p.product_code.toLowerCase().includes(query)) ||
          (p.model && p.model.toLowerCase().includes(query))
        ).slice(0, 20);
      }

      if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 8px 10px; color: #94a3b8; font-size: 12px; text-align: center;">Không tìm thấy. Sẽ lưu tên tự do này.</div>`;
        dropdown.style.display = 'block';
        return;
      }

      dropdown.innerHTML = matches.map(p => `
        <div class="swal-prod-item" data-code="${(p.product_code || '').replace(/"/g, '&quot;')}" data-name="${(p.product_name || '').replace(/"/g, '&quot;')}" style="padding: 7px 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;">
          <div style="font-weight: 700; color: #1e293b; font-size: 12.5px;">${p.product_name}</div>
          <div style="font-size: 11px; color: #4338ca; font-family: monospace;">Mã: <b>${p.product_code}</b> ${p.model ? `| ${p.model}` : ''}</div>
        </div>
      `).join('');

      dropdown.querySelectorAll('.swal-prod-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = '#e0e7ff');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const code = item.getAttribute('data-code');
          const name = item.getAttribute('data-name');
          searchInput.value = `[${code}] ${name}`;
          hiddenName.value = name;
          hiddenCode.value = code;
          dropdown.style.display = 'none';
        });
      });

      dropdown.style.display = 'block';
    }

    searchInput.addEventListener('input', () => {
      hiddenName.value = searchInput.value.trim();
      hiddenCode.value = '';
      renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('focus', () => {
      renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 250);
    });
  }

  const { value: formValues } = await Swal.fire({
    title: 'Tạo Đơn Hàng Mới',
    html: `
      <style>
        .order-form-group { margin-bottom: 10px; text-align: left; }
        .order-form-group label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 3px; color: #334155; }
        .order-form-group input { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; font-family: inherit; }
        .item-row { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; position: relative; }
        .prod-search-wrapper { flex: 2; position: relative; }
        .item-product-search { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 13px; font-family: inherit; }
        .item-product-search:focus { border-color: #4f46e5; outline: none; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15); }
        .item-autocomplete-dropdown { position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: white; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); max-height: 180px; overflow-y: auto; z-index: 10000; text-align: left; }
        .item-row input.qty-input { width: 70px; flex-shrink: 0; text-align: center; padding: 7px 5px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-weight: bold; }
        .item-row input.unit-input { width: 90px; flex-shrink: 0; padding: 7px 8px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 12px; }
        .item-row button.del-btn { background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; flex-shrink: 0; font-weight: bold; font-size: 16px; transition: all 0.2s; }
        .item-row button.del-btn:hover { background: #ef4444; color: white; }
      </style>
      <div>
        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 10px;">
          <div class="order-form-group">
            <label>Mã đơn hàng (*)</label>
            <input type="text" id="swal-order-code" value="${defaultCode}" style="font-family: monospace; font-weight: 700;">
          </div>
          <div class="order-form-group">
            <label>Tên đơn hàng (*)</label>
            <input type="text" id="swal-order-name" placeholder="Ví dụ: Xuất kho dự án...">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="order-form-group">
            <label>Khách hàng / Dự án</label>
            <input type="text" id="swal-customer" placeholder="Tên khách hàng hoặc dự án...">
          </div>
          <div class="order-form-group">
            <label>Ghi chú</label>
            <input type="text" id="swal-order-notes" placeholder="Ghi chú thêm...">
          </div>
        </div>

        <div style="text-align: left; margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: #1e293b;">Danh sách sản phẩm yêu cầu:</label>
            <button type="button" id="addItemRowBtn" style="background: #4f46e5; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;">+ Thêm dòng SP</button>
          </div>
          <div id="orderItemsContainer" style="max-height: 240px; overflow-y: auto; padding: 2px;">
            <div class="item-row">
              <div class="prod-search-wrapper">
                <input type="text" class="item-product-search" placeholder="🔍 Gõ tên hoặc mã SP để tìm..." autocomplete="off">
                <input type="hidden" class="item-product-name">
                <input type="hidden" class="item-product-code">
                <div class="item-autocomplete-dropdown" style="display: none;"></div>
              </div>
              <input type="number" class="qty-input" min="1" value="1" placeholder="SL" title="Số lượng">
              <input type="text" class="unit-input" placeholder="ĐVT/Ghi chú" title="Đơn vị tính / Ghi chú">
              <button type="button" class="del-btn" onclick="this.closest('.item-row').remove()">×</button>
            </div>
          </div>
        </div>
      </div>
    `,
    width: '720px',
    didOpen: () => {
      const firstRow = document.querySelector('#orderItemsContainer .item-row');
      if (firstRow) setupItemRowEvents(firstRow);

      document.getElementById('addItemRowBtn').addEventListener('click', () => {
        const container = document.getElementById('orderItemsContainer');
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
          <div class="prod-search-wrapper">
            <input type="text" class="item-product-search" placeholder="🔍 Gõ tên hoặc mã SP để tìm..." autocomplete="off">
            <input type="hidden" class="item-product-name">
            <input type="hidden" class="item-product-code">
            <div class="item-autocomplete-dropdown" style="display: none;"></div>
          </div>
          <input type="number" class="qty-input" min="1" value="1" placeholder="SL" title="Số lượng">
          <input type="text" class="unit-input" placeholder="ĐVT/Ghi chú" title="Đơn vị tính / Ghi chú">
          <button type="button" class="del-btn" onclick="this.closest('.item-row').remove()">×</button>
        `;
        container.appendChild(div);
        setupItemRowEvents(div);
        div.querySelector('.item-product-search').focus();
      });
    },
    showCancelButton: true,
    confirmButtonText: 'Tạo đơn hàng',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const code = document.getElementById('swal-order-code').value.trim();
      const name = document.getElementById('swal-order-name').value.trim();
      const customer = document.getElementById('swal-customer').value.trim();
      const notes = document.getElementById('swal-order-notes').value.trim();

      if (!code || !name) {
        Swal.showValidationMessage('Vui lòng nhập Mã đơn hàng và Tên đơn hàng!');
        return false;
      }

      const rows = document.querySelectorAll('#orderItemsContainer .item-row');
      const items = [];
      rows.forEach(r => {
        const searchInput = r.querySelector('.item-product-search');
        const hiddenName = r.querySelector('.item-product-name');
        const hiddenCode = r.querySelector('.item-product-code');
        const qtyInput = r.querySelector('.qty-input');
        const unitInput = r.querySelector('.unit-input');

        const prodName = hiddenName.value.trim() || searchInput.value.trim();
        const prodCode = hiddenCode.value.trim();
        const qty = parseInt(qtyInput.value) || 1;
        const itemNotes = unitInput.value.trim();

        if (prodName) {
          items.push({
            product_name: prodName,
            product_code: prodCode,
            quantity_expected: qty,
            notes: itemNotes
          });
        }
      });

      if (items.length === 0) {
        Swal.showValidationMessage('Vui lòng nhập ít nhất 1 sản phẩm cho đơn hàng!');
        return false;
      }

      return {
        orderCode: code,
        orderName: name,
        customerName: customer,
        notes: notes,
        items: items
      };
    }
  });

  if (formValues) {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Đã tạo đơn hàng thành công!',
          showConfirmButton: false,
          timer: 2000
        });
        fetchOrders();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không kết nối được máy chủ', 'error');
    }
  }
}

// ===== NHẬP ĐƠN HÀNG HÀNG LOẠT TỪ FILE EXCEL =====
function downloadOrderExcelTemplate() {
  const headers = ["Mã sản phẩm", "Tên sản phẩm", "Số lượng", "Ghi chú / ĐVT"];
  const rows = [
    headers,
    ["SP-1001", "Cáp sạc Type-C Anker 60W", 10, "Cái"],
    ["SP-1002", "Củ sạc nhanh Ugreen 65W GaN", 5, "Cái"],
    ["SP-1003", "Bộ chuyển đổi HDMI 4K Ugreen", 8, "Cái"],
    ["SP-1004", "Chuột không dây Logitech M331", 15, "Hộp"]
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MauDonHang");
  XLSX.writeFile(wb, "Mau_nhap_don_hang.xlsx");
}

window.downloadOrderExcelTemplate = downloadOrderExcelTemplate;

async function showImportOrderModal() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const defaultOrderCode = `DH-${today}-01`;
  let parsedItems = [];

  const { value: formValues } = await Swal.fire({
    title: 'Nhập Đơn Hàng Từ Excel',
    width: '650px',
    html: `
      <style>
        .import-order-form { text-align: left; font-size: 13px; }
        .import-order-form label { display: block; font-weight: 700; margin-bottom: 4px; color: #334155; }
        .import-order-form input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 10px; font-family: inherit; font-size: 13px; }
        .file-drop-zone { border: 2px dashed #6366f1; background: rgba(99, 102, 241, 0.05); padding: 18px; border-radius: 10px; text-align: center; cursor: pointer; margin-bottom: 12px; }
        .file-drop-zone:hover { background: rgba(99, 102, 241, 0.1); }
      </style>
      <div class="import-order-form">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 12px; color: #64748b;">Điền thông tin đơn hàng và tải lên file Excel (.xlsx, .xls)</span>
          <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="downloadOrderExcelTemplate()">📄 Tải file Excel mẫu</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label>Mã đơn hàng *</label>
            <input id="swal-imp-code" value="${defaultOrderCode}" placeholder="Ví dụ: DH-DUAN-01">
          </div>
          <div>
            <label>Tên đơn hàng / Dự án *</label>
            <input id="swal-imp-name" placeholder="Ví dụ: Xuất kho tháng 9">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label>Khách hàng / Đơn vị nhận</label>
            <input id="swal-imp-customer" placeholder="Ví dụ: Công ty Cổ phần ABC">
          </div>
          <div>
            <label>Ghi chú / Hợp đồng</label>
            <input id="swal-imp-notes" placeholder="Ví dụ: HĐ số 128/2026">
          </div>
        </div>

        <label>Chọn file Excel danh sách sản phẩm *</label>
        <div class="file-drop-zone" onclick="document.getElementById('swal-order-excel-file').click()">
          <div style="font-size: 24px; margin-bottom: 4px;">📂</div>
          <div style="font-weight: 700; color: #4f46e5;" id="fileLabelTxt">Bấm vào đây để chọn file Excel (.xlsx, .xls)</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Hỗ trợ cột: Mã sản phẩm, Tên sản phẩm, Số lượng, Ghi chú</div>
          <input type="file" id="swal-order-excel-file" accept=".xlsx, .xls, .csv" style="display: none;">
        </div>

        <div id="excelPreviewContainer" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; max-height: 160px; overflow-y: auto;">
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px; color: #059669;" id="excelPreviewSummary"></div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #e2e8f0; text-align: left;">
                <th style="padding: 4px;">Mã SP</th>
                <th style="padding: 4px;">Tên SP</th>
                <th style="padding: 4px; text-align: center;">SL</th>
                <th style="padding: 4px;">Ghi chú</th>
              </tr>
            </thead>
            <tbody id="excelPreviewTbody"></tbody>
          </table>
        </div>
      </div>
    `,
    didOpen: () => {
      const fileInput = document.getElementById('swal-order-excel-file');
      const fileLabel = document.getElementById('fileLabelTxt');
      const previewContainer = document.getElementById('excelPreviewContainer');
      const previewSummary = document.getElementById('excelPreviewSummary');
      const previewTbody = document.getElementById('excelPreviewTbody');

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileLabel.innerHTML = `📄 <b>${file.name}</b> (${Math.round(file.size / 1024)} KB)`;

        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheet];
            const jsonRows = XLSX.utils.sheet_to_json(sheet);

            if (!jsonRows || jsonRows.length === 0) {
              Swal.showValidationMessage('File Excel không có dữ liệu!');
              return;
            }

            parsedItems = [];
            jsonRows.forEach(row => {
              const code = row['Mã sản phẩm'] || row['Mã SP'] || row['Ma_SP'] || row['product_code'] || row['SKU'] || '';
              const name = row['Tên sản phẩm'] || row['Tên SP'] || row['Ten_SP'] || row['product_name'] || row['Tên hàng'] || '';
              const qty = row['Số lượng'] || row['So_Luong'] || row['SL'] || row['quantity'] || 1;
              const notes = row['Ghi chú'] || row['Ghi_Chu'] || row['notes'] || row['ĐVT'] || row['Đơn vị tính'] || '';

              if (code || name) {
                parsedItems.push({
                  product_code: String(code).trim(),
                  product_name: String(name || code).trim(),
                  quantity_expected: parseInt(qty) || 1,
                  notes: String(notes).trim()
                });
              }
            });

            if (parsedItems.length === 0) {
              Swal.showValidationMessage('Không tìm thấy dòng sản phẩm hợp lệ trong file!');
              return;
            }

            previewSummary.textContent = `✅ Đã đọc được ${parsedItems.length} mặt hàng từ file Excel`;
            previewTbody.innerHTML = parsedItems.map(it => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 3px; font-family: monospace; font-weight: 700;">${it.product_code || '-'}</td>
                <td style="padding: 3px;">${it.product_name}</td>
                <td style="padding: 3px; text-align: center; font-weight: 700;">${it.quantity_expected}</td>
                <td style="padding: 3px; color: #64748b;">${it.notes || '-'}</td>
              </tr>
            `).join('');

            previewContainer.style.display = 'block';
          } catch(err) {
            Swal.showValidationMessage('Lỗi đọc file Excel: ' + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    },
    showCancelButton: true,
    confirmButtonText: '🚀 Tạo Đơn Hàng Ngay',
    cancelButtonText: 'Hủy',
    confirmButtonColor: '#4f46e5',
    preConfirm: () => {
      const code = document.getElementById('swal-imp-code').value.trim();
      const name = document.getElementById('swal-imp-name').value.trim();
      const customer = document.getElementById('swal-imp-customer').value.trim();
      const notes = document.getElementById('swal-imp-notes').value.trim();

      if (!code || !name) {
        Swal.showValidationMessage('Vui lòng nhập đầy đủ Mã và Tên đơn hàng!');
        return false;
      }

      if (!parsedItems || parsedItems.length === 0) {
        Swal.showValidationMessage('Vui lòng chọn file Excel có chứa danh sách sản phẩm!');
        return false;
      }

      return {
        orderCode: code,
        orderName: name,
        customerName: customer,
        notes: notes,
        items: parsedItems
      };
    }
  });

  if (formValues) {
    try {
      const res = await fetch('/api/orders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Thành công!',
          text: data.message,
          timer: 2500,
          showConfirmButton: false
        });
        fetchOrders();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch(err) {
      Swal.fire('Lỗi', 'Không thể kết nối đến máy chủ: ' + err.message, 'error');
    }
  }
}

window.showImportOrderModal = showImportOrderModal;

async function showEditOrderModal(orderId) {
  let orderData = null;
  let productsList = [];

  try {
    const [orderRes, prodRes] = await Promise.all([
      fetch(`/api/orders/${orderId}`),
      fetch('/api/products')
    ]);
    const orderJson = await orderRes.json();
    const prodJson = await prodRes.json();

    if (!orderJson.success) throw new Error(orderJson.message);
    orderData = orderJson.data;
    if (prodJson.success) productsList = prodJson.data;
  } catch (err) {
    Swal.fire('Lỗi', 'Không thể tải thông tin đơn hàng: ' + err.message, 'error');
    return;
  }

  function setupItemRowEvents(row) {
    const searchInput = row.querySelector('.item-product-search');
    const hiddenName = row.querySelector('.item-product-name');
    const hiddenCode = row.querySelector('.item-product-code');
    const dropdown = row.querySelector('.item-autocomplete-dropdown');

    function renderDropdown(q = '') {
      const query = q.trim().toLowerCase();
      let matches = [];
      if (!query) {
        matches = productsList.slice(0, 15);
      } else {
        matches = productsList.filter(p => 
          (p.product_name && p.product_name.toLowerCase().includes(query)) ||
          (p.product_code && p.product_code.toLowerCase().includes(query)) ||
          (p.model && p.model.toLowerCase().includes(query))
        ).slice(0, 20);
      }

      if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 8px 10px; color: #94a3b8; font-size: 12px; text-align: center;">Không tìm thấy. Sẽ lưu tên tự do này.</div>`;
        dropdown.style.display = 'block';
        return;
      }

      dropdown.innerHTML = matches.map(p => `
        <div class="swal-prod-item" data-code="${(p.product_code || '').replace(/"/g, '&quot;')}" data-name="${(p.product_name || '').replace(/"/g, '&quot;')}" style="padding: 7px 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;">
          <div style="font-weight: 700; color: #1e293b; font-size: 12.5px;">${p.product_name}</div>
          <div style="font-size: 11px; color: #4338ca; font-family: monospace;">Mã: <b>${p.product_code}</b> ${p.model ? `| ${p.model}` : ''}</div>
        </div>
      `).join('');

      dropdown.querySelectorAll('.swal-prod-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = '#e0e7ff');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const code = item.getAttribute('data-code');
          const name = item.getAttribute('data-name');
          searchInput.value = `[${code}] ${name}`;
          hiddenName.value = name;
          hiddenCode.value = code;
          dropdown.style.display = 'none';
        });
      });

      dropdown.style.display = 'block';
    }

    searchInput.addEventListener('input', () => {
      hiddenName.value = searchInput.value.trim();
      hiddenCode.value = '';
      renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('focus', () => {
      renderDropdown(searchInput.value);
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 250);
    });
  }

  const existingItems = orderData.items || [];
  let existingItemsHtml = existingItems.map(it => `
    <div class="item-row">
      <div class="prod-search-wrapper">
        <input type="text" class="item-product-search" value="${it.product_code ? `[${it.product_code}] ` : ''}${it.product_name}" placeholder="🔍 Gõ tên hoặc mã SP để tìm..." autocomplete="off">
        <input type="hidden" class="item-product-name" value="${(it.product_name || '').replace(/"/g, '&quot;')}">
        <input type="hidden" class="item-product-code" value="${(it.product_code || '').replace(/"/g, '&quot;')}">
        <div class="item-autocomplete-dropdown" style="display: none;"></div>
      </div>
      <input type="number" class="qty-input" min="1" value="${it.quantity_expected || 1}" placeholder="SL" title="Số lượng">
      <input type="text" class="unit-input" value="${(it.notes || '').replace(/"/g, '&quot;')}" placeholder="ĐVT/Ghi chú" title="Đơn vị tính / Ghi chú">
      <button type="button" class="del-btn" onclick="this.closest('.item-row').remove()">×</button>
    </div>
  `).join('');

  if (existingItems.length === 0) {
    existingItemsHtml = `
      <div class="item-row">
        <div class="prod-search-wrapper">
          <input type="text" class="item-product-search" placeholder="🔍 Gõ tên hoặc mã SP để tìm..." autocomplete="off">
          <input type="hidden" class="item-product-name">
          <input type="hidden" class="item-product-code">
          <div class="item-autocomplete-dropdown" style="display: none;"></div>
        </div>
        <input type="number" class="qty-input" min="1" value="1" placeholder="SL" title="Số lượng">
        <input type="text" class="unit-input" placeholder="ĐVT/Ghi chú" title="Đơn vị tính / Ghi chú">
        <button type="button" class="del-btn" onclick="this.closest('.item-row').remove()">×</button>
      </div>
    `;
  }

  const { value: formValues } = await Swal.fire({
    title: `Chỉnh Sửa Đơn Hàng: ${orderData.order_code}`,
    html: `
      <style>
        .order-form-group { margin-bottom: 10px; text-align: left; }
        .order-form-group label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 3px; color: #334155; }
        .order-form-group input, .order-form-group select { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; font-family: inherit; }
        .item-row { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; position: relative; }
        .prod-search-wrapper { flex: 2; position: relative; }
        .item-product-search { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 13px; font-family: inherit; }
        .item-product-search:focus { border-color: #4f46e5; outline: none; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15); }
        .item-autocomplete-dropdown { position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: white; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); max-height: 180px; overflow-y: auto; z-index: 10000; text-align: left; }
        .item-row input.qty-input { width: 70px; flex-shrink: 0; text-align: center; padding: 7px 5px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-weight: bold; }
        .item-row input.unit-input { width: 90px; flex-shrink: 0; padding: 7px 8px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 12px; }
        .item-row button.del-btn { background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; flex-shrink: 0; font-weight: bold; font-size: 16px; transition: all 0.2s; }
        .item-row button.del-btn:hover { background: #ef4444; color: white; }
      </style>
      <div>
        <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 10px;">
          <div class="order-form-group">
            <label>Mã đơn hàng</label>
            <input type="text" id="swal-edit-order-code" value="${orderData.order_code}" readonly disabled style="font-family: monospace; font-weight: 700; background: #f8fafc;">
          </div>
          <div class="order-form-group">
            <label>Tên đơn hàng (*)</label>
            <input type="text" id="swal-edit-order-name" value="${(orderData.order_name || '').replace(/"/g, '&quot;')}">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
          <div class="order-form-group">
            <label>Khách hàng / Dự án</label>
            <input type="text" id="swal-edit-customer" value="${(orderData.customer_name || '').replace(/"/g, '&quot;')}">
          </div>
          <div class="order-form-group">
            <label>Trạng thái</label>
            <select id="swal-edit-status">
              <option value="pending" ${orderData.status === 'pending' ? 'selected' : ''}>Chờ quét</option>
              <option value="in_progress" ${orderData.status === 'in_progress' ? 'selected' : ''}>⏳ Đang quét</option>
              <option value="completed" ${orderData.status === 'completed' ? 'selected' : ''}>✅ Đã hoàn thành</option>
            </select>
          </div>
          <div class="order-form-group">
            <label>Ghi chú</label>
            <input type="text" id="swal-edit-notes" value="${(orderData.notes || '').replace(/"/g, '&quot;')}">
          </div>
        </div>

        <div style="text-align: left; margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: #1e293b;">Danh sách sản phẩm yêu cầu:</label>
            <button type="button" id="addEditItemRowBtn" style="background: #4f46e5; color: white; border: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;">+ Thêm dòng SP</button>
          </div>
          <div id="orderEditItemsContainer" style="max-height: 240px; overflow-y: auto; padding: 2px;">
            ${existingItemsHtml}
          </div>
        </div>
      </div>
    `,
    width: '750px',
    didOpen: () => {
      document.querySelectorAll('#orderEditItemsContainer .item-row').forEach(row => {
        setupItemRowEvents(row);
      });

      document.getElementById('addEditItemRowBtn').addEventListener('click', () => {
        const container = document.getElementById('orderEditItemsContainer');
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
          <div class="prod-search-wrapper">
            <input type="text" class="item-product-search" placeholder="🔍 Gõ tên hoặc mã SP để tìm..." autocomplete="off">
            <input type="hidden" class="item-product-name">
            <input type="hidden" class="item-product-code">
            <div class="item-autocomplete-dropdown" style="display: none;"></div>
          </div>
          <input type="number" class="qty-input" min="1" value="1" placeholder="SL" title="Số lượng">
          <input type="text" class="unit-input" placeholder="ĐVT/Ghi chú" title="Đơn vị tính / Ghi chú">
          <button type="button" class="del-btn" onclick="this.closest('.item-row').remove()">×</button>
        `;
        container.appendChild(div);
        setupItemRowEvents(div);
        div.querySelector('.item-product-search').focus();
      });
    },
    showCancelButton: true,
    confirmButtonText: 'Lưu thay đổi',
    cancelButtonText: 'Hủy',
    preConfirm: () => {
      const name = document.getElementById('swal-edit-order-name').value.trim();
      const customer = document.getElementById('swal-edit-customer').value.trim();
      const status = document.getElementById('swal-edit-status').value;
      const notes = document.getElementById('swal-edit-notes').value.trim();

      if (!name) {
        Swal.showValidationMessage('Vui lòng nhập Tên đơn hàng!');
        return false;
      }

      const rows = document.querySelectorAll('#orderEditItemsContainer .item-row');
      const items = [];
      rows.forEach(r => {
        const searchInput = r.querySelector('.item-product-search');
        const hiddenName = r.querySelector('.item-product-name');
        const hiddenCode = r.querySelector('.item-product-code');
        const qtyInput = r.querySelector('.qty-input');
        const unitInput = r.querySelector('.unit-input');

        const prodName = hiddenName.value.trim() || searchInput.value.trim();
        const prodCode = hiddenCode.value.trim();
        const qty = parseInt(qtyInput.value) || 1;
        const itemNotes = unitInput.value.trim();

        if (prodName) {
          items.push({
            product_name: prodName,
            product_code: prodCode,
            quantity_expected: qty,
            notes: itemNotes
          });
        }
      });

      if (items.length === 0) {
        Swal.showValidationMessage('Vui lòng nhập ít nhất 1 sản phẩm cho đơn hàng!');
        return false;
      }

      return {
        orderName: name,
        customerName: customer,
        status: status,
        notes: notes,
        items: items
      };
    }
  });

  if (formValues) {
    try {
      const res = await authFetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Đã cập nhật đơn hàng thành công!',
          showConfirmButton: false,
          timer: 2000
        });
        fetchOrders();
        fetchDashboardStats();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không kết nối được máy chủ', 'error');
    }
  }
}

function exportOrder(orderId) {
  window.open(`/api/orders/${orderId}/export`, '_blank');
}

async function deleteOrder(orderId, orderCode) {
  const result = await Swal.fire({
    title: 'Xóa đơn hàng?',
    text: `Bạn có chắc chắn muốn xóa đơn hàng "${orderCode}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Đúng, Xóa!',
    cancelButtonText: 'Hủy'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã xóa đơn hàng', showConfirmButton: false, timer: 1500 });
        fetchOrders();
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (e) {
      Swal.fire('Lỗi mạng', 'Không thể xóa đơn hàng', 'error');
    }
  }
}

// ===== IN TEM NHÃN MÃ VẠCH / QR CHO SẢN PHẨM =====
async function printProductLabel(code, name, model) {
  const { value: printConfig } = await Swal.fire({
    title: 'In Tem Nhãn Sản Phẩm',
    html: `
      <div style="text-align: left; font-size: 13px;">
        <div style="background: rgba(79, 70, 229, 0.08); padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid rgba(79, 70, 229, 0.2);">
          <div style="font-weight: 800; color: var(--primary); font-size: 14px;">${name}</div>
          <div style="font-family: monospace; font-size: 12px; color: var(--text-muted); margin-top: 2px;">Mã: <b>${code}</b> ${model ? `| Model: ${model}` : ''}</div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; margin-bottom: 4px;">Định dạng tem</label>
          <select id="swal-label-type" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
            <option value="barcode">Mã vạch 1D (Code 128)</option>
            <option value="qr">Mã vuông 2D (QR Code)</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; margin-bottom: 4px;">Khổ giấy in</label>
          <select id="swal-label-size" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
            <option value="thermal-50x30">Tem nhiệt 50x30 mm (Máy in tem Xprinter, TSC)</option>
            <option value="thermal-35x22">Tem nhiệt nhỏ 35x22 mm</option>
            <option value="a4-grid">Khổ giấy A4 (Nhiều tem trên trang)</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 700; margin-bottom: 4px;">Số lượng tem cần in</label>
          <input id="swal-label-qty" type="number" min="1" max="500" value="1" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '🖨️ Xem & In Tem',
    cancelButtonText: 'Hủy',
    confirmButtonColor: '#4f46e5',
    preConfirm: () => {
      const type = document.getElementById('swal-label-type').value;
      const size = document.getElementById('swal-label-size').value;
      const qty = parseInt(document.getElementById('swal-label-qty').value) || 1;
      return { type, size, qty };
    }
  });

  if (!printConfig) return;

  const { type, size, qty } = printConfig;

  const printWindow = window.open('', '_blank', 'width=850,height=700');
  if (!printWindow) {
    Swal.fire('Lỗi', 'Trình duyệt đã chặn cửa sổ pop-up. Vui lòng cho phép pop-up để in tem!', 'error');
    return;
  }

  let labelElements = '';
  for (let i = 0; i < qty; i++) {
    labelElements += `
      <div class="label-card ${size}">
        <div class="label-header">${name}</div>
        <div class="label-code-wrapper">
          ${type === 'barcode' ? `<svg id="barcode-${i}"></svg>` : `<div id="qrcode-${i}" class="qr-box"></div>`}
        </div>
        <div class="label-footer">Mã: ${code} ${model ? `• ${model}` : ''}</div>
      </div>
    `;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>In Tem: ${code}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f8fafc; padding: 20px; text-align: center; }
        .print-actions { margin-bottom: 20px; }
        .btn-print { background: #4f46e5; color: white; border: none; padding: 10px 24px; font-size: 14px; font-weight: 700; border-radius: 6px; cursor: pointer; }
        .labels-container { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        
        .label-card {
          background: white;
          border: 1px dashed #cbd5e1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4px 6px;
          page-break-inside: avoid;
        }

        .label-card.thermal-50x30 {
          width: 50mm;
          height: 30mm;
          padding: 2mm;
        }

        .label-card.thermal-35x22 {
          width: 35mm;
          height: 22mm;
          padding: 1.5mm;
        }

        .label-card.a4-grid {
          width: 65mm;
          height: 38mm;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          margin: 4px;
        }

        .label-header {
          font-size: 8.5pt;
          font-weight: 800;
          color: #000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: center;
          line-height: 1.1;
        }

        .label-code-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 1mm 0;
          max-width: 100%;
        }

        .label-code-wrapper svg {
          max-width: 100%;
          height: auto;
        }

        .qr-box img {
          width: 18mm !important;
          height: 18mm !important;
          margin: 0 auto;
        }

        .label-footer {
          font-size: 7pt;
          font-family: monospace;
          color: #000;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: center;
        }

        @media print {
          body { background: white; padding: 0; }
          .print-actions { display: none !important; }
          .label-card { border: none !important; margin: 0 !important; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button class="btn-print" onclick="window.print()">🖨️ Bấm Vào Đây Để In</button>
      </div>
      <div class="labels-container">
        ${labelElements}
      </div>

      <script>
        window.onload = function() {
          const qty = ${qty};
          const type = "${type}";
          const code = "${code.replace(/"/g, '\\"')}";

          for (let i = 0; i < qty; i++) {
            if (type === 'barcode') {
              try {
                JsBarcode("#barcode-" + i, code, {
                  format: "CODE128",
                  width: 1.5,
                  height: 35,
                  displayValue: false,
                  margin: 0
                });
              } catch(e) { console.error(e); }
            } else {
              try {
                new QRCode(document.getElementById("qrcode-" + i), {
                  text: code,
                  width: 70,
                  height: 70,
                  correctLevel: QRCode.CorrectLevel.M
                });
              } catch(e) { console.error(e); }
            }
          }
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

window.printProductLabel = printProductLabel;

// ===== IN BIÊN BẢN KIỂM ĐẾM & BÀN GIAO THIẾT BỊ A4 =====
async function printOrderHandoverReport(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const order = result.data;
    const items = order.items || [];
    
    // Lấy toàn bộ mã quét của đơn này
    const scansRes = await fetch('/api/scans');
    const scansResult = await scansRes.json();
    const allScans = scansResult.success ? (scansResult.data || []) : [];
    const orderScans = allScans.filter(s => s.order_code === order.order_code);

    const printWindow = window.open('', '_blank', 'width=950,height=800');
    if (!printWindow) {
      Swal.fire('Lỗi', 'Vui lòng cho phép pop-up để in biên bản!', 'error');
      return;
    }

    const rowsHtml = items.map((it, idx) => {
      const matchingScans = orderScans.filter(s => 
        (s.product_code && s.product_code === it.product_code) ||
        (s.product_name && s.product_name === it.product_name)
      );
      const serialList = matchingScans.map(s => s.raw_data).join(', ') || 'Chưa có S/N';
      const isDone = it.quantity_scanned >= it.quantity_expected;
      const statusText = isDone ? 'Đạt' : `Thiếu ${it.quantity_expected - it.quantity_scanned}`;

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="font-family: monospace; font-weight: 700;">${it.product_code}</td>
          <td style="font-weight: 600;">${it.product_name}</td>
          <td style="text-align: center;">${it.notes || 'Cái'}</td>
          <td style="text-align: center; font-weight: 700;">${it.quantity_expected}</td>
          <td style="text-align: center; font-weight: 700; color: ${isDone ? '#059669' : '#dc2626'};">${it.quantity_scanned}</td>
          <td style="text-align: center; font-weight: 700;">${statusText}</td>
          <td style="font-family: monospace; font-size: 11px;">${serialList}</td>
        </tr>
      `;
    }).join('');

    const now = new Date();
    const currentDateStr = `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Biên bản bàn giao - ${order.order_code}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: "Times New Roman", Times, serif; padding: 30px; background: #fff; color: #000; line-height: 1.4; }
          .header-nation { text-align: center; margin-bottom: 20px; }
          .header-nation h4 { font-size: 13pt; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
          .header-nation h5 { font-size: 12pt; font-weight: 700; text-decoration: underline; }
          .doc-title { text-align: center; margin: 25px 0 15px 0; }
          .doc-title h2 { font-size: 16pt; font-weight: 800; text-transform: uppercase; }
          .doc-title p { font-size: 11pt; font-style: italic; color: #444; }
          .order-info { margin-bottom: 18px; font-size: 12pt; }
          .order-info-row { margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 11pt; }
          th, td { border: 1px solid #000; padding: 6px 8px; vertical-align: middle; }
          th { background: #f2f2f2; font-weight: 700; text-align: center; }
          .signatures { display: flex; justify-content: space-between; margin-top: 30px; text-align: center; page-break-inside: avoid; }
          .sign-box { width: 30%; }
          .sign-title { font-weight: 700; font-size: 12pt; margin-bottom: 4px; }
          .sign-sub { font-style: italic; font-size: 10.5pt; color: #555; margin-bottom: 60px; }
          .btn-print { background: #4f46e5; color: white; border: none; padding: 10px 24px; font-size: 14px; font-weight: 700; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
          @media print {
            .btn-print { display: none !important; }
            body { padding: 15mm; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <button class="btn-print" onclick="window.print()">🖨️ Bấm Vào Đây Để In Biên Bản (A4)</button>
        </div>

        <div class="header-nation">
          <h4>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h4>
          <h5>Độc lập - Tự do - Hạnh phúc</h5>
        </div>

        <div class="doc-title">
          <h2>BIÊN BẢN KIỂM ĐẾM & BÀN GIAO THIẾT BỊ</h2>
          <p>Mã biên bản: ${order.order_code} • ${currentDateStr}</p>
        </div>

        <div class="order-info">
          <div class="order-info-row">• <b>Đơn hàng / Dự án:</b> ${order.order_name}</div>
          <div class="order-info-row">• <b>Đơn vị nhận / Khách hàng:</b> ${order.customer_name || 'Nội bộ'}</div>
          <div class="order-info-row">• <b>Ghi chú / Hợp đồng:</b> ${order.notes || 'Không có'}</div>
          <div class="order-info-row">• <b>Tiến độ kiểm đếm:</b> ${order.percent}% (Đã kiểm: ${order.total_scanned}/${order.total_expected} thiết bị)</div>
        </div>

        <table>
          <thead>
            <tr>
              <th width="40">STT</th>
              <th width="110">Mã sản phẩm</th>
              <th>Tên hàng hóa - Quy cách</th>
              <th width="60">ĐVT</th>
              <th width="65">SL Y/C</th>
              <th width="65">SL Thực tế</th>
              <th width="80">Tình trạng</th>
              <th>Danh sách Serial / IMEI bàn giao</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="font-size: 12pt; margin-bottom: 20px;">
          <i>* Hai bên đã cùng nhau kiểm tra, đối chiếu số lượng và số Serial/IMEI thực tế của toàn bộ hàng hóa nêu trên.</i>
        </div>

        <div class="signatures">
          <div class="sign-box">
            <div class="sign-title">NGƯỜI LẬP BIÊN BẢN</div>
            <div class="sign-sub">(Ký & ghi rõ họ tên)</div>
          </div>
          <div class="sign-box">
            <div class="sign-title">ĐẠI DIỆN BÊN GIAO</div>
            <div class="sign-sub">(Ký & ghi rõ họ tên)</div>
          </div>
          <div class="sign-box">
            <div class="sign-title">ĐẠI DIỆN BÊN NHẬN</div>
            <div class="sign-sub">(Ký & ghi rõ họ tên)</div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (err) {
    Swal.fire('Lỗi', 'Không thể tạo biên bản in: ' + err.message, 'error');
  }
}

window.printOrderHandoverReport = printOrderHandoverReport;

document.addEventListener('DOMContentLoaded', () => {
  const selectAll = document.getElementById('selectAll');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.scan-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
  }
});

// Tải dữ liệu lần đầu
fetchDashboardStats();
fetchScans();

// Khởi tạo kết nối Real-time SSE
initSSE();

// Fallback cập nhật chậm mỗi 60 giây đề phòng mạng gián đoạn
setInterval(() => {
  if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
    fetchScans();
  }
}, 60000);
