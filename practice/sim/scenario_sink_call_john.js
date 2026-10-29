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
    // him 1 m off and stands 1.2 m from him (he passed at 0.77 and stood at 1.0)
    john_aside: [[-0.2, 0, -1.3]],
    tech_threshold: [[0.06, -0.02, 0.45]],
    tech_in: [[0.2, 0, -0.25], [0.8, 0, -0.85]],
    john_to_close: [[-0.25, 0, -1.1]],
    john_after: [[-0.25, 0, -1.45]],
    // (at the sink John stops 1.2 m from where Mike will stand, round 3h; it was 1.05)
    john_lead: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.55, 0, -7.25]],
    tech_follow: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.55, 0, -6.05]],
    john_to_sofa: [[-4.6, 0, -7.4], [-3.2, 0, -7.2], [-3.2, 0, -5.3], [-3.5, 0, -4.6], [-4.6, 0, -4.32], [-5.46, 0, -4.32]],
    // by the sofa Mike stands 1.15 m from John once John is up (it was 0.96), and steps back out of John's way to the table
    tech_to_sofa: [[-5.55, 0, -5.3], [-4.6, 0, -5.1], [-4.45, 0, -4.8]],
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

  // the technician's line: said by him in watch mode, put on the card for the trainee in practice mode.
  // The clipboard comes up once, for the discovery (Jake 2026-10-29: "It'll come up as he's asking questions"): as he brings up
  // Sarah's notes at the door, and it stays up while he asks and John answers; it goes down for his promise (the field guide: never
  // look away for a promise) and stays at his side after. Until round 3h it came up for every question and went down 1.2 s after,
  // up and down all through the talk (Jake: "The clip board floats around alot"); and the field guide has him not clutch it:
  // "Hands hidden behind a tablet, a clipboard or in pockets read as guarded."
  const BOARD = { S3_06: 1, S4_01: 1, S4_09: 0 };
  const T = async (sim, id, o) => {
    if (id in BOARD) boardUp(sim, !!BOARD[id], 0);
    await (sim.practice ? sim.prompt(id, null, null, null, o) : sim.say(id, o));
  };
  // John's line, to the technician (in Practice that is Mike too: the trainee is him)
  const H = (sim, id, o = {}) => sim.say(id, o);
  const watch = (sim, f) => (sim.practice ? Promise.resolve() : f());
  const last = (path) => path[path.length - 1];
  // An action in Practice: the card says what to do; walk Mike to the ring yourself (a trail of dots shows the way, path), or tap
  // the button and he goes (a phone does not have to walk every step). go: how he gets there; then: what he does once there.
  const act = (sim, text, btn, at, go, then = null, path = null) => sim.prompt(null, text, btn, { at, go, then, path });
  // a walk that starts with a straight line from wherever the trainee left Mike: if that line would cross a wall or furniture
  // (he wandered off), he is put at the walk's first point first
  const goAlong = (sim, p, path, o) => { if (sim.checkPath([p.pos.toArray(), path[0]]).length) p.place(...path[0], p.heading); return p.walk(path, o); };
  // his business card, and the Happy Homes Guide (John has it from S5 on)
  let board = null, card = null, guide = null;
  const putAway = () => { if (card && card.parent) card.parent.remove(card); };
  function guideWithJohn(sim, on) {
    if (guide.parent) guide.parent.remove(guide);
    if (on) { sim.people.john.hold(guide, "Bip01_L_Hand", GUIDE_JOHN.at); guide.rotation.set(...GUIDE_JOHN.turn); }
  }

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
  function bodyFrame(p) {
    const h = p.heading;
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
    const yawQ = q2.setFromAxisAngle(V3().set(0, 1, 0), tech.heading);
    const handQ = yawQ.clone().multiply(GRIP.hand[0].clone().slerp(GRIP.hand[1], k));
    hb.parent.updateMatrixWorld(true);
    hb.quaternion.copy(hb.parent.getWorldQuaternion(quat).invert().multiply(handQ));
    hb.updateMatrixWorld(true);
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
  function inHand(sim) {
    carry.on = true; carry.want = 0; carry.up = 0; carry.downAt = 0;
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
  // John comes to the door, takes the handle (it opens in, towards him), steps back out of its swing, and stands in the doorway
  async function johnOpens(sim) {
    const { john } = sim.people;
    await john.wait(0.6);
    await john.turnToward(0.52, -0.66);
    await john.walk(L.john_to_door);
    await john.turnTo(0, 2.4);
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.5 });
    await john.wait(0.6);
    sim.openDoor("door_foyer_outside", true);
    await john.walk(L.john_back, { backwards: true, speed: 0.55 });
    await hand.release(0.35);
    await john.wait(0.3);
    await john.walk(L.john_in_door, { speed: 0.6 });
    await john.turnTo(0.1, 2);
  }
  // John closes the front door behind Mike: a step to it, his hand to its handle, it swings shut, and he steps back to face Mike
  async function johnCloses(sim) {
    const { john, tech } = sim.people;
    await john.walk(L.john_to_close, { speed: 0.5, round: 0 });
    const hp = sim.handlePoint("door_foyer_outside", true);
    await john.turnToward(hp.x, hp.z);
    const hand = john.reach("R", () => sim.handlePoint("door_foyer_outside", true), { dur: 0.45 });
    await john.wait(0.5);
    sim.openDoor("door_foyer_outside", false);
    await john.wait(0.55);
    await hand.release(0.4);
    await john.walk(L.john_after, { backwards: true, speed: 0.45, round: 0 });
    await john.turnToward(tech.pos.x, tech.pos.z);
  }
  // "Nice to meet you too. Come on in.": John steps back out of the doorway to the hinge side, turns to Mike and asks him in from
  // there, his hand sweeping in across the foyer (Jake 2026-10-29: "his hand went into the door frame. He needs to come on in the
  // other way": the invite is his right hand swept across to his left, and from the middle of the doorway it went into the jamb)
  async function johnInvites(sim) {
    const { john, tech } = sim.people;
    sim.shot("invite");
    await john.walk(L.john_aside, { backwards: true, speed: 0.6, round: 0 });
    await john.turnToward(tech.pos.x, tech.pos.z);
    await H(sim, "S2_04");
  }
  // "Here's my card": Mike takes a step up and holds it out, John reaches for it and takes it; it stays in his hand
  async function handCard(sim, step = true) {
    const { john, tech } = sim.people;
    if (step) await tech.walk(L.tech_card, { speed: 0.55, round: 0 });
    tech.hold(card, "Bip01_R_Hand", [0.1, 0.02, 0.05]);
    card.rotation.set(0, 0, 0);                         // face out, at the fingertips
    const meet = () => tech.pos.clone().lerp(john.pos, 0.45).setY(Math.max(tech.pos.y, john.pos.y) + 1.08);
    const give = tech.reach("R", meet, { dur: 0.6 });
    await tech.wait(0.45);
    const take = john.reach("R", () => meet().add(new sim.T.Vector3(0, 0.01, 0).addScaledVector(new sim.T.Vector3().subVectors(john.pos, tech.pos).setY(0).normalize(), 0.06)), { dur: 0.55 });
    await john.wait(0.75);
    john.hold(card, "Bip01_R_Hand", [0.1, 0.02, 0.05]);
    card.rotation.set(0, 0, 0);                         // face out, at the fingertips
    await give.release(0.5);
    await john.wait(0.6);
    await take.release(0.6);
  }

  // "Before I get started, I want to leave this with you" (Jake 2026-10-29: "He needs to hand him the happy homes guide for real"):
  // it rides on the clipboard at his side; his right hand takes it off the board and offers it to John palm up, from below, halfway
  // between them (the field guide: "When you hand over the tablet or paperwork, offer it palm up from below, not from over the
  // top"), and John takes it in his left hand, the one across from Mike's right, and keeps it.
  const GUIDE_MIKE = { at: [0.085, -0.032, 0.0], turn: [0, 0, 0] };
  // (in John's hand: turned so that held up to look at, as he does for "Does anything in that guide catch your eye?", its cover
  // faces him, the right way up)
  const GUIDE_JOHN = { at: [0.1, 0.03, -0.02], turn: [-1.667, 0.861, -2.64] };
  async function handGuide(sim) {
    const { john, tech } = sim.people, V = sim.T.Vector3;
    await tech.wait(0.5);
    const arm = tech.reach("R", () => board.position.clone(), { dur: 0.55 });
    await tech.wait(0.6);
    tech.hold(guide, "Bip01_R_Hand", GUIDE_MIKE.at); guide.rotation.set(...GUIDE_MIKE.turn);
    // out to him, palm up, at his belt
    const meet = () => tech.pos.clone().lerp(john.pos, 0.5).setY(Math.max(tech.pos.y, john.pos.y) + 0.95);
    arm.set(meet); arm.w = Math.min(arm.w, 0.4);
    const flat = palmUp(tech, "R", () => V3().subVectors(john.pos, tech.pos));
    await tech.wait(0.9);
    const take = john.reach("L", () => meet().add(new V(0, 0.03, 0)), { dur: 0.5 });
    await john.wait(0.65);
    guideWithJohn(sim, true);
    flat.goal = 0;
    await arm.release(0.5);
    await john.wait(0.4);
    await take.release(0.6);
  }
  // A hand held flat and palm up, its fingers toward dir() and a little down (the clip's wrist hung, and the booklet tipped
  // over his fingers); goal = 0 lets it go.
  function palmUp(p, side, dir) {
    const hb = p.root.getObjectByName(`Bip01_${side}_Hand`), h = { w: 0, goal: 1 };
    p.posers.push((dt) => {
      h.w = Math.max(0, Math.min(1, h.w + Math.sign(h.goal - h.w) * dt / 0.4));
      if (h.goal === 0 && h.w <= 0) return true;
      const x = dir().setY(0).normalize(); x.y = -0.15; x.normalize();
      const z = x.clone().cross(V3().set(0, -1, 0)).normalize(), y = z.clone().cross(x);
      const want = new THREE.Quaternion().setFromRotationMatrix(M4().makeBasis(x, y, z));
      p.root.updateMatrixWorld(true);
      p.keep(hb);
      const cur = hb.getWorldQuaternion(new THREE.Quaternion()).slerp(want, h.w * h.w * (3 - 2 * h.w));
      hb.quaternion.copy(hb.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(cur));
      hb.updateMatrixWorld(true);
      return false;
    });
    return h;
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
      { at: spotBack, r: 0.38, path: [spotBack], go: () => tech.walk(L.tech_back, { backwards: true, speed: 0.45, round: 0 }) });
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
      board = sim.props.clipboard(); card = sim.props.card(); guide = sim.props.guide();
      // The recap seat (Jake 2026-10-29, round 3h, with his field guide's "Sit beside them or at the corner, never directly
      // across"): "He should be off one corner." The table's chairs stand at its two ends and its east side is against the wall,
      // so one of the north end's chairs is set along the west side, tucked in by the corner at John's end, facing in; Mike
      // sits there, at a right angle to John, the clipboard on the table between them.
      const cc = window.walk.scene.getObjectByName(CORNER.chair);
      if (cc) { cc.position.set(...CORNER.at); cc.rotation.set(0, Math.PI / 2, 0); cc.userData.home = cc.position.clone(); cc.updateMatrixWorld(true); }
      sim.late.push((dt) => carryStep(sim, dt));
      sim.carry = carry;                                    // its numbers, for trying a hold out in the page
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
          putAway(); inHand(sim); guideWithJohn(sim, false);
          tech.stand(...VAN);
          tech.face.mood = "neutral";
          john.stand(0.2, 0, -2.9, Math.PI);
          sim.setDoor("door_foyer_outside", false);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          if (sim.practice) return approachGame(sim);
          sim.shot("drive");
          await tech.wait(0.8);
          const up = tech.walk(L.tech_drive, { ground: true });
          await sim.until(() => tech.pos.x < 3.3);              // at the foot of the porch steps
          sim.shot("porch");
          await up;
          await tech.turnTo(Math.PI, 1.5);
          tech.face.mood = "smile";                             // "Smile before the door opens"
          await tech.wait(0.5);
          await knock(sim, tech, 5);
          await tech.wait(0.4);
          await tech.walk(L.tech_back, { backwards: true, speed: 0.45, round: 0 });
          await tech.turnTo(Math.PI, 1.5);
          await johnOpens(sim);
          sim.shot("doorway");
          await T(sim, "S2_01");
          await H(sim, "S2_02");
          // "Here's my card" is the second sentence of the line
          const line = T(sim, "S2_03", { move: null });
          await tech.wait(1.1);
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
        // Then (round 3g): "Anytime they say come on in, it instantly is putting the shoe covers on ... he's putting the shoe
        // covers on and he says ... I appreciate you having us out today ... it should flow. It shouldn't wait, step. Some things
        // are going to kind of transition and there's going to be some talking done while other actions are in fact being done."
        // And "who closes the door? ... someone needs to close the door": John does, it is his door.
        start(sim) {
          const { john, tech } = sim.people;
          putAway(); inHand(sim); guideWithJohn(sim, false);
          sim.setDoor("door_foyer_outside", true);
          const JA = last(L.john_aside), at = last(L.tech_card);
          john.stand(JA[0], 0, JA[2], Math.atan2(at[0] - JA[0], at[2] - JA[2]));
          tech.stand(...at, Math.PI + 0.12);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          const TH = last(L.tech_threshold);
          sim.shot("doorway_in");
          putAway();
          let covered = false, barged = false;
          if (sim.practice) {
            sim.until(() => { if (!covered && !barged && tech.pos.z < -0.05) { barged = true; sim.feedback(false, "Shoe covers go on before you step inside. Put them on at the door."); } return false; }).catch(() => {});
          }
          // the shoe covers go on as soon as he is asked in, at the threshold, and the talk goes on while he puts them on: his
          // thanks, John's answer, "Let me slip these shoe covers on first"; he stands up as John says he doesn't have to. Crouched,
          // his lines and John's take no hand moves of his (a standing move would pull him up out of the crouch). He is getting up
          // as "It's my pleasure" starts (standing: the stand, which the step in waits for).
          let standing = Promise.resolve();
          const covers = async () => {
            if (Math.hypot(tech.pos.x - TH[0], tech.pos.z - TH[2]) > 0.3) await tech.walk([TH], { speed: 0.45, round: 0 });
            await tech.turnTo(Math.PI, 1.5);
            const down = (async () => { await tech.once("crouch_in", { early: 0.05 }); tech.play("crouch_idle"); })();
            const crouched = { move: null, turn: false }, still = { listen: null };
            await tech.wait(0.4);
            await T(sim, "S3_01", crouched);
            await down;
            await H(sim, "S3_02", still);
            await T(sim, "S3_03", crouched);
            covered = true;
            const answer = H(sim, "S3_04", still);
            await tech.wait(0.7);
            standing = (async () => { await tech.once("crouch_out", { early: 0.05 }); tech.play(tech.base, { fade: 0.2 }); })();
            await answer;
          };
          if (sim.practice) await act(sim, "John asked you in: put your shoe covers on, at the door, before you step inside.", "Shoe covers on", null, null, covers);
          else await covers();
          if (sim.practice) sim.score("covers", !barged, barged ? "Stepped inside before the shoe covers were on" : "Shoe covers on before stepping inside");
          // in, through the middle of the doorway and over to the right, while he says it's his pleasure; John takes the door and
          // shuts it once he is clear of its swing
          const stepIn = async () => { await standing; await tech.walk(L.tech_in, { speed: 0.5, round: 0.25 }); };
          const pleasure = T(sim, "S3_05", { move: null, turn: false });
          if (sim.practice) await act(sim, "Step inside, over to the right, so John can close the door behind you.", "Step inside", last(L.tech_in), stepIn, null, L.tech_in);
          else { await standing; await tech.wait(0.2); await stepIn(); }
          const face = tech.turnToward(john.pos.x, john.pos.z);
          if (sim.practice) sim.view("doorway_in");           // the foyer is too narrow for a camera behind him: the two of them
          await johnCloses(sim);
          await face;
          await pleasure;
          // the clipboard comes up to start the conversation (and stays up into the discovery)
          await T(sim, "S3_06");
          await H(sim, "S3_07");
        },
      },
      {
        num: "S4", title: "Initial Discovery", shot: "doorway_in",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
        },
        async run(sim) {
          sim.shot("doorway_in");
          if (sim.practice) sim.view("doorway_in");
          for (const id of ["S4_01", "S4_02", "S4_03", "S4_04", "S4_05", "S4_06", "S4_07", "S4_08", "S4_09", "S4_10", "S4_11", "S4_12", "S4_13", "S4_14"])
            await (sim.lines[id].who === "tech" ? T(sim, id) : H(sim, id));
        },
      },
      {
        num: "S5", title: "Happy Homes Guide", shot: "follow_living",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, false);
          sim.setDoor("door_foyer_outside", false);
          john.stand(...last(L.john_after), Math.atan2(last(L.tech_in)[0] - last(L.john_after)[0], last(L.tech_in)[2] - last(L.john_after)[2]));
          tech.stand(...last(L.tech_in), Math.atan2(last(L.john_after)[0] - last(L.tech_in)[0], last(L.john_after)[2] - last(L.tech_in)[2]));
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("follow_living");
          const lead = john.walk(L.john_lead);
          await watch(sim, async () => { await tech.wait(1.4); await tech.walk(L.tech_follow); });
          if (sim.practice) await act(sim, "Follow John to the kitchen sink.", "Follow him", last(L.tech_follow), () => goAlong(sim, tech, L.tech_follow), null, L.tech_follow);
          await lead;
          sim.shot("sink");
          await H(sim, "S5_01");
          await T(sim, "S5_02", { move: null, during: () => handGuide(sim) });
          // he looks it over while he is asked about it
          await T(sim, "S5_03", { during: () => { john.face.target = () => guide.getWorldPosition(V3()); } });
          await H(sim, "S5_04");
          await T(sim, "S5_05");
        },
      },
      {
        num: "S6", title: "Game Plan", shot: "sink",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
          john.stand(-5.55, 0, -7.25, 0);
          tech.stand(-5.55, 0, -6.05, Math.PI);
        },
        async run(sim) {
          sim.shot("sink");
          await T(sim, "S6_01");
          await T(sim, "S6_02");
          await H(sim, "S6_03");
          await T(sim, "S6_04");
        },
      },
      {
        num: "S7", title: "The Check", shot: "check",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
          john.stand(-5.55, 0, -7.25, 0);
          tech.stand(-5.55, 0, -6.05, Math.PI);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("check");
          sim.caption("S7  The Check: John waits on the sofa while you work");
          const toSofa = (async () => {
            await john.walk(L.john_to_sofa);
            await john.turnTo(Math.PI / 2, 2.6);                // back to the sofa
            await john.sitDown();
            john.face.target = null;
          })();
          const check = async () => {
            await tech.turnTo(-Math.PI / 2, 2.0);              // to the sink on the west wall
            await tech.once("crouch_in", { early: 0.05 });
            tech.play("crouch_idle");
            await tech.wait(2.5);
            tech.play("crouch_gestic");
            await tech.wait(3.0);
            await tech.once("crouch_out", { early: 0.05 });
            await tech.once("take_picture", { early: 0.3 });
            tech.play(tech.base);
          };
          if (sim.practice) await act(sim, "Do the check at the sink: get down and look under it, then take a picture.", "Do the check", [-5.55, 0, -6.05], () => tech.walk([[-5.55, 0, -6.05]]), check, [[-5.55, 0, -6.05]]);
          else await check();
          await toSofa;
        },
      },
      {
        num: "S8", title: "Check-In / Share", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
          john.seated(...SOFA);
          tech.stand(-5.55, 0, -6.05, -Math.PI / 2);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          await watch(sim, async () => { await tech.walk(L.tech_to_sofa); await tech.turnToward(john.pos.x, john.pos.z); });
          if (sim.practice) await act(sim, "Walk over to John. Standing up, on the go, phone in hand. Under 2 minutes.", "Go to him", last(L.tech_to_sofa), () => goAlong(sim, tech, L.tech_to_sofa), () => tech.turnToward(john.pos.x, john.pos.z), L.tech_to_sofa);
          await T(sim, "S8_01");
          await john.standUp();
          await H(sim, "S8_02");
          await T(sim, "S8_03");
          await H(sim, "S8_04");
          await T(sim, "S8_05");
          await T(sim, "S8_06");
          await T(sim, "S8_07");
        },
      },
      {
        num: "S9", title: "Follow-Up Discovery", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
          john.stand(...standFromSofa(sim, john));
          tech.stand(...TALK, Math.atan2(standFromSofa(sim, john)[0] - TALK[0], standFromSofa(sim, john)[2] - TALK[2]));
        },
        async run(sim) {
          const { tech } = sim.people;
          sim.shot("sofa");
          await T(sim, "S9_01");
          await H(sim, "S9_02");
          await T(sim, "S9_03");
          await watch(sim, () => tech.walk(L.tech_off));
          if (sim.practice) await act(sim, "Go and check the water heater (S7 for that system).", "Go check it", last(L.tech_off), () => goAlong(sim, tech, L.tech_off), null, L.tech_off);
          sim.caption("He checks the water heater (S7 for that system), then comes back");
        },
      },
      {
        num: "S8L", title: "Last Check-In", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
          john.stand(...standFromSofa(sim, john));
          tech.stand(-3.2, 0, -5.3, -1.7);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          await watch(sim, async () => { await tech.walk(L.tech_back_in); });
          if (sim.practice) await act(sim, "Back to John for the last check-in.", "Go back to him", last(L.tech_back_in), () => goAlong(sim, tech, L.tech_back_in), () => tech.turnToward(john.pos.x, john.pos.z), L.tech_back_in);
          await T(sim, "S8L_01");
          await H(sim, "S8L_02");
        },
      },
      {
        num: "S10", title: "The Recap", shot: "table",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim); guideWithJohn(sim, true);
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
          if (Math.hypot(tech.pos.x - TALK[0], tech.pos.z - TALK[2]) < 0.6) await tech.walk(L.tech_aside, { speed: 0.45, round: 0, backwards: true });
          await john.sitAtTable("furn_chair_kitchen_n0", { approach: L.john_to_table, sideDir: -1 });
          // the guide down on the table by his left hand
          {
            const top = new sim.T.Box3().setFromObject(window.walk.scene.getObjectByName("furn_table_kitchen")).max.y, h = john.heading;
            guideWithJohn(sim, false);
            john.putDown(guide, john.pos.x + Math.sin(h) * 0.42 + Math.cos(h) * 0.3, top + 0.003, john.pos.z + Math.cos(h) * 0.42 - Math.sin(h) * 0.3, h + 0.3);
          }
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
          await T(sim, "S10_03");
          await T(sim, "S10_04");
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
      // "Come on in": behind Mike on the porch and off to his left, looking in through the doorway at John past the door's edge
      // (from the porch's west end John was behind the wall once he stepped back)
      invite: { pos: () => [1.35, 1.62, innerWidth < innerHeight ? 2.7 : 2.3], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.3) },
      foyer: { pos: [-0.85, 1.62, -3.0], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.4) },
      // S3 and S4 from the foyer's east side, across at the doorway: John on the hall side, Mike at the threshold (his shoe covers on
      // the porch), then the two of them once he is in and the door is shut (the shot above stands behind John)
      // (on a phone held upright the picture is narrow: from further back, by the foyer's south wall, so both of them fit)
      doorway_in: { pos: () => [1.0, 1.58, innerWidth < innerHeight ? -3.25 : -2.5], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(Math.min(1.4, s.people.tech.eyes().y + 0.1)) },
      follow_living: { pos: [-3.3, 1.65, -0.75], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.35).setY(1.2) },
      sink: { pos: [-2.6, 1.68, -7.95], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.4) },
      check: { pos: [-3.2, 1.7, -6.4], look: (s) => s.people.tech.pos.clone().setY(0.9) },
      sofa: { pos: [-3.75, 1.6, -3.25], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.3) },
      table: { pos: [-1.45, 1.75, -5.0], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.5).setY(0.95) },
      // the two of them at the corner, from the table's north east: Mike side on to the right of the frame, John facing it
      // (from the west, where it stood until round 3h, it would be behind Mike's chair)
      table_close: { pos: [-1.8, 1.45, -5.65], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.1) },
    },
  };
})();
