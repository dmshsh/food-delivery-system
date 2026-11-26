import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BonusModule } from './bonus/bonus.module';
import { DbModule } from './db/db.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HealthModule } from './health/health.module';
import { MenuModule } from './menu/menu.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { OrdersModule } from './orders/orders.module';
import { ProfileModule } from './profile/profile.module';
import { ReportsModule } from './reports/reports.module';
import { SecurityModule } from './security/security.module';
import { UniquenessModule } from './uniqueness/uniqueness.module';

@Module({
  imports: [
    DbModule,
    SecurityModule,
    UniquenessModule,
    AuthModule,
    ProfileModule,
    MenuModule,
    NutritionModule,
    OrdersModule,
    ReportsModule,
    BonusModule,
    FeedbackModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
