// Extends app.json with the monetization plugins. The AdMob app id comes from
// monetization.json (written per game by the factory from its Play slot).
const monetization = require("./monetization.json");

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: monetization.admob.appId,
        // Consent (UMP) is gathered before the SDK starts serving.
        delayAppMeasurementInit: true,
      },
    ],
    // Pin Google Play Billing (no store flavors to pick at build time).
    ["expo-iap", { android: { store: "play" } }],
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
          // Release builds are minified (R8). Room/WorkManager (pulled in by the
          // AdMob SDK) load generated *_Impl classes by reflection — without
          // these rules the app crashes on launch.
          extraProguardRules: [
            "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
            "-keep class androidx.work.impl.** { *; }",
            "-keep class androidx.startup.** { *; }",
            "-dontwarn androidx.work.**",
          ].join("\n"),
        },
      },
    ],
  ],
});
