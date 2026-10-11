// มุมมอง 3D: (1) ห้องเดี่ยวพร้อมเฟอร์นิเจอร์ (2) อาคารทั้งหลัง แสดงสถานะแต่ละห้องด้วยสี
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const STATUS_COLORS = {
  vacant: 0x10b981,
  reserved: 0xf59e0b,
  occupied: 0x6366f1,
  maintenance: 0x94a3b8,
};

const FURNITURE_COLORS = {
  bed: '#c7d2fe', desk: '#d6b38a', wardrobe: '#a78b6d', sofa: '#fda4af',
  fridge: '#e5e7eb', tv: '#1f2937', bathroom: '#e2e8f0', kitchen: '#fde68a',
};

function createStage(container) {
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(8, 14, 10);
  sun.castShadow = true;
  scene.add(sun);

  let frame;
  const loop = () => {
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  loop();

  const onResize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  const dispose = () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    controls.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    renderer.dispose();
    container.innerHTML = '';
  };
  return { renderer, scene, camera, controls, dispose };
}

function box(w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** ห้องเดี่ยว: พื้น ผนัง 3 ด้าน และเฟอร์นิเจอร์จาก unit.layout (พิกัดจากกึ่งกลางห้อง หน่วยเมตร) */
export function renderRoom(container, unit) {
  const stage = createStage(container);
  const { scene, camera, controls } = stage;
  const W = unit.width, L = unit.length, H = unit.height;

  const floor = box(W, 0.05, L, 0xf5efe6);
  floor.position.y = -0.025;
  scene.add(floor);

  const wallMat = { transparent: true, opacity: 0.35, color: 0xe2e8f0 };
  const wt = 0.08;
  const back = box(W, H, wt, wallMat.color, wallMat);
  back.position.set(0, H / 2, -L / 2);
  const left = box(wt, H, L, wallMat.color, wallMat);
  left.position.set(-W / 2, H / 2, 0);
  const right = left.clone();
  right.position.x = W / 2;
  scene.add(back, left, right);

  const statusRing = box(W + 0.3, 0.02, L + 0.3, STATUS_COLORS[unit.status] ?? 0x94a3b8);
  statusRing.position.y = -0.06;
  scene.add(statusRing);

  for (const f of unit.layout || []) {
    const color = f.color || FURNITURE_COLORS[f.kind] || '#cbd5e1';
    const isBath = f.kind === 'bathroom';
    const m = box(f.w, f.h, f.d, color, isBath ? { transparent: true, opacity: 0.55 } : {});
    m.position.set(f.x, f.h / 2, f.z);
    scene.add(m);
  }

  const grid = new THREE.GridHelper(Math.max(W, L) + 4, Math.max(W, L) + 4, 0xcbd5e1, 0xe2e8f0);
  grid.position.y = -0.07;
  scene.add(grid);

  const r = Math.max(W, L);
  camera.position.set(r * 0.9, r * 1.1, r * 1.4);
  controls.target.set(0, H / 3, 0);
  return stage;
}

/** อาคาร: แต่ละห้องเป็นกล่องเรียงตามชั้น สีตามสถานะ คลิกเพื่อเลือกห้อง */
export function renderBuilding(container, units, onPick) {
  const stage = createStage(container);
  const { scene, camera, controls, renderer } = stage;

  const floors = {};
  for (const u of units) (floors[u.floor] ||= []).push(u);
  const floorNums = Object.keys(floors).map(Number).sort((a, b) => a - b);
  const maxPerFloor = Math.max(1, ...floorNums.map((f) => floors[f].length));
  const cellW = 2.2, cellD = 3, floorH = 1.6;
  const pickables = [];

  floorNums.forEach((fl, fi) => {
    const row = floors[fl];
    const slab = box(maxPerFloor * cellW + 0.4, 0.12, cellD + 0.6, 0xe2e8f0);
    slab.position.set(0, fi * floorH - 0.06, 0);
    scene.add(slab);
    row.forEach((u, i) => {
      const x = (i - (row.length - 1) / 2) * cellW;
      const m = box(cellW - 0.25, floorH - 0.3, cellD, STATUS_COLORS[u.status] ?? 0x94a3b8, {
        transparent: true, opacity: 0.88,
      });
      m.position.set(x, fi * floorH + (floorH - 0.3) / 2, 0);
      m.userData.unit = u;
      pickables.push(m);
      scene.add(m);
    });
  });

  const totalH = floorNums.length * floorH;
  const span = Math.max(maxPerFloor * cellW, totalH);
  camera.position.set(span * 0.55, totalH * 0.75 + 1.5, span * 0.85 + 2.5);
  controls.target.set(0, totalH / 2, 0);

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  const toPtr = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(pickables)[0]?.object ?? null;
  };
  renderer.domElement.addEventListener('pointermove', (e) => {
    const hit = toPtr(e);
    if (hovered && hovered !== hit) hovered.material.emissive.setHex(0x000000);
    hovered = hit;
    if (hit) hit.material.emissive.setHex(0x333333);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  });
  renderer.domElement.addEventListener('click', (e) => {
    const hit = toPtr(e);
    if (hit) onPick?.(hit.userData.unit);
  });
  return stage;
}
