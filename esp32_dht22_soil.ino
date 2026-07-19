// ======================================================
// ESP32 + DHT22 + Soil Moisture Sensor Arduino Sketch
// ======================================================
// การติดตั้ง Library ใน Arduino IDE:
// 1. DHT sensor library by Adafruit
// 2. ArduinoJson by Benoit Blanchon (เวอร์ชัน 6.x)

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// 1. ตั้งค่า Wi-Fi และ Backend URL
const char* ssid = "YOUR_WIFI_SSID";             // ชื่อ Wi-Fi ของคุณ
const char* password = "YOUR_WIFI_PASSWORD";     // รหัสผ่าน Wi-Fi
const char* serverUrl = "http://192.168.1.50:3000/api/moisture"; // IP คอมพิวเตอร์หรือ Cloud URL

// 2. ตั้งค่าต่อขาอุปกรณ์ (Pin Mapping)
#define DHTPIN 4            // ขา Data ของเซนเซอร์ DHT22 (ต่อตัวต้านทาน Pull-up 10k)
#define DHTTYPE DHT22       // ชนิดเซนเซอร์ DHT22
#define SOIL_PIN 34         // ขา Analog ADC1 สำหรับอ่านเซนเซอร์ความชื้นในดิน
#define RELAY_PIN 26        // ขาสำหรับสั่งงาน Relay ปั๊มน้ำ (Active LOW / HIGH)

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // ปิดปั๊มน้ำไว้ก่อน (Relay Active LOW)

  dht.begin();
  
  Serial.println("\n--- ESP32 Soil Moisture & DHT22 Client ---");
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // 1. อ่านค่าจาก DHT22 (อุณหภูมิและความชื้นอากาศ)
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // 2. อ่านค่าจากเซนเซอร์ความชื้นในดิน (Analog 0 - 4095)
    int soilRaw = analogRead(SOIL_PIN);
    
    // ปรับเทียบค่าความชื้นในดินเป็น 0 - 100% 
    // (หมายเหตุ: 4095 คือวัดในอากาศ/ดินแห้งสนิท, ~1500 คือแช่ในน้ำ/ดินเปียกชุ่ม)
    float moisture = map(soilRaw, 4095, 1500, 0, 100);
    moisture = constrain(moisture, 0, 100);

    // ตรวจสอบความถูกต้องของค่า DHT22
    if (isnan(temp) || isnan(hum)) {
      Serial.println("⚠️ Warning: Failed to read from DHT22 sensor!");
      temp = 28.5; // ค่าสำรอง
      hum = 60.0;
    }

    Serial.printf("\n[Sensor Read] Soil: %.1f%% (Raw: %d) | Temp: %.1f °C | Hum: %.1f %%\n", moisture, soilRaw, temp, hum);

    // 3. ส่งค่า JSON เข้า Backend API
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["sensor_id"] = "zone-1"; // ID ของโซนที่ต้องการส่งเข้า
    doc["moisture"] = moisture;
    doc["temperature"] = temp;
    doc["humidity"] = hum;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    int httpCode = http.POST(jsonPayload);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("✅ HTTP POST Success (Code: %d)\n", httpCode);
      
      // 4. อ่านคำสั่งสถานะปั๊มน้ำตอบกลับจากเซิร์ฟเวอร์
      StaticJsonDocument<512> resDoc;
      DeserializationError err = deserializeJson(resDoc, response);
      if (!err) {
        const char* pumpStatus = resDoc["sensor"]["pump_status"];
        if (pumpStatus && String(pumpStatus) == "ON") {
          digitalWrite(RELAY_PIN, LOW); // เปิดปั๊มน้ำ
          Serial.println("💧 Pump Status: ON (Relay Triggered)");
        } else {
          digitalWrite(RELAY_PIN, HIGH); // ปิดปั๊มน้ำ
          Serial.println("⚪ Pump Status: OFF");
        }
      }
    } else {
      Serial.printf("❌ HTTP POST Failed! Error: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
  } else {
    Serial.println("⚠️ WiFi Disconnected! Reconnecting...");
    WiFi.reconnect();
  }

  delay(3000); // อ่านและส่งข้อมูลทุกๆ 3 วินาที
}
