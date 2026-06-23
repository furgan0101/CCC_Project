// Stylised RECARO R7 business-class seat built from primitives, with
// live-animated recline, headrest, leg-rest, lumbar and massage zones.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PALETTE } from "./config.js";

export function createSeat(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(3.4, 2.3, 4.6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 3;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.target.set(0, 1.0, 0);
  controls.autoRotate = false;   // never auto-spin (drag to rotate only)

  // ---- Lighting (soft studio) ----
  scene.add(new THREE.HemisphereLight(0xbfcae0, 0x20242c, 0.85));
  const key = new THREE.DirectionalLight(0xfff2dd, 2.0);
  key.position.set(4, 7, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f86b8, 1.1);
  rim.position.set(-5, 4, -4); scene.add(rim);
  const fill = new THREE.PointLight(0xd8c4a0, 18, 14, 2);
  fill.position.set(-2, 2.4, 3); scene.add(fill);

  // ---- Materials ----
  const M = (color, rough, metal = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const mat = {
    fabric:  M(PALETTE.fabric, 0.92),
    fabricLo:M(PALETTE.fabricLo, 0.95),
    leather: M(PALETTE.leather, 0.6),
    shell:   M(PALETTE.shell, 0.45, 0.25),
    shellLo: M(PALETTE.shellLo, 0.5, 0.2),
    wood:    M(PALETTE.wood, 0.35, 0.05),
    trim:    M(PALETTE.trim, 0.4, 0.6),
    floor:   M(0x0c0e13, 1.0),
    // One cohesive upholstery tone for the real CAD model — a single material
    // means no jarring colour "blocks" where the mesh is segmented.
    body:    M(0xbcbfc2, 0.5, 0.06),
  };
  // DoubleSide so the cut cross-sections render solid (no see-through "torn"
  // hollow interior) when the segmented parts articulate.
  mat.body.side = THREE.DoubleSide;
  mat.leather.side = THREE.DoubleSide;

  // Soft, feathered glow sprite (radial gradient) — used for the massage
  // zones on the CAD model so they read as a warm bloom, not a hard block.
  const GLOW_TEX = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, "rgba(255,226,170,1)");
    rg.addColorStop(0.45, "rgba(243,182,104,0.55)");
    rg.addColorStop(1, "rgba(243,182,104,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  function makeGlow(w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: GLOW_TEX, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    m.renderOrder = 3; return m;
  }
  const massageMat = () => new THREE.MeshStandardMaterial({
    color: PALETTE.fabric, roughness: 0.85,
    emissive: new THREE.Color(PALETTE.massage), emissiveIntensity: 0,
  });

  function box(w, h, d, m, r = 0.06) {
    const g = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m);
    g.castShadow = true; g.receiveShadow = true; return g;
  }

  // ---- Floor + soft shadow catcher ----
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), mat.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
  scene.add(floor);

  const root = new THREE.Group();
  scene.add(root);

  // ============ STATIC SHELL & SUITE ============
  // Back wall / privacy shell
  const backWall = box(2.3, 2.4, 0.18, mat.shellLo, 0.1);
  backWall.position.set(0, 1.2, -0.95); root.add(backWall);
  // Right privacy wing (the tall diamond-textured panel in renders)
  const wing = box(0.16, 2.3, 1.9, mat.shell, 0.08);
  wing.position.set(1.15, 1.15, -0.1); root.add(wing);
  // Left console base
  const console = box(0.9, 1.2, 1.5, mat.shellLo, 0.1);
  console.position.set(-1.15, 0.6, 0.1); root.add(console);
  // Wood table top
  const table = box(1.0, 0.07, 1.4, mat.wood, 0.04);
  table.position.set(-1.12, 1.22, 0.1); root.add(table);
  // Open storage compartment in the side console (pressure-sensor demo). An
  // open-top bin with thin walls + dark interior so the item sits *inside* it.
  const compartment = new THREE.Group();
  compartment.position.set(-0.98, 1.24, 0.42); root.add(compartment);
  const binW = 0.44, binD = 0.44, binH = 0.24, wt = 0.035;
  const binFloor = box(binW, 0.04, binD, mat.trim, 0.02); binFloor.position.y = 0; compartment.add(binFloor);
  [[0, (binD - wt) / 2], [0, -(binD - wt) / 2]].forEach(([x, z]) => {
    const w = box(binW, binH, wt, mat.shellLo, 0.02); w.position.set(x, binH / 2, z); compartment.add(w);
  });
  [[(binW - wt) / 2, 0], [-(binW - wt) / 2, 0]].forEach(([x, z]) => {
    const w = box(wt, binH, binD, mat.shellLo, 0.02); w.position.set(x, binH / 2, z); compartment.add(w);
  });
  // Stowed passenger item resting inside the compartment.
  const stowMat = new THREE.MeshStandardMaterial({
    color: 0x8a6b4a, roughness: 0.5,
    emissive: new THREE.Color(PALETTE.massage), emissiveIntensity: 0,
  });
  const stowItem = box(0.3, 0.42, 0.07, stowMat, 0.03);
  stowItem.position.set(-0.98, 1.34, 0.42); stowItem.rotation.set(0.18, 0.35, 0.05); root.add(stowItem);
  // Overhead console hint
  const overhead = box(1.6, 0.3, 0.6, mat.shell, 0.08);
  overhead.position.set(0.1, 2.35, -0.5); root.add(overhead);

  // Reading light: a small bulb under the overhead console + warm spot
  const readBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff3dd, emissive: new THREE.Color(0xffe7c4), emissiveIntensity: 0,
  });
  const readBulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), readBulbMat);
  readBulb.position.set(0.55, 2.18, -0.3); root.add(readBulb);
  const readSpot = new THREE.SpotLight(0xffe7c4, 0, 7, Math.PI / 5, 0.6, 1.3);
  readSpot.position.copy(readBulb.position);
  readSpot.target.position.set(0.1, 0.9, 0.4);
  root.add(readSpot); root.add(readSpot.target);

  // ============ SEAT ASSEMBLY ============
  const seat = new THREE.Group();
  seat.position.set(0.1, 0, 0.15); root.add(seat);

  // Fixed pedestal
  const pedestal = box(1.1, 0.4, 1.1, mat.shellLo, 0.08);
  pedestal.position.set(0, 0.2, 0); seat.add(pedestal);

  // Seat pan (pivots at rear for bed-flatten)
  const panPivot = new THREE.Group();
  panPivot.position.set(0, 0.42, -0.45);
  seat.add(panPivot);
  const seatPan = box(1.1, 0.22, 1.15, mat.fabric, 0.1);
  seatPan.position.set(0, 0.02, 0.55); panPivot.add(seatPan);
  const seatPanTop = box(1.0, 0.08, 1.0, mat.fabricLo, 0.08);
  seatPanTop.position.set(0, 0.15, 0.55); panPivot.add(seatPanTop);

  // Armrests
  const procArms = [];
  [-0.62, 0.62].forEach((x) => {
    const arm = box(0.16, 0.26, 0.95, mat.leather, 0.07);
    arm.position.set(x, 0.66, 0.05); seat.add(arm); procArms.push(arm);
  });

  // Backrest (pivots at lower hinge)
  const backPivot = new THREE.Group();
  backPivot.position.set(0, 0.55, -0.5);
  seat.add(backPivot);

  const backrest = box(1.08, 1.5, 0.24, mat.fabric, 0.12);
  backrest.position.set(0, 0.75, 0); backPivot.add(backrest);
  // side bolsters
  const procBolsters = [];
  [-0.5, 0.5].forEach((x) => {
    const b = box(0.16, 1.4, 0.34, mat.fabricLo, 0.1);
    b.position.set(x, 0.78, 0.04); backPivot.add(b); procBolsters.push(b);
  });

  // Lumbar panel (depth changes with lumbar support)
  const lumbar = box(0.8, 0.4, 0.12, mat.fabricLo, 0.08);
  lumbar.position.set(0, 0.32, 0.14); backPivot.add(lumbar);

  // Massage zones on the back
  const massageBack = box(0.78, 0.55, 0.06, massageMat(), 0.06);
  massageBack.position.set(0, 1.0, 0.135); backPivot.add(massageBack);
  const massageLumbar = box(0.78, 0.3, 0.06, massageMat(), 0.06);
  massageLumbar.position.set(0, 0.33, 0.205); backPivot.add(massageLumbar);

  // Headrest (height + tilt) — child of backrest top
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.5, 0.02);
  backPivot.add(headPivot);
  const headrest = box(0.7, 0.42, 0.22, mat.leather, 0.12);
  headrest.position.set(0, 0.1, 0); headPivot.add(headrest);
  const procHeadWings = [];
  [-0.32, 0.32].forEach((x) => {
    const wingH = box(0.12, 0.42, 0.3, mat.leather, 0.1);
    wingH.position.set(x, 0.1, 0.03); headPivot.add(wingH); procHeadWings.push(wingH);
  });

  // Leg-rest / ottoman (extends forward + up)
  const legPivot = new THREE.Group();
  legPivot.position.set(0, 0.5, 0.62);
  seat.add(legPivot);
  const legrest = box(1.0, 0.18, 0.9, mat.fabric, 0.1);
  legrest.position.set(0, 0, 0.45); legPivot.add(legrest);
  const massageLegs = box(0.8, 0.06, 0.7, massageMat(), 0.05);
  massageLegs.position.set(0, 0.12, 0.45); legPivot.add(massageLegs);
  // ottoman / footrest at far end (the separate cushion in renders)
  const ottoman = box(0.9, 0.5, 0.4, mat.fabricLo, 0.1);
  ottoman.position.set(0, -0.05, 1.6); seat.add(ottoman);

  // ============ REAL CAD MODEL (Silk Sky Suite — rigged GLB) ============
  // The suite was separated in Blender into named rigid parts (Mesh_0 = static
  // pod, backrest, lowerrest = seat pan, legrest, armrest, compartment). We hinge
  // the moving parts on pivots and slide them, so the seat moves like a real
  // business-class seat: on recline the backrest tilts back AND eases forward, the
  // seat pan slides forward to close the gap, and the leg-rest lifts + extends —
  // through to a flat bed. The procedural seat is the instant fallback until load.
  const procParts = [pedestal, seatPan, seatPanTop, backrest, headrest, legrest, ottoman,
    ...procArms, ...procBolsters, ...procHeadWings];
  let modelMode = false;
  const modelInfo = { loaded: false };
  const rig = { scene: null, parts: {}, pivots: {}, meshes: [], assembly: null };

  const modelGroup = new THREE.Group(); modelGroup.visible = false; seat.add(modelGroup);

  // Camera-facing glow sprite for the massage zones.
  function makeGlowSprite(size) {
    const m = new THREE.SpriteMaterial({ map: GLOW_TEX, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(m); s.scale.set(size, size, 1); s.userData.base = size;
    return s;
  }

  // Part kinematics keyframed across upright(0) → relax(0.5) → sleep(1).
  // angles in degrees, fwd in seat units (+fwd slides toward the occupant, +Z).
  // Tunable live via R7.seat.setKin({back:{rot:[..]}}).
  let KIN = {
    // The backrest sits ~4cm from the back wall, so the whole seat must slide well
    // forward as it reclines to keep the backrest off the wall (it extends into the
    // footwell ahead — like a real lie-flat suite).
    seat: { fwd: [0, 0.22, 0.85] },                    // whole seat slides forward (+Z)
    // recline about the fixed lower joint, with a forward lap, and a vertical lift at
    // full recline so the reclined backrest surface sits level with the pan (flat bed).
    back: { rot: [0, -22, -68], fwd: [0, 0.05, 0.20], drop: [0, -0.02, 0.03] },
    // footrest lifts about its fixed TOP joint (stays connected to the pan), rotating
    // to flat (-90°) AND shifting up so its top surface is level with the bed; pulled
    // back slightly so it overlaps the pan front (no seam gap). Driven by the leg-rest
    // control only, so recline never moves it.
    leg:  { rot: [0, -30, -90], fwd: [0, 0, -0.04], up: [0, 0.05, 0.12] },
    headSlide: 0.16,   // headrest up/down travel along the backrest (headrest control)
    legBack: 100,      // deg of backward leg-rest tilt per unit (legrest = -0.2 → 20° back)
    slideAmt: 0.38,    // manual pan+leg forward glide distance (Advanced toggle)
  };
  function kf(a, t) {
    if (t <= 0) return a[0]; if (t >= 1) return a[2];
    return t < 0.5 ? lerp(a[0], a[1], t / 0.5) : lerp(a[1], a[2], (t - 0.5) / 0.5);
  }

  // Extra PBR maps (the GLB embeds only base colour) for richer fabric detail.
  const texLoader = new THREE.TextureLoader();
  const SRC = "assets/silk_sky/Meshy_AI_Silk_Sky_Suite_0621170228_texture";
  const nrmMap = texLoader.load(SRC + "_normal.png");
  const roughMap = texLoader.load(SRC + "_roughness.png");
  nrmMap.flipY = roughMap.flipY = false;            // glTF convention

  const gltfLoader = new GLTFLoader();
  gltfLoader.load("assets/silk_sky/seat_parts.glb", (gltf) => {
    const sc = gltf.scene;
    sc.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        rig.meshes.push(o);
        if (o.material) {
          o.material.normalMap = nrmMap;
          o.material.roughnessMap = roughMap;
          o.material.roughness = 1.0; o.material.metalness = 0.04;
          o.material.side = THREE.DoubleSide;   // cut faces render solid, not see-through black
          o.material.needsUpdate = true;
        }
      }
    });
    // Scale to the seat height (~1.8), then ground it and centre it in X.
    sc.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(sc);
    const size = box.getSize(new THREE.Vector3());
    sc.scale.setScalar(1.8 / size.y);
    sc.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(sc);
    sc.position.y -= box.min.y;
    sc.position.x -= (box.min.x + box.max.x) / 2;
    sc.updateMatrixWorld(true);
    modelGroup.add(sc); rig.scene = sc;

    // Map parts by name (gltf nests the mesh under a node carrying the name).
    sc.traverse((o) => { if (o.name) rig.parts[o.name.toLowerCase()] = o; });

    // The whole movable seat (pan + backrest + legrest) lives in one group that
    // slides forward (+Z) on recline, so the reclining backrest never clips the
    // wall behind it. Within it, the backrest and legrest each rotate about ONE
    // fixed joint where they meet the seat pan.
    const assembly = new THREE.Group();
    modelGroup.add(assembly);
    assembly.userData.restZ = assembly.position.z;
    rig.assembly = assembly;

    modelGroup.updateMatrixWorld(true);
    const hingeAt = (n, hinge) => {
      const o = rig.parts[n]; if (!o || !hinge) return;
      const p = new THREE.Group();
      assembly.add(p);
      p.position.copy(assembly.worldToLocal(hinge.clone()));
      p.userData.rest = p.position.clone();
      p.attach(o);                       // keep the part's world pose, now hinged here
      rig.pivots[n] = p;
    };
    // World-space centroid of the slab of a part's vertices passing `pred` (tested
    // in the part's LOCAL bbox frame). Used to hinge each part about the exact seam
    // where it was cut from the pan, so rotating it opens no gap.
    const _v = new THREE.Vector3();
    const seam = (n, pred) => {
      const node = rig.parts[n]; if (!node) return null;
      let mesh = null; node.traverse((c) => { if (c.isMesh && !mesh) mesh = c; });
      if (!mesh) return null;
      const pos = mesh.geometry.attributes.position;
      mesh.geometry.computeBoundingBox(); const bb = mesh.geometry.boundingBox;
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i);
        if (pred(_v, bb)) { mesh.localToWorld(_v); sx += _v.x; sy += _v.y; sz += _v.z; c++; }
      }
      return c ? new THREE.Vector3(sx / c, sy / c, sz / c) : null;
    };
    // backrest pivots at the seat "bight" — the pan's rear-top edge where the
    // backrest meets the cushion — so the visible crease stays closed as it reclines.
    hingeAt("backrest", seam("lowerrest", (v, bb) =>
      v.z < bb.min.z + (bb.max.z - bb.min.z) * 0.14 && v.y > bb.max.y - (bb.max.y - bb.min.y) * 0.40));
    // legrest pivots on its TOP seam — the edge that tucks under the pan front — so
    // that upper edge stays connected to the lowerrest through the whole fold.
    hingeAt("legrest", seam("legrest", (v, bb) => v.y > bb.max.y - (bb.max.y - bb.min.y) * 0.18));
    // seat pan rides with the assembly (no rotation, just the forward slide)
    if (rig.parts.lowerrest) {
      assembly.attach(rig.parts.lowerrest);
      rig.parts.lowerrest.userData.restZ = rig.parts.lowerrest.position.z;
    }
    // Headrest is parented to the backrest pivot, so it inherits the recline angle
    // ("same angle as the backrest, moves with it"); the headrest control then
    // slides it up/down along the backrest's local axis like a real headrest.
    if (rig.pivots.backrest && rig.parts.headrest) {
      rig.pivots.backrest.attach(rig.parts.headrest);
      rig.parts.headrest.userData.rest = rig.parts.headrest.position.clone();
    }
    // backrest2 / backrest3 are alternate lumbar-support shapes for the Back-support
    // control (None = backrest, Medium = backrest2, Max = backrest3). Hang them on the
    // same pivot so they recline identically; only the active one is shown (poseParts).
    ["backrest2", "backrest3"].forEach((n) => {
      const o = rig.parts[n];
      if (o && rig.pivots.backrest) { rig.pivots.backrest.attach(o); o.visible = false; }
    });

    // Sit the stow-demo item inside the CAD model's storage compartment.
    const comp = rig.parts.compartment;
    if (comp) {
      const cb = new THREE.Box3().setFromObject(comp);
      const c = cb.getCenter(new THREE.Vector3());
      stowItem.position.set(c.x, cb.max.y + 0.04, c.z);
      stowItem.rotation.set(0.1, 0.5, 0.04);
      const w = Math.min(0.9, (cb.max.x - cb.min.x) * 0.7);
      stowItem.scale.setScalar(THREE.MathUtils.clamp(w / 0.3, 0.6, 1.4));
    }

    // Massage glows in seat space at the back / lumbar / leg zones.
    glow.back = makeGlowSprite(0.5); glow.lumbar = makeGlowSprite(0.42); glow.legs = makeGlowSprite(0.5);
    glow.back.position.set(0, 1.3, 0.18);
    glow.lumbar.position.set(0, 0.98, 0.2);
    glow.legs.position.set(0, 0.5, 0.62);
    [glow.back, glow.lumbar, glow.legs].forEach((g) => modelGroup.add(g));

    procParts.forEach((p) => { p.visible = false; });
    [massageBack, massageLumbar, massageLegs, lumbar, backWall, wing, console, table,
     overhead, readBulb, compartment].forEach((p) => { if (p) p.visible = false; });
    modelGroup.visible = true; modelMode = true; modelInfo.loaded = true;
    applyPose();
  }, undefined, (e) => console.warn("parts GLB load failed:", e));

  // Drive the rigid parts from the current state.
  function poseParts() {
    const d2r = THREE.MathUtils.degToRad, r = cur.recline, L = cur.legrest;
    const A = rig.assembly, pb = rig.pivots.backrest, pg = rig.pivots.legrest;
    const slide = (cur.slideFwd || 0) * KIN.slideAmt;   // manual pan+leg forward glide (Advanced)
    if (A) A.position.z = A.userData.restZ + kf(KIN.seat.fwd, r);   // whole seat slides forward
    if (pb) {                                                       // recline about fixed joint + small lap to hide the join
      pb.rotation.x = d2r(kf(KIN.back.rot, r));
      pb.position.z = pb.userData.rest.z + kf(KIN.back.fwd, r);
      pb.position.y = pb.userData.rest.y + kf(KIN.back.drop, r);
    }
    // Back-support variant: show backrest (None) / backrest2 (Medium) / backrest3 (Max).
    const bv = cur.lumbar < 0.25 ? "backrest" : (cur.lumbar < 0.75 ? "backrest2" : "backrest3");
    for (const n of ["backrest", "backrest2", "backrest3"]) {
      const o = rig.parts[n]; if (o) o.visible = (n === bv);
    }
    // Headrest follows the backrest angle (parented to pb) and slides up/down with
    // the headrest control — 0.5 is its rest height.
    const ph = rig.parts.headrest;
    if (ph && ph.userData.rest) ph.position.y = ph.userData.rest.y + (cur.headrest - 0.5) * KIN.headSlide;
    if (pg) {                          // leg-rest: lift toward flat (L>0), or tuck ~20° back (L<0)
      pg.rotation.x = d2r(L >= 0 ? kf(KIN.leg.rot, L) : (-L * KIN.legBack));
      pg.position.z = pg.userData.rest.z + (L >= 0 ? kf(KIN.leg.fwd, L) : 0) + slide;
      pg.position.y = pg.userData.rest.y + (L >= 0 ? kf(KIN.leg.up, L) : 0);
    }
    // Seat pan glides forward with the leg-rest on the manual slide; backrest stays put.
    const lr = rig.parts.lowerrest;
    if (lr && lr.userData.restZ !== undefined) lr.position.z = lr.userData.restZ + slide;
  }

  // Climate tint reaches the CAD model materials.
  function tintModel(hex, intensity) {
    for (const m of rig.meshes) {
      if (m.material) { m.material.emissive.setHex(hex); m.material.emissiveIntensity = intensity; }
    }
  }

  // ============ STATE & ANIMATION ============
  const target = { recline: 0, headrest: 0.5, legrest: 0, lumbar: 0.3, slideFwd: 0 };
  const cur = { ...target };
  const BOUNDS = { legrest: [-0.2, 1] };   // leg-rest may tuck 20° back (−0.2); others default 0–1
  const massage = { back: 0, lumbar: 0, legs: 0 }; // target intensities
  const massageCur = { back: 0, lumbar: 0, legs: 0 };
  let massageGain = 1;                              // global strength (Advanced intensity slider)
  const stow = { present: false, alert: false };   // pressure-sensor demo state
  const glow = { back: null, lumbar: null, legs: null }; // CAD-model massage glows
  let onUpdate = null;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clock = new THREE.Clock();

  function applyPose() {
    if (modelMode && modelInfo.loaded) {
      poseParts();          // rigid parts: recline backrest + slide pan + lift legrest
      return;
    }
    // Recline: backrest from -8° to -78°
    const reclineRad = THREE.MathUtils.degToRad(lerp(-8, -78, cur.recline));
    backPivot.rotation.x = reclineRad;
    // Seat pan tilts toward flat as recline increases
    panPivot.rotation.x = THREE.MathUtils.degToRad(lerp(0, 14, cur.recline));
    // Headrest height (slide up) + slight forward tilt
    headPivot.position.y = lerp(1.34, 1.62, cur.headrest);
    headPivot.rotation.x = THREE.MathUtils.degToRad(lerp(2, -6, cur.headrest));
    // Leg-rest raise + extend
    legPivot.rotation.x = THREE.MathUtils.degToRad(lerp(72, -6, cur.legrest));
    legrest.scale.z = lerp(0.8, 1.25, cur.legrest);
    ottoman.position.z = lerp(1.35, 1.95, cur.legrest);
    ottoman.position.y = lerp(-0.05, 0.18, cur.legrest);
    // Lumbar push
    lumbar.position.z = lerp(0.1, 0.26, cur.lumbar);
    lumbar.scale.z = lerp(1, 1.8, cur.lumbar);
  }

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const k = 1 - Math.pow(0.0001, dt); // smooth easing
    let moved = false;
    for (const key of Object.keys(target)) {
      if (Math.abs(cur[key] - target[key]) > 0.0005) {
        cur[key] = lerp(cur[key], target[key], k);
        moved = true;
      } else cur[key] = target[key];
    }
    applyPose();

    // Massage pulsing
    const t = clock.elapsedTime;
    const zones = [["back", massageBack, glow.back, 1.0], ["lumbar", massageLumbar, glow.lumbar, 1.3], ["legs", massageLegs, glow.legs, 1.6]];
    for (const [name, box, gl, speed] of zones) {
      massageCur[name] = lerp(massageCur[name], massage[name], 0.1);
      const pulse = (Math.sin(t * 6 * speed) * 0.5 + 0.5);
      // Procedural seat: pulse the emissive insert.
      box.material.emissiveIntensity = massageCur[name] * (0.25 + pulse * 0.85);
      const s = 1 + massageCur[name] * pulse * 0.06;
      box.scale.set(s, s, 1 + massageCur[name] * pulse * 0.5);
      // CAD model: breathe the soft glow sprite in and out.
      if (gl) {
        gl.material.opacity = massageCur[name] * (0.35 + pulse * 0.5);
        const base = gl.userData.base || 0.5;
        const gs = base * (1 + pulse * 0.14 * massageCur[name]);
        gl.scale.set(gs, gs, 1);
      }
    }

    // Stowage item: visible when the sensor reads weight; pulses when alerting
    stowItem.visible = stow.present;
    stowMat.emissiveIntensity = stow.alert ? 0.45 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.6 : 0;

    controls.update();
    renderer.render(scene, camera);
    if (moved && onUpdate) onUpdate(getState());
    requestAnimationFrame(tick);
  }

  function getState() {
    return { ...target, massage: { ...massage } };
  }

  // ---- Public API ----
  const api = {
    setTarget(key, value) {
      if (!(key in target)) return;
      const [lo, hi] = BOUNDS[key] || [0, 1];
      target[key] = THREE.MathUtils.clamp(value, lo, hi);
      controls.autoRotate = false;
      onUpdate && onUpdate(getState());
    },
    nudge(key, delta) { this.setTarget(key, (target[key] ?? 0) + delta); },
    // Advanced: glide the seat pan + leg-rest forward (backrest stays put).
    setSlideForward(on) { this.setTarget("slideFwd", on ? 1 : 0); },
    isSlideForward() { return target.slideFwd > 0.5; },
    setMassage(zone, on) {
      const v = on ? massageGain : 0;
      if (zone === "all") { massage.back = massage.lumbar = massage.legs = v; }
      else if (zone in massage) massage[zone] = v;
      onUpdate && onUpdate(getState());
    },
    // Global massage strength 0.1–1 (Advanced "massage intensity" slider). Scales
    // any zones that are currently running and is remembered for future ones.
    setMassageIntensity(level) {
      massageGain = THREE.MathUtils.clamp(level, 0.1, 1);
      for (const z of Object.keys(massage)) if (massage[z] > 0) massage[z] = massageGain;
      onUpdate && onUpdate(getState());
    },
    getMassageIntensity() { return massageGain; },
    isMassageOn(zone) { return zone === "all" ? (massage.back||massage.lumbar||massage.legs) : massage[zone] > 0; },
    setCompartment(present, alert = false) { stow.present = present; stow.alert = alert && present; },
    setReadingLight(on) { readSpot.intensity = on ? 28 : 0; readBulbMat.emissiveIntensity = on ? 2.2 : 0; },
    // Apply targets instantly and render one frame (useful when rAF is
    // throttled, e.g. for capturing stills of a given pose).
    snapPose() {
      Object.assign(cur, target);
      stowItem.visible = stow.present;
      applyPose(); renderer.render(scene, camera);
    },
    // Model load state + which named parts/pivots are wired up.
    getModelInfo() {
      return { ...modelInfo, modelMode, parts: Object.keys(rig.parts),
        pivots: Object.keys(rig.pivots), triangles: renderer.info.render.triangles };
    },
    // World-space position of a named rig part (debug/verification, e.g. headrest).
    debugPart(name) {
      const o = rig.parts[name]; if (!o) return null;
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), visible: o.visible };
    },
    // World-space bbox of the loaded CAD model.
    getPartBounds() {
      if (!rig.scene) return {};
      const b = new THREE.Box3().setFromObject(rig.scene);
      return { y: [+b.min.y.toFixed(2), +b.max.y.toFixed(2)], z: [+b.min.z.toFixed(2), +b.max.z.toFixed(2)] };
    },
    // Tune part kinematics live, e.g. R7.seat.setKin({back:{rot:[0,-26,-82]}}).
    setKin(patch) {
      for (const k of Object.keys(patch)) {
        KIN[k] = (typeof patch[k] === "object" && typeof KIN[k] === "object")
          ? { ...KIN[k], ...patch[k] } : patch[k];
      }
      applyPose();
    },
    getKin() { return JSON.parse(JSON.stringify(KIN)); },
    // Capture the current WebGL frame to the dev server (assets/_caps/<name>.png).
    async capture(name) {
      renderer.render(scene, camera);
      try { await fetch("/save/" + name + ".png", { method: "POST", body: canvas.toDataURL("image/png") }); } catch (e) {}
      return name;
    },
    setClimate(mode) {
      // Subtle fabric tint: cool blue / warm amber glow on the cushions.
      const presets = { cool: [0x3a5a9a, 0.16], warm: [0xa55a28, 0.16], off: [0x000000, 0] };
      const [hex, intensity] = presets[mode] || presets.off;
      for (const m of [mat.fabric, mat.fabricLo]) { m.emissive.setHex(hex); m.emissiveIntensity = intensity; }
      if (modelInfo.loaded) tintModel(hex, intensity);
    },
    applyPreset(name) {
      controls.autoRotate = false;
      const p = PRESETS[name];
      if (!p) return;
      for (const k of Object.keys(target)) if (k in p) target[k] = p[k];
      onUpdate && onUpdate(getState());
    },
    onUpdate(fn) { onUpdate = fn; },
    getState,
    camera, controls,
    resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
  };

  api.resize();
  new ResizeObserver(() => api.resize()).observe(canvas);
  applyPose();
  tick();
  return api;
}

export const PRESETS = {
  upright: { recline: 0.0,  headrest: 0.5, legrest: 0.0, lumbar: 0.35 },
  relax:   { recline: 0.45, headrest: 0.55, legrest: 0.55, lumbar: 0.5 },
  bed:     { recline: 1.0,  headrest: 0.2, legrest: 1.0,  lumbar: 0.2 },
};
