"use client";

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * Base RTK Query API. All feature-specific endpoints inject into this
 * single api via `api.injectEndpoints({ endpoints })` from the feature's
 * services file (e.g. `src/features/activities/services/activitiesApi.js`).
 *
 * Tags here are the union of every cache tag any feature uses. Add new tags
 * sparingly; prefer reusing existing ones to keep invalidation simple.
 */
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "same-origin",
  }),
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
