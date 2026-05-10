// config.js
const CONFIG = {
  MQTT: {
    URL: "mqtt://127.0.0.1",
    PORT: 1883,
    TOPIC: "water_station/data"
  },
  DISPLAY: {
    STATION_NAME: "Trạm Quản Lý Nước Thải",
    LEVEL_CRITICAL_HIGH: 90,
    LEVEL_CRITICAL_LOW: 10
  }
};

module.exports = CONFIG; // Xuất cấu hình để file khác dùng được