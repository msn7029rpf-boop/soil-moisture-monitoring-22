# ☁️ คู่มือการนำระบบขึ้นอินเตอร์เน็ต (Deployment Guide)

เอกสารนี้อธิบายวิธีการนำเว็บแอปพลิเคชัน **Soil Moisture Real-time Monitoring** ขึ้นอินเตอร์เน็ต (Cloud Online) เพื่อให้สามารถเข้าดูผ่านมือถือ/คอมพิวเตอร์จากที่ไหนก็ได้ในโลก และให้อุปกรณ์ ESP32/Arduino ส่งข้อมูลเข้าสู่ระบบผ่านอินเตอร์เน็ตได้จริง

---

## 🎯 วิธีที่ 1: อัปโหลดขึ้น Render.com (ฟรี 100% - แนะนำสำหรับ WebSockets & API)

Render.com เป็นผู้ให้บริการ Cloud Hosting ฟรี ที่รองรับทั้ง Node.js Express API, Static Frontend และ WebSockets

### ขั้นตอนการนำขึ้น Render.com:

1. **สร้าง GitHub Repository**:
   - สมัคร/เข้าใช้ [GitHub.com](https://github.com)
   - สร้าง Repository ใหม่ (เช่น ชื่อ `soil-moisture-monitoring`)
   - อัปโหลดไฟล์โปรเจกต์ทั้งหมด (ยกเว้นโฟลเดอร์ `node_modules`) ขึ้นบน GitHub

2. **เชื่อมต่อกับ Render.com**:
   - เข้าเว็บ [https://render.com](https://render.com) แล้ว Log in ด้วยบัญชี GitHub
   - กดปุ่ม **New +** -> เลือก **Web Service**
   - เลือก Repository `soil-moisture-monitoring` ที่เพิ่งสร้างขึ้นมา
   - ตั้งค่ารายละเอียดดังนี้:
     - **Name**: `soil-moisture-monitoring` (หรือชื่อตามต้องการ)
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Instance Type**: `Free`
   - กดปุ่ม **Create Web Service**

3. **ได้ URL สาธารณะใช้งานทันที**:
   - เมื่อ Render ทำการ Build เสร็จ จะได้ URL เช่น: `https://soil-moisture-app.onrender.com`
   - สามารถนำ URL นี้ไปเปิดบนมือถือ แท็บเล็ต หรือส่งให้ผู้อื่นดูได้ทันที!

---

## 💻 วิธีที่ 2: อัปโหลดไฟล์ ZIP เข้าโฮสติ้ง / VPS / cPanel

ไฟล์ซอร์สโค้ดโปรเจกต์ทั้งหมดถูกบีบอัดเป็นไฟล์ `soil-moisture-app.zip` ไว้ในโฟลเดอร์โปรเจกต์แล้ว

### การนำไปรันบน VPS (เช่น DigitalOcean, AWS, Linode, Google Cloud):

1. อัปโหลดไฟล์ `soil-moisture-app.zip` ไปที่ VPS
2. แตกไฟล์ ZIP และรันคำสั่ง:
   ```bash
   unzip soil-moisture-app.zip
   cd soil-moisture-app
   npm install
   ```
3. รันผ่าน **PM2** เพื่อให้เซิร์ฟเวอร์ทำงานตลอด 24 ชั่วโมง:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "soil-moisture"
   pm2 save
   pm2 startup
   ```
4. หรือรันผ่าน **Docker**:
   ```bash
   docker-compose up -d --build
   ```

---

## 📡 วิธีการตั้งค่าฮาร์ดแวร์ ESP32 / Arduino เมื่อขึ้นอินเตอร์เน็ตแล้ว

เมื่อเปลี่ยนจาก `localhost` เป็น URL อินเตอร์เน็ต ให้แก้ไขโค้ดใน ESP32 ดังนี้:

### โค้ดเดิม (Localhost):
```cpp
const char* serverUrl = "http://192.168.1.50:3000/api/moisture";
```

### โค้ดใหม่ (Cloud URL - Render.com):
```cpp
#include <WiFiClientSecure.h> // ใช้ HTTPS Client

const char* serverUrl = "https://soil-moisture-app.onrender.com/api/moisture";
```

---

## 📁 ไฟล์คอร์เดทสำเร็จรูปในโปรเจกต์สำหรับอัปโหลด
- `Dockerfile` - สำหรับ Docker / Cloud Containers
- `docker-compose.yml` - สำหรับ VPS Deployment
- `render.yaml` - สำหรับ Render.com 1-Click Deploy
- `.gitignore` - ป้องกันการอัปโหลดไฟล์ขยะ
- `soil-moisture-app.zip` - ไฟล์รวมซอร์สโค้ดทั้งหมด พร้อมนำไปอัปโหลดขึ้นโฮสติ้ง
