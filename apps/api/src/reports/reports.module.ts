import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ReportViewsService } from './report-views.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [OrdersModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportViewsService],
})
export class ReportsModule {}
