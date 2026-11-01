/** Fixed on purpose, with no override: these tests write and delete, so they only ever reach the throwaway server. */
export const STRATUS_ADDRESS = "127.0.0.1:8001";

/** Not 3000, so a running dev server is never mistaken for the build under test. */
export const PORT = 3100;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
