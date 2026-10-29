// Practice run-through, scenario 1: a kitchen sink call at John Smith's, the field script v2 from the door (S2) to the
// recap at the table (S10). Every line is a set line from sim/lines/sink_call_john.json, voiced and lip timed.
//
// Each step has start(sim), the state it begins in (so the player can jump to it, or go back to it), and run(sim), what
// happens in it. In "watch" mode the uniformed technician does the technician's part; in "practice" mode he is hidden,
// the trainee is the camera and walks freely, his lines come up on the card to say out loud, and John talks to the
// camera. Points are walk.js world metres (see sim.js); every walking leg passes sim.checkPath against the furniture
// and the walls (legs below).
window.SCENARIOS = window.SCENARIOS || {};
(function () {
  const SOFA = [-5.93, 0, -4.32, Math.PI / 2];          // seated on the living room sofa, facing the room
  const L = {
    tech_porch: [[0.9, -0.02, 0.95], [0.38, -0.02, 0.62]],
    tech_back: [[0.42, -0.02, 1.32]],                     // about 0.7 m back: room to move left or right if a dog comes out
    john_to_door: [[0.42, 0, -1.3], [0.5, 0, -0.78]],     // the handle side, outside the door's swing
    john_in_door: [[0.12, 0, -0.42]],
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

  // the technician's line: said by him in watch mode, put on the card for the trainee in practice mode
  const T = (sim, id, o) => (sim.practice ? sim.prompt(id) : sim.say(id, o));
  // John's line: to the technician, or to the trainee's camera in practice mode
  const H = (sim, id, o = {}) => sim.say(id, sim.practice ? { ...o, to: "trainee" } : o);
  const watch = (sim, f) => (sim.practice ? Promise.resolve() : f());
  // where the technician is once an action is done, for Practice: answering "I knocked" from across the porch takes you
  // there (player.js glides the camera), so a phone does not have to walk every step
  const spot = (p, look, eye = 1.6) => () => ({ at: [p[0], p[1] + eye, p[2]], look: typeof look === "function" ? look() : look, eye });
  const johnsEyes = (sim) => () => sim.people.john.eyes().toArray();
  const last = (path) => path[path.length - 1];
  // the technician's clipboard: in his left hand on his feet, on the table once he sits for the recap
  let board = null;
  const inHand = (sim) => sim.people.tech.hold(board, "Bip01_L_Hand", [0.11, 0.03, 0.02]);

  window.SCENARIOS.sink_call_john = {
    title: "Kitchen sink call: John Smith",
    lines: "sink_call_john",
    people: {
      john: { name: "John", glb: "candidates/sim/john_smith.glb", moves: ["candidates/sim/moves/john_moves.glb", "candidates/sim/moves/john_moves_b.glb"], height: 1.83 },
      tech: { name: "Mike", glb: "candidates/sim/tech_uniform.glb", moves: ["candidates/sim/moves/tech_moves.glb", "candidates/sim/moves/tech_moves_b.glb"], height: 1.83, tech: true },
    },
    legs: L,
    setup(sim) { board = sim.props.clipboard(); inHand(sim); },
    steps: [
      {
        num: "S2", title: "The Approach", shot: "porch",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          tech.stand(1.55, -0.02, 1.2, -Math.PI / 2);
          john.stand(0.2, 0, -2.9, Math.PI);
          sim.setDoor("door_foyer_outside", false);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("porch");
          await watch(sim, async () => {
            await tech.wait(0.8);
            await tech.walk(L.tech_porch);
            await tech.turnTo(Math.PI, 2.5);
            await tech.once("knock_door", { early: 2.0 });     // knocks and is back on his mark by 6 s of 8
            tech.walk(L.tech_back, { backwards: true, speed: 0.6 });
          });
          if (sim.practice) await sim.prompt(null, "Walk up and knock. Then step back far enough to move left or right if a dog comes out.", "I knocked", spot(last(L.tech_back), [0.12, 1.6, -0.42]));
          await john.wait(0.6);
          await john.turnTo(0, 3);
          await john.walk(L.john_to_door);
          const opening = john.once("try_door_inwards", { early: 1.4 });
          await john.wait(1.45);                                // his hand is on the handle
          sim.openDoor("door_foyer_outside", true);
          await opening;
          await john.walk(L.john_in_door, { speed: 0.6 });
          sim.shot("doorway");
          await T(sim, "S2_01");
          await H(sim, "S2_02");
          await T(sim, "S2_03");
          await H(sim, "S2_04");
        },
      },
      {
        num: "S3", title: "First Contact", shot: "foyer",
        start(sim) {
          const { john, tech } = sim.people;
          inHand(sim);
          sim.setDoor("door_foyer_outside", true);
          john.stand(0.12, 0, -0.42, 0.17);
          tech.stand(0.42, -0.02, 1.32, Math.PI + 0.17);
        },
        async run(sim) {
          const { john, tech } = sim.people;
          sim.shot("foyer");
          const aside = john.walk(L.john_aside, { backwards: true, speed: 0.6 });
          await watch(sim, async () => { await john.wait(0.5); await tech.walk(L.tech_in); });
          await aside;
          if (sim.practice) await sim.prompt(null, "Only once you are invited in: step inside.", "I'm in", spot(last(L.tech_in), johnsEyes(sim)));
          await T(sim, "S3_01");
          await H(sim, "S3_02");
          await T(sim, "S3_03");
          // shoe covers: he crouches while John answers
          await watch(sim, async () => { await tech.once("crouch_in", { early: 0.05 }); tech.play("crouch_idle"); });
          await H(sim, "S3_04", { listen: null });
          await watch(sim, async () => { await tech.wait(0.6); await tech.once("crouch_out", { early: 0.05 }); tech.play(tech.base, { fade: 0.2 }); });
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
          await watch(sim, async () => {
            await tech.turnTo(-Math.PI / 2, 2.5);              // to the sink on the west wall
            await tech.once("crouch_in", { early: 0.05 });
            tech.play("crouch_idle");
            await tech.wait(2.5);
            tech.play("crouch_gestic");
            await tech.wait(3.0);
            await tech.once("crouch_out", { early: 0.05 });
            await tech.once("take_picture", { early: 0.3 });
            tech.play(tech.base);
          });
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
          await watch(sim, async () => { await tech.walk(L.tech_to_sofa); await tech.faceTo(john.pos.x, john.pos.z, 3); });
          if (sim.practice) await sim.prompt(null, "Walk over to John. Standing up, on the go, phone in hand. Under 2 minutes.", "I'm with him", spot(last(L.tech_to_sofa), johnsEyes(sim)));
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
          await watch(sim, () => tech.sitAtTable("furn_chair_kitchen_s0", { approach: L.tech_to_table, sideDir: 1 }));
          if (!sim.practice) {
            // the clipboard goes down on the table in front of him (the discovery sheet is the evidence)
            const top = new sim.T.Box3().setFromObject(window.walk.scene.getObjectByName("furn_table_kitchen") || tech.root).max.y;
            tech.putDown(board, tech.pos.x + Math.sin(tech.heading) * 0.55, top + 0.004, tech.pos.z + Math.cos(tech.heading) * 0.55, tech.heading + 0.2);
          }
          if (sim.practice) await sim.prompt(null, "Sit down across from him. Discovery sheet, pictures and the failed part on the table.", "I'm seated", () => {
            const c = window.walk.scene.getObjectByName("furn_chair_kitchen_s0"), h = c.userData.home || c.position;
            return spot([h.x, 0, h.z], johnsEyes(sim), 1.2)();
          });
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

    // camera shots for watch mode (the director); in practice mode, or with Free camera on, the trainee walks freely
    shots: {
      porch: { pos: [-1.2, 1.7, 1.75], look: (s) => s.people.tech.pos.clone().lerp(new s.T.Vector3(0.1, 0, 0), 0.5).setY(1.1) },
      // east of the door: it swings in along the west jamb, so from the west it hides whoever stands in the doorway
      doorway: { pos: [1.2, 1.6, 1.75], look: (s) => s.people.tech.eyes().lerp(s.people.john.eyes(), 0.5).setY(1.45) },
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
