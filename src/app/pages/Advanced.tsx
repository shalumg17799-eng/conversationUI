import { Link } from 'react-router';
import { Layout } from '../components/ui/Layout';
import { PlaceholderContent } from '../components/ui/PlaceholderContent';

export function AdvancedPage() {
  return (
    <Layout>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Advanced Capabilities</h1>
          <Link to="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Back to Dashboard
          </Link>
        </div>
        <p className="text-muted-foreground">Governance, cost visibility, and lifecycle management (conceptual).</p>
      </div>

      <PlaceholderContent 
        features={[
          "Usage visibility",
          "Report migration",
          "Cost accountability",
          "Archiving unused reports"
        ]}
        plannedModules={[
          "Admin Panel",
          "Audit Logs",
          "Policy Manager",
          "Lifecycle Rules"
        ]}
      />
    </Layout>
  );
}