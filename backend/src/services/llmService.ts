import Anthropic from '@anthropic-ai/sdk';
import { IntentResult, ShapeSignature, UITypeTree } from '../types';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export const generateUITypeTree = async (
  query: string,
  intent: IntentResult,
  shape: ShapeSignature,
  allowedComponents: string[]
): Promise<UITypeTree> => {
  console.log('Layer 3 - LLM selecting components');

  const prompt = `
You are a UI decision engine for a business intelligence system.
Based on the user's intent and the shape of the data retrieved, select the BEST UI component.

USER QUERY: "${query}"
INTENT: ${JSON.stringify(intent, null, 2)}
DATA SHAPE: ${JSON.stringify(shape, null, 2)}
AVAILABLE COMPONENTS: ${JSON.stringify(allowedComponents)}

RULES:
1. Use "BarChart" for categorical comparisons.
2. Use "LineChart" for time series data.
3. Use "KPI" for single metric values.
4. Use "Table" for large datasets or multi-column categorical data.

RETURN ONLY VALID JSON. NO TEXT, NO EXPLANATIONS.

EXPECTED FORMAT:
{
  "renderType": "ComponentName"
}
  `;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected non-text response from LLM');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : content.text;
    
    const output = JSON.parse(jsonString);
    
    return {
      renderType: output.renderType,
      props: {}, // Props will be mapped in the next layer
      children: []
    };

  } catch (error) {
    console.error('LLM Layer Error:', error);
    // Fallback to Table
    return {
      renderType: 'Table',
      props: {},
      children: []
    };
  }
};
