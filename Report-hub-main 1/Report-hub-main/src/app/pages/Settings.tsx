import React, { useState } from 'react';
import { Layout } from '../components/ui/Layout';
import { useNavigate } from 'react-router';
import { getLatestRefreshTime, formatRelativeTime } from '@/lib/dataModel';
import { ChevronDown, User, Bell, Globe, Info } from 'lucide-react';

export function SettingsPage() {
  const navigate = useNavigate();
  const lastRefresh = getLatestRefreshTime();
  
  // Preference state (visual only)
  const [landingPage, setLandingPage] = useState('Dashboard');
  const [timezone, setTimezone] = useState('UTC-7');
  const [dateFormat, setDateFormat] = useState('MM / DD / YYYY');
  const [numberFormat, setNumberFormat] = useState('Compact (K, M)');
  
  // Analytics context state
  const [geoLevel, setGeoLevel] = useState('Market');
  const [timeRange, setTimeRange] = useState('Last 30 days');
  const [deviceGroup, setDeviceGroup] = useState('All devices');
  
  // Notification preferences
  const [notifyMetrics, setNotifyMetrics] = useState(true);
  const [notifyReports, setNotifyReports] = useState(true);
  const [notifyMigration, setNotifyMigration] = useState(false);

  return (
    <Layout>
      {/* SECTION 0: PAGE HEADER */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Settings
          </h1>
          <p className="text-[13px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Preferences and access context for Report Hub.
          </p>
        </div>
        <div className="text-[11px] text-[#6B7280] bg-blue-50 px-3 py-1.5 rounded-md" style={{ fontFamily: 'Inter, sans-serif' }}>
          System · Conceptual
        </div>
      </div>

      {/* SECTION 1: USER PROFILE */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-700" />
          </div>
          <h2 className="text-[18px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Your Profile
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Name
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Alex Morgan
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Role
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Operations Manager
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Department
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Sales & Operations
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Primary Market
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                C580
              </p>
            </div>
          </div>

          <div className="col-span-2">
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Access Level
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Standard User
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Access levels are managed centrally.
          </p>
        </div>
      </div>

      {/* SECTION 2: EXPERIENCE PREFERENCES */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <h2 className="text-[18px] font-semibold text-[#111827] mb-5" style={{ fontFamily: 'Inter, sans-serif' }}>
          Experience Preferences
        </h2>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Default landing page
            </label>
            <div className="relative">
              <select 
                value={landingPage}
                onChange={(e) => setLandingPage(e.target.value)}
                className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <option>Dashboard</option>
                <option>Conversational Analytics</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Timezone
              </label>
              <div className="relative">
                <select 
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option>UTC-7</option>
                  <option>UTC-5</option>
                  <option>UTC-0</option>
                  <option>UTC+1</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-[#6B7280] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                Auto-detected
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Date format
              </label>
              <div className="relative">
                <select 
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option>MM / DD / YYYY</option>
                  <option>DD / MM / YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Number format
              </label>
              <div className="relative">
                <select 
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value)}
                  className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option>Compact (K, M)</option>
                  <option>Full numbers</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Preferences apply across Report Hub experiences.
          </p>
        </div>
      </div>

      {/* SECTION 3: ANALYTICS CONTEXT */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <Globe className="w-5 h-5 text-gray-400" />
          <h2 className="text-[18px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Analytics Context
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Default Geography Level
            </label>
            <div className="relative">
              <select 
                value={geoLevel}
                onChange={(e) => setGeoLevel(e.target.value)}
                className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <option>Market</option>
                <option>Territory</option>
                <option>Outlet</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Default Time Range
            </label>
            <div className="relative">
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
                <option>Current month</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#111827] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Default Device Group
            </label>
            <div className="relative">
              <select 
                value={deviceGroup}
                onChange={(e) => setDeviceGroup(e.target.value)}
                className="w-full h-[40px] pl-3 pr-9 bg-white border border-[#E5E7EB] rounded-lg text-[13px] appearance-none cursor-pointer hover:border-[#6B7280] transition-colors"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <option>All devices</option>
                <option>Phone</option>
                <option>Tablet</option>
                <option>Wearable</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            These defaults help personalize insights without changing data.
          </p>
        </div>
      </div>

      {/* SECTION 4: NOTIFICATIONS */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <Bell className="w-5 h-5 text-gray-400" />
          <h2 className="text-[18px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Notifications
          </h2>
        </div>

        <div className="space-y-4 mb-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={notifyMetrics}
                onChange={(e) => setNotifyMetrics(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-[#E5E7EB] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-[#111827] font-medium group-hover:text-[#6B7280] transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                Notify me when key metrics fall below thresholds
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                Receive alerts for significant performance changes
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={notifyReports}
                onChange={(e) => setNotifyReports(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-[#E5E7EB] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-[#111827] font-medium group-hover:text-[#6B7280] transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                Notify me when new reports are available
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                Stay updated on newly published analytics
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={notifyMigration}
                onChange={(e) => setNotifyMigration(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-[#E5E7EB] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-[#111827] font-medium group-hover:text-[#6B7280] transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                Notify me when a migration request completes
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                Get updates on platform transitions
              </p>
            </div>
          </label>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Notifications are informational and non-intrusive.
          </p>
        </div>
      </div>

      {/* SECTION 5: SYSTEM INFORMATION */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <Info className="w-5 h-5 text-gray-400" />
          <h2 className="text-[18px] font-semibold text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
            System Information
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Environment
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Demo
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Data Source
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Report Hub Dummy Data Model
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Last Global Refresh
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                {formatRelativeTime(lastRefresh)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Version
            </label>
            <div className="h-[40px] px-3 bg-gray-50 border border-[#E5E7EB] rounded-lg flex items-center">
              <p className="text-[13px] text-[#111827]" style={{ fontFamily: 'Inter, sans-serif' }}>
                v0.1 (Conceptual)
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#F8F9FB] rounded-lg p-3 border border-[#E5E7EB]">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Report Hub abstracts underlying BI platforms.
          </p>
        </div>
      </div>

      {/* SECTION 6: NAVIGATION & EXIT */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#6B7280]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Settings are conceptual and for demonstration purposes only.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-white hover:bg-gray-50 text-[#111827] border border-[#E5E7EB] rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate('/conversational')}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#0F172A] text-white rounded-lg text-[13px] font-medium transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Open Conversational Analytics
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
