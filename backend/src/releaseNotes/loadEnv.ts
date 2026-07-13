// Side-effect import that loads backend/.env for the release CLI, so it reuses the
// same SONNET_MODEL / ANTHROPIC_API_KEY config as the server. This lives under
// backend/ (not scripts/) on purpose: its `dotenv` import resolves from
// backend/node_modules, whereas a bare import from scripts/ would not. With no
// ANTHROPIC_API_KEY, Claude generation falls back to the locally-authenticated
// `claude` CLI — exactly like the report pipeline.
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
