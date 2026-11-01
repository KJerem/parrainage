import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Client unique de l'API : Better Auth (créé hors injection) et Nest partagent ce pool. */
export const prisma = createPrismaClient(getEnv().DATABASE_URL);
