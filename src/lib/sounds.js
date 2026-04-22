/* ═══════════════════════════════════════════════════
   SOUND ENGINE — Web Audio API (zero dependencies)
   Merged from BacBooster original + Logic System V4
   ═══════════════════════════════════════════════════ */

let audioCtx = null;
let masterGain = null;
let desiredMasterVolume = 0.7;

function ac() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = desiredMasterVolume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function mg() { ac(); return masterGain; }

function noise(dur) {
  const c = ac(), sz = c.sampleRate * dur, buf = c.createBuffer(1, sz, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const clicks = {
  softClick(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 800;
    g.gain.setValueAtTime(v * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.06);
  },
  pop(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(250, t + 0.08);
    g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.1);
  },
  bubble(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    g.gain.setValueAtTime(v * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.15);
  },
  tap(v) {
    const c = ac(), t = c.currentTime, s = c.createBufferSource(); s.buffer = noise(0.04);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(bp); bp.connect(g); g.connect(mg()); s.start(t); s.stop(t + 0.04);
  },
  insert(v, tokenType) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    const freqMap = { func: 600, op: 500, var: 700, num: 550 };
    o.type = 'triangle'; o.frequency.value = freqMap[tokenType] || 600;
    g.gain.setValueAtTime(v * 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.1);
  },
  delete(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    g.gain.setValueAtTime(v * 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.1);
  },
};

const specials = {
  success(v) {
    const c = ac(), t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t + i * 0.08);
      g.gain.setValueAtTime(0, t + i * 0.08);
      g.gain.linearRampToValueAtTime(v * 0.3, t + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.4);
      o.connect(g); g.connect(mg()); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.5);
    });
  },
  error(v) {
    const c = ac(), t = c.currentTime;
    [400, 300].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(v * 0.15, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.15);
      o.connect(g); g.connect(mg()); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.15);
    });
  },
  levelUp(v) {
    const c = ac(), t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(v * 0.15, t + i * 0.05);
      g.gain.linearRampToValueAtTime(0, t + i * 0.05 + 0.2);
      o.connect(g); g.connect(mg()); o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.2);
    });
  },
  whoosh(v) {
    const c = ac(), t = c.currentTime, s = c.createBufferSource(); s.buffer = noise(0.3);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    bp.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(v * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    s.connect(bp); bp.connect(g); g.connect(mg()); s.start(t); s.stop(t + 0.3);
  },
  coin(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1200, t); o.frequency.setValueAtTime(1600, t + 0.06);
    g.gain.setValueAtTime(v * 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.15);
  },
  penalty(v) {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(440, t); o.frequency.linearRampToValueAtTime(220, t + 0.3);
    g.gain.setValueAtTime(v * 0.25, t); g.gain.linearRampToValueAtTime(0, t + 0.3);
    o.connect(g); g.connect(mg()); o.start(t); o.stop(t + 0.3);
  },
};

const SoundEngine = {
  setMasterVolume(v) { desiredMasterVolume = v; if (masterGain) masterGain.gain.value = v; },
  getMasterVolume() { return desiredMasterVolume; },
  playClick(type = 'softClick', vol = 0.5) { if (clicks[type]) clicks[type](vol); },
  playInsert(tokenType, vol = 0.5) { clicks.insert(vol, tokenType); },
  playDelete(vol = 0.5) { clicks.delete(vol); },
  playSpecial(type, vol = 0.5) { if (specials[type]) specials[type](vol); },
  getClickTypes() { return Object.keys(clicks); },
};

export default SoundEngine;
