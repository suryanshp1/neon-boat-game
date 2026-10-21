import * as THREE from 'three';
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
  public readonly ambientLight: THREE.HemisphereLight;
  public readonly playerSpotLight: THREE.SpotLight;
  private waterMesh: THREE.Mesh;
  private waterGeo: THREE.PlaneGeometry;
  private wakeTrailMesh: THREE.Mesh;
  private rainPoints: THREE.Points;
  private frameTimes: number[] = [];

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060b16);
    this.scene.fog = new THREE.FogExp2(0x060b16, 0.00085);

    this.camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.5,
      2600,
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.HemisphereLight(0x245682, 0x090d16, 0.85);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffb478, 1.4);
    this.sunLight.position.set(160, 220, 120);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sunLight);

    this.playerSpotLight = new THREE.SpotLight(0xcff9ff, 3.2, 85, Math.PI / 5.5, 0.45, 1.2);
    this.playerSpotLight.castShadow = false;
    this.scene.add(this.playerSpotLight);
    this.scene.add(this.playerSpotLight.target);

    // Analytic dynamic water surface mesh
    this.waterGeo = new THREE.PlaneGeometry(1400, 1400, 96, 96);
    this.waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x07263b,
      roughness: 0.16,
      metalness: 0.78,
      emissive: 0x02121f,
      emissiveIntensity: 0.45,
      flatShading: false,
    });
    this.waterMesh = new THREE.Mesh(this.waterGeo, waterMat);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);

    // Wake foam trail behind player boat
    const wakeGeo = new THREE.PlaneGeometry(3.2, 16, 4, 12);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0x9cf6ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });
    this.wakeTrailMesh = new THREE.Mesh(wakeGeo, wakeMat);
    this.scene.add(this.wakeTrailMesh);

    // Rain particle system
    const rainCount = 900;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 140;
      rainPositions[i * 3 + 1] = Math.random() * 55;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x8de9ff,
      size: 0.25,
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
    // Recenter water plane around player on coarse grid step
    const snapX = Math.round(playerPos.x / 20) * 20;
    const snapZ = Math.round(playerPos.z / 20) * 20;
    this.waterMesh.position.set(snapX, 0, snapZ);

    const posAttr = this.waterGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i) + snapX;
      const vz = posAttr.getZ(i) + snapZ;
      const distSq = (vx - playerPos.x) ** 2 + (vz - playerPos.z) ** 2;
      if (distSq < 220 * 220) {
        const sample = WaterField.sample(vx, vz, time, weather);
        posAttr.setY(i, sample.height);
      } else {
        posAttr.setY(i, 0);
      }
    }
    posAttr.needsUpdate = true;
    this.waterGeo.computeVertexNormals();

    // Update wake trail behind player
    const quat = new THREE.Quaternion(playerRot.x, playerRot.y, playerRot.z, playerRot.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    this.wakeTrailMesh.position.set(
      playerPos.x - forward.x * 7.5,
      0.08,
      playerPos.z - forward.z * 7.5,
    );
    this.wakeTrailMesh.rotation.y = Math.atan2(-forward.x, -forward.z);
    const wakeMat = this.wakeTrailMesh.material as THREE.MeshBasicMaterial;
    wakeMat.opacity = Math.min(0.62, speedMps * 0.022);

    // Update player spotlight
    this.playerSpotLight.visible = lightsOn;
    this.playerSpotLight.position.set(playerPos.x, playerPos.y + 1.4, playerPos.z);
    this.playerSpotLight.target.position.set(
      playerPos.x + forward.x * 32,
      playerPos.y - 0.5,
      playerPos.z + forward.z * 32,
    );

    // Update rain particles
    const rainMat = this.rainPoints.material as THREE.PointsMaterial;
    const showRain = (weather === 'rain' || weather === 'storm') && reducedMotion.rainStreaks;
    rainMat.opacity = showRain ? (weather === 'storm' ? 0.65 : 0.42) : 0.0;
    this.rainPoints.position.set(playerPos.x, 0, playerPos.z);

    // Chase camera with reduced-motion accessibility controls
    const bobOffset = Math.sin(time * 3.2) * 0.18 * reducedMotion.cameraBob;
    const camDistance = 14.5 + Math.min(4.0, speedMps * 0.08);
    const camHeight = 4.8 + bobOffset;
    const targetCamPos = new THREE.Vector3(
      playerPos.x - forward.x * camDistance,
      playerPos.y + camHeight,
      playerPos.z - forward.z * camDistance,
    );
    this.camera.position.lerp(targetCamPos, 0.14);
    this.camera.lookAt(
      playerPos.x + forward.x * 10,
      playerPos.y + 1.2 + bobOffset * 0.5,
      playerPos.z + forward.z * 10,
    );

    const targetFov = 62 + Math.min(12, speedMps * 0.28) * reducedMotion.fovKick;
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
