/*
 * API types are defined once, in the backend (backend/shared/src/types.ts),
 * and shared with the frontend. Type-only: nothing from the backend is
 * bundled into the app.
 */
export type * from "../../../backend/shared/src/types";
