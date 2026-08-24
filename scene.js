/* =====================================================================
   WebGL machine scene
   ---------------------------------------------------------------------
   The unit in images/img7.jpg, modelled procedurally and rendered behind
   the page: a skid-mounted axial blower - polished bellmouth intake, bar
   guard, vaned impeller on a domed hub, finned casing barrel stepping
   down to a finned rear section and end cover, with lifting hoop,
   mounting lugs and a fabricated steel base under it all.

   Scroll runs it through one overhaul. The page opens on the unit in
   pieces; the first screenful builds it up, the middle of the page walks
   the camera around and through the finished machine, and the last
   stretch strips it back down in reverse.

   All of this is an enhancement. No WebGL, no ES module support, reduced
   motion, or a throw anywhere in here, and the page keeps exactly the SVG
   wheel it already had. Nothing else on the page waits on this file.
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
  const RR = 3.4;                   // rear section radius
  const VANES = narrow ? 9 : 12;
  const BARS = narrow ? 8 : 11;
  const FINS = narrow ? 9 : 14;
  const REAR_FINS = narrow ? 6 : 9;

  scene.environment = new THREE.PMREMGenerator(renderer)
    .fromEquirectangular(skyTexture()).texture;

  /* ---- materials, read off the photograph ------------------------------- */
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd9dfe8, metalness: 1, roughness: 0.09,
    side: THREE.DoubleSide, envMapIntensity: 1.6,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2, metalness: 0.95, roughness: 0.26,
    side: THREE.DoubleSide, envMapIntensity: 1.2,
  });
  const shell = new THREE.MeshStandardMaterial({
    color: 0x23282f, metalness: 0.86, roughness: 0.52, envMapIntensity: 0.85,
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
  let tumbleAmt = 0;

  /* index < 0 means a plain Mesh rather than one instance of an InstancedMesh;
     `from` is the scale it starts at, so a ring can shrink onto a barrel
     instead of flying at it */
  const part = (mesh, index, cue, from) => {
    if (index >= 0) instanced.add(mesh);
    parts.push({
      mesh, index, cue, from: from === undefined ? 0.86 : from,
      at: at.clone(), rot: rot.clone(), size: size.clone(),
      off: off.clone(), axis: axis.clone(), tumble: tumbleAmt,
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

  /* ---- the base: fabricated channel skid, which lands first ------------- */
  {
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, 12);
    machine.add(box);
    let n = 0;
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
  }

  /* ---- the casing: main barrel, the step down, the end cover ------------ */
  {
    const barrel = new THREE.Mesh(zTo(new THREE.CylinderGeometry(R, R, 4.2, 64)), shell);
    machine.add(barrel);
    rot.identity();
    place(0, 0, 0.4, 1);
    flyFrom(0, 13, 0, 0.5, 1, 0, 0);
    part(barrel, -1, 0.08);

    const rear = new THREE.Mesh(zTo(new THREE.CylinderGeometry(RR, RR, 3.0, 56)), shell);
    machine.add(rear);
    place(0, 0, -3.2, 1);
    flyFrom(0, 0, -16, 0.4, 1, 0, 0);
    part(rear, -1, 0.20);

    const cap = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(RR * 0.99, RR * 0.72, 0.9, 56)), shell,
    );
    machine.add(cap);
    place(0, 0, -5.1, 1);
    flyFrom(0, 0, -19, 0.9, 0.4, 0.2, 1);
    part(cap, -1, 0.30);
  }

  /* ---- cooling fins: rings that shrink onto the barrels ------------------ */
  {
    const ring = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.014, 6, 76), shell, FINS + REAR_FINS,
    );
    machine.add(ring);
    let n = 0;
    rot.identity();
    flyFrom(0, 0, 0, 0);

    for (let i = 0; i < FINS; i++) {
      place(0, 0, 2.3 - (i / (FINS - 1)) * 3.9, R + 0.13);
      part(ring, n++, 0.14 + i * 0.004, 1.65);
    }
    for (let i = 0; i < REAR_FINS; i++) {
      place(0, 0, -1.9 - (i / (REAR_FINS - 1)) * 2.6, RR + 0.12);
      part(ring, n++, 0.24 + i * 0.004, 1.65);
    }
  }

  /* ---- mounting lugs and the lifting hoop -------------------------------- */
  {
    const lug = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, 4);
    machine.add(lug);
    const zAxis = new THREE.Vector3(0, 0, 1);
    const seats = [
      [0, R + 0.2, 1.6, 0],
      [0, R + 0.2, -1.4, 0],
      [R + 0.2, 0.4, 0.6, Math.PI / 2],
      [-R - 0.2, 0.4, 0.6, -Math.PI / 2],
    ];
    let n = 0;
    for (const seat of seats) {
      rot.setFromAxisAngle(zAxis, seat[3]);
      place(seat[0], seat[1], seat[2], 1.5, 0.34, 1.5);
      off.set(seat[0], seat[1], seat[2]).normalize().multiplyScalar(7);
      tumbleAmt = 1.1;
      axis.set(0.3, 1, 0.2).normalize();
      part(lug, n++, 0.34);
    }

    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.11, 8, 40, Math.PI), frameMat,
    );
    machine.add(hoop);
    rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    place(0, R + 0.15, 0.2, 1);
    flyFrom(0, 8, 0, 1.4, 1, 0.3, 0);
    part(hoop, -1, 0.40);
  }

  /* ---- the impeller: vanes on a domed hub, and the shaft nut ------------- */
  {
    const vanes = new THREE.InstancedMesh(
      vaneGeometry({
        stations: narrow ? 11 : 15,
        chordPts: narrow ? 13 : 17,
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
    const zAxis = new THREE.Vector3(0, 0, 1);

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

    const dome = new THREE.Mesh(
      zTo(new THREE.SphereGeometry(0.98, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62)),
      chrome,
    );
    dome.geometry.scale(1, 1, 1.5);       // ogive rather than hemisphere
    spinner.add(dome);
    rot.identity();
    place(0, 0, 2.5, 1);
    flyFrom(0.8, 2.6, 7.5, 1.2, 1, 0.2, 0);
    part(dome, -1, 0.56);

    const nut = new THREE.Mesh(zTo(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 6)), chrome);
    spinner.add(nut);
    place(0, 0, 3.45, 1);
    flyFrom(1.4, 3.4, 6.5, 2.4, 0, 0, 1);
    part(nut, -1, 0.60);
  }

  /* ---- the guard: straight bars across the intake ------------------------ */
  {
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), darkMat, BARS);
    machine.add(bars);
    const reach = R * 0.94;
    rot.identity();
    for (let i = 0; i < BARS; i++) {
      const x = ((i + 0.5) / BARS - 0.5) * 2 * reach;
      const half = Math.sqrt(Math.max(reach * reach - x * x, 0.01));
      place(x, 0, 4.0, 0.15, half * 2, 0.13);
      flyFrom(x * 0.55, 2.4, 6.0, 0.5, 0, 1, 0);
      part(bars, i, 0.62 + i * 0.004);
    }
  }

  /* ---- the bellmouth: the chrome the whole photograph hangs on ----------- */
  {
    const skirt = new THREE.Mesh(
      zTo(new THREE.CylinderGeometry(R * 1.06, R, 1.5, 64, 1, true)), chrome,
    );
    machine.add(skirt);
    rot.identity();
    place(0, 0, 3.2, 1);
    flyFrom(0.5, -3.4, 7.5, 0.5, 1, 0, 0);
    part(skirt, -1, 0.70);

    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.74, 20, 76), chrome);
    machine.add(lip);
    place(0, 0, 4.15, 1);
    flyFrom(1.2, 4.2, 9.5, 0.7, 1, 0.2, 0);
    part(lip, -1, 0.76);
  }

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

  const assemble = (a) => {
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i];
      const e = easeOut(clamp01((a - t.cue) / SPAN));
      aPos.copy(t.at).addScaledVector(t.off, 1 - e);
      aTumble.setFromAxisAngle(t.axis, t.tumble * (1 - e));
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
    [1.8, 0.6, 10.0],
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

  /* The page runs the unit through one overhaul: built in the first
     screenful, walked around through the middle, stripped again at the end.
     Scrolling back up plays whichever phase you are in backwards. */
  const ASSEMBLE = 0.13;
  const STRIP_FROM = 0.74;
  const STRIP_TO = 0.96;

  /* how much of the page the scene is allowed to own: the build and the
     strip-down are its moments, the reading sections are not */
  const PRESENCE = [[0, 1], [0.15, 1], [0.26, 0.48], [0.66, 0.48], [0.80, 0.9], [1, 0.9]];

  /* The head-on view of the intake is the striking one, but it wants the unit
     off to one side so the hero column stays readable. Aiming the camera
     sideways to do that would skew the whole machine, so shift the projection
     frustum laterally instead - same view, moved across the frame - and taper
     it away once the page has scrolled past the hero. */
  const VIEW_SHIFT = [[0, 0.23], [0.16, 0.23], [0.42, 0], [1, 0]];

  const scrollFraction = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
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
    ambient.color.set(light ? 0xdae4f2 : 0x131c2a);
    ambient.intensity = light ? 3.4 : 1.2;
    key.intensity = light ? 4.6 : 4.2;
    fill.intensity = light ? 2.2 : 1.5;
    core.intensity = light ? 32 : 55;
    deep.intensity = light ? 26 : 42;
    chrome.color.set(light ? 0xb9c2ce : 0xd9dfe8);
    steel.color.set(light ? 0x7c8798 : 0x9aa4b2);
    shell.color.set(light ? 0x767e88 : 0x23282f);
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
    renderer.setSize(vw, vh, false);
  };
  resize();
  window.addEventListener('resize', resize);

  say('Spinning up');

  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const back = new THREE.Vector3();
  let raf = 0;
  let last = performance.now();
  let spin = 0;
  let prog = scrollFraction();
  let shown = -1;
  let ready = false;
  let held = -1;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const target = scrollFraction();
    prog += (target - prog) * Math.min(1, dt * 4.2);      // damped follow

    const build = clamp01(prog / ASSEMBLE);
    const strip = clamp01((prog - STRIP_FROM) / (STRIP_TO - STRIP_FROM));
    const whole = Math.min(build, 1 - strip);   // 1 when the unit is together
    const journey = Math.max((prog - ASSEMBLE) / (1 - ASSEMBLE), 0);

    if (whole !== held) {
      assemble(whole);
      held = whole;
    }

    /* the gap between where the camera is and where the scroll wants it is a
       free read on scroll speed - spin the impeller up while the page moves. A
       half-built unit barely turns; it comes up to speed as it closes, and
       runs back down as it is stripped. */
    const boost = Math.min(Math.abs(target - prog) * 16, 4.5);
    spin += dt * (0.05 + 0.55 * whole + boost * whole);
    spinner.rotation.z = spin;
    dust.rotation.z = spin * -0.03;

    eyeCurve.getPoint(journey, eye);
    aimCurve.getPoint(journey, aim);

    /* stand well back while the parts are spread out and close in as they
       seat, so both the build and the strip-down stay framed */
    if (whole < 1) {
      back.subVectors(eye, aim).normalize();
      eye.addScaledVector(back, (1 - whole) * 15);
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
      window.dispatchEvent(new Event('rotor:ready'));
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
