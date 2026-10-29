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
    john_aside: [[0.55, 0, -1.7]],
    tech_in: [[0.35, -0.02, 0.6], [0.15, 0, -0.35], [-0.05, 0, -1.05]],
    john_lead: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.55, 0, -7.1]],
    tech_follow: [[-0.4, 0, -1.85], [-1.22, 0, -1.9], [-2.3, 0, -2.3], [-3.6, 0, -4.45], [-4.55, 0, -5.2], [-5.55, 0, -5.3], [-5.55, 0, -6.05]],
    john_to_sofa: [[-4.6, 0, -7.4], [-3.2, 0, -7.2], [-3.2, 0, -5.3], [-3.5, 0, -4.6], [-4.6, 0, -4.32], [-5.46, 0, -4.32]],
    tech_to_sofa: [[-5.55, 0, -5.3], [-4.6, 0, -5.1], [-4.6, 0, -4.65]],
    tech_off: [[-4.3, 0, -5.2], [-3.2, 0, -5.3]],
    tech_back_in: [[-4.3, 0, -5.2], [-4.6, 0, -4.65]],
    john_to_table: [[-4.6, 0, -4.32], [-3.5, 0, -4.6], [-3.2, 0, -5.3], [-3.2, 0, -7.0]],
    tech_to_table: [[-4.3, 0, -4.9], [-3.3, 0, -5.0]],   // to the near end of the table, across from John
  };
  const standFromSofa = (sim, p) => [SOFA[0] + sim.STAND_FWD * p.root.scale.x, 0, SOFA[2], SOFA[3]];

  // the technician's line: said by him in watch mode, put on the card for the trainee in practice mode; a question brings the
  // clipboard up in front of him while he asks it (Jake 2026-10-29: "It'll come up as he's asking questions")
  const T = async (sim, id, o) => {
    const ask = /\?/.test(sim.lines[id].text);
    if (ask) boardUp(sim, true);
    try { await (sim.practice ? sim.prompt(id) : sim.say(id, o)); } finally { if (ask) boardUp(sim, false); }
  };
  // John's line, to the technician (in Practice that is Mike too: the trainee is him)
  const H = (sim, id, o = {}) => sim.say(id, o);
  const watch = (sim, f) => (sim.practice ? Promise.resolve() : f());
  const last = (path) => path[path.length - 1];
  // An action in Practice: the card says what to do; walk Mike to the ring yourself, or tap the button and he goes (a phone does
  // not have to walk every step). go: how he gets there; then: what he does once there (sitting down, say).
  const act = (sim, text, btn, at, go, then = null) => sim.prompt(null, text, btn, { at, go, then });
  // a walk that starts with a straight line from wherever the trainee left Mike: if that line would cross a wall or furniture
  // (he wandered off), he is put at the walk's first point first
  const goAlong = (sim, p, path, o) => { if (sim.checkPath([p.pos.toArray(), path[0]]).length) p.place(...path[0], p.heading); return p.walk(path, o); };
  // his business card
  let board = null, card = null;
  const putAway = () => { if (card && card.parent) card.parent.remove(card); };

  // ---- the clipboard ------------------------------------------------------------------------------------------------
  // Jake 2026-10-29: "his hand should be like grasping the side of it, it's tucked into his side. It'll come up as he's asking
  // questions." Then: "Typically the fingers curl around the edge of the clipboard when it's in the relaxed position, and it's
  // in the horizontal plane instead of the vertical." So he carries it flat along his left forearm, the forearm low at his side
  // and running forward, paper up, its back end tucked against his hip and his fingers curled round its front edge; for a
  // question the arm brings it up in front of him, tilted towards his face to read and write on, and it goes back down after.
  // The wrist's place is set from his hips (the pelvis, so a crouch or a sit takes it down with him) and his facing; the board
  // lies on the forearm as it is; both every frame once the body is final (sim.late). On the table at the recap (putDown) it
  // stays where it is put.
  // hx, hy, hz: the wrist from his hips (out to his left, up, forward); back, lift, out: the board's middle from the wrist (back
  // along the forearm, up off it, out to his left); twist: the hand turned palm up round the board's edge
  const carry = { on: false, up: 0, want: 0, arm: null, downAt: 0, hx: 0.21, hy: 0.17, hz: 0.27, back: 0.07, lift: 0.05, out: 0.06, twist: -1.2 };
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
    // carried: the wrist low at his side, a little forward, so the forearm runs from his hip forward; the board lies along the
    // forearm itself (from the elbow and the wrist as they are), paper up, the clip away from him, its front edge at his fingers
    // and its back end at his hip
    const hand = hips.clone().addScaledVector(up, carry.hy).addScaledVector(left, carry.hx).addScaledVector(fwd, carry.hz);
    const el = p.root.getObjectByName("Bip01_L_Forearm").getWorldPosition(V3()), wr = p.root.getObjectByName("Bip01_L_Hand").getWorldPosition(V3());
    const dir = wr.clone().sub(el).normalize(), nUp = up.clone().addScaledVector(dir, -up.dot(dir)).normalize();
    const cc = wr.clone().addScaledVector(dir, -carry.back).addScaledVector(nUp, carry.lift).addScaledVector(left, carry.out);
    const xA = dir.clone().negate(), yA = nUp.clone().negate();
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
    if (!carry.arm || !tech.posers.includes(carry.arm.fn)) carry.arm = tech.reach("L", () => handPlace(tech), { dur: 0.35, twist: carry.twist });
    const k = smooth(carry.up), b = boardPoses(tech);
    b.carried.m.decompose(pos, quat, scl);
    if (k > 0) { b.read.m.decompose(p2, q2, s2); pos.lerp(p2, k); quat.slerp(q2, k); }
    if (board.parent !== window.walk.scene) window.walk.scene.add(board);
    board.position.copy(pos); board.quaternion.copy(quat); board.scale.set(1, 1, 1);
  }
  // up for a question (and a moment after, so a run of questions does not bob it up and down)
  function boardUp(sim, up) {
    if (!carry.on) return;
    if (up) { carry.want = 1; carry.downAt = 0; } else carry.downAt = sim.clock + 1.2;
  }
  // on his forearm (every step that starts with him on his feet)
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

  // S2 in Practice: you are Mike, out of the van. The calls the script makes (its S2 directions) are what you are scored on:
  // "A steady pace. Not rushing, not timid." "Never scan the house or look in windows." A knock (five, firm), "then step back far
  // enough to move left or right if a dog comes out." "Hand them your card instead of reaching for a handshake." "Never step
  // inside until they invite you."
  async function approachGame(sim) {
    const { john, tech } = sim.people;
    const near = (p, x, z, r) => Math.hypot(p.pos.x - x, p.pos.z - z) < r;
    sim.coach("Walk up to the front door. A steady pace, not rushing. Eyes on the door: never look in the windows.");
    let rushed = 0, peeked = false, looking = 0;
    const atDoor = () => tech.pos.y > -0.2 && tech.pos.z > 0.15 && tech.pos.z < 1.5 && Math.abs(tech.pos.x - 0.1) < 0.7;
    const windowsWatch = (dt) => {
      if (sim.lookingIn(tech)) looking += dt; else looking = 0;
      if (looking > 0.5 && !peeked) { peeked = true; sim.feedback(false, "Never look in their windows. That's a huge no-no."); }
    };
    await sim.until((dt) => { if (sim.control.running) rushed += dt; windowsWatch(dt); return atDoor(); });
    sim.control.enabled = false;
    sim.score("pace", rushed < 0.8, rushed < 0.8 ? "A steady pace up to the door" : "Rushed up to the door (a steady pace: not rushing, not timid)");
    sim.feedback(rushed < 0.8 && !peeked, rushed >= 0.8 ? "You hurried up to the door. Walk up at a steady pace: not rushing, not timid." : peeked ? "Up to the door, but you looked in a window on the way." : "A steady approach, eyes on the door.");
    await tech.walk([[KNOCK[0], tech.pos.y, Math.max(KNOCK[2], Math.min(tech.pos.z, 1.0))], KNOCK], { speed: 0.6, round: 0.2 });
    await tech.turnTo(Math.PI, 2);
    tech.face.mood = "smile";
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
    const ring = sim.mark(spotBack, 0.38);
    sim.coach("Now step back, far enough to move left or right if a dog comes out. Stand in the ring.");
    sim.control.enabled = true;
    let waited = 0;
    await sim.until((dt) => { waited += dt; windowsWatch(dt); return (near(tech, spotBack[0], spotBack[2], 0.38) && sim.control.speed < 0.5) || waited > 10; });
    ring.remove();
    sim.control.enabled = false;
    const roomy = tech.pos.z > 1.0;
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
      const c = await sim.choose("Your line: say it out loud", `“${ln.text}”`, [
        { key: "shake", label: "Reach out to shake his hand" },
        { key: "card", label: "Hand him your card" },
      ]);
      if (c === "card") {
        sim.score("card", n === 0, n === 0 ? "Handed him your card, not a handshake" : "Went for a handshake first (hand them your card instead)");
        sim.feedback(true, "Your card, not a handshake. If they offer a hand, shake it.");
        sim.control.enabled = false;
        await tech.turnToward(john.pos.x, john.pos.z);
        await handCard(sim, Math.hypot(tech.pos.x - john.pos.x, tech.pos.z - john.pos.z) > 1.25);
        sim.control.enabled = true;
        break;
      }
      sim.feedback(false, "Hand them your card instead of reaching for a handshake. If they offer a hand, shake it.");
    }
    await H(sim, "S2_04");
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
      board = sim.props.clipboard(); card = sim.props.card();
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
          putAway(); inHand(sim);
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
          await H(sim, "S2_04");
        },
      },
      {
        num: "S3", title: "First Contact", shot: "foyer",
        start(sim) {
          const { john, tech } = sim.people;
          putAway(); inHand(sim);
          sim.setDoor("door_foyer_outside", true);
          john.stand(L.john_in_door[0][0], 0, L.john_in_door[0][2], 0.1);
          tech.stand(...last(L.tech_card), Math.PI + 0.12);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("foyer");
          const aside = john.walk(L.john_aside, { backwards: true, speed: 0.6 });
          await watch(sim, async () => { await john.wait(0.5); await tech.walk(L.tech_in); });
          await aside;
          putAway();                                            // John pockets the card
          if (sim.practice) await act(sim, "He has asked you in: step inside.", "Step inside", last(L.tech_in), () => goAlong(sim, tech, L.tech_in));
          await T(sim, "S3_01");
          await H(sim, "S3_02");
          await T(sim, "S3_03");
          // shoe covers: he crouches while John answers (in Practice too: it is Mike's body, not a call to make)
          await tech.once("crouch_in", { early: 0.05 }); tech.play("crouch_idle");
          await H(sim, "S3_04", { listen: null });
          await tech.wait(0.6); await tech.once("crouch_out", { early: 0.05 }); tech.play(tech.base, { fade: 0.2 });
          await T(sim, "S3_05");
          await T(sim, "S3_06");
          await H(sim, "S3_07");
        },
      },
      {
        num: "S4", title: "Initial Discovery", shot: "foyer",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          sim.setDoor("door_foyer_outside", true);
          john.stand(0.55, 0, -1.7, -2.2);
          tech.stand(-0.05, 0, -1.05, 0.9);
        },
        async run(sim) {
          sim.shot("foyer");
          for (const id of ["S4_01", "S4_02", "S4_03", "S4_04", "S4_05", "S4_06", "S4_07", "S4_08", "S4_09", "S4_10", "S4_11", "S4_12", "S4_13", "S4_14"])
            await (sim.lines[id].who === "tech" ? T(sim, id) : H(sim, id));
        },
      },
      {
        num: "S5", title: "Happy Homes Guide", shot: "follow_living",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          sim.setDoor("door_foyer_outside", true);
          john.stand(0.55, 0, -1.7, -2.2);
          tech.stand(-0.05, 0, -1.05, 0.9);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("follow_living");
          const lead = john.walk(L.john_lead);
          await watch(sim, async () => { await tech.wait(1.4); await tech.walk(L.tech_follow); });
          if (sim.practice) await act(sim, "Follow John to the kitchen sink.", "Follow him", last(L.tech_follow), () => goAlong(sim, tech, L.tech_follow));
          await lead;
          sim.shot("sink");
          await H(sim, "S5_01");
          await T(sim, "S5_02");
          await T(sim, "S5_03");
          await H(sim, "S5_04");
          await T(sim, "S5_05");
        },
      },
      {
        num: "S6", title: "Game Plan", shot: "sink",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          john.stand(-5.55, 0, -7.1, 0);
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
          inHand(sim);
          john.stand(-5.55, 0, -7.1, 0);
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
          if (sim.practice) await act(sim, "Do the check at the sink: get down and look under it, then take a picture.", "Do the check", [-5.55, 0, -6.05], () => tech.walk([[-5.55, 0, -6.05]]), check);
          else await check();
          await toSofa;
        },
      },
      {
        num: "S8", title: "Check-In / Share", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          john.seated(...SOFA);
          tech.stand(-5.55, 0, -6.05, -Math.PI / 2);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          await watch(sim, async () => { await tech.walk(L.tech_to_sofa); await tech.turnToward(john.pos.x, john.pos.z); });
          if (sim.practice) await act(sim, "Walk over to John. Standing up, on the go, phone in hand. Under 2 minutes.", "Go to him", last(L.tech_to_sofa), () => goAlong(sim, tech, L.tech_to_sofa), () => tech.turnToward(john.pos.x, john.pos.z));
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
          inHand(sim);
          john.stand(...standFromSofa(sim, john));
          tech.stand(-4.6, 0, -4.65, -1.75);
        },
        async run(sim) {
          const { tech } = sim.people;
          sim.shot("sofa");
          await T(sim, "S9_01");
          await H(sim, "S9_02");
          await T(sim, "S9_03");
          await watch(sim, () => tech.walk(L.tech_off));
          if (sim.practice) await act(sim, "Go and check the water heater (S7 for that system).", "Go check it", last(L.tech_off), () => goAlong(sim, tech, L.tech_off));
          sim.caption("He checks the water heater (S7 for that system), then comes back");
        },
      },
      {
        num: "S8L", title: "Last Check-In", shot: "sofa",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          john.stand(...standFromSofa(sim, john));
          tech.stand(-3.2, 0, -5.3, -1.7);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("sofa");
          await watch(sim, async () => { await tech.walk(L.tech_back_in); });
          if (sim.practice) await act(sim, "Back to John for the last check-in.", "Go back to him", last(L.tech_back_in), () => goAlong(sim, tech, L.tech_back_in), () => tech.turnToward(john.pos.x, john.pos.z));
          await T(sim, "S8L_01");
          await H(sim, "S8L_02");
        },
      },
      {
        num: "S10", title: "The Recap", shot: "table",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          john.stand(...standFromSofa(sim, john));
          tech.stand(-4.6, 0, -4.65, -1.75);
          for (const n of ["furn_chair_kitchen_n0", "furn_chair_kitchen_s0"]) { const c = window.walk.scene.getObjectByName(n); if (c.userData.home) c.position.copy(c.userData.home); }
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("table");
          // opposite sides (Jake, 2026-10-29): the chairs are at the table's two ends, so John takes the far end first,
          // round the west side, and the technician sits down across from him at the near end
          await john.sitAtTable("furn_chair_kitchen_n0", { approach: L.john_to_table, sideDir: -1 });
          // the clipboard goes down on the table in front of him (the discovery sheet is the evidence)
          const sit = async (approach) => {
            await tech.sitAtTable("furn_chair_kitchen_s0", { approach, sideDir: 1 });
            const top = new sim.T.Box3().setFromObject(window.walk.scene.getObjectByName("furn_table_kitchen") || tech.root).max.y;
            putDownBoard(sim, tech.pos.x + Math.sin(tech.heading) * 0.55, top + 0.004, tech.pos.z + Math.cos(tech.heading) * 0.55, tech.heading + 0.2);
          };
          if (sim.practice) await act(sim, "Sit down across from him. Discovery sheet, pictures and the failed part on the table.", "Sit down", last(L.tech_to_table), () => goAlong(sim, tech, L.tech_to_table), () => sit([]));
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
      foyer: { pos: [-0.85, 1.62, -3.0], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.4) },
      follow_living: { pos: [-3.3, 1.65, -0.75], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.35).setY(1.2) },
      sink: { pos: [-2.6, 1.68, -7.95], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.4) },
      check: { pos: [-3.2, 1.7, -6.4], look: (s) => s.people.tech.pos.clone().setY(0.9) },
      sofa: { pos: [-3.75, 1.6, -3.25], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.3) },
      table: { pos: [-1.45, 1.75, -5.0], look: (s) => s.people.john.pos.clone().lerp(s.people.tech.pos, 0.5).setY(0.95) },
      table_close: { pos: [-3.75, 1.45, -6.35], look: (s) => s.people.john.eyes().lerp(s.people.tech.eyes(), 0.5).setY(1.15) },
    },
  };
})();
