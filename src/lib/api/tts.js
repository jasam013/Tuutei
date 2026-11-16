// Natural voices from the Piper container on the EduStack, reached through Tūtei's own /api.
import { settings } from '../settings.svelte.js';

const root = () => settings.apiBase.replace(/\/$/, '');

/** @returns {Promise<{id:string, label:string, lang:string}[]>} empty if the service is unavailable */
export async function fetchNaturalVoices() {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 6000);
		const res = await fetch(`${root()}/tts/voices`, { signal: ctrl.signal, credentials: 'include' });
		clearTimeout(t);
		if (!res.ok) return [];
		const list = await res.json();
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

/** @param {{text:string, voice:string, rate:number}} req @returns {Promise<Blob>} WAV audio */
export async function synthesize({ text, voice, rate }) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 30000);
	try {
		const res = await fetch(`${root()}/tts`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text, voice, rate }),
			signal: ctrl.signal,
			credentials: 'include'
		});
		if (!res.ok) throw new Error(`Voice service error ${res.status}`);
		return await res.blob();
	} finally {
		clearTimeout(t);
	}
}
