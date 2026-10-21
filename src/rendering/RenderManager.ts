import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WaterField, WeatherState } from '../core/WaterField';

export interface RendererPerformanceMetrics {
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export class RenderManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly rimLight: THREE.DirectionalLight;
  public readonly ambientLight: THREE.HemisphereLight;
  public readonly playerSpotLight: THREE.SpotLight;
  public readonly playerUnderGlow: THREE.PointLight;
  private waterMesh: THREE.Mesh;
  private waterGeo: THREE.PlaneGeometry;
  private waterGridHelper: THREE.GridHelper;
  private wakeTrailMesh: THREE.Mesh;
  private rainPoints: THREE.Points;
  private frameTimes: number[] = [];

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x162442);
    this.scene.fog = new THREE.FogExp2(0x1b2c4f, 0.00042);

    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.5,
      2800,
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Crucial for metallic PBR materials and reflective water in Three.js!
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 1.15;

    this.ambientLight = new THREE.HemisphereLight(0x6bb8ff, 0x182b49, 1.65);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xff9d5c, 1.85);
    this.sunLight.position.set(180, 260, -160);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sunLight);

    // Cool neon-cyan rim light from opposite horizon so silhouettes & boat decks always read clearly
    this.rimLight = new THREE.DirectionalLight(0x00e5ff, 0.95);
    this.rimLight.position.set(-160, 140, 180);
    this.scene.add(this.rimLight);

    this.playerSpotLight = new THREE.SpotLight(0xdafbff, 6.5, 130, Math.PI / 4.2, 0.4, 1.0);
    this.playerSpotLight.castShadow = false;
    this.scene.add(this.playerSpotLight);
    this.scene.add(this.playerSpotLight.target);

    // Neon cyan under-hull glow so the player vessel and surrounding waves are unmistakably visible
    this.playerUnderGlow = new THREE.PointLight(0x00f2ff, 4.5, 28, 1.2);
    this.scene.add(this.playerUnderGlow);

    // Analytic dynamic water surface mesh with vertex crest highlights
    this.waterGeo = new THREE.PlaneGeometry(1600, 1600, 112, 112);
    this.waterGeo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(this.waterGeo.attributes.position.count * 3);
    for (let i = 0; i < this.waterGeo.attributes.position.count; i++) {
      colors[i * 3] = 0.06;
      colors[i * 3 + 1] = 0.38;
      colors[i * 3 + 2] = 0.58;
    }
    this.waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.18,
      metalness: 0.55,
      emissive: 0x072c47,
      emissiveIntensity: 0.55,
      flatShading: false,
    });
    this.waterMesh = new THREE.Mesh(this.waterGeo, waterMat);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // Subtle cyber-nautical sonar grid just at the waterline for speed sense
    this.waterGridHelper = new THREE.GridHelper(1200, 120, 0x00f2ff, 0x0b4f6c);
    this.waterGridHelper.position.y = 0.02;
    const gridMat = this.waterGridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.16;
    this.scene.add(this.waterGridHelper);

    // Dual V-shaped wake foam trail behind player boat
    const wakeGeo = new THREE.PlaneGeometry(4.2, 18, 4, 12);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xaef9ff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    this.wakeTrailMesh = new THREE.Mesh(wakeGeo, wakeMat);
    this.scene.add(this.wakeTrailMesh);

    // Rain particle system
    const rainCount = 950;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 150;
      rainPositions[i * 3 + 1] = Math.random() * 55;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x9cf0ff,
      size: 0.26,
      transparent: true,
      opacity: 0.0,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.scene.add(this.rainPoints);

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  public updateWaterAndCamera(
    playerPos: { x: number; y: number; z: number },
    playerRot: { x: number; y: number; z: number; w: number },
    speedMps: number,
    time: number,
    weather: WeatherState,
    lightsOn: boolean,
    reducedMotion: { cameraBob: number; horizonRoll: number; fovKick: number; rainStreaks: boolean },
  ): void {
    const snapX = Math.round(playerPos.x / 20) * 20;
    const snapZ = Math.round(playerPos.z / 20) * 20;
    this.waterMesh.position.set(snapX, 0, snapZ);
    this.waterGridHelper.position.set(snapX, 0.02, snapZ);

    const posAttr = this.waterGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.waterGeo.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i) + snapX;
      const vz = posAttr.getZ(i) + snapZ;
      const distSq = (vx - playerPos.x) ** 2 + (vz - playerPos.z) ** 2;
      if (distSq < 250 * 250) {
        const sample = WaterField.sample(vx, vz, time, weather);
        posAttr.setY(i, sample.height);
        // Crest foam highlight color based on wave height
        const crest = Math.max(0, Math.min(1, (sample.height + 0.35) * 0.95));
        colAttr.setXYZ(
          i,
          0.05 + crest * 0.25,
          0.32 + crest * 0.45,
          0.54 + crest * 0.38,
        );
      } else {
        posAttr.setY(i, 0);
        colAttr.setXYZ(i, 0.05, 0.32, 0.54);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.waterGeo.computeVertexNormals();

    // Update wake trail behind player
    const quat = new THREE.Quaternion(playerRot.x, playerRot.y, playerRot.z, playerRot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    this.wakeTrailMesh.position.set(
      playerPos.x - forward.x * 7.2,
      0.12,
      playerPos.z - forward.z * 7.2,
    );
    this.wakeTrailMesh.rotation.y = Math.atan2(-forward.x, -forward.z);
    const wakeMat = this.wakeTrailMesh.material as THREE.MeshBasicMaterial;
    wakeMat.opacity = Math.max(0.18, Math.min(0.75, speedMps * 0.026));

    // Update player spotlight & under-glow
    this.playerSpotLight.visible = lightsOn;
    this.playerSpotLight.position.set(playerPos.x, playerPos.y + 1.8, playerPos.z);
    this.playerSpotLight.target.position.set(
      playerPos.x + forward.x * 38,
      playerPos.y - 0.4,
      playerPos.z + forward.z * 38,
    );
    this.playerUnderGlow.position.set(playerPos.x, playerPos.y + 0.6, playerPos.z);

    // Update rain particles
    const rainMat = this.rainPoints.material as THREE.PointsMaterial;
    const showRain = (weather === 'rain' || weather === 'storm') && reducedMotion.rainStreaks;
    rainMat.opacity = showRain ? (weather === 'storm' ? 0.68 : 0.45) : 0.0;
    this.rainPoints.position.set(playerPos.x, 0, playerPos.z);

    // Elevated chase camera so player boat, wake, and ahead channel are all clearly framed
    const bobOffset = Math.sin(time * 3.0) * 0.15 * reducedMotion.cameraBob;
    const camDistance = 13.5 + Math.min(3.5, speedMps * 0.07);
    const camHeight = 5.6 + bobOffset;
    const targetCamPos = new THREE.Vector3(
      playerPos.x - forward.x * camDistance,
      playerPos.y + camHeight,
      playerPos.z - forward.z * camDistance,
    );
    this.camera.position.lerp(targetCamPos, 0.16);
    this.camera.lookAt(
      playerPos.x + forward.x * 8,
      playerPos.y + 1.0 + bobOffset * 0.4,
      playerPos.z + forward.z * 8,
    );

    const targetFov = 62 + Math.min(11, speedMps * 0.25) * reducedMotion.fovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
      this.camera.updateProjectionMatrix();
    }
  }

  public renderFrame(frameDeltaMs: number): RendererPerformanceMetrics {
    this.renderer.render(this.scene, this.camera);
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
}
