/**
 * @file main.cpp
 * @brief Minimal ESP32 USB-C Serial Console Server
 * 
 * Start with basics:
 * 1. WiFi AP mode
 * 2. USB-C serial (ESP32-S2/S3)
 * 3. Simple WebSocket bridge
 * 4. Basic web page
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>

// ============================================================================
// Configuration
// ============================================================================

// WiFi AP Settings
const char* AP_SSID_PREFIX = "SerialConsole";
const char* AP_PASSWORD = "serial123";
const IPAddress AP_IP(192, 168, 4, 1);

// Web Server
WebServer server(80);
WebSocketsServer webSocket(81);

// Serial Configuration
#define SERIAL_BAUD 9600

// LED for status
#define LED_PIN 2
#define LED_ON HIGH
#define LED_OFF LOW

// State
bool serialConnected = false;
uint32_t bytesReceived = 0;
uint32_t bytesSent = 0;

// ============================================================================
// HTML Page (embedded in code for simplicity)
// ============================================================================

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serial Console</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #3498db; margin-bottom: 20px; }
        .status { background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .status span { margin-right: 20px; }
        .connected { color: #27ae60; }
        .disconnected { color: #e74c3c; }
        .controls { margin-bottom: 15px; }
        select, button { padding: 8px 16px; margin-right: 10px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; }
        button { cursor: pointer; background: #3498db; }
        button:hover { background: #2980b9; }
        button.danger { background: #e74c3c; }
        button.danger:hover { background: #c0392b; }
        #terminal { background: #000; padding: 15px; height: 400px; overflow-y: auto; border-radius: 8px; margin-bottom: 15px; }
        #terminal pre { white-space: pre-wrap; word-wrap: break-word; }
        .input-row { display: flex; gap: 10px; }
        #input { flex: 1; padding: 10px; border-radius: 4px; border: 1px solid #555; background: #2d2d2d; color: #fff; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔌 Serial Console</h1>
        
        <div class="status">
            <span>Serial: <span id="serialStatus" class="disconnected">Disconnected</span></span>
            <span>WebSocket: <span id="wsStatus" class="disconnected">Disconnected</span></span>
            <span>TX: <span id="txBytes">0</span></span>
            <span>RX: <span id="rxBytes">0</span></span>
        </div>
        
        <div class="controls">
            <label>Baud: 
                <select id="baudRate">
                    <option value="9600" selected>9600</option>
                    <option value="19200">19200</option>
                    <option value="38400">38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                </select>
            </label>
            <button onclick="connectWebSocket()">Connect</button>
            <button onclick="disconnectWebSocket()">Disconnect</button>
            <button onclick="clearTerminal()">Clear</button>
        </div>
        
        <div id="terminal">
            <pre id="output"></pre>
        </div>
        
        <div class="input-row">
            <input type="text" id="input" placeholder="Type command and press Enter..." disabled>
            <button onclick="sendData()" id="sendBtn" disabled>Send</button>
        </div>
    </div>
    
    <script>
        let ws = null;
        let connected = false;
        
        function init() {
            updateStatus();
            setInterval(updateStatus, 5000);
        }
        
        function connectWebSocket() {
            if (ws) ws.close();
            
            const wsUrl = 'ws://' + window.location.hostname + ':81/';
            appendOutput('[Connecting to ' + wsUrl + ']\\n');
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                connected = true;
                document.getElementById('wsStatus').textContent = 'Connected';
                document.getElementById('wsStatus').className = 'connected';
                document.getElementById('input').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                appendOutput('[WebSocket connected]\\n');
            };
            
            ws.onmessage = function(event) {
                // Handle binary data
                if (event.data instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = function() {
                        appendOutput(reader.result);
                    };
                    reader.readAsText(event.data);
                } else {
                    appendOutput(event.data);
                }
            };
            
            ws.onclose = function() {
                connected = false;
                document.getElementById('wsStatus').textContent = 'Disconnected';
                document.getElementById('wsStatus').className = 'disconnected';
                document.getElementById('input').disabled = true;
                document.getElementById('sendBtn').disabled = true;
                appendOutput('[WebSocket disconnected]\\n');
            };
            
            ws.onerror = function(err) {
                appendOutput('[WebSocket error]\\n');
            };
        }
        
        function disconnectWebSocket() {
            if (ws) {
                ws.close();
                ws = null;
            }
        }
        
        function sendData() {
            const input = document.getElementById('input');
            const data = input.value;
            if (ws && connected && data) {
                ws.send(data + '\\n');
                input.value = '';
            }
        }
        
        document.getElementById('input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendData();
            }
        });
        
        function appendOutput(text) {
            const output = document.getElementById('output');
            output.textContent += text;
            const terminal = document.getElementById('terminal');
            terminal.scrollTop = terminal.scrollHeight;
        }
        
        function clearTerminal() {
            document.getElementById('output').textContent = '';
        }
        
        function updateStatus() {
            fetch('/api/status')
                .then(r => r.json())
                .then(data => {
                    const statusEl = document.getElementById('serialStatus');
                    statusEl.textContent = data.serial ? 'Connected' : 'Disconnected';
                    statusEl.className = data.serial ? 'connected' : 'disconnected';
                    document.getElementById('txBytes').textContent = data.tx;
                    document.getElementById('rxBytes').textContent = data.rx;
                })
                .catch(e => console.error('Status error:', e));
        }
        
        // Auto-connect on page load
        window.onload = function() {
            init();
            setTimeout(connectWebSocket, 500);
        };
    </script>
</body>
</html>
)rawliteral";

// ============================================================================
// Web Server Handlers
// ============================================================================

void handleRoot() {
    server.send(200, "text/html", INDEX_HTML);
}

void handleStatus() {
    String json = "{";
    json += "\"serial\":" + String(SerialUSB ? "true" : "false") + ",";
    json += "\"tx\":" + String(bytesSent) + ",";
    json += "\"rx\":" + String(bytesReceived);
    json += "}";
    server.send(200, "application/json", json);
}

void handleBaud() {
    if (server.hasArg("rate")) {
        long rate = server.arg("rate").toInt();
        SerialUSB.updateBaudRate(rate);
        server.send(200, "application/json", "{\"success\":true}");
    } else {
        server.send(400, "application/json", "{\"error\":\"missing rate\"}");
    }
}

// ============================================================================
// WebSocket Handler
// ============================================================================

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[WS] Client %u disconnected\n", num);
            break;
            
        case WStype_CONNECTED:
            Serial.printf("[WS] Client %u connected\n", num);
            break;
            
        case WStype_TEXT:
        case WStype_BIN:
            // Data from browser -> send to USB serial
            if (SerialUSB) {
                size_t written = SerialUSB.write(payload, length);
                SerialUSB.flush();
                bytesSent += written;
            }
            break;
    }
}

// ============================================================================
// Serial -> WebSocket Bridge
// ============================================================================

void handleSerialBridge() {
    if (!SerialUSB) return;
    
    // Check for incoming serial data
    int available = SerialUSB.available();
    if (available > 0) {
        // Read in chunks
        uint8_t buffer[512];
        int toRead = (available > 512) ? 512 : available;
        int bytesRead = SerialUSB.readBytes((char*)buffer, toRead);
        
        if (bytesRead > 0) {
            bytesReceived += bytesRead;
            // Broadcast to all WebSocket clients
            webSocket.broadcastBIN(buffer, bytesRead);
        }
    }
}

// ============================================================================
// Setup & Loop
// ============================================================================

void setup() {
    // Initialize debug serial
    Serial.begin(115200);
    Serial.println();
    Serial.println("====================================");
    Serial.println("ESP32 Serial Console Server");
    Serial.println("====================================");
    
    // Initialize LED
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LED_OFF);
    
    // Initialize USB CDC Serial (for console device)
    SerialUSB.begin(SERIAL_BAUD);
    Serial.println("USB CDC Serial initialized");
    
    // Initialize WiFi AP
    Serial.println("Starting WiFi AP...");
    
    // Configure AP
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
    
    // Create unique SSID
    String ssid = String(AP_SSID_PREFIX) + "-" + String((uint32_t)(ESP.getEfuseMac() >> 24), HEX);
    bool apStarted = WiFi.softAP(ssid.c_str(), AP_PASSWORD, 1, false, 4);
    
    if (!apStarted) {
        Serial.println("Failed to start AP!");
        while(1) {
            digitalWrite(LED_PIN, LED_ON);
            delay(100);
            digitalWrite(LED_PIN, LED_OFF);
            delay(100);
        }
    }
    
    Serial.println("AP Started:");
    Serial.printf("  SSID: %s\n", ssid.c_str());
    Serial.printf("  Password: %s\n", AP_PASSWORD);
    Serial.printf("  IP: %s\n", WiFi.softAPIP().toString().c_str());
    
    // Start web server
    server.on("/", handleRoot);
    server.on("/api/status", handleStatus);
    server.on("/api/baud", handleBaud);
    server.begin();
    Serial.println("HTTP server started on port 80");
    
    // Start WebSocket server
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started on port 81");
    
    // Ready
    Serial.println();
    Serial.println("Ready! Connect to WiFi and open http://" + WiFi.softAPIP().toString());
    Serial.println("====================================");
    
    // Blink LED to indicate ready
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, LED_ON);
        delay(100);
        digitalWrite(LED_PIN, LED_OFF);
        delay(100);
    }
}

void loop() {
    // Handle web server
    server.handleClient();
    
    // Handle WebSocket
    webSocket.loop();
    
    // Handle serial bridge
    handleSerialBridge();
    
    // Status LED - slow blink when running
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink > 1000) {
        lastBlink = millis();
        digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
    
    // Small yield for stability
    yield();
}