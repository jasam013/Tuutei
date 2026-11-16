// Multimedia helpers: speech, sound, haptics and system notifications.
// Every feature is detected first, so the app degrades quietly where it is missing
// (for example, iOS has no vibration and only allows push once installed).

// ---------- Text-to-speech briefing ----------
import { voicePrefs } from './voice.svelte.js';

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const ACCENTS = ['en-NZ', 'en-AU', 'en-GB', 'en-US', 'en'];
const langOf = (/** @type {SpeechSynthesisVoice} */ v) => (v.lang || '').replace('_', '-');

/** The voice to use: the one chosen in Settings if this device has it, else NZ English first. */
function pickVoice() {
	const voices = speechSynthesis.getVoices();
	if (voicePrefs.uri) {
		const chosen = voices.find((v) => v.voiceURI === voicePrefs.uri);
		if (chosen) return chosen;
	}
	return pickAutoVoice();
}

function pickAutoVoice() {
	const voices = speechSynthesis.getVoices();
	for (const lang of ACCENTS) {
		const v = voices.find((x) => langOf(x).startsWith(lang));
		if (v) return v;
	}
	return null;
}

/**
 * All voices on this device, English first (NZ, AU, GB, US), then others by language.
 * Browsers load voices late, so this calls back again when the list changes.
 * @param {(voices: SpeechSynthesisVoice[]) => void} cb
 * @returns {() => void} stop listening
 */
export function watchVoices(cb) {
	if (!canSpeak()) return () => {};
	const rank = (/** @type {SpeechSynthesisVoice} */ v) => {
		const i = ACCENTS.findIndex((a) => langOf(v).startsWith(a));
		return i === -1 ? ACCENTS.length : i;
	};
	const emit = () =>
		cb(
			[...speechSynthesis.getVoices()].sort(
				(a, b) => rank(a) - rank(b) || langOf(a).localeCompare(langOf(b)) || a.name.localeCompare(b.name)
			)
		);
	emit();
	speechSynthesis.addEventListener?.('voiceschanged', emit);
	return () => speechSynthesis.removeEventListener?.('voiceschanged', emit);
}

// ---------- Natural voice (Piper on the EduStack) ----------
export const PIPER_PREFIX = 'piper:';
// A tiny silent WAV. Playing it inside the tap "unlocks" the audio element on iOS,
// so the real briefing can still play after waiting for the server.
const SILENT_WAV =
	'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
/** @type {HTMLAudioElement|null} */
let audioEl = null;
let playToken = 0;

/** Speak with the server voice; if the service fails, fall back to a device voice. */
function speakNatural(/** @type {string} */ text, /** @type {string} */ voice, /** @type {(() => void)|undefined} */ onend) {
	const token = ++playToken;
	audioEl ||= new Audio();
	const el = audioEl;
	el.src = SILENT_WAV;
	el.play().catch(() => {});
	import('./api/tts.js')
		.then(({ synthesize }) => synthesize({ text, voice, rate: Number(voicePrefs.rate) || 1 }))
		.then((blob) => {
			if (token !== playToken) return; // stopped or replaced meanwhile
			const url = URL.createObjectURL(blob);
			el.onended = () => {
				if (el.src !== url) return; // the silent unlock clip finishing, not the briefing
				URL.revokeObjectURL(url);
				onend?.();
			};
			el.onerror = el.onended;
			el.src = url;
			return el.play();
		})
		.catch((e) => {
			if (token !== playToken) return;
			console.warn('Natural voice unavailable, using a device voice instead:', e);
			speakDevice(text, onend, true);
		});
	return true;
}

/** @param {string} text @param {() => void} [onend] */
export function speak(text, onend) {
	stopSpeaking();
	if (voicePrefs.uri?.startsWith(PIPER_PREFIX)) return speakNatural(text, voicePrefs.uri.slice(PIPER_PREFIX.length), onend);
	return speakDevice(text, onend);
}

/** @param {string} text @param {() => void} [onend] @param {boolean} [autoVoice] ignore the chosen voice */
function speakDevice(text, onend, autoVoice = false) {
	if (!canSpeak()) {
		onend?.();
		return false;
	}
	speechSynthesis.cancel();
	const u = new SpeechSynthesisUtterance(text);
	const v = autoVoice ? pickAutoVoice() : pickVoice();
	if (v) {
		u.voice = v;
		u.lang = v.lang;
	}
	u.rate = Number(voicePrefs.rate) || 1;
	u.onend = () => onend?.();
	u.onerror = () => onend?.();
	speechSynthesis.speak(u);
	return true;
}

export function stopSpeaking() {
	playToken++;
	if (audioEl) {
		audioEl.onended = null;
		audioEl.onerror = null;
		audioEl.pause();
	}
	if (canSpeak()) speechSynthesis.cancel();
}

/** True if briefings can be spoken at all (device voices or the natural voice). */
export const canBrief = () => canSpeak() || !!voicePrefs.uri?.startsWith(PIPER_PREFIX);

// ---------- Alert sounds (synthesised with Web Audio, no sound files needed) ----------
import { soundPrefs } from './sound.svelte.js';

/** @type {AudioContext|undefined} */
let ctx;
function audio() {
	ctx ||= new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
	ctx.resume?.();
	return ctx;
}

/** One enveloped tone. @param {AudioNode} out */
function tone(out, { f, t, dur, type = 'sine', peak = 0.3, attack = 0.01, f2 = null }) {
	const c = /** @type {AudioContext} */ (ctx);
	const o = c.createOscillator();
	const g = c.createGain();
	o.type = type;
	o.frequency.setValueAtTime(f, t);
	if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.connect(g).connect(out);
	o.start(t);
	o.stop(t + dur + 0.02);
}

const SOUNDS = {
	chime(out, t0, sev) {
		const notes = sev === 'critical' ? [880, 660, 880] : sev === 'high' ? [784, 587] : [659, 523];
		notes.forEach((f, i) => tone(out, { f, t: t0 + i * 0.18, dur: 0.16, peak: 0.35 }));
		return notes.length * 0.18;
	},
	sonar(out, t0) {
		// A ping fed into a short feedback delay, so it echoes and fades.
		const c = /** @type {AudioContext} */ (ctx);
		const delay = c.createDelay();
		const fb = c.createGain();
		delay.delayTime.value = 0.32;
		fb.gain.value = 0.38;
		delay.connect(fb).connect(delay);
		delay.connect(out);
		tone(out, { f: 1320, t: t0, dur: 0.9, peak: 0.45, attack: 0.005 });
		tone(delay, { f: 1320, t: t0, dur: 0.9, peak: 0.3, attack: 0.005 });
		return 1.6;
	},
	bell(out, t0) {
		// Inharmonic partials decaying at different rates, like a struck bell.
		[[523, 0.4, 1.8], [1046, 0.18, 1.2], [1395, 0.12, 0.9], [2093, 0.06, 0.6]].forEach(([f, p, d]) =>
			tone(out, { f, t: t0, dur: d, peak: p, attack: 0.003 })
		);
		return 1.8;
	},
	beep(out, t0) {
		[0, 0.16, 0.32].forEach((dt) => tone(out, { f: 1000, t: t0 + dt, dur: 0.1, type: 'square', peak: 0.12, attack: 0.004 }));
		return 0.45;
	},
	geiger(out, t0, sev) {
		// Geiger counter: random clicks that speed up, like walking towards a source.
		// Each click is a tiny burst of filtered noise. Higher severity = denser crackle.
		const c = /** @type {AudioContext} */ (ctx);
		const len = Math.floor(c.sampleRate * 0.004);
		const buf = c.createBuffer(1, len, c.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
		const hp = c.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 1800;
		hp.connect(out);
		const duration = 2.2;
		const startRate = 3; // clicks per second at the start
		const endRate = { critical: 85, high: 60, medium: 45, low: 28 }[sev] || 45;
		let t = 0;
		while (t < duration) {
			const progress = t / duration;
			const rate = startRate * Math.pow(endRate / startRate, progress);
			t += (0.35 + Math.random() * 1.3) / rate; // irregular gaps around the current rate, like real decay
			if (t >= duration) break;
			const src = c.createBufferSource();
			const g = c.createGain();
			src.buffer = buf;
			g.gain.value = 0.6 + Math.random() * 0.4;
			src.connect(g).connect(hp);
			src.start(t0 + t);
		}
		return duration;
	},
	alarm(out, t0, sev) {
		// Alarm: bursts of four quick beeps with a pause, repeated. Our own pattern, not Apple's tone.
		// Two tones alternate so it cuts through; more bursts for higher severity.
		const bursts = { critical: 4, high: 3, medium: 3, low: 2 }[sev] || 3;
		const beep = 0.07,
			gap = 0.05,
			pause = 0.32;
		const burstLen = 4 * (beep + gap) + pause;
		for (let b = 0; b < bursts; b++) {
			for (let i = 0; i < 4; i++) {
				const t = t0 + b * burstLen + i * (beep + gap);
				tone(out, { f: i % 2 ? 1760 : 2093, t, dur: beep, type: 'triangle', peak: 0.32, attack: 0.004 });
			}
		}
		return bursts * burstLen;
	},
	klaxon(out, t0) {
		const c = /** @type {AudioContext} */ (ctx);
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 2200;
		lp.connect(out);
		for (let i = 0; i < 3; i++) tone(lp, { f: 620, f2: 440, t: t0 + i * 0.42, dur: 0.38, type: 'sawtooth', peak: 0.22, attack: 0.02 });
		return 1.3;
	},
	// Sirens: one sustained oscillator whose pitch is swept along a schedule.
	wail(out, t0) {
		// Slow rise and fall, like a civil-defence siren.
		return siren(out, t0, 3.2, (f, t) => {
			for (let i = 0; i < 2; i++) {
				f.linearRampToValueAtTime(1150, t + i * 1.6 + 0.9);
				f.linearRampToValueAtTime(480, t + i * 1.6 + 1.6);
			}
		}, 480);
	},
	yelp(out, t0) {
		// Fast sweeps up and down, like an emergency vehicle.
		return siren(out, t0, 2.4, (f, t) => {
			for (let i = 0; i < 12; i++) {
				f.linearRampToValueAtTime(1500, t + i * 0.2 + 0.1);
				f.linearRampToValueAtTime(700, t + i * 0.2 + 0.2);
			}
		}, 700);
	},
	hilo(out, t0) {
		// Two alternating tones.
		return siren(out, t0, 2.4, (f, t) => {
			for (let i = 0; i < 6; i++) {
				f.setValueAtTime(960, t + i * 0.4);
				f.setValueAtTime(770, t + i * 0.4 + 0.2);
			}
		}, 960);
	}
};

/**
 * A siren voice: square wave through a low-pass filter, with a pitch schedule.
 * @param {AudioNode} out @param {number} t0 @param {number} dur
 * @param {(freq: AudioParam, t: number) => void} sweep @param {number} startHz
 */
function siren(out, t0, dur, sweep, startHz) {
	const c = /** @type {AudioContext} */ (ctx);
	const o = c.createOscillator();
	const lp = c.createBiquadFilter();
	const g = c.createGain();
	o.type = 'square';
	lp.type = 'lowpass';
	lp.frequency.value = 2400;
	o.frequency.setValueAtTime(startHz, t0);
	sweep(o.frequency, t0);
	g.gain.setValueAtTime(0.0001, t0);
	g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.08);
	g.gain.setValueAtTime(0.14, t0 + dur - 0.15);
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	o.connect(lp).connect(g).connect(out);
	o.start(t0);
	o.stop(t0 + dur + 0.05);
	return dur;
}

/**
 * Play the incoming-alert sound for a severity, using the analyst's sound settings.
 * @param {string} [severity]
 * @param {string} [style] override the saved choice (for previews)
 * @returns {number} seconds the sound lasts (0 if silent)
 */
export function chime(severity = 'medium', style = soundPrefs.style) {
	try {
		if (style === 'none') return 0;
		const urgent = severity === 'critical' && soundPrefs.criticalUrgent;
		const kind = urgent ? soundPrefs.urgentStyle || 'klaxon' : style;
		const play = SOUNDS[kind] || SOUNDS.chime;
		const c = audio();
		const master = c.createGain();
		master.gain.value = Math.min(1, Math.max(0, Number(soundPrefs.volume) || 0));
		master.connect(c.destination);
		let length = play(master, c.currentTime + 0.02, severity);
		// Short urgent sounds repeat once; sirens are already long enough.
		if (urgent && length < 2) length += play(master, c.currentTime + 0.02 + length + 0.25, severity) + 0.25;
		return length;
	} catch {
		return 0; // audio unavailable
	}
}

/** Unlock audio from a tap, so later alert sounds are allowed to play. */
export function unlockAudio() {
	try {
		audio();
	} catch {
		/* audio unavailable */
	}
}

// ---------- Haptics ----------
const PATTERNS = { critical: [300, 120, 300, 120, 300], high: [250, 100, 250], medium: [200], low: [80], success: [40, 60, 40] };
export function buzz(/** @type {keyof typeof PATTERNS} */ kind) {
	try {
		navigator.vibrate?.(PATTERNS[kind] || [100]);
	} catch {
		/* not supported (iOS) */
	}
}

// ---------- System notifications ----------
export const notificationState = () =>
	typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

export async function askNotificationPermission() {
	if (typeof Notification === 'undefined') return 'unsupported';
	try {
		return await Notification.requestPermission();
	} catch {
		return 'denied';
	}
}

/** Show a system notification; returns false if not allowed so the caller can fall back. */
export async function systemNotify(/** @type {string} */ title, /** @type {string} */ body, /** @type {string} */ url, tag = 'tutei') {
	if (notificationState() !== 'granted') return false;
	try {
		const reg = await navigator.serviceWorker?.getRegistration();
		if (reg) {
			await reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url } });
		} else {
			new Notification(title, { body, tag, icon: 'icon-192.png' });
		}
		return true;
	} catch {
		return false;
	}
}
