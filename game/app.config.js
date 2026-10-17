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
      { android: { minSdkVersion: 24 } },
    ],
  ],
});
