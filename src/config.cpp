/**
 * @file config.cpp
 * @brief Configuration persistence using LittleFS
 */

#include "config.h"
#include <LittleFS.h>

#define CONFIG_FILE "/config.json"

// Global config instance
Config config;

bool initConfig() {
    if (!LittleFS.begin(true)) {
        Serial.println("[CONFIG] Failed to mount LittleFS");
        return false;
    }
    
    Serial.println("[CONFIG] LittleFS mounted");
    
    // Load or create default config
    if (!loadConfig()) {
        Serial.println("[CONFIG] Creating default configuration");
        config.initDefaults();
        saveConfig();
    }
    
    return true;
}

bool loadConfig() {
    if (!LittleFS.exists(CONFIG_FILE)) {
        return false;
    }
    
    File file = LittleFS.open(CONFIG_FILE, "r");
    if (!file) {
        Serial.println("[CONFIG] Failed to open config file");
        return false;
    }
    
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();
    
    if (error) {
        Serial.println("[CONFIG] Failed to parse config JSON");
        return false;
    }
    
    // Device
    if (doc["deviceName"]) strlcpy(config.deviceName, doc["deviceName"], sizeof(config.deviceName));
    
    // AP Mode
    if (doc["apSsid"]) strlcpy(config.apSsid, doc["apSsid"], sizeof(config.apSsid));
    if (doc["apPassword"]) strlcpy(config.apPassword, doc["apPassword"], sizeof(config.apPassword));
    if (doc["apChannel"]) config.apChannel = doc["apChannel"];
    
    // STA Mode
    if (doc["staEnabled"]) config.staEnabled = doc["staEnabled"];
    if (doc["staSsid"]) strlcpy(config.staSsid, doc["staSsid"], sizeof(config.staSsid));
    if (doc["staPassword"]) strlcpy(config.staPassword, doc["staPassword"], sizeof(config.staPassword));
    
    // Network
    if (doc["useStaticIp"]) config.useStaticIp = doc["useStaticIp"];
    if (doc["staticIp"]) strlcpy(config.staticIp, doc["staticIp"], sizeof(config.staticIp));
    if (doc["gateway"]) strlcpy(config.gateway, doc["gateway"], sizeof(config.gateway));
    if (doc["subnet"]) strlcpy(config.subnet, doc["subnet"], sizeof(config.subnet));
    if (doc["dns1"]) strlcpy(config.dns1, doc["dns1"], sizeof(config.dns1));
    if (doc["dns2"]) strlcpy(config.dns2, doc["dns2"], sizeof(config.dns2));
    
    // WiFi Mode
    if (doc["wifiMode"]) config.wifiMode = doc["wifiMode"];
    
    // Serial
    if (doc["baudRate"]) config.baudRate = doc["baudRate"];
    if (doc["dataBits"]) config.dataBits = doc["dataBits"];
    if (doc["stopBits"]) config.stopBits = doc["stopBits"];
    if (doc["parity"]) config.parity = doc["parity"].as<const char*>()[0];
    
    // Auth
    if (doc["authEnabled"]) config.authEnabled = doc["authEnabled"];
    if (doc["webUsername"]) strlcpy(config.webUsername, doc["webUsername"], sizeof(config.webUsername));
    if (doc["webPassword"]) strlcpy(config.webPassword, doc["webPassword"], sizeof(config.webPassword));
    
    Serial.println("[CONFIG] Configuration loaded");
    return true;
}

bool saveConfig() {
    JsonDocument doc;
    
    // Device
    doc["deviceName"] = config.deviceName;
    
    // AP Mode
    doc["apSsid"] = config.apSsid;
    doc["apPassword"] = config.apPassword;
    doc["apChannel"] = config.apChannel;
    
    // STA Mode
    doc["staEnabled"] = config.staEnabled;
    doc["staSsid"] = config.staSsid;
    doc["staPassword"] = config.staPassword;
    
    // Network
    doc["useStaticIp"] = config.useStaticIp;
    doc["staticIp"] = config.staticIp;
    doc["gateway"] = config.gateway;
    doc["subnet"] = config.subnet;
    doc["dns1"] = config.dns1;
    doc["dns2"] = config.dns2;
    
    // WiFi Mode
    doc["wifiMode"] = config.wifiMode;
    
    // Serial
    doc["baudRate"] = config.baudRate;
    doc["dataBits"] = config.dataBits;
    doc["stopBits"] = config.stopBits;
    doc["parity"] = String(config.parity);
    
    // Auth
    doc["authEnabled"] = config.authEnabled;
    doc["webUsername"] = config.webUsername;
    doc["webPassword"] = config.webPassword;
    
    File file = LittleFS.open(CONFIG_FILE, "w");
    if (!file) {
        Serial.println("[CONFIG] Failed to create config file");
        return false;
    }
    
    if (serializeJson(doc, file) == 0) {
        file.close();
        Serial.println("[CONFIG] Failed to write config");
        return false;
    }
    
    file.close();
    Serial.println("[CONFIG] Configuration saved");
    return true;
}

void resetConfig() {
    config.reset();
    config.initDefaults();
    saveConfig();
    Serial.println("[CONFIG] Configuration reset to defaults");
}