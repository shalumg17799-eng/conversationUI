// Page wrapper for BigQuery Complete Dashboard
import React from 'react';
import { Layout } from '../components/ui/Layout';
import BigQueryCompleteDashboard from '../../components/BigQueryCompleteDashboard';

const BigQueryCompleteDashboardPage: React.FC = () => {
  return (
    <Layout>
      <BigQueryCompleteDashboard />
    </Layout>
  );
};

export default BigQueryCompleteDashboardPage;
