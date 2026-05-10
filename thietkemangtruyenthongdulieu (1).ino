#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ===== LCD =====
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ===== WIFI & MQTT =====
const char* ssid        = "NA123";
const char* password    = "11111111";
const char* mqtt_server = "172.20.10.2";
const int   mqtt_port   = 1883;

// ===== SR04 =====
const int trigPin = D5;
const int echoPin = D6;

// ===== BƠM =====
const int IN1 = D0;
const int IN2 = D7;
const int ENA = D3;

// ===== NÚT =====
const int buttonPin = D4;

// ===== THÔNG SỐ =====
const float CHIEU_CAO_BE = 19.0;
const float DIEN_TICH_DAY = 59.26;

// ===== NGƯỠNG AUTO =====
const float LOW_LEVEL  = 0.1;
const float HIGH_LEVEL = 0.5;

// ===== BIẾN =====
bool pumpState = false;
bool manualOverride = false; // 

bool lastButtonState = HIGH;
bool buttonState = HIGH;

unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

WiFiClient espClient;
PubSubClient client(espClient);

// ===== WIFI =====
void setup_wifi() {
  Serial.print("Đang kết nối WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi OK – IP: " + WiFi.localIP().toString());
}

// ===== BƠM =====
void controlPump(bool state) {
  pumpState = state;

  if (state) {
    digitalWrite(ENA, HIGH);
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
    Serial.println(" Bơm BẬT");
  } else {
    digitalWrite(ENA, LOW);
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
    Serial.println(" Bơm TẮT");
  }
}
//////////////////////////////////////////////////////////////////////////////////////
// ===== MQTT =====
void publishPumpStatus() {
  StaticJsonDocument<64> doc;
  doc["pump"] = pumpState ? "ON" : "OFF";
  doc["mode"] = manualOverride ? "MANUAL" : "AUTO";                        // `{"pump": "OFF", "mode": "MANUAL"}` |

  char buffer[64];
  serializeJson(doc, buffer);
  client.publish("water_station/pump", buffer, true);

  Serial.println(buffer);
}

// ===== MQTT CALLBACK =====
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  if (String(topic) == "water/pump/cmd") {
    StaticJsonDocument<64> doc;
    if (deserializeJson(doc, msg)) return;

    if (doc.containsKey("state")) {
      manualOverride = true; //

      bool newState = doc["state"];
      controlPump(newState);
      publishPumpStatus();
    }
  }
}

// ===== MQTT RECONNECT =====
void reconnect() {
  while (!client.connected()) {
    if (client.connect("ESP8266_Water")) {
      client.subscribe("water/pump/cmd");
    } else {
      delay(5000);
    }
  }
}

// ===== SR04 =====
float getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) return -1;

  return duration * 0.034 / 2.0;
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  controlPump(false);

  pinMode(buttonPin, INPUT_PULLUP);

  // LCD
  lcd.init();
  lcd.backlight();
  lcd.print("He thong bom");
  delay(1000);
  lcd.clear();

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
}

// ===== LOOP =====
void loop() {

  if (!client.connected()) reconnect();
  client.loop();

  // ===== NÚT =====
  bool reading = digitalRead(buttonPin);

  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != buttonState) {
      buttonState = reading;

      if (buttonState == LOW) {
        manualOverride = true; // 

        bool newState = !pumpState;
        controlPump(newState);
        publishPumpStatus();
      }
    }
  }

  lastButtonState = reading;

  // ===== ĐO NƯỚC =====
  static unsigned long lastMsg = 0;

  if (millis() - lastMsg > 1000) {
    lastMsg = millis();

    float distance = getDistance();

    if (distance >= 0 && distance <= CHIEU_CAO_BE) {

      float h = CHIEU_CAO_BE - distance;
      float v = (h * DIEN_TICH_DAY) / 1000.0;

      // ===== AUTO =====
      if (!manualOverride) {
        if (v < LOW_LEVEL && !pumpState) {
          Serial.println("AUTO: Bật bơm");
          controlPump(true);
          publishPumpStatus();
        }

        if (v > HIGH_LEVEL && pumpState) {
          Serial.println("AUTO: Tắt bơm");
          controlPump(false);
          publishPumpStatus();
        }
      }

      //  RESET override khi đạt ngưỡng
      if (v < LOW_LEVEL || v > HIGH_LEVEL) {
        manualOverride = false;
      }

      // ===== LCD =====
      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("Nuoc:");
      lcd.print(v, 2);
      lcd.print("L");

      lcd.setCursor(0, 1);
      lcd.print("Bom:");
      lcd.print(pumpState ? "ON " : "OFF");
//////////////////////////////////////////////////////////////////////////////
      // ===== MQTT =====
      StaticJsonDocument<128> doc;                                       
      doc["water"] = v;                                                       

 doc["pump"]  = pumpState ? "ON" : "OFF";                            //`{"water": 0.35, "pump": "ON", "mode": "AUTO"}` |
      doc["mode"]  = manualOverride ? "MANUAL" : "AUTO";

      char buffer[128];
      serializeJson(doc, buffer);

      client.publish("water_station/data", buffer);
///////////////////////////////////////////////////////////////////////////
      Serial.println(buffer);
    }
  }
}