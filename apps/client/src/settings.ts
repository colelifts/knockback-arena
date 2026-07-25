export interface GameSettings {
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
  mouseSensitivity: number;
  invertY: boolean;
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  cameraShake: number;
  reducedMotion: boolean;
  showFps: boolean;
}
export const defaultSettings: GameSettings = {
  masterVolume: 0.75,
  effectsVolume: 0.8,
  musicVolume: 0.45,
  mouseSensitivity: 0.65,
  invertY: false,
  quality: 'medium',
  shadows: false,
  cameraShake: 0.65,
  reducedMotion: false,
  showFps: false,
};
const storageKey = 'knockback-arena-settings-v2';
export const loadSettings = (): GameSettings => {
  try {
    return {
      ...defaultSettings,
      ...(JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<GameSettings>),
    };
  } catch {
    return { ...defaultSettings };
  }
};
export const saveSettings = (settings: GameSettings): void =>
  localStorage.setItem(storageKey, JSON.stringify(settings));
