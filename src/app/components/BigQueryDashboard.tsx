import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/Button';

const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-4 pt-4 pb-2 ${className}`}>{children}</div>
);
const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-4 pb-4 ${className}`}>{children}</div>
);
const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h4 className={`font-medium ${className}`}>{children}</h4>
);
const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variant === 'outline' ? 'border border-current' : 'bg-primary/10 text-primary'}`}>{children}</span>
);
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Database, TrendingUp, Users, ShoppingCart } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchTable(table: string, params?: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Query failed');
  return json.data as any[];
}

interface DashboardState {
  markets: any[];
  salesMonthly: any[];
  catalogReports: any[];
  catalogDatasets: any[];
  churnData: any[];
  performanceByRegion: any[];
  revenueByDeviceGroup: any[];
  loading: boolean;
  error: string | null;
}

const BigQueryDashboard: React.FC = () => {
  const [state, setState] = useState<DashboardState>({
    markets: [], salesMonthly: [], catalogReports: [], catalogDatasets: [],
    churnData: [], performanceByRegion: [], revenueByDeviceGroup: [],
    loading: true, error: null,
  });

  const load = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const [markets, salesMonthly, catalogReports, catalogDatasets, churnData, performanceByRegion, revenueByDeviceGroup] =
        await Promise.all([
          fetchTable('markets'),
          fetchTable('monthlyRollup'),
          fetchTable('catalogReports'),
          fetchTable('catalogDatasets'),
          fetchTable('churnMonthly'),
          fetchTable('performanceByRegion'),
          fetchTable('revenueByDeviceGroup'),
        ]);
      setState({ markets, salesMonthly, catalogReports, catalogDatasets, churnData, performanceByRegion, revenueByDeviceGroup, loading: false, error: null });
    } catch (err: any) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  useEffect(() => { load(); }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <RefreshCw className="animate-spin h-5 w-5" />
        <span>Loading BigQuery data...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-6 rounded-lg bg-destructive/10 text-destructive">
        <p className="font-medium">BigQuery connection error</p>
        <p className="text-sm mt-1">{state.error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
      </div>
    );
  }

  const totalRevenue = state.salesMonthly.reduce((sum: number, r: any) => sum + (r.sug_revenue || 0), 0);
  const avgTakeRate = state.salesMonthly.length
    ? state.salesMonthly.reduce((sum: number, r: any) => sum + (r.take_rate_pct || 0), 0) / state.salesMonthly.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">BigQuery Live Dashboard</h2>
          <Badge variant="secondary">Live</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4" />Total Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${(totalRevenue / 1_000_000).toFixed(1)}M</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Take Rate</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{avgTakeRate.toFixed(1)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Users className="h-4 w-4" />Markets</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{state.markets.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-4 w-4" />Reports</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{state.catalogReports.length}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="churn">Churn</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Revenue by Device Group</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={state.revenueByDeviceGroup}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="device_group" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="churn" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Monthly Churn Rate</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={state.churnData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month_date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="churn_rate" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regions" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Performance by Region</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={state.performanceByRegion} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="region" type="category" width={100} />
                  <Tooltip />
                  <Bar dataKey="performance_score" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Report Catalog ({state.catalogReports.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-72 overflow-auto">
                {state.catalogReports.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{r.report_name}</p>
                      <p className="text-xs text-muted-foreground">{r.domain} · {r.business_owner}</p>
                    </div>
                    {r.enterprise_flag && <Badge>Enterprise</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BigQueryDashboard;
