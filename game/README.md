# React Native base runtime

Template for **UI-centric games** (quiz, word, card, idle, simple drag-drop —
PRD §11.1). The Claude Code builder clones this into a run workspace and
specializes it from the GDD:

- `game.config.json` — title, package, mechanic, screens, monetization
- `src/game/BoardEngine.ts` — rules specialized per mechanic
- `src/screens/*` — screens added/wired per the GDD UI list
- `src/modules/{ads,iap,analytics}` — swap stubs for real SDKs

Build an Android App Bundle (in a provisioned worker with Node + Java +
Android SDK):

```bash
npx expo prebuild --platform android
npm run build:android   # android/ ./gradlew bundleRelease → .aab
```

The placeholder tokens (`Path Painter`, `com.jeetech.g001`, …) are replaced
during the build.
