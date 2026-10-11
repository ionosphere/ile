// Finition de l'image, en qualité Haute : la scène est d'abord dessinée dans une image à grande dynamique,
// puis ses parties les plus lumineuses (peinture fraîche au soleil, ciel, tôle) bavent en un léger halo,
// et l'ensemble reçoit un vignettage discret et des couleurs un peu plus vives.

import * as THREE from 'three';

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const pass = (uniforms, fragmentShader, toneMapped = false) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader, depthTest: false, depthWrite: false, toneMapped });

export function createPost(renderer) {
  // sans image à grande dynamique, pas de finition : on dessine directement à l'écran
  const supported = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
  const size = new THREE.Vector2();
  const options = { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false };
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const glowA = new THREE.WebGLRenderTarget(1, 1, options);
  const glowB = new THREE.WebGLRenderTarget(1, 1, options);

  const bright = pass({ tScene: { value: sceneTarget.texture }, texel: { value: new THREE.Vector2() } }, `
    uniform sampler2D tScene;
    uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      vec3 c = 0.25 * (texture2D(tScene, vUv + texel * vec2(1.0, 1.0)).rgb + texture2D(tScene, vUv + texel * vec2(-1.0, 1.0)).rgb
        + texture2D(tScene, vUv + texel * vec2(1.0, -1.0)).rgb + texture2D(tScene, vUv + texel * vec2(-1.0, -1.0)).rgb);
      c = min(c, vec3(6.0));
      float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(0.85, 1.7, l), 1.0);
    }`);
  const blur = pass({ tInput: { value: null }, step: { value: new THREE.Vector2() } }, `
    uniform sampler2D tInput;
    uniform vec2 step;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tInput, vUv).rgb * 0.227;
      c += (texture2D(tInput, vUv + step * 1.385).rgb + texture2D(tInput, vUv - step * 1.385).rgb) * 0.316;
      c += (texture2D(tInput, vUv + step * 3.231).rgb + texture2D(tInput, vUv - step * 3.231).rgb) * 0.0703;
      gl_FragColor = vec4(c, 1.0);
    }`);
  const compose = pass({ tScene: { value: sceneTarget.texture }, tGlow: { value: glowA.texture } }, `
    uniform sampler2D tScene;
    uniform sampler2D tGlow;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb + texture2D(tGlow, vUv).rgb * 0.38;
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.1);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.5;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, true);

  const quad = new THREE.Mesh(new THREE.BufferGeometry(), bright);
  quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quad.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  quad.frustumCulled = false;
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const draw = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quad, flat);
  };

  return {
    supported,
    render(scene, camera) {
      renderer.getDrawingBufferSize(size);
      if (sceneTarget.width !== size.x || sceneTarget.height !== size.y) {
        sceneTarget.setSize(size.x, size.y);
        const w = Math.max(1, Math.round(size.x / 4));
        const h = Math.max(1, Math.round(size.y / 4));
        glowA.setSize(w, h);
        glowB.setSize(w, h);
        bright.uniforms.texel.value.set(1 / size.x, 1 / size.y);
      }
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      draw(bright, glowA);
      // deux flous successifs, le second plus large
      for (const spread of [1, 2.2]) {
        blur.uniforms.tInput.value = glowA.texture;
        blur.uniforms.step.value.set(spread / glowA.width, 0);
        draw(blur, glowB);
        blur.uniforms.tInput.value = glowB.texture;
        blur.uniforms.step.value.set(0, spread / glowA.height);
        draw(blur, glowA);
      }
      draw(compose, null);
    },
  };
}
