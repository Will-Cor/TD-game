import * as THREE from 'three';

export interface ProceduralTextureSet {
  groundMap: THREE.CanvasTexture;
  roadMap: THREE.CanvasTexture;
  terraceMap: THREE.CanvasTexture;
  metalMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makePixelCanvas(size = 16): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function finalizePixelTexture(
  canvas: HTMLCanvasElement,
  repeat = true,
  srgb = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp 16x16 pixel-art surface textures with NearestFilter & no mipmaps
 * so plaza terrain, sunken channel beds, architectural terraces, and turret armor
 * share a cohesive, fast-rendering 16x16 aesthetic.
 */
export function createProceduralTextures(): ProceduralTextureSet {
  // 1. 16x16 Seamless Continuous Plaza Ground (zero grid borders, subtle dappled stone pixels)
  const [gCanvas, gCtx] = makePixelCanvas(16);
  gCtx.fillStyle = '#D7DFEA';
  gCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const hash = ((x * 37 + y * 91 + x * y * 13) & 15) / 15;
      if (hash < 0.22) {
        gCtx.fillStyle = '#E8EEF5';
        gCtx.fillRect(x, y, 1, 1);
      } else if (hash > 0.78) {
        gCtx.fillStyle = '#BAC6D6';
        gCtx.fillRect(x, y, 1, 1);
      } else if ((x + y) % 5 === 0 && hash > 0.55) {
        gCtx.fillStyle = '#C6D1E0';
        gCtx.fillRect(x, y, 1, 1);
      }
    }
  }
  const groundMap = finalizePixelTexture(gCanvas, true, true);

  // 2. 16x16 Sunken Canal / Trench Bed (deep channel center + stepped stone ribs)
  const [rCanvas, rCtx] = makePixelCanvas(16);
  rCtx.fillStyle = '#9AA9BE';
  rCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const border = x === 0 || x === 15 || y === 0 || y === 15;
      const midBand = (x >= 6 && x <= 9) || (y >= 6 && y <= 9);
      if (border) {
        rCtx.fillStyle = '#6D7B8F';
      } else if (midBand && (x + y) % 2 === 0) {
        rCtx.fillStyle = '#D7E2F0';
      } else if ((x * 3 + y * 5) % 7 === 0) {
        rCtx.fillStyle = '#8293A8';
      } else {
        rCtx.fillStyle = '#A8B8CD';
      }
      rCtx.fillRect(x, y, 1, 1);
    }
  }
  const roadMap = finalizePixelTexture(rCanvas, true, true);

  // 3. 16x16 Architectural Terrace & Curb Masonry
  const [tCanvas, tCtx] = makePixelCanvas(16);
  tCtx.fillStyle = '#C9D2DE';
  tCtx.fillRect(0, 0, 16, 16);
  for (let row = 0; row < 4; row++) {
    const py = row * 4;
    tCtx.fillStyle = '#8A96A8';
    tCtx.fillRect(0, py, 16, 1);
    const offset = row % 2 === 0 ? 0 : 4;
    for (let bx = offset; bx < 16; bx += 8) {
      tCtx.fillStyle = '#8A96A8';
      tCtx.fillRect(bx % 16, py, 1, 4);
      tCtx.fillStyle = '#E5ECF4';
      tCtx.fillRect((bx + 1) % 16, py + 1, 3, 1);
    }
  }
  const terraceMap = finalizePixelTexture(tCanvas, true, true);

  // 4. 16x16 Turret Brushed Pixel-Armor Texture
  const [mCanvas, mCtx] = makePixelCanvas(16);
  mCtx.fillStyle = '#CED6E0';
  mCtx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    mCtx.fillStyle = y % 4 === 0 ? '#AEB9C7' : y % 2 === 0 ? '#DDE4EE' : '#C5CFD9';
    mCtx.fillRect(0, y, 16, 1);
  }
  // Corner pixel rivets
  mCtx.fillStyle = '#FFFFFF';
  mCtx.fillRect(1, 1, 1, 1);
  mCtx.fillRect(14, 1, 1, 1);
  mCtx.fillRect(1, 14, 1, 1);
  mCtx.fillRect(14, 14, 1, 1);
  const metalMap = finalizePixelTexture(mCanvas, true, true);

  // 5. 16x16 Dithered Pixel Contact Shadow Disc
  const [sCanvas, sCtx] = makePixelCanvas(16);
  sCtx.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d = Math.hypot(dx, dy) / 7.5;
      if (d <= 0.55) {
        sCtx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        sCtx.fillRect(x, y, 1, 1);
      } else if (d <= 0.85 && (x + y) % 2 === 0) {
        sCtx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        sCtx.fillRect(x, y, 1, 1);
      }
    }
  }
  const contactShadowMap = finalizePixelTexture(sCanvas, false, true);

  return {
    groundMap,
    roadMap,
    terraceMap,
    metalMap,
    contactShadowMap,
    dispose: () => {
      groundMap.dispose();
      roadMap.dispose();
      terraceMap.dispose();
      metalMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
