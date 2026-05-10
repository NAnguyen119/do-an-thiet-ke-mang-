const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb');

// ============================================================
//  1. CẤU HÌNH
// ============================================================
const MQTT_BROKER = "mqtt://172.20.10.2:1883";
const MQTT_TOPIC = "water_station/data";   // topic ESP publish
const WEB_PORT = 3000;                   // cổng web dashboard
const TANK_CAPACITY_LITERS = 1;          // dung tích bồn (lít) — phải khớp config.js
const MAX_HISTORY = 500;                 // lưu tối đa 500 bản ghi realtime
const history = [];                      // bộ nhớ lịch sử mực nước (realtime)
const historyLog = [];                   // bảng lịch sử mực nước mỗi 3 phút
const MAX_LOG = 240;                     // lưu tối đa 240 dòng log (10 ngày)
let lastSensorData = null;               // dữ liệu cảm biến mới nhất
let mqttSaveCount = 0;                   // đếm số lần MongoDB lưu dữ liệu
const HISTORY_LOG_INTERVAL = 15;         // cứ 15 lần lưu thì đẩy lịch sử lên dashboard

// ============================================================
//  1B. KẾT NỐI MONGODB
// ============================================================
const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "IOT_Database1";
const COLLECTION_NAME = "Lich_su_nuoc";

let db = null;
let collection = null;

MongoClient.connect(MONGO_URL)
  .then(client => {
    console.log(`✅ Đã kết nối MongoDB: ${MONGO_URL}`);
    db = client.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
  })
  .catch(err => {
    console.error("❌ Kết nối MongoDB thất bại:", err);
  });

// Sửa lệch giờ: mongoDb.py lưu datetime.now() (giờ local VN) nhưng MongoDB
// gắn nhãn UTC. Khi JS đọc lại nó cộng thêm +7 → sai 7 tiếng.
// Hàm này trừ lại timezone offset để trả về đúng giờ gốc.
function fixMongoTimestamp(mongoDate) {
  const d = new Date(mongoDate);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
}

// ============================================================
//  2. KHỞI TẠO EXPRESS + SOCKET.IO
// ============================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve toàn bộ thư mục hiện tại (index.html, script.js, style.css…)
app.use(express.static(path.join(__dirname)));

// ============================================================
//  3. KẾT NỐI MQTT BROKER (Python / Mosquitto)
// ============================================================
const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: "AquaMonitor_Server",
  reconnectPeriod: 3000,
  connectTimeout: 5000,
});

console.log("🚀 Đang khởi động AquaMonitor Server...");

mqttClient.on('connect', () => {
  console.log(`✅ Đã kết nối MQTT Broker: ${MQTT_BROKER}`);

  // Subscribe topic dữ liệu cảm biến từ ESP
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) {
      console.log(`📡 Đang lắng nghe topic: ${MQTT_TOPIC}`);
    } else {
      console.error("❌ Subscribe thất bại:", err);
    }
  });

  // Subscribe topic trạng thái bơm từ ESP (phản hồi khi nút vật lý / lệnh)
  mqttClient.subscribe('water_station/pump', (err) => {
    if (!err) {
      console.log(`📡 Đang lắng nghe topic: water_station/pump`);
    } else {
      console.error("❌ Subscribe pump status thất bại:", err);
    }
  });
});

// ============================================================
//  4. NHẬN DỮ LIỆU MQTT → ĐẨY LÊN TRÌNH DUYỆT QUA SOCKET.IO
// ============================================================
// ESP8266 gửi JSON: { "water": 0.35, "pump": "ON" }  trên topic water_station/data
// ESP8266 gửi JSON: { "pump": "ON" }                  trên topic water_station/pump
mqttClient.on('message', (topic, message) => {
  try {
    const raw = JSON.parse(message.toString());

    // === Topic: water_station/data ===
    if (topic === MQTT_TOPIC) {
      // ESP gửi: { "water": <lít>, "pump": "ON"/"OFF" }
      const waterLiters = parseFloat(raw.water) || 0;
      const pumpOn = (raw.pump === "ON");

      const data = {
        level: waterLiters,       // mực nước (lít)
        pump: pumpOn,             // trạng thái bơm (true/false)
        timestamp: new Date(),
      };

      console.log(`💧 Mực nước: ${data.level} L  |  Bơm: ${data.pump ? 'BẬT' : 'TẮT'}`);

      // Lưu vào lịch sử realtime
      history.push(data);
      if (history.length > MAX_HISTORY) history.shift();

      // Ghi nhớ dữ liệu mới nhất
      lastSensorData = data;

      // Phát tới tất cả trình duyệt đang mở dashboard
      io.emit('sensor_data', data);

      // Đếm số lần lưu vào MongoDB — cứ 15 lần đẩy lịch sử lên dashboard
      mqttSaveCount++;
      if (mqttSaveCount >= HISTORY_LOG_INTERVAL) {
        mqttSaveCount = 0;
        pushHistoryLogToDashboard();
      }
    }

    // === Topic: water_station/pump (phản hồi trạng thái bơm) ===
    if (topic === 'water_station/pump') {
      const pumpOn = (raw.pump === "ON");
      console.log(`🔔 Phản hồi bơm từ ESP: ${pumpOn ? 'BẬT' : 'TẮT'}`);
      io.emit('pump_feedback', { state: pumpOn });
    }

  } catch (e) {
    console.error("❌ Lỗi parse JSON:", e.message, "| Raw:", message.toString());
  }
});

mqttClient.on('error', (err) => {
  console.error("❌ Lỗi kết nối MQTT:", err.message);
});

mqttClient.on('offline', () => {
  console.warn("⚠️  MQTT offline – đang thử kết nối lại...");
});

// ============================================================
//  5. API LẤY LỊCH SỬ
// ============================================================
app.get('/api/history', async (req, res) => {
  if (collection) {
    try {
      const docs = await collection.find().sort({ timestamp: 1 }).toArray();
      const historyData = docs.map(d => ({
        level: parseFloat(d.value) || 0,
        pump: d.pump_status || false,
        timestamp: fixMongoTimestamp(d.timestamp)
      }));
      return res.json(historyData);
    } catch (err) {
      console.error("❌ Lỗi lấy lịch sử API:", err);
    }
  }
  res.json(history);
});

app.get('/api/history-log', (req, res) => {
  res.json(historyLog);
});

// ============================================================
//  7. ĐẨY LỊCH SỬ LÊN DASHBOARD (cứ 15 lần MongoDB lưu)
// ============================================================
async function pushHistoryLogToDashboard() {
  if (!collection) {
    // Fallback: dùng RAM nếu chưa kết nối MongoDB
    if (!lastSensorData) return;
    const entry = {
      level: lastSensorData.level,
      pump: lastSensorData.pump,
      timestamp: new Date().toISOString()
    };
    historyLog.push(entry);
    io.emit('history_log_entry', entry);
    console.log(`📋 [RAM] Log lịch sử: ${entry.level} L`);
    return;
  }

  try {
    // Lấy toàn bộ bản ghi từ MongoDB (không giới hạn)
    const docs = await collection.find().sort({ timestamp: 1 }).toArray();
    const logs = docs.map(d => ({
      level: parseFloat(d.value) || 0,
      pump: d.pump_status || false,
      timestamp: fixMongoTimestamp(d.timestamp)
    }));

    // Đẩy toàn bộ danh sách lịch sử lên dashboard
    io.emit('history_log', logs);
    console.log(`📋 [MongoDB] Đã đẩy ${logs.length} bản ghi lịch sử lên dashboard (sau 15 lần lưu)`);
  } catch (err) {
    console.error('❌ Lỗi đẩy lịch sử từ MongoDB:', err);
  }
}

// ============================================================
//  6. SOCKET.IO — TRÌNH DUYỆT KẾT NỐI / ĐIỀU KHIỂN BƠM
// ============================================================
io.on('connection', async (socket) => {
  console.log(`🌐 Trình duyệt kết nối: ${socket.id}`);

  // Lấy lịch sử từ MongoDB và gửi cho trình duyệt vừa kết nối
  if (collection) {
    try {
      const docs = await collection.find().sort({ timestamp: 1 }).toArray();
      const historyData = docs.map(d => ({
        level: parseFloat(d.value) || 0,
        pump: d.pump_status || false,
        timestamp: fixMongoTimestamp(d.timestamp)
      }));
      socket.emit('history', historyData);
    } catch (err) {
      console.error("❌ Lỗi truy xuất MongoDB:", err);
      socket.emit('history', history);
    }
  } else {
    socket.emit('history', history);
  }
  
  socket.emit('history_log', historyLog);

  // Nhận lệnh điều khiển bơm từ dashboard
  // ESP8266 nhận JSON: { "state": true/false } trên topic water/pump/cmd
  socket.on('toggle_pump', (cmd) => {
    console.log(`📲 Yêu cầu điều khiển bơm -> ${cmd.state ? 'BẬT' : 'TẮT'}`);
    if (mqttClient.connected) {
      mqttClient.publish('water/pump/cmd', JSON.stringify({
        state: cmd.state  // true = BẬT, false = TẮT
      }));
    } else {
      console.warn("⚠️ Không thể gửi lệnh do MQTT đang mất kết nối");
      socket.emit('pump_cmd_error', { msg: 'MQTT broker mất kết nối' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Trình duyệt ngắt kết nối: ${socket.id}`);
  });
});

// ============================================================
//  6. KHỞI ĐỘNG WEB SERVER
// ============================================================
server.listen(WEB_PORT, () => {
  console.log(`\n🌍 Dashboard đang chạy tại → http://localhost:${WEB_PORT}\n`);
});