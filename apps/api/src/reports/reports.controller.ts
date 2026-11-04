import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard)
@Roles('ACCOUNTANT')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  report(@Query('status') status?: string) {
    return this.reports.report(status);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="order_report.csv"')
  csv(@Query('status') status?: string) {
    return this.reports.csv(status);
  }
}
