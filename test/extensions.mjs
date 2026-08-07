/**
 * Letting Node read the app's own imports.
 *
 * The source says `from './elements'` because Vite fills in the extension.
 * Node does not, so a test that imports the real modules cannot resolve them.
 * This adds the .js when it is missing — nothing else — so the tests exercise
 * the same files the app ships rather than a copy that has drifted.
 *
 *     node --import ./test/extensions.mjs test/formats.test.mjs
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./extensions-hook.mjs', pathToFileURL('./test/'));
