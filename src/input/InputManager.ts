import { BoatControlInput } from '../physics/BoatDynamics';

export interface ActionInputState extends BoatControlInput {
  lightsTogglePressed: boolean;
  gadgetPressed: boolean;
  interactPressed: boolean;
  mapTogglePressed: boolean;
  shipyardTogglePressed: boolean;
  cameraTogglePressed: boolean;
  timeCyclePressed: boolean;
  weatherCyclePressed: boolean;
  repairPressed: boolean;
  escapePressed: boolean;
  diagnosticsTogglePressed: boolean;
  cameraOrbitX: number;
  cameraOrbitY: number;
}

export class InputManager {
  private keys = new Set<string>();
  private oneShotPressed = new Set<string>();
  private touchThrottle = 0;
  private touchSteer = 0;
  private touchBoost = false;
  private touchDrift = false;
  private cameraOrbitX = 0;
  private cameraOrbitY = 0;
  private isDraggingOrbit = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(targetWindow?: Window) {
    if (!targetWindow) return;
    targetWindow.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Space') {
        e.preventDefault();
      }
      const code = e.code;
      if (!this.keys.has(code)) {
        this.oneShotPressed.add(code);
      }
      this.keys.add(code);
    });
    targetWindow.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    targetWindow.addEventListener('blur', () => {
      this.keys.clear();
      this.isDraggingOrbit = false;
    });
    targetWindow.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') {
        e.preventDefault();
      }
    });
    targetWindow.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') {
        this.isDraggingOrbit = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    });
    targetWindow.addEventListener('pointermove', (e) => {
      if (!this.isDraggingOrbit) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.cameraOrbitX = Math.max(-Math.PI, Math.min(Math.PI, this.cameraOrbitX - dx * 0.006));
      this.cameraOrbitY = Math.max(-0.35, Math.min(0.65, this.cameraOrbitY + dy * 0.004));
    });
    targetWindow.addEventListener('pointerup', () => {
      this.isDraggingOrbit = false;
    });
  }

  public setTouchControl(throttle: number, steer: number, boost = false, drift = false): void {
    this.touchThrottle = throttle;
    this.touchSteer = steer;
    this.touchBoost = boost;
    this.touchDrift = drift;
  }

  public triggerVirtualKey(code: string): void {
    this.oneShotPressed.add(code);
  }

  public poll(): ActionInputState {
    let throttle = this.touchThrottle;
    let steer = this.touchSteer;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) throttle += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) throttle -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer += 1;

    let boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchBoost;
    let drift = this.keys.has('Space') || this.touchDrift;

    // Poll Gamepad API if connected
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const pad = pads?.[0];
      if (pad) {
        const lx = Math.abs(pad.axes[0] ?? 0) > 0.12 ? pad.axes[0] : 0;
        const rt = pad.buttons[7]?.value ?? 0;
        const lt = pad.buttons[6]?.value ?? 0;
        if (Math.abs(lx) > 0) steer = lx;
        if (rt > 0.05 || lt > 0.05) throttle = rt - lt;
        if (pad.buttons[0]?.pressed) boost = true;
        if (pad.buttons[1]?.pressed) drift = true;
      }
    }

    const consumeOneShot = (code: string): boolean => {
      if (this.oneShotPressed.has(code)) {
        this.oneShotPressed.delete(code);
        return true;
      }
      return false;
    };

    // Gently decay manual orbit back toward chase alignment when driving forward
    if (!this.isDraggingOrbit && Math.abs(throttle) > 0.1) {
      this.cameraOrbitX *= 0.94;
      this.cameraOrbitY *= 0.94;
      if (Math.abs(this.cameraOrbitX) < 0.005) this.cameraOrbitX = 0;
      if (Math.abs(this.cameraOrbitY) < 0.005) this.cameraOrbitY = 0;
    }

    return {
      throttle: Math.max(-1, Math.min(1, throttle)),
      steer: Math.max(-1, Math.min(1, steer)),
      boost,
      drift,
      lightsTogglePressed: consumeOneShot('KeyL'),
      gadgetPressed: consumeOneShot('KeyE'),
      interactPressed: consumeOneShot('KeyF'),
      mapTogglePressed: consumeOneShot('KeyM'),
      shipyardTogglePressed: consumeOneShot('KeyB'),
      cameraTogglePressed: consumeOneShot('KeyC'),
      timeCyclePressed: consumeOneShot('KeyT'),
      weatherCyclePressed: consumeOneShot('KeyV'),
      repairPressed: consumeOneShot('KeyR'),
      escapePressed: consumeOneShot('Escape'),
      diagnosticsTogglePressed: consumeOneShot('F3'),
      cameraOrbitX: this.cameraOrbitX,
      cameraOrbitY: this.cameraOrbitY,
    };
  }
}
