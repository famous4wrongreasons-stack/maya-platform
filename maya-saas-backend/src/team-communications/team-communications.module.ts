import { Module } from '@nestjs/common';
import { CommunicationDeliveryModule } from '../communication-delivery';
import { TeamCommunicationsFoundationModule } from './team-communications-foundation.module';
import { TeamCommunicationsController } from './team-communications.controller';
import { TeamCommunicationsScheduler } from './team-communications.scheduler';
@Module({imports:[TeamCommunicationsFoundationModule,CommunicationDeliveryModule],controllers:[TeamCommunicationsController],providers:[TeamCommunicationsScheduler]})
export class TeamCommunicationsModule{}
