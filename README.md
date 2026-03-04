# ESP32 USB-C Serial Console Server - Minimal Version

A minimal, working serial console server for ESP32-S2/S3 with native USB-C support.

## What This Version Does

```
┌─────────────────┐         USB-C          ┌─────────────────┐
│   Aruba CX      │◄──────────────────────►│     ESP32       │
│   Switch        │        Serial           │    S2/S3        │
└─────────────────┘                         └────────┬────────┘
                                                      │
                                                      │ WiFi
                                                      ▼
                                            ┌─────────────────┐
                                            │  Web Browser    │
                                            │  (Cellphone/PC) │
                                            └─────────────────┘
```

1. **Creates WiFi hotspot** - Device broadcasts `SerialConsole-XXXXXX`
2. **Serves web page** - Connect and access serial console from browser
3. **USB-C serial bridge** - Bidirectional data between equipment and browser

## Quick Start

### 1. Install PlatformIO

```bash
pip install platformio
```

### 2. Build and Upload (ESP32-S2)

```bash
# Build
pio run -e esp32-s2

# Upload (connect ESP32-S2 via USB)
pio run -e esp32-s2 -t upload

# Monitor serial output
pio device monitor
```

### 3. Connect

1. Power on ESP32-S2
2. On phone/laptop, connect to WiFi:
   - **SSID**: `SerialConsole-XXXXXX` (last 6 of MAC address)
   - **Password**: `serial123`
3. Open browser: `http://192.168.4.1`
4. Click **Connect**
5. Wire USB-C from ESP32-S2 to your Aruba CX console port

## Hardware Requirements

### ESP32-S2 (Recommended)
- Native USB-C support
- Works as USB device (connects to switch console)
- No extra hardware needed

### ESP32-S3 (Alternative)
- Same as S2, more GPIO pins available

### ESP32 (Original)
- **NOT recommended** - no native USB-C
- Would need external USB-to-Serial chip

## Wiring

### USB-C to Serial Console Port

```
USB-C Cable         Aruba CX Console Port
─────────          ┌──────────────────────┐
  D+    ──────────►│ D+ (Pin 2)            │
  D-    ──────────►│ D- (Pin 3)            │
  GND   ──────────►│ GND (Pin 1)           │
─────────          └──────────────────────┘
```

The ESP32-S2/S3 appears as a USB-CDC device to the switch, just like a standard USB-Serial adapter.

## Status LED

- **3 quick blinks** = Startup complete
- **Slow blink** = Running normally
- **Fast blink** = Error (check serial monitor)

## Troubleshooting

### Can't find WiFi network

```bash
# Check serial monitor for:
AP Started:
  SSID: SerialConsole-XXXXXX
  IP: 192.168.4.1
```

- Ensure 2.4GHz (not 5GHz)
- Allow 20-30 seconds for AP to start

### Web page doesn't load

- Verify IP: `192.168.4.1`
- Clear browser cache
- Check you're connected to the ESP32's WiFi

### WebSocket disconnects immediately

- Browser may block WebSocket
- Try different browser
- Check console for errors (F12)

### No serial data

1. **Check baud rate**: Default is 9600 (Aruba CX default)
2. **Check USB-C cable**: Must be data cable
3. **Check connection**: USB-C to console port
4. **Verify USB-CDC mode**: Serial monitor shows "Connected"

### Upload fails

**ESP32-S2/S3 needs manual boot mode:**
1. Hold **BOOT** button
2. Press and release **RESET** button
3. Release **BOOT** button
4. Upload starts

## Testing Without Switch

### Loopback Test

Connect USB-C to your COMPUTER (not switch):
1. Open Arduino IDE Serial Monitor on that port
2. Type characters
3. Characters should echo back

### Terminal Test

On computer, connect to ESP32's USB-CDC port:
```bash
# Linux
screen /dev/ttyACM0 9600

# macOS
screen /dev/cu.usbmodem* 9600
```

Type characters → seen in web console

## Serial Monitor Commands

The firmware outputs debug info:
```
====================================
ESP32 Serial Console Server
====================================
USB CDC Serial initialized
Starting WiFi AP...
AP Started:
  SSID: SerialConsole-A1B2C3
  Password: serial123
  IP: 192.168.4.1
HTTP server started on port 80
WebSocket server started on port 81
Ready!
====================================
[WS] Client 0 connected
```

## Expanding This Code

This minimal version is a foundation. To add features:

1. **Add configuration storage** → See original config.h/storage.cpp
2. **Add STA mode** → See original wifi_manager.cpp
3. **Add authentication** → See original web_server.cpp
4. **Add static IP** → Extend WiFi configuration

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web interface |
| `/api/status` | GET | JSON status |
| `/api/baud?rate=115200` | POST | Change baud rate |

## WebSocket

- **Port**: 81
- **URL**: `ws://192.168.4.1:81/`
- **Binary data**: Bidirectional

## Known Limitations

1. No authentication (anyone on WiFi can connect)
2. No configuration persistence (settings reset on reboot)
3. AP mode only (doesn't connect to existing WiFi)
4. Fixed 4 max WebSocket clients

## Version History

- **v1.0** - Minimal working version (this)
- **Future** - Add full features from original architecture

---

## License

MIT License