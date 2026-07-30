import { IsString, Matches } from 'class-validator';

export class ApprovalDecisionDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  payloadHash!: string;
}
