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
    john_to_close: [[-0.25, 0, -1.1]],
    john_after: [[-0.25, 0, -1.45]],
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
    // down the table's west side, between it (and the corner chair, CORNER) and the island's stools
    john_to_table: [[-4.6, 0, -4.32], [-3.5, 0, -4.6], [-3.32, 0, -5.3], [-3.32, 0, -7.3]],
    tech_to_table: [[-4.3, 0, -4.9], [-3.3, 0, -5.0]],   // to the table's west side, for the chair off John's corner
  };
  const standFromSofa = (sim, p) => [SOFA[0] + sim.STAND_FWD * p.root.scale.x, 0, SOFA[2], SOFA[3]];
  const TALK = L.tech_to_sofa[L.tech_to_sofa.length - 1];   // where Mike stands to talk to him by the sofa
  const CORNER = { chair: "furn_chair_kitchen_s0", at: [-2.685, 0, -6.85] };   // Mike's chair at the recap (setup)
  const AT_SINK = [-5.7, 0, -6.2];                       // Mike at the sink, by the counter, John 1.06 m off (S5, S6)
  const JOHN_SINK = [-5.55, 0, -7.25];
  const KNEEL = [-5.45, 0, -6.05];                       // down on one knee at the sink cabinet's middle (S7)
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
  const carry = { on: false, up: 0, want: 0, arm: null, downAt: 0, hx: 0.25, hy: -0.08, hz: 0.04, drop: 0.17, ahead: 0.03, inset: 0.028, twist: -1.2 };
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
  function handPlace(p) { const b = boardPoses(p); return b.carried.hand.lerp(b.read.hand, smooth(carry.up)); }
  function carryStep(sim, dt) {
    const tech = sim.people.tech;
    if (!carry.on || !board) return;
    if (carry.downAt && sim.clock >= carry.downAt) { carry.want = 0; carry.downAt = 0; }
    carry.up += Math.sign(carry.want - carry.up) * Math.min(Math.abs(carry.want - carry.up), dt / 0.55);
    // the grip and the arm (a step change clears every pose on top of the clips, so they come back here)
    if (!tech._fing || !tech._fing.L) tech.fingers("L", 0.72, 0.2);
    if (!carry.arm || !tech.posers.includes(carry.arm.fn)) carry.arm = tech.reach("L", () => handPlace(tech), { dur: 0.35 });
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
    carry.on = true; carry.want = 0; carry.up = 0; carry.downAt = 0;
    if (ease) carry.ease = 0;
  }
  function putDownBoard(sim, x, y, z, h) {
    const tech = sim.people.tech;
    carry.on = false; if (carry.arm) { carry.arm.release(0.3); carry.arm = null; }
    tech.fingers("L", 0, 0.3);
    tech.putDown(board, x, y, z, h);
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
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.4 });
    await john.wait(0.45);
    sim.openDoor("door_foyer_outside", true);
    await john.wait(0.35);
    await hand.release(0.3);
    await john.wait(0.25);                                // the door on past where he steps
    await john.walk(L.john_in_door, { round: 0 });
    await john.turnTo(0.1, 3);
  }
  // John closes the front door behind Mike: a step to it, his hand to its handle, it swings shut, and he turns back to Mike
  async function johnCloses(sim) {
    const { john, tech } = sim.people;
    await john.walk(L.john_to_close, { speed: 0.8, round: 0 });
    const hp = sim.handlePoint("door_foyer_outside", true);
    await john.turnToward(hp.x, hp.z);
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.4 });
    await john.wait(0.45);
    sim.openDoor("door_foyer_outside", false);
    await john.wait(0.45);
    await hand.release(0.35);
    await john.walk(L.john_after, { backwards: true, speed: 0.6, round: 0 });
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
      const lift = tech.footUp(S, true, { dur: 0.45 });
      const hand = tech.reach("R", () => foot.getWorldPosition(new V()).addScaledVector(fwd(), 0.1 - 0.13 * pull).add(new V(0, 0.1, 0)), { dur: 0.45 });
      await lift;
      if (covers[S]) covers[S].visible = true;            // over the toe ...
      if (S === "L" && covers.bundle && covers.bundle.parent) covers.bundle.parent.remove(covers.bundle);
      await tween(tech, 0.5, (k) => { pull = k; });         // ... and back over the heel
      hand.release(0.35);
      await tech.footUp(S, false, { dur: 0.4 });
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
    carry.on = false;
    if (carry.arm) { carry.arm.release(0.15); carry.arm = null; }
    const p1 = new V(...COUNTER.at), q1 = new sim.T.Quaternion().setFromEuler(new sim.T.Euler(Math.PI, COUNTER.h, 0));
    const hand = tech.reach("L", () => board.position.clone().add(new V().subVectors(tech.pos, board.position).setY(0).normalize().multiplyScalar(0.11)).add(new V(0, 0.04, 0)), { dur: 0.25 });
    await tween(tech, 0.65, (k) => { board.position.lerpVectors(p0, p1, k); board.quaternion.copy(q0).slerp(q1, k); board.scale.set(1, 1, 1); board.updateMatrixWorld(true); });
    tech.fingers("L", 0, 0.25);
    await hand.release(0.35);
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
    board: () => { board.updateMatrixWorld(true); return { pos: board.localToWorld(new THREE.Vector3(0.015, -0.005, 0)), q: board.getWorldQuaternion(Q4()).multiply(ON_BOARD) }; },
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
    read: (p) => { const { fwd, left, up } = axesOf(p); return { pos: boneAt(p, "Bip01_Spine2").addScaledVector(fwd, 0.42).addScaledVector(up, -0.14), q: basis(left.clone().negate(), fwd.clone().negate().multiplyScalar(Math.cos(0.85)).addScaledVector(up, Math.sin(0.85))) }; },
    // down at his left side, held by its spine edge at the top, its cover out
    side: (p) => { const { fwd, left, up } = axesOf(p); return { pos: boneAt(p, "Bip01_Pelvis").addScaledVector(left, 0.25).addScaledVector(fwd, 0.03).addScaledVector(up, -0.32), q: basis(up.clone().negate(), left) }; },
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
    if (!g || gs.pose === GP.board) return null;
    const box = (cx, cy, hx, hy) => ({ inv: new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, 0).applyQuaternion(g.q).add(g.pos), g.q, new THREE.Vector3(1, 1, 1)).invert(), half: new THREE.Vector3(hx, hy, 0.1395) });
    return box(0, 0.0025, GW / 2, 0.017);
  }
  function pagesSolid() {
    const g = guidePose();
    if (!g || gs.pose === GP.board || !(gs.ang[0] > 2.6)) return null;
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
    const arm = p.reach(side, () => frame().w, { dur, pole: () => (typeof which === "number" ? fwdOf().multiplyScalar(0.7).addScaledVector(outOf(), 0.8).add(V3().set(0, -0.2, 0)) : outOf().multiplyScalar(0.9).addScaledVector(fwdOf(), -0.1).add(V3().set(0, -1, 0))) });
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
    else if (where === "reading") { gs.pose = () => GP.read(john); gs.holds = [{ p: john, side: "L", which: "back" }, { p: john, side: "R", which: "outer" }]; }
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
  // "Before I get started, I want to leave this with you": Mike takes it up off his clipboard on the counter in both hands, holds
  // it up to John and opens it, turns a page, shuts it, and holds it out flat in his right hand; John takes it and holds it up
  async function showGuide(sim) {
    const { john, tech } = sim.people;
    // up off the counter in his left hand by its near edge (it lies at his left: his right hand reached across in through him for
    // its spine, round 3n), and his right hand in under it, flat and open, once it is up in front of him
    const l = edgeHold(tech, "L", "outer");
    holdGuide([{ p: tech, side: "L", which: "outer", h: l }]);
    tech.face.target = () => guidePose().pos.clone();
    // (the turned pages solid to his fingers too)
    await tech.wait(0.45);
    const from = GP.board();
    let k1 = 0; gs.pose = () => mix(from, GP.show(tech), k1);
    await tween(tech, 0.6, (k) => { k1 = k; });
    gs.pose = () => GP.show(tech);
    tech.face.target = () => john.eyes();
    const r = edgeHold(tech, "R", "palm", 0.35);
    holdGuide([{ p: tech, side: "R", which: "palm", h: r }, { p: tech, side: "L", which: "outer", h: l }]);
    await tech.wait(0.45);
    await turnPage(tech, l, 0, Math.PI, 0.7);             // the cover over: water softeners and filtration, dripping faucets
    await tech.wait(1.5);
    await turnPage(tech, l, 1, Math.PI, 0.6);             // garbage disposals, tankless water heaters
    await tech.wait(1.3);
    // shut: the pages brought back over, the last turned first
    await shutPages(tech, l, [1, 0]);
    l.set("outer");
    // out to him, flat, on his right hand under the spine edge, the thumb over the top
    r.set("underSpine");
    holdGuide([{ p: tech, side: "R", which: "underSpine", h: r }]);
    let k2 = 0; gs.pose = () => mix(GP.show(tech), GP.give(tech, john), k2);
    await tween(tech, 0.6, (k) => { k2 = k; });
    gs.pose = () => GP.give(tech, john);
    john.face.target = () => guidePose().pos.clone();
    const jr = edgeHold(john, "R", "underOuter");
    holdGuide([{ p: tech, side: "R", which: "underSpine", h: r }, { p: john, side: "R", which: "underOuter", h: jr }]);
    await john.wait(0.55);
    // his now: up in front of him to look at, his left hand behind the spine, his right on the outer edge to turn the pages
    const jl = edgeHold(john, "L", "back");
    holdGuide([{ p: john, side: "R", which: "underOuter", h: jr }, { p: john, side: "L", which: "back", h: jl }]);
    jr.set("outer");
    let k3 = 0; gs.pose = () => mix(GP.give(tech, john), GP.read(john), k3);
    await tween(john, 0.7, (k) => { k3 = k; });
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
    if (jl) jl.set("back");
    // (from where it is at his side each frame: taken once, the moment he had just sat, it was where his hips had been a moment
    // before, behind him)
    let k = 0; gs.pose = () => mix(GP.side(john), GP.read(john), k);
    await tween(john, 0.7, (x) => { k = x; });
    gs.pose = () => GP.read(john);
    const jr = edgeHold(john, "R", "outer", 0.5);
    holdGuide([{ p: john, side: "L", which: "back", h: jl }, { p: john, side: "R", which: "outer", h: jr }]);
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
  const lap = { L: null, R: null };
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
    const { john } = window.sim.people;
    const clip = john.action && john.action.getClip().name;
    const sitting = (john.base === "sit_chair_idle_neutral_01" || clip === "sit_down_chair_01") && clip !== "sit_stand_up_chair_01" && Math.hypot(john.pos.x - SOFA[0], john.pos.z - SOFA[2]) < 0.8;
    for (const S of ["L", "R"]) {
      const want = sitting && !gs.holds.some((h) => h.p === john && h.side === S);
      const h = lap[S];
      if (want && (!h || !john.posers.includes(h.arm.fn))) lap[S] = handOnLap(john, S);
      else if (!want && h) { h.release(0.4); lap[S] = null; }
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
  async function checkSink(sim) {
    const { tech } = sim.people, V = sim.T.Vector3;
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
    const fL = new V(0.1, -0.3, 1).normalize();
    const onHip = () => [tech.orient("L", () => fL.clone(), () => fL.clone().cross(new V(0, -1, 0)).negate(), { dur: 0.5 }), tech.grip("L", [0.05, 0.15, 0.2, 0.25, 0.3], 0.5, true)];
    let handL = onHip();
    await tech.wait(0.8);
    // his top hand in to the trap and the valves, in front of his face, the elbow up and away from his head
    handL.forEach((h) => h.release(0.4));
    const reachIn = tech.reach("L", () => new V(-6.3, 0.45, -5.97), { dur: 0.8, pole: () => new V(0.3, 1, 0.4) });
    await tech.wait(2.0);
    // back to his hip, for the phone in his pocket (each way about a metre: in half a second it was a rush)
    handL = onHip();
    await reachIn.release(0.8);
    await tech.wait(0.25);
    // a picture: his phone up over his face, its camera up into the cabinet, its screen to him
    handL.forEach((h) => h.release(0.3));
    tech.hold(phone, "Bip01_L_Hand", [0.075, 0.02, 0]); phone.rotation.set(Math.PI, 0, 0);     // its back in his palm, the screen out of it
    const up = tech.reach("L", () => new V(-6.1, 0.52, -5.98), { dur: 0.8, pole: () => new V(0.3, 1, 0.4) });
    // (the fingers in toward the back of the cabinet, the palm down to his face; the thumb's side, for the left hand, -(fingers x palm))
    const aim = tech.orient("L", () => new V(-1, 0.2, 0), () => new V(0, 0, -1), { dur: 0.8 });
    await tech.wait(1.1);
    phone.userData.flash.intensity = 4;
    await tech.wait(0.12);
    phone.userData.flash.intensity = 0;
    await tech.wait(0.7);
    // and back into his pocket
    aim.release(0.6);
    handL = onHip();
    await up.release(0.8);
    if (phone.parent) phone.parent.remove(phone);
    await tech.wait(0.4);
    // back up onto his knee
    prop.release(1.4); flatR.release(1.4); openR.release(1.4);
    restL.release(1.0); handL.forEach((h) => h.release(0.8));
    look.release(1.2);
    tech.face.target = () => inside.clone();
    await tech._kn.change(() => onKnee, 1.6);
    tech.solids.splice(tech.solids.indexOf(floorBox), 1);
    // the doors shut, up off his knee, and the clipboard back off the counter
    await swingCabinet(sim, false);
    tech.face.target = null;
    await tech.kneel(false, { dur: 0.8 });
    tech.selfSolid = false;
    await tech.walk([[-5.72, 0, -6.35]], { speed: 0.6, round: 0 });
    await boardUpAgain(sim);
    await tech.walk([[-5.5, 0, -6.05]], { speed: 0.6, round: 0, backwards: true });
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
      // The recap seat (Jake 2026-10-29, round 3h, with his field guide's "Sit beside them or at the corner, never directly
      // across"): "He should be off one corner." The table's chairs stand at its two ends and its east side is against the wall,
      // so one of the north end's chairs is set along the west side, tucked in by the corner at John's end, facing in; Mike
      // sits there, at a right angle to John, the clipboard on the table between them.
      const cc = window.walk.scene.getObjectByName(CORNER.chair);
      if (cc) { cc.position.set(...CORNER.at); cc.rotation.set(0, Math.PI / 2, 0); cc.userData.home = cc.position.clone(); cc.updateMatrixWorld(true); }
      sim.late.push((dt) => carryStep(sim, dt));
      sim.late.push(() => guideStep());                    // after the clipboard: the guide can lie on it
      sim.late.push(() => lapStep());
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
          putAway(); inHand(sim); guideAt(sim, "board"); coversOn(false); setCabinet(false);
          tech.stand(...VAN);
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
          putAway(); inHand(sim); guideAt(sim, "board"); coversOn(false); setCabinet(false);
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
          // in, through the middle of the doorway and over to the right, as he thanks him for that; John shuts the door once he is
          // clear of its swing
          const stepIn = () => tech.walk(L.tech_in, { speed: 0.9, round: 0.25 });
          const thanks = T(sim, "S3_03", { move: null, turn: false });
          if (sim.practice) await act(sim, "Step inside, over to the right, so John can close the door behind you.", "Step inside", last(L.tech_in), stepIn, null, L.tech_in);
          else { await tech.wait(0.2); await stepIn(); }
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
          inHand(sim); guideAt(sim, "board"); coversOn(true); setCabinet(false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
        },
        async run(sim) {
          sim.shot("doorway_in");
          if (sim.practice) sim.view("doorway_in");
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
          inHand(sim); guideAt(sim, "board"); coversOn(true); setCabinet(false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("follow_living");
          const lead = john.walk(L.john_lead);
          await watch(sim, async () => { await tech.wait(1.0); await tech.walk(L.tech_follow); });
          if (sim.practice) await act(sim, "Follow John to the kitchen sink.", "Follow him", last(L.tech_follow), () => goAlong(sim, tech, L.tech_follow), null, L.tech_follow);
          await lead;
          sim.shot("sink");
          // to John, his clipboard down on the counter as John shows him the sink; then the guide (showGuide), and John looks it over
          await tech.turnToward(john.pos.x, john.pos.z);
          show(sim, "sink");
          const down = boardDown(sim);
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
          guideAt(sim, "side"); coversOn(true); setCabinet(false);
          john.stand(...JOHN_SINK, 0);
          tech.stand(...AT_SINK, Math.atan2(JOHN_SINK[0] - AT_SINK[0], JOHN_SINK[2] - AT_SINK[2]));
          boardOnCounter(sim);
        },
        async run(sim) {
          sim.shot("sink");
          await T(sim, ["S6_01", "S6_02"]);
          await H(sim, "S6_03");
          await T(sim, "S6_04");
        },
      },
      {
        num: "S7", title: "The Check", shot: "check",
        start(sim) {
          const { john, tech } = sim.people;
          guideAt(sim, "side"); coversOn(true); setCabinet(false);
          john.stand(...JOHN_SINK, 0);
          tech.stand(...AT_SINK, Math.atan2(JOHN_SINK[0] - AT_SINK[0], JOHN_SINK[2] - AT_SINK[2]));
          boardOnCounter(sim);
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
          inHand(sim); coversOn(true); setCabinet(false);
          john.seated(...SOFA);
          guideAt(sim, "reading");
          tech.stand(-5.5, 0, -6.05, Math.atan2(SOFA[0] + 5.5, SOFA[2] + 6.05));
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
          await T(sim, "S8_03");
          await H(sim, "S8_04");
          await T(sim, ["S8_05", "S8_06", "S8_07"]);
        },
      },
      {
        num: "S9", title: "Follow-Up Discovery", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false);
          john.stand(...standFromSofa(sim, john));
          tech.stand(...TALK, Math.atan2(standFromSofa(sim, john)[0] - TALK[0], standFromSofa(sim, john)[2] - TALK[2]));
        },
        async run(sim) {
          const { tech } = sim.people;
          sim.shot("sofa"); show(sim, "sofa");
          await T(sim, "S9_01");
          await H(sim, "S9_02");
          // what his answer points to is his water (round 3j, Jake: "He's talking about water heater, even though that would have
          // been like water filtration"): the filtration, and the water heater from the plan
          await T(sim, "S9_03");
          await watch(sim, () => tech.walk(L.tech_off));
          if (sim.practice) await act(sim, "Go and check the water filtration and the water heater (S7 for those systems).", "Go check them", last(L.tech_off), () => goAlong(sim, tech, L.tech_off), null, L.tech_off);
          sim.caption("He checks the water filtration and the water heater (S7 for those systems), then comes back");
        },
      },
      {
        num: "S8L", title: "Last Check-In", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false);
          john.stand(...standFromSofa(sim, john));
          tech.stand(-3.2, 0, -5.3, -1.7);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          // he calls out again before he comes back in to him
          if (!sim.practice) await tech.turnToward(john.pos.x, john.pos.z);
          await T(sim, "S8_00", { move: null });
          await watch(sim, async () => { await tech.wait(0.5); await tech.walk(L.tech_back_in); await tech.turnToward(john.pos.x, john.pos.z); });
          if (sim.practice) await act(sim, "Back to John for the last check-in.", "Go back to him", last(L.tech_back_in), () => goAlong(sim, tech, L.tech_back_in), () => tech.turnToward(john.pos.x, john.pos.z), L.tech_back_in);
          show(sim, "sofa");
          await T(sim, "S8L_01");
          await H(sim, "S8L_02");
        },
      },
      {
        num: "S10", title: "The Recap", shot: "table",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideAt(sim, "sofa"); coversOn(true); setCabinet(false);
          john.stand(...standFromSofa(sim, john));
          tech.stand(...TALK, Math.atan2(standFromSofa(sim, john)[0] - TALK[0], standFromSofa(sim, john)[2] - TALK[2]));
          for (const n of ["furn_chair_kitchen_n0", "furn_chair_kitchen_s0"]) { const c = window.walk.scene.getObjectByName(n); if (c.userData.home) c.position.copy(c.userData.home); }
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("table");
          // John takes the far (south) end first, round the west side, and Mike the chair off his corner (setup: CORNER); until
          // round 3h Mike sat across from him at the near end (Jake: "He should be off one corner")
          // after you: Mike steps back out of John's way first (John's way to the table passed 0.3 m from him)
          if (Math.hypot(tech.pos.x - TALK[0], tech.pos.z - TALK[2]) < 0.6) await tech.walk(L.tech_aside, { speed: 0.6, round: 0, backwards: true });
          await john.sitAtTable("furn_chair_kitchen_n0", { approach: L.john_to_table, sideDir: -1 });
          // the clipboard goes down on the table in front of him (the discovery sheet is the evidence)
          const sit = async (approach) => {
            await tech.sitAtTable(CORNER.chair, { approach, sideDir: -1 });
            const top = new sim.T.Box3().setFromObject(window.walk.scene.getObjectByName("furn_table_kitchen") || tech.root).max.y;
            putDownBoard(sim, tech.pos.x + Math.sin(tech.heading) * 0.55, top + 0.004, tech.pos.z + Math.cos(tech.heading) * 0.55, tech.heading + 0.2);
          };
          if (sim.practice) await act(sim, "Sit down off his corner, not across the table from him. Discovery sheet, pictures and the failed part on the table between you.", "Sit down", last(L.tech_to_table), () => goAlong(sim, tech, L.tech_to_table), () => sit([]), L.tech_to_table);
          else await sit(L.tech_to_table);
          sim.shot("table_close");
          await T(sim, "S10_01");
          await H(sim, "S10_02");
          await T(sim, ["S10_03", "S10_04"]);
          await H(sim, "S10_05");
          await T(sim, "S10_06");
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
      sink: { pos: [-5.32, 1.62, -5.15], look: (s) => s.people.tech.pos.clone().lerp(s.people.john.pos, 0.6).setY(1.2) },
      // the check: over his right shoulder, down into the open cabinet
      check: { pos: [-4.62, 1.32, -6.52], look: (s) => new s.T.Vector3(-6.0, 0.45, -6.05) },
      sofa: { pos: [-3.75, 1.6, -3.25], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.3) },
      table: { pos: [-1.45, 1.75, -5.0], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.5).setY(0.95) },
      // the two of them at the corner, from the table's north east: Mike side on to the right of the frame, John facing it
      // (from the west, where it stood until round 3h, it would be behind Mike's chair)
      table_close: { pos: [-1.8, 1.45, -5.65], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.1) },
    },
  };
})();
