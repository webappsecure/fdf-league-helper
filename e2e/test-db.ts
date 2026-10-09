// The browser run's own database. playwright.config.ts starts the server on it,
// and a spec that needs to change data directly opens the same file.
export const TEST_DB = "data/browser-tests.sqlite";
