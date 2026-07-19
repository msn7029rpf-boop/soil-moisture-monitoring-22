// ======================================================
// ESP32 + DHT22 Air Humidity & Temperature Client
// ======================================================
// Library Required:
// 1. DHT sensor library (by Adafruit)
// 2. ArduinoJson (by Benoit Blanchon v6.x)

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// 1. ตั้งค่า Wi-Fi และ Backend Cloud URL
const char* ssid = "YOUR_WIFI_SSID";             // ชื่อ Wi-Fi ของคุณ
const char* password = "YOUR_WIFI_PASSWORD";     // รหัสผ่าน Wi-Fi
const char* serverUrl = "https://soil-moisture-monitoring-22.onrender.com/api/moisture"; // Cloud Render URL

// 2. ตั้งค่าขาอุปกรณ์ (Pin Mapping)
#define DHTPIN 4            // ขา Data ของเซนเซอร์ DHT22 (ต่อตัวต้านทาน Pull-up 10k)
#define DHTTYPE DHT22       // ชนิดเซนเซอร์ DHT22
#define RELAY_PIN 26        // ขาสำหรับสั่งงาน Relay ระบบพ่นหมอก/พัดลม (Active LOW)

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // ปิดระบบพ่นหมอก/พัดลมไว้ก่อน (Relay Active LOW)

  dht.begin();
  
  Serial.println("\n--- ESP32 DHT22 Air Climate Client ---");
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n✅ WiFi Connected Successfully!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // 1. อ่านค่าจากเซนเซอร์ DHT22 (อุณหภูมิและความชื้นในอากาศ)
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // ตรวจสอบความถูกต้องของการอ่านค่า DHT22
    if (isnan(temp) || isnan(hum)) {
      Serial.println("⚠️ Warning: Failed to read from DHT22 sensor! Retrying...");
      delay(2000);
      return;
    }

    Serial.printf("\n[DHT22 Read] Air Humidity: %.1f %% RH | Air Temperature: %.1f °C\n", hum, temp);

    // 2. สร้างข้อมูล JSON ส่งเข้า Cloud Server
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["sensor_id"] = "zone-1"; // ID ของโซนที่ต้องการส่งเข้า
    doc["moisture"] = hum;       // ความชื้นในอากาศ (%)
    doc["temperature"] = temp;   // อุณหภูมิอากาศ (°C)
    doc["humidity"] = hum;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpCode = http.POST(jsonPayload);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("✅ Upload Cloud Success! (HTTP Code: %d)\n", httpCode);
      
      // 3. อ่านคำสั่งระบบพ่นหมอก/พัดลมตอบกลับจากเซิร์ฟเวอร์
      StaticJsonDocument<512> resDoc;
      DeserializationError err = deserializeJson(resDoc, response);
      if (!err) {
        const char* pumpStatus = resDoc["sensor"]["pump_status"];
        if (pumpStatus && String(pumpStatus) == "ON") {
          digitalWrite(RELAY_PIN, LOW); // เปิดระบบพ่นหมอก/พัดลม
          Serial.println("💨 Misting/Fan Status: ON (Relay Active)");
        } else {
          digitalWrite(RELAY_PIN, HIGH); // ปิดระบบพ่นหมอก/พัดลม
          Serial.println("⚪ Misting/Fan Status: OFF");
        }
      }
    } else {
      Serial.printf("❌ Upload Failed! Error: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
  } else {
    Serial.println("⚠️ WiFi Disconnected! Reconnecting...");
    WiFi.reconnect();
  }

  // ส่งข้อมูลทุกๆ 5 วินาที
  delay(5000);
}
