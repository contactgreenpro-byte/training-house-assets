// Faces for the people in the house: lips timed to their recorded lines, eyes and head on whoever they are talking to,
// blinks, brows and a little expression. The rules are Face V2's (viewer/speak2.js, research/facial_animation.md),
// moved from one fixed 30 second take in front of a camera to people who talk in turns, walk about and look at each
// other: the mouth is built per line, the gaze and blinks run all the time.
// - Mouth: every sound timed from the recording (phones.json from scripts/align_phones.py), dominance blending, M/B/P
//   checked shut against the mesh, real pauses close the mouth.
// - Eyes: fixations on the other person's eyes with small re-fixations; the speaker looks away at some sentence starts
//   and comes back; a listener holds steadier. Fast saccades, not glides. Eyes stay inside their sockets' range.
// - Head: the body clip keeps its own nods and turns (they are the body language); only its slow drift is steered
//   towards the other person, split between neck and head, so a listen clip's nod still reads as a nod.
// - Blinks: with big gaze shifts and pauses, never closer than 1.2 s, never more than about 5 s apart.
// Runs after the body clip each frame (sim.step), so it has the last word on the head, the eyes and the face shapes.
(function () {
  "use strict";
  const T = THREE;
  const DEG = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const bump = (s, at, up, hold, down) => s < at - up || s > at + hold + down ? 0 : s < at ? 1 - (at - s) / up : s < at + hold ? 1 : 1 - (s - at - hold) / down;
  const FACE_BONE = /jaw|lip|mouth|eye|brow|cheek|nose|tongue|masseter|caninus/i;

  // Rocketbox shape names to canonical ARKit / Oculus names (as speak.js)
  const OCULUS = { sil: "sil", pp: "PP", ff: "FF", th: "TH", dd: "DD", kk: "kk", ch: "CH", ss: "SS", nn: "nn", rr: "RR", aa: "aa", e: "E", i: "I", o: "O", u: "U" };
  const canon = (k) => {
    let m = /^AA_VI_\d+_(.+)$/.exec(k);
    if (m) return "viseme_" + (OCULUS[m[1].toLowerCase()] || m[1]);
    m = /^AK_\d+_(.+)$/.exec(k);
    if (m) return m[1][0].toLowerCase() + m[1].slice(1);
    return k;
  };

  function mulberry(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------------------------------------ one spoken line
  // The mouth of one line as a function of s, seconds since the voice started; plus its sentences, accents and pauses.
  // gapOf: lip gap change per unit of each shape on this face (file metres), measured once per person.
  function buildLine(sp, ph, gapOf, mood) {
    const VLEAD = 0.035, MOUTH = 1, S = 1000;
    const hop = ph.hop_s, db = ph.db, f0 = ph.f0, phones = ph.phones;
    const loud = db.slice().sort((a, b) => a - b)[Math.floor(db.length * 0.9)];
    const vowelSize = (p) => {
      let mx = -200;
      for (let i = Math.floor(p.start / hop); i < Math.ceil(p.end / hop) && i < db.length; i++) mx = Math.max(mx, db[i]);
      const s = p.stress === 1 ? 1 : p.stress === 2 ? 0.88 : 0.7;
      return clamp((1 + (mx - loud) / 18) * s, 0.35, 1);
    };
    const ST = (a) => ({ mouthStretchLeft: a, mouthStretchRight: a });
    const sized = (tg, mm) => {
      let g = 0;
      for (const n in tg) if (n.startsWith("viseme_")) g += (gapOf[n] || 0) * tg[n] * S;
      if (g <= 0.1) return tg;
      const k = Math.min(1 / Math.max(...Object.keys(tg).filter((n) => n.startsWith("viseme_")).map((n) => tg[n])), mm / g);
      const out = {};
      for (const n in tg) out[n] = n.startsWith("viseme_") ? tg[n] * k : tg[n];
      if (mm > g * k + 0.3 && gapOf.jawOpen > 0) out.jawOpen = (mm - g * k) / (gapOf.jawOpen * S);
      return out;
    };
    const OPEN = { AA: [15], AE: [13], AH1: [11], AH0: [6], AO: [11], AW: [14, 5], AY: [14, 6], EH: [9], ER: [5], EY: [9, 6],
                   IH: [7], IY: [5], OW: [10, 5], OY: [10, 6], UH: [6], UW: [5] };
    const vowelShapes = (p) => {
      switch (p.p) {
        case "AA": return [{ viseme_aa: 1 }];
        case "AE": return [{ viseme_aa: 0.6, viseme_E: 0.4, ...ST(0.12) }];
        case "AH": return [p.stress ? { viseme_aa: 1 } : { viseme_E: 0.7, viseme_aa: 0.3 }];
        case "AO": return [{ viseme_O: 1, mouthFunnel: 0.15 }];
        case "EH": return [{ viseme_E: 1 }];
        case "ER": return [{ viseme_RR: 1, mouthFunnel: 0.15 }];
        case "EY": return [{ viseme_E: 1 }, { viseme_I: 1, ...ST(0.12) }];
        case "IH": return [{ viseme_I: 1 }];
        case "IY": return [{ viseme_I: 1, ...ST(0.18) }];
        case "OW": return [{ viseme_O: 1, mouthFunnel: 0.15 }, { viseme_U: 1, mouthFunnel: 0.35, mouthPucker: 0.25 }];
        case "OY": return [{ viseme_O: 1, mouthFunnel: 0.15 }, { viseme_I: 1 }];
        case "UH": return [{ viseme_U: 1, mouthFunnel: 0.3 }];
        case "UW": return [{ viseme_U: 1, mouthFunnel: 0.45, mouthPucker: 0.35 }];
        case "AW": return [{ viseme_aa: 1 }, { viseme_U: 1, mouthFunnel: 0.35 }];
        case "AY": return [{ viseme_aa: 1 }, { viseme_I: 1 }];
      }
      return [{}];
    };
    const consonant = (p) => {
      switch (p.p) {
        case "P": case "B": case "M": return [{ viseme_PP: 1 }];
        case "F": case "V": return [{ viseme_FF: 0.95 }];
        case "TH": case "DH": return [{ viseme_TH: 0.7 }];
        case "T": case "D": return [{ viseme_DD: 0.6 }];
        case "N": case "L": return [{ viseme_nn: 0.6 }];
        case "K": case "G": case "NG": return [{ viseme_kk: 0.6 }];
        case "S": case "Z": return [{ viseme_SS: 0.75 }];
        case "CH": case "JH": case "SH": case "ZH": return [{ viseme_CH: 0.8 }];
        case "R": return [{ viseme_RR: 0.8, mouthFunnel: 0.15 }];
        case "Y": return [{ viseme_I: 0.5 }];
        case "W": return [{ viseme_U: 0.9, mouthFunnel: 0.4, mouthPucker: 0.3 }];
      }
      return null;
    };
    const targets = (p) => {
      const o = OPEN[p.p === "AH" ? (p.stress ? "AH1" : "AH0") : p.p];
      if (o) { const f = MOUTH * (0.4 + 0.6 * vowelSize(p)); return vowelShapes(p).map((tg, i) => sized(tg, o[i] * f)); }
      return consonant(p);
    };
    const CLS = { bil: [5, 0.018, 0.018, 2], lab: [3, 0.025, 0.025, 2], rnd: [2, 0.090, 0.050, 1], vow: [1.2, 0.045, 0.045, 1],
                  pal: [1.5, 0.035, 0.035, 1], cor: [0.4, 0.030, 0.030, 1], hh: [0.15, 0.030, 0.030, 1], rest: [1.5, 0.050, 0.040, 1] };
    const clsOf = (k) => /^(P|B|M)$/.test(k) ? "bil" : /^(F|V)$/.test(k) ? "lab" : /^(W|UW|UH)$/.test(k) ? "rnd"
      : /^(CH|JH|SH|ZH|R|ER)$/.test(k) ? "pal" : k === "HH" ? "hh"
      : /^(AA|AE|AH|AO|AW|AY|EH|EY|IH|IY|OW|OY)$/.test(k) ? "vow" : "cor";
    const segs = [], closures = [];
    const at = (t) => t - VLEAD;
    phones.forEach((p, k) => {
      let tg = targets(p);
      if (!tg) {
        const nx = phones.slice(k + 1).find((q) => clsOf(q.p) === "vow" || clsOf(q.p) === "rnd");
        tg = [nx ? Object.fromEntries(Object.entries(targets(nx)[0]).map(([n, v]) => [n, v * 0.5])) : {}];
      }
      const d = p.end - p.start, cls = clsOf(p.p);
      if (cls === "bil") {
        const c0 = p.p === "M" ? p.start : p.closure ? p.closure[0] + 0.01 : p.start - 0.05;
        const c1 = p.p === "M" ? p.end - 0.01 : p.closure ? Math.max(p.closure[1], p.start) : p.start + 0.01;
        segs.push({ c0: at(c0), c1: at(Math.max(c0, c1)), tg: tg[0], cls });
        closures.push([at(c0), at(Math.max(c0, c1))]);
        return;
      }
      if (tg.length === 2) {
        const m = p.start + d * 0.55;
        segs.push({ c0: at(p.start + d * 0.15), c1: at(m - d * 0.1), tg: tg[0], cls });
        segs.push({ c0: at(m + d * 0.1), c1: at(p.end - d * 0.15), tg: tg[1], cls: /U/.test(Object.keys(tg[1]).join()) ? "rnd" : cls });
        return;
      }
      const inset = cls === "vow" || cls === "rnd" ? 0.25 : 0.2;
      segs.push({ c0: at(p.start + d * inset), c1: at(p.end - d * inset), tg: tg[0], cls });
    });
    const pauses = [];
    ph.pauses.forEach(([a, b]) => { const l = pauses[pauses.length - 1]; if (l && a - l[1] < 0.06) l[1] = b; else pauses.push([a, b]); });
    pauses.forEach(([a, b]) => { if (b - a >= 0.12 && b - 0.06 > a + 0.04) segs.push({ c0: at(a + 0.04), c1: at(b - 0.06), tg: {}, cls: "rest" }); });
    segs.push({ c0: -1e9, c1: at(phones[0].start - 0.15), tg: {}, cls: "rest" });
    segs.push({ c0: at(phones[phones.length - 1].end + 0.06), c1: 1e9, tg: {}, cls: "rest" });
    const mouth = (s) => {
      const w = {};
      let den = 0.05;
      for (const g of segs) {
        const [a, tb, ta, c] = CLS[g.cls];
        const dist = s < g.c0 ? (g.c0 - s) / tb : s > g.c1 ? (s - g.c1) / ta : 0;
        if (dist > 9) continue;
        const D = a * Math.exp(-(c === 2 ? dist * dist : dist));
        den += D;
        for (const n in g.tg) w[n] = (w[n] || 0) + D * g.tg[n];
      }
      for (const n in w) w[n] /= den;
      let need = 0;
      for (const [a, b] of closures) need = Math.max(need, s < a ? 1 - (a - s) / 0.015 : s > b ? 1 - (s - b) / 0.015 : 1);
      if (need > 0 && gapOf.mouthClose < 0) {
        let gap = 0;
        for (const n in w) gap += (gapOf[n] || 0) * w[n];
        if (gap > -0.0003) w.mouthClose = (w.mouthClose || 0) + need * (gap + 0.0003) / -gapOf.mouthClose;
      }
      return w;
    };
    // sentences and pitch accents (a brow lift and a small nod on the strongest stressed vowel of each sentence)
    const sentences = [];
    sp.words.forEach((w, i) => {
      if (i === 0 || /[.!?:]$/.test(sp.words[i - 1].word)) sentences.push({ w0: i, w1: i });
      sentences[sentences.length - 1].w1 = i;
    });
    const accents = [];
    sentences.forEach((s) => {
      const mine = phones.filter((q) => q.w >= s.w0 && q.w <= s.w1);
      const voiced = [];
      for (const p of mine) for (let i = Math.floor(p.start / hop); i < Math.ceil(p.end / hop); i++) if (f0[i] > 0) voiced.push(f0[i]);
      voiced.sort((a, b) => a - b);
      const med = voiced[voiced.length >> 1] || 0;
      let best = null;
      for (const p of mine.filter((q) => q.stress === 1 && clsOf(q.p) !== "cor")) {
        let mx = 0;
        for (let i = Math.floor(p.start / hop); i < Math.ceil(p.end / hop); i++) mx = Math.max(mx, f0[i] || 0);
        if (med && mx > med * 1.08 && (!best || mx > best.f)) best = { t: p.start, f: mx, k: clamp((mx / med - 1) / 0.25, 0, 1) };
      }
      s.t0 = mine.length ? mine[0].start : 0;
      s.t1 = mine.length ? mine[mine.length - 1].end : 0;
      if (best) accents.push(best);
    });
    const end = phones[phones.length - 1].end;
    return { mouth, sentences, accents, pauses, end, spoken: sp.spoken_seconds, mood: mood || "neutral" };
  }

  // ------------------------------------------------------------------------------------------------ one person's face
  class Face {
    constructor(person, seed) {
      this.p = person;
      this.rnd = mulberry(seed || 7);
      const root = person.root;
      this.slots = {};
      const meshes = [];
      root.traverse((o) => {
        if (!o.isMesh || !o.morphTargetDictionary) return;
        meshes.push(o);
        for (const k in o.morphTargetDictionary) (this.slots[canon(k)] = this.slots[canon(k)] || []).push([o, o.morphTargetDictionary[k]]);
      });
      // the face mesh is the one whose "aa" moves furthest; its bind pose gives the lips and the eyes' forward axes
      const reach = ([o, k]) => o.geometry.morphAttributes.position[k].array.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      const fm = ((this.slots.viseme_aa || []).slice().sort((a, b) => reach(b) - reach(a))[0] || [meshes[0]])[0];
      this.fm = fm;
      this.gapOf = fm ? lipGaps(fm, this.slots) : {};
      const bone = (re) => { let f = null; root.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
      this.neck = bone(/Neck$/);
      this.head = bone(/(^|_)Head$/);
      this.eyes = [bone(/(^|_)L_?Eye$|LeftEye$/), bone(/(^|_)R_?Eye$|RightEye$/)].filter(Boolean);
      const fwdLocal = (b) => {
        const j = fm ? fm.skeleton.bones.indexOf(b) : -1;
        if (j < 0) return new T.Vector3(0, 0, 1);
        const q = new T.Quaternion();
        fm.skeleton.boneInverses[j].clone().invert().decompose(new T.Vector3(), q, new T.Vector3());
        return new T.Vector3(0, 0, 1).applyQuaternion(q.invert());
      };
      this.eyeFwd = this.eyes.map(fwdLocal);
      this.headFwd = this.head ? fwdLocal(this.head) : new T.Vector3(0, 0, 1);
      this.eyeRest = this.eyes.map((e) => e.quaternion.clone());
      this.target = null;            // () => world Vector3 to look at, or null to look ahead
      this.line = null;              // the line being spoken: {L (buildLine), t0, audio}
      this.hearing = null;           // the line being listened to, for nods and expression
      this.mood = "neutral";
      // gaze state: offset from the target in degrees, saccading between fixations
      this.fix = { from: [0, 0], to: [0, 0], t: -1, dur: 0.03 };
      this.nextFix = 0.6;
      this.away = null;
      this.blinkAt = 1 + 2 * this.rnd();
      this.blinks = [];
      this.lastBlink = -9;
      this.corr = [0, 0];            // head steering (yaw, pitch rad) currently applied
      this.corrV = [0, 0];
      this.lp = null;                // the clip's slow head direction (yaw, pitch rad, relative to the body)
      this.lidDown = 0;
      this.enabled = true;
    }

    say(L, t0, audio) {
      this.line = { L, t0, audio };
      this.mood = L.mood;
      // gaze plan for the line: look away at every other sentence start after the first, then come back
      this.awayPlan = L.sentences.slice(1).filter((s, i) => i % 2 === 0).map((s) => s.t0 - 0.15);
    }
    hear(L, t0, audio) { this.hearing = { L, t0, audio }; this.mood = L.mood; }
    stop() { this.line = null; this.hearing = null; }
    lineTime(ln, now) { return ln.audio && !ln.audio.paused && ln.audio.currentTime > 0 ? ln.audio.currentTime : now - ln.t0; }

    saccade(now, yaw, pitch) {
      const g = this.gaze(now);
      const amp = Math.hypot(yaw - g[0], pitch - g[1]);
      this.fix = { from: g, to: [yaw, pitch], t: now, dur: (2.2 * amp + 21) / 1000 };
      if (amp > 4 && this.rnd() < 0.8) this.queueBlink(now);
    }
    gaze(now) {
      const f = this.fix, x = clamp((now - f.t) / f.dur, 0, 1), m = x * x * x * (10 - 15 * x + 6 * x * x);
      return [f.from[0] + (f.to[0] - f.from[0]) * m, f.from[1] + (f.to[1] - f.from[1]) * m];
    }
    queueBlink(now) {
      if (now - this.lastBlink < 1.2) return;
      this.lastBlink = now;
      this.blinks.push({ t: now, c: 0.075 + 0.015 * this.rnd(), h: 0.02 + 0.02 * this.rnd(), o: 0.15 + 0.05 * this.rnd(), a: this.rnd() < 0.2 ? 0.75 : 1 });
      this.blinkAt = now + 2.5 + 2.5 * this.rnd();
    }
    blinkValue(now) {
      let v = 0;
      this.blinks = this.blinks.filter((b) => now - b.t < 0.5);
      for (const b of this.blinks) {
        const x = now - b.t;
        if (x < 0 || x > b.c + b.h + b.o) continue;
        v = Math.max(v, b.a * (x < b.c ? (x / b.c) ** 2 : x < b.c + b.h ? 1 : 1 - (1 - (1 - (x - b.c - b.h) / b.o) ** 2)));
      }
      return v;
    }

    // the gaze plan, advanced in real time
    plan(now) {
      const ln = this.line;
      if (ln) {
        const s = this.lineTime(ln, now);
        if (this.awayPlan.length && s >= this.awayPlan[0]) {
          this.awayPlan.shift();
          this.saccade(now, (this.rnd() < 0.5 ? -1 : 1) * (6 + 5 * this.rnd()), 3 + 4 * this.rnd());
          this.away = now + 0.6 + 0.6 * this.rnd();
          return;
        }
        // blink in the line's own pauses
        for (const [a, b] of ln.L.pauses) if (b - a >= 0.18 && s >= a + 0.06 && s < a + 0.06 + 1 / 30) this.queueBlink(now);
      }
      if (this.away !== null && now >= this.away) { this.away = null; this.saccade(now, 0.3 * (this.rnd() - 0.5), 0.2 * (this.rnd() - 0.5)); this.nextFix = now + 0.8 + this.rnd(); return; }
      if (this.away === null && now >= this.nextFix) {
        const listening = !ln;
        // a listener now and then glances off and back; otherwise small re-fixations between the other person's eyes
        if (listening && this.target && this.rnd() < 0.12) {
          this.saccade(now, (this.rnd() < 0.5 ? -1 : 1) * (5 + 6 * this.rnd()), 2 + 5 * this.rnd());
          this.away = now + 0.4 + 0.5 * this.rnd();
        } else {
          const side = this.fix.to[0] > 0 ? -1 : 1;
          this.saccade(now, side * (0.6 + 0.6 * this.rnd()), (this.rnd() - 0.5) * 0.6);
        }
        this.nextFix = now + (listening ? 1.0 + 2.0 * this.rnd() : 0.7 + 1.3 * this.rnd());
      }
      if (now >= this.blinkAt) this.queueBlink(now);
    }

    expression(now) {
      let smile = 0, brow = 0, nod = 0, concern = 0;
      const base = { smile: [0.14, 0], warm: [0.09, 0], concern: [0, 0.12], neutral: [0.03, 0] }[this.mood] || [0, 0];
      smile = base[0]; concern = base[1];
      const ln = this.line;
      if (ln) {
        const s = this.lineTime(ln, now), L = ln.L;
        for (const a of L.accents) {
          brow = Math.max(brow, (0.12 + 0.12 * a.k) * bump(s, a.t - 0.08, 0.12, 0.12, 0.35));
          nod = Math.max(nod, (1.2 + 1.2 * a.k) * bump(s, a.t - 0.02, 0.12, 0.05, 0.3));
        }
        if (this.mood === "smile" && L.sentences[0]) smile = Math.max(smile, 0.26 * bump(s, L.sentences[0].t0 + 0.1, 0.45, 0.3, 0.4));
        if (this.mood === "concern") concern = Math.max(concern, 0.16 * bump(s, 0.1, 0.3, L.end - 0.2, 0.6));
      }
      return { smile, brow, nod, concern };
    }

    update(now, dt) {
      if (!this.enabled || !this.head) return;
      if (this.line && this.lineTime(this.line, now) > this.line.L.end + 0.4) this.line = null;
      if (this.hearing && this.lineTime(this.hearing, now) > this.hearing.L.end + 0.4) this.hearing = null;
      this.plan(now);
      const { smile, brow, nod, concern } = this.expression(now);
      this.steerHead(dt, nod);
      this.aimEyes(now);
      // face shapes: mouth from the line, everything else from the rules above
      const v = this.line ? this.line.L.mouth(this.lineTime(this.line, now)) : {};
      const b = Math.max(this.blinkValue(now), this.lidDown);
      v.eyeBlinkLeft = b; v.eyeBlinkRight = b;
      v.browInnerUp = brow + 0.9 * concern; v.browOuterUpLeft = 0.6 * brow; v.browOuterUpRight = 0.6 * brow;
      v.browDownLeft = 0.5 * concern; v.browDownRight = 0.5 * concern;
      v.mouthSmileLeft = (v.mouthSmileLeft || 0) + smile; v.mouthSmileRight = (v.mouthSmileRight || 0) + smile;
      v.cheekSquintLeft = 0.6 * smile; v.cheekSquintRight = 0.6 * smile;
      for (const n in this.slots) for (const [o, i] of this.slots[n]) o.morphTargetInfluences[i] = v[n] || 0;
    }

    // the head: keep the clip's own quick movement, steer its slow drift towards the target (within a neck's range)
    steerHead(dt, nod) {
      const root = this.p.root, head = this.head;
      root.updateMatrixWorld(true);
      const UP = new T.Vector3(0, 1, 0);
      const bodyH = this.p.heading;
      const hf = this.headFwd.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion())).normalize();
      const clipYaw = angle(Math.atan2(hf.x, hf.z) - bodyH), clipPitch = Math.asin(clamp(-hf.y, -1, 1));
      if (!this.lp) this.lp = [clipYaw, clipPitch];
      const k = 1 - Math.exp(-dt / 0.6);
      this.lp[0] += angle(clipYaw - this.lp[0]) * k; this.lp[1] += (clipPitch - this.lp[1]) * k;
      let want = [0, 0];
      const tgt = this.lookTarget();
      if (tgt) {
        const eye = this.eyeMid(new T.Vector3());
        const d = tgt.clone().sub(eye);
        const yaw = angle(Math.atan2(d.x, d.z) - bodyH), pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
        // the neck turns up to about 60 degrees; past that the person should turn (the scene does that)
        want = [clamp(angle(yaw - this.lp[0]), -60 * DEG - this.lp[0], 60 * DEG - this.lp[0]), clamp(pitch - this.lp[1], -25 * DEG, 25 * DEG) * 0.8];
      }
      // critically damped towards the wanted steering, about 0.35 s to settle
      const w0 = 9;
      for (let i = 0; i < 2; i++) {
        this.corrV[i] += (w0 * w0 * (want[i] - this.corr[i]) - 2 * w0 * this.corrV[i]) * dt;
        this.corr[i] += this.corrV[i] * dt;
      }
      const right = new T.Vector3(Math.cos(bodyH + this.lp[0]), 0, -Math.sin(bodyH + this.lp[0]));
      const dq = new T.Quaternion().setFromAxisAngle(UP, this.corr[0]).premultiply(new T.Quaternion().setFromAxisAngle(right, this.corr[1] + nod * DEG));
      const split = (q, f) => new T.Quaternion().slerp(q, f);
      if (this.neck) turnBone(this.neck, split(dq, 0.4));
      turnBone(head, split(dq, this.neck ? 0.6 : 1));
    }

    // who he is looking at; on the move he looks where he is going
    lookTarget() { return this.p.walking || !this.target ? null : this.target(); }

    eyeMid(v) {
      return v.copy(this.eyes[0].getWorldPosition(new T.Vector3())).add(this.eyes[1].getWorldPosition(new T.Vector3())).multiplyScalar(0.5);
    }

    aimEyes(now) {
      if (this.eyes.length < 2) return;
      this.eyes.forEach((e, k) => e.quaternion.copy(this.eyeRest[k]));
      this.p.root.updateMatrixWorld(true);
      const UP = new T.Vector3(0, 1, 0);
      const m2 = this.eyeMid(new T.Vector3());
      const hf = this.headFwd.clone().applyQuaternion(this.head.getWorldQuaternion(new T.Quaternion())).normalize();
      const tgt = this.lookTarget();
      const to = tgt ? tgt.clone().sub(m2) : hf.clone().setY(0).normalize().multiplyScalar(3);
      const [gy, gp] = this.gaze(now);
      const r2 = new T.Vector3().crossVectors(UP, to.clone().negate().setY(0).normalize()).normalize();
      const target = to.applyAxisAngle(UP, gy * DEG).applyAxisAngle(r2, -gp * DEG).add(m2);
      let down = 0;
      this.eyes.forEach((e, k) => {
        const p = e.getWorldPosition(new T.Vector3());
        const want = target.clone().sub(p).normalize();
        const ang = want.angleTo(hf);
        if (ang > 25 * DEG) want.lerp(hf, 1 - 25 * DEG / ang).normalize();
        const cur = this.eyeFwd[k].clone().applyQuaternion(e.getWorldQuaternion(new T.Quaternion())).normalize();
        turnBone(e, new T.Quaternion().setFromUnitVectors(cur, want));
        down += (Math.asin(clamp(-want.y, -1, 1)) - Math.asin(clamp(-hf.y, -1, 1))) / DEG / 2;
      });
      this.lidDown = clamp(0.025 * down, 0, 0.3);
    }
  }

  const angle = (a) => { let d = a % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  const pq = new T.Quaternion(), tq = new T.Quaternion();
  function turnBone(b, d) {
    b.parent.getWorldQuaternion(pq);
    b.quaternion.premultiply(tq.copy(pq).invert().multiply(d).multiply(pq));
    b.updateMatrixWorld(true);
  }

  // inner upper and lower lip on the midline in the file's bind space, and how far each shape opens them (as speak2.js)
  function lipGaps(fm, slots) {
    const bindPos = (re) => {
      const j = fm.skeleton.bones.findIndex((b) => re.test(b.name));
      return j < 0 ? null : new T.Vector3().setFromMatrixPosition(fm.skeleton.boneInverses[j].clone().invert());
    };
    const idxIn = (n) => ((slots[n] || []).find(([o]) => o === fm) || [])[1];
    const P = fm.geometry.attributes.position.array, MA = fm.geometry.morphAttributes.position;
    const lipU = bindPos(/M_?UpperLip$/i), lipL = bindPos(/M_?(Bottom|Lower)Lip$/i);
    const gapOf = {};
    if (!lipU || !lipL || idxIn("viseme_aa") === undefined) return gapOf;
    const c = lipU.clone().add(lipL).multiplyScalar(0.5), aa = MA[idxIn("viseme_aa")].array;
    let up = -1, lo = -1;
    for (let i = 0; i < P.length / 3; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (Math.abs(x - c.x) > 0.003 || Math.hypot(y - c.y, z - c.z) > 0.02 || z < c.z - 0.005) continue;
      if (aa[i * 3 + 1] > -0.002 && (up < 0 || y < P[up * 3 + 1])) up = i;
      if (aa[i * 3 + 1] < -0.010 && (lo < 0 || y > P[lo * 3 + 1])) lo = i;
    }
    for (const n in slots) {
      const k = idxIn(n);
      if (k !== undefined && up >= 0 && lo >= 0) gapOf[n] = MA[k].array[up * 3 + 1] - MA[k].array[lo * 3 + 1];
    }
    return gapOf;
  }

  // the face bones belong to this file: the body clips' tracks on them are dropped
  function bodyOnly(clip) {
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !FACE_BONE.test(t.name.split(".")[0]));
    return c;
  }

  window.SimFace = { Face, buildLine, bodyOnly };
})();
