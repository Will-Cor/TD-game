import * as THREE from 'three';

export interface ProceduralTextureSet {
  groundMap: THREE.CanvasTexture;
  groundBump: THREE.CanvasTexture;
  roadMap: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  metalBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Armored Tactical Deck Tile Texture
  const [gCanvas, gCtx] = makeCanvas(256);
  gCtx.fillStyle = '#18232E';
  gCtx.fillRect(0, 0, 256, 256);

  // Subtle brushed alloy diagonal sheen
  const tileGrad = gCtx.createLinearGradient(0, 0, 256, 256);
  tileGrad.addColorStop(0, '#1D2936');
  tileGrad.addColorStop(0.5, '#17222D');
  tileGrad.addColorStop(1, '#141D27');
  gCtx.fillStyle = tileGrad;
  gCtx.fillRect(6, 6, 244, 244);

  // Micro-surface texture
  for (let i = 0; i < 640; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    gCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.08)';
    gCtx.fillRect(x, y, 3, 2);
  }

  // Recessed inner mounting plate & subtle crosshairs
  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  gCtx.lineWidth = 2;
  gCtx.strokeRect(24, 24, 208, 208);

  gCtx.strokeStyle = 'rgba(226, 200, 150, 0.08)';
  gCtx.lineWidth = 1.5;
  gCtx.beginPath();
  gCtx.moveTo(128, 42);
  gCtx.lineTo(128, 214);
  gCtx.moveTo(42, 128);
  gCtx.lineTo(214, 128);
  gCtx.stroke();

  // Corner anchor bolts
  gCtx.fillStyle = 'rgba(226, 200, 150, 0.25)';
  for (const [bx, by] of [
    [16, 16],
    [240, 16],
    [16, 240],
    [240, 240],
  ]) {
    gCtx.beginPath();
    gCtx.arc(bx, by, 4, 0, Math.PI * 2);
    gCtx.fill();
  }

  // Crisp surveyor bevel border
  gCtx.strokeStyle = 'rgba(226, 200, 150, 0.22)';
  gCtx.lineWidth = 4;
  gCtx.strokeRect(2, 2, 252, 252);

  const groundMap = new THREE.CanvasTexture(gCanvas);
  groundMap.colorSpace = THREE.SRGBColorSpace;
  groundMap.wrapS = THREE.RepeatWrapping;
  groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.anisotropy = aniso;

  // Ground Bump (linear space)
  const [gbCanvas, gbCtx] = makeCanvas(128);
  gbCtx.fillStyle = '#848484';
  gbCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 420; i++) {
    const v = 116 + ((i * 29) % 32);
    gbCtx.fillStyle = `rgb(${v},${v},${v})`;
    gbCtx.fillRect((i * 53) % 128, (i * 97) % 128, 2, 2);
  }
  gbCtx.strokeStyle = '#505050';
  gbCtx.lineWidth = 2;
  gbCtx.strokeRect(12, 12, 104, 104);
  gbCtx.strokeStyle = '#383838';
  gbCtx.lineWidth = 3;
  gbCtx.strokeRect(1.5, 1.5, 125, 125);
  const groundBump = new THREE.CanvasTexture(gbCanvas);
  groundBump.wrapS = THREE.RepeatWrapping;
  groundBump.wrapT = THREE.RepeatWrapping;

  // 2. Sculpted Conduit Road Paver Texture
  const [rCanvas, rCtx] = makeCanvas(256);
  rCtx.fillStyle = '#2A3642';
  rCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const ox = col * 64 + (row % 2 === 0 ? 0 : 32);
      const oy = row * 64;
      rCtx.fillStyle = (row + col) % 2 === 0 ? '#364656' : '#2D3B49';
      rCtx.fillRect((ox + 3) % 256, oy + 3, 58, 58);
      // Top bevel highlight
      rCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      rCtx.fillRect((ox + 4) % 256, oy + 4, 56, 4);
      // Recessed mortar seam
      rCtx.strokeStyle = '#18212A';
      rCtx.lineWidth = 3;
      rCtx.strokeRect((ox + 2) % 256, oy + 2, 60, 60);
    }
  }
  // Subtle warm tactical track stripe inset
  rCtx.fillStyle = 'rgba(229, 169, 60, 0.12)';
  rCtx.fillRect(0, 122, 256, 12);
  const roadMap = new THREE.CanvasTexture(rCanvas);
  roadMap.colorSpace = THREE.SRGBColorSpace;
  roadMap.wrapS = THREE.RepeatWrapping;
  roadMap.wrapT = THREE.RepeatWrapping;
  roadMap.anisotropy = aniso;

  const [rbCanvas, rbCtx] = makeCanvas(128);
  rbCtx.fillStyle = '#949494';
  rbCtx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      rbCtx.strokeStyle = '#323232';
      rbCtx.lineWidth = 3;
      rbCtx.strokeRect(col * 32 + 1, row * 32 + 1, 30, 30);
    }
  }
  const roadBump = new THREE.CanvasTexture(rbCanvas);
  roadBump.wrapS = THREE.RepeatWrapping;
  roadBump.wrapT = THREE.RepeatWrapping;

  // 3. Brushed Metal Micro-Bump
  const [mCanvas, mCtx] = makeCanvas(128);
  mCtx.fillStyle = '#808080';
  mCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    const shade = 110 + ((y * 19) % 36);
    mCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    mCtx.fillRect(0, y, 128, 1);
  }
  const metalBump = new THREE.CanvasTexture(mCanvas);
  metalBump.wrapS = THREE.RepeatWrapping;
  metalBump.wrapT = THREE.RepeatWrapping;

  // 4. Soft Contact Shadow Radial Disc
  const [sCanvas, sCtx] = makeCanvas(128);
  const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(sCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    groundMap,
    groundBump,
    roadMap,
    roadBump,
    metalBump,
    contactShadowMap,
    dispose: () => {
      groundMap.dispose();
      groundBump.dispose();
      roadMap.dispose();
      roadBump.dispose();
      metalBump.dispose();
      contactShadowMap.dispose();
    },
  };
}
