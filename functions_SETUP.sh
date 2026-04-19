#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  Pause4Paws — Cloud Functions Setup & Deploy Script          ║
# ║  © 2025 Pause4Paws. All rights reserved.                     ║
# ║                                                              ║
# ║  Run this ONCE to set up and deploy your Cloud Functions.    ║
# ║  After first run, use: firebase deploy --only functions      ║
# ╚══════════════════════════════════════════════════════════════╝
#
# REQUIREMENTS:
#   - Node.js 18+ installed  (check: node --version)
#   - Firebase CLI installed (check: firebase --version)
#     Install: npm install -g firebase-tools
#   - Logged in to Firebase: firebase login
#   - Run from the ROOT of your repo (same folder as index.html)

set -e  # exit on any error

echo ""
echo "🐾 Pause4Paws — Cloud Functions Setup"
echo "══════════════════════════════════════"
echo ""

# ── Step 1: Check prerequisites ───────────────────────────────────────────
echo "📋 Checking prerequisites…"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (v18 or higher)"
  exit 1
fi

NODE_VER=$(node -e "console.log(parseInt(process.version.slice(1)))")
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node --version)"
  echo "   Update from https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if ! command -v firebase &> /dev/null; then
  echo "📦 Installing Firebase CLI…"
  npm install -g firebase-tools
fi
echo "✅ Firebase CLI $(firebase --version)"

# ── Step 2: Create functions folder structure ─────────────────────────────
echo ""
echo "📁 Setting up functions/ folder…"
mkdir -p functions

# Copy functions_index.js → functions/index.js
if [ -f "functions_index.js" ]; then
  cp functions_index.js functions/index.js
  echo "✅ Copied functions_index.js → functions/index.js"
else
  echo "❌ functions_index.js not found in repo root. Please upload it first."
  exit 1
fi

# Create package.json for functions
cat > functions/package.json << 'EOF'
{
  "name": "pause4paws-functions",
  "description": "Pause4Paws Firebase Cloud Functions",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "18"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.8.0"
  },
  "private": true
}
EOF
echo "✅ Created functions/package.json (Node 18, latest Firebase SDKs)"

# Create .gitignore for functions
cat > functions/.gitignore << 'EOF'
node_modules/
EOF
echo "✅ Created functions/.gitignore"

# ── Step 3: Install dependencies ──────────────────────────────────────────
echo ""
echo "📦 Installing Cloud Function dependencies…"
cd functions
npm install
cd ..
echo "✅ Dependencies installed"

# ── Step 4: Set Telegram bot token ────────────────────────────────────────
echo ""
echo "🔑 Setting Telegram bot token as Firebase secret…"
firebase functions:config:set \
  telegram.token="8663016273:AAELbuG-Ev0o5tJMW5iWIkeQ79HJxygkcaw" \
  --project pause4paws-82dca
echo "✅ Telegram token set"

# ── Step 5: Deploy Firestore security rules ───────────────────────────────
echo ""
echo "🔒 Deploying Firestore security rules…"
if [ -f "firestore.rules" ]; then
  firebase deploy --only firestore:rules --project pause4paws-82dca
  echo "✅ Firestore rules deployed"
else
  echo "⚠️  firestore.rules not found — skipping. Upload it to the repo root and run:"
  echo "   firebase deploy --only firestore:rules"
fi

# ── Step 6: Deploy Cloud Functions ────────────────────────────────────────
echo ""
echo "🚀 Deploying Cloud Functions…"
firebase deploy --only functions --project pause4paws-82dca
echo ""
echo "✅ Cloud Functions deployed!"

# ── Step 7: Verify ────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════"
echo "🎉 Setup complete! Your functions:"
echo ""
echo "  ✅ deliverPushNotification  — fires on new pushTask"
echo "  ✅ featuredDigestMorning    — 6:00am Dubai every day"
echo "  ✅ featuredDigestEvening    — 6:00pm Dubai every day"
echo "  ✅ notifyReunited           — fires when pet marked Back Home"
echo "  ✅ cleanupOldPushTasks      — 3:00am Dubai every day"
echo ""
echo "View logs:     firebase functions:log --project pause4paws-82dca"
echo "Re-deploy:     firebase deploy --only functions --project pause4paws-82dca"
echo ""
echo "🐾 Pause4Paws is live!"
