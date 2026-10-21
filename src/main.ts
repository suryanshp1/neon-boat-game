import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { BOAT_ARCHETYPES, BoatId } from './entities/BoatArchetypes';
import { BoatDynamics } from './physics/BoatDynamics';
import { InputManager } from './input/InputManager';
import { RenderManager } from './rendering/RenderManager';
import { LANDMARKS, isUnderBridgeOrCover } from './world/DistrictDefinitions';
import { StreamedCell, WorldStreamer } from './world/WorldStreamer';
import { AtmosphereSystem } from './world/AtmosphereSystem';
import { TrafficManager } from './ai/TrafficManager';
import { EnforcementSystem } from './ai/EnforcementSystem';
import { StealthSystem } from './gameplay/StealthSystem';
import { TelemetryTracker } from './telemetry/TelemetryTracker';
import { EconomyManager } from './gameplay/EconomyManager';
import { MissionManager } from './gameplay/MissionManager';
import { AudioEngine } from './audio/AudioEngine';
import { HudController } from './ui/HudController';

async function bootNeonTides(): Promise<void> {
  const telemetry = new TelemetryTracker();
  telemetry.track('client_boot', { timestamp: Date.now() });

  await RAPIER.init();
  const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const viewportEl = document.getElementById('viewport-container')!;
  const hudRootEl = document.getElementById('hud-root')!;

  const renderManager = new RenderManager(viewportEl);
  const inputManager = new InputManager(window);
  const atmosphere = new AtmosphereSystem();
  const traffic = new TrafficManager();
  const enforcement = new EnforcementSystem();
  const economy = new EconomyManager(telemetry);
  const missions = new MissionManager(economy, telemetry);
  const audio = new AudioEngine();

  // Preload all 10 Blender-MCP GLB models
  const gltfLoader = new GLTFLoader();
  const modelTemplates = new Map<string, THREE.Group>();
  const assetIds = [
    'boat_skiff',
    'boat_speedboat',
    'boat_workboat',
    'traffic_ferry',
    'police_interceptor',
    'building_akari_neon',
    'crane_kogyo',
    'torii_gate',
    'bridge_span',
    'buoy_marker',
  ];

  await Promise.all(
    assetIds.map(async (id) => {
      try {
        const gltf = await gltfLoader.loadAsync(`/assets/models/${id}.glb`);
        modelTemplates.set(id, gltf.scene);
      } catch {
        // Fallback procedural mesh if asset fetch fails
        const fallback = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(3, 2, 6),
          new THREE.MeshStandardMaterial({ color: 0x00f2ff }),
        );
        fallback.add(box);
        modelTemplates.set(id, fallback);
      }
    }),
  );

  const cloneModel = (assetId: string): THREE.Group => {
    const tpl = modelTemplates.get(assetId);
    return tpl ? (tpl.clone(true) as THREE.Group) : new THREE.Group();
  };

  // Player boat entity
  let playerBoatSpec = BOAT_ARCHETYPES.kuro_skiff;
  const boatDynamics = new BoatDynamics(physicsWorld, playerBoatSpec, { x: -60, y: 0.8, z: -60 });
  let playerMeshGroup = cloneModel(playerBoatSpec.assetId);
  renderManager.scene.add(playerMeshGroup);

  // Place permanent hero landmarks
  for (const lm of LANDMARKS) {
    const obj = cloneModel(lm.assetId);
    obj.position.set(lm.position.x, lm.position.y, lm.position.z);
    obj.rotation.y = lm.rotationY;
    obj.scale.setScalar(lm.scale);
    renderManager.scene.add(obj);
  }

  // Mission objective beacon ring + glowing sea surface marker
  const beaconGroup = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(13, 0.55, 12, 48);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffae00,
    transparent: true,
    opacity: 0.92,
  });
  const baseRingMesh = new THREE.Mesh(ringGeo, ringMat);
  baseRingMesh.position.y = 0.5;
  beaconGroup.add(baseRingMesh);

  const upperRingMesh = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.35, 10, 36).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.8 }),
  );
  upperRingMesh.position.y = 6.5;
  beaconGroup.add(upperRingMesh);

  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.45, 36, 12, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0xffae00,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
  pillarMesh.position.y = 18;
  beaconGroup.add(pillarMesh);

  const missionBeaconMesh = beaconGroup;
  missionBeaconMesh.visible = false;
  renderManager.scene.add(missionBeaconMesh);

  // Traffic & Patrol visual meshes
  const trafficMeshes = new Map<string, THREE.Group>();
  for (const v of traffic.getVessels()) {
    const m = cloneModel(v.assetId);
    renderManager.scene.add(m);
    trafficMeshes.set(v.id, m);
  }

  const patrolMeshes = new Map<string, THREE.Group>();
  for (const p of enforcement.getPatrols()) {
    const m = cloneModel('police_interceptor');
    renderManager.scene.add(m);
    patrolMeshes.set(p.id, m);
  }

  // Streamed cell meshes & explicit disposal on cell unload
  const cellGroups = new Map<string, THREE.Group>();
  const streamer = new WorldStreamer({
    onCellLoad: (cell: StreamedCell) => {
      const group = new THREE.Group();
      for (const st of cell.structures) {
        const inst = cloneModel(st.assetId);
        inst.position.set(st.x, st.y, st.z);
        inst.rotation.y = st.rotationY;
        inst.scale.setScalar(st.scale);
        group.add(inst);
      }
      renderManager.scene.add(group);
      cellGroups.set(cell.key, group);
    },
    onCellUnload: (cell: StreamedCell) => {
      const group = cellGroups.get(cell.key);
      if (group) {
        renderManager.scene.remove(group);
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry?.dispose();
          }
        });
        cellGroups.delete(cell.key);
      }
    },
  });

  let lightsOn = true;

  const hud = new HudController(hudRootEl, economy, missions, telemetry, {
    onSelectBoat: (boatId: BoatId) => {
      playerBoatSpec = BOAT_ARCHETYPES[boatId];
      boatDynamics.setSpecAndModifiers(playerBoatSpec, economy.getBoatModifiers(boatId));
      renderManager.scene.remove(playerMeshGroup);
      playerMeshGroup = cloneModel(playerBoatSpec.assetId);
      renderManager.scene.add(playerMeshGroup);
      audio.playChime(780);
    },
    onChangeWeather: (w) => {
      atmosphere.setWeather(w);
      audio.playChime(520);
    },
    onCycleTime: () => {
      atmosphere.cycleTimePhase();
      audio.playChime(600);
    },
    onToggleLights: () => {
      lightsOn = !lightsOn;
      audio.playChime(lightsOn ? 640 : 420);
    },
    onRepairBoat: () => {
      if (economy.spendCredits(150, 'hull_repair')) {
        boatDynamics.repairFull();
        audio.playChime(880);
      }
    },
    onTriggerTouch: (throttle, steer, boost, drift) => {
      inputManager.setTouchControl(throttle, steer, boost, drift);
    },
  });

  // Start initial starter contract automatically so the player has an immediate 3-minute goal
  missions.startMission('mirai_courier_01');

  window.addEventListener(
    'pointerdown',
    () => {
      audio.initOnUserGesture();
    },
    { once: true },
  );
  window.addEventListener(
    'keydown',
    () => {
      audio.initOnUserGesture();
    },
    { once: true },
  );

  // Fixed 60Hz simulation loop
  const FIXED_DT = 1 / 60;
  let accumulator = 0;
  let simTime = 0;
  let lastFrameTime = performance.now();
  let loggedFirstFrame = false;
  let lastDistrict = 'mirai_harbour';

  const tick = (now: number) => {
    const frameDeltaMs = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;
    accumulator += frameDeltaMs / 1000;

    const input = inputManager.poll();
    if (input.lightsTogglePressed) lightsOn = !lightsOn;
    if (input.mapTogglePressed) hud.toggleContractsDrawer();
    if (input.diagnosticsTogglePressed) hud.toggleDiagnostics();

    telemetry.markFirstControlIfNeeded(Math.abs(input.throttle) > 0.05 || Math.abs(input.steer) > 0.05);

    let boatState = boatDynamics.getState();

    while (accumulator >= FIXED_DT) {
      simTime += FIXED_DT;
      boatState = boatDynamics.step(FIXED_DT, input, simTime, atmosphere.getWeather());
      physicsWorld.step();
      traffic.update(FIXED_DT, { x: boatState.position.x, z: boatState.position.z });
      accumulator -= FIXED_DT;
    }

    const atmosState = atmosphere.update(frameDeltaMs / 1000);
    renderManager.scene.background = new THREE.Color(atmosState.skyColorHex);
    renderManager.scene.fog = new THREE.FogExp2(atmosState.fogColorHex, atmosState.fogDensity);
    renderManager.sunLight.intensity = atmosState.sunIntensity;
    renderManager.sunLight.color.setHex(atmosState.sunColorHex);
    renderManager.ambientLight.intensity = atmosState.ambientIntensity;

    streamer.update(
      { x: boatState.position.x, z: boatState.position.z },
      { x: boatState.velocity.x, z: boatState.velocity.z },
    );
    const worldStats = streamer.getStats();
    if (worldStats.currentDistrict !== lastDistrict) {
      lastDistrict = worldStats.currentDistrict;
      telemetry.track('district_enter', { district: lastDistrict });
    }

    const underBridge = isUnderBridgeOrCover(boatState.position.x, boatState.position.z);
    const nearTraffic = traffic.isNearAnyTraffic({
      x: boatState.position.x,
      z: boatState.position.z,
    });
    const boatMods = economy.getBoatModifiers(economy.getActiveBoat());
    const signature = StealthSystem.computeSignature({
      lightsOn,
      throttle: input.throttle,
      weather: atmosState.weather,
      underBridge,
      nearTraffic,
      exhaustNoiseMultiplier: playerBoatSpec.baseSignatureNoise * boatMods.noiseMultiplier,
    });

    const prevStage = enforcement.getHeatState().stage;
    const heatState = enforcement.update(
      frameDeltaMs / 1000,
      { x: boatState.position.x, z: boatState.position.z },
      signature,
    );
    if (heatState.stage !== prevStage) {
      telemetry.track('heat_change', { from: prevStage, to: heatState.stage });
      if (heatState.stage === 'Clear') {
        telemetry.track('pursuit_escape', {});
      }
    }

    const activeMission = missions.update(
      frameDeltaMs / 1000,
      { x: boatState.position.x, z: boatState.position.z },
      signature,
      heatState.stage,
    );

    if (activeMission) {
      missionBeaconMesh.visible = true;
      missionBeaconMesh.position.set(
        activeMission.currentStage.targetPos.x,
        0,
        activeMission.currentStage.targetPos.z,
      );
      missionBeaconMesh.rotation.y = simTime * 1.2;
    } else {
      missionBeaconMesh.visible = false;
    }

    // Sync player mesh
    playerMeshGroup.position.set(boatState.position.x, boatState.position.y, boatState.position.z);
    playerMeshGroup.quaternion.set(
      boatState.rotation.x,
      boatState.rotation.y,
      boatState.rotation.z,
      boatState.rotation.w,
    );

    // Sync traffic meshes
    for (const v of traffic.getVessels()) {
      const m = trafficMeshes.get(v.id);
      if (m) {
        m.position.set(v.position.x, v.position.y, v.position.z);
        m.rotation.y = v.headingRad;
      }
    }

    // Sync patrol meshes
    for (const p of enforcement.getPatrols()) {
      const m = patrolMeshes.get(p.id);
      if (m) {
        m.position.set(p.position.x, p.position.y, p.position.z);
        m.rotation.y = p.headingRad;
      }
    }

    renderManager.updateWaterAndCamera(
      boatState.position,
      boatState.rotation,
      boatState.speedMps,
      simTime,
      atmosState.weather,
      lightsOn,
      hud.accessibility,
    );

    const perfMetrics = renderManager.renderFrame(frameDeltaMs);
    if (!loggedFirstFrame) {
      loggedFirstFrame = true;
      telemetry.track('first_frame', { fps: perfMetrics.fps });
    }

    audio.update(boatState.speedMps, input.throttle, heatState.stage !== 'Clear', simTime);

    hud.update(
      boatState,
      heatState,
      signature,
      underBridge,
      lightsOn,
      worldStats,
      atmosState,
      perfMetrics,
      enforcement.getPatrols(),
      traffic.getVessels(),
    );

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

bootNeonTides().catch((err) => {
  console.error('Failed to boot Neon Tides:', err);
});
