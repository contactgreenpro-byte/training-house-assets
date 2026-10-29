// The step player for the practice run-through: one field script step at a time, with the set lines.
// Open /house/sim.html?play=<scenario> (sim/serve.py). The panel on the right:
// - the steps of the script (S2 ... S10): tap one to jump to it;
// - Back, Replay, Next: Next starts the next step (from where everyone is, or from the step's start if you skip ahead);
// - the line card: who is talking and the words; in Practice it shows YOUR line to say out loud, then "I said it"
//   (or Space, or click on John) and he answers;
// - Watch it done / Practice it: the technician does it, or you do (he is hidden, you are the camera, walk freely);
// - Director / Free camera: the shots for each step, or walk.js's own controls;
// - Coaching: the script's own directions (its D lines) for the step;
// - Body language: tap a move to see John or Mike do it right now.
// Keys: N or right arrow next, B or left arrow back, R replay, Space "I said it".
(function () {
  "use strict";
  const sim = window.sim;
  const qs = new URLSearchParams(location.search);
  const NAME = qs.get("play");
  if (!NAME) return;

  const MOVES = {
    "Listening": [["listen_accept_01", "Nod yes"], ["listen_accept_02", "Interested nods"], ["listen_accept_03", "Small nods"], ["listen_neutral_02", "Listening"],
      ["listen_relaxed_01", "Relaxed"], ["listen_deny_01", "Shake head no"], ["listen_deny_02", "Doubtful"], ["listen_nervous_01", "Nervous"],
      ["listen_excited_01", "Excited"], ["listen_sad_01", "Sympathetic"], ["listen_angry_01", "Annoyed"]],
    "Talking": [["talk_self_assured_01", "Confident"], ["talk_self_assured_02", "Confident 2"], ["talk_relaxed_01", "Relaxed"], ["talk_relaxed_02", "Relaxed 2"],
      ["talk_neutral_01", "Plain"], ["talk_neutral_03", "Plain 2"], ["presentation_right_01", "Offer, palm up"], ["presentation_left_01", "Point, show"],
      ["talk_nervous_01", "Nervous"], ["talk_sad_01", "Upset"], ["talk_excited_01", "Excited"], ["talk_cool", "Too cool"], ["talk_angry_01", "Angry"]],
    "Reactions": [["shrug_01", "Shrug"], ["thoughtful_01", "Thinking"], ["laugh_low", "Laugh"], ["wave_01", "Wave"], ["invite_sit", "Invite in"], ["knock_door", "Knock"]],
    "Standing": [["idle_neutral_01", "Stand easy"], ["idle_nervous_01", "Fidgety"], ["idle_waiting_01", "Impatient"], ["idle_look_around_01", "Looking around"],
      ["idle_angry_01", "Annoyed stance"], ["idle_scratch_head_01", "Scratch head"], ["idle_touch_face_01", "Touch face"]],
    "Work": [["documents_check", "Read the clipboard"], ["documents_note", "Write on it"], ["take_picture", "Take a picture"],
      ["cell_phone_textmessage", "Head down texting"], ["cell_phone_talk_01", "On a call"]],
    "Seated": [["sit_table_idle_relaxed_01", "Relaxed"], ["sit_table_gestic_thoughtful", "Thinking"], ["sit_table_gestic_shrug_01", "Shrug"],
      ["sit_table_idle_nervous_01", "Nervous"], ["sit_table_idle_waiting_01", "Impatient"], ["sit_table_idle_touch_face", "Touch face"],
      ["sit_chair_idle_relaxed_01", "Sofa: relaxed"], ["sit_chair_gestic_thoughtful", "Sofa: thinking"], ["sit_chair_idle_look_around", "Sofa: looking around"]],
  };

  // ---------------------------------------------------------------------------------------------------- the panel
  const css = `
  #pp { position: fixed; top: 12px; right: 12px; width: 360px; max-height: calc(100vh - 24px); overflow: auto; z-index: 40;
        background: var(--glass-strong, rgba(20,22,26,.9)); color: var(--text, #f2f2f2); border: 1px solid var(--line, rgba(255,255,255,.14));
        border-radius: 14px; padding: 12px 14px 14px; font: 14px/1.4 var(--font, system-ui, sans-serif); box-shadow: 0 8px 28px rgba(0,0,0,.4); }
  #pp h1 { font-size: 15px; margin: 0 0 2px; font-weight: 700; }
  #pp .sub { font-size: 12px; opacity: .75; margin-bottom: 8px; }
  #pp .seg { display: flex; gap: 4px; margin: 6px 0; }
  #pp .seg button, #pp .chips button, #pp .ctl button, #pp .mv button, #pp .who button {
        border: 1px solid var(--line, rgba(255,255,255,.18)); background: rgba(255,255,255,.06); color: inherit; border-radius: 8px;
        padding: 6px 9px; font: inherit; font-size: 13px; cursor: pointer; }
  #pp .seg button { flex: 1; }
  #pp button.on { background: #5e2f90; border-color: #7b46b5; color: #fff; }
  #pp .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
  #pp .chips button { padding: 4px 7px; font-size: 12px; min-width: 38px; }
  #pp .chips button.done { opacity: .6; }
  #pp .step { font-weight: 700; font-size: 16px; margin-top: 4px; }
  #pp .part { font-size: 12px; opacity: .7; }
  #pp .card { margin: 10px 0; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.07); min-height: 58px; }
  #pp .card .who { font-size: 12px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; opacity: .8; margin-bottom: 3px; }
  #pp .card.you { background: rgba(94,47,144,.35); border: 1px solid #7b46b5; }
  #pp .card .go { margin-top: 8px; width: 100%; padding: 9px; border-radius: 8px; border: 0; background: #f2b134; color: #1b1b1b; font: inherit; font-weight: 700; cursor: pointer; }
  #pp .ctl { display: flex; gap: 6px; }
  #pp .ctl button { flex: 1; padding: 9px 6px; }
  #pp .ctl .next { flex: 1.6; background: #f2b134; color: #1b1b1b; border: 0; font-weight: 700; }
  #pp .status { font-size: 12px; opacity: .75; margin-top: 6px; min-height: 16px; }
  #pp details { margin-top: 10px; border-top: 1px solid var(--line, rgba(255,255,255,.14)); padding-top: 8px; }
  #pp summary { cursor: pointer; font-weight: 700; font-size: 13px; }
  #pp ul { margin: 6px 0 0 18px; padding: 0; font-size: 13px; }
  #pp li { margin-bottom: 5px; }
  #pp .mv h3 { font-size: 12px; margin: 8px 0 4px; opacity: .8; font-weight: 700; }
  #pp .mv .row { display: flex; flex-wrap: wrap; gap: 4px; }
  #pp .mv button { padding: 4px 7px; font-size: 12px; }
  #pp .who { display: flex; gap: 4px; margin-top: 6px; }
  #pp .who button { flex: 1; }
  #pp .min { position: sticky; top: 0; float: right; z-index: 2; margin: -4px -6px 0 6px; border: 0; border-radius: 6px; background: var(--glass-strong, rgba(20,22,26,.9));
        color: inherit; font: inherit; font-size: 12px; opacity: .85; cursor: pointer; padding: 4px 6px; }
  #pp.mini .sub, #pp.mini .seg, #pp.mini .chips, #pp.mini .part, #pp.mini details { display: none; }
  #pp.mini .card { margin: 6px 0; }
  #ppstart { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.45); }
  #ppstart button { padding: 16px 26px; font: 700 17px var(--font, system-ui, sans-serif); border: 0; border-radius: 10px; background: #5e2f90; color: #fff; cursor: pointer; }
  #ppstart button:disabled { background: #3a3f47; cursor: default; }
  @media (max-width: 720px) { #pp { top: auto; bottom: 8px; right: 8px; left: 8px; width: auto; max-height: 52vh; } }
  #stick { position: fixed; left: 14px; bottom: 12px; width: 64px; height: 120px; border-radius: 32px; z-index: 41; touch-action: none;
           background: var(--glass, rgba(20,22,26,.6)); border: 1px solid var(--line, rgba(255,255,255,.14)); box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  #knob { position: absolute; left: 12px; top: 39px; width: 40px; height: 40px; border-radius: 50%; pointer-events: none;
          background: #f2b134; box-shadow: 0 0 0 4px rgba(242,177,52,.22), 0 2px 6px rgba(0,0,0,.4); }
  #stick span { position: absolute; left: 0; right: 0; text-align: center; font: 700 12px/1 system-ui, sans-serif; color: rgba(255,255,255,.8); pointer-events: none; }
  #stick span.f { top: 7px; } #stick span.b { bottom: 7px; }
  `;
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v);
    for (const k of kids) e.append(k);
    return e;
  };

  let scen = null, idx = 0, state = "idle", runId = 0, pending = null, mode = "watch", camMode = "director", moveWho = "john";
  let directions = {};
  const done = new Set();
  const ui = {};

  function build() {
    document.head.append(el("style", {}, css));
    const pp = el("div", { id: "pp" });
    ui.title = el("h1", {}, "Practice run-through");
    ui.sub = el("div", { class: "sub" }, scen.title);
    ui.mode = el("div", { class: "seg" },
      el("button", { "data-m": "watch", onclick: () => setMode("watch") }, "Watch it done"),
      el("button", { "data-m": "practice", onclick: () => setMode("practice") }, "Practice it"));
    ui.cam = el("div", { class: "seg" },
      el("button", { "data-c": "director", onclick: () => setCam("director") }, "Director camera"),
      el("button", { "data-c": "free", onclick: () => setCam("free") }, "Walk freely"));
    ui.chips = el("div", { class: "chips" });
    scen.steps.forEach((s, i) => ui.chips.append(el("button", { title: s.title, onclick: () => runStep(i, true) }, s.num)));
    ui.step = el("div", { class: "step" });
    ui.part = el("div", { class: "part" });
    ui.card = el("div", { class: "card" });
    ui.ctl = el("div", { class: "ctl" },
      el("button", { onclick: back, title: "Back a step (B)" }, "◀ Back"),
      el("button", { onclick: replay, title: "Play this step again (R)" }, "⟲ Replay"),
      el("button", { class: "next", onclick: next, title: "Next step (N)" }, "Next step ▶"));
    ui.status = el("div", { class: "status" });
    ui.coach = el("ul");
    const coach = el("details", innerWidth > 720 ? { open: "" } : {}, el("summary", {}, "Coaching: the script's directions"), ui.coach);
    // on a phone the panel can shrink to the line and the buttons, so the house shows; it starts that way there
    ui.min = el("button", { class: "min", onclick: () => { pp.classList.toggle("mini"); ui.min.textContent = pp.classList.contains("mini") ? "Show all" : "Hide"; } }, "Hide");
    if (innerWidth <= 720) { pp.classList.add("mini"); ui.min.textContent = "Show all"; }
    ui.moves = el("div", { class: "mv" });
    ui.who = el("div", { class: "who" });
    for (const [k, c] of Object.entries(scen.people)) ui.who.append(el("button", { "data-w": k, onclick: () => { moveWho = k; render(); } }, c.name));
    for (const [g, list] of Object.entries(MOVES)) {
      const row = el("div", { class: "row" });
      for (const [clip, label] of list) row.append(el("button", { title: clip, onclick: () => tryMove(clip) }, label));
      ui.moves.append(el("h3", {}, g), row);
    }
    const body = el("details", {}, el("summary", {}, "Body language: try a move"), ui.who, ui.moves);
    pp.append(ui.min, ui.title, ui.sub, ui.mode, ui.cam, ui.chips, ui.step, ui.part, ui.card, ui.ctl, ui.status, coach, body);
    document.body.append(pp);
    addEventListener("keydown", (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === "KeyN" || e.code === "ArrowRight") { next(); e.preventDefault(); }
      else if (e.code === "KeyB" || e.code === "ArrowLeft") { back(); e.preventDefault(); }
      else if (e.code === "KeyR") { replay(); e.preventDefault(); }
      else if (e.code === "Space" && pending) { said(); e.preventDefault(); e.stopPropagation(); }
    }, true);
    // click on John (a box round him; skinned meshes do not raycast in this three.js). A press that lands on a person
    // is the game's: walk.js would otherwise pick what is behind him on the mouse-up and glide the camera to it.
    let swallow = false;
    const personAt = (e) => {
      const c = document.querySelector("#view canvas, canvas").getBoundingClientRect();
      const locked = document.pointerLockElement;
      const ndc = new sim.T.Vector2(locked ? 0 : ((e.clientX - c.left) / c.width) * 2 - 1, locked ? 0 : -((e.clientY - c.top) / c.height) * 2 + 1);
      const rc = new sim.T.Raycaster(); rc.setFromCamera(ndc, window.walk.camera);
      for (const [k, p] of Object.entries(sim.people)) {
        if (!p.root.visible) continue;
        const b = new sim.T.Box3(new sim.T.Vector3(p.pos.x - 0.35, p.pos.y, p.pos.z - 0.35), new sim.T.Vector3(p.pos.x + 0.35, p.pos.y + 1.9, p.pos.z + 0.35));
        if (rc.ray.intersectsBox(b)) return k;
      }
      return null;
    };
    addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.tagName !== "CANVAS") return;
      const k = personAt(e);
      if (!k) return;
      swallow = true; e.stopImmediatePropagation(); e.preventDefault();
      if (pending && !scen.people[k].tech) said();
      else if (!pending) ui.status.textContent = `${sim.names[k]} is ${sim.current && sim.current.who === k ? "talking" : "listening"}.`;
    }, true);
    for (const t of ["mouseup", "click", "dblclick"]) addEventListener(t, (e) => { if (swallow) { e.stopImmediatePropagation(); if (t !== "mouseup") swallow = false; } }, true);
  }

  function render() {
    const s = scen.steps[idx];
    [...ui.mode.children].forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
    [...ui.cam.children].forEach((b) => b.classList.toggle("on", b.dataset.c === camMode));
    [...ui.chips.children].forEach((b, i) => { b.classList.toggle("on", i === idx); b.classList.toggle("done", done.has(i) && i !== idx); });
    [...ui.who.children].forEach((b) => b.classList.toggle("on", b.dataset.w === moveWho));
    ui.step.textContent = `${s.num}  ${s.title}`;
    ui.part.textContent = (directions[s.num] && directions[s.num].part) || "";
    ui.coach.replaceChildren(...((directions[s.num] && directions[s.num].directions) || []).map((d) => el("li", {}, d)));
    ui.status.textContent = state === "running" ? (pending ? "Your turn" : "Playing") : state === "done" ? (idx + 1 < scen.steps.length ? "Step done. Next step when you are ready." : "That is the end of this run-through.") : state;
  }
  function showLine(ln) {
    ui.card.className = "card";
    ui.card.replaceChildren(el("div", { class: "who" }, sim.names[ln.who] || ln.who), el("div", {}, ln.text));
  }
  function showPrompt(text, btn, isLine) {
    ui.card.className = "card you";
    ui.card.replaceChildren(el("div", { class: "who" }, isLine ? "Your line: say it out loud" : "You"), el("div", {}, text),
      el("button", { class: "go", onclick: said }, (btn || "I said it") + (TOUCH ? (isLine ? "  (or tap John)" : "") : (isLine ? "  (Space, or click John)" : "  (Space)"))));
  }
  const TOUCH = "ontouchstart" in window;
  // A phone held upright sees a narrow slice of the room, so when it is your line and John is out of it, the view turns to him
  // over half a second, from where you stand (you still walk where you like).
  function faceHomeowner() {
    const h = homeowner(), W = window.walk;
    if (!h || !h.root.visible || !W.setView) return;
    const c = W.camera, e = h.eyes(), v = e.clone().project(c);
    if (v.z < 1 && Math.abs(v.x) < 0.8 && Math.abs(v.y) < 0.9) return;
    const d0 = new sim.T.Vector3(); c.getWorldDirection(d0);
    const d1 = e.clone().sub(c.position).normalize();
    const y0 = Math.atan2(-d0.x, -d0.z), p0 = Math.asin(Math.max(-1, Math.min(1, d0.y)));
    const dy = sim.angleDiff(Math.atan2(-d1.x, -d1.z), y0), p1 = Math.asin(Math.max(-1, Math.min(1, d1.y)));
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 500), s = k * k * (3 - 2 * k);
      W.setView(y0 + dy * s, p0 + (p1 - p0) * s);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }
  sim.onLine = (ln) => showLine(ln);

  // practice mode: the trainee's turn. John listens to the camera until the trainee says it.
  // mark (an action's prompt only): where the technician would be once it is done, {at, look, eye}, as a function
  sim.prompt = (id, text, btn, mark) => new Promise((res, rej) => {
    const ln = id && sim.lines[id];
    showPrompt(ln ? ln.text : text, btn, !!ln);
    const home = homeowner();
    if (home) {
      home.face.target = () => window.walk.camera.position.clone();
      if (ln && ln.listen) home.gesture(ln.listen, 120);
      if (ln) faceHomeowner();
    }
    pending = { res, rej, mark };
    render();
  });
  function said() {
    if (!pending) return;
    const p = pending; pending = null;
    ui.card.className = "card";
    if (p.mark && sim.practice && sim.freeCamera) takeTo(p.mark());
    p.res();
    render();
  }
  // Practice: "I knocked", "I'm seated" and the like from somewhere else glide you to where the technician would be (a phone
  // walks slowly); someone already within a metre of it stays where they are.
  function takeTo({ at, look, eye }) {
    const W = window.walk, c = W.camera, to = new sim.T.Vector3(...at), lookAt = new sim.T.Vector3(...look);
    if (Math.hypot(c.position.x - to.x, c.position.z - to.z) < 1) return;
    const from = c.position.clone(), d = new sim.T.Vector3(); c.getWorldDirection(d);
    const look0 = from.clone().addScaledVector(d, 2), t0 = performance.now();
    const p = new sim.T.Vector3(), q = new sim.T.Vector3();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900), s = k * k * (3 - 2 * k);
      p.lerpVectors(from, to, s); q.lerpVectors(look0, lookAt, s);
      sim.setCam(p.x, p.y, p.z, q.x, q.y, q.z);
      if (k < 1) requestAnimationFrame(tick); else if (W.setEye) W.setEye(eye);
    };
    tick();
  }
  const homeowner = () => Object.entries(sim.people).find(([k]) => !scen.people[k].tech)?.[1];
  const techPerson = () => Object.entries(sim.people).find(([k]) => scen.people[k].tech)?.[1];

  // ---------------------------------------------------------------------------------------------------- steps
  async function runStep(i, snap) {
    if (pending) { pending.rej(new sim.Cancelled()); pending = null; }
    sim.cancelAll();
    const my = ++runId;
    idx = i;
    const s = scen.steps[i];
    if (snap) { s.start(sim); for (const p of Object.values(sim.people)) p.face.target = null; placeTrainee(s); }
    applyMode();
    state = "running";
    ui.card.className = "card"; ui.card.replaceChildren(el("div", { class: "who" }, s.num), el("div", {}, s.title));
    render();
    try {
      await s.run(sim);
      if (my !== runId) return;
      state = "done"; done.add(i);
    } catch (e) {
      if (e instanceof sim.Cancelled || my !== runId) return;
      console.error(e); state = "Something went wrong in this step: " + e.message;
    }
    render();
  }
  function next() { if (idx + 1 < scen.steps.length) runStep(idx + 1, state !== "done"); }
  function back() { runStep(Math.max(0, idx - (state === "running" ? 0 : 1)), true); }
  function replay() { runStep(idx, true); }

  // in practice mode the trainee starts each step where the technician would stand, looking at John
  function placeTrainee() {
    if (mode !== "practice") return;
    const t = techPerson(), h = homeowner();
    if (!t || !h) return;
    const e = h.eyes();
    if (window.walk.setEye) window.walk.setEye(window.walk.eyeRange[1]);    // back on your feet after "I'm seated"
    sim.setCam(t.pos.x, t.pos.y + 1.6, t.pos.z, e.x, e.y, e.z);
  }
  function applyMode() {
    const t = techPerson();
    if (t) { t.root.visible = mode === "watch"; t.face.enabled = mode === "watch"; }
    sim.practice = mode === "practice";
    sim.freeCamera = mode === "practice" || camMode === "free";
    if (sim.freeCamera) sim.freeCam();
  }
  function setMode(m) { if (m === mode) return; mode = m; if (m === "practice") camMode = "free"; runStep(idx, true); }
  function setCam(c) {
    camMode = c;
    sim.freeCamera = mode === "practice" || c === "free";
    if (sim.freeCamera) sim.freeCam(); else { const s = scen.steps[idx]; if (s.shot) sim.shot(s.shot); }
    render();
  }
  function tryMove(clip) {
    const p = sim.people[moveWho];
    if (!p || !p.root.visible) { ui.status.textContent = "Mike is hidden in Practice mode."; return; }
    const c = p.clips[clip];
    if (!c) { ui.status.textContent = `${sim.names[moveWho]} has no ${clip} yet.`; return; }
    if (!p.gesture(clip, Math.max(3, c.duration))) ui.status.textContent = /^sit_/.test(clip) ? "That one is for sitting down." : "That one is for standing up.";
  }

  // ---------------------------------------------------------------------------------------------------- phone controls
  // The house page alone has no touch controls (the Base44 shell, app_shell.html addTouch, adds them), so the same ones are here:
  // an upright stick that presses W and S (Shift at the ends), a finger on the view turned into the mouse down, move and up the
  // walk page understands (so a tap is a click, and a tap on John is "I said it"), two fingers pinch to zoom.
  function touchControls() {
    if (!("ontouchstart" in window) || document.getElementById("stick")) return;
    const stick = el("div", { id: "stick" }, el("div", { id: "knob" }), el("span", { class: "f" }, "▲"), el("span", { class: "b" }, "▼"));
    const knob = stick.firstChild;
    document.body.append(stick);
    // on a phone the panel is a sheet along the bottom: the stick sits just above it, on the left
    const pp = document.getElementById("pp");
    const place = () => { const r = pp.getBoundingClientRect(); stick.style.bottom = (innerWidth <= 720 ? innerHeight - r.top + 10 : 12) + "px"; };
    place(); setInterval(place, 300);
    const held = {};
    const key = (code, on) => {
      if (!!held[code] === on) return;
      held[code] = on;
      document.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code, key: code, bubbles: true }));
    };
    let sid = null, cy = 0;
    const R = 46;
    const setStick = (dy) => {
      dy = Math.max(-R, Math.min(R, dy));
      knob.style.transform = `translate(0px,${dy}px)`;
      const y = dy / R;
      key("KeyW", y < -0.25); key("KeyS", y > 0.25); key("ShiftLeft", Math.abs(y) > 0.9);
      if (window.walk.setTurn) window.walk.setTurn(0);
    };
    stick.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = stick.getBoundingClientRect();
      sid = t.identifier; cy = r.top + r.height / 2; setStick(t.clientY - cy);
    }, { passive: false });
    stick.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === sid) setStick(t.clientY - cy);
    }, { passive: false });
    const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; setStick(0); } };
    stick.addEventListener("touchend", stickEnd);
    stick.addEventListener("touchcancel", stickEnd);

    const canvas = document.querySelector("#view canvas, canvas");
    if (!canvas) return;
    if (window.walk.setLookScale) window.walk.setLookScale(1.6);
    const mouse = (type, t, target) => (target || document).dispatchEvent(new MouseEvent(type, {
      clientX: t.clientX, clientY: t.clientY, button: 0, buttons: type === "mouseup" ? 0 : 1, bubbles: true, cancelable: true }));
    const span = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    let lid = null, lpos = null, pinch = null;
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const W = window.walk;
      if (lid !== null || pinch) {
        if (!pinch && W.setFov && e.targetTouches.length >= 2) {
          if (lpos) { mouse("mousemove", { clientX: lpos.clientX + 8, clientY: lpos.clientY }); mouse("mousemove", lpos); mouse("mouseup", lpos, document); }
          pinch = { d0: Math.max(20, span(e.targetTouches[0], e.targetTouches[1])), f0: W.camera.fov };
        }
        return;
      }
      const t = e.changedTouches[0]; lid = t.identifier; lpos = { clientX: t.clientX, clientY: t.clientY };
      mouse("mousedown", t, canvas);
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (pinch) { if (e.targetTouches.length >= 2) window.walk.setFov(pinch.f0 * pinch.d0 / Math.max(20, span(e.targetTouches[0], e.targetTouches[1]))); return; }
      for (const t of e.changedTouches) if (t.identifier === lid) { lpos = { clientX: t.clientX, clientY: t.clientY }; mouse("mousemove", t); }
    }, { passive: false });
    const lookEnd = (e) => {
      if (pinch) { if (e.targetTouches.length === 0) { pinch = null; lid = null; lpos = null; } return; }
      for (const t of e.changedTouches) if (t.identifier === lid) { lid = null; mouse("mouseup", t, canvas); }
    };
    canvas.addEventListener("touchend", lookEnd);
    canvas.addEventListener("touchcancel", lookEnd);
  }

  // ---------------------------------------------------------------------------------------------------- start up
  async function boot() {
    // on a phone the people and their moves take a while to come down after the house: say so instead of showing nothing
    const stepped = qs.get("stepped") === "1";              // the preview pane: steps driven by hand, no start button
    const goBtn = el("button", { disabled: "" }, "Loading the house…");
    const go = el("div", { id: "ppstart" }, goBtn);
    if (!stepped) document.body.append(go);
    while (!window.walk || !window.walk.scene || window.walk.pending() > 0) await new Promise((r) => setTimeout(r, 300));
    addEventListener("unhandledrejection", (e) => { if (e.reason instanceof sim.Cancelled) e.preventDefault(); });
    goBtn.textContent = "Loading John and Mike…";
    await sim.loadScenario(NAME);
    scen = sim.scenario;
    try { directions = await (await fetch(sim.url("sim/lines/script_v2_steps.json"))).json(); } catch (e) { directions = {}; }
    build();
    touchControls();
    scen.steps[0].start(sim);
    render();
    window.player = { runStep, next, back, replay, setMode, setCam, said, tryMove, get idx() { return idx; }, get state() { return state; }, get pending() { return !!pending; } };
    if (stepped) return;
    sim.live(true);
    goBtn.textContent = "Start the run-through"; goBtn.disabled = false;
    goBtn.onclick = () => { sim.unlockAudio(); go.remove(); runStep(0, true); };
  }
  boot();
})();
