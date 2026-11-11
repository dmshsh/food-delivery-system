import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BonusModule } from './bonus/bonus.module';
import { DbModule } from './db/db.module';
import { FeedbackModule } from './feedback/feedback.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    DbModule,
    SecurityModule,
    AuthModule,
    MenuModule,
    OrdersModule,
    ReportsModule,
    BonusModule,
    FeedbackModule,
    AdminModule,
  ],
})
export class AppModule {}
