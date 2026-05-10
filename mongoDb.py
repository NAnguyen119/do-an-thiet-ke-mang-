import paho.mqtt.client as mqtt
from pymongo import MongoClient
from datetime import datetime
import json
import time  # Thêm thư viện time để tính toán chu kỳ

# Cấu hình Mongo
mongo_client = MongoClient("mongodb://localhost:27017/")
db = mongo_client["IOT_Database1"]
collection = db["Lich_su_nuoc"]

# Cấu hình MQTT
MQTT_BROKER = "172.20.10.2"
MQTT_PORT = 1883
topic = "water_station/data"

# ==========================================
# CẤU HÌNH LƯU TRỮ (THROTTLING)
# ==========================================
SAVE_INTERVAL = 30  # Chu kỳ lưu dữ liệu (ví dụ: 30 giây lưu 1 lần)
last_save_time = 0  # Biến nhớ thời điểm lưu cuối cùng
last_pump_state = None  # Biến nhớ trạng thái bơm cuối cùng


def on_message(client, userdata, msg):
    global last_save_time, last_pump_state  # Gọi biến toàn cục vào để sử dụng

    try:
        payload = msg.payload.decode()
        data_json = json.loads(payload)

        water_value = float(data_json.get("water", 0))
        pump_state = data_json.get("pump", False)
        pump_text = data_json.get("pump_text", "OFF")

        # Dashboard vẫn cần dòng này để biết Python đang sống và nhận được data
        print(f"📡 Nhận: 💧 {water_value}L | Bơm: {pump_text}")

        current_time = time.time()

        # LOGIC LỌC DỮ LIỆU ĐỂ LƯU:
        # Điều kiện 1: Đã qua đủ thời gian SAVE_INTERVAL (ví dụ 30s)
        # Điều kiện 2: Trạng thái máy bơm thay đổi (phải lưu ngay lập tức để ghi nhận lịch sử)
        if (current_time - last_save_time >= SAVE_INTERVAL) or (pump_state != last_pump_state):

            data_to_store = {
                "value": water_value,
                "pump_status": pump_state,
                "pump_display": pump_text,
                "timestamp": datetime.now()
            }

            collection.insert_one(data_to_store)

            # In ra thông báo lý do tại sao lại lưu bản ghi này
            if pump_state != last_pump_state and last_pump_state != None:
                print("   => 💾 LƯU DB: Do máy bơm thay đổi trạng thái!")
            else:
                print("   => 💾 LƯU DB: Đến chu kỳ lưu định kỳ.")

            # Cập nhật lại các biến nhớ cho chu kỳ tiếp theo
            last_save_time = current_time
            last_pump_state = pump_state

    except json.JSONDecodeError:
        print(f"Lỗi: Định dạng JSON không hợp lệ!")
    except Exception as e:
        print(f"Lỗi xử lý dữ liệu: {e}")


sub_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="Python_Mongo_Subscriber")
sub_client.on_message = on_message
sub_client.connect(MQTT_BROKER, MQTT_PORT, 60)
sub_client.subscribe(topic)

print(f"🚀 Python Subscriber đang chờ JSON... (Chu kỳ lưu DB: {SAVE_INTERVAL} giây/lần)")
sub_client.loop_forever()