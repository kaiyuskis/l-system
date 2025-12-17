import * as THREE from "three";

export type TextureSet = {
  barkColor: THREE.Texture;
  barkNormal: THREE.Texture;
  barkRoughness: THREE.Texture;
  flowerTexture: THREE.Texture;
  leafTextures: Record<string, THREE.Texture>;
  budTexture: THREE.Texture;
};

export function loadTextures(): TextureSet {
  const texLoader = new THREE.TextureLoader();
  const barkColor = texLoader.load('bark_willow_02_diff_4k.jpg');
  barkColor.colorSpace = THREE.SRGBColorSpace;
  const barkNormal = texLoader.load('bark_willow_02_nor_gl_4k.jpg');
  const barkRoughness = texLoader.load('bark_willow_02_rough_4k.jpg');
  [barkColor, barkNormal, barkRoughness].forEach(barkTexture => {
    barkTexture.wrapS = THREE.RepeatWrapping;
    barkTexture.wrapT = THREE.RepeatWrapping;
    barkTexture.repeat.set(4, 4);
  });

  const flowerTexture = texLoader.load('cherry_blossom.png');
  const leafTextures: Record<string, THREE.Texture> = {
    leaf_default: texLoader.load("leaf_default.png"),
    leaf_maple: texLoader.load("leaf_maple.png"),
  };
  const budTexture = texLoader.load('bud.png');

  Object.values(leafTextures).forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });

  {
    const t = leafTextures.leaf_default;
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 4;
    t.needsUpdate = true;
  }

  return { barkColor, barkNormal, barkRoughness, flowerTexture, leafTextures, budTexture };
}
