import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Jeton d'injection du client Prisma. L'instance fournie est le singleton de `client.ts`,
 * partagé avec Better Auth : il n'existe jamais deux pools de connexions.
 */
export abstract class PrismaService extends PrismaClient {}
