import { Text, View, StyleSheet } from "react-native";

/** Optional pairing / control layer — not used for video transport. */
export default function BluetoothPlaceholder() {
  return (
    <View style={styles.box}>
      <Text style={styles.t}>Bluetooth placeholder</Text>
      <Text style={styles.p}>
        Video uses the device camera or a network stream. Bluetooth could later signal “start/stop session” on a paired
        accessory — not implemented in this hackathon build.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 20 },
  t: { color: "#f8fafc", fontSize: 18, fontWeight: "600", marginBottom: 12 },
  p: { color: "#94a3b8", lineHeight: 22 },
});
