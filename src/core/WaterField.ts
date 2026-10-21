export type WeatherState = 'clear' | 'rain' | 'fog' | 'storm';

export interface WaveOctave {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
  speed: number;
}

export interface WaterSample {
  height: number;
  normal: { x: number; y: number; z: number };
}

const BASE_OCTAVES: readonly WaveOctave[] = [
  { dirX: 0.85, dirZ: 0.52, amplitude: 0.28, wavelength: 24.0, speed: 2.1 },
  { dirX: -0.45, dirZ: 0.89, amplitude: 0.16, wavelength: 13.5, speed: 2.8 },
  { dirX: 0.25, dirZ: -0.96, amplitude: 0.09, wavelength: 7.2, speed: 3.4 },
  { dirX: -0.92, dirZ: -0.39, amplitude: 0.05, wavelength: 4.1, speed: 4.1 },
];

const WEATHER_AMP_SCALE: Record<WeatherState, number> = {
  clear: 0.85,
  fog: 0.65,
  rain: 1.35,
  storm: 2.45,
};

export class WaterField {
  static getWeatherScale(weather: WeatherState): number {
    return WEATHER_AMP_SCALE[weather] ?? 1.0;
  }

  static getOctaves(): readonly WaveOctave[] {
    return BASE_OCTAVES;
  }

  /**
   * Deterministic analytic multi-octave wave height & normal sampling.
   * Shared identically between CPU 8-point Rapier buoyancy and GPU water shader.
   */
  static sample(x: number, z: number, time: number, weather: WeatherState = 'clear'): WaterSample {
    const scale = WEATHER_AMP_SCALE[weather] ?? 1.0;
    let height = 0;
    let dHdX = 0;
    let dHdZ = 0;

    for (let i = 0; i < BASE_OCTAVES.length; i++) {
      const o = BASE_OCTAVES[i];
      const k = (Math.PI * 2) / o.wavelength;
      const amp = o.amplitude * scale;
      const phase = k * (o.dirX * x + o.dirZ * z) + time * o.speed;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);

      height += amp * sinP;
      dHdX += amp * k * o.dirX * cosP;
      dHdZ += amp * k * o.dirZ * cosP;
    }

    const nx = -dHdX;
    const ny = 1.0;
    const nz = -dHdZ;
    const invLen = 1.0 / Math.hypot(nx, ny, nz);

    return {
      height,
      normal: {
        x: nx * invLen,
        y: ny * invLen,
        z: nz * invLen,
      },
    };
  }
}
