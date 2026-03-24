// Ensure NODE_ENV is 'test' before any modules are loaded.
// This triggers the .env.test branch in src/config/env.ts.
process.env.NODE_ENV = 'test';
