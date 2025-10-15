import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },   // hide default bar
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      {/* Remove or set href: null for any screens you don't want like "explore" */}
      {/* <Tabs.Screen name="explore" options={{ href: null }} /> */}
    </Tabs>
  );
}