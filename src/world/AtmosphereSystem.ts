import { WeatherState } from '../core/WaterField';

export type TimeOfDayPhase = 'morning_haze' | 'clear_afternoon' | 'golden_hour' | 'neon_night';

export interface AtmosphereLightingState {
  hour24: number;
  phase: TimeOfDayPhase;
  weather: WeatherState;
  skyColorHex: number;
  fogColorHex: number;
  fogDensity: number;
  sunIntensity: number;
  sunColorHex: number;
  ambientIntensity: number;
  neonEmissionScale: number;
}

export class AtmosphereSystem {
  private hour24 = 18.2; // Start at dramatic Neon Dusk / Golden Hour so skyline, water, and neon all pop immediately
  private weather: WeatherState = 'clear';
  private timeScaleHoursPerSec = 0.025;

  public setWeather(weather: WeatherState): void {
    this.weather = weather;
  }

  public getWeather(): WeatherState {
    return this.weather;
  }

  public setHour(hour: number): void {
    this.hour24 = ((hour % 24) + 24) % 24;
  }

  public cycleTimePhase(): TimeOfDayPhase {
    const phases: Array<{ hour: number; phase: TimeOfDayPhase }> = [
      { hour: 8.0, phase: 'morning_haze' },
      { hour: 13.5, phase: 'clear_afternoon' },
      { hour: 18.2, phase: 'golden_hour' },
      { hour: 22.0, phase: 'neon_night' },
    ];
    const current = this.getState().phase;
    const idx = phases.findIndex((p) => p.phase === current);
    const next = phases[(idx + 1) % phases.length];
    this.hour24 = next.hour;
    return next.phase;
  }

  public update(dt: number): AtmosphereLightingState {
    this.hour24 = (this.hour24 + dt * this.timeScaleHoursPerSec) % 24;
    return this.getState();
  }

  public getState(): AtmosphereLightingState {
    const h = this.hour24;
    let phase: TimeOfDayPhase = 'neon_night';
    let skyColorHex = 0x0b1930;
    let fogColorHex = 0x102342;
    let sunIntensity = 1.25;
    let sunColorHex = 0x72b6ff;
    let ambientIntensity = 1.45;
    let neonEmissionScale = 1.85;

    if (h >= 5.5 && h < 10.5) {
      phase = 'morning_haze';
      skyColorHex = 0x3b6998;
      fogColorHex = 0x4d7ca8;
      sunIntensity = 1.8;
      sunColorHex = 0xffdfba;
      ambientIntensity = 1.75;
      neonEmissionScale = 0.85;
    } else if (h >= 10.5 && h < 16.5) {
      phase = 'clear_afternoon';
      skyColorHex = 0x2674b8;
      fogColorHex = 0x3582c4;
      sunIntensity = 2.2;
      sunColorHex = 0xfff8eb;
      ambientIntensity = 2.0;
      neonEmissionScale = 0.65;
    } else if (h >= 16.5 && h < 19.8) {
      phase = 'golden_hour';
      skyColorHex = 0x241f47;
      fogColorHex = 0x3d295c;
      sunIntensity = 1.75;
      sunColorHex = 0xff8a47;
      ambientIntensity = 1.65;
      neonEmissionScale = 1.55;
    }

    let fogDensity = 0.00042;
    if (this.weather === 'rain') fogDensity = 0.00075;
    else if (this.weather === 'fog') fogDensity = 0.00115;
    else if (this.weather === 'storm') fogDensity = 0.00095;

    return {
      hour24: this.hour24,
      phase,
      weather: this.weather,
      skyColorHex,
      fogColorHex,
      fogDensity,
      sunIntensity,
      sunColorHex,
      ambientIntensity,
      neonEmissionScale,
    };
  }
}
