import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Static build: the PWA is served as plain files from its own container on the EduStack.
		adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, strict: true }),
		// Hash routing (#/alerts/42) so any static file server works with no rewrite rules.
		router: { type: 'hash' },
		// Relative asset paths so the build can sit under any sub-path.
		paths: { relative: true },
		// "app" rather than "_app": some static hosts reserve names that start with "_".
		appDir: 'app'
	}
};

export default config;
