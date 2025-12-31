import { HarnessExportInput, HarnessSpec, HarnessFeature, TechStack, NormalizedIdea } from '../types';
import { generateHarnessTemplate, LLM_EXPANSION_PROMPT } from '../templates/harness-spec-template';

export type HarnessProviderType = 'gemini' | 'openai' | 'groq';

// Timeout wrapper for fetch with AbortController
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 30000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out (30s limit)');
    }
    throw err;
  }
};

// Convert NormalizedIdea to HarnessExportInput
export const ideaToExportInput = (
  idea: NormalizedIdea,
  techStack: TechStack,
  mainFeatures: string[],
  projectType: HarnessExportInput['projectType']
): HarnessExportInput => {
  return {
    projectName: idea.project_name,
    problemStatement: idea.problem_statement,
    targetAudience: idea.target_user,
    solution: idea.solution_summary,
    constraints: idea.constraints,
    differentiation: idea.differentiation,
    risks: idea.risks,
    nextSteps: idea.next_action,
    techStack,
    mainFeatures,
    projectType
  };
};

// Parse LLM response to extract features
const parseFeaturesFromLLM = (response: string): HarnessFeature[] => {
  try {
    // Try to find JSON array in response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const features = JSON.parse(jsonMatch[0]);
      return features.map((f: any) => ({
        id: f.id || 'UNKNOWN',
        title: f.title || 'Untitled',
        category: f.category || 'config',
        complexity: f.complexity || 'medium',
        dependsOn: f.dependsOn || [],
        acceptanceCriteria: f.acceptanceCriteria || []
      }));
    }
  } catch (e) {
    console.error('[harnessExportService] Failed to parse LLM response:', e);
  }
  return [];
};

// Calculate stats from features
const calculateStats = (features: HarnessFeature[]): HarnessSpec['stats'] => {
  const byCategory: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};

  features.forEach(f => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byComplexity[f.complexity] = (byComplexity[f.complexity] || 0) + 1;
  });

  // Estimate turns based on complexity
  const turnsPerComplexity = { simple: 7, medium: 15, complex: 35 };
  const estimatedTurns = features.reduce((sum, f) => {
    return sum + (turnsPerComplexity[f.complexity] || 15);
  }, 0);

  // Rough cost estimate ($0.015 per turn average)
  const estimatedCostNum = estimatedTurns * 0.015;
  const estimatedCost = `$${estimatedCostNum.toFixed(0)}-${(estimatedCostNum * 1.5).toFixed(0)}`;

  return {
    totalFeatures: features.length,
    byCategory,
    byComplexity,
    estimatedTurns,
    estimatedCost
  };
};

// Generate features section for markdown
const generateFeaturesMarkdown = (features: HarnessFeature[]): string => {
  // Group features by phase/category
  const phases: Record<string, HarnessFeature[]> = {
    'Phase 1: Foundation': features.filter(f => f.category === 'config'),
    'Phase 2: Database': features.filter(f => f.category === 'database'),
    'Phase 3: Backend Services': features.filter(f => f.category === 'service'),
    'Phase 4: Security': features.filter(f => f.category === 'security'),
    'Phase 5: API Endpoints': features.filter(f => f.category === 'api'),
    'Phase 6: Frontend': features.filter(f => f.category === 'ui'),
    'Phase 7: Integration': features.filter(f => f.category === 'integration'),
    'Phase 8: Testing': features.filter(f => f.category === 'test'),
    'Phase 9: DevOps': features.filter(f => ['worker', 'infrastructure'].includes(f.category))
  };

  let markdown = '';

  Object.entries(phases).forEach(([phaseName, phaseFeatures]) => {
    if (phaseFeatures.length === 0) return;

    markdown += `\n---\n\n## ${phaseName}\n\n`;

    phaseFeatures.forEach(f => {
      markdown += `### ${f.id}: ${f.title}\n`;
      markdown += `**Kategorie:** ${f.category} | **Komplexität:** ${f.complexity}\n`;
      if (f.dependsOn.length > 0) {
        markdown += `**Abhängig von:** ${f.dependsOn.join(', ')}\n`;
      }
      markdown += '\n';
      f.acceptanceCriteria.forEach(ac => {
        markdown += `- [ ] ${ac}\n`;
      });
      markdown += '\n';
    });
  });

  return markdown;
};

export const harnessExportService = {
  // Generate full harness spec with LLM expansion
  async generateSpec(input: HarnessExportInput): Promise<HarnessSpec> {
    console.log('[harnessExportService] generateSpec called...');

    try {
      // Build the prompt with actual data
      const prompt = LLM_EXPANSION_PROMPT
        .replace('{projectName}', input.projectName)
        .replace('{problemStatement}', input.problemStatement)
        .replace('{targetAudience}', input.targetAudience)
        .replace('{solution}', input.solution)
        .replace('{techStack}', JSON.stringify(input.techStack, null, 2))
        .replace('{mainFeatures}', input.mainFeatures.join('\n- '))
        .replace('{constraints}', input.constraints)
        .replace('{differentiation}', input.differentiation)
        .replace('{risks}', input.risks);

      // Call LLM API for feature expansion
      const response = await fetchWithTimeout('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'harnessExpand',
          prompt,
          projectName: input.projectName
        })
      }, 60000); // 60 second timeout for complex generation

      if (!response.ok) {
        const errRes = await response.json().catch(() => ({}));
        throw new Error(errRes.error || 'Harness spec generation failed');
      }

      const result = await response.json();
      const features = parseFeaturesFromLLM(result.content || result.text || '');

      if (features.length === 0) {
        console.warn('[harnessExportService] No features parsed, using fallback template');
        // Return basic template without expanded features
        const basicMarkdown = generateHarnessTemplate(input);
        return {
          markdown: basicMarkdown,
          features: [],
          stats: {
            totalFeatures: 0,
            byCategory: {},
            byComplexity: {},
            estimatedTurns: 0,
            estimatedCost: '$0'
          }
        };
      }

      // Generate full markdown with expanded features
      const baseTemplate = generateHarnessTemplate(input);
      const featuresMarkdown = generateFeaturesMarkdown(features);

      // Replace the placeholder features section with expanded features
      const fullMarkdown = baseTemplate.replace(
        /## Phase 1: Foundation[\s\S]*## Globale Akzeptanzkriterien/,
        featuresMarkdown + '\n---\n\n## Globale Akzeptanzkriterien'
      );

      const stats = calculateStats(features);

      console.log(`[harnessExportService] Generated ${features.length} features`);
      return {
        markdown: fullMarkdown,
        features,
        stats
      };

    } catch (err: any) {
      console.error('[harnessExportService] generateSpec FAILED:', err.message);
      throw err;
    }
  },

  // Quick generation without LLM (uses template only)
  generateBasicSpec(input: HarnessExportInput): HarnessSpec {
    console.log('[harnessExportService] generateBasicSpec called...');

    const markdown = generateHarnessTemplate(input);

    // Count basic features from template
    const featureMatches = markdown.match(/### [A-Z]+-\d+:/g) || [];

    return {
      markdown,
      features: [],
      stats: {
        totalFeatures: featureMatches.length,
        byCategory: { config: 3, database: 3, service: 3, security: 3, api: 3, ui: 5, test: 4 },
        byComplexity: { simple: 8, medium: 15, complex: 4 },
        estimatedTurns: 400,
        estimatedCost: '$5-8'
      }
    };
  },

  // Download markdown as file
  downloadSpec(spec: HarnessSpec, projectName: string): void {
    const filename = `${projectName.toLowerCase().replace(/\s+/g, '-')}-harness-spec.md`;
    const blob = new Blob([spec.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[harnessExportService] Downloaded ${filename}`);
  },

  // Copy to clipboard
  async copyToClipboard(spec: HarnessSpec): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(spec.markdown);
      console.log('[harnessExportService] Copied to clipboard');
      return true;
    } catch (err) {
      console.error('[harnessExportService] Clipboard copy failed:', err);
      return false;
    }
  }
};
