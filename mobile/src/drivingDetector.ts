import { Accelerometer } from "expo-sensors";

const MOTION_THRESHOLD = 1.12;
const STOP_SECONDS = 22;
const START_SECONDS = 3.5;

export type DrivePhase = "idle" | "maybe_driving" | "driving";

export interface DrivingDetectorState {
  phase: DrivePhase;
  movingSeconds: number;
  stoppedSeconds: number;
}

/** Simple state machine: sustained motion ⇒ driving; sustained still ⇒ idle. */
export function createDrivingDetector() {
  const state: DrivingDetectorState = {
    phase: "idle",
    movingSeconds: 0,
    stoppedSeconds: 0,
  };
  let lastTs = Date.now();

  function tick(magnitude: number) {
    const now = Date.now();
    const dt = Math.min(2, (now - lastTs) / 1000);
    lastTs = now;

    const moving = magnitude > MOTION_THRESHOLD;
    if (moving) {
      state.movingSeconds += dt;
      state.stoppedSeconds = 0;
    } else {
      state.stoppedSeconds += dt;
      state.movingSeconds = 0;
    }

    if (state.phase !== "driving") {
      if (state.movingSeconds >= START_SECONDS) state.phase = "driving";
      else if (state.movingSeconds > 0.3) state.phase = "maybe_driving";
      else state.phase = "idle";
    } else if (state.stoppedSeconds >= STOP_SECONDS) {
      state.phase = "idle";
      state.movingSeconds = 0;
      state.stoppedSeconds = 0;
    }
  }

  return {
    getState: () => ({ ...state }),
    start: (onUpdate: (s: DrivingDetectorState) => void) => {
      Accelerometer.setUpdateInterval(300);
      const sub = Accelerometer.addListener((a) => {
        const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        tick(mag);
        onUpdate({ ...state });
      });
      return () => sub.remove();
    },
  };
}
