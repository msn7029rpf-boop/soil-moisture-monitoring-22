// Real-time Soil Moisture Dashboard Logic
let ws = null;
let activeZoneId = 'zone-1';
let sensors = [];
let logsHistory = [];
let chartInstance = null;

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const zoneTabs = document.getElementById('zoneTabs');
const gaugePath = document.getElementById('gaugePath');
const gaugeValue = document.getElementById('gaugeValue');
const zoneLocationLabel = document.getElementById('zoneLocationLabel');
const soilStatusBadge = document.getElementById('soilStatusBadge');
const tempVal = document.getElementById('tempVal');
const humVal = document.getElementById('humVal');
const pumpToggleBtn = document.getElementById('pumpToggleBtn');
const pumpSubText = document.getElementById('pumpSubText');
const logsTableBody = document.getElementById('logsTableBody');
const statAvg = document.getElementById('statAvg');
const statMin = document.getElementById('statMin');
const statMax = document.getElementById('statMax');
const statTotal = document.getElementById('statTotal');
const toastContainer = document.getElementById('toastContainer');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  fetchInitialData();
  connectWebSocket();
  setupEventListeners();

  // Fallback timer: reload data via REST API if WebSocket is connecting/disconnected
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      fetchInitialData();
    }
  }, 5000);
});

// Fetch initial data via REST API (Instant load fallback)
async function fetchInitialData() {
  try {
    const [currRes, histRes] = await Promise.all([
      fetch('/api/moisture/current'),
      fetch('/api/moisture/history?limit=100')
    ]);
    const currData = await currRes.json();
    const histData = await histRes.json();

    if (currData.success && currData.sensors) {
      sensors = currData.sensors;
      renderZoneTabs();
    }
    if (histData.success && histData.data) {
      logsHistory = histData.data;
    }
    updateDashboardUI();
  } catch (err) {
    console.error('Error fetching initial REST API data:', err);
  }
}

// Setup WebSockets
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  statusText.innerText = 'กำลังเชื่อมต่อเซิร์ฟเวอร์...';
  
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      statusDot.classList.add('connected');
      statusText.innerText = 'เชื่อมต่อเรียลไทม์ออนไลน์ (WebSocket Live)';
      showToast('ระบบเรียลไทม์เชื่อมต่อสำเร็จ!', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleServerEvent(payload);
      } catch (e) {
        console.error('Error parsing WS message:', e);
      }
    };

    ws.onclose = () => {
      statusDot.classList.remove('connected');
      statusText.innerText = 'การเชื่อมต่อหลุด (กำลังพยายามเชื่อมต่อใหม่...)';
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

  } catch (e) {
    console.error('WebSocket Exception:', e);
    setTimeout(connectWebSocket, 3000);
  }
}

// Handle incoming events from Server
function handleServerEvent(event) {
  switch (event.type) {
    case 'INITIAL_STATE':
      sensors = event.sensors || [];
      logsHistory = event.recent_logs || [];
      renderZoneTabs();
      updateDashboardUI();
      break;

    case 'NEW_READING':
      logsHistory.push(event.data);
      if (logsHistory.length > 1000) logsHistory.shift();

      if (event.sensor) {
        const idx = sensors.findIndex(s => s.id === event.sensor.id);
        if (idx !== -1) sensors[idx] = event.sensor;
      }

      if (event.data.sensor_id === activeZoneId) {
        updateGaugeAndMetrics(event.data);
        appendChartData(event.data);
      }
      
      updateStats();
      renderLogsTable();
      break;

    case 'PUMP_EVENT':
      showToast(`📢 ${event.message}`, 'info');
      const sensor = sensors.find(s => s.id === event.sensor_id);
      if (sensor) {
        if (event.action.includes('ON') || event.action.includes('START')) {
          sensor.pump_status = 'ON';
        } else {
          sensor.pump_status = 'OFF';
        }
        if (event.sensor_id === activeZoneId) {
          updatePumpStatusUI(sensor.pump_status);
        }
      }
      break;

    case 'HISTORY_CLEARED':
      logsHistory = [];
      updateDashboardUI();
      showToast('ล้างประวัติการบันทึกเรียบร้อย', 'info');
      break;

    default:
      break;
  }
}

// Render Zone Tabs
function renderZoneTabs() {
  zoneTabs.innerHTML = '';
  sensors.forEach(sensor => {
    const btn = document.createElement('button');
    btn.className = `zone-btn ${sensor.id === activeZoneId ? 'active' : ''}`;
    btn.innerHTML = `
      <span>🌱 ${sensor.name}</span>
      <span class="zone-badge" style="background: rgba(255,255,255,0.1);">${sensor.id}</span>
    `;
    btn.onclick = () => switchZone(sensor.id);
    zoneTabs.appendChild(btn);
  });
}

// Switch active zone
function switchZone(zoneId) {
  activeZoneId = zoneId;
  renderZoneTabs();
  updateDashboardUI();
}

// Update UI based on active zone data
function updateDashboardUI() {
  const currentSensor = sensors.find(s => s.id === activeZoneId) || sensors[0];
  if (currentSensor) {
    zoneLocationLabel.innerText = `${currentSensor.name} (${currentSensor.location})`;
    updatePumpStatusUI(currentSensor.pump_status);
  }

  const zoneLogs = logsHistory.filter(l => l.sensor_id === activeZoneId);
  const latestLog = zoneLogs.length > 0 ? zoneLogs[zoneLogs.length - 1] : null;

  if (latestLog) {
    updateGaugeAndMetrics(latestLog);
  } else {
    gaugeValue.innerText = '--';
    soilStatusBadge.className = 'status-pill OPTIMAL';
    soilStatusBadge.innerText = 'NO DATA';
    tempVal.innerText = '-- °C';
    humVal.innerText = '-- %';
    setGaugePercent(0);
  }

  updateChartData(zoneLogs.slice(-20));
  updateStats();
  renderLogsTable();
}

// Update Gauge & Metrics
function updateGaugeAndMetrics(log) {
  const val = log.moisture;
  gaugeValue.innerText = val.toFixed(1);

  // Set Status Badge
  soilStatusBadge.className = `status-pill ${log.status}`;
  if (log.status === 'DRY') soilStatusBadge.innerText = '⚠️ แห้งเกินไป (DRY)';
  else if (log.status === 'OPTIMAL') soilStatusBadge.innerText = '✅ ชุ่มชื้นพอดี (OPTIMAL)';
  else if (log.status === 'WET') soilStatusBadge.innerText = '💧 ชื้นมาก (WET)';

  // Set gauge arc percentage (283 is total perimeter of arc)
  setGaugePercent(val);

  // Set Temp & Humidity
  if (log.temperature !== null && log.temperature !== undefined) {
    tempVal.innerText = `${log.temperature.toFixed(1)} °C`;
  }
  if (log.humidity !== null && log.humidity !== undefined) {
    humVal.innerText = `${log.humidity.toFixed(1)} %`;
  }
}

// Set gauge arc SVG stroke dashoffset
function setGaugePercent(percent) {
  const maxDash = 283;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = maxDash - (maxDash * clamped / 100);
  gaugePath.style.strokeDashoffset = offset;
}

// Update Pump UI
function updatePumpStatusUI(status) {
  const isON = status === 'ON';
  pumpToggleBtn.checked = isON;
  pumpSubText.innerText = isON ? 'สถานะ: กำลังทำงาน 🟢 (PUMPING)' : 'สถานะ: ปิดอยู่ ⚪ (OFF)';
  pumpSubText.style.color = isON ? '#10b981' : '#94a3b8';
}

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('moistureChart').getContext('2d');
  
  // Custom Gradient for Chart fill
  const gradientMoisture = ctx.createLinearGradient(0, 0, 0, 300);
  gradientMoisture.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
  gradientMoisture.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'ความชื้นในดิน (%)',
          data: [],
          borderColor: '#10b981',
          backgroundColor: gradientMoisture,
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#10b981'
        },
        {
          label: 'อุณหภูมิดิน (°C)',
          data: [],
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [4, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          yAxisID: 'yTemp'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Prompt', size: 12 } }
        },
        tooltip: {
          backgroundColor: 'rgba(18, 26, 43, 0.9)',
          titleColor: '#fff',
          bodyColor: '#a7f3d0',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'Prompt', size: 10 } }
        },
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'ความชื้น (%)', color: '#10b981' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        },
        yTemp: {
          position: 'right',
          min: 10,
          max: 50,
          title: { display: true, text: 'อุณหภูมิ (°C)', color: '#f59e0b' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#f59e0b' }
        }
      }
    }
  });
}

// Bulk update chart datasets
function updateChartData(logs) {
  if (!chartInstance) return;
  const labels = logs.map(l => formatTime(l.timestamp));
  const moistureData = logs.map(l => l.moisture);
  const tempData = logs.map(l => l.temperature || 0);

  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].data = moistureData;
  chartInstance.data.datasets[1].data = tempData;
  chartInstance.update();
}

// Append 1 new reading to chart dynamically
function appendChartData(log) {
  if (!chartInstance) return;
  const timeStr = formatTime(log.timestamp);
  chartInstance.data.labels.push(timeStr);
  chartInstance.data.datasets[0].data.push(log.moisture);
  chartInstance.data.datasets[1].data.push(log.temperature || 0);

  // Keep max 20 points in chart view
  if (chartInstance.data.labels.length > 20) {
    chartInstance.data.labels.shift();
    chartInstance.data.datasets[0].data.shift();
    chartInstance.data.datasets[1].data.shift();
  }
  chartInstance.update('none'); // smooth update
}

// Calculate Stats
function updateStats() {
  const zoneLogs = logsHistory.filter(l => l.sensor_id === activeZoneId);
  statTotal.innerText = zoneLogs.length;

  if (zoneLogs.length === 0) {
    statAvg.innerText = '-- %';
    statMin.innerText = '-- %';
    statMax.innerText = '-- %';
    return;
  }

  const values = zoneLogs.map(l => l.moisture);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = (sum / values.length).toFixed(1);
  const min = Math.min(...values).toFixed(1);
  const max = Math.max(...values).toFixed(1);

  statAvg.innerText = `${avg} %`;
  statMin.innerText = `${min} %`;
  statMax.innerText = `${max} %`;
}

// Render Logs Table
function renderLogsTable() {
  const zoneLogs = logsHistory.filter(l => l.sensor_id === activeZoneId).reverse();
  logsTableBody.innerHTML = '';

  if (zoneLogs.length === 0) {
    logsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-dim);">ยังไม่มีประวัติบันทึกในโซนนี้</td></tr>`;
    return;
  }

  zoneLogs.slice(0, 50).forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: monospace;">${formatDateTime(log.timestamp)}</td>
      <td><span style="font-weight:600; color: var(--primary-teal);">${log.sensor_id}</span></td>
      <td><strong style="font-size: 1rem;">${log.moisture.toFixed(1)}%</strong></td>
      <td>${log.temperature ? log.temperature.toFixed(1) + ' °C' : '-'}</td>
      <td>${log.humidity ? log.humidity.toFixed(1) + ' %' : '-'}</td>
      <td><span class="status-pill ${log.status}" style="padding: 2px 10px; font-size: 0.75rem;">${log.status}</span></td>
    `;
    logsTableBody.appendChild(tr);
  });
}

// Listeners
function setupEventListeners() {
  pumpToggleBtn.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    const action = isChecked ? 'ON' : 'OFF';
    
    try {
      const res = await fetch(`/api/sensors/${activeZoneId}/pump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`สั่งเปลี่ยนสวิตช์ปั๊มน้ำเป็น ${action} เรียบร้อย`, 'success');
      }
    } catch (err) {
      console.error('Error toggling pump:', err);
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เปลี่ยนปั๊มได้', 'error');
    }
  });
}

// Formatters
function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Export CSV
function exportCSV() {
  const zoneLogs = logsHistory.filter(l => l.sensor_id === activeZoneId);
  if (zoneLogs.length === 0) {
    showToast('ไม่มีข้อมูลสำหรับ Export', 'error');
    return;
  }

  let csv = 'Timestamp,Sensor_ID,Moisture(%),Temperature(C),Humidity(%),Status\n';
  zoneLogs.forEach(l => {
    csv += `"${l.timestamp}","${l.sensor_id}",${l.moisture},${l.temperature || ''},${l.humidity || ''},"${l.status}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moisture_logs_${activeZoneId}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว', 'success');
}

// Clear Logs
async function clearLogs() {
  if (!confirm('คุณแน่ใจหรือไม่ที่จะล้างประวัติบันทึกข้อมูลทั้งหมด?')) return;
  try {
    const res = await fetch('/api/history/clear', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      logsHistory = [];
      updateDashboardUI();
    }
  } catch (e) {
    console.error(e);
  }
}

// Helper Toast
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${msg}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}
