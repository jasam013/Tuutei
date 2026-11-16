import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// During development, /api is forwarded to the mock API (npm run mock-api)
		// or to OpenClaw, so the browser sees one origin.
		proxy: { '/api': process.env.TUTEI_API_TARGET || 'http://localhost:8787' }
	}
});
