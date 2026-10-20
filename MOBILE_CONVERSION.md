# Converting Satark into a Native Mobile Application (Android / iOS)

The Satark codebase is architected with a **mobile-first, responsive design** and comes pre-configured with:
- `viewport-fit=cover`, mobile status bar safe-area insets
- Web App Manifest (`public/manifest.json`)
- Touch-optimized interaction targets & hardware frameless mode
- Pre-configured `capacitor.config.json`

---

## Method 1: Build Native Android APK via Capacitor (Recommended)

### Step 1: Install Capacitor CLI & Android Platform
In the project root (`d:\Hackathons\iitdelhi`):
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### Step 2: Build the Web Distribution
```bash
npm run build
```

### Step 3: Add Android Platform & Sync Assets
```bash
npx cap add android
npx cap sync
```

### Step 4: Open in Android Studio & Compile APK
```bash
npx cap open android
```
In Android Studio:
1. Click **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
2. The generated debug APK will be located at:
   `android/app/build/outputs/apk/debug/app-debug.apk`
3. Install on any physical Android device via USB debugging:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## Method 2: Install as Progressive Web App (PWA) on Mobile Device

1. Connect your phone and PC to the same Wi-Fi network.
2. Run the development server:
   ```bash
   npm run dev -- --host
   ```
3. Look for the Network IP in your terminal (e.g., `http://192.168.29.97:3000/`).
4. Open Chrome / Safari on your mobile phone and navigate to that URL.
5. Tap **Share** (iOS Safari) or the **⋮** menu (Android Chrome) and select **"Add to Home Screen"**.
6. The app will launch in full-screen standalone mode with no browser URL bar, behaving exactly like a native app.

---

## Method 3: Live Frameless Mode in Desktop Browser

Click the **"Frameless Mode"** button in the top navigation bar to expand the phone interface to full viewport width, ideal for simulating native Android/iOS mobile views in Chrome DevTools Device Mode (Ctrl+Shift+M).
