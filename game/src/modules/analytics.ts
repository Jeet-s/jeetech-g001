import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Settings } from "react-native";
import telemetry from "../../telemetry.json";

/**
 * Anonymous gameplay analytics. Every event is written to the device log as an
 * `[agf-event]` line (the factory's on-device QA reads these), and — when the
 * factory configured telemetry.json url — batched to the factory's funnel
 * endpoint so level pacing can be rebalanced from real players.
 *
 * Privacy: events carry only gameplay facts (level numbers, moves, SKUs) and a
 * random install id. No names, emails, device ids, ad ids or location.
 *
 * iOS release builds don't log console output, so when the factory launches the app with `-AGFQA 1` the
 * events are also mirrored into the app's own defaults (`agf_events`), which the simulator QA reads.
 */
type Props = Record<string, string | number | boolean>;
interface Ev { e: string; p: Props; t: number }

const ID_KEY = "agf_install_id";
let installId: string | null = null;
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function id(): Promise<string> {
  if (installId) return installId;
  try {
    installId = await AsyncStorage.getItem(ID_KEY);
    if (!installId) {
      installId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      await AsyncStorage.setItem(ID_KEY, installId);
    }
  } catch {
    installId = "anon";
  }
  return installId;
}

/** The anonymous install id (also used to address this install's push notifications). */
export const getInstallId = id;

async function flush(): Promise<void> {
  timer = null;
  const batch = queue;
  queue = [];
  if (!telemetry.url || batch.length === 0) return;
  try {
    await fetch(telemetry.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: telemetry.app, iid: await id(), events: batch }),
    });
  } catch {
    // offline — drop; analytics must never affect play
  }
}

const iosQa = Platform.OS === "ios" && !!(Settings.get?.("AGFQA") as unknown);
const qaLines: string[] = [];
function log(event: string, props: Props): void {
  const line = JSON.stringify({ e: event, ...props });
  console.log(`[agf-event] ${line}`);
  if (!iosQa) return;
  qaLines.push(line);
  if (qaLines.length > 400) qaLines.shift();
  Settings.set({ agf_events: qaLines.join("\n") });
}

export const analytics = {
  /** Device-QA signal only (logged, never sent): e.g. "move" on every player action the game accepted. */
  qa(event: string, props: Props = {}): void {
    log(event, props);
  },
  track(event: string, props: Props = {}): void {
    log(event, props);
    if (!telemetry.url) return;
    queue.push({ e: event, p: props, t: Date.now() });
    if (queue.length >= 20) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), 15_000);
  },
};
