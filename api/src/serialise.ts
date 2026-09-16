import type { Organization, User } from "@prisma/client";

export type UserWithOrg = User & { organization: Organization };

/** Snake_case on the wire, matching what the frontend client already reads —
 *  and an allow-list, so passwordHash can never leak by being added later. */
export function serialiseUser(user: UserWithOrg) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    email_verified: user.emailVerified,
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
    },
  };
}
