# Rafiq Mobile App — Quick Start Guide

## Prerequisites

1. **Install Node.js** (required — not currently installed on your system)
   - Download from: https://nodejs.org/en/download/ (LTS version recommended)
   - After installing, restart your terminal/IDE

2. **Install Expo CLI** (after Node.js):
   ```powershell
   npm install -g expo-cli
   ```

3. **Install Expo Go app** on your phone:
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

---

## Setup Steps

```powershell
# 1. Navigate to mobile app directory
cd "h:\main gaduation project\Rafiq--\mobile app"

# 2. Install dependencies
npm install

# 3. Configure your LAN IP for physical device testing
# Edit .env and replace 10.0.2.2 with your PC's IP address:
# Run this to find your IP:
ipconfig
# Look for "IPv4 Address" under Wi-Fi adapter (e.g. 192.168.1.5)
# Then edit .env:
# EXPO_PUBLIC_API_URL=http://192.168.1.5:8000

# 4. Start the Expo development server
npx expo start
```

---

## Running Backend + Mobile Together

### Terminal 1 — Backend:
```powershell
cd "h:\main gaduation project\Rafiq--\backend"
venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> Use `--host 0.0.0.0` to make the server accessible from your phone on the same WiFi

### Terminal 2 — Mobile App:
```powershell
cd "h:\main gaduation project\Rafiq--\mobile app"
npm install   # first time only
npx expo start
```

Then scan the QR code with:
- **Expo Go app** on your phone (same WiFi network)
- **Android Emulator**: press `a` in the Expo terminal
- **iOS Simulator**: press `i` (macOS only)

---

## Environment Variables

Edit `mobile app/.env`:

| Variable | Purpose | Example |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Backend URL | `http://192.168.1.5:8000` |
| `EXPO_PUBLIC_API_KEY` | API auth key (must match backend .env) | `123` |

- **Android Emulator**: Use `http://10.0.2.2:8000` (routes to host machine)
- **iOS Simulator**: Use `http://localhost:8000`
- **Physical device**: Use your PC's LAN IP (`ipconfig` → Wi-Fi IPv4 Address)

---

## Feature Status

| Screen | Backend | Status |
|---|---|---|
| Home (voice command routing) | /voice/stt | ✅ Functional |
| Speech-to-Text | /voice/stt | ✅ Functional |
| Text-to-Speech | /voice/tts | ✅ Functional |
| Face Recognition | /face/identify, /face/register, /face/list | ✅ Functional |
| OCR (Read Text) | /ocr, /ocr/to-voice | ✅ Functional |
| Object Detection | /detect | ⏳ Wired (backend pending) |
| Indoor Navigation | /navigate/guide | ⏳ Wired (backend pending) |

---

## Troubleshooting

### "Network request failed" on device
- Make sure phone and PC are on the **same WiFi network**
- Check `EXPO_PUBLIC_API_URL` in `.env` uses your PC's LAN IP, not localhost
- Check Windows Firewall allows port 8000 inbound

### Backend not showing as "Online" in app
- Run `uvicorn main:app --reload --host 0.0.0.0 --port 8000` (add `--host 0.0.0.0`)
- Visit `http://localhost:8000/health` in your browser to confirm it's running

### Microphone / Camera permission denied
- Go to phone Settings → Apps → Expo Go → Permissions → enable Microphone & Camera
- Or rebuild as a standalone app with your own bundle ID

### "No speech detected" from Whisper
- Whisper downloads ~150MB model on first use — wait for it to load
- Check `/health` endpoint: `whisper_loaded` should be `true`
- Speak clearly, avoid background noise
