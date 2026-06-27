/**
 * App.tsx — Rafiq main entry point
 *
 * App with simple bottom tab navigation.
 */

import React, { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity, Text } from "react-native";

import IndoorScreen from "./screens/IndoorScreen";
import DetectScreen from "./screens/DetectScreen";
import OCRScreen from "./screens/OCRScreen";
import VoiceScreen from "./screens/VoiceScreen";

export default function App() {
  const [activeTab, setActiveTab] = useState("Indoor");

  const renderScreen = () => {
    switch (activeTab) {
      case "Indoor": return <IndoorScreen />;
      case "Detect": return <DetectScreen />;
      case "OCR": return <OCRScreen />;
      case "Voice": return <VoiceScreen />;
      default: return <IndoorScreen />;
    }
  };

  const tabs = ["Indoor", "Detect", "OCR", "Voice"];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity 
            key={tab} 
            style={styles.tabButton}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#f8f8f8",
    paddingBottom: 5,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  tabText: {
    fontSize: 12,
    color: "#888",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "bold",
  },
});
