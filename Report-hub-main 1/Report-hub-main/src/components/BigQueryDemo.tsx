import React, { useState, useEffect } from 'react';
import { Card } from '../app/components/ui/Card';
import { Button } from '../app/components/ui/Button';
import { Badge } from '../app/components/ui/Badge';
import { bigQueryApi } from '../lib/apiService';

interface Plan {
  plan_id: string;
  name: string;
  tier: string;
  price: number;
  data_limit_gb: number;
  hotspot_limit_gb: number;
  international_countries: number;
}

interface SubscriberMetrics {
  total_subscribers: number;
  avg_tenure: number;
  autopay_count: number;
  autopay_percentage: number;
}

interface DailyUsage {
  date: string;
  total_data_gb: number;
  total_hotspot_gb: number;
  active_subscribers: number;
  avg_data_per_subscriber: number;
}

export function BigQueryDemo() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [metrics, setMetrics] = useState<SubscriberMetrics | null>(null);
  const [usage, setUsage] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load plans
      const plansResult = await bigQueryApi.getPlans();
      if (plansResult.error) {
        throw new Error(plansResult.error);
      }
      setPlans(plansResult.data || []);

      // Load subscriber metrics
      const metricsResult = await bigQueryApi.getSubscriberMetrics();
      if (metricsResult.error) {
        throw new Error(metricsResult.error);
      }
      setMetrics(metricsResult.data?.[0] || null);

      // Load daily usage
      const usageResult = await bigQueryApi.getDailyUsage(7);
      if (usageResult.error) {
        throw new Error(usageResult.error);
      }
      setUsage(usageResult.data || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatNumber = (num: number, decimals: number = 1) => {
    return num.toFixed(decimals);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Basic': return 'bg-gray-100 text-gray-800';
      case 'Premium': return 'bg-blue-100 text-blue-800';
      case 'Unlimited': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BigQuery Telecom Demo</h1>
          <p className="text-gray-600 mt-2">
            Real-time telecom data powered by Google BigQuery
          </p>
        </div>
        <Button onClick={loadData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Data'}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      {/* Subscriber Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.total_subscribers.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Average Tenure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(metrics.avg_tenure)} days
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Autopay Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.autopay_count.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Autopay Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(metrics.autopay_percentage)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plans Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Plan</th>
                  <th className="text-left p-2">Tier</th>
                  <th className="text-left p-2">Price</th>
                  <th className="text-left p-2">Data Limit</th>
                  <th className="text-left p-2">Hotspot</th>
                  <th className="text-left p-2">International</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.plan_id} className="border-b">
                    <td className="p-2 font-medium">{plan.name}</td>
                    <td className="p-2">
                      <Badge className={getTierColor(plan.tier)}>
                        {plan.tier}
                      </Badge>
                    </td>
                    <td className="p-2 font-semibold">
                      {formatCurrency(plan.price)}
                    </td>
                    <td className="p-2">
                      {plan.data_limit_gb === -1 ? 'Unlimited' : `${plan.data_limit_gb} GB`}
                    </td>
                    <td className="p-2">{plan.hotspot_limit_gb} GB</td>
                    <td className="p-2">{plan.international_countries} countries</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Daily Usage Chart */}
      {usage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Usage Trends (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {usage.slice(0, 7).map((day) => (
                <div key={day.date} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{day.date}</div>
                    <div className="text-sm text-gray-600">
                      {day.active_subscribers} active users
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatNumber(day.total_data_gb)} GB total
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatNumber(day.avg_data_per_subscriber)} GB avg per user
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Status */}
      <Card>
        <CardHeader>
          <CardTitle>API Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-green-700">Connected to BigQuery API</span>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Data is currently served from mock endpoints for demonstration.
            Update the server configuration to connect to your actual BigQuery instance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
