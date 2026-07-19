// Built-in DHT22 Air Simulator Controller & API Helpers
let autoSimInterval = null;
let simMoisture = 55.0;

const simMoistureRange = document.getElementById('simMoistureRange');
const simMoistureVal = document.getElementById('simMoistureVal');
const btnSendSimData = document.getElementById('btnSendSimData');
const btnToggleAutoSim = document.getElementById('btnToggleAutoSim');

document.addEventListener('DOMContentLoaded', () => {
  if (!simMoistureRange) return;

  simMoistureRange.addEventListener('input', (e) => {
    simMoisture = parseFloat(e.target.value);
    simMoistureVal.innerText = `${simMoisture.toFixed(1)}% RH`;
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
  simMoistureVal.innerText = `${simMoisture.toFixed(1)}% RH`;
  sendSimulatedReading(simMoisture);
}

// Send POST to /api/moisture
async function sendSimulatedReading(moistureVal) {
  const currentTemp = 28 + (Math.random() * 2 - 1);

  try {
    const res = await fetch('/api/moisture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sensor_id: activeZoneId || 'zone-1',
        moisture: moistureVal, // Air humidity %
        temperature: parseFloat(currentTemp.toFixed(1)),
        humidity: moistureVal
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ ส่งข้อมูลจำลอง DHT22: ${moistureVal.toFixed(1)}% RH เข้า Backend แล้ว`, 'success');
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
    showToast('เริ่มระบบส่งข้อมูลจำลอง DHT22 อัตโนมัติทุกๆ 3 วินาที', 'success');

    autoSimInterval = setInterval(() => {
      let delta = (Math.random() * 3 - 1.5);
      simMoisture = Math.min(98, Math.max(10, simMoisture + delta));
      simMoistureRange.value = simMoisture;
      simMoistureVal.innerText = `${simMoisture.toFixed(1)}% RH`;

      sendSimulatedReading(simMoisture);
    }, 3000);
  }
}

// Helper: Copy cURL example
function copyCurlExample() {
  const host = window.location.origin;
  const curlCmd = `curl -X POST "${host}/api/moisture" \\
  -H "Content-Type: application/json" \\
  -d '{"sensor_id": "${activeZoneId || 'zone-1'}", "moisture": 58.5, "temperature": 29.2, "humidity": 58.5}'`;

  navigator.clipboard.writeText(curlCmd).then(() => {
    showToast('คัดลอก cURL Command เรียบร้อยแล้ว', 'success');
  });
}

// Helper: Copy ESP32 + DHT22 Code
function copyESP32Code() {
  const esp32Code = `// ======================================================
// ESP32 + DHT22 Air Humidity & Temperature Client
// ======================================================
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "https://soil-moisture-monitoring-22.onrender.com/api/moisture";

#define DHTPIN 4
#define DHTTYPE DHT22
#define RELAY_PIN 26

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  dht.begin();
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    if (isnan(temp) || isnan(hum)) {
      Serial.println("Failed to read from DHT22!");
      delay(2000);
      return;
    }

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["sensor_id"] = "zone-1";
    doc["moisture"] = hum; // Air Humidity %
    doc["temperature"] = temp;
    doc["humidity"] = hum;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
      Serial.printf("HTTP POST Success! Code: %d\\n", httpCode);
    }
    http.end();
  }
  delay(5000); // Send every 5 seconds
}`;

  navigator.clipboard.writeText(esp32Code).then(() => {
    showToast('คัดลอกโค้ด ESP32 + DHT22 เรียบร้อยแล้ว', 'success');
  });
}
