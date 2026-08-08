import { Text } from 'react-native';
import { Tabs } from 'expo-router';

import { colors } from '../../src/theme';

/** Emoji tab icons keep the app icon-library-free and identical on every platform. */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Collection',
          tabBarIcon: ({ color }) => <TabIcon glyph="🗂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <TabIcon glyph="📷" color={color} />,
        }}
      />
      <Tabs.Screen
        name="movers"
        options={{
          title: 'Movers',
          tabBarIcon: ({ color }) => <TabIcon glyph="📈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <TabIcon glyph="🔔" color={color} />,
        }}
      />
    </Tabs>
  );
}
