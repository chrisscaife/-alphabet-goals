/* Real-time layer for Alphabet Goals.
   Every back-end offers the same small interface:
     net.join(room, {onState, onSeat, onStatus})  start listening to a game room
     net.publish(path, value)                     path is "state" or "seat/<id>"; value null removes it
     net.leave()                                  stop listening
     net.connected                                true while live
   onState(stateObject) and onSeat(id, seatObjectOrNull) are called for every change,
   including the current values when you join. */
(function () {
  "use strict";

  /* ---------- Firebase Realtime Database ---------- */
  function FirebaseNet(config) {
    let db = null, ref = null, handlers = null, ready = null, offs = [];
    const self = { connected: false, kind: "firebase" };
    function init() {
      if (ready) return ready;
      ready = new Promise((resolve, reject) => {
        try {
          const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
          db = firebase.database(app);
          firebase.auth(app).signInAnonymously().then(() => resolve()).catch(reject);
          db.ref(".info/connected").on("value", s => {
            self.connected = !!s.val();
            if (handlers && handlers.onStatus) handlers.onStatus(self.connected);
          });
        } catch (e) { reject(e); }
      });
      return ready;
    }
    self.join = function (room, h) {
      handlers = h;
      return init().then(() => {
        ref = db.ref("rooms/" + room);
        const st = ref.child("state");
        const seats = ref.child("seats");
        const onState = s => { const v = s.val(); if (v && h.onState) h.onState(fromDb(v)); };
        const onAdd = s => h.onSeat && h.onSeat(s.key, s.val());
        const onDel = s => h.onSeat && h.onSeat(s.key, null);
        st.on("value", onState);
        seats.on("child_added", onAdd); seats.on("child_changed", onAdd); seats.on("child_removed", onDel);
        offs = [() => st.off("value", onState), () => seats.off()];
        if (h.onStatus) h.onStatus(self.connected);
      }).catch(() => { if (h.onStatus) h.onStatus(false, "Couldn't connect. Check your internet and try again."); });
    };
    self.publish = function (path, value) {
      if (!ref) return false;
      const p = path === "state" ? "state" : "seats/" + path.slice(5);
      const r = ref.child(p);
      (value == null ? r.remove() : r.set(path === "state" ? toDb(value) : value)).catch(() => {});
      return true; // Firebase queues writes while offline and sends them on reconnect
    };
    self.leave = function () { offs.forEach(f => f()); offs = []; ref = null; handlers = null; };
    // Firebase drops empty arrays; keep the game state shape intact.
    function toDb(g) { return { json: JSON.stringify(g), rev: g.rev || 0, ts: g.ts || 0 }; }
    function fromDb(v) { try { return v.json ? JSON.parse(v.json) : v; } catch (e) { return null; } }
    return self;
  }

  /* ---------- Free public MQTT brokers (fallback while Firebase is not set up) ---------- */
  function MqttNet() {
    const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
    let clients = [], base = "", handlers = null;
    const self = { connected: false, kind: "mqtt" };
    function status() {
      self.connected = clients.some(c => c.connected);
      if (handlers && handlers.onStatus) handlers.onStatus(self.connected);
    }
    self.join = function (room, h) {
      handlers = h; base = "alphabetgoals/" + room + "/";
      if (!window.mqtt) { if (h.onStatus) h.onStatus(false, "Couldn't load. Check your internet and try again."); return Promise.resolve(); }
      const id = "ag_" + Math.random().toString(36).slice(2, 10);
      clients = BROKERS.map(url => {
        const c = mqtt.connect(url, { reconnectPeriod: 2000, connectTimeout: 8000, clean: true, clientId: id + url.length });
        c.on("connect", () => { c.subscribe([base + "state", base + "seat/+"], { qos: 1 }); status(); });
        c.on("close", status); c.on("offline", status); c.on("error", () => {});
        c.on("message", (topic, buf) => {
          const sub = topic.slice(base.length), txt = buf.toString();
          let v = null; if (txt) { try { v = JSON.parse(txt); } catch (e) { return; } }
          if (sub === "state") { if (v && h.onState) h.onState(v); }
          else if (sub.startsWith("seat/") && h.onSeat) h.onSeat(sub.slice(5), v);
        });
        return c;
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) clients.forEach(c => { if (!c.connected) { try { c.reconnect(); } catch (e) {} } });
      });
      return Promise.resolve();
    };
    self.publish = function (path, value) {
      const payload = value == null ? "" : JSON.stringify(value);
      let ok = false;
      clients.forEach(c => { if (c.connected) { c.publish(base + path, payload, { retain: true, qos: 1 }); ok = true; } });
      return ok;
    };
    self.leave = function () { clients.forEach(c => { try { c.end(true); } catch (e) {} }); clients = []; handlers = null; self.connected = false; };
    return self;
  }

  /* ---------- Offline: solo practice on this phone only ---------- */
  function LocalNet() {
    let h = null;
    const self = { connected: true, kind: "local" };
    self.join = function (room, handlers) { h = handlers; if (h.onStatus) h.onStatus(true); return Promise.resolve(); };
    self.publish = function (path, value) {
      if (!h) return false;
      const copy = value == null ? null : JSON.parse(JSON.stringify(value));
      setTimeout(() => {
        if (!h) return;
        if (path === "state") h.onState && copy && h.onState(copy);
        else h.onSeat && h.onSeat(path.slice(5), copy);
      }, 0);
      return true;
    };
    self.leave = function () { h = null; };
    return self;
  }

  window.AGNet = {
    online() {
      const cfg = (window.AG_CONFIG || {}).FIREBASE;
      return cfg && window.firebase ? FirebaseNet(cfg) : MqttNet();
    },
    local: LocalNet
  };
})();
