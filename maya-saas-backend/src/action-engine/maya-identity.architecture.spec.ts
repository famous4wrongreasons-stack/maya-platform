import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const pwa = read('сайт и приложение/app.html');
describe('one Maya identity and verified native release boundary', () => {
  it('keeps generated assets and inline runtime tied to one versioned vector source', () => {
    const source = read('сайт и приложение/assets/maya-identity.js');
    expect(pwa).toContain(
      '<script id="maya-identity-source">\n' + source + '\n</script>',
    );
    const manifest = JSON.parse(
      read('docs/product/maya-identity/generated-assets.json'),
    ) as { artifacts: { path: string; sha256: string }[] };
    for (const a of manifest.artifacts)
      expect(
        createHash('sha256')
          .update(readFileSync(resolve(root, a.path)))
          .digest('hex'),
      ).toBe(a.sha256);
    expect(manifest.artifacts.length).toBeGreaterThan(40);
  });
  it('uses the same renderer for splash, thinking and recording; no random equalizer or logo video', () => {
    expect(pwa).not.toContain('function MayaMarkGeometry()');
    expect(pwa).not.toContain('applogo.mp4');
    expect(pwa).not.toContain('@keyframes mvoSpin');
    expect(pwa).toContain("e(MayaMarkAnimated,{size:48,state:'thinking'})");
    expect(pwa).toContain(
      "vmSpeaking ? 'responding' : sending ? 'thinking' : 'recording'",
    );
    expect(pwa).toContain('window.__mayaAudioLevel = Math.min(1, rms * 6)');
  });
  it('honors reduced motion/visibility and reaps its own frame loop on unmount', () => {
    const code = read('сайт и приложение/assets/maya-identity.js');
    expect(code).toContain('prefers-reduced-motion: reduce');
    expect(code).toContain('media.matches||document.hidden');
    expect(code).toContain('cancelAnimationFrame');
    expect(code).toContain("removeEventListener('visibilitychange',wake)");
    expect(code).not.toMatch(/Math\.random|setInterval|setTimeout|fetch\(/);
  });
  it('blocks stale native source, generated copy or built app before release', () => {
    const guard = read('scripts/maya-identity/verify-native.cjs');
    expect(guard).toContain('ios/App/App/public/index.html');
    expect(guard).toContain('Built native bundle drifted');
    expect(guard).toContain('status.linked===true');
    expect(guard).toContain('meMayaConsentTransition(');
    const build = read('scripts/maya-identity/build-native.sh');
    expect(build.indexOf('verify-native.cjs')).toBeLessThan(
      build.indexOf('xcodebuild'),
    );
    expect(build.lastIndexOf('verify-native.cjs')).toBeGreaterThan(
      build.indexOf('xcodebuild'),
    );
  });
});
