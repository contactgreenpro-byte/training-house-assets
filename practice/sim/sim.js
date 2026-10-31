// The practice run-through: homeowners (and a uniformed technician for coaching) living in the training house.
// research/practice_sim_in_house.md is the plan. This file runs ON TOP of the house's own walk.js (three r128, window.walk):
// it never changes walk.js, it adds people to walk's scene and moves them along the house's own waypoints.
//
// Loaded by the test page /house/sim.html (the house's index.html with face.js, this file and player.js added, served by
// sim/serve.py). Everything is in walk.js's world: metres, +y up, the front of the house towards +z. A person faces +z
// at heading 0; heading h faces (sin h, 0, cos h).
//
// Two ways to run: live (a real browser: sim.live() steps every animation frame and plays the voices) and stepped (the
// hidden preview pane, which has no animation frames: sim.step(dt) and walk.snap() per frame, sim.record()).
(function () {
  "use strict";
  const T = THREE;
  const BASE = (document.currentScript && document.currentScript.src.replace(/sim\/sim\.js.*$/, "")) || "/";
  // The published copy (on the training house site) lists every game file with a short hash in files.json, so a changed file is
  // fetched fresh (the site caches for ten minutes) and an unchanged one comes from the phone's cache. Locally there is no list.
  let files = null;
  async function fileList() {
    if (files) return files;
    try { const r = await fetch(`${BASE}files.json?t=${Date.now()}`, { cache: "no-store" }); files = r.ok ? await r.json() : {}; } catch (e) { files = {}; }
    return files;
  }
  const url = (p) => BASE + p + (files && files[p] ? "?v=" + files[p] : "");

  // ---------------------------------------------------------------------------------------------------- people
  // Clip names: rocketbox_to_glb.py strips m_ / m_gestic_ for men, women keep f_; the move packs (rocketbox_moves.py)
  // strip both. A man's and a woman's clip share one name here.
  const clipKey = (n) => n.replace(/^[mf]_/, "").replace(/^gestic_/, "").replace(/[- ]/g, "_");
  const FADE = 0.25;
  const SIT_BACK = 0.462;   // sit_down_chair_01 ends with the hips this far behind where he stood (clip units; times the person's scale)
  const STAND_FWD = 0.4225; // sit_stand_up_chair_01 ends with the hips this far in front of the seat
  class Cancelled extends Error {}

  // three's mixer writes a bone only when its value has changed since the frame before (PropertyMixer.apply). For the people
  // that went wrong twice over (2026-10-29, Jake at the front door: heads wound round, arms out, backs bent): a bone turned on
  // top of the clip (the face's head steering, a reaching arm) stayed turned wherever the clip held it still, and after a step
  // jump (stopAllAction puts every bone back to the pose it had when first bound, the arms-out T pose) a bone the next clip
  // holds still stayed in that T pose. So for the people's mixers every bone is written every frame: r128's apply without its
  // "has it changed" test. Everything else in the house (walk.js's appliances) keeps three's own behaviour.
  const PM = T.PropertyMixer && T.PropertyMixer.prototype;
  if (PM && !PM.__simAlways) {
    const apply = PM.apply;
    PM.apply = function (accuIndex) {
      const root = this.binding && this.binding.rootNode;
      if (!root || !root.userData || !root.userData.simPerson) return apply.call(this, accuIndex);
      const stride = this.valueSize, buffer = this.buffer, offset = accuIndex * stride + stride;
      const weight = this.cumulativeWeight, weightAdditive = this.cumulativeWeightAdditive;
      this.cumulativeWeight = 0; this.cumulativeWeightAdditive = 0;
      if (weight < 1) this._mixBufferRegion(buffer, offset, stride * this._origIndex, 1 - weight, stride);
      if (weightAdditive > 0) this._mixBufferRegionAdditive(buffer, offset, this._addIndex * stride, 1, stride);
      this.binding.setValue(buffer, offset);
    };
    PM.__simAlways = true;
  }
  // stretches of the long talking takes where a hand goes up to the head (measured: hand above the neck); a line's
  // gesture starts clear of them, so a technician never scratches his head mid-sentence unless asked to
  const FIDGETS = { talk_neutral_03: [[37.3, 38.6], [59.4, 60.3]], talk_self_assured_01: [[13.7, 13.8]] };
  // the bones a talking move keeps once it is laid over a stand (overlay): from the waist up
  const UPPER = /^Bip01_(Spine\d?|Neck|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+))$/;

  class Person {
    constructor(name, gltf, height) {
      this.name = name;
      this.root = gltf.scene;
      this.root.name = "sim_" + name;
      this.root.userData.simPerson = true;                 // its mixer writes every bone every frame (PM.apply above)
      this.root.traverse((o) => {
        if (o.isSkinnedMesh) o.frustumCulled = false;     // r128 culls a skinned mesh by its bind-space sphere
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        if (o.isBone && /Finger/.test(o.name)) o.userData.rest = o.quaternion.clone();     // the hand open and flat (grip abs)
      });
      this.mixer = new T.AnimationMixer(this.root);
      this.clips = {};
      this.addClips(gltf.animations);
      this.action = null;
      this.heading = 0;
      this.pos = new T.Vector3();
      this.tasks = [];                                    // awaited per-step updaters {fn, res, rej}
      this.ticks = [];                                    // fire-and-forget updaters
      this.scaleTo = height;
      this.base = "idle_neutral_01";                      // the pose a gesture returns to (a seated idle once seated)
      this.gtok = 0;
      this.walking = false;
      this.kept = new Map();                              // bones turned on top of the clip this frame (keep)
      this.keptPos = new Map();                           // and moved (keepPos)
      this.posers = [];                                   // run after the clip each frame: reaching arms (reach)
      this.solids = [];                                   // what his fingers may not go into (keepFingersOut)
      // his trunk and head solid to his own arms (keepArmsOut). Round 3p: on for both of them all the time (it was the sink check
      // only, as turned on everywhere it moved the carried clipboard 20 cm; the arms holding things are pinned now, so only their
      // elbows swing out): page turns with the guide nearer him, a talking move's hand, the clipboard through a 180 degree turn went
      // 5 to 17 cm in
      this.selfSolid = true;
    }
    // body clips only: the face bones are the face's (face.js)
    addClips(anims) { for (const c of anims) this.clips[clipKey(c.name)] = window.SimFace.bodyOnly(c); }
    act(name) { return this.mixer.clipAction(this.clips[name]); }
    // crossfade to a clip; loop or once (held on its last frame)
    play(name, { loop = true, fade = FADE, speed = 1, from = 0 } = {}) {
      if (!this.clips[name]) throw new Error(`${this.name} has no clip ${name}`);
      const a = this.act(name);
      if (this.action === a && loop) { a.timeScale = speed; return a; }
      if (this.over && name !== this.base) this.overlay(null);    // a talking move on top ends when the body does something else
      a.reset();
      a.setLoop(loop ? T.LoopRepeat : T.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.timeScale = speed;
      a.time = from;
      a.play();
      if (this.action && this.action !== a) this.action.crossFadeTo(a, fade, false);
      this.action = a;
      return a;
    }
    place(x, y, z, h) { this.pos.set(x, y, z); this.heading = h; this.sync(); }
    sync() { this.root.position.copy(this.pos); this.root.rotation.set(0, this.heading, 0); }
    // A bone turned on top of the clip (the face's head steering, a reaching arm) goes back to the clip's own value before the
    // next frame. Before the mixer wrote every bone every frame (PM.apply), a turn where the clip held a bone still stayed and was
    // added again every frame: Mike's head wound round past 170 degrees at the front door (2026-10-29, Jake: "make sure they're
    // tracking"). With that fixed this is belt and braces. keep(bone) is called before turning it; the first call in a frame
    // records the clip's value.
    keep(b) { if (!this.kept.has(b)) this.kept.set(b, b.quaternion.clone()); }
    // the same for a bone moved (the hips set down to kneel): its place goes back too
    keepPos(b) { if (!this.keptPos.has(b)) this.keptPos.set(b, b.position.clone()); }
    update(dt) {
      this.tasks = this.tasks.filter((t) => { if (t.fn(dt)) { t.res(); return false; } return true; });
      this.ticks = this.ticks.filter((f) => !f(dt));
      this.sync();
      for (const [b, q] of this.kept) b.quaternion.copy(q);
      this.kept.clear();
      for (const [b, q] of this.keptPos) b.position.copy(q);
      this.keptPos.clear();
      this.mixer.update(dt);
      if (this._xf) this.blendIn(dt);
      this.recordMix();
      // the body's own poses (kneeling, a foot up: f.body) now; the arms, hands and fingers after the face has turned the head
      // (finish): the shoulders hang from the neck in these skeletons, so the head's steering, done after the arms, carried both
      // hands 3 cm off what they held (round 3k: his fingers in front of the guide's page, not behind it)
      this.posers = this.posers.filter((f) => !f.body || !f(dt));
    }
    finish(dt) { this.posers = this.posers.filter((f) => f.body || !f(dt)); if (this.selfSolid || this._armFix) this.keepArmsOut(); if (this.solids.length) this.keepFingersOut(); }
    // A clean hand-over from one clip to the next where the root moves under the body. A turn on the spot (turnToward) and sitting
    // down or standing up (seatShift) end with the root taking over in one frame what the clip did inside itself (the turn, the
    // step back onto the seat), and the clip under it was crossfaded out over that: for a few frames the body was turned twice over
    // and swung back, his hands 0.4 m in a frame (round 3p, Jake: "a little bit of glitching, like quick, like jerking motions as
    // they walk in to the door and close the doors"; and John's one-frame jump onto the sofa and at the table). Now the pose last
    // drawn is held, its top bone where it was in the world although the root has moved, and eased into the new clip's pose over
    // sec. Call handoffFrom() before the root moves, then move it, start the new clip with no fade, and handoff(sec, from).
    bonesAll() { if (!this._bones) { this._bones = []; this.root.traverse((o) => { if (o.isBone) this._bones.push(o); }); } return this._bones; }
    topBone() { return this.bonesAll().find((b) => !b.parent || !b.parent.isBone); }
    recordMix() {
      if (!this._mix) this._mix = this.bonesAll().map((b) => ({ b, q: new T.Quaternion(), p: new T.Vector3() }));
      for (const m of this._mix) { m.q.copy(m.b.quaternion); m.p.copy(m.b.position); }
    }
    handoffFrom() { const top = this.topBone(); top.parent.updateMatrixWorld(true); return { parentWorld: top.parent.matrixWorld.clone() }; }
    handoff(sec, from) {
      if (!this._mix) return;
      const top = this.topBone(), src = this._mix.map((m) => ({ b: m.b, q: m.q.clone(), p: m.p.clone() }));
      if (from) {
        this.sync(); this.root.updateMatrixWorld(true);
        const s = src.find((m) => m.b === top), sc = new T.Vector3();
        const w = from.parentWorld.clone().multiply(new T.Matrix4().compose(s.p, s.q, top.scale));
        top.parent.matrixWorld.clone().invert().multiply(w).decompose(s.p, s.q, sc);
        // and there now: this runs between frames, and a frame drawn before the next step showed the root turned under the old pose
        top.position.copy(s.p); top.quaternion.copy(s.q); this.root.updateMatrixWorld(true);
      }
      this._xf = { src, t: 0, dur: Math.max(0.05, sec) };
    }
    blendIn(dt) {
      const x = this._xf, k = Math.min(1, (x.t += dt) / x.dur), e = k * k * (3 - 2 * k), tq = new T.Quaternion(), tp = new T.Vector3();
      for (const s of x.src) {
        tq.copy(s.b.quaternion); s.b.quaternion.copy(s.q).slerp(tq, e);
        tp.copy(s.b.position); s.b.position.copy(s.p).lerp(tp, e);
      }
      if (k >= 1) this._xf = null;
    }
    // His own body solid to his arms (round 3n, Jake 2026-10-30: "The top arm is now like resting through his body. Treat these
    // things as solid objects"). The trunk and the head in slices along each bone (pelvis, the three spine bones, neck, head), each
    // slice's cross-section measured once from the skin's own vertices in that bone's bind space (those with no real weight on an
    // arm or a leg).
    // armInBody(side): how far, in metres, that arm (the outer half of the upper arm, the forearm, the hand, each as thick as it
    // is) goes into them, or into the floor when that is one of his solids. keepArmsOut (selfSolid on): the elbow
    // swung out about the line from the shoulder to the wrist first (the hand stays where it is, on what it holds), and only if that
    // is not enough the upper arm turned at the shoulder or the forearm at the elbow; a small step at a time from last frame's
    // turn, until the arm is out or as far out as it gets, and let go again a step a frame once it is not needed. armInBody also
    // finds an arm in a body in other steps (talking moves, the guide held, the clipboard carried); turned on for everyone it moved
    // the carried clipboard 20 cm, so those are for their own poses, one by one.
    bodyShapes() {
      if (this._shapes) return this._shapes;
      const want = ["Pelvis", "Spine", "Spine1", "Spine2", "Neck", "Head"].map((n) => "Bip01_" + n), acc = new Map();
      this.root.traverse((m) => {
        if (!m.isSkinnedMesh || /^prop_/.test(m.name)) return;
        const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, bones = m.skeleton.bones;
        for (let i = 0; i < pos.count; i++) {
          const ix = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
          let limb = 0;
          for (let k = 0; k < 4; k++) if (LIMB.test(bones[ix[k]].name)) limb += ws[k];
          if (limb > 0.3) continue;
          for (let k = 0; k < 4; k++) {
            const b = bones[ix[k]];
            if (ws[k] < 0.2 || !want.includes(b.name)) continue;
            if (!acc.has(b)) acc.set(b, []);
            acc.get(b).push(new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).applyMatrix4(m.skeleton.boneInverses[ix[k]]));
          }
        }
      });
      // in slices along the bone (its x, every 3 units, each from the skin within 4 either side): his waist is not as wide as his
      // hips (one box a bone made an elbow resting at his side look in him)
      return (this._shapes = [...acc].map(([b, vs]) => {
        let x0 = Infinity, x1 = -Infinity;
        for (const v of vs) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); }
        const sl = [];
        for (let x = x0; x <= x1 + 1e-6; x += 3) {
          let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (const v of vs) if (Math.abs(v.x - x) <= 4) { y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
          sl.push(y0 < y1 && z0 < z1 ? { cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2 } : null);
        }
        return { b, x0, x1, sl };
      }));
    }
    armInBody(S, fresh = true) {
      if (fresh) this.root.updateMatrixWorld(true);
      const shapes = this.bodyShapes(), V = () => new T.Vector3(), at = (n) => this.root.getObjectByName(`Bip01_${S}_${n}`).getWorldPosition(V());
      const sh = at("UpperArm"), el = at("Forearm"), wr = at("Hand"), hb = this.root.getObjectByName(`Bip01_${S}_Hand`);
      const hc = wr.clone().add(V().set(0.07, 0, 0).applyQuaternion(hb.getWorldQuaternion(new T.Quaternion())));
      const pts = [[sh.clone().lerp(el, 0.5), 0.045], [sh.clone().lerp(el, 0.75), 0.045], [el, 0.042], [el.clone().lerp(wr, 0.33), 0.04], [el.clone().lerp(wr, 0.67), 0.035], [wr, 0.03], [hc, 0.03]];
      let d = 0;
      const inv = new T.Matrix4(), l = V();
      // the floor too, when it is one of his solids (lying down)
      for (const f of this.solids) {
        if (!f.floor) continue;
        const bx = f();
        for (const [p, r] of pts) {
          l.copy(p).applyMatrix4(bx.inv);
          const ox = bx.half.x + r - Math.abs(l.x), oy = bx.half.y + r - Math.abs(l.y), oz = bx.half.z + r - Math.abs(l.z);
          if (ox > 0 && oy > 0 && oz > 0) d = Math.max(d, Math.min(ox, oy, oz));
        }
      }
      for (const s of shapes) {
        inv.copy(s.b.matrixWorld).invert();
        const unit = 1 / s.b.getWorldScale(V()).x;          // metres to the bone's own units
        for (const [p, r] of pts) {
          l.copy(p).applyMatrix4(inv);
          const ru = r * unit;
          if (l.x < s.x0 - ru || l.x > s.x1 + ru) continue;
          const c = s.sl[Math.max(0, Math.min(s.sl.length - 1, Math.round((l.x - s.x0) / 3)))];
          if (!c) continue;
          // the slice's cross-section, rounded (between an ellipse and its box), as thick again as the arm there
          const hy = c.hy + ru, hz = c.hz + ru, q = Math.pow(Math.abs(l.y - c.cy) / hy, 2.5) + Math.pow(Math.abs(l.z - c.cz) / hz, 2.5);
          // (past either end, only as deep as it is past the end)
          const end = Math.min(l.x - (s.x0 - ru), s.x1 + ru - l.x);
          if (q < 1) d = Math.max(d, Math.min((1 - Math.pow(q, 0.4)) * Math.min(hy, hz), end) / unit);
        }
      }
      return d;
    }
    keepArmsOut() {
      this.root.updateMatrixWorld(true);
      const fix = this._armFix || (this._armFix = {});
      let any = false;
      for (const S of ["L", "R"]) {
        const [up, fore, hand] = ["UpperArm", "Forearm", "Hand"].map((n) => this.root.getObjectByName(`Bip01_${S}_${n}`));
        let cur = fix[S] || [0, 0, 0, 0];
        if (!this.selfSolid && !cur.some((x) => x)) continue;
        this.keep(up); this.keep(fore); this.keep(hand);
        const q0u = up.quaternion.clone(), q0f = fore.quaternion.clone(), hw0 = hand.getWorldQuaternion(new T.Quaternion()), pinned = this.posers.some((f) => f.pin === S || (f.reachSide === S && !f.free));
        const sh = up.getWorldPosition(new T.Vector3()), wr0 = hand.getWorldPosition(new T.Vector3()), axis = wr0.clone().sub(sh).normalize(), wr = new T.Vector3();
        // [swivel: the whole arm about the line from the shoulder to the wrist (the elbow swings, the hand stays put), the upper arm
        // about its own y and z, the forearm about the elbow]; the hand kept at the angle the posers gave it
        const set = ([sw, ay, az, fz]) => {
          up.quaternion.copy(q0u); fore.quaternion.copy(q0f);
          if (sw) turnBone(up, rq.setFromAxisAngle(axis, sw));
          if (ay || az) up.quaternion.multiply(fq.setFromAxisAngle(YAX, ay)).multiply(tq2.setFromAxisAngle(ZAX, az));
          if (fz) fore.quaternion.multiply(fq.setFromAxisAngle(ZAX, fz));
          up.updateMatrixWorld(true);
          hand.quaternion.copy(hand.parent.getWorldQuaternion(pq2).invert().multiply(hw0)); hand.updateMatrixWorld(true);
          const d = this.armInBody(S, false);
          // (moving the hand off where the posers put it costs: what it holds stays in it)
          return { d, cost: d + 0.25 * hand.getWorldPosition(wr).distanceTo(wr0) };
        };
        let r = set(cur);
        // let go a step at a time once it is out (all of it once selfSolid is off)
        if (cur.some((x) => x)) {
          const back = cur.map((x) => x - Math.sign(x) * Math.min(Math.abs(x), STEP)), rb = set(back);
          if (!this.selfSolid || rb.d <= OK_IN) { cur = back; r = rb; } else r = set(cur);
        }
        // out of it a step at a time from where it was last frame (searched afresh each frame, the way out flipped from one side to
        // the other as an arm swung through him, and his hand jumped 63 cm in a frame)
        for (let k = 0; this.selfSolid && k < 8 && r.d > OK_IN; k++) {
          let best = r, bc = cur;
          // (a hand on something that stays put, a reach marked pin (the guide), and since round 3p any reach not marked free (the
          // body solid all the time pushed his free right hand 0.6 m off the tablet he was taking out of his bag): only that elbow
          // swings)
          for (let a = 0; a < (pinned ? 1 : 4); a++) for (const sg of [1, -1]) {
            const c = cur.slice(); c[a] += sg * STEP;
            if (Math.abs(c[a]) > MAX_TURN) continue;
            const rc = set(c);
            if (rc.cost < best.cost - 1e-4) { best = rc; bc = c; }
          }
          if (bc === cur) break;
          cur = bc; r = best;
        }
        set(cur);
        fix[S] = cur;
        (this._armShift || (this._armShift = {}))[S] = hand.getWorldPosition(wr).distanceTo(wr0);     // (for the tests)
        if (cur.some((x) => x)) any = true;
      }
      if (!any && !this.selfSolid) this._armFix = null;
    }
    // Fingers do not go into what he holds (round 3l, Jake: "Why can't we tell the fingers that like they can't go through things?
    // These objects are impenetrable"). solids: functions giving a box, {inv: world to its own frame, half: its half sizes (a
    // finger's thickness added)}, or null. After every pose of the hands, each finger joint, from the knuckle out, is turned about
    // its bend axis just as far as it takes for what comes after it (the next joints, the tip, points between them) to be out of
    // the box, or as far out as it gets.
    keepFingersOut() {
      const boxes = this.solids.map((f) => f()).filter(Boolean);
      if (!boxes.length) return;
      this.root.updateMatrixWorld(true);
      const V = () => new T.Vector3();
      for (const S of ["L", "R"]) for (let n = 0; n <= 4; n++) {
        const chain = ["", "1", "2"].map((j) => this.root.getObjectByName(`Bip01_${S}_Finger${n}${j}`));
        if (chain.some((x) => !x)) continue;
        for (let j = 0; j < 3; j++) {
          const after = () => {
            const p = chain.map((b) => b.getWorldPosition(V())), tip = p[2].clone().addScaledVector(p[2].clone().sub(p[1]), 0.85), all = [...p, tip], out = [];
            for (let i = j; i < 3; i++) for (const f of [0.34, 0.67, 1]) out.push(all[i].clone().lerp(all[i + 1], f));
            return out;
          };
          for (const bx of boxes) {
            const depth = () => { let d = 0; for (const q of after()) { const l = q.applyMatrix4(bx.inv); const ox = bx.half.x - Math.abs(l.x), oy = bx.half.y - Math.abs(l.y), oz = bx.half.z - Math.abs(l.z); if (ox > 0 && oy > 0 && oz > 0) d = Math.max(d, Math.min(ox, oy, oz)); } return d; };
            let best = depth();
            if (best <= 0) continue;
            const b = chain[j], q0 = b.quaternion.clone();
            this.keep(b);
            let ang = 0;
            for (const a of [0.08, -0.08, 0.16, -0.16, 0.25, -0.25, 0.35, -0.35, 0.5, -0.5, 0.7, -0.7, 0.95, -0.95]) {
              b.quaternion.copy(q0).multiply(fq.setFromAxisAngle(ZAX, a)); b.updateMatrixWorld(true);
              const d = depth();
              if (d < best - 1e-4) { best = d; ang = a; if (d <= 0) break; }
            }
            b.quaternion.copy(q0).multiply(fq.setFromAxisAngle(ZAX, ang)); b.updateMatrixWorld(true);
          }
        }
      }
    }
    run(fn) { return new Promise((res, rej) => this.tasks.push({ fn, res, rej })); }
    // (round 3p: and the body eased out of the pose last drawn, poses on top of the clips and all, rather than dropped to the bare
    // clip for a frame: where a step flows on into the next, the arms holding the guide or the clipboard jumped 0.3 m and back.
    // A step started from its own state resets the body after this, so it starts there at once. A talking move on top ends too: its
    // own end was a tick, and those go with the step, so a one-off move such as John's "let's sit at the kitchen table" stayed held
    // at its last frame, his arm across him, 17 cm in.)
    cancel() { const t = this.tasks; this.tasks = []; this.ticks = []; this.posers = []; this._fing = {}; this.gtok++; this.walking = false; this._armFix = null; if (this.over) this.overlay(null); if (this._fin) this._xf = { src: this._fin.map((m) => ({ b: m.b, q: m.q.clone(), p: m.p.clone() })), t: 0, dur: 0.35 }; t.forEach((x) => x.rej(new Cancelled())); }
    // the pose as drawn at the end of a step (after every pose on top of the clips and the props' hands), for cancel
    recordFinal() {
      if (!this._fin) this._fin = this.bonesAll().map((b) => ({ b, q: new T.Quaternion(), p: new T.Vector3() }));
      for (const m of this._fin) { m.q.copy(m.b.quaternion); m.p.copy(m.b.position); }
    }

    // ---- arms ----------------------------------------------------------------------------------------------
    // Curl a hand's fingers on top of the clip: 1 is a fist (knocking: Jake 2026-10-29, "it needs to be like with a fist"), about
    // 0.5 a grip round an edge. Rocketbox fingers (Bip01_L/R_Finger0..4, each with joints 1 and 2) all bend about their own z.
    fingers(side, amount = 1, dur = 0.25) {
      const S = side === "L" ? "L" : "R";
      this._fing = this._fing || {};
      let f = this._fing[S];
      if (!f || !this.posers.includes(f.fn)) {
        const bones = [];
        for (let n = 0; n <= 4; n++) ["", "1", "2"].forEach((j, k) => { const b = this.root.getObjectByName(`Bip01_${S}_Finger${n}${j}`); if (b) bones.push([b, n, k]); });
        f = this._fing[S] = { cur: 0, want: 0, rate: 4, bones };
        f.fn = (dt) => {
          f.cur += Math.sign(f.want - f.cur) * Math.min(Math.abs(f.want - f.cur), f.rate * dt);
          if (f.cur <= 0 && f.want <= 0) { delete this._fing[S]; return true; }
          for (const [b, n, k] of f.bones) {
            const a = (n === 0 ? [0.55, 0.45, 0.35] : [1.25, 1.45, 0.95])[k] * f.cur;     // knuckles, middle, tips; the thumb folds over
            this.keep(b);
            b.quaternion.multiply(fq.setFromAxisAngle(ZAX, a));
          }
          return false;
        };
        this.posers.push(f.fn);
      }
      f.want = amount; f.rate = 1 / Math.max(0.05, dur);
    }
    // Reach with an arm towards a point (target() gives it in the world, every frame): a two-bone solve on the upper arm and
    // forearm after the clip, the elbow down and out, blended in over dur. For what no clip does: knocking on this door, handing
    // over a card, taking it, pulling a door open by its handle. Returns a handle: release(sec) blends back to the clip.
    // leg: a leg instead (thigh, calf, foot: the ankle to the point); pole(): the way the elbow or knee goes.
    reach(side, target, { dur = 0.45, twist = 0, leg = false, pole = null } = {}) {
      const S = side === "L" ? "L" : "R";
      const [up, fore, hand] = (leg ? ["Thigh", "Calf", "Foot"] : ["UpperArm", "Forearm", "Hand"]).map((n) => this.root.getObjectByName(`Bip01_${S}_${n}`));
      const h = { target, w: 0, goal: 1, rate: 1 / dur, out: null, hand, twist, side: S };
      h.release = (sec = 0.45) => { h.goal = 0; h.rate = 1 / sec; return new Promise((res) => (h.out = res)); };
      h.set = (fn) => { h.target = fn; };
      const v = (o) => o.getWorldPosition(new T.Vector3());
      this.posers.push(h.fn = (dt) => {
        h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * h.rate * dt));
        if (h.goal === 0 && h.w <= 0) { if (h.out) h.out(); return true; }
        const k = h.w * h.w * (3 - 2 * h.w);
        this.root.updateMatrixWorld(true);
        const fwd = new T.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        const out = new T.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading)).multiplyScalar(S === "R" ? 1 : -1);
        // an elbow down and out, a little back; a knee forward
        const pl = pole ? pole() : leg ? fwd.clone().addScaledVector(out, 0.15) : new T.Vector3(0, -1, 0).addScaledVector(out, 0.6).addScaledVector(fwd, -0.25);
        this.keep(up); this.keep(fore);
        twoBone(up, fore, hand, h.target(), pl, k);
        // twist: the hand turned about the forearm (palm up to carry something flat on it), radians
        if (h.twist) { this.keep(hand); const ax = v(hand).sub(v(fore)).normalize(); turnBone(hand, new T.Quaternion().setFromAxisAngle(ax, h.twist * k)); }
        return false;
      });
      if (!leg) h.fn.reachSide = S;                       // (keepArmsOut: only its elbow swings, unless marked fn.free)
      return h;
    }

    // A hand held at a set angle in the world, after the clip and the arm's reach (round 3j, the grips Jake asked for: the card
    // "between the index and the middle finger with palm exposed upwards", the guide "between the palm and with the thumb over on
    // top and the fingers underneath"). fingers(): the way the fingers point; thumb(): the way the thumb side faces. The hand bones'
    // own axes (Rocketbox, measured from where the finger joints are, round 3j): x runs out along the fingers, +y is the palm (the
    // fingers curl that way); the right hand's thumb is on its +z side, the left's on -z. (Round 3h's palmUp took -y for the palm,
    // and the guide went over lying on the back of his hand: Jake, "It's like on top of his hand".) release() lets it go.
    orient(side, fingers, thumb, { dur = 0.4 } = {}) {
      const S = side === "L" ? "L" : "R", hb = this.root.getObjectByName(`Bip01_${S}_Hand`), h = { w: 0, goal: 1, rate: 1 / dur, fingers, thumb, out: null };
      h.release = (sec = 0.4) => { h.goal = 0; h.rate = 1 / sec; return new Promise((res) => (h.out = res)); };
      this.posers.push(h.fn = (dt) => {
        h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * h.rate * dt));
        if (h.goal === 0 && h.w <= 0) { if (h.out) h.out(); return true; }
        const x = h.fingers().normalize(), th = h.thumb();
        const z = th.addScaledVector(x, -th.dot(x)).normalize().multiplyScalar(S === "R" ? 1 : -1), y = z.clone().cross(x);
        const want = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
        this.root.updateMatrixWorld(true);
        this.keep(hb);
        const cur = hb.getWorldQuaternion(new T.Quaternion()).slerp(want, h.w * h.w * (3 - 2 * h.w));
        hb.quaternion.copy(hb.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(cur));
        hb.updateMatrixWorld(true);
        return false;
      });
      return h;
    }
    // Each finger its own curl (0 straight, 1 a fist), thumb first: [thumb, index, middle, ring, little]. The card between the
    // index and middle fingers: those two straight, the other two folded in. release() opens the hand again.
    // abs: the curls from the hand's rest, open and flat (its bind pose), not on top of the clip's own relaxed curl (round 3l: a
    // flat open hand to show the guide on; the clip's curl took the fingers into it).
    grip(side, curls, dur = 0.3, abs = false) {
      const S = side === "L" ? "L" : "R";
      this._grip = this._grip || {};
      if (this._grip[S]) this._grip[S].done = true;
      const bones = [];
      for (let n = 0; n <= 4; n++) ["", "1", "2"].forEach((j, k) => { const b = this.root.getObjectByName(`Bip01_${S}_Finger${n}${j}`); if (b) bones.push([b, n, k]); });
      const g = this._grip[S] = { cur: [0, 0, 0, 0, 0], want: curls.slice(), rate: 1 / Math.max(0.05, dur), done: false, open: false, abs, aw: 0 };
      const tq2 = new T.Quaternion();
      this.posers.push((dt) => {
        if (g.done) return true;
        let any = false;
        for (let n = 0; n < 5; n++) { const d = g.want[n] - g.cur[n]; g.cur[n] += Math.sign(d) * Math.min(Math.abs(d), g.rate * dt); if (g.cur[n] > 1e-3) any = true; }
        g.aw = Math.max(0, Math.min(1, g.aw + (g.abs && !g.open ? 1 : -1) * g.rate * dt));
        if (g.open && !any && g.aw <= 0) { if (this._grip[S] === g) delete this._grip[S]; return true; }
        for (const [b, n, k] of bones) {
          this.keep(b);
          const c = fq.setFromAxisAngle(ZAX, (n === 0 ? [0.55, 0.45, 0.35] : [1.25, 1.45, 0.95])[k] * g.cur[n]);
          if (g.aw > 0 && b.userData.rest) { tq2.copy(b.quaternion).multiply(c); b.quaternion.copy(b.userData.rest).multiply(c).slerp(tq2, 1 - g.aw); }
          else b.quaternion.multiply(c);
        }
        return false;
      });
      return { release: (dur2 = 0.3) => { g.want = [0, 0, 0, 0, 0]; g.open = true; g.rate = 1 / Math.max(0.05, dur2); }, set: (c, a = g.abs) => { g.want = c.slice(); g.abs = a; } };
    }
    // The thumb turned at its root so its tip comes to a point (target() in the world): over the top of the guide, holding it
    // (round 3l, Jake: "There's no thumb"). release() lets it go.
    thumbAt(side, target, { dur = 0.35 } = {}) {
      const S = side === "L" ? "L" : "R", [b0, b1, b2] = ["", "1", "2"].map((j) => this.root.getObjectByName(`Bip01_${S}_Finger0${j}`));
      const h = { w: 0, goal: 1, rate: 1 / dur, target, out: null };
      h.release = (sec = 0.3) => { h.goal = 0; h.rate = 1 / sec; return new Promise((res) => (h.out = res)); };
      h.set = (f) => { h.target = f; };
      this.posers.push((dt) => {
        h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * h.rate * dt));
        if (h.goal === 0 && h.w <= 0) { if (h.out) h.out(); return true; }
        const t = h.target && h.target();
        if (!t) return false;
        this.root.updateMatrixWorld(true);
        const p0 = b0.getWorldPosition(new T.Vector3()), p1 = b1.getWorldPosition(new T.Vector3()), p2 = b2.getWorldPosition(new T.Vector3());
        const tip = p2.clone().addScaledVector(p2.clone().sub(p1), 0.85);
        const q = new T.Quaternion().setFromUnitVectors(tip.sub(p0).normalize(), t.clone().sub(p0).normalize());
        this.keep(b0);
        turnBone(b0, new T.Quaternion().slerp(q, h.w * h.w * (3 - 2 * h.w)));
        return false;
      });
      return h;
    }
    // The head turned so the face looks at target() (lying on his side under the sink, where the face's own steering, made for a
    // body upright, does not hold: set the face's target to null). A body pose: done before the face and the arms.
    lookAt(target, { dur = 0.5 } = {}) {
      if (this._look) this._look.goal = 0;
      const head = this.root.getObjectByName("Bip01_Head"), neck = this.root.getObjectByName("Bip01_Neck");
      const h = this._look = { w: 0, goal: 1, rate: 1 / dur, target, out: null };
      h.release = (sec = 0.5) => { h.goal = 0; h.rate = 1 / sec; return new Promise((res) => (h.out = res)); };
      const fn = (dt) => {
        h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * h.rate * dt));
        if (h.goal === 0 && h.w <= 0) { if (h.out) h.out(); return true; }
        this.root.updateMatrixWorld(true);
        const fwdL = this.face && this.face.headFwd ? this.face.headFwd : new T.Vector3(0, 0, 1);
        const want = h.target().sub(head.getWorldPosition(new T.Vector3())).normalize();
        const k = h.w * h.w * (3 - 2 * h.w);
        let q = new T.Quaternion().setFromUnitVectors(fwdL.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion())).normalize(), want);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
        if (ang > 1.3) q = new T.Quaternion().slerp(q, 1.3 / ang);
        if (neck) { this.keep(neck); turnBone(neck, new T.Quaternion().slerp(q, 0.4 * k)); }
        this.keep(head);
        q = new T.Quaternion().setFromUnitVectors(fwdL.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion())).normalize(), want);
        turnBone(head, new T.Quaternion().slerp(q, 0.75 * k));
        return false;
      };
      fn.body = true;
      this.posers.push(fn);
      return h;
    }

    // ---- kneeling, and a foot lifted ---------------------------------------------------------------------------------
    // Round 3j (Jake 2026-10-30): "him kneeling down, it makes his back all seriously contorted ... like he's got some sort of
    // scoliosis". The only low pose the move packs have is a full squat (crouch_idle): his back rounds over his knees and his shirt
    // bulges into a hump. At a sink cabinet a tech goes down on one knee: the right knee on the floor under the hip, the left foot
    // planted ahead, the back near straight with a lean from the chest. Made on top of standing easy: the hips set down (the pelvis
    // moved), each leg solved to where its foot goes, the lean put in the upper spine (the thighs hang from the lowest spine bone).
    // kneel(true) settles into it over dur, kneel(false) back up; each resolves once there.
    kneel(on = true, { dur = 0.9 } = {}) {
      const k = this._kn || (this._kn = this.lowPose((g) => {
        const { fwd, left, up, thigh, calf, hipX } = g, floor = g.floor;
        const pel = g.base.clone().addScaledVector(fwd, 0.04).setY(floor + 0.075 + thigh * 0.98);
        const hipR = pel.clone().addScaledVector(left, -hipX), hipL = pel.clone().addScaledVector(left, hipX);
        return {
          pelvis: pel, hinge: 0.12, lean: 0.1, roll: 0,
          R: { at: hipR.clone().addScaledVector(fwd, -calf * 0.95).setY(floor + 0.11), pole: fwd.clone().addScaledVector(up, -0.35) },
          L: { at: hipL.clone().addScaledVector(fwd, thigh * 0.95).addScaledVector(left, 0.05).setY(floor + 0.087), pole: fwd.clone().addScaledVector(up, 0.35).addScaledVector(left, 0.2) },
        };
      }));
      return k.go(on ? 1 : 0, dur);
    }
    get kneeling() { return !!(this._kn && this._kn.w > 0); }
    // A foot lifted to pull a shoe cover over it, standing (Jake 2026-10-30: "They should be done standing right there"): the weight
    // onto the other leg, that knee soft, the lifted knee brought up high and forward to the hands, and a bend at the hips, the
    // back straight. Round 3k (Jake: "He really hunches those shoulders over to get the booties on ... Keep that back straight.
    // Actually, be like a ... spine"): the bend was 1.25 rad in the upper spine, which rounded his back over; now it is a hinge
    // at the hips (the pelvis tipped, the back on it as one). Round 3l (Jake: "he probably needs to like bend down, like the other
    // knee a little bit ... it pulls that knee up at an angle. I don't think people can pull their knees up at that angle"): the
    // standing knee bends (the hips 17 cm down) and the foot comes up 27 cm, not 52, so the lifted thigh stays below level.
    footUp(side, on = true, { dur = 0.5 } = {}) {
      const key = "_fu" + side, S = side === "L" ? "L" : "R", O = S === "L" ? "R" : "L";
      const k = this[key] || (this[key] = this.lowPose((g) => {
        const { fwd, left, up } = g, sgn = S === "L" ? 1 : -1;
        return {
          pelvis: g.pel0.clone().addScaledVector(up, -0.17).addScaledVector(left, -sgn * 0.05).addScaledVector(fwd, -0.1), hinge: 0.85, lean: 0.06, roll: 0,
          [S]: { at: g.feet[S].clone().addScaledVector(up, 0.27).addScaledVector(fwd, 0.14).addScaledVector(left, -sgn * 0.05), pole: fwd.clone().addScaledVector(up, 0.3) },
          [O]: { at: g.feet[O].clone(), pole: fwd.clone() },
        };
      }));
      return k.go(on ? 1 : 0, dur);
    }
    // A bend at the knees and hips with both feet where they stand (round 3p): down to set his toolbag on the floor or take it up
    // (down 0.3), or a lean in (John easing his front door shut, down 0.04 and the hinge alone). bend(o, true) settles into it over
    // dur; bend({}, false) straightens up again.
    bend({ down = 0.3, hinge = 0.6, lean = 0.1, back = 0.08 } = {}, on = true, { dur = 0.6 } = {}) {
      if (on) this._bendP = { down, hinge, lean, back };
      const k = this._bend || (this._bend = this.lowPose((g) => {
        const P = this._bendP, { fwd, up } = g;
        return { pelvis: g.pel0.clone().addScaledVector(up, -P.down).addScaledVector(fwd, -P.back), hinge: P.hinge, lean: P.lean, roll: 0,
          L: { at: g.feet.L.clone(), pole: fwd.clone().addScaledVector(up, 0.3) }, R: { at: g.feet.R.clone(), pole: fwd.clone().addScaledVector(up, 0.3) } };
      }));
      return k.go(on ? 1 : 0, dur);
    }
    // The machinery of the two above: where the hips go and how they are tipped (hinge: forward, the back on them straight;
    // roll: onto one hip), a little lean in the upper spine, and where each foot goes (pose(g), worked out once from the body as
    // it stands when it starts), blended in over the clip every frame, first of the after-clip poses (so an arm reaching from the
    // lowered body reaches from where it is now). change(...) eases it to a changed pose (from his knee down onto one hip).
    lowPose(pose) {
      const self = this, b = (n) => this.root.getObjectByName(n), V = () => new T.Vector3();
      const P = { pelvis: b("Bip01_Pelvis"), s1: b("Bip01_Spine1"), s2: b("Bip01_Spine2"),
        L: ["Thigh", "Calf", "Foot"].map((n) => b("Bip01_L_" + n)), R: ["Thigh", "Calf", "Foot"].map((n) => b("Bip01_R_" + n)) };
      const st = { w: 0, goal: 0, rate: 1, g: null, tgt: null, from: null, m: 1, mrate: 1 };
      const frame = () => {
        self.root.updateMatrixWorld(true);
        const h = self.heading, wp = (o) => o.getWorldPosition(V());
        const fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h)), left = new T.Vector3(Math.cos(h), 0, -Math.sin(h)), up = new T.Vector3(0, 1, 0);
        return { base: self.pos.clone(), floor: self.pos.y, fwd, left, up,
          thigh: wp(P.L[0]).distanceTo(wp(P.L[1])), calf: wp(P.L[1]).distanceTo(wp(P.L[2])),
          hipX: Math.abs(wp(P.L[0]).sub(wp(P.R[0])).dot(left)) / 2, pel0: wp(P.pelvis), feet: { L: wp(P.L[2]), R: wp(P.R[2]) } };
      };
      // one pose part way to another
      const num = (a, c, k) => (a || 0) + ((c || 0) - (a || 0)) * k;
      const mixPose = (a, c, k) => {
        const o = { pelvis: a.pelvis.clone().lerp(c.pelvis, k), hinge: num(a.hinge, c.hinge, k), lean: num(a.lean, c.lean, k), roll: num(a.roll, c.roll, k), raise: num(a.raise, c.raise, k) };
        for (const S of ["L", "R"]) if (a[S] && c[S]) o[S] = { at: a[S].at.clone().lerp(c[S].at, k), pole: a[S].pole.clone().lerp(c[S].pole, k) };
        return o;
      };
      const fn = (dt) => {
        st.w = Math.max(0, Math.min(1, st.w + Math.sign(st.goal - st.w) * st.rate * dt));
        if (st.w <= 0 && st.goal === 0) return true;
        if (st.m < 1) st.m = Math.min(1, st.m + st.mrate * dt);
        const e = st.w * st.w * (3 - 2 * st.w), t = st.m < 1 ? mixPose(st.from, st.tgt, st.m * st.m * (3 - 2 * st.m)) : st.tgt;
        st.cur = t;
        self.root.updateMatrixWorld(true);
        const feet = { L: P.L[2].getWorldPosition(V()), R: P.R[2].getWorldPosition(V()) };     // where the clip has them
        self.keep(P.pelvis); self.keepPos(P.pelvis);
        P.pelvis.position.copy(P.pelvis.parent.worldToLocal(P.pelvis.getWorldPosition(V()).lerp(t.pelvis, e)));
        P.pelvis.updateMatrixWorld(true);
        // the hips tipped forward and onto one side, everything above them with them (the thighs, below, are solved after)
        if (t.hinge) turnBone(P.pelvis, new T.Quaternion().setFromAxisAngle(st.g.left, t.hinge * e));
        if (t.roll) turnBone(P.pelvis, new T.Quaternion().setFromAxisAngle(st.g.fwd, t.roll * e));
        // raise: the head end lifted after the roll (lying on his side, the chest up off the floor, the hips on it)
        if (t.raise) turnBone(P.pelvis, new T.Quaternion().setFromAxisAngle(st.g.left, -t.raise * e));
        self.keep(P.s1); self.keep(P.s2);
        if (t.lean) {
          turnBone(P.s1, new T.Quaternion().setFromAxisAngle(st.g.left, t.lean * 0.5 * e));
          turnBone(P.s2, new T.Quaternion().setFromAxisAngle(st.g.left, t.lean * 0.5 * e));
        }
        for (const S of ["L", "R"]) {
          if (!t[S]) continue;
          const [th, ca, fo] = P[S];
          self.keep(th); self.keep(ca);
          twoBone(th, ca, fo, feet[S].lerp(t[S].at, e), t[S].pole, 1);
        }
        return false;
      };
      return {
        get w() { return st.w; },
        get tgt() { return st.tgt; },
        get g() { return st.g; },
        go(goal, dur) {
          if (!self.posers.includes(fn)) {
            if (goal === 0) { st.w = 0; return Promise.resolve(); }
            st.g = frame(); st.tgt = pose(st.g); st.w = 0; st.m = 1;
            fn.body = true;
            self.posers.unshift(fn);
          }
          st.goal = goal; st.rate = 1 / Math.max(0.05, dur);
          return self.run(() => st.w === st.goal);
        },
        // to another pose (f(g, now) gives it, or an object of changes to the one now), over sec
        change(f, sec = 0.8) {
          if (!st.tgt) return Promise.resolve();
          const now = st.cur || st.tgt;
          st.from = now; st.tgt = typeof f === "function" ? f(st.g, now) : Object.assign({}, now, f);
          st.m = 0; st.mrate = 1 / Math.max(0.05, sec);
          return self.run(() => st.m >= 1);
        },
      };
    }

    // ---- moves -------------------------------------------------------------------------------------------
    once(name, opts = {}) {
      this.gtok++;
      const a = this.play(name, { ...opts, loop: false });
      const dur = this.clips[name].duration / Math.abs(a.timeScale);
      let t = 0;
      return this.run((dt) => (t += dt) >= dur - (opts.early || 0));
    }
    wait(sec) { let t = 0; return this.run((dt) => (t += dt) >= sec); }
    // A body-language move for a while, then back to the base pose. Talking and listening clips are long takes, so a
    // line starts somewhere inside them rather than at the same frame every time; a one-off move (a shrug, pointing,
    // the invitation) plays from its start.
    gesture(name, hold, { full = false } = {}) {
      const c = this.clips[name];
      if (!c) return false;
      if (/^sit_/.test(this.base) !== /^sit_/.test(name)) return false;       // a standing move while seated (or back)
      const tok = ++this.gtok;
      const take = /^(talk_|listen_|sit_table_idle|sit_chair_idle|idle_)/.test(name);
      let from = 0;
      for (let i = 0; take && i < 20; i++) {
        from = this.rnd() * Math.max(0, c.duration - hold - 0.5);
        if (!(FIDGETS[name] || []).some(([a, b]) => from < b + 0.4 && from + hold > a - 0.4)) break;
      }
      // Standing, a talking move is a touch of the take on top of standing easy, from the waist up (round 3j, Jake 2026-10-30:
      // "every time someone talks, it's just real big mannerisms and flailing the body and rotating and stepping forward and
      // stepping back. It's going to be a lot more stable"; "he moves toward John with some flailing arm movement. It's kind of a
      // no-no"). The takes are whole-body mocap: they step, turn the hips and throw the arms. Now the legs and hips stay in the
      // stand and the take only leans into the spine, head and arms (a talk a third of the way, a listen half, a one-off move
      // such as a shrug or "Come on in" six tenths). full: the whole move, as it was (the Body language panel's try-a-move).
      if (!full && this.base === "idle_neutral_01" && !this.walking) {
        this.overlay(name, take ? (/^listen_/.test(name) ? 1.0 : 0.55) : 1.5, from, take);
        let t = 0;
        this.ticks.push((dt) => {
          if (this.gtok !== tok) return true;
          if ((t += dt) < Math.max(hold, take ? 0 : Math.min(c.duration - 0.3, hold + 1.2))) return false;
          this.overlay(null);
          return true;
        });
        return true;
      }
      this.play(name, { loop: take, fade: 0.35, from });
      let t = 0;
      this.ticks.push((dt) => {
        if (this.gtok !== tok) return true;
        if ((t += dt) < Math.max(hold, take ? 0 : Math.min(c.duration - 0.3, hold + 1.2))) return false;
        this.play(this.base, { fade: 0.5 });
        return true;
      });
      return true;
    }
    // The upper body of a move (spine, neck, head, arms, hands: their turns only), played on top of the clip under it at weight w
    // (three blends the two by w / (1 + w)); overlay(null) fades it out. Anything that changes the clip under it (a walk, a turn,
    // sitting down) ends it first (play).
    overlay(name, w = 0.55, from = 0, loop = true) {
      const old = this.over;
      if (old) { old.fadeOut(name ? 0.35 : 0.5); this.over = null; }
      if (!name) return;
      const key = name + "~up";
      if (!this.clips[key]) {
        const c = this.clips[name].clone();
        c.tracks = c.tracks.filter((t) => /\.quaternion$/.test(t.name) && UPPER.test(t.name.split(".")[0]));
        c.name = key;
        this.clips[key] = c;
      }
      const a = this.mixer.clipAction(this.clips[key]);
      a.reset(); a.setLoop(loop ? T.LoopRepeat : T.LoopOnce, Infinity); a.clampWhenFinished = !loop;
      a.time = from; a.setEffectiveWeight(w); a.fadeIn(0.35); a.play();
      this.over = a;
    }
    rnd() { this._s = ((this._s || 12345) * 1103515245 + 12345) & 0x7fffffff; return this._s / 0x7fffffff; }
    // (a new turn takes over from one still going: two at once, each to its own angle, pulled him to and fro for ever; Play's line
    // card turns him to John, and saying the line could turn him again)
    turnTo(h, rate = Math.PI) {
      const tok = (this._turnTok = (this._turnTok || 0) + 1);
      return this.run((dt) => {
        if (this._turnTok !== tok) return true;
        const d = angleDiff(h, this.heading);
        const s = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
        this.heading += s;
        return Math.abs(d) < 1e-3;
      });
    }
    faceTo(x, z, rate) { return this.turnTo(Math.atan2(x - this.pos.x, z - this.pos.z), rate); }
    // A turn on the spot with a turning clip (feet stepping round) when one fits, otherwise a plain rotation. The clip
    // turns the body inside itself; at its end the root takes over the turn and the step, as seatShift does for sitting.
    async turnToward(x, z) {
      const want = Math.atan2(x - this.pos.x, z - this.pos.z);
      const d = angleDiff(want, this.heading) / Math.PI * 180;
      // (round 3p: no more than the 120 degree clip, the rest a plain turn after it: the half turn clip twists the body round inside it
      // so far that the clipboard hand, placed from the body, went 10 cm into his hip; Mike turning to call John from the sink)
      const opts = [60, 90, 120].map((a) => [a, Math.abs(Math.abs(d) - a)]).sort((p, q) => p[1] - q[1]);
      const [a] = opts[0];
      const name = `turn_${d > 0 ? "left" : "right"}_${a}`;
      if (Math.abs(d) > 40 && this.clips[name] && this.base === "idle_neutral_01" && !this.walking) {
        const m = measureMove(this, name);
        await this.once(name, { early: 0.03, fade: 0.2 });
        const from = this.handoffFrom();
        this.pos.x += Math.sin(this.heading) * m.fwd + Math.cos(this.heading) * m.side;
        this.pos.z += Math.cos(this.heading) * m.fwd - Math.sin(this.heading) * m.side;
        this.heading += m.yaw;
        this.sync();
        this.play(this.base, { fade: 0 });
        this.handoff(0.35, from);
      }
      await this.faceTo(x, z, 2.5);
    }
    // a move that ends with the hips somewhere else (sitting down: 0.47 m back onto the seat) hands over to the next clip,
    // whose hips are over the root, by moving the root along the facing by that much
    seatShift(d) { this.pos.x += Math.sin(this.heading) * d; this.pos.z += Math.cos(this.heading) * d; this.sync(); }
    // Where everything goes when he sits at a dining chair tucked under the table (see sitAtTable), without moving it.
    tableSeat(chairName, { pull = 0.62, tuck = 0.3 } = {}) {
      const chair = W().scene.getObjectByName(chairName);
      if (!chair.userData.home) chair.userData.home = chair.position.clone();
      const home = chair.userData.home;
      const saved = chair.position.clone(); chair.position.copy(home); chair.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(chair), mid = box.getCenter(new T.Vector3());
      chair.position.copy(saved); chair.updateMatrixWorld(true);
      let table = null;
      W().scene.traverse((o) => { if (!table && /^furn_table_/.test(o.name)) table = o; });
      const tb = new T.Box3().setFromObject(table), tc = tb.getCenter(new T.Vector3());
      const fwd = new T.Vector3(tc.x - mid.x, 0, tc.z - mid.z);
      if (Math.abs(fwd.x) > Math.abs(fwd.z)) fwd.set(Math.sign(fwd.x), 0, 0); else fwd.set(0, 0, Math.sign(fwd.z));
      const h = Math.atan2(fwd.x, fwd.z);
      const back = fwd.clone().multiplyScalar(-pull);
      const out = home.clone().add(chair.parent.worldToLocal(mid.clone().add(back)).sub(chair.parent.worldToLocal(mid.clone())));
      const seat = mid.clone().add(back);
      const stand = seat.clone().addScaledVector(fwd, SIT_BACK * this.root.scale.x);
      const sat = stand.clone().addScaledVector(fwd, -SIT_BACK * this.root.scale.x).addScaledVector(fwd, tuck);
      const tucked = out.clone().lerp(home, tuck / pull);
      return { chair, home, out, tucked, seat, stand, sat, fwd, h };
    }
    // Sit on a dining chair that is tucked under the table: slide it out (the chair node moves, as a hand would pull
    // it), stand where the sit clip needs him (SIT_BACK in front of the seat, facing the table), sit, then shuffle the
    // chair back in with him on it.
    async sitAtTable(chairName, { pull = 0.62, tuck = 0.3, approach = [], sideDir = -1 } = {}) {
      const g = this.tableSeat(chairName, { pull, tuck });
      const side = g.stand.clone().add(new T.Vector3(g.fwd.z, 0, -g.fwd.x).multiplyScalar(0.55 * sideDir));
      await this.walk([...approach, [side.x, this.pos.y, side.z]]);
      await this.faceTo(g.seat.x, g.seat.z, 3);
      let t = 0;
      await this.run((dt) => { t = Math.min(1, t + dt / 0.7); g.chair.position.lerpVectors(g.home, g.out, t * t * (3 - 2 * t)); return t >= 1; });
      await this.walk([[g.stand.x, this.pos.y, g.stand.z]], { speed: 0.5 });
      await this.turnTo(g.h, 3);
      await this.once("sit_down_chair_01", { early: 0.02 });
      const from = this.handoffFrom();
      this.seatShift(-SIT_BACK * this.root.scale.x);
      this.base = "sit_table_idle_neutral_01";
      this.play(this.base, { fade: 0 });
      this.handoff(0.4, from);
      const in0 = g.chair.position.clone();
      const p0 = this.pos.clone(), p1 = p0.clone().addScaledVector(g.fwd, tuck);
      t = 0;
      await this.run((dt) => { t = Math.min(1, t + dt / 0.8); const e = t * t * (3 - 2 * t); g.chair.position.lerpVectors(in0, g.tucked, e); this.pos.lerpVectors(p0, p1, e); return t >= 1; });
    }
    // the end of sitAtTable, at once (for starting a step with him already seated)
    snapAtTable(chairName, opts) {
      const g = this.tableSeat(chairName, opts);
      g.chair.position.copy(g.tucked);
      this.place(g.sat.x, this.pos.y, g.sat.z, g.h);
      this.reset("sit_table_idle_neutral_01");
    }
    // sitting down on a sofa or armchair at a mark: [x, y, z, heading] is where he stands, back to the seat
    async sitDown(chairBase = "sit_chair_idle_neutral_01") {
      await this.once("sit_down_chair_01", { early: 0.02 });
      const from = this.handoffFrom();
      this.seatShift(-SIT_BACK * this.root.scale.x);
      this.base = chairBase;
      this.play(this.base, { fade: 0 });
      this.handoff(0.4, from);
    }
    async standUp() {
      await this.once("sit_stand_up_chair_01", { early: 0.02 });
      const from = this.handoffFrom();
      this.seatShift(STAND_FWD * this.root.scale.x);
      this.base = "idle_neutral_01";
      this.play(this.base, { fade: 0 });
      this.handoff(0.4, from);
    }
    // straight into a pose (a step's start): every running clip stopped, so no crossfade is left over from before
    reset(base) { this.mixer.stopAllAction(); this.action = null; this.over = null; this._xf = null; this.base = base; this.play(base, { fade: 0 }); this.root.visible = this.root.visible; }
    stand(x, y, z, h) { this.place(x, y, z, h); this.reset("idle_neutral_01"); }
    seated(x, y, z, h, base = "sit_chair_idle_neutral_01") { this.place(x, y, z, h); this.reset(base); }
    // Walk a polyline of [x, y, z] points at the walk clip's own pace; eases out at the end. The corners are rounded off (a
    // curve of up to `round` metres each side) and the body turns along the curve at a walking person's rate, so a corner is a
    // turn, not a snap (Jake 2026-10-29: "he gets to a turn point and just snaps real quick"). ground: the feet follow what is
    // under them (the driveway, the porch steps) instead of the points' own heights.
    walk(points, { speed = null, backwards = false, end = null, round = 0.45, ground = false } = {}) {
      this.gtok++;
      this.walking = true;
      let pts = [this.pos.clone(), ...points.map((p) => new T.Vector3(p[0], p[1], p[2]))];
      if (round > 0 && pts.length > 2) pts = rounded(pts, round);
      let gy = this.pos.y;
      const legs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); if (l > 1e-4) { legs.push([pts[i - 1], pts[i], total, l]); total += l; } }
      const nat = this.walkSpeed || 1.2;
      const v = speed || nat;
      const a = this.play("walk_neutral_01", { speed: (backwards ? -1 : 1) * v / nat });
      let s = 0;
      const ease = Math.min(0.6, total / 2);              // the last ease metres slow down to a stop
      return this.run((dt) => {
        const left = total - s;
        const k = left < ease ? Math.max(0.35, left / ease) : 1;
        s = Math.min(total, s + v * k * dt);
        a.timeScale = (backwards ? -1 : 1) * (v * k) / nat;
        const leg = legs.find((g) => s <= g[2] + g[3]) || legs[legs.length - 1];
        const f = leg ? (s - leg[2]) / leg[3] : 1;
        if (leg) this.pos.lerpVectors(leg[0], leg[1], Math.min(1, Math.max(0, f)));
        if (ground) {
          const g = groundAt(this.pos.x, this.pos.z, gy + 0.4);
          if (g !== null) gy += (g - gy) * Math.min(1, dt * 10);
          this.pos.y = gy;
        }
        // look a little ahead along the (rounded) path, and turn towards it no faster than a person walking a corner
        const ahead = this.pointAt(legs, Math.min(total, s + 0.6));
        if (Math.hypot(ahead.x - this.pos.x, ahead.z - this.pos.z) > 0.05) {
          let want = Math.atan2(ahead.x - this.pos.x, ahead.z - this.pos.z);
          if (backwards) want += Math.PI;
          const d = angleDiff(want, this.heading);
          this.heading += Math.sign(d) * Math.min(Math.abs(d), 2.0 * dt, Math.abs(d) * 6 * dt + 0.2 * dt);
        }
        if (s >= total) { this.walking = false; this.play(end || this.base, { fade: 0.35 }); return true; }
        return false;
      });
    }
    pointAt(legs, s) {
      const leg = legs.find((g) => s <= g[2] + g[3]) || legs[legs.length - 1];
      return leg ? new T.Vector3().lerpVectors(leg[0], leg[1], Math.min(1, (s - leg[2]) / leg[3])) : this.pos.clone();
    }
    // a prop in his hand (obj built in metres), placed at pos in the hand bone's own axes, so it moves with every
    // gesture; putDown leaves it lying somewhere in the house (flipped, so a clipboard lies paper up)
    hold(obj, boneName, pos = [0, 0, 0]) {
      const b = this.root.getObjectByName(boneName);
      this.root.updateMatrixWorld(true);
      const s = b.getWorldScale(new T.Vector3()).x;
      obj.scale.setScalar(1 / s); obj.position.set(...pos).multiplyScalar(1 / s); obj.rotation.set(0, 0, 0);
      b.add(obj);
    }
    putDown(obj, x, y, z, h) { W().scene.add(obj); obj.scale.setScalar(1); obj.position.set(x, y, z); obj.rotation.set(Math.PI, h, 0); }
    // the middle of the eyes in the world, for the other person to look at
    eyes(v = new T.Vector3()) {
      const f = this.face;
      if (f && f.eyes.length === 2) return f.eyeMid(v);
      return v.copy(this.pos).setY(this.pos.y + 1.6);
    }
  }

  // Props. The script's approach: "Clean clipboard, phone on it recording." Hardboard, paper, a steel clip; built
  // lying in the hand's axes (long side along the fingers, paper away from the palm).
  function clipboard() {
    const g = new T.Group(); g.name = "prop_clipboard";
    const m = (c, r, me = 0) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const board = new T.Mesh(new T.BoxGeometry(0.32, 0.006, 0.23), m(0x6b4a2b, 0.8));
    const paper = new T.Mesh(new T.BoxGeometry(0.28, 0.002, 0.215), m(0xf4f4f0, 0.9)); paper.position.set(0.015, -0.004, 0);
    const clip = new T.Mesh(new T.BoxGeometry(0.03, 0.018, 0.09), m(0xb8bcc2, 0.35, 0.8)); clip.position.set(-0.13, -0.008, 0);
    g.add(board, paper, clip);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // The business card (Jake 2026-10-29: "It's just purple and say Happy Pipes on it. You can put the logo if you want to."):
  // 3.5 by 2 in, the brand purple, the real lockup (sim/props/hp_lockup.png, cut from Jake's flat polo mockup like the polo's
  // own logos) on the front, HAPPY PIPES PLUMBING on the back. Built lying in the hand's axes, as the clipboard.
  let cardTex = null;
  function card() {
    if (!cardTex) {
      const face = (draw) => { const c = document.createElement("canvas"); c.width = 512; c.height = 292; const g = c.getContext("2d"); g.fillStyle = "#5e2f90"; g.fillRect(0, 0, 512, 292); draw(g, c); const t = new T.CanvasTexture(c); t.anisotropy = 4; return t; };
      cardTex = {
        front: face((g, c) => {
          const img = new Image();
          img.onload = () => { const w = 400, h = w * img.height / img.width; g.drawImage(img, (512 - w) / 2, (292 - h) / 2, w, h); cardTex.front.needsUpdate = true; };
          img.src = url("sim/props/hp_lockup.png");
        }),
        back: face((g) => {
          g.fillStyle = "#f2b134"; g.textAlign = "center"; g.font = "bold 58px system-ui, sans-serif"; g.fillText("HAPPY PIPES", 256, 140);
          g.fillStyle = "#ffffff"; g.font = "bold 30px system-ui, sans-serif"; g.fillText("PLUMBING", 256, 190);
        }),
      };
    }
    const edge = new T.MeshStandardMaterial({ color: 0x5e2f90, roughness: 0.6 });
    const mats = [edge, edge, new T.MeshStandardMaterial({ map: cardTex.back, roughness: 0.55 }), new T.MeshStandardMaterial({ map: cardTex.front, roughness: 0.55 }), edge, edge];
    const m = new T.Mesh(new T.BoxGeometry(0.089, 0.0006, 0.051), mats);
    m.name = "prop_card"; m.castShadow = true;
    return m;
  }

  // The Happy Homes Guide (Jake 2026-10-29: "He needs to hand him the happy homes guide for real"; 2026-10-30: "it isn't really
  // big enough. It's a full size. It's like a magazine"): letter size (8.5 by 11 in), the brand purple like the card, the real
  // lockup, its name in the gold, and pages that turn. Jake: "he can even open it a little bit and like show a couple things in the
  // book before just immediately handing it over", and "John typically is going to flip through a couple pages too". Inside, a
  // page each for the features the script's S5 has him point out ("water softeners and filtration, tired or dripping faucets,
  // garbage disposals, tankless water heaters and recirculation pumps, and on the septic side, bacteria treatments, backflow
  // prevention, and clean-outs"): its name over a picture panel and lines of text. The words and pictures of the real guide are
  // the company's, and Jake has not sent them; these pages are stand-ins until he does.
  // Built in its own frame: across its x (the spine at -x), up its -z (the top edge), the front cover facing +y. Leaves turn about
  // the spine (userData.leaf(i, angle): 0 shut, PI turned right over); leaf 0 is the cover.
  const GUIDE_W = 0.216, GUIDE_H = 0.279;
  const GUIDE_PAGES = [
    ["Water Softeners & Filtration", "#2f7fc1"], ["Tired or Dripping Faucets", "#3a9b6b"], ["Garbage Disposals", "#7a5a3a"],
    ["Tankless Water Heaters & Recirculation", "#c0562f"], ["Septic Bacteria Treatments", "#5b8a2e"], ["Backflow Prevention & Clean-Outs", "#7b3fa0"],
  ];
  let guideTex = null;
  function guidePage(draw) {
    const c = document.createElement("canvas"); c.width = 432; c.height = 558;
    const g = c.getContext("2d"); draw(g);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; t.encoding = T.sRGBEncoding; t._draw = () => { draw(g); t.needsUpdate = true; };
    return t;
  }
  function guide() {
    if (!guideTex) {
      let logo = null;
      const cover = guidePage((g) => {
        g.fillStyle = "#5e2f90"; g.fillRect(0, 0, 432, 558);
        g.fillStyle = "#f2b134"; g.fillRect(46, 418, 340, 8);
        if (logo) { const w = Math.min(280, 180 * logo.width / logo.height), h = w * logo.height / logo.width; g.drawImage(logo, 216 - w / 2, 40, w, h); }
        g.textAlign = "center";
        g.fillStyle = "#f2b134"; g.font = "bold 70px system-ui, sans-serif"; g.fillText("HAPPY", 216, 300); g.fillText("HOMES", 216, 380);
        g.fillStyle = "#ffffff"; g.font = "bold 48px system-ui, sans-serif"; g.fillText("GUIDE", 216, 492);
      });
      const page = (title, col) => guidePage((g) => {
        g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, 432, 558);
        g.fillStyle = col; g.fillRect(0, 0, 432, 78);
        g.fillStyle = "#ffffff"; g.textAlign = "left"; g.font = "bold 26px system-ui, sans-serif";
        let line = "", y = 34;
        for (const w of title.split(" ")) { if (g.measureText(line + w).width > 390 && line) { g.fillText(line.trim(), 22, y); line = ""; y += 30; } line += w + " "; }
        g.fillText(line.trim(), 22, y);
        g.fillStyle = col; g.globalAlpha = 0.18; g.fillRect(22, 100, 388, 210); g.globalAlpha = 1;
        g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(22, 100, 388, 210);
        g.fillStyle = "#c9c6bf"; for (let i = 0; i < 9; i++) g.fillRect(22, 336 + i * 22, i % 4 === 3 ? 240 : 388, 9);
      });
      const blank = guidePage((g) => { g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, 432, 558); g.fillStyle = "#c9c6bf"; for (let i = 0; i < 18; i++) g.fillRect(22, 40 + i * 26, i % 5 === 4 ? 200 : 388, 9); });
      const back = guidePage((g) => { g.fillStyle = "#5e2f90"; g.fillRect(0, 0, 432, 558); g.fillStyle = "#f2b134"; g.textAlign = "center"; g.font = "bold 40px system-ui, sans-serif"; g.fillText("HAPPY PIPES", 216, 300); });
      guideTex = { cover, back, blank, pages: GUIDE_PAGES.map(([t, c]) => page(t, c)) };
      const img = new Image();
      img.onload = () => { logo = img; cover._draw(); };
      img.src = url("sim/props/hp_lockup.png");
    }
    const W = GUIDE_W, H = GUIDE_H, mat = (t) => new T.MeshStandardMaterial({ map: t, roughness: 0.6 });
    const g = new T.Group(); g.name = "prop_guide";
    // a page's two faces: the front facing +y (read with its top at -z), the back facing -y (read once turned over the spine)
    const face = (tex, up) => {
      const p = new T.Mesh(new T.PlaneGeometry(W, H), mat(tex));
      p.rotation.x = -Math.PI / 2;
      if (up) return p;
      const q = new T.Group(); q.add(p); q.rotation.z = Math.PI; return q;
    };
    // the back cover and the block of pages, a page on top of it
    const block = new T.Mesh(new T.BoxGeometry(W, 0.003, H), new T.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.9 }));
    block.position.y = 0.0015; g.add(block);
    const bottom = face(guideTex.back, false); bottom.position.y = -0.0002; g.add(bottom);
    const top = face(guideTex.blank, true); top.position.y = 0.0031; g.add(top);
    // the leaves: the cover, then three pages, each on a hinge at the spine
    const sides = [[guideTex.cover, guideTex.pages[0]], [guideTex.pages[1], guideTex.pages[2]], [guideTex.pages[3], guideTex.pages[4]], [guideTex.pages[5], guideTex.blank]];
    const leaves = sides.map(([f, b], i) => {
      const hinge = new T.Group(); hinge.position.set(-W / 2, 0.0034 + (sides.length - i) * 0.0005, 0);
      const fr = face(f, true), bk = face(b, false);
      fr.position.set(W / 2, 0.0002, 0); bk.position.set(W / 2, -0.0002, 0);
      hinge.add(fr, bk); g.add(hinge);
      return hinge;
    });
    g.userData.leaves = leaves;
    // a turned leaf rests a little short of flat, each later one higher, so they lie on one another in the order turned
    g.userData.leaf = (i, a) => { leaves[i].rotation.z = Math.min(a, Math.PI - 0.05 - 0.03 * i); };
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // His phone, for the picture under the sink (Jake 2026-10-30: in time the whole job flow runs on it, the checklist and the
  // pictures in the Comms app): a black slab with a lit screen (on its -y face), the flash on its back.
  function phone() {
    const g = new T.Group(); g.name = "prop_phone";
    const body = new T.Mesh(new T.BoxGeometry(0.152, 0.008, 0.072), new T.MeshStandardMaterial({ color: 0x16181c, roughness: 0.4, metalness: 0.3 }));
    const screen = new T.Mesh(new T.PlaneGeometry(0.14, 0.064), new T.MeshBasicMaterial({ color: 0x9fc4e8 }));
    screen.rotation.x = Math.PI / 2; screen.position.y = -0.0042;
    const flash = new T.PointLight(0xffffff, 0, 2.5); flash.position.set(0.05, 0.02, 0);
    g.add(body, screen, flash);
    g.userData.flash = flash;
    return g;
  }

  // His toolbag (round 3p, Jake 2026-10-31: "The tech needs a toolbag in his hand ... Small toolbag. He takes it to the door with
  // him"; the Comms app's kit list: "A small set of diagnostic tools ... The full tote bag stays in the truck"): a small soft
  // tradesman's bag, charcoal canvas on a moulded base, a purple band and the lockup on its side, two webbing handles that meet
  // over the zip. Built standing on its base at y 0, its length along x, the handles' grip at (0, GRIP_Y, 0), so it hangs from
  // that point in a hand (the scenario places it each frame) and stands on the floor where it is put down.
  const BAG = { L: 0.34, W: 0.15, H: 0.22, GRIP_Y: 0.33 };
  function toolbag() {
    const g = new T.Group(); g.name = "prop_toolbag";
    const m = (c, r, me = 0) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const canvas = m(0x2c2e33, 0.95), purple = m(0x5e2f90, 0.8), base = m(0x17181b, 0.7);
    // the body: its end profile (width by height) with the top rounded over, run along its length
    const sh = new T.Shape(), w = BAG.W / 2, h = BAG.H, r = 0.055;
    sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, 0);
    const body = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: BAG.L - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 }), canvas);
    body.rotation.y = Math.PI / 2; body.position.x = -(BAG.L - 0.02) / 2;
    const foot = new T.Mesh(new T.BoxGeometry(BAG.L + 0.012, 0.035, BAG.W + 0.016), base); foot.position.y = 0.0175;
    const band = new T.Mesh(new T.BoxGeometry(BAG.L + 0.004, 0.03, BAG.W + 0.02), purple); band.position.y = 0.05;
    const zip = new T.Mesh(new T.BoxGeometry(BAG.L - 0.04, 0.006, 0.012), m(0x111214, 0.5, 0.3)); zip.position.y = h + 0.008;
    g.add(body, foot, band, zip);
    // the lockup on each side, on a purple patch
    const patch = (sg) => {
      const p = new T.Mesh(new T.PlaneGeometry(0.15, 0.075), new T.MeshStandardMaterial({ map: cardFace(), roughness: 0.7 }));
      p.position.set(0, 0.13, sg * (BAG.W / 2 + 0.0105)); if (sg < 0) p.rotation.y = Math.PI;
      return p;
    };
    g.add(patch(1), patch(-1));
    // two handles, one from each long side, meeting over the middle where the hand takes them
    for (const sg of [1, -1]) {
      const pts = [new T.Vector3(-0.09, h - 0.01, sg * (w - 0.005)), new T.Vector3(-0.07, BAG.GRIP_Y - 0.03, sg * 0.03), new T.Vector3(0, BAG.GRIP_Y, sg * 0.006), new T.Vector3(0.07, BAG.GRIP_Y - 0.03, sg * 0.03), new T.Vector3(0.09, h - 0.01, sg * (w - 0.005))];
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.007, 6, false), m(0x1d1e22, 0.85)));
    }
    const wrap = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.1, 10), m(0x111214, 0.6)); wrap.rotation.z = Math.PI / 2; wrap.position.y = BAG.GRIP_Y - 0.004;
    g.add(wrap);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.gripY = BAG.GRIP_Y;
    return g;
  }
  // the card's lockup face, once (the bag's patches use it too)
  function cardFace() { if (!cardTex) card(); return cardTex.front; }

  // His tablet (round 3p, Jake 2026-10-31: "typically we'll be using a tablet ... as we're using our application to actually show
  // y'all ... If you can show anything, you need to show the clipboard or even some of those pictures out of the Happy Home guides,
  // because there's the field diagrams. You can look into the Happy Pipes comms app"): a 10 inch tablet in a black rugged case,
  // its screen a page of the app: the purple bar, the page's title, its picture. pages: [{title, img}] (img under sim/props);
  // userData.show(i) puts page i up. Built lying in the hand's axes like the clipboard: long side x, the screen on its -y face.
  function tablet(pages) {
    const W = 0.25, H = 0.17, c = document.createElement("canvas"); c.width = 1024; c.height = 696;
    const ctx = c.getContext("2d"), tex = new T.CanvasTexture(c); tex.anisotropy = 4; tex.encoding = T.sRGBEncoding;
    // (a page whose picture is not there is left out: the public site carries only the pictures cleared for it, round 3p)
    const imgs = pages.map((p) => { const im = new Image(); im.onload = () => { if (cur === pages.indexOf(p)) draw(cur); }; im.onerror = () => { p.missing = true; draw(cur); }; im.src = url("sim/props/" + p.img); return im; });
    let cur = 0;
    function draw(i) {
      cur = i; const p = pages[i], im = imgs[i];
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1024, 696);
      ctx.fillStyle = "#5e2f90"; ctx.fillRect(0, 0, 1024, 92);
      ctx.fillStyle = "#f2b134"; ctx.font = "bold 34px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText("HAPPY PIPES", 28, 58);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 34px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.fillText(p.title, 996, 58);
      if (im.complete && im.naturalWidth) {
        const bw = 980, bh = 560, s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
        ctx.drawImage(im, 512 - iw / 2, 106 + (bh - ih) / 2, iw, ih);
      }
      const shown = pages.filter((q) => !q.missing);
      shown.forEach((q, k) => { ctx.fillStyle = q === p ? "#5e2f90" : "#cfc9d8"; ctx.beginPath(); ctx.arc(512 + (k - (shown.length - 1) / 2) * 26, 680, 7, 0, 7); ctx.fill(); });
      tex.needsUpdate = true;
    }
    draw(0);
    const g = new T.Group(); g.name = "prop_tablet";
    const caseM = new T.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.75 });
    const body = new T.Mesh(new T.BoxGeometry(W + 0.02, 0.014, H + 0.02), caseM);
    const glass = new T.Mesh(new T.PlaneGeometry(W - 0.012, H - 0.012), new T.MeshBasicMaterial({ map: tex }));
    glass.rotation.x = Math.PI / 2; glass.position.y = -0.0072;
    g.add(body, glass);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = o !== glass; } });
    g.userData.show = (i) => { i = Math.max(0, Math.min(pages.length - 1, i)); if (!pages[i].missing) draw(i); };
    g.userData.pages = pages.length;
    return g;
  }

  // Shoe covers (Jake 2026-10-30: "like little shoe covers. They're like a little light blue thingy, like a shower cap on their
  // feet ... forms to the foot, forms to the boot"): a copy of each shoe's own skin, a few millimetres out from it, light blue and
  // a little crumpled, moving with the foot. Hidden until he puts them on (covers.L, covers.R); covers.bundle is the pair in his
  // hand before they go on.
  function shoeCovers(p) {
    let skin = null;
    p.root.traverse((o) => { if (o.isSkinnedMesh && !skin && /body/i.test([].concat(o.material)[0].name)) skin = o; });
    const out = { L: null, R: null, bundle: null };
    if (!skin) return out;
    // (r128: a skinned mesh's material says so, or it is drawn unposed)
    const mat = new T.MeshStandardMaterial({ color: 0x9fd0f2, roughness: 0.85, side: T.DoubleSide, skinning: true });
    const geo = skin.geometry, nrm = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const bones = skin.skeleton.bones.map((b) => b.name);
    for (const S of ["L", "R"]) {
      const want = new Set([`Bip01_${S}_Foot`, `Bip01_${S}_Toe0`].map((n) => bones.indexOf(n)).filter((i) => i >= 0));
      const c4 = (at, v, k) => [at.getX, at.getY, at.getZ, at.getW][k].call(at, v);       // (r128 has no getComponent)
      const onFoot = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (want.has(c4(si, v, k))) w += c4(sw, v, k); return w >= 0.5; };
      const idx = geo.index ? geo.index.array : [...Array(geo.attributes.position.count).keys()];
      const keep = [];
      for (let i = 0; i < idx.length; i += 3) if (onFoot(idx[i]) && onFoot(idx[i + 1]) && onFoot(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      if (!keep.length) continue;
      const g = geo.clone(), P = g.attributes.position;
      // a few millimetres out along the skin's normals, a little more or less at each point: crumpled. The skin is not in metres
      // (Rocketbox: centimetres, under a 0.01 scale), so a metre in the world is measured in its units first.
      p.root.updateMatrixWorld(true);
      const bw = new T.Box3(), bg = new T.Box3(), tv = new T.Vector3();
      for (const v of keep) { skin.boneTransform(v, tv); bw.expandByPoint(tv.applyMatrix4(skin.matrixWorld)); bg.expandByPoint(tv.fromBufferAttribute(P, v)); }
      const unit = bg.getSize(new T.Vector3()).length() / Math.max(1e-6, bw.getSize(new T.Vector3()).length());
      for (let v = 0; v < P.count; v++) {
        const d = unit * (0.006 + 0.005 * Math.abs((Math.sin(v * 12.9898) * 43758.5453) % 1));
        P.setXYZ(v, P.getX(v) + nrm.getX(v) * d, P.getY(v) + nrm.getY(v) * d, P.getZ(v) + nrm.getZ(v) * d);
      }
      g.setIndex(keep);
      const m = new T.SkinnedMesh(g, mat);
      m.name = `prop_cover_${S}`; m.frustumCulled = false; m.castShadow = true; m.visible = false;
      skin.parent.add(m);
      m.bind(skin.skeleton, skin.bindMatrix);
      out[S] = m;
    }
    const bundle = new T.Mesh(new T.IcosahedronGeometry(0.035, 1), new T.MeshStandardMaterial({ color: 0x9fd0f2, roughness: 0.85 }));
    bundle.scale.set(1.3, 0.7, 1); bundle.name = "prop_cover_bundle";
    out.bundle = bundle;
    return out;
  }

  // ---- knocking: a knuckle on a wooden door, made on the spot (Web Audio: a short knock of filtered noise and a low thump), so
  // there is no sound file to fetch. unlockAudio() starts the audio on the Start tap, as phones require.
  let actx = null;
  function knockSound(soft = false) {
    if (!actx || !isLive || muted) return;
    const t0 = actx.currentTime, gain = soft ? 0.12 : 0.55;
    const len = Math.floor(actx.sampleRate * 0.09), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.012));
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = soft ? 1400 : 950; bp.Q.value = 1.2;
    const g1 = actx.createGain(); g1.gain.value = gain;
    src.connect(bp).connect(g1).connect(actx.destination); src.start(t0);
    const o = actx.createOscillator(); o.frequency.setValueAtTime(soft ? 210 : 150, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.08);
    const g2 = actx.createGain(); g2.gain.setValueAtTime(gain * 0.9, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    o.connect(g2).connect(actx.destination); o.start(t0); o.stop(t0 + 0.12);
  }

  // A polyline with its corners rounded: each inner corner becomes a curve starting up to r before it and ending up to r after
  // (less on short legs), so a person walking it turns smoothly through the corner.
  function rounded(pts, r) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1], b = pts[i + 1];
      const la = p.distanceTo(a), lb = p.distanceTo(b);
      const c = Math.min(r, la * 0.45, lb * 0.45);
      if (c < 0.02) { out.push(p); continue; }
      const p0 = p.clone().addScaledVector(a.clone().sub(p).normalize(), c), p2 = p.clone().addScaledVector(b.clone().sub(p).normalize(), c);
      for (let k = 0; k <= 6; k++) { const t = k / 6; out.push(p0.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * t * (1 - t)).addScaledVector(p2, t * t)); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // a bone turned by d (a world-space rotation) about its own joint
  const pq = new T.Quaternion(), tq = new T.Quaternion(), fq = new T.Quaternion(), ZAX = new T.Vector3(0, 0, 1), YAX = new T.Vector3(0, 1, 0);
  const LIMB = /UpperArm|Forearm|Hand|Finger|Thigh|Calf|Foot|Toe/;
  const OK_IN = 0.02;                                      // an arm resting on him (an elbow at his side) touches; the slices are rounded boxes
  const MAX_TURN = 0.35;                                   // keepArmsOut turns no part more than this (radians): swung right out of him John's
                                                           // elbow came up to his shoulder like a chicken's wing, worse than what it fixed
  const STEP = 0.03;                                       // radians a step, keepArmsOut
  const rq = new T.Quaternion(), tq2 = new T.Quaternion(), pq2 = new T.Quaternion();
  function turnBone(b, d) {
    b.parent.getWorldQuaternion(pq);
    b.quaternion.premultiply(tq.copy(pq).invert().multiply(d).multiply(pq));
    b.updateMatrixWorld(true);
  }
  // Two bones (an upper arm and forearm, a thigh and calf) turned so the end joint (the wrist, the ankle) comes to target, the
  // middle joint (elbow, knee) bending towards pole; k blends it in over the pose as it was.
  function twoBone(up, mid, end, target, pole, k) {
    const v = (o) => o.getWorldPosition(new T.Vector3());
    const s = v(up), e = v(mid), w = v(end);
    const a = s.distanceTo(e), b = e.distanceTo(w);
    const d = target.clone().sub(s);
    const dl = Math.max(Math.abs(a - b) + 0.01, Math.min(d.length(), (a + b) * 0.995));
    const dir = d.normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + dl * dl - b * b) / (2 * a * dl)));
    const elbow = s.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(1 - cosA * cosA));
    turnBone(up, new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), elbow.sub(s).normalize()), k));
    const e2 = v(mid), w2 = v(end), tgt = s.clone().addScaledVector(dir, dl);
    turnBone(mid, new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(w2.sub(e2).normalize(), tgt.sub(e2).normalize()), k));
  }

  // ---- the ground and what is in the way, for people the trainee steers (player.js) and for walks with ground: true
  let floorList = null, wallList = null, glassList = null;
  function floors() {
    if (!floorList) { floorList = []; W().scene.traverse((o) => { if (o.isMesh && /^(col_|floor_|stair_|site_mow|trim_step|trim_porch_cap)/.test(o.name)) floorList.push(o); }); }
    return floorList;
  }
  const rcDown = new T.Raycaster(), rcSide = new T.Raycaster();
  // the height of the walkable surface under (x, z), searching down from y (so a floor overhead does not count)
  function groundAt(x, z, y = 3) {
    rcDown.set(new T.Vector3(x, y, z), new T.Vector3(0, -1, 0)); rcDown.far = 6;
    const h = rcDown.intersectObjects(floors(), false).find((x) => !x.face || x.face.normal.y > 0.3);
    return h ? h.point.y : null;
  }
  // Would a body of radius r at p (feet), moving along the flat direction dir by step, hit something: the house walls (the col_
  // shells, knee and chest height), furniture and fixtures (porch rails, columns), a door leaf where it stands now, another person.
  function blockedMove(p, dir, step, r = 0.24, self = null) {
    if (!wallList) {
      wallList = []; W().scene.traverse((o) => { if (o.isMesh && /^col_/.test(o.name)) wallList.push(o); });
    }
    // where each door stands now (its swing is set on the node; the world matrices are only refreshed when a frame is drawn)
    const doorMeshes = []; for (const d of W().doors) { d.updateMatrixWorld(true); d.traverse((o) => { if (o.isMesh) doorMeshes.push(o); }); }
    for (const hgt of [0.45, 1.2]) {
      rcSide.set(new T.Vector3(p.x, p.y + hgt, p.z), dir); rcSide.far = r + step;
      if (rcSide.intersectObjects(wallList, false).some((x) => !x.face || Math.abs(x.face.normal.y) < 0.5)) return "wall";
      if (rcSide.intersectObjects(doorMeshes, false).length) return "door";
    }
    const q = p.clone().addScaledVector(dir, step);
    for (const [nm, b] of furnitureBoxes()) {
      if (b.max.y < q.y + 0.3 || b.min.y > q.y + 1.7) continue;
      if (q.x > b.min.x - r && q.x < b.max.x + r && q.z > b.min.z - r && q.z < b.max.z + r) return nm;
    }
    for (const o of Object.values(people)) if (o !== self && o.root.visible && Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < r + 0.24) return o.name;
    return null;
  }
  let furnBoxes = null;
  function furnitureBoxes() {
    if (furnBoxes) return furnBoxes;
    furnBoxes = [];
    W().scene.traverse((o) => {
      if (!o.visible || !/^(furn_|fix_)/.test(o.name) || /^(furn_rug|fix_frame_|fix_walkway_attic|fix_beam_)/.test(o.name)) return;
      if (o.parent && /^(furn_|fix_)/.test(o.parent.name)) return;
      const b = new T.Box3().setFromObject(o);
      if (b.isEmpty() || b.max.y - b.min.y < 0.05) return;
      furnBoxes.push([o.name, b]);
    });
    return furnBoxes;
  }
  // The windows (their glass), for "never look in windows": a person is looking in when he stands within 0.8 m of the glass,
  // in front of it (not off past its edge) and facing it.
  function windows() {
    if (!glassList) {
      glassList = [];
      W().scene.traverse((o) => {
        if (!o.isMesh || !/^win_/.test(o.name) || ![].concat(o.material).some((m) => m && (m.transparent || m.opacity < 1))) return;
        const b = new T.Box3().setFromObject(o), s = b.getSize(new T.Vector3());
        if (s.y < 0.5) return;
        glassList.push({ name: o.name, b, alongX: s.x > s.z });
      });
    }
    return glassList;
  }
  function lookingIn(p) {
    const fwd = new T.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    for (const g of windows()) {
      if (g.b.max.y < p.pos.y + 1.4 || g.b.min.y > p.pos.y + 1.75) continue;
      const c = g.b.getCenter(new T.Vector3());
      const lat = g.alongX ? Math.abs(p.pos.x - c.x) - (g.b.max.x - g.b.min.x) / 2 : Math.abs(p.pos.z - c.z) - (g.b.max.z - g.b.min.z) / 2;
      const off = g.alongX ? Math.abs(p.pos.z - c.z) : Math.abs(p.pos.x - c.x);
      if (lat > 0.12 || off > 0.8) continue;
      const to = g.alongX ? new T.Vector3(0, 0, Math.sign(c.z - p.pos.z)) : new T.Vector3(Math.sign(c.x - p.pos.x), 0, 0);
      if (fwd.dot(to) > Math.cos(55 * Math.PI / 180)) return g.name;
    }
    return null;
  }
  // a door's handle on one side, in the world, wherever the door has swung to
  function handlePoint(name, inside = true) {
    const d = door(name);
    if (!d) return null;
    if (!d.userData.handleLocal) {
      // in the door's own frame, so it does not matter how far it is open: the small part is the handle (both knobs), its
      // two faces are the two sides (inside is -z for the front door, which opens into the house)
      const box = (o) => { o.geometry.computeBoundingBox(); return o.geometry.boundingBox.clone().applyMatrix4(o.matrix); };
      const hm = d.children.find((o) => o.isMesh && (() => { const b = box(o); return b.max.y - b.min.y < 0.2; })());
      const b = hm ? box(hm) : new T.Box3(new T.Vector3(), new T.Vector3()), c = b.getCenter(new T.Vector3());
      d.userData.handleLocal = { in: new T.Vector3(c.x, c.y, b.min.z - 0.01), out: new T.Vector3(c.x, c.y, b.max.z + 0.01) };
    }
    // (where the door stands now: its world matrix can be a frame or a whole swing behind its rotation, and John reached for where
    // the handle had been when it was shut, his hand jumping 0.6 m when it caught up, round 3p)
    d.updateMatrixWorld(true);
    return d.localToWorld(d.userData.handleLocal[inside ? "in" : "out"].clone());
  }

  const angleDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

  // How far a move turns and steps the body, in the person's own frame: the pelvis's facing and place at the clip's
  // first and last frame. Measured once per clip on a scratch mixer, so the live one is not disturbed.
  function measureMove(p, name) {
    p._moves = p._moves || {};
    if (p._moves[name]) return p._moves[name];
    const c = p.clips[name];
    const pelvis = p.root.getObjectByName((c.tracks.find((t) => /Pelvis\.(quaternion|position)$/.test(t.name)) || { name: "Bip01_Pelvis.x" }).name.split(".")[0]);
    const save = p.root.matrixWorld.clone(), m = new T.AnimationMixer(p.root), a = m.clipAction(c);
    a.play();
    let axis = null;
    const sample = (t) => {
      a.time = t; m.update(0);
      p.root.position.set(0, 0, 0); p.root.rotation.set(0, 0, 0); p.root.updateMatrixWorld(true);
      const q = pelvis.getWorldQuaternion(new T.Quaternion()), pos = pelvis.getWorldPosition(new T.Vector3());
      // the pelvis axis that points ahead at the clip's start (every turn and sit starts facing +z, the root's forward)
      if (!axis) axis = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => new T.Vector3(...v))
        .sort((u, w) => w.clone().applyQuaternion(q).z - u.clone().applyQuaternion(q).z)[0];
      const f = axis.clone().applyQuaternion(q).setY(0).normalize();
      return { yaw: Math.atan2(f.x, f.z), x: pos.x, z: pos.z };
    };
    const a0 = sample(0), a1 = sample(c.duration);
    a.stop(); m.uncacheRoot(p.root);
    p.sync(); p.root.updateMatrixWorld(true);
    const out = { yaw: angleDiff(a1.yaw, a0.yaw), fwd: a1.z - a0.z, side: a1.x - a0.x };
    p._moves[name] = out;
    return out;
  }

  // The Rocketbox walk carries its travel in the pelvis (Bip01 Pelvis moves 1.2 m forward over one 1.23 s cycle; the
  // feet plant). Take the straight-line travel out of the pelvis track so the clip walks on the spot, keep the
  // natural surge and bob, and return the pace it walked at, in metres per second at this person's scale.
  function inPlace(p, name) {
    const c = p.clips[name];
    const tr = c && c.tracks.find((t) => /Pelvis\.position$/.test(t.name));
    if (!tr) return null;
    const v = tr.values, n = tr.times.length, tEnd = tr.times[n - 1] || 1;
    const pelvis = p.root.getObjectByName(tr.name.replace(/\.position$/, ""));
    const q = pelvis.parent.getWorldQuaternion(new T.Quaternion());
    const up = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)].map((a) => Math.abs(a.applyQuaternion(q).y));
    const ui = up.indexOf(Math.max(...up));
    const d = [0, 1, 2].map((k) => (k === ui ? 0 : v[(n - 1) * 3 + k] - v[k]));
    for (let i = 0; i < n; i++) { const f = tr.times[i] / tEnd; for (let k = 0; k < 3; k++) v[i * 3 + k] -= d[k] * f; }
    const ws = pelvis.parent.getWorldScale(new T.Vector3()).x;
    return Math.hypot(...d) * ws / c.duration;
  }

  // ---------------------------------------------------------------------------------------------------- the house
  const W = () => window.walk;
  function door(name) { return W().doors.find((d) => d.name === name); }
  function openDoor(name, open = true) { const d = door(name); if (d && !!d.userData.open !== open) W().toggleDoor(d); }
  // a door straight to open or shut, with no swing (for starting a step part way through the visit)
  function setDoor(name, open) {
    const d = door(name);
    if (!d) return;
    if (!!d.userData.open !== open) W().toggleDoor(d);
    for (let i = 0; i < 120; i++) W().stepDoors(0.05);
  }
  function wp(name) { const v = new T.Vector3(); W().waypoints[name].getWorldPosition(v); return [v.x, v.y, v.z]; }

  // Anything a person would walk through along a path: furniture and fixtures (their boxes, grown by a body's
  // radius) and the house's own walls (rays at knee and chest height against the col_ meshes).
  function checkPath(points, radius = 0.22) {
    const boxes = [];
    W().scene.traverse((o) => {
      if (!o.visible || !/^(furn_|fix_)/.test(o.name) || /^(furn_rug|fix_frame_)/.test(o.name)) return;
      if (o.parent && /^(furn_|fix_)/.test(o.parent.name)) return;
      const b = new T.Box3().setFromObject(o);
      if (b.max.y - b.min.y < 0.05 || b.min.y > 1.7) return;
      boxes.push([o.name, b.expandByScalar(radius)]);
    });
    const cols = [];
    W().scene.traverse((o) => { if (o.isMesh && /^col_/.test(o.name)) cols.push(o); });
    const hits = new Map();
    const rc = new T.Raycaster();
    for (let i = 1; i < points.length; i++) {
      const a = new T.Vector3(...points[i - 1]), b = new T.Vector3(...points[i]);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.1));
      for (let k = 0; k <= n; k++) {
        const p = new T.Vector3().lerpVectors(a, b, k / n);
        for (const [nm, bx] of boxes) {
          if (bx.max.y < p.y + 0.05 + radius || bx.min.y > p.y + 1.8) continue;
          const q = new T.Vector3(p.x, Math.max(bx.min.y + 0.01, Math.min(bx.max.y - 0.01, p.y + 0.6)), p.z);
          if (bx.containsPoint(q)) hits.set(nm, (hits.get(nm) || 0) + 1);
        }
      }
      for (const hgt of [0.45, 1.2]) {
        const s = a.clone(); s.y += hgt;
        const dir = b.clone(); dir.y += hgt; dir.sub(s);
        const len = dir.length(); if (len < 1e-4) continue;
        rc.set(s, dir.normalize()); rc.far = len;
        const h = rc.intersectObjects(cols, false).filter((x) => x.object.name !== "col_floor1_4" && Math.abs(x.face.normal.y) < 0.5);
        if (h.length) hits.set(`${h[0].object.name} (leg ${i})`, 1);
      }
    }
    return [...hits.entries()];
  }

  // ---------------------------------------------------------------------------------------------------- stepping
  const people = {};
  let clock = 0, isLive = false;
  const camera = { follow: null };
  const timers = [];                                      // the director's own waits, cancellable like a person's
  const watchers = [];                                    // until(): conditions checked every step, cancellable too
  const late = [];                                        // run every step after the bodies and faces (a scenario's carried props)
  function step(dt) {
    clock += dt;
    if (!isLive) W().stepDoors(dt);                       // live, walk.js's own frame loop swings the doors
    for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { timers[i].res(); timers.splice(i, 1); }
    for (let i = watchers.length - 1; i >= 0; i--) if (watchers[i].fn(dt)) { watchers[i].res(); watchers.splice(i, 1); }
    for (const p of Object.values(people)) p.update(dt);
    for (const p of Object.values(people)) if (p.face && p.root.visible) p.face.update(clock, dt);
    for (const p of Object.values(people)) p.finish(dt);
    for (const f of late) f(dt);                          // props carried by a posed hand (the clipboard): after every body is final
    for (const p of Object.values(people)) p.recordFinal();
    if (camera.follow) camera.follow(dt);
    if (sim.onStep) sim.onStep(dt);
  }
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const wait = (sec) => new Promise((res, rej) => timers.push({ at: clock + sec, res, rej }));
  // resolves once fn(dt) returns true (checked every step; fn can also just watch, and return true when it is done)
  const until = (fn) => new Promise((res, rej) => watchers.push({ fn, res, rej }));
  function cancelAll() {
    for (const p of Object.values(people)) p.cancel();
    timers.splice(0).forEach((t) => t.rej(new Cancelled()));
    watchers.splice(0).forEach((t) => t.rej(new Cancelled()));
    stopVoices();
    for (const p of Object.values(people)) if (p.face) p.face.stop();
  }
  // live: step on every animation frame (a real browser; the preview pane is stepped by hand)
  function live(on = true) {
    isLive = on;
    if (!on) return;
    let last = performance.now();
    const tick = (now) => { if (!isLive) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // The camera through walk.js: it sets its camera from its own position, yaw and pitch every frame, so a shot sets
  // those (fly on, so it does not pull the eye down to standing height); the camera is also set at once for snaps.
  function setCam(x, y, z, tx, ty, tz) {
    const c = W().camera, d = new T.Vector3(tx - x, ty - y, tz - z).normalize();
    const yaw = Math.atan2(-d.x, -d.z), pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    W().pos.set(x, y, z);
    W().setView(yaw, pitch);
    c.position.set(x, y, z); c.rotation.set(0, 0, 0); c.rotateY(yaw); c.rotateX(pitch); c.updateMatrixWorld(true);
    W().updateLights && W().updateLights();
  }
  function freeCam() { camera.follow = null; W().setFly(false); }

  // A frame as a JPEG. walk.snap() is the only way to render while the pane is hidden (no requestAnimationFrame), and it
  // encodes a PNG every time, which is most of the cost. The PNG it asks for is skipped for that one call; the JPEG is
  // read in the same task, before the drawing buffer is cleared.
  function frameJpeg(q = 0.92) {
    const proto = HTMLCanvasElement.prototype, real = proto.toDataURL;
    proto.toDataURL = function (type, ...a) { return type === "image/png" ? "" : real.call(this, type, ...a); };
    try { W().snap(); } finally { proto.toDataURL = real; }
    return document.querySelector("canvas").toDataURL("image/jpeg", q);
  }

  // One file to the local server. A save that never answers (seen once while a house rebuild had the disk busy) is
  // abandoned after 15 s and sent again, so a recording cannot hang on it.
  async function save(path, dataUrl) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
      try { const r = await fetch(`${BASE}save?name=${path}`, { method: "POST", body: dataUrl, signal: ctl.signal }); if (r.ok) return; }
      catch (e) { /* timed out or refused: try again */ }
      finally { clearTimeout(timer); }
    }
    throw new Error(`could not save ${path}`);
  }
  const jsonUrl = (o) => "data:application/json;base64," + btoa(unescape(encodeURIComponent(JSON.stringify(o))));

  // Run a job (a promise-returning function) stepped at fps and save every frame (<name>/f00000.jpg ...), plus
  // captions.json and voices.json (when each line started, for the soundtrack).
  async function record(name, job, { fps = 30, tail = 1.5, max = 600 } = {}) {
    let state = null;
    captions.length = 0; voiceLog.length = 0;
    const t0 = clock;
    job().then(() => (state = "done"), (e) => (state = "ERROR " + e.message));
    let i = 0, endAt = null;
    while (i < fps * max) {
      step(1 / fps);
      await flush();
      await save(`${name}/f${String(i).padStart(5, "0")}.jpg`, frameJpeg());
      i++;
      if (state && endAt === null) endAt = i + Math.round(tail * fps);
      if (endAt !== null && i >= endAt) break;
    }
    await save(`${name}/captions.json`, jsonUrl(captions.map((c) => [+(c[0] - t0).toFixed(3), c[1]])));
    await save(`${name}/voices.json`, jsonUrl(voiceLog.map((v) => [+(v[0] - t0).toFixed(3), v[1]])));
    return { frames: i, state };
  }

  async function load(name, url, height, movesUrl) {
    const gl = (u) => new Promise((res, rej) => new T.GLTFLoader().load(u, res, undefined, rej));
    const g = await gl(url);
    const p = new Person(name, g, height);
    for (const u of [].concat(movesUrl || [])) {
      try { p.addClips((await gl(u)).animations); }
      catch (e) { console.warn(`${name}: no move pack at ${u}`); }
    }
    W().scene.add(p.root);
    // scale to the wanted standing height, measured on the skinned body in its idle pose
    p.play("idle_neutral_01", { fade: 0 }); p.mixer.update(0.5); p.root.updateMatrixWorld(true);
    const box = new T.Box3(), v = new T.Vector3();
    p.root.traverse((o) => { if (!o.isSkinnedMesh) return; const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i += 5) { o.boneTransform(i, v); box.expandByPoint(v.applyMatrix4(o.matrixWorld)); } });
    if (height) p.root.scale.setScalar(height / (box.max.y - box.min.y));
    p.root.updateMatrixWorld(true);
    p.walkSpeed = inPlace(p, "walk_neutral_01") || 1.2;
    p.face = new window.SimFace.Face(p, 7 + Object.keys(people).length * 101);
    people[name] = p;
    return p;
  }

  // ---------------------------------------------------------------------------------------------------- voiced lines
  // sim/lines/<scenario>.json: who says what, which body-language move goes with it; the recording and its sound
  // timing in speech/lines/<scenario>/<id>/ (sim/voice_lines.py).
  const lines = {};
  let lineSet = null;
  const voices = new Set();
  const voiceLog = [], captions = [];
  let muted = false;
  async function loadLines(scen) {
    await fileList();
    lineSet = await (await fetch(url(`sim/lines/${scen}.json`))).json();
    await Promise.all(lineSet.lines.map(async (ln) => {
      const dir = `speech/lines/${scen}/${ln.id}/`;
      const [sp, ph] = await Promise.all([fetch(url(dir + "speech.json")).then((r) => r.json()), fetch(url(dir + "phones.json")).then((r) => r.json())]);
      lines[ln.id] = { ...ln, sp, ph, audio: dir + sp.audio };
    }));
    return lineSet;
  }
  function stopVoices() { for (const a of voices) { a.pause(); } voices.clear(); }
  // A phone (an iPhone above all) plays sound only from an element that first played inside a tap, and a line starts seconds after
  // one. So unlockAudio(), called from the Start button, plays a muted moment on two elements, and the lines take turns on them.
  const pool = [];
  let poolNext = 0;
  function unlockAudio() {
    const first = Object.values(lines)[0];
    // an iPhone with its ring switch on silent mutes Web Audio (the knock) but not the voices; as media playback it plays both
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older phones: no such setting */ }
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { actx = null; }
    if (pool.length || !first) return;
    for (let i = 0; i < 2; i++) {
      const a = new Audio(url(first.audio));
      a.muted = true;
      a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; });
      pool.push(a);
    }
  }
  function voice(url) {
    if (!pool.length) return new Audio(url);
    const a = pool[poolNext++ % pool.length];
    a.pause(); a.muted = false; a.src = url;
    return a;
  }

  // One line: the speaker talks (lips from the recording, the line's move), the listener listens (its listen move),
  // both look at each other. Resolves when the voice has finished, plus a short beat. o.to: who he says it to (a
  // person, or "trainee" for the camera in practice mode).
  async function say(id, o = {}) {
    const ln = lines[id];
    if (!ln) throw new Error("no line " + id);
    const sp = people[ln.who];
    const to = o.to === "trainee" ? null : (o.to || Object.values(people).find((q) => q !== sp && q.root.visible));
    const lookAtTo = to ? () => to.eyes() : () => W().camera.position.clone();
    ln.L = ln.L || window.SimFace.buildLine(ln.sp, ln.ph, sp.face.gapOf, ln.face);
    // turn to face the other person first if they are well off to the side and both are on their feet
    if (o.turn !== false && sp.base === "idle_neutral_01" && !sp.walking) {
      const tp = to ? to.pos : W().camera.position;
      const d = Math.abs(angleDiff(Math.atan2(tp.x - sp.pos.x, tp.z - sp.pos.z), sp.heading));
      if (d > 55 * Math.PI / 180) await sp.turnToward(tp.x, tp.z);
    }
    let audio = null;
    if (isLive && !muted) { audio = voice(url(ln.audio)); voices.add(audio); audio.play().catch(() => {}); }
    voiceLog.push([clock, ln.audio]);
    captions.push([clock, `${o.name || sim.names[ln.who] || ln.who}: “${ln.text}”`]);
    sim.current = { id, who: ln.who, text: ln.text, step: ln.step };
    if (sim.onLine) sim.onLine(sim.current);
    sp.face.target = lookAtTo;
    sp.face.say(ln.L, clock, audio);
    const hold = ln.L.spoken + 0.2;
    if (o.move !== null) sp.gesture(o.move || ln.move, hold);
    if (to) {
      to.face.target = () => sp.eyes();
      to.face.hear(ln.L, clock, audio);
      if (o.listen !== null) to.gesture(o.listen || ln.listen, hold);
    }
    // something done while it is said (o.during: the guide handed over as he offers it), started with the words
    const side = o.during ? o.during() : null;
    await wait(ln.L.spoken + (o.gap ?? 0.35));
    if (side) await side;
    if (audio) voices.delete(audio);
  }

  // ---------------------------------------------------------------------------------------------------- scenarios
  // A scenario file (sim/scenario_<name>.js) puts {title, lines, people, steps: [{num, start(sim), run(sim)}], shots}
  // on window.SCENARIOS[name]. The step player (player.js) runs one step at a time.
  let scenario = null;
  const look = new T.Vector3();
  function shot(name) {
    if (sim.freeCamera) return;
    const s = scenario.shots[name];
    let first = true;
    const at = new T.Vector3(), to = new T.Vector3();
    W().setFly(true);
    camera.follow = (dt) => {
      const want = s.look(sim);
      const p = typeof s.pos === "function" ? s.pos(sim) : s.pos;
      to.set(p[0], p[1], p[2]);
      // a moving camera (pos a function: following someone up the driveway) eases after its spot, as a camera operator would
      if (first) { look.copy(want); at.copy(to); first = false; } else { look.lerp(want, Math.min(1, dt * 3)); at.lerp(to, Math.min(1, dt * 1.2)); }
      setCam(at.x, at.y, at.z, look.x, look.y, look.z);
    };
    camera.follow(0);
  }
  async function loadScenario(name) {
    await fileList();
    await new Promise((res, rej) => { const el = document.createElement("script"); el.src = files[`sim/scenario_${name}.js`] ? url(`sim/scenario_${name}.js`) : `${BASE}sim/scenario_${name}.js?${Date.now()}`; el.onload = res; el.onerror = rej; document.head.appendChild(el); });
    scenario = window.SCENARIOS[name];
    for (const [who, c] of Object.entries(scenario.people)) if (!people[who]) await load(who, url(c.glb), c.height, [].concat(c.moves || []).map((m) => url(m)));
    if (scenario.setup) scenario.setup(sim);
    sim.names = Object.fromEntries(Object.entries(scenario.people).map(([k, c]) => [k, c.name || k]));
    await loadLines(scenario.lines);
    const report = {};
    for (const [k, pts] of Object.entries(scenario.legs || {})) report[k] = checkPath(pts);
    return report;
  }

  const sim = {
    T, SIT_BACK, STAND_FWD, Cancelled, people, load, step, flush, record, setCam, freeCam, camera, openDoor, setDoor, door, wp,
    checkPath, angleDiff, shot, loadScenario, say, wait, until, cancelAll, live, lines, loadLines, measureMove, stopVoices, unlockAudio,
    groundAt, blockedMove, windows, lookingIn, handlePoint, knockSound, rounded, late,
    props: { clipboard, card, guide, phone, shoeCovers, toolbag, tablet }, GUIDE_W, GUIDE_H, BAG, names: {}, practice: false, freeCamera: false, current: null, captions, voiceLog,
    caption: (t) => captions.push([clock, t]),
    mute: (m) => { muted = m; if (m) stopVoices(); },
    get scenario() { return scenario; }, get clock() { return clock; }, get isLive() { return isLive; }, BASE, url,
  };
  window.sim = sim;
})();
