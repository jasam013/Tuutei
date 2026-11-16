// Spoken-briefing voice preferences, kept in this browser only (each device has its own voices).
const KEY = 'tutei.voice.v1';

function load() {
	try {
		return { uri: '', rate: 1, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
	} catch {
		return { uri: '', rate: 1 };
	}
}

/** uri: '' means automatic (NZ English first). rate: 0.7 to 1.4. */
export const voicePrefs = $state(load());

export function saveVoicePrefs() {
	try {
		localStorage.setItem(KEY, JSON.stringify(voicePrefs));
	} catch {
		/* storage unavailable: lasts for this session only */
	}
}
