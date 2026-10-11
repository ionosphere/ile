// Scène, ciel, lumières, ombres et redimensionnement.

import * as THREE from 'three';
import { CAMERA } from '../config/tuning.js';
import { createPost } from './post.js';

const SHADOW_RANGE = 62;   // demi-largeur de la zone couverte par les ombres, autour du centre de la carte

// coarse : écran tactile, sur lequel on économise l'anticrénelage
export function createRenderer(container, { coarse = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#dcecff', '#6f7a55', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_RANGE;
  sc.right = SHADOW_RANGE;
  sc.top = SHADOW_RANGE;
  sc.bottom = -SHADOW_RANGE;
  sc.near = 10;
  sc.far = 260;
  scene.add(hemi, sun, sun.target);

  // Ciel : un grand dôme en dégradé, avec un halo autour du soleil.
  const skyUniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    glow: { value: 1 },
    clouds: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float glow;
        uniform float clouds;
        varying vec3 vDir;
        float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * glow * (pow(s, 600.0) * 6.0 + pow(s, 24.0) * 0.25);
          // quelques cumulus, plaqués sur un plafond plat pour qu'ils fuient vers l'horizon
          if (clouds > 0.0 && d.y > 0.02) {
            vec2 q = d.xz / (d.y + 0.12) * 1.6;
            float n = 0.55 * vnoise(q) + 0.3 * vnoise(q * 2.3 + 4.0) + 0.15 * vnoise(q * 5.0 + 9.0);
            float cover = smoothstep(0.52, 0.72, n) * smoothstep(0.02, 0.2, d.y) * clouds;
            c = mix(c, vec3(1.0, 0.99, 0.96) * (0.82 + 0.25 * n), cover * 0.9);
          }
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // Les reflets (peinture fraîche, tôle) viennent d'une image floue du ciel.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  let envTarget = null;

  // Ciel, brume et lumières propres à chaque carte.
  const setTheme = (theme) => {
    const [top, horizon] = theme.sky;
    skyUniforms.top.value.set(top);
    skyUniforms.horizon.value.set(horizon);
    skyUniforms.sunColor.value.set(theme.sunColor);
    skyUniforms.sunDir.value.set(...theme.sunDir).normalize();
    skyUniforms.glow.value = theme.indoor ? 0 : 1;
    skyUniforms.clouds.value = theme.clouds ?? 0;
    scene.background = new THREE.Color(horizon);
    scene.fog = theme.fog ? new THREE.Fog(horizon, theme.fog[0], theme.fog[1]) : null;
    renderer.toneMappingExposure = theme.exposure;
    hemi.intensity = theme.hemi;
    hemi.color.set(theme.indoor ? '#fff4e2' : '#dcecff');
    hemi.groundColor.set(theme.indoor ? '#5a4a38' : '#6f7a55');
    sun.color.set(theme.sunColor);
    sun.intensity = theme.sun;
    sun.position.copy(skyUniforms.sunDir.value).multiplyScalar(140);

    skyScene.add(sky);
    envTarget?.dispose();
    envTarget = pmrem.fromScene(skyScene, 0.04);
    scene.environment = envTarget.texture;
    scene.add(sky);
  };

  // Ombres portées : coûteuses, donc réservées aux niveaux de qualité qui les demandent.
  const setShadows = (on) => {
    sun.castShadow = on;
  };

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 900);
  camera.rotation.order = 'YXZ';

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  // Finition de l'image (halo, vignettage) : réservée elle aussi aux niveaux de qualité qui la demandent.
  const post = createPost(renderer);
  let usePost = false;
  const setPost = (on) => {
    usePost = on && post.supported;
  };
  const render = () => {
    if (usePost) post.render(scene, camera);
    else renderer.render(scene, camera);
  };

  return { renderer, scene, camera, setTheme, setShadows, setPost, render };
}
