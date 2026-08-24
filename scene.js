/* =====================================================================
   WebGL rotor scene
   ---------------------------------------------------------------------
   A multi-stage turbine rotor - built from lofted aerofoils rather than a
   downloaded model - lit and rendered behind the page. Scroll drives a
   camera along a path that circles and threads the blade stages, so
   moving down the page reads as travelling through the machine.

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
   fine trailing edge, which is most of what makes a blade read as a blade */
const halfThickness = (t, thick) =>
  5 * thick * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t
               + 0.2843 * t ** 3 - 0.1015 * t ** 4);

/* One blade, lofted root to tip. Each spanwise station is a closed aerofoil
   ring; consecutive rings are stitched into a solid and both ends capped.
   The chord tapers, the section thins, and the stagger angle unwinds towards
   the tip - the twist you see on a real turbine blade. Local axes: +Y is
   radially out, +Z is along the shaft, +X is tangential. */
function bladeGeometry(o) {
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
   something to reflect, with no HDR to download */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0e1826');
  grad.addColorStop(0.46, '#333f4e');
  grad.addColorStop(0.52, '#606e80');
  grad.addColorStop(1, '#04060a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

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
  scene.fog = new THREE.FogExp2(0x06080b, 0.0115);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);

  say('Building rotor');

  const STAGES = narrow ? 4 : 5;
  const BLADES = narrow ? 16 : 22;
  const GAP = 12;
  const HUB = 1.2;
  const TIP = 4.7;
  const TAIL = -(STAGES - 1) * GAP;

  scene.environment = new THREE.PMREMGenerator(renderer)
    .fromEquirectangular(skyTexture()).texture;

  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2, metalness: 0.95, roughness: 0.26,
    side: THREE.DoubleSide, envMapIntensity: 1.2,
  });
  const forged = new THREE.MeshStandardMaterial({
    color: 0x39414d, metalness: 0.88, roughness: 0.44, envMapIntensity: 0.9,
  });
  const casing = new THREE.MeshStandardMaterial({
    color: 0x2b323c, metalness: 0.8, roughness: 0.55, envMapIntensity: 0.7,
  });

  /* ---- the rotor: one shaft, and every blade in a single instanced draw -- */
  const rotor = new THREE.Group();
  scene.add(rotor);

  const shaftLen = Math.abs(TAIL) + GAP;      // first stage to past the last
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(HUB * 0.62, HUB * 0.62, shaftLen, 32).rotateX(Math.PI / 2),
    forged,
  );
  shaft.position.z = -shaftLen / 2;
  rotor.add(shaft);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(HUB * 0.98, GAP * 0.6, 32).rotateX(Math.PI / 2),
    forged,
  );
  nose.position.z = GAP * 0.17 + GAP * 0.3;
  rotor.add(nose);

  const hubs = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(HUB, HUB, GAP * 0.34, 40).rotateX(Math.PI / 2),
    forged, STAGES,
  );
  rotor.add(hubs);

  const blades = new THREE.InstancedMesh(
    bladeGeometry({
      stations: narrow ? 11 : 15,
      chordPts: narrow ? 13 : 17,
      hubR: HUB * 0.92,
      tipR: TIP,
      chordRoot: 2.7,
      taper: 0.44,
      stagRoot: 64,
      stagTip: 30,
      camber: 0.085,
      sweep: 0.9,
    }),
    steel, STAGES * BLADES,
  );
  rotor.add(blades);

  /* ---- the casing: rings the camera threads between, which do not spin -- */
  const RINGS = STAGES * 2;
  /* the instance scale multiplies the tube radius too, so the unit torus has
     to be built thin enough to survive being blown up ~6x */
  const casingRings = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1, 0.011, 6, 84), casing, RINGS,
  );
  scene.add(casingRings);

  /* ---- assembly ---------------------------------------------------------
     At the top of the page the rotor is an exploded view: blades standing off
     on their own radii, hubs and casing clear of the shaft. Scrolling draws it
     together a part at a time - shaft, then the stages front to back, then the
     casing and the spinner - and only once it is whole does the camera set off
     down the shaft.

     Each piece records where it ends up, the offset it flies in from and its
     slot in the sequence, so a frame of assembly is one pass of compose() over
     a flat list rather than any rebuilding of geometry. */
  const SPAN = 0.34;                    // how long one part takes to land
  const parts = [];

  const part = (mesh, index, at, rot, size, from, off, tumbleAxis, tumble, cue) =>
    parts.push({
      mesh, index, size, from, tumble, cue,
      at: at.clone(), rot: rot.clone(), off: off.clone(), axis: tumbleAxis.clone(),
    });

  {
    const zAxis = new THREE.Vector3(0, 0, 1);
    const at = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const off = new THREE.Vector3();
    const axis = new THREE.Vector3();
    let n = 0;

    for (let st = 0; st < STAGES; st++) {
      const grow = 1 + st * 0.12;         // stages get bigger downstream
      at.set(0, 0, -st * GAP);

      // hubs thread onto the shaft from the front, front stage first
      q.identity();
      off.set(0, 0, 15 + st * 4);
      part(hubs, st, at, q, grow, 0.85, off, zAxis, 0.9, 0.05 + st * 0.05);

      for (let b = 0; b < BLADES; b++) {
        const phi = (b / BLADES) * Math.PI * 2 + st * 0.31;
        q.setFromAxisAngle(zAxis, phi);

        /* a blade's root is +Y in its own frame, so once it is turned to its
           azimuth it flies in along exactly the line it will sit on */
        const spread = 4.2 + hash(n) * 2.4;
        off.set(-Math.sin(phi) * spread, Math.cos(phi) * spread, (hash(n + 7) - 0.5) * 5);
        axis.set(hash(n + 3) - 0.5, hash(n + 11) - 0.5, hash(n + 19) - 0.5).normalize();

        part(blades, n, at, q, grow, 0.85, off, axis, 0.55,
             0.14 + st * 0.09 + (b / BLADES) * 0.05);
        n++;
      }
    }

    // the casing closes in from a wider radius once the stack is standing
    q.identity();
    off.set(0, 0, 0);
    for (let i = 0; i < RINGS; i++) {
      const f = i / (RINGS - 1);
      at.set(0, 0, GAP * 0.5 + f * (TAIL - GAP));
      part(casingRings, i, at, q, (TIP + 1.1) * (1 + f * 0.55), 1.85,
           off, zAxis, 0, 0.42 + f * 0.20);
    }
  }

  const noseSeatZ = nose.position.z;

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
      aScale.setScalar(t.size * (t.from + (1 - t.from) * e));
      aMat.compose(aPos, aQuat, aScale);
      t.mesh.setMatrixAt(t.index, aMat);
    }
    hubs.instanceMatrix.needsUpdate = true;
    blades.instanceMatrix.needsUpdate = true;
    casingRings.instanceMatrix.needsUpdate = true;

    // the shaft and the spinner are plain meshes, not instances
    const eShaft = easeOut(clamp01(a / SPAN));
    shaft.scale.z = 0.04 + 0.96 * eShaft;
    const eNose = easeOut(clamp01((a - 0.62) / SPAN));
    nose.position.z = noseSeatZ + (1 - eNose) * 24;
    nose.scale.setScalar(0.35 + 0.65 * eNose);
  };

  /* ---- dust in the flow path ------------------------------------------- */
  const dust = (() => {
    const n = narrow ? 900 : 2200;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 13;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = Math.sin(a) * r;
      p[i * 3 + 2] = 26 - Math.random() * 110;
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

  say('Casting lights');

  const ambient = new THREE.AmbientLight(0x131c2a, 1.2);
  const key = new THREE.DirectionalLight(0xe4edfb, 3.1);
  const rim = new THREE.DirectionalLight(0x4f81d8, 1.2);
  const core = new THREE.PointLight(0xff2d46, 260, 46, 2);
  const deep = new THREE.PointLight(0xf2a93b, 200, 54, 2);
  key.position.set(7, 11, 14);
  rim.position.set(-11, -5, -10);
  core.position.set(1.5, 0.5, -GAP * 0.55);
  deep.position.set(1.5, -1, TAIL + GAP * 0.4);
  scene.add(ambient, key, rim, core, deep);

  /* ---- where the camera goes -------------------------------------------
     A helix down the shaft: the rotor stays off to one side and the view
     keeps changing, which leaves the page's own column readable instead of
     burying it in metal. */
  const path = (pts) => new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5,
  );

  const eyeCurve = path([
    [4.6, 2.0, 26.0],
    [4.2, 2.7, 21.5],
    [6.8, -2.2, 12.0],
    [-3.0, 4.0, -6.0],
    [-9.5, -3.0, -22.0],
    [-7.5, 5.5, -38.0],
    [-16.0, 10.0, -55.0],
  ]);
  const aimCurve = path([
    [0.0, 0.0, 7.0],
    [0.0, 0.0, 2.0],
    [0.0, 0.0, -8.0],
    [0.0, 0.0, -20.0],
    [0.0, 0.5, -34.0],
    [-1.0, 0.0, -48.0],
    [-3.0, 1.5, -68.0],
  ]);

  /* The head-on view down the shaft is the striking one, but it wants the
     rotor off to one side so the hero column stays clear. Aiming the camera
     sideways to do that would skew the whole stack, so shift the projection
     frustum laterally instead - same view, moved across the frame - and taper
     it away once the page has scrolled past the hero. */
  const VIEW_SHIFT = [[0, 0.23], [0.16, 0.23], [0.42, 0], [1, 0]];

  /* The first slice of the page is the build: the camera holds off while the
     rotor draws itself together, and the run down the shaft starts from there.
     Roughly one screenful of scrolling on a page this long. */
  const ASSEMBLE = 0.13;

  /* how much of the page the scene is allowed to own: the build and the hero
     are its moment, the reading sections are not */
  const PRESENCE = [[0, 1], [0.15, 1], [0.26, 0.46], [0.70, 0.46], [0.87, 0.88], [1, 0.88]];

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
    scene.fog.density = light ? 0.018 : 0.0115;
    renderer.toneMappingExposure = light ? 1.4 : 1.05;
    ambient.color.set(light ? 0xdae4f2 : 0x131c2a);
    ambient.intensity = light ? 3.4 : 1.2;
    key.intensity = light ? 3.6 : 3.1;
    core.intensity = light ? 150 : 260;
    deep.intensity = light ? 120 : 200;
    steel.color.set(light ? 0x7c8798 : 0x9aa4b2);
    casing.color.set(light ? 0x9aa3ae : 0x2b323c);
    forged.color.set(light ? 0x69737f : 0x39414d);
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

  const aim3 = (p) => {                     // frustum shift, one column layout
    if (vw / vh < 1) return 0;              // aside, so nothing to shift around
    return atCurve(VIEW_SHIFT, p);
  };

  const project = (p) => {
    const s = aim3(p);
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
  let raf = 0;
  let last = performance.now();
  let spin = 0;
  let prog = scrollFraction();
  let shown = -1;
  let ready = false;
  let built = -1;
  const back = new THREE.Vector3();

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const target = scrollFraction();
    prog += (target - prog) * Math.min(1, dt * 4.2);      // damped follow

    const build = Math.min(prog / ASSEMBLE, 1);
    const journey = Math.max((prog - ASSEMBLE) / (1 - ASSEMBLE), 0);

    /* keep driving the assembly for a frame past completion so the parts land
       exactly on their seats, then leave the instance matrices alone */
    if (build < 1 || built < 1) {
      assemble(build);
      built = build;
    }

    /* the gap between where the camera is and where the scroll wants it is a
       free read on scroll speed - spin the rotor up while the page moves. A
       half-built rotor barely turns; it comes up to speed as it closes. */
    const boost = Math.min(Math.abs(target - prog) * 16, 4.5);
    spin += dt * (0.05 + 0.29 * build + boost * build);
    rotor.rotation.z = spin;
    dust.rotation.z = spin * -0.04;

    eyeCurve.getPoint(journey, eye);
    aimCurve.getPoint(journey, aim);

    /* stand well back while the parts are still spread out, and close in as
       they seat, so the build stays framed and the camera arrives with it */
    if (build < 1) {
      back.subVectors(eye, aim).normalize();
      eye.addScaledVector(back, (1 - build) * 16);
    }

    camera.position.copy(eye);
    camera.lookAt(aim);
    camera.rotateZ(Math.sin(journey * Math.PI * 1.7) * 0.09);

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
  console.warn('rotor scene unavailable', err);
}
