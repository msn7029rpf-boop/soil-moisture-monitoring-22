const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Supabase Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Connected to Supabase Cloud Database!');
} else {
  console.log('ℹ️ Running with Persistent JSON Database store.');
}

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

let db = {
  sensors: [
    { id: 'zone-1', name: 'แปลงผักสวนครัว (Vegetable Bed)', location: 'หน้าบ้าน โซน A', threshold_low: 40, threshold_high: 70, pump_status: 'OFF', last_seen: new Date().toISOString() },
    { id: 'zone-2', name: 'โรงเรือนสมุนไพร (Greenhouse)', location: 'หลังบ้าน โซน B', threshold_low: 45, threshold_high: 75, pump_status: 'OFF', last_seen: new Date().toISOString() },
    { id: 'zone-3', name: 'สนามหญ้า (Front Lawn)', location: 'สวนหน้าบ้าน โซน C', threshold_low: 35, threshold_high: 65, pump_status: 'OFF', last_seen: new Date().toISOString() }
  ],
  settings: { auto_water: true, sensor_interval_sec: 3 },
  logs: []
};

function seedInitialData() {
  if (db.logs.length === 0) {
    const now = Date.now();
    const zones = ['zone-1', 'zone-2', 'zone-3'];
    
    for (let i = 30; i >= 0; i--) {
      const timestamp = new Date(now - i * 10 * 60 * 1000).toISOString();
      zones.forEach(zoneId => {
        let baseHum = zoneId === 'zone-1' ? 58 : (zoneId === 'zone-2' ? 65 : 45);
        let airHum = Math.min(95, Math.max(20, baseHum + Math.sin(i / 3) * 10 + (Math.random() * 4 - 2)));
        let temp = Math.min(38, Math.max(22, 28 + Math.cos(i / 4) * 4 + (Math.random() * 1 - 0.5)));
        
        let status = 'OPTIMAL';
        if (airHum < 40) status = 'DRY';
        else if (airHum > 70) status = 'HUMID';

        db.logs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sensor_id: zoneId,
          moisture: parseFloat(airHum.toFixed(1)),
          temperature: parseFloat(temp.toFixed(1)),
          humidity: parseFloat(airHum.toFixed(1)),
          status: status,
          timestamp: timestamp
        });
      });
    }
    saveDb();
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
    } else {
      seedInitialData();
    }
  } catch (err) {
    console.error('Error loading DB file:', err);
    seedInitialData();
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

loadDb();

app.use(cors());
app.use(express.json());

if (fs.existsSync(path.join(__dirname, 'public'))) app.use(express.static(path.join(__dirname, 'public')));
if (fs.existsSync(path.join(__dirname, 'frontend'))) app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  if (fs.existsSync(path.join(__dirname, 'public', 'index.html'))) return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  if (fs.existsSync(path.join(__dirname, 'index.html'))) return res.sendFile(path.join(__dirname, 'index.html'));
  res.send('Air Climate Monitoring Server is running!');
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

// REST API Endpoints

// 1. Ingest Sensor Data (POST /api/moisture)
app.post('/api/moisture', async (req, res) => {
  let { sensor_id, moisture, temperature, humidity } = req.body;

  if (!sensor_id) {
    return res.status(400).json({ success: false, message: 'Missing sensor_id' });
  }

  // Use Air Humidity from DHT22 as primary gauge metric
  let primaryAirHum = 50.0;
  if (humidity !== undefined && humidity !== null) {
    primaryAirHum = parseFloat(humidity);
  } else if (moisture !== undefined && moisture !== null) {
    primaryAirHum = parseFloat(moisture);
  }

  const sensor = db.sensors.find(s => s.id === sensor_id);
  const threshLow = sensor ? sensor.threshold_low : 40;
  const threshHigh = sensor ? sensor.threshold_high : 70;

  let status = 'OPTIMAL';
  if (primaryAirHum < threshLow) status = 'DRY';
  else if (primaryAirHum > threshHigh) status = 'HUMID';

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sensor_id: sensor_id,
    moisture: primaryAirHum,
    temperature: temperature !== undefined && temperature !== null ? parseFloat(temperature) : null,
    humidity: primaryAirHum,
    status: status,
    timestamp: new Date().toISOString()
  };

  db.logs.push(logEntry);
  if (db.logs.length > 1000) db.logs.shift();

  if (sensor) {
    sensor.last_seen = logEntry.timestamp;
    if (db.settings.auto_water) {
      if (status === 'DRY' && sensor.pump_status === 'OFF') {
        sensor.pump_status = 'ON';
        broadcast({ type: 'PUMP_EVENT', sensor_id: sensor_id, action: 'AUTO_START', message: `ระบบพ่นหมอกทำงานสำหรับ ${sensor.name}` });
      } else if (status !== 'DRY' && sensor.pump_status === 'ON') {
        sensor.pump_status = 'OFF';
        broadcast({ type: 'PUMP_EVENT', sensor_id: sensor_id, action: 'AUTO_STOP', message: `ระบบพ่นหมอกหยุดทำงานสำหรับ ${sensor.name}` });
      }
    }
  }

  saveDb();

  if (supabase) {
    try {
      await supabase.from('moisture_logs').insert([{
        sensor_id: sensor_id,
        moisture: primaryAirHum,
        temperature: logEntry.temperature,
        humidity: primaryAirHum,
        status: status,
        created_at: logEntry.timestamp
      }]);
    } catch (err) {
      console.error('Supabase Insert Error:', err);
    }
  }

  broadcast({ type: 'NEW_READING', data: logEntry, sensor: sensor });

  return res.json({ success: true, data: logEntry, sensor: sensor });
});

app.get('/api/moisture/current', async (req, res) => {
  const latestBySensor = db.sensors.map(sensor => {
    const sensorLogs = db.logs.filter(l => l.sensor_id === sensor.id);
    const lastReading = sensorLogs.length > 0 ? sensorLogs[sensorLogs.length - 1] : null;
    return { ...sensor, latest_reading: lastReading };
  });
  res.json({ success: true, sensors: latestBySensor, settings: db.settings });
});

app.get('/api/moisture/history', async (req, res) => {
  const { sensor_id, limit = 50 } = req.query;

  if (supabase) {
    try {
      let query = supabase.from('moisture_logs').select('*').order('created_at', { ascending: true }).limit(parseInt(limit) || 50);
      if (sensor_id) query = query.eq('sensor_id', sensor_id);
      const { data, error } = await query;
      if (!error && data) {
        const formatted = data.map(d => ({
          id: d.id,
          sensor_id: d.sensor_id,
          moisture: parseFloat(d.moisture),
          temperature: d.temperature ? parseFloat(d.temperature) : null,
          humidity: d.humidity ? parseFloat(d.humidity) : null,
          status: d.status,
          timestamp: d.created_at
        }));
        return res.json({ success: true, count: formatted.length, data: formatted, source: 'supabase' });
      }
    } catch (e) {}
  }

  let result = db.logs;
  if (sensor_id) result = result.filter(l => l.sensor_id === sensor_id);
  result = result.slice(-(parseInt(limit) || 50));
  res.json({ success: true, count: result.length, data: result, source: 'local' });
});

app.get('/api/stats', (req, res) => {
  const { sensor_id } = req.query;
  let targetLogs = db.logs;
  if (sensor_id) targetLogs = targetLogs.filter(l => l.sensor_id === sensor_id);

  if (targetLogs.length === 0) {
    return res.json({ success: true, stats: { avg_moisture: 0, min_moisture: 0, max_moisture: 0, total_logs: 0 } });
  }

  const moistures = targetLogs.map(l => l.moisture);
  const sum = moistures.reduce((a, b) => a + b, 0);
  res.json({
    success: true,
    stats: {
      avg_moisture: parseFloat((sum / moistures.length).toFixed(1)),
      min_moisture: Math.min(...moistures),
      max_moisture: Math.max(...moistures),
      total_logs: targetLogs.length
    }
  });
});

app.post('/api/sensors/:id/pump', (req, res) => {
  const sensorId = req.params.id;
  const { action } = req.body;
  const sensor = db.sensors.find(s => s.id === sensorId);
  if (!sensor) return res.status(404).json({ success: false, message: 'Sensor not found' });

  sensor.pump_status = action === 'ON' ? 'ON' : 'OFF';
  saveDb();

  broadcast({
    type: 'PUMP_EVENT',
    sensor_id: sensorId,
    action: `MANUAL_${sensor.pump_status}`,
    message: `สวิตช์ระบบพ่นหมอกถูกเปลี่ยนเป็น ${sensor.pump_status} สำหรับ ${sensor.name}`
  });

  res.json({ success: true, sensor });
});

app.post('/api/history/clear', async (req, res) => {
  db.logs = [];
  saveDb();
  if (supabase) {
    try { await supabase.from('moisture_logs').delete().neq('sensor_id', ''); } catch (e) {}
  }
  broadcast({ type: 'HISTORY_CLEARED' });
  res.json({ success: true, message: 'Log history cleared' });
});

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
      if (parsed.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
    } catch (e) {}
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Air Climate Real-time Monitoring Web App (DHT22)`);
  console.log(`  - Frontend: http://localhost:${PORT}`);
  console.log(`  - Realtime WS: ws://localhost:${PORT}/ws`);
  console.log(`====================================================`);
});
