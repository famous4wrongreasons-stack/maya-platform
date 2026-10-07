import { IsOptional, Matches } from 'class-validator';
import { CreateAppointmentDto } from './create-appointment.dto';

export class PersonalCreateAppointmentDto extends CreateAppointmentDto {
  /** Optional only so a durable retry remains readable without a new preview. */
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  previewFactsHash?: string;
}
