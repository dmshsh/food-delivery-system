import { Module } from '@nestjs/common';
import { NutritionController } from './nutrition.controller';

@Module({ controllers: [NutritionController] })
export class NutritionModule {}
