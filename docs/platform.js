/*
 * Minik Odak · platform katmanı
 * Uygulama kodu, claude.ai'deki sürümle aynı kalsın diye `window.claude.use(name)` arayüzünü
 * burada Firebase (ücretsiz Spark planı) ve cihaz bildirimleriyle yeniden kuruyoruz.
 *  - "db"   → Cloud Firestore (her kullanıcının özel verisi: data/users/<uid>/...)
 *  - "user" → Firebase Authentication (anonim + isteğe bağlı e-posta hesabı)
 *  - "room" → Firestore ile ortak odalar (rooms/<kod>/peers ve rooms/<kod>/events)
 *  - "sample" (yapay zeka) → bilerek kapalı: ücretli olduğu için bu sürümde yok.
 * firebase-config.js boş bırakılırsa uygulama tamamen yerel (internet gerektirmeyen) modda çalışır.
 */
(function () {
  "use strict";
  const cfg = window.MINIK_FIREBASE_CONFIG || null;
  const hasFirebase = !!(cfg && cfg.apiKey && cfg.projectId && window.firebase);
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const tabId = Math.random().toString(36).slice(2, 10);

  let auth = null, fs = null, readyResolve;
  const ready = new Promise(r => (readyResolve = r));
  const listeners = new Set();

  if (hasFirebase) {
    try {
      firebase.initializeApp(cfg);
      auth = firebase.auth();
      fs = firebase.firestore();
      try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
      let first = true;
      auth.onAuthStateChanged(u => {
        if (!u) { auth.signInAnonymously().catch(() => readyResolve(null)); return; }
        if (first) { first = false; readyResolve(u); }
        listeners.forEach(fn => { try { fn(account.state()); } catch (e) {} });
      });
      setTimeout(() => readyResolve(null), 12000);
    } catch (e) { console.warn("Firebase başlatılamadı", e); readyResolve(null); }
  } else readyResolve(null);

  /* ---------- db adapter (artifact db API → Firestore) ---------- */
  function snapOf(s) {
    return { exists: s.exists, data: () => (s.exists ? s.data() : undefined), hasPendingWrites: !!(s.metadata && s.metadata.hasPendingWrites), fromCache: !!(s.metadata && s.metadata.fromCache) };
  }
  const dbApi = {
    doc(path) {
      const ref = fs.doc(path);
      return {
        id: ref.id, path,
        get: () => ref.get().then(snapOf),
        set: data => ref.set(data),
        update: data => ref.update(data),
        delete: () => ref.delete(),
        onSnapshot: (next, err) => ref.onSnapshot({ includeMetadataChanges: true }, s => next(snapOf(s)), e => err && err({ code: "unavailable", message: String(e) }))
      };
    }
  };

  /* ---------- user adapter ---------- */
  const userApi = {
    id: async () => (auth && auth.currentUser ? auth.currentUser.uid : null),
    isOwner: () => true,
    canEdit: () => true,
    can: () => true
  };

  /* ---------- rooms over Firestore ---------- */
  function makeRoom(name) {
    const uid = auth.currentUser.uid, peerId = uid + "-" + tabId, t0 = Date.now();
    const peersCol = fs.collection("rooms/" + name + "/peers"), evCol = fs.collection("rooms/" + name + "/events");
    let me = {}, peers = [], peerSubs = new Set(), unsubPeers = null, hb = null, left = false;
    const evSubs = [];
    const write = () => peersCol.doc(peerId).set({ uid, presence: me, at: Date.now() }).catch(() => {});
    const startPeers = () => {
      if (unsubPeers) return;
      unsubPeers = peersCol.onSnapshot(qs => {
        const now = Date.now();
        peers = qs.docs.map(d => ({ id: d.id, d: d.data() }))
          .filter(x => x.d && x.d.at > now - 120000)
          .map(x => ({ peer: x.id, by: x.d.uid, presence: x.d.presence || {}, sameTab: x.id === peerId, isMe: x.d.uid === uid, kind: "viewer", guest: false, updatedAt: x.d.at }));
        if (!peers.find(p => p.sameTab)) peers.unshift({ peer: peerId, by: uid, presence: me, sameTab: true, isMe: true, kind: "viewer", guest: false, updatedAt: now });
        peerSubs.forEach(fn => { try { fn({ peers, joined: [], left: [], updated: [] }); } catch (e) {} });
      }, () => {});
    };
    const room = {
      name,
      presence(patch) { if (left) return Promise.resolve(); Object.keys(patch).forEach(k => (patch[k] === null ? delete me[k] : (me[k] = patch[k]))); return write(); },
      peers: () => peers,
      onPeers(fn) { peerSubs.add(fn); startPeers(); return () => peerSubs.delete(fn); },
      on(topic, fn) {
        const u = evCol.where("at", ">", t0).onSnapshot(qs => {
          qs.docChanges().forEach(ch => {
            if (ch.type !== "added") return; const d = ch.doc.data(); if (!d || d.topic !== topic) return;
            try { fn({ topic, data: d.data, peer: d.from, by: d.uid, sameTab: d.from === peerId, isMe: d.uid === uid, kind: "viewer", guest: false }); } catch (e) {}
          });
        }, () => {});
        evSubs.push(u); return u;
      },
      emit(topic, data) { return evCol.add({ topic, data: data === undefined ? null : data, from: peerId, uid, at: Date.now() }).then(() => {}); },
      connected: () => true,
      async leave() { left = true; clearInterval(hb); unsubPeers && unsubPeers(); evSubs.forEach(u => u()); peerSubs.clear(); await peersCol.doc(peerId).delete().catch(() => {}); }
    };
    write(); hb = setInterval(write, 45000);
    addEventListener("pagehide", () => { if (!left) peersCol.doc(peerId).delete().catch(() => {}); });
    return room;
  }
  const roomApi = {
    join: async name => { if (!auth || !auth.currentUser) throw { code: "not_permitted" }; return makeRoom(name); },
    connected: () => true
  };

  /* ---------- window.claude shim ---------- */
  window.claude = {
    use: async name => {
      const u = await ready;
      if (!u) return null;
      if (name === "db") return dbApi;
      if (name === "user") return userApi;
      if (name === "room") return roomApi;
      return null; // "sample" ve diğerleri bu sürümde yok
    }
  };

  /* ---------- account (anonim → e-posta hesabı) ---------- */
  const account = {
    available: () => !!auth,
    state() {
      const u = auth && auth.currentUser;
      return { available: !!auth, signedIn: !!u, anonymous: !!(u && u.isAnonymous), email: (u && u.email) || "" };
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async create(email, pw) {
      const u = auth.currentUser, cred = firebase.auth.EmailAuthProvider.credential(email, pw);
      if (u && u.isAnonymous) await u.linkWithCredential(cred); // aynı kullanıcı, veriler korunur
      else await auth.createUserWithEmailAndPassword(email, pw);
    },
    async signIn(email, pw) { await auth.signInWithEmailAndPassword(email, pw); location.reload(); },
    async signOut() { await auth.signOut(); location.reload(); },
    async reset(email) { await auth.sendPasswordResetEmail(email); },
    async deleteAccount() {
      const u = auth.currentUser; if (!u) return;
      const base = "data/users/" + u.uid + "/";
      await Promise.all(["mo_main", "mo_face", "mo_learned"].map(d => fs.doc(base + d).delete().catch(() => {})));
      await u.delete();
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    },
    errorText(e) {
      const c = (e && e.code) || "";
      if (c.includes("email-already-in-use") || c.includes("credential-already-in-use")) return "Bu e-posta zaten kayıtlı. “Giriş yap”ı dene.";
      if (c.includes("invalid-email")) return "E-posta adresi geçersiz görünüyor.";
      if (c.includes("weak-password")) return "Şifre en az 6 karakter olmalı.";
      if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("user-not-found")) return "E-posta ya da şifre hatalı.";
      if (c.includes("network")) return "İnternet bağlantısı yok gibi.";
      if (c.includes("requires-recent-login")) return "Güvenlik için çıkış yapıp tekrar giriş yap, sonra yeniden dene.";
      if (c.includes("operation-not-allowed")) return "Bu giriş yöntemi Firebase'de açılmamış (README'ye bak).";
      return "Olmadı, birazdan tekrar dene.";
    }
  };
  window.MO_ACCOUNT = account;

  /* ---------- notifications ---------- */
  const LN = isNative && Cap.Plugins && Cap.Plugins.LocalNotifications;
  let webTimer = 0, lastTimerKey = "", actionHandler = null;
  const notify = {
    native: !!LN,
    async permission() {
      if (LN) { const r = await LN.requestPermissions(); return r.display === "granted"; }
      if (!("Notification" in window)) return false;
      if (Notification.permission === "granted") return true;
      try { return (await Notification.requestPermission()) === "granted"; } catch (e) { return false; }
    },
    async status() {
      if (LN) { const r = await LN.checkPermissions(); return r.display; }
      return "Notification" in window ? Notification.permission : "unsupported";
    },
    /* sayaç bitişi: tek bildirim (id 1) */
    async timer(at, title, body) {
      const key = at + title;
      if (key === lastTimerKey) return; lastTimerKey = key;
      if (LN) {
        try { await LN.cancel({ notifications: [{ id: 1 }] }); } catch (e) {}
        if (at > Date.now() + 1000) await LN.schedule({ notifications: [{ id: 1, title, body, schedule: { at: new Date(at), allowWhileIdle: true }, channelId: "timer" }] }).catch(() => {});
        return;
      }
      clearTimeout(webTimer);
      const ms = at - Date.now();
      if (ms > 0 && ms < 6 * 3600e3) webTimer = setTimeout(() => webShow(title, body), ms);
    },
    async clearTimer() {
      lastTimerKey = "";
      if (LN) { try { await LN.cancel({ notifications: [{ id: 1 }] }); } catch (e) {} return; }
      clearTimeout(webTimer);
    },
    /* hatırlatmalar: saatli olanlar için her doz 3 kez (0, +20, +40 dk), önümüzdeki 3 gün; aralıklı olanlar için bugün kalan saatler */
    async reminders(list, doneByDay, lastDrink, userName) {
      if (!LN) return;
      try {
        const pend = await LN.getPending();
        const old = (pend.notifications || []).filter(n => n.id >= 1000).map(n => ({ id: n.id }));
        if (old.length) await LN.cancel({ notifications: old });
      } catch (e) {}
      const out = [], now = Date.now(); let id = 1000;
      const dk = t => { const d = new Date(t); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
      const who = userName ? userName + ", " : "";
      list.forEach((r, ri) => {
        if (r.mode === "saat") {
          for (let day = 0; day < 3; day++) {
            const base = new Date(); base.setDate(base.getDate() + day);
            const done = (doneByDay[dk(base)] || {})[r.id] || [];
            (r.times || []).forEach(tm => {
              if (Array.isArray(done) && done.includes(tm)) return;
              const [h, m] = tm.split(":").map(Number);
              [0, 20, 40].forEach((add, k) => {
                const at = new Date(base); at.setHours(h, m + add, 0, 0);
                if (at.getTime() <= now + 5000 || id > 1900) return;
                out.push({ id: id++, title: `${r.emoji} ${r.name} saati (${tm})`, body: k === 0 ? `${who}${r.name.toLocaleLowerCase("tr")} içtin mi?` : `${who}hatırlatıyorum: ${r.name.toLocaleLowerCase("tr")} içtin mi?`, schedule: { at, allowWhileIdle: true }, actionTypeId: "drink", extra: { rid: r.id, slot: tm, day: dk(at) }, channelId: "reminders" });
              });
            });
          }
        } else if (r.mode === "aralik") {
          const every = (r.every || 60) * 60000; let t = Math.max(now, (lastDrink[r.id] || now)) + every;
          const end = new Date(); end.setHours(22, 30, 0, 0);
          while (t < end.getTime() && id < 1950) {
            const h = new Date(t).getHours();
            if (h >= 8) out.push({ id: id++, title: `${r.emoji} ${r.name}`, body: `${who}${r.name.toLocaleLowerCase("tr")} içtin mi? Biraz zaman oldu.`, schedule: { at: new Date(t), allowWhileIdle: true }, actionTypeId: "drink", extra: { rid: r.id, slot: "", day: dk(t) }, channelId: "reminders" });
            t += every;
          }
        }
      });
      if (out.length) await LN.schedule({ notifications: out }).catch(e => console.warn(e));
    },
    onDrinkAction(fn) { actionHandler = fn; }
  };
  async function webShow(title, body) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" });
      else new Notification(title, { body, icon: "icons/icon-192.png" });
    } catch (e) {}
  }
  if (LN) {
    (async () => {
      try {
        await LN.createChannel({ id: "timer", name: "Sayaç", description: "Odak ve mola bitişi", importance: 4, sound: "default", vibration: true });
        await LN.createChannel({ id: "reminders", name: "Hatırlatmalar", description: "Su, ilaç ve diğer hatırlatmalar", importance: 4, vibration: true });
        await LN.registerActionTypes({ types: [{ id: "drink", actions: [{ id: "done", title: "İçtim ✓" }, { id: "snooze", title: "10 dk sonra" }] }] });
        LN.addListener("localNotificationActionPerformed", ev => {
          const n = ev.notification || {}, x = n.extra || {};
          if (ev.actionId === "snooze") {
            LN.schedule({ notifications: [{ id: 1990 + Math.floor(Math.random() * 9), title: n.title, body: n.body, schedule: { at: new Date(Date.now() + 600000), allowWhileIdle: true }, actionTypeId: "drink", extra: x, channelId: "reminders" }] }).catch(() => {});
            return;
          }
          if (x.rid && actionHandler) actionHandler(x.rid, x.slot || null, ev.actionId === "done");
        });
      } catch (e) { console.warn(e); }
    })();
  }
  window.MO_NOTIFY = notify;
  window.MO_PLATFORM = { native: isNative, firebase: hasFirebase };

  /* ---------- service worker (web/PWA) ---------- */
  if (!isNative && "serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
