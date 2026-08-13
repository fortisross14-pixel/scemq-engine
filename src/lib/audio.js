export const AUDIO_CHANNELS = ['music', 'ambient', 'sfx'];

export function channelVolume(settings = {}, channel = 'music') {
  const master = normalizeVolume(settings.masterVolume, 1);
  const own = normalizeVolume(settings[`${channel}Volume`], channel === 'sfx' ? 0.9 : 0.6);
  return Math.max(0, Math.min(1, master * own));
}

export function normalizeVolume(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

// Deciding whether a scene change should restart the music is a pure decision,
// so it is testable and so the runtime never accidentally restarts a track that
// is already playing (the v0.5 behaviour that made every doorway retrigger it).
export function musicTransition(currentUrl, nextUrl) {
  if (!nextUrl) return currentUrl ? 'stop' : 'none';
  if (!currentUrl) return 'start';
  return currentUrl === nextUrl ? 'continue' : 'crossfade';
}

export class AudioEngine {
  constructor({ createAudio } = {}) {
    this.createAudio = createAudio || ((src) => new Audio(src));
    this.channels = { music: null, ambient: null };
    this.urls = { music: '', ambient: '' };
    this.volumes = { music: 0.6, ambient: 0.5, sfx: 0.9 };
    this.sfx = new Set();
    this.fades = new Map();
    this.muted = false;
  }

  setVolumes(settings) {
    for (const channel of AUDIO_CHANNELS) this.volumes[channel] = channelVolume(settings, channel);
    for (const channel of ['music', 'ambient']) {
      const element = this.channels[channel];
      if (element && !this.fades.has(channel)) element.volume = this.muted ? 0 : this.volumes[channel];
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    for (const channel of ['music', 'ambient']) {
      const element = this.channels[channel];
      if (element) element.volume = this.muted ? 0 : this.volumes[channel];
    }
  }

  fadeTo(channel, target, durationMs = 600) {
    const element = this.channels[channel];
    if (!element) return Promise.resolve();
    clearInterval(this.fades.get(channel));
    const from = element.volume;
    const to = this.muted ? 0 : Math.max(0, Math.min(1, target));
    if (durationMs <= 0) { element.volume = to; return Promise.resolve(); }
    const started = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const t = Math.min(1, (Date.now() - started) / durationMs);
        element.volume = from + (to - from) * t;
        if (t >= 1) { clearInterval(timer); this.fades.delete(channel); resolve(); }
      }, 40);
      this.fades.set(channel, timer);
    });
  }

  async play(channel, url, { loop = true, fadeMs = 500 } = {}) {
    const transition = musicTransition(this.urls[channel], url);
    if (transition === 'continue') return;
    if (transition === 'none') return;
    if (transition === 'stop') { await this.stop(channel, fadeMs); return; }
    if (transition === 'crossfade') await this.stop(channel, Math.min(fadeMs, 350));
    const element = this.createAudio(url);
    element.loop = loop;
    element.volume = 0;
    this.channels[channel] = element;
    this.urls[channel] = url;
    try { await element.play(); } catch { /* autoplay can be blocked until first click */ }
    await this.fadeTo(channel, this.volumes[channel], fadeMs);
  }

  async stop(channel, fadeMs = 400) {
    const element = this.channels[channel];
    if (!element) { this.urls[channel] = ''; return; }
    await this.fadeTo(channel, 0, fadeMs);
    try { element.pause(); } catch {}
    this.channels[channel] = null;
    this.urls[channel] = '';
  }

  playSound(url, { volume = 1 } = {}) {
    if (!url) return null;
    const element = this.createAudio(url);
    element.volume = this.muted ? 0 : this.volumes.sfx * normalizeVolume(volume, 1);
    this.sfx.add(element);
    element.addEventListener?.('ended', () => this.sfx.delete(element));
    try { element.play?.(); } catch {}
    return element;
  }

  dispose() {
    for (const timer of this.fades.values()) clearInterval(timer);
    this.fades.clear();
    for (const channel of ['music', 'ambient']) {
      try { this.channels[channel]?.pause(); } catch {}
      this.channels[channel] = null;
      this.urls[channel] = '';
    }
    for (const element of this.sfx) { try { element.pause(); } catch {} }
    this.sfx.clear();
  }
}
