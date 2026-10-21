import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { BOAT_ARCHETYPES, BoatId, BoatSpec } from './entities/BoatArchetypes';
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
import { WaterField, WeatherState } from './core/WaterField';
import { t } from './i18n/locales';

interface HeroBoatVfxHandles {
  headlightBeamGroup: THREE.Group;
  thrusterLeft: THREE.Mesh;
  thrusterRight: THREE.Mesh;
  radarSpinner: THREE.Mesh;
}

function attachHeroBoatVfx(boatGroup: THREE.Group, spec: BoatSpec): HeroBoatVfxHandles {
  const halfW = spec.width * 0.5;
  const halfL = spec.length * 0.5;

  // 1. Bow navigation spotlight lamphousing (uses real SpotLight for water illumination without geometric artifacts)
  const headlightBeamGroup = new THREE.Group();
  boatGroup.add(headlightBeamGroup);

  // 2. Twin stern hydro-jet plasma thruster plumes
  const plumeGeo = new THREE.ConeGeometry(0.28, 2.4, 14);
  plumeGeo.rotateX(Math.PI / 2);
  plumeGeo.translate(0, 0, 1.2);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: spec.accentColorHex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const thrusterLeft = new THREE.Mesh(plumeGeo, plumeMat);
  thrusterLeft.position.set(-halfW * 0.24, 0.36, halfL * 0.98);
  const thrusterRight = new THREE.Mesh(plumeGeo, plumeMat);
  thrusterRight.position.set(halfW * 0.24, 0.36, halfL * 0.98);
  boatGroup.add(thrusterLeft, thrusterRight);

  // 3. Port (red) & Starboard (emerald) maritime navigation lights + spinning radar bar
  const portLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2a3c }),
  );
  portLight.position.set(-halfW * 0.96, 0.92, -halfL * 0.15);

  const starboardLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x00e676 }),
  );
  starboardLight.position.set(halfW * 0.96, 0.92, -halfL * 0.15);

  const radarSpinner = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.08, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff }),
  );
  radarSpinner.position.set(0, spec.height * 1.36, halfL * 0.26);

  boatGroup.add(portLight, starboardLight, radarSpinner);

  return {
    headlightBeamGroup,
    thrusterLeft,
    thrusterRight,
    radarSpinner,
  };
}

function buildMiraiHomeMarinaPier(): THREE.Group {
  const marina = new THREE.Group();
  marina.position.set(-72, 0, -60);

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x1e2c42,
    roughness: 0.45,
    metalness: 0.35,
  });
  const woodDeckMat = new THREE.MeshStandardMaterial({
    color: 0x3b2d26,
    roughness: 0.55,
    metalness: 0.15,
  });
  const cyanNeonMat = new THREE.MeshStandardMaterial({
    color: 0x00f2ff,
    emissive: 0x00f2ff,
    emissiveIntensity: 2.8,
  });
  const amberNeonMat = new THREE.MeshStandardMaterial({
    color: 0xffae00,
    emissive: 0xffae00,
    emissiveIntensity: 2.6,
  });

  // Main floating pier promenade parallel to player spawn
  const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.2, 34), concreteMat);
  mainDeck.position.set(0, 0.4, 0);
  mainDeck.receiveShadow = true;
  marina.add(mainDeck);

  const timberTop = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.15, 33.2), woodDeckMat);
  timberTop.position.set(0, 1.05, 0);
  marina.add(timberTop);

  // Glowing cyan safety edge strip facing the berth
  const berthStrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 34), cyanNeonMat);
  berthStrip.position.set(3.25, 1.05, 0);
  marina.add(berthStrip);

  // Illuminated mooring bollards along the dock edge
  for (const bz of [-14, -7, 0, 7, 14]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 12), concreteMat);
    bollard.position.set(2.8, 1.45, bz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12), amberNeonMat);
    cap.position.set(2.8, 1.95, bz);
    marina.add(bollard, cap);
  }

  // Overhead Japanese Cyber-Marina Portal Arch
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.8, 0.6), concreteMat);
  pillarL.position.set(-2.6, 3.8, -12);
  const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.8, 0.6), concreteMat);
  pillarR.position.set(2.6, 3.8, -12);
  const signHeader = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 0.7), cyanNeonMat);
  signHeader.position.set(0, 7.1, -12);
  marina.add(pillarL, pillarR, signHeader);

  return marina;
}

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
  const audio = new AudioEngine();

  let hud!: HudController;

  const missions = new MissionManager(economy, telemetry, {
    onStageComplete: (mission, stageIdx) => {
      audio.playChime(740);
      if (stageIdx + 1 < mission.stages.length) {
        const nextStage = mission.stages[stageIdx + 1];
        hud?.showToast(
          `CHECKPOINT CLEARED (${stageIdx + 1}/${mission.stages.length})`,
          `NEXT: ${t(nextStage.labelKey)}`,
          'cyan',
        );
      }
    },
    onMissionComplete: (mission) => {
      audio.playChime(960);
      hud?.showToast(
        `CONTRACT COMPLETE: ${t(mission.titleKey)}`,
        `REWARD CREDITED: +¥${mission.rewardCredits} • +${mission.rewardReputation} REP`,
        'emerald',
      );
    },
    onMissionFail: (mission) => {
      audio.playChime(310);
      hud?.showToast(
        `CONTRACT FAILED: ${t(mission.titleKey)}`,
        'Stage time limit expired — relaunch from Contracts [M]',
        'crimson',
      );
    },
  });

  // Preload all 10 Blender-MCP GLB models and enhance PBR + emissive properties
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
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              const std = m as THREE.MeshStandardMaterial;
              if (std) {
                std.side = THREE.DoubleSide;
                if (std.emissive && std.emissive.r + std.emissive.g + std.emissive.b > 0.08) {
                  std.emissiveIntensity = 1.35;
                }
              }
            }
          }
        });
        modelTemplates.set(id, gltf.scene);
      } catch {
        const fallback = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.4, 6.2),
          new THREE.MeshStandardMaterial({ color: 0x00f2ff, side: THREE.DoubleSide }),
        );
        box.position.y = 0.7;
        fallback.add(box);
        modelTemplates.set(id, fallback);
      }
    }),
  );

  const cloneModel = (assetId: string): THREE.Group => {
    const tpl = modelTemplates.get(assetId);
    return tpl ? (tpl.clone(true) as THREE.Group) : new THREE.Group();
  };

  // Add Mirai Home Marina Pier next to player spawn (-60, -60)
  renderManager.scene.add(buildMiraiHomeMarinaPier());

  // Player boat entity
  let playerBoatSpec = BOAT_ARCHETYPES.kuro_skiff;
  const boatDynamics = new BoatDynamics(physicsWorld, playerBoatSpec, { x: -60, y: 0.35, z: -60 });
  let playerMeshGroup = cloneModel(playerBoatSpec.assetId);
  let playerVfx = attachHeroBoatVfx(playerMeshGroup, playerBoatSpec);
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
  const ringGeo = new THREE.TorusGeometry(13, 0.55, 14, 48);
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
    new THREE.TorusGeometry(9, 0.35, 12, 36).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.85 }),
  );
  upperRingMesh.position.y = 6.5;
  beaconGroup.add(upperRingMesh);

  const pillarGeo = new THREE.CylinderGeometry(0.55, 0.55, 42, 14, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0xffae00,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
  pillarMesh.position.y = 21;
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

  // Streamed cell meshes (keep shared template geometries intact on cell unload!)
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
        cellGroups.delete(cell.key);
      }
    },
  });

  let lightsOn = true;
  const weatherOrder: WeatherState[] = ['clear', 'rain', 'fog', 'storm'];
  let weatherIndex = 0;

  hud = new HudController(hudRootEl, economy, missions, telemetry, {
    onSelectBoat: (boatId: BoatId) => {
      playerBoatSpec = BOAT_ARCHETYPES[boatId];
      boatDynamics.setSpecAndModifiers(playerBoatSpec, economy.getBoatModifiers(boatId));
      renderManager.scene.remove(playerMeshGroup);
      playerMeshGroup = cloneModel(playerBoatSpec.assetId);
      playerVfx = attachHeroBoatVfx(playerMeshGroup, playerBoatSpec);
      renderManager.scene.add(playerMeshGroup);
      renderManager.playerUnderGlow.color.setHex(playerBoatSpec.accentColorHex);
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
    onCycleCamera: () => {
      audio.playChime(680);
      return renderManager.cycleCameraMode();
    },
    onToggleLights: () => {
      lightsOn = !lightsOn;
      audio.playChime(lightsOn ? 640 : 420);
    },
    onRepairBoat: () => {
      if (economy.spendCredits(150, 'hull_repair')) {
        boatDynamics.repairFull();
        audio.playChime(880);
        return true;
      }
      audio.playChime(300);
      return false;
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
  let collisionCooldown = 0;

  const tick = (now: number) => {
    const frameDeltaMs = Math.min(100, now - lastFrameTime);
    const dtSec = frameDeltaMs / 1000;
    lastFrameTime = now;
    accumulator += dtSec;
    if (collisionCooldown > 0) collisionCooldown = Math.max(0, collisionCooldown - dtSec);

    const input = inputManager.poll();
    if (input.lightsTogglePressed) {
      lightsOn = !lightsOn;
      audio.playChime(lightsOn ? 640 : 420);
    }
    if (input.mapTogglePressed) hud.toggleContractsDrawer();
    if (input.shipyardTogglePressed) hud.toggleShipyardDrawer();
    if (input.escapePressed) hud.closeActiveDrawer();
    if (input.diagnosticsTogglePressed) hud.toggleDiagnostics();
    if (input.cameraTogglePressed) {
      const mode = renderManager.cycleCameraMode();
      audio.playChime(680);
      hud.showToast('CAMERA PERSPECTIVE UPDATED', mode.toUpperCase().replace('_', ' '), 'cyan');
    }
    if (input.timeCyclePressed) {
      atmosphere.cycleTimePhase();
      audio.playChime(600);
    }
    if (input.weatherCyclePressed) {
      weatherIndex = (weatherIndex + 1) % weatherOrder.length;
      atmosphere.setWeather(weatherOrder[weatherIndex]);
      audio.playChime(520);
    }
    if (input.repairPressed) {
      if (economy.spendCredits(150, 'hull_repair')) {
        boatDynamics.repairFull();
        audio.playChime(880);
        hud.showToast('HULL REPAIRED TO 100%', 'Emergency repair complete (-¥150)', 'emerald');
      } else {
        audio.playChime(300);
        hud.showToast('INSUFFICIENT CREDITS', 'Need ¥150 for hull repair', 'crimson');
      }
    }

    telemetry.markFirstControlIfNeeded(
      Math.abs(input.throttle) > 0.05 || Math.abs(input.steer) > 0.05,
    );

    let boatState = boatDynamics.getState();
    const currentWeather = atmosphere.getWeather();

    while (accumulator >= FIXED_DT) {
      simTime += FIXED_DT;
      boatState = boatDynamics.step(FIXED_DT, input, simTime, currentWeather);
      physicsWorld.step();
      traffic.update(FIXED_DT, { x: boatState.position.x, z: boatState.position.z });
      accumulator -= FIXED_DT;
    }

    const atmosState = atmosphere.update(dtSec);
    renderManager.syncAtmosphere(atmosState);

    streamer.update(
      { x: boatState.position.x, z: boatState.position.z },
      { x: boatState.velocity.x, z: boatState.velocity.z },
    );

    // Physical collision resolution against active cell structures, traffic & patrols
    for (const cell of streamer.getActiveCells()) {
      if (cell.ring !== 'active_physics') continue;
      for (const st of cell.structures) {
        if (!st.hasCollision) continue;
        const impact = boatDynamics.resolveCircleCollision(st.x, st.z, st.radius * 0.78);
        if (impact > 2.5 && collisionCooldown <= 0) {
          collisionCooldown = 0.6;
          renderManager.triggerCameraShake(Math.min(0.8, impact * 0.06));
          audio.playChime(220);
        }
      }
    }

    for (const v of traffic.getVessels()) {
      if (!v.isPhysicsActive) continue;
      const vRadius = v.assetId === 'traffic_ferry' ? 4.8 : 2.6;
      const impact = boatDynamics.resolveCircleCollision(v.position.x, v.position.z, vRadius);
      if (impact > 2.5 && collisionCooldown <= 0) {
        collisionCooldown = 0.8;
        renderManager.triggerCameraShake(0.55);
        audio.playChime(240);
        enforcement.reportCrime('collision_civilian', {
          x: boatState.position.x,
          z: boatState.position.z,
        });
        hud.showToast('MARITIME TRAFFIC COLLISION', 'Coast Guard alerted to vessel impact', 'amber');
      }
    }

    for (const p of enforcement.getPatrols()) {
      const impact = boatDynamics.resolveCircleCollision(p.position.x, p.position.z, 2.8);
      if (impact > 2.2 && collisionCooldown <= 0) {
        collisionCooldown = 0.8;
        renderManager.triggerCameraShake(0.65);
        audio.playChime(190);
        enforcement.reportCrime('collision_patrol', {
          x: boatState.position.x,
          z: boatState.position.z,
        });
        hud.showToast('PATROL INTERCEPTOR RAMMED!', 'Harbour Heat escalated immediately', 'crimson');
      }
    }

    boatState = boatDynamics.getState();

    const worldStats = streamer.getStats();
    if (worldStats.currentDistrict !== lastDistrict) {
      lastDistrict = worldStats.currentDistrict;
      telemetry.track('district_enter', { district: lastDistrict });
      hud.showToast(
        `ENTERING ${t(`district.${lastDistrict}.name`)}`,
        t(`district.${lastDistrict}.desc`),
        'cyan',
      );
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
      dtSec,
      { x: boatState.position.x, z: boatState.position.z },
      signature,
    );
    if (heatState.stage !== prevStage) {
      telemetry.track('heat_change', { from: prevStage, to: heatState.stage });
      if (heatState.stage === 'Clear') {
        telemetry.track('pursuit_escape', {});
        hud.showToast('HARBOUR HEAT CLEARED', 'Coast Guard pursuit called off', 'emerald');
      } else {
        hud.showToast(
          `HARBOUR HEAT: ${heatState.stage.toUpperCase()}`,
          t(`hud.heat.${heatState.stage.toLowerCase()}`),
          heatState.stage === 'Lockdown' ? 'crimson' : 'amber',
        );
      }
    }

    const activeMission = missions.update(
      dtSec,
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

    // Sync player boat mesh & dynamic VFX attachments
    playerMeshGroup.position.set(boatState.position.x, boatState.position.y, boatState.position.z);
    playerMeshGroup.quaternion.set(
      boatState.rotation.x,
      boatState.rotation.y,
      boatState.rotation.z,
      boatState.rotation.w,
    );

    playerVfx.headlightBeamGroup.visible = lightsOn;
    playerVfx.radarSpinner.rotation.y = simTime * 4.5;

    const absThrottle = Math.abs(input.throttle);
    const plumeScaleZ = 0.25 + absThrottle * (input.boost ? 2.1 : 1.15) + Math.sin(simTime * 38) * 0.08;
    const plumeScaleXY = 0.65 + (input.boost ? 0.55 : absThrottle * 0.35);
    playerVfx.thrusterLeft.scale.set(plumeScaleXY, plumeScaleXY, plumeScaleZ);
    playerVfx.thrusterRight.scale.set(plumeScaleXY, plumeScaleXY, plumeScaleZ);
    playerVfx.thrusterLeft.visible = absThrottle > 0.04;
    playerVfx.thrusterRight.visible = absThrottle > 0.04;
    const tMat = playerVfx.thrusterLeft.material as THREE.MeshBasicMaterial;
    tMat.color.setHex(input.boost ? 0xff1e8e : playerBoatSpec.accentColorHex);

    // Sync traffic meshes with wave-riding buoyancy & gentle wave pitch/roll
    for (const v of traffic.getVessels()) {
      const m = trafficMeshes.get(v.id);
      if (m) {
        const wSample = WaterField.sample(v.position.x, v.position.z, simTime, atmosState.weather);
        v.position.y = wSample.height + 0.16;
        m.position.set(v.position.x, v.position.y, v.position.z);
        m.rotation.set(wSample.normal.z * 0.25, v.headingRad, -wSample.normal.x * 0.25);
      }
    }

    // Sync patrol meshes with wave-riding buoyancy
    for (const p of enforcement.getPatrols()) {
      const m = patrolMeshes.get(p.id);
      if (m) {
        const wSample = WaterField.sample(p.position.x, p.position.z, simTime, atmosState.weather);
        p.position.y = wSample.height + 0.18;
        m.position.set(p.position.x, p.position.y, p.position.z);
        m.rotation.set(wSample.normal.z * 0.28, p.headingRad, -wSample.normal.x * 0.28);
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
      { x: input.cameraOrbitX, y: input.cameraOrbitY },
      input.drift,
    );

    const perfMetrics = renderManager.renderFrame(frameDeltaMs);
    if (!loggedFirstFrame) {
      loggedFirstFrame = true;
      telemetry.track('first_frame', { fps: perfMetrics.fps });
    }

    const targetScreenProj = activeMission
      ? renderManager.projectWorldToScreen({
          x: activeMission.currentStage.targetPos.x,
          y: 3.2,
          z: activeMission.currentStage.targetPos.z,
        })
      : null;

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
      input,
      targetScreenProj,
    );

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

bootNeonTides().catch((err) => {
  console.error('Failed to boot Neon Tides:', err);
});
