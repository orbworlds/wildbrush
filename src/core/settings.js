/**
 * Player settings (mouse sensitivity, quality, volumes, controls hint) loaded from and saved to localStorage.
 */
const SETTINGS_KEY = 'wildbrush.settings.v1';
const DEFAULT_SETTINGS = {
  mouseSensitivity: 1,
  invertY: false,
  quality: 'high',
  masterVolume: 0.8,
  musicVolume: 0.6,
  showControlsHint: true,
};
export function loadSettings(params) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {}
  const settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
  };
  const quality = params.get('quality');
  if (quality === 'low' || quality === 'medium' || quality === 'high') settings.quality = quality;
  return settings;
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
