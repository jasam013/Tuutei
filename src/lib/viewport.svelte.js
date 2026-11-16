// Tablet layout switch: wide enough for list and detail side by side, and tall enough
// that it isn't a phone turned sideways. iPads in portrait (768px+) qualify.
export const WIDE_QUERY = '(min-width: 768px) and (min-height: 600px)';

export const viewport = $state({ wide: false });

if (typeof window !== 'undefined') {
	const mq = matchMedia(WIDE_QUERY);
	viewport.wide = mq.matches;
	mq.addEventListener('change', (e) => (viewport.wide = e.matches));
}
