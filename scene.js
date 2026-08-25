/* =====================================================================
   WebGL machine scene
   ---------------------------------------------------------------------
   The unit in images/img7.jpg, modelled procedurally and rendered behind
   the page: a lathed bellmouth intake with a rolled chrome bead, a bar
   guard on its own ring, a vaned impeller on an ogive hub, a strut
   spider behind it, a finned casing barrel between bolted flange
   collars, a finned rear section and end cover, terminal box, lifting
   hoop, mounting lugs, a discharge volute and a fabricated steel skid.

   Scroll runs it through one overhaul. index.html pins the hero for a
   screenful of scrolling, so the machine assembles under the reader's own
   scroll before the page moves at all; the middle of the page walks the
   camera around and through the finished unit; the last stretch strips it
   back down in reverse.

   All of this is an enhancement. No WebGL, no ES module support, reduced
   motion, or a throw anywhere in here, and the page keeps exactly the SVG
   wheel it already had, with the pin collapsing to nothing. Nothing else
   on the page waits on this file.
   ===================================================================== */

/* three.js is vendored rather than pulled from a CDN: this site is served to
   plants in the Philippines and Qatar where a blocked or slow CDN would mean
   no scene at all, and pinning the file locally also keeps it from moving
   under us. r169, MIT - see vendor/three.LICENSE */
import * as THREE from './vendor/three.module.min.js';

const say = (label) => window.dispatchEvent(new CustomEvent('rotor:stage', { detail: label }));

const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* value of a [position, value] keyframe list at x, linearly interpolated */
const atCurve = (keys, x) => {
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1];
      const [x1, v1] = keys[i];
      const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return v0 + (v1 - v0) * f;
    }
  }
  return keys[keys.length - 1][1];
};

const easeOut = (t) => 1 - (1 - t) ** 3;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/* deterministic scatter: the exploded view has to look the same on every load
   and on every frame, so nothing here may call Math.random at draw time */
const hash = (k) => {
  const x = Math.sin(k * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
};

/* NACA 4-digit thickness distribution: a rounded leading edge running to a
   fine trailing edge, which is most of what makes a vane read as a vane */
const halfThickness = (t, thick) =>
  5 * thick * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t
               + 0.2843 * t ** 3 - 0.1015 * t ** 4);

/* One impeller vane, lofted root to tip. Each spanwise station is a closed
   aerofoil ring; consecutive rings are stitched into a solid and both ends
   capped. The chord tapers, the section thins, and the stagger angle unwinds
   towards the tip - the twist you see on a real blade. Local axes: +Y is
   radially out, +Z is along the shaft, +X is tangential. */
function vaneGeometry(o) {
  const ring = o.chordPts * 2 - 2;          // upper LE->TE, then lower TE->LE
  const pos = [];
  const idx = [];

  for (let j = 0; j < o.stations; j++) {
    const s = j / (o.stations - 1);
    const r = o.hubR + (o.tipR - o.hubR) * s;
    const chord = o.chordRoot * (1 - o.taper * s);
    const thick = 0.20 - 0.12 * s;
    const a = THREE.MathUtils.degToRad(o.stagRoot + (o.stagTip - o.stagRoot) * s);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bow = o.sweep * s * s;            // the tip trails the root

    for (let i = 0; i < ring; i++) {
      const upper = i < o.chordPts;
      const t = upper ? i / (o.chordPts - 1) : (ring - i) / (o.chordPts - 1);
      const y = (upper ? 1 : -1) * halfThickness(t, thick)
              + o.camber * 4 * t * (1 - t);
      const cx = (t - 0.32) * chord;        // along the chord
      const cy = y * chord;                 // across it
      pos.push(cx * ca - cy * sa, r, cx * sa + cy * ca + bow);
    }
  }

  for (let j = 0; j < o.stations - 1; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * ring + i;
      const b = j * ring + (i + 1) % ring;
      const c = (j + 1) * ring + i;
      const d = (j + 1) * ring + (i + 1) % ring;
      idx.push(a, c, b, b, c, d);
    }
  }

  for (const j of [0, o.stations - 1]) {    // cap each end off its centroid
    const base = j * ring;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < ring; i++) {
      sx += pos[(base + i) * 3];
      sy += pos[(base + i) * 3 + 1];
      sz += pos[(base + i) * 3 + 2];
    }
    const centre = pos.length / 3;
    pos.push(sx / ring, sy / ring, sz / ring);
    for (let i = 0; i < ring; i++) idx.push(centre, base + i, base + (i + 1) % ring);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* PointsMaterial draws bare squares by default, and one drifting close to the
   camera becomes a grey block across the page. Give it a soft round sprite. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(255,255,255,.5)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/* Fine directional streaks, used as a roughness map. Perfectly even roughness
   is most of what makes procedural metal read as plastic; breaking it up
   costs one small canvas and does the work of a real material map. */
function brushedTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = Math.round(96 + hash(i * 1.7) * 76);
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.45)';
    g.fillRect(hash(i) * 256, hash(i * 3.1) * 256, 6 + hash(i * 5.3) * 54, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 3);
  return t;
}

/* a hand-drawn equirectangular strip is environment enough for metal to have
   something to reflect, with no HDR to download. The photograph is lit by a
   hard window throwing slats across a dark room, so the strip is mostly dark
   with one bright band and a few hard bars in it. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0e1826');
  grad.addColorStop(0.46, '#333f4e');
  grad.addColorStop(0.52, '#69788b');
  grad.addColorStop(1, '#04060a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  g.fillStyle = 'rgba(232,242,255,.5)';
  for (let i = 0; i < 5; i++) g.fillRect(300 + i * 34, 24 + i * 9, 15, 150);

  const blob = (x, y, r, colour) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, colour);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(112, 100, 112, 'rgba(255,45,70,.9)');     // brand red
  blob(366, 124, 96, 'rgba(242,169,59,.62)');    // amber
  blob(248, 34, 132, 'rgba(196,220,255,.8)');    // cool key

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function boot() {
  const canvas = document.getElementById('bgWebgl');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const narrow = window.matchMedia('(max-width: 760px)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !narrow, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.3 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06080b, 0.0095);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);

  say('Building unit');

  /* ---- proportions, taken off the photograph ---------------------------- */
  const R = 4.0;                    // casing barrel radius
  const RR = 3.35;                  // rear section radius
  const MOUTH = 5.25;               // bellmouth outer radius
  const SEG = narrow ? 48 : 96;     // segments round a full turn
  const VANES = narrow ? 9 : 12;
  const BARS = narrow ? 8 : 11;
  const FINS = narrow ? 9 : 15;
  const REAR_FINS = narrow ? 6 : 10;
  const STRUTS = 6;

  scene.environment = new THREE.PMREMGenerator(renderer)
    .fromEquirectangular(skyTexture()).texture;

  /* ---- materials, read off the photograph ------------------------------- */
  const brushed = brushedTexture();
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xdbe1ea, metalness: 1, roughness: 0.07,
    side: THREE.DoubleSide, envMapIntensity: 1.7,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2, metalness: 0.95, roughness: 0.24,
    side: THREE.DoubleSide, envMapIntensity: 1.25,
  });
  const shell = new THREE.MeshStandardMaterial({
    color: 0x23282f, metalness: 0.88, roughness: 0.5,
    roughnessMap: brushed, envMapIntensity: 0.9,
  });
  const machined = new THREE.MeshStandardMaterial({
    color: 0x8d959f, metalness: 0.93, roughness: 0.3,
    roughnessMap: brushed, envMapIntensity: 1.15,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x6d757f, metalness: 0.72, roughness: 0.42, envMapIntensity: 1,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x14181d, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.6,
  });

  const machine = new THREE.Group();
  scene.add(machine);

  const spinner = new THREE.Group();      // only the impeller turns
  machine.add(spinner);

  const zTo = (geo) => geo.rotateX(Math.PI / 2);   // Y-axis primitive -> Z axis

  /* ---- assembly ---------------------------------------------------------
     Every piece records where it ends up, the offset it flies in from, a
     tumble that unwinds as it lands, and its slot in the sequence. A frame of
     assembly is one compose() pass over that flat list, so nothing is rebuilt
     per frame. Running the sequence backwards strips the unit down in the
     right order for free: the last part on is the first part off. */
  const SPAN = 0.24;                      // how long one part takes to land
  const parts = [];
  const instanced = new Set();

  const at = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const size = new THREE.Vector3();
  const off = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);
  let tumbleAmt = 0;
  let driftAmt = 1;

  /* index < 0 means a plain Mesh rather than one instance of an InstancedMesh;
     `from` is the scale it starts at, so a ring can shrink onto a barrel
     instead of flying at it */
  const part = (mesh, index, cue, from) => {
    if (index >= 0) instanced.add(mesh);
    const k = parts.length;
    parts.push({
      mesh, index, cue, from: from === undefined ? 0.86 : from,
      at: at.clone(), rot: rot.clone(), size: size.clone(),
      off: off.clone(), axis: axis.clone(), tumble: tumbleAmt,
      /* While a part is off the machine it drifts: its standoff orbits the
         shaft axis, breathes in and out, rises and falls, and the part keeps
         turning on its own axis. Every term is scaled by how loose the part
         still is, so the motion unwinds to nothing as it seats and a finished
         machine is perfectly rigid. driftAmt keeps the skid and the casing
         near-still while small parts swarm - a base frame doing laps of the
         machine it is supposed to carry looks like a mistake. */
      orbit: (0.15 + hash(k) * 0.07) * driftAmt,
      sway: 0.35 + hash(k + 31) * 0.55,
      reach: (0.05 + hash(k + 17) * 0.09) * driftAmt,
      lift: (0.3 + hash(k + 53) * 0.9) * driftAmt,
      selfSpin: (0.12 + hash(k + 71) * 0.30) * driftAmt
                * (hash(k + 13) < 0.5 ? -1 : 1),
      phase: hash(k + 97) * Math.PI * 2,
    });
  };

  const place = (x, y, z, sx, sy, sz) => {
    at.set(x, y, z);
    size.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  };
  const flyFrom = (x, y, z, spin, ax, ay, az) => {
    off.set(x, y, z);
    tumbleAmt = spin || 0;
    axis.set(ax === undefined ? 0 : ax, ay === undefined ? 0 : ay,
             az === undefined ? 1 : az).normalize();
  };

  /* Every hex head on the machine, in one instanced draw. The allocation is
     deliberately generous and .count is trimmed to what was actually placed
     once the model is built - an InstancedMesh renders its whole allocation,
     so a spare instance is a bolt sitting at the origin. */
  const bolts = new THREE.InstancedMesh(
    zTo(new THREE.CylinderGeometry(0.115, 0.115, 0.13, 6)), machined, 128,
  );
  machine.add(bolts);
  let boltN = 0;

  const boltRing = (count, radius, z, cue, oz) => {
    driftAmt = 1.25;      // loose bolts swarm
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      rot.identity();
      place(Math.cos(a) * radius, Math.sin(a) * radius, z, 1);
      flyFrom(0, 0, oz, 0.8, 0.4, 0.5, 0.3);
      part(bolts, boltN++, cue);
    }
  };

  /* ---- the base: fabricated channel skid, which lands first ------------- */
  {
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, 12);
    machine.add(box);
    let n = 0;
    driftAmt = 0.18;      // the skid barely stirs
    rot.identity();
    flyFrom(0, -15, 0, 0);

    for (const x of [-3.5, 3.5]) {          // rails running the length
      place(x, -6.15, 0, 0.95, 0.5, 11.4);
      part(box, n++, 0.00);
    }
    for (const z of [2.4, -2.9]) {          // a pedestal at each end
      for (const x of [-3.5, 3.5]) {
        place(x, -5.28, z, 0.8, 1.25, 1.15);
        part(box, n++, 0.02);
      }
      place(0, -4.35, z, 7.8, 0.6, 1.15);   // saddle plate the barrel sits in
      part(box, n++, 0.04);
      for (const x of [-3.5, 3.5]) {
        place(x, -6.56, z, 1.7, 0.32, 1.9); // bolt-down foot pads
        part(box, n++, 0.00);
      }
    }

    // four hold-down bolts per foot pad, heads up
    for (const z of [2.4, -2.9]) {
      for (const x of [-3.5, 3.5]) {
        for (const d of [[-0.5, -0.55], [0.5, -0.55], [-0.5, 0.55], [0.5, 0.55]]) {
          rot.setFromAxisAngle(xAxis, Math.PI / 2);
          place(x + d[0], -6.34, z + d[1], 1);
          flyFrom(0, -15, 0, 0.6, 1, 0, 0);
          part(bolts, boltN++, 0.03);
        }
      }
    }
  }

  /* ---- the casing: barrel, flange collars, rear section, end cover ------ */
  {
    driftAmt = 0.35;      // heavy castings drift slowly
    const barrel = new THREE.Mesh(zTo(new THREE.CylinderGeometry(R, R, 4.2, SEG)), shell);
    machine.add(barrel);
    rot.identity();
    place(0, 0, 0.4, 1);
    flyFrom(0, 13, 0, 0.5, 1, 0, 0);
    part(barrel, -1, 0.08);

    const rear = new THREE.Mesh(zTo(new THREE.CylinderGeometry(RR, RR, 3.0, SEG)), shell);
    machine.add(rear);
    place(0, 0, -3.2, 1);
    flyFrom(0, 0, -16, 0.4, 1, 0, 0);
    part(rear, -1, 0.20);

    // a machined step where the barrel necks down to the rear section
    const step = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(RR + 0.05, R, 0.55, SEG)), machined,
    );
    machine.add(step);
    place(0, 0, -1.85, 1);
    flyFrom(0, 0, -13, 0.5, 1, 0, 0);
    part(step, -1, 0.18);

    const cap = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(RR * 0.99, RR * 0.7, 0.95, SEG)), shell,
    );
    machine.add(cap);
    place(0, 0, -5.15, 1);
    flyFrom(0, 0, -19, 0.9, 0.4, 0.2, 1);
    part(cap, -1, 0.30);

    const boss = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 32)), machined,
    );
    machine.add(boss);
    place(0, 0, -5.75, 1);
    flyFrom(0, 0, -21, 1.6, 0, 1, 0);
    part(boss, -1, 0.32);

    /* raised collars at each joint, each with its own ring of hex heads -
       the detail that stops a plain cylinder reading as a plain cylinder */
    const collar = (z, radius, cue, oz) => {
      const c = new THREE.Mesh(
        zTo(new THREE.CylinderGeometry(radius + 0.22, radius + 0.22, 0.36, SEG)), machined,
      );
      machine.add(c);
      rot.identity();
      place(0, 0, z, 1);
      flyFrom(0, 0, oz, 0.5, 1, 0.2, 0);
      part(c, -1, cue);
    };
    collar(2.42, R, 0.12, 11);
    collar(-1.72, R, 0.16, -12);
    collar(-4.62, RR, 0.28, -17);
    boltRing(24, R + 0.3, 2.42, 0.13, 11);
    boltRing(24, R + 0.3, -1.72, 0.17, -12);
    boltRing(18, RR + 0.3, -4.62, 0.29, -17);
  }

  /* ---- cooling fins: rings that shrink onto the barrels ------------------ */
  {
    const ring = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.013, 6, SEG), shell, FINS + REAR_FINS,
    );
    machine.add(ring);
    let n = 0;
    driftAmt = 1;
    rot.identity();
    flyFrom(0, 0, 0, 0);

    for (let i = 0; i < FINS; i++) {
      place(0, 0, 2.1 - (i / (FINS - 1)) * 3.6, R + 0.12);
      part(ring, n++, 0.14 + i * 0.004, 1.7);
    }
    for (let i = 0; i < REAR_FINS; i++) {
      place(0, 0, -2.15 - (i / (REAR_FINS - 1)) * 2.3, RR + 0.11);
      part(ring, n++, 0.24 + i * 0.004, 1.7);
    }
  }

  /* ---- the discharge volute tucked under the barrel ---------------------- */
  {
    driftAmt = 0.45;
    const volute = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.9, 16, 44, Math.PI * 0.85), shell,
    );
    machine.add(volute);
    rot.setFromAxisAngle(yAxis, Math.PI / 2);
    place(0, -2.7, -0.2, 1);
    flyFrom(0, -11, 0, 0.7, 1, 0, 0);
    part(volute, -1, 0.10);
  }

  /* ---- terminal box on the flank ---------------------------------------- */
  {
    driftAmt = 0.7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 2.4), shell);
    machine.add(body);
    rot.identity();
    place(R - 0.1, 1.1, -0.5, 1);
    flyFrom(9, 3, 0, 1.0, 0.2, 1, 0.2);
    part(body, -1, 0.36);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.25, 2.0), machined);
    machine.add(lid);
    place(R + 0.85, 1.1, -0.5, 1);
    flyFrom(11, 3, 0, 1.2, 0.2, 1, 0.2);
    part(lid, -1, 0.38);

    for (const d of [[-0.5, -0.8], [0.5, -0.8], [-0.5, 0.8], [0.5, 0.8]]) {
      rot.setFromAxisAngle(yAxis, Math.PI / 2);
      place(R + 1.0, 1.1 + d[0], -0.5 + d[1], 1);
      flyFrom(12, 3, 0, 0.9, 0.2, 1, 0.2);
      part(bolts, boltN++, 0.39);
    }
  }

  /* ---- mounting lugs and the lifting hoop -------------------------------- */
  {
    driftAmt = 0.85;
    const lug = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, 4);
    machine.add(lug);
    const seats = [
      [0, R + 0.2, 1.6, 0],
      [0, R + 0.2, -1.4, 0],
      [R + 0.2, 0.4, 0.6, Math.PI / 2],
      [-R - 0.2, 0.4, 0.6, -Math.PI / 2],
    ];
    let n = 0;
    for (const seat of seats) {
      rot.setFromAxisAngle(zAxis, seat[3]);
      place(seat[0], seat[1], seat[2], 1.55, 0.34, 1.55);
      off.set(seat[0], seat[1], seat[2]).normalize().multiplyScalar(7);
      tumbleAmt = 1.1;
      axis.set(0.3, 1, 0.2).normalize();
      part(lug, n++, 0.34);
    }

    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.12, 10, 48, Math.PI), frameMat,
    );
    machine.add(hoop);
    rot.setFromAxisAngle(yAxis, Math.PI / 2);
    place(0, R + 0.15, 0.2, 1);
    flyFrom(0, 8, 0, 1.4, 1, 0.3, 0);
    part(hoop, -1, 0.40);
  }

  /* ---- the strut spider carrying the bearing housing --------------------- */
  {
    driftAmt = 0.9;
    const strut = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), machined, STRUTS,
    );
    machine.add(strut);
    for (let i = 0; i < STRUTS; i++) {
      const a = (i / STRUTS) * Math.PI * 2 + 0.26;
      const mid = (1.1 + R * 0.95) / 2;
      rot.setFromAxisAngle(zAxis, a + Math.PI / 2);
      place(Math.cos(a) * mid, Math.sin(a) * mid, 1.5, 0.34, R * 0.95 - 1.1, 0.9);
      flyFrom(Math.cos(a) * 8, Math.sin(a) * 8, 0, 0.8, 0, 0, 1);
      part(strut, i, 0.42 + (i / STRUTS) * 0.03);
    }

    const housing = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(1.15, 1.15, 1.5, 40)), machined,
    );
    machine.add(housing);
    rot.identity();
    place(0, 0, 1.5, 1);
    flyFrom(0, 0, -9, 1.3, 0.4, 1, 0);
    part(housing, -1, 0.44);
  }

  /* ---- the impeller: vanes on an ogive hub, and the shaft nut ------------ */
  {
    driftAmt = 1;
    const vanes = new THREE.InstancedMesh(
      vaneGeometry({
        stations: narrow ? 11 : 17,
        chordPts: narrow ? 13 : 19,
        hubR: 0.85,
        tipR: 3.3,
        chordRoot: 2.9,
        taper: 0.30,
        stagRoot: 58,
        stagTip: 34,
        camber: 0.14,
        sweep: 0.5,
      }),
      steel, VANES,
    );
    spinner.add(vanes);

    for (let b = 0; b < VANES; b++) {
      const phi = (b / VANES) * Math.PI * 2;
      rot.setFromAxisAngle(zAxis, phi);
      place(0, 0, 2.4, 1);
      /* a vane's root is +Y in its own frame, so once it is turned to its
         azimuth it flies in along exactly the line it will sit on */
      const spread = 3.6 + hash(b) * 2.0;
      off.set(-Math.sin(phi) * spread, Math.cos(phi) * spread, (hash(b + 7) - 0.5) * 4);
      tumbleAmt = 0.6;
      axis.set(hash(b + 3) - 0.5, hash(b + 11) - 0.5, hash(b + 19) - 0.5).normalize();
      part(vanes, b, 0.46 + (b / VANES) * 0.06);
    }

    const ogive = new THREE.Mesh(
      zTo(new THREE.SphereGeometry(0.98, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62)),
      chrome,
    );
    ogive.geometry.scale(1, 1, 1.5);
    spinner.add(ogive);
    rot.identity();
    place(0, 0, 2.5, 1);
    flyFrom(3.2, 2.2, 5.0, 1.2, 1, 0.2, 0);
    part(ogive, -1, 0.56);

    const collar = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24)), machined,
    );
    spinner.add(collar);
    place(0, 0, 3.32, 1);
    flyFrom(3.4, 2.6, 4.6, 1.8, 0, 0, 1);
    part(collar, -1, 0.58);

    const nut = new THREE.Mesh(zTo(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 6)), chrome);
    spinner.add(nut);
    place(0, 0, 3.55, 1);
    flyFrom(3.6, 3.0, 4.4, 2.4, 0, 0, 1);
    part(nut, -1, 0.60);
  }

  /* ---- the guard: straight bars in their own ring frame ------------------ */
  {
    driftAmt = 0.95;
    const reach = R * 0.94;
    const guardRing = new THREE.Mesh(
      new THREE.TorusGeometry(reach, 0.07, 10, SEG), darkMat,
    );
    machine.add(guardRing);
    rot.identity();
    place(0, 0, 3.95, 1);
    flyFrom(3.4, 2.2, 4.4, 0.5, 1, 0, 0);
    part(guardRing, -1, 0.61);

    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), darkMat, BARS);
    machine.add(bars);
    for (let i = 0; i < BARS; i++) {
      const x = ((i + 0.5) / BARS - 0.5) * 2 * reach;
      const half = Math.sqrt(Math.max(reach * reach - x * x, 0.01));
      place(x, 0, 3.95, 0.14, half * 2, 0.12);
      flyFrom(3.0 + x * 0.35, 2.0, 4.2, 0.5, 0, 1, 0);
      part(bars, i, 0.62 + i * 0.004);
    }
  }

  /* ---- the bellmouth: the chrome the whole photograph hangs on -----------
     A lathed trumpet rather than a cone: the flare is what carries the light
     right across the front of the machine in the photograph. */
  {
    driftAmt = 0.4;       // the chrome is the big calm mass out front
    const profile = [];
    const STEPS = 22;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      profile.push(new THREE.Vector2(R + (MOUTH - R) * t * t, t * 2.2));
    }
    const flare = new THREE.Mesh(zTo(new THREE.LatheGeometry(profile, SEG)), chrome);
    machine.add(flare);
    rot.identity();
    place(0, 0, 2.5, 1);
    flyFrom(4.2, -2.2, 4.0, 0.5, 1, 0, 0);
    part(flare, -1, 0.70);

    const bead = new THREE.Mesh(new THREE.TorusGeometry(MOUTH, 0.44, 22, SEG), chrome);
    machine.add(bead);
    place(0, 0, 4.7, 1);
    flyFrom(4.8, 2.6, 5.2, 0.7, 1, 0.2, 0);
    part(bead, -1, 0.76);
  }

  bolts.count = boltN;      // only draw the heads that were actually placed

  /* ---- dust in the flow path -------------------------------------------- */
  const dust = (() => {
    const n = narrow ? 800 : 1900;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 17;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = Math.sin(a) * r * 0.7;
      p[i * 3 + 2] = 22 - Math.random() * 52;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, map: dotTexture(), color: 0xbcd0ea,
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    scene.add(points);
    return points;
  })();

  const aPos = new THREE.Vector3();
  const aQuat = new THREE.Quaternion();
  const aTumble = new THREE.Quaternion();
  const aScale = new THREE.Vector3();
  const aMat = new THREE.Matrix4();

  const assemble = (a, clock) => {
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i];
      const e = easeOut(clamp01((a - t.cue) / SPAN));
      const loose = 1 - e;

      if (loose > 0.0015) {
        /* swing the standoff round the shaft axis, breathe it in and out and
           bob it along the shaft: the part circles the machine it came off
           rather than hanging in the air waiting to be scrolled back on */
        const ang = clock * t.orbit;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const pulse = 1 + Math.sin(clock * t.sway + t.phase) * t.reach;
        const ox = (t.off.x * c - t.off.y * sn) * pulse;
        const oy = (t.off.x * sn + t.off.y * c) * pulse;
        const oz = t.off.z * pulse + Math.sin(clock * t.sway * 0.7 + t.phase) * t.lift;
        aPos.set(t.at.x + (ox + driftBias) * loose, t.at.y + oy * loose,
                 t.at.z + oz * loose);
        aTumble.setFromAxisAngle(t.axis, (t.tumble + clock * t.selfSpin) * loose);
      } else {
        aPos.copy(t.at);
        aTumble.setFromAxisAngle(t.axis, t.tumble * loose);
      }

      aQuat.copy(t.rot).multiply(aTumble);
      aScale.copy(t.size).multiplyScalar(t.from + (1 - t.from) * e);

      if (t.index < 0) {
        t.mesh.position.copy(aPos);
        t.mesh.quaternion.copy(aQuat);
        t.mesh.scale.copy(aScale);
      } else {
        aMat.compose(aPos, aQuat, aScale);
        t.mesh.setMatrixAt(t.index, aMat);
      }
    }
    instanced.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  };

  say('Casting lights');

  const ambient = new THREE.AmbientLight(0x1b2432, 1.9);
  const key = new THREE.DirectionalLight(0xeaf1fc, 4.2);
  const fill = new THREE.DirectionalLight(0xc7d6ec, 1.5);   // light into the intake
  const rim = new THREE.DirectionalLight(0x5f8ce0, 1.1);
  const core = new THREE.PointLight(0xff2d46, 55, 26, 2);   // brand, as a rim only
  const deep = new THREE.PointLight(0xf2a93b, 42, 30, 2);
  key.position.set(9, 12, 13);
  fill.position.set(3, 2, 22);
  rim.position.set(-12, -4, -9);
  core.position.set(3.5, 2, -2);
  deep.position.set(-3, -2.5, -7);
  scene.add(ambient, key, fill, rim, core, deep);

  /* ---- where the camera goes -------------------------------------------
     An inspection walk: the three-quarter view the photograph is shot from,
     down low across the intake, in through the bellmouth, round to the side
     and the back, then out wide and high for the strip-down. */
  const path = (pts) => new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5,
  );

  const eyeCurve = path([
    [13.5, 5.5, 21.0],
    [6.5, -2.0, 18.0],
    [1.8, 0.6, 10.5],
    [14.0, 1.0, 3.0],
    [17.0, 5.0, -12.0],
    [2.0, 9.5, -24.0],
    [-7.0, 12.0, 25.0],
  ]);
  const aimCurve = path([
    [0.0, -0.5, 1.0],
    [0.0, 0.0, 1.5],
    [0.0, 0.0, -3.0],
    [0.0, -0.8, -0.5],
    [0.0, -0.5, -1.0],
    [0.0, -0.5, -1.0],
    [0.0, -1.0, 0.0],
  ]);

  /* how much of the page the scene is allowed to own: the build and the
     strip-down are its moments, the reading sections are not */
  const PRESENCE = [[0, 1], [0.15, 1], [0.26, 0.48], [0.66, 0.48], [0.80, 0.9], [1, 0.9]];

  /* The head-on view of the intake is the striking one, but it wants the unit
     off to one side so the hero column stays readable. Aiming the camera
     sideways to do that would skew the whole machine, so shift the projection
     frustum laterally instead - same view, moved across the frame - and taper
     it away once the page has scrolled past the hero. */
  const VIEW_SHIFT = [[0, 0.23], [0.16, 0.23], [0.42, 0], [1, 0]];

  const STRIP_FROM = 0.74;
  const STRIP_TO = 0.96;

  /* ---- how scroll maps onto the overhaul --------------------------------
     The build is measured in pixels rather than as a fraction of the page: on
     index.html a .build-run spacer sits under a sticky hero, so those pixels
     are exactly the stretch where the page holds still and the machine puts
     itself together under the reader's own scrolling. A page with no spacer
     falls back to giving the build the first stretch of ordinary scroll. */
  let runPx = 1;
  let maxPx = 1;

  const measure = () => {
    const doc = document.documentElement;
    maxPx = Math.max(doc.scrollHeight - window.innerHeight, 1);
    const spacer = document.querySelector('.build-run');
    const h = spacer ? spacer.offsetHeight : 0;
    runPx = h > 40 ? h : Math.max(Math.min(maxPx * 0.13, window.innerHeight * 0.9), 1);
  };

  /* ---- theme ------------------------------------------------------------
     The page can be flipped to light at any moment, and a scene lit for a
     near-black background reads as a smudge on near-white. Fog takes its
     colour straight from --bg so it always dissolves into the page. */
  const paint = () => {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    scene.fog.color.set(cssVar('--bg') || (light ? '#f4f6f8' : '#06080b'));
    scene.fog.density = light ? 0.015 : 0.0095;
    renderer.toneMappingExposure = light ? 1.4 : 1.05;
    ambient.color.set(light ? 0xdae4f2 : 0x1b2432);
    ambient.intensity = light ? 3.4 : 1.9;
    key.intensity = light ? 4.6 : 4.2;
    fill.intensity = light ? 2.2 : 1.5;
    core.intensity = light ? 32 : 55;
    deep.intensity = light ? 26 : 42;
    chrome.color.set(light ? 0xbcc5d1 : 0xdbe1ea);
    steel.color.set(light ? 0x7c8798 : 0x9aa4b2);
    shell.color.set(light ? 0x767e88 : 0x23282f);
    machined.color.set(light ? 0x9aa2ac : 0x8d959f);
    frameMat.color.set(light ? 0x98a1ab : 0x6d757f);
    darkMat.color.set(light ? 0x59606a : 0x14181d);
    dust.material.color.set(light ? 0x6c7b90 : 0xbcd0ea);
    dust.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
  };
  paint();
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });

  let vw = window.innerWidth;
  let vh = window.innerHeight;
  let shifted = -1;
  /* Orbiting the standoffs about the shaft swings parts through the side the
     hero copy is on. On a two-column layout the whole drifting cloud is
     pushed clear of that column; in portrait there is no column to clear. */
  let driftBias = 0;

  const project = (p) => {
    const s = vw / vh < 1 ? 0 : atCurve(VIEW_SHIFT, p);  // one column: nothing to clear
    if (Math.abs(s - shifted) < 0.002) return;
    shifted = s;
    if (s > 0.001) camera.setViewOffset(vw, vh, -s * vw, 0, vw, vh);
    else camera.clearViewOffset();
  };

  const resize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    camera.aspect = vw / vh;
    camera.fov = vw / vh < 1 ? 68 : 52;     // portrait needs a wider cone
    camera.updateProjectionMatrix();
    shifted = -1;                           // the offset is in pixels: redo it
    driftBias = vw / vh < 1 ? 0 : 1.6;
    renderer.setSize(vw, vh, false);
    measure();
  };
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('load', measure);

  say('Spinning up');

  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const back = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();
  let spin = 0;
  let px = window.scrollY;
  let shown = -1;
  let ready = false;
  let held = -1;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const targetPx = window.scrollY;
    px += (targetPx - px) * Math.min(1, dt * 4.2);        // damped follow

    const build = clamp01(px / runPx);
    const prog = clamp01(px / maxPx);
    const strip = clamp01((prog - STRIP_FROM) / (STRIP_TO - STRIP_FROM));
    const whole = Math.min(build, 1 - strip);   // 1 when the unit is together
    const journey = clamp01((px - runPx) / Math.max(maxPx - runPx, 1));

    /* Anything less than fully together has parts drifting, so the matrices
       have to be rebuilt every frame. A finished machine is rigid: one last
       pass when it seats, then nothing until the scroll moves again. */
    if (whole !== held || whole < 1) {
      assemble(whole, now * 0.001);
      held = whole;
    }

    /* how far the damped follow is behind the scrollbar is a free read on
       scroll speed - spin the impeller up while the page moves. A half-built
       unit barely turns; it comes up to speed as it closes, and runs back down
       as it is stripped. */
    const boost = Math.min(Math.abs(targetPx - px) / 90, 4.5);
    spin += dt * (0.05 + 0.55 * whole + boost * whole);
    spinner.rotation.z = spin;
    dust.rotation.z = spin * -0.03;

    eyeCurve.getPoint(journey, eye);
    aimCurve.getPoint(journey, aim);

    /* stand well back while the parts are spread out and close in as they
       seat, so both the build and the strip-down stay framed */
    if (whole < 1) {
      back.subVectors(eye, aim).normalize();
      eye.addScaledVector(back, (1 - whole) * 19);
    }

    camera.position.copy(eye);
    camera.lookAt(aim);
    camera.rotateZ(Math.sin(journey * Math.PI * 1.7) * 0.07);

    project(prog);

    const presence = atCurve(PRESENCE, prog);
    if (Math.abs(presence - shown) > 0.004) {
      canvas.style.opacity = presence.toFixed(3);
      shown = presence;
    }

    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      document.documentElement.dataset.webgl = 'on';
      /* the pin only has a height once data-webgl is set, so the document just
         got taller. script.js re-measures its own scroll caches off this event
         - faking a window resize instead also re-runs the renderer's resize
         path, and that turned out to disturb the page's own layout. */
      window.dispatchEvent(new Event('rotor:ready'));
      measure();
    }
  };

  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
}

try {
  boot();
} catch (err) {
  // the SVG wheel is still sitting there: leave the page exactly as it was
  console.warn('machine scene unavailable', err);
}
