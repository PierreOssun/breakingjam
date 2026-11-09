import type { Schemas } from "../../api/client";

/** The API's order of roles: a check for one passes for every role after it. */
const ROLES: Schemas["Role"][] = [
  "user",
  "organizer",
  "seed_admin",
  "admin",
  "super_admin",
];

/** Whether `role` is `min` or higher, as the API checks it. */
export function atLeast(role: Schemas["Role"], min: Schemas["Role"]): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}
