import { WeatherState } from '../core/WaterField';

export interface StealthInput {
  lightsOn: boolean;
  throttle: number; // -1..1
  weather: WeatherState;
  underBridge: boolean;
  nearTraffic: boolean;
  exhaustNoiseMultiplier?: number;
}

export class StealthSystem {
  /**
   * Computes normalized maritime detection signature in [0.05 .. 1.0].
   * Lower signature shrinks patrol search cones and speeds up Harbour Heat cooldown.
   */
  static computeSignature(input: StealthInput): number {
    const absThrottle = Math.abs(input.throttle);
    const noiseMult = input.exhaustNoiseMultiplier ?? 1.0;

    // Visual signature (headlights & open skyline exposure)
    const visualBase = input.lightsOn ? 0.48 : 0.14;
    const weatherVisFactor =
      input.weather === 'fog'
        ? 0.45
        : input.weather === 'rain'
          ? 0.62
          : input.weather === 'storm'
            ? 0.52
            : 1.0;

    // Acoustic engine noise signature
    const acousticBase = (0.08 + absThrottle * 0.44) * noiseMult;

    let raw = visualBase * weatherVisFactor + acousticBase;

    if (input.underBridge) {
      raw *= 0.48;
    }
    if (input.nearTraffic) {
      raw *= 0.68;
    }

    return Math.max(0.05, Math.min(1.0, Number(raw.toFixed(4))));
  }
}
