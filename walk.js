// Training house walk (2026-09-08). Loads the six house GLBs, drops every default placement from placements.json at its socket
// (socket world matrix x rotY(yaw) x translate(offset)), loads the four pipe layers, and lets you walk through it with pointer
// lock controls. Collision is a handful of rays against the col_ meshes; the floor is a ray straight down. Plain three r128 global build.
(function () {
  const T = THREE;
  const FT = 0.3048;
  const HOUSE_FIRST = ['house_site', 'house_floor1', 'house_attic', 'house_crawl'], HOUSE_REST = ['house_furniture', 'house_framing'];     // round 60: what you need to stand in the house, and what can arrive behind you
  let bootFinished; const bootDone = new Promise(r => { bootFinished = r; });
  const HOUSE_FILES = ['house_site', 'house_floor1', 'house_attic', 'house_crawl', 'house_furniture', 'house_framing'];     // framing: attic joists, batts, rafters and headers (build_framing.py)
  const PIPE_FILES = ['pipes_supply', 'pipes_dwv', 'pipes_gas', 'pipes_hvac', 'pipes_alternates'];     // the alternates file was never loaded at all, so its runs did not exist in any layout
  const MODEL_DIRS = ['../models/', './little/', './'];
  const status = document.getElementById('status'), loadEl = document.getElementById('load'), labelEl = document.getElementById('label');
  const view = document.getElementById('view');
  const renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputEncoding = T.sRGBEncoding; view.appendChild(renderer.domElement);
  const scene = new T.Scene(); scene.background = new T.Color(0x8fb4d9); scene.fog = new T.Fog(0x8fb4d9, 60, 160);
  // Round 20: metals need something to reflect. Chrome and brass (metalness 1) rendered BLACK here, which is what Jake read as a
  // black thing stubbed up on the sink deck (the air gap and the RO faucet). A soft room: a graded sky sphere and four white
  // panels, prefiltered once into scene.environment.
  (() => {
    const pm = new T.PMREMGenerator(renderer), env = new T.Scene();
    const sg = new T.SphereGeometry(40, 32, 16), cols = [], pa = sg.attributes.position;
    for (let i = 0; i < pa.count; i++) { const t = (pa.getY(i) / 40 + 1) / 2; cols.push(0.22 + 0.22 * t, 0.24 + 0.22 * t, 0.28 + 0.24 * t); }
    sg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    env.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    for (const [x, z] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) { const p = new T.Mesh(new T.PlaneGeometry(9, 7), new T.MeshBasicMaterial({ color: 0xffffff })); p.position.set(x, 11, z); p.lookAt(0, 6, 0); env.add(p); }
    scene.environment = pm.fromScene(env, 0.04).texture;
  })();
  // The environment is for the METALS. It lit every painted wall and floor as well (Jake: stupid washed out and bright), so
  // a material only takes it in proportion to its metalness; matte things keep the sun and the fixtures they had.
  function tuneMaterials(root) { root.traverse(o => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m || m.envMapIntensity === undefined) continue; const k = m.metalness === undefined ? 0 : m.metalness; m.envMapIntensity = k > 0.5 ? 1.0 : 0.06 + 0.3 * k; m.needsUpdate = true; } }); }
  const camera = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
  // Daylight, backed off from 0.9/0.9. Nothing here casts a shadow, so the sun reaches every interior surface as if
  // there were no roof, and at full strength it drowns anything the fixtures add. This is the level where a lit room
  // reads as lit and an unlit one still reads as a room.
  const sky = new T.HemisphereLight(0xdfe8f5, 0x5a5040, 0.52); scene.add(sky);
  const sun = new T.DirectionalLight(0xffffff, 0.72); sun.position.set(30, 60, 20); scene.add(sun);
  // ------------------------------------------------------------ the fixtures are ON
  // The 12 ceiling fixtures and the 5 table lamps were shape only: a chrome canopy and a plain globe, nothing
  // emissive, and the whole scene had exactly two lights in it, so the rooms were lit like an open field and a
  // fixture read as a lump on the ceiling (Jake: "make them look lit, give some light to the room, the lamp on the
  // table can be on"). Blender ships the domes and the shades emissive now. The light itself comes from here.
  //
  // A fixed POOL of point lights, not one per fixture: three compiles a separate shader for every light count, so
  // adding and removing lights as you walk recompiles every material in the house and hitches. The pool size never
  // changes; the fixtures nearest you are assigned into it.
  const POOL = 8, fixtures = [], pool = [];
  for (let i = 0; i < POOL; i++) { const L = new T.PointLight(0xfff1da, 0, 9, 1.5); L.position.set(0, -60, 0); scene.add(L); pool.push(L); }
  let lightsOn = true;
  function collectFixtures() {
    const by = {};
    house.traverse(o => {
      if (!o.isMesh) return;
      const n = nodeName(o); if (!/^furn_(light|lamp)_/.test(n)) return;
      const f = by[n] || (by[n] = { name: n, ceiling: n.startsWith('furn_light_'), box: new T.Box3(), mats: [] });
      f.box.union(new T.Box3().setFromObject(o));
      for (const m of (Array.isArray(o.material) ? o.material : [o.material]))
        if (m && m.emissive && m.emissive.getHex() && f.mats.indexOf(m) < 0) f.mats.push(m);
    });
    for (const k in by) {
      const f = by[k], c = f.box.getCenter(new T.Vector3());
      // the emitter sits at the glass, not at the middle of the fitting: just under the dome, inside the shade
      c.y = f.ceiling ? f.box.min.y - 0.04 : f.box.max.y - 0.09;
      fixtures.push({ pos: c, ceiling: f.ceiling, mats: f.mats, name: f.name });
    }
  }
  function updateLights() {
    if (!lightsOn) { for (const L of pool) L.intensity = 0; return; }
    const near = fixtures.map(f => ({ f: f, d: f.pos.distanceTo(pos) })).sort((a, b) => a.d - b.d).slice(0, POOL);
    for (let i = 0; i < POOL; i++) {
      const L = pool[i], n = near[i];
      if (!n || n.d > 11) { L.intensity = 0; continue; }
      L.position.copy(n.f.pos);
      L.color.setHex(n.f.ceiling ? 0xfff0d6 : 0xffdfa8);
      // Short range on purpose. Nothing in this scene casts a shadow, so a fixture two rooms away shines straight
      // through the walls and they stack: in a small room like the laundry, four of them together blew the walls to
      // white. The reach is about one room.
      L.distance = n.f.ceiling ? 5.5 : 3.2;
      L.decay = n.f.ceiling ? 1.3 : 1.3;
      L.intensity = n.f.ceiling ? 0.52 : 0.38;
    }
  }
  const house = new T.Group(), pipes = new T.Group(), equip = new T.Group(); scene.add(house, pipes, equip);
  const colliders = [], floors = [], sockets = {}, waypoints = {}, houseByName = {}, layers = {}, labels = {};
  let placements = null, pipesMeta = null; const mixers = []; const flows = [];
  // Round 60 (Jake, on his phone: a minute and a half on "Building the house", "no one's going to use it"). The eleven files the
  // house needs before you can walk in were 73 MB of raw 32 bit geometry, sent uncompressed and one at a time. They ship meshopt
  // compressed now (tools/compress_walk_glbs.mjs, 73.6 MB to about a third), which needs this decoder; a plain GLB still loads the same.
  const loader = new T.GLTFLoader(); const cache = {};
  if (window.MeshoptDecoder && loader.setMeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
  // cache buster on every model: the page is reloaded right after a rebuild, and a browser holding a stale GLB shows old
  // geometry and old clips, which reads as a bug that was already fixed
  const CB = '?v=' + Date.now();
  function load(url) { return new Promise((res, rej) => loader.load(url + CB, g => res(g), undefined, e => rej(e))); }
  function loadModel(file) {
    if (!cache[file]) cache[file] = (async () => { for (const d of MODEL_DIRS) { try { return await load(d + file); } catch (e) { } } throw new Error('missing ' + file); })();
    return cache[file];
  }
  function base(n) { return n.replace(/\.\d+$/, ''); }
  // A glTF node with several materials becomes one mesh per primitive, and three names those children after the
  // MESH, not the node: the two halves of the node tank_section come through as tank_shell005 and tank_shell005_1.
  // Everything here that matches by part name (cutaways, sections, elevation) was blind to those, which is why
  // clicking the septic tank never cut it open. The loader knows the node names, so stamp each mesh with the node it
  // came from and match on that.
  function stampParts(g, root) {
    const nodes = new Set(((g.parser && g.parser.json && g.parser.json.nodes) || []).map(x => x.name).filter(Boolean));
    root.traverse(o => {
      const b = base(o.name);
      o.userData.part = nodes.has(b) ? b : ((o.parent && o.parent.userData && o.parent.userData.part) || b);
    });
  }
  function partName(o) { return (o.userData && o.userData.part) || nodeName(o); }
  // a node with several materials loads as a group with children named <node>_0, <node>_1: the children answer to the node's name
  // Round 18: a placed model's meshes carry the glTF NODE they belong to (stampParts). The name matching below (placement
  // hide, states and show, the fault patterns, cutaways, section swaps) used the three.js object name, which for a node with
  // several materials is the MESH's name (bowl005, ballcock002, wall001): so the toilet's own wall, its old ballcock and its
  // warped flapper all showed in the house, and its bowl and its section stood there together.
  function nodeName(o) { if (o.userData && o.userData.part) return o.userData.part; const b = base(o.name); if (o.parent && o.parent.name) { const pb = base(o.parent.name); if (b.startsWith(pb + '_') && /^\d+$/.test(b.slice(pb.length + 1))) return pb; } return b; }
  // ---------------------------------------------------------------- house
  async function loadHouse(files) {
    for (const f of (files || HOUSE_FILES)) {
      status.textContent = 'loading ' + f; const g = await load('./' + f + '.glb'); const root = g.scene; root.name = f; house.add(root); root.updateMatrixWorld(true); tuneMaterials(root);
      root.traverse(o => {
        houseByName[o.name] = o;
        if (o.name.startsWith('door_') && !(o.parent && o.parent.name.startsWith('door_'))) {     // the top node of a door (a mesh, or a group of one mesh per material)
          // the overhead door: four sections, the opener trolley and its arm, all driven together by garageDoor
          if (o.name.startsWith('door_garage_driveway')) { o.userData.isDoor = true; o.userData.sectional = true; o.userData.garage = true; o.userData.open = false; doors.push(o); garageDoor.nodes.push(o); }
          else { o.userData.isDoor = true; o.userData.open = false; o.userData.target = 0; o.userData.dir = o.name.includes('outside') ? -1 : 1; doors.push(o); }
        }
        if (o.name.startsWith('sock_')) sockets[o.name] = o;
        if (o.name.startsWith('lid_') && o.isMesh) lids.push(o);
        if (o.name.startsWith('wp_') || o.name.startsWith('spawn_')) waypoints[o.name] = o;
        if (o.isMesh) {
          if (o.name.startsWith('col_')) { o.visible = false; colliders.push(o); floors.push(o); }
          else if (o.name.startsWith('room_') || o.name.startsWith('zone_')) o.visible = false;
          else if ((o.name.startsWith('floor_') && !/^floor_(joists|girders|blocking|straps)/.test(o.name)) || o.name.startsWith('stair_')) floors.push(o);     // round 32 follow up: the framing's floor_girders are not a floor to stand on (a crouched walker stepped up onto one and then onto the house floor through the crawl door)
          else if (o.name.startsWith('furn_') && !o.name.startsWith('furn_rug')) colliders.push(o);
          if (o.name.startsWith('roof_') || o.name.startsWith('ceil_') || o.name.startsWith('floor_')) overhead.push(o);     // round 32: in the crawl the floor is over your head
          if (o.material && o.material.transparent === false && o.name.startsWith('win_')) { }
          o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.side = T.DoubleSide;
        }
      });
      root.traverse(o => { let p = o, c; while (p && c === undefined) { c = p.userData && p.userData.config; p = p.parent; } if (c !== undefined) o.userData.config = c; });
      root.traverse(o => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (!m || !/grass_tex_cut/.test(m.name || '')) continue;
          // A constant nudge, not one that grows with the slope: the slope term (factor -2) got so large at a low angle
          // that the stripes drew over the driveway, 1.6 cm above them (Jake 2026-09-13). The stripes are also cut out
          // from under the paving and the boxes now.
          m.polygonOffset = true; m.polygonOffsetFactor = 0; m.polygonOffsetUnits = -4; m.needsUpdate = true;
        }
      });
    }
  }
  // ---------------------------------------------------------------- placements
  // The equipment layout. Ten alternates ship with the house and none of them could be reached here: this was one
  // hardcoded object with no UI, so the walk page has only ever shown the default. The picker below changes it.
  const CONFIG = { water_heater: 'attic_gas_tank', hvac: 'split_furnace', sewer: 'septic_spray', water: 'city_filter', softener: 'yes', filter: 'no', plumbing: 'cpvc', gas: 'natural', fault: 'none',
    soft_start: 'no', surge_condenser: 'no', surge_panel: 'no', reverse_osmosis: 'no', thermostat: 'programmable', expansion_tank: 'no' };     // round 45 (Jake): the add ons all start off
  // The septic plant, the tank, the sewer and the water service are all BURIED, so the ground gets its own switch.
  const GROUND = ['floor_terrain', 'floor_lot', 'floor_street', 'floor_patch_lawn', 'trim_riser_collar', 'site_mow_stripes', 'site_beds', 'site_shrubs', 'floor_driveway', 'floor_walkway', 'floor_crawl', 'soil', 'grass', 'backfill'];
  let groundOn = true;
  function isGround(o) { return GROUND.some(p => nodeName(o).startsWith(p)); }
  const CONFIG_CHOICES = {
    water_heater: ['attic_gas_tank', 'closet_gas_tank', 'attic_electric_tank', 'closet_electric_tank', 'garage_tankless', 'garage_hybrid', 'garage_electric_tankless'],     // round 46: the electric tank in both tank spots (Jake)
    hvac: ['split_furnace', 'split_furnace_cond96', 'heatpump_attic', 'gas_pack'],
    sewer: ['septic_spray', 'septic_spray_two_tank', 'septic_gravity', 'septic_overland', 'septic_overland_lee', 'septic_overland_aquaklear', 'city_lift', 'city_gravity'],     // round 29: gravity to the street (Jake)
    water: ['city_filter', 'well'],     // round 41: a well with a pressure tank in the garage (Jake)
    softener: ['yes', 'no'],     // round 42: with a softener the Flo is at the softener in the garage, without one it is under the house (Jake)
    filter: ['no', 'yes'],       // round 42: the spray pump filter is an add on, not on by default (Jake)
    thermostat: ['programmable', 'smart_ecobee', 'smart_nest'],     // round 45: which stat is on the hall wall (Jake)
    plumbing: ['cpvc', 'pex', 'galvanized'],     // round 25: the supply exists three ways (Jake: run everything in PEX, galvanized)
    gas: ['natural', 'propane'],                 // round 29: the utility meter set, or a 250 gallon tank in the side yard with its regulators (Jake)
    fault: ['none', 'belly']                     // round 29: the fault scenario: a belly in the city gravity lateral, standing water in it (Jake)
  };
  // a config value may list several layouts separated by a bar, for a run shared by two of them
  // a tag may join several clauses with & (a heater layout's PEX cold riser: water_heater=attic_gas_tank&plumbing=pex): all must hold
  function inConfig(c) { if (!c) return true; return c.split('&').every(cl => { const i = cl.indexOf('='); return CONFIG[cl.slice(0, i)] !== undefined && cl.slice(i + 1).split('|').includes(CONFIG[cl.slice(0, i)]); }); }
  function wants(pl) { if (!pl.model) return false; return inConfig(pl.config); }
  // the house carries layout tags too now (the lawn patch over the yard holes this layout does not use)
  // Flow columns carry their run's layout too, but they are off until something runs: the layout pass leaves them to
  // showFlows(), which lights only the ones that are running AND in this layout.
  function applyPipeConfig() {
    for (const root of [pipes, house]) root.traverse(o => { if (o.userData && o.userData.config !== undefined && !/^flow_/.test(nodeName(o))) o.visible = inConfig(o.userData.config) && (groundOn || !o.isMesh || !isGround(o)); });
    if (typeof showFlows === 'function' && flows.length) showFlows();
  }
  // May this mesh be seen at all in this yard? Not if its placement hides it, not if it belongs to another layout, and a
  // _section only ever by the cutaway or the elevation that swaps it in. Every switch that turns things back ON asks this
  // first. They used to just set visible, so a hidden part came back the moment you pressed something (Jake
  // 2026-09-13: "sometimes when you click around, things that have been made to go away show up").
  function showable(o) {     // round 32: this was allowed(o), shadowed by allowed(o, kind) below, so the ground never came back after elevation
    if (o.userData && o.userData.placeHidden) return false;
    if (o.userData && o.userData.config !== undefined && !inConfig(o.userData.config)) return false;
    return !/_section$/.test(nodeName(o));
  }
  // Round 44: placements load on approach. PEND holds what this layout wants and has not loaded; stepPlacements takes the nearest one that is
  // close or in view, one at a time. loadAll() forces the rest (the self test and the layout audits want everything).
  let PEND = [], loadingOne = false, pendT = 0;
  const _pv = new T.Vector3();
  function queuePlacements(todo) {
    PEND = [];
    for (const pl of todo) {
      const sk = sockets[pl.socket]; if (!sk) { PEND.push({ pl, p: null }); continue; }
      const p = new T.Vector3(); sk.getWorldPosition(p); PEND.push({ pl, p });
    }
    PEND.sort((a, b) => (a.p ? a.p.distanceToSquared(pos) : 1e9) - (b.p ? b.p.distanceToSquared(pos) : 1e9));
  }
  async function placeNearest(n) {
    for (let i = 0; i < n && PEND.length; i++) { const e = PEND.shift(); await place(e.pl); }
  }
  function stepPlacements(dt) {
    if (loadingOne || !PEND.length) return;
    pendT -= dt; if (pendT > 0) return; pendT = 0.15;
    let pick = -1;
    for (let i = 0; i < PEND.length; i++) {
      const p = PEND[i].p; if (!p) continue;
      if (p.distanceTo(pos) < 20) { pick = i; break; }
      _pv.copy(p).project(camera);
      if (_pv.z < 1 && Math.abs(_pv.x) < 1.15 && Math.abs(_pv.y) < 1.15) { pick = i; break; }     // it is in front of you: load before you get there
    }
    if (pick < 0) return;
    const e = PEND.splice(pick, 1)[0]; loadingOne = true;
    place(e.pl).then(() => { pumpsOnByDefault(); }).catch(() => { }).finally(() => { loadingOne = false; });
  }
  async function loadAll() { while (PEND.length) await placeNearest(4); return equip.children.length + ' models placed'; }
  async function place(pl) {
    const sock = sockets[pl.socket]; if (!sock) { console.warn('no socket', pl.socket); return; }
    let g; try { g = await loadModel(pl.model.replace(/^little\//, '')); } catch (e) { console.warn(e.message); return; }
    const inst = g.scene.clone(true); stampParts(g, inst); inst.userData.elevGroup = pl.elevation_group || null; tuneMaterials(inst); inst.userData.model = pl.model;
    if (g.animations && g.animations.length) { const mixer = new T.AnimationMixer(inst); mixers.push(mixer); inst.userData.anim = { mixer, clips: g.animations.map(c => c.clone()), state: {} }; }
    // the shower's two streams belong to the valve AND the diverter (Jake: the diverter sends the water to the spout or the head),
    // so the page owns them: their scale tracks come out of the clips and showerStreams() below shows the one the diverter picks
    if (inst.userData.anim && /^shower\.glb$/.test(pl.model)) { for (const c of inst.userData.anim.clips) c.tracks = c.tracks.filter(t => !/^(shower_stream|spout_stream)\./.test(t.name)); inst.traverse(o => { if (o.isMesh && /^(shower_stream|spout_stream)$/.test(partName(o))) o.scale.setScalar(1); }); }
    // Round 45: a placement can carry add on lists, {key: {show: [...], hide: [...]}}. When that add on is switched on in the add ons
    // tab, its parts come out of the hide list and whatever it replaces (a deck cap over an unused hole) goes in.
    const addOnShow = [], addOnHide = [];
    for (const [k, v] of Object.entries(pl.addon || {})) {
      if (CONFIG[k] !== 'yes') continue;
      for (const nm2 of (v.show || [])) addOnShow.push(nm2);
      for (const nm2 of (v.hide || [])) addOnHide.push(nm2);
    }
    const hide = new Set([...(pl.hide || []), ...addOnHide, ...(placements.hide_common || [])]); const pats = (placements.hide_patterns || []).map(p => new RegExp(p));
    for (const nm2 of addOnShow) hide.delete(nm2);
    // "show": a part the model shows that a hide pattern would swallow (the lift station's off float is float_off_wet, and
    // "_wet" took it, so the basin had no off float). "states": the other poses of a part a control swaps in, hidden at
    // load but NOT placement hidden, so the switch that owns them may show them (the lift station's HAND lever, its drawn
    // down water and the floats that go with it).
    const show = new Set([...(pl.show || []), ...addOnShow].filter(x => !addOnHide.includes(x))), states = new Set(pl.states || []);
    inst.userData.sectionSet = pl.section_set || null; inst.userData.sectionOpen = false;
    inst.userData.reveal = pl.reveal || null; inst.userData.revealOpen = false;
    for (const [nm, dv] of Object.entries(pl.move || {})) { const mo = inst.getObjectByName(nm); if (mo) mo.position.add(new T.Vector3(dv[0], dv[2], -dv[1])); }
    inst.traverse(o => { const nn = nodeName(o); if (!show.has(nn) && (hide.has(nn) || states.has(nn) || pats.some(r => r.test(nn)))) o.visible = false; if (hide.has(nn)) o.userData.placeHidden = true; if (o.isMesh) { o.userData.label = nn; o.userData.pack = pl.pack || pl.model; o.userData.inst = inst;
      if (/stream|_flow$|_flow_half$|_jet$/.test(nn) && !/spray_pattern/.test(nn)) { o.visible = false; o.userData.isStream = true; }
      if (nn === 'bubbles' || nn === 'mix_arrows' || nn === 'airlift_spurt') o.visible = false;     // these only show while the blower is running
      if (!groundOn && isGround(o)) o.visible = false; } });     // placed while the ground is off: its own dirt stays off too
    const off = pl.offset || [0, 0, 0];
    const m = new T.Matrix4().copy(sock.matrixWorld).multiply(new T.Matrix4().makeRotationY(T.MathUtils.degToRad(pl.yaw || 0))).multiply(new T.Matrix4().makeTranslation(off[0], off[2], -off[1]));
    inst.matrixAutoUpdate = false; inst.matrix.copy(m); inst.matrixWorld.copy(m); inst.updateMatrixWorld(true);
    inst.userData.pl = pl;     // round 46: the unit keeps its own placement, so its add ons can be offered where it stands
    equip.add(inst);
    modelWater(inst);     // round 61: the water that runs through the model's own pipes
    setupPlantSim(inst);     // round 67: a plant whose pump chamber, float and pump are driven by the water that arrives
    for (const r of (pl.replaces || [])) if (houseByName[r]) { houseByName[r].visible = false; houseByName[r].userData.hiddenByPlacement = true; }
    // Round 45 (Jake: "I need to be able to get into the shower so I can get up on it, that glass door is blocking me"): a shower is
    // somewhere you stand, so nothing on it stops you. You step over the curb the way the step up works everywhere else. A tub still
    // blocks, because you do not walk through a tub.
    const walkIn = /shower/.test(pl.model || '');
    inst.traverse(o => { if (o.isMesh && o.visible && !walkIn && (o.userData.label === 'cabinet' || o.userData.label === 'tub' || o.userData.label === 'range_body' || o.userData.label.endsWith('_body'))) colliders.push(o); });
  }
  async function reconfigure() {
    await bootDone;     // round 60: you can be let in before the pipes and placements.json have arrived, and this needs both
    for (const c of [...equip.children]) equip.remove(c);
    colliders.length = 0; mixers.length = 0;
    // the new yard's models come in at rest, so the switches start OFF. They used to keep the last yard's state: air
    // left on in one yard, the first click on the next yard's air pump said "OFF" and nothing moved.
    pumpOn = false; sprayOn = false;
    for (const o of Object.values(houseByName)) if (o.userData && o.userData.hiddenByPlacement) { o.visible = true; o.userData.hiddenByPlacement = false; }
    applyPipeConfig();
    queuePlacements(placements.placements.filter(wants));
    status.textContent = 'placing what is in reach'; await placeNearest(6);
    status.textContent = 'ready: ' + Object.keys(sockets).length + ' sockets, ' + equip.children.length + ' placed, ' + PEND.length + ' load as you go';
    pumpsOnByDefault();
  }
  // Round 23 (Jake: 'we should have one cutaway, and that's what we see. Clicking more shouldn't remove more parts unless it's very
  // specifically told ... make a very good list of what's actually removable in the app and what isn't'): interactions.json IS that
  // list (training_house/tools/interactions_gen.mjs writes it, INTERACTIONS.md is the readable copy). A Look click on a placed
  // model's part does only what its entry says; a part with no entry answers with its name.
  let INTER = null, INFO = { packs: {} };
  // Round 28 (Jake: 'a panel that pops up to the side that tells us what it is and what we can do with it ... you don't know which
  // objects actually do what'). Every click on a placed unit or a pipe opens #info: the unit's name from its pack, the part, the
  // teaching text the pack carries for that part, and a button for each thing the unit can do: cut open, the run clips, the
  // covers that come off, the water, the bay, the elevation. The app can hand the page more (the price book) through
  // window.HOUSE_INFO = { packs: { <pack>: { name, text, hotspots: { <part>: [text] } } } } before the page loads.
  const infoEl = document.getElementById('info'); let CHECKS = {}; let WIRES = { runs: {}, parts: [] }; let DRAINS = {}; let ball = null;
  const pretty = n => String(n || '').replace(/\.glb$/, '').replace(/^little\//, '').replace(/__/g, ' ').replace(/_/g, ' ');
  // Round 74 (Jake, from gameplay: "you have little pop-ups to tell you what things are. It's very weird, computery text. We need to
  // be very friendly and bubbly"). Every message the page shows goes through labelEl, and most were built from object names:
  // "hvac_furnace: inducer (Run runs it)", "pipe_supply_hot_wh_attic (cut open)". friendly() is the one place they are put into
  // plain words: the unit by its pack's name, the part by the pack's own label (info.json carries them now), a house pipe by what
  // it carries and where it goes, and the stage directions as something a person would say. Nothing upstream changed, so the
  // test handles (walk.lookAction and the rest) still return the raw strings.
  const HOUSE_WORDS = [[/^pipe_supply_hot/, 'Hot water line'], [/^pipe_supply_cold/, 'Cold water line'], [/^pipe_supply_recirc/, 'Hot water recirculation line'], [/^pipe_supply_service/, 'Water service from the street'],
    [/^pipe_supply/, 'Water line'], [/^pipe_dwv_sewer/, 'Sewer line'], [/^pipe_dwv_building_drain/, 'Main drain under the house'], [/^pipe_dwv_effluent/, 'Effluent line'], [/^pipe_dwv/, 'Drain line'],
    [/^vent_dwv/, 'Plumbing vent'], [/^cleanout_dwv/, 'Cleanout'], [/^vent_gas/, 'Gas flue'], [/^vent_hvac/, 'Furnace vent pipe'], [/^pipe_gas/, 'Gas line'], [/^pipe_hvac_lineset_suction/, 'AC suction line'],
    [/^pipe_hvac_lineset_liquid/, 'AC liquid line'], [/^pipe_hvac_lineset/, 'AC lineset'], [/^pipe_hvac_condensate/, 'Condensate drain'], [/^pipe_hvac/, 'HVAC line'], [/^pipe_septic_air/, 'Air line to the septic tank'],
    [/^pipe_septic|^pipe_spray/, 'Spray line'], [/^flex_hvac/, 'Flex duct'], [/^takeoff_[a-z]+/, 'Takeoff with its manual damper'], [/^duct_hvac_supply_trunk/, 'Main supply trunk'], [/^duct_hvac_plenum_riser/, 'Supply plenum'],
    [/^duct_dryer/, 'Dryer vent'], [/^duct_hvac|^duct/, 'Duct'], [/^register_hvac/, 'Supply register'], [/^boot_hvac/, 'Register boot'], [/^cable/, 'Cable'], [/^conduit/, 'Conduit'], [/^fit_[a-z]+/, 'Fitting'], [/^valve/, 'Valve'], [/^pipe/, 'Pipe']];
  const PLACE_WORDS = { wh: 'water heater', hallbath: 'hall bath', masterbath: 'master bath', hb: 'hall bath', mb: 'master bath', ks: 'kitchen sink', wc: 'toilet', lav: 'sink', dw: 'dishwasher', cw: 'washer', uf: '', dwv: '', hvac: '', bed2: 'bedroom 2', bed3: 'bedroom 3', master: 'master bedroom', living: 'living room', std80: '', cond96: '', bib: 'hose bib', tstat: 'thermostat', ahu: 'air handler' };
  const capFirst = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  // add ons that have no inspector pack of their own, so info.json has no words for them
  const EXTRA_PACKS = { sweet_air: { name: 'Sweet Air vent filter', labels: { chamber: 'Carbon canister. It sits on top of the vent pipe, outside, above the roof', cap: 'Twist cap. Turn it to OPEN and lift it off', vent_lid: 'Vented lid over the carbon',
    carbon: 'Activated carbon. It soaks up the sewer gas smell', carbon_spent: 'Spent carbon. Time for a fresh charge', bottom_grid: 'Grid that holds the carbon up', label: 'Sweet Air label' } } };
  function plainId(id) {
    for (const [re, lab] of HOUSE_WORDS) { const m = re.exec(id); if (!m) continue;
      const rest = id.slice(m[0].length).split('_').filter(Boolean).filter(w => !/^\d+$/.test(w)).map(w => w in PLACE_WORDS ? PLACE_WORDS[w] : w).filter(Boolean).join(' ').replace(/master bedroom (bath|closet)/, 'master $1');
      return rest ? lab + ' (' + rest + ')' : lab; }
    return capFirst(pretty(id));
  }
  function plainPart(pack, part) {
    const P = (INFO.packs && INFO.packs[pack]) || EXTRA_PACKS[pack] || {}; const L = P.labels || {};
    return L[part] || L[part.replace(/_\d+$/, '')] || capFirst(pretty(part));
  }
  function plainPack(pack) { const P = (INFO.packs && INFO.packs[pack]) || EXTRA_PACKS[pack] || {}; return P.name || capFirst(pretty(pack)); }
  // the page's own short messages, said the way a person would say them. The sources keep their wording (the self test and the
  // handles read those); this is only what reaches the bubble.
  const PHRASES = [[/^meter down$/i, 'Meter is put away.'], [/^pliers down$/i, 'Pliers are put away.'], [/^out of the drain$/i, 'And you are back out of the drain!'],
    [/^that did not work: /, 'Hmm, that did not work: '], [/: nothing to cut here$/, ': nothing to cut open on this one. Try a pipe or a tank!'],
    [/: that does not come off$/, ': that part stays put. Try a cover, a lid or a plug!'], [/: nothing here runs, the panel lists what does$/, ': nothing runs here. The panel up top shows what does!'],
    [/: elevation is for a placed fixture or unit$/, ': pick a fixture or a unit and I will stand you back for the full view.'],
    [/^eye height (\d+) in \(([\d.]+) m\)\. Let go and it holds there, hold again to go back the other way$/, 'Eye height $1 in. Let go and you stay right there. Hold again to go back the other way.'],
    [/^holding at (\d+) in\. Hold the button again to go back the other way, tap it for the presets$/, 'Holding at $1 in. Hold again to go the other way, or tap for stand, crouch and crawl.'],
    [/^end of the line: (.*)\. S rolls back, Esc gets out$/, 'End of the line: $1. S rolls you back, Esc hops out.'],
    [/^you are inside the (.*?)\. Drag to look round in here, S rolls back up the pipe, Esc gets out$/, 'You are inside the $1! Drag to look around, S rolls back up the pipe, Esc hops out.'],
    [/^ball: /, 'Riding the ball: ']];
  const TOUCH = 'ontouchstart' in window;
  function friendly(v) {
    let t = String(v == null ? '' : v); if (!t) return t;
    for (const [re, to] of PHRASES) t = t.replace(re, to);
    if (TOUCH) t = t.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap').replace(/\bdouble tap\b/g, 'double tap');
    let tail = '';
    t = t.replace(/\s*\[[a-z0-9_]+\]\s*$/i, '');                                            // the clip's own name
    t = t.replace(/\s*\(Run runs it\)/, () => { tail = ' Tap Run and watch it go!'; return ''; });
    t = t.replace(/\s*\(cut open(?:, \d+ parts sectioned)?\)/, () => { tail = ' You are looking inside it now. Tap it again to close it back up.'; return ''; });
    t = t.replace(/:?\s*cut open \(\d+ parts sectioned\)/, () => { tail = ' You are looking inside it now. Tap it again to close it back up.'; return ''; });
    t = t.replace(/[.\s]*\(click it again to work its parts; walking lets go\)/, '. Tap it again to work on it, or just walk away!').replace(/\(click again\)/, '(tap again)');
    const m = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*): ([a-z][a-z0-9_]*)\b/.exec(t);
    if (m && ((INFO.packs && INFO.packs[m[1]]) || EXTRA_PACKS[m[1]] || /_/.test(m[1]))) t = plainPack(m[1]) + ': ' + plainPart(m[1], m[2]) + t.slice(m[0].length);
    else { const m1 = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)+): /.exec(t); if (m1) t = plainPack(m1[1]) + ': ' + t.slice(m1[0].length); }
    t = t.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, id => plainId(id));                  // any name still left in it
    t = capFirst(t.trim()); if (tail && !/[.!?]$/.test(t)) t += '.';
    return t + tail;
  }
  { const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(labelEl, 'textContent', { configurable: true, get() { return d.get.call(this); }, set(v) { let f = v; try { f = friendly(v); } catch (e) { f = v; } d.set.call(this, f); } }); }
  const PACK_FLOWS = { kitchen_sink: ['faucet', 'disposal'], shower: ['tub'], 'little/washer': ['laundry'] };
  let panelFor = null, panelVerb = { key: null, verb: null };
  // Round 34 (Jake: "if I click the disposal and it makes a cutaway, it should say garbage disposal, run it; it needs to be very clear"):
  // every part and every clip is filed under the component it belongs to, by name, and the panel is one section per component with the
  // clicked one first and open. The unit's own things (elevation, the whole unit out, the wall) sit last under the unit's name.
  const COMPONENTS = [
    [/disposal|grind|turntable|splash_guard|flange_weep|mount_gap|cord_scorch/, 'Garbage disposal'], [/^faucet|sprayer|pulldown|aerator|cartridge|spout|diverter|^handle|escutcheon|mixing|shower_head|trim_plate|valve_body/, 'Faucet and valve'],
    [/^ro_|filter_housing|membrane|storage_tank/, 'RO system'], [/dishwasher|^dw_|air_gap/, 'Dishwasher line'], [/trap|tailpiece|waste_arm|waste_tee|slip_nut|p_trap|drain|standpipe|overflow|strainer|basket/, 'Drain and trap'],
    [/^stop|supply|angle_stop|braided|shutoff/, 'Supply stops'], [/door|drawer|cabinet|toe_kick|shelf|hinge/, 'Cabinet'], [/bowl|tank_lid|flush|flapper|fill_valve|float_cup|trip_lever|rim|jet|wax_ring|closet_bolt/, 'Toilet'],
    [/burner|flame|igniter|ignition|gas_valve|gas_|manifold|orifice|pilot|thermocouple/, 'Burner and gas'], [/fan|blower|venturi|inducer|motor|wheel/, 'Fan and blower'], [/heat_exchanger|^hx|flue|exhaust|intake|vent|collector|draft/, 'Heat exchanger and venting'],
    [/compressor|evap|coil|condens|refrigerant|lineset|txv|capacitor|contactor/, 'Refrigeration'], [/element|thermostat|high_limit|anode|dip_tube|t_?p_|relief|tp_/, 'Tank and elements'], [/float|pump|impeller|check_valve|discharge|riser|lid|splice|cord|uf_|zip_tie|grip/, 'Pump and float'],
    [/breaker|deadfront|panel_door|bus|neutral|ground_bar|main_|spd|surge/, 'Panel and breakers'], [/air_filter|filter|screen/, 'Filter'], [/display|control|board|pcb|wiring|harness|sensor|switch|stat_/, 'Controls'],
    [/cover|panel|shell|louver|cap$|jacket|housing|casing|access/, 'Covers and cabinet'], [/water|stream|bubbles|scum|sludge/, 'Water'], [/ladder|sec\d/, 'Ladder']];
  function componentOf(name, inst) { const n = String(name || ''); for (const [re, lab] of COMPONENTS) if (re.test(n)) return lab; return inst ? pretty(inst.userData.model) : 'House'; }
  const FLOW_OF_CLIP = { disposal_run: 'disposal', faucet_run: 'faucet', tub_on: 'tub', shower_on: 'tub', washer_run: 'laundry', wash: 'laundry' };
  // the panel's Run buttons run the water and the air the way the old Run tool did (round 34: they used to play the clip and nothing flowed)
  function runWithFlow(inst, o, name, on) {
    if (on && !powered(inst)) return noPower(inst);
    const d = playNamed(inst, name, on); if (!d) return null;
    const fk = fixtureKey(inst, name) || FLOW_OF_CLIP[name] || ((RUN_PREF.test(name) && o) ? flowKeyFor(o) : null);
    if (fk && !FIX_KEYS.has(fk)) { if (on) running.add(fk); else running.delete(fk); }     // round 64: a fixture's flow follows its clips (syncFixtureFlows)
    if (/^(fan_run|fire_up|run)$/.test(name) && /furnace|air_handler|package/.test(inst.userData.model || '')) { if (on) running.add('fan'); else running.delete('fan'); }
    showFlows(); refreshStreams(inst);
    return name + (on ? '' : ' (back)') + (fk ? (on ? '  ' + (FLOW_SETS[fk].say || FLOW_SETS[fk].label) : '  ' + (FLOW_SETS[fk].off || 'water off')) : '');
  }
  // Round 39 (Jake: "when they come over to the unit and start working on it, a question mark bubble hovers above the item; not a bunch
  // of random question marks all over the place"): a unit gets its bubble the first time its panel opens. The bubble follows the unit's
  // top in the view; a click on it opens what it is, how it works and what we check (checklists.json by pack, the pack text as a fallback).
  // Round 42 (Jake: "once another item is clicked the question mark goes away over the item before, you should only ever see one at a time";
  // "the question mark over the cabinet system is way up in the air; it should be over the garbage disposal individually"): one bubble, keyed
  // by the unit AND the component clicked (componentOf), over the top of that component's visible meshes, not the unit's whole box (which took
  // in the tall hidden context parts)
  let bubble = null;
  const CHECK_ALIAS = { garbage_disposal: 'disposal', faucet_and_valve: 'kitchen_sink', drain_and_trap: 'kitchen_sink', supply_stops: 'kitchen_sink', ro_system: 'water_filter' };
  function noteUnit(o) {
    const inst = o && o.userData.inst; if (!inst) return;
    const comp = componentOf(partName(o) || o.userData.label || '', inst); const key = inst.uuid + '|' + comp;
    if (bubble && bubble.key === key) return;
    if (bubble) bubble.el.remove();
    const wb = new T.Box3();
    inst.traverse(m => { if (m.isMesh && m.visible && componentOf(partName(m) || m.userData.label || '', inst) === comp) wb.expandByObject(m); });
    if (wb.isEmpty() || wb.getSize(new T.Vector3()).y > 1.4) wb.setFromObject(o);
    const el = document.createElement('div'); el.className = 'bubble'; el.textContent = '?'; el.title = comp + ': what it is and what we check';
    el.addEventListener('click', ev => { ev.stopPropagation(); aboutUnit(inst, comp); }); document.body.appendChild(el);
    bubble = { key, inst, comp, el, top: new T.Vector3((wb.min.x + wb.max.x) / 2, wb.max.y + 0.10, (wb.min.z + wb.max.z) / 2) };
  }
  const _bv = new T.Vector3();
  function stepBubbles() {
    const b = bubble; if (!b) return;
    if (!b.inst.visible || !b.inst.parent) { b.el.style.display = 'none'; return; }
    _bv.copy(b.top).project(camera); const behind = _bv.z > 1 || camera.position.distanceTo(b.top) > 14;
    if (behind || Math.abs(_bv.x) > 1.6 || Math.abs(_bv.y) > 2.5) { b.el.style.display = 'none'; return; }
    const bx = Math.max(-0.92, Math.min(0.92, _bv.x)), by = Math.max(-0.85, Math.min(0.88, _bv.y));     // close up, the top is over the frame: the bubble pins to the edge
    b.el.style.display = 'block'; b.el.style.left = ((bx + 1) / 2 * innerWidth) + 'px'; b.el.style.top = ((1 - by) / 2 * innerHeight) + 'px';
  }
  function aboutUnit(inst, comp) {
    const model = String(inst.userData.model || '').replace(/\.glb$/, '').replace(/^little\//, ''); const pack = inst.userData.pack || model;
    const ck = String(comp || '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    const cc = (ck && (CHECKS[ck] || CHECKS[CHECK_ALIAS[ck]])) || null;
    const c = cc || CHECKS[pack] || CHECKS[model] || CHECKS[model.replace(/_(inside|attic|wall|two_tank|overland.*|softener)$/, '')] || null;
    const P = (INFO && INFO.packs && (INFO.packs[pack] || INFO.packs[model])) || {};
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const unitName = pretty(P.name || pack);
    let h = '<div class="about"><h3>' + esc(cc ? comp + ' (' + unitName + ')' : unitName) + '</h3>';
    if (c) {
      h += '<p><b>What it is.</b> ' + esc(c.what) + '</p><p><b>How it works.</b> ' + esc(c.how) + '</p><p><b>What we check.</b></p><ul>' + c.checks.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    } else if (P.text) h += '<p>' + esc(P.text) + '</p>';
    else h += '<p>No notes for this unit yet.</p>';
    h += '<button id="about_close">close</button></div>';
    infoEl.innerHTML = h; infoEl.style.display = 'block'; panelFor = null;
    const cb = document.getElementById('about_close'); if (cb) cb.onclick = () => { infoEl.style.display = 'none'; };
  }
  function wireText(o) {
    if (!o) return null; const nm = partName(o) || '';
    if (o.userData.pack) { const pk = String(o.userData.pack).replace(/^little\//, '').replace(/\.glb$/, ''); for (const e of WIRES.parts) if (e.pack.test(pk) && e.part.test(nm)) return e.text; return null; }
    return WIRES.runs[base(o.name)] || (o.parent && WIRES.runs[base(o.parent.name)]) || null;
  }
  function openPanel(o, hit) {
    if (!infoEl) return; const inst = o.userData.inst; const nm = partName(o) || o.userData.label || base(o.name);
    noteUnit(o);
    const pack = o.userData.pack || (inst && inst.userData.model) || ''; const ext = (window.HOUSE_INFO && window.HOUSE_INFO.packs && window.HOUSE_INFO.packs[pack]) || {};
    const P = Object.assign({}, INFO.packs[pack] || {}, ext);
    const title = P.name || (inst ? pretty(inst.userData.model) : plainId(nm));
    const notes = [].concat((P.hotspots && P.hotspots[nm]) || [], (ext.hotspots && ext.hotspots[nm]) || []); const wt = wireText(o); if (wt) notes.unshift(wt);     // round 40: where the wire goes and why
    const acts = [];     // [label, fn, group]
    const mine = new Set(); for (let q = o; q && q !== inst; q = q.parent) mine.add(q.name);     // the clicked part and its node chain
    const state = (A, n) => !!(A && A.state[n] && A.state[n].open);
    if (inst) {
      const A = inst.userData.anim, S = inst.userData.sectionSet;
      const here = componentOf(nm, inst);
      if (S && S.pairs) { let any = null; inst.traverse(x => { if (!any && x.isMesh && S.pairs[partName(x)]) any = x; }); if (any) acts.push([inst.userData.sectionOpen ? 'Close it up' : 'Cut it open', () => sectionSet(any), here]); }     // any solid of the set, visible or swapped for its section
      else if (hasSection(o) || (allowed(o, 'cut'))) acts.push([cutPipes.has(o) ? 'Close it up' : 'Cut it open', () => pipeCutaway(o, hit), here]);
      if (A) for (const c of A.clips) {
        if (/_loop$/.test(c.name)) continue;
        // round 35 (Jake): the spray filter's cap does not lift off the pipe from the panel either, an unneeded feature; the whole unit comes out instead
        const nc = NO_CLIPS[(inst.userData.model || '').replace(/\.glb$/, '')]; if (nc && nc.test(c.name)) continue;
        const lab = (P.clips && P.clips[c.name]) || pretty(c.name); const on = state(A, c.name);
        const ownClip = c.tracks.some(t => mine.has(t.name.split('.')[0]));     // this clip moves the part you clicked
        const comp = ownClip ? here : componentOf(c.name, inst);
        if (/^breaker_/.test(c.name)) { const key = c.name.slice(8); if (BREAKER_LABEL[key]) acts.push([(breakers[key] ? 'Breaker OFF: ' : 'Breaker ON: ') + BREAKER_LABEL[key], () => setBreaker(inst, key, !breakers[key]), 'Panel and breakers']); continue; }
        if (CLIP_WORK.test(c.name)) acts.push([(on ? 'Stop it: ' : 'Run it: ') + lab, () => runWithFlow(inst, o, c.name, !on) || (lab + ': nothing ran'), comp]);
        else if (CLIP_REMOVE.test(c.name)) acts.push([(on ? 'Put back: ' : 'Take off: ') + lab, () => playNamed(inst, c.name, !on) && (lab + (on ? ' back' : ' off')), comp]);
        else acts.push([lab, () => playNamed(inst, c.name, !on) && lab, comp]);
      }
      const fks = [].concat(flowKeyFor(o) ? [flowKeyFor(o)] : [], PACK_FLOWS[pack] || []).filter((v, i, arr) => arr.indexOf(v) === i && !FIX_KEYS.has(v));     // round 64: a fixture's water has no switch of its own, its Run buttons are the switch
      const FLOW_COMP = { faucet: 'Faucet and valve', disposal: 'Garbage disposal', tub: 'Faucet and valve', laundry: 'Washer' };
      for (const fk of fks) acts.push([(running.has(fk) ? 'Water off: ' : 'Water on: ') + FLOW_SETS[fk].label, () => toggleFlow(fk), FLOW_COMP[fk] || here]);
      if (inst.userData.reveal) { let trig = null; inst.traverse(x => { if (!trig && x.isMesh && inst.userData.reveal.trigger.includes(partName(x))) trig = x; }); if (trig) acts.push([inst.userData.revealOpen ? 'Close the wall' : 'Open the wall', () => reveal(trig), 'unit']); }
      if (o.isMesh && !wholeOnly(o)) acts.push([held && held.obj === o ? 'Put it back' : 'Take it out', () => (held && held.obj === o) ? putBack() : takeApart(o), here]);     // round 30; round 35: not for the add ons, they come out whole
      if (o.isMesh) acts.push([held && held.obj === partRoot(o) && held.view ? 'Put it back' : 'View it', () => (held && held.obj === partRoot(o) && held.view) ? putBack() : viewPart(o), here]);     // round 39: fills the view at its real proportions
      acts.push([held && held.obj === inst ? 'Put the unit back' : 'Take the whole unit out', () => (held && held.obj === inst) ? putBack() : takeApart(o, true), 'unit']);     // round 31
      if (/attic_ladder/.test(inst.userData.model || '')) acts.push([ladderDown(inst) ? 'Climb the ladder' : 'Pull the ladder down', () => ladderDown(inst) ? ladderClimb(inst) : ladderAction(o, inst), 'Ladder']);
      acts.push(['Elevation', () => { const m = elevation(unitOf(o)); setTool('look'); return m; }, 'unit']);
      if (drainStartFor(o)) acts.push(['Ride the drain as a ball', () => startBall(o), 'unit']);     // round 43
      // Round 46 (Jake: "my add ons should be specific when I actually click the component, like the gas water heater, it should have a
      // place for me to add the expansion tank"): the add ons that belong to THIS unit, offered on the unit itself.
      const addonKeys = [];
      for (const k of Object.keys((inst.userData.pl && inst.userData.pl.addon) || {})) addonKeys.push(k);
      for (const [re_, keys] of UNIT_ADDONS) if (re_.test(inst.userData.model || '')) for (const k of keys) if (!addonKeys.includes(k)) addonKeys.push(k);
      for (const k of addonKeys) {
        const on = CONFIG[k] === 'yes'; const lab = (on ? 'Remove the ' : 'Add the ') + ADDON_NAME[k];
        acts.push([lab, async () => { CONFIG[k] = on ? 'no' : 'yes'; await reconfigure(); return ADDON_NAME[k] + ': ' + (CONFIG[k] === 'yes' ? 'in' : 'out'); }, 'Add ons']);
      }
      acts.push([blown && blown.inst === inst ? 'Put it together' : 'Take it apart (exploded view)', () => explodeUnit(inst), 'unit']);     // round 45
      if (/thermostat/.test(inst.userData.model || '')) {
        for (const [lab, key] of [['Set point up', 'up'], ['Set point down', 'down'], ['Mode: heat, cool, auto, off', 'mode'], ['Fan: auto or on', 'fan'], ['Hold the set point', 'hold'], ['Back on the schedule', 'run']])
          acts.push([lab, () => statControl(inst, key), 'Thermostat']);
      }
    } else {
      if (DRAINS[base(nm)] || DRAINS[nm]) acts.push(['Ride this drain as a ball', () => startBall(o, hit), 'This pipe']);     // round 43
      if (PIPEY.test(nm) && !NOT_CUT.test(nm)) acts.push([cutPipes.has(o) ? 'Close the pipe' : 'Cut the pipe open', () => pipeCutaway(o, hit), 'This pipe']);
      if (/^(pipe_dwv_sewer|pipe_dwv_building_drain|cleanout_dwv|pipe_dwv_effluent)/.test(nm)) acts.push([sysOn ? 'Water off' : (CONFIG.sewer.startsWith('city') ? 'Run water down the sewer' : 'Run water into the tank'), () => systemRun(), 'This pipe']);
      if (/^fix_hosebib_/.test(nm)) acts.push(['Hose bib on / off', () => hoseBib(o), 'Hose bib']);
      if (/^house_shutoff_valve/.test(nm)) acts.push(['House water on / off', () => shutoffValve(o), 'House shutoff']);
      if (/^lid_crawl_hatch/.test(nm)) acts.push([plugs.has(o) ? 'Put the hatch lid back' : 'Lift the hatch lid', () => lidOff(o), 'Crawl hatch']);
      if (/^lid_crawl_door/.test(nm)) acts.push([plugs.has(o) ? 'Put the door back' : 'Take the door off', () => lidOff(o), 'Crawl door']);     // the foundation crawl door (round 32 follow up)
    }
    panelFor = { o, hit };
    infoEl.innerHTML = '';
    const h = document.createElement('div'); h.className = 'ititle'; h.textContent = title; infoEl.appendChild(h);
    // Round 60 (Jake: "I clicked it, gas furnace, burner door. It doesn't need to say burner door. It just needs to say gas furnace, and
    // then what all I can do with it"). The part line is gone; the tab of the component you touched is the one that opens, which says it.
    // The close button sits in the title row now, so the panel can dock at the very top without a row of its own at the bottom.
    const xb = document.createElement('button'); xb.className = 'iclose'; xb.textContent = '×'; xb.title = 'close'; xb.onclick = () => { infoEl.style.display = 'none'; }; h.insertBefore(xb, h.firstChild);
    // Round 60 (Jake: "someone that built the app, like myself, I know where to go and what to do, but it's not very conducive to
    // someone being like, what's capable with this app? Can I see an elevation of something? Can I flush the toilet?"). Every unit
    // wears THE SAME verbs in THE SAME order: Use, Open, Cut away, Take apart, Elevation, About, and More for what is only on
    // this unit (add ons). A verb this unit has nothing for is dimmed, never missing, so after two units you know what the app
    // can do because the button is always in the same place. One thing under a verb: the verb does it. Several: they drop into
    // one row under it. Nothing closes when you use it, so they stack the way he said: "you could do a cutaway and then flush".
    // This replaces the round 45 tabs by component, whose shape changed from unit to unit. The notes live under About.
    const wire = (bar, lab, fn) => { const b = document.createElement('button'); b.textContent = lab; b.onclick = () => { let m = null; try { m = fn(); } catch (e) { m = 'that did not work: ' + e.message; } if (m === false) return;     // the about card has taken the panel over: do not draw the verbs back over it
      labelEl.textContent = typeof m === 'string' ? m : lab; labelEl.style.display = 'block'; openPanel(o, hit); }; bar.appendChild(b); };
    const verbOf = lab => {
      if (/^(Cut it open|Close it up|Cut the pipe open|Close the pipe)/.test(lab)) return 'cut';
      if (/^Elevation/.test(lab)) return 'elev';
      if (/^(Take it out|Put it back|Take the whole unit out|Put the unit back|Take it apart|Put it together)/.test(lab)) return 'apart';
      if (/^(View it|What it is)/.test(lab)) return 'about';
      if (/^(Add the|Remove the)/.test(lab)) return 'more';
      if (/^(Take off|Put back):|^(Open the wall|Close the wall|Lift the hatch|Put the hatch|Take the door off|Put the door back)/.test(lab)) return 'open';
      if (/^(Run it|Stop it|Water on|Water off|Breaker|Ride|Run water|Hose bib|House water|Climb|Pull the ladder|Set point|Mode:|Fan:|Hold the|Back on)/.test(lab)) return 'use';
      return /door|lid|cover|cap\b|panel|access|filter|drawer|hatch|\boff\b/i.test(lab) ? 'open' : 'use';
    };
    if (inst) acts.push(['What it is and what we check', () => { aboutUnit(inst, componentOf(nm, inst)); return false; }, 'unit']);
    const VERBS = [['use', 'Use'], ['open', 'Open'], ['cut', 'Cut away'], ['apart', 'Take apart'], ['elev', 'Elevation'], ['about', 'About'], ['more', 'More']];
    const byVerb = {}; for (const [v] of VERBS) byVerb[v] = [];
    for (const [lab, fn] of acts) byVerb[verbOf(lab)].push([lab, fn]);
    let any = acts.length;
    const unitKey = inst ? inst.uuid : nm;
    if (panelVerb.key !== unitKey) panelVerb = { key: unitKey, verb: null };
    const bar = document.createElement('div'); bar.className = 'itabs iverbs'; infoEl.appendChild(bar);
    const body = document.createElement('div'); infoEl.appendChild(body);
    const short = t => t.replace(/^(Run it|Stop it|Water on|Water off|Take off|Put back): /, m => (/^(Stop|Water off|Put back)/.test(m) ? m.replace(': ', ' ') : '')).replace(/^./, c => c.toUpperCase());
    for (const [v, word] of VERBS) {
      const list = byVerb[v]; if (v === 'more' && !list.length) continue;
      const b = document.createElement('button'); b.className = 'itab'; b.disabled = !list.length;
      // a verb with exactly one thing under it says the thing: Flush, not Use
      b.textContent = (list.length === 1 && (v === 'use' || v === 'open')) ? short(list[0][0]).slice(0, 26) : word;
      if (panelVerb.verb === v && list.length > 1) b.classList.add('on');
      b.onclick = () => {
        if (list.length === 1 && v !== 'about') { panelVerb.verb = null; let m = null; try { m = list[0][1](); } catch (e) { m = 'that did not work: ' + e.message; } if (typeof m === 'string') { labelEl.textContent = m; labelEl.style.display = 'block'; } if (v !== 'elev') openPanel(o, hit); return; }
        panelVerb.verb = panelVerb.verb === v ? null : v; openPanel(o, hit);
      };
      bar.appendChild(b);
    }
    if (panelVerb.verb && byVerb[panelVerb.verb] && (byVerb[panelVerb.verb].length > 1 || panelVerb.verb === 'about')) {
      if (panelVerb.verb === 'about') for (const t of notes.concat(P.text ? [P.text] : [])) { const d = document.createElement('div'); d.className = 'inote'; d.textContent = t; body.appendChild(d); }
      const row = document.createElement('div'); row.className = 'iacts'; for (const [lab, fn] of byVerb[panelVerb.verb]) wire(row, lab, fn); body.appendChild(row);
    }
    if (!any) { const d = document.createElement('div'); d.className = 'inote'; d.textContent = 'Nothing to open or run on this one. Try tapping a cover, a handle, a pipe, or the whole unit!'; infoEl.appendChild(d); }
    infoEl.style.display = 'block';
  }
  // Round 28 self test (Jake: 'do a full comb through of the entire app, make sure all the clicks are actually working'): every part the
  // interaction table lists gets its Look action run for real, and every unit gets Run; the report says what answered with nothing.
  async function selfTestAll() { await loadAll(); return selfTest(); }     // round 44: the sweep wants every model loaded
  function selfTest() {
    const out = [];
    equip.children.forEach(inst => {
      const T_ = (INTER && INTER.models[inst.userData.model]) || {}; const seen = new Set();
      inst.traverse(o => { if (!o.isMesh || !o.visible) return; const p = partName(o); const e = T_[p]; if (!e || !e.look || seen.has(p)) return; seen.add(p);
        let r = null, err = null; try { r = lookAction(o, null); } catch (x) { err = String(x); }
        const moved = r && !/^([^:]*: )?[a-z0-9_ /.]+( \(Run runs it\))?$/.test(r);
        out.push({ model: inst.userData.model, part: p, look: e.look, result: r, ok: !!(moved && !err), err }); });
      const c = unitRunClip(inst); out.push({ model: inst.userData.model, part: '(unit run)', look: 'run', result: c ? c.name : null, ok: !!c });
    });
    return out;
  }
  function actionOf(o) { const inst = o.userData.inst; if (!inst || !INTER) return null; const T = INTER.models[inst.userData.model]; return (T && T[partName(o)]) || null; }
  function allowed(o, kind) {
    const a = actionOf(o); if (!a || !a.look) return false;
    if (kind === 'remove') return /^clip:|^aside$/.test(a.look);
    if (kind === 'cut') return a.look === 'section' || a.look === 'cut';
    if (kind === 'control') return /^clip:|^control$/.test(a.look);
    if (kind === 'pull') return a.look === 'pull';
    return false;
  }
  async function loadPlacements() {
    placements = await (await fetch('./placements.json' + CB)).json();
    try { EXPLODE = await (await fetch('./explode.json' + CB)).json(); } catch (e) { EXPLODE = {}; }
    try { GRAB = await (await fetch('./grab.json' + CB)).json(); } catch (e) { GRAB = {}; }     // round 52: what the pliers can take hold of, and what has to be dead first
    try { INTER = await (await fetch('./interactions.json' + CB)).json(); } catch (e) { console.warn('no interactions.json: only pipes cut'); INTER = { models: {} }; }
    try { INFO = await (await fetch('./info.json' + CB)).json(); } catch (e) { INFO = { packs: {} }; }
    try { CHECKS = (await (await fetch('./checklists.json' + CB)).json()).packs || {}; } catch (e) { CHECKS = {}; }     // round 39: what it is, how it works, what we check     // cache busted like the models: a stale placements file hid a new key for a whole test (round 19)
    queuePlacements(placements.placements.filter(wants));
    status.textContent = 'placing what is in reach'; await placeNearest(6);
    pumpsOnByDefault();
  }
  // Round 22 (Jake: 'the air pumps on the septics should start in the on position'): a plant with an aerate clip runs it from the start
  function pumpsOnByDefault() { let has = false; equip.children.forEach(u => { const A = u.userData.anim; if (A && A.clips.some(c => c.name === 'aerate')) has = true; }); if (has && !pumpOn) pumpSwitch(); }
  // ---------------------------------------------------------------- pipes
  async function loadPipes() {
    try { pipesMeta = await (await fetch('./pipes.json' + CB)).json(); Object.assign(labels, pipesMeta.labels || {}); } catch (e) { }
    // round 40 (Jake: "click wires and it says where they are going and why"): wires.json, house runs by name (they override the pipe
    // labels) and model parts by pack and part regex
    try { DRAINS = ((await (await fetch('./drains.json' + CB)).json()).runs) || {}; } catch (e) { DRAINS = {}; }     // round 43: the ball's routes
    try { const W = await (await fetch('./wires.json' + CB)).json(); WIRES = { runs: W.runs || {}, parts: (W.parts || []).map(e => ({ pack: new RegExp(e.pack), part: new RegExp(e.part), text: e.text })) }; Object.assign(labels, WIRES.runs); } catch (e) { }
    for (const f of PIPE_FILES) {
      status.textContent = 'loading ' + f; const g = await load('./' + f + '.glb'); g.scene.name = f; pipes.add(g.scene); layers[f] = g.scene; tuneMaterials(g.scene);
      stampParts(g, g.scene);
      g.scene.traverse(o => { if (o.isMesh && /_stream$/.test(nodeName(o))) { o.visible = false; o.userData.isStream = true; } });     // hose bib water starts off
      g.scene.traverse(o => { if (o.isMesh && /_lint$/.test(nodeName(o))) { o.visible = false; o.userData.placeHidden = true; } });     // the dryer duct's packed lint is a fault variant: Blender's hide never reached the page, so a cut duct showed it
      // The water inside the pipes. build_pipes.py puts a thinner column on the same path as the run, one for clean
      // water and one for waste, and hangs the path on it as an extra. They start off; a fixture turns them on.
      g.scene.traverse(o => {
        if (!o.isMesh || !/^flow_/.test(nodeName(o))) return;
        o.visible = false;
        const m = nodeName(o).match(/^flow_(water|waste|air)_(.+)$/); if (!m) return;
        let src = o, raw = null;
        while (src && !raw) { if (src.userData && src.userData.flow_path) raw = src.userData.flow_path; src = src.parent; }
        let path = [];
        try { path = JSON.parse(raw).map(q => new T.Vector3(q[0], q[2], -q[1])); } catch (e) { }     // blender (x, y, z) is gltf (x, z, -y)
        flows.push({ obj: o, kind: m[1], run: m[2], path: path });
      });
      g.scene.traverse(o => { if (o.isMesh) { o.userData.label = labels[base(o.name)] || (o.parent && labels[base(o.parent.name)]) || base(o.name); o.userData.layer = f; } });
      // carry the layout tag down from the glTF extras onto every mesh of the run, so filtering is one pass
      g.scene.traverse(o => { let p = o, c; while (p && c === undefined) { c = p.userData && p.userData.config; p = p.parent; } if (c !== undefined) o.userData.config = c; });
    }
  }
  // ---------------------------------------------------------------- controls
  const keys = {}; let yaw = 0, pitch = 0, locked = false, fly = false; const EYE = 1.6; let eye = EYE;     // eye drops when you crouch (C) or when a roof or ceiling is in the way (attic eaves)
  const pos = new T.Vector3(0, EYE, -1.0);
  const KEYMAP = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
  document.addEventListener('keydown', e => { keys[KEYMAP[e.code] || e.code] = true; if (KEYMAP[e.code]) e.preventDefault();
    if (e.code === 'Escape' && elev) { const m = elevation(); labelEl.textContent = m; labelEl.style.display = 'block'; }
    if (e.code === 'Escape' && held && held.view) { const m = putBack(); labelEl.textContent = m; labelEl.style.display = 'block'; }     // round 39: Esc puts a viewed part back
    if (e.code === 'Escape' && ball) endBall();     // round 43: out of the drain
    if (e.code === 'Escape' && blown) { const m = unexplode(); labelEl.textContent = m; labelEl.style.display = 'block'; }     // round 45: it goes back together
    if (e.code === 'Escape' && meter) { meterDown(); labelEl.textContent = 'meter down'; labelEl.style.display = 'block'; }     // round 48: you can put it down
    if (e.code === 'Escape' && pliers) { pliersDown(); labelEl.textContent = 'pliers down'; labelEl.style.display = 'block'; }     // round 52
    if (e.code === 'KeyR' && meter) { const m = meterPull(); labelEl.textContent = m; labelEl.style.display = 'block'; }
    if (e.code === 'KeyC' && !e.repeat && !fly) { holdT = setTimeout(() => { holdT = null; eyeHoldStart(); }, 220); }     // round 52: tap C for the presets, hold C to ride the height
    if (e.code === 'KeyE' && !e.repeat) { if (elev) { const m = elevation(); labelEl.textContent = m; labelEl.style.display = 'block'; } else setTool('elevation'); }
    const tk = { Digit1: 'look', Digit2: 'elevation', Digit3: 'work', Digit4: 'apart' }[e.code]; if (tk && !e.repeat) setTool(tk); }); document.addEventListener('keyup', e => { keys[KEYMAP[e.code] || e.code] = false;
    // round 52: a tap on C steps the presets, a hold rides the eye height and stops where you let go
    if (e.code === 'KeyC') { if (holdT) { clearTimeout(holdT); holdT = null; if (!fly) crouchStep(); } else eyeHoldStop(); } });
  // In the elevation viewer the pointer is free: drag to turn round the unit, click to work a part under the mouse.
  let drag = null, dragged = false, pickNDC = null, corrT = null;
  // Round 60 (Jake, on his phone: the pad's side to side "isn't a turn motion... I just zoom left to right really fast", while the
  // drag to look "seems a little laggy... those feel like they should be reversed"). Two things a page around this one can set:
  // a turn rate in radians a second (positive turns you right), which the app's thumb stick uses for its left and right instead of
  // pressing A and D, and a multiplier on how far a drag turns the view, which the app raises on a touch screen.
  let turnRate = 0, lookScale = 1;
  // Round 33 (Jake: "I walk with W, and I click and drag over the screen to look; when I let go of the mouse I can pop over to my tool
  // list without hitting Escape"). No pointer lock any more: drag on the view turns you, let go and the mouse is free; a click that did
  // not drag picks what is under the cursor. The same drag orbits in an elevation.
  renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }; });
  document.addEventListener('mouseup', e => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved) { if (elev && elev.orbit) elevCorridor(); return; }
    if (e.target !== renderer.domElement) return;
    pickNDC = new T.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); pick(); });
  renderer.domElement.addEventListener('dblclick', e => {     // round 39: double click views the part under the cursor
    if (ball) { ball.note = 5.0; labelEl.textContent = ballWhere(); labelEl.style.display = 'block'; return; }     // round 45: riding the ball, it says where you are instead
    pickNDC = new T.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(pickNDC, camera); ray.far = 6; pickNDC = null;
    const hits = ray.intersectObjects([...equip.children, ...pipes.children], true).filter(h => h.object.visible && h.object.isMesh);
    if (!hits.length) return; if (held) putBack();
    const m = viewPart(hits[0].object); labelEl.textContent = m; labelEl.style.display = 'block'; noteUnit(hits[0].object);
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
    const k = ((elev && elev.orbit) ? 0.005 : 0.004) * lookScale; const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;     // the cursor's own delta, not movementX: it is the same for every browser and for a scripted test
    if (ball) {
      ball.ly -= dx * k * 1.6; ball.lp -= dy * k * 1.6;
      ball.ly = Math.max(-2.4, Math.min(2.4, ball.ly)); ball.lp = Math.max(-1.2, Math.min(1.2, ball.lp)); return;
    }
    yaw -= dx * k; pitch -= dy * k; pitch = Math.max(-1.45, Math.min(1.45, pitch)); });
  const ray = new T.Raycaster(); const down = new T.Vector3(0, -1, 0);
  const up = new T.Vector3(0, 1, 0); const overhead = [];
  function headroomAt(p) {
    ray.set(new T.Vector3(p.x, p.y - eye + 0.3, p.z), up); ray.far = 3; const hits = ray.intersectObjects(overhead, false);
    return hits.length ? hits[0].distance + 0.3 : 9;
  }
  function groundAt(p) {
    // cast from knee height, not above the head: a door header (80 in) or a cabinet top under the eye line used to catch the ray and lift the player onto it
    // round 32 follow up: a downward face only counts at foot level; the underside of a door header over a crawl opening used to read as ground and lift you onto it
    // crouched you step up 30 cm, not 50: the house floor over the crawl door is 45 cm up
    const feet = p.y - eye; ray.set(new T.Vector3(p.x, feet + (crawlOn ? 0.3 : (crouchOn ? 0.32 : 0.5)), p.z), down); ray.far = 4; const hits = ray.intersectObjects(floors, false).filter(h => !h.face || h.face.normal.y > 0.3 || (h.face.normal.y < -0.3 && h.point.y <= feet + 0.05));
    return hits.length ? hits[0].point.y : null;
  }
  function blocked(from, dir) {
    // The low ray is at STEP_UP, not at knee height. At 0.35 anything taller than a kerb stopped you dead: you could
    // open the garage door into the laundry, walk up to the threshold and never get in, because the floor edge is
    // 43 cm above the garage slab and the ray hit it (Jake 2026-09-11). Ignoring anything under half a metre lets you
    // climb a step, and groundAt lifts you onto whatever you climbed. A wall still blocks; it goes to the ceiling.
    const STEP_UP = crawlOn ? 0.30 : (crouchOn ? 0.32 : 0.50);     // round 32 follow up: crouched, the step ray drops to knee height, so a 16 in crawl door opening at grade lets you through
    for (const h of [STEP_UP, Math.min(1.2, eye - 0.2)]) { ray.set(new T.Vector3(from.x, from.y - eye + h, from.z), dir); ray.far = 0.45; if (ray.intersectObjects(colliders, false).length) return true; }
    return false;
  }
  let last = performance.now();
  let lightT = 0;
  function step() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (ball) { ballStep(dt); stepDoors(dt); for (const m of mixers) m.update(dt); stepExplode(dt); stepAim(); renderer.render(scene, camera); requestAnimationFrame(step); return; }     // round 43: inside the drain
    const speed = (keys.ShiftLeft || keys.ShiftRight ? 5.5 : 2.6) * dt * (crawlOn ? 0.5 : 1);
    // Round 60 (Jake, on his phone: "I push to the left, it pushes me to the right"). The thumb stick was pressing the right keys. THIS
    // was mirrored: at yaw 0 you face -z and your right hand is +x, and (fwd.z, 0, -fwd.x) comes out as -x. So A and D and the
    // left and right arrows have always strafed the wrong way; on a keyboard you steer with W and the mouse, so nobody met it.
    // Measured before the fix: D held from x 0 went to x -0.79 with the camera's own right at +1.
    const fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new T.Vector3(-fwd.z, 0, fwd.x);
    if (turnRate && !(elev && elev.orbit)) { yaw -= turnRate * dt; glide = null; }     // round 60: the thumb stick turning you; it takes a glide back, like walking does
    if (glide && stepGlide(dt)) { /* round 60: the glide to a unit owns where you stand and where you look until it lands */ }
    else if (elev && elev.orbit) orbitStep(speed); else {
    const mv = new T.Vector3();
    if (keys.KeyW) mv.add(fwd); if (keys.KeyS) mv.sub(fwd); if (keys.KeyD) mv.add(right); if (keys.KeyA) mv.sub(right);
    if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(speed); const dir = mv.clone().normalize(); if (fly || !blocked(pos, dir)) pos.add(mv); else { const dx = new T.Vector3(mv.x, 0, 0), dz = new T.Vector3(0, 0, mv.z); if (dx.lengthSq() && !blocked(pos, dx.clone().normalize())) pos.add(dx); else if (dz.lengthSq() && !blocked(pos, dz.clone().normalize())) pos.add(dz); } }
    // round 60: the eye height a unit was framed at lets go once you have walked a metre off the spot (only if it is still the glide's own)
    if (glideEye !== null && atSpot && Math.hypot(pos.x - atSpot.x, pos.z - atSpot.z) > 1.0) { if (freeEye === glideEye) { freeEye = null; crouchLabel(); } glideEye = null; atUnit = null; }
    if (fly) { if (keys.Space) pos.y += speed; if (keys.KeyC) pos.y -= speed; }
    else {
      // C or Crouch: right down under a sink base. Half crouch: chest height, for reading a valve or a nameplate. Then duck
      // under the eaves and the roof. The ducking was dead: it sat on the same line as the crouch comment, so the comment
      // ate it (the same trap tools/lintlines.py catches in the Python).
      let want = freeEye !== null ? freeEye : (crawlOn ? 0.30 : (crouchOn ? 0.55 : (halfOn ? 1.05 : EYE)));
      // round 52: while the Crouch button is held down the height runs on its own, and it stops where you let go
      if (eyeRamp) { freeEye = Math.max(0.28, Math.min(EYE, (freeEye === null ? eye : freeEye) + eyeRamp * dt * 0.75)); want = freeEye; showEye(); }
      const room = headroomAt(pos); if (room < want + 0.15) want = Math.max(0.30, room - 0.15);     // round 32 follow up: 35 cm, the crawl under the joists is 49 cm
      eye += (want - eye) * Math.min(1, dt * 8);
      const g = groundAt(pos); if (g !== null) pos.y += (g + eye - pos.y) * Math.min(1, dt * 12);
    }
    }
    if (held && !held.view) held.pivot.rotation.y += dt * 0.7;
    stepBubbles(); stepCanMarks();
    stepDoors(dt); for (const m of mixers) m.update(dt);
    stepPlacements(dt);     // round 44: the next model, when you are near it or looking at it
    stepExplode(dt);        // round 45: the exploded view coming apart or going back together
    if (meter && leadLines.length) meterLeads();     // round 47: the leads stay in your hand as you move
    if (grabMarks.length) grabMarkFace();     // round 54: the rings turn to face you
    stepFlow(dt);
    if ((lightT -= dt) <= 0) { lightT = 0.2; updateLights(); }     // which fixtures are nearest only changes as you walk, so five times a second is plenty
 camera.position.copy(pos); camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch);
    renderer.render(scene, camera);
    if ((held && held.view) || meterObj || pliers) {     // round 39: the viewed part and its card draw in a second pass over a cleared depth, so a wall or a door 30 cm off never hides them; round 49: the meter in your hand too, it was sinking into whatever you stood at
      const bg = scene.background; scene.background = null;     // a Color background forces a colour clear on every render, which wiped the first pass
      renderer.autoClear = false; renderer.clearDepth(); camera.layers.set(1); renderer.render(scene, camera); camera.layers.set(0); renderer.autoClear = true; scene.background = bg;
    }
    requestAnimationFrame(step);
  }
  // ---------------------------------------------------------------- the working view (round 60, Jake)
  // "Click on a toilet as a UNIT, then click on other things if you need to. If I click from far away it needs to drag me and
  // center me on the best way to look at the item." Two steps. A click on a unit you are NOT at glides you to a square, centred
  // view of it and does nothing else. A click on a unit you ARE at works its parts, the way it always has, and never moves you.
  // Walking, or dragging the view, takes it back at once. This was worked out and tested against the real house in the app's old
  // engine (viewer/gototest.html); it lives here now so the walk page and the app both get it. The three rules that were only
  // found by rendering the real house, and that make it land right:
  //   1. the sight line is tested to a point 15 cm OUT from the chosen face, not to the unit's centre: a sink base's centre is
  //      inside its own counter height collision block, so a line to the centre "hit a wall" from all four sides;
  //   2. a standing spot only counts if the floor there is at or below the unit's base, or the floor search finds a counter top;
  //   3. the spot must be in the unit's OWN room (the smallest room_ marker over its centre), or a doorway that lines up with
  //      the sight line puts you in the bedroom next door; and it steps in 15 cm at a time until it fits, because a small bath is
  //      narrower than the distance that frames a 2 m vanity.
  let glide = null, atUnit = null, atSpot = null, glideEye = null, unitRooms = null;
  function roomAt(x, z) {
    if (!unitRooms) { unitRooms = {}; house.updateMatrixWorld(true); house.traverse(o => { if (o.isMesh && o.name.startsWith('room_') && !unitRooms[o.name]) unitRooms[o.name] = new T.Box3().setFromObject(o); }); }
    let best = null, area = Infinity;
    for (const k in unitRooms) { const b = unitRooms[k];
      if (x < b.min.x - 0.05 || x > b.max.x + 0.05 || z < b.min.z - 0.05 || z > b.max.z + 0.05) continue;
      const a = (b.max.x - b.min.x) * (b.max.z - b.min.z); if (a < area) { area = a; best = k; } }
    return best;
  }
  function shownInTree(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  function workBox(u) {
    const b = new T.Box3(); u.updateWorldMatrix(true, true);
    u.traverse(o => { if (o.isMesh && o.geometry && shownInTree(o) && !o.userData.isStream && !isGround(o)) b.expandByObject(o); });
    return b;
  }
  function floorBelow(x, z, fromY) {
    ray.set(new T.Vector3(x, fromY, z), down); ray.far = 4;
    for (const h of ray.intersectObjects(floors, false)) { if (h.face && h.face.normal.y < 0.3) continue; return h.point.y; }
    return null;
  }
  function clearLine(a, b) {
    const d = new T.Vector3().subVectors(b, a), len = d.length(); if (len < 1e-4) return true;
    ray.set(a, d.divideScalar(len)); ray.far = Math.max(0, len - 0.05);
    return ray.intersectObjects(colliders, false).filter(h => h.object.visible !== false || h.object.name.startsWith('col_')).length === 0;
  }
  function nearUnit(u) {
    if (atUnit === u && atSpot && Math.hypot(pos.x - atSpot.x, pos.z - atSpot.z) < 0.8) return true;
    const b = workBox(u); if (b.isEmpty()) return true;
    const dx = Math.max(b.min.x - pos.x, 0, pos.x - b.max.x), dz = Math.max(b.min.z - pos.z, 0, pos.z - b.max.z);
    return Math.hypot(dx, dz) < 1.5;
  }
  function goToUnit(u) {
    const box = workBox(u); if (box.isEmpty()) return null;
    const c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const vfov = camera.fov * Math.PI / 180;
    const fit = (Math.max(size.y, size.x * 0.6, size.z * 0.6) * 0.62) / Math.tan(vfov / 2);
    const back = Math.max(0.75, Math.min(3.2, fit));
    const q = u.getWorldQuaternion(new T.Quaternion());
    const sides = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]].map(a => { const v = new T.Vector3(a[0], a[1], a[2]).applyQuaternion(q); v.y = 0; return v.normalize(); });
    const toMe = new T.Vector3(pos.x - c.x, 0, pos.z - c.z); if (toMe.lengthSq() > 1e-6) toMe.normalize();
    const room = roomAt(c.x, c.z); let best = null;
    // Round 71 (Jake, under the house: "I can't see the furnace from here because I can't stand up. I'm still crawling and it makes me go
    // underneath the house"). A unit behind a closed closet door has no place to stand in its own room and no clear line from the next one,
    // so this only turned you to face it and left you where you were, which for him was the crawl space. A second pass takes the first
    // spot on the unit's own FLOOR that is in front of it, whatever room it is in and whatever door is shut in between: you land on the
    // hall floor looking at the closet door, standing, and open it.
    for (const pass of [0, 1]) {
    if (best) break;
    if (pass) {     // the door's own approach mark first: the nearest wp_approach_* within 2.5 m of the unit, on the unit's floor
      let bw = null; for (const wn in waypoints) { if (!/^wp_approach_/.test(wn)) continue; const wp_ = waypoints[wn].getWorldPosition(new T.Vector3()); const dd = Math.hypot(wp_.x - c.x, wp_.z - c.z);
        if (dd > 2.5 || (bw && dd >= bw.dd)) continue; const gr = floorBelow(wp_.x, wp_.z, c.y + 1.2); if (gr === null || gr > box.min.y + 0.15 || gr < box.min.y - 1.0) continue; bw = { dd, px: wp_.x, pz: wp_.z, ground: gr }; }
      if (bw) { best = { px: bw.px, pz: bw.pz, ground: bw.ground, ey: EYE, score: 1 }; break; }
    }
    for (let i = 0; i < 4; i++) {
      const n = sides[i], half = Math.abs(n.x) * size.x * 0.5 + Math.abs(n.z) * size.z * 0.5;
      for (let st = pass ? Math.max(back, 1.3) : back; st >= 0.55; st -= 0.15) {
        const px = c.x + n.x * (half + st), pz = c.z + n.z * (half + st);
        if (!pass && room && roomAt(px, pz) !== room) continue;
        if (pass && (!roomAt(px, pz) || roomAt(px, pz) === room)) continue;
        const ground = floorBelow(px, pz, c.y + 1.2);
        if (ground === null || ground > box.min.y + 0.15 || ground < box.min.y - 1.0) continue;
        const ey = Math.max(0.55, Math.min(EYE, c.y - ground + 0.35));
        const from = new T.Vector3(px, ground + ey, pz), face = new T.Vector3(c.x + n.x * (half + 0.15), c.y, c.z + n.z * (half + 0.15));
        if (!pass && !clearLine(from, face)) continue;
        const score = (pass ? 0 : n.dot(toMe)) + (i === 0 ? 0.25 : 0) + 0.2 * (st / back);
        if (!best || score > best.score) best = { px, pz, ground, ey, score };
        break;
      }
    }
    }
    // nowhere to stand that frames it (a unit in a chase, or out in the open with no room marker and a fence round it): turn to it
    const tx = best ? best.px : pos.x, tz = best ? best.pz : pos.z, ty = best ? best.ground + best.ey : pos.y;
    const dx = c.x - tx, dz = c.z - tz; const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.max(-1.2, Math.min(1.2, Math.atan2(c.y - ty, Math.hypot(dx, dz))));
    let dy = (wantYaw - yaw) % (2 * Math.PI); if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;     // the short way round
    const dist = Math.hypot(tx - pos.x, tz - pos.z);
    glide = { u, from: pos.clone(), to: new T.Vector3(tx, ty, tz), yaw0: yaw, yaw1: yaw + dy, pitch0: pitch, pitch1: wantPitch, t: 0, dur: Math.min(1.0, 0.35 + 0.08 * dist), ey: best ? best.ey : null };
    return best ? 'going to it' : 'no clear place to stand in front of it: turned to face it';
  }
  function stepGlide(dt) {
    // walking or a drag on the view takes it back at once, wherever the glide has got to
    if (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || (drag && drag.moved)) { glide = null; return false; }
    const g = glide; g.t = Math.min(1, g.t + dt / g.dur); const k = g.t * g.t * (3 - 2 * g.t);
    pos.lerpVectors(g.from, g.to, k); yaw = g.yaw0 + (g.yaw1 - g.yaw0) * k; pitch = g.pitch0 + (g.pitch1 - g.pitch0) * k;
    if (g.t >= 1) {
      atUnit = g.u; atSpot = g.to.clone(); glide = null;
      // the eye height the unit was framed at HOLDS (it is the free height the Crouch button already has), until you walk off
      if (g.ey !== null) { crouchOn = halfOn = crawlOn = false; eye = g.ey; freeEye = g.ey < EYE - 0.02 ? g.ey : null; glideEye = freeEye; crouchLabel(); }
    }
    return true;
  }
  function goTo(name) {
    let p = null;
    if (name === 'yard') p = new T.Vector3(-7.5, 0, -7.0); else if (waypoints[name]) { p = new T.Vector3(); waypoints[name].getWorldPosition(p); }
    if (!p) return; pos.set(p.x, p.y + EYE, p.z); yaw = name === 'yard' ? Math.PI * 0.5 : yaw;
  }
  // ---------------------------------------------------------------- picking and UI
  // cutaways: every model carries <part>_section meshes (hidden by the fault patterns); clicking the solid part swaps it for its section, clicking the section swaps back
  function toggleCutaway(o) {
    const inst = o.userData.inst; if (!inst) return null; const lbl = nodeName(o);
    if (/handle|lever|knob|switch|button|door|lid|cover|_off$/.test(lbl)) return null;     // things you operate keep their clips
    const setVis = (name, v) => { let n = 0; inst.traverse(x => { if (x.isMesh && nodeName(x) === name) { x.visible = v; n++; } }); return n; };
    if (lbl.endsWith('_section')) { const solid = o.userData.solidFor || lbl.slice(0, -8); if (setVis(solid, true)) { setVis(lbl, false); return solid + ' (back to solid)'; } return null; }
    let sec = lbl + '_section'; let have = false; inst.traverse(x => { if (x.isMesh && nodeName(x) === sec) have = true; });
    if (!have) { const m = lbl.match(/^(.*?)_(body|shell|housing|case|cabinet)$/); if (m) { sec = m[1] + '_section'; inst.traverse(x => { if (x.isMesh && nodeName(x) === sec) have = true; }); } }
    if (!have) return null;
    setVis(lbl, false); setVis(sec, true); inst.traverse(x => { if (x.isMesh && nodeName(x) === sec) x.userData.solidFor = lbl; }); return lbl + ' cutaway';
  }
  // equipment covers: a click on a mesh that an animation clip moves (or whose parent it moves) plays that clip; click again to run it back
  // the septic control panel: a click inside the open panel is the pump switch; it runs the plant's pump clip and every spray head, and shows the spray patterns
  let pumpOn = false;
  // The BLOWER and the SPRAY PUMP are two machines. They used to share one switch, so turning the air on set the
  // sprinklers going in the yard (Jake 2026-09-12: "the sprayer should not come on at the same time, that's crazy").
  // The blower runs all day; the pump doses when the float calls for it.
  function runClips(names, on, show) {
    equip.children.forEach(inst => {
      const A = inst.userData.anim; if (!A) return;
      for (const clip of A.clips) {
        if (!names.includes(clip.name)) continue;
        const act = A.mixer.clipAction(clip); act.loop = T.LoopRepeat; act.clampWhenFinished = false;
        if (on) { act.reset(); act.timeScale = 1; act.play(); } else act.stop();
      }
      inst.traverse(o => { if (o.isMesh && (show.includes(nodeName(o)) || show.includes(partName(o)))) o.visible = on && !o.userData.placeHidden; });     // the Lee plant's own 30 ft spray discs are hidden by its placement, and the spray switch used to put them back over the yard
    });
  }
  function pumpSwitch() {     // the air pump: bubbles in the aeration chamber, the water working with them, the air lift spurting
    if (!pumpOn && !breakers.septic) return 'Air pump: no power, the SEPTIC breaker in the load centre is off';
    pumpOn = !pumpOn;
    runClips(['aerate'], pumpOn, ['bubbles', 'mix_arrows', 'airlift_spurt']);
    return 'Air pump ' + (pumpOn ? 'ON: aerating' : 'OFF');
  }
  let sprayOn = false;
  // one shot of a clip in every placed model, forward to switch on, back to switch off (the panel's HOA dial)
  function turnOnce(name, on) {
    equip.children.forEach(inst => {
      const A = inst.userData.anim; if (!A) return; const c = A.clips.find(x => x.name === name); if (!c) return;
      const act = A.mixer.clipAction(c); act.loop = T.LoopOnce; act.clampWhenFinished = true; act.enabled = true; act.paused = false;
      if (on) { act.reset(); act.timeScale = 1; act.play(); } else { act.timeScale = -1; if (act.time <= 0 || act.time >= c.duration - 1e-3) act.time = c.duration; act.play(); }
    });
  }
  // Is there a control panel in this yard, and what does its HOA look like? The septic panel has a dial (hoa_knob), the
  // lift station's Champion panel a toggle (hoa_switch). Where there is one the pump runs from it and only from there.
  // By part name: the lift station's switch is several materials, so its meshes are called hoa_switch021_1 and so on.
  function panelHere() { let f = null; equip.traverse(x => { if (!f && x.isMesh && /^hoa_(knob|switch)$/.test(partName(x))) f = partName(x); }); return f; }
  // Show or hide one of a model's state parts. In elevation the part's section stands in for it, so the section is what
  // changes, and the part itself is set to come back in its NEW state when elevation ends.
  function setState(inst, name, on) {
    const inElev = !!(elev && elev.roots.includes(inst));
    // EVERY node of the part, not the first: a part with several materials loads as a group and its meshes (<part>_1,
    // <part>_2), place() hides all of them, and showing only the group left the meshes under it hidden. In HAND the lift
    // station's off float and on float simply vanished (2026-09-13).
    const S = [], C = []; inst.traverse(x => { const n = nodeName(x); if (n === name) S.push(x); else if (n === name + '_section') C.push(x); });
    if (!S.length || S.some(x => x.userData.placeHidden)) return;
    if (inElev && C.length) { for (const x of S) { elev.vis.set(x, on); x.visible = false; } for (const x of C) { if (!elev.vis.has(x)) elev.vis.set(x, false); x.visible = on; } }
    else for (const x of S) { x.visible = on; if (inElev && elev.vis.has(x)) elev.vis.set(x, on); }
  }
  // The whole house filter (Jake 2026-09-13: "when we activate it, it'll actually show what happens in the forward flush
  // and a back flush cycle"). Click the head: SERVICE, the water in over the bed, down through the carbon and up the centre
  // tube clean. Again: BACKWASH, bypass over and the bib open, water down the tube and up through the bed, lifting it, the
  // dirt out the hose. Again: back at rest. The arrows are drawn in the cut, so it reads in elevation.
  function filterCycle(inst) {
    const A = inst.userData.anim; if (!A) return null;
    const st = inst.userData.filter || (inst.userData.filter = { step: 0, seq: 0 }); st.step = (st.step + 1) % 3; const my = ++st.seq;
    const get = n => { const c = A.clips.find(x => x.name === n); return c ? { a: A.mixer.clipAction(c), c } : null; };
    // Each clip is driven to where this step WANTS it, from wherever it is, never toggled. Jake 2026-09-13: "you did
    // reverse, and then you didn't turn off one of them". Clicking the bed or an arrow ran the generic clip toggle, which
    // switched backwash on while service was still on, and the head's cycle then flipped both the wrong way.
    const once = (n, on, speed) => { const g = get(n); if (!g) return 0; const was = !!(A.state[n] && A.state[n].open); if (was === on) return 0; const a = g.a; a.loop = T.LoopOnce; a.clampWhenFinished = true; a.enabled = true; a.paused = false; A.state[n] = { open: on };
      const k = speed || 1; if (on) { a.reset(); a.timeScale = k; a.play(); } else { a.timeScale = -k; if (a.time <= 0 || a.time >= g.c.duration - 1e-3) a.time = g.c.duration; a.play(); } return g.c.duration / k; };
    const loop = (n, on) => { const g = get(n); if (!g) return; g.a.loop = T.LoopRepeat; g.a.clampWhenFinished = false; if (on) { if (!g.a.isRunning()) { g.a.reset(); g.a.play(); } } else g.a.stop(); };
    const streams = on => inst.traverse(o => { if (o.userData.isStream && /^bib_stream/.test(nodeName(o))) o.visible = on && waterOn; });
    // Round 17 (Jake): slower, and in order. The steps run one after another on timers; a later click cancels the rest.
    const later = (sec, fn) => setTimeout(() => { if (st.seq === my) fn(); }, sec * 1000);
    if (st.step === 1) {
      const t = once('backwash', false, 2) + 0; loop('backwash_loop', false);
      later(t, () => { const u = once('bib_open', false, 4); streams(false); later(u, () => { const v = once('bypass', false); later(v, () => { once('service', true); loop('service_loop', true); }); }); });
      return 'Filter in service: in at the head, dirty water down through the carbon, cleaner as it goes, up the centre tube and out clean';
    }
    if (st.step === 2) {
      // service stops COMPLETELY first, then the bypass swings over, then the bib opens and the backwash comes in at the bottom
      const t = once('service', false, 1.5); later(t, () => { loop('service_loop', false);
        const u = once('bypass', true); later(u + 0.3, () => { once('bib_open', true); streams(true); once('backwash', true); loop('backwash_loop', true); }); });
      return 'Backwash: service stops, the bypass goes over and the bib opens; clean water goes down the centre tube, comes in at the bottom and rises through the bed, lifting it, and the dirt goes out the hose';
    }
    const t = once('backwash', false, 2); once('service', false, 1.5);
    later(t, () => { loop('backwash_loop', false); loop('service_loop', false); const u = once('bib_open', false, 4); streams(false); later(u, () => once('bypass', false)); });
    return 'Filter back to rest: the flow stops, the bib shuts and the bypass comes back';
  }
  // The lift station's HOA (city_lift). HAND runs the pump whatever the floats say: the contactor pulls in and the basin is
  // drawn down to the off float, which lies on the surface, and the on float hangs dry. Back in AUTO the contactor drops
  // out and the floats have it again. Its state parts are listed under "states" in placements.json.
  function liftSwitch(inst) {
    const st = inst.userData.lift || (inst.userData.lift = { on: false }); if (!st.on && !breakers.septic) return 'HOA: no power, the SEPTIC breaker in the load centre is off'; st.on = !st.on; const on = st.on;
    setState(inst, 'hoa_lever_hand', on); setState(inst, 'hoa_lever_auto', !on);
    if (inst.userData.plantSim) { inst.userData.plantSim.hand = on; return on ? 'HOA in HAND: the pump runs whatever the floats say, and draws the basin down' : 'HOA back in AUTO: the floats run the pump'; }     // round 68: the basin is driven, nothing is swapped
    setState(inst, 'water_off', on); setState(inst, 'water_on', !on);
    setState(inst, 'float_off_surface', on); setState(inst, 'float_off_wet', !on);
    setState(inst, 'float_on_dry', on); setState(inst, 'float_on_surface', !on);
    const A = inst.userData.anim, c = A && A.clips.find(x => x.name === 'contactor_pull');
    if (c) {
      const act = A.mixer.clipAction(c); act.loop = T.LoopOnce; act.clampWhenFinished = true; act.enabled = true; act.paused = false;
      if (on) { act.reset(); act.timeScale = 1; act.play(); } else { act.timeScale = -1; if (act.time <= 0 || act.time >= c.duration - 1e-3) act.time = c.duration; act.play(); }
    }
    return on ? 'HOA in HAND: the pump runs and draws the basin down to the off float' : 'HOA back in AUTO: the floats run the pump';
  }
  function spraySwitch() {    // the effluent pump: the float rises, the heads pop up and turn
    if (!sprayOn && !breakers.septic) return 'Spray pump: no power, the SEPTIC breaker in the load centre is off';
    sprayOn = !sprayOn;
    turnOnce('hoa_auto', sprayOn);
    runClips(['spray', 'pump_run'], sprayOn, ['spray_pattern', 'stream']);
    return 'Spray pump ' + (sprayOn ? 'ON: dosing the field' : 'OFF');
  }
  // mode (round 20): 'look' reaches the machine switches and the control clips only; 'remove' the clips that take something off;
  // 'work' the switches and the clips that run something; undefined is the old anything goes
  const CLIP_REMOVE = /off$|_open$|pull|lift$|door|lid|cover|panel|deadfront|open$/, CLIP_WORK = /run$|_on$|fire|flush|spray|aerate|pump|sprayer|cycle|backwash|service|bib|test|high_water|turn$|auto$|hoa/;
  function playClipFor(o, mode) {
    const inst = o.userData.inst; if (!inst || !inst.userData.anim) return null;
    if (mode === 'remove' && !/^little\/electric_panel/.test(o.userData.pack || '')) return playClipOnly(o, CLIP_REMOVE);
    // Jake 2026-09-13: "clicking the air pump near the base is what turns the air pump on, your command across
    // everything else is a bit strange. When I open the panel and click on the dial in the panel, it should run the
    // spray pumps. And if it doesn't have a panel, clicking the pump itself when you're looking in the tank." So: the
    // blower's body and its pad switch the air, the HOA dial in the panel switches the spray pump, and the effluent pump
    // switches itself only where there is no panel. The panel's guts, the alarm, the diffuser, the discharge and the
    // heads used to throw one switch or the other; now they are just parts.
    // The air pump is whichever machine the yard has: the blower at the house (blower, its pad and its guts), or the
    // Hiblow on its own pad (the AquaSafe's compressor with its cover and guts, the AquaKlear's air_pump). Last round only
    // the blower answered, which left the AquaSafe yard with no way to turn its air on. Part names, not mesh labels: a
    // part with several materials loads as meshes called <mesh>021_1, which no label test matches.
    { const lbl = partName(o) || '';
      if (/^(blower|blower_pad|blower_internals|compressor|compressor_pad|air_pump|pump_pad|pump_cover|pump_internals)$/.test(lbl)) return pumpSwitch();
      if (lbl === 'hoa_knob') return spraySwitch();
      // the head is the control, and anything drawn INSIDE the tank (the bed, its arrows, the centre tube, the water) is
      // the cycle too: clicked on its own it used to run that clip alone, outside the cycle
      if ((o.userData.pack || '') === 'water_filter' && /^(head|svc_|bw_|carbon_|riser_tube|tank_water|particles|diffuser_plate)/.test(lbl)) return filterCycle(inst);
      if (/^hoa_(switch|lever_(auto|hand|off))$/.test(lbl)) return liftSwitch(inst);
      // the load centre: with the cover on, a click anywhere on it (the breaker handles show through the dead front) runs
      // the cycle; with the cover off, the can and the cover put it back and every other part says what it is. Returning
      // null for a part let the click fall through to the cut-open code, which sectioned the breakers.
      if ((o.userData.pack || '') === 'little/electric_panel.glb') {
        const step = inst.userData.panel ? inst.userData.panel.step : 0;
        const bm = /^breaker_(hvac|wh|septic)(_handle)?$/.exec(lbl);
        if (bm) { let pre = ''; if (step === 0) pre = breakerPanel(inst) + '. '; return pre + setBreaker(inst, bm[1], !breakers[bm[1]]); }     // read the label, flip the handle (the door opens first)
        if (step !== 2 || /^(panel_door|deadfront|panel_can)$/.test(lbl)) return breakerPanel(inst);
        return PANEL_PARTS[lbl] || lbl;
      }
      if (lbl === 'pump') { const c = panelHere(); return c === 'hoa_knob' ? 'this pump runs from the panel: open it and turn the HOA dial' : c === 'hoa_switch' ? 'this pump runs from its panel: open it and put the HOA switch in HAND' : spraySwitch(); }
      if (/^(panel_inside|surge|alarm|blower_hose|air_stub|diffuser|discharge|head_stem|spray_head|stream|index_valve)/.test(lbl)) return null; }
    // The CONTENTS of a tank are not controls. Clicking into an AquaKlear to look lands on the water, and the water is
    // keyed by the high water alarm clip, so looking into the tank filled it to the lid (Jake 2026-09-12: "the water
    // levels went up again"). Water, bubbles, the mixing arrows, scum and sludge do nothing when clicked. The alarm is
    // still reachable from the float and the alarm light, which are the things you would actually touch.
    if (/^(water|bubbles|mix_arrows|airlift_spurt|scum|sludge)/.test(partName(o))) return null;
    if (mode === 'look' && !isControl(o)) return null;
    return playClipOnly(o, mode === 'work' ? CLIP_WORK : null);
  }
  // Round 23 (Jake: 'the diverter spout doesn't bring water into the tub'): with the valve on, the water comes out of the spout
  // until the diverter knob is up, then out of the head. Both streams are the model's; the page picks which one shows.
  // a stream that has a section half (the toilet's trap slug and rim sheet): the full one shows while the model is solid, the half
  // while it is cut open (round 23: the slug never showed in the section because the swap hid the half as a hidden part)
  function streamOk(inst, o) {
    const S = inst.userData.sectionSet; if (!S || !S.pairs) return true; const p = partName(o);
    if (S.pairs[p] !== undefined) return !inst.userData.sectionOpen;
    if (Object.values(S.pairs).includes(p)) return !!inst.userData.sectionOpen;
    return true;
  }
  function refreshStreams(inst) {
    const A = inst.userData.anim; const wet = !!A && Object.entries(A.state).some(([k, v]) => v.open && /run$|_on$|sprayer|flush|spray|bib/.test(k));
    inst.traverse(o => { if (o.userData.isStream) o.visible = wet && waterOn && !o.userData.placeHidden && streamOk(inst, o); });     // round 61: a stream the placement hides stays hidden (the cartridge faucet's stream ran in the other bowl)
    if (A) showerStreams(inst, A);
  }
  function showerStreams(inst, A) {
    let sp = null, so = null; inst.traverse(o => { if (!o.isMesh) return; const p = partName(o); if (p === 'shower_stream') sp = o; if (p === 'spout_stream') so = o; });
    if (!sp || !so) return;
    const on = Object.entries(A.state).some(([k, v]) => v.open && /^(shower_on|tub_on)$/.test(k)), up = !!(A.state.diverter_lift && A.state.diverter_lift.open);
    sp.visible = on && waterOn && up; so.visible = on && waterOn && !up;
  }
  // The load centre's cycle (round 28: breakerPanel was called and never defined, so every click on the panel threw): step 0 the
  // door opens, step 1 the dead front comes off, step 2 both go back.
  const PANEL_PARTS = { main_breaker: 'the main breaker: 200 A, the whole house', breaker: 'a branch breaker', neutral_bar: 'the neutral bar', ground_bar: 'the ground bar', bus: 'the bus bars behind the breakers', panel_can: 'the panel can',
                        breaker_hvac: 'HVAC: 2 pole 40 A, the outdoor unit and the air handler', breaker_wh: 'WATER HTR: 2 pole 30 A, the electric water heater', breaker_septic: 'SEPTIC: 20 A, the septic pump and the air pump', branch_breakers: 'the branch breakers' };
  // Round 29 (Jake: "I want the 220 breaker in the electric panel to control the HVAC unit outside and the air handler, a 120 volt
  // separate one going to the septic, and the same for the electric water heater ... we have to come to the panel, read the label
  // and actually turn the breaker on or off"). Three labelled breakers in little/electric_panel are controls: their handle flips on
  // its clip (breaker_<key>) and the page keeps the circuit's state here. A unit on a dead circuit will not run from any tool or
  // button, and whatever was running on it stops when the breaker goes off. The gas furnace's blower sits on the HVAC breaker with
  // the rest of the system for this exercise (a real one has its own 15 A).
  const breakers = { hvac: true, wh: true, septic: true };
  const BREAKER_LABEL = { hvac: 'HVAC', wh: 'WATER HTR', septic: 'SEPTIC', kitchen_a: 'KITCHEN A', kitchen_b: 'KITCHEN B', laundry: 'LAUNDRY',
    garage: 'GARAGE', dishwasher: 'DISHWASHER', exterior: 'EXTERIOR', disposal: 'DISPOSAL', living: 'LIVING', fridge: 'FRIDGE', dining: 'DINING',
    bed2: 'BEDROOM 2', bed3: 'BEDROOM 3', master: 'MASTER', lights_1: 'LIGHTS 1', lights_2: 'LIGHTS 2', washer: 'WASHER', smoke: 'SMOKE',
    bath: 'BATHS', gdo: 'GARAGE DOOR', softener: 'SOFTENER', spd: 'SURGE' };
  function breakerOf(model) {
    const m = model || '';
    if (/condenser|air_handler|furnace|package/.test(m)) return 'hvac';
    if (/pump_tank|septic_|atu_blower|spray_pump_filter|lift_station/.test(m)) return 'septic';
    if (/electric_tank|electric_tankless|hybrid/.test(m)) return 'wh';
    return null;
  }
  function powered(inst) { const k = inst && breakerOf(inst.userData.model); return !k || breakers[k]; }
  function noPower(inst) { const k = breakerOf(inst.userData.model); return 'no power: the ' + BREAKER_LABEL[k] + ' breaker in the load centre is off'; }
  function setBreaker(inst, key, on) {
    breakers[key] = on; playNamed(inst, 'breaker_' + key, !on);
    if (!on) {
      equip.children.forEach(u => { if (breakerOf(u.userData.model) !== key) return; const A = u.userData.anim; if (!A) return;
        for (const [n, st] of Object.entries(A.state)) if (st.open && CLIP_WORK.test(n) && !/^breaker_/.test(n)) playNamed(u, n, false); });
      if (key === 'septic') { if (pumpOn) pumpSwitch(); if (sprayOn) spraySwitch(); }
      if (key === 'hvac') { running.delete('fan'); showFlows(); }
    } else if (key === 'septic') pumpsOnByDefault();
    return 'breaker ' + BREAKER_LABEL[key] + (on ? ' ON: the circuit is live' : ' OFF: everything on it is dead until it is back on');
  }
  function breakerPanel(inst) {
    const st = inst.userData.panel || (inst.userData.panel = { step: 0 });
    if (st.step === 0) { playNamed(inst, 'panel_door_open', true); st.step = 1; return 'panel door open: the dead front is next'; }
    if (st.step === 1) { playNamed(inst, 'deadfront_off', true); st.step = 2; return 'dead front off: the breakers, the bus and the bars'; }
    playNamed(inst, 'deadfront_off', false); playNamed(inst, 'panel_door_open', false); st.step = 0; return 'dead front on, door closed';
  }
  function playClipOnly(o, only) {
    const inst = o.userData.inst; if (!inst || !inst.userData.anim) return null;
    const A = inst.userData.anim; const names = new Set(); for (let p = o; p && p !== inst; p = p.parent) names.add(p.name);
    const pickable = A.clips.filter(c => !/_loop$/.test(c.name) && (!only || only.test(c.name)));
    // a part that more than one clip moves gets the clip that belongs to it: the float is tested by hand, it does not run the pump
    const PREFER = { float_onoff: 'float_test', cartridge: 'shower_on' };
    let clip = (PREFER[partName(o)] && pickable.find(c => c.name === PREFER[partName(o)])) || pickable.find(c => c.tracks.some(t => names.has(t.name.split('.')[0]))) || null;
    // NO BLIND FALLBACK. This used to end in `|| pickable[0]`, so clicking any part of a model with clips played its
    // FIRST clip whatever you hit: on the blower panel that is blower_cover_off, which is why everything said that.
    // Worse, returning a clip makes pick() return early, so the click never reached the cutaway code and the disposal
    // and the trap under the sink stopped opening up (Jake). If nothing matches, say so and let the click fall through.
    if (!clip) { const lbl = o.userData.label || ''; const key = lbl.split('_')[0]; clip = (key.length > 2 ? pickable.find(c => c.name.includes(key)) : null) || null; }
    if (!clip) return null;
    const act = A.mixer.clipAction(clip); act.loop = T.LoopOnce; act.clampWhenFinished = true;
    const st = A.state[clip.name] || (A.state[clip.name] = { open: false });
    st.open = !st.open;
    if (/run$|_on$|sprayer|flush|spray|bib|divert/.test(clip.name)) {     // water follows the handle: show the streams while any run clip is playing
      refreshStreams(inst);
    }
    // a clip called X_loop is the running motion that belongs with X: the blower spinning, the air travelling up through
    // the unit. It repeats for as long as X is open. It keys different properties from X (rotation and location, where X
    // keys scale), so the two actions never fight over the same channel.
    const lp = A.clips.find(c => c.name === clip.name + '_loop');
    if (lp) {
      const la = A.mixer.clipAction(lp); la.loop = T.LoopRepeat; la.clampWhenFinished = false;
      if (st.open) { la.reset(); la.timeScale = 1; la.play(); } else { la.reset(); la.stop(); }
    }
    if (st.open) { act.reset(); act.timeScale = 1; act.play(); }
    else if (ONE_WAY.test(clip.name)) act.stop();
    else { act.paused = false; act.enabled = true; act.timeScale = -1; if (act.time <= 0 || act.time >= clip.duration - 1e-3) act.time = clip.duration; act.play(); }
    afterClip(inst, clip.name, st.open);
    return clip.name + (st.open ? '' : ' (back)');
  }
  // doors: every door_ mesh is exported with its origin on the hinge jamb, so a swing is a rotation about its own Y (Blender Z)
  const doors = [], doorAnim = [], lids = [];     // lids: the house's own lift off panels (the crawl door, the crawl hatch), round 34: they were never in the pick set
  // The overhead door is SECTIONAL (Jake 2026-09-13: "garage door doesn't raise all the way up"; it used to slide one
  // panel 2.05 m up and stop at head height). Four sections ride the track build_house.py draws: up the jambs, round the
  // 12 in curve, back under the ceiling. Each section's bottom hinge sits at distance s along that track and its top
  // hinge at s + h, so a section is posed by the two points; the numbers come off the nodes (track_*), the same numbers
  // the drawn track was swept from. The trolley slides on the rail and the arm keeps its length to the top section.
  const garageDoor = { nodes: [], t: 0, target: 0, userData: { garageCtl: true } };
  function gdTrack(s, P) {
    const sv = P.track_zt - P.track_zb;
    if (s <= sv) return [P.track_yc, P.track_zb + s];
    const a = (s - sv) / P.track_r;
    if (a <= Math.PI / 2) return [P.track_yc + P.track_r - P.track_r * Math.cos(a), P.track_zt + P.track_r * Math.sin(a)];
    return [P.track_yc + P.track_r + (s - sv - Math.PI * P.track_r / 2), P.track_zt + P.track_r];
  }
  function poseGarageDoor() {
    const secs = garageDoor.nodes.filter(n => n.userData.track_i !== undefined); if (!secs.length) return;
    let top = null;
    for (const n of secs) {
      const P = n.userData, sb = P.track_i * P.track_h + garageDoor.t * P.track_travel;
      const [y0, z0] = gdTrack(sb, P), [y1, z1] = gdTrack(sb + P.track_h, P);
      const phi = Math.atan2(-(y1 - y0), z1 - z0);     // Blender rotation about X; glTF's y-up swap leaves a rotation about X alone
      n.position.set(P.track_x, z0, -y0); n.rotation.set(phi, 0, 0);
      if (!top || P.track_i > top.P.track_i) top = { P, y0, z0, phi };
    }
    const tr = garageDoor.nodes.find(n => n.userData.track_rail_z !== undefined), arm = garageDoor.nodes.find(n => n.userData.track_arm_len !== undefined);
    if (!tr || !arm || !top) return;
    const ly = 0.045 / 2 + 0.035, lz = top.P.track_h - 0.10;     // the arm bracket on the top section's strut
    const yb = top.y0 + ly * Math.cos(top.phi) - lz * Math.sin(top.phi), zb = top.z0 + ly * Math.sin(top.phi) + lz * Math.cos(top.phi);
    const L = arm.userData.track_arm_len, zp = tr.userData.track_rail_z - 0.05, dz = zp - zb;
    const yt = yb + Math.sqrt(Math.max(0, L * L - dz * dz));
    tr.position.set(top.P.track_x, tr.userData.track_rail_z, -yt); arm.position.set(top.P.track_x, zp, -yt);
    const dy3 = zb - zp, dz3 = -(yb - yt), len = Math.hypot(dy3, dz3);
    arm.rotation.set(Math.atan2(-dz3 / len, -dy3 / len), 0, 0); arm.scale.set(1, len, 1);
  }
  function toggleDoor(d) {
    if (d.userData.garage) { garageDoor.target = garageDoor.target ? 0 : 1; for (const n of garageDoor.nodes) n.userData.open = garageDoor.target === 1; if (!doorAnim.includes(garageDoor)) doorAnim.push(garageDoor); return; }
    const st = d.userData; st.open = !st.open; st.target = st.open ? st.dir * Math.PI * 0.5 : 0; if (!doorAnim.includes(d)) doorAnim.push(d); }
  function stepDoors(dt) {
    for (let i = doorAnim.length - 1; i >= 0; i--) {
      const d = doorAnim[i]; const st = d.userData;
      if (st.garageCtl) { const v = 0.28 * dt; d.t += Math.max(-v, Math.min(v, d.target - d.t)); poseGarageDoor(); if (d.t === d.target) doorAnim.splice(i, 1); }     // about 3.5 s end to end, at an opener's steady pace
      else { const k = Math.min(1, dt * 5); d.rotation.y += (st.target - d.rotation.y) * k; if (Math.abs(st.target - d.rotation.y) < 0.01) { d.rotation.y = st.target; doorAnim.splice(i, 1); } }
    }
  }
  // which way a hinged door swings: into the room it serves (closets and the water closet swing out into the room they open from); if that room cannot be found, the side that hits nothing
  const roomBoxes = {};
  function chooseDoorSides() {
    house.traverse(o => { if (o.isMesh && o.name.startsWith('room_')) roomBoxes[o.name.slice(5)] = new T.Box3().setFromObject(o).expandByScalar(0.25); });
    const rooms = Object.keys(roomBoxes).concat(['outside']);
    const boxes = [];
    const add = o => { if (o.isMesh && o.visible && !o.name.startsWith('furn_rug') && !o.name.startsWith('col_') && !o.name.startsWith('room_')) boxes.push(new T.Box3().setFromObject(o).expandByScalar(0.02)); };
    house.traverse(o => { if (o.isMesh && (o.name.startsWith('furn_') || o.name.startsWith('fix_'))) add(o); }); equip.traverse(add);
    for (const d of doors) {
      if (d.userData.sectional) continue;
      const hitsFor = dir => { d.rotation.y = dir * Math.PI * 0.5; d.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(d); bb.min.y += 0.05; bb.max.y -= 0.3; let n = 0; for (const b of boxes) if (bb.intersectsBox(b)) n++; return n; };
      const nm = d.name.slice(5); let from = null, to = null;
      for (const r of rooms) if (nm.startsWith(r + '_') && rooms.includes(nm.slice(r.length + 1))) { from = r; to = nm.slice(r.length + 1); break; }
      let target = null;
      if (from && to) target = (to === 'outside' || to.startsWith('closet') || to === 'hall_closet' || to === 'wc') ? from : to;     // closets and the water closet swing out into the room you open them from
      const centreIn = dir => { d.rotation.y = dir * Math.PI * 0.5; d.updateMatrixWorld(true); const c = new T.Vector3(); new T.Box3().setFromObject(d).getCenter(c); c.y = roomBoxes[target].min.y + 0.05; return roomBoxes[target].containsPoint(c); };
      if (target && roomBoxes[target]) { const pa = centreIn(d.userData.dir), pb = centreIn(-d.userData.dir); d.rotation.y = 0; d.updateMatrixWorld(true); if (pb && !pa) d.userData.dir = -d.userData.dir; continue; }
      const a = hitsFor(d.userData.dir), b = hitsFor(-d.userData.dir); d.rotation.y = 0; d.updateMatrixWorld(true);
      if (b < a) d.userData.dir = -d.userData.dir;
    }
  }
  // clicking a pipe cuts it open lengthwise: a local clipping plane on the face you clicked, drawn double sided so you see
  // down the bore. Click it again to close it up. (Jake: clicking a pipe should show a cutaway of the pipe.)
  renderer.localClippingEnabled = true;
  const PIPEY = /^(pipe_|vent_|duct_|fit_|tee_|valve_|cleanout_|conduit_|sleeve_|riser_)/;
  const cutPipes = new Map();
  // the generic lengthwise cutaway is for pipes and parts, not a riser, a lid, a tank shell, a panel's guts or a pump (round 18)
  const NOT_CUT = /^(riser|riser_(pump|aer|inlet|aeration|clarifier|adapter)|lid|lid_.*|tank|seam|baffle|hopper|grass|soil|backfill|panel_.*|control_panel|hoa_knob|surge_device|alarm_.*|blower.*|pump|cabinet|counter.*|backsplash|dishwasher|wall.*|floor.*|closet.*|platform.*|sink|tub|tub_apron|bowl)$/;
  // ONE cutaway for anything you click: the near half is clipped away and, if the model carries a <part>_section, that
  // section is shown in the half we removed. So you get solid on one side and the real internals on the other, instead of
  // the part vanishing (Jake: the faucet just disappears, I want half and half). Click again to close it up.
  // does this model carry a sawn-through half of the thing you just clicked
  // Round 18 (Jake: "the toilet, when you click the side of it, the whole cutaway should happen: the bowl, ... the side of the tank,
  // everything"). A placement's section_set pairs each solid with its section ({"pairs": {solid: section}, "also_hide": [...]}).
  // A click on any solid or section in the set swaps the WHOLE set, one click open and one click back; also_hide parts go away
  // while it is open and come back after, but a click on them still does their own thing (the seat lid still lifts).
  // Round 19 (Jake: "the showers, the wall should be clickable to show the manifold"). A placement's reveal names the
  // parts a click opens it from (the tile valve wall), the model parts that go away (the tile), the ones that come out
  // (the studs, blocking and the back drywall, hidden by the placement the rest of the time), and the parts whose box is
  // BORED out of the house wall behind: six clipping planes with clipIntersection, so only the inside of that box is cut
  // from every house mesh it overlaps. The framing sets the bay's width and height, the other parts its depth. What is
  // left standing in the open bay is the valve body with its risers and the drop ells. Click any of it to close the wall.
  function reveal(o) {
    const inst = o.userData.inst; const R = inst && inst.userData.reveal; if (!R) return null;
    const nm = partName(o), open = !inst.userData.revealOpen;
    const trig = new Set(R.trigger || []), hideS = new Set(R.hide || []), showS = new Set(R.show || []), boreS = new Set(R.bore || []);
    if (open ? !trig.has(nm) : !(trig.has(nm) || showS.has(nm) || boreS.has(nm))) return null;
    inst.userData.revealOpen = open;
    const setVis = (names, v) => inst.traverse(x => { if (!x.isMesh || !names.has(partName(x))) return; x.visible = v; if (v) for (let q = x.parent; q && q !== inst; q = q.parent) q.visible = true; });
    if (!open) {
      setVis(showS, false); setVis(hideS, true);
      for (const [x, old] of (inst.userData.revealBored || [])) x.material = old;
      inst.userData.revealBored = null; return 'wall closed up';
    }
    setVis(hideS, false); setVis(showS, true);
    const bb = new T.Box3(), frame = new T.Box3(), tmp = new T.Box3();
    inst.traverse(x => { if (!x.isMesh || !boreS.has(partName(x))) return; tmp.setFromObject(x); bb.union(tmp); if (partName(x) === 'framing') frame.union(tmp); });
    if (!frame.isEmpty()) for (const a of ['x', 'y', 'z']) if ((bb.max[a] - bb.min[a]) - (frame.max[a] - frame.min[a]) > 0.3) { bb.min[a] = frame.min[a]; bb.max[a] = frame.max[a]; }
    // the bore stops 3 cm short of the bay's far side, so the next room's drywall stays (round 25: with the back sheet gone the open
    // bay looked straight through into the other bathroom)
    if (!frame.isEmpty()) { const wc = new T.Box3().setFromObject(o).getCenter(new T.Vector3()), fc = frame.getCenter(new T.Vector3()); const dv = fc.clone().sub(wc); const ax = Math.abs(dv.x) > Math.abs(dv.z) ? 'x' : 'z'; if (dv[ax] > 0) bb.max[ax] = Math.min(bb.max[ax], frame.max[ax] - 0.03); else bb.min[ax] = Math.max(bb.min[ax], frame.min[ax] + 0.03); }
    const bored = [];
    if (!bb.isEmpty()) {
      bb.expandByScalar(0.008);
      const planes = [new T.Plane(new T.Vector3(1, 0, 0), -bb.max.x), new T.Plane(new T.Vector3(-1, 0, 0), bb.min.x), new T.Plane(new T.Vector3(0, 1, 0), -bb.max.y),
                      new T.Plane(new T.Vector3(0, -1, 0), bb.min.y), new T.Plane(new T.Vector3(0, 0, 1), -bb.max.z), new T.Plane(new T.Vector3(0, 0, -1), bb.min.z)];
      house.traverse(x => {
        if (!x.isMesh || !x.visible || !new T.Box3().setFromObject(x).intersectsBox(bb)) return;
        const old = x.material, ms = (Array.isArray(old) ? old : [old]).map(m => { const c = m.clone(); c.clippingPlanes = planes; c.clipIntersection = true; c.side = T.DoubleSide; c.needsUpdate = true; return c; });
        x.material = Array.isArray(old) ? ms : ms[0]; bored.push([x, old]);
      });
    }
    inst.userData.revealBored = bored;
    return 'wall open: the valve body, its hot and cold risers and the drop ells in the stud bay (' + bored.length + ' house parts bored). Click the framing to close it';
  }
  // one cutaway at a time (round 23): before a unit opens another, whatever it has open closes. null closes the house pipe cuts.
  function closeCuts(inst) {
    for (const [m] of [...cutPipes]) if ((m.userData.inst || null) === inst) pipeCutaway(m);
    if (inst && inst.userData.sectionOpen) { let any = null; const S = inst.userData.sectionSet; inst.traverse(x => { if (!any && x.isMesh && S && S.pairs && S.pairs[partName(x)]) any = x; }); if (any) sectionSet(any); }
  }
  function sectionSet(o) {
    const inst = o.userData.inst; const S = inst && inst.userData.sectionSet; if (!S) return null;
    const nm = partName(o), pairs = Object.entries(S.pairs || {}), also = new Set(S.also_hide || []);
    if (!pairs.some(([a, b]) => a === nm || b === nm)) return null;
    const open = !inst.userData.sectionOpen; inst.userData.sectionOpen = open;
    inst.traverse(x => {
      if (!x.isMesh || x.userData.placeHidden || x.userData.isStream) return; const p = partName(x);
      if (also.has(p)) { x.visible = !open; return; }
      for (const [a, b] of pairs) {
        if (p === a) x.visible = !open;
        else if (p === b) { x.visible = open; for (let q = x.parent; open && q && q !== inst; q = q.parent) q.visible = true; }
      }
    });
    refreshStreams(inst);
    return open ? 'cut open (' + pairs.length + ' parts sectioned)' : 'back to solid';
  }
  function hasSection(o) {
    const inst = o.userData.inst; if (!inst) return false;
    // same two candidates pipeCutaway itself looks for, so the two never disagree about what is sectionable
    const nm = partName(o), want = nm + '_section', alt = nm.replace(/_(body|shell|housing|case|cabinet)$/, '') + '_section';
    let found = false;
    inst.traverse(m => { if (!found && m.isMesh && (partName(m) === want || partName(m) === alt)) found = true; });
    return found;
  }
  function pipeCutaway(o, hit) {
    const nm = nodeName(o);
    if (/_plug$/.test(nm) || /_stream$/.test(nm)) return null;
    if (cutPipes.has(o)) {
      const st = cutPipes.get(o); o.material = st.mat;
      st.sec.forEach(m => { m.visible = false; });
      (st.also || []).forEach(([m, mat]) => { m.material = mat; });
      cutPipes.delete(o); return nm + ' (closed up)';
    }
    const n = new T.Vector3();
    if (hit && hit.face) n.copy(hit.face.normal).transformDirection(o.matrixWorld).negate(); else camera.getWorldDirection(n);
    const at = hit && hit.point ? hit.point : o.getWorldPosition(new T.Vector3());
    // Round 64 (Jake: "the pipe to the street, when I click on it the whole thing disappeared instead of only just the cutaway"). One plane
    // through the click cuts the WHOLE run on that plane, and a long sewer falls as it goes: click the top of the lateral down by the
    // street and everything uphill of the click is above the plane, which is the entire pipe. A house pipe is now cut along ITS OWN
    // AXIS at the click (the plane is turned to hold the pipe's direction there, so the cut stays a half pipe however it falls) and only
    // inside a window 1.2 m either side of the click: three planes with clipIntersection, which removes only what all three agree on.
    let planes = null;
    if (!o.userData.inst) {
      const fl = flows.find(f => f.run === nm && f.path && f.path.length > 1); let pathW = fl ? fl.path : null;
      if (!pathW && DRAINS[nm] && DRAINS[nm].pts) pathW = DRAINS[nm].pts.map(q => new T.Vector3(q[0], q[2], -q[1]));
      if (pathW) {
        let best = 1e9, ax = null;
        for (let i = 1; i < pathW.length; i++) { const a = pathW[i - 1], b = pathW[i], ab = b.clone().sub(a), L2 = ab.lengthSq(); if (L2 < 1e-10) continue;
          const t = Math.max(0, Math.min(1, at.clone().sub(a).dot(ab) / L2)), d = a.clone().addScaledVector(ab, t).distanceTo(at); if (d < best) { best = d; ax = ab.normalize(); } }
        if (ax) {
          const nn = n.clone().addScaledVector(ax, -n.dot(ax)); if (nn.lengthSq() > 0.04) n.copy(nn.normalize());
          const W = 1.2, c0 = ax.dot(at);
          planes = [new T.Plane(n.clone(), -n.dot(at) - 0.010), new T.Plane(ax.clone(), -c0 - W), new T.Plane(ax.clone().negate(), c0 - W)];
        }
      }
    }
    const plane = planes ? planes[0] : new T.Plane(n, -n.dot(at) - 0.010);     // keep what is 1 cm past the wall you clicked: the near wall goes, the bore shows
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const cut = src.clone(); cut.clippingPlanes = planes || [plane]; cut.clipIntersection = !!planes; cut.side = T.DoubleSide; cut.clipShadows = true; cut.needsUpdate = true;
    const sec = [], also = [], inst = o.userData.inst;
    if (inst) {
      const pn = partName(o), want = pn + '_section', alt = pn.replace(/_(body|shell|housing|case|cabinet)$/, '') + '_section';
      const shell = /tank|shell|housing|basin|vessel|riser|body$/.test(pn);
      inst.traverse(x => { if (x.isMesh && !x.userData.placeHidden && (partName(x) === want || partName(x) === alt)) { x.visible = true; sec.push(x); } });
      for (const x of sec) { let p = x.parent; while (p && p !== inst) { p.visible = true; p = p.parent; } }     // the node group is hidden by the fault patterns; a visible child inside a hidden group still shows nothing
      // a cutaway of a TANK has to take its contents with it, or you cut the shell and stare at the outside of the media.
      // Every mesh of this model whose box sits inside the one you clicked gets the same plane (Jake: cutaway of the side
      // of the tank, a lower elevation, cutaway inside of the tank).
      const box0 = new T.Box3().setFromObject(o).expandByScalar(0.02);
      if (shell) inst.traverse(x => {
        if (!x.isMesh || x === o || !x.visible || sec.includes(x)) return;
        if (!box0.containsBox(new T.Box3().setFromObject(x))) return;
        const sm = Array.isArray(x.material) ? x.material[0] : x.material;
        const xc = sm.clone(); xc.clippingPlanes = [plane]; xc.side = T.DoubleSide; xc.clipShadows = true; xc.needsUpdate = true;
        also.push([x, x.material]); x.material = xc;
      });
    }
    cutPipes.set(o, { mat: o.material, sec, also }); o.material = cut;
    return nm + (sec.length || also.length ? ' (cut open, ' + (sec.length + also.length) + ' parts sectioned)' : ' (cut open)');
  }
  // hose bibs run water: click the bib, the stream under it turns on
  let waterOn = true;     // the house shutoff (shutoffValve below): declared up here, hoseBib and showFlows read it
  const bibsOn = new Map();
  function hoseBib(o) {
    const nm = nodeName(o).replace(/_stream$/, '');
    if (!/^fix_hosebib_/.test(nm)) return null;
    if (!waterOn) return nm.replace('fix_hosebib_', 'Hose bib ') + ': no water, the shutoff in the box by the house is off';
    const on = !bibsOn.get(nm); bibsOn.set(nm, on);
    pipes.traverse(x => { if (x.isMesh && nodeName(x) === nm + '_stream') x.visible = on; });
    return nm.replace('fix_hosebib_', 'Hose bib ') + (on ? ': water ON' : ': off');
  }
  // cleanout plugs: the pipe layer gives each plug its own node with the direction it unscrews along
  const plugs = new Map();
  const GRADE_Y = -0.90;     // the lawn, in the viewer's own axes (round 36: the house stands 90 cm over grade)
  function plugOff(o) {
    let p = o; while (p && !(p.userData && p.userData.plug_dir)) p = p.parent;
    if (!p) return null;
    const home = plugs.get(p);
    if (home) { p.position.copy(home); plugs.delete(p); return nodeName(p) + ' (plug back in)'; }
    plugs.set(p, p.position.clone());
    const d = p.userData.plug_dir; let w;
    if (d[1] > 0.7) {
      // it unscrews straight up, out of the lawn: lay it on the grass beside the hole instead of hanging it in the air
      const bx = new T.Box3().setFromObject(p);
      w = new T.Vector3(0.26, GRADE_Y + 0.004 - bx.min.y, 0);
    } else w = new T.Vector3(d[0], d[1], d[2]).normalize().multiplyScalar(0.17);
    if (p.parent) { const q = new T.Quaternion(); p.parent.getWorldQuaternion(q); w.applyQuaternion(q.invert()); }
    p.position.add(w);
    return nodeName(p) + ' (plug off, pipe open)';
  }
  // ---------------------------------------------------------------- water you can see
  // Jake 2026-09-11: "we turn on the faucet with a cutaway pipe, we should see water going through those pipes, and
  // when you run the garbage disposal, you should see stuff going through the pipes." The column comes from Blender;
  // the movement is here. The slugs ride the run's own published path, so they follow every bend instead of cutting
  // the corner between the ends.
  // every yard's sewer is listed: each column is only shown in its own layout (showFlows checks the config), and the
  // gravity, overland and lift yards got their sewers laid again on 2026-09-13
  // Round 64 (Jake: "I want all faucets to flow the exact way that the kitchen faucet did. I could see where the water went. But I want it to
  // also flow into the street sewer line and through the manhole, so we can trace it all the way through"). Every fixture has its own set:
  // its branch, the building drain from where the branch joins it, the sewer of whichever yard is up, the lift station's force main and
  // the city main out to the end of the street. showFlows() starts each run where the one before it lands on it.
  const SEWER_RUNS = ['pipe_dwv_sewer_septic', 'pipe_dwv_sewer_pumptank', 'pipe_dwv_sewer_gravity', 'pipe_dwv_sewer_overland', 'pipe_dwv_sewer_overland_aquaklear', 'pipe_dwv_sewer_lift', 'pipe_dwv_sewer_city', 'pipe_dwv_sewer_city_belly', 'pipe_dwv_city_main'];
  const TO_STREET = ['pipe_dwv_building_drain_west'].concat(SEWER_RUNS), VIA_HALL = ['pipe_dwv_building_drain'].concat(TO_STREET);
  const DRAIN_SAY = ': down its trap, along the building drain and out to the tank or the street (cut a pipe open anywhere on the way to watch it)';
  const fixtureSet = (label, branch) => ({ kind: 'water', label, say: label + DRAIN_SAY, off: 'water off: what is in the pipes runs on down the drain', runs: branch.concat(VIA_HALL) });
  const FLOW_SETS = {
    faucet: { kind: 'water', label: 'water running', say: 'water running: into the bowl, through the disposal and the trap, down the drain (cut a pipe open to watch it)', off: 'water off: what is in the pipes runs on down the drain', runs: ['pipe_supply_branch_kitchen_cold', 'pipe_supply_branch_kitchen_hot', 'pipe_dwv_kitchen'].concat(TO_STREET) },
    disposal: { kind: 'waste', label: 'grinding, waste down the drain', say: 'water on, grinding: the waste goes out the discharge, through the trap and down the drain (cut a pipe open to watch it)', off: 'disposal off: the last of it runs on down the drain', runs: ['pipe_dwv_kitchen'].concat(TO_STREET) },
    laundry: fixtureSet('washer draining', ['pipe_dwv_laundry_standpipe', 'pipe_dwv_laundry']),
    tub: fixtureSet('hall bath tub running', ['pipe_dwv_hallbath_tub']),
    tub_master: fixtureSet('master shower running', ['pipe_dwv_master_tub']),
    vanity_hall: fixtureSet('hall bath sink running', ['pipe_dwv_hallbath_vanity']),
    vanity_master: fixtureSet('master bath sink running', ['pipe_dwv_master_vanity']),
    toilet_hall: fixtureSet('hall bath toilet flushed', ['pipe_dwv_hallbath_toilet']),
    toilet_master: fixtureSet('master toilet flushed', ['pipe_dwv_master_toilet']),
    // round 65: past the end of the house sewer. What a full tank takes in, it pushes out the other end; a spray line runs when its pump does;
    // the lift station's force main and the street main past it run when the basin's pump does, not when the house water gets to the basin
    plant_out: { kind: 'water', label: 'effluent leaving the tank', match: /^(pipe_dwv_effluent_|pipe_septic_overland_discharge)/ },
    plant_spray: { kind: 'water', label: 'spray line under pressure', match: /^pipe_septic_spray_line/ },
    lift_pump: { kind: 'waste', label: 'force main to the street', runs: ['pipe_dwv_force_main_lift', 'pipe_dwv_city_main'] },
    // round 20: the air in every supply duct, for the fan (Jake: "we're gonna flow test all this stuff and actually watch it work")
    fan: { kind: 'air', label: 'air moving in the ducts', match: /^(flex_hvac_|duct_hvac_(supply_trunk|plenum_riser|ahu_supply)|takeoff_hvac_)/ },
    // round 27: water into the tank (Jake: turn water on at the inlet, watch it fill, flow over to the spray tank, the float bring the pump on)
    sewer: { kind: 'waste', label: 'water into the tank', match: /^(pipe_dwv_building_drain|pipe_dwv_sewer_|pipe_dwv_effluent_|pipe_dwv_force_main_|pipe_dwv_city_main)/ }
  };
  const inSet = (set, run) => set.runs ? set.runs.indexOf(run) >= 0 : set.match.test(run);
  // Round 64: a fixture's water FOLLOWS ITS HANDLE. It used to be a separate switch that every click flipped, so a second way of turning
  // the faucet (the panel, the handle, the auto start with the disposal) left the pipes running with the tap shut or dry with it open.
  // window: for a clip that tells one story (the flush), the seconds of it during which water is leaving the fixture.
  const WET_CLIPS = ['tub_on', 'shower_on', 'hot_on', 'cold_on'];
  const FIXTURES = [
    { socket: 'sock_kitchen_sink_kitchen', key: 'faucet', clips: ['faucet_run'] }, { socket: 'sock_kitchen_sink_kitchen', key: 'disposal', clips: ['disposal_run'] },
    { socket: 'sock_vanity_hall_bath', key: 'vanity_hall', clips: ['hot_on', 'cold_on'] }, { socket: 'sock_vanity_master_bath', key: 'vanity_master', clips: ['hot_on', 'cold_on'] },
    { socket: 'sock_tub_hall_bath', key: 'tub', clips: WET_CLIPS }, { socket: 'sock_tub_master_bath', key: 'tub_master', clips: WET_CLIPS },
    { socket: 'sock_toilet_hall_bath', key: 'toilet_hall', clips: ['flush'], window: [1.3, 3.4] }, { socket: 'sock_toilet_wc', key: 'toilet_master', clips: ['flush'], window: [1.3, 3.4] }];
  // (the washer has no clip of its own, so its drain stays a plain switch: a click on the washer turns 'laundry' on and off)
  const FIX_KEYS = new Set(FIXTURES.map(f => f.key));
  // Round 66 (Jake: "let's think about the amount of water a faucet would have, and a flush, because we want a flush to come in as well, and
  // how much water that would be"). Gallons a minute by what is running: a 1.2 gpm lavatory aerator, a 1.8 gpm kitchen faucet, a tub spout
  // wide open, a washer pumping out, and a 1.28 gallon flush leaving the bowl in about four seconds, which is a surge of nearly 20 gpm for
  // those seconds and then nothing. A body of water is sized from that: its cross section is the flow over the speed a drain runs at (2 ft
  // a second), lying as a shallow ribbon on the invert where the pipe runs flat and gathering into a rope where it falls.
  const GPM = { faucet: 1.8, disposal: 2.2, vanity_hall: 1.2, vanity_master: 1.2, tub: 5.0, tub_master: 2.5, toilet_hall: 19, toilet_master: 19, laundry: 12, sewer: 8, plant_out: 3 };
  const areaOf = gpm => Math.max(0.2, gpm) * 6.309e-5 / 0.61;     // m2: gpm to m3/s, over 0.61 m/s
  function fixtureOpen(inst, f, anyTime) {
    const A = inst.userData.anim; if (!A) return false;
    return f.clips.some(cn => { const st = A.state[cn]; if (!st || !st.open) return false; if (!f.window || anyTime) return true;
      const c = A.clips.find(x => x.name === cn); const t = c ? A.mixer.clipAction(c).time : 0; return t >= f.window[0] && t <= f.window[1]; });
  }
  function fixtureKey(inst, clipName) { const pl = inst && inst.userData.pl; if (!pl) return null; const f = FIXTURES.find(x => x.socket === pl.socket && x.clips.indexOf(clipName) >= 0); return f ? f.key : null; }
  function syncFixtureFlows() {
    const want = new Set();
    for (const inst of equip.children) { const pl = inst.userData.pl; if (!pl) continue; for (const f of FIXTURES) if (f.socket === pl.socket && waterOn && fixtureOpen(inst, f)) want.add(f.key); }
    let changed = false;
    for (const k of FIX_KEYS) if (want.has(k) !== running.has(k)) { changed = true; if (want.has(k)) running.add(k); else running.delete(k); }
    if (changed) showFlows();
  }
  const running = new Set(); const slugs = [];
  const SLUG_MAT = { water: new T.MeshStandardMaterial({ color: 0x8fd0ff, emissive: 0x2a6d99, roughness: 0.15 }),
                     waste: new T.MeshStandardMaterial({ color: 0x9a8355, emissive: 0x3a2f18, roughness: 0.6 }),
                     air: new T.MeshStandardMaterial({ color: 0xdff2ff, emissive: 0x5aa0d0, roughness: 0.3, transparent: true, opacity: 0.7 }) };
  function pathLen(path) { let L = 0; for (let i = 1; i < path.length; i++) L += path[i].distanceTo(path[i - 1]); return L; }
  function pointAt(path, t) {
    let d = t * pathLen(path);
    for (let i = 1; i < path.length; i++) { const seg = path[i].distanceTo(path[i - 1]); if (d <= seg) return path[i - 1].clone().lerp(path[i], seg ? d / seg : 0); d -= seg; }
    return path[path.length - 1].clone();
  }
  // ---------------------------------------------------------------- round 65: the water ARRIVES
  // Jake 2026-09-20: "the water enters into the septic system, how this interacts with the models is important." When the front of a fixture's
  // water reaches the end of the house sewer: it POURS in (a falling stream from the end of the pipe, down the plant's own inlet drop, into the
  // liquid in the first chamber), the same amount leaves the far end (plant_out: the effluent line to the 540 or the d-box, an overland
  // discharge to daylight), and the plant's pump clips run the way they do for the sewer test. When the last of it has come in, all of that stops.
  let arrivingW = null, pourW = null, plantOn = false, plantTimers = [];
  function plantCycle(on, gentle) {
    plantOn = on; for (const t of plantTimers) clearTimeout(t); plantTimers = [];
    equip.children.forEach(inst => {
      let seq = CYCLES[inst.userData.model]; const A = inst.userData.anim; if (!seq || !A) return;
      if (inst.userData.plantSim && inst.userData.plantSim.cfg.pump) return;     // round 67: its float runs its pump, not a timer
      if (gentle) seq = seq.filter(n => /pump_run|pump_down|fill_from_house/.test(n));     // a running tap does not ring the high water alarm
      const stopAll = () => { for (const n of seq) if (A.state[n] && A.state[n].open) playNamed(inst, n, false); };
      if (!on) { stopAll(); return; }
      if (!seq.length) return;
      const round = (t0) => { let t = t0; for (const n of seq) { const c = A.clips.find(x => x.name === n); if (!c) continue; if (/pump|aerate/.test(n) && !breakers.septic) continue; plantTimers.push(setTimeout(() => { if (plantOn) playNamed(inst, n, true); }, t)); t += c.duration * 1000 + 600; } return t; };
      const again = () => { if (!plantOn) return; stopAll(); const t = round(1200); plantTimers.push(setTimeout(again, t + 3000)); };
      const t1 = round(2500); plantTimers.push(setTimeout(again, t1 + 3000));
    });
  }
  function deliveringOn(re) {
    let A = 0; for (const f of flows) { if (!f.water || !re.test(f.run) || !inConfig(f.obj.userData.config)) continue;
      for (const k in f.water) { const w = f.water[k]; if (w && w.active && w.front >= w.L - 0.02 && w.tail < w.L - 0.02) A += w.A; } }
    return A;
  }
  function deliveringSewer() {
    const got = [];
    for (const f of flows) { if (!f.water || !/^pipe_dwv_sewer_/.test(f.run) || /^pipe_dwv_sewer_city/.test(f.run) || !inConfig(f.obj.userData.config)) continue;
      for (const k in f.water) { const w = f.water[k]; if (w && w.active && w.front >= w.L - 0.02 && w.tail < w.L - 0.02) got.push(w); } }
    if (!got.length) return null;
    // what pours in is everything that is arriving: a faucet's trickle, and for the seconds a flush is coming in, the flush on top of it
    const big = got.reduce((a, b) => (b.A > a.A ? b : a));
    return { P: big.P, R: big.R, kind: got.some(w => w.kind === 'waste') ? 'waste' : 'water', A: got.reduce((a, w) => a + w.A, 0), mesh: big.mesh, sig: got.map(w => w.mesh.name).sort().join('+') };
  }
  // Round 66 (Jake: "it doesn't look like it's coming in naturally. Think of water not as coming in at a 90 degree angle: when it comes and breaks
  // over into a tank it just kind of waterfalls in"). The pour used to be a line out and a line straight down. Now it LEAVES THE LIP: from
  // the invert at the end of the pipe, at the speed it was running, and falls the way thrown water falls (a parabola), as thick as that
  // fixture's flow and thinning as it speeds up. Where the pipe ends inside a plant's own inlet tee (the Lee, the gravity tank) the far
  // wall of the tee is 6 cm away, so the arc runs into it and goes down the drop. A pipe end under the liquid just runs out.
  function makePour(w, levelY) {
    const n = w.P.length, E = w.P[n - 1].clone(), Ep = w.P[Math.max(0, n - 3)], dir = E.clone().sub(Ep); dir.y = 0; const flat = dir.length() > 0.01; if (flat) dir.normalize();
    let level = E.y - 0.40, under = false, tee = false, seenShown = false; const bx = new T.Box3(), probe = E.clone().addScaledVector(dir, flat ? 0.06 : 0);
    equip.children.forEach(inst => inst.traverse(o => { if (!o.isMesh) return; const pn = partName(o);
      if (/^inlet_tee$|^inlet$/.test(pn) && /septic_lee|septic_tank/.test(inst.userData.model || '')) { bx.setFromObject(o); if (bx.distanceToPoint(E) < 0.15) tee = true; }
      const shown = shownInTree(o); if (!/^(water|cu_water)/.test(pn) || (!shown && /_high|alarm|_on$|_fill/.test(pn)) || (!shown && seenShown)) return; o.updateWorldMatrix(true, false); bx.setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(o.matrixWorld);     // the REST surface: setFromObject takes in the morph targets, and a plant's water carries its high water alarm level as one
      if (probe.x < bx.min.x - 0.05 || probe.x > bx.max.x + 0.05 || probe.z < bx.min.z - 0.05 || probe.z > bx.max.z + 0.05) return; if (bx.max.y > E.y + 0.03) { if (bx.min.y < E.y && shown) under = true; return; } if (shown && !seenShown) { seenShown = true; level = bx.max.y; } else if (bx.max.y > level || level === E.y - 0.40) level = bx.max.y; }));     // the liquid you can SEE wins: a basin carries its off, on and alarm levels as separate bodies and shows one
    if (levelY !== undefined && levelY !== null) { level = levelY; under = levelY > E.y + 0.03; }     // round 68: a driven basin says where its surface is NOW
    const A = w.A, dep = Math.min(w.R * 0.62, Math.max(0.0035, Math.sqrt(A / (2.2 * Math.PI)))), lip = E.clone(); lip.y -= (w.R - dep);     // it leaves from the bottom of the pipe
    const path = [];
    if (under || !flat) { path.push(lip.clone(), new T.Vector3(lip.x, lip.y - 0.10, lip.z)); }
    else {
      const v0 = 0.61, g = 9.81, reach = tee ? 0.055 : 9; path.push(lip.clone().addScaledVector(dir, -0.03));
      for (let t = 0; t < 1.2; t += 0.02) { const x = v0 * t, y = lip.y - 0.5 * g * t * t; if (x > reach) { path.push(new T.Vector3(lip.x + dir.x * reach, Math.min(path[path.length - 1].y - 0.02, y), lip.z + dir.z * reach)); path.push(new T.Vector3(lip.x + dir.x * reach, level - 0.10, lip.z + dir.z * reach)); break; }
        path.push(new T.Vector3(lip.x + dir.x * x, y, lip.z + dir.z * x)); if (y < level - 0.10) break; }
    }
    const pw = makeWater(pipes, path, 0.05, w.kind, false, 'pour_' + w.mesh.name, A, true);
    // the pour falls INSIDE the plant's own inlet tee, where nobody can see it. In the side cutaway (Elevation) it is drawn over the tee, so the
    // trainee sees the water go down the drop and into the liquid; walking the yard it is hidden like everything else inside a pipe.
    if (pw) { pw.isPour = true; pw.levelY = level; pw.mesh.material = pw.mesh.material.clone(); pw.mesh.renderOrder = 9; } return pw;
  }
  function syncPlant() {
    const w = deliveringSewer();
    let basinY = null; for (const S of plantSims) if (S.cfg.pump && !S.drop && S.inst.parent && /sewer/.test(S.cfg.feed || '')) { S.inst.updateWorldMatrix(true, false); basinY = S.inst.localToWorld(new T.Vector3(0, S.level, 0)).y; }
    if (w && arrivingW && w.sig === arrivingW.sig && pourW && basinY !== null && Math.abs(pourW.levelY - basinY) > 0.03) { const old = pourW; old.kill = true; setWater(old, false); old.active = false; pourW = makePour(w, basinY); if (pourW) { setWater(pourW, true, 0, 0); pourW.t = 5; } }     // the basin's surface has moved: the fall is that much shorter or longer
    if (pourW && pourW.mesh.material.depthTest !== !elev) { pourW.mesh.material.depthTest = !elev; pourW.mesh.material.needsUpdate = true; }
    if (!!w !== !!arrivingW || (w && arrivingW && w.sig !== arrivingW.sig)) {
      if (pourW) setWater(pourW, false);
      if (w) { pourW = makePour(w, basinY); if (pourW) setWater(pourW, true, 0, 0); GPM.plant_out = Math.max(0.5, gpmOfArea(w.A)); for (const f of flows) if (f.water && f.water.plant_out) resizeWater(f.water.plant_out, w.A); running.add('plant_out'); if (!sysOn && !plantOn) plantCycle(true, true); }
      else { running.delete('plant_out'); if (!sysOn) plantCycle(false, true); }
      arrivingW = w; showFlows();
    }
    // pressure lines follow their pumps
    let spray = false, lift = false;
    equip.children.forEach(inst => { const A = inst.userData.anim; if (!A) return; const m = inst.userData.model || '';
      if (/septic_lee|pump_tank|spray_pump_filter/.test(m) && A.state.pump_run && A.state.pump_run.open) spray = true;
      if (/lift_station/.test(m) && A.state.pump_down && A.state.pump_down.open) lift = true; });
    let ch = false; for (const [k, v] of [['plant_spray', spray], ['lift_pump', lift]]) if (running.has(k) !== v) { ch = true; if (v) running.add(k); else running.delete(k); }
    if (ch) showFlows();
    for (let i = waters.length - 1; i >= 0; i--) { const x = waters[i]; if (x.isPour && x !== pourW && !x.active) { if (x.mesh.parent) x.mesh.parent.remove(x.mesh); x.mesh.geometry.dispose(); waters.splice(i, 1); } }
  }
  // ---------------------------------------------------------------- round 67: a plant's pump chamber, its float and its pump
  // Jake 2026-09-20: "the water actually has to come up to the float, raise the float level, and then slightly over level. Wide angle floats have
  // to go really kind of up before they actually activate ... the water and the timings of it are off, it just looks weird." The float used to
  // swing up in four frames of the pump clip with no water near it. A model that carries a plant_sim extra (the Lee: build_lee_atu.py) has its
  // pump chamber DRIVEN here instead: the level rises with what is arriving, the float rides the surface on its tether (its angle is worked
  // out from the level, the tie point and the tether length), the pump starts when the float has tipped to its ON angle and stops when it
  // has dropped to its OFF angle, and the level draws down at the pump's rate while it runs. The float's and the water's tracks are taken
  // out of the run clip, which keeps only what the pump really does (the heads come up and spray).
  // SIM_GAIN is honest time compression: a kitchen faucet fills this chamber's 14 in pumping range in about 35 minutes, and nobody will
  // stand and watch that. Everything in the chamber (what comes in, what the pump takes out) runs SIM_GAIN times faster than the clock.
  const SIM_GAIN = 30, plantSims = [];
  const gpmOfArea = A => A * 0.61 / 6.309e-5;
  // Round 68: a basin can carry ONE float (a wide angle pump switch: the Lee, the 540) or SEVERAL (the lift station's narrow angle off, on and
  // alarm floats, each under its own cable weight). Each float is a body whose origin is its tie point; its cord is a rope hung here.
  function setupPlantSim(inst) {
    let cfg = null; inst.traverse(o => { if (!cfg && o.userData && o.userData.plant_sim) { try { cfg = JSON.parse(o.userData.plant_sim); } catch (e) { } } });
    const A = inst.userData.anim; if (!cfg || !A) return;
    const toG = q => new T.Vector3(q[0], q[2], -q[1]);
    const defs = cfg.floats || [{ name: cfg.float, role: 'onoff', tie: cfg.tie, tether: cfg.tether, theta0_deg: cfg.theta0_deg, up_deg: cfg.up_deg, on_deg: cfg.on_deg, off_deg: cfg.off_deg, cord: cfg.cord, cord_tip_rel: cfg.cord_tip_rel, cord_r: cfg.cord_r }];
    const S = { cfg, inst, feed: cfg.feed ? new RegExp(cfg.feed) : /^pipe_dwv_sewer_/, pumpOn: false, alarm: false, hand: false, floats: [], waters: cfg.water.map(n => inst.getObjectByName(n)).filter(Boolean), through: [], dropW: null, dropAt: null, wasIn: false };
    const names = defs.map(d => d.name);
    for (const d of defs) {
      const F = { d, obj: inst.getObjectByName(d.name), made: false, theta: 0 }; if (!F.obj) continue;
      F.levelOf = deg => d.tie[2] - d.tether * Math.cos(deg * Math.PI / 180); F.onZ = F.levelOf(d.on_deg); F.offZ = F.levelOf(d.off_deg);
      // its swing, read out of whichever clip turns it: the rest pose and the pose furthest from it give the axis it turns about
      for (const c of A.clips) { const tr = c.tracks.find(t => t.name === d.name + '.quaternion'); if (!tr || F.axis) continue;
        const q0 = new T.Quaternion().fromArray(tr.values, 0); let best = 0, qUp = q0.clone(); for (let k = 0; k < tr.values.length; k += 4) { const q = new T.Quaternion().fromArray(tr.values, k), a = q0.angleTo(q); if (a > best) { best = a; qUp = q; } }
        if (best > 0.2) { const rel = q0.clone().invert().multiply(qUp), sn = Math.sqrt(Math.max(1e-9, 1 - rel.w * rel.w)); F.q0 = q0; F.axis = new T.Vector3(rel.x / sn, rel.y / sn, rel.z / sn); F.sgn = (2 * Math.acos(Math.max(-1, Math.min(1, rel.w)))) / (d.up_deg * Math.PI / 180); } }
      if (d.cord) F.cordObj = inst.getObjectByName(d.cord) || null;
      if (d.cord_tip_rel) {
        F.tipLocal = toG(d.cord_tip_rel); F.tieG = toG(d.tie); F.ropeLen = Math.max(0.02, F.tipLocal.length()) * 1.18;
        const N = 14, K = 6, pos = new Float32Array((N + 1) * K * 3), idx = []; for (let a = 0; a < N; a++) for (let k = 0; k < K; k++) { const u = a * K + k, v = a * K + (k + 1) % K; idx.push(u, v, u + K, v, v + K, u + K); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx);
        F.rope = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 })); F.rope.name = 'float_rope'; F.rope.frustumCulled = false; F.rope.raycast = () => { };
        F.rope.userData.inst = inst; F.rope.userData.label = 'float_rope'; F.rope.userData.part = 'float_rope'; inst.add(F.rope); F.N = N; F.K = K;
      }
      S.floats.push(F);
    }
    // the floats and the chamber's water belong to the WATER in every clip of the model; only the hand test still lifts a float
    for (const c of A.clips) c.tracks = c.tracks.filter(t => !(names.some(n => t.name === n + '.quaternion') && c.name !== 'float_test') && !cfg.water.some(n => t.name === n + '.scale'));
    const low = S.floats.find(F => F.d.role === 'onoff' || F.d.role === 'off');
    S.level = !cfg.pump ? cfg.rest_top_z : (cfg.start_level !== undefined ? cfg.start_level : (low ? low.offZ : cfg.rest_top_z));
    for (let k = 0; k < (cfg.through || []).length; k++) { const w = makeWater(inst, cfg.through[k].map(toG), 0.05, 'water', false, 'through' + k + '_' + (inst.userData.model || ''), areaOf(2), true); if (w) { w.isThrough = true; w.lead = 1.5 + k * 2.0; w.mesh.material = w.mesh.material.clone(); w.mesh.renderOrder = 8; S.through.push(w); } }
    S.drop = cfg.drop ? toG(cfg.drop) : null;
    inst.userData.plantSim = S; plantSims.push(S);
  }
  // the cord from the tie (or the cable weight) to the float's tip: a ROPE (Jake: "it's not stiff, it's like a rope, it's loose"), a fifth longer
  // than the straight line between them can ever be, hanging in a parabola of that length; straight down, it is the rope and nothing sags
  function ropeStep(S, F) {
    if (F.cordObj) F.cordObj.traverse(o => { if (o.isMesh) o.visible = false; });
    if (!F.rope) return;
    F.rope.visible = shownInTree(F.obj);
    F.obj.updateWorldMatrix(true, false); S.inst.updateWorldMatrix(true, false);
    const A = F.tieG, B = S.inst.worldToLocal(F.obj.localToWorld(F.tipLocal.clone())), chord = A.distanceTo(B);
    const sag = chord < F.ropeLen ? Math.sqrt(3 * chord * (F.ropeLen - chord) / 8) : 0, flat = Math.hypot(B.x - A.x, B.z - A.z) / Math.max(1e-6, chord);
    const N = F.N, K = F.K, r = F.d.cord_r || 0.0035, pos = F.rope.geometry.attributes.position.array, P = [];
    for (let a = 0; a <= N; a++) { const t = a / N, q = A.clone().lerp(B, t); q.y -= sag * flat * 4 * t * (1 - t); P.push(q); }
    const up = new T.Vector3(0, 1, 0), tn = new T.Vector3(), n1 = new T.Vector3(), n2 = new T.Vector3();
    for (let a = 0; a <= N; a++) { tn.copy(P[Math.min(N, a + 1)]).sub(P[Math.max(0, a - 1)]).normalize(); n1.crossVectors(tn, Math.abs(tn.y) > 0.95 ? new T.Vector3(1, 0, 0) : up).normalize(); n2.crossVectors(tn, n1);
      for (let k = 0; k < K; k++) { const an = 2 * Math.PI * k / K, o = (a * K + k) * 3; pos[o] = P[a].x + (n1.x * Math.cos(an) + n2.x * Math.sin(an)) * r; pos[o + 1] = P[a].y + (n1.y * Math.cos(an) + n2.y * Math.sin(an)) * r; pos[o + 2] = P[a].z + (n1.z * Math.cos(an) + n2.z * Math.sin(an)) * r; } }
    F.rope.geometry.attributes.position.needsUpdate = true; F.rope.geometry.computeVertexNormals();
  }
  function stepPlantSims(dt) {
    for (let i = plantSims.length - 1; i >= 0; i--) if (!plantSims[i].inst.parent) { const S = plantSims[i]; for (const w of S.through.concat(S.dropW ? [S.dropW] : [])) { w.kill = true; w.active = false; w.on = false; } plantSims.splice(i, 1); }
    for (const S of plantSims) {
      const cfg = S.cfg, A = S.inst.userData.anim, clip = A.clips.find(c => c.name === cfg.run_clip);
      const inA = deliveringOn(S.feed), gpmIn = inA ? gpmOfArea(inA) : 0, flowing = gpmIn > 0;
      // what is moving through the plant, and what drops into the pump chamber at the far end of it
      if (flowing !== S.wasIn || (flowing && Math.abs(inA - (S.lastA || 0)) / inA > 0.12)) { S.wasIn = flowing; S.lastA = inA; for (const w of S.through) { if (flowing) resizeWater(w, inA); setWater(w, flowing, w.lead, 0); } }
      for (const w of S.through) if (w.mesh.material.depthTest !== !elev) { w.mesh.material.depthTest = !elev; w.mesh.material.needsUpdate = true; }
      if (S.drop) {
        const last = S.through[S.through.length - 1], want = flowing && (!last || last.front >= last.L - 0.02);
        if (want && (!S.dropW || Math.abs(S.dropAt - S.level) > 0.025 || Math.abs(S.dropW.A - inA) / inA > 0.12)) {
          if (S.dropW) { S.dropW.kill = true; setWater(S.dropW, false); }
          const bottom = S.drop.clone(); bottom.y = Math.min(S.drop.y - 0.03, S.level - 0.08);
          S.dropW = makeWater(S.inst, [S.drop.clone(), bottom], 0.05, 'water', false, 'drop_' + (S.inst.userData.model || ''), inA, true);
          if (S.dropW) { S.dropW.isDrop = true; S.dropW.mesh.material = S.dropW.mesh.material.clone(); S.dropW.mesh.renderOrder = 8; setWater(S.dropW, true, 0, 0); S.dropAt = S.level; }
        } else if (!want && S.dropW && S.dropW.on) setWater(S.dropW, false);
        if (S.dropW && S.dropW.mesh.material.depthTest !== !elev) { S.dropW.mesh.material.depthTest = !elev; S.dropW.mesh.material.needsUpdate = true; }
      }
      // parts the model drew for the old switched poses stay away while the basin is driven
      if (cfg.hide) for (const n of cfg.hide) { const o = S.inst.getObjectByName(n); if (o && o.visible) o.traverse(x => { x.visible = false; }); }
      for (const o of S.waters) if (!o.userData.placeHidden && !/_section$/.test(o.name) && !S.inst.userData.sectionOpen && !elev && !o.visible) o.visible = true;
      if (cfg.pump) {
        // the chamber: in at what is arriving, out at the pump's rate, both times SIM_GAIN
        // (a lift basin is a quarter of the plan area of a tank's pump chamber and its pump is twice the size: at 30 x its whole cycle was over in seven seconds, so it runs at 12 x)
        const k = (cfg.gain || (cfg.floats ? 12 : SIM_GAIN)) * 6.309e-5 / cfg.area_m2;
        S.level += k * gpmIn * dt; if (S.pumpOn) S.level -= k * cfg.pump_gpm * dt;
        S.level = Math.max(cfg.floor_z + 0.08, Math.min(cfg.rest_top_z + (cfg.floats ? 0.12 : 0.40), S.level));
      }
      for (const o of S.waters) o.scale.y = (S.level - cfg.floor_z) / (cfg.rest_top_z - cfg.floor_z);
      // every float rides the surface on its tether: hanging until the water reaches it, straight up when the water is past its reach
      const lifted = A.state.float_test && A.state.float_test.open;
      for (const F of S.floats) { const d = F.d, c = (d.tie[2] - S.level) / d.tether; F.theta = c >= 1 ? 0 : (c <= -1 ? 180 : Math.acos(c) * 180 / Math.PI);
        const thShow = Math.max(d.theta0_deg > 1 ? 18 : 0, F.theta);     // a float tied to a pipe lies against it when it hangs: it cannot swing in under its tie
        if (F.axis && !(lifted && d.role === 'onoff')) F.obj.quaternion.copy(F.q0).multiply(new T.Quaternion().setFromAxisAngle(F.axis, F.sgn * (thShow - d.theta0_deg) * Math.PI / 180));
        if (F.theta >= d.on_deg) F.made = true; else if (F.theta <= d.off_deg) F.made = false;     // makes at its ON angle, breaks at its OFF angle, holds in between
        ropeStep(S, F); }
      S.theta = S.floats.length ? S.floats[S.floats.length > 1 ? 1 : 0].theta : 0;
      if (!cfg.pump) continue;
      // the control: one wide angle float is the switch; with off / on / alarm floats the pump starts when ON makes and runs until OFF breaks
      const one = S.floats.find(F => F.d.role === 'onoff'), fOff = S.floats.find(F => F.d.role === 'off'), fOn = S.floats.find(F => F.d.role === 'on'), fAl = S.floats.find(F => F.d.role === 'alarm');
      const st = A.state[cfg.run_clip], manual = !cfg.run_state_only && st && st.open && !S.pumpOn, pw = powered(S.inst);
      const callOn = one ? (one.made || lifted) : (fOn && fOn.made), callOff = one ? (!one.made && !lifted) : (fOff && !fOff.made);
      let want = S.pumpOn; if (callOn || manual) want = true; if (callOff && !manual) want = false; if (S.hand) want = S.level > cfg.floor_z + 0.12; if (!pw) want = false;
      if (manual && !want) { st.open = false; if (clip) A.mixer.clipAction(clip).stop(); refreshStreams(S.inst); }     // Run pressed with the switch open: nothing runs
      if (want !== S.pumpOn) { S.pumpOn = want;
        if (cfg.run_state_only) { (A.state[cfg.run_clip] || (A.state[cfg.run_clip] = { open: false })).open = want; }
        else if (want) { if (!(st && st.open)) playNamed(S.inst, cfg.run_clip, true); }
        else { const s2 = A.state[cfg.run_clip]; if (s2) s2.open = false; if (clip) { const act = A.mixer.clipAction(clip); act.time = Math.max(act.time, 72 / 24); } refreshStreams(S.inst); }
        if (cfg.contactor_clip && !S.hand) { const cc = A.clips.find(x => x.name === cfg.contactor_clip); if (cc) { const act = A.mixer.clipAction(cc); act.loop = T.LoopOnce; act.clampWhenFinished = true; act.enabled = true; act.paused = false; if (want) { act.reset(); act.timeScale = 1; act.play(); } else { act.timeScale = -1; act.time = cc.duration; act.play(); } } }
        // the pump screen rides the pump it is on: it runs when that pump runs
        equip.children.forEach(u => { if (/spray_pump_filter/.test(u.userData.model || '') && u.userData.anim && u.userData.anim.clips.some(c => c.name === 'pump_run')) playNamed(u, 'pump_run', want); });
      }
      if (S.pumpOn && clip && !cfg.run_state_only) { const act = A.mixer.clipAction(clip); if (act.time > 70 / 24) act.time = 20 / 24; }     // the heads stay up and keep turning for as long as the pump runs
      if (fAl && fAl.made !== S.alarm) { S.alarm = fAl.made; if (cfg.alarm_part) { const o = S.inst.getObjectByName(cfg.alarm_part); if (o) o.traverse(x => { x.visible = S.alarm; }); } }
    }
    for (let i = waters.length - 1; i >= 0; i--) { const x = waters[i]; if (x.kill && !x.active) { if (x.mesh.parent) x.mesh.parent.remove(x.mesh); x.mesh.geometry.dispose(); waters.splice(i, 1); } }
  }
  function toggleFlow(key) {
    const set = FLOW_SETS[key]; if (!set) return null;
    if (FIX_KEYS.has(key)) {     // a fixture: its clips decide, this only says what is happening
      syncFixtureFlows();
      const open = equip.children.some(inst => FIXTURES.some(f => f.key === key && inst.userData.pl && f.socket === inst.userData.pl.socket && fixtureOpen(inst, f, true)));
      return open ? (set.say || set.label) : (set.off || set.label + ' off');
    }
    if (running.has(key)) running.delete(key); else running.add(key);
    showFlows();
    return running.has(key) ? (set.say || set.label) : (set.off || set.label + ' off');
  }
  // ---------------------------------------------------------------- round 61: water that MOVES
  // Jake 2026-09-20: "no water actually goes through the pipe. I don't mean little brown ball droplets going through the pipe, I
  // need to see actual water animation." The two balls per run are gone for water and waste (the ducts keep theirs for air). A
  // run's water is now a body drawn here along the run's own published centreline: it lies on the pipe's invert where the pipe
  // runs flat and fills out where it falls, its surface streams downstream (a streaked texture sliding along the run), it ARRIVES
  // (a front that leaves the fixture and works its way down the drain, run after run, entering each run where the last one
  // joins it) and it DRAINS AWAY from the top when the fixture shuts off. Waste is the same body, murky, with the ground food in
  // it. A model can carry its own centreline (the sink: drain chamber, discharge, waste arm, tee, trap, trap arm) as a flow_path
  // extra, so the water is seen under the sink too, through any pipe you have cut open.
  const WATER_V = 1.5, WATER_SCROLL = 0.85, WATER_TILE = 0.30, WATER_K = 10;
  const waterTex = {}, waterMats = {}, waters = [];
  function waterTexture(kind) {
    if (waterTex[kind]) return waterTex[kind];
    const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    let seed = kind === 'waste' ? 77 : 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = kind === 'waste' ? 'rgba(104,98,66,0.90)' : 'rgba(64,148,218,0.66)'; g.fillRect(0, 0, W, H);
    const wrap = fn => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
    for (let i = 0; i < 150; i++) {
      const x = rnd() * W, y = rnd() * H, len = 24 + rnd() * 90, th = 1 + rnd() * 3.5, light = rnd() < 0.62, al = 0.18 + rnd() * 0.55;
      const col = kind === 'waste' ? (light ? 'rgba(170,166,134,' + al * 0.6 + ')' : 'rgba(52,46,26,' + al * 0.8 + ')') : (light ? 'rgba(236,249,255,' + al + ')' : 'rgba(18,74,140,' + al * 0.7 + ')');
      wrap(() => { g.strokeStyle = col; g.lineWidth = th; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 6, x + len * 0.7, y + (rnd() - 0.5) * 6, x + len, y + (rnd() - 0.5) * 4); g.stroke(); });
    }
    if (kind === 'waste') for (let i = 0; i < 90; i++) {     // what the ring left of the carrot, the lettuce and the shell
      const x = rnd() * W, y = rnd() * H, r = 1.2 + rnd() * 2.6, c = ['rgba(222,118,30,0.95)', 'rgba(88,150,52,0.95)', 'rgba(240,234,214,0.95)', 'rgba(232,206,70,0.9)'][Math.floor(rnd() * 4)];
      wrap(() => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r * 1.6, r, rnd() * 3, 0, 6.3); g.fill(); });
    }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (T.SRGBColorSpace !== undefined) t.colorSpace = T.SRGBColorSpace; else if (T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding;
    return (waterTex[kind] = t);
  }
  function waterMaterial(kind) {
    if (waterMats[kind]) return waterMats[kind];
    const t = waterTexture(kind);
    return (waterMats[kind] = new T.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new T.Color(kind === 'waste' ? 0x24221a : 0x3d6f96), color: 0xffffff, roughness: kind === 'waste' ? 0.45 : 0.12, metalness: 0, transparent: true, depthWrite: false, side: T.DoubleSide }));
  }
  // the body of water along a centreline (points in the frame of whatever it will hang on, y up). R is the bore. full: a pipe under
  // pressure, round and centred; otherwise a drain, part full: low and wide on the flat, round where it falls.
  function waterGeometry(path, R, full, A, free) {
    // round 64: a long straight leg is cut into 15 cm pieces, or the water's front (which shows whole pieces) jumps the length of the leg at once
    const P = [path[0].clone()]; for (let i = 1; i < path.length; i++) { const a0 = P[P.length - 1], d = path[i].distanceTo(a0); if (d <= 0.004) continue; const n = Math.ceil(d / 0.15); for (let k = 1; k <= n; k++) P.push(a0.clone().lerp(path[i], k / n)); }
    if (P.length < 2) return null;
    const n = P.length, K = WATER_K, posA = [], uvA = [], idx = [], cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const t = new T.Vector3(), up = new T.Vector3(), side = new T.Vector3(1, 0, 0), c = new T.Vector3(), v = new T.Vector3(), DOWN = new T.Vector3(0, -1, 0);
    for (let i = 0; i < n; i++) {
      t.copy(P[Math.min(n - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
      const h = Math.sqrt(Math.max(0, 1 - t.y * t.y));     // 1 on the flat, 0 in a drop
      if (h > 0.15) { up.copy(DOWN).addScaledVector(t, -DOWN.dot(t)).normalize().negate(); side.crossVectors(t, up).normalize(); }
      else { side.addScaledVector(t, -side.dot(t)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(t, -t.x); side.normalize(); up.crossVectors(side, t).normalize(); }
      // round 66: sized by the flow (A, m2). Flat: a ribbon 2.2 times as wide as it is deep, on the invert. Falling: a rope of the same
      // area. free: a stream in the air (the pour into a tank), round, thinning as it speeds up, not pressed to any invert.
      let ax, ay;
      if (full) { ax = ay = R * 0.93; }
      else {
        const a_ = A || areaOf(2), rope = Math.min(R * 0.80, Math.max(0.0045, Math.sqrt(a_ / Math.PI)));
        const dep = Math.min(R * 0.62, Math.max(0.0035, Math.sqrt(a_ / (2.2 * Math.PI)))), wid = Math.min(R * 0.93, dep * 2.2);
        if (free) { const k = 1 - 0.40 * (cum[i] / Math.max(1e-6, cum[n - 1])); ax = ay = rope * k; }
        else { ax = rope + (wid - rope) * h; ay = rope + (dep - rope) * h; }
      }
      c.copy(P[i]); if (!full && !free) c.addScaledVector(up, -(R - ay * 0.98) * h);
      for (let k = 0; k <= K; k++) { const a = 2 * Math.PI * k / K; v.copy(c).addScaledVector(side, Math.cos(a) * ax).addScaledVector(up, Math.sin(a) * ay); posA.push(v.x, v.y, v.z); uvA.push(cum[i] / WATER_TILE, k / K); }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) { const a0 = i * (K + 1) + k, b0 = a0 + K + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(posA, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uvA, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return { geo, cum, P };
  }
  function makeWater(parent, path, R, kind, full, name, A, free) {
    const G = waterGeometry(path, R, full, A, free); if (!G) return null;
    const mesh = new T.Mesh(G.geo, waterMaterial(kind)); mesh.name = 'flow_live_' + name; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 2;
    mesh.raycast = () => { };     // contents are not controls: a click goes through the water to the pipe
    mesh.userData.isStream = true; mesh.userData.liveWater = true; mesh.userData.label = mesh.name; parent.add(mesh);
    const w = { mesh, cum: G.cum, L: G.cum[G.cum.length - 1], P: G.P, kind, full, on: false, active: false, t: 0, tOff: Infinity, s0: 0, delay: 0, front: 0, tail: 0, path0: path, R, A: A || areaOf(2), free: !!free }; waters.push(w); return w;
  }
  // the same body at another flow: a faucet's ribbon becomes a flush's surge when the flush joins it, and goes back
  function resizeWater(w, A) {
    if (w.full || Math.abs(A - w.A) / w.A < 0.12) return;
    const G = waterGeometry(w.path0, w.R, false, A, w.free); if (!G) return;
    w.mesh.geometry.dispose(); w.mesh.geometry = G.geo; w.A = A;
  }
  function segAt(w, d) { let i = 0; const c = w.cum; while (i < c.length - 1 && c[i + 1] <= d + 1e-6) i++; return i; }
  function stepWater(dt) {
    for (const k in waterTex) waterTex[k].offset.x = (waterTex[k].offset.x - dt * WATER_SCROLL / WATER_TILE) % 1;
    for (const w of waters) {
      if (w.active) {
        w.t += dt; const run = Math.max(0, w.t - w.delay) * WATER_V, gone = Math.max(0, w.t - w.tOff - w.delay) * WATER_V;
        w.front = w.full ? w.L : Math.min(w.L, w.s0 + run);
        w.tail = w.full ? (w.tOff < Infinity ? w.L : w.s0) : Math.min(w.L, w.s0 + gone);
        if (w.tOff < Infinity && w.tail >= Math.min(w.front, w.L) - 1e-6 && w.t - w.tOff > w.delay) w.active = false;
      }
      const a = segAt(w, w.tail), b = segAt(w, w.front), show = w.active && b > a && (!w.inst || w.inst.parent);
      w.mesh.visible = !!show; if (show) w.mesh.geometry.setDrawRange(a * 6 * WATER_K, (b - a) * 6 * WATER_K);
    }
  }
  // on: the water sets off from s0 after delay. off: the supply stops, and what is already in the pipe runs on and out (the tail follows
  // the front at the same speed), so a flush is a slug of water that travels the whole way to the tank or the street.
  function setWater(w, on, delay, s0) {
    if (on) { if (!w.on || (s0 || 0) < w.s0 - 0.01) { w.t = 0; w.delay = delay || 0; w.s0 = s0 || 0; w.front = w.tail = w.s0; w.active = true; } w.tOff = Infinity; }
    else if (w.on && w.active && w.tOff === Infinity) w.tOff = w.t;
    w.on = on;
  }
  // a house run's bore, read off the column Blender drew in it (the column is never shown any more: it stood still)
  function boreOf(f) {
    if (f.bore) return f.bore;
    const ob = new T.Box3().setFromObject(f.obj), pb = new T.Box3().setFromPoints(f.path), so = ob.getSize(new T.Vector3()), sp = pb.getSize(new T.Vector3());
    let r = Math.min((so.x - sp.x) / 2, (so.y - sp.y) / 2, (so.z - sp.z) / 2); if (!(r > 0.0015)) r = 0.004;
    return (f.bore = Math.min(0.08, r / 0.60 * 0.86));     // build_pipes draws the column at 0.60 of the pipe's outside radius; the bore is about 0.86 of it
  }
  // how far along w the point pt joins it: measured on the SEGMENTS (round 64: it read the corners only, and a straight building drain has two,
  // so a bath branch half way down it started its water at the top)
  function nearestS(w, pt) { let best = 0, bd = 1e9; for (let i = 1; i < w.P.length; i++) { const a = w.P[i - 1], ab = w.P[i].clone().sub(a), L2 = ab.lengthSq(); const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, pt.clone().sub(a).dot(ab) / L2)); const d = a.clone().addScaledVector(ab, t).distanceToSquared(pt); if (d < bd) { bd = d; best = w.cum[i - 1] + t * Math.sqrt(L2); } } return best; }
  function showFlows() {
    const live = [...running];
    // air keeps its column and its two slugs; water and waste are bodies that move (above)
    for (const sl of slugs) sl.visible = false;
    let i = 0;
    for (const f of flows) {
      if (f.kind !== 'air') { f.obj.visible = false; continue; }
      f.obj.visible = inConfig(f.obj.userData.config) && live.some(k => FLOW_SETS[k].kind === 'air' && inSet(FLOW_SETS[k], f.run));
      if (!f.obj.visible || !f.path.length) continue;
      for (let k = 0; k < 2; k++, i++) {
        if (!slugs[i]) { const m = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), SLUG_MAT.air); scene.add(m); slugs.push(m); }
        const sl = slugs[i]; sl.material = SLUG_MAT.air; sl.visible = true; sl.userData.path = f.path; sl.userData.t = k * 0.5; sl.scale.setScalar(2.2);
      }
    }
    // Round 66: every SOURCE has its own body of water in each run it passes through, with its own start, its own timing and its own
    // size. It used to be one body per run, sized by whatever was live, so a flush made the faucet's ribbon swell the whole way to
    // the tank the moment the lever went down. Now the faucet's ribbon runs on and the flush comes down the pipe as a surge over it,
    // arriving when it arrives. The disposal's waste stands in for the faucet's clear water in the drains they share.
    const wantOn = new Set();
    for (const k of live) { const set = FLOW_SETS[k]; if (set.kind === 'air') continue;
      let dist = 0, endPt = null; const lead = set.runs ? (k === 'faucet' || k === 'disposal' ? 1.9 : (FIX_KEYS.has(k) ? 1.4 : 0.4)) : 0;
      const list = flows.filter(f => f.kind === set.kind && inSet(set, f.run) && inConfig(f.obj.userData.config) && f.path.length > 1 && !(k !== 'lift_pump' && k !== 'sewer' && CONFIG.sewer === 'city_lift' && f.run === 'pipe_dwv_city_main'));
      if (set.runs) list.sort((p, q) => set.runs.indexOf(p.run) - set.runs.indexOf(q.run));
      for (const f of list) {
        const supply = /^pipe_supply/.test(f.run); if (supply && !waterOn) continue;
        if (k === 'faucet' && !supply && running.has('disposal')) continue;
        if (!f.water) { const pth = f.path.slice(); if (!supply && pth[pth.length - 1].y > pth[0].y + 0.02) pth.reverse(); f.water = {}; f.pathDown = pth; }
        const pressure = supply || /^(pipe_septic_spray_line|pipe_dwv_force_main)/.test(f.run);     // round 65: a line under pressure runs full, end to end at once
        if (!f.water[k]) f.water[k] = makeWater(pipes, f.pathDown, boreOf(f), set.kind, pressure, k + '_' + f.run, areaOf(GPM[k] || 2));
        const w = f.water[k]; if (!w) continue;
        let s0 = 0, delay = 0;
        if (!supply && set.runs) { if (endPt) { s0 = nearestS(w, endPt); } delay = lead + dist / WATER_V; dist += w.L - s0; endPt = w.P[w.P.length - 1]; }
        wantOn.add(w); setWater(w, true, delay, s0);
      }
    }
    for (const f of flows) { if (!f.water) continue; for (const key in f.water) { const w = f.water[key]; if (w && !wantOn.has(w)) setWater(w, false); } }
  }
  // a model's own water: any node carrying a flow_path extra (model frame, Blender axes). flow_clips turn it on as water,
  // waste_clips as waste; flow_lead is how long the water takes to reach the start of the path (down the stream and the throat).
  function modelWater(inst) {
    const found = []; inst.traverse(o => { if (o.userData && o.userData.flow_path && (o.userData.flow_clips || o.userData.waste_clips)) found.push(o); });
    for (const o of found) {
      let path = []; try { path = JSON.parse(o.userData.flow_path).map(q => new T.Vector3(q[0], q[2], -q[1])); } catch (e) { }
      if (path.length < 2) continue;
      const R = +o.userData.flow_r || 0.016, lead = +o.userData.flow_lead || 0, nm = nodeName(o);
      const mk = (kind, clips) => { if (!clips) return; const w = makeWater(inst, path, R, kind, false, kind + '_' + nm); if (w) { w.inst = inst; w.clips = String(clips).split(','); w.lead = lead; } };
      mk('water', o.userData.flow_clips); mk('waste', o.userData.waste_clips);
    }
  }
  function stepModelWater() {
    for (let i = waters.length - 1; i >= 0; i--) { const w = waters[i]; if (w.inst && !w.inst.parent) { w.mesh.geometry.dispose(); waters.splice(i, 1); } }     // the yard was changed: its models went
    const byInst = new Map();
    for (const w of waters) { if (!w.inst) continue; const A = w.inst.userData.anim; const on = !!A && waterOn && w.clips.some(c => A.state[c] && A.state[c].open); w.wantOn = on; if (on && w.kind === 'waste') byInst.set(w.inst, true); }
    for (const w of waters) { if (!w.inst) continue; const on = w.wantOn && !(w.kind === 'water' && byInst.get(w.inst));
      if (on && !w.on) { const pl = w.inst.userData.pl, fx = pl && FIXTURES.filter(x => x.socket === pl.socket && (w.kind === 'waste') === (x.key === 'disposal')); if (fx && fx.length) resizeWater(w, areaOf(GPM[fx[0].key] || 2)); }
      setWater(w, on, w.lead, 0); }
  }
  function stepFlow(dt) {
    for (const sl of slugs) {
      if (!sl.visible || !sl.userData.path) continue;
      sl.userData.t = (sl.userData.t + dt * 0.32) % 1;
      sl.position.copy(pointAt(sl.userData.path, sl.userData.t));
    }
    syncFixtureFlows(); stepModelWater(); stepWater(dt); syncPlant(); stepPlantSims(dt);
  }
  // Round 61: a clip that tells a story once (the food going down) is not played backwards to switch it off: the scraps would come
  // back up out of the ring. It stops, and the model is at rest. And the disposal is run with the water on: if the faucet is off
  // when the disposal starts, the page opens it, and shuts it again when the disposal stops (not if you had opened it yourself).
  const ONE_WAY = /^disposal_run$/;
  function afterClip(inst, name, on) {
    if (name !== 'disposal_run' || !inst.userData.anim) return;
    const A = inst.userData.anim, fa = A.state.faucet_run && A.state.faucet_run.open;
    if (on && !fa && waterOn && A.clips.some(c => c.name === 'faucet_run')) { inst.userData.autoFaucet = true; playNamed(inst, 'faucet_run', true); running.add('faucet'); showFlows(); }
    else if (!on && inst.userData.autoFaucet) { inst.userData.autoFaucet = false; if (fa) { playNamed(inst, 'faucet_run', false); running.delete('faucet'); showFlows(); } }
  }
  function flowKeyFor(o) {
    const n = nodeName(o), inst = o.userData.inst, sock = inst && inst.userData.pl && inst.userData.pl.socket;
    if (sock === 'sock_kitchen_sink_kitchen' || !sock) {
      if (/^(faucet|sprayer|pulldown|aerator|diverter)/.test(n)) return 'faucet';
      if (/^disposal/.test(n) || n === 'grind_chamber' || n === 'turntable') return 'disposal';
    }
    if (/^washer/.test(n)) return 'laundry';
    // round 64: the fixture this part belongs to, by where it stands (two vanities, two toilets and two tubs share their models)
    const f = sock && FIXTURES.find(x => x.socket === sock && x.key !== 'faucet' && x.key !== 'disposal');
    if (f && /^(handle|trip_lever|tub|spout|shower|faucet|cartridge|stem|diverter|tank|bowl|flapper|chain)/.test(n)) return f.key;
    return null;
  }
  // ---------------------------------------------------------------- a cover you can take off
  // The septic lids and the filter box lid have clips in their own models. The meter box lid is drawn by
  // build_pipes.py along with the service, so it has no clip and no way to come off (Jake: "the meter cover doesn't
  // come off"). Same gesture, done here: lift it and set it beside the box, click again to put it back.
  function lidOff(o) {
    if (o.userData.inst) return null;                    // a model's own lid has a clip; leave it to the clip
    const nm = nodeName(o); if (!/_lid$|^lid_/.test(nm)) return null;
    const home = plugs.get(o);
    if (home) { o.position.copy(home); plugs.delete(o); return nm + ' (back on)'; }
    plugs.set(o, o.position.clone());
    const w = new T.Box3().setFromObject(o).getSize(new T.Vector3());
    o.position.add(new T.Vector3(Math.max(0.35, w.x * 1.1), 0.02, 0));
    return nm + ' (cover off)';
  }
  // ---------------------------------------------------------------- the house shutoff and the meter cover (Jake 2026-09-13)
  // "the valve needs to be in the default on position, and it can be turned off: water off to the house." The ball valve
  // in the box by the house has its lever as its own node, pivoting on the stem: along the pipe is ON, a quarter turn
  // across is OFF. OFF takes the water out of every house supply run, the hose bibs and the fixtures' streams. The
  // meter's register cover is its own node on its hinge and flips open to read the dial.
  function pipeNode(name) { let n = null; pipes.traverse(x => { if (!n && nodeName(x) === name && !(x.parent && nodeName(x.parent) === name)) n = x; }); return n; }
  function turnNode(node, worldAxis, ang) {
    if (!node.userData.q0) node.userData.q0 = node.quaternion.clone();
    const ax = worldAxis.clone(); if (node.parent) { node.parent.updateMatrixWorld(true); ax.transformDirection(node.parent.matrixWorld.clone().invert()); }
    node.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(ax.normalize(), ang)); node.updateMatrixWorld(true);
  }
  function shutoffValve(o) {
    if (!/^house_shutoff_valve/.test(nodeName(o))) return null;
    const lever = pipeNode('house_shutoff_valve_lever'); if (!lever) return null;
    waterOn = !waterOn;
    if (waterOn) { lever.quaternion.copy(lever.userData.q0); lever.updateMatrixWorld(true); }
    else turnNode(lever, new T.Vector3(0, 1, 0), Math.PI / 2);
    if (!waterOn) {
      for (const [nm, on] of bibsOn) if (on) { bibsOn.set(nm, false); pipes.traverse(x => { if (x.isMesh && nodeName(x) === nm + '_stream') x.visible = false; }); }
      equip.children.forEach(u => { let pk = ''; u.traverse(x => { if (!pk && x.userData.pack) pk = x.userData.pack; }); if (pk === 'water_filter') return; u.traverse(x => { if (x.userData.isStream) x.visible = false; }); });
    }
    showFlows();
    return waterOn ? 'House shutoff ON: lever along the pipe, water to the house' : 'House shutoff OFF: lever across the pipe, no water to the house';
  }
  function meterCover(o) {
    if (nodeName(o) !== 'meter_register_cover') return null;
    const c = pipeNode('meter_register_cover'); if (!c) return null;
    c.userData.open = !c.userData.open;
    if (c.userData.open) turnNode(c, new T.Vector3(0, 0, 1), -Math.PI * 100 / 180); else { c.quaternion.copy(c.userData.q0); c.updateMatrixWorld(true); }
    return 'Meter register cover ' + (c.userData.open ? 'open: read the dial' : 'closed');
  }
  // ---------------------------------------------------------------- tools (round 20)
  // Jake 2026-09-14: "I think it really needs to be, like, tools. So I click elevation, then I click what I wanna see the elevation
  // of ... if I click something and wanna remove the cover, I should be able to click remove ... a riser lid needs to be completely
  // removed, but over to the side. A toilet doesn't need to disappear when you click on it, it needs to have a cutaway ... if you're
  // clicking the garbage disposal to see a cutaway, then you wanna click on it to watch it work ... the same platform across the app."
  // Look names a part and works the obvious controls (handles, switches, dials, doors, the shower wall). Elevation pulls the unit
  // you click up square on. Cutaway cuts the part you click (a section where the model ships one, the lengthwise cut otherwise)
  // and never makes anything vanish. Remove takes a cover, door, lid, panel or plug off and sets it aside. Work runs the machine
  // or fixture you click, with its water or air.
  // ---------------------------------------------------------------- the meters (round 47)
  // Jake: "we need to start building some tools. A multimeter, that way it shows leads in the hands and they click the left hand or the
  // right hand and click where they should measure, and the meter shows them the voltage. Same with a clamp: they click the wire, it
  // clamps on, it tells them amperage."
  //
  // Every test point in the house is a name and what is actually on it. A reading comes from the two points the probes are on: two
  // different legs of the 240 give 240, a leg and a neutral or a ground give 120, the same leg twice gives 0, and a probe on something
  // that is not a conductor reads OL, which is what a real meter shows. A breaker that is off kills everything downstream of it, which is
  // most of what the tool is for.
  const HOT_A = { v: 120, node: 'A' }, HOT_B = { v: 120, node: 'B' };
  // Round 48: the panel's own circuit table, the same one the builder lays out. Space order sets which leg a breaker's stab lands on, so a
  // probe on a lug screw reads the leg that space really is.
  const CIRCUITS_BY_SLUG = {
    hvac: { legs: ['A', 'B'], amps: 14.2, label: 'the condenser and air handler, 40 A two pole' },
    wh: { legs: ['A', 'B'], amps: 18.8, label: 'the water heater, 30 A two pole' },
    kitchen_a: { legs: ['A'], amps: 9.4, label: 'kitchen small appliance' },
    laundry: { legs: ['A'], amps: 7.8, label: 'the laundry' },
    kitchen_b: { legs: ['B'], amps: 8.2, label: 'kitchen small appliance, GFCI' },
    garage: { legs: ['B'], amps: 3.1, label: 'the garage, GFCI' },
    dishwasher: { legs: ['A'], amps: 6.4, label: 'the dishwasher' },
    exterior: { legs: ['A'], amps: 1.2, label: 'the outside receptacles, GFCI' },
    disposal: { legs: ['B'], amps: 5.8, label: 'the disposal' },
    living: { legs: ['B'], amps: 2.4, label: 'the living room, AFCI' },
    fridge: { legs: ['A'], amps: 4.6, label: 'the refrigerator' },
    dining: { legs: ['A'], amps: 1.8, label: 'the dining area, AFCI' },
    bed2: { legs: ['B'], amps: 1.6, label: 'bedroom 2, AFCI' },
    lights_2: { legs: ['B'], amps: 2.2, label: 'lighting' },
    bed3: { legs: ['A'], amps: 1.5, label: 'bedroom 3, AFCI' },
    washer: { legs: ['A'], amps: 6.1, label: 'the washer' },
    master: { legs: ['B'], amps: 2.0, label: 'the master bedroom, AFCI' },
    smoke: { legs: ['B'], amps: 0.3, label: 'the smoke and CO alarms' },
    bath: { legs: ['A'], amps: 3.4, label: 'the bathrooms, GFCI' },
    gdo: { legs: ['A'], amps: 4.2, label: 'the garage door opener' },
    lights_1: { legs: ['B'], amps: 2.6, label: 'lighting' },
    softener: { legs: ['B'], amps: 1.1, label: 'the water softener' },
    septic: { legs: ['A'], amps: 7.4, label: 'the septic plant' },
    spd: { legs: ['A', 'B'], amps: 0.1, label: 'the whole house surge protector' },
  };
  function slugOf(nm) {
    const m = /^(?:breaker|romex)_([a-z0-9_]+?)_(?:lug|conductor|handle|jacket|black|red|white|ground|connector|pigtail|neutral|test)/.exec(nm)
      || /^breaker_([a-z0-9_]+)$/.exec(nm);
    if (!m) return null;
    let sl = m[1];
    if (CIRCUITS_BY_SLUG[sl]) return sl;
    sl = sl.replace(/_(a|b)$/, '');
    return CIRCUITS_BY_SLUG[sl] ? sl : null;
  }

  const POINTS = [
    [/^bus_a$|^lug_l1$|^main_lug_a$|hot_bus_bars|^main_breaker$|service_entrance_cable/, HOT_A, 'the hot bus, both legs of the 240 coming in'],
    [/^breaker_(wh|hvac|septic|ahu|cond)(_handle)?$/, HOT_A, 'the load side of that breaker'],
    [/^bus_b$|^lug_l2$|^main_lug_b$/, HOT_B, 'L2, the other leg'],
    [/neutral_bar|bus_neutral|^neutral$/, { v: 0, node: 'N' }, 'the neutral bar, bonded to ground at the main'],
    [/ground_bar|^ground$|ground_lug|_pg$|term_ground/, { v: 0, node: 'G' }, 'the ground bar'],
    [/^term_l1$|^wh_l1$|^t1$/, HOT_A, 'L1 at the unit'],
    [/^term_l2$|^wh_l2$|^t2$/, HOT_B, 'L2 at the unit'],
    [/^term_rc$|^term_rh$|^term_r$|sub_screw_rc|sub_screw_rh|sub_screw_r$/, { v: 24, node: 'R' }, 'R, the 24 V hot off the control transformer'],
    [/^term_c$|sub_screw_c$/, { v: 0, node: 'C' }, 'C, the 24 V common'],
    [/^term_(w1|w2|y1|y2|g|o|e)$|sub_screw_(w1|w2|y1|y2|g|ob|aux)/, { v: 0, node: 'SIG' }, 'a call wire: 24 V to C only while that call is on'],
    [/^term_1$/, HOT_A, 'terminal 1 on the mini split, one leg of the line'],
    [/^term_2$/, HOT_B, 'terminal 2 on the mini split, the other leg'],
    [/^term_3$/, { v: 0, node: 'SIG' }, 'terminal 3, the signal between the head and the outdoor unit'],
  ];
  // what a circuit carries with its load running, and the breaker that feeds it
  const CIRCUITS = [
    [/cable_wh_branch_romex|whip_wh_flex|box_wh_junction|breaker_wh/, { amps: 18.8, breaker: 'wh', label: 'the water heater, 30 A two pole' }],
    [/whip|disconnect|contactor|^t1$|^t2$|term_l1|term_l2|breaker_hvac/, { amps: 14.9, breaker: 'hvac', label: 'the condenser (compressor 14.1 rated load plus the 0.8 amp fan, Rheem RA14 030)' }],
    [/cable_hvac_ahu|air_handler/, { amps: 6.4, breaker: 'hvac', label: 'the air handler' }],
    [/lv_|tstat|term_(r|c|w1|w2|y1|y2|g|o)/, { amps: 0.4, breaker: null, label: 'the 24 V control circuit' }],
    [/service_entrance_cable|se_conductor|hot_bus_bars/, { amps: 47.5, breaker: null, label: 'the service, everything the house is drawing' }],
  ];
  // what an ohmmeter reads across a motor's own terminals, in ohms
  const WINDING = {
    compressor: { ohms: 2.4, why: 'the compressor: run winding across its own terminals' },
    fan_motor: { ohms: 11.6, why: 'the condenser fan motor winding' },
    fan: { ohms: 11.6, why: 'the condenser fan motor winding' },
    blower: { ohms: 4.8, why: 'the blower motor winding' },
  };
  function pointFor(o) {
    const nm = partName(o) || base(o.name);
    const inst = o.userData.inst || (typeof unitOf === 'function' ? unitOf(o) : null);
    // the panel's own parts first: they carry which circuit and which leg in their names
    const sl = slugOf(nm);
    if (sl) {
      const C = CIRCUITS_BY_SLUG[sl];
      const second = /_(b)$|_red$/.test(nm) && C.legs.length > 1;
      if (/white|neutral/.test(nm)) return { nm, p: { v: 0, node: 'N' }, why: 'the neutral of ' + C.label };
      if (/ground|pigtail/.test(nm)) return { nm, p: { v: 0, node: 'G' }, why: 'the ground of ' + C.label };
      // Round 49 (Jake: "make the whole breaker read the circuit"): the handle and the test button are moulded plastic on a real breaker, but
      // a trainee putting a probe on the breaker means the breaker, so the whole device reads its circuit. The note says where the reading
      // really comes from, which is the lug screw an inch away.
      if (/jacket$|_connector$/.test(nm)) return { nm, p: null, why: 'the cable jacket is insulation: a meter reads OL on it' };
      const leg = second ? C.legs[1] : C.legs[0];
      const onDevice = /handle$|test_button$/.test(nm);
      return { nm, p: leg === 'A' ? HOT_A : HOT_B,
               why: 'the ' + leg + ' leg feeding ' + C.label + (onDevice ? ' (on a real one you read this at the lug screw beside the handle)' : '') };
    }
    if (/^neutral_bar|^main_neutral_lug/.test(nm)) return { nm, p: { v: 0, node: 'N' }, why: 'the neutral bar, bonded to ground at the main' };
    if (/^ground_bar|^grounding_electrode/.test(nm)) return { nm, p: { v: 0, node: 'G' }, why: 'the ground bar' };
    if (/^main_lug(_screw)?_a$|^se_conductor_l1$/.test(nm)) return { nm, p: HOT_A, why: 'L1 of the service, ahead of the main' };
    if (/^main_lug(_screw)?_b$|^se_conductor_l2$/.test(nm)) return { nm, p: HOT_B, why: 'L2 of the service, ahead of the main' };
    if (/^se_conductor_neutral$/.test(nm)) return { nm, p: { v: 0, node: 'N' }, why: 'the service neutral' };
    if (/^bonding_screw$/.test(nm)) return { nm, p: { v: 0, node: 'G' }, why: 'the bonding screw: this is what ties neutral to ground' };
    // Round 56 (Jake: "I should be able to pop it over to ohms and then measure ohms against a wire"). Every named conductor on a
    // placed unit is a conductor: its own node, so the same wire end to end reads near zero and two different ones read open,
    // which is what an ohmmeter does. Without this every wire in the house was "not a conductor" and the meter just said OL.
    if (inst && /^(wire_|cap_lead_|lead_|conductor|romex_|whip_|loom_|stat_|jacket)/.test(nm) && !/jacket$/.test(nm)) {
      return { nm, p: { v: 0, node: 'w:' + (inst.userData.model || '') + ':' + nm }, why: 'a conductor in ' + pretty(inst.userData.model || 'this unit') };
    }
    // a motor and a compressor are windings, which is the thing you actually put an ohmmeter across out here
    { const bx = benchFor(o); if (bx) return { nm, p: { v: 0, node: 'b:' + bx.key + ':' + (bx.term || nm) }, why: (bx.term ? bx.term + ' on ' : '') + bx.B.name }; }
    if (inst && WINDING[nm]) return { nm, p: { v: 0, node: 'm:' + nm }, why: WINDING[nm].why };
    for (const [re_, p, why] of POINTS) if (re_.test(nm)) return { nm, p, why };
    const m = /^(lead|wire|conductor)s?_(red|black|white|blue|green|yellow|brown|orange)/.exec(nm);
    if (m) {
      const col = m[2];
      if (col === 'green') return { nm, p: { v: 0, node: 'G' }, why: 'the equipment ground' };
      if (col === 'white') return { nm, p: { v: 0, node: 'N' }, why: 'the neutral' };
      if (col === 'blue') return { nm, p: { v: 0, node: 'C' }, why: 'C, the 24 V common' };
      if (col === 'red') return { nm, p: HOT_B, why: 'a line conductor' };
      if (col === 'black') return { nm, p: HOT_A, why: 'a line conductor' };
      return { nm, p: { v: 0, node: 'SIG' }, why: 'a control conductor' };
    }
    return { nm, p: null, why: 'not a conductor: a meter reads OL on it' };
  }
  function circuitFor(o) {
    const nm = partName(o) || base(o.name);
    const sl = slugOf(nm);
    if (sl) { const C = CIRCUITS_BY_SLUG[sl]; return { amps: C.amps, breaker: sl, label: C.label }; }
    for (const [re_, c] of CIRCUITS) if (re_.test(nm)) return c;
    return null;
  }
  function statCalling() {
    for (const u of equip.children) { if (u.userData.stat) { const c = statCall(u); if (c === 'heat' || c === 'cool') return true; } }
    return false;
  }
  function liveAt(o, pt) {
    if (!pt) return null;
    const c = circuitFor(o);
    if (c && c.breaker && breakers && breakers[c.breaker] === false) return { v: 0, node: pt.node, dead: true };
    return pt;
  }
  function readVolts(a, b) {
    if (!a || !a.p || !b || !b.p) return { text: 'OL', note: 'one probe is not on a conductor' };
    const A_ = liveAt(a.o, a.p), B_ = liveAt(b.o, b.p);
    const n1 = A_.node, n2 = B_.node, dead = A_.dead || B_.dead;
    const both = (x, y) => (n1 === x && n2 === y) || (n1 === y && n2 === x);
    let v = 0, note = '';
    // both probes on the same bus bar assembly: that is a tech reading across the two legs, which is what the bars carry
    if (a.nm === b.nm && /hot_bus_bars|service_entrance_cable/.test(a.nm) && !dead) return { text: '240 V AC', v: 240, note: 'across the two legs of the bus' };
    if (dead) note = 'that circuit is switched off at the breaker';
    else if (both('A', 'B')) { v = 240; note = 'across both legs'; }
    else if ((n1 === 'A' || n1 === 'B') && (n2 === 'N' || n2 === 'G')) { v = 120; note = 'one leg to ' + (n2 === 'N' ? 'neutral' : 'ground'); }
    else if ((n2 === 'A' || n2 === 'B') && (n1 === 'N' || n1 === 'G')) { v = 120; note = 'one leg to ' + (n1 === 'N' ? 'neutral' : 'ground'); }
    else if (n1 === n2 && (n1 === 'A' || n1 === 'B')) { v = 0; note = 'both probes are on the same leg'; }
    else if (both('R', 'C') || both('R', 'G') || both('R', 'N')) { v = 24; note = 'the control transformer'; }
    else if (both('SIG', 'C') || both('SIG', 'G')) { v = statCalling() ? 24 : 0; note = statCalling() ? 'that call is on' : 'no call on that wire right now'; }
    else if (both('R', 'SIG')) { v = statCalling() ? 0 : 24; note = statCalling() ? 'the call is made, so there is nothing across it' : 'open: the stat has not made that call'; }
    else note = 'nothing between those two';
    return { text: v.toFixed(v >= 100 ? 0 : 1) + ' V AC', v, note };
  }
  function readAmps(o) {
    const nm = partName(o) || base(o.name);
    const c = circuitFor(o);
    if (!c) return { text: 'OL', note: 'that is not a conductor the clamp can read' };
    if (/jacket|romex|^cable_|whip$/.test(nm) && !/conductor/.test(nm)) return { text: '0.0 A', note: 'the jaw is round the whole cable, so the two conductors cancel. Clamp ONE conductor.' };
    if (c.breaker && breakers && breakers[c.breaker] === false) return { text: '0.0 A', note: c.label + ' is off at the breaker' };
    return { text: c.amps.toFixed(1) + ' A', note: c.label + ' with the load running' };
  }

  // ---------------------------------------------------------------- Round 52: the grab tool
  // Jake: "the ability to grab something and move it, like if the capacitor, I want to take the leads off the capacitor and put
  // them back on... and if you don't de-energize the capacitor before you start to work on it, it can give a big warning."
  //
  // What can be grabbed is the MODEL's business, not the page's: each model ships a grab block (which parts come off, the tab
  // each one belongs on, which way it pulls, and whether the thing holds a charge) and this reads it. The condenser is the first,
  // and the same contract covers a contactor's wires, a thermostat's wires or a water heater element with no new page code.
  //
  // The safety is the whole point, so it is a sequence with a consequence at every wrong step:
  //   breaker still on            the pliers will not close on it, and it tells you why
  //   breaker off, disconnect in  same, because the unit is still fed from the disconnect
  //   both dead, not discharged   it lets you, and the capacitor bites: a flash, a bang and a lesson
  //   discharged                  the lead comes off clean
  // Shorting the tabs with the pliers IS the discharge, which is what a tech does with an insulated screwdriver, and doing that
  // while it is live is its own flash.
  // Round 54: the rings that say "this comes off". One per grabbable part, put where the model says its terminal is, drawn in the
  // normal pass so the cabinet hides them until you open it, which is exactly when you want to see them.
  let grabMarks = [];
  function grabMarkClear() {
    for (const m of grabMarks) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); }
    grabMarks = [];
  }
  function grabMarkShow() {
    grabMarkClear();
    if (!pliers) return 0;
    const mat = new T.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, depthTest: true, side: T.DoubleSide });
    let n = 0;
    for (const inst of equip.children) {
      const U = grabSpec(inst); if (!U) continue;
      for (const nm in U.parts) {
        const spec = U.parts[nm];
        let at = null;
        if (spec.grab_at) at = new T.Vector3(spec.grab_at[0], spec.grab_at[2], -spec.grab_at[1]);
        else {
          let f = null; inst.traverse(x => { if (!f && (partName(x) || base(x.name)) === nm) f = x; });
          if (f) at = new T.Box3().setFromObject(f).getCenter(new T.Vector3());
        }
        if (!at) continue;
        const g = new T.TorusGeometry(0.013, 0.0022, 8, 20);
        const o = new T.Mesh(g, mat);
        if (spec.grab_at) inst.localToWorld(at);
        o.position.copy(at); o.userData.noPick = true; o.name = 'grab_mark_' + nm;
        scene.add(o); grabMarks.push(o); n++;
      }
    }
    return n;
  }
  function grabMarkFace() {
    if (!grabMarks.length) return;
    const eye = camera.getWorldPosition(new T.Vector3());
    for (const m of grabMarks) m.lookAt(eye);
  }
  let GRAB = {};
  let pliers = null, pliersJaw = null, inHand = null;     // inHand: the lead riding in the jaws
  const GRAB_STATE = new Map();     // per placed unit: what has been pulled, discharged, and put back wrong
  function grabState(inst) {
    let st = GRAB_STATE.get(inst);
    if (!st) { st = { discharged: false, discPulled: false, wrong: {}, off: {} }; GRAB_STATE.set(inst, st); }
    return st;
  }
  // Round 55 (Jake: "it says I have to turn the disconnect off in order to work on the capacitor, but I can't, it won't let me
  // access the disconnect"). It is a pull out, so it PULLS: the model carries a disconnect_pull clip on the block itself now, and
  // this is the one place that works it, whether you clicked it with the Look tool or with the pliers in your hand. Clicking the
  // box counts as clicking the block, because that is what a person aims at.
  function discPull(inst, want) {
    // Round 56 (Jake: "when I click the disconnect, the cover should come up and I should be able to click the disconnect again
    // and it pull out"). It is two moves at a real one, and you cannot pull a block out through a shut cover. Click one opens the
    // cover, click two pulls the block, click three puts it all back.
    if (!inst) return null;
    const st = grabState(inst);
    const has = n => { const A = inst.userData.anim; return A && A.clips.some(c => c.name === n); };
    if (want === false) {
      if (has('disconnect_pull')) playNamed(inst, 'disconnect_pull', false);
      if (has('disconnect_cover_open')) playNamed(inst, 'disconnect_cover_open', false);
      st.discStep = 0; st.discPulled = false;
      return 'block back in and the cover shut';
    }
    st.discStep = st.discStep || 0;
    if (st.discStep === 0) {
      st.discStep = 1; st.discPulled = false;
      if (has('disconnect_cover_open')) playNamed(inst, 'disconnect_cover_open', true);
      return 'disconnect cover up: the pull out block is behind it. Click it again to pull the block';
    }
    if (st.discStep === 1) {
      st.discStep = 2; st.discPulled = true;
      if (has('disconnect_pull')) playNamed(inst, 'disconnect_pull', true);
      return 'block out and in your pocket: the unit is dead at the unit now, whatever the breaker is doing';
    }
    return discPull(inst, false);
  }
  function grabSpec(inst) {
    if (!inst) return null;
    const m = inst.userData.model || '';
    return GRAB[m] || GRAB[m.replace(/^.*\//, '')] || GRAB[m.replace(/\.glb$/, '')] || null;
  }
  function grabPart(o) {
    // not every node in a model carries userData.inst: a part inside a group from the GLB does not, so ask the page which unit
    // this thing belongs to rather than trusting the stamp
    const inst = o.userData.inst || unitOf(o), U = grabSpec(inst);
    if (!U) return null;
    const nm = partName(o) || base(o.name);
    const spec = U.parts[nm];
    return spec ? { inst, U, nm, spec } : null;
  }
  // the flash a capacitor gives you, and the one a dead short gives you
  function grabFlash(strong) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.style.transition = 'none'; el.style.opacity = strong ? '0.92' : '0.55';
    setTimeout(() => { el.style.transition = 'opacity 0.5s'; el.style.opacity = '0'; }, 40);
  }
  async function takePliers() {
    if (pliers) { pliersDown(); return 'pliers down'; }
    let g; try { g = await loadModel('needle_nose.glb'); } catch (e) { return 'the pliers model is not in this pack'; }
    const o = g.scene.clone(true); stampParts(g, o); tuneMaterials(o);
    // the pose a hand holds them in: the tool is built along +y from the bite point, so +y has to come BACK toward you. A quarter
    // turn about x does that, and the rest is a little yaw and roll so it does not read like a diagram.
    const H = { position: [0.085, -0.075, -0.46], rotation: [1.32, 0.34, 0.12] };
    o.position.fromArray(H.position); o.rotation.fromArray(H.rotation); o.scale.setScalar(1);
    if (!camera.parent) scene.add(camera);
    camera.add(o); pliers = o;
    o.traverse(x => { x.layers.set(1); if (x.name === 'plier_jaw_moving') pliersJaw = x; });
    scene.traverse(x => { if (x.isLight) x.layers.enable(1); });
    setTool('grab'); grabButtons();
    const n = grabMarkShow();
    return 'pliers in hand. ' + (n ? n + ' things on this house can come off with them, each one ringed in yellow. The capacitor leads are inside the outdoor unit behind its service panel: click the panel and it comes off, pliers or no pliers.'
      : 'nothing in this house is set up to come off yet.') + ' Esc puts them down';
  }
  function pliersDown() {
    if (inHand) { leadHome(inHand, inHand.spec.terminal); }
    grabMarkClear();
    if (pliers) { camera.remove(pliers); pliers = null; pliersJaw = null; }
    setTool('look'); grabButtons();
  }
  function grabButtons() {
    const b = document.getElementById('grabbtn');
    if (b) b.classList.toggle('on', !!pliers);
  }
  function jawsShut(shut) {
    if (!pliersJaw) return;
    const open = 9 * Math.PI / 180;
    if (pliersJaw.userData.restX === undefined) pliersJaw.userData.restX = pliersJaw.rotation.x;
    pliersJaw.rotation.x = shut ? pliersJaw.userData.restX - open : pliersJaw.userData.restX;
  }
  // where a named tab is, in the world
  function termPoint(inst, U, name) {
    const p = U.terminals && U.terminals[name];
    return p ? inst.localToWorld(new T.Vector3(p[0], p[2], -p[1])) : null;
  }
  function nearestTerm(inst, U, at) {
    let best = null;
    for (const k in (U.terminals || {})) {
      const p = termPoint(inst, U, k); if (!p) continue;
      const d = p.distanceTo(at);
      if (!best || d < best.d) best = { k, d, p };
    }
    return best;
  }
  function powerCheck(inst, U) {
    // Round 57 (Jake: "I think just pulling that disconnect without turning the breaker off is also acceptable"). It is: the
    // disconnect is between the panel and the unit, so with the block in your pocket the unit is dead whatever the breaker is
    // doing. Either one kills it. What is never acceptable is reaching in with both of them made.
    const st = grabState(inst), P = U.power || {};
    const live = P.breaker && breakers && breakers[P.breaker] !== false;
    const pulled = !!(P.disconnect && st.discPulled);
    if (!pulled && live) {
      return { stop: true, why: 'that circuit is still ON at the panel and the disconnect is still in. Pull the disconnect, or kill the '
        + (BREAKER_LABEL[P.breaker] || P.breaker) + ' breaker.' };
    }
    return { stop: false, charged: !!P.holds_charge && !st.discharged, note: P.charge_note || '' };
  }
  function grabClick(o, hit) {
    const at = hit && hit.point ? hit.point.clone() : null;
    const inst = o.userData.inst || unitOf(o), U = grabSpec(inst);
    const nm = partName(o) || base(o.name);
    // put the one in your hand back on a tab
    if (inHand) {
      if (!U || inst !== inHand.inst) return 'you are holding ' + pretty(inHand.nm) + ': put it back on a tab first';
      const near = at ? nearestTerm(inst, U, at) : null;
      if (!near || near.d > 0.09) return 'aim at one of the tabs on the capacitor: C, FAN or HERM';
      return leadHome(inHand, near.k);
    }
    // the disconnect: pull it or put it back
    if (U && U.power && U.power.disconnect && new RegExp('^' + U.power.disconnect).test(nm)) return discPull(inst);
    // short the tabs: this is the discharge, and it is also how you weld a pair of pliers if you do it live
    if (U && /capacitor/.test(nm)) {
      const st = grabState(inst), P = powerCheck(inst, U);
      if (P.stop) { grabFlash(true); return 'BANG: you laid the pliers across a LIVE capacitor and shorted it out. ' + P.why + ' On a real one that is a welded pair of pliers and a face full of sparks.'; }
      if (!st.discharged) { st.discharged = true; grabFlash(false); return 'SNAP: the capacitor discharges across the pliers. That is the one it had left in it. Now the leads are safe to pull.'; }
      return 'already discharged: it reads zero volts across the tabs';
    }
    const g = grabPart(o);
    if (!g) {
      // a hand with pliers in it can still open a panel
      if (/panel|cover|deadfront|door|lid|shell|top_cap|access/.test(nm)) {
        // the wrapper node a GLB puts round a multi material part carries no inst stamp, and the clip player needs one
        let t_ = o;
        if (!t_.userData.inst) { let f_ = null; o.traverse(x => { if (!f_ && x.isMesh && x.userData.inst) f_ = x; }); if (f_) t_ = f_; }
        const r = lookAction(t_, hit); grabMarkFace(); return r;
      }
      if (U) return pretty(nm) + ': nothing to take hold of there. The leads that come off are ringed in yellow, on the capacitor.';
      return pretty(nm) + ': the pliers have nothing to take hold of here. What comes off is ringed in yellow: the capacitor leads in the outdoor unit, behind its service panel.';
    }
    const P = powerCheck(inst, U);
    if (P.stop) return 'STOP: that lead is on a live capacitor tab. ' + P.why;
    if (P.charged) {
      grabFlash(true);
      grabState(inst).discharged = true;
      return 'POP. It is dead at the breaker and at the disconnect, and it STILL bit you: ' + (U.power.charge_note || 'a run capacitor holds its charge') + '. Short the tabs with the pliers before you touch a lead. It is discharged now.';
    }
    return leadOff(g, at);
  }
  function leadOff(g, at) {
    const o = scene.getObjectByName(g.nm) || (() => { let f = null; g.inst.traverse(x => { if (!f && (partName(x) || base(x.name)) === g.nm) f = x; }); return f; })();
    if (!o) return 'cannot find ' + g.nm;
    const home = { parent: o.parent, matrix: o.matrix.clone() };
    const pull = new T.Vector3(g.spec.pull[0], g.spec.pull[2], -g.spec.pull[1]);
    const dir = pull.clone().transformDirection(g.inst.matrixWorld).normalize();
    scene.attach(o);
    o.position.add(dir.multiplyScalar(0.03));
    if (pliers) { pliers.attach(o); }
    jawsShut(true);
    inHand = { o, nm: g.nm, inst: g.inst, U: g.U, spec: g.spec, home };
    const mk = grabMarks.find(x => x.name === 'grab_mark_' + g.nm); if (mk) mk.visible = false;
    grabState(g.inst).off[g.nm] = true;
    return 'the ' + pretty(g.nm) + ' is off its ' + g.spec.terminal + ' tab and in the jaws. Click a tab to put it back (it belongs on ' + g.spec.terminal + ')';
  }
  function leadHome(L, term) {
    const o = L.o, st = grabState(L.inst);
    L.home.parent.attach(o);
    if (term === L.spec.terminal) {
      o.matrix.copy(L.home.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale);
      delete st.wrong[L.nm];
    } else {
      // on the wrong tab: it lands there, and the unit will tell you about it when you try to run it
      o.matrix.copy(L.home.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale);
      const a = termPoint(L.inst, L.U, L.spec.terminal), b = termPoint(L.inst, L.U, term);
      if (a && b) { const d = b.clone().sub(a); o.position.add(o.parent.worldToLocal(o.parent.localToWorld(new T.Vector3()).add(d))); }
      st.wrong[L.nm] = term;
    }
    delete st.off[L.nm];
    const mk2 = grabMarks.find(x => x.name === 'grab_mark_' + L.nm); if (mk2) mk2.visible = true;
    inHand = null; jawsShut(false);
    if (term !== L.spec.terminal) return 'the ' + pretty(L.nm) + ' is on the ' + term + ' tab. It belongs on ' + L.spec.terminal + '. Run the unit and see what that does.';
    return 'the ' + pretty(L.nm) + ' is back on ' + term + ', where it belongs';
  }
  // what the unit does about it when you try to run it
  function grabFault(inst) {
    const U = grabSpec(inst); if (!U) return null;
    const st = GRAB_STATE.get(inst); if (!st) return null;
    const off = Object.keys(st.off || {}), wrong = Object.keys(st.wrong || {});
    if (!off.length && !wrong.length) return null;
    if (off.length) return 'the contactor pulls in and the compressor hums, then the overload trips: ' + pretty(off[0]) + ' is still in your hand, so that winding has no capacitor on it.';
    const w = wrong[0];
    return 'the contactor pulls in and it will not start: ' + pretty(w) + ' is landed on ' + st.wrong[w] + ' instead of ' + U.parts[w].terminal + ', so the run capacitor is across the wrong winding.';
  }

  // Round 47: the meter itself, held in front of you. The model hangs off the camera so it travels with you, its display is driven
  // segment by segment the way the thermostats are, and the leads start at its own probe tips.
  const METER_FILE = { volts: 'multimeter.glb', amps: 'clamp_meter.glb' };
  const SEG_FONT = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
                     'O': 'abcdef', 'L': 'def', '-': 'g', ' ': '' };
  let meterObj = null;
  async function meterModel(kind) {
    let g; try { g = await loadModel(METER_FILE[kind]); } catch (e) { return null; }
    const o = g.scene.clone(true); stampParts(g, o); tuneMaterials(o);
    return o;
  }
  function meterSegs(obj) {
    if (obj.userData.segs) return obj.userData.segs;
    const segs = {};
    obj.traverse(x => { const m = /^digit_(\d|sign)_?([a-g]|dp|minus)?$/.exec(x.name || ''); if (m) segs[x.name] = x; });
    obj.userData.segs = segs; return segs;
  }
  // Round 51 (Jake: "the meter doesn't really show 240, I don't know what's wrong with the numbers there"). A segment of an
  // LCD is never added or taken away, it is lit or dark. Blender baked every bar in the material its own default character
  // wanted, so toggling visibility lit only the bars that happened to be born lit and the reading came out in pieces. The
  // page holds the model's own two LCD materials now and paints every bar with one of them, so all four digits are there
  // all the time and the number is solid.
  function meterLcd(obj) {
    if (obj.userData.lcd) return obj.userData.lcd;
    let on = null, off = null;
    obj.traverse(x => {
      if (!x.isMesh || !/^(digit|ann)_/.test(x.name || '')) return;
      for (const m of (Array.isArray(x.material) ? x.material : [x.material])) {
        if (!m) continue;
        if (!on && /lcd_on/.test(m.name || '')) on = m;
        if (!off && /lcd_off/.test(m.name || '')) off = m;
      }
    });
    obj.userData.lcd = { on, off };
    return obj.userData.lcd;
  }
  function meterPaint(o, lit) {
    if (!o) return;
    const L = meterLcd(meterObj);
    if (L.on && L.off) { o.visible = true; o.material = lit ? L.on : L.off; }
    else o.visible = lit;
  }
  function meterShowText(txt) {
    if (!meterObj) return;
    const segs = meterSegs(meterObj);
    for (const k in segs) meterPaint(segs[k], false);
    // the readout is digit_1 to digit_4 left to right, with a half digit in front that can only show a 1
    let body = String(txt).replace(/[^0-9.OL-]/g, '');
    let neg = body.startsWith('-'); if (neg) body = body.slice(1);
    let dp = body.indexOf('.'); const chars = body.replace('.', '').split('');
    while (chars.length < 4) chars.unshift(' ');
    const four = chars.slice(-4);
    if (dp >= 0) { const after = body.length - dp - 1; const pos = 4 - after; meterPaint(segs['digit_' + pos + '_dp'], true); }
    for (let i = 0; i < 4; i++) {
      const on = SEG_FONT[four[i]] !== undefined ? SEG_FONT[four[i]] : '';
      for (const ch of 'abcdefg') meterPaint(segs['digit_' + (i + 1) + '_' + ch], on.includes(ch));
    }
    meterPaint(segs['digit_sign_minus'], neg);
    if (chars.length > 4 && /^1/.test(chars[chars.length - 5] || '')) { for (const ch of 'bc') meterPaint(segs['digit_0_' + ch], true); }
    // the annunciators say what the dial is set to, and go dark with the display when the dial is at OFF
    const fn = meter ? meter.fn : 'off';
    const lit = {};
    if (fn !== 'off') {
      lit.ann_auto = true;
      if (/^(vac|amps)$/.test(fn)) lit.ann_ac = true;
      if (/^(vdc|adc|mv|ua|ma)$/.test(fn)) lit.ann_dc = true;
      if (/^(vac|vdc|mv)$/.test(fn)) lit.ann_unit_v = true;
      if (/^(amps|adc|ua|ma)$/.test(fn)) lit.ann_unit_a = true;
      if (fn === 'ohms') lit.ann_unit_ohm = true;
      if (fn === 'cap') lit.ann_unit_f = true;
      if (fn === 'cont') lit.ann_cont = true;
      if (fn === 'diode') lit.ann_diode = true;
    }
    meterObj.traverse(x => { if (/^ann_/.test(x.name || '')) meterPaint(x, !!lit[x.name]); });
  }
  function meterTip(colour) {
    if (!meterObj) return null;
    let t = null;
    meterObj.traverse(x => { if (!t && (x.name === 'tip_' + colour || x.name === 'lead_' + colour + '_tip')) t = x; });
    return t ? t.getWorldPosition(new T.Vector3()) : null;
  }
  async function meterInHand(kind) {
    if (meterObj) { camera.remove(meterObj); meterObj = null; }
    const o = await meterModel(kind); if (!o) return;
    // the pose a hand holds it in, worked out on the page: face toward you, dial and display readable, clear of the crosshair
    meterPose(o);
    if (!camera.parent) scene.add(camera);
    camera.add(o); meterObj = o;
    o.traverse(x => x.layers.set(1));     // round 49: the held meter belongs to the overlay pass
    scene.traverse(x => { if (x.isLight) x.layers.enable(1); });     // and the house's lights have to reach that pass or it renders black
    meterShowText('OL');
  }
  const FN_LABEL = { off: 'off', vac: 'Volts AC', vdc: 'Volts DC', mv: 'Millivolts DC', ohms: 'Ohms', cont: 'Continuity', diode: 'Diode',
    cap: 'Capacitance', ua: 'Microamps', ma: 'Milliamps', amps: 'Amps', adc: 'Amps DC' };
  // Round 51 (Jake: "the meter is off, so we need to have it where it can be clicked and every click takes it to one of those
  // different settings and it actually works"). These are the model's own dial positions, in degrees clockwise from OFF at
  // the top, and the click turns the model's own dial_knob to them. Nothing was turning before: the page asked for an
  // animation clip on a model it had never built a mixer for, so the knob sat at OFF while the display read 240 volts.
  const DIAL_POS = {
    volts: [['off', 0], ['vac', 30], ['vdc', 60], ['mv', 90], ['ohms', 120], ['cont', 150], ['diode', 180], ['cap', 210], ['ua', 240], ['ma', 270], ['amps', 300]],
    amps: [['off', 0], ['amps', 50], ['adc', 100], ['vac', 150], ['vdc', 200], ['ohms', 250], ['cont', 300]],
  };
  function meterKnob() {
    let k = null;
    if (meterObj) meterObj.traverse(x => { if (!k && /^dial_knob$/.test(x.name || '')) k = x; });
    return k;
  }
  function meterSetFn(fn) {
    if (!meter) return;
    meter.fn = fn;
    const k = meterKnob(), e = (DIAL_POS[meter.kind] || []).find(p => p[0] === fn);
    if (k && e) {
      // the knob turns about the axis that comes out of the meter's face. Blender builds that as its own y, and the exporter
      // lands it on z here, so a clip angle of d degrees clockwise is + d about z in this frame.
      if (k.userData.restZ === undefined) k.userData.restZ = k.rotation.z;
      k.rotation.z = k.userData.restZ + e[1] * Math.PI / 180;
    }
    showMeter();
  }
  function meterDial(step) {
    if (!meter) return 'no meter in your hand';
    const tbl = DIAL_POS[meter.kind] || [];
    const i = Math.max(0, tbl.findIndex(p => p[0] === meter.fn));
    meterSetFn(tbl[(i + (step || 1) + tbl.length) % tbl.length][0]);
    return meter.fn === 'off' ? 'dial: OFF' : 'dial: ' + FN_LABEL[meter.fn];
  }
  // what a capacitor reads, by the part you put the leads on
  function capFor(o) {
    const nm = partName(o) || base(o.name);
    if (/run_cap|capacitor|dual_cap|start_cap/.test(nm)) return { uf: 45.0, why: 'a 45 microfarad run capacitor' };
    return null;
  }
  // Round 75 (Jake: "we need to be able to read things separately. They need different readings. You can match them to manufacturer
  // specs. Nothing would read failed yet because we haven't put bad stuff in there yet"). BENCH is the parts a tech puts an ohmmeter
  // or the capacitance range across, each with its own GOOD value and where that value comes from (test_meters/meter_specs_r75.json
  // has every number with its page). A part with terminals reads between any two of them; a part without reads across itself, both
  // leads on it. `typ` marks a value no manual in the library prints: the note says so rather than passing it off as the maker's.
  const BENCH = [
    { model: /hvac_condenser/, name: 'the dual run capacitor', terms: [[/^cap_lead_herm$/, 'HERM'], [/^cap_lead_fan$/, 'FAN'], [/^cap_lead_c_(fan|line)$/, 'C']],
      uf: { 'C-HERM': [40.0, 'the compressor side, 40 microfarads: what Copeland lists for the 2-1/2 ton scroll (ZP25K, Electrical Handbook)'],
            'C-FAN': [5.0, 'the fan side, 5 microfarads (the usual fan section; Rheem does not print it)'],
            'FAN-HERM': [4.4, 'HERM to FAN is the two sections in series, so it reads smaller than either. Read each one to C'] } },
    { model: /hvac_condenser/, name: 'the compressor', terms: [[/^comp_term_c$/, 'C'], [/^comp_term_s$/, 'S'], [/^comp_term_r$/, 'R']],
      ohms: { 'C-R': [0.98, 'the run winding, common to run: Copeland lists 0.98 ohms for the 2-1/2 ton scroll, give or take 10 percent'],
              'C-S': [1.78, 'the start winding, common to start: Copeland lists 1.78 ohms, give or take 10 percent'],
              'R-S': [2.76, 'run to start is both windings in series, so it is the other two added together. That sum is how you prove which pin is which'] } },
    { model: /hvac_condenser/, part: /^compressor$/, name: 'the compressor shell', shell: true, ohms: ['OL', 'the shell is not a test point. Take the terminal cover off the side of the compressor and put the leads on the C, S and R pins under it']},
    { model: /electric_tank_water_heater|hybrid_water_heater/, part: /^upper_heating_element$/, name: 'the upper element', ohms: [12.8, 'a 4500 watt 240 volt element: 240 x 240 / 4500 = 12.8 ohms. Anywhere from 5 to 25 is a live element (A. O. Smith service guide); OL is a burned out one'] },
    { model: /electric_tank_water_heater|hybrid_water_heater/, part: /^lower_heating_element$/, name: 'the lower element', ohms: [12.8, 'a 4500 watt 240 volt element: 12.8 ohms, the same as the upper. Then one lead to the tank: a good element reads OL to ground'] },
    { model: /electric_tank_water_heater|hybrid_water_heater/, part: /^upper_thermostat$/, name: 'the upper thermostat', ohms: [0.2, 'closed to the upper element while the top of the tank is cold; when the top is hot it flips over and sends power to the lower one'] },
    { model: /electric_tank_water_heater|hybrid_water_heater/, part: /^lower_thermostat$/, name: 'the lower thermostat', ohms: [0.2, 'closed while the bottom of the tank is below its setting, open once it is satisfied'] },
    { model: /lift_station/, part: /^run_capacitor$/, name: 'the run capacitor', uf: [45.0, '45 microfarads, 370 volts: the Champion sewage pump manual and the can in the panel both say so'] },
    { model: /lift_station/, part: /^start_capacitor$/, name: 'the start capacitor', uf: [297, 'rated 270 to 324 microfarads, so anything in that window is good. It is only in the circuit for the second the start relay holds it in'] },
    { model: /lift_station/, part: /^pump$|^panel_wire_motor$/, name: 'the grinder pump motor', ohms: [1.3, 'the main winding, black to white: 1.3 ohms on the Champion 2 HP grinder. Red to white (start) is 3.7 and black to red is 2.4. The three leads are not separate parts in the panel yet, so this reads the main'] },
    { model: /hvac_condenser/, part: /^fan_motor$|^fan$/, name: 'the condenser fan motor', typ: true, ohms: [11.6, 'a small PSC fan motor. Rheem does not print its winding resistance, so this is a usual value, not the maker\'s'] },
    { model: /hvac_furnace|hvac_air_handler|hvac_package/, part: /^blower_motor$|^blower$/, name: 'the blower motor', ohms: ['OL', 'this is a constant torque ECM motor with its own electronics, so an ohmmeter across it tells you nothing. Check for line voltage at its plug and 24 volts on its speed tap instead'] },
    { model: /hvac_furnace/, part: /^flame_sensor$/, name: 'the flame sensor', typ: true, ua: [3.2, 'with the burners lit. Rheem gives only the flame light on the board, not a number; 1 to 6 microamps DC is the usual window, and under 1 it drops out'] },
    { model: /hvac_air_handler/, part: /^transformer_24v$/, name: 'the control transformer', ohms: [38, 'primary side. A 40 VA 240 to 24 volt transformer (Rheem RH1T manual); the maker prints no resistance, so look for a winding that is not open rather than a number'], typ: true },
  ];
  function benchFor(o) {
    const nm = partName(o) || base(o.name); const inst = o.userData.inst || (typeof unitOf === 'function' ? unitOf(o) : null); const model = (inst && inst.userData.model) || '';
    for (const B of BENCH) { if (!B.model.test(model)) continue;
      if (B.terms) { for (const [re, t] of B.terms) if (re.test(nm)) return { B, term: t, key: model + '|' + B.name }; }
      else if (B.part.test(nm)) return { B, term: null, key: model + '|' + B.name }; }
    return null;
  }
  function benchRead(x, y) {
    const B = x.B, fn = meter.fn; let spec = null, what = B.name;
    if (B.terms) {
      if (x.term === y.term) return { text: fn === 'cap' ? 'OL' : '0.0', note: 'both leads are on ' + x.term + ' of ' + B.name + ': move one to another terminal' };
      const k = [x.term, y.term].sort().join('-'); what = B.name + ', ' + x.term + ' to ' + y.term;
      spec = fn === 'cap' ? (B.uf && B.uf[k]) : (fn === 'ua' ? null : (B.ohms && B.ohms[k]));
    } else spec = fn === 'cap' ? B.uf : (fn === 'ua' ? B.ua : B.ohms);
    if (!spec) {
      if (fn === 'cap') return { text: 'OL', note: what + ' is not a capacitor. Turn the dial to ohms for this one' };
      if (fn === 'ua') return { text: '0.0', note: 'microamps is for the flame sensor, in series with its wire, with the burners lit' };
      if (B.uf) return { text: 'OL', note: what + ': a good capacitor reads open on ohms once the meter has charged it. Turn the dial to capacitance' };
      return { text: 'OL', note: what + ' has no reading on this range' };
    }
    const v = spec[0]; const txt = typeof v === 'number' ? (v >= 100 ? String(Math.round(v)) : (v < 10 && (fn === 'ohms' || fn === 'cont') ? v.toFixed(2) : v.toFixed(1))) : String(v);
    return { text: txt, note: what + ': ' + spec[1] + (B.typ || typeof v !== 'number' ? '' : '. That is a good one') };
  }
  function readOhms(a, b) {
    { const x = benchFor(a.o), y = benchFor(b.o);
      if (x && y && x.key === y.key) return benchRead(x, y);
      const shell = r_ => r_ && r_.B.part && /\^compressor\$/.test(String(r_.B.part));
      if (x && y && (shell(x) !== shell(y)) && x.key.split('|')[0] === y.key.split('|')[0] && (x.B.terms || y.B.terms)) return { text: 'OL', note: 'a compressor pin to the shell: open, which is right. Any reading here is a winding shorted to ground, and that compressor is done' };
      if (x && y) return { text: 'OL', note: 'those are two different parts (' + x.B.name + ' and ' + y.B.name + '). Put both leads on the same one' };
      const one = x || y, other = x ? b : a;
      if (one && one.B.ohms && meter.fn !== 'cap' && (!other.p || other.p.node === 'G')) return { text: 'OL', note: one.B.name + ' to the cabinet or ground: open, which is right. Any reading here is a winding or an element shorted to ground' }; }
    // a winding read: both leads on the same motor or compressor
    const wa = WINDING[a.nm], wb = WINDING[b.nm];
    if (wa && a.nm === b.nm && meter.fn !== 'cap') return { text: wa.ohms.toFixed(1), note: wa.why + ', which is what it should read' };
    if (wa && wb && a.nm !== b.nm) return { text: 'OL', note: 'those are two different windings, so they read open between them' };
    const ca = capFor(a.o) || capFor(b.o);
    if (meter.fn === 'cap') {
      if (!ca) return { text: 'OL', note: 'capacitance reads a capacitor: put the leads on its terminals' };
      return { text: ca.uf.toFixed(1), note: ca.why + ', within tolerance' };
    }
    if (ca) return { text: 'OL', note: 'a good capacitor reads open on ohms once it charges: turn the dial to capacitance' };
    if (!a.p || !b.p) return { text: 'OL', note: 'one lead is not on a conductor' };
    if (a.nm === b.nm) return { text: '0.3', note: 'the same conductor end to end: near enough zero ohms' };
    const same = a.p.node === b.p.node;
    if (same) return { text: '0.4', note: 'both on the same node, so the meter reads the wire itself' };
    if ((a.p.node === 'G' && b.p.node === 'N') || (a.p.node === 'N' && b.p.node === 'G')) return { text: '0.2', note: 'neutral and ground are bonded at the main' };
    return { text: 'OL', note: 'open between those two, which is what you want on a de-energised circuit' };
  }
  // Round 48 (Jake: "it does not quite pull up"): R brings the meter up square on so you can read it and turn the dial, R again puts it back
  // in your hand.
  let meterUp = false;
  // Round 60 (Jake, on his phone: the multimeter "doesn't even pull up the multimeter, it's just got readings on the page"). The pose
  // in your hand was 15 cm right of centre at 30 cm out, worked out in a wide window. A phone held upright sees under 10 cm to each
  // side at that distance, so the meter was off the edge of the screen. Both poses are fitted to the shape of the screen now: in
  // the hand it comes in toward the middle until it fits, and held up to read it backs off until its whole face is in the picture.
  // A wide screen gets exactly the old numbers.
  function meterPose(o) {
    const a = camera.aspect > 0 ? camera.aspect : 1.78, k = Math.tan(camera.fov * Math.PI / 360);
    if (meterUp) {
      const z = Math.max(0.2050, 0.062 / (k * a));     // far enough that a 10 cm wide face fits across, with a little air
      o.scale.setScalar(1.0); o.position.set(0.0, -0.045 * (z / 0.2050), -z); o.rotation.set(0, Math.PI, 0);
    } else {
      const x = Math.min(0.15, Math.max(0.045, 0.55 * 0.30 * k * a));
      o.scale.setScalar(0.62); o.position.set(x, -0.115, -0.30); o.rotation.set(-0.22, Math.PI - 0.22, 0.03);
    }
  }
  // What a keyboard does with R and Esc, as buttons a thumb can reach, bottom left where nothing else lives. The reading still
  // shows ONLY on the meter's own display (Jake's round 48 ruling): these are controls, not a readout.
  function meterKeys() {
    let el = document.getElementById('meterkeys');
    document.body.classList.toggle('metering', !!meter);
    if (!meter) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'meterkeys'; document.body.appendChild(el); }
    el.innerHTML = '';
    const add = (lab, fn) => { const b = document.createElement('button'); b.textContent = lab;
      b.onclick = ev => { ev.stopPropagation(); const m = fn(); if (typeof m === 'string' && !meter) { labelEl.textContent = m; labelEl.style.display = 'block'; } meterKeys(); }; el.appendChild(b); };
    add(meterUp ? 'Back in your hand' : 'Read it close', meterPull);
    add('Turn the dial', () => { const m = meterDial(1); showMeter(); return m; });
    add('Put it down', () => { meterDown(); return 'meter down'; });
    el.style.display = 'flex';
  }
  function meterPull() {
    if (!meterObj) return 'no meter in your hand';
    meterUp = !meterUp;
    // round 51: back off far enough that the dial is in the picture too, not just the display. You turn the dial while it is up.
    meterPose(meterObj); meterKeys();
    return meterUp ? 'meter up: read it, click the dial to change range, R to drop it back to your hand' : 'meter back in your hand';
  }
  let meter = null, leadLines = [];
  function isDescendant(o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }
  function meterCard() {
    let el = document.getElementById('meter');
    if (!el) { el = document.createElement('div'); el.id = 'meter'; document.body.appendChild(el); }
    return el;
  }
  function meterNode(nm) {
    if (!meterObj) return null;
    let f = null; meterObj.traverse(x => { if (!f && x.name === nm) f = x; });
    if (f) return f;
    // once a probe is stood on a test point it lives in the scene, not on the meter
    let g = null; scene.traverse(x => { if (!g && x.name === nm && x.userData.meterPart) g = x; });
    return g;
  }
  function meterLeads() {
    for (const l of leadLines) { scene.remove(l); if (l.geometry) l.geometry.dispose(); }
    leadLines = [];
    if (!meterObj) return;
    for (const [side, colour] of [['a', 'red'], ['b', 'black']]) {
      const probe = meterNode('lead_' + colour + '_probe');
      const wire = meterNode('lead_' + colour + '_wire');
      const t = meter && meter[side];
      if (!probe) continue;
      if (t && t.at) {
        // Round 51 (Jake: "see how the red lead is like parallel? That needs to be fixed. The black is correct"). A probe goes in the
        // way a hand takes it, straight in along your own line of sight. Round 49 aimed it along the little face the ray landed on
        // instead, and the top face of a lug screw points at the ceiling, so the red probe stood up the front of the panel. The two
        // probes fan a few degrees apart so the second one is not landing across the first.
        if (probe.parent !== scene) { scene.attach(probe); probe.userData.meterPart = true; }
        probe.position.copy(t.at);
        // the probe's own shape runs along its local +y, with the needle point at its origin, so aiming it is a matter of standing
        // that axis up along the direction back toward you. lookAt aims +z, which is why every earlier pass at this ended up with a
        // probe lying across the work instead of standing on it.
        const eye = camera.getWorldPosition(new T.Vector3());
        const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        const lean = colour === 'red' ? 1 : -1;
        const back = eye.clone().sub(t.at).normalize().add(right.multiplyScalar(lean * 0.38)).add(up.multiplyScalar(0.22)).normalize();
        probe.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), back);
        const cap = meterNode('lead_' + colour + '_cap'); if (cap) cap.visible = false;
      } else if (probe.userData.meterPart) {
        // put it back in the meter's hand
        meterObj.attach(probe); probe.userData.meterPart = false;
        const cap = meterNode('lead_' + colour + '_cap'); if (cap) cap.visible = true;
      }
      // the wire: a real tube hanging from the plug's strain relief to the back of the probe, with sag in the middle
      const plugA = meterNode('lead_' + colour + '_anchor_plug');
      const probeA = meterNode('lead_' + colour + '_anchor_probe');
      if (wire) wire.visible = !(t && t.at);
      if (!(t && t.at) || !plugA || !probeA) continue;
      const p0 = plugA.getWorldPosition(new T.Vector3()), p1 = probeA.getWorldPosition(new T.Vector3());
      const mid = p0.clone().lerp(p1, 0.5); mid.y -= Math.min(0.18, p0.distanceTo(p1) * 0.28);
      const curve = new T.CatmullRomCurve3([p0, p0.clone().lerp(mid, 0.5), mid, mid.clone().lerp(p1, 0.5), p1]);
      const geo = new T.TubeGeometry(curve, 24, 0.0028, 8, false);
      const mat = new T.MeshStandardMaterial({ color: colour === 'red' ? 0xc22b22 : 0x141416, roughness: 0.75 });
      const tube = new T.Mesh(geo, mat); tube.name = 'meter_lead_' + colour; scene.add(tube); leadLines.push(tube);
    }
  }
  // Round 51: every position of the dial reads what that position really reads. A DC range on an AC circuit sits near zero,
  // a multimeter's own amp ranges are a series measurement and will not read a live panel, and OFF is off.
  function meterRead() {
    const fn = meter.fn;
    if (fn === 'off') return { text: '    ', note: 'the dial is at OFF: click the dial to turn it to V AC' };
    if (fn === 'vac') {
      const r = (meter.a && meter.b) ? readVolts(meter.a, meter.b) : null;
      return { text: r ? r.text : 'OL', note: r ? r.note : (meter.a ? 'now click where the black one goes' : 'click where the red lead goes') };
    }
    if (fn === 'vdc' || fn === 'mv') {
      const r = (meter.a && meter.b) ? readVolts(meter.a, meter.b) : null;
      if (!r) return { text: 'OL', note: 'put both leads on it' };
      return { text: fn === 'mv' ? '0.2' : '0.0', note: 'that is an alternating current circuit, so a DC range sits near zero. Turn the dial to V AC.' };
    }
    if (fn === 'ohms' || fn === 'cont' || fn === 'cap' || fn === 'diode') {
      if (!(meter.a && meter.b)) return { text: 'OL', note: 'put both leads on it' };
      if (fn === 'diode') return { text: 'OL', note: 'the diode range is for a diode, not for a circuit conductor' };
      const r = readOhms(meter.a, meter.b);
      if (fn === 'cont' && r && /^[0-9.]+$/.test(r.text) && parseFloat(r.text) < 40) return { text: r.text, note: r.note + ', and it beeps' };
      return r;
    }
    if (fn === 'amps' && meter.kind === 'amps') {
      const r = meter.a ? readAmps(meter.a.o) : null;
      return { text: r ? r.text : 'OL', note: r ? r.note : 'click a conductor and the jaw closes round it' };
    }
    if (fn === 'ua' && meter.kind === 'volts') {
      if (!meter.a) return { text: '0.0', note: 'microamps reads the flame sensor: put the leads on it with the burners lit' };
      const x = benchFor(meter.a.o), y = meter.b ? benchFor(meter.b.o) : null;
      if (x && x.B.ua && (!meter.b || (y && y.key === x.key))) return benchRead(x, x);
      return { text: '0.0', note: 'microamps is for the flame sensor, in series with its wire, with the burners lit. Nothing else in the house is read on this range' };
    }
    if (fn === 'adc') return { text: '0.0', note: 'that load is alternating current, so a DC amp range reads about zero' };
    return { text: 'OL', note: 'a multimeter reads current in series, so it will not read a live panel. Use the clamp meter for amps.' };
  }
  function showMeter() {
    const el = meterCard();
    if (!meter) { el.style.display = 'none'; meterShowText('    '); meterKeys(); return; }
    // Round 48 (Jake: "it reads it in the display over to the right hand side, but I want you to only read it on the meter"): the reading
    // goes on the meter's own display. The line at the bottom says what the probes are on and why, which is teaching, not a readout.
    const r = meterRead();
    meterShowText(r.text);
    el.style.display = 'none';
    const lead_ = r_ => { const bx = r_.o ? benchFor(r_.o) : null; return bx ? (bx.term ? bx.term + ' of ' + bx.B.name : bx.B.name) : pretty(r_.nm); };
    const where = (meter.a ? 'red on ' + lead_(meter.a) : 'red not placed') + (meter.kind === 'volts' ? ', ' + (meter.b ? 'black on ' + lead_(meter.b) : 'black not placed') : '');
    labelEl.textContent = FN_LABEL[meter.fn] + ': ' + r.text.trim() + '. ' + where + '. ' + r.note + (('ontouchstart' in window) ? '' : '  (click the dial to turn it, R to read it close, Esc to put it down)');
    labelEl.style.display = 'block'; meterKeys();
  }
  function meterClick(o, hit) {
    // the dial and the buttons on the meter in your hand are not test points
    const dn = partName(o) || base(o.name);
    if (/^dial|^knob|^shell|^holster|^button|^jack/.test(dn) && meterObj && isDescendant(o, meterObj)) return meterDial(1);
    const p = pointFor(o);
    const rec = { nm: p.nm, p: p.p, why: p.why, o, at: hit && hit.point ? hit.point.clone() : null };
    if (meter.kind === 'amps') meter.a = rec;
    else if (!meter.a || (meter.a && meter.b)) { meter.a = rec; meter.b = null; }
    else meter.b = rec;
    meterLeads(); showMeter();
    if (meter.kind === 'amps') { const r = readAmps(o); return 'clamped on ' + pretty(p.nm) + ': ' + r.text + '. ' + r.note; }
    if (meter.a && meter.b) { const r = readVolts(meter.a, meter.b); return 'red on ' + pretty(meter.a.nm) + ', black on ' + pretty(meter.b.nm) + ': ' + r.text + '. ' + r.note; }
    return 'red lead on ' + pretty(p.nm) + ' (' + p.why + '). Now click where the black one goes';
  }
  function meterDown() {
    meter = null; meterUp = false;
    if (meterObj) { camera.remove(meterObj); meterObj = null; }
    for (const l of leadLines) { scene.remove(l); if (l.geometry) l.geometry.dispose(); }
    leadLines = [];
    for (const nm of ['lead_red_probe', 'lead_black_probe']) { const p = scene.getObjectByName(nm); if (p && p.userData.meterPart) scene.remove(p); }
    setTool('look'); showMeter(); meterButtons();
  }
  function takeMeter(kind) {
    meter = { kind, a: null, b: null, fn: kind === 'volts' ? 'vac' : 'amps' }; setTool(kind === 'volts' ? 'meter' : 'clamp');
    meterInHand(kind).then(() => { meterSetFn(kind === 'volts' ? 'vac' : 'amps'); showMeter(); meterButtons(); });
    meterLeads(); showMeter();
    return kind === 'volts' ? 'multimeter in hand: click where the red lead goes, then where the black one goes'
      : 'clamp meter in hand: click a conductor and the jaw closes round it';
  }
  let tool = 'look';
  // Round 21 (Jake: "the first obvious layer: cabinet doors open, the garbage disposal makes a cutaway, the pipe makes a cutaway, riser
  // lids come off, all on the first click. It's when something else needs to function: Elevation takes you zoomed in on the side,
  // and the run tool makes something actually run"). So Look is doors, lids, covers, plugs, cutaways and the handles; Work runs.
  const TOOL_HINT = { meter: 'Multimeter: click where the red lead goes, then where the black one goes, and it reads what is between them',
                      clamp: 'Clamp meter: click a conductor and the jaw closes round it',
                      grab: 'Pliers: click a lead to pull it off its tab and click a tab to put it back. Kill the power and discharge the capacitor first, or it will teach you why',
                      apart: 'Take apart: click a part of a unit and it comes out in front of you, turning, so you can look it over from every side; click again (or Put it back) and it goes back where it was',
                      look: 'Look: click a part. Doors, lids, covers and plugs come off, a part or a pipe cuts open, handles and switches work',
    elevation: 'Elevation: click a fixture or a unit to pull it up square on', cutaway: 'Cutaway', remove: 'Remove',
    work: 'Run: click a machine or a fixture to run it and watch its water or air; click the sewer line to run water into the tank and watch the yard system work' };
  function setTool(t) { tool = t; for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t); if (t !== 'look') { labelEl.textContent = TOOL_HINT[t]; labelEl.style.display = 'block'; } }     // round 32: no tool row; the click is the tool and the panel is the rest
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  const isControl = o => /handle|lever|knob|switch|button|hoa|dial|trip|float|stop_|toggle|breaker|thermostat|tstat|head$|^cartridge$|^(blower|blower_pad|blower_internals|compressor|compressor_pad|air_pump|pump_pad|pump_cover|pump_internals|pump)$|^(svc_|bw_|carbon_|riser_tube)/.test(partName(o) || '');
  // Round 27 (Jake: the thermostat needs an ability to set numbers up and down): the set point is counted on the page and written on the
  // stat's screen with a canvas texture; the model's own 72 digits go away the first time a button is pressed
  // ---------------------------------------------------------------- the thermostats (round 45)
  // Jake: "we need to have different thermostats, the ecobee, the Nest, a programmable one, and the settings all need to actually work."
  // Each stat's display is built from real seven segment pieces named head_digit_<set|now>_<digit>_<a..g>, so the page lights the
  // segments a number actually uses. The controls carry the names the builder gave them, and the house reacts: calling for heat or cool
  // runs the unit that would answer the call.
  const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function statDigits(inst) {
    if (inst.userData.segs) return inst.userData.segs;
    const segs = {};
    inst.traverse(o => { const m = /^head_digit_(set|now)_(\d)_([a-g])$/.exec(o.name || ''); if (m) segs[m[1] + m[2] + m[3]] = o; });
    inst.userData.segs = segs; return segs;
  }
  function statShow(inst, kind, value) {
    const segs = statDigits(inst); const txt = String(Math.max(0, Math.min(99, Math.round(value)))).padStart(2, '0');
    for (let d = 0; d < 2; d++) {
      const on = SEG7[+txt[d]] || '';
      for (const ch of 'abcdefg') { const o = segs[kind + d + ch]; if (o) o.visible = on.includes(ch); }
    }
  }
  function statState(inst) {
    if (!inst.userData.stat) {
      let cfg = null; inst.traverse(o => { if (!cfg && /^stat_config$/.test(o.name || '')) cfg = o; });
      const u = (cfg && cfg.userData) || {};
      inst.userData.stat = { set: 72, now: 70, mode: 'heat', fan: 'auto', hold: false, lo: +(u.set_min || 50), hi: +(u.set_max || 90) };
      statShow(inst, 'set', 72); statShow(inst, 'now', 70);
    }
    return inst.userData.stat;
  }
  function statCall(inst) {
    // what the stat is asking the house for, and the unit that answers it
    const st = statState(inst);
    if (st.mode === 'off') return 'off';
    if (st.mode !== 'cool' && st.set > st.now) return 'heat';
    if (st.mode !== 'heat' && st.set < st.now) return 'cool';
    return 'satisfied';
  }
  function statControl(inst, what) {
    const st = statState(inst);
    if (what === 'up' || what === 'down') { st.set = Math.max(st.lo, Math.min(st.hi, st.set + (what === 'up' ? 1 : -1))); statShow(inst, 'set', st.set); }
    else if (what === 'mode') { const order = ['heat', 'cool', 'auto', 'off']; st.mode = order[(order.indexOf(st.mode) + 1) % order.length]; }
    else if (what === 'fan') { st.fan = st.fan === 'auto' ? 'on' : 'auto'; }
    else if (what === 'hold' || what === 'run') { st.hold = what === 'hold'; }
    else if (what === 'schedule') { st.sched = !st.sched; }
    const call = statCall(inst);
    const runs = [];
    if (call === 'heat' || call === 'cool' || st.fan === 'on') {
      for (const u of equip.children) {
        const md = u.userData.model || '';
        if (/air_handler|furnace|package/.test(md)) { const c = unitRunClip(u); if (c) runs.push(pretty(md)); }     // the mini split has its own stat in the bedroom, this one does not call it
        if (call === 'cool' && /condenser/.test(md)) { const c = unitRunClip(u); if (c) runs.push(pretty(md)); }
      }
    }
    return 'set ' + st.set + ', now ' + st.now + ', ' + st.mode + ', fan ' + st.fan + (st.hold ? ', holding' : '')
      + ', calling for ' + call + (runs.length ? ' (' + runs.join(' and ') + ' running)' : '');
  }
  const STAT_CTL = { head_ctl_up: 'up', head_ctl_down: 'down', head_ctl_mode: 'mode', head_ctl_fan: 'fan', head_ctl_schedule: 'schedule', head_ctl_hold: 'hold', head_ctl_run: 'run', head_ctl_set: 'set', head_ctl_press: 'press', head_ctl_day: 'schedule', head_ctl_system: 'mode' };
  function statSet(inst, d) {
    inst.userData.setpoint = Math.max(50, Math.min(90, (inst.userData.setpoint || 72) + d));
    let scr = null, sp = null; inst.traverse(o => { if (!o.isMesh) return; const p = partName(o); if (p === 'stat_screen') scr = o; if (p === 'stat_setpoint') sp = o; });
    if (sp) sp.visible = false;
    if (scr) {
      // a plane on the screen's face carries the number (a box's own UVs spread the texture over six faces)
      if (!inst.userData.statCanvas) { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; inst.userData.statCanvas = cv; const tex = new T.CanvasTexture(cv); inst.userData.statTex = tex; const pl = new T.Mesh(new T.PlaneGeometry(0.054, 0.030), new T.MeshBasicMaterial({ map: tex })); pl.position.set(0, 0, 0.0025); scr.add(pl); }
      const cv = inst.userData.statCanvas, g = cv.getContext('2d'); g.fillStyle = '#a9c39d'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#12160f'; g.font = 'bold 46px monospace'; g.textAlign = 'center'; g.fillText(String(inst.userData.setpoint), 64, 50); inst.userData.statTex.needsUpdate = true;
    }
    return 'thermostat set to ' + inst.userData.setpoint;
  }
  // Round 30 (Jake: "a function that's like take apart, so we can go up to the unit and click that part, pull it out, a way to 3D look at
  // it in front of us, and then it goes back in"). The part leaves its unit and hangs in front of the camera on a pivot that turns,
  // centred on its own bounding box, small parts scaled up so a screw reads; Put it back returns it to its parent with the matrix it had.
  let held = null;
  // Round 31 (Jake: "we should be able to pull the spray pump out"): whole=true takes the WHOLE unit (the placed model) out instead of
  // the one mesh, if it is under 2.4 m across: the filter, the pump tank's pump is a part but the spray pump filter is a unit, the outlet.
  // Round 35 (Jake: "several of the take it out features are not taking the entire unit out; the spray filter should take the entire
  // unit out"): the small add ons have no part worth holding on its own, so Take it out on any of their parts is the whole unit.
  const NO_CLIPS = { spray_pump_filter: /^filter_pull$/ };     // clips the panel never offers, by model
  const WHOLE_UNITS = /^(spray_pump_filter|outlet_surge|hvac_surge|easystart|whole_house_spd|flo_shutoff|sweet_air|atu_blower_outlet|thermostat|water_filter)/;
  function wholeOnly(o) { const inst = o && (o.userData.inst || (o.parent === equip ? o : null)); return !!(inst && WHOLE_UNITS.test(inst.userData.model || '')); }
  // ---------------------------------------------------------------- exploded view (round 45)
  // Jake: "I think we need a tool or something that makes an exploded view where if I click on the item it just pulls it all out. It
  // doesn't get removed so you can't see it, but it pulls the handle off, it pulls the trim piece off, it pulls the cartridge out, and
  // it's all where you can just see it all before it then goes back together, so a technician that's in here training can see the parts."
  //
  // Order comes from explode.json where the model ships one (part, direction, distance and why), which is service order. Where it does
  // not, the parts a technician takes off are read off interactions.json (anything that unclips, pulls or comes aside) and ordered
  // outside in, each one pulled along the line from the unit's core to where it sits. Nothing is deleted: every part is still there,
  // spaced out and named, and Put it together walks it back.
  let EXPLODE = {};
  let blown = null;
  const SERVICE = /handle|lever|trim|escutcheon|cap$|cover|index|screw|set_screw|bonnet|packing|retainer|clip|cartridge|stem|seat|spring|aerator|nut$|washer|filter|element|thermostat|anode|element_cover|door|panel|plate$/;
  function explodeParts(inst) {
    const model = inst.userData.model || ''; const table = (INTER && INTER.models[model]) || {};
    const spec = EXPLODE[model] || EXPLODE[(model || '').replace(/\.glb$/, '')] || null;
    const byName = new Map();
    inst.traverse(o => { if (!o.isMesh || !o.visible) return; const p = partName(o); if (!byName.has(p)) byName.set(p, []); byName.get(p).push(o); });
    const out = [];
    if (spec && spec.length) {
      for (const e of spec) { const ms = byName.get(e.part); if (ms) out.push({ part: e.part, meshes: ms, dir: e.dir ? new T.Vector3(e.dir[0], e.dir[1], e.dir[2]) : null, mm: e.mm || 60, why: e.why || '', of: e.of || null, spec: true }); }
      if (out.length) return out;
    }
    for (const [p, ms] of byName) {
      const a = table[p];
      const wanted = (a && /^clip:|^aside$|^pull$/.test(a.look || '')) || SERVICE.test(p);
      if (!wanted) continue;
      out.push({ part: p, meshes: ms, dir: null, mm: 60, why: (a && a.note) || '' });
    }
    return out;
  }
  function explodeUnit(inst) {
    if (blown) return unexplode();
    if (!inst || inst.parent !== equip) return 'click the unit itself, or a part of it, to take it apart';
    const items = explodeParts(inst);
    if (!items.length) return pretty(inst.userData.model) + ': nothing on this one comes apart';
    scene.updateMatrixWorld(true);
    const ub = new T.Box3().setFromObject(inst); const core = ub.getCenter(new T.Vector3()); const reach = Math.max(0.16, ub.getSize(new T.Vector3()).length() * 0.28);
    const list = items.map(it => {
      const bb = new T.Box3(); for (const m of it.meshes) bb.expandByObject(m);
      const c = bb.getCenter(new T.Vector3());
      let dir = it.dir ? it.dir.clone().normalize() : c.clone().sub(core);
      if (dir.lengthSq() < 1e-6) dir = new T.Vector3(0, 1, 0);
      dir.normalize();
      return { ...it, c, dir, out: bb.distanceToPoint(core) };
    });
    if (!list.every(it => it.spec)) list.sort((a, b) => b.out - a.out);     // a model that ships explode.json already has them in service order
    // A part the model lists with a distance uses it. A part that hangs on another part (a screw on an escutcheon, a cap on a handle)
    // is a CHILD in the scene, so it already travels with its host: it only moves the difference, or it flies twice as far.
    const stepOf = {};
    list.forEach((it, i) => { stepOf[it.part] = it.spec ? it.mm / 1000 : reach * (0.55 + i * 0.42); });
    const held_ = list.map((it, i) => {
      let step = stepOf[it.part];
      if (it.of && stepOf[it.of] !== undefined) step = Math.max(0.005, step - stepOf[it.of]);
      return it.meshes.map(m => {
        const rec = { m, home: m.position.clone(), to: null, el: null, part: it.part };
        const lp = m.parent; const wdir = it.dir.clone();
        const local = wdir.clone().applyQuaternion(lp.getWorldQuaternion(new T.Quaternion()).invert()).multiplyScalar(step);
        rec.to = m.position.clone().add(local);
        return rec;
      });
    }).flat();
    for (const rec of held_) {
      const el = document.createElement('div'); el.className = 'xlab'; el.textContent = pretty(rec.part); document.body.appendChild(el); rec.el = el;
    }
    blown = { inst, recs: held_, t: 0, dir: 1, names: list.map(l => l.part) };
    return pretty(inst.userData.model) + ': coming apart, ' + list.length + ' parts, outside in. Take it apart again or Esc puts it together';
  }
  function unexplode() {
    if (!blown) return 'nothing is apart';
    const nm = pretty(blown.inst.userData.model); blown.dir = -1;
    return nm + ': going back together';
  }
  function stepExplode(dt) {
    if (!blown) return;
    blown.t = Math.max(0, Math.min(1, blown.t + blown.dir * dt * 1.6));
    const k = blown.t * blown.t * (3 - 2 * blown.t);
    for (const r of blown.recs) {
      r.m.position.lerpVectors(r.home, r.to, k);
      if (!r.el) continue;
      if (blown.t < 0.25 || ball) { r.el.style.display = 'none'; continue; }
      const p = r.m.getWorldPosition(new T.Vector3()).project(camera);
      const on = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      r.el.style.display = on ? 'block' : 'none';
      if (on) { r.el.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px'; r.el.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px'; }
    }
    if (blown.dir < 0 && blown.t <= 0) {
      for (const r of blown.recs) { r.m.position.copy(r.home); if (r.el && r.el.parentNode) r.el.parentNode.removeChild(r.el); }
      blown = null;
    }
  }
  function takeApart(o, whole, partOnly) {
    if (!partOnly && !whole && wholeOnly(o)) whole = true;     // round 39: View wants the part itself even on an add on that comes out whole
    let t = o; if (whole) t = (o && o.userData.inst) || unitOf(o);
    if (!t || (t.isMesh && !t.userData.inst) || (!t.isMesh && t.parent !== equip && !(partOnly && unitOf(t)))) return (o ? partName(o) : 'nothing') + ': only a part of a placed unit, or a whole unit, comes apart';
    if (held) { if (held.obj === t) return putBack(); putBack(); }
    if (!camera.parent) scene.add(camera);
    let c, r; const name = t.isMesh ? partName(t) : (t.parent === equip ? pretty(t.userData.model) : (partName(t) || t.name));
    if (t.isMesh) { const g = t.geometry; if (!g.boundingBox) g.computeBoundingBox(); c = g.boundingBox.getCenter(new T.Vector3()); r = g.boundingBox.getSize(new T.Vector3()).length() / 2 || 0.05; }
    else { const wb = new T.Box3().setFromObject(t); const size = wb.getSize(new T.Vector3()).length(); if (size > 2.4) return name + ': too big to hold, take it apart a piece at a time'; c = wb.getCenter(new T.Vector3()).applyMatrix4(t.matrixWorld.clone().invert()); r = size / 2; }
    const sc = Math.min(4, Math.max(1, 0.12 / r)); const dist = 0.30 + Math.min(0.85, r * sc * 2.6);     // never further than arm's reach: a whole unit 1.7 m out was inside the ground
    held = { obj: t, parent: t.parent, matrix: t.matrix.clone(), auto: t.matrixAutoUpdate, pivot: new T.Group(), name, inst: t.isMesh ? t.userData.inst : (t.parent === equip ? t : unitOf(t)), r, sc };
    held.pivot.position.set(0, -0.02, -dist); camera.add(held.pivot);
    held.pivot.add(t); t.matrixAutoUpdate = true; t.matrix.identity(); t.position.copy(c).negate().multiplyScalar(sc); t.quaternion.identity(); t.scale.setScalar(sc); t.updateMatrix();
    return name + ': out, turning in front of you' + (sc > 1.01 ? ' (' + sc.toFixed(1) + 'x)' : '') + '. Click again or Put it back to return it';
  }
  // Round 39 (Jake: "a double click on a board should zoom into the whole page, a view button that pulls it to the page at the right
  // ratio, so we can see the detail"): the part comes in front of the camera like Take it out, but at the distance where its bounding
  // sphere fills 80 percent of the view, on a dark card, and it does not turn. Esc, a click, or Put it back returns it.
  let viewCard = null;
  // a multi material board loads as a group control_board with children control_board_1..8: the part is the group, not one primitive
  function partRoot(o) { const p = o && o.parent; if (o && o.isMesh && p && p.isGroup && p !== o.userData.inst && p.name && o.name === p.name + '_' + o.name.slice(p.name.length + 1) && /^\d+$/.test(o.name.slice(p.name.length + 1))) return p; return o; }
  // Round 42 (Jake: "it really should be brought up centre and also show the wires coming in and going out; any time something comes out by
  // double clicking, the whole thing comes out"): View no longer lifts the part out of its unit. It builds a copy in front of the camera of the
  // part (the whole group of a multi material part) plus every mesh of the unit that is fitted or wired to it (touching it within 2 cm: the
  // leads, the harness, the connectors, the cord, the stub), centred on the lot and sized to the view. The unit is untouched behind the card.
  const ATTACHED = /wir(e|ing)|harness|lead|cable|cord|connector|plug|terminal|whip|conduit|tube|hose|union|nut|stub|tail|clip|strap|grip/;
  function viewPart(o) {
    if (held) putBack();
    if (!camera.parent) scene.add(camera);     // children of the camera only draw when the camera is in the scene
    const root = partRoot(o); const inst = root.userData.inst || unitOf(root) || null; scene.updateMatrixWorld(true);
    const items = []; root.traverse(m => { if (m.isMesh && m.visible) items.push(m); });
    if (!items.length) return (partName(o) || o.name) + ': nothing to view';
    const rb = new T.Box3(); items.forEach(m => rb.expandByObject(m));
    const near = rb.clone().expandByScalar(0.02); const diag = rb.getSize(new T.Vector3()).length();
    if (inst) inst.traverse(m => {
      if (!m.isMesh || !m.visible || items.includes(m) || m.userData.isStream) return;
      const b = new T.Box3().setFromObject(m); if (!b.intersectsBox(near)) return;
      const nm = partName(m) || m.name || ''; if (/^(water|flow_|bubbles|qa_|ctx_)/.test(nm)) return;
      const bd = b.getSize(new T.Vector3()).length();
      if (!ATTACHED.test(nm) && bd > diag * 0.12) return;     // what is wired or fitted to it, or a small fitting on it; not the burner or blower beside it
      if (bd > Math.max(0.8, diag * 2.2)) return;     // nor a feed that runs off to the house: it would shrink the part to nothing
      items.push(m);
    });
    const inv = root.matrixWorld.clone().invert(); const G = new T.Group(); const lb = new T.Box3(), tb = new T.Box3(); const nRoot = (() => { let n = 0; root.traverse(m => { if (m.isMesh && m.visible) n++; }); return n; })(); const cents = [];
    items.forEach((m, i_) => {
      const c = new T.Mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.matrix.multiplyMatrices(inv, m.matrixWorld); c.frustumCulled = false; G.add(c);
      if (i_ >= nRoot) return;     // centred and sized on the part itself; its wires run out toward the edges of the card
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tb.copy(m.geometry.boundingBox).applyMatrix4(c.matrix); if (!isFinite(tb.min.x)) return; lb.union(tb);
      cents.push(tb.getCenter(new T.Vector3()));
    });
    // the median of its pieces' centres: where the part's detail is (the board's components), not halfway up a bracket on its plate
    const med = a_ => { const v = a_.slice().sort((p_, q_) => p_ - q_); return v.length ? v[Math.floor(v.length / 2)] : 0; };
    const ctr = cents.length ? new T.Vector3(med(cents.map(v => v.x)), med(cents.map(v => v.y)), med(cents.map(v => v.z))) : lb.getCenter(new T.Vector3()); const ext = lb.getSize(new T.Vector3()).multiplyScalar(0.5 * (items.length > nRoot ? 1.2 : 1.0));
    const sc = Math.min(4, Math.max(1, 0.12 / Math.max(ext.length(), 0.01)));
    const pivot = new T.Group(); G.position.copy(ctr).negate(); pivot.add(G); pivot.scale.setScalar(sc); camera.add(pivot);
    const name = partName(root) || pretty(root.name); const extras = items.length - (() => { let n = 0; root.traverse(m => { if (m.isMesh && m.visible) n++; }); return n; })();
    held = { view: true, pivot, obj: root, name, sc, r: ext.length(), inst, info: infoEl && infoEl.style.display };
    if (infoEl) infoEl.style.display = 'none';     // centred: the panel would sit over the right of it
    const fov = camera.fov * Math.PI / 180;
    const asp = camera.aspect > 0 ? camera.aspect : (innerWidth / innerHeight || 1.78);     // a hidden pane had the camera at NaN aspect before its first resize
    const ex = ext.x * sc, ey = ext.y * sc, ez = ext.z * sc; const r = Math.max(ez, 0.02);
    let dist = Math.max(0.2, Math.max(ex / asp, ey) / ((/board|pcb/i.test(name) ? 0.97 : 0.9) * Math.tan(fov / 2)) + ez); if (!isFinite(dist)) dist = 0.6;
    pivot.position.set(0, 0, -dist);
    if (!viewCard) { viewCard = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.92, depthWrite: false })); viewCard.name = 'view_card'; scene.traverse(x => { if (x.isLight) x.layers.enable(1); }); }
    const dc = dist + r + 0.05; const h = 2 * dc * Math.tan(fov / 2) * 1.6; viewCard.scale.set(h * asp, h, 1); viewCard.position.set(0, 0, -dc); camera.add(viewCard);
    pivot.traverse(x => x.layers.set(1)); viewCard.layers.set(1);
    return name + (extras > 0 ? ' with what connects to it' : '') + ': in view. Esc or click to put it back';
  }
  function viewPartOld(o) {
    const m = takeApart(partRoot(o), false, true); if (!held) return m;
    const fov = camera.fov * Math.PI / 180; held.view = true;
    // the part's extents along its own axes, which are the screen's axes now (it sits unturned under the camera): the distance where the
    // wider of the two fills 80 percent of the view, not the bounding sphere (that left a board at half size). Local matrices only: the
    // world matrices were NaN on the first View after a load (the camera had just joined the scene) and the part vanished
    const lb = new T.Box3(); const _tb = new T.Box3(); const _M = new T.Matrix4();
    held.obj.traverse(m => { if (!m.isMesh || !m.visible) return; const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); _M.identity(); for (let p = m; p && p !== held.obj; p = p.parent) _M.premultiply(p.matrix); _tb.copy(g.boundingBox).applyMatrix4(_M); lb.union(_tb); });
    const cx = -held.obj.position.x / held.sc, cy = -held.obj.position.y / held.sc, cz = -held.obj.position.z / held.sc;
    const ex = Math.max(Math.abs(lb.min.x - cx), Math.abs(lb.max.x - cx)) * held.sc, ey = Math.max(Math.abs(lb.min.y - cy), Math.abs(lb.max.y - cy)) * held.sc, ez = Math.max(Math.abs(lb.min.z - cz), Math.abs(lb.max.z - cz)) * held.sc;
    const asp = camera.aspect > 0 ? camera.aspect : (innerWidth / innerHeight || 1.78);     // a hidden pane had the camera at NaN aspect before its first resize
    const r = Math.max(ez, 0.02); let dist = Math.max(0.2, Math.max(ex / asp, ey) / ((/board|pcb/i.test(held.name) ? 0.97 : 0.9) * Math.tan(fov / 2)) + ez); if (!isFinite(dist)) dist = 0.6;     // round 40 (Jake: boards even closer)
    held.pivot.position.set(0, 0, -dist);
    if (!viewCard) { viewCard = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.92, depthWrite: false })); viewCard.name = 'view_card'; scene.traverse(x => { if (x.isLight) x.layers.enable(1); }); }
    const dc = dist + r + 0.05; const h = 2 * dc * Math.tan(fov / 2) * 1.6; viewCard.scale.set(h * asp, h, 1); viewCard.position.set(0, 0, -dc); camera.add(viewCard);
    held.pivot.traverse(x => x.layers.set(1)); viewCard.layers.set(1);
    return held.name + ': in view. Esc or click to put it back';
  }
  // Round 43 (Jake: "if there's a drain I want to be a ball through the drain: click the toilet, the sink, the shower drain, any drain, go
  // in, and I don't fall, I just roll; W and S to go and back up; I go until wherever the end of the drain is, the septic system, seeing
  // the view from inside the pipe"). drains.json (build_pipes.py, after the yard shift) has every drain run's centreline. The ride goes
  // along a run the way it falls; at its end it takes the run that end joins (a branch into the building drain, the building drain into
  // the sewer) and carries on down it; where nothing takes it, that is the end of the line, named after the equipment it lands in.
  function drainRuns() {
    const out = [];
    for (const [nm, R] of Object.entries(DRAINS)) {
      if (R.config && !inConfig(R.config)) continue;
      const pts = R.pts.map(p => new T.Vector3(p[0], p[2], -p[1])); const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      out.push({ name: nm, pts, cum, len: cum[cum.length - 1], r: R.r || 0.03 });
    }
    return out;
  }
  function runPoint(R, s_) {
    s_ = Math.max(0, Math.min(R.len, s_)); let i = 1; while (i < R.cum.length - 1 && R.cum[i] < s_) i++;
    const a = R.pts[i - 1], b = R.pts[i], L = R.cum[i] - R.cum[i - 1];
    return a.clone().lerp(b, L > 1e-6 ? (s_ - R.cum[i - 1]) / L : 0);
  }
  function projectOn(R, p) {
    let best = { d: 1e9, s: 0 };
    for (let i = 1; i < R.pts.length; i++) {
      const a = R.pts[i - 1], b = R.pts[i], ab = b.clone().sub(a), L2 = ab.lengthSq(); const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / L2));
      const d = p.distanceTo(a.clone().add(ab.multiplyScalar(t))); if (d < best.d) best = { d, s: R.cum[i - 1] + t * Math.sqrt(L2) };
    }
    return best;
  }
  function downhillDir(R, s_) { const a = runPoint(R, s_ - 0.25), b = runPoint(R, s_ + 0.25); return b.y <= a.y + 0.001 ? 1 : -1; }
  function drainStartFor(o) {
    const inst = o && (o.userData.inst || unitOf(o)); if (!inst || !Object.keys(DRAINS).length) return null;
    const bb = new T.Box3(); inst.traverse(m => { if (m.isMesh && m.visible) bb.expandByObject(m); }); if (bb.isEmpty()) return null;
    let best = null;
    for (const R of drainRuns()) for (const [k, s_] of [[0, 0], [R.pts.length - 1, R.len]]) { const d = bb.distanceToPoint(R.pts[k]); if (d < 0.35 && (!best || d < best.d)) best = { R, s: s_, d }; }
    return best;
  }
  function nextRun(runs, R, endPt, seen) {
    seen = seen || new Set([R.name]); let best = null;
    for (const B of runs) {
      if (seen.has(B.name)) continue;
      const pr = projectOn(B, endPt); if (pr.d > B.r + 0.08) continue;
      const dir = downhillDir(B, pr.s); const left = dir > 0 ? B.len - pr.s : pr.s;
      if (left < 0.05) {     // it joins right at B's downstream end: carry on through to whatever B runs into
        const deeper = nextRun(runs, B, runPoint(B, dir > 0 ? B.len : 0), new Set([...seen, B.name]));
        if (deeper && (!best || pr.d < best.pr.d)) best = Object.assign({}, deeper, { pr: Object.assign({}, deeper.pr, { d: pr.d }) });
        continue;
      }
      if (!best || pr.d < best.pr.d) best = { B, pr, dir };
    }
    if (best) return best;
    // a dead end on this run (a cleanout at the end of the building drain): the run that LEAVES this one downhill (the wye out to the sewer)
    for (const B of runs) {
      if (seen.has(B.name)) continue;
      for (const [k, sEnd, dirOut] of [[0, 0, 1], [B.pts.length - 1, B.len, -1]]) {
        const q = projectOn(R, B.pts[k]); if (q.d > R.r + B.r + 0.06) continue;
        const other = B.pts[k === 0 ? B.pts.length - 1 : 0]; if (other.y > B.pts[k].y + 0.01) continue;     // it has to go down away from here
        if (!best || other.y < best.low) best = { B, pr: { s: sEnd, d: q.d }, dir: dirOut, low: other.y };
      }
    }
    if (best) return best;
    // across a trap the drains do not draw (the laundry standpipe drops into its trap, the house drain carries on 19 cm away): the nearest
    // run that starts within 30 cm, below, and runs downhill
    for (const B of runs) {
      if (seen.has(B.name)) continue;
      for (const [k, sEnd, dirOut] of [[0, 0, 1], [B.pts.length - 1, B.len, -1]]) {
        const d = B.pts[k].distanceTo(endPt); if (d > 0.30 || B.pts[k].y > endPt.y + 0.02) continue;
        if (B.pts[k === 0 ? B.pts.length - 1 : 0].y > B.pts[k].y + 0.01) continue;
        if (!best || d < best.pr.d) best = { B, pr: { s: sEnd, d }, dir: dirOut };
      }
    }
    return best;
  }
  function startBall(o, hit) {
    const runs = drainRuns(); if (!runs.length) return 'no drain routes loaded';
    let R = null, s0 = 0;
    const pname = base(o.name || ''); const direct = runs.find(r => r.name === pname || r.name === partName(o));
    if (direct) { R = direct; s0 = hit && hit.point ? projectOn(R, hit.point).s : 0; }
    else { const st = drainStartFor(o); if (!st) return (partName(o) || o.name) + ': no drain starts here'; R = runs.find(r => r.name === st.R.name); s0 = st.s; }
    if (held) putBack(); if (elev) elevation();
    // inside the pipe: both faces drawn, the walls a shade darker (white PVC under a headlamp read as a blank white screen), a dark fog so
    // the pipe falls away ahead of you, the sky gone
    const mats_ = new Map(); pipes.traverse(m => { if (m.isMesh && m.material && !mats_.has(m.material)) { mats_.set(m.material, { side: m.material.side, color: m.material.color ? m.material.color.clone() : null }); m.material.side = T.DoubleSide; if (m.material.color) m.material.color.multiplyScalar(0.62); } });
    const fog0 = scene.fog, bg0 = scene.background; scene.fog = new T.Fog(0x15181b, 0.05, 2.6); scene.background = new T.Color(0x15181b);
    const hidden = []; pipes.traverse(m => { if (m.isMesh && m.visible && (/^flow_/.test(m.name) || m.userData.isStream)) { m.visible = false; hidden.push(m); } });
    const lamp = new T.PointLight(0xffefd8, 1.3, 3.0, 1.6); camera.add(lamp); if (!camera.parent) scene.add(camera);
    ball = { runs, R, s: s0, dir: downhillDir(R, s0), from: pos.clone(), yaw, pitch, near: camera.near, mats: mats_, hidden, lamp, fog0, bg0, trail: [], up: new T.Vector3(0, 1, 0), start: runPoint(R, s0), done: null, ly: 0, lp: 0 };
    camera.near = 0.004; camera.updateProjectionMatrix();
    if (meterObj) meterObj.visible = false;     // round 48: the meter is not in the pipe with you
    showInvert(ball.R, ball.dir);
    if (infoEl) infoEl.style.display = 'none';
    return 'ball mode: W rolls down the drain, S rolls back, Esc gets out';
  }
  // Round 45 (Jake: "maybe there's a double click, I can click and I can see where I am in the pipe"): the run you are in, the
  // size of it, how far you have come down, where you are in the house, and what is next along the way.
  // Round 46 (Jake: "maybe let's put a dot on the screen that should be the centre of the pipe, I should be aiming towards this, or maybe
  // there's a small thin line along the bottom of the pipe, very thin, so we know what's the bottom of the pipe where the flow should be").
  // Both: a line laid on the INVERT of the run you are in, which is where the water runs, and a dot on the centreline a little way ahead,
  // which is what you steer at. The line carries on into the next run so you can see where the drain goes before you get there.
  let invertLine = null, aimDot = null;
  function invertFor(R, dir) {
    const g = new T.BufferGeometry(); const v = [];
    const add = (RR, from, to) => {
      const step = 0.08;
      for (let s_ = from; (to > from ? s_ <= to : s_ >= to); s_ += (to > from ? step : -step)) {
        const p = runPoint(RR, s_); v.push(p.x, p.y - (RR.r * 0.82), p.z);
      }
    };
    add(R, dir > 0 ? 0 : R.len, dir > 0 ? R.len : 0);
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    return new T.Line(g, new T.LineBasicMaterial({ color: 0x2ad4ff, transparent: true, opacity: 0.85, depthTest: false }));
  }
  function showInvert(R, dir) {
    if (invertLine) { scene.remove(invertLine); invertLine.geometry.dispose(); invertLine = null; }
    if (!R) return;
    invertLine = invertFor(R, dir); invertLine.renderOrder = 4; scene.add(invertLine);
  }
  function stepAim() {
    if (!ball) { if (aimDot) { aimDot.style.display = 'none'; } return; }
    if (!aimDot) { aimDot = document.createElement('div'); aimDot.className = 'aimdot'; document.body.appendChild(aimDot); }
    const ahead = runPoint(ball.R, ball.s + ball.dir * 1.1);
    const p = ahead.clone().project(camera);
    const on = p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
    aimDot.style.display = on ? 'block' : 'none';
    if (on) { aimDot.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px'; aimDot.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px'; }
  }
  function ballWhere() {
    const b = ball; if (!b) return '';
    const p = runPoint(b.R, b.s); const nm = labels[b.R.name] || b.R.name.replace(/_/g, ' ');
    const inch = b.R.r ? (Math.round(b.R.r * 2 / 0.0254 * 2) / 2) : null;
    const nx = nextRun(b.runs, b.R, runPoint(b.R, b.dir > 0 ? b.R.len : 0));
    let on = null;
    for (const k in roomBoxes) {
      const bb = roomBoxes[k];
      if (p.x >= bb.min.x && p.x <= bb.max.x && p.z >= bb.min.z && p.z <= bb.max.z) { on = k.replace(/_/g, ' '); break; }
    }
    const parts = ['you are in the ' + nm];
    if (inch) parts.push(inch + ' in pipe');
    parts.push('down ' + Math.max(0, b.start.y - p.y).toFixed(2) + ' m from where you went in');
    if (on) parts.push('under the ' + on);
    parts.push(nx ? 'next: ' + (labels[nx.B.name] || nx.B.name.replace(/_/g, ' ')) : 'this is the last run');
    return parts.join(', ');
  }
  function endBall(msg) {
    if (!ball) return;
    for (const [m, was] of ball.mats) { m.side = was.side; if (was.color && m.color) m.color.copy(was.color); } for (const m of ball.hidden) m.visible = true; camera.remove(ball.lamp);
    scene.fog = ball.fog0; scene.background = ball.bg0;
    camera.near = ball.near; camera.updateProjectionMatrix(); pos.copy(ball.from); yaw = ball.yaw; pitch = ball.pitch; camera.up.set(0, 1, 0);
    showInvert(null); if (aimDot) aimDot.style.display = 'none';
    if (meterObj) meterObj.visible = true;
    ball = null; labelEl.textContent = msg || 'out of the drain'; labelEl.style.display = 'block';
  }
  function endOfLine(p) {
    let best = null;
    equip.children.forEach(u => { if (!u.visible) return; const bb = new T.Box3(); u.traverse(m => { if (m.isMesh && m.visible) bb.expandByObject(m); }); if (bb.isEmpty()) return; const d = bb.distanceToPoint(p); if (d < 0.6 && (!best || d < best.d)) best = { d, u, bb }; });
    if (ball && best) ball.tank = best;
    return best ? pretty(best.u.userData.model) : 'the end of the pipe';
  }
  // Round 48 (Jake: "when I get inside of the Lee's or whatever septic system it is, I should be there, I should be able to see inside the
  // septic"): the ride does not stop at the tank wall, it carries you in. You land in the first chamber above the liquid and the drag looks
  // round in there; S rolls back out the way you came.
  function intoTank(b) {
    if (!b.tank || b.inTank) return;
    const bb = b.tank.bb; const c = bb.getCenter(new T.Vector3());
    const p = runPoint(b.R, b.dir > 0 ? b.R.len : 0);
    const into = new T.Vector3(c.x - p.x, 0, c.z - p.z); if (into.lengthSq() < 1e-6) into.set(0, 0, 1);
    into.normalize();
    b.inTank = p.clone().add(into.multiplyScalar(Math.min(0.9, bb.getSize(new T.Vector3()).length() * 0.16)));
    b.inTank.y = Math.min(p.y + 0.10, bb.max.y - 0.25);
  }
  function ballStep(dt) {
    const b = ball; const v = (keys.ShiftLeft || keys.ShiftRight ? 3.2 : 1.1) * dt;
    let go = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    if (go > 0 && !b.done) {
      b.s += b.dir * v;
      if (b.s < 0 || b.s > b.R.len) {
        const endS = b.s < 0 ? 0 : b.R.len; const endPt = runPoint(b.R, endS); const nx = nextRun(b.runs, b.R, endPt);
        if (nx) { b.trail.push({ R: b.R, s: endS, dir: b.dir }); b.R = nx.B; b.dir = nx.dir; b.s = nx.pr.s; showInvert(b.R, b.dir); }
        else { b.s = endS; b.done = endOfLine(endPt); }
      }
    } else if (go < 0) {
      b.done = null; b.inTank = null; b.tank = null; b.s -= b.dir * v;
      if ((b.dir > 0 && b.s < 0) || (b.dir < 0 && b.s > b.R.len)) {
        if (b.trail.length) { const t = b.trail.pop(); b.R = t.R; b.dir = t.dir; b.s = t.s; showInvert(b.R, b.dir); } else b.s = b.dir > 0 ? 0 : b.R.len;
      }
    }
    if (b.done && b.tank) intoTank(b);
    if (b.inTank && b.done) {
      camera.position.lerp(b.inTank, Math.min(1, dt * 4)); camera.up.lerp(new T.Vector3(0, 1, 0), Math.min(1, dt * 4)).normalize();
      const fwd = new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(0, 1, 0), b.ly).applyAxisAngle(new T.Vector3(1, 0, 0), b.lp);
      camera.lookAt(camera.position.clone().add(fwd));
      if (b.note > 0) { b.note -= dt; labelEl.style.display = 'block'; return; }
      labelEl.textContent = 'you are inside the ' + b.done + '. Drag to look round in here, S rolls back up the pipe, Esc gets out';
      labelEl.style.display = 'block'; return;
    }
    const here = runPoint(b.R, b.s); let ahead = runPoint(b.R, b.s + b.dir * 0.35);
    if (ahead.distanceTo(here) < 0.05) { const nx = nextRun(b.runs, b.R, here); ahead = nx ? runPoint(nx.B, nx.pr.s + nx.dir * 0.35) : here.clone().add(new T.Vector3(0, -0.1, 0)); }
    const dirv = ahead.clone().sub(here); if (dirv.lengthSq() < 1e-8) dirv.set(0, -1, 0); dirv.normalize();
    // Round 45 (Jake: "I need to be able to look around while I'm in there, my mouse drag should still work"): the drag turns
    // the head inside the pipe. The roll still follows the pipe, so W keeps going the way the drain goes however you look.
    if (b.ly || b.lp) {
      const side = new T.Vector3().crossVectors(dirv, b.up).normalize();
      const upv = new T.Vector3().crossVectors(side, dirv).normalize();
      dirv.applyAxisAngle(upv, b.ly).applyAxisAngle(side, b.lp).normalize();
    }
    if (Math.abs(dirv.y) < 0.9) b.up.set(0, 1, 0); else { const h = new T.Vector3(dirv.x, 0, dirv.z); if (h.lengthSq() > 1e-6) b.up.copy(h.normalize()); }
    camera.position.lerp(here, Math.min(1, dt * 10)); camera.up.lerp(b.up, Math.min(1, dt * 4)).normalize();
    const look = camera.position.clone().add(dirv); camera.lookAt(look);
    const lab = labels[b.R.name] || b.R.name.replace(/_/g, ' ');
    if (b.note > 0) { b.note -= dt; if (b.note > 0) { labelEl.style.display = 'block'; return; } }     // round 45: the double click answer stays up for a few seconds
    labelEl.textContent = (b.done ? 'end of the line: ' + b.done + '. S rolls back, Esc gets out' : 'ball: ' + lab + '  (fell ' + Math.max(0, b.start.y - here.y).toFixed(2) + ' m)  W down, S back, Esc out');
    labelEl.style.display = 'block';
  }
  function putBack() {
    if (viewCard && viewCard.parent) viewCard.parent.remove(viewCard);
    if (held && held.view) { const h = held; held = null; camera.remove(h.pivot); if (infoEl && h.info) infoEl.style.display = h.info; return h.name + ': back in place'; }     // round 42: View is a copy, nothing to put back
    if (!held) return 'nothing in your hands';
    const h = held; held = null; camera.remove(h.pivot); h.parent.add(h.obj); h.obj.matrixAutoUpdate = h.auto; h.obj.matrix.copy(h.matrix);
    if (h.auto) h.obj.matrix.decompose(h.obj.position, h.obj.quaternion, h.obj.scale); h.obj.updateMatrixWorld(true);
    return h.name + ': back in place';
  }
  function unitOf(o) { for (let p = o; p; p = p.parent) if (p.parent === equip) return p; return o.userData.inst || null; }
  // set a part aside: its own clip if it has one, otherwise lift it and set it beside its place (a riser lid, a box lid, a cap)
  function asideOff(o, any, dist) {
    // the part itself moves: climb only through wrapper nodes that carry the part's own name (a multi material mesh sits under
    // one). Climbing to the model's top group took the whole shower along with its handle (round 22).
    let p = o; while (p.parent && p.parent !== equip && p.parent !== pipes && p.parent.parent !== equip && p.parent.parent !== pipes && partName(p.parent) === partName(o)) p = p.parent;
    const nm = nodeName(o);
    if (!any && !/lid|cover|cap$|door|panel|plate$|hatch|top$/.test(nm)) return null;
    const home = plugs.get(p);
    if (home) { p.position.copy(home); plugs.delete(p); return nm + ' (back on)'; }
    plugs.set(p, p.position.clone());
    const w = new T.Box3().setFromObject(p).getSize(new T.Vector3());
    const q = new T.Vector3(dist || Math.max(0.35, w.x * 1.1), dist ? 0 : 0.02, 0); if (p.parent) { const pq = new T.Quaternion(); p.parent.getWorldQuaternion(pq); q.applyQuaternion(pq.invert()); }
    p.position.add(q); return nm + ' (off, set aside)';
  }
  function removePart(o) {
    const plug = plugOff(o); if (plug) return plug;
    const lid = lidOff(o); if (lid) return lid;
    const played = playClipFor(o, 'remove'); if (played) return nodeName(o) + '  [' + played + ']';
    return asideOff(o);
  }
  // Round 27: the yard system runs as a cycle. Water goes down the sewer into the tank, the tank fills (high_water), the float brings
  // the pump on (pump_run), the level drops (pump_down), and it repeats while the water runs. Each plant plays the clips it has.
  let sysOn = false, sysTimers = [];
  const CYCLES = { 'pump_tank.glb': ['high_water', 'pump_run', 'pump_down'], 'septic_lee.glb': ['float_test', 'pump_run'], 'septic_lee_overland.glb': ['float_test'],
                    'lift_station_r12.glb': ['fill_from_house', 'pump_down'] };     // (round 68: every plant that carries a plant_sim is skipped by plantCycle: its floats run it, not this table)
  function playNamed(inst, name, on) {
    const A = inst.userData.anim; if (!A) return 0; const c = A.clips.find(x => x.name === name); if (!c) return 0;
    const act = A.mixer.clipAction(c); act.loop = T.LoopOnce; act.clampWhenFinished = true; const st = A.state[c.name] || (A.state[c.name] = { open: false }); st.open = on;
    if (on) { act.reset(); act.timeScale = 1; act.play(); } else if (ONE_WAY.test(name)) act.stop(); else { act.paused = false; act.enabled = true; act.timeScale = -1; if (act.time <= 0) act.time = c.duration; act.play(); }
    const lp = A.clips.find(x => x.name === name + '_loop'); if (lp) { const la = A.mixer.clipAction(lp); la.loop = T.LoopRepeat; if (on) { la.reset(); la.play(); } else la.stop(); }
    refreshStreams(inst); afterClip(inst, name, on); return c.duration;
  }
  function systemRun() {
    sysOn = !sysOn;
    if (sysOn) running.add('sewer'); else running.delete('sewer'); showFlows();
    plantCycle(sysOn, false);     // round 65: one cycle runner, shared with the water that arrives from a fixture
    if (sysOn && CONFIG.sewer.startsWith('city')) return CONFIG.fault === 'belly' ? 'water down the sewer to the street: cut the lateral open at the belly and see what stands in it (click again to stop)' : 'water down the sewer to the street (click again to stop)';
    return sysOn ? 'water into the tank: watch it fill, flow over and the pump come on (click again to stop)' : 'water off';
  }
  const RUN_PREF = /^(fan_run|fire_up|flush|aerate|pump_run|disposal_run|faucet_run|shower_on|hot_on|backwash|service|fill_from_house|run)$/;
  function unitRunClip(inst) {
    const A = inst && inst.userData.anim; if (!A) return null;
    const runs = A.clips.filter(c => CLIP_WORK.test(c.name) && !/_loop$/.test(c.name));
    return runs.find(c => RUN_PREF.test(c.name)) || runs[0] || null;
  }
  function workPart(o) {
    if (!o.userData.inst && /^(pipe_dwv_sewer|pipe_dwv_building_drain|cleanout_dwv|pipe_dwv_effluent)/.test(nodeName(o))) return systemRun();
    if (o.userData.inst && !powered(o.userData.inst)) return nodeName(o) + ': ' + noPower(o.userData.inst);     // round 29: a dead circuit runs nothing
    // Round 52: a lead off a capacitor tab, or on the wrong one, is not a thing the unit shrugs at. This is the payoff of the
    // grab tool: put it back wrong and the machine tells you, the way it would in a driveway.
    const gf = grabFault(o.userData.inst || unitOf(o));
    if (gf) return gf;
    const fk = flowKeyFor(o); let played = playClipFor(o, 'work');
    // Round 28 (Jake: in the elevation on the water filter I am unable to click Run): a part with no run clip of its own runs its unit
    if (!played && o.userData.inst) { const c = unitRunClip(o.userData.inst); if (c) { const A = o.userData.inst.userData.anim; const on = !(A.state[c.name] && A.state[c.name].open); playNamed(o.userData.inst, c.name, on); played = c.name + (on ? '' : ' (back)'); } }
    let f = null; if (fk) f = toggleFlow(fk);
    // the fan: the air in the ducts moves while the blower runs (the furnace's fan_run or fire_up, the air handler's fan_run)
    if (played && /^(fan_run|fire_up|run)\b/.test(played) && /furnace|air_handler|package/.test((o.userData.inst && o.userData.inst.userData.model) || '')) { const on = !/\(back\)/.test(played); if (on) running.add('fan'); else running.delete('fan'); showFlows(); f = (f ? f + '  ' : '') + (on ? FLOW_SETS.fan.label : 'air off'); }
    const bib = !played && !fk ? hoseBib(o) : null; if (bib) return bib;
    if (!played && !f) return null;
    return nodeName(o) + (played ? '  [' + played + ']' : '') + (f ? '  ' + f : '');
  }
  // The Look chain, callable from a click, the panel and the self test: returns what it did (or the name), never null.
  // Round 29 (Jake: "click the attic door, it doesn't actually let the ladder down ... I can't climb up the ladder"). The door, its
  // cord and the frame drop the ladder on its clip (again folds it up); with it down, a click on any section climbs it: up onto the
  // attic walkway at the hatch, or, from up there, back down to the garage slab at its foot.
  function ladderDown(inst) { const A = inst.userData.anim; return !!(A && A.state.ladder_down && A.state.ladder_down.open); }
  function ladderClimb(inst) {
    if (!ladderDown(inst)) return 'the ladder is folded up: click the door to pull it down first';
    const top = new T.Vector3(); (waypoints.wp_attic_hatch || inst).getWorldPosition(top);
    if (pos.y < top.y - 0.5) { pos.set(top.x, top.y + EYE, top.z); yaw = 0; pitch = 0; eye = EYE; return 'up the ladder: on the attic walkway over the garage, the hatch at your feet'; }
    const foot = new T.Vector3(); inst.getWorldPosition(foot);
    pos.set(foot.x, GRADE_Y + 0.02 + EYE, foot.z + 2.2); yaw = 0; pitch = 0; eye = EYE; return 'down the ladder, on the garage slab';     // round 39: the slab is at grade now
  }
  function ladderAction(o, inst) {
    const nm = partName(o), down = ladderDown(inst);
    if (/^ladder_sec/.test(nm)) return ladderClimb(inst);
    playNamed(inst, 'ladder_down', !down); return down ? 'ladder folded back up into the ceiling' : 'ladder down: click the ladder to climb it';
  }
  // Round 74 (Jake wanted manual dampers on every takeoff off the attic trunk; this makes them work). A tap on a damper's lever or
  // blade turns both about the shaft: as the balancer left it (a quarter closed), wide open, half, shut, and round again. The
  // lever lies along the blade, so you can read the blade's position from outside the duct, which is the point of the thing.
  const DAMPER_STEPS = [[25, 'set where the balancer left it, about a quarter closed.'], [0, 'wide open. All the air this run can carry!'], [45, 'half closed. Less air here, a little more for every other room.'],
    [90, 'shut. No air to this room, and the lever sits straight across the duct to tell you so.']];
  function damperTurn(o) {
    let n = o; while (n && !/^takeoff_(handle|damper)_/.test(n.name || '')) n = n.parent; if (!n) return null;
    // a lever with two materials arrives as a group with numbered children (takeoff_handle_bed2_1_1), so peel numbers until the blade is found
    let key = String(n.name).replace(/^takeoff_(handle|damper)_/, ''), blade = null;
    for (let i = 0; i < 3 && !blade; i++) { blade = scene.getObjectByName('takeoff_damper_' + key); if (!blade) key = key.replace(/_\d+$/, ''); }
    if (!blade) return null; const lever = scene.getObjectByName('takeoff_handle_' + key);
    const st = blade.userData.dmp || 0, nx = (st + 1) % DAMPER_STEPS.length; blade.userData.dmp = nx;
    const P = blade.getWorldPosition(new T.Vector3()); let trunkX = P.x; const tr = scene.getObjectByName('duct_hvac_supply_trunk'); if (tr) trunkX = new T.Box3().setFromObject(tr).getCenter(new T.Vector3()).x;
    const d = (P.x < trunkX ? -1 : 1) * (DAMPER_STEPS[nx][0] - DAMPER_STEPS[st][0]) * Math.PI / 180, Y = new T.Vector3(0, 1, 0);
    for (const x of [blade, lever]) { if (!x) continue;
      const w = x.getWorldPosition(new T.Vector3()).sub(P).applyAxisAngle(Y, d).add(P); if (x.parent) x.parent.worldToLocal(w); x.position.copy(w); x.rotateOnWorldAxis(Y, d); x.updateMatrixWorld(true); }
    const room = key.replace(/_\d+$/, '').split('_').map(w_ => PLACE_WORDS[w_] || w_).join(' ').replace(/master bedroom (bath|closet)/, 'master $1');
    return capFirst(room) + ' damper: ' + DAMPER_STEPS[nx][1] + ' Tap it again to turn it.';
  }
  function lookAction(o, hit) {
    const nm = partName(o) || o.userData.label || base(o.name), pk = o.userData.pack ? o.userData.pack + ': ' : '';
    if (o.userData.inst && /attic_ladder/.test(o.userData.inst.userData.model || '')) return pk + ladderAction(o, o.userData.inst);
    // Look: the first obvious layer. Controls and switches, then whatever comes off (a plug, a lid, a door, a cover), then the
    // cutaways (a section set, a part's section, a pipe), then the name.
    const dm = damperTurn(o); if (dm) return dm;     // round 74: the manual dampers on the attic trunk's takeoffs
    const sv = shutoffValve(o) || meterCover(o); if (sv) return (sv);
    // round 55: a disconnect is a control, like a valve handle. Look pulls it.
    if (/^disconnect(_pullout|_cover)?$/.test(nm) && (o.userData.inst || unitOf(o))) { const m_ = discPull(o.userData.inst || unitOf(o)); if (m_) return pk + m_; }
    const bib = hoseBib(o); if (bib) return (bib);
    const rv = reveal(o); if (rv) return (pk + rv);
    const inst = o.userData.inst;
    // in the opened shower bay: the handle comes off in the hand, then the cartridge pulls out of the body (Jake: 'remove the trim,
    // then the handle, pull out, see the cartridge'). The Work tool runs the water from the bare stem.
    if (inst && /^stat_(up|down)$/.test(nm)) return (pk + statSet(inst, nm === 'stat_up' ? 1 : -1));     // round 27: the thermostat's buttons
    if (inst && STAT_CTL[nm] && /thermostat/.test(inst.userData.model || '')) return (pk + statControl(inst, STAT_CTL[nm]));     // round 45: the three stats
    if (inst && inst.userData.revealOpen && nm === 'handle') { const a = asideOff(o, true); if (a) return (pk + a); }
    if (inst && inst.userData.revealOpen && allowed(o, 'pull')) {
      let hOff = false; inst.traverse(x => { if (x.isMesh && partName(x) === 'handle' && plugs.has(x)) hOff = true; });
      if (!hOff) return (pk + nm + ': take the handle off first');
      const a = asideOff(o, true, 0.14); if (a) return (pk + a.replace('set aside', 'pulled out'));
    }
    if (isControl(o) && (!inst || allowed(o, 'control'))) {
      const fk = flowKeyFor(o), played = playClipFor(o, 'look');
      const f = fk && (played || /handle|lever|knob/.test(nm)) ? toggleFlow(fk) : null;
      if (played || f) return (pk + nm + (played ? '  [' + played + ']' : '') + (f ? '  ' + f : ''));
    }
    if (!inst) {
      // the house's own parts: cleanout plugs, riser lids, and ONE pipe cut at a time
      const plug = plugOff(o); if (plug) return (plug);
      const lid = lidOff(o); if (lid) return (lid);
      if (PIPEY.test(nm) && !NOT_CUT.test(nm)) { const pcut = pipeCutaway(o, hit); if (pcut) return (pcut); }     // round 34: cuts stay until you close them
      return (pk + nm);
    }
    if (allowed(o, 'remove')) {
      const rem = playClipFor(o, 'remove'); if (rem) return (pk + nm + '  [' + rem + ']');
      const aside = asideOff(o, true); if (aside) return (pk + aside);
    }
    if (allowed(o, 'cut')) {
      // a click on the open cut itself closes it; a click on another cuttable part closes whatever is open first (one cutaway per unit)
      const sset = sectionSet(o); if (sset) return (pk + sset);     // round 34: a new cut no longer closes the last one (it used to, round 23)
      const c = pipeCutaway(o, hit); if (c) return (pk + c);
    }
    return pk + nm + (inst.userData.anim && actionOf(o) && actionOf(o).work ? ' (Run runs it)' : '');
  }
  function pick() {
    ray.setFromCamera(pickNDC || new T.Vector2(0, 0), camera);
    // the cursor, not the crosshair, since round 33. Round 34: this range line sat after a comment on the line above and never ran
    // round 60: a UNIT can be picked from across the room (15 m) so a click carries you to it; everything else still works at arm's reach (REACH)
    const REACH = 6; ray.far = (elev && elev.orbit) ? 80 : 15; pickNDC = null;
    // A click goes THROUGH the contents of a tank to the part under them, and through the tub's glass doors (round 17)
    const hits = ray.intersectObjects([...equip.children, ...pipes.children, ...doors, ...lids], true).filter(h => h.object.visible && !/^(water|bubbles|mix_arrows|airlift_spurt|scum|sludge|glass_doors)/.test(partName(h.object)));
    if (held && (tool === 'apart' || held.view)) { const m = putBack(); if (!hits.length) return say(m); }     // round 30: with a part in your hands, the next click puts it back first; round 39: a viewed part too
    if (!hits.length) { labelEl.style.display = 'none'; return; }
    const o = hits[0].object; let dr = o; while (dr && !dr.userData.isDoor) dr = dr.parent;
    const say = t => { labelEl.textContent = t; labelEl.style.display = 'block'; };
    if (!(elev && elev.orbit)) {
      // round 60, the working view: a click on a placed unit you are not standing at takes you in front of it and does nothing else
      const u0 = unitOf(o), isUnit = !!u0 && u0.parent === equip;
      if (isUnit && !fly && !ball && !held && (tool === 'look' || hits[0].distance > REACH) && !nearUnit(u0)) {
        const m = goToUnit(u0); if (m) { lastUnit = u0; return say(unitNameOf(u0) + ': ' + m + ' (click it again to work its parts; walking lets go)'); }
      }
      if (hits[0].distance > REACH) { labelEl.style.display = 'none'; return; }
    }
    if (dr) { toggleDoor(dr); return say('Door: ' + (dr.userData.open ? 'open' : 'closed') + ' (click again)'); }
    if (o.userData.inst) lastUnit = o.userData.inst;     // the Elevation tool and button frame the last thing you clicked when the crosshair is not on a unit
    const nm = partName(o) || o.userData.label || base(o.name), pk = o.userData.pack ? o.userData.pack + ': ' : '';
    // Round 57 (Jake: "the disconnect on the house for the HVAC unit condenser still doesn't open"). It was not the disconnect. Any
    // part that carries a note in wires.json returned that note HERE and never reached lookAction, so it could not do the thing it
    // does. wires.json has an entry for ^disconnect on the condenser, so every click on it printed a paragraph about disconnects
    // and nothing moved. A part that DOES something now does it, and the note is what you get when it does not. This also had a
    // plain bug in it: openPanel was passed `hit`, which does not exist in this scope, so the click threw before it said anything.
    const wt0 = wireText(o);
    if (wt0 && tool === 'look' && !actionOf(o)) {
      const la = lookAction(o, hits[0]);
      openPanel(o, hits[0]);
      const did = la && la !== nm && la !== pk + nm;
      return say(did ? la : pk + nm + ': ' + wt0);
    }
    if (tool === 'elevation') {
      const root = unitOf(o); if (!root || root === o && !o.userData.inst) return say(nm + ': elevation is for a placed fixture or unit');
      const m = elevation(root); setTool('look'); return say(m);
    }
    if (tool === 'cutaway') {
      const sset = sectionSet(o); if (sset) return say(pk + sset);
      const c = pipeCutaway(o, hits[0]); return say(c ? pk + c : pk + nm + ': nothing to cut here');
    }
    if (tool === 'remove') { const r = removePart(o); return say(r ? pk + r : pk + nm + ': that does not come off'); }
    if (tool === 'apart') { const m = takeApart(o); openPanel(o, hits[0]); return say(m); }
    if (tool === 'work') { const w = workPart(o); openPanel(o, hits[0]); return say(w ? pk + w : pk + nm + ': nothing here runs, the panel lists what does'); }
    if ((tool === 'meter' || tool === 'clamp') && meter) return say(meterClick(o, hits[0]));     // round 47: the meters
    if (tool === 'grab' && pliers) return say(grabClick(o, hits[0]));     // round 52: the pliers
    openPanel(o, hits[0]);
    return say(lookAction(o, hits[0]));
  }
  document.getElementById('fly').onclick = e => { fly = !fly; e.target.classList.toggle('on', fly); };
  let crouchOn = false, halfOn = false, crawlOn = false;
  // Round 34 (Jake: "I need a crawl state, not just crouch, I am hitting my head in all the floor joists"): C steps stand, crouch,
  // crawl, stand. Crawling the eye is 30 cm off the ground (the joists are 49 cm up off the crawl dirt), the step and the ground
  // probes drop to shin height, and you move at half pace.
  // Round 52 (Jake: "I'm wondering about the crouch button, if it's not fully adjustable. I click it once and I go to a preset
  // position, but if I click and hold, it brings me down in a percentage so I can stop, and I let go, it holds. A lot of times
  // I'm working on something and I go too low or too high").
  //
  // A tap is still the preset step: stand, crouch, crawl, stand. A HOLD runs the eye height smoothly and freezes it where you
  // let go, and each hold runs the opposite way from the last one, so the same button takes you down and back up. Any tap
  // afterwards drops the free height and puts you back on the presets.
  let freeEye = null, eyeRamp = 0, eyeDir = -1, holdT = null;
  const crouchBtn = document.getElementById('crouch');
  function crouchLabel() {
    crouchBtn.textContent = freeEye !== null ? (Math.round(freeEye * 39.37) + ' in') : (crawlOn ? 'Crawling' : (crouchOn ? 'Crouched' : 'Crouch'));
    crouchBtn.classList.toggle('on', crouchOn || freeEye !== null);
  }
  function showEye() {
    if (freeEye === null) return;
    labelEl.textContent = 'eye height ' + Math.round(freeEye * 39.37) + ' in (' + freeEye.toFixed(2) + ' m). Let go and it holds there, hold again to go back the other way';
    labelEl.style.display = 'block'; crouchLabel();
  }
  // Round 60 (Jake, on his phone: "a slider over to the side. All the way up is standing, all the way down is crawling. They can
  // adjust that position all they want to"). One call that puts the eye at any height between the two, for a slider to drive.
  // Crawling is not only a low eye: it is also the 30 cm step and the half pace that get you through the 16 in crawl door, so the
  // stance goes with the height (crawl at or under 42 cm, crouch at or under 80 cm, standing above). The height itself is the same
  // free height the held Crouch button already sets, so the roof and the joists still cap it and a tap on C still takes it back.
  function setEye(h) {
    h = Math.max(0.30, Math.min(EYE, +h || EYE));     // 30 cm is the crawl: the joists are 49 cm up off the crawl dirt
    crawlOn = h <= 0.42; crouchOn = crawlOn || h <= 0.80; halfOn = false; document.getElementById('crouch2').classList.remove('on');
    freeEye = h >= EYE - 0.03 ? null : h; glideEye = null; eyeRamp = 0; crouchLabel();
    return freeEye === null ? EYE : freeEye;
  }
  function eyeWanted() { return freeEye !== null ? freeEye : (crawlOn ? 0.30 : (crouchOn ? 0.55 : (halfOn ? 1.05 : EYE))); }
  function crouchStep() {
    freeEye = null;
    if (!crouchOn) { crouchOn = true; crawlOn = false; }
    else if (!crawlOn) crawlOn = true;
    else { crouchOn = false; crawlOn = false; }
    if (crouchOn) { halfOn = false; document.getElementById('crouch2').classList.remove('on'); }
    crouchLabel();
  }
  function eyeHoldStart() {
    if (eyeRamp) return;
    if (freeEye === null) freeEye = eye;
    eyeRamp = eyeDir; showEye();
  }
  function eyeHoldStop() {
    if (!eyeRamp) return;
    eyeRamp = 0; eyeDir = -eyeDir; crouchLabel();
    labelEl.textContent = 'holding at ' + Math.round(freeEye * 39.37) + ' in. Hold the button again to go back the other way, tap it for the presets';
    labelEl.style.display = 'block';
  }
  crouchBtn.addEventListener('pointerdown', e => { e.preventDefault(); holdT = setTimeout(() => { holdT = null; eyeHoldStart(); }, 220); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    crouchBtn.addEventListener(ev, () => {
      if (holdT) { clearTimeout(holdT); holdT = null; if (ev === 'pointerup') crouchStep(); return; }
      eyeHoldStop();
    });
  }
  document.getElementById('crouch2').onclick = e => { halfOn = !halfOn; if (halfOn) { crouchOn = false; crawlOn = false; document.getElementById('crouch').classList.remove('on'); document.getElementById('crouch').textContent = 'Crouch'; } e.target.classList.toggle('on', halfOn); };
  // zoom: the button snaps to a close field of view, the wheel trims it. Esc / clicking Zoom again goes back to normal.
  const FOV0 = camera.fov;
  function setFov(f) { camera.fov = Math.max(12, Math.min(FOV0, f)); camera.updateProjectionMatrix(); document.getElementById('zoom').classList.toggle('on', camera.fov < FOV0 - 1); }
  document.getElementById('zoom').onclick = () => setFov(camera.fov < FOV0 - 1 ? FOV0 : 24);
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault();
    if (elev && elev.orbit) { elev.orbit.dist = Math.max(0.25, Math.min(80, elev.orbit.dist * (e.deltaY > 0 ? 1.12 : 0.89))); clearTimeout(corrT); corrT = setTimeout(elevCorridor, 150); return; }
    setFov(camera.fov + (e.deltaY > 0 ? 4 : -4)); }, { passive: false });
  // X-ray takes the whole shell, not just the walls. It used to touch wall_, floor_ and door_ only, so you turned it on
  // and the siding, the trim, the gutters, the windows, the ceilings and the roof were all still solid and the house
  // looked exactly the same from outside (Jake: make everything obey the X-ray command). The ground, the drive and the
  // walk stay solid: you are standing on them.
  const XRAY_ON = ['wall_', 'floor_', 'door_', 'ceil_', 'roof_', 'trim_', 'win_', 'stair_', 'curb_', 'soffit', 'platform_', 'fix_walkway'];
  const XRAY_OFF = ['floor_lot', 'floor_patch_lawn', 'trim_riser_collar', 'floor_driveway', 'floor_walk', 'floor_porch', 'floor_stoop'];
  const isShell = n => XRAY_ON.some(p => n.startsWith(p)) && !XRAY_OFF.some(p => n.startsWith(p));
  let xray = false;
  document.getElementById('xray').onclick = e => {
    xray = !xray; e.target.classList.toggle('on', xray);
    for (const g of [house, pipes]) g.traverse(o => { if (o.isMesh && isShell(o.name)) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.transparent = xray; m.opacity = xray ? 0.25 : 1; m.depthWrite = !xray; m.needsUpdate = true; } } });
  };
  // The septic plant, the tank, the sewer and the water service are all BURIED. The cutaways were working the whole
  // time and you were looking at them through the lawn (Jake: "can't see anything from the tanks"). The ground stays
  // out of X-ray on purpose, because you are standing on it, so it gets its own switch.
  document.getElementById('ground').onclick = e => {
    groundOn = !groundOn; e.target.classList.toggle('on', groundOn);
    // Back ON brings back only the ground that belongs in this yard. It used to set every ground-named mesh visible:
    // each tank model's own grass and dirt (hidden by its placement; the 540's is a 60 m sheet at lawn height that
    // flickered against the lawn), their section copies, and the lawn patches of the OTHER layouts, which lie straight
    // over this layout's open risers (Jake 2026-09-13: "that weird stuff... is covering the tanks, and I can't see into
    // the tanks").
    for (const g of [house, equip, pipes]) g.traverse(o => { if (o.isMesh && isGround(o)) o.visible = groundOn && showable(o); });
  };
  // A switch, because a house you walk at night is a different house from one you walk at noon, and because a
  // fixture that is off has to LOOK off: the glow goes with the light.
  document.getElementById('lights').onclick = e => {
    lightsOn = !lightsOn; e.target.classList.toggle('on', lightsOn);
    for (const f of fixtures) for (const m of f.mats) { m.emissiveIntensity = lightsOn ? 1 : 0; m.needsUpdate = true; }
    updateLights();
  };
  // ---------------------------------------------------------------- elevation
  // Jake 2026-09-11: "how would I get, like, an elevation view of the septic? same way with an elevation view of the
  // water filter." Point at the thing and press Elevation. Every part of it that ships a _section is swapped for its
  // section, the ground comes off, and you are put side on to the cut face at a long lens, which is what an elevation
  // is. One part at a time is the click cutaway; this is the whole unit at once, framed.
  // Round 19 (Jake 2026-09-14: "if I could click on a toilet, click elevation, boom, it pops me to this elevation plane where
  // the toilet's perfectly in a good view, and I can manipulate things ... same thing with the air conditioner"). Any placed
  // unit now, not only the ones that ship sections: point at it, or click it first, and press Elevation (or E). It is
  // framed square on at a long lens, level with its middle, from the side its sections open to, or from its front when
  // it has none; its sections are swapped in; the house between you and it goes away. Then the pointer is free: drag
  // to turn round the unit, wheel to move in and out, the letter keys slide it across the view, and a click works a
  // part under the mouse the same as in the walk (covers, cutaways, switches, the shower wall). Elevation or Esc brings
  // you back to where you stood.
  let elev = null, lastUnit = null;
  function unitBox(units) {
    // The unit is its BODY and what sits on it. The biggest solid (the cabinet, the tank, the bowl) sets the box, and
    // every part whose own box comes within 60 cm of it is added. A line that leaves the unit for the house (the
    // condenser's whip and lineset, a plant's spray field, a grass sheet) is not the unit: framing the whole model put
    // the condenser at the bottom of a picture of sky.
    const parts = [];
    for (const u of units) u.traverse(o => {
      if (!o.isMesh || !o.visible || o.userData.isStream || isGround(o)) return;
      const bb = new T.Box3().setFromObject(o); if (bb.isEmpty()) return;
      const sz = bb.getSize(new T.Vector3()); parts.push({ bb, vol: sz.x * sz.y * sz.z, span: Math.max(sz.x, sz.y, sz.z) });
    });
    const body = parts.filter(p => p.span < 8).sort((a, b) => b.vol - a.vol)[0];
    if (!body) return new T.Box3();
    const near = body.bb.clone().expandByScalar(0.6), b = body.bb.clone();
    for (const p of parts) if (p.span < 8 && p.bb.intersectsBox(near)) b.union(p.bb);
    return b;
  }
  // Nothing of the house between the camera and the unit. Every house mesh in the corridor from the camera to the unit is
  // hidden while the elevation is up, and comes back with it; it is worked out again after every turn round the unit.
  // The corridor is as wide as the view where the house is, and runs from below the cut up past the roof: cut off at the
  // cut's own height it left the floor over the camera and the crawl's pipes across the top of the picture. Pipes and
  // the other placed units go too when their middle is inside the house's stem wall (the crawl runs, the hose bib through
  // the wall, the kitchen appliances); the sewer, the air line and the conduit that run out to a yard unit, and the
  // blower on the outside of the wall, are outside it and stay. The yard's own things go wherever they are.
  function elevCorridor() {
    if (!elev) return;
    for (const [o, v] of elev.corr) o.visible = v; elev.corr.clear();
    const c = elev.orbit.centre, size = elev.size, wide = elev.span * 0.62 * camera.aspect + 1.0;
    const corridor = new T.Box3().setFromPoints([pos.clone(), c.clone()]).expandByVector(new T.Vector3(wide, size.y * 0.6, wide));
    corridor.max.y = Math.max(corridor.max.y, 30);
    house.traverse(o => { if (!o.isMesh || !o.visible) return; const bb = new T.Box3().setFromObject(o); if (!bb.intersectsBox(corridor)) return; elev.corr.set(o, o.visible); o.visible = false; });
    let stem = null; house.traverse(o => { if (o.isMesh && nodeName(o) === 'wall_crawl_stem') stem = (stem || new T.Box3()).expandByObject(o); });
    const inHouse = (bb, m_) => { const m = bb.getCenter(new T.Vector3()); return m.x > stem.min.x - m_ && m.x < stem.max.x + m_ && m.z > stem.min.z - m_ && m.z < stem.max.z + m_; };
    if (stem) for (const grp of [pipes, ...equip.children.filter(u => !elev.roots.includes(u))]) grp.traverse(o => {
      if (!o.isMesh || !o.visible) return; const bb = new T.Box3().setFromObject(o);
      const yardThing = grp !== pipes && /^little\//.test(o.userData.pack || '');
      if (!bb.intersectsBox(corridor) || !(yardThing || inHouse(bb, grp === pipes ? 0.25 : 0))) return;
      elev.corr.set(o, o.visible); o.visible = false;
    });
  }
  function orbitStep(speed) {
    const O = elev.orbit, q = camera.quaternion;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(q), upv = new T.Vector3(0, 1, 0).applyQuaternion(q);
    if (keys.KeyD) O.centre.addScaledVector(right, speed); if (keys.KeyA) O.centre.addScaledVector(right, -speed);
    if (keys.KeyW || keys.Space) O.centre.addScaledVector(upv, speed); if (keys.KeyS || keys.KeyC) O.centre.addScaledVector(upv, -speed);
    const f = new T.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    pos.copy(O.centre).addScaledVector(f, -O.dist);
  }
  function elevation(given) {
    if (elev) {
      for (const [o, m] of (elev.clipped || [])) o.material = m;
      for (const [o, v] of elev.corr) o.visible = v;
      for (const [o, v] of elev.vis) o.visible = v;
      for (const u of (elev.roots || [])) if (u.userData.elevSectionWas !== undefined) { u.userData.sectionOpen = u.userData.elevSectionWas; delete u.userData.elevSectionWas; refreshStreams(u); }
      setFov(elev.fov); pos.copy(elev.pos); yaw = elev.yaw; pitch = elev.pitch;
      if (elev.ground && !groundOn) document.getElementById('ground').click();
      if (fly !== elev.fly) document.getElementById('fly').click();     // you used to come back out of elevation still flying
      elev = null; document.getElementById('elev').classList.remove('on');
      return 'elevation off';
    }
    // a raycaster of its own: the shared one is retuned every frame by the floor and collision probes
    const eray = new T.Raycaster(); eray.setFromCamera(new T.Vector2(0, 0), camera); eray.far = 40;
    const hits = eray.intersectObjects([...equip.children, ...pipes.children], true).filter(h => h.object.visible);
    // the placed unit, which is a child of equip. Walking up to "whatever has no parent" gave the whole equipment
    // group once, and framing that put the camera 260 m away looking at empty sky.
    let root = null;
    if (hits.length) { for (let p = hits[0].object; p; p = p.parent) { if (p.parent === equip) { root = p; break; } } if (!root) root = hits[0].object.userData.inst || null; }
    if (given && given.parent === equip) root = given;
    if (!root) root = lastUnit && equip.children.includes(lastUnit) ? lastUnit : null;
    if (!root) return 'pick the Elevation tool and click a unit or a fixture';
    // A system is cut as a system. The two tank spray plant is the AquaKlear AND the 540 behind it, and cutting only the
    // one you pointed at showed half the train (Jake 2026-09-13: "the elevation of the two part spray system should
    // include the elevation cutaway view of the Infiltrator spray tank as well"). Placements that belong together carry
    // the same elevation_group; each unit's parts are matched within that unit, since both have a water_section.
    const roots = root.userData.elevGroup ? equip.children.filter(c => c.userData.elevGroup === root.userData.elevGroup) : [root];
    const vis = new Map(), secs = [], solids = [];
    for (const unit of roots) {
    const named = {};
    unit.traverse(o => { const k = partName(o); if (k) (named[k] = named[k] || []).push(o); });
    for (const k in named) {
      if (!/_section$/.test(k)) continue;
      // The excavation ships a section too. Swapped in, it stood behind every cutaway as a brown wall of dirt.
      if (/^(soil|grass|backfill)/.test(k)) continue;
      const solid = named[k.slice(0, -8)];
      // A part the placement hides stays hidden in elevation too. Hide patterns hide every section at load, so the
      // section alone cannot say whether it belongs: its SOLID can. The AquaKlear's gray water state is hidden in the
      // house, and without this its section came back in every elevation as a second body of water.
      // Nor does a state part that is switched off: the lift station's drawn down water is a section of its own, and it
      // used to come up in elevation beside the water that was actually in the basin.
      const shown = o => { for (let p = o; p && p !== unit; p = p.parent) if (!p.visible) return false; return true; };
      if (named[k].every(o => o.userData.placeHidden) || (solid && solid.every(o => o.userData.placeHidden || !shown(o)))) continue;
      for (const o of named[k]) { vis.set(o, o.visible); o.visible = true; secs.push(o); }
      if (solid) for (const o of solid) { vis.set(o, o.visible); o.visible = false; solids.push(o); }
    }
    // a placement's section_set (the toilet: tank_shell to tank_section, the bowl, the seat, the waters) is opened the same
    // way, and its also_hide parts (the seat lid and hinges) come off: the tank stayed solid in elevation without this
    const SS = unit.userData.sectionSet;
    if (SS) {
      for (const [a, bname] of Object.entries(SS.pairs || {})) {
        if (!named[bname] || !named[a] || named[a].every(o => o.userData.placeHidden)) continue;
        // the generic pass may have shown the section already (tank_section) without knowing its solid is tank_shell,
        // not "tank": the solid still has to go, or the tank stood solid with its section inside it
        for (const o of named[bname]) { if (secs.includes(o) || o.userData.isStream) continue; vis.set(o, o.visible); o.visible = true; secs.push(o); for (let q = o.parent; q && q !== unit; q = q.parent) q.visible = true; }
        for (const o of named[a]) { if (o.userData.isStream) continue; if (!vis.has(o)) vis.set(o, o.visible); o.visible = false; if (!solids.includes(o)) solids.push(o); }
      }
      unit.userData.elevSectionWas = unit.userData.sectionOpen; unit.userData.sectionOpen = true; refreshStreams(unit);
      for (const a of (SS.also_hide || [])) for (const o of (named[a] || [])) { vis.set(o, o.visible); o.visible = false; }
    }
    }
    // Frame the UNIT (its sections and solids, whatever is showing), not the whole model: the plant's own spray field is
    // part of its GLB and spans the back yard, so framing the model put the camera 260 m out in a field looking at sky.
    // the whole unit is the sections that show plus the solids they replaced, or the "whole" box is the kept halves alone
    // and the open side cannot be told from the solid one (the toilet was framed from its solid side)
    const whole = unitBox(roots);
    for (const o of solids) whole.union(new T.Box3().setFromObject(o));
    if (whole.isEmpty()) { for (const [o, v] of vis) o.visible = v; return nodeName(hits.length ? hits[0].object : root) + ': nothing to frame'; }
    const cut = new T.Box3(); for (const o of secs) cut.expandByObject(o);
    const c = whole.getCenter(new T.Vector3()), size = whole.getSize(new T.Vector3());
    // stand on the side the section took away, which is the open face; a unit with no sections is looked at from its
    // FRONT, which is the socket's +Y in Blender and the placed root's -Z here (the toilet's bowl end, the furnace's doors)
    let dir = null;
    if (secs.length) { const away = c.clone().sub(cut.getCenter(new T.Vector3())); away.y = 0; if (away.lengthSq() > 1e-4) dir = away.normalize(); }
    if (!dir) { dir = new T.Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new T.Quaternion())); dir.y = 0; dir = dir.lengthSq() > 1e-4 ? dir.normalize() : new T.Vector3(0, 0, 1); }
    const span = Math.max(size.x, size.y, size.z);
    const FOVE = 22; let d = (span * 0.62) / Math.tan(FOVE * Math.PI / 360) + span * 0.3;
    // A system laid out in a line (the gravity tank and its field, 23 m end to end) is looked at square on, across its
    // length, from the side its sections are open to, and framed by that length in the view's WIDTH. Framed by the
    // open side's average it put the camera 60 m out on the train's own axis looking at the end of the tank.
    if (roots.length > 1) {
      const alongX = size.x >= size.z, axis = alongX ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
      const away = c.clone().sub(cut.isEmpty() ? c : cut.getCenter(new T.Vector3())); away.y = 0;
      dir = axis.multiplyScalar(away.dot(axis) < 0 ? -1 : 1);
      const vf = FOVE * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const across = alongX ? size.x : size.z, deep = alongX ? size.z : size.x;
      d = Math.max((across * 0.56) / Math.tan(hf / 2), (size.y * 0.8) / Math.tan(vf / 2)) + deep * 0.5;
    }
    elev = { vis: vis, corr: new Map(), fov: camera.fov, pos: pos.clone(), yaw: yaw, pitch: pitch, ground: groundOn, fly: fly, roots: roots, size: size, span: span, orbit: { centre: c.clone(), dist: d }, clipped: [] };
    // The unit's own shell comes off on the open side too (round 20, the kitchen sink: its sections sat inside a closed cabinet).
    // Every big part that is not a section and encloses things (a cabinet, its doors, a counter, a closet wall, a housing) is
    // clipped at the plane the sections are cut on, on the camera's side. Restored with everything else on the way out.
    if (secs.length) {
      let far = -Infinity; const corner = new T.Vector3();
      for (const o of secs) { const bb = new T.Box3().setFromObject(o); for (let i = 0; i < 8; i++) { corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z); far = Math.max(far, dir.dot(corner)); } }
      const plane = new T.Plane(dir.clone().negate(), far - 0.002);
      for (const u of roots) u.traverse(o => {
        if (!o.isMesh || !o.visible || secs.includes(o)) return; const pn = partName(o) || '';
        if (!/cabinet|^door_|counter|closet|wall|platform|housing|shell$|jacket|case$|box$|dishwasher|backsplash/.test(pn)) return;
        const old = o.material, ms = (Array.isArray(old) ? old : [old]).map(m => { const cm = m.clone(); cm.clippingPlanes = [plane]; cm.side = T.DoubleSide; cm.needsUpdate = true; return cm; });
        o.material = Array.isArray(old) ? ms : ms[0]; elev.clipped.push([o, old]);
      });
    }
    // a buried unit needs the lawn off; a fixture in a room does not
    if (groundOn && whole.min.y < -0.3) document.getElementById('ground').click();
    pos.copy(c).addScaledVector(dir, d);
    const f = c.clone().sub(pos).normalize();
    yaw = Math.atan2(-f.x, -f.z); pitch = 0;
    elevCorridor();
    setFov(FOVE); if (!fly) document.getElementById('fly').click();
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('elev').classList.add('on');
    const names = roots.map(u => { let pk = null; u.traverse(o => { if (!pk && o.userData.pack) pk = o.userData.pack; }); return pk || u.name || 'unit'; }).join(' + ');
    return 'elevation: ' + names + (secs.length ? ', ' + secs.length + ' parts sectioned' : '') + '. Drag to turn round it, wheel in and out, click a part to work it, Elevation or Esc to come back';
  }
  document.getElementById('elev').onclick = () => { if (elev) { const m = elevation(); labelEl.textContent = m; labelEl.style.display = 'block'; } else setTool('elevation'); };
  let roofOn = true;
  document.getElementById('roof').onclick = e => { roofOn = !roofOn; e.target.classList.toggle('on', roofOn); house.traverse(o => { if (o.isMesh && (o.name.startsWith('roof_') || o.name.startsWith('ceil_'))) o.visible = roofOn; }); };
  // layout picker: one select per config key, rebuilt equipment on change
  (() => {
    const host = document.getElementById('layout'); if (!host) return;
    for (const [k, vals] of Object.entries(CONFIG_CHOICES)) {
      const sel = document.createElement('select'); sel.title = k;
      for (const v of vals) { const o = document.createElement('option'); o.value = v; o.textContent = v.replace(/_/g, ' '); sel.appendChild(o); }
      sel.value = CONFIG[k];
      sel.onchange = async () => { CONFIG[k] = sel.value; await reconfigure(); };
      host.appendChild(sel);
    }
  })();
  // Round 45 (Jake: "I need to be able to toggle real quick and make sure all that looks actually good"): the add ons tab. Each one
  // is a config key the placement list reads, so turning it on puts the unit in and turning it off takes it out, with no reload.
  const ADDON_NAME = { reverse_osmosis: 'reverse osmosis system', soft_start: 'soft start', surge_condenser: 'surge protector', surge_panel: 'whole house surge protector', softener: 'water softener', filter: 'spray pump filter', expansion_tank: 'thermal expansion tank' };
  const UNIT_ADDONS = [[/condenser/, ['soft_start', 'surge_condenser']], [/electric_panel/, ['surge_panel']], [/kitchen_sink/, ['reverse_osmosis']], [/spray_pump_filter|septic_lee|aquaklear/, ['filter']], [/water_softener/, ['softener']]];
  const ADDONS = [
    ['reverse_osmosis', 'Reverse osmosis under the kitchen sink'],
    ['soft_start', 'Soft start on the condenser'],
    ['surge_condenser', 'Surge protector at the condenser'],
    ['surge_panel', 'Whole house surge at the panel'],
    ['softener', 'Water softener in the garage'],
    ['filter', 'Filter on the spray pump'],
  ];
  (() => {
    const host = document.getElementById('addons'); if (!host) return;
    const draw = () => {
      host.innerHTML = '';
      for (const [k, lab] of ADDONS) {
        const row = document.createElement('div'); row.className = 'addon';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = lab; row.appendChild(nm);
        const b = document.createElement('button'); const on = CONFIG[k] === 'yes';
        b.textContent = on ? 'remove' : 'add'; b.classList.toggle('on', on);
        b.onclick = async () => {
          CONFIG[k] = on ? 'no' : 'yes'; b.textContent = 'working'; await reconfigure(); draw();
          labelEl.textContent = lab + ': ' + (CONFIG[k] === 'yes' ? 'in' : 'out'); labelEl.style.display = 'block';
        };
        row.appendChild(b); host.appendChild(row);
      }
    };
    draw();
  })();
  // Round 60, "What can I do here" (Jake: "it's not very conducive to someone being like, what's capable with this app?"). One tap
  // and every unit within 9 m in front of you wears its name for six seconds. A tap on a name is a click on that unit: it takes
  // you in front of it, or if you are already there it opens its verbs. Nothing is lit the rest of the time.
  let canMarks = [], canUntil = 0;
  function unitNameOf(u) {
    const pk = u.userData.pack || u.userData.model || ''; const P = (INFO.packs && INFO.packs[pk]) || {};
    let n = P.name || pretty(u.userData.model || u.name);
    // file names are not what a tech calls the thing
    n = n.replace(/^hvac /, '').replace(/\bstd80\b/, '(80%)').replace(/\bcond96\b/, '(96%)').replace(/^thermostat .*/, 'thermostat').replace(/ r\d+$/, '').replace(/\bac$/, 'AC');
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  // Only what you could SEE: a straight line from your eye to the unit that no WALL crosses. Walls only (the col_ shells, which
  // have the doorways cut out of them): furniture and a unit's own cabinet block are colliders too, and a line to a unit's
  // middle always hits its own block. The first cut listed the fridge, the range and the furnace through a wall.
  function wallBetween(a, b) {
    const d = new T.Vector3().subVectors(b, a), len = d.length(); if (len < 0.05) return false;
    ray.set(a, d.divideScalar(len)); ray.far = Math.max(0, len - 0.25);
    return ray.intersectObjects(colliders.filter(c => c.name.startsWith('col_')), false).length > 0;
  }
  function firstMesh(u) { let m = null; u.traverse(x => { if (!m && x.isMesh && shownInTree(x) && !x.userData.isStream && !isGround(x)) m = x; }); return m; }
  function whatCanIDo() {
    for (const k of canMarks) k.el.remove(); canMarks = [];
    const fwdv = new T.Vector3(); camera.getWorldDirection(fwdv);
    for (const u of equip.children) {
      if (!u.visible) continue; const b = workBox(u); if (b.isEmpty()) continue;
      const c = b.getCenter(new T.Vector3()), to = c.clone().sub(camera.position), d = to.length();
      if (d > 9 || to.normalize().dot(fwdv) < 0.2) continue;
      if (wallBetween(camera.position, new T.Vector3(c.x, Math.min(b.max.y - 0.05, Math.max(c.y, camera.position.y - 0.4)), c.z))) continue;
      const el = document.createElement('div'); el.className = 'canmark'; el.textContent = unitNameOf(u);
      el.onclick = ev => { ev.stopPropagation(); const m = firstMesh(u); if (!m) return;
        if (!nearUnit(u) && !fly && !ball && !held) { const msg = goToUnit(u); lastUnit = u; if (msg) { labelEl.textContent = unitNameOf(u) + ': ' + msg; labelEl.style.display = 'block'; } }
        else { openPanel(m, { point: c, object: m }); }
        canUntil = 0; };
      document.body.appendChild(el); canMarks.push({ el, at: new T.Vector3(c.x, b.max.y + 0.05, c.z) });
    }
    canUntil = performance.now() + 6000;
    return null;
  }
  const _cv = new T.Vector3();
  function stepCanMarks() {
    if (!canMarks.length) return;
    if (performance.now() > canUntil) { for (const k of canMarks) k.el.remove(); canMarks = []; return; }
    for (const k of canMarks) { _cv.copy(k.at).project(camera); const off = _cv.z > 1 || Math.abs(_cv.x) > 1.05 || Math.abs(_cv.y) > 1.05;
      k.el.style.display = off ? 'none' : 'block'; if (!off) { k.el.style.left = ((_cv.x + 1) / 2 * innerWidth) + 'px'; k.el.style.top = ((1 - _cv.y) / 2 * innerHeight) + 'px'; } }
  }
  // Jake, after trying it: "what I don't like is three things you can work here, tap a name. I think it's pretty intuitive to just
  // tap... what can I do here also needs to come off. It needs to be intuitive." The button and its message are gone. The name
  // tags themselves are kept as walk.whatCanIDo() for a test or a lesson to call; nothing on the page calls it.
  // Round 60: the Toolbox. Jake: "we have the toolbox, so you can remove anything that's in the training house that's in the
  // toolbox". It is its own little menu over its own button, bottom right, and holds the three tools and nothing else. Picking
  // one closes it; so does a tap anywhere else.
  { const tb = document.getElementById('toolbox'), menu = document.getElementById('toolboxmenu');
    if (tb && menu) {
      // The pictures: each tool's own model, rendered once into a small picture the first time the drawer opens. One throwaway
      // renderer does all of them and is released straight after, so a phone is not left holding a second 3D context.
      let drawn = false;
      const drawTools = async () => {
        if (drawn) return; drawn = true;
        let r = null;
        try {
          r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(252, 192, false); r.outputEncoding = renderer.outputEncoding;
          for (const b of menu.querySelectorAll('button[data-model]')) {
            let g; try { g = await loadModel(b.dataset.model); } catch (e) { continue; }
            const o = g.scene.clone(true); tuneMaterials(o);
            // the body of the tool, not its two metres of test lead: frame on what is not a lead, a probe or a tip
            const box = new T.Box3(); o.updateMatrixWorld(true);
            o.traverse(x => { if (x.isMesh && !/lead|probe|tip_|wire|cord/i.test(x.name || '')) box.expandByObject(x); });
            if (box.isEmpty()) box.setFromObject(o);
            const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3()), rad = Math.max(sz.x, sz.y, sz.z) * 0.5;
            const sc = new T.Scene(); sc.add(o); sc.add(new T.AmbientLight(0xffffff, 0.75)); const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(1, 2, 3); sc.add(dl);
            // seen from the FACE side (these models face -z: the hand pose turns them half round to read them), close enough to fill the tile
            const cam = new T.PerspectiveCamera(30, 252 / 192, 0.01, 50); const dist = Math.max(sz.y, sz.x * 0.8, sz.z * 0.5) * 0.5 / Math.tan(15 * Math.PI / 180) * 1.12;
            cam.position.set(c.x - dist * 0.30, c.y + dist * 0.22, c.z - dist * 0.93); cam.lookAt(c);
            r.render(sc, cam); const img = b.querySelector('img'); if (img) img.src = r.domElement.toDataURL('image/png');
          }
        } catch (e) { console.warn('toolbox pictures', e); }
        if (r) { r.dispose(); if (r.forceContextLoss) r.forceContextLoss(); }
      };
      tb.onclick = ev => { ev.stopPropagation(); menu.classList.toggle('open'); if (menu.classList.contains('open')) drawTools(); };
      for (const b of menu.querySelectorAll('button')) b.addEventListener('click', () => menu.classList.remove('open'));
      renderer.domElement.addEventListener('mousedown', () => menu.classList.remove('open'));
    } }
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => {
    for (const o of document.querySelectorAll('[data-tab]')) o.classList.toggle('on', o === b);
    for (const p of document.querySelectorAll('[data-page]')) p.classList.toggle('on', p.dataset.page === b.dataset.tab);
  };
  // Round 49 (Jake: "I click the multimeter, it should stay lit up over on the side for tools, and then be able to click it again and make
  // it go away"): the button holds the on state while the meter is in your hand and the same click puts it down.
  function meterButtons() {
    const mb_ = document.getElementById('meterbtn'), cb_ = document.getElementById('clampbtn');
    if (mb_) mb_.classList.toggle('on', !!meter && meter.kind === 'volts');
    if (cb_) cb_.classList.toggle('on', !!meter && meter.kind === 'amps');
  }
  function toolToggle(kind) {
    if (meter && meter.kind === kind) { meterDown(); return kind === 'volts' ? 'multimeter down' : 'clamp meter down'; }
    return takeMeter(kind);
  }
  const mb = document.getElementById('meterbtn'); if (mb) mb.onclick = () => { labelEl.textContent = toolToggle('volts'); labelEl.style.display = 'block'; };
  const cb = document.getElementById('clampbtn'); if (cb) cb.onclick = () => { labelEl.textContent = toolToggle('amps'); labelEl.style.display = 'block'; };
  const gb = document.getElementById('grabbtn'); if (gb) gb.onclick = () => { takePliers().then(m => { labelEl.textContent = m; labelEl.style.display = 'block'; }); };
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => goTo(b.dataset.go);
  for (const c of document.querySelectorAll('[data-layer]')) c.onchange = () => { const k = c.dataset.layer; if (k === 'equipment') equip.visible = c.checked; else if (layers[k]) layers[k].visible = c.checked; };
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (meterObj) meterPose(meterObj); });
  // ---------------------------------------------------------------- go
  (async () => {
    // Round 60 (Jake, on his phone: a minute and a half on "Building the house"): you are let in as soon as there is a house to
    // stand in. The shell (site, first floor, attic, crawl) comes first and the frame loop starts; window.__walkCanEnter tells
    // the app's loading screen it may open the door. The furniture, the framing, the pipes (which are inside the walls and
    // under the floor) and the placed models arrive behind you, in the same order as before, and 'ready:' still means all of it.
    // The layout tags are applied as soon as the site is in, or every layout's lawn and street patch would show at once.
    try {
      await loadHouse(HOUSE_FIRST); poseGarageDoor(); applyPipeConfig(); goTo('spawn_door'); step();
      window.__walkCanEnter = true; status.textContent = 'the house is up: furniture, pipes and equipment are still arriving';
      await loadHouse(HOUSE_REST); collectFixtures(); updateLights();
      await loadPipes(); applyPipeConfig(); await loadPlacements(); chooseDoorSides(); status.textContent = 'ready: ' + Object.keys(sockets).length + ' sockets, ' + equip.children.length + ' models placed'; loadEl.style.display = 'none'; }
    catch (e) { status.textContent = 'error: ' + e.message; console.error(e); }
    bootFinished();
  })();
  function ballRoll(steps, back) { if (!ball) return null; const kw = keys.KeyW, ks = keys.KeyS; keys.KeyW = !back; keys.KeyS = !!back; const seen = []; for (let i = 0; i < steps; i++) { ballStep(0.05); if (!seen.length || seen[seen.length - 1] !== ball.R.name) seen.push(ball.R.name); if (ball.done) break; } keys.KeyW = kw; keys.KeyS = ks; return { runs: seen, done: ball.done, at: camera.position.toArray().map(v => +v.toFixed(2)) }; }     // round 43: a test and demo helper
  // round 44: a snap the page can take itself. requestAnimationFrame does not fire while the preview pane is hidden, so a capture that
  // waits for a frame hangs; this renders once on demand and hands back the PNG.
  // round 51: a snap has to draw the overlay pass too, or the meter in your hand (and a part you are viewing) is missing from
  // every picture we take of the page, which is exactly the thing we are trying to look at
  function snap() {
    renderer.render(scene, camera);
    if ((held && held.view) || meterObj || pliers) {
      const bg = scene.background; scene.background = null;
      renderer.autoClear = false; renderer.clearDepth(); camera.layers.set(1); renderer.render(scene, camera); camera.layers.set(0); renderer.autoClear = true; scene.background = bg;
    }
    return renderer.domElement.toDataURL("image/png");
  }
  window.walk = { plantSims, waters, stepFlow, syncFixtureFlows, syncPlant, running, startBall, endBall, ballRoll, ball: () => ball, loadAll, selfTestAll, snap, explodeUnit, unexplode, blown: () => blown, takeMeter, meter: () => meter, meterDial, meterSetFn, meterPull, takePliers, pliersDown, grabClick, grabState, grabFault, grabMarkShow, grabMarks: () => grabMarks, pliers: () => pliers, inHand: () => inHand, pending: () => PEND.length, takeApart, putBack, held: () => held, breakers, setBreaker, ladderClimb, selfTest, openPanel, lookAction, playNamed, systemRun, unitRunClip, scene, camera, pos, fixtures, pool, updateLights, flows, toggleFlow, elevation, pick, partName, sockets, waypoints, equip, pipes, house, goTo, doors, toggleDoor, stepDoors, playClipFor, toggleCutaway, pipeCutaway, hasSection, plugOff, cutPipes, plugs, setView: (y, p) => { yaw = y; pitch = p || 0; }, setFly: f => { fly = f; document.getElementById('fly').classList.toggle('on', f); },
    // verification: put a lead on a named part, the same call a click on it makes
    meterTest: (nm, hitAt) => { const o = scene.getObjectByName(nm); if (!o) return 'no part called ' + nm;
      const at = hitAt ? new T.Vector3(hitAt[0], hitAt[1], hitAt[2]) : new T.Box3().setFromObject(o).getCenter(new T.Vector3());
      return meterClick(o, { point: at, object: o }); },
    // verification: stand at a Blender point and look at another, then work the same switches a visitor does
    look: (cx, cy, cz, tx, ty, tz) => { fly = true; document.getElementById('fly').classList.add('on'); pos.set(cx, cz, -cy);
      const d = new T.Vector3(tx - cx, tz - cz, -(ty - cy)).normalize(); yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); },
    setFov, pumpSwitch, spraySwitch, runClips, lidOff, nodeName, reveal, elevCorridor, inElevation: () => !!elev, orbit: () => elev && elev.orbit, setTool, tool: () => tool, removePart, workPart, unitOf,
    // round 60 verification: the working view's own pieces, and where you are standing and looking
    whatCanIDo, setEye, eyeWanted, eyeRange: [0.30, EYE], setTurn: v => { turnRate = Math.max(-4, Math.min(4, +v || 0)); }, setLookScale: v => { lookScale = Math.max(0.25, Math.min(4, +v || 1)); },
    goToUnit, nearUnit, gliding: () => !!glide, where: () => ({ pos: pos.toArray().map(v => +v.toFixed(3)), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), eye: +eye.toFixed(3), fly }), setFly: v => { fly = !!v; document.getElementById('fly').classList.toggle('on', fly); }, equip };
})();
