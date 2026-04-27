import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Configurable base for RTK Query. Call `configurePaymentsApi` once at app
 * boot before any components mount (standalone: _app.js, embedded: bootstrap.js).
 *
 * Standalone Next.js leaves defaults — calls go to relative /api/*.
 * pl-football-web Phase A: configurePaymentsApi({ baseUrl: "http://localhost:3001/api" })
 * pl-football-web Phase B: configurePaymentsApi({ baseUrl: "/api/v3/new_payments" })
 */
let _config = {
  baseUrl: "/api",
  prepareHeaders: undefined,
};

export function configurePaymentsApi({ baseUrl = "/api", prepareHeaders } = {}) {
  _config = { baseUrl, prepareHeaders };
}

/**
 * Base RTK Query API. All feature-specific endpoints inject into this
 * single api via `api.injectEndpoints({ endpoints })`.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: (...args) =>
    fetchBaseQuery({
      baseUrl: _config.baseUrl,
      credentials: "same-origin",
      prepareHeaders: _config.prepareHeaders,
    })(...args),
  tagTypes: [
    "Activity",
    "Order",
    "OrderLog",
    "Player",
    "Team",
    "Lead",
    "LeadSubmission",
    "Parent",
    "Message",
    "Transaction",
    "RegistrationRequest",
    "ClubProfile",
    "ClubUser",
    "Invitation",
  ],
  endpoints: () => ({}),
});
