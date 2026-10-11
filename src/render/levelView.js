// Maillage du niveau : un seul objet, dont chaque face porte ses coordonnées dans l'atlas de peinture
// et la matière de sa surface (béton rainuré, herbe, pierre, tôle…). Les matières sont dessinées par le
// programme de rendu lui-même, sans image à télécharger. La peinture est brillante et légèrement en relief.

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';
import { SURFACE } from '../config/maps/util.js';

const PATTERN = {
  lisse: 0, beton: 1, herbe: 2, pierre: 3, bois: 4, tole: 5, parpaing: 6, tuile: 7, foin: 8,
  bache: 9, parquet: 10, cloison: 11, ecran: 12, feuillage: 13, ecorce: 14, tissu: 15, moquette: 16, metal: 17,
};

// quality : { softPaint, detail } partagés avec les réglages de qualité.
export function createLevelView(paint, paintTexture, quality) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const paintUvs = [];
  const patterns = [];
  const indices = [];
  const color = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  for (const f of paint.faces) {
    const base = positions.length / 3;
    const corners = [[f.u0, f.v0], [f.u1, f.v0], [f.u1, f.v1], [f.u0, f.v1]];
    const n = [0, 0, 0];
    n[f.axis] = f.sign;
    color.set(f.box.color);
    const pattern = PATTERN[SURFACE.get(f.box.color)] ?? 0;
    // un mur s'assombrit vers son pied, d'autant plus qu'il est haut
    const wall = f.axis !== 1;
    const yOf = ([u, v]) => (f.ua === 1 ? u : v);
    const low = wall ? Math.min(...corners.map(yOf)) : 0;
    const tall = wall ? Math.min(1, Math.max(0, (Math.max(...corners.map(yOf)) - low - 0.5) / 1.5)) : 0;
    const pts = corners.map(([u, v]) => {
      const p = [0, 0, 0];
      p[f.axis] = f.plane;
      p[f.ua] = u;
      p[f.va] = v;
      positions.push(...p);
      normals.push(...n);
      colors.push(color.r, color.g, color.b);
      uvs.push(u, v);
      paintUvs.push((f.ax + (u - f.u0) / paint.cell) / paint.width, (f.ay + (v - f.v0) / paint.cell) / paint.height);
      // les faces du dessus et les faces de côté ne se texturent pas pareil (dalles au sol, rangs sur un mur)
      patterns.push(pattern, f.axis === 1 ? 1 : 0, wall ? yOf([u, v]) - low : 9, tall);
      return p;
    });
    // ordre des sommets choisi pour que la face regarde du côté de sa normale
    a.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
    b.set(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]);
    const outward = a.cross(b).dot(b.set(n[0], n[1], n[2])) > 0;
    if (outward) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('paintUv', new THREE.Float32BufferAttribute(paintUvs, 2));
  geometry.setAttribute('surface', new THREE.Float32BufferAttribute(patterns, 4));
  geometry.setIndex(indices);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.paintMap = { value: paintTexture.texture };
    shader.uniforms.paintSoft = quality.softPaint;
    shader.uniforms.detail = quality.detail;
    shader.uniforms.paintTexel = { value: new THREE.Vector2(1 / paint.width, 1 / paint.height) };
    shader.uniforms.teamA = { value: new THREE.Color(TEAMS[1].color) };
    shader.uniforms.teamB = { value: new THREE.Color(TEAMS[2].color) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 paintUv;
        attribute vec4 surface;
        varying vec2 vPaintUv;
        varying vec2 vGridUv;
        varying vec4 vSurface;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPaintUv = paintUv;
        vGridUv = uv;
        vSurface = surface;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D paintMap;
        uniform vec2 paintTexel;
        uniform float paintSoft;
        uniform float detail;
        uniform vec3 teamA;
        uniform vec3 teamB;
        varying vec2 vPaintUv;
        varying vec2 vGridUv;
        varying vec4 vSurface;
        float gPaint;      // 0 : surface nue, 1 : peinture
        float gRough;      // rugosité de la matière
        float gHeight;     // relief, pour accrocher la lumière
        ${SURFACE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gRough = 0.9;
        gHeight = 0.0;
        if (detail > 0.5) surfaceLook(vGridUv, vSurface.x, vSurface.y, diffuseColor.rgb, gRough, gHeight);
        // peinture : le seuil sur la valeur lissée donne des bords arrondis
        vec2 puv = vPaintUv;
        vec4 pm;
        if (paintSoft > 0.5) {
          // les bords ondulent un peu, pour casser l'alignement sur la grille
          puv += (vec2(vnoise(vGridUv * 2.6), vnoise(vGridUv * 2.6 + 31.7)) - 0.5) * paintTexel * 2.2;
          vec2 o = paintTexel * 0.85;
          pm = 0.28 * texture2D(paintMap, puv) + 0.18 * (texture2D(paintMap, puv + o) + texture2D(paintMap, puv - o)
            + texture2D(paintMap, puv + vec2(o.x, -o.y)) + texture2D(paintMap, puv + vec2(-o.x, o.y)));
        } else {
          pm = texture2D(paintMap, puv);
        }
        float amount = max(pm.r, pm.g);
        gPaint = smoothstep(0.40, 0.50, amount);
        vec3 paintColor = pm.r >= pm.g ? teamA : teamB;
        // un peu plus sombre sur les bords, comme une couche plus mince
        paintColor *= mix(0.8, 1.0, smoothstep(0.5, 0.8, amount));
        diffuseColor.rgb = mix(diffuseColor.rgb, paintColor, gPaint);
        // la peinture comble le relief de la matière et forme un bourrelet sur son pourtour
        gHeight = mix(gHeight, 0.0, gPaint) + smoothstep(0.36, 0.62, amount) * 1.6;
        // couche d'épaisseur inégale : la lumière y glisse en vagues
        float coat = fbm(vGridUv * 3.1 + 11.0);
        gHeight += gPaint * coat * 0.5;
        gRough = mix(gRough, mix(0.1, 0.3, coat), gPaint);
        diffuseColor.rgb *= mix(1.0, mix(0.58, 1.0, smoothstep(0.0, 1.3, vSurface.z)), vSurface.w);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (detail > 0.5) {
          vec3 sx = normalize(dFdx(-vViewPosition));
          vec3 sy = normalize(dFdy(-vViewPosition));
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(gHeight) * r1 + dFdy(gHeight) * r2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Matières dessinées par calcul. p : position sur la face, en mètres. top : 1 pour un dessus, 0 pour un côté.
const SURFACE_GLSL = `
  float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.3 + 7.1) + 0.1 * vnoise(p * 5.1 + 3.3); }
  // joints d'un appareillage de blocs : 0 dans le joint, 1 sur le bloc ; id donne un numéro par bloc
  float blocks(vec2 p, vec2 size, float joint, out vec2 id) {
    vec2 q = p / size;
    q.x += 0.5 * mod(floor(q.y), 2.0);
    id = floor(q);
    vec2 f = fract(q);
    vec2 d = min(f, 1.0 - f) * size;
    return smoothstep(0.0, joint, min(d.x, d.y));
  }
  bool is(float pattern, float k) { return abs(pattern - k) < 0.5; }

  // Estompe un motif quand il devient plus fin que l'écran ne peut le montrer (sinon il scintille au loin).
  // size : taille du motif en mètres ; px : mètres couverts par un pixel. Renvoie avg au loin, v de près.
  float lod(float v, float avg, float size, float px) { return mix(avg, v, 1.0 - smoothstep(0.1, 0.4, px / size)); }

  void surfaceLook(vec2 p, float pattern, float top, inout vec3 col, inout float rough, inout float height) {
    vec2 id;
    float px = max(fwidth(p.x), fwidth(p.y));
    float n = fbm(p * 0.7);
    if (is(pattern, 1.0)) {
      // béton de cour : dalles de 4 m, rainures antidérapantes, salissures
      float joint = lod(blocks(p, vec2(4.0, 4.0), 0.05, id), 1.0, 0.1, px);
      float g = abs(fract(p.x * 7.0 + (mod(id.y + id.x, 2.0) > 0.5 ? p.y * 7.0 : 0.0)) - 0.5);
      float groove = top > 0.5 ? lod(smoothstep(0.25, 0.5, g), 0.5, 0.14, px) : 0.5;
      col *= (0.8 + 0.3 * n) * mix(0.7, 1.0, joint) * mix(0.86, 1.02, groove);
      col = mix(col, col * vec3(0.78, 0.72, 0.6), smoothstep(0.55, 0.9, fbm(p * 0.25 + 4.0)) * 0.6);
      height = groove * 0.35 + joint * 0.5;
      rough = 0.92;
    } else if (is(pattern, 2.0)) {
      // herbe : touffes claires et sombres, zones un peu jaunies
      float blades = lod(vnoise(p * vec2(9.0, 11.0)) * 0.5 + vnoise(p * 23.0) * 0.5, 0.5, 0.08, px);
      col *= 0.72 + 0.5 * blades;
      col *= 0.85 + 0.3 * vnoise(p * 0.9);
      col = mix(col, col * vec3(1.25, 1.12, 0.6), smoothstep(0.5, 0.85, fbm(p * 0.18)) * 0.55);
      height = blades * 0.5;
      rough = 1.0;
    } else if (is(pattern, 3.0)) {
      // mur de moellons : pierres inégales, joints creusés
      float joint = lod(blocks(p + vec2(vnoise(p * 1.5) * 0.12, 0.0), vec2(0.62, 0.34), 0.04, id), 0.85, 0.08, px);
      float stone = lod(hash1(id), 0.5, 0.4, px);
      float grit = lod(vnoise(p * 9.0), 0.5, 0.12, px);
      col *= mix(0.55, 1.0, joint) * (0.8 + 0.3 * stone) * (0.9 + 0.2 * grit) * (0.88 + 0.2 * n);
      col = mix(col, col * vec3(1.08, 0.98, 0.85), smoothstep(0.65, 0.75, stone));
      height = joint * 1.2 + grit * 0.2;
      rough = 0.97;
    } else if (is(pattern, 4.0)) {
      // planches : veinage dans le sens de la longueur
      vec2 q = top > 0.5 ? p : p.yx;
      float plank = floor(q.y / 0.22);
      float fy = fract(q.y / 0.22);
      float edge = lod(smoothstep(0.0, 0.07, min(fy, 1.0 - fy)), 0.9, 0.03, px);
      float grain = lod(vnoise(vec2(q.x * 1.3 + plank * 7.0, q.y * 34.0)), 0.5, 0.04, px);
      float tint = lod(hash1(vec2(plank, 3.0)), 0.5, 0.22, px);
      col *= (0.8 + 0.3 * tint) * (0.86 + 0.22 * grain) * mix(0.6, 1.0, edge);
      height = edge * 0.7 + grain * 0.15;
      rough = 0.82;
    } else if (is(pattern, 5.0)) {
      // tôle ondulée : ondes régulières, un peu de rouille
      float wave = lod(0.5 + 0.5 * sin(p.x * 31.4), 0.5, 0.2, px);
      col *= 0.78 + 0.32 * wave;
      col = mix(col, vec3(0.52, 0.3, 0.18), smoothstep(0.62, 0.9, fbm(p * 0.45 + 9.0)) * 0.5);
      height = wave * 0.9;
      rough = 0.42;
    } else if (is(pattern, 6.0)) {
      // parpaings
      float joint = lod(blocks(p, vec2(0.5, 0.2), 0.016, id), 0.9, 0.04, px);
      float tint = lod(hash1(id), 0.5, 0.25, px);
      col *= mix(0.6, 1.0, joint) * (0.88 + 0.16 * tint) * (0.9 + 0.18 * n);
      height = joint * 0.9;
      rough = 0.97;
    } else if (is(pattern, 7.0)) {
      // tuiles canal
      float row = lod(fract(p.y / 0.32), 0.5, 0.32, px);
      float round = lod(abs(sin((p.x + 0.11 * mod(floor(p.y / 0.32), 2.0)) * 14.3)), 0.64, 0.22, px);
      float tint = lod(hash1(floor(p / vec2(0.22, 0.32))), 0.5, 0.3, px);
      col *= (0.7 + 0.4 * round) * mix(0.65, 1.0, smoothstep(0.0, 0.2, row)) * (0.85 + 0.25 * tint);
      height = round * 0.8 + row * 0.5;
      rough = 0.85;
    } else if (is(pattern, 8.0)) {
      // foin : brins serrés
      float straw = lod(vnoise(vec2(p.x * 3.0, p.y * 60.0)) * 0.6 + vnoise(p * vec2(55.0, 4.0)) * 0.4, 0.5, 0.03, px);
      col *= (0.72 + 0.5 * straw) * (0.88 + 0.22 * n);
      height = straw * 0.6;
      rough = 1.0;
    } else if (is(pattern, 9.0)) {
      // bâche : grands plis doux, surface satinée
      float fold = fbm(p * 0.6 + 2.0);
      col *= 0.8 + 0.4 * fold;
      height = fold * 1.2;
      rough = 0.38;
    } else if (is(pattern, 10.0)) {
      // parquet : lames décalées, verni
      vec2 q = p.yx / vec2(1.4, 0.16);
      q.x += 0.37 * floor(q.y);
      vec2 f = fract(q);
      float edge = lod(smoothstep(0.0, 0.07, min(f.y, 1.0 - f.y)) * smoothstep(0.0, 0.008, min(f.x, 1.0 - f.x)), 0.93, 0.025, px);
      float tint = lod(hash1(floor(q)), 0.5, 0.16, px);
      float grain = lod(vnoise(vec2(p.y * 2.0, p.x * 40.0)), 0.5, 0.03, px);
      col *= (0.82 + 0.3 * tint) * (0.92 + 0.14 * grain) * mix(0.62, 1.0, edge) * (0.92 + 0.14 * n);
      height = edge * 0.4;
      rough = 0.4;
    } else if (is(pattern, 11.0)) {
      // cloison de stand : panneaux d'un mètre, joints fins
      float line = lod(smoothstep(0.0, 0.012, min(fract(p.x), 1.0 - fract(p.x))), 0.97, 0.03, px);
      col *= (0.93 + 0.1 * n) * mix(0.7, 1.0, line);
      height = line * 0.5;
      rough = 0.7;
    } else if (is(pattern, 12.0)) {
      // écran géant : dalles lumineuses
      vec2 f = fract(p / 0.5);
      float tile = lod(smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y))), 0.95, 0.06, px);
      col *= (1.15 + 0.35 * fbm(p * 0.5)) * mix(0.75, 1.0, tile);
      rough = 0.25;
    } else if (is(pattern, 13.0)) {
      // feuillage : masses claires et sombres
      float leaf = lod(vnoise(p * 3.2) * 0.6 + vnoise(p * 9.0) * 0.4, 0.5, 0.12, px);
      col *= (0.6 + 0.75 * leaf) * (0.85 + 0.3 * n);
      height = leaf * 1.4;
      rough = 1.0;
    } else if (is(pattern, 14.0)) {
      // écorce : crevasses verticales
      float bark = lod(vnoise(vec2(p.x * 13.0, p.y * 1.6)), 0.5, 0.08, px);
      col *= 0.62 + 0.6 * bark;
      height = bark * 1.3;
      rough = 1.0;
    } else if (is(pattern, 15.0)) {
      // tissu des cubes-sièges : trame fine, passepoil sur les arêtes
      vec2 f = fract(p / 0.9 + 0.5);
      float border = lod(smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y))), 0.9, 0.1, px);
      float weave = lod(0.5 + 0.25 * sin(p.x * 260.0) + 0.25 * sin(p.y * 260.0), 0.5, 0.024, px);
      col *= (0.86 + 0.2 * weave) * mix(1.25, 1.0, border);
      rough = 0.95;
    } else if (is(pattern, 16.0)) {
      // moquette
      col *= 0.82 + 0.3 * lod(vnoise(p * 48.0), 0.5, 0.02, px);
      rough = 1.0;
    } else if (is(pattern, 17.0)) {
      // tôle peinte : panneaux, éclats et rouille
      float joint = lod(blocks(p, vec2(1.3, 0.8), 0.02, id), 0.95, 0.05, px);
      col *= mix(0.6, 1.0, joint) * (0.9 + 0.16 * n);
      col = mix(col, vec3(0.42, 0.24, 0.15), smoothstep(0.6, 0.85, fbm(p * 1.3 + 5.0)) * 0.65);
      height = joint * 0.6;
      rough = 0.5;
    } else {
      col *= 0.9 + 0.16 * n;
      rough = 0.8;
    }
  }
`;
