import { getTableName, executeQuery, TEST_MODE } from './bigquery';

// Interface definitions matching the existing dataModel.ts
export interface BigQuerySubscriber {
  subscriber_id: string;
  plan_id: string;
  device_id: string;
  segment: string;
  autopay_enabled: boolean;
  tenure_days: number;
}

export interface BigQueryPlan {
  plan_id: string;
  name: string;
  tier: string;
  price: number;
  data_limit_gb: number;
  hotspot_limit_gb: number;
  international_countries: number;
}

export interface BigQueryDevice {
  device_id: string;
  brand: string;
  model: string;
  price: number;
  storage_gb: number;
  ram_gb: number;
}

export interface BigQueryUsageDaily {
  date: string;
  subscriber_id: string;
  data_gb_used: number;
  hotspot_gb_used: number;
  throttle_flag: boolean;
}

export interface BigQueryNetworkEvent {
  event_timestamp: string;
  subscriber_id: string;
  severity: string;
  event_type: string;
}

// Query functions for telecom demo data
export class BigQueryDataService {
  // Get all plans
  static async getPlans(): Promise<BigQueryPlan[]> {
    const query = `
      SELECT * FROM ${getTableName('dim_plan')} 
      ORDER BY price ASC
    `;
    
    if (TEST_MODE) {
      return this.getMockPlans();
    }
    
    return await executeQuery(query);
  }

  // Get all subscribers
  static async getSubscribers(): Promise<BigQuerySubscriber[]> {
    const query = `
      SELECT * FROM ${getTableName('dim_subscriber')}
    `;
    
    if (TEST_MODE) {
      return this.getMockSubscribers();
    }
    
    return await executeQuery(query);
  }

  // Get usage history for the last 30 days
  static async getUsageHistory(days: number = 30): Promise<BigQueryUsageDaily[]> {
    const query = `
      SELECT 
        date,
        subscriber_id,
        data_gb_used,
        hotspot_gb_used,
        throttle_flag
      FROM ${getTableName('fact_usage_daily')} 
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      ORDER BY date DESC, subscriber_id
    `;
    
    if (TEST_MODE) {
      return this.getMockUsage();
    }
    
    return await executeQuery(query);
  }

  // Get subscriber metrics
  static async getSubscriberMetrics(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) AS total_subscribers,
        AVG(tenure_days) AS avg_tenure,
        COUNTIF(autopay_enabled) AS autopay_count,
        COUNTIF(autopay_enabled) * 100.0 / COUNT(*) AS autopay_percentage
      FROM ${getTableName('dim_subscriber')}
    `;
    
    if (TEST_MODE) {
      const mockSubs = this.getMockSubscribers();
      return [{
        total_subscribers: mockSubs.length,
        avg_tenure: mockSubs.reduce((sum, s) => sum + s.tenure_days, 0) / mockSubs.length,
        autopay_count: mockSubs.filter(s => s.autopay_enabled).length,
        autopay_percentage: (mockSubs.filter(s => s.autopay_enabled).length / mockSubs.length) * 100
      }];
    }
    
    return await executeQuery(query);
  }

  // Get daily data usage aggregated
  static async getDailyDataUsage(days: number = 30): Promise<any[]> {
    const query = `
      SELECT 
        date,
        SUM(data_gb_used) AS total_data_gb,
        SUM(hotspot_gb_used) AS total_hotspot_gb,
        COUNT(DISTINCT subscriber_id) AS active_subscribers,
        AVG(data_gb_used) AS avg_data_per_subscriber
      FROM ${getTableName('fact_usage_daily')} 
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      GROUP BY date
      ORDER BY date DESC
    `;
    
    if (TEST_MODE) {
      return this.getMockDailyUsage();
    }
    
    return await executeQuery(query);
  }

  // Get plan performance metrics
  static async getPlanPerformance(): Promise<any[]> {
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
      FROM ${getTableName('dim_plan')} p
      LEFT JOIN ${getTableName('dim_subscriber')} s ON p.plan_id = s.plan_id
      GROUP BY p.plan_id, p.name, p.tier, p.price
      ORDER BY subscriber_count DESC
    `;
    
    if (TEST_MODE) {
      return this.getMockPlanPerformance();
    }
    
    return await executeQuery(query);
  }

  // Get network events by severity
  static async getNetworkEvents(days: number = 7): Promise<any[]> {
    const query = `
      SELECT 
        DATE(event_timestamp) AS event_date,
        severity,
        event_type,
        COUNT(*) AS event_count,
        COUNT(DISTINCT subscriber_id) AS affected_subscribers
      FROM ${getTableName('fact_network_events')}
      WHERE event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
      GROUP BY event_date, severity, event_type
      ORDER BY event_date DESC, event_count DESC
    `;
    
    if (TEST_MODE) {
      return this.getMockNetworkEvents();
    }
    
    return await executeQuery(query);
  }

  // Mock data functions for testing
  private static getMockPlans(): BigQueryPlan[] {
    return [
      { plan_id: 'PLAN001', name: 'Basic Mobile', tier: 'Basic', price: 29.99, data_limit_gb: 5, hotspot_limit_gb: 2, international_countries: 0 },
      { plan_id: 'PLAN002', name: 'Premium Mobile', tier: 'Premium', price: 59.99, data_limit_gb: 20, hotspot_limit_gb: 10, international_countries: 25 },
      { plan_id: 'PLAN003', name: 'Unlimited Pro', tier: 'Unlimited', price: 89.99, data_limit_gb: -1, hotspot_limit_gb: 20, international_countries: 50 }
    ];
  }

  private static getMockSubscribers(): BigQuerySubscriber[] {
    return [
      { subscriber_id: 'SUB001', plan_id: 'PLAN001', device_id: 'DEV001', segment: 'Consumer', autopay_enabled: true, tenure_days: 180 },
      { subscriber_id: 'SUB002', plan_id: 'PLAN002', device_id: 'DEV002', segment: 'Business', autopay_enabled: false, tenure_days: 365 },
      { subscriber_id: 'SUB003', plan_id: 'PLAN003', device_id: 'DEV003', segment: 'Consumer', autopay_enabled: true, tenure_days: 730 },
      { subscriber_id: 'SUB004', plan_id: 'PLAN001', device_id: 'DEV004', segment: 'Consumer', autopay_enabled: false, tenure_days: 45 },
      { subscriber_id: 'SUB005', plan_id: 'PLAN002', device_id: 'DEV005', segment: 'Business', autopay_enabled: true, tenure_days: 120 }
    ];
  }

  private static getMockUsage(): BigQueryUsageDaily[] {
    const usage: BigQueryUsageDaily[] = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      usage.push(
        { date: dateStr, subscriber_id: 'SUB001', data_gb_used: Math.random() * 5, hotspot_gb_used: Math.random() * 2, throttle_flag: false },
        { date: dateStr, subscriber_id: 'SUB002', data_gb_used: Math.random() * 20, hotspot_gb_used: Math.random() * 10, throttle_flag: false },
        { date: dateStr, subscriber_id: 'SUB003', data_gb_used: Math.random() * 50, hotspot_gb_used: Math.random() * 20, throttle_flag: false }
      );
    }
    
    return usage;
  }

  private static getMockDailyUsage(): any[] {
    const data = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      data.push({
        date: dateStr,
        total_data_gb: Math.random() * 100 + 50,
        total_hotspot_gb: Math.random() * 30 + 10,
        active_subscribers: Math.floor(Math.random() * 1000) + 500,
        avg_data_per_subscriber: Math.random() * 10 + 5
      });
    }
    
    return data;
  }

  private static getMockPlanPerformance(): any[] {
    const plans = this.getMockPlans();
    const subscribers = this.getMockSubscribers();
    
    return plans.map(plan => {
      const planSubscribers = subscribers.filter(s => s.plan_id === plan.plan_id);
      const autopayCount = planSubscribers.filter(s => s.autopay_enabled).length;
      
      return {
        plan_id: plan.plan_id,
        name: plan.name,
        tier: plan.tier,
        price: plan.price,
        subscriber_count: planSubscribers.length,
        avg_tenure_days: planSubscribers.reduce((sum, s) => sum + s.tenure_days, 0) / planSubscribers.length || 0,
        autopay_count: autopayCount,
        autopay_percentage: (autopayCount / planSubscribers.length) * 100 || 0
      };
    });
  }

  private static getMockNetworkEvents(): any[] {
    const events: any[] = [];
    const today = new Date();
    const eventTypes = ['Call Drop', 'Slow Data', 'Connection Lost', 'Roaming Issue'];
    const severities = ['low', 'medium', 'high', 'critical'];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      eventTypes.forEach(eventType => {
        severities.forEach(severity => {
          events.push({
            event_date: dateStr,
            severity,
            event_type: eventType,
            event_count: Math.floor(Math.random() * 50) + 1,
            affected_subscribers: Math.floor(Math.random() * 100) + 1
          });
        });
      });
    }
    
    return events;
  }
}
