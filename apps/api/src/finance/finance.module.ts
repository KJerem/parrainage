import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { ReceiptsService } from "./receipts.service.js";

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, ReceiptsService],
})
export class FinanceModule {}
