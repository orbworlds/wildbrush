/**
 * Hand-tuned sky keyframes across the 24-hour day and the sun and moon paths, blended into one sky state of colours, light intensities, fog, stars and exposure.
 */
import { Color, MathUtils, Vector3 } from 'three';
import { clamp, smoothstep } from '../core/math.js';
const SUNSET_HOUR = 18.6;
const LATITUDE = MathUtils.degToRad(32);
const SKY_KEYFRAMES = [
  {
    h: 0,
    zenith: 727614,
    horizon: 2770033,
    key: 10335999,
    keyI: 0.62,
    hemiSky: 0x4a6aa8,
    hemiGround: 0x1d2536,
    hemiI: 1,
    glow: 0x5a78b8,
    glowI: 0.25,
    cloudLit: 4874126,
    cloudShade: 0x1b2748,
    fogD: 0.002,
    fogH: 0.0014,
    stars: 1,
    exposure: 1.25,
  },
  {
    h: 4.4,
    zenith: 991047,
    horizon: 3032694,
    key: 10335999,
    keyI: 0.55,
    hemiSky: 0x4a6aa8,
    hemiGround: 0x1d2536,
    hemiI: 0.95,
    glow: 0x5a78b8,
    glowI: 0.25,
    cloudLit: 4874126,
    cloudShade: 0x1b2748,
    fogD: 0.00211,
    fogH: 0.0024,
    stars: 0.95,
    exposure: 1.25,
  },
  {
    h: 5.3,
    zenith: 2375290,
    horizon: 10125214,
    key: 16750704,
    keyI: 0.2,
    hemiSky: 0x6078b0,
    hemiGround: 0x2e2c3a,
    hemiI: 0.9,
    glow: 0xff9a78,
    glowI: 0.8,
    cloudLit: 13666954,
    cloudShade: 0x3a3e6a,
    fogD: 0.00221,
    fogH: 0.0042,
    stars: 0.45,
    exposure: 1.25,
  },
  {
    h: 6,
    zenith: 3892136,
    horizon: 15771784,
    key: 16752752,
    keyI: 0.9,
    hemiSky: 0x7e92c4,
    hemiGround: 0x4a4048,
    hemiI: 0.95,
    glow: 0xffa36e,
    glowI: 1.2,
    cloudLit: 16757902,
    cloudShade: 0x6a6a96,
    fogD: 0.00221,
    fogH: 0.0045,
    stars: 0.1,
    exposure: 1.25,
  },
  {
    h: 6.8,
    zenith: 5210824,
    horizon: 16174502,
    key: 16761998,
    keyI: 2.1,
    hemiSky: 0x93aad6,
    hemiGround: 0x5e5446,
    hemiI: 1,
    glow: 0xffc08a,
    glowI: 1,
    cloudLit: 16769218,
    cloudShade: 0x8a8ab0,
    fogD: 0.00211,
    fogH: 0.0034,
    stars: 0,
    exposure: 1.1,
  },
  {
    h: 8.5,
    zenith: 4885206,
    horizon: 13229290,
    key: 16770240,
    keyI: 2.85,
    hemiSky: 0x9fc0e8,
    hemiGround: 0x6a5e4c,
    hemiI: 1,
    glow: 0xfff0d8,
    glowI: 0.55,
    cloudLit: 16777215,
    cloudShade: 0xa4b0cc,
    fogD: 0.00187,
    fogH: 0.0012,
    stars: 0,
    exposure: 1,
  },
  {
    h: 12.3,
    zenith: 3505883,
    horizon: 12572654,
    key: 16774372,
    keyI: 3.1,
    hemiSky: 0xa3c6ee,
    hemiGround: 0x6e624e,
    hemiI: 1,
    glow: 0xfff6e8,
    glowI: 0.45,
    cloudLit: 16777215,
    cloudShade: 0xa8b6d2,
    fogD: 0.00177,
    fogH: 0.0005,
    stars: 0,
    exposure: 1,
  },
  {
    h: 15.5,
    zenith: 3834070,
    horizon: 13163496,
    key: 16771528,
    keyI: 3,
    hemiSky: 0xa2c2e8,
    hemiGround: 0x74644c,
    hemiI: 1,
    glow: 0xffeccc,
    glowI: 0.55,
    cloudLit: 16775920,
    cloudShade: 0xa8b0cc,
    fogD: 0.00177,
    fogH: 0.0006,
    stars: 0,
    exposure: 1,
  },
  {
    h: 17.2,
    zenith: 5539528,
    horizon: 15783852,
    key: 16764814,
    keyI: 2.7,
    hemiSky: 0x9eb6dc,
    hemiGround: 0x7a6248,
    hemiI: 1,
    glow: 0xffc27a,
    glowI: 0.95,
    cloudLit: 16769712,
    cloudShade: 0x9c94b4,
    fogD: 0.00187,
    fogH: 0.0009,
    stars: 0,
    exposure: 1.02,
  },
  {
    h: 18.2,
    zenith: 4877488,
    horizon: 16756338,
    key: 16752728,
    keyI: 2.1,
    hemiSky: 0x8e9cc8,
    hemiGround: 0x6e5046,
    hemiI: 0.95,
    glow: 0xff9a50,
    glowI: 1.45,
    cloudLit: 16758138,
    cloudShade: 0x8a6e96,
    fogD: 0.002,
    fogH: 0.0014,
    stars: 0,
    exposure: 1.08,
  },
  {
    h: 18.75,
    zenith: 3428494,
    horizon: 15239800,
    key: 16747098,
    keyI: 0.5,
    hemiSky: 0x7282b8,
    hemiGround: 0x4a3c46,
    hemiI: 0.92,
    glow: 0xff8062,
    glowI: 1.2,
    cloudLit: 15764090,
    cloudShade: 0x5a4e7e,
    fogD: 0.00211,
    fogH: 0.0018,
    stars: 0.1,
    exposure: 1.2,
  },
  {
    h: 19.5,
    zenith: 1847398,
    horizon: 6971278,
    key: 10335999,
    keyI: 0.25,
    hemiSky: 0x5570a8,
    hemiGround: 0x282a3c,
    hemiI: 0.95,
    glow: 0x9070a0,
    glowI: 0.55,
    cloudLit: 8022678,
    cloudShade: 0x2a2e58,
    fogD: 0.00211,
    fogH: 0.0016,
    stars: 0.55,
    exposure: 1.25,
  },
  {
    h: 20.6,
    zenith: 924740,
    horizon: 3032694,
    key: 10335999,
    keyI: 0.6,
    hemiSky: 0x4a6aa8,
    hemiGround: 0x1d2536,
    hemiI: 1,
    glow: 0x5a78b8,
    glowI: 0.3,
    cloudLit: 4874126,
    cloudShade: 0x1b2748,
    fogD: 0.002,
    fogH: 0.0014,
    stars: 0.95,
    exposure: 1.25,
  },
];
const SKY_COLOR_KEYS = ['zenith', 'horizon', 'key', 'hemiSky', 'hemiGround', 'glow', 'cloudLit', 'cloudShade'];
const SKY_SCALAR_KEYS = ['keyI', 'hemiI', 'glowI', 'fogD', 'fogH', 'stars', 'exposure'];
const SKY_KEYFRAME_COLORS = SKY_KEYFRAMES.map((keyframe) => {
  const colors = {};
  for (const field of SKY_COLOR_KEYS) colors[field] = new Color(keyframe[field]);
  return colors;
});
export function createSkyState() {
  return {
    hours: 15.5,
    sunDir: new Vector3(),
    moonDir: new Vector3(),
    keyDir: new Vector3(0, 1, 0),
    keyIsMoon: false,
    keyColor: new Color(),
    keyIntensity: 3,
    zenith: new Color(),
    horizon: new Color(),
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 1,
    glow: new Color(),
    glowIntensity: 0.5,
    cloudLit: new Color(),
    cloudShade: new Color(),
    fogDensity: 0.0015,
    fogHeight: 0.004,
    stars: 0,
    exposure: 1,
    day: 1,
    night: 0,
    dusk: 0,
  };
}
function hourAngle(hours) {
  if (hours >= 6 && hours <= 18.6) return ((hours - 6) / 12.600000000000001 - 0.5) * Math.PI;
  const sinceSunset = (hours - SUNSET_HOUR + 24) % 24;
  return Math.PI / 2 + (sinceSunset / 11.399999999999999) * Math.PI;
}
function celestialDirection(angle, declination, out) {
  const cosDec = Math.cos(declination);
  const x = -cosDec * Math.sin(angle);
  const north = Math.cos(LATITUDE) * Math.sin(declination) - Math.sin(LATITUDE) * cosDec * Math.cos(angle);
  const up = Math.sin(LATITUDE) * Math.sin(declination) + Math.cos(LATITUDE) * cosDec * Math.cos(angle);
  return out.set(x, up, -north).normalize();
}
const _lerpColor = new Color();
const _skyScalars = {};
function smooth01(x) {
  return x * x * (3 - 2 * x);
}
export function computeSky(time, sky) {
  const hours = ((time % 24) + 24) % 24;
  sky.hours = hours;
  const len = SKY_KEYFRAMES.length;
  let idx = 0;
  for (; idx < len && SKY_KEYFRAMES[idx].h <= hours;) idx++;
  const prevIndex = (idx - 1 + len) % len;
  const nextIndex = idx % len;
  const prevHour = SKY_KEYFRAMES[prevIndex].h;
  let nextHour = SKY_KEYFRAMES[nextIndex].h;
  if (nextHour <= prevHour) nextHour += 24;
  let hour = hours;
  if (hour < prevHour) hour += 24;
  const blend = smooth01(clamp((hour - prevHour) / Math.max(0.0001, nextHour - prevHour), 0, 1));
  for (const field of SKY_COLOR_KEYS)
    (field === 'key' ? sky.keyColor : sky[field])
      .copy(SKY_KEYFRAME_COLORS[prevIndex][field])
      .lerp(_lerpColor.copy(SKY_KEYFRAME_COLORS[nextIndex][field]), blend);
  const prevKey = SKY_KEYFRAMES[prevIndex];
  const nextKey = SKY_KEYFRAMES[nextIndex];
  const scalars = _skyScalars;
  for (const field of SKY_SCALAR_KEYS) scalars[field] = prevKey[field] + (nextKey[field] - prevKey[field]) * blend;
  sky.hemiIntensity = scalars.hemiI;
  sky.glowIntensity = scalars.glowI;
  sky.fogDensity = scalars.fogD;
  sky.fogHeight = scalars.fogH;
  sky.stars = scalars.stars;
  sky.exposure = scalars.exposure;
  const angle = hourAngle(hours);
  celestialDirection(angle, MathUtils.degToRad(4), sky.sunDir);
  celestialDirection(angle + Math.PI + 0.3, MathUtils.degToRad(-6), sky.moonDir);
  const sunY = sky.sunDir.y;
  const moonY = sky.moonDir.y;
  const day = smoothstep(-0.035, 0.07, sunY);
  const night = smoothstep(-0.035, -0.14, sunY) * smoothstep(-0.02, 0.18, moonY);
  sky.day = day;
  sky.night = night;
  sky.dusk = 1 - smoothstep(-0.1, 0.03, sunY);
  sky.keyIsMoon = sunY < -0.035;
  const keyDir = sky.keyIsMoon ? sky.moonDir : sky.sunDir;
  sky.keyDir.copy(keyDir);
  const minKeyY = 0.14;
  if (sky.keyDir.y < minKeyY) {
    const flat = Math.hypot(sky.keyDir.x, sky.keyDir.z) || 1;
    const flatScale = Math.sqrt(1 - minKeyY * minKeyY) / flat;
    sky.keyDir.set(sky.keyDir.x * flatScale, minKeyY, sky.keyDir.z * flatScale);
  }
  sky.keyIntensity = scalars.keyI * (sky.keyIsMoon ? night : day);
  return sky;
}
