import AsyncStorage from "@react-native-async-storage/async-storage";
import telemetry from "../../telemetry.json";

/**
 * Anonymous gameplay analytics. Every event is written to the device log as an
 * `[agf-event]` line (the factory's on-device QA reads these), and — when the
 * factory configured telemetry.json url — batched to the factory's funnel
 * endpoint so level pacing can be rebalanced from real players.
 *
 * Privacy: events carry only gameplay facts (level numbers, moves, SKUs) and a
 * random install id. No names, emails, device ids, ad ids or location.
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

export const analytics = {
  track(event: string, props: Props = {}): void {
    console.log(`[agf-event] ${JSON.stringify({ e: event, ...props })}`);
    if (!telemetry.url) return;
    queue.push({ e: event, p: props, t: Date.now() });
    if (queue.length >= 20) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), 15_000);
  },
};
