import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class PersonalAppointmentTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  appointmentId!: string;
}

export class PersonalAppointmentMoveDto extends PersonalAppointmentTargetDto {
  @IsDateString()
  start!: string;
}
