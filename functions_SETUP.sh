# Pause4Paws — Cloud Functions Setup
# ====================================
# Run these commands once from your terminal.
# You only need to do this setup once.

# 1. Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# 2. Log in to Firebase
firebase login

# 3. In your project root, initialise Functions
#    (choose existing project: pause4paws-82dca)
#    (select JavaScript, say NO to ESLint, say YES to install dependencies)
firebase init functions

# 4. Replace the generated functions/index.js with the one provided
#    (just copy the index.js file from this folder)

# 5. Set your Telegram bot token as a Firebase config secret
firebase functions:config:set telegram.token="8663016273:AAELbuG-Ev0o5tJMW5iWIkeQ79HJxygkcaw"

# 6. Deploy
cd functions
npm install
cd ..
firebase deploy --only functions

# That's it. The functions are now live:
#
#  deliverPushNotification  — fires instantly when a new pushTask is written
#  featuredDigestMorning    — runs at 06:00 Dubai time every day
#  featuredDigestEvening    — runs at 18:00 Dubai time every day
#
# To check logs:
firebase functions:log
