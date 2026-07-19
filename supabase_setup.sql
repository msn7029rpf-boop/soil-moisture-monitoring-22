-- ======================================================
-- Supabase Database Setup Script for Soil Moisture App
-- ======================================================
-- คัดลอกข้อความทั้งหมดนี้ไปวางใน SQL Editor ของ Supabase แล้วกด RUN

-- 1. สร้างตารางเก็บประวัติความชื้น (moisture_logs)
create table if not exists moisture_logs (
  id uuid default gen_random_uuid() primary key,
  sensor_id text not null,
  moisture numeric not null,
  temperature numeric,
  humidity numeric,
  status text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. สร้างตารางเก็บข้อมูลโซนและสถานะเซนเซอร์ (sensors)
create table if not exists sensors (
  id text primary key,
  name text not null,
  location text,
  threshold_low numeric default 30,
  threshold_high numeric default 70,
  pump_status text default 'OFF',
  last_seen timestamp with time zone default timezone('utc'::text, now())
);

-- 3. เพิ่มข้อมูลเริ่มต้นสำหรับโซน 1, 2, 3
insert into sensors (id, name, location) values
  ('zone-1', 'แปลงผักสวนครัว (Vegetable Bed)', 'หน้าบ้าน โซน A'),
  ('zone-2', 'โรงเรือนสมุนไพร (Greenhouse)', 'หลังบ้าน โซน B'),
  ('zone-3', 'สนามหญ้า (Front Lawn)', 'สวนหน้าบ้าน โซน C')
on conflict (id) do nothing;
