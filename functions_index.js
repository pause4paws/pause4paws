/**
 * Pause4Paws — Firebase Cloud Functions
 * ─────────────────────────────────────
 * Listens to the `pushTasks` Firestore collection.
 * When a new task is written by the app, this function:
 *   1. Finds all paid subscribers in the same community
 *   2. Sends an FCM push notification to each of their tokens
 *   3. Marks the task as sent
 *
 * SETUP (one-time):
 *   npm install -g firebase-tools
 *   firebase login
 *   firebase init functions   (choose existing project: pause4paws-82dca)
 *   copy this file to functions/index.js
 *   npm install               (inside the functions/ folder)
 *   firebase deploy --only functions
 */

const functions  = require("firebase-functions");
const admin      = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ── TRIGGER: new document in pushTasks ────────────────────────────────────
exports.deliverPushNotification = functions.firestore
  .document("pushTasks/{taskId}")
  .onCreate(async (snap, context) => {
    const task = snap.data();

    // Already processed? (shouldn't happen on onCreate but guard anyway)
    if (task.sent) return null;

    const { community, petId, title, body } = task;
    if (!community || !title) {
      await snap.ref.update({ sent: true, error: "missing community or title" });
      return null;
    }

    try {
      // 1. Find all paid subscribers in this community who have an FCM token
      const usersSnap = await db.collection("users")
        .where("community", "==", community)
        .where("paid", "==", true)
        .where("telegramAlerts", "==", true)
        .get();

      const tokens = usersSnap.docs
        .map(d => d.data().fcmToken)
        .filter(t => typeof t === "string" && t.length > 0);

      if (!tokens.length) {
        await snap.ref.update({ sent: true, skipped: "no tokens", sentAt: admin.firestore.FieldValue.serverTimestamp() });
        return null;
      }

      // 2. Send in batches of 500 (FCM limit)
      const batchSize = 500;
      let successCount = 0;
      let failCount    = 0;

      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        const message = {
          notification: { title, body },
          data: {
            petId:     petId     || "",
            community: community || "",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            url: "https://pause4paws.github.io/pause4paws/"
          },
          tokens: batch,
          android: {
            priority: "high",
            notification: { sound: "default", channelId: "pause4paws_alerts" }
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } }
          }
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        successCount += response.successCount;
        failCount    += response.failureCount;

        // Clean up invalid tokens
        const staleTokens = [];
        response.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code;
            if (
              code === "messaging/invalid-registration-token" ||
              code === "messaging/registration-token-not-registered"
            ) {
              staleTokens.push(batch[idx]);
            }
          }
        });
        if (staleTokens.length) {
          const userQuery = await db.collection("users")
            .where("fcmToken", "in", staleTokens)
            .get();
          const cleanupBatch = db.batch();
          userQuery.docs.forEach(d => {
            cleanupBatch.update(d.ref, { fcmToken: admin.firestore.FieldValue.delete() });
          });
          await cleanupBatch.commit();
        }
      }

      // 3. Mark task as done
      await snap.ref.update({
        sent:         true,
        sentAt:       admin.firestore.FieldValue.serverTimestamp(),
        successCount,
        failCount,
        tokenCount:   tokens.length
      });

      console.log(`[Pause4Paws] Push sent to ${successCount}/${tokens.length} devices in ${community}`);
      return null;

    } catch (err) {
      console.error("[Pause4Paws] Push error:", err.message);
      await snap.ref.update({ sent: true, error: err.message });
      return null;
    }
  });


// ── SCHEDULED: 6am and 6pm featured pet Telegram digest ───────────────────
// Runs at 6am and 6pm Dubai time (UTC+4 = 02:00 and 14:00 UTC).
// Posts a digest of featured pets to the Telegram channel automatically —
// no need for the admin to manually press the button.
exports.featuredDigestMorning = functions.pubsub
  .schedule("0 2 * * *")   // 06:00 Dubai
  .timeZone("Asia/Dubai")
  .onRun(() => sendFeaturedDigest("morning"));

exports.featuredDigestEvening = functions.pubsub
  .schedule("0 14 * * *")  // 18:00 Dubai
  .timeZone("Asia/Dubai")
  .onRun(() => sendFeaturedDigest("evening"));

async function sendFeaturedDigest(timeOfDay) {
  const BOT_TOKEN = functions.config().telegram?.token || process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = "@pause4paws_ae";
  const appUrl    = "https://pause4paws.github.io/pause4paws/";
  if (!BOT_TOKEN) { console.warn("No Telegram token configured"); return null; }

  // Fetch ALL lost pets (featured + non-featured) for the full digest
  const lostSnap = await db.collection("pets")
    .where("status", "==", "lost")
    .get();
  const foundSnap = await db.collection("pets")
    .where("status", "==", "found")
    .get();

  const allActivePets = [
    ...lostSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    ...foundSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  ];

  if (!allActivePets.length) { console.log("No active pets — skipping digest"); return null; }

  // Group by community
  const byCommunity = {};
  allActivePets.forEach(pet => {
    const c = pet.community || "Dubai";
    if (!byCommunity[c]) byCommunity[c] = [];
    byCommunity[c].push(pet);
  });

  const greeting = timeOfDay === "morning" ? "Good morning" : "Good evening";

  for (const [community, pets] of Object.entries(byCommunity)) {
    // Sort: featured first (newest→oldest), then non-featured (newest→oldest)
    const byNewest = (a, b) => {
      const ta = a.createdAt?._seconds || 0;
      const tb = b.createdAt?._seconds || 0;
      return tb - ta;
    };
    const featured    = pets.filter(p => p.featured && p.status === "lost").sort(byNewest);
    const nonFeatured = pets.filter(p => !p.featured).sort(byNewest);
    const ordered     = [...featured, ...nonFeatured].slice(0, 12);
    const withPhotos  = ordered.filter(p => p.photoURL).slice(0, 10);

    // Build message text
    const buildLine = (p, i) => {
      const badge = p.featured ? "⭐ " : (p.status === "found" ? "📍 " : "🔴 ");
      let line = `${i+1}. ${badge}<b>${p.name}</b>`;
      if (p.color && p.color !== "Unknown") line += ` · ${p.color}`;
      line += ` · ${p.cluster || p.community}`;
      if (p.contact) line += ` · 📞 ${p.contact}`;
      return line;
    };

    let msgText = `<b>🐾 ${greeting}, ${community}!</b>
`;
    if (featured.length) {
      msgText += `
⭐ <b>FEATURED — please share urgently:</b>
`;
      msgText += featured.slice(0, 4).map((p, i) => buildLine(p, i)).join("
");
      if (nonFeatured.length) {
        msgText += `

🔴 <b>Also missing:</b>
`;
        msgText += nonFeatured.slice(0, 6).map((p, i) => buildLine(p, i)).join("
");
      }
    } else {
      msgText += "
" + ordered.map((p, i) => buildLine(p, i)).join("
");
    }
    msgText += `

🔗 <a href="${appUrl}">View all on map →</a>`;

    if (withPhotos.length >= 2) {
      const media = withPhotos.map((p, i) => ({
        type: "photo", media: p.photoURL,
        ...(i === 0 ? { caption: msgText, parse_mode: "HTML" } : {})
      }));
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: CHAT_ID, media })
        });
      } catch(e) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: CHAT_ID, text: msgText, parse_mode: "HTML" })
        });
      }
    } else {
      // Text with photo links inline
      const lines = ordered.map((p, i) => {
        let line = buildLine(p, i);
        if (p.photoURL) line += `
   📸 ${p.photoURL}`;
        return line;
      }).join("

");
      const fullMsg = `<b>🐾 ${greeting}, ${community}!</b>

${lines}

🔗 <a href="${appUrl}">View map →</a>`;
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: fullMsg, parse_mode: "HTML" })
      });
    }
    console.log(`[Pause4Paws] Digest sent for ${community}: ${featured.length} featured + ${nonFeatured.length} others`);
  }
  return null;
}
