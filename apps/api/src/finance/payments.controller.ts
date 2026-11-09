import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from "@nestjs/common";
import {
  type CreateDonation,
  createDonationSchema,
  type MonthlyAmountChange,
  type ParrainPayments,
  type ParrainPaymentsQuery,
  parrainPaymentsQuerySchema,
  type PaymentHistoryItem,
  type UpdateMonthlyAmount,
  updateMonthlyAmountSchema,
  type UpdatePaymentMethod,
  updatePaymentMethodSchema,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { type ParrainActor, PaymentsService } from "./payments.service.js";
import { ReceiptsService } from "./receipts.service.js";

/** P-Versements : versements du parrain connecté, mensualités, dons et reçus fiscaux. */
@Controller("parrain")
@Roles(["parrain"])
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
  ) {}

  private async actor(session: UserSession): Promise<ParrainActor> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor?.parrainId) {
      throw new ForbiddenException();
    }
    return { userId: actor.userId, parrainId: actor.parrainId };
  }

  @Get("payments")
  @Header("Cache-Control", "private, no-store")
  async overview(
    @Session() session: UserSession,
    @Query({ schema: parrainPaymentsQuerySchema }) query: ParrainPaymentsQuery,
  ): Promise<ParrainPayments> {
    return this.payments.overview(await this.actor(session), query.annee);
  }

  @Post("payments/monthly-amount")
  @HttpCode(200)
  async monthlyAmount(
    @Session() session: UserSession,
    @Body({ schema: updateMonthlyAmountSchema }) input: UpdateMonthlyAmount,
  ): Promise<MonthlyAmountChange> {
    return this.payments.changeMonthlyAmount(await this.actor(session), input);
  }

  @Put("payments/method")
  async method(
    @Session() session: UserSession,
    @Body({ schema: updatePaymentMethodSchema }) input: UpdatePaymentMethod,
  ): Promise<UpdatePaymentMethod> {
    return this.payments.changeMethod(await this.actor(session), input);
  }

  @Post("payments/donations")
  async donate(
    @Session() session: UserSession,
    @Body({ schema: createDonationSchema }) input: CreateDonation,
  ): Promise<PaymentHistoryItem> {
    return this.payments.donate(await this.actor(session), input);
  }

  /** Reçu fiscal d'une année close, en PDF (émis au premier téléchargement). */
  @Get("receipts/:year")
  @Header("Cache-Control", "private, no-store")
  async receipt(
    @Session() session: UserSession,
    @Param("year") year: string,
  ): Promise<StreamableFile> {
    if (!/^\d{4}$/.test(year)) {
      throw new NotFoundException();
    }
    const { filename, body } = await this.receipts.download(
      await this.actor(session),
      Number(year),
    );
    return new StreamableFile(body, {
      type: "application/pdf",
      disposition: `attachment; filename="${filename}"`,
      length: body.byteLength,
    });
  }
}
