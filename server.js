const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Database initial structure & helper
let db = {
  sensors: [
    { id: 'zone-1', name: 'แปลงผักสวนครัว (Vegetable Bed)', location: 'หน้าบ้าน โซน A', threshold_low: 30, threshold_high: 70, pump_status: 'OFF', last_seen: new Date().toISOString() },
    { id: 'zone-2', name: 'โรงเรือนสมุนไพร (Greenhouse)', location: 'หลังบ้าน โซน B', threshold_low: 35, threshold_high: 75, pump_status: 'OFF', last_seen: new Date().toISOString() },
    { id: 'zone-3', name: 'สนามหญ้า (Front Lawn)', location: 'สวนหน้าบ้าน โซน C', threshold_low: 25, threshold_high: 65, pump_status: 'OFF', last_seen: new Date().toISOString() }
  ],
  settings: {
    auto_water: true,
    sensor_interval_sec: 3
  },
  logs: []
};

// Seed initial history if empty
function seedInitialData() {
  if (db.logs.length === 0) {
    const now = Date.now();
    const zones = ['zone-1', 'zone-2', 'zone-3'];
    
    for (let i = 30; i >= 0; i--) {
      const timestamp = new Date(now - i * 10 * 60 * 1000).toISOString();
      zones.forEach(zoneId => {
        let baseMoisture = zoneId === 'zone-1' ? 48 : (zoneId === 'zone-2' ? 62 : 35);
        let moisture = Math.min(95, Math.max(10, baseMoisture + Math.sin(i / 3) * 15 + (Math.random() * 4 - 2)));
        let temp = Math.min(38, Math.max(22, 28 + Math.cos(i / 4) * 4 + (Math.random() * 1 - 0.5)));
        let humidity = Math.min(90, Math.max(40, 65 - (temp - 28) * 1.5));
        
        let status = 'OPTIMAL';
        if (moisture < 30) status = 'DRY';
        else if (moisture > 70) status = 'WET';

        db.logs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sensor_id: zoneId,
          moisture: parseFloat(moisture.toFixed(1)),
          temperature: parseFloat(temp.toFixed(1)),
          humidity: parseFloat(humidity.toFixed(1)),
          status: status,
          timestamp: timestamp
        });
      });
    }
    saveDb();
  }
}

// Load DB from file
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
    } else {
      seedInitialData();
    }
  } catch (err) {
    console.error('Error loading DB file, using default structure:', err);
    seedInitialData();
  }
}

// Save DB to file
function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

loadDb();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public, root, or frontend directory flexibly
if (fs.existsSync(path.join(__dirname, 'public'))) {
  app.use(express.static(path.join(__dirname, 'public')));
}
if (fs.existsSync(path.join(__dirname, 'frontend'))) {
  app.use(express.static(path.join(__dirname, 'frontend')));
}
app.use(express.static(__dirname));

// Root route fallback
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  if (fs.existsSync(path.join(__dirname, 'frontend', 'index.html'))) {
    return res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  }
  res.send('Soil Moisture Monitoring Server is running!');
});

// Broadcast to all WebSocket clients
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// REST API Endpoints

// 1. Ingest Sensor Data (POST /api/moisture)
app.post('/api/moisture', (req, res) => {
  const { sensor_id, moisture, temperature, humidity } = req.body;

  if (!sensor_id || moisture === undefined) {
    return res.status(400).json({ success: false, message: 'Missing sensor_id or moisture level' });
  }

  const sensor = db.sensors.find(s => s.id === sensor_id);
  const threshLow = sensor ? sensor.threshold_low : 30;
  const threshHigh = sensor ? sensor.threshold_high : 70;

  const moistureNum = parseFloat(moisture);
  let status = 'OPTIMAL';
  if (moistureNum < threshLow) status = 'DRY';
  else if (moistureNum > threshHigh) status = 'WET';

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sensor_id: sensor_id,
    moisture: moistureNum,
    temperature: temperature !== undefined ? parseFloat(temperature) : null,
    humidity: humidity !== undefined ? parseFloat(humidity) : null,
    status: status,
    timestamp: new Date().toISOString()
  };

  db.logs.push(logEntry);
  if (db.logs.length > 1000) {
    db.logs.shift();
  }

  if (sensor) {
    sensor.last_seen = logEntry.timestamp;
    if (db.settings.auto_water) {
      if (status === 'DRY' && sensor.pump_status === 'OFF') {
        sensor.pump_status = 'ON';
        broadcast({ type: 'PUMP_EVENT', sensor_id: sensor_id, action: 'AUTO_START', message: `ปั๊มน้ำอัตโนมัติทำงานสำหรับ ${sensor.name}` });
      } else if (status !== 'DRY' && sensor.pump_status === 'ON') {
        sensor.pump_status = 'OFF';
        broadcast({ type: 'PUMP_EVENT', sensor_id: sensor_id, action: 'AUTO_STOP', message: `ปั๊มน้ำหยุดทำงานสำหรับ ${sensor.name}` });
      }
    }
  }

  saveDb();

  broadcast({
    type: 'NEW_READING',
    data: logEntry,
    sensor: sensor
  });

  return res.json({ success: true, data: logEntry, sensor: sensor });
});

// 2. Get Current Sensor Readings
app.get('/api/moisture/current', (req, res) => {
  const latestBySensor = db.sensors.map(sensor => {
    const sensorLogs = db.logs.filter(l => l.sensor_id === sensor.id);
    const lastReading = sensorLogs.length > 0 ? sensorLogs[sensorLogs.length - 1] : null;
    return {
      ...sensor,
      latest_reading: lastReading
    };
  });
  res.json({ success: true, sensors: latestBySensor, settings: db.settings });
});

// 3. Get Logs / History
app.get('/api/moisture/history', (req, res) => {
  const { sensor_id, limit = 50 } = req.query;
  let result = db.logs;
  if (sensor_id) {
    result = result.filter(l => l.sensor_id === sensor_id);
  }
  const maxItems = parseInt(limit) || 50;
  result = result.slice(-maxItems);
  res.json({ success: true, count: result.length, data: result });
});

// 4. Get Statistics
app.get('/api/stats', (req, res) => {
  const { sensor_id } = req.query;
  let targetLogs = db.logs;
  if (sensor_id) {
    targetLogs = targetLogs.filter(l => l.sensor_id === sensor_id);
  }

  if (targetLogs.length === 0) {
    return res.json({
      success: true,
      stats: { avg_moisture: 0, min_moisture: 0, max_moisture: 0, total_logs: 0 }
    });
  }

  const moistures = targetLogs.map(l => l.moisture);
  const sum = moistures.reduce((a, b) => a + b, 0);
  const avg = parseFloat((sum / moistures.length).toFixed(1));
  const min = Math.min(...moistures);
  const max = Math.max(...moistures);

  res.json({
    success: true,
    stats: {
      avg_moisture: avg,
      min_moisture: min,
      max_moisture: max,
      total_logs: targetLogs.length
    }
  });
});

// 5. Toggle Pump Override
app.post('/api/sensors/:id/pump', (req, res) => {
  const sensorId = req.params.id;
  const { action } = req.body;
  const sensor = db.sensors.find(s => s.id === sensorId);
  if (!sensor) {
    return res.status(404).json({ success: false, message: 'Sensor not found' });
  }

  sensor.pump_status = action === 'ON' ? 'ON' : 'OFF';
  saveDb();

  broadcast({
    type: 'PUMP_EVENT',
    sensor_id: sensorId,
    action: `MANUAL_${sensor.pump_status}`,
    message: `สวิตช์ปั๊มน้ำถูกเปลี่ยนเป็น ${sensor.pump_status} สำหรับ ${sensor.name}`
  });

  res.json({ success: true, sensor });
});

// 6. Update Settings / Thresholds
app.post('/api/sensors/:id/thresholds', (req, res) => {
  const sensorId = req.params.id;
  const { threshold_low, threshold_high } = req.body;
  const sensor = db.sensors.find(s => s.id === sensorId);
  if (!sensor) {
    return res.status(404).json({ success: false, message: 'Sensor not found' });
  }

  if (threshold_low !== undefined) sensor.threshold_low = parseFloat(threshold_low);
  if (threshold_high !== undefined) sensor.threshold_high = parseFloat(threshold_high);
  saveDb();

  broadcast({ type: 'SENSOR_UPDATED', sensor });
  res.json({ success: true, sensor });
});

// 7. Clear History Log
app.post('/api/history/clear', (req, res) => {
  db.logs = [];
  saveDb();
  broadcast({ type: 'HISTORY_CLEARED' });
  res.json({ success: true, message: 'Log history cleared' });
});

// WebSocket Connection Logic
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    sensors: db.sensors,
    settings: db.settings,
    recent_logs: db.logs.slice(-30)
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.error('WS Error:', e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Soil Moisture Real-time Monitoring Web App`);
  console.log(`  - Frontend: http://localhost:${PORT}`);
  console.log(`  - Realtime WS: ws://localhost:${PORT}/ws`);
  console.log(`  - Ingest Endpoint: POST http://localhost:${PORT}/api/moisture`);
  console.log(`====================================================`);
});
