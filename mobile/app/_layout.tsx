import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0b1020" },
          headerTintColor: "#e2e8f0",
          contentStyle: { backgroundColor: "#0b1020" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Heimdall" }} />
        <Stack.Screen name="session-report" options={{ title: "Session report" }} />
        <Stack.Screen name="bluetooth" options={{ title: "Bluetooth (optional)" }} />
      </Stack>
    </>
  );
}
