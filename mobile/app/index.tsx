import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createDrivingDetector, type DrivingDetectorState } from "../src/drivingDetector";
import { API_BASE } from "../src/config";
import { fetchNearbyStops, type NearbyStop } from "../src/nearbyStops";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type StatusChip = "Idle" | "Monitoring" | "Session Paused";

interface TimelineEvent {
  t: string;
  msg: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [drive, setDrive] = useState<DrivingDetectorState | null>(null);
  const [simulateDriving, setSimulateDriving] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [risk, setRisk] = useState(0);
  const [yawns, setYawns] = useState(0);
  const [pec, setPec] = useState(0);
  const [drowsyAccumSec, setDrowsyAccumSec] = useState(0);
  const [monitorSec, setMonitorSec] = useState(0);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [nearby, setNearby] = useState<NearbyStop[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);

  const detRef = useRef(createDrivingDetector());
  const lastAlertRef = useRef(0);
  const maxRiskRef = useRef(0);

  const statusChip: StatusChip = !sessionActive
    ? "Idle"
    : simulateDriving || drive?.phase === "driving"
      ? "Monitoring"
      : "Session Paused";

  const pushEvent = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setTimeline((prev) => [{ t, msg }, ...prev].slice(0, 12));
  }, []);

  useEffect(() => {
    void Notifications.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    const cleanup = detRef.current.start((s) => setDrive({ ...s }));
    return cleanup;
  }, []);

  const prevPhase = useRef<string>("idle");
  useEffect(() => {
    const d = drive;
    if (!d) return;
    if (d.phase === "driving" && !sessionActive && !simulateDriving) {
      setSessionActive(true);
      setSessionStart(Date.now());
      pushEvent("Driving session started (motion heuristic)");
      void fetch(`${API_BASE}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then((r) => r.json())
        .then((j) => {
          if (j.id) setBackendSessionId(j.id);
        })
        .catch(() => {});
    }
    if (
      prevPhase.current === "driving" &&
      d.phase === "idle" &&
      sessionActive &&
      !simulateDriving
    ) {
      pushEvent("Movement stopped — end session manually or wait");
    }
    prevPhase.current = d.phase;
  }, [drive, simulateDriving, sessionActive, pushEvent]);

  useEffect(() => {
    if (!sessionActive) return;
    const id = setInterval(() => setMonitorSec((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    const notifyAlert = async (drowsy: number) => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Signs of drowsiness",
          body:
            drowsy > 0.75
              ? "Eyes may have been closed too long — consider a safe stop."
              : "Frequent yawning or fatigue signs — please pull over safely when you can.",
          sound: true,
        },
        trigger: null,
      });
      Speech.speak(
        "You seem very drowsy. Please pull over safely and take a break when it is safe to do so.",
        { rate: 1.0 }
      );
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {
        /* optional */
      }
    };

    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/infer/mock`, { method: "POST" });
        const j = await r.json();
        const base = j.drowsiness_score ?? 0.2;
        const jitter = simulateDriving ? Math.random() * 0.5 : 0;
        const drowsy = Math.min(1, base + jitter);
        setRisk((prev) => {
          const next = Math.min(1, prev * 0.95 + drowsy * 0.08);
          maxRiskRef.current = Math.max(maxRiskRef.current, next);
          const now = Date.now();
          if (next > 0.55 && now - lastAlertRef.current > 15000) {
            lastAlertRef.current = now;
            void notifyAlert(drowsy);
          }
          if (next > 0.72) void fetchNearbyStops(40.4237, -86.9212).then(setNearby);
          return next;
        });
        if (drowsy > 0.55) setDrowsyAccumSec((s) => s + 2);
        if (drowsy > 0.7 && Math.random() > 0.7) {
          setYawns((y) => y + 1);
          pushEvent("Signs of yawning detected");
        }
        if (drowsy > 0.85) {
          setPec((p) => p + 1);
          pushEvent("Possible prolonged eye closure — take a break if safe");
        }
      } catch {
        setRisk((prev) => {
          const next = Math.min(1, prev * 0.92 + Math.random() * 0.12);
          maxRiskRef.current = Math.max(maxRiskRef.current, next);
          return next;
        });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [sessionActive, simulateDriving, pushEvent]);

  function endSession() {
    if (!sessionActive) return;
    const sid = backendSessionId;
    setSessionActive(false);
    setSimulateDriving(false);
    const totalMin = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : 0;
    const monMin = Math.round(monitorSec / 60);
    const drowsyPct = monitorSec > 0 ? Math.min(100, Math.round((drowsyAccumSec / monitorSec) * 100)) : 0;
    pushEvent("Session ended");
    if (sid) {
      void fetch(`${API_BASE}/sessions/${sid}/end`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalDriveDurationSec: totalMin * 60,
          monitoringDurationSec: monitorSec,
          yawnCount: yawns,
          prolongedEyeClosureCount: pec,
          blinkCount: yawns + pec,
          drowsyPercent: drowsyPct,
          maxRiskScore: maxRiskRef.current,
        }),
      }).catch(() => {});
    }
    setBackendSessionId(null);
    Notifications.scheduleNotificationAsync({
      content: {
        title: "Drive session summary ready",
        body: `Tap to view approximate duration and fatigue-related events.`,
      },
      trigger: null,
    });
    router.push({
      pathname: "/session-report",
      params: {
        duration: String(totalMin),
        monitor: String(monMin),
        yawns: String(yawns),
        pec: String(pec),
        drowsyPct: String(drowsyPct),
        maxRisk: maxRiskRef.current.toFixed(2),
      },
    });
    setMonitorSec(0);
    setSessionStart(null);
    setYawns(0);
    setPec(0);
    setDrowsyAccumSec(0);
    setRisk(0);
    maxRiskRef.current = 0;
  }

  useEffect(() => {
    (async () => {
      try {
        const auth = await fetch(`${API_BASE}/auth/demo`);
        const j = await auth.json();
        if (j.user?.id) {
          const ins = await fetch(`${API_BASE}/users/${j.user.id}/insights`);
          const data = await ins.json();
          setInsights(data.message ?? "Need more sessions");
        }
      } catch {
        setInsights("Need more sessions");
      }
    })();
  }, []);

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Camera access is needed for live monitoring while driving.</Text>
        <Pressable style={styles.btn} onPress={() => requestPermission()}>
          <Text style={styles.btnText}>Grant camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.disclaimer}>
        Heimdall estimates signs of fatigue from camera and motion — not a medical or legal assessment. Possible
        impairment risk is experimental and unreliable.
      </Text>

      <View style={styles.camWrap}>
        <CameraView style={styles.camera} facing="front" />
      </View>

      <View style={styles.row}>
        <Chip label={statusChip} />
        <Text style={styles.risk}>Risk: {(risk * 100).toFixed(0)}%</Text>
      </View>

      <Text style={styles.sub}>Blink / yawn / drowsiness signals update every ~2s (demo backend).</Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, sessionActive && styles.btnDim]}
          onPress={() => {
            setSimulateDriving(true);
            setSessionActive(true);
            setSessionStart(Date.now());
            pushEvent("Simulated driving — monitoring active");
            void fetch(`${API_BASE}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
              .then((r) => r.json())
              .then((j) => {
                if (j.id) setBackendSessionId(j.id);
              })
              .catch(() => {});
          }}
        >
          <Text style={styles.btnText}>Simulate driving session</Text>
        </Pressable>
        <Pressable style={styles.btnSecondary} onPress={endSession} disabled={!sessionActive}>
          <Text style={styles.btnSecondaryText}>End session</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.push("/bluetooth")}>
          <Text style={styles.linkText}>Bluetooth (optional)</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Recent events</Text>
      {timeline.map((e, i) => (
        <Text key={i} style={styles.ev}>
          {e.t} — {e.msg}
        </Text>
      ))}

      {nearby.length > 0 && risk > 0.65 && (
        <View style={styles.nearby}>
          <Text style={styles.section}>Nearby stops (mock / optional API)</Text>
          {nearby.map((n) => (
            <Text key={n.name} style={styles.ev}>
              {n.name} · ~{Math.round(n.distanceM)} m ({n.type})
            </Text>
          ))}
          <Pressable onPress={() => Linking.openURL("https://www.openstreetmap.org")}>
            <Text style={styles.linkText}>Open map (OSM)</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.section}>Longitudinal</Text>
      <Text style={styles.ev}>{insights ?? "…"}</Text>
    </ScrollView>
  );
}

function Chip({ label }: { label: string }) {
  const color =
    label === "Monitoring" ? "#22c55e" : label === "Session Paused" ? "#eab308" : "#64748b";
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", padding: 24 },
  disclaimer: { color: "#64748b", fontSize: 11, marginBottom: 12, lineHeight: 16 },
  camWrap: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1e293b" },
  camera: { width: "100%", aspectRatio: 3 / 4, backgroundColor: "#000" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  risk: { color: "#f87171", fontSize: 20, fontWeight: "700" },
  sub: { color: "#94a3b8", fontSize: 12, marginTop: 8 },
  actions: { marginTop: 16, gap: 10 },
  btn: { backgroundColor: "#4f46e5", padding: 14, borderRadius: 12, alignItems: "center" },
  btnDim: { opacity: 0.7 },
  btnText: { color: "#fff", fontWeight: "600" },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#475569",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnSecondaryText: { color: "#e2e8f0" },
  link: { paddingVertical: 8 },
  linkText: { color: "#818cf8", fontSize: 14 },
  section: { marginTop: 20, fontWeight: "600", color: "#e2e8f0" },
  ev: { color: "#94a3b8", fontSize: 13, marginTop: 6 },
  nearby: { marginTop: 8 },
  body: { color: "#e2e8f0", marginBottom: 16 },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontWeight: "600", fontSize: 13 },
});
