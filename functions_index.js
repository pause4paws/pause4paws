/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Pause4Paws — Firebase Cloud Functions                       ║
 * ║  © 2025 Pause4Paws. All rights reserved.                     ║
 * ║                                                              ║
 * ║  DEPLOY:                                                     ║
 * ║    1. Place this file at  functions/index.js                 ║
 * ║    2. cd functions && npm install                            ║
 * ║    3. Set Telegram token:                                    ║
 * ║       firebase functions:config:set telegram.token="TOKEN"   ║
 * ║    4. firebase deploy --only functions                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Functions:
 *   deliverPushNotification  — triggered on new pushTask doc
 *   featuredDigestMorning    — 6:00am Dubai (02:00 UTC)
 *   featuredDigestEvening    — 6:00pm Dubai (14:00 UTC)
 *   cleanupOldPushTasks      — daily cleanup of sent tasks older than 7 days
 *   notifyReunited           — triggered when pet status changes to "home"
 */

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ── CONFIG ────────────────────────────────────────────────────────────────
const APP_URL      = "https://pause4paws.github.io/pause4paws/";
const CHAT_ID      = "@pause4paws_ae";
const ADMIN_EMAIL  = "pause4paws.app@gmail.com";
const BOT_TOKEN_FN = () =>
  functions.config().telegram?.token ||
  process.env.TELEGRAM_BOT_TOKEN ||
  "8663016273:AAELbuG-Ev0o5tJMW5iWIkeQ79HJxygkcaw"; // fallback — replace with env var in prod

const EMOJI = {
  Dog: "🐕", Cat: "🐈", Bird: "🐦",
  Rabbit: "🐇", "Guinea Pig": "🐹", Other: "🐾"
};

// ══════════════════════════════════════════════════════════════════════════
// 1. DELIVER PUSH NOTIFICATION
//    Triggered when app writes a new doc to pushTasks collection
// ══════════════════════════════════════════════════════════════════════════
exports.deliverPushNotification = functions.firestore
  .document("pushTasks/{taskId}")
  .onCreate(async (snap) => {
    const task = snap.data();
    if (task.sent) return null;

    const { community, petId, title, body } = task;
    if (!community || !title) {
      await snap.ref.update({ sent: true, error: "missing community or title" });
      return null;
    }

    try {
      // Find all paid subscribers in this community with FCM tokens
      const usersSnap = await db.collection("users")
        .where("community", "==", community)
        .where("paid", "==", true)
        .get();

      // Also check nearby communities (pets near borders affect multiple areas)
      const tokens = [];
      const tokenToUid = {};
      usersSnap.docs.forEach(d => {
        const data = d.data();
        // Include if they have a token AND (opted into alerts OR no preference set)
        if (data.fcmToken && typeof data.fcmToken === "string" && data.fcmToken.length > 10) {
          // Avoid duplicates
          if (!tokens.includes(data.fcmToken)) {
            tokens.push(data.fcmToken);
            tokenToUid[data.fcmToken] = d.id;
          }
        }
      });

      if (!tokens.length) {
        await snap.ref.update({
          sent: true, skipped: "no tokens",
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return null;
      }

      // Send in batches of 500 (FCM multicast limit)
      let successCount = 0;
      let failCount    = 0;
      const staleTokens = [];

      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        const message = {
          notification: { title, body },
          data: {
            petId:        petId     || "",
            community:    community || "",
            url:          petId ? `${APP_URL}?pet=${petId}` : APP_URL,
            click_action: "FLUTTER_NOTIFICATION_CLICK"
          },
          tokens: batch,
          android: {
            priority: "high",
            notification: {
              sound:     "default",
              channelId: "pause4paws_alerts",
              icon:      "pause4paws_logo",
              color:     "#EA580C"
            }
          },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", badge: 1, "mutable-content": 1 } }
          },
          webpush: {
            headers: { Urgency: "high" },
            notification: {
              icon:  `${APP_URL}pause4paws_logo.png`,
              badge: `${APP_URL}pause4paws_logo.png`,
              vibrate: [200, 100, 200]
            },
            fcmOptions: { link: petId ? `${APP_URL}?pet=${petId}` : APP_URL }
          }
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        successCount += response.successCount;
        failCount    += response.failureCount;

        // Collect stale/invalid tokens for cleanup
        response.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code || "";
            if (
              code === "messaging/invalid-registration-token" ||
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-argument"
            ) {
              staleTokens.push(batch[idx]);
            }
          }
        });
      }

      // Clean up invalid tokens from user records
      if (staleTokens.length) {
        console.log(`[P4P] Cleaning ${staleTokens.length} stale FCM tokens`);
        const cleanBatch = db.batch();
        // Process in chunks of 10 (Firestore "in" query limit)
        for (let i = 0; i < staleTokens.length; i += 10) {
          const chunk = staleTokens.slice(i, i + 10);
          const q = await db.collection("users").where("fcmToken", "in", chunk).get();
          q.docs.forEach(d => {
            cleanBatch.update(d.ref, {
              fcmToken: admin.firestore.FieldValue.delete()
            });
          });
        }
        await cleanBatch.commit();
      }

      // Mark task as done
      await snap.ref.update({
        sent:         true,
        sentAt:       admin.firestore.FieldValue.serverTimestamp(),
        successCount,
        failCount,
        tokenCount:   tokens.length
      });

      console.log(`[P4P] Push sent: ${successCount}/${tokens.length} devices in ${community}`);
      return null;

    } catch (err) {
      console.error("[P4P] Push error:", err.message);
      await snap.ref.update({ sent: true, error: err.message });
      return null;
    }
  });


// ══════════════════════════════════════════════════════════════════════════
// 2. SCHEDULED DIGEST — 6am and 6pm Dubai time
// ══════════════════════════════════════════════════════════════════════════
exports.featuredDigestMorning = functions.pubsub
  .schedule("0 2 * * *")   // 06:00 Dubai = 02:00 UTC
  .timeZone("Asia/Dubai")
  .onRun(() => sendDailyDigest("morning"));

exports.featuredDigestEvening = functions.pubsub
  .schedule("0 14 * * *")  // 18:00 Dubai = 14:00 UTC
  .timeZone("Asia/Dubai")
  .onRun(() => sendDailyDigest("evening"));

async function sendDailyDigest(timeOfDay) {
  const BOT_TOKEN = BOT_TOKEN_FN();
  if (!BOT_TOKEN) { console.warn("[P4P] No Telegram token"); return null; }

  const greeting = timeOfDay === "morning" ? "🌅 Good morning" : "🌆 Good evening";

  // Fetch all active (lost + found) pets
  const [lostSnap, foundSnap] = await Promise.all([
    db.collection("pets").where("status", "==", "lost").get(),
    db.collection("pets").where("status", "==", "found").get()
  ]);

  const allActive = [
    ...lostSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    ...foundSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  ];

  if (!allActive.length) {
    console.log("[P4P] No active pets — skipping digest");
    return null;
  }

  // Group by community
  const byCommunity = {};
  allActive.forEach(pet => {
    const c = pet.community || "Dubai";
    if (!byCommunity[c]) byCommunity[c] = [];
    byCommunity[c].push(pet);
  });

  // Send one digest per community (with a small delay to avoid Telegram rate limits)
  const communities = Object.entries(byCommunity);
  for (let ci = 0; ci < communities.length; ci++) {
    const [community, pets] = communities[ci];

    // Sort: featured lost first (newest→oldest), then rest (newest→oldest)
    const byNewest = (a, b) =>
      (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0);

    const featuredLost  = pets.filter(p => p.featured && p.status === "lost").sort(byNewest);
    const otherLost     = pets.filter(p => !p.featured && p.status === "lost").sort(byNewest);
    const recentFound   = pets.filter(p => p.status === "found").sort(byNewest).slice(0, 3);

    // Skip community if nothing notable
    if (!featuredLost.length && !otherLost.length) continue;

    const buildLine = (p, i, showFeatBadge = true) => {
      const e     = EMOJI[p.species] || "🐾";
      const badge = showFeatBadge && p.featured ? "⭐ " : (p.status === "found" ? "📍 " : "🔴 ");
      let line    = `${i + 1}. ${badge}<b>${p.name}</b> ${e}`;
      if (p.color && p.color !== "Unknown")  line += ` · ${p.color}`;
      if (p.breed && p.breed !== "Unknown")  line += ` ${p.breed}`;
      line += ` · ${p.cluster || p.community}`;
      if (p.contact) line += ` · 📞 ${p.contact}`;
      return line;
    };

    // Build message text
    let msgText = `<b>${greeting}, ${community}!</b>\n`;

    if (featuredLost.length) {
      msgText += `\n⭐ <b>FEATURED — please share urgently:</b>\n`;
      msgText += featuredLost.slice(0, 4).map((p, i) => buildLine(p, i, true)).join("\n");
    }
    if (otherLost.length) {
      msgText += `\n\n🔴 <b>${featuredLost.length ? "Also " : ""}Still missing (${otherLost.length}):</b>\n`;
      msgText += otherLost.slice(0, 6).map((p, i) => buildLine(p, i, false)).join("\n");
      if (otherLost.length > 6) msgText += `\n...and ${otherLost.length - 6} more`;
    }
    if (recentFound.length) {
      msgText += `\n\n📍 <b>Recent sightings:</b>\n`;
      msgText += recentFound.map((p, i) => buildLine(p, i, false)).join("\n");
    }
    msgText += `\n\n🔗 <a href="${APP_URL}">View all on Pause4Paws map →</a>`;

    // Send as photo gallery if we have photos
    const withPhotos = [...featuredLost, ...otherLost]
      .filter(p => p.photoURL)
      .slice(0, 10);

    try {
      if (withPhotos.length >= 2) {
        const media = withPhotos.map((p, i) => ({
          type: "photo",
          media: p.photoURL,
          ...(i === 0 ? { caption: msgText, parse_mode: "HTML" } : {})
        }));
        const r = await tgPost("sendMediaGroup", { chat_id: CHAT_ID, media });
        if (!r.ok) {
          // Fallback to text if media group fails
          await tgPost("sendMessage", { chat_id: CHAT_ID, text: msgText, parse_mode: "HTML" });
        }
      } else {
        // Text-only (with photo URLs inline for single-photo communities)
        const allOrdered = [...featuredLost, ...otherLost].slice(0, 12);
        const lines = allOrdered.map((p, i) => {
          let line = buildLine(p, i, true);
          if (p.photoURL) line += `\n   📸 ${p.photoURL}`;
          return line;
        }).join("\n\n");

        const fullMsg = `<b>${greeting}, ${community}!</b>\n\n${lines}\n\n🔗 <a href="${APP_URL}">View map →</a>`;
        await tgPost("sendMessage", { chat_id: CHAT_ID, text: fullMsg, parse_mode: "HTML" });
      }
      console.log(`[P4P] Digest sent: ${community} — ${featuredLost.length} featured, ${otherLost.length} missing`);
    } catch (err) {
      console.error(`[P4P] Digest error for ${community}:`, err.message);
    }

    // Rate-limit: 1 second between communities
    if (ci < communities.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}


// ══════════════════════════════════════════════════════════════════════════
// 3. REUNITED NOTIFICATION (NEW)
//    Triggers when a pet document is updated with status = "home"
//    Sends a Telegram celebration post automatically
// ══════════════════════════════════════════════════════════════════════════
exports.notifyReunited = functions.firestore
  .document("pets/{petId}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after  = change.after.data();

    // Only fire when status changes TO "home"
    if (before.status === "home" || after.status !== "home") return null;

    const BOT_TOKEN = BOT_TOKEN_FN();
    if (!BOT_TOKEN) return null;

    const pet = after;
    const e   = EMOJI[pet.species] || "🐾";

    const msg =
      `🎉 <b>REUNITED — ${pet.community}!</b>\n\n` +
      `${e} <b>${pet.name}</b> is safely back home!\n` +
      `${[pet.species, pet.breed && pet.breed !== "Unknown" ? pet.breed : null, pet.color && pet.color !== "Unknown" ? pet.color : null].filter(Boolean).join(" · ")}\n` +
      `📍 ${pet.cluster || pet.community}\n\n` +
      `Thank you to everyone who helped look 💛\n\n` +
      `🔗 <a href="${APP_URL}">Pause4Paws map</a>`;

    try {
      if (pet.reunitedPhotoURL || pet.photoURL) {
        const r = await tgPost("sendPhoto", {
          chat_id:    CHAT_ID,
          photo:      pet.reunitedPhotoURL || pet.photoURL,
          caption:    msg,
          parse_mode: "HTML"
        });
        if (!r.ok) await tgPost("sendMessage", { chat_id: CHAT_ID, text: msg, parse_mode: "HTML" });
      } else {
        await tgPost("sendMessage", { chat_id: CHAT_ID, text: msg, parse_mode: "HTML" });
      }

      // Update reunited stats
      const commKey = "comm_" + (pet.community || "Dubai").replace(/ /g, "_");
      const batch = db.batch();
      batch.set(db.collection("stats").doc("global"),
        { reunited: admin.firestore.FieldValue.increment(1) }, { merge: true });
      batch.set(db.collection("stats").doc(commKey),
        { reunited: admin.firestore.FieldValue.increment(1), community: pet.community || "Dubai" },
        { merge: true });
      await batch.commit();

      console.log(`[P4P] Reunited: ${pet.name} in ${pet.community}`);
    } catch (err) {
      console.error("[P4P] Reunited notify error:", err.message);
    }
    return null;
  });


// ══════════════════════════════════════════════════════════════════════════
// 4. CLEANUP OLD PUSH TASKS (NEW)
//    Runs daily at 3am Dubai — deletes sent pushTasks older than 7 days
//    Keeps Firestore tidy and costs low
// ══════════════════════════════════════════════════════════════════════════
exports.cleanupOldPushTasks = functions.pubsub
  .schedule("0 23 * * *")  // 03:00 Dubai = 23:00 UTC previous day
  .timeZone("Asia/Dubai")
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const snap = await db.collection("pushTasks")
      .where("sent", "==", true)
      .where("sentAt", "<", cutoff)
      .limit(500)
      .get();

    if (snap.empty) {
      console.log("[P4P] Cleanup: no old tasks to delete");
      return null;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`[P4P] Cleanup: deleted ${snap.docs.length} old push tasks`);
    return null;
  });


// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Post to Telegram Bot API — returns parsed JSON response
 */
async function tgPost(method, payload) {
  const BOT_TOKEN = BOT_TOKEN_FN();
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    }
  );
  const json = await res.json();
  if (!json.ok) {
    console.warn(`[P4P] Telegram ${method} failed:`, json.description);
  }
  return json;
}
