import { Module } from '@nestjs/common';
import { BonusController } from './bonus.controller';

@Module({ controllers: [BonusController] })
export class BonusModule {}
