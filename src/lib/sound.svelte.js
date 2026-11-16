// Alert sound preferences, kept in this browser only.
const KEY = 'tutei.sound.v1';
const defaults = { style: 'chime', volume: 0.7, criticalUrgent: true, urgentStyle: 'klaxon', speakAlerts: false };

function load() {
	try {
		return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
	} catch {
		return { ...defaults };
	}
}

export const soundPrefs = $state(load());

export function saveSoundPrefs() {
	try {
		localStorage.setItem(KEY, JSON.stringify(soundPrefs));
	} catch {
		/* storage unavailable: lasts for this session only */
	}
}

export const SOUND_STYLES = [
	{ id: 'chime', label: 'Chime', hint: 'Two soft tones (default)' },
	{ id: 'sonar', label: 'Sonar ping', hint: 'A single ping with an echo, like the radar in the logo' },
	{ id: 'bell', label: 'Bell', hint: 'A struck bell that rings out' },
	{ id: 'beep', label: 'Digital beep', hint: 'Three short beeps' },
	{ id: 'alarm', label: 'Alarm', hint: 'Bursts of quick beeps, like a phone alarm; more bursts for higher severity' },
	{ id: 'geiger', label: 'Geiger counter', hint: 'Radioactive crackle that speeds up; denser for higher severity' },
	{ id: 'klaxon', label: 'Klaxon', hint: 'Loud and urgent' },
	{ id: 'wail', label: 'Siren: wail', hint: 'Slow rise and fall, like a civil-defence siren' },
	{ id: 'yelp', label: 'Siren: yelp', hint: 'Fast up-and-down, like an emergency vehicle' },
	{ id: 'hilo', label: 'Siren: hi-lo', hint: 'Two alternating tones' },
	{ id: 'none', label: 'Silent', hint: 'Vibration and notification only' }
];
