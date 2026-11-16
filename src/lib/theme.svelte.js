// Theme preference: 'system' follows the phone, 'dark' or 'light' overrides it.
// Kept in this browser only. The same key is read by a tiny script in app.html
// so the right theme shows before the app loads (no white flash at night).
const KEY = 'tutei.theme.v1';
const DARK_BAR = '#0E1A2B';
const LIGHT_BAR = '#F5F3EE';

function load() {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'dark' || v === 'light' ? v : 'system';
	} catch {
		return 'system';
	}
}

export const theme = $state({ choice: /** @type {'system'|'dark'|'light'} */ (load()) });

/** Apply the choice to the page and the phone's status bar colour, and save it. */
export function applyTheme() {
	const root = document.documentElement;
	if (theme.choice === 'system') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', theme.choice);

	const light =
		theme.choice === 'light' || (theme.choice === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? LIGHT_BAR : DARK_BAR);

	try {
		if (theme.choice === 'system') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, theme.choice);
	} catch {
		/* storage unavailable: lasts for this session only */
	}
}

export const THEMES = [
	{ id: 'system', label: 'System', hint: 'Match the phone' },
	{ id: 'dark', label: 'Dark', hint: 'Best at night' },
	{ id: 'light', label: 'Light', hint: 'Best in daylight' }
];
