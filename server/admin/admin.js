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

async function fetchScans(highlightId = null) {
  try {
    const response = await fetch('/api/scans');
    const result = await response.json();
    
    if (result.success) {
      const scans = result.data;
      
      if (scans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="loading-state">Chưa có dữ liệu quét nào.</td></tr>`;
      } else {
        tbody.innerHTML = scans.map(scan => {
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
            <td>${scan.order_code ? `<span class="order-badge">${scan.order_code}</span>` : '<span style="color:#9ca3af;font-size:12px;">-</span>'}</td>
            <td>${scan.image_path ? `<button onclick="viewImage('${scan.image_path}')" class="btn btn-secondary" style="padding:4px 8px;font-size:12px;">Xem ảnh</button>` : '<span style="color:#9ca3af;font-size:12px;">Không có</span>'}</td>
            <td style="font-weight: 500;">${scan.raw_data}</td>
            <td><span class="status-badge ${scan.code_type === 'OCR_TEXT' ? 'ocr' : ''}">${scan.code_type || 'N/A'}</span></td>
            <td>${scan.product_name || '-'}</td>
            <td>${scan.serial_number || '-'}</td>
            <td>${scan.device_id || '-'}</td>
            <td style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="btn btn-primary" style="padding:4px 8px;font-size:12px;" onclick="editScan(${scan.id}, '${rawEscaped}', '${nameEscaped}', '${serialEscaped}', '${deviceEscaped}', '${typeEscaped}')">Sửa</button>
              <button class="btn btn-danger" style="padding:4px 8px;font-size:12px;" onclick="deleteScan(${scan.id})">Xóa</button>
            </td>
          </tr>
        `}).join('');
      }
      
      const now = new Date();
      lastUpdateEl.textContent = `Cập nhật lúc: ${now.toLocaleTimeString('vi-VN')}`;
      
      // Reset select all checkbox
      const selectAll = document.getElementById('selectAll');
      if (selectAll) selectAll.checked = false;
    }
  } catch (err) {
    console.error('Failed to fetch scans:', err);
    lastUpdateEl.textContent = 'Cập nhật thất bại!';
  }
}

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

async function exportScans() {
  const checkboxes = document.querySelectorAll('.scan-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
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
    
    // Convert response to blob
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
      text: ids.length > 0 ? `Đã xuất ${ids.length} mục đã chọn.` : 'Đã xuất toàn bộ dữ liệu.',
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
let currentTab = 'dashboard';
let productSearchTimer = null;
let orderSearchTimer = null;
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

// ===== DASHBOARD & CHART.JS INSTANCES =====
let chartTimeline = null;
let chartCategories = null;
let chartStaff = null;
let chartOrders = null;

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
              <td style="display: flex; gap: 6px;">
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
      cachedOrders = result.data;
      renderOrderTable(cachedOrders);
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
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="viewOrderDetail(${order.id})">🔍 Tiến độ</button>
          <button class="btn btn-warning" style="padding: 4px 8px; font-size: 12px; background: #f59e0b; color: white;" onclick="showEditOrderModal(${order.id})" title="Chỉnh sửa đơn hàng">✏️ Sửa</button>
          <button class="btn btn-success" style="padding: 4px 8px; font-size: 12px;" onclick="exportOrder(${order.id})" title="Xuất biên bản Excel">📥 Excel</button>
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
