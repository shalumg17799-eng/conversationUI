export const executeQuery = async (intent: any): Promise<any[]> => {
  // Layer 1: Retrieval part
  console.log('Executing query based on intent');
  return [
    { region: 'North', performance: 85 },
    { region: 'South', performance: 70 },
    { region: 'East', performance: 92 },
    { region: 'West', performance: 78 }
  ];
};
