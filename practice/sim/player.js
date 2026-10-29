// The step player for the practice run-through: one field script step at a time, with the set lines.
// Open /house/sim.html?play=<scenario> (sim/serve.py). The panel on the right:
// - the steps of the script (S2 ... S10): tap one to jump to it;
// - Back, Replay, Next: Next starts the next step (from where everyone is, or from the step's start if you skip ahead);
// - the line card: who is talking and the words; in Practice it shows YOUR line to say out loud, then "I said it"
//   (or Space, or click on John) and he answers;
// - Watch it done / Practice it: the technician does it, or you do: in Practice you ARE Mike, seen from behind (Jake
//   2026-10-29: "I'm looking at me and I'm controlling that character"). The stick or W A S D walk him (Shift, or the stick
//   pushed all the way, hurries), a drag looks round him; at the door a pop-up asks what you do, and every call gets a
//   good or bad with the script's reason, and a score at the end of the step;
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
  #stick { position: fixed; left: 14px; bottom: 12px; width: 116px; height: 116px; border-radius: 50%; z-index: 41; touch-action: none;
           background: var(--glass, rgba(20,22,26,.6)); border: 1px solid var(--line, rgba(255,255,255,.14)); box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  #knob { position: absolute; left: 38px; top: 38px; width: 40px; height: 40px; border-radius: 50%; pointer-events: none;
          background: #f2b134; box-shadow: 0 0 0 4px rgba(242,177,52,.22), 0 2px 6px rgba(0,0,0,.4); }
  #stick span { position: absolute; left: 0; right: 0; text-align: center; font: 700 12px/1 system-ui, sans-serif; color: rgba(255,255,255,.8); pointer-events: none; }
  #stick span.f { top: 7px; } #stick span.b { bottom: 7px; }
  #ppask { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 45; width: min(430px, calc(100vw - 32px)); box-sizing: border-box;
           background: var(--glass-strong, rgba(20,22,26,.95)); color: var(--text, #f2f2f2); border: 1px solid #7b46b5; border-radius: 14px;
           padding: 12px 14px 14px; font: 14px/1.4 var(--font, system-ui, sans-serif); box-shadow: 0 10px 30px rgba(0,0,0,.5); }
  #ppask h2 { font-size: 15px; margin: 0 0 4px; font-weight: 700; }
  #ppask p { margin: 0 0 6px; opacity: .92; }
  #ppask button { display: block; width: 100%; margin-top: 7px; padding: 11px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.2);
           background: rgba(255,255,255,.08); color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
  #ppask button:hover { background: rgba(94,47,144,.55); }
  #ppfb { position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 46; width: max-content; max-width: min(520px, calc(100vw - 32px)); box-sizing: border-box;
          padding: 10px 14px; border-radius: 10px; font: 600 14px/1.4 var(--font, system-ui, sans-serif); color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
  #ppfb.good { background: #1f7a4d; } #ppfb.bad { background: #a33a2c; }
  #pp .score { margin: 6px 0 0; padding: 0; list-style: none; }
  #pp .score li { margin: 0 0 4px; padding-left: 22px; position: relative; }
  #pp .score li::before { position: absolute; left: 0; font-weight: 700; }
  #pp .score li.good::before { content: "✓"; color: #5fd08f; } #pp .score li.bad::before { content: "✗"; color: #ff7b6b; }
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
      const arrows = mode !== "practice";                   // in Practice the arrows walk Mike
      if (e.code === "KeyN" || (arrows && e.code === "ArrowRight")) { next(); e.preventDefault(); }
      else if (e.code === "KeyB" || (arrows && e.code === "ArrowLeft")) { back(); e.preventDefault(); }
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
        if (!p.root.visible || (mode === "practice" && scen.people[k].tech)) continue;   // Mike is you: a drag on him looks round
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
    ui.cam.style.display = mode === "practice" ? "none" : "";
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
  sim.onLine = (ln) => showLine(ln);

  // Practice: the trainee's turn. A line: Mike faces John and talks with his hands (the line's move) while you say it out loud;
  // "I said it" (Space, or a tap on John) and John answers. An action (mark = {at, go, then}): a ring on the floor where Mike
  // should be; walk him into it yourself, or tap the button and he goes there (go), then does it (then: sitting down, say).
  sim.prompt = (id, text, btn, mark) => new Promise((res, rej) => {
    const ln = id && sim.lines[id];
    showPrompt(ln ? ln.text : text, btn, !!ln);
    const home = homeowner(), me = techPerson();
    if (home && ln && ln.listen) home.gesture(ln.listen, 120);
    if (ln && me) {
      ctl.talkTo = home;
      (async () => {
        if (home && me.base === "idle_neutral_01" && !me.walking && !me.tasks.length && Math.abs(sim.angleDiff(Math.atan2(home.pos.x - me.pos.x, home.pos.z - me.pos.z), me.heading)) > 0.9)
          await me.turnToward(home.pos.x, home.pos.z).catch(() => {});
        if (pending && pending.res === res && ln.move) me.gesture(ln.move, 120);
      })();
    }
    const ring = mark && mark.at ? ringAt(mark.at, mark.r || 0.45) : null;
    pending = { res, rej, mark, ring, line: !!ln };
    render();
  });
  async function said() {
    if (!pending) return;
    const p = pending; pending = null;
    ui.card.className = "card";
    const me = techPerson();
    if (p.line && me && !me.walking && me.base === "idle_neutral_01") { me.gtok++; me.play(me.base, { fade: 0.4 }); }
    render();
    if (p.mark) {
      // tapped the button: he goes there (unless he is already in the ring) and does it; walked in: he just does it
      ctl.locked++;
      try {
        if (p.mark.at && p.mark.go && !inRing(p)) await p.mark.go();
        if (p.mark.then) await p.mark.then();
      } catch (e) { if (!(e instanceof sim.Cancelled)) console.error(e); else { ctl.locked--; if (p.ring) p.ring.remove(); return p.rej(e); } }
      ctl.locked--;
    }
    if (p.ring) p.ring.remove();
    p.res();
  }
  const inRing = (p) => { const me = techPerson(); return p.ring && me && Math.hypot(me.pos.x - p.ring.x, me.pos.z - p.ring.z) < p.ring.r; };
  const homeowner = () => Object.entries(sim.people).find(([k]) => !scen.people[k].tech)?.[1];
  const techPerson = () => Object.entries(sim.people).find(([k]) => scen.people[k].tech)?.[1];

  // ---------------------------------------------------------------------------------------------------- the game's calls
  // What the scenario uses in Practice (sim.coach, sim.choose, sim.feedback, sim.score, sim.mark, sim.control).
  // a ring on the floor: where Mike should go (pulses so it is seen on a phone)
  function ringAt(at, r = 0.45) {
    const T = sim.T;
    const m = new T.Mesh(new T.RingGeometry(r - 0.06, r, 48), new T.MeshBasicMaterial({ color: 0xf2b134, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    const g = sim.groundAt(at[0], at[2], at[1] + 0.5);
    m.position.set(at[0], (g === null ? at[1] : g) + 0.02, at[2]);
    m.renderOrder = 5;
    window.walk.scene.add(m);
    const ring = { x: at[0], z: at[2], r, mesh: m, remove() { if (m.parent) m.parent.remove(m); rings.delete(ring); } };
    rings.add(ring);
    return ring;
  }
  const rings = new Set();
  sim.mark = (at, r) => ringAt(at, r);
  // the card says what to do now (no button: the game moves on by itself)
  sim.coach = (text) => {
    ui.card.className = "card you";
    ui.card.replaceChildren(el("div", { class: "who" }, "You"), el("div", {}, text));
  };
  // a pop-up with choices; resolves with the chosen key
  let asking = null;
  sim.choose = (title, text, options) => new Promise((res, rej) => {
    closeAsk();
    const box = el("div", { id: "ppask" }, el("h2", {}, title), ...(text ? [el("p", {}, text)] : []));
    for (const o of options) box.append(el("button", { onclick: () => { closeAsk(); res(o.key); } }, o.label));
    document.body.append(box);
    asking = { box, rej };
    placeAsk();
  });
  function closeAsk() { if (asking) { asking.box.remove(); asking = null; } }
  function placeAsk() {
    if (!asking) return;
    const pp = document.getElementById("pp"), r = pp.getBoundingClientRect();
    asking.box.style.bottom = (innerWidth <= 720 ? innerHeight - r.top + 10 : 18) + "px";
  }
  // good or bad, with the reason, for a few seconds at the top
  let fbTimer = null;
  sim.feedback = (good, text) => {
    let b = document.getElementById("ppfb");
    if (!b) { b = el("div", { id: "ppfb" }); document.body.append(b); }
    b.className = good ? "good" : "bad";
    b.textContent = (good ? "Good: " : "Not that: ") + text;
    b.style.display = "";
    clearTimeout(fbTimer);
    fbTimer = setTimeout(() => { b.style.display = "none"; }, Math.max(4000, text.length * 70));
  };
  // what the step is scored on; shown on the card when the step is done
  let scores = [];
  sim.score = (key, good, text) => { scores = scores.filter((s) => s.key !== key); scores.push({ key, good, text }); };
  function showScores(s) {
    if (!scores.length) return;
    const n = scores.filter((x) => x.good).length;
    ui.card.className = "card you";
    ui.card.replaceChildren(el("div", { class: "who" }, `${s.title}: ${n} of ${scores.length}`),
      el("ul", { class: "score" }, ...scores.map((x) => el("li", { class: x.good ? "good" : "bad" }, x.text))));
  }

  // ---------------------------------------------------------------------------------------------------- Mike under your thumbs
  // Practice: Mike walks where you push, relative to the camera behind him (W A S D or the arrows, or the stick); Shift or the
  // stick pushed all the way hurries him (and the approach counts it as rushing). He turns into the way he is going, follows the
  // ground (the driveway, the porch steps), and stops at walls, furniture, rails, door leaves and people. The camera sits behind
  // him, eases round after him as he walks, and pulls in short of walls; a drag on the view looks round him, the wheel or a
  // pinch brings it nearer or further. When a line is up it swings round past his shoulder to John.
  const ctl = sim.control = { enabled: true, locked: 0, running: false, speed: 0, input: { x: 0, y: 0, run: false }, keys: {},
    yaw: 0, pitch: 0.24, dist: 2.8, drag: null, talkTo: null, cam: null };
  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function controlStep(dt) {
    const me = techPerson();
    if (mode !== "practice" || !me) return;
    const k = ctl.keys;
    let ix = ctl.input.x, iy = ctl.input.y;
    if (k.KeyW || k.ArrowUp) iy += 1; if (k.KeyS || k.ArrowDown) iy -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1; if (k.KeyA || k.ArrowLeft) ix -= 1;
    let mag = Math.min(1, Math.hypot(ix, iy));
    // his feet are yours only when the scene is not moving him (a scripted walk, the knock, sitting) and he is standing
    const free = ctl.enabled && !ctl.locked && !me.tasks.length && !asking && me.base === "idle_neutral_01";
    if (!free) mag = 0;
    const hurry = mag > 0.1 && (k.ShiftLeft || k.ShiftRight || ctl.input.run);
    const T = sim.T;
    if (mag > 0.1) {
      const want = Math.atan2(Math.sin(ctl.yaw) * iy - Math.cos(ctl.yaw) * ix, Math.cos(ctl.yaw) * iy + Math.sin(ctl.yaw) * ix);
      const d = sim.angleDiff(want, me.heading);
      me.heading += Math.sign(d) * Math.min(Math.abs(d), 5.5 * dt);
      const target = Math.abs(d) > 1.4 ? 0.15 : mag * (hurry ? 2.5 : 1.15);
      ctl.speed += (target - ctl.speed) * Math.min(1, dt * 5);
    } else ctl.speed += (0 - ctl.speed) * Math.min(1, dt * 7);
    if (ctl.speed < 0.03 && mag <= 0.1) ctl.speed = 0;
    ctl.running = ctl.speed > 1.7;
    if (ctl.speed > 0) {
      const step = ctl.speed * dt;
      const fwd = new T.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading));
      const tryMove = (dir, len) => {
        if (len < 1e-4 || sim.blockedMove(me.pos, dir, len, 0.24, me)) return false;
        const nx = me.pos.x + dir.x * len, nz = me.pos.z + dir.z * len;
        const g = sim.groundAt(nx, nz, me.pos.y + 0.45);
        if (g === null || g - me.pos.y > 0.3 || me.pos.y - g > 0.4) return false;    // a porch edge, a wall of the yard
        me.pos.x = nx; me.pos.z = nz; me.pos.y += (g - me.pos.y) * Math.min(1, dt * 12);
        return true;
      };
      if (!tryMove(fwd, step)) {
        const sx = new T.Vector3(Math.sign(fwd.x), 0, 0), sz = new T.Vector3(0, 0, Math.sign(fwd.z));
        if (!tryMove(sx, Math.abs(fwd.x) * step) && !tryMove(sz, Math.abs(fwd.z) * step)) ctl.speed *= 0.5;
      }
      if (!me.walking) me.gtok++;                           // a talking move in progress gives way to the walk
      me.walking = true;
      me.play("walk_neutral_01", { speed: Math.max(0.35, ctl.speed / (me.walkSpeed || 1.2)) });
      me.sync();
    } else if (me.walking && free) {
      me.walking = false;
      me.play(me.base, { fade: 0.3 });
    }
    // walked into an action's ring: the action is done (then() runs, as for the button); a ring he starts in waits for the button
    if (pending && pending.ring && free) {
      if (!inRing(pending)) pending.wasOut = true;
      else if (pending.wasOut && ctl.speed < 0.6) { ctl.speed = 0; said(); }
    }
    for (const r of rings) r.mesh.material.opacity = 0.55 + 0.35 * Math.sin(performance.now() / 260);
  }
  function followCam(dt) {
    const me = techPerson(), T = sim.T;
    if (!me) return;
    const moving = ctl.speed > 0.2 || me.walking;
    if (!ctl.drag) {
      // standing near John: past Mike's right shoulder to John; walking (his feet or the button's): behind him; standing
      // elsewhere: slowly round behind him
      const home = homeowner();
      const talking = home && home.root.visible && !moving && Math.hypot(home.pos.x - me.pos.x, home.pos.z - me.pos.z) < 3.0;
      const want = talking ? Math.atan2(home.pos.x - me.pos.x, home.pos.z - me.pos.z) - 0.42 : me.heading;
      ctl.yaw += sim.angleDiff(want, ctl.yaw) * Math.min(1, dt * (moving ? 1.6 : talking ? 2.2 : 0.9));
    }
    const head = new T.Vector3(me.pos.x, me.eyes().y + 0.02, me.pos.z);       // his real head: lower once he sits
    // under a ceiling (the porch's is 2.4 m, the house's 2.74) the camera comes down rather than look through it
    const up = new T.Raycaster(head, new T.Vector3(0, 1, 0), 0, 2).intersectObjects(walls(), false)[0];
    let pitch = ctl.pitch;
    if (up) pitch = Math.min(pitch, Math.asin(Math.max(0, Math.min(1, (up.distance - 0.3) / ctl.dist))));
    // how far the camera can sit back along a direction before a wall; where that is too close (his back to the sink, the wall
    // behind his chair) it swings round to the nearest clear side rather than sit inside his head
    const room = (yaw) => {
      const back = new T.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const hit = new T.Raycaster(head, back, 0, ctl.dist + 0.25).intersectObjects(walls(), false)[0];
      return [hit ? Math.max(0.55, hit.distance - 0.25) : ctl.dist, back];
    };
    let [d, back] = room(ctl.yaw), yaw = ctl.yaw;
    const need = Math.min(ctl.dist, 1.5);
    if (d < need && !ctl.drag) {
      for (const off of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0]) { const [d2, b2] = room(ctl.yaw + off); if (d2 >= need) { [d, back, yaw] = [d2, b2, ctl.yaw + off]; break; } }
      ctl.yaw += sim.angleDiff(yaw, ctl.yaw) * Math.min(1, dt * 3);
    }
    const want = head.clone().addScaledVector(back, d);
    if (!ctl.cam) ctl.cam = want.clone(); else ctl.cam.lerp(want, Math.min(1, dt * 9));
    const look = head.clone().add(new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.8)).setY(head.y - 0.12);
    sim.setCam(ctl.cam.x, ctl.cam.y, ctl.cam.z, look.x, look.y, look.z);
  }
  let wallMeshes = null;
  // what the camera keeps out of: walls, windows, ceilings, the porch's posts and beam, and anything tall (the fridge, the
  // upper cabinets, a bookcase), so it never sits inside them
  const walls = () => wallMeshes || (wallMeshes = (() => {
    const a = [], box = new sim.T.Box3();
    window.walk.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (/^(col_|win_|wall_|ext_|roof_|ceil|trim_porch|fix_beam|fix_column)/.test(o.name)) a.push(o);
      else if (/^(furn_|fix_)/.test(o.name) && o.visible && box.setFromObject(o).max.y > 1.5 && box.max.y - box.min.y > 0.5) a.push(o);
    });
    return a;
  })());
  function controlInput() {
    // the keys and the mouse are Mike's in Practice, not walk.js's (it would walk the camera and turn it under the follow)
    addEventListener("keydown", (e) => { if (mode !== "practice" || !MOVE_KEYS.has(e.code) || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; ctl.keys[e.code] = true; e.stopImmediatePropagation(); e.preventDefault(); }, true);
    addEventListener("keyup", (e) => { if (!MOVE_KEYS.has(e.code)) return; ctl.keys[e.code] = false; if (mode === "practice") e.stopImmediatePropagation(); }, true);
    addEventListener("blur", () => { ctl.keys = {}; });
    addEventListener("mousedown", (e) => {
      if (mode !== "practice" || e.button !== 0 || e.target.tagName !== "CANVAS") return;
      ctl.drag = { x: e.clientX, y: e.clientY }; e.stopImmediatePropagation(); e.preventDefault();
    }, true);
    addEventListener("mousemove", (e) => {
      if (!ctl.drag || mode !== "practice") return;
      ctl.yaw -= (e.clientX - ctl.drag.x) * 0.006; ctl.pitch = Math.max(-0.05, Math.min(1.0, ctl.pitch + (e.clientY - ctl.drag.y) * 0.004));
      ctl.drag = { x: e.clientX, y: e.clientY }; e.stopImmediatePropagation();
    }, true);
    addEventListener("mouseup", (e) => { if (!ctl.drag) return; ctl.drag = null; if (mode === "practice") { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    addEventListener("click", (e) => { if (mode === "practice" && e.target.tagName === "CANVAS") e.stopImmediatePropagation(); }, true);
    addEventListener("wheel", (e) => { if (mode !== "practice" || e.target.tagName !== "CANVAS") return; ctl.dist = Math.max(1.4, Math.min(6, ctl.dist * (e.deltaY > 0 ? 1.1 : 0.9))); e.stopImmediatePropagation(); e.preventDefault(); }, { capture: true, passive: false });
  }

  // ---------------------------------------------------------------------------------------------------- steps
  async function runStep(i, snap) {
    if (pending) { if (pending.ring) pending.ring.remove(); pending.rej(new sim.Cancelled()); pending = null; }
    if (asking) { const a = asking; closeAsk(); a.rej(new sim.Cancelled()); }
    for (const r of [...rings]) r.remove();
    sim.cancelAll();
    const my = ++runId;
    idx = i;
    const s = scen.steps[i];
    scores = [];
    ctl.enabled = true; ctl.locked = 0; ctl.speed = 0; ctl.talkTo = null;
    if (snap) { s.start(sim); for (const p of Object.values(sim.people)) p.face.target = null; }
    applyMode();
    if (snap) placeTrainee(s);
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
    if (state === "done") showScores(s);
  }
  function next() { if (idx + 1 < scen.steps.length) runStep(idx + 1, state !== "done"); }
  function back() { runStep(Math.max(0, idx - (state === "running" ? 0 : 1)), true); }
  function replay() { runStep(idx, true); }

  // in practice mode the camera starts each step behind Mike, where the step puts him
  function placeTrainee() {
    if (mode !== "practice") return;
    const t = techPerson();
    if (!t) return;
    ctl.yaw = t.heading; ctl.pitch = 0.24; ctl.cam = null;
    followCam(0);
  }
  function applyMode() {
    const t = techPerson();
    if (t) { t.root.visible = true; t.face.enabled = true; }
    sim.practice = mode === "practice";
    sim.freeCamera = mode === "practice" || camMode === "free";
    if (mode === "practice") { window.walk.setFly(true); sim.camera.follow = (dt) => { controlStep(dt); followCam(dt); }; }
    else if (sim.freeCamera) sim.freeCam();
    const stick = document.getElementById("stick");
    if (stick) stick.classList.toggle("tp", mode === "practice");
  }
  function setMode(m) { if (m === mode) return; mode = m; camMode = m === "practice" ? "free" : "director"; runStep(idx, true); }
  function setCam(c) {
    camMode = c;
    if (mode === "practice") { render(); return; }         // in Practice the camera is behind Mike
    sim.freeCamera = mode === "practice" || c === "free";
    if (sim.freeCamera) sim.freeCam(); else { const s = scen.steps[idx]; if (s.shot) sim.shot(s.shot); }
    render();
  }
  function tryMove(clip) {
    const p = sim.people[moveWho];
    if (!p || !p.root.visible) return;
    const c = p.clips[clip];
    if (!c) { ui.status.textContent = `${sim.names[moveWho]} has no ${clip} yet.`; return; }
    if (!p.gesture(clip, Math.max(3, c.duration))) ui.status.textContent = /^sit_/.test(clip) ? "That one is for sitting down." : "That one is for standing up.";
  }

  // ---------------------------------------------------------------------------------------------------- phone controls
  // The house page alone has no touch controls (the Base44 shell, app_shell.html addTouch, adds them), so the same ones are here:
  // a round stick, a finger on the view turned into the mouse down, move and up the walk page understands (so a tap is a click,
  // and a tap on John is "I said it"), two fingers pinch to zoom. In Practice the stick walks Mike the way it is pushed (all the
  // way out hurries him); with the free camera it presses W and S (Shift at the ends) and turns you, as the apps' stick does.
  function touchControls() {
    if (!("ontouchstart" in window) || document.getElementById("stick")) return;
    const stick = el("div", { id: "stick" }, el("div", { id: "knob" }), el("span", { class: "f" }, "▲"), el("span", { class: "b" }, "▼"));
    const knob = stick.firstChild;
    document.body.append(stick);
    // on a phone the panel is a sheet along the bottom: the stick sits just above it, on the left (out of the way of a pop-up)
    const pp = document.getElementById("pp");
    const place = () => { const r = pp.getBoundingClientRect(); stick.style.bottom = (innerWidth <= 720 ? innerHeight - r.top + 10 : 12) + "px"; stick.style.display = asking ? "none" : ""; placeAsk(); };
    place(); setInterval(place, 300);
    const held = {};
    const key = (code, on) => {
      if (!!held[code] === on) return;
      held[code] = on;
      document.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code, key: code, bubbles: true }));
    };
    let sid = null, cx = 0, cy = 0;
    const R = 40;
    const setStick = (dx, dy) => {
      const l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
      dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const x = dx / R, y = dy / R;
      if (mode === "practice") {
        ctl.input.x = Math.abs(x) > 0.15 ? x : 0; ctl.input.y = Math.abs(y) > 0.15 ? -y : 0; ctl.input.run = Math.hypot(x, y) > 0.95;
        key("KeyW", false); key("KeyS", false); key("ShiftLeft", false);
        return;
      }
      ctl.input.x = ctl.input.y = 0; ctl.input.run = false;
      key("KeyW", y < -0.25); key("KeyS", y > 0.25); key("ShiftLeft", Math.abs(y) > 0.9);
      if (window.walk.setTurn) window.walk.setTurn(Math.abs(x) > 0.3 ? x * 1.6 : 0);
    };
    stick.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = stick.getBoundingClientRect();
      sid = t.identifier; cx = r.left + r.width / 2; cy = r.top + r.height / 2; setStick(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    stick.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === sid) setStick(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; setStick(0, 0); } };
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
    controlInput();
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
