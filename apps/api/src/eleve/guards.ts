import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  type ChildContext,
  ChildSessionService,
  type DeviceContext,
} from "./child-session.service.js";

type EleveRequest = Request & { device?: DeviceContext; child?: ChildContext };

/** Exige le cookie d'un poste lié à une session ouverte (suspendue comprise). Sinon 401. */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly sessions: ChildSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<EleveRequest>();
    const device = await this.sessions.deviceOf(request);
    if (!device) {
      // Session fermée ou expirée : ces cookies ne serviront plus.
      this.sessions.clearAll(http.getResponse<Response>());
      throw new UnauthorizedException();
    }
    request.device = device;
    return true;
  }
}

/** Exige un enfant connecté sur ce poste, pendant une session active. Sinon 401. */
@Injectable()
export class ChildGuard implements CanActivate {
  constructor(private readonly sessions: ChildSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<EleveRequest>();
    const child = await this.sessions.childOf(request);
    if (!child) {
      this.sessions.clearChild(http.getResponse<Response>());
      throw new UnauthorizedException();
    }
    request.child = child;
    return true;
  }
}

/** Le poste vérifié par `DeviceGuard`. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DeviceContext => {
    const { device } = context.switchToHttp().getRequest<EleveRequest>();
    if (!device) {
      throw new UnauthorizedException();
    }
    return device;
  },
);

/** L'enfant vérifié par `ChildGuard`. */
export const CurrentChild = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ChildContext => {
    const { child } = context.switchToHttp().getRequest<EleveRequest>();
    if (!child) {
      throw new UnauthorizedException();
    }
    return child;
  },
);
