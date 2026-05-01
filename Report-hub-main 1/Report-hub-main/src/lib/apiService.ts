// Client-side API service for BigQuery integration

const API_BASE_URL = 'http://localhost:3001/api';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string;
}

// Generic API call function
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || 'API request failed',
        details: data.details || response.statusText,
      };
    }

    return { data };
  } catch (error) {
    return {
      error: 'Network error',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// BigQuery query execution
export async function executeBigQuery(query: string): Promise<ApiResponse<any[]>> {
  return apiCall<any[]>('/bigquery', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

// Health check
export async function healthCheck(): Promise<ApiResponse<{ status: string; test_mode: boolean }>> {
  return apiCall<{ status: string; test_mode: boolean }>('/health', {
    method: 'GET',
  });
}

// Specific BigQuery API functions for telecom data
export const bigQueryApi = {
  // Execute custom BigQuery query
  async executeBigQuery(query: string) {
    return executeBigQuery(query);
  },

  // Get subscriber metrics
  async getSubscriberMetrics() {
    const query = `
      SELECT 
        COUNT(*) AS total_subscribers,
        AVG(tenure_days) AS avg_tenure,
        COUNTIF(autopay_enabled) AS autopay_count,
        COUNTIF(autopay_enabled) * 100.0 / COUNT(*) AS autopay_percentage
      FROM \`data-practice-472314.telecom_demo.dim_subscriber\`
    `;
    return executeBigQuery(query);
  },

  // Get daily usage data
  async getDailyUsage(days: number = 30) {
    const query = `
      SELECT 
        date,
        SUM(data_gb_used) AS total_data_gb,
        SUM(hotspot_gb_used) AS total_hotspot_gb,
        COUNT(DISTINCT subscriber_id) AS active_subscribers,
        AVG(data_gb_used) AS avg_data_per_subscriber
      FROM \`data-practice-472314.telecom_demo.fact_usage_daily\` 
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      GROUP BY date
      ORDER BY date DESC
    `;
    return executeBigQuery(query);
  },

  // Get plan performance
  async getPlanPerformance() {
    const query = `
      SELECT 
        p.plan_id,
        p.name,
        p.tier,
        p.price,
        COUNT(s.subscriber_id) AS subscriber_count,
        AVG(s.tenure_days) AS avg_tenure_days,
        COUNTIF(s.autopay_enabled) AS autopay_count,
        COUNTIF(s.autopay_enabled) * 100.0 / COUNT(s.subscriber_id) AS autopay_percentage
      FROM \`data-practice-472314.telecom_demo.dim_plan\` p
      LEFT JOIN \`data-practice-472314.telecom_demo.dim_subscriber\` s ON p.plan_id = s.plan_id
      GROUP BY p.plan_id, p.name, p.tier, p.price
      ORDER BY subscriber_count DESC
    `;
    return executeBigQuery(query);
  },

  // Get network events
  async getNetworkEvents(days: number = 7) {
    const query = `
      SELECT 
        DATE(event_timestamp) AS event_date,
        severity,
        event_type,
        COUNT(*) AS event_count,
        COUNT(DISTINCT subscriber_id) AS affected_subscribers
      FROM \`data-practice-472314.telecom_demo.fact_network_events\`
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
      GROUP BY event_date, severity, event_type
      ORDER BY event_date DESC, event_count DESC
    `;
    return executeBigQuery(query);
  },

  // Get all plans
  async getPlans() {
    const query = `
      SELECT * FROM \`data-practice-472314.telecom_demo.dim_plan\` 
      ORDER BY price ASC
    `;
    return executeBigQuery(query);
  },

  // Get all subscribers
  async getSubscribers() {
    const query = `
      SELECT * FROM \`data-practice-472314.telecom_demo.dim_subscriber\`
    `;
    return executeBigQuery(query);
  },

  // Get usage history
  async getUsageHistory(days: number = 30) {
    const query = `
      SELECT 
        date,
        subscriber_id,
        data_gb_used,
        hotspot_gb_used,
        throttle_flag
      FROM \`data-practice-472314.telecom_demo.fact_usage_daily\` 
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      ORDER BY date DESC, subscriber_id
    `;
    return executeBigQuery(query);
  },
};

export default apiCall;
