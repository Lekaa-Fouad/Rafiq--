/**
 * app/(tabs)/_layout.tsx
 * Tab navigator — 5 tabs: Home, Detect, Faces, Navigate, Settings.
 * Custom dark tab bar with accent-colored active state, large icons,
 * and full accessibility labels on every tab.
 */

import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../src/constants/theme';
import { FontSize, FontWeight } from '../../src/constants/typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IoniconsName;
  color: string;
  size: number;
}

function TabIcon({ name, color, size }: TabIconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: Colors.tabBarBorder,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: {
          fontWeight: FontWeight.bold,
          fontSize: FontSize.lg,
          color: Colors.textPrimary,
        },
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarLabel: 'Home',
          tabBarAccessibilityLabel: 'Home tab. Main dashboard with voice commands and feature overview.',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="detect"
        options={{
          title: 'Detect',
          headerTitle: 'Object Detection',
          tabBarLabel: 'Detect',
          tabBarAccessibilityLabel: 'Detect tab. Live object detection using your camera.',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="eye" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="faces"
        options={{
          title: 'Faces',
          headerTitle: 'Face Recognition',
          tabBarLabel: 'Faces',
          tabBarAccessibilityLabel: 'Faces tab. Register and identify people by face.',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="people" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="navigate"
        options={{
          title: 'Navigate',
          headerTitle: 'Indoor Navigation',
          tabBarLabel: 'Navigate',
          tabBarAccessibilityLabel: 'Navigate tab. Voice-guided indoor navigation using markers.',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="compass" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarLabel: 'Settings',
          tabBarAccessibilityLabel: 'Settings tab. Adjust language, speech rate, and app preferences.',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBarBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.tabBarBorder,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
});
