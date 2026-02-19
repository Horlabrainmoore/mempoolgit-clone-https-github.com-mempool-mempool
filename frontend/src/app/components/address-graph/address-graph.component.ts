import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  Input,
  LOCALE_ID,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges
} from '@angular/core';

import { echarts, EChartsOption } from '@app/graphs/echarts';
import { BehaviorSubject, Observable, Subscription, combineLatest, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { AddressTxSummary, ChainStats } from '@interfaces/electrs.interface';
import { ElectrsApiService } from '@app/services/electrs-api.service';
import { Router } from '@angular/router';
import { StateService } from '@app/services/state.service';
import { PriceService } from '@app/services/price.service';

const periodSeconds = {
  '1d': 86400,
  '3d': 259200,
  '1w': 604800,
  '1m': 2592000,
  '6m': 15552000,
  '1y': 31536000
};

@Component({
  selector: 'app-address-graph',
  templateUrl: './address-graph.component.html',
  styleUrls: ['./address-graph.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressGraphComponent implements OnChanges, OnDestroy {

  @Input() address: string;
  @Input() stats: ChainStats;
  @Input() addressSummary$: Observable<AddressTxSummary[]> | null;
  @Input() period: '1d'|'3d'|'1w'|'1m'|'6m'|'1y'|'all' = 'all';

  chartOptions: EChartsOption = {};
  chartInstance: any;

  data: any[] = [];
  fiatData: any[] = [];

  isLoading = true;
  error: string | null = null;

  subscription: Subscription;
  redraw$ = new BehaviorSubject(true);

  constructor(
    @Inject(LOCALE_ID) public locale: string,
    private electrsApiService: ElectrsApiService,
    private priceService: PriceService,
    private stateService: StateService,
    private cd: ChangeDetectorRef,
    private router: Router,
    private zone: NgZone
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.isLoading = true;

    if (!this.address && !this.addressSummary$) return;

    if (this.subscription) this.subscription.unsubscribe();

    const summary$ = this.addressSummary$
      ? this.addressSummary$
      : this.electrsApiService.getAddressSummary$(this.address);

    this.subscription = combineLatest([
      this.redraw$,
      summary$
    ])
    .pipe(
      switchMap(([_, summary]) => {
        if (!summary) return of(null);

        const times = summary.map(s => s.time);

        return this.priceService.getPriceByBulk$(times, 'USD').pipe(
          map(prices => ({ summary, prices })),
          catchError(() => of({ summary, prices: [] }))
        );
      })
    )
    .subscribe((res: any) => {
      if (!res) return;

      this.buildChart(res.summary, res.prices);

      this.isLoading = false;
      this.cd.markForCheck();
    });
  }

  buildChart(summary: AddressTxSummary[], prices: any[]) {
    let running = this.stats
      ? this.stats.funded_txo_sum - this.stats.spent_txo_sum
      : 0;

    const rows = summary.map((tx, i) => {
      const balance = running;
      const price = prices?.[i]?.price?.USD ?? 0;
      const fiat = balance * price / 1e8;

      running -= tx.value;

      return {
        time: tx.time * 1000,
        balance,
        fiat,
        tx
      };
    }).reverse();

    this.data = rows.map(r => [r.time, r.balance, r.tx]);
    this.fiatData = rows.map(r => [r.time, r.fiat, r.tx]);

    this.chartOptions = {
      animation: false,
      grid: { top: 20, left: 70, right: 40, bottom: 40 },

      tooltip: {
        trigger: 'axis',
        formatter: (items: any) => {
          const item = items?.[0];
          if (!item) return '';

          const d = item.data;
          const date = new Date(d[0]).toLocaleDateString(this.locale);

          return `
          <div>
            <b>${date}</b><br/>
            Balance: ${(d[1] / 1e8).toFixed(4)} BTC
          </div>`;
        }
      },

      xAxis: { type: 'time' },
      yAxis: { type: 'value' },

      series: [
        {
          name: 'Balance',
          type: 'line',
          step: 'end',
          showSymbol: false,
          data: this.data
        },
        {
          name: 'Fiat',
          type: 'line',
          step: 'end',
          showSymbol: false,
          data: this.fiatData
        }
      ]
    };
  }

  onChartInit(ec) {
    this.chartInstance = ec;

    ec.on('click', (e) => {
      const tx = e?.data?.[2];
      if (!tx?.txid) return;

      this.zone.run(() => {
        this.router.navigate(['/tx', tx.txid]);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) this.subscription.unsubscribe();
  }
}
