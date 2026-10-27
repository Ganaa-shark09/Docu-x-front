import { init, use } from 'echarts/core';
import { PieChart, LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
use([PieChart, LineChart, BarChart, BarChart, GridComponent, TooltipComponent, SVGRenderer]);
export const createPlot = (element: HTMLElement) => init(element, undefined, { renderer: 'svg' });
