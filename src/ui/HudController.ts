import { BOAT_ARCHETYPES, BoatId } from '../entities/BoatArchetypes';
import { BoatTelemetryState } from '../physics/BoatDynamics';
import { HarbourHeatState, PatrolUnit } from '../ai/EnforcementSystem';
import { TrafficVessel } from '../ai/TrafficManager';
import { WorldStreamingStats } from '../world/WorldStreamer';
import { AtmosphereLightingState } from '../world/AtmosphereSystem';
import { EconomyManager, UPGRADE_CATALOG, UpgradeId } from '../gameplay/EconomyManager';
import { MissionManager } from '../gameplay/MissionManager';
import { SupportedLocale, t } from '../i18n/locales';
import { RendererPerformanceMetrics } from '../rendering/RenderManager';
import { TelemetryTracker } from '../telemetry/TelemetryTracker';
import { WeatherState } from '../core/WaterField';

export interface AccessibilitySettings {
  cameraBob: number;
  horizonRoll: number;
  fovKick: number;
  rainStreaks: boolean;
  highContrast: boolean;
}

export class HudController {
  private root: HTMLElement;
  private economy: EconomyManager;
  private missions: MissionManager;
  private telemetry: TelemetryTracker;
  private locale: SupportedLocale = 'en';
  private activeDrawer: 'contracts' | 'shipyard' | 'settings' | null = null;
  private diagnosticsOpen = false;
  public accessibility: AccessibilitySettings = {
    cameraBob: 1.0,
    horizonRoll: 1.0,
    fovKick: 1.0,
    rainStreaks: true,
    highContrast: false,
  };

  private onSelectBoat: (boatId: BoatId) => void;
  private onChangeWeather: (weather: WeatherState) => void;
  private onCycleTime: () => void;
  private onToggleLights: () => void;
  private onRepairBoat: () => void;
  private onTriggerTouch: (throttle: number, steer: number, boost: boolean, drift: boolean) => void;

  private radarCanvas!: HTMLCanvasElement;
  private radarCtx!: CanvasRenderingContext2D;

  constructor(
    root: HTMLElement,
    economy: EconomyManager,
    missions: MissionManager,
    telemetry: TelemetryTracker,
    callbacks: {
      onSelectBoat: (boatId: BoatId) => void;
      onChangeWeather: (weather: WeatherState) => void;
      onCycleTime?: () => void;
      onToggleLights: () => void;
      onRepairBoat: () => void;
      onTriggerTouch: (throttle: number, steer: number, boost: boolean, drift: boolean) => void;
    },
  ) {
    this.root = root;
    this.economy = economy;
    this.missions = missions;
    this.telemetry = telemetry;
    this.onSelectBoat = callbacks.onSelectBoat;
    this.onChangeWeather = callbacks.onChangeWeather;
    this.onCycleTime = callbacks.onCycleTime ?? (() => {});
    this.onToggleLights = callbacks.onToggleLights;
    this.onRepairBoat = callbacks.onRepairBoat;
    this.onTriggerTouch = callbacks.onTriggerTouch;

    this.buildDom();
  }

  public toggleDiagnostics(): void {
    this.diagnosticsOpen = !this.diagnosticsOpen;
    const el = document.getElementById('cto-diag-panel');
    if (el) el.classList.toggle('open', this.diagnosticsOpen);
  }

  public toggleContractsDrawer(): void {
    this.setDrawer(this.activeDrawer === 'contracts' ? null : 'contracts');
  }

  private setDrawer(drawer: 'contracts' | 'shipyard' | 'settings' | null): void {
    this.activeDrawer = drawer;
    const modal = document.getElementById('hud-drawer-modal');
    if (!modal) return;
    if (!drawer) {
      modal.classList.remove('open');
      return;
    }
    modal.classList.add('open');
    this.renderDrawerContent();
  }

  private buildDom(): void {
    this.root.innerHTML = `
      <div class="hud-top-bar">
        <div class="brand-cluster">
          <div class="brand-title" id="hud-app-title">NEON TIDES</div>
          <div class="brand-district" id="hud-district-label">MIRAI HARBOUR</div>
          <div class="brand-district" id="hud-economy-label">¥500 | REP 0</div>
        </div>

        <div class="top-actions">
          <button class="neo-btn amber" id="btn-drawer-contracts">CONTRACTS [M]</button>
          <button class="neo-btn" id="btn-drawer-shipyard">MARINA & BOATS</button>
          <button class="neo-btn" id="btn-time-cycle">TIME: GOLDEN DUSK</button>
          <button class="neo-btn" id="btn-weather-cycle">WEATHER: CLEAR</button>
          <button class="neo-btn" id="btn-lights-toggle">LIGHTS: ON [L]</button>
          <button class="neo-btn" id="btn-lang-toggle">日本語 / EN</button>
          <button class="neo-btn" id="btn-drawer-settings">ACCESSIBILITY</button>
          <button class="neo-btn" id="btn-diag-toggle">CTO TELEMETRY [F3]</button>
        </div>

        <div class="heat-cluster" id="hud-heat-cluster" data-stage="Clear">
          <div class="heat-header" id="hud-heat-header">HARBOUR HEAT</div>
          <div class="heat-status" id="hud-heat-status">CLEAR // ROUTINE PATROL</div>
          <div class="heat-pips" id="hud-heat-pips">
            <div class="heat-pip"></div>
            <div class="heat-pip"></div>
            <div class="heat-pip"></div>
            <div class="heat-pip"></div>
          </div>
        </div>
      </div>

      <div class="hud-middle">
        <div class="mission-tracker" id="hud-mission-tracker">
          <div class="mission-title" id="hud-mission-title">FREE ROAM // SELECT CONTRACT</div>
          <div class="mission-stage" id="hud-mission-stage">WASD / Arrows to Steer • Shift Boost • Space Drift • L Stealth Lights</div>
          <div class="mission-dist" id="hud-mission-dist">Press [M] or click CONTRACTS to launch a run</div>
        </div>
      </div>

      <div class="hud-bottom-bar">
        <div class="radar-panel">
          <canvas id="radar-canvas" width="148" height="148"></canvas>
          <div class="stealth-readout" id="hud-stealth-status">OPEN WATER</div>
        </div>

        <div class="touch-controls">
          <button class="neo-btn" id="touch-left">◀ LEFT</button>
          <button class="neo-btn amber" id="touch-throttle">▲ THROTTLE</button>
          <button class="neo-btn" id="touch-drift">DRIFT</button>
          <button class="neo-btn" id="touch-right">RIGHT ▶</button>
        </div>

        <div class="telemetry-instrument">
          <div class="speed-gauge">
            <div class="speed-value" id="hud-speed-val">00</div>
            <div class="speed-unit" id="hud-speed-unit">KTS // SPEED</div>
          </div>
          <div class="bars-cluster">
            <div class="bar-row">
              <div class="bar-label">
                <span id="hud-hull-label">HULL INTEGRITY</span>
                <span id="hud-hull-val">100%</span>
              </div>
              <div class="bar-track"><div class="bar-fill hull" id="hud-hull-bar" style="width: 100%"></div></div>
            </div>
            <div class="bar-row">
              <div class="bar-label">
                <span id="hud-sig-label">STEALTH SIGNATURE</span>
                <span id="hud-sig-val">25%</span>
              </div>
              <div class="bar-track"><div class="bar-fill stealth" id="hud-sig-bar" style="width: 25%"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="cto-diagnostics" id="cto-diag-panel"></div>
      <div class="drawer-modal" id="hud-drawer-modal"></div>
    `;

    this.radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    this.radarCtx = this.radarCanvas.getContext('2d')!;

    document.getElementById('btn-drawer-contracts')?.addEventListener('click', () => {
      this.setDrawer(this.activeDrawer === 'contracts' ? null : 'contracts');
    });
    document.getElementById('btn-drawer-shipyard')?.addEventListener('click', () => {
      this.setDrawer(this.activeDrawer === 'shipyard' ? null : 'shipyard');
    });
    document.getElementById('btn-drawer-settings')?.addEventListener('click', () => {
      this.setDrawer(this.activeDrawer === 'settings' ? null : 'settings');
    });
    document.getElementById('btn-diag-toggle')?.addEventListener('click', () => {
      this.toggleDiagnostics();
    });
    document.getElementById('btn-lights-toggle')?.addEventListener('click', () => {
      this.onToggleLights();
    });
    document.getElementById('btn-time-cycle')?.addEventListener('click', () => {
      this.onCycleTime();
    });
    document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
      this.locale = this.locale === 'en' ? 'ja' : 'en';
      if (this.activeDrawer) this.renderDrawerContent();
    });

    const weathers: WeatherState[] = ['clear', 'rain', 'fog', 'storm'];
    let wIdx = 0;
    document.getElementById('btn-weather-cycle')?.addEventListener('click', () => {
      wIdx = (wIdx + 1) % weathers.length;
      this.onChangeWeather(weathers[wIdx]);
    });

    // Touch bindings
    const bindHold = (id: string, throttle: number, steer: number, drift = false) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', () => this.onTriggerTouch(throttle, steer, false, drift));
      btn.addEventListener('pointerup', () => this.onTriggerTouch(0, 0, false, false));
      btn.addEventListener('pointerleave', () => this.onTriggerTouch(0, 0, false, false));
    };
    bindHold('touch-left', 0.85, -1);
    bindHold('touch-right', 0.85, 1);
    bindHold('touch-throttle', 1.0, 0);
    bindHold('touch-drift', 0.9, 0.7, true);
  }

  private renderDrawerContent(): void {
    const modal = document.getElementById('hud-drawer-modal');
    if (!modal || !this.activeDrawer) return;

    if (this.activeDrawer === 'contracts') {
      const missions = this.missions.getAvailableMissions();
      const completed = this.missions.getCompletedMissionIds();
      const cardsHtml = missions
        .map((m) => {
          const isDone = completed.has(m.id);
          return `
            <div class="contract-card">
              <div class="contract-meta">
                <h4>${t(m.titleKey, this.locale)} ${isDone ? '✓' : ''}</h4>
                <p>[${t(`district.${m.district}.name`, this.locale)}] ${t(m.briefKey, this.locale)}</p>
                <div class="contract-reward">+¥${m.rewardCredits} • +${m.rewardReputation} REP</div>
              </div>
              <button class="neo-btn amber" data-start-mission="${m.id}">LAUNCH</button>
            </div>
          `;
        })
        .join('');

      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">HARBOUR DISPATCH // 16 CONTRACTS</div>
          <button class="neo-btn" id="btn-close-drawer">CLOSE [X]</button>
        </div>
        <div class="card-grid">${cardsHtml}</div>
      `;

      modal.querySelectorAll('[data-start-mission]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-start-mission')!;
          this.missions.startMission(id);
          this.setDrawer(null);
        });
      });
    } else if (this.activeDrawer === 'shipyard') {
      const activeBoat = this.economy.getActiveBoat();
      const boatsHtml = (Object.keys(BOAT_ARCHETYPES) as BoatId[])
        .map((bid) => {
          const spec = BOAT_ARCHETYPES[bid];
          const unlocked = this.economy.isBoatUnlocked(bid);
          const isCurrent = activeBoat === bid;
          const label = isCurrent
            ? 'ACTIVE HULL'
            : unlocked
              ? 'SELECT HULL'
              : `UNLOCK ¥${spec.unlockCost}`;
          return `
            <div class="contract-card">
              <div class="contract-meta">
                <h4>${t(spec.nameKey, this.locale)}</h4>
                <p>${t(spec.roleKey, this.locale)} • Top ${Math.round(spec.topSpeedMps * 1.94)} KTS • HP ${spec.maxHullHp}</p>
              </div>
              <button class="neo-btn ${isCurrent ? 'active' : 'amber'}" data-boat-select="${bid}">${label}</button>
            </div>
          `;
        })
        .join('');

      const equipped = this.economy.getEquippedUpgrades(activeBoat);
      const upgradesHtml = (Object.keys(UPGRADE_CATALOG) as UpgradeId[])
        .map((uid) => {
          const u = UPGRADE_CATALOG[uid];
          const isEquipped = equipped[u.axis] === uid;
          return `
            <div class="contract-card">
              <div class="contract-meta">
                <h4>[${u.axis.toUpperCase()}] ${t(u.nameKey, this.locale)}</h4>
                <p>${t(u.descKey, this.locale)}</p>
                <div class="contract-reward">¥${u.cost}</div>
              </div>
              <button class="neo-btn ${isEquipped ? 'active' : ''}" data-buy-upgrade="${uid}">
                ${isEquipped ? 'EQUIPPED' : 'INSTALL'}
              </button>
            </div>
          `;
        })
        .join('');

      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">MIRAI MARINA SHIPYARD & TUNING</div>
          <button class="neo-btn" id="btn-close-drawer">CLOSE [X]</button>
        </div>
        <div style="margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
          <span>BALANCE: <strong style="color:var(--amber)">¥${this.economy.getCredits()}</strong></span>
          <button class="neo-btn" id="btn-repair-hull">EMERGENCY REPAIR (¥150)</button>
        </div>
        <h4 style="color:var(--cyan); margin: 10px 0 6px;">VESSEL FLEET (3 ARCHETYPES)</h4>
        <div class="card-grid">${boatsHtml}</div>
        <h4 style="color:var(--cyan); margin: 16px 0 6px;">TRADE-OFF PERFORMANCE TUNING</h4>
        <div class="card-grid">${upgradesHtml}</div>
      `;

      document.getElementById('btn-repair-hull')?.addEventListener('click', () => {
        this.onRepairBoat();
        this.renderDrawerContent();
      });

      modal.querySelectorAll('[data-boat-select]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const bid = (e.currentTarget as HTMLElement).getAttribute('data-boat-select') as BoatId;
          if (this.economy.unlockAndSelectBoat(bid)) {
            this.onSelectBoat(bid);
            this.renderDrawerContent();
          }
        });
      });

      modal.querySelectorAll('[data-buy-upgrade]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const uid = (e.currentTarget as HTMLElement).getAttribute('data-buy-upgrade') as UpgradeId;
          if (this.economy.purchaseUpgrade(this.economy.getActiveBoat(), uid)) {
            this.onSelectBoat(this.economy.getActiveBoat());
            this.renderDrawerContent();
          }
        });
      });
    } else if (this.activeDrawer === 'settings') {
      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">WCAG 2.2 AA & REDUCED MOTION</div>
          <button class="neo-btn" id="btn-close-drawer">CLOSE [X]</button>
        </div>
        <div class="card-grid">
          <div class="contract-card">
            <div class="contract-meta">
              <h4>Camera Wave Bob Scale</h4>
              <p>Reduces vertical sea-swell camera oscillation</p>
            </div>
            <input type="range" min="0" max="1" step="0.1" value="${this.accessibility.cameraBob}" id="rng-bob" />
          </div>
          <div class="contract-card">
            <div class="contract-meta">
              <h4>Speed FOV Kick Scale</h4>
              <p>Controls perspective widening during hydro-boost</p>
            </div>
            <input type="range" min="0" max="1" step="0.1" value="${this.accessibility.fovKick}" id="rng-fov" />
          </div>
          <div class="contract-card">
            <div class="contract-meta">
              <h4>High-Contrast Telemetry HUD</h4>
              <p>Increases contrast and non-color state labels</p>
            </div>
            <button class="neo-btn" id="btn-hc-toggle">${this.accessibility.highContrast ? 'ON' : 'OFF'}</button>
          </div>
        </div>
      `;

      document.getElementById('rng-bob')?.addEventListener('input', (e) => {
        this.accessibility.cameraBob = parseFloat((e.target as HTMLInputElement).value);
      });
      document.getElementById('rng-fov')?.addEventListener('input', (e) => {
        this.accessibility.fovKick = parseFloat((e.target as HTMLInputElement).value);
      });
      document.getElementById('btn-hc-toggle')?.addEventListener('click', () => {
        this.accessibility.highContrast = !this.accessibility.highContrast;
        document.body.classList.toggle('high-contrast', this.accessibility.highContrast);
        this.renderDrawerContent();
      });
    }

    document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
      this.setDrawer(null);
    });
  }

  public update(
    boatState: BoatTelemetryState,
    heatState: HarbourHeatState,
    signature: number,
    underBridge: boolean,
    lightsOn: boolean,
    worldStats: WorldStreamingStats,
    atmosState: AtmosphereLightingState,
    perfMetrics: RendererPerformanceMetrics,
    patrols: PatrolUnit[],
    traffic: TrafficVessel[],
  ): void {
    const loc = this.locale;

    const appTitle = document.getElementById('hud-app-title');
    if (appTitle) appTitle.textContent = t('app.title', loc);

    const distLabel = document.getElementById('hud-district-label');
    if (distLabel) {
      distLabel.textContent = `${t(`district.${worldStats.currentDistrict}.name`, loc)} — ${t(`district.${worldStats.currentDistrict}.desc`, loc)}`;
    }

    const econLabel = document.getElementById('hud-economy-label');
    if (econLabel) {
      econLabel.textContent = `${t('hud.credits', loc)}: ¥${this.economy.getCredits()} | ${t('hud.reputation', loc)}: ${this.economy.getReputation()}`;
    }

    const weatherBtn = document.getElementById('btn-weather-cycle');
    if (weatherBtn) {
      weatherBtn.textContent = t(`hud.weather.${atmosState.weather}`, loc);
    }

    const timeBtn = document.getElementById('btn-time-cycle');
    if (timeBtn) {
      const phaseNames: Record<string, string> = {
        morning_haze: 'TIME: MORNING',
        clear_afternoon: 'TIME: DAYLIGHT',
        golden_hour: 'TIME: NEON DUSK',
        neon_night: 'TIME: MIDNIGHT',
      };
      timeBtn.textContent = phaseNames[atmosState.phase] ?? 'TIME: DUSK';
    }

    const lightsBtn = document.getElementById('btn-lights-toggle');
    if (lightsBtn) {
      lightsBtn.textContent = t(lightsOn ? 'hud.lights.on' : 'hud.lights.off', loc);
    }

    // Harbour Heat
    const heatCluster = document.getElementById('hud-heat-cluster');
    const heatHeader = document.getElementById('hud-heat-header');
    const heatStatus = document.getElementById('hud-heat-status');
    const heatPips = document.getElementById('hud-heat-pips');

    if (heatCluster) heatCluster.setAttribute('data-stage', heatState.stage);
    if (heatHeader) heatHeader.textContent = `${t('hud.heat.label', loc)} (${heatState.heatScore}%)`;
    if (heatStatus) {
      const key = `hud.heat.${heatState.stage.toLowerCase()}`;
      heatStatus.textContent = t(key, loc);
    }
    if (heatPips) {
      const level =
        heatState.stage === 'Lockdown'
          ? 4
          : heatState.stage === 'Pursuit'
            ? 3
            : heatState.stage === 'Alert'
              ? 2
              : 0;
      heatPips.innerHTML = [1, 2, 3, 4]
        .map((idx) => `<div class="heat-pip ${idx <= level ? `active-${Math.min(3, level)}` : ''}"></div>`)
        .join('');
    }

    // Active Mission Tracker
    const activeMission = this.missions.getActiveMission();
    const mTitle = document.getElementById('hud-mission-title');
    const mStage = document.getElementById('hud-mission-stage');
    const mDist = document.getElementById('hud-mission-dist');
    if (activeMission && mTitle && mStage && mDist) {
      mTitle.textContent = `${t(activeMission.mission.titleKey, loc)} (${activeMission.stageIndex + 1}/${activeMission.mission.stages.length})`;
      mStage.textContent = t(activeMission.currentStage.labelKey, loc);
      const d = Math.round(
        Math.hypot(
          boatState.position.x - activeMission.currentStage.targetPos.x,
          boatState.position.z - activeMission.currentStage.targetPos.z,
        ),
      );
      const timerTxt =
        activeMission.stageRemainingSec !== null
          ? ` • TIME: ${Math.ceil(activeMission.stageRemainingSec)}s`
          : '';
      mDist.textContent = `TARGET DISTANCE: ${d}m${timerTxt}`;
    } else if (mTitle && mStage && mDist) {
      mTitle.textContent = loc === 'ja' ? 'フリーローム // 契約を選択 [M]' : 'FREE ROAM // SELECT CONTRACT [M]';
      mStage.textContent =
        loc === 'ja'
          ? 'WASD/矢印: 操船 • Shift: ブースト • Space: ドリフト • L: 消灯ステルス'
          : 'WASD/Arrows: Steer • Shift: Boost • Space: Drift • L: Stealth Lights';
      mDist.textContent = `${this.missions.getCompletedMissionIds().size} / 16 CONTRACTS COMPLETED`;
    }

    // Speed & Bars
    const speedVal = document.getElementById('hud-speed-val');
    if (speedVal) speedVal.textContent = String(Math.round(boatState.speedKnots)).padStart(2, '0');

    const hullPercent = Math.round((boatState.hullHp / Math.max(1, boatState.maxHullHp)) * 100);
    const hullVal = document.getElementById('hud-hull-val');
    const hullBar = document.getElementById('hud-hull-bar');
    if (hullVal) hullVal.textContent = `${hullPercent}%`;
    if (hullBar) hullBar.style.width = `${hullPercent}%`;

    const sigPercent = Math.round(signature * 100);
    const sigVal = document.getElementById('hud-sig-val');
    const sigBar = document.getElementById('hud-sig-bar');
    if (sigVal) sigVal.textContent = `${sigPercent}%`;
    if (sigBar) sigBar.style.width = `${sigPercent}%`;

    const stealthStatus = document.getElementById('hud-stealth-status');
    if (stealthStatus) {
      stealthStatus.textContent = underBridge
        ? t('hud.cover.active', loc)
        : t('hud.cover.exposed', loc);
    }

    this.drawRadar(boatState, patrols, traffic, signature, activeMission?.currentStage.targetPos ?? null);

    if (this.diagnosticsOpen) {
      const diag = document.getElementById('cto-diag-panel');
      if (diag) {
        const recent = this.telemetry
          .getRecentEvents(4)
          .map((e) => `${e.type}`)
          .join(', ');
        diag.innerHTML = `
          <div><strong>CTO TELEMETRY & STREAMING GATE</strong></div>
          <div>FPS: ${perfMetrics.fps} | Frame: ${perfMetrics.frameTimeMs}ms (P95: ${perfMetrics.p95FrameTimeMs}ms)</div>
          <div>Draw Calls: ${perfMetrics.drawCalls} (Budget ≤500) | Tris: ${perfMetrics.triangles}</div>
          <div>Cells: ${worldStats.activeCellCount} (Phys:${worldStats.physicsCellCount} HD:${worldStats.highDetailCellCount} Sil:${worldStats.silhouetteCellCount})</div>
          <div>Disposed: ${worldStats.disposedResources} | Leaked: ${worldStats.leakedResources}</div>
          <div>Pos: (${Math.round(boatState.position.x)}, ${Math.round(boatState.position.z)}) | Slip: ${Math.round(boatState.driftSlipAngleDeg)}°</div>
          <div>Ledger Reconciled: ¥${this.economy.reconcileLedger()}</div>
          <div>Events: ${recent}</div>
        `;
      }
    }
  }

  private drawRadar(
    boat: BoatTelemetryState,
    patrols: PatrolUnit[],
    traffic: TrafficVessel[],
    signature: number,
    missionTarget: { x: number; z: number } | null,
  ): void {
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.14; // 1m = 0.14px (~520m radius)

    ctx.clearRect(0, 0, w, h);

    // Radar rings
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.18)';
    ctx.lineWidth = 1;
    for (const r of [24, 48, 70]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player acoustic/visual stealth signature ring
    ctx.strokeStyle = 'rgba(255, 174, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 8 + signature * 28, 0, Math.PI * 2);
    ctx.stroke();

    // Traffic blips
    ctx.fillStyle = '#5ad2ff';
    for (const tv of traffic) {
      const rx = cx + (tv.position.x - boat.position.x) * scale;
      const ry = cy + (tv.position.z - boat.position.z) * scale;
      if (Math.hypot(rx - cx, ry - cy) < 68) {
        ctx.fillRect(rx - 2, ry - 2, 4, 4);
      }
    }

    // Patrol blips & detection cones
    for (const p of patrols) {
      const rx = cx + (p.position.x - boat.position.x) * scale;
      const ry = cy + (p.position.z - boat.position.z) * scale;
      if (Math.hypot(rx - cx, ry - cy) < 70) {
        ctx.fillStyle = p.alerted ? '#ff2a3c' : '#ff1e8e';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Active Mission Beacon
    if (missionTarget) {
      const mx = cx + (missionTarget.x - boat.position.x) * scale;
      const my = cy + (missionTarget.z - boat.position.z) * scale;
      const angle = Math.atan2(my - cy, mx - cx);
      const dist = Math.min(66, Math.hypot(mx - cx, my - cy));
      const bx = cx + Math.cos(angle) * dist;
      const by = cy + Math.sin(angle) * dist;

      ctx.fillStyle = '#ffae00';
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player center chevron
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-boat.headingRad);
    ctx.fillStyle = '#00f2ff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
