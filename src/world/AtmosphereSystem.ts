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
  neonEmissionScale: number;
}

export class AtmosphereSystem {
  private hour24 = 21.5; // Start in signature "Japan After Dark" neon night
  private weather: WeatherState = 'clear';
  private timeScaleHoursPerSec = 0.035;

  public setWeather(weather: WeatherState): void {
    this.weather = weather;
  }

  public getWeather(): WeatherState {
    return this.weather;
  }

  public setHour(hour: number): void {
    this.hour24 = ((hour % 24) + 24) % 24;
  }

  public update(dt: number): AtmosphereLightingState {
    this.hour24 = (this.hour24 + dt * this.timeScaleHoursPerSec) % 24;
    return this.getState();
  }

  public getState(): AtmosphereLightingState {
    const h = this.hour24;
    let phase: TimeOfDayPhase = 'neon_night';
    let skyColorHex = 0x050914;
    let fogColorHex = 0x070d1c;
    let sunIntensity = 0.35;
    let sunColorHex = 0x4f8cff;
    let neonEmissionScale = 1.45;

    if (h >= 5.5 && h < 10.5) {
      phase = 'morning_haze';
      skyColorHex = 0x2d4866;
      fogColorHex = 0x45627d;
      sunIntensity = 1.1;
      sunColorHex = 0xffcfa3;
      neonEmissionScale = 0.55;
    } else if (h >= 10.5 && h < 16.5) {
      phase = 'clear_afternoon';
      skyColorHex = 0x1e5785;
      fogColorHex = 0x2b6894;
      sunIntensity = 1.65;
      sunColorHex = 0xfff5e4;
      neonEmissionScale = 0.3;
    } else if (h >= 16.5 && h < 19.5) {
      phase = 'golden_hour';
      skyColorHex = 0x2c1b3d;
      fogColorHex = 0x4a2545;
      sunIntensity = 1.25;
      sunColorHex = 0xff7b3d;
      neonEmissionScale = 1.1;
    }

    let fogDensity = 0.00075;
    if (this.weather === 'rain') fogDensity = 0.0014;
    else if (this.weather === 'fog') fogDensity = 0.0026;
    else if (this.weather === 'storm') fogDensity = 0.0021;

    return {
      hour24: this.hour24,
      phase,
      weather: this.weather,
      skyColorHex,
      fogColorHex,
      fogDensity,
      sunIntensity,
      sunColorHex,
      neonEmissionScale,
    };
  }
}
