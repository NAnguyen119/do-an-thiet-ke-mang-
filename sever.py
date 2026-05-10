import asyncio
import os
import logging
from amqtt.broker import Broker
import aioconsole

# Hàm xóa màn hình chuẩn hệ điều hành
def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


config = {
    'listeners': {
        'default': {
            'type': 'tcp',
            'bind': '172.20.10.2:1883',
        }
    },
}


async def interactive_shell(broker):
    while True:
        command = await aioconsole.ainput("Nhập lệnh: ")
        command = command.strip().lower()

        if command == "list":
            active_sessions = broker.sessions
            count = len(active_sessions)
            print(f"\n--- BÁO CÁO THIẾT BỊ ({count} đang kết nối) ---")
            if count > 0:
                for i, client_id in enumerate(active_sessions.keys(), 1):
                    print(f"  {i}. ID: {client_id}")
            else:
                print("  (Chưa có thiết bị nào kết nối)")
            print("------------------------------------------\n")

        elif command == "clear":
            clear_screen()  # Gọi hàm xóa thật sự
            print("✨ Màn hình đã được làm sạch.")
            print("💡 Gõ 'list' để xem danh sách thiết bị.")

        elif command == "exit":
            print("Đang dừng Server...")
            os._exit(0)  # Thoát chương trình lập tức

        elif command == "":
            continue
        else:
            print(f"❓ Lệnh '{command}' không hợp lệ.")


async def start_broker():
    broker = Broker(config)
    try:
        await broker.start()
        print("---------------------------------------")
        print("MQTT Broker đã chạy thành công!")
        print("---------------------------------------")

        asyncio.create_task(interactive_shell(broker))

        while True:
            await asyncio.sleep(1)
    except Exception as e:
        print(f"Lỗi: {e}")


if __name__ == '__main__':
    # Tắt log INFO để màn hình không bị nhảy chữ khi có thiết bị kết nối
    logging.basicConfig(level=logging.WARNING)
    try:
        asyncio.run(start_broker())
    except KeyboardInterrupt:
        pass