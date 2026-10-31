// The step player for the practice run-through: one field script step at a time, with the set lines.
// Open /house/sim.html?play=<scenario> (sim/serve.py). The panel on the right:
// - the steps of the script (S2 ... S10): tap one to jump to it;
// - Back, Replay, Next: Next starts the next step (from where everyone is, or from the step's start if you skip ahead);
// - the line card: who is talking and the words; in Practice it shows YOUR line to say out loud, then "I said it"
//   (or Space, or click on John) and he answers;
// - Watch it done / Play as Mike (Practice): the technician does it, or you do: in Practice you ARE Mike, seen from behind (Jake
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
  #pp .card { margin: 10px 0; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.07); }
  #pp .card:empty { display: none; }
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
  #pp.mini .sub, #pp.mini .camseg, #pp.mini .chips, #pp.mini .part, #pp.mini details { display: none; }
  #pp.mini .card { margin: 6px 0; }
  #ppstart { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.45); }
  #ppstart { flex-direction: column; gap: 12px; }
  #ppstart button { padding: 16px 26px; min-width: 240px; font: 700 17px var(--font, system-ui, sans-serif); border: 0; border-radius: 10px; background: #5e2f90; color: #fff; cursor: pointer; }
  #ppstart button.alt { background: rgba(255,255,255,.14); }
  #ppstart small { color: #fff; opacity: .85; font: 14px var(--font, system-ui, sans-serif); max-width: 300px; text-align: center; }
  #ppstart button:disabled { background: #3a3f47; cursor: default; }
  @media (max-width: 720px) { #pp { top: auto; bottom: 8px; right: 8px; left: 8px; width: auto; max-height: 52vh; } }
  #stick { position: fixed; left: 14px; bottom: 12px; width: 66px; height: 132px; border-radius: 33px; z-index: 41; touch-action: none;
           background: var(--glass, rgba(20,22,26,.6)); border: 1px solid var(--line, rgba(255,255,255,.14)); box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  #knob { position: absolute; left: 12px; top: 45px; width: 40px; height: 40px; border-radius: 50%; pointer-events: none;
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
  #pp.gone { display: none; }
  #ppsay, #ppdo { position: fixed; left: 50%; top: 92px; transform: translateX(-50%); z-index: 44; width: min(430px, calc(100vw - 24px)); box-sizing: border-box;
           background: rgba(60,30,95,.95); color: #fff; border: 1px solid #7b46b5; border-radius: 14px; padding: 10px 12px 12px;
           font: 15px/1.4 var(--font, system-ui, sans-serif); box-shadow: 0 10px 30px rgba(0,0,0,.5); }
  #ppdo { background: rgba(18,70,52,.95); border-color: #2f9a6c; }
  #ppsay .who, #ppdo .who { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .85; }
  #ppsay .line, #ppdo .line { font-size: 16px; margin: 3px 0 9px; }
  #ppsay button, #ppdo button { display: block; width: 100%; padding: 10px; border-radius: 9px; border: 0; background: #f2b134; color: #1b1b1b; font: inherit; font-weight: 700; cursor: pointer; }
  #ppbar .card:empty { display: none; }
  #ppfb ul { margin: 4px 0 0; padding-left: 18px; font-weight: 500; }
  #stick.hurry #knob { background: #e0533d; box-shadow: 0 0 0 4px rgba(224,83,61,.3), 0 2px 6px rgba(0,0,0,.4); }
  #pp .log li { margin-bottom: 6px; }
  #ppdir { position: fixed; top: 42%; z-index: 41; width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
           background: #f2b134; color: #1b1b1b; font: 700 20px/1 system-ui, sans-serif; pointer-events: none; box-shadow: 0 0 0 5px rgba(242,177,52,.25), 0 4px 12px rgba(0,0,0,.4); }
  #ppdir.l { left: 10px; } #ppdir.r { right: 10px; }
  #ppmenu { position: fixed; top: 10px; right: 10px; z-index: 42; border: 1px solid var(--line, rgba(255,255,255,.2)); border-radius: 10px;
            background: var(--glass-strong, rgba(20,22,26,.9)); color: var(--text, #f2f2f2); font: 600 14px var(--font, system-ui, sans-serif);
            padding: 9px 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  #ppbar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 10px; z-index: 43; width: min(520px, calc(100vw - 20px)); box-sizing: border-box;
           color: var(--text, #f2f2f2); font: 13px/1.35 var(--font, system-ui, sans-serif); display: flex; flex-direction: column; gap: 6px; }
  @media (max-width: 720px) { #ppbar { left: 90px; right: 8px; width: auto; transform: none; } }
  #ppbar .card { margin: 0; padding: 7px 10px; border-radius: 10px; background: rgba(20,22,26,.8); box-shadow: 0 6px 18px rgba(0,0,0,.4); }
  #ppbar .card.you { background: rgba(60,30,95,.88); border: 1px solid #7b46b5; }
  #ppbar .card .who { font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; opacity: .8; margin-bottom: 2px; }
  #ppbar .card .go, #ppbar .next { margin-top: 6px; width: 100%; padding: 8px; border-radius: 8px; border: 0; background: #f2b134; color: #1b1b1b; font: inherit; font-weight: 700; cursor: pointer; }
  #ppbar .next { margin-top: 0; }
  #ppbar .score { margin: 4px 0 0; padding: 0; list-style: none; }
  #ppbar .score li { margin: 0 0 3px; padding-left: 20px; position: relative; }
  #ppbar .score li::before { position: absolute; left: 0; font-weight: 700; }
  #ppbar .score li.good::before { content: "✓"; color: #5fd08f; } #ppbar .score li.bad::before { content: "✗"; color: #ff7b6b; }
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
      el("button", { "data-m": "practice", onclick: () => setMode("practice") }, "Play as Mike"));
    ui.cam = el("div", { class: "seg camseg" },
      el("button", { "data-c": "director", onclick: () => setCam("director") }, "Director camera"),
      el("button", { "data-c": "free", onclick: () => setCam("free") }, "Walk freely"));
    ui.chips = el("div", { class: "chips" });
    scen.steps.forEach((s, i) => ui.chips.append(el("button", { title: s.title, onclick: () => runStep(i, true) }, s.num)));
    ui.step = el("div", { class: "step" });
    ui.part = el("div", { class: "part" });
    ui.card = el("div", { class: "card" });
    ui.cap = el("div", { class: "card cap" });           // who is talking and the words (the card under it is what you do)
    ui.ctl = el("div", { class: "ctl" },
      el("button", { onclick: back, title: "Back a step (B)" }, "◀ Back"),
      el("button", { onclick: replay, title: "Play this step again (R)" }, "⟲ Replay"),
      el("button", { class: "next", onclick: next, title: "Next step (N)" }, "Next step ▶"));
    ui.status = el("div", { class: "status" });
    ui.coach = el("ul");
    const coach = el("details", innerWidth > 720 ? { open: "" } : {}, el("summary", {}, "Coaching: the script's directions"), ui.coach);
    // Three sizes (Jake 2026-10-29: "the menus are so big that they're really blocking a lot of the view ... fix the menus where
    // they fully collapse"): all of it; the line and the buttons; or gone, with a small Menu button at the top and only what needs
    // you (your line and its button, John's words, the score) in a slim bar along the bottom. A phone starts with it gone.
    ui.pp = pp;
    ui.min = el("button", { class: "min", onclick: () => setPanel(panel === "full" ? "mini" : "full") }, "Show all");
    ui.x = el("button", { class: "min", title: "Hide the menu", onclick: () => setPanel("gone") }, "Hide");
    ui.menu = el("button", { id: "ppmenu", onclick: () => setPanel("mini") }, "☰ Menu");
    ui.bar = el("div", { id: "ppbar" });
    ui.dir = el("div", { id: "ppdir", style: "display:none" });
    document.body.append(ui.menu, ui.bar, ui.dir);
    ui.moves = el("div", { class: "mv" });
    ui.who = el("div", { class: "who" });
    for (const [k, c] of Object.entries(scen.people)) ui.who.append(el("button", { "data-w": k, onclick: () => { moveWho = k; render(); } }, c.name));
    for (const [g, list] of Object.entries(MOVES)) {
      const row = el("div", { class: "row" });
      for (const [clip, label] of list) row.append(el("button", { title: clip, onclick: () => tryMove(clip) }, label));
      ui.moves.append(el("h3", {}, g), row);
    }
    const body = el("details", {}, el("summary", {}, "Body language: try a move"), ui.who, ui.moves);
    ui.log = el("ul", { class: "log" });
    const log = el("details", {}, el("summary", {}, "Your scores"), ui.log);
    pp.append(ui.x, ui.min, ui.title, ui.sub, ui.mode, ui.cam, ui.chips, ui.step, ui.part, ui.card, ui.ctl, ui.status, log, coach, body);
    document.body.append(pp);
    setPanel(innerWidth <= 720 ? "mini" : "full");
    addEventListener("keydown", (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const arrows = mode !== "practice";                   // in Practice the arrows walk Mike
      if (e.code === "KeyN" || (arrows && e.code === "ArrowRight")) { next(); e.preventDefault(); }
      else if (e.code === "KeyB" || (arrows && e.code === "ArrowLeft")) { back(); e.preventDefault(); }
      else if (e.code === "KeyR") { replay(); e.preventDefault(); }
      else if (e.code === "Space" && (linePending || pending)) { if (linePending) sayLine(); else said(); e.preventDefault(); e.stopPropagation(); }
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
    // In Practice a finger put down on John is just as often the start of a drag to turn Mike, so there only a tap on him (down and
    // up in place) says your line, and an action never starts from one (it used to: a drag that began on John sent Mike off).
    let tap = null;
    addEventListener("mouseup", (e) => {
      if (!tap) return;
      const t = tap; tap = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 12 && performance.now() - t.at < 450 && linePending) sayLine();
    }, true);
    addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.tagName !== "CANVAS") return;
      const k = personAt(e);
      if (!k) return;
      if (mode === "practice") { tap = { x: e.clientX, y: e.clientY, at: performance.now() }; return; }
      swallow = true; e.stopImmediatePropagation(); e.preventDefault();
      if (linePending && !scen.people[k].tech) sayLine();
      else if (pending && !scen.people[k].tech) said();
      else if (!pending) ui.status.textContent = `${sim.names[k]} is ${sim.current && sim.current.who === k ? "talking" : "listening"}.`;
    }, true);
    for (const t of ["mouseup", "click", "dblclick"]) addEventListener(t, (e) => { if (swallow) { e.stopImmediatePropagation(); if (t !== "mouseup") swallow = false; } }, true);
  }

  // the panel's size; gone, the line card moves into the bar (it is the same card, so everything written to it shows there)
  let panel = "full";
  function setPanel(s) {
    panel = s;
    ui.pp.classList.toggle("mini", s !== "full");
    ui.pp.classList.toggle("gone", s === "gone");
    ui.min.textContent = s === "full" ? "Less" : "Show all";
    ui.menu.style.display = s === "gone" ? "" : "none";
    if (s === "gone") { ui.bar.append(ui.cap, ui.card); ui.bar.style.display = ""; }
    else { ui.pp.insertBefore(ui.card, ui.ctl); ui.pp.insertBefore(ui.cap, ui.card); ui.bar.style.display = "none"; }
    render();
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
    ui.status.textContent = state === "running" ? (pending || linePending ? "Your turn" : "Playing") : state === "done" ? (idx + 1 < scen.steps.length ? "Step done. On to the next." : "That is the end of this run-through.") : state;
  }
  // the words being said, over the card, for the length of the line and a moment more (they used to go on the card itself and
  // wipe out an action waiting there: "Step inside" lost its button the moment Mike said "It's my pleasure")
  let capTimer = null;
  function showLine(ln) {
    ui.cap.replaceChildren(el("div", { class: "who" }, sim.names[ln.who] || ln.who), el("div", {}, ln.text));
    const l = sim.lines[ln.id], dur = (l && l.L && l.L.spoken) || 3;
    clearTimeout(capTimer);
    capTimer = setTimeout(() => ui.cap.replaceChildren(), (dur + 1.5) * 1000);
  }
  // what to do: at the top too, under your line when one waits (Jake 2026-10-30, round 3i: "it didn't actually start the deal.
  // It just had two guys staged at the front door": Play waited at the door for "Shoe covers on", and its button was in the bar
  // at the bottom by the stick, while his eyes were on the top, where his lines come up)
  function showPrompt(text, btn) {
    closeDo();
    ui.doBox = el("div", { id: "ppdo" }, el("div", { class: "who" }, "Do this"), el("div", { class: "line" }, text),
      el("button", { class: "go", onclick: said }, (btn || "Done") + (TOUCH ? "" : "  (Space)")));
    document.body.append(ui.doBox);
    placeSay();
  }
  function closeDo() { if (ui.doBox) { ui.doBox.remove(); ui.doBox = null; } }
  // your line, at the top where it is seen (Jake 2026-10-29: "if I have to say something, I think the top should give me a
  // button, or maybe right there it should say ... what to say, say this"); it can be up while an action waits in the bar
  function showSay(text) {
    closeSay();
    ui.say = el("div", { id: "ppsay" }, el("div", { class: "who" }, "Say this (Mike says it with you)"), el("div", { class: "line" }, "“" + text + "”"),
      el("button", { onclick: sayLine }, "Say it" + (TOUCH ? "  (or tap John)" : "  (Space, or click John)")));
    document.body.append(ui.say);
    placeSay();
  }
  function closeSay() { if (ui.say) { ui.say.remove(); ui.say = null; } }
  // under the score banner when it shows; "Do this" under "Say this" when both wait
  function placeSay() {
    if (!ui.say && !ui.doBox) return;
    const b = document.getElementById("ppfb"), r = b && b.style.display !== "none" ? b.getBoundingClientRect() : null;
    let top = r && r.height ? Math.max(92, r.bottom + 8) : 92;
    if (ui.say) { ui.say.style.top = top + "px"; top += ui.say.getBoundingClientRect().height + 8; }
    if (ui.doBox) ui.doBox.style.top = top + "px";
  }
  const TOUCH = "ontouchstart" in window;
  sim.onLine = (ln) => showLine(ln);

  // Practice: the trainee's turn. A line: "Say this" at the top, Mike turns to John, and "Say it" (Space, or a tap on John) has
  // Mike say it in his own voice, lips and hands (Jake 2026-10-29, playing: "I didn't hear my audio ... does the tech speak? I
  // don't understand when I run it as Mike, like what's supposed to happen there"). You can walk him while he talks. Then John
  // answers. An action (mark = {at, go, then, path}): the card in the bar, a ring on the floor where Mike should be, a marker
  // over it and a trail to it; walk him into it yourself, or tap the button and he goes there (go), then does it (then: shoe
  // covers, sitting down). A line and an action can wait at once (Jake: "there's going to be some talking done while other
  // actions are in fact being done"). o: the line's say() options (move: null when the card goes with it, say).
  // id can be a list: his lines one after another with nothing from John between, on one card and said with one tap, one
  // straight after the other (round 3j, Jake 2026-10-30: "A couple of the lines that the tech says are back to back. They should
  // just flow. You shouldn't have to click every single time."); o is then a list too, one for each.
  sim.prompt = (id, text, btn, mark, o) => new Promise((res, rej) => {
    const ids = [].concat(id || []), ln = ids.length && sim.lines[ids[0]], home = homeowner(), me = techPerson();
    if (ln) {
      showSay(ids.map((k) => sim.lines[k].text).join(" "));
      if (me && home) {
        ctl.talkTo = home;
        if (me.base === "idle_neutral_01" && !me.walking && !me.tasks.length && ((Array.isArray(o) ? o[0] : o) || {}).turn !== false && Math.abs(sim.angleDiff(Math.atan2(home.pos.x - me.pos.x, home.pos.z - me.pos.z), me.heading)) > 0.45)
          me.turnToward(home.pos.x, home.pos.z).catch(() => {});
      }
      linePending = { res, rej, id: ids, o };
      render();
      return;
    }
    showPrompt(text, btn);
    // no ring where he already stands (the check at the sink): the button does it (walking about in a ring he started in did
    // nothing, and looked like it should)
    const there = mark && mark.at && me && Math.hypot(me.pos.x - mark.at[0], me.pos.z - mark.at[2]) < (mark.r || 0.45);
    const ring = mark && mark.at && !there ? ringAt(mark.at, mark.r || 0.45, mark.path) : null;
    pending = { res, rej, mark, ring };
    render();
  });
  let linePending = null;
  async function sayLine() {
    if (!linePending) return;
    const p = linePending; linePending = null;
    closeSay(); render();
    try { for (const [i, k] of p.id.entries()) await sim.say(k, Array.isArray(p.o) ? p.o[i] : p.o); } catch (e) { return p.rej(e); }
    p.res();
  }
  async function said() {
    if (!pending) return;
    const p = pending; pending = null;
    // done with: the card clears (Jake 2026-10-29: "When I clicked back away from the door, that back away from the door screen
    // didn't go away"; it stayed up until the next line)
    ui.card.className = "card"; ui.card.replaceChildren(); closeDo();
    render();
    if (p.mark) {
      // tapped the button: he goes there (unless he is already in the ring) and does it; walked in: he finishes his step into
      // the middle (facing the way he faces, so stepping back he steps back) and does it
      ctl.locked++;
      try {
        const me = techPerson(), mid = p.ring && me ? Math.hypot(me.pos.x - p.ring.x, me.pos.z - p.ring.z) : 0;
        if (p.mark.at && p.mark.go && !inRing(p)) await p.mark.go();
        else if (p.mark.at && mid > 0.12) {
          const back = Math.abs(sim.angleDiff(Math.atan2(p.ring.x - me.pos.x, p.ring.z - me.pos.z), me.heading)) > Math.PI / 2;
          await me.walk([p.mark.at], { speed: 0.45, round: 0, backwards: back });
        }
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
  // Where Mike should go (Jake 2026-10-29, playing: "very, very glitchy trying to like follow through and be [Mike] and like where
  // to step, where to stand"): a ring on the floor (it pulses), a gold arrow standing over it that shows through walls (seen from
  // the end of the driveway, or from the next room), and, given his way there (path), a trail of dots to it from where he is,
  // going as he walks it. markers() runs them, and puts an arrow at the side of the screen when the ring is out of view.
  function ringAt(at, r = 0.45, path = null) {
    const T = sim.T, GOLD = 0xf2b134, grp = new T.Group();
    const ground = (x, z, y) => { const g = sim.groundAt(x, z, y + 0.5); return g === null ? y : g; };
    const y0 = ground(at[0], at[2], at[1]);
    const m = new T.Mesh(new T.RingGeometry(r - 0.06, r, 48), new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(at[0], y0 + 0.02, at[2]);
    m.renderOrder = 5;
    const arrow = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 20), new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    arrow.rotation.x = Math.PI;                              // point down
    arrow.position.set(at[0], y0 + 2.3, at[2]);
    arrow.renderOrder = 20;
    grp.add(m, arrow);
    const dots = [];
    const me = techPerson();
    if (path && path.length && me) {
      // from where he stands to the nearest place on his way, then the rest of the way, to the ring's middle
      let pts = path.map((p) => [p[0], p[2]]), start = [me.pos.x, me.pos.z], from = 0, best = Infinity, near = pts[0];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] * ab[0] + ab[1] * ab[1];
        const t = l2 ? Math.max(0, Math.min(1, ((start[0] - a[0]) * ab[0] + (start[1] - a[1]) * ab[1]) / l2)) : 0;
        const q = [a[0] + ab[0] * t, a[1] + ab[1] * t], d = Math.hypot(q[0] - start[0], q[1] - start[1]);
        if (d < best) { best = d; from = i + 1; near = q; }
      }
      pts = [start, near, ...pts.slice(from)];
      if (Math.hypot(pts[pts.length - 1][0] - at[0], pts[pts.length - 1][1] - at[2]) > 0.05) pts.push([at[0], at[2]]);
      const geo = new T.CircleGeometry(0.085, 16), mat = new T.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthWrite: false });
      let walked = 0, nextAt = 0.7, y = me.pos.y;           // a dot every 0.42 m, the first a little ahead of him
      for (let i = 0; i + 1 < pts.length; i++) {
        const [a, b] = [pts[i], pts[i + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (; len > 0 && nextAt <= walked + len; nextAt += 0.42) {
          const s = (nextAt - walked) / len, x = a[0] + (b[0] - a[0]) * s, z = a[1] + (b[1] - a[1]) * s;
          if (Math.hypot(x - at[0], z - at[2]) < r) continue;
          y = ground(x, z, y);
          const d = new T.Mesh(geo, mat);
          d.rotation.x = -Math.PI / 2; d.position.set(x, y + 0.015, z); d.renderOrder = 5;
          grp.add(d); dots.push(d);
        }
        walked += len;
      }
    }
    window.walk.scene.add(grp);
    const ring = { x: at[0], z: at[2], y0, r, mesh: m, arrow, dots, remove() { if (grp.parent) grp.parent.remove(grp); rings.delete(ring); } };
    rings.add(ring);
    return ring;
  }
  const rings = new Set();
  sim.mark = (at, r, path) => ringAt(at, r, path);
  function markers() {
    placeSay();
    const me = techPerson(), t = performance.now() / 1000, cam = window.walk.camera;
    let goal = null;
    for (const r of rings) {
      goal = r;
      r.mesh.material.opacity = 0.55 + 0.35 * Math.sin(t * 3.8);
      if (!me) continue;
      const d = Math.hypot(me.pos.x - r.x, me.pos.z - r.z);
      r.arrow.position.y = r.y0 + 2.3 + 0.08 * Math.sin(t * 3);
      // it fades as he gets there, and when it is right in front of the camera (a ring behind him, between the two)
      const near = cam.position.distanceTo(r.arrow.position), k = (x) => Math.max(0, Math.min(1, x));
      r.arrow.material.opacity = 0.9 * k((d - 0.7) / 1.2) * k((near - 1.5) / 2);
      for (let i = r.dots.length - 1; i >= 0; i--) {
        if (!r.dots[i].visible || Math.hypot(me.pos.x - r.dots[i].position.x, me.pos.z - r.dots[i].position.z) > 0.55) continue;
        for (let j = 0; j <= i; j++) r.dots[j].visible = false;
        break;
      }
    }
    // the way on out of the picture (the trail a couple of steps ahead, or the newest ring): which way to turn him
    let side = 0;
    if (goal && me && mode === "practice" && Math.hypot(me.pos.x - goal.x, me.pos.z - goal.z) > goal.r) {
      const ahead = goal.dots.filter((d) => d.visible), p = ahead.length ? ahead[Math.min(3, ahead.length - 1)].position : null;
      const v = p ? p.clone().setY(p.y + 0.3).project(cam) : new sim.T.Vector3(goal.x, goal.y0 + 1, goal.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.95) {
        const f = new sim.T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        side = sim.angleDiff(Math.atan2((p ? p.x : goal.x) - cam.position.x, (p ? p.z : goal.z) - cam.position.z), Math.atan2(f.x, f.z)) < 0 ? 1 : -1;
      }
    }
    ui.dir.style.display = side ? "" : "none";
    ui.dir.className = side < 0 ? "l" : "r";
    ui.dir.textContent = side < 0 ? "◀" : "▶";
  }
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
    const pp = panel === "gone" ? ui.bar : document.getElementById("pp"), r = pp.getBoundingClientRect();
    asking.box.style.bottom = (innerWidth <= 720 || panel === "gone" ? innerHeight - r.top + 10 : 18) + "px";
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
  // the step's score: a banner at the top for a few seconds (the run goes straight on into the next step), what went wrong
  // listed under it, and every step's score kept in the panel under "Your scores"
  function showScores(s) {
    if (!scores.length) return;
    const n = scores.filter((x) => x.good).length, misses = scores.filter((x) => !x.good);
    ui.log.append(el("li", {}, `${s.num} ${s.title}: ${n} of ${scores.length}`,
      el("ul", { class: "score" }, ...scores.map((x) => el("li", { class: x.good ? "good" : "bad" }, x.text)))));
    let b = document.getElementById("ppfb");
    if (!b) { b = el("div", { id: "ppfb" }); document.body.append(b); }
    b.className = misses.length ? "bad" : "good";
    b.replaceChildren(el("div", {}, `${s.title}: ${n} of ${scores.length}`), ...(misses.length ? [el("ul", {}, ...misses.map((x) => el("li", {}, x.text)))] : []));
    b.style.display = "";
    clearTimeout(fbTimer);
    fbTimer = setTimeout(() => { b.style.display = "none"; }, 6500);
  }

  // ---------------------------------------------------------------------------------------------------- Mike under your thumbs
  // Practice, two hands (Jake 2026-10-29, on his phone: the round stick was "really sensitive ... the other is just forwards or
  // backwards. That way I can back up easier ... I'm controlling the view"): the stick (or W and S, the up and down arrows) is
  // forwards and backwards only, a gentle curve so a small push is a slow step and all the way up a walk; tapped twice and held
  // (or Shift) he hurries, and the approach counts that as rushing; backwards he steps back facing the way he faces. A finger held and dragged on the view (or the mouse,
  // or A and D, the side arrows) turns him, and the camera with him. He follows the ground (the driveway, the porch steps) and
  // stops at walls, furniture, rails, door leaves and people. The camera sits behind him, steady (it turns with him and never on
  // its own), and pulls in short of walls; for his lines he turns to face John, so John is in view past his head. The wheel or a
  // pinch brings it nearer or further.
  const ctl = sim.control = { enabled: true, locked: 0, running: false, speed: 0, input: { x: 0, y: 0, run: false }, keys: {},
    yaw: 0, pitch: 0.14, dist: 1.6, drag: null, talkTo: null, cam: null, touched: -9, off: 0, offWant: 0, ox: null, pc: null, dcur: null };
  const BUBBLE = 0.95;
  const SHOULDER = 0.36;                                    // the camera's line past his shoulder, sideways from his eyes (m)
  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function controlStep(dt) {
    const me = techPerson();
    if (mode !== "practice" || !me) return;
    const k = ctl.keys;
    let fwdIn = ctl.input.y, turnIn = 0;
    if (k.KeyW || k.ArrowUp) fwdIn += 1; if (k.KeyS || k.ArrowDown) fwdIn -= 1;
    if (k.KeyA || k.ArrowLeft) turnIn += 1; if (k.KeyD || k.ArrowRight) turnIn -= 1;
    fwdIn = Math.max(-1, Math.min(1, fwdIn));
    // his feet are yours only when the scene is not moving him (a scripted walk, the knock, sitting) and he is standing
    const free = ctl.enabled && !ctl.locked && !me.tasks.length && !asking && me.base === "idle_neutral_01";
    // the scene takes him (or a pop-up comes up): he stops there and then, rather than glide on or walk on the spot
    if (!free) { if (ctl.speed) stopWalk(); fwdIn = 0; turnIn = 0; }
    if (fwdIn || turnIn) ctl.touched = sim.clock;
    if (turnIn) { me.heading += turnIn * 1.7 * dt; ctl.yaw += turnIn * 1.7 * dt; }
    // hurrying: Shift, or the stick tapped twice and held (Jake 2026-10-29: "I did not rush ... And it still said I rushed": the
    // stick held at its top for half a second used to hurry him, and that is just where a thumb rests to walk)
    const hurry = fwdIn > 0.1 && (k.ShiftLeft || k.ShiftRight || ctl.input.hurry);
    const T = sim.T;
    const target = fwdIn > 0.02 ? fwdIn * (hurry ? 2.5 : 1.15) : fwdIn < -0.02 ? fwdIn * 0.6 : 0;
    ctl.speed += (target - ctl.speed) * Math.min(1, dt * (target ? 5 : 8));
    if (Math.abs(ctl.speed) < 0.03 && !target) ctl.speed = 0;
    ctl.running = ctl.speed > 1.7;
    const home = homeowner();
    let bumped = false;
    if (ctl.speed) {
      const step = Math.abs(ctl.speed) * dt;
      const fwd = new T.Vector3(Math.sin(me.heading), 0, Math.cos(me.heading)).multiplyScalar(Math.sign(ctl.speed));
      const tryMove = (dir, len) => {
        if (len < 1e-4 || sim.blockedMove(me.pos, dir, len, 0.24, me)) return false;
        const nx = me.pos.x + dir.x * len, nz = me.pos.z + dir.z * len;
        // John's bubble: no nearer than BUBBLE, centre to centre (about 2 feet between them), though he can walk round its edge or
        // away. Jake 2026-10-29: "Tech gets in the personal space of John many times. He needs to follow these body language and
        // spacing things" (the field guide: "Stay about 2 to 3 feet away when standing ... Step inside it too soon and they stop
        // listening and start protecting"). People only stopped him at 0.48 m.
        if (home && home.root.visible) {
          const d1 = Math.hypot(home.pos.x - nx, home.pos.z - nz);
          if (d1 < BUBBLE && d1 < Math.hypot(home.pos.x - me.pos.x, home.pos.z - me.pos.z)) { bumped = true; return false; }
        }
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
      // the walk at his pace, run backwards when he steps back
      me.play("walk_neutral_01", { speed: Math.sign(ctl.speed) * Math.max(0.35, Math.abs(ctl.speed) / (me.walkSpeed || 1.2)) });
      me.sync();
    } else if (me.walking && free) {
      me.walking = false;
      me.play(me.base, { fade: 0.3 });
    }
    // pushed into John's bubble for a moment: said once a step, and it costs the step a point
    ctl.bump = bumped && fwdIn ? (ctl.bump || 0) + dt : 0;
    if (ctl.bump > 0.4 && !ctl.bumpSaid) {
      ctl.bumpSaid = true;
      sim.feedback(false, "Too close. That's John's space: stay about 2 to 3 feet away from him.");
      sim.score("space", false, "Stepped into John's space (stay 2 to 3 feet away)");
    }
    // walked into an action's ring: he stops in it and the action is done (then() runs, as for the button); a ring he starts in
    // waits for the button (he used to have to slow down inside it, and at a walk he went straight through)
    if (pending && pending.ring && free) {
      if (!inRing(pending)) pending.wasOut = true;
      else if (pending.wasOut) { stopWalk(); said(); }
    }
  }
  // an angle eased toward another: rate of the gap per second, no faster than max radians a second
  function easeAngle(cur, want, rate, max, dt) {
    const step = sim.angleDiff(want, cur) * Math.min(1, dt * rate);
    return cur + Math.max(-max * dt, Math.min(max * dt, step));
  }
  function stopWalk() {
    const me = techPerson();
    ctl.speed = 0; ctl.running = false;
    if (me && me.walking && !me.tasks.length) { me.walking = false; me.play(me.base, { fade: 0.3 }); }
  }
  // A view the scene asks for (sim.view(shot)) while Mike stands where he was when it asked: the step's own shot of the two of
  // them (as in Watch it done), glided into, until you walk him off or drag. The foyer once he has stepped in is too narrow for
  // a camera behind him: it swung round in front of him, and as John shut the door it was in the doorway being swept out.
  sim.view = (name) => { const me = techPerson(); ctl.view = name && me && scen.shots[name] ? { name, x: me.pos.x, z: me.pos.z } : null; ctl.lk = null; };
  function viewCam(dt, me) {
    const v = ctl.view, sh = scen.shots[v.name];
    if (ctl.drag || Math.hypot(me.pos.x - v.x, me.pos.z - v.z) > 0.5) { ctl.view = null; ctl.blend = 1; return false; }
    const T = sim.T, P = typeof sh.pos === "function" ? sh.pos(sim) : sh.pos, at = new T.Vector3(...P), look = sh.look(sim);
    const k = Math.min(1, dt * 1.8);
    // from far off (behind him out on the porch, as he steps in) it cuts to the shot, as a shot change does; from near, it glides
    // (gliding from the porch it passed between the two of them and its aim spun round)
    if (!ctl.lk && ctl.cam && ctl.cam.distanceTo(at) > 2) { ctl.cam = at.clone(); ctl.lk = look.clone(); }
    if (!ctl.cam || !dt) ctl.cam = at.clone(); else ctl.cam.lerp(at, k);
    if (!ctl.lk && ctl.cam && dt) {
      const c = window.walk.camera, f = new T.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      ctl.lk = c.position.clone().addScaledVector(f, Math.max(1, c.position.distanceTo(look)));
    }
    if (!ctl.lk || !dt) ctl.lk = look.clone(); else ctl.lk.lerp(look, Math.min(1, dt * 2.2));
    sim.setCam(ctl.cam.x, ctl.cam.y, ctl.cam.z, ctl.lk.x, ctl.lk.y, ctl.lk.z);
    // ready to hand back: the follow picks up from here, looking the way the shot looks
    ctl.yaw = Math.atan2(ctl.lk.x - ctl.cam.x, ctl.lk.z - ctl.cam.z); ctl.off = ctl.offWant = 0; ctl.dcur = null;
    return true;
  }
  // Round 3p (Jake 2026-10-31: "the camera angle is maybe a little exaggerated from where we were before to where we are now. Like,
  // it needs to be over so that like both people can be seen. It's kind of okay to do it from a side perspective, but just mostly
  // from ... the technician's angle ... I should still be able to see both people completely"): standing with John and not walking,
  // the camera eases out from close over his shoulder to a two-shot: off the line between them on Mike's side at 35 to 70 degrees,
  // back far enough for the two of them head to foot where the room allows, aimed between them; the side it is on kept while it
  // stays clear (walls, the doors, tall furniture; glass does not hide anyone). Returns false where no place sees them both.
  function twoShot(dt, me, home) {
    const T = sim.T, cam = window.walk.camera;
    const a = me.pos, b = home.pos, d = new T.Vector3().subVectors(b, a).setY(0), sep = d.length();
    if (sep < 0.3) return false;
    d.normalize();
    const side = new T.Vector3(-d.z, 0, d.x), mid = a.clone().lerp(b, 0.42).setY(Math.min(a.y, b.y) + 0.95);
    const vh = Math.tan(cam.fov * Math.PI / 360), hh = vh * cam.aspect;
    // (both whole: 2 m tall in the height of the view at the further one, and the two of them across its width)
    const want = Math.min(3.4, Math.max(1.05 / vh + sep * 0.45, (sep * 0.5 + 0.55) / hh));
    const opaque = (x) => !x.object.material || ![].concat(x.object.material).some((m) => m.transparent);
    const clearTo = (from, to) => { const v = to.clone().sub(from), len = v.length(); return !new T.Raycaster(from, v.normalize(), 0.05, len - 0.12).intersectObjects(walls(), false).some(opaque); };
    const place = (ang, dist) => mid.clone().addScaledVector(d, -Math.cos(ang) * dist).addScaledVector(side, Math.sin(ang) * dist).add(new T.Vector3(0, 0.6, 0));
    const ok = (p) => clearTo(mid, p.clone().addScaledVector(p.clone().sub(mid).normalize(), 0.3)) && clearTo(p, me.eyes()) && clearTo(p, home.eyes()) && clearTo(p, home.pos.clone().setY(home.pos.y + 0.5));
    const sg0 = ctl.ts || 1, tries = [];
    for (const sg of [sg0, -sg0]) for (const ang of [0.62, 0.85, 1.1]) for (const k of [1, 0.8, 0.62]) tries.push([sg * ang, want * k]);
    let pick = null;
    for (const [ang, dist] of tries) { const p = place(ang, dist); if (ok(p)) { pick = p; ctl.ts = Math.sign(ang); break; } }
    if (!pick) return false;
    if (!ctl.cam || !dt) ctl.cam = pick.clone(); else ctl.cam.lerp(pick, Math.min(1, dt * 1.6));
    if (!ctl.lk || !dt) ctl.lk = mid.clone(); else ctl.lk.lerp(mid, Math.min(1, dt * 2.2));
    sim.setCam(ctl.cam.x, ctl.cam.y, ctl.cam.z, ctl.lk.x, ctl.lk.y, ctl.lk.z);
    // handed back to the follow from here when he walks off or you drag
    ctl.yaw = Math.atan2(ctl.lk.x - ctl.cam.x, ctl.lk.z - ctl.cam.z); ctl.off = ctl.offWant = 0; ctl.dcur = null; ctl.blend = 1;
    return true;
  }
  function followCam(dt) {
    const me = techPerson(), T = sim.T;
    if (!me) return;
    if (ctl.view && viewCam(dt, me)) return;
    const moving = Math.abs(ctl.speed) > 0.2 || me.walking;
    const home = homeowner();
    const yours = sim.clock - ctl.touched < 2.5;            // you have had your hands on it just now: the view is yours
    const talking = home && home.root.visible && !moving && !yours && Math.hypot(home.pos.x - me.pos.x, home.pos.z - me.pos.z) < 3.2;
    if (talking && !ctl.drag && twoShot(dt, me, home)) return;
    if (!ctl.drag) {
      // behind him, a little off to one side (so whoever he faces is past his head, not hidden behind it), and that is all: it
      // turns with him and never on its own. Jake 2026-10-29: "The camera bounces even though we are in first person. It should
      // be steady." Standing near John it used to swing round to aim at John, after him every time he moved (40 degrees, and 1.7 m
      // sideways, while Mike stood still at the door), and back behind Mike every time he took a step. Where you turn him (a drag)
      // the view is set with him; a turn the scene gives him (to face John for a line) it eases after. (Round 3j: it looks the way
      // he faces, from over his shoulder, below; it used to be turned a little off to one side for the same end.)
      const want = me.heading;
      ctl.yaw0 = ctl.yaw;
      ctl.yaw = !dt ? want : easeAngle(ctl.yaw, want, moving || yours ? 2.6 : 1.2, 1.6, dt);
    }
    // Where it hangs from, steady: his feet's mark, which glides as he walks, at his eye height, the ground's steps and stairs taken
    // as a ramp. Not his head (until round 3h): that bobs and surges with every step and sways with every gesture and nod, and
    // the camera rode all of it. His head counts only for a change of posture, sitting or crouching: past a band of a few
    // centimetres it is followed, and inside it there is only a slow drift back over seconds.
    const e = me.eyes(), mp = me.pos;
    if (ctl.ox == null || !dt || Math.hypot(mp.x - ctl.mx, mp.z - ctl.mz) > 1) { ctl.ox = e.x - mp.x; ctl.oy = e.y - mp.y; ctl.oz = e.z - mp.z; ctl.gy = mp.y; }
    else {
      // a hop of his mark (sitting down moves it 0.47 m back under him at the end, standing up forward) goes into the offset, so
      // the camera does not hop with it
      const jx = mp.x - ctl.mx, jz = mp.z - ctl.mz;
      if (Math.hypot(jx, jz) > Math.max(0.1, 3.5 * dt)) { ctl.ox -= jx; ctl.oz -= jz; }
      ctl.gy += (mp.y - ctl.gy) * Math.min(1, dt * 4);
      const band = (d, b) => { const a = Math.abs(d); return (a > b ? Math.sign(d) * (a - b) * Math.min(1, dt * 3) : 0) + d * Math.min(1, dt * 0.3); };
      const dx = e.x - mp.x - ctl.ox, dz = e.z - mp.z - ctl.oz, dh = Math.hypot(dx, dz);
      if (dh > 1e-6) { const m = band(dh, 0.15) / dh; ctl.ox += dx * m; ctl.oz += dz * m; }
      ctl.oy += band(e.y - mp.y - ctl.oy, 0.08);
    }
    ctl.mx = mp.x; ctl.mz = mp.z;
    const eye = new T.Vector3(mp.x + ctl.ox, ctl.gy + ctl.oy + 0.02, mp.z + ctl.oz);
    for (const dr of window.walk.doors) dr.updateMatrixWorld(true);       // where each door stands now, not at the last frame drawn
    // Over his shoulder (round 3j, Jake 2026-10-30: "it should be maybe a little bit more over the technician's shoulder so it can
    // be seen a little bit more from that perspective"): the camera's line runs past his right shoulder, nearer and lower than it
    // was (2.5 m back and well up, it looked down from the room's corner, and his back hid what his hands did: "I couldn't even see
    // that handoff"); past his left one when a wall is close on his right. Everything below works from that point (head).
    const rgt = new T.Vector3(-Math.cos(ctl.yaw), 0, Math.sin(ctl.yaw)), bk = new T.Vector3(-Math.sin(ctl.yaw), 0, -Math.cos(ctl.yaw));
    const near = (d) => new T.Raycaster(eye, d, 0, SHOULDER + 0.3).intersectObjects(walls(), false).length > 0;
    // and while he talks to John, a shoulder John can be seen past (by the sofa the kitchen wall stood between the camera over his
    // right shoulder and John: Jake, "I'm halfway in the wall when John's talking here")
    const solid = (x) => !x.object.material || ![].concat(x.object.material).some((m) => m.transparent);
    const seen = (sg) => {
      if (!talking) return true;
      const from = eye.clone().addScaledVector(rgt, sg * SHOULDER).addScaledVector(bk, Math.min(ctl.dist, 1.2)).add(new T.Vector3(0, 0.2, 0));
      const to = home.eyes().sub(from), len = to.length();
      return !new T.Raycaster(from, to.normalize(), 0.05, len - 0.15).intersectObjects(walls(), false).some(solid);
    };
    const ok = (sg) => !near(rgt.clone().multiplyScalar(sg)) && seen(sg);
    const was = ctl.side || 1;
    ctl.side = ok(was) ? was : ok(-was) ? -was : ok(1) ? 1 : was;
    ctl.sh = ctl.sh == null || !dt ? ctl.side * SHOULDER : ctl.sh + Math.max(-dt * 0.9, Math.min(dt * 0.9, ctl.side * SHOULDER - ctl.sh));
    const head = eye.clone().addScaledVector(rgt, ctl.sh);
    // under a ceiling (the porch's is 2.4 m, the house's 2.74) the camera comes down rather than look through it
    const up = new T.Raycaster(head, new T.Vector3(0, 1, 0), 0, 2).intersectObjects(walls(), false)[0];
    let pitch = ctl.pitch;
    if (up) pitch = Math.min(pitch, Math.asin(Math.max(0, Math.min(1, (up.distance - 0.3) / ctl.dist))));
    ctl.pc = ctl.pc == null || !dt || ctl.drag ? pitch : ctl.pc + (pitch - ctl.pc) * Math.min(1, dt * (pitch < ctl.pc ? 6 : 1.5));
    pitch = ctl.pc;
    // how far the camera can sit back along a direction before a wall; where that is too close (his back to the sink, the wall
    // behind his chair) it swings round to the nearest clear side rather than sit inside his head
    const room = (yaw) => {
      const back = new T.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const hit = new T.Raycaster(head, back, 0, ctl.dist + 0.25).intersectObjects(walls(), false)[0];
      // (no nearer than 0.2 m: it used to stop at 0.55 whatever was there, and with a wall 0.4 m behind him it sat in the wall: Jake
      // 2026-10-30, by the sofa, "I'm halfway in the wall when John's talking here")
      return [hit ? Math.max(0.2, hit.distance - 0.22) : ctl.dist, back];
    };
    // and while he talks to John, John must be in sight from there: nothing (a wall, the open door, a doorframe) between the
    // camera and John's face (Jake 2026-10-29: "it had like me stuck behind the door. I couldn't see the other person")
    // (glass does not hide him). Mike's own head no longer counts (round 3h): the view is set off to one side of him for that,
    // and looking round his head swung the camera 17 degrees each time John stepped in line with him, then back.
    // (only John in front of Mike, and in Mike's own sight: one behind the closed front door, or beside or behind him, is not looked
    // round for; the camera went looking for him through the window as he came up the hall)
    let eyes = talking && Math.abs(sim.angleDiff(Math.atan2(home.pos.x - me.pos.x, home.pos.z - me.pos.z), me.heading)) < 1.2 ? home.eyes() : null;
    const opaque = (x) => !x.object.material || ![].concat(x.object.material).some((m) => m.transparent);
    if (eyes) { const to = eyes.clone().sub(head), len = to.length(); if (new T.Raycaster(head, to.normalize(), 0.05, len - 0.15).intersectObjects(walls(), false).some(opaque)) eyes = null; }
    const sees = (b, dd) => {
      if (!eyes) return true;
      const from = head.clone().addScaledVector(b, dd), to = eyes.clone().sub(from), len = to.length();
      return !new T.Raycaster(from, to.normalize(), 0.05, len - 0.15).intersectObjects(walls(), false).some(opaque);
    };
    // The swing to a clear side is held while it stays clear and eases in and out (it used to be looked for afresh every frame,
    // so beside a post or a doorframe it flicked from one side to the other); straight behind him is taken back once it is clear
    // with room to spare. While you drag, the view is yours.
    const need = Math.min(ctl.dist, 1.5);
    // (the clear place nearest to straight behind him, leaning to the side it is on now, at 90 degrees a second at most; with
    // his back to a wall, the foyer's after he steps in, that is over his shoulder from the open side, not round in front of
    // him, where the stick would walk him at the camera)
    const clear = (off, spare = 0, john = true) => { const [d2, b2] = room(ctl.yaw + off); return d2 >= need + spare && (!john || sees(b2, d2)); };
    // A wall too near behind him moves it at once; John out of sight only once he has been for a second and a half (round 3h: the
    // front door swinging open passed between them, and the camera ducked out round it and back in two seconds)
    if (ctl.drag) { ctl.offWant = 0; ctl.hid = 0; }
    else if (ctl.offWant && clear(0, 0.25)) { ctl.offWant = 0; ctl.hid = 0; }
    else if (!clear(ctl.offWant)) {
      const walled = !clear(ctl.offWant, 0, false);
      ctl.hid = walled ? 0 : (ctl.hid || 0) + dt;
      if (walled || ctl.hid > 1.5) {
        const cost = (o) => Math.abs(o) + 0.3 * Math.abs(o - ctl.off);
        const offs = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.8, -1.8, 2.4, -2.4].sort((a, b) => cost(a) - cost(b));
        ctl.offWant = offs.find((o) => clear(o)) ?? offs.find((o) => clear(o, 0, false)) ?? 0;
        ctl.hid = 0;
      }
    } else ctl.hid = 0;
    const off0 = ctl.off;
    ctl.off = !dt ? ctl.offWant : ctl.off + Math.max(-1.6 * dt, Math.min(1.6 * dt, (ctl.offWant - ctl.off) * Math.min(1, dt * 2.5)));
    // the two together no faster than 90 degrees a second (each was capped, and they added up to 180 when both went one way)
    if (dt && !ctl.drag && ctl.yaw0 != null) {
      const auto = sim.angleDiff(ctl.yaw, ctl.yaw0) + (ctl.off - off0), cap = 1.6 * dt;
      if (Math.abs(auto) > cap) { const k = cap / Math.abs(auto); ctl.yaw = ctl.yaw0 + sim.angleDiff(ctl.yaw, ctl.yaw0) * k; ctl.off = off0 + (ctl.off - off0) * k; }
    }
    ctl.yaw0 = null;
    const yaw = ctl.yaw + ctl.off, [d, back] = room(yaw);
    // how far back: in quickly (5 m/s), to keep out of a wall; out again slowly (no popping in and out under the porch roof or
    // past a post)
    ctl.dcur = ctl.dcur == null || !dt ? d : d < ctl.dcur ? Math.max(d, ctl.dcur - 5 * dt) : ctl.dcur + (d - ctl.dcur) * Math.min(1, dt * 1.5);
    const want = head.clone().addScaledVector(back, ctl.dcur);
    ctl.blend = Math.max(0, (ctl.blend || 0) - dt / 1.2);
    if (!ctl.cam || !dt) ctl.cam = want.clone(); else ctl.cam.lerp(want, Math.min(1, dt * (14 - 12 * ctl.blend)));
    let look = head.clone().add(new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.8)).setY(head.y - 0.2);
    // just handed back from a scene's view: the aim eases over from the shot's too
    if (ctl.blend > 0 && ctl.lk) { ctl.lk.lerp(look, Math.min(1, dt * (14 - 12 * ctl.blend))); look = ctl.lk; } else ctl.lk = null;
    sim.setCam(ctl.cam.x, ctl.cam.y, ctl.cam.z, look.x, look.y, look.z);
  }
  let wallMeshes = null;
  // what the camera keeps out of: walls, windows, ceilings, the doors (where they stand now), the porch's posts and beam, and
  // anything tall (the fridge, the upper cabinets, a bookcase), so it never sits inside or behind them
  const walls = () => wallMeshes || (wallMeshes = (() => {
    const a = [], box = new sim.T.Box3();
    window.walk.scene.traverse((o) => { if (o.isMesh && /^(col_|win_|wall_|ext_|roof_|ceil|trim_porch|fix_beam|fix_column)/.test(o.name)) a.push(o); });
    // tall furniture and fixtures whole: a group's meshes carry their own names (the van in the driveway is fix_van_driveway, its
    // parts "Cylinder113" and so on, and the camera sat inside it, 2026-10-29)
    window.walk.scene.traverse((o) => {
      if (!/^(furn_|fix_)/.test(o.name) || !o.visible || (o.parent && /^(furn_|fix_)/.test(o.parent.name))) return;
      if (box.setFromObject(o).max.y > 1.5 && box.max.y - box.min.y > 0.5) o.traverse((m) => { if (m.isMesh && !a.includes(m)) a.push(m); });
    });
    for (const d of window.walk.doors) d.traverse((o) => { if (o.isMesh) a.push(o); });
    return a;
  })());
  function controlInput() {
    // the keys and the mouse are Mike's in Practice, not walk.js's (it would walk the camera and turn it under the follow)
    addEventListener("keydown", (e) => { if (mode !== "practice" || !MOVE_KEYS.has(e.code) || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; ctl.keys[e.code] = true; e.stopImmediatePropagation(); e.preventDefault(); }, true);
    addEventListener("keyup", (e) => { if (!MOVE_KEYS.has(e.code)) return; ctl.keys[e.code] = false; if (mode === "practice") e.stopImmediatePropagation(); }, true);
    addEventListener("blur", () => { ctl.keys = {}; });
    addEventListener("mousedown", (e) => {
      if (mode !== "practice" || e.button !== 0 || e.target.tagName !== "CANVAS") return;
      ctl.drag = { x: e.clientX, y: e.clientY, sx: 0, sy: 0 }; e.stopImmediatePropagation(); e.preventDefault();
    }, true);
    // a drag turns Mike and the view with him (while the scene has him busy, the view alone); up and down tilts the view
    addEventListener("mousemove", (e) => {
      if (!ctl.drag || mode !== "practice") return;
      const dx = e.clientX - ctl.drag.x, dy = e.clientY - ctl.drag.y, turn = -dx * (TOUCH ? 0.0045 : 0.005), me = techPerson();
      const free = me && ctl.enabled && !ctl.locked && !me.tasks.length && !asking && me.base === "idle_neutral_01";
      // the view turns by as much as he does (set to his heading, it jumped when the view had gone round to John)
      if (free) { me.heading += turn; me.sync(); }
      ctl.yaw += turn;
      // the tilt only from a drag that is mostly up and down (a thumb turning him drifts up or down and tipped the view)
      const sx = ctl.drag.sx + Math.abs(dx), sy = ctl.drag.sy + Math.abs(dy);
      if (sy > 1.5 * sx) ctl.pitch = Math.max(0, Math.min(0.85, ctl.pitch + dy * 0.004));
      ctl.touched = sim.clock;
      ctl.drag = { x: e.clientX, y: e.clientY, sx, sy }; e.stopImmediatePropagation();
    }, true);
    addEventListener("mouseup", (e) => { if (!ctl.drag) return; ctl.drag = null; if (mode === "practice") { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    addEventListener("click", (e) => { if (mode === "practice" && e.target.tagName === "CANVAS") e.stopImmediatePropagation(); }, true);
    addEventListener("wheel", (e) => { if (mode !== "practice" || e.target.tagName !== "CANVAS") return; ctl.dist = Math.max(1.4, Math.min(6, ctl.dist * (e.deltaY > 0 ? 1.1 : 0.9))); e.stopImmediatePropagation(); e.preventDefault(); }, { capture: true, passive: false });
  }

  // ---------------------------------------------------------------------------------------------------- steps
  async function runStep(i, snap) {
    if (pending) { if (pending.ring) pending.ring.remove(); pending.rej(new sim.Cancelled()); pending = null; }
    closeDo();
    if (linePending) { closeSay(); linePending.rej(new sim.Cancelled()); linePending = null; }
    if (asking) { const a = asking; closeAsk(); a.rej(new sim.Cancelled()); }
    for (const r of [...rings]) r.remove();
    sim.cancelAll();
    const my = ++runId;
    idx = i;
    const s = scen.steps[i];
    scores = [];
    ctl.enabled = true; ctl.locked = 0; ctl.speed = 0; ctl.talkTo = null; ctl.bump = 0; ctl.bumpSaid = false;
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
    if (state !== "done") return;
    showScores(s);
    // the run flows on (Jake 2026-10-29: the cadence "shouldn't wait, step"; "Come on in" ended S2 and the shoe covers waited for
    // a Next step button): the next step starts from where everyone is, after a breath
    if (idx + 1 < scen.steps.length) {
      try { await sim.wait(0.8); } catch (e) { return; }
      if (my === runId && state === "done") runStep(idx + 1, false);
    } else if (ui.log.children.length) {
      // the end of the run: every step's score on the card
      ui.card.className = "card you";
      ui.card.replaceChildren(el("div", { class: "who" }, "The end of the run-through"), ...[...ui.log.children].map((li) => el("div", {}, li.firstChild.textContent)));
    }
  }
  function next() { if (idx + 1 < scen.steps.length) runStep(idx + 1, state !== "done"); }
  function back() { runStep(Math.max(0, idx - (state === "running" ? 0 : 1)), true); }
  function replay() { runStep(idx, true); }

  // in practice mode the camera starts each step behind Mike, where the step puts him
  function placeTrainee() {
    if (mode !== "practice") return;
    const t = techPerson();
    if (!t) return;
    ctl.yaw = t.heading; ctl.pitch = 0.14; ctl.cam = null; ctl.sh = null; ctl.side = 1; ctl.off = ctl.offWant = 0; ctl.ox = ctl.pc = ctl.dcur = null; ctl.view = null;
    followCam(0);
  }
  function applyMode() {
    const t = techPerson();
    if (t) { t.root.visible = true; t.face.enabled = true; }
    sim.practice = mode === "practice";
    sim.freeCamera = mode === "practice" || camMode === "free";
    if (mode === "practice") { window.walk.setFly(true); sim.camera.follow = (dt) => { controlStep(dt); followCam(dt); markers(); }; }
    else if (sim.freeCamera) sim.freeCam();
    if (mode !== "practice") ui.dir.style.display = "none";
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
    if (!p.gesture(clip, Math.max(3, c.duration), { full: true })) ui.status.textContent = /^sit_/.test(clip) ? "That one is for sitting down." : "That one is for standing up.";
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
    const place = () => { const r = pp.getBoundingClientRect(); stick.style.bottom = (innerWidth <= 720 && panel !== "gone" ? innerHeight - r.top + 10 : 12) + "px"; stick.style.display = asking ? "none" : ""; placeAsk(); };
    place(); setInterval(place, 300);
    const held = {};
    const key = (code, on) => {
      if (!!held[code] === on) return;
      held[code] = on;
      document.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code, key: code, bubbles: true }));
    };
    let sid = null, cx = 0, cy = 0;
    // forwards and backwards only (an upright pill); a gentle curve, so a small push is a slow step and all the way up a walk; a
    // second touch straight after letting go, held, hurries him (the knob turns red)
    const R = 44;
    let lastEnd = -1e9;
    const setStick = (dx, dy) => {
      dy = Math.max(-R, Math.min(R, dy));
      knob.style.transform = `translate(0px,${dy}px)`;
      const y = -dy / R, a = Math.abs(y), v = a < 0.15 ? 0 : Math.sign(y) * Math.pow((a - 0.15) / 0.85, 1.4);
      if (mode === "practice") {
        ctl.input.x = 0; ctl.input.y = v; ctl.input.run = false;
        if (v) ctl.touched = sim.clock;
        key("KeyW", false); key("KeyS", false); key("ShiftLeft", false);
        return;
      }
      ctl.input.x = ctl.input.y = 0; ctl.input.run = false;
      key("KeyW", y > 0.25); key("KeyS", y < -0.25); key("ShiftLeft", a > 0.9);
      if (window.walk.setTurn) window.walk.setTurn(0);
    };
    stick.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = stick.getBoundingClientRect();
      sid = t.identifier; cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      ctl.input.hurry = performance.now() - lastEnd < 350;
      stick.classList.toggle("hurry", ctl.input.hurry);
      setStick(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    stick.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === sid) setStick(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    const stickEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        sid = null; setStick(0, 0);
        lastEnd = ctl.input.hurry ? -1e9 : performance.now(); ctl.input.hurry = false; stick.classList.remove("hurry");
      }
    };
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
    // Everything comes down before Start (Jake 2026-10-29: "it should load the entire thing. And then starts me out."). walk.js
    // lets you in as soon as the house's shell is up and brings the furniture, the framing, the pipes and the equipment in behind
    // you, and the equipment only as you walk near it; it also picks which way each door swings at the very end, so a game
    // started early had the front door open out onto the porch. So: the house to its "ready", then every model that would have
    // loaded on the way, with John and Mike coming down alongside. The button says how far it has got.
    const stepped = qs.get("stepped") === "1";              // the preview pane: steps driven by hand, no start button
    const goBtn = el("button", { disabled: "" }, "Loading the house…");
    const go = el("div", { id: "ppstart" }, goBtn);
    if (!stepped) document.body.append(go);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (!window.walk || !window.walk.scene) await sleep(300);
    addEventListener("unhandledrejection", (e) => { if (e.reason instanceof sim.Cancelled) e.preventDefault(); });
    let houseText = "Loading the house…", peopleText = "", peopleDone = false;
    const show = () => { goBtn.textContent = [houseText, peopleDone ? "" : peopleText].filter(Boolean).join("  ·  "); };
    const people = (async () => { while (!document.getElementById("status")) await sleep(100); peopleText = "John and Mike…"; show(); await sim.loadScenario(NAME); peopleDone = true; show(); })();
    const status = document.getElementById("status");
    for (;;) {
      const s = status ? status.textContent : "ready";
      if (/^ready/.test(s)) break;
      if (/^error/.test(s)) { houseText = "The house could not load. Reload the page."; show(); return; }
      houseText = /house is up/.test(s) ? "Loading the furniture and the pipes…" : "Loading the house…"; show();
      await sleep(300);
    }
    const total = window.walk.pending(), all = window.walk.loadAll();
    while (window.walk.pending() > 0) { houseText = `Loading the equipment… ${total - window.walk.pending()} of ${total}`; show(); await sleep(300); }
    await all;
    houseText = "The house is in"; show();
    await people;
    scen = sim.scenario;
    try { directions = await (await fetch(sim.url("sim/lines/script_v2_steps.json"))).json(); } catch (e) { directions = {}; }
    build();
    controlInput();
    touchControls();
    scen.steps[0].start(sim);
    render();
    window.player = { runStep, next, back, replay, setMode, setCam, said, tryMove, get idx() { return idx; }, get state() { return state; }, get pending() { return !!pending || !!linePending; }, get line() { return linePending && linePending.id.join("+"); } };
    if (stepped) return;
    sim.live(true);
    // two ways in, on the Start screen itself (on a phone the panel starts folded, and Jake never found Practice behind "Show all":
    // "I still have no control ... I guess that's the way it's supposed to be")
    const begin = (m) => { sim.unlockAudio(); go.remove(); mode = m; camMode = m === "practice" ? "free" : "director"; if (innerWidth <= 720) setPanel("gone"); runStep(0, true); };
    goBtn.textContent = "Play as Mike"; goBtn.disabled = false; goBtn.onclick = () => begin("practice");
    go.append(el("button", { class: "alt", onclick: () => begin("watch") }, "Watch it done"),
      el("small", {}, (TOUCH ? "Play: you are Mike. The stick walks him forwards and back, a drag on the picture turns him." : "Play: you are Mike. W and S walk him, A and D or a drag turn him, Shift hurries.")
        + " Walk to the gold arrow and its ring. When it is your turn to talk, your line comes up: tap Say it and Mike says it (say it along with him to learn it)."));
  }
  boot();
})();
