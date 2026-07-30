import { Prisma } from '@prisma/client';

export const asJson = (value: unknown): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue;
};
