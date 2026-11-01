import { HttpException } from "@nestjs/common";

/**
 * Erreur métier dont le message (en français) est montré tel quel à l'utilisateur.
 * Les autres exceptions reçoivent le libellé générique de leur statut.
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message, status);
  }
}
