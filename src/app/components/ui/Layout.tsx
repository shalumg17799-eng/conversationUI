import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Database,
  Layers,
  Shield,
  ArrowLeftRight,
  Settings,
  Search,
  Bell,
  User,
  ChevronDown,
} from 'lucide-react';
import { cn } from "../../../lib/utils";
import { usePersona, personas, PersonaType } from '../../context/PersonaContext';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { persona, personaType, setPersonaType, isMarketingDirector } = usePersona();
  const [personaDropdownOpen, setPersonaDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setPersonaDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allNavItems = [
    {
      label: 'Talk',
      path: '/conversational',
      icon: MessageSquare
    },
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard
    },
    {
      label: 'Reports',
      path: '/reports',
      icon: FileText
    },
    {
      label: 'Datasets',
      path: '/datasets',
      icon: Database
    },
    {
      label: 'Platforms',
      path: '/enterprise-bi',
      icon: Layers
    },
    {
      label: 'Governance',
      path: '/governance',
      icon: Shield
    },
    {
      label: 'Migration',
      path: '/migration',
      icon: ArrowLeftRight
    },
  ];

  const navItems = isMarketingDirector
    ? allNavItems.filter((item) => item.label !== 'Migration')
    : allNavItems;

  const bottomNavItems = [
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings
    },
  ];

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#1C1917] page-atmosphere" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header — frosted glass */}
      <header
        className="fixed top-0 left-0 right-0 h-[52px] border-b border-[#ECEAE6] z-50 flex items-center justify-between px-6"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {/* Left: Product mark */}
        <div className="flex items-center gap-3 w-[200px]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[9px] bg-[#1A1917] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-[#111110]">
              Report Hub
            </span>
          </div>
          <div className="text-[10px] font-medium text-[#5C5A57] bg-[#F0EDE8] border border-[#E5E3DF] px-2 py-0.5 rounded">
            Demo
          </div>
        </div>

        {/* Center: Global Search — pill shape */}
        <div className="flex-1 max-w-2xl px-6">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8785]" />
            <input
              type="text"
              placeholder="Search insights, reports, datasets…"
              className="w-full h-[38px] pl-10 pr-4 bg-[#F4F2EF] border border-[#E5E3DF] rounded-[20px] text-[13px] focus:outline-none focus:border-[#D4572A] transition-all placeholder:text-[#8A8785] text-[#111110]"
            />
          </div>
        </div>

        {/* Right: Persona Switcher + Notification + User */}
        <div className="flex items-center gap-2.5 text-[#6B6965]">
          {/* Persona Switcher — pill shape with avatar */}
          <div className="relative" ref={dropdownRef}>
            {persona ? (
              <button
                onClick={() => setPersonaDropdownOpen(!personaDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#F4F2EF] border border-[#E5E3DF] rounded-[20px] hover:bg-[#EDEAE5] transition-colors"
              >
                <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #185FA5, #534AB7)' }}>
                  <span className="text-[9px] font-semibold text-white leading-none">MD</span>
                </div>
                <span className="text-[12px] font-medium text-[#2C2B29]">{persona.label}</span>
                <ChevronDown className="w-3 h-3 text-[#8A8785]" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/persona')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F4F2EF] border border-[#E5E3DF] rounded-[20px] hover:bg-[#EDEAE5] transition-colors"
              >
                <span className="text-[12px] font-medium text-[#5C5A57]">Select persona</span>
                <ChevronDown className="w-3 h-3 text-[#8A8785]" />
              </button>
            )}
            {personaDropdownOpen && persona && (
              <div className="absolute right-0 top-full mt-1.5 w-[220px] bg-white rounded-[10px] border border-[#ECEAE6] z-50 py-1.5 overflow-hidden">
                {(['marketing_director', 'power_user'] as PersonaType[]).map((type) => {
                  const p = personas[type];
                  const isActive = personaType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setPersonaType(type);
                        setPersonaDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                        isActive ? "bg-[#FEF3EE]" : "hover:bg-[#F4F2EF]"
                      )}
                    >
                      <span className="text-[16px]">{p.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-[13px] font-medium",
                          isActive ? "text-[#D4572A]" : "text-[#111110]"
                        )}>{p.label}</div>
                        <div className="text-[11px] text-[#8A8785] truncate">{p.description}</div>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#D4572A] flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
                <div className="border-t border-[#ECEAE6] mt-1 pt-1">
                  <button
                    onClick={() => { setPersonaDropdownOpen(false); navigate('/persona'); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-[#F4F2EF] transition-colors"
                  >
                    <span className="text-[12px] text-[#8A8785]">Switch persona…</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Bell — circle */}
          <button className="w-9 h-9 flex items-center justify-center bg-[#F5F2EE] rounded-full hover:bg-[#EDEAE5] transition-colors relative">
            <Bell className="w-[18px] h-[18px] text-[#6B6965]" />
            <span className="absolute top-1 right-1 w-[7px] h-[7px] bg-[#D4572A] rounded-full" style={{ border: '1.5px solid #F7F6F3' }}></span>
          </button>
          {/* Avatar — circle */}
          <button className="w-9 h-9 flex items-center justify-center bg-[#EDEAE5] rounded-full hover:bg-[#E5E2DC] transition-colors">
            <User className="w-4 h-4 text-[#6B6965]" />
          </button>
        </div>
      </header>

      {/* Left Navigation — icon-only rail */}
      <aside className="fixed top-[52px] left-0 bottom-0 w-[64px] bg-white border-r border-[#ECEAE6] z-40 flex flex-col">
        {/* Primary Navigation */}
        <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
                             location.pathname.startsWith(item.path + '/') ||
                             (item.path === '/conversational' && location.pathname.startsWith('/talk/'));
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full py-2.5 rounded-[10px] transition-all duration-150 group",
                  isActive
                    ? "bg-[#FEF0EC]"
                    : "hover:bg-[#F5F2EE]"
                )}
                title={item.label}
              >
                <Icon className={cn("w-[20px] h-[20px]", isActive ? "text-[#D4572A]" : "text-[#B0ADA7] group-hover:text-[#6B6965]")} />
                <span className={cn(
                  "text-[9px] text-center leading-tight",
                  isActive ? "font-medium text-[#D4572A]" : "text-[#B0ADA7] group-hover:text-[#6B6965]"
                )}>
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation (Settings) */}
        <nav className="flex-shrink-0 pt-2 pb-3 px-1.5 border-t border-[#ECEAE6]">
          {bottomNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full py-2.5 rounded-[10px] transition-all duration-150 group",
                  isActive
                    ? "bg-[#FEF0EC]"
                    : "hover:bg-[#F5F2EE]"
                )}
                title={item.label}
              >
                <Icon className={cn("w-[20px] h-[20px]", isActive ? "text-[#D4572A]" : "text-[#B0ADA7] group-hover:text-[#6B6965]")} />
                <span className={cn(
                  "text-[9px] text-center leading-tight",
                  isActive ? "font-medium text-[#D4572A]" : "text-[#B0ADA7] group-hover:text-[#6B6965]"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-[64px] pt-[52px] min-h-screen relative z-[1]">
        <div className="p-8 max-w-[1400px] mx-auto space-y-8">
           {children}
        </div>
      </main>
    </div>
  );
}
