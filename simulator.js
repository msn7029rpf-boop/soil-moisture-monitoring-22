// Built-in IoT Simulator Controller & API Helpers
let autoSimInterval = null;
let simMoisture = 45.0;

const simMoistureRange = document.getElementById('simMoistureRange');
const simMoistureVal = document.getElementById('simMoistureVal');
const btnSendSimData = document.getElementById('btnSendSimData');
const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');

document.addEventListener('DOMContentLoaded', () => {
  if (!simMoistureRange) return;

  simMoistureRange.addEventListener('input', (e) => {
    simMoisture = parseFloat(e.target.value);
    simMoistureVal.innerText = `${simMoisture.toFixed(1)}%`;
  });

  btnSendSimData.addEventListener('click', () => {
    sendSimulatedReading(simMoisture);
  });

  btnToggleAutoSim.addEventListener('click', () => {
    toggleAutoSim();
  });
});

// Set slider preset
function setSimPreset(val) {
  simMoisture = val;
  simMoistureRange.value = val;
  simMoistureVal.innerText = `${simMoisture.toFixed(1)}%`;
  sendSimulatedReading(simMoisture);
}

// Send POST to /api/moisture
async function sendSimulatedReading(moistureVal) {
  const currentTemp = 28 + (Math.random() * 2 - 1);
  const currentHum = 65 + (Math.random() * 4 - 2);

  try {
    const res = await fetch('/api/moisture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sensor_id: activeZoneId || 'zone-1',
        moisture: moistureVal,
        temperature: parseFloat(currentTemp.toFixed(1)),
        humidity: parseFloat(currentHum.toFixed(1))
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ ส่งข้อมูลจำลอง: ${moistureVal.toFixed(1)}% เข้า Backend แล้ว`, 'success');
    }
  } catch (err) {
    console.error('Sim error:', err);
    showToast('เกิดข้อผิดพลาดในการส่งข้อมูลจำลอง', 'error');
  }
}

// Toggle Auto Simulation Loop
function toggleAutoSim() {
  if (autoSimInterval) {
    clearInterval(autoSimInterval);
    autoSimInterval = null;
    btnToggleAutoSim.innerText = '🔄 Auto Loop (ทุก 3วิ): OFF';
    btnToggleAutoSim.classList.remove('btn-primary');
    btnToggleAutoSim.classList.add('btn-secondary');
    showToast('ปิดระบบจำลองข้อมูลอัตโนมัติแล้ว', 'info');
  } else {
    btnToggleAutoSim.innerText = '🔄 Auto Loop (ทุก 3วิ): ON 🟢';
    btnToggleAutoSim.classList.remove('btn-secondary');
    btnToggleAutoSim.classList.add('btn-primary');
    showToast('เริ่มระบบส่งข้อมูลจำลองอัตโนมัติทุกๆ 3 วินาที', 'success');

    autoSimInterval = setInterval(() => {
      // Simulate realistic fluctuation (+- 1.5%)
      let delta = (Math.random() * 3 - 1.5);
      simMoisture = Math.min(98, Math.max(5, simMoisture + delta));
      simMoistureRange.value = simMoisture;
      simMoistureVal.innerText = `${simMoisture.toFixed(1)}%`;

      sendSimulatedReading(simMoisture);
    }, 3000);
  }
}

// Helper: Copy cURL example
function copyCurlExample() {
  const host = window.location.origin;
  const curlCmd = `curl -X POST "${host}/api/moisture" \\
  -H "Content-Type: application/json" \\
  -d '{"sensor_id": "${activeZoneId || 'zone-1'}", "moisture": 48.5, "temperature": 29.2, "humidity": 65.0}'`;

  navigator.clipboard.writeText(curlCmd).then(() => {
    showToast('คัดลอก cURL Command เรียบร้อยแล้ว', 'success');
  });
}

// Helper: Copy ESP32 + DHT22 Code
function copyESP32Code() {
  const esp32Code = `// ======================================================
// ESP32 + DHT22 + Soil Moisture Sensor Client
// ======================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// 1. ตั้งค่า Wi-Fi และ Backend URL
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/moisture"; // เปลี่ยนเป็น IP คอมหรือ Cloud URL

// 2. ตั้งค่าขาเซนเซอร์ (Pin Mapping)
#define DHTPIN 4            // ขา Data ของเซนเซอร์ DHT22
#define DHTTYPE DHT22       // ชนิดเซนเซอร์ DHT22
#define SOIL_PIN 34         // ขา Analog ADC สำหรับอ่านค่าความชื้นในดิน
#define RELAY_PIN 26        // ขาสำหรับสั่งงาน Relay ปั๊มน้ำ (Active LOW หรือ HIGH)

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // ปิดปั๊มน้ำไว้ก่อน (Active LOW)

  dht.begin();
  
  Serial.println("\\nConnecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // อ่านค่าจาก DHT22 (อุณหภูมิและความชื้นอากาศ)
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // อ่านค่าจากเซนเซอร์ความชื้นในดิน (Analog 0 - 4095)
    int soilRaw = analogRead(SOIL_PIN);
    // ปรับเทียบค่าความชื้นในดินเป็น 0 - 100% (4095 = ดินแห้งสนิท, 1500 = ดินเปียกชุ่ม)
    float moisture = map(soilRaw, 4095, 1500, 0, 100);
    moisture = constrain(moisture, 0, 100);

    if (isnan(temp) || isnan(hum)) {
      Serial.println("Failed to read from DHT22 sensor!");
      temp = 28.0; // ค่าเริ่มต้นสำรอง
      hum = 60.0;
    }

    Serial.printf("Soil Moisture: %.1f%% | Air Temp: %.1f°C | Air Hum: %.1f%%\\n", moisture, temp, hum);

    // ส่งค่า JSON เข้า Backend API
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["sensor_id"] = "zone-1";
    doc["moisture"] = moisture;
    doc["temperature"] = temp;
    doc["humidity"] = hum;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("HTTP POST Success! Code: %d\\n", httpCode);
      
      // อ่านคำสั่งควมควบคุมปั๊มน้ำจากเซิร์ฟเวอร์
      StaticJsonDocument<512> resDoc;
      deserializeJson(resDoc, response);
      bool isPumpOn = resDoc["sensor"]["pump_status"] == "ON";
      digitalWrite(RELAY_PIN, isPumpOn ? LOW : HIGH); // ควบคุม Relay
    } else {
      Serial.printf("HTTP POST Failed, Error: %s\\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  delay(3000); // อ่านและส่งข้อมูลทุกๆ 3 วินาที
}`;

  navigator.clipboard.writeText(esp32Code).then(() => {
    showToast('คัดลอกตัวอย่างโค้ด ESP32 + DHT22 C++ เรียบร้อยแล้ว', 'success');
  });
}
