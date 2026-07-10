const MATHLIVE_FONTS_DIRECTORY = '/mathlive/fonts/';

export function configureMathLiveAssets() {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const { MathfieldElement } = globalThis;

  if (!MathfieldElement) {
    return;
  }

  if (MathfieldElement.fontsDirectory !== MATHLIVE_FONTS_DIRECTORY) {
    MathfieldElement.fontsDirectory = MATHLIVE_FONTS_DIRECTORY;
  }
}

configureMathLiveAssets();
