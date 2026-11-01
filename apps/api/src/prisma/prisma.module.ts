import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { prisma } from "./client.js";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prisma }],
  exports: [PrismaService],
})
export class PrismaModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await prisma.$disconnect();
  }
}
