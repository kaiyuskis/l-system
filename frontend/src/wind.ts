import type * as THREE from "three";

export const windShaderHeader = `
  uniform float time;
  uniform float windStrength;
  uniform float gustStrength;
  uniform vec2 windDirection;

  attribute float aThickness;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g);
  }

  vec3 getWindVector(vec3 worldPos, float height, float thickness) {
    vec3 windDir3 = normalize(vec3(windDirection.x, 0.0, windDirection.y));

    float noiseVal = snoise(vec2(worldPos.x * 0.05 + time * 0.3, worldPos.z * 0.05));
    float gust = 1.0 + noiseVal * 0.5;
    float resistance = pow(thickness + 0.5, 3.0);
    float distFromRoot = length(worldPos);

    float swayFactor = smoothstep(0.0, 5.0, distFromRoot);

    float totalStrength = windStrength + gustStrength;
    return windDir3 * (totalStrength * gust * swayFactor / resistance) * 0.01;
  }
`;

export const leafFlutter = `
  vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);

  float flutter = sin(time * 8.0 + instancePos.y * 0.5 + instancePos.x) * 0.1 * windStrength;

  vec3 pos = transformed;
  pos.x += flutter * (pos.y + 0.5);
  pos.z += flutter * (pos.y + 0.5);
  transformed = pos;
`;

export const applySway = `
  vec4 wPos = modelMatrix * vec4( position, 1.0 );

  #ifdef USE_INSTANCING
    wPos = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  #endif

  vec3 sway = getWindVector(wPos.xyz, wPos.y, aThickness);
  vec4 viewSway = viewMatrix * vec4(sway, 0.0);
  mvPosition += viewSway;

  gl_Position = projectionMatrix * mvPosition;
`;

export function setupMaterial(mat: THREE.MeshStandardMaterial, windUniforms: any, isLeaf: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = windUniforms.time;
    shader.uniforms.windStrength = windUniforms.strength;
    shader.uniforms.gustStrength = windUniforms.gust;
    shader.uniforms.windDirection = windUniforms.direction;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windShaderHeader
    );

    if (isLeaf) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + leafFlutter
      );
    }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + applySway
    );
  };
}

export function setupDepthMaterial(mat: THREE.Material, windUniforms: any, isLeaf: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = windUniforms.time;
    shader.uniforms.windStrength = windUniforms.strength;
    shader.uniforms.gustStrength = windUniforms.gust;
    shader.uniforms.windDirection = windUniforms.direction;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\n' + windShaderHeader
    );

    if (isLeaf) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + leafFlutter
      );
    }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + applySway
    );
  };
}

export function triggerDoubleGust(windUniforms: any) {
  const base = windUniforms.strength.value;
  const amp = Math.max(2.0, base * 1.5 + 0.8);
  const pulse = (t: number) => Math.sin(Math.PI * t);
  const now = performance.now();

  const d1 = 520;
  const gap = 50;
  const d2 = 560;

  const total = d1 + gap + d2;

  function frame() {
    const elapsed = performance.now() - now;
    let g = 0;

    if (elapsed <= d1) {
      const t = elapsed / d1;
      g += amp * pulse(t);
    }

    const t2Start = d1 + gap;
    if (elapsed >= t2Start && elapsed <= t2Start + d2) {
      const t = (elapsed - t2Start) / d2;
      g += (amp * 0.85) * pulse(t);
    }

    windUniforms.gust.value = g;

    if (elapsed < total) {
      requestAnimationFrame(frame);
    } else {
      windUniforms.gust.value = 0;
    }
  }

  requestAnimationFrame(frame);
}
