import React, { lazy, Suspense } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GenerativeTable } from './GenerativeTable';
import { ReportSkeleton } from './ReportSkeleton';
import { Card } from './ui/Card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Lightweight card sub-components (Card.tsx only exports Card itself)
const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-4 pt-4 pb-2 ${className}`}>{children}</div>
);
const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-4 pb-4 ${className}`}>{children}</div>
);
const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h4 className={`font-medium ${className}`}>{children}</h4>
);
const Badge = ({ children, variant = 'default', className = '' }: { children: React.ReactNode; variant?: string; className?: string }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variant === 'outline' ? 'border border-current' : 'bg-primary/10 text-primary'} ${className}`}>{children}</span>
);

const BigQueryDashboard = lazy(() => import('./BigQueryDashboard'));

export interface UITreeNode {
  renderType: string;
  props: Record<string, any>;
  children?: UITreeNode[];
  sections?: { type: string; components: UITreeNode[] }[];
}

// ---- Leaf renderers --------------------------------------------------------

function KPICard({ value, title, trend, label, delta, deltaLabel, explanation }: any) {
  const trendVal = typeof trend === 'string' ? trend : delta;
  const isUp = typeof trendVal === 'string' && trendVal.startsWith('+');
  const isDown = typeof trendVal === 'string' && trendVal.startsWith('-');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title || label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {trendVal && (
          <div className={`flex items-center gap-1 mt-1 text-sm ${isUp ? 'text-green-600' : isDown ? 'text-red-500' : 'text-muted-foreground'}`}>
            {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{trendVal}</span>
            {deltaLabel && <span className="text-muted-foreground ml-1">{deltaLabel}</span>}
          </div>
        )}
        {explanation && <p className="text-xs text-muted-foreground mt-2 italic">{explanation}</p>}
      </CardContent>
    </Card>
  );
}

function KPIGrid({ metrics, explanation }: any) {
  if (!Array.isArray(metrics)) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {metrics.map((m: any, i: number) => <KPICard key={i} {...m} />)}
      </div>
      {explanation && <p className="text-xs text-muted-foreground italic">{explanation}</p>}
    </div>
  );
}

function BarChartComponent({ data, xKey, yKey, title, color, explanation }: any) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {explanation && <p className="text-xs text-muted-foreground italic">{explanation}</p>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey={yKey} fill={color || 'hsl(var(--primary))'} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function LineChartComponent({ data, xKey, yKey, title, explanation }: any) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {explanation && <p className="text-xs text-muted-foreground italic">{explanation}</p>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey={yKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TableComponent({ columns, rows, data, title, explanation }: any) {
  const tableRows = rows || data || [];
  const tableCols = columns || (tableRows[0] ? Object.keys(tableRows[0]) : []);
  return (
    <div className="space-y-2">
      {explanation && <p className="text-xs text-muted-foreground italic">{explanation}</p>}
      <GenerativeTable title={title || 'Data'} columns={tableCols} rows={tableRows} />
    </div>
  );
}

function ReportShell({ title, description, warnings, children }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {warnings?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {warnings.map((w: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs text-yellow-700 border-yellow-400">{w}</Badge>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ---- Component registry ----------------------------------------------------

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  KPI: KPICard,
  KPIGrid,
  BarChart: BarChartComponent,
  LineChart: LineChartComponent,
  Table: TableComponent,
  GenerativeTable: TableComponent,
  Report: ReportShell,
  ReportSkeleton,
  BigQueryDashboard,
};

// ---- Recursive renderer ----------------------------------------------------

export function UITreeRenderer({ node }: { node: UITreeNode }) {
  const Component = COMPONENT_MAP[node.renderType];

  if (!Component) {
    return (
      <div className="p-3 rounded border border-dashed text-xs text-muted-foreground">
        Unknown component: <code>{node.renderType}</code>
      </div>
    );
  }

  const childrenContent = (
    <>
      {node.children?.map((child, i) => <UITreeRenderer key={i} node={child} />)}
      {node.sections?.map((section, si) => (
        <div key={si} className="space-y-4">
          {section.components.map((c, ci) => <UITreeRenderer key={ci} node={c} />)}
        </div>
      ))}
    </>
  );

  if (node.renderType === 'BigQueryDashboard') {
    return (
      <Suspense fallback={<ReportSkeleton />}>
        <Component {...node.props} />
      </Suspense>
    );
  }

  return (
    <Component {...node.props}>
      {childrenContent}
    </Component>
  );
}
