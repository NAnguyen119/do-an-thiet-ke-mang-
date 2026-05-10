// ============================================================
//  CẤU HÌNH KẾT NỐI MQTT BROKER (local - amqtt/Mosquitto)
//  Broker Python chạy ở: sever.py (amqtt)
//  TCP  : 1883  (ESP8266, Python client)
//  WS   : 9001  (Trình duyệt / Dashboard này)
// ============================================================

const MQTT_CONFIG = {
  // Địa chỉ broker (localhost vì chạy cùng máy)
  HOST: "172.20.10.2",

  // Port WebSocket của broker (trình duyệt không dùng TCP được)
  PORT: 9001,

  // Giao thức kết nối (ws = không mã hoá, wss = mã hoá)
  PROTOCOL: "ws",

  // Client ID duy nhất cho dashboard
  CLIENT_ID: "aquamonitor-dashboard-" + Math.random().toString(16).substr(2, 8),

  // Topic nhận dữ liệu cảm biến từ ESP8266
  // ESP8266 publish lên topic này theo định dạng JSON:
  // { "water_level": 65.5, "pump_in": false, "pump_out": true }
  TOPIC_SENSOR: "water_station/data",

  // Topic trạng thái bơm (tùy chọn)
  TOPIC_PUMP_STATUS: "water/pump/status",

  // Topic gửi lệnh điều khiển bơm (tùy chọn)
  TOPIC_PUMP_CMD: "water/pump/cmd",

};

// ============================================================
//  CẤU HÌNH HIỂN THỊ
// ============================================================
const DISPLAY_CONFIG = {
  // Ngưỡng cảnh báo mực nước (%)
  LEVEL_CRITICAL_HIGH: 90,   // Gần tràn → ĐỎ
  LEVEL_WARNING_HIGH: 75,    // Cao → VÀNG
  LEVEL_WARNING_LOW: 25,     // Thấp → VÀNG
  LEVEL_CRITICAL_LOW: 10,    // Gần cạn → ĐỎ

  // Tên trạm (hiển thị trên dashboard)
  STATION_NAME: "Trạm Quản Lý Nước Thải",
  TANK_NAME: "Bồn Chứa Chính",

  // Dung tích bồn thực tế (lít) - chỉ hiển thị, không ảnh hưởng tính toán
  TANK_CAPACITY_LITERS: 1,
};
