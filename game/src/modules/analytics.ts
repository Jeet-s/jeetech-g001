/**
 * Analytics module stub. The event names map to the GDD's analytics_events and
 * to the learning loop (PRD §23). Swap for your provider in a real build.
 */
export const analytics = {
  track(event: string, props: Record<string, unknown> = {}): void {
    if (__DEV__) console.log("[analytics]", event, props);
  },
};
