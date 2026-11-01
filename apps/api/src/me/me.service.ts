import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Me } from "@parrainage/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { toMe } from "./me.mapper.js";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        parrainProfile: { select: { displayName: true, avatarTone: true } },
        relais: { select: { displayName: true, city: true, district: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    const me = toMe(user);
    if (!me) {
      throw new ForbiddenException();
    }
    return me;
  }
}
