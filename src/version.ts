/**
 * The package version, read from package.json at run time so the server, the shared
 * about_betanyc tool and package.json cannot disagree. `createRequire` works on every Node the
 * package supports (engines >= 18); JSON import attributes need Node 20.6. `../package.json`
 * resolves from dist/, and npm always ships package.json.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

if (typeof version !== "string" || version.length === 0) {
  throw new Error("Could not read a valid 'version' string from package.json");
}

export const PACKAGE_VERSION: string = version;
