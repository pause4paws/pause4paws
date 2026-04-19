# 🐾 Pause4Paws

**The Dubai community map for missing pets, sightings & reunions.**

Live app → [pause4paws.github.io/pause4paws](https://pause4paws.github.io/pause4paws/)

---

## What it does

Pause4Paws is a community-powered Progressive Web App (PWA) for Dubai residents.

- 🔴 **Report missing pets** — pin your pet on the map instantly, Telegram alert fires to the whole community
- 📍 **Log sightings** — drag the map to the exact spot you saw an animal and submit in seconds
- 🤖 **AI Photo Match** — upload a photo, AI compares it against all active reports by species, colour, breed & size
- ⭐ **Featured pets** — 25 AED/week puts your pet in the featured section + twice-daily Telegram digests
- 🏥 **Vet layer** — toggle 24hr emergency vet clinics directly on the map
- 📍 **Near me mode** — GPS-filtered view showing only pets within 2km
- 💬 **In-app messaging** — DM pet owners directly without sharing personal numbers
- 🔔 **Push notifications** — instant alerts when a pet is reported in your community
- 📋 **Lost pet poster** — auto-generates a printable A5 poster with QR code per pet
- 🌐 **Arabic / English toggle** — full RTL layout
- 📧 **Email digest** — printable PDF of all missing pets per community

---

## Membership

**38 AED — one payment, lifetime access. No renewals, no subscriptions.**

Payment via Wio QR code (any UAE banking app). Account activated within a few hours of payment confirmation.

---

## Repo structure

```
pause4paws/
├── index.html                  ← Entire app (PWA, single file)
├── manifest.json               ← PWA install config
├── sw.js                       ← Service worker (caching + push)
├── firebase-messaging-sw.js    ← FCM background push handler
├── firestore.rules             ← Firestore security rules (deploy before launch)
├── functions_index.js          ← Cloud Function source (copy to functions/index.js)
├── functions_SETUP.sh          ← One-time deploy script
├── pause4paws_logo.png         ← App icon (512×512 recommended)
├── wio-qr.png                  ← Wio payment QR code
├── promo-comptine.html         ← Promo page (Comptine community)
└── promo-experience.html       ← Promo page (general)
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Single `index.html` — vanilla JS, no framework |
| Map | Leaflet.js + Leaflet.markercluster |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Push | Firebase Cloud Messaging (FCM) |
| Photos | Cloudinary (free tier) |
| AI matching | Clarifai general vision model |
| Alerts | Telegram Bot API |
| Hosting | GitHub Pages |
| Functions | Firebase Cloud Functions (Node 18) |

---

## First-time deploy checklist

### 1. Upload files to GitHub
Replace these files in the repo root:
- `index.html`
- `sw.js`
- `firebase-messaging-sw.js`
- `manifest.json`
- `firestore.rules` ← **critical — locks down the database**
- `functions_index.js`
- `functions_SETUP.sh`

### 2. Deploy Firestore security rules
```bash
firebase deploy --only firestore:rules --project pause4paws-82dca
```
⚠️ Do this before going live — the database is open until rules are deployed.

### 3. Deploy Cloud Functions
```bash
chmod +x functions_SETUP.sh
./functions_SETUP.sh
```
Or manually:
```bash
mkdir -p functions
cp functions_index.js functions/index.js
cd functions && npm install && cd ..
firebase functions:config:set telegram.token="YOUR_BOT_TOKEN"
firebase deploy --only functions --project pause4paws-82dca
```

### 4. Verify it's working
- Open [the live app](https://pause4paws.github.io/pause4paws/)
- Sign up → check Firestore `users` collection for new document
- Submit a test report → check `pets` collection + Telegram channel
- Firebase Console → Functions → check all 5 are listed

---

## Cloud Functions

| Function | Trigger | What it does |
|----------|---------|--------------|
| `deliverPushNotification` | New `pushTasks` doc | Sends FCM push to all paid subscribers in the community |
| `featuredDigestMorning` | 6:00am Dubai daily | Posts featured + missing pet digest to Telegram |
| `featuredDigestEvening` | 6:00pm Dubai daily | Posts featured + missing pet digest to Telegram |
| `notifyReunited` | `pets` doc updated to `status=home` | Posts celebration to Telegram, increments reunion stats |
| `cleanupOldPushTasks` | 3:00am Dubai daily | Deletes sent pushTasks older than 7 days |

---

## Firebase project

- **Project ID:** `pause4paws-82dca`
- **Firestore:** production mode — rules required
- **Auth:** Email/password
- **FCM VAPID key:** in `index.html` as `FCM_VAPID_KEY`

---

## Environment config

Sensitive values are stored as Firebase Function config (not in source):
```bash
# Set Telegram bot token
firebase functions:config:set telegram.token="YOUR_TOKEN"

# View current config
firebase functions:config:get
```

---

## Copyright

**© 2025 Pause4Paws. All rights reserved.**

This codebase is proprietary and confidential. Unauthorised copying, modification, reverse-engineering or redistribution is strictly prohibited under UAE Federal Law No. 38 of 2021 on Copyright and Neighbouring Rights.

Contact: pause4paws.app@gmail.com
