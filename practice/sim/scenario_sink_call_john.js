// Practice run-through, scenario 1: a kitchen sink call at John Smith's, the field script v2 from the door (S2) to the
// recap at the table (S10). Every line is a set line from sim/lines/sink_call_john.json, voiced and lip timed.
//
// Each step has start(sim), the state it begins in (so the player can jump to it, or go back to it), and run(sim), what
// happens in it. In "watch" mode the uniformed technician does the technician's part. In "practice" mode the trainee IS the
// technician (Jake 2026-10-29: "I thought I would be the technician"): he steers Mike from behind (player.js), makes the calls
// at the door from a pop-up, his lines come up on the card to say out loud, and the game tells him how he did. Points are
// walk.js world metres (see sim.js); every walking leg passes sim.checkPath against the furniture and the walls (legs below).
window.SCENARIOS = window.SCENARIOS || {};
(function () {
  const SOFA = [-5.93, 0, -4.32, Math.PI / 2];          // seated on the living room sofa, facing the room
  // Outside: the house floor is 0, the porch -0.02, the yard and the driveway about -0.89. The porch steps come down on the
  // driveway side (x 1.83 to 3.23, between the rails at z 0.59 and 1.85); the van is parked on the driveway, nose to the house.
  const VAN = [4.3, -0.888, 9.7, Math.PI];               // out of the van, at the driveway's edge, facing the house
  const KNOCK = [0.14, -0.02, 0.5];                      // in front of the door (its face is at z 0.03), not the sidelights
  const L = {
    // up the driveway on its lawn side, up the middle of the porch steps, then straight at the door, so he arrives facing it
    tech_drive: [[4.1, -0.888, 6.0], [3.85, -0.888, 2.2], [3.6, -0.888, 1.22], [2.6, -0.4, 1.22], [1.75, -0.02, 1.22], [0.9, -0.02, 1.15], [0.2, -0.02, 0.95], KNOCK],
    tech_back: [[0.34, -0.02, 1.3]],                      // about 0.8 m back: room to move left or right if a dog comes out
    tech_card: [[0.3, -0.02, 0.86]],                      // a step up to hand John the card
    john_to_door: [[0.42, 0, -1.3], [0.52, 0, -0.66]],    // the handle side, outside the door's swing (it opens in, hinged west)
    john_back: [[0.68, 0, -0.98]],                         // back out of the way as it swings
    john_in_door: [[0.16, 0, -0.22]],
    // S2's end and S3 (Jake 2026-10-29): John steps back out of the doorway to the hinge side, just past the open door's edge
    // (the door lies open along the west jamb, 0.91 m into the foyer), and asks Mike in from there; Mike puts his shoe covers on
    // at the threshold, on the porch, then steps in through the middle of the doorway and over to the right (the foyer's east
    // wall is at x 1.16), well clear of the door's swing (he stands 1.5 m from its hinge at x -0.457), and John closes it. Until
    // round 3g Mike stopped at x 0.38, at the edge of the swing, and Jake found it crowded: "the placement for the technician on
    // the next step should be kind of over into the right so that the door has room to close"
    // Round 3h, the field guide's bubble ("Stay about 2 to 3 feet away when standing"): John stands further in, and Mike passes
    // him 1 m off and stands 1.2 m from him (he passed at 0.77 and stood at 1.0). Round 3j: John walks in there forwards, turning
    // as he goes (john_in; he used to back up to it), and Mike puts his shoe covers on where he stands (no step to the threshold).
    john_aside: [[-0.2, 0, -1.3]],
    john_in: [[-0.02, 0, -0.8], [-0.2, 0, -1.3]],
    tech_in: [[0.2, 0, -0.25], [0.8, 0, -0.85]],
    // (round 3p: he steps after the door as he eases it shut, then a step back off it, 0.95 m from Mike)
    john_to_close: [[-0.25, 0, -1.1]],
    john_close_step: [[-0.06, 0, -0.84], [0.04, 0, -0.7]],
    john_after: [[-0.14, 0, -1.08]],
    // (at the sink John stops 1.2 m from where Mike will stand, round 3h; it was 1.05. Round 3j: Mike stands by the counter south
    // of the sink's basin, so he can set his clipboard down on it, 1.06 m from John)
    john_lead: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.55, 0, -7.25]],
    tech_follow: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.7, 0, -6.2]],
    john_to_sofa: [[-4.6, 0, -7.4], [-3.2, 0, -7.2], [-3.2, 0, -5.3], [-3.5, 0, -4.6], [-4.6, 0, -4.32], [-5.46, 0, -4.32]],
    // by the sofa Mike stands 1.15 m from John once John is up (it was 0.96), and steps back out of John's way to the table
    tech_to_sofa: [[-5.4, 0, -5.4], [-4.6, 0, -5.1], [-4.45, 0, -4.8]],
    tech_off: [[-4.3, 0, -5.2], [-3.2, 0, -5.3]],
    tech_back_in: [[-4.3, 0, -5.2], [-4.45, 0, -4.8]],
    tech_aside: [[-4.45, 0, -5.4]],
    // down the table's west side, between it (and Mike's chair tucked in there) and the island's stools, to his chair at its north
    // west corner; Mike after him from where he stepped aside, to his own chair at the side's middle (round 3p: SEATS)
    john_to_table: [[-4.6, 0, -4.32], [-3.5, 0, -4.6], [-3.35, 0, -5.3], [-3.35, 0, -7.1], [-3.05, 0, -7.75]],
    tech_to_table: [[-3.6, 0, -5.3], [-3.42, 0, -5.6], [-3.42, 0, -6.12]],
    // to the water heater in the coat closet off the foyer and back (round 3p)
    tech_to_wh: [[-3.6, 0, -4.45], [-2.3, 0, -2.3], [-1.22, 0, -1.9], [-0.4, 0, -1.86], [0.3, 0, -1.84]],
    tech_from_wh: [[-0.4, 0, -1.86], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.3, 0, -3.9], [-3.2, 0, -5.3]],
  };
  const standFromSofa = (sim, p) => [SOFA[0] + sim.STAND_FWD * p.root.scale.x, 0, SOFA[2], SOFA[3]];
  const TALK = L.tech_to_sofa[L.tech_to_sofa.length - 1];   // where Mike stands to talk to him by the sofa
  // his toolbag: by the front door for the knock, and by the sink cabinet (bagDown's spots from where he stands; x, z, heading, y)
  const BAG_PORCH = [0.44, 0.45, Math.PI, -0.02];
  const BAG_SINK = [-5.235, -6.488, 3.0, 0];
  const AT_SINK = [-5.7, 0, -6.2];                       // Mike at the sink, by the counter, John 1.06 m off (S5, S6)
  const JOHN_SINK = [-5.55, 0, -7.25];
  const KNEEL = [-5.45, 0, -6.05];                       // down on one knee at the sink cabinet's middle (S7)
  // the plumbing under the basin, as boxes (min, max) from the sink's own parts: the disposal, its waste arm and discharge, the
  // other bowl's tailpiece and tee, the J bend and its nut, the trap arm to the wall, the supplies and stops (round 3p)
  const PLUMBING = [
    [[-6.41, 0.41, -5.98], [-6.22, 0.71, -5.81]], [[-6.34, 0.41, -6.26], [-6.27, 0.56, -5.97]], [[-6.36, 0.37, -6.37], [-6.25, 0.73, -6.24]],
    [[-6.41, 0.23, -6.33], [-6.27, 0.4, -6.27]], [[-6.65, 0.31, -6.34], [-6.36, 0.4, -6.27]], [[-6.65, 0.47, -6.23], [-6.46, 0.85, -5.96]],
  ];
  // his clipboard on the counter south of the sink's basin, paper up (S5 to S7: his hands free for the guide and the check)
  const COUNTER = { at: [-6.25, 0.916, -6.64], h: Math.PI / 2 };

  // the technician's line: said by him in watch mode, put on the card for the trainee in practice mode.
  // The clipboard comes up once, for the discovery (Jake 2026-10-29: "It'll come up as he's asking questions"): as he brings up
  // Sarah's notes at the door, and it stays up while he asks and John answers; it goes down for his promise (the field guide: never
  // look away for a promise) and stays at his side after. Until round 3h it came up for every question and went down 1.2 s after,
  // up and down all through the talk (Jake: "The clip board floats around alot"); and the field guide has him not clutch it:
  // "Hands hidden behind a tablet, a clipboard or in pockets read as guarded."
  const BOARD = { S3_06: 1, S4_01: 1, S4_09: 0 };
  // id can be a list: his lines one after another with nothing from John between, which flow on with one tap in Practice (round
  // 3j, Jake 2026-10-30: "A couple of the lines that the tech says are back to back. They should just flow. You shouldn't have to
  // click every single time"); o is then a list too, one for each line
  const T = async (sim, id, o) => {
    const ids = [].concat(id), os = ids.map((_, i) => (Array.isArray(o) ? o[i] : o));
    if (sim.practice) {
      const k = ids.find((x) => x in BOARD);
      if (k) boardUp(sim, !!BOARD[k], 0);
      await sim.prompt(ids.length > 1 ? ids : ids[0], null, null, null, ids.length > 1 ? os : os[0]);
    } else for (const [i, x] of ids.entries()) { if (x in BOARD) boardUp(sim, !!BOARD[x], 0); await sim.say(x, os[i]); }
  };
  // John's line, to the technician (in Practice that is Mike too: the trainee is him)
  const H = (sim, id, o = {}) => sim.say(id, o);
  const watch = (sim, f) => (sim.practice ? Promise.resolve() : f());
  // In Practice, a moment that has to be seen (the card, the covers, the guide, the check) is shown from the step's own shot while
  // he stands there (sim.view): from behind him his body hid what his hands did (round 3j, Jake 2026-10-30: "I couldn't even see
  // that handoff")
  const show = (sim, name) => { if (sim.practice) sim.view(name); };
  const last = (path) => path[path.length - 1];
  // An action in Practice: the card says what to do; walk Mike to the ring yourself (a trail of dots shows the way, path), or tap
  // the button and he goes (a phone does not have to walk every step). go: how he gets there; then: what he does once there.
  const act = (sim, text, btn, at, go, then = null, path = null) => sim.prompt(null, text, btn, { at, go, then, path });
  // a walk that starts with a straight line from wherever the trainee left Mike: if that line would cross a wall or furniture
  // (he wandered off), he is put at the walk's first point first
  const goAlong = (sim, p, path, o) => { if (sim.checkPath([p.pos.toArray(), path[0]]).length) p.place(...path[0], p.heading); return p.walk(path, o); };
  // his business card, the Happy Homes Guide (John has it from S5 on), his phone, his shoe covers
  let board = null, card = null, guide = null, phone = null, covers = null;
  const putAway = () => { if (card && card.parent) card.parent.remove(card); };
  const smoothT = (x) => x * x * (3 - 2 * x);
  // something eased from 0 to 1 over sec (f(k) each frame), run on a person's clock so a step change stops it
  const tween = (p, sec, f) => { let t = 0; return p.run((dt) => { t = Math.min(sec, t + dt); f(smoothT(t / sec)); return t >= sec; }); };

  // ---- the clipboard ------------------------------------------------------------------------------------------------
  // Jake 2026-10-29: "his hand should be like grasping the side of it, it's tucked into his side. It'll come up as he's asking
  // questions." Then: "Typically the fingers curl around the edge of the clipboard when it's in the relaxed position, and it's
  // in the horizontal plane instead of the vertical." And then: "It stays horizontal, but not with the flat side up, with the
  // rib of the border up, and it's tucked down by his side." So at rest his left arm hangs at his side, his fingers curled over
  // the board's top edge, and the board hangs from them against his thigh: its long side level (front to back), its edge up,
  // paper to his leg. For a question the arm brings it up in front of him, tilted towards his face to read and write on, the
  // hand turned palm up under it, and it goes back down after. The wrist's place is set from his hips (the pelvis, so a crouch
  // or a sit takes it down with him) and his facing; the board hangs from the wrist as it is; both every frame once the body is
  // final (sim.late). On the table at the recap (putDown) it stays where it is put.
  // hx, hy, hz: the wrist from his hips (out to his left, up, forward); drop, ahead, inset: the board's middle from the wrist
  // (down, forward, in towards his leg); twist: the hand turned palm up under the board when it is up
  const carry = { on: false, up: 0, want: 0, show: 0, showWant: 0, arm: null, downAt: 0, hx: 0.25, hy: -0.08, hz: 0.04, drop: 0.17, ahead: 0.03, inset: 0.028, twist: -1.2 };
  // Round 3h (Jake: "The clip board floats around alot"): his left hand is held at the angle it has in each pose, in his own frame
  // (the talking moves turned the wrist, and the board swung off his fingers), and the board hangs from that hand, not from a place
  // worked out from his hips (up, the arm fell short of that place and the board stood 7 to 12 cm off his fingers). Measured with
  // him standing still in the two poses as they were (the carried one is Jake's round 3d hold): the hand's turn from his facing,
  // and the board's place and turn in the hand.
  const GRIP = {
    hand: [new THREE.Quaternion(0.6812, -0.6809, 0.2334, -0.1334).normalize(), new THREE.Quaternion(0.3485, -0.8199, 0.1449, 0.4305).normalize()],
    at: [new THREE.Vector3(0.1734, 0.0155, -0.0165), new THREE.Vector3(0.0738, 0.1224, 0.054)],
    turn: [new THREE.Quaternion(0.6311, 0.1835, 0.731, 0.1833).normalize(), new THREE.Quaternion(0.3783, 0.2333, 0.7812, -0.4384).normalize()],
  };
  const M4 = () => new THREE.Matrix4();
  const V3 = () => new THREE.Vector3();
  // Which way his body faces. Round 3n: in a turn clip (turn_left_120 at the door, turn_right_180) his hips and chest swing round
  // well before his heading does (2.1 rad at the door), and the clipboard hand, placed from his heading, went 14 to 17 cm into his
  // hip. So: his heading, turned on by as much as the line between his hips and the line between his shoulders are off it, past
  // the sway of standing, talking and walking (0.2 rad), so the board does not swing with every step.
  function facing(p) {
    p.root.updateMatrixWorld(true);
    const yawOf = (a, b) => { const l = p.root.getObjectByName(a).getWorldPosition(V3()).sub(p.root.getObjectByName(b).getWorldPosition(V3())); return Math.atan2(-l.z, l.x); };
    const ad = window.sim.angleDiff, h = p.heading;
    const d1 = ad(yawOf("Bip01_L_Thigh", "Bip01_R_Thigh"), h), d2 = ad(yawOf("Bip01_L_UpperArm", "Bip01_R_UpperArm"), h);
    const d = Math.atan2(Math.sin(d1) + Math.sin(d2), Math.cos(d1) + Math.cos(d2));      // (their mean as angles: near half a turn the two can straddle it)
    return h + Math.sign(d) * Math.max(0, Math.abs(d) - 0.2);
  }
  function bodyFrame(p) {
    const h = facing(p);
    p.root.updateMatrixWorld(true);
    const hips = p.root.getObjectByName("Bip01_Pelvis").getWorldPosition(V3());
    return { hips, left: new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), fwd: new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), up: new THREE.Vector3(0, 1, 0) };
  }
  // The two poses, each the board's place (m) and the left wrist's (hand). The board (clipboard(): long side its x, the clip at
  // its -x end, paper on its -y face, width its z).
  function boardPoses(p) {
    const { hips, left, fwd, up } = bodyFrame(p);
    // carried: the arm hanging, the wrist by his thigh; the board hangs from the fingers (its top edge in them), long side level
    // front to back with the clip forward, short side down, paper to his leg
    const hand = hips.clone().addScaledVector(up, carry.hy).addScaledVector(left, carry.hx).addScaledVector(fwd, carry.hz);
    const wr = p.root.getObjectByName("Bip01_L_Hand").getWorldPosition(V3());
    const cc = wr.clone().addScaledVector(up, -carry.drop).addScaledVector(fwd, carry.ahead).addScaledVector(left, -carry.inset);
    const xA = fwd.clone().negate(), yA = left.clone();
    const carried = { m: M4().makeBasis(xA, yA, xA.clone().cross(yA)).setPosition(cc), hand };
    // up for a question: in front of him, tilted towards his face, paper to his face, the clip at the far end
    const out = fwd.clone().multiplyScalar(Math.cos(0.7)).addScaledVector(up, Math.sin(0.7));
    const rc = hips.clone().addScaledVector(up, 0.15).addScaledVector(fwd, 0.3).addScaledVector(left, 0.02);
    const read = { m: M4().makeBasis(out.clone().negate(), left.clone().cross(out).normalize(), left.clone().negate()).setPosition(rc),
      hand: rc.clone().addScaledVector(left, 0.13).addScaledVector(out, -0.05) };
    return { carried, read };
  }
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), p2 = new THREE.Vector3(), q2 = new THREE.Quaternion(), s2 = new THREE.Vector3();
  const smooth = (x) => x * x * (3 - 2 * x);
  // Round 3p (Jake 2026-10-31: "I don't think John should put his clipboard down. I think he should hold it. Not John. The tech
  // should hold the clipboard"): he shows John the guide lying on his clipboard, held flat in his left hand in front of him like a
  // tray, a little below his chest, tipped 20 degrees toward John, the guide the right way up for John (its top toward Mike, so the
  // clip end of the board is his). His left hand under the board's left edge, palm up, the thumb forward over the edge. carry.show
  // eases it there (0 to 1) from wherever the board is, and back. (The tablet is shown the same way at the sofa and the table.)
  function boardShowPose(p) {
    const { hips, left, fwd, up } = bodyFrame(p), t = 0.35;
    const x = fwd.clone().multiplyScalar(Math.cos(t)).addScaledVector(up, -Math.sin(t)), n = up.clone().multiplyScalar(Math.cos(t)).addScaledVector(fwd, Math.sin(t));
    const y = n.clone().negate(), z = x.clone().cross(y);
    const c = hips.clone().addScaledVector(up, 0.22).addScaledVector(fwd, 0.36).addScaledVector(left, 0.03);
    // z is his left (the board's +z edge on his left): the wrist just out past it and under it, the fingers in under the board
    const wrist = c.clone().addScaledVector(z, 0.115 + 0.035).addScaledVector(n, -0.03).addScaledVector(x, -0.02);
    return { pos: c, q: new THREE.Quaternion().setFromRotationMatrix(M4().makeBasis(x, y, z)), wrist, fing: z.clone().negate(), thumb: x.clone() };
  }
  function handPlace(p) {
    const b = boardPoses(p), h = b.carried.hand.lerp(b.read.hand, smooth(carry.up));
    return carry.show > 0 ? h.lerp(boardShowPose(p).wrist, smooth(carry.show)) : h;
  }
  function carryStep(sim, dt) {
    const tech = sim.people.tech;
    if (!carry.on || !board) return;
    if (carry.downAt && sim.clock >= carry.downAt) { carry.want = 0; carry.downAt = 0; }
    carry.up += Math.sign(carry.want - carry.up) * Math.min(Math.abs(carry.want - carry.up), dt / 0.55);
    carry.show += Math.sign(carry.showWant - carry.show) * Math.min(Math.abs(carry.showWant - carry.show), dt / 0.7);
    // the grip and the arm (a step change clears every pose on top of the clips, so they come back here); the fingers flatter under
    // the board as he shows it
    if (!tech._fing || !tech._fing.L) tech.fingers("L", 0.72, 0.2);
    tech._fing.L.want = 0.72 - 0.5 * smooth(carry.show);
    if (!carry.arm || !tech.posers.includes(carry.arm.fn)) { carry.arm = tech.reach("L", () => handPlace(tech), { dur: 0.35 }); carry.arm.fn.pin = "L"; }
    const k = smooth(carry.up);
    carry.arm.twist = 0;                                   // the hand's angle is set whole, below
    // the hand at its angle for the pose, in his frame
    const hb = tech.root.getObjectByName("Bip01_L_Hand");
    const yawQ = q2.setFromAxisAngle(V3().set(0, 1, 0), facing(tech));
    const handQ = yawQ.clone().multiply(GRIP.hand[0].clone().slerp(GRIP.hand[1], k));
    hb.parent.updateMatrixWorld(true);
    // (eased in over a third of a second when the carry starts: taking it up off the counter the wrist turned at once)
    carry.ease = Math.min(1, (carry.ease ?? 1) + dt / 0.35);
    hb.quaternion.slerp(hb.parent.getWorldQuaternion(quat).invert().multiply(handQ), smooth(carry.ease));
    hb.updateMatrixWorld(true);
    if (carry.ease < 1) handQ.copy(hb.getWorldQuaternion(quat));
    // the board in it
    hb.getWorldPosition(pos);
    pos.add(GRIP.at[0].clone().lerp(GRIP.at[1], k).applyQuaternion(handQ));
    quat.copy(handQ).multiply(GRIP.turn[0].clone().slerp(GRIP.turn[1], k));
    // shown flat to John: the board where the tray pose has it, his hand turned palm up under its edge (a hand's axes as orient
    // has them: the fingers along x, the palm +y, the left thumb on -z)
    if (carry.show > 0) {
      const s = boardShowPose(tech), e = smooth(carry.show);
      pos.lerp(s.pos, e); quat.slerp(s.q, e);
      const xh = s.fing.clone().normalize(), zh = s.thumb.clone().addScaledVector(xh, -s.thumb.dot(xh)).normalize().negate(), yh = zh.clone().cross(xh);
      const hq = new THREE.Quaternion().setFromRotationMatrix(M4().makeBasis(xh, yh, zh));
      hb.quaternion.slerp(hb.parent.getWorldQuaternion(q2).invert().multiply(hq), e);
      hb.updateMatrixWorld(true);
    }
    if (board.parent !== window.walk.scene) window.walk.scene.add(board);
    board.position.copy(pos); board.quaternion.copy(quat); board.scale.set(1, 1, 1);
  }
  // up, or down after a moment (after: seconds)
  function boardUp(sim, up, after = 1.2) {
    if (!carry.on) return;
    if (up) { carry.want = 1; carry.downAt = 0; } else carry.downAt = sim.clock + Math.max(1e-3, after);
  }
  // at his side (every step that starts with him on his feet)
  function inHand(sim, ease = false) {
    carry.on = true; carry.want = 0; carry.up = 0; carry.downAt = 0; carry.show = 0; carry.showWant = 0;
    if (ease) carry.ease = 0;
  }
  function putDownBoard(sim, x, y, z, h) {
    const tech = sim.people.tech;
    carry.on = false; if (carry.arm) { carry.arm.release(0.3); carry.arm = null; }
    tech.fingers("L", 0, 0.3);
    tech.putDown(board, x, y, z, h);
  }

  // ---- his toolbag ----------------------------------------------------------------------------------------------------
  // Round 3p (Jake 2026-10-31): "The tech needs a toolbag in his hand ... Small toolbag. He takes it to the door with him." In his
  // right hand at his side, hanging from his fingers, held a little out from his leg (the bag is 15 cm wide); set down on the floor
  // with a bend at the knees and hips, and taken up the same way. It goes down by the front door for the knock (his right fist),
  // in the foyer while he and John talk (his right hand writes on the clipboard), by the sink cabinet for the guide and the check,
  // and by the water heater; he takes it with him in between, and to the table at the end.
  let bag = null, tab = null;
  const bagS = { by: null, arm: null, keep: true };
  const GRIP_IN_HAND = new THREE.Vector3(0.085, 0.03, 0);     // the handles in his curled fingers, in the hand's own axes (m)
  function bagStep() {
    if (!bag || !bagS.by) return;
    const p = bagS.by, hb = p.root.getObjectByName("Bip01_R_Hand");
    // (the hold taken again after a step change cleared the poses; not while it is going down or coming up)
    if (bagS.keep && (!bagS.arm || !p.posers.includes(bagS.arm.fn))) bagInHand(p);
    p.root.updateMatrixWorld(true);
    const grip = hb.getWorldPosition(V3()).add(GRIP_IN_HAND.clone().applyQuaternion(hb.getWorldQuaternion(Q4())));
    if (bag.parent !== window.walk.scene) window.walk.scene.add(bag);
    bag.position.copy(grip).setY(grip.y - bag.userData.gripY);
    bag.quaternion.setFromAxisAngle(V3().set(0, 1, 0), facing(p) - Math.PI / 2);
    bag.scale.set(1, 1, 1);
  }
  // in his hand at once (a step that starts with him carrying it)
  function bagInHand(p) {
    bagS.by = p; bagS.keep = true;
    if (!p._fing || !p._fing.R) p.fingers("R", 0.85, 0.05);
    const hb = p.root.getObjectByName("Bip01_R_Hand"), out = () => V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading));
    // (out from his thigh by 6 cm from where the clip has his hand, the clip's own swing kept)
    if (!bagS.arm || !p.posers.includes(bagS.arm.fn)) { bagS.arm = p.reach("R", () => hb.getWorldPosition(V3()).addScaledVector(out(), 0.06), { dur: 0.3 }); bagS.arm.fn.pin = "R"; }
  }
  // standing on the floor at x, z, its length along heading h
  function bagAt(x, z, h, y = 0) {
    bagS.by = null;
    if (bagS.arm) { bagS.arm.release(0.05); bagS.arm = null; }
    window.walk.scene.add(bag);
    bag.position.set(x, y, z); bag.quaternion.setFromAxisAngle(V3().set(0, 1, 0), h - Math.PI / 2); bag.scale.set(1, 1, 1);
  }
  // down beside his right foot (side: out to his right, m; ahead: forward of his feet); the bend at his knees and hips with his back
  // straight (Jake, round 3k: "Keep that back straight"), not rounded over it
  async function bagDown(sim, side = 0.32, ahead = 0.08) {
    const p = sim.people.tech;
    if (bagS.by !== p) return;
    const fwd = V3().set(Math.sin(p.heading), 0, Math.cos(p.heading)), out = V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading));
    const spot = p.pos.clone().addScaledVector(out, side).addScaledVector(fwd, ahead);
    bagS.keep = false;
    if (bagS.arm) { bagS.arm.release(0.2); bagS.arm = null; }
    const bend = p.bend({ down: 0.34, hinge: 0.5, lean: 0.02, back: 0.08 }, true, { dur: 0.7 });
    // (the wrist a hand's grip above the handles: the bag's foot just off the floor as the bend bottoms out)
    const hand = p.reach("R", () => spot.clone().setY(p.pos.y + bag.userData.gripY + GRIP_IN_HAND.x + 0.01).addScaledVector(out, -0.02), { dur: 0.7 });
    await bend;
    bagAt(spot.x, spot.z, p.heading, p.pos.y);
    p.fingers("R", 0, 0.3);
    await p.wait(0.15);
    hand.release(0.6);
    await p.bend({}, false, { dur: 0.6 });
  }
  // and up again: a step to it if it is not beside him, the bend, his hand onto the handles
  async function bagUp(sim) {
    const p = sim.people.tech;
    if (bagS.by === p) return;
    const at = bag.position.clone();
    const out = V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading));
    if (Math.hypot(at.x - p.pos.x, at.z - p.pos.z) > 0.55) {
      const stand = at.clone().addScaledVector(out, -0.3);
      await p.walk([[stand.x, p.pos.y, stand.z]], { speed: 0.6, round: 0 });
    }
    const bend = p.bend({ down: 0.34, hinge: 0.5, lean: 0.02, back: 0.08 }, true, { dur: 0.7 });
    const grip = () => { bag.updateMatrixWorld(true); return bag.localToWorld(V3().set(0, bag.userData.gripY, 0)).sub(GRIP_IN_HAND.clone().applyQuaternion(p.root.getObjectByName("Bip01_R_Hand").getWorldQuaternion(Q4()))); };
    const hand = p.reach("R", grip, { dur: 0.7 });
    await bend;
    p.fingers("R", 0.85, 0.2);
    await p.wait(0.2);
    bagS.by = p; bagS.keep = false;
    const up = p.bend({}, false, { dur: 0.6 });
    hand.release(0.6);
    bagInHand(p);
    await up;
  }

  // ---- the door (S2) ----------------------------------------------------------------------------------------------
  // A knock with the right fist on the door's face, at about chest height: the fist swings back and in, a knock sounds each time
  // it lands. Five firm knocks is the one (Jake 2026-10-29: "take a good firm knock ... a good, you know, five times"; "Mike
  // knocked open-handed instead of a full knock, and it needs to be like with a fist"). The reach puts the wrist where asked, so
  // the wrist stops 0.09 m short of the door's face (0.03) and the knuckles land on it; a light tap is the fingers, half closed.
  async function knock(sim, p, n = 5, soft = false) {
    const face = new sim.T.Vector3(0.16, p.pos.y + 1.36, 0.03 + (soft ? 0.12 : 0.09));
    const tgt = face.clone().setZ(face.z + 0.1);
    p.fingers("R", soft ? 0.45 : 1, 0.3);
    const arm = p.reach("R", () => tgt, { dur: 0.4 });
    await p.wait(0.45);
    const period = soft ? 0.55 : 0.26, back = soft ? 0.035 : 0.09;
    let t = 0, hits = 0;
    await p.run((dt) => {
      t += dt;
      const k = Math.floor(t / period), f = t / period - k;
      if (k >= hits && hits < n) { hits++; sim.knockSound(soft); }
      tgt.z = face.z + (hits >= n && f > 0.5 ? back : back * Math.pow(Math.sin(Math.PI * f), 0.8));
      return hits >= n && f > 0.6;
    });
    p.fingers("R", 0, 0.5);
    await arm.release(0.45);
  }
  // the bad call, shown so it can be seen: up to the side window, hands cupped, looking in
  async function peek(sim, p) {
    const from = p.pos.clone(), h0 = p.heading;
    await p.walk([[0.62, p.pos.y, 0.38]], { speed: 0.7 });
    await p.turnTo(Math.PI, 2);
    const glass = () => new sim.T.Vector3(0.8, p.pos.y + 1.62, 0.04);
    const r = p.reach("R", glass, { dur: 0.5 }), l = p.reach("L", () => glass().add(new sim.T.Vector3(-0.12, 0, 0)), { dur: 0.5 });
    await p.wait(1.6);
    await Promise.all([r.release(0.4), l.release(0.4)]);
    await p.walk([[from.x, from.y, from.z]], { speed: 0.7 });
    await p.turnTo(h0, 2);
  }
  // John comes to the door, takes the handle and pulls it open (it opens in, towards him), lets it swing on, and steps into the
  // doorway, turning to Mike as he comes. Round 3j (Jake 2026-10-30: "John like opens the door and then he like backs up or
  // whatever, which is just weird"): he used to walk backwards out of its swing and then forwards into the doorway. And "the
  // doorway entry is a bit slow and awkward. Like, everybody just moves a little slow": shorter waits, a walking pace.
  async function johnOpens(sim) {
    const { john } = sim.people;
    await john.wait(0.4);
    await john.turnToward(0.52, -0.66);
    await john.walk(L.john_to_door);
    await john.turnTo(0, 3);
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.6 });
    await john.wait(0.65);
    sim.openDoor("door_foyer_outside", true);
    await john.wait(0.35);
    await hand.release(0.3);
    await john.wait(0.25);                                // the door on past where he steps
    await john.walk(L.john_in_door, { round: 0 });
    await john.turnTo(0.1, 3);
  }
  // John closes the front door behind Mike: a step to it, his hand onto its handle, and he eases it shut, stepping after it and
  // leaning in as it comes round to the frame, his hand on the handle the whole way; then he straightens, steps back and turns to
  // Mike. Round 3p (Jake 2026-10-31: "I think the homeowner should like lean in and kind of like close the door instead of
  // slamming it"): it was let go to swing shut at walk.js's own door pace (fast, then slow) with his hand left behind.
  async function johnCloses(sim) {
    const { john, tech } = sim.people;
    const d = sim.door("door_foyer_outside");
    await john.walk(L.john_to_close, { speed: 0.8, round: 0 });
    const hp = sim.handlePoint("door_foyer_outside", true);
    await john.turnToward(hp.x, hp.z);
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.6 });
    john.fingers("R", 0.6, 0.4);
    await john.wait(0.65);
    // the swing, slow off the stop and slow into the frame (walk.js leaves a door alone that it is not swinging itself)
    const a0 = d ? d.rotation.y : 0;
    if (d) { d.userData.open = false; d.userData.target = 0; }
    const swing = tween(john, 2.0, (k) => { if (d) { d.rotation.y = a0 * (1 - k); d.updateMatrixWorld(true); } });
    await john.walk(L.john_close_step, { speed: 0.45, round: 0 });
    await john.bend({ down: 0.05, hinge: 0.3, lean: 0.08, back: 0.02 }, true, { dur: 0.6 });
    await swing;
    await john.wait(0.2);
    john.fingers("R", 0, 0.35);
    hand.release(0.5);
    await john.bend({}, false, { dur: 0.6 });
    await john.walk(L.john_after, { backwards: true, speed: 0.5, round: 0 });
    await john.turnToward(tech.pos.x, tech.pos.z);
  }
  // "Nice to meet you too. Come on in.": to Mike, then he turns and walks in out of the doorway as he asks him in (a host leads
  // the way in), to the hinge side of the foyer, and turns back to see him in. Round 3j: he used to back up there first, and then
  // ask him in with his arm swept across (Jake: "he should kind of turn a little bit as he enters").
  async function johnInvites(sim) {
    const { john, tech } = sim.people;
    sim.shot("invite");
    const line = H(sim, "S2_04", { move: null });
    await john.wait(1.0);                                 // "Nice to meet you too." ... "Come on in." as he turns in
    await john.walk(L.john_in, { round: 0.3 });
    await john.turnToward(tech.pos.x, tech.pos.z);
    await line;
  }
  // "Here's my card": between his index and middle fingers, his hand palm up (Jake 2026-10-30: "it needs to be in his fingers. I
  // tend to put it between the index and the middle finger with palm exposed upwards to hand it to them"), held out to John, who
  // takes it by its far end between his thumb and fingers, and keeps it.
  const CARD_MIKE = [0.165, 0.012, 0.011];                // in Mike's hand: between those two fingers, out past their tips
  async function handCard(sim, step = true) {
    const { john, tech } = sim.people, V = sim.T.Vector3;
    if (step) await tech.walk(L.tech_card, { speed: 0.8, round: 0 });
    tech.hold(card, "Bip01_R_Hand", CARD_MIKE);
    card.rotation.set(Math.PI, 0, 0);                     // its face (the lockup, its -y side) to the palm's side: up, with the palm up
    const toJohn = () => new V().subVectors(john.pos, tech.pos).setY(0).normalize();
    const meet = () => tech.pos.clone().lerp(john.pos, 0.42).setY(Math.max(tech.pos.y, john.pos.y) + 1.0);
    const fing = tech.grip("R", [0.35, 0, 0.05, 0.85, 0.9], 0.3);
    const give = tech.reach("R", meet, { dur: 0.55 });
    const palm = tech.orient("R", () => toJohn().setY(-0.12), () => { const f = toJohn(); return new V(-f.z, 0, f.x); }, { dur: 0.45 });
    await tech.wait(0.55);
    // John's right hand to its far end, the wrist a hand's length beyond it (where Mike holds it out: once it is in John's hand,
    // aiming at the card itself drew his arm back to his hip)
    const held = card.getWorldPosition(new V());
    const far = () => held.clone().addScaledVector(toJohn(), 0.04 + 0.1);
    const take = john.reach("R", far, { dur: 0.5 });
    const pinch = john.grip("R", [0.55, 0.5, 0.45, 0.4, 0.4], 0.4);
    await john.wait(0.6);
    john.hold(card, "Bip01_R_Hand", [0.1, 0.02, 0.05]);
    card.rotation.set(0, 0, 0);                           // face out, at the fingertips
    fing.release(0.3); palm.release(0.35);
    await give.release(0.45);
    await john.wait(0.35);
    pinch.set([0.4, 0.35, 0.3, 0.3, 0.3]);
    await take.release(0.55);
  }

  // ---- the shoe covers (S3) -----------------------------------------------------------------------------------------
  // Round 3j (Jake 2026-10-30): "the shoe cover shouldn't be done in the threshold. They should be done standing right there. We
  // should actually have him like put on like little shoe covers. They're like a little light blue thingy, like a shower cap on
  // their feet ... forms to the foot, forms to the boot. And then as soon as John says ... come on in ... Oh, I'm gonna slip these
  // shoe covers on real quick. And as he's doing it, then he flows into the line ... thanks ... for having us out today." Where he
  // stands after handing the card over, on his feet: the pair in his right hand, each foot lifted in turn (tech.footUp) and its
  // cover pulled on over the toe and back over the heel, his eyes on it; then his eyes back to John. Until round 3j he walked to
  // the threshold and squatted, and nothing went on his feet.
  function coversOn(on) {
    if (!covers) return;
    for (const S of ["L", "R"]) if (covers[S]) covers[S].visible = on;
    if (covers.bundle && covers.bundle.parent) covers.bundle.parent.remove(covers.bundle);
  }
  async function putOnCovers(sim) {
    const { tech, john } = sim.people, V = sim.T.Vector3;
    if (covers.bundle) tech.hold(covers.bundle, "Bip01_R_Hand", [0.1, -0.035, 0]);
    const fwd = () => new V(Math.sin(tech.heading), 0, Math.cos(tech.heading));
    for (const S of ["R", "L"]) {
      const foot = tech.root.getObjectByName(`Bip01_${S}_Foot`);
      let pull = 0;
      tech.face.target = () => foot.getWorldPosition(new V());
      // (round 3p, Jake: "quick, like jerking motions as they walk in to the door": the bend down was 0.45 s, his head 2.3 m/s)
      const lift = tech.footUp(S, true, { dur: 0.8 });
      const hand = tech.reach("R", () => foot.getWorldPosition(new V()).addScaledVector(fwd(), 0.1 - 0.13 * pull).add(new V(0, 0.1, 0)), { dur: 0.75 });
      await lift;
      if (covers[S]) covers[S].visible = true;            // over the toe ...
      if (S === "L" && covers.bundle && covers.bundle.parent) covers.bundle.parent.remove(covers.bundle);
      await tween(tech, 0.7, (k) => { pull = k; });         // ... and back over the heel
      hand.release(0.6);
      await tech.footUp(S, false, { dur: 0.7 });
    }
    tech.face.target = () => john.eyes();
  }

  // ---- the clipboard down and up (S5, S7) ---------------------------------------------------------------------------
  // At the sink he sets it on the counter, so both hands are free for the guide and then the check, and takes it up again after.
  function boardOnCounter(sim) {
    const tech = sim.people.tech;
    carry.on = false;
    if (carry.arm) { carry.arm.release(0.2); carry.arm = null; }
    tech.fingers("L", 0, 0.2);
    tech.putDown(board, ...COUNTER.at, COUNTER.h);
    board.updateMatrixWorld(true);
  }
  async function boardDown(sim) {
    const tech = sim.people.tech, V = sim.T.Vector3;
    const p0 = board.position.clone(), q0 = board.quaternion.clone();
    const p1 = new V(...COUNTER.at), q1 = new sim.T.Quaternion().setFromEuler(new sim.T.Euler(Math.PI, COUNTER.h, 0));
    // (round 3p: slower, as he puts it down for the check; it went over in two thirds of a second, his hand 4 to 9 m/s; and the carry
    // let go only once the reach to the board has him: let go first, his hand dropped to his side and back up)
    const hand = tech.reach("L", () => board.position.clone().add(new V().subVectors(tech.pos, board.position).setY(0).normalize().multiplyScalar(0.11)).add(new V(0, 0.04, 0)), { dur: 0.45 });
    carry.on = false;
    if (carry.arm) { carry.arm.release(0.6); carry.arm = null; }
    await tween(tech, 1.0, (k) => { board.position.lerpVectors(p0, p1, k); board.quaternion.copy(q0).slerp(q1, k); board.scale.set(1, 1, 1); board.updateMatrixWorld(true); });
    tech.fingers("L", 0, 0.3);
    await hand.release(0.6);
  }
  // (round 3n: turned so the board is ahead of him on his left; facing the sink it was on his right, and his left arm reached
  // across in through his chest for it. Then the reach let go in 0.05 s and the arm jumped to his side: now they ease over)
  async function boardUpAgain(sim) {
    const tech = sim.people.tech, V = sim.T.Vector3;
    const to = Math.atan2(board.position.x - tech.pos.x, board.position.z - tech.pos.z);
    await tech.turnTo(to - 0.4, 2.5);
    const hand = tech.reach("L", () => board.position.clone().add(new V().subVectors(tech.pos, board.position).setY(0).normalize().multiplyScalar(0.11)).add(new V(0, 0.04, 0)), { dur: 0.4 });
    await tech.wait(0.45);
    inHand(sim, true);                                    // back in his hand, at his side
    await hand.release(0.35);
  }

  // ---- the Happy Homes Guide (S5) -----------------------------------------------------------------------------------
  // Jake 2026-10-30: the guide "isn't really big enough. It's a full size. It's like a magazine. ... And he hands it to him. It's
  // like on top of his hand. It needs to be gripped, you know, between the palm and with the thumb over on top and the fingers
  // underneath. And he can even open it a little bit ... and like show a couple things in the book before just immediately
  // handing it over. And John typically is going to flip through a couple pages too once it's been handed to John, because John
  // currently has it and it's like halfway in his hand." (And the script's S5: "Before handing it over, point out three or four
  // features".) So: it rides on his clipboard; at the sink he sets the clipboard on the counter, takes the guide up in both hands
  // and holds it up to John, opens it and turns a page, shuts it, and holds it out flat in his right hand by its edge, thumb on top
  // and fingers under; John takes it by the far edge the same way, holds it up in both hands and turns a couple of pages; then it
  // goes to his side in his left hand, and on the sofa he reads it; when Mike comes to him he puts it down on the seat beside him.
  // Where it is each frame is gs.pose() ({pos, q} in the world), worked out once a frame: the hands holding it reach for its edges,
  // and it is put there after every body is final, so the two agree. Who holds it is written down (gs.holds), so a step that
  // flows on (every pose on top of the clips is cleared then) takes hold of it again.
  const GW = 0.216;
  const Q4 = () => new THREE.Quaternion();
  const gs = { pose: null, at: -1, cache: null, ang: [0, 0, 0, 0], holds: [], fixed: null };
  function guidePose() { const c = window.sim.clock; if (gs.at !== c) { gs.cache = gs.pose ? gs.pose() : gs.fixed; gs.at = c; } return gs.cache; }
  const axesOf = (p) => { const h = p.heading; return { fwd: new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), left: new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), up: new THREE.Vector3(0, 1, 0) }; };
  const boneAt = (p, n) => p.root.getObjectByName(n).getWorldPosition(V3());
  function basis(x, y) { x = x.clone().normalize(); y = y.clone().addScaledVector(x, -y.dot(x)).normalize(); return Q4().setFromRotationMatrix(M4().makeBasis(x, y, x.clone().cross(y))); }
  const mix = (a, b, k) => ({ pos: a.pos.clone().lerp(b.pos, k), q: a.q.clone().slerp(b.q, k) });
  // the guide's own axes (across x, spine at -x; top at -z; cover +y) on the clipboard's (long side x, paper on its -y face)
  const ON_BOARD = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)));
  const GP = {
    // lying on the clipboard's paper
    // (round 3p: its spine edge 2 cm out over the board's edge, on Mike's right as he shows it, for his fingers to take it by)
    board: () => { board.updateMatrixWorld(true); return { pos: board.localToWorld(new THREE.Vector3(0.015, -0.005, -0.025)), q: board.getWorldQuaternion(Q4()).multiply(ON_BOARD) }; },
    // shown to John lying on Mike's flat open hand in front of him, tipped up 35 degrees toward John, its top edge toward Mike
    // (round 3l, Jake: "his hand is like crooked at an unnatural angle, trying to present the Happy Homes brochure. It's just flat,
    // open hand, like just show it to them"; it was held up on end, his hand behind it)
    // (8 cm further out in round 3n: turning a page his left hand crosses to his right, and his arm went in through his chest)
    show: (p) => { const { fwd, left, up } = axesOf(p); return { pos: boneAt(p, "Bip01_Spine2").addScaledVector(fwd, 0.48).addScaledVector(up, -0.3), q: basis(left, up.clone().multiplyScalar(Math.cos(0.61)).addScaledVector(fwd, Math.sin(0.61))) }; },
    // held out flat between them, at a hand's height, its spine edge toward Mike
    // (at 1.15 m: at 1.0 it was out of his reach, his hand stopping above it and the guide hanging off the end of it)
    give: (p, q) => { const { fwd, up } = axesOf(p); return { pos: p.pos.clone().lerp(q.pos, 0.5).setY(Math.max(p.pos.y, q.pos.y) + 1.15), q: basis(fwd, up) }; },
    // in John's two hands, tipped up toward his face to read, out from him (round 3n: 15 cm off his chest, his right hand turning a
    // page went across in through his chest)
    // Round 3p (Jake 2026-10-31: "his arm is cutting into his own side as he's, like, trying to hold the guide ... that elbow really
    // needs to be able to be bent more"): 42 cm out from his chest bone and 14 below, his arms were near straight and his elbows in
    // his sides; now as a man reads a magazine, 33 cm out (about a forearm in front of his chest), at the bottom of his ribs, his
    // elbows bent and a little out and forward of his sides
    read: (p) => { const { fwd, left, up } = axesOf(p); return { pos: boneAt(p, "Bip01_Spine2").addScaledVector(fwd, 0.33).addScaledVector(up, -0.2), q: basis(left.clone().negate(), fwd.clone().negate().multiplyScalar(Math.cos(0.8)).addScaledVector(up, Math.sin(0.8))) }; },
    // down at his left side in his hanging hand, held by its spine edge at the top, its long side front to back. Round 3p (Jake:
    // "when he drops it down beside his side, like his wrist is twisted completely out. It'd be like it would be broken"): his hand
    // was between it and his leg with the palm turned out to it; now the hand is on its outer face, the palm in toward his leg as a
    // hanging hand's is, the fingers down its back cover and the thumb on its inside. Hung from where his hand hangs (his shoulder,
    // down an arm's length), not from his hips (it hung at his knee).
    side: (p) => { const { fwd, left, up } = axesOf(p); return { pos: boneAt(p, "Bip01_L_UpperArm").addScaledVector(left, 0.07).addScaledVector(fwd, 0.04).addScaledVector(up, -0.62 - GW / 2), q: basis(up.clone().negate(), left.clone().negate()) }; },
  };
  // on the sofa's seat to John's right (it is short of seat to his left: he sits at its south end), lying cover up
  const ON_SOFA = { pos: new THREE.Vector3(-5.98, 0.48, -3.74), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + 0.25, 0)) };
  const turned = (i) => Math.min(gs.ang[i], Math.PI - 0.05 - 0.03 * i);
  // a point on the guide (its own axes) in the world; a leaf's outer edge as it turns
  const onGuide = (v) => { const g = guidePose(); return v.applyQuaternion(g.q).add(g.pos); };
  const leafEdge = (i) => { const a = turned(i); return new THREE.Vector3(-GW / 2 + GW * Math.cos(a), 0.0034 + (4 - i) * 0.0005 + GW * Math.sin(a), 0.02); };
  // A hand on it (which). Every grip has the fingers straight from the hand's rest (grip abs: the clip's relaxed curl took them
  // into the guide) and the thumb aimed at a point on the cover (thumbAt), and the guide is solid to the fingers of both of them
  // (Person.solids: guideSolid). Round 3l (Jake: "His fingers still come through as he's handing it to them. There's no thumb.
  // Why can't we tell the fingers that like they can't go through things? ... The homeowner's hand still goes through.")
  // - "spine", "outer", or a leaf's number (to turn it with): the fingers flat behind it, the palm to it, the thumb round the
  //   edge onto the front;
  // - "palm": under it, flat and open, the fingers out toward John (showing it);
  // - "back": flat behind the spine, the fingers up it (John reading it open);
  // - "underSpine", "underOuter": under that edge, palm up, the fingers in under it and the thumb over the top (handing over).
  // h.set(which) moves it there (eased over a third of a second); h.release() lets go; h.which is where it is.
  const GRIPS = { edge: [0, 0.06, 0.06, 0.08, 0.1], flat: [0, 0, 0, 0, 0], under: [0, 0.04, 0.04, 0.06, 0.08] };
  function holdAt(which, g, side) {
    const V = THREE.Vector3, ax = (x, y, z) => new V(x, y, z).applyQuaternion(g.q), at = (x, y, z) => ax(x, y, z).add(g.pos);
    // (the thumb laid along under it too: left to itself it stood up through the pages)
    if (which === "palm") return { w: at(-GW / 2 + 0.05, -0.034, -0.1), fing: ax(0, 0, 1), palm: ax(0, 1, 0), thumbAt: at(-GW / 2 - 0.01, -0.024, -0.03), grip: GRIPS.flat };
    if (which === "back") return { w: at(-GW / 2 + 0.01, -0.034, 0.07), fing: ax(0, 0, -1), palm: ax(0, 1, 0), thumbAt: at(-GW / 2 - 0.015, -0.026, 0.0), grip: GRIPS.flat };
    if (which === "underSpine") return { w: at(-GW / 2 - 0.05, -0.03, 0), fing: ax(1, 0, 0), palm: ax(0, 1, 0), thumbAt: at(-GW / 2 + 0.035, 0.016, -0.03), grip: GRIPS.under };
    if (which === "underOuter") return { w: at(GW / 2 + 0.05, -0.03, 0), fing: ax(-1, 0, 0), palm: ax(0, 1, 0), thumbAt: at(GW / 2 - 0.035, 0.016, 0.03), grip: GRIPS.under };
    let loc, inn, nrm;
    if (typeof which === "number") { const a = turned(which); loc = leafEdge(which); inn = new V(-Math.cos(a), -Math.sin(a), 0); nrm = new V(-Math.sin(a), Math.cos(a), 0); }
    else { loc = new V(which === "spine" ? -GW / 2 : GW / 2, 0.002, 0.02); inn = new V(which === "spine" ? 1 : -1, 0, 0); nrm = new V(0, 1, 0); }
    const w = loc.clone().addScaledVector(inn, -0.055).addScaledVector(nrm, -0.03), th = loc.clone().addScaledVector(inn, 0.03).addScaledVector(nrm, 0.016).add(new V(0, 0, -0.03));
    return { w: w.applyQuaternion(g.q).add(g.pos), fing: inn.applyQuaternion(g.q), palm: nrm.applyQuaternion(g.q), thumbAt: th.applyQuaternion(g.q).add(g.pos), grip: GRIPS.edge };
  }
  // the guide's block (and the turned pages, once turned) as boxes his fingers keep out of; nothing while it lies on the clipboard
  function guideSolid() {
    const g = guidePose();
    if (!g || (gs.pose === GP.board && !gs.holds.length)) return null;
    const box = (cx, cy, hx, hy) => ({ inv: new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, 0).applyQuaternion(g.q).add(g.pos), g.q, new THREE.Vector3(1, 1, 1)).invert(), half: new THREE.Vector3(hx, hy, 0.1395) });
    return box(0, 0.0025, GW / 2, 0.017);
  }
  function pagesSolid() {
    const g = guidePose();
    if (!g || (gs.pose === GP.board && !gs.holds.length) || !(gs.ang[0] > 2.6)) return null;
    return { inv: new THREE.Matrix4().compose(new THREE.Vector3(-GW, 0.005, 0).applyQuaternion(g.q).add(g.pos), g.q, new THREE.Vector3(1, 1, 1)).invert(), half: new THREE.Vector3(GW / 2, 0.016, 0.1395) };
  }
  function edgeHold(p, side, which, dur = 0.4) {
    let last = null, was = null, setAt = -9;
    const sg = side === "L" ? -1 : 1;
    const frame = () => {
      const g = guidePose() || last;                    // (a hand letting go of it as it is put down: where it last was)
      last = g;
      const f = holdAt(which, g, side), k = Math.min(1, (window.sim.clock - setAt) / 0.35);
      if (was === null || k >= 1) return f;
      const o = holdAt(was, g, side), e = k * k * (3 - 2 * k);
      return { w: o.w.lerp(f.w, e), fing: o.fing.lerp(f.fing, e).normalize(), palm: o.palm.lerp(f.palm, e).normalize(), thumbAt: f.thumbAt, grip: f.grip };
    };
    // (the elbows a little out from his sides, not down and back: holding it out in front of him they were in his sides, John's
    // most; and a hand turning a page, which crosses to the other side, with its elbow out and in front of him, round 3n)
    const fwdOf = () => V3().set(Math.sin(p.heading), 0, Math.cos(p.heading)), outOf = () => V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading)).multiplyScalar(sg);
    // (round 3p: the other holds' elbows a little forward of his sides, not back: back, John's went in at his ribs)
    const arm = p.reach(side, () => frame().w, { dur, pole: () => (typeof which === "number" ? fwdOf().multiplyScalar(0.7).addScaledVector(outOf(), 0.8).add(V3().set(0, -0.2, 0)) : outOf().multiplyScalar(0.75).addScaledVector(fwdOf(), 0.25).add(V3().set(0, -1, 0))) });
    // (the thumb's side, for Person.orient, from the fingers and the palm: fingers x palm, the other way for the left hand)
    const hand = p.orient(side, () => frame().fing, () => { const f = frame(); return f.fing.clone().cross(f.palm).multiplyScalar(sg); }, { dur });
    const fing = p.grip(side, holdAt(which, guidePose() || GP.board(), side).grip, dur, true);
    const thumb = p.thumbAt(side, () => frame().thumbAt, { dur });
    arm.fn.pin = side;                                    // (keepArmsOut, where it is on, swings this elbow out of him, but never moves the hand off it)
    return {
      arm, get which() { return which; },
      set(w) { if (w === which) return; was = which; which = w; setAt = window.sim.clock; fing.set(holdAt(w, guidePose() || last, side).grip); },
      release(sec = 0.4) { arm.fn.pin = null; fing.release(sec); hand.release(sec); thumb.release(sec); return arm.release(sec); },
    };
  }
  // who holds it, by which edge; kept (taken hold of again after a step change cleared the poses)
  function holdGuide(list) {
    for (const h of gs.holds) if (h.h && list.every((x) => x.h !== h.h)) h.h.release(0.3);
    gs.holds = list;
  }
  function keepHolds() {
    for (const h of gs.holds) if (!h.h || !h.p.posers.includes(h.h.arm.fn)) h.h = edgeHold(h.p, h.side, h.h ? h.h.which : h.which, 0.05);
  }
  const holdOf = (p, side) => (gs.holds.find((h) => h.p === p && h.side === side) || {}).h;
  function guideStep() {
    if (!guide) return;
    keepHolds();
    const g = guidePose();
    if (!g) { if (guide.parent) guide.parent.remove(guide); return; }
    if (guide.parent !== window.walk.scene) window.walk.scene.add(guide);
    guide.position.copy(g.pos); guide.quaternion.copy(g.q); guide.scale.set(1, 1, 1);
    for (let i = 0; i < 4; i++) guide.userData.leaf(i, gs.ang[i]);
  }
  // where the guide is at a step's start: on the clipboard, at John's side, in his hands on the sofa, on the sofa
  function guideAt(sim, where) {
    const { john } = sim.people;
    gs.ang = [0, 0, 0, 0]; gs.fixed = null;
    for (const h of gs.holds) if (h.h) h.h.release(0.05);
    gs.holds = [];
    if (where === "board") gs.pose = GP.board;
    else if (where === "side") { gs.pose = () => GP.side(john); gs.holds = [{ p: john, side: "L", which: "spine" }]; }
    else if (where === "reading") { gs.pose = () => GP.read(john); gs.holds = [{ p: john, side: "L", which: "spine" }, { p: john, side: "R", which: "outer" }]; }
    else if (where === "sofa") { gs.pose = null; gs.fixed = ON_SOFA; }
  }
  // a page turned (to: PI over, 0 back) by a hand holding it: the hand to the page's edge, over with it past upright, and back to
  // the stack while it falls the rest of the way by itself. Round 3n: the hand went right over with it to the far side, across his
  // body, and his arm went in through his chest (Mike 8 cm, John 16).
  const UPRIGHT = Math.PI * 0.62;
  async function turnPage(p, hold, i, to, sec = 0.7) {
    hold.set(i);
    await p.wait(0.25);
    const a0 = gs.ang[i];
    if (to > UPRIGHT && a0 < UPRIGHT) {
      await tween(p, sec * (UPRIGHT - a0) / (to - a0), (k) => { gs.ang[i] = a0 + (UPRIGHT - a0) * k; });
      hold.set("outer");
      await tween(p, 0.35, (k) => { gs.ang[i] = UPRIGHT + (to - UPRIGHT) * k * k; });
      return;
    }
    await tween(p, sec, (k) => { gs.ang[i] = a0 + (to - a0) * k; });
    hold.set("outer");
  }
  // turned pages shut together: they lift back over past upright as the hand comes to the top one there (not reaching right across
  // for it where it lies), then down with it onto the stack
  async function shutPages(p, hold, list) {
    hold.set(list[0]);
    const a0 = list.map((i) => gs.ang[i]);
    await tween(p, 0.3, (k) => list.forEach((i, n) => { gs.ang[i] = a0[n] > UPRIGHT ? a0[n] + (UPRIGHT - a0[n]) * k : a0[n]; }));
    const a1 = list.map((i) => gs.ang[i]);
    await tween(p, 0.35, (k) => list.forEach((i, n) => { gs.ang[i] = a1[n] * (1 - k); }));
  }
  // "Before I get started, I want to leave this with you". Round 3p (Jake 2026-10-31: "the hand placement is still way off, like with
  // handing the guide over. I don't think [he] should put his clipboard down ... The tech should hold the clipboard"; and from the
  // side his arms were out straight, the guide at arm's length): the clipboard comes up flat in front of him in his left hand, the
  // guide on it the right way up for John; his right hand opens the cover from its outer edge and turns a page, shuts it, takes it
  // up by the spine edge (out over the board's edge), thumb on top and fingers under, and holds it out flat between them at a
  // hand's height; John takes the far edge the same way, Mike lets go and his clipboard goes back to his side, and John brings it
  // up to look at, his left hand coming to the spine.
  async function showGuide(sim) {
    const { john, tech } = sim.people;
    gs.pose = GP.board;
    carry.showWant = 1;
    tech.face.target = () => guidePose().pos.clone();
    await tech.wait(0.8);
    tech.face.target = () => john.eyes();
    const r = edgeHold(tech, "R", 0, 0.45);
    holdGuide([{ p: tech, side: "R", which: 0, h: r }]);
    await tech.wait(0.5);
    await turnPage(tech, r, 0, Math.PI, 0.8);             // the cover over: water softeners and filtration, dripping faucets
    await tech.wait(1.4);
    await turnPage(tech, r, 1, Math.PI, 0.7);             // garbage disposals, tankless water heaters
    await tech.wait(1.2);
    // shut: the pages brought back over, the last turned first
    await shutPages(tech, r, [1, 0]);
    // up off the board by its spine edge and out to him, flat
    r.set("underSpine");
    await tech.wait(0.45);
    // (John steps in to take it, and back: 1.06 m apart, the two of them met with their arms out straight)
    const home = john.pos.clone(), toMike = V3().subVectors(tech.pos, john.pos).setY(0).normalize();
    const stepIn = john.walk([[home.x + toMike.x * 0.2, home.y, home.z + toMike.z * 0.2]], { speed: 0.45, round: 0 });
    let k2 = 0; gs.pose = () => mix(GP.board(), GP.give(tech, john), k2);
    await tween(tech, 0.8, (k) => { k2 = k; });
    gs.pose = () => GP.give(tech, john);
    john.face.target = () => guidePose().pos.clone();
    await stepIn;
    const jr = edgeHold(john, "R", "underOuter", 0.5);
    holdGuide([{ p: tech, side: "R", which: "underSpine", h: r }, { p: john, side: "R", which: "underOuter", h: jr }]);
    await john.wait(0.6);
    // his now: Mike lets go, and his clipboard goes back down to his side
    holdGuide([{ p: john, side: "R", which: "underOuter", h: jr }]);
    carry.showWant = 0;
    let k3 = 0; gs.pose = () => mix(GP.give(tech, john), GP.read(john), k3);
    const up = tween(john, 0.9, (k) => { k3 = k; });
    john.walk([[home.x, home.y, home.z]], { backwards: true, speed: 0.4, round: 0 });
    await john.wait(0.35);
    const jl = edgeHold(john, "L", "spine", 0.5);
    holdGuide([{ p: john, side: "R", which: "underOuter", h: jr }, { p: john, side: "L", which: "spine", h: jl }]);
    jr.set("outer");
    await up;
    gs.pose = () => GP.read(john);
  }
  // "Does anything in that guide catch your eye?": he turns a couple of pages
  async function johnLooks(sim) {
    const { john } = sim.people;
    const r = holdOf(john, "R");
    if (!r) return;
    john.face.target = () => guidePose().pos.clone();
    await john.wait(0.5);
    await turnPage(john, r, 0, Math.PI, 0.8);
    await john.wait(0.9);
    await turnPage(john, r, 1, Math.PI, 0.7);
    await john.wait(0.5);
  }
  // "Look through it while I work": he shuts it and it goes down to his side in his left hand
  async function johnKeeps(sim) {
    const { john, tech } = sim.people;
    await john.wait(1.0);
    john.face.target = () => tech.eyes();
    const r = holdOf(john, "R");
    if (r) {
      await shutPages(john, r, [1, 0]);
      r.set("outer");
    }
    const jl = holdOf(john, "L");
    if (jl) jl.set("spine");
    holdGuide([{ p: john, side: "L", which: "spine", h: jl }]);
    let k4 = 0; const from = GP.read(john);
    gs.pose = () => mix(from, GP.side(john), k4);
    await tween(john, 0.6, (k) => { k4 = k; });
    gs.pose = () => GP.side(john);
  }
  // sat down on the sofa: up in both hands to read while he waits
  async function johnReads(sim) {
    const { john } = sim.people;
    // up in his left hand first, his right off his thigh onto its outer edge once it is in front of him (round 3n: his right hand
    // went for it down at his left hip, across through his belly)
    const jl = holdOf(john, "L");
    if (jl) jl.set("spine");
    // (from where it is at his side each frame: taken once, the moment he had just sat, it was where his hips had been a moment
    // before, behind him)
    let k = 0; gs.pose = () => mix(GP.side(john), GP.read(john), k);
    await tween(john, 0.7, (x) => { k = x; });
    gs.pose = () => GP.read(john);
    const jr = edgeHold(john, "R", "outer", 0.5);
    holdGuide([{ p: john, side: "L", which: "spine", h: jl }, { p: john, side: "R", which: "outer", h: jr }]);
    john.face.target = () => guidePose().pos.clone();
  }
  // Mike calls to him: he looks up and puts it down on the seat beside him
  async function johnPutsDown(sim) {
    const { john, tech } = sim.people;
    john.face.target = () => tech.eyes();
    if (gs.fixed) return;
    // with his right hand only: the seat is on his right (round 3n: his left hand went with it too, and that arm across through him)
    const right = gs.holds.filter((h) => h.p === john && h.side === "R");
    if (right.length) holdGuide(right);
    const from = guidePose();
    let k = 0; gs.pose = () => mix(from, ON_SOFA, k);
    await tween(john, 0.7, (x) => { k = x; });
    holdGuide([]);
    gs.pose = null; gs.fixed = ON_SOFA;
  }

  // ---- John on the sofa ------------------------------------------------------------------------------------------------
  // A hand with nothing in it rests on his thigh while he sits on the sofa, and goes there as he sits down. Round 3n: the chair
  // clip's sitting pose has the hands back behind him on the seat's edge; on the sofa his arms went into his back (12 cm), taking
  // the guide up from there his right arm went through him, and in S8 he sat like that while Mike talked to him.
  // (round 3p: anywhere he sits, the table too, and Mike's free hand as well: at the table John "doing something weird with his
  // hands" was the table clips' fidgets, and those are not played now)
  const lap = { john: { L: null, R: null }, tech: { L: null, R: null } };
  let tapping = false;                                    // Mike's right forefinger on his tablet (tapTablet)
  function handOnLap(p, S) {
    const sg = S === "L" ? -1 : 1;
    const thigh = () => { const hip = boneAt(p, `Bip01_${S}_Thigh`), knee = boneAt(p, `Bip01_${S}_Calf`); return { hip, knee, along: knee.clone().sub(hip).setY(0).normalize() }; };
    // the wrist over the middle of his thigh, the hand flat on it, fingers toward his knee (the thumb's side: fingers x palm,
    // the other way for the left hand)
    const arm = p.reach(S, () => { const t = thigh(); return t.hip.lerp(t.knee, 0.45).add(V3().set(0, 0.1, 0)); }, { dur: 0.6 });
    const hand = p.orient(S, () => thigh().along, () => thigh().along.cross(new THREE.Vector3(0, -1, 0)).multiplyScalar(sg), { dur: 0.6 });
    const fing = p.grip(S, [0.1, 0.2, 0.25, 0.3, 0.35], 0.6, true);
    return { arm, release(sec = 0.4) { fing.release(sec); hand.release(sec); return arm.release(sec); } };
  }
  function lapStep() {
    for (const who of ["john", "tech"]) {
      const p = window.sim.people[who], clip = p.action && p.action.getClip().name;
      const sitting = (p.base === "sit_chair_idle_neutral_01" || clip === "sit_down_chair_01") && clip !== "sit_stand_up_chair_01";
      for (const S of ["L", "R"]) {
        const busy = gs.holds.some((h) => h.p === p && h.side === S) || (who === "tech" && (S === "L" ? carry.on : tapping || bagS.by === p));
        const want = sitting && !busy, h = lap[who][S];
        if (want && (!h || !p.posers.includes(h.arm.fn))) lap[who][S] = handOnLap(p, S);
        else if (!want && h) { h.release(0.4); lap[who][S] = null; }
      }
    }
  }

  // ---- the check at the sink (S7) -----------------------------------------------------------------------------------
  // Round 3j (Jake 2026-10-30): "when he goes to inspect underneath the sink, he doesn't open the cabinet doors. The cabinet doors
  // need to open. Also, him kneeling down, it makes his back all seriously contorted." Down on one knee at the cabinet's middle
  // (tech.kneel, not the squat), both doors opened by their handles (the sink's model has them on hinges: door_left, door_right),
  // a lean in to look, a hand in to the trap, a picture with his phone (its flash), the doors shut, up, and his clipboard off the
  // counter.
  function cabDoors() {
    return ["door_left", "door_right"].map((n) => {
      const d = window.walk.scene.getObjectByName(n);
      if (d && !d.userData.cab) {
        // the handle: by the door's free edge, high on it (found from where it stands shut); and which way it swings out into the
        // kitchen
        d.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(d), hinge = d.getWorldPosition(V3());
        const free = Math.abs(box.min.z - hinge.z) > Math.abs(box.max.z - hinge.z) ? box.min.z : box.max.z;
        const hw = new THREE.Vector3(box.max.x, box.min.y + (box.max.y - box.min.y) * 0.8, free + Math.sign(hinge.z - free) * 0.05);
        const r0 = d.rotation.y;
        d.rotation.y = r0 + 1.2; d.updateMatrixWorld(true);
        const sign = new THREE.Box3().setFromObject(d).getCenter(V3()).x > box.getCenter(V3()).x ? 1 : -1;
        d.rotation.y = r0; d.updateMatrixWorld(true);
        d.userData.cab = { r0, sign, handle: d.worldToLocal(hw.clone()), out: d.worldToLocal(hw.clone().add(new THREE.Vector3(0.1, 0, 0))).sub(d.worldToLocal(hw.clone())).normalize() };
      }
      return d;
    }).filter(Boolean);
  }
  function setCabinet(open) { for (const d of cabDoors()) { d.rotation.y = d.userData.cab.r0 + (open ? d.userData.cab.sign * 1.75 : 0); d.updateMatrixWorld(true); } }
  async function swingCabinet(sim, open) {
    const { tech } = sim.people;
    const ds = cabDoors();
    // his left hand to the north door, his right to the south one (he faces west)
    const hands = ds.map((d) => {
      const north = d.getWorldPosition(V3()).z > -6.05;
      return tech.reach(north ? "L" : "R", () => d.localToWorld(d.userData.cab.handle.clone().addScaledVector(d.userData.cab.out, 0.07)), { dur: 0.35 });
    });
    await tech.wait(0.4);
    const r = ds.map((d) => d.rotation.y);
    await tween(tech, 0.6, (k) => { ds.forEach((d, i) => { d.rotation.y = r[i] + ((d.userData.cab.r0 + (open ? d.userData.cab.sign * 1.75 : 0)) - r[i]) * k; d.updateMatrixWorld(true); }); });
    await Promise.all(hands.map((h) => h.release(0.35)));
  }
  // A hand carried along a path (points after where it is now, a smooth curve through them) over sec by a reach that takes it from
  // where it is: { arm (release it when done with it), done }. Its reach is whole at once (it starts where the hand is), and the one
  // it takes over from is let go only after that (glideFrom): while one reach let go and the next came in, each blending from the
  // arm as the one before left it, the hand dipped half way back to his hip and out again, 0.3 m in a frame (round 3p).
  function glide(p, side, pts, sec, pole) {
    const hb = p.root.getObjectByName(`Bip01_${side}_Hand`);
    p.root.updateMatrixWorld(true);
    const curve = new THREE.CatmullRomCurve3([hb.getWorldPosition(V3()), ...pts.map((a) => new THREE.Vector3(...a))]);
    let k = 0;
    const arm = p.reach(side, () => curve.getPoint(k), { dur: 0.02, pole });            // (tween eases k already)
    arm.fn.free = true;                                   // (under the sink: his body may move this hand off him, as it could in round 3n)
    return { arm, done: tween(p, sec, (x) => { k = x; }) };
  }
  function glideFrom(prev, p, side, pts, sec, pole) { const g = glide(p, side, pts, sec, pole); p.wait(0.1).then(() => prev.release(0.2)).catch(() => {}); return g; }
  async function checkSink(sim) {
    const { tech } = sim.people, V = sim.T.Vector3;
    await boardDown(sim);                                 // (round 3p: he holds it all through the guide; down for the check)
    await tech.walk([KNEEL], { speed: 0.6, round: 0 });
    await tech.turnTo(-Math.PI / 2, 2.5);                 // to the sink on the west wall
    show(sim, "check");
    tech.selfSolid = true;                                // his trunk and head solid to his arms all through the check (Person.selfSolid)
    const inside = new V(-6.35, 0.32, -6.05), under = new V(-6.32, 0.74, -6.05);
    tech.face.target = () => inside.clone();
    await tech.kneel(true, { dur: 0.9 });
    await swingCabinet(sim, true);
    await tech.wait(0.5);
    // Then down onto his right side, lying as in bed, his head in under the sink looking up into it: the hips one on the other,
    // the two legs together and parallel behind him, the knees a little bent; his top (left) hand in to the trap and up with his
    // phone for the picture. Round 3l (Jake 2026-10-30, on round 3k's sitting on one hip, one leg out and the other knee up:
    // "whatever weird scissor effect thing he's got going on ... No, his legs go side by side and parallel with each other, and he
    // leans over, like someone just lying down on their side, like they're laying in a bed."). The face's own steering is made
    // for a body upright, so lying down his head is aimed by Person.lookAt.
    const onKnee = tech._kn.tgt;
    const onSide = (g) => {
      const { fwd, left, up } = g, floor = g.floor, back = fwd.clone().negate();
      // (his head at the cabinet's edge, not in it: round 3m, Jake, "he's too deep underneath the sink. He just needs to be at
      // the very edge of the cabinet, his head, so he can see"; it was 14 cm in. The island is 1.29 m from the cabinet, so his
      // hips and knees bend as in bed, the feet out past the island's north end)
      const pel = g.base.clone().addScaledVector(fwd, -0.15).setY(floor + 0.17);
      const foot = pel.clone().addScaledVector(back, 0.42).addScaledVector(left, 0.5).setY(floor + 0.06);
      const knee = left.clone().addScaledVector(fwd, 0.35).addScaledVector(up, 0.1);
      return { pelvis: pel, hinge: 1.52, lean: 0.02, roll: 1.52, raise: 0.24,
        R: { at: foot.clone(), pole: knee.clone() },
        L: { at: foot.clone().addScaledVector(up, 0.13), pole: knee.clone() } };
    };
    tech.face.target = null;
    const look = tech.lookAt(() => under.clone(), { dur: 1.2 });
    // (the floor solid to his fingers while he is down there, and on the way down)
    const floorBox = () => ({ inv: new THREE.Matrix4().makeTranslation(-tech.pos.x, 0.5 - 0.012 - tech.pos.y, -tech.pos.z), half: new THREE.Vector3(3, 0.5, 3) });
    floorBox.floor = true;
    tech.solids = tech.solids.filter((f) => !f.floor);     // (one left by a check that a step change cut short)
    tech.solids.push(floorBox);
    // his bottom (right) arm as it lies with his weight on that shoulder: the elbow in at his side, the forearm on the floor out
    // in front of his belly (he faces north), palm up. Round 3m: reaching out past his head along the cabinet's floor it went
    // through his face (Jake: "his arm is like through himself"); then out in front of his chest palm down, its elbow stood up
    // over the shoulder (round 3n, Jake: "No one's elbow can make that. Like, once your shoulder's down, it can't physically make that
    // motion ... That typically just lays, because he's kind of more on his shoulder, and he's kind of like palm up, and his
    // elbow's tucked into his side there"). It goes there as he goes down (left to the kneeling clip on the way down, the hand
    // went in through the floor).
    const shR = tech.root.getObjectByName("Bip01_R_UpperArm");
    const prop = tech.reach("R", () => shR.getWorldPosition(new V()).add(new V(0.3, 0, 0.36)).setY(0.05), { dur: 1.5, pole: () => new V(1, -0.1, -0.6) });
    prop.fn.free = true;
    // (palm up, the fingers on along the forearm, a little curled as a hand lying open, out from under the open door's corner;
    // the thumb's side, for the right hand, fingers x palm)
    const fR = new V(0.05, 0, 1).normalize();
    const flatR = tech.orient("R", () => fR.clone(), () => fR.clone().cross(new V(0, 1, 0)), { dur: 1.5 });
    const openR = tech.grip("R", [0.05, 0.2, 0.25, 0.3, 0.35], 1.5, true);
    await tech._kn.change(onSide, 1.7);
    // his top (left) arm while it is not in under the sink: along his side, the hand on his hip, palm down, as lying in bed. Round
    // 3n (Jake: "The top arm is now like resting through his body. Treat these things as solid objects ... we need the active arm,
    // the one that's up, his left top arm, to be in a natural pose, not like laying back through his body"): flat on the floor in
    // front of his chest its upper arm went 8 cm in through his chest (from the top shoulder the floor is out of reach any other
    // way).
    const restL = tech.reach("L", () => new V(-5.28, 0.365, -5.865), { dur: 0.6, pole: () => new V(0, 1, 0.5) });
    restL.fn.free = true;
    const fL = new V(0.1, -0.3, 1).normalize();
    const onHip = () => [tech.orient("L", () => fL.clone(), () => fL.clone().cross(new V(0, -1, 0)).negate(), { dur: 0.5 }), tech.grip("L", [0.05, 0.15, 0.2, 0.25, 0.3], 0.5, true)];
    let handL = onHip();
    await tech.wait(0.8);
    // his top hand in to the trap: his fingertips on the J bend's nut from the front, the hand reaching in under the waste arm,
    // in front of his face, the elbow up and away from his head. Round 3p (Jake 2026-10-31: "the technician's hands go into the
    // plumbing when he's underneath there inspecting, into the plumbing, into the garbage disposal"): his wrist went to a point
    // inside the disposal's discharge (-6.3, 0.45, -5.97). The plumbing under the basin is solid to his fingers while he is down
    // there (PLUMBING, from the sink's own parts).
    handL.forEach((h) => h.release(0.4));
    const pipes = PLUMBING.map(([a, b]) => { const c = a.map((v, i) => (v + b[i]) / 2), half = new V(...a.map((v, i) => (b[i] - v) / 2 + 0.004)); const f = () => ({ inv: new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]), half }); return f; });
    tech.solids.push(...pipes);
    // (each way his hand carried along a path, out in front of the cabinet and in: blended from one arm's solve to the other's, the
    // hand swung out wide on the way back to his hip, 0.3 m in a frame, round 3p)
    const pole = () => new V(0.3, 1, 0.4), HIP = [-5.28, 0.365, -5.865];
    const reachIn = glide(tech, "L", [[-5.8, 0.52, -6.1], [-6.12, 0.37, -6.29]], 1.1, pole);
    const touch = tech.orient("L", () => new V(-1, -0.1, -0.05), () => new V(0, 1, 0), { dur: 0.9 });
    await reachIn.done;
    await tech.wait(1.2);
    // back to his hip, for the phone in his pocket (each way about a metre: in half a second it was a rush)
    touch.release(0.6);
    handL = onHip();
    const back = glideFrom(reachIn.arm, tech, "L", [[-5.8, 0.55, -6.1], HIP], 1.1, pole);
    await back.done;
    await tech.wait(0.25);
    // a picture: his phone up over his face, its camera up into the cabinet, its screen to him: in front of the plumbing, between
    // the disposal and the trap's tailpiece, over the waste arm (round 3p: its far end was in the disposal)
    handL.forEach((h) => h.release(0.3));
    tech.hold(phone, "Bip01_L_Hand", [0.075, 0.02, 0]); phone.rotation.set(Math.PI, 0, 0);     // its back in his palm, the screen out of it
    const up = glideFrom(back.arm, tech, "L", [[-5.75, 0.6, -6.05], [-6.05, 0.55, -6.14]], 1.0, pole);
    // (the fingers in toward the back of the cabinet, the palm down to his face; the thumb's side, for the left hand, -(fingers x palm))
    const aim = tech.orient("L", () => new V(-1, 0.25, 0), () => new V(0, 0, -1), { dur: 0.9 });
    await up.done;
    await tech.wait(0.3);
    phone.userData.flash.intensity = 4;
    await tech.wait(0.12);
    phone.userData.flash.intensity = 0;
    await tech.wait(0.7);
    // and back into his pocket
    aim.release(0.6);
    handL = onHip();
    const down = glideFrom(up.arm, tech, "L", [[-5.75, 0.55, -6.0], HIP], 1.0, pole);
    await down.done;
    if (phone.parent) phone.parent.remove(phone);
    await tech.wait(0.4);
    // back up onto his knee
    prop.release(1.4); flatR.release(1.4); openR.release(1.4);
    restL.release(1.0); down.arm.release(1.0); handL.forEach((h) => h.release(0.8));
    look.release(1.2);
    tech.face.target = () => inside.clone();
    await tech._kn.change(() => onKnee, 1.6);
    tech.solids = tech.solids.filter((f) => f !== floorBox && !pipes.includes(f));
    // the doors shut, up off his knee, and the clipboard back off the counter
    await swingCabinet(sim, false);
    tech.face.target = null;
    await tech.kneel(false, { dur: 0.8 });
    await tech.walk([[-5.72, 0, -6.35]], { speed: 0.6, round: 0 });
    await boardUpAgain(sim);
    await tech.walk([[-5.5, 0, -6.05]], { speed: 0.6, round: 0, backwards: true });
    await tabletFromBag(sim);                             // his tablet out of his bag, onto his clipboard (round 3p)
  }

  // ---- his tablet ----------------------------------------------------------------------------------------------------
  // Round 3p (Jake 2026-10-31: "typically we'll be using a tablet ... If you can show anything, you need to show the clipboard or
  // even some of those pictures out of the Happy Home guides, because there's the field diagrams"): it lives in his toolbag; after
  // the check at the sink he takes it out and lays it on his clipboard, and from there he shows John his pictures (the sofa, S8)
  // and puts his findings together on it at the water heater, and shows them at the table. Its pages: the house's own finding
  // pictures (the trap, the drain pan) and the two field diagrams from the Comms app (Jake's component pictures).
  const TAB_PAGES = [
    { title: "Kitchen sink: the trap", img: "finding_p_trap.jpg" },
    { title: "Kitchen sink diagram", img: "field_kitchen_sink.jpg" },
    { title: "Water heater: the drain pan", img: "finding_drain_pan.jpg" },
    { title: "Water heater diagram", img: "field_electric_water_heater.jpg" },
  ];
  const TAB_ON_BOARD = [0.02, -0.0125, 0];                 // lying on the clipboard's paper, clear of the clip
  function tabletOnBoard(on) {
    if (!tab) return;
    if (on) { board.add(tab); tab.position.set(...TAB_ON_BOARD); tab.rotation.set(0, 0, 0); tab.scale.set(1, 1, 1); }
    else if (tab.parent) tab.parent.remove(tab);
  }
  // out of the bag (bend, his right hand into it, up with it) and onto the clipboard, brought up to him to lay it on
  async function tabletFromBag(sim) {
    const p = sim.people.tech;
    // (each prop's world matrix brought up to date before it is read: until a frame is drawn it is where it was last drawn, and his
    // hand went for where the bag had last been in his hand, round 3p)
    const top = () => { bag.updateMatrixWorld(true); return bag.localToWorld(V3().set(0, window.sim.BAG.H + 0.01, 0)); };
    const fwd = V3().set(Math.sin(p.heading), 0, Math.cos(p.heading)), out = V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading));
    const near = Math.hypot(bag.position.x - p.pos.x, bag.position.z - p.pos.z);
    if (near > 0.6) { const st = bag.position.clone().addScaledVector(out, -0.3).addScaledVector(fwd, -0.15); await p.walk([[st.x, p.pos.y, st.z]], { speed: 0.6, round: 0 }); }
    // (turned to it first, a little to his right: it was behind him after the check, and his hand went round through him to it and
    // came back across in a quarter of a second, round 3p)
    await p.turnToward(bag.position.x, bag.position.z);
    await p.turnTo(p.heading + 0.35, 2);
    const bend = p.bend({ down: 0.34, hinge: 0.5, lean: 0.02, back: 0.08 }, true, { dur: 0.7 });
    const hand = p.reach("R", () => top().add(V3().set(0, 0.08, 0)), { dur: 0.7 });
    p.face.target = () => top();
    await bend;
    await p.wait(0.3);
    // in his hand, held by its edge
    p.hold(tab, "Bip01_R_Hand", [0.09, 0.03, 0]); tab.rotation.set(Math.PI / 2, 0, 0);
    p.fingers("R", 0.5, 0.25);
    const up = p.bend({}, false, { dur: 0.6 });
    boardUp(sim, true);
    // (the hand carried from the bag to over the board, not sent there in a frame)
    const from = top().add(V3().set(0, 0.08, 0)), onto = () => { board.updateMatrixWorld(true); return board.localToWorld(V3().set(...TAB_ON_BOARD)).add(V3().set(0, 0.06, 0)); };
    let mv = 0; hand.set(() => from.clone().lerp(onto(), mv));
    p.face.target = () => board.getWorldPosition(V3());
    await tween(p, 0.8, (k) => { mv = k; });
    await up;
    await p.wait(0.2);
    tabletOnBoard(true);
    p.fingers("R", 0, 0.3);
    await hand.release(1.0);                              // (in half a second his hand swung back to his side at 8 m/s)
    p.face.target = null;
  }
  // his right forefinger on the screen a few times, the page changing (putting his findings together, or turning to the next)
  async function tapTablet(sim, pages, gap = 0.7) {
    const p = sim.people.tech;
    tapping = true;
    const at = (u, v) => () => { tab.updateMatrixWorld(true); return tab.localToWorld(V3().set(u, -0.03, v)); };
    const point = p.grip("R", [0.5, 0, 0.9, 0.9, 0.9], 0.3);
    const hand = p.reach("R", at(0, 0.02), { dur: 0.5 });
    await p.wait(0.5);
    for (const [i, pg] of pages.entries()) {
      hand.set(at(0.04 * ((i % 3) - 1), 0.03 * ((i % 2) * 2 - 1)));
      await p.wait(gap * 0.5);
      if (pg !== null) tab.userData.show(pg);
      await p.wait(gap * 0.5);
    }
    point.release(0.4);
    await hand.release(0.5);
    tapping = false;
  }

  // ---- the water heater (S9) ------------------------------------------------------------------------------------------
  // Round 3p (Jake 2026-10-31: "He told him he was going to go to the water heater, so he needs to go to the water heater. And if
  // that's up in the attic or wherever it is, that needs to happen"): this call's house has the electric tank heater in the coat
  // closet off the foyer (the house's closet_electric_tank layout, set in setup), and John told him so at the sink (S6_06). He goes
  // there from the living room: opens the closet door, steps up to it, looks it over and down on one knee at its base (no drain
  // pan: the finding in the recap), takes a picture, puts it all together on his tablet, shuts the door, and goes back to John.
  // (the door is hinged on its south jamb and swings out into the foyer: he stands west of its sweep, steps up to take its handle,
  // and steps back with it as it opens; the foyer's console stands just north of there)
  const WH = { door: "door_foyer_closet_coat", front: [0.3, 0, -1.84], reach: [0.62, 0, -1.86], look: [1.45, 0, -1.86], base: [1.95, 0.12, -2.98], body: [1.95, 0.9, -3.1] };
  async function swingDoor(p, name, open, sec, from = 0, to = 1) {
    const d = window.sim.door(name);
    if (!d) return;
    const st = d.userData, a0 = d.rotation.y, a1 = open ? st.dir * Math.PI / 2 : 0;
    st.open = open; st.target = a1;
    await tween(p, sec, (k) => { d.rotation.y = a0 + (a1 - a0) * (from + (to - from) * k); d.updateMatrixWorld(true); });
  }
  async function checkHeater(sim) {
    const { tech } = sim.people, V = sim.T.Vector3;
    await tech.turnToward(WH.front[0] + 1, WH.front[2]);
    // the door by its handle: it opens out toward him, so a step up to it, his hand on it, and a step back with it as it opens
    const hp = () => sim.handlePoint(WH.door, false);
    await tech.walk([WH.reach], { speed: 0.5, round: 0 });
    const hand = tech.reach("R", hp, { dur: 0.6 });
    tech.fingers("R", 0.6, 0.4);
    await tech.wait(0.65);
    const swing = swingDoor(tech, WH.door, true, 1.6);
    await tech.walk([WH.front], { speed: 0.45, round: 0, backwards: true });
    tech.fingers("R", 0, 0.3);
    hand.release(0.5);
    await swing;
    await tech.walk([WH.look], { speed: 0.6, round: 0 });
    await tech.turnToward(WH.body[0], WH.body[2]);
    tech.face.target = () => new V(...WH.body);
    await tech.wait(1.2);
    // down on one knee to see its base
    tech.face.target = () => new V(...WH.base);
    await tech.kneel(true, { dur: 0.9 });
    await tech.wait(0.8);
    // a picture with his phone, in his right hand (the clipboard is in his left)
    tech.hold(phone, "Bip01_R_Hand", [0.075, 0.02, 0]); phone.rotation.set(0, 0, 0);
    const shoot = tech.reach("R", () => new V(...WH.base).lerp(tech.eyes(), 0.55), { dur: 0.7 });
    await tech.wait(0.9);
    phone.userData.flash.intensity = 4; await tech.wait(0.12); phone.userData.flash.intensity = 0;
    await tech.wait(0.5);
    await shoot.release(0.6);
    if (phone.parent) phone.parent.remove(phone);
    await tech.kneel(false, { dur: 0.8 });
    // it all put together on his tablet, there and then
    tech.face.target = () => tab.getWorldPosition(new V());
    boardUp(sim, true);
    await tech.wait(0.7);
    await tapTablet(sim, [null, 1, null, 2, 3, 0], 0.8);
    boardUp(sim, false, 0.3);
    tech.face.target = null;
    // back out, and the door shut after him, a step after it as it closes
    await tech.walk([WH.front], { speed: 0.55, round: 0, backwards: true });
    await tech.turnToward(WH.front[0] + 1, WH.front[2] + 0.35);
    const h2 = tech.reach("R", hp, { dur: 0.6 });
    tech.fingers("R", 0.6, 0.4);
    await tech.wait(0.6);
    const shut = swingDoor(tech, WH.door, false, 1.6);
    await tech.walk([WH.reach], { speed: 0.45, round: 0 });
    await shut;
    tech.fingers("R", 0, 0.3);
    await h2.release(0.5);
  }

  // ---- the table (S10) ------------------------------------------------------------------------------------------------
  // Round 3p (Jake 2026-10-31): "the chair and the technician are still a little close to John, even sitting at the table ... he
  // should not put his elbows on the table and lean into the table. Should be facing John, squared up, getting serious. John also is
  // leaning in to the table, and the table leg is going through his right foot, so everything kind of needs to be spaced a little
  // bit better." John pulls his chair (the north end's west one) out off the table's corner and sits back in it, turned half way to
  // Mike; Mike pulls his (one of the south end's, tucked in along the west side) out from the table's side and turns it to face John,
  // 1.45 m seat to seat (they sat 0.5 m apart, Mike at a right angle to him with his elbows on the table). Both sit back in their
  // chairs (the sofa's sitting pose, not the table's leaning one), Mike with his clipboard and tablet up in front of him for John.
  // tuck: where the chair stands before (x, y, z, heading); at: where it is pulled out to; pull: where he stands to pull it.
  const SEATS = {
    john: { chair: "furn_chair_kitchen_n0", tuck: [-2.4, 0, -7.28, 0], at: [-2.55, 0, -7.95], pull: [-3.05, 0, -7.75] },
    tech: { chair: "furn_chair_kitchen_s0", tuck: [-2.79, 0, -6.45, Math.PI / 2], at: [-3.1, 0, -6.6], pull: [-3.42, 0, -6.12] },
  };
  // (John's turned half way to Mike from square to the table: his head and eyes do the rest)
  SEATS.john.h = 0.5 * Math.atan2(SEATS.tech.at[0] - SEATS.john.at[0], SEATS.tech.at[2] - SEATS.john.at[2]);
  SEATS.tech.h = Math.atan2(SEATS.john.at[0] - SEATS.tech.at[0], SEATS.john.at[2] - SEATS.tech.at[2]);
  function placeChair(who, out = true) {
    const s = SEATS[who], c = window.walk.scene.getObjectByName(s.chair);
    if (!c) return null;
    if (out) { c.position.set(...s.at); c.rotation.set(0, s.h, 0); } else { c.position.set(s.tuck[0], s.tuck[1], s.tuck[2]); c.rotation.set(0, s.tuck[3], 0); }
    c.updateMatrixWorld(true);
    return c;
  }
  // where he stands to sit down on it once it is out: in front of the seat, his back to it (the sofa's way)
  function chairMark(sim, who, p) {
    const s = SEATS[who], c = window.walk.scene.getObjectByName(s.chair);
    const keep = [c.position.clone(), c.rotation.y];
    placeChair(who, true);
    const mid = new THREE.Box3().setFromObject(c).getCenter(V3());
    c.position.copy(keep[0]); c.rotation.y = keep[1]; c.updateMatrixWorld(true);
    const f = V3().set(Math.sin(s.h), 0, Math.cos(s.h));
    return { stand: mid.addScaledVector(f, 0.03 + sim.SIT_BACK * p.root.scale.x).setY(0), h: s.h };
  }
  // to the chair, his hand on its back, and it slides out and round to where he will sit
  async function pullChair(sim, who) {
    const p = sim.people[who], s = SEATS[who], c = window.walk.scene.getObjectByName(s.chair);
    await p.turnToward(c.position.x, c.position.z);
    const back = () => V3().set(-Math.sin(c.rotation.y) * 0.2, 0.85, -Math.cos(c.rotation.y) * 0.2).add(c.position);
    // (the hand on the side the chair's back is on: John's right hand went across him for it, 17 cm in, round 3p)
    const S = p === sim.people.tech || back().sub(p.pos).dot(V3().set(-Math.cos(p.heading), 0, Math.sin(p.heading))) >= 0 ? "R" : "L";     // (Mike's left has his clipboard)
    const hand = p.reach(S, back, { dur: 0.5 });
    p.fingers(S, 0.6, 0.3);
    await p.wait(0.5);
    const p0 = c.position.clone(), r0 = c.rotation.y, p1 = V3().set(...s.at), r1 = r0 + sim.angleDiff(s.h, r0);
    await tween(p, 0.9, (k) => { c.position.lerpVectors(p0, p1, k); c.rotation.y = r0 + (r1 - r0) * k; c.updateMatrixWorld(true); });
    p.fingers(S, 0, 0.3);
    await hand.release(0.4);
  }
  async function sitOnChair(sim, who, approach) {
    const p = sim.people[who], s = SEATS[who];
    await p.walk([...approach, s.pull]);
    await pullChair(sim, who);
    const m = chairMark(sim, who, p);
    await p.walk([[m.stand.x, 0, m.stand.z]], { speed: 0.6, round: 0 });
    await p.turnTo(m.h, 2.5);
    await p.sitDown("sit_chair_idle_neutral_01");
  }

  // S2 in Practice: you are Mike, out of the van. The calls the script makes (its S2 directions) are what you are scored on:
  // "A steady pace. Not rushing, not timid." "Never scan the house or look in windows." A knock (five, firm), "then step back far
  // enough to move left or right if a dog comes out." "Hand them your card instead of reaching for a handshake." "Never step
  // inside until they invite you."
  async function approachGame(sim) {
    const { john, tech } = sim.people;
    sim.coach("Walk up to the front door: follow the dots to the gold arrow. A steady pace, not rushing. Eyes on the door: never look in the windows.");
    const doorRing = sim.mark([0.2, -0.02, 0.95], 0.5, L.tech_drive.slice(0, -1));
    let rushed = 0, peeked = false, looking = 0;
    const atDoor = () => tech.pos.y > -0.2 && tech.pos.z > 0.15 && tech.pos.z < 1.5 && Math.abs(tech.pos.x - 0.1) < 0.7;
    const windowsWatch = (dt) => {
      if (sim.lookingIn(tech)) looking += dt; else looking = 0;
      if (looking > 0.5 && !peeked) { peeked = true; sim.feedback(false, "Never look in their windows. That's a huge no-no."); }
    };
    await sim.until((dt) => { if (sim.control.running) rushed += dt; windowsWatch(dt); return atDoor(); });
    doorRing.remove();
    sim.control.enabled = false;
    sim.score("pace", rushed < 0.8, rushed < 0.8 ? "A steady pace up to the door" : "Rushed up to the door (a steady pace: not rushing, not timid)");
    sim.feedback(rushed < 0.8 && !peeked, rushed >= 0.8 ? "You hurried up to the door. Walk up at a steady pace: not rushing, not timid." : peeked ? "Up to the door, but you looked in a window on the way." : "A steady approach, eyes on the door.");
    await tech.walk([[KNOCK[0], tech.pos.y, Math.max(KNOCK[2], Math.min(tech.pos.z, 1.0))], KNOCK], { speed: 0.6, round: 0.2 });
    await tech.turnTo(Math.PI, 2);
    await bagDown(sim, 0.3, 0.05);
    tech.face.mood = "smile";
    sim.coach("You are at the door. Make your call.");
    let tries = 0;
    for (;;) {
      const c = await sim.choose("At the door", "What do you do?", [
        { key: "light", label: "Tap lightly on the door" },
        { key: "peek", label: "Look in the side window first" },
        { key: "firm", label: "Knock firmly, five times" },
      ]);
      tries++;
      if (c === "firm") { await knock(sim, tech, 5); sim.feedback(true, "A good firm knock, five times."); break; }
      if (c === "light") { await knock(sim, tech, 2, true); sim.feedback(false, "Too light. They may not hear it, and a timid knock starts you off unsure. Give it a good firm knock, five times."); }
      if (c === "peek") { await peek(sim, tech); peeked = true; sim.feedback(false, "Never look in their windows. That's a huge no-no. Go up to the door and knock."); }
    }
    sim.score("knock", tries === 1, tries === 1 ? "A good firm knock, five times" : "The knock took more than one go (a good firm knock, five times)");
    sim.score("windows", !peeked, peeked ? "Looked in a window (never look in their windows)" : "Eyes on the door, never in the windows");
    // step back
    const spotBack = last(L.tech_back);
    sim.control.enabled = true;
    await sim.prompt(null, "Now step back, far enough to move left or right if a dog comes out: pull the stick back into the ring.", "Step back",
      { at: spotBack, r: 0.38, path: [spotBack], go: () => tech.walk(L.tech_back, { backwards: true, speed: 0.6, round: 0 }) });
    sim.control.enabled = false;
    const roomy = tech.pos.z > 0.9;                        // in the ring (0.8 m back from the knock)
    sim.score("space", roomy, roomy ? "Stepped back to give them room" : "Stayed too close to the door (step back: room for them, and to move if a dog comes out)");
    sim.feedback(roomy, roomy ? "Room for them, and room to move if a dog comes out." : "Step back from the door: give them plenty of space, and room to move if a dog comes out.");
    await tech.turnToward(0.1, 0);
    // John opens up; from here, walking in before he asks you in counts against you
    await johnOpens(sim);
    sim.control.enabled = true;
    let barged = false;
    const inside = sim.until(() => { if (!barged && tech.pos.z < 0.0) { barged = true; sim.feedback(false, "Never step inside until they invite you. Wait for a real invitation, like \"Come on in.\""); } return false; });
    inside.catch(() => {});
    await T(sim, "S2_01");
    await H(sim, "S2_02");
    // your line with the card in it: the card, not a handshake
    const ln = sim.lines.S2_03;
    for (let n = 0; ; n++) {
      const c = await sim.choose("Your line", `“${ln.text}”`, [
        { key: "shake", label: "Reach out to shake his hand" },
        { key: "card", label: "Hand him your card as you say it" },
      ]);
      if (c === "card") {
        sim.score("card", n === 0, n === 0 ? "Handed him your card, not a handshake" : "Went for a handshake first (hand them your card instead)");
        sim.feedback(true, "Your card, not a handshake. If they offer a hand, shake it.");
        sim.control.enabled = false;
        await tech.turnToward(john.pos.x, john.pos.z);
        show(sim, "card");
        // he says it, and "Here's my card" is its second sentence (as in Watch it done)
        const line = sim.say("S2_03", { move: null });
        await tech.wait(1.1);
        await handCard(sim, Math.hypot(tech.pos.x - john.pos.x, tech.pos.z - john.pos.z) > 1.25);
        await line;
        sim.control.enabled = true;
        break;
      }
      sim.feedback(false, "Hand them your card instead of reaching for a handshake. If they offer a hand, shake it.");
    }
    await johnInvites(sim);
    sim.score("invite", !barged, barged ? "Stepped inside before he invited you in" : "Waited to be invited in");
  }

  window.SCENARIOS.sink_call_john = {
    title: "Kitchen sink call: John Smith",
    lines: "sink_call_john",
    people: {
      john: { name: "John", glb: "candidates/sim/john_smith.glb", moves: ["candidates/sim/moves/john_moves.glb", "candidates/sim/moves/john_moves_b.glb"], height: 1.83 },
      tech: { name: "Mike", glb: "candidates/sim/tech_uniform.glb", moves: ["candidates/sim/moves/tech_moves.glb", "candidates/sim/moves/tech_moves_b.glb"], height: 1.83, tech: true },
    },
    legs: L,
    setup(sim) {
      board = sim.props.clipboard(); card = sim.props.card(); guide = sim.props.guide(); phone = sim.props.phone();
      covers = sim.props.shoeCovers(sim.people.tech);
      bag = sim.props.toolbag(); tab = sim.props.tablet(TAB_PAGES);
      // The recap seats (round 3p): both chairs where they are used, from the start (SEATS). Until round 3o Mike's sat along the
      // table's west side tucked in at John's corner, at a right angle to him (round 3h, Jake: "He should be off one corner").
      placeChair("john", false); placeChair("tech", false);
      // this call's water heater: the electric tank in the coat closet off the foyer (the house's own layout picker; walk.js keeps the
      // layout in its config and puts the unit in, loading it if it has to). Round 3p: he goes to it after S9.
      const whSel = [...document.querySelectorAll("select")].find((x) => x.title === "water_heater");
      if (whSel && whSel.value !== "closet_electric_tank") { whSel.value = "closet_electric_tank"; whSel.dispatchEvent(new Event("change")); }
      sim.late.push((dt) => carryStep(sim, dt));
      sim.late.push(() => guideStep());                    // after the clipboard: the guide can lie on it
      sim.late.push(() => lapStep());
      sim.late.push(() => bagStep());
      for (const who of ["tech", "john"]) sim.people[who].solids.push(guideSolid, pagesSolid);
      sim.carry = carry;                                    // its numbers, for trying a hold out in the page
      sim.guideState = gs;
      inHand(sim);
      // The front door opens IN, into the foyer (Jake 2026-10-29: "the door should open in. Most doors open in, not out.").
      // walk.js chooses each door's side once the whole house is in (chooseDoorSides: a door to the outside swings into the room
      // it is opened from); the game now starts after that, and makes sure of this door anyway.
      const d = sim.door("door_foyer_outside");
      if (d) {
        const r0 = d.rotation.y;
        d.rotation.y = d.userData.dir * Math.PI / 2; d.updateMatrixWorld(true);
        const c = new sim.T.Box3().setFromObject(d).getCenter(new sim.T.Vector3());
        d.rotation.y = r0; d.updateMatrixWorld(true);
        if (c.z > 0) d.userData.dir = -d.userData.dir;
      }
    },
    steps: [
      {
        // Jake 2026-10-29: catch him from the edge of the driveway and the whole approach; not overly confident, no snapping
        // round at the turns; up to the door (never looking in the window), a good firm knock, five times, and hand the card.
        num: "S2", title: "The Approach", shot: "drive",
        start(sim) {
          const { john, tech } = sim.people;
          putAway(); inHand(sim); guideAt(sim, "board"); coversOn(false); setCabinet(false); tabletOnBoard(false);
          tech.stand(...VAN);
          bagInHand(tech);                                      // his toolbag in his right hand from the van (round 3p)
          tech.face.mood = "neutral";
          john.stand(0.2, 0, -2.9, Math.PI);
          sim.setDoor("door_foyer_outside", false);
        },
        async run(sim) {
          const { tech } = sim.people;
          if (sim.practice) return approachGame(sim);
          sim.shot("drive");
          await tech.wait(0.8);
          const up = tech.walk(L.tech_drive, { ground: true });
          await sim.until(() => tech.pos.x < 3.3);              // at the foot of the porch steps
          sim.shot("porch");
          await up;
          await tech.turnTo(Math.PI, 1.5);
          await bagDown(sim, 0.3, 0.05);                        // the bag down by the door for the knock: his right hand is the fist
          tech.face.mood = "smile";                             // "Smile before the door opens"
          await tech.wait(0.4);
          await knock(sim, tech, 5);
          await tech.wait(0.3);
          await tech.walk(L.tech_back, { backwards: true, speed: 0.6, round: 0 });
          await tech.turnTo(Math.PI, 2);
          await johnOpens(sim);
          sim.shot("doorway");
          await T(sim, "S2_01");
          await H(sim, "S2_02");
          // "Here's my card" is the second sentence of the line; over his shoulder for it (round 3j: Jake could not see the card go
          // over from where the camera stood)
          const line = T(sim, "S2_03", { move: null });
          await tech.wait(1.0);
          sim.shot("card");
          await handCard(sim);
          await line;
          await johnInvites(sim);
        },
      },
      {
        num: "S3", title: "First Contact", shot: "doorway_in",
        // Jake 2026-10-29: "when he's invited in, he should put on the shoe covers before stepping foot inside the door. And he
        // walks through the door frame just a little bit ... more subtle in those movements, just stepping in ... just enough to
        // clear the door so the door can close, and then he's going to pull up his clipboard to start having a conversation."
        // Then (round 3g): "Anytime they say come on in, it instantly is putting the shoe covers on ... it should flow. It shouldn't
        // wait, step. Some things are going to kind of transition and there's going to be some talking done while other actions
        // are in fact being done." And "who closes the door? ... someone needs to close the door": John does, it is his door.
        // Round 3j (2026-10-30): standing right where he is, not at the threshold; "Oh, I'm gonna slip these shoe covers on real
        // quick", and his thanks straight on as he puts them on (putOnCovers). John's "Oh, you don't have to do that" and his "It's
        // my pleasure" are left out: in the script they answer the covers line after the reviews (S3:6, S3:7, "If they say it's
        // not necessary"), and with the covers first his thanks follow on from it.
        start(sim) {
          const { john, tech } = sim.people;
          putAway(); inHand(sim); guideAt(sim, "board"); coversOn(false); setCabinet(false); tabletOnBoard(false);
          bagAt(...BAG_PORCH);
          sim.setDoor("door_foyer_outside", true);
          const JA = last(L.john_aside), at = last(L.tech_card);
          john.stand(JA[0], 0, JA[2], Math.atan2(at[0] - JA[0], at[2] - JA[2]));
          tech.stand(...at, Math.PI + 0.12);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("covers"); show(sim, "covers");
          putAway();
          let covered = false, barged = false;
          if (sim.practice) {
            sim.until(() => { if (!covered && !barged && tech.pos.z < -0.05) { barged = true; sim.feedback(false, "Shoe covers go on before you step inside. Put them on right there at the door."); } return false; }).catch(() => {});
          }
          // the covers go on where he stands the moment he is asked in, and the thanks flow straight on while he puts them on
          let job = null;
          await T(sim, ["S3_00", "S3_01"], [{ move: null, turn: false, during: () => { job = putOnCovers(sim); } }, { move: null, turn: false }]);
          if (job) await job;
          covered = true;
          if (sim.practice) sim.score("covers", !barged, barged ? "Stepped inside before the shoe covers were on" : "Shoe covers on before stepping inside");
          sim.shot("doorway_in");
          await H(sim, "S3_02");
          // in, through the middle of the doorway and over to the right, as he thanks him for that, his bag taken up first; John
          // shuts the door once he is clear of its swing
          const stepIn = () => tech.walk(L.tech_in, { speed: 0.9, round: 0.25 });
          const thanks = T(sim, "S3_03", { move: null, turn: false });
          await bagUp(sim);
          if (sim.practice) await act(sim, "Step inside, over to the right, so John can close the door behind you.", "Step inside", last(L.tech_in), stepIn, null, L.tech_in);
          else { await stepIn(); }
          const face = tech.turnToward(john.pos.x, john.pos.z);
          if (sim.practice) sim.view("doorway_in");           // the foyer is too narrow for a camera behind him: the two of them
          await johnCloses(sim);
          await face;
          await thanks;
          // the clipboard comes up to start the conversation (and stays up into the discovery)
          await T(sim, "S3_06");
          await H(sim, "S3_07");
        },
      },
      {
        num: "S4", title: "Initial Discovery", shot: "doorway_in",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "board"); coversOn(true); setCabinet(false); tabletOnBoard(false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
          bagInHand(tech);
        },
        async run(sim) {
          sim.shot("doorway_in");
          if (sim.practice) sim.view("doorway_in");
          await bagDown(sim, 0.3, 0.05);                        // down by his feet while they talk (round 3p)
          // his lines that come one after another flow on (round 3j); "Do you mind showing me to the sink? We'll get started." takes
          // the two of them on to the repair (Jake 2026-10-30: "The transition is we got to get to the repair")
          for (const id of ["S4_01", "S4_02", "S4_03", "S4_04", "S4_05", "S4_06", "S4_07", "S4_08", ["S4_09", "S4_10"], "S4_11", ["S4_12", "S4_13"], "S4_14", "S4_15"])
            await (Array.isArray(id) || sim.lines[id].who === "tech" ? T(sim, id) : H(sim, id));
        },
      },
      {
        num: "S5", title: "Happy Homes Guide", shot: "follow_living",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "board"); coversOn(true); setCabinet(false); tabletOnBoard(false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
          { const h = tech.heading; bagAt(tech.pos.x - Math.cos(h) * 0.3 + Math.sin(h) * 0.05, tech.pos.z + Math.sin(h) * 0.3 + Math.cos(h) * 0.05, h); }
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("follow_living");
          // his bag up as John sets off, and after him (round 3p)
          const lead = (async () => { await john.wait(0.6); await john.walk(L.john_lead); })();
          await bagUp(sim);
          await watch(sim, async () => { await tech.walk(L.tech_follow); });
          if (sim.practice) await act(sim, "Follow John to the kitchen sink.", "Follow him", last(L.tech_follow), () => goAlong(sim, tech, L.tech_follow), null, L.tech_follow);
          await lead;
          sim.shot("sink");
          // to John, his bag down by the cabinet as John shows him the sink (his clipboard stays in his hand: round 3p); then the
          // guide (showGuide), and John looks it over
          await tech.turnToward(john.pos.x, john.pos.z);
          show(sim, "sink");
          const down = bagDown(sim, 0.42, 0.35);
          await H(sim, "S5_01");
          await down;
          await T(sim, ["S5_02", "S5_03"], [{ move: null, during: () => showGuide(sim) }, { move: null, during: () => johnLooks(sim) }]);
          await H(sim, "S5_04", { move: null });
          await T(sim, "S5_05", { move: null, during: () => johnKeeps(sim) });
        },
      },
      {
        num: "S6", title: "Game Plan", shot: "sink",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "side"); coversOn(true); setCabinet(false); tabletOnBoard(false);
          john.stand(...JOHN_SINK, 0);
          tech.stand(...AT_SINK, Math.atan2(JOHN_SINK[0] - AT_SINK[0], JOHN_SINK[2] - AT_SINK[2]));
          bagAt(...BAG_SINK);
        },
        async run(sim) {
          sim.shot("sink");
          if (sim.practice) sim.view("sink");
          await T(sim, ["S6_01", "S6_02"]);
          await H(sim, "S6_03");
          // where the water heater is, before he says he is going to it (round 3p)
          await T(sim, "S6_05");
          await H(sim, "S6_06");
          await T(sim, "S6_04");
        },
      },
      {
        num: "S7", title: "The Check", shot: "check",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "side"); coversOn(true); setCabinet(false); tabletOnBoard(false);
          john.stand(...JOHN_SINK, 0);
          tech.stand(...AT_SINK, Math.atan2(JOHN_SINK[0] - AT_SINK[0], JOHN_SINK[2] - AT_SINK[2]));
          bagAt(...BAG_SINK);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("check");
          sim.caption("S7  The Check: John waits on the sofa while you work");
          const toSofa = (async () => {
            await john.walk(L.john_to_sofa);
            await john.turnTo(Math.PI / 2, 2.6);                // back to the sofa
            await john.sitDown();
            await johnReads(sim);                               // and the guide up to read while he waits
          })();
          if (sim.practice) await act(sim, "Do the check at the sink: down on one knee, open the cabinet, look under it, and take a picture.", "Do the check", KNEEL, () => tech.walk([KNEEL]), () => checkSink(sim), [KNEEL]);
          else await checkSink(sim);
          await toSofa;
        },
      },
      {
        num: "S8", title: "Check-In / Share", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); coversOn(true); setCabinet(false); tabletOnBoard(true); tab.userData.show(0);
          john.seated(...SOFA);
          guideAt(sim, "reading");
          tech.stand(-5.5, 0, -6.05, Math.atan2(SOFA[0] + 5.5, SOFA[2] + 6.05));
          bagAt(...BAG_SINK);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          // he calls out before he comes in to him (round 3j, Jake 2026-10-30: "before he enters the living room, he needs to go,
          // Hey, John, pause, and then say his line"); John looks up and puts the guide down on the seat beside him
          if (!sim.practice) await tech.turnToward(john.pos.x, john.pos.z);
          await T(sim, "S8_00", { move: null });
          const down = johnPutsDown(sim);
          await watch(sim, async () => { await tech.wait(0.5); await tech.walk(L.tech_to_sofa); await tech.turnToward(john.pos.x, john.pos.z); });
          if (sim.practice) await act(sim, "Now walk over to John. Standing up, on the go, phone in hand. Under 2 minutes.", "Go to him", last(L.tech_to_sofa), () => goAlong(sim, tech, L.tech_to_sofa), () => tech.turnToward(john.pos.x, john.pos.z), L.tech_to_sofa);
          // (in Practice the room's own shot while he stands with John: behind him, the wall between the kitchen and the living room
          // stood between the camera and John, Jake's "I'm halfway in the wall when John's talking here")
          show(sim, "sofa");
          await down;
          await T(sim, "S8_01");
          await john.standUp();
          await H(sim, "S8_02");
          // "I took plenty of pictures and video so you can see it for yourself": his tablet up flat, tipped to John, the trap on it
          // (round 3p, Jake: "[Mike] needs to be presenting this ... typically we'll be using a tablet")
          tab.userData.show(0);
          await T(sim, "S8_03", { during: async () => { await tech.wait(1.2); carry.showWant = 1; } });
          await H(sim, "S8_04");
          carry.showWant = 0;
          await T(sim, ["S8_05", "S8_06", "S8_07"]);
        },
      },
      {
        num: "S9", title: "Follow-Up Discovery", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false); tabletOnBoard(true); tab.userData.show(0);
          john.stand(...standFromSofa(sim, john));
          tech.stand(...TALK, Math.atan2(standFromSofa(sim, john)[0] - TALK[0], standFromSofa(sim, john)[2] - TALK[2]));
          bagAt(...BAG_SINK);
          sim.setDoor(WH.door, false);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa"); show(sim, "sofa");
          await T(sim, "S9_01");
          await H(sim, "S9_02");
          // what his answer points to: the water heater (scale in the tank), and he goes to it (round 3p, Jake: "He told him he was
          // going to go to the water heater, so he needs to go to the water heater"); John sits back down to wait
          await T(sim, "S9_03");
          const sitBack = (async () => { await john.wait(1.0); await john.turnTo(SOFA[3], 2.6); await john.sitDown(); })();
          if (sim.practice) await act(sim, "Go and check the water heater: it's in the coat closet by the front door. Follow the dots.", "Go to it", WH.front, () => goAlong(sim, tech, L.tech_to_wh), null, L.tech_to_wh);
          else { sim.shot("hall_wh"); await tech.walk(L.tech_to_wh); }
          sim.shot("closet"); show(sim, "closet");
          await checkHeater(sim);
          await sitBack;
          // and back toward the living room
          sim.shot("hall_wh");
          if (sim.practice) await act(sim, "Back to John in the living room.", "Go back", last(L.tech_from_wh), () => goAlong(sim, tech, L.tech_from_wh), null, L.tech_from_wh);
          else await tech.walk(L.tech_from_wh);
        },
      },
      {
        num: "S8L", title: "Last Check-In", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false); tabletOnBoard(true); tab.userData.show(0);
          john.seated(...SOFA);
          tech.stand(-3.2, 0, -5.3, -1.7);
          bagAt(...BAG_SINK);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          // he calls out again before he comes back in to him; John stands up to him as he comes in
          if (!sim.practice) await tech.turnToward(john.pos.x, john.pos.z);
          await T(sim, "S8_00", { move: null });
          const up = (async () => { await john.wait(0.6); if (/^sit_/.test(john.base)) await john.standUp(); })();
          await watch(sim, async () => { await tech.wait(0.5); await tech.walk(L.tech_back_in); await tech.turnToward(john.pos.x, john.pos.z); });
          if (sim.practice) await act(sim, "Back to John for the last check-in.", "Go back to him", last(L.tech_back_in), () => goAlong(sim, tech, L.tech_back_in), () => tech.turnToward(john.pos.x, john.pos.z), L.tech_back_in);
          await up;
          show(sim, "sofa");
          // "Okay, that's what I've looked at so far. I've got everything put together." (round 3p)
          await T(sim, "S8L_01");
          await H(sim, "S8L_02");
        },
      },
      {
        num: "S10", title: "The Recap", shot: "table",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false); tabletOnBoard(true); tab.userData.show(0);
          john.stand(...standFromSofa(sim, john));
          tech.stand(...TALK, Math.atan2(standFromSofa(sim, john)[0] - TALK[0], standFromSofa(sim, john)[2] - TALK[2]));
          placeChair("john", false); placeChair("tech", false);
          bagAt(...BAG_SINK);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("table");
          // John leads the way and Mike follows right behind him (round 3p, Jake: "He needs the whole follow him option. So it's
          // like telling him, like, right behind him. So it's not a weird, long, awkward pause"; Mike used to stand and wait while
          // John walked over and sat down). John sits back in his chair turned toward Mike; Mike in his, facing John (SEATS).
          // (Mike first a step back out of John's way, as he comes past him from the sofa)
          const jSits = (async () => { await john.wait(0.5); await sitOnChair(sim, "john", L.john_to_table); })();
          if (Math.hypot(tech.pos.x - TALK[0], tech.pos.z - TALK[2]) < 0.6) await tech.walk(L.tech_aside, { speed: 0.6, round: 0, backwards: true });
          if (sim.practice) await act(sim, "Follow John to the table, right behind him. Pull your chair out to face him and sit down.", "Follow him", SEATS.tech.pull, () => goAlong(sim, tech, L.tech_to_table), () => sitOnChair(sim, "tech", []), L.tech_to_table);
          else { await sim.until(() => john.pos.x > -4.0); await sitOnChair(sim, "tech", L.tech_to_table.slice(0, -1)); }
          await jSits;
          sim.shot("table_close");
          // the clipboard and tablet up in front of him, shown to John as he goes over it (his pictures and the diagrams)
          tab.userData.show(0);
          carry.showWant = 1;
          const sat = { move: null, listen: null };
          await T(sim, "S10_01", sat);
          await H(sim, "S10_02", { move: "sit_chair_gestic_shrug_01", listen: null });
          await T(sim, ["S10_03", "S10_04"], [{ move: null, listen: null, during: () => (async () => { await tech.wait(3.5); tab.userData.show(1); await tech.wait(3.5); tab.userData.show(0); })() }, sat]);
          await H(sim, "S10_05", sat);
          await T(sim, "S10_06", { move: null, listen: null, during: () => (async () => { await tech.wait(2.2); tab.userData.show(2); await tech.wait(3.0); tab.userData.show(3); })() });
        },
      },
    ],

    // camera shots for watch mode (the director); in practice mode the camera is behind Mike, with Free camera you walk freely
    shots: {
      // out on the lawn, trailing him up the driveway from the van (the camera eases after him)
      drive: { pos: (s) => { const p = s.people.tech.pos; return [Math.min(p.x - 2.6, 1.6), -0.888 + 1.6, Math.max(p.z + 3.0, 4.2)]; }, look: (s) => s.people.tech.pos.clone().setY(s.people.tech.pos.y + 1.15) },
      porch: { pos: [-1.2, 1.7, 1.75], look: (s) => s.people.tech.pos.clone().lerp(new s.T.Vector3(0.1, 0, 0), 0.5).setY(1.1) },
      // from the west end of the porch, against the house: John in the doorway and Mike side on, the open door behind John
      // (until 2026-10-29 it stood 0.9 m behind Mike, his head filling the frame)
      doorway: { pos: [-1.3, 1.58, 0.75], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.42) },
      // the card going over: over Mike's right shoulder, down on his hand and John's (round 3j, Jake 2026-10-30: "the camera angles
      // are a bit weird when he hands John the business card in the beginning. I couldn't even see that handoff")
      // (just in front of the porch's column, far enough to his right that the line passes his shoulder: from straight behind him
      // his back hid the card)
      card: { pos: [1.2, 1.58, 1.75], look: (s) => s.people.tech.pos.clone().lerp(s.people.john.pos, 0.45).setY(1.08) },
      // "Come on in": behind Mike on the porch and off to his right, looking in through the doorway as John goes in (from the
      // porch's west end John was behind the wall once he stepped back). Round 3j: on a screen wider than tall it stood inside the
      // porch's column (x 1.33 to 1.73, z 1.94 to 2.34), bricks across half the picture; now in front of it, and behind it on a
      // phone held upright (the picture is narrow: further back so both of them fit), clear of it to the west.
      invite: { pos: () => [1.2, 1.6, innerWidth < innerHeight ? 2.6 : 1.85], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.3) },
      // the shoe covers going on: close by on the porch, off his right side, down on his feet
      covers: { pos: (s) => [s.people.tech.pos.x + 0.95, 1.35, s.people.tech.pos.z + 0.8], look: (s) => s.people.tech.pos.clone().setY(s.people.tech.pos.y + 0.6) },
      foyer: { pos: [-0.85, 1.62, -3.0], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.4) },
      // S3 and S4 from the foyer's east side, across at the doorway: John on the hall side, Mike at the door (his shoe covers on
      // on the porch), then the two of them once he is in and the door is shut (the shot above stands behind John)
      // (on a phone held upright the picture is narrow: from further back, by the foyer's south wall, so both of them fit)
      doorway_in: { pos: () => [1.0, 1.58, innerWidth < innerHeight ? -3.25 : -2.5], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(Math.min(1.4, s.people.tech.eyes().y + 0.1)) },
      follow_living: { pos: [-3.3, 1.65, -0.75], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.35).setY(1.2) },
      // at the sink, over Mike's right shoulder to John: the guide shown and handed over, the plan (round 3j, Jake: "now we're in
      // the kitchen and it's like it doesn't move and I'm like up in the corner ... it should be maybe a little bit more over the
      // technician's shoulder"; it stood in the kitchen's far corner, by the window)
      // Round 3p (Jake 2026-10-31: "the camera angle is maybe a little exaggerated ... it needs to be over so that like both people
      // can be seen ... mostly from the technician's angle. I just can't see what's happening with like John's body language and
      // stuff because the technician's blocking it"): from the kitchen's open side, off Mike's right shoulder at about 45 degrees,
      // the two of them whole, John three quarters on (it stood close behind Mike's right shoulder, his back across John)
      sink: { pos: [-4.4, 1.55, -5.6], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.05) },
      // the check: over his right shoulder, down into the open cabinet
      check: { pos: [-4.62, 1.32, -6.52], look: (s) => new s.T.Vector3(-6.0, 0.45, -6.05) },
      sofa: { pos: [-3.75, 1.6, -3.25], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.3) },
      table: { pos: [-1.45, 1.75, -5.0], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.5).setY(0.9) },
      // the two of them at the corner, from the table's north east: Mike side on to the right of the frame, John facing it
      // (from the west, where it stood until round 3h, it would be behind Mike's chair)
      // (round 3p: the new seats, facing each other across the table's corner; from over the table's south east corner, off Mike's
      // right shoulder at about 55 degrees, the two of them whole and his tablet up toward John; from behind his chair its back hid him)
      table_close: { pos: [-1.65, 1.5, -5.5], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(0.85) },
      // the water heater: from the foyer, Mike coming through from the hall; then through the closet's doorway over his shoulder
      hall_wh: { pos: [0.95, 1.65, -0.75], look: (s) => s.people.tech.eyes().setY(1.35) },
      // (inside the closet, high in its corner by the door: from the foyer the open door's louvres stood between it and him)
      closet: { pos: [2.15, 2.25, -1.62], look: (s) => new s.T.Vector3(1.75, 0.45, -2.6) },
    },
  };
})();
