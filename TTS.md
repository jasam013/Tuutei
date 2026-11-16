# Natural voice on the EduStack (Piper)

Tūtei can speak briefings with a neural voice generated on your own stack, by [Piper](https://github.com/OHF-Voice/piper1-gpl) (`piper-tts` 1.8.0) running in its own container.

```
Phone ──HTTPS (Tailscale)──► CT 204 tutei  ──/api/tts──►  CT 205 tts (Piper :5000)
                              Tūtei server forwards        only CT 204 may connect
```

- Briefing text goes only from CT 204 to CT 205 on the internal network (vmbr1). It never leaves the stack, and the voice container needs no internet after setup.
- The app never talks to Piper directly; Tūtei's server forwards `GET /api/tts/voices` and `POST /api/tts`.
- If Piper is down, briefings fall back to a voice on the device, and Settings says so.

## Tūtei server endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/tts/voices` | — | `[{ "id": "en_GB-alan-medium", "label": "Alan · English (Great Britain) · medium", "lang": "en-GB" }]` |
| POST | `/api/tts` | `{ "text": "…", "voice": "en_GB-alan-medium", "rate": 1.0 }` | `audio/wav` |

- Text is limited to 1,500 characters.
- `rate` (0.7 to 1.4) becomes Piper's `length_scale` = 1 / rate.
- Set the service address with `TUTEI_TTS_URL`, for example `http://192.168.100.25:5000`.

## Voices installed by the setup commands

| Voice id | Sounds like |
| --- | --- |
| `en_GB-alan-medium` | British male (default) |
| `en_GB-northern_english_male-medium` | Northern English male |
| `en_GB-cori-high` | British female, high quality |
| `en_US-ryan-high` | American male, high quality |

Extra accents (added later):

| Voice id | Sounds like |
| --- | --- |
| `en_GB-alba-medium` | Scottish female |
| `en_GB-southern_english_female-low` | Southern English female (lower quality) |
| `en_GB-jenny_dioco-medium` | British female |
| `en_GB-semaine-medium` | 4 British characters: Prudence, Spike, Obadiah, Poppy |
| `en_GB-aru-medium` | 12 British speakers with regional accents |
| `en_GB-vctk-medium` (optional) | 109 speakers across many English accents, listed by speaker code |

Multi-speaker voices (Semaine, ARU, VCTK) appear in Tūtei as one choice per speaker, with an id of the form `en_GB-semaine-medium#obadiah`.

To add more voices, list them with `python -m piper.download_voices`, download into `/opt/piper/voices` (see the setup), and restart the `piper` service. "High" quality voices sound best but take longer to generate than "medium" ones.
