import { prisma } from "./db.js";

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
}

/** Two companies called "Acme" both get a usable slug; the second gets a
 *  random suffix rather than an error the user can't act on. */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 120);
  let slug = base;
  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
  }
  return slug;
}
