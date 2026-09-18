import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  ArcElement,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  Legend,
  Tooltip,
);

@Component({
  selector: 'app-simple-chart',
  standalone: true,
  template: '<canvas #canvas></canvas>',
  styles: [
    `
      :host {
        display: block;
        min-height: 240px;
      }
      canvas {
        width: 100% !important;
        max-height: 280px;
      }
    `,
  ],
})
export class SimpleChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;
  @Input() type: 'bar' | 'line' | 'doughnut' = 'bar';
  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  @Input() seriesLabel = '';

  private chart?: { destroy(): void };

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.chart) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    const canvas = this.canvas?.nativeElement;
    if (!canvas) {
      return;
    }
    this.chart?.destroy();
    const color = this.css('--color-sidebar', '#0f1c2e');
    const accent = this.css('--color-accent', '#f59e0b');
    this.chart = new Chart(canvas, {
      type: this.type,
      data: {
        labels: this.labels,
        datasets: [
          {
            label: this.seriesLabel,
            data: this.values,
            backgroundColor: this.type === 'doughnut' ? this.palette() : accent,
            borderColor: color,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: this.type === 'doughnut' } },
      },
    });
  }

  private css(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private palette(): string[] {
    return [
      this.css('--color-chart-1', '#0f1c2e'),
      this.css('--color-chart-2', '#f59e0b'),
      this.css('--color-chart-3', '#1d4ed8'),
      this.css('--color-chart-4', '#0f766e'),
      this.css('--color-chart-5', '#b42318'),
      this.css('--color-chart-6', '#7c3aed'),
      this.css('--color-warning', '#ca8a04'),
      this.css('--color-muted', '#334155'),
    ];
  }
}
