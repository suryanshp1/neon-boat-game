import { BOAT_ARCHETYPES, BoatId } from '../entities/BoatArchetypes';
import { BoatControlInput, BoatTelemetryState } from '../physics/BoatDynamics';
import { HarbourHeatState, PatrolUnit } from '../ai/EnforcementSystem';
import { TrafficVessel } from '../ai/TrafficManager';
import { WorldStreamingStats } from '../world/WorldStreamer';
import { AtmosphereLightingState } from '../world/AtmosphereSystem';
import { EconomyManager, UPGRADE_CATALOG, UpgradeId } from '../gameplay/EconomyManager';
import { MissionManager } from '../gameplay/MissionManager';
import { SupportedLocale, t } from '../i18n/locales';
import {
  CameraViewMode,
  RendererPerformanceMetrics,
  ScreenProjectionResult,
} from '../rendering/RenderManager';
import { TelemetryTracker } from '../telemetry/TelemetryTracker';
import { WeatherState } from '../core/WaterField';

export interface AccessibilitySettings {
  cameraBob: number;
  horizonRoll: number;
  fovKick: number;
  rainStreaks: boolean;
  highContrast: boolean;
}

export type ToastTone = 'cyan' | 'amber' | 'emerald' | 'crimson';

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
  private onCycleCamera: () => CameraViewMode;
  private onToggleLights: () => void;
  private onRepairBoat: () => boolean;
  private onTriggerTouch: (throttle: number, steer: number, boost: boolean, drift: boolean) => void;

  private radarCanvas!: HTMLCanvasElement;
  private radarCtx!: CanvasRenderingContext2D;
  private compassCanvas!: HTMLCanvasElement;
  private compassCtx!: CanvasRenderingContext2D;

  private els: Record<string, HTMLElement | null> = {};
  private lastHeatPipKey = '';
  private lastDiagHtml = '';
  private toastTimeout: number | null = null;

  constructor(
    root: HTMLElement,
    economy: EconomyManager,
    missions: MissionManager,
    telemetry: TelemetryTracker,
    callbacks: {
      onSelectBoat: (boatId: BoatId) => void;
      onChangeWeather: (weather: WeatherState) => void;
      onCycleTime?: () => void;
      onCycleCamera?: () => CameraViewMode;
      onToggleLights: () => void;
      onRepairBoat: () => boolean | void;
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
    this.onCycleCamera = callbacks.onCycleCamera ?? (() => 'chase_standard');
    this.onToggleLights = callbacks.onToggleLights;
    this.onRepairBoat = () => Boolean(callbacks.onRepairBoat());
    this.onTriggerTouch = callbacks.onTriggerTouch;

    this.buildDom();
  }

  public showToast(title: string, subtitle = '', tone: ToastTone = 'cyan'): void {
    const container = this.els.toastBanner;
    if (!container) return;
    container.setAttribute('data-tone', tone);
    container.innerHTML = `
      <div class="toast-title">${title}</div>
      ${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ''}
    `;
    container.classList.add('visible');
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      container.classList.remove('visible');
    }, 3200);
  }

  public toggleDiagnostics(): void {
    this.diagnosticsOpen = !this.diagnosticsOpen;
    this.els.diagPanel?.classList.toggle('open', this.diagnosticsOpen);
  }

  public toggleContractsDrawer(): void {
    this.setDrawer(this.activeDrawer === 'contracts' ? null : 'contracts');
  }

  public toggleShipyardDrawer(): void {
    this.setDrawer(this.activeDrawer === 'shipyard' ? null : 'shipyard');
  }

  public closeActiveDrawer(): void {
    this.setDrawer(null);
  }

  private setDrawer(drawer: 'contracts' | 'shipyard' | 'settings' | null): void {
    this.activeDrawer = drawer;
    const modal = this.els.drawerModal;
    if (!modal) return;
    document
      .getElementById('btn-drawer-contracts')
      ?.classList.toggle('active', drawer === 'contracts');
    document
      .getElementById('btn-drawer-shipyard')
      ?.classList.toggle('active', drawer === 'shipyard');
    document
      .getElementById('btn-drawer-settings')
      ?.classList.toggle('active', drawer === 'settings');

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
          <div class="brand-title" id="hud-app-title">NEON TIDES // BAY SKIPPER OS</div>
          <div class="brand-district" id="hud-district-label">MIRAI HARBOUR</div>
          <div class="brand-economy-row">
            <span class="econ-pill credits" id="hud-economy-credits">¥500</span>
            <span class="econ-pill rep" id="hud-economy-rep">REP 0</span>
            <span class="econ-pill hull-name" id="hud-active-boat-name">KURO-01 SKIFF</span>
          </div>
        </div>

        <div class="center-hud-cluster">
          <div class="compass-frame">
            <canvas id="compass-canvas" width="380" height="32"></canvas>
          </div>
          <div class="top-actions">
            <button class="neo-btn amber" id="btn-drawer-contracts">CONTRACTS [M]</button>
            <button class="neo-btn" id="btn-drawer-shipyard">MARINA & FLEET [B]</button>
            <button class="neo-btn" id="btn-camera-cycle">CAMERA [C]</button>
            <button class="neo-btn" id="btn-time-cycle">TIME: NEON DUSK</button>
            <button class="neo-btn" id="btn-weather-cycle">WEATHER: CLEAR</button>
            <button class="neo-btn" id="btn-lights-toggle">LIGHTS: ON [L]</button>
            <button class="neo-btn" id="btn-lang-toggle">日本語 / EN</button>
            <button class="neo-btn" id="btn-drawer-settings">HUD & MOTION</button>
            <button class="neo-btn" id="btn-diag-toggle">TELEMETRY [F3]</button>
          </div>
        </div>

        <div class="heat-cluster" id="hud-heat-cluster" data-stage="Clear">
          <div class="heat-header" id="hud-heat-header">HARBOUR HEAT (0%)</div>
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
          <div class="mission-header-row">
            <span class="mission-badge" id="hud-mission-badge">ACTIVE CONTRACT</span>
            <span class="mission-timer" id="hud-mission-timer"></span>
          </div>
          <div class="mission-title" id="hud-mission-title">MIDNIGHT MANIFEST RUN</div>
          <div class="mission-stage" id="hud-mission-stage">Collect manifest at Marina Pier</div>
          <div class="mission-dist" id="hud-mission-dist">TARGET DISTANCE: 128m</div>
          <div class="controls-hint" id="hud-controls-hint">
            <span><kbd>WASD</kbd> Steer</span>
            <span><kbd>SHIFT</kbd> Boost</span>
            <span><kbd>SPACE</kbd> Drift</span>
            <span><kbd>L</kbd> Lights</span>
            <span><kbd>C</kbd> Cam</span>
          </div>
        </div>

        <div class="toast-banner" id="hud-toast-banner" data-tone="cyan"></div>
      </div>

      <div class="screen-waypoint" id="hud-screen-waypoint">
        <div class="waypoint-diamond">◆</div>
        <div class="waypoint-text" id="hud-waypoint-text">120m</div>
      </div>

      <div class="hud-bottom-bar">
        <div class="radar-panel">
          <div class="radar-header">
            <span>SONAR // 500M</span>
            <span id="hud-coords-label">(-060, -060)</span>
          </div>
          <canvas id="radar-canvas" width="152" height="152"></canvas>
          <div class="stealth-readout" id="hud-stealth-status">OPEN WATER: EXPOSED</div>
        </div>

        <div class="touch-controls">
          <button class="neo-btn" id="touch-left">◀ LEFT</button>
          <button class="neo-btn amber" id="touch-throttle">▲ THROTTLE</button>
          <button class="neo-btn" id="touch-boost">⚡ BOOST</button>
          <button class="neo-btn" id="touch-drift">⤿ DRIFT</button>
          <button class="neo-btn" id="touch-right">RIGHT ▶</button>
        </div>

        <div class="telemetry-instrument">
          <div class="status-pills-col">
            <div class="state-pill" id="pill-boost">⚡ HYDRO-BOOST</div>
            <div class="state-pill" id="pill-drift">⤿ DRIFT CHINE</div>
            <div class="state-pill" id="pill-stealth">◐ STEALTH</div>
            <button class="neo-btn repair-inline-btn" id="btn-inline-repair" style="display:none;">
              🔧 REPAIR [R] ¥150
            </button>
          </div>

          <div class="speed-gauge-cluster">
            <svg class="tach-svg" viewBox="0 0 110 110" width="96" height="96">
              <circle class="tach-bg" cx="55" cy="55" r="46" stroke-dasharray="216 300" stroke-dashoffset="0" />
              <circle class="tach-fill" id="hud-tach-arc" cx="55" cy="55" r="46" stroke-dasharray="0 300" stroke-dashoffset="0" />
            </svg>
            <div class="speed-gauge">
              <div class="speed-value" id="hud-speed-val">00</div>
              <div class="speed-unit" id="hud-speed-unit">KTS // 00 KM/H</div>
            </div>
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
    this.compassCanvas = document.getElementById('compass-canvas') as HTMLCanvasElement;
    this.compassCtx = this.compassCanvas.getContext('2d')!;

    const ids = [
      'hud-app-title',
      'hud-district-label',
      'hud-economy-credits',
      'hud-economy-rep',
      'hud-active-boat-name',
      'btn-drawer-contracts',
      'btn-drawer-shipyard',
      'btn-camera-cycle',
      'btn-time-cycle',
      'btn-weather-cycle',
      'btn-lights-toggle',
      'btn-drawer-settings',
      'btn-diag-toggle',
      'hud-heat-cluster',
      'hud-heat-header',
      'hud-heat-status',
      'hud-heat-pips',
      'hud-mission-badge',
      'hud-mission-timer',
      'hud-mission-title',
      'hud-mission-stage',
      'hud-mission-dist',
      'hud-toast-banner',
      'hud-screen-waypoint',
      'hud-waypoint-text',
      'hud-coords-label',
      'hud-stealth-status',
      'pill-boost',
      'pill-drift',
      'pill-stealth',
      'btn-inline-repair',
      'hud-tach-arc',
      'hud-speed-val',
      'hud-speed-unit',
      'hud-hull-label',
      'hud-hull-val',
      'hud-hull-bar',
      'hud-sig-label',
      'hud-sig-val',
      'hud-sig-bar',
      'cto-diag-panel',
      'hud-drawer-modal',
    ];
    for (const id of ids) {
      this.els[id] = document.getElementById(id);
    }
    this.els.toastBanner = this.els['hud-toast-banner'];
    this.els.diagPanel = this.els['cto-diag-panel'];
    this.els.drawerModal = this.els['hud-drawer-modal'];

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
    document.getElementById('btn-camera-cycle')?.addEventListener('click', () => {
      const mode = this.onCycleCamera();
      const labels: Record<CameraViewMode, string> = {
        chase_standard: 'CHASE STANDARD VIEW',
        chase_close: 'LOW ACTION CHASE VIEW',
        chase_tactical: 'HIGH TACTICAL OVERVIEW',
        bow_action: 'REVERSE BOW LOOKBACK',
      };
      this.showToast('CAMERA PERSPECTIVE UPDATED', labels[mode], 'cyan');
    });
    document.getElementById('btn-inline-repair')?.addEventListener('click', () => {
      if (this.onRepairBoat()) {
        this.showToast('HULL REPAIRED TO 100%', 'Emergency dockyard repair complete (-¥150)', 'emerald');
      } else {
        this.showToast('INSUFFICIENT CREDITS', 'Need ¥150 for hull repair', 'crimson');
      }
    });
    document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
      this.locale = this.locale === 'en' ? 'ja' : 'en';
      if (this.activeDrawer) this.renderDrawerContent();
      this.showToast(
        this.locale === 'ja' ? '言語切替: 日本語' : 'LANGUAGE: ENGLISH',
        this.locale === 'ja' ? 'すべての計器・契約表示を更新しました' : 'All HUD telemetry and dispatch labels updated',
        'cyan',
      );
    });

    const weathers: WeatherState[] = ['clear', 'rain', 'fog', 'storm'];
    let wIdx = 0;
    document.getElementById('btn-weather-cycle')?.addEventListener('click', () => {
      wIdx = (wIdx + 1) % weathers.length;
      this.onChangeWeather(weathers[wIdx]);
    });

    // Touch bindings
    const bindHold = (id: string, throttle: number, steer: number, boost = false, drift = false) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', () => this.onTriggerTouch(throttle, steer, boost, drift));
      btn.addEventListener('pointerup', () => this.onTriggerTouch(0, 0, false, false));
      btn.addEventListener('pointerleave', () => this.onTriggerTouch(0, 0, false, false));
    };
    bindHold('touch-left', 0.85, -1);
    bindHold('touch-right', 0.85, 1);
    bindHold('touch-throttle', 1.0, 0);
    bindHold('touch-boost', 1.0, 0, true, false);
    bindHold('touch-drift', 0.9, 0.7, false, true);
  }

  public renderDrawerContent(): void {
    const modal = this.els.drawerModal;
    if (!modal || !this.activeDrawer) return;

    if (this.activeDrawer === 'contracts') {
      const missions = this.missions.getAvailableMissions();
      const completed = this.missions.getCompletedMissionIds();
      const activeId = this.missions.getActiveMission()?.mission.id ?? null;

      const cardsHtml = missions
        .map((m) => {
          const isDone = completed.has(m.id);
          const isActive = activeId === m.id;
          return `
            <div class="contract-card ${isActive ? 'active-card' : ''}">
              <div class="contract-meta">
                <div class="contract-tags">
                  <span class="district-tag" data-district="${m.district}">${t(`district.${m.district}.name`, this.locale)}</span>
                  <span class="cat-tag">${m.category.toUpperCase()} • ${m.stages.length} STAGES</span>
                  ${isDone ? '<span class="done-tag">✓ COMPLETED</span>' : ''}
                </div>
                <h4>${t(m.titleKey, this.locale)}</h4>
                <p>${t(m.briefKey, this.locale)}</p>
                <div class="contract-reward">+¥${m.rewardCredits} • +${m.rewardReputation} REP</div>
              </div>
              <button class="neo-btn ${isActive ? 'active' : 'amber'}" data-start-mission="${m.id}">
                ${isActive ? 'RESTART' : 'LAUNCH'}
              </button>
            </div>
          `;
        })
        .join('');

      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">HARBOUR DISPATCH // 16 CONTRACTS</div>
          <div style="display:flex; gap:8px;">
            ${activeId ? '<button class="neo-btn" id="btn-abandon-mission">FREE ROAM</button>' : ''}
            <button class="neo-btn" id="btn-close-drawer">CLOSE [ESC]</button>
          </div>
        </div>
        <div class="card-grid">${cardsHtml}</div>
      `;

      document.getElementById('btn-abandon-mission')?.addEventListener('click', () => {
        this.missions.abandonMission();
        this.showToast('FREE ROAM ENGAGED', 'Active contract paused — open bay navigation', 'cyan');
        this.renderDrawerContent();
      });

      modal.querySelectorAll('[data-start-mission]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-start-mission')!;
          this.missions.startMission(id);
          const m = this.missions.getActiveMission()?.mission;
          if (m) {
            this.showToast(
              `CONTRACT LAUNCHED: ${t(m.titleKey, this.locale)}`,
              t(m.stages[0].labelKey, this.locale),
              'amber',
            );
          }
          this.setDrawer(null);
        });
      });
    } else if (this.activeDrawer === 'shipyard') {
      const activeBoat = this.economy.getActiveBoat();
      const credits = this.economy.getCredits();

      const boatsHtml = (Object.keys(BOAT_ARCHETYPES) as BoatId[])
        .map((bid) => {
          const spec = BOAT_ARCHETYPES[bid];
          const unlocked = this.economy.isBoatUnlocked(bid);
          const isCurrent = activeBoat === bid;
          const canAfford = credits >= spec.unlockCost;
          const label = isCurrent
            ? 'ACTIVE HULL'
            : unlocked
              ? 'DEPLOY HULL'
              : `UNLOCK ¥${spec.unlockCost}`;
          const spdPct = Math.min(100, Math.round((spec.topSpeedMps / 45) * 100));
          const hpPct = Math.min(100, Math.round((spec.maxHullHp / 220) * 100));

          return `
            <div class="contract-card ${isCurrent ? 'active-card' : ''}">
              <div class="contract-meta" style="flex:1;">
                <h4>${t(spec.nameKey, this.locale)}</h4>
                <p>${t(spec.roleKey, this.locale)} • Top ${Math.round(spec.topSpeedMps * 1.94)} KTS • HP ${spec.maxHullHp}</p>
                <div class="mini-stat-bars">
                  <span>SPD <i style="width:${spdPct}%"></i></span>
                  <span>ARMOR <i style="width:${hpPct}%"></i></span>
                </div>
              </div>
              <button class="neo-btn ${isCurrent ? 'active' : unlocked || canAfford ? 'amber' : 'locked-btn'}" data-boat-select="${bid}">
                ${label}
              </button>
            </div>
          `;
        })
        .join('');

      const equipped = this.economy.getEquippedUpgrades(activeBoat);
      const upgradesHtml = (Object.keys(UPGRADE_CATALOG) as UpgradeId[])
        .map((uid) => {
          const u = UPGRADE_CATALOG[uid];
          const isEquipped = equipped[u.axis] === uid;
          const canAfford = credits >= u.cost;
          return `
            <div class="contract-card ${isEquipped ? 'active-card' : ''}">
              <div class="contract-meta">
                <div class="contract-tags">
                  <span class="cat-tag">${u.axis.toUpperCase()} AXIS</span>
                </div>
                <h4>${t(u.nameKey, this.locale)}</h4>
                <p>${t(u.descKey, this.locale)}</p>
                <div class="contract-reward">¥${u.cost}</div>
              </div>
              <button class="neo-btn ${isEquipped ? 'active' : canAfford ? 'amber' : 'locked-btn'}" data-buy-upgrade="${uid}">
                ${isEquipped ? 'EQUIPPED' : 'INSTALL'}
              </button>
            </div>
          `;
        })
        .join('');

      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">MIRAI MARINA SHIPYARD & TUNING</div>
          <button class="neo-btn" id="btn-close-drawer">CLOSE [ESC]</button>
        </div>
        <div class="shipyard-balance-bar">
          <span>AVAILABLE CREDITS: <strong style="color:var(--amber)">¥${credits}</strong></span>
          <button class="neo-btn" id="btn-repair-hull">🔧 EMERGENCY REPAIR (¥150)</button>
        </div>
        <h4 class="drawer-section-title">VESSEL FLEET (3 ARCHETYPES)</h4>
        <div class="card-grid">${boatsHtml}</div>
        <h4 class="drawer-section-title">NON-LINEAR TRADE-OFF TUNING</h4>
        <div class="card-grid">${upgradesHtml}</div>
      `;

      document.getElementById('btn-repair-hull')?.addEventListener('click', () => {
        if (this.onRepairBoat()) {
          this.showToast('HULL REPAIRED TO 100%', 'Structural integrity restored (-¥150)', 'emerald');
        } else {
          this.showToast('INSUFFICIENT CREDITS', 'Need ¥150 for emergency hull repair', 'crimson');
        }
        this.renderDrawerContent();
      });

      modal.querySelectorAll('[data-boat-select]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const bid = (e.currentTarget as HTMLElement).getAttribute('data-boat-select') as BoatId;
          const spec = BOAT_ARCHETYPES[bid];
          if (this.economy.unlockAndSelectBoat(bid)) {
            this.onSelectBoat(bid);
            this.showToast(`DEPLOYED: ${t(spec.nameKey, this.locale)}`, t(spec.roleKey, this.locale), 'cyan');
            this.renderDrawerContent();
          } else {
            this.showToast(
              'INSUFFICIENT CREDITS',
              `Need ¥${spec.unlockCost} to unlock ${t(spec.nameKey, this.locale)} (Balance: ¥${this.economy.getCredits()})`,
              'crimson',
            );
          }
        });
      });

      modal.querySelectorAll('[data-buy-upgrade]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const uid = (e.currentTarget as HTMLElement).getAttribute('data-buy-upgrade') as UpgradeId;
          const u = UPGRADE_CATALOG[uid];
          const equippedNow = this.economy.getEquippedUpgrades(this.economy.getActiveBoat());
          if (equippedNow[u.axis] === uid) {
            this.showToast('ALREADY EQUIPPED', t(u.nameKey, this.locale), 'cyan');
            return;
          }
          if (this.economy.purchaseUpgrade(this.economy.getActiveBoat(), uid)) {
            this.onSelectBoat(this.economy.getActiveBoat());
            this.showToast(`INSTALLED: ${t(u.nameKey, this.locale)}`, t(u.descKey, this.locale), 'emerald');
            this.renderDrawerContent();
          } else {
            this.showToast(
              'INSUFFICIENT CREDITS',
              `Need ¥${u.cost} to install ${t(u.nameKey, this.locale)} (Balance: ¥${this.economy.getCredits()})`,
              'crimson',
            );
          }
        });
      });
    } else if (this.activeDrawer === 'settings') {
      modal.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title">WCAG 2.2 AA & MOTION COMFORT</div>
          <button class="neo-btn" id="btn-close-drawer">CLOSE [ESC]</button>
        </div>
        <div class="card-grid">
          <div class="contract-card">
            <div class="contract-meta">
              <h4>Camera Wave Bob Scale (<span id="val-bob">${Math.round(this.accessibility.cameraBob * 100)}%</span>)</h4>
              <p>Reduces vertical sea-swell camera oscillation</p>
            </div>
            <input type="range" min="0" max="1" step="0.1" value="${this.accessibility.cameraBob}" id="rng-bob" />
          </div>
          <div class="contract-card">
            <div class="contract-meta">
              <h4>Speed FOV Kick Scale (<span id="val-fov">${Math.round(this.accessibility.fovKick * 100)}%</span>)</h4>
              <p>Controls perspective widening during hydro-boost</p>
            </div>
            <input type="range" min="0" max="1" step="0.1" value="${this.accessibility.fovKick}" id="rng-fov" />
          </div>
          <div class="contract-card">
            <div class="contract-meta">
              <h4>Weather Rain & Storm Streaks</h4>
              <p>Toggles high-density precipitation particle streaks</p>
            </div>
            <button class="neo-btn ${this.accessibility.rainStreaks ? 'active' : ''}" id="btn-rain-toggle">
              ${this.accessibility.rainStreaks ? 'ENABLED' : 'OFF'}
            </button>
          </div>
          <div class="contract-card">
            <div class="contract-meta">
              <h4>High-Contrast Telemetry HUD</h4>
              <p>Maximizes panel opacity and WCAG 2.2 AA contrast</p>
            </div>
            <button class="neo-btn ${this.accessibility.highContrast ? 'active' : ''}" id="btn-hc-toggle">
              ${this.accessibility.highContrast ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      `;

      document.getElementById('rng-bob')?.addEventListener('input', (e) => {
        this.accessibility.cameraBob = parseFloat((e.target as HTMLInputElement).value);
        const v = document.getElementById('val-bob');
        if (v) v.textContent = `${Math.round(this.accessibility.cameraBob * 100)}%`;
      });
      document.getElementById('rng-fov')?.addEventListener('input', (e) => {
        this.accessibility.fovKick = parseFloat((e.target as HTMLInputElement).value);
        const v = document.getElementById('val-fov');
        if (v) v.textContent = `${Math.round(this.accessibility.fovKick * 100)}%`;
      });
      document.getElementById('btn-rain-toggle')?.addEventListener('click', () => {
        this.accessibility.rainStreaks = !this.accessibility.rainStreaks;
        this.renderDrawerContent();
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
    controlInput?: BoatControlInput,
    targetScreenProj?: ScreenProjectionResult | null,
  ): void {
    const loc = this.locale;

    this.setText('hud-app-title', t('app.title', loc));
    this.setText(
      'hud-district-label',
      `${t(`district.${worldStats.currentDistrict}.name`, loc)} — ${t(`district.${worldStats.currentDistrict}.desc`, loc)}`,
    );
    this.setText('hud-economy-credits', `¥${this.economy.getCredits()}`);
    this.setText('hud-economy-rep', `${t('hud.reputation', loc)} ${this.economy.getReputation()}`);

    const activeSpec = BOAT_ARCHETYPES[this.economy.getActiveBoat()];
    this.setText('hud-active-boat-name', t(activeSpec.nameKey, loc));

    // Top Action Buttons localization
    this.setText('btn-drawer-contracts', t('hud.btn.contracts', loc));
    this.setText('btn-drawer-shipyard', t('hud.btn.shipyard', loc));
    this.setText('btn-camera-cycle', t('hud.btn.camera', loc));
    this.setText('btn-time-cycle', t(`hud.time.${atmosState.phase}`, loc));
    this.setText('btn-weather-cycle', t(`hud.weather.${atmosState.weather}`, loc));
    this.setText('btn-lights-toggle', t(lightsOn ? 'hud.lights.on' : 'hud.lights.off', loc));
    this.setText('btn-drawer-settings', t('hud.btn.settings', loc));
    this.setText('btn-diag-toggle', t('hud.btn.diagnostics', loc));
    this.setText('hud-hull-label', t('hud.hull', loc));
    this.setText('hud-sig-label', t('hud.signature', loc));

    // Harbour Heat
    this.els['hud-heat-cluster']?.setAttribute('data-stage', heatState.stage);
    this.setText('hud-heat-header', `${t('hud.heat.label', loc)} (${Math.round(heatState.heatScore)}%)`);
    this.setText('hud-heat-status', t(`hud.heat.${heatState.stage.toLowerCase()}`, loc));

    const level =
      heatState.stage === 'Lockdown'
        ? 4
        : heatState.stage === 'Pursuit'
          ? 3
          : heatState.stage === 'Alert'
            ? 2
            : 0;
    const pipKey = `${level}`;
    if (pipKey !== this.lastHeatPipKey && this.els['hud-heat-pips']) {
      this.lastHeatPipKey = pipKey;
      this.els['hud-heat-pips'].innerHTML = [1, 2, 3, 4]
        .map((idx) => `<div class="heat-pip ${idx <= level ? `active-${Math.min(3, level)}` : ''}"></div>`)
        .join('');
    }

    // Active Mission Tracker & Screen-Space 3D Waypoint
    const activeMission = this.missions.getActiveMission();
    const wpEl = this.els['hud-screen-waypoint'];

    if (activeMission) {
      this.setText(
        'hud-mission-badge',
        `STAGE ${activeMission.stageIndex + 1}/${activeMission.mission.stages.length}`,
      );
      this.setText('hud-mission-title', t(activeMission.mission.titleKey, loc));
      this.setText('hud-mission-stage', t(activeMission.currentStage.labelKey, loc));

      const d = Math.round(
        Math.hypot(
          boatState.position.x - activeMission.currentStage.targetPos.x,
          boatState.position.z - activeMission.currentStage.targetPos.z,
        ),
      );
      this.setText(
        'hud-mission-timer',
        activeMission.stageRemainingSec !== null ? `⏱ ${Math.ceil(activeMission.stageRemainingSec)}s` : '',
      );
      this.setText('hud-mission-dist', `${t('hud.target.label', loc)}: ${d}m`);

      if (wpEl && targetScreenProj) {
        wpEl.style.display = 'flex';
        const padX = 56;
        const padY = 88;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const clampedX = Math.max(padX, Math.min(vw - padX, targetScreenProj.x));
        const clampedY = Math.max(padY, Math.min(vh - padY, targetScreenProj.y));
        wpEl.style.transform = `translate3d(${Math.round(clampedX)}px, ${Math.round(clampedY)}px, 0)`;
        wpEl.classList.toggle('offscreen', !targetScreenProj.isOnScreen);
        this.setText('hud-waypoint-text', `${d}m`);
      }
    } else {
      this.setText('hud-mission-badge', 'FREE ROAM');
      this.setText('hud-mission-timer', '');
      this.setText(
        'hud-mission-title',
        loc === 'ja' ? 'フリーローム // 契約を選択 [M]' : 'FREE ROAM // SELECT CONTRACT [M]',
      );
      this.setText(
        'hud-mission-stage',
        loc === 'ja'
          ? 'WASD/矢印: 操船 • Shift: ブースト • Space: ドリフト • L: 消灯ステルス'
          : 'WASD/Arrows: Steer • Shift: Boost • Space: Drift • L: Stealth Lights',
      );
      this.setText(
        'hud-mission-dist',
        `${this.missions.getCompletedMissionIds().size} / 16 CONTRACTS COMPLETED`,
      );
      if (wpEl) wpEl.style.display = 'none';
    }

    // Coordinates & Speedometer + Tachometer Arc
    this.setText(
      'hud-coords-label',
      `(${Math.round(boatState.position.x)}, ${Math.round(boatState.position.z)})`,
    );

    const knots = Math.round(boatState.speedKnots);
    const kmh = Math.round(boatState.speedMps * 3.6);
    this.setText('hud-speed-val', String(knots).padStart(2, '0'));
    this.setText('hud-speed-unit', `${t('hud.knots', loc)} // ${String(kmh).padStart(2, '0')} KM/H`);

    const speedRatio = Math.min(1, boatState.speedMps / Math.max(1, activeSpec.topSpeedMps * 1.25));
    const arcLen = Math.round(speedRatio * 216);
    this.els['hud-tach-arc']?.setAttribute('stroke-dasharray', `${arcLen} 300`);

    // Active Control State Pills
    this.els['pill-boost']?.classList.toggle('active-amber', Boolean(controlInput?.boost));
    this.els['pill-drift']?.classList.toggle('active-cyan', Boolean(controlInput?.drift || boatState.driftSlipAngleDeg > 14));
    this.els['pill-stealth']?.classList.toggle('active-emerald', !lightsOn || underBridge);

    // Hull & Stealth Bars
    const hullPercent = Math.round((boatState.hullHp / Math.max(1, boatState.maxHullHp)) * 100);
    this.setText('hud-hull-val', `${hullPercent}%`);
    if (this.els['hud-hull-bar']) {
      this.els['hud-hull-bar'].style.width = `${hullPercent}%`;
      this.els['hud-hull-bar'].style.background =
        hullPercent < 35 ? 'var(--crimson)' : hullPercent < 70 ? 'var(--amber)' : 'var(--emerald)';
    }
    if (this.els['btn-inline-repair']) {
      this.els['btn-inline-repair'].style.display = hullPercent < 98 ? 'inline-block' : 'none';
    }

    const sigPercent = Math.round(signature * 100);
    this.setText('hud-sig-val', `${sigPercent}%`);
    if (this.els['hud-sig-bar']) {
      this.els['hud-sig-bar'].style.width = `${sigPercent}%`;
    }

    this.setText(
      'hud-stealth-status',
      underBridge ? t('hud.cover.active', loc) : t('hud.cover.exposed', loc),
    );

    const targetPos = activeMission?.currentStage.targetPos ?? null;
    this.drawCompass(boatState, targetPos, patrols);
    this.drawRadar(boatState, patrols, traffic, signature, targetPos);

    if (this.diagnosticsOpen && this.els.diagPanel) {
      const recent = this.telemetry
        .getRecentEvents(4)
        .map((e) => `${e.type}`)
        .join(', ');
      const html = `
        <div><strong>CTO TELEMETRY & STREAMING GATE</strong></div>
        <div>FPS: ${perfMetrics.fps} | Frame: ${perfMetrics.frameTimeMs}ms (P95: ${perfMetrics.p95FrameTimeMs}ms)</div>
        <div>Draw Calls: ${perfMetrics.drawCalls} (Budget ≤500) | Tris: ${perfMetrics.triangles}</div>
        <div>Cells: ${worldStats.activeCellCount} (Phys:${worldStats.physicsCellCount} HD:${worldStats.highDetailCellCount} Sil:${worldStats.silhouetteCellCount})</div>
        <div>Disposed: ${worldStats.disposedResources} | Leaked: ${worldStats.leakedResources}</div>
        <div>Pos: (${Math.round(boatState.position.x)}, ${Math.round(boatState.position.y * 10) / 10}m, ${Math.round(boatState.position.z)}) | Slip: ${Math.round(boatState.driftSlipAngleDeg)}°</div>
        <div>Ledger Reconciled: ¥${this.economy.reconcileLedger()}</div>
        <div>Events: ${recent}</div>
      `;
      if (html !== this.lastDiagHtml) {
        this.lastDiagHtml = html;
        this.els.diagPanel.innerHTML = html;
      }
    }
  }

  private setText(id: string, value: string): void {
    const el = this.els[id];
    if (el && el.textContent !== value) {
      el.textContent = value;
    }
  }

  private drawCompass(
    boat: BoatTelemetryState,
    missionTarget: { x: number; z: number } | null,
    patrols: PatrolUnit[],
  ): void {
    const ctx = this.compassCtx;
    const w = this.compassCanvas.width;
    const h = this.compassCanvas.height;
    const cx = w / 2;

    ctx.clearRect(0, 0, w, h);

    // Compass heading in degrees where 0 = North (-Z), 90 = East (+X)
    const rawDeg = ((-boat.headingRad * 180) / Math.PI + 360) % 360;
    const pxPerDeg = 2.6;

    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    const cardinals: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
    };

    for (let deg = -90; deg <= 450; deg += 15) {
      const normDeg = ((deg % 360) + 360) % 360;
      let diff = deg - rawDeg;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      const x = cx + diff * pxPerDeg;
      if (x < 12 || x > w - 12) continue;

      const label = cardinals[normDeg];
      if (label) {
        ctx.fillStyle = normDeg === 0 ? '#ffae00' : '#00f2ff';
        ctx.fillText(label, x, 13);
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x, 17);
        ctx.lineTo(x, 26);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(233, 247, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, 26);
        ctx.stroke();
      }
    }

    // Active Mission Bearing Diamond on Compass Tape
    if (missionTarget) {
      const tx = missionTarget.x - boat.position.x;
      const tz = missionTarget.z - boat.position.z;
      const targetRad = Math.atan2(-tx, -tz);
      const targetDeg = ((-targetRad * 180) / Math.PI + 360) % 360;
      let diff = targetDeg - rawDeg;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      const bx = Math.max(14, Math.min(w - 14, cx + diff * pxPerDeg));

      ctx.fillStyle = '#ffae00';
      ctx.beginPath();
      ctx.moveTo(bx, 4);
      ctx.lineTo(bx + 5, 9);
      ctx.lineTo(bx, 14);
      ctx.lineTo(bx - 5, 9);
      ctx.closePath();
      ctx.fill();
    }

    // Alerted Patrol Blips on Compass Tape
    for (const p of patrols) {
      if (!p.alerted) continue;
      const px = p.position.x - boat.position.x;
      const pz = p.position.z - boat.position.z;
      if (Math.hypot(px, pz) > 420) continue;
      const pRad = Math.atan2(-px, -pz);
      const pDeg = ((-pRad * 180) / Math.PI + 360) % 360;
      let diff = pDeg - rawDeg;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      const bx = Math.max(14, Math.min(w - 14, cx + diff * pxPerDeg));
      ctx.fillStyle = '#ff2a3c';
      ctx.fillRect(bx - 2, 25, 4, 4);
    }

    // Center Lubber Line & Digital Heading Readout
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, 29);
    ctx.lineTo(cx - 4, 32);
    ctx.lineTo(cx + 4, 32);
    ctx.closePath();
    ctx.fill();
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

    // Crosshairs & Radar rings
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx, h - 6);
    ctx.moveTo(6, cy);
    ctx.lineTo(w - 6, cy);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 242, 255, 0.22)';
    for (const r of [24, 48, 70]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player acoustic/visual stealth signature ring
    ctx.strokeStyle = 'rgba(255, 174, 0, 0.6)';
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

    // Patrol blips & search cones
    for (const p of patrols) {
      const rx = cx + (p.position.x - boat.position.x) * scale;
      const ry = cy + (p.position.z - boat.position.z) * scale;
      if (Math.hypot(rx - cx, ry - cy) < 70) {
        const coneRangePx = p.detectionRangeM * (0.45 + signature * 0.75) * scale;
        const forwardAngle = -p.headingRad - Math.PI / 2;
        ctx.fillStyle = p.alerted ? 'rgba(255, 42, 60, 0.20)' : 'rgba(255, 30, 142, 0.15)';
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.arc(
          rx,
          ry,
          coneRangePx,
          forwardAngle - p.searchConeAngleRad * 0.5,
          forwardAngle + p.searchConeAngleRad * 0.5,
        );
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = p.alerted ? '#ff2a3c' : '#ff1e8e';
        ctx.beginPath();
        ctx.arc(rx, ry, 3.8, 0, Math.PI * 2);
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

      // Dashed guide line from player to objective
      ctx.strokeStyle = 'rgba(255, 174, 0, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffae00';
      ctx.beginPath();
      ctx.arc(bx, by, 4.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player center chevron
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-boat.headingRad);
    ctx.fillStyle = '#00f2ff';
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.8, 5.2);
    ctx.lineTo(0, 3.2);
    ctx.lineTo(-4.8, 5.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
