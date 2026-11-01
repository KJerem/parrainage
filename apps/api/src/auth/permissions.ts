import type { Role } from "@parrainage/contracts";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Permissions métier par rôle. La propriété (« ses » enfants, « ses » binômes) se vérifie
 * ensuite dans les services : un relais qui a `child:update` ne modifie que les enfants de son relais.
 */
export const statement = {
  ...defaultStatements,
  child: ["create", "read", "update", "submit", "validate"],
  news: ["publish"],
  results: ["write"],
  classSession: ["open"],
  moderation: ["review"],
  sponsorship: ["create"],
  finance: ["validate"],
} as const;

export const ac = createAccessControl(statement);

export const parrain = ac.newRole({
  child: ["read"],
});

export const relais = ac.newRole({
  child: ["create", "read", "update", "submit"],
  news: ["publish"],
  results: ["write"],
  classSession: ["open"],
});

export const bureau = ac.newRole({
  ...adminAc.statements,
  child: ["read", "update", "validate"],
  moderation: ["review"],
  sponsorship: ["create"],
  finance: ["validate"],
});

export const roles = { parrain, relais, bureau } satisfies Record<Role, unknown>;

type Statement = typeof statement;

export type Permission = {
  [R in keyof Statement]: `${R & string}:${Statement[R][number]}`;
}[keyof Statement];

/** Table pure : le rôle donne-t-il cette permission ? Le rôle inconnu n'a aucun droit. */
export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role || !Object.hasOwn(roles, role)) {
    return false;
  }
  const [resource, action] = permission.split(":") as [keyof Statement, string];
  const request = { [resource]: [action] } as Parameters<(typeof bureau)["authorize"]>[0];
  return roles[role as Role].authorize(request).success;
}
