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

  class Person {
    constructor(name, gltf, height) {
      this.name = name;
      this.root = gltf.scene;
      this.root.name = "sim_" + name;
      this.root.userData.simPerson = true;                 // its mixer writes every bone every frame (PM.apply above)
      this.root.traverse((o) => {
        if (o.isSkinnedMesh) o.frustumCulled = false;     // r128 culls a skinned mesh by its bind-space sphere
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
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
      this.posers = [];                                   // run after the clip each frame: reaching arms (reach)
    }
    // body clips only: the face bones are the face's (face.js)
    addClips(anims) { for (const c of anims) this.clips[clipKey(c.name)] = window.SimFace.bodyOnly(c); }
    act(name) { return this.mixer.clipAction(this.clips[name]); }
    // crossfade to a clip; loop or once (held on its last frame)
    play(name, { loop = true, fade = FADE, speed = 1, from = 0 } = {}) {
      if (!this.clips[name]) throw new Error(`${this.name} has no clip ${name}`);
      const a = this.act(name);
      if (this.action === a && loop) { a.timeScale = speed; return a; }
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
    update(dt) {
      this.tasks = this.tasks.filter((t) => { if (t.fn(dt)) { t.res(); return false; } return true; });
      this.ticks = this.ticks.filter((f) => !f(dt));
      this.sync();
      for (const [b, q] of this.kept) b.quaternion.copy(q);
      this.kept.clear();
      this.mixer.update(dt);
      this.posers = this.posers.filter((f) => !f(dt));
    }
    run(fn) { return new Promise((res, rej) => this.tasks.push({ fn, res, rej })); }
    cancel() { const t = this.tasks; this.tasks = []; this.ticks = []; this.posers = []; this._fing = {}; this.gtok++; this.walking = false; t.forEach((x) => x.rej(new Cancelled())); }

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
    reach(side, target, { dur = 0.45, twist = 0 } = {}) {
      const S = side === "L" ? "L" : "R";
      const up = this.root.getObjectByName(`Bip01_${S}_UpperArm`), fore = this.root.getObjectByName(`Bip01_${S}_Forearm`), hand = this.root.getObjectByName(`Bip01_${S}_Hand`);
      const h = { target, w: 0, goal: 1, rate: 1 / dur, out: null, hand, twist };
      h.release = (sec = 0.45) => { h.goal = 0; h.rate = 1 / sec; return new Promise((res) => (h.out = res)); };
      h.set = (fn) => { h.target = fn; };
      const v = (o) => o.getWorldPosition(new T.Vector3());
      this.posers.push(h.fn = (dt) => {
        h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * h.rate * dt));
        if (h.goal === 0 && h.w <= 0) { if (h.out) h.out(); return true; }
        const k = h.w * h.w * (3 - 2 * h.w);
        this.root.updateMatrixWorld(true);
        const s = v(up), e = v(fore), w = v(hand);
        const a = s.distanceTo(e), b = e.distanceTo(w);
        const d = h.target().clone().sub(s);
        const dl = Math.max(Math.abs(a - b) + 0.01, Math.min(d.length(), (a + b) * 0.995));
        const dir = d.normalize();
        const fwd = new T.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        const out = new T.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading)).multiplyScalar(S === "R" ? 1 : -1);
        const pole = new T.Vector3(0, -1, 0).addScaledVector(out, 0.6).addScaledVector(fwd, -0.25);
        const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
        const cosA = Math.max(-1, Math.min(1, (a * a + dl * dl - b * b) / (2 * a * dl)));
        const elbow = s.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(1 - cosA * cosA));
        this.keep(up); this.keep(fore);
        turnBone(up, new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), elbow.sub(s).normalize()), k));
        const e2 = v(fore), w2 = v(hand), tgt = s.clone().addScaledVector(dir, dl);
        turnBone(fore, new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(w2.sub(e2).normalize(), tgt.sub(e2).normalize()), k));
        // twist: the hand turned about the forearm (palm up to carry something flat on it), radians
        if (h.twist) { this.keep(hand); const ax = v(hand).sub(v(fore)).normalize(); turnBone(hand, new T.Quaternion().setFromAxisAngle(ax, h.twist * k)); }
        return false;
      });
      return h;
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
    gesture(name, hold) {
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
    rnd() { this._s = ((this._s || 12345) * 1103515245 + 12345) & 0x7fffffff; return this._s / 0x7fffffff; }
    turnTo(h, rate = Math.PI) {
      return this.run((dt) => {
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
      const opts = [60, 90, 120, 180].map((a) => [a, Math.abs(Math.abs(d) - a)]).sort((p, q) => p[1] - q[1]);
      const [a] = opts[0];
      const name = `turn_${d > 0 ? "left" : "right"}_${a}`;
      if (Math.abs(d) > 40 && this.clips[name] && this.base === "idle_neutral_01" && !this.walking) {
        const m = measureMove(this, name);
        await this.once(name, { early: 0.03, fade: 0.2 });
        this.pos.x += Math.sin(this.heading) * m.fwd + Math.cos(this.heading) * m.side;
        this.pos.z += Math.cos(this.heading) * m.fwd - Math.sin(this.heading) * m.side;
        this.heading += m.yaw;
        this.sync();
        this.play(this.base, { fade: 0.15 });
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
      this.seatShift(-SIT_BACK * this.root.scale.x);
      this.base = "sit_table_idle_neutral_01";
      this.play(this.base, { fade: 0 });
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
      this.seatShift(-SIT_BACK * this.root.scale.x);
      this.base = chairBase;
      this.play(this.base, { fade: 0 });
    }
    async standUp() {
      await this.once("sit_stand_up_chair_01", { early: 0.02 });
      this.seatShift(STAND_FWD * this.root.scale.x);
      this.base = "idle_neutral_01";
      this.play(this.base, { fade: 0 });
    }
    // straight into a pose (a step's start): every running clip stopped, so no crossfade is left over from before
    reset(base) { this.mixer.stopAllAction(); this.action = null; this.base = base; this.play(base, { fade: 0 }); this.root.visible = this.root.visible; }
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
  const pq = new T.Quaternion(), tq = new T.Quaternion(), fq = new T.Quaternion(), ZAX = new T.Vector3(0, 0, 1);
  function turnBone(b, d) {
    b.parent.getWorldQuaternion(pq);
    b.quaternion.premultiply(tq.copy(pq).invert().multiply(d).multiply(pq));
    b.updateMatrixWorld(true);
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
    const doorMeshes = []; for (const d of W().doors) d.traverse((o) => { if (o.isMesh) doorMeshes.push(o); });
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
    for (const f of late) f(dt);                          // props carried by a posed hand (the clipboard): after every body is final
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
    await wait(ln.L.spoken + (o.gap ?? 0.35));
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
    props: { clipboard, card }, names: {}, practice: false, freeCamera: false, current: null, captions, voiceLog,
    caption: (t) => captions.push([clock, t]),
    mute: (m) => { muted = m; if (m) stopVoices(); },
    get scenario() { return scenario; }, get clock() { return clock; }, get isLive() { return isLive; }, BASE, url,
  };
  window.sim = sim;
})();
