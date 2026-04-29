import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { runPipeline } from './pipeline/runPipeline';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Simple CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Generative UI Analytical Engine is running' });
});

app.post('/api/conversational', async (req: Request, res: Response) => {
  const { query } = req.body;

  console.log('--- NEW REQUEST ---');
  console.log(`Query: "${query}"`);

  if (!query) {
    return res.status(400).json({ success: false, error: 'Query is required' });
  }

  try {
    const result = await runPipeline(query);
    
    console.log(`Pipeline finished in ${result.durationMs}ms. Short-circuited: ${result.wasShortCircuited}`);

    res.json({
      success: true,
      uiTree: result.uiTree
    });

  } catch (error: any) {
    console.error('CRITICAL PIPELINE ERROR:', error);
    
    const fallbackTree = {
      renderType: 'Table',
      props: { title: 'System Error Fallback' },
      children: []
    };

    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error',
      uiTree: fallbackTree
    });
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
