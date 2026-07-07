// Remotion bundle entry — registered root for @remotion/bundler (backend render).
// Not imported by the web app; only the server renderer points its bundler here.
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
