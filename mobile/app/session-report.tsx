import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";

export default function SessionReportScreen() {
  const params = useLocalSearchParams<{
    duration?: string;
    monitor?: string;
    yawns?: string;
    pec?: string;
    drowsyPct?: string;
    maxRisk?: string;
  }>();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Drive summary</Text>
      <Text style={styles.disclaimer}>
        Experimental fatigue estimates — not a medical device. Always pull over safely if you feel unwell.
      </Text>
      <Row label="Total drive (approx.)" value={`${params.duration ?? "—"} min`} />
      <Row label="Monitoring time" value={`${params.monitor ?? "—"} min`} />
      <Row label="Yawns detected" value={params.yawns ?? "—"} />
      <Row label="Prolonged eye closures" value={params.pec ?? "—"} />
      <Row label="Time flagged drowsy" value={`${params.drowsyPct ?? "—"}%`} />
      <Row label="Max risk score" value={params.maxRisk ?? "—"} />
      <Text style={styles.rec}>
        Recommendations: take breaks every 2 hours; if you noticed repeated yawning, consider stopping before the next exit.
      </Text>
      <Pressable style={styles.btn} onPress={() => router.back()}>
        <Text style={styles.btnText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: "700", color: "#f8fafc", marginBottom: 8 },
  disclaimer: { color: "#94a3b8", fontSize: 12, marginBottom: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  label: { color: "#94a3b8" },
  value: { color: "#e2e8f0", fontWeight: "600" },
  rec: { marginTop: 24, color: "#cbd5e1", lineHeight: 22 },
  btn: {
    marginTop: 32,
    backgroundColor: "#4f46e5",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
