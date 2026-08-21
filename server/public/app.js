// ===== QUẢN LÝ GIAO DIỆN DARK / LIGHT MODE (MOBILE CLIENT) =====
function initMobileTheme() {
  const savedTheme = localStorage.getItem('mobile_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyMobileTheme(savedTheme);
}

function applyMobileTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mobile_theme', theme);
  const icon = document.getElementById('clientThemeIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleClientTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyMobileTheme(newTheme);
}

window.toggleClientTheme = toggleClientTheme;
initMobileTheme();

const readerEl = document.getElementById("reader");
const videoContainer = document.querySelector(".video-container");
const resultCard = document.getElementById("resultCard");
const rawDataEl = document.getElementById("rawData");
const codeTypeEl = document.getElementById("codeType");
const productInfoEl = document.getElementById("productInfo");
const serialNumberEl = document.getElementById("serialNumber");
const serverStatusEl = document.getElementById("serverStatus");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const flashBtn = document.getElementById("flashBtn");
const userBadge = document.getElementById("userBadge");

let html5QrCode;
let isScanning = false;
let isFlashOn = false;
let audioCtx;
let activeEngine = null;

function getUserName() {
  return localStorage.getItem("scannerUserName") || "Nhân viên";
}

function initUserBadge() {
  if (userBadge) {
    userBadge.textContent = getUserName();
  }
}

// ===== MOBILE CLIENT AUTHENTICATION & LOGIN =====
function checkMobileAuth() {
  const token = localStorage.getItem("clientToken");
  const userName = localStorage.getItem("scannerUserName");
  if (!token || !userName || userName === "Nhân viên") {
    showClientLoginScreen();
    return false;
  }
  initUserBadge();
  return true;
}

async function showClientLoginScreen() {
  const overlay = document.getElementById('clientLoginOverlay');
  const cardsList = document.getElementById('mobileUserCardsList');
  if (overlay) overlay.style.display = 'flex';

  // Load danh sách nhân viên để chọn nhanh 1-chạm
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (data.success && cardsList) {
      cardsList.innerHTML = data.data.map(u => {
        let roleBadge = '📱 Nhân viên';
        if (u.role === 'admin') roleBadge = '👑 Admin';
        else if (u.role === 'manager') roleBadge = '🏢 Quản lý';

        return `
          <div class="mobile-user-card-item" onclick="fillMobileLogin('${u.username}', '1234')">
            <span class="u-name">${u.full_name}</span>
            <span class="u-role">${roleBadge}</span>
          </div>
        `;
      }).join('');
    }
  } catch(e) {
    if (cardsList) {
      cardsList.innerHTML = `
        <div class="mobile-user-card-item" onclick="fillMobileLogin('admin', '1234')">
          <span class="u-name">Admin</span>
          <span class="u-role">👑 Quản trị</span>
        </div>
        <div class="mobile-user-card-item" onclick="fillMobileLogin('nvkho1', '1234')">
          <span class="u-name">Nhân viên kho 1</span>
          <span class="u-role">📱 Ca 1</span>
        </div>
      `;
    }
  }
}

function fillMobileLogin(username, pin) {
  const uInput = document.getElementById('mobileUsernameInput');
  const pInput = document.getElementById('mobilePinInput');
  if (uInput) uInput.value = username;
  if (pInput) {
    pInput.value = pin || '1234';
    pInput.focus();
  }
}

async function submitMobileLogin(e) {
  e.preventDefault();
  const username = document.getElementById('mobileUsernameInput').value.trim();
  const password = document.getElementById('mobilePinInput').value.trim();
  const btn = document.getElementById('mobileLoginBtn');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang xác thực...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      localStorage.setItem('clientToken', data.token);
      localStorage.setItem('scannerUserName', data.user.fullName || data.user.full_name);

      initUserBadge();
      const overlay = document.getElementById('clientLoginOverlay');
      if (overlay) overlay.style.display = 'none';

      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: `Chào ${data.user.fullName || data.user.full_name}!`,
        text: 'Bắt đầu ca làm việc',
        showConfirmButton: false,
        timer: 1800
      });
    } else {
      Swal.fire('Lỗi đăng nhập', data.message || 'Mã PIN hoặc tài khoản không đúng', 'error');
    }
  } catch (err) {
    Swal.fire('Lỗi kết nối', 'Không thể kết nối máy chủ: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Bắt đầu ca quét mã 🚀';
    }
  }
}

async function changeUserName() {
  showClientLoginScreen();
}

function copyRawData() {
  const raw = rawDataEl.textContent;
  if (!raw || raw === '-' || raw === 'Không thể đọc') return;
  navigator.clipboard.writeText(raw).then(() => {
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'success',
      title: 'Đã sao chép mã!',
      showConfirmButton: false,
      timer: 1200
    });
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = raw;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Đã sao chép!', showConfirmButton: false, timer: 1200 });
  });
}

window.changeUserName = changeUserName;
window.copyRawData = copyRawData;

// ===== ĐỘNG CƠ ÂM THANH & RUNG PHẢN HỒI (HAPTIC & AUDIO ENGINE) =====
let isAudioUnlocked = false;

function unlockAudioContext() {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      // Kích hoạt 1 buffer câm để mở khóa vĩnh viễn WebAudio trên iOS Safari
      if (!isAudioUnlocked) {
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
        isAudioUnlocked = true;
      }
    }
  } catch (e) {
    console.warn("Lỗi mở khóa AudioContext:", e);
  }
}

// Lắng nghe mọi tương tác chạm/bấm đầu tiên của người dùng để kích hoạt âm thanh
if (typeof window !== 'undefined') {
  ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudioContext, { passive: true });
  });
}

function initAudio() {
  unlockAudioContext();
}

function playBeep(type = 'success') {
  try {
    unlockAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    if (type === 'success') {
      // Âm thanh 'BÍP' sắc nét chuẩn máy quét mã vạch công nghiệp Zebra/Honeywell (2400Hz - 2800Hz)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(2800, now + 0.08);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.09);

      // Rung phản hồi cảm ứng
      if (navigator.vibrate) {
        try { navigator.vibrate(70); } catch(e) {}
      }
    } else if (type === 'duplicate') {
      // Cảnh báo trùng mã: 2 tiếng bíp liên tiếp (1800Hz -> 1400Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1800, now);
      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1400, now + 0.1);
      gain2.gain.setValueAtTime(0.7, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.18);

      if (navigator.vibrate) {
        try { navigator.vibrate([100, 50, 100]); } catch(e) {}
      }
    } else {
      // Tiếng báo lỗi âm trầm (280Hz - 180Hz)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.22);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.22);

      if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]); } catch(e) {}
      }
    }
  } catch (e) {
    console.warn("Lỗi phát âm thanh:", e);
  }
}

function createSyncId() {
  return `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = `device-${Date.now()}`;
    localStorage.setItem("deviceId", deviceId);
  }
  return deviceId;
}

function parseScannedData(rawData) {
  try {
    const data = JSON.parse(rawData);
    return {
      productCode: data.productCode || null,
      productName: data.productName || null,
      serialNumber: data.serialNumber || null
    };
  } catch {
    return {
      productCode: null,
      productName: null,
      serialNumber: rawData
    };
  }
}

function updateStatus(text, type = 'normal') {
  // Mobile status is displayed on result status or logs
}

function showResultStatus(text, type = 'normal') {
  serverStatusEl.textContent = text;
  serverStatusEl.className = 'result-status';
  if (type === 'success') serverStatusEl.classList.add('success');
  if (type === 'error') serverStatusEl.classList.add('error');
}

window.currentScanId = null;
window.currentScanData = null;
let cachedProductsList = [];
let isSyncingQueue = false;

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem('scanner_offline_queue') || '[]');
  } catch(e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem('scanner_offline_queue', JSON.stringify(queue));
  updateOfflineUI();
}

function addToOfflineQueue(payload) {
  const queue = getOfflineQueue();
  const exists = queue.some(item => item.syncId === payload.syncId);
  if (!exists) {
    queue.push(payload);
    saveOfflineQueue(queue);
  }
}

function updateOfflineUI() {
  const queue = getOfflineQueue();
  const banner = document.getElementById('offlineSyncBanner');
  const countEl = document.getElementById('offlineCount');
  const netBadge = document.getElementById('netStatusBadge');
  const netText = document.getElementById('netStatusText');

  if (countEl) countEl.textContent = queue.length;

  const isOffline = !navigator.onLine;

  if (netBadge && netText) {
    netBadge.className = 'net-status-badge';
    if (isSyncingQueue) {
      netBadge.classList.add('syncing');
      netText.textContent = `Đang gửi (${queue.length})`;
    } else if (isOffline) {
      netBadge.classList.add('offline');
      netText.textContent = `Offline (${queue.length})`;
    } else if (queue.length > 0) {
      netBadge.classList.add('syncing');
      netText.textContent = `Chờ gửi (${queue.length})`;
    } else {
      netBadge.classList.add('online');
      netText.textContent = 'Online';
    }
  }

  if (banner) {
    if (queue.length > 0 || isOffline) {
      banner.style.display = 'flex';
      const titleEl = document.getElementById('offlineBannerTitle');
      const descEl = document.getElementById('offlineBannerDesc');
      if (titleEl) titleEl.textContent = isOffline ? 'Mất kết nối mạng (Offline)' : 'Đang có dữ liệu chờ đồng bộ';
      if (descEl) descEl.innerHTML = `Đã lưu tạm <b id="offlineCount">${queue.length}</b> mã quét (Tự gửi khi có mạng)`;
    } else {
      banner.style.display = 'none';
    }
  }
}

function identifyDeviceLocally(rawData) {
  const rawClean = (rawData || '').trim();
  if (!rawClean) return { productName: null, productCode: null };
  const rawNorm = rawClean.toUpperCase().replace(/[^A-Z0-9]/g, '');

  let list = cachedProductsList;
  if (!list || list.length === 0) {
    try {
      list = JSON.parse(localStorage.getItem('cached_products_catalog') || '[]');
    } catch(e) { list = []; }
  }

  for (const p of list) {
    const codeNorm = (p.product_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const modelNorm = (p.model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (codeNorm && (rawNorm === codeNorm || (codeNorm.length >= 4 && rawNorm.includes(codeNorm)))) {
      return { productName: p.product_name, productCode: p.product_code };
    }
    if (modelNorm && (rawNorm === modelNorm || (modelNorm.length >= 4 && rawNorm.includes(modelNorm)))) {
      return { productName: p.product_name, productCode: p.product_code };
    }
  }

  return { productName: null, productCode: null };
}

async function loadProductsList() {
  if (cachedProductsList.length > 0) return cachedProductsList;
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      cachedProductsList = data.data;
      localStorage.setItem('cached_products_catalog', JSON.stringify(data.data));
    }
  } catch(e) {
    // Nếu offline, lấy danh mục từ localStorage
    try {
      cachedProductsList = JSON.parse(localStorage.getItem('cached_products_catalog') || '[]');
    } catch(err) {}
  }
  return cachedProductsList;
}

window.toggleInlineProductSearch = async function(forceOpen = null) {
  const displayBox = document.getElementById('productDisplayBox');
  const searchWrapper = document.getElementById('inlineSearchWrapper');
  const input = document.getElementById('inlineProductSearch');
  const list = document.getElementById('inlineAutocompleteList');

  if (!window.currentScanId && (!rawDataEl.textContent || rawDataEl.textContent === '-')) {
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'info',
      title: 'Vui lòng quét mã trước khi đổi sản phẩm',
      showConfirmButton: false,
      timer: 1500
    });
    return;
  }

  const shouldOpen = forceOpen !== null ? forceOpen : searchWrapper.style.display === 'none';

  if (shouldOpen) {
    displayBox.style.display = 'none';
    searchWrapper.style.display = 'block';
    input.value = '';
    input.focus();
    await loadProductsList();
    renderInlineSuggestions('');
  } else {
    displayBox.style.display = 'flex';
    searchWrapper.style.display = 'none';
    list.style.display = 'none';
  }
};

function renderInlineSuggestions(query = '') {
  const list = document.getElementById('inlineAutocompleteList');
  const q = query.trim().toLowerCase();
  
  let matches = [];
  if (!q) {
    matches = cachedProductsList.slice(0, 10);
  } else {
    matches = cachedProductsList.filter(p => 
      (p.product_name && p.product_name.toLowerCase().includes(q)) ||
      (p.product_code && p.product_code.toLowerCase().includes(q)) ||
      (p.model && p.model.toLowerCase().includes(q))
    ).slice(0, 15);
  }

  if (matches.length === 0) {
    list.innerHTML = `<div style="padding: 10px; color: #94a3b8; font-size: 12px; text-align: center;">Không tìm thấy sản phẩm</div>`;
    list.style.display = 'block';
    return;
  }

  list.innerHTML = matches.map(p => `
    <div class="inline-autocomplete-item" data-name="${(p.product_name || '').replace(/"/g, '&quot;')}" data-code="${(p.product_code || '').replace(/"/g, '&quot;')}">
      <div class="inline-item-name">${p.product_name}</div>
      <div class="inline-item-code">Mã: <b>${p.product_code}</b> ${p.model ? `| ${p.model}` : ''}</div>
    </div>
  `).join('');

  list.querySelectorAll('.inline-autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      const chosenName = item.getAttribute('data-name');
      const chosenCode = item.getAttribute('data-code');
      await selectInlineProduct(chosenName, chosenCode);
    });
  });

  list.style.display = 'block';
}

window.saveCustomInlineProduct = async function() {
  const input = document.getElementById('inlineProductSearch');
  const customName = (input?.value || '').trim();
  if (!customName) {
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'warning',
      title: 'Vui lòng nhập tên sản phẩm trước khi lưu',
      showConfirmButton: false,
      timer: 1500
    });
    return;
  }

  // Tìm trong danh mục nếu khớp
  const matched = cachedProductsList.find(p => 
    (p.product_name && p.product_name.toLowerCase() === customName.toLowerCase()) ||
    (p.product_code && p.product_code.toLowerCase() === customName.toLowerCase()) ||
    (p.model && p.model.toLowerCase() === customName.toLowerCase())
  );

  const finalName = matched ? matched.product_name : customName;
  const finalCode = matched ? matched.product_code : '';

  await selectInlineProduct(finalName, finalCode);
};

async function selectInlineProduct(productName, productCode) {
  const displayBox = document.getElementById('productDisplayBox');
  const searchWrapper = document.getElementById('inlineSearchWrapper');
  const list = document.getElementById('inlineAutocompleteList');

  displayBox.style.display = 'flex';
  searchWrapper.style.display = 'none';
  list.style.display = 'none';

  productInfoEl.textContent = productCode ? `${productName} (${productCode})` : productName;

  if (window.currentScanId) {
    try {
      const payload = {
        productName: productName,
        serialNumber: window.currentScanData?.serial_number || rawDataEl.textContent,
        deviceId: window.currentScanData?.device_id || getDeviceId(),
        codeType: window.currentScanData?.code_type || codeTypeEl.textContent
      };

      const res = await fetch(`/api/scans/${window.currentScanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (resData.success) {
        if (resData.data) window.currentScanData = resData.data;
        Swal.fire({
          toast: true,
          position: 'top',
          icon: 'success',
          title: `Đã lưu: ${productName}`,
          showConfirmButton: false,
          timer: 1500
        });
      }
    } catch (err) {
      console.error("Lỗi cập nhật sản phẩm:", err);
    }
  }
}

async function syncOfflineQueue() {
  if (isSyncingQueue) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    updateOfflineUI();
    return;
  }

  isSyncingQueue = true;
  updateOfflineUI();

  let syncedCount = 0;
  const remainingQueue = [...queue];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      const response = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const res = await response.json();
      if (res.success) {
        syncedCount++;
        remainingQueue.shift();
        saveOfflineQueue(remainingQueue);
      }
    } catch(err) {
      console.warn("Tạm dừng đồng bộ offline do chưa kết nối được máy chủ:", err);
      break;
    }
  }

  isSyncingQueue = false;
  updateOfflineUI();

  if (syncedCount > 0) {
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'success',
      title: `Đã đồng bộ ${syncedCount} mã lên máy chủ!`,
      showConfirmButton: false,
      timer: 2000
    });
  }
}

window.triggerManualSync = function() {
  syncOfflineQueue();
};

// ===== ORDER TRACKING STATE =====
let activeOrderCode = localStorage.getItem('active_order_code') || '';

async function loadOrdersForClient() {
  const select = document.getElementById('activeOrderSelect');
  if (!select) return;

  try {
    const res = await fetch('/api/orders');
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      const orders = result.data;
      cachedClientOrders = orders;

      let html = '<option value="">-- Quét tự do (Không theo đơn) --</option>';
      orders.forEach(o => {
        const isSelected = o.order_code === activeOrderCode ? 'selected' : '';
        html += `<option value="${o.order_code}" ${isSelected}>[${o.order_code}] ${o.order_name} (${o.percent}%)</option>`;
      });
      select.innerHTML = html;

      // Cập nhật badge số đơn còn thiếu trên thanh bottom nav
      const missingOrdersCount = orders.filter(o => o.total_scanned < o.total_expected).length;
      const navBadge = document.getElementById('navMissingOrdersBadge');
      if (navBadge) {
        if (missingOrdersCount > 0) {
          navBadge.textContent = missingOrdersCount;
          navBadge.style.display = 'block';
        } else {
          navBadge.style.display = 'none';
        }
      }

      // Nếu activeOrderCode không hợp lệ trong danh sách, reset
      if (activeOrderCode && !orders.some(o => o.order_code === activeOrderCode)) {
        activeOrderCode = '';
        localStorage.removeItem('active_order_code');
        select.value = '';
      }

      updateOrderProgressWidget(activeOrderCode);
      if (clientCurrentTab === 'orders') {
        renderClientOrdersList();
      }
    }
  } catch(e) {
    console.warn("Không tải được danh sách đơn hàng cho client:", e);
  }
}

window.handleOrderChange = function(orderCode) {
  activeOrderCode = orderCode || '';
  localStorage.setItem('active_order_code', activeOrderCode);
  updateOrderProgressWidget(activeOrderCode);
};

async function updateOrderProgressWidget(orderCode) {
  const widget = document.getElementById('orderProgressWidget');
  const checklistBtn = document.getElementById('orderChecklistBtn');
  if (!widget || !checklistBtn) return;

  if (!orderCode) {
    widget.style.display = 'none';
    checklistBtn.style.display = 'none';
    return;
  }

  checklistBtn.style.display = 'inline-flex';

  try {
    const res = await fetch(`/api/orders/${orderCode}`);
    const result = await res.json();
    if (result.success && result.data) {
      const data = result.data;
      widget.style.display = 'flex';

      const nameEl = document.getElementById('orderWidgetName');
      const percentEl = document.getElementById('orderWidgetPercent');
      const fillEl = document.getElementById('orderWidgetFill');
      const statusEl = document.getElementById('orderWidgetStatus');
      const remainEl = document.getElementById('orderWidgetRemaining');

      if (nameEl) nameEl.textContent = `${data.order_code} - ${data.order_name}`;
      if (percentEl) percentEl.textContent = `${data.percent}%`;
      if (fillEl) {
        fillEl.style.width = `${data.percent}%`;
        fillEl.style.background = data.percent === 100 ? '#10b981' : 'linear-gradient(90deg, #10b981, #34d399)';
      }
      if (statusEl) statusEl.innerHTML = `Đã kiểm: <b>${data.total_scanned}</b> / <b>${data.total_expected}</b> SP`;
      if (remainEl) {
        const remaining = Math.max(0, data.total_expected - data.total_scanned);
        remainEl.textContent = remaining === 0 ? '✅ Đủ số lượng' : `Thiếu: ${remaining}`;
        remainEl.style.color = remaining === 0 ? '#34d399' : '#fbbf24';
      }
    }
  } catch(e) {
    console.warn("Lỗi cập nhật widget tiến độ:", e);
  }
}

window.showMobileOrderChecklist = async function() {
  if (!activeOrderCode) return;

  try {
    const res = await fetch(`/api/orders/${activeOrderCode}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const order = result.data;
    const items = order.items || [];

    const rowsHtml = items.map((it, idx) => {
      let badgeColor = '#ef4444';
      let statusText = 'Chưa quét';
      if (it.is_completed) {
        badgeColor = '#10b981';
        statusText = '✅ Đủ';
      } else if (it.quantity_scanned > 0) {
        badgeColor = '#f59e0b';
        statusText = `Thiếu ${it.quantity_expected - it.quantity_scanned}`;
      }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 12.5px;">
          <div style="flex: 1; padding-right: 8px; text-align: left;">
            <div style="font-weight: 700; color: #1e293b;">${it.product_name}</div>
            <div style="color: #64748b; font-size: 11px; font-family: monospace;">Mã: ${it.product_code} ${it.notes ? `(${it.notes})` : ''}</div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div style="font-weight: 800; font-size: 13px; color: ${it.is_completed ? '#10b981' : '#0f172a'};">${it.quantity_scanned} / ${it.quantity_expected}</div>
            <span style="display: inline-block; font-size: 10px; font-weight: 700; color: ${badgeColor};">${statusText}</span>
          </div>
        </div>
      `;
    }).join('');

    Swal.fire({
      title: `<span style="font-size: 16px;">Checklist: ${order.order_code}</span>`,
      html: `
        <div style="text-align: left;">
          <div style="background: #f8fafc; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; font-size: 12px; color: #475569;">
            <b>Tiến độ:</b> ${order.percent}% (${order.total_scanned}/${order.total_expected} thiết bị)
          </div>
          <div style="max-height: 50vh; overflow-y: auto;">
            ${rowsHtml}
          </div>
        </div>
      `,
      width: '90%',
      showConfirmButton: true,
      confirmButtonText: 'Đóng',
      confirmButtonColor: '#4f46e5'
    });
  } catch(e) {
    Swal.fire('Lỗi', 'Không tải được checklist: ' + e.message, 'error');
  }
};

function handleOfflineScan(payload, initialName, initialCode) {
  addToOfflineQueue(payload);
  showResultStatus(`📶 Đã lưu tạm offline (Chờ đồng bộ: ${getOfflineQueue().length})`, "success");
  playBeep('success');
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  
  if (initialName) {
    productInfoEl.textContent = `${initialName} (${initialCode || ''})`;
  } else {
    productInfoEl.textContent = 'Chưa nhận diện (Chạm để chọn ⚡)';
  }
  
  const quickBtn = document.getElementById('quickEditProdBtn');
  if (quickBtn) quickBtn.style.display = 'inline-flex';
}

async function sendToServer(rawData, format, imageBase64 = null) {
  const parsed = parseScannedData(rawData);
  const localId = identifyDeviceLocally(rawData);
  
  const initialName = parsed.productName || localId.productName;
  const initialCode = parsed.productCode || localId.productCode;

  resultCard.classList.add('has-data');
  rawDataEl.textContent = rawData;
  codeTypeEl.textContent = format || 'BARCODE';
  productInfoEl.textContent = initialName ? `${initialName} (${initialCode || ''})` : 'Đang nhận diện...';
  serialNumberEl.textContent = parsed.serialNumber || rawData;
  
  // Đóng ô tìm kiếm inline nếu đang mở
  const displayBox = document.getElementById('productDisplayBox');
  const searchWrapper = document.getElementById('inlineSearchWrapper');
  if (displayBox && searchWrapper) {
    displayBox.style.display = 'flex';
    searchWrapper.style.display = 'none';
  }

  const payload = {
    syncId: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    rawData: rawData,
    codeType: format,
    productCode: initialCode,
    productName: initialName,
    serialNumber: parsed.serialNumber || rawData,
    deviceId: getDeviceId(),
    userName: getUserName(),
    scannedAt: new Date().toISOString(),
    imageBase64: imageBase64,
    orderCode: activeOrderCode || null
  };

  // Nếu trình duyệt báo rõ ràng là Offline
  if (!navigator.onLine) {
    handleOfflineScan(payload, initialName, initialCode);
    return;
  }

  showResultStatus("⏳ Đang đồng bộ máy chủ...", "normal");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch('/api/scans', {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const result = await response.json();

    if (result.success) {
      if (result.data) {
        window.currentScanId = result.data.id;
        window.currentScanData = result.data;
        
        const quickBtn = document.getElementById('quickEditProdBtn');
        if (quickBtn) quickBtn.style.display = 'inline-flex';

        const quickDelBtn = document.getElementById('quickDeleteScanBtn');
        if (quickDelBtn) quickDelBtn.style.display = 'inline-flex';

        if (result.data.product_name) {
          productInfoEl.textContent = `${result.data.product_name} (${result.data.product_code || ''})`;
        } else {
          productInfoEl.textContent = 'Chưa nhận diện (Chạm để chọn ⚡)';
        }
      }

      showResultStatus("✅ Đã lưu thành công vào cơ sở dữ liệu", "success");
      playBeep('success');
      if (navigator.vibrate) navigator.vibrate(100);

      // Cập nhật widget tiến độ đơn hàng
      if (activeOrderCode) {
        updateOrderProgressWidget(activeOrderCode);
      }

      // Nếu có hàng đợi offline từ trước, tự động đồng bộ luôn
      if (getOfflineQueue().length > 0) {
        syncOfflineQueue();
      }
    } else {
      if (result.duplicate || response.status === 409) {
        showResultStatus(`⚠️ MÃ TRÙNG: Đã quét trước đó (Bỏ qua không lưu)`, "error");
        playBeep('error');
        if (navigator.vibrate) navigator.vibrate([150, 100, 150]);

        const quickDelBtn = document.getElementById('quickDeleteScanBtn');
        if (quickDelBtn) quickDelBtn.style.display = 'none';

        Swal.fire({
          toast: true,
          position: 'top',
          icon: 'warning',
          title: '⚠️ Mã này đã được quét trước đó!',
          text: result.message || 'Hệ thống đã tự động bỏ qua để tránh trùng lặp dữ liệu.',
          timer: 3500,
          showConfirmButton: false
        });
      } else {
        showResultStatus("❌ " + (result.message || "Lỗi lưu dữ liệu"), "error");
        playBeep('error');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    }
  } catch (err) {
    console.warn("Mất kết nối máy chủ, chuyển sang lưu Offline Queue:", err);
    handleOfflineScan(payload, initialName, initialCode);
  }
}

// ===== ĐỘNG CƠ NHẬN DIỆN AI OCR (TESSERACT.JS) =====
let ocrWorker = null;

function preprocessCanvasForOcr(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;

  // Chuyển đổi sang Grayscale và tăng độ tương phản (High-Contrast Thresholding)
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    // Ngưỡng phân tách đen/trắng sắc nét cho tem in nhiệt
    const v = gray > 130 ? 255 : (gray < 85 ? 0 : gray);
    d[i] = v;
    d[i+1] = v;
    d[i+2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function extractSerialAndModelFromOcr(rawText) {
  if (!rawText) return null;
  const clean = rawText.replace(/\r\n/g, '\n').trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Tìm các mẫu tiền tố chuẩn: S/N, SN, SERIAL, SER NO, IMEI, MAC
  const snMatch = clean.match(/(?:S\/?N|SERIAL|SN|SER\s*NO|S\/N\s*NO|SERIAL\s*NUMBER)[:\s.-]*([A-Z0-9-]{4,30})/i);
  if (snMatch && snMatch[1]) {
    return { serial: snMatch[1].trim(), raw: clean, type: 'SERIAL' };
  }

  const imeiMatch = clean.match(/(?:IMEI|IMEI1|IMEI2)[:\s.-]*(\d{14,17})/i);
  if (imeiMatch && imeiMatch[1]) {
    return { serial: imeiMatch[1].trim(), raw: clean, type: 'IMEI' };
  }

  const macMatch = clean.match(/(?:MAC|MAC\s*ID|MAC\s*ADDR)[:\s.-]*([0-9A-F:-]{12,17})/i);
  if (macMatch && macMatch[1]) {
    return { serial: macMatch[1].trim().replace(/[:-]/g, ''), raw: clean, type: 'MAC' };
  }

  const modelMatch = clean.match(/(?:MODEL|MODEL\s*NO|MOD)[:\s.-]*([A-Z0-9-()]{4,30})/i);
  if (modelMatch && modelMatch[1]) {
    return { serial: modelMatch[1].trim(), raw: clean, type: 'MODEL' };
  }

  // 2. So khớp trực tiếp với 18 sản phẩm trong danh mục kho
  for (const p of cachedProductsList) {
    if (p.product_code && clean.toLowerCase().includes(p.product_code.toLowerCase())) {
      return { serial: p.product_code, raw: clean, product: p, type: 'PRODUCT_CODE' };
    }
    if (p.model && clean.toLowerCase().includes(p.model.toLowerCase())) {
      return { serial: p.model, raw: clean, product: p, type: 'PRODUCT_MODEL' };
    }
  }

  // 3. Tìm từ khóa alphanumeric có độ dài >= 6 ký tự chứa cả chữ và số
  for (const line of lines) {
    const words = line.split(/[\s,;|]+/);
    for (const w of words) {
      const cleaned = w.replace(/[^A-Z0-9-]/gi, '');
      if (cleaned.length >= 6 && /[0-9]/.test(cleaned) && /[A-Z]/i.test(cleaned)) {
        return { serial: cleaned, raw: clean, type: 'DETECTED_CODE' };
      }
    }
  }

  // 4. Nếu không khớp mẫu trên, lấy dòng chữ đầu tiên có ý nghĩa
  const fallbackLine = lines.find(l => l.length >= 4 && l.length <= 40) || lines[0] || 'OCR-SCAN';
  return { serial: fallbackLine.replace(/[^A-Z0-9-_ ]/gi, '').trim(), raw: clean, type: 'RAW_TEXT' };
}

async function processImageWithOcr(imageSource) {
  if (typeof Tesseract === 'undefined') {
    Swal.fire('Lỗi', 'Thư viện Tesseract.js chưa tải xong. Vui lòng thử lại!', 'error');
    return;
  }

  showResultStatus("🤖 AI đang đọc chữ số trên tem...", "normal");

  Swal.fire({
    title: 'Đang nhận diện AI OCR...',
    html: `
      <div style="font-size: 13px; color: #475569; margin-bottom: 8px;">Đang quét ký tự Serial / IMEI / Model trên tem nhãn</div>
      <div style="width: 100%; background: #e2e8f0; border-radius: 8px; height: 10px; overflow: hidden;">
        <div id="ocrProgressFill" style="width: 15%; height: 100%; background: linear-gradient(90deg, #4f46e5, #818cf8); transition: width 0.2s;"></div>
      </div>
      <div id="ocrProgressStatus" style="font-size: 11px; color: #64748b; margin-top: 6px;">Đang xử lý hình ảnh...</div>
    `,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const result = await Tesseract.recognize(
      imageSource,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            const fill = document.getElementById('ocrProgressFill');
            const st = document.getElementById('ocrProgressStatus');
            if (fill) fill.style.width = `${Math.max(15, pct)}%`;
            if (st) st.textContent = `Nhận diện văn bản: ${pct}%...`;
          }
        }
      }
    );

    Swal.close();
    const rawText = result.data.text;
    console.log("OCR Extracted text:", rawText);

    const parsedOcr = extractSerialAndModelFromOcr(rawText);

    if (!parsedOcr || !parsedOcr.serial) {
      showResultStatus("⚠️ Không tìm thấy số serial trên tem", "error");
      playBeep('error');
      Swal.fire('Không nhận diện được', 'Không tìm thấy số Serial hoặc mã sản phẩm trên hình ảnh tem nhãn này. Vui lòng căn chỉnh rõ nét hơn!', 'warning');
      return;
    }

    showResultStatus(`✅ Đã đọc OCR: ${parsedOcr.serial}`, "success");
    
    // Chụp lại khung ảnh làm bằng chứng lưu trữ
    let imageBase64 = null;
    if (typeof imageSource === 'string' && imageSource.startsWith('data:image')) {
      imageBase64 = imageSource;
    } else {
      imageBase64 = captureVideoFrame();
    }

    await handleSuccessfulScan(parsedOcr.serial, 'OCR_TEXT', imageBase64);

  } catch(err) {
    Swal.close();
    console.error("OCR Error:", err);
    showResultStatus("❌ Lỗi nhận diện OCR: " + err.message, "error");
    playBeep('error');
  }
}

async function startOcrCameraLive() {
  const readerEl = document.getElementById('reader');
  readerEl.innerHTML = '';

  const video = document.createElement('video');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  readerEl.appendChild(video);

  const constraints = {
    video: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();

  startBtn.style.display = 'inline-flex';
  startBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
    <span>📸 Chụp & Đọc chữ OCR</span>
  `;
  stopBtn.style.display = 'inline-flex';
  flashBtn.style.display = 'inline-flex';
  videoContainer.classList.add('scanning');

  const scanFrame = document.getElementById('scanFrameBox');
  const ocrHint = document.getElementById('ocrFrameHint');
  if (scanFrame) scanFrame.classList.add('ocr-mode');
  if (ocrHint) ocrHint.style.display = 'block';

  isScanning = true;
  activeEngine = 'ocr';
  showResultStatus("📸 Căn chữ Serial/IMEI vào khung rồi nhấn Chụp", "normal");
}

async function startScanner() {
  unlockAudioContext();
  const modeRadio = document.querySelector('input[name="scanMode"]:checked');
  const mode = modeRadio ? modeRadio.value : '1d';

  if (isScanning && activeEngine === 'ocr' && mode === 'ocr') {
    // Đang mở camera OCR -> Bấm nút để Chụp & Đọc chữ
    const frameData = captureVideoFrame();
    if (frameData) {
      await processImageWithOcr(frameData);
    }
    return;
  }

  if (isScanning) return;
  
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showResultStatus("❌ Lỗi: Yêu cầu kết nối HTTPS để mở Camera", "error");
      Swal.fire('Yêu cầu HTTPS', 'Thiết bị của bạn chặn Camera vì không phải HTTPS. Vui lòng mở bằng đường link HTTPS!', 'warning');
      return;
    }
    
    showResultStatus("⏳ Đang khởi động camera...", "normal");
    const readerEl = document.getElementById('reader');
    if (readerEl) readerEl.innerHTML = '';

    if (mode === 'ocr') {
      await startOcrCameraLive();
    } else if (mode === '1d') {
      activeEngine = 'quagga';
      startQuaggaLive();
    } else {
      activeEngine = 'zxing';
      await startZxingLive('2d');
    }

  } catch (err) {
    console.error("Camera error:", err);
    showResultStatus("❌ Lỗi mở Camera: " + (err.message || "Chưa cấp quyền"), "error");
    await stopScanner();
  }
}

window.startScanner = startScanner;

function captureVideoFrame() {
  const video = document.querySelector('#reader video');
  if (!video) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch(e) {
    console.error("Lỗi chụp ảnh:", e);
    return null;
  }
}

window.quaggaBuffer = [];
window.quaggaLastReset = Date.now();

async function handleSuccessfulScan(decodedText, formatName, customImageBase64 = null) {
  if (window.lastScannedCode === decodedText && (Date.now() - (window.lastScannedTime||0)) < 2000) {
      return;
  }
  window.lastScannedCode = decodedText;
  window.lastScannedTime = Date.now();

  // Phát tiếng 'BÍP' sắc nét & rung tức thì (0ms latency)
  playBeep('success');

  const isContinuous = document.getElementById('continuousMode').checked;
  const imageBase64 = customImageBase64 || captureVideoFrame();

  if (!isContinuous || formatName === 'OCR_TEXT') {
    await stopScanner();
  } else {
    updateStatus("Đã quét thành công", "active");
    setTimeout(() => { if(isScanning) updateStatus("Đang quét...", "active") }, 1000);
  }

  await sendToServer(decodedText, formatName, imageBase64);
}

function startQuaggaLive() {
  window.quaggaBuffer = [];
  
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  flashBtn.style.display = 'inline-flex';
  videoContainer.classList.add('scanning');
  
  const scanFrame = document.querySelector('.scan-frame');
  if (scanFrame) {
    scanFrame.style.width = '85%';
    scanFrame.style.height = '110px';
  }

  isScanning = true;

  Quagga.init({
    inputStream : {
      name : "Live",
      type : "LiveStream",
      target: document.querySelector('#reader'),
      constraints: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      area: {
        top: "30%",
        right: "5%",
        left: "5%",
        bottom: "30%"
      }
    },
    decoder : {
      readers : ["code_128_reader", "code_39_reader", "ean_reader", "upc_reader"]
    },
    locator: {
      patchSize: "medium",
      halfSample: true
    },
    numOfWorkers: navigator.hardwareConcurrency || 4,
    locate: true
  }, function(err) {
      if (err) {
          console.error("Quagga init error:", err);
          showResultStatus("❌ Lỗi camera: Vui lòng cấp quyền", "error");
          stopScanner();
          return;
      }
      Quagga.start();
      showResultStatus("📷 Đang quét mã vạch...", "normal");
  });

  Quagga.onDetected(async function(result) {
    if(result && result.codeResult && result.codeResult.code) {
      const code = result.codeResult.code;
      const format = result.codeResult.format ? result.codeResult.format.toUpperCase() : "1D_BARCODE";
      
      const now = Date.now();
      if (now - window.quaggaLastReset > 1000) {
        window.quaggaBuffer = [];
        window.quaggaLastReset = now;
      }
      window.quaggaBuffer.push(code);
      
      const matchCount = window.quaggaBuffer.filter(c => c === code).length;
      
      if (matchCount >= 3) {
        window.quaggaBuffer = [];
        handleSuccessfulScan(code, format);
      }
    }
  });
}

async function startZxingLive(mode) {
  let formats = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX
  ];
  
  const qrboxFn = (viewfinderWidth, viewfinderHeight) => {
    let size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
    return { width: size, height: size };
  };

  html5QrCode = new Html5Qrcode("reader");
  
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  flashBtn.style.display = 'inline-flex';
  videoContainer.classList.add('scanning');
  
  const scanFrame = document.querySelector('.scan-frame');
  if (scanFrame) {
    scanFrame.style.width = '70%';
    scanFrame.style.height = '200px';
  }

  isScanning = true;

  const config = { 
    fps: 12,
    formatsToSupport: formats,
    disableFlip: false,
    qrbox: qrboxFn,
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      async (decodedText, decodedResult) => {
        const formatName = decodedResult.result.format?.formatName || "QR_CODE";
        await handleSuccessfulScan(decodedText, formatName);
      },
      (errorMessage) => { }
    );
    showResultStatus("📷 Đang quét mã QR...", "normal");
  } catch(e) {
    console.error("Zxing start error:", e);
    showResultStatus("❌ Lỗi mở camera QR", "error");
    stopScanner();
  }
}

async function stopScanner() {
  if (!isScanning) return;
  
  if (activeEngine === 'quagga') {
    Quagga.stop();
    Quagga.offDetected();
  } else if (activeEngine === 'zxing' && html5QrCode) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch(e) {}
  } else if (activeEngine === 'ocr') {
    const videoEl = document.querySelector('#reader video');
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(track => track.stop());
    }
    const ocrHint = document.getElementById('ocrFrameHint');
    const scanFrame = document.getElementById('scanFrameBox');
    if (ocrHint) ocrHint.style.display = 'none';
    if (scanFrame) scanFrame.classList.remove('ocr-mode');
  }

  isScanning = false;
  videoContainer.classList.remove('scanning');
  startBtn.style.display = 'inline-flex';
  
  const mode = document.querySelector('input[name="scanMode"]:checked')?.value;
  if (mode === 'ocr') {
    startBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
      <span>📸 Bật Camera OCR</span>
    `;
  } else {
    startBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
      <span>Bật Camera Quét</span>
    `;
  }

  stopBtn.style.display = 'none';
  flashBtn.style.display = 'none';
  isFlashOn = false;
  flashBtn.classList.remove("active");
  const flashText = document.getElementById("flashText");
  if (flashText) flashText.textContent = "Flash";
}

window.stopScanner = stopScanner;

flashBtn.addEventListener('click', async () => {
  const videoEl = document.querySelector('#reader video');
  if (!videoEl || !videoEl.srcObject) return;
  const track = videoEl.srcObject.getVideoTracks()[0];
  if (!track) return;
  
  try {
    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'warning',
        title: 'Thiết bị không hỗ trợ Flash từ Web',
        showConfirmButton: false,
        timer: 2000
      });
      return;
    }
    
    isFlashOn = !isFlashOn;
    await track.applyConstraints({
      advanced: [{ torch: isFlashOn }]
    });
    
    const flashText = document.getElementById("flashText");
    if (isFlashOn) {
      flashBtn.classList.add("active");
      if (flashText) flashText.textContent = "Tắt Flash";
    } else {
      flashBtn.classList.remove("active");
      if (flashText) flashText.textContent = "Flash";
    }
  } catch (err) {
    console.error("Lỗi bật flash:", err);
  }
});

startBtn.addEventListener('click', startScanner);
stopBtn.addEventListener('click', stopScanner);

// Chuyển đổi chế độ 1D / 2D / OCR
document.querySelectorAll('input[name="scanMode"]').forEach(radio => {
  radio.addEventListener('change', async () => {
    const scanFrame = document.querySelector('.scan-frame');
    const ocrHint = document.getElementById('ocrFrameHint');
    if (scanFrame) {
      if (radio.value === '1d') {
        scanFrame.style.width = '85%';
        scanFrame.style.height = '110px';
        scanFrame.classList.remove('ocr-mode');
        if (ocrHint) ocrHint.style.display = 'none';
        startBtn.innerHTML = `<span>Bật Camera Quét</span>`;
      } else if (radio.value === '2d') {
        scanFrame.style.width = '70%';
        scanFrame.style.height = '200px';
        scanFrame.classList.remove('ocr-mode');
        if (ocrHint) ocrHint.style.display = 'none';
        startBtn.innerHTML = `<span>Bật Camera Quét</span>`;
      } else if (radio.value === 'ocr') {
        scanFrame.style.width = '88%';
        scanFrame.style.height = '140px';
        scanFrame.classList.add('ocr-mode');
        if (ocrHint) ocrHint.style.display = 'block';
        startBtn.innerHTML = `<span>📸 Bật Camera OCR</span>`;
      }
    }
    if (isScanning) {
      await stopScanner();
      await startScanner();
    }
  });
});

document.getElementById('historyBtn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/scans');
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    
    const scans = result.data.slice(0, 60);
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 0 4px;">
        <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;">Tổng cộng: ${scans.length} mã gần nhất</span>
        ${scans.length > 0 ? `<button onclick="clearAllClientScans()" style="padding: 4px 10px; background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">🗑️ Xóa tất cả</button>` : ''}
      </div>
      <div style="max-height: 65vh; overflow-y: auto; text-align: left; padding: 2px;">
    `;

    if (scans.length === 0) {
      html += '<p style="text-align:center; color:#94a3b8; padding:30px 20px;">Chưa có dữ liệu quét nào.</p>';
    } else {
      scans.forEach(scan => {
        const time = new Date(scan.scanned_at).toLocaleTimeString('vi-VN');
        const rawEscaped = scan.raw_data.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const nameEscaped = (scan.product_name || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const serialEscaped = (scan.serial_number || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const deviceEscaped = (scan.device_id || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const typeEscaped = (scan.code_type || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");

        html += `
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 10px; background: var(--card-bg, #ffffff); position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <div style="display: flex; gap: 6px; align-items: center;">
                <span style="font-size: 0.75rem; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 6px;">${scan.code_type || 'BARCODE'}</span>
                ${scan.order_code ? `<span style="font-size: 0.72rem; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 6px;">${scan.order_code}</span>` : ''}
              </div>
              <span style="font-size: 0.75rem; color: #64748b;">${time}</span>
            </div>
            <div style="font-family: monospace; font-size: 0.95rem; font-weight: 700; color: var(--text-main, #0f172a); word-break: break-all; margin-bottom: 6px;">${scan.raw_data}</div>
            <div style="font-size: 0.825rem; color: #475569; display: flex; flex-direction: column; gap: 2px;">
              <div><b>SP:</b> ${scan.product_name || '-'}</div>
              <div><b>Serial:</b> ${scan.serial_number || '-'}</div>
            </div>
            <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
              ${scan.image_path ? `<button onclick="viewClientImage('${scan.image_path}')" style="padding: 4px 10px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Xem ảnh</button>` : ''}
              <button onclick="editScan(${scan.id}, '${rawEscaped}', '${nameEscaped}', '${serialEscaped}', '${deviceEscaped}', '${typeEscaped}')" 
                      style="padding: 4px 12px; background: #4f46e5; color: white; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">
                Sửa
              </button>
              <button onclick="deleteClientScan(${scan.id}, '${rawEscaped}')" 
                      style="padding: 4px 10px; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                🗑️ Xóa
              </button>
            </div>
          </div>
        `;
      });
    }
    html += '</div>';

    Swal.fire({
      title: 'Lịch sử quét gần đây',
      html: html,
      width: '95%',
      showCloseButton: true,
      showConfirmButton: false,
      customClass: {
        popup: 'mobile-swal-popup'
      }
    });
    
  } catch (err) {
    Swal.fire('Lỗi', 'Không thể tải lịch sử: ' + err.message, 'error');
  }
});

window.deleteCurrentScan = async function() {
  if (!window.currentScanId) {
    Swal.fire('Thông báo', 'Không có mã quét nào gần nhất để xóa!', 'info');
    return;
  }

  const result = await Swal.fire({
    title: 'Xóa mã vừa quét?',
    text: `Bạn có chắc muốn xóa mã này khỏi danh sách quét không?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Đúng, Xóa ngay',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/scans/${window.currentScanId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: 'Đã xóa mã vừa quét!',
        showConfirmButton: false,
        timer: 2000
      });

      // Reset thẻ kết quả
      const delBtn = document.getElementById('quickDeleteScanBtn');
      if (delBtn) delBtn.style.display = 'none';
      const quickBtn = document.getElementById('quickEditProdBtn');
      if (quickBtn) quickBtn.style.display = 'none';

      window.currentScanId = null;
      window.currentScanData = null;

      rawDataEl.textContent = '-';
      productInfoEl.textContent = '-';
      serialNumberEl.textContent = '-';
      codeTypeEl.textContent = '-';
      showResultStatus("🗑️ Đã xóa mã quét vừa rồi.", "normal");

      if (activeOrderCode) {
        updateOrderProgressWidget(activeOrderCode);
      }
    } else {
      Swal.fire('Lỗi', data.message || 'Không thể xóa mã quét!', 'error');
    }
  } catch (err) {
    Swal.fire('Lỗi mạng', 'Không thể kết nối đến máy chủ để xóa!', 'error');
  }
};

window.deleteClientScan = async function(id, rawData) {
  const result = await Swal.fire({
    title: 'Xóa mã quét này?',
    html: `Bạn có chắc chắn muốn xóa mã <b style="font-family:monospace; color:#ef4444;">${rawData}</b> không?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Xóa',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: 'Đã xóa thành công!',
        showConfirmButton: false,
        timer: 1800
      });

      if (window.currentScanId === id) {
        window.currentScanId = null;
        const delBtn = document.getElementById('quickDeleteScanBtn');
        if (delBtn) delBtn.style.display = 'none';
      }

      if (activeOrderCode) {
        updateOrderProgressWidget(activeOrderCode);
      }

      // Mở lại modal lịch sử đã cập nhật
      const historyBtn = document.getElementById('historyBtn');
      if (historyBtn) historyBtn.click();
    } else {
      Swal.fire('Lỗi', data.message || 'Không thể xóa mã quét', 'error');
    }
  } catch (e) {
    Swal.fire('Lỗi mạng', 'Không thể kết nối đến máy chủ để xóa', 'error');
  }
};

window.clearAllClientScans = async function() {
  const result = await Swal.fire({
    title: 'Xóa toàn bộ lịch sử quét?',
    text: 'Hành động này sẽ xóa toàn bộ các mã đã quét trong hệ thống. Bạn có chắc chắn không?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Đúng, xóa tất cả',
    cancelButtonText: 'Hủy'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await authFetch('/api/scans', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      Swal.fire({
        toast: true,
        position: 'top',
        icon: 'success',
        title: 'Đã xóa toàn bộ lịch sử!',
        showConfirmButton: false,
        timer: 2000
      });
      if (activeOrderCode) {
        updateOrderProgressWidget(activeOrderCode);
      }
      const historyBtn = document.getElementById('historyBtn');
      if (historyBtn) historyBtn.click();
    } else {
      Swal.fire('Lỗi', data.message || 'Không thể xóa lịch sử', 'error');
    }
  } catch (e) {
    Swal.fire('Lỗi mạng', 'Không thể kết nối máy chủ', 'error');
  }
};

window.editScan = async function(id, rawData, productName, serialNumber, deviceId, codeType) {
  Swal.close();

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
    title: 'Sửa thông tin quét',
    html:
      `<div style="text-align: left; font-size: 0.85rem;">
        <label style="display:block; margin-bottom:4px; font-weight:600; color:#475569;">Mã gốc (Không thể sửa)</label>
        <input id="swal-raw" class="swal2-input" value="${rawData}" readonly disabled style="margin:0 0 10px 0; background: #f8fafc; width: 100%; box-sizing: border-box; font-family: monospace; font-size: 14px; height: 38px;">
        
        <div style="margin-bottom: 10px; position: relative;">
          <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-weight:600; color:#475569;">
            <span>Tên sản phẩm</span>
            <span style="font-size: 11px; color: #4f46e5; font-weight: 600;">⚡ Gõ để tìm kiếm tự động</span>
          </label>
          <input id="swal-name" class="swal2-input" value="${productName || ''}" placeholder="🔍 Nhập để tìm kiếm SP..." autocomplete="off" style="margin:0; width: 100%; box-sizing: border-box; font-size: 14px; height: 38px;">
          <div id="swal-autocomplete-list" style="position: absolute; top: calc(100% + 4px); left: 0; right: 0; max-height: 180px; overflow-y: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.18); z-index: 99999; display: none;"></div>
        </div>
        
        <label style="display:block; margin-bottom:4px; font-weight:600; color:#475569;">Số Serial</label>
        <input id="swal-serial" class="swal2-input" value="${serialNumber || ''}" placeholder="Nhập số serial..." style="margin:0 0 10px 0; width: 100%; box-sizing: border-box; font-size: 14px; height: 38px;">
        
        <label style="display:block; margin-bottom:4px; font-weight:600; color:#475569;">Ghi chú / Thiết bị</label>
        <input id="swal-device" class="swal2-input" value="${deviceId || ''}" placeholder="Ghi chú thêm..." style="margin:0; width: 100%; box-sizing: border-box; font-size: 14px; height: 38px;">
      </div>`,
    didOpen: () => {
      const input = document.getElementById('swal-name');
      const list = document.getElementById('swal-autocomplete-list');

      function renderSuggestions(query = '') {
        const q = query.trim().toLowerCase();
        let matches = [];
        if (!q) {
          matches = productsList.slice(0, 8);
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
          <div class="autocomplete-item" data-name="${(p.product_name || '').replace(/"/g, '&quot;')}" style="padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; text-align: left;">
            <div style="font-weight: 600; color: #0f172a; font-size: 13px;">${p.product_name}</div>
            <div style="font-size: 11px; color: #64748b;">Mã: <span style="color: #4f46e5; font-weight: 600;">${p.product_code}</span> ${p.model ? `| ${p.model}` : ''}</div>
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
    width: '95%',
    preConfirm: () => {
      return {
        productName: document.getElementById('swal-name').value.trim(),
        serialNumber: document.getElementById('swal-serial').value.trim(),
        deviceId: document.getElementById('swal-device').value.trim(),
        codeType: codeType
      }
    }
  });

  if (formValues) {
    try {
      const res = await fetch(`/api/scans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top',
          title: 'Đã cập nhật thông tin!',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        }).then(() => {
          document.getElementById('historyBtn').click();
        });
      } else {
        Swal.fire('Lỗi', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi mạng', 'Không thể lưu thông tin', 'error');
    }
  } else {
    document.getElementById('historyBtn').click();
  }
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
  if (e.target.files.length === 0) return;
  const file = e.target.files[0];
  
  if (isScanning) await stopScanner();
  showResultStatus("⏳ Đang phân tích hình ảnh...", "normal");
  
  try {
    const html5QrCodeObj = new Html5Qrcode("reader");
    const decodedText = await html5QrCodeObj.scanFile(file, true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Image = event.target.result;
      showResultStatus("✅ Đã nhận diện mã thành công", "success");
      await sendToServer(decodedText, "IMAGE_SCAN", base64Image);
      html5QrCodeObj.clear();
    };
    reader.readAsDataURL(file);
    
  } catch (err) {
    console.error("Lỗi đọc file:", err);
    showResultStatus("❌ Không tìm thấy mã trong ảnh", "error");
    rawDataEl.textContent = "Không thể đọc";
  }
  e.target.value = '';
});

window.viewClientImage = function(imagePath) {
  Swal.fire({
    title: 'Ảnh chụp lúc quét',
    imageUrl: imagePath,
    imageAlt: 'Barcode Image',
    imageWidth: '100%',
    showConfirmButton: true,
    confirmButtonText: 'Đóng'
  });
};

document.addEventListener("DOMContentLoaded", () => {
  checkMobileAuth();
  loadProductsList();
  loadOrdersForClient();
  updateOfflineUI();

  // Tự động kiểm tra và đồng bộ khi mạng phục hồi
  window.addEventListener('online', () => {
    updateOfflineUI();
    syncOfflineQueue();
  });

  window.addEventListener('offline', () => {
    updateOfflineUI();
  });

  // Tự động thử gửi lại hàng đợi mỗi 15 giây
  setInterval(() => {
    if (getOfflineQueue().length > 0 && navigator.onLine) {
      syncOfflineQueue();
    }
  }, 15000);

  const inlineInput = document.getElementById('inlineProductSearch');
  const inlineList = document.getElementById('inlineAutocompleteList');
  if (inlineInput) {
    inlineInput.addEventListener('input', () => {
      renderInlineSuggestions(inlineInput.value);
    });
    inlineInput.addEventListener('focus', () => {
      renderInlineSuggestions(inlineInput.value);
    });
    inlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.saveCustomInlineProduct();
      }
    });
    inlineInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (inlineList) inlineList.style.display = 'none';
      }, 250);
    });
  }
});

// ===== QUẢN LÝ TAB ĐƠN HÀNG TRÊN CLIENT & KIỂM TRA ĐỒ CÒN THIẾU =====
var clientCurrentTab = 'scanner';
var cachedClientOrders = [];
var clientOrderFilter = 'all';

function switchClientTab(tabName) {
  clientCurrentTab = tabName;
  const paneScanner = document.getElementById('clientPaneScanner');
  const paneOrders = document.getElementById('clientPaneOrders');
  const btnNavScanner = document.getElementById('btnNavScanner');
  const btnNavOrders = document.getElementById('btnNavOrders');

  if (paneScanner) paneScanner.style.display = tabName === 'scanner' ? 'flex' : 'none';
  if (paneOrders) paneOrders.style.display = tabName === 'orders' ? 'flex' : 'none';

  if (btnNavScanner) btnNavScanner.classList.toggle('active', tabName === 'scanner');
  if (btnNavOrders) btnNavOrders.classList.toggle('active', tabName === 'orders');

  if (tabName === 'orders') {
    loadClientOrdersTab();
  }
}

window.switchClientTab = switchClientTab;

async function loadClientOrdersTab() {
  const container = document.getElementById('clientOrdersListContainer');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8;">Đang tải danh sách đơn hàng...</div>`;
  }

  try {
    const res = await fetch('/api/orders');
    const result = await res.json();
    if (result.success) {
      cachedClientOrders = result.data || [];

      // Cập nhật badge số đơn còn thiếu trên thanh bottom nav
      const missingOrdersCount = cachedClientOrders.filter(o => o.total_scanned < o.total_expected).length;
      const navBadge = document.getElementById('navMissingOrdersBadge');
      if (navBadge) {
        if (missingOrdersCount > 0) {
          navBadge.textContent = missingOrdersCount;
          navBadge.style.display = 'block';
        } else {
          navBadge.style.display = 'none';
        }
      }

      renderClientOrdersList();
    } else {
      if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Lỗi tải dữ liệu đơn hàng.</div>`;
    }
  } catch (err) {
    console.error("Lỗi khi tải danh sách đơn hàng client:", err);
    if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Không thể kết nối đến máy chủ.</div>`;
  }
}

window.loadClientOrdersTab = loadClientOrdersTab;

function setOrderFilterChip(filterType) {
  clientOrderFilter = filterType;
  const chipAll = document.getElementById('chipOrderAll');
  const chipMissing = document.getElementById('chipOrderMissing');
  const chipDone = document.getElementById('chipOrderDone');

  if (chipAll) chipAll.classList.toggle('active', filterType === 'all');
  if (chipMissing) chipMissing.classList.toggle('active', filterType === 'missing');
  if (chipDone) chipDone.classList.toggle('active', filterType === 'done');

  renderClientOrdersList();
}

window.setOrderFilterChip = setOrderFilterChip;

function renderClientOrdersList() {
  const container = document.getElementById('clientOrdersListContainer');
  if (!container) return;

  const query = document.getElementById('clientOrderSearchInput')?.value.trim().toLowerCase() || '';

  let filtered = cachedClientOrders.filter(order => {
    const isComplete = (order.total_scanned >= order.total_expected && order.total_expected > 0);
    
    // Filter chip
    if (clientOrderFilter === 'missing' && isComplete) return false;
    if (clientOrderFilter === 'done' && !isComplete) return false;

    // Search query
    if (query) {
      const matchCode = (order.order_code || '').toLowerCase().includes(query);
      const matchName = (order.order_name || '').toLowerCase().includes(query);
      const matchCustomer = (order.customer_name || '').toLowerCase().includes(query);
      if (!matchCode && !matchName && !matchCustomer) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: var(--card-bg); border-radius: 14px; border: 1px solid var(--border-color); color: var(--text-muted);">
        <p style="font-size: 1.5rem; margin-bottom: 6px;">📦</p>
        <b style="font-size: 0.9rem;">Không tìm thấy đơn hàng nào</b>
        <p style="font-size: 0.75rem; margin-top: 4px;">Thử đổi từ khóa hoặc bộ lọc phía trên.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const isComplete = (order.total_scanned >= order.total_expected && order.total_expected > 0);
    const missingQty = Math.max(0, (order.total_expected || 0) - (order.total_scanned || 0));
    const percent = order.percent || 0;

    return `
      <div class="client-order-card ${isComplete ? 'is-complete' : 'is-missing'}">
        <div class="client-order-card-header">
          <span class="order-code-badge">${order.order_code}</span>
          <span class="order-status-pill ${isComplete ? 'complete' : 'missing'}">
            ${isComplete ? '✅ Đã đủ 100%' : `🔴 Còn thiếu ${missingQty} SP`}
          </span>
        </div>
        
        <div class="client-order-name">${order.order_name}</div>
        <div class="client-order-customer">👤 ${order.customer_name || 'Nội bộ'} ${order.notes ? `• ${order.notes}` : ''}</div>

        <div class="client-order-progress-wrapper">
          <div class="progress-info-row">
            <span class="progress-qty">Đã kiểm: <b>${order.total_scanned || 0}</b> / <b>${order.total_expected || 0}</b> SP</span>
            <span class="progress-pct ${isComplete ? 'done' : ''}">${percent}%</span>
          </div>
          <div class="client-order-progress-track">
            <div class="client-order-progress-fill ${isComplete ? 'complete' : ''}" style="width: ${percent}%;"></div>
          </div>
        </div>

        <div class="client-order-actions">
          <button class="btn-card-inspect" onclick="inspectOrderMissingDetails('${order.order_code}')">
            📋 Xem đồ còn thiếu
          </button>
          <button class="btn-card-scan-now" onclick="selectOrderAndStartScan('${order.order_code}')">
            📷 Quét đơn này
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.renderClientOrdersList = renderClientOrdersList;

function selectOrderAndStartScan(orderCode) {
  activeOrderCode = orderCode;
  const select = document.getElementById('activeOrderSelect');
  if (select) {
    select.value = orderCode;
  }
  updateOrderProgressWidget(orderCode);

  Swal.close();
  switchClientTab('scanner');

  if (!isScanning) {
    startScanner();
  }

  Swal.fire({
    toast: true,
    position: 'top',
    icon: 'success',
    title: `Đang quét đơn hàng ${orderCode}`,
    showConfirmButton: false,
    timer: 2000
  });
}

window.selectOrderAndStartScan = selectOrderAndStartScan;

async function inspectOrderMissingDetails(orderCode, filterMode = 'all') {
  try {
    const res = await fetch(`/api/orders/${orderCode}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const order = result.data;
    const items = order.items || [];
    const totalItems = items.length;
    const missingItems = items.filter(it => it.quantity_scanned < it.quantity_expected);
    const completedItems = items.filter(it => it.quantity_scanned >= it.quantity_expected);
    const missingTotalQty = Math.max(0, order.total_expected - order.total_scanned);

    function buildRowsHtml(mode) {
      let displayItems = items;
      if (mode === 'missing') displayItems = missingItems;
      if (mode === 'done') displayItems = completedItems;

      if (displayItems.length === 0) {
        return `<div style="text-align: center; padding: 25px 10px; color: #94a3b8; font-size: 13px;">${mode === 'missing' ? '🎉 Tất cả mặt hàng trong đơn này đều đã đủ số lượng!' : 'Chưa có mặt hàng nào đạt.'}</div>`;
      }

      return displayItems.map((it, idx) => {
        const isDone = it.quantity_scanned >= it.quantity_expected;
        const missingPart = Math.max(0, it.quantity_expected - it.quantity_scanned);

        return `
          <div style="background: ${isDone ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.06)'}; border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)'}; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div style="flex: 1; text-align: left;">
                <div style="font-weight: 800; font-size: 13px; color: var(--text-main, #0f172a); line-height: 1.3;">${it.product_name}</div>
                <div style="color: #64748b; font-size: 11px; font-family: monospace; margin-top: 2px;">
                  Mã SP: <b>${it.product_code}</b> ${it.notes ? `• ${it.notes}` : ''}
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <span style="font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 12px; display: inline-block; ${isDone ? 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;' : 'background:#fef2f2; color:#ef4444; border:1px solid #fecaca;'}">
                  ${isDone ? `✅ Đã đủ (${it.quantity_scanned}/${it.quantity_expected})` : `🔴 Còn thiếu ${missingPart}`}
                </span>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 11.5px; color: #475569; border-top: 1px dashed rgba(100, 116, 139, 0.2); padding-top: 6px;">
              <span>Yêu cầu: <b>${it.quantity_expected}</b></span>
              <span style="color: ${isDone ? '#059669' : '#d97706'}; font-weight: 700;">Đã quét: <b>${it.quantity_scanned}</b></span>
              <span style="color: ${isDone ? '#059669' : '#dc2626'}; font-weight: 800;">${isDone ? 'Đạt chuẩn' : `Thiếu: ${missingPart}`}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const modalHtml = `
      <div style="text-align: left; font-family: inherit;">
        <!-- Top Stats Overview -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 12px;">
          <div style="background: rgba(79, 70, 229, 0.08); padding: 8px; border-radius: 8px; text-align: center; border: 1px solid rgba(79, 70, 229, 0.15);">
            <div style="font-size: 10px; font-weight: 700; color: #4f46e5;">TỔNG CẦN QUÉT</div>
            <div style="font-size: 15px; font-weight: 800; color: #4f46e5;">${order.total_expected} SP</div>
          </div>
          <div style="background: rgba(16, 185, 129, 0.08); padding: 8px; border-radius: 8px; text-align: center; border: 1px solid rgba(16, 185, 129, 0.15);">
            <div style="font-size: 10px; font-weight: 700; color: #059669;">ĐÃ QUÉT ĐẠT</div>
            <div style="font-size: 15px; font-weight: 800; color: #059669;">${order.total_scanned} SP</div>
          </div>
          <div style="background: rgba(239, 68, 68, 0.08); padding: 8px; border-radius: 8px; text-align: center; border: 1px solid rgba(239, 68, 68, 0.15);">
            <div style="font-size: 10px; font-weight: 700; color: #dc2626;">CÒN THIẾU</div>
            <div style="font-size: 15px; font-weight: 800; color: #dc2626;">${missingTotalQty} SP</div>
          </div>
        </div>

        <!-- Filter Sub-tabs inside Modal -->
        <div style="display: flex; gap: 6px; margin-bottom: 10px;">
          <button id="modalFilterAll" onclick="setModalFilter('all')" style="flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; border: 1px solid #cbd5e1; background: #4f46e5; color: white; cursor: pointer;">
            Tất cả (${totalItems})
          </button>
          <button id="modalFilterMissing" onclick="setModalFilter('missing')" style="flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; border: 1px solid #cbd5e1; background: #f8fafc; color: #dc2626; cursor: pointer;">
            🔴 Còn thiếu (${missingItems.length})
          </button>
          <button id="modalFilterDone" onclick="setModalFilter('done')" style="flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; border: 1px solid #cbd5e1; background: #f8fafc; color: #059669; cursor: pointer;">
            ✅ Đã đủ (${completedItems.length})
          </button>
        </div>

        <!-- Items Container -->
        <div id="modalItemsList" style="max-height: 52vh; overflow-y: auto; padding-right: 2px;">
          ${buildRowsHtml(filterMode)}
        </div>

        <!-- Action Button to start scanning immediately -->
        <div style="margin-top: 14px;">
          <button onclick="selectOrderAndStartScan('${orderCode}')" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; font-weight: 800; font-size: 14px; border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
            📷 Bắt Đầu Quét Đơn Hàng Này Ngay
          </button>
        </div>
      </div>
    `;

    Swal.fire({
      title: `<span style="font-size: 16px;">📦 Đơn hàng ${order.order_code}</span>`,
      html: modalHtml,
      width: '95%',
      showConfirmButton: false,
      showCloseButton: true,
      customClass: {
        popup: 'mobile-swal-popup'
      },
      didOpen: () => {
        window.setModalFilter = function(mode) {
          const listEl = document.getElementById('modalItemsList');
          if (listEl) listEl.innerHTML = buildRowsHtml(mode);

          const btnAll = document.getElementById('modalFilterAll');
          const btnMissing = document.getElementById('modalFilterMissing');
          const btnDone = document.getElementById('modalFilterDone');

          if (btnAll) {
            btnAll.style.background = mode === 'all' ? '#4f46e5' : '#f8fafc';
            btnAll.style.color = mode === 'all' ? '#ffffff' : '#475569';
          }
          if (btnMissing) {
            btnMissing.style.background = mode === 'missing' ? '#ef4444' : '#f8fafc';
            btnMissing.style.color = mode === 'missing' ? '#ffffff' : '#dc2626';
          }
          if (btnDone) {
            btnDone.style.background = mode === 'done' ? '#10b981' : '#f8fafc';
            btnDone.style.color = mode === 'done' ? '#ffffff' : '#059669';
          }
        };
      }
    });

  } catch(e) {
    Swal.fire('Lỗi', 'Không thể tải chi tiết đơn hàng: ' + e.message, 'error');
  }
}

window.inspectOrderMissingDetails = inspectOrderMissingDetails;

