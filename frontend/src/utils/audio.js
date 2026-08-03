let audioCtx = null;
let unlockInstalled = false;

let ringOsc = null;
let ringGain = null;
let ringPulse = null;

export function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export async function ensureAudioReady() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === 'running' ? ctx : null;
}

export function unlockAudio() {
  ensureAudioReady().catch(() => {});
}

export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

export async function playMessageChime() {
  const ctx = await ensureAudioReady();
  if (!ctx) return;

  const now = ctx.currentTime;
  const beep = (freq, start, dur, gain = 0.12) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now + start);
    g.gain.exponentialRampToValueAtTime(gain, now + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  beep(880, 0, 0.12, 0.1);
  beep(1174, 0.12, 0.18, 0.09);
}

export function stopCallRingtone() {
  try {
    if (ringPulse) clearInterval(ringPulse);
    ringOsc?.stop();
  } catch { /* already stopped */ }
  ringPulse = null;
  ringOsc = null;
  ringGain = null;
}

export async function startCallRingtone() {
  stopCallRingtone();
  const ctx = await ensureAudioReady();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  let on = true;
  const pulse = setInterval(() => {
    on = !on;
    gain.gain.setTargetAtTime(on ? 0.08 : 0.001, ctx.currentTime, 0.05);
    if (on) osc.frequency.setValueAtTime(480, ctx.currentTime);
    else osc.frequency.setValueAtTime(440, ctx.currentTime);
  }, 500);

  ringOsc = osc;
  ringGain = gain;
  ringPulse = pulse;
}

export async function playDeclineTone() {
  const ctx = await ensureAudioReady();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.35);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}
