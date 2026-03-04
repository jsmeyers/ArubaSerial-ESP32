/**
 * @file config.h
 * @brief Configuration management for ESP32 Serial Console Server
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

// ============================================================================
// Hardware Configuration
// ============================================================================

#define LED_PIN             2
#define LED_ON              HIGH
#define LED_OFF             LOW
#define RESET_BUTTON_PIN    0

// ============================================================================
// Default Settings
// ============================================================================

#define DEFAULT_AP_SSID_PREFIX    "SerialConsole"
#define DEFAULT_AP_PASSWORD       "serial123"
#define DEFAULT_AP_CHANNEL        1
#define DEFAULT_AP_MAX_CLIENTS    4
#define DEFAULT_AP_IP             "192.168.4.1"

#define DEFAULT_WEB_USERNAME     "admin"
#define DEFAULT_WEB_PASSWORD      "admin"
#define DEFAULT_BAUD_RATE         9600

// ============================================================================
// Configuration Structure
// ============================================================================

struct Config {
    // Device
    char deviceName[32];
    
    // WiFi AP Mode
    char apSsid[32];
    char apPassword[64];
    uint8_t apChannel;
    
    // WiFi Station Mode
    bool staEnabled;
    char staSsid[32];
    char staPassword[64];
    
    // Network (for STA mode)
    bool useStaticIp;
    char staticIp[16];
    char gateway[16];
    char subnet[16];
    char dns1[16];
    char dns2[16];
    
    // WiFi Mode: 0=AP only, 1=STA only, 2=AP+STA
    uint8_t wifiMode;
    
    // Serial Port
    uint32_t baudRate;
    uint8_t dataBits;
    uint8_t stopBits;
    char parity;  // N, E, O
    
    // Authentication
    bool authEnabled;
    char webUsername[32];
    char webPassword[64];
    
    // Default constructor
    Config() {
        reset();
    }
    
    void reset() {
        // Device
        strcpy(deviceName, "SerialConsole");
        
        // AP Mode
        strcpy(apSsid, DEFAULT_AP_SSID_PREFIX);
        strcpy(apPassword, DEFAULT_AP_PASSWORD);
        apChannel = DEFAULT_AP_CHANNEL;
        
        // STA Mode
        staEnabled = false;
        memset(staSsid, 0, sizeof(staSsid));
        memset(staPassword, 0, sizeof(staPassword));
        
        // Network
        useStaticIp = false;
        strcpy(staticIp, "192.168.1.100");
        strcpy(gateway, "192.168.1.1");
        strcpy(subnet, "255.255.255.0");
        strcpy(dns1, "8.8.8.8");
        strcpy(dns2, "8.8.4.4");
        
        // WiFi Mode: 0=AP
        wifiMode = 0;
        
        // Serial
        baudRate = DEFAULT_BAUD_RATE;
        dataBits = 8;
        stopBits = 1;
        parity = 'N';
        
        // Auth
        authEnabled = true;
        strcpy(webUsername, DEFAULT_WEB_USERNAME);
        strcpy(webPassword, DEFAULT_WEB_PASSWORD);
    }
    
    void initDefaults() {
        // Generate unique SSID with MAC address
        uint32_t macId = (uint32_t)(ESP.getEfuseMac() >> 24);
        char ssid[32];
        snprintf(ssid, sizeof(ssid), "%s-%06X", DEFAULT_AP_SSID_PREFIX, macId);
        strcpy(apSsid, ssid);
        
        // Generate unique device name
        snprintf(deviceName, sizeof(deviceName), "SerialConsole-%06X", macId);
    }
};

// Configuration instance
extern Config config;

// ============================================================================
// Configuration Functions
// ============================================================================

bool initConfig();
bool loadConfig();
bool saveConfig();
void resetConfig();

#endif // CONFIG_H