import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WaterField, WeatherState } from '../core/WaterField';
import { AtmosphereLightingState } from '../world/AtmosphereSystem';

export interface RendererPerformanceMetrics {
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export type CameraViewMode = 'chase_standard' | 'chase_close' | 'chase_tactical' | 'bow_action';

export interface ScreenProjectionResult {
  x: number;
  y: number;
  isBehind: boolean;
  isOnScreen: boolean;
}

interface SprayParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class RenderManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly composer: EffectComposer;
  public readonly bloomPass: UnrealBloomPass;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly rimLight: THREE.DirectionalLight;
  public readonly ambientLight: THREE.HemisphereLight;
  public readonly playerSpotLight: THREE.SpotLight;
  public readonly playerUnderGlow: THREE.PointLight;

  private container: HTMLElement;
  private waterMesh: THREE.Mesh;
  private waterGeo: THREE.PlaneGeometry;
  private waterNormalTex: THREE.CanvasTexture;
  private waterGridHelper: THREE.GridHelper;
  private skyMat: THREE.ShaderMaterial;
  private skyDome: THREE.Mesh;
  private starPoints: THREE.Points;
  private horizonGroup: THREE.Group;

  private wakeGroup: THREE.Group;
  private wakeLeftArm: THREE.Mesh;
  private wakeRightArm: THREE.Mesh;
  private wakePropWash: THREE.Mesh;
  private hullFoamRing: THREE.Mesh;

  private sprayParticles: SprayParticle[] = [];
  private sprayGeo: THREE.BufferGeometry;
  private sprayPoints: THREE.Points;

  private rainPoints: THREE.Points;
  private frameTimes: number[] = [];
  private cameraMode: CameraViewMode = 'chase_standard';
  private shakeIntensity = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1b36);
    this.scene.fog = new THREE.FogExp2(0x142648, 0.00036);

    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.5, 3400);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Post-processing HDR Composer with selective UnrealBloomPass for neon signage & beacons
    const renderTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.24, 0.26, 0.92);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Environment map for metallic PBR materials and specular water reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.42;

    this.ambientLight = new THREE.HemisphereLight(0x6eb8ff, 0x10223d, 1.35);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xff9d5c, 1.75);
    this.sunLight.position.set(220, 280, -180);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sunLight);

    // Cool neon-cyan rim light from opposite horizon so silhouettes & boat decks read with razor clarity
    this.rimLight = new THREE.DirectionalLight(0x00f2ff, 0.95);
    this.rimLight.position.set(-180, 150, 200);
    this.scene.add(this.rimLight);

    this.playerSpotLight = new THREE.SpotLight(0xd8f8ff, 4.2, 140, Math.PI / 4.5, 0.5, 1.1);
    this.playerSpotLight.castShadow = false;
    this.scene.add(this.playerSpotLight);
    this.scene.add(this.playerSpotLight.target);

    // Subtle under-hull illumination so surrounding waves catch the vessel's neon accent
    this.playerUnderGlow = new THREE.PointLight(0x00f2ff, 1.8, 22, 1.4);
    this.scene.add(this.playerUnderGlow);

    // 1. Atmospheric Gradient Sky Dome + Starfield + 360° Distant Megacity Skyline
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x071126) },
        uMidColor: { value: new THREE.Color(0x1f2454) },
        uHorizonColor: { value: new THREE.Color(0xff7b42) },
        uSunDir: { value: new THREE.Vector3(0.55, 0.32, -0.76).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          float h = clamp(vWorldDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.24, h));
          col = mix(col, uTopColor, smoothstep(0.24, 0.82, h));
          float sunAmt = max(0.0, dot(normalize(vWorldDir), uSunDir));
          col += vec3(1.0, 0.65, 0.35) * pow(sunAmt, 36.0) * 0.65;
          col += vec3(1.0, 0.88, 0.72) * smoothstep(0.996, 0.9995, sunAmt) * 1.4;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 20), this.skyMat);
    this.scene.add(this.skyDome);

    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42 + 0.06;
      const r = 2350;
      starPos[i * 3] = r * Math.cos(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi);
      starPos[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xd8f4ff,
        size: 3.2,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.scene.add(this.starPoints);

    this.horizonGroup = this.buildDistantSkylineRing();
    this.scene.add(this.horizonGroup);

    // 2. Analytic Dynamic Ocean Surface with Normal-Mapped Micro-Ripples
    this.waterNormalTex = this.createWaterNormalTexture();
    this.waterGeo = new THREE.PlaneGeometry(1800, 1800, 120, 120);
    this.waterGeo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(this.waterGeo.attributes.position.count * 3);
    for (let i = 0; i < this.waterGeo.attributes.position.count; i++) {
      colors[i * 3] = 0.015;
      colors[i * 3 + 1] = 0.11;
      colors[i * 3 + 2] = 0.22;
    }
    this.waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.26,
      metalness: 0.22,
      normalMap: this.waterNormalTex,
      normalScale: new THREE.Vector2(0.48, 0.48),
      emissive: 0x010a16,
      emissiveIntensity: 0.22,
      flatShading: false,
    });
    this.waterMesh = new THREE.Mesh(this.waterGeo, waterMat);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // Ultra-subtle tactical sonar grid at waterline
    this.waterGridHelper = new THREE.GridHelper(1200, 100, 0x00f2ff, 0x0a4460);
    this.waterGridHelper.position.y = 0.01;
    const gridMat = this.waterGridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.05;
    gridMat.depthWrite = false;
    this.scene.add(this.waterGridHelper);

    // 3. Feathered Kelvin V-Wake Foam System (ZERO rectangular edges!)
    const wakeRibbonTex = this.createFeatheredWakeTexture();
    const wakeRibbonMat = new THREE.MeshBasicMaterial({
      map: wakeRibbonTex,
      color: 0xc8fcff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.wakeGroup = new THREE.Group();
    const armGeo = new THREE.PlaneGeometry(1.4, 15.0, 1, 8);
    armGeo.rotateX(-Math.PI / 2);
    armGeo.translate(0, 0, 7.5); // Pivot at boat stern, extending backward (+Z)

    this.wakeLeftArm = new THREE.Mesh(armGeo, wakeRibbonMat);
    this.wakeLeftArm.position.set(-0.7, 0.06, 2.2);
    this.wakeLeftArm.rotation.y = -0.24;

    this.wakeRightArm = new THREE.Mesh(armGeo, wakeRibbonMat);
    this.wakeRightArm.position.set(0.7, 0.06, 2.2);
    this.wakeRightArm.rotation.y = 0.24;

    const washGeo = new THREE.PlaneGeometry(1.9, 13.0, 1, 8);
    washGeo.rotateX(-Math.PI / 2);
    washGeo.translate(0, 0, 6.5);
    this.wakePropWash = new THREE.Mesh(washGeo, wakeRibbonMat);
    this.wakePropWash.position.set(0, 0.05, 2.6);

    // Elliptical feathered hull waterline foam ring around the boat chine
    const ringTex = this.createHullFoamRingTexture();
    const ringGeo = new THREE.PlaneGeometry(4.0, 8.6);
    ringGeo.rotateX(-Math.PI / 2);
    this.hullFoamRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: ringTex,
        color: 0x9cf8ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.hullFoamRing.position.set(0, 0.04, 0.1);

    this.wakeGroup.add(this.wakeLeftArm, this.wakeRightArm, this.wakePropWash, this.hullFoamRing);
    this.scene.add(this.wakeGroup);

    // 4. 3D Hydro-Spray & Prop Wash Particle System
    const sprayCount = 160;
    const sprayPos = new Float32Array(sprayCount * 3);
    for (let i = 0; i < sprayCount; i++) {
      this.sprayParticles.push({
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
      });
      sprayPos[i * 3 + 1] = -10;
    }
    this.sprayGeo = new THREE.BufferGeometry();
    this.sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    this.sprayPoints = new THREE.Points(
      this.sprayGeo,
      new THREE.PointsMaterial({
        map: this.createSoftParticleTexture(),
        color: 0xdffcff,
        size: 0.58,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sprayPoints.frustumCulled = false;
    this.scene.add(this.sprayPoints);

    // 5. Weather Rain Particle System
    const rainCount = 1100;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 160;
      rainPositions[i * 3 + 1] = Math.random() * 55;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xa6f4ff,
      size: 0.28,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.scene.add(this.rainPoints);

    window.addEventListener('resize', () => {
      const nw = Math.max(1, container.clientWidth || window.innerWidth);
      const nh = Math.max(1, container.clientHeight || window.innerHeight);
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(nw, nh);
      this.composer.setSize(nw, nh);
    });
  }

  public cycleCameraMode(): CameraViewMode {
    const modes: CameraViewMode[] = [
      'chase_standard',
      'chase_close',
      'chase_tactical',
      'bow_action',
    ];
    const idx = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(idx + 1) % modes.length];
    return this.cameraMode;
  }

  public getCameraMode(): CameraViewMode {
    return this.cameraMode;
  }

  public triggerCameraShake(amount = 0.45): void {
    this.shakeIntensity = Math.min(1.2, this.shakeIntensity + amount);
  }

  public projectWorldToScreen(worldPos: { x: number; y: number; z: number }): ScreenProjectionResult {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(this.camera);

    const isBehind = vec.z > 1.0;
    let nx = vec.x;
    let ny = vec.y;
    if (isBehind) {
      nx = -nx;
      ny = -ny;
    }

    const isOnScreen = !isBehind && Math.abs(nx) <= 0.92 && Math.abs(ny) <= 0.88;
    const screenX = ((nx + 1) * 0.5) * w;
    const screenY = ((1 - ny) * 0.5) * h;

    return {
      x: screenX,
      y: screenY,
      isBehind,
      isOnScreen,
    };
  }

  public syncAtmosphere(atmosState: AtmosphereLightingState): void {
    this.scene.background = new THREE.Color(atmosState.skyColorHex);
    this.scene.fog = new THREE.FogExp2(atmosState.fogColorHex, atmosState.fogDensity * 0.82);
    this.sunLight.intensity = atmosState.sunIntensity;
    this.sunLight.color.setHex(atmosState.sunColorHex);
    this.ambientLight.intensity = atmosState.ambientIntensity;

    const u = this.skyMat.uniforms;
    if (atmosState.phase === 'morning_haze') {
      u.uTopColor.value.setHex(0x1b426b);
      u.uMidColor.value.setHex(0x4b7ea8);
      u.uHorizonColor.value.setHex(0xffcfa3);
      u.uSunDir.value.set(0.75, 0.24, -0.6).normalize();
    } else if (atmosState.phase === 'clear_afternoon') {
      u.uTopColor.value.setHex(0x124e8c);
      u.uMidColor.value.setHex(0x3888cc);
      u.uHorizonColor.value.setHex(0xb8e6ff);
      u.uSunDir.value.set(0.3, 0.78, -0.5).normalize();
    } else if (atmosState.phase === 'golden_hour') {
      u.uTopColor.value.setHex(0x0b132b);
      u.uMidColor.value.setHex(0x2d1e54);
      u.uHorizonColor.value.setHex(0xff773d);
      u.uSunDir.value.set(0.65, 0.14, -0.74).normalize();
    } else {
      u.uTopColor.value.setHex(0x040917);
      u.uMidColor.value.setHex(0x0d1f3d);
      u.uHorizonColor.value.setHex(0x163b68);
      u.uSunDir.value.set(-0.55, 0.38, -0.74).normalize();
    }

    const starMat = this.starPoints.material as THREE.PointsMaterial;
    starMat.opacity =
      atmosState.phase === 'neon_night'
        ? 0.88
        : atmosState.phase === 'golden_hour'
          ? 0.45
          : 0.0;
  }

  public updateWaterAndCamera(
    playerPos: { x: number; y: number; z: number },
    playerRot: { x: number; y: number; z: number; w: number },
    speedMps: number,
    time: number,
    weather: WeatherState,
    lightsOn: boolean,
    reducedMotion: { cameraBob: number; horizonRoll: number; fovKick: number; rainStreaks: boolean },
    orbitOffset: { x: number; y: number } = { x: 0, y: 0 },
    isDrifting = false,
  ): void {
    const snapX = Math.round(playerPos.x / 20) * 20;
    const snapZ = Math.round(playerPos.z / 20) * 20;
    this.waterMesh.position.set(snapX, 0, snapZ);
    this.waterGridHelper.position.set(snapX, 0.01, snapZ);
    this.skyDome.position.set(playerPos.x, 0, playerPos.z);
    this.starPoints.position.set(playerPos.x, 0, playerPos.z);
    this.horizonGroup.position.set(playerPos.x, 0, playerPos.z);

    // Scroll micro-ripple normal map UVs for realistic water shimmer
    this.waterNormalTex.offset.set(time * 0.035, time * 0.024);

    const posAttr = this.waterGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.waterGeo.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i) + snapX;
      const vz = posAttr.getZ(i) + snapZ;
      const distSq = (vx - playerPos.x) ** 2 + (vz - playerPos.z) ** 2;
      if (distSq < 260 * 260) {
        const sample = WaterField.sample(vx, vz, time, weather);
        posAttr.setY(i, sample.height);
        const crest = Math.max(0, Math.min(1, (sample.height + 0.32) * 0.98));
        const foam = Math.pow(crest, 3.0);
        colAttr.setXYZ(
          i,
          0.015 + crest * 0.06 + foam * 0.22,
          0.11 + crest * 0.20 + foam * 0.24,
          0.22 + crest * 0.26 + foam * 0.20,
        );
      } else {
        posAttr.setY(i, 0);
        colAttr.setXYZ(i, 0.015, 0.11, 0.22);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.waterGeo.computeVertexNormals();

    // Update feathered Kelvin V-wake & hull foam ring
    const quat = new THREE.Quaternion(playerRot.x, playerRot.y, playerRot.z, playerRot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const headingYaw = Math.atan2(-forward.x, -forward.z);
    const surfaceSample = WaterField.sample(playerPos.x, playerPos.z, time, weather);

    this.wakeGroup.position.set(playerPos.x, surfaceSample.height, playerPos.z);
    this.wakeGroup.rotation.y = headingYaw;

    const speedFactor = Math.max(0, Math.min(1, (speedMps - 0.6) / 22));
    const wakeMat = this.wakeLeftArm.material as THREE.MeshBasicMaterial;
    wakeMat.opacity = speedFactor * 0.78;

    const spreadAngle = (isDrifting ? 0.38 : 0.22) + speedFactor * 0.08;
    const lengthScale = 0.35 + speedFactor * 1.15;
    this.wakeLeftArm.rotation.y = -spreadAngle;
    this.wakeRightArm.rotation.y = spreadAngle;
    this.wakeLeftArm.scale.set(1 + speedFactor * 0.5, 1, lengthScale);
    this.wakeRightArm.scale.set(1 + speedFactor * 0.5, 1, lengthScale);
    this.wakePropWash.scale.set(1 + (isDrifting ? 0.6 : 0.2), 1, lengthScale * 0.92);

    const ringMat = this.hullFoamRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.28 + speedFactor * 0.42;

    // Update 3D Hydro-Spray particles when planing/drifting
    this.updateSprayParticles(1 / 60, playerPos, forward, right, surfaceSample.height, speedMps, isDrifting);

    // Update player spotlight & under-glow
    this.playerSpotLight.visible = lightsOn;
    this.playerSpotLight.position.set(playerPos.x, playerPos.y + 2.1, playerPos.z);
    this.playerSpotLight.target.position.set(
      playerPos.x + forward.x * 42,
      playerPos.y - 0.5,
      playerPos.z + forward.z * 42,
    );
    this.playerUnderGlow.position.set(playerPos.x, playerPos.y + 0.8, playerPos.z);

    // Update rain streaks
    const rainMat = this.rainPoints.material as THREE.PointsMaterial;
    const showRain = (weather === 'rain' || weather === 'storm') && reducedMotion.rainStreaks;
    rainMat.opacity = showRain ? (weather === 'storm' ? 0.72 : 0.48) : 0.0;
    if (showRain) {
      const rPos = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rPos.count; i++) {
        let ry = rPos.getY(i) - (weather === 'storm' ? 1.4 : 0.95);
        if (ry < 0) ry = 55;
        rPos.setY(i, ry);
      }
      rPos.needsUpdate = true;
    }
    this.rainPoints.position.set(playerPos.x, 0, playerPos.z);

    // Camera framing according to selected preset + pointer orbit
    const bobOffset = Math.sin(time * 2.8) * 0.12 * reducedMotion.cameraBob;
    let presetDist = 11.8 + Math.min(3.0, speedMps * 0.06);
    let presetHeight = 4.4 + bobOffset;
    let lookAhead = 7.5;

    if (this.cameraMode === 'chase_close') {
      presetDist = 8.4 + Math.min(2.0, speedMps * 0.04);
      presetHeight = 3.1 + bobOffset;
      lookAhead = 9.0;
    } else if (this.cameraMode === 'chase_tactical') {
      presetDist = 17.5 + Math.min(3.5, speedMps * 0.07);
      presetHeight = 8.2 + bobOffset;
      lookAhead = 6.0;
    } else if (this.cameraMode === 'bow_action') {
      presetDist = -6.8;
      presetHeight = 2.8 + bobOffset;
      lookAhead = -2.0;
    }

    const totalYaw = headingYaw + orbitOffset.x;
    const camDirX = -Math.sin(totalYaw);
    const camDirZ = -Math.cos(totalYaw);

    this.shakeIntensity *= 0.88;
    const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
    const shakeY = (Math.random() - 0.5) * this.shakeIntensity * 0.7;

    const targetCamPos = new THREE.Vector3(
      playerPos.x - camDirX * presetDist + shakeX,
      Math.max(surfaceSample.height + 1.4, playerPos.y + presetHeight + orbitOffset.y * 6.0 + shakeY),
      playerPos.z - camDirZ * presetDist,
    );
    this.camera.position.lerp(targetCamPos, 0.18);
    this.camera.lookAt(
      playerPos.x + forward.x * lookAhead,
      playerPos.y + 1.15 + bobOffset * 0.35,
      playerPos.z + forward.z * lookAhead,
    );

    const targetFov = 60 + Math.min(11, speedMps * 0.24) * reducedMotion.fovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
      this.camera.updateProjectionMatrix();
    }
  }

  public renderFrame(frameDeltaMs: number): RendererPerformanceMetrics {
    this.composer.render();
    this.frameTimes.push(frameDeltaMs);
    if (this.frameTimes.length > 120) {
      this.frameTimes.shift();
    }

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95FrameTimeMs = sorted[p95Idx] ?? frameDeltaMs;
    const avgMs =
      this.frameTimes.reduce((acc, v) => acc + v, 0) / Math.max(1, this.frameTimes.length);

    return {
      fps: Math.round(1000 / Math.max(1, avgMs)),
      frameTimeMs: Number(frameDeltaMs.toFixed(2)),
      p95FrameTimeMs: Number(p95FrameTimeMs.toFixed(2)),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  private updateSprayParticles(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    forward: THREE.Vector3,
    right: THREE.Vector3,
    waterY: number,
    speedMps: number,
    isDrifting: boolean,
  ): void {
    const attr = this.sprayGeo.attributes.position as THREE.BufferAttribute;
    const spawnActive = speedMps > 1.8;

    for (let i = 0; i < this.sprayParticles.length; i++) {
      const p = this.sprayParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (spawnActive && Math.random() < Math.min(0.95, speedMps * 0.045)) {
          const isBowChine = i % 3 !== 0;
          const side = i % 2 === 0 ? 1 : -1;
          const longOffset = isBowChine ? (Math.random() - 0.2) * 2.2 : -3.1 - Math.random() * 1.2;
          const latOffset = isBowChine ? side * (1.05 + Math.random() * 0.25) : (Math.random() - 0.5) * 0.9;

          p.x = playerPos.x + forward.x * longOffset + right.x * latOffset;
          p.y = waterY + 0.18;
          p.z = playerPos.z + forward.z * longOffset + right.z * latOffset;

          const outSpeed = (isBowChine ? 2.2 : 1.1) + speedMps * (isDrifting ? 0.22 : 0.12);
          p.vx = right.x * side * outSpeed - forward.x * (speedMps * 0.35);
          p.vy = 1.6 + Math.random() * 2.2 + speedMps * 0.06;
          p.vz = right.z * side * outSpeed - forward.z * (speedMps * 0.35);
          p.maxLife = 0.28 + Math.random() * 0.32;
          p.life = p.maxLife;
        } else {
          p.y = -20;
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 9.8 * dt;
        if (p.y < waterY) p.y = waterY + 0.05;
      }
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  }

  private createWaterNormalTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const dx =
          Math.cos(u * 4 + v * 2) * 0.35 +
          Math.sin(u * 9 - v * 7) * 0.25 +
          Math.cos(u * 15 + v * 13) * 0.15;
        const dy =
          Math.sin(v * 5 - u * 3) * 0.35 +
          Math.cos(v * 8 + u * 6) * 0.25 +
          Math.sin(v * 16 - u * 11) * 0.15;

        const idx = (y * size + x) * 4;
        data[idx] = Math.floor(128 + dx * 95);
        data[idx + 1] = Math.floor(128 + dy * 95);
        data[idx + 2] = 245;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(46, 46);
    return tex;
  }

  private createFeatheredWakeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 256);

    for (let y = 0; y < 256; y++) {
      const v = y / 255;
      const longFade = Math.sin(Math.pow(v, 0.45) * Math.PI);
      const grad = ctx.createLinearGradient(0, y, 128, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.32, `rgba(160,248,255,${(longFade * 0.45).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(235,255,255,${(longFade * 0.92).toFixed(3)})`);
      grad.addColorStop(0.68, `rgba(160,248,255,${(longFade * 0.45).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 128, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private createHullFoamRingTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 256);

    ctx.save();
    ctx.translate(64, 128);
    ctx.scale(1, 2.0);
    const grad = ctx.createRadialGradient(0, 0, 26, 0, 0, 58);
    grad.addColorStop(0, 'rgba(0, 242, 255, 0.0)');
    grad.addColorStop(0.55, 'rgba(180, 252, 255, 0.65)');
    grad.addColorStop(0.78, 'rgba(0, 242, 255, 0.35)');
    grad.addColorStop(1, 'rgba(0, 242, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private createSoftParticleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(180, 250, 255, 0.65)');
    grad.addColorStop(1, 'rgba(0, 242, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  private buildDistantSkylineRing(): THREE.Group {
    const group = new THREE.Group();
    const towerMat = new THREE.MeshBasicMaterial({ color: 0x09152b });
    const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });
    const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff1e8e });
    const neonAmberMat = new THREE.MeshBasicMaterial({ color: 0xffae00 });

    const count = 56;
    const radius = 1950;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const h = 55 + ((i * 37) % 115);
      const w = 36 + ((i * 19) % 42);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
      tower.position.set(x, h * 0.5 - 2, z);
      tower.lookAt(0, h * 0.5, 0);

      const stripMat = i % 3 === 0 ? neonCyanMat : i % 3 === 1 ? neonPinkMat : neonAmberMat;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 2.8, w * 0.86), stripMat);
      crown.position.y = h * 0.46;
      tower.add(crown);

      group.add(tower);
    }
    return group;
  }
}
