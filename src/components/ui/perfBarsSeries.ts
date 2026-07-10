/**
 * Custom Lightweight-Charts series that paints the Daily P&L bars with the
 * Fey aesthetic the stock histogram can't: a vertical gradient (bright at the
 * tip, fading toward the zero line), rounded caps, and a soft outer glow.
 * Gains rise above the zero line, losses fall below — each lit from its own
 * tone. Drop-in for `chart.addCustomSeries`.
 */

import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesOptions,
  type CustomSeriesPricePlotValues,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type PaneRendererCustomData,
  type PriceToCoordinateConverter,
  type Time,
} from "lightweight-charts";

export interface PnlBarData extends CustomData<Time> {
  value: number;
}

export interface GradientBarsSeriesOptions extends CustomSeriesOptions {
  gainColor: string;
  lossColor: string;
}

const defaultOptions: GradientBarsSeriesOptions = {
  ...customSeriesDefaultOptions,
  gainColor: "#6BCB97",
  lossColor: "#E5746B",
};

// fancy-canvas is bundled inside lightweight-charts (no resolvable package),
// so we model just the slice of the bitmap rendering scope we touch.
interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}
interface RenderTarget {
  useBitmapCoordinateSpace(cb: (scope: BitmapScope) => void): void;
}

/** "#RRGGBB" → "rgba(r,g,b,a)". */
function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class GradientBarsRenderer implements ICustomSeriesPaneRenderer {
  private _data: PaneRendererCustomData<Time, PnlBarData> | null = null;
  private _options: GradientBarsSeriesOptions | null = null;

  update(
    data: PaneRendererCustomData<Time, PnlBarData>,
    options: GradientBarsSeriesOptions,
  ): void {
    this._data = data;
    this._options = options;
  }

  draw(target: unknown, priceToCoordinate: PriceToCoordinateConverter): void {
    (target as RenderTarget).useBitmapCoordinateSpace((scope) =>
      this._drawImpl(scope, priceToCoordinate),
    );
  }

  private _drawImpl(
    scope: BitmapScope,
    priceToCoordinate: PriceToCoordinateConverter,
  ): void {
    const data = this._data;
    const options = this._options;
    if (!data || !options || data.visibleRange === null) return;

    const ctx = scope.context;
    const hr = scope.horizontalPixelRatio;
    const vr = scope.verticalPixelRatio;

    const zeroMedia = priceToCoordinate(0);
    if (zeroMedia === null) return;
    const zeroY = zeroMedia * vr;

    // Bars sit a little narrower than the slot so they breathe.
    const fullW = data.barSpacing * 0.62;
    const radius = Math.min(fullW / 2, 5) * Math.min(hr, vr);
    const minH = 2 * vr;

    for (let i = data.visibleRange.from; i < data.visibleRange.to; i++) {
      const bar = data.bars[i];
      const value = bar.originalData.value;
      if (value === 0) continue;
      const yMedia = priceToCoordinate(value);
      if (yMedia === null) continue;

      const isGain = value > 0;
      const color = isGain ? options.gainColor : options.lossColor;
      const valueY = yMedia * vr;

      const halfW = (fullW * hr) / 2;
      const left = bar.x * hr - halfW;
      const width = halfW * 2;
      const top = Math.min(zeroY, valueY);
      const h = Math.max(Math.abs(valueY - zeroY), minH);
      const r = Math.min(radius, width / 2, h);

      // Gradient runs bright→dim from the tip back toward the zero line.
      const grad = ctx.createLinearGradient(0, top, 0, top + h);
      if (isGain) {
        grad.addColorStop(0, rgba(color, 0.95));
        grad.addColorStop(1, rgba(color, 0.16));
      } else {
        grad.addColorStop(0, rgba(color, 0.16));
        grad.addColorStop(1, rgba(color, 0.95));
      }

      // Rounded only on the tip end (top for gains, bottom for losses).
      const radii: [number, number, number, number] = isGain
        ? [r, r, 0, 0]
        : [0, 0, r, r];

      ctx.save();
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = 9 * Math.min(hr, vr);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(left, top, width, h, radii);
      ctx.fill();
      ctx.restore();

      // Crisp lit cap on the tip — the chiaroscuro highlight.
      const capH = Math.max(1.5 * vr, 1);
      ctx.save();
      ctx.fillStyle = rgba(color, 1);
      ctx.beginPath();
      ctx.roundRect(
        left,
        isGain ? top : top + h - capH,
        width,
        capH,
        isGain ? [r, r, 0, 0] : [0, 0, r, r],
      );
      ctx.fill();
      ctx.restore();
    }
  }
}

export class GradientBarsSeries
  implements ICustomSeriesPaneView<Time, PnlBarData, GradientBarsSeriesOptions>
{
  private _renderer = new GradientBarsRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(
    data: PaneRendererCustomData<Time, PnlBarData>,
    options: GradientBarsSeriesOptions,
  ): void {
    this._renderer.update(data, options);
  }

  priceValueBuilder(plotRow: PnlBarData): CustomSeriesPricePlotValues {
    // Include the zero baseline so autoscale always frames it.
    return [0, plotRow.value];
  }

  isWhitespace(
    data: PnlBarData | CustomSeriesWhitespaceData<Time>,
  ): data is CustomSeriesWhitespaceData<Time> {
    return (data as PnlBarData).value === undefined;
  }

  defaultOptions(): GradientBarsSeriesOptions {
    return defaultOptions;
  }
}
