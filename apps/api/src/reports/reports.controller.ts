import { BadRequestException, Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ValidationError, validateChartQuery } from '../domain/validation';
import { Roles } from '../auth/roles.decorator';
import { ReportViewsService } from './report-views.service';
import { ReportsService } from './reports.service';

const KINDS = ['daily', 'dishes', 'customers'] as const;
type Kind = (typeof KINDS)[number];

/**
 * The accountant's reports. The administrator may read them too: running the
 * restaurant and reporting on it are different jobs, but the numbers are the same.
 */
@Controller('reports')
@UseGuards(AuthGuard)
@Roles('ACCOUNTANT', 'ADMIN')
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly views: ReportViewsService) {}

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

  /** Money and orders per day. */
  @Get('daily')
  daily(@Query('from') from?: string, @Query('to') to?: string) {
    return this.views.daily(from, to);
  }

  /** What sells, and what never does. */
  @Get('dishes')
  dishes(@Query('from') from?: string, @Query('to') to?: string) {
    return this.views.dishes(from, to);
  }

  /**
   * The series behind the chart on the accounting page.
   *
   * Separate from the daily report because a chart and a table want different
   * things: the table leaves out days with no trade, the chart must not.
   */
  @Get('chart')
  chart(@Query() query: Record<string, string>) {
    try {
      return this.views.chart(validateChartQuery(query));
    } catch (e) {
      if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }
  }

  /** Who orders, how often, how happy. */
  @Get('customers')
  customers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.views.customers(from, to);
  }

  /**
   * Any of the three as a CSV download: `/api/reports/daily/export.csv`.
   *
   * One route for all three rather than three near-identical ones, with the
   * name checked against a fixed list so the path cannot ask for anything else.
   */
  @Get(':kind/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="report.csv"')
  exportCsv(@Param('kind') kind: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!(KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException({ code: 'bad_report', message: 'Choose the daily, dishes or customers report.' });
    }
    return this.views.csv(kind as Kind, from, to);
  }
}
